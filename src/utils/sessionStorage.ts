/**
 * Session Storage Utilities
 *
 * This module provides functions for saving, loading, and managing
 * recorded sessions with localStorage compression.
 */

import type { eventWithTime } from '@rrweb/types';
import LZString from 'lz-string';
import type { RedactionConfig } from './redactor';

const STORAGE_KEY_PREFIX = 'rrweb_session_';
const SESSION_INDEX_KEY = 'rrweb_session_index';
const STORAGE_SETTINGS_KEY = 'rrweb_storage_settings';

// =============================================================================
// Storage Policy Types
// =============================================================================

/**
 * Configuration for session storage policies.
 */
export interface StorageSettings {
  /** Maximum number of sessions to keep (0 = unlimited) */
  maxSessions: number;
  /** Number of days to retain sessions (0 = unlimited) */
  retentionDays: number;
  /** Whether to auto-save sessions when recording stops */
  autoSave: boolean;
  /** Minimum session duration in ms to save (filters out very short recordings) */
  minDurationMs: number;
  /** Minimum number of events required to save */
  minEvents: number;
}

/**
 * Default storage settings.
 */
export const DEFAULT_STORAGE_SETTINGS: StorageSettings = {
  maxSessions: 50,
  retentionDays: 30,
  autoSave: true,
  minDurationMs: 1000,
  minEvents: 5,
};

/**
 * Result of a cleanup operation.
 */
export interface CleanupResult {
  /** Number of sessions deleted */
  deletedCount: number;
  /** IDs of deleted sessions */
  deletedIds: string[];
  /** Reason for each deletion */
  reasons: Record<string, 'expired' | 'overflow' | 'manual'>;
}

/**
 * Metadata about the recording environment.
 */
export interface SessionMetadata {
  /** URL where the session was recorded */
  url: string;
  /** User agent string */
  userAgent: string;
  /** Viewport dimensions at recording start */
  viewport: {
    width: number;
    height: number;
  };
}

/**
 * A complete recorded session with all associated data.
 */
export interface RecordedSession {
  /** Unique identifier (UUID) */
  id: string;
  /** The recorded rrweb events */
  events: eventWithTime[];
  /** Timestamp when recording started */
  startTime: number;
  /** Timestamp when recording ended */
  endTime: number;
  /** Duration in milliseconds */
  duration: number;
  /** Recording environment metadata */
  metadata: SessionMetadata;
  /** Privacy settings used during recording */
  redactionConfig: RedactionConfig;
}

/**
 * Lightweight session summary for listing purposes.
 */
export interface SessionSummary {
  /** Unique identifier */
  id: string;
  /** Formatted date string */
  date: string;
  /** Duration in milliseconds */
  duration: number;
  /** Number of events in the session */
  eventCount: number;
  /** URL where recorded (truncated) */
  url: string;
}

/**
 * Result of an import operation.
 */
export interface ImportResult {
  success: boolean;
  session?: RecordedSession;
  error?: string;
}

/**
 * Generates a UUID v4.
 */
function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Gets the session index from localStorage.
 */
function getSessionIndex(): string[] {
  try {
    const index = localStorage.getItem(SESSION_INDEX_KEY);
    return index ? JSON.parse(index) : [];
  } catch {
    return [];
  }
}

/**
 * Saves the session index to localStorage.
 */
function saveSessionIndex(index: string[]): void {
  localStorage.setItem(SESSION_INDEX_KEY, JSON.stringify(index));
}

/**
 * Creates a new session object from recorded events.
 *
 * @param events - The recorded rrweb events
 * @param redactionConfig - The privacy settings used during recording
 * @returns A complete RecordedSession object
 *
 * @example
 * ```typescript
 * const session = createSession(events, { email: true, phone: true, ssn: true, creditCard: true });
 * saveSession(session);
 * ```
 */
