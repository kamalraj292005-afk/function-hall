const { getDb } = require('./db');

function initializeDatabase() {
  const db = getDb();

  // Create tables in a transaction
  db.transaction(() => {
    // Users table
    db.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        uuid TEXT UNIQUE NOT NULL,
        full_name TEXT NOT NULL,
        email TEXT UNIQUE NOT NULL,
        mobile TEXT NOT NULL,
        password_hash TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'customer' CHECK(role IN ('customer', 'owner', 'admin')),
        is_active INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);

    // Halls table
    db.exec(`
      CREATE TABLE IF NOT EXISTS halls (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL DEFAULT 'Palani Murugan Function Hall',
        address TEXT NOT NULL DEFAULT 'Vallavari, Aranthangi to Peravurani Road, near Ayanar Kovil Temple, Tamil Nadu, India',
        contact_number TEXT NOT NULL DEFAULT '9655609405',
        daily_rent_paise INTEGER NOT NULL DEFAULT 1750000,
        advance_amount_paise INTEGER NOT NULL DEFAULT 500000,
        description TEXT DEFAULT '',
        facilities TEXT DEFAULT '[]',
        is_active INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);

    // Bookings table
    db.exec(`
      CREATE TABLE IF NOT EXISTS bookings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        booking_ref TEXT UNIQUE NOT NULL,
        user_id INTEGER NOT NULL,
        hall_id INTEGER NOT NULL DEFAULT 1,
        customer_name TEXT NOT NULL,
        customer_mobile TEXT NOT NULL,
        customer_email TEXT NOT NULL,
        event_type TEXT NOT NULL,
        event_date TEXT NOT NULL,
        num_days INTEGER NOT NULL DEFAULT 1,
        special_requirements TEXT DEFAULT '',
        applied_daily_rent_paise INTEGER NOT NULL,
        applied_advance_paise INTEGER NOT NULL,
        total_amount_paise INTEGER NOT NULL,
        booking_status TEXT NOT NULL DEFAULT 'pending' CHECK(booking_status IN ('pending', 'confirmed', 'cancelled')),
        payment_status TEXT NOT NULL DEFAULT 'unpaid' CHECK(payment_status IN ('unpaid', 'pending', 'paid', 'failed', 'refunded')),
        cancellation_reason TEXT DEFAULT NULL,
        cancelled_by INTEGER DEFAULT NULL,
        cancelled_at TEXT DEFAULT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (user_id) REFERENCES users(id),
        FOREIGN KEY (hall_id) REFERENCES halls(id)
      )
    `);

    // Payments table
    db.exec(`
      CREATE TABLE IF NOT EXISTS payments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        payment_ref TEXT UNIQUE NOT NULL,
        booking_id INTEGER NOT NULL,
        user_id INTEGER NOT NULL,
        amount_paise INTEGER NOT NULL,
        payment_method TEXT NOT NULL DEFAULT 'razorpay' CHECK(payment_method IN ('razorpay', 'manual_upi', 'cash', 'other')),
        razorpay_order_id TEXT DEFAULT NULL,
        razorpay_payment_id TEXT UNIQUE DEFAULT NULL,
        razorpay_signature TEXT DEFAULT NULL,
        manual_upi_ref TEXT DEFAULT NULL,
        payment_status TEXT NOT NULL DEFAULT 'pending' CHECK(payment_status IN ('pending', 'success', 'failed', 'refunded')),
        verified_by INTEGER DEFAULT NULL,
        verified_at TEXT DEFAULT NULL,
        notes TEXT DEFAULT '',
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (booking_id) REFERENCES bookings(id),
        FOREIGN KEY (user_id) REFERENCES users(id)
      )
    `);

    // Hall images table
    db.exec(`
      CREATE TABLE IF NOT EXISTS hall_images (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        hall_id INTEGER NOT NULL DEFAULT 1,
        filename TEXT NOT NULL,
        original_name TEXT NOT NULL,
        file_path TEXT NOT NULL,
        file_size INTEGER NOT NULL,
        mime_type TEXT NOT NULL,
        sort_order INTEGER NOT NULL DEFAULT 0,
        uploaded_by INTEGER DEFAULT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (hall_id) REFERENCES halls(id)
      )
    `);

    // Hall settings table
    db.exec(`
      CREATE TABLE IF NOT EXISTS hall_settings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        hall_id INTEGER NOT NULL DEFAULT 1,
        setting_key TEXT NOT NULL,
        setting_value TEXT NOT NULL,
        updated_by INTEGER DEFAULT NULL,
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE(hall_id, setting_key),
        FOREIGN KEY (hall_id) REFERENCES halls(id)
      )
    `);

    // Activity logs table
    db.exec(`
      CREATE TABLE IF NOT EXISTS activity_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER DEFAULT NULL,
        action TEXT NOT NULL,
        entity_type TEXT DEFAULT NULL,
        entity_id INTEGER DEFAULT NULL,
        details TEXT DEFAULT '{}',
        ip_address TEXT DEFAULT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (user_id) REFERENCES users(id)
      )
    `);

    // Notifications table
    db.exec(`
      CREATE TABLE IF NOT EXISTS notifications (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        title TEXT NOT NULL,
        message TEXT NOT NULL,
        type TEXT NOT NULL DEFAULT 'info' CHECK(type IN ('info', 'success', 'warning', 'error')),
        is_read INTEGER NOT NULL DEFAULT 0,
        link TEXT DEFAULT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (user_id) REFERENCES users(id)
      )
    `);

    // Indexes
    db.exec(`CREATE INDEX IF NOT EXISTS idx_bookings_user_id ON bookings(user_id)`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_bookings_event_date ON bookings(event_date)`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_bookings_status ON bookings(booking_status)`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_bookings_ref ON bookings(booking_ref)`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_payments_booking_id ON payments(booking_id)`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_payments_user_id ON payments(user_id)`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(payment_status)`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_hall_images_hall_id ON hall_images(hall_id)`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id)`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_activity_logs_user_id ON activity_logs(user_id)`);
    db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_bookings_hall_date ON bookings(hall_id, event_date) WHERE booking_status != 'cancelled'`);

    // Seed default hall if not exists
    const hallCount = db.prepare('SELECT COUNT(*) as count FROM halls').get();
    if (hallCount.count === 0) {
      db.prepare(`
        INSERT INTO halls (name, address, contact_number, daily_rent_paise, advance_amount_paise, description, facilities)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(
        'Palani Murugan Function Hall',
        'Vallavari, Aranthangi to Peravurani Road, near Ayanar Kovil Temple, Tamil Nadu, India',
        '9655609405',
        1750000,
        500000,
        'A premium function hall ideal for weddings, receptions, engagements, and all auspicious occasions. Located conveniently near Ayanar Kovil Temple.',
        JSON.stringify([
          'Spacious Hall',
          'Modern Kitchen',
          'Dining Area',
          'Parking Space',
          'Generator Backup',
          'Clean Restrooms',
          'Stage Area',
          'Decorative Lighting',
          'Water Supply',
          'Fan & Ventilation'
        ])
      );
      console.log('Default hall seeded.');
    }

    // Seed default hall images from existing photos
    const imageCount = db.prepare('SELECT COUNT(*) as count FROM hall_images').get();
    if (imageCount.count === 0) {
      const fs = require('fs');
      const path = require('path');
      const hallImgDir = path.join(__dirname, '..', 'public', 'images', 'hall');
      if (fs.existsSync(hallImgDir)) {
        const photos = fs.readdirSync(hallImgDir).filter(f => /\.(jpg|jpeg|png|webp)$/i.test(f));
        const insertImg = db.prepare(`
          INSERT INTO hall_images (hall_id, filename, original_name, file_path, file_size, mime_type, sort_order)
          VALUES (1, ?, ?, ?, ?, ?, ?)
        `);
        photos.forEach((photo, index) => {
          const filePath = path.join(hallImgDir, photo);
          const stats = fs.statSync(filePath);
          const ext = path.extname(photo).toLowerCase();
          const mimeMap = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp' };
          insertImg.run(photo, photo, `/images/hall/${photo}`, stats.size, mimeMap[ext] || 'image/jpeg', index);
        });
        console.log(`Seeded ${photos.length} hall images.`);
      }
    }

    // Seed default admin and owner accounts if they do not exist
    const adminEmail = (process.env.INITIAL_ADMIN_EMAIL || 'admin@palanimurugan.com').toLowerCase();
    const ownerEmail = (process.env.INITIAL_OWNER_EMAIL || 'owner@palanimurugan.com').toLowerCase();
    const adminPassword = process.env.INITIAL_ADMIN_PASSWORD || 'Admin@Palani2026';
    const ownerPassword = process.env.INITIAL_OWNER_PASSWORD || 'Owner@Palani2026';
    const adminMobile = process.env.INITIAL_ADMIN_MOBILE || '9655609405';
    const ownerMobile = process.env.INITIAL_OWNER_MOBILE || '9655609405';
    const adminName = process.env.INITIAL_ADMIN_NAME || 'Palani Murugan Admin';
    const ownerName = process.env.INITIAL_OWNER_NAME || 'Palani Murugan Hall Owner';

    const bcrypt = require('bcryptjs');
    const { v4: uuidv4 } = require('uuid');

    const existingAdmin = db.prepare('SELECT id FROM users WHERE email = ?').get(adminEmail);
    if (!existingAdmin) {
      const adminHash = bcrypt.hashSync(adminPassword, 10);
      db.prepare(`
        INSERT INTO users (uuid, full_name, email, mobile, password_hash, role, is_active)
        VALUES (?, ?, ?, ?, ?, 'admin', 1)
      `).run(uuidv4(), adminName, adminEmail, adminMobile, adminHash);
      console.log(`Default administrator seeded: ${adminEmail}`);
    }

    const existingOwner = db.prepare('SELECT id FROM users WHERE email = ?').get(ownerEmail);
    if (!existingOwner) {
      const ownerHash = bcrypt.hashSync(ownerPassword, 10);
      db.prepare(`
        INSERT INTO users (uuid, full_name, email, mobile, password_hash, role, is_active)
        VALUES (?, ?, ?, ?, ?, 'owner', 1)
      `).run(uuidv4(), ownerName, ownerEmail, ownerMobile, ownerHash);
      console.log(`Default owner seeded: ${ownerEmail}`);
    }

  })();

  console.log('Database initialized successfully.');
}

// Run if called directly
if (require.main === module) {
  require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
  initializeDatabase();
  console.log('Database initialization complete.');
  process.exit(0);
}

module.exports = { initializeDatabase };
