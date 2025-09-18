const puppeteer = require('puppeteer');
const { contextChars, userAgent, pageTimeoutMs } = require('../config');
const { 
  getRandomUserAgent, 
  getRandomViewport, 
  getRandomAcceptLanguage, 
  randomDelay, 
  exponentialBackoff
} = require('../utils/stealthConfig');

function buildRegexes(keywords) {
  // Use Korean-aware word boundaries for better multilingual matching
  return keywords.map(k => {
    const escaped = k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`(?:^|\\s|[^가-힣a-zA-Z0-9])${escaped}(?=\\s|[^가-힣a-zA-Z0-9]|$)`, 'gi');
  });
}

function extractMentions(text, regexes) {
  const res = [];
  for (const rx of regexes) {
    rx.lastIndex = 0; // Reset regex position
    let m;
    while ((m = rx.exec(text))) {
      const s = Math.max(0, m.index - contextChars);
      const e = Math.min(text.length, m.index + m[0].length + contextChars);
      res.push(text.slice(s, e).trim());
    }
  }
  return Array.from(new Set(res));
}

// Enhanced browser instance pool for better resource management
class BrowserPool {
  constructor(maxInstances = 3) {
    this.browsers = [];
    this.maxInstances = maxInstances;
    this.currentIndex = 0;
  }

  async getBrowser() {
    // Reuse existing browser if available
    if (this.browsers.length < this.maxInstances) {
      const browser = await puppeteer.launch({
        headless: true,
        timeout: 60000,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-gpu',
          '--disable-web-security',
          '--disable-features=VizDisplayCompositor',
          '--disable-background-timer-throttling',
          '--disable-backgrounding-occluded-windows',
          '--disable-renderer-backgrounding',
          '--disable-features=TranslateUI',
          '--disable-ipc-flooding-protection',
          '--memory-pressure-off',
          '--max_old_space_size=4096' // Increase memory limit
        ]
      });
      this.browsers.push(browser);
      return browser;
    }

    // Round-robin through existing browsers
    const browser = this.browsers[this.currentIndex];
    this.currentIndex = (this.currentIndex + 1) % this.browsers.length;
    
    // Check if browser is still connected
    if (!browser.isConnected()) {
      // Replace disconnected browser
      const newBrowser = await puppeteer.launch({
        headless: true,
        timeout: 60000,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-gpu',
          '--disable-web-security',
          '--disable-features=VizDisplayCompositor',
          '--disable-background-timer-throttling',
          '--disable-backgrounding-occluded-windows',
          '--disable-renderer-backgrounding',
          '--disable-features=TranslateUI',
          '--disable-ipc-flooding-protection',
          '--memory-pressure-off',
          '--max_old_space_size=4096'
        ]
      });
      this.browsers[this.currentIndex] = newBrowser;
      return newBrowser;
    }

    return browser;
  }

  async closeAll() {
    await Promise.allSettled(this.browsers.map(browser => browser.close()));
    this.browsers = [];
  }
}

// Global browser pool instance
const browserPool = new BrowserPool(2);

// Enhanced page configuration for Korean sites
async function configurePage(page, url) {
  const viewport = getRandomViewport();
  const randomUA = getRandomUserAgent();
  
  await page.setUserAgent(randomUA);
  await page.setViewport(viewport);
  await page.setExtraHTTPHeaders({
    'Accept-Language': getRandomAcceptLanguage(),
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Encoding': 'gzip, deflate, br',
    'Cache-Control': 'no-cache',
    'Pragma': 'no-cache'
  });

  // Enhanced request interception for Korean sites
  await page.setRequestInterception(true);
  page.on('request', req => {
    const resourceType = req.resourceType();
    const url = req.url();
    
    // Block heavy resources but allow essential ones for Korean sites
    if (['image', 'font', 'media'].includes(resourceType)) {
      req.abort();
    } else if (resourceType === 'stylesheet' && url.includes('ads')) {
      req.abort();
    } else if (resourceType === 'script' && (
      url.includes('google-analytics') ||
      url.includes('googletagmanager') ||
      url.includes('facebook.com') ||
      url.includes('twitter.com')
    )) {
      req.abort();
    } else {
      req.continue();
    }
  });

  // Enhanced error handling for frame detachment
  page.on('error', error => {
    console.warn(`Page error detected: ${error.message}`);
  });

  page.on('pageerror', error => {
    console.warn(`Page JavaScript error: ${error.message}`);
  });

  page.on('framedetached', frame => {
    console.warn(`Frame detached: ${frame.url()}`);
  });

  return page;
}

