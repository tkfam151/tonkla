const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createApp } = require('../server');

async function start(opts = {}) {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'quiz-test-'));
  const app = createApp({ dataDir, adminPassword: 'secret', ...opts });
  const server = await new Promise((r) => { const s = app.listen(0, () => r(s)); });
  const base = `http://127.0.0.1:${server.address().port}`;
  let cookie = '';
  const call = async (method, url, body) => {
    const res = await fetch(base + url, {
      method,
      headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(cookie ? { Cookie: cookie } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    const set = res.headers.get('set-cookie');
    if (set) cookie = set.split(';')[0];
    return { status: res.status, body: await res.json().catch(() => null) };
  };
  return { call, close: () => server.close(), dataDir };
}

test('admin creates a quiz, viewers take it without seeing answers', async () => {
  const { call, close } = await start();
  try {
    assert.strictEqual((await call('GET', '/api/admin/quizzes')).status, 401);
    assert.strictEqual((await call('POST', '/api/admin/login', { password: 'nope' })).status, 401);
    assert.strictEqual((await call('POST', '/api/admin/login', { password: 'secret' })).status, 200);

    const bad = await call('POST', '/api/admin/quizzes', { title: 'x', questions: [{ type: 'choice', prompt: 'q', choices: ['a'] }] });
    assert.strictEqual(bad.status, 400);
    assert.match(bad.body.error, /two choices/);

    const created = await call('POST', '/api/admin/quizzes', {
      title: 'IMO Shortlist Warmup!',
      category: 'Olympiad',
      videoUrl: 'https://youtu.be/dQw4w9WgXcQ',
      published: false,
      questions: [
        { type: 'choice', prompt: '$1+1$?', choices: ['1', '2', '3'], correct: 1, explanation: 'Add.' },
        { type: 'short', prompt: 'Half of 3?', answers: ['3/2'] },
      ],
    });
    assert.strictEqual(created.status, 201);
    const quiz = created.body;
    assert.strictEqual(quiz.slug, 'imo-shortlist-warmup');

    // Draft is visible to admin only
    const draftList = await call('GET', '/api/quizzes');
    assert.ok(!draftList.body.quizzes.some((q) => q.slug === quiz.slug));
    await call('POST', '/api/admin/logout');
    assert.strictEqual((await call('GET', `/api/quizzes/${quiz.slug}`)).status, 404);

    await call('POST', '/api/admin/login', { password: 'secret' });
    const updated = await call('PUT', `/api/admin/quizzes/${quiz.id}`, { ...quiz, published: true });
    assert.strictEqual(updated.status, 200);
    assert.deepStrictEqual(updated.body.questions.map((q) => q.id), quiz.questions.map((q) => q.id));
    await call('POST', '/api/admin/logout');

    // Public view has no answers
    const pub = await call('GET', `/api/quizzes/${quiz.slug}`);
    assert.strictEqual(pub.status, 200);
    const text = JSON.stringify(pub.body);
    assert.ok(!text.includes('"correct"') && !text.includes('"answers"') && !text.includes('explanation'));

    const [q1, q2] = pub.body.questions;
    const check = await call('POST', `/api/quizzes/${quiz.slug}/check`, { questionId: q1.id, answer: 1 });
    assert.deepStrictEqual(check.body, { correct: true, correctAnswer: 1, explanation: 'Add.' });
    const check2 = await call('POST', `/api/quizzes/${quiz.slug}/check`, { questionId: q2.id, answer: '1.5' });
    assert.strictEqual(check2.body.correct, true);

    const attempt = await call('POST', `/api/quizzes/${quiz.slug}/attempts`, { answers: { [q1.id]: 0, [q2.id]: '1.5' } });
    assert.deepStrictEqual(attempt.body, { correct: 1, total: 2 });

    await call('POST', '/api/admin/login', { password: 'secret' });
    const list = await call('GET', '/api/admin/quizzes');
    const row = list.body.quizzes.find((q) => q.id === quiz.id);
    assert.deepStrictEqual(row.stats, { attempts: 1, totalCorrect: 1, totalQuestions: 2 });

    // Same title gets a unique slug
    const dup = await call('POST', '/api/admin/quizzes', { title: 'IMO Shortlist Warmup', questions: [] });
    assert.strictEqual(dup.body.slug, 'imo-shortlist-warmup-2');

    assert.strictEqual((await call('DELETE', `/api/admin/quizzes/${quiz.id}`)).status, 200);
    assert.strictEqual((await call('GET', `/api/quizzes/${quiz.slug}`)).status, 404);
  } finally {
    close();
  }
});

test('admin login is disabled without a password', async () => {
  const { call, close } = await start({ adminPassword: '' });
  try {
    assert.strictEqual((await call('POST', '/api/admin/login', { password: '' })).status, 503);
    assert.strictEqual((await call('GET', '/api/admin/quizzes')).status, 401);
  } finally {
    close();
  }
});

test('forged admin cookie is rejected', async () => {
  const { close, dataDir } = await start();
  const app = createApp({ dataDir, adminPassword: 'secret' });
  const server = await new Promise((r) => { const s = app.listen(0, () => r(s)); });
  try {
    const res = await fetch(`http://127.0.0.1:${server.address().port}/api/admin/quizzes`, {
      headers: { Cookie: `admin=${Date.now() + 1e9}.${'0'.repeat(64)}` },
    });
    assert.strictEqual(res.status, 401);
  } finally {
    server.close();
    close();
  }
});
