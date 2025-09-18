// utils/contentClassifier.js
const { getKeywords } = require('./seeds');

// Content classification categories for Singapore-Korea trade intelligence
const CATEGORIES = {
  GOVERNMENT_POLICY: {
    name: 'Government Policy',
    icon: '🏛️',
    color: '#4CAF50',
    keywords: [
      'government', 'policy', 'regulation', 'ministry', 'MOFA', 'MTI', 'MAS',
      '정부', '정책', '규제', '외교부', '산업통상자원부', '기획재정부',
      'FTA', 'trade agreement', 'bilateral', 'MOU', 'memorandum',
      'diplomatic', 'embassy', 'consulate', 'ambassador'
    ],
    priority: 9
  },
  
  INVESTMENT_FLOWS: {
    name: 'Investment Flows',
    icon: '💰',
    color: '#FF9800',
    keywords: [
      'investment', 'capital', 'fund', 'FDI', 'venture capital', 'private equity',
      '투자', '자본', '펀드', '외국인직접투자', '벤처캐피털',
      'sovereign wealth fund', 'GIC', 'Temasek', 'KIC', 'NPS',
      'portfolio investment', 'asset management', 'hedge fund'
    ],
    priority: 10
  },
  
  TRADE_RELATIONS: {
    name: 'Trade Relations',
    icon: '🤝',
    color: '#2196F3',
    keywords: [
      'trade', 'export', 'import', 'bilateral trade', 'commerce',
      '무역', '수출', '수입', '양자무역', '상거래',
      'supply chain', 'logistics', 'shipping', 'port', 'customs',
      'tariff', 'quota', 'trade balance', 'volume'
    ],
    priority: 8
  },
  
  MARKET_ANALYSIS: {
    name: 'Market Analysis',
    icon: '📊',
    color: '#9C27B0',
    keywords: [
      'market', 'analysis', 'forecast', 'trend', 'outlook', 'research',
      '시장', '분석', '전망', '동향', '연구',
      'GDP', 'growth', 'inflation', 'currency', 'exchange rate',
      'economic indicator', 'performance', 'sector analysis'
    ],
    priority: 7
  },
  
  CORPORATE_NEWS: {
    name: 'Corporate News',
    icon: '🏢',
    color: '#607D8B',
    keywords: [
      'company', 'corporation', 'merger', 'acquisition', 'partnership',
      '회사', '기업', '합병', '인수', '파트너십',
      'joint venture', 'subsidiary', 'IPO', 'listing', 'delisting',
      'earnings', 'revenue', 'profit', 'loss', 'restructuring'
    ],
    priority: 6
  },
  
  TECHNOLOGY_INNOVATION: {
    name: 'Technology & Innovation',
    icon: '🚀',
    color: '#00BCD4',
    keywords: [
      'technology', 'innovation', 'startup', 'fintech', 'digital',
      '기술', '혁신', '스타트업', '핀테크', '디지털',
      'blockchain', 'AI', 'artificial intelligence', 'machine learning',
      'cryptocurrency', 'biotech', 'green technology', 'renewable energy'
    ],
    priority: 5
  },
  
  FINANCIAL_SERVICES: {
    name: 'Financial Services',
    icon: '🏦',
    color: '#795548',
    keywords: [
      'bank', 'banking', 'finance', 'financial services', 'insurance',
      '은행', '금융', '금융서비스', '보험',
      'credit', 'loan', 'mortgage', 'bond', 'stock', 'equity',
      'mutual fund', 'ETF', 'REIT', 'derivatives'
    ],
    priority: 8
  },
  
  INFRASTRUCTURE: {
    name: 'Infrastructure',
    icon: '🏗️',
    color: '#FF5722',
    keywords: [
      'infrastructure', 'construction', 'real estate', 'property',
      '인프라', '건설', '부동산', '재산',
      'airport', 'port', 'railway', 'highway', 'bridge', 'tunnel',
      'smart city', 'urban development', 'housing'
    ],
    priority: 6
  }
};

class ContentClassifier {
  constructor() {
    this.categories = CATEGORIES;
    this.stats = {
      totalClassified: 0,
      categoryStats: {}
    };
    
    // Initialize category stats
    Object.keys(this.categories).forEach(key => {
      this.stats.categoryStats[key] = 0;
    });
  }

