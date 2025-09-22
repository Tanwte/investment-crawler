-- Add hierarchy tracking for crawl results
-- Add parent URL and depth tracking to support hierarchical grouping

-- Add columns for tracking crawl hierarchy
ALTER TABLE crawl_results ADD COLUMN IF NOT EXISTS parent_url TEXT;
ALTER TABLE crawl_results ADD COLUMN IF NOT EXISTS crawl_depth INTEGER DEFAULT 0;

-- Create indexes for efficient hierarchy queries
CREATE INDEX IF NOT EXISTS idx_crawl_results_parent_url ON crawl_results(parent_url);
CREATE INDEX IF NOT EXISTS idx_crawl_results_crawl_depth ON crawl_results(crawl_depth);
CREATE INDEX IF NOT EXISTS idx_crawl_results_session_depth ON crawl_results(session_id, crawl_depth);

-- Update existing records to have proper depth values based on is_deep_link flag
UPDATE crawl_results 
SET crawl_depth = CASE 
  WHEN is_deep_link = false THEN 0 
  ELSE 1 
END 
WHERE crawl_depth IS NULL;

COMMENT ON COLUMN crawl_results.parent_url IS 'URL that led to discovering this result (for building crawl tree)';
COMMENT ON COLUMN crawl_results.crawl_depth IS 'Depth level in the crawl tree (0=root, 1=first level deep link, etc.)';