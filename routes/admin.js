// routes/admin.js
const express = require('express');
const router = express.Router();
const csurf = require('csurf');
const pool = require('../db');
const { writeJsonAtomic } = require('../utils/jsonStore');
const { isSafeHttpUrl } = require('../utils/url');
const {
  reloadSeeds, getUrls, getKeywords,
  MIN_URLS, MAX_URLS, URLS_PATH, KEYWORDS_PATH
} = require('../utils/seeds');
const { requireAuth, requireAdmin } = require('../middleware/auth');

// Import user management routes
const userRoutes = require('./admin/users');

// Add middleware to prevent caching of admin pages
router.use((req, res, next) => {
  res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.set('Pragma', 'no-cache');
  res.set('Expires', '0');
  next();
});

router.use(requireAuth);
router.use(csurf({ 
  cookie: true,
  // Skip CSRF for GET requests as they should be idempotent
  ignoreMethods: ['GET', 'HEAD', 'OPTIONS']
}));
router.use((req, res, next) => { res.locals.csrfToken = req.csrfToken(); next(); });

// Mount user management routes
router.use('/admin/users', userRoutes);

// Admin home
router.get('/admin', (req, res) => {
  // Get and clear any flash message from session
  const success = req.session.flashMessage || null;
  delete req.session.flashMessage;
  res.render('admin', {
    me: req.session.user,
    urlsCount: getUrls().length,
    keywordsCount: getKeywords().length,
    minUrls: MIN_URLS,
    maxUrls: MAX_URLS,
    success
  });
});

/* Keywords */
router.get('/admin/keywords', requireAdmin, (req, res) => {
  // Get and clear any flash message from session
  const success = req.session.flashMessage || null;
  delete req.session.flashMessage;
  res.render('admin_keywords', { currentText: getKeywords().join('\n'), error: null, success });
});
router.post('/admin/keywords', requireAdmin, express.urlencoded({ extended: false }), (req, res) => {
  const raw = String(req.body.keywords || '');
  const lines = raw.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
  const seen = new Set(), clean = [];
  for (const k of lines) { const key = k.toLowerCase(); if (seen.has(key)) continue; seen.add(key); clean.push(k); }
  if (clean.length === 0) return res.status(422).render('admin_keywords', { currentText: raw, error: 'At least one keyword', success: null });
  try {
    writeJsonAtomic(KEYWORDS_PATH, clean);
    reloadSeeds();
    // Store success message in session and redirect to admin dashboard
    req.session.flashMessage = `Saved ${clean.length} keyword(s).`;
    res.redirect('/admin');
  } catch (e) {
    res.status(422).render('admin_keywords', { currentText: raw, error: e.message, success: null });
  }
});

/* URLs */
router.get('/admin/urls', requireAdmin, (req, res) => {
  // Get and clear any flash message from session
  const success = req.session.flashMessage || null;
  delete req.session.flashMessage;
  res.render('admin_urls', { currentText: getUrls().join('\n'), min: MIN_URLS, max: MAX_URLS, error: null, success });
});
router.post('/admin/urls', requireAdmin, express.urlencoded({ extended: false }), (req, res) => {
  const raw = String(req.body.urls || '');
  const lines = raw.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
  const seen = new Set(), clean = [];
  for (const u of lines) { if (!isSafeHttpUrl(u)) continue; if (seen.has(u)) continue; seen.add(u); clean.push(u); }
  if (clean.length < MIN_URLS) return res.status(422).render('admin_urls', { currentText: raw, min: MIN_URLS, max: MAX_URLS, error: `Need >=${MIN_URLS} URLs`, success: null });
  if (clean.length > MAX_URLS) return res.status(422).render('admin_urls', { currentText: raw, min: MIN_URLS, max: MAX_URLS, error: `Need <=${MAX_URLS} URLs`, success: null });
  try {
    writeJsonAtomic(URLS_PATH, clean);
    reloadSeeds();
    // Store success message in session and redirect to admin dashboard
    req.session.flashMessage = `Saved ${clean.length} URL(s).`;
    res.redirect('/admin');
  } catch (e) {
    res.status(422).render('admin_urls', { currentText: raw, min: MIN_URLS, max: MAX_URLS, error: e.message, success: null });
  }
});

/* Users (admin only) */
router.get('/admin/users', requireAdmin, async (req, res) => {
  const { rows } = await pool.query('SELECT id,username,role,created_at,updated_at FROM users ORDER BY id ASC');
  res.render('admin_users', { users: rows, me: req.session.user });
});
router.post('/admin/users/create', requireAdmin, express.urlencoded({ extended: false }), async (req, res) => {
  const { username, password, role } = req.body || {};
  if (!username || !password || !['admin','user'].includes(role)) return res.status(422).send('Bad input');
  const bcrypt = require('bcrypt'); const hash = await bcrypt.hash(password, 12);
  try {
    await pool.query('INSERT INTO users (username,password_hash,role) VALUES ($1,$2,$3)', [username, hash, role]);
  } catch {
    return res.status(422).send('Username exists or invalid');
  }
  res.redirect('/admin/users');
});
router.post('/admin/users/reset', requireAdmin, express.urlencoded({ extended: false }), async (req, res) => {
  const { user_id } = req.body || {}; if (!user_id) return res.status(422).send('Bad input');
  const { rows } = await pool.query('SELECT value FROM app_settings WHERE key=$1', ['default_reset_password']);
  const def = rows[0]?.value || 'Kotra2025!';
  const bcrypt = require('bcrypt'); const hash = await bcrypt.hash(def, 12);
  await pool.query('UPDATE users SET password_hash=$1, updated_at=NOW() WHERE id=$2', [hash, user_id]);
  res.redirect('/admin/users');
});
router.post('/admin/users/delete', requireAdmin, express.urlencoded({ extended: false }), async (req, res) => {
  const { user_id } = req.body || {}; if (!user_id) return res.status(422).send('Bad input');
  await pool.query('DELETE FROM users WHERE id=$1', [user_id]);
  res.redirect('/admin/users');
});

/* Settings (admin only) */
router.get('/admin/settings', requireAdmin, async (req, res) => {
  const { rows } = await pool.query('SELECT value FROM app_settings WHERE key=$1', ['default_reset_password']);
  res.render('admin_settings', { currentDefault: rows[0]?.value || 'Kotra2025!' });
});
router.post('/admin/settings', requireAdmin, express.urlencoded({ extended: false }), async (req, res) => {
  const { default_password } = req.body || {};
  if (!default_password) return res.status(422).send('Bad input');
  await pool.query(
    `INSERT INTO app_settings (key,value) VALUES ('default_reset_password',$1)
     ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value`,
    [default_password]
  );
  res.redirect('/admin/settings');
});

module.exports = router;