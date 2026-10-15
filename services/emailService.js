const nodemailer = require('nodemailer');
const logger = require('../middleware/logger');

let transporter = null;

function getTransporter() {
  if (transporter) return transporter;

  const host = process.env.SMTP_HOST;
  const port = parseInt(process.env.SMTP_PORT, 10) || 587;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (host && user && pass) {
    transporter = nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: { user, pass }
    });
    logger.info('Email transporter configured with custom SMTP', { host, port, user });
  } else {
    // If not configured, we log clear warnings when an attempt is made to send
    transporter = null;
  }
  return transporter;
}

/**
 * Send email helper
 * @param {Object} options
 * @param {string} options.to - Recipient email
 * @param {string} options.subject - Email subject
 * @param {string} options.text - Plain text content
 * @param {string} options.html - HTML content
 */
async function sendEmail({ to, subject, text, html }) {
  const mailer = getTransporter();
  const from = process.env.SMTP_FROM || `Sri Palani Murugan Function Hall <${process.env.SMTP_USER || 'no-reply@palanimurugan.com'}>`;

  if (!mailer) {
    const errorMsg = 'SMTP email service is not configured. Please set SMTP_HOST, SMTP_PORT, SMTP_USER, and SMTP_PASS in the environment variables.';
    logger.warn('Email dispatch skipped (SMTP unconfigured)', { to, subject });
    const err = new Error(errorMsg);
    err.code = 'SMTP_NOT_CONFIGURED';
    throw err;
  }

  const info = await mailer.sendMail({
    from,
    to,
    subject,
    text,
    html
  });

  logger.info('Email dispatched successfully', { messageId: info.messageId, to, subject });
  return info;
}

module.exports = {
  sendEmail,
  getTransporter
};
