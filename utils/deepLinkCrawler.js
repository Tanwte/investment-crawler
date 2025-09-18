// utils/deepLinkCrawler.js - Deep link crawling for complete article extraction
const url = require('url');
const cheerioScraper = require('../crawlers/cheerioScraper');
const puppeteerScraper = require('../crawlers/enhancedPuppeteerScraper');
const { randomDelay } = require('./stealthConfig');

class DeepLinkCrawler {
  constructor(options = {}) {
    this.maxDepth = options.maxDepth || 2;
    this.maxLinksPerPage = options.maxLinksPerPage || 10;
    this.visitedUrls = new Set();
    this.crawlDelay = options.crawlDelay || 2000;
    this.respectRobots = options.respectRobots !== false;
    this.domainWhitelist = options.domainWhitelist || [];
    this.linkPatterns = options.linkPatterns || this.getDefaultLinkPatterns();
  }

  getDefaultLinkPatterns() {
    return [
      // Korean news patterns
      /news|article|기사|뉴스|보도/i,
      /press|보도자료|프레스/i,
      /investment|투자|펀드/i,
      /economy|경제|금융/i,
      /trade|무역|수출|수입/i,
      /singapore|싱가포르/i,
      /asean|아세안|동남아/i,
      /cooperation|협력|협정/i,
      
      // URL path patterns
      /\/news\//i,
      /\/article\//i,
      /\/press\//i,
      /\/economy\//i,
      /\/business\//i,
      /\/finance\//i,
      /\/investment\//i,
      /\/trade\//i,
      /\/international\//i,
      /\/global\//i,
      
      // Date patterns (recent articles)
      /\/20(24|25|26)\//,
      /\/(0[1-9]|1[0-2])\//,
      
      // Article ID patterns
      /articleid|newsid|id=/i,
      /\/\d{6,}/
    ];
  }

  // Extract potential article links from a page
  extractArticleLinks($, baseUrl) {
    const links = new Set();
    const selectors = [
      'a[href*="news"]',
      'a[href*="article"]',
      'a[href*="press"]',
      'a[href*="기사"]',
      'a[href*="뉴스"]',
      'a[href*="보도"]',
      '.news-list a',
      '.article-list a',
      '.headline a',
      '.news-title a',
      '.article-title a',
      '[class*="news"] a',
      '[class*="article"] a',
      '[class*="headline"] a'
    ];

    // Extract links using multiple selectors
    selectors.forEach(selector => {
      $(selector).each((i, el) => {
        const href = $(el).attr('href');
        if (href) {
          try {
            const absoluteUrl = url.resolve(baseUrl, href);
            const linkText = $(el).text().trim();
            
            // Check if link matches our patterns
            if (this.isRelevantLink(absoluteUrl, linkText)) {
              links.add(absoluteUrl);
            }
          } catch (error) {
            // Skip invalid URLs
          }
        }
      });
    });

    // Also check for links in article previews and teasers
    $('[class*="preview"], [class*="teaser"], [class*="summary"]').each((i, el) => {
      $(el).find('a').each((j, linkEl) => {
        const href = $(linkEl).attr('href');
        if (href) {
          try {
            const absoluteUrl = url.resolve(baseUrl, href);
            const linkText = $(linkEl).text().trim();
            
            if (this.isRelevantLink(absoluteUrl, linkText)) {
              links.add(absoluteUrl);
            }
          } catch (error) {
            // Skip invalid URLs
          }
        }
      });
    });

    return Array.from(links).slice(0, this.maxLinksPerPage);
  }

  // Check if a link is relevant for crawling
  isRelevantLink(linkUrl, linkText) {
    try {
      const urlObj = new URL(linkUrl);
      
      // Skip non-HTTP(S) links
      if (!urlObj.protocol.startsWith('http')) {
        return false;
      }

      // Check domain whitelist if specified
      if (this.domainWhitelist.length > 0) {
        const allowed = this.domainWhitelist.some(domain => 
          urlObj.hostname.includes(domain)
        );
        if (!allowed) return false;
      }

      // Skip already visited URLs
      if (this.visitedUrls.has(linkUrl)) {
        return false;
      }

      // Check URL patterns
      const urlMatches = this.linkPatterns.some(pattern => 
        pattern.test(linkUrl) || pattern.test(linkText)
      );

      // Additional checks for Korean content
      const hasKoreanKeywords = /투자|경제|무역|뉴스|기사|보도|협력|싱가포르|아세안|동남아/.test(linkText);
      
      // Check for Singapore/ASEAN related content
      const hasSingaporeContent = /singapore|asean|sea|southeast.*asia/i.test(linkText);
      
      return urlMatches || hasKoreanKeywords || hasSingaporeContent;
    } catch (error) {
      return false;
    }
  }

