const express = require('express');
const { body, validationResult } = require('express-validator');
const { db } = require('../config/database');
const { authenticateToken, requireRole } = require('../middleware/auth');
const { logAudit } = require('../middleware/audit');
const { getClientInfo, generateId } = require('../utils/helpers');

const router = express.Router();

router.use(authenticateToken);
router.use(requireRole('HOST'));

router.get('/dashboard', (req, res) => {
  try {
    const userId = req.user.id;
    
    const spaces = db.prepare(`
      SELECT COUNT(*) as total,
             SUM(CASE WHEN status = 'published' THEN 1 ELSE 0 END) as published,
             SUM(CASE WHEN status = 'draft' THEN 1 ELSE 0 END) as draft
      FROM spaces WHERE user_id = ?
    `).get(userId);

    const reservations = db.prepare(`
      SELECT COUNT(*) as total,
             SUM(CASE WHEN r.status = 'confirmed' THEN 1 ELSE 0 END) as active,
             SUM(CASE WHEN r.status = 'completed' THEN 1 ELSE 0 END) as completed,
             SUM(CASE WHEN r.status = 'pending' THEN 1 ELSE 0 END) as pending
      FROM reservations r
      JOIN spaces s ON r.space_id = s.id
      WHERE s.user_id = ?
    `).get(userId);

    const earnings = db.prepare(`
      SELECT 
        COALESCE(SUM(CASE WHEN p.status = 'completed' THEN p.amount ELSE 0 END), 0) as total_earned,
        COALESCE(SUM(CASE WHEN p.escrow_status = 'held' THEN p.amount ELSE 0 END), 0) as in_escrow,
        COALESCE(SUM(CASE WHEN p.escrow_status = 'released' THEN p.amount ELSE 0 END), 0) as released
      FROM payments p
      JOIN reservations r ON p.reservation_id = r.id
      JOIN spaces s ON r.space_id = s.id
      WHERE s.user_id = ?
    `).get(userId);

    const recentReservations = db.prepare(`
      SELECT r.id, r.start_date, r.end_date, r.status, r.total_amount,
             s.title as space_title,
             u.first_name || ' ' || u.last_name as guest_name
      FROM reservations r
      JOIN spaces s ON r.space_id = s.id
      JOIN users u ON r.user_id = u.id
      WHERE s.user_id = ?
      ORDER BY r.created_at DESC
      LIMIT 5
    `).all(userId);

    const monthlyEarnings = db.prepare(`
      SELECT 
        strftime('%Y-%m', p.created_at) as month,
        SUM(p.amount) as amount
      FROM payments p
      JOIN reservations r ON p.reservation_id = r.id
      JOIN spaces s ON r.space_id = s.id
      WHERE s.user_id = ? AND p.status = 'completed'
      GROUP BY strftime('%Y-%m', p.created_at)
      ORDER BY month DESC
      LIMIT 12
    `).all(userId);

    res.json({
      spaces: spaces || { total: 0, published: 0, draft: 0 },
      reservations: reservations || { total: 0, active: 0, completed: 0, pending: 0 },
      earnings: earnings || { total_earned: 0, in_escrow: 0, released: 0 },
      recentReservations,
      monthlyEarnings
    });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Error al obtener estadisticas' });
  }
});

router.get('/spaces', (req, res) => {
  try {
    const userId = req.user.id;
    const spaces = db.prepare(`
      SELECT s.*, 
             (SELECT COUNT(*) FROM reservations WHERE space_id = s.id) as reservations_count,
             (SELECT COUNT(*) FROM reservations WHERE space_id = s.id AND status = 'confirmed') as active_reservations
      FROM spaces s
      WHERE s.user_id = ?
      ORDER BY s.created_at DESC
    `).all(userId);

    res.json(spaces);
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Error al obtener espacios' });
  }
});

router.get('/spaces/:id', (req, res) => {
  try {
    const userId = req.user.id;
    const space = db.prepare(`
      SELECT * FROM spaces WHERE id = ? AND user_id = ?
    `).get(req.params.id, userId);

    if (!space) {
      return res.status(404).json({ error: 'Espacio no encontrado' });
    }

    res.json(space);
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Error al obtener espacio' });
  }
});

router.post('/spaces', [
  body('title').notEmpty().trim(),
  body('description').notEmpty(),
  body('price_per_month').isNumeric(),
  body('area_m2').isNumeric(),
  body('city').notEmpty()
], (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  try {
    const userId = req.user.id;
    const id = generateId();
    const { title, description, space_type, price_per_month, price_per_day, area_m2,
            city, department, street, street_number, latitude, longitude,
            amenities, rules, min_rental_days, max_rental_days } = req.body;

    db.prepare(`
      INSERT INTO spaces (id, user_id, title, description, space_type, price_per_month, price_per_day,
                          area_m2, city, department, street, street_number, latitude, longitude,
                          amenities, rules, min_rental_days, max_rental_days, status, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', datetime('now'))
    `).run(id, userId, title, description, space_type || 'warehouse', price_per_month, price_per_day || null,
           area_m2, city, department || null, street || null, street_number || null,
           latitude || null, longitude || null, amenities || null, rules || null,
           min_rental_days || 30, max_rental_days || null);

    logAudit(req, 'SPACE_CREATED', 'space', id, null, req.body);
    res.status(201).json({ id, message: 'Espacio creado exitosamente' });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Error al crear espacio' });
  }
});

