/**
 * Desktop Capture Module
 *
 * Entry point for the desktop screen capture system.
 * Sets up IPC handlers and exports public API.
 */

import { ipcMain, BrowserWindow } from 'electron';
import { promises as fs } from 'fs';
import { join, dirname } from 'path';
import { getDesktopCapturer, resetDesktopCapturer } from './desktop-capturer';
import { getInputTracker, resetInputTracker } from './input-tracker';
import { getInputPrivacyFilter, resetInputPrivacyFilter } from './input-privacy';
import type {
  CaptureSource,
  CaptureOptions,
  CaptureState,
  CaptureResult,
  CaptureChunk,
  CAPTURE_IPC_CHANNELS
} from './types';
import type { InputEvent, InputTrackerConfig, ActiveWindowInfo } from './input-types';

// Re-export types and classes
export * from './types';
export * from './input-types';
export { getDesktopCapturer, resetDesktopCapturer, DesktopCapturer } from './desktop-capturer';
export { getInputTracker, resetInputTracker, InputTracker } from './input-tracker';
export { getInputPrivacyFilter, resetInputPrivacyFilter, InputPrivacyFilter } from './input-privacy';

// =============================================================================
// IPC Handlers Setup
// =============================================================================

let handlersRegistered = false;

/**
 * Set up IPC handlers for desktop capture
 */
