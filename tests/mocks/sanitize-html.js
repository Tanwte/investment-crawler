// Mock for sanitize-html - just return the input for tests
module.exports = function sanitizeHtml(dirty, options) {
  return dirty;
};