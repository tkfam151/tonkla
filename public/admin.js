(function () {
  const app = document.getElementById('app');
  const logoutBtn = document.getElementById('logout');
  let categories = ['Olympiad', 'Grade 6', 'Grade 7', 'Other'];
  let dirty = false;

  const quizUrl = (slug) => `${location.origin}/q/${encodeURIComponent(slug)}`;

  window.addEventListener('beforeunload', (e) => {
    if (dirty) { e.preventDefault(); e.returnValue = ''; }
  });

  logoutBtn.addEventListener('click', async () => {
    await api('POST', '/api/admin/logout').catch(() => {});
    location.hash = '';
    route();
  });

  async function route() {
    let me;
    try {
      me = await api('GET', '/api/admin/me');
    } catch {
      app.innerHTML = '<p class="error">Could not reach the server.</p>';
      return;
    }
    logoutBtn.hidden = !me.loggedIn;
    if (!me.loggedIn) return showLogin(me.enabled);

    const hash = location.hash.replace(/^#\/?/, '');
    if (hash === 'new') return showEditor(null);
    if (hash.startsWith('edit/')) return showEditor(hash.slice(5));
    return showList();
  }

  window.addEventListener('hashchange', () => {
    if (dirty && !confirm('You have unsaved changes. Leave without saving?')) return;
    dirty = false;
    route();
  });

  // ---------------- login ----------------
  function showLogin(enabled) {
    app.innerHTML = `
      <form class="card login" id="login">
        <h2>Admin login</h2>
        ${enabled ? '' : '<p class="error">Admin is turned off. Set the <code>ADMIN_PASSWORD</code> environment variable on the server and restart it.</p>'}
        <label class="field"><span>Password</span>
          <input type="password" name="password" autocomplete="current-password" required ${enabled ? 'autofocus' : 'disabled'}>
        </label>
        <button class="btn primary" style="width:100%" ${enabled ? '' : 'disabled'}>Log in</button>
        <p class="error" id="login-error" hidden></p>
      </form>`;
    app.querySelector('#login').addEventListener('submit', async (e) => {
      e.preventDefault();
      const errEl = app.querySelector('#login-error');
      try {
        await api('POST', '/api/admin/login', { password: e.target.password.value });
        route();
      } catch (err) {
        errEl.textContent = err.message;
        errEl.hidden = false;
      }
    });
  }

  // ---------------- list ----------------
  async function showList() {
    app.innerHTML = '<p class="muted">Loading…</p>';
    let data;
    try {
      data = await api('GET', '/api/admin/quizzes');
    } catch (err) {
      if (err.status === 401) return route();
      app.innerHTML = `<p class="error">${esc(err.message)}</p>`;
      return;
    }
    categories = data.categories;

    const rows = data.quizzes.map((q) => {
      const s = q.stats || {};
      const avg = s.totalQuestions ? Math.round((s.totalCorrect / s.totalQuestions) * 100) : null;
      return `
        <div class="quiz-row">
          <div>
            <div class="title">
              <span>${esc(q.title)}</span>
              <span class="tag" data-cat="${esc(q.category)}">${esc(q.category)}</span>
              <span class="status ${q.published ? 'live' : 'draft'}">${q.published ? 'Live' : 'Draft'}</span>
            </div>
            <div class="sub">
              ${q.questionCount} question${q.questionCount === 1 ? '' : 's'}
              · ${s.attempts || 0} attempt${s.attempts === 1 ? '' : 's'}${avg === null ? '' : ` · avg ${avg}%`}
              · /q/${esc(q.slug)}
            </div>
          </div>
          <div class="row-actions">
            <button class="btn sm" data-copy="${esc(q.slug)}" ${q.published ? '' : 'title="Publish the quiz before sharing it"'}>Copy link</button>
            <a class="btn sm" href="/q/${encodeURIComponent(q.slug)}" target="_blank" rel="noopener">${q.published ? 'Open' : 'Preview'}</a>
            <a class="btn sm primary" href="#/edit/${q.id}">Edit</a>
          </div>
        </div>`;
    }).join('');

    app.innerHTML = `
      <div class="admin-top">
        <h1>Your quizzes</h1>
        <a class="btn primary" href="#/new">+ New quiz</a>
      </div>
      ${data.quizzes.length
        ? `<div class="card table">${rows}</div>`
        : `<div class="card empty">No quizzes yet. Make one for your latest video.<br><br><a class="btn primary" href="#/new">+ New quiz</a></div>`}`;

    app.querySelectorAll('[data-copy]').forEach((btn) => {
      btn.addEventListener('click', () => {
        copyText(quizUrl(btn.dataset.copy));
        const row = data.quizzes.find((q) => q.slug === btn.dataset.copy);
        if (row && !row.published) setTimeout(() => toast('Copied, but this quiz is a draft: viewers will not see it yet'), 1900);
      });
    });
  }

  // ---------------- editor ----------------
  const blankQuestion = (type = 'choice') => (type === 'choice'
    ? { type: 'choice', prompt: '', choices: ['', '', '', ''], correct: 0, explanation: '', imageUrl: '' }
    : { type: 'short', prompt: '', answers: [], explanation: '', imageUrl: '' });

  async function showEditor(id) {
    let quiz;
    if (id) {
      app.innerHTML = '<p class="muted">Loading…</p>';
      try {
        quiz = await api('GET', `/api/admin/quizzes/${encodeURIComponent(id)}`);
      } catch (err) {
        if (err.status === 401) return route();
        app.innerHTML = `<p class="error">${esc(err.message)}</p><a class="btn" href="#/">Back</a>`;
        return;
      }
    } else {
      quiz = {
        title: '', slug: '', category: categories[0], videoUrl: '', description: '',
        published: false, questions: [blankQuestion()],
      };
    }
    // Work on a copy; questions get a temporary key for re-rendering.
    const draft = JSON.parse(JSON.stringify(quiz));
    let slugTouched = Boolean(id);
    let justSaved = false;

    function render() {
      const scrollY = window.scrollY;
      app.innerHTML = `
        <div class="admin-top">
          <h1>${id ? 'Edit quiz' : 'New quiz'}</h1>
          <a class="btn" href="#/">← All quizzes</a>
        </div>

        ${id && draft.published ? `
          <div class="share">
            <b>${justSaved ? 'Saved! ' : ''}Share link:</b>
            <code>${esc(quizUrl(quiz.slug))}</code>
            <button class="btn sm" id="copy-link">Copy</button>
            <a class="btn sm" href="/q/${encodeURIComponent(quiz.slug)}" target="_blank" rel="noopener">Open</a>
          </div>` : ''}
        ${id && !draft.published ? `
          <div class="notice">${justSaved ? '<b>Saved as a draft.</b> ' : ''}This quiz is a draft. Turn on “Published” and save to get a link viewers can open.
            <a href="/q/${encodeURIComponent(quiz.slug)}" target="_blank" rel="noopener">Preview it</a></div>` : ''}

        <section class="card section">
          <label class="field"><span>Title</span>
            <input type="text" id="f-title" value="${esc(draft.title)}" placeholder="e.g. AMC 8 2024 #15: Counting paths" maxlength="200">
          </label>
          <div class="row2">
            <label class="field"><span>Level</span>
              <select id="f-category">${categories.map((c) => `<option ${c === draft.category ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select>
            </label>
            <label class="field"><span>Link name</span>
              <input type="text" id="f-slug" value="${esc(draft.slug)}" placeholder="made from the title">
              <div class="hint">${esc(location.origin)}/q/<b id="slug-preview">${esc(draft.slug || slugify(draft.title) || '…')}</b></div>
            </label>
          </div>
          <label class="field"><span>YouTube video link</span>
            <input type="url" id="f-video" value="${esc(draft.videoUrl)}" placeholder="https://youtu.be/…">
            <div class="hint" id="video-hint">${videoHint(draft.videoUrl)}</div>
          </label>
          <label class="field"><span>Short description</span>
            <textarea id="f-desc" rows="2" placeholder="What these problems practise">${esc(draft.description)}</textarea>
          </label>
          <label class="switch"><input type="checkbox" id="f-published" ${draft.published ? 'checked' : ''}> Published (viewers can open the link)</label>
        </section>

        <h2 style="margin-top:28px">Questions <span class="muted small">(${draft.questions.length})</span></h2>
        <p class="hint" style="margin:-6px 0 14px">Write math between dollar signs: <code>$\\frac{3}{4}$</code>, <code>$x^2 + 1$</code>, or <code>$$...$$</code> for a centered line.</p>
        <div id="questions">${draft.questions.map(questionHtml).join('')}</div>
        <div class="actions" style="margin-top:0">
          <button class="btn" id="add-choice">+ Multiple choice</button>
          <button class="btn" id="add-short">+ Short answer</button>
        </div>

        <div class="sticky-save">
          <button class="btn primary" id="save">${id ? 'Save changes' : 'Create quiz'}</button>
          ${id ? '<span class="spacer" style="flex:1"></span><button class="btn danger" id="delete">Delete quiz</button>' : ''}
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
            <div class="preview" data-preview="${i}">${q.prompt.includes('$') || q.prompt.includes('\\(') ? rich(q.prompt) : ''}</div>
          </label>
          <label class="field"><span>Image link <span class="muted" style="font-weight:400">(optional, for diagrams)</span></span>
            <input type="url" data-q="${i}" data-field="imageUrl" value="${esc(q.imageUrl || '')}" placeholder="https://…/figure.png">
          </label>
          ${body}
          <label class="field" style="margin-bottom:0"><span>Explanation <span class="muted" style="font-weight:400">(shown after answering)</span></span>
            <textarea data-q="${i}" data-field="explanation" rows="2" placeholder="How to solve it">${esc(q.explanation)}</textarea>
          </label>
        </section>`;
    }

    function videoHint(url) {
      if (!url) return 'Viewers can watch it right above the questions.';
      return youtubeId(url) ? '✓ Video found. It will show above the questions.' : 'That doesn’t look like a YouTube link. It will be shown as a plain link.';
    }

    function slugify(t) {
      return String(t).toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '')
        .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
    }

    const touch = () => { dirty = true; justSaved = false; };

    function wire() {
      const $ = (sel) => app.querySelector(sel);
      $('#f-title').addEventListener('input', (e) => {
        draft.title = e.target.value; touch();
        if (!slugTouched) {
          draft.slug = slugify(draft.title);
          $('#f-slug').value = draft.slug;
          $('#slug-preview').textContent = draft.slug || '…';
        }
      });
      $('#f-slug').addEventListener('input', (e) => {
        slugTouched = true; draft.slug = e.target.value; touch();
        $('#slug-preview').textContent = slugify(draft.slug) || slugify(draft.title) || '…';
      });
      $('#f-category').addEventListener('change', (e) => { draft.category = e.target.value; touch(); });
      $('#f-video').addEventListener('input', (e) => {
        draft.videoUrl = e.target.value; touch();
        $('#video-hint').textContent = videoHint(draft.videoUrl);
      });
      $('#f-desc').addEventListener('input', (e) => { draft.description = e.target.value; touch(); });
      $('#f-published').addEventListener('change', (e) => { draft.published = e.target.checked; touch(); });
      $('#copy-link')?.addEventListener('click', () => copyText(quizUrl(quiz.slug)));

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
          draft.questions[i] = { ...fresh, id: q.id, prompt: q.prompt, explanation: q.explanation, imageUrl: q.imageUrl };
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
      $('#delete')?.addEventListener('click', async () => {
        if (!confirm(`Delete “${quiz.title}”? Its link will stop working. This can’t be undone.`)) return;
        try {
          await api('DELETE', `/api/admin/quizzes/${encodeURIComponent(id)}`);
          dirty = false;
          toast('Quiz deleted');
          location.hash = '#/';
        } catch (err) {
          toast(err.message);
        }
      });
    }

    async function save() {
      const btn = app.querySelector('#save');
      const errEl = app.querySelector('#save-error');
      errEl.hidden = true;
      btn.disabled = true;
      const payload = {
        ...draft,
        questions: draft.questions.map((q) => ({
          ...q,
          answers: q.type === 'short' ? (q.answers || []).map((a) => a.trim()).filter(Boolean) : undefined,
        })),
      };
      try {
        const saved = id
          ? await api('PUT', `/api/admin/quizzes/${encodeURIComponent(id)}`, payload)
          : await api('POST', '/api/admin/quizzes', payload);
        dirty = false;
        if (!id) {
          // Switch to editing the new quiz so the share link shows.
          history.replaceState(null, '', `#/edit/${saved.id}`);
          id = saved.id;
        }
        quiz = saved;
        Object.assign(draft, JSON.parse(JSON.stringify(saved)));
        slugTouched = true;
        justSaved = true;
        render();
        window.scrollTo({ top: 0, behavior: 'smooth' });
        toast(saved.published ? 'Saved. Your link is ready' : 'Saved as draft');
      } catch (err) {
        if (err.status === 401) { dirty = false; return route(); }
        errEl.textContent = err.message;
        errEl.hidden = false;
        btn.disabled = false;
      }
    }

    render();
  }

  route();
})();
