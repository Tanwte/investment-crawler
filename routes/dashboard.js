// routes/dashboard.js
const express = require('express');
const router = express.Router();
const csurf = require('csurf');
const pool = require('../db');
const contentClassifier = require('../utils/contentClassifier');
const { requireAuth, requireAdmin } = require('../middleware/auth');

// Add CSRF protection
router.use(requireAuth);
router.use(csurf({ cookie: true }));
router.use((req, res, next) => { res.locals.csrfToken = req.csrfToken(); next(); });

// Business Intelligence Dashboard
router.get('/dashboard', requireAuth, async (req, res) => {
  try {
    const timeRange = req.query.range || '7d'; // 7d, 30d, 90d
    const category = req.query.category || 'all';
    
    // Calculate date range
    const ranges = {
      '7d': 7,
      '30d': 30,
      '90d': 90,
      '1y': 365
    };
    const daysBack = ranges[timeRange] || 7;
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - daysBack);

    // Fetch recent crawl results for analysis
    const contentQuery = `
      SELECT 
        url, 
        content, 
        metadata,
        is_deep_link,
        created_at,
        session_id
      FROM crawl_results 
      WHERE created_at >= $1 
        AND content IS NOT NULL 
        AND LENGTH(content) > 100
      ORDER BY created_at DESC
      LIMIT 500
    `;
    
    const { rows: contentRows } = await pool.query(contentQuery, [startDate]);
    
    // Classify content
    const classifiedContent = contentClassifier.classifyBatch(
      contentRows.map(row => ({
        url: row.url,
        content: row.content,
        metadata: row.metadata ? JSON.parse(row.metadata) : {},
        isDeepLink: row.is_deep_link,
        createdAt: row.created_at,
        sessionId: row.session_id
      }))
    );

    // Filter by category if specified
    const filteredContent = category === 'all' 
      ? classifiedContent 
      : classifiedContent.filter(item => 
          item.classification.primaryCategory && 
          item.classification.primaryCategory.key === category
        );

    // Generate analytics
    const analytics = generateAnalytics(filteredContent, daysBack);
    const contentSummary = contentClassifier.generateContentSummary(filteredContent);
    const trendingCategories = contentClassifier.getTrendingCategories(8);
    
    // Get crawl session statistics
    const sessionStatsQuery = `
      SELECT 
        session_id,
        COUNT(*) as total_results,
        COUNT(*) FILTER (WHERE is_deep_link = true) as deep_link_results,
        MIN(created_at) as start_time,
        MAX(created_at) as end_time,
        COUNT(DISTINCT url) as unique_urls
      FROM crawl_results 
      WHERE created_at >= $1 AND session_id IS NOT NULL
      GROUP BY session_id
      ORDER BY start_time DESC
      LIMIT 10
    `;
    
    const { rows: sessionStats } = await pool.query(sessionStatsQuery, [startDate]);

    res.render('dashboard', {
      timeRange,
      category,
      analytics,
      contentSummary,
      trendingCategories,
      classifiedContent: filteredContent.slice(0, 50), // Limit for display
      sessionStats,
      categories: contentClassifier.categories,
      totalContent: classifiedContent.length
    });

  } catch (error) {
    console.error('Dashboard error:', error);
    res.status(500).render('error', { 
      message: 'Dashboard temporarily unavailable',
      error: { status: 500 }
    });
  }
});

// Analytics API endpoint for charts
router.get('/api/analytics', requireAuth, async (req, res) => {
  try {
    const timeRange = req.query.range || '7d';
    const daysBack = { '7d': 7, '30d': 30, '90d': 90, '1y': 365 }[timeRange] || 7;
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - daysBack);

    // Daily content volume
    const dailyVolumeQuery = `
      SELECT 
        DATE(created_at) as date,
        COUNT(*) as count,
        COUNT(*) FILTER (WHERE is_deep_link = true) as deep_links
      FROM crawl_results 
      WHERE created_at >= $1
      GROUP BY DATE(created_at)
      ORDER BY date ASC
    `;
    
    const { rows: dailyVolume } = await pool.query(dailyVolumeQuery, [startDate]);

    // Top domains
    const domainQuery = `
      SELECT 
        regexp_replace(url, '^https?://([^/]+).*', '\\1') as domain,
        COUNT(*) as count
      FROM crawl_results 
      WHERE created_at >= $1
      GROUP BY domain
      ORDER BY count DESC
      LIMIT 10
    `;
    
    const { rows: topDomains } = await pool.query(domainQuery, [startDate]);

    res.json({
      dailyVolume,
      topDomains,
      categories: contentClassifier.getTrendingCategories(10)
    });

  } catch (error) {
    console.error('Analytics API error:', error);
    res.status(500).json({ error: 'Analytics unavailable' });
  }
});

