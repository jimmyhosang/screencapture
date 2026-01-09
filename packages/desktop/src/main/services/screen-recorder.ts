/**
 * Screen Recorder Service
 *
 * Core screen recording functionality using Electron's desktopCapturer.
 * Supports chunked recording, active window tracking, and crash recovery.
 */

import { desktopCapturer, BrowserWindow, ipcMain } from 'electron';
import { join, basename } from 'path';
import { existsSync, mkdirSync, unlinkSync, readdirSync, writeFileSync, readFileSync } from 'fs';
import { unlink, writeFile, readFile, readdir } from 'fs/promises';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';
import { getRecordingsPath } from '../database';

// Set ffmpeg path
ffmpeg.setFfmpegPath(ffmpegInstaller.path);

// =============================================================================
// Types
// =============================================================================

export interface SourceInfo {
  id: string;
  name: string;
  type: 'screen' | 'window';
  thumbnailDataUrl: string;
  displayId?: string;
}

export interface RecordingOptions {
  sourceId: string;
  callId: string;
  agentId: string;
  resolution?: { width: number; height: number };
  frameRate?: number;
  outputDir?: string;
  maxDuration?: number; // in milliseconds, default 2 hours
}

export interface RecordingResult {
  recordingId: string;
  filePath: string;
  duration: number;
  fileSize: number;
  windowActivityPath: string | null;
  chunks: number;
}

export interface RecordingState {
  recordingId: string;
  sourceId: string;
  callId: string;
  agentId: string;
  startTime: Date;
  outputDir: string;
  chunks: string[];
  currentChunk: number;
  isRecording: boolean;
  windowActivity: WindowActivity[];
  resolution: { width: number; height: number };
  frameRate: number;
  maxDuration: number;
}

export interface WindowActivity {
  timestamp: number;
  windowTitle: string;
  processName: string;
  url?: string;
  bounds?: { x: number; y: number; width: number; height: number };
}

// Default settings
const DEFAULT_RESOLUTION = { width: 1920, height: 1080 };
const DEFAULT_FRAME_RATE = 15;
const DEFAULT_MAX_DURATION = 2 * 60 * 60 * 1000; // 2 hours
const CHUNK_INTERVAL = 30 * 1000; // 30 seconds
const WINDOW_POLL_INTERVAL = 2000; // 2 seconds

// =============================================================================
// ScreenRecorder Class
// =============================================================================

export class ScreenRecorder {
  private activeRecordings: Map<string, RecordingState> = new Map();
  private recordingWindows: Map<string, BrowserWindow> = new Map();
  private chunkTimers: Map<string, NodeJS.Timeout> = new Map();
  private windowTrackingTimers: Map<string, NodeJS.Timeout> = new Map();
  private maxDurationTimers: Map<string, NodeJS.Timeout> = new Map();

  constructor() {
    this.setupIpcHandlers();
    this.recoverCrashedRecordings();
  }

  /**
   * Get available screens and windows for recording
   */
  async getSources(): Promise<SourceInfo[]> {
    const sources = await desktopCapturer.getSources({
      types: ['screen', 'window'],
      thumbnailSize: { width: 320, height: 180 },
      fetchWindowIcons: true
    });

    return sources.map((source) => ({
      id: source.id,
      name: source.name,
      type: source.id.startsWith('screen') ? ('screen' as const) : ('window' as const),
      thumbnailDataUrl: source.thumbnail.toDataURL(),
      displayId: source.display_id || undefined
    }));
  }

