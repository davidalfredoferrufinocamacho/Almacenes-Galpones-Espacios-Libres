const express = require('express');
const { body, validationResult } = require('express-validator');
const { db } = require('../config/database');
const { authenticateToken, requireRole } = require('../middleware/auth');
const { logAudit } = require('../middleware/audit');
const { generateId, getClientInfo } = require('../utils/helpers');
const { getAntiBypassForRole } = require('../utils/legalTexts');
const { notifyAppointmentRequested, notifyAppointmentAccepted, notifyAppointmentRejected, notifyAppointmentRescheduled } = require('../utils/notificationsService');

const router = express.Router();

router.post('/', authenticateToken, requireRole('GUEST'), [
  body('reservation_id').notEmpty(),
  body('scheduled_date').isISO8601(),
  body('scheduled_time').matches(/^\d{2}:\d{2}$/)
], (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { reservation_id, scheduled_date, scheduled_time } = req.body;

    const userAntiBypass = db.prepare('SELECT anti_bypass_accepted FROM users WHERE id = ?').get(req.user.id);
    if (!userAntiBypass || !userAntiBypass.anti_bypass_accepted) {
      return res.status(403).json({ error: 'Debe aceptar la Clausula Anti-Bypass antes de contactar propietarios. Vaya a su perfil para aceptarla.' });
    }

    const reservation = db.prepare(`
      SELECT r.*, s.id as space_id, s.host_id, s.is_calendar_active, s.status as space_status
      FROM reservations r 
      JOIN spaces s ON r.space_id = s.id
      WHERE r.id = ? AND r.guest_id = ? AND r.status = 'PAID_DEPOSIT_ESCROW'
    `).get(reservation_id, req.user.id);

    if (!reservation) {
      return res.status(404).json({ error: 'Reservacion no encontrada o no esta en estado valido' });
    }

    if (reservation.is_calendar_active !== 1) {
      return res.status(400).json({ error: 'El calendario del espacio no esta activo. El HOST debe activar el calendario para agendar citas.' });
    }

    const availability = db.prepare(`
      SELECT * FROM host_availability 
      WHERE space_id = ? AND is_blocked = 0
      AND (
        (specific_date = ? AND start_time <= ? AND end_time >= ?)
        OR (day_of_week = ? AND start_time <= ? AND end_time >= ?)
      )
    `).get(
      reservation.space_id,
      scheduled_date, scheduled_time, scheduled_time,
      new Date(scheduled_date).getDay(), scheduled_time, scheduled_time
    );

    if (!availability) {
      return res.status(400).json({ error: 'El horario seleccionado no esta disponible' });
    }

    const appointmentId = generateId();
    const clientInfo = getClientInfo(req);

    db.prepare(`
      INSERT INTO appointments (
        id, reservation_id, space_id, guest_id, host_id,
        scheduled_date, scheduled_time, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 'solicitada')
    `).run(
      appointmentId, reservation_id, reservation.space_id,
      req.user.id, reservation.host_id, scheduled_date, scheduled_time
    );

    db.prepare(`
      UPDATE reservations SET status = 'appointment_scheduled', updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(reservation_id);

    logAudit(req.user.id, 'APPOINTMENT_REQUESTED', 'appointments', appointmentId, null, {
      scheduled_date, scheduled_time, ...clientInfo
    }, req);

    notifyAppointmentRequested(appointmentId, req);

    res.status(201).json({ id: appointmentId, message: 'Cita solicitada' });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Error al crear cita' });
  }
});

router.post('/:id/accept-anti-bypass', authenticateToken, requireRole('GUEST'), (req, res) => {
  try {
    const appointment = db.prepare(`
      SELECT * FROM appointments WHERE id = ? AND guest_id = ?
    `).get(req.params.id, req.user.id);

    if (!appointment) {
      return res.status(404).json({ error: 'Cita no encontrada' });
    }

    const clientInfo = getClientInfo(req);
    const antiBypassText = getAntiBypassForRole('GUEST');
    const legalVersion = `${antiBypassText.type}_v${antiBypassText.version}`;

    db.prepare(`
      UPDATE appointments SET
        anti_bypass_guest_accepted = 1,
        anti_bypass_guest_accepted_at = ?,
        anti_bypass_guest_ip = ?,
        anti_bypass_guest_user_agent = ?,
        anti_bypass_guest_legal_version = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(clientInfo.timestamp, clientInfo.ip, clientInfo.userAgent, legalVersion, req.params.id);

    logAudit(req.user.id, 'APPOINTMENT_ANTIBYPASS_ACCEPTED', 'appointments', req.params.id, null, {
      space_id: appointment.space_id,
      legal_text_version: legalVersion,
      legal_text_id: antiBypassText.id,
      ...clientInfo
    }, req);

    res.json({ message: 'Clausula anti-bypass aceptada para la cita' });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Error al procesar solicitud' });
  }
});

