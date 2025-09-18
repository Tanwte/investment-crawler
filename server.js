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

const app = express();
applySecurity(app);

// Views + static
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'public'), { fallthrough: false, maxAge: '1h' }));

// Health (public)
app.get('/healthz', (req, res) => res.send('ok'));

// Sessions
const prod = process.env.NODE_ENV === 'production';
app.use(session({
  secret: process.env.SESSION_SECRET || 'dev-secret',
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: 'lax', secure: prod }
}));

// Routes
app.use('/', authRouter);
app.use('/', crawlRouter);
app.use('/', searchRouter);
app.use('/', adminRouter);

// Default route
app.get('/', (req, res) => res.redirect('/login'));

// Start
const port = process.env.PORT || 3000;
initAuth().then(() => {
  app.listen(port, () => console.log(`Server on :${port}`));
}).catch(err => {
  console.error('Init failed:', err);
  process.exit(1);
});