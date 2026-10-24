/** Kindly Forward ending-spine gate. Visual/runtime finale staging waits for W7. */
import { chromium } from 'playwright-core';

const url = process.env.POSTMARK_URL ?? 'http://localhost:5173';
const app = await chromium.launch({ channel: 'chrome', headless: true });
const page = await app.newPage();
await page.goto(url);
const report = await page.evaluate(async () => {
  const { KINDLY_FORWARD_STORY_SPINE } = await import('/src/data/kindlyForward.ts');
  return {
    acts: KINDLY_FORWARD_STORY_SPINE.acts.map((act) => ({
      id: act.id,
      title: act.title,
      beats: act.beats.length,
    })),
    postmaster: Object.keys(KINDLY_FORWARD_STORY_SPINE.postmaster).sort(),
    missingRecord: KINDLY_FORWARD_STORY_SPINE.mystery.missingRecord,
    discipline: KINDLY_FORWARD_STORY_SPINE.mystery.discipline,
  };
});
await app.close();
const failures = [];
if (report.acts.map((act) => act.id).join(',') !== 'arrival,delivery,forwarding') {
  failures.push('Act I/II/III narrative shape changed');
}
if (report.acts.some((act) => act.beats < 4)) failures.push('story act is under-authored');
if (report.postmaster.join(',') !== 'choice,pressure,recruit,resolution,reveal') {
  failures.push('Postmaster five-beat arc incomplete');
}
if (!report.missingRecord || !report.discipline) failures.push('missing-record mystery discipline absent');
console.log(JSON.stringify(report));
if (failures.length) {
  console.error(failures);
  process.exitCode = 1;
}
