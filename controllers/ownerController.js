const { getDb } = require('../database/db');
const paymentService = require('../services/paymentService');
const logger = require('../middleware/logger');
const fs = require('fs');
const path = require('path');

// Owner dashboard metrics
exports.getDashboard = (req, res) => {
  try {
    const db = getDb();
    const today = new Date().toISOString().split('T')[0];

    // Total bookings
    const totalBookings = db.prepare('SELECT COUNT(*) as count FROM bookings').get().count;

    // Today's bookings
    const todayBookings = db.prepare(`
      SELECT COUNT(*) as count FROM bookings
      WHERE event_date <= ? AND date(event_date, '+' || (num_days - 1) || ' days') >= ? AND booking_status != 'cancelled'
    `).get(today, today).count;

    // Upcoming bookings
    const upcomingBookings = db.prepare(`
      SELECT COUNT(*) as count FROM bookings
      WHERE event_date >= ? AND booking_status != 'cancelled'
    `).get(today).count;

    // Pending manual payments
    const pendingPaymentsCount = db.prepare(`
      SELECT COUNT(*) as count FROM payments
      WHERE payment_method = 'manual_upi' AND payment_status = 'pending'
    `).get().count;

    // Verified revenue (ONLY success payments count towards revenue!)
    const verifiedRevenue = db.prepare(`
      SELECT COALESCE(SUM(amount_paise), 0) as total
      FROM payments WHERE payment_status = 'success'
    `).get().total;

    // Outstanding balance across active bookings
    const outstandingBookings = db.prepare(`
      SELECT id, total_amount_paise FROM bookings WHERE booking_status != 'cancelled'
    `).all();

    let totalOutstandingPaise = 0;
    for (const b of outstandingBookings) {
      const paid = db.prepare(`
        SELECT COALESCE(SUM(amount_paise), 0) as paid
        FROM payments WHERE booking_id = ? AND payment_status = 'success'
      `).get(b.id).paid;
      const remaining = b.total_amount_paise - paid;
      if (remaining > 0) totalOutstandingPaise += remaining;
    }

    // Recent 10 bookings
    const recentBookings = db.prepare(`
      SELECT b.*, h.name as hall_name
      FROM bookings b
      JOIN halls h ON b.hall_id = h.id
      ORDER BY b.created_at DESC LIMIT 10
    `).all();

    // Pending manual verification list
    const pendingManualPayments = db.prepare(`
      SELECT p.*, b.booking_ref, b.customer_name, b.customer_mobile, b.event_date
      FROM payments p
      JOIN bookings b ON p.booking_id = b.id
      WHERE p.payment_method = 'manual_upi' AND p.payment_status = 'pending'
      ORDER BY p.created_at DESC
    `).all();

    res.json({
      success: true,
      stats: {
        totalBookings,
        todayBookings,
        upcomingBookings,
        pendingPaymentsCount,
        verifiedRevenuePaise: verifiedRevenue,
        verifiedRevenueRupees: verifiedRevenue / 100,
        totalOutstandingPaise,
        totalOutstandingRupees: totalOutstandingPaise / 100
      },
      recentBookings,
      pendingManualPayments
    });
  } catch (err) {
    logger.error('Owner dashboard error', { error: err.message });
    res.status(500).json({ success: false, message: 'Failed to fetch owner dashboard data.' });
  }
};

