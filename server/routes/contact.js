const express = require('express');
const { body, validationResult } = require('express-validator');
const { db } = require('../config/database');
const { optionalAuth } = require('../middleware/auth');
const { generateId } = require('../utils/helpers');

const router = express.Router();

router.post('/', optionalAuth, [
  body('name').notEmpty().trim(),
  body('email').isEmail().normalizeEmail(),
  body('subject').notEmpty().trim(),
  body('message').notEmpty().trim().isLength({ min: 10 })
], (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { name, email, subject, message } = req.body;
    const userId = req.user ? req.user.id : null;

    const messageId = generateId();

    db.prepare(`
      INSERT INTO contact_messages (id, user_id, name, email, subject, message, status)
      VALUES (?, ?, ?, ?, ?, ?, 'pending')
    `).run(messageId, userId, name, email, subject, message);

    res.status(201).json({
      id: messageId,
      message: 'Mensaje enviado exitosamente. Nos pondremos en contacto pronto.'
    });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Error al enviar mensaje' });
  }
});

module.exports = router;