export function createSession(
  events: eventWithTime[],
  redactionConfig: RedactionConfig
): RecordedSession {
  const startTime = events[0]?.timestamp || Date.now();
  const endTime = events[events.length - 1]?.timestamp || Date.now();

  return {
    id: generateUUID(),
    events,
    startTime,
    endTime,
    duration: endTime - startTime,
    metadata: {
      url: typeof window !== 'undefined' ? window.location.href : '',
      userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : '',
      viewport: {
        width: typeof window !== 'undefined' ? window.innerWidth : 0,
        height: typeof window !== 'undefined' ? window.innerHeight : 0,
      },
    },
    redactionConfig,
  };
}

/**
 * Saves a session to localStorage with compression.
 *
 * @param session - The session to save
 * @throws Error if localStorage is full or unavailable
 *
 * @example
 * ```typescript
 * const session = createSession(events, redactionConfig);
 * saveSession(session);
 * ```
 */
export function saveSession(session: RecordedSession): void {
  const key = STORAGE_KEY_PREFIX + session.id;

  // Compress the session data
  const compressed = LZString.compressToUTF16(JSON.stringify(session));

  try {
    localStorage.setItem(key, compressed);

    // Update the index
    const index = getSessionIndex();
    if (!index.includes(session.id)) {
      index.unshift(session.id); // Add to beginning (newest first)
      saveSessionIndex(index);
    }
  } catch (error) {
    if (error instanceof Error && error.name === 'QuotaExceededError') {
      throw new Error('Storage quota exceeded. Please delete some sessions to free up space.');
    }
    throw error;
  }
}

/**
 * Loads a session from localStorage by ID.
 *
 * @param id - The session ID to load
 * @returns The session if found, null otherwise
 *
 * @example
 * ```typescript
 * const session = loadSession('abc123');
 * if (session) {
 *   console.log(`Loaded session with ${session.events.length} events`);
 * }
 * ```
 */
export function loadSession(id: string): RecordedSession | null {
  const key = STORAGE_KEY_PREFIX + id;

  try {
    const compressed = localStorage.getItem(key);
    if (!compressed) return null;

    const decompressed = LZString.decompressFromUTF16(compressed);
    if (!decompressed) return null;

    return JSON.parse(decompressed) as RecordedSession;
  } catch {
    return null;
  }
}

/**
 * Lists all saved sessions with summary information.
 *
 * @returns Array of session summaries, sorted newest first
 *
 * @example
 * ```typescript
 * const sessions = listSessions();
 * sessions.forEach(s => console.log(`${s.date}: ${s.duration}ms`));
 * ```
 */
export function listSessions(): SessionSummary[] {
  const index = getSessionIndex();
  const summaries: SessionSummary[] = [];

  for (const id of index) {
    const session = loadSession(id);
    if (session) {
      summaries.push({
        id: session.id,
        date: new Date(session.startTime).toLocaleString(),
        duration: session.duration,
        eventCount: session.events.length,
        url: truncateUrl(session.metadata.url, 50),
      });
    }
  }

  return summaries;
}

/**
 * Truncates a URL for display purposes.
 */
function truncateUrl(url: string, maxLength: number): string {
  if (url.length <= maxLength) return url;
  return url.slice(0, maxLength - 3) + '...';
}

/**
 * Deletes a session from localStorage.
 *
 * @param id - The session ID to delete
 *
 * @example
 * ```typescript
 * deleteSession('abc123');
 * ```
 */
export function deleteSession(id: string): void {
  const key = STORAGE_KEY_PREFIX + id;
  localStorage.removeItem(key);

  // Update the index
  const index = getSessionIndex();
  const newIndex = index.filter((sessionId) => sessionId !== id);
  saveSessionIndex(newIndex);
}

/**
 * Exports a session as a downloadable JSON file.
 *
 * @param id - The session ID to export
 * @throws Error if session not found
 *
 * @example
 * ```typescript
 * exportSession('abc123'); // Downloads 'rrweb-session-abc123.json'
 * ```
 */
