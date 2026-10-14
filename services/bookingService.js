const { getDb } = require('../database/db');
const logger = require('../middleware/logger');

class BookingService {
  // Generate unique booking reference
  generateBookingRef() {
    const prefix = 'PMH';
    const timestamp = Date.now().toString(36).toUpperCase();
    const random = Math.random().toString(36).substring(2, 6).toUpperCase();
    return `${prefix}-${timestamp}-${random}`;
  }

  // Calculate end date (inclusive) given start date string YYYY-MM-DD and numDays
  getEndDateStr(startDateStr, numDays = 1) {
    const start = new Date(startDateStr + 'T00:00:00+05:30');
    start.setDate(start.getDate() + (numDays - 1));
    const y = start.getFullYear();
    const m = String(start.getMonth() + 1).padStart(2, '0');
    const d = String(start.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  // Check if date or date range is available for a hall
  checkAvailability(hallId, startDate, numDays = 1, excludeBookingId = null) {
    const db = getDb();
    const endDate = this.getEndDateStr(startDate, numDays);

    let query = `
      SELECT id, booking_ref, event_date, num_days, booking_status FROM bookings
      WHERE hall_id = ?
        AND booking_status != 'cancelled'
        AND event_date <= ?
        AND date(event_date, '+' || (num_days - 1) || ' days') >= ?
    `;
    const params = [hallId, endDate, startDate];

    if (excludeBookingId) {
      query += ' AND id != ?';
      params.push(excludeBookingId);
    }

    const conflicts = db.prepare(query).all(...params);
    return conflicts.length === 0;
  }

  // Check availability for a range of dates and list unavailable ones
  checkDateRangeAvailability(hallId, startDate, numDays) {
    const unavailable = [];
    const start = new Date(startDate + 'T00:00:00+05:30');

    for (let i = 0; i < numDays; i++) {
      const cur = new Date(start);
      cur.setDate(cur.getDate() + i);
      const y = cur.getFullYear();
      const m = String(cur.getMonth() + 1).padStart(2, '0');
      const d = String(cur.getDate()).padStart(2, '0');
      const dateStr = `${y}-${m}-${d}`;

      if (!this.checkAvailability(hallId, dateStr, 1)) {
        unavailable.push(dateStr);
      }
    }

    return { available: unavailable.length === 0, unavailableDates: unavailable };
  }

  // Get availability for a month (Asia/Kolkata context)
  getMonthAvailability(hallId, year, month) {
    const db = getDb();
    const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
    const endDate = month === 12
      ? `${year + 1}-01-01`
      : `${year}-${String(month + 1).padStart(2, '0')}-01`;

    // Fetch any active bookings overlapping with this month
    const activeBookings = db.prepare(`
      SELECT event_date, num_days, booking_status FROM bookings
      WHERE hall_id = ?
        AND booking_status != 'cancelled'
        AND event_date < ?
        AND date(event_date, '+' || (num_days - 1) || ' days') >= ?
    `).all(hallId, endDate, startDate);

    const dateMap = {};

    activeBookings.forEach(b => {
      const bStart = new Date(b.event_date + 'T00:00:00+05:30');
      const status = b.booking_status === 'confirmed' ? 'booked' : 'pending';

      for (let i = 0; i < b.num_days; i++) {
        const d = new Date(bStart);
        d.setDate(d.getDate() + i);
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        const dateStr = `${y}-${m}-${day}`;

        // Only include dates in the requested month
        if (dateStr >= startDate && dateStr < endDate) {
          // If already marked as booked, don't downgrade to pending
          if (dateMap[dateStr] !== 'booked') {
            dateMap[dateStr] = status;
          }
        }
      }
    });

    return dateMap;
  }

  // Create booking atomically inside database transaction
  createBooking(userId, bookingData) {
    const db = getDb();
    const hallId = bookingData.hallId || 1;
    const hall = db.prepare('SELECT * FROM halls WHERE id = ? AND is_active = 1').get(hallId);

    if (!hall) {
      throw Object.assign(new Error('Hall not found or not active.'), { statusCode: 404 });
    }

    const numDays = parseInt(bookingData.numDays, 10) || 1;
    const totalAmountPaise = hall.daily_rent_paise * numDays;
    let advanceAmountPaise = hall.advance_amount_paise;

    // Advance must never exceed total
    if (advanceAmountPaise > totalAmountPaise) {
      advanceAmountPaise = totalAmountPaise;
    }

    const bookingRef = this.generateBookingRef();
    const eventDate = bookingData.eventDate;
    const endDate = this.getEndDateStr(eventDate, numDays);

    const result = db.transaction(() => {
      // Re-verify availability inside transaction immediately before inserting
      const conflicts = db.prepare(`
        SELECT id, booking_ref, event_date, num_days FROM bookings
        WHERE hall_id = ?
          AND booking_status != 'cancelled'
          AND event_date <= ?
          AND date(event_date, '+' || (num_days - 1) || ' days') >= ?
      `).all(hall.id, endDate, eventDate);

      if (conflicts.length > 0) {
        throw Object.assign(
          new Error(`The requested date range (${eventDate} to ${endDate}) is already booked. Please choose another date.`),
          { statusCode: 409 }
        );
      }

      const stmt = db.prepare(`
        INSERT INTO bookings (
          booking_ref, user_id, hall_id, customer_name, customer_mobile, customer_email,
          event_type, event_date, num_days, special_requirements, applied_daily_rent_paise,
          applied_advance_paise, total_amount_paise, booking_status, payment_status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', 'unpaid')
      `);

      const info = stmt.run(
        bookingRef,
        userId,
        hall.id,
        bookingData.customerName,
        bookingData.customerMobile,
        bookingData.customerEmail,
        bookingData.eventType,
        eventDate,
        numDays,
        bookingData.specialRequirements || '',
        hall.daily_rent_paise,
        advanceAmountPaise,
        totalAmountPaise
      );

      return { bookingId: info.lastInsertRowid, bookingRef };
    })();

    logger.info('Booking created', { bookingRef, userId, eventDate, numDays });
    return result;
  }

  // Get booking with full payments & balance
  getBooking(bookingId, userId = null, role = 'customer') {
    const db = getDb();
    let query = `
      SELECT b.*, h.name as hall_name, h.contact_number as hall_contact, h.address as hall_address
      FROM bookings b
      JOIN halls h ON b.hall_id = h.id
      WHERE b.id = ?
    `;
    const params = [bookingId];

    if (role === 'customer' && userId) {
      query += ' AND b.user_id = ?';
      params.push(userId);
    }

    const booking = db.prepare(query).get(...params);
    if (!booking) return null;

    const payments = db.prepare(`
      SELECT * FROM payments WHERE booking_id = ? ORDER BY created_at DESC
    `).all(bookingId);

    const totalPaidPaise = payments
      .filter(p => p.payment_status === 'success')
      .reduce((sum, p) => sum + p.amount_paise, 0);

    return {
      ...booking,
      payments,
      total_paid_paise: totalPaidPaise,
      remaining_paise: booking.total_amount_paise - totalPaidPaise
    };
  }

  // Get user bookings
  getUserBookings(userId) {
    const db = getDb();
    const bookings = db.prepare(`
      SELECT b.*, h.name as hall_name
      FROM bookings b
      JOIN halls h ON b.hall_id = h.id
      WHERE b.user_id = ?
      ORDER BY b.created_at DESC
    `).all(userId);

    return bookings.map(booking => {
      const payments = db.prepare(`
        SELECT * FROM payments WHERE booking_id = ? ORDER BY created_at DESC
      `).all(booking.id);

      const totalPaid = payments
        .filter(p => p.payment_status === 'success')
        .reduce((sum, p) => sum + p.amount_paise, 0);

      return {
        ...booking,
        payments,
        total_paid_paise: totalPaid,
        remaining_paise: booking.total_amount_paise - totalPaid
      };
    });
  }

  // Cancel booking
  cancelBooking(bookingId, userId, reason, cancelledBy) {
    const db = getDb();

    return db.transaction(() => {
      const booking = db.prepare('SELECT * FROM bookings WHERE id = ?').get(bookingId);
      if (!booking) {
        throw Object.assign(new Error('Booking not found.'), { statusCode: 404 });
      }
      if (booking.booking_status === 'cancelled') {
        throw Object.assign(new Error('Booking is already cancelled.'), { statusCode: 400 });
      }

      db.prepare(`
        UPDATE bookings SET booking_status = 'cancelled', cancellation_reason = ?,
        cancelled_by = ?, cancelled_at = datetime('now'), updated_at = datetime('now')
        WHERE id = ?
      `).run(reason || 'Customer requested cancellation', cancelledBy, bookingId);

      db.prepare(`
        INSERT INTO activity_logs (user_id, action, entity_type, entity_id, details)
        VALUES (?, 'booking_cancelled', 'booking', ?, ?)
      `).run(cancelledBy, bookingId, JSON.stringify({ reason, bookingRef: booking.booking_ref }));

      logger.info('Booking cancelled', { bookingId, bookingRef: booking.booking_ref, cancelledBy });
      return booking;
    })();
  }
}

module.exports = new BookingService();
