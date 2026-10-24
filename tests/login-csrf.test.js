import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import session from 'express-session';
import bcrypt from 'bcryptjs';

// Isolated route harness: no production database connections or users.
process.env.DATABASE_URL = 'postgres://unused:unused@127.0.0.1/unused';
process.env.APP_URL = 'https://itinerary.febro.id';
const { pool } = await import('../src/database.js');
const { default: auth } = await import('../src/routes/auth.js');

test('login session and CSRF lifecycle', async t => {
  let queries = 0;
  const hash = await bcrypt.hash('test-only-password', 4);
  pool.query = async () => { queries++; return { rows: [{ status: 'active', password_hash: hash }] }; };
  const store = new session.MemoryStore();
  const app = express();
  app.use(express.urlencoded({ extended: true }));
  app.use(session({ secret: 'isolated-auth-test-session-secret', store, resave: false, saveUninitialized: false }));
  app.use((req, res, next) => {
    res.render = (view) => { if(view==='auth/session-expired') return res.send('expired'); return store.get(req.sessionID, (err, saved) => {
      assert.ifError(err);
      assert.equal(saved.loginCSRF, req.session.loginCSRF, 'token persisted before render');
      res.json({ token: req.session.loginCSRF });
    }); };
    next();
  });
  app.use(auth);
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const url = `http://127.0.0.1:${server.address().port}/login`;
  const first = await fetch(url);
  const cookie = first.headers.get('set-cookie').split(';')[0];
  const { token } = await first.json();
  assert.match(token, /^[A-Za-z0-9_-]{43}$/);
  const second = await fetch(url, { headers: { cookie } });
  assert.equal((await second.json()).token, token, 'second tab preserves earlier form');
  const post = (body, origin = process.env.APP_URL, withCookie = true) => fetch(url, {
    method: 'POST', redirect: 'manual',
    headers: { ...(withCookie ? { cookie } : {}), origin, 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ email: 'test@example.invalid', password: 'wrong-password', ...body })
  });
  for (const body of [{}, { csrf: 'invalid' }, { csrf: ['bad', token] }]) {
    assert.equal((await post(body)).status, 403);
  }
  assert.equal((await post({ csrf: token }, 'https://evil.example')).status, 403);
  assert.equal((await post({ csrf: token }, process.env.APP_URL, false)).status, 403);
  assert.equal(queries, 0, 'CSRF rejection happens before database/password access');
  const rejected = await post({ csrf: token });
  assert.equal(rejected.status, 302);
  assert.equal(rejected.headers.get('location'), '/login');
  assert.equal(queries, 1, 'valid CSRF reaches password verification');
  assert.equal((await post({ csrf: token })).status, 302, 'credential retry retains CSRF');
  const saved = await new Promise((resolve, reject) => store.all((err, sessions) => err ? reject(err) : resolve(sessions)));
  assert.ok(Object.values(saved).some(s => s.flash?.message === 'Email atau password tidak valid.' && !s.user));
});
