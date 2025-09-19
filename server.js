// server.js
require('dotenv').config();
const path = require('path');
const express = require('express');
const session = require('express-session');
const https = require('https');
const fs = require('fs');

const { applySecurity } = require('./middleware/security');
const { initAuth } = require('./db/initAuth');

const authRouter = require('./routes/auth');
const crawlRouter = require('./routes/crawl');
const searchRouter = require('./routes/search');
const adminRouter = require('./routes/admin');
const dashboardRouter = require('./routes/dashboard');

const app = express();
applySecurity(app);

// Body parsing and cookies
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(require('cookie-parser')());

// Views + static
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'public'), { maxAge: '1h' }));

// Health (public)
app.get('/healthz', (req, res) => res.send('ok'));

// Sessions
const prod = process.env.NODE_ENV === 'production';
app.use(session({
  secret: process.env.SESSION_SECRET || 'dev-secret',
  resave: false,
  saveUninitialized: false,
  rolling: true, // Reset expiration on activity
  cookie: { 
    httpOnly: true, 
    sameSite: 'lax', 
    secure: prod,
    maxAge: 24 * 60 * 60 * 1000 // 24 hours, extended for admin work
  }
}));

// Routes
app.use('/', authRouter);
app.use('/', crawlRouter);
app.use('/', searchRouter);
app.use('/', adminRouter);
app.use('/', dashboardRouter);

// Default route
app.get('/', (req, res) => res.redirect('/login'));

const port = process.env.PORT || 3000;

// In tests, we export app without listening.
if (process.env.NODE_ENV !== 'test') {
  initAuth().then(() => {
    // Start HTTP server
    app.listen(port, () => console.log(`HTTP Server on :${port}`));
    
    // Start HTTPS server if SSL certificates exist
    const keyPath = path.join(__dirname, 'ssl', 'localhost-key.pem');
    const certPath = path.join(__dirname, 'ssl', 'localhost-cert.pem');
    
    if (fs.existsSync(keyPath) && fs.existsSync(certPath)) {
      const httpsPort = process.env.HTTPS_PORT || 3443;
      const httpsOptions = {
        key: fs.readFileSync(keyPath),
        cert: fs.readFileSync(certPath)
      };
      
      https.createServer(httpsOptions, app).listen(httpsPort, () => {
        console.log(`HTTPS Server on :${httpsPort}`);
        console.log(`🔒 Access via: https://localhost:${httpsPort}`);
        console.log(`⚠️  Browser will show security warning - click "Advanced" → "Proceed to localhost"`);
      });
    } else {
      console.log('ℹ️  HTTPS not available - SSL certificates not found');
      console.log('   Run: node scripts/generate-ssl.js to create certificates');
    }
  }).catch(err => {
    console.error('Init failed:', err);
    process.exit(1);
  });
} else {
  // In tests, ensure seed users exist before exporting.
  initAuth().catch(err => {
    console.error('Init (test) failed:', err);
  });
}

module.exports = app;