router.put('/spaces/:id', (req, res) => {
  try {
    const userId = req.user.id;
    const space = db.prepare('SELECT * FROM spaces WHERE id = ? AND user_id = ?').get(req.params.id, userId);
    
    if (!space) {
      return res.status(404).json({ error: 'Espacio no encontrado' });
    }

    const { title, description, space_type, price_per_month, price_per_day, area_m2,
            city, department, street, street_number, latitude, longitude,
            amenities, rules, min_rental_days, max_rental_days, status } = req.body;

    db.prepare(`
      UPDATE spaces SET 
        title = COALESCE(?, title),
        description = COALESCE(?, description),
        space_type = COALESCE(?, space_type),
        price_per_month = COALESCE(?, price_per_month),
        price_per_day = ?,
        area_m2 = COALESCE(?, area_m2),
        city = COALESCE(?, city),
        department = ?,
        street = ?,
        street_number = ?,
        latitude = ?,
        longitude = ?,
        amenities = ?,
        rules = ?,
        min_rental_days = COALESCE(?, min_rental_days),
        max_rental_days = ?,
        status = COALESCE(?, status),
        updated_at = datetime('now')
      WHERE id = ? AND user_id = ?
    `).run(title, description, space_type, price_per_month, price_per_day,
           area_m2, city, department, street, street_number, latitude, longitude,
           amenities, rules, min_rental_days, max_rental_days, status,
           req.params.id, userId);

    logAudit(req, 'SPACE_UPDATED', 'space', req.params.id, space, req.body);
    res.json({ message: 'Espacio actualizado' });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Error al actualizar espacio' });
  }
});

router.put('/spaces/:id/publish', (req, res) => {
  try {
    const userId = req.user.id;
    const space = db.prepare('SELECT * FROM spaces WHERE id = ? AND user_id = ?').get(req.params.id, userId);
    
    if (!space) {
      return res.status(404).json({ error: 'Espacio no encontrado' });
    }

    const user = db.prepare('SELECT anti_bypass_accepted FROM users WHERE id = ?').get(userId);
    if (!user.anti_bypass_accepted) {
      return res.status(403).json({ error: 'Debe aceptar la clausula anti-bypass antes de publicar' });
    }

    db.prepare(`UPDATE spaces SET status = 'published', updated_at = datetime('now') WHERE id = ?`).run(req.params.id);
    logAudit(req, 'SPACE_PUBLISHED', 'space', req.params.id, space, { status: 'published' });
    
    res.json({ message: 'Espacio publicado exitosamente' });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Error al publicar espacio' });
  }
});

router.put('/spaces/:id/unpublish', (req, res) => {
  try {
    const userId = req.user.id;
    const space = db.prepare('SELECT * FROM spaces WHERE id = ? AND user_id = ?').get(req.params.id, userId);
    
    if (!space) {
      return res.status(404).json({ error: 'Espacio no encontrado' });
    }

    db.prepare(`UPDATE spaces SET status = 'draft', updated_at = datetime('now') WHERE id = ?`).run(req.params.id);
    logAudit(req, 'SPACE_UNPUBLISHED', 'space', req.params.id, space, { status: 'draft' });
    
    res.json({ message: 'Espacio despublicado' });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Error al despublicar espacio' });
  }
});

router.get('/reservations', (req, res) => {
  try {
    const userId = req.user.id;
    const { status, space_id } = req.query;
    
    let query = `
      SELECT r.*, s.title as space_title, s.city as space_city,
             u.first_name || ' ' || u.last_name as guest_name,
             u.email as guest_email, u.phone as guest_phone
      FROM reservations r
      JOIN spaces s ON r.space_id = s.id
      JOIN users u ON r.user_id = u.id
      WHERE s.user_id = ?
    `;
    const params = [userId];
    
    if (status) {
      query += ' AND r.status = ?';
      params.push(status);
    }
    if (space_id) {
      query += ' AND r.space_id = ?';
      params.push(space_id);
    }
    
    query += ' ORDER BY r.created_at DESC';
    
    const reservations = db.prepare(query).all(...params);
    res.json(reservations);
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Error al obtener reservaciones' });
  }
});

router.get('/reservations/:id', (req, res) => {
  try {
    const userId = req.user.id;
    const reservation = db.prepare(`
      SELECT r.*, s.title as space_title, s.city as space_city,
             u.first_name || ' ' || u.last_name as guest_name,
             u.email as guest_email, u.phone as guest_phone
      FROM reservations r
      JOIN spaces s ON r.space_id = s.id
      JOIN users u ON r.user_id = u.id
      WHERE r.id = ? AND s.user_id = ?
    `).get(req.params.id, userId);

    if (!reservation) {
      return res.status(404).json({ error: 'Reservacion no encontrada' });
    }

    const payments = db.prepare(`
      SELECT * FROM payments WHERE reservation_id = ? ORDER BY created_at DESC
    `).all(req.params.id);

    res.json({ ...reservation, payments });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Error al obtener reservacion' });
  }
});

