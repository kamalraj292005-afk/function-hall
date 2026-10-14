# Palani Murugan Function Hall Booking Application
### பழனி முருகன் திருமண மஹால் முன்பதிவு இணையதளம்

A complete, production-ready full-stack Function Hall Booking Web Application built with Node.js, Express.js, SQLite, JWT authentication, and Razorpay / Manual UPI payment integration.

---

## 🏛️ Business & Venue Information

- **Hall Name:** Palani Murugan Function Hall (பழனி முருகன் திருமண மஹால்)
- **Address:** Vallavari, Aranthangi to Peravurani Road, near Ayanar Kovil Temple, Tamil Nadu, India.
- **Contact Number:** `9655609405`
- **Daily Hall Rent:** ₹17,500
- **Default Booking Advance:** ₹5,000 *(Only authorized owner/admin can configure this)*
- **One-Day Remaining Balance:** ₹12,500
- **Official UPI ID:** `rajm19407@okaxis`
- **Currency:** Indian Rupees (INR)

---

## 🚀 Key Features

1. **Luxury Indian Wedding Aesthetic:** Tailored Maroon, Gold, Cream, and White design system with dual English & Tamil typography.
2. **Authentic Photo Gallery:** Lightbox modal with next/prev buttons displaying genuine hall photographs.
3. **Real-Time Availability Calendar:** Interactive month view with `AVAILABLE`, `BOOKED`, and `PENDING` statuses; handles single and multi-day bookings atomically.
4. **Duplicate Booking Prevention:** Database-level transactional constraints prevent overlapping bookings for the same hall and date.
5. **Accurate Pricing Calculation:**
   - 1 Day: Total = ₹17,500 | Advance = ₹5,000 | Balance = ₹12,500
   - $N$ Days: Total = ₹17,500 $\times N$ | Advance = ₹5,000 | Balance = Total - Payments
6. **Dual Payment Options:**
   - **Razorpay Checkout:** Live & test mode with HMAC-SHA256 signature verification and webhook idempotency.
   - **Direct UPI Flow:** Copyable UPI ID (`rajm19407@okaxis`), deep link to UPI apps (GPay, PhonePe, Paytm), manual UTR reference submission, and owner approval workflow.
7. **Role-Based Access Control (RBAC):**
   - **Customer Portal:** View bookings, pay balances, cancel requests, and track notifications.
   - **Owner Console:** Revenue metrics, booking approval/cancellation, pricing controls, photo manager, and manual UPI verifier.
   - **Administrator Console:** User management, role elevation, account status control, global logs, and CSV export.
8. **Audit Trail & Logging:** Winston structured logging and SQLite `activity_logs`.

---

## 💻 Windows Setup & Installation (Windows 10 / 11)

### 1. Prerequisites
- **Node.js:** v18.0.0 or newer (Tested and verified on Node.js v24.20.0).
- **npm:** Included with Node.js.

> **Windows PowerShell Execution Policy Note:**
> If PowerShell gives a script execution error when running `npm`, use `npm.cmd` or run:
> ```powershell
> Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned
> ```

---

### 2. Installation Commands

Navigate to the project directory:
```powershell
cd "C:\Users\kamal\.gemini\antigravity-ide\scratch\palani-murugan-function-hall"
```

Install dependencies:
```powershell
npm.cmd install
```
*(or `npm install`)*

---

### 3. Environment Configuration

Copy the example environment file:
```powershell
copy .env.example .env
```

Verify or edit `.env`:
```ini
PORT=3000
NODE_ENV=development
JWT_SECRET=pmh_jwt_secret_9655609405_palani_murugan_function_hall_secure_key_2026
ADMIN_SETUP_KEY=palani_admin_setup_secure_key_2026
UPI_ID=rajm19407@okaxis

INITIAL_ADMIN_EMAIL=admin@palanimurugan.com
INITIAL_ADMIN_PASSWORD=Admin@Palani2026
INITIAL_ADMIN_MOBILE=9655609405

INITIAL_OWNER_EMAIL=owner@palanimurugan.com
INITIAL_OWNER_PASSWORD=Owner@Palani2026
INITIAL_OWNER_MOBILE=9655609405

# Razorpay credentials (leave blank for safe sandbox/test mode)
RAZORPAY_KEY_ID=
RAZORPAY_KEY_SECRET=
RAZORPAY_WEBHOOK_SECRET=
```

---

### 4. Database Initialization

Run the database schema setup and seed the default hall and real photographs:
```powershell
npm.cmd run db:init
```

---

### 5. Setup Initial Administrator & Owner Accounts

Create the default administrative accounts:
```powershell
npm.cmd run admin:setup
```

**Default Credentials Created:**
| Role | Email | Password |
|---|---|---|
| **Administrator** | `admin@palanimurugan.com` | `Admin@Palani2026` |
| **Hall Owner** | `owner@palanimurugan.com` | `Owner@Palani2026` |

---

### 6. Starting the Server

For development with auto-reload:
```powershell
npm.cmd run dev
```

For standard production run:
```powershell
npm.cmd start
```

---

### 7. Opening the Website

Open your browser and navigate to:
```
http://localhost:3000
```

---

## 💳 Razorpay & Payment Configuration

### A. Razorpay Test Mode
If `RAZORPAY_KEY_ID` and `RAZORPAY_KEY_SECRET` are left blank, the application automatically runs in **Sandbox Test Mode**. In test mode:
1. Customer clicks **Pay Advance (₹5,000)**.
2. The system creates a verified test order with simulated checkout.
3. Customer confirms test authorization.
4. Booking is confirmed and status is marked accordingly.

