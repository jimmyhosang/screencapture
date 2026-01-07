import type { eventWithTime } from '@rrweb/types';
import type { PrivacyConfig } from '../hooks/useRecorder';

export interface SessionRecording {
  id: string;
  name: string;
  timestamp: number;
  duration: number;
  eventCount: number;
  events: eventWithTime[];
  privacyConfig: PrivacyConfig;
}

export interface AppSettings {
  defaultPrivacyConfig: PrivacyConfig;
  maxStorageSize: number; // in MB
  autoSave: boolean;
  samplingConfig: {
    mousemove: boolean;
    mouseInteraction: boolean;
    scroll: number;
    input: string;
  };
}

const STORAGE_KEY_SESSIONS = 'rrweb_sessions';
const STORAGE_KEY_SETTINGS = 'rrweb_settings';
const MAX_STORAGE_MB = 50; // Default max storage

// Calculate size of data in MB
function getDataSizeMB(data: unknown): number {
  const str = JSON.stringify(data);
  const bytes = new Blob([str]).size;
  return bytes / (1024 * 1024);
}

// Get all sessions from localStorage
export function getAllSessions(): SessionRecording[] {
  try {
    const data = localStorage.getItem(STORAGE_KEY_SESSIONS);
    if (!data) return [];
    return JSON.parse(data);
  } catch (error) {
    console.error('Failed to load sessions:', error);
    return [];
  }
}

// Save a new session
export function saveSession(session: SessionRecording): boolean {
  try {
    const sessions = getAllSessions();
    const newSessions = [session, ...sessions];

    // Check storage size
    const sizeMB = getDataSizeMB(newSessions);
    const settings = getSettings();

    if (sizeMB > settings.maxStorageSize) {
      console.warn(`Storage limit exceeded: ${sizeMB.toFixed(2)}MB / ${settings.maxStorageSize}MB`);
      return false;
    }

    localStorage.setItem(STORAGE_KEY_SESSIONS, JSON.stringify(newSessions));
    return true;
  } catch (error) {
    console.error('Failed to save session:', error);
    return false;
  }
}

// Delete a session by ID
export function deleteSession(id: string): void {
  try {
    const sessions = getAllSessions();
    const filtered = sessions.filter(s => s.id !== id);
    localStorage.setItem(STORAGE_KEY_SESSIONS, JSON.stringify(filtered));
  } catch (error) {
    console.error('Failed to delete session:', error);
  }
}

// Delete all sessions
export function deleteAllSessions(): void {
  try {
    localStorage.removeItem(STORAGE_KEY_SESSIONS);
  } catch (error) {
    console.error('Failed to delete all sessions:', error);
  }
}

// Get a session by ID
export function getSession(id: string): SessionRecording | null {
  const sessions = getAllSessions();
  return sessions.find(s => s.id === id) || null;
}

// Export session as JSON file
export function exportSession(session: SessionRecording): void {
  const dataStr = JSON.stringify(session, null, 2);
  const blob = new Blob([dataStr], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `session-${session.name}-${new Date(session.timestamp).toISOString()}.json`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

// Export all sessions
export function exportAllSessions(): void {
  const sessions = getAllSessions();
  const dataStr = JSON.stringify(sessions, null, 2);
  const blob = new Blob([dataStr], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `all-sessions-${new Date().toISOString()}.json`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

// Import session from JSON
export function importSession(file: File): Promise<SessionRecording | null> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = JSON.parse(e.target?.result as string);
        // Validate it's a session
        if (data.id && data.events && Array.isArray(data.events)) {
          resolve(data as SessionRecording);
        } else {
          console.error('Invalid session file format');
          resolve(null);
        }
      } catch (error) {
        console.error('Failed to parse session file:', error);
        resolve(null);
      }
    };
    reader.readAsText(file);
  });
}

// Get settings
export function getSettings(): AppSettings {
  try {
    const data = localStorage.getItem(STORAGE_KEY_SETTINGS);
    if (!data) return getDefaultSettings();
    return { ...getDefaultSettings(), ...JSON.parse(data) };
  } catch (error) {
    console.error('Failed to load settings:', error);
    return getDefaultSettings();
  }
}

// Save settings
export function saveSettings(settings: Partial<AppSettings>): void {
  try {
    const current = getSettings();
    const updated = { ...current, ...settings };
    localStorage.setItem(STORAGE_KEY_SETTINGS, JSON.stringify(updated));
  } catch (error) {
    console.error('Failed to save settings:', error);
  }
}

// Get default settings
function getDefaultSettings(): AppSettings {
  return {
    defaultPrivacyConfig: {
      maskAllInputs: false,
      blockSensitiveElements: false,
      maskTextPatterns: false,
      customMaskFn: false,
    },
    maxStorageSize: MAX_STORAGE_MB,
    autoSave: true,
    samplingConfig: {
      mousemove: true,
      mouseInteraction: true,
      scroll: 150,
      input: 'last',
    },
  };
}

// Get total storage usage
export function getStorageStats(): { usedMB: number; maxMB: number; sessionCount: number } {
  const sessions = getAllSessions();
  const settings = getSettings();
  const usedMB = getDataSizeMB(sessions);

  return {
    usedMB,
    maxMB: settings.maxStorageSize,
    sessionCount: sessions.length,
  };
}
