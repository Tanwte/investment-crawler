-- Crawl results
CREATE TABLE IF NOT EXISTS crawl_results (
  id SERIAL PRIMARY KEY,
  url TEXT NOT NULL,
  content TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  status_code INT,
  fetched_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  host TEXT,
  crawl_session_id TEXT,
  session_id TEXT, -- New standardized column
  discovered_links JSONB, -- Store discovered links
  metadata JSONB, -- Store article metadata (title, author, date, etc.)
  is_deep_link BOOLEAN DEFAULT FALSE, -- Flag for deep link results
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Add new columns to existing table if they don't exist
ALTER TABLE crawl_results ADD COLUMN IF NOT EXISTS session_id TEXT;
ALTER TABLE crawl_results ADD COLUMN IF NOT EXISTS discovered_links JSONB;
ALTER TABLE crawl_results ADD COLUMN IF NOT EXISTS metadata JSONB;
ALTER TABLE crawl_results ADD COLUMN IF NOT EXISTS is_deep_link BOOLEAN DEFAULT FALSE;
ALTER TABLE crawl_results ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;

CREATE INDEX IF NOT EXISTS idx_crawl_results_url ON crawl_results(url);
CREATE INDEX IF NOT EXISTS idx_crawl_results_hash ON crawl_results(content_hash);
CREATE INDEX IF NOT EXISTS idx_crawl_results_host ON crawl_results(host);
CREATE INDEX IF NOT EXISTS idx_crawl_results_session ON crawl_results(crawl_session_id);
CREATE INDEX IF NOT EXISTS idx_crawl_results_session_id ON crawl_results(session_id);
CREATE INDEX IF NOT EXISTS idx_crawl_results_is_deep_link ON crawl_results(is_deep_link);
CREATE INDEX IF NOT EXISTS idx_crawl_results_created_at ON crawl_results(created_at);
CREATE INDEX IF NOT EXISTS idx_crawl_results_metadata ON crawl_results USING GIN (metadata);

-- Add multilingual text search vectors
ALTER TABLE crawl_results
  ADD COLUMN IF NOT EXISTS tsv tsvector
  GENERATED ALWAYS AS (to_tsvector('english', content)) STORED;

-- Add multilingual search support
ALTER TABLE crawl_results
  ADD COLUMN IF NOT EXISTS tsv_cjk tsvector
  GENERATED ALWAYS AS (to_tsvector('simple', content)) STORED;

-- Create indexes for multilingual search
CREATE INDEX IF NOT EXISTS idx_crawl_results_tsv ON crawl_results USING GIN (tsv);
CREATE INDEX IF NOT EXISTS idx_crawl_results_tsv_cjk ON crawl_results USING GIN (tsv_cjk);

-- Add a combined search function for better multilingual support
CREATE OR REPLACE FUNCTION search_multilingual(query_text text)
RETURNS TABLE(url text, content text, fetched_at timestamp) AS $$
BEGIN
  RETURN QUERY
  SELECT cr.url, cr.content, cr.fetched_at
  FROM crawl_results cr
  WHERE 
    cr.tsv @@ plainto_tsquery('english', query_text) OR
    cr.tsv_cjk @@ plainto_tsquery('simple', query_text) OR
    cr.content ILIKE '%' || query_text || '%'
  ORDER BY cr.fetched_at DESC;
END;
$$ LANGUAGE plpgsql;

-- Users table
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin','user')),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Settings table
CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- Default reset password
INSERT INTO app_settings (key, value)
VALUES ('default_reset_password', 'Kotra2025!')
ON CONFLICT (key) DO NOTHING;
