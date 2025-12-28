const express = require('express');
const { body, validationResult } = require('express-validator');
const { db } = require('../config/database');
const { authenticateToken, requireRole } = require('../middleware/auth');
const { logAudit } = require('../middleware/audit');
const { getClientInfo, generateId } = require('../utils/helpers');
const { sendContactResponseEmail, sendEmail } = require('../utils/gmailService');

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
             ci, nit, phone, city, department, street, street_number, country,
             classification, is_verified, is_active, is_blocked,
             anti_bypass_accepted, anti_bypass_accepted_at, created_at
      FROM users
      ORDER BY created_at DESC
    `).all();

    res.json(users);
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Error al obtener usuarios' });
  }
});

router.get('/panel/users', (req, res) => {
  try {
    const { role } = req.query;
    let whereClause = "WHERE role != 'ADMIN'";
    if (role === 'GUEST' || role === 'HOST') {
      whereClause = `WHERE role = '${role}'`;
    }

    const users = db.prepare(`
      SELECT u.id, u.email, u.role, u.person_type, u.first_name, u.last_name, u.company_name,
             u.ci, u.nit, u.phone, u.city, u.department, u.street, u.street_number, u.country,
             u.classification, u.is_verified, u.is_active, u.is_blocked,
             u.anti_bypass_accepted, u.anti_bypass_accepted_at, u.created_at,
             (SELECT COUNT(*) FROM spaces WHERE host_id = u.id) as spaces_count,
             (SELECT COUNT(*) FROM reservations WHERE guest_id = u.id OR host_id = u.id) as reservations_count,
             (SELECT COUNT(*) FROM contracts WHERE guest_id = u.id OR host_id = u.id) as contracts_count,
             (SELECT COALESCE(SUM(amount), 0) FROM payments p 
              JOIN reservations r ON p.reservation_id = r.id 
              WHERE (r.guest_id = u.id OR r.host_id = u.id) AND p.status = 'completed') as total_payments,
             (SELECT COALESCE(SUM(commission_amount), 0) FROM reservations 
              WHERE (guest_id = u.id OR host_id = u.id) AND status = 'contract_signed') as total_commissions
      FROM users u
      ${whereClause}
      ORDER BY u.created_at DESC
    `).all();

    const stats = {
      total: users.length,
      active: users.filter(u => u.is_active && !u.is_blocked).length,
      blocked: users.filter(u => u.is_blocked).length,
      verified: users.filter(u => u.is_verified).length,
      with_contracts: users.filter(u => u.contracts_count > 0).length,
      total_revenue: users.reduce((sum, u) => sum + (u.total_payments || 0), 0),
      total_commissions: users.reduce((sum, u) => sum + (u.total_commissions || 0), 0)
    };

    res.json({ users, stats });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Error al obtener usuarios del panel' });
  }
});

router.get('/panel/users/:id/details', (req, res) => {
  try {
    const user = db.prepare(`
      SELECT id, email, role, person_type, first_name, last_name, company_name,
             ci, nit, phone, city, department, street, street_number, country, address,
             classification, is_verified, is_active, is_blocked,
             anti_bypass_accepted, anti_bypass_accepted_at, created_at
      FROM users WHERE id = ?
    `).get(req.params.id);

    if (!user) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }

    const spaces = db.prepare(`
      SELECT id, title, type, city, department, price_per_day, price_per_month, status, 
             views, created_at
      FROM spaces WHERE host_id = ? ORDER BY created_at DESC
    `).all(req.params.id);

    const reservations = db.prepare(`
      SELECT r.*, s.title as space_title, 
             ug.email as guest_email, uh.email as host_email,
             CASE WHEN r.guest_id = ? THEN 'guest' ELSE 'host' END as user_role_in_reservation
      FROM reservations r
      LEFT JOIN spaces s ON r.space_id = s.id
      LEFT JOIN users ug ON r.guest_id = ug.id
      LEFT JOIN users uh ON r.host_id = uh.id
      WHERE r.guest_id = ? OR r.host_id = ?
      ORDER BY r.created_at DESC
    `).all(req.params.id, req.params.id, req.params.id);

    const contracts = db.prepare(`
      SELECT c.*, s.title as space_title,
             ug.email as guest_email, uh.email as host_email
      FROM contracts c
      LEFT JOIN spaces s ON c.space_id = s.id
      LEFT JOIN users ug ON c.guest_id = ug.id
      LEFT JOIN users uh ON c.host_id = uh.id
      WHERE c.guest_id = ? OR c.host_id = ?
      ORDER BY c.created_at DESC
    `).all(req.params.id, req.params.id);

    const payments = db.prepare(`
      SELECT p.*, r.space_id, s.title as space_title
      FROM payments p
      JOIN reservations r ON p.reservation_id = r.id
      LEFT JOIN spaces s ON r.space_id = s.id
      WHERE r.guest_id = ? OR r.host_id = ?
      ORDER BY p.created_at DESC
    `).all(req.params.id, req.params.id);

    const invoices = db.prepare(`
      SELECT i.*, r.space_id
      FROM invoices i
      JOIN reservations r ON i.reservation_id = r.id
      WHERE r.guest_id = ? OR r.host_id = ?
      ORDER BY i.created_at DESC
    `).all(req.params.id, req.params.id);

    const searches = db.prepare(`
      SELECT * FROM search_history WHERE user_id = ? ORDER BY created_at DESC LIMIT 50
    `).all(req.params.id);

    const summary = {
      total_spaces: spaces.length,
      published_spaces: spaces.filter(s => s.status === 'published').length,
      total_reservations: reservations.length,
      active_reservations: reservations.filter(r => !['cancelled', 'completed', 'refunded'].includes(r.status)).length,
      total_contracts: contracts.length,
      signed_contracts: contracts.filter(c => c.status === 'signed').length,
      total_payments: payments.reduce((sum, p) => sum + (p.status === 'completed' ? p.amount : 0), 0),
      pending_payments: payments.filter(p => p.status === 'pending').length,
      total_commissions: reservations.reduce((sum, r) => sum + (r.commission_amount || 0), 0),
      total_invoices: invoices.length
    };

    res.json({ user, spaces, reservations, contracts, payments, invoices, searches, summary });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Error al obtener detalles del usuario' });
  }
});

router.put('/panel/users/:id', (req, res) => {
  try {
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
    if (!user) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }

    const { first_name, last_name, company_name, phone, city, department, address,
            street, street_number, country, classification, anti_bypass_accepted,
            is_active, is_blocked, is_verified, admin_notes } = req.body;
    
    const updates = [];
    const values = [];

    if (first_name !== undefined) { updates.push('first_name = ?'); values.push(first_name); }
    if (last_name !== undefined) { updates.push('last_name = ?'); values.push(last_name); }
    if (company_name !== undefined) { updates.push('company_name = ?'); values.push(company_name); }
    if (phone !== undefined) { updates.push('phone = ?'); values.push(phone); }
    if (city !== undefined) { updates.push('city = ?'); values.push(city); }
    if (department !== undefined) { updates.push('department = ?'); values.push(department); }
    if (address !== undefined) { updates.push('address = ?'); values.push(address); }
    if (street !== undefined) { updates.push('street = ?'); values.push(street); }
    if (street_number !== undefined) { updates.push('street_number = ?'); values.push(street_number); }
    if (country !== undefined) { updates.push('country = ?'); values.push(country); }
    if (classification !== undefined) { updates.push('classification = ?'); values.push(classification); }
    if (anti_bypass_accepted !== undefined) { 
      updates.push('anti_bypass_accepted = ?'); 
      values.push(anti_bypass_accepted ? 1 : 0);
      if (anti_bypass_accepted) {
        updates.push('anti_bypass_accepted_at = CURRENT_TIMESTAMP');
      }
    }
    if (is_active !== undefined) { updates.push('is_active = ?'); values.push(is_active ? 1 : 0); }
    if (is_blocked !== undefined) { updates.push('is_blocked = ?'); values.push(is_blocked ? 1 : 0); }
    if (is_verified !== undefined) { updates.push('is_verified = ?'); values.push(is_verified ? 1 : 0); }
    if (admin_notes !== undefined) { updates.push('admin_notes = ?'); values.push(admin_notes); }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No hay cambios' });
    }

    values.push(req.params.id);
    db.prepare(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`).run(...values);

    logAudit(req.user.id, 'ADMIN_PANEL_USER_UPDATED', 'users', req.params.id, user, req.body, req);

    res.json({ message: 'Usuario actualizado' });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Error al actualizar usuario' });
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

