// Fixed altitude meter: 5,000 → 8,611 m scale, marker follows the camera's real height.
import { fmtAlt, getUnits, onUnits } from '../core/units.js';

const MIN = 5000;
const MAX = 8611;
const FT = 3.280839895;
const nf = new Intl.NumberFormat('en-US');

export function createAltimeter() {
  const ticks = document.querySelector('.altimeter__ticks');
  const marker = document.getElementById('alt-marker');
  const primary = document.getElementById('alt-primary');
  const secondary = document.getElementById('alt-secondary');
  const pct = (m) => (1 - (m - MIN) / (MAX - MIN)) * 100;

  function drawTicks() {
    const ft = getUnits() === 'ft';
    const k = ft ? FT : 1;
    const minor = ft ? 1000 : 250;
    const major = ft ? 3000 : 1000;
    const html = [];
    for (let v = Math.ceil((MIN * k) / minor) * minor; v < MAX * k - 120 * k; v += minor) {
      const isMajor = v % major === 0;
      html.push(`<li class="${isMajor ? '' : 'minor'}" style="top:${pct(v / k)}%">${isMajor ? `<span>${nf.format(v)} ${ft ? 'ft' : 'm'}</span>` : ''}</li>`);
    }
    html.push(`<li class="summit" style="top:0%"><span>${fmtAlt(MAX)} summit</span></li>`);
    ticks.innerHTML = html.join('');
  }

  let last = -1;
  function update(altitude) {
    const a = Math.round(altitude);
    if (Math.abs(a - last) < 1) return;
    last = a;
    const above = a > MAX + 300;
    marker.style.top = `${above ? -3 : pct(Math.max(a, MIN))}%`;
    marker.classList.toggle('is-above', above);
    const f = fmtAlt(a, { both: true });
    primary.textContent = f.main;
    secondary.textContent = `${f.other} · camera`;
  }

  drawTicks();
  onUnits(() => { drawTicks(); last = -1; });
  return { update };
}
