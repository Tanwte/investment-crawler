// utils/clean.js
// Heuristic extractor + text cleaner for nicer snippets

function pickMainCheerio($) {
  // Remove noise nodes before text extraction
  $('script,style,noscript,template,iframe').remove();

  // Prefer common content containers
  const candidates = $('article, main, [role="main"], .article, .article-body, .story, .post, .content')
    .filter((i, el) => $(el).text().trim().length > 200);

  if (candidates.length) {
    // Pick the longest text block
    let best = null; let max = 0;
    candidates.each((i, el) => {
      const t = $(el).text().trim();
      if (t.length > max) { max = t.length; best = t; }
    });
    return best || $('body').text();
  }
  // Fallback to body text
  return $('body').text();
}

// Collapse whitespace and strip obvious junk
function basicNormalize(t) {
  return t
    // remove URLs
    .replace(/\b(?:https?:\/\/|www\.)\S+/gi, ' ')
    // remove deep pathy tokens like /companies-markets/banking-finance/xyz
    .replace(/\s\/[A-Za-z0-9._\-\/]{3,}\b/g, ' ')
    // kill super long bracketed/jsonish chunks (very heuristic, bounded)
    .replace(/[{[][^{}\][]{50,}[}\]]/gs, ' ')
    // kill repeated punctuation runs
    .replace(/[^\p{L}\p{N}\s.,;:'"!?%()-]+/gu, ' ')
    // collapse spaces
    .replace(/\s+/g, ' ')
    .trim();
}

// Split to sentences and keep only readable ones
function sentenceSplit(t) {
  return t.split(/(?<=[.!?])\s+(?=[A-Z(""'])/).map(s => s.trim()).filter(Boolean);
}

function letterRatio(s) {
  const letters = (s.match(/\p{L}/gu) || []).length;
  return letters / Math.max(1, s.length);
}

function cleanSnippetsFromText(text, keywords, contextChars = 240) {
  const normalized = basicNormalize(text);
  const sents = sentenceSplit(normalized);

  // Build keyword regexes (case-insensitive)
  const regs = keywords.map(k => new RegExp(k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'));

  const hits = [];
  for (const sent of sents) {
    // must contain at least one keyword, be a reasonable length, and be letter-y
    if (sent.length < 20 || sent.length > 400) continue;
    if (letterRatio(sent) < 0.6) continue;
    if (!regs.some(r => r.test(sent))) continue;
    hits.push(sent);
  }

  // Fallback: if no sentence hit, do a context window around the first match
  if (hits.length === 0) {
    for (const r of regs) {
      const m = normalized.match(r);
      if (m && m.index != null) {
        const i = m.index;
        const s = Math.max(0, i - contextChars);
        const e = Math.min(normalized.length, i + m[0].length + contextChars);
        const window = basicNormalize(normalized.slice(s, e));
        if (window.length >= 20) hits.push(window);
        break;
      }
    }
  }

  // Dedupe with a simple set on lowercase
  const seen = new Set();
  const out = [];
  for (const h of hits) {
    const key = h.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(h);
  }
  return out;
}

module.exports = { pickMainCheerio, cleanSnippetsFromText, basicNormalize };