#!/usr/bin/env node
const pool = require('./db');

async function addColumn() {
  try {
    console.log('Adding crawl_session_id column...');
    
    // Try to add the column if it doesn't exist
    await pool.query(`
      ALTER TABLE crawl_results 
      ADD COLUMN IF NOT EXISTS crawl_session_id TEXT
    `);
    
    console.log('Column added successfully!');
    
    // Now create the index
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_crawl_results_session 
      ON crawl_results(crawl_session_id)
    `);
    
    console.log('Index created successfully!');
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await pool.end();
  }
}

addColumn();