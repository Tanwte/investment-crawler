// utils/deepLinkCrawler.js - Deep link crawling for complete article extraction
const url = require('url');
const axios = require('axios');
const cheerioScraper = require('../crawlers/cheerioScraper');
const puppeteerScraper = require('../crawlers/enhancedPuppeteerScraper');
const smartScraper = require('./smartScraper');
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
    this.targetKeywords = [];
  }

  getDefaultLinkPatterns() {
    return [
      // Content type patterns
      /article|news|post|story|blog|page/i,
      /analysis|research|report|study|review/i,
      /profile|biography|about|overview/i,
      /press|announcement|release|statement/i,
      /guide|tutorial|how.*to|explainer/i,
      /policy|strategy|plan|initiative|program/i,
      
      // Korean content patterns
      /기사|뉴스|보도|소식/i,
      /분석|연구|리포트|조사/i,
      /투자|경제|금융|무역/i,
      /정책|전략|계획|협력/i,
      
      // URL path patterns (generic)
      /\/news\/|\/article\/|\/post\/|\/story\//i,
      /\/press\/|\/announcement\/|\/release\//i,
      /\/\d{4}\/\d{2}\/|\/\d{4}-\d{2}-/i // Date patterns in URLs
    ];
  }

  // Main deep crawling method with enhanced keyword integration
  async crawlWithDeepLinks(startUrl, keywords = [], currentDepth = 0) {
    // Set keywords for this crawl session
    this.setTargetKeywords(keywords);
    console.log(`[DEEP] 🎯 Starting deep crawl from: ${startUrl} (depth: ${currentDepth})`);
    console.log(`[DEEP] 🔍 Target keywords: ${keywords.join(', ')}`);

    if (currentDepth > this.maxDepth) {
      console.log(`[DEEP] ⚠️ Max depth ${this.maxDepth} exceeded, stopping`);
      return { results: [], links: [] };
    }

    if (this.visitedUrls.has(startUrl)) {
      console.log(`[DEEP] 🔄 Already visited: ${startUrl}`);
      return { results: [], links: [] };
    }

    this.visitedUrls.add(startUrl);
    console.log(`[DEEP] ➕ Added to visited: ${startUrl} (total: ${this.visitedUrls.size})`);

    try {
      const results = [];
      const allLinks = [];

      // Extract content from current page using smart scraper
      console.log(`[DEEP] 📄 Extracting content from: ${startUrl}`);
      const pageResult = await smartScraper.scrape(startUrl, keywords);
      
      if (pageResult && pageResult.data && pageResult.data.length > 0) {
        console.log(`[DEEP] ✅ Crawling depth ${currentDepth}: ${startUrl}`);
        console.log(`[DEEP] 🎯 Enhanced matching: ${pageResult.data.length} mentions found`);
        // Convert smartScraper format to expected format
        const convertedResult = {
          url: startUrl,
          mentions: pageResult.data,
          isDeepLink: currentDepth > 0,
          crawlDepth: currentDepth,
          scraper: pageResult.scraper
        };
        results.push(convertedResult);
      } else {
        console.log(`[DEEP] ❌ No relevant content found at: ${startUrl}`);
      }

      // Find article links on the current page if not at max depth
      if (currentDepth < this.maxDepth) {
        console.log(`[DEEP] 🔗 Looking for article links on: ${startUrl}`);
        let articleLinks = await this.findArticleLinks(startUrl);
        
        console.log(`[DEEP] Found ${articleLinks.length} potential article links at depth ${currentDepth}`);
        
        // Filter for keyword relevance and visited URLs
        if (keywords && keywords.length > 0) {
          console.log(`[DEEP] 🔍 Filtering links for keywords: ${keywords.join(', ')}`);
          
          const filteredLinks = [];
          let skippedVisited = 0;
          let skippedIrrelevant = 0;
          
          articleLinks.forEach(link => {
            // Check if already visited
            if (this.visitedUrls.has(link)) {
              skippedVisited++;
              console.log(`[DEEP] 🔄 Skip visited: ${link}`);
              return;
            }
            
            // Check keyword relevance
            const hasKeywords = this.containsTargetKeywords(link, '');
            const isWikipediaRelevant = this.isWikipediaRelevantLink(link, '');
            
            if (hasKeywords || isWikipediaRelevant) {
              filteredLinks.push(link);
              const reason = hasKeywords ? 'contains keywords' : 'Wikipedia relevant';
              console.log(`[DEEP] ✅ Include: ${link} (${reason})`);
            } else {
              skippedIrrelevant++;
              console.log(`[DEEP] ❌ Skip irrelevant: ${link}`);
            }
          });
          
          console.log(`[DEEP] 📊 Filtering results: ${filteredLinks.length} included, ${skippedVisited} visited, ${skippedIrrelevant} irrelevant`);
          articleLinks = filteredLinks;
        }
        
        allLinks.push(...articleLinks);
        console.log(`[DEEP] Added ${articleLinks.length} new URLs to queue`);

        // Crawl article links if we haven't exceeded max depth
        if (currentDepth + 1 <= this.maxDepth && articleLinks.length > 0) {
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
      
      if (result && result.length > 0) {
        // Enhanced processing
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

  // Find article links on a given page
  async findArticleLinks(pageUrl) {
    try {
      const response = await axios.get(pageUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        },
        timeout: 10000
      });

      const cheerio = require('cheerio');
      const $ = cheerio.load(response.data);
      
      const links = new Set();
      const baseUrl = new URL(pageUrl);

      // Enhanced link discovery specifically for Wikipedia
      if (pageUrl.includes('wikipedia.org')) {
        // Focus on main content area links
        $('#mw-content-text a[href^="/wiki/"]:not([href*=":"]):not([href*="#"])').each((i, element) => {
          const href = $(element).attr('href');
          const linkText = $(element).text().trim();
          
          if (href && !href.includes(':') && !href.includes('#')) {
            try {
              const absoluteUrl = new URL(href, baseUrl).toString();
              
              // Skip file/media links
              if (this.isNonContentUrl(absoluteUrl)) {
                return;
              }

              // For Wikipedia, be more permissive with content links
              links.add(absoluteUrl);
              
            } catch (error) {
              // Skip invalid URLs
            }
          }
        });
      } else {
        // Original logic for non-Wikipedia sites
        $('a[href]').each((i, element) => {
          const href = $(element).attr('href');
          const linkText = $(element).text().trim();
          
          if (!href || href.startsWith('#') || href.startsWith('javascript:') || href.startsWith('mailto:')) {
            return;
          }

          try {
            const absoluteUrl = new URL(href, baseUrl).toString();
            
            // Skip non-content URLs
            if (this.isNonContentUrl(absoluteUrl)) {
              return;
            }

            // Apply various filtering strategies
            if (this.isRelevantLink(absoluteUrl, linkText)) {
              links.add(absoluteUrl);
            }
            
          } catch (error) {
            // Skip invalid URLs
          }
        });
      }

      const allLinks = Array.from(links);
      console.log(`[DEEP] 📋 Found ${allLinks.length} total links on ${pageUrl}`);
      
      // Prioritize keyword-relevant links first
      if (this.targetKeywords && this.targetKeywords.length > 0) {
        const keywordLinks = [];
        const otherLinks = [];
        
        allLinks.forEach(link => {
          const hasKeywords = this.containsTargetKeywords(link, '');
          
          // Only prioritize links that actually contain our target keywords
          if (hasKeywords) {
            keywordLinks.push(link);
          } else {
            otherLinks.push(link);
          }
        });
        
        // Sort keyword links to prioritize exact keyword matches first
        keywordLinks.sort((a, b) => {
          // Safety checks
          if (!a || !b) return 0;
          
          // Prioritize multi-word keywords (like "Lee Kuan Yew") over single words (like "Singapore")
          const aHasMultiWordKeyword = this.targetKeywords.some(keyword => 
            keyword.includes(' ') && this.containsTargetKeywords(a, '')
          );
          const bHasMultiWordKeyword = this.targetKeywords.some(keyword => 
            keyword.includes(' ') && this.containsTargetKeywords(b, '')
          );
          
          // Check specifically for each keyword to determine priority
          let aPriority = 0;
          let bPriority = 0;
          
          this.targetKeywords.forEach((keyword, index) => {
            if (this.containsTargetKeywords(a, '') && 
                `${a} `.toLowerCase().includes(keyword.toLowerCase().replace(/\s+/g, '_'))) {
              aPriority = keyword.includes(' ') ? 100 - index : 50 - index;
            }
            if (this.containsTargetKeywords(b, '') && 
                `${b} `.toLowerCase().includes(keyword.toLowerCase().replace(/\s+/g, '_'))) {
              bPriority = keyword.includes(' ') ? 100 - index : 50 - index;
            }
          });
          
          // Higher priority comes first
          if (aPriority !== bPriority) {
            return bPriority - aPriority;
          }
          
          return 0;
        });
        
        // Return keyword links first, then fill up to maxLinksPerPage with others
        const prioritizedLinks = [...keywordLinks, ...otherLinks];
        
        // If we have target keywords, only return links that actually contain them
        // Don't fill with irrelevant links
        if (keywordLinks.length > 0) {
          return keywordLinks.slice(0, this.maxLinksPerPage);
        }
        
        // If no keyword links found, fall back to returning prioritized links
        return prioritizedLinks.slice(0, this.maxLinksPerPage);
      }
      
      return allLinks.slice(0, this.maxLinksPerPage);
      
    } catch (error) {
      console.error(`[DEEP] Error finding links on ${pageUrl}:`, error.message);
      return [];
    }
  }

  // Enhanced link relevance checking
  isRelevantLink(linkUrl, linkText) {
    // Check against link patterns
    const hasRelevantPattern = this.linkPatterns.some(pattern => 
      pattern.test(linkUrl) || pattern.test(linkText)
    );

    // Check domain whitelist if specified
    if (this.domainWhitelist.length > 0) {
      try {
        const linkDomain = new URL(linkUrl).hostname;
        const isWhitelisted = this.domainWhitelist.some(domain => 
          linkDomain.includes(domain) || domain.includes(linkDomain)
        );
        
        return hasRelevantPattern && isWhitelisted;
      } catch {
        return false;
      }
    }

    // General content relevance check
    const hasRelevantContent = this.hasRelevantContent(linkText);
    
    // Keyword relevance if keywords are set
    const hasKeywords = this.containsTargetKeywords(linkUrl, linkText);
    
    // Wikipedia specific relevance
    const isWikipediaRelevant = this.isWikipediaRelevantLink(linkUrl, linkText);

    return hasRelevantPattern || hasRelevantContent || hasKeywords || isWikipediaRelevant;
  }

  // Get crawl statistics
  getStats() {
    const visitedStats = this.getVisitedStats();
    return {
      visitedUrls: this.visitedUrls.size,
      maxDepth: this.maxDepth,
      maxLinksPerPage: this.maxLinksPerPage,
      visitedDetails: visitedStats
    };
  }

  // Reset crawler state
  reset() {
    this.visitedUrls.clear();
  }

  // Set target keywords for intelligent link discovery
  setTargetKeywords(keywords) {
    this.targetKeywords = keywords || [];
  }

  // Check if URL points to non-content (skip images, PDFs, etc.)
  isNonContentUrl(url) {
    const extensions = /\.(pdf|doc|docx|xls|xlsx|ppt|pptx|zip|rar|jpg|jpeg|png|gif|svg|mp4|mp3|avi)$/i;
    return extensions.test(url);
  }

  // Check target keywords exist
  containsTargetKeywords(linkUrl, linkText) {
    if (!this.targetKeywords || this.targetKeywords.length === 0) {
      return false;
    }

    const searchText = `${linkUrl} ${linkText}`.toLowerCase();
    
    return this.targetKeywords.some(keyword => {
      const keywordLower = keyword.toLowerCase();
      
      // For multi-word keywords (phrases), check if all words are present
      if (keyword.includes(' ')) {
        const words = keywordLower.split(' ');
        return words.every(word => searchText.includes(word));
      }
      
      // For single words, direct match
      return searchText.includes(keywordLower);
    });
  }

  // Get visited URLs for debugging
  getVisitedUrls() {
    return Array.from(this.visitedUrls);
  }

  // Get visited URLs statistics
  getVisitedStats() {
    const urls = Array.from(this.visitedUrls);
    const domains = [...new Set(urls.map(url => {
      try {
        return new URL(url).hostname;
      } catch {
        return 'invalid';
      }
    }))];
    
    return {
      totalVisited: urls.length,
      uniqueDomains: domains.length,
      domains: domains,
      recentUrls: urls.slice(-10) // Last 10 URLs visited
    };
  }

  // Check for general content relevance
  hasRelevantContent(linkText) {
    // Generic patterns that indicate substantial content
    const contentIndicators = [
      /article|post|story|news|blog|page/i,
      /about|profile|biography|history/i,
      /analysis|research|report|study/i,
      /guide|tutorial|how.*to|overview/i,
      /policy|strategy|plan|initiative/i,
      /announcement|press.*release|statement/i,
      /\d{4}.*\d{2}.*\d{2}/, // Date patterns
      /\w{20,}/ // Longer text likely to be substantial content
    ];

    return contentIndicators.some(pattern => pattern.test(linkText));
  }

  // Smart contextual relevance checking for Wikipedia links
  isWikipediaRelevantLink(linkUrl, linkText) {
    // Only apply to Wikipedia
    if (!linkUrl.includes('wikipedia.org')) {
      return false;
    }

    if (!this.targetKeywords || this.targetKeywords.length === 0) {
      return false;
    }

    // For people searches, look for country/place connections
    const personKeywords = this.targetKeywords.filter(keyword => 
      keyword.split(' ').length > 1 && // Multi-word (likely person names)
      !/venture|capital|investment|fund|company/i.test(keyword) // Not business terms
    );

    if (personKeywords.length > 0) {
      // Check if this is a country/place link that might contain info about the person
      const countryPlaces = [
        'singapore', 'malaysia', 'thailand', 'indonesia', 'philippines', 
        'vietnam', 'myanmar', 'laos', 'cambodia', 'brunei',
        'asia', 'southeast', 'asean'
      ];
      
      const linkTextLower = linkText.toLowerCase();
      const linkUrlLower = linkUrl.toLowerCase();
      
      // If searching for a person and this is a country/place link, it's relevant
      if (countryPlaces.some(place => 
        linkTextLower.includes(place) || linkUrlLower.includes(place)
      )) {
        return true;
      }

      // Also check for government, politics, history links which often contain person info
      const politicalTopics = [
        'government', 'politics', 'prime minister', 'president', 'leader',
        'history', 'founder', 'independence', 'parliament', 'ministry'
      ];
      
      if (politicalTopics.some(topic => 
        linkTextLower.includes(topic) || linkUrlLower.includes(topic)
      )) {
        return true;
      }
    }

    // For business/investment terms, look for relevant economic/business links
    const businessKeywords = this.targetKeywords.filter(keyword => 
      /venture|capital|investment|fund|company|business|economic|finance/i.test(keyword)
    );

    if (businessKeywords.length > 0) {
      const businessTopics = [
        'economy', 'economic', 'business', 'industry', 'development',
        'investment', 'finance', 'capital', 'venture', 'startup',
        'technology', 'innovation', 'enterprise'
      ];
      
      const linkTextLower = linkText.toLowerCase();
      const linkUrlLower = linkUrl.toLowerCase();
      
      if (businessTopics.some(topic => 
        linkTextLower.includes(topic) || linkUrlLower.includes(topic)
      )) {
        return true;
      }
    }

    return false;
  }
}

module.exports = DeepLinkCrawler;