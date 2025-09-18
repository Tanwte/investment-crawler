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

module.exports = async function puppeteerScraper(url, keywords, retryCount = 0) {
  console.log(`Puppeteer scraping: ${url} with keywords:`, keywords.slice(0, 3));
  
  if (retryCount > 0) {
    const delay = exponentialBackoff(retryCount);
    console.log(`Retry attempt ${retryCount}, waiting ${Math.round(delay)}ms`);
    await new Promise(resolve => setTimeout(resolve, delay));
  }
  
  let browser;
  try {
    // Random viewport and user agent for each request
    const viewport = getRandomViewport();
    const randomUA = getRandomUserAgent();
    
    browser = await puppeteer.launch({
      headless: true,
      timeout: 60000,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--disable-web-security',
        '--disable-features=VizDisplayCompositor'
      ]
    });
    
    const page = await browser.newPage();
    
    // Simple configuration
    await page.setUserAgent(randomUA);
    await page.setViewport(viewport);
    await page.setExtraHTTPHeaders({
      'Accept-Language': getRandomAcceptLanguage(),
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
    });
    
    // Simple request interception - block heavy resources
    await page.setRequestInterception(true);
    page.on('request', req => {
      const resourceType = req.resourceType();
      if (['image', 'font', 'media'].includes(resourceType)) {
        req.abort();
      } else {
        req.continue();
      }
    });
    
    console.log(`Loading page: ${url}`);
    
    // Add small delay before navigation
    await randomDelay(500, 1000);
    
    // Simple navigation with fallback
    try {
      await page.goto(url, { 
        waitUntil: 'domcontentloaded', 
        timeout: 30000 
      });
      console.log('Page loaded successfully');
    } catch (navError) {
      console.log(`First navigation failed: ${navError.message}`);
      try {
        await page.goto(url, { 
          waitUntil: 'networkidle2', 
          timeout: 45000 
        });
        console.log('Page loaded with networkidle2');
      } catch (secondError) {
        throw new Error(`Navigation failed: ${secondError.message}`);
      }
    }
    
    // Simple wait for content
    await randomDelay(2000, 4000);
    
    // Simple dynamic content waiting
    if (url.includes('naver.com') || url.includes('daum.net')) {
      console.log('Waiting for Korean site dynamic content...');
      await randomDelay(3000, 5000);
    }
    
    console.log('Extracting text...');
    
    // Simple text extraction
    const text = await page.evaluate(() => {
      return document.body.innerText || document.body.textContent || '';
    });
    
    console.log(`Extracted text length: ${text.length}`);
    if (text.length > 0) {
      console.log(`Sample text: ${text.substring(0, 100)}...`);
      
      const regexes = buildRegexes(keywords);
      console.log(`Built ${regexes.length} regexes`);
      
      const mentions = extractMentions(text, regexes);
      console.log(`Found ${mentions.length} mentions`);
      
      return mentions;
    } else {
      console.log('No text extracted');
      return [];
    }
    
  } catch (error) {
    console.error(`Puppeteer error for ${url}:`, error.message);
    
    // Log specific timeout errors for monitoring
    if (error.message.includes('Navigation timeout')) {
      console.error(`❌ TIMEOUT: ${url} took longer than expected to load`);
    } else if (error.message.includes('net::ERR')) {
      console.error(`❌ NETWORK: ${url} has connectivity issues`);
    } else if (error.message.includes('navigation strategies failed')) {
      console.error(`❌ FAILED: ${url} could not be loaded with any strategy`);
    }
    
    // Implement retry logic for recoverable errors
    if (retryCount < 2 && (
      error.message.includes('timeout') || 
      error.message.includes('detached') ||
      error.message.includes('net::ERR_NETWORK_CHANGED')
    )) {
      console.log(`Retrying ${url} (attempt ${retryCount + 1}/3)`);
      return await module.exports(url, keywords, retryCount + 1);
    }
    
    return [];
  } finally {
    if (browser) {
      await browser.close();
    }
  }
};