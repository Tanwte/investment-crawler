// utils/phraseKeywordMatcher.js - Enhanced keyword matching with phrase support
const crypto = require('crypto');
const { contextChars } = require('../config');

/**
 * Enhanced keyword matcher that supports both individual words and exact phrases
 * This reduces redundant results by prioritizing exact phrase matches
 */
class PhraseKeywordMatcher {
  constructor(keywords) {
    this.originalKeywords = keywords;
    this.processedKeywords = this.categorizeKeywords(keywords);
  }

  /**
   * Categorize keywords into phrases and individual words
   * Phrases (containing spaces) get higher priority than individual words
   */
  categorizeKeywords(keywords) {
    const phrases = [];
    const singleWords = [];
    
    for (const keyword of keywords) {
      if (keyword.includes(' ')) {
        phrases.push({
          text: keyword,
          type: 'phrase',
          priority: 10, // Higher priority for phrases
          regex: this.createPhraseRegex(keyword)
        });
      } else {
        singleWords.push({
          text: keyword,
          type: 'word',
          priority: 5, // Lower priority for single words
          regex: this.createWordRegex(keyword)
        });
      }
    }
    
    // Sort by priority (phrases first)
    return [...phrases, ...singleWords].sort((a, b) => b.priority - a.priority);
  }

  /**
   * Create regex for exact phrase matching
   * "venture capital" will only match "venture capital", not "venture" + "capital" separately
   */
  createPhraseRegex(phrase) {
    const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    // Use word boundaries that work with multilingual content
    return new RegExp(`(?:^|\\s|[^가-힣a-zA-Z0-9])${escaped}(?=\\s|[^가-힣a-zA-Z0-9]|$)`, 'gi');
  }

