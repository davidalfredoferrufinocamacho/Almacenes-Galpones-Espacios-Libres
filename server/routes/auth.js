const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');
const { db } = require('../config/database');
const { generateId, getClientInfo } = require('../utils/helpers');
const { logAudit } = require('../middleware/audit');
const { JWT_SECRET } = require('../middleware/auth');

const router = express.Router();

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

    const { email, password, role, person_type, first_name, last_name, company_name, ci, ci_extension, nit, phone, address, city, department } = req.body;

    const existingUser = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
    if (existingUser) {
      return res.status(400).json({ error: 'El correo electronico ya esta registrado' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const userId = generateId();

    const stmt = db.prepare(`
      INSERT INTO users (id, email, password, role, person_type, first_name, last_name, company_name, ci, ci_extension, nit, phone, address, city, department)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(userId, email, hashedPassword, role, person_type, first_name, last_name, company_name, ci, ci_extension, nit, phone, address, city, department);

    logAudit(userId, 'USER_REGISTERED', 'users', userId, null, { email, role, person_type }, req);

    const token = jwt.sign({ id: userId, email, role }, JWT_SECRET, { expiresIn: '7d' });

    res.status(201).json({
      message: 'Usuario registrado exitosamente',
      token,
      user: { id: userId, email, role, person_type, first_name, last_name }
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
        company_name: user.company_name
      }
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

      const stmt = db.prepare(`
        UPDATE users 
        SET anti_bypass_accepted = 1, 
            anti_bypass_accepted_at = ?,
            anti_bypass_ip = ?,
            anti_bypass_user_agent = ?,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `);

      stmt.run(clientInfo.timestamp, clientInfo.ip, clientInfo.userAgent, req.user.id);

      logAudit(req.user.id, 'ANTI_BYPASS_ACCEPTED', 'users', req.user.id, null, clientInfo, req);

      res.json({ message: 'Clausula anti-bypass aceptada' });
    });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Error al procesar solicitud' });
  }
});

module.exports = router;
