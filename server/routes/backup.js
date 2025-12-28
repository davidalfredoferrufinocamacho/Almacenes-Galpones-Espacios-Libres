const express = require('express');
const { db } = require('../config/database');
const { authenticateToken, requireRole } = require('../middleware/auth');
const { logAudit } = require('../middleware/audit');
const { getClientInfo } = require('../utils/helpers');
const backupService = require('../services/backupService');

const router = express.Router();

router.use(authenticateToken);
router.use(requireRole('ADMIN'));

const requireSuperAdmin = (req, res, next) => {
  const currentAdmin = db.prepare('SELECT is_super_admin FROM users WHERE id = ?').get(req.user.id);
  if (currentAdmin?.is_super_admin !== 1) {
    return res.status(403).json({ error: 'Acceso restringido: Solo Super Admins pueden gestionar backups' });
  }
  next();
};

router.use(requireSuperAdmin);

router.get('/config', (req, res) => {
  try {
    const config = backupService.getConfig();
    res.json(config);
  } catch (error) {
    console.error('Error getting backup config:', error);
    res.status(500).json({ error: 'Error al obtener configuracion de backups' });
  }
});

router.put('/config', async (req, res) => {
  try {
    const { auto_backup_enabled, frequency, retention_days, notify_on_success, notify_on_failure } = req.body;
    
    const config = backupService.updateConfig({
      auto_backup_enabled,
      frequency,
      retention_days,
      notify_on_success,
      notify_on_failure
    });

    logAudit(req, 'backup_config_updated', 'backup_config', 'default', { 
      config,
      ...getClientInfo(req)
    });

    res.json({ success: true, config });
  } catch (error) {
    console.error('Error updating backup config:', error);
    res.status(500).json({ error: 'Error al actualizar configuracion de backups' });
  }
});

router.get('/list', (req, res) => {
  try {
    const backups = backupService.listBackups();
    res.json(backups);
  } catch (error) {
    console.error('Error listing backups:', error);
    res.status(500).json({ error: 'Error al listar backups' });
  }
});

router.post('/create', async (req, res) => {
  try {
    const result = await backupService.createBackup('manual', req.user.id);

    if (result.success) {
      logAudit(req, 'backup_created', 'backup_history', result.backup.id, {
        filename: result.backup.filename,
        sizeBytes: result.backup.sizeBytes,
        ...getClientInfo(req)
      });
    }

    res.json(result);
  } catch (error) {
    console.error('Error creating backup:', error);
    res.status(500).json({ error: 'Error al crear backup' });
  }
});

router.post('/restore/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    logAudit(req, 'backup_restore_initiated', 'backup_history', id, {
      ...getClientInfo(req)
    });

    const result = await backupService.restoreBackup(id);

    if (result.success) {
      res.json({
        success: true,
        message: 'Backup restaurado. El servidor se reiniciara automaticamente.',
        requiresRestart: true
      });
    } else {
      res.status(400).json(result);
    }
  } catch (error) {
    console.error('Error restoring backup:', error);
    res.status(500).json({ error: 'Error al restaurar backup' });
  }
});

router.delete('/:id', (req, res) => {
  try {
    const { id } = req.params;
    const result = backupService.deleteBackup(id);

    if (result.success) {
      logAudit(req, 'backup_deleted', 'backup_history', id, {
        ...getClientInfo(req)
      });
    }

    res.json(result);
  } catch (error) {
    console.error('Error deleting backup:', error);
    res.status(500).json({ error: 'Error al eliminar backup' });
  }
});

router.post('/clean-old', (req, res) => {
  try {
    const result = backupService.cleanOldBackups();
    
    logAudit(req, 'backup_cleanup', 'backup_history', null, {
      deletedCount: result.deleted,
      ...getClientInfo(req)
    });

    res.json(result);
  } catch (error) {
    console.error('Error cleaning old backups:', error);
    res.status(500).json({ error: 'Error al limpiar backups antiguos' });
  }
});

router.get('/download/:id', (req, res) => {
  try {
    const { id } = req.params;
    const backup = db.prepare('SELECT * FROM backup_history WHERE id = ?').get(id);

    if (!backup) {
      return res.status(404).json({ error: 'Backup no encontrado' });
    }

    const fs = require('fs');
    if (!fs.existsSync(backup.filepath)) {
      return res.status(404).json({ error: 'Archivo de backup no encontrado' });
    }

    logAudit(req, 'backup_downloaded', 'backup_history', id, {
      filename: backup.filename,
      ...getClientInfo(req)
    });

    res.download(backup.filepath, backup.filename);
  } catch (error) {
    console.error('Error downloading backup:', error);
    res.status(500).json({ error: 'Error al descargar backup' });
  }
});

module.exports = router;