router.put('/users/:id/password', [
  body('new_password').isLength({ min: 8 }).withMessage('La contraseña debe tener al menos 8 caracteres'),
  body('confirm_password').custom((value, { req }) => {
    if (value !== req.body.new_password) {
      throw new Error('Las contraseñas no coinciden');
    }
    return true;
  })
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
    if (!user) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }

    const bcrypt = require('bcryptjs');
    const hashedPassword = await bcrypt.hash(req.body.new_password, 10);

    db.prepare('UPDATE users SET password = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
      .run(hashedPassword, req.params.id);

    logAudit(req.user.id, 'USER_PASSWORD_CHANGED', 'users', req.params.id, { admin_action: true }, { password_changed: true }, req);

    res.json({ message: 'Contraseña actualizada correctamente' });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Error al cambiar contraseña' });
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
  body('street').optional().trim(),
  body('street_number').optional().trim(),
  body('country').optional().trim(),
  body('department').optional().trim(),
  body('classification').optional().trim(),
  body('anti_bypass_accepted').optional().isBoolean(),
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

    const { first_name, last_name, phone, city, street, street_number, country, department,
            classification, anti_bypass_accepted, is_blocked } = req.body;
    const oldData = { first_name: user.first_name, last_name: user.last_name, phone: user.phone, 
                      city: user.city, classification: user.classification, anti_bypass_accepted: user.anti_bypass_accepted };

    const updates = [];
    const values = [];

    if (first_name !== undefined) { updates.push('first_name = ?'); values.push(first_name); }
    if (last_name !== undefined) { updates.push('last_name = ?'); values.push(last_name); }
    if (phone !== undefined) { updates.push('phone = ?'); values.push(phone); }
    if (city !== undefined) { updates.push('city = ?'); values.push(city); }
    if (street !== undefined) { updates.push('street = ?'); values.push(street); }
    if (street_number !== undefined) { updates.push('street_number = ?'); values.push(street_number); }
    if (country !== undefined) { updates.push('country = ?'); values.push(country); }
    if (department !== undefined) { updates.push('department = ?'); values.push(department); }
    if (classification !== undefined) { updates.push('classification = ?'); values.push(classification); }
    if (anti_bypass_accepted !== undefined) { 
      updates.push('anti_bypass_accepted = ?'); 
      values.push(anti_bypass_accepted ? 1 : 0);
      if (anti_bypass_accepted && !user.anti_bypass_accepted) {
        updates.push('anti_bypass_accepted_at = CURRENT_TIMESTAMP');
      }
    }
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

    // Limpiar todas las tablas relacionadas antes de eliminar el usuario
    db.prepare('DELETE FROM notification_log WHERE recipient_id = ?').run(req.params.id);
    db.prepare('DELETE FROM campaign_recipients WHERE user_id = ?').run(req.params.id);
    db.prepare('DELETE FROM favorites WHERE user_id = ?').run(req.params.id);
    db.prepare('UPDATE audit_log SET user_id = NULL WHERE user_id = ?').run(req.params.id);
    
    // Eliminar pagos relacionados con reservaciones del usuario
    const userReservations = db.prepare('SELECT id FROM reservations WHERE guest_id = ? OR host_id = ?').all(req.params.id, req.params.id);
    for (const reservation of userReservations) {
      db.prepare('DELETE FROM payments WHERE reservation_id = ?').run(reservation.id);
    }
    
    db.prepare('DELETE FROM reservations WHERE guest_id = ? OR host_id = ?').run(req.params.id, req.params.id);
    db.prepare('DELETE FROM spaces WHERE host_id = ?').run(req.params.id);

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
      SELECT s.*, u.email as host_email, u.first_name as host_first_name, u.last_name as host_last_name,
             u.is_blocked as host_blocked
      FROM spaces s
      JOIN users u ON s.host_id = u.id
      ORDER BY s.created_at DESC
    `).all();

    const spacesWithOccupancy = spaces.map(space => {
      const activeContracts = db.prepare(`
        SELECT COALESCE(SUM(c.sqm), 0) as rented_sqm
        FROM contracts c
        WHERE c.space_id = ? AND c.status IN ('signed', 'active') AND c.end_date >= date('now')
      `).get(space.id);
      
      const rentedSqm = activeContracts?.rented_sqm || 0;
      const upcomingExpiry = db.prepare(`
        SELECT MIN(end_date) as next_expiry
        FROM contracts
        WHERE space_id = ? AND status IN ('signed', 'active') AND end_date >= date('now')
      `).get(space.id);

      return {
        ...space,
        rented_sqm: rentedSqm,
        free_sqm: space.total_sqm - rentedSqm,
        occupancy_percent: space.total_sqm > 0 ? Math.round((rentedSqm / space.total_sqm) * 100) : 0,
        next_contract_expiry: upcomingExpiry?.next_expiry || null
      };
    });

    res.json(spacesWithOccupancy);
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Error al obtener espacios' });
  }
});

router.put('/spaces/:id', [
  body('title').optional().trim().notEmpty(),
  body('description').optional().trim(),
  body('price_per_sqm_day').optional().isFloat({ min: 0 }),
  body('price_per_sqm_week').optional().isFloat({ min: 0 }),
  body('price_per_sqm_month').optional().isFloat({ min: 0 }),
  body('total_sqm').optional().isFloat({ min: 1 }),
  body('available_sqm').optional().isFloat({ min: 0 }),
  body('city').optional().trim(),
  body('department').optional().trim(),
  body('address').optional().trim()
], (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const space = db.prepare('SELECT * FROM spaces WHERE id = ?').get(req.params.id);
    if (!space) {
      return res.status(404).json({ error: 'Espacio no encontrado' });
    }

    const hasActiveContracts = db.prepare(`
      SELECT COUNT(*) as count FROM contracts 
      WHERE space_id = ? AND status IN ('signed', 'active') AND end_date >= date('now')
    `).get(req.params.id);

    if (hasActiveContracts.count > 0 && (req.body.total_sqm || req.body.price_per_sqm_day || req.body.price_per_sqm_week || req.body.price_per_sqm_month)) {
      return res.status(400).json({ error: 'No se puede modificar m2 o precios con contratos activos' });
    }

    const { title, description, price_per_sqm_day, price_per_sqm_week, price_per_sqm_month, 
            total_sqm, available_sqm, city, department, address } = req.body;
    const oldData = { ...space };

    const updates = [];
    const values = [];

    if (title !== undefined) { updates.push('title = ?'); values.push(title); }
    if (description !== undefined) { updates.push('description = ?'); values.push(description); }
    if (price_per_sqm_day !== undefined) { updates.push('price_per_sqm_day = ?'); values.push(price_per_sqm_day); }
    if (price_per_sqm_week !== undefined) { updates.push('price_per_sqm_week = ?'); values.push(price_per_sqm_week); }
    if (price_per_sqm_month !== undefined) { updates.push('price_per_sqm_month = ?'); values.push(price_per_sqm_month); }
    if (total_sqm !== undefined) { updates.push('total_sqm = ?'); values.push(total_sqm); }
    if (available_sqm !== undefined) { updates.push('available_sqm = ?'); values.push(available_sqm); }
    if (city !== undefined) { updates.push('city = ?'); values.push(city); }
    if (department !== undefined) { updates.push('department = ?'); values.push(department); }
    if (address !== undefined) { updates.push('address = ?'); values.push(address); }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No hay datos para actualizar' });
    }

    updates.push('updated_at = CURRENT_TIMESTAMP');
    values.push(req.params.id);

    db.prepare(`UPDATE spaces SET ${updates.join(', ')} WHERE id = ?`).run(...values);

    logAudit(req.user.id, 'SPACE_EDITED', 'spaces', req.params.id, oldData, req.body, req);

    res.json({ message: 'Espacio actualizado correctamente' });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Error al editar espacio' });
  }
});

router.put('/spaces/:id/status', [
  body('status').isIn(['draft', 'published', 'paused', 'deleted'])
], (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const space = db.prepare('SELECT * FROM spaces WHERE id = ?').get(req.params.id);
    if (!space) {
      return res.status(404).json({ error: 'Espacio no encontrado' });
    }

    const oldStatus = space.status;
    const newStatus = req.body.status;

    if (newStatus === 'published') {
      const host = db.prepare('SELECT is_blocked, anti_bypass_accepted FROM users WHERE id = ?').get(space.host_id);
      if (host.is_blocked) {
        return res.status(400).json({ error: 'El HOST está bloqueado, no puede publicar espacios' });
      }
      if (!host.anti_bypass_accepted) {
        return res.status(400).json({ error: 'El HOST no ha aceptado la cláusula anti-bypass' });
      }
    }

    db.prepare('UPDATE spaces SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
      .run(newStatus, req.params.id);

    logAudit(req.user.id, 'SPACE_STATUS_CHANGED', 'spaces', req.params.id, 
      { status: oldStatus }, { status: newStatus }, req);

    res.json({ message: `Estado cambiado de ${oldStatus} a ${newStatus}` });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Error al cambiar estado del espacio' });
  }
});

router.delete('/spaces/:id', (req, res) => {
  try {
    const space = db.prepare('SELECT * FROM spaces WHERE id = ?').get(req.params.id);
    if (!space) {
      return res.status(404).json({ error: 'Espacio no encontrado' });
    }

    const hasContracts = db.prepare(`
      SELECT COUNT(*) as count FROM contracts WHERE space_id = ?
    `).get(req.params.id);

    if (hasContracts.count > 0) {
      return res.status(400).json({ error: 'No se puede eliminar espacio con historial de contratos. Desactívelo en su lugar.' });
    }

    const hasReservations = db.prepare(`
      SELECT COUNT(*) as count FROM reservations WHERE space_id = ?
    `).get(req.params.id);

    if (hasReservations.count > 0) {
      return res.status(400).json({ error: 'No se puede eliminar espacio con historial de reservaciones. Desactívelo en su lugar.' });
    }

    db.prepare('DELETE FROM space_photos WHERE space_id = ?').run(req.params.id);
    db.prepare('DELETE FROM spaces WHERE id = ?').run(req.params.id);

    logAudit(req.user.id, 'SPACE_DELETED', 'spaces', req.params.id, space, null, req);

    res.json({ message: 'Espacio eliminado correctamente' });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Error al eliminar espacio' });
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

router.put('/reservations/:id', [
  body('status').optional().isIn(['pending', 'confirmed', 'deposit_paid', 'contract_signed', 'completed', 'cancelled', 'rejected']),
  body('sqm_requested').optional().isFloat({ min: 1 }),
  body('notes').optional().trim()
], (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const reservation = db.prepare('SELECT * FROM reservations WHERE id = ?').get(req.params.id);
    if (!reservation) {
      return res.status(404).json({ error: 'Reservacion no encontrada' });
    }

    const hasContract = db.prepare('SELECT COUNT(*) as count FROM contracts WHERE reservation_id = ?').get(req.params.id);
    if (hasContract.count > 0) {
      return res.status(400).json({ error: 'No se puede editar reservacion con contrato generado' });
    }

    if (reservation.status === 'deposit_paid' && req.body.sqm_requested) {
      return res.status(400).json({ error: 'No se puede modificar m2 despues del pago de anticipo' });
    }

    const { status, sqm_requested, notes } = req.body;
    const oldData = { ...reservation };

    const updates = [];
    const values = [];

    if (status !== undefined) { updates.push('status = ?'); values.push(status); }
    if (sqm_requested !== undefined) { updates.push('sqm_requested = ?'); values.push(sqm_requested); }
    if (notes !== undefined) { updates.push('notes = ?'); values.push(notes); }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No hay datos para actualizar' });
    }

    updates.push('updated_at = CURRENT_TIMESTAMP');
    values.push(req.params.id);

    db.prepare(`UPDATE reservations SET ${updates.join(', ')} WHERE id = ?`).run(...values);

    logAudit(req.user.id, 'RESERVATION_EDITED', 'reservations', req.params.id, oldData, req.body, req);

    res.json({ message: 'Reservacion actualizada correctamente' });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Error al editar reservacion' });
  }
});

router.delete('/reservations/:id', (req, res) => {
  try {
    const reservation = db.prepare('SELECT * FROM reservations WHERE id = ?').get(req.params.id);
    if (!reservation) {
      return res.status(404).json({ error: 'Reservacion no encontrada' });
    }

    const hasContract = db.prepare('SELECT COUNT(*) as count FROM contracts WHERE reservation_id = ?').get(req.params.id);
    if (hasContract.count > 0) {
      return res.status(400).json({ error: 'No se puede eliminar reservacion con contrato. Cancele la reservacion en su lugar.' });
    }

    const hasPayments = db.prepare('SELECT COUNT(*) as count FROM payments WHERE reservation_id = ?').get(req.params.id);
    if (hasPayments.count > 0) {
      return res.status(400).json({ error: 'No se puede eliminar reservacion con pagos registrados. Cancele la reservacion en su lugar.' });
    }

    db.prepare('DELETE FROM reservations WHERE id = ?').run(req.params.id);

    logAudit(req.user.id, 'RESERVATION_DELETED', 'reservations', req.params.id, reservation, null, req);

    res.json({ message: 'Reservacion eliminada correctamente' });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Error al eliminar reservacion' });
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

router.put('/contracts/:id', [
  body('status').optional().isIn(['pending', 'signed', 'active', 'completed', 'cancelled', 'terminated']),
  body('notes').optional().trim()
], (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const contract = db.prepare('SELECT * FROM contracts WHERE id = ?').get(req.params.id);
    if (!contract) {
      return res.status(404).json({ error: 'Contrato no encontrado' });
    }

    const { status, notes } = req.body;
    const oldData = { status: contract.status, notes: contract.notes };

    const updates = [];
    const values = [];

    if (status !== undefined) { updates.push('status = ?'); values.push(status); }
    if (notes !== undefined) { updates.push('notes = ?'); values.push(notes); }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No hay datos para actualizar' });
    }

    updates.push('updated_at = CURRENT_TIMESTAMP');
    values.push(req.params.id);

    db.prepare(`UPDATE contracts SET ${updates.join(', ')} WHERE id = ?`).run(...values);

    logAudit(req.user.id, 'CONTRACT_EDITED', 'contracts', req.params.id, oldData, req.body, req);

    res.json({ message: 'Contrato actualizado correctamente' });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Error al editar contrato' });
  }
});

router.delete('/contracts/:id', (req, res) => {
  try {
    const contract = db.prepare('SELECT * FROM contracts WHERE id = ?').get(req.params.id);
    if (!contract) {
      return res.status(404).json({ error: 'Contrato no encontrado' });
    }

    if (contract.status === 'signed' || contract.status === 'active') {
      return res.status(400).json({ error: 'No se puede eliminar contrato firmado o activo. Cancele o termine el contrato.' });
    }

    const hasPayments = db.prepare('SELECT COUNT(*) as count FROM payments WHERE reservation_id = (SELECT reservation_id FROM contracts WHERE id = ?)').get(req.params.id);
    if (hasPayments.count > 0) {
      return res.status(400).json({ error: 'No se puede eliminar contrato con pagos asociados' });
    }

    db.prepare('DELETE FROM contract_extensions WHERE contract_id = ?').run(req.params.id);
    db.prepare('DELETE FROM contracts WHERE id = ?').run(req.params.id);

    logAudit(req.user.id, 'CONTRACT_DELETED', 'contracts', req.params.id, contract, null, req);

    res.json({ message: 'Contrato eliminado correctamente' });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Error al eliminar contrato' });
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

router.put('/payments/:id', [
  body('status').optional().isIn(['pending', 'completed', 'failed', 'refunded']),
  body('escrow_status').optional().isIn(['held', 'released', 'refunded']),
  body('notes').optional().trim()
], (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const payment = db.prepare('SELECT * FROM payments WHERE id = ?').get(req.params.id);
    if (!payment) {
      return res.status(404).json({ error: 'Pago no encontrado' });
    }

    const { status, escrow_status, notes } = req.body;
    const oldData = { status: payment.status, escrow_status: payment.escrow_status, notes: payment.notes };

    const updates = [];
    const values = [];

    if (status !== undefined) { updates.push('status = ?'); values.push(status); }
    if (escrow_status !== undefined) { updates.push('escrow_status = ?'); values.push(escrow_status); }
    if (notes !== undefined) { updates.push('notes = ?'); values.push(notes); }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No hay datos para actualizar' });
    }

    updates.push('updated_at = CURRENT_TIMESTAMP');
    values.push(req.params.id);

    db.prepare(`UPDATE payments SET ${updates.join(', ')} WHERE id = ?`).run(...values);

    logAudit(req.user.id, 'PAYMENT_EDITED', 'payments', req.params.id, oldData, req.body, req);

    res.json({ message: 'Pago actualizado correctamente' });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Error al editar pago' });
  }
});

router.delete('/payments/:id', (req, res) => {
  try {
    const payment = db.prepare('SELECT * FROM payments WHERE id = ?').get(req.params.id);
    if (!payment) {
      return res.status(404).json({ error: 'Pago no encontrado' });
    }

    if (payment.status === 'completed') {
      return res.status(400).json({ error: 'No se puede eliminar pago completado. Use reembolso en su lugar.' });
    }

    if (payment.escrow_status === 'held') {
      return res.status(400).json({ error: 'No se puede eliminar pago con escrow retenido. Libere o reembolse el escrow primero.' });
    }

    db.prepare('DELETE FROM payments WHERE id = ?').run(req.params.id);

    logAudit(req.user.id, 'PAYMENT_DELETED', 'payments', req.params.id, payment, null, req);

    res.json({ message: 'Pago eliminado correctamente' });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Error al eliminar pago' });
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

router.put('/invoices/:id', [
  body('status').optional().isIn(['draft', 'issued', 'paid', 'cancelled']),
  body('notes').optional().trim()
], (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const invoice = db.prepare('SELECT * FROM invoices WHERE id = ?').get(req.params.id);
    if (!invoice) {
      return res.status(404).json({ error: 'Factura no encontrada' });
    }

    const { status, notes } = req.body;
    const oldData = { status: invoice.status, notes: invoice.notes };

    const updates = [];
    const values = [];

    if (status !== undefined) { updates.push('status = ?'); values.push(status); }
    if (notes !== undefined) { updates.push('notes = ?'); values.push(notes); }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No hay datos para actualizar' });
    }

    updates.push('updated_at = CURRENT_TIMESTAMP');
    values.push(req.params.id);

    db.prepare(`UPDATE invoices SET ${updates.join(', ')} WHERE id = ?`).run(...values);

    logAudit(req.user.id, 'INVOICE_EDITED', 'invoices', req.params.id, oldData, req.body, req);

    res.json({ message: 'Factura actualizada correctamente' });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Error al editar factura' });
  }
});

router.delete('/invoices/:id', (req, res) => {
  try {
    const invoice = db.prepare('SELECT * FROM invoices WHERE id = ?').get(req.params.id);
    if (!invoice) {
      return res.status(404).json({ error: 'Factura no encontrada' });
    }

    if (invoice.status === 'issued' || invoice.status === 'paid') {
      return res.status(400).json({ error: 'No se puede eliminar factura emitida o pagada. Cancele la factura.' });
    }

    db.prepare('DELETE FROM invoices WHERE id = ?').run(req.params.id);

    logAudit(req.user.id, 'INVOICE_DELETED', 'invoices', req.params.id, invoice, null, req);

    res.json({ message: 'Factura eliminada correctamente' });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Error al eliminar factura' });
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

// ==================== GESTION DE METODOS DE PAGO ====================

router.get('/payment-methods', (req, res) => {
  try {
    const methods = db.prepare('SELECT * FROM payment_methods ORDER BY order_index ASC, created_at ASC').all();
    res.json(methods);
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Error al obtener metodos de pago' });
  }
});

router.post('/payment-methods', [
  body('code').trim().notEmpty().withMessage('El codigo es requerido'),
  body('name').trim().notEmpty().withMessage('El nombre es requerido'),
  body('description').optional().trim(),
  body('instructions').optional().trim(),
  body('icon').optional().trim(),
  body('is_active').optional().isBoolean(),
  body('order_index').optional().isInt()
], (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { code, name, description, instructions, icon, is_active, order_index } = req.body;

    const existing = db.prepare('SELECT id FROM payment_methods WHERE code = ?').get(code);
    if (existing) {
      return res.status(400).json({ error: 'Ya existe un metodo de pago con ese codigo' });
    }

    const id = generateId('pm');
    const maxOrder = db.prepare('SELECT MAX(order_index) as max FROM payment_methods').get().max || 0;

    db.prepare(`
      INSERT INTO payment_methods (id, code, name, description, instructions, icon, is_active, order_index)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, code, name, description || null, instructions || null, icon || null, 
           is_active !== undefined ? (is_active ? 1 : 0) : 1, order_index || maxOrder + 1);

    logAudit(req.user.id, 'PAYMENT_METHOD_CREATED', 'payment_methods', id, null, { code, name }, req);

    res.status(201).json({ id, message: 'Metodo de pago creado correctamente' });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Error al crear metodo de pago' });
  }
});

