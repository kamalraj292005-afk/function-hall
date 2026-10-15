const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../database/db');
const { validateEmail, validateMobile, validatePassword, sanitizeString } = require('../middleware/validation');
const logger = require('../middleware/logger');

const SALT_ROUNDS = 12;
const TOKEN_EXPIRY = '7d';

// Register
exports.register = async (req, res) => {
  try {
    const { fullName, email, mobile, password, confirmPassword } = req.body;
    const db = getDb();

    // Validate
    if (!fullName || !email || !mobile || !password || !confirmPassword) {
      return res.status(400).json({ success: false, message: 'All fields are required.' });
    }
    if (!validateEmail(email)) {
      return res.status(400).json({ success: false, message: 'Please enter a valid email address.' });
    }
    if (!validateMobile(mobile)) {
      return res.status(400).json({ success: false, message: 'Please enter a valid Indian mobile number.' });
    }
    if (!validatePassword(password)) {
      return res.status(400).json({ success: false, message: 'Password must be at least 6 characters.' });
    }
    if (password !== confirmPassword) {
      return res.status(400).json({ success: false, message: 'Passwords do not match.' });
    }

    // Check duplicates
    const existingEmail = db.prepare('SELECT id FROM users WHERE email = ?').get(email.toLowerCase());
    if (existingEmail) {
      return res.status(409).json({ success: false, message: 'An account with this email already exists.' });
    }

    const existingMobile = db.prepare('SELECT id FROM users WHERE mobile = ?').get(mobile);
    if (existingMobile) {
      return res.status(409).json({ success: false, message: 'An account with this mobile number already exists.' });
    }

    // Hash password and create user - ALWAYS customer role
    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
    const uuid = uuidv4();

    const result = db.prepare(`
      INSERT INTO users (uuid, full_name, email, mobile, password_hash, role)
      VALUES (?, ?, ?, ?, ?, 'customer')
    `).run(uuid, sanitizeString(fullName), email.toLowerCase(), mobile, passwordHash);

    const token = jwt.sign({ userId: result.lastInsertRowid, role: 'customer' }, process.env.JWT_SECRET, { expiresIn: TOKEN_EXPIRY });

    // Create welcome notification
    db.prepare(`
      INSERT INTO notifications (user_id, title, message, type)
      VALUES (?, 'Welcome!', 'Welcome to Palani Murugan Function Hall. You can now book our hall for your special occasions.', 'success')
    `).run(result.lastInsertRowid);

    logger.info('New user registered', { userId: result.lastInsertRowid, email: email.toLowerCase() });

    res.status(201).json({
      success: true,
      message: 'Registration successful!',
      token,
      user: { id: result.lastInsertRowid, uuid, fullName: sanitizeString(fullName), email: email.toLowerCase(), mobile, role: 'customer' }
    });
  } catch (err) {
    logger.error('Registration error', { error: err.message });
    res.status(500).json({ success: false, message: 'Registration failed. Please try again.' });
  }
};

// Login
exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;
    const db = getDb();

    if (!email || !password) {
      return res.status(400).json({ success: false, message: 'Email and password are required.' });
    }

    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email.toLowerCase());
    if (!user) {
      return res.status(401).json({ success: false, message: 'Invalid email or password.' });
    }

    if (!user.is_active) {
      return res.status(403).json({ success: false, message: 'Your account has been deactivated. Please contact support.' });
    }

    const validPassword = await bcrypt.compare(password, user.password_hash);
    if (!validPassword) {
      return res.status(401).json({ success: false, message: 'Invalid email or password.' });
    }

    const token = jwt.sign({ userId: user.id, role: user.role }, process.env.JWT_SECRET, { expiresIn: TOKEN_EXPIRY });

    logger.info('User logged in', { userId: user.id, role: user.role });

    res.json({
      success: true,
      message: 'Login successful!',
      token,
      user: { id: user.id, uuid: user.uuid, fullName: user.full_name, email: user.email, mobile: user.mobile, role: user.role }
    });
  } catch (err) {
    logger.error('Login error', { error: err.message });
    res.status(500).json({ success: false, message: 'Login failed. Please try again.' });
  }
};

// Get current user
exports.getMe = (req, res) => {
  const db = getDb();
  const unreadNotifications = db.prepare('SELECT COUNT(*) as count FROM notifications WHERE user_id = ? AND is_read = 0').get(req.user.id);

  res.json({
    success: true,
    user: {
      ...req.user,
      unread_notifications: unreadNotifications.count
    }
  });
};