export function setupCaptureHandlers(mainWindow?: BrowserWindow): void {
  if (handlersRegistered) {
    console.log('[Capture] Handlers already registered');
    return;
  }

  const capturer = getDesktopCapturer();

  // Set main window for renderer communication
  if (mainWindow) {
    capturer.setMainWindow(mainWindow);
  }

  // Get available capture sources
  ipcMain.handle('capture:getSources', async () => {
    try {
      return await capturer.getSources();
    } catch (error) {
      console.error('[Capture] Failed to get sources:', error);
      throw error;
    }
  });

  // Start capture session
  ipcMain.handle('capture:start', async (_, options: CaptureOptions) => {
    try {
      const sessionId = await capturer.startCapture(options);
      return { sessionId };
    } catch (error) {
      console.error('[Capture] Failed to start capture:', error);
      throw error;
    }
  });

  // Stop capture session
  ipcMain.handle('capture:stop', async (_, sessionId: string) => {
    try {
      const result = await capturer.stopCapture(sessionId);
      return result;
    } catch (error) {
      console.error('[Capture] Failed to stop capture:', error);
      throw error;
    }
  });

  // Pause capture session
  ipcMain.handle('capture:pause', async (_, sessionId: string) => {
    try {
      capturer.pauseCapture(sessionId);
    } catch (error) {
      console.error('[Capture] Failed to pause capture:', error);
      throw error;
    }
  });

  // Resume capture session
  ipcMain.handle('capture:resume', async (_, sessionId: string) => {
    try {
      capturer.resumeCapture(sessionId);
    } catch (error) {
      console.error('[Capture] Failed to resume capture:', error);
      throw error;
    }
  });

  // Get session state
  ipcMain.handle('capture:getState', async (_, sessionId: string) => {
    const state = capturer.getSession(sessionId);
    if (!state) {
      return null;
    }
    return {
      sessionId: state.sessionId,
      sourceId: state.sourceId,
      sourceName: state.sourceName,
      status: state.status,
      startTime: state.startTime,
      duration: Date.now() - state.startTime - state.pausedTime
    };
  });

  // Get all active sessions
  ipcMain.handle('capture:getActive', async () => {
    const sessions = capturer.getActiveSessions();
    return Array.from(sessions.values()).map((state) => ({
      sessionId: state.sessionId,
      sourceId: state.sourceId,
      sourceName: state.sourceName,
      status: state.status,
      startTime: state.startTime
    }));
  });

  // Handle chunk data from renderer
  ipcMain.on('capture:chunk', async (_, chunk: CaptureChunk) => {
    try {
      await capturer.handleChunk(chunk);
    } catch (error) {
      console.error('[Capture] Failed to handle chunk:', error);
    }
  });

  // Handle capture started notification from renderer
  ipcMain.on('capture:started', (_, data: { sessionId: string }) => {
    capturer.handleCaptureStarted(data.sessionId);
  });

  // Handle capture error from renderer
  ipcMain.on('capture:error', (_, data: { sessionId: string; error: string }) => {
    capturer.handleCaptureError(data.sessionId, data.error);
  });

  // ===========================================================================
  // Input Tracking IPC Handlers
  // ===========================================================================

  const inputTracker = getInputTracker();
  const privacyFilter = getInputPrivacyFilter();

  // Start input tracking for a session
  ipcMain.handle('input:start', async (_, sessionId: string, config?: Partial<InputTrackerConfig>) => {
    try {
      if (config) {
        inputTracker.setConfig(config);
      }
      inputTracker.start(sessionId);
      return { success: true, sessionId };
    } catch (error) {
      console.error('[Input] Failed to start tracking:', error);
      throw error;
    }
  });

  // Stop input tracking and return events
  ipcMain.handle('input:stop', async () => {
    try {
      const events = inputTracker.stop();
      // Apply privacy filter to events
      const filteredEvents = privacyFilter.filterEvents(events);
      return filteredEvents;
    } catch (error) {
      console.error('[Input] Failed to stop tracking:', error);
      throw error;
    }
  });

  // Pause input tracking
  ipcMain.handle('input:pause', async () => {
    try {
      inputTracker.pause();
      return { success: true };
    } catch (error) {
      console.error('[Input] Failed to pause tracking:', error);
      throw error;
    }
  });

  // Resume input tracking
  ipcMain.handle('input:resume', async () => {
    try {
      inputTracker.resume();
      return { success: true };
    } catch (error) {
      console.error('[Input] Failed to resume tracking:', error);
      throw error;
    }
  });

  // Get current events without stopping
  ipcMain.handle('input:getEvents', async () => {
    try {
      const events = inputTracker.getEvents();
      const filteredEvents = privacyFilter.filterEvents(events);
      return filteredEvents;
    } catch (error) {
      console.error('[Input] Failed to get events:', error);
      throw error;
    }
  });

  // Get current configuration
  ipcMain.handle('input:getConfig', async () => {
    return inputTracker.getConfig();
  });

  // Update configuration
  ipcMain.handle('input:setConfig', async (_, config: Partial<InputTrackerConfig>) => {
    try {
      inputTracker.setConfig(config);
      return { success: true };
    } catch (error) {
      console.error('[Input] Failed to set config:', error);
      throw error;
    }
  });

  // Get tracker state
  ipcMain.handle('input:getState', async () => {
    return inputTracker.getState();
  });

  // Update active window for privacy filtering
  ipcMain.on('input:updateWindow', (_, windowInfo: ActiveWindowInfo) => {
    privacyFilter.updateActiveWindow(windowInfo);
  });

  // Save input events to JSON sidecar file
  ipcMain.handle('input:saveEvents', async (_, videoPath: string, events: InputEvent[]) => {
    try {
      const jsonPath = videoPath.replace(/\.[^/.]+$/, '.input.json');
      const data = {
        version: '1.0',
        videoFile: videoPath,
        createdAt: Date.now(),
        eventCount: events.length,
        events
      };
      await fs.mkdir(dirname(jsonPath), { recursive: true });
      await fs.writeFile(jsonPath, JSON.stringify(data, null, 2));
      console.log(`[Input] Saved ${events.length} events to ${jsonPath}`);
      return { success: true, path: jsonPath };
    } catch (error) {
      console.error('[Input] Failed to save events:', error);
      throw error;
    }
  });

  // Load input events from JSON sidecar file
  ipcMain.handle('input:loadEvents', async (_, videoPath: string) => {
    try {
      const jsonPath = videoPath.replace(/\.[^/.]+$/, '.input.json');
      const content = await fs.readFile(jsonPath, 'utf-8');
      const data = JSON.parse(content);
      return data.events as InputEvent[];
    } catch (error) {
      // File may not exist, which is fine
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return [];
      }
      console.error('[Input] Failed to load events:', error);
      throw error;
    }
  });

  handlersRegistered = true;
  console.log('[Capture] IPC handlers registered');
}

/**
 * Update main window reference
 */
export function updateCaptureMainWindow(mainWindow: BrowserWindow): void {
  const capturer = getDesktopCapturer();
  capturer.setMainWindow(mainWindow);
}

