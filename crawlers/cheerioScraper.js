const axios = require('axios');
const axiosRetry = require('axios-retry');
const cheerio = require('cheerio');
const crypto = require('crypto');
const { userAgent, requestTimeoutMs, contextChars } = require('../config');

axiosRetry(axios, { retries: 2, retryDelay: axiosRetry.exponentialDelay });

function hash(t) {
  return crypto.createHash('sha256').update(t).digest('hex');
}
function buildRegexes(keywords) {
  return keywords.map(k => new RegExp(k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'));
}
function extractMentions($, regexes) {
  const text = $('body').text().replace(/\s+/g, ' ').trim();
  const snippets = [];
  for (const rx of regexes) {
    let m;
    while ((m = rx.exec(text))) {
      const s = Math.max(0, m.index - contextChars);
      const e = Math.min(text.length, m.index + m[0].length + contextChars);
      snippets.push(text.slice(s, e).trim());
    }
  }
  // Deduplicate via hash
  const seen = new Set();
  return snippets.filter(s => {
    const h = hash(s);
    if (seen.has(h)) return false;
    seen.add(h);
    return true;
  });
}

module.exports = async function cheerioScraper(url, keywords) {
  try {
    const { data } = await axios.get(url, {
      timeout: requestTimeoutMs,
      headers: { 'User-Agent': userAgent, 'Accept-Language': 'en' }
    });
    const $ = cheerio.load(data);
    const regexes = buildRegexes(keywords);
    return extractMentions($, regexes);
  } catch {
    return [];
  }
};