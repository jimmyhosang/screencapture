/**
 * Full-app UI test for the desktop app.
 *
 * Launches the built app (out/) with Playwright's Electron driver and walks
 * the user-facing flows through the real UI:
 *   Dashboard -> Record a URL (multi-page, with PII) -> session saved ->
 *   select + play in the replay player -> export -> delete -> import ->
 *   Settings persist -> OCR Test opens.
 *
 * Only native dialogs (open/save/confirm) are stubbed, since they can't be
 * clicked headlessly. Screenshots go to $SHOTS_DIR when set.
 *
 * Usage: pnpm build && pnpm test:app   (headless Linux: wrap in xvfb-run -a)
 */
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';

const require = createRequire(import.meta.url);
const { _electron } = require('playwright');
const electronPath = require('electron');

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const shots = process.env.SHOTS_DIR;
const shot = async (page, name) => shots && page.screenshot({ path: path.join(shots, `${name}.png`) });

let failures = 0;
const check = (ok, label) => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}`);
  if (!ok) failures++;
};

// --- Fixture site: two pages with PII, a form, and dynamic content ----------
const pages = {
  '/': `<!doctype html><html><head><title>Fixture home</title></head><body>
    <h1>Customer portal</h1>
    <p>Email: jane.doe@example.com</p>
    <p>Call us at 1-800-555-0199.</p>
    <p class="sensitive">BLOCKED-SECRET-TEXT</p>
    <p>This sentence has no personal data.</p>
    <input id="name" type="text"><input id="pw" type="password">
    <div id="dyn"></div>
    <a id="next" href="/page2">Next page</a>
  </body></html>`,
  '/page2': `<!doctype html><html><head><title>Fixture page 2</title></head><body>
    <h1>Billing details</h1>
    <p>SSN: 123-45-6789</p>
    <p>Card: 4111 1111 1111 1111</p>
    <p>Second page marker text.</p>
  </body></html>`,
};
const server = http.createServer((req, res) => {
  const body = pages[req.url.split('?')[0]];
  res.writeHead(body ? 200 : 404, { 'content-type': 'text/html' });
  res.end(body ?? 'not found');
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const siteUrl = `http://127.0.0.1:${server.address().port}/`;

const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'sc-app-e2e-'));
const app = await _electron.launch({
  executablePath: electronPath,
  args: ['--no-sandbox', `--user-data-dir=${userData}`, path.join(root, 'out/main/index.js')],
  cwd: root,
});

