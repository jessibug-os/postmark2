/**
 * Persistence gate for Kindly Forward's intentional v3 clean break.
 * Run with the dev server on :5173.
 */
import { readFileSync } from 'node:fs';
import { chromium } from 'playwright-core';

const url = process.env.POSTMARK_URL ?? 'http://localhost:5173';
const v1 = readFileSync(new URL('../tests/fixtures/save-v1.json', import.meta.url), 'utf8');
const v2 = JSON.stringify({ ...JSON.parse(v1), version: 2 });
const app = await chromium.launch({ channel: 'chrome', headless: true });
const page = await (await app.newContext()).newPage();
const errors = [];
page.on('pageerror', (error) => errors.push(String(error)));

await page.goto(url);
const result = await page.evaluate(async ({ v1, v2 }) => {
  const saves = await import('/src/systems/SaveSystem.ts');
  const templates = await import('/src/world/island/TemplateLibrary.ts');
  localStorage.clear();
  localStorage.setItem('postmark-save-v1', v1);
  localStorage.setItem('postmark-save-v2-slot-2', v2);

  const refused = {
    v1: saves.loadSave(1) === null,
    v2: saves.loadSave(2) === null,
    v1Intact: localStorage.getItem('postmark-save-v1') === v1,
    v2Intact: localStorage.getItem('postmark-save-v2-slot-2') === v2,
    summaries: saves.listSaveSlots().slice(0, 2).map((entry) => ({
      occupied: entry.occupied,
      refusedLegacy: entry.refusedLegacy,
      message: entry.playerName,
    })),
  };

  const third = saves.newSaveData('St. Mystere', 1000);
  third.inventory.gears = 333;
  third.mail.fragments = ['kindly-forward'];
  // Islands are authored maps now. What a save must pin is the template it was
  // made on — `mapConstants.chosenMap` reads exactly this field, and a save that
  // loses it silently reopens the town on the default map.
  const pinned = templates.TEMPLATES.map((entry) => entry.id)
    .find((id) => id !== templates.DEFAULT_TEMPLATE_ID);
  third.island = { templateId: pinned };
  saves.writeSave(third, false, 3);
  const roundTrip = saves.loadSave(3);
  const v3 = {
    version: roundTrip?.version,
    name: roundTrip?.playerName,
    gears: roundTrip?.inventory.gears,
    fragments: roundTrip?.mail.fragments,
    slot: saves.activeSaveSlot(),
    slots: saves.listSaveSlots().map((entry) => ({
      slot: entry.slot,
      occupied: entry.occupied,
      refusedLegacy: Boolean(entry.refusedLegacy),
    })),
    island: roundTrip?.island,
    pinnedTemplateId: pinned,
  };

  localStorage.setItem(saves.slotKey(3), '{"version":3,"playerName":');
  const recovered = saves.loadSave(3);
  const recovery = {
    version: recovered?.version,
    name: recovered?.playerName,
    recovered: Boolean(recovered?.recovery),
    quarantined: Object.keys(localStorage).some((key) => key.startsWith('postmark-save-corrupt-')),
  };

  // A save written before islands were authored names a seed and a snapshot and
  // no template. It must still parse, and must not invent a template id — the
  // default map is the library's call, not the save's. Reuses slot 3, which the
  // corruption check above has already finished with.
  const legacyIsland = saves.newSaveData('Legacy Island', 1000);
  legacyIsland.island = {
    requestedSeed: 42,
    resolvedSeed: 43,
    generationAttempt: 2,
    generatorVersion: 12,
    snapshot: 'acres:legacy',
  };
  saves.writeSave(legacyIsland, false, 3);
  const legacyRound = saves.loadSave(3);
  const legacyGenerated = {
    loaded: legacyRound?.playerName === 'Legacy Island',
    templateId: legacyRound?.island?.templateId ?? null,
    requestedSeed: legacyRound?.island?.requestedSeed,
  };

  return { refused, v3, recovery, legacyGenerated, legacyMessage: saves.LEGACY_SAVE_MESSAGE };
}, { v1, v2 });

const failures = [];
if (!result.refused.v1 || !result.refused.v2) failures.push('legacy save was not refused');
if (!result.refused.v1Intact || !result.refused.v2Intact) failures.push('legacy bytes were changed');
if (result.refused.summaries.some((slot) =>
  !slot.occupied || !slot.refusedLegacy || slot.message !== result.legacyMessage
)) failures.push('legacy slot does not show the refusal message');
if (result.v3.version !== 3 || result.v3.name !== 'St. Mystere') failures.push('v3 identity did not round-trip');
if (result.v3.gears !== 333 || result.v3.fragments?.[0] !== 'kindly-forward') failures.push('v3 data changed');
if (!result.v3.pinnedTemplateId || result.v3.island?.templateId !== result.v3.pinnedTemplateId) {
  failures.push('island templateId did not round-trip');
}
if (!result.legacyGenerated.loaded || result.legacyGenerated.templateId !== null
  || result.legacyGenerated.requestedSeed !== 42) {
  failures.push('a pre-authored-island save did not survive normalization');
}
if (result.v3.slot !== 3 || result.v3.slots.filter((slot) => slot.occupied).length !== 3) {
  failures.push('slot isolation failed');
}
if (result.recovery.version !== 3 || result.recovery.name !== 'Recovered Town'
  || !result.recovery.recovered || !result.recovery.quarantined) {
  failures.push('corrupt v3 did not recover safely');
}
failures.push(...errors);

console.log(JSON.stringify(result));
await app.close();
if (failures.length) {
  console.error(failures);
  process.exitCode = 1;
}
