(async function () {
  const app = document.getElementById('app');
  const slug = new URLSearchParams(location.search).get('q') || '';

  let quiz;
  try {
    if (!/^[a-z0-9-]+$/.test(slug)) throw new Error('bad slug');
    quiz = await getJSON(`quizzes/${slug}.json`);
  } catch (err) {
    app.innerHTML = `
      <div class="empty-state">
        <h1>Quiz not found</h1>
        <p class="lede">This link may be old, or the quiz was removed.</p>
        <a class="btn primary" href="${esc(SITE_ROOT)}">See all practice quizzes</a>
      </div>`;
    return;
  }

  document.title = `${quiz.title} · MTonkla Practice`;
  const vid = youtubeId(quiz.videoUrl);
  const total = quiz.questions.length;
  const state = { index: 0, selected: null, answers: {}, results: {}, hints: {} };
  const site = window.SITE || {};

  // ---------- page shell: rendered once so the video keeps playing ----------
  const best = Progress.get(quiz.slug);
  app.innerHTML = `
    <div class="quiz-head">
      <div class="quiz-meta">
        <span class="tag" data-cat="${esc(quiz.category)}">${esc(quiz.category)}</span>
        <span class="small muted">${total} question${total === 1 ? '' : 's'}</span>
        ${best ? `<span class="best-pill" title="Your best score on this device">Best ${best.best}/${best.total}</span>` : ''}
      </div>
      <h1>${rich(quiz.title)}</h1>
      ${quiz.description ? `<p class="lede">${rich(quiz.description)}</p>` : ''}
    </div>
    ${quiz.published ? '' : '<div class="notice">Draft preview: this quiz is not listed on the home page yet.</div>'}
    ${vid ? `
      <details class="card video-box" id="video">
        <summary>Watch the video</summary>
        <div class="video-wrap"></div>
      </details>` : ''}
    <div id="stage"></div>`;
  renderMath(app.querySelector('.quiz-head'));
  const stage = app.querySelector('#stage');

  // ---------- video ----------
  const videoBox = app.querySelector('#video');
  function videoSrc(start, autoplay) {
    const p = new URLSearchParams({ rel: '0', playsinline: '1' });
    if (start) p.set('start', String(start));
    if (autoplay) p.set('autoplay', '1');
    return `https://www.youtube-nocookie.com/embed/${vid}?${p}`;
  }
  function ensurePlayer(start, autoplay) {
    const wrap = videoBox.querySelector('.video-wrap');
    let frame = wrap.querySelector('iframe');
    if (!frame || start !== undefined) {
      wrap.innerHTML = `<iframe class="video-frame" src="${videoSrc(start, autoplay)}" title="${esc(quiz.title)} video"
        allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture; fullscreen" allowfullscreen></iframe>`;
    }
  }
  videoBox?.addEventListener('toggle', () => { if (videoBox.open) ensurePlayer(); });
  function playFrom(seconds) {
    videoBox.open = true;
    ensurePlayer(seconds, true);
    videoBox.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  const watchBtn = (q, label) => (vid && Number.isFinite(q.t)
    ? `<button class="btn ghost sm watch" data-t="${q.t}">${label} ${esc(formatTime(q.t))}</button>`
    : '');

  // ---------- questions ----------
  function renderQuestion(animate = true) {
    const q = quiz.questions[state.index];
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
          <input type="text" class="answer-input" id="answer" autocomplete="off" autocapitalize="off" spellcheck="false"
            value="${esc(val)}" ${checked ? 'disabled' : ''} placeholder="Type your answer">
        </label>
        <div class="hint">Fractions like 3/4 and decimals like 0.75 both work.</div>`;
    }

    const hintHtml = q.hint && !checked
      ? (state.hints[q.id]
        ? `<div class="hint-box"><b>Hint</b>${rich(q.hint)}</div>`
        : '')
      : '';

    let feedback = '';
    if (checked) {
      const right = q.type === 'choice'
        ? `${LETTERS[result.correctAnswer]}. ${rich(q.choices[result.correctAnswer])}`
        : rich(result.correctAnswer);
      const revealed = state.answers[q.id] === undefined;
      feedback = `
        <div class="feedback ${result.correct ? 'good' : 'bad'}" role="status">
          <strong>${result.correct ? pick(['Correct!', 'Nice work!', 'Exactly right!', 'You got it!']) : (revealed ? 'Here’s the answer' : 'Not quite')}</strong>
          ${result.correct ? '' : `<div>The answer is <b>${right}</b>.</div>`}
          ${result.explanation ? `<div class="explain">${rich(result.explanation)}</div>` : ''}
          ${result.correct ? '' : watchBtn(q, 'Watch it explained at')}
        </div>`;
    }

    const last = state.index === total - 1;
    stage.innerHTML = `
      <div class="progress">
        <span>Question ${state.index + 1} of ${total}</span>
        <div class="bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(pct)}"><div style="width:${pct}%"></div></div>
      </div>
      <section class="card question ${animate ? '' : 'still'}" aria-live="polite">
        ${q.imageUrl ? `<img class="q-image" src="${esc(q.imageUrl)}" alt="Figure for question ${state.index + 1}">` : ''}
        <div class="prompt">${rich(q.prompt)}</div>
        ${answerHtml}
        ${hintHtml}
        ${feedback}
        <div class="actions">
          ${checked
            ? `<button class="btn primary" id="next">${last ? 'See my score' : 'Next question →'}</button>`
            : `<button class="btn primary" id="check" ${canCheck(q) ? '' : 'disabled'}>Check answer</button>
               ${q.hint && !state.hints[q.id] ? '<button class="btn" id="hint">Hint</button>' : ''}
               <span class="spacer"></span>
               ${watchBtn(q, 'Watch')}
               <button class="btn ghost" id="reveal">Show answer</button>`}
        </div>
      </section>`;
    renderMath(stage);
    wire(q);
  }

  function pick(list) { return list[Math.floor(Math.random() * list.length)]; }

  function canCheck(q) {
    if (q.type === 'choice') return state.selected !== null;
    return String(state.answers[q.id] ?? '').trim() !== '';
  }

  function wire(q) {
    const checkBtn = stage.querySelector('#check');
    stage.querySelectorAll('.choice:not(:disabled)').forEach((btn) => {
      btn.addEventListener('click', () => {
        state.selected = Number(btn.dataset.i);
        stage.querySelectorAll('.choice').forEach((b) => b.setAttribute('aria-checked', b === btn));
        checkBtn.disabled = false;
      });
    });
    const input = stage.querySelector('#answer');
    if (input && !input.disabled) {
      input.addEventListener('input', () => {
        state.answers[q.id] = input.value;
        checkBtn.disabled = !canCheck(q);
      });
      if (matchMedia('(hover: hover)').matches) input.focus({ preventScroll: true });
    }
    checkBtn?.addEventListener('click', () => check(q));
    stage.querySelector('#reveal')?.addEventListener('click', () => check(q, true));
    stage.querySelector('#hint')?.addEventListener('click', () => { state.hints[q.id] = true; renderQuestion(false); });
    stage.querySelectorAll('.watch').forEach((b) => b.addEventListener('click', () => playFrom(Number(b.dataset.t))));
    const next = stage.querySelector('#next');
    next?.addEventListener('click', goNext);
    next?.focus({ preventScroll: true });
  }

  function check(q, reveal = false) {
    if (!reveal && !canCheck(q)) return;
    if (reveal) { delete state.answers[q.id]; state.selected = null; }
    else if (q.type === 'choice') state.answers[q.id] = state.selected;
    const key = decodeKey(q.key);
    const result = Grading.gradeQuestion({ ...q, ...key }, reveal ? null : state.answers[q.id]);
    state.results[q.id] = { ...result, correct: reveal ? false : result.correct, explanation: key.explanation || '' };
    if (navigator.vibrate && !reveal) navigator.vibrate(result.correct ? 12 : [20, 40, 20]);
    renderQuestion(false);
  }

  function goNext() {
    if (state.index < total - 1) {
      state.index++;
      state.selected = null;
      renderQuestion();
      const top = stage.getBoundingClientRect().top + window.scrollY - 70;
      if (window.scrollY > top) window.scrollTo({ top, behavior: 'smooth' });
    } else {
      finish();
    }
  }

  // ---------- results ----------
  async function finish() {
    const correct = quiz.questions.filter((q) => state.results[q.id]?.correct).length;
    const ratio = total ? correct / total : 0;
    const prev = Progress.get(quiz.slug);
    const isNewBest = Progress.save(quiz.slug, correct, total) && prev;
    const message = ratio === 1 ? 'Perfect score! Every single one.'
      : ratio >= 0.7 ? 'Great work! You really know this.'
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
          ${!r.correct ? watchBtn(q, 'Watch at') : ''}
        </div>
      </li>`;
    }).join('');

    stage.innerHTML = `
      <section class="card result">
        <div class="muted small">Your score</div>
        <div class="ring">
          <svg viewBox="0 0 120 120" aria-hidden="true">
            <defs><linearGradient id="ringGrad" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stop-color="#2b8cff"/><stop offset="1" stop-color="#6a4cf5"/>
            </linearGradient></defs>
            <circle class="track" cx="60" cy="60" r="52" fill="none" stroke-width="10"/>
            <circle class="value" cx="60" cy="60" r="52" fill="none" stroke="url(#ringGrad)" stroke-width="10"
              stroke-linecap="round" stroke-dasharray="326.73" stroke-dashoffset="326.73"/>
          </svg>
          <div class="score">${correct}<small>/${total}</small></div>
        </div>
        ${isNewBest ? '<div class="best-pill big">New personal best!</div>' : ''}
        <p>${message}</p>
        <div class="actions" style="justify-content:center">
          <button class="btn primary" id="retry">Try again</button>
          <button class="btn" id="share">Share my score</button>
        </div>
        <div id="up-next"></div>
        <a class="all-link small" href="${esc(SITE_ROOT)}?level=${encodeURIComponent(quiz.category)}">See all ${esc(quiz.category)} quizzes</a>
        <ul class="review">${review}</ul>
      </section>
      ${site.channelUrl ? `
        <section class="card subscribe">
          <img src="${esc(SITE_ROOT)}assets/logo.svg" alt="" class="subscribe-icon">
          <div class="subscribe-text">
            <b>Enjoyed these problems?</b>
            <span>Subscribe to ${esc(site.channelName || 'MTonkla')} so you don’t miss the next video.</span>
          </div>
          <a class="btn yt" href="${esc(site.channelUrl)}?sub_confirmation=1" target="_blank" rel="noopener">Subscribe</a>
        </section>` : ''}`;
    renderMath(stage);

    const ring = stage.querySelector('.ring .value');
    requestAnimationFrame(() => requestAnimationFrame(() => {
      ring.style.strokeDashoffset = String(326.73 * (1 - ratio));
    }));
    if (ratio === 1) setTimeout(confetti, 500);

    stage.querySelector('#retry').addEventListener('click', () => {
      Object.assign(state, { index: 0, selected: null, answers: {}, results: {}, hints: {} });
      renderQuestion();
      stage.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    stage.querySelector('#share').addEventListener('click', async () => {
      const url = quizLink(quiz.slug);
      const text = `I got ${correct}/${total} on “${quiz.title}”. Can you beat me?`;
      if (navigator.share) {
        try { await navigator.share({ title: quiz.title, text, url }); } catch { /* cancelled */ }
      } else {
        await copyText(`${text} ${url}`);
      }
    });
    stage.querySelectorAll('.watch').forEach((b) => b.addEventListener('click', () => playFrom(Number(b.dataset.t))));
    const top = stage.getBoundingClientRect().top + window.scrollY - 70;
    window.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });

    // Suggest another quiz at the same level.
    try {
      const index = await getJSON('quizzes/index.json');
      const others = (index.quizzes || []).filter((q) => q.published && q.slug !== quiz.slug);
      const nextQuiz = others.find((q) => q.category === quiz.category && !Progress.get(q.slug))
        || others.find((q) => q.category === quiz.category) || others[0];
      if (nextQuiz) {
        const el = stage.querySelector('#up-next');
        el.innerHTML = `
          <a class="up-next" href="${esc(quizLink(nextQuiz.slug))}">
            <span class="small muted">Up next</span>
            <span class="up-next-title">${rich(nextQuiz.title)}</span>
            <span class="up-next-go">→</span>
          </a>`;
        renderMath(el);
      }
    } catch { /* no suggestion */ }
  }

  // ---------- confetti for a perfect score ----------
  function confetti() {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const canvas = document.createElement('canvas');
    canvas.className = 'confetti';
    document.body.appendChild(canvas);
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    const W = innerWidth; const H = innerHeight;
    canvas.width = W * dpr; canvas.height = H * dpr;
    ctx.scale(dpr, dpr);
    const colors = ['#2b8cff', '#6a4cf5', '#ffd60a', '#34c759', '#ff375f', '#64d2ff'];
    const parts = Array.from({ length: 160 }, (_, i) => ({
      x: W / 2 + (Math.random() - 0.5) * 80,
      y: H * 0.35,
      vx: (Math.random() - 0.5) * 14,
      vy: -Math.random() * 14 - 4,
      r: Math.random() * Math.PI,
      vr: (Math.random() - 0.5) * 0.3,
      w: 6 + Math.random() * 6,
      h: 8 + Math.random() * 8,
      c: colors[i % colors.length],
    }));
    const start = performance.now();
    (function frame(now) {
      const t = now - start;
      ctx.clearRect(0, 0, W, H);
      for (const p of parts) {
        p.vy += 0.35; p.vx *= 0.99; p.x += p.vx; p.y += p.vy; p.r += p.vr;
        ctx.save();
        ctx.globalAlpha = Math.max(0, 1 - t / 2800);
        ctx.translate(p.x, p.y); ctx.rotate(p.r);
        ctx.fillStyle = p.c;
        ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h * Math.abs(Math.cos(p.r * 2)));
        ctx.restore();
      }
      if (t < 2800) requestAnimationFrame(frame); else canvas.remove();
    })(start);
  }

  // Keyboard: Enter checks / goes next, A–E or 1–5 pick a choice, H shows the hint.
  document.addEventListener('keydown', (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const q = quiz.questions[state.index];
    if (!q || !stage.querySelector('.question')) return;
    if (e.key === 'Enter') {
      const btn = stage.querySelector('#check:not(:disabled), #next');
      if (btn && document.activeElement?.tagName !== 'BUTTON') { e.preventDefault(); btn.click(); }
      return;
    }
    if (document.activeElement?.tagName === 'INPUT') return;
    if (e.key.toLowerCase() === 'h') { stage.querySelector('#hint')?.click(); return; }
    if (q.type === 'choice' && !state.results[q.id]) {
      let i = LETTERS.indexOf(e.key.toUpperCase());
      if (/^[1-9]$/.test(e.key)) i = Number(e.key) - 1;
      const btn = stage.querySelectorAll('.choice')[i];
      if (i >= 0 && btn) btn.click();
    }
  });

  if (!total) {
    stage.innerHTML = '<p class="muted">This quiz doesn’t have any questions yet.</p>';
    return;
  }
  renderQuestion();
})();
