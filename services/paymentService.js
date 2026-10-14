const { getDb } = require('../database/db');
const { v4: uuidv4 } = require('uuid');
const crypto = require('crypto');
const logger = require('../middleware/logger');

class PaymentService {
  constructor() {
    this.razorpay = null;
  }

  // Initialize Razorpay if credentials are available
  getRazorpay() {
    if (this.razorpay) return this.razorpay;

    const keyId = process.env.RAZORPAY_KEY_ID;
    const keySecret = process.env.RAZORPAY_KEY_SECRET;

    if (!keyId || !keySecret) {
      return null;
    }

    try {
      const Razorpay = require('razorpay');
      this.razorpay = new Razorpay({ key_id: keyId, key_secret: keySecret });
      return this.razorpay;
    } catch (err) {
      logger.error('Failed to initialize Razorpay', { error: err.message });
      return null;
    }
  }

  isRazorpayConfigured() {
    return !!(process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET);
  }

  // Generate payment reference
  generatePaymentRef() {
    return `PAY-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
  }

  // Create Razorpay order
  async createOrder(bookingId, amountPaise, userId) {
    const db = getDb();
    const booking = db.prepare('SELECT * FROM bookings WHERE id = ? AND user_id = ?').get(bookingId, userId);

    if (!booking) {
      throw Object.assign(new Error('Booking not found.'), { statusCode: 404 });
    }

    if (booking.booking_status === 'cancelled') {
      throw Object.assign(new Error('Cannot pay for a cancelled booking.'), { statusCode: 400 });
    }

    // Calculate remaining balance
    const paidAmount = db.prepare(`
      SELECT COALESCE(SUM(amount_paise), 0) as total
      FROM payments WHERE booking_id = ? AND payment_status = 'success'
    `).get(bookingId).total;

    const remainingAmount = booking.total_amount_paise - paidAmount;

    if (amountPaise > remainingAmount) {
      throw Object.assign(new Error('Payment amount exceeds remaining balance.'), { statusCode: 400 });
    }

    if (amountPaise <= 0) {
      throw Object.assign(new Error('Payment amount must be positive.'), { statusCode: 400 });
    }

    const razorpay = this.getRazorpay();
    const paymentRef = this.generatePaymentRef();

    if (razorpay) {
      // Create Razorpay order
      try {
        const order = await razorpay.orders.create({
          amount: amountPaise,
          currency: 'INR',
          receipt: paymentRef,
          notes: {
            booking_ref: booking.booking_ref,
            booking_id: bookingId.toString()
          }
        });

        // Save payment record
        db.prepare(`
          INSERT INTO payments (payment_ref, booking_id, user_id, amount_paise, payment_method,
            razorpay_order_id, payment_status)
          VALUES (?, ?, ?, ?, 'razorpay', ?, 'pending')
        `).run(paymentRef, bookingId, userId, amountPaise, order.id);

        logger.info('Razorpay order created', { paymentRef, orderId: order.id, amountPaise });

        return {
          orderId: order.id,
          amount: amountPaise,
          currency: 'INR',
          paymentRef,
          key: process.env.RAZORPAY_KEY_ID,
          bookingRef: booking.booking_ref,
          customerName: booking.customer_name,
          customerEmail: booking.customer_email,
          customerMobile: booking.customer_mobile
        };
      } catch (err) {
        logger.error('Failed to create Razorpay order', { error: err.message });
        throw Object.assign(new Error('Payment gateway error. Please try again.'), { statusCode: 500 });
      }
    } else {
      // Test mode - create a mock order
      const mockOrderId = `order_test_${Date.now()}`;

      db.prepare(`
        INSERT INTO payments (payment_ref, booking_id, user_id, amount_paise, payment_method,
          razorpay_order_id, payment_status, notes)
        VALUES (?, ?, ?, ?, 'razorpay', ?, 'pending', 'TEST MODE - Razorpay not configured')
      `).run(paymentRef, bookingId, userId, amountPaise, mockOrderId);

      logger.info('Test mode order created', { paymentRef, mockOrderId, amountPaise });

      return {
        orderId: mockOrderId,
        amount: amountPaise,
        currency: 'INR',
        paymentRef,
        key: 'rzp_test_placeholder',
        testMode: true,
        bookingRef: booking.booking_ref,
        customerName: booking.customer_name,
        customerEmail: booking.customer_email,
        customerMobile: booking.customer_mobile
      };
    }
  }

  // Verify Razorpay payment signature
  verifyPayment(orderId, paymentId, signature) {
    const db = getDb();

    // Find payment record
    const payment = db.prepare('SELECT * FROM payments WHERE razorpay_order_id = ?').get(orderId);
    if (!payment) {
      throw Object.assign(new Error('Payment record not found.'), { statusCode: 404 });
    }

    // Prevent duplicate processing
    if (payment.payment_status === 'success') {
      logger.warn('Duplicate payment verification attempt', { orderId });
      return { alreadyProcessed: true, payment };
    }

    const razorpay = this.getRazorpay();

    if (razorpay) {
      // Verify signature
      const expectedSignature = crypto
        .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
        .update(`${orderId}|${paymentId}`)
        .digest('hex');

      if (expectedSignature !== signature) {
        db.prepare(`
          UPDATE payments SET payment_status = 'failed', razorpay_payment_id = ?,
          notes = 'Signature verification failed', updated_at = datetime('now')
          WHERE id = ?
        `).run(paymentId, payment.id);

        logger.warn('Payment signature verification failed', { orderId, paymentId });
        throw Object.assign(new Error('Payment verification failed.'), { statusCode: 400 });
      }
    } else {
      // Test mode - check for test prefix
      if (!orderId.startsWith('order_test_')) {
        throw Object.assign(new Error('Invalid test payment.'), { statusCode: 400 });
      }
    }

    // Update payment and booking in transaction
    return db.transaction(() => {
      // Mark payment as success
      db.prepare(`
        UPDATE payments SET payment_status = 'success', razorpay_payment_id = ?,
        razorpay_signature = ?, verified_at = datetime('now'), updated_at = datetime('now')
        WHERE id = ?
      `).run(paymentId, signature, payment.id);

      // Calculate verified total paid
      const totalPaid = db.prepare(`
        SELECT COALESCE(SUM(amount_paise), 0) as total
        FROM payments WHERE booking_id = ? AND payment_status = 'success'
      `).get(payment.booking_id).total;

      const booking = db.prepare('SELECT * FROM bookings WHERE id = ?').get(payment.booking_id);

      const newPaymentStatus = totalPaid >= booking.total_amount_paise
        ? 'paid'
        : (totalPaid >= booking.applied_advance_paise ? 'pending' : 'unpaid');

      const newBookingStatus = totalPaid >= booking.applied_advance_paise && booking.booking_status === 'pending'
        ? 'confirmed'
        : booking.booking_status;

      db.prepare(`
        UPDATE bookings SET booking_status = ?, payment_status = ?, updated_at = datetime('now')
        WHERE id = ?
      `).run(newBookingStatus, newPaymentStatus, payment.booking_id);

      // Log activity
      db.prepare(`
        INSERT INTO activity_logs (user_id, action, entity_type, entity_id, details)
        VALUES (?, 'payment_verified', 'payment', ?, ?)
      `).run(payment.user_id, payment.id, JSON.stringify({
        amount_paise: payment.amount_paise,
        razorpay_payment_id: paymentId,
        booking_ref: booking.booking_ref
      }));

      // Create notification
      db.prepare(`
        INSERT INTO notifications (user_id, title, message, type)
        VALUES (?, 'Payment Successful', ?, 'success')
      `).run(payment.user_id, `Your payment of ₹${(payment.amount_paise / 100).toLocaleString('en-IN')} for booking ${booking.booking_ref} was successful.`);

      logger.info('Payment verified successfully', { paymentId, orderId, amountPaise: payment.amount_paise });

      return { success: true, payment, booking };
    })();
  }

  // Process webhook event
  processWebhook(body, signature) {
    const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;

    if (webhookSecret) {
      const expectedSignature = crypto
        .createHmac('sha256', webhookSecret)
        .update(body)
        .digest('hex');

      if (expectedSignature !== signature) {
        logger.warn('Webhook signature verification failed');
        throw Object.assign(new Error('Invalid webhook signature.'), { statusCode: 400 });
      }
    }

    const event = JSON.parse(body);
    const db = getDb();

    if (event.event === 'payment.captured' || event.event === 'payment.authorized') {
      const paymentEntity = event.payload.payment.entity;
      const orderId = paymentEntity.order_id;
      const paymentId = paymentEntity.id;

      const payment = db.prepare('SELECT * FROM payments WHERE razorpay_order_id = ?').get(orderId);
      if (!payment) {
        logger.warn('Webhook: payment record not found', { orderId });
        return { processed: false, reason: 'Payment record not found' };
      }

      // Idempotent - skip if already processed
      if (payment.payment_status === 'success' && payment.razorpay_payment_id === paymentId) {
        logger.info('Webhook: duplicate event, already processed', { orderId, paymentId });
        return { processed: true, duplicate: true };
      }

      // Verify and process
      try {
        this.verifyPayment(orderId, paymentId, '');
      } catch (err) {
        // In webhook context, we might not have the browser signature
        // Update directly if webhook signature was valid
        db.prepare(`
          UPDATE payments SET payment_status = 'success', razorpay_payment_id = ?,
          verified_at = datetime('now'), updated_at = datetime('now'),
          notes = 'Verified via webhook' WHERE id = ?
        `).run(paymentId, payment.id);
      }

      return { processed: true };
    }

    if (event.event === 'payment.failed') {
      const paymentEntity = event.payload.payment.entity;
      const orderId = paymentEntity.order_id;

      db.prepare(`
        UPDATE payments SET payment_status = 'failed', razorpay_payment_id = ?,
        notes = ?, updated_at = datetime('now')
        WHERE razorpay_order_id = ? AND payment_status = 'pending'
      `).run(paymentEntity.id, paymentEntity.error_description || 'Payment failed', orderId);

      return { processed: true };
    }

    return { processed: false, reason: 'Unhandled event type' };
  }

  // Record manual UPI payment (pending verification)
  recordManualPayment(bookingId, userId, amountPaise, upiRef) {
    const db = getDb();
    const booking = db.prepare('SELECT * FROM bookings WHERE id = ? AND user_id = ?').get(bookingId, userId);

    if (!booking) {
      throw Object.assign(new Error('Booking not found.'), { statusCode: 404 });
    }

    const paymentRef = this.generatePaymentRef();

    db.prepare(`
      INSERT INTO payments (payment_ref, booking_id, user_id, amount_paise, payment_method,
        manual_upi_ref, payment_status, notes)
      VALUES (?, ?, ?, ?, 'manual_upi', ?, 'pending', 'Pending owner verification')
    `).run(paymentRef, bookingId, userId, amountPaise, upiRef || '');

    // Notify via in-app notification
    db.prepare(`
      INSERT INTO notifications (user_id, title, message, type)
      VALUES (?, 'Manual Payment Submitted', ?, 'info')
    `).run(userId, `Your manual UPI payment of ₹${(amountPaise / 100).toLocaleString('en-IN')} for booking ${booking.booking_ref} has been submitted and is pending verification by the hall owner.`);

    logger.info('Manual UPI payment recorded', { paymentRef, bookingId, amountPaise });
    return { paymentRef };
  }

  // Verify manual payment (owner action)
  verifyManualPayment(paymentId, verifiedBy, approve = true) {
    const db = getDb();

    return db.transaction(() => {
      const payment = db.prepare('SELECT * FROM payments WHERE id = ? AND payment_method = ?').get(paymentId, 'manual_upi');
      if (!payment) {
        throw Object.assign(new Error('Manual payment not found.'), { statusCode: 404 });
      }

      if (payment.payment_status !== 'pending') {
        throw Object.assign(new Error('Payment already processed.'), { statusCode: 400 });
      }

      const newStatus = approve ? 'success' : 'failed';
      db.prepare(`
        UPDATE payments SET payment_status = ?, verified_by = ?, verified_at = datetime('now'),
        updated_at = datetime('now'), notes = ?
        WHERE id = ?
      `).run(newStatus, verifiedBy, approve ? 'Verified by owner' : 'Rejected by owner', paymentId);

      if (approve) {
        // Calculate verified total paid
        const totalPaid = db.prepare(`
          SELECT COALESCE(SUM(amount_paise), 0) as total
          FROM payments WHERE booking_id = ? AND payment_status = 'success'
        `).get(payment.booking_id).total;

        const booking = db.prepare('SELECT * FROM bookings WHERE id = ?').get(payment.booking_id);

        const newPaymentStatus = totalPaid >= booking.total_amount_paise
          ? 'paid'
          : (totalPaid >= booking.applied_advance_paise ? 'pending' : 'unpaid');

        const newBookingStatus = totalPaid >= booking.applied_advance_paise && booking.booking_status === 'pending'
          ? 'confirmed'
          : booking.booking_status;

        db.prepare(`
          UPDATE bookings SET booking_status = ?, payment_status = ?, updated_at = datetime('now')
          WHERE id = ?
        `).run(newBookingStatus, newPaymentStatus, payment.booking_id);

        // Notify customer
        db.prepare(`
          INSERT INTO notifications (user_id, title, message, type)
          VALUES (?, 'Payment Verified', ?, 'success')
        `).run(payment.user_id, `Your manual payment of ₹${(payment.amount_paise / 100).toLocaleString('en-IN')} for booking ${booking.booking_ref} has been verified.`);
      }

      // Log activity
      db.prepare(`
        INSERT INTO activity_logs (user_id, action, entity_type, entity_id, details)
        VALUES (?, ?, 'payment', ?, ?)
      `).run(verifiedBy, approve ? 'manual_payment_verified' : 'manual_payment_rejected', paymentId,
        JSON.stringify({ amount_paise: payment.amount_paise, booking_id: payment.booking_id }));

      return { success: true, status: newStatus };
    })();
  }

  // Get user's payments
  getUserPayments(userId) {
    const db = getDb();
    return db.prepare(`
      SELECT p.*, b.booking_ref, b.event_date, b.event_type
      FROM payments p
      JOIN bookings b ON p.booking_id = b.id
      WHERE p.user_id = ?
      ORDER BY p.created_at DESC
    `).all(userId);
  }
}

module.exports = new PaymentService();
