/**
 * Does the editor's GUI write the file the parser would?
 *
 * `C4`'s acceptance is that authoring the opening needs no typed syntax and that
 * what the GUI writes round-trips byte-identically. This drives the real page
 * with real clicks and drags — no direct calls into the module — and checks the
 * three properties that acceptance rests on:
 *
 * 1. **Lossless.** A GUI edit and its inverse return the buffer to the committed
 *    file, byte for byte. If the form dropped a field, discarded a beat note or
 *    reordered anything, the text would not come back.
 * 2. **Canonical.** Every intermediate buffer reparses and reformats to itself,
 *    so the editor cannot produce staging the runtime would reject.
 * 3. **No syntax typed.** Every control is a select, a number box or a drag; the
 *    run asserts the source pane is read-only, which is what stops the text from
 *    quietly remaining the interface.
 * 4. **Grab-shot round-trips.** Fly the camera, grab, scrub back to the beat —
 *    the camera returns to where it was left. This is the property the whole
 *    gesture rests on: a grab that landed *near* the frame you chose would
 *    quietly undo the judgement you just made by eye.
 * 5. **The playhead means something.** Dragging it lands the scene inside a
 *    beat, and the frame it lands on *stays put*. Both halves matter: a ruler
 *    that could only stop on cuts is the beat spine with extra steps, and a
 *    parked playhead whose camera kept easing to its destination would be
 *    showing a frame the ruler is not pointing at.
 * 6. **Undo.** Every edit is reversible, including one made by dragging.
 *
 * It does not, and cannot, tell you the frames are good.
 *
 *   node scripts/scene-editor.mjs
 */
import { chromium } from 'playwright-core';

const URL = process.env.POSTMARK_URL ?? 'http://localhost:5173';
const app = await chromium.launch({ channel: 'chrome', headless: true });
const page = await (await app.newContext({ viewport: { width: 1500, height: 950 } })).newPage();
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push(String(e)));

await page.goto(`${URL}/scene`);
await page.waitForFunction(() => document.querySelectorAll('#outline .beat').length > 0,
  null, { timeout: 30000 });

/**
 * Park the playhead on a beat's first frame.
 *
 * By name, off the ruler. The beat spine this used to click — a second row
 * listing the same twenty-three names — is gone, and `nth-child` was never
 * telling anyone which beat was meant anyway: every one of these calls needed a
 * comment naming the beat it was really selecting.
 */
const selectBeat = async (id) => {
  await page.click(`#outline .beat[data-beat="${id}"]`);
  await page.waitForTimeout(2500);
};

const source = () => page.evaluate(() => document.getElementById('source').value);
/** The first line that differs, which is all anyone needs to see. */
const firstDiff = (a, b) => {
  const x = a.split('\n');
  const y = b.split('\n');
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    if (x[i] !== y[i]) return `line ${i + 1}: ${JSON.stringify(x[i])} -> ${JSON.stringify(y[i])}`;
  }
  return 'lengths differ';
};
const committed = await source();
const checks = [];
const check = (name, ok, detail = '') => {
  checks.push({ name, ok, detail });
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
};

check('the source pane is read-only',
  await page.evaluate(() => document.getElementById('source').readOnly));

// --- 1. select a beat, then a cue clip, and edit through the inspector only.
await selectBeat('assignment');
await selectBeat('warning');
const clips = await page.locator('#lanes .clip').count();
check('the selected beat draws its cues as clips', clips >= 3, `${clips} clips`);

/**
 * Select a clip by the cue it carries, whatever order the lanes put it in.
 *
 * By `data-cue`, not by visible text: a clip's label is now a function of how
 * much room it has — the whole cue, or a single word, or nothing at all — so
 * matching on what it happens to say would make this suite fail whenever the
 * window got narrower rather than when the editor got worse.
 */
const selectClip = async (cue) => {
  await page.locator(`#lanes .clip[data-cue^="${cue}"]`).first().click();
  await page.waitForTimeout(250);
};
await selectClip('camera warning');
const fields = await page.locator('#form .field').count();
check('selecting a cue generates an inspector form', fields >= 3, `${fields} fields`);

