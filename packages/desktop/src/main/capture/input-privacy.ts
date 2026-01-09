/**
 * Input Privacy Module
 *
 * Filters and masks sensitive input based on active window and app rules.
 * Used to protect passwords and sensitive data from being captured.
 */

import { InputEvent, InputTrackerConfig } from './input-types';

// =============================================================================
// Sensitive App Detection
// =============================================================================

/**
 * Default list of sensitive process names (password managers, etc.)
 */
export const SENSITIVE_PROCESS_NAMES = [
  // Password managers
  '1password',
  'bitwarden',
  'lastpass',
  'keepass',
  'keepassxc',
  'dashlane',
  'enpass',
  'roboform',

  // System credential dialogs
  'keychain',
  'credentials',
  'credential',
  'ssh-agent',
  'gnome-keyring',
  'kwallet',
  'seahorse',

  // Security tools
  'gpg',
  'pinentry',
  'ssh'
];

/**
 * Default list of sensitive window title patterns
 */
export const SENSITIVE_TITLE_PATTERNS = [
  /password/i,
  /passwort/i,
  /contraseña/i,
  /mot de passe/i,
  /credential/i,
  /sign.?in/i,
  /log.?in/i,
  /authenticate/i,
  /master password/i,
  /unlock vault/i,
  /security code/i,
  /verification code/i,
  /two.?factor/i,
  /2fa/i,
  /otp/i,
  /sudo/i,
  /su -/i,
  /bank/i,
  /banking/i
];

/**
 * Default list of sensitive URL patterns
 */
export const SENSITIVE_URL_PATTERNS = [
  /bank/i,
  /banking/i,
  /login/i,
  /signin/i,
  /sign-in/i,
  /oauth/i,
  /auth\./i,
  /accounts\.google/i,
  /appleid\.apple/i,
  /login\.microsoft/i,
  /secure\./i
];

// =============================================================================
// Privacy Filter Interface
// =============================================================================

export interface ActiveWindowInfo {
  processName?: string;
  windowTitle?: string;
  url?: string;
}

export interface PrivacyFilterConfig {
  sensitiveProcessNames: string[];
  sensitiveTitlePatterns: RegExp[];
  sensitiveUrlPatterns: RegExp[];
  customPatterns: RegExp[];
}

// =============================================================================
// InputPrivacyFilter Class
// =============================================================================

export class InputPrivacyFilter {
  private config: PrivacyFilterConfig;
  private lastKnownWindow: ActiveWindowInfo | null = null;
  private isSensitiveContext = false;

  constructor(customConfig?: Partial<PrivacyFilterConfig>) {
    this.config = {
      sensitiveProcessNames: customConfig?.sensitiveProcessNames || [...SENSITIVE_PROCESS_NAMES],
      sensitiveTitlePatterns: customConfig?.sensitiveTitlePatterns || [...SENSITIVE_TITLE_PATTERNS],
      sensitiveUrlPatterns: customConfig?.sensitiveUrlPatterns || [...SENSITIVE_URL_PATTERNS],
      customPatterns: customConfig?.customPatterns || []
    };
  }

  /**
   * Update the current active window info
   */
  updateActiveWindow(windowInfo: ActiveWindowInfo): void {
    this.lastKnownWindow = windowInfo;
    this.isSensitiveContext = this.checkSensitive(windowInfo);
  }

  /**
   * Check if current context is sensitive
   */
  isSensitive(): boolean {
    return this.isSensitiveContext;
  }

  /**
   * Check if a window is sensitive
   */
  checkSensitive(windowInfo: ActiveWindowInfo): boolean {
    // Check process name
    if (windowInfo.processName) {
      const processLower = windowInfo.processName.toLowerCase();
      if (this.config.sensitiveProcessNames.some(name => processLower.includes(name.toLowerCase()))) {
        return true;
      }
    }

    // Check window title
    if (windowInfo.windowTitle) {
      if (this.config.sensitiveTitlePatterns.some(pattern => pattern.test(windowInfo.windowTitle!))) {
        return true;
      }
      if (this.config.customPatterns.some(pattern => pattern.test(windowInfo.windowTitle!))) {
        return true;
      }
    }

    // Check URL
    if (windowInfo.url) {
      if (this.config.sensitiveUrlPatterns.some(pattern => pattern.test(windowInfo.url!))) {
        return true;
      }
    }

    return false;
  }

