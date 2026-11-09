(async function () {
  const listEl = document.getElementById('list');
  const emptyEl = document.getElementById('empty');
  const filtersEl = document.getElementById('filters');

  let data;
  try {
    data = await api('GET', '/api/quizzes');
  } catch (err) {
    emptyEl.hidden = false;
    emptyEl.textContent = 'Could not load quizzes. Please refresh the page.';
    return;
  }

  const params = new URLSearchParams(location.search);
  let active = params.get('level') || 'All';
  const used = data.categories.filter((c) => data.quizzes.some((q) => q.category === c));
  const options = ['All', ...used];
  if (!options.includes(active)) active = 'All';

  function renderFilters() {
    filtersEl.hidden = used.length < 2;
    filtersEl.innerHTML = options
      .map((c) => `<button class="chip" aria-pressed="${c === active}" data-cat="${esc(c)}">${esc(c)}</button>`)
      .join('');
  }

  function renderList() {
    const items = data.quizzes.filter((q) => active === 'All' || q.category === active);
    emptyEl.hidden = items.length > 0;
    listEl.innerHTML = items.map((q) => `
      <a class="card quiz-card" href="/q/${encodeURIComponent(q.slug)}">
        <div><span class="tag" data-cat="${esc(q.category)}">${esc(q.category)}</span></div>
        <h3>${rich(q.title)}</h3>
        <p>${rich(q.description)}</p>
        <div class="meta">
          <span>${q.questionCount} question${q.questionCount === 1 ? '' : 's'}${youtubeId(q.videoUrl) ? ' · with video' : ''}</span>
          <span class="go">Start →</span>
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
