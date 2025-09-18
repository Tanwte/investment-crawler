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

// Helper function to get results with accurate keyword match counts
async function getResultsWithKeywordCounts(sessionId = null) {
  let query, params;
  
  if (sessionId) {
    // Get results from specific crawl session
    query = `
      SELECT url, content, fetched_at 
      FROM crawl_results 
      WHERE crawl_session_id = $1
      ORDER BY fetched_at DESC
    `;
    params = [sessionId];
  } else {
    // Get the most recent crawl session results
    query = `
      WITH latest_session AS (
        SELECT crawl_session_id
        FROM crawl_results 
        WHERE crawl_session_id IS NOT NULL
        ORDER BY fetched_at DESC 
        LIMIT 1
      )
      SELECT url, content, fetched_at 
      FROM crawl_results cr
      WHERE cr.crawl_session_id = (SELECT crawl_session_id FROM latest_session)
      ORDER BY fetched_at DESC
    `;
    params = [];
  }
  
  const { rows } = await pool.query(query, params);
  
  const { getKeywords } = require('../utils/seeds');
  const keywords = getKeywords();
  
  return rows.map(row => {
    const snippets = row.content ? row.content.split('\n\n---\n\n') : [];
    
    // Count actual keyword matches with Unicode support
    let keywordMatches = 0;
    for (const keyword of keywords) {
      const keywordSnippets = snippets.filter(snippet => {
        // Use Unicode-aware regex for better multilingual matching
        const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const regex = new RegExp(`(?:^|\\s|[\\p{P}])${escaped}(?=\\s|[\\p{P}]|$)`, 'giu');
        return regex.test(snippet);
      });
      keywordMatches += keywordSnippets.length;
    }
    
    return {
      url: row.url,
      data: snippets.filter(snippet => {
        // Only include snippets that match at least one keyword with Unicode support
        return keywords.some(keyword => {
          const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          const regex = new RegExp(`(?:^|\\s|[\\p{P}])${escaped}(?=\\s|[\\p{P}]|$)`, 'giu');
          return regex.test(snippet);
        });
      })
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
            COUNT(*) as totalResults,
            COUNT(*) FILTER (WHERE is_deep_link = true) as deepLinkResults,
            COUNT(DISTINCT url) as uniqueUrls,
            MIN(created_at) as startTime,
            MAX(created_at) as endTime
          FROM crawl_results 
          WHERE session_id = $1 OR crawl_session_id = $1
        `;
        const { rows } = await pool.query(statsQuery, [sessionId]);
        if (rows.length > 0 && rows[0].totalresults > 0) {
          crawlStats = {
            totalUrls: parseInt(rows[0].uniqueurls),
            totalArticles: parseInt(rows[0].totalresults),
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
    res.render('index', { results, query: null, crawlStats, sessionId });
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

  const results = rows.map(r => ({
    url: r.url,
    data: r.content ? r.content.split('\n\n---\n\n') : []
  }));

  res.render('index', { results, query: q });
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
        resultsByKeyword[keyword] = keywordSnippets;
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
