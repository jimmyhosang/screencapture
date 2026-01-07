import type { eventWithTime } from '@rrweb/types';
import type { RedactionConfig } from '@screencapture/core';

/**
 * Recording state
 */
export type RecordingState = 'idle' | 'recording' | 'paused';

/**
 * Session metadata stored in chrome.storage
 */
export interface SessionMetadata {
  id: string;
  name: string;
  url: string;
  timestamp: number;
  duration: number;
  eventCount: number;
  privacyConfig: PrivacySettings;
}

/**
 * Full session with events
 */
export interface Session extends SessionMetadata {
  events: eventWithTime[];
}

/**
 * Privacy settings for recording
 */
export interface PrivacySettings {
  maskAllInputs: boolean;
  maskTextContent: boolean;
  blockSelectors: string[];
  redactionConfig: RedactionConfig;
}

/**
 * Default privacy settings
 */
export const DEFAULT_PRIVACY_SETTINGS: PrivacySettings = {
  maskAllInputs: true,
  maskTextContent: true,
  blockSelectors: ['.do-not-record', '[data-private]', '.sensitive', '.pii'],
  redactionConfig: {
    email: true,
    phone: true,
    ssn: true,
    creditCard: true,
  },
};

/**
 * Extension settings stored in chrome.storage.sync
 */
export interface ExtensionSettings {
  privacySettings: PrivacySettings;
  autoSave: boolean;
  maxStorageMB: number;
}

/**
 * Default extension settings
 */
export const DEFAULT_EXTENSION_SETTINGS: ExtensionSettings = {
  privacySettings: DEFAULT_PRIVACY_SETTINGS,
  autoSave: true,
  maxStorageMB: 50,
};

/**
 * Messages between popup/content/background
 */
export type MessageType =
  | 'START_RECORDING'
  | 'STOP_RECORDING'
  | 'PAUSE_RECORDING'
  | 'RESUME_RECORDING'
  | 'GET_STATE'
  | 'STATE_UPDATE'
  | 'RECORDING_EVENT'
  | 'SAVE_SESSION'
  | 'GET_SESSIONS'
  | 'DELETE_SESSION'
  | 'EXPORT_SESSION';

export interface Message<T = unknown> {
  type: MessageType;
  payload?: T;
}

export interface StateUpdatePayload {
  state: RecordingState;
  tabId: number;
  eventCount: number;
  startTime?: number;
  url?: string;
}

export interface StartRecordingPayload {
  settings?: Partial<PrivacySettings>;
}

export interface RecordingEventPayload {
  event: eventWithTime;
  tabId: number;
}

export interface SaveSessionPayload {
  name: string;
}

export interface SessionsPayload {
  sessions: SessionMetadata[];
}
