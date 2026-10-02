// Static fallbacks: no-WebGL and reduced-motion. Full-page screenshots + overflow + console.
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
const out = process.argv[2] || 'test-results/static';
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader'] });
for (const [name, query, opts] of [
  ['nowebgl-1280', '?nowebgl', { viewport: { width: 1280, height: 800 } }],
  ['reduced-1280', '', { viewport: { width: 1280, height: 800 }, reducedMotion: 'reduce' }],
  ['nowebgl-375', '?nowebgl', { viewport: { width: 375, height: 740 }, isMobile: true, hasTouch: true }],
  ['reduced-414', '', { viewport: { width: 414, height: 860 }, reducedMotion: 'reduce', isMobile: true, hasTouch: true }],
]) {
  const ctx = await browser.newContext({ ...opts, ignoreHTTPSErrors: true });
  const page = await ctx.newPage();
  const logs = [];
  page.on('console', (m) => { if (['error', 'warning'].includes(m.type())) logs.push(`${m.type()}: ${m.text().slice(0, 200)}`); });
  page.on('pageerror', (e) => logs.push(`pageerror: ${e.message}`));
  page.on('response', (r) => { if (r.status() >= 400) logs.push(`HTTP ${r.status()} ${r.url()}`); });
  await page.goto(`http://localhost:4173/${query}`, { waitUntil: 'networkidle' });
  // scroll through so lazy widgets/images mount
  const h = await page.evaluate(() => document.documentElement.scrollHeight);
  for (let y = 0; y < h; y += 600) { await page.evaluate((y) => window.scrollTo(0, y), y); await page.waitForTimeout(120); }
  await page.waitForTimeout(800);
  const info = await page.evaluate(() => ({
    mode: document.documentElement.className,
    overflowX: document.documentElement.scrollWidth - window.innerWidth,
    threeLoaded: performance.getEntriesByType('resource').some((r) => /three-.*\.js/.test(r.name)),
    imgs: [...document.querySelectorAll('.chapter__img')].map((i) => i.currentSrc.split('/').pop()),
  }));
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: `${out}/${name}.png`, fullPage: true });
  console.log(name, JSON.stringify(info), logs.length ? logs : 'console clean');
  await ctx.close();
}
await browser.close();