  // Crawl a page and extract deep links
  async crawlWithDeepLinks(startUrl, keywords, currentDepth = 0) {
    if (currentDepth >= this.maxDepth) {
      return { results: [], links: [] };
    }

    if (this.visitedUrls.has(startUrl)) {
      return { results: [], links: [] };
    }

    this.visitedUrls.add(startUrl);
    
    console.log(`[DEEP] Crawling depth ${currentDepth}: ${startUrl}`);

    try {
      // First, scrape the main page
      let mainResult;
      try {
        mainResult = await cheerioScraper(startUrl, keywords);
      } catch (error) {
        console.log(`[DEEP] Cheerio failed for ${startUrl}, trying Puppeteer`);
        mainResult = await puppeteerScraper(startUrl, keywords);
      }

      const results = [mainResult];
      const allLinks = [];

      // If we found content or this is the first level, look for deeper links
      if (mainResult.mentions.length > 0 || currentDepth === 0) {
        // Add delay between requests
        await randomDelay(this.crawlDelay);

        // Extract links from the page content
        const cheerio = require('cheerio');
        const $ = cheerio.load(mainResult.html || '');
        const articleLinks = this.extractArticleLinks($, startUrl);
        
        console.log(`[DEEP] Found ${articleLinks.length} potential article links at depth ${currentDepth}`);
        allLinks.push(...articleLinks);

        // Crawl article links if we haven't reached max depth
        if (currentDepth < this.maxDepth - 1) {
          for (const linkUrl of articleLinks.slice(0, 5)) { // Limit concurrent crawls
            try {
              await randomDelay(this.crawlDelay);
              
              const linkResult = await this.crawlWithDeepLinks(linkUrl, keywords, currentDepth + 1);
              results.push(...linkResult.results);
              allLinks.push(...linkResult.links);
              
            } catch (error) {
              console.error(`[DEEP] Error crawling link ${linkUrl}:`, error.message);
            }
          }
        }
      }

      return {
        results: results.filter(r => r && r.mentions && r.mentions.length > 0),
        links: [...new Set(allLinks)]
      };

    } catch (error) {
      console.error(`[DEEP] Error crawling ${startUrl}:`, error.message);
      return { results: [], links: [] };
    }
  }

  // Enhanced content extraction for articles
  async extractArticleContent(url, keywords) {
    console.log(`[DEEP] Extracting full article content from: ${url}`);
    
    try {
      // Try Cheerio first for speed
      let result = await cheerioScraper(url, keywords);
      
      // If no content found, use Puppeteer for dynamic content
      if (!result.mentions || result.mentions.length === 0) {
        console.log(`[DEEP] No content with Cheerio, trying Puppeteer for: ${url}`);
        result = await puppeteerScraper(url, keywords);
      }

      // Enhanced content extraction for articles
      if (result.html) {
        const cheerio = require('cheerio');
        const $ = cheerio.load(result.html);
        
        // Extract article metadata
        const metadata = this.extractArticleMetadata($);
        
        // Extract article body with better selectors
        const articleContent = this.extractArticleBody($);
        
        // Combine results
        result.metadata = metadata;
        result.articleContent = articleContent;
        result.isDeepLink = true;
      }

      return result;
    } catch (error) {
      console.error(`[DEEP] Error extracting article content from ${url}:`, error.message);
      return null;
    }
  }

  // Extract article metadata
  extractArticleMetadata($) {
    return {
      title: $('title').text().trim() || 
             $('h1').first().text().trim() || 
             $('[class*="title"], [class*="headline"]').first().text().trim(),
      
      author: $('[class*="author"], [class*="writer"], [name*="author"]').first().text().trim() ||
              $('meta[name="author"]').attr('content') || '',
      
      publishDate: $('[class*="date"], [class*="time"], [datetime]').first().text().trim() ||
                   $('meta[property="article:published_time"]').attr('content') ||
                   $('meta[name="pubdate"]').attr('content') || '',
      
      source: $('[class*="source"], [class*="press"]').first().text().trim() ||
              $('meta[property="article:publisher"]').attr('content') || '',
      
      description: $('meta[name="description"]').attr('content') ||
                   $('meta[property="og:description"]').attr('content') || '',
      
      tags: $('[class*="tag"], [class*="category"]').map((i, el) => $(el).text().trim()).get(),
      
      language: $('html').attr('lang') || 'ko'
    };
  }

  // Extract main article body content
  extractArticleBody($) {
    const selectors = [
      '.article-content',
      '.news-content', 
      '.post-content',
      '.entry-content',
      '[class*="article-body"]',
      '[class*="news-body"]',
      '[class*="content-body"]',
      '.content',
      'article',
      'main',
      '[role="main"]'
    ];

    for (const selector of selectors) {
      const content = $(selector);
      if (content.length > 0 && content.text().trim().length > 100) {
        // Clean up the content
        content.find('script, style, nav, footer, aside, .ad, .advertisement').remove();
        return content.text().trim();
      }
    }

    // Fallback to body content if no specific article content found
    const bodyContent = $('body').clone();
    bodyContent.find('header, nav, footer, aside, script, style, .menu, .sidebar, .ad, .advertisement').remove();
    return bodyContent.text().trim();
  }

  // Get crawl statistics
  getStats() {
    return {
      visitedUrls: this.visitedUrls.size,
      maxDepth: this.maxDepth,
      maxLinksPerPage: this.maxLinksPerPage
    };
  }

  // Reset crawler state
  reset() {
    this.visitedUrls.clear();
  }
}

module.exports = DeepLinkCrawler;