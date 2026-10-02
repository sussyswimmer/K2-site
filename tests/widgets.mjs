// Screenshot each inline widget on the static page (and exercise a few controls).
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
const out = 'test-results/widgets';
mkdirSync(out, { recursive: true });
const only = (process.argv[2] || 'packer,oxygen,timeline,routes,weather,compare,quiz').split(',');
const W = +(process.argv[3] || 1100);
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: W, height: 900 }, ignoreHTTPSErrors: true });
const logs = [];
page.on('console', (m) => { if (['error', 'warning'].includes(m.type())) logs.push(m.text().slice(0, 200)); });
page.on('pageerror', (e) => logs.push('pageerror ' + e.message));
await page.goto('http://localhost:4173/?nowebgl', { waitUntil: 'networkidle' });
for (const name of only) {
  const el = await page.$(`[data-mount="${name}"]`);
  await el.scrollIntoViewIfNeeded();
  await page.waitForFunction((n) => document.querySelector(`[data-mount="${n}"]`).children.length > 0, name, { timeout: 15000 }).catch(() => logs.push(`${name} did not mount`));
  await page.waitForTimeout(700);
  if (name === 'packer') {
    for (const id of ['oxygen', 'axe', 'tent']) await page.click(`[data-mount="packer"] .pack-item[data-id="${id}"]`);
    // drag crampons into the bag with the pointer
    const it = await page.$('[data-mount="packer"] .pack-item[data-id="crampons"]');
    const bag = await page.$('[data-mount="packer"] .pack-bag');
    const a = await it.boundingBox(), b = await bag.boundingBox();
    await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2); await page.mouse.down();
    await page.mouse.move(b.x + b.width / 2, b.y + b.height - 40, { steps: 10 }); await page.mouse.up();
    await page.click('[data-mount="packer"] [data-check]');
  }
  if (name === 'oxygen') { await page.click('[data-mount="oxygen"] .chip[data-h="8611"]'); }
  if (name === 'routes') { await page.click('[data-mount="routes"] [data-route="cesen"]'); await page.waitForTimeout(600); }
  if (name === 'weather') { await page.click('[data-mount="weather"] [data-m="1"]'); await page.waitForTimeout(600); }
  if (name === 'quiz') { await page.click('[data-mount="quiz"] .quiz__opts button'); }
  if (name === 'timeline') { await page.keyboard.press('Tab'); }
  await el.screenshot({ path: `${out}/${name}-${W}.png` });
  console.log('shot', name);
}
console.log(logs.length ? logs : 'console clean');
await browser.close();
