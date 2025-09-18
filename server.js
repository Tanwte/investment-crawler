// server.js
require('dotenv').config();
const path = require('path');
const express = require('express');
const session = require('express-session');

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
    app.listen(port, () => console.log(`Server on :${port}`));
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