// Get all bookings with filtering & search
exports.getBookings = (req, res) => {
  try {
    const db = getDb();
    const { status, search, fromDate, toDate } = req.query;

    let query = `
      SELECT b.*, h.name as hall_name
      FROM bookings b
      JOIN halls h ON b.hall_id = h.id
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
      query += ' AND (b.booking_ref LIKE ? OR b.customer_name LIKE ? OR b.customer_mobile LIKE ? OR b.customer_email LIKE ?)';
      const s = `%${search}%`;
      params.push(s, s, s, s);
    }

    query += ' ORDER BY b.event_date DESC, b.created_at DESC';

    const bookings = db.prepare(query).all(...params);

    const enriched = bookings.map(b => {
      const payments = db.prepare(`
        SELECT * FROM payments WHERE booking_id = ? ORDER BY created_at DESC
      `).all(b.id);
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
    logger.error('Fetch owner bookings error', { error: err.message });
    res.status(500).json({ success: false, message: 'Failed to load bookings.' });
  }
};

// Update booking status (confirm, cancel, etc.)
exports.updateBooking = (req, res) => {
  try {
    const db = getDb();
    const bookingId = parseInt(req.params.id, 10);
    const { status, cancellationReason } = req.body;

    const booking = db.prepare('SELECT * FROM bookings WHERE id = ?').get(bookingId);
    if (!booking) {
      return res.status(404).json({ success: false, message: 'Booking not found.' });
    }

    if (status === 'cancelled') {
      db.prepare(`
        UPDATE bookings SET booking_status = 'cancelled', cancellation_reason = ?,
        cancelled_by = ?, cancelled_at = datetime('now'), updated_at = datetime('now')
        WHERE id = ?
      `).run(cancellationReason || 'Cancelled by hall management', req.user.id, bookingId);

      // Notify customer
      db.prepare(`
        INSERT INTO notifications (user_id, title, message, type)
        VALUES (?, 'Booking Cancelled', ?, 'warning')
      `).run(booking.user_id, `Your booking ${booking.booking_ref} for ${booking.event_date} was cancelled by the hall management.`);
    } else if (status === 'confirmed') {
      db.prepare(`
        UPDATE bookings SET booking_status = 'confirmed', updated_at = datetime('now')
        WHERE id = ?
      `).run(bookingId);

      db.prepare(`
        INSERT INTO notifications (user_id, title, message, type)
        VALUES (?, 'Booking Confirmed', ?, 'success')
      `).run(booking.user_id, `Your booking ${booking.booking_ref} for ${booking.event_date} has been confirmed by the owner!`);
    }

    db.prepare(`
      INSERT INTO activity_logs (user_id, action, entity_type, entity_id, details)
      VALUES (?, 'booking_status_updated', 'booking', ?, ?)
    `).run(req.user.id, bookingId, JSON.stringify({ oldStatus: booking.booking_status, newStatus: status }));

    res.json({ success: true, message: `Booking status updated to ${status}.` });
  } catch (err) {
    logger.error('Update booking error', { error: err.message });
    res.status(500).json({ success: false, message: 'Failed to update booking.' });
  }
};

// Update hall settings (rent, advance, details)
exports.updateSettings = (req, res) => {
  try {
    const db = getDb();
    const hallId = req.body.hallId || 1;
    const { name, address, contactNumber, dailyRentRupees, advanceAmountRupees, description, facilities } = req.body;

    const hall = db.prepare('SELECT * FROM halls WHERE id = ?').get(hallId);
    if (!hall) {
      return res.status(404).json({ success: false, message: 'Hall not found.' });
    }

    const updates = [];
    const params = [];

    if (name) { updates.push('name = ?'); params.push(name.trim()); }
    if (address) { updates.push('address = ?'); params.push(address.trim()); }
    if (contactNumber) { updates.push('contact_number = ?'); params.push(contactNumber.trim()); }
    if (dailyRentRupees !== undefined) {
      const rentPaise = Math.round(parseFloat(dailyRentRupees) * 100);
      if (rentPaise > 0) {
        updates.push('daily_rent_paise = ?');
        params.push(rentPaise);
      }
    }
    if (advanceAmountRupees !== undefined) {
      const advPaise = Math.round(parseFloat(advanceAmountRupees) * 100);
      if (advPaise > 0) {
        updates.push('advance_amount_paise = ?');
        params.push(advPaise);
      }
    }
    if (description !== undefined) { updates.push('description = ?'); params.push(description.trim()); }
    if (facilities !== undefined) {
      const facArray = Array.isArray(facilities) ? facilities : facilities.split(',').map(s => s.trim()).filter(Boolean);
      updates.push('facilities = ?');
      params.push(JSON.stringify(facArray));
    }

    if (updates.length > 0) {
      updates.push("updated_at = datetime('now')");
      params.push(hallId);
      db.prepare(`UPDATE halls SET ${updates.join(', ')} WHERE id = ?`).run(...params);

      db.prepare(`
        INSERT INTO activity_logs (user_id, action, entity_type, entity_id, details)
        VALUES (?, 'hall_settings_updated', 'hall', ?, ?)
      `).run(req.user.id, hallId, JSON.stringify({ updates: req.body }));
    }

    const updatedHall = db.prepare('SELECT * FROM halls WHERE id = ?').get(hallId);

    res.json({
      success: true,
      message: 'Hall settings updated successfully.',
      hall: {
        ...updatedHall,
        daily_rent: updatedHall.daily_rent_paise / 100,
        advance_amount: updatedHall.advance_amount_paise / 100,
        facilities: JSON.parse(updatedHall.facilities || '[]')
      }
    });
  } catch (err) {
    logger.error('Update hall settings error', { error: err.message });
    res.status(500).json({ success: false, message: 'Failed to update hall settings.' });
  }
};

// Upload hall image
exports.uploadImage = (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'No image file uploaded.' });
    }

    const db = getDb();
    const hallId = parseInt(req.body.hallId, 10) || 1;
    const file = req.file;

    const count = db.prepare('SELECT COUNT(*) as count FROM hall_images WHERE hall_id = ?').get(hallId).count;

    const result = db.prepare(`
      INSERT INTO hall_images (hall_id, filename, original_name, file_path, file_size, mime_type, sort_order, uploaded_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      hallId,
      file.filename,
      file.originalname,
      `/images/uploads/${file.filename}`,
      file.size,
      file.mimetype,
      count,
      req.user.id
    );

    db.prepare(`
      INSERT INTO activity_logs (user_id, action, entity_type, entity_id, details)
      VALUES (?, 'image_uploaded', 'hall_images', ?, ?)
    `).run(req.user.id, result.lastInsertRowid, JSON.stringify({ filename: file.filename }));

    res.status(201).json({
      success: true,
      message: 'Image uploaded successfully.',
      image: {
        id: result.lastInsertRowid,
        filename: file.filename,
        original_name: file.originalname,
        file_path: `/images/uploads/${file.filename}`,
        sort_order: count
      }
    });
  } catch (err) {
    logger.error('Upload image error', { error: err.message });
    res.status(500).json({ success: false, message: 'Failed to upload image.' });
  }
};

