/**
 * Deterministic structural gate and human-review capture for W6.
 * The JSON line is the gate; screenshots are review evidence only.
 */
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright-core';

const url = process.env.POSTMARK_URL ?? 'http://localhost:5173';
const out = process.env.OUT_DIR ?? 'docs/review-queue/w6-resident-content';
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
await page.goto(url);
const content = await page.evaluate(async () => {
  const data = await import('/src/data/kindlyForward.ts');
  const cast = await import('/src/content/kindly-forward/cast.ts');
  return {
    residents: data.KINDLY_FORWARD_RESIDENT_CONTENT,
    relationships: data.KINDLY_FORWARD_RELATIONSHIPS,
    spine: data.KINDLY_FORWARD_STORY_SPINE,
    castIds: cast.KINDLY_FORWARD_CAST.members.map((member) => member.id),
  };
});

const ids = content.residents.map((resident) => resident.id);
const failures = [];
if (ids.length !== 8 || new Set(ids).size !== 8) failures.push('resident count/id uniqueness');
if (JSON.stringify([...ids].sort()) !== JSON.stringify([...content.castIds].sort())) failures.push('cast/content ids');
if (content.relationships.length !== 8) failures.push('relationship count');
if (new Set(content.residents.map((resident) => resident.letter.id)).size !== 8) failures.push('one unique letter each');
for (const resident of content.residents) {
  if (resident.dailyDialogue.length < 6) failures.push(`${resident.id}: daily dialogue`);
  if (Object.keys(resident.quest).sort().join(',') !== 'choice,pressure,recruit,resolution,reveal') {
    failures.push(`${resident.id}: five-beat quest`);
  }
  if (resident.heartScenes.length < 2) failures.push(`${resident.id}: heart scenes`);
  if (!resident.letter.requiredBuildings.length) failures.push(`${resident.id}: building gate`);
}
if (content.spine.acts.length !== 3) failures.push('three-act narrative spine');

const esc = (value) => String(value).replace(/[&<>"]/g, (char) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[char]
));
const shell = (title, cards) => `<!doctype html><style>
*{box-sizing:border-box}body{margin:0;padding:28px;background:#e9dfc8;color:#302b2a;font:16px Georgia,serif}
h1{margin:0 0 20px;font:700 30px system-ui;color:#623f47}.grid{display:grid;grid-template-columns:1fr 1fr;gap:16px}
article{background:#fffaf0;border:2px solid #b99a69;border-radius:12px;padding:18px;min-height:360px}
h2{margin:0 0 9px;color:#8b3f45;font:700 22px system-ui}h3{margin:13px 0 4px;font:700 13px system-ui;text-transform:uppercase;letter-spacing:.08em}
p{margin:0 0 7px;line-height:1.38}.tag{font:12px system-ui;color:#775d43}
</style><h1>${esc(title)}</h1><div class=grid>${cards}</div>`;
const questCard = (resident) => `<article><h2>${esc(resident.id)}</h2><div class=tag>${esc(resident.role)}</div>${
  Object.entries(resident.quest).map(([beat, text]) => `<h3>${esc(beat)}</h3><p>${esc(text)}</p>`).join('')
}</article>`;
const heartCard = (resident) => `<article><h2>${esc(resident.id)}</h2>${
  resident.heartScenes.map((scene) => `<h3>${esc(scene.title)} · ${esc(scene.register)}</h3>${
    scene.beats.map((beat) => `<p>${esc(beat)}</p>`).join('')
  }`).join('')
}</article>`;
await page.setContent(shell('Quest resolutions — human review', content.residents.map(questCard).join('')));
await page.screenshot({ path: `${out}/quest-resolutions.png`, fullPage: true });
await page.setContent(shell('Heart scenes — human review', content.residents.map(heartCard).join('')));
await page.screenshot({ path: `${out}/heart-scenes.png`, fullPage: true });
await browser.close();

const summary = {
  residents: ids,
  letters: content.residents.map((resident) => resident.letter.id),
  dailySets: content.residents.map((resident) => resident.dailyDialogue.length),
  questBeats: content.residents.map((resident) => Object.keys(resident.quest).length),
  heartScenes: content.residents.map((resident) => resident.heartScenes.length),
  relationships: content.relationships,
  acts: content.spine.acts.map((act) => act.id),
};
console.log(JSON.stringify(summary));
if (failures.length) {
  console.error(failures);
  process.exitCode = 1;
}
