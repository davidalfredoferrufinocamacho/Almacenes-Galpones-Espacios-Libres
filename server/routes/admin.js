const express = require('express');
const { body, validationResult } = require('express-validator');
const { db } = require('../config/database');
const { authenticateToken, requireRole } = require('../middleware/auth');
const { logAudit } = require('../middleware/audit');

const router = express.Router();

router.use(authenticateToken);
router.use(requireRole('ADMIN'));

router.get('/dashboard', (req, res) => {
  try {
    const stats = {
      users: {
        total: db.prepare('SELECT COUNT(*) as count FROM users').get().count,
        guests: db.prepare("SELECT COUNT(*) as count FROM users WHERE role = 'GUEST'").get().count,
        hosts: db.prepare("SELECT COUNT(*) as count FROM users WHERE role = 'HOST'").get().count
      },
      spaces: {
        total: db.prepare('SELECT COUNT(*) as count FROM spaces').get().count,
        published: db.prepare("SELECT COUNT(*) as count FROM spaces WHERE status = 'published'").get().count,
        draft: db.prepare("SELECT COUNT(*) as count FROM spaces WHERE status = 'draft'").get().count
      },
      reservations: {
        total: db.prepare('SELECT COUNT(*) as count FROM reservations').get().count,
        active: db.prepare("SELECT COUNT(*) as count FROM reservations WHERE status NOT IN ('cancelled', 'refunded', 'completed')").get().count,
        completed: db.prepare("SELECT COUNT(*) as count FROM reservations WHERE status = 'completed'").get().count
      },
      contracts: {
        total: db.prepare('SELECT COUNT(*) as count FROM contracts').get().count,
        signed: db.prepare("SELECT COUNT(*) as count FROM contracts WHERE status = 'signed'").get().count,
        pending: db.prepare("SELECT COUNT(*) as count FROM contracts WHERE status = 'pending'").get().count
      },
      payments: {
        total_deposits: db.prepare("SELECT COALESCE(SUM(amount), 0) as total FROM payments WHERE payment_type = 'deposit' AND status = 'completed'").get().total,
        total_remaining: db.prepare("SELECT COALESCE(SUM(amount), 0) as total FROM payments WHERE payment_type = 'remaining' AND status = 'completed'").get().total,
        total_refunds: db.prepare("SELECT COALESCE(SUM(ABS(amount)), 0) as total FROM payments WHERE payment_type = 'refund'").get().total,
        escrow_held: db.prepare("SELECT COALESCE(SUM(amount), 0) as total FROM payments WHERE escrow_status = 'held'").get().total
      },
      commissions: {
        total: db.prepare('SELECT COALESCE(SUM(commission_amount), 0) as total FROM reservations WHERE status = ?').get('contract_signed').total
      }
    };

    res.json(stats);
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Error al obtener estadisticas' });
  }
});

router.get('/users', (req, res) => {
  try {
    const users = db.prepare(`
      SELECT id, email, role, person_type, first_name, last_name, company_name,
             ci, nit, phone, city, department, is_verified, is_active,
             anti_bypass_accepted, created_at
      FROM users
      ORDER BY created_at DESC
    `).all();

    res.json(users);
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Error al obtener usuarios' });
  }
});

router.put('/users/:id/status', [
  body('is_active').isBoolean()
], (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
    if (!user) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }

    db.prepare('UPDATE users SET is_active = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
      .run(req.body.is_active ? 1 : 0, req.params.id);

    logAudit(req.user.id, 'USER_STATUS_CHANGED', 'users', req.params.id, { is_active: user.is_active }, { is_active: req.body.is_active }, req);

    res.json({ message: 'Estado del usuario actualizado' });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Error al actualizar usuario' });
  }
});

router.get('/spaces', (req, res) => {
  try {
    const spaces = db.prepare(`
      SELECT s.*, u.email as host_email, u.first_name as host_first_name, u.last_name as host_last_name
      FROM spaces s
      JOIN users u ON s.host_id = u.id
      ORDER BY s.created_at DESC
    `).all();

    res.json(spaces);
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Error al obtener espacios' });
  }
});

router.get('/reservations', (req, res) => {
  try {
    const reservations = db.prepare(`
      SELECT r.*, 
             s.title as space_title,
             ug.email as guest_email, ug.first_name as guest_first_name,
             uh.email as host_email, uh.first_name as host_first_name
      FROM reservations r
      JOIN spaces s ON r.space_id = s.id
      JOIN users ug ON r.guest_id = ug.id
      JOIN users uh ON r.host_id = uh.id
      ORDER BY r.created_at DESC
    `).all();

    res.json(reservations);
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Error al obtener reservaciones' });
  }
});

