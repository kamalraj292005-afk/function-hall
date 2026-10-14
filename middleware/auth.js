const jwt = require('jsonwebtoken');
const { getDb } = require('../database/db');
const logger = require('./logger');

// Authenticate JWT token
function authenticate(req, res, next) {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.split(' ')[1] : null;

  if (!token) {
    return res.status(401).json({ success: false, message: 'Authentication required. Please log in.' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const db = getDb();
    const user = db.prepare('SELECT id, uuid, full_name, email, mobile, role, is_active FROM users WHERE id = ?').get(decoded.userId);
    
    if (!user) {
      return res.status(401).json({ success: false, message: 'User not found.' });
    }

    if (!user.is_active) {
      return res.status(403).json({ success: false, message: 'Account has been deactivated. Please contact support.' });
    }

    req.user = user;
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ success: false, message: 'Session expired. Please log in again.' });
    }
    logger.warn('Invalid token attempt', { error: err.message });
    return res.status(401).json({ success: false, message: 'Invalid authentication token.' });
  }
}

// Optional authentication - sets user if token exists but doesn't fail
function optionalAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.split(' ')[1] : null;

  if (token) {
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const db = getDb();
      req.user = db.prepare('SELECT id, uuid, full_name, email, mobile, role, is_active FROM users WHERE id = ? AND is_active = 1').get(decoded.userId);
    } catch (err) {
      // Token invalid, continue without user
    }
  }
  next();
}

// Role-based authorization
function authorize(...roles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ success: false, message: 'Authentication required.' });
    }
    if (!roles.includes(req.user.role)) {
      logger.warn('Unauthorized access attempt', { userId: req.user.id, role: req.user.role, requiredRoles: roles });
      return res.status(403).json({ success: false, message: 'You do not have permission to access this resource.' });
    }
    next();
  };
}

module.exports = { authenticate, optionalAuth, authorize };
