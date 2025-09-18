const app = require('./testServer');
const { makeAgent, extractCsrf } = require('./utils');

async function loginAdmin(agent) {
  const page = await agent.get('/login');
  const csrf = extractCsrf(page.text);
  await agent.post('/login').type('form').send({ _csrf: csrf, username: 'Kotra', password: 'Kotra2025!' });
}

describe('Admin: user management', () => {
  it('admin can view users page', async () => {
    const agent = makeAgent(app);
    await loginAdmin(agent);
    const res = await agent.get('/admin/users');
    expect(res.status).toBe(200);
    expect(res.text).toContain('Existing Users');
  });

  it('admin can create user, reset password, and delete user', async () => {
    const agent = makeAgent(app);
    await loginAdmin(agent);

    // Create user
    let page = await agent.get('/admin/users');
    let csrf = extractCsrf(page.text);
    let res = await agent.post('/admin/users/create').type('form').send({
      _csrf: csrf, username: 'NewUser', password: 'P@ssw0rd!', role: 'user'
    });
    expect(res.status).toBe(302);

    // Reset user password (uses default in settings)
    page = await agent.get('/admin/users');
    csrf = extractCsrf(page.text);
    // parse the user_id for "NewUser"
    const match = page.text.match(/<td>(\d+)<\/td><td>NewUser<\/td>/);
    expect(match).toBeTruthy();
    const userId = match[1];

    res = await agent.post('/admin/users/reset').type('form').send({
      _csrf: csrf, user_id: userId
    });
    expect(res.status).toBe(302);

    // Delete user
    page = await agent.get('/admin/users');
    csrf = extractCsrf(page.text);

    res = await agent.post('/admin/users/delete').type('form').send({
      _csrf: csrf, user_id: userId
    });
    expect(res.status).toBe(302);
  });

  it('admin can change default reset password', async () => {
    const agent = makeAgent(app);
    await loginAdmin(agent);

    const page = await agent.get('/admin/settings');
    const csrf = extractCsrf(page.text);

    const res = await agent.post('/admin/settings').type('form').send({
      _csrf: csrf, default_password: 'NewDefault123!'
    });
    expect(res.status).toBe(302);
  });
});