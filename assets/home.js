(async function () {
  const listEl = document.getElementById('list');
  const emptyEl = document.getElementById('empty');
  const filtersEl = document.getElementById('filters');
  const searchEl = document.getElementById('search');

  let quizzes;
  try {
    const index = await getJSON('quizzes/index.json');
    quizzes = (index.quizzes || []).filter((q) => q.published);
  } catch (err) {
    emptyEl.hidden = false;
    emptyEl.textContent = 'Could not load quizzes. Please refresh the page.';
    return;
  }

  const params = new URLSearchParams(location.search);
  let active = params.get('level') || 'All';
  let query = '';
  const used = CATEGORIES.filter((c) => quizzes.some((q) => q.category === c));
  const options = ['All', ...used];
  if (!options.includes(active)) active = 'All';
  const progress = Progress.all();

  // Search only earns its place once there are plenty of quizzes.
  searchEl.hidden = quizzes.length < 7;
  searchEl.querySelector('input').addEventListener('input', (e) => {
    query = e.target.value.trim().toLowerCase();
    renderList();
  });

  function renderFilters() {
    filtersEl.hidden = used.length < 2;
    filtersEl.innerHTML = options
      .map((c) => `<button class="chip" aria-pressed="${c === active}" data-cat="${esc(c)}">${esc(c)}</button>`)
      .join('');
  }

  function thumb(q) {
    const id = youtubeId(q.videoUrl);
    if (id) {
      return `<div class="thumb">
        <img src="https://i.ytimg.com/vi/${id}/hqdefault.jpg" alt="" loading="lazy" onerror="this.parentNode.classList.add('thumb-failed');this.remove()">
        <span class="thumb-play" aria-hidden="true"></span>
      </div>`;
    }
    return `<div class="thumb thumb-plain" data-cat="${esc(q.category)}" aria-hidden="true"><span>π</span></div>`;
  }

  function badge(q) {
    const p = progress[q.slug];
    if (!p) return '<span class="go">Start →</span>';
    const perfect = p.best === p.total;
    return `<span class="done ${perfect ? 'perfect' : ''}" title="Your best score">${perfect ? '★ ' : ''}Best ${p.best}/${p.total}</span>`;
  }

  function renderList() {
    const items = quizzes.filter((q) => (active === 'All' || q.category === active)
      && (!query || `${q.title} ${q.description}`.toLowerCase().includes(query)));
    emptyEl.hidden = items.length > 0;
    emptyEl.textContent = query ? `No quizzes match “${query}”.` : 'No quizzes here yet. Check back after the next video!';
    listEl.innerHTML = items.map((q) => `
      <a class="card quiz-card" href="${esc(quizLink(q.slug))}">
        ${thumb(q)}
        <div class="quiz-card-body">
          <div><span class="tag" data-cat="${esc(q.category)}">${esc(q.category)}</span></div>
          <h3>${rich(q.title)}</h3>
          ${q.description ? `<p>${rich(q.description)}</p>` : '<p></p>'}
          <div class="meta">
            <span>${q.questionCount} question${q.questionCount === 1 ? '' : 's'}</span>
            ${badge(q)}
          </div>
        </div>
      </a>`).join('');
    renderMath(listEl);
  }

  filtersEl.addEventListener('click', (e) => {
    const btn = e.target.closest('.chip');
    if (!btn) return;
    active = btn.dataset.cat;
    const url = new URL(location.href);
    if (active === 'All') url.searchParams.delete('level'); else url.searchParams.set('level', active);
    history.replaceState(null, '', url);
    renderFilters();
    renderList();
  });

  renderFilters();
  renderList();
})();
