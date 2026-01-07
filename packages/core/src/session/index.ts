/**
 * Session Management Types and Interfaces
 *
 * Platform-agnostic session storage and management types.
 */

import type { eventWithTime } from '@rrweb/types';

/**
 * Privacy configuration for a recording session.
 */
export interface PrivacyConfig {
  /** Mask all input field values */
  maskAllInputs: boolean;
  /** Block elements with sensitive/pii classes */
  blockSensitiveElements: boolean;
  /** Mask PII text patterns (email, phone, SSN, credit card) */
  maskTextPatterns: boolean;
  /** Apply custom masking function */
  customMaskFn: boolean;
}

/**
 * Default privacy configuration.
 */
export const DEFAULT_PRIVACY_CONFIG: PrivacyConfig = {
  maskAllInputs: false,
  blockSensitiveElements: false,
  maskTextPatterns: false,
  customMaskFn: false,
};

/**
 * A recorded session with metadata and events.
 */
export interface SessionRecording {
  /** Unique session identifier */
  id: string;
  /** User-provided session name */
  name: string;
  /** Unix timestamp of when recording started */
  timestamp: number;
  /** Duration in milliseconds */
  duration: number;
  /** Number of recorded events */
  eventCount: number;
  /** The recorded rrweb events */
  events: eventWithTime[];
  /** Privacy settings used during recording */
  privacyConfig: PrivacyConfig;
}

/**
 * Application settings for the recorder.
 */
export interface AppSettings {
  /** Default privacy configuration for new recordings */
  defaultPrivacyConfig: PrivacyConfig;
  /** Maximum storage size in MB */
  maxStorageSize: number;
  /** Whether to auto-save recordings */
  autoSave: boolean;
  /** Sampling configuration for events */
  samplingConfig: {
    mousemove: boolean;
    mouseInteraction: boolean;
    scroll: number;
    input: string;
  };
}

/**
 * Default application settings.
 */
export const DEFAULT_APP_SETTINGS: AppSettings = {
  defaultPrivacyConfig: DEFAULT_PRIVACY_CONFIG,
  maxStorageSize: 50,
  autoSave: true,
  samplingConfig: {
    mousemove: true,
    mouseInteraction: true,
    scroll: 150,
    input: 'last',
  },
};

/**
 * Storage statistics for the session manager.
 */
export interface StorageStats {
  /** Used storage in MB */
  usedMB: number;
  /** Maximum storage in MB */
  maxMB: number;
  /** Number of stored sessions */
  sessionCount: number;
}

/**
 * Interface for platform-specific storage adapters.
 * Implement this interface for each platform (web, extension, desktop).
 */
export interface StorageAdapter {
  /** Get all stored sessions */
  getAllSessions(): Promise<SessionRecording[]>;
  /** Save a new session */
  saveSession(session: SessionRecording): Promise<boolean>;
  /** Delete a session by ID */
  deleteSession(id: string): Promise<void>;
  /** Delete all sessions */
  deleteAllSessions(): Promise<void>;
  /** Get a specific session by ID */
  getSession(id: string): Promise<SessionRecording | null>;
  /** Get storage statistics */
  getStorageStats(): Promise<StorageStats>;
  /** Get application settings */
  getSettings(): Promise<AppSettings>;
  /** Save application settings */
  saveSettings(settings: Partial<AppSettings>): Promise<void>;
}

/**
 * Generates a unique session ID.
 */
export function generateSessionId(): string {
  return `session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Calculates the approximate size of data in MB.
 */
export function calculateDataSizeMB(data: unknown): number {
  const str = JSON.stringify(data);
  const bytes = new Blob([str]).size;
  return bytes / (1024 * 1024);
}

/**
 * Formats duration in milliseconds to human-readable string.
 */
export function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  if (hours > 0) {
    return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
  }
  if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  }
  return `${seconds}s`;
}

/**
 * Creates a new session recording object.
 */
export function createSessionRecording(
  name: string,
  events: eventWithTime[],
  privacyConfig: PrivacyConfig,
  duration: number
): SessionRecording {
  return {
    id: generateSessionId(),
    name: name || `Recording ${new Date().toLocaleString()}`,
    timestamp: Date.now(),
    duration,
    eventCount: events.length,
    events,
    privacyConfig,
  };
}