  /**
   * Create regex for individual word matching  
   */
  createWordRegex(word) {
    const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`(?:^|\\s|[^가-힣a-zA-Z0-9])${escaped}(?=\\s|[^가-힣a-zA-Z0-9]|$)`, 'gi');
  }

  /**
   * Extract mentions with phrase prioritization
   * This method reduces redundancy by:
   * 1. Finding phrase matches first
   * 2. Only looking for individual words if they're not part of already-found phrases
   */
  extractMentions(text) {
    const mentions = [];
    const foundRanges = []; // Track text ranges already captured by phrases
    
    // Step 1: Find all phrase matches first (higher priority)
    for (const keywordObj of this.processedKeywords) {
      if (keywordObj.type !== 'phrase') continue;
      
      keywordObj.regex.lastIndex = 0; // Reset regex position
      let match;
      
      while ((match = keywordObj.regex.exec(text))) {
        const start = Math.max(0, match.index - contextChars);
        const end = Math.min(text.length, match.index + match[0].length + contextChars);
        
        // Track this range as used by a phrase
        foundRanges.push({
          start: match.index,
          end: match.index + match[0].length,
          keyword: keywordObj.text
        });
        
        mentions.push({
          keyword: keywordObj.text,
          type: 'phrase',
          priority: keywordObj.priority,
          context: text.slice(start, end).trim(),
          position: match.index
        });
      }
    }

    // Step 2: Find individual word matches, but skip if they're part of phrases
    for (const keywordObj of this.processedKeywords) {
      if (keywordObj.type !== 'word') continue;
      
      keywordObj.regex.lastIndex = 0;
      let match;
      
      while ((match = keywordObj.regex.exec(text))) {
        // Check if this word is already covered by a phrase
        const isPartOfPhrase = foundRanges.some(range => 
          match.index >= range.start && match.index < range.end
        );
        
        if (!isPartOfPhrase) {
          const start = Math.max(0, match.index - contextChars);
          const end = Math.min(text.length, match.index + match[0].length + contextChars);
          
          mentions.push({
            keyword: keywordObj.text,
            type: 'word',
            priority: keywordObj.priority,
            context: text.slice(start, end).trim(),
            position: match.index
          });
        }
      }
    }

    // Sort by priority and remove duplicates
    const uniqueMentions = this.deduplicateMentions(mentions);
    return uniqueMentions.map(m => m.context); // Return contexts for backward compatibility
  }

  /**
   * Extract mentions with full object details for analysis
   */
  extractMentionsDetailed(text) {
    const mentions = [];
    const foundRanges = []; // Track text ranges already captured by phrases
    const contextChars = 100;
    
    // Step 1: Find all phrase matches first (higher priority)
    for (const keywordObj of this.processedKeywords) {
      if (keywordObj.type !== 'phrase') continue;
      
      keywordObj.regex.lastIndex = 0; // Reset regex position
      let match;
      
      while ((match = keywordObj.regex.exec(text))) {
        const start = Math.max(0, match.index - contextChars);
        const end = Math.min(text.length, match.index + match[0].length + contextChars);
        
        // Track this range as used by a phrase
        foundRanges.push({
          start: match.index,
          end: match.index + match[0].length,
          keyword: keywordObj.text
        });
        
        mentions.push({
          keyword: keywordObj.text,
          type: 'phrase',
          priority: keywordObj.priority,
          context: text.slice(start, end).trim(),
          position: match.index,
          text: match[0] // The actual matched text
        });
      }
    }

    // Step 2: Find individual word matches, but skip if they're part of phrases
    for (const keywordObj of this.processedKeywords) {
      if (keywordObj.type !== 'word') continue;
      
      keywordObj.regex.lastIndex = 0;
      let match;
      
      while ((match = keywordObj.regex.exec(text))) {
        // Check if this word is already covered by a phrase
        const isPartOfPhrase = foundRanges.some(range => 
          match.index >= range.start && match.index < range.end
        );
        
        if (!isPartOfPhrase) {
          const start = Math.max(0, match.index - contextChars);
          const end = Math.min(text.length, match.index + match[0].length + contextChars);
          
          mentions.push({
            keyword: keywordObj.text,
            type: 'word',
            priority: keywordObj.priority,
            context: text.slice(start, end).trim(),
            position: match.index,
            text: match[0] // The actual matched text
          });
        }
      }
    }

    // Sort by priority and remove duplicates
    const uniqueMentions = this.deduplicateMentions(mentions);
    return uniqueMentions; // Return full objects
  }

  /**
   * Remove duplicate mentions and prioritize higher-priority matches
   */
  deduplicateMentions(mentions) {
    // Group mentions by context (same text snippet)
    const contextGroups = {};
    
    for (const mention of mentions) {
      const contextKey = this.normalizeContext(mention.context);
      
      if (!contextGroups[contextKey] || 
          contextGroups[contextKey].priority < mention.priority) {
        contextGroups[contextKey] = mention;
      }
    }
    
    return Object.values(contextGroups);
  }

  /**
   * Normalize context for comparison (remove extra whitespace, etc.)
   */
  normalizeContext(context) {
    return context.replace(/\s+/g, ' ').trim().toLowerCase();
  }

  /**
   * Get statistics about the keyword matching
   */
  getMatchingStats(text) {
    const mentions = this.extractMentions(text);
    const phrases = mentions.filter(m => this.isPhraseMention(m));
    const words = mentions.filter(m => !this.isPhraseMention(m));
    
    return {
      totalMentions: mentions.length,
      phraseMentions: phrases.length,
      wordMentions: words.length,
      reductionPercentage: Math.round((1 - mentions.length / this.originalKeywords.length) * 100)
    };
  }

  /**
   * Check if a mention context contains a phrase
   */
  isPhraseMention(context) {
    return this.processedKeywords
      .filter(k => k.type === 'phrase')
      .some(k => k.regex.test(context));
  }

  /**
   * Get legacy mentions array for backward compatibility
   */
  extractMentionsLegacy(text) {
    return this.extractMentions(text);
  }
}

/**
 * Factory function to create enhanced keyword matcher
 */
function createEnhancedMatcher(keywords) {
  return new PhraseKeywordMatcher(keywords);
}

/**
 * Enhanced buildRegexes that supports phrase prioritization
 * Backward compatible with existing code
 */
function buildEnhancedRegexes(keywords) {
  const matcher = new PhraseKeywordMatcher(keywords);
  return matcher.processedKeywords.map(k => k.regex);
}

/**
 * Enhanced extractMentions that reduces redundancy
 * Backward compatible with existing code
 */
function extractEnhancedMentions(text, regexes, keywords) {
  const matcher = new PhraseKeywordMatcher(keywords);
  return matcher.extractMentions(text);
}

module.exports = {
  PhraseKeywordMatcher,
  createEnhancedMatcher,
  buildEnhancedRegexes,
  extractEnhancedMentions
};