// Enhanced navigation with multiple fallback strategies
async function smartNavigation(page, url) {
  const strategies = [
    { waitUntil: 'domcontentloaded', timeout: 25000 },
    { waitUntil: 'networkidle2', timeout: 35000 },
    { waitUntil: 'load', timeout: 45000 }
  ];

  for (let i = 0; i < strategies.length; i++) {
    try {
      console.log(`Navigation strategy ${i + 1}/${strategies.length}: ${strategies[i].waitUntil}`);
      await page.goto(url, strategies[i]);
      console.log(`✅ Navigation successful with ${strategies[i].waitUntil}`);
      return true;
    } catch (error) {
      console.warn(`❌ Strategy ${i + 1} failed: ${error.message}`);
      if (i === strategies.length - 1) throw error;
    }
  }
  return false;
}

// Enhanced content extraction for Korean sites
async function extractEnhancedContent(page, url) {
  // Wait for dynamic content with site-specific optimizations
  if (url.includes('naver.com')) {
    console.log('🇰🇷 Optimizing for Naver.com...');
    await page.waitForSelector('body', { timeout: 10000 }).catch(() => {});
    await randomDelay(3000, 5000);
    
    // Try to click "show more" buttons common on Naver
    try {
      await page.evaluate(() => {
        const moreButtons = document.querySelectorAll('[class*="more"], [class*="전체"], button:contains("더보기")');
        moreButtons.forEach(btn => btn.click());
      });
      await randomDelay(2000, 3000);
    } catch (e) {
      // Ignore click errors
    }
  } else if (url.includes('daum.net')) {
    console.log('🇰🇷 Optimizing for Daum.net...');
    await page.waitForSelector('body', { timeout: 10000 }).catch(() => {});
    await randomDelay(2500, 4000);
  } else if (url.includes('chosun.com') || url.includes('joongang.co.kr') || url.includes('donga.com')) {
    console.log('🇰🇷 Optimizing for Korean news site...');
    await page.waitForSelector('body', { timeout: 8000 }).catch(() => {});
    await randomDelay(2000, 3500);
  } else {
    // Standard wait for other sites
    await randomDelay(1500, 3000);
  }

  // Enhanced text extraction with multiple selectors
  const content = await page.evaluate(() => {
    // Remove script and style elements
    const scripts = document.querySelectorAll('script, style, noscript');
    scripts.forEach(el => el.remove());

    // Try multiple content extraction strategies
    const strategies = [
      () => {
        // Strategy 1: Look for article content
        const article = document.querySelector('article, [role="main"], .article-content, .news-content, .content');
        return article ? article.innerText : null;
      },
      () => {
        // Strategy 2: Korean news specific selectors
        const koreanSelectors = [
          '.news_view', '.article_view', '.newsct_article', 
          '#article-view-content-div', '.read_body', '.article_body'
        ];
        for (const selector of koreanSelectors) {
          const element = document.querySelector(selector);
          if (element) return element.innerText;
        }
        return null;
      },
      () => {
        // Strategy 3: Fallback to body but filter out navigation
        const nav = document.querySelectorAll('nav, header, footer, .navigation, .menu, .sidebar');
        nav.forEach(el => el.remove());
        return document.body.innerText;
      }
    ];

    for (const strategy of strategies) {
      try {
        const result = strategy();
        if (result && result.length > 200) { // Minimum content length
          console.log(`Content extraction successful, length: ${result.length}`);
          return result;
        }
      } catch (e) {
        console.warn('Content extraction strategy failed:', e.message);
      }
    }

    // Final fallback
    return document.body.innerText || document.body.textContent || '';
  });

  return content;
}

