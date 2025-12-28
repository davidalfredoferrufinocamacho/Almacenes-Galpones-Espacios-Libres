const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { body, validationResult } = require('express-validator');
const { db } = require('../config/database');
const { generateId, getClientInfo } = require('../utils/helpers');
const { logAudit } = require('../middleware/audit');
const { JWT_SECRET } = require('../middleware/auth');
const { sendVerificationEmail } = require('../utils/gmailService');

const router = express.Router();

const AUTH_DISCLAIMER = {
  password_recovery: 'PENDIENTE - La recuperacion de contraseña NO esta implementada.',
  security_status: 'INCOMPLETO - Este sistema de autenticacion es un MVP y NO debe considerarse seguro para produccion.'
};

function generateVerificationToken() {
  return crypto.randomBytes(32).toString('hex');
}

function getVerificationUrl(token) {
  const domain = process.env.REPLIT_DEV_DOMAIN || process.env.REPLIT_DOMAINS || 'localhost:5000';
  const protocol = domain.includes('localhost') ? 'http' : 'https';
  return `${protocol}://${domain}/verificar-email/${token}`;
}

router.post('/register', [
  body('email').isEmail().normalizeEmail(),
  body('password').isLength({ min: 8 }),
  body('role').isIn(['GUEST', 'HOST']),
  body('person_type').isIn(['natural', 'juridica']),
  body('first_name').optional().trim().notEmpty(),
  body('last_name').optional().trim().notEmpty(),
  body('company_name').optional().trim(),
  body('ci').optional().trim(),
  body('nit').optional().trim()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { email, password, role, person_type, first_name, last_name, company_name, ci, ci_extension, nit, phone, address, city, department, anti_bypass_accepted } = req.body;

    // GUEST users MUST accept anti-bypass clause at registration (server-side enforcement)
    if (role === 'GUEST' && !anti_bypass_accepted) {
      return res.status(400).json({ error: 'Debe aceptar los Terminos y la Clausula Anti-Bypass para registrarse' });
    }

    const existingUser = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
    if (existingUser) {
      return res.status(400).json({ error: 'El correo electronico ya esta registrado' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const userId = generateId();
    const antiBypassAccepted = anti_bypass_accepted ? 1 : 0;
    const antiBypassAcceptedAt = anti_bypass_accepted ? new Date().toISOString() : null;
    
    const verificationToken = generateVerificationToken();
    const verificationExpires = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

    const stmt = db.prepare(`
      INSERT INTO users (id, email, password, role, person_type, first_name, last_name, company_name, ci, ci_extension, nit, phone, address, city, department, anti_bypass_accepted, anti_bypass_accepted_at, email_verification_token, email_verification_expires)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(userId, email, hashedPassword, role, person_type, first_name, last_name, company_name, ci, ci_extension, nit, phone, address, city, department, antiBypassAccepted, antiBypassAcceptedAt, verificationToken, verificationExpires);

    logAudit(userId, 'USER_REGISTERED', 'users', userId, null, { email, role, person_type }, req);

    const recipientName = first_name || company_name || 'Usuario';
    const verificationUrl = getVerificationUrl(verificationToken);
    
    sendVerificationEmail({
      recipientEmail: email,
      recipientName,
      verificationToken,
      verificationUrl
    }).then(result => {
      if (result.success) {
        console.log(`[VERIFICATION] Email sent to ${email}`);
        logAudit(userId, 'VERIFICATION_EMAIL_SENT', 'users', userId, null, { email }, req);
      } else {
        console.error(`[VERIFICATION] Failed to send email to ${email}:`, result.error);
      }
    }).catch(err => {
      console.error(`[VERIFICATION] Error sending email to ${email}:`, err.message);
    });

    const token = jwt.sign({ id: userId, email, role }, JWT_SECRET, { expiresIn: '7d' });

    res.status(201).json({
      message: 'Usuario registrado exitosamente. Te hemos enviado un correo para verificar tu cuenta.',
      token,
      user: { id: userId, email, role, person_type, first_name, last_name, email_verified: false },
      verification_email_sent: true,
      security_disclaimer: AUTH_DISCLAIMER
    });
  } catch (error) {
    console.error('Error en registro:', error);
    res.status(500).json({ error: 'Error al registrar usuario' });
  }
});

router.post('/login', [
  body('email').isEmail().normalizeEmail(),
  body('password').notEmpty()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { email, password } = req.body;

    const user = db.prepare('SELECT * FROM users WHERE email = ? AND is_active = 1').get(email);
    if (!user) {
      return res.status(401).json({ error: 'Credenciales invalidas' });
    }

    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) {
      return res.status(401).json({ error: 'Credenciales invalidas' });
    }

    logAudit(user.id, 'USER_LOGIN', 'users', user.id, null, null, req);

    const token = jwt.sign({ id: user.id, email: user.email, role: user.role }, JWT_SECRET, { expiresIn: '7d' });

    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        person_type: user.person_type,
        first_name: user.first_name,
        last_name: user.last_name,
        company_name: user.company_name,
        email_verified: user.is_verified === 1
      },
      security_disclaimer: AUTH_DISCLAIMER
    });
  } catch (error) {
    console.error('Error en login:', error);
    res.status(500).json({ error: 'Error al iniciar sesion' });
  }
});

router.post('/accept-anti-bypass', [
  body('accepted').isBoolean().equals('true')
], async (req, res) => {
  try {
    const { authenticateToken } = require('../middleware/auth');
    authenticateToken(req, res, () => {
      const clientInfo = getClientInfo(req);
      const legalVersion = 'ANTIBYPASS_HOST_V1';

      const stmt = db.prepare(`
        UPDATE users 
        SET anti_bypass_accepted = 1, 
            anti_bypass_accepted_at = ?,
            anti_bypass_ip = ?,
            anti_bypass_user_agent = ?,
            anti_bypass_legal_version = ?,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `);

      stmt.run(clientInfo.timestamp, clientInfo.ip, clientInfo.userAgent, legalVersion, req.user.id);

      logAudit(req.user.id, 'ANTI_BYPASS_ACCEPTED', 'users', req.user.id, null, {
        legal_text_version: legalVersion,
        ...clientInfo
      }, req);

      res.json({ message: 'Clausula anti-bypass aceptada' });
    });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Error al procesar solicitud' });
  }
});

router.get('/verify-email/:token', async (req, res) => {
  try {
    const { token } = req.params;
    
    if (!token || token.length !== 64) {
      return res.status(400).json({ error: 'Token de verificacion invalido' });
    }

    const user = db.prepare(`
      SELECT id, email, first_name, company_name, is_verified, email_verification_expires 
      FROM users 
      WHERE email_verification_token = ?
    `).get(token);

    if (!user) {
      return res.status(400).json({ error: 'Token de verificacion no encontrado o ya utilizado' });
    }

    if (user.is_verified === 1) {
      return res.json({ message: 'Tu cuenta ya esta verificada', already_verified: true });
    }

    if (new Date(user.email_verification_expires) < new Date()) {
      return res.status(400).json({ error: 'El enlace de verificacion ha expirado. Solicita un nuevo correo de verificacion.' });
    }

    db.prepare(`
      UPDATE users 
      SET is_verified = 1, 
          email_verified_at = ?,
          email_verification_token = NULL,
          email_verification_expires = NULL,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(new Date().toISOString(), user.id);

    logAudit(user.id, 'EMAIL_VERIFIED', 'users', user.id, null, { email: user.email }, req);

    res.json({ 
      message: 'Tu cuenta ha sido verificada exitosamente',
      verified: true,
      email: user.email
    });
  } catch (error) {
    console.error('Error verificando email:', error);
    res.status(500).json({ error: 'Error al verificar cuenta' });
  }
});

router.post('/resend-verification', async (req, res) => {
  try {
    const { authenticateToken } = require('../middleware/auth');
    authenticateToken(req, res, async () => {
      const user = db.prepare(`
        SELECT id, email, first_name, company_name, is_verified 
        FROM users WHERE id = ?
      `).get(req.user.id);

      if (!user) {
        return res.status(404).json({ error: 'Usuario no encontrado' });
      }

      if (user.is_verified === 1) {
        return res.status(400).json({ error: 'Tu cuenta ya esta verificada' });
      }

      const newToken = generateVerificationToken();
      const newExpires = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

      db.prepare(`
        UPDATE users 
        SET email_verification_token = ?,
            email_verification_expires = ?,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(newToken, newExpires, user.id);

      const recipientName = user.first_name || user.company_name || 'Usuario';
      const verificationUrl = getVerificationUrl(newToken);

      const result = await sendVerificationEmail({
        recipientEmail: user.email,
        recipientName,
        verificationToken: newToken,
        verificationUrl
      });

      if (result.success) {
        logAudit(user.id, 'VERIFICATION_EMAIL_RESENT', 'users', user.id, null, { email: user.email }, req);
        res.json({ message: 'Correo de verificacion enviado exitosamente' });
      } else {
        res.status(500).json({ error: 'Error al enviar correo de verificacion' });
      }
    });
  } catch (error) {
    console.error('Error reenviando verificacion:', error);
    res.status(500).json({ error: 'Error al reenviar verificacion' });
  }
});

module.exports = router;
