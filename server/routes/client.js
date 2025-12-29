const express = require('express');
const { body, validationResult } = require('express-validator');
const { db } = require('../config/database');
const { authenticateToken, requireRole } = require('../middleware/auth');
const { logAudit } = require('../middleware/audit');
const { generateId, getClientInfo } = require('../utils/helpers');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const router = express.Router();

router.use(authenticateToken);
router.use(requireRole('GUEST'));

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

router.get('/dashboard', (req, res) => {
  try {
    const userId = req.user.id;

    const reservationsTotal = db.prepare(`
      SELECT COUNT(*) as count FROM reservations WHERE guest_id = ?
    `).get(userId).count;

    const reservationsActive = db.prepare(`
      SELECT COUNT(*) as count FROM reservations 
      WHERE guest_id = ? AND status IN ('confirmed', 'contract_pending', 'contract_signed')
    `).get(userId).count;

    const contractsSigned = db.prepare(`
      SELECT COUNT(*) as count FROM contracts 
      WHERE guest_id = ? AND guest_signed = 1 AND host_signed = 1
    `).get(userId).count;

    const totalPaid = db.prepare(`
      SELECT COALESCE(SUM(amount), 0) as total FROM payments p
      JOIN reservations r ON p.reservation_id = r.id
      WHERE r.guest_id = ? AND p.status = 'completed'
    `).get(userId).total;

    const nextReservation = db.prepare(`
      SELECT r.*, s.title as space_title, s.city
      FROM reservations r
      JOIN spaces s ON r.space_id = s.id
      WHERE r.guest_id = ? AND r.start_date >= date('now') AND r.status NOT IN ('cancelled', 'refunded')
      ORDER BY r.start_date ASC LIMIT 1
    `).get(userId);

    const pendingPayments = db.prepare(`
      SELECT r.id, r.remaining_amount, s.title as space_title
      FROM reservations r
      JOIN spaces s ON r.space_id = s.id
      WHERE r.guest_id = ? AND r.remaining_amount > 0 AND r.status NOT IN ('cancelled', 'refunded')
    `).all(userId);

    const contractsToSign = db.prepare(`
      SELECT c.id, c.contract_number, s.title as space_title
      FROM contracts c
      JOIN spaces s ON c.space_id = s.id
      WHERE c.guest_id = ? AND c.guest_signed = 0 AND c.status = 'pending'
    `).all(userId);

    const recentActivity = db.prepare(`
      SELECT 'payment' as type, p.created_at, p.amount, 'Pago realizado' as description
      FROM payments p
      JOIN reservations r ON p.reservation_id = r.id
      WHERE r.guest_id = ? AND p.status = 'completed'
      UNION ALL
      SELECT 'contract' as type, c.created_at, c.total_amount as amount, 'Contrato creado' as description
      FROM contracts c WHERE c.guest_id = ?
      UNION ALL
      SELECT 'reservation' as type, r.created_at, r.total_amount as amount, 'Reservacion creada' as description
      FROM reservations r WHERE r.guest_id = ?
      ORDER BY created_at DESC LIMIT 5
    `).all(userId, userId, userId);

    res.json({
      stats: {
        reservationsTotal,
        reservationsActive,
        contractsSigned,
        totalPaid
      },
      nextReservation,
      pendingPayments,
      contractsToSign,
      recentActivity
    });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Error al obtener dashboard' });
  }
});

