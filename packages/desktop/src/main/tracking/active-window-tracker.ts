/**
 * Active Window Tracker
 *
 * Tracks which applications/windows the agent uses during a recording.
 * Polls at configurable intervals and logs window changes.
 */

import { BrowserWindow } from 'electron';
import { getActiveWindowRepository } from '../ccaas/repositories';

// Dynamic import with fallback for active-win (has native module compatibility issues with Electron)
let activeWindow: (() => Promise<any>) | null = null;
try {
  // @ts-ignore - dynamic import
  const activeWinModule = require('active-win');
  activeWindow = activeWinModule.activeWindow || activeWinModule.default;
} catch (error) {
  console.warn('[ActiveWindowTracker] active-win module not available:', (error as Error).message);
}

// =============================================================================
// Types
// =============================================================================

export interface WindowInfo {
  title: string;
  processName: string;
  processId: number;
  url?: string;
  bounds?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
}

export interface WindowLog {
  timestampMs: number;
  windowTitle?: string;
  processName?: string;
  url?: string;
}

export interface TrackerConfig {
  pollIntervalMs: number;
  extractBrowserUrl: boolean;
  includeWindowBounds: boolean;
}

const DEFAULT_CONFIG: TrackerConfig = {
  pollIntervalMs: 2000, // 2 seconds
  extractBrowserUrl: true,
  includeWindowBounds: false
};

// Browser process names to check for URL extraction
const BROWSER_PROCESSES = [
  'chrome',
  'Google Chrome',
  'firefox',
  'Firefox',
  'msedge',
  'Microsoft Edge',
  'safari',
  'Safari',
  'brave',
  'Brave Browser',
  'opera',
  'Opera',
  'vivaldi',
  'Vivaldi'
];

// =============================================================================
// ActiveWindowTracker Class
// =============================================================================

export class ActiveWindowTracker {
  private config: TrackerConfig;
  private recordingId: string | null = null;
  private startTime: number = 0;
  private pollInterval: ReturnType<typeof setInterval> | null = null;
  private windowLogs: WindowLog[] = [];
  private lastWindowInfo: WindowInfo | null = null;
  private isPaused = false;

  constructor(config: Partial<TrackerConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Start tracking for a recording
   */
  start(recordingId: string): void {
    if (this.pollInterval) {
      this.stop(); // Stop existing tracking
    }

    this.recordingId = recordingId;
    this.startTime = Date.now();
    this.windowLogs = [];
    this.lastWindowInfo = null;
    this.isPaused = false;

    console.log(`[ActiveWindowTracker] Starting for recording: ${recordingId}`);

    // Capture initial window
    this.captureWindow();

    // Start polling
    this.pollInterval = setInterval(() => {
      if (!this.isPaused) {
        this.captureWindow();
      }
    }, this.config.pollIntervalMs);
  }

  /**
   * Stop tracking and return collected logs
   */
  stop(): WindowLog[] {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }

    const logs = [...this.windowLogs];
    const recordingId = this.recordingId;

    console.log(
      `[ActiveWindowTracker] Stopped. Captured ${logs.length} window changes for recording: ${recordingId}`
    );

    // Save to database if we have logs and a recording ID
    if (recordingId && logs.length > 0) {
      this.saveToDatabase(recordingId, logs);
    }

    // Reset state
    this.recordingId = null;
    this.startTime = 0;
    this.windowLogs = [];
    this.lastWindowInfo = null;

    return logs;
  }

  /**
   * Pause tracking
   */
  pause(): void {
    this.isPaused = true;
    console.log('[ActiveWindowTracker] Paused');
  }

  /**
   * Resume tracking
   */
  resume(): void {
    this.isPaused = false;
    console.log('[ActiveWindowTracker] Resumed');
  }

  /**
   * Check if currently tracking
   */
  isTracking(): boolean {
    return this.pollInterval !== null;
  }

  /**
   * Get current recording ID
   */
  getRecordingId(): string | null {
    return this.recordingId;
  }

  /**
   * Get collected logs so far
   */
  getLogs(): WindowLog[] {
    return [...this.windowLogs];
  }

  /**
   * Update configuration
   */
  setConfig(config: Partial<TrackerConfig>): void {
    this.config = { ...this.config, ...config };

    // If currently tracking, restart with new interval
    if (this.pollInterval && this.recordingId) {
      const recordingId = this.recordingId;
      clearInterval(this.pollInterval);
      this.pollInterval = setInterval(() => {
        if (!this.isPaused) {
          this.captureWindow();
        }
      }, this.config.pollIntervalMs);
    }
  }

  /**
   * Get current configuration
   */
  getConfig(): TrackerConfig {
    return { ...this.config };
  }

