const pool = require('./index');
const bcrypt = require('bcrypt');

const ADMIN_USER = 'Kotra';
const ADMIN_PASS = 'Kotra2025!';
const NORMAL_USER = 'TestUser';
const NORMAL_PASS = 'testing1234!';

async function ensureUser(username, password, role) {
  const { rows } = await pool.query('SELECT id FROM users WHERE username=$1', [username]);
  if (rows.length) return; // user exists
  const hash = await bcrypt.hash(password, 12);
  await pool.query(
    'INSERT INTO users (username, password_hash, role) VALUES ($1,$2,$3)',
    [username, hash, role]
  );
}

async function ensureSettings() {
  await pool.query(
    `INSERT INTO app_settings (key,value) VALUES ('default_reset_password','Kotra2025!')
     ON CONFLICT (key) DO NOTHING`
  );
}

async function initAuth() {
  await ensureSettings();
  await ensureUser(ADMIN_USER, ADMIN_PASS, 'admin');
  await ensureUser(NORMAL_USER, NORMAL_PASS, 'user');
}

module.exports = { initAuth };
