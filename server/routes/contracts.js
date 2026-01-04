const express = require('express');
const { body, validationResult } = require('express-validator');
const path = require('path');
const fs = require('fs');
const PDFDocument = require('pdfkit');
const { db } = require('../config/database');
const { authenticateToken, requireRole } = require('../middleware/auth');
const { logAudit } = require('../middleware/audit');
const { generateId, generateContractNumber, generateInvoiceNumber, generateOTP, hashOTP, verifyOTP, getOTPExpiration, isOTPExpired, calculateEndDate, getClientInfo, generateContractHash, generateSignatureCertificate, OTP_EXPIRATION_MINUTES } = require('../utils/helpers');
const { getLegalClausesForContract, getActiveLegalText } = require('../utils/legalTexts');
const { notifyContractCreated, notifyContractSigned } = require('../utils/notificationsService');

function validateLegalIdentity(user) {
  if (user.person_type === 'natural') {
    return { valid: !!user.ci, missing: user.ci ? null : 'CI' };
  } else if (user.person_type === 'juridica') {
    return { valid: !!user.nit, missing: user.nit ? null : 'NIT' };
  }
  return { valid: false, missing: 'person_type' };
}

const router = express.Router();

// =====================================================================
// NUEVO FLUJO: Propuesta de contrato con doble confirmacion
// 1. Cliente propone contrato (sin pago)
// 2. Propietario aprueba o rechaza
// 3. Si aprueba, cliente puede pagar
// =====================================================================

// Endpoint para que el cliente proponga un contrato (despues de cita confirmada)
router.post('/propose', authenticateToken, requireRole('GUEST'), [
  body('appointment_id').notEmpty().withMessage('ID de cita requerido'),
  body('sqm').isFloat({ min: 1 }).withMessage('Superficie debe ser mayor a 0'),
  body('period_type').isIn(['dia', 'semana', 'mes', 'trimestre', 'semestre', 'ano']).withMessage('Tipo de periodo invalido'),
  body('period_quantity').isInt({ min: 1 }).withMessage('Cantidad de periodos debe ser mayor a 0'),
  body('start_date').isISO8601().withMessage('Fecha de inicio invalida')
], (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { appointment_id, sqm, period_type, period_quantity, start_date } = req.body;

    // Verificar que la cita existe y esta confirmada por ambas partes
    const appointment = db.prepare(`
      SELECT a.*, s.host_id, s.title as space_title,
        s.price_per_sqm_day, s.price_per_sqm_week, s.price_per_sqm_month,
        s.price_per_sqm_quarter, s.price_per_sqm_semester, s.price_per_sqm_year,
        s.total_sqm, s.available_sqm, s.space_type, s.description, s.address, s.city, s.department,
        s.has_roof, s.rain_protected, s.dust_protected, s.has_security, s.access_type
      FROM appointments a
      JOIN spaces s ON a.space_id = s.id
      WHERE a.id = ? AND a.guest_id = ? AND a.status = 'realizada'
    `).get(appointment_id, req.user.id);

    if (!appointment) {
      return res.status(404).json({ error: 'Cita no encontrada o no esta marcada como realizada' });
    }

    // Verificar que no existe ya un contrato propuesto para esta cita
    const existingContract = db.prepare(`
      SELECT id, status FROM contracts WHERE space_id = ? AND guest_id = ? 
      AND status IN ('guest_proposed', 'host_approved', 'pending', 'signed')
    `).get(appointment.space_id, req.user.id);

    if (existingContract) {
      return res.status(400).json({ error: 'Ya existe un contrato en proceso para este espacio' });
    }

    // Validar superficie solicitada
    if (sqm > appointment.available_sqm) {
      return res.status(400).json({ error: `Superficie solicitada (${sqm} m²) excede la disponible (${appointment.available_sqm} m²)` });
    }

    // Obtener precio por m2 segun tipo de periodo
    let pricePerSqm = 0;
    switch (period_type) {
      case 'dia': pricePerSqm = appointment.price_per_sqm_day || 0; break;
      case 'semana': pricePerSqm = appointment.price_per_sqm_week || 0; break;
      case 'mes': pricePerSqm = appointment.price_per_sqm_month || 0; break;
      case 'trimestre': pricePerSqm = appointment.price_per_sqm_quarter || 0; break;
      case 'semestre': pricePerSqm = appointment.price_per_sqm_semester || 0; break;
      case 'ano': pricePerSqm = appointment.price_per_sqm_year || 0; break;
    }

    if (pricePerSqm <= 0) {
      return res.status(400).json({ error: `No hay precio configurado para el periodo tipo: ${period_type}` });
    }

    // Calcular montos
    const totalAmount = sqm * pricePerSqm * period_quantity;
    const endDate = calculateEndDate(start_date, period_type, period_quantity);

    // Obtener configuracion de comision
    const config = db.prepare("SELECT value FROM site_config WHERE key = 'commission_percentage'").get();
    const commissionPercentage = config ? parseFloat(config.value) : 10;
    const commissionAmount = totalAmount * (commissionPercentage / 100);
    const hostPayoutAmount = totalAmount - commissionAmount;

    // Obtener datos del guest y host
    const guest = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
    const host = db.prepare('SELECT * FROM users WHERE id = ?').get(appointment.host_id);

    // Validar identidad legal
    const guestIdentity = validateLegalIdentity(guest);
    if (!guestIdentity.valid) {
      return res.status(400).json({ 
        error: `Complete su perfil: falta ${guestIdentity.missing}`,
        incomplete_profile: true
      });
    }

    const clientInfo = getClientInfo(req);
    const contractId = generateId();
    const contractNumber = generateContractNumber();

    // Crear datos FROZEN del espacio
    const frozenSpaceData = JSON.stringify({
      id: appointment.space_id,
      title: appointment.space_title,
      space_type: appointment.space_type,
      total_sqm: appointment.total_sqm,
      available_sqm: appointment.available_sqm,
      address: appointment.address,
      city: appointment.city,
      department: appointment.department,
      has_roof: appointment.has_roof,
      rain_protected: appointment.rain_protected,
      dust_protected: appointment.dust_protected,
      has_security: appointment.has_security,
      access_type: appointment.access_type
    });

    const frozenPricing = JSON.stringify({
      price_per_sqm_day: appointment.price_per_sqm_day,
      price_per_sqm_week: appointment.price_per_sqm_week,
      price_per_sqm_month: appointment.price_per_sqm_month,
      price_per_sqm_quarter: appointment.price_per_sqm_quarter,
      price_per_sqm_semester: appointment.price_per_sqm_semester,
      price_per_sqm_year: appointment.price_per_sqm_year
    });

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
      space: JSON.parse(frozenSpaceData),
      pricing_snapshot: JSON.parse(frozenPricing),
      rental: {
        sqm: sqm,
        period_type: period_type,
        period_quantity: period_quantity,
        start_date: start_date,
        end_date: endDate,
        total_amount: totalAmount,
        commission_percentage: commissionPercentage,
        commission_amount: commissionAmount,
        price_per_sqm_applied: pricePerSqm,
        host_payout: hostPayoutAmount
      },
      legal: getLegalClausesForContract()
    });

    const contractHash = generateContractHash(contractData);

    // Insertar contrato con status 'guest_proposed'
    db.prepare(`
      INSERT INTO contracts (
        id, reservation_id, space_id, guest_id, host_id, contract_number,
        contract_data, contract_hash,
        frozen_space_data, frozen_description,
        frozen_pricing, frozen_commission_percentage,
        frozen_price_per_sqm_applied, frozen_snapshot_created_at,
        sqm, period_type, period_quantity, start_date, end_date,
        total_amount, deposit_amount, commission_amount, host_payout_amount,
        status, guest_proposed_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'guest_proposed', ?)
    `).run(
      contractId, appointment_id, appointment.space_id, req.user.id, appointment.host_id,
      contractNumber, contractData, contractHash,
      frozenSpaceData, appointment.description,
      frozenPricing, commissionPercentage,
      pricePerSqm, clientInfo.timestamp,
      sqm, period_type, period_quantity, start_date, endDate,
      totalAmount, 0, commissionAmount, hostPayoutAmount,
      clientInfo.timestamp
    );

    // Registrar en audit log
    logAudit(req.user.id, 'CONTRACT_PROPOSED', 'contracts', contractId, null, {
      contract_number: contractNumber,
      appointment_id: appointment_id,
      sqm: sqm,
      period_type: period_type,
      period_quantity: period_quantity,
      total_amount: totalAmount,
      ...clientInfo
    }, req);

    // Notificar al propietario
    try {
      const { notifyContractProposed } = require('../utils/notificationsService');
      notifyContractProposed(contractId, req);
    } catch (e) {
      console.log('Error enviando notificacion de propuesta:', e.message);
    }

    res.status(201).json({
      contract_id: contractId,
      contract_number: contractNumber,
      status: 'guest_proposed',
      message: 'Propuesta de contrato enviada. Esperando aprobacion del propietario.',
      summary: {
        space_title: appointment.space_title,
        sqm: sqm,
        period_type: period_type,
        period_quantity: period_quantity,
        start_date: start_date,
        end_date: endDate,
        total_amount: totalAmount
      }
    });
  } catch (error) {
    console.error('Error al proponer contrato:', error);
    res.status(500).json({ error: 'Error al crear propuesta de contrato' });
  }
});

