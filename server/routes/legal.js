const express = require('express');
const { db } = require('../config/database');
const { getActiveLegalText, getAllActiveLegalTexts } = require('../utils/legalTexts');

const router = express.Router();

router.get('/', (req, res) => {
  try {
    const legalTexts = getAllActiveLegalTexts();
    res.json(legalTexts.map(t => ({ type: t.type, title: t.title, version: t.version })));
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Error al obtener textos legales' });
  }
});

router.get('/aviso-legal', (req, res) => {
  try {
    const text = getActiveLegalText('aviso_legal');
    res.json(text);
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Error al obtener aviso legal' });
  }
});

router.get('/terminos', (req, res) => {
  try {
    const text = getActiveLegalText('terminos_condiciones');
    res.json(text);
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Error al obtener terminos' });
  }
});

router.get('/privacidad', (req, res) => {
  try {
    const text = getActiveLegalText('privacidad');
    res.json(text);
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Error al obtener politica de privacidad' });
  }
});

router.get('/pagos-reembolsos', (req, res) => {
  try {
    const text = getActiveLegalText('pagos_reembolsos');
    res.json(text);
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Error al obtener politica de pagos' });
  }
});

router.get('/intermediacion', (req, res) => {
  try {
    const text = getActiveLegalText('intermediacion');
    res.json(text);
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Error al obtener declaracion de intermediacion' });
  }
});

router.get('/anti-bypass', (req, res) => {
  try {
    const text = getActiveLegalText('anti_bypass_guest');
    if (!text || text.id === null) {
      return res.status(404).json({ 
        error: '[TEXTO LEGAL NO CONFIGURADO: anti-bypass] Contacte al administrador.' 
      });
    }
    res.json({
      type: 'anti_bypass',
      title: 'Clausula Anti-Bypass',
      content: text.content,
      version: text.version,
      updated_at: text.effective_date,
      legal_text_id: text.id
    });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Error al obtener clausula anti-bypass' });
  }
});

router.get('/anti-bypass/:role', (req, res) => {
  try {
    const role = req.params.role.toUpperCase();
    const type = role === 'HOST' ? 'anti_bypass_host' : 'anti_bypass_guest';
    const text = getActiveLegalText(type);
    res.json(text);
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Error al obtener clausula anti-bypass' });
  }
});

router.get('/disclaimer/:type', (req, res) => {
  try {
    const disclaimerType = `disclaimer_${req.params.type}`;
    const text = getActiveLegalText(disclaimerType);
    res.json(text);
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Error al obtener disclaimer' });
  }
});

router.get('/:type', (req, res) => {
  try {
    const text = getActiveLegalText(req.params.type);
    res.json(text);
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Error al obtener texto legal' });
  }
});

module.exports = router;
