// Visual + numeric probe of the WebGL story: seeks each chapter, screenshots, checks
// terrain clearance and the altitude meter. Usage: node tests/probe.mjs [baseURL] [outDir] [w] [h]
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
const base = process.argv[2] || 'http://localhost:4173/';
const out = process.argv[3] || 'test-results/probe';
const W = +(process.argv[4] || 1280), H = +(process.argv[5] || 720);
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--ignore-gpu-blocklist', '--enable-webgl'] });
const page = await browser.newPage({ viewport: { width: W, height: H }, ignoreHTTPSErrors: true });
const errors = [];
const failed = [];
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(`${m.type()}: ${m.text()}`); });
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
page.on('response', (r) => { if (r.status() >= 400) failed.push(`${r.status()} ${r.url()}`); });
const t0 = Date.now();
await page.goto(base + (process.argv[6] || ''), { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.__k2 && window.__k2.api, null, { timeout: 180000 });
console.log(`ready in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
const points = (process.argv[7] || '0.02,0.2,0.4,0.57,0.75,0.9,0.99').split(',').map(Number);
for (const p of points) {
  await page.evaluate((p) => window.__k2.api.seek(p), p);
  await page.waitForTimeout(1200);
  const s = await page.evaluate(() => window.__k2.api.state());
  const altNum = parseInt(s.altimeterText.replace(/[^0-9]/g, ''), 10);
  console.log(`p=${p.toFixed(2)} ch=${s.chapter} cam=${s.camera.join(',')} clearance=${s.clearance} meter="${s.altimeterText}" Δ=${Math.abs(altNum - s.camera[1])}`);
  await page.screenshot({ path: `${out}/p${String(Math.round(p * 100)).padStart(3, '0')}.png` });
}
console.log('console:', errors.length ? errors.slice(0, 20) : 'clean');
console.log('http errors:', failed.length ? failed : 'none');
await browser.close();
