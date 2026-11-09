(async function () {
  const app = document.getElementById('app');
  const slug = new URLSearchParams(location.search).get('q') || '';

  let quiz;
  try {
    if (!/^[a-z0-9-]+$/.test(slug)) throw new Error('bad slug');
    quiz = await getJSON(`quizzes/${slug}.json`);
  } catch (err) {
    app.innerHTML = `
      <h1>Quiz not found</h1>
      <p class="lede">This link may be old, or the quiz isn't published yet.</p>
      <a class="btn primary" href="${esc(SITE_ROOT)}">See all practice quizzes</a>`;
    return;
  }

  document.title = `${quiz.title} · Practice`;
  const vid = youtubeId(quiz.videoUrl);
  const state = { index: 0, selected: null, answers: {}, results: {}, busy: false };

  function header() {
    return `
      <div class="quiz-head">
        <span class="tag" data-cat="${esc(quiz.category)}">${esc(quiz.category)}</span>
        <h1>${rich(quiz.title)}</h1>
        ${quiz.description ? `<p class="lede">${rich(quiz.description)}</p>` : ''}
      </div>
      ${quiz.published ? '' : '<div class="notice">Draft preview: this quiz is not listed on the home page yet.</div>'}
      ${vid ? `
        <details class="card video-box">
          <summary>Watch the video</summary>
          <iframe class="video-frame" loading="lazy" src="https://www.youtube-nocookie.com/embed/${vid}"
            title="Video" allow="accelerometer; encrypted-media; gyroscope; picture-in-picture; fullscreen" allowfullscreen></iframe>
        </details>` : ''}`;
  }

  function renderQuestion() {
    const q = quiz.questions[state.index];
    const total = quiz.questions.length;
    const result = state.results[q.id];
    const checked = Boolean(result);
    const pct = ((state.index + (checked ? 1 : 0)) / total) * 100;

    let answerHtml;
    if (q.type === 'choice') {
      answerHtml = `<div class="choices" role="radiogroup" aria-label="Choices">${q.choices.map((c, i) => {
        let cls = '';
        if (checked) {
          if (i === result.correctAnswer) cls = 'right';
          else if (i === Number(state.answers[q.id])) cls = 'wrong';
        }
        return `<button class="choice ${cls}" role="radio" data-i="${i}"
            aria-checked="${state.selected === i}" ${checked ? 'disabled' : ''}>
            <span class="letter">${LETTERS[i]}</span><span>${rich(c)}</span>
          </button>`;
      }).join('')}</div>`;
    } else {
      const val = state.answers[q.id] ?? '';
      answerHtml = `
        <label class="field" style="margin:0">
          <span>Your answer</span>
          <input type="text" class="answer-input" id="answer" autocomplete="off" inputmode="text"
            value="${esc(val)}" ${checked ? 'disabled' : ''} placeholder="Type your answer">
        </label>
        <div class="hint">Fractions like 3/4 and decimals like 0.75 both work.</div>`;
    }

    let feedback = '';
    if (checked) {
      const right = q.type === 'choice'
        ? `${LETTERS[result.correctAnswer]}. ${rich(q.choices[result.correctAnswer])}`
        : rich(result.correctAnswer);
      feedback = `
        <div class="feedback ${result.correct ? 'good' : 'bad'}" role="status">
          <strong>${result.correct ? 'Correct!' : (state.answers[q.id] === undefined ? 'Here’s the answer' : 'Not quite')}</strong>
          ${result.correct ? '' : `<div>The answer is <b>${right}</b>.</div>`}
          ${result.explanation ? `<div class="explain">${rich(result.explanation)}</div>` : ''}
        </div>`;
    }

    const last = state.index === total - 1;
    app.innerHTML = `
      ${header()}
      <div class="progress">
        <span>Question ${state.index + 1} of ${total}</span>
        <div class="bar"><div style="width:${pct}%"></div></div>
      </div>
      <section class="card question" aria-live="polite">
        ${q.imageUrl ? `<img class="q-image" src="${esc(q.imageUrl)}" alt="Figure for question ${state.index + 1}">` : ''}
        <div class="prompt">${rich(q.prompt)}</div>
        ${answerHtml}
        ${feedback}
        <div class="actions">
          ${checked
            ? `<button class="btn primary" id="next">${last ? 'See my score' : 'Next question →'}</button>`
            : `<button class="btn primary" id="check" ${canCheck(q) ? '' : 'disabled'}>Check answer</button>
               <span class="spacer"></span>
               <button class="btn ghost" id="reveal">Show answer</button>`}
        </div>
      </section>`;

    // Keep the video open state between questions.
    const details = app.querySelector('.video-box');
    if (details && state.videoOpen) details.open = true;
    details?.addEventListener('toggle', () => { state.videoOpen = details.open; });

    renderMath(app);
    wire(q);
  }

  function canCheck(q) {
    if (q.type === 'choice') return state.selected !== null;
    return String(state.answers[q.id] ?? '').trim() !== '';
  }

  function wire(q) {
    const checkBtn = app.querySelector('#check');
    app.querySelectorAll('.choice:not(:disabled)').forEach((btn) => {
      btn.addEventListener('click', () => {
        state.selected = Number(btn.dataset.i);
        app.querySelectorAll('.choice').forEach((b) => b.setAttribute('aria-checked', b === btn));
        checkBtn.disabled = false;
      });
    });
    const input = app.querySelector('#answer');
    if (input && !input.disabled) {
      input.addEventListener('input', () => {
        state.answers[q.id] = input.value;
        checkBtn.disabled = !canCheck(q);
      });
      input.focus();
    }
    checkBtn?.addEventListener('click', () => check(q));
    app.querySelector('#reveal')?.addEventListener('click', () => check(q, true));
    const next = app.querySelector('#next');
    next?.addEventListener('click', goNext);
    next?.focus();
  }

  async function check(q, reveal = false) {
    if (state.busy) return;
    if (!reveal && !canCheck(q)) return;
    state.busy = true;
    if (reveal) { delete state.answers[q.id]; state.selected = null; }
    else if (q.type === 'choice') state.answers[q.id] = state.selected;
    const key = decodeKey(q.key);
    const result = Grading.gradeQuestion({ ...q, ...key }, reveal ? null : state.answers[q.id]);
    state.results[q.id] = { ...result, correct: reveal ? false : result.correct, explanation: key.explanation || '' };
    state.busy = false;
    renderQuestion();
  }

  function goNext() {
    if (state.index < quiz.questions.length - 1) {
      state.index++;
      state.selected = null;
      renderQuestion();
      window.scrollTo({ top: app.querySelector('.progress').offsetTop - 16, behavior: 'smooth' });
    } else {
      finish();
    }
  }

  async function finish() {
    const total = quiz.questions.length;
    const correct = quiz.questions.filter((q) => state.results[q.id]?.correct).length;

    const ratio = total ? correct / total : 0;
    const message = ratio === 1 ? 'Perfect score! 🎉'
      : ratio >= 0.7 ? 'Great work!'
        : ratio >= 0.4 ? 'Good effort. Rewatch the tricky parts and try again.'
          : 'These are tough. Watch the video again and give it another go.';

    const review = quiz.questions.map((q, i) => {
      const r = state.results[q.id] || {};
      const given = state.answers[q.id];
      const show = (v) => (q.type === 'choice' ? (v === undefined || v === null ? '—' : `${LETTERS[v]}. ${rich(q.choices[v])}`) : (v === undefined || v === '' ? '—' : rich(v)));
      return `<li>
        <span class="mark ${r.correct ? 'good' : 'bad'}">${r.correct ? '✓' : '✗'}</span>
        <div class="body">
          <div><b>Q${i + 1}.</b> ${rich(q.prompt)}</div>
          <div class="small muted">Your answer: ${show(given)}${r.correct ? '' : ` · Answer: ${show(r.correctAnswer)}`}</div>
        </div>
      </li>`;
    }).join('');

    app.innerHTML = `
      ${header()}
      <section class="card result">
        <div class="muted">Your score</div>
        <div class="score">${correct}<small> / ${total}</small></div>
        <p>${message}</p>
        <div class="actions" style="justify-content:center">
          <button class="btn primary" id="retry">Try again</button>
          ${quiz.videoUrl ? `<a class="btn" href="${esc(quiz.videoUrl)}" target="_blank" rel="noopener">Back to the video</a>` : ''}
          <a class="btn" href="${esc(SITE_ROOT)}?level=${encodeURIComponent(quiz.category)}">More ${esc(quiz.category)} practice</a>
        </div>
        <ul class="review">${review}</ul>
      </section>`;
    renderMath(app);
    app.querySelector('#retry').addEventListener('click', () => {
      Object.assign(state, { index: 0, selected: null, answers: {}, results: {} });
      renderQuestion();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  // Keyboard: Enter checks / goes next, A–E or 1–5 pick a choice.
  document.addEventListener('keydown', (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const q = quiz.questions[state.index];
    if (!q || !app.querySelector('.question')) return;
    if (e.key === 'Enter') {
      const btn = app.querySelector('#check:not(:disabled), #next');
      if (btn && document.activeElement?.tagName !== 'BUTTON') { e.preventDefault(); btn.click(); }
      return;
    }
    if (q.type === 'choice' && !state.results[q.id]) {
      const k = e.key.toUpperCase();
      let i = LETTERS.indexOf(k);
      if (/^[1-9]$/.test(e.key)) i = Number(e.key) - 1;
      const btn = app.querySelectorAll('.choice')[i];
      if (i >= 0 && btn) btn.click();
    }
  });

  if (!quiz.questions.length) {
    app.innerHTML = `${header()}<p class="muted">This quiz doesn't have any questions yet.</p>`;
    renderMath(app);
    return;
  }
  renderQuestion();
})();
