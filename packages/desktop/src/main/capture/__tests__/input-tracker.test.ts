/**
 * Input Tracker Tests
 *
 * Unit tests for the global input tracking system using uiohook-napi
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Mock uiohook-napi - must use inline functions due to hoisting
vi.mock('uiohook-napi', () => {
  return {
    uIOhook: {
      start: vi.fn(),
      stop: vi.fn(),
      on: vi.fn(),
      off: vi.fn()
    },
    UiohookKey: {}
  };
});

import { InputTracker, getInputTracker, resetInputTracker } from '../input-tracker';
import { uIOhook } from 'uiohook-napi';
import type { InputTrackerConfig } from '../input-types';

// Get mock functions after import
const mockStart = vi.mocked(uIOhook.start);
const mockStop = vi.mocked(uIOhook.stop);
const mockOn = vi.mocked(uIOhook.on);
const mockOff = vi.mocked(uIOhook.off);

describe('InputTracker', () => {
  let tracker: InputTracker;

  beforeEach(() => {
    vi.clearAllMocks();
    tracker = new InputTracker();
  });

  afterEach(() => {
    if (tracker.isTracking()) {
      tracker.stop();
    }
    resetInputTracker();
  });

  describe('Constructor', () => {
    it('should create tracker with default config', () => {
      const config = tracker.getConfig();
      expect(config.mouseMoveThrottleMs).toBe(100);
      expect(config.scrollThrottleMs).toBe(50);
      expect(config.keyboardMode).toBe('masked');
      expect(config.captureMouseClicks).toBe(true);
      expect(config.captureKeyboard).toBe(true);
    });

    it('should accept custom config', () => {
      const customTracker = new InputTracker({
        mouseMoveThrottleMs: 200,
        keyboardMode: 'full',
        captureMouseMove: true
      });
      const config = customTracker.getConfig();
      expect(config.mouseMoveThrottleMs).toBe(200);
      expect(config.keyboardMode).toBe('full');
      expect(config.captureMouseMove).toBe(true);
    });
  });

  describe('start', () => {
    it('should start tracking with session ID', () => {
      tracker.start('session-123');

      expect(tracker.isTracking()).toBe(true);
      expect(tracker.getState().sessionId).toBe('session-123');
      expect(mockStart).toHaveBeenCalled();
    });

    it('should register event handlers based on config', () => {
      tracker.start('session-123');

      // Should register click handlers (mousedown, mouseup)
      expect(mockOn).toHaveBeenCalledWith('mousedown', expect.any(Function));
      expect(mockOn).toHaveBeenCalledWith('mouseup', expect.any(Function));

      // Should register keyboard handlers
      expect(mockOn).toHaveBeenCalledWith('keydown', expect.any(Function));
      expect(mockOn).toHaveBeenCalledWith('keyup', expect.any(Function));

      // Should register scroll handler
      expect(mockOn).toHaveBeenCalledWith('wheel', expect.any(Function));
    });

    it('should not register mousemove handler by default', () => {
      tracker.start('session-123');

      // captureMouseMove is false by default
      expect(mockOn).not.toHaveBeenCalledWith('mousemove', expect.any(Function));
    });

    it('should stop existing tracking before starting new', () => {
      tracker.start('session-1');
      tracker.start('session-2');

      expect(tracker.getState().sessionId).toBe('session-2');
    });
  });

  describe('stop', () => {
    it('should stop tracking and return events', () => {
      tracker.start('session-123');
      const events = tracker.stop();

      expect(tracker.isTracking()).toBe(false);
      expect(Array.isArray(events)).toBe(true);
      expect(mockStop).toHaveBeenCalled();
    });

    it('should unregister all event handlers', () => {
      tracker.start('session-123');
      tracker.stop();

      expect(mockOff).toHaveBeenCalledWith('mousedown', expect.any(Function));
      expect(mockOff).toHaveBeenCalledWith('mouseup', expect.any(Function));
      expect(mockOff).toHaveBeenCalledWith('keydown', expect.any(Function));
      expect(mockOff).toHaveBeenCalledWith('keyup', expect.any(Function));
    });

    it('should return empty array when not tracking', () => {
      const events = tracker.stop();
      expect(events).toEqual([]);
    });

    it('should clear events after stopping', () => {
      tracker.start('session-123');
      tracker.stop();

      expect(tracker.getEvents()).toEqual([]);
    });
  });

  describe('pause/resume', () => {
    it('should pause tracking', () => {
      tracker.start('session-123');
      tracker.pause();

      expect(tracker.getState().isPaused).toBe(true);
    });

    it('should resume tracking', () => {
      tracker.start('session-123');
      tracker.pause();
      tracker.resume();

      expect(tracker.getState().isPaused).toBe(false);
    });

    it('should not affect non-tracking state', () => {
      tracker.pause();
      expect(tracker.getState().isPaused).toBe(false);

      tracker.resume();
      expect(tracker.getState().isPaused).toBe(false);
    });
  });

  describe('getEvents', () => {
    it('should return copy of events', () => {
      tracker.start('session-123');

      const events1 = tracker.getEvents();
      const events2 = tracker.getEvents();

      expect(events1).not.toBe(events2);
      expect(events1).toEqual(events2);
    });
  });

  describe('setConfig', () => {
    it('should update configuration', () => {
      tracker.setConfig({ keyboardMode: 'full' });
      expect(tracker.getConfig().keyboardMode).toBe('full');
    });

    it('should merge with existing config', () => {
      tracker.setConfig({ keyboardMode: 'full' });
      tracker.setConfig({ captureScroll: false });

      const config = tracker.getConfig();
      expect(config.keyboardMode).toBe('full');
      expect(config.captureScroll).toBe(false);
    });
  });

  describe('getState', () => {
    it('should return current state', () => {
      tracker.start('session-123');

      const state = tracker.getState();
      expect(state.sessionId).toBe('session-123');
      expect(state.isTracking).toBe(true);
      expect(state.isPaused).toBe(false);
      expect(state.startTime).toBeGreaterThan(0);
      expect(state.eventCount).toBe(0);
    });

    it('should return initial state when not tracking', () => {
      const state = tracker.getState();
      expect(state.sessionId).toBeNull();
      expect(state.isTracking).toBe(false);
    });
  });
});

describe('InputTracker Event Handling', () => {
  let tracker: InputTracker;
  let eventHandlers: Record<string, Function>;

  beforeEach(() => {
    vi.clearAllMocks();
    eventHandlers = {};

    // Capture registered event handlers
    mockOn.mockImplementation((event: string, handler: Function) => {
      eventHandlers[event] = handler;
    });

    tracker = new InputTracker({
      captureMouseMove: true,
      captureMouseClicks: true,
      captureKeyboard: true,
      captureScroll: true,
      keyboardMode: 'full'
    });
    tracker.start('test-session');
  });

  afterEach(() => {
    tracker.stop();
    resetInputTracker();
  });

  describe('Mouse Events', () => {
    it('should capture mouse down events', () => {
      eventHandlers['mousedown']?.({
        x: 100,
        y: 200,
        button: 1,
        ctrlKey: false,
        altKey: false,
        shiftKey: false,
        metaKey: false
      });

      const events = tracker.getEvents();
      expect(events).toHaveLength(1);
      expect(events[0].type).toBe('mousedown');
      expect(events[0].x).toBe(100);
      expect(events[0].y).toBe(200);
      expect(events[0].button).toBe(1);
    });

    it('should capture mouse up and generate click event', () => {
      // Mouse down
      eventHandlers['mousedown']?.({
        x: 100, y: 200, button: 1,
        ctrlKey: false, altKey: false, shiftKey: false, metaKey: false
      });

      // Mouse up
      eventHandlers['mouseup']?.({
        x: 100, y: 200, button: 1,
        ctrlKey: false, altKey: false, shiftKey: false, metaKey: false
      });

      const events = tracker.getEvents();
      expect(events).toHaveLength(3); // mousedown, mouseup, click
      expect(events[2].type).toBe('click');
      expect(events[2].duration).toBeDefined();
    });

    it('should capture modifiers on mouse events', () => {
      eventHandlers['mousedown']?.({
        x: 100, y: 200, button: 1,
        ctrlKey: true, altKey: true, shiftKey: false, metaKey: true
      });

      const events = tracker.getEvents();
      expect(events[0].modifiers).toEqual({
        ctrl: true,
        alt: true,
        shift: false,
        meta: true
      });
    });
  });

  describe('Keyboard Events', () => {
    it('should capture key down events', () => {
      eventHandlers['keydown']?.({
        keycode: 30, // 'A' key
        ctrlKey: false,
        altKey: false,
        shiftKey: false,
        metaKey: false
      });

      const events = tracker.getEvents();
      expect(events).toHaveLength(1);
      expect(events[0].type).toBe('keydown');
      expect(events[0].keycode).toBe(30);
      expect(events[0].key).toBe('A');
    });

    it('should capture key up events', () => {
      eventHandlers['keyup']?.({
        keycode: 30,
        ctrlKey: false, altKey: false, shiftKey: false, metaKey: false
      });

      const events = tracker.getEvents();
      expect(events).toHaveLength(1);
      expect(events[0].type).toBe('keyup');
    });

    it('should capture modifier keys', () => {
      eventHandlers['keydown']?.({
        keycode: 30,
        ctrlKey: true, altKey: false, shiftKey: true, metaKey: false
      });

      const events = tracker.getEvents();
      expect(events[0].modifiers).toEqual({
        ctrl: true,
        alt: false,
        shift: true,
        meta: false
      });
    });
  });

  describe('Scroll Events', () => {
    it('should capture scroll events', () => {
      eventHandlers['wheel']?.({
        x: 500, y: 300,
        rotation: 3,
        direction: 1 // Vertical
      });

      const events = tracker.getEvents();
      expect(events).toHaveLength(1);
      expect(events[0].type).toBe('scroll');
      expect(events[0].x).toBe(500);
      expect(events[0].y).toBe(300);
      expect(events[0].scrollDelta).toBeDefined();
    });
  });

  describe('Paused State', () => {
    it('should not capture events when paused', () => {
      tracker.pause();

      eventHandlers['mousedown']?.({
        x: 100, y: 200, button: 1,
        ctrlKey: false, altKey: false, shiftKey: false, metaKey: false
      });

      eventHandlers['keydown']?.({
        keycode: 30,
        ctrlKey: false, altKey: false, shiftKey: false, metaKey: false
      });

      expect(tracker.getEvents()).toHaveLength(0);
    });

    it('should resume capturing after resume', () => {
      tracker.pause();
      tracker.resume();

      eventHandlers['mousedown']?.({
        x: 100, y: 200, button: 1,
        ctrlKey: false, altKey: false, shiftKey: false, metaKey: false
      });

      expect(tracker.getEvents()).toHaveLength(1);
    });
  });
});

describe('InputTracker Masked Mode', () => {
  let tracker: InputTracker;
  let eventHandlers: Record<string, Function>;

  beforeEach(() => {
    vi.clearAllMocks();
    eventHandlers = {};
    mockOn.mockImplementation((event: string, handler: Function) => {
      eventHandlers[event] = handler;
    });

    tracker = new InputTracker({
      keyboardMode: 'masked'
    });
    tracker.start('test-session');
  });

  afterEach(() => {
    tracker.stop();
    resetInputTracker();
  });

  it('should mask regular character keys', () => {
    eventHandlers['keydown']?.({
      keycode: 30, // 'A' key (not a modifier or special key)
      ctrlKey: false, altKey: false, shiftKey: false, metaKey: false
    });

    const events = tracker.getEvents();
    expect(events[0].key).toBe('•');
  });

  it('should not mask modifier keys', () => {
    eventHandlers['keydown']?.({
      keycode: 29, // LeftCtrl
      ctrlKey: true, altKey: false, shiftKey: false, metaKey: false
    });

    const events = tracker.getEvents();
    expect(events[0].key).toBe('LeftCtrl');
  });

  it('should not mask special keys', () => {
    eventHandlers['keydown']?.({
      keycode: 28, // Enter
      ctrlKey: false, altKey: false, shiftKey: false, metaKey: false
    });

    const events = tracker.getEvents();
    expect(events[0].key).toBe('Enter');
  });
});

describe('Singleton Pattern', () => {
  beforeEach(() => {
    resetInputTracker();
  });

  it('should return same instance', () => {
    const t1 = getInputTracker();
    const t2 = getInputTracker();
    expect(t1).toBe(t2);
  });

  it('should create new instance after reset', () => {
    const t1 = getInputTracker();
    resetInputTracker();
    const t2 = getInputTracker();
    expect(t1).not.toBe(t2);
  });

  it('should stop tracking on reset', () => {
    const tracker = getInputTracker();
    tracker.start('session-123');
    resetInputTracker();
    expect(tracker.isTracking()).toBe(false);
  });
});
