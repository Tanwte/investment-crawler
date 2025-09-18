// routes/search.js
const express = require('express');
const router = express.Router();
const pool = require('../db');
const { searchValidation } = require('../middleware/validation');
const { searchLimiter } = require('../middleware/ratelimits');
const { requireAuth } = require('../middleware/auth');

router.get('/search', requireAuth, searchLimiter, searchValidation, async (req, res) => {
  const q = req.query.q;
  const page = parseInt(req.query.page || '1', 10);
  const size = Math.min(parseInt(req.query.size || '20', 10), 50);
  const offset = (page - 1) * size;

  const { rows } = await pool.query(
    `SELECT url, content, fetched_at
       FROM crawl_results
      WHERE tsv @@ plainto_tsquery('english', $1)
      ORDER BY fetched_at DESC
      LIMIT $2 OFFSET $3`,
    [q, size, offset]
  );

  const results = rows.map(r => ({
    url: r.url,
    data: r.content ? r.content.split('\n\n---\n\n') : []
  }));

  res.render('index', { results, query: q });
});

module.exports = router;
