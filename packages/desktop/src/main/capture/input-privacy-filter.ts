/**
 * Input Privacy Filter
 *
 * Filters and redacts sensitive input events based on application context,
 * input patterns, and user privacy configuration.
 */

import type { InputEvent, InputModifiers } from './input-types';

// =============================================================================
// Types
// =============================================================================

export interface PrivacyConfig {
  enabled: boolean;
  keyboardMode: 'full' | 'masked' | 'none';
  filterSensitiveApps: boolean;
  filterPasswordFields: boolean;
  maskPotentialPasswords: boolean;
  excludeApps: string[];
  sensitiveAppPatterns: string[];
  trustedApps: string[];
  redactAfterCapture: boolean;
}

export interface WindowContext {
  processName?: string;
  windowTitle?: string;
  url?: string;
}

export interface PrivacyDecision {
  shouldCapture: boolean;
  shouldMaskKeyboard: boolean;
  reason?: string;
}

export const DEFAULT_PRIVACY_CONFIG: PrivacyConfig = {
  enabled: true,
  keyboardMode: 'masked',
  filterSensitiveApps: true,
  filterPasswordFields: true,
  maskPotentialPasswords: true,
  excludeApps: [],
  sensitiveAppPatterns: [
    // Password Managers
    '1password',
    'bitwarden',
    'lastpass',
    'dashlane',
    'keepass',
    'roboform',
    'enpass',
    'nordpass',
    // Banking / Financial
    'bank',
    'chase',
    'wellsfargo',
    'citibank',
    'paypal',
    'venmo',
    'cashapp',
    'zelle',
    'mint',
    'quickbooks',
    'turbotax',
    // Authentication
    'authenticator',
    '2fa',
    'duo mobile',
    'authy',
    'microsoft authenticator',
    'google authenticator',
    // VPN / Security
    'vpn',
    'nordvpn',
    'expressvpn',
    'protonvpn',
    // Healthcare
    'myhealth',
    'patient portal',
    'medical',
    'pharmacy',
    // Crypto
    'coinbase',
    'binance',
    'metamask',
    'ledger',
    'trezor',
    'crypto wallet',
    // SSH / Terminal with sensitive context
    'ssh',
    'putty',
  ],
  trustedApps: [
    // Common productivity apps that are generally safe
    'visual studio code',
    'vscode',
    'sublime text',
    'atom',
    'intellij',
    'webstorm',
    'pycharm',
    'notepad++',
    'microsoft word',
    'microsoft excel',
    'google docs',
    'slack',
    'discord',
    'teams',
    'zoom',
  ],
  redactAfterCapture: false,
};

// Sensitive URL patterns
const SENSITIVE_URL_PATTERNS = [
  /login/i,
  /signin/i,
  /sign-in/i,
  /password/i,
  /auth/i,
  /authenticate/i,
  /checkout/i,
  /payment/i,
  /account/i,
  /billing/i,
  /bank/i,
  /secure/i,
  /2fa/i,
  /mfa/i,
  /verify/i,
  /oauth/i,
  /sso/i,
];

// Window title patterns indicating sensitive context
const SENSITIVE_TITLE_PATTERNS = [
  /password/i,
  /login/i,
  /sign in/i,
  /authentication/i,
  /credit card/i,
  /payment/i,
  /checkout/i,
  /security/i,
  /private/i,
  /confidential/i,
  /pin/i,
  /ssn|social security/i,
];

// =============================================================================
// InputPrivacyFilter Class
// =============================================================================

export class InputPrivacyFilter {
  private config: PrivacyConfig;
  private currentContext: WindowContext = {};
  private consecutiveKeystrokes: number = 0;
  private lastKeystrokeTime: number = 0;
  private potentialPasswordMode: boolean = false;

  constructor(config: Partial<PrivacyConfig> = {}) {
    this.config = { ...DEFAULT_PRIVACY_CONFIG, ...config };
  }

  // ===========================================================================
  // Public Methods
  // ===========================================================================

  /**
   * Update the current window context
   */
  setWindowContext(context: WindowContext): void {
    this.currentContext = context;
    // Reset password detection when window changes
    this.resetPasswordDetection();
  }

