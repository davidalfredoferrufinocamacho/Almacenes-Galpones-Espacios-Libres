const { db } = require('../config/database');
const { generateId, getClientInfo } = require('./helpers');

function getTemplate(eventType, channel = 'email') {
  const template = db.prepare(`
    SELECT * FROM notification_templates 
    WHERE event_type = ? AND channel = ? AND is_active = 1
  `).get(eventType, channel);
  
  return template || null;
}

function interpolateTemplate(text, variables) {
  if (!text) return '';
  let result = text;
  for (const [key, value] of Object.entries(variables)) {
    result = result.replace(new RegExp(`{{${key}}}`, 'g'), value || '');
  }
  return result;
}

function sendNotification({ eventType, recipientId, channel = 'email', payload = {}, req = null }) {
  try {
    const recipient = db.prepare('SELECT id, email, first_name, last_name, phone FROM users WHERE id = ?').get(recipientId);
    if (!recipient) {
      console.log(`[NOTIFICATION] Recipient not found: ${recipientId}`);
      return { success: false, error: 'Recipient not found' };
    }

    const template = getTemplate(eventType, channel);
    if (!template) {
      console.log(`[NOTIFICATION] No active template for event: ${eventType}, channel: ${channel}`);
      return { success: false, error: 'No active template' };
    }

    const variables = {
      recipient_name: `${recipient.first_name || ''} ${recipient.last_name || ''}`.trim(),
      recipient_email: recipient.email,
      platform_name: 'Almacenes, Galpones, Espacios Libres',
      platform_email: 'admin@almacenes-galpones-espacios-libres.com',
      ...payload
    };

    const subject = interpolateTemplate(template.subject, variables);
    const body = interpolateTemplate(template.body, variables);

    const notificationId = generateId();
    const clientInfo = req ? getClientInfo(req) : { ip: 'system', userAgent: 'system', timestamp: new Date().toISOString() };

    db.prepare(`
      INSERT INTO notification_log (
        id, recipient_id, recipient_email, event_type, channel, template_id,
        subject, body, status, ip_address, user_agent
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'sent', ?, ?)
    `).run(
      notificationId, recipientId, recipient.email, eventType, channel, template.id,
      subject, body, clientInfo.ip, clientInfo.userAgent
    );

    console.log(`[MOCK ${channel.toUpperCase()}] To: ${recipient.email}`);
    console.log(`[MOCK ${channel.toUpperCase()}] Subject: ${subject}`);
    console.log(`[MOCK ${channel.toUpperCase()}] Body: ${body}`);
    console.log(`[MOCK ${channel.toUpperCase()}] --- End of notification ---`);

    logNotificationAudit(recipientId, eventType, channel, notificationId, template.id, clientInfo);

    return { success: true, notificationId, subject, body };
  } catch (error) {
    console.error('[NOTIFICATION ERROR]', error);
    return { success: false, error: error.message };
  }
}

function logNotificationAudit(recipientId, eventType, channel, notificationId, templateId, clientInfo) {
  try {
    db.prepare(`
      INSERT INTO audit_log (id, user_id, action, entity_type, entity_id, new_data, ip_address, user_agent)
      VALUES (?, ?, 'NOTIFICATION_SENT', 'notification_log', ?, ?, ?, ?)
    `).run(
      generateId(),
      recipientId,
      notificationId,
      JSON.stringify({ event_type: eventType, channel, template_id: templateId, timestamp: clientInfo.timestamp }),
      clientInfo.ip,
      clientInfo.userAgent
    );
  } catch (error) {
    console.error('[AUDIT ERROR]', error);
  }
}

function notifyAppointmentRequested(appointmentId, req) {
  const appointment = db.prepare(`
    SELECT a.*, s.title as space_title, 
           ug.id as guest_id, ug.first_name as guest_name,
           uh.id as host_id
    FROM appointments a
    JOIN spaces s ON a.space_id = s.id
    JOIN users ug ON a.guest_id = ug.id
    JOIN users uh ON a.host_id = uh.id
    WHERE a.id = ?
  `).get(appointmentId);

  if (!appointment) return;

  sendNotification({
    eventType: 'appointment_requested',
    recipientId: appointment.host_id,
    channel: 'email',
    payload: {
      space_title: appointment.space_title,
      guest_name: appointment.guest_name,
      scheduled_date: appointment.scheduled_date,
      scheduled_time: appointment.scheduled_time,
      appointment_id: appointmentId
    },
    req
  });
}

function notifyAppointmentAccepted(appointmentId, req) {
  const appointment = db.prepare(`
    SELECT a.*, s.title as space_title
    FROM appointments a
    JOIN spaces s ON a.space_id = s.id
    WHERE a.id = ?
  `).get(appointmentId);

  if (!appointment) return;

  sendNotification({
    eventType: 'appointment_accepted',
    recipientId: appointment.guest_id,
    channel: 'email',
    payload: {
      space_title: appointment.space_title,
      scheduled_date: appointment.scheduled_date,
      scheduled_time: appointment.scheduled_time
    },
    req
  });
}

function notifyAppointmentRejected(appointmentId, reason, req) {
  const appointment = db.prepare(`
    SELECT a.*, s.title as space_title
    FROM appointments a
    JOIN spaces s ON a.space_id = s.id
    WHERE a.id = ?
  `).get(appointmentId);

  if (!appointment) return;

  sendNotification({
    eventType: 'appointment_rejected',
    recipientId: appointment.guest_id,
    channel: 'email',
    payload: {
      space_title: appointment.space_title,
      scheduled_date: appointment.scheduled_date,
      reason: reason || 'No especificada'
    },
    req
  });
}

