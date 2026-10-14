const express = require('express');
const router = express.Router();
const bookingController = require('../controllers/bookingController');
const { authenticate } = require('../middleware/auth');
const rateLimit = require('express-rate-limit');

// Rate limiting for booking submissions
const bookingLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 10,
  message: { success: false, message: 'Too many booking requests. Please wait a moment.' }
});

router.post('/', authenticate, bookingLimiter, bookingController.createBooking);
router.get('/my', authenticate, bookingController.getMyBookings);
router.get('/:id', authenticate, bookingController.getBooking);
router.post('/:id/cancel', authenticate, bookingController.cancelBooking);

module.exports = router;
