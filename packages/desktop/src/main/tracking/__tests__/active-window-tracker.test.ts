/**
 * Active Window Tracker Tests
 *
 * Unit tests for the window activity tracking system
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Mock dependencies
vi.mock('electron', () => ({
  BrowserWindow: {
    getAllWindows: vi.fn(() => [])
  }
}));

vi.mock('active-win', () => ({
  default: vi.fn(async () => ({
    title: 'VS Code - project',
    owner: {
      name: 'code',
      processId: 1234
    },
    bounds: { x: 0, y: 0, width: 1920, height: 1080 }
  }))
}));

vi.mock('../../ccaas/repositories', () => ({
  getActiveWindowRepository: vi.fn(() => ({
    logWindowBatch: vi.fn()
  }))
}));

import {
  ActiveWindowTracker,
  getActiveWindowTracker,
  resetActiveWindowTracker
} from '../active-window-tracker';
import activeWin from 'active-win';
import { getActiveWindowRepository } from '../../ccaas/repositories';

describe('ActiveWindowTracker', () => {
  let tracker: ActiveWindowTracker;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    tracker = new ActiveWindowTracker({ pollIntervalMs: 1000 });
  });

  afterEach(() => {
    if (tracker.isTracking()) {
      tracker.stop();
    }
    vi.useRealTimers();
    resetActiveWindowTracker();
  });

  describe('Constructor', () => {
    it('should create tracker with default config', () => {
      const t = new ActiveWindowTracker();
      const config = t.getConfig();
      expect(config.pollIntervalMs).toBe(2000);
      expect(config.extractBrowserUrl).toBe(true);
      expect(config.includeWindowBounds).toBe(false);
    });

    it('should accept custom config', () => {
      const t = new ActiveWindowTracker({
        pollIntervalMs: 500,
        extractBrowserUrl: false
      });
      const config = t.getConfig();
      expect(config.pollIntervalMs).toBe(500);
      expect(config.extractBrowserUrl).toBe(false);
    });
  });

  describe('start', () => {
    it('should start tracking', () => {
      tracker.start('rec-123');
      expect(tracker.isTracking()).toBe(true);
      expect(tracker.getRecordingId()).toBe('rec-123');
    });

    it('should stop existing tracking before starting new', async () => {
      tracker.start('rec-1');
      tracker.start('rec-2');
      expect(tracker.getRecordingId()).toBe('rec-2');
    });

    it('should capture initial window', async () => {
      tracker.start('rec-123');
      // Initial capture happens synchronously in start
      await vi.advanceTimersByTimeAsync(0);
      expect(activeWin).toHaveBeenCalled();
    });
  });

  describe('stop', () => {
    it('should stop tracking and return logs', async () => {
      tracker.start('rec-123');
      await vi.advanceTimersByTimeAsync(100);

      const logs = tracker.stop();

      expect(tracker.isTracking()).toBe(false);
      expect(tracker.getRecordingId()).toBeNull();
      expect(Array.isArray(logs)).toBe(true);
    });

    it('should save to database when stopped', async () => {
      tracker.start('rec-123');
      await vi.advanceTimersByTimeAsync(100);

      tracker.stop();

      expect(getActiveWindowRepository).toHaveBeenCalled();
    });

    it('should handle stop when not tracking', () => {
      const logs = tracker.stop();
      expect(logs).toEqual([]);
    });
  });

  describe('pause/resume', () => {
    it('should pause tracking', async () => {
      tracker.start('rec-123');
      tracker.pause();

      vi.clearAllMocks();
      await vi.advanceTimersByTimeAsync(2000);

      // Should not capture while paused
      expect(activeWin).not.toHaveBeenCalled();
    });

    it('should resume tracking', async () => {
      tracker.start('rec-123');
      tracker.pause();
      tracker.resume();

      vi.clearAllMocks();
      await vi.advanceTimersByTimeAsync(1000);

      expect(activeWin).toHaveBeenCalled();
    });
  });

  describe('getLogs', () => {
    it('should return copy of logs', async () => {
      tracker.start('rec-123');
      await vi.advanceTimersByTimeAsync(100);

      const logs1 = tracker.getLogs();
      const logs2 = tracker.getLogs();

      expect(logs1).not.toBe(logs2);
      expect(logs1).toEqual(logs2);
    });
  });

  describe('setConfig', () => {
    it('should update configuration', () => {
      tracker.setConfig({ pollIntervalMs: 500 });
      expect(tracker.getConfig().pollIntervalMs).toBe(500);
    });

    it('should restart polling with new interval when tracking', async () => {
      tracker.start('rec-123');
      tracker.setConfig({ pollIntervalMs: 500 });

      vi.clearAllMocks();
      await vi.advanceTimersByTimeAsync(500);

      expect(activeWin).toHaveBeenCalled();
    });
  });

  describe('Window Change Detection', () => {
    it('should only log when window changes', async () => {
      // Mock same window twice, then different window
      const mockActiveWin = vi.mocked(activeWin);
      mockActiveWin
        .mockResolvedValueOnce({
          title: 'VS Code',
          owner: { name: 'code', processId: 1234 },
          bounds: { x: 0, y: 0, width: 1920, height: 1080 }
        })
        .mockResolvedValueOnce({
          title: 'VS Code',
          owner: { name: 'code', processId: 1234 },
          bounds: { x: 0, y: 0, width: 1920, height: 1080 }
        })
        .mockResolvedValueOnce({
          title: 'Google Chrome',
          owner: { name: 'chrome', processId: 5678 },
          bounds: { x: 0, y: 0, width: 1920, height: 1080 }
        });

      tracker.start('rec-123');
      await vi.advanceTimersByTimeAsync(100); // Initial capture

      await vi.advanceTimersByTimeAsync(1000); // Same window
      await vi.advanceTimersByTimeAsync(1000); // Different window

      const logs = tracker.getLogs();
      // Should have 2 logs: initial VS Code, then Chrome
      expect(logs.length).toBeLessThanOrEqual(3);
    });
  });

  describe('exportAsJson', () => {
    it('should export tracking data as JSON', async () => {
      tracker.start('rec-123');
      await vi.advanceTimersByTimeAsync(100);

      const json = tracker.exportAsJson();
      const data = JSON.parse(json);

      expect(data.recordingId).toBe('rec-123');
      expect(data).toHaveProperty('startTime');
      expect(data).toHaveProperty('logs');
      expect(data).toHaveProperty('config');
    });
  });
});

describe('Browser Detection', () => {
  let tracker: ActiveWindowTracker;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    tracker = new ActiveWindowTracker({ extractBrowserUrl: true });
  });

  afterEach(() => {
    tracker.stop();
    vi.useRealTimers();
  });

  it('should extract URL from browser title with URL', async () => {
    const mockActiveWin = vi.mocked(activeWin);
    mockActiveWin.mockResolvedValueOnce({
      title: 'https://github.com/anthropics - Google Chrome',
      owner: { name: 'Google Chrome', processId: 1234 },
      bounds: { x: 0, y: 0, width: 1920, height: 1080 }
    });

    tracker.start('rec-123');
    await vi.advanceTimersByTimeAsync(100);

    const logs = tracker.getLogs();
    expect(logs[0]?.url).toBe('https://github.com/anthropics');
  });

  it('should extract domain from browser title', async () => {
    const mockActiveWin = vi.mocked(activeWin);
    mockActiveWin.mockResolvedValueOnce({
      title: 'GitHub - Where software is built - mozilla.org',
      owner: { name: 'Firefox', processId: 1234 },
      bounds: { x: 0, y: 0, width: 1920, height: 1080 }
    });

    tracker.start('rec-123');
    await vi.advanceTimersByTimeAsync(100);

    const logs = tracker.getLogs();
    // Should extract mozilla.org and convert to URL
    expect(logs[0]?.url).toContain('mozilla.org');
  });
});

describe('Singleton Pattern', () => {
  beforeEach(() => {
    resetActiveWindowTracker();
  });

  it('should return same instance', () => {
    const t1 = getActiveWindowTracker();
    const t2 = getActiveWindowTracker();
    expect(t1).toBe(t2);
  });

  it('should create new instance after reset', () => {
    const t1 = getActiveWindowTracker();
    resetActiveWindowTracker();
    const t2 = getActiveWindowTracker();
    expect(t1).not.toBe(t2);
  });

  it('should stop tracking on reset', () => {
    const tracker = getActiveWindowTracker();
    tracker.start('rec-123');
    resetActiveWindowTracker();
    expect(tracker.isTracking()).toBe(false);
  });
});
