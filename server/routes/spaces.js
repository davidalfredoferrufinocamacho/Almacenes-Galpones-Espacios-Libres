const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { body, query, validationResult } = require('express-validator');
const { db } = require('../config/database');
const { authenticateToken, requireRole, optionalAuth } = require('../middleware/auth');
const { logAudit } = require('../middleware/audit');
const { generateId } = require('../utils/helpers');

const VIDEO_MIN_DURATION = 30;
const VIDEO_MAX_DURATION = 60;

async function getVideoDuration(filePath) {
  return new Promise((resolve, reject) => {
    const ffmpeg = require('fluent-ffmpeg');
    ffmpeg.ffprobe(filePath, (err, metadata) => {
      if (err) {
        reject(err);
        return;
      }
      const duration = metadata.format.duration;
      resolve(duration);
    });
  });
}

const router = express.Router();

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const type = file.fieldname === 'video' ? 'videos' : 'photos';
    cb(null, `uploads/${type}`);
  },
  filename: (req, file, cb) => {
    const uniqueName = `${Date.now()}-${Math.random().toString(36).substring(7)}${path.extname(file.originalname)}`;
    cb(null, uniqueName);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 100 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.fieldname === 'video') {
      if (file.mimetype.startsWith('video/')) {
        cb(null, true);
      } else {
        cb(new Error('Solo se permiten archivos de video'), false);
      }
    } else {
      if (file.mimetype.startsWith('image/')) {
        cb(null, true);
      } else {
        cb(new Error('Solo se permiten imagenes'), false);
      }
    }
  }
});

router.get('/', optionalAuth, [
  query('city').optional().trim(),
  query('department').optional().trim(),
  query('space_type').optional().isIn(['almacen', 'galpon', 'deposito', 'cuarto', 'contenedor', 'patio', 'terreno']),
  query('min_sqm').optional().isFloat({ min: 0 }),
  query('max_sqm').optional().isFloat({ min: 0 }),
  query('has_roof').optional().isBoolean(),
  query('has_security').optional().isBoolean()
], (req, res) => {
  try {
    let sql = `
      SELECT s.*, u.first_name as host_first_name, u.last_name as host_last_name, u.company_name as host_company,
             (SELECT url FROM space_photos WHERE space_id = s.id AND is_primary = 1 LIMIT 1) as primary_photo
      FROM spaces s
      JOIN users u ON s.host_id = u.id
      WHERE s.status = 'published'
    `;

    const params = [];

    if (req.query.city) {
      sql += ' AND s.city LIKE ?';
      params.push(`%${req.query.city}%`);
    }

    if (req.query.department) {
      sql += ' AND s.department = ?';
      params.push(req.query.department);
    }

    if (req.query.space_type) {
      sql += ' AND s.space_type = ?';
      params.push(req.query.space_type);
    }

    if (req.query.min_sqm) {
      sql += ' AND s.available_sqm >= ?';
      params.push(parseFloat(req.query.min_sqm));
    }

    if (req.query.max_sqm) {
      sql += ' AND s.available_sqm <= ?';
      params.push(parseFloat(req.query.max_sqm));
    }

    if (req.query.has_roof === 'true') {
      sql += ' AND s.has_roof = 1';
    }

    if (req.query.has_security === 'true') {
      sql += ' AND s.has_security = 1';
    }

    sql += ' ORDER BY s.created_at DESC';

    const spaces = db.prepare(sql).all(...params);
    res.json(spaces);
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Error al buscar espacios' });
  }
});

