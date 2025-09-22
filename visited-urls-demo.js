const DeepLinkCrawler = require('./utils/deepLinkCrawler');

async function testVisitedUrls() {
  try {
    console.log('🔍 Testing visited URL tracking...');
    
    const keywords = ['Singapore', 'Lee Kuan Yew'];
    const deepCrawler = new DeepLinkCrawler({
      maxDepth: 2,
      maxLinksPerPage: 3, // Small number for testing
      crawlDelay: 500
    });
    
    console.log('\n🚀 Starting crawl from ASEAN page...');
    const result = await deepCrawler.crawlWithDeepLinks('https://en.wikipedia.org/wiki/ASEAN', keywords, 0);
    
    console.log('\n📊 Final Crawl Statistics:');
    const stats = deepCrawler.getStats();
    console.log(`   Total URLs visited: ${stats.visitedUrls}`);
    console.log(`   Unique domains: ${stats.visitedDetails.uniqueDomains}`);
    console.log(`   Domains crawled: ${stats.visitedDetails.domains.join(', ')}`);
    
    console.log('\n🌐 URLs Visited:');
    stats.visitedDetails.recentUrls.forEach((url, i) => {
      console.log(`   ${i+1}. ${url}`);
    });
    
    console.log('\n🔄 Testing duplicate detection...');
    console.log('Attempting to crawl ASEAN page again (should be skipped):');
    
    const duplicateResult = await deepCrawler.crawlWithDeepLinks('https://en.wikipedia.org/wiki/ASEAN', keywords, 0);
    
    console.log(`\n📈 Results:`);
    console.log(`   First crawl: ${result.results.length} pages`);
    console.log(`   Duplicate crawl: ${duplicateResult.results.length} pages (should be 0)`);
    
    if (duplicateResult.results.length === 0) {
      console.log('✅ SUCCESS: Duplicate URL detection working correctly!');
    } else {
      console.log('❌ FAILED: Duplicate URLs were not detected');
    }
    
    console.log('\n🔍 Full visited URL list:');
    const allVisited = deepCrawler.getVisitedUrls();
    allVisited.forEach((url, i) => {
      console.log(`   ${i+1}. ${url}`);
    });
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }
}

testVisitedUrls();