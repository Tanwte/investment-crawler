const fs = require('fs');
const path = require('path');
const { isSafeHttpUrl } = require('./url');

const MIN_URLS = 10;
const MAX_URLS = 100;

const URLS_PATH = path.join(__dirname, '..', 'data', 'urls.json');
const KEYWORDS_PATH = path.join(__dirname, '..', 'data', 'keywords.json');

let state = { urls: [], keywords: [], lastLoad: null };

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}
function normalizeKeyword(k) { return String(k || '').trim(); }
function normalizeUrl(u) { return String(u || '').trim(); }

function validateAndLoad() {
  const rawUrls = readJson(URLS_PATH).map(normalizeUrl);
  const rawKeywords = readJson(KEYWORDS_PATH).map(normalizeKeyword);

  // URLs: safe http(s), unique
  const urlSet = new Set();
  const urls = [];
  for (const u of rawUrls) {
    if (!u) continue;
    if (!isSafeHttpUrl(u)) continue;
    if (urlSet.has(u)) continue;
    urlSet.add(u);
    urls.push(u);
  }
  if (urls.length < MIN_URLS) throw new Error(`urls.json must contain at least ${MIN_URLS} URLs (got ${urls.length})`);
  if (urls.length > MAX_URLS) throw new Error(`urls.json must not exceed ${MAX_URLS} (got ${urls.length})`);

  // Keywords: non-empty, case-insensitive unique
  const kwSet = new Set();
  const keywords = [];
  for (const k of rawKeywords) {
    if (!k) continue;
    const key = k.toLowerCase();
    if (kwSet.has(key)) continue;
    kwSet.add(key);
    keywords.push(k);
  }
  if (keywords.length === 0) throw new Error('keywords.json must contain at least 1 keyword');

  state = { urls, keywords, lastLoad: new Date() };
}

function reloadSeeds() {
  validateAndLoad();
  return { urls: state.urls.slice(), keywords: state.keywords.slice(), lastLoad: state.lastLoad };
}
function getUrls() { if (!state.lastLoad) validateAndLoad(); return state.urls.slice(); }
function getKeywords() { if (!state.lastLoad) validateAndLoad(); return state.keywords.slice(); }

module.exports = {
  reloadSeeds, getUrls, getKeywords, MIN_URLS, MAX_URLS, URLS_PATH, KEYWORDS_PATH
};