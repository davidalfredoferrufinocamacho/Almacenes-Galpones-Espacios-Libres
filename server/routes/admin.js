const express = require('express');
const { body, validationResult } = require('express-validator');
const { db } = require('../config/database');
const { authenticateToken, requireRole } = require('../middleware/auth');
const { logAudit } = require('../middleware/audit');
const { getClientInfo, generateId } = require('../utils/helpers');

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
             ci, nit, phone, city, department, is_verified, is_active, is_blocked,
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

router.put('/users/:id/role', [
  body('role').isIn(['GUEST', 'HOST', 'ADMIN'])
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

    const { role: newRole } = req.body;
    const oldRole = user.role;

    if (oldRole === newRole) {
      return res.status(400).json({ error: 'El usuario ya tiene este rol' });
    }

    if (req.params.id === req.user.id && oldRole === 'ADMIN') {
      return res.status(400).json({ error: 'Un ADMIN no puede degradarse a si mismo' });
    }

    db.prepare('UPDATE users SET role = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
      .run(newRole, req.params.id);

    const clientInfo = getClientInfo(req);
    logAudit(req.user.id, 'USER_ROLE_CHANGED', 'users', req.params.id, 
      { role: oldRole }, 
      { role: newRole, admin_id: req.user.id, ...clientInfo }, 
      req
    );

    res.json({ 
      message: `Rol actualizado de ${oldRole} a ${newRole}`,
      user_id: req.params.id,
      old_role: oldRole,
      new_role: newRole
    });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Error al cambiar rol de usuario' });
  }
});

