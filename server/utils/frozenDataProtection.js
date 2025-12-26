const { db } = require('../config/database');

const FROZEN_FIELDS_RESERVATIONS = [
  'frozen_space_data',
  'frozen_video_url',
  'frozen_video_duration',
  'frozen_description',
  'frozen_pricing',
  'frozen_deposit_percentage',
  'frozen_commission_percentage',
  'frozen_price_per_sqm_applied',
  'frozen_snapshot_created_at',
  'frozen_snapshot_ip',
  'frozen_snapshot_user_agent'
];

const FROZEN_FIELDS_CONTRACTS = [
  'frozen_space_data',
  'frozen_video_url',
  'frozen_video_duration',
  'frozen_description',
  'frozen_pricing',
  'frozen_deposit_percentage',
  'frozen_commission_percentage',
  'frozen_price_per_sqm_applied',
  'frozen_snapshot_created_at'
];

function initFrozenDataTriggers() {
  const reservationTriggerCheck = db.prepare(`
    SELECT name FROM sqlite_master 
    WHERE type = 'trigger' AND name = 'prevent_frozen_update_reservations'
  `).get();

  if (!reservationTriggerCheck) {
    db.exec(`
      CREATE TRIGGER prevent_frozen_update_reservations
      BEFORE UPDATE ON reservations
      FOR EACH ROW
      WHEN (
        OLD.frozen_space_data IS NOT NULL AND (
          OLD.frozen_space_data != NEW.frozen_space_data OR
          OLD.frozen_video_url != NEW.frozen_video_url OR
          OLD.frozen_video_duration != NEW.frozen_video_duration OR
          OLD.frozen_description != NEW.frozen_description OR
          OLD.frozen_pricing != NEW.frozen_pricing OR
          OLD.frozen_deposit_percentage != NEW.frozen_deposit_percentage OR
          OLD.frozen_commission_percentage != NEW.frozen_commission_percentage OR
          OLD.frozen_price_per_sqm_applied != NEW.frozen_price_per_sqm_applied OR
          OLD.frozen_snapshot_created_at != NEW.frozen_snapshot_created_at OR
          OLD.frozen_snapshot_ip != NEW.frozen_snapshot_ip OR
          OLD.frozen_snapshot_user_agent != NEW.frozen_snapshot_user_agent
        )
      )
      BEGIN
        SELECT RAISE(ABORT, 'FROZEN_DATA_IMMUTABLE: No se pueden modificar campos congelados de reservaciones. Estos datos son inmutables despues de la creacion del snapshot contractual.');
      END;
    `);
    console.log('[FROZEN] Trigger de proteccion para reservations creado');
  }

  const contractTriggerCheck = db.prepare(`
    SELECT name FROM sqlite_master 
    WHERE type = 'trigger' AND name = 'prevent_frozen_update_contracts'
  `).get();

  if (!contractTriggerCheck) {
    db.exec(`
      CREATE TRIGGER prevent_frozen_update_contracts
      BEFORE UPDATE ON contracts
      FOR EACH ROW
      WHEN (
        OLD.frozen_space_data IS NOT NULL AND (
          OLD.frozen_space_data != NEW.frozen_space_data OR
          OLD.frozen_video_url != NEW.frozen_video_url OR
          OLD.frozen_video_duration != NEW.frozen_video_duration OR
          OLD.frozen_description != NEW.frozen_description OR
          OLD.frozen_pricing != NEW.frozen_pricing OR
          OLD.frozen_deposit_percentage != NEW.frozen_deposit_percentage OR
          OLD.frozen_commission_percentage != NEW.frozen_commission_percentage OR
          OLD.frozen_price_per_sqm_applied != NEW.frozen_price_per_sqm_applied OR
          OLD.frozen_snapshot_created_at != NEW.frozen_snapshot_created_at
        )
      )
      BEGIN
        SELECT RAISE(ABORT, 'FROZEN_DATA_IMMUTABLE: No se pueden modificar campos congelados de contratos. Estos datos son inmutables.');
      END;
    `);
    console.log('[FROZEN] Trigger de proteccion para contracts creado');
  }

  const reservationDeleteTriggerCheck = db.prepare(`
    SELECT name FROM sqlite_master 
    WHERE type = 'trigger' AND name = 'prevent_frozen_delete_reservations'
  `).get();

  if (!reservationDeleteTriggerCheck) {
    db.exec(`
      CREATE TRIGGER prevent_frozen_delete_reservations
      BEFORE DELETE ON reservations
      FOR EACH ROW
      WHEN OLD.frozen_space_data IS NOT NULL AND OLD.status NOT IN ('cancelled', 'refunded')
      BEGIN
        SELECT RAISE(ABORT, 'FROZEN_DATA_IMMUTABLE: No se pueden eliminar reservaciones con datos contractuales congelados activos.');
      END;
    `);
    console.log('[FROZEN] Trigger de proteccion DELETE para reservations creado');
  }

  const contractDeleteTriggerCheck = db.prepare(`
    SELECT name FROM sqlite_master 
    WHERE type = 'trigger' AND name = 'prevent_frozen_delete_contracts'
  `).get();

  if (!contractDeleteTriggerCheck) {
    db.exec(`
      CREATE TRIGGER prevent_frozen_delete_contracts
      BEFORE DELETE ON contracts
      FOR EACH ROW
      WHEN OLD.status NOT IN ('cancelled')
      BEGIN
        SELECT RAISE(ABORT, 'FROZEN_DATA_IMMUTABLE: No se pueden eliminar contratos activos con datos congelados.');
      END;
    `);
    console.log('[FROZEN] Trigger de proteccion DELETE para contracts creado');
  }
}

