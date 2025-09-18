// utils/smartScraper.js
const cheerioScraper = require('../crawlers/cheerioScraper');
const enhancedPuppeteerScraper = require('../crawlers/enhancedPuppeteerScraper');

// Site classification for optimal scraper selection
const SITE_CONFIGS = {
  // Dynamic Korean sites that require Puppeteer
  DYNAMIC_KOREAN: [
    'naver.com', 'daum.net', 'newsstand.naver.com', 
    'sports.naver.com', 'finance.naver.com'
  ],
  
  // Heavy JavaScript sites
  HEAVY_JS: [
    'hankyung.com', 'mk.co.kr', 'mt.co.kr',
    'inews24.com', 'newspim.com'
  ],
  
  // Static or Cheerio-friendly sites
  STATIC_FRIENDLY: [
    'chosun.com', 'donga.com', 'joongang.co.kr',
    'yonhapnews.co.kr', 'yna.co.kr', 'reuters.com',
    'bloomberg.com', 'channelnewsasia.com'
  ],
  
  // Government/official sites (usually static)
  OFFICIAL: [
    'mofa.go.kr', 'kotra.or.kr', 'kdb.co.kr',
    'mti.gov.sg', 'enterprisesg.gov.sg', 'mas.gov.sg'
  ]
};

class SmartScraper {
  constructor() {
    this.scraperStats = {
      cheerio: { success: 0, failures: 0 },
      puppeteer: { success: 0, failures: 0 }
    };
    this.siteMemory = new Map(); // Remember what works for each site
  }

  // Classify site type for optimal scraper selection
  classifySite(url) {
    const hostname = new URL(url).hostname.toLowerCase();
    
    if (SITE_CONFIGS.DYNAMIC_KOREAN.some(site => hostname.includes(site))) {
      return 'DYNAMIC_KOREAN';
    }
    if (SITE_CONFIGS.HEAVY_JS.some(site => hostname.includes(site))) {
      return 'HEAVY_JS';
    }
    if (SITE_CONFIGS.STATIC_FRIENDLY.some(site => hostname.includes(site))) {
      return 'STATIC_FRIENDLY';
    }
    if (SITE_CONFIGS.OFFICIAL.some(site => hostname.includes(site))) {
      return 'OFFICIAL';
    }
    
    // Default classification based on domain characteristics
    if (hostname.includes('.kr') || hostname.includes('.co.kr')) {
      return 'KOREAN_SITE';
    }
    
    return 'UNKNOWN';
  }

  // Get preferred scraper order based on site classification and history
  getScraperStrategy(url) {
    const hostname = new URL(url).hostname;
    const siteType = this.classifySite(url);
    const history = this.siteMemory.get(hostname);

    // If we have successful history, use it
    if (history && history.lastSuccessful) {
      console.log(`📊 Using remembered strategy for ${hostname}: ${history.lastSuccessful}`);
      return history.lastSuccessful === 'puppeteer' 
        ? ['puppeteer', 'cheerio'] 
        : ['cheerio', 'puppeteer'];
    }

    // Site-type based strategy
    switch (siteType) {
      case 'DYNAMIC_KOREAN':
      case 'HEAVY_JS':
        return ['puppeteer', 'cheerio'];
      
      case 'STATIC_FRIENDLY':
      case 'OFFICIAL':
        return ['cheerio', 'puppeteer'];
      
      case 'KOREAN_SITE':
        // Korean sites often have dynamic content
        return ['puppeteer', 'cheerio'];
      
      default:
        // Unknown sites: try Cheerio first (faster)
        return ['cheerio', 'puppeteer'];
    }
  }

