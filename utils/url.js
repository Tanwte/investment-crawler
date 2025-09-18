const { URL } = require('url');

function isSafeHttpUrl(candidate) {
  let u;
  try { u = new URL(candidate); } catch { return false; }
  if (!['http:', 'https:'].includes(u.protocol)) return false;

  const host = u.hostname;
  const privateRanges = [
    /^localhost$/i, /^127\./, /^10\./, /^192\.168\./, /^172\.(1[6-9]|2\d|3[0-1])\./
  ];
  return !privateRanges.some(rx => rx.test(host));
}

function hostnameOf(url) {
  try { return new URL(url).hostname; } catch { return null; }
}

module.exports = { isSafeHttpUrl, hostnameOf };