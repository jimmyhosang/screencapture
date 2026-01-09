/**
 * Session Recording Manager Tests
 *
 * Unit tests for the unified session recording orchestration service
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Mock electron
vi.mock('electron', () => ({
  ipcMain: {
    handle: vi.fn()
  },
  BrowserWindow: vi.fn()
}));

// Mock capture module
const mockStartCapture = vi.fn();
const mockStopCapture = vi.fn();
const mockPauseCapture = vi.fn();
const mockResumeCapture = vi.fn();
const mockGetSession = vi.fn();
const mockGetSources = vi.fn();

vi.mock('../../capture', () => ({
  getDesktopCapturer: vi.fn(() => ({
    startCapture: mockStartCapture,
    stopCapture: mockStopCapture,
    pauseCapture: mockPauseCapture,
    resumeCapture: mockResumeCapture,
    getSession: mockGetSession,
    getSources: mockGetSources
  })),
  getInputTracker: vi.fn(() => ({
    start: vi.fn(),
    stop: vi.fn().mockReturnValue([]),
    pause: vi.fn(),
    resume: vi.fn(),
    isTracking: vi.fn().mockReturnValue(true),
    getState: vi.fn().mockReturnValue({ eventCount: 0 }),
    setConfig: vi.fn()
  })),
  getInputPrivacyFilter: vi.fn(() => ({
    filterEvents: vi.fn((events) => events)
  })),
  resetInputTracker: vi.fn(),
  saveInputEvents: vi.fn().mockResolvedValue('/path/to/events.json')
}));

// Mock tracking module
vi.mock('../../tracking', () => ({
  getActiveWindowTracker: vi.fn(() => ({
    start: vi.fn(),
    stop: vi.fn().mockReturnValue([]),
    pause: vi.fn(),
    resume: vi.fn(),
    isTracking: vi.fn().mockReturnValue(true),
    getRecordingId: vi.fn().mockReturnValue('test-session'),
    getLogs: vi.fn().mockReturnValue([]),
    setConfig: vi.fn()
  }))
}));

// Mock database
vi.mock('../../database', () => ({
  getRecordingsPath: vi.fn().mockReturnValue('/tmp/recordings')
}));

// Mock fs
vi.mock('fs', () => ({
  promises: {
    writeFile: vi.fn().mockResolvedValue(undefined),
    mkdir: vi.fn().mockResolvedValue(undefined)
  }
}));

import {
  SessionRecordingManager,
  getSessionRecordingManager,
  shutdownSessionRecordingManager
} from '../session-recording-manager';

describe('SessionRecordingManager', () => {
  let manager: SessionRecordingManager;

  beforeEach(() => {
    vi.clearAllMocks();

    // Reset default mock implementations
    mockStartCapture.mockResolvedValue('capture-session-123');
    mockStopCapture.mockResolvedValue({
      sessionId: 'capture-session-123',
      filePath: '/path/to/video.webm',
      duration: 60000,
      fileSize: 1024000,
      resolution: { width: 1920, height: 1080 },
      frameRate: 30,
      chunksMerged: 6
    });
    mockGetSession.mockReturnValue({
      sessionId: 'capture-session-123',
      sourceName: 'Test Screen',
      status: 'recording'
    });
    mockGetSources.mockResolvedValue([
      { id: 'screen:0', name: 'Entire Screen', thumbnail: '', isScreen: true, isWindow: false },
      { id: 'window:1', name: 'VS Code', thumbnail: '', isScreen: false, isWindow: true }
    ]);

    manager = new SessionRecordingManager();
  });

  afterEach(async () => {
    await manager.shutdown();
  });

  describe('Constructor', () => {
    it('should create manager instance', () => {
      expect(manager).toBeDefined();
      expect(manager.isRecording()).toBe(false);
    });
  });

  describe('getSources', () => {
    it('should return available capture sources', async () => {
      const sources = await manager.getSources();

      expect(sources).toHaveLength(2);
      expect(sources[0].isScreen).toBe(true);
      expect(sources[1].isWindow).toBe(true);
    });
  });

  describe('startSession', () => {
    it('should start a recording session', async () => {
      const sessionId = await manager.startSession('screen:0');

      expect(sessionId).toMatch(/^session-\d+-/);
      expect(mockStartCapture).toHaveBeenCalled();
      expect(manager.isRecording()).toBe(true);
    });

    it('should use default config when not provided', async () => {
      await manager.startSession('screen:0');

      expect(mockStartCapture).toHaveBeenCalledWith(
        expect.objectContaining({
          sourceId: 'screen:0',
          quality: 'medium'
        })
      );
    });

    it('should merge custom config with defaults', async () => {
      await manager.startSession('screen:0', {
        quality: 'high',
        captureInputs: false
      });

      expect(mockStartCapture).toHaveBeenCalledWith(
        expect.objectContaining({
          sourceId: 'screen:0',
          quality: 'high'
        })
      );
    });

    it('should emit session:starting event', async () => {
      const startingHandler = vi.fn();
      manager.on('session:starting', startingHandler);

      await manager.startSession('screen:0');

      expect(startingHandler).toHaveBeenCalledWith(
        expect.objectContaining({ sessionId: expect.any(String) })
      );
    });

    it('should emit session:started event on success', async () => {
      const startedHandler = vi.fn();
      manager.on('session:started', startedHandler);

      await manager.startSession('screen:0');

      expect(startedHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          sessionId: expect.any(String),
          sourceId: 'screen:0'
        })
      );
    });

    it('should handle capture failure', async () => {
      mockStartCapture.mockRejectedValue(new Error('Capture failed'));

      const errorHandler = vi.fn();
      manager.on('session:error', errorHandler);

      await expect(manager.startSession('screen:0')).rejects.toThrow('Capture failed');
      expect(errorHandler).toHaveBeenCalled();
    });
  });

  describe('stopSession', () => {
    it('should stop a recording session and return result', async () => {
      const sessionId = await manager.startSession('screen:0');
      const result = await manager.stopSession(sessionId);

      expect(result).toMatchObject({
        sessionId,
        videoPath: expect.any(String),
        duration: expect.any(Number),
        fileSize: expect.any(Number)
      });
      expect(manager.isRecording()).toBe(false);
    });

    it('should emit session:stopping and session:stopped events', async () => {
      const stoppingHandler = vi.fn();
      const stoppedHandler = vi.fn();
      manager.on('session:stopping', stoppingHandler);
      manager.on('session:stopped', stoppedHandler);

      const sessionId = await manager.startSession('screen:0');
      await manager.stopSession(sessionId);

      expect(stoppingHandler).toHaveBeenCalledWith({ sessionId });
      expect(stoppedHandler).toHaveBeenCalledWith(
        expect.objectContaining({ sessionId, result: expect.any(Object) })
      );
    });

    it('should throw for unknown session', async () => {
      await expect(manager.stopSession('unknown')).rejects.toThrow('not found');
    });

    it('should throw for already stopped session', async () => {
      const sessionId = await manager.startSession('screen:0');
      await manager.stopSession(sessionId);

      await expect(manager.stopSession(sessionId)).rejects.toThrow('already stopped');
    });
  });

  describe('pauseSession', () => {
    it('should pause a recording session', async () => {
      const sessionId = await manager.startSession('screen:0');
      manager.pauseSession(sessionId);

      const session = manager.getSession(sessionId);
      expect(session?.status).toBe('paused');
      expect(mockPauseCapture).toHaveBeenCalled();
    });

    it('should emit session:paused event', async () => {
      const pausedHandler = vi.fn();
      manager.on('session:paused', pausedHandler);

      const sessionId = await manager.startSession('screen:0');
      manager.pauseSession(sessionId);

      expect(pausedHandler).toHaveBeenCalledWith({ sessionId });
    });

    it('should throw for non-recording session', async () => {
      const sessionId = await manager.startSession('screen:0');
      manager.pauseSession(sessionId);

      expect(() => manager.pauseSession(sessionId)).toThrow('Cannot pause');
    });
  });

  describe('resumeSession', () => {
    it('should resume a paused session', async () => {
      const sessionId = await manager.startSession('screen:0');
      manager.pauseSession(sessionId);
      manager.resumeSession(sessionId);

      const session = manager.getSession(sessionId);
      expect(session?.status).toBe('recording');
      expect(mockResumeCapture).toHaveBeenCalled();
    });

    it('should emit session:resumed event', async () => {
      const resumedHandler = vi.fn();
      manager.on('session:resumed', resumedHandler);

      const sessionId = await manager.startSession('screen:0');
      manager.pauseSession(sessionId);
      manager.resumeSession(sessionId);

      expect(resumedHandler).toHaveBeenCalledWith({ sessionId });
    });

    it('should throw for non-paused session', async () => {
      const sessionId = await manager.startSession('screen:0');

      expect(() => manager.resumeSession(sessionId)).toThrow('Cannot resume');
    });
  });

  describe('getSession', () => {
    it('should return session state', async () => {
      const sessionId = await manager.startSession('screen:0');
      const session = manager.getSession(sessionId);

      expect(session).toMatchObject({
        sessionId,
        status: 'recording',
        sourceId: 'screen:0'
      });
    });

    it('should return null for unknown session', () => {
      expect(manager.getSession('unknown')).toBeNull();
    });
  });

  describe('getActiveSessions', () => {
    it('should return active sessions', async () => {
      await manager.startSession('screen:0');

      const active = manager.getActiveSessions();
      expect(active).toHaveLength(1);
      expect(active[0].status).toBe('recording');
    });

    it('should include paused sessions', async () => {
      const sessionId = await manager.startSession('screen:0');
      manager.pauseSession(sessionId);

      const active = manager.getActiveSessions();
      expect(active).toHaveLength(1);
      expect(active[0].status).toBe('paused');
    });

    it('should exclude stopped sessions', async () => {
      const sessionId = await manager.startSession('screen:0');
      await manager.stopSession(sessionId);

      const active = manager.getActiveSessions();
      expect(active).toHaveLength(0);
    });
  });

  describe('isRecording', () => {
    it('should return false when no active sessions', () => {
      expect(manager.isRecording()).toBe(false);
    });

    it('should return true when recording', async () => {
      await manager.startSession('screen:0');
      expect(manager.isRecording()).toBe(true);
    });

    it('should return true when paused', async () => {
      const sessionId = await manager.startSession('screen:0');
      manager.pauseSession(sessionId);
      expect(manager.isRecording()).toBe(true);
    });
  });

  describe('shutdown', () => {
    it('should stop all active sessions', async () => {
      await manager.startSession('screen:0');

      await manager.shutdown();

      expect(manager.isRecording()).toBe(false);
      expect(mockStopCapture).toHaveBeenCalled();
    });

    it('should handle errors during shutdown gracefully', async () => {
      await manager.startSession('screen:0');
      mockStopCapture.mockRejectedValue(new Error('Stop failed'));

      // Should not throw
      await manager.shutdown();
    });
  });
});

describe('Singleton', () => {
  beforeEach(async () => {
    await shutdownSessionRecordingManager();
  });

  it('should return same instance', () => {
    const m1 = getSessionRecordingManager();
    const m2 = getSessionRecordingManager();
    expect(m1).toBe(m2);
  });
});
