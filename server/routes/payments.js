const express = require('express');
const { body, validationResult } = require('express-validator');
const { db } = require('../config/database');
const { authenticateToken, requireRole } = require('../middleware/auth');
const { logAudit } = require('../middleware/audit');
const { generateId, getClientInfo, generateContractNumber, generateContractHash, calculateEndDate } = require('../utils/helpers');
const { getLegalClausesForContract } = require('../utils/legalTexts');
const { notifyContractCreated } = require('../utils/notificationsService');

const router = express.Router();

router.get('/methods', (req, res) => {
  try {
    const methods = db.prepare('SELECT code, name, description, instructions, icon FROM payment_methods WHERE is_active = 1 ORDER BY order_index ASC').all();
    res.json(methods);
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Error al obtener metodos de pago' });
  }
});

router.post('/full', authenticateToken, requireRole('GUEST'), [
  body('space_id').notEmpty(),
  body('sqm_requested').isFloat({ min: 1 }),
  body('period_type').isIn(['dia', 'semana', 'mes', 'trimestre', 'semestre', 'ano']),
  body('period_quantity').isInt({ min: 1 }),
  body('payment_method').notEmpty()
], (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { space_id, sqm_requested, period_type, period_quantity, payment_method } = req.body;

    const validMethod = db.prepare('SELECT code FROM payment_methods WHERE code = ? AND is_active = 1').get(payment_method);
    if (!validMethod) {
      return res.status(400).json({ error: 'Metodo de pago no valido o no disponible' });
    }

    const space = db.prepare('SELECT * FROM spaces WHERE id = ? AND status = ?').get(space_id, 'published');
    if (!space) {
      return res.status(404).json({ error: 'Espacio no encontrado o no disponible' });
    }

    if (sqm_requested > space.available_sqm) {
      return res.status(400).json({ error: 'No hay suficientes metros cuadrados disponibles' });
    }

    const priceField = `price_per_sqm_${period_type === 'ano' ? 'year' : period_type === 'dia' ? 'day' : period_type === 'semana' ? 'week' : period_type === 'trimestre' ? 'quarter' : period_type === 'semestre' ? 'semester' : 'month'}`;
    const pricePerSqm = space[priceField];

    if (!pricePerSqm) {
      return res.status(400).json({ error: 'El espacio no tiene precio configurado para este periodo' });
    }

    const totalAmount = pricePerSqm * sqm_requested * period_quantity;

    const commissionConfig = db.prepare("SELECT value FROM system_config WHERE key = 'commission_percentage'").get();
    const commissionPercentage = commissionConfig ? parseFloat(commissionConfig.value) : 10;
    const commissionAmount = (totalAmount * commissionPercentage) / 100;
    const hostPayoutAmount = totalAmount - commissionAmount;

    const reservationId = generateId();
    const paymentId = generateId();
    const clientInfo = getClientInfo(req);
    const snapshotTimestamp = new Date().toISOString();

    const frozenSpaceData = JSON.stringify({
      title: space.title,
      space_type: space.space_type,
      total_sqm: space.total_sqm,
      available_sqm_at_confirmation: space.available_sqm,
      address: space.address,
      city: space.city,
      department: space.department,
      latitude: space.latitude,
      longitude: space.longitude,
      conditions: {
        is_open: space.is_open,
        has_roof: space.has_roof,
        rain_protected: space.rain_protected,
        dust_protected: space.dust_protected,
        access_type: space.access_type,
        has_security: space.has_security,
        security_description: space.security_description,
        schedule: space.schedule
      }
    });

    const frozenPricing = JSON.stringify({
      price_per_sqm_day: space.price_per_sqm_day,
      price_per_sqm_week: space.price_per_sqm_week,
      price_per_sqm_month: space.price_per_sqm_month,
      price_per_sqm_quarter: space.price_per_sqm_quarter,
      price_per_sqm_semester: space.price_per_sqm_semester,
      price_per_sqm_year: space.price_per_sqm_year,
      captured_at: snapshotTimestamp
    });

    db.prepare(`
      INSERT INTO reservations (
        id, space_id, guest_id, host_id, sqm_requested, period_type, period_quantity,
        total_amount, deposit_percentage, deposit_amount, remaining_amount,
        commission_percentage, commission_amount, status,
        frozen_space_data, frozen_video_url, frozen_video_duration, frozen_description,
        frozen_pricing, frozen_deposit_percentage, frozen_commission_percentage,
        frozen_price_per_sqm_applied, frozen_snapshot_created_at,
        frozen_snapshot_ip, frozen_snapshot_user_agent
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, 0, 0, ?, ?, 'full_paid', ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?)
    `).run(
      reservationId, space_id, req.user.id, space.host_id, sqm_requested, period_type, period_quantity,
      totalAmount,
      commissionPercentage, commissionAmount,
      frozenSpaceData, space.video_url, space.video_duration, space.description,
      frozenPricing, commissionPercentage,
      pricePerSqm, snapshotTimestamp,
      clientInfo.ip, clientInfo.userAgent
    );

    db.prepare(`
      INSERT INTO payments (
        id, reservation_id, user_id, amount, payment_type, payment_method,
        status, escrow_status, ip_address, user_agent
      ) VALUES (?, ?, ?, ?, 'full', ?, 'completed', 'released', ?, ?)
    `).run(paymentId, reservationId, req.user.id, totalAmount, payment_method, clientInfo.ip, clientInfo.userAgent);

    db.prepare(`
      INSERT INTO payments (
        id, reservation_id, user_id, amount, payment_type, payment_method,
        status, escrow_status, ip_address, user_agent, notes
      ) VALUES (?, ?, ?, ?, 'commission', 'platform', 'completed', 'released', ?, ?, 'Comision automatica de la plataforma')
    `).run(generateId(), reservationId, space.host_id, commissionAmount, clientInfo.ip, clientInfo.userAgent);

    db.prepare(`
      INSERT INTO payments (
        id, reservation_id, user_id, amount, payment_type, payment_method,
        status, escrow_status, ip_address, user_agent, notes
      ) VALUES (?, ?, ?, ?, 'host_payout', 'platform', 'pending', 'pending', ?, ?, 'Pago pendiente al propietario')
    `).run(generateId(), reservationId, space.host_id, hostPayoutAmount, clientInfo.ip, clientInfo.userAgent);

    logAudit(req.user.id, 'FULL_PAYMENT_COMPLETED', 'payments', paymentId, null, {
      reservation_id: reservationId,
      total_amount: totalAmount,
      commission_amount: commissionAmount,
      host_payout_amount: hostPayoutAmount,
      payment_method,
      ...clientInfo
    }, req);

    res.status(201).json({
      reservation_id: reservationId,
      payment_id: paymentId,
      total_amount: totalAmount,
      commission_amount: commissionAmount,
      host_payout_amount: hostPayoutAmount,
      message: 'Pago completo realizado exitosamente. Puede generar su contrato.'
    });
  } catch (error) {
    console.error('Error pago completo:', error);
    res.status(500).json({ error: 'Error al procesar pago completo' });
  }
});

router.get('/my-payments', authenticateToken, (req, res) => {
  try {
    const payments = db.prepare(`
      SELECT p.*, r.space_id, s.title as space_title
      FROM payments p
      JOIN reservations r ON p.reservation_id = r.id
      JOIN spaces s ON r.space_id = s.id
      WHERE p.user_id = ?
      ORDER BY p.created_at DESC
    `).all(req.user.id);

    res.json(payments);
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Error al obtener pagos' });
  }
});

module.exports = router;
