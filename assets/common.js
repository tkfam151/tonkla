// Shared helpers for every page.

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

// Plain text with line breaks; math like $x^2$ is left for KaTeX to render.
function rich(s) {
  return esc(s).replace(/\n/g, '<br>');
}

function renderMath(el) {
  if (!el || typeof window.renderMathInElement !== 'function') return;
  window.renderMathInElement(el, {
    delimiters: [
      { left: '$$', right: '$$', display: true },
      { left: '\\[', right: '\\]', display: true },
      { left: '$', right: '$', display: false },
      { left: '\\(', right: '\\)', display: false },
    ],
    throwOnError: false,
  });
}

function youtubeId(url) {
  if (!url) return null;
  const m = String(url).match(
    /(?:youtu\.be\/|youtube(?:-nocookie)?\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/|live\/|v\/))([\w-]{11})/,
  );
  return m ? m[1] : null;
}

// Base URL of the site (works at user.github.io/repo/ or any other path).
const SITE_ROOT = new URL(document.currentScript.src.replace(/assets\/common\.js.*$/, ''), location.href).href;

function quizLink(slug) {
  return `${SITE_ROOT}quiz.html?q=${encodeURIComponent(slug)}`;
}

// Read a JSON file from the site, skipping stale browser caches.
async function getJSON(path) {
  const res = await fetch(SITE_ROOT + path, { cache: 'no-cache' });
  if (!res.ok) {
    const err = new Error(`Could not load ${path} (${res.status})`);
    err.status = res.status;
    throw err;
  }
  return res.json();
}

// UTF-8 safe base64.
function b64encode(text) {
  const bytes = new TextEncoder().encode(text);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}
function b64decode(b64) {
  const bin = atob(String(b64).replace(/\s/g, ''));
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
}

// Answers are scrambled in the quiz files so they don't show at a glance.
// This is not real security: a determined viewer could still decode them.
function encodeKey(obj) {
  return b64encode(JSON.stringify(obj)).split('').reverse().join('');
}
function decodeKey(str) {
  try {
    return JSON.parse(b64decode(String(str).split('').reverse().join('')));
  } catch {
    return {};
  }
}

function toast(msg, ms = 1800) {
  let el = document.querySelector('.toast');
  if (!el) {
    el = document.createElement('div');
    el.className = 'toast';
    el.setAttribute('role', 'status');
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toast.t);
  toast.t = setTimeout(() => el.classList.remove('show'), ms);
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    ta.remove();
  }
  toast('Link copied');
}

const LETTERS = 'ABCDEFGHIJ';
const CATEGORIES = ['Olympiad', 'Grade 6', 'Grade 7', 'Other'];

// Fill in site name and channel link from config.js.
function applySite() {
  const site = window.SITE || {};
  document.querySelectorAll('.brand-name').forEach((el) => { if (site.name) el.textContent = site.name; });
  document.querySelectorAll('[data-channel-link]').forEach((el) => {
    if (site.channelUrl) { el.href = site.channelUrl; el.hidden = false; } else { el.hidden = true; }
  });
  document.querySelectorAll('.brand[data-home]').forEach((el) => { el.href = SITE_ROOT; });
}
document.addEventListener('DOMContentLoaded', applySite);
