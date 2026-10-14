const { getDb } = require('../database/db');
const logger = require('../middleware/logger');

// Admin dashboard metrics
exports.getDashboard = (req, res) => {
  try {
    const db = getDb();

    // User counts
    const totalUsers = db.prepare('SELECT COUNT(*) as count FROM users').get().count;
    const customerCount = db.prepare('SELECT COUNT(*) as count FROM users WHERE role = ?').get('customer').count;
    const ownerCount = db.prepare('SELECT COUNT(*) as count FROM users WHERE role = ?').get('owner').count;
    const adminCount = db.prepare('SELECT COUNT(*) as count FROM users WHERE role = ?').get('admin').count;

    // Booking counts
    const totalBookings = db.prepare('SELECT COUNT(*) as count FROM bookings').get().count;
    const confirmedBookings = db.prepare('SELECT COUNT(*) as count FROM bookings WHERE booking_status = ?').get('confirmed').count;
    const pendingBookings = db.prepare('SELECT COUNT(*) as count FROM bookings WHERE booking_status = ?').get('pending').count;
    const cancelledBookings = db.prepare('SELECT COUNT(*) as count FROM bookings WHERE booking_status = ?').get('cancelled').count;

    // Financials (strictly verified success payments)
    const verifiedRevenue = db.prepare(`
      SELECT COALESCE(SUM(amount_paise), 0) as total
      FROM payments WHERE payment_status = 'success'
    `).get().total;

    const totalTransactions = db.prepare('SELECT COUNT(*) as count FROM payments').get().count;
    const successfulTransactions = db.prepare("SELECT COUNT(*) as count FROM payments WHERE payment_status = 'success'").get().count;

    // Recent activity logs
    const recentLogs = db.prepare(`
      SELECT a.*, u.full_name as user_name, u.email as user_email, u.role as user_role
      FROM activity_logs a
      LEFT JOIN users u ON a.user_id = u.id
      ORDER BY a.created_at DESC LIMIT 10
    `).all();

    res.json({
      success: true,
      stats: {
        users: { total: totalUsers, customers: customerCount, owners: ownerCount, admins: adminCount },
        bookings: { total: totalBookings, confirmed: confirmedBookings, pending: pendingBookings, cancelled: cancelledBookings },
        financials: {
          verifiedRevenueRupees: verifiedRevenue / 100,
          verifiedRevenuePaise: verifiedRevenue,
          totalTransactions,
          successfulTransactions
        }
      },
      recentLogs
    });
  } catch (err) {
    logger.error('Admin dashboard error', { error: err.message });
    res.status(500).json({ success: false, message: 'Failed to fetch admin dashboard data.' });
  }
};

// Get users list
exports.getUsers = (req, res) => {
  try {
    const db = getDb();
    const { role, search, status } = req.query;

    let query = 'SELECT id, uuid, full_name, email, mobile, role, is_active, created_at, updated_at FROM users WHERE 1=1';
    const params = [];

    if (role) {
      query += ' AND role = ?';
      params.push(role);
    }
    if (status !== undefined && status !== '') {
      query += ' AND is_active = ?';
      params.push(status === 'active' || status === '1' ? 1 : 0);
    }
    if (search) {
      query += ' AND (full_name LIKE ? OR email LIKE ? OR mobile LIKE ?)';
      const s = `%${search}%`;
      params.push(s, s, s);
    }

    query += ' ORDER BY created_at DESC';

    const users = db.prepare(query).all(...params);

    res.json({ success: true, users });
  } catch (err) {
    logger.error('Admin getUsers error', { error: err.message });
    res.status(500).json({ success: false, message: 'Failed to fetch users.' });
  }
};