router.get('/payments', (req, res) => {
  try {
    const userId = req.user.id;
    const { status, from_date, to_date } = req.query;
    
    let query = `
      SELECT p.*, r.id as reservation_id, s.title as space_title,
             u.first_name || ' ' || u.last_name as guest_name
      FROM payments p
      JOIN reservations r ON p.reservation_id = r.id
      JOIN spaces s ON r.space_id = s.id
      JOIN users u ON r.user_id = u.id
      WHERE s.user_id = ?
    `;
    const params = [userId];
    
    if (status) {
      query += ' AND p.status = ?';
      params.push(status);
    }
    if (from_date) {
      query += ' AND p.created_at >= ?';
      params.push(from_date);
    }
    if (to_date) {
      query += ' AND p.created_at <= ?';
      params.push(to_date);
    }
    
    query += ' ORDER BY p.created_at DESC';
    
    const payments = db.prepare(query).all(...params);
    
    const summary = db.prepare(`
      SELECT 
        COALESCE(SUM(CASE WHEN p.status = 'completed' THEN p.amount ELSE 0 END), 0) as total_received,
        COALESCE(SUM(CASE WHEN p.escrow_status = 'held' THEN p.amount ELSE 0 END), 0) as in_escrow,
        COALESCE(SUM(CASE WHEN p.escrow_status = 'released' THEN p.amount ELSE 0 END), 0) as released,
        COUNT(DISTINCT p.id) as total_transactions
      FROM payments p
      JOIN reservations r ON p.reservation_id = r.id
      JOIN spaces s ON r.space_id = s.id
      WHERE s.user_id = ? AND p.status = 'completed'
    `).get(userId);

    res.json({ payments, summary });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Error al obtener pagos' });
  }
});

router.get('/calendar', (req, res) => {
  try {
    const userId = req.user.id;
    const { year, month } = req.query;
    
    const startDate = `${year || new Date().getFullYear()}-${String(month || new Date().getMonth() + 1).padStart(2, '0')}-01`;
    const endDate = `${year || new Date().getFullYear()}-${String(month || new Date().getMonth() + 1).padStart(2, '0')}-31`;
    
    const events = db.prepare(`
      SELECT r.id, r.start_date, r.end_date, r.status,
             s.id as space_id, s.title as space_title,
             u.first_name || ' ' || u.last_name as guest_name
      FROM reservations r
      JOIN spaces s ON r.space_id = s.id
      JOIN users u ON r.user_id = u.id
      WHERE s.user_id = ?
        AND ((r.start_date BETWEEN ? AND ?) OR (r.end_date BETWEEN ? AND ?)
             OR (r.start_date <= ? AND r.end_date >= ?))
        AND r.status NOT IN ('cancelled', 'refunded')
      ORDER BY r.start_date
    `).all(userId, startDate, endDate, startDate, endDate, startDate, endDate);

    const spaces = db.prepare(`
      SELECT id, title FROM spaces WHERE user_id = ? AND status = 'published'
    `).all(userId);

    res.json({ events, spaces });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Error al obtener calendario' });
  }
});

router.get('/statements', (req, res) => {
  try {
    const userId = req.user.id;
    const statements = db.prepare(`
      SELECT * FROM host_statements WHERE host_id = ? ORDER BY period_end DESC
    `).all(userId);

    res.json(statements);
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Error al obtener estados de cuenta' });
  }
});

router.get('/statements/:id', (req, res) => {
  try {
    const userId = req.user.id;
    const statement = db.prepare(`
      SELECT * FROM host_statements WHERE id = ? AND host_id = ?
    `).get(req.params.id, userId);

    if (!statement) {
      return res.status(404).json({ error: 'Estado de cuenta no encontrado' });
    }

    res.json(statement);
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Error al obtener estado de cuenta' });
  }
});

router.get('/profile', (req, res) => {
  try {
    const userId = req.user.id;
    const user = db.prepare(`
      SELECT id, email, role, person_type, first_name, last_name, company_name,
             ci, nit, phone, city, department, street, street_number, country,
             is_verified, anti_bypass_accepted, anti_bypass_accepted_at, created_at
      FROM users WHERE id = ?
    `).get(userId);

    const verification = db.prepare(`
      SELECT * FROM host_verifications WHERE host_id = ? ORDER BY created_at DESC LIMIT 1
    `).get(userId);

    const badges = db.prepare(`
      SELECT b.* FROM badge_definitions b
      JOIN user_badges ub ON b.id = ub.badge_id
      WHERE ub.user_id = ?
    `).all(userId);

    res.json({ ...user, verification, badges });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Error al obtener perfil' });
  }
});

module.exports = router;