/**
 * Clean up capture resources
 */
export async function cleanupCapture(): Promise<void> {
  const capturer = getDesktopCapturer();
  const sessions = capturer.getActiveSessions();

  // Stop all active sessions
  for (const [sessionId] of sessions) {
    try {
      await capturer.stopCapture(sessionId);
    } catch (error) {
      console.error(`[Capture] Failed to stop session ${sessionId}:`, error);
    }
  }

  // Clean up input tracking
  resetInputTracker();
  resetInputPrivacyFilter();

  resetDesktopCapturer();
  console.log('[Capture] Cleanup complete');
}

// =============================================================================
// Public API Functions
// =============================================================================

/**
 * Get available capture sources
 */
export async function getCaptureSources(): Promise<CaptureSource[]> {
  return getDesktopCapturer().getSources();
}

/**
 * Start a capture session
 */
export async function startCapture(options: CaptureOptions): Promise<string> {
  return getDesktopCapturer().startCapture(options);
}

/**
 * Stop a capture session
 */
export async function stopCapture(sessionId: string): Promise<CaptureResult> {
  return getDesktopCapturer().stopCapture(sessionId);
}

/**
 * Pause a capture session
 */
export function pauseCapture(sessionId: string): void {
  getDesktopCapturer().pauseCapture(sessionId);
}

/**
 * Resume a capture session
 */
export function resumeCapture(sessionId: string): void {
  getDesktopCapturer().resumeCapture(sessionId);
}

/**
 * Get all active sessions
 */
export function getActiveSessions(): Map<string, CaptureState> {
  return getDesktopCapturer().getActiveSessions();
}

/**
 * Get a specific session
 */
export function getCaptureSession(sessionId: string): CaptureState | undefined {
  return getDesktopCapturer().getSession(sessionId);
}

// =============================================================================
// Input Tracking Public API
// =============================================================================

/**
 * Start input tracking for a session
 */
export function startInputTracking(sessionId: string, config?: Partial<InputTrackerConfig>): void {
  const tracker = getInputTracker();
  if (config) {
    tracker.setConfig(config);
  }
  tracker.start(sessionId);
}

/**
 * Stop input tracking and return events
 */
export function stopInputTracking(): InputEvent[] {
  const tracker = getInputTracker();
  const filter = getInputPrivacyFilter();
  const events = tracker.stop();
  return filter.filterEvents(events);
}

/**
 * Pause input tracking
 */
export function pauseInputTracking(): void {
  getInputTracker().pause();
}

/**
 * Resume input tracking
 */
export function resumeInputTracking(): void {
  getInputTracker().resume();
}

/**
 * Get current input events
 */
export function getInputEvents(): InputEvent[] {
  const tracker = getInputTracker();
  const filter = getInputPrivacyFilter();
  return filter.filterEvents(tracker.getEvents());
}

/**
 * Update input tracker configuration
 */
export function setInputConfig(config: Partial<InputTrackerConfig>): void {
  getInputTracker().setConfig(config);
}

/**
 * Update active window for privacy filtering
 */
export function updateActiveWindow(windowInfo: ActiveWindowInfo): void {
  getInputPrivacyFilter().updateActiveWindow(windowInfo);
}

/**
 * Save input events to JSON sidecar file
 */
export async function saveInputEvents(videoPath: string, events: InputEvent[]): Promise<string> {
  const jsonPath = videoPath.replace(/\.[^/.]+$/, '.input.json');
  const data = {
    version: '1.0',
    videoFile: videoPath,
    createdAt: Date.now(),
    eventCount: events.length,
    events
  };
  await fs.mkdir(dirname(jsonPath), { recursive: true });
  await fs.writeFile(jsonPath, JSON.stringify(data, null, 2));
  return jsonPath;
}

/**
 * Load input events from JSON sidecar file
 */
export async function loadInputEvents(videoPath: string): Promise<InputEvent[]> {
  const jsonPath = videoPath.replace(/\.[^/.]+$/, '.input.json');
  try {
    const content = await fs.readFile(jsonPath, 'utf-8');
    const data = JSON.parse(content);
    return data.events as InputEvent[];
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return [];
    }
    throw error;
  }
}
