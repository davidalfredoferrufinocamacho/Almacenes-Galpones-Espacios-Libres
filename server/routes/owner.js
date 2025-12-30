const express = require('express');
const { body, validationResult } = require('express-validator');
const { db } = require('../config/database');
const { authenticateToken, requireRole } = require('../middleware/auth');
const { logAudit } = require('../middleware/audit');
const { getClientInfo, generateId } = require('../utils/helpers');
const { notifyContractSigned } = require('../utils/notificationsService');
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

    const appointments = db.prepare(`
      SELECT COUNT(*) as total,
             SUM(CASE WHEN a.status = 'solicitada' THEN 1 ELSE 0 END) as pending,
             SUM(CASE WHEN a.status = 'aceptada' THEN 1 ELSE 0 END) as confirmed
      FROM appointments a
      JOIN spaces s ON a.space_id = s.id
      WHERE s.host_id = ?
    `).get(userId);

    const contracts = db.prepare(`
      SELECT COUNT(*) as total,
             SUM(CASE WHEN c.status = 'active' THEN 1 ELSE 0 END) as active
      FROM contracts c
      JOIN spaces s ON c.space_id = s.id
      WHERE s.host_id = ?
    `).get(userId);

    const payments = db.prepare(`
      SELECT COUNT(*) as total
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

    res.json({
      spaces: spaces || { total: 0, published: 0, draft: 0 },
      reservations: reservations || { total: 0, active: 0, completed: 0, pending: 0 },
      earnings: earnings || { total_earned: 0, in_escrow: 0, released: 0 },
      appointments: appointments || { total: 0, pending: 0, confirmed: 0 },
      contracts: contracts || { total: 0, active: 0 },
      payments: payments || { total: 0 },
      recentReservations
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
            min_rental_days, max_rental_days, available_from, available_until } = req.body;

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
        min_rental_days, max_rental_days, available_from, available_until, status, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', datetime('now'))
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
      max_rental_days ? parseInt(max_rental_days) : null,
      available_from || null,
      available_until || null
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
            min_rental_days, max_rental_days, available_from, available_until, status } = req.body;

    const body = req.body;
    const isOpenVal = Object.prototype.hasOwnProperty.call(body, 'is_open') ? (is_open ? 1 : 0) : space.is_open;
    const hasRoofVal = Object.prototype.hasOwnProperty.call(body, 'has_roof') ? (has_roof ? 1 : 0) : space.has_roof;
    const rainProtectedVal = Object.prototype.hasOwnProperty.call(body, 'rain_protected') ? (rain_protected ? 1 : 0) : space.rain_protected;
    const dustProtectedVal = Object.prototype.hasOwnProperty.call(body, 'dust_protected') ? (dust_protected ? 1 : 0) : space.dust_protected;
    const hasSecurityVal = Object.prototype.hasOwnProperty.call(body, 'has_security') ? (has_security ? 1 : 0) : space.has_security;
    const securityDescVal = Object.prototype.hasOwnProperty.call(body, 'security_description') ? (security_description || null) : space.security_description;
    const scheduleVal = Object.prototype.hasOwnProperty.call(body, 'schedule') ? (schedule || null) : space.schedule;

    const availableFromVal = Object.prototype.hasOwnProperty.call(body, 'available_from') ? (available_from || null) : space.available_from;
    const availableUntilVal = Object.prototype.hasOwnProperty.call(body, 'available_until') ? (available_until || null) : space.available_until;

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
        available_from = ?,
        available_until = ?,
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
      availableFromVal,
      availableUntilVal,
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

router.get('/appointments', (req, res) => {
  try {
    const userId = req.user.id;
    const appointments = db.prepare(`
      SELECT a.*, s.title as space_title,
             u.first_name || ' ' || u.last_name as guest_name,
             u.email as guest_email, u.phone as guest_phone
      FROM appointments a
      JOIN spaces s ON a.space_id = s.id
      JOIN users u ON a.guest_id = u.id
      WHERE s.host_id = ?
      ORDER BY a.scheduled_date DESC, a.scheduled_time DESC
    `).all(userId);

    res.json(appointments);
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Error al obtener citas' });
  }
});

router.put('/appointments/:id', (req, res) => {
  try {
    const userId = req.user.id;
    const { status } = req.body;
    
    const validStatuses = ['solicitada', 'aceptada', 'rechazada', 'reprogramada', 'realizada', 'no_asistida'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: 'Estado invalido' });
    }
    
    const appointment = db.prepare(`
      SELECT a.* FROM appointments a
      JOIN spaces s ON a.space_id = s.id
      WHERE a.id = ? AND s.host_id = ?
    `).get(req.params.id, userId);

    if (!appointment) {
      return res.status(404).json({ error: 'Cita no encontrada' });
    }

    db.prepare(`UPDATE appointments SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`).run(status, req.params.id);

    res.json({ message: 'Cita actualizada' });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Error al actualizar cita' });
  }
});

router.get('/contracts', (req, res) => {
  try {
    const userId = req.user.id;
    const contracts = db.prepare(`
      SELECT c.*, s.title as space_title,
             u.first_name || ' ' || u.last_name as guest_name,
             u.email as guest_email
      FROM contracts c
      JOIN spaces s ON c.space_id = s.id
      JOIN users u ON c.guest_id = u.id
      WHERE s.host_id = ?
      ORDER BY c.created_at DESC
    `).all(userId);

    res.json(contracts);
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Error al obtener contratos' });
  }
});

router.post('/contracts/:id/sign', (req, res) => {
  try {
    const userId = req.user.id;
    
    const contract = db.prepare(`
      SELECT c.*, s.title as space_title
      FROM contracts c
      JOIN spaces s ON c.space_id = s.id
      WHERE c.id = ? AND s.host_id = ? AND c.status = 'pending'
    `).get(req.params.id, userId);

    if (!contract) {
      return res.status(404).json({ error: 'Contrato no encontrado o no esta en estado pendiente de firma' });
    }

    if (!contract.guest_signed || contract.guest_signed !== 1) {
      return res.status(400).json({ error: 'El cliente debe firmar primero antes de que usted pueda firmar. El contrato aun no ha sido firmado por el cliente.' });
    }

    if (contract.host_signed) {
      return res.status(400).json({ error: 'El contrato ya fue firmado por usted' });
    }

    const clientInfo = { ip: req.ip || req.headers['x-forwarded-for'] || 'unknown' };

    db.prepare(`
      UPDATE contracts SET 
        host_signed = 1,
        host_signed_at = CURRENT_TIMESTAMP,
        host_signature_ip = ?,
        status = 'signed',
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(clientInfo.ip, req.params.id);

    // Actualizar reservacion a contrato firmado
    if (contract.reservation_id) {
      db.prepare(`
        UPDATE reservations SET 
          status = 'contract_signed',
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(contract.reservation_id);
    }

    logAudit(userId, 'CONTRACT_SIGNED_HOST', 'contracts', req.params.id,
      { host_signed: 0 }, { host_signed: 1, ip: clientInfo.ip }, req);

    notifyContractSigned(req.params.id, 'HOST', req);

    res.json({ message: 'Contrato firmado exitosamente. El alquiler esta ahora activo.' });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Error al firmar contrato' });
  }
});

router.get('/income', (req, res) => {
  try {
    const userId = req.user.id;
    
    const summary = db.prepare(`
      SELECT 
        COALESCE(SUM(CASE WHEN p.status = 'completed' THEN p.amount ELSE 0 END), 0) as total,
        COALESCE(SUM(CASE WHEN p.escrow_status = 'held' THEN p.amount ELSE 0 END), 0) as in_escrow,
        COALESCE(SUM(CASE WHEN p.escrow_status = 'released' THEN p.amount ELSE 0 END), 0) as released
      FROM payments p
      JOIN reservations r ON p.reservation_id = r.id
      JOIN spaces s ON r.space_id = s.id
      WHERE s.host_id = ?
    `).get(userId);

    const income = db.prepare(`
      SELECT p.id, p.amount, p.status, p.payment_type as concept, p.created_at,
             s.title as space_title,
             u.first_name || ' ' || u.last_name as guest_name
      FROM payments p
      JOIN reservations r ON p.reservation_id = r.id
      JOIN spaces s ON r.space_id = s.id
      JOIN users u ON r.guest_id = u.id
      WHERE s.host_id = ? AND p.status = 'completed'
      ORDER BY p.created_at DESC
    `).all(userId);

    res.json({ income, summary: summary || { total: 0, in_escrow: 0, released: 0 } });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Error al obtener ingresos' });
  }
});

router.get('/invoices', (req, res) => {
  try {
    const userId = req.user.id;
    const invoices = db.prepare(`
      SELECT i.*, 
             s.title as space_title,
             u.first_name || ' ' || u.last_name as guest_name
      FROM invoices i
      JOIN contracts c ON i.contract_id = c.id
      JOIN spaces s ON c.space_id = s.id
      JOIN users u ON i.guest_id = u.id
      WHERE i.host_id = ?
      ORDER BY i.created_at DESC
    `).all(userId);

    res.json(invoices);
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Error al obtener facturas' });
  }
});

router.get('/invoices/received', (req, res) => {
  try {
    const userId = req.user.id;
    const invoices = db.prepare(`
      SELECT i.*, 
             s.title as space_title
      FROM invoices i
      LEFT JOIN contracts c ON i.contract_id = c.id
      LEFT JOIN spaces s ON c.space_id = s.id
      WHERE i.recipient_id = ? AND i.recipient_type = 'host'
      ORDER BY i.created_at DESC
    `).all(userId);

    res.json(invoices);
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Error al obtener facturas recibidas' });
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

// =====================================================================
// ENDPOINTS DE DISPONIBILIDAD DEL HOST
// =====================================================================

// Obtener disponibilidad de un espacio
router.get('/spaces/:id/availability', (req, res) => {
  try {
    const space = db.prepare('SELECT id FROM spaces WHERE id = ? AND host_id = ?').get(req.params.id, req.user.id);
    if (!space) {
      return res.status(404).json({ error: 'Espacio no encontrado' });
    }

    const availability = db.prepare(`
      SELECT * FROM host_availability 
      WHERE space_id = ? 
      ORDER BY day_of_week, start_time
    `).all(req.params.id);

    const exceptions = db.prepare(`
      SELECT * FROM host_availability_exceptions 
      WHERE space_id = ? AND exception_date >= date('now')
      ORDER BY exception_date
    `).all(req.params.id);

    res.json({ availability, exceptions });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Error al obtener disponibilidad' });
  }
});

// Crear o actualizar disponibilidad semanal
router.post('/spaces/:id/availability', [
  body('day_of_week').isInt({ min: 0, max: 6 }),
  body('start_time').matches(/^\d{2}:\d{2}$/),
  body('end_time').matches(/^\d{2}:\d{2}$/),
  body('slot_duration_minutes').optional().isInt({ min: 15, max: 240 }),
  body('buffer_minutes').optional().isInt({ min: 0, max: 60 })
], (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const space = db.prepare('SELECT id FROM spaces WHERE id = ? AND host_id = ?').get(req.params.id, req.user.id);
    if (!space) {
      return res.status(404).json({ error: 'Espacio no encontrado' });
    }

    const { day_of_week, start_time, end_time, slot_duration_minutes = 60, buffer_minutes = 15 } = req.body;

    // Verificar que end_time > start_time
    if (start_time >= end_time) {
      return res.status(400).json({ error: 'La hora de fin debe ser mayor a la hora de inicio' });
    }

    // Verificar si ya existe disponibilidad para este dia
    const existing = db.prepare(`
      SELECT id FROM host_availability 
      WHERE space_id = ? AND day_of_week = ? AND specific_date IS NULL
    `).get(req.params.id, day_of_week);

    if (existing) {
      // Actualizar existente
      db.prepare(`
        UPDATE host_availability SET 
          start_time = ?, end_time = ?, slot_duration_minutes = ?, buffer_minutes = ?, is_active = 1
        WHERE id = ?
      `).run(start_time, end_time, slot_duration_minutes, buffer_minutes, existing.id);

      logAudit(req.user.id, 'AVAILABILITY_UPDATED', 'host_availability', existing.id, null, {
        space_id: req.params.id, day_of_week, start_time, end_time
      }, req);

      res.json({ id: existing.id, message: 'Disponibilidad actualizada' });
    } else {
      // Crear nueva
      const id = generateId();
      db.prepare(`
        INSERT INTO host_availability (id, space_id, day_of_week, start_time, end_time, slot_duration_minutes, buffer_minutes, is_active)
        VALUES (?, ?, ?, ?, ?, ?, ?, 1)
      `).run(id, req.params.id, day_of_week, start_time, end_time, slot_duration_minutes, buffer_minutes);

      logAudit(req.user.id, 'AVAILABILITY_CREATED', 'host_availability', id, null, {
        space_id: req.params.id, day_of_week, start_time, end_time
      }, req);

      res.status(201).json({ id, message: 'Disponibilidad creada' });
    }
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Error al guardar disponibilidad' });
  }
});

// Actualizar disponibilidad masiva (todos los dias de la semana)
router.put('/spaces/:id/availability/bulk', [
  body('schedule').isArray(),
  body('schedule.*.day_of_week').isInt({ min: 0, max: 6 }),
  body('schedule.*.start_time').matches(/^\d{2}:\d{2}$/),
  body('schedule.*.end_time').matches(/^\d{2}:\d{2}$/),
  body('slot_duration_minutes').optional().isInt({ min: 15, max: 240 }),
  body('buffer_minutes').optional().isInt({ min: 0, max: 60 })
], (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const space = db.prepare('SELECT id FROM spaces WHERE id = ? AND host_id = ?').get(req.params.id, req.user.id);
    if (!space) {
      return res.status(404).json({ error: 'Espacio no encontrado' });
    }

    const { schedule, slot_duration_minutes = 60, buffer_minutes = 15 } = req.body;

    // Desactivar toda la disponibilidad existente
    db.prepare('UPDATE host_availability SET is_active = 0 WHERE space_id = ? AND specific_date IS NULL').run(req.params.id);

    // Crear/actualizar cada dia
    for (const day of schedule) {
      if (day.start_time >= day.end_time) continue;

      const existing = db.prepare(`
        SELECT id FROM host_availability 
        WHERE space_id = ? AND day_of_week = ? AND specific_date IS NULL
      `).get(req.params.id, day.day_of_week);

      if (existing) {
        db.prepare(`
          UPDATE host_availability SET 
            start_time = ?, end_time = ?, slot_duration_minutes = ?, buffer_minutes = ?, is_active = 1
          WHERE id = ?
        `).run(day.start_time, day.end_time, slot_duration_minutes, buffer_minutes, existing.id);
      } else {
        const id = generateId();
        db.prepare(`
          INSERT INTO host_availability (id, space_id, day_of_week, start_time, end_time, slot_duration_minutes, buffer_minutes, is_active)
          VALUES (?, ?, ?, ?, ?, ?, ?, 1)
        `).run(id, req.params.id, day.day_of_week, day.start_time, day.end_time, slot_duration_minutes, buffer_minutes);
      }
    }

    // Activar calendario del espacio
    db.prepare('UPDATE spaces SET is_calendar_active = 1 WHERE id = ?').run(req.params.id);

    logAudit(req.user.id, 'AVAILABILITY_BULK_UPDATE', 'host_availability', null, null, {
      space_id: req.params.id, days_count: schedule.length
    }, req);

    res.json({ message: 'Disponibilidad actualizada', days_updated: schedule.length });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Error al actualizar disponibilidad' });
  }
});

// Eliminar disponibilidad de un dia
router.delete('/spaces/:id/availability/:availabilityId', (req, res) => {
  try {
    const space = db.prepare('SELECT id FROM spaces WHERE id = ? AND host_id = ?').get(req.params.id, req.user.id);
    if (!space) {
      return res.status(404).json({ error: 'Espacio no encontrado' });
    }

    const availability = db.prepare('SELECT id FROM host_availability WHERE id = ? AND space_id = ?').get(req.params.availabilityId, req.params.id);
    if (!availability) {
      return res.status(404).json({ error: 'Disponibilidad no encontrada' });
    }

    db.prepare('DELETE FROM host_availability WHERE id = ?').run(req.params.availabilityId);

    logAudit(req.user.id, 'AVAILABILITY_DELETED', 'host_availability', req.params.availabilityId, null, null, req);

    res.json({ message: 'Disponibilidad eliminada' });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Error al eliminar disponibilidad' });
  }
});

// Agregar excepcion (bloquear fecha especifica)
router.post('/spaces/:id/availability/exceptions', [
  body('exception_date').isISO8601(),
  body('reason').optional().trim()
], (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const space = db.prepare('SELECT id FROM spaces WHERE id = ? AND host_id = ?').get(req.params.id, req.user.id);
    if (!space) {
      return res.status(404).json({ error: 'Espacio no encontrado' });
    }

    const { exception_date, reason } = req.body;

    // Verificar si ya existe una excepcion para esta fecha
    const existing = db.prepare(`
      SELECT id FROM host_availability_exceptions WHERE space_id = ? AND exception_date = ?
    `).get(req.params.id, exception_date);

    if (existing) {
      return res.status(400).json({ error: 'Ya existe una excepcion para esta fecha' });
    }

    const id = generateId();
    db.prepare(`
      INSERT INTO host_availability_exceptions (id, space_id, exception_date, is_blocked, reason)
      VALUES (?, ?, ?, 1, ?)
    `).run(id, req.params.id, exception_date, reason || null);

    logAudit(req.user.id, 'AVAILABILITY_EXCEPTION_CREATED', 'host_availability_exceptions', id, null, {
      space_id: req.params.id, exception_date, reason
    }, req);

    res.status(201).json({ id, message: 'Fecha bloqueada' });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Error al bloquear fecha' });
  }
});

// Eliminar excepcion
router.delete('/spaces/:id/availability/exceptions/:exceptionId', (req, res) => {
  try {
    const space = db.prepare('SELECT id FROM spaces WHERE id = ? AND host_id = ?').get(req.params.id, req.user.id);
    if (!space) {
      return res.status(404).json({ error: 'Espacio no encontrado' });
    }

    const exception = db.prepare('SELECT id FROM host_availability_exceptions WHERE id = ? AND space_id = ?').get(req.params.exceptionId, req.params.id);
    if (!exception) {
      return res.status(404).json({ error: 'Excepcion no encontrada' });
    }

    db.prepare('DELETE FROM host_availability_exceptions WHERE id = ?').run(req.params.exceptionId);

    logAudit(req.user.id, 'AVAILABILITY_EXCEPTION_DELETED', 'host_availability_exceptions', req.params.exceptionId, null, null, req);

    res.json({ message: 'Excepcion eliminada' });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Error al eliminar excepcion' });
  }
});

// Activar calendario de citas para un espacio
router.put('/spaces/:id/calendar/activate', (req, res) => {
  try {
    const space = db.prepare('SELECT id, is_calendar_active FROM spaces WHERE id = ? AND host_id = ?').get(req.params.id, req.user.id);
    if (!space) {
      return res.status(404).json({ error: 'Espacio no encontrado' });
    }

    db.prepare('UPDATE spaces SET is_calendar_active = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(req.params.id);

    logAudit(req.user.id, 'CALENDAR_ACTIVATED', 'spaces', req.params.id, { is_calendar_active: space.is_calendar_active }, { is_calendar_active: 1 }, req);

    res.json({ message: 'Calendario de citas activado' });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Error al activar calendario' });
  }
});

// Obtener citas del host (calendario)
router.get('/appointments', (req, res) => {
  try {
    const { status, space_id, from_date, to_date } = req.query;
    
    let query = `
      SELECT a.*, s.title as space_title, s.address as space_address, s.city as space_city,
             u.first_name as guest_first_name, u.last_name as guest_last_name, 
             u.email as guest_email, u.phone as guest_phone
      FROM appointments a
      JOIN spaces s ON a.space_id = s.id
      JOIN users u ON a.guest_id = u.id
      WHERE a.host_id = ?
    `;
    const params = [req.user.id];

    if (status) {
      query += ' AND a.status = ?';
      params.push(status);
    }
    if (space_id) {
      query += ' AND a.space_id = ?';
      params.push(space_id);
    }
    if (from_date) {
      query += ' AND a.scheduled_date >= ?';
      params.push(from_date);
    }
    if (to_date) {
      query += ' AND a.scheduled_date <= ?';
      params.push(to_date);
    }

    query += ' ORDER BY a.scheduled_date, a.scheduled_time';

    const appointments = db.prepare(query).all(...params);
    res.json(appointments);
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Error al obtener citas' });
  }
});

// Host marca visita completada
router.put('/appointments/:id/host-complete', (req, res) => {
  try {
    const appointment = db.prepare(`
      SELECT a.*, r.status as reservation_status 
      FROM appointments a
      JOIN reservations r ON a.reservation_id = r.id
      WHERE a.id = ? AND a.host_id = ? AND a.status = 'aceptada'
    `).get(req.params.id, req.user.id);

    if (!appointment) {
      return res.status(404).json({ error: 'Cita no encontrada o no esta en estado valido' });
    }

    db.prepare(`
      UPDATE appointments SET host_completed = 1, host_completed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?
    `).run(req.params.id);

    // Verificar si ambos marcaron como completada
    const updated = db.prepare('SELECT host_completed, guest_completed FROM appointments WHERE id = ?').get(req.params.id);
    
    if (updated.host_completed && updated.guest_completed) {
      db.prepare(`UPDATE appointments SET status = 'realizada', updated_at = CURRENT_TIMESTAMP WHERE id = ?`).run(req.params.id);
      db.prepare(`UPDATE reservations SET status = 'visit_completed', updated_at = CURRENT_TIMESTAMP WHERE id = ?`).run(appointment.reservation_id);
    }

    logAudit(req.user.id, 'APPOINTMENT_HOST_COMPLETED', 'appointments', req.params.id, null, {
      both_completed: updated.host_completed && updated.guest_completed
    }, req);

    res.json({ 
      message: 'Visita marcada como completada por el host',
      both_completed: updated.host_completed && updated.guest_completed
    });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Error al marcar visita' });
  }
});

// Host confirma fechas de alquiler propuestas por cliente
router.put('/reservations/:id/confirm-dates', (req, res) => {
  try {
    const reservation = db.prepare(`
      SELECT r.*, s.title as space_title, u.email as guest_email, u.first_name as guest_name
      FROM reservations r
      JOIN spaces s ON r.space_id = s.id
      JOIN users u ON r.guest_id = u.id
      WHERE r.id = ? AND r.host_id = ? AND r.status = 'dates_proposed'
    `).get(req.params.id, req.user.id);

    if (!reservation) {
      return res.status(404).json({ error: 'Reservacion no encontrada o no esta en estado valido para confirmar fechas' });
    }

    db.prepare(`
      UPDATE reservations SET 
        dates_confirmed_at = CURRENT_TIMESTAMP,
        status = 'dates_confirmed',
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(req.params.id);

    logAudit(req.user.id, 'RENTAL_DATES_CONFIRMED', 'reservations', req.params.id, null, {
      rental_start_date: reservation.rental_start_date,
      rental_end_date: reservation.rental_end_date,
      rental_start_time: reservation.rental_start_time
    }, req);

    res.json({ 
      message: 'Fechas de alquiler confirmadas. El cliente puede proceder con el pago del monto restante.',
      rental_start_date: reservation.rental_start_date,
      rental_end_date: reservation.rental_end_date,
      rental_start_time: reservation.rental_start_time,
      remaining_amount: reservation.remaining_amount
    });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Error al confirmar fechas' });
  }
});

