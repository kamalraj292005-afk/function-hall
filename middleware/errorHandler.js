const logger = require('./logger');

function errorHandler(err, req, res, next) {
  // Log error details (without exposing to client)
  logger.error('Unhandled error', {
    message: err.message,
    stack: err.stack,
    url: req.originalUrl,
    method: req.method,
    ip: req.ip
  });

  // Don't expose internal details
  const statusCode = err.statusCode || 500;
  const message = statusCode === 500 ? 'An internal server error occurred.' : err.message;

  res.status(statusCode).json({
    success: false,
    message,
    ...(process.env.NODE_ENV === 'development' && { debug: err.message })
  });
}

// 404 handler
function notFoundHandler(req, res) {
  // If request is for API, return JSON
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ success: false, message: 'API endpoint not found.' });
  }
  // Otherwise serve the main page (SPA-style)
  res.sendFile('index.html', { root: require('path').join(__dirname, '..', 'public') });
}

module.exports = { errorHandler, notFoundHandler };
