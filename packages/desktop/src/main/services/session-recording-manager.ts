/**
 * Session Recording Manager
 *
 * Unified orchestration service that coordinates:
 * - Desktop screen capture (video)
 * - Global input tracking (mouse, keyboard, scroll)
 * - Active window tracking
 * - Privacy filtering
 *
 * Provides a single API to start/stop complete recording sessions
 * that capture all aspects of user activity.
 */

import { ipcMain, BrowserWindow } from 'electron';
import { join, dirname } from 'path';
import { promises as fs } from 'fs';
import { EventEmitter } from 'events';
import {
  getDesktopCapturer,
  getInputTracker,
  getInputPrivacyFilter,
  resetInputTracker,
  saveInputEvents as saveInputEventsToFile
} from '../capture';
import type {
  CaptureOptions,
  CaptureResult,
  InputEvent,
  InputTrackerConfig
} from '../capture';
import { getActiveWindowTracker } from '../tracking';
import { getRecordingsPath } from '../database';
import { getRecordingIndexer } from './recording-indexer';
import { getOcrProcessor } from './ocr-processor';
import {
  getAutoRedactionService,
  getAutoRedactionConfig,
  setAutoRedactionConfig,
  isAutoRedactionEnabled,
  type AutoRedactionConfig,
  type RedactionProgress
} from './auto-redaction';

// =============================================================================
// Types
// =============================================================================

export interface SessionRecordingConfig {
  // Video capture
  quality: 'low' | 'medium' | 'high' | 'ultra';
  resolution?: { width: number; height: number };
  frameRate?: number;

  // Input tracking
  captureInputs: boolean;
  inputConfig?: Partial<InputTrackerConfig>;

  // Window tracking
  captureWindowActivity: boolean;
  windowPollingInterval?: number;

  // Privacy
  enablePrivacyFilter: boolean;
  keyboardMode?: 'full' | 'masked' | 'none';

  // Metadata
  metadata?: Record<string, unknown>;
  callId?: string;
  agentId?: string;

  // Auto-redaction
  autoRedaction?: Partial<AutoRedactionConfig>;
}

export interface SessionRecordingState {
  sessionId: string;
  status: 'starting' | 'recording' | 'paused' | 'stopping' | 'stopped' | 'error';
  startTime: number;
  pausedTime: number;
  sourceId: string;
  sourceName: string;
  config: SessionRecordingConfig;
  captureSessionId: string | null;
  inputEventCount: number;
  windowChangeCount: number;
  errorMessage?: string;
}

export interface SessionRecordingResult {
  sessionId: string;
  videoPath: string;
  inputEventsPath: string | null;
  windowLogPath: string | null;
  duration: number;
  fileSize: number;
  inputEventCount: number;
  windowChangeCount: number;
  resolution: { width: number; height: number };
  metadata?: Record<string, unknown>;
  redaction?: {
    enabled: boolean;
    piiRegionsFound: number;
    processingTimeMs: number;
  };
}

export type SessionEventType =
  | 'session:starting'
  | 'session:started'
  | 'session:paused'
  | 'session:resumed'
  | 'session:stopping'
  | 'session:stopped'
  | 'session:error'
  | 'session:progress';

export interface SessionProgressData {
  sessionId: string;
  duration: number;
  inputEventCount: number;
  windowChangeCount: number;
}

const DEFAULT_CONFIG: SessionRecordingConfig = {
  quality: 'medium',
  captureInputs: true,
  captureWindowActivity: true,
  enablePrivacyFilter: true,
  keyboardMode: 'masked'
};

// =============================================================================
// SessionRecordingManager Class
// =============================================================================

export class SessionRecordingManager extends EventEmitter {
  private sessions: Map<string, SessionRecordingState> = new Map();
  private mainWindow: BrowserWindow | null = null;
  private progressIntervals: Map<string, NodeJS.Timeout> = new Map();
  private isShuttingDown = false;

  constructor() {
    super();
    this.setupIpcHandlers();
  }

  // ===========================================================================
  // Public Methods
  // ===========================================================================

  /**
   * Set main window for IPC communication
   */
  setMainWindow(window: BrowserWindow): void {
    this.mainWindow = window;
  }

