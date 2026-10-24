/**
 * Coherency gate: every authored scene, on every authored map.
 *
 * Seeded generation is retired, so this is not a sample of a seed space — it is
 * all eight `.island` files, which makes the gate finite and exhaustive rather
 * than statistical. For each map it boots the real game into scene-preview
 * mode, seats every set the scene names, checks each set's `requires` contract,
 * fast-forwards the scene in `instant` mode and asks every shot whether it can
 * see its subject.
 *
 * It runs the game rather than a model of it on purpose. A sightline is a
 * raycast against loaded world geometry; anything that reimplemented that would
 * be answering a different question from the one the player's camera asks.
 *
 * Mechanical evidence only. It proves a camera can see what it is pointed at.
 * It has never proved a frame is good, and the jury rule is unaffected.
 */
import { chromium } from 'playwright-core';

const MAPS = [
  'seed-1', 'seed-42', 'seed-777', 'seed-999',
  'seed-1234', 'seed-2026', 'seed-31337', 'seed-80085',
];
const SCENE = process.env.SCENE ?? 'kindly-opening';
const BASE = process.env.POSTMARK_URL ?? 'http://localhost:5173';
const HOLD = process.env.BEAT ?? 'handoff';

const app = await chromium.launch({ channel: 'chrome', headless: true });
const context = await app.newContext({ viewport: { width: 640, height: 480 } });

/** Play one map and hand back everything the gate asserts on. */
async function audit(map) {
  const page = await context.newPage();
  const errors = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(String(error)));
  await page.addInitScript(() => {
    window.__preview = [];
    window.addEventListener('message', (event) => window.__preview.push(event.data));
  });
  try {
    await page.goto(`${BASE}/?map=${map}&scene=${SCENE}&beat=${HOLD}`);
    await page.waitForSelector('canvas', { timeout: 30000 });
    await page.waitForFunction(
      () => window.__preview?.some((m) => m.type === 'preview:ready'),
      null,
      { timeout: 30000 },
    );
    const messages = await page.evaluate(() => window.__preview);
    const contract = await page.evaluate(() => window.__scenePreview?.contract?.() ?? []);
    const stranded = await page.evaluate(() => window.__scenePreview?.stranded?.() ?? []);
    const audit = await page.evaluate(() => window.__scenePreview?.audit?.() ?? []);
    const facings = await page.evaluate(() => window.__scenePreview?.facings?.() ?? []);
    return { map, messages, contract, stranded, audit, facings, errors };
  } catch (error) {
    return {
      map, messages: [], contract: [], stranded: [], audit: [], facings: [],
      errors: [...errors, String(error)],
    };
  } finally {
    await page.close();
  }
}

const results = [];
for (const map of MAPS) results.push(await audit(map));
await app.close();

let failed = 0;
for (const result of results) {
  const sightlines = result.messages.filter((m) => m.type === 'preview:sightlines').pop();
  const audit = result.audit;
  const beat = result.messages.filter((m) => m.type === 'preview:beat').pop();
  const problems = [];

  for (const violation of result.contract) {
    problems.push(`${violation.set}: ${violation.message}`);
  }
  // A mark the player cannot stand on is a soft-lock, and it is invisible to
  // every other check here: the scene plays, every shot is clear, the handoff
  // happens, and then the player is in water she cannot step out of. The host
  // nudges her to the nearest footing so it is survivable; this is what stops
  // it being silent.
  for (const { mark, nudge } of result.stranded ?? []) {
    problems.push(Number.isFinite(nudge)
      ? `player mark "${mark}" is not standable — nudged ${nudge}m to find footing`
      : `player mark "${mark}" has no standable ground within 2m`);
  }
  for (const error of result.errors) problems.push(`console: ${error}`);
  if (!beat) problems.push('the scene never reached a beat');
  else if (beat.playhead.history.at(-1) !== HOLD) {
    problems.push(`stopped at "${beat.playhead.history.at(-1)}", not "${HOLD}"`);
  }
  for (const report of sightlines?.reports ?? []) {
    if (report.error) problems.push(`shot ${report.shot}: ${report.error}`);
    else if (!report.report.clear) {
      problems.push(`shot ${report.shot}: cannot see subject ${report.report.blocked.join(', ')}`);
    }
  }
  // Sightline is not composition, and this is the half that was missing.
  //
  // `clearSightline` asks whether the camera can *see* a subject; a camera
  // behind somebody's head can. Every shot in the opening passed on every map
  // while four of them were pointed at the backs of heads — the spring acre is
  // placed at four different rotations and their azimuths were world bearings
  // tuned against one of them.
  //
  // `behind` is the cosine between an actor's forward vector and the direction
  // to the camera: +1 dead-on, 0 profile, -1 the back of the head. Measured at
  // the instant each shot was actually composed during the play, not on the
  // held frame — a held-frame reading can only answer for a subject who is
  // standing still, and reads every facing in the scene as whatever it was at
  // the last beat.
  //
  // **The player is exempt, and that is not a fudge.** She is the audience's
  // surrogate: shooting over her shoulder at what she is looking at is the
  // most ordinary framing in the sequence, and `wake`, `pier`, `spring-wide`,
  // `looming` and `farewell` are all deliberately behind her. Every shot this
  // check was built to catch framed somebody *else* — the recruit delivering
  // the line the ferry turns on, the Keeper delivering all of his — and for
  // those, the back of the head is never the intent.
  for (const { shot, actor, behind } of result.facings ?? []) {
    if (actor === 'player') continue;
    if (behind < -0.6) {
      problems.push(`shot ${shot}: framed on the back of ${actor}'s head (facing ${behind})`);
    }
  }

  const shots = beat?.playhead.history.length ?? 0;
  if (problems.length) {
    failed++;
    console.log(`FAIL ${result.map} (${shots} beats)`);
    for (const problem of problems) console.log(`       ${problem}`);
  } else {
    console.log(`ok   ${result.map} (${shots} beats, every shot clear)`);
  }
}

console.log(`\n${MAPS.length - failed}/${MAPS.length} maps seat both sets and pass every shot.`);
process.exit(failed ? 1 : 0);
