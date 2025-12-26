const express = require('express');
const { db } = require('../config/database');

const router = express.Router();

router.get('/', (req, res) => {
  try {
    const legalTexts = db.prepare('SELECT type, title FROM legal_texts WHERE is_active = 1').all();
    res.json(legalTexts);
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Error al obtener textos legales' });
  }
});

router.get('/aviso-legal', (req, res) => {
  try {
    const text = db.prepare("SELECT * FROM legal_texts WHERE type = 'aviso_legal' AND is_active = 1").get();
    res.json(text || { title: 'Aviso Legal', content: 'Contenido no disponible' });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Error al obtener aviso legal' });
  }
});

router.get('/terminos', (req, res) => {
  try {
    const text = db.prepare("SELECT * FROM legal_texts WHERE type = 'terminos_condiciones' AND is_active = 1").get();
    res.json(text || { title: 'Terminos y Condiciones', content: 'Contenido no disponible' });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Error al obtener terminos' });
  }
});

router.get('/privacidad', (req, res) => {
  try {
    const text = db.prepare("SELECT * FROM legal_texts WHERE type = 'privacidad' AND is_active = 1").get();
    res.json(text || { title: 'Politica de Privacidad', content: 'Contenido no disponible' });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Error al obtener politica de privacidad' });
  }
});

router.get('/pagos-reembolsos', (req, res) => {
  try {
    const text = db.prepare("SELECT * FROM legal_texts WHERE type = 'pagos_reembolsos' AND is_active = 1").get();
    res.json(text || { title: 'Politica de Pagos y Reembolsos', content: 'Contenido no disponible' });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Error al obtener politica de pagos' });
  }
});

router.get('/intermediacion', (req, res) => {
  try {
    const text = db.prepare("SELECT * FROM legal_texts WHERE type = 'intermediacion' AND is_active = 1").get();
    res.json(text || { title: 'Declaracion de Intermediacion', content: 'Contenido no disponible' });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Error al obtener declaracion de intermediacion' });
  }
});

router.get('/anti-bypass', (req, res) => {
  try {
    const text = db.prepare("SELECT * FROM legal_texts WHERE type = 'anti_bypass' AND is_active = 1").get();
    res.json(text || { title: 'Clausula Anti-Bypass', content: 'Contenido no disponible' });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Error al obtener clausula anti-bypass' });
  }
});

module.exports = router;