router.put('/payment-methods/:id', [
  body('code').optional().trim().notEmpty(),
  body('name').optional().trim().notEmpty(),
  body('description').optional().trim(),
  body('instructions').optional().trim(),
  body('icon').optional().trim(),
  body('is_active').optional().isBoolean(),
  body('order_index').optional().isInt()
], (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const method = db.prepare('SELECT * FROM payment_methods WHERE id = ?').get(req.params.id);
    if (!method) {
      return res.status(404).json({ error: 'Metodo de pago no encontrado' });
    }

    const { code, name, description, instructions, icon, is_active, order_index } = req.body;
    const oldData = { ...method };

    if (code && code !== method.code) {
      const existing = db.prepare('SELECT id FROM payment_methods WHERE code = ? AND id != ?').get(code, req.params.id);
      if (existing) {
        return res.status(400).json({ error: 'Ya existe otro metodo de pago con ese codigo' });
      }
    }

    const updates = [];
    const values = [];

    if (code !== undefined) { updates.push('code = ?'); values.push(code); }
    if (name !== undefined) { updates.push('name = ?'); values.push(name); }
    if (description !== undefined) { updates.push('description = ?'); values.push(description); }
    if (instructions !== undefined) { updates.push('instructions = ?'); values.push(instructions); }
    if (icon !== undefined) { updates.push('icon = ?'); values.push(icon); }
    if (is_active !== undefined) { updates.push('is_active = ?'); values.push(is_active ? 1 : 0); }
    if (order_index !== undefined) { updates.push('order_index = ?'); values.push(order_index); }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No hay datos para actualizar' });
    }

    updates.push('updated_at = CURRENT_TIMESTAMP');
    values.push(req.params.id);

    db.prepare(`UPDATE payment_methods SET ${updates.join(', ')} WHERE id = ?`).run(...values);

    logAudit(req.user.id, 'PAYMENT_METHOD_UPDATED', 'payment_methods', req.params.id, oldData, req.body, req);

    res.json({ message: 'Metodo de pago actualizado correctamente' });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Error al actualizar metodo de pago' });
  }
});

router.delete('/payment-methods/:id', (req, res) => {
  try {
    const method = db.prepare('SELECT * FROM payment_methods WHERE id = ?').get(req.params.id);
    if (!method) {
      return res.status(404).json({ error: 'Metodo de pago no encontrado' });
    }

    const paymentsUsing = db.prepare('SELECT COUNT(*) as count FROM payments WHERE payment_method = ?').get(method.code);
    if (paymentsUsing.count > 0) {
      return res.status(400).json({ 
        error: `No se puede eliminar. Hay ${paymentsUsing.count} pago(s) usando este metodo. Desactivelo en su lugar.` 
      });
    }

    db.prepare('DELETE FROM payment_methods WHERE id = ?').run(req.params.id);

    logAudit(req.user.id, 'PAYMENT_METHOD_DELETED', 'payment_methods', req.params.id, method, null, req);

    res.json({ message: 'Metodo de pago eliminado correctamente' });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Error al eliminar metodo de pago' });
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
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const message = db.prepare('SELECT * FROM contact_messages WHERE id = ?').get(req.params.id);
    if (!message) {
      return res.status(404).json({ error: 'Mensaje no encontrado' });
    }

    const emailResult = await sendContactResponseEmail({
      recipientEmail: message.email,
      recipientName: message.name,
      originalSubject: message.subject,
      originalMessage: message.message,
      adminResponse: req.body.response
    });

    if (!emailResult.success) {
      console.error('[ADMIN] Failed to send email:', emailResult.error);
      return res.status(500).json({ error: 'Error al enviar el correo: ' + emailResult.error });
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
      { status: 'responded', response_length: req.body.response.length, email_sent: true, email_to: message.email, ...clientInfo }, 
      req
    );

    res.json({ message: 'Respuesta enviada por correo electronico a ' + message.email });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Error al responder mensaje' });
  }
});

router.put('/contact-messages/:id', (req, res) => {
  try {
    const message = db.prepare('SELECT * FROM contact_messages WHERE id = ?').get(req.params.id);
    if (!message) {
      return res.status(404).json({ error: 'Mensaje no encontrado' });
    }

    const { status, category, priority, admin_notes, admin_response } = req.body;
    const updates = [];
    const values = [];

    if (status) { updates.push('status = ?'); values.push(status); }
    if (category !== undefined) { updates.push('category = ?'); values.push(category); }
    if (priority !== undefined) { updates.push('priority = ?'); values.push(priority); }
    if (admin_notes !== undefined) { updates.push('admin_notes = ?'); values.push(admin_notes); }
    if (admin_response !== undefined) { 
      updates.push('admin_response = ?'); 
      values.push(admin_response);
      if (admin_response && !message.responded_at) {
        updates.push('responded_at = CURRENT_TIMESTAMP');
        updates.push('responded_by = ?');
        values.push(req.user.id);
      }
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No hay cambios' });
    }

    values.push(req.params.id);
    db.prepare(`UPDATE contact_messages SET ${updates.join(', ')} WHERE id = ?`).run(...values);

    logAudit(req.user.id, 'ADMIN_MESSAGE_UPDATED', 'contact_messages', req.params.id, message, req.body, req);

    res.json({ message: 'Mensaje actualizado' });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Error al actualizar mensaje' });
  }
});

router.delete('/contact-messages/:id', (req, res) => {
  try {
    const message = db.prepare('SELECT * FROM contact_messages WHERE id = ?').get(req.params.id);
    if (!message) {
      return res.status(404).json({ error: 'Mensaje no encontrado' });
    }

    db.prepare('DELETE FROM contact_messages WHERE id = ?').run(req.params.id);

    logAudit(req.user.id, 'ADMIN_MESSAGE_DELETED', 'contact_messages', req.params.id, message, null, req);

    res.json({ message: 'Mensaje eliminado' });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Error al eliminar mensaje' });
  }
});

