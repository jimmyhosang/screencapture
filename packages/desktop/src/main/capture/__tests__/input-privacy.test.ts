/**
 * Input Privacy Filter Tests
 *
 * Unit tests for the input privacy filtering system
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import {
  InputPrivacyFilter,
  getInputPrivacyFilter,
  resetInputPrivacyFilter,
  maskKeyboardEvents,
  removeKeyboardEvents,
  getInputSummary,
  SENSITIVE_PROCESS_NAMES,
  SENSITIVE_TITLE_PATTERNS,
  SENSITIVE_URL_PATTERNS
} from '../input-privacy';
import type { InputEvent } from '../input-types';

describe('InputPrivacyFilter', () => {
  let filter: InputPrivacyFilter;

  beforeEach(() => {
    filter = new InputPrivacyFilter();
  });

  afterEach(() => {
    resetInputPrivacyFilter();
  });

  describe('Constructor', () => {
    it('should create filter with default sensitive lists', () => {
      const config = filter.getConfig();
      expect(config.sensitiveProcessNames.length).toBeGreaterThan(0);
      expect(config.sensitiveTitlePatterns.length).toBeGreaterThan(0);
      expect(config.sensitiveUrlPatterns.length).toBeGreaterThan(0);
    });

    it('should accept custom config', () => {
      const customFilter = new InputPrivacyFilter({
        sensitiveProcessNames: ['myapp'],
        customPatterns: [/secret/i]
      });
      const config = customFilter.getConfig();
      expect(config.sensitiveProcessNames).toContain('myapp');
      expect(config.customPatterns).toHaveLength(1);
    });
  });

  describe('updateActiveWindow', () => {
    it('should update window info and check sensitivity', () => {
      filter.updateActiveWindow({
        processName: '1password',
        windowTitle: 'Login'
      });

      expect(filter.isSensitive()).toBe(true);
    });

    it('should detect non-sensitive context', () => {
      filter.updateActiveWindow({
        processName: 'code',
        windowTitle: 'VS Code - project'
      });

      expect(filter.isSensitive()).toBe(false);
    });
  });

  describe('checkSensitive', () => {
    describe('Process Name Detection', () => {
      it('should detect password managers', () => {
        const sensitiveProcesses = ['1password', 'bitwarden', 'lastpass', 'keepass'];

        for (const process of sensitiveProcesses) {
          expect(filter.checkSensitive({ processName: process })).toBe(true);
        }
      });

      it('should detect keychain/credential apps', () => {
        expect(filter.checkSensitive({ processName: 'keychain' })).toBe(true);
        expect(filter.checkSensitive({ processName: 'gnome-keyring' })).toBe(true);
        expect(filter.checkSensitive({ processName: 'credentials' })).toBe(true);
      });

      it('should detect SSH/GPG tools', () => {
        expect(filter.checkSensitive({ processName: 'ssh-agent' })).toBe(true);
        expect(filter.checkSensitive({ processName: 'gpg' })).toBe(true);
        expect(filter.checkSensitive({ processName: 'pinentry' })).toBe(true);
      });

      it('should be case-insensitive', () => {
        expect(filter.checkSensitive({ processName: '1Password' })).toBe(true);
        expect(filter.checkSensitive({ processName: 'BITWARDEN' })).toBe(true);
      });

      it('should match partial process names', () => {
        expect(filter.checkSensitive({ processName: 'Bitwarden-Helper' })).toBe(true);
      });
    });

    describe('Window Title Detection', () => {
      it('should detect password-related titles', () => {
        const sensitiveTitles = [
          'Enter Password',
          'Master Password Required',
          'Passwort eingeben',
          'Contraseña'
        ];

        for (const title of sensitiveTitles) {
          expect(filter.checkSensitive({ windowTitle: title })).toBe(true);
        }
      });

      it('should detect login/sign-in titles', () => {
        expect(filter.checkSensitive({ windowTitle: 'Sign In' })).toBe(true);
        expect(filter.checkSensitive({ windowTitle: 'Log In to Account' })).toBe(true);
        expect(filter.checkSensitive({ windowTitle: 'Login Required' })).toBe(true);
      });

      it('should detect 2FA/OTP titles', () => {
        expect(filter.checkSensitive({ windowTitle: 'Two-Factor Authentication' })).toBe(true);
        expect(filter.checkSensitive({ windowTitle: 'Enter 2FA Code' })).toBe(true);
        expect(filter.checkSensitive({ windowTitle: 'OTP Verification' })).toBe(true);
      });

      it('should detect banking titles', () => {
        expect(filter.checkSensitive({ windowTitle: 'Bank of America' })).toBe(true);
        expect(filter.checkSensitive({ windowTitle: 'Online Banking' })).toBe(true);
      });

      it('should detect sudo/su titles', () => {
        expect(filter.checkSensitive({ windowTitle: '[sudo] password' })).toBe(true);
        expect(filter.checkSensitive({ windowTitle: 'su - root' })).toBe(true);
      });
    });

    describe('URL Detection', () => {
      it('should detect banking URLs', () => {
        expect(filter.checkSensitive({ url: 'https://www.bankofamerica.com' })).toBe(true);
        expect(filter.checkSensitive({ url: 'https://online.banking.example.com' })).toBe(true);
      });

      it('should detect login URLs', () => {
        expect(filter.checkSensitive({ url: 'https://login.example.com' })).toBe(true);
        expect(filter.checkSensitive({ url: 'https://example.com/signin' })).toBe(true);
        expect(filter.checkSensitive({ url: 'https://example.com/sign-in' })).toBe(true);
      });

      it('should detect OAuth URLs', () => {
        expect(filter.checkSensitive({ url: 'https://accounts.google.com/oauth' })).toBe(true);
        expect(filter.checkSensitive({ url: 'https://auth.example.com' })).toBe(true);
      });

      it('should detect identity provider URLs', () => {
        expect(filter.checkSensitive({ url: 'https://accounts.google.com' })).toBe(true);
        expect(filter.checkSensitive({ url: 'https://appleid.apple.com' })).toBe(true);
        expect(filter.checkSensitive({ url: 'https://login.microsoft.com' })).toBe(true);
      });
    });

    describe('Combined Detection', () => {
      it('should detect sensitive context from any source', () => {
        // Process only
        expect(filter.checkSensitive({ processName: '1password' })).toBe(true);

        // Title only
        expect(filter.checkSensitive({ windowTitle: 'Enter Password' })).toBe(true);

        // URL only
        expect(filter.checkSensitive({ url: 'https://login.example.com' })).toBe(true);

        // Non-sensitive
        expect(filter.checkSensitive({
          processName: 'code',
          windowTitle: 'VS Code',
          url: 'https://github.com'
        })).toBe(false);
      });
    });
  });

  describe('filterEvent', () => {
    it('should pass through events in non-sensitive context', () => {
      filter.updateActiveWindow({ processName: 'code' });

      const event: InputEvent = {
        timestamp: 1000,
        type: 'keydown',
        keycode: 30,
        key: 'A'
      };

      expect(filter.filterEvent(event)).toEqual(event);
    });

    it('should filter keyboard events in sensitive context', () => {
      filter.updateActiveWindow({ processName: '1password' });

      const keydown: InputEvent = { timestamp: 1000, type: 'keydown', key: 'A' };
      const keyup: InputEvent = { timestamp: 1001, type: 'keyup', key: 'A' };

      expect(filter.filterEvent(keydown)).toBeNull();
      expect(filter.filterEvent(keyup)).toBeNull();
    });

    it('should keep mouse events in sensitive context', () => {
      filter.updateActiveWindow({ processName: '1password' });

      const click: InputEvent = { timestamp: 1000, type: 'click', x: 100, y: 200 };
      const move: InputEvent = { timestamp: 1001, type: 'mousemove', x: 150, y: 250 };
      const scroll: InputEvent = { timestamp: 1002, type: 'scroll', x: 100, y: 200, scrollDelta: { x: 0, y: 10 } };

      expect(filter.filterEvent(click)).toEqual(click);
      expect(filter.filterEvent(move)).toEqual(move);
      expect(filter.filterEvent(scroll)).toEqual(scroll);
    });
  });

  describe('filterEvents', () => {
    it('should filter batch of events', () => {
      filter.updateActiveWindow({ processName: '1password' });

      const events: InputEvent[] = [
        { timestamp: 1000, type: 'keydown', key: 'A' },
        { timestamp: 1001, type: 'click', x: 100, y: 200 },
        { timestamp: 1002, type: 'keyup', key: 'A' },
        { timestamp: 1003, type: 'scroll', x: 100, y: 200, scrollDelta: { x: 0, y: 10 } }
      ];

      const filtered = filter.filterEvents(events);

      // Keyboard events filtered, mouse events kept
      expect(filtered).toHaveLength(2);
      expect(filtered[0].type).toBe('click');
      expect(filtered[1].type).toBe('scroll');
    });
  });

  describe('addSensitivePattern', () => {
    it('should add custom pattern', () => {
      filter.addSensitivePattern(/confidential/i);

      expect(filter.checkSensitive({ windowTitle: 'Confidential Document' })).toBe(true);
    });
  });

  describe('addSensitiveProcess', () => {
    it('should add custom process name', () => {
      filter.addSensitiveProcess('mySecretApp');

      expect(filter.checkSensitive({ processName: 'mySecretApp' })).toBe(true);
    });

    it('should not add duplicates', () => {
      const initialCount = filter.getConfig().sensitiveProcessNames.length;
      filter.addSensitiveProcess('1password');
      filter.addSensitiveProcess('1password');

      expect(filter.getConfig().sensitiveProcessNames.length).toBe(initialCount);
    });
  });

  describe('whitelistProcess', () => {
    it('should remove process from sensitive list', () => {
      filter.whitelistProcess('1password');

      expect(filter.checkSensitive({ processName: '1password' })).toBe(false);
    });
  });
});

describe('Utility Functions', () => {
  describe('maskKeyboardEvents', () => {
    it('should mask regular character keys', () => {
      const events: InputEvent[] = [
        { timestamp: 1000, type: 'keydown', key: 'A' },
        { timestamp: 1001, type: 'keydown', key: 'B' },
        { timestamp: 1002, type: 'keyup', key: 'A' }
      ];

      const masked = maskKeyboardEvents(events);

      expect(masked[0].key).toBe('•');
      expect(masked[1].key).toBe('•');
      expect(masked[2].key).toBe('•');
    });

    it('should preserve special keys', () => {
      const specialKeys = ['Escape', 'Enter', 'Backspace', 'Tab', 'Space'];

      for (const key of specialKeys) {
        const events: InputEvent[] = [
          { timestamp: 1000, type: 'keydown', key }
        ];

        const masked = maskKeyboardEvents(events);
        expect(masked[0].key).toBe(key);
      }
    });

    it('should preserve modifier keys', () => {
      const modifiers = ['LeftCtrl', 'RightCtrl', 'LeftShift', 'RightShift', 'LeftAlt', 'RightAlt'];

      for (const key of modifiers) {
        const events: InputEvent[] = [
          { timestamp: 1000, type: 'keydown', key }
        ];

        const masked = maskKeyboardEvents(events);
        expect(masked[0].key).toBe(key);
      }
    });

    it('should preserve function keys', () => {
      const fKeys = ['F1', 'F2', 'F3', 'F10', 'F11', 'F12'];

      for (const key of fKeys) {
        const events: InputEvent[] = [
          { timestamp: 1000, type: 'keydown', key }
        ];

        const masked = maskKeyboardEvents(events);
        expect(masked[0].key).toBe(key);
      }
    });

    it('should preserve navigation keys', () => {
      const navKeys = ['Up', 'Down', 'Left', 'Right', 'Home', 'End', 'PageUp', 'PageDown'];

      for (const key of navKeys) {
        const events: InputEvent[] = [
          { timestamp: 1000, type: 'keydown', key }
        ];

        const masked = maskKeyboardEvents(events);
        expect(masked[0].key).toBe(key);
      }
    });

    it('should not affect non-keyboard events', () => {
      const events: InputEvent[] = [
        { timestamp: 1000, type: 'click', x: 100, y: 200 },
        { timestamp: 1001, type: 'scroll', x: 100, y: 200, scrollDelta: { x: 0, y: 10 } }
      ];

      const masked = maskKeyboardEvents(events);
      expect(masked).toEqual(events);
    });
  });

  describe('removeKeyboardEvents', () => {
    it('should remove all keyboard events', () => {
      const events: InputEvent[] = [
        { timestamp: 1000, type: 'keydown', key: 'A' },
        { timestamp: 1001, type: 'click', x: 100, y: 200 },
        { timestamp: 1002, type: 'keyup', key: 'A' },
        { timestamp: 1003, type: 'scroll', x: 100, y: 200, scrollDelta: { x: 0, y: 10 } }
      ];

      const filtered = removeKeyboardEvents(events);

      expect(filtered).toHaveLength(2);
      expect(filtered[0].type).toBe('click');
      expect(filtered[1].type).toBe('scroll');
    });
  });

  describe('getInputSummary', () => {
    it('should calculate event summary', () => {
      const events: InputEvent[] = [
        { timestamp: 0, type: 'click', x: 100, y: 200 },
        { timestamp: 100, type: 'click', x: 150, y: 250 },
        { timestamp: 200, type: 'keydown', key: 'A' },
        { timestamp: 300, type: 'keydown', key: 'B' },
        { timestamp: 400, type: 'keydown', key: 'C' },
        { timestamp: 500, type: 'scroll', x: 100, y: 200, scrollDelta: { x: 0, y: 10 } },
        { timestamp: 1000, type: 'mousemove', x: 200, y: 300 }
      ];

      const summary = getInputSummary(events);

      expect(summary.totalEvents).toBe(7);
      expect(summary.clicks).toBe(2);
      expect(summary.keystrokes).toBe(3);
      expect(summary.scrolls).toBe(1);
      expect(summary.mouseMoves).toBe(1);
      expect(summary.duration).toBe(1000);
    });

    it('should handle empty events', () => {
      const summary = getInputSummary([]);

      expect(summary.totalEvents).toBe(0);
      expect(summary.clicks).toBe(0);
      expect(summary.keystrokes).toBe(0);
      expect(summary.duration).toBe(-Infinity); // edge case when no events
    });
  });
});

describe('Default Sensitive Lists', () => {
  it('should include common password managers', () => {
    const passwordManagers = ['1password', 'bitwarden', 'lastpass', 'keepass', 'dashlane'];
    for (const pm of passwordManagers) {
      expect(SENSITIVE_PROCESS_NAMES.map(n => n.toLowerCase())).toContain(pm.toLowerCase());
    }
  });

  it('should include authentication patterns', () => {
    const testCases = [
      { pattern: 'password', text: 'Enter Password' },
      { pattern: 'sign in', text: 'Sign In' },
      { pattern: 'login', text: 'Login Required' },
      { pattern: '2fa', text: 'Enter 2FA Code' }
    ];

    for (const { text } of testCases) {
      const matches = SENSITIVE_TITLE_PATTERNS.some(p => p.test(text));
      expect(matches).toBe(true);
    }
  });

  it('should include common login URLs', () => {
    const testUrls = [
      'https://login.example.com',
      'https://example.com/signin',
      'https://accounts.google.com',
      'https://bank.example.com'
    ];

    for (const url of testUrls) {
      const matches = SENSITIVE_URL_PATTERNS.some(p => p.test(url));
      expect(matches).toBe(true);
    }
  });
});

describe('Singleton Pattern', () => {
  beforeEach(() => {
    resetInputPrivacyFilter();
  });

  it('should return same instance', () => {
    const f1 = getInputPrivacyFilter();
    const f2 = getInputPrivacyFilter();
    expect(f1).toBe(f2);
  });

  it('should create new instance after reset', () => {
    const f1 = getInputPrivacyFilter();
    resetInputPrivacyFilter();
    const f2 = getInputPrivacyFilter();
    expect(f1).not.toBe(f2);
  });
});