router.get('/contracts', (req, res) => {
  try {
    const contracts = db.prepare(`
      SELECT c.*, 
             s.title as space_title,
             ug.email as guest_email, ug.first_name as guest_first_name,
             uh.email as host_email, uh.first_name as host_first_name
      FROM contracts c
      JOIN spaces s ON c.space_id = s.id
      JOIN users ug ON c.guest_id = ug.id
      JOIN users uh ON c.host_id = uh.id
      ORDER BY c.created_at DESC
    `).all();

    res.json(contracts);
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Error al obtener contratos' });
  }
});

router.get('/payments', (req, res) => {
  try {
    const payments = db.prepare(`
      SELECT p.*, u.email as user_email, u.first_name as user_first_name,
             r.space_id, s.title as space_title
      FROM payments p
      JOIN users u ON p.user_id = u.id
      JOIN reservations r ON p.reservation_id = r.id
      JOIN spaces s ON r.space_id = s.id
      ORDER BY p.created_at DESC
    `).all();

    res.json(payments);
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Error al obtener pagos' });
  }
});

router.get('/invoices', (req, res) => {
  try {
    const invoices = db.prepare(`
      SELECT i.*, u.email as recipient_email, u.first_name as recipient_first_name
      FROM invoices i
      JOIN users u ON i.recipient_id = u.id
      ORDER BY i.created_at DESC
    `).all();

    res.json(invoices);
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Error al obtener facturas' });
  }
});

router.get('/config', (req, res) => {
  try {
    const config = db.prepare('SELECT * FROM system_config').all();
    res.json(config);
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Error al obtener configuracion' });
  }
});

router.put('/config/:key', [
  body('value').notEmpty()
], (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const oldConfig = db.prepare('SELECT * FROM system_config WHERE key = ?').get(req.params.key);
    if (!oldConfig) {
      return res.status(404).json({ error: 'Configuracion no encontrada' });
    }

    if (['deposit_percentage', 'commission_percentage'].includes(req.params.key)) {
      const value = parseFloat(req.body.value);
      if (isNaN(value) || value < 0 || value > 100) {
        return res.status(400).json({ error: 'El valor debe estar entre 0 y 100' });
      }
    }

    db.prepare('UPDATE system_config SET value = ?, updated_at = CURRENT_TIMESTAMP, updated_by = ? WHERE key = ?')
      .run(req.body.value, req.user.id, req.params.key);

    logAudit(req.user.id, 'CONFIG_UPDATED', 'system_config', oldConfig.id, { value: oldConfig.value }, { value: req.body.value }, req);

    res.json({ message: 'Configuracion actualizada' });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Error al actualizar configuracion' });
  }
});

router.get('/audit-log', (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 100;
    const logs = db.prepare(`
      SELECT a.*, u.email as user_email
      FROM audit_log a
      LEFT JOIN users u ON a.user_id = u.id
      ORDER BY a.created_at DESC
      LIMIT ?
    `).all(limit);

    res.json(logs);
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Error al obtener auditoria' });
  }
});

router.get('/contact-messages', (req, res) => {
  try {
    const messages = db.prepare(`
      SELECT cm.*, u.email as user_email
      FROM contact_messages cm
      LEFT JOIN users u ON cm.user_id = u.id
      ORDER BY cm.created_at DESC
    `).all();

    res.json(messages);
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Error al obtener mensajes' });
  }
});

router.put('/contact-messages/:id/respond', [
  body('response').notEmpty().trim()
], (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const message = db.prepare('SELECT * FROM contact_messages WHERE id = ?').get(req.params.id);
    if (!message) {
      return res.status(404).json({ error: 'Mensaje no encontrado' });
    }

    db.prepare(`
      UPDATE contact_messages SET 
        status = 'responded',
        admin_response = ?,
        responded_at = CURRENT_TIMESTAMP,
        responded_by = ?
      WHERE id = ?
    `).run(req.body.response, req.user.id, req.params.id);

    res.json({ message: 'Respuesta enviada' });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Error al responder mensaje' });
  }
});

router.get('/export/:type', (req, res) => {
  try {
    let data;
    const { type } = req.params;

    switch (type) {
      case 'users':
        data = db.prepare('SELECT * FROM users').all();
        break;
      case 'spaces':
        data = db.prepare('SELECT * FROM spaces').all();
        break;
      case 'reservations':
        data = db.prepare('SELECT * FROM reservations').all();
        break;
      case 'contracts':
        data = db.prepare('SELECT * FROM contracts').all();
        break;
      case 'payments':
        data = db.prepare('SELECT * FROM payments').all();
        break;
      case 'invoices':
        data = db.prepare('SELECT * FROM invoices').all();
        break;
      case 'audit':
        data = db.prepare('SELECT * FROM audit_log').all();
        break;
      default:
        return res.status(400).json({ error: 'Tipo de exportacion no valido' });
    }

    res.json({ data, exported_at: new Date().toISOString(), type });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Error al exportar datos' });
  }
});

module.exports = router;
