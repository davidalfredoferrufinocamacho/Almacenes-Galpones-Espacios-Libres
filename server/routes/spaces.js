const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { body, query, validationResult } = require('express-validator');
const { db } = require('../config/database');
const { authenticateToken, requireRole, optionalAuth } = require('../middleware/auth');
const { logAudit } = require('../middleware/audit');
const { generateId } = require('../utils/helpers');

function getVideoMaxDuration() {
  const DEFAULT_MAX = 15;
  try {
    const config = db.prepare("SELECT value FROM system_config WHERE key = 'video_max_duration'").get();
    if (!config) return DEFAULT_MAX;
    const value = parseInt(config.value);
    if (isNaN(value) || value < 1 || value > 300) return DEFAULT_MAX;
    return value;
  } catch {
    return DEFAULT_MAX;
  }
}

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
  query('has_roof').optional(),
  query('has_security').optional(),
  query('featured').optional()
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

    if (req.query.featured === 'true') {
      sql += ' AND s.is_featured = 1';
    }

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
    
    const sanitizedSpaces = spaces.map(space => {
      if (!req.user) {
        const { address, ...rest } = space;
        return rest;
      }
      return space;
    });
    
    res.json(sanitizedSpaces);
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Error al buscar espacios' });
  }
});

router.get('/map', [
  query('minLat').isFloat({ min: -90, max: 90 }).withMessage('minLat requerido (-90 a 90)'),
  query('maxLat').isFloat({ min: -90, max: 90 }).withMessage('maxLat requerido (-90 a 90)'),
  query('minLng').isFloat({ min: -180, max: 180 }).withMessage('minLng requerido (-180 a 180)'),
  query('maxLng').isFloat({ min: -180, max: 180 }).withMessage('maxLng requerido (-180 a 180)'),
  query('space_type').optional().isIn(['almacen', 'galpon', 'deposito', 'cuarto', 'contenedor', 'patio', 'terreno']),
  query('department').optional().trim(),
  query('city').optional().trim()
], (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { minLat, maxLat, minLng, maxLng, space_type, department, city } = req.query;

    if (parseFloat(minLat) > parseFloat(maxLat)) {
      return res.status(400).json({ error: 'minLat debe ser menor o igual a maxLat' });
    }
    if (parseFloat(minLng) > parseFloat(maxLng)) {
      return res.status(400).json({ error: 'minLng debe ser menor o igual a maxLng' });
    }

    let sql = `
      SELECT s.id, s.title, s.space_type, s.city, s.department, 
             s.latitude, s.longitude, s.available_sqm,
             COALESCE(s.price_per_sqm_day, s.price_per_sqm_week, s.price_per_sqm_month) as price_preview,
             (SELECT url FROM space_photos WHERE space_id = s.id AND is_primary = 1 LIMIT 1) as primary_photo
      FROM spaces s
      WHERE s.status = 'published'
        AND s.latitude IS NOT NULL
        AND s.longitude IS NOT NULL
        AND s.latitude >= ? AND s.latitude <= ?
        AND s.longitude >= ? AND s.longitude <= ?
    `;

    const params = [parseFloat(minLat), parseFloat(maxLat), parseFloat(minLng), parseFloat(maxLng)];

    if (space_type) {
      sql += ' AND s.space_type = ?';
      params.push(space_type);
    }

    if (department) {
      sql += ' AND s.department = ?';
      params.push(department);
    }

    if (city) {
      sql += ' AND s.city LIKE ?';
      params.push(`%${city}%`);
    }

    const spaces = db.prepare(sql).all(...params);
    res.json(spaces);
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Error al buscar espacios en mapa' });
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

    let responseData = {
      ...space,
      photos,
      deposit_percentage: depositPercentage
    };
    
    if (!req.user) {
      const { address, ...rest } = responseData;
      responseData = rest;
    }

    res.json(responseData);
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
      has_security, security_description, schedule, address, city, department,
      latitude, longitude
    } = req.body;

    const parsedLat = latitude === '' || latitude === null ? undefined : parseFloat(latitude);
    const parsedLng = longitude === '' || longitude === null ? undefined : parseFloat(longitude);

    if (parsedLat !== undefined && (isNaN(parsedLat) || parsedLat < -90 || parsedLat > 90)) {
      return res.status(400).json({ error: 'Latitud debe estar entre -90 y 90' });
    }
    if (parsedLng !== undefined && (isNaN(parsedLng) || parsedLng < -180 || parsedLng > 180)) {
      return res.status(400).json({ error: 'Longitud debe estar entre -180 y 180' });
    }

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
        latitude = COALESCE(?, latitude),
        longitude = COALESCE(?, longitude),
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
      parsedLat, parsedLng,
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

    const existingCount = db.prepare('SELECT COUNT(*) as count FROM space_photos WHERE space_id = ?').get(req.params.id).count;

    for (let i = 0; i < req.files.length; i++) {
      const photoId = generateId();
      const url = `/uploads/photos/${req.files[i].filename}`;
      const isPrimary = existingCount === 0 && i === 0 ? 1 : 0;

      db.prepare(`
        INSERT INTO space_photos (id, space_id, url, is_primary, order_index)
        VALUES (?, ?, ?, ?, ?)
      `).run(photoId, req.params.id, url, isPrimary, existingCount + i);
    }

    const allPhotos = db.prepare('SELECT * FROM space_photos WHERE space_id = ? ORDER BY order_index').all(req.params.id);
    res.json({ photos: allPhotos });
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
    const maxDuration = getVideoMaxDuration();

    if (durationInSeconds > maxDuration) {
      fs.unlinkSync(filePath);
      return res.status(400).json({ 
        error: `El video no puede durar mas de ${maxDuration} segundos. Duracion detectada: ${durationInSeconds} segundos.`,
        detected_duration: durationInSeconds,
        max_allowed: maxDuration
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
      validation: `OK - Duracion valida (maximo ${maxDuration} segundos)`
    });
  } catch (error) {
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    console.error('Error:', error);
    res.status(500).json({ error: 'Error al subir video' });
  }
});

