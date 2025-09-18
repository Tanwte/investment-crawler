// Minimal in-memory "DB" responding to the queries used by the app.
const bcrypt = require('bcrypt');

const state = {
  users: [],
  app_settings: [{ key: 'default_reset_password', value: 'Kotra2025!' }],
  crawl_results: []
};

// Seed initial users once tests import server/app (initAuth() will call ensureUser too,
// but we guard duplicates in ensureUser).
async function seedUsersIfMissing() {
  const haveAdmin = state.users.find(u => u.username === 'Kotra');
  if (!haveAdmin) {
    state.users.push({
      id: 1,
      username: 'Kotra',
      password_hash: await bcrypt.hash('Kotra2025!', 6),
      role: 'admin',
      created_at: new Date(),
      updated_at: new Date()
    });
  }
  const haveUser = state.users.find(u => u.username === 'TestUser');
  if (!haveUser) {
    state.users.push({
      id: 2,
      username: 'TestUser',
      password_hash: await bcrypt.hash('testing1234!', 6),
      role: 'user',
      created_at: new Date(),
      updated_at: new Date()
    });
  }
}
seedUsersIfMissing();

let nextUserId = 3;
let nextCrawlId = 1;

async function query(sql, params = []) {
  sql = sql.trim();

  // USERS
  if (sql.startsWith('SELECT id FROM users WHERE username=')) {
    const username = params[0];
    const found = state.users.find(u => u.username === username);
    return { rows: found ? [{ id: found.id }] : [] };
  }

  if (sql.startsWith('INSERT INTO users')) {
    const [username, password_hash, role] = params;
    if (state.users.find(u => u.username === username)) throw new Error('dup');
    state.users.push({
      id: nextUserId++,
      username,
      password_hash,
      role,
      created_at: new Date(),
      updated_at: new Date()
    });
    return { rowCount: 1, rows: [] };
  }

  if (sql.startsWith('SELECT id, username, password_hash, role FROM users WHERE username=')) {
    const username = params[0];
    const found = state.users.find(u => u.username === username);
    return { rows: found ? [{ id: found.id, username: found.username, password_hash: found.password_hash, role: found.role }] : [] };
  }

  if (sql.startsWith('SELECT id,username,role,created_at,updated_at FROM users')) {
    const rows = state.users.map(u => ({
      id: u.id, username: u.username, role: u.role,
      created_at: u.created_at, updated_at: u.updated_at
    }));
    return { rows };
  }

  if (sql.startsWith('UPDATE users SET password_hash=')) {
    const [hash, id] = params;
    const user = state.users.find(u => u.id === Number(id));
    if (user) {
      user.password_hash = hash;
      user.updated_at = new Date();
      return { rowCount: 1 };
    }
    return { rowCount: 0 };
  }

  if (sql.startsWith('DELETE FROM users WHERE id=')) {
    const id = Number(params[0]);
    const idx = state.users.findIndex(u => u.id === id);
    if (idx >= 0) state.users.splice(idx, 1);
    return { rowCount: 1 };
  }

  // SETTINGS
  if (sql.startsWith('INSERT INTO app_settings')) {
    const key = 'default_reset_password';
    const value = params[0];
    const existing = state.app_settings.find(s => s.key === key);
    if (existing) existing.value = value;
    else state.app_settings.push({ key, value });
    return { rowCount: 1 };
  }

  if (sql.startsWith('SELECT value FROM app_settings WHERE key=')) {
    const key = params[0];
    const found = state.app_settings.find(s => s.key === key);
    return { rows: found ? [{ value: found.value }] : [] };
  }

  // CRAWL RESULTS
  if (sql.startsWith('SELECT 1 FROM crawl_results WHERE content_hash=')) {
    const hash = params[0];
    const exists = state.crawl_results.find(r => r.content_hash === hash);
    return { rowCount: exists ? 1 : 0, rows: exists ? [{ '1': 1 }] : [] };
  }

  if (sql.startsWith('INSERT INTO crawl_results')) {
    const [url, content, content_hash, status_code, host] = params;
    state.crawl_results.push({
      id: nextCrawlId++,
      url, content, content_hash, status_code, host,
      fetched_at: new Date()
    });
    return { rowCount: 1 };
  }

  if (sql.includes('FROM crawl_results') && sql.includes('plainto_tsquery')) {
    // naive "full text": substring match on content for tests
    const q = params[0].toLowerCase();
    const limit = params[1];
    const offset = params[2];
    const filtered = state.crawl_results.filter(r => (r.content || '').toLowerCase().includes(q))
      .sort((a,b) => b.fetched_at - a.fetched_at);
    const page = filtered.slice(offset, offset + limit);
    return { rows: page.map(r => ({ url: r.url, content: r.content, fetched_at: r.fetched_at })) };
  }

  // Default: return empty
  return { rows: [], rowCount: 0 };
}

module.exports = { query };