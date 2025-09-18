function escapeHtml(s) {
  return s.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

function highlight(snippet, regexes) {
  const e = escapeHtml(snippet);
  const parts = regexes.map(r => r.source.replace(/^\(/,'(?:'));
  const rx = new RegExp(`(${parts.join('|')})`, 'gi');
  return e.replace(rx, '<mark>$1</mark>');
}

module.exports = { highlight, escapeHtml };