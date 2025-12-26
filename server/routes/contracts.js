const express = require('express');
const { body, validationResult } = require('express-validator');
const path = require('path');
const fs = require('fs');
const PDFDocument = require('pdfkit');
const { db } = require('../config/database');
const { authenticateToken, requireRole } = require('../middleware/auth');
const { logAudit } = require('../middleware/audit');
const { generateId, generateContractNumber, generateInvoiceNumber, generateOTP, hashOTP, verifyOTP, getOTPExpiration, isOTPExpired, calculateEndDate, getClientInfo, OTP_EXPIRATION_MINUTES } = require('../utils/helpers');
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

    // =====================================================================
    // FROZEN CONTRACTUAL SNAPSHOT - Copiar datos inmutables desde reservations
    // IMPORTANTE: Estos datos provienen del snapshot creado al pagar anticipo
    // NUNCA se leen de la tabla spaces original
    // =====================================================================
    db.prepare(`
      INSERT INTO contracts (
        id, reservation_id, space_id, guest_id, host_id, contract_number,
        contract_data,
        frozen_space_data, frozen_video_url, frozen_video_duration, frozen_description,
        frozen_pricing, frozen_deposit_percentage, frozen_commission_percentage,
        frozen_price_per_sqm_applied, frozen_snapshot_created_at,
        sqm, period_type, period_quantity, start_date, end_date,
        total_amount, deposit_amount, commission_amount, host_payout_amount, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')
    `).run(
      contractId, reservation.id, reservation.space_id, reservation.guest_id, reservation.host_id,
      contractNumber, contractData,
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
      `).run(clientInfo.timestamp, clientInfo.ip, otpHashForRecord, clientInfo.userAgent, req.params.id);

      const signDisclaimerGuest = getActiveLegalText('disclaimer_firma');
      logAudit(req.user.id, 'CONTRACT_SIGNED_GUEST_MOCK', 'contracts', req.params.id, null, { ...clientInfo, disclaimer: signDisclaimerGuest.content, disclaimer_version: signDisclaimerGuest.version }, req);
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
          status = 'signed',
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(clientInfo.timestamp, clientInfo.ip, otpHashForRecord, clientInfo.userAgent, req.params.id);

      db.prepare(`
        UPDATE reservations SET status = 'contract_signed', updated_at = CURRENT_TIMESTAMP WHERE id = ?
      `).run(contract.reservation_id);

      db.prepare(`
        UPDATE payments SET escrow_status = 'released', updated_at = CURRENT_TIMESTAMP
        WHERE reservation_id = ? AND escrow_status = 'held'
      `).run(contract.reservation_id);

      const signDisclaimerHost = getActiveLegalText('disclaimer_firma');
      logAudit(req.user.id, 'CONTRACT_SIGNED_HOST_MOCK', 'contracts', req.params.id, null, { ...clientInfo, disclaimer: signDisclaimerHost.content, disclaimer_version: signDisclaimerHost.version }, req);
      logAudit(req.user.id, 'ESCROW_RELEASED_MOCK', 'contracts', req.params.id, null, { reservation_id: contract.reservation_id, disclaimer: 'MOCK - Sin transferencia real de fondos' }, req);
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
             ug.address as guest_address, ug.city as guest_city, ug.person_type as guest_person_type,
             uh.first_name as host_first_name, uh.last_name as host_last_name,
             uh.company_name as host_company, uh.ci as host_ci, uh.nit as host_nit,
             uh.address as host_address, uh.city as host_city, uh.person_type as host_person_type
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

    doc.fontSize(18).text('CONTRATO DE ALQUILER TEMPORAL', { align: 'center' });
    doc.fontSize(10).text('Almacenes, Galpones, Espacios Libres', { align: 'center' });
    doc.moveDown();
    doc.fontSize(12).text(`Contrato No: ${contract.contract_number}`, { align: 'center' });
    doc.text(`Fecha de creacion: ${contract.created_at}`, { align: 'center' });
    doc.moveDown(2);

    doc.fontSize(14).text('PARTES DEL CONTRATO', { underline: true });
    doc.moveDown(0.5);
    doc.fontSize(11);
    
    const guestName = contract.guest_person_type === 'juridica' ? contract.guest_company : `${contract.guest_first_name} ${contract.guest_last_name}`;
    doc.text(`ARRENDATARIO (GUEST): ${guestName}`);
    doc.text(`  CI/NIT: ${contract.guest_ci || contract.guest_nit || 'N/A'}`);
    doc.text(`  Direccion: ${contract.guest_address || 'N/A'}, ${contract.guest_city || ''}`);
    doc.moveDown(0.5);

    const hostName = contract.host_person_type === 'juridica' ? contract.host_company : `${contract.host_first_name} ${contract.host_last_name}`;
    doc.text(`ARRENDADOR (HOST): ${hostName}`);
    doc.text(`  CI/NIT: ${contract.host_ci || contract.host_nit || 'N/A'}`);
    doc.text(`  Direccion: ${contract.host_address || 'N/A'}, ${contract.host_city || ''}`);
    doc.moveDown(2);

    doc.fontSize(14).text('OBJETO DEL CONTRATO', { underline: true });
    doc.moveDown(0.5);
    doc.fontSize(11);
    doc.text(`Espacio: ${frozenSpace.title || 'N/A'}`);
    doc.text(`Tipo: ${frozenSpace.space_type || 'N/A'}`);
    doc.text(`Direccion: ${frozenSpace.address || 'N/A'}, ${frozenSpace.city || ''}`);
    doc.text(`Descripcion: ${contract.frozen_description || frozenSpace.description || 'N/A'}`);
    doc.moveDown(2);

    doc.fontSize(14).text('CONDICIONES DEL ALQUILER', { underline: true });
    doc.moveDown(0.5);
    doc.fontSize(11);
    doc.text(`Superficie: ${contract.sqm} m2`);
    doc.text(`Periodo: ${contract.period_quantity} ${contract.period_type}(s)`);
    doc.text(`Fecha de inicio: ${contract.start_date}`);
    doc.text(`Fecha de fin: ${contract.end_date}`);
    doc.text(`Precio por m2 aplicado: Bs. ${contract.frozen_price_per_sqm_applied || 'N/A'}`);
    doc.text(`Monto total: Bs. ${contract.total_amount}`);
    doc.text(`Anticipo pagado: Bs. ${contract.deposit_amount} (${contract.frozen_deposit_percentage || 10}%)`);
    doc.text(`Comision plataforma: Bs. ${contract.commission_amount} (${contract.frozen_commission_percentage || 10}%)`);
    doc.text(`Pago neto al HOST: Bs. ${contract.host_payout_amount}`);
    doc.moveDown(2);

    if (contract.frozen_video_url) {
      doc.fontSize(14).text('VIDEO DE REFERENCIA', { underline: true });
      doc.moveDown(0.5);
      doc.fontSize(11);
      doc.text(`URL: ${contract.frozen_video_url}`);
      doc.text(`Duracion validada: ${contract.frozen_video_duration || 'N/A'} segundos`);
      doc.moveDown(2);
    }

    doc.addPage();
    doc.fontSize(14).text('CLAUSULAS LEGALES', { underline: true });
    doc.moveDown(0.5);
    doc.fontSize(9);
    
    const legalClauses = getLegalClausesForContract();
    
    doc.text(`LIMITACION DE RESPONSABILIDAD (v${legalClauses.liability_limitation_version}):`, { continued: false });
    doc.text(legalClauses.liability_limitation, { align: 'justify' });
    doc.moveDown();
    doc.text(`LEY APLICABLE (v${legalClauses.applicable_law_version}):`, { continued: false });
    doc.text(legalClauses.applicable_law, { align: 'justify' });
    doc.moveDown();
    doc.text(`INTERMEDIACION TECNOLOGICA (v${legalClauses.intermediary_version}):`, { continued: false });
    doc.text(legalClauses.intermediary, { align: 'justify' });
    doc.moveDown();
    doc.text(`CLAUSULA ANTI-BYPASS GUEST (v${legalClauses.anti_bypass_guest_version}):`, { continued: false });
    doc.text(legalClauses.anti_bypass_guest, { align: 'justify' });
    doc.moveDown();
    doc.text(`CLAUSULA ANTI-BYPASS HOST (v${legalClauses.anti_bypass_host_version}):`, { continued: false });
    doc.text(legalClauses.anti_bypass_host, { align: 'justify' });
    doc.moveDown(2);

    doc.fontSize(14).text('FIRMAS', { underline: true });
    doc.moveDown();
    doc.fontSize(11);
    
    if (contract.guest_signed) {
      doc.text(`GUEST firmado: SI`);
      doc.text(`  Fecha: ${contract.guest_signed_at}`);
      doc.text(`  IP: ${contract.guest_sign_ip}`);
    } else {
      doc.text(`GUEST firmado: PENDIENTE`);
    }
    doc.moveDown();
    
    if (contract.host_signed) {
      doc.text(`HOST firmado: SI`);
      doc.text(`  Fecha: ${contract.host_signed_at}`);
      doc.text(`  IP: ${contract.host_sign_ip}`);
    } else {
      doc.text(`HOST firmado: PENDIENTE`);
    }
    doc.moveDown(2);

    const signatureDisclaimer = getActiveLegalText('disclaimer_firma');
    doc.fontSize(8).text(`${signatureDisclaimer.content} (v${signatureDisclaimer.version})`, { align: 'center' });
    doc.moveDown();
    doc.text(`Snapshot congelado: ${contract.frozen_snapshot_created_at || 'N/A'}`, { align: 'center' });

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
