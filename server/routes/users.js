const express = require('express');
const { body, validationResult } = require('express-validator');
const { db } = require('../config/database');
const { authenticateToken, requireRole } = require('../middleware/auth');
const { logAudit } = require('../middleware/audit');
const { getClientInfo } = require('../utils/helpers');

const router = express.Router();

router.get('/me', authenticateToken, (req, res) => {
  try {
    const user = db.prepare(`
      SELECT id, email, role, person_type, first_name, last_name, company_name, 
             ci, ci_extension, nit, phone, address, city, department, 
             is_verified, anti_bypass_accepted, created_at
      FROM users WHERE id = ?
    `).get(req.user.id);

    res.json(user);
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Error al obtener perfil' });
  }
});

router.put('/me', authenticateToken, [
  body('first_name').optional().trim(),
  body('last_name').optional().trim(),
  body('company_name').optional().trim(),
  body('phone').optional().trim(),
  body('address').optional().trim(),
  body('city').optional().trim(),
  body('department').optional().trim()
], (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { first_name, last_name, company_name, phone, address, city, department } = req.body;

    const oldData = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);

    const stmt = db.prepare(`
      UPDATE users 
      SET first_name = COALESCE(?, first_name),
          last_name = COALESCE(?, last_name),
          company_name = COALESCE(?, company_name),
          phone = COALESCE(?, phone),
          address = COALESCE(?, address),
          city = COALESCE(?, city),
          department = COALESCE(?, department),
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `);

    stmt.run(first_name, last_name, company_name, phone, address, city, department, req.user.id);

    logAudit(req.user.id, 'USER_UPDATED', 'users', req.user.id, oldData, req.body, req);

    res.json({ message: 'Perfil actualizado' });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Error al actualizar perfil' });
  }
});

router.put('/me/identity', authenticateToken, [
  body('ci').notEmpty().trim(),
  body('ci_extension').optional().trim(),
  body('nit').optional().trim()
], (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { ci, ci_extension, nit } = req.body;

    if (req.user.person_type === 'juridica' && !nit) {
      return res.status(400).json({ error: 'NIT es obligatorio para personas juridicas' });
    }

    const stmt = db.prepare(`
      UPDATE users 
      SET ci = ?, ci_extension = ?, nit = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `);

    stmt.run(ci, ci_extension, nit, req.user.id);

    logAudit(req.user.id, 'IDENTITY_UPDATED', 'users', req.user.id, null, { ci, nit }, req);

    res.json({ message: 'Identificacion actualizada' });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Error al actualizar identificacion' });
  }
});

router.put('/me/accept-anti-bypass', authenticateToken, (req, res) => {
  try {
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);

    if (user.anti_bypass_accepted) {
      return res.status(400).json({ error: 'Ya has aceptado la clausula anti-bypass' });
    }

    const legalType = user.role === 'HOST' ? 'anti_bypass_host' : 'anti_bypass_guest';
    const legalText = db.prepare(`
      SELECT id, type, title, content, version FROM legal_texts 
      WHERE type = ? AND is_active = 1
    `).get(legalType);

    if (!legalText) {
      return res.status(500).json({ error: 'Texto legal anti-bypass no configurado' });
    }

    const clientInfo = getClientInfo(req);
    const acceptedAt = new Date().toISOString();

    db.prepare(`
      UPDATE users SET 
        anti_bypass_accepted = 1,
        anti_bypass_accepted_at = ?,
        anti_bypass_legal_text_id = ?,
        anti_bypass_legal_version = ?,
        anti_bypass_ip = ?,
        anti_bypass_user_agent = ?
      WHERE id = ?
    `).run(acceptedAt, legalText.id, legalText.version, clientInfo.ip, clientInfo.userAgent, req.user.id);

    const auditAction = user.role === 'HOST' ? 'ANTI_BYPASS_HOST_ACCEPTED' : 'ANTI_BYPASS_GUEST_ACCEPTED';
    const auditData = {
      role: user.role,
      anti_bypass_accepted: 1,
      legal_text_id: legalText.id,
      legal_text_version: legalText.version,
      accepted_at: acceptedAt,
      ip: clientInfo.ip,
      user_agent: clientInfo.userAgent
    };

    logAudit(req.user.id, auditAction, 'users', req.user.id, 
      { anti_bypass_accepted: 0 },
      auditData,
      req
    );

    res.json({ 
      message: 'Clausula anti-bypass aceptada exitosamente',
      anti_bypass_accepted: 1,
      anti_bypass_accepted_at: acceptedAt,
      anti_bypass_legal_text_id: legalText.id,
      anti_bypass_legal_version: legalText.version,
      anti_bypass_ip: clientInfo.ip,
      anti_bypass_user_agent: clientInfo.userAgent
    });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Error al aceptar clausula' });
  }
});