router.put('/:id/accept', authenticateToken, requireRole('HOST'), (req, res) => {
  try {
    const appointment = db.prepare(`
      SELECT * FROM appointments WHERE id = ? AND host_id = ? AND status = 'solicitada'
    `).get(req.params.id, req.user.id);

    if (!appointment) {
      return res.status(404).json({ error: 'Cita no encontrada' });
    }

    if (!appointment.anti_bypass_guest_accepted) {
      return res.status(400).json({ error: 'El guest debe aceptar la clausula anti-bypass primero' });
    }

    const oldStatus = appointment.status;

    db.prepare(`
      UPDATE appointments SET status = 'aceptada', updated_at = CURRENT_TIMESTAMP WHERE id = ?
    `).run(req.params.id);

    logAudit(req.user.id, 'APPOINTMENT_ACCEPTED', 'appointments', req.params.id, 
      { status: oldStatus }, { status: 'aceptada' }, req);

    notifyAppointmentAccepted(req.params.id, req);

    res.json({ message: 'Cita aceptada' });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Error al aceptar cita' });
  }
});

router.put('/:id/reject', authenticateToken, requireRole('HOST'), (req, res) => {
  try {
    const appointment = db.prepare(`
      SELECT * FROM appointments WHERE id = ? AND host_id = ? AND status = 'solicitada'
    `).get(req.params.id, req.user.id);

    if (!appointment) {
      return res.status(404).json({ error: 'Cita no encontrada' });
    }

    const oldStatus = appointment.status;

    db.prepare(`
      UPDATE appointments SET status = 'rechazada', notes = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?
    `).run(req.body.reason || null, req.params.id);

    logAudit(req.user.id, 'APPOINTMENT_REJECTED', 'appointments', req.params.id, 
      { status: oldStatus }, { status: 'rechazada', reason: req.body.reason }, req);

    notifyAppointmentRejected(req.params.id, req.body.reason, req);

    res.json({ message: 'Cita rechazada' });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Error al rechazar cita' });
  }
});

