const supertest = require('supertest');
const cheerio = require('cheerio');

function extractCsrf(html) {
  const $ = cheerio.load(html);
  return $('input[name="_csrf"]').attr('value');
}

// Keep cookies across requests during a test case
function makeAgent(app) {
  return supertest.agent(app);
}

module.exports = { extractCsrf, makeAgent };