// Update profile
exports.updateProfile = async (req, res) => {
  try {
    const { fullName, mobile } = req.body;
    const db = getDb();

    if (fullName) {
      db.prepare('UPDATE users SET full_name = ?, updated_at = datetime(\'now\') WHERE id = ?')
        .run(sanitizeString(fullName), req.user.id);
    }

    if (mobile) {
      if (!validateMobile(mobile)) {
        return res.status(400).json({ success: false, message: 'Please enter a valid mobile number.' });
      }
      db.prepare('UPDATE users SET mobile = ?, updated_at = datetime(\'now\') WHERE id = ?')
        .run(mobile, req.user.id);
    }

    const updatedUser = db.prepare('SELECT id, uuid, full_name, email, mobile, role FROM users WHERE id = ?').get(req.user.id);

    res.json({ success: true, message: 'Profile updated successfully.', user: updatedUser });
  } catch (err) {
    logger.error('Profile update error', { error: err.message });
    res.status(500).json({ success: false, message: 'Failed to update profile.' });
  }
};

// Get notifications
exports.getNotifications = (req, res) => {
  const db = getDb();
  const notifications = db.prepare('SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 50').all(req.user.id);
  res.json({ success: true, notifications });
};

// Mark notification as read
exports.markNotificationRead = (req, res) => {
  const db = getDb();
  db.prepare('UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?').run(req.params.id, req.user.id);
  res.json({ success: true });
};

// Mark all notifications read
exports.markAllNotificationsRead = (req, res) => {
  const db = getDb();
  db.prepare('UPDATE notifications SET is_read = 1 WHERE user_id = ? AND is_read = 0').run(req.user.id);
  res.json({ success: true });
};

// Logout (client-side token removal, but we can log it)
exports.logout = (req, res) => {
  logger.info('User logged out', { userId: req.user?.id });
  res.json({ success: true, message: 'Logged out successfully.' });
};

// Forgot Username - Recovers registered login email / account details
exports.forgotUsername = async (req, res) => {
  try {
    const { email } = req.body;
    if (!email || !validateEmail(email)) {
      return res.status(400).json({ success: false, message: 'Please enter a valid registered email address.' });
    }

    const db = getDb();
    const user = db.prepare('SELECT id, full_name, email, role, is_active FROM users WHERE email = ?').get(email.toLowerCase().trim());

    if (!user) {
      // Return a friendly message without disclosing user enumeration
      return res.json({
        success: true,
        message: 'If an account exists with this email address, account details have been dispatched to your inbox.'
      });
    }

    if (!user.is_active) {
      return res.status(403).json({ success: false, message: 'Your account is deactivated. Please contact support.' });
    }

    const { sendEmail } = require('../services/emailService');

    const roleName = user.role === 'admin' ? 'System Administrator' : (user.role === 'owner' ? 'Hall Owner' : 'Valued Customer');
    const mailSubject = `Your Login Username / Account Details - Sri Palani Murugan Function Hall`;
    const mailText = `Dear ${user.full_name},\n\nYou requested your login username / account details for Sri Palani Murugan Function Hall.\n\nAccount Name: ${user.full_name}\nRegistered Login Email (Username): ${user.email}\nAccount Role: ${roleName}\n\nYou can sign in at: ${(process.env.APP_URL || 'https://function-hall-wqb8.onrender.com')}/login.html\n\nIf you did not request this, please ignore this email.\n\nBest regards,\nSri Palani Murugan Function Hall Management\nMain Road, Aranthangi to Peravurani Road, Vallavari, Near Ayyanar Kovil Temple`;
    const mailHtml = `
      <div style="font-family:'Segoe UI',Arial,sans-serif;max-width:600px;margin:0 auto;border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;box-shadow:0 4px 12px rgba(0,0,0,0.06);">
        <div style="background:#701325;color:#ffffff;padding:22px 24px;border-bottom:3px solid #c59b27;">
          <h2 style="margin:0;font-size:20px;letter-spacing:0.5px;">Sri Palani Murugan Function Hall</h2>
          <p style="margin:4px 0 0 0;color:#f3e8b5;font-size:13px;">Account Information Recovery</p>
        </div>
        <div style="padding:24px;color:#2d3748;line-height:1.6;">
          <p>Dear <strong>${user.full_name}</strong>,</p>
          <p>You requested your registered login username/email for Sri Palani Murugan Function Hall.</p>
          <div style="background:#fef7ea;border-left:4px solid #c59b27;padding:16px;margin:20px 0;border-radius:4px;">
            <p style="margin:4px 0;"><strong>Registered Login Username / Email:</strong> <code style="background:#fff;padding:2px 6px;border-radius:4px;color:#701325;font-weight:bold;">${user.email}</code></p>
            <p style="margin:4px 0;"><strong>Account Type:</strong> ${roleName}</p>
          </div>
          <p style="text-align:center;margin:28px 0;">
            <a href="${(process.env.APP_URL || 'https://function-hall-wqb8.onrender.com')}/login.html" style="background:#701325;color:#ffffff;padding:12px 28px;text-decoration:none;border-radius:6px;font-weight:bold;display:inline-block;border:1px solid #c59b27;">Go to Login Page</a>
          </p>
          <p style="font-size:12px;color:#718096;border-top:1px solid #edf2f7;padding-top:16px;">
            If you did not request this recovery, please disregard this email.<br>
            Sri Palani Murugan Function Hall, Main Road, Aranthangi to Peravurani Road, Vallavari, Near Ayyanar Kovil Temple.
          </p>
        </div>
      </div>
    `;

    try {
      await sendEmail({
        to: user.email,
        subject: mailSubject,
        text: mailText,
        html: mailHtml
      });
      logger.info('Username recovery email sent', { email: user.email, role: user.role });
      return res.json({
        success: true,
        message: 'Your registered username / email has been sent to your email address.'
      });
    } catch (mailErr) {
      logger.error('Failed to send username recovery email', { error: mailErr.message });
      if (mailErr.code === 'SMTP_NOT_CONFIGURED') {
        return res.status(503).json({
          success: false,
          message: 'Email service is currently being configured on the server. Please contact hall administration at 9655609405 for immediate username verification.'
        });
      }
      return res.status(500).json({
        success: false,
        message: 'Failed to deliver email. Please check your connection or contact hall administration at 9655609405.'
      });
    }
  } catch (err) {
    logger.error('Forgot username error', { error: err.message });
    res.status(500).json({ success: false, message: 'Unable to process your request. Please try again later.' });
  }
};