router.put('/users/:id', [
  body('first_name').optional().trim().notEmpty(),
  body('last_name').optional().trim().notEmpty(),
  body('phone').optional().trim(),
  body('city').optional().trim(),
  body('is_blocked').optional().isBoolean()
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

    if (user.role === 'ADMIN' && req.params.id !== req.user.id) {
      return res.status(403).json({ error: 'No se puede editar a otro administrador' });
    }

    const { first_name, last_name, phone, city, is_blocked } = req.body;
    const oldData = { first_name: user.first_name, last_name: user.last_name, phone: user.phone, city: user.city, is_blocked: user.is_blocked };

    const updates = [];
    const values = [];

    if (first_name !== undefined) { updates.push('first_name = ?'); values.push(first_name); }
    if (last_name !== undefined) { updates.push('last_name = ?'); values.push(last_name); }
    if (phone !== undefined) { updates.push('phone = ?'); values.push(phone); }
    if (city !== undefined) { updates.push('city = ?'); values.push(city); }
    if (is_blocked !== undefined) { updates.push('is_blocked = ?'); values.push(is_blocked ? 1 : 0); }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No hay datos para actualizar' });
    }

    updates.push('updated_at = CURRENT_TIMESTAMP');
    values.push(req.params.id);

    db.prepare(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`).run(...values);

    logAudit(req.user.id, 'USER_EDITED', 'users', req.params.id, oldData, req.body, req);

    res.json({ message: 'Usuario actualizado correctamente' });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Error al editar usuario' });
  }
});

router.delete('/users/:id', (req, res) => {
  try {
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
    if (!user) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }

    if (user.role === 'ADMIN') {
      return res.status(403).json({ error: 'No se puede eliminar a un administrador' });
    }

    if (req.params.id === req.user.id) {
      return res.status(403).json({ error: 'No puedes eliminarte a ti mismo' });
    }

    const hasContracts = db.prepare('SELECT COUNT(*) as count FROM contracts WHERE guest_id = ? OR host_id = ?').get(req.params.id, req.params.id);
    if (hasContracts.count > 0) {
      return res.status(400).json({ error: 'No se puede eliminar usuario con contratos activos. Desactivelo en su lugar.' });
    }

    const hasReservations = db.prepare('SELECT COUNT(*) as count FROM reservations WHERE guest_id = ? OR host_id = ?').get(req.params.id, req.params.id);
    if (hasReservations.count > 0) {
      db.prepare('DELETE FROM reservations WHERE guest_id = ? OR host_id = ?').run(req.params.id, req.params.id);
    }

    const hasSpaces = db.prepare('SELECT COUNT(*) as count FROM spaces WHERE host_id = ?').get(req.params.id);
    if (hasSpaces.count > 0) {
      db.prepare('DELETE FROM spaces WHERE host_id = ?').run(req.params.id);
    }

    db.prepare('DELETE FROM users WHERE id = ?').run(req.params.id);

    logAudit(req.user.id, 'USER_DELETED', 'users', req.params.id, user, null, req);

    res.json({ message: 'Usuario eliminado correctamente' });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Error al eliminar usuario' });
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
    const { from_date, to_date, user_id, event_type } = req.query;
    
    let sql = `
      SELECT a.*, u.email as user_email
      FROM audit_log a
      LEFT JOIN users u ON a.user_id = u.id
      WHERE 1=1
    `;
    const params = [];

    if (from_date) {
      sql += ` AND a.created_at >= ?`;
      params.push(from_date);
    }
    if (to_date) {
      sql += ` AND a.created_at <= ?`;
      params.push(to_date + ' 23:59:59');
    }
    if (user_id) {
      sql += ` AND a.user_id = ?`;
      params.push(user_id);
    }
    if (event_type) {
      sql += ` AND a.action LIKE ?`;
      params.push(`%${event_type}%`);
    }

    sql += ` ORDER BY a.created_at DESC LIMIT ?`;
    params.push(limit);

    const logs = db.prepare(sql).all(...params);

    res.json({
      logs,
      filters: { from_date, to_date, user_id, event_type, limit },
      total: logs.length
    });
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

    const clientInfo = getClientInfo(req);
    logAudit(req.user.id, 'ADMIN_CONTACT_RESPONSE', 'contact_messages', req.params.id, 
      { status: message.status }, 
      { status: 'responded', response_length: req.body.response.length, ...clientInfo }, 
      req
    );

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

    const clientInfo = getClientInfo(req);
    logAudit(req.user.id, 'ADMIN_EXPORT_DATA', 'system', null, null, {
      export_type: type,
      records_count: data.length,
      ...clientInfo
    }, req);

    res.json({ data, exported_at: new Date().toISOString(), type, records_count: data.length });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Error al exportar datos' });
  }
});

router.get('/payments/deposits/:id', (req, res) => {
  try {
    const deposit = db.prepare(`
      SELECT p.*, 
             u.email as user_email, u.first_name, u.last_name, u.person_type, u.ci, u.nit,
             r.space_id, r.total_amount, r.frozen_deposit_amount, r.frozen_commission_percentage,
             s.title as space_title
      FROM payments p
      JOIN users u ON p.user_id = u.id
      JOIN reservations r ON p.reservation_id = r.id
      JOIN spaces s ON r.space_id = s.id
      WHERE p.id = ? AND p.payment_type = 'deposit'
    `).get(req.params.id);

    if (!deposit) {
      return res.status(404).json({ error: 'Deposito no encontrado' });
    }

    res.json(deposit);
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Error al obtener deposito' });
  }
});

router.get('/payments/refunds/:id', (req, res) => {
  try {
    const refund = db.prepare(`
      SELECT p.*, 
             u.email as user_email, u.first_name, u.last_name, u.person_type, u.ci, u.nit,
             r.space_id, r.total_amount, r.frozen_deposit_amount, r.status as reservation_status,
             s.title as space_title,
             c.id as contract_id, c.guest_signed, c.host_signed
      FROM payments p
      JOIN users u ON p.user_id = u.id
      JOIN reservations r ON p.reservation_id = r.id
      JOIN spaces s ON r.space_id = s.id
      LEFT JOIN contracts c ON r.id = c.reservation_id
      WHERE p.id = ? AND p.payment_type = 'refund'
    `).get(req.params.id);

    if (!refund) {
      return res.status(404).json({ error: 'Reembolso no encontrado' });
    }

    res.json(refund);
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Error al obtener reembolso' });
  }
});

router.get('/refunds/pending', (req, res) => {
  try {
    const pending = db.prepare(`
      SELECT p.*, 
             u.email as user_email, u.first_name, u.last_name,
             r.space_id, r.total_amount, r.frozen_deposit_amount,
             s.title as space_title
      FROM payments p
      JOIN users u ON p.user_id = u.id
      JOIN reservations r ON p.reservation_id = r.id
      JOIN spaces s ON r.space_id = s.id
      WHERE p.payment_type = 'refund' AND p.status = 'pending'
      ORDER BY p.created_at DESC
    `).all();

    res.json(pending);
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Error al obtener reembolsos pendientes' });
  }
});

router.put('/refunds/:id/review', [
  body('action').isIn(['approve', 'reject']),
  body('admin_notes').optional().trim()
], (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const refund = db.prepare(`
      SELECT p.*, r.id as reservation_id
      FROM payments p
      JOIN reservations r ON p.reservation_id = r.id
      WHERE p.id = ? AND p.payment_type = 'refund'
    `).get(req.params.id);

    if (!refund) {
      return res.status(404).json({ error: 'Reembolso no encontrado' });
    }

    const { action, admin_notes } = req.body;
    const newStatus = action === 'approve' ? 'approved' : 'rejected';
    const oldStatus = refund.status;

    db.prepare(`
      UPDATE payments SET 
        status = ?,
        admin_notes = ?,
        reviewed_at = CURRENT_TIMESTAMP,
        reviewed_by = ?
      WHERE id = ?
    `).run(newStatus, admin_notes || null, req.user.id, req.params.id);

    const clientInfo = getClientInfo(req);
    logAudit(req.user.id, 'ADMIN_REFUND_REVIEW', 'payments', req.params.id, 
      { status: oldStatus }, 
      { status: newStatus, action, admin_notes, ...clientInfo }, 
      req
    );

    res.json({ 
      message: `Reembolso ${action === 'approve' ? 'aprobado' : 'rechazado'} exitosamente`,
      status: newStatus,
      mock_disclaimer: '[MOCK] Este es un estado administrativo. No se ha procesado pago real.'
    });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Error al revisar reembolso' });
  }
});

router.get('/accounting/summary', (req, res) => {
  try {
    const { from_date, to_date } = req.query;
    
    let dateFilter = '';
    const params = [];
    
    if (from_date) {
      dateFilter += ' AND created_at >= ?';
      params.push(from_date);
    }
    if (to_date) {
      dateFilter += ' AND created_at <= ?';
      params.push(to_date + ' 23:59:59');
    }

    const deposits = db.prepare(`
      SELECT 
        COUNT(*) as count,
        COALESCE(SUM(amount), 0) as total
      FROM payments 
      WHERE payment_type = 'deposit' AND status = 'completed' ${dateFilter}
    `).get(...params);

    const remainingPayments = db.prepare(`
      SELECT 
        COUNT(*) as count,
        COALESCE(SUM(amount), 0) as total
      FROM payments 
      WHERE payment_type = 'remaining' AND status = 'completed' ${dateFilter}
    `).get(...params);

    const refunds = db.prepare(`
      SELECT 
        COUNT(*) as count,
        COALESCE(SUM(ABS(amount)), 0) as total
      FROM payments 
      WHERE payment_type = 'refund' ${dateFilter}
    `).get(...params);

    const commissions = db.prepare(`
      SELECT 
        COUNT(*) as count,
        COALESCE(SUM(commission_amount), 0) as total
      FROM contracts 
      WHERE status = 'signed' ${dateFilter.replace(/created_at/g, 'contracts.created_at')}
    `).get(...params);

    const hostPayouts = db.prepare(`
      SELECT 
        COUNT(*) as count,
        COALESCE(SUM(host_payout_amount), 0) as total
      FROM contracts 
      WHERE status = 'signed' ${dateFilter.replace(/created_at/g, 'contracts.created_at')}
    `).get(...params);

    const escrowHeld = db.prepare(`
      SELECT COALESCE(SUM(amount), 0) as total
      FROM payments 
      WHERE escrow_status = 'held'
    `).get();

    res.json({
      period: { from_date: from_date || 'all', to_date: to_date || 'all' },
      summary: {
        deposits: {
          count: deposits.count,
          total: deposits.total,
          label: 'Anticipos recibidos'
        },
        remaining_payments: {
          count: remainingPayments.count,
          total: remainingPayments.total,
          label: 'Pagos finales'
        },
        refunds: {
          count: refunds.count,
          total: refunds.total,
          label: 'Reembolsos'
        },
        commissions: {
          count: commissions.count,
          total: commissions.total,
          label: 'Comisiones plataforma'
        },
        host_payouts: {
          count: hostPayouts.count,
          total: hostPayouts.total,
          label: 'Pagos a anfitriones'
        },
        escrow_held: {
          total: escrowHeld.total,
          label: 'Fondos en custodia (escrow)'
        }
      },
      totals: {
        gross_income: deposits.total + remainingPayments.total,
        net_after_refunds: deposits.total + remainingPayments.total - refunds.total,
        platform_revenue: commissions.total
      },
      generated_at: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Error al generar resumen contable' });
  }
});

// ==================== GESTION DE TEXTOS LEGALES ====================

const LEGAL_TEXT_TYPES = [
  'aviso_legal', 'terminos_condiciones', 'privacidad', 'pagos_reembolsos',
  'intermediacion', 'anti_bypass_guest', 'anti_bypass_host',
  'disclaimer_contrato', 'disclaimer_firma', 'disclaimer_factura',
  'liability_limitation', 'applicable_law'
];

router.get('/legal-texts', (req, res) => {
  try {
    const { type, is_active } = req.query;
    
    let sql = 'SELECT * FROM legal_texts WHERE 1=1';
    const params = [];

    if (type) {
      sql += ' AND type = ?';
      params.push(type);
    }
    if (is_active !== undefined) {
      sql += ' AND is_active = ?';
      params.push(is_active === 'true' ? 1 : 0);
    }

    sql += ' ORDER BY type, version DESC';
    const texts = db.prepare(sql).all(...params);

    res.json({
      texts,
      available_types: LEGAL_TEXT_TYPES
    });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Error al obtener textos legales' });
  }
});

router.get('/legal-texts/:id', (req, res) => {
  try {
    const text = db.prepare('SELECT * FROM legal_texts WHERE id = ?').get(req.params.id);
    if (!text) {
      return res.status(404).json({ error: 'Texto legal no encontrado' });
    }
    res.json(text);
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Error al obtener texto legal' });
  }
});

router.post('/legal-texts', [
  body('type').isIn(LEGAL_TEXT_TYPES),
  body('title').notEmpty().trim(),
  body('content').notEmpty(),
  body('version').notEmpty().trim(),
  body('effective_date').optional().isISO8601()
], (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { type, title, content, version, effective_date } = req.body;
    const id = `legal_${type}_v${version.replace(/\./g, '_')}_${Date.now()}`;
    const clientInfo = getClientInfo(req);

    db.prepare(`
      INSERT INTO legal_texts (id, type, title, content, version, is_active, effective_date, created_by)
      VALUES (?, ?, ?, ?, ?, 0, ?, ?)
    `).run(id, type, title, content, version, effective_date || null, req.user.id);

    logAudit(req.user.id, 'LEGAL_TEXT_CREATED', 'legal_texts', id, null, {
      type, title, version, effective_date, ...clientInfo
    }, req);

    res.status(201).json({
      id,
      type,
      version,
      message: 'Texto legal creado exitosamente. Use activar para ponerlo en vigor.'
    });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Error al crear texto legal' });
  }
});

router.put('/legal-texts/:id', [
  body('title').optional().trim(),
  body('content').optional(),
  body('effective_date').optional().isISO8601()
], (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const text = db.prepare('SELECT * FROM legal_texts WHERE id = ?').get(req.params.id);
    if (!text) {
      return res.status(404).json({ error: 'Texto legal no encontrado' });
    }

    if (text.is_active) {
      return res.status(400).json({ 
        error: 'No se puede editar un texto legal activo. Desactivelo primero o cree una nueva version.'
      });
    }

    const { title, content, effective_date } = req.body;
    const oldData = { title: text.title, content: text.content, effective_date: text.effective_date };

    db.prepare(`
      UPDATE legal_texts SET 
        title = COALESCE(?, title),
        content = COALESCE(?, content),
        effective_date = COALESCE(?, effective_date),
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(title || null, content || null, effective_date || null, req.params.id);

    const clientInfo = getClientInfo(req);
    logAudit(req.user.id, 'LEGAL_TEXT_UPDATED', 'legal_texts', req.params.id, oldData, {
      title: title || text.title,
      content: content ? '(contenido actualizado)' : text.content,
      effective_date: effective_date || text.effective_date,
      ...clientInfo
    }, req);

    res.json({ message: 'Texto legal actualizado exitosamente' });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Error al actualizar texto legal' });
  }
});