module.exports = async function enhancedPuppeteerScraper(url, keywords, retryCount = 0) {
  console.log(`🚀 Enhanced Puppeteer scraping: ${url} (attempt ${retryCount + 1})`);
  
  if (retryCount > 0) {
    const delay = exponentialBackoff(retryCount);
    console.log(`⏳ Retry delay: ${Math.round(delay)}ms`);
    await new Promise(resolve => setTimeout(resolve, delay));
  }
  
  let page;
  try {
    const browser = await browserPool.getBrowser();
    page = await browser.newPage();
    
    // Enhanced page configuration
    await configurePage(page, url);
    
    // Random delay before navigation to appear more human-like
    await randomDelay(500, 1500);
    
    // Smart navigation with fallback strategies
    console.log(`🌐 Loading page: ${url}`);
    await smartNavigation(page, url);
    
    // Enhanced content extraction
    console.log(`📄 Extracting content...`);
    const text = await extractEnhancedContent(page, url);
    
    console.log(`📊 Extracted ${text.length} characters`);
    
    if (text.length > 100) { // Minimum threshold for valid content
      const regexes = buildRegexes(keywords);
      const mentions = extractMentions(text, regexes);
      
      console.log(`🎯 Found ${mentions.length} keyword mentions`);
      if (mentions.length > 0) {
        console.log(`📝 Sample: ${mentions[0].substring(0, 100)}...`);
      }
      
      return mentions;
    } else {
      console.log(`⚠️ Insufficient content extracted (${text.length} chars)`);
      return [];
    }
    
  } catch (error) {
    console.error(`❌ Enhanced Puppeteer error for ${url}:`, error.message);
    
    // Enhanced error categorization
    if (error.message.includes('Navigation timeout') || error.message.includes('net::ERR_TIMED_OUT')) {
      console.error(`🕐 TIMEOUT: ${url} - site response too slow`);
    } else if (error.message.includes('net::ERR_NAME_NOT_RESOLVED')) {
      console.error(`🌐 DNS: ${url} - domain name resolution failed`);
    } else if (error.message.includes('net::ERR_CONNECTION_REFUSED')) {
      console.error(`🚫 CONNECTION: ${url} - server refused connection`);
    } else if (error.message.includes('detached') || error.message.includes('Target closed')) {
      console.error(`💔 DETACHED: ${url} - page/frame became detached`);
    } else if (error.message.includes('Protocol error')) {
      console.error(`📡 PROTOCOL: ${url} - Chrome DevTools protocol error`);
    } else {
      console.error(`🐛 UNKNOWN: ${url} - ${error.message}`);
    }
    
    // Enhanced retry logic with better error recovery
    const retryableErrors = [
      'timeout', 'detached', 'Target closed', 'Protocol error',
      'net::ERR_NETWORK_CHANGED', 'net::ERR_INTERNET_DISCONNECTED',
      'Navigation timeout', 'net::ERR_TIMED_OUT'
    ];
    
    if (retryCount < 3 && retryableErrors.some(err => error.message.includes(err))) {
      console.log(`🔄 Retrying ${url} (attempt ${retryCount + 1}/4) - error may be recoverable`);
      
      // Add longer delay for certain errors
      if (error.message.includes('timeout') || error.message.includes('detached')) {
        await new Promise(resolve => setTimeout(resolve, 5000));
      }
      
      return await module.exports(url, keywords, retryCount + 1);
    }
    
    return [];
  } finally {
    if (page && !page.isClosed()) {
      try {
        await page.close();
      } catch (closeError) {
        console.warn(`Page close error: ${closeError.message}`);
      }
    }
  }
};

// Cleanup function for graceful shutdown
module.exports.cleanup = async function() {
  console.log('🧹 Cleaning up Enhanced Puppeteer browser pool...');
  await browserPool.closeAll();
};

// Auto-cleanup on process exit
process.on('exit', module.exports.cleanup);
process.on('SIGINT', async () => {
  await module.exports.cleanup();
  process.exit(0);
});
process.on('SIGTERM', async () => {
  await module.exports.cleanup();
  process.exit(0);
});