### B. Live Razorpay Setup
To accept real credit cards, debit cards, net banking, and Razorpay UPI:
1. Sign up at [https://dashboard.razorpay.com](https://dashboard.razorpay.com).
2. Go to **Settings > API Keys** and generate Key ID and Key Secret.
3. Update `.env`:
   ```ini
   RAZORPAY_KEY_ID=rzp_live_xxxxxxxx
   RAZORPAY_KEY_SECRET=xxxxxxxxxxxxxxxx
   ```
4. Restart the server.

### C. Webhook Configuration
1. In Razorpay Dashboard, navigate to **Settings > Webhooks > Add New Webhook**.
2. **Webhook URL:** `https://your-domain.com/api/payments/webhook`
3. **Secret:** Set a strong secret and save it in `.env` as `RAZORPAY_WEBHOOK_SECRET`.
4. **Events:** Check `payment.captured`, `payment.failed`, and `payment.authorized`.

---

## 🧪 Automated Testing

Run the complete 24-point automated test suite:
```powershell
npm.cmd test
```

For verbose output:
```powershell
npm.cmd run test:verbose
```

**What the tests verify:**
- Customer registration and validation
- Duplicate account prevention
- Password hashing with bcrypt
- Customer, Owner, and Admin authorization walls
- Hall details (₹17,500 daily rent, ₹5,000 advance)
- 1-Day price calculation (₹17,500 total, ₹5,000 advance, ₹12,500 balance)
- Multi-day booking price calculation (e.g. 2 days = ₹35,000)
- Atomic duplicate booking prevention
- Multi-day date overlap detection
- Payment order creation in paise
- Signature verification and rejection of forged signatures
- Test mode verification and automatic booking confirmation on advance
- Duplicate webhook idempotency
- Manual UPI payment recording and owner verification workflow
- Cancellation flow and freeing of cancelled dates
- CSV export generation

---

## 📁 Project Structure

```
palani-murugan-function-hall/
├── .env.example              # Environment variables template
├── .env                      # Active local configuration
├── .gitignore                # Git exclusions
├── package.json              # Project metadata & dependencies
├── server.js                 # Express server & security headers
├── README.md                 # Complete documentation
│
├── database/
│   ├── db.js                 # Built-in SQLite connection wrapper
│   └── init.js               # Schema creation, indexing & seeding
│
├── middleware/
│   ├── auth.js               # JWT authentication & role authorization
│   ├── errorHandler.js       # Error & 404 handlers
│   ├── logger.js             # Winston file & console logging
│   └── validation.js         # Input sanitization & regex validators
│
├── controllers/
│   ├── authController.js     # Register, login, profile, notifications
│   ├── bookingController.js  # Booking creation, queries, cancellations
│   ├── hallController.js     # Hall details & month availability
│   ├── paymentController.js  # Order creation, verification, manual UPI
│   ├── ownerController.js    # Revenue stats, settings, photo upload/delete
│   └── adminController.js    # User management, role edits, global audits
│
├── routes/
│   ├── authRoutes.js
│   ├── hallRoutes.js
│   ├── bookingRoutes.js
│   ├── paymentRoutes.js
│   ├── ownerRoutes.js
│   └── adminRoutes.js
│
├── services/
│   ├── bookingService.js     # Atomic multi-day availability & balance logic
│   └── paymentService.js     # Razorpay & manual UPI verification
│
├── scripts/
│   └── setup-admin.js        # Administrator & Owner setup CLI
│
├── public/
│   ├── index.html            # Main showcase with all 12 sections
│   ├── booking.html          # Booking & checkout payment page
│   ├── login.html            # Sign-in portal with role routing
│   ├── register.html         # Customer sign-up portal
│   ├── customer-dashboard.html# Customer portal
│   ├── owner-dashboard.html  # Owner management console
│   ├── admin-dashboard.html  # Administrator console
│   ├── css/
│   │   └── style.css         # Maroon, Gold, Cream design system
│   ├── js/
│   │   ├── app.js            # Core frontend state & toast manager
│   │   ├── calendar.js       # Interactive availability calendar
│   │   └── gallery.js        # Responsive lightbox image viewer
│   └── images/
│       ├── hall/             # Real hall photos (hall-photo-1.jpg, etc.)
│       └── uploads/          # Owner-uploaded image directory
│
└── tests/
    └── app.test.js           # 24-point Jest & Supertest automated suite
```

---

## 🔒 Security Best Practices Implemented

- Passwords hashed using bcrypt (12 salt rounds).
- JWT session tokens with expiration.
- Strict server-side role validation (Client-supplied roles are ignored).
- SQLite foreign key enforcement and busy timeouts.
- Raw request body preservation for cryptographic HMAC webhook verification.
- Helmet security headers with tuned Content Security Policy (CSP).
- Rate limiting on authentication, booking, and payment endpoints.
- Multer image upload filter enforcing MIME types, extensions, and file size limits.
- Sensitive credentials (.env) excluded from version control.

---

## 🌐 Production Deployment Steps

1. **Deploy to a Node.js Host:** (AWS EC2, Render, Railway, DigitalOcean, or Linux VPS).
2. **Reverse Proxy:** Configure Nginx or Caddy with HTTPS (Let's Encrypt SSL certificate).
3. **Environment:** Set `NODE_ENV=production` and generate a unique 64-character `JWT_SECRET`.
4. **Process Management:** Use PM2 to run and keep the application alive:
   ```bash
   npm install -g pm2
   pm2 start server.js --name "palani-murugan-hall"
   pm2 save
   pm2 startup
   ```
#   f u n c t i o n - h a l l  
 