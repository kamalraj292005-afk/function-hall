const bookingService = require('../services/bookingService');
const { sanitizeString, validateFutureDate, validateMobile, validateEmail } = require('../middleware/validation');
const logger = require('../middleware/logger');
const { getDb } = require('../database/db');

// Create booking
exports.createBooking = (req, res) => {
  try {
    const { customerName, customerMobile, customerEmail, eventType, eventDate, numDays, specialRequirements, hallId } = req.body;

    // Validate
    if (!customerName || !customerMobile || !customerEmail || !eventType || !eventDate) {
      return res.status(400).json({ success: false, message: 'Please fill in all required fields.' });
    }
    if (!validateEmail(customerEmail)) {
      return res.status(400).json({ success: false, message: 'Please enter a valid email.' });
    }
    if (!validateMobile(customerMobile)) {
      return res.status(400).json({ success: false, message: 'Please enter a valid mobile number.' });
    }
    if (!validateFutureDate(eventDate)) {
      return res.status(400).json({ success: false, message: 'Event date must be today or in the future.' });
    }

    const days = parseInt(numDays, 10) || 1;
    if (days < 1 || days > 30) {
      return res.status(400).json({ success: false, message: 'Number of days must be between 1 and 30.' });
    }

    const result = bookingService.createBooking(req.user.id, {
      customerName: sanitizeString(customerName),
      customerMobile,
      customerEmail: customerEmail.toLowerCase(),
      eventType: sanitizeString(eventType),
      eventDate,
      numDays: days,
      specialRequirements: sanitizeString(specialRequirements || ''),
      hallId: hallId || 1
    });

    // Get the full booking
    const booking = bookingService.getBooking(result.bookingId, req.user.id);

    // Create notification
    const db = getDb();
    db.prepare(`
      INSERT INTO notifications (user_id, title, message, type)
      VALUES (?, 'Booking Created', ?, 'info')
    `).run(req.user.id, `Your booking ${result.bookingRef} for ${eventDate} has been created. Please pay the advance to confirm.`);

    res.status(201).json({
      success: true,
      message: 'Booking created successfully! Please pay the advance amount to confirm.',
      booking
    });
  } catch (err) {
    const statusCode = err.statusCode || 500;
    res.status(statusCode).json({ success: false, message: err.message });
  }
};

// Get my bookings
exports.getMyBookings = (req, res) => {
  try {
    const bookings = bookingService.getUserBookings(req.user.id);
    res.json({ success: true, bookings });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to fetch bookings.' });
  }
};

// Get single booking
exports.getBooking = (req, res) => {
  try {
    const booking = bookingService.getBooking(
      parseInt(req.params.id, 10),
      req.user.id,
      req.user.role
    );

    if (!booking) {
      return res.status(404).json({ success: false, message: 'Booking not found.' });
    }

    res.json({ success: true, booking });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to fetch booking.' });
  }
};

// Cancel booking
exports.cancelBooking = (req, res) => {
  try {
    const bookingId = parseInt(req.params.id, 10);
    const { reason } = req.body;

    // Verify ownership for customers
    if (req.user.role === 'customer') {
      const db = getDb();
      const booking = db.prepare('SELECT * FROM bookings WHERE id = ? AND user_id = ?').get(bookingId, req.user.id);
      if (!booking) {
        return res.status(404).json({ success: false, message: 'Booking not found.' });
      }
    }

    bookingService.cancelBooking(bookingId, req.user.id, reason, req.user.id);

    res.json({ success: true, message: 'Booking cancellation request submitted.' });
  } catch (err) {
    const statusCode = err.statusCode || 500;
    res.status(statusCode).json({ success: false, message: err.message });
  }
};