export function exportSession(id: string): void {
  const session = loadSession(id);
  if (!session) {
    throw new Error(`Session not found: ${id}`);
  }

  const json = JSON.stringify(session, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;
  a.download = `rrweb-session-${id.slice(0, 8)}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Validates the structure of an imported session.
 */
function validateSession(data: unknown): data is RecordedSession {
  if (!data || typeof data !== 'object') return false;

  const session = data as Record<string, unknown>;

  // Check required fields
  if (typeof session.id !== 'string') return false;
  if (!Array.isArray(session.events)) return false;
  if (typeof session.startTime !== 'number') return false;
  if (typeof session.endTime !== 'number') return false;
  if (typeof session.duration !== 'number') return false;

  // Check metadata
  if (!session.metadata || typeof session.metadata !== 'object') return false;
  const metadata = session.metadata as Record<string, unknown>;
  if (typeof metadata.url !== 'string') return false;
  if (typeof metadata.userAgent !== 'string') return false;
  if (!metadata.viewport || typeof metadata.viewport !== 'object') return false;

  // Check redactionConfig
  if (!session.redactionConfig || typeof session.redactionConfig !== 'object') return false;
  const config = session.redactionConfig as Record<string, unknown>;
  if (typeof config.email !== 'boolean') return false;
  if (typeof config.phone !== 'boolean') return false;
  if (typeof config.ssn !== 'boolean') return false;
  if (typeof config.creditCard !== 'boolean') return false;

  // Check events have required fields
  for (const event of session.events as unknown[]) {
    if (!event || typeof event !== 'object') return false;
    const e = event as Record<string, unknown>;
    if (typeof e.type !== 'number') return false;
    if (typeof e.timestamp !== 'number') return false;
  }

  return true;
}

/**
 * Imports a session from a JSON file.
 *
 * @param file - The File object to import
 * @returns Promise resolving to an ImportResult
 *
 * @example
 * ```typescript
 * const input = document.querySelector('input[type="file"]');
 * input.addEventListener('change', async (e) => {
 *   const file = e.target.files[0];
 *   const result = await importSession(file);
 *   if (result.success) {
 *     console.log(`Imported session: ${result.session.id}`);
 *   } else {
 *     console.error(result.error);
 *   }
 * });
 * ```
 */
export function importSession(file: File): Promise<ImportResult> {
  return new Promise((resolve) => {
    const reader = new FileReader();

    reader.onload = (e) => {
      try {
        const content = e.target?.result;
        if (typeof content !== 'string') {
          resolve({ success: false, error: 'Failed to read file content' });
          return;
        }

        const data = JSON.parse(content);

        if (!validateSession(data)) {
          resolve({ success: false, error: 'Invalid session format' });
          return;
        }

        // Generate new ID to avoid conflicts
        const session: RecordedSession = {
          ...data,
          id: generateUUID(),
        };

        // Save the imported session
        saveSession(session);

        resolve({ success: true, session });
      } catch (error) {
        resolve({
          success: false,
          error: error instanceof Error ? error.message : 'Failed to parse file',
        });
      }
    };

    reader.onerror = () => {
      resolve({ success: false, error: 'Failed to read file' });
    };

    reader.readAsText(file);
  });
}

/**
 * Gets the total storage size used by sessions.
 *
 * @returns Object with size in bytes and formatted string
 */
export function getStorageSize(): { bytes: number; formatted: string } {
  let totalSize = 0;

  const index = getSessionIndex();
  for (const id of index) {
    const key = STORAGE_KEY_PREFIX + id;
    const data = localStorage.getItem(key);
    if (data) {
      totalSize += data.length * 2; // UTF-16 is 2 bytes per character
    }
  }

  // Add index size
  const indexData = localStorage.getItem(SESSION_INDEX_KEY);
  if (indexData) {
    totalSize += indexData.length * 2;
  }

  return {
    bytes: totalSize,
    formatted: formatBytes(totalSize),
  };
}

/**
 * Formats bytes into a human-readable string.
 */
function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';

  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

/**
 * Clears all saved sessions from localStorage.
 */
export function clearAllSessions(): void {
  const index = getSessionIndex();
  for (const id of index) {
    localStorage.removeItem(STORAGE_KEY_PREFIX + id);
  }
  localStorage.removeItem(SESSION_INDEX_KEY);
}

/**
 * Formats duration in milliseconds to a human-readable string.
 *
 * @param ms - Duration in milliseconds
 * @returns Formatted duration string (e.g., "1m 30s", "45s")
 */
export function formatDuration(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  if (minutes === 0) {
    return `${seconds}s`;
  }

  return `${minutes}m ${seconds}s`;
}

// =============================================================================
// Storage Settings Management
// =============================================================================

/**
 * Gets the current storage settings.
 *
 * @returns Current storage settings or defaults if not set
 */
export function getStorageSettings(): StorageSettings {
  try {
    const saved = localStorage.getItem(STORAGE_SETTINGS_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      return { ...DEFAULT_STORAGE_SETTINGS, ...parsed };
    }
  } catch {
    // Return defaults on error
  }
  return { ...DEFAULT_STORAGE_SETTINGS };
}

/**
 * Saves storage settings to localStorage.
 *
 * @param settings - Partial settings to update
 * @returns The updated settings
 */
export function saveStorageSettings(settings: Partial<StorageSettings>): StorageSettings {
  const current = getStorageSettings();
  const updated = { ...current, ...settings };
  localStorage.setItem(STORAGE_SETTINGS_KEY, JSON.stringify(updated));
  return updated;
}

/**
 * Resets storage settings to defaults.
 */
export function resetStorageSettings(): StorageSettings {
  localStorage.setItem(STORAGE_SETTINGS_KEY, JSON.stringify(DEFAULT_STORAGE_SETTINGS));
  return { ...DEFAULT_STORAGE_SETTINGS };
}

// =============================================================================
// Auto-Cleanup Functions
// =============================================================================

/**
 * Gets sessions that have expired based on retention policy.
 *
 * @param retentionDays - Number of days to retain (0 = unlimited)
 * @returns Array of expired session IDs
 */
export function getExpiredSessions(retentionDays: number): string[] {
  if (retentionDays <= 0) return [];

  const cutoffTime = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
  const expiredIds: string[] = [];
  const index = getSessionIndex();

  for (const id of index) {
    const session = loadSession(id);
    if (session && session.startTime < cutoffTime) {
      expiredIds.push(id);
    }
  }

  return expiredIds;
}

/**
 * Gets sessions that exceed the max session limit (oldest first).
 *
 * @param maxSessions - Maximum number of sessions to keep (0 = unlimited)
 * @returns Array of session IDs to delete (oldest ones)
 */
export function getOverflowSessions(maxSessions: number): string[] {
  if (maxSessions <= 0) return [];

  const index = getSessionIndex();
  if (index.length <= maxSessions) return [];

  // Index is sorted newest first, so take from the end
  return index.slice(maxSessions);
}

/**
 * Performs cleanup based on current storage settings.
 * Removes expired sessions and enforces max session limit.
 *
 * @param settings - Optional settings override (uses saved settings if not provided)
 * @returns Cleanup result with details of deleted sessions
 */
export function cleanupSessions(settings?: StorageSettings): CleanupResult {
  const config = settings || getStorageSettings();
  const result: CleanupResult = {
    deletedCount: 0,
    deletedIds: [],
    reasons: {},
  };

  // First, delete expired sessions
  const expired = getExpiredSessions(config.retentionDays);
  for (const id of expired) {
    deleteSession(id);
    result.deletedIds.push(id);
    result.reasons[id] = 'expired';
  }

  // Then, delete overflow sessions (oldest first)
  const overflow = getOverflowSessions(config.maxSessions);
  for (const id of overflow) {
    if (!result.deletedIds.includes(id)) {
      deleteSession(id);
      result.deletedIds.push(id);
      result.reasons[id] = 'overflow';
    }
  }

  result.deletedCount = result.deletedIds.length;
  return result;
}

/**
 * Checks if a session meets the minimum requirements for saving.
 *
 * @param events - The recorded events
 * @param settings - Optional settings override
 * @returns Whether the session should be saved
 */
export function shouldSaveSession(
  events: eventWithTime[],
  settings?: StorageSettings
): boolean {
  const config = settings || getStorageSettings();

  // Check minimum events
  if (events.length < config.minEvents) {
    return false;
  }

  // Check minimum duration
  if (events.length >= 2) {
    const duration = events[events.length - 1].timestamp - events[0].timestamp;
    if (duration < config.minDurationMs) {
      return false;
    }
  }

  return true;
}

/**
 * Saves a session with automatic cleanup based on storage policies.
 * This is the recommended function for auto-save functionality.
 *
 * @param session - The session to save
 * @param settings - Optional settings override
 * @returns Object with save status and any cleanup performed
 */
export function saveSessionWithPolicy(
  session: RecordedSession,
  settings?: StorageSettings
): { saved: boolean; cleanup: CleanupResult } {
  const config = settings || getStorageSettings();

  // Check if session meets requirements
  if (!shouldSaveSession(session.events, config)) {
    return {
      saved: false,
      cleanup: { deletedCount: 0, deletedIds: [], reasons: {} },
    };
  }

  // Perform cleanup before saving
  const cleanup = cleanupSessions(config);

  // Save the session
  saveSession(session);

  return { saved: true, cleanup };
}

// =============================================================================
// Extended Session Summary
// =============================================================================

/**
 * Extended session summary with additional metadata.
 */
export interface ExtendedSessionSummary extends SessionSummary {
  /** Raw start timestamp */
  startTime: number;
  /** Relative time string (e.g., "2 hours ago") */
  relativeTime: string;
  /** Whether the session is expired based on current retention policy */
  isExpired: boolean;
  /** Compressed size in bytes */
  sizeBytes: number;
  /** Formatted size string */
  sizeFormatted: string;
}

/**
 * Formats a timestamp as a relative time string.
 */
function formatRelativeTime(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;

  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) {
    return days === 1 ? '1 day ago' : `${days} days ago`;
  }
  if (hours > 0) {
    return hours === 1 ? '1 hour ago' : `${hours} hours ago`;
  }
  if (minutes > 0) {
    return minutes === 1 ? '1 minute ago' : `${minutes} minutes ago`;
  }
  return 'Just now';
}

/**
 * Gets the size of a stored session in bytes.
 */
function getSessionSize(id: string): number {
  const key = STORAGE_KEY_PREFIX + id;
  const data = localStorage.getItem(key);
  return data ? data.length * 2 : 0; // UTF-16 is 2 bytes per char
}

/**
 * Lists all saved sessions with extended information.
 *
 * @returns Array of extended session summaries
 */
export function listSessionsExtended(): ExtendedSessionSummary[] {
  const index = getSessionIndex();
  const settings = getStorageSettings();
  const cutoffTime =
    settings.retentionDays > 0
      ? Date.now() - settings.retentionDays * 24 * 60 * 60 * 1000
      : 0;

  const summaries: ExtendedSessionSummary[] = [];

  for (const id of index) {
    const session = loadSession(id);
    if (session) {
      const sizeBytes = getSessionSize(id);
      summaries.push({
        id: session.id,
        date: new Date(session.startTime).toLocaleString(),
        duration: session.duration,
        eventCount: session.events.length,
        url: truncateUrl(session.metadata.url, 50),
        startTime: session.startTime,
        relativeTime: formatRelativeTime(session.startTime),
        isExpired: cutoffTime > 0 && session.startTime < cutoffTime,
        sizeBytes,
        sizeFormatted: formatBytes(sizeBytes),
      });
    }
  }

  return summaries;
}

/**
 * Gets storage statistics.
 */
export interface StorageStats {
  /** Total number of sessions */
  totalSessions: number;
  /** Total storage used */
  totalSize: { bytes: number; formatted: string };
  /** Number of expired sessions */
  expiredCount: number;
  /** Number of sessions that would be deleted on next cleanup */
  pendingDeletion: number;
  /** Current storage settings */
  settings: StorageSettings;
}

/**
 * Gets comprehensive storage statistics.
 */
export function getStorageStats(): StorageStats {
  const settings = getStorageSettings();
  const sessions = listSessionsExtended();
  const expired = getExpiredSessions(settings.retentionDays);
  const overflow = getOverflowSessions(settings.maxSessions);

  const uniquePending = new Set([...expired, ...overflow]);

  return {
    totalSessions: sessions.length,
    totalSize: getStorageSize(),
    expiredCount: expired.length,
    pendingDeletion: uniquePending.size,
    settings,
  };
}
