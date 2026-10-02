// Weather / summit-window simulator (Chapter 4). Pick a month: typical summit wind and
// temperature, whether it's in the climbing window, and — in 3D — the storm, snow and
// snow cover change with it.
import { getJSON, asset } from '../../core/data.js';
import { getUnits, onUnits } from '../../core/units.js';

const nf = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });
const LABEL = { yes: 'In the climbing window', marginal: 'Marginal', no: 'Out of season' };
function esc(s) { return String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

export async function mount(el, ctx) {
  const data = await getJSON('data/weather.json');
  const months = data.months;
  let m = 7;
  el.innerHTML = `
  <div class="w">
    <p class="lede-sm">K2's climbing season is short. In winter the subtropical jet stream sits over the Karakoram; in summer it moves north and the summit winds drop. Pick a month.</p>
    <div class="wx-months" role="radiogroup" aria-label="Month">
      ${months.map((x) => `<button type="button" role="radio" data-m="${x.month}" data-window="${x.window}" aria-checked="false" aria-label="${esc(x.name)}: ${esc(LABEL[x.window])}">${esc(x.name.slice(0, 3))}</button>`).join('')}
    </div>
    <div class="wx-stage">
      <video muted loop playsinline preload="none" aria-hidden="true" poster="${asset('media/summit_wind_loop_poster.webp')}">
        <source src="${asset('media/summit_wind_loop.webm')}" type="video/webm" /><source src="${asset('media/summit_wind_loop.mp4')}" type="video/mp4" />
      </video>
      <div class="wx-stage__body" aria-live="polite"></div>
    </div>
    <p class="w-note">${esc(data.note)}</p>
    ${data.sources?.length ? `<details><summary class="w-note">Sources</summary><ul class="w-note">${data.sources.map((s) => `<li><a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.title)}</a>${s.used_for ? ` · ${esc(s.used_for)}` : ''}</li>`).join('')}</ul></details>` : ''}
  </div>`;
  const body = el.querySelector('.wx-stage__body');
  const video = el.querySelector('video');
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let clip = 'summit_wind_loop';

  const temp = (c) => (getUnits() === 'ft' ? `${nf.format(c * 9 / 5 + 32)} °F` : `${nf.format(c)} °C`);
  const wind = (k) => (getUnits() === 'ft' ? `${nf.format(k * 0.621371)} mph` : `${nf.format(k)} km/h`);

  function setClip(name) {
    if (name === clip) return;
    clip = name;
    video.poster = asset(`media/${name}_poster.webp`);
    const [webm, mp4] = video.querySelectorAll('source');
    webm.src = asset(`media/${name}.webm`);
    mp4.src = asset(`media/${name}.mp4`);
    video.load();
    if (!reduce) video.play().catch(() => {});
  }

  function render() {
    const x = months.find((k) => k.month === m);
    el.querySelectorAll('[data-m]').forEach((b) => b.setAttribute('aria-checked', String(Number(b.dataset.m) === m)));
    const [lo, hi] = x.summit_wind_range_kmh || [x.summit_wind_kmh, x.summit_wind_kmh];
    body.innerHTML = `
      <span class="wx-badge" data-window="${x.window}">${esc(LABEL[x.window])}</span>
      <h3 style="margin:0">${esc(x.name)}</h3>
      <p>${esc(x.summary)}</p>
      <div class="w-stats">
        <div class="w-stat"><span class="k">Summit wind</span><p class="v">${wind(x.summit_wind_kmh)}</p><small>typical range ${wind(lo)}–${wind(hi)}</small></div>
        <div class="w-stat"><span class="k">Summit temperature</span><p class="v">${temp(x.summit_temp_c)}</p></div>
        <div class="w-stat"><span class="k">Base camp</span><p class="v">${temp(x.basecamp_temp_c)}</p></div>
      </div>
      <div class="wx-wind" aria-hidden="true"><small>calm</small><span class="wx-gauge"><span style="width:${Math.min(100, (x.summit_wind_kmh / 200) * 100)}%"></span></span><small>jet stream</small></div>`;
    // 3D: storm and snow grow with the wind; winter months add snow cover low down
    const storm = Math.min(1, Math.max(0, (x.summit_wind_kmh - 40) / 110));
    const winter = [11, 12, 1, 2, 3].includes(m) ? 1 : [4, 10].includes(m) ? 0.5 : 0;
    ctx.setWeather?.({ storm: storm * 0.9, snow: 0.25 + storm * 0.9, snowBoost: winter * 0.85 });
    setClip(storm > 0.45 ? 'storm_loop' : 'summit_wind_loop');
  }
  el.querySelector('[role="radiogroup"]').addEventListener('click', (e) => {
    const b = e.target.closest('[data-m]');
    if (!b) return;
    m = Number(b.dataset.m);
    render();
  });
  el.querySelector('[role="radiogroup"]').addEventListener('keydown', (e) => {
    const d = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
    if (!d) return;
    e.preventDefault();
    m = ((m - 1 + d + 12) % 12) + 1;
    render();
    el.querySelector(`[data-m="${m}"]`).focus();
  });
  if (!reduce) video.play().catch(() => {});
  const off = onUnits(render);
  render();
  return () => { off(); ctx.setWeather?.(null); video.pause(); };
}
