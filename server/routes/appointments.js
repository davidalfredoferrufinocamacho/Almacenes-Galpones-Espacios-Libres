const express = require('express');
const { body, validationResult } = require('express-validator');
const { db } = require('../config/database');
const { authenticateToken, requireRole } = require('../middleware/auth');
const { logAudit } = require('../middleware/audit');
const { generateId, getClientInfo } = require('../utils/helpers');

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
    const legalVersion = 'ANTIBYPASS_GUEST_V1';

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

module.exports = router;
