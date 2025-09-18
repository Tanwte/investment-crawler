const axios = require('axios');
const robotsParser = require('robots-parser');
const { userAgent, requestTimeoutMs } = require('../config');
const { hostnameOf } = require('./url');

const robotsCache = new Map();

async function canCrawl(url) {
  const host = hostnameOf(url);
  if (!host) return false;

  if (!robotsCache.has(host)) {
    try {
      const robotsUrl = `https://${host}/robots.txt`;
      const { data } = await axios.get(robotsUrl, {
        timeout: requestTimeoutMs,
        headers: { 'User-Agent': userAgent }
      });
      robotsCache.set(host, robotsParser(robotsUrl, data));
    } catch {
      robotsCache.set(host, robotsParser('', '')); // permissive if missing
    }
  }
  return robotsCache.get(host).isAllowed(url, userAgent);
}

module.exports = { canCrawl };