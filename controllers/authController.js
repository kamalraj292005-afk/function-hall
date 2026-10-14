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
