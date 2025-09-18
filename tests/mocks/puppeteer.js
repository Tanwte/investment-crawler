// Minimal puppeteer mock: returns page content with keywords present
function launch() {
  return Promise.resolve({
    newPage: async () => ({
      setUserAgent: async () => {},
      setRequestInterception: async () => {},
      on: () => {},
      goto: async () => {},
      evaluate: async (fn) => "Singapore investment portfolio context text for dynamic page.",
    }),
    close: async () => {}
  });
}
module.exports = { launch };