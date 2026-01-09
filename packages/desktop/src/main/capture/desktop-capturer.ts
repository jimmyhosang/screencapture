/**
 * Desktop Capturer Service
 *
 * Manages desktop screen capture using Electron's desktopCapturer API.
 * Coordinates between main and renderer processes for MediaRecorder capture.
 */

import { desktopCapturer, BrowserWindow, app } from 'electron';
import { join } from 'path';
import { mkdir, writeFile, readdir, unlink, stat } from 'fs/promises';
import { existsSync } from 'fs';
import { v4 as uuidv4 } from 'uuid';
import {
  CaptureSource,
  CaptureOptions,
  CaptureState,
  CaptureResult,
  CaptureStatus,
  CaptureChunk,
  QUALITY_PRESETS,
  CaptureQuality
} from './types';

// =============================================================================
// Constants
// =============================================================================

const DEFAULT_OUTPUT_DIR = join(app.getPath('userData'), 'recordings');
const CHUNK_INTERVAL_MS = 10000; // 10 seconds between chunks

// =============================================================================
// DesktopCapturer Class
// =============================================================================

export class DesktopCapturer {
  private sessions: Map<string, CaptureState> = new Map();
  private chunks: Map<string, ArrayBuffer[]> = new Map();
  private mainWindow: BrowserWindow | null = null;

  constructor() {
    this.ensureOutputDir();
  }

  /**
   * Set the main window reference for IPC communication
   */
  setMainWindow(window: BrowserWindow): void {
    this.mainWindow = window;
  }

  /**
   * Get available capture sources (screens and windows)
   */
  async getSources(): Promise<CaptureSource[]> {
    try {
      const sources = await desktopCapturer.getSources({
        types: ['screen', 'window'],
        thumbnailSize: { width: 320, height: 180 },
        fetchWindowIcons: true
      });

      return sources.map((source) => ({
        id: source.id,
        name: source.name,
        thumbnail: source.thumbnail.toDataURL(),
        displayId: source.display_id,
        isScreen: source.id.startsWith('screen:'),
        isWindow: source.id.startsWith('window:'),
        appIcon: source.appIcon?.toDataURL()
      }));
    } catch (error) {
      console.error('[DesktopCapturer] Failed to get sources:', error);
      throw error;
    }
  }

  /**
   * Start a new capture session
   */
  async startCapture(options: CaptureOptions): Promise<string> {
    const sessionId = uuidv4();
    const sources = await this.getSources();
    const source = sources.find((s) => s.id === options.sourceId);

    if (!source) {
      throw new Error(`Source not found: ${options.sourceId}`);
    }

    // Resolve quality preset if specified
    const quality = options.quality || 'medium';
    const preset = QUALITY_PRESETS[quality];

    // Create output directory for this session
    const outputDir = options.outputDir || DEFAULT_OUTPUT_DIR;
    const sessionDir = join(outputDir, this.getDatePath());
    await mkdir(sessionDir, { recursive: true });

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `${sessionId}_${timestamp}.webm`;
    const filePath = join(sessionDir, filename);
    const tempDir = join(sessionDir, `${sessionId}_chunks`);
    await mkdir(tempDir, { recursive: true });

    // Create session state
    const state: CaptureState = {
      sessionId,
      sourceId: options.sourceId,
      sourceName: source.name,
      status: 'starting',
      startTime: Date.now(),
      pausedTime: 0,
      filePath,
      tempDir,
      chunkCount: 0,
      options: {
        ...options,
        resolution: options.resolution || preset.resolution,
        frameRate: options.frameRate || preset.frameRate,
        videoBitrate: options.videoBitrate || preset.videoBitrate
      }
    };

    this.sessions.set(sessionId, state);
    this.chunks.set(sessionId, []);

    console.log(`[DesktopCapturer] Starting capture session: ${sessionId}`);
    console.log(`[DesktopCapturer] Source: ${source.name} (${options.sourceId})`);
    console.log(`[DesktopCapturer] Output: ${filePath}`);

    // Notify renderer to start MediaRecorder
    this.notifyRenderer('capture:startMedia', {
      sessionId,
      sourceId: options.sourceId,
      constraints: this.buildMediaConstraints(options, preset)
    });

    return sessionId;
  }

  /**
   * Stop a capture session
   */
  async stopCapture(sessionId: string): Promise<CaptureResult> {
    const state = this.sessions.get(sessionId);
    if (!state) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    console.log(`[DesktopCapturer] Stopping capture session: ${sessionId}`);
    state.status = 'stopping';

    // Notify renderer to stop MediaRecorder
    this.notifyRenderer('capture:stopMedia', { sessionId });

    // Wait for final chunks and merge
    await this.waitForFinalChunks(sessionId);

    // Merge chunks into final file
    const result = await this.finalizeCapture(sessionId);

    // Cleanup
    state.status = 'stopped';
    this.sessions.delete(sessionId);
    this.chunks.delete(sessionId);

    // Clean up temp directory
    await this.cleanupTempDir(state.tempDir);

    return result;
  }

  /**
   * Pause a capture session
   */
  pauseCapture(sessionId: string): void {
    const state = this.sessions.get(sessionId);
    if (!state || state.status !== 'recording') {
      throw new Error(`Cannot pause session: ${sessionId}`);
    }

    state.status = 'paused';
    this.notifyRenderer('capture:pauseMedia', { sessionId });
    console.log(`[DesktopCapturer] Paused capture session: ${sessionId}`);
  }