// Forgot Password - Creates secure reset token and sends reset link via email
exports.forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;
    if (!email || !validateEmail(email)) {
      return res.status(400).json({ success: false, message: 'Please enter a valid registered email address.' });
    }

    const db = getDb();
    const user = db.prepare('SELECT id, full_name, email, role, is_active FROM users WHERE email = ?').get(email.toLowerCase().trim());

    if (!user) {
      return res.json({
        success: true,
        message: 'If an account exists with this email address, a password reset link has been sent.'
      });
    }

    if (!user.is_active) {
      return res.status(403).json({ success: false, message: 'Your account is deactivated. Please contact support.' });
    }

    const crypto = require('crypto');
    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');

    // Token expires in 1 hour
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();

    db.prepare(`
      INSERT INTO password_resets (user_id, token_hash, expires_at)
      VALUES (?, ?, ?)
    `).run(user.id, tokenHash, expiresAt);

    const baseUrl = process.env.APP_URL || 'https://function-hall-wqb8.onrender.com';
    const resetUrl = `${baseUrl}/reset-password.html?token=${rawToken}&email=${encodeURIComponent(user.email)}`;

    const { sendEmail } = require('../services/emailService');
    const mailSubject = `Password Reset Request - Sri Palani Murugan Function Hall`;
    const mailText = `Dear ${user.full_name},\n\nYou requested a password reset for your Sri Palani Murugan Function Hall account.\n\nPlease click the link below to set a new password:\n${resetUrl}\n\nThis reset link is valid for 1 hour only.\n\nIf you did not request this, please ignore this email and your password will remain unchanged.\n\nBest regards,\nSri Palani Murugan Function Hall`;
    const mailHtml = `
      <div style="font-family:'Segoe UI',Arial,sans-serif;max-width:600px;margin:0 auto;border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;box-shadow:0 4px 12px rgba(0,0,0,0.06);">
        <div style="background:#701325;color:#ffffff;padding:22px 24px;border-bottom:3px solid #c59b27;">
          <h2 style="margin:0;font-size:20px;letter-spacing:0.5px;">Sri Palani Murugan Function Hall</h2>
          <p style="margin:4px 0 0 0;color:#f3e8b5;font-size:13px;">Secure Password Reset</p>
        </div>
        <div style="padding:24px;color:#2d3748;line-height:1.6;">
          <p>Dear <strong>${user.full_name}</strong>,</p>
          <p>We received a request to reset the password for your account associated with <strong>${user.email}</strong>.</p>
          <p style="text-align:center;margin:30px 0;">
            <a href="${resetUrl}" style="background:#701325;color:#ffffff;padding:14px 30px;text-decoration:none;border-radius:6px;font-weight:bold;display:inline-block;border:1px solid #c59b27;font-size:15px;">Reset My Password</a>
          </p>
          <p style="font-size:13px;color:#718096;">
            Or copy and paste this link into your browser:<br>
            <a href="${resetUrl}" style="color:#701325;word-break:break-all;">${resetUrl}</a>
          </p>
          <p style="font-size:13px;color:#e53e3e;font-weight:600;margin-top:20px;">
            ⚠️ This link will expire in 1 hour and can only be used once.
          </p>
          <p style="font-size:12px;color:#a0aec0;border-top:1px solid #edf2f7;padding-top:16px;margin-top:24px;">
            If you did not request a password reset, no action is needed. Your account remains completely secure.<br>
            Sri Palani Murugan Function Hall, Main Road, Aranthangi to Peravurani Road, Vallavari, Near Ayyanar Kovil Temple.
          </p>
        </div>
      </div>
    `;

    try {
      await sendEmail({
        to: user.email,
        subject: mailSubject,
        text: mailText,
        html: mailHtml
      });
      logger.info('Password reset email sent', { email: user.email, role: user.role });
      return res.json({
        success: true,
        message: 'A password reset link has been sent to your registered email address.'
      });
    } catch (mailErr) {
      logger.error('Failed to send password reset email', { error: mailErr.message });
      if (mailErr.code === 'SMTP_NOT_CONFIGURED') {
        return res.status(503).json({
          success: false,
          message: 'Email service is currently being configured on the server. Please contact hall administration at 9655609405 for password assistance.'
        });
      }
      return res.status(500).json({
        success: false,
        message: 'Failed to deliver reset email. Please try again or contact hall administration at 9655609405.'
      });
    }
  } catch (err) {
    logger.error('Forgot password error', { error: err.message });
    res.status(500).json({ success: false, message: 'Unable to process your request. Please try again later.' });
  }
};

