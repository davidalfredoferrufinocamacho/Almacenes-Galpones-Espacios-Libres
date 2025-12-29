const express = require('express');
const { body, validationResult } = require('express-validator');
const { db } = require('../config/database');
const { authenticateToken, requireRole } = require('../middleware/auth');
const { logAudit } = require('../middleware/audit');
const { generateId, getClientInfo, generateContractNumber, generateContractHash, calculateEndDate } = require('../utils/helpers');
const { getLegalClausesForContract } = require('../utils/legalTexts');
const { notifyContractCreated } = require('../utils/notificationsService');
const { notifyDepositPaid, notifyRemainingPaid, notifyRefundProcessed } = require('../utils/notificationsService');

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

router.post('/deposit', authenticateToken, requireRole('GUEST'), [
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

    const user = db.prepare('SELECT anti_bypass_accepted FROM users WHERE id = ?').get(req.user.id);
    if (!user || !user.anti_bypass_accepted) {
      return res.status(403).json({ error: 'Debe aceptar la Clausula Anti-Bypass antes de realizar reservaciones. Vaya a su perfil para aceptarla.' });
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

    const depositConfig = db.prepare("SELECT value FROM system_config WHERE key = 'deposit_percentage'").get();
    const depositPercentage = depositConfig ? parseFloat(depositConfig.value) : 10;
    const depositAmount = (totalAmount * depositPercentage) / 100;
    const remainingAmount = totalAmount - depositAmount;

    const commissionConfig = db.prepare("SELECT value FROM system_config WHERE key = 'commission_percentage'").get();
    const commissionPercentage = commissionConfig ? parseFloat(commissionConfig.value) : 10;
    const commissionAmount = (totalAmount * commissionPercentage) / 100;

    const reservationId = generateId();
    const paymentId = generateId();
    const clientInfo = getClientInfo(req);
    const snapshotTimestamp = new Date().toISOString();

    // =====================================================================
    // FROZEN CONTRACTUAL SNAPSHOT - Captura inmutable al momento del pago
    // IMPORTANTE: Estos datos NUNCA deben leerse de la tabla spaces despues
    // Cualquier cambio posterior del HOST NO afecta contratos existentes
    // =====================================================================

    // FROZEN: Datos estructurales del espacio
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

    // FROZEN: Todos los precios por m2 vigentes al momento de confirmacion
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
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PAID_DEPOSIT_ESCROW', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      reservationId, space_id, req.user.id, space.host_id, sqm_requested, period_type, period_quantity,
      totalAmount, depositPercentage, depositAmount, remainingAmount,
      commissionPercentage, commissionAmount,
      frozenSpaceData, space.video_url, space.video_duration, space.description,
      frozenPricing, depositPercentage, commissionPercentage,
      pricePerSqm, snapshotTimestamp,
      clientInfo.ip, clientInfo.userAgent
    );

    // Registrar evento de auditoria para snapshot contractual
    logAudit(req.user.id, 'CONTRACT_SNAPSHOT_CREATED', 'reservations', reservationId, null, {
      space_id,
      sqm_requested,
      period_type,
      period_quantity,
      total_amount: totalAmount,
      price_per_sqm_applied: pricePerSqm,
      deposit_percentage: depositPercentage,
      commission_percentage: commissionPercentage,
      video_duration: space.video_duration,
      snapshot_timestamp: snapshotTimestamp,
      ...clientInfo
    }, req);

    db.prepare(`
      INSERT INTO payments (
        id, reservation_id, user_id, amount, payment_type, payment_method,
        status, escrow_status, ip_address, user_agent
      ) VALUES (?, ?, ?, ?, 'deposit', ?, 'completed', 'held', ?, ?)
    `).run(paymentId, reservationId, req.user.id, depositAmount, payment_method, clientInfo.ip, clientInfo.userAgent);

    logAudit(req.user.id, 'DEPOSIT_PAID', 'payments', paymentId, null, {
      reservation_id: reservationId,
      amount: depositAmount,
      payment_method,
      ...clientInfo
    }, req);

    notifyDepositPaid(reservationId, depositAmount, req);

    res.status(201).json({
      reservation_id: reservationId,
      payment_id: paymentId,
      deposit_amount: depositAmount,
      remaining_amount: remainingAmount,
      total_amount: totalAmount,
      message: 'Anticipo pagado y retenido en escrow'
    });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Error al procesar pago' });
  }
});