router.put('/:id/reschedule', authenticateToken, requireRole('HOST'), [
  body('new_date').isISO8601(),
  body('new_time').matches(/^\d{2}:\d{2}$/),
  body('reason').optional().trim()
], (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const appointment = db.prepare(`
      SELECT * FROM appointments WHERE id = ? AND host_id = ? AND status IN ('solicitada', 'aceptada')
    `).get(req.params.id, req.user.id);

    if (!appointment) {
      return res.status(404).json({ error: 'Cita no encontrada' });
    }

    const { new_date, new_time, reason } = req.body;

    const oldStatus = appointment.status;

    db.prepare(`
      UPDATE appointments SET 
        status = 'reprogramada',
        reschedule_date = ?,
        reschedule_time = ?,
        reschedule_reason = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(new_date, new_time, reason, req.params.id);

    logAudit(req.user.id, 'APPOINTMENT_RESCHEDULED', 'appointments', req.params.id, 
      { status: oldStatus, scheduled_date: appointment.scheduled_date, scheduled_time: appointment.scheduled_time }, 
      { status: 'reprogramada', new_date, new_time, reason }, req);

    notifyAppointmentRescheduled(req.params.id, new_date, new_time, reason, req);

    res.json({ message: 'Reprogramacion propuesta' });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Error al reprogramar cita' });
  }
});

router.put('/:id/accept-reschedule', authenticateToken, requireRole('GUEST'), (req, res) => {
  try {
    const appointment = db.prepare(`
      SELECT * FROM appointments WHERE id = ? AND guest_id = ? AND status = 'reprogramada'
    `).get(req.params.id, req.user.id);

    if (!appointment) {
      return res.status(404).json({ error: 'Cita no encontrada' });
    }

    const oldStatus = appointment.status;

    db.prepare(`
      UPDATE appointments SET 
        status = 'aceptada',
        scheduled_date = reschedule_date,
        scheduled_time = reschedule_time,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(req.params.id);

    logAudit(req.user.id, 'APPOINTMENT_RESCHEDULE_ACCEPTED', 'appointments', req.params.id, 
      { status: oldStatus, scheduled_date: appointment.scheduled_date, scheduled_time: appointment.scheduled_time }, 
      { status: 'aceptada', scheduled_date: appointment.reschedule_date, scheduled_time: appointment.reschedule_time }, req);

    res.json({ message: 'Reprogramacion aceptada' });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Error al aceptar reprogramacion' });
  }
});

router.put('/:id/reject-reschedule', authenticateToken, requireRole('GUEST'), (req, res) => {
  try {
    const appointment = db.prepare(`
      SELECT * FROM appointments WHERE id = ? AND guest_id = ? AND status = 'reprogramada'
    `).get(req.params.id, req.user.id);

    if (!appointment) {
      return res.status(404).json({ error: 'Cita no encontrada' });
    }

    const oldStatus = appointment.status;

    db.prepare(`
      UPDATE appointments SET status = 'cancelada', updated_at = CURRENT_TIMESTAMP WHERE id = ?
    `).run(req.params.id);

    if (appointment.reservation_id) {
      db.prepare(`
        UPDATE reservations SET status = 'PAID_DEPOSIT_ESCROW', updated_at = CURRENT_TIMESTAMP WHERE id = ?
      `).run(appointment.reservation_id);
    }

    logAudit(req.user.id, 'APPOINTMENT_RESCHEDULE_REJECTED', 'appointments', req.params.id, 
      { status: oldStatus }, { status: 'cancelada' }, req);

    res.json({ message: 'Reprogramacion rechazada, cita cancelada' });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Error al rechazar reprogramacion' });
  }
});

router.put('/:id/mark-completed', authenticateToken, requireRole('HOST'), (req, res) => {
  try {
    const appointment = db.prepare(`
      SELECT * FROM appointments WHERE id = ? AND host_id = ? AND status = 'aceptada'
    `).get(req.params.id, req.user.id);

    if (!appointment) {
      return res.status(404).json({ error: 'Cita no encontrada' });
    }

    const oldStatus = appointment.status;

    db.prepare(`
      UPDATE appointments SET status = 'realizada', updated_at = CURRENT_TIMESTAMP WHERE id = ?
    `).run(req.params.id);

    db.prepare(`
      UPDATE reservations SET status = 'visit_completed', updated_at = CURRENT_TIMESTAMP WHERE id = ?
    `).run(appointment.reservation_id);

    logAudit(req.user.id, 'APPOINTMENT_COMPLETED', 'appointments', req.params.id, 
      { status: oldStatus }, { status: 'realizada' }, req);

    res.json({ message: 'Visita marcada como realizada' });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Error al marcar visita' });
  }
});

