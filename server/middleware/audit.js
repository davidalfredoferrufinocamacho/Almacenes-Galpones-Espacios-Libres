const { db } = require('../config/database');
const { v4: uuidv4 } = require('uuid');

function logAudit(userId, action, entityType, entityId, oldData, newData, req) {
  try {
    const stmt = db.prepare(`
      INSERT INTO audit_log (id, user_id, action, entity_type, entity_id, old_data, new_data, ip_address, user_agent)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      uuidv4(),
      userId,
      action,
      entityType,
      entityId,
      oldData ? JSON.stringify(oldData) : null,
      newData ? JSON.stringify(newData) : null,
      req?.ip || req?.connection?.remoteAddress || null,
      req?.get('user-agent') || null
    );
  } catch (error) {
    console.error('Error al registrar auditoria:', error);
  }
}

module.exports = { logAudit };