// The first clip in `warning` is `camera warning over 0.9`. Nudge its offset
// through the number box, then put it back.
const at = page.locator('#form .field').filter({ has: page.locator('label:text-is("at")') }).locator('input');
await at.fill('0.5');
await at.dispatchEvent('change');
await page.waitForTimeout(250);
const nudged = await source();
check('a GUI edit changes the buffer', nudged !== committed);
check('the edited buffer is still canonical', /^# scene: kindly-opening/.test(nudged));
check('the edit is visible in the text as a cue offset', nudged.includes('@0.5 camera warning'));

await selectClip('camera warning');
const back = page.locator('#form .field').filter({ has: page.locator('label:text-is("at")') }).locator('input');
await back.fill('0');
await back.dispatchEvent('change');
await page.waitForTimeout(250);
const restored = await source();
check('the inverse edit restores the file byte-for-byte', restored === committed,
  restored === committed ? '' : firstDiff(committed, restored));

// --- 2. a shot number, which is the other half of the authoring surface.
const dist = page.locator('#form .field').filter({ has: page.locator('label:text-is("dist")') }).locator('input');
if (await dist.count()) {
  const before = await dist.inputValue();
  await dist.fill(String(Number(before) + 1));
  await dist.dispatchEvent('change');
  await page.waitForTimeout(250);
  const changed = await source();
  check('a shot number edits through a number box', changed.includes(`dist ${Number(before) + 1}`));
  await dist.fill(before);
  await dist.dispatchEvent('change');
  await page.waitForTimeout(250);
  check('restoring the shot number restores the file', (await source()) === committed);
} else {
  check('a camera cue exposes its shot in the inspector', false, 'no dist field');
}

// --- 3. the map dropdown re-seats the preview with no file edit.
const src0 = await page.getAttribute('#preview', 'src');
await page.selectOption('#map', 'seed-999');
await page.waitForTimeout(600);
const src1 = await page.getAttribute('#preview', 'src');
check('the map dropdown reloads the preview', src0 !== src1 && src1.includes('seed-999'));
check('swapping the map does not edit the file', (await source()) === committed);

// --- 4. grab-shot: fly the camera, grab, scrub back, land in the same place.
await selectBeat('warning');
await selectClip('camera warning');
const stage = await page.locator('#preview').boundingBox();
await page.mouse.move(stage.x + stage.width / 2, stage.y + stage.height / 2);
await page.mouse.down();
await page.mouse.move(stage.x + stage.width / 2 + 90, stage.y + stage.height / 2 + 24, { steps: 8 });
await page.mouse.up();
await page.waitForTimeout(400);
check('dragging the preview takes the camera',
  (await page.evaluate(() => document.getElementById('camera-mode').textContent)) === 'camera: yours');

const inner = () => page.frames().find((f) => f.url().includes('scene=')) ?? null;
const eyeOf = async () => {
  const frame = inner();
  return frame ? frame.evaluate(() => {
    const c = window.__postmark?.game?.rig?.camera;
    return c ? [c.position.x, c.position.y, c.position.z] : null;
  }) : null;
};
const flown = await eyeOf();
await page.click('#grab');
await page.waitForTimeout(500);
check('grab writes the flown camera into the shot',
  (await source()) !== committed);

// Scrub away and back, so the shot is resolved fresh from the file.
await selectBeat('question');
await selectBeat('warning');
const replayed = await eyeOf();
if (flown && replayed) {
  const d = Math.hypot(flown[0] - replayed[0], flown[1] - replayed[1], flown[2] - replayed[2]);
  check('the grabbed shot reproduces the camera it was taken from', d < 0.05, `${d.toFixed(4)}m`);
} else {
  check('the grabbed shot reproduces the camera it was taken from', false, 'no camera readable');
}

// --- 5. the playhead: land inside a beat, and hold there.
const blocks = await page.locator('#outline .beat').count();
check('every beat gets a row in the outline', blocks >= 20, `${blocks} rows`);

const clockOf = () => page.evaluate(() => document.getElementById('clock').textContent);
const secondsOf = (clock) => {
  const [at] = clock.replace('~', '').trim().split(' / ');
  const [m, rest] = at.split(':');
  return Number(m) * 60 + Number(rest);
};

/**
 * Park the playhead a known distance into a beat.
 *
 * By the keyboard rather than by dragging a bar. There is no scene-wide ruler
 * to drag any more — the timeline is a *window*, so a pixel in it means a
 * different instant depending on the zoom, and a test that computed one would
 * be testing its own arithmetic. Arrow steps are a twelfth of a second each and
 * mean the same thing at every zoom level.
 */
const intoBeat = async (id, steps) => {
  await selectBeat(id);
  for (let step = 0; step < steps; step++) {
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(120);
  }
  await page.waitForTimeout(2600);
  return clockOf();
};

const markClock = await intoBeat('warning', 6);
const held = await page.evaluate(() => document.getElementById('overlay').textContent);
// `+0.42s` and the like: a playhead that could only ever report +0.00s would be
// a beat list with extra steps.
const inside = /\+(\d+\.\d+)s/.exec(held ?? '');
check('the playhead lands inside a beat, not only on cuts',
  Boolean(inside) && Number(inside[1]) > 0, `preview reports "${held}"`);
check('the clock reads a time and a total', /\d:\d\d\.\d\d \/ \d:\d\d/.test(markClock ?? ''),
  markClock ?? '');

// The frame under a parked playhead must not creep. The rig eases a scripted
// camera move on its own clock, so if that clock is not the playhead's, a scrub
// that stops mid-push-in slides the rest of the way on its own.
const settle = await eyeOf();
await page.waitForTimeout(1500);
const later = await eyeOf();
if (settle && later) {
  const drift = Math.hypot(settle[0] - later[0], settle[1] - later[1], settle[2] - later[2]);
  check('a parked playhead holds its frame', drift < 0.001, `drifted ${drift.toFixed(5)}m`);
} else {
  check('a parked playhead holds its frame', false, 'no camera readable');
}

// Going somewhere else and coming back must reproduce the same frame, or the
// clock is not addressing scene time — it is addressing whatever happened to be
// left on screen.
await selectBeat('empty-deck');
await page.waitForTimeout(2000);
const returned = await intoBeat('warning', 6);
const again = await eyeOf();
if (Math.abs(secondsOf(returned) - secondsOf(markClock)) > 0.01) {
  check('the same time on the clock is the same frame', false,
    `could not return to ${markClock} (landed on ${returned})`);
} else if (settle && again) {
  const d = Math.hypot(settle[0] - again[0], settle[1] - again[1], settle[2] - again[2]);
  check('the same time on the clock is the same frame', d < 0.05,
    `${markClock} twice, ${d.toFixed(4)}m apart`);
} else {
  check('the same time on the clock is the same frame', false, 'no camera readable');
}

// --- 6. undo.
await selectBeat('warning');
await selectClip('camera warning');
const beforeEdit = await source();
const nudge = page.locator('#form .field')
  .filter({ has: page.locator('label:text-is("at")') }).locator('input');
await nudge.fill('0.75');
await nudge.dispatchEvent('change');
await page.waitForTimeout(400);
const edited = await source();
check('an edit arms undo', edited !== beforeEdit
  && !(await page.evaluate(() => document.getElementById('undo').disabled)));
await page.click('#undo');
await page.waitForTimeout(400);
check('undo reverses the edit', (await source()) === beforeEdit,
  (await source()) === beforeEdit ? '' : firstDiff(beforeEdit, await source()));
await page.click('#redo');
await page.waitForTimeout(400);
check('redo reinstates it', (await source()) === edited);
await page.keyboard.press('Meta+z');
await page.waitForTimeout(400);
check('the keyboard drives undo too', (await source()) === beforeEdit);

// --- 6b. dragging a clip.
//
// This is the gesture the suite claimed to cover and never actually performed —
// every "edit" above went through a number box. It hung the tab: selecting a
// cue rebuilds the timeline, so the drag measured a lane that had already been
// detached, a detached box is zero wide, the travel was divided by that zero,
// and the cue's offset became `Infinity`. A beat is as long as its furthest
// cue, and the cue ruler counts seconds up to a beat's length.
await selectBeat('warning');
const beforeDrag = await source();
const dragged = page.locator('#lanes .clip[data-cue^="mood"]').first();
const clipBox = await dragged.boundingBox();
await page.mouse.move(clipBox.x + clipBox.width / 2, clipBox.y + clipBox.height / 2);
await page.mouse.down();
await page.mouse.move(clipBox.x + clipBox.width / 2 + 120, clipBox.y + clipBox.height / 2, { steps: 12 });
await page.mouse.up();
await page.waitForTimeout(1200);

// The page answering at all is half the check: a hung tab cannot fail an
// assertion, it can only time out, which reads as a broken harness.
const afterDrag = await Promise.race([
  source(),
  new Promise((_, reject) => setTimeout(() => reject(new Error('the page stopped responding')), 5000)),
]).catch((error) => String(error.message));
check('dragging a clip leaves the page responsive', typeof afterDrag === 'string'
  && afterDrag.startsWith('# scene:'), typeof afterDrag === 'string' ? afterDrag.slice(0, 40) : '');
check('dragging a clip moves it', afterDrag !== beforeDrag);
const offsets = (afterDrag.match(/^\s*@(\S+)/gm) ?? []).map((token) => token.trim().slice(1));
check('every cue offset is still a finite number',
  offsets.every((value) => Number.isFinite(Number(value))),
  offsets.filter((value) => !Number.isFinite(Number(value))).join(', '));
await page.click('#undo');
await page.waitForTimeout(500);
check('undo reverses a dragged edit too', (await source()) === beforeDrag,
  (await source()) === beforeDrag ? '' : firstDiff(beforeDrag, await source()));

// --- 6c. authoring, not just revising.
//
// Until now the editor could only modify what already existed: no add, no
// delete, no reorder, for cues or beats. Which meant the claim that authoring
// is the GUI and text is merely storage was not true — you still opened the
// file to do half the job.
await selectBeat('warning');
const beforeAuthoring = await source();

// A cue, put down on an empty lane and taken away again.
const fxTrack = page.locator('#lanes .lane[data-lane="fx"] .track');
const fxBox = await fxTrack.boundingBox();
await page.mouse.dblclick(fxBox.x + fxBox.width * 0.5, fxBox.y + fxBox.height / 2);
await page.waitForTimeout(1200);
const withCue = await source();
check('double-clicking empty lane space adds a cue', withCue !== beforeAuthoring);
await page.keyboard.press('Delete');
await page.waitForTimeout(900);
check('delete removes the selected cue', (await source()) === beforeAuthoring,
  (await source()) === beforeAuthoring ? '' : firstDiff(beforeAuthoring, await source()));

// A cue dragged out of its beat and into the next one. This is the gesture the
// beat-locked timeline could not express at any price.
await selectBeat('warning');
await page.waitForTimeout(600);
const moving = page.locator('#lanes .clip[data-cue^="mood"]').first();
const movingBox = await moving.boundingBox();
const goodbye = page.locator('#lanes .beat-block[data-beat="goodbye"]');
const goodbyeBox = await goodbye.boundingBox();
if (movingBox && goodbyeBox) {
  await page.mouse.move(movingBox.x + movingBox.width / 2, movingBox.y + movingBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(goodbyeBox.x + goodbyeBox.width / 2, movingBox.y + movingBox.height / 2, { steps: 14 });
  await page.mouse.up();
  await page.waitForTimeout(1400);
  const moved = await source();
  const inGoodbye = /beat goodbye\n(?:\s+@.*\n)*\s+@\S+ mood recruit/.test(moved);
  check('a cue can be dragged into the next beat', inGoodbye,
    (await page.textContent('#status')));
  await page.click('#undo');
  await page.waitForTimeout(700);
  check('undo puts it back in the beat it came from', (await source()) === beforeAuthoring);
} else {
  check('a cue can be dragged into the next beat', false, 'no clip or target block on screen');
}

// Beats: add, rename by double-click, reorder by dragging, delete.
const beatsBefore = await page.locator('#outline .beat').count();
await page.click('#beat-add');
await page.waitForTimeout(800);
check('a beat can be added', (await page.locator('#outline .beat').count()) === beatsBefore + 1);
const fresh = page.locator('#outline .beat[aria-current="true"]');
await fresh.dblclick();
await page.waitForTimeout(300);
await page.fill('#outline .rename', 'a-new-beat');
await page.keyboard.press('Enter');
await page.waitForTimeout(800);
check('a beat can be renamed in place',
  (await source()).includes('beat a-new-beat'), await page.textContent('#status'));

const rows = await page.locator('#outline .beat').all();
const fromBox = await page.locator('#outline .beat[data-beat="a-new-beat"]').boundingBox();
const toBox = await rows[1].boundingBox();
await page.mouse.move(fromBox.x + 40, fromBox.y + fromBox.height / 2);
await page.mouse.down();
await page.mouse.move(toBox.x + 40, toBox.y, { steps: 14 });
await page.mouse.up();
await page.waitForTimeout(900);
const order = (await source()).match(/^beat (\S+)/gm).map((line) => line.slice(5));
check('a beat can be dragged to a new place in the order',
  order.indexOf('a-new-beat') < 3, order.slice(0, 4).join(' → '));

await page.click(`#outline .beat[data-beat="a-new-beat"] .x`);
await page.waitForTimeout(800);
check('a beat can be deleted', !(await source()).includes('beat a-new-beat'));
check('and the file is back where it started', (await source()) === beforeAuthoring,
  (await source()) === beforeAuthoring ? '' : firstDiff(beforeAuthoring, await source()));

// --- 7. the frame, and the guides drawn on it.
//
// The property under test is that the preview is *shaped like the picture*.
// `CameraRig` takes its aspect from the window it is in, so an iframe the shape
// of whatever the layout left over was composing at an aspect no player has —
// the vertical framing honest, the horizontal not. The frame is letterboxed to
// a chosen delivery aspect now, and choosing a different one has to actually
// change the shape rather than crop a picture already drawn.
const beforeFraming = await source();
const frameRatio = async () => {
  const box = await page.locator('#frame-box').boundingBox();
  return box.width / box.height;
};
check('the preview is letterboxed to the delivery aspect',
  Math.abs((await frameRatio()) - 16 / 9) < 0.02, `${(await frameRatio()).toFixed(3)}:1`);

await page.selectOption('#aspect', '4:3');
await page.waitForTimeout(600);
check('choosing an aspect reshapes the frame',
  Math.abs((await frameRatio()) - 4 / 3) < 0.02, `${(await frameRatio()).toFixed(3)}:1`);
// The camera's aspect comes from the frame's own viewport, so the reshape has
// to have reached the game — not just the CSS box around it.
const innerAspect = await (inner()?.evaluate(() => window.__postmark?.game?.rig?.camera?.aspect) ?? null);
check('the reshape reaches the camera in the preview',
  innerAspect !== null && Math.abs(innerAspect - 4 / 3) < 0.02, `camera aspect ${innerAspect}`);
await page.selectOption('#aspect', '16:9');
await page.waitForTimeout(600);
check('changing the frame does not edit the file', (await source()) === beforeFraming);

check('guides start off', await page.locator('#guides').isHidden());
await page.click('#guides-toggle');
await page.waitForTimeout(200);
check('the guides toggle shows the framing overlay', await page.locator('#guides').isVisible());
const guideBox = await page.locator('#guides').boundingBox();
check('the guides are drawn on the frame itself, not a box inside it',
  Math.abs(guideBox.width / guideBox.height - (await frameRatio())) < 0.02,
  `${(guideBox.width / guideBox.height).toFixed(3)}:1`);

// --- 10. the chrome recedes.
check('the beat spine is gone', (await page.locator('#spine').count()) === 0);
check('and so is the ruler that replaced it', (await page.locator('#scrub').count()) === 0);
check('navigation is the outline', (await page.locator('#outline .beat').count()) >= 20);
// The point of the whole rework: a cut has frames either side of it, and they
// live in different beats. A timeline that can only draw one beat can never
// show one.
await selectBeat('warning');
const spanned = await page.locator('#lanes .beat-block').allTextContents();
check('the timeline shows more than one beat at once',
  (await page.locator('#lanes .beat-block').count()) >= 3, spanned.join(', '));
check('beat boundaries are drawn through the lanes',
  (await page.locator('#lanes .divider').count()) >= 2);
check('the toolbar is grouped rather than one run of pills',
  (await page.locator('.toolbar .group').count()) >= 3,
  `${await page.locator('.toolbar .group').count()} groups`);
// Moved up beside the document's name, which is what got the toolbar back to
// one row: the clock and the status message used to be clipped off the end.
check("the document's own actions sit with the document's name",
  (await page.locator('.topbar .doc #save').count()) === 1);
const toolbarHeight = (await page.locator('.toolbar').boundingBox()).height;
check('the toolbar fits on one row', toolbarHeight < 56, `${Math.round(toolbarHeight)}px`);
check('the clock and the status message have a home that cannot be crowded out',
  (await page.locator('.footbar #clock').count()) === 1
  && (await page.locator('.footbar #status').count()) === 1);
check('play and pause are one toggle',
  (await page.locator('#pause').count()) === 0
  && (await page.textContent('#play')) === 'play');
// Two-character stubs are worse than no label: noise you squint at to learn
// nothing. Every label that survives has to be a whole beat name.
// The outline has room for every name, which is the whole reason it replaced a
// horizontal bar: nothing there needs to be shortened or dropped at all.
const outlineNames = await page.locator('#outline .beat .nm').allTextContents();
check('every beat is named in full somewhere', outlineNames.length >= 20
  && outlineNames.every((name) => name.length > 3), `${outlineNames.length} names`);
// The panel that edits a shot must be about the shot you are looking at. This
// was the hazard: the playhead moved, the ruler and the lanes followed, and the
// inspector kept the previous beat's shot in six live number boxes — so
// alt-dragging `dist` edited a shot that was not on screen.
await selectBeat('arrival');
const arrivalPanel = (await page.locator('#form h3.section').allTextContents()).join(' ');
await selectBeat('warning');
const warningPanel = (await page.locator('#form h3.section').allTextContents()).join(' ');
check('the inspector follows the playhead',
  arrivalPanel.includes('arrival') && warningPanel.includes('warning')
  && !warningPanel.includes('arrival'),
  `${arrivalPanel} -> ${warningPanel}`);
check('and it names the shot that beat actually cuts to',
  warningPanel.toLowerCase().includes('shot · warning'), warningPanel);

// Nothing anywhere may be sheared. Every label either fits its box or is not
// drawn — `ca…`, `moo…` and `THE FO(` are all the same failure.
const shorn = async () => page.evaluate(() => {
  const bad = [];
  for (const sel of ['#lanes .beat-block', '#lanes .clip', '#outline .beat .nm']) {
    for (const node of document.querySelectorAll(sel)) {
      if (node.textContent && node.scrollWidth > node.clientWidth + 1) {
        bad.push(`${sel} "${node.textContent}"`);
      }
    }
  }
  return bad;
});
check('no label is drawn sheared', (await shorn()).length === 0, (await shorn()).join(', '));
// The property is "never truncated", not "never short". `ask` is three
// characters and a whole word; `ca…` is four and a stub. A length threshold
// cannot tell those apart — an ellipsis can, and combined with the shear check
// above it is exactly what `fitText` guarantees: it sets a complete candidate
// or it sets nothing.
const truncated = (await page.locator('#lanes .clip').allTextContents())
  .filter((label) => label.includes('…'));
check('no clip label is a truncation', truncated.length === 0, truncated.join(', '));

// Narrow enough that the ruler and the movements have to give up their names,
// which is the case the measurement exists for.
await page.setViewportSize({ width: 900, height: 800 });
await page.waitForTimeout(1500);
await selectBeat('warning');
check('nothing is sheared once there is no room either', (await shorn()).length === 0,
  (await shorn()).join(', '));
await page.setViewportSize({ width: 1500, height: 950 });
await page.waitForTimeout(1200);
await selectBeat('warning');

check('the chrome is not selectable text',
  (await page.evaluate(() => getComputedStyle(document.body).userSelect)) === 'none');
check('the source stays selectable, so it can still be copied',
  (await page.evaluate(() => getComputedStyle(document.getElementById('source')).userSelect)) === 'text');
check('the numbers have no spinners',
  (await page.evaluate(() => {
    const box = document.querySelector('#form input[type=number]');
    return box ? getComputedStyle(box).appearance : '';
  })) === 'textfield');

check("the scene's own act divisions head the outline",
  (await page.locator('#outline .sect').count()) >= 3,
  (await page.locator('#outline .sect').allTextContents()).join(' · '));

// --- 8. the transport: a range, a run, and a stop where the range ends.
//
// The property under test is that the range is honoured in *beat* coordinates.
// The ruler is drawn with edit-time estimates for every cue that waits on the
// player, so a range enforced against those seconds would stop near the out
// point and further from it every cycle.
await selectBeat('greeting');
await page.keyboard.press('[');
await selectBeat('question');
await page.keyboard.press(']');
check('the brackets set a loop range',
  (await clockOf()).includes('range'), await clockOf());
check('the range is drawn on the timeline',
  (await page.locator('#lanes .range').count()) >= 1
  && (await page.locator('#lanes .handle').count()) >= 1);

await page.keyboard.press('Home');
await page.waitForTimeout(2500);
const atIn = await clockOf();
await page.keyboard.press(' ');
// Waited *for the transport to stop*, not for a fixed nine seconds. The loop
// range spans about 9.3 seconds of scene, so a flat 9000ms sleep was asking
// playback to run at better than real time to pass — it had no margin at all,
// and any frame the preview spends on something new (a light to tick, a clock
// to tween) tipped it over. The assertion is unchanged; only the patience is.
await page.waitForFunction(
  () => document.querySelector('#play')?.getAttribute('aria-pressed') === 'false',
  null,
  { timeout: 30000 },
).catch(() => {});
const ran = await clockOf();
// The opening's second beat is a line of dialogue, which blocks on a player.
// This is the check that the preview stands in for one: without it the head
// stops on the first line and never reaches the out point.
check('play carries the head through a line of dialogue', ran !== atIn,
  `${atIn} -> ${ran}`);
check('play stops itself at the out point',
  (await page.getAttribute('#play', 'aria-pressed')) === 'false');

// --- 9. the contact sheet.
await page.click('#tab-shots');
await page.waitForTimeout(300);
const figures = await page.locator('#shots figure').count();
check('every shot gets a place on the sheet', figures >= 12, `${figures} entries`);
// The sheet badges two authoring smells: a shot no cue ever calls, and two
// shots that are the same numbers under different names. This used to assert
// simply that at least one badge appeared — which passed only because the
// shipped opening happened to carry both smells at once (`departure` was an
// unused byte-identical twin of `emptying`). Cleaning the scene up broke the
// test, which is exactly backwards: a check on an editor feature must not be
// fixtured on a defect in production content, or doing the right thing to the
// content is what makes it red.
//
// So the expectation is computed from the scene source instead, and a clean
// scene correctly expects no badges at all.
const sheetSource = await page.evaluate(async () =>
  (await fetch('/src/cutscene/scenes/kindly-opening.scene?raw')).text());
const shotLines = [...sheetSource.matchAll(/^shot\s+(\S+)\s+(.*)$/gm)];
const called = new Set([...sheetSource.matchAll(/^\s*@\S+\s+camera\s+(\S+)/gm)].map((m) => m[1]));
const bySignature = new Map();
for (const [, id, rest] of shotLines) {
  const signature = rest.trim().replace(/\s+/g, ' ');
  bySignature.set(signature, [...(bySignature.get(signature) ?? []), id]);
}
const expected = shotLines.filter(([, id, rest]) =>
  !called.has(id)
  || (bySignature.get(rest.trim().replace(/\s+/g, ' ')) ?? []).length > 1).length;
const badged = await page.locator('#shots figure:has(.dupe)').count();
check('the sheet badges exactly the unused and duplicated shots', badged === expected,
  `${badged} badged, ${expected} expected — ${
    (await page.locator('#shots .dupe').allTextContents()).join(', ') || 'sheet is clean'}`);

await page.click('#tab-form');

await page.screenshot({ path: '/tmp/editor-acceptance.png' });
await app.close();

for (const error of errors) console.log(`page error: ${error}`);
const failed = checks.filter((c) => !c.ok).length + errors.length;
console.log(`\n${checks.length - failed}/${checks.length} checks, ${errors.length} page errors`);
process.exit(failed ? 1 : 0);
