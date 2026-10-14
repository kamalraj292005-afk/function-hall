const paymentService = require('../services/paymentService');
const logger = require('../middleware/logger');

// Create payment order
exports.createOrder = async (req, res) => {
  try {
    const { bookingId, amount } = req.body;

    if (!bookingId || !amount) {
      return res.status(400).json({ success: false, message: 'Booking ID and amount are required.' });
    }

    const amountPaise = Math.round(parseFloat(amount) * 100);
    if (amountPaise <= 0) {
      return res.status(400).json({ success: false, message: 'Amount must be positive.' });
    }

    const order = await paymentService.createOrder(bookingId, amountPaise, req.user.id);

    res.json({
      success: true,
      order,
      razorpayConfigured: paymentService.isRazorpayConfigured()
    });
  } catch (err) {
    const statusCode = err.statusCode || 500;
    res.status(statusCode).json({ success: false, message: err.message });
  }
};

// Verify payment
exports.verifyPayment = (req, res) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;

    if (!razorpay_order_id || !razorpay_payment_id) {
      return res.status(400).json({ success: false, message: 'Payment details are required.' });
    }

    const result = paymentService.verifyPayment(
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature || ''
    );

    if (result.alreadyProcessed) {
      return res.json({ success: true, message: 'Payment already processed.', duplicate: true });
    }

    res.json({ success: true, message: 'Payment verified successfully!' });
  } catch (err) {
    const statusCode = err.statusCode || 500;
    res.status(statusCode).json({ success: false, message: err.message });
  }
};

// Webhook handler
exports.webhook = (req, res) => {
  try {
    const signature = req.headers['x-razorpay-signature'] || '';
    const body = req.rawBody || JSON.stringify(req.body);

    const result = paymentService.processWebhook(body, signature);

    res.json({ success: true, ...result });
  } catch (err) {
    logger.error('Webhook error', { error: err.message });
    const statusCode = err.statusCode || 500;
    res.status(statusCode).json({ success: false, message: err.message });
  }
};

// Record manual UPI payment
exports.recordManualPayment = (req, res) => {
  try {
    const { bookingId, amount, upiRef } = req.body;

    if (!bookingId || !amount) {
      return res.status(400).json({ success: false, message: 'Booking ID and amount are required.' });
    }

    const amountPaise = Math.round(parseFloat(amount) * 100);
    if (amountPaise <= 0) {
      return res.status(400).json({ success: false, message: 'Amount must be positive.' });
    }

    const result = paymentService.recordManualPayment(bookingId, req.user.id, amountPaise, upiRef);

    res.json({
      success: true,
      message: 'Manual payment recorded. Pending verification by the hall owner.',
      paymentRef: result.paymentRef
    });
  } catch (err) {
    const statusCode = err.statusCode || 500;
    res.status(statusCode).json({ success: false, message: err.message });
  }
};

// Get my payments
exports.getMyPayments = (req, res) => {
  try {
    const payments = paymentService.getUserPayments(req.user.id);
    res.json({ success: true, payments });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to fetch payments.' });
  }
};
