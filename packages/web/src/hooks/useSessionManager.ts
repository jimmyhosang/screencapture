import { useState, useCallback, useEffect } from 'react';
import type { eventWithTime } from '@rrweb/types';
import type { PrivacyConfig } from './useRecorder';
import {
  getAllSessions,
  saveSession,
  deleteSession,
  deleteAllSessions,
  exportSession,
  exportAllSessions,
  importSession,
  getStorageStats,
  type SessionRecording,
} from '../utils/sessionStorage';

export interface UseSessionManagerReturn {
  sessions: SessionRecording[];
  currentSession: SessionRecording | null;
  storageStats: { usedMB: number; maxMB: number; sessionCount: number };
  saveCurrentRecording: (name: string, events: eventWithTime[], privacyConfig: PrivacyConfig, duration: number) => boolean;
  loadSession: (id: string) => void;
  deleteSessionById: (id: string) => void;
  clearAllSessions: () => void;
  exportSessionById: (id: string) => void;
  exportAll: () => void;
  importSessionFromFile: (file: File) => Promise<boolean>;
  refreshSessions: () => void;
}

export function useSessionManager(): UseSessionManagerReturn {
  const [sessions, setSessions] = useState<SessionRecording[]>([]);
  const [currentSession, setCurrentSession] = useState<SessionRecording | null>(null);
  const [storageStats, setStorageStats] = useState({ usedMB: 0, maxMB: 50, sessionCount: 0 });

  // Load sessions on mount
  const refreshSessions = useCallback(() => {
    const loadedSessions = getAllSessions();
    setSessions(loadedSessions);
    setStorageStats(getStorageStats());
  }, []);

  useEffect(() => {
    refreshSessions();
  }, [refreshSessions]);

  // Save current recording as a session
  const saveCurrentRecording = useCallback((
    name: string,
    events: eventWithTime[],
    privacyConfig: PrivacyConfig,
    duration: number
  ): boolean => {
    if (events.length < 2) {
      console.warn('Cannot save session: not enough events');
      return false;
    }

    const session: SessionRecording = {
      id: `session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      name: name || `Recording ${new Date().toLocaleString()}`,
      timestamp: Date.now(),
      duration,
      eventCount: events.length,
      events,
      privacyConfig,
    };

    const success = saveSession(session);
    if (success) {
      refreshSessions();
    }
    return success;
  }, [refreshSessions]);

  // Load a session by ID
  const loadSession = useCallback((id: string) => {
    const session = sessions.find(s => s.id === id);
    if (session) {
      setCurrentSession(session);
    }
  }, [sessions]);

  // Delete a session
  const deleteSessionById = useCallback((id: string) => {
    deleteSession(id);
    if (currentSession?.id === id) {
      setCurrentSession(null);
    }
    refreshSessions();
  }, [currentSession, refreshSessions]);

  // Clear all sessions
  const clearAllSessions = useCallback(() => {
    deleteAllSessions();
    setCurrentSession(null);
    refreshSessions();
  }, [refreshSessions]);

  // Export a session
  const exportSessionById = useCallback((id: string) => {
    const session = sessions.find(s => s.id === id);
    if (session) {
      exportSession(session);
    }
  }, [sessions]);

  // Export all sessions
  const exportAll = useCallback(() => {
    exportAllSessions();
  }, []);

  // Import a session from file
  const importSessionFromFile = useCallback(async (file: File): Promise<boolean> => {
    const session = await importSession(file);
    if (session) {
      const success = saveSession(session);
      if (success) {
        refreshSessions();
        return true;
      }
    }
    return false;
  }, [refreshSessions]);

  return {
    sessions,
    currentSession,
    storageStats,
    saveCurrentRecording,
    loadSession,
    deleteSessionById,
    clearAllSessions,
    exportSessionById,
    exportAll,
    importSessionFromFile,
    refreshSessions,
  };
}
