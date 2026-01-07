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
