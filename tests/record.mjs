// Frame-by-frame "screen recording" of a full scroll (SwiftShader can't record live at
// a usable frame rate). node tests/record.mjs <outDir> <frames> <w> <h> [query]
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
const [, , out = 'test-results/record', n = '240', W = '1280', H = '720', query = '?high'] = process.argv;
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: +W, height: +H }, ignoreHTTPSErrors: true });
await page.goto(`http://localhost:4173/${query}`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.__k2 && window.__k2.api, null, { timeout: 180000 });
await page.addStyleTag({ content: '.card,.scroll-cue{transition-duration:.15s!important}' });
const N = +n;
for (let i = 0; i < N; i++) {
  // ease the scroll a little at both ends, like a person would
  const u = i / (N - 1);
  const p = u < 0.04 ? u * 0.5 : 0.02 + (u - 0.04) / 0.96 * 0.98;
  await page.evaluate((p) => window.__k2.api.seek(p), p);
  await page.waitForTimeout(i === 0 ? 1500 : 160);
  await page.screenshot({ path: `${out}/${String(i).padStart(4, '0')}.png`, timeout: 120000 });
  if (i % 20 === 0) console.log('frame', i, p.toFixed(3));
}
await browser.close();