router.put('/:id/mark-no-show', authenticateToken, requireRole('HOST'), (req, res) => {
  try {
    const appointment = db.prepare(`
      SELECT * FROM appointments WHERE id = ? AND host_id = ? AND status = 'aceptada'
    `).get(req.params.id, req.user.id);

    if (!appointment) {
      return res.status(404).json({ error: 'Cita no encontrada' });
    }

    const oldStatus = appointment.status;

    db.prepare(`
      UPDATE appointments SET status = 'no_asistida', updated_at = CURRENT_TIMESTAMP WHERE id = ?
    `).run(req.params.id);

    logAudit(req.user.id, 'APPOINTMENT_NO_SHOW', 'appointments', req.params.id, 
      { status: oldStatus }, { status: 'no_asistida' }, req);

    res.json({ message: 'Visita marcada como no asistida' });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Error al marcar visita' });
  }
});

router.get('/my-appointments', authenticateToken, (req, res) => {
  try {
    let query;
    if (req.user.role === 'HOST') {
      query = db.prepare(`
        SELECT a.*, s.title as space_title, u.first_name as guest_first_name, u.last_name as guest_last_name
        FROM appointments a
        JOIN spaces s ON a.space_id = s.id
        JOIN users u ON a.guest_id = u.id
        WHERE a.host_id = ?
        ORDER BY a.scheduled_date DESC, a.scheduled_time DESC
      `);
    } else {
      query = db.prepare(`
        SELECT a.*, s.title as space_title, u.first_name as host_first_name, u.last_name as host_last_name
        FROM appointments a
        JOIN spaces s ON a.space_id = s.id
        JOIN users u ON a.host_id = u.id
        WHERE a.guest_id = ?
        ORDER BY a.scheduled_date DESC, a.scheduled_time DESC
      `);
    }

    const appointments = query.all(req.user.id);
    res.json(appointments);
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Error al obtener citas' });
  }
});

// =====================================================================
// CANCELACION PUBLICA CON TOKEN (desde email)
// =====================================================================
router.get('/cancel/:token', (req, res) => {
  try {
    const appointment = db.prepare(`
      SELECT a.*, s.title as space_title, s.id as space_id,
             ug.first_name as guest_first_name, ug.last_name as guest_last_name,
             uh.first_name as host_first_name, uh.last_name as host_last_name
      FROM appointments a
      JOIN spaces s ON a.space_id = s.id
      JOIN users ug ON a.guest_id = ug.id
      JOIN users uh ON a.host_id = uh.id
      WHERE a.cancel_token = ? AND a.status NOT IN ('cancelada', 'realizada')
    `).get(req.params.token);

    if (!appointment) {
      return res.status(404).json({ error: 'Cita no encontrada o ya fue cancelada/completada' });
    }

    res.json({
      id: appointment.id,
      space_title: appointment.space_title,
      space_id: appointment.space_id,
      scheduled_date: appointment.scheduled_date,
      scheduled_time: appointment.scheduled_time,
      guest_name: `${appointment.guest_first_name} ${appointment.guest_last_name}`,
      host_name: `${appointment.host_first_name} ${appointment.host_last_name}`
    });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Error al obtener cita' });
  }
});

router.post('/cancel/:token', [
  body('reason').notEmpty().withMessage('El motivo es obligatorio'),
  body('cancelled_by').isIn(['guest', 'host'])
], (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const appointment = db.prepare(`
      SELECT a.*, s.id as space_id, r.id as reservation_id
      FROM appointments a
      JOIN spaces s ON a.space_id = s.id
      JOIN reservations r ON a.reservation_id = r.id
      WHERE a.cancel_token = ? AND a.status NOT IN ('cancelada', 'realizada')
    `).get(req.params.token);

    if (!appointment) {
      return res.status(404).json({ error: 'Cita no encontrada o ya fue cancelada/completada' });
    }

    const { reason, cancelled_by } = req.body;

    db.prepare(`
      UPDATE appointments SET 
        status = 'cancelada', 
        cancelled_by = ?, 
        cancellation_reason = ?,
        updated_at = CURRENT_TIMESTAMP 
      WHERE id = ?
    `).run(cancelled_by, reason, appointment.id);

    db.prepare(`
      UPDATE reservations SET status = 'PAID_DEPOSIT_ESCROW', updated_at = CURRENT_TIMESTAMP WHERE id = ?
    `).run(appointment.reservation_id);

    logAudit(null, 'APPOINTMENT_CANCELLED_VIA_TOKEN', 'appointments', appointment.id, 
      { status: appointment.status }, { status: 'cancelada', cancelled_by, reason }, req);

    res.json({ 
      message: 'Cita cancelada exitosamente',
      space_id: appointment.space_id
    });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Error al cancelar cita' });
  }
});

