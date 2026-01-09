/**
 * Tracking Module
 *
 * Exports active window tracking functionality for recording sessions.
 */

import { ipcMain } from 'electron';
import {
  ActiveWindowTracker,
  getActiveWindowTracker,
  resetActiveWindowTracker,
  type WindowInfo,
  type WindowLog,
  type TrackerConfig
} from './active-window-tracker';

export {
  ActiveWindowTracker,
  getActiveWindowTracker,
  resetActiveWindowTracker,
  type WindowInfo,
  type WindowLog,
  type TrackerConfig
};

/**
 * Setup IPC handlers for window tracking
 */
export function setupTrackingHandlers(): void {
  const tracker = getActiveWindowTracker();

  // Start tracking for a recording
  ipcMain.handle('tracking:start', (_, recordingId: string) => {
    tracker.start(recordingId);
    return true;
  });

  // Stop tracking and get logs
  ipcMain.handle('tracking:stop', () => {
    return tracker.stop();
  });

  // Pause tracking
  ipcMain.handle('tracking:pause', () => {
    tracker.pause();
    return true;
  });

  // Resume tracking
  ipcMain.handle('tracking:resume', () => {
    tracker.resume();
    return true;
  });

  // Check if tracking
  ipcMain.handle('tracking:isActive', () => {
    return tracker.isTracking();
  });

  // Get current logs
  ipcMain.handle('tracking:getCurrentLogs', () => {
    return tracker.getLogs();
  });

  // Get config
  ipcMain.handle('tracking:getConfig', () => {
    return tracker.getConfig();
  });

  // Update config
  ipcMain.handle('tracking:setConfig', (_, config: Partial<TrackerConfig>) => {
    tracker.setConfig(config);
    return tracker.getConfig();
  });

  console.log('[Tracking] IPC handlers registered');
}

/**
 * Cleanup tracking module
 */
export function cleanupTracking(): void {
  resetActiveWindowTracker();
}