router.get('/:id', optionalAuth, (req, res) => {
  try {
    const space = db.prepare(`
      SELECT s.*, 
             u.first_name as host_first_name, u.last_name as host_last_name, 
             u.company_name as host_company, u.person_type as host_person_type,
             u.city as host_city, u.department as host_department
      FROM spaces s
      JOIN users u ON s.host_id = u.id
      WHERE s.id = ? AND s.status IN ('published', 'draft')
    `).get(req.params.id);

    if (!space) {
      return res.status(404).json({ error: 'Espacio no encontrado' });
    }

    const photos = db.prepare('SELECT * FROM space_photos WHERE space_id = ? ORDER BY order_index').all(req.params.id);

    const config = db.prepare("SELECT value FROM system_config WHERE key = 'deposit_percentage'").get();
    const depositPercentage = config ? parseFloat(config.value) : 10;

    res.json({
      ...space,
      photos,
      deposit_percentage: depositPercentage
    });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Error al obtener espacio' });
  }
});

router.post('/', authenticateToken, requireRole('HOST'), [
  body('title').notEmpty().trim(),
  body('description').notEmpty().trim(),
  body('space_type').isIn(['almacen', 'galpon', 'deposito', 'cuarto', 'contenedor', 'patio', 'terreno']),
  body('total_sqm').isFloat({ min: 1 }),
  body('available_sqm').isFloat({ min: 1 }),
  body('address').notEmpty().trim(),
  body('city').notEmpty().trim(),
  body('department').notEmpty().trim()
], (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    if (!req.user.anti_bypass_accepted) {
      return res.status(403).json({ error: 'Debe aceptar la clausula anti-bypass antes de publicar espacios' });
    }

    const spaceId = generateId();
    const {
      title, description, space_type, total_sqm, available_sqm,
      price_per_sqm_day, price_per_sqm_week, price_per_sqm_month,
      price_per_sqm_quarter, price_per_sqm_semester, price_per_sqm_year,
      is_open, has_roof, rain_protected, dust_protected, access_type,
      has_security, security_description, schedule, address, city, department,
      latitude, longitude
    } = req.body;

    const stmt = db.prepare(`
      INSERT INTO spaces (
        id, host_id, title, description, space_type, total_sqm, available_sqm,
        price_per_sqm_day, price_per_sqm_week, price_per_sqm_month,
        price_per_sqm_quarter, price_per_sqm_semester, price_per_sqm_year,
        is_open, has_roof, rain_protected, dust_protected, access_type,
        has_security, security_description, schedule, address, city, department,
        latitude, longitude, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft')
    `);

    stmt.run(
      spaceId, req.user.id, title, description, space_type, total_sqm, available_sqm,
      price_per_sqm_day, price_per_sqm_week, price_per_sqm_month,
      price_per_sqm_quarter, price_per_sqm_semester, price_per_sqm_year,
      is_open ? 1 : 0, has_roof ? 1 : 0, rain_protected ? 1 : 0, dust_protected ? 1 : 0, access_type,
      has_security ? 1 : 0, security_description, schedule, address, city, department,
      latitude, longitude
    );

    logAudit(req.user.id, 'SPACE_CREATED', 'spaces', spaceId, null, req.body, req);

    res.status(201).json({ id: spaceId, message: 'Espacio creado exitosamente' });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Error al crear espacio' });
  }
});

