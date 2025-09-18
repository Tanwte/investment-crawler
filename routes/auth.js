// routes/auth.js
const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const pool = require('../db');

const cookieParser = require('cookie-parser');
const csurf = require('csurf');

// CSRF for auth forms
router.use(cookieParser());
router.use(csurf({ cookie: true }));

// Show login form
router.get('/login', (req, res) => {
  res.render('login', { csrfToken: req.csrfToken(), error: null });
});

// Handle login submit
router.post('/login', express.urlencoded({ extended: false }), async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) {
    return res.status(400).render('login', { csrfToken: req.csrfToken(), error: 'Missing credentials' });
  }

  const { rows } = await pool.query('SELECT id, username, password_hash, role FROM users WHERE username=$1', [username]);
  if (!rows.length) {
    return res.status(401).render('login', { csrfToken: req.csrfToken(), error: 'Invalid username or password' });
  }

  const user = rows[0];
  const ok = await bcrypt.compare(password, user.password_hash);
  if (!ok) {
    return res.status(401).render('login', { csrfToken: req.csrfToken(), error: 'Invalid username or password' });
  }

  // Start session
  req.session.user = { id: user.id, username: user.username, role: user.role };
  return res.redirect('/admin'); // land on admin home after login
});

// Logout (destroys session, then redirects to /login)
router.post('/logout', express.urlencoded({ extended: false }), (req, res) => {
  req.session.destroy(() => res.redirect('/login'));
});

module.exports = router;