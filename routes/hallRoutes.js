const express = require('express');
const router = express.Router();
const hallController = require('../controllers/hallController');

router.get('/', hallController.getHalls);
router.get('/:id', hallController.getHall);
router.get('/:id/availability', hallController.getAvailability);
router.get('/:id/check-date', hallController.checkDate);

module.exports = router;
