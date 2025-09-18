const cheerio = require('cheerio');
const { URL } = require('url');
const { isSafeHttpUrl } = require('./url');

/**
 * Extract relevant links from page content
 * @param {string} html - The HTML content of the page
 * @param {string} baseUrl - The base URL of the page being crawled
 * @param {Array} keywords - Keywords to look for in link text/titles
 * @param {Object} options - Extraction options
 * @returns {Array} Array of relevant URLs found
 */
function extractRelevantLinks(html, baseUrl, keywords, options = {}) {
  const {
    maxLinks = 10,
    allowedDomains = ['en.wikipedia.org'], // Default to Wikipedia for now
    minLinkTextLength = 3
  } = options;

  const $ = cheerio.load(html);
  const relevantLinks = new Set();
  
  // Build keyword regex patterns
  const keywordRegexes = keywords.map(k => 
    new RegExp(k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi')
  );

  // Find links that contain keywords in their text or href
  $('a[href]').each((i, element) => {
    const $link = $(element);
    const href = $link.attr('href');
    const linkText = $link.text().trim();
    const title = $link.attr('title') || '';
    
    if (!href || linkText.length < minLinkTextLength) return;
    
    try {
      // Resolve relative URLs
      const absoluteUrl = new URL(href, baseUrl).toString();
      
      // Check if URL is safe and on allowed domains
      if (!isSafeHttpUrl(absoluteUrl)) return;
      
      const urlObj = new URL(absoluteUrl);
      if (allowedDomains.length > 0 && !allowedDomains.includes(urlObj.hostname)) return;
      
      // Check if link text or title contains any keywords
      const combinedText = `${linkText} ${title}`.toLowerCase();
      const hasKeyword = keywordRegexes.some(regex => {
        regex.lastIndex = 0;
        return regex.test(combinedText);
      });
      
      if (hasKeyword && relevantLinks.size < maxLinks) {
        relevantLinks.add(absoluteUrl);
      }
    } catch (error) {
      // Skip invalid URLs
    }
  });

  return Array.from(relevantLinks);
}

/**
 * Extract Wikipedia-style links that might be relevant to keywords
 * @param {string} html - The HTML content
 * @param {string} baseUrl - The base URL
 * @param {Array} keywords - Keywords to match
 * @returns {Array} Array of Wikipedia URLs
 */
function extractWikipediaLinks(html, baseUrl, keywords) {
  const $ = cheerio.load(html);
  const links = new Set();
  
  // Look for Wikipedia article links
  $('a[href*="/wiki/"]').each((i, element) => {
    const $link = $(element);
    const href = $link.attr('href');
    const linkText = $link.text().trim();
    
    // Skip disambiguation, category, and file pages
    if (href.includes(':') || href.includes('#') || linkText.length < 3) return;
    
    try {
      const absoluteUrl = new URL(href, baseUrl).toString();
      
      // Check if link text matches any keywords (case insensitive)
      const hasKeyword = keywords.some(keyword => 
        linkText.toLowerCase().includes(keyword.toLowerCase()) ||
        keyword.toLowerCase().includes(linkText.toLowerCase())
      );
      
      if (hasKeyword && links.size < 5) { // Limit Wikipedia links
        links.add(absoluteUrl);
      }
    } catch (error) {
      // Skip invalid URLs
    }
  });
  
  return Array.from(links);
}

module.exports = {
  extractRelevantLinks,
  extractWikipediaLinks
};