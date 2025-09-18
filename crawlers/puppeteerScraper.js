const puppeteer = require('puppeteer');
const { contextChars, userAgent, pageTimeoutMs } = require('../config');

function buildRegexes(keywords) {
  return keywords.map(k => new RegExp(k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'));
}
function extractMentions(text, regexes) {
  const res = [];
  for (const rx of regexes) {
    let m;
    while ((m = rx.exec(text))) {
      const s = Math.max(0, m.index - contextChars);
      const e = Math.min(text.length, m.index + m[0].length + contextChars);
      res.push(text.slice(s, e).trim());
    }
  }
  return Array.from(new Set(res));
}

module.exports = async function puppeteerScraper(url, keywords) {
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox','--disable-setuid-sandbox','--disable-dev-shm-usage']
  });
  try {
    const page = await browser.newPage();
    await page.setUserAgent(userAgent);
    // Block heavy assets to speed up
    await page.setRequestInterception(true);
    page.on('request', req => {
      if (['image','media','font','stylesheet'].includes(req.resourceType())) return req.abort();
      req.continue();
    });
    await page.goto(url, { waitUntil: 'networkidle2', timeout: pageTimeoutMs });
    const text = await page.evaluate(() => document.body.innerText.replace(/\s+/g, ' ').trim());
    const regexes = buildRegexes(keywords);
    return extractMentions(text, regexes);
  } catch {
    return [];
  } finally {
    await browser.close();
  }
};