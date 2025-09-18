const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 10,
  idleTimeoutMillis: 300000, // 5 minutes
  connectionTimeoutMillis: 10000, // 10 seconds
  keepAlive: true,
  keepAliveInitialDelayMillis: 0
});

// Handle connection errors gracefully
pool.on('error', (err) => {
  console.error('Unexpected error on idle client', err);
});

module.exports = pool;
