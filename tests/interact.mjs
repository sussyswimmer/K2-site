// Interaction smoke test for the WebGL story.
import { chromium, devices } from '@playwright/test';
import { mkdirSync } from 'node:fs';
const out = 'test-results/interact';
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--ignore-gpu-blocklist'] });
const results = [];
const ok = (name, cond, extra = '') => { results.push(`${cond ? 'PASS' : 'FAIL'} ${name} ${extra}`); };

async function run(label, ctxOpts, mobile) {
  const ctx = await browser.newContext({ ...ctxOpts, ignoreHTTPSErrors: true });
  const page = await ctx.newPage();
  const logs = [];
  page.on('console', (m) => { if (['error', 'warning'].includes(m.type())) logs.push(`${m.type()}: ${m.text().slice(0, 160)}`); });
  page.on('pageerror', (e) => logs.push(`pageerror: ${e.message}`));
  page.on('response', (r) => { if (r.status() >= 400) logs.push(`HTTP ${r.status()} ${r.url()}`); });
  await page.goto('http://localhost:4173/?high', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__k2?.api, null, { timeout: 180000 });
  ok(`${label} loader hidden`, await page.$eval('#loader', (e) => e.classList.contains('is-done')));
  // units toggle
  await page.click('[data-units="ft"]');
  ok(`${label} units ft`, (await page.textContent('#ch-0 [data-m="8611"]')).includes('28,251 ft'));
  await page.click('[data-units="m"]');
  // seek to the climb, click a camp hotspot
  await page.evaluate(() => window.__k2.api.seek(0.62));
  await page.waitForTimeout(1500);
  const visible = await page.$$eval('.hotspot:not(.is-hidden)', (els) => els.map((e) => e.dataset.id));
  ok(`${label} climb hotspots`, visible.includes('camp-2') && visible.includes('camp-4'), visible.join(','));
  if (mobile) await page.click('.chapter.is-active .card__toggle');
  await page.waitForTimeout(300);
  await page.click('.hotspot[data-id="camp-2"]', { force: true });
  await page.waitForTimeout(400);
  ok(`${label} side panel opens`, await page.$eval('#sidepanel', (e) => !e.hidden));
  await page.screenshot({ path: `${out}/${label}-hotspot.png`, timeout: 120000 });
  await page.keyboard.press('Escape');
  ok(`${label} side panel closes on Esc`, await page.$eval('#sidepanel', (e) => e.hidden));
  if (mobile) await page.click('.chapter.is-active .card__toggle');
  // widget drawer
  await page.click('#ch-3 [data-widget="routes"]');
  await page.waitForTimeout(500);
  ok(`${label} drawer opens`, await page.$eval('#drawer', (e) => !e.hidden));
  await page.keyboard.press('Escape');
  ok(`${label} drawer closes`, await page.$eval('#drawer', (e) => e.hidden));
  // explore mode
  if (!mobile) {
    await page.click('#explore-toggle');
    await page.waitForTimeout(800);
    ok(`${label} explore on`, await page.evaluate(() => document.documentElement.classList.contains('is-exploring')));
    const box = await page.$eval('#scene', (c) => { const r = c.getBoundingClientRect(); return [r.width / 2, r.height / 2]; });
    await page.mouse.move(box[0], box[1]);
    await page.mouse.down();
    await page.mouse.move(box[0] + 220, box[1] + 40, { steps: 8 });
    await page.mouse.up();
    await page.mouse.wheel(0, 1200);
    await page.waitForTimeout(1200);
    const s = await page.evaluate(() => window.__k2.api.state());
    ok(`${label} explore clearance >= 60`, s.clearance >= 59, `clearance=${s.clearance}`);
    await page.click('[data-layer="contours"]');
    await page.click('[data-layer="section"]');
    await page.waitForTimeout(800);
    await page.screenshot({ path: `${out}/${label}-explore.png`, timeout: 120000 });
    await page.click('#explore-exit');
    await page.waitForTimeout(1600);
    ok(`${label} explore off`, !(await page.evaluate(() => document.documentElement.classList.contains('is-exploring'))));
  }
  // nav dot jump (smooth scroll) → chapter 5
  await page.click('.hud__chapters a[data-jump="5"]', { force: true });
  await page.waitForTimeout(4500);
  const st = await page.evaluate(() => window.__k2.api.state());
  ok(`${label} nav jump to summit`, st.chapter === 5, `chapter=${st.chapter} p=${st.p.toFixed(3)}`);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  ok(`${label} no horizontal overflow`, overflow <= 0, `overflow=${overflow}`);
  await page.screenshot({ path: `${out}/${label}-summit.png`, timeout: 120000 });
  ok(`${label} console clean`, logs.length === 0, logs.join(' | '));
  await ctx.close();
}
await run('desktop', { viewport: { width: 1280, height: 720 } }, false);
await run('iphone14', { ...devices['iPhone 14'], defaultBrowserType: undefined }, true);
console.log(results.join('\n'));
await browser.close();
