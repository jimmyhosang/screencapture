/**
 * Input Privacy Filter Tests
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  InputPrivacyFilter,
  DEFAULT_PRIVACY_CONFIG,
  getInputPrivacyFilter,
  resetInputPrivacyFilter
} from '../input-privacy-filter';
import type { InputEvent } from '../input-types';

describe('InputPrivacyFilter', () => {
  let filter: InputPrivacyFilter;

  beforeEach(() => {
    resetInputPrivacyFilter();
    filter = new InputPrivacyFilter();
  });

  describe('Window Context Detection', () => {
    it('should detect sensitive password manager apps', () => {
      filter.setWindowContext({
        processName: '1Password 7',
        windowTitle: '1Password - Vault'
      });

      const decision = filter.getPrivacyDecision();
      expect(decision.shouldMaskKeyboard).toBe(true);
      expect(decision.reason).toContain('Sensitive application');
    });

    it('should detect banking applications', () => {
      filter.setWindowContext({
        processName: 'Chrome',
        windowTitle: 'Chase Bank - Online Banking'
      });

      const decision = filter.getPrivacyDecision();
      expect(decision.shouldMaskKeyboard).toBe(true);
    });

    it('should allow trusted apps without masking in full mode', () => {
      filter.setConfig({ keyboardMode: 'full' });
      filter.setWindowContext({
        processName: 'Code',
        windowTitle: 'Visual Studio Code'
      });

      const decision = filter.getPrivacyDecision();
      expect(decision.shouldCapture).toBe(true);
      expect(decision.shouldMaskKeyboard).toBe(false);
    });

    it('should detect sensitive URLs', () => {
      filter.setConfig({ keyboardMode: 'full' });
      filter.setWindowContext({
        processName: 'firefox',
        windowTitle: 'Login - Example',
        url: 'https://example.com/login'
      });

      const decision = filter.getPrivacyDecision();
      expect(decision.shouldMaskKeyboard).toBe(true);
      expect(decision.reason).toContain('Sensitive URL');
    });

    it('should detect sensitive window titles', () => {
      filter.setConfig({ keyboardMode: 'full' });
      filter.setWindowContext({
        processName: 'Safari',
        windowTitle: 'Enter your password'
      });

      const decision = filter.getPrivacyDecision();
      expect(decision.shouldMaskKeyboard).toBe(true);
    });
  });

  describe('Event Filtering', () => {
    it('should mask keyboard events in sensitive context', () => {
      filter.setWindowContext({
        processName: 'Bitwarden',
        windowTitle: 'Bitwarden'
      });

      const event: InputEvent = {
        timestamp: 1000,
        type: 'keydown',
        keycode: 30, // A key
        key: 'A'
      };

      const filtered = filter.filterEvent(event);
      expect(filtered).not.toBeNull();
      expect(filtered!.key).toBe('•');
    });

    it('should preserve modifier keys when masking', () => {
      filter.setWindowContext({
        processName: 'LastPass',
        windowTitle: 'LastPass'
      });

      const event: InputEvent = {
        timestamp: 1000,
        type: 'keydown',
        keycode: 29, // Ctrl
        key: 'Control'
      };

      const filtered = filter.filterEvent(event);
      expect(filtered!.key).toBe('Control');
    });

    it('should preserve special keys when masking', () => {
      filter.setWindowContext({
        processName: '1Password',
        windowTitle: '1Password'
      });

      const event: InputEvent = {
        timestamp: 1000,
        type: 'keydown',
        keycode: 28, // Enter
        key: 'Enter'
      };

      const filtered = filter.filterEvent(event);
      expect(filtered!.key).toBe('Enter');
    });

    it('should not filter mouse events', () => {
      filter.setWindowContext({
        processName: 'Bank App',
        windowTitle: 'Banking'
      });

      const event: InputEvent = {
        timestamp: 1000,
        type: 'click',
        x: 100,
        y: 200,
        button: 1
      };

      const filtered = filter.filterEvent(event);
      expect(filtered).toEqual(event);
    });

    it('should not capture keyboard for excluded apps', () => {
      filter.addExcludedApp('secretapp');
      filter.setWindowContext({
        processName: 'SecretApp',
        windowTitle: 'My Secret App'
      });

      const event: InputEvent = {
        timestamp: 1000,
        type: 'keydown',
        keycode: 30,
        key: 'A'
      };

      const filtered = filter.filterEvent(event);
      expect(filtered).toBeNull();
    });
  });

  describe('Batch Filtering', () => {
    it('should filter a batch of events', () => {
      filter.setWindowContext({
        processName: 'DashLane',
        windowTitle: 'Dashlane'
      });

      const events: InputEvent[] = [
        { timestamp: 1000, type: 'keydown', keycode: 30, key: 'A' },
        { timestamp: 1100, type: 'keydown', keycode: 31, key: 'S' },
        { timestamp: 1200, type: 'click', x: 100, y: 200, button: 1 }
      ];

      const filtered = filter.filterEvents(events);

      expect(filtered).toHaveLength(3);
      expect(filtered[0].key).toBe('•');
      expect(filtered[1].key).toBe('•');
      expect(filtered[2]).toEqual(events[2]); // Click unchanged
    });
  });

  describe('Post-Capture Redaction', () => {
    it('should redact password-like sequences', () => {
      filter.setConfig({ redactAfterCapture: true });

      // Simulate password entry: 6+ chars followed by Enter
      const events: InputEvent[] = [
        { timestamp: 100, type: 'keydown', keycode: 30, key: 'p' },
        { timestamp: 150, type: 'keydown', keycode: 31, key: 'a' },
        { timestamp: 200, type: 'keydown', keycode: 32, key: 's' },
        { timestamp: 250, type: 'keydown', keycode: 33, key: 's' },
        { timestamp: 300, type: 'keydown', keycode: 34, key: 'w' },
        { timestamp: 350, type: 'keydown', keycode: 35, key: 'o' },
        { timestamp: 400, type: 'keydown', keycode: 36, key: 'r' },
        { timestamp: 450, type: 'keydown', keycode: 37, key: 'd' },
        { timestamp: 500, type: 'keydown', keycode: 28, key: 'Enter' }
      ];

      const redacted = filter.redactEvents(events);

      // All character keys should be masked, Enter preserved
      expect(redacted[0].key).toBe('•');
      expect(redacted[7].key).toBe('•');
      expect(redacted[8].key).toBe('Enter');
    });
  });

  describe('Configuration', () => {
    it('should allow disabling privacy filter', () => {
      filter.setConfig({ enabled: false });
      filter.setWindowContext({
        processName: '1Password',
        windowTitle: '1Password'
      });

      const decision = filter.getPrivacyDecision();
      expect(decision.shouldCapture).toBe(true);
      expect(decision.shouldMaskKeyboard).toBe(false);
    });

    it('should support adding sensitive apps', () => {
      filter.setConfig({ keyboardMode: 'full' });
      filter.addSensitiveApp('myinternalapp');
      filter.setWindowContext({
        processName: 'MyInternalApp',
        windowTitle: 'Internal'
      });

      const decision = filter.getPrivacyDecision();
      expect(decision.shouldMaskKeyboard).toBe(true);
    });

    it('should support adding trusted apps', () => {
      filter.addTrustedApp('bankviewer');
      filter.setWindowContext({
        processName: 'BankViewer',
        windowTitle: 'View Bank Statements'
      });

      // Even though "bank" is in sensitive list, trustedApp overrides
      filter.setConfig({ keyboardMode: 'full' });
      const decision = filter.getPrivacyDecision();
      expect(decision.shouldMaskKeyboard).toBe(false);
    });

    it('should return current config', () => {
      const config = filter.getConfig();
      expect(config.enabled).toBe(DEFAULT_PRIVACY_CONFIG.enabled);
      expect(config.sensitiveAppPatterns).toContain('1password');
    });
  });

  describe('Singleton', () => {
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
});
