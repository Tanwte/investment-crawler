// routes/search.js
const express = require('express');
const router = express.Router();
const csurf = require('csurf');
const pool = require('../db');
const { searchValidation } = require('../middleware/validation');
const { searchLimiter } = require('../middleware/ratelimits');
const { requireAuth } = require('../middleware/auth');

// Add CSRF protection for all search routes
router.use(requireAuth);
router.use(csurf({ cookie: true }));
router.use((req, res, next) => { res.locals.csrfToken = req.csrfToken(); next(); });

// Helper function to group results hierarchically based on URL patterns
function groupResultsHierarchically(results) {
  // Create hierarchy based on domain similarity and keyword matching patterns
  const groups = [];
  const processed = new Set();
  
  // Load the actual starting URLs from urls.json
  const fs = require('fs');
  const path = require('path');
  let startingUrls = [];
  
  try {
    const urlsData = fs.readFileSync(path.join(__dirname, '../data/urls.json'), 'utf8');
    startingUrls = JSON.parse(urlsData);
  } catch (error) {
    console.error('Error reading urls.json:', error);
    startingUrls = [];
  }
  
  // Group 1: Root URLs (actual starting URLs from urls.json)
  const rootUrls = results.filter(r => {
    return startingUrls.includes(r.url);
  });
  
  // Process each root URL separately to support multiple root topics
  rootUrls.forEach(rootUrl => {
    if (processed.has(rootUrl.url)) return;
    
    const group = {
      level: 0,
      title: `🌐 Root Topic: ${getPageTitle(rootUrl.url)}`,
      icon: '🌐',
      results: [rootUrl]
    };
    
    processed.add(rootUrl.url);
    groups.push(group);
  });
  
  // Group 2: Discovered URLs (not in starting URLs)
  const discoveredUrls = results.filter(r => {
    return !processed.has(r.url) && !startingUrls.includes(r.url);
  });
  
  if (discoveredUrls.length > 0) {
    groups.push({
      level: 1,
      title: `� Discovered Links`,
      icon: '�',
      results: discoveredUrls
    });
  }
  
  return groups;
}

// Helper function to extract page title from URL
function getPageTitle(url) {
  try {
    const urlObj = new URL(url);
    if (urlObj.hostname.includes('wikipedia.org')) {
      const title = urlObj.pathname.split('/wiki/')[1];
      if (title) {
        return title.replace(/_/g, ' ').replace(/\([^)]*\)/g, '').trim();
      }
    }
    return urlObj.hostname;
  } catch (e) {
    return 'Unknown';
  }
}

// Helper function to highlight keywords in text
function highlightKeywords(text, keywords) {
  if (!text || !keywords || keywords.length === 0) return text;
  
  let highlightedText = text;
  
  // Sort keywords by length (longest first) to avoid partial replacements
  const sortedKeywords = [...keywords].sort((a, b) => b.length - a.length);
  
  for (const keyword of sortedKeywords) {
    // Escape special regex characters
    const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    // Use Unicode-aware regex for better multilingual matching
    const regex = new RegExp(`((?:^|\\s|[\\p{P}]))(${escaped})((?=\\s|[\\p{P}]|$))`, 'giu');
    
    highlightedText = highlightedText.replace(regex, (match, before, keywordMatch, after) => {
      return `${before}<mark class="keyword-highlight">${keywordMatch}</mark>${after}`;
    });
  }
  
  return highlightedText;
}

// Helper function to get results with accurate keyword match counts
async function getResultsWithKeywordCounts(sessionId = null) {
  let query, params;
  
  if (sessionId) {
    // Get results from specific crawl session, consolidated by URL
    query = `
      SELECT url, 
             STRING_AGG(DISTINCT content, E'\n\n---\n\n') as content, 
             MAX(fetched_at) as fetched_at 
      FROM crawl_results 
      WHERE (session_id = $1 OR crawl_session_id = $1)
        AND content IS NOT NULL 
        AND content != ''
      GROUP BY url
      ORDER BY fetched_at DESC
    `;
    params = [sessionId];
  } else {
    // Get the most recent crawl session results, consolidated by URL
    query = `
      WITH latest_session AS (
        SELECT COALESCE(session_id, crawl_session_id) as session_id
        FROM crawl_results 
        WHERE (session_id IS NOT NULL OR crawl_session_id IS NOT NULL)
        ORDER BY fetched_at DESC 
        LIMIT 1
      )
      SELECT url, 
             STRING_AGG(DISTINCT content, E'\n\n---\n\n') as content, 
             MAX(fetched_at) as fetched_at 
      FROM crawl_results cr
      WHERE (cr.session_id = (SELECT session_id FROM latest_session) 
             OR cr.crawl_session_id = (SELECT session_id FROM latest_session))
        AND content IS NOT NULL 
        AND content != ''
      GROUP BY url
      ORDER BY LENGTH(STRING_AGG(DISTINCT content, E'\n\n---\n\n')) DESC, fetched_at DESC
    `;
    params = [];
  }
  
  const { rows } = await pool.query(query, params);
  
  const { getKeywords } = require('../utils/seeds');
  const keywords = getKeywords();
  
  return rows.map(row => {
    const snippets = row.content ? row.content.split('\n\n---\n\n') : [];
    
    // Filter snippets that contain keywords
    const relevantSnippets = snippets.filter(snippet => {
      // Only include snippets that match at least one keyword with Unicode support
      return keywords.some(keyword => {
        const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const regex = new RegExp(`(?:^|\\s|[\\p{P}])${escaped}(?=\\s|[\\p{P}]|$)`, 'giu');
        return regex.test(snippet);
      });
    });
    
    // Create highlighted versions of the snippets
    const highlightedSnippets = relevantSnippets.map(snippet => ({
      original: snippet,
      highlighted: highlightKeywords(snippet, keywords)
    }));
    
    return {
      url: row.url,
      data: relevantSnippets, // Keep original for compatibility
      highlightedData: highlightedSnippets // Add highlighted versions
    };
  });
}

