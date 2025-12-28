require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const path = require('path');
const rateLimit = require('express-rate-limit');

const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/users');
const spaceRoutes = require('./routes/spaces');
const appointmentRoutes = require('./routes/appointments');
const paymentRoutes = require('./routes/payments');
const contractRoutes = require('./routes/contracts');
const invoiceRoutes = require('./routes/invoices');
const adminRoutes = require('./routes/admin');
const legalRoutes = require('./routes/legal');
const contactRoutes = require('./routes/contact');
const ownerRoutes = require('./routes/owner');
const clientRoutes = require('./routes/client');
const backupRoutes = require('./routes/backup');

const { initDatabase } = require('./config/database');
const { initFrozenDataTriggers } = require('./utils/frozenDataProtection');
const { startBackupScheduler } = require('./services/backupService');

const app = express();
const PORT = process.env.PORT || 5000;

app.set('trust proxy', 1);

initDatabase();
initFrozenDataTriggers();

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: { error: 'Demasiadas solicitudes, intente mas tarde' }
});

app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false
}));
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use('/api', limiter);

app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/spaces', spaceRoutes);
app.use('/api/appointments', appointmentRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/contracts', contractRoutes);
app.use('/api/invoices', invoiceRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/legal', legalRoutes);
app.use('/api/contact', contactRoutes);
app.use('/api/owner', ownerRoutes);
app.use('/api/client', clientRoutes);
app.use('/api/backup', backupRoutes);

app.use(express.static(path.join(__dirname, '../client/dist'), {
  etag: false,
  setHeaders: (res, path) => {
    if (path.endsWith('.html')) {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
    }
  }
}));

app.get('*', (req, res) => {
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.sendFile(path.join(__dirname, '../client/dist/index.html'));
});

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Error interno del servidor' });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Servidor corriendo en http://0.0.0.0:${PORT}`);
  startBackupScheduler();
});
