/** Kindly Forward daily-content gate. Runtime staging waits for W7 activation. */
import { chromium } from 'playwright-core';

const url = process.env.POSTMARK_URL ?? 'http://localhost:5173';
const app = await chromium.launch({ channel: 'chrome', headless: true });
const page = await app.newPage();
await page.goto(url);
const report = await page.evaluate(async () => {
  const { KINDLY_FORWARD_RESIDENT_CONTENT } = await import('/src/data/kindlyForward.ts');
  const { KINDLY_FORWARD_CAST } = await import('/src/content/kindly-forward/cast.ts');
  const schedules = new Map(KINDLY_FORWARD_CAST.members.map((member) => [member.id, member.schedule.length]));
  return KINDLY_FORWARD_RESIDENT_CONTENT.map((resident) => ({
    id: resident.id,
    conversations: resident.dailyDialogue.length,
    lines: resident.dailyDialogue.reduce((sum, conversation) => sum + conversation.length, 0),
    loved: resident.tastes.loved.length,
    liked: resident.tastes.liked.length,
    disliked: resident.tastes.disliked.length,
    scheduleBlocks: schedules.get(resident.id) ?? 0,
  }));
});
await app.close();
const failures = report.flatMap((resident) => [
  ...(resident.conversations < 6 || resident.lines < 6 ? [`${resident.id}: dialogue volume`] : []),
  ...(resident.loved < 1 || resident.liked < 1 || resident.disliked < 1 ? [`${resident.id}: tastes`] : []),
  ...(resident.scheduleBlocks < 1 ? [`${resident.id}: schedule`] : []),
]);
console.log(JSON.stringify(report));
if (failures.length) {
  console.error(failures);
  process.exitCode = 1;
}
