const rateLimit = require('express-rate-limit');

// /search: caps data scraping (60 requests / 15 min / IP)
const searchLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false
});

// /crawl: prevents spam running the crawler (2 requests / 15 min / IP)
const crawlLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 2,
  standardHeaders: true,
  legacyHeaders: false
});

module.exports = { searchLimiter, crawlLimiter };