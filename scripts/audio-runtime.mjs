/**
 * Runtime audio gate: boots the real game in a real browser and checks the
 * things that can only be wrong at runtime.
 *
 * `scripts/music-shape.mjs` checks what the composer writes; it never
 * constructs an AudioContext. This checks that the graph actually builds, that
 * notes actually get scheduled through the new instruments, and that the three
 * behavioural bugs from `MUSIC_LEARNINGS.md` §6 stay fixed:
 *
 *  - §6.4 the unmute burst (muted music left its clocks in the past, so
 *    re-enabling scheduled every missed note at once)
 *  - §6.5 outdoor wildlife playing indoors
 *  - §6.7 staged scenes having no music cue of their own
 *
 *   PORT=5175 node scripts/audio-runtime.mjs
 */
import { chromium } from 'playwright-core';

const PORT = process.env.PORT ?? '5173';
const app = await chromium.launch({ channel: 'chrome', headless: true });
const context = await app.newContext({ viewport: { width: 960, height: 720 } });
const page = await context.newPage();

const errors = [];
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(m.text());
});
page.on('pageerror', (e) => errors.push(String(e)));

await page.addInitScript(() => {
  localStorage.setItem('postmark-save-v3-slot-1', JSON.stringify({
    version: 3, playerName: 'Postmaster', createdAt: Date.now(), playedSeconds: 7200,
    player: { x: 0, z: 8, coatItemId: null, equippedTool: null },
    inventory: { slots: [], gears: 2500 },
    museum: [], discovered: [], questSteps: {}, completedQuests: [],
    reactivatedNpcs: ['albert', 'mira'], constructedBuildings: [],
    unlockedZones: ['town'], placedFurniture: [],
    lastDigRefresh: Date.now(), introSeen: true, houseTier: 1,
  }));
});

await page.goto(`http://localhost:${PORT}`);
await page.waitForSelector('canvas');
await page.waitForTimeout(1200);
await page.keyboard.press('Space');
await page.waitForTimeout(400);
await page.keyboard.press('Enter');
await page.waitForTimeout(2500);

const failures = [];
const audio = () => page.evaluate(() => window.__postmark.audio());

// 1. The graph builds and the new instruments actually schedule notes.
//    Red when: any synthesis path throws — a bad node type, a missing
//    createStereoPanner, an AudioBuffer of length zero.
const boot = await audio();
if (!(boot.scheduledMusicNotes > 0)) {
  failures.push(`no music scheduled after boot (${boot.scheduledMusicNotes} notes, theme ${boot.active})`);
}

// 2. Unmute does not dump a burst of past-due notes.
//
//    The old scheduler returned early while muted without advancing its clocks,
//    so twelve seconds off scheduled ~20 notes with 18 start times in the past,
//    which WebAudio clamps to now — one audible cluster. The fix walks the
//    cursors forward silently, so the count over a mute window should look like
//    an ordinary stretch of playing, not a spike.
//    The threshold has to be measured rather than guessed. Drift form is sparse
//    — a pad note lasts six to eight bars — so an absolute note count that
//    would be damning for dense music is unremarkable here. Baseline the rate
//    during ordinary playback first, then require that unmuting costs about one
//    lookahead window and not the whole backlog.
const MUTE_SECONDS = 20;
const rateStart = (await audio()).scheduledMusicNotes;
await page.waitForTimeout(5000);
const rateEnd = (await audio()).scheduledMusicNotes;
const notesPerSecond = (rateEnd - rateStart) / 5;

// Grab the exact module instance the page loaded. Importing the bare specifier
// hands back a second singleton once Vite has appended a `?t=` version.
await page.evaluate(() => {
  const url = performance.getEntriesByType('resource').map((r) => r.name)
    .find((n) => n.includes('/src/core/AudioSystem.ts'));
  return import(url).then((m) => { window.__pmAudio = m.audio; });
});

