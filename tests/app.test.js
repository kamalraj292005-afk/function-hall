process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test_jwt_secret_palani_murugan_function_hall_2026';
process.env.UPI_ID = 'rajm19407@okaxis';

const request = require('supertest');
const app = require('../server');
const { getDb, closeDb } = require('../database/db');

describe('Palani Murugan Function Hall Booking App Test Suite', () => {
  let customerToken;
  let customerUserId;
  let ownerToken;
  let adminToken;
  let testBookingId;
  let testBookingRef;
  const testDate = '2027-02-15'; // Far future test date
  const multiDayStartDate = '2027-03-20';

  beforeAll(async () => {
    const db = getDb();
    const bcrypt = require('bcryptjs');
    const { v4: uuidv4 } = require('uuid');

    // Clean up test data in correct foreign key order
    db.exec(`
      DELETE FROM activity_logs WHERE user_id IN (SELECT id FROM users WHERE email LIKE '%@test.com');
      DELETE FROM payments WHERE booking_id IN (SELECT id FROM bookings WHERE customer_email LIKE '%@test.com' OR event_date IN ('${testDate}', '${multiDayStartDate}', '2027-03-21'));
      DELETE FROM payments WHERE user_id IN (SELECT id FROM users WHERE email LIKE '%@test.com');
      DELETE FROM notifications WHERE user_id IN (SELECT id FROM users WHERE email LIKE '%@test.com');
      DELETE FROM bookings WHERE customer_email LIKE '%@test.com' OR event_date IN ('${testDate}', '${multiDayStartDate}', '2027-03-21');
      DELETE FROM users WHERE email LIKE '%@test.com';
    `);

    // Ensure owner and admin accounts exist in test DB
    const ownerHash = await bcrypt.hash('Owner@Palani2026', 10);
    const adminHash = await bcrypt.hash('Admin@Palani2026', 10);

    const existingOwner = db.prepare('SELECT id FROM users WHERE email = ?').get('owner@palanimurugan.com');
    if (existingOwner) {
      db.prepare("UPDATE users SET password_hash = ?, role = 'owner' WHERE id = ?").run(ownerHash, existingOwner.id);
    } else {
      db.prepare(`
        INSERT INTO users (uuid, full_name, email, mobile, password_hash, role, is_active)
        VALUES (?, 'Owner User', 'owner@palanimurugan.com', '9655609405', ?, 'owner', 1)
      `).run(uuidv4(), ownerHash);
    }

    const existingAdmin = db.prepare('SELECT id FROM users WHERE email = ?').get('admin@palanimurugan.com');
    if (existingAdmin) {
      db.prepare("UPDATE users SET password_hash = ?, role = 'admin' WHERE id = ?").run(adminHash, existingAdmin.id);
    } else {
      db.prepare(`
        INSERT INTO users (uuid, full_name, email, mobile, password_hash, role, is_active)
        VALUES (?, 'Admin User', 'admin@palanimurugan.com', '9655609405', ?, 'admin', 1)
      `).run(uuidv4(), adminHash);
    }
  });

  afterAll(() => {
    closeDb();
  });

  // 1. Authentication Tests
  describe('Authentication & Authorization', () => {
    it('should register a new customer with customer role', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({
          fullName: 'Test Customer',
          email: 'customer@test.com',
          mobile: '9876543210',
          password: 'Password123!',
          confirmPassword: 'Password123!'
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.token).toBeDefined();
      expect(res.body.user.role).toBe('customer');
      customerToken = res.body.token;
      customerUserId = res.body.user.id;
    });

    it('should reject registration with duplicate email', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({
          fullName: 'Duplicate Email',
          email: 'customer@test.com',
          mobile: '9123456789',
          password: 'Password123!',
          confirmPassword: 'Password123!'
        });

      expect(res.status).toBe(409);
      expect(res.body.success).toBe(false);
    });

    it('should reject registration with invalid mobile number', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({
          fullName: 'Invalid Mobile',
          email: 'invalidmobile@test.com',
          mobile: '12345',
          password: 'Password123!',
          confirmPassword: 'Password123!'
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('should login with correct credentials', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'customer@test.com',
          password: 'Password123!'
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.token).toBeDefined();
    });

    it('should reject login with wrong password', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'customer@test.com',
          password: 'WrongPassword'
        });

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

    it('should login as admin and owner', async () => {
      // Owner login
      const ownerRes = await request(app)
        .post('/api/auth/login')
        .send({
          email: process.env.INITIAL_OWNER_EMAIL || 'owner@palanimurugan.com',
          password: process.env.INITIAL_OWNER_PASSWORD || 'Owner@Palani2026'
        });
      expect(ownerRes.status).toBe(200);
      expect(ownerRes.body.user.role).toBe('owner');
      ownerToken = ownerRes.body.token;

      // Admin login
      const adminRes = await request(app)
        .post('/api/auth/login')
        .send({
          email: process.env.INITIAL_ADMIN_EMAIL || 'admin@palanimurugan.com',
          password: process.env.INITIAL_ADMIN_PASSWORD || 'Admin@Palani2026'
        });
      expect(adminRes.status).toBe(200);
      expect(adminRes.body.user.role).toBe('admin');
      adminToken = adminRes.body.token;
    });

    it('should forbid customers from accessing owner dashboard', async () => {
      const res = await request(app)
        .get('/api/owner/dashboard')
        .set('Authorization', `Bearer ${customerToken}`);

      expect(res.status).toBe(403);
    });

    it('should forbid customers and owners from accessing admin users API', async () => {
      const resCust = await request(app)
        .get('/api/admin/users')
        .set('Authorization', `Bearer ${customerToken}`);
      expect(resCust.status).toBe(403);

      const resOwner = await request(app)
        .get('/api/admin/users')
        .set('Authorization', `Bearer ${ownerToken}`);
      expect(resOwner.status).toBe(403);
    });

    it('should handle forgot username gracefully for all roles', async () => {
      // Customer
      const resCust = await request(app)
        .post('/api/auth/forgot-username')
        .send({ email: 'customer@test.com' });
      // When SMTP not configured, returns 503 with helpful support number or 200 when email mocked/configured
      expect([200, 503]).toContain(resCust.status);

      // Non-existent email should return 200 without user enumeration
      const resNone = await request(app)
        .post('/api/auth/forgot-username')
        .send({ email: 'nonexistent@test.com' });
      expect(resNone.status).toBe(200);
      expect(resNone.body.success).toBe(true);

      // Invalid email
      const resInvalid = await request(app)
        .post('/api/auth/forgot-username')
        .send({ email: 'notanemail' });
      expect(resInvalid.status).toBe(400);
    });

    it('should handle password reset lifecycle: token generation, validation, and update', async () => {
      const crypto = require('crypto');
      const testDb = getDb();
      const testUser = testDb.prepare('SELECT * FROM users WHERE email = ?').get('customer@test.com');
      expect(testUser).toBeDefined();

      // Create a test reset token directly in DB
      const rawToken = 'test-reset-token-' + Date.now();
      const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();

      testDb.prepare(`
        INSERT INTO password_resets (user_id, token_hash, expires_at)
        VALUES (?, ?, ?)
      `).run(testUser.id, tokenHash, expiresAt);

      // Attempt reset with mismatched passwords
      const resMismatch = await request(app)
        .post('/api/auth/reset-password')
        .send({
          token: rawToken,
          email: 'customer@test.com',
          password: 'NewPassword123',
          confirmPassword: 'DifferentPassword'
        });
      expect(resMismatch.status).toBe(400);

      // Successful password reset
      const resSuccess = await request(app)
        .post('/api/auth/reset-password')
        .send({
          token: rawToken,
          email: 'customer@test.com',
          password: 'NewPassword123',
          confirmPassword: 'NewPassword123'
        });
      expect(resSuccess.status).toBe(200);
      expect(resSuccess.body.success).toBe(true);

      // Token cannot be reused
      const resReuse = await request(app)
        .post('/api/auth/reset-password')
        .send({
          token: rawToken,
          email: 'customer@test.com',
          password: 'AnotherPassword123',
          confirmPassword: 'AnotherPassword123'
        });
      expect(resReuse.status).toBe(400);

      // Login with new password
      const resNewLogin = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'customer@test.com',
          password: 'NewPassword123'
        });
      expect(resNewLogin.status).toBe(200);
      expect(resNewLogin.body.success).toBe(true);

      // Restore password for downstream tests
      const bcrypt = require('bcryptjs');
      const restoredHash = await bcrypt.hash('SecurePassword123', 10);
      testDb.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(restoredHash, testUser.id);
    });
  });

  // 2. Hall Information & Pricing Verification
  describe('Hall Information & Pricing Rules', () => {
    it('should return hall details with ₹17,500 daily rent and ₹5,000 advance', async () => {
      const res = await request(app).get('/api/halls/1');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      const hall = res.body.hall;
      expect(hall.name).toContain('Palani Murugan Function Hall');
      expect(hall.daily_rent).toBe(17500); // ₹17,500
      expect(hall.advance_amount).toBe(5000); // ₹5,000
      expect(hall.daily_rent_paise).toBe(1750000);
      expect(hall.advance_amount_paise).toBe(500000);
      expect(hall.contact_number).toBe('9655609405');
      expect(hall.images.length).toBeGreaterThanOrEqual(1);
    });
  });

  // 3. Booking Creation & Exact Calculation Tests
  describe('Booking System & Pricing Calculation', () => {
    it('should create a 1-day booking with Total ₹17,500, Advance ₹5,000, and Balance ₹12,500', async () => {
      const res = await request(app)
        .post('/api/bookings')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          customerName: 'Test Customer',
          customerMobile: '9876543210',
          customerEmail: 'customer@test.com',
          eventType: 'Wedding Reception',
          eventDate: testDate,
          numDays: 1,
          specialRequirements: 'Grand stage lighting',
          hallId: 1
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      const booking = res.body.booking;

      testBookingId = booking.id;
      testBookingRef = booking.booking_ref;

      // Exact business rules verification
      expect(booking.applied_daily_rent_paise).toBe(1750000); // ₹17,500
      expect(booking.applied_advance_paise).toBe(500000); // ₹5,000
      expect(booking.total_amount_paise).toBe(1750000); // ₹17,500
      expect(booking.total_paid_paise).toBe(0); // ₹0
      expect(booking.remaining_paise).toBe(1750000); // ₹17,500 before advance, with ₹12,500 remaining after advance
      expect(booking.total_amount_paise - booking.applied_advance_paise).toBe(1250000); // Exactly ₹12,500 remaining balance!
      expect(booking.booking_status).toBe('pending');
      expect(booking.payment_status).toBe('unpaid');
    });

    it('should PREVENT duplicate booking for the same date', async () => {
      const res = await request(app)
        .post('/api/bookings')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          customerName: 'Another Person',
          customerMobile: '9876543211',
          customerEmail: 'customer@test.com',
          eventType: 'Birthday Party',
          eventDate: testDate,
          numDays: 1,
          hallId: 1
        });

      expect(res.status).toBe(409);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toMatch(/already booked/i);
    });

    it('should correctly calculate multi-day booking price (2 days = ₹35,000)', async () => {
      const res = await request(app)
        .post('/api/bookings')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          customerName: 'Multi Day Customer',
          customerMobile: '9876543210',
          customerEmail: 'customer@test.com',
          eventType: '2-Day Wedding',
          eventDate: multiDayStartDate,
          numDays: 2,
          hallId: 1
        });

      expect(res.status).toBe(201);
      const booking = res.body.booking;
      expect(booking.num_days).toBe(2);
      expect(booking.total_amount_paise).toBe(3500000); // 2 * ₹17,500 = ₹35,000
      expect(booking.applied_advance_paise).toBe(500000); // ₹5,000 advance
    });

    it('should detect overlap when another booking attempts overlapping day 2 of multi-day booking', async () => {
      // Day 2 of multi-day is 2027-03-21
      const res = await request(app)
        .post('/api/bookings')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          customerName: 'Overlap Attempter',
          customerMobile: '9876543210',
          customerEmail: 'customer@test.com',
          eventType: 'Overlap Event',
          eventDate: '2027-03-21',
          numDays: 1,
          hallId: 1
        });

      expect(res.status).toBe(409);
      expect(res.body.success).toBe(false);
    });
  });

  // 4. Payment Integration Tests
  describe('Payment Integration (Razorpay & Manual UPI)', () => {
    let orderId;

    it('should create a payment order for the ₹5,000 advance', async () => {
      const res = await request(app)
        .post('/api/payments/create-order')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          bookingId: testBookingId,
          amount: 5000 // ₹5,000
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.order.amount).toBe(500000); // 500000 paise
      expect(res.body.order.currency).toBe('INR');
      orderId = res.body.order.orderId;
    });

    it('should reject payment verification if order does not exist or signature is invalid', async () => {
      const res = await request(app)
        .post('/api/payments/verify')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          razorpay_order_id: 'order_nonexistent_123',
          razorpay_payment_id: 'pay_test_123',
          razorpay_signature: 'fake_signature'
        });

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
    });

    it('should verify test mode payment and automatically CONFIRM booking on advance payment', async () => {
      const res = await request(app)
        .post('/api/payments/verify')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          razorpay_order_id: orderId,
          razorpay_payment_id: `pay_test_${Date.now()}`,
          razorpay_signature: 'test_signature'
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      // Verify booking status is now confirmed
      const bookingRes = await request(app)
        .get(`/api/bookings/${testBookingId}`)
        .set('Authorization', `Bearer ${customerToken}`);

      expect(bookingRes.body.booking.booking_status).toBe('confirmed');
      expect(bookingRes.body.booking.total_paid_paise).toBe(500000); // ₹5,000 paid
      expect(bookingRes.body.booking.remaining_paise).toBe(1250000); // Exactly ₹12,500 remaining balance!
    });

    it('should handle duplicate payment verification idempotently', async () => {
      const res = await request(app)
        .post('/api/payments/verify')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          razorpay_order_id: orderId,
          razorpay_payment_id: `pay_test_duplicate`,
          razorpay_signature: 'test_signature'
        });

      expect(res.status).toBe(200);
      expect(res.body.duplicate).toBe(true);
    });

    it('should support manual UPI payment flow and allow owner verification', async () => {
      // Customer submits manual UPI payment reference for the remaining ₹12,500
      const manualRes = await request(app)
        .post('/api/payments/manual')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          bookingId: testBookingId,
          amount: 12500, // ₹12,500
          upiRef: 'UPI-REF-123456789'
        });

      expect(manualRes.status).toBe(200);
      expect(manualRes.body.success).toBe(true);
      expect(manualRes.body.paymentRef).toBeDefined();

      // Check owner dashboard shows pending manual payment
      const ownerDashRes = await request(app)
        .get('/api/owner/dashboard')
        .set('Authorization', `Bearer ${ownerToken}`);

      expect(ownerDashRes.status).toBe(200);
      const pendingPayment = ownerDashRes.body.pendingManualPayments.find(p => p.manual_upi_ref === 'UPI-REF-123456789');
      expect(pendingPayment).toBeDefined();

      // Owner verifies manual payment
      const verifyRes = await request(app)
        .patch(`/api/owner/payments/${pendingPayment.id}/verify`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ approve: true });

      expect(verifyRes.status).toBe(200);
      expect(verifyRes.body.success).toBe(true);

      // Verify booking is now fully paid
      const finalBookingRes = await request(app)
        .get(`/api/bookings/${testBookingId}`)
        .set('Authorization', `Bearer ${customerToken}`);

      expect(finalBookingRes.body.booking.payment_status).toBe('paid');
      expect(finalBookingRes.body.booking.total_paid_paise).toBe(1750000); // Fully ₹17,500 paid
      expect(finalBookingRes.body.booking.remaining_paise).toBe(0); // ₹0 remaining
    });
  });

  // 5. Booking Cancellation Tests
  describe('Cancellation Flow', () => {
    it('should allow customer to cancel booking and record reason', async () => {
      const res = await request(app)
        .post(`/api/bookings/${testBookingId}/cancel`)
        .set('Authorization', `Bearer ${customerToken}`)
        .send({ reason: 'Family schedule change' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      const bookingRes = await request(app)
        .get(`/api/bookings/${testBookingId}`)
        .set('Authorization', `Bearer ${customerToken}`);

      expect(bookingRes.body.booking.booking_status).toBe('cancelled');
    });

    it('should allow cancelled date to become available again', async () => {
      const res = await request(app).get(`/api/halls/1/check-date?date=${testDate}`);
      expect(res.status).toBe(200);
      expect(res.body.available).toBe(true);
    });
  });

  // 6. Owner & Admin Dashboard Features
  describe('Owner & Admin Management', () => {
    it('should allow owner to view all bookings and filter', async () => {
      const res = await request(app)
        .get('/api/owner/bookings')
        .set('Authorization', `Bearer ${ownerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.bookings.length).toBeGreaterThanOrEqual(1);
    });

    it('should allow owner to update hall settings (pricing & advance)', async () => {
      const res = await request(app)
        .patch('/api/owner/settings')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({
          dailyRentRupees: 17500,
          advanceAmountRupees: 5000,
          contactNumber: '9655609405'
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('should export bookings report as CSV', async () => {
      const res = await request(app)
        .get('/api/owner/reports/csv')
        .set('Authorization', `Bearer ${ownerToken}`);

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('text/csv');
      expect(res.text).toContain('Booking Ref');
    });

    it('should allow admin to list users and view system metrics', async () => {
      const res = await request(app)
        .get('/api/admin/dashboard')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.stats.users.total).toBeGreaterThanOrEqual(3); // customer, owner, admin
      expect(res.body.stats.financials.verifiedRevenueRupees).toBeGreaterThan(0);
    });
  });
});
