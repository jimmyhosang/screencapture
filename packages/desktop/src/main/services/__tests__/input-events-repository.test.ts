/**
 * Input Events Repository Tests
 *
 * Unit tests for the input events database repository
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// Create mocks
const mockPrepare = vi.fn();
const mockRun = vi.fn();
const mockGet = vi.fn();
const mockAll = vi.fn();
const mockExec = vi.fn();
const mockTransaction = vi.fn((fn) => fn);

vi.mock('../../database', () => ({
  getDatabase: vi.fn(() => ({
    prepare: mockPrepare,
    exec: mockExec,
    transaction: mockTransaction
  }))
}));

vi.mock('electron', () => ({
  ipcMain: {
    handle: vi.fn()
  }
}));

import {
  InputEventsRepository,
  getInputEventsRepository,
  resetInputEventsRepository
} from '../input-events-repository';
import type { InputEvent } from '../../capture';

describe('InputEventsRepository', () => {
  let repo: InputEventsRepository;

  beforeEach(() => {
    vi.clearAllMocks();
    mockPrepare.mockReturnValue({
      run: mockRun.mockReturnValue({ changes: 1, lastInsertRowid: 1 }),
      get: mockGet,
      all: mockAll.mockReturnValue([])
    });
    resetInputEventsRepository();
    repo = new InputEventsRepository();
  });

  describe('saveEvents', () => {
    it('should save events for a recording', () => {
      const events: InputEvent[] = [
        { timestamp: 1000, type: 'click', x: 100, y: 200 },
        { timestamp: 1100, type: 'keydown', keycode: 30, key: 'A' }
      ];

      mockGet.mockReturnValue({
        total: 2, clicks: 1, keystrokes: 1, scrolls: 0, mousemoves: 0,
        first_ms: 1000, last_ms: 1100
      });

      const count = repo.saveEvents('rec-123', events);

      expect(count).toBe(2);
      expect(mockPrepare).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO input_events'));
    });

    it('should return 0 for empty events array', () => {
      const count = repo.saveEvents('rec-123', []);
      expect(count).toBe(0);
    });

    it('should update event summary after saving', () => {
      const events: InputEvent[] = [
        { timestamp: 1000, type: 'click', x: 100, y: 200 }
      ];

      mockGet.mockReturnValue({
        total: 1, clicks: 1, keystrokes: 0, scrolls: 0, mousemoves: 0,
        first_ms: 1000, last_ms: 1000
      });

      repo.saveEvents('rec-123', events);

      // Should call prepare for summary insert
      expect(mockPrepare).toHaveBeenCalledWith(expect.stringContaining('input_event_summary'));
    });

    it('should update recordings table with event count', () => {
      const events: InputEvent[] = [
        { timestamp: 1000, type: 'click', x: 100, y: 200 }
      ];

      mockGet.mockReturnValue({
        total: 1, clicks: 1, keystrokes: 0, scrolls: 0, mousemoves: 0,
        first_ms: 1000, last_ms: 1000
      });

      repo.saveEvents('rec-123', events);

      expect(mockPrepare).toHaveBeenCalledWith(expect.stringContaining('UPDATE recordings'));
    });
  });

  describe('getEventsForRecording', () => {
    it('should return events for a recording', () => {
      mockAll.mockReturnValue([
        {
          id: 1,
          recording_id: 'rec-123',
          timestamp_ms: 1000,
          event_type: 'click',
          x: 100,
          y: 200,
          button: 1,
          keycode: null,
          key_name: null,
          scroll_delta_x: null,
          scroll_delta_y: null,
          duration_ms: 50,
          modifiers: null
        }
      ]);

      const events = repo.getEventsForRecording('rec-123');

      expect(events).toHaveLength(1);
      expect(events[0].eventType).toBe('click');
      expect(events[0].x).toBe(100);
      expect(events[0].y).toBe(200);
    });

    it('should apply limit and offset', () => {
      mockAll.mockReturnValue([]);

      repo.getEventsForRecording('rec-123', { limit: 50, offset: 100 });

      expect(mockAll).toHaveBeenCalledWith('rec-123', 50, 100);
    });

    it('should filter by event types', () => {
      mockAll.mockReturnValue([]);

      repo.getEventsForRecording('rec-123', { types: ['click', 'keydown'] });

      expect(mockPrepare).toHaveBeenCalledWith(expect.stringContaining('event_type IN'));
    });

    it('should parse modifiers JSON', () => {
      mockAll.mockReturnValue([
        {
          id: 1,
          recording_id: 'rec-123',
          timestamp_ms: 1000,
          event_type: 'keydown',
          x: null, y: null, button: null,
          keycode: 30,
          key_name: 'A',
          scroll_delta_x: null,
          scroll_delta_y: null,
          duration_ms: null,
          modifiers: '{"ctrl":true,"alt":false,"shift":false,"meta":false}'
        }
      ]);

      const events = repo.getEventsForRecording('rec-123');

      expect(events[0].modifiers).toEqual({
        ctrl: true,
        alt: false,
        shift: false,
        meta: false
      });
    });
  });

  describe('getEventsInTimeRange', () => {
    it('should return events within time range', () => {
      mockAll.mockReturnValue([
        { id: 1, recording_id: 'rec-123', timestamp_ms: 5000, event_type: 'click', x: 100, y: 200 }
      ]);

      const events = repo.getEventsInTimeRange('rec-123', 0, 10000);

      expect(events).toHaveLength(1);
      expect(mockAll).toHaveBeenCalledWith('rec-123', 0, 10000);
    });
  });

  describe('getEventCount', () => {
    it('should return event count', () => {
      mockGet.mockReturnValue({ count: 150 });

      const count = repo.getEventCount('rec-123');

      expect(count).toBe(150);
    });
  });

  describe('getSummary', () => {
    it('should return event summary', () => {
      mockGet.mockReturnValue({
        recording_id: 'rec-123',
        total_events: 100,
        click_count: 20,
        keystroke_count: 50,
        scroll_count: 10,
        mouse_move_count: 20,
        first_event_ms: 0,
        last_event_ms: 60000,
        created_at: 1234567890
      });

      const summary = repo.getSummary('rec-123');

      expect(summary).toEqual({
        recordingId: 'rec-123',
        totalEvents: 100,
        clickCount: 20,
        keystrokeCount: 50,
        scrollCount: 10,
        mouseMoveCount: 20,
        firstEventMs: 0,
        lastEventMs: 60000,
        createdAt: 1234567890
      });
    });

    it('should return null for unknown recording', () => {
      mockGet.mockReturnValue(undefined);

      const summary = repo.getSummary('unknown');

      expect(summary).toBeNull();
    });
  });

  describe('deleteEventsForRecording', () => {
    it('should delete events and summary', () => {
      mockRun.mockReturnValue({ changes: 100 });

      const deleted = repo.deleteEventsForRecording('rec-123');

      expect(deleted).toBe(100);
      expect(mockPrepare).toHaveBeenCalledWith(expect.stringContaining('DELETE FROM input_events'));
      expect(mockPrepare).toHaveBeenCalledWith(expect.stringContaining('DELETE FROM input_event_summary'));
    });
  });

  describe('getRecordingsWithInputEvents', () => {
    it('should return recordings with input tracking', () => {
      mockAll.mockReturnValue([
        { id: 'rec-1', input_event_count: 100, has_input_tracking: 1 },
        { id: 'rec-2', input_event_count: 50, has_input_tracking: 1 }
      ]);

      const recordings = repo.getRecordingsWithInputEvents();

      expect(recordings).toHaveLength(2);
      expect(recordings[0].recordingId).toBe('rec-1');
      expect(recordings[0].eventCount).toBe(100);
      expect(recordings[0].hasInputTracking).toBe(true);
    });
  });

  describe('convertFromInputEvents', () => {
    it('should convert InputEvent[] to storage format', () => {
      const events: InputEvent[] = [
        {
          timestamp: 1000,
          type: 'click',
          x: 100,
          y: 200,
          button: 1,
          modifiers: { ctrl: true, alt: false, shift: false, meta: false }
        }
      ];

      const converted = repo.convertFromInputEvents(events);

      expect(converted[0]).toEqual({
        timestampMs: 1000,
        eventType: 'click',
        x: 100,
        y: 200,
        button: 1,
        keycode: undefined,
        keyName: undefined,
        scrollDeltaX: undefined,
        scrollDeltaY: undefined,
        durationMs: undefined,
        modifiers: { ctrl: true, alt: false, shift: false, meta: false }
      });
    });
  });

  describe('convertToInputEvents', () => {
    it('should convert storage format to InputEvent[]', () => {
      const stored = [
        {
          id: 1,
          recordingId: 'rec-123',
          timestampMs: 1000,
          eventType: 'click',
          x: 100,
          y: 200,
          button: 1,
          keycode: undefined,
          keyName: undefined,
          scrollDeltaX: undefined,
          scrollDeltaY: undefined,
          durationMs: 50,
          modifiers: { ctrl: true, alt: false, shift: false, meta: false }
        }
      ];

      const converted = repo.convertToInputEvents(stored);

      expect(converted[0]).toEqual({
        timestamp: 1000,
        type: 'click',
        x: 100,
        y: 200,
        button: 1,
        keycode: undefined,
        key: undefined,
        scrollDelta: undefined,
        duration: 50,
        modifiers: { ctrl: true, alt: false, shift: false, meta: false }
      });
    });

    it('should handle scroll delta conversion', () => {
      const stored = [
        {
          id: 1,
          recordingId: 'rec-123',
          timestampMs: 1000,
          eventType: 'scroll',
          x: 100,
          y: 200,
          scrollDeltaX: 0,
          scrollDeltaY: 120
        }
      ];

      const converted = repo.convertToInputEvents(stored);

      expect(converted[0].scrollDelta).toEqual({ x: 0, y: 120 });
    });
  });
});

describe('Singleton', () => {
  beforeEach(() => {
    resetInputEventsRepository();
  });

  it('should return same instance', () => {
    const r1 = getInputEventsRepository();
    const r2 = getInputEventsRepository();
    expect(r1).toBe(r2);
  });

  it('should create new instance after reset', () => {
    const r1 = getInputEventsRepository();
    resetInputEventsRepository();
    const r2 = getInputEventsRepository();
    expect(r1).not.toBe(r2);
  });
});