const beforeMute = (await audio()).scheduledMusicNotes;
await page.evaluate(() => window.__pmAudio.setMusicEnabled(false));
await page.waitForTimeout(MUTE_SECONDS * 1000);
const duringMute = (await audio()).scheduledMusicNotes;
await page.evaluate(() => window.__pmAudio.setMusicEnabled(true));
await page.waitForTimeout(600);
const afterUnmute = (await audio()).scheduledMusicNotes;

const mutedNotes = duringMute - beforeMute;
const burst = afterUnmute - duringMute;
// What the backlog would have been if the clocks had stayed in the past.
const backlog = notesPerSecond * MUTE_SECONDS;
const allowed = Math.max(4, notesPerSecond * 2);
if (mutedNotes !== 0) failures.push(`scheduled ${mutedNotes} notes while muted, expected 0`);
if (burst > allowed) {
  failures.push(
    `unmute burst: ${burst} notes in 600ms (allowed ${allowed.toFixed(1)}, ` +
      `full backlog would be ~${backlog.toFixed(0)})`,
  );
}

// 3. No wildlife indoors.
//
//    Red when: the `indoors` flag stops reaching updateAmbience, or the early
//    return on bird/cricket spawning is removed.
await page.evaluate(() => { window.__postmark.game.enterInterior('house-player'); });
await page.waitForTimeout(2000);
const indoorStart = await audio();
if (!indoorStart.indoors) failures.push('entered an interior but audio still reports indoors=false');
// Noon so birds would fire, then a long window inside.
await page.evaluate(() => {
  const now = new Date();
  const current = now.getHours() + now.getMinutes() / 60;
  window.__postmark.timeOffset(12.5 - current);
});
await page.waitForTimeout(9000);
const indoorEnd = await audio();
const birds = (indoorEnd.events.bird ?? 0) - (indoorStart.events.bird ?? 0);
const crickets = (indoorEnd.events.cricket ?? 0) - (indoorStart.events.cricket ?? 0);
if (birds > 0) failures.push(`${birds} bird chirps while indoors`);
if (crickets > 0) failures.push(`${crickets} cricket pulses while indoors`);

// 4. Outdoors, wildlife still happens — the fix must not have silenced it.
await page.evaluate(() => { window.__postmark.game.exitInterior(); });
await page.waitForTimeout(9000);
const outdoor = await audio();
const outdoorBirds = (outdoor.events.bird ?? 0) - (indoorEnd.events.bird ?? 0);
if (outdoor.indoors) failures.push('left the interior but audio still reports indoors=true');
if (outdoorBirds === 0) failures.push('no birds outdoors at midday — ambience silenced entirely');

// 5. Staged scenes have their own cue.
//    Red when: sceneTheme stops being consulted by currentTheme().
const sceneTheme = await page.evaluate(() => {
  const game = window.__postmark.game;
  game.sceneTheme = 'scene-heart';
  const name = game.currentTheme();
  game.sceneTheme = null;
  return name;
});
if (sceneTheme !== 'scene-heart') {
  failures.push(`scene override ignored: currentTheme() returned ${sceneTheme}`);
}

console.log('AUDIO RUNTIME:', JSON.stringify({
  theme: boot.active,
  notesAtBoot: boot.scheduledMusicNotes,
  notesPerSecond: +notesPerSecond.toFixed(2),
  scheduledWhileMuted: mutedNotes,
  unmuteBurst: burst,
  burstAllowed: +allowed.toFixed(1),
  fullBacklogWouldBe: Math.round(backlog),
  indoorBirds: birds,
  indoorCrickets: crickets,
  outdoorBirds,
  sceneTheme,
  consoleErrors: errors.length,
  failures: failures.length,
}));
if (failures.length) {
  console.log('FAILURES:');
  for (const f of failures) console.log('  -', f);
}
if (errors.length) console.log('CONSOLE ERRORS:', errors.slice(0, 5));

await context.close();
await app.close();
process.exitCode = failures.length || errors.length ? 1 : 0;
