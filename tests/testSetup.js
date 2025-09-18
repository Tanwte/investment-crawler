// Runs before every test file
process.env.NODE_ENV = 'test';
process.env.SESSION_SECRET = 'test-secret';
process.env.CRAWL_TOKEN = process.env.CRAWL_TOKEN || 'test-token';
process.env.PORT = '0'; // don't use a fixed port in tests
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgres://test/test@test/test';

// Ensure timezone deterministic, if needed
process.env.TZ = 'UTC';