const express = require('express');
const { body, validationResult } = require('express-validator');
const { db } = require('../config/database');
const { authenticateToken, requireRole } = require('../middleware/auth');
const { logAudit } = require('../middleware/audit');
const { getClientInfo, generateId } = require('../utils/helpers');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = 'uploads/profile-photos';
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${req.user.id}-${Date.now()}${ext}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ['.jpg', '.jpeg', '.png'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.includes(ext)) cb(null, true);
    else cb(new Error('Solo se permiten imagenes JPG o PNG'));
  }
});

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
      FROM spaces WHERE host_id = ?
    `).get(userId);

    const reservations = db.prepare(`
      SELECT COUNT(*) as total,
             SUM(CASE WHEN r.status = 'confirmed' THEN 1 ELSE 0 END) as active,
             SUM(CASE WHEN r.status = 'completed' THEN 1 ELSE 0 END) as completed,
             SUM(CASE WHEN r.status = 'pending' THEN 1 ELSE 0 END) as pending
      FROM reservations r
      JOIN spaces s ON r.space_id = s.id
      WHERE s.host_id = ?
    `).get(userId);

    const earnings = db.prepare(`
      SELECT 
        COALESCE(SUM(CASE WHEN p.status = 'completed' THEN p.amount ELSE 0 END), 0) as total_earned,
        COALESCE(SUM(CASE WHEN p.escrow_status = 'held' THEN p.amount ELSE 0 END), 0) as in_escrow,
        COALESCE(SUM(CASE WHEN p.escrow_status = 'released' THEN p.amount ELSE 0 END), 0) as released
      FROM payments p
      JOIN reservations r ON p.reservation_id = r.id
      JOIN spaces s ON r.space_id = s.id
      WHERE s.host_id = ?
    `).get(userId);

    const recentReservations = db.prepare(`
      SELECT r.id, r.created_at, r.status, r.total_amount,
             r.period_type, r.period_quantity,
             s.title as space_title,
             u.first_name || ' ' || u.last_name as guest_name
      FROM reservations r
      JOIN spaces s ON r.space_id = s.id
      JOIN users u ON r.guest_id = u.id
      WHERE s.host_id = ?
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
      WHERE s.host_id = ? AND p.status = 'completed'
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
      WHERE s.host_id = ?
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
      SELECT * FROM spaces WHERE id = ? AND host_id = ?
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
  body('city').notEmpty()
], (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  try {
    const userId = req.user.id;
    const id = generateId();
    const { title, description, space_type, 
            price_per_sqm_day, price_per_sqm_week, price_per_sqm_month, 
            price_per_sqm_quarter, price_per_sqm_semester, price_per_sqm_year,
            price_per_month, price_per_day,
            total_sqm, available_sqm, area_m2,
            is_open, has_roof, rain_protected, dust_protected, 
            access_type, has_security, security_description, schedule,
            city, department, address, street, street_number, latitude, longitude,
            min_rental_days, max_rental_days } = req.body;

    console.log('Creando espacio:', req.body);

    const finalTotalSqm = parseFloat(total_sqm || area_m2 || 0);
    const finalAvailableSqm = parseFloat(available_sqm || finalTotalSqm);
    const finalAddress = address || street || 'Sin dirección';
    const finalDepartment = department || 'Bolivia';
    const finalCity = city || 'Bolivia';

    db.prepare(`
      INSERT INTO spaces (
        id, host_id, title, description, space_type,
        total_sqm, available_sqm,
        price_per_sqm_day, price_per_sqm_week, price_per_sqm_month,
        price_per_sqm_quarter, price_per_sqm_semester, price_per_sqm_year,
        is_open, has_roof, rain_protected, dust_protected,
        access_type, has_security, security_description, schedule,
        address, city, department, latitude, longitude,
        min_rental_days, max_rental_days, status, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', datetime('now'))
    `).run(
      id, userId, title, description, space_type || 'almacen',
      finalTotalSqm, finalAvailableSqm,
      parseFloat(price_per_sqm_day || price_per_day) || null,
      parseFloat(price_per_sqm_week) || null,
      parseFloat(price_per_sqm_month || price_per_month) || null,
      parseFloat(price_per_sqm_quarter) || null,
      parseFloat(price_per_sqm_semester) || null,
      parseFloat(price_per_sqm_year) || null,
      is_open ? 1 : 0,
      has_roof !== false ? 1 : 0,
      rain_protected !== false ? 1 : 0,
      dust_protected !== false ? 1 : 0,
      access_type || 'controlado',
      has_security ? 1 : 0,
      security_description || null,
      schedule || null,
      finalAddress, finalCity, finalDepartment,
      latitude ? parseFloat(latitude) : null,
      longitude ? parseFloat(longitude) : null,
      min_rental_days ? parseInt(min_rental_days) : 1,
      max_rental_days ? parseInt(max_rental_days) : null
    );

    const sanitizedBody = { ...req.body };
    delete sanitizedBody.password;
    logAudit(userId, 'SPACE_CREATED', 'space', id, null, sanitizedBody, req);
    res.status(201).json({ id, message: 'Espacio creado exitosamente' });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Error al crear espacio' });
  }
});

