-- Crawl results
CREATE TABLE IF NOT EXISTS crawl_results (
  id SERIAL PRIMARY KEY,
  url TEXT NOT NULL,
  content TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  status_code INT,
  fetched_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  host TEXT
);

CREATE INDEX IF NOT EXISTS idx_crawl_results_url ON crawl_results(url);
CREATE INDEX IF NOT EXISTS idx_crawl_results_hash ON crawl_results(content_hash);
CREATE INDEX IF NOT EXISTS idx_crawl_results_host ON crawl_results(host);

ALTER TABLE crawl_results
  ADD COLUMN IF NOT EXISTS tsv tsvector
  GENERATED ALWAYS AS (to_tsvector('english', content)) STORED;

CREATE INDEX IF NOT EXISTS idx_crawl_results_tsv ON crawl_results USING GIN (tsv);

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