router.post('/remaining/:reservation_id', authenticateToken, requireRole('GUEST'), [
  body('payment_method').isIn(['card', 'qr'])
], (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const reservation = db.prepare(`
      SELECT * FROM reservations WHERE id = ? AND guest_id = ? AND status IN ('PAID_DEPOSIT_ESCROW', 'visit_completed')
    `).get(req.params.reservation_id, req.user.id);

    if (!reservation) {
      return res.status(404).json({ error: 'Reservacion no encontrada o no esta en estado valido' });
    }

    // Verificar que no exista contrato previo
    const existingContract = db.prepare('SELECT id FROM contracts WHERE reservation_id = ?').get(reservation.id);
    if (existingContract) {
      return res.status(400).json({ error: 'Ya existe un contrato para esta reservacion', contract_id: existingContract.id });
    }

    // Validar datos FROZEN
    if (!reservation.frozen_space_data) {
      return res.status(400).json({ error: 'La reservacion no tiene datos contractuales congelados' });
    }

    const paymentId = generateId();
    const clientInfo = getClientInfo(req);

    db.prepare(`
      INSERT INTO payments (
        id, reservation_id, user_id, amount, payment_type, payment_method,
        status, escrow_status, ip_address, user_agent
      ) VALUES (?, ?, ?, ?, 'remaining', ?, 'completed', 'held', ?, ?)
    `).run(paymentId, reservation.id, req.user.id, reservation.remaining_amount, req.body.payment_method, clientInfo.ip, clientInfo.userAgent);

    db.prepare(`
      UPDATE reservations SET status = 'confirmed', updated_at = CURRENT_TIMESTAMP WHERE id = ?
    `).run(reservation.id);

    logAudit(req.user.id, 'REMAINING_PAID', 'payments', paymentId, null, {
      reservation_id: reservation.id,
      amount: reservation.remaining_amount,
      ...clientInfo
    }, req);

    notifyRemainingPaid(reservation.id, reservation.remaining_amount, req);

    // === GENERAR CONTRATO AUTOMATICAMENTE ===
    const guest = db.prepare('SELECT * FROM users WHERE id = ?').get(reservation.guest_id);
    const host = db.prepare('SELECT * FROM users WHERE id = ?').get(reservation.host_id);

    const contractId = generateId();
    const contractNumber = generateContractNumber();
    const startDate = new Date().toISOString().split('T')[0];
    const endDate = calculateEndDate(startDate, reservation.period_type, reservation.period_quantity);
    const hostPayoutAmount = reservation.total_amount - reservation.commission_amount;

    const frozenSpace = JSON.parse(reservation.frozen_space_data);
    const frozenPricing = reservation.frozen_pricing ? JSON.parse(reservation.frozen_pricing) : null;

    const contractData = JSON.stringify({
      parties: {
        guest: {
          id: guest.id,
          name: guest.person_type === 'juridica' ? guest.company_name : `${guest.first_name} ${guest.last_name}`,
          person_type: guest.person_type,
          ci: guest.ci,
          nit: guest.nit
        },
        host: {
          id: host.id,
          name: host.person_type === 'juridica' ? host.company_name : `${host.first_name} ${host.last_name}`,
          person_type: host.person_type,
          ci: host.ci,
          nit: host.nit
        }
      },
      space: frozenSpace,
      pricing_snapshot: frozenPricing,
      rental: {
        sqm: reservation.sqm_requested,
        period_type: reservation.period_type,
        period_quantity: reservation.period_quantity,
        start_date: startDate,
        end_date: endDate,
        total_amount: reservation.total_amount,
        deposit_amount: reservation.deposit_amount,
        commission_amount: reservation.commission_amount,
        host_payout: hostPayoutAmount
      },
      legal: getLegalClausesForContract()
    });

    const contractHash = generateContractHash(contractData);

    db.prepare(`
      INSERT INTO contracts (
        id, reservation_id, space_id, guest_id, host_id, contract_number,
        contract_data, contract_hash,
        frozen_space_data, frozen_video_url, frozen_video_duration, frozen_description,
        frozen_pricing, frozen_deposit_percentage, frozen_commission_percentage,
        frozen_price_per_sqm_applied, frozen_snapshot_created_at,
        sqm, period_type, period_quantity, start_date, end_date,
        total_amount, deposit_amount, commission_amount, host_payout_amount, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')
    `).run(
      contractId, reservation.id, reservation.space_id, reservation.guest_id, reservation.host_id,
      contractNumber, contractData, contractHash,
      reservation.frozen_space_data, reservation.frozen_video_url, reservation.frozen_video_duration,
      reservation.frozen_description, reservation.frozen_pricing, reservation.frozen_deposit_percentage,
      reservation.frozen_commission_percentage, reservation.frozen_price_per_sqm_applied,
      reservation.frozen_snapshot_created_at,
      reservation.sqm_requested, reservation.period_type,
      reservation.period_quantity, startDate, endDate, reservation.total_amount,
      reservation.deposit_amount, reservation.commission_amount, hostPayoutAmount
    );

    logAudit(req.user.id, 'CONTRACT_AUTO_CREATED', 'contracts', contractId, null, {
      contract_number: contractNumber,
      triggered_by: 'remaining_payment',
      payment_id: paymentId,
      ...clientInfo
    }, req);

    notifyContractCreated(contractId, req);

    res.json({
      payment_id: paymentId,
      amount: reservation.remaining_amount,
      contract_id: contractId,
      contract_number: contractNumber,
      message: 'Pago completado y contrato generado automaticamente. Proceda a firmar.'
    });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Error al procesar pago' });
  }
});

