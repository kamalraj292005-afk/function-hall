const { getDb } = require('../database/db');

// Get all active halls
exports.getHalls = (req, res) => {
  const db = getDb();
  const halls = db.prepare('SELECT * FROM halls WHERE is_active = 1').all();
  
  const hallsWithImages = halls.map(hall => {
    const images = db.prepare('SELECT * FROM hall_images WHERE hall_id = ? ORDER BY sort_order').all(hall.id);
    return {
      ...hall,
      daily_rent: hall.daily_rent_paise / 100,
      advance_amount: hall.advance_amount_paise / 100,
      facilities: JSON.parse(hall.facilities || '[]'),
      images
    };
  });

  res.json({ success: true, halls: hallsWithImages });
};

// Get single hall
exports.getHall = (req, res) => {
  const db = getDb();
  const hall = db.prepare('SELECT * FROM halls WHERE id = ? AND is_active = 1').get(req.params.id);

  if (!hall) {
    return res.status(404).json({ success: false, message: 'Hall not found.' });
  }

  const images = db.prepare('SELECT * FROM hall_images WHERE hall_id = ? ORDER BY sort_order').all(hall.id);

  res.json({
    success: true,
    hall: {
      ...hall,
      daily_rent: hall.daily_rent_paise / 100,
      advance_amount: hall.advance_amount_paise / 100,
      facilities: JSON.parse(hall.facilities || '[]'),
      images
    }
  });
};

// Get hall availability for a month
exports.getAvailability = (req, res) => {
  const bookingService = require('../services/bookingService');
  const hallId = parseInt(req.params.id, 10);
  const year = parseInt(req.query.year, 10) || new Date().getFullYear();
  const month = parseInt(req.query.month, 10) || (new Date().getMonth() + 1);

  if (month < 1 || month > 12) {
    return res.status(400).json({ success: false, message: 'Invalid month.' });
  }

  const availability = bookingService.getMonthAvailability(hallId, year, month);
  res.json({ success: true, year, month, availability });
};

// Check specific date availability
exports.checkDate = (req, res) => {
  const bookingService = require('../services/bookingService');
  const hallId = parseInt(req.params.id, 10);
  const { date, numDays } = req.query;

  if (!date) {
    return res.status(400).json({ success: false, message: 'Date is required.' });
  }

  if (numDays && parseInt(numDays, 10) > 1) {
    const result = bookingService.checkDateRangeAvailability(hallId, date, parseInt(numDays, 10));
    return res.json({ success: true, ...result });
  }

  const available = bookingService.checkAvailability(hallId, date);
  res.json({ success: true, available, date });
};
