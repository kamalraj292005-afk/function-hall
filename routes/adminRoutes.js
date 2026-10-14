const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');
const { authenticate, authorize } = require('../middleware/auth');

// All admin routes strictly require 'admin' role
router.use(authenticate, authorize('admin'));

router.get('/dashboard', adminController.getDashboard);
router.get('/users', adminController.getUsers);
router.patch('/users/:id', adminController.updateUser);
router.get('/bookings', adminController.getBookings);
router.get('/payments', adminController.getPayments);
router.get('/logs', adminController.getActivityLogs);

module.exports = router;
