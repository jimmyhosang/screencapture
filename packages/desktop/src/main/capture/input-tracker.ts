/**
 * Input Tracker
 *
 * Global input tracking for mouse, keyboard, and scroll events using uiohook-napi.
 * Runs in the main process and collects input events during recording.
 */

import { uIOhook, UiohookKey, UiohookMouseEvent, UiohookKeyboardEvent, UiohookWheelEvent } from 'uiohook-napi';
import {
  InputEvent,
  InputEventType,
  InputTrackerConfig,
  InputTrackerState,
  InputModifiers,
  DEFAULT_INPUT_CONFIG,
  KEY_NAMES
} from './input-types';

// =============================================================================
// InputTracker Class
// =============================================================================

export class InputTracker {
  private config: InputTrackerConfig;
  private state: InputTrackerState;
  private events: InputEvent[] = [];
  private isHookStarted = false;

  // Throttle timers
  private lastMouseMoveTime = 0;
  private lastScrollTime = 0;

  // Bound event handlers (for cleanup)
  private handleMouseDown = this.onMouseDown.bind(this);
  private handleMouseUp = this.onMouseUp.bind(this);
  private handleMouseMove = this.onMouseMove.bind(this);
  private handleScroll = this.onScroll.bind(this);
  private handleKeyDown = this.onKeyDown.bind(this);
  private handleKeyUp = this.onKeyUp.bind(this);

  constructor(config: Partial<InputTrackerConfig> = {}) {
    this.config = { ...DEFAULT_INPUT_CONFIG, ...config };
    this.state = this.createInitialState();
  }

  // ===========================================================================
  // Public Methods
  // ===========================================================================

  /**
   * Start tracking input events for a recording session
   */
  start(sessionId: string): void {
    if (this.state.isTracking) {
      console.warn('[InputTracker] Already tracking, stopping first');
      this.stop();
    }

    console.log(`[InputTracker] Starting for session: ${sessionId}`);

    this.state = {
      sessionId,
      isTracking: true,
      isPaused: false,
      startTime: Date.now(),
      eventCount: 0,
      lastMousePosition: null,
      lastScrollTime: 0,
      pendingMouseDown: null
    };

    this.events = [];
    this.registerEventHandlers();
    this.startHook();
  }

  /**
   * Stop tracking and return collected events
   */
  stop(): InputEvent[] {
    if (!this.state.isTracking) {
      return [];
    }

    console.log(`[InputTracker] Stopping. Collected ${this.events.length} events`);

    this.stopHook();
    this.unregisterEventHandlers();

    const collectedEvents = [...this.events];
    this.events = [];
    this.state = this.createInitialState();

    return collectedEvents;
  }

  /**
   * Pause tracking (events are ignored while paused)
   */
  pause(): void {
    if (this.state.isTracking) {
      this.state.isPaused = true;
      console.log('[InputTracker] Paused');
    }
  }

  /**
   * Resume tracking
   */
  resume(): void {
    if (this.state.isTracking) {
      this.state.isPaused = false;
      console.log('[InputTracker] Resumed');
    }
  }

  /**
   * Get current collected events
   */
  getEvents(): InputEvent[] {
    return [...this.events];
  }

  /**
   * Get tracker state
   */
  getState(): InputTrackerState {
    return { ...this.state };
  }

  /**
   * Check if currently tracking
   */
  isTracking(): boolean {
    return this.state.isTracking;
  }

