const express = require('express');
const { body, validationResult } = require('express-validator');
const path = require('path');
const fs = require('fs');
const PDFDocument = require('pdfkit');
const { db } = require('../config/database');
const { authenticateToken, requireRole } = require('../middleware/auth');
const { logAudit } = require('../middleware/audit');
const { generateId, generateContractNumber, generateOTP, hashOTP, verifyOTP, getOTPExpiration, isOTPExpired, calculateEndDate, getClientInfo, OTP_EXPIRATION_MINUTES } = require('../utils/helpers');

const SIGNATURE_DISCLAIMER = '[MOCK/DEMO - SIN VALIDEZ LEGAL] Esta firma es una simulacion para propositos de demostración. NO tiene validez legal ni cumple con la legislacion boliviana de firma electronica.';

function validateLegalIdentity(user) {
  if (user.person_type === 'natural') {
    return { valid: !!user.ci, missing: user.ci ? null : 'CI' };
  } else if (user.person_type === 'juridica') {
    return { valid: !!user.nit, missing: user.nit ? null : 'NIT' };
  }
  return { valid: false, missing: 'person_type' };
}

const LEGAL_CLAUSES = {
  liability_limitation: 'LIMITACION DE RESPONSABILIDAD: La plataforma "Almacenes, Galpones, Espacios Libres" actua exclusivamente como intermediario tecnologico entre las partes. La plataforma no es propietaria, arrendadora ni arrendataria de los espacios ofrecidos. La plataforma no garantiza la calidad, seguridad, legalidad o idoneidad de los espacios publicados. Las partes liberan expresamente a la plataforma de cualquier responsabilidad derivada del uso del espacio, danos, perdidas o perjuicios que pudieran surgir de la relacion contractual entre HOST y GUEST.',
  applicable_law: 'LEY APLICABLE: El presente contrato se rige por las leyes del Estado Plurinacional de Bolivia, en particular por el Codigo Civil Boliviano (Decreto Ley No. 12760), el Codigo de Comercio (Decreto Ley No. 14379) y demas normativa aplicable. Para cualquier controversia derivada del presente contrato, las partes se someten a la jurisdiccion de los tribunales ordinarios de Bolivia.',
  intermediary: 'INTERMEDIACION TECNOLOGICA: La plataforma actua unicamente como intermediario tecnologico facilitando la conexion entre oferentes (HOST) y demandantes (GUEST) de espacios. La plataforma no interviene en la negociacion ni ejecucion del contrato mas alla de su rol de intermediacion.',
  anti_bypass: 'CLAUSULA ANTI-BYPASS: Las partes se comprometen a realizar todas las transacciones relacionadas con este alquiler exclusivamente a traves de la plataforma. Queda expresamente prohibido contratar, extender o modificar el alquiler fuera de la plataforma, bajo pena de las sanciones establecidas en los terminos de uso.'
};

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
      legal: {
        jurisdiction: 'Estado Plurinacional de Bolivia',
        liability_limitation: LEGAL_CLAUSES.liability_limitation,
        applicable_law: LEGAL_CLAUSES.applicable_law,
        intermediary_clause: LEGAL_CLAUSES.intermediary,
        anti_bypass_clause: LEGAL_CLAUSES.anti_bypass
      },
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

      logAudit(req.user.id, 'CONTRACT_SIGNED_GUEST_MOCK', 'contracts', req.params.id, null, { ...clientInfo, disclaimer: SIGNATURE_DISCLAIMER }, req);
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

      logAudit(req.user.id, 'CONTRACT_SIGNED_HOST_MOCK', 'contracts', req.params.id, null, { ...clientInfo, disclaimer: SIGNATURE_DISCLAIMER }, req);
      logAudit(req.user.id, 'ESCROW_RELEASED_MOCK', 'contracts', req.params.id, null, { reservation_id: contract.reservation_id, disclaimer: 'MOCK - Sin transferencia real de fondos' }, req);
    }

    const updatedContract = db.prepare('SELECT * FROM contracts WHERE id = ?').get(req.params.id);
    const bothSigned = updatedContract.guest_signed && updatedContract.host_signed;

    res.json({
      message: 'Contrato firmado exitosamente',
      fully_signed: bothSigned,
      escrow_released: bothSigned,
      disclaimer: SIGNATURE_DISCLAIMER
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

    res.json({ 
      message: `Codigo OTP generado. Expira en ${OTP_EXPIRATION_MINUTES} minutos. [DEMO: Ver consola del servidor para obtener el codigo - En produccion se enviaria por email/SMS]`,
      expires_in_minutes: OTP_EXPIRATION_MINUTES,
      disclaimer: SIGNATURE_DISCLAIMER
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
    
    // Usar porcentaje de comision congelado del contrato original
    const commissionPercentage = contract.frozen_commission_percentage || 10;
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
    doc.text(LEGAL_CLAUSES.liability_limitation, { align: 'justify' });
    doc.moveDown();
    doc.text(LEGAL_CLAUSES.applicable_law, { align: 'justify' });
    doc.moveDown();
    doc.text(LEGAL_CLAUSES.intermediary, { align: 'justify' });
    doc.moveDown();
    doc.text(LEGAL_CLAUSES.anti_bypass, { align: 'justify' });
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

    doc.fontSize(8).text(SIGNATURE_DISCLAIMER, { align: 'center' });
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

module.exports = router;
