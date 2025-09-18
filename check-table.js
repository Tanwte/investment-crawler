#!/usr/bin/env node
const pool = require('./db');

async function checkTable() {
  try {
    console.log('Checking existing table structure...');
    
    const result = await pool.query(`
      SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns 
      WHERE table_name = 'crawl_results'
      ORDER BY ordinal_position
    `);
    
    console.log('Current table structure:');
    result.rows.forEach(row => {
      console.log(`  ${row.column_name}: ${row.data_type}${row.is_nullable === 'NO' ? ' NOT NULL' : ''}`);
    });
    
  } catch (error) {
    console.error('Error checking table:', error);
  } finally {
    await pool.end();
  }
}

checkTable();