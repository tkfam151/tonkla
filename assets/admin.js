(function () {
  const app = document.getElementById('app');
  const lockBtn = document.getElementById('logout');
  const STORE_KEY = 'mtonkla-admin';
  const SESSION_KEY = 'mtonkla-admin-session';
  let dirty = false;
  let gh = null; // GitHub client once unlocked

  // ---------------- storage (wrapped: private mode can throw) ----------------
  const store = {
    get(k, session) { try { return JSON.parse((session ? sessionStorage : localStorage).getItem(k)); } catch { return null; } },
    set(k, v, session) { try { (session ? sessionStorage : localStorage).setItem(k, JSON.stringify(v)); } catch { /* ignore */ } },
    del(k, session) { try { (session ? sessionStorage : localStorage).removeItem(k); } catch { /* ignore */ } },
  };

  // ---------------- password encryption of the GitHub token ----------------
  const enc = new TextEncoder();
  const toB64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf)));
  const fromB64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

  async function deriveKey(password, salt) {
    const base = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveKey']);
    return crypto.subtle.deriveKey(
      { name: 'PBKDF2', salt, iterations: 250000, hash: 'SHA-256' },
      base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'],
    );
  }
  async function encryptToken(token, password) {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const key = await deriveKey(password, salt);
    const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(token));
    return { salt: toB64(salt), iv: toB64(iv), ct: toB64(ct) };
  }
  async function decryptToken(saved, password) {
    const key = await deriveKey(password, fromB64(saved.salt));
    const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromB64(saved.iv) }, key, fromB64(saved.ct));
    return new TextDecoder().decode(pt);
  }

  // ---------------- GitHub API ----------------
  function makeGitHub(token, repo, branch) {
    async function req(method, path, body) {
      const res = await fetch(`https://api.github.com${path}`, {
        method,
        cache: 'no-store',
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
          ...(body ? { 'Content-Type': 'application/json' } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const err = new Error(data.message || `GitHub said ${res.status}`);
        err.status = res.status;
        throw err;
      }
      return data;
    }
    const filePath = (p) => `/repos/${repo}/contents/${p.split('/').map(encodeURIComponent).join('/')}`;
    return {
      repo,
      branch,
      req,
      async get(p) {
        try {
          const r = await req('GET', `${filePath(p)}?ref=${encodeURIComponent(branch)}`);
          return { sha: r.sha, data: JSON.parse(b64decode(r.content)) };
        } catch (err) {
          if (err.status === 404) return null;
          throw err;
        }
      },
      put(p, data, message, sha) {
        return req('PUT', filePath(p), {
          message, branch, content: b64encode(`${JSON.stringify(data, null, 2)}\n`), ...(sha ? { sha } : {}),
        });
      },
      del(p, message, sha) {
        return req('DELETE', filePath(p), { message, branch, sha });
      },
    };
  }

  function guessRepo() {
    const host = location.hostname;
    if (host.endsWith('.github.io')) {
      const owner = host.split('.')[0];
      const first = location.pathname.split('/').filter(Boolean)[0];
      return `${owner}/${first && first !== 'admin' ? first : host}`;
    }
    return 'tkfam151/tonkla';
  }

  // ---------------- routing ----------------
  window.addEventListener('beforeunload', (e) => {
    if (dirty) { e.preventDefault(); e.returnValue = ''; }
  });
  window.addEventListener('hashchange', () => {
    if (dirty && !confirm('You have unsaved changes. Leave without saving?')) return;
    dirty = false;
    route();
  });
  lockBtn.addEventListener('click', () => {
    if (dirty && !confirm('You have unsaved changes. Lock anyway?')) return;
    dirty = false;
    gh = null;
    store.del(SESSION_KEY, true);
    location.hash = '';
    route();
  });

  async function route() {
    if (!gh) {
      const session = store.get(SESSION_KEY, true);
      const saved = store.get(STORE_KEY);
      if (session && saved) gh = makeGitHub(session.token, saved.repo, saved.branch);
    }
    lockBtn.hidden = !gh;
    if (!gh) return store.get(STORE_KEY) ? showUnlock() : showSetup();
    const hash = location.hash.replace(/^#\/?/, '');
    if (hash === 'new') return showEditor(null);
    if (hash.startsWith('edit/')) return showEditor(decodeURIComponent(hash.slice(5)));
    return showList();
  }

  function handleAuthError(err) {
    if (err.status === 401) {
      gh = null;
      store.del(SESSION_KEY, true);
      store.del(STORE_KEY);
      dirty = false;
      alert('GitHub no longer accepts your token (it may have expired). Please set up admin again with a new token.');
      route();
      return true;
    }
    return false;
  }

  // ---------------- first-time setup ----------------
  function showSetup() {
    app.innerHTML = `
      <form class="card login" id="setup" style="max-width:520px">
        <img class="login-icon" src="${esc(SITE_ROOT)}assets/logo.svg" alt="">
        <h2>Set up admin on this device</h2>
        <p class="small muted">Quizzes are saved as files in your GitHub repository, so this page needs a GitHub token that can edit it. You only do this once per device.</p>
        <ol class="small" style="padding-left:20px;margin:0 0 16px">
          <li>Open <a href="https://github.com/settings/personal-access-tokens/new" target="_blank" rel="noopener">GitHub → new fine-grained token</a>.</li>
          <li>Under <b>Repository access</b>, choose <b>Only select repositories</b> and pick your quiz repository.</li>
          <li>Under <b>Permissions → Repository permissions</b>, set <b>Contents</b> to <b>Read and write</b>.</li>
          <li>Create it and paste it below.</li>
        </ol>
        <label class="field"><span>Repository</span>
          <input type="text" name="repo" value="${esc(guessRepo())}" required autocomplete="off" placeholder="owner/repository">
        </label>
        <label class="field"><span>GitHub token</span>
          <input type="password" name="token" required autocomplete="off" placeholder="github_pat_…">
        </label>
        <label class="field"><span>Admin password</span>
          <input type="password" name="password" required minlength="4" autocomplete="new-password">
          <div class="hint">You'll type this to open admin. It locks the token on this device and is never uploaded.</div>
        </label>
        <label class="field"><span>Password again</span>
          <input type="password" name="password2" required autocomplete="new-password">
        </label>
        <button class="btn primary" style="width:100%">Connect</button>
        <p class="error" id="setup-error" hidden></p>
      </form>`;
    const form = app.querySelector('#setup');
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const errEl = app.querySelector('#setup-error');
      const btn = form.querySelector('button');
      const show = (m) => { errEl.textContent = m; errEl.hidden = false; btn.disabled = false; btn.textContent = 'Connect'; };
      errEl.hidden = true;
      const repo = form.repo.value.trim();
      const token = form.token.value.trim();
      const password = form.password.value;
      if (!/^[\w.-]+\/[\w.-]+$/.test(repo)) return show('Repository should look like owner/name, for example tkfam151/tonkla.');
      if (password !== form.password2.value) return show('The two passwords are different.');
      btn.disabled = true;
      btn.textContent = 'Checking…';
      try {
        const info = await makeGitHub(token, repo, '').req('GET', `/repos/${repo}`);
        if (info.permissions && !info.permissions.push) return show('This token can read the repository but not edit it. Set Contents to “Read and write”.');
        const branch = info.default_branch;
        const saved = { repo, branch, ...(await encryptToken(token, password)) };
        store.set(STORE_KEY, saved);
        store.set(SESSION_KEY, { token }, true);
        gh = makeGitHub(token, repo, branch);
        toast('Connected to GitHub');
        route();
      } catch (err) {
        if (err.status === 401) return show('GitHub did not accept that token. Check you copied all of it.');
        if (err.status === 404) return show('Repository not found. Check the name, and that the token was given access to it.');
        show(err.message);
      }
    });
  }

  // ---------------- unlock ----------------
  function showUnlock() {
    app.innerHTML = `
      <form class="card login" id="unlock">
        <img class="login-icon" src="${esc(SITE_ROOT)}assets/logo.svg" alt="">
        <h2>Welcome back</h2>
        <label class="field"><span>Password</span>
          <input type="password" name="password" required autocomplete="current-password" autofocus>
        </label>
        <button class="btn primary" style="width:100%">Open</button>
        <p class="error" id="unlock-error" hidden></p>
        <p class="small muted" style="margin:16px 0 0">Forgot the password or need a new token?
          <a href="#" id="reset">Set up again</a></p>
      </form>`;
    const form = app.querySelector('#unlock');
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const saved = store.get(STORE_KEY);
      try {
        const token = await decryptToken(saved, form.password.value);
        store.set(SESSION_KEY, { token }, true);
        gh = makeGitHub(token, saved.repo, saved.branch);
        route();
      } catch {
        const errEl = app.querySelector('#unlock-error');
        errEl.textContent = 'Wrong password.';
        errEl.hidden = false;
      }
    });
    app.querySelector('#reset').addEventListener('click', (e) => {
      e.preventDefault();
      if (!confirm('Remove the saved token from this device and set up again?')) return;
      store.del(STORE_KEY);
      route();
    });
  }

  // ---------------- quiz files ----------------
  const INDEX = 'quizzes/index.json';
  const quizPath = (slug) => `quizzes/${slug}.json`;

  async function loadIndex() {
    const f = await gh.get(INDEX);
    return f || { sha: null, data: { quizzes: [] } };
  }

  // Public file format: answers and explanations are scrambled into `key`.
  function toFile(q) {
    return {
      slug: q.slug,
      title: q.title,
      category: q.category,
      videoUrl: q.videoUrl,
      description: q.description,
      published: q.published,
      updatedAt: new Date().toISOString(),
      questions: q.questions.map((x) => ({
        id: x.id,
        type: x.type,
        prompt: x.prompt,
        imageUrl: x.imageUrl,
        ...(x.hint ? { hint: x.hint } : {}),
        ...(Number.isFinite(x.t) ? { t: x.t } : {}),
        ...(x.type === 'choice' ? { choices: x.choices } : {}),
        key: encodeKey(x.type === 'choice'
          ? { correct: x.correct, explanation: x.explanation }
          : { answers: x.answers, explanation: x.explanation }),
      })),
    };
  }

  function fromFile(f) {
    return {
      ...f,
      questions: (f.questions || []).map((x) => {
        const key = decodeKey(x.key);
        const base = {
          id: x.id, type: x.type, prompt: x.prompt || '', imageUrl: x.imageUrl || '',
          hint: x.hint || '', tText: Number.isFinite(x.t) ? formatTime(x.t) : '', explanation: key.explanation || '',
        };
        return x.type === 'choice'
          ? { ...base, choices: x.choices || [], correct: key.correct ?? 0 }
          : { ...base, answers: key.answers || [] };
      }),
    };
  }

  function summary(f) {
    return {
      slug: f.slug,
      title: f.title,
      category: f.category,
      description: f.description,
      videoUrl: f.videoUrl,
      questionCount: f.questions.length,
      published: f.published,
      updatedAt: f.updatedAt,
    };
  }

  function slugify(t) {
    return String(t).toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
  }

  const newId = () => Array.from(crypto.getRandomValues(new Uint8Array(6)), (b) => b.toString(16).padStart(2, '0')).join('');

  // Check and tidy a quiz before saving. Throws with a friendly message.
  function cleanQuiz(input) {
    const title = String(input.title || '').trim();
    if (!title) throw new Error('Give the quiz a title.');
    const questions = input.questions.map((q, i) => {
      const n = i + 1;
      const prompt = String(q.prompt || '').trim();
      if (!prompt) throw new Error(`Question ${n} needs a question.`);
      const tText = String(q.tText || '').trim();
      const t = parseTime(tText);
      if (tText && t === null) throw new Error(`Question ${n}: write the video time like 3:42.`);
      const base = {
        id: /^[a-f0-9]{12}$/.test(q.id || '') ? q.id : newId(),
        prompt,
        imageUrl: String(q.imageUrl || '').trim(),
        hint: String(q.hint || '').trim(),
        ...(t !== null ? { t } : {}),
        explanation: String(q.explanation || '').trim(),
      };
      if (q.type === 'choice') {
        const choices = q.choices.map((c) => String(c).trim());
        if (choices.length < 2) throw new Error(`Question ${n} needs at least two choices.`);
        if (choices.some((c) => !c)) throw new Error(`Question ${n} has an empty choice.`);
        if (!(q.correct >= 0 && q.correct < choices.length)) throw new Error(`Question ${n}: mark which choice is correct.`);
        return { ...base, type: 'choice', choices, correct: q.correct };
      }
      const answers = (q.answers || []).map((a) => String(a).trim()).filter(Boolean);
      if (!answers.length) throw new Error(`Question ${n} needs at least one accepted answer.`);
      return { ...base, type: 'short', answers };
    });
    return {
      title,
      slug: slugify(input.slug || title) || 'quiz',
      category: CATEGORIES.includes(input.category) ? input.category : 'Other',
      videoUrl: String(input.videoUrl || '').trim(),
      description: String(input.description || '').trim(),
      published: Boolean(input.published),
      questions,
    };
  }

  // ---------------- list ----------------
  async function showList() {
    app.innerHTML = '<p class="muted">Loading your quizzes from GitHub…</p>';
    let index;
    try {
      index = (await loadIndex()).data;
    } catch (err) {
      if (handleAuthError(err)) return;
      app.innerHTML = `<p class="error">${esc(err.message)}</p><button class="btn" onclick="location.reload()">Try again</button>`;
      return;
    }
    const quizzes = index.quizzes || [];

    const rows = quizzes.map((q) => `
      <div class="quiz-row">
        <div>
          <div class="title">
            <span>${esc(q.title)}</span>
            <span class="tag" data-cat="${esc(q.category)}">${esc(q.category)}</span>
            <span class="status ${q.published ? 'live' : 'draft'}">${q.published ? 'Live' : 'Draft'}</span>
          </div>
          <div class="sub">${q.questionCount} question${q.questionCount === 1 ? '' : 's'} · ?q=${esc(q.slug)}</div>
        </div>
        <div class="row-actions">
          <button class="btn sm" data-copy="${esc(q.slug)}">Copy link</button>
          <button class="btn sm" data-qr="${esc(q.slug)}" data-title="${esc(q.title)}">QR code</button>
          <a class="btn sm" href="${esc(quizLink(q.slug))}" target="_blank" rel="noopener">Open</a>
          <a class="btn sm primary" href="#/edit/${encodeURIComponent(q.slug)}">Edit</a>
        </div>
      </div>`).join('');

    app.innerHTML = `
      <div class="admin-top">
        <h1>Your quizzes</h1>
        <a class="btn primary" href="#/new">+ New quiz</a>
      </div>
      <p class="small muted" style="margin-top:-8px">Saved to <b>${esc(gh.repo)}</b>. Changes appear on the site about a minute after you save.</p>
      ${quizzes.length
        ? `<div class="card table">${rows}</div>`
        : `<div class="card empty">No quizzes yet. Make one for your latest video.<br><br><a class="btn primary" href="#/new">+ New quiz</a></div>`}`;

    app.querySelectorAll('[data-qr]').forEach((btn) => {
      btn.addEventListener('click', () => showShareModal(btn.dataset.qr, btn.dataset.title, 'qr'));
    });
    app.querySelectorAll('[data-copy]').forEach((btn) => {
      btn.addEventListener('click', () => {
        copyText(quizLink(btn.dataset.copy));
        const row = quizzes.find((q) => q.slug === btn.dataset.copy);
        if (row && !row.published) setTimeout(() => toast('Note: this quiz is a draft, so it isn’t listed on the home page', 3000), 1900);
      });
    });
  }

  // ---------------- editor ----------------
  const blankQuestion = (type = 'choice') => (type === 'choice'
    ? { type: 'choice', prompt: '', choices: ['', '', '', ''], correct: 0, explanation: '', imageUrl: '', hint: '', tText: '' }
    : { type: 'short', prompt: '', answers: [], explanation: '', imageUrl: '', hint: '', tText: '' });

  async function showEditor(slug) {
    let quiz;
    if (slug) {
      app.innerHTML = '<p class="muted">Loading…</p>';
      try {
        const f = await gh.get(quizPath(slug));
        if (!f) throw Object.assign(new Error('Quiz not found.'), { status: 404 });
        quiz = fromFile(f.data);
      } catch (err) {
        if (handleAuthError(err)) return;
        app.innerHTML = `<p class="error">${esc(err.message)}</p><a class="btn" href="#/">Back</a>`;
        return;
      }
    } else {
      quiz = {
        title: '', slug: '', category: CATEGORIES[0], videoUrl: '', description: '',
        published: true, questions: [blankQuestion()],
      };
    }
    const draft = JSON.parse(JSON.stringify(quiz));
    let savedSlug = slug; // slug of the file on GitHub, null until first save
    let slugTouched = Boolean(slug);
    let justSaved = false;
    let saving = false;

    function render() {
      const scrollY = window.scrollY;
      app.innerHTML = `
        <div class="admin-top">
          <h1>${savedSlug ? 'Edit quiz' : 'New quiz'}</h1>
          <a class="btn" href="#/">← All quizzes</a>
        </div>

        ${savedSlug ? `
          <div class="share">
            <b>${justSaved ? 'Saved! ' : ''}Share link:</b>
            <code>${esc(quizLink(savedSlug))}</code>
            <div class="share-tools">
              <button class="btn sm" id="copy-link">Copy</button>
              <button class="btn sm" id="show-qr">QR code</button>
              <button class="btn sm" id="show-desc">Text for description</button>
              <a class="btn sm" href="${esc(quizLink(savedSlug))}" target="_blank" rel="noopener">Open</a>
            </div>
          </div>
          ${justSaved ? '<div class="notice">GitHub Pages takes about a minute to publish. If the link shows old content, wait a moment and refresh.</div>' : ''}` : ''}

        <section class="card section">
          <label class="field"><span>Title</span>
            <input type="text" id="f-title" value="${esc(draft.title)}" placeholder="e.g. AMC 8 2024 #15: Counting paths" maxlength="200">
          </label>
          <div class="row2">
            <label class="field"><span>Level</span>
              <select id="f-category">${CATEGORIES.map((c) => `<option ${c === draft.category ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select>
            </label>
            <label class="field"><span>Link name</span>
              <input type="text" id="f-slug" value="${esc(draft.slug)}" placeholder="made from the title">
              <div class="hint">…/quiz.html?q=<b id="slug-preview">${esc(slugify(draft.slug || draft.title) || '…')}</b></div>
            </label>
          </div>
          <label class="field"><span>YouTube video link</span>
            <input type="url" id="f-video" value="${esc(draft.videoUrl)}" placeholder="https://youtu.be/…">
            <div class="hint" id="video-hint">${videoHint(draft.videoUrl)}</div>
          </label>
          <label class="field"><span>Short description</span>
            <textarea id="f-desc" rows="2" placeholder="What these problems practise">${esc(draft.description)}</textarea>
          </label>
          <label class="switch"><input type="checkbox" id="f-published" ${draft.published ? 'checked' : ''}> Show on the home page</label>
          <div class="hint">Untick to keep it as a draft. Anyone with the link can still open it.</div>
        </section>

        <h2 style="margin-top:28px">Questions <span class="muted small">(${draft.questions.length})</span></h2>
        <p class="hint" style="margin:-6px 0 14px">Write math between dollar signs: <code>$\\frac{3}{4}$</code>, <code>$x^2 + 1$</code>, or <code>$$...$$</code> for a centered line.</p>
        <div id="questions">${draft.questions.map(questionHtml).join('')}</div>
        <div class="actions" style="margin-top:0">
          <button class="btn" id="add-choice">+ Multiple choice</button>
          <button class="btn" id="add-short">+ Short answer</button>
        </div>

        <div class="sticky-save">
          <button class="btn primary" id="save" ${saving ? 'disabled' : ''}>${saving ? 'Saving…' : (savedSlug ? 'Save changes' : 'Create quiz')}</button>
          ${savedSlug ? '<span class="spacer" style="flex:1"></span><button class="btn danger" id="delete">Delete quiz</button>' : ''}
          <p class="error" id="save-error" hidden style="width:100%;margin:0"></p>
        </div>`;
      renderMath(app.querySelector('#questions'));
      window.scrollTo(0, scrollY);
      wire();
    }

    function questionHtml(q, i) {
      const n = draft.questions.length;
      const body = q.type === 'choice'
        ? `<div class="field"><span style="display:block;font-weight:600;font-size:14px;margin-bottom:6px">Choices <span class="muted" style="font-weight:400">(select the correct one)</span></span>
            ${q.choices.map((c, ci) => `
              <div class="choice-edit">
                <input type="radio" name="correct-${i}" data-q="${i}" data-correct="${ci}" ${q.correct === ci ? 'checked' : ''} aria-label="Choice ${LETTERS[ci]} is correct">
                <span class="letter">${LETTERS[ci]}</span>
                <input type="text" data-q="${i}" data-choice="${ci}" value="${esc(c)}" placeholder="Choice ${LETTERS[ci]}">
                <button class="btn sm ghost" data-q="${i}" data-remove-choice="${ci}" ${q.choices.length <= 2 ? 'disabled' : ''} aria-label="Remove choice ${LETTERS[ci]}">✕</button>
              </div>`).join('')}
            ${q.choices.length < LETTERS.length ? `<button class="btn sm" data-q="${i}" data-add-choice>+ Add choice</button>` : ''}
          </div>`
        : `<label class="field"><span>Accepted answers (one per line)</span>
            <textarea data-q="${i}" data-field="answers" rows="2" placeholder="e.g. 3/4">${esc((q.answers || []).join('\n'))}</textarea>
            <div class="hint">Numbers match any equal form, so <code>3/4</code> also accepts 0.75. Text ignores capital letters and extra spaces.</div>
          </label>`;
      return `
        <section class="card q-card">
          <div class="q-card-head">
            <span class="num">Q${i + 1}</span>
            <div class="seg" role="group" aria-label="Question type">
              <button data-q="${i}" data-type="choice" aria-pressed="${q.type === 'choice'}">Multiple choice</button>
              <button data-q="${i}" data-type="short" aria-pressed="${q.type === 'short'}">Short answer</button>
            </div>
            <button class="btn sm ghost" data-q="${i}" data-move="-1" ${i === 0 ? 'disabled' : ''} aria-label="Move up">↑</button>
            <button class="btn sm ghost" data-q="${i}" data-move="1" ${i === n - 1 ? 'disabled' : ''} aria-label="Move down">↓</button>
            <button class="btn sm ghost" data-q="${i}" data-dup aria-label="Duplicate">⧉</button>
            <button class="btn sm ghost danger" data-q="${i}" data-del aria-label="Delete question">✕</button>
          </div>
          <label class="field"><span>Question</span>
            <textarea data-q="${i}" data-field="prompt" rows="3" placeholder="Type the problem…">${esc(q.prompt)}</textarea>
            <div class="preview" data-preview="${i}">${/\$|\\\(|\\\[/.test(q.prompt) ? rich(q.prompt) : ''}</div>
          </label>
          <div class="row2">
            <label class="field"><span>Image link <span class="muted" style="font-weight:400">(optional, for diagrams)</span></span>
              <input type="url" data-q="${i}" data-field="imageUrl" value="${esc(q.imageUrl || '')}" placeholder="https://…/figure.png">
            </label>
            <label class="field"><span>Video time <span class="muted" style="font-weight:400">(optional)</span></span>
              <input type="text" class="time-input" data-q="${i}" data-field="tText" value="${esc(q.tText || '')}" placeholder="3:42" inputmode="numeric">
              <div class="hint" data-time-hint="${i}">${timeHint(q.tText)}</div>
            </label>
          </div>
          ${body}
          <label class="field"><span>Hint <span class="muted" style="font-weight:400">(optional, shown if the viewer asks)</span></span>
            <textarea data-q="${i}" data-field="hint" rows="1" placeholder="A nudge, not the answer">${esc(q.hint || '')}</textarea>
          </label>
          <label class="field" style="margin-bottom:0"><span>Explanation <span class="muted" style="font-weight:400">(shown after answering)</span></span>
            <textarea data-q="${i}" data-field="explanation" rows="2" placeholder="How to solve it">${esc(q.explanation)}</textarea>
          </label>
        </section>`;
    }

    function timeHint(text) {
      const t = parseTime(text);
      if (!String(text || '').trim()) return 'Where this is explained. Adds a “Watch” button.';
      return t === null ? 'Write it like 3:42 or 1:02:30.' : `✓ Viewers can jump to ${formatTime(t)}.`;
    }

    function videoHint(url) {
      if (!url) return 'Viewers can watch it right above the questions.';
      return youtubeId(url) ? '✓ Video found. It will show above the questions.' : 'That doesn’t look like a YouTube link. It will be shown as a plain link.';
    }

    const touch = () => { dirty = true; justSaved = false; };

    function wire() {
      const $ = (sel) => app.querySelector(sel);
      $('#f-title').addEventListener('input', (e) => {
        draft.title = e.target.value; touch();
        if (!slugTouched) {
          draft.slug = slugify(draft.title);
          $('#f-slug').value = draft.slug;
        }
        $('#slug-preview').textContent = slugify(draft.slug || draft.title) || '…';
      });
      $('#f-slug').addEventListener('input', (e) => {
        slugTouched = true; draft.slug = e.target.value; touch();
        $('#slug-preview').textContent = slugify(draft.slug || draft.title) || '…';
      });
      $('#f-category').addEventListener('change', (e) => { draft.category = e.target.value; touch(); });
      $('#f-video').addEventListener('input', (e) => {
        draft.videoUrl = e.target.value; touch();
        $('#video-hint').textContent = videoHint(draft.videoUrl);
      });
      $('#f-desc').addEventListener('input', (e) => { draft.description = e.target.value; touch(); });
      $('#f-published').addEventListener('change', (e) => { draft.published = e.target.checked; touch(); });
      $('#copy-link')?.addEventListener('click', () => copyText(quizLink(savedSlug)));
      $('#show-qr')?.addEventListener('click', () => showShareModal(savedSlug, quiz.title, 'qr'));
      $('#show-desc')?.addEventListener('click', () => showShareModal(savedSlug, quiz.title, 'desc'));

      const qs = $('#questions');
      const previewTimers = {};
      qs.addEventListener('input', (e) => {
        const el = e.target;
        const i = Number(el.dataset.q);
        const q = draft.questions[i];
        if (!q) return;
        touch();
        if (el.dataset.field === 'answers') q.answers = el.value.split('\n');
        else if (el.dataset.field) q[el.dataset.field] = el.value;
        else if (el.dataset.choice !== undefined) q.choices[Number(el.dataset.choice)] = el.value;
        if (el.dataset.field === 'tText') {
          qs.querySelector(`[data-time-hint="${i}"]`).textContent = timeHint(q.tText);
        }
        if (el.dataset.field === 'prompt') {
          clearTimeout(previewTimers[i]);
          previewTimers[i] = setTimeout(() => {
            const pv = qs.querySelector(`[data-preview="${i}"]`);
            pv.innerHTML = /\$|\\\(|\\\[/.test(q.prompt) ? rich(q.prompt) : '';
            renderMath(pv);
          }, 250);
        }
      });
      qs.addEventListener('change', (e) => {
        const el = e.target;
        if (el.dataset.correct !== undefined) {
          draft.questions[Number(el.dataset.q)].correct = Number(el.dataset.correct);
          touch();
        }
      });
      qs.addEventListener('click', (e) => {
        const el = e.target.closest('button');
        if (!el || el.dataset.q === undefined) return;
        const i = Number(el.dataset.q);
        const q = draft.questions[i];
        if (el.dataset.type) {
          if (q.type === el.dataset.type) return;
          const fresh = blankQuestion(el.dataset.type);
          draft.questions[i] = {
            ...fresh, id: q.id, prompt: q.prompt, explanation: q.explanation, imageUrl: q.imageUrl, hint: q.hint, tText: q.tText,
          };
        } else if (el.dataset.move) {
          const j = i + Number(el.dataset.move);
          [draft.questions[i], draft.questions[j]] = [draft.questions[j], draft.questions[i]];
        } else if (el.dataset.dup !== undefined) {
          const copy = JSON.parse(JSON.stringify(q));
          delete copy.id;
          draft.questions.splice(i + 1, 0, copy);
        } else if (el.dataset.del !== undefined) {
          if ((q.prompt || '').trim() && !confirm(`Delete question ${i + 1}?`)) return;
          draft.questions.splice(i, 1);
        } else if (el.dataset.addChoice !== undefined) {
          q.choices.push('');
        } else if (el.dataset.removeChoice !== undefined) {
          const ci = Number(el.dataset.removeChoice);
          q.choices.splice(ci, 1);
          if (q.correct === ci) q.correct = 0;
          else if (q.correct > ci) q.correct--;
        } else {
          return;
        }
        touch();
        render();
      });

      const add = (type) => {
        draft.questions.push(blankQuestion(type));
        touch();
        render();
        const cards = app.querySelectorAll('.q-card');
        const last = cards[cards.length - 1];
        last.scrollIntoView({ behavior: 'smooth', block: 'center' });
        last.querySelector('[data-field="prompt"]').focus({ preventScroll: true });
      };
      $('#add-choice').addEventListener('click', () => add('choice'));
      $('#add-short').addEventListener('click', () => add('short'));

      $('#save').addEventListener('click', save);
      $('#delete')?.addEventListener('click', remove);
    }

    function showError(msg) {
      const errEl = app.querySelector('#save-error');
      errEl.textContent = msg;
      errEl.hidden = false;
    }

    async function save() {
      let clean;
      try {
        clean = cleanQuiz(draft);
      } catch (err) {
        return showError(err.message);
      }
      if (!clean.questions.length) return showError('Add at least one question.');
      saving = true;
      render();
      try {
        const index = await loadIndex();
        const list = index.data.quizzes || [];
        // Pick a link name no other quiz is using.
        let slugName = clean.slug;
        for (let n = 2; list.some((q) => q.slug === slugName && q.slug !== savedSlug); n++) slugName = `${clean.slug}-${n}`;
        clean.slug = slugName;

        const file = toFile(clean);
        const existing = await gh.get(quizPath(slugName));
        const verb = savedSlug ? 'Update' : 'Add';
        await gh.put(quizPath(slugName), file, `${verb} quiz: ${clean.title}`, existing?.sha);
        if (savedSlug && savedSlug !== slugName) {
          const old = await gh.get(quizPath(savedSlug));
          if (old) await gh.del(quizPath(savedSlug), `Rename quiz: ${savedSlug} → ${slugName}`, old.sha);
        }

        const entry = summary(file);
        const pos = list.findIndex((q) => q.slug === (savedSlug || slugName));
        const next = list.filter((q) => q.slug !== savedSlug && q.slug !== slugName);
        next.splice(pos >= 0 ? pos : 0, 0, entry);
        await putIndexWithRetry(index, next, `${verb} quiz: ${clean.title}`);

        Object.assign(draft, fromFile(file));
        quiz = JSON.parse(JSON.stringify(draft));
        savedSlug = slugName;
        slugTouched = true;
        justSaved = true;
        dirty = false;
        saving = false;
        history.replaceState(null, '', `#/edit/${encodeURIComponent(slugName)}`);
        render();
        window.scrollTo({ top: 0, behavior: 'smooth' });
        toast('Saved to GitHub');
      } catch (err) {
        saving = false;
        if (handleAuthError(err)) return;
        render();
        showError(`Could not save: ${err.message}`);
      }
    }

    async function remove() {
      if (!confirm(`Delete “${quiz.title}”? Its link will stop working. This can’t be undone.`)) return;
      try {
        const f = await gh.get(quizPath(savedSlug));
        if (f) await gh.del(quizPath(savedSlug), `Delete quiz: ${quiz.title}`, f.sha);
        const index = await loadIndex();
        await putIndexWithRetry(index, (index.data.quizzes || []).filter((q) => q.slug !== savedSlug), `Delete quiz: ${quiz.title}`);
        dirty = false;
        toast('Quiz deleted');
        location.hash = '#/';
      } catch (err) {
        if (handleAuthError(err)) return;
        showError(`Could not delete: ${err.message}`);
      }
    }

    render();
  }

  // ---------------- share: QR code & description text ----------------
  // Draws the quiz link as a QR code with the logo in the middle.
  async function drawQR(url, size) {
    const qr = qrcode(0, 'H'); // high error correction leaves room for the logo
    qr.addData(url);
    qr.make();
    const count = qr.getModuleCount();
    const quiet = 3;
    const cell = Math.floor(size / (count + quiet * 2));
    const real = cell * (count + quiet * 2);
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = real;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, real, real);
    ctx.fillStyle = '#111';
    for (let r = 0; r < count; r++) {
      for (let c = 0; c < count; c++) {
        if (qr.isDark(r, c)) ctx.fillRect((c + quiet) * cell, (r + quiet) * cell, cell, cell);
      }
    }
    const logo = new Image();
    logo.src = `${SITE_ROOT}assets/logo.svg`;
    await logo.decode().catch(() => {});
    if (logo.complete && logo.naturalWidth) {
      const ls = Math.round(real * 0.2);
      const pad = Math.round(ls * 0.12);
      const x = (real - ls) / 2;
      ctx.fillStyle = '#fff';
      roundRect(ctx, x - pad, x - pad, ls + pad * 2, ls + pad * 2, (ls + pad * 2) * 0.24);
      ctx.drawImage(logo, x, x, ls, ls);
    }
    return canvas;
  }
  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
    ctx.fill();
  }

  async function showShareModal(slug, title, mode) {
    const url = quizLink(slug);
    const desc = `📝 Practice problems for this video: ${url}\nTry them yourself and see the step-by-step answers.`;
    const back = document.createElement('div');
    back.className = 'modal-backdrop';
    back.innerHTML = mode === 'qr' ? `
      <div class="modal" role="dialog" aria-modal="true" aria-label="QR code">
        <h2>QR code</h2>
        <p class="small muted">Put this on screen in your video. Viewers point their phone camera at it to open the quiz.</p>
        <div class="qr"></div>
        <div class="actions">
          <button class="btn primary" id="qr-download">Download PNG</button>
          <button class="btn" data-close>Done</button>
        </div>
      </div>` : `
      <div class="modal" role="dialog" aria-modal="true" aria-label="Text for description">
        <h2>Text for your video</h2>
        <p class="small muted">Paste this into the video description or a pinned comment.</p>
        <textarea rows="4" readonly>${esc(desc)}</textarea>
        <div class="actions">
          <button class="btn primary" id="desc-copy">Copy text</button>
          <button class="btn" data-close>Done</button>
        </div>
      </div>`;
    document.body.appendChild(back);
    const close = () => { back.remove(); document.removeEventListener('keydown', onKey); };
    const onKey = (e) => { if (e.key === 'Escape') close(); };
    document.addEventListener('keydown', onKey);
    back.addEventListener('click', (e) => { if (e.target === back || e.target.closest('[data-close]')) close(); });
    if (mode === 'qr') {
      const preview = await drawQR(url, 520);
      back.querySelector('.qr').appendChild(preview);
      back.querySelector('#qr-download').addEventListener('click', async () => {
        const big = await drawQR(url, 1200);
        const a = document.createElement('a');
        a.href = big.toDataURL('image/png');
        a.download = `${slug}-qr.png`;
        a.click();
      });
      back.querySelector('#qr-download').focus();
    } else {
      back.querySelector('#desc-copy').addEventListener('click', async () => {
        await copyText(desc);
        toast('Text copied');
      });
      back.querySelector('#desc-copy').focus();
    }
  }

  // Write the quiz list. If it changed on GitHub meanwhile, reload and try once more.
  async function putIndexWithRetry(index, quizzes, message) {
    try {
      await gh.put(INDEX, { quizzes }, message, index.sha);
    } catch (err) {
      if (err.status !== 409 && err.status !== 422) throw err;
      const fresh = await loadIndex();
      await gh.put(INDEX, { quizzes }, message, fresh.sha);
    }
  }

  route();
})();