// Update user (role, active status)
exports.updateUser = (req, res) => {
  try {
    const db = getDb();
    const userId = parseInt(req.params.id, 10);
    const { role, isActive } = req.body;

    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }

    // Prevent self-deactivation or self-demotion
    if (userId === req.user.id && (isActive === false || (role && role !== 'admin'))) {
      return res.status(400).json({ success: false, message: 'You cannot deactivate or demote your own administrator account.' });
    }

    const updates = [];
    const params = [];

    if (role && ['customer', 'owner', 'admin'].includes(role)) {
      updates.push('role = ?');
      params.push(role);
    }

    if (isActive !== undefined) {
      updates.push('is_active = ?');
      params.push(isActive ? 1 : 0);
    }

    if (updates.length > 0) {
      updates.push("updated_at = datetime('now')");
      params.push(userId);
      db.prepare(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`).run(...params);

      db.prepare(`
        INSERT INTO activity_logs (user_id, action, entity_type, entity_id, details)
        VALUES (?, 'user_updated_by_admin', 'user', ?, ?)
      `).run(req.user.id, userId, JSON.stringify({ role, isActive }));
    }

    const updated = db.prepare('SELECT id, uuid, full_name, email, mobile, role, is_active FROM users WHERE id = ?').get(userId);

    res.json({ success: true, message: 'User updated successfully.', user: updated });
  } catch (err) {
    logger.error('Admin updateUser error', { error: err.message });
    res.status(500).json({ success: false, message: 'Failed to update user.' });
  }
};

// Get all bookings
exports.getBookings = (req, res) => {
  try {
    const db = getDb();
    const { status, fromDate, toDate, search } = req.query;

    let query = `
      SELECT b.*, h.name as hall_name, u.full_name as registered_user_name, u.email as registered_user_email
      FROM bookings b
      JOIN halls h ON b.hall_id = h.id
      JOIN users u ON b.user_id = u.id
      WHERE 1=1
    `;
    const params = [];

    if (status) {
      query += ' AND b.booking_status = ?';
      params.push(status);
    }
    if (fromDate) {
      query += ' AND b.event_date >= ?';
      params.push(fromDate);
    }
    if (toDate) {
      query += ' AND b.event_date <= ?';
      params.push(toDate);
    }
    if (search) {
      query += ' AND (b.booking_ref LIKE ? OR b.customer_name LIKE ? OR b.customer_mobile LIKE ?)';
      const s = `%${search}%`;
      params.push(s, s, s);
    }

    query += ' ORDER BY b.created_at DESC';

    const bookings = db.prepare(query).all(...params);

    const enriched = bookings.map(b => {
      const payments = db.prepare('SELECT * FROM payments WHERE booking_id = ? ORDER BY created_at DESC').all(b.id);
      const paid = payments.filter(p => p.payment_status === 'success').reduce((sum, p) => sum + p.amount_paise, 0);
      return {
        ...b,
        payments,
        total_paid_paise: paid,
        remaining_paise: b.total_amount_paise - paid
      };
    });

    res.json({ success: true, bookings: enriched });
  } catch (err) {
    logger.error('Admin getBookings error', { error: err.message });
    res.status(500).json({ success: false, message: 'Failed to fetch bookings.' });
  }
};

// Get payments
exports.getPayments = (req, res) => {
  try {
    const db = getDb();
    const { status, method } = req.query;

    let query = `
      SELECT p.*, b.booking_ref, b.customer_name, b.customer_mobile, b.event_date, u.email as user_email
      FROM payments p
      JOIN bookings b ON p.booking_id = b.id
      JOIN users u ON p.user_id = u.id
      WHERE 1=1
    `;
    const params = [];

    if (status) {
      query += ' AND p.payment_status = ?';
      params.push(status);
    }
    if (method) {
      query += ' AND p.payment_method = ?';
      params.push(method);
    }

    query += ' ORDER BY p.created_at DESC';

    const payments = db.prepare(query).all(...params);

    res.json({ success: true, payments });
  } catch (err) {
    logger.error('Admin getPayments error', { error: err.message });
    res.status(500).json({ success: false, message: 'Failed to fetch payments.' });
  }
};

// Get activity logs
exports.getActivityLogs = (req, res) => {
  try {
    const db = getDb();
    const logs = db.prepare(`
      SELECT a.*, u.full_name as user_name, u.email as user_email, u.role as user_role
      FROM activity_logs a
      LEFT JOIN users u ON a.user_id = u.id
      ORDER BY a.created_at DESC LIMIT 200
    `).all();

    res.json({ success: true, logs });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to fetch activity logs.' });
  }
};