router.put('/spaces/:id', (req, res) => {
  try {
    const userId = req.user.id;
    const space = db.prepare('SELECT * FROM spaces WHERE id = ? AND host_id = ?').get(req.params.id, userId);
    
    if (!space) {
      return res.status(404).json({ error: 'Espacio no encontrado' });
    }

    const { title, description, space_type,
            price_per_sqm_day, price_per_sqm_week, price_per_sqm_month,
            price_per_sqm_quarter, price_per_sqm_semester, price_per_sqm_year,
            total_sqm, available_sqm,
            is_open, has_roof, rain_protected, dust_protected,
            access_type, has_security, security_description, schedule,
            city, department, address, latitude, longitude,
            min_rental_days, max_rental_days, status } = req.body;

    const body = req.body;
    const isOpenVal = Object.prototype.hasOwnProperty.call(body, 'is_open') ? (is_open ? 1 : 0) : space.is_open;
    const hasRoofVal = Object.prototype.hasOwnProperty.call(body, 'has_roof') ? (has_roof ? 1 : 0) : space.has_roof;
    const rainProtectedVal = Object.prototype.hasOwnProperty.call(body, 'rain_protected') ? (rain_protected ? 1 : 0) : space.rain_protected;
    const dustProtectedVal = Object.prototype.hasOwnProperty.call(body, 'dust_protected') ? (dust_protected ? 1 : 0) : space.dust_protected;
    const hasSecurityVal = Object.prototype.hasOwnProperty.call(body, 'has_security') ? (has_security ? 1 : 0) : space.has_security;
    const securityDescVal = Object.prototype.hasOwnProperty.call(body, 'security_description') ? (security_description || null) : space.security_description;
    const scheduleVal = Object.prototype.hasOwnProperty.call(body, 'schedule') ? (schedule || null) : space.schedule;

    db.prepare(`
      UPDATE spaces SET 
        title = COALESCE(?, title),
        description = COALESCE(?, description),
        space_type = COALESCE(?, space_type),
        total_sqm = COALESCE(?, total_sqm),
        available_sqm = COALESCE(?, available_sqm),
        price_per_sqm_day = ?,
        price_per_sqm_week = ?,
        price_per_sqm_month = ?,
        price_per_sqm_quarter = ?,
        price_per_sqm_semester = ?,
        price_per_sqm_year = ?,
        is_open = ?,
        has_roof = ?,
        rain_protected = ?,
        dust_protected = ?,
        access_type = COALESCE(?, access_type),
        has_security = ?,
        security_description = ?,
        schedule = ?,
        city = COALESCE(?, city),
        department = COALESCE(?, department),
        address = COALESCE(?, address),
        latitude = ?,
        longitude = ?,
        min_rental_days = COALESCE(?, min_rental_days),
        max_rental_days = ?,
        status = COALESCE(?, status),
        updated_at = datetime('now')
      WHERE id = ? AND host_id = ?
    `).run(
      title, description, space_type,
      total_sqm ? parseFloat(total_sqm) : null,
      available_sqm ? parseFloat(available_sqm) : null,
      price_per_sqm_day ? parseFloat(price_per_sqm_day) : null,
      price_per_sqm_week ? parseFloat(price_per_sqm_week) : null,
      price_per_sqm_month ? parseFloat(price_per_sqm_month) : null,
      price_per_sqm_quarter ? parseFloat(price_per_sqm_quarter) : null,
      price_per_sqm_semester ? parseFloat(price_per_sqm_semester) : null,
      price_per_sqm_year ? parseFloat(price_per_sqm_year) : null,
      isOpenVal,
      hasRoofVal,
      rainProtectedVal,
      dustProtectedVal,
      access_type,
      hasSecurityVal,
      securityDescVal,
      scheduleVal,
      city, department, address,
      latitude ? parseFloat(latitude) : null,
      longitude ? parseFloat(longitude) : null,
      min_rental_days ? parseInt(min_rental_days) : null,
      max_rental_days ? parseInt(max_rental_days) : null,
      status,
      req.params.id, userId
    );

    const sanitizedBody = { ...req.body };
    delete sanitizedBody.password;
    logAudit(userId, 'SPACE_UPDATED', 'space', req.params.id, space, sanitizedBody, req);
    res.json({ message: 'Espacio actualizado' });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Error al actualizar espacio' });
  }
});