function notifyAppointmentRescheduled(appointmentId, newDate, newTime, reason, req) {
  const appointment = db.prepare(`
    SELECT a.*, s.title as space_title
    FROM appointments a
    JOIN spaces s ON a.space_id = s.id
    WHERE a.id = ?
  `).get(appointmentId);

  if (!appointment) return;

  sendNotification({
    eventType: 'appointment_rescheduled',
    recipientId: appointment.guest_id,
    channel: 'email',
    payload: {
      space_title: appointment.space_title,
      original_date: appointment.scheduled_date,
      original_time: appointment.scheduled_time,
      new_date: newDate,
      new_time: newTime,
      reason: reason || 'No especificada'
    },
    req
  });
}

function notifyDepositPaid(reservationId, amount, req) {
  const reservation = db.prepare(`
    SELECT r.*, s.title as space_title, s.host_id
    FROM reservations r
    JOIN spaces s ON r.space_id = s.id
    WHERE r.id = ?
  `).get(reservationId);

  if (!reservation) return;

  sendNotification({
    eventType: 'deposit_paid',
    recipientId: reservation.guest_id,
    channel: 'email',
    payload: {
      space_title: reservation.space_title,
      amount: amount.toFixed(2),
      total_amount: reservation.total_amount.toFixed(2),
      remaining_amount: reservation.remaining_amount.toFixed(2)
    },
    req
  });

  sendNotification({
    eventType: 'deposit_received',
    recipientId: reservation.host_id,
    channel: 'email',
    payload: {
      space_title: reservation.space_title,
      amount: amount.toFixed(2),
      guest_id: reservation.guest_id
    },
    req
  });
}

function notifyRemainingPaid(reservationId, amount, req) {
  const reservation = db.prepare(`
    SELECT r.*, s.title as space_title, s.host_id
    FROM reservations r
    JOIN spaces s ON r.space_id = s.id
    WHERE r.id = ?
  `).get(reservationId);

  if (!reservation) return;

  sendNotification({
    eventType: 'remaining_paid',
    recipientId: reservation.guest_id,
    channel: 'email',
    payload: {
      space_title: reservation.space_title,
      amount: amount.toFixed(2),
      total_amount: reservation.total_amount.toFixed(2)
    },
    req
  });

  sendNotification({
    eventType: 'remaining_received',
    recipientId: reservation.host_id,
    channel: 'email',
    payload: {
      space_title: reservation.space_title,
      amount: amount.toFixed(2)
    },
    req
  });
}

function notifyContractCreated(contractId, req) {
  const contract = db.prepare(`
    SELECT c.*, s.title as space_title
    FROM contracts c
    JOIN spaces s ON c.space_id = s.id
    WHERE c.id = ?
  `).get(contractId);

  if (!contract) return;

  sendNotification({
    eventType: 'contract_created',
    recipientId: contract.guest_id,
    channel: 'email',
    payload: {
      contract_number: contract.contract_number,
      space_title: contract.space_title,
      start_date: contract.start_date,
      end_date: contract.end_date,
      total_amount: contract.total_amount.toFixed(2)
    },
    req
  });

  sendNotification({
    eventType: 'contract_created',
    recipientId: contract.host_id,
    channel: 'email',
    payload: {
      contract_number: contract.contract_number,
      space_title: contract.space_title,
      start_date: contract.start_date,
      end_date: contract.end_date,
      total_amount: contract.total_amount.toFixed(2)
    },
    req
  });
}

function notifyContractSigned(contractId, signerRole, req) {
  const contract = db.prepare(`
    SELECT c.*, s.title as space_title
    FROM contracts c
    JOIN spaces s ON c.space_id = s.id
    WHERE c.id = ?
  `).get(contractId);

  if (!contract) return;

  const otherPartyId = signerRole === 'GUEST' ? contract.host_id : contract.guest_id;

  sendNotification({
    eventType: 'contract_signed',
    recipientId: otherPartyId,
    channel: 'email',
    payload: {
      contract_number: contract.contract_number,
      space_title: contract.space_title,
      signer_role: signerRole,
      guest_signed: contract.guest_signed ? 'Si' : 'No',
      host_signed: contract.host_signed ? 'Si' : 'No'
    },
    req
  });
}

function notifyRefundProcessed(paymentId, amount, status, req) {
  const payment = db.prepare(`
    SELECT p.*, r.guest_id, s.title as space_title
    FROM payments p
    JOIN reservations r ON p.reservation_id = r.id
    JOIN spaces s ON r.space_id = s.id
    WHERE p.id = ?
  `).get(paymentId);

  if (!payment) return;

  sendNotification({
    eventType: 'refund_processed',
    recipientId: payment.guest_id,
    channel: 'email',
    payload: {
      space_title: payment.space_title,
      amount: amount.toFixed(2),
      status: status === 'approved' ? 'Aprobado' : 'Rechazado'
    },
    req
  });
}

function notifyInvoiceGenerated(invoiceId, req) {
  const invoice = db.prepare(`
    SELECT i.*, c.contract_number
    FROM invoices i
    JOIN contracts c ON i.contract_id = c.id
    WHERE i.id = ?
  `).get(invoiceId);

  if (!invoice) return;

  sendNotification({
    eventType: 'invoice_generated',
    recipientId: invoice.guest_id,
    channel: 'email',
    payload: {
      invoice_number: invoice.invoice_number,
      contract_number: invoice.contract_number,
      total_amount: invoice.total_amount.toFixed(2)
    },
    req
  });
}

module.exports = {
  sendNotification,
  getTemplate,
  notifyAppointmentRequested,
  notifyAppointmentAccepted,
  notifyAppointmentRejected,
  notifyAppointmentRescheduled,
  notifyDepositPaid,
  notifyRemainingPaid,
  notifyContractCreated,
  notifyContractSigned,
  notifyRefundProcessed,
  notifyInvoiceGenerated
};