router.get('/reservations', (req, res) => {
  try {
    const { status, period } = req.query;
    let query = `
      SELECT r.*, s.title as space_title, s.city, s.type as space_type,
             u.first_name || ' ' || u.last_name as host_name,
             (SELECT url FROM space_photos WHERE space_id = s.id LIMIT 1) as space_photo
      FROM reservations r
      JOIN spaces s ON r.space_id = s.id
      JOIN users u ON s.host_id = u.id
      WHERE r.guest_id = ?
    `;
    const params = [req.user.id];

    if (status) {
      query += ' AND r.status = ?';
      params.push(status);
    }

    if (period === 'month') {
      query += " AND r.created_at >= date('now', '-1 month')";
    } else if (period === '3months') {
      query += " AND r.created_at >= date('now', '-3 months')";
    } else if (period === 'year') {
      query += " AND r.created_at >= date('now', '-1 year')";
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
    const reservation = db.prepare(`
      SELECT r.*, s.title as space_title, s.address, s.city, s.type as space_type,
             s.description as space_description, s.amenities,
             u.first_name || ' ' || u.last_name as host_name
      FROM reservations r
      JOIN spaces s ON r.space_id = s.id
      JOIN users u ON s.host_id = u.id
      WHERE r.id = ? AND r.guest_id = ?
    `).get(req.params.id, req.user.id);

    if (!reservation) {
      return res.status(404).json({ error: 'Reservacion no encontrada' });
    }

    const payments = db.prepare(`
      SELECT * FROM payments WHERE reservation_id = ? ORDER BY created_at DESC
    `).all(req.params.id);

    const contract = db.prepare(`
      SELECT * FROM contracts WHERE reservation_id = ?
    `).get(req.params.id);

    const invoice = contract ? db.prepare(`
      SELECT * FROM invoices WHERE contract_id = ?
    `).get(contract.id) : null;

    res.json({ ...reservation, payments, contract, invoice });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Error al obtener reservacion' });
  }
});

router.post('/reservations/:id/cancel', (req, res) => {
  try {
    const reservation = db.prepare(`
      SELECT * FROM reservations WHERE id = ? AND guest_id = ?
    `).get(req.params.id, req.user.id);

    if (!reservation) {
      return res.status(404).json({ error: 'Reservacion no encontrada' });
    }

    if (!['pending', 'confirmed'].includes(reservation.status)) {
      return res.status(400).json({ error: 'Esta reservacion no puede ser cancelada' });
    }

    db.prepare(`
      UPDATE reservations SET status = 'cancelled', updated_at = CURRENT_TIMESTAMP WHERE id = ?
    `).run(req.params.id);

    logAudit(req.user.id, 'RESERVATION_CANCELLED', 'reservations', req.params.id, 
      { status: reservation.status }, { status: 'cancelled' }, req);

    res.json({ message: 'Reservacion cancelada exitosamente' });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Error al cancelar reservacion' });
  }
});

router.get('/contracts', (req, res) => {
  try {
    const { status } = req.query;
    let query = `
      SELECT c.*, s.title as space_title,
             u.first_name || ' ' || u.last_name as host_name
      FROM contracts c
      JOIN spaces s ON c.space_id = s.id
      JOIN users u ON s.host_id = u.id
      WHERE c.guest_id = ?
    `;
    const params = [req.user.id];

    if (status === 'pending') {
      query += ' AND c.guest_signed = 0';
    } else if (status === 'signed') {
      query += ' AND c.guest_signed = 1 AND c.host_signed = 1';
    }

    query += ' ORDER BY c.created_at DESC';

    const contracts = db.prepare(query).all(...params);
    res.json(contracts);
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Error al obtener contratos' });
  }
});

router.get('/contracts/:id', (req, res) => {
  try {
    const contract = db.prepare(`
      SELECT c.*, s.title as space_title, s.address, s.city,
             uh.first_name || ' ' || uh.last_name as host_name,
             uh.email as host_email
      FROM contracts c
      JOIN spaces s ON c.space_id = s.id
      JOIN users uh ON c.host_id = uh.id
      WHERE c.id = ? AND c.guest_id = ?
    `).get(req.params.id, req.user.id);

    if (!contract) {
      return res.status(404).json({ error: 'Contrato no encontrado' });
    }

    const extensions = db.prepare(`
      SELECT * FROM contract_extensions WHERE contract_id = ? ORDER BY created_at DESC
    `).all(req.params.id);

    const reservation = db.prepare(`
      SELECT * FROM reservations WHERE id = ?
    `).get(contract.reservation_id);

    res.json({ ...contract, extensions, reservation });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Error al obtener contrato' });
  }
});

router.post('/contracts/:id/sign', (req, res) => {
  try {
    const contract = db.prepare(`
      SELECT * FROM contracts WHERE id = ? AND guest_id = ?
    `).get(req.params.id, req.user.id);

    if (!contract) {
      return res.status(404).json({ error: 'Contrato no encontrado' });
    }

    if (contract.guest_signed) {
      return res.status(400).json({ error: 'El contrato ya fue firmado' });
    }

    const clientInfo = getClientInfo(req);

    db.prepare(`
      UPDATE contracts SET 
        guest_signed = 1,
        guest_signed_at = CURRENT_TIMESTAMP,
        guest_signature_ip = ?,
        status = CASE WHEN host_signed = 1 THEN 'signed' ELSE status END,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(clientInfo.ip, req.params.id);

    logAudit(req.user.id, 'CONTRACT_SIGNED_GUEST', 'contracts', req.params.id,
      { guest_signed: 0 }, { guest_signed: 1, ip: clientInfo.ip }, req);

    res.json({ message: 'Contrato firmado exitosamente' });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Error al firmar contrato' });
  }
});

router.get('/payments', (req, res) => {
  try {
    const { type, status } = req.query;

    let query = `
      SELECT p.*, s.title as space_title
      FROM payments p
      JOIN reservations r ON p.reservation_id = r.id
      JOIN spaces s ON r.space_id = s.id
      WHERE r.guest_id = ?
    `;
    const params = [req.user.id];

    if (type) {
      query += ' AND p.payment_type = ?';
      params.push(type);
    }
    if (status) {
      query += ' AND p.status = ?';
      params.push(status);
    }

    query += ' ORDER BY p.created_at DESC';

    const payments = db.prepare(query).all(...params);

    const summary = db.prepare(`
      SELECT 
        COALESCE(SUM(CASE WHEN p.status = 'completed' THEN p.amount ELSE 0 END), 0) as total_paid,
        COALESCE(SUM(CASE WHEN p.payment_type = 'deposit' AND p.status = 'completed' THEN p.amount ELSE 0 END), 0) as total_deposits,
        COALESCE(SUM(CASE WHEN p.payment_type = 'refund' THEN ABS(p.amount) ELSE 0 END), 0) as total_refunds,
        COALESCE(SUM(CASE WHEN p.status = 'pending' THEN p.amount ELSE 0 END), 0) as pending_amount
      FROM payments p
      JOIN reservations r ON p.reservation_id = r.id
      WHERE r.guest_id = ?
    `).get(req.user.id);

    res.json({ payments, summary });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Error al obtener pagos' });
  }
});

router.get('/payments/:id', (req, res) => {
  try {
    const payment = db.prepare(`
      SELECT p.*, s.title as space_title, r.start_date, r.end_date
      FROM payments p
      JOIN reservations r ON p.reservation_id = r.id
      JOIN spaces s ON r.space_id = s.id
      WHERE p.id = ? AND r.guest_id = ?
    `).get(req.params.id, req.user.id);

    if (!payment) {
      return res.status(404).json({ error: 'Pago no encontrado' });
    }

    res.json(payment);
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Error al obtener pago' });
  }
});

router.get('/invoices', (req, res) => {
  try {
    const { status } = req.query;

    let query = `
      SELECT i.*, c.contract_number, s.title as space_title
      FROM invoices i
      JOIN contracts c ON i.contract_id = c.id
      JOIN spaces s ON c.space_id = s.id
      WHERE i.guest_id = ?
    `;
    const params = [req.user.id];

    if (status) {
      query += ' AND i.status = ?';
      params.push(status);
    }

    query += ' ORDER BY i.created_at DESC';

    const invoices = db.prepare(query).all(...params);
    res.json(invoices);
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Error al obtener facturas' });
  }
});

router.get('/invoices/:id', (req, res) => {
  try {
    const invoice = db.prepare(`
      SELECT i.*, c.contract_number, c.start_date, c.end_date,
             s.title as space_title, s.address, s.city,
             uh.first_name || ' ' || uh.last_name as host_name, uh.nit as host_nit
      FROM invoices i
      JOIN contracts c ON i.contract_id = c.id
      JOIN spaces s ON c.space_id = s.id
      JOIN users uh ON c.host_id = uh.id
      WHERE i.id = ? AND i.guest_id = ?
    `).get(req.params.id, req.user.id);

    if (!invoice) {
      return res.status(404).json({ error: 'Factura no encontrada' });
    }

    res.json(invoice);
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Error al obtener factura' });
  }
});

router.get('/appointments', (req, res) => {
  try {
    const appointments = db.prepare(`
      SELECT a.*, s.title as space_title, s.city,
             u.first_name || ' ' || u.last_name as host_name
      FROM appointments a
      JOIN spaces s ON a.space_id = s.id
      JOIN users u ON s.host_id = u.id
      WHERE a.guest_id = ?
      ORDER BY a.date DESC, a.time DESC
    `).all(req.user.id);

    res.json(appointments);
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Error al obtener citas' });
  }
});

router.get('/my-spaces', (req, res) => {
  try {
    const spaces = db.prepare(`
      SELECT DISTINCT 
        s.id as space_id, 
        s.title as space_title, 
        s.city, 
        s.department,
        u.first_name || ' ' || u.last_name as host_name,
        r.status as reservation_status,
        r.created_at as last_reservation_date
      FROM reservations r
      JOIN spaces s ON r.space_id = s.id
      JOIN users u ON s.host_id = u.id
      WHERE r.guest_id = ?
      ORDER BY r.created_at DESC
    `).all(req.user.id);

    const uniqueSpaces = [];
    const seenIds = new Set();
    for (const space of spaces) {
      if (!seenIds.has(space.space_id)) {
        seenIds.add(space.space_id);
        uniqueSpaces.push(space);
      }
    }

    res.json(uniqueSpaces);
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Error al obtener mis espacios' });
  }
});

router.get('/favorites', (req, res) => {
  try {
    const favorites = db.prepare(`
      SELECT f.id as favorite_id, f.created_at as favorited_at,
             s.*, u.first_name || ' ' || u.last_name as host_name,
             (SELECT url FROM space_photos WHERE space_id = s.id LIMIT 1) as photo_url
      FROM favorites f
      JOIN spaces s ON f.space_id = s.id
      JOIN users u ON s.host_id = u.id
      WHERE f.user_id = ? AND s.status = 'published'
      ORDER BY f.created_at DESC
    `).all(req.user.id);

    res.json(favorites);
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Error al obtener favoritos' });
  }
});

router.post('/favorites/:spaceId', (req, res) => {
  try {
    const space = db.prepare('SELECT id FROM spaces WHERE id = ?').get(req.params.spaceId);
    if (!space) {
      return res.status(404).json({ error: 'Espacio no encontrado' });
    }

    const existing = db.prepare('SELECT id FROM favorites WHERE user_id = ? AND space_id = ?')
      .get(req.user.id, req.params.spaceId);

    if (existing) {
      return res.status(400).json({ error: 'El espacio ya esta en favoritos' });
    }

    const id = generateId();
    db.prepare('INSERT INTO favorites (id, user_id, space_id) VALUES (?, ?, ?)')
      .run(id, req.user.id, req.params.spaceId);

    logAudit(req.user.id, 'FAVORITE_ADDED', 'favorites', id, null, { space_id: req.params.spaceId }, req);

    res.status(201).json({ id, message: 'Espacio agregado a favoritos' });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Error al agregar favorito' });
  }
});

router.delete('/favorites/:spaceId', (req, res) => {
  try {
    const favorite = db.prepare('SELECT id FROM favorites WHERE user_id = ? AND space_id = ?')
      .get(req.user.id, req.params.spaceId);

    if (!favorite) {
      return res.status(404).json({ error: 'Favorito no encontrado' });
    }

    db.prepare('DELETE FROM favorites WHERE user_id = ? AND space_id = ?')
      .run(req.user.id, req.params.spaceId);

    logAudit(req.user.id, 'FAVORITE_REMOVED', 'favorites', favorite.id, { space_id: req.params.spaceId }, null, req);

    res.json({ message: 'Espacio eliminado de favoritos' });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Error al eliminar favorito' });
  }
});

router.get('/profile', (req, res) => {
  try {
    const user = db.prepare(`
      SELECT id, email, role, person_type, first_name, last_name, company_name,
             ci, nit, phone, address, city, department, country, street, street_number, floor,
             profile_photo, email_notifications, newsletter,
             is_verified, anti_bypass_accepted, anti_bypass_accepted_at,
             created_at
      FROM users WHERE id = ?
    `).get(req.user.id);

    if (!user) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }

    res.json(user);
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
    
    // Check if user has already accepted anti-bypass (one-way enforcement)
    const currentUser = db.prepare('SELECT anti_bypass_accepted FROM users WHERE id = ?').get(req.user.id);
    
    const updates = [];
    const values = [];

    for (const field of allowedFields) {
      if (req.body[field] !== undefined) {
        const val = req.body[field];
        
        // Anti-bypass acceptance is ONE-WAY ONLY - cannot be revoked once accepted
        if (field === 'anti_bypass_accepted') {
          if (currentUser.anti_bypass_accepted === 1) {
            // Already accepted - ignore any attempt to change (including to false)
            continue;
          }
          // Not yet accepted - only allow setting to true
          if (!val) {
            continue; // Ignore attempts to explicitly set false
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

    const hasActiveReservations = db.prepare(`
      SELECT COUNT(*) as count FROM reservations 
      WHERE guest_id = ? AND status NOT IN ('cancelled', 'refunded', 'completed', 'expired')
    `).get(userId);

    if (hasActiveReservations.count > 0) {
      return res.status(400).json({ 
        error: 'No puede eliminar su cuenta mientras tenga reservaciones activas, pendientes o con contratos en proceso. Por favor complete o cancele sus reservaciones primero.' 
      });
    }

    const hasActiveContracts = db.prepare(`
      SELECT COUNT(*) as count FROM contracts c
      JOIN reservations r ON c.reservation_id = r.id
      WHERE r.guest_id = ? AND c.status NOT IN ('cancelled', 'completed', 'expired')
    `).get(userId);

    if (hasActiveContracts.count > 0) {
      return res.status(400).json({ 
        error: 'No puede eliminar su cuenta mientras tenga contratos activos o pendientes de firma.' 
      });
    }

    const hasUnpaidPayments = db.prepare(`
      SELECT COUNT(*) as count FROM payments 
      WHERE user_id = ? AND status = 'pending'
    `).get(userId);

    if (hasUnpaidPayments.count > 0) {
      return res.status(400).json({ 
        error: 'No puede eliminar su cuenta mientras tenga pagos pendientes.' 
      });
    }

    if (user.profile_photo && fs.existsSync(user.profile_photo)) {
      fs.unlinkSync(user.profile_photo);
    }

    db.prepare('DELETE FROM favorites WHERE user_id = ?').run(userId);
    db.prepare('DELETE FROM notification_log WHERE recipient_id = ?').run(userId);
    db.prepare('UPDATE audit_log SET user_id = NULL WHERE user_id = ?').run(userId);
    db.prepare('DELETE FROM campaign_recipients WHERE user_id = ?').run(userId);

    const auditData = { email: user.email, name: `${user.first_name} ${user.last_name}`, deleted_at: new Date().toISOString() };
    db.prepare(`
      INSERT INTO audit_log (id, user_id, action, entity_type, entity_id, old_data, new_data, ip_address, user_agent, created_at)
      VALUES (?, NULL, 'ACCOUNT_DELETED', 'users', ?, ?, NULL, ?, ?, CURRENT_TIMESTAMP)
    `).run(`audit_${Date.now()}`, userId, JSON.stringify(auditData), req.ip, req.get('User-Agent'));

    db.prepare('DELETE FROM users WHERE id = ?').run(userId);

    res.json({ message: 'Cuenta eliminada exitosamente' });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Error al eliminar cuenta' });
  }
});

module.exports = router;
