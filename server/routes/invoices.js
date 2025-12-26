const express = require('express');
const path = require('path');
const fs = require('fs');
const PDFDocument = require('pdfkit');
const { db } = require('../config/database');
const { authenticateToken, requireRole } = require('../middleware/auth');
const { logAudit } = require('../middleware/audit');
const { generateId, generateInvoiceNumber, getClientInfo } = require('../utils/helpers');

const INVOICE_DISCLAIMER = '[FACTURA NO FISCAL] Este documento es una factura interna de la plataforma. NO tiene validez fiscal ante el Servicio de Impuestos Nacionales (SIN). Integracion SIAT pendiente de implementacion.';

function validateLegalIdentity(user) {
  if (user.person_type === 'natural') {
    return { valid: !!user.ci, missing: user.ci ? null : 'CI' };
  } else if (user.person_type === 'juridica') {
    return { valid: !!user.nit, missing: user.nit ? null : 'NIT' };
  }
  return { valid: false, missing: 'person_type' };
}

const router = express.Router();

router.post('/generate/:contract_id', authenticateToken, (req, res) => {
  try {
    const contract = db.prepare(`
      SELECT c.*, 
             ug.first_name as guest_first_name, ug.last_name as guest_last_name,
             ug.company_name as guest_company, ug.ci as guest_ci, ug.nit as guest_nit,
             ug.address as guest_address, ug.city as guest_city, ug.person_type as guest_person_type,
             ug.email as guest_email,
             uh.first_name as host_first_name, uh.last_name as host_last_name,
             uh.company_name as host_company, uh.ci as host_ci, uh.nit as host_nit,
             uh.address as host_address, uh.city as host_city, uh.person_type as host_person_type,
             uh.email as host_email
      FROM contracts c
      JOIN users ug ON c.guest_id = ug.id
      JOIN users uh ON c.host_id = uh.id
      WHERE c.id = ? AND c.status IN ('signed', 'active', 'completed', 'extended')
    `).get(req.params.contract_id);

    if (!contract) {
      return res.status(404).json({ error: 'Contrato no encontrado o no esta firmado' });
    }

    if (contract.guest_id !== req.user.id && contract.host_id !== req.user.id && req.user.role !== 'ADMIN') {
      return res.status(403).json({ error: 'No tiene permiso para generar factura de este contrato' });
    }

    const clientInfo = getClientInfo(req);

    const guestIdentity = validateLegalIdentity({
      person_type: contract.guest_person_type,
      ci: contract.guest_ci,
      nit: contract.guest_nit
    });
    
    if (!guestIdentity.valid) {
      logAudit(req.user.id, 'LEGAL_IDENTITY_INCOMPLETE', 'users', contract.guest_id, null, {
        person_type: contract.guest_person_type,
        missing: guestIdentity.missing,
        blocked_operation: 'invoice',
        contract_id: contract.id,
        ...clientInfo
      }, req);
      return res.status(400).json({ 
        error: `Identificacion legal incompleta para GUEST: falta ${guestIdentity.missing}. No se puede generar factura.`,
        user_type: 'GUEST'
      });
    }

    const existingInvoice = db.prepare('SELECT id, invoice_number FROM invoices WHERE contract_id = ?').get(contract.id);
    if (existingInvoice) {
      return res.json({
        invoice_id: existingInvoice.id,
        invoice_number: existingInvoice.invoice_number,
        message: 'Ya existe una factura para este contrato'
      });
    }

    const invoiceId = generateId();
    const invoiceNumber = generateInvoiceNumber();

    const guestName = contract.guest_person_type === 'juridica' ? contract.guest_company : `${contract.guest_first_name} ${contract.guest_last_name}`;
    
    let frozenSpace = {};
    if (contract.frozen_space_data) {
      try {
        frozenSpace = JSON.parse(contract.frozen_space_data);
      } catch (e) {}
    }

    const concept = `Alquiler de espacio: ${frozenSpace.title || 'N/A'} - ${contract.sqm} m2 - ${contract.period_quantity} ${contract.period_type}(s)`;

    db.prepare(`
      INSERT INTO invoices (
        id, contract_id, guest_id, host_id, invoice_number, invoice_type,
        recipient_type, recipient_id, amount, total_amount,
        commission_amount, host_payout_amount, concept, nit, company_name, status
      ) VALUES (?, ?, ?, ?, ?, 'pdf_normal', 'guest', ?, ?, ?, ?, ?, ?, ?, ?, 'issued')
    `).run(
      invoiceId, contract.id, contract.guest_id, contract.host_id, invoiceNumber,
      contract.guest_id, contract.total_amount, contract.total_amount,
      contract.commission_amount, contract.host_payout_amount, concept,
      contract.guest_nit || contract.guest_ci, guestName
    );

    logAudit(req.user.id, 'INVOICE_GENERATED', 'invoices', invoiceId, null, {
      contract_id: contract.id,
      invoice_number: invoiceNumber,
      total_amount: contract.total_amount,
      commission_amount: contract.commission_amount,
      host_payout_amount: contract.host_payout_amount,
      ...clientInfo
    }, req);

    res.status(201).json({
      invoice_id: invoiceId,
      invoice_number: invoiceNumber,
      contract_id: contract.id,
      total_amount: contract.total_amount,
      message: 'Factura generada exitosamente'
    });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Error al generar factura' });
  }
});

