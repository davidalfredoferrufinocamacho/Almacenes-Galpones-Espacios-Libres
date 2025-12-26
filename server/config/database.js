const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, '../../database/app.sqlite');
const db = new Database(dbPath);

function initDatabase() {
  db.exec(`
    -- Tabla de usuarios
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('GUEST', 'HOST', 'ADMIN')),
      person_type TEXT CHECK(person_type IN ('natural', 'juridica')),
      first_name TEXT,
      last_name TEXT,
      company_name TEXT,
      ci TEXT,
      ci_extension TEXT,
      nit TEXT,
      phone TEXT,
      address TEXT,
      city TEXT,
      department TEXT,
      is_verified INTEGER DEFAULT 0,
      is_active INTEGER DEFAULT 1,
      anti_bypass_accepted INTEGER DEFAULT 0,
      anti_bypass_accepted_at TEXT,
      anti_bypass_ip TEXT,
      anti_bypass_user_agent TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    -- Tabla de espacios (listings)
    CREATE TABLE IF NOT EXISTS spaces (
      id TEXT PRIMARY KEY,
      host_id TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      space_type TEXT NOT NULL CHECK(space_type IN ('almacen', 'galpon', 'deposito', 'cuarto', 'contenedor', 'patio', 'terreno')),
      total_sqm REAL NOT NULL,
      available_sqm REAL NOT NULL,
      price_per_sqm_day REAL,
      price_per_sqm_week REAL,
      price_per_sqm_month REAL,
      price_per_sqm_quarter REAL,
      price_per_sqm_semester REAL,
      price_per_sqm_year REAL,
      is_open INTEGER DEFAULT 0,
      has_roof INTEGER DEFAULT 1,
      rain_protected INTEGER DEFAULT 1,
      dust_protected INTEGER DEFAULT 1,
      access_type TEXT CHECK(access_type IN ('libre', 'controlado')),
      has_security INTEGER DEFAULT 0,
      security_description TEXT,
      schedule TEXT,
      address TEXT NOT NULL,
      city TEXT NOT NULL,
      department TEXT NOT NULL,
      latitude REAL,
      longitude REAL,
      video_url TEXT,
      video_duration INTEGER,
      status TEXT DEFAULT 'draft' CHECK(status IN ('draft', 'published', 'paused', 'deleted')),
      is_calendar_active INTEGER DEFAULT 0,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (host_id) REFERENCES users(id)
    );

    -- Tabla de fotos de espacios
    CREATE TABLE IF NOT EXISTS space_photos (
      id TEXT PRIMARY KEY,
      space_id TEXT NOT NULL,
      url TEXT NOT NULL,
      is_primary INTEGER DEFAULT 0,
      order_index INTEGER DEFAULT 0,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (space_id) REFERENCES spaces(id)
    );

    -- Tabla de disponibilidad del calendario HOST
    CREATE TABLE IF NOT EXISTS host_availability (
      id TEXT PRIMARY KEY,
      space_id TEXT NOT NULL,
      day_of_week INTEGER,
      specific_date TEXT,
      start_time TEXT NOT NULL,
      end_time TEXT NOT NULL,
      is_blocked INTEGER DEFAULT 0,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (space_id) REFERENCES spaces(id)
    );

    -- Tabla de reservas/anticipos
    CREATE TABLE IF NOT EXISTS reservations (
      id TEXT PRIMARY KEY,
      space_id TEXT NOT NULL,
      guest_id TEXT NOT NULL,
      host_id TEXT NOT NULL,
      sqm_requested REAL NOT NULL,
      period_type TEXT NOT NULL,
      period_quantity INTEGER NOT NULL,
      total_amount REAL NOT NULL,
      deposit_percentage REAL NOT NULL,
      deposit_amount REAL NOT NULL,
      remaining_amount REAL NOT NULL,
      commission_percentage REAL NOT NULL,
      commission_amount REAL NOT NULL,
      status TEXT DEFAULT 'pending' CHECK(status IN (
        'pending',
        'PAID_DEPOSIT_ESCROW',
        'appointment_scheduled',
        'visit_completed',
        'confirmed',
        'contract_signed',
        'completed',
        'cancelled',
        'refunded'
      )),
      frozen_space_data TEXT,
      frozen_video_url TEXT,
      frozen_description TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (space_id) REFERENCES spaces(id),
      FOREIGN KEY (guest_id) REFERENCES users(id),
      FOREIGN KEY (host_id) REFERENCES users(id)
    );

    -- Tabla de pagos
    CREATE TABLE IF NOT EXISTS payments (
      id TEXT PRIMARY KEY,
      reservation_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      amount REAL NOT NULL,
      payment_type TEXT NOT NULL CHECK(payment_type IN ('deposit', 'remaining', 'extension', 'refund')),
      payment_method TEXT CHECK(payment_method IN ('card', 'qr')),
      status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'processing', 'completed', 'failed', 'refunded')),
      escrow_status TEXT CHECK(escrow_status IN ('held', 'released', 'refunded')),
      transaction_id TEXT,
      ip_address TEXT,
      user_agent TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (reservation_id) REFERENCES reservations(id),
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    -- Tabla de citas
    CREATE TABLE IF NOT EXISTS appointments (
      id TEXT PRIMARY KEY,
      reservation_id TEXT NOT NULL,
      space_id TEXT NOT NULL,
      guest_id TEXT NOT NULL,
      host_id TEXT NOT NULL,
      scheduled_date TEXT NOT NULL,
      scheduled_time TEXT NOT NULL,
      status TEXT DEFAULT 'solicitada' CHECK(status IN (
        'solicitada',
        'aceptada',
        'rechazada',
        'reprogramada',
        'realizada',
        'no_asistida'
      )),
      anti_bypass_guest_accepted INTEGER DEFAULT 0,
      anti_bypass_guest_accepted_at TEXT,
      anti_bypass_guest_ip TEXT,
      anti_bypass_guest_user_agent TEXT,
      reschedule_date TEXT,
      reschedule_time TEXT,
      reschedule_reason TEXT,
      notes TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (reservation_id) REFERENCES reservations(id),
      FOREIGN KEY (space_id) REFERENCES spaces(id),
      FOREIGN KEY (guest_id) REFERENCES users(id),
      FOREIGN KEY (host_id) REFERENCES users(id)
    );

    -- Tabla de contratos
    CREATE TABLE IF NOT EXISTS contracts (
      id TEXT PRIMARY KEY,
      reservation_id TEXT NOT NULL,
      space_id TEXT NOT NULL,
      guest_id TEXT NOT NULL,
      host_id TEXT NOT NULL,
      contract_number TEXT UNIQUE NOT NULL,
      contract_data TEXT NOT NULL,
      frozen_space_data TEXT NOT NULL,
      frozen_video_url TEXT,
      frozen_description TEXT,
      sqm REAL NOT NULL,
      period_type TEXT NOT NULL,
      period_quantity INTEGER NOT NULL,
      start_date TEXT NOT NULL,
      end_date TEXT NOT NULL,
      total_amount REAL NOT NULL,
      deposit_amount REAL NOT NULL,
      commission_amount REAL NOT NULL,
      host_payout_amount REAL NOT NULL,
      guest_signed INTEGER DEFAULT 0,
      guest_signed_at TEXT,
      guest_sign_ip TEXT,
      guest_sign_otp TEXT,
      guest_sign_user_agent TEXT,
      host_signed INTEGER DEFAULT 0,
      host_signed_at TEXT,
      host_sign_ip TEXT,
      host_sign_otp TEXT,
      host_sign_user_agent TEXT,
      status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'signed', 'active', 'completed', 'cancelled', 'extended')),
      pdf_url TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (reservation_id) REFERENCES reservations(id),
      FOREIGN KEY (space_id) REFERENCES spaces(id),
      FOREIGN KEY (guest_id) REFERENCES users(id),
      FOREIGN KEY (host_id) REFERENCES users(id)
    );

    -- Tabla de extensiones de contrato
    CREATE TABLE IF NOT EXISTS contract_extensions (
      id TEXT PRIMARY KEY,
      contract_id TEXT NOT NULL,
      original_end_date TEXT NOT NULL,
      new_end_date TEXT NOT NULL,
      extension_period_type TEXT NOT NULL,
      extension_period_quantity INTEGER NOT NULL,
      extension_amount REAL NOT NULL,
      commission_amount REAL NOT NULL,
      anti_bypass_reaffirmed INTEGER DEFAULT 1,
      status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'signed', 'active', 'completed')),
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (contract_id) REFERENCES contracts(id)
    );

    -- Tabla de facturas
    CREATE TABLE IF NOT EXISTS invoices (
      id TEXT PRIMARY KEY,
      payment_id TEXT NOT NULL,
      contract_id TEXT,
      invoice_number TEXT UNIQUE NOT NULL,
      invoice_type TEXT NOT NULL CHECK(invoice_type IN ('pdf_normal', 'siat')),
      recipient_type TEXT NOT NULL CHECK(recipient_type IN ('guest', 'host', 'platform')),
      recipient_id TEXT NOT NULL,
      amount REAL NOT NULL,
      tax_amount REAL DEFAULT 0,
      total_amount REAL NOT NULL,
      concept TEXT NOT NULL,
      nit TEXT,
      company_name TEXT,
      pdf_url TEXT,
      siat_code TEXT,
      status TEXT DEFAULT 'issued' CHECK(status IN ('issued', 'cancelled', 'void')),
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (payment_id) REFERENCES payments(id),
      FOREIGN KEY (contract_id) REFERENCES contracts(id)
    );

    -- Tabla de configuracion del sistema
    CREATE TABLE IF NOT EXISTS system_config (
      id TEXT PRIMARY KEY,
      key TEXT UNIQUE NOT NULL,
      value TEXT NOT NULL,
      description TEXT,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_by TEXT
    );

    -- Tabla de mensajes de contacto
    CREATE TABLE IF NOT EXISTS contact_messages (
      id TEXT PRIMARY KEY,
      user_id TEXT,
      name TEXT NOT NULL,
      email TEXT NOT NULL,
      subject TEXT NOT NULL,
      message TEXT NOT NULL,
      status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'read', 'responded', 'closed')),
      admin_response TEXT,
      responded_at TEXT,
      responded_by TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    -- Tabla de auditoria
    CREATE TABLE IF NOT EXISTS audit_log (
      id TEXT PRIMARY KEY,
      user_id TEXT,
      action TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id TEXT,
      old_data TEXT,
      new_data TEXT,
      ip_address TEXT,
      user_agent TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    -- Tabla de textos legales
    CREATE TABLE IF NOT EXISTS legal_texts (
      id TEXT PRIMARY KEY,
      type TEXT UNIQUE NOT NULL CHECK(type IN (
        'aviso_legal',
        'terminos_condiciones',
        'privacidad',
        'pagos_reembolsos',
        'intermediacion',
        'anti_bypass'
      )),
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      version INTEGER DEFAULT 1,
      is_active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    -- Insertar configuracion inicial
    INSERT OR IGNORE INTO system_config (id, key, value, description) VALUES
      ('cfg_deposit', 'deposit_percentage', '10', 'Porcentaje de anticipo (0-100)'),
      ('cfg_commission', 'commission_percentage', '10', 'Porcentaje de comision de la plataforma (0-100)'),
      ('cfg_video_max', 'video_max_duration', '60', 'Duracion maxima del video en segundos'),
      ('cfg_video_min', 'video_min_duration', '30', 'Duracion minima recomendada del video en segundos');

    -- Insertar textos legales iniciales
    INSERT OR IGNORE INTO legal_texts (id, type, title, content) VALUES
      ('legal_1', 'aviso_legal', 'Aviso Legal', 'Almacenes, Galpones, Espacios Libres es una plataforma de intermediacion tecnologica para el alquiler temporal de espacios en Bolivia. La plataforma NO es propietaria de los espacios y NO es parte del contrato de alquiler entre HOST y GUEST.'),
      ('legal_2', 'terminos_condiciones', 'Terminos y Condiciones', 'Al usar esta plataforma, usted acepta los presentes terminos y condiciones que regulan el uso del servicio de intermediacion tecnologica.'),
      ('legal_3', 'privacidad', 'Politica de Privacidad', 'Protegemos sus datos personales conforme a la legislacion boliviana vigente.'),
      ('legal_4', 'pagos_reembolsos', 'Politica de Pagos y Reembolsos', 'Los pagos se procesan de forma segura. El anticipo queda en escrow hasta la confirmacion del contrato. En caso de no confirmar, se realiza reembolso del 100%.'),
      ('legal_5', 'intermediacion', 'Declaracion de Intermediacion', 'Esta plataforma actua unicamente como intermediario tecnologico. El contrato de alquiler es bilateral entre HOST y GUEST.'),
      ('legal_6', 'anti_bypass', 'Clausula Anti-Bypass', 'Queda prohibido contratar directa o indirectamente fuera de la plataforma. El incumplimiento conlleva sanciones legales y economicas.');

    -- Crear usuario admin por defecto
    INSERT OR IGNORE INTO users (id, email, password, role, first_name, last_name, is_verified, is_active)
    VALUES ('admin_default', 'admin@almacenesbo.com', '$2a$10$XQxBtN6BKxT9D5uYLKPMXeOQIlDj2f9mZpKqVvH5nF8rE9tG0sMqi', 'ADMIN', 'Administrador', 'Sistema', 1, 1);
  `);

  console.log('Base de datos inicializada correctamente');
}

module.exports = { db, initDatabase };
