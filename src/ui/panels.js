// Side panel for hotspot facts, and the widget drawer (focus-trapped dialog).
import { getFacts } from '../core/data.js';
import { render as renderUnits } from '../core/units.js';

const FOCUSABLE = 'a[href], button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex="-1"])';

function escapeHTML(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export function factHTML(f) {
  const stat = f.stat != null ? `<p class="fact__stat">${f.unit === 'm' ? `<span data-m="${f.stat}"></span>` : `${escapeHTML(f.stat)}${f.unit ? ` <small>${escapeHTML(f.unit)}</small>` : ''}`}</p>` : '';
  const src = f.source_url ? `<p class="fact__src">Source: <a href="${escapeHTML(f.source_url)}" target="_blank" rel="noopener">${escapeHTML(f.source_title || f.source_url)}</a>${f.verified_on ? ` · checked ${escapeHTML(f.verified_on)}` : ''}</p>` : '';
  return `<article class="fact"><h3>${escapeHTML(f.title)}</h3>${stat}<p>${escapeHTML(f.body)}</p>${src}</article>`;
}

export function createSidePanel() {
  const el = document.getElementById('sidepanel');
  const title = document.getElementById('sidepanel-title');
  const kicker = document.getElementById('sidepanel-kicker');
  const body = document.getElementById('sidepanel-body');
  let returnFocus = null;

  async function open(id, label) {
    returnFocus = document.activeElement;
    const facts = await getFacts().catch(() => []);
    const main = facts.filter((f) => f.id === id || f.hotspot === id);
    title.textContent = label;
    kicker.textContent = 'Field notes';
    body.innerHTML = main.length ? main.map(factHTML).join('') : '<p class="fineprint">No notes for this place yet.</p>';
    renderUnits(body);
    el.hidden = false;
    el.querySelector('[data-close]').focus();
  }
  function close() {
    el.hidden = true;
    returnFocus?.focus?.();
  }
  el.querySelector('[data-close]').addEventListener('click', close);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !el.hidden) close(); });
  return { open, close, get isOpen() { return !el.hidden; } };
}

export function createDrawer({ onOpen, onClose } = {}) {
  const el = document.getElementById('drawer');
  const panel = el.querySelector('.drawer__panel');
  const title = document.getElementById('drawer-title');
  const body = document.getElementById('drawer-body');
  let returnFocus = null;
  let cleanup = null;

  function trap(e) {
    if (e.key === 'Escape') { close(); return; }
    if (e.key !== 'Tab') return;
    const f = [...panel.querySelectorAll(FOCUSABLE)].filter((n) => n.offsetParent !== null);
    if (!f.length) return;
    if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f.at(-1).focus(); }
    else if (!e.shiftKey && document.activeElement === f.at(-1)) { e.preventDefault(); f[0].focus(); }
  }

  async function open(name, label, mount) {
    if (!el.hidden) close(false);
    returnFocus = document.activeElement;
    title.textContent = label;
    body.innerHTML = '<p class="fineprint">Loading…</p>';
    el.hidden = false;
    document.addEventListener('keydown', trap);
    onOpen?.(name);
    try {
      cleanup = (await mount(body)) || null;
    } catch (err) {
      console.warn(err);
      body.innerHTML = '<p class="fineprint">This tool could not load.</p>';
    }
    el.querySelector('[data-close]').focus();
  }
  function close(restore = true) {
    if (el.hidden) return;
    cleanup?.();
    cleanup = null;
    el.hidden = true;
    body.innerHTML = '';
    document.removeEventListener('keydown', trap);
    onClose?.();
    if (restore) returnFocus?.focus?.();
  }
  el.querySelector('[data-close]').addEventListener('click', () => close());
  el.addEventListener('click', (e) => { if (e.target === el) close(); });
  return { open, close, get isOpen() { return !el.hidden; } };
}