router.put('/:id', authenticateToken, requireRole('HOST'), (req, res) => {
  try {
    const space = db.prepare('SELECT * FROM spaces WHERE id = ? AND host_id = ?').get(req.params.id, req.user.id);
    if (!space) {
      return res.status(404).json({ error: 'Espacio no encontrado' });
    }

    const {
      title, description, total_sqm, available_sqm,
      price_per_sqm_day, price_per_sqm_week, price_per_sqm_month,
      price_per_sqm_quarter, price_per_sqm_semester, price_per_sqm_year,
      is_open, has_roof, rain_protected, dust_protected, access_type,
      has_security, security_description, schedule, address, city, department
    } = req.body;

    const stmt = db.prepare(`
      UPDATE spaces SET
        title = COALESCE(?, title),
        description = COALESCE(?, description),
        total_sqm = COALESCE(?, total_sqm),
        available_sqm = COALESCE(?, available_sqm),
        price_per_sqm_day = COALESCE(?, price_per_sqm_day),
        price_per_sqm_week = COALESCE(?, price_per_sqm_week),
        price_per_sqm_month = COALESCE(?, price_per_sqm_month),
        price_per_sqm_quarter = COALESCE(?, price_per_sqm_quarter),
        price_per_sqm_semester = COALESCE(?, price_per_sqm_semester),
        price_per_sqm_year = COALESCE(?, price_per_sqm_year),
        is_open = COALESCE(?, is_open),
        has_roof = COALESCE(?, has_roof),
        rain_protected = COALESCE(?, rain_protected),
        dust_protected = COALESCE(?, dust_protected),
        access_type = COALESCE(?, access_type),
        has_security = COALESCE(?, has_security),
        security_description = COALESCE(?, security_description),
        schedule = COALESCE(?, schedule),
        address = COALESCE(?, address),
        city = COALESCE(?, city),
        department = COALESCE(?, department),
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `);

    stmt.run(
      title, description, total_sqm, available_sqm,
      price_per_sqm_day, price_per_sqm_week, price_per_sqm_month,
      price_per_sqm_quarter, price_per_sqm_semester, price_per_sqm_year,
      is_open !== undefined ? (is_open ? 1 : 0) : undefined,
      has_roof !== undefined ? (has_roof ? 1 : 0) : undefined,
      rain_protected !== undefined ? (rain_protected ? 1 : 0) : undefined,
      dust_protected !== undefined ? (dust_protected ? 1 : 0) : undefined,
      access_type, has_security !== undefined ? (has_security ? 1 : 0) : undefined,
      security_description, schedule, address, city, department,
      req.params.id
    );

    logAudit(req.user.id, 'SPACE_UPDATED', 'spaces', req.params.id, space, req.body, req);

    res.json({ message: 'Espacio actualizado' });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Error al actualizar espacio' });
  }
});

router.post('/:id/photos', authenticateToken, requireRole('HOST'), upload.array('photos', 10), (req, res) => {
  try {
    const space = db.prepare('SELECT * FROM spaces WHERE id = ? AND host_id = ?').get(req.params.id, req.user.id);
    if (!space) {
      return res.status(404).json({ error: 'Espacio no encontrado' });
    }

    const photos = [];
    for (let i = 0; i < req.files.length; i++) {
      const photoId = generateId();
      const url = `/uploads/photos/${req.files[i].filename}`;

      db.prepare(`
        INSERT INTO space_photos (id, space_id, url, is_primary, order_index)
        VALUES (?, ?, ?, ?, ?)
      `).run(photoId, req.params.id, url, i === 0 ? 1 : 0, i);

      photos.push({ id: photoId, url });
    }

    res.json({ photos });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Error al subir fotos' });
  }
});