  /**
   * Capture current active window
   */
  private async captureWindow(): Promise<void> {
    // Skip if active-win module is not available
    if (!activeWindow) {
      return;
    }

    try {
      const result = await activeWindow();

      if (!result) {
        return;
      }

      const windowInfo: WindowInfo = {
        title: result.title || '',
        processName: result.owner?.name || 'Unknown',
        processId: result.owner?.processId || 0,
        bounds: result.bounds
          ? {
            x: result.bounds.x,
            y: result.bounds.y,
            width: result.bounds.width,
            height: result.bounds.height
          }
          : undefined
      };

      // Try to extract URL if it's a browser
      if (this.config.extractBrowserUrl && this.isBrowser(windowInfo.processName)) {
        windowInfo.url = this.extractUrlFromTitle(windowInfo.title);
      }

      // Only log if window changed
      if (this.hasWindowChanged(windowInfo)) {
        const timestampMs = Date.now() - this.startTime;
        const log: WindowLog = {
          timestampMs,
          windowTitle: windowInfo.title,
          processName: windowInfo.processName,
          url: windowInfo.url
        };

        this.windowLogs.push(log);
        this.lastWindowInfo = windowInfo;

        // Notify renderer of window change
        this.notifyWindowChange(log);
      }
    } catch (error) {
      // Silently handle errors (permission issues, etc.)
      console.debug('[ActiveWindowTracker] Error capturing window:', error);
    }
  }

  /**
   * Check if window has changed since last capture
   */
  private hasWindowChanged(current: WindowInfo): boolean {
    if (!this.lastWindowInfo) return true;

    return (
      current.title !== this.lastWindowInfo.title ||
      current.processName !== this.lastWindowInfo.processName ||
      current.processId !== this.lastWindowInfo.processId
    );
  }

  /**
   * Check if process is a browser
   */
  private isBrowser(processName: string): boolean {
    const lowerName = processName.toLowerCase();
    return BROWSER_PROCESSES.some(
      (browser) => lowerName.includes(browser.toLowerCase())
    );
  }

  /**
   * Extract URL from browser window title
   * Many browsers include the URL or domain in the title
   */
  private extractUrlFromTitle(title: string): string | undefined {
    // Common patterns:
    // "Page Title - Google Chrome"
    // "Page Title - Mozilla Firefox"
    // Sometimes includes URL directly

    // Try to find URL pattern in title
    const urlMatch = title.match(/https?:\/\/[^\s]+/);
    if (urlMatch) {
      return urlMatch[0];
    }

    // Try to extract domain from title patterns like "domain.com - Browser"
    const domainMatch = title.match(/([a-zA-Z0-9-]+\.[a-zA-Z]{2,})/);
    if (domainMatch) {
      return `https://${domainMatch[1]}`;
    }

    return undefined;
  }

  /**
   * Notify renderer of window change
   */
  private notifyWindowChange(log: WindowLog): void {
    const mainWindow = BrowserWindow.getAllWindows().find((w) => !w.isDestroyed());
    if (mainWindow) {
      mainWindow.webContents.send('tracking:windowChange', {
        recordingId: this.recordingId,
        ...log
      });
    }
  }

  /**
   * Save logs to database
   */
  private saveToDatabase(recordingId: string, logs: WindowLog[]): void {
    try {
      const repo = getActiveWindowRepository();
      const entries = logs.map((log) => ({
        recordingId,
        timestampMs: log.timestampMs,
        windowTitle: log.windowTitle,
        processName: log.processName,
        url: log.url
      }));

      repo.logWindowBatch(entries);
      console.log(`[ActiveWindowTracker] Saved ${entries.length} entries to database`);
    } catch (error) {
      console.error('[ActiveWindowTracker] Failed to save to database:', error);
    }
  }

  /**
   * Export logs as JSON for sidecar file
   */
  exportAsJson(): string {
    return JSON.stringify(
      {
        recordingId: this.recordingId,
        startTime: this.startTime,
        logs: this.windowLogs,
        config: this.config
      },
      null,
      2
    );
  }
}

// =============================================================================
// Singleton Instance
// =============================================================================

let trackerInstance: ActiveWindowTracker | null = null;

export function getActiveWindowTracker(config?: Partial<TrackerConfig>): ActiveWindowTracker {
  if (!trackerInstance) {
    trackerInstance = new ActiveWindowTracker(config);
  }
  return trackerInstance;
}

export function resetActiveWindowTracker(): void {
  if (trackerInstance) {
    if (trackerInstance.isTracking()) {
      trackerInstance.stop();
    }
    trackerInstance = null;
  }
}
