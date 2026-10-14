// Input validation helpers

function validateEmail(email) {
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return re.test(String(email).toLowerCase());
}

function validateMobile(mobile) {
  // Indian mobile: 10 digits, optionally prefixed with +91 or 91
  const cleaned = String(mobile).replace(/[\s\-\(\)]/g, '');
  return /^(\+91|91)?[6-9]\d{9}$/.test(cleaned);
}

function validatePassword(password) {
  return typeof password === 'string' && password.length >= 6;
}

function sanitizeString(str) {
  if (typeof str !== 'string') return '';
  return str.trim().replace(/[<>]/g, '');
}

function validateDate(dateStr) {
  if (!dateStr) return false;
  const date = new Date(dateStr);
  return !isNaN(date.getTime());
}

function validateFutureDate(dateStr) {
  if (!validateDate(dateStr)) return false;
  const date = new Date(dateStr);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return date >= today;
}

function validatePositiveInteger(val) {
  const num = parseInt(val, 10);
  return !isNaN(num) && num > 0;
}

// Validation middleware factory
function validateBody(rules) {
  return (req, res, next) => {
    const errors = [];
    
    for (const [field, validators] of Object.entries(rules)) {
      const value = req.body[field];
      
      for (const validator of validators) {
        if (validator.required && (value === undefined || value === null || value === '')) {
          errors.push(`${validator.label || field} is required.`);
          break;
        }
        
        if (value !== undefined && value !== null && value !== '') {
          if (validator.type === 'email' && !validateEmail(value)) {
            errors.push(`Please enter a valid email address.`);
          }
          if (validator.type === 'mobile' && !validateMobile(value)) {
            errors.push(`Please enter a valid Indian mobile number.`);
          }
          if (validator.type === 'password' && !validatePassword(value)) {
            errors.push(`Password must be at least 6 characters long.`);
          }
          if (validator.type === 'date' && !validateDate(value)) {
            errors.push(`Please enter a valid date.`);
          }
          if (validator.type === 'futureDate' && !validateFutureDate(value)) {
            errors.push(`Event date must be today or in the future.`);
          }
          if (validator.type === 'positiveInt' && !validatePositiveInteger(value)) {
            errors.push(`${validator.label || field} must be a positive number.`);
          }
          if (validator.minLength && String(value).length < validator.minLength) {
            errors.push(`${validator.label || field} must be at least ${validator.minLength} characters.`);
          }
          if (validator.maxLength && String(value).length > validator.maxLength) {
            errors.push(`${validator.label || field} must be at most ${validator.maxLength} characters.`);
          }
        }
      }
    }

    if (errors.length > 0) {
      return res.status(400).json({ success: false, message: errors[0], errors });
    }
    
    next();
  };
}

module.exports = {
  validateEmail,
  validateMobile,
  validatePassword,
  sanitizeString,
  validateDate,
  validateFutureDate,
  validatePositiveInteger,
  validateBody
};
