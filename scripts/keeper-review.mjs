import { chromium } from 'playwright-core';
import { mkdirSync, writeFileSync } from 'node:fs';
const dir = 'docs/review-queue/keeper-v01';
mkdirSync(`${dir}/motion`, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const context = await browser.newContext({ viewport: { width: 960, height: 800 }, recordVideo: { dir: `${dir}/motion`, size: { width: 960, height: 800 } } });
const page = await context.newPage();
const errors = [];
page.on('pageerror', e => errors.push(String(e)));
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
await page.goto('http://127.0.0.1:5173/docs/review-queue/keeper-v01/index.html');
await page.waitForFunction(() => window.keeperReview);
const report = await page.evaluate(() => {
  const review = window.keeperReview;
  const skins = []; review.model.traverse(o => { if (o.isSkinnedMesh) skins.push(o.name); });
  return { clips: review.clips, skins };
});
if (report.clips.length !== 4 || !report.skins.length) throw new Error('Missing clips or skin');
for (const clip of report.clips) {
  await page.evaluate(name => { window.keeperReview.select(name); window.keeperReview.play(); }, clip.name);
  await page.waitForTimeout((clip.duration + .25) * 1000);
  await page.evaluate(({ name, duration }) => window.keeperReview.pose(name, duration / 2), clip);
  await page.waitForTimeout(100);
  await page.screenshot({ path: `${dir}/glb-${clip.name}.png` });
}
report.errors = errors;
writeFileSync(`${dir}/playback.json`, JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
await context.close();
await Promise.race([browser.close(), new Promise(resolve => setTimeout(() => { console.warn('Browser shutdown exceeded 10s; playback results above are complete.'); resolve(); }, 10000))]);
process.exit(errors.length ? 1 : 0);