  /**
   * Filter/mask events based on current context
   */
  filterEvent(event: InputEvent): InputEvent | null {
    // If not in sensitive context, return event unchanged
    if (!this.isSensitiveContext) {
      return event;
    }

    // In sensitive context, handle different event types
    switch (event.type) {
      case 'keydown':
      case 'keyup':
        // Completely exclude keyboard events in sensitive apps
        return null;

      case 'click':
      case 'mousedown':
      case 'mouseup':
        // Keep click events but could optionally mask them
        return event;

      case 'mousemove':
      case 'scroll':
        // Keep movement events
        return event;

      default:
        return event;
    }
  }

  /**
   * Filter a batch of events
   */
  filterEvents(events: InputEvent[]): InputEvent[] {
    return events.filter(event => {
      const filtered = this.filterEvent(event);
      return filtered !== null;
    });
  }

  /**
   * Add a custom sensitive pattern
   */
  addSensitivePattern(pattern: RegExp): void {
    this.config.customPatterns.push(pattern);
  }

  /**
   * Add a sensitive process name
   */
  addSensitiveProcess(processName: string): void {
    if (!this.config.sensitiveProcessNames.includes(processName.toLowerCase())) {
      this.config.sensitiveProcessNames.push(processName.toLowerCase());
    }
  }

  /**
   * Remove a sensitive process name (whitelist)
   */
  whitelistProcess(processName: string): void {
    const index = this.config.sensitiveProcessNames.indexOf(processName.toLowerCase());
    if (index > -1) {
      this.config.sensitiveProcessNames.splice(index, 1);
    }
  }

  /**
   * Get current configuration
   */
  getConfig(): PrivacyFilterConfig {
    return {
      ...this.config,
      sensitiveTitlePatterns: [...this.config.sensitiveTitlePatterns],
      sensitiveUrlPatterns: [...this.config.sensitiveUrlPatterns],
      customPatterns: [...this.config.customPatterns]
    };
  }
}

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Mask keyboard events by replacing key names with bullets
 */
export function maskKeyboardEvents(events: InputEvent[]): InputEvent[] {
  return events.map(event => {
    if (event.type === 'keydown' || event.type === 'keyup') {
      // Keep modifiers and special keys visible
      const specialKeys = [
        'Escape', 'Backspace', 'Tab', 'Enter', 'Space',
        'LeftCtrl', 'RightCtrl', 'LeftShift', 'RightShift',
        'LeftAlt', 'RightAlt', 'LeftMeta', 'RightMeta',
        'Up', 'Down', 'Left', 'Right',
        'Home', 'End', 'PageUp', 'PageDown',
        'Insert', 'Delete',
        'F1', 'F2', 'F3', 'F4', 'F5', 'F6',
        'F7', 'F8', 'F9', 'F10', 'F11', 'F12'
      ];

      if (event.key && !specialKeys.includes(event.key)) {
        return {
          ...event,
          key: '•'
        };
      }
    }
    return event;
  });
}

/**
 * Remove all keyboard events from a batch
 */
export function removeKeyboardEvents(events: InputEvent[]): InputEvent[] {
  return events.filter(event => event.type !== 'keydown' && event.type !== 'keyup');
}

/**
 * Get a summary of input events (for statistics without sensitive data)
 */
export function getInputSummary(events: InputEvent[]): {
  totalEvents: number;
  clicks: number;
  keystrokes: number;
  scrolls: number;
  mouseMoves: number;
  duration: number;
} {
  const summary = {
    totalEvents: events.length,
    clicks: 0,
    keystrokes: 0,
    scrolls: 0,
    mouseMoves: 0,
    duration: 0
  };

  let minTime = Infinity;
  let maxTime = 0;

  for (const event of events) {
    minTime = Math.min(minTime, event.timestamp);
    maxTime = Math.max(maxTime, event.timestamp);

    switch (event.type) {
      case 'click':
        summary.clicks++;
        break;
      case 'keydown':
        summary.keystrokes++;
        break;
      case 'scroll':
        summary.scrolls++;
        break;
      case 'mousemove':
        summary.mouseMoves++;
        break;
    }
  }

  summary.duration = maxTime - minTime;
  return summary;
}

// =============================================================================
// Singleton
// =============================================================================

let filterInstance: InputPrivacyFilter | null = null;

export function getInputPrivacyFilter(): InputPrivacyFilter {
  if (!filterInstance) {
    filterInstance = new InputPrivacyFilter();
  }
  return filterInstance;
}

export function resetInputPrivacyFilter(): void {
  filterInstance = null;
}