router.put('/legal-texts/:id/activate', (req, res) => {
  try {
    const text = db.prepare('SELECT * FROM legal_texts WHERE id = ?').get(req.params.id);
    if (!text) {
      return res.status(404).json({ error: 'Texto legal no encontrado' });
    }

    if (text.is_active) {
      return res.status(400).json({ error: 'Este texto legal ya esta activo' });
    }

    db.prepare('UPDATE legal_texts SET is_active = 0 WHERE type = ?').run(text.type);

    db.prepare(`
      UPDATE legal_texts SET 
        is_active = 1, 
        updated_at = CURRENT_TIMESTAMP 
      WHERE id = ?
    `).run(req.params.id);

    const clientInfo = getClientInfo(req);
    logAudit(req.user.id, 'LEGAL_TEXT_ACTIVATED', 'legal_texts', req.params.id, 
      { is_active: 0 }, 
      { is_active: 1, type: text.type, version: text.version, ...clientInfo }, 
      req
    );

    res.json({ 
      message: `Texto legal "${text.title}" version ${text.version} activado exitosamente`,
      type: text.type,
      version: text.version
    });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Error al activar texto legal' });
  }
});

router.put('/legal-texts/:id/deactivate', (req, res) => {
  try {
    const text = db.prepare('SELECT * FROM legal_texts WHERE id = ?').get(req.params.id);
    if (!text) {
      return res.status(404).json({ error: 'Texto legal no encontrado' });
    }

    if (!text.is_active) {
      return res.status(400).json({ error: 'Este texto legal ya esta inactivo' });
    }

    db.prepare(`
      UPDATE legal_texts SET 
        is_active = 0, 
        updated_at = CURRENT_TIMESTAMP 
      WHERE id = ?
    `).run(req.params.id);

    const clientInfo = getClientInfo(req);
    logAudit(req.user.id, 'LEGAL_TEXT_DEACTIVATED', 'legal_texts', req.params.id, 
      { is_active: 1 }, 
      { is_active: 0, type: text.type, version: text.version, ...clientInfo }, 
      req
    );

    res.json({ 
      message: `Texto legal "${text.title}" version ${text.version} desactivado`,
      warning: 'No hay version activa para este tipo de texto legal. Active otra version.',
      type: text.type
    });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Error al desactivar texto legal' });
  }
});