  /**
   * Resume a paused capture session
   */
  resumeCapture(sessionId: string): void {
    const state = this.sessions.get(sessionId);
    if (!state || state.status !== 'paused') {
      throw new Error(`Cannot resume session: ${sessionId}`);
    }

    state.status = 'recording';
    this.notifyRenderer('capture:resumeMedia', { sessionId });
    console.log(`[DesktopCapturer] Resumed capture session: ${sessionId}`);
  }

  /**
   * Get all active capture sessions
   */
  getActiveSessions(): Map<string, CaptureState> {
    return new Map(this.sessions);
  }

  /**
   * Get a specific session state
   */
  getSession(sessionId: string): CaptureState | undefined {
    return this.sessions.get(sessionId);
  }

  /**
   * Handle chunk data from renderer
   */
  async handleChunk(chunk: CaptureChunk): Promise<void> {
    const state = this.sessions.get(chunk.sessionId);
    if (!state) {
      console.warn(`[DesktopCapturer] Received chunk for unknown session: ${chunk.sessionId}`);
      return;
    }

    // Save chunk to temp file
    const chunkPath = join(state.tempDir, `chunk_${chunk.index.toString().padStart(5, '0')}.webm`);
    await writeFile(chunkPath, Buffer.from(chunk.data));

    state.chunkCount++;

    // Store in memory for merging (if chunks are small enough)
    const chunks = this.chunks.get(chunk.sessionId);
    if (chunks) {
      chunks.push(chunk.data);
    }

    console.log(`[DesktopCapturer] Received chunk ${chunk.index} for session ${chunk.sessionId}`);
  }

  /**
   * Handle capture started notification from renderer
   */
  handleCaptureStarted(sessionId: string): void {
    const state = this.sessions.get(sessionId);
    if (state) {
      state.status = 'recording';
      console.log(`[DesktopCapturer] Capture started for session: ${sessionId}`);
    }
  }

  /**
   * Handle capture error from renderer
   */
  handleCaptureError(sessionId: string, error: string): void {
    const state = this.sessions.get(sessionId);
    if (state) {
      state.status = 'error';
      state.error = error;
      console.error(`[DesktopCapturer] Capture error for session ${sessionId}: ${error}`);
    }
  }

  // ===========================================================================
  // Private Methods
  // ===========================================================================

  private async ensureOutputDir(): Promise<void> {
    if (!existsSync(DEFAULT_OUTPUT_DIR)) {
      await mkdir(DEFAULT_OUTPUT_DIR, { recursive: true });
    }
  }

  private getDatePath(): string {
    const now = new Date();
    const year = now.getFullYear();
    const month = (now.getMonth() + 1).toString().padStart(2, '0');
    return `${year}-${month}`;
  }

  private buildMediaConstraints(
    options: CaptureOptions,
    preset: typeof QUALITY_PRESETS.medium
  ): MediaStreamConstraints {
    const resolution = options.resolution || preset.resolution;
    const frameRate = options.frameRate || preset.frameRate;

    return {
      audio: false, // Screen capture only, no audio for now
      video: {
        // @ts-expect-error - Electron-specific constraint
        mandatory: {
          chromeMediaSource: 'desktop',
          chromeMediaSourceId: options.sourceId,
          minWidth: resolution.width || 1280,
          maxWidth: resolution.width || 1920,
          minHeight: resolution.height || 720,
          maxHeight: resolution.height || 1080,
          minFrameRate: frameRate,
          maxFrameRate: frameRate
        }
      }
    };
  }

  private notifyRenderer(channel: string, data: unknown): void {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send(channel, data);
    }
  }

  private async waitForFinalChunks(sessionId: string): Promise<void> {
    // Wait a bit for final chunk to arrive
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  private async finalizeCapture(sessionId: string): Promise<CaptureResult> {
    const state = this.sessions.get(sessionId);
    if (!state) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    const chunks = this.chunks.get(sessionId) || [];
    const duration = Date.now() - state.startTime - state.pausedTime;

    if (chunks.length === 0) {
      throw new Error('No video data captured');
    }

    // Concatenate all chunks into final file
    const totalSize = chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0);
    const combined = new Uint8Array(totalSize);
    let offset = 0;

    for (const chunk of chunks) {
      combined.set(new Uint8Array(chunk), offset);
      offset += chunk.byteLength;
    }

    await writeFile(state.filePath, combined);

    const stats = await stat(state.filePath);

    console.log(`[DesktopCapturer] Finalized capture: ${state.filePath}`);
    console.log(`[DesktopCapturer] Duration: ${duration}ms, Size: ${stats.size} bytes`);

    return {
      sessionId,
      filePath: state.filePath,
      duration,
      fileSize: stats.size,
      resolution: state.options.resolution || { width: 1920, height: 1080 },
      frameRate: state.options.frameRate || 24,
      chunksMerged: chunks.length
    };
  }

  private async cleanupTempDir(tempDir: string): Promise<void> {
    try {
      if (existsSync(tempDir)) {
        const files = await readdir(tempDir);
        for (const file of files) {
          await unlink(join(tempDir, file));
        }
        // Remove directory
        await unlink(tempDir).catch(() => {});
      }
    } catch (error) {
      console.warn(`[DesktopCapturer] Failed to cleanup temp dir: ${tempDir}`, error);
    }
  }
}

// =============================================================================
// Singleton Instance
// =============================================================================

let instance: DesktopCapturer | null = null;

export function getDesktopCapturer(): DesktopCapturer {
  if (!instance) {
    instance = new DesktopCapturer();
  }
  return instance;
}

export function resetDesktopCapturer(): void {
  instance = null;
}