  /**
   * Start a new recording session
   */
  async startSession(
    sourceId: string,
    config: Partial<SessionRecordingConfig> = {}
  ): Promise<string> {
    const sessionId = `session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const fullConfig = { ...DEFAULT_CONFIG, ...config };

    console.log(`[SessionManager] Starting session ${sessionId} for source ${sourceId}`);

    // Create session state
    const state: SessionRecordingState = {
      sessionId,
      status: 'starting',
      startTime: Date.now(),
      pausedTime: 0,
      sourceId,
      sourceName: '',
      config: fullConfig,
      captureSessionId: null,
      inputEventCount: 0,
      windowChangeCount: 0
    };

    this.sessions.set(sessionId, state);
    this.emit('session:starting', { sessionId });
    this.notifyRenderer('session:starting', { sessionId });

    try {
      // 1. Start desktop capture
      const capturer = getDesktopCapturer();
      const captureOptions: CaptureOptions = {
        sourceId,
        quality: fullConfig.quality,
        resolution: fullConfig.resolution,
        frameRate: fullConfig.frameRate,
        metadata: {
          ...fullConfig.metadata,
          sessionId,
          callId: fullConfig.callId,
          agentId: fullConfig.agentId
        }
      };

      const captureSessionId = await capturer.startCapture(captureOptions);
      state.captureSessionId = captureSessionId;

      // Get source info
      const captureState = capturer.getSession(captureSessionId);
      state.sourceName = captureState?.sourceName || 'Unknown';

      // 2. Start input tracking if enabled
      if (fullConfig.captureInputs) {
        const inputTracker = getInputTracker();
        const inputConfig: Partial<InputTrackerConfig> = {
          keyboardMode: fullConfig.keyboardMode || 'masked',
          ...fullConfig.inputConfig
        };
        inputTracker.setConfig(inputConfig);
        inputTracker.start(sessionId);
      }

      // 3. Start window tracking if enabled
      if (fullConfig.captureWindowActivity) {
        const windowTracker = getActiveWindowTracker();
        if (fullConfig.windowPollingInterval) {
          windowTracker.setConfig({ pollIntervalMs: fullConfig.windowPollingInterval });
        }
        windowTracker.start(sessionId);
      }

      // 4. Start progress reporting
      this.startProgressReporting(sessionId);

      state.status = 'recording';
      this.emit('session:started', { sessionId, sourceId, sourceName: state.sourceName });
      this.notifyRenderer('session:started', { sessionId, sourceId, sourceName: state.sourceName });

      console.log(`[SessionManager] Session ${sessionId} started successfully`);
      return sessionId;
    } catch (error) {
      state.status = 'error';
      state.errorMessage = error instanceof Error ? error.message : 'Unknown error';

      this.emit('session:error', { sessionId, error: state.errorMessage });
      this.notifyRenderer('session:error', { sessionId, error: state.errorMessage });

      // Cleanup partial start
      await this.cleanupSession(sessionId, true);

      throw error;
    }
  }

  /**
   * Stop a recording session and save all data
   */
  async stopSession(sessionId: string): Promise<SessionRecordingResult> {
    const state = this.sessions.get(sessionId);
    if (!state) {
      throw new Error(`Session ${sessionId} not found`);
    }

    if (state.status === 'stopped' || state.status === 'error') {
      throw new Error(`Session ${sessionId} is already ${state.status}`);
    }

    console.log(`[SessionManager] Stopping session ${sessionId}`);

    state.status = 'stopping';
    this.emit('session:stopping', { sessionId });
    this.notifyRenderer('session:stopping', { sessionId });

    // Stop progress reporting
    this.stopProgressReporting(sessionId);

    try {
      // 1. Stop input tracking and collect events
      let inputEvents: InputEvent[] = [];
      if (state.config.captureInputs) {
        const inputTracker = getInputTracker();
        if (inputTracker.isTracking()) {
          inputEvents = inputTracker.stop();

          // Apply privacy filter
          if (state.config.enablePrivacyFilter) {
            const privacyFilter = getInputPrivacyFilter();
            inputEvents = privacyFilter.filterEvents(inputEvents);
          }

          state.inputEventCount = inputEvents.length;
        }
      }

      // 2. Stop window tracking (saves to database automatically)
      let windowLogs: unknown[] = [];
      if (state.config.captureWindowActivity) {
        const windowTracker = getActiveWindowTracker();
        if (windowTracker.isTracking() && windowTracker.getRecordingId() === sessionId) {
          windowLogs = windowTracker.stop();
          state.windowChangeCount = windowLogs.length;
        }
      }

      // 3. Stop desktop capture
      let captureResult: CaptureResult | null = null;
      if (state.captureSessionId) {
        const capturer = getDesktopCapturer();
        captureResult = await capturer.stopCapture(state.captureSessionId);
      }

      if (!captureResult) {
        throw new Error('Failed to stop capture - no result');
      }

      // 4. Save input events to sidecar file
      let inputEventsPath: string | null = null;
      if (inputEvents.length > 0) {
        inputEventsPath = await saveInputEventsToFile(captureResult.filePath, inputEvents);
        console.log(`[SessionManager] Saved ${inputEvents.length} input events to ${inputEventsPath}`);
      }

      // 5. Create window log sidecar file
      let windowLogPath: string | null = null;
      if (windowLogs.length > 0) {
        windowLogPath = captureResult.filePath.replace(/\.[^/.]+$/, '.windows.json');
        await fs.writeFile(windowLogPath, JSON.stringify({
          version: '1.0',
          sessionId,
          videoFile: captureResult.filePath,
          createdAt: Date.now(),
          entryCount: windowLogs.length,
          logs: windowLogs
        }, null, 2));
        console.log(`[SessionManager] Saved ${windowLogs.length} window logs to ${windowLogPath}`);
      }

      // Create result
      const result: SessionRecordingResult = {
        sessionId,
        videoPath: captureResult.filePath,
        inputEventsPath,
        windowLogPath,
        duration: captureResult.duration,
        fileSize: captureResult.fileSize,
        inputEventCount: inputEvents.length,
        windowChangeCount: windowLogs.length,
        resolution: captureResult.resolution,
        metadata: state.config.metadata
      };

      state.status = 'stopped';

      // 6. Apply auto-redaction if enabled
      let redactionInfo: SessionRecordingResult['redaction'];
      const globalEnabled = isAutoRedactionEnabled();
      const sessionEnabled = state.config.autoRedaction?.enabled;
      console.log(`[SessionManager] Auto-redaction check: global=${globalEnabled}, session=${sessionEnabled}`);

      if (globalEnabled || sessionEnabled) {
        try {
          console.log(`[SessionManager] Running auto-redaction on ${captureResult.filePath}`);
          this.notifyRenderer('session:redacting', { sessionId, message: 'Analyzing for PII...' });

          const redactionService = getAutoRedactionService();

          // Set up progress callback
          redactionService.onProgress((progress: RedactionProgress) => {
            this.notifyRenderer('session:redactionProgress', {
              sessionId,
              ...progress
            });
          });

          const redactionResult = await redactionService.processVideo(
            captureResult.filePath,
            { enabled: true, ...state.config.autoRedaction }
          );

          redactionInfo = {
            enabled: true,
            piiRegionsFound: redactionResult.piiRegionsFound,
            processingTimeMs: redactionResult.processingTimeMs,
          };

          if (redactionResult.piiRegionsFound > 0) {
            console.log(`[SessionManager] Redacted ${redactionResult.piiRegionsFound} PII regions`);
          } else {
            console.log(`[SessionManager] No PII found in recording`);
          }
        } catch (redactionError) {
          console.error(`[SessionManager] Auto-redaction failed:`, redactionError);
          // Don't throw - recording was still successful, just not redacted
          redactionInfo = {
            enabled: true,
            piiRegionsFound: 0,
            processingTimeMs: 0,
          };
        }
      }

      // 7. Index the recording so it appears in the session list
      let recordingId: string | null = null;
      try {
        const indexer = getRecordingIndexer();
        const indexed = await indexer.indexRecording(captureResult.filePath);
        if (indexed) {
          recordingId = indexed.id;
        }
        console.log(`[SessionManager] Recording indexed: ${captureResult.filePath}`);
      } catch (indexError) {
        console.error(`[SessionManager] Failed to index recording:`, indexError);
        // Don't throw - recording was still successful, just not indexed
      }

      // 8. Queue OCR processing for redaction overlay
      if (recordingId) {
        try {
          const ocrProcessor = getOcrProcessor();
          const jobId = ocrProcessor.queueRecording(recordingId, {
            frameInterval: 1, // Extract frame every 1 second for better tracking
            priority: 'normal'
          });
          console.log(`[SessionManager] Queued OCR processing: ${jobId} for recording: ${recordingId}`);
        } catch (ocrError) {
          console.error(`[SessionManager] Failed to queue OCR:`, ocrError);
          // Don't throw - recording was still successful
        }
      }

      // Add redaction info to result
      if (redactionInfo) {
        result.redaction = redactionInfo;
      }

      this.emit('session:stopped', { sessionId, result });
      this.notifyRenderer('session:stopped', { sessionId, result });

      console.log(`[SessionManager] Session ${sessionId} stopped. Video: ${captureResult.filePath}`);

      return result;
    } catch (error) {
      state.status = 'error';
      state.errorMessage = error instanceof Error ? error.message : 'Unknown error';

      this.emit('session:error', { sessionId, error: state.errorMessage });
      this.notifyRenderer('session:error', { sessionId, error: state.errorMessage });

      throw error;
    }
  }

  /**
   * Pause a recording session
   */
  pauseSession(sessionId: string): void {
    const state = this.sessions.get(sessionId);
    if (!state) {
      throw new Error(`Session ${sessionId} not found`);
    }

    if (state.status !== 'recording') {
      throw new Error(`Cannot pause session in ${state.status} state`);
    }

    console.log(`[SessionManager] Pausing session ${sessionId}`);

    // Pause all components
    if (state.captureSessionId) {
      const capturer = getDesktopCapturer();
      capturer.pauseCapture(state.captureSessionId);
    }

    if (state.config.captureInputs) {
      const inputTracker = getInputTracker();
      inputTracker.pause();
    }

    if (state.config.captureWindowActivity) {
      const windowTracker = getActiveWindowTracker();
      windowTracker.pause();
    }

    state.status = 'paused';
    this.emit('session:paused', { sessionId });
    this.notifyRenderer('session:paused', { sessionId });
  }

  /**
   * Resume a paused recording session
   */
  resumeSession(sessionId: string): void {
    const state = this.sessions.get(sessionId);
    if (!state) {
      throw new Error(`Session ${sessionId} not found`);
    }

    if (state.status !== 'paused') {
      throw new Error(`Cannot resume session in ${state.status} state`);
    }

    console.log(`[SessionManager] Resuming session ${sessionId}`);

    // Resume all components
    if (state.captureSessionId) {
      const capturer = getDesktopCapturer();
      capturer.resumeCapture(state.captureSessionId);
    }

    if (state.config.captureInputs) {
      const inputTracker = getInputTracker();
      inputTracker.resume();
    }

    if (state.config.captureWindowActivity) {
      const windowTracker = getActiveWindowTracker();
      windowTracker.resume();
    }

    state.status = 'recording';
    this.emit('session:resumed', { sessionId });
    this.notifyRenderer('session:resumed', { sessionId });
  }

  /**
   * Get session state
   */
  getSession(sessionId: string): SessionRecordingState | null {
    return this.sessions.get(sessionId) || null;
  }

  /**
   * Get all active sessions
   */
  getActiveSessions(): SessionRecordingState[] {
    return Array.from(this.sessions.values()).filter(
      (s) => s.status === 'recording' || s.status === 'paused'
    );
  }

  /**
   * Check if any session is active
   */
  isRecording(): boolean {
    return this.getActiveSessions().length > 0;
  }

  /**
   * Get available capture sources
   */
  async getSources(): Promise<Array<{
    id: string;
    name: string;
    thumbnail: string;
    isScreen: boolean;
    isWindow: boolean;
  }>> {
    const capturer = getDesktopCapturer();
    return capturer.getSources();
  }

  /**
   * Shutdown all sessions
   */
  async shutdown(): Promise<void> {
    if (this.isShuttingDown) return;
    this.isShuttingDown = true;

    console.log('[SessionManager] Shutting down...');

    const activeSessions = this.getActiveSessions();
    for (const session of activeSessions) {
      try {
        await this.stopSession(session.sessionId);
      } catch (error) {
        console.error(`[SessionManager] Error stopping session ${session.sessionId}:`, error);
        await this.cleanupSession(session.sessionId, true);
      }
    }

    this.sessions.clear();
    this.isShuttingDown = false;
    console.log('[SessionManager] Shutdown complete');
  }

  // ===========================================================================
  // Private Methods
  // ===========================================================================

  private startProgressReporting(sessionId: string): void {
    const interval = setInterval(() => {
      const state = this.sessions.get(sessionId);
      if (!state || state.status !== 'recording') {
        this.stopProgressReporting(sessionId);
        return;
      }

      // Get current counts
      const inputTracker = getInputTracker();
      const windowTracker = getActiveWindowTracker();

      const progress: SessionProgressData = {
        sessionId,
        duration: Date.now() - state.startTime - state.pausedTime,
        inputEventCount: inputTracker.isTracking() ? inputTracker.getState().eventCount : state.inputEventCount,
        windowChangeCount: windowTracker.isTracking() ? windowTracker.getLogs().length : state.windowChangeCount
      };

      this.emit('session:progress', progress);
      this.notifyRenderer('session:progress', progress);
    }, 1000);

    this.progressIntervals.set(sessionId, interval);
  }

  private stopProgressReporting(sessionId: string): void {
    const interval = this.progressIntervals.get(sessionId);
    if (interval) {
      clearInterval(interval);
      this.progressIntervals.delete(sessionId);
    }
  }

  private async cleanupSession(sessionId: string, force = false): Promise<void> {
    const state = this.sessions.get(sessionId);
    if (!state) return;

    console.log(`[SessionManager] Cleaning up session ${sessionId}`);

    // Stop progress reporting
    this.stopProgressReporting(sessionId);

    // Stop input tracking
    const inputTracker = getInputTracker();
    if (inputTracker.isTracking()) {
      inputTracker.stop();
    }

    // Stop window tracking
    const windowTracker = getActiveWindowTracker();
    if (windowTracker.isTracking()) {
      windowTracker.stop();
    }

    // Stop capture
    if (state.captureSessionId) {
      try {
        const capturer = getDesktopCapturer();
        await capturer.stopCapture(state.captureSessionId);
      } catch (error) {
        if (!force) throw error;
        console.error(`[SessionManager] Error stopping capture during cleanup:`, error);
      }
    }

    if (force) {
      this.sessions.delete(sessionId);
    }
  }

  private notifyRenderer(event: string, data: unknown): void {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send(`sessionManager:${event}`, data);
    }
  }

  private setupIpcHandlers(): void {
    // Get available sources
    ipcMain.handle('sessionManager:getSources', async () => {
      return this.getSources();
    });

    // Start session
    ipcMain.handle(
      'sessionManager:start',
      async (_, sourceId: string, config?: Partial<SessionRecordingConfig>) => {
        return this.startSession(sourceId, config);
      }
    );

    // Stop session
    ipcMain.handle('sessionManager:stop', async (_, sessionId: string) => {
      return this.stopSession(sessionId);
    });

    // Pause session
    ipcMain.handle('sessionManager:pause', async (_, sessionId: string) => {
      this.pauseSession(sessionId);
      return { success: true };
    });

    // Resume session
    ipcMain.handle('sessionManager:resume', async (_, sessionId: string) => {
      this.resumeSession(sessionId);
      return { success: true };
    });

    // Get session state
    ipcMain.handle('sessionManager:getSession', async (_, sessionId: string) => {
      return this.getSession(sessionId);
    });

    // Get active sessions
    ipcMain.handle('sessionManager:getActive', async () => {
      return this.getActiveSessions();
    });

    // Check if recording
    ipcMain.handle('sessionManager:isRecording', async () => {
      return this.isRecording();
    });

    // Get auto-redaction config
    ipcMain.handle('sessionManager:getAutoRedactionConfig', async () => {
      return getAutoRedactionConfig();
    });

    // Set auto-redaction config
    ipcMain.handle('sessionManager:setAutoRedactionConfig', async (_, config: Partial<AutoRedactionConfig>) => {
      setAutoRedactionConfig(config);
      return { success: true };
    });

    // Check if auto-redaction is enabled
    ipcMain.handle('sessionManager:isAutoRedactionEnabled', async () => {
      return isAutoRedactionEnabled();
    });
  }
}

// =============================================================================
// Singleton and Setup
// =============================================================================

let sessionManager: SessionRecordingManager | null = null;

export function getSessionRecordingManager(): SessionRecordingManager {
  if (!sessionManager) {
    sessionManager = new SessionRecordingManager();
  }
  return sessionManager;
}

export function setupSessionRecordingManagerHandlers(mainWindow?: BrowserWindow): void {
  const manager = getSessionRecordingManager();
  if (mainWindow) {
    manager.setMainWindow(mainWindow);
  }
  console.log('[SessionRecordingManager] Handlers registered');
}

export async function shutdownSessionRecordingManager(): Promise<void> {
  if (sessionManager) {
    await sessionManager.shutdown();
    sessionManager = null;
  }
}
