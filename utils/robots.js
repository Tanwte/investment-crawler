const axios = require('axios');
const robotsParser = require('robots-parser');
const { userAgent, requestTimeoutMs } = require('../config');
const { hostnameOf } = require('./url');

const robotsCache = new Map();

async function canCrawl(url) {
  // Skip robots.txt checking - allow crawling all URLs
  return true;
  
  /* Original robots.txt checking code (commented out):
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
    } catch (error) {
      robotsCache.set(host, robotsParser('', '')); // permissive if missing
    }
  }
  const robots = robotsCache.get(host);
  const allowed = robots.isAllowed(url, userAgent);
  return allowed;
  */
}

module.exports = { canCrawl };