/**
 * W6.5 activation check: boot the game with the Kindly Forward pack selected
 * and assert that the authored content is actually live — the eight residents
 * spawn, their authored day dialogue is reachable, their letters resolve
 * through MailSystem, and their arcs are in the quest table.
 *
 * Mechanical only. It proves the content is wired, never that it is good.
 * Run: node scripts/kindly-activation.mjs (dev server on :5173).
 */
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';

const SHOTS = process.env.SHOTS_DIR ?? '/tmp/kindly-activation';
mkdirSync(SHOTS, { recursive: true });

const EXPECTED = ['albert', 'mira', 'rowan', 'liliane', 'amina', 'niko', 'maeve', 'vittorio'];

const app = await chromium.launch({ channel: 'chrome', headless: true });
const page = await (await app.newContext({ viewport: { width: 960, height: 720 } })).newPage();

const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push(String(e)));

await page.addInitScript(() => {
  try { localStorage.removeItem('postmark-save-v3-slot-1'); } catch {}
});
const baseUrl = process.env.KINDLY_URL ?? 'http://localhost:5173';
await page.goto(`${baseUrl}/?pack=kindly-forward`);
await page.waitForSelector('canvas', { timeout: 15000 });
await page.waitForTimeout(1500);

// Title -> new game -> run the opening to the name prompt.
await page.keyboard.press('Space');
await page.waitForTimeout(600);
await page.keyboard.press('Enter');
await page.waitForTimeout(3500);
for (let i = 0; i < 60; i++) {
  const ready = await page.evaluate(() => {
    const input = document.querySelector('input');
    return input && input.closest('.pm-panel')?.style.display !== 'none';
  });
  if (ready) break;
  await page.keyboard.press('KeyE');
  await page.waitForTimeout(300);
}
await page.keyboard.type('Homura');
await page.keyboard.press('Enter');
await page.waitForTimeout(250);
await page.keyboard.press('Enter'); // accept the prefilled St. Mystere assignment
await page.waitForTimeout(500);

// Drain the rest of the opening. Only advance with [E] once the name and
// island fields are gone, or the keypresses are typed into them instead.
const inPlay = () => page.evaluate(() => window.__postmark?.game.state === 'play');
for (let i = 0; i < 300; i++) {
  if (await inPlay()) break;
  const typing = await page.evaluate(() => {
    const input = document.querySelector('input');
    return Boolean(input && input.closest('.pm-panel')?.style.display !== 'none');
  });
  if (typing) { await page.keyboard.press('Enter'); await page.waitForTimeout(250); continue; }
  await page.keyboard.press('KeyE');
  await page.waitForTimeout(200);
}
if (!(await inPlay())) {
  console.error('FAIL: the opening never reached the play state; frames would be worthless.');
  await page.screenshot({ path: `${SHOTS}/00-stuck.png` });
  await app.close();
  process.exit(1);
}
await page.waitForTimeout(1200);
await page.screenshot({ path: `${SHOTS}/01-activated-town.png` });

const report = await page.evaluate(async (expected) => {
  const pm = window.__postmark;
  const g = pm.game;
  const npcs = [...g.npcs.values()];
  const { activeLetters } = await import('/src/content/activePack.ts');
  // Simulated end-state: every resident housed and every space built. This
  // asks "is each authored letter reachable at all", not "is it reachable now".
  const residency = {
    storyReady: true,
    residents: new Set(expected),
    buildings: new Set(activeLetters().flatMap((letter) => letter.requiredBuildings ?? [])),
  };
  return {
    pack: new URLSearchParams(location.search).get('pack'),
    spawned: npcs.map((n) => n.id).sort(),
    displayNames: npcs.map((n) => n.displayName).sort(),
    quests: pm.quests ? undefined : undefined,
    letters: g.mail.available(residency).map((l) => ({
      id: l.id,
      target: l.target,
      contents: l.contents.length,
      reaction: Boolean(l.reaction?.length),
      fragment: Boolean(l.fragment),
    })),
  };
}, EXPECTED);