router.delete('/:id/photos/:photoId', authenticateToken, requireRole('HOST'), (req, res) => {
  try {
    const space = db.prepare('SELECT * FROM spaces WHERE id = ? AND host_id = ?').get(req.params.id, req.user.id);
    if (!space) {
      return res.status(404).json({ error: 'Espacio no encontrado' });
    }

    const photo = db.prepare('SELECT * FROM space_photos WHERE id = ? AND space_id = ?').get(req.params.photoId, req.params.id);
    if (!photo) {
      return res.status(404).json({ error: 'Foto no encontrada' });
    }

    db.prepare('DELETE FROM space_photos WHERE id = ?').run(req.params.photoId);

    try {
      const sanitizedUrl = photo.url.replace(/^\//, '');
      const filePath = path.join(__dirname, '../../', sanitizedUrl);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    } catch (fileError) {
      console.error('Error al eliminar archivo de foto:', fileError);
    }

    const remainingPhotos = db.prepare('SELECT * FROM space_photos WHERE space_id = ? ORDER BY order_index').all(req.params.id);

    logAudit(req.user.id, 'PHOTO_DELETED', 'space_photos', req.params.photoId, photo, null, req);
    res.json({ message: 'Foto eliminada exitosamente', photos: remainingPhotos });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Error al eliminar foto' });
  }
});

router.delete('/:id/video', authenticateToken, requireRole('HOST'), (req, res) => {
  try {
    const space = db.prepare('SELECT * FROM spaces WHERE id = ? AND host_id = ?').get(req.params.id, req.user.id);
    if (!space) {
      return res.status(404).json({ error: 'Espacio no encontrado' });
    }

    if (!space.video_url) {
      return res.status(404).json({ error: 'No hay video para eliminar' });
    }

    db.prepare(`
      UPDATE spaces SET video_url = NULL, video_duration = NULL, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(req.params.id);

    try {
      const sanitizedUrl = space.video_url.replace(/^\//, '');
      const filePath = path.join(__dirname, '../../', sanitizedUrl);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    } catch (fileError) {
      console.error('Error al eliminar archivo de video:', fileError);
    }

    logAudit(req.user.id, 'VIDEO_DELETED', 'spaces', req.params.id, { video_url: space.video_url }, null, req);
    res.json({ message: 'Video eliminado exitosamente' });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Error al eliminar video' });
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
    const space = db.prepare('SELECT status, is_calendar_active FROM spaces WHERE id = ?').get(req.params.id);
    if (!space) {
      return res.status(404).json({ error: 'Espacio no encontrado' });
    }

    const availability = db.prepare(`
      SELECT * FROM host_availability 
      WHERE space_id = ? AND is_blocked = 0
      ORDER BY day_of_week, specific_date, start_time
    `).all(req.params.id);

    res.json({
      calendar_active: space.is_calendar_active === 1,
      space_status: space.status,
      availability
    });
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

    if (space.status !== 'published') {
      return res.status(400).json({ error: 'Solo se puede gestionar disponibilidad de espacios publicados' });
    }

    const { day_of_week, specific_date, start_time, end_time, is_blocked } = req.body;

    if (!start_time || !end_time) {
      return res.status(400).json({ error: 'Horario de inicio y fin son obligatorios' });
    }

    const availId = generateId();
    const clientInfo = getClientInfo(req);

    db.prepare(`
      INSERT INTO host_availability (id, space_id, day_of_week, specific_date, start_time, end_time, is_blocked)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(availId, req.params.id, day_of_week, specific_date, start_time, end_time, is_blocked ? 1 : 0);

    logAudit(req.user.id, 'AVAILABILITY_CREATED', 'host_availability', availId, null, {
      space_id: req.params.id,
      day_of_week,
      specific_date,
      start_time,
      end_time,
      is_blocked: is_blocked ? 1 : 0,
      ...clientInfo
    }, req);

    res.json({ id: availId, message: 'Disponibilidad creada' });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Error al crear disponibilidad' });
  }
});

router.put('/:id/availability/:avail_id', authenticateToken, requireRole('HOST'), (req, res) => {
  try {
    const space = db.prepare('SELECT * FROM spaces WHERE id = ? AND host_id = ?').get(req.params.id, req.user.id);
    if (!space) {
      return res.status(404).json({ error: 'Espacio no encontrado' });
    }

    if (space.status !== 'published') {
      return res.status(400).json({ error: 'Solo se puede gestionar disponibilidad de espacios publicados' });
    }

    const existing = db.prepare('SELECT * FROM host_availability WHERE id = ? AND space_id = ?').get(req.params.avail_id, req.params.id);
    if (!existing) {
      return res.status(404).json({ error: 'Disponibilidad no encontrada' });
    }

    const { day_of_week, specific_date, start_time, end_time, is_blocked } = req.body;
    const clientInfo = getClientInfo(req);

    const oldData = { ...existing };

    db.prepare(`
      UPDATE host_availability 
      SET day_of_week = COALESCE(?, day_of_week),
          specific_date = COALESCE(?, specific_date),
          start_time = COALESCE(?, start_time),
          end_time = COALESCE(?, end_time),
          is_blocked = COALESCE(?, is_blocked)
      WHERE id = ?
    `).run(day_of_week, specific_date, start_time, end_time, is_blocked !== undefined ? (is_blocked ? 1 : 0) : null, req.params.avail_id);

    logAudit(req.user.id, 'AVAILABILITY_UPDATED', 'host_availability', req.params.avail_id, oldData, {
      space_id: req.params.id,
      day_of_week,
      specific_date,
      start_time,
      end_time,
      is_blocked,
      ...clientInfo
    }, req);

    res.json({ message: 'Disponibilidad actualizada' });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Error al actualizar disponibilidad' });
  }
});

router.delete('/:id/availability/:avail_id', authenticateToken, requireRole('HOST'), (req, res) => {
  try {
    const space = db.prepare('SELECT * FROM spaces WHERE id = ? AND host_id = ?').get(req.params.id, req.user.id);
    if (!space) {
      return res.status(404).json({ error: 'Espacio no encontrado' });
    }

    if (space.status !== 'published') {
      return res.status(400).json({ error: 'Solo se puede gestionar disponibilidad de espacios publicados' });
    }

    const existing = db.prepare('SELECT * FROM host_availability WHERE id = ? AND space_id = ?').get(req.params.avail_id, req.params.id);
    if (!existing) {
      return res.status(404).json({ error: 'Disponibilidad no encontrada' });
    }

    const clientInfo = getClientInfo(req);
    const deletedData = { ...existing };

    db.prepare('DELETE FROM host_availability WHERE id = ?').run(req.params.avail_id);

    logAudit(req.user.id, 'AVAILABILITY_DELETED', 'host_availability', req.params.avail_id, deletedData, {
      space_id: req.params.id,
      ...clientInfo
    }, req);

    res.json({ message: 'Disponibilidad eliminada' });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Error al eliminar disponibilidad' });
  }
});

router.post('/:id/calendar/toggle', authenticateToken, requireRole('HOST'), (req, res) => {
  try {
    const space = db.prepare('SELECT * FROM spaces WHERE id = ? AND host_id = ?').get(req.params.id, req.user.id);
    if (!space) {
      return res.status(404).json({ error: 'Espacio no encontrado' });
    }

    if (space.status !== 'published') {
      return res.status(400).json({ error: 'Solo se puede gestionar calendario de espacios publicados' });
    }

    const newStatus = space.is_calendar_active === 1 ? 0 : 1;
    const clientInfo = getClientInfo(req);

    db.prepare('UPDATE spaces SET is_calendar_active = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(newStatus, req.params.id);

    const eventType = newStatus === 1 ? 'CALENDAR_ACTIVATED' : 'CALENDAR_PAUSED';
    logAudit(req.user.id, eventType, 'spaces', req.params.id, { is_calendar_active: space.is_calendar_active }, {
      is_calendar_active: newStatus,
      ...clientInfo
    }, req);

    res.json({ 
      is_calendar_active: newStatus === 1,
      message: newStatus === 1 ? 'Calendario activado' : 'Calendario pausado'
    });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Error al cambiar estado del calendario' });
  }
});

// Endpoint para obtener slots disponibles de un espacio (público)
router.get('/:id/available-slots', optionalAuth, (req, res) => {
  try {
    const { id } = req.params;
    const { date, from_date, to_date } = req.query;
    
    // Verificar que el espacio existe, está publicado y tiene calendario activo
    const space = db.prepare(`
      SELECT s.id, s.title, s.host_id, s.is_calendar_active, s.status,
             u.first_name as host_first_name, u.last_name as host_last_name
      FROM spaces s
      JOIN users u ON s.host_id = u.id
      WHERE s.id = ? AND s.status = 'published' AND s.is_calendar_active = 1
    `).get(id);
    
    if (!space) {
      return res.status(404).json({ error: 'Espacio no encontrado o sin calendario activo' });
    }
    
    // Obtener disponibilidad semanal del host
    const availability = db.prepare(`
      SELECT day_of_week, start_time, end_time, slot_duration_minutes, buffer_minutes, is_active
      FROM host_availability
      WHERE space_id = ? AND is_active = 1
      ORDER BY day_of_week
    `).all(id);
    
    // Obtener excepciones (fechas bloqueadas)
    const exceptions = db.prepare(`
      SELECT exception_date, reason
      FROM host_availability_exceptions
      WHERE space_id = ? AND is_blocked = 1
    `).all(id);
    
    // Obtener citas ya agendadas para evitar conflictos
    const existingAppointments = db.prepare(`
      SELECT scheduled_date, scheduled_time, duration_minutes
      FROM appointments
      WHERE space_id = ? AND status IN ('solicitada', 'aceptada', 'reprogramada')
    `).all(id);
    
    // Generar slots disponibles
    const slots = [];
    const startDate = date ? new Date(date) : new Date();
    const endDate = to_date ? new Date(to_date) : new Date(startDate.getTime() + 14 * 24 * 60 * 60 * 1000); // 14 días por defecto
    
    const blockedDates = new Set(exceptions.map(e => e.exception_date));
    const bookedSlots = new Set(existingAppointments.map(a => `${a.scheduled_date}_${a.scheduled_time}`));
    
    for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
      const dateStr = d.toISOString().split('T')[0];
      const dayOfWeek = d.getDay();
      
      // Saltar fechas bloqueadas
      if (blockedDates.has(dateStr)) continue;
      
      // Buscar disponibilidad para este día de la semana
      const dayAvailability = availability.find(a => a.day_of_week === dayOfWeek);
      if (!dayAvailability) continue;
      
      // Generar slots para este día
      const slotDuration = dayAvailability.slot_duration_minutes || 60;
      const buffer = dayAvailability.buffer_minutes || 15;
      const [startHour, startMin] = dayAvailability.start_time.split(':').map(Number);
      const [endHour, endMin] = dayAvailability.end_time.split(':').map(Number);
      
      let currentTime = startHour * 60 + startMin;
      const endTime = endHour * 60 + endMin;
      
      while (currentTime + slotDuration <= endTime) {
        const hours = Math.floor(currentTime / 60);
        const mins = currentTime % 60;
        const timeStr = `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`;
        
        // Verificar si el slot no está ocupado
        if (!bookedSlots.has(`${dateStr}_${timeStr}`)) {
          slots.push({
            date: dateStr,
            time: timeStr,
            duration_minutes: slotDuration,
            day_name: ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'][dayOfWeek]
          });
        }
        
        currentTime += slotDuration + buffer;
      }
    }
    
    res.json({
      space_id: space.id,
      space_title: space.title,
      host_name: `${space.host_first_name} ${space.host_last_name}`,
      availability: availability,
      exceptions: exceptions,
      available_slots: slots
    });
  } catch (error) {
    console.error('Error getting available slots:', error);
    res.status(500).json({ error: 'Error al obtener disponibilidad' });
  }
});

// Endpoint para solicitar una cita (requiere autenticación)
router.post('/:id/request-appointment', authenticateToken, [
  body('scheduled_date').notEmpty().isISO8601(),
  body('scheduled_time').notEmpty().matches(/^\d{2}:\d{2}$/),
  body('notes').optional().trim()
], (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }
  
  try {
    const { id: spaceId } = req.params;
    const { scheduled_date, scheduled_time, notes } = req.body;
    const guestId = req.user.id;
    
    // Verificar que el usuario es un cliente (GUEST)
    if (req.user.role !== 'GUEST') {
      return res.status(403).json({ error: 'Solo los clientes pueden solicitar citas' });
    }
    
    // Verificar que el espacio existe y tiene calendario activo
    const space = db.prepare(`
      SELECT s.id, s.host_id, s.title, s.is_calendar_active, s.status,
             u.email as host_email, u.first_name as host_first_name
      FROM spaces s
      JOIN users u ON s.host_id = u.id
      WHERE s.id = ? AND s.status = 'published' AND s.is_calendar_active = 1
    `).get(spaceId);
    
    if (!space) {
      return res.status(404).json({ error: 'Espacio no encontrado o sin calendario activo' });
    }
    
    // Verificar que no es el mismo host
    if (space.host_id === guestId) {
      return res.status(400).json({ error: 'No puedes agendar cita en tu propio espacio' });
    }
    
    // Verificar disponibilidad del día
    const dayOfWeek = new Date(scheduled_date).getDay();
    const dayAvailability = db.prepare(`
      SELECT * FROM host_availability 
      WHERE space_id = ? AND day_of_week = ? AND is_active = 1
    `).get(spaceId, dayOfWeek);
    
    if (!dayAvailability) {
      return res.status(400).json({ error: 'El host no tiene disponibilidad para este día' });
    }
    
    // Verificar que la fecha no está bloqueada
    const exception = db.prepare(`
      SELECT id FROM host_availability_exceptions 
      WHERE space_id = ? AND exception_date = ? AND is_blocked = 1
    `).get(spaceId, scheduled_date);
    
    if (exception) {
      return res.status(400).json({ error: 'Esta fecha está bloqueada por el propietario' });
    }
    
    // Verificar que el slot no está ocupado
    const existingAppointment = db.prepare(`
      SELECT id FROM appointments 
      WHERE space_id = ? AND scheduled_date = ? AND scheduled_time = ?
      AND status IN ('solicitada', 'aceptada', 'reprogramada')
    `).get(spaceId, scheduled_date, scheduled_time);
    
    if (existingAppointment) {
      return res.status(400).json({ error: 'Este horario ya está ocupado' });
    }
    
    // Verificar que el guest no tenga ya una cita pendiente para este espacio
    const pendingAppointment = db.prepare(`
      SELECT id FROM appointments 
      WHERE space_id = ? AND guest_id = ? AND status IN ('solicitada', 'aceptada')
    `).get(spaceId, guestId);
    
    if (pendingAppointment) {
      return res.status(400).json({ error: 'Ya tienes una cita pendiente para este espacio' });
    }
    
    // Crear la cita
    const appointmentId = generateId();
    const cancelToken = generateId();
    const confirmationToken = generateId();
    
    db.prepare(`
      INSERT INTO appointments (
        id, space_id, guest_id, host_id, scheduled_date, scheduled_time,
        status, notes, cancel_token, confirmation_token, duration_minutes,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, 'solicitada', ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `).run(
      appointmentId, spaceId, guestId, space.host_id, scheduled_date, scheduled_time,
      notes || null, cancelToken, confirmationToken, dayAvailability.slot_duration_minutes || 60
    );
    
    // Enviar notificación al host
    try {
      const { notifyAppointmentRequested } = require('../utils/notificationsService');
      notifyAppointmentRequested(appointmentId, req);
    } catch (notifError) {
      console.error('Error sending notification:', notifError);
    }
    
    logAudit(guestId, 'APPOINTMENT_REQUESTED', 'appointments', appointmentId, null, {
      space_id: spaceId,
      scheduled_date,
      scheduled_time
    }, req);
    
    res.status(201).json({
      message: 'Solicitud de cita enviada exitosamente',
      appointment: {
        id: appointmentId,
        space_id: spaceId,
        space_title: space.title,
        scheduled_date,
        scheduled_time,
        status: 'solicitada',
        cancel_token: cancelToken
      }
    });
  } catch (error) {
    console.error('Error requesting appointment:', error);
    res.status(500).json({ error: 'Error al solicitar cita' });
  }
});

router.get('/config/homepage', (req, res) => {
  try {
    const keys = [
      'hero_title', 'hero_subtitle', 'hero_button1_text', 'hero_button2_text',
      'howit_section_title', 'howit_step1_title', 'howit_step1_description',
      'howit_step2_title', 'howit_step2_description', 'howit_step3_title', 'howit_step3_description',
      'featured_section_title', 'featured_see_all_text',
      'trust_section_title', 'trust_feature1_title', 'trust_feature1_description',
      'trust_feature2_title', 'trust_feature2_description', 'trust_feature3_title', 'trust_feature3_description',
      'trust_feature4_title', 'trust_feature4_description',
      'footer_copyright_text', 'footer_disclaimer_text'
    ];
    
    const placeholders = keys.map(() => '?').join(', ');
    const configs = db.prepare(`SELECT key, value FROM system_config WHERE key IN (${placeholders})`).all(...keys);
    
    const content = {};
    configs.forEach(cfg => {
      content[cfg.key] = cfg.value;
    });
    
    res.json(content);
  } catch (error) {
    console.error('Error fetching homepage content:', error);
    res.status(500).json({ error: 'Error al obtener contenido' });
  }
});

module.exports = router;