// Default route to show all results
router.get('/', requireAuth, async (req, res) => {
  try {
    // Prevent caching to ensure fresh results
    res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');
    
    const sessionId = req.query.session || null;
    let crawlStats = null;
    
    // Parse crawl stats from URL if provided
    if (req.query.stats) {
      try {
        crawlStats = JSON.parse(req.query.stats);
      } catch (e) {
        console.warn('Failed to parse crawl stats:', e.message);
      }
    }
    
    // If we have a session ID but no stats, try to get stats from database
    if (sessionId && !crawlStats) {
      try {
        const statsQuery = `
          SELECT 
            COUNT(DISTINCT url) as uniqueUrls,
            COUNT(*) as totalResults,
            COUNT(*) FILTER (WHERE is_deep_link = true) as deepLinkResults,
            MIN(created_at) as startTime,
            MAX(created_at) as endTime
          FROM crawl_results 
          WHERE (session_id = $1 OR crawl_session_id = $1)
            AND content IS NOT NULL 
            AND content != ''
        `;
        const { rows } = await pool.query(statsQuery, [sessionId]);
        if (rows.length > 0 && rows[0].totalresults > 0) {
          crawlStats = {
            totalUrls: parseInt(rows[0].uniqueurls),
            totalArticles: parseInt(rows[0].uniqueurls), // Use unique URLs as article count
            totalDeepLinks: parseInt(rows[0].deeplinkresults),
            enabledDeepLinks: parseInt(rows[0].deeplinkresults) > 0,
            duration: rows[0].endtime && rows[0].starttime ? 
              Math.round((new Date(rows[0].endtime) - new Date(rows[0].starttime)) / 1000) : null
          };
        }
      } catch (error) {
        console.warn('Failed to retrieve crawl stats:', error.message);
      }
    }
    
    const results = await getResultsWithKeywordCounts(sessionId);
    const groupedResults = groupResultsHierarchically(results);
    res.render('index', { results, groupedResults, query: null, crawlStats, sessionId });
  } catch (error) {
    console.error('Error fetching results:', error);
    res.render('index', { results: [], query: null, crawlStats: null, sessionId: null });
  }
});

router.get('/search', requireAuth, searchLimiter, searchValidation, async (req, res) => {
  const q = req.query.q;
  const page = parseInt(req.query.page || '1', 10);
  const size = Math.min(parseInt(req.query.size || '20', 10), 50);
  const offset = (page - 1) * size;

  // Use multilingual search with fallback
  const { rows } = await pool.query(
    `SELECT url, content, fetched_at
     FROM crawl_results
     WHERE 
       tsv @@ plainto_tsquery('english', $1) OR
       tsv_cjk @@ plainto_tsquery('simple', $1) OR
       content ILIKE '%' || $1 || '%'
     ORDER BY fetched_at DESC
     LIMIT $2 OFFSET $3`,
    [q, size, offset]
  );

  const results = rows.map(r => {
    const snippets = r.content ? r.content.split('\n\n---\n\n') : [];
    const searchKeywords = [q]; // Use search query as keyword
    
    // Create highlighted versions
    const highlightedSnippets = snippets.map(snippet => ({
      original: snippet,
      highlighted: highlightKeywords(snippet, searchKeywords)
    }));
    
    return {
      url: r.url,
      data: snippets,
      highlightedData: highlightedSnippets
    };
  });

  res.render('index', { results, query: q, crawlStats: null, sessionId: null });
});

// New route for detailed results view
router.get('/results/detail', requireAuth, async (req, res) => {
  const url = req.query.url;
  
  if (!url) {
    return res.status(400).send('URL parameter is required');
  }

  try {
    // Get the result for this specific URL
    const { rows } = await pool.query(
      'SELECT url, content, fetched_at FROM crawl_results WHERE url = $1 ORDER BY fetched_at DESC LIMIT 1',
      [url]
    );

    if (rows.length === 0) {
      return res.render('result-detail', {
        url,
        resultsByKeyword: {},
        totalSnippets: 0,
        lastCrawled: null
      });
    }

    const result = rows[0];
    const snippets = result.content ? result.content.split('\n\n---\n\n') : [];
    
    // Load keywords to organize results
    const { getKeywords } = require('../utils/seeds');
    const keywords = getKeywords();
    
    // Group snippets by keyword
    const resultsByKeyword = {};
    let totalSnippets = 0;
    
    for (const keyword of keywords) {
      const keywordSnippets = snippets.filter(snippet => {
        const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const regex = new RegExp(`(?:^|\\s|[\\p{P}])${escaped}(?=\\s|[\\p{P}]|$)`, 'giu');
        return regex.test(snippet);
      });
      
      if (keywordSnippets.length > 0) {
        // Create highlighted versions for this keyword
        const highlightedSnippets = keywordSnippets.map(snippet => ({
          original: snippet,
          highlighted: highlightKeywords(snippet, [keyword])
        }));
        
        resultsByKeyword[keyword] = {
          snippets: keywordSnippets,
          highlighted: highlightedSnippets
        };
        totalSnippets += keywordSnippets.length;
      }
    }

    res.render('result-detail', {
      url: result.url,
      resultsByKeyword,
      totalSnippets,
      lastCrawled: result.fetched_at
    });

  } catch (error) {
    console.error('Error fetching detailed results:', error);
    res.status(500).send('Error loading detailed results');
  }
});

module.exports = router;
