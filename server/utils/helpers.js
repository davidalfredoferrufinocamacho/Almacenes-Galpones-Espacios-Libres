const { v4: uuidv4 } = require('uuid');

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
  return Math.floor(100000 + Math.random() * 900000).toString();
}

function calculateRentalPrice(pricePerSqm, sqm, periodType, quantity) {
  const total = pricePerSqm * sqm * quantity;
  return Math.round(total * 100) / 100;
}

function calculateEndDate(startDate, periodType, quantity) {
  const start = new Date(startDate);
  const end = new Date(start);

  switch (periodType) {
    case 'dia':
      end.setDate(end.getDate() + quantity);
      break;
    case 'semana':
      end.setDate(end.getDate() + (quantity * 7));
      break;
    case 'mes':
      end.setMonth(end.getMonth() + quantity);
      break;
    case 'trimestre':
      end.setMonth(end.getMonth() + (quantity * 3));
      break;
    case 'semestre':
      end.setMonth(end.getMonth() + (quantity * 6));
      break;
    case 'ano':
      end.setFullYear(end.getFullYear() + quantity);
      break;
  }

  return end.toISOString().split('T')[0];
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

module.exports = {
  generateId,
  generateContractNumber,
  generateInvoiceNumber,
  generateOTP,
  calculateRentalPrice,
  calculateEndDate,
  formatCurrency,
  getClientInfo
};
