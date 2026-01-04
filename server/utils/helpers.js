const { v4: uuidv4 } = require('uuid');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

const OTP_EXPIRATION_MINUTES = 5;

function generateId() {
  return uuidv4();
}

function generateContractNumber() {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const random = Math.random().toString(36).substring(2, 8).toUpperCase();
  return `CTR-${year}${month}-${random}`;
}

function generateInvoiceNumber() {
  const date = new Date();
  const year = date.getFullYear();
  const random = Math.random().toString(36).substring(2, 10).toUpperCase();
  return `FAC-${year}-${random}`;
}

function generateOTP() {
  return crypto.randomInt(100000, 999999).toString();
}

async function hashOTP(otp) {
  return await bcrypt.hash(otp, 10);
}

async function verifyOTP(otp, hash) {
  return await bcrypt.compare(otp, hash);
}

function getOTPExpiration() {
  const expiration = new Date();
  expiration.setMinutes(expiration.getMinutes() + OTP_EXPIRATION_MINUTES);
  return expiration.toISOString();
}

function isOTPExpired(expirationTime) {
  return new Date() > new Date(expirationTime);
}

function calculateRentalPrice(pricePerSqm, sqm, periodType, quantity) {
  const total = pricePerSqm * sqm * quantity;
  return Math.round(total * 100) / 100;
}

function calculateEndDate(startDate, periodType, quantity) {
  const start = new Date(startDate);
  const startDay = start.getUTCDate();
  const startMonth = start.getUTCMonth();
  const startYear = start.getUTCFullYear();
  
  let endYear = startYear;
  let endMonth = startMonth;

  switch (periodType) {
    case 'dia':
      const endDia = new Date(Date.UTC(startYear, startMonth, startDay + quantity - 1));
      return endDia.toISOString().split('T')[0];
    case 'semana':
      const endSemana = new Date(Date.UTC(startYear, startMonth, startDay + (quantity * 7) - 1));
      return endSemana.toISOString().split('T')[0];
    case 'mes':
      endMonth += quantity;
      break;
    case 'trimestre':
      endMonth += quantity * 3;
      break;
    case 'semestre':
      endMonth += quantity * 6;
      break;
    case 'ano':
      endYear += quantity;
      break;
  }

  while (endMonth >= 12) {
    endMonth -= 12;
    endYear += 1;
  }

  if (startDay === 1) {
    const lastDayOfMonth = new Date(Date.UTC(endYear, endMonth, 0));
    return lastDayOfMonth.toISOString().split('T')[0];
  } else {
    const end = new Date(Date.UTC(endYear, endMonth, startDay - 1));
    return end.toISOString().split('T')[0];
  }
}

function formatCurrency(amount) {
  return `Bs. ${amount.toFixed(2)}`;
}

function getClientInfo(req) {
  return {
    ip: req.ip || req.connection?.remoteAddress || 'unknown',
    userAgent: req.get('user-agent') || 'unknown',
    timestamp: new Date().toISOString()
  };
}

function generateContractHash(contractData) {
  const dataString = typeof contractData === 'string' ? contractData : JSON.stringify(contractData);
  return crypto.createHash('sha256').update(dataString).digest('hex');
}

function generateSignatureCertificate(contractId, signerId, signerRole, contractHash, clientInfo) {
  const certificateData = {
    contract_id: contractId,
    signer_id: signerId,
    signer_role: signerRole,
    contract_hash: contractHash,
    timestamp: clientInfo.timestamp,
    ip_address: clientInfo.ip,
    user_agent: clientInfo.userAgent,
    certificate_version: '1.0'
  };
  const certificateString = JSON.stringify(certificateData);
  const certificateHash = crypto.createHash('sha256').update(certificateString).digest('hex');
  return {
    ...certificateData,
    certificate_hash: certificateHash
  };
}

module.exports = {
  generateId,
  generateContractNumber,
  generateInvoiceNumber,
  generateOTP,
  hashOTP,
  verifyOTP,
  getOTPExpiration,
  isOTPExpired,
  calculateRentalPrice,
  calculateEndDate,
  formatCurrency,
  getClientInfo,
  generateContractHash,
  generateSignatureCertificate,
  OTP_EXPIRATION_MINUTES
};
