// routes/crawl.js
const express = require('express');
const router = express.Router();
const pLimit = require('p-limit');
const crypto = require('crypto');
const csurf = require('csurf');

const cheerioScraper = require('../crawlers/cheerioScraper');
const puppeteerScraper = require('../crawlers/puppeteerScraper');
const enhancedPuppeteerScraper = require('../crawlers/enhancedPuppeteerScraper');
const smartScraper = require('../utils/smartScraper');
const DeepLinkCrawler = require('../utils/deepLinkCrawler');
const { canCrawl } = require('../utils/robots');
const { isSafeHttpUrl, hostnameOf } = require('../utils/url');
const { getUrls, getKeywords } = require('../utils/seeds');
const { concurrency, crawlDelayMsPerHost } = require('../config');
const pool = require('../db');
const rateLimiter = require('../utils/rateLimiter');

const { queryWithRetry } = require('../utils/dbRetry');
const { crawlLimiter } = require('../middleware/ratelimits');
const { requireAdmin } = require('../middleware/auth');

// CSRF only needed for POST
router.use(csurf({ cookie: true }));

function hash(t) { return crypto.createHash('sha256').update(t).digest('hex'); }

// polite per-host throttling
const hostTimers = new Map();
async function politeDelay(host) {
  const last = hostTimers.get(host) || 0;
  const now = Date.now();
  const delta = now - last;
  if (delta < crawlDelayMsPerHost) {
    await new Promise(r => setTimeout(r, crawlDelayMsPerHost - delta));
  }
  hostTimers.set(host, Date.now());
}

// coalesce: only one crawl at a time
let crawlInFlight = false;