router.delete('/spaces/:id', (req, res) => {
  try {
    const userId = req.user.id;
    const space = db.prepare('SELECT * FROM spaces WHERE id = ? AND host_id = ?').get(req.params.id, userId);
    
    if (!space) {
      return res.status(404).json({ error: 'Espacio no encontrado' });
    }

    const activeReservations = db.prepare(`
      SELECT COUNT(*) as count FROM reservations 
      WHERE space_id = ? AND status NOT IN ('cancelled', 'completed', 'refunded')
    `).get(req.params.id);

    if (activeReservations.count > 0) {
      return res.status(400).json({ error: 'No se puede eliminar un espacio con reservaciones activas' });
    }

    db.prepare('DELETE FROM space_photos WHERE space_id = ?').run(req.params.id);
    db.prepare('DELETE FROM host_availability WHERE space_id = ?').run(req.params.id);
    db.prepare('DELETE FROM spaces WHERE id = ?').run(req.params.id);

    logAudit(userId, 'SPACE_DELETED', 'space', req.params.id, space, null, req);
    res.json({ message: 'Espacio eliminado exitosamente' });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Error al eliminar espacio' });
  }
});

router.put('/spaces/:id/publish', (req, res) => {
  try {
    const userId = req.user.id;
    const space = db.prepare('SELECT * FROM spaces WHERE id = ? AND host_id = ?').get(req.params.id, userId);
    
    if (!space) {
      return res.status(404).json({ error: 'Espacio no encontrado' });
    }

    const user = db.prepare('SELECT anti_bypass_accepted FROM users WHERE id = ?').get(userId);
    if (!user.anti_bypass_accepted) {
      return res.status(403).json({ error: 'Debe aceptar la clausula anti-bypass antes de publicar' });
    }

    db.prepare(`UPDATE spaces SET status = 'published', updated_at = datetime('now') WHERE id = ?`).run(req.params.id);
    logAudit(userId, 'SPACE_PUBLISHED', 'space', req.params.id, { status: space.status }, { status: 'published' }, req);
    
    res.json({ message: 'Espacio publicado exitosamente' });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Error al publicar espacio' });
  }
});