router.post('/refund/:reservation_id', authenticateToken, requireRole('GUEST'), (req, res) => {
  try {
    const clientInfo = getClientInfo(req);

    const signedContract = db.prepare(`
      SELECT id, status, guest_signed, host_signed FROM contracts 
      WHERE reservation_id = ? AND (guest_signed = 1 OR host_signed = 1)
    `).get(req.params.reservation_id);

    if (signedContract) {
      logAudit(req.user.id, 'REFUND_BLOCKED_CONTRACT_SIGNED', 'payments', null, null, {
        reservation_id: req.params.reservation_id,
        contract_id: signedContract.id,
        contract_status: signedContract.status,
        ...clientInfo
      }, req);

      return res.status(403).json({ 
        error: 'Contrato ya firmado - no reembolsable',
        contract_id: signedContract.id
      });
    }

    const reservation = db.prepare(`
      SELECT * FROM reservations WHERE id = ? AND guest_id = ? AND status IN ('PAID_DEPOSIT_ESCROW', 'appointment_scheduled', 'visit_completed')
    `).get(req.params.reservation_id, req.user.id);

    if (!reservation) {
      return res.status(404).json({ error: 'Reservacion no encontrada o no puede ser reembolsada' });
    }

    const depositPayment = db.prepare(`
      SELECT * FROM payments WHERE reservation_id = ? AND payment_type = 'deposit' AND status = 'completed'
    `).get(reservation.id);

    if (!depositPayment) {
      return res.status(400).json({ error: 'No se encontro pago de anticipo' });
    }

    const refundAmount = depositPayment.amount;

    const refundId = generateId();

    db.prepare(`
      INSERT INTO payments (
        id, reservation_id, user_id, amount, payment_type, payment_method,
        status, ip_address, user_agent
      ) VALUES (?, ?, ?, ?, 'refund', ?, 'completed', ?, ?)
    `).run(refundId, reservation.id, req.user.id, -refundAmount, depositPayment.payment_method, clientInfo.ip, clientInfo.userAgent);

    db.prepare(`
      UPDATE payments SET escrow_status = 'refunded', updated_at = CURRENT_TIMESTAMP WHERE id = ?
    `).run(depositPayment.id);

    db.prepare(`
      UPDATE reservations SET status = 'refunded', updated_at = CURRENT_TIMESTAMP WHERE id = ?
    `).run(reservation.id);

    logAudit(req.user.id, 'REFUND_PROCESSED', 'payments', refundId, null, {
      reservation_id: reservation.id,
      original_deposit_payment_id: depositPayment.id,
      refund_amount: refundAmount,
      ...clientInfo
    }, req);

    notifyRefundProcessed(refundId, refundAmount, 'approved', req);

    res.json({
      refund_id: refundId,
      amount: refundAmount,
      message: 'Reembolso del 100% procesado exitosamente'
    });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Error al procesar reembolso' });
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
