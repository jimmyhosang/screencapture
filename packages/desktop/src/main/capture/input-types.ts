/**
 * Input Tracking Types
 *
 * Type definitions for global input tracking (mouse, keyboard, scroll).
 */

// =============================================================================
// Input Event Types
// =============================================================================

export type InputEventType =
  | 'mousedown'
  | 'mouseup'
  | 'click'
  | 'mousemove'
  | 'scroll'
  | 'keydown'
  | 'keyup';

export interface InputModifiers {
  ctrl: boolean;
  alt: boolean;
  shift: boolean;
  meta: boolean;
}

export interface InputEvent {
  timestamp: number;      // ms offset from recording start
  type: InputEventType;
  x?: number;             // mouse position
  y?: number;
  button?: number;        // 1=left, 2=right, 3=middle
  keycode?: number;
  key?: string;           // human-readable key name
  modifiers?: InputModifiers;
  scrollDelta?: {
    x: number;
    y: number;
  };
  duration?: number;      // for click events (mousedown to mouseup)
}

// =============================================================================
// Tracker Configuration
// =============================================================================

export type KeyboardCaptureMode = 'full' | 'masked' | 'none';

export interface InputTrackerConfig {
  // Throttling
  mouseMoveThrottleMs: number;      // default: 100ms
  scrollThrottleMs: number;         // default: 50ms
  significantMoveThreshold: number; // pixels, default: 5

  // Privacy
  keyboardMode: KeyboardCaptureMode;
  excludedProcesses: string[];      // processes where input is not captured

  // Features
  captureMouseClicks: boolean;
  captureMouseMove: boolean;
  captureKeyboard: boolean;
  captureScroll: boolean;
}

export const DEFAULT_INPUT_CONFIG: InputTrackerConfig = {
  mouseMoveThrottleMs: 100,
  scrollThrottleMs: 50,
  significantMoveThreshold: 5,
  keyboardMode: 'masked',
  excludedProcesses: [
    '1password',
    'bitwarden',
    'lastpass',
    'keepass',
    'keychain',
    'credentials',
    'ssh-agent'
  ],
  captureMouseClicks: true,
  captureMouseMove: false, // Usually disabled to reduce data
  captureKeyboard: true,
  captureScroll: true
};

// =============================================================================
// Tracker State
// =============================================================================

export interface InputTrackerState {
  sessionId: string | null;
  isTracking: boolean;
  isPaused: boolean;
  startTime: number;
  eventCount: number;
  lastMousePosition: { x: number; y: number } | null;
  lastScrollTime: number;
  pendingMouseDown: {
    timestamp: number;
    x: number;
    y: number;
    button: number;
  } | null;
}

// =============================================================================
// Key Mapping (common keys)
// =============================================================================

export const KEY_NAMES: Record<number, string> = {
  // Letters
  30: 'A', 48: 'B', 46: 'C', 32: 'D', 18: 'E', 33: 'F', 34: 'G', 35: 'H',
  23: 'I', 36: 'J', 37: 'K', 38: 'L', 50: 'M', 49: 'N', 24: 'O', 25: 'P',
  16: 'Q', 19: 'R', 31: 'S', 20: 'T', 22: 'U', 47: 'V', 17: 'W', 45: 'X',
  21: 'Y', 44: 'Z',

  // Numbers
  2: '1', 3: '2', 4: '3', 5: '4', 6: '5', 7: '6', 8: '7', 9: '8', 10: '9', 11: '0',

  // Function keys
  59: 'F1', 60: 'F2', 61: 'F3', 62: 'F4', 63: 'F5', 64: 'F6',
  65: 'F7', 66: 'F8', 67: 'F9', 68: 'F10', 87: 'F11', 88: 'F12',

  // Special keys
  1: 'Escape', 14: 'Backspace', 15: 'Tab', 28: 'Enter', 57: 'Space',
  29: 'LeftCtrl', 42: 'LeftShift', 56: 'LeftAlt', 125: 'LeftMeta',
  157: 'RightCtrl', 54: 'RightShift', 184: 'RightAlt', 126: 'RightMeta',

  // Navigation
  72: 'Up', 80: 'Down', 75: 'Left', 77: 'Right',
  71: 'Home', 79: 'End', 73: 'PageUp', 81: 'PageDown',
  82: 'Insert', 83: 'Delete',

  // Punctuation
  12: '-', 13: '=', 26: '[', 27: ']', 43: '\\', 39: ';', 40: "'",
  41: '`', 51: ',', 52: '.', 53: '/',

  // Numpad
  69: 'NumLock', 55: 'NumpadMultiply', 74: 'NumpadSubtract',
  78: 'NumpadAdd', 156: 'NumpadEnter', 83: 'NumpadDecimal',
  82: 'Numpad0', 79: 'Numpad1', 80: 'Numpad2', 81: 'Numpad3',
  75: 'Numpad4', 76: 'Numpad5', 77: 'Numpad6', 71: 'Numpad7',
  72: 'Numpad8', 73: 'Numpad9'
};

// =============================================================================
// Input Events for IPC
// =============================================================================

export const INPUT_IPC_CHANNELS = {
  START: 'input:start',
  STOP: 'input:stop',
  PAUSE: 'input:pause',
  RESUME: 'input:resume',
  GET_EVENTS: 'input:getEvents',
  GET_CONFIG: 'input:getConfig',
  SET_CONFIG: 'input:setConfig',
  ON_EVENT: 'input:event' // For real-time event streaming
} as const;
