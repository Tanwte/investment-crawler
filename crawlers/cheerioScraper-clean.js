const axios = require('axios');
const axiosRetry = require('axios-retry');
const cheerio = require('cheerio');
const crypto = require('crypto');
const { userAgent, requestTimeoutMs, contextChars } = require('../config');
const { extractWikipediaLinks } = require('../utils/linkExtractor');

axiosRetry(axios, { retries: 2, retryDelay: axiosRetry.exponentialDelay });

function hash(t) {
  return crypto.createHash('sha256').update(t).digest('hex');
}

function buildRegexes(keywords) {
  return keywords.map(k => {
    const escaped = k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`\\b${escaped}\\b`, 'gi');
  });
}

function extractMentions($, regexes) {
  const bodyText = $('body').text();
  const titleText = $('title').text();
  const metaDescription = $('meta[name="description"]').attr('content') || '';
  const headings = $('h1, h2, h3, h4, h5, h6').map((i, el) => $(el).text()).get().join(' ');
  
  const fullText = [titleText, metaDescription, headings, bodyText].join(' ');
  const text = fullText.replace(/\s+/g, ' ').trim();
  
  const snippets = [];
  for (const rx of regexes) {
    let m;
    while ((m = rx.exec(text))) {
      const s = Math.max(0, m.index - contextChars);
      const e = Math.min(text.length, m.index + m[0].length + contextChars);
      let snippet = text.slice(s, e).trim();
      
      snippet = snippet.replace(/\s+/g, ' ').trim();
      if (snippet.length > 10) {
        snippets.push(snippet);
      }
    }
  }
  
  const seen = new Set();
  return snippets.filter(s => {
    const h = hash(s);
    if (seen.has(h)) return false;
    seen.add(h);
    return true;
  });
}

module.exports = async function cheerioScraper(url, keywords, options = {}) {
  const { extractLinks = false } = options;
  
  try {
    const { data } = await axios.get(url, {
      timeout: requestTimeoutMs,
      headers: { 
        'User-Agent': userAgent, 
        'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
        'Accept-Charset': 'utf-8'
      }
    });
    
    const $ = cheerio.load(data);
    const regexes = buildRegexes(keywords);
    const snippets = extractMentions($, regexes);
    
    let discoveredLinks = [];
    if (extractLinks) {
      discoveredLinks = extractWikipediaLinks(data, url, keywords);
    }
    
    return {
      snippets,
      discoveredLinks
    };
  } catch (error) {
    console.warn(`Cheerio scraper failed for ${url}:`, error.message);
    return {
      snippets: [],
      discoveredLinks: []
    };
  }
};