router.put('/spaces/:id/unpublish', (req, res) => {
  try {
    const userId = req.user.id;
    const space = db.prepare('SELECT * FROM spaces WHERE id = ? AND host_id = ?').get(req.params.id, userId);
    
    if (!space) {
      return res.status(404).json({ error: 'Espacio no encontrado' });
    }

    db.prepare(`UPDATE spaces SET status = 'draft', updated_at = datetime('now') WHERE id = ?`).run(req.params.id);
    logAudit(userId, 'SPACE_UNPUBLISHED', 'space', req.params.id, { status: space.status }, { status: 'draft' }, req);
    
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
      WHERE s.host_id = ?
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
      WHERE r.id = ? AND s.host_id = ?
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
      WHERE s.host_id = ?
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
      WHERE s.host_id = ? AND p.status = 'completed'
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
      WHERE s.host_id = ?
        AND ((r.start_date BETWEEN ? AND ?) OR (r.end_date BETWEEN ? AND ?)
             OR (r.start_date <= ? AND r.end_date >= ?))
        AND r.status NOT IN ('cancelled', 'refunded')
      ORDER BY r.start_date
    `).all(userId, startDate, endDate, startDate, endDate, startDate, endDate);

    const spaces = db.prepare(`
      SELECT id, title FROM spaces WHERE host_id = ? AND status = 'published'
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
             ci, nit, phone, address, city, department, street, street_number, floor, country,
             profile_photo, email_notifications, newsletter,
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

router.put('/profile', [
  body('first_name').optional().trim().isLength({ min: 2, max: 50 }),
  body('last_name').optional().trim().isLength({ min: 2, max: 50 }),
  body('phone').optional().trim(),
  body('address').optional().trim().isLength({ max: 200 }),
  body('street_number').optional().trim().isLength({ max: 20 }),
  body('floor').optional().trim().isLength({ max: 20 }),
  body('city').optional().trim().isLength({ max: 50 }),
  body('department').optional().trim(),
  body('country').optional().trim(),
  body('nit').optional().trim().isLength({ max: 20 })
], (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const allowedFields = ['first_name', 'last_name', 'phone', 'address', 'street_number', 'floor',
      'city', 'department', 'country', 'nit', 'email_notifications', 'newsletter', 'anti_bypass_accepted'];
    
    const currentUser = db.prepare('SELECT anti_bypass_accepted FROM users WHERE id = ?').get(req.user.id);
    
    const updates = [];
    const values = [];

    for (const field of allowedFields) {
      if (req.body[field] !== undefined) {
        const val = req.body[field];
        
        if (field === 'anti_bypass_accepted') {
          if (currentUser.anti_bypass_accepted === 1) {
            continue;
          }
          if (!val) {
            continue;
          }
          updates.push(`${field} = ?`);
          values.push(1);
          updates.push('anti_bypass_accepted_at = ?');
          values.push(new Date().toISOString());
          continue;
        }
        
        updates.push(`${field} = ?`);
        if (field === 'email_notifications' || field === 'newsletter') {
          values.push(val ? 1 : 0);
        } else {
          values.push(val);
        }
      }
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No hay cambios' });
    }

    updates.push('updated_at = CURRENT_TIMESTAMP');
    values.push(req.user.id);

    db.prepare(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`).run(...values);

    logAudit(req.user.id, 'PROFILE_UPDATED', 'users', req.user.id, null, req.body, req);

    res.json({ message: 'Perfil actualizado exitosamente' });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Error al actualizar perfil' });
  }
});

router.post('/profile/photo', upload.single('photo'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No se proporciono imagen' });
    }

    const user = db.prepare('SELECT profile_photo FROM users WHERE id = ?').get(req.user.id);
    
    if (user.profile_photo && fs.existsSync(user.profile_photo)) {
      fs.unlinkSync(user.profile_photo);
    }

    const photoPath = req.file.path;
    db.prepare('UPDATE users SET profile_photo = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
      .run(photoPath, req.user.id);

    logAudit(req.user.id, 'PROFILE_PHOTO_UPDATED', 'users', req.user.id, 
      { old_photo: user.profile_photo }, { new_photo: photoPath }, req);

    res.json({ message: 'Foto actualizada', photo_url: photoPath });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Error al subir foto' });
  }
});

router.delete('/profile/photo', (req, res) => {
  try {
    const user = db.prepare('SELECT profile_photo FROM users WHERE id = ?').get(req.user.id);

    if (user.profile_photo && fs.existsSync(user.profile_photo)) {
      fs.unlinkSync(user.profile_photo);
    }

    db.prepare('UPDATE users SET profile_photo = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
      .run(req.user.id);

    logAudit(req.user.id, 'PROFILE_PHOTO_DELETED', 'users', req.user.id, 
      { photo: user.profile_photo }, null, req);

    res.json({ message: 'Foto eliminada' });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Error al eliminar foto' });
  }
});

router.put('/profile/password', [
  body('current_password').notEmpty(),
  body('new_password').isLength({ min: 8 }).matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/),
  body('confirm_password').custom((value, { req }) => value === req.body.new_password)
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const user = db.prepare('SELECT password FROM users WHERE id = ?').get(req.user.id);

    const isValid = await bcrypt.compare(req.body.current_password, user.password);
    if (!isValid) {
      return res.status(400).json({ error: 'Contrasena actual incorrecta' });
    }

    const hashedPassword = await bcrypt.hash(req.body.new_password, 10);
    db.prepare('UPDATE users SET password = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
      .run(hashedPassword, req.user.id);

    logAudit(req.user.id, 'PASSWORD_CHANGED', 'users', req.user.id, null, null, req);

    res.json({ message: 'Contrasena actualizada exitosamente' });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Error al cambiar contrasena' });
  }
});

router.delete('/account', async (req, res) => {
  try {
    const userId = req.user.id;
    const user = db.prepare('SELECT email, first_name, last_name, profile_photo FROM users WHERE id = ?').get(userId);
    
    if (!user) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }

    const hasActiveSpaces = db.prepare(`
      SELECT COUNT(*) as count FROM spaces s
      WHERE s.host_id = ? AND s.status IN ('published', 'paused')
      AND EXISTS (
        SELECT 1 FROM reservations r 
        WHERE r.space_id = s.id AND r.status NOT IN ('cancelled', 'refunded', 'completed', 'expired')
      )
    `).get(userId);

    if (hasActiveSpaces.count > 0) {
      return res.status(400).json({ 
        error: 'No puede eliminar su cuenta mientras tenga espacios con reservaciones activas. Por favor espere a que se completen o cancelen las reservaciones.' 
      });
    }

    const hasActiveContracts = db.prepare(`
      SELECT COUNT(*) as count FROM contracts c
      JOIN spaces s ON c.space_id = s.id
      WHERE s.host_id = ? AND c.status NOT IN ('cancelled', 'completed', 'expired')
    `).get(userId);

    if (hasActiveContracts.count > 0) {
      return res.status(400).json({ 
        error: 'No puede eliminar su cuenta mientras tenga contratos activos o pendientes de firma.' 
      });
    }

    const hasPendingPayments = db.prepare(`
      SELECT COUNT(*) as count FROM payments p
      JOIN reservations r ON p.reservation_id = r.id
      JOIN spaces s ON r.space_id = s.id
      WHERE s.host_id = ? AND p.escrow_status = 'held'
    `).get(userId);

    if (hasPendingPayments.count > 0) {
      return res.status(400).json({ 
        error: 'No puede eliminar su cuenta mientras tenga pagos pendientes de liberacion en escrow.' 
      });
    }

    if (user.profile_photo && fs.existsSync(user.profile_photo)) {
      fs.unlinkSync(user.profile_photo);
    }

    db.prepare("UPDATE spaces SET status = 'deleted' WHERE host_id = ?").run(userId);
    db.prepare('DELETE FROM notification_log WHERE recipient_id = ?').run(userId);
    db.prepare('UPDATE audit_log SET user_id = NULL WHERE user_id = ?').run(userId);
    db.prepare('DELETE FROM campaign_recipients WHERE user_id = ?').run(userId);

    const auditData = { email: user.email, name: `${user.first_name} ${user.last_name}`, deleted_at: new Date().toISOString() };
    db.prepare(`
      INSERT INTO audit_log (id, user_id, action, entity_type, entity_id, old_data, new_data, ip_address, user_agent, created_at)
      VALUES (?, NULL, 'HOST_ACCOUNT_DELETED', 'users', ?, ?, NULL, ?, ?, CURRENT_TIMESTAMP)
    `).run(`audit_${Date.now()}`, userId, JSON.stringify(auditData), req.ip, req.get('User-Agent'));

    db.prepare('DELETE FROM users WHERE id = ?').run(userId);

    res.json({ message: 'Cuenta eliminada exitosamente' });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Error al eliminar cuenta' });
  }
});

module.exports = router;
