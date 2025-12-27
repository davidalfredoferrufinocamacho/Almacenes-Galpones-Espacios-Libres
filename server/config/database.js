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
      anti_bypass_legal_version TEXT,
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
      -- FROZEN CONTRACTUAL SNAPSHOT: Datos capturados al momento del pago del anticipo
      -- IMPORTANTE: Estos campos son INMUTABLES despues de la creacion
      -- Cualquier cambio posterior del HOST NO afecta contratos existentes
      frozen_space_data TEXT,                    -- FROZEN: JSON con titulo, tipo, ubicacion, condiciones estructurales
      frozen_video_url TEXT,                     -- FROZEN: URL del video al momento de confirmacion
      frozen_video_duration INTEGER,             -- FROZEN: Duracion validada del video (30-60s)
      frozen_description TEXT,                   -- FROZEN: Descripcion del espacio
      frozen_pricing TEXT,                       -- FROZEN: JSON con todos los precios por m2 vigentes
      frozen_deposit_percentage REAL,            -- FROZEN: Porcentaje de anticipo aplicado
      frozen_commission_percentage REAL,         -- FROZEN: Porcentaje de comision aplicado
      frozen_price_per_sqm_applied REAL,         -- FROZEN: Precio por m2 especifico usado en este contrato
      frozen_snapshot_created_at TEXT,           -- FROZEN: Timestamp exacto de creacion del snapshot
      frozen_snapshot_ip TEXT,                   -- FROZEN: IP desde donde se creo el snapshot
      frozen_snapshot_user_agent TEXT,           -- FROZEN: User-Agent del dispositivo
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
      status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'processing', 'completed', 'failed', 'refunded', 'approved', 'rejected')),
      escrow_status TEXT CHECK(escrow_status IN ('held', 'released', 'refunded')),
      transaction_id TEXT,
      ip_address TEXT,
      user_agent TEXT,
      admin_notes TEXT,
      reviewed_at TEXT,
      reviewed_by TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (reservation_id) REFERENCES reservations(id),
      FOREIGN KEY (user_id) REFERENCES users(id),
      FOREIGN KEY (reviewed_by) REFERENCES users(id)
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
      anti_bypass_guest_legal_version TEXT,
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
      -- FROZEN CONTRACTUAL SNAPSHOT: Copiados desde reservations - INMUTABLES
      frozen_space_data TEXT NOT NULL,           -- FROZEN: Datos estructurales del espacio
      frozen_video_url TEXT,                     -- FROZEN: URL del video
      frozen_video_duration INTEGER,             -- FROZEN: Duracion del video validada
      frozen_description TEXT,                   -- FROZEN: Descripcion del espacio
      frozen_pricing TEXT,                       -- FROZEN: Todos los precios vigentes
      frozen_deposit_percentage REAL,            -- FROZEN: Porcentaje anticipo
      frozen_commission_percentage REAL,         -- FROZEN: Porcentaje comision
      frozen_price_per_sqm_applied REAL,         -- FROZEN: Precio/m2 usado
      frozen_snapshot_created_at TEXT,           -- FROZEN: Cuando se creo el snapshot
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
      payment_id TEXT,
      guest_id TEXT NOT NULL,
      host_id TEXT NOT NULL,
      original_end_date TEXT NOT NULL,
      new_end_date TEXT NOT NULL,
      extension_period_type TEXT NOT NULL,
      extension_period_quantity INTEGER NOT NULL,
      extension_amount REAL NOT NULL,
      commission_amount REAL NOT NULL,
      host_payout_amount REAL NOT NULL,
      sqm REAL NOT NULL,
      price_per_sqm_applied REAL NOT NULL,
      anti_bypass_reaffirmed INTEGER DEFAULT 1,
      frozen_anti_bypass_text TEXT,
      frozen_anti_bypass_version TEXT,
      frozen_anti_bypass_legal_text_id TEXT,
      frozen_disclaimer_text TEXT,
      frozen_disclaimer_version TEXT,
      ip_address TEXT,
      user_agent TEXT,
      pdf_url TEXT,
      status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'active', 'completed')),
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (contract_id) REFERENCES contracts(id),
      FOREIGN KEY (payment_id) REFERENCES payments(id),
      FOREIGN KEY (guest_id) REFERENCES users(id),
      FOREIGN KEY (host_id) REFERENCES users(id)
    );

    -- Tabla de facturas
    CREATE TABLE IF NOT EXISTS invoices (
      id TEXT PRIMARY KEY,
      payment_id TEXT,
      contract_id TEXT NOT NULL,
      contract_extension_id TEXT,
      guest_id TEXT NOT NULL,
      host_id TEXT NOT NULL,
      invoice_number TEXT UNIQUE NOT NULL,
      invoice_type TEXT NOT NULL CHECK(invoice_type IN ('pdf_normal', 'siat', 'extension')),
      recipient_type TEXT NOT NULL CHECK(recipient_type IN ('guest', 'host', 'platform')),
      recipient_id TEXT NOT NULL,
      amount REAL NOT NULL,
      tax_amount REAL DEFAULT 0,
      total_amount REAL NOT NULL,
      commission_amount REAL NOT NULL,
      host_payout_amount REAL NOT NULL,
      concept TEXT NOT NULL,
      nit TEXT,
      company_name TEXT,
      pdf_url TEXT,
      siat_code TEXT,
      frozen_disclaimer_text TEXT,
      frozen_disclaimer_version TEXT,
      frozen_disclaimer_legal_text_id TEXT,
      status TEXT DEFAULT 'issued' CHECK(status IN ('issued', 'cancelled', 'void')),
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (payment_id) REFERENCES payments(id),
      FOREIGN KEY (contract_id) REFERENCES contracts(id),
      FOREIGN KEY (contract_extension_id) REFERENCES contract_extensions(id),
      FOREIGN KEY (guest_id) REFERENCES users(id),
      FOREIGN KEY (host_id) REFERENCES users(id)
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

    -- Tabla de OTPs pendientes (SEGURIDAD: solo hash, con expiracion)
    CREATE TABLE IF NOT EXISTS pending_otps (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      contract_id TEXT NOT NULL,
      otp_hash TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      used INTEGER DEFAULT 0,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id),
      FOREIGN KEY (contract_id) REFERENCES contracts(id)
    );

    -- Tabla de textos legales (versionada)
    CREATE TABLE IF NOT EXISTS legal_texts (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL CHECK(type IN (
        'aviso_legal',
        'terminos_condiciones',
        'privacidad',
        'pagos_reembolsos',
        'intermediacion',
        'anti_bypass_guest',
        'anti_bypass_host',
        'disclaimer_contrato',
        'disclaimer_firma',
        'disclaimer_factura',
        'liability_limitation',
        'applicable_law'
      )),
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      version TEXT NOT NULL DEFAULT '1.0',
      is_active INTEGER DEFAULT 0,
      effective_date TEXT,
      created_by TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (created_by) REFERENCES users(id)
    );

    -- Indice para buscar texto activo por tipo
    CREATE INDEX IF NOT EXISTS idx_legal_texts_type_active ON legal_texts(type, is_active);

    -- Insertar configuracion inicial
    INSERT OR IGNORE INTO system_config (id, key, value, description) VALUES
      ('cfg_deposit', 'deposit_percentage', '10', 'Porcentaje de anticipo (0-100)'),
      ('cfg_commission', 'commission_percentage', '10', 'Porcentaje de comision de la plataforma (0-100)'),
      ('cfg_video_max', 'video_max_duration', '60', 'Duracion maxima del video en segundos'),
      ('cfg_video_min', 'video_min_duration', '30', 'Duracion minima recomendada del video en segundos');

    -- Insertar textos legales iniciales (version 1.0, activos)
    INSERT OR IGNORE INTO legal_texts (id, type, title, content, version, is_active, effective_date) VALUES
      ('legal_aviso_v1', 'aviso_legal', 'Aviso Legal', 'Almacenes, Galpones, Espacios Libres es una plataforma de intermediacion tecnologica para el alquiler temporal de espacios en Bolivia. La plataforma NO es propietaria de los espacios y NO es parte del contrato de alquiler entre HOST y GUEST. Nos reservamos el derecho de modificar estos terminos en cualquier momento.', '1.0', 1, '2025-01-01'),
      ('legal_terminos_v1', 'terminos_condiciones', 'Terminos y Condiciones', 'Al usar esta plataforma, usted acepta los presentes terminos y condiciones que regulan el uso del servicio de intermediacion tecnologica. El usuario se compromete a proporcionar informacion veridica y a cumplir con las obligaciones contractuales derivadas del uso de la plataforma.', '1.0', 1, '2025-01-01'),
      ('legal_privacidad_v1', 'privacidad', 'Politica de Privacidad', 'Protegemos sus datos personales conforme a la legislacion boliviana vigente. Recopilamos unicamente la informacion necesaria para prestar el servicio. Sus datos no seran compartidos con terceros sin su consentimiento expreso, salvo requerimiento judicial.', '1.0', 1, '2025-01-01'),
      ('legal_pagos_v1', 'pagos_reembolsos', 'Politica de Pagos y Reembolsos', 'Los pagos se procesan de forma segura mediante sistema escrow. El anticipo queda retenido hasta la confirmacion del contrato bilateral. En caso de cancelacion antes de la firma del contrato, se realiza reembolso del 100% del anticipo. Una vez firmado el contrato por ambas partes, NO procede reembolso del anticipo.', '1.0', 1, '2025-01-01'),
      ('legal_intermediacion_v1', 'intermediacion', 'Declaracion de Intermediacion Tecnologica', 'Esta plataforma actua UNICAMENTE como intermediario tecnologico facilitando el contacto entre oferentes (HOST) y demandantes (GUEST) de espacios para almacenamiento temporal. El contrato de alquiler es bilateral entre HOST y GUEST. La plataforma no asume responsabilidad por las condiciones del espacio ni por el cumplimiento de las obligaciones contractuales entre las partes.', '1.0', 1, '2025-01-01'),
      ('legal_antibypass_guest_v1', 'anti_bypass_guest', 'Clausula Anti-Bypass para GUEST', 'CLAUSULA ANTI-BYPASS. El GUEST y el HOST reconocen y aceptan que la plataforma "Almacenes, Galpones, Espacios Libres" actua como intermediario tecnologico exclusivo en la relacion originada entre ambas partes. Queda expresamente prohibido que el GUEST y/o el HOST, antes, durante o despues de la visita, reserva, contratacion o vigencia del alquiler, realicen acuerdos directos, indirectos o simulados fuera de la plataforma, con el fin de evitar el pago de comisiones, tarifas o controles del sistema. El incumplimiento de esta clausula dara lugar a: Bloqueo inmediato de la cuenta, Cancelacion de contratos activos, Retencion de pagos en escrow, Perdida de beneficios, y Acciones legales conforme a la legislacion vigente del Estado Plurinacional de Bolivia. Esta clausula forma parte integral de las condiciones aceptadas digitalmente por ambas partes.', '1.0', 1, '2025-01-01'),
      ('legal_antibypass_host_v1', 'anti_bypass_host', 'Clausula Anti-Bypass para HOST', 'CLAUSULA ANTI-BYPASS. El GUEST y el HOST reconocen y aceptan que la plataforma "Almacenes, Galpones, Espacios Libres" actua como intermediario tecnologico exclusivo en la relacion originada entre ambas partes. Queda expresamente prohibido que el GUEST y/o el HOST, antes, durante o despues de la visita, reserva, contratacion o vigencia del alquiler, realicen acuerdos directos, indirectos o simulados fuera de la plataforma, con el fin de evitar el pago de comisiones, tarifas o controles del sistema. El incumplimiento de esta clausula dara lugar a: Bloqueo inmediato de la cuenta, Cancelacion de contratos activos, Retencion de pagos en escrow, Perdida de beneficios, y Acciones legales conforme a la legislacion vigente del Estado Plurinacional de Bolivia. Esta clausula forma parte integral de las condiciones aceptadas digitalmente por ambas partes.', '1.0', 1, '2025-01-01'),
      ('legal_disclaimer_contrato_v1', 'disclaimer_contrato', 'Disclaimer de Contrato', '[CONTRATO DIGITAL] Este documento constituye un contrato digital bilateral entre HOST y GUEST, facilitado por la plataforma Almacenes, Galpones, Espacios Libres en su calidad de intermediario tecnologico. La plataforma no es parte del contrato y no asume responsabilidad por su cumplimiento.', '1.0', 1, '2025-01-01'),
      ('legal_disclaimer_firma_v1', 'disclaimer_firma', 'Disclaimer de Firma Electronica', '[FIRMA ELECTRONICA - DEMO] Esta firma utiliza codigo OTP y registro de IP/timestamp como metodo de autenticacion. Para cumplimiento total de la Ley 164 de Telecomunicaciones de Bolivia, se recomienda implementar firma digital certificada por entidad autorizada.', '1.0', 1, '2025-01-01'),
      ('legal_disclaimer_factura_v1', 'disclaimer_factura', 'Disclaimer de Factura', '[FACTURA NO FISCAL] Este documento es una factura interna de la plataforma. NO tiene validez fiscal ante el Servicio de Impuestos Nacionales (SIN). Integracion SIAT pendiente de implementacion.', '1.0', 1, '2025-01-01'),
      ('legal_liability_v1', 'liability_limitation', 'Limitacion de Responsabilidad', 'La plataforma Almacenes, Galpones, Espacios Libres actua unicamente como intermediario tecnologico y NO es parte del contrato de alquiler. La plataforma no garantiza la veracidad de la informacion proporcionada por los usuarios, las condiciones fisicas de los espacios, ni el cumplimiento de las obligaciones contractuales entre HOST y GUEST. La responsabilidad de la plataforma se limita exclusivamente al correcto funcionamiento del sistema de intermediacion.', '1.0', 1, '2025-01-01'),
      ('legal_applicable_law_v1', 'applicable_law', 'Ley Aplicable', 'Este contrato se rige por la legislacion boliviana, incluyendo pero no limitado a: Codigo Civil Boliviano, Codigo de Comercio, Ley 164 de Telecomunicaciones, y normativa aplicable del Servicio de Impuestos Nacionales. Para cualquier controversia, las partes se someten a la jurisdiccion de los tribunales ordinarios de Bolivia.', '1.0', 1, '2025-01-01');

    -- Tabla de plantillas de notificaciones
    CREATE TABLE IF NOT EXISTS notification_templates (
      id TEXT PRIMARY KEY,
      event_type TEXT NOT NULL,
      channel TEXT NOT NULL DEFAULT 'email' CHECK(channel IN ('email', 'sms', 'whatsapp')),
      subject TEXT,
      body TEXT NOT NULL,
      is_active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    -- Indice para buscar plantilla activa por evento y canal
    CREATE INDEX IF NOT EXISTS idx_notification_templates_event ON notification_templates(event_type, channel, is_active);

    -- Tabla de log de notificaciones enviadas
    CREATE TABLE IF NOT EXISTS notification_log (
      id TEXT PRIMARY KEY,
      recipient_id TEXT NOT NULL,
      recipient_email TEXT,
      event_type TEXT NOT NULL,
      channel TEXT NOT NULL,
      template_id TEXT,
      subject TEXT,
      body TEXT,
      status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'sent', 'failed')),
      ip_address TEXT,
      user_agent TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (recipient_id) REFERENCES users(id),
      FOREIGN KEY (template_id) REFERENCES notification_templates(id)
    );

    -- Crear usuario admin por defecto
    INSERT OR IGNORE INTO users (id, email, password, role, first_name, last_name, is_verified, is_active)
    VALUES ('admin_default', 'admin@almacenes-galpones-espacios-libres.com', '$2a$10$XQxBtN6BKxT9D5uYLKPMXeOQIlDj2f9mZpKqVvH5nF8rE9tG0sMqi', 'ADMIN', 'Administrador', 'Sistema', 1, 1);

    -- Insertar plantillas de notificacion por defecto
    INSERT OR IGNORE INTO notification_templates (id, event_type, channel, subject, body, is_active) VALUES
      ('tpl_apt_requested', 'appointment_requested', 'email', 'Nueva solicitud de cita - {{space_title}}', 'Hola {{recipient_name}},\n\nHas recibido una nueva solicitud de cita para tu espacio "{{space_title}}".\n\nFecha: {{scheduled_date}}\nHora: {{scheduled_time}}\n\nIngresa a la plataforma para aceptar o rechazar la solicitud.\n\nSaludos,\n{{platform_name}}', 1),
      ('tpl_apt_accepted', 'appointment_accepted', 'email', 'Cita confirmada - {{space_title}}', 'Hola {{recipient_name}},\n\nTu cita ha sido confirmada.\n\nEspacio: {{space_title}}\nFecha: {{scheduled_date}}\nHora: {{scheduled_time}}\n\nRecuerda asistir puntualmente.\n\nSaludos,\n{{platform_name}}', 1),
      ('tpl_apt_rejected', 'appointment_rejected', 'email', 'Cita rechazada - {{space_title}}', 'Hola {{recipient_name}},\n\nLamentamos informarte que tu cita ha sido rechazada.\n\nEspacio: {{space_title}}\nFecha solicitada: {{scheduled_date}}\nMotivo: {{reason}}\n\nPuedes solicitar una nueva cita en otro horario.\n\nSaludos,\n{{platform_name}}', 1),
      ('tpl_apt_rescheduled', 'appointment_rescheduled', 'email', 'Reprogramacion de cita - {{space_title}}', 'Hola {{recipient_name}},\n\nEl HOST ha propuesto reprogramar tu cita.\n\nEspacio: {{space_title}}\nFecha original: {{original_date}} {{original_time}}\nNueva fecha propuesta: {{new_date}} {{new_time}}\nMotivo: {{reason}}\n\nIngresa a la plataforma para aceptar o rechazar la reprogramacion.\n\nSaludos,\n{{platform_name}}', 1),
      ('tpl_deposit_paid', 'deposit_paid', 'email', 'Anticipo pagado exitosamente', 'Hola {{recipient_name}},\n\nTu pago de anticipo ha sido procesado exitosamente.\n\nEspacio: {{space_title}}\nMonto pagado: Bs. {{amount}}\nMonto total: Bs. {{total_amount}}\nSaldo pendiente: Bs. {{remaining_amount}}\n\nTu anticipo queda retenido en escrow hasta la confirmacion del contrato.\n\nSaludos,\n{{platform_name}}', 1),
      ('tpl_deposit_received', 'deposit_received', 'email', 'Anticipo recibido - {{space_title}}', 'Hola {{recipient_name}},\n\nHas recibido un anticipo por tu espacio "{{space_title}}".\n\nMonto: Bs. {{amount}}\n\nEl monto queda retenido en escrow hasta la firma del contrato.\n\nSaludos,\n{{platform_name}}', 1),
      ('tpl_remaining_paid', 'remaining_paid', 'email', 'Pago de saldo completado', 'Hola {{recipient_name}},\n\nTu pago de saldo ha sido procesado exitosamente.\n\nEspacio: {{space_title}}\nMonto pagado: Bs. {{amount}}\nTotal del contrato: Bs. {{total_amount}}\n\nSaludos,\n{{platform_name}}', 1),
      ('tpl_remaining_received', 'remaining_received', 'email', 'Saldo recibido - {{space_title}}', 'Hola {{recipient_name}},\n\nHas recibido el pago del saldo por tu espacio "{{space_title}}".\n\nMonto: Bs. {{amount}}\n\nSaludos,\n{{platform_name}}', 1),
      ('tpl_contract_created', 'contract_created', 'email', 'Contrato generado - {{contract_number}}', 'Hola {{recipient_name}},\n\nSe ha generado un contrato para el espacio "{{space_title}}".\n\nNumero de contrato: {{contract_number}}\nVigencia: {{start_date}} al {{end_date}}\nMonto total: Bs. {{total_amount}}\n\nIngresa a la plataforma para revisar y firmar el contrato.\n\nSaludos,\n{{platform_name}}', 1),
      ('tpl_contract_signed', 'contract_signed', 'email', 'Contrato firmado - {{contract_number}}', 'Hola {{recipient_name}},\n\nEl {{signer_role}} ha firmado el contrato {{contract_number}} para el espacio "{{space_title}}".\n\nEstado de firmas:\n- GUEST: {{guest_signed}}\n- HOST: {{host_signed}}\n\nSaludos,\n{{platform_name}}', 1),
      ('tpl_refund_processed', 'refund_processed', 'email', 'Reembolso procesado', 'Hola {{recipient_name}},\n\nTu solicitud de reembolso ha sido procesada.\n\nEspacio: {{space_title}}\nMonto: Bs. {{amount}}\nEstado: {{status}}\n\nSaludos,\n{{platform_name}}', 1),
      ('tpl_invoice_generated', 'invoice_generated', 'email', 'Factura generada - {{invoice_number}}', 'Hola {{recipient_name}},\n\nSe ha generado una factura para tu contrato.\n\nNumero de factura: {{invoice_number}}\nContrato: {{contract_number}}\nMonto total: Bs. {{total_amount}}\n\nPuedes descargar el PDF desde la plataforma.\n\nSaludos,\n{{platform_name}}', 1);
  `);

  // Migraciones para columnas faltantes en bases de datos existentes
  const migrations = [
    { table: 'users', column: 'anti_bypass_legal_version', type: 'TEXT' },
    { table: 'users', column: 'anti_bypass_ip', type: 'TEXT' },
    { table: 'users', column: 'anti_bypass_user_agent', type: 'TEXT' }
  ];

  for (const m of migrations) {
    try {
      const cols = db.prepare(`PRAGMA table_info(${m.table})`).all();
      if (!cols.find(c => c.name === m.column)) {
        db.exec(`ALTER TABLE ${m.table} ADD COLUMN ${m.column} ${m.type}`);
        console.log(`Migracion: agregada columna ${m.column} a ${m.table}`);
      }
    } catch (e) {
      console.log(`Migracion ${m.column}: ${e.message}`);
    }
  }

  console.log('Base de datos inicializada correctamente');
}

module.exports = { db, initDatabase };
