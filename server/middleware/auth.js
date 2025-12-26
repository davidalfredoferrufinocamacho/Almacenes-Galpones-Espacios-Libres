const jwt = require('jsonwebtoken');
const { db } = require('../config/database');

const JWT_SECRET = process.env.JWT_SECRET || 'almacenes_galpones_secret_key_2024';

function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Token de acceso requerido' });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ error: 'Token invalido o expirado' });
    }

    const dbUser = db.prepare('SELECT * FROM users WHERE id = ? AND is_active = 1').get(user.id);
    if (!dbUser) {
      return res.status(403).json({ error: 'Usuario no encontrado o inactivo' });
    }

    req.user = dbUser;
    next();
  });
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'No autenticado' });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'No tiene permisos para esta accion' });
    }

    next();
  };
}

function optionalAuth(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return next();
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (!err) {
      const dbUser = db.prepare('SELECT * FROM users WHERE id = ? AND is_active = 1').get(user.id);
      if (dbUser) {
        req.user = dbUser;
      }
    }
    next();
  });
}

module.exports = { authenticateToken, requireRole, optionalAuth, JWT_SECRET };
