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

module.exports = router;