// Delete hall image
exports.deleteImage = (req, res) => {
  try {
    const db = getDb();
    const imageId = parseInt(req.params.id, 10);

    const image = db.prepare('SELECT * FROM hall_images WHERE id = ?').get(imageId);
    if (!image) {
      return res.status(404).json({ success: false, message: 'Image not found.' });
    }

    // Delete file from disk if it was an uploaded file
    if (image.file_path.startsWith('/images/uploads/')) {
      const fullPath = path.join(__dirname, '..', 'public', image.file_path);
      if (fs.existsSync(fullPath)) {
        try { fs.unlinkSync(fullPath); } catch (e) { logger.warn('Failed to delete file from disk', { path: fullPath }); }
      }
    }

    db.prepare('DELETE FROM hall_images WHERE id = ?').run(imageId);

    db.prepare(`
      INSERT INTO activity_logs (user_id, action, entity_type, entity_id, details)
      VALUES (?, 'image_deleted', 'hall_images', ?, ?)
    `).run(req.user.id, imageId, JSON.stringify({ filename: image.filename }));

    res.json({ success: true, message: 'Image deleted successfully.' });
  } catch (err) {
    logger.error('Delete image error', { error: err.message });
    res.status(500).json({ success: false, message: 'Failed to delete image.' });
  }
};

// Get payments list for owner
exports.getPayments = (req, res) => {
  try {
    const db = getDb();
    const { status, method } = req.query;

    let query = `
      SELECT p.*, b.booking_ref, b.customer_name, b.customer_mobile, b.event_date
      FROM payments p
      JOIN bookings b ON p.booking_id = b.id
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
    logger.error('Fetch payments error', { error: err.message });
    res.status(500).json({ success: false, message: 'Failed to fetch payments.' });
  }
};

// Verify manual UPI payment
exports.verifyManualPayment = (req, res) => {
  try {
    const paymentId = parseInt(req.params.id, 10);
    const { approve } = req.body;

    const result = paymentService.verifyManualPayment(paymentId, req.user.id, approve !== false);

    res.json({
      success: true,
      message: approve !== false ? 'Payment verified and marked as PAID.' : 'Payment marked as REJECTED.'
    });
  } catch (err) {
    const statusCode = err.statusCode || 500;
    res.status(statusCode).json({ success: false, message: err.message });
  }
};

// Get activity logs
exports.getActivityLogs = (req, res) => {
  try {
    const db = getDb();
    const logs = db.prepare(`
      SELECT a.*, u.full_name as user_name, u.role as user_role
      FROM activity_logs a
      LEFT JOIN users u ON a.user_id = u.id
      ORDER BY a.created_at DESC LIMIT 100
    `).all();

    res.json({ success: true, logs });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to fetch activity logs.' });
  }
};

// Export CSV report
exports.exportReportCsv = (req, res) => {
  try {
    const db = getDb();
    const bookings = db.prepare(`
      SELECT b.booking_ref, b.customer_name, b.customer_mobile, b.customer_email,
             b.event_type, b.event_date, b.num_days,
             (b.total_amount_paise / 100.0) as total_rupees,
             (b.applied_advance_paise / 100.0) as advance_rupees,
             b.booking_status, b.payment_status, b.created_at
      FROM bookings b
      ORDER BY b.event_date DESC
    `).all();

    const headers = ['Booking Ref', 'Customer Name', 'Mobile', 'Email', 'Event Type', 'Event Date', 'Days', 'Total (INR)', 'Advance (INR)', 'Booking Status', 'Payment Status', 'Created At'];
    const rows = bookings.map(b => [
      `"${b.booking_ref}"`,
      `"${b.customer_name.replace(/"/g, '""')}"`,
      `"${b.customer_mobile}"`,
      `"${b.customer_email}"`,
      `"${b.event_type}"`,
      `"${b.event_date}"`,
      b.num_days,
      b.total_rupees,
      b.advance_rupees,
      b.booking_status,
      b.payment_status,
      `"${b.created_at}"`
    ]);

    const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="palani_murugan_bookings_report.csv"');
    res.send(csvContent);
  } catch (err) {
    logger.error('Export CSV error', { error: err.message });
    res.status(500).json({ success: false, message: 'Failed to export report.' });
  }
};
