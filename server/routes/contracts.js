const express = require('express');
const { body, validationResult } = require('express-validator');
const { db } = require('../config/database');
const { authenticateToken, requireRole } = require('../middleware/auth');
const { logAudit } = require('../middleware/audit');
const { generateId, generateContractNumber, generateOTP, calculateEndDate, getClientInfo } = require('../utils/helpers');

const router = express.Router();

router.post('/create/:reservation_id', authenticateToken, requireRole('GUEST'), (req, res) => {
  try {
    const reservation = db.prepare(`
      SELECT * FROM reservations WHERE id = ? AND guest_id = ? AND status = 'confirmed'
    `).get(req.params.reservation_id, req.user.id);

    if (!reservation) {
      return res.status(404).json({ error: 'Reservacion no encontrada o no confirmada' });
    }

    const existingContract = db.prepare('SELECT id FROM contracts WHERE reservation_id = ?').get(reservation.id);
    if (existingContract) {
      return res.status(400).json({ error: 'Ya existe un contrato para esta reservacion' });
    }

    const space = db.prepare('SELECT * FROM spaces WHERE id = ?').get(reservation.space_id);
    const guest = db.prepare('SELECT * FROM users WHERE id = ?').get(reservation.guest_id);
    const host = db.prepare('SELECT * FROM users WHERE id = ?').get(reservation.host_id);

    const contractId = generateId();
    const contractNumber = generateContractNumber();
    const startDate = new Date().toISOString().split('T')[0];
    const endDate = calculateEndDate(startDate, reservation.period_type, reservation.period_quantity);

    const hostPayoutAmount = reservation.total_amount - reservation.commission_amount;

    const contractData = JSON.stringify({
      parties: {
        guest: {
          id: guest.id,
          name: guest.person_type === 'juridica' ? guest.company_name : `${guest.first_name} ${guest.last_name}`,
          person_type: guest.person_type,
          ci: guest.ci,
          nit: guest.nit,
          address: guest.address,
          city: guest.city
        },
        host: {
          id: host.id,
          name: host.person_type === 'juridica' ? host.company_name : `${host.first_name} ${host.last_name}`,
          person_type: host.person_type,
          ci: host.ci,
          nit: host.nit,
          address: host.address,
          city: host.city
        }
      },
      space: JSON.parse(reservation.frozen_space_data),
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
      legal: {
        jurisdiction: 'Bolivia',
        intermediary_clause: 'La plataforma actua unicamente como intermediario tecnologico',
        anti_bypass_clause: 'Queda prohibido contratar fuera de la plataforma'
      }
    });

    db.prepare(`
      INSERT INTO contracts (
        id, reservation_id, space_id, guest_id, host_id, contract_number,
        contract_data, frozen_space_data, frozen_video_url, frozen_description,
        sqm, period_type, period_quantity, start_date, end_date,
        total_amount, deposit_amount, commission_amount, host_payout_amount, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')
    `).run(
      contractId, reservation.id, reservation.space_id, reservation.guest_id, reservation.host_id,
      contractNumber, contractData, reservation.frozen_space_data, reservation.frozen_video_url,
      reservation.frozen_description, reservation.sqm_requested, reservation.period_type,
      reservation.period_quantity, startDate, endDate, reservation.total_amount,
      reservation.deposit_amount, reservation.commission_amount, hostPayoutAmount
    );

    logAudit(req.user.id, 'CONTRACT_CREATED', 'contracts', contractId, null, { contract_number: contractNumber }, req);

    res.status(201).json({
      contract_id: contractId,
      contract_number: contractNumber,
      message: 'Contrato creado. Proceda a firmar.'
    });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Error al crear contrato' });
  }
});

router.post('/:id/sign', authenticateToken, [
  body('otp').isLength({ min: 6, max: 6 })
], (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const contract = db.prepare('SELECT * FROM contracts WHERE id = ?').get(req.params.id);
    if (!contract) {
      return res.status(404).json({ error: 'Contrato no encontrado' });
    }

    const isGuest = contract.guest_id === req.user.id;
    const isHost = contract.host_id === req.user.id;

    if (!isGuest && !isHost) {
      return res.status(403).json({ error: 'No tiene permiso para firmar este contrato' });
    }

    const clientInfo = getClientInfo(req);
    const { otp } = req.body;

    if (isGuest) {
      if (contract.guest_signed) {
        return res.status(400).json({ error: 'Ya ha firmado este contrato' });
      }

      db.prepare(`
        UPDATE contracts SET
          guest_signed = 1,
          guest_signed_at = ?,
          guest_sign_ip = ?,
          guest_sign_otp = ?,
          guest_sign_user_agent = ?,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(clientInfo.timestamp, clientInfo.ip, otp, clientInfo.userAgent, req.params.id);

      logAudit(req.user.id, 'CONTRACT_SIGNED_GUEST', 'contracts', req.params.id, null, clientInfo, req);
    } else {
      if (contract.host_signed) {
        return res.status(400).json({ error: 'Ya ha firmado este contrato' });
      }

      if (!contract.guest_signed) {
        return res.status(400).json({ error: 'El guest debe firmar primero' });
      }

      db.prepare(`
        UPDATE contracts SET
          host_signed = 1,
          host_signed_at = ?,
          host_sign_ip = ?,
          host_sign_otp = ?,
          host_sign_user_agent = ?,
          status = 'signed',
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(clientInfo.timestamp, clientInfo.ip, otp, clientInfo.userAgent, req.params.id);

      db.prepare(`
        UPDATE reservations SET status = 'contract_signed', updated_at = CURRENT_TIMESTAMP WHERE id = ?
      `).run(contract.reservation_id);

      db.prepare(`
        UPDATE payments SET escrow_status = 'released', updated_at = CURRENT_TIMESTAMP
        WHERE reservation_id = ? AND escrow_status = 'held'
      `).run(contract.reservation_id);

      logAudit(req.user.id, 'CONTRACT_SIGNED_HOST', 'contracts', req.params.id, null, clientInfo, req);
      logAudit(req.user.id, 'ESCROW_RELEASED', 'contracts', req.params.id, null, { reservation_id: contract.reservation_id }, req);
    }

    const updatedContract = db.prepare('SELECT * FROM contracts WHERE id = ?').get(req.params.id);
    const bothSigned = updatedContract.guest_signed && updatedContract.host_signed;

    res.json({
      message: 'Contrato firmado exitosamente',
      fully_signed: bothSigned,
      escrow_released: bothSigned
    });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Error al firmar contrato' });
  }
});

