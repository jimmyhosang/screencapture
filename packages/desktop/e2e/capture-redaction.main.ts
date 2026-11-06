/**
 * End-to-end harness: real screen capture + video redaction.
 *
 * Runs inside Electron (under Xvfb on Linux):
 *  1. Shows a window with fake PII text and coloured marker boxes.
 *  2. Records the actual screen with ScreenRecorder (desktopCapturer + MediaRecorder).
 *  3. Checks the recording is a valid video that contains the window content.
 *  4. Runs the `redaction:applyToVideo` IPC handler over the PII regions.
 *  5. Checks redacted regions are fully covered and the rest is untouched.
 *
 * Exit code 0 = all checks passed. Run with `pnpm --filter @screencapture/desktop test:e2e`
 * (on headless Linux: `xvfb-run -a -s "-screen 0 1280x720x24" pnpm ... test:e2e`).
 */
import { app, BrowserWindow, ipcMain } from 'electron';
import { execFileSync } from 'child_process';
import { mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';
import { ScreenRecorder } from '../src/main/services/screen-recorder';
import { setupRedactionHandlers } from '../src/main/redaction';
import type { RedactionMask } from '../src/main/redaction';

const W = 1280;
const H = 720;
const RECORD_MS = Number(process.env.RECORD_MS || 4000);
const CHUNK_MS = process.env.CHUNK_MS ? Number(process.env.CHUNK_MS) : undefined;

app.setPath('userData', mkdtempSync(join(tmpdir(), 'sc-desktop-e2e-')));

let failures = 0;
function check(ok: boolean, label: string): void {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}`);
  if (!ok) failures++;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Capture IPC handlers so we can invoke them like the renderer would
const handlers = new Map<string, (...args: any[]) => any>();
const realHandle = ipcMain.handle.bind(ipcMain);
ipcMain.handle = ((channel: string, fn: (...args: any[]) => any) => {
  handlers.set(channel, fn);
  return realHandle(channel, fn);
}) as typeof ipcMain.handle;

/** Read one frame at time `t` (seconds) as raw RGB24. */
function frameAt(video: string, t: number): Buffer {
  return execFileSync(ffmpegInstaller.path, [
    '-v', 'error', '-ss', String(t), '-i', video, '-frames:v', '1',
    '-vf', `scale=${W}:${H}`, '-f', 'rawvideo', '-pix_fmt', 'rgb24', 'pipe:1',
  ], { maxBuffer: W * H * 3 * 2 });
}

/** Mean RGB of a rectangle in a raw RGB24 frame. */
function meanRGB(frame: Buffer, x: number, y: number, w: number, h: number): number[] {
  const sum = [0, 0, 0];
  for (let j = y; j < y + h; j++) {
    for (let i = x; i < x + w; i++) {
      const o = (j * W + i) * 3;
      sum[0] += frame[o]; sum[1] += frame[o + 1]; sum[2] += frame[o + 2];
    }
  }
  return sum.map((s) => Math.round(s / (w * h)));
}

/** Max per-channel spread inside a rectangle (0 = perfectly flat). */
function spread(frame: Buffer, x: number, y: number, w: number, h: number): number {
  let min = 255, max = 0;
  for (let j = y; j < y + h; j++) {
    for (let i = x; i < x + w; i++) {
      const v = frame[(j * W + i) * 3 + 1];
      if (v < min) min = v;
      if (v > max) max = v;
    }
  }
  return max - min;
}

/** Mean absolute horizontal gradient: how much fine detail (e.g. text) a region holds. */
function sharpness(frame: Buffer, x: number, y: number, w: number, h: number): number {
  let sum = 0;
  for (let j = y; j < y + h; j++) {
    for (let i = x; i < x + w - 1; i++) {
      const o = (j * W + i) * 3 + 1;
      sum += Math.abs(frame[o + 3] - frame[o]);
    }
  }
  return sum / ((w - 1) * h);
}

const isColor = (rgb: number[], target: number[], tol = 40) =>
  rgb.every((v, i) => Math.abs(v - target[i]) <= tol);

function probe(video: string): { duration: number; width: number; height: number; codec: string } {
  const out = execFileSync('ffprobe', [
    '-v', 'error', '-show_entries', 'stream=codec_name,width,height:format=duration',
    '-of', 'json', video,
  ]).toString();
  const j = JSON.parse(out);
  return {
    duration: Number(j.format?.duration ?? 0),
    width: j.streams?.[0]?.width ?? 0,
    height: j.streams?.[0]?.height ?? 0,
    codec: j.streams?.[0]?.codec_name ?? '',
  };
}

// Window layout (screen coordinates; window sits at 0,0 frameless)
const RED = { x: 40, y: 40, w: 200, h: 120 };      // marker: should stay visible
const SSN = { x: 300, y: 40, w: 600, h: 120 };     // PII text: redact with solid
const GREEN = { x: 40, y: 300, w: 400, h: 200 };   // email on green: redact with blur
const CARD = { x: 520, y: 300, w: 640, h: 120 };    // card number: redact with pixelate
const PAGE = `
<html><body style="margin:0;background:#fff;font-family:sans-serif">
  <div style="position:absolute;left:${RED.x}px;top:${RED.y}px;width:${RED.w}px;height:${RED.h}px;background:#f00"></div>
  <div style="position:absolute;left:${SSN.x}px;top:${SSN.y}px;width:${SSN.w}px;height:${SSN.h}px;
              font-size:56px;line-height:${SSN.h}px;color:#000">SSN 123-45-6789</div>
  <div style="position:absolute;left:${GREEN.x}px;top:${GREEN.y}px;width:${GREEN.w}px;height:${GREEN.h}px;background:#0f0;
              font-size:40px;color:#fff">john@example.com</div>
  <div style="position:absolute;left:${CARD.x}px;top:${CARD.y}px;width:${CARD.w}px;height:${CARD.h}px;
              font-size:48px;line-height:${CARD.h}px;color:#000">4111 1111 1111 1111</div>
</body></html>`;

async function run(): Promise<void> {
  const win = new BrowserWindow({ x: 0, y: 0, width: W, height: H, frame: false, show: true });
  await win.loadURL(`data:text/html,${encodeURIComponent(PAGE)}`);
  await sleep(500);

  const recorder = new ScreenRecorder();
  setupRedactionHandlers();

  // --- Capture -------------------------------------------------------------
  const sources = await recorder.getSources();
  const screen = sources.find((s) => s.type === 'screen');
  check(!!screen, `found a screen source (${sources.length} sources)`);
  if (!screen) return;

  const id = await recorder.startRecording({
    sourceId: screen.id,
    callId: 'e2e-call',
    resolution: { width: W, height: H },
    frameRate: 15,
    ...(CHUNK_MS ? { chunkIntervalMs: CHUNK_MS } : {}),
  } as any);
  check(recorder.isRecordingActive(id), 'recording active');

  await sleep(RECORD_MS);
  const result = await Promise.race([
    recorder.stopRecording(id),
    sleep(30000).then(() => { throw new Error('stopRecording timed out'); }),
  ]);
  check(result.fileSize > 0, `recording saved (${result.fileSize} bytes, ${result.chunks} chunk(s))`);

  const info = probe(result.filePath);
  console.log('      ', JSON.stringify(info));
  check(info.width === W && info.height === H, `video is ${W}x${H}`);
  // MediaRecorder webm often lacks a duration header; decode to count real content
  const decodedSec = Number(execFileSync(ffmpegInstaller.path, [
    '-v', 'error', '-i', result.filePath, '-map', '0:v', '-c', 'copy', '-f', 'null', '-progress', 'pipe:1', '-',
  ]).toString().match(/out_time_ms=(\d+)/g)?.pop()?.split('=')[1] ?? 0) / 1e6;
  check(decodedSec > (RECORD_MS / 1000) * 0.7, `video contains ~${decodedSec.toFixed(1)}s of footage`);

  const mid = Math.max(0.5, decodedSec / 2);
  const before = frameAt(result.filePath, mid);
  check(isColor(meanRGB(before, RED.x + 10, RED.y + 10, RED.w - 20, RED.h - 20), [255, 0, 0]), 'captured frame shows red marker');
  check(isColor(meanRGB(before, GREEN.x + 10, GREEN.y + 120, GREEN.w - 20, 60), [0, 255, 0]), 'captured frame shows green marker');
  check(spread(before, SSN.x, SSN.y, SSN.w, SSN.h) > 100, 'captured frame shows SSN text');

  // --- Redaction -----------------------------------------------------------
  const apply = handlers.get('redaction:applyToVideo');
  check(!!apply, 'redaction:applyToVideo handler registered');
  if (!apply) return;

  const masks: RedactionMask[] = [{
    id: 'm1', recordingId: id, startTime: 0, endTime: 3600_000, createdAt: Date.now(),
    regions: [
      { bounds: { x: SSN.x, y: SSN.y, width: SSN.w, height: SSN.h }, style: 'solid', piiType: 'ssn', confidence: 1 },
      { bounds: { x: GREEN.x, y: GREEN.y, width: GREEN.w, height: GREEN.h }, style: 'blur', piiType: 'email', confidence: 1 },
      { bounds: { x: CARD.x, y: CARD.y, width: CARD.w, height: CARD.h }, style: 'pixelate', piiType: 'creditCard', confidence: 1 },
    ] as any,
  }];
  const outputPath = join(app.getPath('userData'), 'redacted.mp4');
  const red = await apply({}, { inputPath: result.filePath, outputPath, masks });
  check(red.success === true, `redacted video written (${red.error ?? outputPath})`);
  if (!red.success) return;

  const after = frameAt(outputPath, mid);

  // Optionally save before/after stills for a visual check
  if (process.env.FRAMES_DIR) {
    for (const [name, video] of [['before', result.filePath], ['after', outputPath]]) {
      execFileSync(ffmpegInstaller.path, ['-v', 'error', '-y', '-ss', String(mid), '-i', video,
        '-frames:v', '1', join(process.env.FRAMES_DIR, `${name}.png`)]);
    }
  }
  check(spread(after, SSN.x, SSN.y, SSN.w, SSN.h) < 16, 'solid redaction: SSN region is flat (text gone)');
  check(meanRGB(after, SSN.x, SSN.y, SSN.w, SSN.h).every((v) => v < 20), 'solid redaction: SSN region is black');
  check(isColor(meanRGB(after, RED.x + 10, RED.y + 10, RED.w - 20, RED.h - 20), [255, 0, 0]), 'unredacted red marker still visible');
  // Blur/pixelate must destroy the fine detail that makes text legible
  const emailBefore = sharpness(before, GREEN.x, GREEN.y, GREEN.w, GREEN.h);
  const emailAfter = sharpness(after, GREEN.x, GREEN.y, GREEN.w, GREEN.h);
  check(emailBefore > 0.5, `email text present before redaction (detail ${emailBefore.toFixed(1)})`);
  check(emailAfter < emailBefore * 0.15,
    `blur redaction removes email text detail (${emailBefore.toFixed(1)} -> ${emailAfter.toFixed(1)})`);
  check(isColor(meanRGB(after, GREEN.x, GREEN.y, GREEN.w, GREEN.h), meanRGB(before, GREEN.x, GREEN.y, GREEN.w, GREEN.h), 25),
    'blur redaction keeps the region\'s overall colour (it is a blur, not a box)');
  const cardBefore = sharpness(before, CARD.x, CARD.y, CARD.w, CARD.h);
  const cardAfter = sharpness(after, CARD.x, CARD.y, CARD.w, CARD.h);
  check(cardBefore > 2, `card text present before redaction (detail ${cardBefore.toFixed(1)})`);
  check(cardAfter < cardBefore * 0.5,
    `pixelate redaction removes card text detail (${cardBefore.toFixed(1)} -> ${cardAfter.toFixed(1)})`);
  // Content just outside the redacted regions must be untouched
  check(isColor(meanRGB(after, 1180, 600, 60, 60), [255, 255, 255], 10), 'background outside masks unchanged');
}

app.whenReady()
  .then(run)
  .catch((e) => { console.error(e); failures++; })
  .finally(() => {
    console.log(failures ? `\n${failures} check(s) failed` : '\nAll checks passed');
    app.exit(failures ? 1 : 0);
  });
