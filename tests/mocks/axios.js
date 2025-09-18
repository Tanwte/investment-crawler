// Minimal axios mock for tests: returns robots.txt and simple HTML pages.
const url = require('url');

function get(target, options = {}) {
  const u = url.parse(target);
  // robots.txt -> allow all
  if (u.pathname === '/robots.txt') {
    return Promise.resolve({ data: "User-agent: *\nAllow: /\n" });
  }
  // Simple HTML for any news page
  const html = `
    <html><body>
      <h1>Newsroom</h1>
      <p>Singapore investment capital flows are rising. Series A and Series B mentioned.</p>
    </body></html>
  `;
  return Promise.resolve({ data: html, status: 200 });
}

module.exports = { get };