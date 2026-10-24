/** Kindly Forward one-letter-per-resident and build-gate contract. */
import { chromium } from 'playwright-core';

const url = process.env.POSTMARK_URL ?? 'http://localhost:5173';
const app = await chromium.launch({ channel: 'chrome', headless: true });
const page = await app.newPage();
await page.goto(url);
const report = await page.evaluate(async () => {
  const { KINDLY_FORWARD_RESIDENT_CONTENT } = await import('/src/data/kindlyForward.ts');
  return KINDLY_FORWARD_RESIDENT_CONTENT.map((resident) => ({
    residentId: resident.id,
    id: resident.letter.id,
    from: resident.letter.from,
    address: resident.letter.address,
    contents: resident.letter.contents.length,
    requiredBuildings: [...resident.letter.requiredBuildings],
  }));
});
await app.close();
const failures = [];
if (report.length !== 8 || new Set(report.map((letter) => letter.residentId)).size !== 8) {
  failures.push('expected one letter for each of eight residents');
}
if (new Set(report.map((letter) => letter.id)).size !== 8) failures.push('letter ids are not unique');
for (const letter of report) {
  if (!letter.from || !letter.address || letter.contents < 1) failures.push(`${letter.id}: incomplete letter`);
  if (!letter.requiredBuildings.length) failures.push(`${letter.id}: missing build gate`);
}
console.log(JSON.stringify(report));
if (failures.length) {
  console.error(failures);
  process.exitCode = 1;
}