// Reset Password - Validates secure token and updates password
exports.resetPassword = async (req, res) => {
  try {
    const { token, email, password, confirmPassword } = req.body;

    if (!token || !email || !password || !confirmPassword) {
      return res.status(400).json({ success: false, message: 'All fields are required.' });
    }

    if (password !== confirmPassword) {
      return res.status(400).json({ success: false, message: 'Passwords do not match.' });
    }

    if (!validatePassword(password)) {
      return res.status(400).json({ success: false, message: 'Password must be at least 6 characters.' });
    }

    const crypto = require('crypto');
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

    const db = getDb();
    const user = db.prepare('SELECT id, full_name, email, role FROM users WHERE email = ?').get(email.toLowerCase().trim());
    if (!user) {
      return res.status(400).json({ success: false, message: 'Invalid or expired password reset link.' });
    }

    const resetRecord = db.prepare(`
      SELECT * FROM password_resets
      WHERE user_id = ? AND token_hash = ? AND used_at IS NULL
    `).get(user.id, tokenHash);

    if (!resetRecord) {
      return res.status(400).json({ success: false, message: 'Invalid or already used password reset link.' });
    }

    const now = new Date();
    const expiresAt = new Date(resetRecord.expires_at);
    if (now > expiresAt) {
      return res.status(400).json({ success: false, message: 'Password reset link has expired. Please request a new one.' });
    }

    // Hash new password and update user
    const newPasswordHash = await bcrypt.hash(password, SALT_ROUNDS);

    db.transaction(() => {
      // Invalidate token
      db.prepare(`
        UPDATE password_resets SET used_at = datetime('now') WHERE id = ?
      `).run(resetRecord.id);

      // Update password
      db.prepare(`
        UPDATE users SET password_hash = ?, updated_at = datetime('now') WHERE id = ?
      `).run(newPasswordHash, user.id);

      // Notification
      db.prepare(`
        INSERT INTO notifications (user_id, title, message, type)
        VALUES (?, 'Password Changed', 'Your account password was successfully reset.', 'info')
      `).run(user.id);
    })();

    logger.info('Password successfully reset', { userId: user.id, email: user.email, role: user.role });

    res.json({
      success: true,
      message: 'Password reset successful! You can now log in with your new password.'
    });
  } catch (err) {
    logger.error('Reset password error', { error: err.message });
    res.status(500).json({ success: false, message: 'Failed to reset password. Please try again.' });
  }
};

