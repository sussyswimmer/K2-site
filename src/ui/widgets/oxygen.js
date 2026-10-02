// Oxygen & pressure at altitude (Chapter 4).
// International Standard Atmosphere (troposphere):
//   P(h) = P0 · (1 − L·h / T0)^(g·M / (R·L)),  P0 = 1013.25 hPa, L = 0.0065 K/m, T0 = 288.15 K,
//   exponent g·M/(R·L) = 5.2559.  Oxygen stays 20.95 % of the air, so the oxygen in each
//   breath scales with P/P0.  Boiling point from Clausius–Clapeyron (ΔHvap = 40.66 kJ/mol).
import { fmtAlt, getUnits, onUnits } from '../../core/units.js';

const P0 = 1013.25;
const EXP = 5.2559;
const pressure = (h) => P0 * Math.pow(1 - (0.0065 * h) / 288.15, EXP);
const boilC = (p) => 1 / (1 / 373.15 - (8.314 / 40660) * Math.log(p / P0)) - 273.15;
const inspiredO2 = (p) => 0.2095 * (p * 0.750062 - 47); // mmHg, after warming/humidifying in the airway

const BANDS = [
  [0, 'Sea level to valley', 'Normal breathing. Your blood is close to fully saturated with oxygen.'],
  [1500, 'Moderate altitude', 'Most people notice little at rest; you may breathe a little harder on stairs.'],
  [2500, 'High altitude', 'Headaches and poor sleep are common on the first nights. Acute mountain sickness becomes a real risk without a slow ascent.'],
  [3500, 'Very high altitude', 'The body needs days to adjust. Pushing up too fast here is how fluid builds up in the lungs or brain.'],
  [5000, 'Base camp territory', 'Climbers spend weeks here and higher acclimatising. Appetite drops and sleep is broken; the body slowly loses weight.'],
  [6500, 'Extreme altitude', 'Every few steps need several breaths. Thinking slows. Climbers rotate up and back down to adapt.'],
  [8000, 'The death zone', 'Too little oxygen to sustain human life for long. The body deteriorates by the hour; most climbers here breathe bottled oxygen.'],
];
const PRESETS = [
  ['Sea level', 0], ['Skardu', 2230], ['Base Camp', 5000], ['Camp 2', 6700], ['The Shoulder', 7900], ['Bottleneck', 8200], ['Summit', 8611],
];
const nf0 = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });
const nf1 = new Intl.NumberFormat('en-US', { maximumFractionDigits: 1, minimumFractionDigits: 1 });

export function mount(el) {
  el.innerHTML = `
  <div class="w oxy">
    <p class="lede-sm">Drag the altitude. The air thins exponentially as you climb: at the summit of K2 each breath carries about a third of the oxygen it would at the beach.</p>
    <div class="oxy-top">
      <div class="oxy-breath" aria-hidden="true">
        <span class="oxy-breath__ring"></span>
        <span class="oxy-breath__dot"></span>
        <span class="oxy-breath__label">oxygen in each breath</span>
      </div>
      <div>
        <p class="oxy-alt" aria-live="polite"><span data-o="alt"></span></p>
        <label class="visually-hidden" for="oxy-range">Altitude</label>
        <input id="oxy-range" class="w-range" type="range" min="0" max="8611" step="1" value="8200" />
        <div class="w-presets" role="group" aria-label="Jump to a place">
          ${PRESETS.map(([n, h]) => `<button type="button" class="chip" data-h="${h}">${n}</button>`).join('')}
        </div>
      </div>
    </div>
    <dl class="w-stats">
      <div class="w-stat"><dt>Air pressure</dt><dd data-o="p"></dd></div>
      <div class="w-stat"><dt>Oxygen per breath vs sea level</dt><dd data-o="o2"></dd></div>
      <div class="w-stat"><dt>Water boils at</dt><dd data-o="boil"></dd></div>
      <div class="w-stat"><dt>O₂ reaching the lungs</dt><dd data-o="pio2"></dd></div>
    </dl>
    <div class="oxy-feel" aria-live="polite"><h3 data-o="band"></h3><p data-o="feel"></p></div>
    <details>
      <summary class="w-note">How this is calculated</summary>
      <pre class="oxy-formula">P(h) = 1013.25 hPa × (1 − 0.0065·h / 288.15)^5.2559
oxygen per breath = P(h) / 1013.25   (O₂ stays 20.95 % of the air)
boiling point: 1/T = 1/373.15 − (8.314 / 40 660) · ln(P / 1013.25)
inspired O₂ = 0.2095 × (P in mmHg − 47)</pre>
      <p class="w-note">This is the International Standard Atmosphere, which gives about 326 hPa at K2's summit. Real pressure changes with season and weather. Using weather reanalysis data, Szymczak et al. (2021) put K2's average summit pressure at about 347 hPa in the summer climbing season and 326 hPa in midwinter, so summer climbers get a little more oxygen than this model shows. <a href="https://www.mdpi.com/1660-4601/18/6/3040" target="_blank" rel="noopener">Source</a>. "How you feel" is a general guide, not medical advice.</p>
    </details>
  </div>`;

  const q = (k) => el.querySelector(`[data-o="${k}"]`);
  const range = el.querySelector('#oxy-range');
  const dot = el.querySelector('.oxy-breath__dot');
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

  function update() {
    const h = Number(range.value);
    const p = pressure(h);
    const frac = p / P0;
    const b = boilC(p);
    const imperial = getUnits() === 'ft';
    q('alt').textContent = fmtAlt(h);
    q('p').innerHTML = `${nf0.format(p)} <small>hPa</small>`;
    q('o2').innerHTML = `${nf0.format(frac * 100)} <small>%</small>`;
    q('boil').innerHTML = imperial ? `${nf0.format(b * 9 / 5 + 32)} <small>°F</small>` : `${nf1.format(b)} <small>°C</small>`;
    q('pio2').innerHTML = `${nf0.format(Math.max(inspiredO2(p), 0))} <small>mmHg</small>`;
    const band = [...BANDS].reverse().find(([min]) => h >= min);
    q('band').textContent = band[1];
    q('feel').textContent = band[2];
    // circle area ∝ oxygen per breath; the rhythm slows as it fades
    dot.style.setProperty('--size', `${Math.round(132 * Math.sqrt(frac))}px`);
    dot.style.setProperty('--period', `${(4 + 3.2 * (1 - frac)).toFixed(2)}s`);
    if (reduce) dot.style.animation = 'none';
    range.style.setProperty('--fill', `${(h / 8611) * 100}%`);
    range.setAttribute('aria-valuetext', `${fmtAlt(h)}: air pressure ${nf0.format(p)} hectopascals, ${nf0.format(frac * 100)} percent of sea-level oxygen`);
  }
  range.addEventListener('input', update);
  el.querySelectorAll('[data-h]').forEach((b) => b.addEventListener('click', () => { range.value = b.dataset.h; update(); }));
  const off = onUnits(update);
  update();
  return () => off();
}