const questReport = await page.evaluate(() => {
  const pm = window.__postmark;
  const out = [];
  // Walk the whole table by reading the tracker at each index.
  const q = pm.quests;
  const startIndex = q.questIndex;
  const startStep = q.step;
  for (let i = 0; i < 40; i++) {
    q.questIndex = i;
    q.step = 0;
    if (!q.active) break;
    out.push({ id: q.active.id, title: q.active.title, steps: q.active.steps.length });
  }
  q.questIndex = startIndex;
  q.step = startStep;
  return out;
});

// Authored day dialogue must be reachable from a real conversation.
const dialogue = [];
for (const id of EXPECTED) {
  const ok = await page.evaluate((id) => {
    const pm = window.__postmark;
    const npc = pm.game.npcs.get(id);
    if (!npc) return null;
    return pm.game.contextIdle(npc);
  }, id);
  dialogue.push({ id, lines: ok });
}

// Review evidence: each resident, mid-conversation, at gameplay scale.
// Daylight, and talkTo() is called on the named resident rather than trusting
// [E] to pick them — the cast clusters, so proximity picks the wrong one.
await page.evaluate(() => window.__postmark.timeOffset(10 - new Date().getHours()));
await page.waitForTimeout(1200);

const framed = [];
for (const id of EXPECTED) {
  const spoke = await page.evaluate((id) => {
    const pm = window.__postmark;
    const npc = pm.game.npcs.get(id);
    if (!npc) return null;
    pm.warp(npc.position.x + 1.7, npc.position.z + 1.7);
    pm.game.talkTo(npc);
    return npc.displayName;
  }, id);
  if (!spoke) continue;
  await page.waitForTimeout(900);
  // Confirm the dialogue on screen belongs to the resident we asked for.
  const speaker = await page.evaluate(() => document.body.innerText ?? '');
  await page.screenshot({ path: `${SHOTS}/resident-${id}.png` });
  framed.push({ id, displayName: spoke, showsName: speaker.includes(spoke) });
  for (let i = 0; i < 12; i++) { await page.keyboard.press('Escape'); await page.waitForTimeout(80); }
  await page.waitForTimeout(200);
}
console.log('FRAMED:', JSON.stringify(framed));
const misframed = framed.filter((f) => !f.showsName).map((f) => f.id);

await app.close();

const missing = EXPECTED.filter((id) => !report.spawned.includes(id));
const silent = dialogue.filter((d) => !d.lines || !d.lines.length || d.lines[0] === '...');
const letterIds = report.letters.map((l) => l.id).sort();
const questIds = questReport.map((q) => q.id).sort();

console.log('PACK:', report.pack);
console.log('SPAWNED:', report.spawned.join(', '));
console.log('QUESTS:', JSON.stringify(questReport, null, 1));
console.log('LETTERS:', JSON.stringify(report.letters, null, 1));
console.log('DAY DIALOGUE:', JSON.stringify(dialogue, null, 1));
console.log('CONSOLE ERRORS:', errors.length ? errors : 'none');

const failures = [];
if (missing.length) failures.push(`residents did not spawn: ${missing.join(', ')}`);
if (silent.length) failures.push(`no authored day dialogue: ${silent.map((s) => s.id).join(', ')}`);
if (letterIds.length !== 8) failures.push(`expected 8 claimable letters, got ${letterIds.length}`);
if (questIds.length !== 8) failures.push(`expected 8 resident arcs, got ${questIds.length}`);
if (errors.length) failures.push(`${errors.length} console error(s)`);
if (misframed.length) failures.push(`frame does not show the named speaker: ${misframed.join(', ')}`);

// Authoring gaps that are known and deliberately visible, not failures.
const gaps = [];
const noReaction = report.letters.filter((l) => !l.reaction).map((l) => l.id);
const noFragment = report.letters.filter((l) => !l.fragment).map((l) => l.id);
if (noReaction.length) gaps.push(`${noReaction.length}/8 letters have no authored recipient reaction`);
if (noFragment.length) gaps.push(`${noFragment.length}/8 letters have no authored truth fragment`);

if (gaps.length) console.log('KNOWN AUTHORING GAPS (W6):\n - ' + gaps.join('\n - '));

if (failures.length) {
  console.error('FAIL:\n - ' + failures.join('\n - '));
  process.exit(1);
}
console.log('ACTIVATION OK — Kindly Forward content is live and reachable.');