  /**
   * Start recording a screen or window
   */
  async startRecording(options: RecordingOptions): Promise<string> {
    const recordingId = `rec-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    const outputDir = options.outputDir || join(getRecordingsPath(), recordingId);
    const resolution = options.resolution || DEFAULT_RESOLUTION;
    const frameRate = options.frameRate || DEFAULT_FRAME_RATE;
    const maxDuration = options.maxDuration || DEFAULT_MAX_DURATION;

    // Create output directory
    if (!existsSync(outputDir)) {
      mkdirSync(outputDir, { recursive: true });
    }

    // Create recording state
    const state: RecordingState = {
      recordingId,
      sourceId: options.sourceId,
      callId: options.callId,
      agentId: options.agentId,
      startTime: new Date(),
      outputDir,
      chunks: [],
      currentChunk: 0,
      isRecording: true,
      windowActivity: [],
      resolution,
      frameRate,
      maxDuration
    };

    this.activeRecordings.set(recordingId, state);

    // Save state for crash recovery
    this.saveRecordingState(recordingId, state);

    // Create hidden browser window for recording
    const recordingWindow = new BrowserWindow({
      width: resolution.width,
      height: resolution.height,
      show: false,
      webPreferences: {
        nodeIntegration: true,
        contextIsolation: false,
        backgroundThrottling: false
      }
    });

    this.recordingWindows.set(recordingId, recordingWindow);

    // Load recording page
    await recordingWindow.loadURL(`data:text/html,${encodeURIComponent(this.getRecorderHTML())}`);

    // Start recording in the window
    await recordingWindow.webContents.executeJavaScript(`
      window.startRecording({
        sourceId: '${options.sourceId}',
        recordingId: '${recordingId}',
        resolution: ${JSON.stringify(resolution)},
        frameRate: ${frameRate}
      });
    `);

    // Start chunk timer
    this.startChunkTimer(recordingId);

    // Start window tracking
    this.startWindowTracking(recordingId);

    // Start max duration timer
    this.startMaxDurationTimer(recordingId, maxDuration);

    console.log(`[ScreenRecorder] Started recording ${recordingId} for call ${options.callId}`);

    return recordingId;
  }

  /**
   * Stop recording and merge chunks
   */
  async stopRecording(recordingId: string): Promise<RecordingResult> {
    const state = this.activeRecordings.get(recordingId);
    if (!state) {
      throw new Error(`Recording ${recordingId} not found`);
    }

    state.isRecording = false;

    // Stop timers
    this.stopChunkTimer(recordingId);
    this.stopWindowTracking(recordingId);
    this.stopMaxDurationTimer(recordingId);

    // Get final chunk from browser window
    const recordingWindow = this.recordingWindows.get(recordingId);
    if (recordingWindow && !recordingWindow.isDestroyed()) {
      try {
        const chunkData = await recordingWindow.webContents.executeJavaScript(
          'window.stopRecording()'
        );
        if (chunkData) {
          const chunkPath = join(state.outputDir, `chunk_${state.currentChunk}.webm`);
          await this.saveChunk(chunkData, chunkPath);
          state.chunks.push(chunkPath);
        }
      } catch (error) {
        console.error(`[ScreenRecorder] Error getting final chunk:`, error);
      }
      recordingWindow.close();
    }

    this.recordingWindows.delete(recordingId);

    // Calculate duration
    const duration = Date.now() - state.startTime.getTime();

    // Save window activity
    let windowActivityPath: string | null = null;
    if (state.windowActivity.length > 0) {
      windowActivityPath = join(state.outputDir, 'window_activity.json');
      await writeFile(windowActivityPath, JSON.stringify(state.windowActivity, null, 2));
    }

    // Merge chunks
    const finalPath = join(getRecordingsPath(), `${recordingId}.webm`);
    await this.mergeChunks(state.chunks, finalPath);

    // Get file size
    const stats = await import('fs/promises').then((fs) => fs.stat(finalPath));

    // Clean up chunks
    await this.cleanupChunks(state.chunks, state.outputDir);

    // Remove state file
    this.removeRecordingState(recordingId);

    // Remove from active recordings
    this.activeRecordings.delete(recordingId);

    console.log(`[ScreenRecorder] Stopped recording ${recordingId}, merged ${state.chunks.length} chunks`);

    return {
      recordingId,
      filePath: finalPath,
      duration,
      fileSize: stats.size,
      windowActivityPath,
      chunks: state.chunks.length
    };
  }

  /**
   * Get all active recordings
   */
  getActiveRecordings(): Map<string, RecordingState> {
    return new Map(this.activeRecordings);
  }

  /**
   * Check if a recording is active
   */
  isRecordingActive(recordingId: string): boolean {
    return this.activeRecordings.has(recordingId);
  }

  /**
   * Force stop all recordings (for cleanup)
   */
  async stopAllRecordings(): Promise<void> {
    const recordingIds = Array.from(this.activeRecordings.keys());
    await Promise.all(recordingIds.map((id) => this.stopRecording(id).catch(console.error)));
  }

  // =============================================================================
  // Private Methods
  // =============================================================================

  private setupIpcHandlers(): void {
    // Handle chunk data from renderer
    ipcMain.on('recording:chunk', async (event, recordingId: string, chunkData: string) => {
      const state = this.activeRecordings.get(recordingId);
      if (!state || !state.isRecording) return;

      const chunkPath = join(state.outputDir, `chunk_${state.currentChunk}.webm`);
      await this.saveChunk(chunkData, chunkPath);
      state.chunks.push(chunkPath);
      state.currentChunk++;

      // Update state file
      this.saveRecordingState(recordingId, state);

      console.log(`[ScreenRecorder] Saved chunk ${state.currentChunk} for ${recordingId}`);
    });

    // Handle recording errors
    ipcMain.on('recording:error', (event, recordingId: string, error: string) => {
      console.error(`[ScreenRecorder] Recording error for ${recordingId}:`, error);
      // Attempt to stop recording gracefully
      this.stopRecording(recordingId).catch(console.error);
    });
  }

  private async saveChunk(base64Data: string, filePath: string): Promise<void> {
    const buffer = Buffer.from(base64Data, 'base64');
    await writeFile(filePath, buffer);
  }

  private startChunkTimer(recordingId: string): void {
    const timer = setInterval(async () => {
      const state = this.activeRecordings.get(recordingId);
      if (!state || !state.isRecording) {
        this.stopChunkTimer(recordingId);
        return;
      }

      const recordingWindow = this.recordingWindows.get(recordingId);
      if (recordingWindow && !recordingWindow.isDestroyed()) {
        try {
          // Request chunk from renderer
          await recordingWindow.webContents.executeJavaScript('window.requestChunk()');
        } catch (error) {
          console.error(`[ScreenRecorder] Error requesting chunk:`, error);
        }
      }
    }, CHUNK_INTERVAL);

    this.chunkTimers.set(recordingId, timer);
  }

  private stopChunkTimer(recordingId: string): void {
    const timer = this.chunkTimers.get(recordingId);
    if (timer) {
      clearInterval(timer);
      this.chunkTimers.delete(recordingId);
    }
  }

  private startWindowTracking(recordingId: string): void {
    const timer = setInterval(async () => {
      const state = this.activeRecordings.get(recordingId);
      if (!state || !state.isRecording) {
        this.stopWindowTracking(recordingId);
        return;
      }

      try {
        // Dynamic import for active-win (ESM module)
        const activeWin = await import('active-win');
        const window = await activeWin.default();

        if (window) {
          const activity: WindowActivity = {
            timestamp: Date.now(),
            windowTitle: window.title || '',
            processName: window.owner?.name || '',
            url: (window as unknown as { url?: string }).url,
            bounds: window.bounds
          };
          state.windowActivity.push(activity);
        }
      } catch (error) {
        // active-win may fail on some platforms, ignore
      }
    }, WINDOW_POLL_INTERVAL);

    this.windowTrackingTimers.set(recordingId, timer);
  }

  private stopWindowTracking(recordingId: string): void {
    const timer = this.windowTrackingTimers.get(recordingId);
    if (timer) {
      clearInterval(timer);
      this.windowTrackingTimers.delete(recordingId);
    }
  }

  private startMaxDurationTimer(recordingId: string, maxDuration: number): void {
    const timer = setTimeout(async () => {
      console.log(`[ScreenRecorder] Max duration reached for ${recordingId}, stopping`);
      try {
        await this.stopRecording(recordingId);
      } catch (error) {
        console.error(`[ScreenRecorder] Error stopping recording at max duration:`, error);
      }
    }, maxDuration);

    this.maxDurationTimers.set(recordingId, timer);
  }

  private stopMaxDurationTimer(recordingId: string): void {
    const timer = this.maxDurationTimers.get(recordingId);
    if (timer) {
      clearTimeout(timer);
      this.maxDurationTimers.delete(recordingId);
    }
  }

  private async mergeChunks(chunks: string[], outputPath: string): Promise<void> {
    if (chunks.length === 0) {
      throw new Error('No chunks to merge');
    }

    if (chunks.length === 1) {
      // Just copy single chunk
      const fs = await import('fs/promises');
      await fs.copyFile(chunks[0], outputPath);
      return;
    }

    return new Promise((resolve, reject) => {
      // Create concat file for ffmpeg
      const concatFilePath = join(getRecordingsPath(), `concat_${Date.now()}.txt`);
      const concatContent = chunks.map((chunk) => `file '${chunk}'`).join('\n');
      writeFileSync(concatFilePath, concatContent);

      ffmpeg()
        .input(concatFilePath)
        .inputOptions(['-f', 'concat', '-safe', '0'])
        .outputOptions(['-c', 'copy']) // Copy without re-encoding
        .output(outputPath)
        .on('end', () => {
          // Clean up concat file
          try {
            unlinkSync(concatFilePath);
          } catch {}
          resolve();
        })
        .on('error', (err) => {
          try {
            unlinkSync(concatFilePath);
          } catch {}
          reject(err);
        })
        .run();
    });
  }

  private async cleanupChunks(chunks: string[], outputDir: string): Promise<void> {
    // Delete chunk files
    for (const chunk of chunks) {
      try {
        await unlink(chunk);
      } catch {}
    }

    // Try to remove output directory if empty
    try {
      const remaining = await readdir(outputDir);
      if (remaining.length === 0) {
        const fs = await import('fs/promises');
        await fs.rmdir(outputDir);
      }
    } catch {}
  }

  private saveRecordingState(recordingId: string, state: RecordingState): void {
    const stateFile = join(getRecordingsPath(), `${recordingId}.state.json`);
    const saveState = {
      ...state,
      startTime: state.startTime.toISOString()
    };
    writeFileSync(stateFile, JSON.stringify(saveState, null, 2));
  }

  private removeRecordingState(recordingId: string): void {
    const stateFile = join(getRecordingsPath(), `${recordingId}.state.json`);
    try {
      unlinkSync(stateFile);
    } catch {}
  }

  private async recoverCrashedRecordings(): Promise<void> {
    const recordingsPath = getRecordingsPath();

    try {
      const files = readdirSync(recordingsPath);
      const stateFiles = files.filter((f) => f.endsWith('.state.json'));

      for (const stateFile of stateFiles) {
        try {
          const content = readFileSync(join(recordingsPath, stateFile), 'utf-8');
          const state = JSON.parse(content) as RecordingState & { startTime: string };

          console.log(`[ScreenRecorder] Found crashed recording: ${state.recordingId}`);

          // If there are chunks, try to merge them
          if (state.chunks.length > 0) {
            const validChunks = state.chunks.filter((c) => existsSync(c));
            if (validChunks.length > 0) {
              const finalPath = join(recordingsPath, `${state.recordingId}_recovered.webm`);
              await this.mergeChunks(validChunks, finalPath);
              console.log(`[ScreenRecorder] Recovered ${validChunks.length} chunks to ${finalPath}`);
              await this.cleanupChunks(validChunks, state.outputDir);
            }
          }

          // Remove state file
          unlinkSync(join(recordingsPath, stateFile));
        } catch (error) {
          console.error(`[ScreenRecorder] Error recovering recording:`, error);
        }
      }
    } catch (error) {
      // Recordings path may not exist yet
    }
  }

  private getRecorderHTML(): string {
    return `
<!DOCTYPE html>
<html>
<head>
  <title>Screen Recorder</title>
</head>
<body>
  <video id="preview" muted style="display:none;"></video>
  <script>
    const { ipcRenderer } = require('electron');

    let mediaRecorder = null;
    let recordedChunks = [];
    let currentRecordingId = null;

    window.startRecording = async function(options) {
      currentRecordingId = options.recordingId;

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: {
            mandatory: {
              chromeMediaSource: 'desktop',
              chromeMediaSourceId: options.sourceId,
              minWidth: options.resolution.width,
              maxWidth: options.resolution.width,
              minHeight: options.resolution.height,
              maxHeight: options.resolution.height,
              minFrameRate: options.frameRate,
              maxFrameRate: options.frameRate
            }
          }
        });

