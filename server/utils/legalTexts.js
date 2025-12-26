const { db } = require('../config/database');

function getActiveLegalText(type) {
  const text = db.prepare(`
    SELECT id, type, title, content, version, effective_date 
    FROM legal_texts 
    WHERE type = ? AND is_active = 1
  `).get(type);
  
  if (!text) {
    return {
      id: null,
      type,
      title: `${type} (no configurado)`,
      content: `[TEXTO LEGAL NO CONFIGURADO: ${type}] Contacte al administrador.`,
      version: '0.0',
      effective_date: null
    };
  }
  
  return text;
}

function getLegalTextById(id) {
  return db.prepare('SELECT * FROM legal_texts WHERE id = ?').get(id);
}

function getAllActiveLegalTexts() {
  return db.prepare(`
    SELECT id, type, title, content, version, effective_date 
    FROM legal_texts 
    WHERE is_active = 1
  `).all();
}

function getLegalClausesForContract() {
  const liability = getActiveLegalText('liability_limitation');
  const applicableLaw = getActiveLegalText('applicable_law');
  const intermediary = getActiveLegalText('intermediacion');
  const antiBypassGuest = getActiveLegalText('anti_bypass_guest');
  const antiBypassHost = getActiveLegalText('anti_bypass_host');
  const disclaimerContrato = getActiveLegalText('disclaimer_contrato');
  const disclaimerFirma = getActiveLegalText('disclaimer_firma');

  return {
    liability_limitation: liability.content,
    liability_limitation_version: liability.version,
    applicable_law: applicableLaw.content,
    applicable_law_version: applicableLaw.version,
    intermediary: intermediary.content,
    intermediary_version: intermediary.version,
    anti_bypass_guest: antiBypassGuest.content,
    anti_bypass_guest_version: antiBypassGuest.version,
    anti_bypass_host: antiBypassHost.content,
    anti_bypass_host_version: antiBypassHost.version,
    disclaimer_contrato: disclaimerContrato.content,
    disclaimer_contrato_version: disclaimerContrato.version,
    disclaimer_firma: disclaimerFirma.content,
    disclaimer_firma_version: disclaimerFirma.version,
    _versions: {
      liability_limitation: liability.version,
      applicable_law: applicableLaw.version,
      intermediary: intermediary.version,
      anti_bypass_guest: antiBypassGuest.version,
      anti_bypass_host: antiBypassHost.version,
      disclaimer_contrato: disclaimerContrato.version,
      disclaimer_firma: disclaimerFirma.version
    }
  };
}

function getInvoiceDisclaimer() {
  const disclaimer = getActiveLegalText('disclaimer_factura');
  return {
    content: disclaimer.content,
    version: disclaimer.version,
    id: disclaimer.id
  };
}

function getAntiBypassForRole(role) {
  const type = role === 'HOST' ? 'anti_bypass_host' : 'anti_bypass_guest';
  const text = getActiveLegalText(type);
  return {
    content: text.content,
    version: text.version,
    id: text.id,
    type: text.type
  };
}

module.exports = {
  getActiveLegalText,
  getLegalTextById,
  getAllActiveLegalTexts,
  getLegalClausesForContract,
  getInvoiceDisclaimer,
  getAntiBypassForRole
};
