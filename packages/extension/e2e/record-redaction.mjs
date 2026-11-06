/**
 * End-to-end check of the extension's recording + PII redaction.
 *
 * Loads the built extension (dist/) into Chromium, records a fixture page full
 * of fake PII, stops the recording and then scans the captured rrweb events for
 * any raw PII that leaked through.
 *
 * Usage (after `pnpm --filter @screencapture/extension build`):
 *   node e2e/record-redaction.mjs
 */
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const here = path.dirname(fileURLToPath(import.meta.url));
const extensionPath = path.resolve(here, '../dist');
if (!fs.existsSync(path.join(extensionPath, 'manifest.json'))) {
  console.error('dist/ not found - build the extension first');
  process.exit(2);
}

// Serve the fixture over http (content scripts don't run on file:// by default)
const fixture = fs.readFileSync(path.join(here, 'pii-fixture.html'));
const server = http.createServer((_req, res) => {
  res.writeHead(200, { 'content-type': 'text/html' });
  res.end(fixture);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const url = `http://127.0.0.1:${server.address().port}/`;

const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sc-ext-'));
const context = await chromium.launchPersistentContext(userDataDir, {
  headless: true,
  channel: 'chromium', // full Chromium (not headless shell) so extensions load
  args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`],
});

let failures = 0;
const check = (ok, label) => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}`);
  if (!ok) failures++;
};

try {
  let [worker] = context.serviceWorkers();
  if (!worker) worker = await context.waitForEvent('serviceworker');
  const extensionId = worker.url().split('/')[2];
  worker.on('console', (m) => process.env.DEBUG && console.log('[sw]', m.text()));

  // An extension page to drive the background script (stands in for the popup)
  const controller = context.pages()[0] ?? (await context.newPage());
  await controller.goto(`chrome-extension://${extensionId}/popup.html`);

  const page = await context.newPage();
  page.on('console', (m) => process.env.DEBUG && console.log('[page]', m.text()));
  page.on('pageerror', (e) => console.log('[page error]', e.message));
  await page.goto(url);
  await page.bringToFront();
  await page.waitForTimeout(300);

  const send = (msg) =>
    Promise.race([
      controller.evaluate((m) => chrome.runtime.sendMessage(m), msg),
      new Promise((_, rej) => setTimeout(() => rej(new Error(`timeout sending ${msg.type}`)), 10000)),
    ]);

  const start = await send({ type: 'START_RECORDING' });
  check(start?.success === true, `start recording (${JSON.stringify(start)})`);
  await page.waitForTimeout(500);

  // Indicator is shown on the recorded page
  check(await page.locator('#screencapture-indicator').count() === 1, 'recording indicator visible');

  // User interactions containing PII
  await page.fill('#name-input', 'typed.secret@example.org');
  await page.fill('#pw-input', 'hunter2-password');
  await page.fill('#notes', 'call me at 555-222-3333');
  // Dynamic content inserted after the snapshot
  await page.evaluate(() => {
    const p = document.createElement('p');
    p.textContent = 'Late email: dynamic.leak@example.net, SSN 234-56-7890';
    document.getElementById('dynamic').appendChild(p);
    document.getElementById('plain-phone').textContent = 'Phone: 555.444.1212';
  });
  await page.mouse.move(100, 100);
  await page.mouse.click(120, 140);
  await page.waitForTimeout(800);

  await page.bringToFront();
  const stop = await send({ type: 'STOP_RECORDING' });
  check(stop?.success === true, 'stop recording');
  const events = stop?.events ?? [];
  check(events.length > 0, `captured ${events.length} events`);
  check(events.some((e) => e.type === 2), 'full DOM snapshot present');
  check(events.some((e) => e.type === 3), 'incremental events present');
  check(await page.locator('#screencapture-indicator').count() === 0, 'indicator removed after stop');

  const dump = JSON.stringify(events);
  fs.writeFileSync(path.join(os.tmpdir(), 'sc-ext-events.json'), dump);

  const mustNotLeak = {
    'static email': 'jane.doe@example.com',
    'static phone': '867-5309',
    'static SSN': '123-45-6789',
    'static credit card': '4111 1111 1111 1111',
    'sentence-final phone': '555-0199',
    '.sensitive block': 'BLOCKED-SECRET-TEXT',
    '[data-private] block': 'PRIVATE-ATTR-TEXT',
    'typed input': 'typed.secret@example.org',
    'password input': 'hunter2-password',
    'textarea input': '555-222-3333',
    'dynamic email': 'dynamic.leak@example.net',
    'dynamic SSN': '234-56-7890',
    'mutated phone': '555.444.1212',
  };
  for (const [label, value] of Object.entries(mustNotLeak)) {
    check(!dump.includes(value), `no leak: ${label}`);
  }
  check(dump.includes('This sentence has no personal data.'), 'non-PII text still recorded');
  // DOM mutations must be captured (and redacted), not dropped
  const mutations = events.filter((e) => e.type === 3 && e.data.source === 0);
  const mutationText = JSON.stringify(mutations);
  check(mutations.length > 0, `DOM mutations recorded (${mutations.length})`);
  check(mutationText.includes('Late email:'), 'inserted element captured in mutation');
  check(mutationText.includes('Phone:'), 'text change captured in mutation');

  // Auto-save persisted a session
  const list = await send({ type: 'GET_SESSIONS' });
  check((list?.sessions?.length ?? 0) === 1, 'session auto-saved to chrome.storage');
} finally {
  await context.close();
  server.close();
}

console.log(failures ? `\n${failures} check(s) failed` : '\nAll checks passed');
process.exit(failures ? 1 : 0);