router.get('/export/:type', (req, res) => {
  try {
    let data;
    const { type } = req.params;
    const format = req.query.format || 'json';

    switch (type) {
      case 'users':
        data = db.prepare('SELECT id, email, role, person_type, first_name, last_name, company_name, ci, nit, phone, city, department, is_verified, is_active, is_blocked, created_at FROM users').all();
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
        data = db.prepare('SELECT * FROM audit_log ORDER BY created_at DESC LIMIT 5000').all();
        break;
      case 'notification_log':
        data = db.prepare('SELECT * FROM notification_log ORDER BY created_at DESC LIMIT 5000').all();
        break;
      case 'legal_texts':
        data = db.prepare('SELECT * FROM legal_texts ORDER BY created_at DESC').all();
        break;
      default:
        return res.status(400).json({ error: 'Tipo de exportacion no valido' });
    }

    const clientInfo = getClientInfo(req);
    logAudit(req.user.id, 'ADMIN_EXPORT_DATA', 'system', null, null, {
      export_type: type,
      format: format,
      records_count: data.length,
      ...clientInfo
    }, req);

    if (format === 'excel') {
      const ExcelJS = require('exceljs');
      const workbook = new ExcelJS.Workbook();
      workbook.creator = 'Almacenes Galpones Espacios Libres';
      workbook.created = new Date();
      
      const worksheet = workbook.addWorksheet(type.charAt(0).toUpperCase() + type.slice(1));
      
      if (data.length > 0) {
        const columns = Object.keys(data[0]);
        worksheet.columns = columns.map(col => ({ header: col.toUpperCase(), key: col, width: 20 }));
        worksheet.getRow(1).font = { bold: true };
        worksheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4472C4' } };
        worksheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
        data.forEach(row => worksheet.addRow(row));
      }
      
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename=export_${type}_${new Date().toISOString().split('T')[0]}.xlsx`);
      
      return workbook.xlsx.write(res).then(() => res.end());
    }

    if (format === 'pdf') {
      const PDFDocument = require('pdfkit');
      const doc = new PDFDocument({ margin: 40, size: 'A4', layout: 'landscape' });
      
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename=export_${type}_${new Date().toISOString().split('T')[0]}.pdf`);
      doc.pipe(res);
      
      doc.fontSize(18).text(`Exportacion: ${type.toUpperCase()}`, { align: 'center' });
      doc.fontSize(10).text(`Generado: ${new Date().toLocaleString('es-BO')}`, { align: 'center' });
      doc.moveDown();
      doc.fontSize(10).text(`Total de registros: ${data.length}`, { align: 'center' });
      doc.moveDown(2);
      
      if (data.length > 0) {
        const columns = Object.keys(data[0]).slice(0, 6);
        const colWidth = 120;
        let yPos = doc.y;
        
        doc.fontSize(8).font('Helvetica-Bold');
        columns.forEach((col, i) => {
          doc.text(col.toUpperCase().substring(0, 15), 40 + (i * colWidth), yPos, { width: colWidth - 5 });
        });
        doc.moveDown();
        
        doc.font('Helvetica').fontSize(7);
        const maxRows = Math.min(data.length, 50);
        for (let r = 0; r < maxRows; r++) {
          yPos = doc.y;
          if (yPos > 500) {
            doc.addPage();
            yPos = 40;
          }
          columns.forEach((col, i) => {
            const val = String(data[r][col] || '').substring(0, 20);
            doc.text(val, 40 + (i * colWidth), yPos, { width: colWidth - 5 });
          });
          doc.moveDown(0.5);
        }
        
        if (data.length > 50) {
          doc.moveDown();
          doc.fontSize(8).text(`... y ${data.length - 50} registros mas. Use formato Excel para ver todos los datos.`, { align: 'center' });
        }
      }
      
      doc.end();
      return;
    }

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
  body('category').optional().trim(),
  body('effective_date').optional().isISO8601()
], (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { type, title, content, version, category, effective_date } = req.body;
    const id = `legal_${type}_v${version.replace(/\./g, '_')}_${Date.now()}`;
    const clientInfo = getClientInfo(req);

    db.prepare(`
      INSERT INTO legal_texts (id, type, title, content, version, category, is_active, effective_date, created_by)
      VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?)
    `).run(id, type, title, content, version, category || 'legal', effective_date || null, req.user.id);

    logAudit(req.user.id, 'LEGAL_TEXT_CREATED', 'legal_texts', id, null, {
      type, title, version, category, effective_date, ...clientInfo
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

router.delete('/legal-texts/:id', (req, res) => {
  try {
    const text = db.prepare('SELECT * FROM legal_texts WHERE id = ?').get(req.params.id);
    if (!text) {
      return res.status(404).json({ error: 'Texto legal no encontrado' });
    }

    if (text.is_active) {
      return res.status(400).json({ error: 'No se puede eliminar texto legal activo. Desactivelo primero.' });
    }

    db.prepare('DELETE FROM legal_texts WHERE id = ?').run(req.params.id);

    logAudit(req.user.id, 'LEGAL_TEXT_DELETED', 'legal_texts', req.params.id, text, null, req);

    res.json({ message: 'Texto legal eliminado correctamente' });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Error al eliminar texto legal' });
  }
});

router.get('/legal-categories', (req, res) => {
  try {
    const categories = db.prepare('SELECT * FROM legal_categories ORDER BY label').all();
    res.json(categories);
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Error al obtener categorias' });
  }
});

router.post('/legal-categories', [
  body('key').notEmpty().trim().matches(/^[a-z_]+$/),
  body('label').notEmpty().trim()
], (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const existing = db.prepare('SELECT id FROM legal_categories WHERE key = ?').get(req.body.key);
    if (existing) {
      return res.status(400).json({ error: 'Ya existe una categoria con esa clave' });
    }

    const id = `cat_${req.body.key}`;
    db.prepare('INSERT INTO legal_categories (id, key, label, is_system) VALUES (?, ?, ?, 0)').run(id, req.body.key, req.body.label);

    logAudit(req.user.id, 'LEGAL_CATEGORY_CREATED', 'legal_categories', id, null, req.body, req);

    res.json({ message: 'Categoria creada', id });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Error al crear categoria' });
  }
});

router.put('/legal-categories/:id', [
  body('label').notEmpty().trim()
], (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const category = db.prepare('SELECT * FROM legal_categories WHERE id = ?').get(req.params.id);
    if (!category) {
      return res.status(404).json({ error: 'Categoria no encontrada' });
    }

    db.prepare('UPDATE legal_categories SET label = ? WHERE id = ?').run(req.body.label, req.params.id);

    logAudit(req.user.id, 'LEGAL_CATEGORY_UPDATED', 'legal_categories', req.params.id, category, req.body, req);

    res.json({ message: 'Categoria actualizada' });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Error al actualizar categoria' });
  }
});

router.delete('/legal-categories/:id', (req, res) => {
  try {
    const category = db.prepare('SELECT * FROM legal_categories WHERE id = ?').get(req.params.id);
    if (!category) {
      return res.status(404).json({ error: 'Categoria no encontrada' });
    }

    if (category.is_system) {
      return res.status(400).json({ error: 'No se puede eliminar categoria del sistema' });
    }

    const textsUsingCategory = db.prepare('SELECT COUNT(*) as count FROM legal_texts WHERE category = ?').get(category.key);
    if (textsUsingCategory && textsUsingCategory.count > 0) {
      return res.status(400).json({ error: 'No se puede eliminar categoria con textos asociados' });
    }

    db.prepare('DELETE FROM legal_categories WHERE id = ?').run(req.params.id);

    logAudit(req.user.id, 'LEGAL_CATEGORY_DELETED', 'legal_categories', req.params.id, category, null, req);

    res.json({ message: 'Categoria eliminada' });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Error al eliminar categoria' });
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

router.delete('/notification-templates/:id', (req, res) => {
  try {
    const template = db.prepare('SELECT * FROM notification_templates WHERE id = ?').get(req.params.id);
    if (!template) {
      return res.status(404).json({ error: 'Plantilla no encontrada' });
    }

    if (template.is_active) {
      return res.status(400).json({ error: 'No se puede eliminar una plantilla activa. Desactivela primero.' });
    }

    db.prepare('DELETE FROM notification_templates WHERE id = ?').run(req.params.id);

    logAudit(req.user.id, 'NOTIFICATION_TEMPLATE_DELETED', 'notification_templates', req.params.id, template, null, req);

    res.json({ message: 'Plantilla eliminada' });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Error al eliminar plantilla' });
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

router.delete('/notification-log/:id', (req, res) => {
  try {
    const log = db.prepare('SELECT * FROM notification_log WHERE id = ?').get(req.params.id);
    if (!log) {
      return res.status(404).json({ error: 'Registro no encontrado' });
    }

    db.prepare('DELETE FROM notification_log WHERE id = ?').run(req.params.id);

    logAudit(req.user.id, 'NOTIFICATION_LOG_DELETED', 'notification_log', req.params.id, log, null, req);

    res.json({ message: 'Registro eliminado' });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Error al eliminar registro' });
  }
});

// =====================================================
// CONTABILIDAD PROFESIONAL BOLIVIANA
// =====================================================

// Constantes fiscales bolivianas
const TAX_RATES = {
  IVA: 0.13,      // 13% IVA
  IT: 0.03,       // 3% Impuesto a las Transacciones
  IUE: 0.25,      // 25% Impuesto sobre Utilidades
  RC_IVA: 0.13    // 13% RC-IVA
};

// Dashboard de contabilidad - Resumen general
router.get('/accounting/dashboard', (req, res) => {
  try {
    const { year, month } = req.query;
    const currentYear = year || new Date().getFullYear();
    const currentMonth = month || new Date().getMonth() + 1;

    // Capital total (suma de aportes de socios)
    const capitalTotal = db.prepare(`
      SELECT COALESCE(SUM(capital_contributed), 0) as total FROM shareholders WHERE status = 'active'
    `).get();

    // Ingresos del período (comisiones de la plataforma)
    const incomePeriod = db.prepare(`
      SELECT 
        COALESCE(SUM(commission_amount), 0) as total,
        COUNT(*) as count
      FROM invoices 
      WHERE strftime('%Y', created_at) = ? AND strftime('%m', created_at) = ?
    `).get(String(currentYear), String(currentMonth).padStart(2, '0'));

    // Ingresos por día (últimos 30 días)
    const dailyIncome = db.prepare(`
      SELECT 
        date(created_at) as date,
        SUM(commission_amount) as total,
        COUNT(*) as count
      FROM invoices 
      WHERE created_at >= date('now', '-30 days')
      GROUP BY date(created_at)
      ORDER BY date DESC
    `).all();

    // Ingresos mensuales del año
    const monthlyIncome = db.prepare(`
      SELECT 
        strftime('%m', created_at) as month,
        SUM(commission_amount) as total,
        COUNT(*) as count
      FROM invoices 
      WHERE strftime('%Y', created_at) = ?
      GROUP BY strftime('%m', created_at)
      ORDER BY month
    `).all(String(currentYear));

    // Ingresos trimestrales
    const quarterlyIncome = db.prepare(`
      SELECT 
        CASE 
          WHEN CAST(strftime('%m', created_at) AS INTEGER) <= 3 THEN 1
          WHEN CAST(strftime('%m', created_at) AS INTEGER) <= 6 THEN 2
          WHEN CAST(strftime('%m', created_at) AS INTEGER) <= 9 THEN 3
          ELSE 4
        END as quarter,
        SUM(commission_amount) as total,
        COUNT(*) as count
      FROM invoices 
      WHERE strftime('%Y', created_at) = ?
      GROUP BY quarter
      ORDER BY quarter
    `).all(String(currentYear));

    // Ingresos anuales (últimos 5 años)
    const annualIncome = db.prepare(`
      SELECT 
        strftime('%Y', created_at) as year,
        SUM(commission_amount) as total,
        COUNT(*) as count
      FROM invoices 
      GROUP BY strftime('%Y', created_at)
      ORDER BY year DESC
      LIMIT 5
    `).all();

    // Cálculo de IVA del mes (13% sobre ingresos)
    const ivaMonth = db.prepare(`
      SELECT 
        COALESCE(SUM(commission_amount), 0) as taxable_base,
        COALESCE(SUM(commission_amount * 0.13), 0) as iva_debito
      FROM invoices 
      WHERE strftime('%Y', created_at) = ? AND strftime('%m', created_at) = ?
    `).get(String(currentYear), String(currentMonth).padStart(2, '0'));

    // Cálculo de IT del mes (3% sobre transacciones brutas)
    const itMonth = db.prepare(`
      SELECT 
        COALESCE(SUM(total_amount), 0) as transaction_base,
        COALESCE(SUM(total_amount * 0.03), 0) as it_due
      FROM invoices 
      WHERE strftime('%Y', created_at) = ? AND strftime('%m', created_at) = ?
    `).get(String(currentYear), String(currentMonth).padStart(2, '0'));

    // Resumen de impuestos por trimestre
    const taxesByQuarter = db.prepare(`
      SELECT 
        CASE 
          WHEN CAST(strftime('%m', created_at) AS INTEGER) <= 3 THEN 1
          WHEN CAST(strftime('%m', created_at) AS INTEGER) <= 6 THEN 2
          WHEN CAST(strftime('%m', created_at) AS INTEGER) <= 9 THEN 3
          ELSE 4
        END as quarter,
        SUM(commission_amount * 0.13) as iva_total,
        SUM(total_amount * 0.03) as it_total
      FROM invoices 
      WHERE strftime('%Y', created_at) = ?
      GROUP BY quarter
    `).all(String(currentYear));

    // Resumen de impuestos semestral
    const taxesBySemester = db.prepare(`
      SELECT 
        CASE WHEN CAST(strftime('%m', created_at) AS INTEGER) <= 6 THEN 1 ELSE 2 END as semester,
        SUM(commission_amount * 0.13) as iva_total,
        SUM(total_amount * 0.03) as it_total
      FROM invoices 
      WHERE strftime('%Y', created_at) = ?
      GROUP BY semester
    `).all(String(currentYear));

    // Resumen anual de impuestos
    const taxesAnnual = db.prepare(`
      SELECT 
        SUM(commission_amount * 0.13) as iva_total,
        SUM(total_amount * 0.03) as it_total,
        SUM(commission_amount) as total_income
      FROM invoices 
      WHERE strftime('%Y', created_at) = ?
    `).get(String(currentYear));

    // Dividendos pagados
    const dividendsPaid = db.prepare(`
      SELECT COALESCE(SUM(total_distributed), 0) as total FROM dividend_distributions WHERE status = 'paid'
    `).get();

    // Socios activos
    const shareholders = db.prepare(`SELECT COUNT(*) as count FROM shareholders WHERE status = 'active'`).get();

    res.json({
      capital: {
        total: capitalTotal.total,
        shareholders_count: shareholders.count
      },
      income: {
        current_month: incomePeriod,
        daily: dailyIncome,
        monthly: monthlyIncome,
        quarterly: quarterlyIncome,
        annual: annualIncome
      },
      taxes: {
        current_month: {
          iva: { taxable_base: ivaMonth.taxable_base, amount: ivaMonth.iva_debito, rate: TAX_RATES.IVA },
          it: { transaction_base: itMonth.transaction_base, amount: itMonth.it_due, rate: TAX_RATES.IT }
        },
        quarterly: taxesByQuarter,
        semester: taxesBySemester,
        annual: taxesAnnual
      },
      dividends: {
        total_paid: dividendsPaid.total
      },
      tax_rates: TAX_RATES
    });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Error al obtener dashboard de contabilidad' });
  }
});

// Asientos contables - CRUD
router.get('/accounting/entries', (req, res) => {
  try {
    const { from_date, to_date, entry_type, limit = 100 } = req.query;
    let query = 'SELECT * FROM accounting_entries WHERE 1=1';
    const params = [];

    if (from_date) { query += ' AND entry_date >= ?'; params.push(from_date); }
    if (to_date) { query += ' AND entry_date <= ?'; params.push(to_date); }
    if (entry_type) { query += ' AND entry_type = ?'; params.push(entry_type); }

    query += ' ORDER BY entry_date DESC, entry_number DESC LIMIT ?';
    params.push(parseInt(limit));

    const entries = db.prepare(query).all(...params);
    res.json({ entries, total: entries.length });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Error al obtener asientos contables' });
  }
});

router.post('/accounting/entries', [
  body('entry_date').notEmpty(),
  body('description').notEmpty(),
  body('entry_type').isIn(['income', 'expense', 'transfer', 'tax', 'dividend', 'capital', 'adjustment']),
  body('debit_account').notEmpty(),
  body('credit_account').notEmpty(),
  body('amount').isFloat({ min: 0.01 })
], (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { entry_date, description, entry_type, debit_account, credit_account, amount, taxable_base, reference_type, reference_id, notes } = req.body;
    const id = `entry_${Date.now()}`;
    
    const lastEntry = db.prepare('SELECT MAX(entry_number) as last FROM accounting_entries WHERE strftime("%Y", entry_date) = strftime("%Y", ?)').get(entry_date);
    const entry_number = (lastEntry?.last || 0) + 1;

    const iva_amount = (taxable_base || amount) * TAX_RATES.IVA;
    const it_amount = amount * TAX_RATES.IT;

    db.prepare(`
      INSERT INTO accounting_entries (id, entry_date, entry_number, description, entry_type, debit_account, credit_account, amount, taxable_base, iva_amount, it_amount, reference_type, reference_id, notes, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, entry_date, entry_number, description, entry_type, debit_account, credit_account, amount, taxable_base || amount, iva_amount, it_amount, reference_type || null, reference_id || null, notes || null, req.user.id);

    logAudit(req.user.id, 'ACCOUNTING_ENTRY_CREATED', 'accounting_entries', id, null, req.body, req);
    res.status(201).json({ id, entry_number, message: 'Asiento creado exitosamente' });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Error al crear asiento contable' });
  }
});

router.put('/accounting/entries/:id', (req, res) => {
  try {
    const entry = db.prepare('SELECT * FROM accounting_entries WHERE id = ?').get(req.params.id);
    if (!entry) return res.status(404).json({ error: 'Asiento no encontrado' });
    if (entry.is_reconciled) return res.status(400).json({ error: 'No se puede editar un asiento conciliado' });

    const { description, amount, notes } = req.body;
    const updates = [];
    const params = [];

    if (description) { updates.push('description = ?'); params.push(description); }
    if (amount) { 
      updates.push('amount = ?', 'iva_amount = ?', 'it_amount = ?'); 
      params.push(amount, amount * TAX_RATES.IVA, amount * TAX_RATES.IT); 
    }
    if (notes !== undefined) { updates.push('notes = ?'); params.push(notes); }

    if (updates.length === 0) return res.status(400).json({ error: 'No hay cambios' });

    updates.push('updated_at = CURRENT_TIMESTAMP');
    params.push(req.params.id);

    db.prepare(`UPDATE accounting_entries SET ${updates.join(', ')} WHERE id = ?`).run(...params);
    logAudit(req.user.id, 'ACCOUNTING_ENTRY_UPDATED', 'accounting_entries', req.params.id, entry, req.body, req);
    res.json({ message: 'Asiento actualizado' });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Error al actualizar asiento' });
  }
});

router.delete('/accounting/entries/:id', (req, res) => {
  try {
    const entry = db.prepare('SELECT * FROM accounting_entries WHERE id = ?').get(req.params.id);
    if (!entry) return res.status(404).json({ error: 'Asiento no encontrado' });
    if (entry.is_reconciled) return res.status(400).json({ error: 'No se puede eliminar un asiento conciliado' });

    db.prepare('DELETE FROM accounting_entries WHERE id = ?').run(req.params.id);
    logAudit(req.user.id, 'ACCOUNTING_ENTRY_DELETED', 'accounting_entries', req.params.id, entry, null, req);
    res.json({ message: 'Asiento eliminado' });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Error al eliminar asiento' });
  }
});

// Períodos fiscales
router.get('/accounting/tax-periods', (req, res) => {
  try {
    const { year, tax_type, status } = req.query;
    let query = 'SELECT * FROM tax_periods WHERE 1=1';
    const params = [];

    if (year) { query += ' AND year = ?'; params.push(parseInt(year)); }
    if (tax_type) { query += ' AND tax_type = ?'; params.push(tax_type); }
    if (status) { query += ' AND status = ?'; params.push(status); }

    query += ' ORDER BY year DESC, month DESC';
    const periods = db.prepare(query).all(...params);
    res.json({ periods });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Error al obtener períodos fiscales' });
  }
});

router.post('/accounting/tax-periods', [
  body('tax_type').isIn(['IVA', 'IT', 'IUE', 'RC-IVA']),
  body('year').isInt({ min: 2020 }),
  body('month').optional().isInt({ min: 1, max: 12 })
], (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { tax_type, year, month, quarter, semester } = req.body;
    const id = `tax_${tax_type}_${year}_${month || quarter || semester || 'annual'}_${Date.now()}`;
    
    let period_type = 'annual';
    let start_date, end_date, due_date;

    if (month) {
      period_type = 'monthly';
      start_date = `${year}-${String(month).padStart(2, '0')}-01`;
      end_date = new Date(year, month, 0).toISOString().split('T')[0];
      due_date = `${year}-${String(month + 1 > 12 ? 1 : month + 1).padStart(2, '0')}-15`;
    } else if (quarter) {
      period_type = 'quarterly';
      const startMonth = (quarter - 1) * 3 + 1;
      start_date = `${year}-${String(startMonth).padStart(2, '0')}-01`;
      end_date = new Date(year, startMonth + 2, 0).toISOString().split('T')[0];
      due_date = `${year}-${String(startMonth + 3 > 12 ? startMonth + 3 - 12 : startMonth + 3).padStart(2, '0')}-15`;
    } else {
      start_date = `${year}-01-01`;
      end_date = `${year}-12-31`;
      due_date = `${year + 1}-04-30`;
    }

    const tax_rate = TAX_RATES[tax_type] || 0.13;

    db.prepare(`
      INSERT INTO tax_periods (id, period_type, tax_type, year, month, quarter, semester, start_date, end_date, tax_rate, due_date)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, period_type, tax_type, year, month || null, quarter || null, semester || null, start_date, end_date, tax_rate, due_date);

    logAudit(req.user.id, 'TAX_PERIOD_CREATED', 'tax_periods', id, null, req.body, req);
    res.status(201).json({ id, message: 'Período fiscal creado' });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Error al crear período fiscal' });
  }
});

router.put('/accounting/tax-periods/:id', (req, res) => {
  try {
    const period = db.prepare('SELECT * FROM tax_periods WHERE id = ?').get(req.params.id);
    if (!period) return res.status(404).json({ error: 'Período no encontrado' });

    const { status, taxable_base, tax_credits, declaration_number, declaration_date, notes } = req.body;
    const updates = [];
    const params = [];

    if (status) { updates.push('status = ?'); params.push(status); }
    if (taxable_base !== undefined) { 
      updates.push('taxable_base = ?', 'tax_calculated = ?', 'tax_due = ?'); 
      const taxCalc = taxable_base * period.tax_rate;
      const taxDue = taxCalc - (tax_credits || period.tax_credits || 0);
      params.push(taxable_base, taxCalc, taxDue); 
    }
    if (tax_credits !== undefined) { updates.push('tax_credits = ?'); params.push(tax_credits); }
    if (declaration_number) { updates.push('declaration_number = ?'); params.push(declaration_number); }
    if (declaration_date) { updates.push('declaration_date = ?'); params.push(declaration_date); }
    if (notes !== undefined) { updates.push('notes = ?'); params.push(notes); }

    if (updates.length === 0) return res.status(400).json({ error: 'No hay cambios' });

    updates.push('updated_at = CURRENT_TIMESTAMP');
    params.push(req.params.id);

    db.prepare(`UPDATE tax_periods SET ${updates.join(', ')} WHERE id = ?`).run(...params);
    logAudit(req.user.id, 'TAX_PERIOD_UPDATED', 'tax_periods', req.params.id, period, req.body, req);
    res.json({ message: 'Período actualizado' });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Error al actualizar período' });
  }
});

router.delete('/accounting/tax-periods/:id', (req, res) => {
  try {
    const period = db.prepare('SELECT * FROM tax_periods WHERE id = ?').get(req.params.id);
    if (!period) return res.status(404).json({ error: 'Período no encontrado' });
    if (period.status === 'paid' || period.status === 'closed') {
      return res.status(400).json({ error: 'No se puede eliminar un período pagado o cerrado' });
    }

    db.prepare('DELETE FROM tax_periods WHERE id = ?').run(req.params.id);
    logAudit(req.user.id, 'TAX_PERIOD_DELETED', 'tax_periods', req.params.id, period, null, req);
    res.json({ message: 'Período eliminado' });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Error al eliminar período' });
  }
});

// Pagos de impuestos
router.get('/accounting/tax-payments', (req, res) => {
  try {
    const payments = db.prepare(`
      SELECT tp.*, per.tax_type, per.year, per.month, per.period_type
      FROM tax_payments tp
      LEFT JOIN tax_periods per ON tp.tax_period_id = per.id
      ORDER BY tp.payment_date DESC
    `).all();
    res.json({ payments });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Error al obtener pagos de impuestos' });
  }
});

router.post('/accounting/tax-payments', [
  body('tax_period_id').notEmpty(),
  body('payment_date').notEmpty(),
  body('amount').isFloat({ min: 0.01 })
], (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { tax_period_id, payment_date, amount, payment_method, bank_name, transaction_number, voucher_number, notes } = req.body;
    const id = `taxpay_${Date.now()}`;

    db.prepare(`
      INSERT INTO tax_payments (id, tax_period_id, payment_date, amount, payment_method, bank_name, transaction_number, voucher_number, notes, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, tax_period_id, payment_date, amount, payment_method || null, bank_name || null, transaction_number || null, voucher_number || null, notes || null, req.user.id);

    // Actualizar el período con el pago
    db.prepare('UPDATE tax_periods SET tax_paid = tax_paid + ?, status = CASE WHEN tax_paid + ? >= tax_due THEN "paid" ELSE status END WHERE id = ?')
      .run(amount, amount, tax_period_id);

    logAudit(req.user.id, 'TAX_PAYMENT_CREATED', 'tax_payments', id, null, req.body, req);
    res.status(201).json({ id, message: 'Pago registrado' });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Error al registrar pago' });
  }
});

router.delete('/accounting/tax-payments/:id', (req, res) => {
  try {
    const payment = db.prepare('SELECT * FROM tax_payments WHERE id = ?').get(req.params.id);
    if (!payment) return res.status(404).json({ error: 'Pago no encontrado' });

    db.prepare('UPDATE tax_periods SET tax_paid = tax_paid - ? WHERE id = ?').run(payment.amount, payment.tax_period_id);
    db.prepare('DELETE FROM tax_payments WHERE id = ?').run(req.params.id);
    logAudit(req.user.id, 'TAX_PAYMENT_DELETED', 'tax_payments', req.params.id, payment, null, req);
    res.json({ message: 'Pago eliminado' });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Error al eliminar pago' });
  }
});

// Socios/Accionistas
router.get('/accounting/shareholders', (req, res) => {
  try {
    const shareholders = db.prepare('SELECT * FROM shareholders ORDER BY share_percentage DESC').all();
    res.json({ shareholders });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Error al obtener socios' });
  }
});

router.post('/accounting/shareholders', [
  body('name').notEmpty(),
  body('share_percentage').isFloat({ min: 0, max: 100 })
], (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { name, document_type, document_number, email, phone, share_percentage, capital_contributed } = req.body;
    const id = `shareholder_${Date.now()}`;

    db.prepare(`
      INSERT INTO shareholders (id, name, document_type, document_number, email, phone, share_percentage, capital_contributed)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, name, document_type || null, document_number || null, email || null, phone || null, share_percentage, capital_contributed || 0);

    logAudit(req.user.id, 'SHAREHOLDER_CREATED', 'shareholders', id, null, req.body, req);
    res.status(201).json({ id, message: 'Socio registrado' });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Error al registrar socio' });
  }
});

router.put('/accounting/shareholders/:id', (req, res) => {
  try {
    const shareholder = db.prepare('SELECT * FROM shareholders WHERE id = ?').get(req.params.id);
    if (!shareholder) return res.status(404).json({ error: 'Socio no encontrado' });

    const { name, document_type, document_number, email, phone, share_percentage, capital_contributed, status } = req.body;
    const updates = [];
    const params = [];

    if (name) { updates.push('name = ?'); params.push(name); }
    if (document_type) { updates.push('document_type = ?'); params.push(document_type); }
    if (document_number) { updates.push('document_number = ?'); params.push(document_number); }
    if (email !== undefined) { updates.push('email = ?'); params.push(email); }
    if (phone !== undefined) { updates.push('phone = ?'); params.push(phone); }
    if (share_percentage !== undefined) { updates.push('share_percentage = ?'); params.push(share_percentage); }
    if (capital_contributed !== undefined) { updates.push('capital_contributed = ?'); params.push(capital_contributed); }
    if (status) { updates.push('status = ?'); params.push(status); }

    if (updates.length === 0) return res.status(400).json({ error: 'No hay cambios' });

    updates.push('updated_at = CURRENT_TIMESTAMP');
    params.push(req.params.id);

    db.prepare(`UPDATE shareholders SET ${updates.join(', ')} WHERE id = ?`).run(...params);
    logAudit(req.user.id, 'SHAREHOLDER_UPDATED', 'shareholders', req.params.id, shareholder, req.body, req);
    res.json({ message: 'Socio actualizado' });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Error al actualizar socio' });
  }
});

router.delete('/accounting/shareholders/:id', (req, res) => {
  try {
    const shareholder = db.prepare('SELECT * FROM shareholders WHERE id = ?').get(req.params.id);
    if (!shareholder) return res.status(404).json({ error: 'Socio no encontrado' });

    const hasDividends = db.prepare('SELECT COUNT(*) as count FROM dividend_details WHERE shareholder_id = ?').get(req.params.id);
    if (hasDividends.count > 0) {
      return res.status(400).json({ error: 'No se puede eliminar socio con dividendos registrados. Desactive en su lugar.' });
    }

    db.prepare('DELETE FROM shareholders WHERE id = ?').run(req.params.id);
    logAudit(req.user.id, 'SHAREHOLDER_DELETED', 'shareholders', req.params.id, shareholder, null, req);
    res.json({ message: 'Socio eliminado' });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Error al eliminar socio' });
  }
});

// Dividendos
router.get('/accounting/dividends', (req, res) => {
  try {
    const distributions = db.prepare('SELECT * FROM dividend_distributions ORDER BY fiscal_year DESC, distribution_date DESC').all();
    res.json({ distributions });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Error al obtener dividendos' });
  }
});

router.post('/accounting/dividends', [
  body('fiscal_year').isInt({ min: 2020 }),
  body('total_profit').isFloat({ min: 0 }),
  body('distributable_profit').isFloat({ min: 0 })
], (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { fiscal_year, total_profit, legal_reserve, distributable_profit, notes } = req.body;
    const id = `dividend_${fiscal_year}_${Date.now()}`;
    const distribution_date = new Date().toISOString().split('T')[0];

    // Calcular reserva legal (5% mínimo según ley boliviana)
    const reserve = legal_reserve || (total_profit * 0.05);
    const distributable = distributable_profit || (total_profit - reserve);

    db.prepare(`
      INSERT INTO dividend_distributions (id, distribution_date, fiscal_year, total_profit, legal_reserve, distributable_profit, total_distributed, status, notes)
      VALUES (?, ?, ?, ?, ?, ?, 0, 'pending', ?)
    `).run(id, distribution_date, fiscal_year, total_profit, reserve, distributable, notes || null);

    // Crear detalle para cada socio activo
    const shareholders = db.prepare('SELECT * FROM shareholders WHERE status = "active"').all();
    for (const sh of shareholders) {
      const gross = distributable * (sh.share_percentage / 100);
      const withholding = gross * 0.125; // 12.5% retención RC-IVA
      const net = gross - withholding;
      const detailId = `divdet_${id}_${sh.id}`;

      db.prepare(`
        INSERT INTO dividend_details (id, distribution_id, shareholder_id, share_percentage, gross_amount, withholding_tax, net_amount)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(detailId, id, sh.id, sh.share_percentage, gross, withholding, net);
    }

    logAudit(req.user.id, 'DIVIDEND_DISTRIBUTION_CREATED', 'dividend_distributions', id, null, req.body, req);
    res.status(201).json({ id, message: 'Distribución de dividendos creada' });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Error al crear distribución' });
  }
});

router.get('/accounting/dividends/:id/details', (req, res) => {
  try {
    const details = db.prepare(`
      SELECT dd.*, s.name as shareholder_name, s.email as shareholder_email
      FROM dividend_details dd
      LEFT JOIN shareholders s ON dd.shareholder_id = s.id
      WHERE dd.distribution_id = ?
    `).all(req.params.id);
    res.json({ details });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Error al obtener detalles' });
  }
});

router.put('/accounting/dividends/:id', (req, res) => {
  try {
    const distribution = db.prepare('SELECT * FROM dividend_distributions WHERE id = ?').get(req.params.id);
    if (!distribution) return res.status(404).json({ error: 'Distribución no encontrada' });

    const { status, notes } = req.body;
    const updates = [];
    const params = [];

    if (status) { 
      updates.push('status = ?'); 
      params.push(status);
      if (status === 'approved') {
        updates.push('approved_by = ?', 'approved_at = CURRENT_TIMESTAMP');
        params.push(req.user.id);
      }
    }
    if (notes !== undefined) { updates.push('notes = ?'); params.push(notes); }

    if (updates.length === 0) return res.status(400).json({ error: 'No hay cambios' });

    updates.push('updated_at = CURRENT_TIMESTAMP');
    params.push(req.params.id);

    db.prepare(`UPDATE dividend_distributions SET ${updates.join(', ')} WHERE id = ?`).run(...params);
    logAudit(req.user.id, 'DIVIDEND_DISTRIBUTION_UPDATED', 'dividend_distributions', req.params.id, distribution, req.body, req);
    res.json({ message: 'Distribución actualizada' });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Error al actualizar distribución' });
  }
});

router.delete('/accounting/dividends/:id', (req, res) => {
  try {
    const distribution = db.prepare('SELECT * FROM dividend_distributions WHERE id = ?').get(req.params.id);
    if (!distribution) return res.status(404).json({ error: 'Distribución no encontrada' });
    if (distribution.status === 'paid') return res.status(400).json({ error: 'No se puede eliminar una distribución pagada' });

    db.prepare('DELETE FROM dividend_details WHERE distribution_id = ?').run(req.params.id);
    db.prepare('DELETE FROM dividend_distributions WHERE id = ?').run(req.params.id);
    logAudit(req.user.id, 'DIVIDEND_DISTRIBUTION_DELETED', 'dividend_distributions', req.params.id, distribution, null, req);
    res.json({ message: 'Distribución eliminada' });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Error al eliminar distribución' });
  }
});

// Capital
router.get('/accounting/capital', (req, res) => {
  try {
    const transactions = db.prepare('SELECT ct.*, s.name as shareholder_name FROM capital_transactions ct LEFT JOIN shareholders s ON ct.shareholder_id = s.id ORDER BY ct.transaction_date DESC').all();
    const totalCapital = db.prepare("SELECT COALESCE(SUM(capital_contributed), 0) as total FROM shareholders WHERE status = 'active'").get();
    res.json({ transactions, total_capital: totalCapital.total });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Error al obtener movimientos de capital' });
  }
});

router.post('/accounting/capital', [
  body('transaction_type').isIn(['aporte', 'retiro', 'aumento', 'reduccion', 'reserva']),
  body('amount').isFloat({ min: 0.01 })
], (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { transaction_date, transaction_type, shareholder_id, amount, description, document_reference } = req.body;
    const id = `capital_${Date.now()}`;

    const currentTotal = db.prepare("SELECT COALESCE(SUM(capital_contributed), 0) as total FROM shareholders WHERE status = 'active'").get();
    const balance_after = transaction_type === 'aporte' || transaction_type === 'aumento' 
      ? currentTotal.total + amount 
      : currentTotal.total - amount;

    db.prepare(`
      INSERT INTO capital_transactions (id, transaction_date, transaction_type, shareholder_id, amount, description, document_reference, balance_after, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, transaction_date || new Date().toISOString().split('T')[0], transaction_type, shareholder_id || null, amount, description || null, document_reference || null, balance_after, req.user.id);

    // Actualizar capital del socio si aplica
    if (shareholder_id && (transaction_type === 'aporte' || transaction_type === 'retiro')) {
      const multiplier = transaction_type === 'aporte' ? 1 : -1;
      db.prepare('UPDATE shareholders SET capital_contributed = capital_contributed + ? WHERE id = ?').run(amount * multiplier, shareholder_id);
    }

    logAudit(req.user.id, 'CAPITAL_TRANSACTION_CREATED', 'capital_transactions', id, null, req.body, req);
    res.status(201).json({ id, balance_after, message: 'Movimiento registrado' });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Error al registrar movimiento' });
  }
});

router.delete('/accounting/capital/:id', (req, res) => {
  try {
    const transaction = db.prepare('SELECT * FROM capital_transactions WHERE id = ?').get(req.params.id);
    if (!transaction) return res.status(404).json({ error: 'Movimiento no encontrado' });

    // Revertir el movimiento en el socio
    if (transaction.shareholder_id && (transaction.transaction_type === 'aporte' || transaction.transaction_type === 'retiro')) {
      const multiplier = transaction.transaction_type === 'aporte' ? -1 : 1;
      db.prepare('UPDATE shareholders SET capital_contributed = capital_contributed + ? WHERE id = ?').run(transaction.amount * multiplier, transaction.shareholder_id);
    }

    db.prepare('DELETE FROM capital_transactions WHERE id = ?').run(req.params.id);
    logAudit(req.user.id, 'CAPITAL_TRANSACTION_DELETED', 'capital_transactions', req.params.id, transaction, null, req);
    res.json({ message: 'Movimiento eliminado' });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Error al eliminar movimiento' });
  }
});

// Plan de cuentas
router.get('/accounting/chart-of-accounts', (req, res) => {
  try {
    const accounts = db.prepare('SELECT * FROM chart_of_accounts ORDER BY code').all();
    res.json({ accounts });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Error al obtener plan de cuentas' });
  }
});

// ============================================
// #7: ROLES Y PERMISOS DE ADMINISTRADOR
// ============================================

router.get('/roles', (req, res) => {
  try {
    const roles = db.prepare(`
      SELECT r.*, 
        (SELECT COUNT(*) FROM admin_users WHERE role_id = r.id) as users_count
      FROM admin_roles r ORDER BY r.name
    `).all();
    res.json(roles);
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Error al obtener roles' });
  }
});

router.get('/roles/:id', (req, res) => {
  try {
    const role = db.prepare('SELECT * FROM admin_roles WHERE id = ?').get(req.params.id);
    if (!role) return res.status(404).json({ error: 'Rol no encontrado' });
    const permissions = db.prepare('SELECT * FROM admin_permissions WHERE role_id = ?').all(req.params.id);
    res.json({ ...role, permissions });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Error al obtener rol' });
  }
});

router.post('/roles', [
  body('name').notEmpty().trim()
], (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { name, description, permissions } = req.body;
    const id = `role_${Date.now()}`;
    
    db.prepare('INSERT INTO admin_roles (id, name, description) VALUES (?, ?, ?)').run(id, name, description || null);
    
    if (permissions && Array.isArray(permissions)) {
      const insertPerm = db.prepare('INSERT INTO admin_permissions (id, role_id, section, can_view, can_create, can_edit, can_delete) VALUES (?, ?, ?, ?, ?, ?, ?)');
      permissions.forEach(p => {
        insertPerm.run(`perm_${Date.now()}_${Math.random().toString(36).slice(2)}`, id, p.section, p.can_view ? 1 : 0, p.can_create ? 1 : 0, p.can_edit ? 1 : 0, p.can_delete ? 1 : 0);
      });
    }
    
    logAudit(req.user.id, 'ADMIN_ROLE_CREATED', 'admin_roles', id, null, req.body, req);
    res.status(201).json({ id, message: 'Rol creado exitosamente' });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Error al crear rol' });
  }
});

router.put('/roles/:id', (req, res) => {
  try {
    const role = db.prepare('SELECT * FROM admin_roles WHERE id = ?').get(req.params.id);
    if (!role) return res.status(404).json({ error: 'Rol no encontrado' });
    if (role.is_system) return res.status(400).json({ error: 'No se puede modificar un rol del sistema' });

    const { name, description, permissions } = req.body;
    db.prepare('UPDATE admin_roles SET name = ?, description = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(name || role.name, description !== undefined ? description : role.description, req.params.id);

    if (permissions && Array.isArray(permissions)) {
      db.prepare('DELETE FROM admin_permissions WHERE role_id = ?').run(req.params.id);
      const insertPerm = db.prepare('INSERT INTO admin_permissions (id, role_id, section, can_view, can_create, can_edit, can_delete) VALUES (?, ?, ?, ?, ?, ?, ?)');
      permissions.forEach(p => {
        insertPerm.run(`perm_${Date.now()}_${Math.random().toString(36).slice(2)}`, req.params.id, p.section, p.can_view ? 1 : 0, p.can_create ? 1 : 0, p.can_edit ? 1 : 0, p.can_delete ? 1 : 0);
      });
    }

    logAudit(req.user.id, 'ADMIN_ROLE_UPDATED', 'admin_roles', req.params.id, role, req.body, req);
    res.json({ message: 'Rol actualizado exitosamente' });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Error al actualizar rol' });
  }
});

router.delete('/roles/:id', (req, res) => {
  try {
    const role = db.prepare('SELECT * FROM admin_roles WHERE id = ?').get(req.params.id);
    if (!role) return res.status(404).json({ error: 'Rol no encontrado' });
    if (role.is_system) return res.status(400).json({ error: 'No se puede eliminar un rol del sistema' });
    
    const usersWithRole = db.prepare('SELECT COUNT(*) as count FROM admin_users WHERE role_id = ?').get(req.params.id);
    if (usersWithRole.count > 0) return res.status(400).json({ error: 'No se puede eliminar un rol con usuarios asignados' });

    db.prepare('DELETE FROM admin_permissions WHERE role_id = ?').run(req.params.id);
    db.prepare('DELETE FROM admin_roles WHERE id = ?').run(req.params.id);
    logAudit(req.user.id, 'ADMIN_ROLE_DELETED', 'admin_roles', req.params.id, role, null, req);
    res.json({ message: 'Rol eliminado exitosamente' });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Error al eliminar rol' });
  }
});

router.get('/admin-users', (req, res) => {
  try {
    const adminUsers = db.prepare(`
      SELECT au.*, u.email, u.first_name, u.last_name, r.name as role_name
      FROM admin_users au
      JOIN users u ON au.user_id = u.id
      JOIN admin_roles r ON au.role_id = r.id
      ORDER BY au.created_at DESC
    `).all();
    res.json(adminUsers);
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Error al obtener administradores' });
  }
});

router.post('/admin-users', [
  body('user_id').notEmpty(),
  body('role_id').notEmpty()
], (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { user_id, role_id } = req.body;
    const existing = db.prepare('SELECT * FROM admin_users WHERE user_id = ?').get(user_id);
    if (existing) return res.status(400).json({ error: 'Este usuario ya es administrador' });

    const id = `admusr_${Date.now()}`;
    db.prepare('INSERT INTO admin_users (id, user_id, role_id) VALUES (?, ?, ?)').run(id, user_id, role_id);
    db.prepare("UPDATE users SET role = 'ADMIN' WHERE id = ?").run(user_id);
    
    logAudit(req.user.id, 'ADMIN_USER_CREATED', 'admin_users', id, null, req.body, req);
    res.status(201).json({ id, message: 'Administrador creado' });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Error al crear administrador' });
  }
});

router.put('/admin-users/:id', (req, res) => {
  try {
    const adminUser = db.prepare('SELECT * FROM admin_users WHERE id = ?').get(req.params.id);
    if (!adminUser) return res.status(404).json({ error: 'Administrador no encontrado' });

    const { role_id, mfa_enabled } = req.body;
    const updates = ['updated_at = CURRENT_TIMESTAMP'];
    const params = [];
    
    if (role_id) { updates.push('role_id = ?'); params.push(role_id); }
    if (mfa_enabled !== undefined) { updates.push('mfa_enabled = ?'); params.push(mfa_enabled ? 1 : 0); }
    
    params.push(req.params.id);
    db.prepare(`UPDATE admin_users SET ${updates.join(', ')} WHERE id = ?`).run(...params);
    
    logAudit(req.user.id, 'ADMIN_USER_UPDATED', 'admin_users', req.params.id, adminUser, req.body, req);
    res.json({ message: 'Administrador actualizado' });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Error al actualizar administrador' });
  }
});

router.delete('/admin-users/:id', (req, res) => {
  try {
    const adminUser = db.prepare('SELECT * FROM admin_users WHERE id = ?').get(req.params.id);
    if (!adminUser) return res.status(404).json({ error: 'Administrador no encontrado' });
    if (adminUser.user_id === req.user.id) return res.status(400).json({ error: 'No puedes eliminarte a ti mismo' });

    db.prepare('DELETE FROM admin_users WHERE id = ?').run(req.params.id);
    db.prepare("UPDATE users SET role = 'HOST' WHERE id = ?").run(adminUser.user_id);
    
    logAudit(req.user.id, 'ADMIN_USER_DELETED', 'admin_users', req.params.id, adminUser, null, req);
    res.json({ message: 'Administrador eliminado' });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Error al eliminar administrador' });
  }
});

// ============================================
// #8: VERIFICACION DE HOSTS
// ============================================

router.get('/host-verifications', (req, res) => {
  try {
    const { status } = req.query;
    let query = `
      SELECT hv.*, u.email, u.first_name, u.last_name, u.company_name,
        reviewer.email as reviewer_email
      FROM host_verifications hv
      JOIN users u ON hv.host_id = u.id
      LEFT JOIN users reviewer ON hv.reviewed_by = reviewer.id
    `;
    if (status) query += ` WHERE hv.status = '${status}'`;
    query += ' ORDER BY hv.created_at DESC';
    
    const verifications = db.prepare(query).all();
    const stats = {
      total: db.prepare('SELECT COUNT(*) as count FROM host_verifications').get().count,
      pending: db.prepare("SELECT COUNT(*) as count FROM host_verifications WHERE status = 'pending'").get().count,
      in_review: db.prepare("SELECT COUNT(*) as count FROM host_verifications WHERE status = 'in_review'").get().count,
      approved: db.prepare("SELECT COUNT(*) as count FROM host_verifications WHERE status = 'approved'").get().count,
      rejected: db.prepare("SELECT COUNT(*) as count FROM host_verifications WHERE status = 'rejected'").get().count
    };
    res.json({ verifications, stats });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Error al obtener verificaciones' });
  }
});

router.put('/host-verifications/:id', (req, res) => {
  try {
    const verification = db.prepare('SELECT * FROM host_verifications WHERE id = ?').get(req.params.id);
    if (!verification) return res.status(404).json({ error: 'Verificación no encontrada' });

    const { status, review_notes, rejection_reason } = req.body;
    const updates = ['updated_at = CURRENT_TIMESTAMP', 'reviewed_by = ?', 'reviewed_at = CURRENT_TIMESTAMP'];
    const params = [req.user.id];
    
    if (status) { updates.push('status = ?'); params.push(status); }
    if (review_notes) { updates.push('review_notes = ?'); params.push(review_notes); }
    if (rejection_reason) { updates.push('rejection_reason = ?'); params.push(rejection_reason); }
    
    params.push(req.params.id);
    db.prepare(`UPDATE host_verifications SET ${updates.join(', ')} WHERE id = ?`).run(...params);

    // Si se aprueba, verificar si el host tiene todos los documentos aprobados para dar badge
    if (status === 'approved') {
      const pendingDocs = db.prepare("SELECT COUNT(*) as count FROM host_verifications WHERE host_id = ? AND status != 'approved'").get(verification.host_id);
      if (pendingDocs.count === 0) {
        const existingBadge = db.prepare("SELECT * FROM user_badges WHERE user_id = ? AND badge_id = 'badge_verified_host'").get(verification.host_id);
        if (!existingBadge) {
          db.prepare("INSERT INTO user_badges (id, user_id, badge_id, awarded_by) VALUES (?, ?, 'badge_verified_host', ?)").run(`ub_${Date.now()}`, verification.host_id, req.user.id);
        }
        db.prepare('UPDATE users SET is_verified = 1 WHERE id = ?').run(verification.host_id);
      }
    }

    logAudit(req.user.id, 'HOST_VERIFICATION_REVIEWED', 'host_verifications', req.params.id, verification, req.body, req);
    res.json({ message: 'Verificación actualizada' });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Error al actualizar verificación' });
  }
});

// ============================================
// #3: GESTION DE DISPUTAS
// ============================================

router.get('/disputes', (req, res) => {
  try {
    const { status, priority } = req.query;
    let query = `
      SELECT d.*, 
        comp.email as complainant_email, comp.first_name as complainant_first_name, comp.last_name as complainant_last_name,
        resp.email as respondent_email, resp.first_name as respondent_first_name, resp.last_name as respondent_last_name,
        assigned.email as assigned_email,
        r.id as reservation_id,
        (SELECT COUNT(*) FROM dispute_comments WHERE dispute_id = d.id) as comments_count
      FROM disputes d
      JOIN users comp ON d.complainant_id = comp.id
      JOIN users resp ON d.respondent_id = resp.id
      LEFT JOIN users assigned ON d.assigned_to = assigned.id
      LEFT JOIN reservations r ON d.reservation_id = r.id
      WHERE 1=1
    `;
    if (status) query += ` AND d.status = '${status}'`;
    if (priority) query += ` AND d.priority = '${priority}'`;
    query += ' ORDER BY d.created_at DESC';
    
    const disputes = db.prepare(query).all();
    const stats = {
      total: db.prepare('SELECT COUNT(*) as count FROM disputes').get().count,
      open: db.prepare("SELECT COUNT(*) as count FROM disputes WHERE status = 'open'").get().count,
      in_review: db.prepare("SELECT COUNT(*) as count FROM disputes WHERE status = 'in_review'").get().count,
      urgent: db.prepare("SELECT COUNT(*) as count FROM disputes WHERE priority = 'urgent' AND status NOT IN ('closed', 'resolved_favor_guest', 'resolved_favor_host', 'resolved_mutual')").get().count
    };
    res.json({ disputes, stats });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Error al obtener disputas' });
  }
});

router.get('/disputes/:id', (req, res) => {
  try {
    const dispute = db.prepare(`
      SELECT d.*, 
        comp.email as complainant_email, comp.first_name as complainant_first_name, comp.last_name as complainant_last_name,
        resp.email as respondent_email, resp.first_name as respondent_first_name, resp.last_name as respondent_last_name
      FROM disputes d
      JOIN users comp ON d.complainant_id = comp.id
      JOIN users resp ON d.respondent_id = resp.id
      WHERE d.id = ?
    `).get(req.params.id);
    if (!dispute) return res.status(404).json({ error: 'Disputa no encontrada' });

    const comments = db.prepare(`
      SELECT dc.*, u.email, u.first_name, u.last_name
      FROM dispute_comments dc
      JOIN users u ON dc.user_id = u.id
      WHERE dc.dispute_id = ?
      ORDER BY dc.created_at ASC
    `).all(req.params.id);

    res.json({ ...dispute, comments });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Error al obtener disputa' });
  }
});

router.post('/disputes', [
  body('complainant_id').notEmpty(),
  body('respondent_id').notEmpty(),
  body('category').isIn(['payment', 'property_condition', 'cancellation', 'damage', 'service', 'other']),
  body('subject').notEmpty().trim(),
  body('description').notEmpty()
], (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { complainant_id, complainant_type, respondent_id, reservation_id, contract_id, payment_id, category, subject, description, priority, evidence_urls } = req.body;
    const id = `dispute_${Date.now()}`;
    const dispute_number = `DSP-${Date.now().toString().slice(-8)}`;
    const { ip, userAgent } = getClientInfo(req);

    db.prepare(`
      INSERT INTO disputes (id, dispute_number, reservation_id, contract_id, payment_id, complainant_id, complainant_type, respondent_id, category, subject, description, evidence_urls, priority, ip_address, user_agent)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, dispute_number, reservation_id || null, contract_id || null, payment_id || null, complainant_id, complainant_type || 'guest', respondent_id, category, subject, description, evidence_urls ? JSON.stringify(evidence_urls) : null, priority || 'medium', ip, userAgent);

    // Crear alerta
    db.prepare(`
      INSERT INTO admin_alerts (id, alert_type, title, message, severity, entity_type, entity_id, action_url, action_label)
      VALUES (?, 'dispute_new', ?, ?, 'warning', 'disputes', ?, ?, 'Ver Disputa')
    `).run(`alert_${Date.now()}`, `Nueva Disputa: ${subject}`, `Se ha creado una nueva disputa (${dispute_number})`, id, `/admin/disputes/${id}`);

    logAudit(req.user.id, 'DISPUTE_CREATED', 'disputes', id, null, req.body, req);
    res.status(201).json({ id, dispute_number, message: 'Disputa creada' });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Error al crear disputa' });
  }
});

router.put('/disputes/:id', (req, res) => {
  try {
    const dispute = db.prepare('SELECT * FROM disputes WHERE id = ?').get(req.params.id);
    if (!dispute) return res.status(404).json({ error: 'Disputa no encontrada' });

    const { status, priority, assigned_to, resolution_notes, resolution_amount } = req.body;
    const updates = ['updated_at = CURRENT_TIMESTAMP'];
    const params = [];

    if (status) { 
      updates.push('status = ?'); 
      params.push(status);
      if (status.startsWith('resolved') || status === 'closed') {
        updates.push('resolved_at = CURRENT_TIMESTAMP', 'resolved_by = ?');
        params.push(req.user.id);
      }
    }
    if (priority) { updates.push('priority = ?'); params.push(priority); }
    if (assigned_to) { updates.push('assigned_to = ?'); params.push(assigned_to); }
    if (resolution_notes) { updates.push('resolution_notes = ?'); params.push(resolution_notes); }
    if (resolution_amount !== undefined) { updates.push('resolution_amount = ?'); params.push(resolution_amount); }

    params.push(req.params.id);
    db.prepare(`UPDATE disputes SET ${updates.join(', ')} WHERE id = ?`).run(...params);

    logAudit(req.user.id, 'DISPUTE_UPDATED', 'disputes', req.params.id, dispute, req.body, req);
    res.json({ message: 'Disputa actualizada' });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Error al actualizar disputa' });
  }
});

router.post('/disputes/:id/comments', [
  body('comment').notEmpty()
], (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const dispute = db.prepare('SELECT * FROM disputes WHERE id = ?').get(req.params.id);
    if (!dispute) return res.status(404).json({ error: 'Disputa no encontrada' });

    const { comment, is_internal, attachment_url } = req.body;
    const id = `dc_${Date.now()}`;
    
    db.prepare('INSERT INTO dispute_comments (id, dispute_id, user_id, user_type, comment, is_internal, attachment_url) VALUES (?, ?, ?, ?, ?, ?, ?)').run(id, req.params.id, req.user.id, 'admin', comment, is_internal ? 1 : 0, attachment_url || null);

    res.status(201).json({ id, message: 'Comentario agregado' });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Error al agregar comentario' });
  }
});

// ============================================
// #9: CAMPANAS DE EMAIL/SMS
// ============================================

router.get('/campaigns', (req, res) => {
  try {
    const campaigns = db.prepare(`
      SELECT c.*, u.email as created_by_email
      FROM campaigns c
      LEFT JOIN users u ON c.created_by = u.id
      ORDER BY c.created_at DESC
    `).all();
    const stats = {
      total: campaigns.length,
      draft: campaigns.filter(c => c.status === 'draft').length,
      scheduled: campaigns.filter(c => c.status === 'scheduled').length,
      sent: campaigns.filter(c => c.status === 'sent').length
    };
    res.json({ campaigns, stats });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Error al obtener campañas' });
  }
});

router.get('/campaigns/:id', (req, res) => {
  try {
    const campaign = db.prepare('SELECT * FROM campaigns WHERE id = ?').get(req.params.id);
    if (!campaign) return res.status(404).json({ error: 'Campaña no encontrada' });

    const recipients = db.prepare(`
      SELECT cr.*, u.email, u.first_name, u.last_name
      FROM campaign_recipients cr
      JOIN users u ON cr.user_id = u.id
      WHERE cr.campaign_id = ?
    `).all(req.params.id);

    res.json({ ...campaign, recipients });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Error al obtener campaña' });
  }
});

router.post('/campaigns', [
  body('name').notEmpty().trim(),
  body('campaign_type').isIn(['email', 'sms', 'both']),
  body('content').notEmpty(),
  body('target_audience').notEmpty()
], (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { name, campaign_type, subject, content, template_variables, target_audience, scheduled_at } = req.body;
    const id = `camp_${Date.now()}`;
    const status = scheduled_at ? 'scheduled' : 'draft';

    const newsletterAudiences = ['newsletter', 'guests_newsletter', 'hosts_newsletter'];
    const dbTargetAudience = newsletterAudiences.includes(target_audience) ? 'custom' : target_audience;
    const customFilter = newsletterAudiences.includes(target_audience) ? target_audience : (req.body.custom_filter || null);

    db.prepare(`
      INSERT INTO campaigns (id, name, campaign_type, subject, content, template_variables, target_audience, custom_filter, status, scheduled_at, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, name, campaign_type, subject || null, content, template_variables ? JSON.stringify(template_variables) : null, dbTargetAudience, customFilter, status, scheduled_at || null, req.user.id);

    logAudit(req.user.id, 'CAMPAIGN_CREATED', 'campaigns', id, null, req.body, req);
    res.status(201).json({ id, message: 'Campaña creada' });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Error al crear campaña' });
  }
});

router.put('/campaigns/:id', (req, res) => {
  try {
    const campaign = db.prepare('SELECT * FROM campaigns WHERE id = ?').get(req.params.id);
    if (!campaign) return res.status(404).json({ error: 'Campaña no encontrada' });
    if (campaign.status === 'sent') return res.status(400).json({ error: 'No se puede modificar una campaña enviada' });

    const { name, campaign_type, subject, content, target_audience, scheduled_at, status } = req.body;
    const updates = ['updated_at = CURRENT_TIMESTAMP'];
    const params = [];

    const newsletterAudiences = ['newsletter', 'guests_newsletter', 'hosts_newsletter'];

    if (name) { updates.push('name = ?'); params.push(name); }
    if (campaign_type) { updates.push('campaign_type = ?'); params.push(campaign_type); }
    if (subject !== undefined) { updates.push('subject = ?'); params.push(subject); }
    if (content) { updates.push('content = ?'); params.push(content); }
    if (target_audience) {
      const dbTargetAudience = newsletterAudiences.includes(target_audience) ? 'custom' : target_audience;
      updates.push('target_audience = ?');
      params.push(dbTargetAudience);
      updates.push('custom_filter = ?');
      params.push(newsletterAudiences.includes(target_audience) ? target_audience : (req.body.custom_filter || null));
    }
    if (scheduled_at !== undefined) { updates.push('scheduled_at = ?'); params.push(scheduled_at); }
    if (status) { updates.push('status = ?'); params.push(status); }

    params.push(req.params.id);
    db.prepare(`UPDATE campaigns SET ${updates.join(', ')} WHERE id = ?`).run(...params);

    logAudit(req.user.id, 'CAMPAIGN_UPDATED', 'campaigns', req.params.id, campaign, req.body, req);
    res.json({ message: 'Campaña actualizada' });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Error al actualizar campaña' });
  }
});

router.post('/campaigns/:id/send', async (req, res) => {
  try {
    const campaign = db.prepare('SELECT * FROM campaigns WHERE id = ?').get(req.params.id);
    if (!campaign) return res.status(404).json({ error: 'Campaña no encontrada' });
    if (campaign.status === 'sent') return res.status(400).json({ error: 'Campaña ya enviada' });

    let usersQuery = 'SELECT id, email, phone, first_name, last_name FROM users WHERE is_active = 1';
    
    const effectiveAudience = campaign.target_audience === 'custom' && campaign.custom_filter 
      ? campaign.custom_filter 
      : campaign.target_audience;
    
    if (effectiveAudience === 'guests') usersQuery += " AND role = 'GUEST'";
    else if (effectiveAudience === 'hosts') usersQuery += " AND role = 'HOST'";
    else if (effectiveAudience === 'new_users') usersQuery += " AND created_at >= date('now', '-30 days')";
    else if (effectiveAudience === 'newsletter') usersQuery += " AND newsletter = 1";
    else if (effectiveAudience === 'guests_newsletter') usersQuery += " AND role = 'GUEST' AND newsletter = 1";
    else if (effectiveAudience === 'hosts_newsletter') usersQuery += " AND role = 'HOST' AND newsletter = 1";

    const users = db.prepare(usersQuery).all();
    
    if (users.length === 0) {
      return res.status(400).json({ error: 'No hay destinatarios para esta audiencia' });
    }
    
    let sentCount = 0;
    let failedCount = 0;
    const insertRecipient = db.prepare('INSERT INTO campaign_recipients (id, campaign_id, user_id, email, phone, status, sent_at, error_message) VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, ?)');
    
    const htmlTemplate = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; }
    .container { max-width: 600px; margin: 0 auto; }
    .header { background: linear-gradient(135deg, #1e3a5f 0%, #2d5a87 100%); color: white; padding: 30px; text-align: center; }
    .header h1 { margin: 0; font-size: 24px; }
    .content { padding: 30px; background: #ffffff; }
    .footer { background: #1e3a5f; color: white; padding: 20px; text-align: center; font-size: 12px; }
    .footer a { color: #a3c4f3; }
    .unsubscribe { margin-top: 15px; font-size: 11px; color: #94a3b8; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>Almacenes, Galpones, Espacios Libres</h1>
    </div>
    <div class="content">
      {{CONTENT}}
    </div>
    <div class="footer">
      <p>Almacenes, Galpones, Espacios Libres - Bolivia</p>
      <p class="unsubscribe">Ha recibido este correo porque esta suscrito a nuestro boletin informativo. Para cancelar su suscripcion, visite su perfil en nuestra plataforma.</p>
    </div>
  </div>
</body>
</html>`;

    for (const user of users) {
      const recipientId = `cr_${Date.now()}_${Math.random().toString(36).slice(2)}`;
      
      try {
        let personalizedContent = campaign.content;
        personalizedContent = personalizedContent.replace(/\{\{nombre\}\}/gi, user.first_name || 'Usuario');
        personalizedContent = personalizedContent.replace(/\{\{apellido\}\}/gi, user.last_name || '');
        personalizedContent = personalizedContent.replace(/\{\{email\}\}/gi, user.email);
        
        const htmlBody = htmlTemplate.replace('{{CONTENT}}', personalizedContent.replace(/\n/g, '<br>'));
        
        const result = await sendEmail({
          to: user.email,
          subject: campaign.subject || campaign.name,
          htmlBody: htmlBody,
          textBody: personalizedContent.replace(/<[^>]*>/g, '')
        });
        
        if (result.success) {
          sentCount++;
          insertRecipient.run(recipientId, req.params.id, user.id, user.email, user.phone, 'sent', null);
        } else {
          failedCount++;
          insertRecipient.run(recipientId, req.params.id, user.id, user.email, user.phone, 'failed', result.error);
        }
      } catch (emailError) {
        failedCount++;
        insertRecipient.run(recipientId, req.params.id, user.id, user.email, user.phone, 'failed', emailError.message);
      }
    }

    db.prepare(`
      UPDATE campaigns SET status = 'sent', sent_at = CURRENT_TIMESTAMP, total_recipients = ?, sent_count = ?, failed_count = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(users.length, sentCount, failedCount, req.params.id);

    logAudit(req.user.id, 'CAMPAIGN_SENT', 'campaigns', req.params.id, campaign, { sent: sentCount, failed: failedCount }, req);
    res.json({ message: 'Campaña enviada exitosamente', total: users.length, sent: sentCount, failed: failedCount });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Error al enviar campaña' });
  }
});

router.delete('/campaigns/:id', (req, res) => {
  try {
    const campaign = db.prepare('SELECT * FROM campaigns WHERE id = ?').get(req.params.id);
    if (!campaign) return res.status(404).json({ error: 'Campaña no encontrada' });

    db.prepare('DELETE FROM campaign_recipients WHERE campaign_id = ?').run(req.params.id);
    db.prepare('DELETE FROM campaigns WHERE id = ?').run(req.params.id);

    logAudit(req.user.id, 'CAMPAIGN_DELETED', 'campaigns', req.params.id, campaign, null, req);
    res.json({ message: 'Campaña eliminada' });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Error al eliminar campaña' });
  }
});

// ============================================
// B: ESTADOS DE CUENTA DE HOSTS
// ============================================

router.get('/host-statements', (req, res) => {
  try {
    const statements = db.prepare(`
      SELECT hs.*, u.email, u.first_name, u.last_name, u.company_name
      FROM host_statements hs
      JOIN users u ON hs.host_id = u.id
      ORDER BY hs.created_at DESC
    `).all();
    res.json(statements);
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Error al obtener estados de cuenta' });
  }
});

router.post('/host-statements/generate', [
  body('host_id').notEmpty(),
  body('period_start').notEmpty(),
  body('period_end').notEmpty()
], (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { host_id, period_start, period_end } = req.body;
    const id = `stmt_${Date.now()}`;
    const statement_number = `EC-${Date.now().toString().slice(-8)}`;

    // Calcular totales del período
    const contracts = db.prepare(`
      SELECT c.*, r.commission_amount
      FROM contracts c
      JOIN reservations r ON c.reservation_id = r.id
      WHERE c.host_id = ? AND c.created_at BETWEEN ? AND ?
    `).all(host_id, period_start, period_end);

    const gross_income = contracts.reduce((sum, c) => sum + c.total_amount, 0);
    const commission_deducted = contracts.reduce((sum, c) => sum + (c.commission_amount || 0), 0);
    const net_payout = gross_income - commission_deducted;

    db.prepare(`
      INSERT INTO host_statements (id, host_id, statement_number, period_start, period_end, total_bookings, gross_income, commission_deducted, net_payout)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, host_id, statement_number, period_start, period_end, contracts.length, gross_income, commission_deducted, net_payout);

    // Insertar detalles
    const insertDetail = db.prepare('INSERT INTO host_statement_details (id, statement_id, contract_id, description, amount, commission, net_amount, transaction_date) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
    contracts.forEach(c => {
      insertDetail.run(`stmtd_${Date.now()}_${Math.random().toString(36).slice(2)}`, id, c.id, `Contrato ${c.contract_number}`, c.total_amount, c.commission_amount || 0, c.host_payout_amount, c.created_at);
    });

    logAudit(req.user.id, 'HOST_STATEMENT_GENERATED', 'host_statements', id, null, req.body, req);
    res.status(201).json({ id, statement_number, message: 'Estado de cuenta generado' });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Error al generar estado de cuenta' });
  }
});

router.put('/host-statements/:id', (req, res) => {
  try {
    const statement = db.prepare('SELECT * FROM host_statements WHERE id = ?').get(req.params.id);
    if (!statement) return res.status(404).json({ error: 'Estado de cuenta no encontrado' });

    const { payout_status, payout_reference } = req.body;
    const updates = [];
    const params = [];

    if (payout_status) { 
      updates.push('payout_status = ?'); 
      params.push(payout_status);
      if (payout_status === 'paid') {
        updates.push('payout_date = CURRENT_TIMESTAMP');
      }
    }
    if (payout_reference) { updates.push('payout_reference = ?'); params.push(payout_reference); }

    if (updates.length === 0) return res.status(400).json({ error: 'No hay cambios' });

    params.push(req.params.id);
    db.prepare(`UPDATE host_statements SET ${updates.join(', ')} WHERE id = ?`).run(...params);

    logAudit(req.user.id, 'HOST_STATEMENT_UPDATED', 'host_statements', req.params.id, statement, req.body, req);
    res.json({ message: 'Estado de cuenta actualizado' });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Error al actualizar estado de cuenta' });
  }
});

// ============================================
// C: DEPOSITOS DE SEGURIDAD
// ============================================

router.get('/security-deposits', (req, res) => {
  try {
    const deposits = db.prepare(`
      SELECT sd.*,
        g.email as guest_email, g.first_name as guest_first_name, g.last_name as guest_last_name,
        h.email as host_email, h.first_name as host_first_name, h.last_name as host_last_name,
        s.title as space_title
      FROM security_deposits sd
      JOIN users g ON sd.guest_id = g.id
      JOIN users h ON sd.host_id = h.id
      LEFT JOIN reservations r ON sd.reservation_id = r.id
      LEFT JOIN spaces s ON r.space_id = s.id
      ORDER BY sd.created_at DESC
    `).all();
    const stats = {
      total: deposits.length,
      held: deposits.filter(d => d.status === 'held').length,
      pending_release: deposits.filter(d => d.status === 'held').length,
      total_amount_held: deposits.filter(d => d.status === 'held').reduce((sum, d) => sum + d.amount, 0)
    };
    res.json({ deposits, stats });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Error al obtener depósitos' });
  }
});

router.put('/security-deposits/:id', (req, res) => {
  try {
    const deposit = db.prepare('SELECT * FROM security_deposits WHERE id = ?').get(req.params.id);
    if (!deposit) return res.status(404).json({ error: 'Depósito no encontrado' });

    const { status, release_amount, claim_amount, claim_reason, notes } = req.body;
    const updates = ['updated_at = CURRENT_TIMESTAMP', 'processed_by = ?', 'processed_at = CURRENT_TIMESTAMP'];
    const params = [req.user.id];

    if (status) { 
      updates.push('status = ?'); 
      params.push(status);
      if (status === 'released') updates.push('released_at = CURRENT_TIMESTAMP');
      if (status === 'claimed') updates.push('claimed_at = CURRENT_TIMESTAMP');
    }
    if (release_amount !== undefined) { updates.push('release_amount = ?'); params.push(release_amount); }
    if (claim_amount !== undefined) { updates.push('claim_amount = ?'); params.push(claim_amount); }
    if (claim_reason) { updates.push('claim_reason = ?'); params.push(claim_reason); }
    if (notes) { updates.push('notes = ?'); params.push(notes); }

    params.push(req.params.id);
    db.prepare(`UPDATE security_deposits SET ${updates.join(', ')} WHERE id = ?`).run(...params);

    logAudit(req.user.id, 'SECURITY_DEPOSIT_UPDATED', 'security_deposits', req.params.id, deposit, req.body, req);
    res.json({ message: 'Depósito actualizado' });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Error al actualizar depósito' });
  }
});

// ============================================
// D: BADGES/INSIGNIAS
// ============================================

router.get('/badges', (req, res) => {
  try {
    const badges = db.prepare(`
      SELECT bd.*,
        (SELECT COUNT(*) FROM user_badges WHERE badge_id = bd.id AND is_active = 1) as awarded_count
      FROM badge_definitions bd
      ORDER BY bd.badge_type, bd.name
    `).all();
    res.json(badges);
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Error al obtener badges' });
  }
});

router.post('/badges', [
  body('code').notEmpty().trim(),
  body('name').notEmpty().trim(),
  body('badge_type').isIn(['host', 'guest', 'both'])
], (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { code, name, description, icon, color, badge_type, criteria, is_automatic } = req.body;
    const id = `badge_${Date.now()}`;

    db.prepare(`
      INSERT INTO badge_definitions (id, code, name, description, icon, color, badge_type, criteria, is_automatic)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, code, name, description || null, icon || null, color || '#4F46E5', badge_type, criteria || null, is_automatic ? 1 : 0);

    logAudit(req.user.id, 'BADGE_CREATED', 'badge_definitions', id, null, req.body, req);
    res.status(201).json({ id, message: 'Badge creado' });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Error al crear badge' });
  }
});

router.put('/badges/:id', (req, res) => {
  try {
    const badge = db.prepare('SELECT * FROM badge_definitions WHERE id = ?').get(req.params.id);
    if (!badge) return res.status(404).json({ error: 'Badge no encontrado' });

    const { name, description, icon, color, criteria, is_automatic, is_active } = req.body;
    const updates = [];
    const params = [];

    if (name) { updates.push('name = ?'); params.push(name); }
    if (description !== undefined) { updates.push('description = ?'); params.push(description); }
    if (icon) { updates.push('icon = ?'); params.push(icon); }
    if (color) { updates.push('color = ?'); params.push(color); }
    if (criteria !== undefined) { updates.push('criteria = ?'); params.push(criteria); }
    if (is_automatic !== undefined) { updates.push('is_automatic = ?'); params.push(is_automatic ? 1 : 0); }
    if (is_active !== undefined) { updates.push('is_active = ?'); params.push(is_active ? 1 : 0); }

    if (updates.length === 0) return res.status(400).json({ error: 'No hay cambios' });

    params.push(req.params.id);
    db.prepare(`UPDATE badge_definitions SET ${updates.join(', ')} WHERE id = ?`).run(...params);

    logAudit(req.user.id, 'BADGE_UPDATED', 'badge_definitions', req.params.id, badge, req.body, req);
    res.json({ message: 'Badge actualizado' });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Error al actualizar badge' });
  }
});

router.post('/badges/award', [
  body('user_id').notEmpty(),
  body('badge_id').notEmpty()
], (req, res) => {
  try {
    const { user_id, badge_id } = req.body;
    const existing = db.prepare('SELECT * FROM user_badges WHERE user_id = ? AND badge_id = ? AND is_active = 1').get(user_id, badge_id);
    if (existing) return res.status(400).json({ error: 'El usuario ya tiene este badge' });

    const id = `ub_${Date.now()}`;
    db.prepare('INSERT INTO user_badges (id, user_id, badge_id, awarded_by) VALUES (?, ?, ?, ?)').run(id, user_id, badge_id, req.user.id);

    logAudit(req.user.id, 'BADGE_AWARDED', 'user_badges', id, null, req.body, req);
    res.status(201).json({ id, message: 'Badge otorgado' });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Error al otorgar badge' });
  }
});

router.delete('/badges/revoke/:id', (req, res) => {
  try {
    const userBadge = db.prepare('SELECT * FROM user_badges WHERE id = ?').get(req.params.id);
    if (!userBadge) return res.status(404).json({ error: 'Badge de usuario no encontrado' });

    db.prepare('UPDATE user_badges SET is_active = 0 WHERE id = ?').run(req.params.id);
    logAudit(req.user.id, 'BADGE_REVOKED', 'user_badges', req.params.id, userBadge, null, req);
    res.json({ message: 'Badge revocado' });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Error al revocar badge' });
  }
});

// ============================================
// E: FAQ/CENTRO DE AYUDA
// ============================================

router.get('/faq-categories', (req, res) => {
  try {
    const categories = db.prepare(`
      SELECT fc.*,
        (SELECT COUNT(*) FROM faqs WHERE category_id = fc.id AND is_active = 1) as faqs_count
      FROM faq_categories fc
      ORDER BY fc.order_index
    `).all();
    res.json(categories);
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Error al obtener categorías' });
  }
});

router.post('/faq-categories', [
  body('name').notEmpty().trim(),
  body('slug').notEmpty().trim()
], (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { name, slug, description, icon, order_index, target_audience } = req.body;
    const id = `faq_cat_${Date.now()}`;

    db.prepare(`
      INSERT INTO faq_categories (id, name, slug, description, icon, order_index, target_audience)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(id, name, slug, description || null, icon || null, order_index || 0, target_audience || 'all');

    res.status(201).json({ id, message: 'Categoría creada' });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Error al crear categoría' });
  }
});

router.get('/faqs', (req, res) => {
  try {
    const { category_id } = req.query;
    let query = `
      SELECT f.*, fc.name as category_name
      FROM faqs f
      JOIN faq_categories fc ON f.category_id = fc.id
    `;
    if (category_id) query += ` WHERE f.category_id = '${category_id}'`;
    query += ' ORDER BY fc.order_index, f.order_index';

    const faqs = db.prepare(query).all();
    res.json(faqs);
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Error al obtener FAQs' });
  }
});

router.post('/faqs', [
  body('category_id').notEmpty(),
  body('question').notEmpty().trim(),
  body('answer').notEmpty()
], (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { category_id, question, answer, order_index, is_featured } = req.body;
    const id = `faq_${Date.now()}`;

    db.prepare(`
      INSERT INTO faqs (id, category_id, question, answer, order_index, is_featured, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(id, category_id, question, answer, order_index || 0, is_featured ? 1 : 0, req.user.id);

    res.status(201).json({ id, message: 'FAQ creada' });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Error al crear FAQ' });
  }
});

router.put('/faqs/:id', (req, res) => {
  try {
    const faq = db.prepare('SELECT * FROM faqs WHERE id = ?').get(req.params.id);
    if (!faq) return res.status(404).json({ error: 'FAQ no encontrada' });

    const { category_id, question, answer, order_index, is_featured, is_active } = req.body;
    const updates = ['updated_at = CURRENT_TIMESTAMP'];
    const params = [];

    if (category_id) { updates.push('category_id = ?'); params.push(category_id); }
    if (question) { updates.push('question = ?'); params.push(question); }
    if (answer) { updates.push('answer = ?'); params.push(answer); }
    if (order_index !== undefined) { updates.push('order_index = ?'); params.push(order_index); }
    if (is_featured !== undefined) { updates.push('is_featured = ?'); params.push(is_featured ? 1 : 0); }
    if (is_active !== undefined) { updates.push('is_active = ?'); params.push(is_active ? 1 : 0); }

    params.push(req.params.id);
    db.prepare(`UPDATE faqs SET ${updates.join(', ')} WHERE id = ?`).run(...params);

    res.json({ message: 'FAQ actualizada' });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Error al actualizar FAQ' });
  }
});

router.delete('/faqs/:id', (req, res) => {
  try {
    db.prepare('DELETE FROM faqs WHERE id = ?').run(req.params.id);
    res.json({ message: 'FAQ eliminada' });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Error al eliminar FAQ' });
  }
});

// ============================================
// F: ALERTAS ADMIN
// ============================================

router.get('/alerts', (req, res) => {
  try {
    const { unread_only } = req.query;
    let query = 'SELECT * FROM admin_alerts';
    if (unread_only === 'true') query += ' WHERE is_read = 0 AND is_dismissed = 0';
    query += ' ORDER BY created_at DESC LIMIT 100';

    const alerts = db.prepare(query).all();
    const unread_count = db.prepare('SELECT COUNT(*) as count FROM admin_alerts WHERE is_read = 0 AND is_dismissed = 0').get().count;
    res.json({ alerts, unread_count });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Error al obtener alertas' });
  }
});

router.put('/alerts/:id/read', (req, res) => {
  try {
    db.prepare('UPDATE admin_alerts SET is_read = 1 WHERE id = ?').run(req.params.id);
    res.json({ message: 'Alerta marcada como leída' });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Error al marcar alerta' });
  }
});

router.put('/alerts/read-all', (req, res) => {
  try {
    db.prepare('UPDATE admin_alerts SET is_read = 1 WHERE is_read = 0').run();
    res.json({ message: 'Todas las alertas marcadas como leídas' });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Error al marcar alertas' });
  }
});

router.put('/alerts/:id/dismiss', (req, res) => {
  try {
    db.prepare('UPDATE admin_alerts SET is_dismissed = 1 WHERE id = ?').run(req.params.id);
    res.json({ message: 'Alerta descartada' });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Error al descartar alerta' });
  }
});

// ============================================
// #2: REPORTES AVANZADOS
// ============================================

router.get('/reports/overview', (req, res) => {
  try {
    const { start_date, end_date } = req.query;
    const dateFilter = start_date && end_date ? `AND created_at BETWEEN '${start_date}' AND '${end_date}'` : '';

    const revenue = db.prepare(`
      SELECT 
        strftime('%Y-%m', created_at) as month,
        SUM(amount) as total,
        COUNT(*) as count
      FROM payments 
      WHERE status = 'completed' ${dateFilter}
      GROUP BY strftime('%Y-%m', created_at)
      ORDER BY month DESC
      LIMIT 12
    `).all();

    const reservations = db.prepare(`
      SELECT 
        strftime('%Y-%m', created_at) as month,
        COUNT(*) as total,
        SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed,
        SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END) as cancelled
      FROM reservations
      WHERE 1=1 ${dateFilter}
      GROUP BY strftime('%Y-%m', created_at)
      ORDER BY month DESC
      LIMIT 12
    `).all();

    const users = db.prepare(`
      SELECT 
        strftime('%Y-%m', created_at) as month,
        COUNT(*) as new_users,
        SUM(CASE WHEN role = 'GUEST' THEN 1 ELSE 0 END) as guests,
        SUM(CASE WHEN role = 'HOST' THEN 1 ELSE 0 END) as hosts
      FROM users
      WHERE 1=1 ${dateFilter}
      GROUP BY strftime('%Y-%m', created_at)
      ORDER BY month DESC
      LIMIT 12
    `).all();

    const spaces = db.prepare(`
      SELECT 
        strftime('%Y-%m', created_at) as month,
        COUNT(*) as total,
        SUM(CASE WHEN status = 'published' THEN 1 ELSE 0 END) as published
      FROM spaces
      WHERE 1=1 ${dateFilter}
      GROUP BY strftime('%Y-%m', created_at)
      ORDER BY month DESC
      LIMIT 12
    `).all();

    const commissions = db.prepare(`
      SELECT COALESCE(SUM(commission_amount), 0) as total
      FROM reservations
      WHERE status = 'contract_signed' ${dateFilter}
    `).get();

    const topHosts = db.prepare(`
      SELECT u.id, u.email, u.first_name, u.last_name, u.company_name,
        COUNT(DISTINCT c.id) as contracts_count,
        COALESCE(SUM(c.total_amount), 0) as total_revenue
      FROM users u
      JOIN contracts c ON u.id = c.host_id
      WHERE u.role = 'HOST' ${dateFilter.replace('created_at', 'c.created_at')}
      GROUP BY u.id
      ORDER BY total_revenue DESC
      LIMIT 10
    `).all();

    const topSpaces = db.prepare(`
      SELECT s.id, s.title, s.city, s.department,
        COUNT(DISTINCT r.id) as reservations_count,
        COALESCE(SUM(r.total_amount), 0) as total_revenue
      FROM spaces s
      JOIN reservations r ON s.id = r.space_id
      WHERE 1=1 ${dateFilter.replace('created_at', 'r.created_at')}
      GROUP BY s.id
      ORDER BY total_revenue DESC
      LIMIT 10
    `).all();

    res.json({
      revenue: revenue.reverse(),
      reservations: reservations.reverse(),
      users: users.reverse(),
      spaces: spaces.reverse(),
      commissions: commissions.total,
      topHosts,
      topSpaces
    });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Error al generar reportes' });
  }
});

router.get('/reports/kpis', (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    const kpis = {
      total_revenue: db.prepare("SELECT COALESCE(SUM(amount), 0) as value FROM payments WHERE status = 'completed'").get().value,
      monthly_revenue: db.prepare(`SELECT COALESCE(SUM(amount), 0) as value FROM payments WHERE status = 'completed' AND created_at >= '${thirtyDaysAgo}'`).get().value,
      total_commissions: db.prepare("SELECT COALESCE(SUM(commission_amount), 0) as value FROM reservations WHERE status = 'contract_signed'").get().value,
      active_contracts: db.prepare("SELECT COUNT(*) as value FROM contracts WHERE status IN ('active', 'signed')").get().value,
      pending_verifications: db.prepare("SELECT COUNT(*) as value FROM host_verifications WHERE status = 'pending'").get().value,
      open_disputes: db.prepare("SELECT COUNT(*) as value FROM disputes WHERE status IN ('open', 'in_review')").get().value,
      conversion_rate: (() => {
        const total = db.prepare('SELECT COUNT(*) as count FROM reservations').get().count;
        const completed = db.prepare("SELECT COUNT(*) as count FROM reservations WHERE status = 'completed'").get().count;
        return total > 0 ? ((completed / total) * 100).toFixed(2) : 0;
      })(),
      avg_contract_value: db.prepare('SELECT COALESCE(AVG(total_amount), 0) as value FROM contracts').get().value,
      escrow_balance: db.prepare("SELECT COALESCE(SUM(amount), 0) as value FROM payments WHERE escrow_status = 'held'").get().value,
      new_users_30d: db.prepare(`SELECT COUNT(*) as value FROM users WHERE created_at >= '${thirtyDaysAgo}'`).get().value
    };

    res.json(kpis);
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Error al obtener KPIs' });
  }
});

module.exports = router;