function validateFrozenDataIntegrity(reservationId) {
  const reservation = db.prepare('SELECT * FROM reservations WHERE id = ?').get(reservationId);
  
  if (!reservation || !reservation.frozen_space_data) {
    return { valid: false, error: 'Reservacion no tiene snapshot congelado' };
  }

  const requiredFields = [
    'frozen_space_data',
    'frozen_snapshot_created_at'
  ];

  for (const field of requiredFields) {
    if (!reservation[field]) {
      return { valid: false, error: `Campo FROZEN requerido faltante: ${field}` };
    }
  }

  try {
    const spaceData = JSON.parse(reservation.frozen_space_data);
    if (!spaceData.title || !spaceData.space_type) {
      return { valid: false, error: 'frozen_space_data incompleto' };
    }
  } catch (e) {
    return { valid: false, error: 'frozen_space_data no es JSON valido' };
  }

  return { 
    valid: true, 
    snapshot_created_at: reservation.frozen_snapshot_created_at,
    frozen_fields: FROZEN_FIELDS_RESERVATIONS.filter(f => reservation[f] !== null)
  };
}

function getFrozenContractData(contractId) {
  const contract = db.prepare(`
    SELECT 
      frozen_space_data,
      frozen_video_url,
      frozen_video_duration,
      frozen_description,
      frozen_pricing,
      frozen_deposit_percentage,
      frozen_commission_percentage,
      frozen_price_per_sqm_applied,
      frozen_snapshot_created_at
    FROM contracts WHERE id = ?
  `).get(contractId);

  if (!contract) {
    return null;
  }

  return {
    space: contract.frozen_space_data ? JSON.parse(contract.frozen_space_data) : null,
    video_url: contract.frozen_video_url,
    video_duration: contract.frozen_video_duration,
    description: contract.frozen_description,
    pricing: contract.frozen_pricing ? JSON.parse(contract.frozen_pricing) : null,
    deposit_percentage: contract.frozen_deposit_percentage,
    commission_percentage: contract.frozen_commission_percentage,
    price_per_sqm_applied: contract.frozen_price_per_sqm_applied,
    snapshot_created_at: contract.frozen_snapshot_created_at,
    _note: 'FROZEN: Estos datos son inmutables y reflejan las condiciones al momento de la confirmacion'
  };
}

module.exports = {
  initFrozenDataTriggers,
  validateFrozenDataIntegrity,
  getFrozenContractData,
  FROZEN_FIELDS_RESERVATIONS,
  FROZEN_FIELDS_CONTRACTS
};
