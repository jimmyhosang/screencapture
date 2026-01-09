/**
 * CCaaS Repositories Tests
 *
 * Unit tests for call events, active window, and recording-call repositories
 */

import { describe, it, expect, beforeEach, vi, Mock } from 'vitest';

// Mock electron first (before any imports that might use it)
vi.mock('electron', () => ({
  ipcMain: {
    handle: vi.fn()
  }
}));

// Create mocks
const mockPrepare = vi.fn();
const mockGet = vi.fn();
const mockAll = vi.fn();
const mockRun = vi.fn();
const mockTransaction = vi.fn((fn) => fn);

vi.mock('../../database', () => ({
  getDatabase: vi.fn(() => ({
    prepare: mockPrepare,
    transaction: mockTransaction
  }))
}));

// Import after mocks
import {
  CallEventRepository,
  ActiveWindowRepository,
  RecordingCallRepository,
  getCallEventRepository,
  getActiveWindowRepository,
  getRecordingCallRepository
} from '../repositories';

describe('CallEventRepository', () => {
  let repo: CallEventRepository;

  beforeEach(() => {
    vi.clearAllMocks();
    mockPrepare.mockReturnValue({
      run: mockRun.mockReturnValue({ changes: 1, lastInsertRowid: 1 }),
      get: mockGet,
      all: mockAll.mockReturnValue([])
    });
    repo = new CallEventRepository();
  });

  describe('logEvent', () => {
    it('should insert a new call event', () => {
      const event = {
        callId: 'call-123',
        eventType: 'CALL_STARTED',
        agentId: 'agent-456',
        timestamp: Date.now(),
        direction: 'inbound' as const
      };

      const result = repo.logEvent(event);

      expect(mockPrepare).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO call_events'));
      expect(result.callId).toBe('call-123');
      expect(result.eventType).toBe('CALL_STARTED');
      expect(result.id).toMatch(/^evt-\d+-/);
    });

    it('should handle optional fields', () => {
      const event = {
        callId: 'call-789',
        eventType: 'CALL_ENDED',
        timestamp: Date.now()
      };

      const result = repo.logEvent(event);

      expect(result.callId).toBe('call-789');
      expect(result.agentId).toBeUndefined();
    });
  });

  describe('getEventsForCall', () => {
    it('should return events for a call', () => {
      mockAll.mockReturnValue([
        {
          id: 'evt-1',
          call_id: 'call-123',
          event_type: 'CALL_STARTED',
          agent_id: 'agent-1',
          timestamp: 1000,
          created_at: 1000
        },
        {
          id: 'evt-2',
          call_id: 'call-123',
          event_type: 'CALL_ENDED',
          agent_id: 'agent-1',
          timestamp: 2000,
          created_at: 2000
        }
      ]);

      const events = repo.getEventsForCall('call-123');

      expect(events).toHaveLength(2);
      expect(events[0].callId).toBe('call-123');
      expect(events[0].eventType).toBe('CALL_STARTED');
    });

    it('should return empty array for unknown call', () => {
      mockAll.mockReturnValue([]);
      const events = repo.getEventsForCall('unknown-call');
      expect(events).toHaveLength(0);
    });
  });

  describe('getRecentEvents', () => {
    it('should return recent events with default limit', () => {
      mockAll.mockReturnValue([
        { id: 'evt-1', call_id: 'c1', event_type: 'E1', timestamp: 1, created_at: 1 }
      ]);

      repo.getRecentEvents();

      expect(mockAll).toHaveBeenCalledWith(50);
    });

    it('should respect custom limit', () => {
      repo.getRecentEvents(10);
      expect(mockAll).toHaveBeenCalledWith(10);
    });
  });

  describe('getUniqueCallIds', () => {
    it('should return unique call IDs', () => {
      mockAll.mockReturnValue([
        { call_id: 'call-1' },
        { call_id: 'call-2' },
        { call_id: 'call-3' }
      ]);

      const callIds = repo.getUniqueCallIds();

      expect(callIds).toEqual(['call-1', 'call-2', 'call-3']);
    });
  });
});

