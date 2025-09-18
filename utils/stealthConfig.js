const UserAgent = require('user-agents');

// Pool of realistic user agents
const userAgents = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:120.0) Gecko/20100101 Firefox/120.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:120.0) Gecko/20100101 Firefox/120.0'
];

// Realistic viewport sizes
const viewports = [
  { width: 1920, height: 1080 },
  { width: 1366, height: 768 },
  { width: 1536, height: 864 },
  { width: 1440, height: 900 },
  { width: 1280, height: 720 },
  { width: 1600, height: 900 },
  { width: 2560, height: 1440 }
];

// Language preferences for different regions
const acceptLanguages = [
  'en-US,en;q=0.9,ko;q=0.8',
  'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
  'en-GB,en;q=0.9,ko;q=0.8',
  'zh-CN,zh;q=0.9,en;q=0.8,ko;q=0.7',
  'ja-JP,ja;q=0.9,en;q=0.8,ko;q=0.7'
];

// Get random user agent
function getRandomUserAgent() {
  return userAgents[Math.floor(Math.random() * userAgents.length)];
}

// Get random viewport
function getRandomViewport() {
  return viewports[Math.floor(Math.random() * viewports.length)];
}

// Get random accept language
function getRandomAcceptLanguage() {
  return acceptLanguages[Math.floor(Math.random() * acceptLanguages.length)];
}

// Generate realistic headers for Cheerio requests
function getRandomHeaders(url) {
  const domain = new URL(url).hostname;
  const userAgent = getRandomUserAgent();
  
  return {
    'User-Agent': userAgent,
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
    'Accept-Language': getRandomAcceptLanguage(),
    'Accept-Encoding': 'gzip, deflate, br',
    'Accept-Charset': 'utf-8, iso-8859-1;q=0.5',
    'Cache-Control': 'no-cache',
    'Pragma': 'no-cache',
    'Sec-Fetch-Dest': 'document',
    'Sec-Fetch-Mode': 'navigate',
    'Sec-Fetch-Site': 'none',
    'Sec-Fetch-User': '?1',
    'Upgrade-Insecure-Requests': '1',
    'DNT': '1',
    'Connection': 'keep-alive',
    'Referer': Math.random() > 0.7 ? `https://www.google.com/search?q=${domain}` : undefined
  };
}

// Random delay between actions
function randomDelay(min = 1000, max = 3000) {
  return new Promise(resolve => {
    const delay = Math.floor(Math.random() * (max - min + 1)) + min;
    setTimeout(resolve, delay);
  });
}

// Exponential backoff for retries
function exponentialBackoff(attempt, baseDelay = 1000, maxDelay = 30000) {
  const delay = Math.min(baseDelay * Math.pow(2, attempt), maxDelay);
  const jitter = delay * 0.1 * Math.random(); // Add 10% jitter
  return delay + jitter;
}

// Mouse movement simulation data
function getRandomMouseMovements() {
  const movements = [];
  const numMovements = Math.floor(Math.random() * 5) + 3; // 3-7 movements
  
  for (let i = 0; i < numMovements; i++) {
    movements.push({
      x: Math.floor(Math.random() * 1200) + 100,
      y: Math.floor(Math.random() * 600) + 100,
      delay: Math.floor(Math.random() * 500) + 100
    });
  }
  
  return movements;
}

module.exports = {
  getRandomUserAgent,
  getRandomViewport,
  getRandomAcceptLanguage,
  getRandomHeaders,
  randomDelay,
  exponentialBackoff,
  getRandomMouseMovements
};