router.post('/:id/video', authenticateToken, requireRole('HOST'), upload.single('video'), async (req, res) => {
  try {
    const space = db.prepare('SELECT * FROM spaces WHERE id = ? AND host_id = ?').get(req.params.id, req.user.id);
    if (!space) {
      if (req.file) fs.unlinkSync(req.file.path);
      return res.status(404).json({ error: 'Espacio no encontrado' });
    }

    const filePath = req.file.path;
    let realDuration;
    
    try {
      realDuration = await getVideoDuration(filePath);
    } catch (ffmpegError) {
      fs.unlinkSync(filePath);
      console.error('Error ffprobe:', ffmpegError);
      return res.status(400).json({ 
        error: 'No se pudo analizar el video. Asegurese de que sea un archivo de video valido.' 
      });
    }

    const durationInSeconds = Math.round(realDuration);

    if (durationInSeconds < VIDEO_MIN_DURATION) {
      fs.unlinkSync(filePath);
      return res.status(400).json({ 
        error: `El video debe durar al menos ${VIDEO_MIN_DURATION} segundos. Duracion detectada: ${durationInSeconds} segundos.`,
        detected_duration: durationInSeconds,
        min_required: VIDEO_MIN_DURATION,
        max_allowed: VIDEO_MAX_DURATION
      });
    }

    if (durationInSeconds > VIDEO_MAX_DURATION) {
      fs.unlinkSync(filePath);
      return res.status(400).json({ 
        error: `El video no puede durar mas de ${VIDEO_MAX_DURATION} segundos. Duracion detectada: ${durationInSeconds} segundos.`,
        detected_duration: durationInSeconds,
        min_required: VIDEO_MIN_DURATION,
        max_allowed: VIDEO_MAX_DURATION
      });
    }

    const videoUrl = `/uploads/videos/${req.file.filename}`;

    db.prepare(`
      UPDATE spaces SET video_url = ?, video_duration = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(videoUrl, durationInSeconds, req.params.id);

    logAudit(req.user.id, 'VIDEO_UPLOADED', 'spaces', req.params.id, null, { 
      duration: durationInSeconds,
      filename: req.file.filename 
    }, req);

    res.json({ 
      video_url: videoUrl,
      duration: durationInSeconds,
      validation: 'OK - Duracion dentro del rango permitido (30-60 segundos)'
    });
  } catch (error) {
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    console.error('Error:', error);
    res.status(500).json({ error: 'Error al subir video' });
  }
});

router.post('/:id/publish', authenticateToken, requireRole('HOST'), (req, res) => {
  try {
    const space = db.prepare('SELECT * FROM spaces WHERE id = ? AND host_id = ?').get(req.params.id, req.user.id);
    if (!space) {
      return res.status(404).json({ error: 'Espacio no encontrado' });
    }

    const photos = db.prepare('SELECT COUNT(*) as count FROM space_photos WHERE space_id = ?').get(req.params.id);
    if (photos.count === 0) {
      return res.status(400).json({ error: 'Debe subir al menos una foto' });
    }

    if (!space.video_url) {
      return res.status(400).json({ error: 'El video explicativo es obligatorio' });
    }

    if (!space.description || space.description.length < 50) {
      return res.status(400).json({ error: 'La descripcion debe tener al menos 50 caracteres' });
    }

    db.prepare(`
      UPDATE spaces SET status = 'published', updated_at = CURRENT_TIMESTAMP WHERE id = ?
    `).run(req.params.id);

    logAudit(req.user.id, 'SPACE_PUBLISHED', 'spaces', req.params.id, null, null, req);

    res.json({ message: 'Espacio publicado exitosamente' });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Error al publicar espacio' });
  }
});

router.get('/:id/availability', (req, res) => {
  try {
    const availability = db.prepare(`
      SELECT * FROM host_availability 
      WHERE space_id = ? AND is_blocked = 0
      ORDER BY day_of_week, specific_date, start_time
    `).all(req.params.id);

    res.json(availability);
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Error al obtener disponibilidad' });
  }
});

router.post('/:id/availability', authenticateToken, requireRole('HOST'), (req, res) => {
  try {
    const space = db.prepare('SELECT * FROM spaces WHERE id = ? AND host_id = ?').get(req.params.id, req.user.id);
    if (!space) {
      return res.status(404).json({ error: 'Espacio no encontrado' });
    }

    const { day_of_week, specific_date, start_time, end_time, is_blocked } = req.body;

    const availId = generateId();
    db.prepare(`
      INSERT INTO host_availability (id, space_id, day_of_week, specific_date, start_time, end_time, is_blocked)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(availId, req.params.id, day_of_week, specific_date, start_time, end_time, is_blocked ? 1 : 0);

    logAudit(req.user.id, 'AVAILABILITY_UPDATED', 'host_availability', availId, null, req.body, req);

    res.json({ id: availId, message: 'Disponibilidad actualizada' });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Error al actualizar disponibilidad' });
  }
});

module.exports = router;
