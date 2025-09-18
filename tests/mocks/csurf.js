// Mock for csurf - CSRF protection middleware
module.exports = function csurf(options) {
  return function(req, res, next) {
    // Add csrfToken method to request
    req.csrfToken = function() {
      return 'test-csrf-token';
    };
    next();
  };
};