// Host rechaza fechas y propone nuevas
router.put('/reservations/:id/counter-propose-dates', [
  body('rental_start_date').isISO8601().withMessage('Fecha de inicio requerida'),
  body('rental_end_date').isISO8601().withMessage('Fecha de fin requerida'),
  body('rental_start_time').matches(/^\d{2}:\d{2}$/).withMessage('Hora de inicio requerida')
], (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { rental_start_date, rental_end_date, rental_start_time, reason } = req.body;

    const reservation = db.prepare(`
      SELECT * FROM reservations 
      WHERE id = ? AND host_id = ? AND status = 'dates_proposed'
    `).get(req.params.id, req.user.id);

    if (!reservation) {
      return res.status(404).json({ error: 'Reservacion no encontrada o no esta en estado valido' });
    }

    // Validar que fecha fin sea posterior a inicio
    if (new Date(rental_end_date) <= new Date(rental_start_date)) {
      return res.status(400).json({ error: 'La fecha de fin debe ser posterior a la fecha de inicio' });
    }

    db.prepare(`
      UPDATE reservations SET 
        rental_start_date = ?,
        rental_end_date = ?,
        rental_start_time = ?,
        dates_proposed_by = 'HOST',
        dates_proposed_at = CURRENT_TIMESTAMP,
        status = 'dates_proposed',
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(rental_start_date, rental_end_date, rental_start_time, req.params.id);

    logAudit(req.user.id, 'RENTAL_DATES_COUNTER_PROPOSED', 'reservations', req.params.id, null, {
      rental_start_date, rental_end_date, rental_start_time, reason
    }, req);

    res.json({ 
      message: 'Nueva propuesta de fechas enviada al cliente.',
      rental_start_date,
      rental_end_date,
      rental_start_time
    });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Error al contraproponer fechas' });
  }
});

module.exports = router;