        // Show preview
        const video = document.getElementById('preview');
        video.srcObject = stream;
        video.play();

        // Start recording
        mediaRecorder = new MediaRecorder(stream, {
          mimeType: 'video/webm;codecs=vp9',
          videoBitsPerSecond: 2500000
        });

        mediaRecorder.ondataavailable = (event) => {
          if (event.data.size > 0) {
            recordedChunks.push(event.data);
          }
        };

        mediaRecorder.onerror = (event) => {
          ipcRenderer.send('recording:error', currentRecordingId, event.error?.message || 'Unknown error');
        };

        mediaRecorder.start();
        console.log('Recording started');
      } catch (error) {
        ipcRenderer.send('recording:error', currentRecordingId, error.message);
      }
    };

    window.requestChunk = async function() {
      if (!mediaRecorder || mediaRecorder.state !== 'recording') return;

      return new Promise((resolve) => {
        mediaRecorder.requestData();

        setTimeout(async () => {
          if (recordedChunks.length > 0) {
            const blob = new Blob(recordedChunks, { type: 'video/webm' });
            const buffer = await blob.arrayBuffer();
            const base64 = btoa(String.fromCharCode(...new Uint8Array(buffer)));
            ipcRenderer.send('recording:chunk', currentRecordingId, base64);
            recordedChunks = [];
          }
          resolve();
        }, 100);
      });
    };

    window.stopRecording = async function() {
      if (!mediaRecorder) return null;

      return new Promise((resolve) => {
        mediaRecorder.onstop = async () => {
          if (recordedChunks.length > 0) {
            const blob = new Blob(recordedChunks, { type: 'video/webm' });
            const buffer = await blob.arrayBuffer();
            const base64 = btoa(String.fromCharCode(...new Uint8Array(buffer)));
            resolve(base64);
          } else {
            resolve(null);
          }
        };

        mediaRecorder.stop();

        // Stop all tracks
        const video = document.getElementById('preview');
        if (video.srcObject) {
          video.srcObject.getTracks().forEach(track => track.stop());
        }
      });
    };
  </script>
</body>
</html>
    `;
  }
}

// Singleton instance
let screenRecorder: ScreenRecorder | null = null;

export function getScreenRecorder(): ScreenRecorder {
  if (!screenRecorder) {
    screenRecorder = new ScreenRecorder();
  }
  return screenRecorder;
}

export function resetScreenRecorder(): void {
  if (screenRecorder) {
    screenRecorder.stopAllRecordings().catch(console.error);
    screenRecorder = null;
  }
}