// Content export functionality
router.get('/export', requireAuth, async (req, res) => {
  try {
    const format = req.query.format || 'json'; // json, csv
    const category = req.query.category || 'all';
    const timeRange = req.query.range || '30d';
    
    const daysBack = { '7d': 7, '30d': 30, '90d': 90, '1y': 365 }[timeRange] || 30;
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - daysBack);

    const exportQuery = `
      SELECT 
        url,
        content,
        metadata,
        is_deep_link,
        created_at,
        session_id
      FROM crawl_results 
      WHERE created_at >= $1
        AND content IS NOT NULL
        AND LENGTH(content) > 50
      ORDER BY created_at DESC
    `;
    
    const { rows } = await pool.query(exportQuery, [startDate]);
    
    // Classify content for export
    const classifiedData = contentClassifier.classifyBatch(
      rows.map(row => ({
        url: row.url,
        content: row.content,
        metadata: row.metadata ? JSON.parse(row.metadata) : {},
        isDeepLink: row.is_deep_link,
        createdAt: row.created_at,
        sessionId: row.session_id
      }))
    );

    // Filter by category
    const filteredData = category === 'all' 
      ? classifiedData 
      : classifiedData.filter(item => 
          item.classification.primaryCategory && 
          item.classification.primaryCategory.key === category
        );

    if (format === 'csv') {
      const csv = generateCSV(filteredData);
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="singapore-korea-intelligence-${timeRange}-${category}.csv"`);
      res.send(csv);
    } else {
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename="singapore-korea-intelligence-${timeRange}-${category}.json"`);
      res.json({
        metadata: {
          exportDate: new Date().toISOString(),
          timeRange,
          category,
          totalItems: filteredData.length
        },
        data: filteredData
      });
    }

  } catch (error) {
    console.error('Export error:', error);
    res.status(500).json({ error: 'Export failed' });
  }
});

// Helper function to generate analytics
function generateAnalytics(classifiedContent, daysBack) {
  const now = new Date();
  const dailyStats = {};
  
  // Initialize daily stats
  for (let i = 0; i < daysBack; i++) {
    const date = new Date(now);
    date.setDate(date.getDate() - i);
    const dateKey = date.toISOString().split('T')[0];
    dailyStats[dateKey] = {
      total: 0,
      deepLinks: 0,
      categories: {}
    };
  }

  // Process content
  classifiedContent.forEach(item => {
    const dateKey = new Date(item.createdAt).toISOString().split('T')[0];
    if (dailyStats[dateKey]) {
      dailyStats[dateKey].total++;
      
      if (item.isDeepLink) {
        dailyStats[dateKey].deepLinks++;
      }
      
      if (item.classification.primaryCategory) {
        const catKey = item.classification.primaryCategory.key;
        dailyStats[dateKey].categories[catKey] = (dailyStats[dateKey].categories[catKey] || 0) + 1;
      }
    }
  });

  // Calculate trends
  const dates = Object.keys(dailyStats).sort();
  const totalTrend = calculateTrend(dates.map(d => dailyStats[d].total));
  const qualityScore = calculateQualityScore(classifiedContent);

  return {
    dailyStats,
    totalItems: classifiedContent.length,
    avgConfidence: classifiedContent.reduce((sum, item) => sum + item.classification.confidence, 0) / classifiedContent.length || 0,
    totalTrend,
    qualityScore
  };
}

// Helper function to calculate trend
function calculateTrend(values) {
  if (values.length < 2) return 0;
  
  const recent = values.slice(-3).reduce((a, b) => a + b, 0) / 3;
  const previous = values.slice(-6, -3).reduce((a, b) => a + b, 0) / 3;
  
  if (previous === 0) return recent > 0 ? 1 : 0;
  return (recent - previous) / previous;
}

// Helper function to calculate quality score
function calculateQualityScore(classifiedContent) {
  if (classifiedContent.length === 0) return 0;
  
  const highConfidence = classifiedContent.filter(item => item.classification.confidence > 0.7).length;
  const withCategories = classifiedContent.filter(item => item.classification.primaryCategory).length;
  const deepLinks = classifiedContent.filter(item => item.isDeepLink).length;
  
  const confidenceScore = highConfidence / classifiedContent.length;
  const categoryScore = withCategories / classifiedContent.length;
  const deepLinkScore = deepLinks / classifiedContent.length;
  
  return (confidenceScore * 0.4 + categoryScore * 0.4 + deepLinkScore * 0.2);
}

// Helper function to generate CSV
function generateCSV(data) {
  const headers = [
    'URL', 'Primary Category', 'Confidence', 'Keywords', 
    'Is Deep Link', 'Created At', 'Session ID', 'Content Preview'
  ];
  
  const rows = data.map(item => [
    item.url,
    item.classification.primaryCategory ? item.classification.primaryCategory.name : 'Uncategorized',
    Math.round(item.classification.confidence * 100) + '%',
    item.classification.keywords.slice(0, 5).join('; '),
    item.isDeepLink ? 'Yes' : 'No',
    new Date(item.createdAt).toISOString(),
    item.sessionId || '',
    item.content.substring(0, 200) + '...'
  ]);
  
  return [headers, ...rows]
    .map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
    .join('\n');
}

module.exports = router;