router.get('/:id/pdf', authenticateToken, (req, res) => {
  try {
    const invoice = db.prepare(`
      SELECT i.*, 
             c.contract_number, c.sqm, c.period_type, c.period_quantity,
             c.start_date, c.end_date, c.frozen_space_data,
             ug.first_name as guest_first_name, ug.last_name as guest_last_name,
             ug.company_name as guest_company, ug.ci as guest_ci, ug.nit as guest_nit,
             ug.address as guest_address, ug.city as guest_city, ug.person_type as guest_person_type,
             ug.email as guest_email,
             uh.first_name as host_first_name, uh.last_name as host_last_name,
             uh.company_name as host_company, uh.email as host_email
      FROM invoices i
      JOIN contracts c ON i.contract_id = c.id
      JOIN users ug ON i.guest_id = ug.id
      JOIN users uh ON i.host_id = uh.id
      WHERE i.id = ?
    `).get(req.params.id);

    if (!invoice) {
      return res.status(404).json({ error: 'Factura no encontrada' });
    }

    if (invoice.guest_id !== req.user.id && invoice.host_id !== req.user.id && req.user.role !== 'ADMIN') {
      return res.status(403).json({ error: 'No tiene permiso para descargar esta factura' });
    }

    let frozenSpace = {};
    if (invoice.frozen_space_data) {
      try {
        frozenSpace = JSON.parse(invoice.frozen_space_data);
      } catch (e) {}
    }

    const pdfDir = path.join(process.cwd(), 'uploads', 'invoices');
    if (!fs.existsSync(pdfDir)) {
      fs.mkdirSync(pdfDir, { recursive: true });
    }

    const pdfFilename = `factura_${invoice.invoice_number}.pdf`;
    const pdfPath = path.join(pdfDir, pdfFilename);

    const doc = new PDFDocument({ size: 'LETTER', margin: 50 });
    const writeStream = fs.createWriteStream(pdfPath);
    doc.pipe(writeStream);

    doc.fontSize(18).text('FACTURA', { align: 'center' });
    doc.fontSize(10).text('Almacenes, Galpones, Espacios Libres', { align: 'center' });
    doc.moveDown();
    doc.fontSize(12).text(`Factura No: ${invoice.invoice_number}`, { align: 'center' });
    doc.text(`Fecha de emision: ${invoice.created_at}`, { align: 'center' });
    doc.moveDown(2);

    doc.fontSize(14).text('DATOS DEL CLIENTE (GUEST)', { underline: true });
    doc.moveDown(0.5);
    doc.fontSize(11);
    const guestName = invoice.guest_person_type === 'juridica' ? invoice.guest_company : `${invoice.guest_first_name} ${invoice.guest_last_name}`;
    doc.text(`Nombre/Razon Social: ${guestName}`);
    doc.text(`CI/NIT: ${invoice.guest_nit || invoice.guest_ci || 'N/A'}`);
    doc.text(`Direccion: ${invoice.guest_address || 'N/A'}, ${invoice.guest_city || ''}`);
    doc.text(`Email: ${invoice.guest_email}`);
    doc.moveDown(2);

    doc.fontSize(14).text('REFERENCIA DE CONTRATO', { underline: true });
    doc.moveDown(0.5);
    doc.fontSize(11);
    doc.text(`Contrato No: ${invoice.contract_number}`);
    doc.text(`Espacio: ${frozenSpace.title || 'N/A'}`);
    doc.text(`Superficie: ${invoice.sqm} m2`);
    doc.text(`Periodo: ${invoice.period_quantity} ${invoice.period_type}(s)`);
    doc.text(`Vigencia: ${invoice.start_date} al ${invoice.end_date}`);
    doc.moveDown(2);

    doc.fontSize(14).text('DETALLE DE MONTOS', { underline: true });
    doc.moveDown(0.5);
    doc.fontSize(11);
    doc.text(`Concepto: ${invoice.concept}`);
    doc.moveDown(0.5);
    
    doc.text('─'.repeat(50));
    doc.text(`Monto Total del Alquiler:        Bs. ${invoice.total_amount.toFixed(2)}`);
    doc.text(`Comision de Plataforma:          Bs. ${invoice.commission_amount.toFixed(2)}`);
    doc.text(`Monto Neto al HOST:              Bs. ${invoice.host_payout_amount.toFixed(2)}`);
    doc.text('─'.repeat(50));
    doc.fontSize(12).text(`TOTAL FACTURADO:                 Bs. ${invoice.total_amount.toFixed(2)}`, { bold: true });
    doc.moveDown(2);

    doc.fontSize(14).text('DATOS DEL ARRENDADOR (HOST)', { underline: true });
    doc.moveDown(0.5);
    doc.fontSize(11);
    const hostName = invoice.host_company || `${invoice.host_first_name} ${invoice.host_last_name}`;
    doc.text(`Nombre/Razon Social: ${hostName}`);
    doc.text(`Email: ${invoice.host_email}`);
    doc.moveDown(2);

    doc.fontSize(8).fillColor('red').text(INVOICE_DISCLAIMER, { align: 'center' });
    doc.fillColor('black');
    doc.moveDown();
    doc.fontSize(8).text('Plataforma: Almacenes, Galpones, Espacios Libres', { align: 'center' });
    doc.text('Contacto: admin@almacenes-galpones-espacios-libres.com', { align: 'center' });

    doc.end();

    writeStream.on('finish', () => {
      const pdfUrl = `/uploads/invoices/${pdfFilename}`;
      
      db.prepare(`
        UPDATE invoices SET pdf_url = ? WHERE id = ?
      `).run(pdfUrl, invoice.id);

      const clientInfo = getClientInfo(req);
      logAudit(req.user.id, 'INVOICE_PDF_DOWNLOADED', 'invoices', invoice.id, null, {
        pdf_url: pdfUrl,
        invoice_number: invoice.invoice_number,
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
      res.status(500).json({ error: 'Error al generar PDF de factura' });
    });

  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Error al generar PDF de factura' });
  }
});

router.get('/my-invoices', authenticateToken, (req, res) => {
  try {
    const invoices = db.prepare(`
      SELECT i.*, c.contract_number
      FROM invoices i
      JOIN contracts c ON i.contract_id = c.id
      WHERE i.guest_id = ? OR i.host_id = ?
      ORDER BY i.created_at DESC
    `).all(req.user.id, req.user.id);

    res.json(invoices);
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Error al obtener facturas' });
  }
});

router.get('/:id', authenticateToken, (req, res) => {
  try {
    const invoice = db.prepare(`
      SELECT i.*, c.contract_number
      FROM invoices i
      JOIN contracts c ON i.contract_id = c.id
      WHERE i.id = ?
    `).get(req.params.id);

    if (!invoice) {
      return res.status(404).json({ error: 'Factura no encontrada' });
    }

    if (invoice.guest_id !== req.user.id && invoice.host_id !== req.user.id && req.user.role !== 'ADMIN') {
      return res.status(403).json({ error: 'No tiene permiso para ver esta factura' });
    }

    res.json(invoice);
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Error al obtener factura' });
  }
});

module.exports = router;
