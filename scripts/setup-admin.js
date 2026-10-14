/**
 * Secure Initial Administrator and Owner Setup Script
 * Usage:
 *   node scripts/setup-admin.js
 * Or with arguments:
 *   node scripts/setup-admin.js <admin_email> <admin_password> <admin_mobile> <admin_name>
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../database/db');
const { initializeDatabase } = require('../database/init');

async function setup() {
  console.log('=== Palani Murugan Function Hall: Admin & Owner Setup ===\n');

  // Ensure DB schema exists
  initializeDatabase();
  const db = getDb();

  // Read credentials from env or CLI args
  const args = process.argv.slice(2);
  const providedAdminPassword = args[1] || process.env.INITIAL_ADMIN_PASSWORD;
  const providedOwnerPassword = process.env.INITIAL_OWNER_PASSWORD;
  if (process.env.NODE_ENV === 'production' && (!providedAdminPassword || !providedOwnerPassword)) {
    throw new Error('Set INITIAL_ADMIN_PASSWORD and INITIAL_OWNER_PASSWORD before running setup in production.');
  }

  const adminEmail = args[0] || process.env.INITIAL_ADMIN_EMAIL || 'admin@palanimurugan.com';
  const adminPassword = providedAdminPassword || 'Admin@Palani2026';
  const adminMobile = args[2] || process.env.INITIAL_ADMIN_MOBILE || '9655609405';
  const adminName = args[3] || process.env.INITIAL_ADMIN_NAME || 'Palani Murugan Administrator';

  const ownerEmail = process.env.INITIAL_OWNER_EMAIL || 'owner@palanimurugan.com';
  const ownerPassword = providedOwnerPassword || 'Owner@Palani2026';
  const ownerMobile = process.env.INITIAL_OWNER_MOBILE || '9655609405';
  const ownerName = process.env.INITIAL_OWNER_NAME || 'Palani Murugan Owner';

  // 1. Setup Admin Account
  const existingAdmin = db.prepare('SELECT id FROM users WHERE email = ?').get(adminEmail.toLowerCase());
  const adminHash = await bcrypt.hash(adminPassword, 12);

  if (existingAdmin) {
    db.prepare(`
      UPDATE users SET password_hash = ?, role = 'admin', is_active = 1, updated_at = datetime('now')
      WHERE id = ?
    `).run(adminHash, existingAdmin.id);
    console.log(`[OK] Administrator account updated: ${adminEmail}`);
  } else {
    db.prepare(`
      INSERT INTO users (uuid, full_name, email, mobile, password_hash, role, is_active)
      VALUES (?, ?, ?, ?, ?, 'admin', 1)
    `).run(uuidv4(), adminName, adminEmail.toLowerCase(), adminMobile, adminHash);
    console.log(`[OK] Administrator account created: ${adminEmail}`);
  }

  // 2. Setup Owner Account
  const existingOwner = db.prepare('SELECT id FROM users WHERE email = ?').get(ownerEmail.toLowerCase());
  const ownerHash = await bcrypt.hash(ownerPassword, 12);

  if (existingOwner) {
    db.prepare(`
      UPDATE users SET password_hash = ?, role = 'owner', is_active = 1, updated_at = datetime('now')
      WHERE id = ?
    `).run(ownerHash, existingOwner.id);
    console.log(`[OK] Owner account updated: ${ownerEmail}`);
  } else {
    db.prepare(`
      INSERT INTO users (uuid, full_name, email, mobile, password_hash, role, is_active)
      VALUES (?, ?, ?, ?, ?, 'owner', 1)
    `).run(uuidv4(), ownerName, ownerEmail.toLowerCase(), ownerMobile, ownerHash);
    console.log(`[OK] Owner account created: ${ownerEmail}`);
  }

  console.log('\n--- Setup Summary ---');
  console.log(`Admin account created or updated: ${adminEmail}`);
  console.log(`Owner account created or updated: ${ownerEmail}`);
  console.log('\nPasswords were not printed. Retrieve them from your secure environment configuration.');
  process.exit(0);
}

setup().catch(err => {
  console.error('Setup failed:', err);
  process.exit(1);
});
