// Everest vs K2 (Chapter 5): silhouettes drawn to scale + animated stat comparison.
import { getCompare } from '../../core/data.js';
import { fmtAlt, onUnits } from '../../core/units.js';

function esc(s) { return String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
const nf = new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 });

function silhouette(profiles) {
  // Both peaks share one vertical and one horizontal scale (metres and km).
  const W = 640, H = 300, padL = 52, padB = 24, padT = 34, gap = 40;
  const span = (p) => p[p.length - 1][0] - p[0][0];
  const totalKm = span(profiles.everest) + span(profiles.k2);
  const kx = (W - padL - 12 - gap) / totalKm;
  const minE = 3000, maxE = 9200;
  const y = (m) => padT + (1 - (m - minE) / (maxE - minE)) * (H - padT - padB);
  const path = (pts, x0) => {
    const a = pts[0][0];
    const top = pts.map(([km, m]) => `${(x0 + (km - a) * kx).toFixed(1)},${y(m).toFixed(1)}`).join(' L');
    return `M${(x0).toFixed(1)},${y(minE)} L${top} L${(x0 + span(pts) * kx).toFixed(1)},${y(minE)} Z`;
  };
  const ex0 = padL;
  const kx0 = padL + span(profiles.everest) * kx + gap;
  const peak = (pts, x0) => { const [km, m] = pts.reduce((b, p) => (p[1] > b[1] ? p : b)); return [x0 + (km - pts[0][0]) * kx, y(m), m]; };
  const [ePx, ePy, eM] = peak(profiles.everest, ex0);
  const [kPx, kPy, kM] = peak(profiles.k2, kx0);
  const grid = [4000, 5000, 6000, 7000, 8000, 9000].map((m) => `<line x1="${padL}" x2="${W - 8}" y1="${y(m)}" y2="${y(m)}"/><text x="${padL - 6}" y="${y(m) + 3}" text-anchor="end">${esc(fmtAlt(m))}</text>`).join('');
  return `<svg class="vs-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="Everest and K2 drawn to the same scale. Everest ${esc(fmtAlt(eM))}, K2 ${esc(fmtAlt(kM))}.">
    <g class="grid">${grid}</g>
    <path class="peak peak--everest" d="${path(profiles.everest, ex0)}" pathLength="1"/>
    <path class="peak peak--k2" d="${path(profiles.k2, kx0)}" pathLength="1"/>
    <text class="peak-label" x="${ePx}" y="${ePy - 18}" text-anchor="middle">Everest</text>
    <text class="peak-sub" x="${ePx}" y="${ePy - 6}" text-anchor="middle">${esc(fmtAlt(eM))}</text>
    <text class="peak-label" x="${kPx}" y="${kPy - 18}" text-anchor="middle">K2</text>
    <text class="peak-sub" x="${kPx}" y="${kPy - 6}" text-anchor="middle">${esc(fmtAlt(kM))}</text>
  </svg>`;
}

// Years and latitudes are labels, not quantities: no thousands separator, no bars.
const PLAIN = new Set(['year', 'deg N']);

function valueText(row, v) {
  if (v == null) return '—';
  if (typeof v === 'string') return v;
  if (row.unit === 'year') return String(v);
  if (row.unit === 'm') return fmtAlt(v);
  if (row.unit === 'USD') return `$${nf.format(v / 1000)}k`;
  if (row.unit === 'deg N') return `${nf.format(v)}° N`;
  return `${nf.format(v)}${row.unit ? ` ${row.unit}` : ''}`;
}
const num = (v) => (Array.isArray(v) ? (v[0] + v[1]) / 2 : typeof v === 'number' ? v : null);
// Ranges carry the unit once: "905–935 summits", "$45k–95k", "7,600–8,000 m".
function show(row, v) {
  if (!Array.isArray(v)) return valueText(row, v);
  const [a, b] = v.map((x) => valueText(row, x));
  const unit = /^\$/.test(a) ? '' : (b.match(/[^\d.,\s].*$/) || [''])[0];
  return `${unit ? a.slice(0, a.length - unit.length).trim() : a}–${b.replace(/^\$/, '')}`;
}

export async function mount(el) {
  const data = await getCompare();
  function render() {
    const rows = data.rows.filter((r) => num(r.everest) != null || num(r.k2) != null);
    el.innerHTML = `
    <div class="w">
      <p class="lede-sm">Everest is ${esc(fmtAlt(Math.round(num(rows.find((r) => r.key === 'height')?.everest) - num(rows.find((r) => r.key === 'height')?.k2))))} higher, but K2 is widely seen as the harder climb: steeper, further north, far less visited and far deadlier for each summit.</p>
      <div class="w-panel">${silhouette(data.profiles)}</div>
      ${data.profiles_note ? `<p class="w-note">${esc(data.profiles_note)}</p>` : ''}
      <div class="vs-rows">
        ${rows.map((r) => {
          const e = num(r.everest), k = num(r.k2);
          const max = PLAIN.has(r.unit) ? Infinity : Math.max(e || 0, k || 0) || 1;
          const split = r.everest_source_url && r.k2_source_url && r.everest_source_url !== r.k2_source_url;
          const links = (split ? [['Everest source', r.everest_source_url], ['K2 source', r.k2_source_url]] : [['source', r.source_url || r.k2_source_url || r.everest_source_url]])
            .filter(([, u]) => u).map(([t, u]) => `<a href="${esc(u)}" target="_blank" rel="noopener">${t}</a>`).join(' · ');
          return `<div class="vs-row">
            <div class="vs-row__head"><b>${esc(r.label)}</b>${r.estimate ? '<span class="vs-est">estimate</span>' : ''}</div>
            <div class="vs-bars${PLAIN.has(r.unit) ? ' vs-bars--plain' : ''}">
              <span>Everest</span><span class="vs-bar vs-bar--everest"><span data-w="${((e || 0) / max) * 100}"></span></span><span class="vs-val">${esc(show(r, r.everest))}</span>
              <span>K2</span><span class="vs-bar vs-bar--k2"><span data-w="${((k || 0) / max) * 100}"></span></span><span class="vs-val">${esc(show(r, r.k2))}</span>
            </div>
            ${r.note || links ? `<p class="w-note">${esc(r.note || '')}${links ? ` ${links}` : ''}</p>` : ''}
          </div>`;
        }).join('')}
      </div>
      <p class="w-note">Figures as of ${esc(data.as_of)}. Summit and death totals change every season.</p>
    </div>`;
    requestAnimationFrame(() => requestAnimationFrame(() => {
      el.querySelectorAll('[data-w]').forEach((s) => { s.style.width = `${s.dataset.w}%`; });
    }));
  }
  const off = onUnits(render);
  render();
  return () => off();
}
