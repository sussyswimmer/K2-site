// Global metres ↔ feet toggle. Any element with data-m="<metres>" is re-rendered;
// add data-unit="km" for distances. Widgets subscribe with onUnits().
const FT_PER_M = 3.280839895;
const MI_PER_KM = 0.621371192;
const KEY = 'k2-units';
const subs = new Set();
let units = 'm';
try { units = localStorage.getItem(KEY) === 'ft' ? 'ft' : 'm'; } catch { /* storage blocked */ }

const nf = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });

export const getUnits = () => units;

export function fmtAlt(m, { unit = true, both = false } = {}) {
  const ft = m * FT_PER_M;
  const main = units === 'm' ? `${nf.format(m)}${unit ? ' m' : ''}` : `${nf.format(ft)}${unit ? ' ft' : ''}`;
  if (!both) return main;
  const other = units === 'm' ? `${nf.format(ft)} ft` : `${nf.format(m)} m`;
  return { main, other };
}

export function fmtDist(m) {
  const km = m / 1000;
  return units === 'm' ? `${nf.format(km)} km` : `${nf.format(km * MI_PER_KM)} miles`;
}

export function toDisplay(m) {
  return units === 'm' ? m : m * FT_PER_M;
}

export function render(root = document) {
  root.querySelectorAll('[data-m]').forEach((el) => {
    const m = parseFloat(el.dataset.m);
    el.textContent = el.dataset.unit === 'km' ? fmtDist(m) : fmtAlt(m);
  });
  document.querySelectorAll('[data-units]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.units === units)));
}

export function setUnits(u) {
  units = u === 'ft' ? 'ft' : 'm';
  try { localStorage.setItem(KEY, units); } catch { /* ignore */ }
  render();
  subs.forEach((fn) => fn(units));
}

export function onUnits(fn) {
  subs.add(fn);
  return () => subs.delete(fn);
}

export function initUnits() {
  document.querySelectorAll('[data-units]').forEach((b) => b.addEventListener('click', () => setUnits(b.dataset.units)));
  render();
}