  /**
   * Update configuration
   */
  setConfig(config: Partial<InputTrackerConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Get current configuration
   */
  getConfig(): InputTrackerConfig {
    return { ...this.config };
  }

  // ===========================================================================
  // Private Methods - Hook Management
  // ===========================================================================

  private startHook(): void {
    if (this.isHookStarted) {
      return;
    }

    try {
      uIOhook.start();
      this.isHookStarted = true;
      console.log('[InputTracker] uIOhook started');
    } catch (error) {
      console.error('[InputTracker] Failed to start uIOhook:', error);
    }
  }

  private stopHook(): void {
    if (!this.isHookStarted) {
      return;
    }

    try {
      uIOhook.stop();
      this.isHookStarted = false;
      console.log('[InputTracker] uIOhook stopped');
    } catch (error) {
      console.error('[InputTracker] Failed to stop uIOhook:', error);
    }
  }

  private registerEventHandlers(): void {
    if (this.config.captureMouseClicks) {
      uIOhook.on('mousedown', this.handleMouseDown);
      uIOhook.on('mouseup', this.handleMouseUp);
    }

    if (this.config.captureMouseMove) {
      uIOhook.on('mousemove', this.handleMouseMove);
    }

    if (this.config.captureScroll) {
      uIOhook.on('wheel', this.handleScroll);
    }

    if (this.config.captureKeyboard && this.config.keyboardMode !== 'none') {
      uIOhook.on('keydown', this.handleKeyDown);
      uIOhook.on('keyup', this.handleKeyUp);
    }
  }

  private unregisterEventHandlers(): void {
    uIOhook.off('mousedown', this.handleMouseDown);
    uIOhook.off('mouseup', this.handleMouseUp);
    uIOhook.off('mousemove', this.handleMouseMove);
    uIOhook.off('wheel', this.handleScroll);
    uIOhook.off('keydown', this.handleKeyDown);
    uIOhook.off('keyup', this.handleKeyUp);
  }

  // ===========================================================================
  // Private Methods - Event Handlers
  // ===========================================================================

  private onMouseDown(event: UiohookMouseEvent): void {
    if (this.state.isPaused) return;

    const timestamp = this.getTimestamp();

    // Store pending mousedown for click duration calculation
    this.state.pendingMouseDown = {
      timestamp,
      x: event.x,
      y: event.y,
      button: event.button
    };

    this.addEvent({
      timestamp,
      type: 'mousedown',
      x: event.x,
      y: event.y,
      button: event.button,
      modifiers: this.getModifiers(event)
    });
  }

  private onMouseUp(event: UiohookMouseEvent): void {
    if (this.state.isPaused) return;

    const timestamp = this.getTimestamp();

    this.addEvent({
      timestamp,
      type: 'mouseup',
      x: event.x,
      y: event.y,
      button: event.button,
      modifiers: this.getModifiers(event)
    });

    // Generate click event if we have a pending mousedown
    if (this.state.pendingMouseDown && this.state.pendingMouseDown.button === event.button) {
      const duration = timestamp - this.state.pendingMouseDown.timestamp;

      this.addEvent({
        timestamp,
        type: 'click',
        x: event.x,
        y: event.y,
        button: event.button,
        duration,
        modifiers: this.getModifiers(event)
      });

      this.state.pendingMouseDown = null;
    }
  }

  private onMouseMove(event: UiohookMouseEvent): void {
    if (this.state.isPaused) return;

    const now = Date.now();

    // Throttle mouse move events
    if (now - this.lastMouseMoveTime < this.config.mouseMoveThrottleMs) {
      return;
    }

    // Check if movement is significant
    if (this.state.lastMousePosition) {
      const dx = Math.abs(event.x - this.state.lastMousePosition.x);
      const dy = Math.abs(event.y - this.state.lastMousePosition.y);

      if (dx < this.config.significantMoveThreshold && dy < this.config.significantMoveThreshold) {
        return;
      }
    }

    this.lastMouseMoveTime = now;
    this.state.lastMousePosition = { x: event.x, y: event.y };

    this.addEvent({
      timestamp: this.getTimestamp(),
      type: 'mousemove',
      x: event.x,
      y: event.y
    });
  }

  private onScroll(event: UiohookWheelEvent): void {
    if (this.state.isPaused) return;

    const now = Date.now();

    // Throttle scroll events
    if (now - this.lastScrollTime < this.config.scrollThrottleMs) {
      return;
    }

    this.lastScrollTime = now;

    this.addEvent({
      timestamp: this.getTimestamp(),
      type: 'scroll',
      x: event.x,
      y: event.y,
      scrollDelta: {
        x: event.rotation * (event.direction === 3 ? -1 : 1), // Horizontal
        y: event.rotation * (event.direction === 3 ? 0 : 1)  // Vertical
      }
    });
  }

  private onKeyDown(event: UiohookKeyboardEvent): void {
    if (this.state.isPaused) return;

    const keyInfo = this.getKeyInfo(event);

    this.addEvent({
      timestamp: this.getTimestamp(),
      type: 'keydown',
      keycode: event.keycode,
      key: keyInfo.key,
      modifiers: keyInfo.modifiers
    });
  }

  private onKeyUp(event: UiohookKeyboardEvent): void {
    if (this.state.isPaused) return;

    const keyInfo = this.getKeyInfo(event);

    this.addEvent({
      timestamp: this.getTimestamp(),
      type: 'keyup',
      keycode: event.keycode,
      key: keyInfo.key,
      modifiers: keyInfo.modifiers
    });
  }

  // ===========================================================================
  // Private Methods - Helpers
  // ===========================================================================

  private createInitialState(): InputTrackerState {
    return {
      sessionId: null,
      isTracking: false,
      isPaused: false,
      startTime: 0,
      eventCount: 0,
      lastMousePosition: null,
      lastScrollTime: 0,
      pendingMouseDown: null
    };
  }

  private getTimestamp(): number {
    return Date.now() - this.state.startTime;
  }

  private addEvent(event: InputEvent): void {
    this.events.push(event);
    this.state.eventCount++;
  }

  private getModifiers(event: UiohookMouseEvent): InputModifiers {
    return {
      ctrl: !!(event.ctrlKey),
      alt: !!(event.altKey),
      shift: !!(event.shiftKey),
      meta: !!(event.metaKey)
    };
  }

  private getKeyInfo(event: UiohookKeyboardEvent): { key: string; modifiers: InputModifiers } {
    const modifiers: InputModifiers = {
      ctrl: !!(event.ctrlKey),
      alt: !!(event.altKey),
      shift: !!(event.shiftKey),
      meta: !!(event.metaKey)
    };

    let key: string;

    if (this.config.keyboardMode === 'masked') {
      // In masked mode, only show modifier keys and special keys
      if (this.isModifierKey(event.keycode) || this.isSpecialKey(event.keycode)) {
        key = KEY_NAMES[event.keycode] || `Key${event.keycode}`;
      } else {
        key = '•'; // Masked character
      }
    } else {
      // Full mode - show actual key
      key = KEY_NAMES[event.keycode] || `Key${event.keycode}`;
    }

    return { key, modifiers };
  }

  private isModifierKey(keycode: number): boolean {
    // Ctrl, Shift, Alt, Meta keys
    return [29, 42, 56, 125, 157, 54, 184, 126].includes(keycode);
  }

  private isSpecialKey(keycode: number): boolean {
    // Escape, Enter, Backspace, Tab, Delete, Arrow keys, etc.
    return [
      1, 14, 15, 28, 57, // Escape, Backspace, Tab, Enter, Space
      72, 80, 75, 77,    // Arrow keys
      71, 79, 73, 81,    // Home, End, PageUp, PageDown
      82, 83,            // Insert, Delete
      59, 60, 61, 62, 63, 64, 65, 66, 67, 68, 87, 88 // F1-F12
    ].includes(keycode);
  }
}

// =============================================================================
// Singleton Instance
// =============================================================================

let instance: InputTracker | null = null;

export function getInputTracker(config?: Partial<InputTrackerConfig>): InputTracker {
  if (!instance) {
    instance = new InputTracker(config);
  }
  return instance;
}

export function resetInputTracker(): void {
  if (instance) {
    if (instance.isTracking()) {
      instance.stop();
    }
    instance = null;
  }
}