// Endpoint para que el propietario apruebe un contrato
router.put('/:id/approve', authenticateToken, requireRole('HOST'), (req, res) => {
  try {
    const contract = db.prepare(`
      SELECT * FROM contracts WHERE id = ? AND host_id = ? AND status = 'guest_proposed'
    `).get(req.params.id, req.user.id);

    if (!contract) {
      return res.status(404).json({ error: 'Contrato no encontrado o no esta pendiente de aprobacion' });
    }

    const clientInfo = getClientInfo(req);

    db.prepare(`
      UPDATE contracts SET
        status = 'host_approved',
        host_approved_at = ?,
        payment_requested_at = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(clientInfo.timestamp, clientInfo.timestamp, req.params.id);

    logAudit(req.user.id, 'CONTRACT_APPROVED', 'contracts', req.params.id, null, {
      contract_number: contract.contract_number,
      ...clientInfo
    }, req);

    // Notificar al cliente que puede pagar
    try {
      const { notifyContractApproved } = require('../utils/notificationsService');
      notifyContractApproved(req.params.id, req);
    } catch (e) {
      console.log('Error enviando notificacion de aprobacion:', e.message);
    }

    res.json({
      success: true,
      message: 'Contrato aprobado. El cliente ha sido notificado para proceder con el pago.',
      contract_id: req.params.id,
      status: 'host_approved'
    });
  } catch (error) {
    console.error('Error al aprobar contrato:', error);
    res.status(500).json({ error: 'Error al aprobar contrato' });
  }
});

// Endpoint para que el propietario rechace un contrato
router.put('/:id/reject', authenticateToken, requireRole('HOST'), [
  body('reason').optional().isString()
], (req, res) => {
  try {
    const contract = db.prepare(`
      SELECT * FROM contracts WHERE id = ? AND host_id = ? AND status = 'guest_proposed'
    `).get(req.params.id, req.user.id);

    if (!contract) {
      return res.status(404).json({ error: 'Contrato no encontrado o no esta pendiente de aprobacion' });
    }

    const { reason } = req.body;
    const clientInfo = getClientInfo(req);

    db.prepare(`
      UPDATE contracts SET
        status = 'host_rejected',
        host_rejected_at = ?,
        host_rejection_reason = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(clientInfo.timestamp, reason || null, req.params.id);

    logAudit(req.user.id, 'CONTRACT_REJECTED', 'contracts', req.params.id, null, {
      contract_number: contract.contract_number,
      rejection_reason: reason,
      ...clientInfo
    }, req);

    // Notificar al cliente del rechazo
    try {
      const { notifyContractRejected } = require('../utils/notificationsService');
      notifyContractRejected(req.params.id, reason, req);
    } catch (e) {
      console.log('Error enviando notificacion de rechazo:', e.message);
    }

    res.json({
      success: true,
      message: 'Contrato rechazado. El cliente ha sido notificado.',
      contract_id: req.params.id,
      status: 'host_rejected'
    });
  } catch (error) {
    console.error('Error al rechazar contrato:', error);
    res.status(500).json({ error: 'Error al rechazar contrato' });
  }
});

// Endpoint para obtener propuestas de contrato pendientes (para el propietario)
router.get('/pending-proposals', authenticateToken, requireRole('HOST'), (req, res) => {
  try {
    const proposals = db.prepare(`
      SELECT c.*, 
        u.first_name as guest_first_name, u.last_name as guest_last_name, u.email as guest_email,
        s.title as space_title
      FROM contracts c
      JOIN users u ON c.guest_id = u.id
      JOIN spaces s ON c.space_id = s.id
      WHERE c.host_id = ? AND c.status = 'guest_proposed'
      ORDER BY c.created_at DESC
    `).all(req.user.id);

    res.json(proposals);
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Error al obtener propuestas' });
  }
});

// Endpoint para obtener contratos del cliente con sus estados
router.get('/my-contracts', authenticateToken, (req, res) => {
  try {
    const contracts = db.prepare(`
      SELECT c.*, 
        s.title as space_title,
        h.first_name as host_first_name, h.last_name as host_last_name, h.company_name as host_company
      FROM contracts c
      JOIN spaces s ON c.space_id = s.id
      JOIN users h ON c.host_id = h.id
      WHERE c.guest_id = ?
      ORDER BY c.created_at DESC
    `).all(req.user.id);

    res.json(contracts);
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Error al obtener contratos' });
  }
});

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

    // Validar que existan datos FROZEN en la reservacion
    if (!reservation.frozen_space_data) {
      return res.status(400).json({ error: 'La reservacion no tiene datos contractuales congelados' });
    }

    // =====================================================================
    // FROZEN DATA ONLY - NO se lee de tabla spaces
    // Solo se obtienen datos de usuarios (partes del contrato) que son necesarios
    // Los datos del espacio vienen EXCLUSIVAMENTE del snapshot FROZEN
    // =====================================================================
    const guest = db.prepare('SELECT * FROM users WHERE id = ?').get(reservation.guest_id);
    const host = db.prepare('SELECT * FROM users WHERE id = ?').get(reservation.host_id);

    const clientInfo = getClientInfo(req);

    const guestIdentity = validateLegalIdentity(guest);
    if (!guestIdentity.valid) {
      logAudit(req.user.id, 'LEGAL_IDENTITY_INCOMPLETE', 'users', guest.id, null, {
        person_type: guest.person_type,
        missing: guestIdentity.missing,
        blocked_operation: 'contract',
        ...clientInfo
      }, req);
      return res.status(400).json({ 
        error: `Identificacion legal incompleta para GUEST: falta ${guestIdentity.missing}`,
        user_type: 'GUEST'
      });
    }

    const hostIdentity = validateLegalIdentity(host);
    if (!hostIdentity.valid) {
      logAudit(req.user.id, 'LEGAL_IDENTITY_INCOMPLETE', 'users', host.id, null, {
        person_type: host.person_type,
        missing: hostIdentity.missing,
        blocked_operation: 'contract',
        ...clientInfo
      }, req);
      return res.status(400).json({ 
        error: `Identificacion legal incompleta para HOST: falta ${hostIdentity.missing}`,
        user_type: 'HOST'
      });
    }

    const contractId = generateId();
    const contractNumber = generateContractNumber();
    const startDate = new Date().toISOString().split('T')[0];
    const endDate = calculateEndDate(startDate, reservation.period_type, reservation.period_quantity);

    const hostPayoutAmount = reservation.total_amount - reservation.commission_amount;

    // Parsear datos FROZEN del espacio - NUNCA leer de tabla spaces
    const frozenSpace = JSON.parse(reservation.frozen_space_data);
    const frozenPricing = reservation.frozen_pricing ? JSON.parse(reservation.frozen_pricing) : null;

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
      // FROZEN: Datos del espacio desde snapshot inmutable
      space: frozenSpace,
      // FROZEN: Precios vigentes al momento de confirmacion
      pricing_snapshot: frozenPricing,
      rental: {
        sqm: reservation.sqm_requested,
        period_type: reservation.period_type,
        period_quantity: reservation.period_quantity,
        start_date: startDate,
        end_date: endDate,
        total_amount: reservation.total_amount,
        deposit_amount: reservation.deposit_amount,
        deposit_percentage: reservation.frozen_deposit_percentage,
        commission_amount: reservation.commission_amount,
        commission_percentage: reservation.frozen_commission_percentage,
        price_per_sqm_applied: reservation.frozen_price_per_sqm_applied,
        host_payout: hostPayoutAmount
      },
      video: {
        url: reservation.frozen_video_url,
        duration: reservation.frozen_video_duration
      },
      legal: getLegalClausesForContract(),
      snapshot_metadata: {
        created_at: reservation.frozen_snapshot_created_at,
        note: 'FROZEN: Todos los datos del espacio y precios reflejan las condiciones al momento de confirmacion'
      }
    });

    // Generar hash criptografico del contrato
    const contractHash = generateContractHash(contractData);

    // =====================================================================
    // FROZEN CONTRACTUAL SNAPSHOT - Copiar datos inmutables desde reservations
    // IMPORTANTE: Estos datos provienen del snapshot creado al pagar anticipo
    // NUNCA se leen de la tabla spaces original
    // =====================================================================
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
    
    // Registrar creacion de contrato con referencia al snapshot original
    logAudit(req.user.id, 'CONTRACT_CREATED', 'contracts', contractId, null, { 
      contract_number: contractNumber,
      frozen_snapshot_created_at: reservation.frozen_snapshot_created_at,
      uses_frozen_data: true,
      ...clientInfo
    }, req);

    notifyContractCreated(contractId, req);

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
], async (req, res) => {
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

    const { otp } = req.body;

    const pendingOtp = db.prepare(`
      SELECT * FROM pending_otps 
      WHERE user_id = ? AND contract_id = ? AND used = 0
      ORDER BY created_at DESC LIMIT 1
    `).get(req.user.id, req.params.id);

    if (!pendingOtp) {
      return res.status(400).json({ error: 'No hay OTP pendiente. Solicite uno nuevo.' });
    }

    if (isOTPExpired(pendingOtp.expires_at)) {
      db.prepare('DELETE FROM pending_otps WHERE id = ?').run(pendingOtp.id);
      return res.status(400).json({ error: 'El OTP ha expirado. Solicite uno nuevo.' });
    }

    const isValidOtp = await verifyOTP(otp, pendingOtp.otp_hash);
    if (!isValidOtp) {
      return res.status(400).json({ error: 'Codigo OTP invalido' });
    }

    db.prepare('UPDATE pending_otps SET used = 1 WHERE id = ?').run(pendingOtp.id);

    const clientInfo = getClientInfo(req);
    const otpHashForRecord = pendingOtp.otp_hash;

    // Generar certificado de firma digital
    const signatureCertificate = generateSignatureCertificate(
      req.params.id, req.user.id, isGuest ? 'GUEST' : 'HOST', 
      contract.contract_hash, clientInfo
    );

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
          guest_sign_certificate = ?,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(clientInfo.timestamp, clientInfo.ip, otpHashForRecord, clientInfo.userAgent, JSON.stringify(signatureCertificate), req.params.id);

      const signDisclaimerGuest = getActiveLegalText('disclaimer_firma');
      logAudit(req.user.id, 'CONTRACT_SIGNED_GUEST', 'contracts', req.params.id, null, { 
        ...clientInfo, 
        certificate_hash: signatureCertificate.certificate_hash,
        disclaimer: signDisclaimerGuest.content, 
        disclaimer_version: signDisclaimerGuest.version 
      }, req);
      notifyContractSigned(req.params.id, 'GUEST', req);
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
          host_sign_certificate = ?,
          status = 'signed',
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(clientInfo.timestamp, clientInfo.ip, otpHashForRecord, clientInfo.userAgent, JSON.stringify(signatureCertificate), req.params.id);

      db.prepare(`
        UPDATE reservations SET status = 'contract_signed', updated_at = CURRENT_TIMESTAMP WHERE id = ?
      `).run(contract.reservation_id);

      db.prepare(`
        UPDATE payments SET escrow_status = 'released', updated_at = CURRENT_TIMESTAMP
        WHERE reservation_id = ? AND escrow_status = 'held'
      `).run(contract.reservation_id);

      const signDisclaimerHost = getActiveLegalText('disclaimer_firma');
      logAudit(req.user.id, 'CONTRACT_SIGNED_HOST', 'contracts', req.params.id, null, { 
        ...clientInfo, 
        certificate_hash: signatureCertificate.certificate_hash,
        disclaimer: signDisclaimerHost.content, 
        disclaimer_version: signDisclaimerHost.version 
      }, req);
      logAudit(req.user.id, 'ESCROW_RELEASED', 'contracts', req.params.id, null, { reservation_id: contract.reservation_id }, req);
      notifyContractSigned(req.params.id, 'HOST', req);
    }

    const updatedContract = db.prepare('SELECT * FROM contracts WHERE id = ?').get(req.params.id);
    const bothSigned = updatedContract.guest_signed && updatedContract.host_signed;

    const finalDisclaimer = getActiveLegalText('disclaimer_firma');
    res.json({
      message: 'Contrato firmado exitosamente',
      fully_signed: bothSigned,
      escrow_released: bothSigned,
      disclaimer: finalDisclaimer.content,
      disclaimer_version: finalDisclaimer.version
    });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Error al firmar contrato' });
  }
});

