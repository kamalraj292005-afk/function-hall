require('dotenv').config();
const express = require('express');
const path = require('path');
const cors = require('cors');
const helmet = require('helmet');
const uploadDir = process.env.UPLOAD_DIR || path.join(__dirname, 'public', 'images', 'uploads');
const logger = require('./middleware/logger');
const { errorHandler, notFoundHandler } = require('./middleware/errorHandler');
const { initializeDatabase } = require('./database/init');

// Initialize database schema
initializeDatabase();

const app = express();
const PORT = process.env.PORT || 3000;

// Security headers with tuned CSP for Razorpay Checkout, QR generator & Google Fonts
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "https://*.razorpay.com", "https://checkout.razorpay.com", "https://cdn.razorpay.com", "https://cdn.jsdelivr.net"],
      frameSrc: ["'self'", "https://*.razorpay.com", "https://api.razorpay.com", "https://checkout.razorpay.com", "https://www.google.com"],
      imgSrc: ["'self'", "data:", "blob:", "https://*.razorpay.com", "https://api.qrserver.com"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      connectSrc: ["'self'", "https://*.razorpay.com", "https://lumberjack.razorpay.com", "https://api.razorpay.com"]
    }
  },
  crossOriginEmbedderPolicy: false
}));

app.use(cors());

// Parse JSON bodies while preserving rawBody for webhook HMAC verification
app.use(express.json({
  verify: (req, res, buf) => {
    req.rawBody = buf.toString();
  }
}));

app.use(express.urlencoded({ extended: true }));

// Serve static frontend assets
app.use(express.static(path.join(__dirname, 'public')));
app.use('/images/uploads', express.static(uploadDir));

// API Routes
app.use('/api/auth', require('./routes/authRoutes'));
app.use('/api/halls', require('./routes/hallRoutes'));
app.use('/api/bookings', require('./routes/bookingRoutes'));
app.use('/api/payments', require('./routes/paymentRoutes'));
app.use('/api/owner', require('./routes/ownerRoutes'));
app.use('/api/admin', require('./routes/adminRoutes'));

// Public config endpoint (safe public values only)
app.get('/api/config', (req, res) => {
  res.json({
    success: true,
    upiId: process.env.UPI_ID || 'rajm19407@okaxis',
    contactNumber: '9655609405',
    razorpayKeyId: process.env.RAZORPAY_KEY_ID || null,
    isRazorpayConfigured: !!(process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET)
  });
});

// Central error handler
app.use(errorHandler);

// SPA fallback for frontend routes & 404 handler
app.use(notFoundHandler);

if (process.env.NODE_ENV !== 'test') {
  app.listen(PORT, () => {
    console.log(`\n======================================================`);
    console.log(`  Palani Murugan Function Hall Booking Server Started`);
    console.log(`  URL: http://localhost:${PORT}`);
    console.log(`  Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`  UPI ID: ${process.env.UPI_ID || 'rajm19407@okaxis'}`);
    console.log(`======================================================\n`);
  });
}

module.exports = app;
