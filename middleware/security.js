const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const compression = require('compression');
const cors = require('cors');
const pino = require('pino');
const { csp } = require('../config');

const logger = pino({ level: process.env.LOG_LEVEL || 'info' });

function applySecurity(app) {
  app.use(helmet({
    contentSecurityPolicy: { useDefaults: true, directives: csp },
    frameguard: { action: 'deny' },
    referrerPolicy: { policy: 'no-referrer' },
    crossOriginResourcePolicy: { policy: 'same-site' }
  }));

  app.use(cors({ origin: false })); // no cross-origin
  app.use(compression());

  // Global soft cap (300 requests / 15 min / IP)
  const globalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 300,
    standardHeaders: true,
    legacyHeaders: false
  });
  app.use(globalLimiter);

  if (process.env.TRUST_PROXY) app.set('trust proxy', 1);

  // Minimal request log
  app.use((req, res, next) => {
    const start = Date.now();
    res.on('finish', () => {
      logger.info({
        method: req.method,
        path: req.originalUrl,
        status: res.statusCode,
        duration_ms: Date.now() - start,
        ip: req.ip
      });
    });
    next();
  });
}

module.exports = { applySecurity };