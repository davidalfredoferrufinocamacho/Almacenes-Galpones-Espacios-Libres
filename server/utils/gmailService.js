const { google } = require('googleapis');

let connectionSettings = null;

async function getAccessToken() {
  if (connectionSettings && connectionSettings.settings.expires_at && new Date(connectionSettings.settings.expires_at).getTime() > Date.now()) {
    return connectionSettings.settings.access_token;
  }
  
  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
  const xReplitToken = process.env.REPL_IDENTITY 
    ? 'repl ' + process.env.REPL_IDENTITY 
    : process.env.WEB_REPL_RENEWAL 
    ? 'depl ' + process.env.WEB_REPL_RENEWAL 
    : null;

  if (!xReplitToken) {
    throw new Error('X_REPLIT_TOKEN not found for repl/depl');
  }

  connectionSettings = await fetch(
    'https://' + hostname + '/api/v2/connection?include_secrets=true&connector_names=google-mail',
    {
      headers: {
        'Accept': 'application/json',
        'X_REPLIT_TOKEN': xReplitToken
      }
    }
  ).then(res => res.json()).then(data => data.items?.[0]);

  const accessToken = connectionSettings?.settings?.access_token || connectionSettings.settings?.oauth?.credentials?.access_token;

  if (!connectionSettings || !accessToken) {
    throw new Error('Gmail not connected');
  }
  return accessToken;
}

async function getGmailClient() {
  const accessToken = await getAccessToken();

  const oauth2Client = new google.auth.OAuth2();
  oauth2Client.setCredentials({
    access_token: accessToken
  });

  return google.gmail({ version: 'v1', auth: oauth2Client });
}

function createEmailMessage(to, subject, htmlBody, textBody) {
  const boundary = 'boundary_' + Date.now();
  
  const messageParts = [
    `To: ${to}`,
    `Subject: =?UTF-8?B?${Buffer.from(subject).toString('base64')}?=`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    '',
    `--${boundary}`,
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    Buffer.from(textBody || htmlBody.replace(/<[^>]*>/g, '')).toString('base64'),
    '',
    `--${boundary}`,
    'Content-Type: text/html; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    Buffer.from(htmlBody).toString('base64'),
    '',
    `--${boundary}--`
  ];
  
  const message = messageParts.join('\r\n');
  return Buffer.from(message).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function sendEmail({ to, subject, htmlBody, textBody }) {
  try {
    const gmail = await getGmailClient();
    const raw = createEmailMessage(to, subject, htmlBody, textBody);
    
    const result = await gmail.users.messages.send({
      userId: 'me',
      requestBody: {
        raw: raw
      }
    });
    
    console.log(`[GMAIL] Email sent successfully to: ${to}, messageId: ${result.data.id}`);
    return { success: true, messageId: result.data.id };
  } catch (error) {
    console.error('[GMAIL ERROR]', error.message);
    return { success: false, error: error.message };
  }
}

async function sendContactResponseEmail({ recipientEmail, recipientName, originalSubject, originalMessage, adminResponse }) {
  const subject = `Re: ${originalSubject} - Almacenes, Galpones, Espacios Libres`;
  
  const htmlBody = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: linear-gradient(135deg, #1e3a5f 0%, #2d5a87 100%); color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
    .content { background: #f9f9f9; padding: 20px; border: 1px solid #ddd; }
    .original-message { background: #e8e8e8; padding: 15px; border-left: 4px solid #1e3a5f; margin: 15px 0; }
    .response { background: white; padding: 15px; border-left: 4px solid #28a745; margin: 15px 0; }
    .footer { background: #1e3a5f; color: white; padding: 15px; text-align: center; font-size: 12px; border-radius: 0 0 8px 8px; }
    h1 { margin: 0; font-size: 24px; }
    h3 { color: #1e3a5f; margin-bottom: 10px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>Almacenes, Galpones, Espacios Libres</h1>
    </div>
    <div class="content">
      <p>Estimado/a <strong>${recipientName}</strong>,</p>
      <p>Gracias por contactarnos. A continuacion encontrara nuestra respuesta a su consulta:</p>
      
      <div class="original-message">
        <h3>Su mensaje original:</h3>
        <p><strong>Asunto:</strong> ${originalSubject}</p>
        <p>${originalMessage}</p>
      </div>
      
      <div class="response">
        <h3>Nuestra respuesta:</h3>
        <p>${adminResponse.replace(/\n/g, '<br>')}</p>
      </div>
      
      <p>Si tiene alguna pregunta adicional, no dude en responder a este correo o contactarnos nuevamente a traves de nuestra plataforma.</p>
      
      <p>Atentamente,<br>
      <strong>Equipo de Soporte</strong><br>
      Almacenes, Galpones, Espacios Libres</p>
    </div>
    <div class="footer">
      <p>Este es un correo automatico enviado desde la plataforma Almacenes, Galpones, Espacios Libres.</p>
      <p>Bolivia - Todos los derechos reservados</p>
    </div>
  </div>
</body>
</html>`;

  const textBody = `
Estimado/a ${recipientName},

Gracias por contactarnos. A continuacion encontrara nuestra respuesta a su consulta:

--- Su mensaje original ---
Asunto: ${originalSubject}
${originalMessage}

--- Nuestra respuesta ---
${adminResponse}

Si tiene alguna pregunta adicional, no dude en contactarnos nuevamente.

Atentamente,
Equipo de Soporte
Almacenes, Galpones, Espacios Libres
`;

  return sendEmail({ to: recipientEmail, subject, htmlBody, textBody });
}

module.exports = {
  sendEmail,
  sendContactResponseEmail,
  getGmailClient
};
