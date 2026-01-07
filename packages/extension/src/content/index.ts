import * as rrweb from 'rrweb';
import type { eventWithTime } from '@rrweb/types';
import { redactWithConfig } from '@screencapture/core';
import type { Message, StartRecordingPayload, PrivacySettings } from '../types';

/**
 * Content script state
 */
let stopRecording: (() => void) | null = null;
let isRecording = false;

/**
 * Get current tab ID from the background script
 */
async function getCurrentTabId(): Promise<number> {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ type: 'GET_STATE' }, (response) => {
      resolve(response?.tabId || 0);
    });
  });
}

/**
 * Send recorded event to background script
 */
async function sendEvent(event: eventWithTime, tabId: number): Promise<void> {
  try {
    await chrome.runtime.sendMessage({
      type: 'RECORDING_EVENT',
      payload: { event, tabId },
    });
  } catch (error) {
    // Background might be restarting
    console.warn('Failed to send event:', error);
  }
}

/**
 * Create text masking function with PII redaction
 */
function createMaskTextFn(settings: PrivacySettings) {
  return (text: string): string => {
    if (!settings.maskTextContent) {
      return text;
    }
    return redactWithConfig(text, settings.redactionConfig);
  };
}

/**
 * Create block class regex from selectors
 */
function createBlockClassRegex(selectors: string[]): RegExp | undefined {
  const classSelectors = selectors
    .filter((s) => s.startsWith('.'))
    .map((s) => s.slice(1).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));

  if (classSelectors.length === 0) {
    return undefined;
  }

  return new RegExp(classSelectors.join('|'));
}

/**
 * Start recording the page
 */
async function startRecording(settings: PrivacySettings): Promise<void> {
  if (isRecording) {
    console.warn('Recording already in progress');
    return;
  }

  const tabId = await getCurrentTabId();
  if (!tabId) {
    console.error('Could not get tab ID');
    return;
  }

  isRecording = true;

  const maskTextFn = createMaskTextFn(settings);
  const blockClass = createBlockClassRegex(settings.blockSelectors);
  const blockSelector = settings.blockSelectors.length > 0
    ? settings.blockSelectors.join(', ')
    : undefined;

  stopRecording = rrweb.record({
    emit(event) {
      // Send each event to background script
      sendEvent(event, tabId);
    },
    // Privacy settings
    maskAllInputs: settings.maskAllInputs,
    blockClass,
    blockSelector,
    maskTextFn,
    // Recording options
    inlineStylesheet: true,
    recordCanvas: true,
    sampling: {
      mousemove: true,
      mouseInteraction: true,
      scroll: 150,
      input: 'last',
    },
  }) ?? null;

  console.log('Screencapture: Recording started');

  // Visual indicator
  showRecordingIndicator();
}

/**
 * Stop recording
 */
function stopRecordingSession(): void {
  if (stopRecording) {
    stopRecording();
    stopRecording = null;
  }
  isRecording = false;

  hideRecordingIndicator();
  console.log('Screencapture: Recording stopped');
}

/**
 * Recording indicator element
 */
let indicatorElement: HTMLElement | null = null;

/**
 * Show visual recording indicator
 */
function showRecordingIndicator(): void {
  if (indicatorElement) return;

  indicatorElement = document.createElement('div');
  indicatorElement.id = 'screencapture-indicator';
  indicatorElement.innerHTML = `
    <style>
      #screencapture-indicator {
        position: fixed;
        top: 10px;
        right: 10px;
        z-index: 2147483647;
        background: rgba(220, 38, 38, 0.9);
        color: white;
        padding: 8px 16px;
        border-radius: 20px;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        font-size: 12px;
        font-weight: 500;
        display: flex;
        align-items: center;
        gap: 8px;
        box-shadow: 0 2px 10px rgba(0, 0, 0, 0.2);
        pointer-events: none;
        animation: screencapture-pulse 2s infinite;
      }
      #screencapture-indicator::before {
        content: '';
        width: 8px;
        height: 8px;
        background: white;
        border-radius: 50%;
        animation: screencapture-blink 1s infinite;
      }
      @keyframes screencapture-pulse {
        0%, 100% { opacity: 1; }
        50% { opacity: 0.8; }
      }
      @keyframes screencapture-blink {
        0%, 100% { opacity: 1; }
        50% { opacity: 0.5; }
      }
    </style>
    Recording
  `;

  document.body.appendChild(indicatorElement);
}

/**
 * Hide visual recording indicator
 */
function hideRecordingIndicator(): void {
  if (indicatorElement) {
    indicatorElement.remove();
    indicatorElement = null;
  }
}

/**
 * Listen for messages from background script
 */
chrome.runtime.onMessage.addListener((message: Message, _sender, sendResponse) => {
  switch (message.type) {
    case 'START_RECORDING': {
      const payload = message.payload as StartRecordingPayload;
      const settings = payload?.settings || {
        maskAllInputs: true,
        maskTextContent: true,
        blockSelectors: [],
        redactionConfig: {
          email: true,
          phone: true,
          ssn: true,
          creditCard: true,
        },
      };
      startRecording(settings as PrivacySettings);
      sendResponse({ success: true });
      break;
    }

    case 'STOP_RECORDING':
      stopRecordingSession();
      sendResponse({ success: true });
      break;

    case 'GET_STATE':
      sendResponse({ isRecording });
      break;

    default:
      sendResponse({ error: 'Unknown message type' });
  }

  return true;
});

/**
 * Clean up on page unload
 */
window.addEventListener('beforeunload', () => {
  if (isRecording) {
    stopRecordingSession();
  }
});

console.log('Screencapture content script loaded');
