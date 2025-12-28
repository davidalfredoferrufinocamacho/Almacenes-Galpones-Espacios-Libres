const fs = require('fs');
const path = require('path');
const { db } = require('../config/database');
const { v4: uuidv4 } = require('uuid');

const BACKUP_DIR = path.join(__dirname, '../../backups');

if (!fs.existsSync(BACKUP_DIR)) {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
}

function formatDate(date) {
  return date.toISOString().replace(/[:.]/g, '-').slice(0, 19);
}

function getNextBackupDate(frequency, fromDate = new Date()) {
  const next = new Date(fromDate);
  switch (frequency) {
    case 'daily':
      next.setDate(next.getDate() + 1);
      break;
    case 'weekly':
      next.setDate(next.getDate() + 7);
      break;
    case 'monthly':
      next.setMonth(next.getMonth() + 1);
      break;
    case 'quarterly':
      next.setMonth(next.getMonth() + 3);
      break;
    case 'semestral':
      next.setMonth(next.getMonth() + 6);
      break;
    case 'yearly':
      next.setFullYear(next.getFullYear() + 1);
      break;
    default:
      next.setDate(next.getDate() + 1);
  }
  next.setHours(3, 0, 0, 0);
  return next;
}

async function createBackup(backupType = 'manual', createdBy = null) {
  const backupId = uuidv4();
  const timestamp = formatDate(new Date());
  const filename = `backup_${timestamp}_${backupType}.sqlite`;
  const filepath = path.join(BACKUP_DIR, filename);

  try {
    db.prepare(`
      INSERT INTO backup_history (id, filename, filepath, backup_type, status, created_by)
      VALUES (?, ?, ?, ?, 'in_progress', ?)
    `).run(backupId, filename, filepath, backupType, createdBy);

    const sourcePath = path.join(__dirname, '../../database/app.sqlite');
    
    await db.backup(filepath);

    const stats = fs.statSync(filepath);
    const sizeBytes = stats.size;

    db.prepare(`
      UPDATE backup_history 
      SET status = 'completed', size_bytes = ?
      WHERE id = ?
    `).run(sizeBytes, backupId);

    if (backupType === 'automatic') {
      const config = db.prepare('SELECT * FROM backup_config WHERE id = ?').get('default');
      const nextBackup = getNextBackupDate(config.frequency);
      db.prepare(`
        UPDATE backup_config 
        SET last_backup_at = CURRENT_TIMESTAMP, 
            next_backup_at = ?,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = 'default'
      `).run(nextBackup.toISOString());
    }

    await notifySuperAdmins('success', {
      filename,
      sizeBytes,
      backupType,
      timestamp: new Date().toISOString()
    });

    return {
      success: true,
      backup: {
        id: backupId,
        filename,
        filepath,
        sizeBytes,
        backupType
      }
    };
  } catch (error) {
    console.error('Error creating backup:', error);
    
    db.prepare(`
      UPDATE backup_history 
      SET status = 'failed', error_message = ?
      WHERE id = ?
    `).run(error.message, backupId);

    await notifySuperAdmins('failure', {
      error: error.message,
      backupType,
      timestamp: new Date().toISOString()
    });

    return {
      success: false,
      error: error.message
    };
  }
}