router.get('/:id/generate-otp', authenticateToken, (req, res) => {
  try {
    const contract = db.prepare('SELECT * FROM contracts WHERE id = ?').get(req.params.id);
    if (!contract) {
      return res.status(404).json({ error: 'Contrato no encontrado' });
    }

    if (contract.guest_id !== req.user.id && contract.host_id !== req.user.id) {
      return res.status(403).json({ error: 'No tiene permiso' });
    }

    const otp = generateOTP();

    logAudit(req.user.id, 'OTP_GENERATED', 'contracts', req.params.id, null, { for_signing: true }, req);

    res.json({ otp, message: 'Use este codigo para firmar el contrato' });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Error al generar OTP' });
  }
});

router.get('/:id', authenticateToken, (req, res) => {
  try {
    const contract = db.prepare(`
      SELECT c.*, 
             s.title as space_title,
             ug.first_name as guest_first_name, ug.last_name as guest_last_name, ug.company_name as guest_company,
             uh.first_name as host_first_name, uh.last_name as host_last_name, uh.company_name as host_company
      FROM contracts c
      JOIN spaces s ON c.space_id = s.id
      JOIN users ug ON c.guest_id = ug.id
      JOIN users uh ON c.host_id = uh.id
      WHERE c.id = ?
    `).get(req.params.id);

    if (!contract) {
      return res.status(404).json({ error: 'Contrato no encontrado' });
    }

    if (contract.guest_id !== req.user.id && contract.host_id !== req.user.id && req.user.role !== 'ADMIN') {
      return res.status(403).json({ error: 'No tiene permiso para ver este contrato' });
    }

    res.json(contract);
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Error al obtener contrato' });
  }
});

router.post('/:id/extend', authenticateToken, requireRole('GUEST'), [
  body('period_type').isIn(['dia', 'semana', 'mes', 'trimestre', 'semestre', 'ano']),
  body('period_quantity').isInt({ min: 1 }),
  body('payment_method').isIn(['card', 'qr'])
], (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const contract = db.prepare(`
      SELECT * FROM contracts WHERE id = ? AND guest_id = ? AND status IN ('signed', 'active')
    `).get(req.params.id, req.user.id);

    if (!contract) {
      return res.status(404).json({ error: 'Contrato no encontrado o no activo' });
    }

    const { period_type, period_quantity, payment_method } = req.body;

    const space = db.prepare('SELECT * FROM spaces WHERE id = ?').get(contract.space_id);
    const priceField = `price_per_sqm_${period_type === 'ano' ? 'year' : period_type === 'dia' ? 'day' : period_type === 'semana' ? 'week' : period_type === 'trimestre' ? 'quarter' : period_type === 'semestre' ? 'semester' : 'month'}`;
    const pricePerSqm = space[priceField];

    const extensionAmount = pricePerSqm * contract.sqm * period_quantity;
    const commissionConfig = db.prepare("SELECT value FROM system_config WHERE key = 'commission_percentage'").get();
    const commissionPercentage = commissionConfig ? parseFloat(commissionConfig.value) : 10;
    const commissionAmount = (extensionAmount * commissionPercentage) / 100;

    const newEndDate = calculateEndDate(contract.end_date, period_type, period_quantity);

    const extensionId = generateId();
    const paymentId = generateId();
    const clientInfo = getClientInfo(req);

    db.prepare(`
      INSERT INTO contract_extensions (
        id, contract_id, original_end_date, new_end_date,
        extension_period_type, extension_period_quantity,
        extension_amount, commission_amount, anti_bypass_reaffirmed, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, 'pending')
    `).run(extensionId, contract.id, contract.end_date, newEndDate, period_type, period_quantity, extensionAmount, commissionAmount);

    db.prepare(`
      INSERT INTO payments (
        id, reservation_id, user_id, amount, payment_type, payment_method,
        status, ip_address, user_agent
      ) VALUES (?, ?, ?, ?, 'extension', ?, 'completed', ?, ?)
    `).run(paymentId, contract.reservation_id, req.user.id, extensionAmount, payment_method, clientInfo.ip, clientInfo.userAgent);

    db.prepare(`
      UPDATE contracts SET end_date = ?, status = 'extended', updated_at = CURRENT_TIMESTAMP WHERE id = ?
    `).run(newEndDate, contract.id);

    db.prepare(`
      UPDATE contract_extensions SET status = 'active' WHERE id = ?
    `).run(extensionId);

    logAudit(req.user.id, 'CONTRACT_EXTENDED', 'contract_extensions', extensionId, null, {
      original_end_date: contract.end_date,
      new_end_date: newEndDate,
      amount: extensionAmount,
      ...clientInfo
    }, req);

    res.json({
      extension_id: extensionId,
      payment_id: paymentId,
      new_end_date: newEndDate,
      amount: extensionAmount,
      message: 'Alquiler extendido exitosamente'
    });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Error al extender contrato' });
  }
});

module.exports = router;