router.get('/legal-texts/history/:type', (req, res) => {
  try {
    if (!LEGAL_TEXT_TYPES.includes(req.params.type)) {
      return res.status(400).json({ error: 'Tipo de texto legal no valido' });
    }

    const history = db.prepare(`
      SELECT id, type, title, version, is_active, effective_date, created_by, created_at, updated_at
      FROM legal_texts 
      WHERE type = ?
      ORDER BY created_at DESC
    `).all(req.params.type);

    res.json({
      type: req.params.type,
      versions: history,
      total: history.length
    });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Error al obtener historial' });
  }
});

router.get('/notification-templates', (req, res) => {
  try {
    const { is_active, event_type, channel } = req.query;
    let query = 'SELECT * FROM notification_templates WHERE 1=1';
    const params = [];

    if (is_active !== undefined) {
      query += ' AND is_active = ?';
      params.push(is_active === 'true' ? 1 : 0);
    }
    if (event_type) {
      query += ' AND event_type = ?';
      params.push(event_type);
    }
    if (channel) {
      query += ' AND channel = ?';
      params.push(channel);
    }

    query += ' ORDER BY event_type, channel';
    const templates = db.prepare(query).all(...params);

    res.json({ templates, total: templates.length });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Error al obtener plantillas' });
  }
});