async function restoreBackup(backupId) {
  try {
    const backup = db.prepare('SELECT * FROM backup_history WHERE id = ?').get(backupId);
    
    if (!backup) {
      return { success: false, error: 'Backup no encontrado' };
    }

    if (backup.status !== 'completed') {
      return { success: false, error: 'Este backup no esta disponible para restauracion' };
    }

    if (!fs.existsSync(backup.filepath)) {
      return { success: false, error: 'El archivo de backup no existe en el servidor' };
    }

    const currentTimestamp = formatDate(new Date());
    const preRestoreFilename = `pre_restore_${currentTimestamp}.sqlite`;
    const preRestorePath = path.join(BACKUP_DIR, preRestoreFilename);
    
    const sourcePath = path.join(__dirname, '../../database/app.sqlite');
    
    await db.backup(preRestorePath);

    const preRestoreId = uuidv4();
    db.prepare(`
      INSERT INTO backup_history (id, filename, filepath, size_bytes, backup_type, status)
      VALUES (?, ?, ?, ?, 'manual', 'completed')
    `).run(preRestoreId, preRestoreFilename, preRestorePath, fs.statSync(preRestorePath).size);

    db.prepare(`
      INSERT INTO audit_log (id, user_id, action, entity_type, entity_id, old_data, new_data)
      VALUES (?, NULL, 'backup_restored', 'backup_history', ?, ?, ?)
    `).run(uuidv4(), backupId, JSON.stringify({ backup_id: backupId }), JSON.stringify({
      restored_from: backup.filename,
      pre_restore_backup: preRestoreFilename
    }));

    setTimeout(() => {
      try {
        fs.copyFileSync(backup.filepath, sourcePath);
        console.log('Backup restaurado, reiniciando servidor...');
        process.exit(0);
      } catch (err) {
        console.error('Error al restaurar backup:', err);
      }
    }, 500);

    return {
      success: true,
      message: 'Backup restaurado exitosamente. El servidor se reiniciara automaticamente.',
      preRestoreBackupId: preRestoreId,
      requiresRestart: true
    };
  } catch (error) {
    console.error('Error restoring backup:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

function listBackups() {
  try {
    const backups = db.prepare(`
      SELECT bh.*, u.email as created_by_email, u.first_name, u.last_name
      FROM backup_history bh
      LEFT JOIN users u ON bh.created_by = u.id
      ORDER BY bh.created_at DESC
    `).all();
    
    return backups.map(b => ({
      ...b,
      exists: fs.existsSync(b.filepath),
      sizeFormatted: formatBytes(b.size_bytes)
    }));
  } catch (error) {
    console.error('Error listing backups:', error);
    return [];
  }
}

function formatBytes(bytes) {
  if (!bytes) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function getConfig() {
  return db.prepare('SELECT * FROM backup_config WHERE id = ?').get('default');
}

function updateConfig(config) {
  const { auto_backup_enabled, frequency, retention_days, notify_on_success, notify_on_failure } = config;
  
  let nextBackup = null;
  if (auto_backup_enabled) {
    nextBackup = getNextBackupDate(frequency);
  }

  db.prepare(`
    UPDATE backup_config 
    SET auto_backup_enabled = ?,
        frequency = ?,
        retention_days = ?,
        notify_on_success = ?,
        notify_on_failure = ?,
        next_backup_at = ?,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = 'default'
  `).run(
    auto_backup_enabled ? 1 : 0,
    frequency,
    retention_days,
    notify_on_success ? 1 : 0,
    notify_on_failure ? 1 : 0,
    nextBackup ? nextBackup.toISOString() : null
  );

  return getConfig();
}

function deleteBackup(backupId) {
  try {
    const backup = db.prepare('SELECT * FROM backup_history WHERE id = ?').get(backupId);
    
    if (!backup) {
      return { success: false, error: 'Backup no encontrado' };
    }

    if (fs.existsSync(backup.filepath)) {
      fs.unlinkSync(backup.filepath);
    }

    db.prepare('DELETE FROM backup_history WHERE id = ?').run(backupId);

    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

function cleanOldBackups() {
  try {
    const config = getConfig();
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - config.retention_days);

    const oldBackups = db.prepare(`
      SELECT * FROM backup_history 
      WHERE created_at < ? AND status = 'completed'
    `).all(cutoffDate.toISOString());

    for (const backup of oldBackups) {
      deleteBackup(backup.id);
    }

    return { deleted: oldBackups.length };
  } catch (error) {
    console.error('Error cleaning old backups:', error);
    return { deleted: 0, error: error.message };
  }
}

async function notifySuperAdmins(type, details) {
  try {
    const config = getConfig();
    
    if (type === 'success' && !config.notify_on_success) return;
    if (type === 'failure' && !config.notify_on_failure) return;

    const superAdmins = db.prepare(`
      SELECT id, email, first_name FROM users 
      WHERE role = 'ADMIN' AND is_super_admin = 1 AND is_active = 1
    `).all();

    const subject = type === 'success' 
      ? 'Backup completado exitosamente'
      : 'Error en backup del sistema';

    const body = type === 'success'
      ? `El backup ${details.backupType} se ha completado exitosamente.\n\nArchivo: ${details.filename}\nTamano: ${formatBytes(details.sizeBytes)}\nFecha: ${details.timestamp}`
      : `Ha ocurrido un error durante el backup ${details.backupType}.\n\nError: ${details.error}\nFecha: ${details.timestamp}`;

    for (const admin of superAdmins) {
      db.prepare(`
        INSERT INTO notifications (id, recipient_id, event_type, channel, subject, body, status)
        VALUES (?, ?, ?, 'email', ?, ?, 'pending')
      `).run(uuidv4(), admin.id, `backup_${type}`, subject, body);
    }
  } catch (error) {
    console.error('Error notifying super admins:', error);
  }
}

async function checkAndRunScheduledBackup() {
  try {
    const config = getConfig();
    
    if (!config.auto_backup_enabled) return;
    
    const now = new Date();
    const nextBackup = config.next_backup_at ? new Date(config.next_backup_at) : null;
    
    if (nextBackup && now >= nextBackup) {
      console.log('Ejecutando backup automatico programado...');
      await createBackup('automatic', null);
      cleanOldBackups();
    }
  } catch (error) {
    console.error('Error in scheduled backup check:', error);
  }
}

let schedulerInterval = null;

function startBackupScheduler() {
  if (schedulerInterval) {
    clearInterval(schedulerInterval);
  }
  
  schedulerInterval = setInterval(() => {
    checkAndRunScheduledBackup();
  }, 60 * 60 * 1000);
  
  console.log('Scheduler de backups iniciado');
  
  setTimeout(() => {
    checkAndRunScheduledBackup();
  }, 5000);
}

function stopBackupScheduler() {
  if (schedulerInterval) {
    clearInterval(schedulerInterval);
    schedulerInterval = null;
  }
}

module.exports = {
  createBackup,
  restoreBackup,
  listBackups,
  getConfig,
  updateConfig,
  deleteBackup,
  cleanOldBackups,
  startBackupScheduler,
  stopBackupScheduler,
  formatBytes
};
