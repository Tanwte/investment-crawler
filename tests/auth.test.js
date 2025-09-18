const app = require('./testServer');
const { makeAgent, extractCsrf } = require('./utils');

describe('Auth: login/logout', () => {
  it('GET /login renders form', async () => {
    const res = await makeAgent(app).get('/login');
    expect(res.status).toBe(200);
    expect(res.text).toContain('<h1>Login</h1>');
  });

  it('rejects bad login', async () => {
    const agent = makeAgent(app);
    const loginPage = await agent.get('/login');
    const csrf = extractCsrf(loginPage.text);

    const res = await agent
      .post('/login')
      .type('form')
      .send({ _csrf: csrf, username: 'wrong', password: 'nope' });

    expect(res.status).toBe(401);
    expect(res.text).toContain('Invalid username or password');
  });

  it('accepts admin login (Kotra)', async () => {
    const agent = makeAgent(app);
    const page = await agent.get('/login');
    const csrf = extractCsrf(page.text);

    const res = await agent
      .post('/login')
      .type('form')
      .send({ _csrf: csrf, username: 'Kotra', password: 'Kotra2025!' });

    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/admin');

    // confirm admin page
    const admin = await agent.get('/admin');
    expect(admin.status).toBe(200);
    expect(admin.text).toContain('Signed in as:');
  });

  it('accepts normal user login (TestUser)', async () => {
    const agent = makeAgent(app);
    const page = await agent.get('/login');
    const csrf = extractCsrf(page.text);

    const res = await agent
      .post('/login')
      .type('form')
      .send({ _csrf: csrf, username: 'TestUser', password: 'testing1234!' });

    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/admin'); // redirected, but user is not admin for admin-only pages
  });
});