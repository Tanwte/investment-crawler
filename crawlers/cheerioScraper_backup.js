const axios = require('axios');
const axiosRetry = require('axios-retry');
const cheerio = require('cheerio');
const crypto = require('crypto');
const { contextChars, requestTimeoutMs } = require('../config');
const { 
  getRandomHeaders, 
  randomDelay, 
  exponentialBackoff 
} = require('../utils/stealthConfig');
const { extractWikipediaLinks } = require('../utils/linkExtractor');
const { createEnhancedMatcher } = require('../utils/phraseKeywordMatcher');

axiosRetry(axios, { retries: 2, retryDelay: axiosRetry.exponentialDelay });

function hash(t) {
  return crypto.createHash('sha256').update(t).digest('hex');
}

// Legacy function for backward compatibility
function buildRegexes(keywords) {
  return keywords.map(k => {
    // Escape special regex characters
    const escaped = k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    // Use word boundaries that work better with Korean
    return new RegExp(`(?:^|\\s|[^가-힣a-zA-Z0-9])${escaped}(?=\\s|[^가-힣a-zA-Z0-9]|$)`, 'gi');
  });
}

// Enhanced extractMentions using phrase-aware matching
function extractMentions($, keywords) {
  // Extract text from multiple sources for better multilingual coverage
  const bodyText = $('body').text();
  const titleText = $('title').text();
  const metaDescription = $('meta[name="description"]').attr('content') || '';
  const headings = $('h1, h2, h3, h4, h5, h6').map((i, el) => $(el).text()).get().join(' ');
  
  // Extract from carousel and dynamic content containers
  const carouselSelectors = [
    '.carousel-item', '.slider-item', '.swiper-slide',
    '[class*="news"]', '[class*="article"]', '[class*="content"]',
    '.newsstand', '.news-list', '.article-list',
    '[class*="carousel"]', '[class*="slider"]',
    // Korean news site specific selectors
    '.news_tit', '.news_title', '.article_tit', '.article_title',
    '.headline', '.press_logo', '.press_name',
    '[class*="롤링"]', '[class*="뉴스"]', '[class*="기사"]'
  ];
  
  let carouselText = '';
  for (const selector of carouselSelectors) {
    $(selector).each((i, el) => {
      const text = $(el).text();
      if (text && text.trim().length > 0) {
        carouselText += ' ' + text;
      }
    });
  }
  
  // Combine all text sources including carousel content
  const fullText = [titleText, metaDescription, headings, carouselText, bodyText].join(' ');
  
  // Normalize whitespace but preserve Unicode characters
  const text = fullText.replace(/\s+/g, ' ').trim();
  
  // Use enhanced phrase-aware matching
  const matcher = createEnhancedMatcher(keywords);
  const mentions = matcher.extractMentions(text);
  
  console.log(`🎯 Enhanced matching: ${mentions.length} mentions found (reduced redundancy)`);
  
  // Deduplicate via hash for additional safety
  const seen = new Set();
  return mentions.filter(snippet => {
    if (!snippet || typeof snippet !== 'string' || snippet.length < 10) return false; // Only include meaningful snippets
    
    const h = hash(snippet);
    if (seen.has(h)) return false;
    seen.add(h);
    return true;
  });
}

module.exports = async function cheerioScraper(url, keywords, options = {}, retryCount = 0) {
  const { extractLinks = false } = options;
  
  if (retryCount > 0) {
    const delay = exponentialBackoff(retryCount);
    console.log(`Retry attempt ${retryCount}, waiting ${Math.round(delay)}ms`);
    await new Promise(resolve => setTimeout(resolve, delay));
  }
  
  try {
    // Add random delay before request
    await randomDelay(300, 1000);
    
    // Get dynamic headers for this request
    const headers = getRandomHeaders(url);
    
    console.log(`Making Cheerio request to: ${url}`);
    const { data } = await axios.get(url, {
      timeout: requestTimeoutMs * (retryCount + 1), // Increase timeout on retries
      headers,
      maxRedirects: 5,
      validateStatus: function (status) {
        return status >= 200 && status < 400; // Accept redirects
      },
      responseType: 'text',
      responseEncoding: 'utf8'
    });
    
    // Basic validation of HTML data
    if (!data || typeof data !== 'string') {
      throw new Error('Invalid response data');
    }
    
    const $ = cheerio.load(data, {
      decodeEntities: false,
      normalizeWhitespace: false,
      xmlMode: false,
      lowerCaseAttributeNames: false
    });

    // Use enhanced phrase-aware extraction
    const snippets = extractMentions($, keywords);
    
    // Optionally extract relevant links
    let discoveredLinks = [];
    if (extractLinks) {
      discoveredLinks = extractWikipediaLinks(data, url, keywords);
    }
    
    return {
      snippets,
      discoveredLinks
    };
  } catch (error) {
    console.warn(`Cheerio scraper failed for ${url}:`, error.message);
    
    // Enhanced error categorization
    if (error.response?.status === 403) {
      console.error(`❌ BLOCKED: ${url} returned 403 Forbidden`);
    } else if (error.response?.status === 404) {
      console.error(`❌ NOT FOUND: ${url} returned 404`);
    } else if (error.code === 'ENOTFOUND') {
      console.error(`❌ DNS: ${url} domain not found`);
    } else if (error.code === 'ECONNRESET' || error.code === 'ETIMEDOUT') {
      console.error(`❌ NETWORK: ${url} connection issues`);
    }
    
    // Implement retry logic for recoverable errors
    if (retryCount < 2 && (
      error.code === 'ETIMEDOUT' || 
      error.code === 'ECONNRESET' ||
      error.code === 'ENOTFOUND' ||
      (error.response?.status >= 500 && error.response?.status < 600)
    )) {
      console.log(`Retrying ${url} (attempt ${retryCount + 1}/3)`);
      return await module.exports(url, keywords, options, retryCount + 1);
    }
    
    return {
      snippets: [],
      discoveredLinks: []
    };
  }
};