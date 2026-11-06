/**
 * End-to-end check of the web app's recording + PII redaction.
 *
 * Serves the production build (dist/) with `vite preview`, turns on the
 * privacy toggles in the UI, records the demo page while typing PII, then
 * checks both the saved session (localStorage) and the replay player for
 * raw PII.
 *
 * Usage (after `pnpm --filter @screencapture/web build`):
 *   node e2e/record-redaction.mjs
 */
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { preview } from 'vite';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
if (!fs.existsSync(path.join(root, 'dist/index.html'))) {
  console.error('dist/ not found - build the web app first');
  process.exit(2);
}

const server = await preview({ root, preview: { port: 0, host: '127.0.0.1' }, logLevel: 'silent' });
const url = server.resolvedUrls.local[0];
const browser = await chromium.launch();

let failures = 0;
const check = (ok, label) => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}`);
  if (!ok) failures++;
};

try {
  const page = await browser.newPage();
  page.on('pageerror', (e) => console.log('[page error]', e.message));
  await page.goto(url);

  // Enable privacy toggles
  for (const label of ['Mask All Inputs', 'Block Sensitive Elements', 'Mask PII Patterns']) {
    const box = page.locator('label.privacy-option', { hasText: label }).locator('input[type=checkbox]');
    if (!(await box.isChecked())) await box.check();
    check(await box.isChecked(), `toggle on: ${label}`);
  }

  await page.getByRole('button', { name: 'Start Recording' }).click();
  await page.waitForTimeout(300);

  // Typing into the demo input renders "You typed: ..." -> a DOM mutation with PII
  await page.fill('input[placeholder="Type something..."]', 'reach me at typed.user@example.org');
  await page.fill('input[placeholder="Enter password..."]', 'hunter2-password');
  await page.fill('input[placeholder="Enter credit card..."]', '4111 1111 1111 1111');
  await page.getByRole('button', { name: '+' }).click();
  await page.waitForTimeout(500);

  await page.getByRole('button', { name: 'Stop Recording' }).click();
  // Save either happens automatically or through the prompt
  const saveBtn = page.locator('.save-btn');
  if (await saveBtn.isVisible().catch(() => false)) await saveBtn.click();
  await page.waitForTimeout(300);

  const sessions = await page.evaluate(() => JSON.parse(localStorage.getItem('rrweb_sessions') || '[]'));
  check(sessions.length === 1, 'session saved to localStorage');
  const events = sessions[0]?.events ?? [];
  check(events.length > 2, `captured ${events.length} events`);
  const mutations = events.filter((e) => e.type === 3 && e.data.source === 0);
  check(mutations.length > 0, `DOM mutations recorded (${mutations.length})`);

  const dump = JSON.stringify(events);
  fs.writeFileSync(path.join(os.tmpdir(), 'sc-web-events.json'), dump);
  const mustNotLeak = {
    'demo email': 'john.doe@example.com',
    'demo phone': '123-4567',
    'demo SSN': '123-45-6789',
    'demo card': '4111-1111-1111-1111',
    'mixed-content email': 'help@company.com',
    '.sensitive block': 'This entire block has the',
    'typed email (input value)': 'typed.user@example.org',
    'password input': 'hunter2-password',
    'card input': '4111 1111 1111 1111',
  };
  for (const [label, value] of Object.entries(mustNotLeak)) {
    check(!dump.includes(value), `no leak: ${label}`);
  }
  check(dump.includes('Interactive Demo Area'), 'non-PII text still recorded');

  // Replay: open the player and inspect the replayed DOM
  await page.getByRole('button', { name: /Play Recording/ }).click();
  const frame = page.frameLocator('iframe').first();
  await frame.locator('body').waitFor({ timeout: 10000 });
  await page.waitForTimeout(1500);
  const replayText = await frame.locator('body').innerText();
  check(replayText.includes('Interactive Demo Area'), 'replay renders recorded page');
  check(!replayText.includes('john.doe@example.com'), 'replay shows no raw email');
  check(!replayText.includes('123-45-6789'), 'replay shows no raw SSN');
} finally {
  await browser.close();
  await new Promise((r) => server.httpServer.close(r));
}

console.log(failures ? `\n${failures} check(s) failed` : '\nAll checks passed');
process.exit(failures ? 1 : 0);