try {
  const win = await app.firstWindow();
  const errors = [];
  win.on('pageerror', (e) => errors.push(e.message));
  win.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await win.waitForSelector('.nav-tab');
  await shot(win, '01-dashboard');
  check(await win.locator('.nav-tab', { hasText: 'Dashboard' }).isVisible(), 'app window shows dashboard');

  // ---- Record a URL ---------------------------------------------------------
  await win.locator('.nav-tab', { hasText: 'Record' }).click();
  await win.fill('#record-url', siteUrl);
  await shot(win, '02-record');
  const recWindowP = app.waitForEvent('window');
  await win.locator('.btn-record').click();
  const rec = await recWindowP;
  await rec.waitForLoadState('domcontentloaded');
  await win.locator('.btn-stop').waitFor({ timeout: 15000 }).catch(() => {});
  const recError = await win.locator('.error-message').allInnerTexts();
  check(await win.locator('.btn-stop').isVisible(), `recording started${recError.length ? ` (error: ${recError.join(' ')})` : ''}`);

  await rec.waitForTimeout(1500);
  await rec.fill('#name', 'typed.secret@example.org');
  await rec.fill('#pw', 'hunter2-password');
  await rec.evaluate(() => {
    document.getElementById('dyn').textContent = 'Late email: dynamic.leak@example.net';
  });
  await rec.waitForTimeout(500);
  await shot(rec, '03-recording-window');
  await Promise.all([rec.waitForURL('**/page2'), rec.click('#next')]);
  await rec.waitForTimeout(1500);

  await win.locator('.btn-stop').click();
  await win.waitForTimeout(1500);
  await shot(win, '04-after-stop');

  const sessions = await win.evaluate(() => window.api.sessions.getAll());
  check(sessions.length === 1, `session saved (${sessions.length})`);
  const meta = sessions[0];
  const session = meta && (await win.evaluate((id) => window.api.sessions.get(id), meta.id));
  const events = session?.events ?? [];
  check(events.length > 2, `session has events (${events.length})`);
  const dump = JSON.stringify(events);
  check(dump.includes('Customer portal'), 'first page captured');
  check(dump.includes('Second page marker text.'), 'second page captured after navigation');
  check(events.some((e) => e.type === 3 && e.data?.source === 0), 'DOM mutations captured');
  for (const [label, value] of Object.entries({
    'email text': 'jane.doe@example.com',
    'sentence-final phone': '555-0199',
    '.sensitive element': 'BLOCKED-SECRET-TEXT',
    'typed input': 'typed.secret@example.org',
    'password input': 'hunter2-password',
    'dynamic email': 'dynamic.leak@example.net',
    'page 2 SSN': '123-45-6789',
    'page 2 card': '4111 1111 1111 1111',
  })) {
    check(!dump.includes(value), `no leak: ${label}`);
  }
  check(dump.includes('This sentence has no personal data.'), 'non-PII text kept');

  // ---- Dashboard reflects it ------------------------------------------------
  const item = win.locator('.session-item').first();
  check(await item.isVisible(), 'session appears in sidebar');
  check((await win.locator('.stat-value, .stat-card').first().innerText()).includes('1'), 'dashboard stats updated');

  // ---- Replay --------------------------------------------------------------
  await item.click();
  await shot(win, '05-session-selected');
  await item.locator('button[title="Play"]').click();
  const frame = win.frameLocator('.replayer-wrapper iframe, iframe').first();
  await frame.locator('body').waitFor({ timeout: 10000 }).catch(() => {});
  await win.waitForTimeout(1500);
  const replayText = await frame.locator('body').innerText().catch(() => '');
  await shot(win, '06-player');
  check(replayText.includes('Customer portal'), 'replay renders the recorded page');
  check(!replayText.includes('jane.doe@example.com'), 'replay shows no raw email');
  await win.keyboard.press('Escape');
  const close = win.locator('button', { hasText: 'Close' });
  if (await close.isVisible().catch(() => false)) await close.click();

  // ---- Export / delete / import (native dialogs stubbed) --------------------
  const exportPath = path.join(userData, 'exported-session.json');
  await app.evaluate(({ dialog }, p) => {
    dialog.showSaveDialog = async () => ({ canceled: false, filePath: p });
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [p] });
    dialog.showMessageBox = async () => ({ response: 0, checkboxChecked: false });
  }, exportPath);

  await item.locator('button[title="Export"]').click();
  await win.waitForTimeout(800);
  const exported = fs.existsSync(exportPath) && JSON.parse(fs.readFileSync(exportPath, 'utf8'));
  check(!!exported && Array.isArray(exported.events) && exported.events.length === events.length, 'export writes the full session JSON');

  await item.locator('button[title="Delete"]').click();
  await win.waitForTimeout(800);
  check((await win.evaluate(() => window.api.sessions.getAll())).length === 0, 'delete removes the session');

  await win.locator('button', { hasText: 'Import Session' }).click();
  await win.waitForTimeout(1000);
  const afterImport = await win.evaluate(() => window.api.sessions.getAll());
  check(afterImport.length === 1, 'import restores the session');
  check(await win.locator('.session-item').count() === 1, 'imported session listed in sidebar');

  // ---- Settings persist ------------------------------------------------------
  await win.locator('.nav-tab', { hasText: 'Settings' }).click();
  await win.waitForTimeout(500);
  await shot(win, '07-settings');
  const before = await win.evaluate(() => window.api.settings.get());
  const toggle = win.locator('.setting-row', { hasText: 'Mask Input Values' }).locator('.toggle');
  const wasOn = (await toggle.getAttribute('class')).includes('active');
  await toggle.click();
  await win.locator('button', { hasText: 'Save Settings' }).click();
  await win.waitForTimeout(500);
  const after = await win.evaluate(() => window.api.settings.get());
  check(after.defaultPrivacy?.maskInputs === !wasOn && before.defaultPrivacy?.maskInputs === wasOn,
    'toggling a setting and saving persists it');
  await win.reload();
  await win.locator('.nav-tab', { hasText: 'Settings' }).click();
  const isOn = (await win.locator('.setting-row', { hasText: 'Mask Input Values' }).locator('.toggle').getAttribute('class')).includes('active');
  check(isOn === !wasOn, 'saved setting survives a reload');

  // ---- OCR Test opens -------------------------------------------------------
  await win.locator('.nav-tab', { hasText: 'Dashboard' }).click();
  await win.locator('button', { hasText: 'OCR Test' }).click();
  await win.waitForTimeout(800);
  await shot(win, '08-ocr-test');
  check(await win.locator('text=OCR').first().isVisible(), 'OCR test panel opens');

  check(errors.length === 0, `no renderer errors${errors.length ? `: ${errors.slice(0, 3).join(' | ')}` : ''}`);
} catch (e) {
  console.error(e);
  failures++;
} finally {
  await app.close().catch(() => {});
  server.close();
}

console.log(failures ? `\n${failures} check(s) failed` : '\nAll checks passed');
process.exit(failures ? 1 : 0);
