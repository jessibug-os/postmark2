/** I8 assignment-input gate: validation, Unicode, max length, and controller fallback. */
import { chromium } from 'playwright-core';

const URL = process.env.POSTMARK_URL ?? 'http://localhost:5173';
const app = await chromium.launch({ channel: 'chrome', headless: true });

async function boot(controller = false) {
  const context = await app.newContext({ viewport: { width: 960, height: 720 } });
  const page = await context.newPage();
  await page.addInitScript((withController) => {
    localStorage.clear();
    if (withController) {
      window.__testPad = {
        connected: true,
        axes: [0, 0, 0, 0],
        buttons: Array.from({ length: 16 }, () => ({ pressed: false })),
      };
      Object.defineProperty(navigator, 'getGamepads', { value: () => [window.__testPad] });
    }
  }, controller);
  await page.goto(URL);
  await page.waitForFunction(() => Boolean(window.__postmark?.game));
  await page.keyboard.press('Space');
  await page.waitForTimeout(250);
  await page.keyboard.press('Enter');
  for (let i = 0; i < 100; i++) {
    const visible = await page.evaluate(() => {
      const input = document.querySelector('input');
      return Boolean(input && getComputedStyle(input.closest('.pm-panel')).display !== 'none');
    });
    if (visible) return { context, page };
    if (await page.evaluate(() => window.__postmark.dialogueOpen())) {
      await page.keyboard.press('KeyE');
      await page.waitForTimeout(60);
      await page.keyboard.press('KeyE');
    }
    await page.waitForTimeout(120);
  }
  throw new Error('Assignment input did not open');
}

// Keyboard: empty refuses, physical typing respects maxlength, Unicode survives.
{
  const { context, page } = await boot(false);
  const input = page.locator('input[maxlength="12"]');
  await input.fill('');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(150);
  if (!await input.isVisible() || await input.inputValue() !== '') {
    throw new Error('Empty keyboard assignment did not remain open');
  }
  await page.keyboard.type('abcdefghijklmnopqrst');
  if ((await input.inputValue()).length !== 12) throw new Error('Name maxlength is not enforced');
  await input.fill('Mára');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(100);
  if (await input.inputValue() !== 'St. Mystere') throw new Error('Island default was not preserved');
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => window.__postmark.dialogueOpen());
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => window.__postmark.game.state === 'play');
  const name = await page.evaluate(() => window.__postmark.game.playerName);
  if (name !== 'Mára') throw new Error(`Unicode name changed: ${name}`);
  await context.close();
}

// Controller: A supplies Postmaster when no keyboard name exists, then accepts the island default.
{
  const { context, page } = await boot(true);
  const pressA = async () => {
    await page.evaluate(() => { window.__testPad.buttons[0].pressed = true; });
    await page.waitForTimeout(120);
    await page.evaluate(() => { window.__testPad.buttons[0].pressed = false; });
    await page.waitForTimeout(120);
  };
  await pressA();
  const input = page.locator('input[maxlength="12"]');
  if (await input.inputValue() !== 'St. Mystere') throw new Error('Controller did not advance to island default');
  await pressA();
  await page.waitForFunction(() => window.__postmark.dialogueOpen());
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => window.__postmark.game.state === 'play');
  const name = await page.evaluate(() => window.__postmark.game.playerName);
  if (name !== 'Postmaster') throw new Error(`Controller fallback name changed: ${name}`);
  await context.close();
}

await app.close();
console.log('I8 INPUT GATE: empty refusal, maxlength, Unicode, and controller fallback pass.');
