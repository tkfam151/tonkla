'use strict';

const path = require('path');
const crypto = require('crypto');
const express = require('express');
const { Store, CATEGORIES } = require('./lib/store');
const { gradeQuestion } = require('./lib/grading');

function createApp({ dataDir, adminPassword, sessionSecret, siteName, channelUrl } = {}) {
  const store = new Store(dataDir || path.join(__dirname, 'data'));
  const secret = sessionSecret || crypto
    .createHash('sha256')
    .update(`tonkla:${adminPassword || crypto.randomBytes(16).toString('hex')}`)
    .digest('hex');
  const SESSION_DAYS = 30;

  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '1mb' }));

  // ---------- admin session (signed cookie, no extra deps) ----------
  const sign = (value) => crypto.createHmac('sha256', secret).update(value).digest('hex');

  function readCookie(req, name) {
    const header = req.headers.cookie || '';
    for (const part of header.split(';')) {
      const [k, ...v] = part.trim().split('=');
      if (k === name) return decodeURIComponent(v.join('='));
    }
    return null;
  }

  function isAdmin(req) {
    const token = readCookie(req, 'admin');
    if (!token) return false;
    const [expires, mac] = token.split('.');
    if (!expires || !mac || Number(expires) < Date.now()) return false;
    const expected = sign(expires);
    return mac.length === expected.length
      && crypto.timingSafeEqual(Buffer.from(mac), Buffer.from(expected));
  }

  function requireAdmin(req, res, next) {
    if (!isAdmin(req)) return res.status(401).json({ error: 'Please log in.' });
    next();
  }

  const secure = (req) => req.secure || req.headers['x-forwarded-proto'] === 'https';

  // ---------- helpers ----------
  // What viewers are allowed to see: never the answers.
  function publicQuiz(quiz) {
    return {
      slug: quiz.slug,
      title: quiz.title,
      category: quiz.category,
      videoUrl: quiz.videoUrl,
      description: quiz.description,
      published: quiz.published,
      questions: quiz.questions.map((q) => ({
        id: q.id,
        type: q.type,
        prompt: q.prompt,
        imageUrl: q.imageUrl,
        ...(q.type === 'choice' ? { choices: q.choices } : {}),
      })),
    };
  }

  function summary(quiz) {
    return {
      slug: quiz.slug,
      title: quiz.title,
      category: quiz.category,
      description: quiz.description,
      videoUrl: quiz.videoUrl,
      questionCount: quiz.questions.length,
      updatedAt: quiz.updatedAt,
    };
  }

  function findViewable(req, res) {
    const quiz = store.bySlug(req.params.slug);
    if (!quiz || (!quiz.published && !isAdmin(req))) {
      res.status(404).json({ error: 'Quiz not found.' });
      return null;
    }
    return quiz;
  }

  // ---------- public API ----------
  app.get('/api/quizzes', (req, res) => {
    res.json({
      categories: CATEGORIES,
      quizzes: store.all().filter((q) => q.published).map(summary),
    });
  });

  app.get('/api/quizzes/:slug', (req, res) => {
    const quiz = findViewable(req, res);
    if (quiz) res.json(publicQuiz(quiz));
  });

  // Check one answer: returns whether it's right, the right answer and the explanation.
  app.post('/api/quizzes/:slug/check', (req, res) => {
    const quiz = findViewable(req, res);
    if (!quiz) return;
    const question = quiz.questions.find((q) => q.id === req.body?.questionId);
    if (!question) return res.status(404).json({ error: 'Question not found.' });
    const result = gradeQuestion(question, req.body.answer);
    res.json({ ...result, explanation: question.explanation });
  });

  // Finish the quiz: server re-grades every answer so stats can't be faked.
  app.post('/api/quizzes/:slug/attempts', (req, res) => {
    const quiz = findViewable(req, res);
    if (!quiz) return;
    const answers = req.body?.answers || {};
    let correct = 0;
    for (const q of quiz.questions) {
      if (gradeQuestion(q, answers[q.id]).correct) correct++;
    }
    if (quiz.published && !isAdmin(req)) store.recordAttempt(quiz, correct, quiz.questions.length);
    res.json({ correct, total: quiz.questions.length });
  });

  // ---------- admin API ----------
  app.post('/api/admin/login', (req, res) => {
    if (!adminPassword) {
      return res.status(503).json({ error: 'Admin is disabled. Set the ADMIN_PASSWORD environment variable and restart.' });
    }
    const given = Buffer.from(String(req.body?.password || ''));
    const real = Buffer.from(adminPassword);
    const ok = given.length === real.length && crypto.timingSafeEqual(given, real);
    if (!ok) return res.status(401).json({ error: 'Wrong password.' });
    const expires = String(Date.now() + SESSION_DAYS * 864e5);
    res.setHeader('Set-Cookie', [
      `admin=${expires}.${sign(expires)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_DAYS * 86400}${secure(req) ? '; Secure' : ''}`,
    ]);
    res.json({ ok: true });
  });

  app.post('/api/admin/logout', (req, res) => {
    res.setHeader('Set-Cookie', ['admin=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0']);
    res.json({ ok: true });
  });

  app.get('/api/admin/me', (req, res) => {
    res.json({ loggedIn: isAdmin(req), enabled: Boolean(adminPassword) });
  });

  app.get('/api/admin/quizzes', requireAdmin, (req, res) => {
    res.json({
      categories: CATEGORIES,
      quizzes: store.all().map((q) => ({
        id: q.id,
        ...summary(q),
        published: q.published,
        stats: q.stats,
      })),
    });
  });

  app.get('/api/admin/quizzes/:id', requireAdmin, (req, res) => {
    const quiz = store.byId(req.params.id);
    if (!quiz) return res.status(404).json({ error: 'Quiz not found.' });
    res.json(quiz);
  });

  app.post('/api/admin/quizzes', requireAdmin, (req, res) => {
    try {
      res.status(201).json(store.create(req.body || {}));
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  app.put('/api/admin/quizzes/:id', requireAdmin, (req, res) => {
    try {
      const quiz = store.update(req.params.id, req.body || {});
      if (!quiz) return res.status(404).json({ error: 'Quiz not found.' });
      res.json(quiz);
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  app.delete('/api/admin/quizzes/:id', requireAdmin, (req, res) => {
    if (!store.remove(req.params.id)) return res.status(404).json({ error: 'Quiz not found.' });
    res.json({ ok: true });
  });

  app.use('/api', (req, res) => res.status(404).json({ error: 'Not found.' }));

  // ---------- pages ----------
  const site = { name: siteName || 'Math Practice', channelUrl: channelUrl || '' };
  app.get('/config.js', (req, res) => {
    res.type('application/javascript').send(`window.SITE = ${JSON.stringify(site).replace(/</g, '\\u003c')};`);
  });

  const pub = path.join(__dirname, 'public');
  app.use('/vendor/katex', express.static(path.dirname(require.resolve('katex/dist/katex.min.js')), { maxAge: '30d' }));
  app.use(express.static(pub, { index: false }));
  app.get('/', (req, res) => res.sendFile(path.join(pub, 'index.html')));
  app.get('/q/:slug', (req, res) => res.sendFile(path.join(pub, 'quiz.html')));
  app.get('/admin', (req, res) => res.sendFile(path.join(pub, 'admin.html')));
  app.use((req, res) => res.status(404).sendFile(path.join(pub, 'index.html')));

  return app;
}

if (require.main === module) {
  const port = Number(process.env.PORT) || 3000;
  const adminPassword = process.env.ADMIN_PASSWORD || '';
  const app = createApp({
    dataDir: process.env.DATA_DIR,
    adminPassword,
    sessionSecret: process.env.SESSION_SECRET,
    siteName: process.env.SITE_NAME,
    channelUrl: process.env.CHANNEL_URL,
  });
  app.set('trust proxy', true);
  app.listen(port, () => {
    console.log(`Practice site running at http://localhost:${port}`);
    console.log(`Admin: http://localhost:${port}/admin`);
    if (!adminPassword) console.warn('ADMIN_PASSWORD is not set, so /admin login is disabled.');
  });
}

module.exports = { createApp };