router.post('/:id/request-otp', authenticateToken, async (req, res) => {
  try {
    const contract = db.prepare('SELECT * FROM contracts WHERE id = ?').get(req.params.id);
    if (!contract) {
      return res.status(404).json({ error: 'Contrato no encontrado' });
    }

    if (contract.guest_id !== req.user.id && contract.host_id !== req.user.id) {
      return res.status(403).json({ error: 'No tiene permiso' });
    }

    db.prepare('DELETE FROM pending_otps WHERE user_id = ? AND contract_id = ?').run(req.user.id, req.params.id);

    const otp = generateOTP();
    const otpHash = await hashOTP(otp);
    const expiresAt = getOTPExpiration();
    const otpId = generateId();

    db.prepare(`
      INSERT INTO pending_otps (id, user_id, contract_id, otp_hash, expires_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(otpId, req.user.id, req.params.id, otpHash, expiresAt);

    logAudit(req.user.id, 'OTP_REQUESTED', 'contracts', req.params.id, null, { otp_id: otpId }, req);

    console.log(`[DEMO ONLY] OTP para contrato ${req.params.id}: ${otp} - En produccion esto se enviaria por email/SMS`);

    const otpDisclaimer = getActiveLegalText('disclaimer_firma');
    res.json({ 
      message: `Codigo OTP generado. Expira en ${OTP_EXPIRATION_MINUTES} minutos. [DEMO: Ver consola del servidor para obtener el codigo - En produccion se enviaria por email/SMS]`,
      expires_in_minutes: OTP_EXPIRATION_MINUTES,
      disclaimer: otpDisclaimer.content,
      disclaimer_version: otpDisclaimer.version
    });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Error al generar OTP' });
  }
});

router.get('/:id', authenticateToken, (req, res) => {
  try {
    // NO se hace JOIN con spaces - se usa frozen_space_data exclusivamente
    const contract = db.prepare(`
      SELECT c.*, 
             ug.first_name as guest_first_name, ug.last_name as guest_last_name, ug.company_name as guest_company,
             uh.first_name as host_first_name, uh.last_name as host_last_name, uh.company_name as host_company
      FROM contracts c
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

    // Extraer space_title desde frozen_space_data (FROZEN, no de tabla spaces)
    let spaceTitle = null;
    if (contract.frozen_space_data) {
      try {
        const frozenSpace = JSON.parse(contract.frozen_space_data);
        spaceTitle = frozenSpace.title || null;
      } catch (e) {
        spaceTitle = null;
      }
    }

    res.json({
      ...contract,
      space_title: spaceTitle
    });
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

    // =====================================================================
    // FROZEN PRICING - NO se lee de tabla spaces
    // Se usa el precio congelado del contrato original
    // =====================================================================
    if (!contract.frozen_pricing) {
      return res.status(400).json({ error: 'El contrato no tiene precios congelados disponibles' });
    }

    let frozenPricing;
    try {
      frozenPricing = JSON.parse(contract.frozen_pricing);
    } catch (e) {
      return res.status(400).json({ error: 'Error al leer precios congelados del contrato' });
    }

    const priceFieldMap = {
      'dia': 'price_per_sqm_day',
      'semana': 'price_per_sqm_week',
      'mes': 'price_per_sqm_month',
      'trimestre': 'price_per_sqm_quarter',
      'semestre': 'price_per_sqm_semester',
      'ano': 'price_per_sqm_year'
    };
    const priceField = priceFieldMap[period_type];
    const pricePerSqm = frozenPricing[priceField];

    if (!pricePerSqm) {
      return res.status(400).json({ error: `No hay precio congelado para el periodo ${period_type}` });
    }

    const extensionAmount = pricePerSqm * contract.sqm * period_quantity;
    
    const commissionPercentage = contract.frozen_commission_percentage || 10;
    const commissionAmount = (extensionAmount * commissionPercentage) / 100;
    const hostPayoutAmount = extensionAmount - commissionAmount;

    const lastExtension = db.prepare(`
      SELECT new_end_date FROM contract_extensions 
      WHERE contract_id = ? AND status = 'active' 
      ORDER BY created_at DESC LIMIT 1
    `).get(contract.id);
    
    const currentEndDate = lastExtension ? lastExtension.new_end_date : contract.end_date;
    const newEndDate = calculateEndDate(currentEndDate, period_type, period_quantity);

    const extensionId = generateId();
    const paymentId = generateId();
    const invoiceId = generateId();
    const clientInfo = getClientInfo(req);

    const antiBypassText = getActiveLegalText('anti_bypass_guest');
    const disclaimerText = getActiveLegalText('disclaimer_contrato');

    db.prepare(`
      INSERT INTO payments (
        id, reservation_id, user_id, amount, payment_type, payment_method,
        status, ip_address, user_agent
      ) VALUES (?, ?, ?, ?, 'extension', ?, 'completed', ?, ?)
    `).run(paymentId, contract.reservation_id, req.user.id, extensionAmount, payment_method, clientInfo.ip, clientInfo.userAgent);

    db.prepare(`
      INSERT INTO contract_extensions (
        id, contract_id, payment_id, guest_id, host_id,
        original_end_date, new_end_date,
        extension_period_type, extension_period_quantity,
        extension_amount, commission_amount, host_payout_amount,
        sqm, price_per_sqm_applied,
        anti_bypass_reaffirmed, frozen_anti_bypass_text, frozen_anti_bypass_version, frozen_anti_bypass_legal_text_id,
        frozen_disclaimer_text, frozen_disclaimer_version,
        ip_address, user_agent, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?, 'active')
    `).run(
      extensionId, contract.id, paymentId, contract.guest_id, contract.host_id,
      currentEndDate, newEndDate,
      period_type, period_quantity,
      extensionAmount, commissionAmount, hostPayoutAmount,
      contract.sqm, pricePerSqm,
      antiBypassText.content, antiBypassText.version, antiBypassText.id,
      disclaimerText.content, disclaimerText.version,
      clientInfo.ip, clientInfo.userAgent
    );

    const guest = db.prepare('SELECT * FROM users WHERE id = ?').get(contract.guest_id);
    const guestName = guest.person_type === 'juridica' ? guest.company_name : `${guest.first_name} ${guest.last_name}`;
    const invoiceDisclaimer = getActiveLegalText('disclaimer_factura');
    const invoiceNumber = generateInvoiceNumber();

    db.prepare(`
      INSERT INTO invoices (
        id, payment_id, contract_id, contract_extension_id, guest_id, host_id,
        invoice_number, invoice_type, recipient_type, recipient_id,
        amount, total_amount, commission_amount, host_payout_amount,
        concept, nit, company_name,
        frozen_disclaimer_text, frozen_disclaimer_version, frozen_disclaimer_legal_text_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 'extension', 'guest', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      invoiceId, paymentId, contract.id, extensionId, contract.guest_id, contract.host_id,
      invoiceNumber, contract.guest_id,
      extensionAmount, extensionAmount, commissionAmount, hostPayoutAmount,
      `Extension de contrato ${contract.contract_number} - ${period_quantity} ${period_type}(s)`,
      guest.nit || guest.ci, guestName,
      invoiceDisclaimer.content, invoiceDisclaimer.version, invoiceDisclaimer.id
    );

    logAudit(req.user.id, 'CONTRACT_EXTENSION_CREATED', 'contract_extensions', extensionId, null, {
      contract_id: contract.id,
      contract_number: contract.contract_number,
      original_end_date: currentEndDate,
      new_end_date: newEndDate,
      amount: extensionAmount,
      anti_bypass_version: antiBypassText.version,
      ...clientInfo
    }, req);

    logAudit(req.user.id, 'INVOICE_GENERATED', 'invoices', invoiceId, null, {
      invoice_number: invoiceNumber,
      invoice_type: 'extension',
      contract_extension_id: extensionId,
      amount: extensionAmount,
      ...clientInfo
    }, req);

    res.json({
      extension_id: extensionId,
      payment_id: paymentId,
      invoice_id: invoiceId,
      invoice_number: invoiceNumber,
      new_end_date: newEndDate,
      amount: extensionAmount,
      commission: commissionAmount,
      host_payout: hostPayoutAmount,
      message: 'Extension creada exitosamente. El contrato original permanece inmutable.',
      note: 'La nueva fecha de finalizacion se registra en el anexo, no en el contrato original.'
    });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Error al extender contrato' });
  }
});

router.get('/:id/pdf', authenticateToken, (req, res) => {
  try {
    const contract = db.prepare(`
      SELECT c.*, 
             ug.first_name as guest_first_name, ug.last_name as guest_last_name, 
             ug.company_name as guest_company, ug.ci as guest_ci, ug.nit as guest_nit,
             ug.address as guest_address, ug.city as guest_city, ug.department as guest_department,
             ug.phone as guest_phone, ug.person_type as guest_person_type,
             uh.first_name as host_first_name, uh.last_name as host_last_name,
             uh.company_name as host_company, uh.ci as host_ci, uh.nit as host_nit,
             uh.address as host_address, uh.city as host_city, uh.department as host_department,
             uh.phone as host_phone, uh.person_type as host_person_type, uh.logo_url as host_logo
      FROM contracts c
      JOIN users ug ON c.guest_id = ug.id
      JOIN users uh ON c.host_id = uh.id
      WHERE c.id = ?
    `).get(req.params.id);

    if (!contract) {
      return res.status(404).json({ error: 'Contrato no encontrado' });
    }

    if (contract.guest_id !== req.user.id && contract.host_id !== req.user.id && req.user.role !== 'ADMIN') {
      return res.status(403).json({ error: 'No tiene permiso para descargar este contrato' });
    }

    let frozenSpace = {};
    if (contract.frozen_space_data) {
      try {
        frozenSpace = JSON.parse(contract.frozen_space_data);
      } catch (e) {}
    }

    let frozenPricing = {};
    if (contract.frozen_pricing) {
      try {
        frozenPricing = JSON.parse(contract.frozen_pricing);
      } catch (e) {}
    }

    const pdfDir = path.join(process.cwd(), 'uploads', 'contracts');
    if (!fs.existsSync(pdfDir)) {
      fs.mkdirSync(pdfDir, { recursive: true });
    }

    const pdfFilename = `contrato_${contract.contract_number}.pdf`;
    const pdfPath = path.join(pdfDir, pdfFilename);

    const doc = new PDFDocument({ size: 'LETTER', margin: 50 });
    const writeStream = fs.createWriteStream(pdfPath);
    doc.pipe(writeStream);

    if (contract.host_logo && fs.existsSync(contract.host_logo)) {
      try {
        doc.image(contract.host_logo, 50, 45, { width: 80 });
      } catch (e) {
        console.log('Error cargando logo:', e.message);
      }
    }

    doc.fontSize(18).text('CONTRATO DE ALQUILER TEMPORAL', 150, 50, { align: 'center', width: 350 });
    doc.fontSize(10).text('Plataforma: Almacenes, Galpones, Espacios Libres', 150, 75, { align: 'center', width: 350 });
    doc.moveDown(4);
    
    doc.y = 120;
    doc.fontSize(11).text(`Contrato No: ${contract.contract_number}`, { align: 'center' });
    doc.text(`Fecha de emision: ${new Date(contract.created_at).toLocaleDateString('es-BO')}`, { align: 'center' });
    doc.moveDown(2);

    doc.fontSize(14).fillColor('#1a56db').text('PRIMERA: PARTES CONTRATANTES', { underline: true });
    doc.fillColor('black');
    doc.moveDown(0.5);
    doc.fontSize(10);
    
    const guestName = contract.guest_person_type === 'juridica' ? contract.guest_company : `${contract.guest_first_name} ${contract.guest_last_name}`;
    doc.text('EL ARRENDATARIO:', { continued: true, underline: true });
    doc.text(` ${guestName}`, { underline: false });
    doc.text(`  Documento de Identidad: ${contract.guest_person_type === 'juridica' ? 'NIT' : 'CI'} ${contract.guest_ci || contract.guest_nit || 'N/A'}`);
    doc.text(`  Domicilio: ${contract.guest_address || ''}, ${contract.guest_city || ''}, ${contract.guest_department || 'Bolivia'}`);
    doc.text(`  Telefono: ${contract.guest_phone || 'N/A'}`);
    doc.moveDown(0.5);

    const hostName = contract.host_person_type === 'juridica' ? contract.host_company : `${contract.host_first_name} ${contract.host_last_name}`;
    doc.text('EL ARRENDADOR:', { continued: true, underline: true });
    doc.text(` ${hostName}`, { underline: false });
    doc.text(`  Documento de Identidad: ${contract.host_person_type === 'juridica' ? 'NIT' : 'CI'} ${contract.host_ci || contract.host_nit || 'N/A'}`);
    doc.text(`  Domicilio: ${contract.host_address || ''}, ${contract.host_city || ''}, ${contract.host_department || 'Bolivia'}`);
    doc.text(`  Telefono: ${contract.host_phone || 'N/A'}`);
    doc.moveDown(1.5);

    doc.fontSize(14).fillColor('#1a56db').text('SEGUNDA: OBJETO DEL CONTRATO', { underline: true });
    doc.fillColor('black');
    doc.moveDown(0.5);
    doc.fontSize(10);
    doc.text(`El ARRENDADOR cede en alquiler temporal al ARRENDATARIO el siguiente espacio:`);
    doc.moveDown(0.3);
    doc.text(`  Denominacion: ${frozenSpace.title || 'N/A'}`);
    doc.text(`  Tipo de espacio: ${frozenSpace.space_type || 'N/A'}`);
    doc.text(`  Ubicacion: ${frozenSpace.address || 'N/A'}, ${frozenSpace.city || ''}, ${frozenSpace.department || 'Bolivia'}`);
    doc.text(`  Descripcion: ${(contract.frozen_description || frozenSpace.description || 'N/A').substring(0, 200)}`);
    doc.moveDown(1.5);

    doc.fontSize(14).fillColor('#1a56db').text('TERCERA: CONDICIONES ECONOMICAS', { underline: true });
    doc.fillColor('black');
    doc.moveDown(0.5);
    doc.fontSize(10);
    doc.text(`Las partes acuerdan las siguientes condiciones economicas:`);
    doc.moveDown(0.3);
    doc.text(`  Superficie alquilada: ${contract.sqm} metros cuadrados (m2)`);
    doc.text(`  Periodo de alquiler: ${contract.period_quantity} ${contract.period_type}(s)`);
    doc.text(`  Fecha de inicio: ${new Date(contract.start_date).toLocaleDateString('es-BO')}`);
    doc.text(`  Fecha de finalizacion: ${new Date(contract.end_date).toLocaleDateString('es-BO')}`);
    doc.text(`  Precio por m2 aplicado: Bs. ${Number(contract.frozen_price_per_sqm_applied || 0).toFixed(2)}`);
    doc.moveDown(0.3);
    doc.text(`  MONTO TOTAL DEL ALQUILER: Bs. ${Number(contract.total_amount).toFixed(2)}`, { bold: true });
    doc.text(`  Pago recibido: Bs. ${Number(contract.total_amount).toFixed(2)} (100%)`);
    doc.moveDown(1.5);

    if (contract.frozen_video_url) {
      doc.fontSize(14).fillColor('#1a56db').text('CUARTA: DOCUMENTACION VISUAL', { underline: true });
      doc.fillColor('black');
      doc.moveDown(0.5);
      doc.fontSize(10);
      doc.text(`Se adjunta referencia visual del espacio:`);
      doc.text(`  Video de referencia: ${contract.frozen_video_url}`);
      doc.text(`  Duracion del video: ${contract.frozen_video_duration || 'N/A'} segundos`);
      doc.moveDown(1.5);
    }

    doc.addPage();
    doc.fontSize(14).fillColor('#1a56db').text('QUINTA: CLAUSULAS LEGALES Y CONDICIONES GENERALES', { underline: true });
    doc.fillColor('black');
    doc.moveDown(0.5);
    doc.fontSize(9);
    
    const legalClauses = getLegalClausesForContract();
    
    doc.text(`5.1 LIMITACION DE RESPONSABILIDAD:`, { underline: true });
    doc.text(legalClauses.liability_limitation, { align: 'justify' });
    doc.moveDown(0.5);
    doc.text(`5.2 LEY APLICABLE Y JURISDICCION:`, { underline: true });
    doc.text(legalClauses.applicable_law, { align: 'justify' });
    doc.moveDown(0.5);
    doc.text(`5.3 INTERMEDIACION TECNOLOGICA:`, { underline: true });
    doc.text(legalClauses.intermediary, { align: 'justify' });
    doc.moveDown(0.5);
    doc.text(`5.4 CLAUSULA DE EXCLUSIVIDAD (ARRENDATARIO):`, { underline: true });
    doc.text(legalClauses.anti_bypass_guest, { align: 'justify' });
    doc.moveDown(0.5);
    doc.text(`5.5 CLAUSULA DE EXCLUSIVIDAD (ARRENDADOR):`, { underline: true });
    doc.text(legalClauses.anti_bypass_host, { align: 'justify' });
    doc.moveDown(2);

    doc.fontSize(14).fillColor('#1a56db').text('SEXTA: FIRMAS ELECTRONICAS', { underline: true });
    doc.fillColor('black');
    doc.moveDown(0.5);
    doc.fontSize(10);
    doc.text('Las partes manifiestan su conformidad con el presente contrato mediante firma electronica:');
    doc.moveDown(0.5);

    doc.rect(50, doc.y, 230, 80).stroke();
    doc.text('EL ARRENDATARIO:', 60, doc.y + 10);
    if (contract.guest_signed) {
      doc.text(`Firmado digitalmente`, 60, doc.y + 5);
      doc.text(`Fecha: ${new Date(contract.guest_signed_at).toLocaleString('es-BO')}`, 60, doc.y + 5);
      doc.text(`IP: ${contract.guest_sign_ip}`, 60, doc.y + 5);
    } else {
      doc.text(`Estado: PENDIENTE DE FIRMA`, 60, doc.y + 20);
    }

    const rightBoxY = doc.y - (contract.guest_signed ? 55 : 40);
    doc.rect(300, rightBoxY, 230, 80).stroke();
    doc.text('EL ARRENDADOR:', 310, rightBoxY + 10);
    if (contract.host_signed) {
      doc.text(`Firmado digitalmente`, 310, rightBoxY + 25);
      doc.text(`Fecha: ${new Date(contract.host_signed_at).toLocaleString('es-BO')}`, 310, rightBoxY + 40);
      doc.text(`IP: ${contract.host_sign_ip}`, 310, rightBoxY + 55);
    } else {
      doc.text(`Estado: PENDIENTE DE FIRMA`, 310, rightBoxY + 30);
    }

    doc.y = rightBoxY + 100;
    doc.moveDown(2);

    const signatureDisclaimer = getActiveLegalText('disclaimer_firma');
    doc.fontSize(8).text(`${signatureDisclaimer.content}`, { align: 'center' });
    doc.moveDown();
    doc.text(`Documento generado electronicamente el ${new Date().toLocaleString('es-BO')}`, { align: 'center' });
    doc.text(`Identificador de contrato: ${contract.id}`, { align: 'center' });

    doc.end();

    writeStream.on('finish', () => {
      const pdfUrl = `/uploads/contracts/${pdfFilename}`;
      
      db.prepare(`
        UPDATE contracts SET pdf_url = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?
      `).run(pdfUrl, contract.id);

      const clientInfo = getClientInfo(req);
      logAudit(req.user.id, 'CONTRACT_PDF_GENERATED', 'contracts', contract.id, null, {
        pdf_url: pdfUrl,
        contract_number: contract.contract_number,
        ...clientInfo
      }, req);

      res.download(pdfPath, pdfFilename, (err) => {
        if (err) {
          console.error('Error enviando PDF:', err);
        }
      });
    });

    writeStream.on('error', (err) => {
      console.error('Error escribiendo PDF:', err);
      res.status(500).json({ error: 'Error al generar PDF' });
    });

  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Error al generar PDF del contrato' });
  }
});

router.get('/extensions', authenticateToken, (req, res) => {
  try {
    let query = `
      SELECT ce.*, c.contract_number 
      FROM contract_extensions ce
      JOIN contracts c ON ce.contract_id = c.id
      WHERE 1=1
    `;
    const params = [];

    if (req.user.role === 'GUEST') {
      query += ' AND ce.guest_id = ?';
      params.push(req.user.id);
    } else if (req.user.role === 'HOST') {
      query += ' AND ce.host_id = ?';
      params.push(req.user.id);
    }

    query += ' ORDER BY ce.created_at DESC';
    const extensions = db.prepare(query).all(...params);

    res.json({ extensions, total: extensions.length });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Error al obtener extensiones' });
  }
});

router.get('/extensions/:id', authenticateToken, (req, res) => {
  try {
    const extension = db.prepare(`
      SELECT ce.*, c.contract_number, c.frozen_space_data
      FROM contract_extensions ce
      JOIN contracts c ON ce.contract_id = c.id
      WHERE ce.id = ?
    `).get(req.params.id);

    if (!extension) {
      return res.status(404).json({ error: 'Extension no encontrada' });
    }

    if (extension.guest_id !== req.user.id && extension.host_id !== req.user.id && req.user.role !== 'ADMIN') {
      return res.status(403).json({ error: 'No tiene permiso para ver esta extension' });
    }

    res.json(extension);
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Error al obtener extension' });
  }
});

router.get('/extensions/:id/pdf', authenticateToken, (req, res) => {
  try {
    const extension = db.prepare(`
      SELECT ce.*, 
             c.contract_number, c.frozen_space_data, c.sqm as contract_sqm,
             ug.first_name as guest_first_name, ug.last_name as guest_last_name,
             ug.company_name as guest_company, ug.ci as guest_ci, ug.nit as guest_nit,
             ug.address as guest_address, ug.city as guest_city, ug.person_type as guest_person_type,
             uh.first_name as host_first_name, uh.last_name as host_last_name,
             uh.company_name as host_company, uh.ci as host_ci, uh.nit as host_nit,
             uh.address as host_address, uh.city as host_city, uh.person_type as host_person_type
      FROM contract_extensions ce
      JOIN contracts c ON ce.contract_id = c.id
      JOIN users ug ON ce.guest_id = ug.id
      JOIN users uh ON ce.host_id = uh.id
      WHERE ce.id = ?
    `).get(req.params.id);

    if (!extension) {
      return res.status(404).json({ error: 'Extension no encontrada' });
    }

    if (extension.guest_id !== req.user.id && extension.host_id !== req.user.id && req.user.role !== 'ADMIN') {
      return res.status(403).json({ error: 'No tiene permiso para descargar este anexo' });
    }

    let frozenSpace = {};
    if (extension.frozen_space_data) {
      try {
        frozenSpace = JSON.parse(extension.frozen_space_data);
      } catch (e) {}
    }

    const pdfDir = path.join(process.cwd(), 'uploads', 'extensions');
    if (!fs.existsSync(pdfDir)) {
      fs.mkdirSync(pdfDir, { recursive: true });
    }

    const pdfFilename = `anexo_${extension.contract_number}_ext_${extension.id.substring(0, 8)}.pdf`;
    const pdfPath = path.join(pdfDir, pdfFilename);

    const doc = new PDFDocument({ size: 'LETTER', margin: 50 });
    const writeStream = fs.createWriteStream(pdfPath);
    doc.pipe(writeStream);

    doc.fontSize(18).text('ANEXO DE EXTENSION CONTRACTUAL', { align: 'center' });
    doc.fontSize(10).text('Almacenes, Galpones, Espacios Libres', { align: 'center' });
    doc.moveDown();
    doc.fontSize(12).text(`Contrato Original: ${extension.contract_number}`, { align: 'center' });
    doc.text(`Fecha de Extension: ${extension.created_at}`, { align: 'center' });
    doc.moveDown(2);

    doc.fontSize(14).text('PARTES DEL CONTRATO', { underline: true });
    doc.moveDown(0.5);
    doc.fontSize(11);

    const guestName = extension.guest_person_type === 'juridica' ? extension.guest_company : `${extension.guest_first_name} ${extension.guest_last_name}`;
    doc.text(`ARRENDATARIO (GUEST): ${guestName}`);
    doc.text(`  CI/NIT: ${extension.guest_ci || extension.guest_nit || 'N/A'}`);
    doc.moveDown(0.5);

    const hostName = extension.host_person_type === 'juridica' ? extension.host_company : `${extension.host_first_name} ${extension.host_last_name}`;
    doc.text(`ARRENDADOR (HOST): ${hostName}`);
    doc.text(`  CI/NIT: ${extension.host_ci || extension.host_nit || 'N/A'}`);
    doc.moveDown(1.5);

    doc.fontSize(14).text('ESPACIO OBJETO DEL CONTRATO', { underline: true });
    doc.moveDown(0.5);
    doc.fontSize(11);
    doc.text(`Titulo: ${frozenSpace.title || 'N/A'}`);
    doc.text(`Ubicacion: ${frozenSpace.address || 'N/A'}, ${frozenSpace.city || ''}, ${frozenSpace.department || ''}`);
    doc.text(`Metros cuadrados: ${extension.sqm} m2`);
    doc.moveDown(1.5);

    doc.fontSize(14).text('DETALLES DE LA EXTENSION', { underline: true });
    doc.moveDown(0.5);
    doc.fontSize(11);
    doc.text(`Fecha fin anterior: ${extension.original_end_date}`);
    doc.text(`Nueva fecha fin: ${extension.new_end_date}`);
    doc.text(`Periodo extendido: ${extension.extension_period_quantity} ${extension.extension_period_type}(s)`);
    doc.text(`Precio por m2 aplicado: Bs. ${extension.price_per_sqm_applied.toFixed(2)}`);
    doc.moveDown(0.5);
    doc.text(`Monto de extension: Bs. ${extension.extension_amount.toFixed(2)}`);
    doc.text(`Comision plataforma: Bs. ${extension.commission_amount.toFixed(2)}`);
    doc.text(`Pago al HOST: Bs. ${extension.host_payout_amount.toFixed(2)}`);
    doc.moveDown(1.5);

    doc.fontSize(14).text('CLAUSULA ANTI-BYPASS REAFIRMADA', { underline: true });
    doc.moveDown(0.5);
    doc.fontSize(9);
    doc.text(extension.frozen_anti_bypass_text || 'Clausula anti-bypass vigente al momento de la extension.');
    doc.text(`(Version: ${extension.frozen_anti_bypass_version || 'N/A'})`, { align: 'right' });
    doc.moveDown(1.5);

    doc.fontSize(14).text('DISCLAIMER LEGAL', { underline: true });
    doc.moveDown(0.5);
    doc.fontSize(9);
    doc.text(extension.frozen_disclaimer_text || 'Disclaimer vigente al momento de la extension.');
    doc.text(`(Version: ${extension.frozen_disclaimer_version || 'N/A'})`, { align: 'right' });
    doc.moveDown(1.5);

    doc.fontSize(10).text('NOTA: Este anexo NO modifica el contrato original. El contrato original permanece inmutable.', { align: 'center' });
    doc.moveDown();
    doc.fontSize(8).text(`Generado: ${new Date().toISOString()}`, { align: 'center' });
    doc.text(`IP: ${extension.ip_address || 'N/A'}`, { align: 'center' });

    doc.end();

    writeStream.on('finish', () => {
      const pdfUrl = `/uploads/extensions/${pdfFilename}`;

      db.prepare(`
        UPDATE contract_extensions SET pdf_url = ? WHERE id = ?
      `).run(pdfUrl, extension.id);

      const clientInfo = getClientInfo(req);
      logAudit(req.user.id, 'CONTRACT_EXTENSION_PDF_GENERATED', 'contract_extensions', extension.id, null, {
        pdf_url: pdfUrl,
        contract_number: extension.contract_number,
        ...clientInfo
      }, req);

      res.download(pdfPath, pdfFilename, (err) => {
        if (err) {
          console.error('Error enviando PDF:', err);
        }
      });
    });

    writeStream.on('error', (err) => {
      console.error('Error escribiendo PDF:', err);
      res.status(500).json({ error: 'Error al generar PDF' });
    });

  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Error al generar PDF del anexo' });
  }
});

module.exports = router;