  // Record scraper performance for future decisions
  recordResult(url, scraper, success, resultCount = 0) {
    const hostname = new URL(url).hostname;
    
    // Update global stats
    if (success && resultCount > 0) {
      this.scraperStats[scraper].success++;
    } else {
      this.scraperStats[scraper].failures++;
    }

    // Update site-specific memory
    if (!this.siteMemory.has(hostname)) {
      this.siteMemory.set(hostname, {
        cheerio: { success: 0, failures: 0, lastAttempt: null },
        puppeteer: { success: 0, failures: 0, lastAttempt: null }
      });
    }

    const siteData = this.siteMemory.get(hostname);
    siteData[scraper].lastAttempt = Date.now();
    
    if (success && resultCount > 0) {
      siteData[scraper].success++;
      siteData.lastSuccessful = scraper;
      siteData.lastSuccessTime = Date.now();
    } else {
      siteData[scraper].failures++;
    }
  }

  // Main smart scraping function
  async scrape(url, keywords, options = {}) {
    const { extractLinks = false, maxRetries = 2 } = options;
    const strategy = this.getScraperStrategy(url);
    
    console.log(`🎯 Smart scraping ${url} with strategy: [${strategy.join(' → ')}]`);
    
    for (const scraperType of strategy) {
      try {
        console.log(`🔄 Trying ${scraperType} for ${url}`);
        let result;
        
        if (scraperType === 'cheerio') {
          result = await cheerioScraper(url, keywords, { extractLinks });
          
          // Handle both old and new cheerio return formats
          let data, discoveredLinks = [];
          if (Array.isArray(result)) {
            data = result;
          } else {
            data = result.snippets || [];
            discoveredLinks = result.discoveredLinks || [];
          }
          
          if (data.length > 0) {
            console.log(`✅ Cheerio success: ${data.length} results`);
            this.recordResult(url, 'cheerio', true, data.length);
            return { 
              data, 
              discoveredLinks, 
              scraper: 'cheerio',
              success: true
            };
          } else {
            console.log(`⚠️ Cheerio found no content`);
            this.recordResult(url, 'cheerio', false, 0);
          }
          
        } else { // puppeteer
          result = await enhancedPuppeteerScraper(url, keywords);
          
          if (result && result.length > 0) {
            console.log(`✅ Enhanced Puppeteer success: ${result.length} results`);
            this.recordResult(url, 'puppeteer', true, result.length);
            return { 
              data: result, 
              discoveredLinks: [], // Puppeteer doesn't extract links in this implementation
              scraper: 'puppeteer',
              success: true
            };
          } else {
            console.log(`⚠️ Enhanced Puppeteer found no content`);
            this.recordResult(url, 'puppeteer', false, 0);
          }
        }
        
      } catch (error) {
        console.warn(`❌ ${scraperType} failed for ${url}: ${error.message}`);
        this.recordResult(url, scraperType, false, 0);
        
        // Don't try next scraper for certain terminal errors
        if (error.message.includes('net::ERR_NAME_NOT_RESOLVED') ||
            error.message.includes('ENOTFOUND') ||
            error.message.includes('net::ERR_CONNECTION_REFUSED')) {
          console.log(`🛑 Terminal error, skipping remaining scrapers`);
          break;
        }
      }
    }
    
    console.log(`😞 All scrapers failed for ${url}`);
    return { 
      data: [], 
      discoveredLinks: [], 
      scraper: 'none',
      success: false
    };
  }

  // Get performance statistics
  getStats() {
    const total = Object.values(this.scraperStats).reduce((sum, stats) => sum + stats.success + stats.failures, 0);
    
    return {
      totalAttempts: total,
      cheerioSuccessRate: this.scraperStats.cheerio.success / (this.scraperStats.cheerio.success + this.scraperStats.cheerio.failures) || 0,
      puppeteerSuccessRate: this.scraperStats.puppeteer.success / (this.scraperStats.puppeteer.success + this.scraperStats.puppeteer.failures) || 0,
      sitesRemembered: this.siteMemory.size,
      scraperStats: this.scraperStats
    };
  }

  // Reset statistics (useful for testing)
  resetStats() {
    this.scraperStats = {
      cheerio: { success: 0, failures: 0 },
      puppeteer: { success: 0, failures: 0 }
    };
    this.siteMemory.clear();
  }
}

// Export singleton instance
module.exports = new SmartScraper();