router.get('/notification-templates/:id', (req, res) => {
  try {
    const template = db.prepare('SELECT * FROM notification_templates WHERE id = ?').get(req.params.id);
    if (!template) {
      return res.status(404).json({ error: 'Plantilla no encontrada' });
    }
    res.json(template);
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Error al obtener plantilla' });
  }
});

router.post('/notification-templates', [
  body('event_type').notEmpty().trim(),
  body('channel').isIn(['email', 'sms', 'whatsapp']),
  body('subject').optional().trim(),
  body('body').notEmpty().trim()
], (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { event_type, channel, subject, body: bodyText } = req.body;
    const templateId = generateId();

    db.prepare(`
      INSERT INTO notification_templates (id, event_type, channel, subject, body, is_active)
      VALUES (?, ?, ?, ?, ?, 1)
    `).run(templateId, event_type, channel, subject || null, bodyText);

    const clientInfo = getClientInfo(req);
    logAudit(req.user.id, 'NOTIFICATION_TEMPLATE_CREATED', 'notification_templates', templateId, null, {
      event_type, channel, ...clientInfo
    }, req);

    res.status(201).json({ id: templateId, message: 'Plantilla creada exitosamente' });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Error al crear plantilla' });
  }
});

router.put('/notification-templates/:id', [
  body('subject').optional().trim(),
  body('body').optional().trim()
], (req, res) => {
  try {
    const template = db.prepare('SELECT * FROM notification_templates WHERE id = ?').get(req.params.id);
    if (!template) {
      return res.status(404).json({ error: 'Plantilla no encontrada' });
    }

    const { subject, body: bodyText } = req.body;
    const updates = [];
    const params = [];

    if (subject !== undefined) {
      updates.push('subject = ?');
      params.push(subject);
    }
    if (bodyText !== undefined) {
      updates.push('body = ?');
      params.push(bodyText);
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No hay campos para actualizar' });
    }

    updates.push('updated_at = CURRENT_TIMESTAMP');
    params.push(req.params.id);

    db.prepare(`UPDATE notification_templates SET ${updates.join(', ')} WHERE id = ?`).run(...params);

    const clientInfo = getClientInfo(req);
    logAudit(req.user.id, 'NOTIFICATION_TEMPLATE_UPDATED', 'notification_templates', req.params.id, 
      { subject: template.subject, body: template.body }, 
      { subject: subject || template.subject, body: bodyText || template.body, ...clientInfo }, 
      req
    );

    res.json({ message: 'Plantilla actualizada exitosamente' });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Error al actualizar plantilla' });
  }
});