  // Classify a single piece of content
  classifyContent(content, metadata = {}) {
    if (!content || typeof content !== 'string') {
      return {
        categories: [],
        primaryCategory: null,
        confidence: 0,
        keywords: []
      };
    }

    const contentLower = content.toLowerCase();
    const titleLower = (metadata.title || '').toLowerCase();
    const combinedText = `${titleLower} ${contentLower}`;
    
    const categoryScores = {};
    const foundKeywords = {};

    // Score each category based on keyword matches
    Object.entries(this.categories).forEach(([categoryKey, category]) => {
      let score = 0;
      const categoryKeywords = [];

      category.keywords.forEach(keyword => {
        const keywordLower = keyword.toLowerCase();
        
        // Count occurrences with position weighting
        const titleMatches = (titleLower.match(new RegExp(keywordLower, 'g')) || []).length;
        const contentMatches = (contentLower.match(new RegExp(keywordLower, 'g')) || []).length;
        
        if (titleMatches > 0) {
          score += titleMatches * 3; // Title matches are more important
          categoryKeywords.push(keyword);
        }
        
        if (contentMatches > 0) {
          score += contentMatches;
          if (titleMatches === 0) categoryKeywords.push(keyword);
        }
      });

      // Apply category priority multiplier
      score *= (category.priority / 10);
      
      if (score > 0) {
        categoryScores[categoryKey] = score;
        foundKeywords[categoryKey] = categoryKeywords;
      }
    });

    // Sort categories by score
    const sortedCategories = Object.entries(categoryScores)
      .sort(([,a], [,b]) => b - a)
      .map(([key, score]) => ({
        key,
        name: this.categories[key].name,
        icon: this.categories[key].icon,
        color: this.categories[key].color,
        score,
        keywords: foundKeywords[key] || []
      }));

    // Determine primary category and confidence
    const primaryCategory = sortedCategories.length > 0 ? sortedCategories[0] : null;
    const totalScore = Object.values(categoryScores).reduce((sum, score) => sum + score, 0);
    const confidence = primaryCategory ? (primaryCategory.score / totalScore) : 0;

    // Update statistics
    this.stats.totalClassified++;
    if (primaryCategory) {
      this.stats.categoryStats[primaryCategory.key]++;
    }

    return {
      categories: sortedCategories,
      primaryCategory,
      confidence: Math.min(confidence, 1), // Cap at 100%
      keywords: Object.values(foundKeywords).flat(),
      totalScore
    };
  }

  // Classify multiple content items
  classifyBatch(items) {
    return items.map(item => {
      const classification = this.classifyContent(item.content, item.metadata);
      return {
        ...item,
        classification
      };
    });
  }

  // Get trending categories from recent classifications
  getTrendingCategories(limit = 5) {
    const sortedStats = Object.entries(this.stats.categoryStats)
      .filter(([, count]) => count > 0)
      .sort(([,a], [,b]) => b - a)
      .slice(0, limit)
      .map(([key, count]) => ({
        key,
        name: this.categories[key].name,
        icon: this.categories[key].icon,
        color: this.categories[key].color,
        count,
        percentage: this.stats.totalClassified > 0 ? (count / this.stats.totalClassified * 100) : 0
      }));

    return sortedStats;
  }

  // Generate content summary with categories
  generateContentSummary(classifiedItems) {
    const categoryDistribution = {};
    const keywordFrequency = {};
    let totalConfidence = 0;
    let highConfidenceItems = 0;

    classifiedItems.forEach(item => {
      const { classification } = item;
      
      if (classification.primaryCategory) {
        const catKey = classification.primaryCategory.key;
        categoryDistribution[catKey] = (categoryDistribution[catKey] || 0) + 1;
        
        totalConfidence += classification.confidence;
        if (classification.confidence > 0.7) {
          highConfidenceItems++;
        }
      }

      // Count keyword frequency
      classification.keywords.forEach(keyword => {
        keywordFrequency[keyword] = (keywordFrequency[keyword] || 0) + 1;
      });
    });

    // Get top keywords
    const topKeywords = Object.entries(keywordFrequency)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 20)
      .map(([keyword, count]) => ({ keyword, count }));

    return {
      totalItems: classifiedItems.length,
      avgConfidence: classifiedItems.length > 0 ? totalConfidence / classifiedItems.length : 0,
      highConfidenceItems,
      categoryDistribution,
      topKeywords,
      summary: this.generateTextSummary(categoryDistribution, classifiedItems.length)
    };
  }

  // Generate text summary
  generateTextSummary(categoryDistribution, totalItems) {
    if (totalItems === 0) return "No content classified.";

    const sortedCategories = Object.entries(categoryDistribution)
      .sort(([,a], [,b]) => b - a)
      .map(([key, count]) => ({
        name: this.categories[key].name,
        count,
        percentage: Math.round((count / totalItems) * 100)
      }));

    if (sortedCategories.length === 0) return "No categories identified.";

    const topCategory = sortedCategories[0];
    let summary = `Primary focus: ${topCategory.name} (${topCategory.percentage}% of content)`;

    if (sortedCategories.length > 1) {
      const secondCategory = sortedCategories[1];
      summary += `, followed by ${secondCategory.name} (${secondCategory.percentage}%)`;
    }

    if (sortedCategories.length > 2) {
      summary += `. Other topics include ${sortedCategories.slice(2, 4).map(c => c.name).join(', ')}.`;
    }

    return summary;
  }

  // Reset statistics
  resetStats() {
    this.stats = {
      totalClassified: 0,
      categoryStats: {}
    };
    
    Object.keys(this.categories).forEach(key => {
      this.stats.categoryStats[key] = 0;
    });
  }

  // Get classification statistics
  getStats() {
    return {
      ...this.stats,
      categories: this.categories
    };
  }
}

// Export singleton instance
module.exports = new ContentClassifier();