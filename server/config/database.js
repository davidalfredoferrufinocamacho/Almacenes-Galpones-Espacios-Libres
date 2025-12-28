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
      is_blocked INTEGER DEFAULT 0,
      anti_bypass_accepted INTEGER DEFAULT 0,
      anti_bypass_accepted_at TEXT,
      anti_bypass_legal_text_id TEXT,
      anti_bypass_legal_version TEXT,
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
      min_rental_days INTEGER DEFAULT 1,
      max_rental_days INTEGER,
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
      payment_method TEXT,
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
      category TEXT DEFAULT 'general' CHECK(category IN ('general', 'consulta', 'soporte', 'reclamo', 'sugerencia', 'comercial')),
      priority TEXT DEFAULT 'normal' CHECK(priority IN ('baja', 'normal', 'alta', 'urgente')),
      status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'read', 'responded', 'closed')),
      admin_notes TEXT,
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
      category TEXT DEFAULT 'legal',
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

    -- Crear usuario admin por defecto (password: Admin123!)
    INSERT OR IGNORE INTO users (id, email, password, role, first_name, last_name, is_verified, is_active, is_super_admin)
    VALUES ('admin_default', 'admin@almacenes-galpones-espacios-libres.com', '$2a$10$c.P0iMto6HighxEuykK2cOelSX1GKo1XG8TKGi.xUx6bBni.5sT5u', 'ADMIN', 'Administrador', 'Sistema', 1, 1, 1);

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

  // Crear tabla de categorias legales
  db.exec(`
    CREATE TABLE IF NOT EXISTS legal_categories (
      id TEXT PRIMARY KEY,
      key TEXT UNIQUE NOT NULL,
      label TEXT NOT NULL,
      is_system INTEGER DEFAULT 0,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    INSERT OR IGNORE INTO legal_categories (id, key, label, is_system) VALUES
      ('cat_legal', 'legal', 'Legal', 1),
      ('cat_informacion', 'informacion', 'Informacion', 1);
  `);

  // Agregar config de footer y contacto
  db.exec(`
    INSERT OR IGNORE INTO system_config (id, key, value, description) VALUES
      ('cfg_footer_title', 'footer_title', 'Almacenes, Galpones, Espacios Libres', 'Titulo del footer'),
      ('cfg_footer_text', 'footer_text', 'Plataforma de intermediacion tecnologica para alquiler de espacios en Bolivia', 'Texto del footer'),
      ('cfg_contact_description', 'contact_description', 'Almacenes, Galpones, Espacios Libres es una plataforma de intermediacion tecnologica para el alquiler temporal de espacios en Bolivia.', 'Descripcion de la plataforma en pagina de contacto'),
      ('cfg_contact_notice', 'contact_notice', 'Este formulario es el unico canal oficial de contacto con la plataforma. No se permite contacto directo entre HOST y GUEST.', 'Aviso sobre canal de contacto'),
      ('cfg_contact_hours', 'contact_hours', 'Lunes a Viernes, 9:00 - 18:00', 'Horario de atencion'),
      ('cfg_contact_response_time', 'contact_response_time', '24-48 horas habiles', 'Tiempo de respuesta');
  `);

  // Tablas de Contabilidad Profesional Boliviana
  db.exec(`
    -- Socios/Accionistas
    CREATE TABLE IF NOT EXISTS shareholders (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      document_type TEXT CHECK(document_type IN ('ci', 'nit', 'pasaporte')),
      document_number TEXT,
      email TEXT,
      phone TEXT,
      share_percentage REAL NOT NULL DEFAULT 0,
      capital_contributed REAL DEFAULT 0,
      status TEXT DEFAULT 'active' CHECK(status IN ('active', 'inactive')),
      joined_at TEXT DEFAULT CURRENT_TIMESTAMP,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    -- Asientos Contables (Libro Diario)
    CREATE TABLE IF NOT EXISTS accounting_entries (
      id TEXT PRIMARY KEY,
      entry_date TEXT NOT NULL,
      entry_number INTEGER,
      description TEXT NOT NULL,
      entry_type TEXT NOT NULL CHECK(entry_type IN ('income', 'expense', 'transfer', 'tax', 'dividend', 'capital', 'adjustment')),
      debit_account TEXT NOT NULL,
      credit_account TEXT NOT NULL,
      amount REAL NOT NULL,
      taxable_base REAL DEFAULT 0,
      iva_amount REAL DEFAULT 0,
      it_amount REAL DEFAULT 0,
      reference_type TEXT,
      reference_id TEXT,
      is_reconciled INTEGER DEFAULT 0,
      reconciled_at TEXT,
      reconciled_by TEXT,
      notes TEXT,
      created_by TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    -- Períodos Fiscales
    CREATE TABLE IF NOT EXISTS tax_periods (
      id TEXT PRIMARY KEY,
      period_type TEXT NOT NULL CHECK(period_type IN ('monthly', 'quarterly', 'semester', 'annual')),
      tax_type TEXT NOT NULL CHECK(tax_type IN ('IVA', 'IT', 'IUE', 'RC-IVA')),
      year INTEGER NOT NULL,
      month INTEGER,
      quarter INTEGER,
      semester INTEGER,
      start_date TEXT NOT NULL,
      end_date TEXT NOT NULL,
      taxable_base REAL DEFAULT 0,
      tax_rate REAL NOT NULL,
      tax_calculated REAL DEFAULT 0,
      tax_credits REAL DEFAULT 0,
      tax_due REAL DEFAULT 0,
      tax_paid REAL DEFAULT 0,
      status TEXT DEFAULT 'open' CHECK(status IN ('open', 'calculated', 'declared', 'paid', 'closed')),
      declaration_number TEXT,
      declaration_date TEXT,
      due_date TEXT,
      notes TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    -- Pagos de Impuestos
    CREATE TABLE IF NOT EXISTS tax_payments (
      id TEXT PRIMARY KEY,
      tax_period_id TEXT NOT NULL,
      payment_date TEXT NOT NULL,
      amount REAL NOT NULL,
      payment_method TEXT,
      bank_name TEXT,
      transaction_number TEXT,
      voucher_number TEXT,
      notes TEXT,
      created_by TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (tax_period_id) REFERENCES tax_periods(id)
    );

    -- Distribución de Dividendos
    CREATE TABLE IF NOT EXISTS dividend_distributions (
      id TEXT PRIMARY KEY,
      distribution_date TEXT NOT NULL,
      fiscal_year INTEGER NOT NULL,
      total_profit REAL NOT NULL,
      legal_reserve REAL DEFAULT 0,
      distributable_profit REAL NOT NULL,
      total_distributed REAL NOT NULL,
      status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'approved', 'paid', 'cancelled')),
      approved_by TEXT,
      approved_at TEXT,
      notes TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    -- Detalle de Dividendos por Socio
    CREATE TABLE IF NOT EXISTS dividend_details (
      id TEXT PRIMARY KEY,
      distribution_id TEXT NOT NULL,
      shareholder_id TEXT NOT NULL,
      share_percentage REAL NOT NULL,
      gross_amount REAL NOT NULL,
      withholding_tax REAL DEFAULT 0,
      net_amount REAL NOT NULL,
      payment_date TEXT,
      payment_method TEXT,
      status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'paid')),
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (distribution_id) REFERENCES dividend_distributions(id),
      FOREIGN KEY (shareholder_id) REFERENCES shareholders(id)
    );

    -- Movimientos de Capital
    CREATE TABLE IF NOT EXISTS capital_transactions (
      id TEXT PRIMARY KEY,
      transaction_date TEXT NOT NULL,
      transaction_type TEXT NOT NULL CHECK(transaction_type IN ('aporte', 'retiro', 'aumento', 'reduccion', 'reserva')),
      shareholder_id TEXT,
      amount REAL NOT NULL,
      description TEXT,
      document_reference TEXT,
      balance_after REAL,
      created_by TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (shareholder_id) REFERENCES shareholders(id)
    );

    -- Configuración de cuentas contables
    CREATE TABLE IF NOT EXISTS chart_of_accounts (
      id TEXT PRIMARY KEY,
      code TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      account_type TEXT NOT NULL CHECK(account_type IN ('asset', 'liability', 'equity', 'income', 'expense')),
      parent_code TEXT,
      is_active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    -- Tabla de Métodos de Pago Dinámicos
    CREATE TABLE IF NOT EXISTS payment_methods (
      id TEXT PRIMARY KEY,
      code TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      instructions TEXT,
      icon TEXT,
      is_active INTEGER DEFAULT 1,
      order_index INTEGER DEFAULT 0,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    -- Insertar métodos de pago por defecto
    INSERT OR IGNORE INTO payment_methods (id, code, name, description, icon, is_active, order_index) VALUES
      ('pm_card', 'card', 'Tarjeta de Credito/Debito', 'Pago con tarjeta de credito o debito a traves de pasarela segura', 'credit-card', 1, 1),
      ('pm_qr', 'qr', 'Codigo QR', 'Pago mediante escaneo de codigo QR desde su aplicacion bancaria', 'qr-code', 1, 2);

    -- Insertar plan de cuentas básico boliviano
    INSERT OR IGNORE INTO chart_of_accounts (id, code, name, account_type) VALUES
      ('acc_1000', '1000', 'ACTIVO', 'asset'),
      ('acc_1100', '1100', 'Activo Corriente', 'asset'),
      ('acc_1110', '1110', 'Caja y Bancos', 'asset'),
      ('acc_1111', '1111', 'Caja General', 'asset'),
      ('acc_1112', '1112', 'Bancos', 'asset'),
      ('acc_1120', '1120', 'Cuentas por Cobrar', 'asset'),
      ('acc_1130', '1130', 'Credito Fiscal IVA', 'asset'),
      ('acc_2000', '2000', 'PASIVO', 'liability'),
      ('acc_2100', '2100', 'Pasivo Corriente', 'liability'),
      ('acc_2110', '2110', 'Cuentas por Pagar', 'liability'),
      ('acc_2120', '2120', 'Debito Fiscal IVA', 'liability'),
      ('acc_2130', '2130', 'IT por Pagar', 'liability'),
      ('acc_2140', '2140', 'IUE por Pagar', 'liability'),
      ('acc_2150', '2150', 'Dividendos por Pagar', 'liability'),
      ('acc_3000', '3000', 'PATRIMONIO', 'equity'),
      ('acc_3100', '3100', 'Capital Social', 'equity'),
      ('acc_3200', '3200', 'Reserva Legal', 'equity'),
      ('acc_3300', '3300', 'Resultados Acumulados', 'equity'),
      ('acc_3400', '3400', 'Resultado del Ejercicio', 'equity'),
      ('acc_4000', '4000', 'INGRESOS', 'income'),
      ('acc_4100', '4100', 'Ingresos por Comisiones', 'income'),
      ('acc_4200', '4200', 'Otros Ingresos', 'income'),
      ('acc_5000', '5000', 'GASTOS', 'expense'),
      ('acc_5100', '5100', 'Gastos Operativos', 'expense'),
      ('acc_5200', '5200', 'Gastos Administrativos', 'expense'),
      ('acc_5300', '5300', 'Gastos Financieros', 'expense'),
      ('acc_5400', '5400', 'Impuestos y Tasas', 'expense');
  `);

  // NUEVAS FUNCIONALIDADES PROFESIONALES
  db.exec(`
    -- #7: Roles y Permisos de Administrador
    CREATE TABLE IF NOT EXISTS admin_roles (
      id TEXT PRIMARY KEY,
      name TEXT UNIQUE NOT NULL,
      description TEXT,
      is_system INTEGER DEFAULT 0,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS admin_permissions (
      id TEXT PRIMARY KEY,
      role_id TEXT NOT NULL,
      section TEXT NOT NULL,
      can_view INTEGER DEFAULT 0,
      can_create INTEGER DEFAULT 0,
      can_edit INTEGER DEFAULT 0,
      can_delete INTEGER DEFAULT 0,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (role_id) REFERENCES admin_roles(id)
    );

    CREATE TABLE IF NOT EXISTS admin_users (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL UNIQUE,
      role_id TEXT NOT NULL,
      mfa_enabled INTEGER DEFAULT 0,
      mfa_secret TEXT,
      last_login TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id),
      FOREIGN KEY (role_id) REFERENCES admin_roles(id)
    );

    -- Insertar roles por defecto
    INSERT OR IGNORE INTO admin_roles (id, name, description, is_system) VALUES
      ('role_super_admin', 'Super Admin', 'Acceso total a todas las secciones', 1),
      ('role_admin', 'Admin', 'Administrador con acceso a la mayoria de secciones', 1),
      ('role_moderator', 'Moderador', 'Modera contenido, disputas y verificaciones', 1),
      ('role_accountant', 'Contable', 'Acceso a pagos, facturas y contabilidad', 1),
      ('role_support', 'Soporte', 'Atencion al cliente y mensajes', 1);

    -- #8: Verificacion de Hosts
    CREATE TABLE IF NOT EXISTS host_verifications (
      id TEXT PRIMARY KEY,
      host_id TEXT NOT NULL,
      document_type TEXT NOT NULL CHECK(document_type IN ('ci', 'pasaporte', 'nit', 'comprobante_domicilio', 'licencia_actividad')),
      document_url TEXT NOT NULL,
      document_number TEXT,
      status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'in_review', 'approved', 'rejected')),
      reviewed_by TEXT,
      reviewed_at TEXT,
      review_notes TEXT,
      rejection_reason TEXT,
      expires_at TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (host_id) REFERENCES users(id),
      FOREIGN KEY (reviewed_by) REFERENCES users(id)
    );

    -- #3: Gestion de Disputas/Reclamos
    CREATE TABLE IF NOT EXISTS disputes (
      id TEXT PRIMARY KEY,
      dispute_number TEXT UNIQUE NOT NULL,
      reservation_id TEXT,
      contract_id TEXT,
      payment_id TEXT,
      complainant_id TEXT NOT NULL,
      complainant_type TEXT NOT NULL CHECK(complainant_type IN ('guest', 'host')),
      respondent_id TEXT NOT NULL,
      category TEXT NOT NULL CHECK(category IN ('payment', 'property_condition', 'cancellation', 'damage', 'service', 'other')),
      subject TEXT NOT NULL,
      description TEXT NOT NULL,
      evidence_urls TEXT,
      status TEXT DEFAULT 'open' CHECK(status IN ('open', 'in_review', 'awaiting_response', 'resolved_favor_guest', 'resolved_favor_host', 'resolved_mutual', 'closed', 'escalated')),
      priority TEXT DEFAULT 'medium' CHECK(priority IN ('low', 'medium', 'high', 'urgent')),
      assigned_to TEXT,
      resolution_notes TEXT,
      resolution_amount REAL,
      resolved_at TEXT,
      resolved_by TEXT,
      ip_address TEXT,
      user_agent TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (reservation_id) REFERENCES reservations(id),
      FOREIGN KEY (contract_id) REFERENCES contracts(id),
      FOREIGN KEY (payment_id) REFERENCES payments(id),
      FOREIGN KEY (complainant_id) REFERENCES users(id),
      FOREIGN KEY (respondent_id) REFERENCES users(id),
      FOREIGN KEY (assigned_to) REFERENCES users(id),
      FOREIGN KEY (resolved_by) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS dispute_comments (
      id TEXT PRIMARY KEY,
      dispute_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      user_type TEXT NOT NULL CHECK(user_type IN ('admin', 'guest', 'host')),
      comment TEXT NOT NULL,
      is_internal INTEGER DEFAULT 0,
      attachment_url TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (dispute_id) REFERENCES disputes(id),
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    -- #9: Campanas de Email/SMS
    CREATE TABLE IF NOT EXISTS campaigns (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      campaign_type TEXT NOT NULL CHECK(campaign_type IN ('email', 'sms', 'both')),
      subject TEXT,
      content TEXT NOT NULL,
      template_variables TEXT,
      target_audience TEXT NOT NULL CHECK(target_audience IN ('all', 'guests', 'hosts', 'inactive', 'new_users', 'custom')),
      custom_filter TEXT,
      status TEXT DEFAULT 'draft' CHECK(status IN ('draft', 'scheduled', 'sending', 'sent', 'cancelled')),
      scheduled_at TEXT,
      sent_at TEXT,
      total_recipients INTEGER DEFAULT 0,
      sent_count INTEGER DEFAULT 0,
      failed_count INTEGER DEFAULT 0,
      created_by TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (created_by) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS campaign_recipients (
      id TEXT PRIMARY KEY,
      campaign_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      email TEXT,
      phone TEXT,
      status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'sent', 'failed', 'opened', 'clicked')),
      sent_at TEXT,
      error_message TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (campaign_id) REFERENCES campaigns(id),
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    -- A: Panel de Propietarios (campos adicionales en users)
    -- B: Estados de Cuenta Automaticos
    CREATE TABLE IF NOT EXISTS host_statements (
      id TEXT PRIMARY KEY,
      host_id TEXT NOT NULL,
      statement_number TEXT UNIQUE NOT NULL,
      period_start TEXT NOT NULL,
      period_end TEXT NOT NULL,
      total_bookings INTEGER DEFAULT 0,
      gross_income REAL DEFAULT 0,
      commission_deducted REAL DEFAULT 0,
      taxes_deducted REAL DEFAULT 0,
      net_payout REAL DEFAULT 0,
      payout_status TEXT DEFAULT 'pending' CHECK(payout_status IN ('pending', 'processing', 'paid', 'failed')),
      payout_date TEXT,
      payout_reference TEXT,
      pdf_url TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (host_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS host_statement_details (
      id TEXT PRIMARY KEY,
      statement_id TEXT NOT NULL,
      contract_id TEXT,
      reservation_id TEXT,
      description TEXT NOT NULL,
      amount REAL NOT NULL,
      commission REAL DEFAULT 0,
      net_amount REAL NOT NULL,
      transaction_date TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (statement_id) REFERENCES host_statements(id),
      FOREIGN KEY (contract_id) REFERENCES contracts(id),
      FOREIGN KEY (reservation_id) REFERENCES reservations(id)
    );

    -- C: Gestion de Depositos de Seguridad
    CREATE TABLE IF NOT EXISTS security_deposits (
      id TEXT PRIMARY KEY,
      reservation_id TEXT NOT NULL,
      contract_id TEXT,
      guest_id TEXT NOT NULL,
      host_id TEXT NOT NULL,
      amount REAL NOT NULL,
      status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'held', 'partially_released', 'released', 'claimed', 'refunded')),
      held_at TEXT,
      release_amount REAL,
      released_at TEXT,
      claim_amount REAL,
      claim_reason TEXT,
      claim_evidence_urls TEXT,
      claimed_at TEXT,
      processed_by TEXT,
      processed_at TEXT,
      notes TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (reservation_id) REFERENCES reservations(id),
      FOREIGN KEY (contract_id) REFERENCES contracts(id),
      FOREIGN KEY (guest_id) REFERENCES users(id),
      FOREIGN KEY (host_id) REFERENCES users(id),
      FOREIGN KEY (processed_by) REFERENCES users(id)
    );

    -- D: Badges/Insignias de Usuario
    CREATE TABLE IF NOT EXISTS badge_definitions (
      id TEXT PRIMARY KEY,
      code TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      icon TEXT,
      color TEXT DEFAULT '#4F46E5',
      badge_type TEXT NOT NULL CHECK(badge_type IN ('host', 'guest', 'both')),
      criteria TEXT,
      is_automatic INTEGER DEFAULT 1,
      is_active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS user_badges (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      badge_id TEXT NOT NULL,
      awarded_at TEXT DEFAULT CURRENT_TIMESTAMP,
      awarded_by TEXT,
      expires_at TEXT,
      is_active INTEGER DEFAULT 1,
      FOREIGN KEY (user_id) REFERENCES users(id),
      FOREIGN KEY (badge_id) REFERENCES badge_definitions(id),
      FOREIGN KEY (awarded_by) REFERENCES users(id)
    );

    -- Insertar badges por defecto
    INSERT OR IGNORE INTO badge_definitions (id, code, name, description, icon, color, badge_type, criteria, is_automatic) VALUES
      ('badge_verified_host', 'verified_host', 'Host Verificado', 'Documentos verificados por la plataforma', 'shield-check', '#10B981', 'host', 'all_documents_approved', 1),
      ('badge_super_host', 'super_host', 'Super Host', '10+ contratos completados con 4.5+ rating', 'star', '#F59E0B', 'host', 'contracts>=10 AND avg_rating>=4.5', 1),
      ('badge_new_host', 'new_host', 'Nuevo Host', 'Recien unido a la plataforma', 'sparkles', '#6366F1', 'host', 'joined_within_30_days', 1),
      ('badge_frequent_guest', 'frequent_guest', 'Cliente Frecuente', '5+ reservas completadas', 'heart', '#EC4899', 'guest', 'completed_reservations>=5', 1),
      ('badge_verified_guest', 'verified_guest', 'Cliente Verificado', 'Identidad verificada', 'badge-check', '#10B981', 'guest', 'identity_verified', 1),
      ('badge_top_rated', 'top_rated', 'Mejor Calificado', 'Rating promedio 4.8+', 'trophy', '#F59E0B', 'both', 'avg_rating>=4.8', 1);

    -- E: Centro de Ayuda/FAQ Admin
    CREATE TABLE IF NOT EXISTS faq_categories (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      slug TEXT UNIQUE NOT NULL,
      description TEXT,
      icon TEXT,
      order_index INTEGER DEFAULT 0,
      is_active INTEGER DEFAULT 1,
      target_audience TEXT DEFAULT 'all' CHECK(target_audience IN ('all', 'guests', 'hosts')),
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS faqs (
      id TEXT PRIMARY KEY,
      category_id TEXT NOT NULL,
      question TEXT NOT NULL,
      answer TEXT NOT NULL,
      order_index INTEGER DEFAULT 0,
      is_featured INTEGER DEFAULT 0,
      is_active INTEGER DEFAULT 1,
      views INTEGER DEFAULT 0,
      helpful_yes INTEGER DEFAULT 0,
      helpful_no INTEGER DEFAULT 0,
      created_by TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (category_id) REFERENCES faq_categories(id),
      FOREIGN KEY (created_by) REFERENCES users(id)
    );

    -- Insertar categorias FAQ por defecto
    INSERT OR IGNORE INTO faq_categories (id, name, slug, description, icon, order_index, target_audience) VALUES
      ('faq_cat_general', 'General', 'general', 'Preguntas generales sobre la plataforma', 'info-circle', 1, 'all'),
      ('faq_cat_reservas', 'Reservas', 'reservas', 'Como hacer y gestionar reservas', 'calendar', 2, 'guests'),
      ('faq_cat_pagos', 'Pagos', 'pagos', 'Metodos de pago y facturacion', 'credit-card', 3, 'all'),
      ('faq_cat_hosts', 'Para Hosts', 'hosts', 'Informacion para propietarios', 'home', 4, 'hosts'),
      ('faq_cat_contratos', 'Contratos', 'contratos', 'Firma y gestion de contratos', 'document', 5, 'all');

    -- F: Alertas y Notificaciones Admin
    CREATE TABLE IF NOT EXISTS admin_alerts (
      id TEXT PRIMARY KEY,
      alert_type TEXT NOT NULL CHECK(alert_type IN ('payment_pending', 'dispute_new', 'host_verification', 'contract_expiring', 'low_activity', 'system', 'custom')),
      title TEXT NOT NULL,
      message TEXT NOT NULL,
      severity TEXT DEFAULT 'info' CHECK(severity IN ('info', 'warning', 'error', 'success')),
      entity_type TEXT,
      entity_id TEXT,
      is_read INTEGER DEFAULT 0,
      is_dismissed INTEGER DEFAULT 0,
      action_url TEXT,
      action_label TEXT,
      expires_at TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_admin_alerts_unread ON admin_alerts(is_read, is_dismissed, created_at);
    CREATE INDEX IF NOT EXISTS idx_disputes_status ON disputes(status, created_at);
    CREATE INDEX IF NOT EXISTS idx_host_verifications_status ON host_verifications(status, host_id);
    CREATE INDEX IF NOT EXISTS idx_campaigns_status ON campaigns(status, scheduled_at);
    CREATE INDEX IF NOT EXISTS idx_security_deposits_status ON security_deposits(status, reservation_id);

    -- G: Favoritos de espacios para clientes
    CREATE TABLE IF NOT EXISTS favorites (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      space_id TEXT NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id),
      FOREIGN KEY (space_id) REFERENCES spaces(id),
      UNIQUE(user_id, space_id)
    );

    CREATE INDEX IF NOT EXISTS idx_favorites_user ON favorites(user_id);
    CREATE INDEX IF NOT EXISTS idx_favorites_space ON favorites(space_id);

    -- Tablas para Sistema de Backup y Recuperacion
    CREATE TABLE IF NOT EXISTS backup_config (
      id TEXT PRIMARY KEY DEFAULT 'default',
      auto_backup_enabled INTEGER DEFAULT 0,
      frequency TEXT DEFAULT 'daily' CHECK(frequency IN ('daily', 'weekly', 'monthly', 'quarterly', 'semestral', 'yearly')),
      retention_days INTEGER DEFAULT 30,
      last_backup_at TEXT,
      next_backup_at TEXT,
      notify_on_success INTEGER DEFAULT 1,
      notify_on_failure INTEGER DEFAULT 1,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS backup_history (
      id TEXT PRIMARY KEY,
      filename TEXT NOT NULL,
      filepath TEXT NOT NULL,
      size_bytes INTEGER,
      backup_type TEXT NOT NULL CHECK(backup_type IN ('manual', 'automatic')),
      status TEXT NOT NULL CHECK(status IN ('completed', 'failed', 'in_progress')),
      error_message TEXT,
      created_by TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (created_by) REFERENCES users(id)
    );

    CREATE INDEX IF NOT EXISTS idx_backup_history_created ON backup_history(created_at);
    CREATE INDEX IF NOT EXISTS idx_backup_history_status ON backup_history(status);

    -- Insertar configuracion por defecto de backups
    INSERT OR IGNORE INTO backup_config (id) VALUES ('default');
  `);

  // Migraciones para columnas faltantes en bases de datos existentes
  const migrations = [
    { table: 'users', column: 'anti_bypass_legal_text_id', type: 'TEXT' },
    { table: 'users', column: 'anti_bypass_legal_version', type: 'TEXT' },
    { table: 'users', column: 'anti_bypass_ip', type: 'TEXT' },
    { table: 'users', column: 'anti_bypass_user_agent', type: 'TEXT' },
    { table: 'users', column: 'is_blocked', type: 'INTEGER DEFAULT 0' },
    { table: 'users', column: 'classification', type: 'TEXT' },
    { table: 'users', column: 'street', type: 'TEXT' },
    { table: 'users', column: 'street_number', type: 'TEXT' },
    { table: 'users', column: 'country', type: 'TEXT DEFAULT "Bolivia"' },
    { table: 'legal_texts', column: 'category', type: 'TEXT DEFAULT "legal"' },
    { table: 'payments', column: 'taxable_base', type: 'REAL DEFAULT 0' },
    { table: 'payments', column: 'iva_amount', type: 'REAL DEFAULT 0' },
    { table: 'payments', column: 'it_amount', type: 'REAL DEFAULT 0' },
    { table: 'invoices', column: 'taxable_base', type: 'REAL DEFAULT 0' },
    { table: 'invoices', column: 'iva_amount', type: 'REAL DEFAULT 0' },
    { table: 'invoices', column: 'it_amount', type: 'REAL DEFAULT 0' },
    { table: 'contact_messages', column: 'category', type: 'TEXT DEFAULT "general"' },
    { table: 'contact_messages', column: 'priority', type: 'TEXT DEFAULT "normal"' },
    { table: 'contact_messages', column: 'admin_notes', type: 'TEXT' },
    { table: 'users', column: 'profile_photo', type: 'TEXT' },
    { table: 'users', column: 'email_notifications', type: 'INTEGER DEFAULT 1' },
    { table: 'users', column: 'newsletter', type: 'INTEGER DEFAULT 0' },
    { table: 'users', column: 'email_verification_token', type: 'TEXT' },
    { table: 'users', column: 'email_verification_expires', type: 'TEXT' },
    { table: 'users', column: 'email_verified_at', type: 'TEXT' },
    { table: 'users', column: 'floor', type: 'TEXT' },
    { table: 'users', column: 'is_super_admin', type: 'INTEGER DEFAULT 0' }
  ];

  // Backfill null categories to 'legal'
  try {
    db.exec(`UPDATE legal_texts SET category = 'legal' WHERE category IS NULL`);
  } catch (e) {
    console.log('Backfill categories:', e.message);
  }

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

  // Marcar al admin principal como Super Admin
  try {
    db.exec(`UPDATE users SET is_super_admin = 1 WHERE email = 'admin@almacenes-galpones-espacios-libres.com' AND role = 'ADMIN'`);
  } catch (e) {
    console.log('Super Admin setup:', e.message);
  }

  console.log('Base de datos inicializada correctamente');
}

module.exports = { db, initDatabase };
