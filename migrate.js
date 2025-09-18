#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const pool = require('./db');

async function runMigration() {
  try {
    console.log('Running database migration...');
    
    const migrationPath = path.join(__dirname, 'migrations.sql');
    const migrationSQL = fs.readFileSync(migrationPath, 'utf8');
    
    // Split on semicolons but be smart about dollar-quoted strings
    const statements = [];
    let current = '';
    let inDollarQuote = false;
    let dollarTag = '';
    
    const lines = migrationSQL.split('\n');
    for (const line of lines) {
      if (line.includes('$$')) {
        if (!inDollarQuote) {
          // Starting dollar quote
          inDollarQuote = true;
          const match = line.match(/\$(\w*)\$/);
          dollarTag = match ? match[1] : '';
        } else if (line.includes(`$${dollarTag}$`)) {
          // Ending dollar quote
          inDollarQuote = false;
          dollarTag = '';
        }
      }
      
      current += line + '\n';
      
      if (!inDollarQuote && line.trim().endsWith(';')) {
        statements.push(current.trim());
        current = '';
      }
    }
    
    if (current.trim()) {
      statements.push(current.trim());
    }
    
    for (const statement of statements) {
      if (statement.trim() && !statement.startsWith('--')) {
        console.log('Executing:', statement.substring(0, 80).replace(/\n/g, ' ') + '...');
        await pool.query(statement);
      }
    }
    
    console.log('Migration completed successfully!');
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

runMigration();