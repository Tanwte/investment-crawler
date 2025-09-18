// Simple proxy rotation system
// Note: You'll need to add your own proxy servers to this list

class ProxyRotator {
  constructor() {
    // Free proxy list - replace with your premium proxies for better reliability
    this.proxies = [
      // Example format:
      // { host: 'proxy1.example.com', port: 8080, auth: { username: 'user', password: 'pass' } },
      // { host: 'proxy2.example.com', port: 3128 },
      
      // For now, we'll use no proxies but the structure is ready
    ];
    
    this.currentIndex = 0;
    this.failedProxies = new Set();
  }
  
  getNextProxy() {
    if (this.proxies.length === 0) {
      return null; // No proxies configured
    }
    
    // Find next working proxy
    let attempts = 0;
    while (attempts < this.proxies.length) {
      const proxy = this.proxies[this.currentIndex];
      this.currentIndex = (this.currentIndex + 1) % this.proxies.length;
      
      if (!this.failedProxies.has(proxy.host)) {
        return proxy;
      }
      
      attempts++;
    }
    
    // All proxies failed, reset and try again
    console.log('All proxies failed, resetting failed list');
    this.failedProxies.clear();
    return this.proxies[0];
  }
  
  markProxyAsFailed(proxy) {
    if (proxy) {
      this.failedProxies.add(proxy.host);
      console.log(`Marking proxy ${proxy.host} as failed`);
    }
  }
  
  // Convert proxy to axios config
  getAxiosProxyConfig(proxy) {
    if (!proxy) return {};
    
    const config = {
      proxy: {
        host: proxy.host,
        port: proxy.port
      }
    };
    
    if (proxy.auth) {
      config.proxy.auth = proxy.auth;
    }
    
    return config;
  }
  
  // Convert proxy to puppeteer args
  getPuppeteerProxyArgs(proxy) {
    if (!proxy) return [];
    
    const args = [`--proxy-server=${proxy.host}:${proxy.port}`];
    
    // Note: Puppeteer proxy auth requires additional setup
    // You might need to handle auth differently for Puppeteer
    
    return args;
  }
}

// Singleton instance
const proxyRotator = new ProxyRotator();

module.exports = proxyRotator;