// =====================================================================
// ENDPOINTS ADMIN
// =====================================================================
router.get('/admin/all', authenticateToken, requireRole('ADMIN'), (req, res) => {
  try {
    const { status, space_id, host_id, guest_id, from_date, to_date } = req.query;
    
    let query = `
      SELECT a.*, 
             s.title as space_title, s.address as space_address, s.city as space_city,
             ug.first_name as guest_first_name, ug.last_name as guest_last_name, ug.email as guest_email,
             uh.first_name as host_first_name, uh.last_name as host_last_name, uh.email as host_email
      FROM appointments a
      JOIN spaces s ON a.space_id = s.id
      JOIN users ug ON a.guest_id = ug.id
      JOIN users uh ON a.host_id = uh.id
      WHERE 1=1
    `;
    const params = [];

    if (status) {
      query += ' AND a.status = ?';
      params.push(status);
    }
    if (space_id) {
      query += ' AND a.space_id = ?';
      params.push(space_id);
    }
    if (host_id) {
      query += ' AND a.host_id = ?';
      params.push(host_id);
    }
    if (guest_id) {
      query += ' AND a.guest_id = ?';
      params.push(guest_id);
    }
    if (from_date) {
      query += ' AND a.scheduled_date >= ?';
      params.push(from_date);
    }
    if (to_date) {
      query += ' AND a.scheduled_date <= ?';
      params.push(to_date);
    }

    query += ' ORDER BY a.scheduled_date DESC, a.scheduled_time DESC';

    const appointments = db.prepare(query).all(...params);

    const stats = db.prepare(`
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN status = 'solicitada' THEN 1 ELSE 0 END) as pending,
        SUM(CASE WHEN status = 'aceptada' THEN 1 ELSE 0 END) as accepted,
        SUM(CASE WHEN status = 'realizada' THEN 1 ELSE 0 END) as completed,
        SUM(CASE WHEN status = 'cancelada' THEN 1 ELSE 0 END) as cancelled
      FROM appointments
    `).get();

    res.json({ appointments, stats });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Error al obtener citas' });
  }
});

router.put('/admin/:id/cancel', authenticateToken, requireRole('ADMIN'), [
  body('reason').notEmpty()
], (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const appointment = db.prepare('SELECT * FROM appointments WHERE id = ?').get(req.params.id);
    if (!appointment) {
      return res.status(404).json({ error: 'Cita no encontrada' });
    }

    const { reason } = req.body;

    db.prepare(`
      UPDATE appointments SET 
        status = 'cancelada', 
        cancelled_by = 'admin', 
        cancellation_reason = ?,
        updated_at = CURRENT_TIMESTAMP 
      WHERE id = ?
    `).run(reason, req.params.id);

    db.prepare(`
      UPDATE reservations SET status = 'PAID_DEPOSIT_ESCROW', updated_at = CURRENT_TIMESTAMP WHERE id = ?
    `).run(appointment.reservation_id);

    logAudit(req.user.id, 'APPOINTMENT_CANCELLED_BY_ADMIN', 'appointments', req.params.id, 
      { status: appointment.status }, { status: 'cancelada', reason }, req);

    res.json({ message: 'Cita cancelada por admin' });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Error al cancelar cita' });
  }
});

module.exports = router;
