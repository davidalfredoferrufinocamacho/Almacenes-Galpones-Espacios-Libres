const express = require('express');
const { body, validationResult } = require('express-validator');
const { db } = require('../config/database');
const { authenticateToken, requireRole } = require('../middleware/auth');
const { logAudit } = require('../middleware/audit');

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