  /**
   * Get privacy decision for the current context
   */
  getPrivacyDecision(): PrivacyDecision {
    if (!this.config.enabled) {
      return { shouldCapture: true, shouldMaskKeyboard: false };
    }

    // Check if app is in exclude list
    if (this.isExcludedApp()) {
      return {
        shouldCapture: false,
        shouldMaskKeyboard: true,
        reason: 'App in exclude list'
      };
    }

    // Check if app is sensitive
    if (this.config.filterSensitiveApps && this.isSensitiveApp()) {
      return {
        shouldCapture: true,
        shouldMaskKeyboard: true,
        reason: 'Sensitive application detected'
      };
    }

    // Check if URL is sensitive
    if (this.isSensitiveUrl()) {
      return {
        shouldCapture: true,
        shouldMaskKeyboard: true,
        reason: 'Sensitive URL detected'
      };
    }

    // Check if window title indicates sensitivity
    if (this.isSensitiveTitle()) {
      return {
        shouldCapture: true,
        shouldMaskKeyboard: true,
        reason: 'Sensitive window title detected'
      };
    }

    // Check keyboard mode configuration
    const shouldMask = this.config.keyboardMode === 'masked' ||
                       (this.config.maskPotentialPasswords && this.potentialPasswordMode);

    return {
      shouldCapture: true,
      shouldMaskKeyboard: shouldMask
    };
  }

  /**
   * Filter/transform a single input event
   */
  filterEvent(event: InputEvent): InputEvent | null {
    const decision = this.getPrivacyDecision();

    if (!decision.shouldCapture && this.isKeyboardEvent(event)) {
      return null; // Don't capture keyboard events for excluded apps
    }

    // Track keystrokes for password detection
    if (event.type === 'keydown') {
      this.trackKeystroke(event);
    }

    // Apply keyboard masking if needed
    if (decision.shouldMaskKeyboard && this.isKeyboardEvent(event)) {
      return this.maskKeyboardEvent(event);
    }

    return event;
  }

  /**
   * Filter a batch of events (post-capture redaction)
   */
  filterEvents(events: InputEvent[]): InputEvent[] {
    if (!this.config.enabled) {
      return events;
    }

    return events
      .map(event => this.filterEvent(event))
      .filter((event): event is InputEvent => event !== null);
  }

  /**
   * Redact events after capture based on patterns
   */
  redactEvents(events: InputEvent[]): InputEvent[] {
    if (!this.config.redactAfterCapture) {
      return events;
    }

    const redacted: InputEvent[] = [];
    let inPasswordSequence = false;
    let passwordStartIndex = -1;

    for (let i = 0; i < events.length; i++) {
      const event = events[i];

      if (event.type === 'keydown' || event.type === 'keyup') {
        // Detect password entry patterns (rapid sequential keystrokes followed by Enter)
        if (this.looksLikePasswordEntry(events, i)) {
          inPasswordSequence = true;
          passwordStartIndex = i;
        }

        if (inPasswordSequence) {
          // Mask all keystrokes in the password sequence
          redacted.push(this.maskKeyboardEvent(event));

          // Check if this is the end of password sequence (Enter key)
          if (event.keycode === 28 && event.type === 'keydown') { // Enter
            inPasswordSequence = false;
          }
        } else {
          redacted.push(event);
        }
      } else {
        redacted.push(event);
      }
    }

    return redacted;
  }

  /**
   * Get current configuration
   */
  getConfig(): PrivacyConfig {
    return { ...this.config };
  }