async function runCrawl(customUrls = null, options = {}) {
  const urls = (customUrls || getUrls()).filter(isSafeHttpUrl);
  const keywords = getKeywords();
  const limit = pLimit(concurrency);
  
  // Deep link crawling options
  const enableDeepLinks = options.deepLinks !== false; // Default to true
  const maxDepth = options.maxDepth || 2;
  const maxLinksPerPage = options.maxLinksPerPage || 5;
  
  // Generate a unique session ID for this crawl
  const crawlSessionId = `crawl_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  console.log(`[CRAWL] Starting new session: ${crawlSessionId}`);
  console.log(`[CRAWL] Deep links enabled: ${enableDeepLinks}, Max depth: ${maxDepth}`);
  
  // Initialize deep link crawler if enabled
  let deepCrawler = null;
  if (enableDeepLinks) {
    deepCrawler = new DeepLinkCrawler({
      maxDepth: maxDepth,
      maxLinksPerPage: maxLinksPerPage,
      crawlDelay: crawlDelayMsPerHost,
      domainWhitelist: [] // Allow all domains for now
    });
  }
  
  // Track all URLs we've processed to avoid duplicates
  const processedUrls = new Set();
  const urlsToProcess = [...urls]; // Start with seed URLs
  const maxTotalUrls = enableDeepLinks ? 100 : 50; // More URLs when deep crawling
  
  const allResults = [];
  let totalArticlesFound = 0;
  let totalDeepLinksFound = 0;

  for (let depth = 0; depth < maxDepth && urlsToProcess.length > 0 && processedUrls.size < maxTotalUrls; depth++) {
    console.log(`[CRAWL] Processing depth ${depth + 1} with ${urlsToProcess.length} URLs`);
    
    const currentBatch = urlsToProcess.splice(0, 20); // Process in batches
    
    const tasks = currentBatch.map(url => limit(async () => {
      if (processedUrls.has(url)) return null;
      processedUrls.add(url);
      
      const host = hostnameOf(url);
      if (!await canCrawl(url)) return { url, data: [], skipped: 'robots' };
      
      // Apply rate limiting before any requests
      await rateLimiter.waitForRate(url);
      await politeDelay(host);

      let data, discoveredLinks = [];
      let deepLinkResults = [];

      try {
        // Smart scraping with automatic fallback
        console.log(`🎯 Smart scraping: ${url}`);
        const scrapingResult = await smartScraper.scrape(url, keywords, { 
          extractLinks: enableDeepLinks 
        });
        
        data = scrapingResult.data;
        discoveredLinks = scrapingResult.discoveredLinks;
        
        console.log(`📊 Smart scraper used: ${scrapingResult.scraper}, success: ${scrapingResult.success}`);
        console.log(`📄 Found ${data.length} results, ${discoveredLinks.length} links`);

        // Deep link crawling if enabled and we found content
        if (enableDeepLinks && deepCrawler && (data.length > 0 || depth === 0)) {
          try {
            console.log(`[DEEP] Starting deep link crawl for: ${url}`);
            const deepResult = await deepCrawler.crawlWithDeepLinks(url, keywords, 0);
            
            if (deepResult.results && deepResult.results.length > 0) {
              // Extract content from deep link results
              deepLinkResults = deepResult.results.map(result => ({
                url: result.url,
                content: result.mentions ? result.mentions.join('\n---\n') : '',
                metadata: result.metadata || {},
                isDeepLink: true
              }));
              
              totalDeepLinksFound += deepResult.results.length;
              console.log(`[DEEP] Found ${deepResult.results.length} article results from ${url}`);
            }
            
            // Add discovered links to processing queue for next depth
            if (depth < maxDepth - 1 && deepResult.links) {
              const newLinks = deepResult.links.filter(link => 
                !processedUrls.has(link) && 
                isSafeHttpUrl(link) &&
                urlsToProcess.indexOf(link) === -1
              );
              urlsToProcess.push(...newLinks.slice(0, 10)); // Limit new links
              console.log(`[DEEP] Added ${newLinks.length} new URLs to queue`);
            }
          } catch (deepError) {
            console.error(`[DEEP] Deep crawling failed for ${url}:`, deepError.message);
          }
        }

      } catch (error) {
        console.error(`Error crawling ${url}:`, error.message);
        data = [];
      }

      // Store main page results
      const joined = data.join('\n\n---\n\n');
      const contentHash = hash(joined || (url + ':empty'));

      try {
        await queryWithRetry(
          `INSERT INTO crawl_results (session_id, url, content, content_hash, discovered_links, created_at)
           VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)
           ON CONFLICT (content_hash) DO UPDATE SET
           session_id = EXCLUDED.session_id, 
           created_at = CURRENT_TIMESTAMP`,
          [crawlSessionId, url, joined, contentHash, JSON.stringify(discoveredLinks)]
        );
      } catch (dbError) {
        console.error(`Database error for ${url}:`, dbError.message);
      }

      // Store deep link results separately
      for (const deepResult of deepLinkResults) {
        const deepContentHash = hash(deepResult.content || (deepResult.url + ':empty'));
        try {
          await queryWithRetry(
            `INSERT INTO crawl_results (session_id, url, content, content_hash, metadata, is_deep_link, created_at)
             VALUES ($1, $2, $3, $4, $5, true, CURRENT_TIMESTAMP)
             ON CONFLICT (content_hash) DO UPDATE SET
             session_id = EXCLUDED.session_id,
             created_at = CURRENT_TIMESTAMP`,
            [crawlSessionId, deepResult.url, deepResult.content, deepContentHash, 
             JSON.stringify(deepResult.metadata)]
          );
          totalArticlesFound++;
        } catch (dbError) {
          console.error(`Database error for deep link ${deepResult.url}:`, dbError.message);
        }
      }

      return { 
        url, 
        data, 
        deepLinkResults,
        discoveredLinks,
        contentLength: joined.length 
      };
    }));

    const results = await Promise.allSettled(tasks);
    allResults.push(...results.map(r => r.status === 'fulfilled' ? r.value : null).filter(Boolean));
  }

  // Log crawl statistics
  console.log(`[CRAWL] Completed session ${crawlSessionId}: processed ${processedUrls.size} URLs across ${maxDepth} depth levels`);
  if (enableDeepLinks) {
    console.log(`[CRAWL] Deep link stats: ${totalArticlesFound} articles, ${totalDeepLinksFound} deep results`);
    if (deepCrawler) {
      const stats = deepCrawler.getStats();
      console.log(`[CRAWL] Deep crawler visited ${stats.visitedUrls} unique URLs`);
    }
  }
  
  // Smart scraper performance stats
  const scraperStats = smartScraper.getStats();
  console.log(`[SCRAPER] Performance: Cheerio ${Math.round(scraperStats.cheerioSuccessRate * 100)}%, Puppeteer ${Math.round(scraperStats.puppeteerSuccessRate * 100)}%`);
  console.log(`[SCRAPER] Sites remembered: ${scraperStats.sitesRemembered}, Total attempts: ${scraperStats.totalAttempts}`);

  return { 
    sessionId: crawlSessionId, 
    results: allResults,
    stats: {
      totalUrls: processedUrls.size,
      totalArticles: totalArticlesFound,
      totalDeepLinks: totalDeepLinksFound,
      enabledDeepLinks: enableDeepLinks,
      maxDepth: maxDepth,
      scraperPerformance: scraperStats
    }
  };
}

// NEW: Admin-friendly POST (CSRF protected, no token in URL/logs)
router.post('/crawl', requireAdmin, crawlLimiter, async (req, res) => {
  if (crawlInFlight) return res.status(202).send('Crawl already running');
  crawlInFlight = true;
  try {
    // Extract crawl options from request body
    const options = {
      deepLinks: req.body.deepLinks !== 'false', // Default to true unless explicitly disabled
      maxDepth: parseInt(req.body.maxDepth) || 2,
      maxLinksPerPage: parseInt(req.body.maxLinksPerPage) || 5
    };
    
    console.log(`[ADMIN] Starting crawl with options:`, options);
    const crawlResult = await runCrawl(null, options);
    
    // Redirect to main page with the specific session ID and stats
    const params = new URLSearchParams({
      session: crawlResult.sessionId,
      stats: JSON.stringify(crawlResult.stats)
    });
    res.redirect('/?' + params.toString());
  } finally {
    crawlInFlight = false;
  }
});

// Existing GET for external triggers/cron (requires token)
router.get('/crawl', requireAdmin, crawlLimiter, async (req, res) => {
  const token = req.get('X-CRAWL-TOKEN') || req.query.token;
  if (token !== process.env.CRAWL_TOKEN) return res.status(401).send('Invalid crawl token');

  if (crawlInFlight) return res.status(202).send('Crawl already running');
  crawlInFlight = true;
  try {
    const crawlResult = await runCrawl();
    // Redirect to main page with the specific session ID
    res.redirect('/?session=' + encodeURIComponent(crawlResult.sessionId));
  } finally {
    crawlInFlight = false;
  }
});

module.exports = router;
module.exports.runCrawl = runCrawl;