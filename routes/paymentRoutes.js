const express = require('express');
const router = express.Router();
const paymentController = require('../controllers/paymentController');
const { authenticate } = require('../middleware/auth');
const rateLimit = require('express-rate-limit');

const paymentLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 15,
  message: { success: false, message: 'Too many payment requests. Please try again in a moment.' }
});

router.post('/create-order', authenticate, paymentLimiter, paymentController.createOrder);
router.post('/verify', authenticate, paymentLimiter, paymentController.verifyPayment);
router.post('/manual', authenticate, paymentLimiter, paymentController.recordManualPayment);
router.get('/my', authenticate, paymentController.getMyPayments);

// Webhook endpoint does NOT require JWT auth, but verifies Razorpay signature via raw body
router.post('/webhook', paymentController.webhook);

module.exports = router;