describe('ActiveWindowRepository', () => {
  let repo: ActiveWindowRepository;

  beforeEach(() => {
    vi.clearAllMocks();
    mockPrepare.mockReturnValue({
      run: mockRun.mockReturnValue({ changes: 1 }),
      get: mockGet,
      all: mockAll.mockReturnValue([])
    });
    repo = new ActiveWindowRepository();
  });

  describe('logWindow', () => {
    it('should insert a window log entry', () => {
      const entry = {
        recordingId: 'rec-123',
        timestampMs: 5000,
        windowTitle: 'VS Code - project',
        processName: 'code',
        url: undefined
      };

      const result = repo.logWindow(entry);

      expect(mockPrepare).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO active_window_log'));
      expect(result.recordingId).toBe('rec-123');
      expect(result.id).toMatch(/^win-\d+-/);
    });
  });

  describe('logWindowBatch', () => {
    it('should insert multiple entries in a transaction', () => {
      const entries = [
        { recordingId: 'rec-1', timestampMs: 1000, processName: 'chrome' },
        { recordingId: 'rec-1', timestampMs: 2000, processName: 'slack' }
      ];

      const count = repo.logWindowBatch(entries);

      expect(count).toBe(2);
      expect(mockTransaction).toHaveBeenCalled();
    });
  });

  describe('getWindowsForRecording', () => {
    it('should return windows for a recording', () => {
      mockAll.mockReturnValue([
        { id: 'w1', recording_id: 'rec-1', timestamp_ms: 1000, process_name: 'chrome', window_title: 'Google' },
        { id: 'w2', recording_id: 'rec-1', timestamp_ms: 2000, process_name: 'slack', window_title: 'Chat' }
      ]);

      const windows = repo.getWindowsForRecording('rec-1');

      expect(windows).toHaveLength(2);
      expect(windows[0].processName).toBe('chrome');
      expect(windows[1].processName).toBe('slack');
    });
  });

  describe('getWindowAtTimestamp', () => {
    it('should return window at specific timestamp', () => {
      mockGet.mockReturnValue({
        id: 'w1',
        recording_id: 'rec-1',
        timestamp_ms: 1000,
        process_name: 'chrome',
        window_title: 'Google'
      });

      const window = repo.getWindowAtTimestamp('rec-1', 1500);

      expect(window).not.toBeNull();
      expect(window?.processName).toBe('chrome');
    });

    it('should return null if no window found', () => {
      mockGet.mockReturnValue(undefined);
      const window = repo.getWindowAtTimestamp('rec-1', 500);
      expect(window).toBeNull();
    });
  });

  describe('getActivitySummary', () => {
    it('should calculate time spent per application', () => {
      mockAll.mockReturnValue([
        { id: 'w1', recording_id: 'rec-1', timestamp_ms: 0, process_name: 'chrome' },
        { id: 'w2', recording_id: 'rec-1', timestamp_ms: 5000, process_name: 'slack' },
        { id: 'w3', recording_id: 'rec-1', timestamp_ms: 8000, process_name: 'chrome' },
        { id: 'w4', recording_id: 'rec-1', timestamp_ms: 10000, process_name: null }
      ]);

      const summary = repo.getActivitySummary('rec-1');

      // Only processes windows 0-2 (last entry is end boundary)
      // chrome: 5000ms (0-5000) + 2000ms (8000-10000) = 7000ms
      // slack: 3000ms (5000-8000)
      expect(summary).toHaveLength(2);
      const chromeEntry = summary.find(s => s.processName === 'chrome');
      expect(chromeEntry?.totalTimeMs).toBe(7000);
      const slackEntry = summary.find(s => s.processName === 'slack');
      expect(slackEntry?.totalTimeMs).toBe(3000);
    });

    it('should return empty array for recording with < 2 entries', () => {
      mockAll.mockReturnValue([{ id: 'w1', recording_id: 'rec-1', timestamp_ms: 0, process_name: 'chrome' }]);
      const summary = repo.getActivitySummary('rec-1');
      expect(summary).toHaveLength(0);
    });
  });
});

