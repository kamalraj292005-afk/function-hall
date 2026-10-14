const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const ownerController = require('../controllers/ownerController');
const { authenticate, authorize } = require('../middleware/auth');

// Multer storage for hall image uploads
const uploadDir = process.env.UPLOAD_DIR || path.join(__dirname, '..', 'public', 'images', 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const uniqueName = `hall-${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`;
    cb(null, uniqueName);
  }
});

const fileFilter = (req, file, cb) => {
  const allowed = /jpeg|jpg|png|webp/;
  const ext = path.extname(file.originalname).toLowerCase();
  const mime = file.mimetype;
  if (allowed.test(ext) && allowed.test(mime)) {
    cb(null, true);
  } else {
    cb(new Error('Only JPG, PNG, and WebP images are allowed.'));
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 } // 5MB limit
});

// All owner routes require authentication and 'owner' or 'admin' role
router.use(authenticate, authorize('owner', 'admin'));

router.get('/dashboard', ownerController.getDashboard);
router.get('/bookings', ownerController.getBookings);
router.patch('/bookings/:id', ownerController.updateBooking);
router.patch('/settings', ownerController.updateSettings);
router.post('/images', upload.single('image'), ownerController.uploadImage);
router.delete('/images/:id', ownerController.deleteImage);
router.get('/payments', ownerController.getPayments);
router.patch('/payments/:id/verify', ownerController.verifyManualPayment);
router.get('/logs', ownerController.getActivityLogs);
router.get('/reports/csv', ownerController.exportReportCsv);

module.exports = router;
