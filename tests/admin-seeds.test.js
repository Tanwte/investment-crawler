const app = require('./testServer');
const { makeAgent, extractCsrf } = require('./utils');

async function loginAdmin(agent) {
  const page = await agent.get('/login');
  const csrf = extractCsrf(page.text);
  await agent.post('/login').type('form').send({ _csrf: csrf, username: 'Kotra', password: 'Kotra2025!' });
}

describe('Admin: keywords and URLs management', () => {
  it('admin can update keywords', async () => {
    const agent = makeAgent(app);
    await loginAdmin(agent);

    let page = await agent.get('/admin/keywords');
    let csrf = extractCsrf(page.text);

    const res = await agent.post('/admin/keywords').type('form').send({
      _csrf: csrf,
      keywords: 'singapore\ninvestment\nportfolio company'
    });
    expect(res.status).toBe(200);
    expect(res.text).toContain('Saved 3 keyword(s)');
  });

  it('admin can update URLs (enforced min/max)', async () => {
    const agent = makeAgent(app);
    await loginAdmin(agent);

    const valid10 = [
      'https://one.example/news', 'https://two.example/news', 'https://three.example/news',
      'https://four.example/news', 'https://five.example/news', 'https://six.example/news',
      'https://seven.example/news', 'https://eight.example/news', 'https://nine.example/news',
      'https://ten.example/news'
    ].join('\n');

    let page = await agent.get('/admin/urls');
    let csrf = extractCsrf(page.text);

    // too few -> error
    let res = await agent.post('/admin/urls').type('form').send({ _csrf: csrf, urls: 'https://one.example/news\nhttps://two.example/news\nhttps://three.example/news\nhttps://four.example/news\nhttps://five.example/news\nhttps://six.example/news\nhttps://seven.example/news\nhttps://eight.example/news\nhttps://nine.example/news' });
    expect(res.status).toBe(422);

    // valid 10 -> success
    page = await agent.get('/admin/urls');
    csrf = extractCsrf(page.text);
    res = await agent.post('/admin/urls').type('form').send({ _csrf: csrf, urls: valid10 });
    expect(res.status).toBe(200);
    expect(res.text).toContain('Saved 10 URL(s)');
  });
});