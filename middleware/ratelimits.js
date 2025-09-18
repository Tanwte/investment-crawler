const rateLimit = require('express-rate-limit');

// /search: caps data scraping (60 requests / 15 min / IP)
const searchLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false
});

// /crawl: prevents spam running the crawler (10 requests / 15 min / IP for development)
const crawlLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false
});

module.exports = { searchLimiter, crawlLimiter };