router.put('/me/role', authenticateToken, [
  body('role').isIn(['GUEST', 'HOST'])
], (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
    const { role: newRole } = req.body;
    const oldRole = user.role;

    if (oldRole === 'ADMIN') {
      return res.status(400).json({ error: 'Un ADMIN no puede cambiar su rol desde este endpoint' });
    }

    if (oldRole === newRole) {
      return res.status(400).json({ error: 'Ya tienes este rol' });
    }

    const activeContracts = db.prepare(`
      SELECT COUNT(*) as count FROM contracts 
      WHERE (guest_id = ? OR host_id = ?) AND status IN ('pending', 'signed', 'active')
    `).get(req.user.id, req.user.id);

    if (activeContracts.count > 0) {
      return res.status(400).json({ 
        error: 'No puedes cambiar de rol mientras tengas contratos activos',
        active_contracts: activeContracts.count
      });
    }

    db.prepare('UPDATE users SET role = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
      .run(newRole, req.user.id);

    const clientInfo = getClientInfo(req);
    logAudit(req.user.id, 'USER_ROLE_SELF_CHANGED', 'users', req.user.id, 
      { role: oldRole }, 
      { role: newRole, ...clientInfo }, 
      req
    );

    res.json({ 
      message: `Rol cambiado de ${oldRole} a ${newRole}`,
      old_role: oldRole,
      new_role: newRole
    });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Error al cambiar rol' });
  }
});

router.delete('/me', authenticateToken, [
  body('confirm').isBoolean().equals('true')
], (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: 'Debe enviar confirm=true para confirmar el borrado' });
    }

    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);

    if (user.role === 'ADMIN') {
      const clientInfo = getClientInfo(req);
      logAudit(req.user.id, 'ADMIN_SELF_DELETE_BLOCKED', 'users', req.user.id, null, {
        reason: 'ADMIN cannot delete own account',
        ...clientInfo
      }, req);
      return res.status(403).json({ error: 'Un ADMIN no puede eliminar su propia cuenta' });
    }

    const activeContracts = db.prepare(`
      SELECT COUNT(*) as count FROM contracts 
      WHERE (guest_id = ? OR host_id = ?) AND status IN ('pending', 'signed', 'active')
    `).get(req.user.id, req.user.id);

    if (activeContracts.count > 0) {
      return res.status(400).json({ 
        error: 'No puedes eliminar tu cuenta mientras tengas contratos activos',
        active_contracts: activeContracts.count
      });
    }

    const pendingPayments = db.prepare(`
      SELECT COUNT(*) as count FROM payments 
      WHERE user_id = ? AND status IN ('pending', 'processing')
    `).get(req.user.id);

    if (pendingPayments.count > 0) {
      return res.status(400).json({ 
        error: 'No puedes eliminar tu cuenta mientras tengas pagos pendientes',
        pending_payments: pendingPayments.count
      });
    }

    const deletedAt = new Date().toISOString();
    db.prepare(`
      UPDATE users SET 
        is_active = 0, 
        deleted_at = ?,
        updated_at = CURRENT_TIMESTAMP 
      WHERE id = ?
    `).run(deletedAt, req.user.id);

    const clientInfo = getClientInfo(req);
    logAudit(req.user.id, 'USER_ACCOUNT_DELETED', 'users', req.user.id, null, {
      deleted_at: deletedAt,
      ...clientInfo
    }, req);

    res.json({ 
      message: 'Cuenta eliminada exitosamente',
      deleted_at: deletedAt
    });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Error al eliminar cuenta' });
  }
});

router.get('/my-reservations', authenticateToken, (req, res) => {
  try {
    const reservations = db.prepare(`
      SELECT r.*, s.title as space_title, s.city, s.department,
             u.first_name as host_first_name, u.last_name as host_last_name
      FROM reservations r
      JOIN spaces s ON r.space_id = s.id
      JOIN users u ON r.host_id = u.id
      WHERE r.guest_id = ?
      ORDER BY r.created_at DESC
    `).all(req.user.id);

    res.json(reservations);
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Error al obtener reservaciones' });
  }
});

router.get('/my-spaces', authenticateToken, requireRole('HOST'), (req, res) => {
  try {
    const spaces = db.prepare(`
      SELECT s.*, 
             (SELECT COUNT(*) FROM reservations WHERE space_id = s.id AND status NOT IN ('cancelled', 'refunded')) as active_reservations
      FROM spaces s
      WHERE s.host_id = ? AND s.status != 'deleted'
      ORDER BY s.created_at DESC
    `).all(req.user.id);

    res.json(spaces);
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Error al obtener espacios' });
  }
});

router.get('/my-contracts', authenticateToken, (req, res) => {
  try {
    let query;
    if (req.user.role === 'HOST') {
      query = db.prepare(`
        SELECT c.*, s.title as space_title,
               ug.first_name as guest_first_name, ug.last_name as guest_last_name
        FROM contracts c
        JOIN spaces s ON c.space_id = s.id
        JOIN users ug ON c.guest_id = ug.id
        WHERE c.host_id = ?
        ORDER BY c.created_at DESC
      `);
    } else {
      query = db.prepare(`
        SELECT c.*, s.title as space_title,
               uh.first_name as host_first_name, uh.last_name as host_last_name
        FROM contracts c
        JOIN spaces s ON c.space_id = s.id
        JOIN users uh ON c.host_id = uh.id
        WHERE c.guest_id = ?
        ORDER BY c.created_at DESC
      `);
    }

    const contracts = query.all(req.user.id);
    res.json(contracts);
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Error al obtener contratos' });
  }
});

module.exports = router;
