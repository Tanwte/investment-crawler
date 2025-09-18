// routes/crawl.js
const express = require('express');
const router = express.Router();
const pLimit = require('p-limit');
const crypto = require('crypto');

const cheerioScraper = require('../crawlers/cheerioScraper');
const puppeteerScraper = require('../crawlers/puppeteerScraper');
const { canCrawl } = require('../utils/robots');
const { isSafeHttpUrl, hostnameOf } = require('../utils/url');
const { getUrls, getKeywords } = require('../utils/seeds');
const { concurrency, crawlDelayMsPerHost } = require('../config');
const pool = require('../db');

const { crawlLimiter } = require('../middleware/ratelimits');
const { requireAdmin } = require('../middleware/auth');

function hash(t) {
  return crypto.createHash('sha256').update(t).digest('hex');
}

// polite per-host throttling
const hostTimers = new Map();
async function politeDelay(host) {
  const last = hostTimers.get(host) || 0;
  const now = Date.now();
  const delta = now - last;
  if (delta < crawlDelayMsPerHost) {
    await new Promise(r => setTimeout(r, crawlDelayMsPerHost - delta));
  }
  hostTimers.set(host, Date.now());
}

// coalesce: only one crawl at a time
let crawlInFlight = false;

router.get('/crawl', requireAdmin, crawlLimiter, async (req, res) => {
  // token gate
  const token = req.get('X-CRAWL-TOKEN') || req.query.token;
  if (token !== process.env.CRAWL_TOKEN) return res.status(401).send('Invalid crawl token');

  if (crawlInFlight) return res.status(202).send('Crawl already running');
  crawlInFlight = true;

  try {
    const urls = getUrls().filter(isSafeHttpUrl);
    const keywords = getKeywords();

    const limit = pLimit(concurrency);
    const tasks = urls.map(url => limit(async () => {
      const host = hostnameOf(url);
      if (!await canCrawl(url)) return { url, data: [], skipped: 'robots' };
      await politeDelay(host);

      let data = await cheerioScraper(url, keywords);
      if (data.length === 0) data = await puppeteerScraper(url, keywords);

      const joined = data.join('\n\n---\n\n');
      const contentHash = hash(joined || (url + ':empty'));

      const exists = await pool.query(
        'SELECT 1 FROM crawl_results WHERE content_hash=$1 LIMIT 1', [contentHash]
      );
      if ((joined && exists.rowCount === 0) || exists.rowCount === 0) {
        await pool.query(
          'INSERT INTO crawl_results (url, content, content_hash, status_code, host) VALUES ($1,$2,$3,$4,$5)',
          [url, joined || '', contentHash, 200, host]
        );
      }
      return { url, data };
    }));

    const results = await Promise.all(tasks);
    res.render('index', { results, query: null });
  } finally {
    crawlInFlight = false;
  }
});

module.exports = router;