describe('RecordingCallRepository', () => {
  let repo: RecordingCallRepository;

  beforeEach(() => {
    vi.clearAllMocks();
    mockPrepare.mockReturnValue({
      run: mockRun.mockReturnValue({ changes: 1 }),
      get: mockGet,
      all: mockAll.mockReturnValue([])
    });
    repo = new RecordingCallRepository();
  });

  describe('updateCallMetadata', () => {
    it('should update recording with call metadata', () => {
      const result = repo.updateCallMetadata('rec-123', {
        callId: 'call-456',
        agentId: 'agent-789',
        callDirection: 'inbound'
      });

      expect(result).toBe(true);
      expect(mockPrepare).toHaveBeenCalledWith(expect.stringContaining('UPDATE recordings'));
    });

    it('should return false when no fields to update', () => {
      const result = repo.updateCallMetadata('rec-123', {});
      expect(result).toBe(false);
    });
  });

  describe('getByCallId', () => {
    it('should return recordings for a call', () => {
      mockAll.mockReturnValue([
        {
          id: 'rec-1',
          filename: 'video1.webm',
          call_id: 'call-123',
          agent_id: 'agent-1',
          startTime: 1000,
          duration: 300
        }
      ]);

      const recordings = repo.getByCallId('call-123');

      expect(recordings).toHaveLength(1);
      expect(recordings[0].callId).toBe('call-123');
    });
  });

  describe('getCallMetadata', () => {
    it('should return call metadata for a recording', () => {
      mockGet.mockReturnValue({
        id: 'rec-123',
        call_id: 'call-456',
        agent_id: 'agent-789',
        queue_name: 'support',
        call_direction: 'inbound'
      });

      const metadata = repo.getCallMetadata('rec-123');

      expect(metadata).not.toBeNull();
      expect(metadata?.callId).toBe('call-456');
      expect(metadata?.agentId).toBe('agent-789');
    });

    it('should return null when no call associated', () => {
      mockGet.mockReturnValue({ id: 'rec-123', call_id: null });
      const metadata = repo.getCallMetadata('rec-123');
      expect(metadata).toBeNull();
    });

    it('should return null when recording not found', () => {
      mockGet.mockReturnValue(undefined);
      const metadata = repo.getCallMetadata('unknown');
      expect(metadata).toBeNull();
    });
  });

  describe('getRecordingsWithCalls', () => {
    it('should return recordings that have call associations', () => {
      mockAll.mockReturnValue([
        { id: 'rec-1', filename: 'v1.webm', call_id: 'c1', startTime: 1, duration: 100 },
        { id: 'rec-2', filename: 'v2.webm', call_id: 'c2', startTime: 2, duration: 200 }
      ]);

      const recordings = repo.getRecordingsWithCalls();

      expect(recordings).toHaveLength(2);
      expect(recordings[0].callId).toBe('c1');
    });
  });
});

describe('Singleton Instances', () => {
  it('should return same CallEventRepository instance', () => {
    const repo1 = getCallEventRepository();
    const repo2 = getCallEventRepository();
    expect(repo1).toBe(repo2);
  });

  it('should return same ActiveWindowRepository instance', () => {
    const repo1 = getActiveWindowRepository();
    const repo2 = getActiveWindowRepository();
    expect(repo1).toBe(repo2);
  });

  it('should return same RecordingCallRepository instance', () => {
    const repo1 = getRecordingCallRepository();
    const repo2 = getRecordingCallRepository();
    expect(repo1).toBe(repo2);
  });
});
