// Rate limiting system to avoid overwhelming websites
class RateLimiter {
  constructor() {
    this.requestTimes = new Map(); // domain -> array of timestamps
    this.minDelay = 1000; // Minimum 1 second between requests to same domain
    this.maxRequestsPerMinute = 10; // Max 10 requests per minute per domain
  }
  
  async waitForRate(url) {
    const domain = this.extractDomain(url);
    const now = Date.now();
    
    if (!this.requestTimes.has(domain)) {
      this.requestTimes.set(domain, []);
    }
    
    const times = this.requestTimes.get(domain);
    
    // Clean old timestamps (older than 1 minute)
    const oneMinuteAgo = now - 60000;
    const recentTimes = times.filter(time => time > oneMinuteAgo);
    
    // Check if we've hit the rate limit
    if (recentTimes.length >= this.maxRequestsPerMinute) {
      const oldestRecentTime = Math.min(...recentTimes);
      const waitTime = oldestRecentTime + 60000 - now;
      
      if (waitTime > 0) {
        console.log(`Rate limiting ${domain}: waiting ${Math.round(waitTime)}ms`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
      }
    }
    
    // Check minimum delay between requests
    if (recentTimes.length > 0) {
      const lastRequestTime = Math.max(...recentTimes);
      const timeSinceLastRequest = now - lastRequestTime;
      
      if (timeSinceLastRequest < this.minDelay) {
        const waitTime = this.minDelay - timeSinceLastRequest;
        console.log(`Rate limiting ${domain}: waiting ${waitTime}ms for minimum delay`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
      }
    }
    
    // Record this request
    this.requestTimes.set(domain, [...recentTimes, Date.now()]);
  }
  
  extractDomain(url) {
    try {
      return new URL(url).hostname;
    } catch (e) {
      return 'unknown';
    }
  }
  
  // Get current rate for a domain (requests per minute)
  getCurrentRate(url) {
    const domain = this.extractDomain(url);
    const now = Date.now();
    const oneMinuteAgo = now - 60000;
    
    if (!this.requestTimes.has(domain)) {
      return 0;
    }
    
    const recentTimes = this.requestTimes.get(domain).filter(time => time > oneMinuteAgo);
    return recentTimes.length;
  }
}

// Singleton instance
const rateLimiter = new RateLimiter();

module.exports = rateLimiter;