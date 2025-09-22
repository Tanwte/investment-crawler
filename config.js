module.exports = {
  concurrency: 5,
  userAgent: 'investment-crawler/1.0 (+https://example.org/contact)',
  requestTimeoutMs: 15000,
  pageTimeoutMs: 30000,
  contextChars: 240,
  crawlDelayMsPerHost: 1500,
  csp: {
    "default-src": ["'self'"],
    "script-src": ["'self' 'unsafe-inline'"],
    "script-src-attr": ["'unsafe-inline'"],
    "style-src": ["'self' 'unsafe-inline'"],
    "img-src": ["'self' data:"],
    "connect-src": ["'self'"],
    "frame-ancestors": ["'none'"]
  }
};
