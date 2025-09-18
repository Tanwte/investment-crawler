const app = require('./testServer');
const { makeAgent, extractCsrf } = require('./utils');

async function loginAdmin(agent) {
  const page = await agent.get('/login');
  const csrf = extractCsrf(page.text);
  await agent.post('/login').type('form').send({ _csrf: csrf, username: 'Kotra', password: 'Kotra2025!' });
}

describe('Crawl & Search flow', () => {
  it('runs a crawl (token + admin required) and finds results via search', async () => {
    const agent = makeAgent(app);
    await loginAdmin(agent);

    // run crawl
    const crawl = await agent
      .get('/crawl')
      .set('X-CRAWL-TOKEN', process.env.CRAWL_TOKEN || 'test-token');
    // Either HTML or 202 if concurrent; for test env should render HTML results
    expect([200, 202]).toContain(crawl.status);

    // then search for a keyword found in mocks
    const search = await agent.get('/search?q=singapore&size=50');
    expect(search.status).toBe(200);
    expect(search.text.toLowerCase()).toContain('singapore');
  });
});