router.put('/notification-templates/:id/activate', (req, res) => {
  try {
    const template = db.prepare('SELECT * FROM notification_templates WHERE id = ?').get(req.params.id);
    if (!template) {
      return res.status(404).json({ error: 'Plantilla no encontrada' });
    }

    db.prepare(`
      UPDATE notification_templates SET is_active = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?
    `).run(req.params.id);

    const clientInfo = getClientInfo(req);
    logAudit(req.user.id, 'NOTIFICATION_TEMPLATE_ACTIVATED', 'notification_templates', req.params.id, 
      { is_active: 0 }, { is_active: 1, ...clientInfo }, req
    );

    res.json({ message: 'Plantilla activada exitosamente' });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Error al activar plantilla' });
  }
});

router.put('/notification-templates/:id/deactivate', (req, res) => {
  try {
    const template = db.prepare('SELECT * FROM notification_templates WHERE id = ?').get(req.params.id);
    if (!template) {
      return res.status(404).json({ error: 'Plantilla no encontrada' });
    }

    db.prepare(`
      UPDATE notification_templates SET is_active = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?
    `).run(req.params.id);

    const clientInfo = getClientInfo(req);
    logAudit(req.user.id, 'NOTIFICATION_TEMPLATE_DEACTIVATED', 'notification_templates', req.params.id, 
      { is_active: 1 }, { is_active: 0, ...clientInfo }, req
    );

    res.json({ message: 'Plantilla desactivada exitosamente' });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Error al desactivar plantilla' });
  }
});

router.get('/notification-log', (req, res) => {
  try {
    const { recipient_id, event_type, channel, from_date, to_date, limit = 100 } = req.query;
    let query = 'SELECT * FROM notification_log WHERE 1=1';
    const params = [];

    if (recipient_id) {
      query += ' AND recipient_id = ?';
      params.push(recipient_id);
    }
    if (event_type) {
      query += ' AND event_type = ?';
      params.push(event_type);
    }
    if (channel) {
      query += ' AND channel = ?';
      params.push(channel);
    }
    if (from_date) {
      query += ' AND created_at >= ?';
      params.push(from_date);
    }
    if (to_date) {
      query += ' AND created_at <= ?';
      params.push(to_date);
    }

    query += ' ORDER BY created_at DESC LIMIT ?';
    params.push(parseInt(limit));

    const logs = db.prepare(query).all(...params);

    res.json({ logs, total: logs.length });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Error al obtener log de notificaciones' });
  }
});

module.exports = router;