  /**
   * Update configuration
   */
  setConfig(config: Partial<PrivacyConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Add app to sensitive list
   */
  addSensitiveApp(pattern: string): void {
    if (!this.config.sensitiveAppPatterns.includes(pattern.toLowerCase())) {
      this.config.sensitiveAppPatterns.push(pattern.toLowerCase());
    }
  }

  /**
   * Add app to trusted list
   */
  addTrustedApp(pattern: string): void {
    if (!this.config.trustedApps.includes(pattern.toLowerCase())) {
      this.config.trustedApps.push(pattern.toLowerCase());
    }
  }

  /**
   * Add app to exclude list
   */
  addExcludedApp(pattern: string): void {
    if (!this.config.excludeApps.includes(pattern.toLowerCase())) {
      this.config.excludeApps.push(pattern.toLowerCase());
    }
  }

  // ===========================================================================
  // Private Methods - Detection
  // ===========================================================================

  private isExcludedApp(): boolean {
    const processName = this.currentContext.processName?.toLowerCase() || '';
    const windowTitle = this.currentContext.windowTitle?.toLowerCase() || '';

    return this.config.excludeApps.some(pattern => {
      const p = pattern.toLowerCase();
      return processName.includes(p) || windowTitle.includes(p);
    });
  }

  private isSensitiveApp(): boolean {
    const processName = this.currentContext.processName?.toLowerCase() || '';
    const windowTitle = this.currentContext.windowTitle?.toLowerCase() || '';

    // Check if it's a trusted app first
    const isTrusted = this.config.trustedApps.some(pattern => {
      const p = pattern.toLowerCase();
      return processName.includes(p) || windowTitle.includes(p);
    });

    if (isTrusted) {
      return false;
    }

    // Check sensitive patterns
    return this.config.sensitiveAppPatterns.some(pattern => {
      const p = pattern.toLowerCase();
      return processName.includes(p) || windowTitle.includes(p);
    });
  }

  private isSensitiveUrl(): boolean {
    if (!this.currentContext.url) {
      return false;
    }

    return SENSITIVE_URL_PATTERNS.some(pattern => pattern.test(this.currentContext.url!));
  }

  private isSensitiveTitle(): boolean {
    if (!this.currentContext.windowTitle) {
      return false;
    }

    return SENSITIVE_TITLE_PATTERNS.some(pattern =>
      pattern.test(this.currentContext.windowTitle!)
    );
  }

  private isKeyboardEvent(event: InputEvent): boolean {
    return event.type === 'keydown' || event.type === 'keyup';
  }

  // ===========================================================================
  // Private Methods - Password Detection
  // ===========================================================================

  private trackKeystroke(event: InputEvent): void {
    if (!this.config.maskPotentialPasswords) {
      return;
    }

    const now = Date.now();
    const timeSinceLastKey = now - this.lastKeystrokeTime;

    // If there's a significant gap, reset the counter
    if (timeSinceLastKey > 2000) {
      this.consecutiveKeystrokes = 0;
    }

    // Don't count modifier keys or special keys
    if (!this.isModifierKey(event.keycode!) && !this.isNavigationKey(event.keycode!)) {
      this.consecutiveKeystrokes++;
    }

    this.lastKeystrokeTime = now;

    // After 6+ consecutive character keystrokes without navigation,
    // consider it potentially a password
    if (this.consecutiveKeystrokes >= 6) {
      this.potentialPasswordMode = true;
    }

    // Reset on Enter or Tab (form submission)
    if (event.keycode === 28 || event.keycode === 15) { // Enter or Tab
      this.resetPasswordDetection();
    }
  }

  private resetPasswordDetection(): void {
    this.consecutiveKeystrokes = 0;
    this.potentialPasswordMode = false;
    this.lastKeystrokeTime = 0;
  }

  private looksLikePasswordEntry(events: InputEvent[], startIndex: number): boolean {
    // Look for pattern: rapid keystrokes (not visible on screen) followed by Enter
    let charKeyCount = 0;
    let hasEnter = false;

    for (let i = startIndex; i < Math.min(startIndex + 30, events.length); i++) {
      const event = events[i];

      if (event.type !== 'keydown') continue;

      if (event.keycode === 28) { // Enter
        hasEnter = true;
        break;
      }

      // Count character keys (not modifiers or navigation)
      if (!this.isModifierKey(event.keycode!) && !this.isNavigationKey(event.keycode!)) {
        charKeyCount++;
      }
    }

    // Looks like password if: 6+ chars followed by Enter, within short window
    return charKeyCount >= 6 && hasEnter;
  }

  // ===========================================================================
  // Private Methods - Masking
  // ===========================================================================

  private maskKeyboardEvent(event: InputEvent): InputEvent {
    const maskedEvent = { ...event };

    // Keep modifier and special keys visible, mask regular characters
    if (!this.isModifierKey(event.keycode!) && !this.isSpecialKey(event.keycode!)) {
      maskedEvent.key = '•';
    }

    return maskedEvent;
  }

  private isModifierKey(keycode: number): boolean {
    // Ctrl, Shift, Alt, Meta/Cmd
    return [29, 42, 56, 125, 157, 54, 184, 126].includes(keycode);
  }

  private isSpecialKey(keycode: number): boolean {
    // Escape, Backspace, Tab, Enter, Space, arrows, function keys, etc.
    return [
      1, 14, 15, 28, 57, // Escape, Backspace, Tab, Enter, Space
      72, 80, 75, 77,    // Arrow keys
      71, 79, 73, 81,    // Home, End, PageUp, PageDown
      82, 83,            // Insert, Delete
      59, 60, 61, 62, 63, 64, 65, 66, 67, 68, 87, 88 // F1-F12
    ].includes(keycode);
  }

  private isNavigationKey(keycode: number): boolean {
    // Arrow keys, Home, End, Page Up/Down
    return [72, 80, 75, 77, 71, 79, 73, 81].includes(keycode);
  }
}

// =============================================================================
// Singleton Instance
// =============================================================================

let instance: InputPrivacyFilter | null = null;

export function getInputPrivacyFilter(config?: Partial<PrivacyConfig>): InputPrivacyFilter {
  if (!instance) {
    instance = new InputPrivacyFilter(config);
  }
  return instance;
}

export function resetInputPrivacyFilter(): void {
  instance = null;
}
