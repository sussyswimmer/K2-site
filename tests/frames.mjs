// Renders story frames with the UI hidden (for rail tuning, stills, the scroll video).
// node tests/frames.mjs <outDir> <p1,p2,...> [w] [h] [query] [hideUI=1]
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
const [, , out = 'test-results/frames', list = '0.02,0.16,0.27,0.37,0.44,0.53,0.64,0.72,0.81,0.88,0.94,0.99', W = '1280', H = '720', query = '?high&autostart', hide = '1'] = process.argv;
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: +W, height: +H }, ignoreHTTPSErrors: true });
await page.goto(`http://localhost:4173/${query}`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.__k2 && window.__k2.api, null, { timeout: 180000 });
if (hide === '1') await page.addStyleTag({ content: '.story,.hud,.altimeter,#labels,.grain{display:none!important}' });
for (const p of list.split(',').map(Number)) {
  await page.evaluate((p) => window.__k2.api.seek(p), p);
  await page.waitForTimeout(900);
  const s = await page.evaluate(() => window.__k2.api.state());
  await page.screenshot({ path: `${out}/f${String(Math.round(p * 1000)).padStart(4, '0')}.png`, timeout: 120000 });
  console.log(p, s.chapter, s.camera.join(','), 'clr', s.clearance);
}
await browser.close();
