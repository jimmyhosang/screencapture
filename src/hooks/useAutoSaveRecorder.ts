/**
 * Auto-Save Session Recorder Hook
 *
 * This hook extends the base recorder with automatic session saving
 * based on configurable storage policies.
 */

import { useCallback, useEffect, useState, useMemo } from 'react';
import type { eventWithTime } from '@rrweb/types';
import {
  useSessionRecorder,
  type RecorderConfig,
  DEFAULT_RECORDER_CONFIG,
} from './useRecorder';
import {
  createSession,
  saveSessionWithPolicy,
  getStorageSettings,
  cleanupSessions,
  type StorageSettings,
  type CleanupResult,
  type RecordedSession,
} from '../utils/sessionStorage';
import { DEFAULT_REDACTION_CONFIG } from '../utils/redactor';

// =============================================================================
// Types
// =============================================================================

export interface UseAutoSaveRecorderOptions {
  /** Recorder configuration */
  recorderConfig?: RecorderConfig;
  /** Override storage settings (uses saved settings if not provided) */
  storageSettings?: Partial<StorageSettings>;
  /** Callback when session is auto-saved */
  onSessionSaved?: (session: RecordedSession) => void;
  /** Callback when sessions are cleaned up */
  onCleanup?: (result: CleanupResult) => void;
  /** Callback when session doesn't meet save requirements */
  onSessionSkipped?: (reason: 'too_short' | 'too_few_events') => void;
}

export interface UseAutoSaveRecorderReturn {
  /** Whether recording is active */
  isRecording: boolean;
  /** Current recorded events (in memory) */
  events: eventWithTime[];
  /** Start recording */
  startRecording: () => void;
  /** Stop recording (auto-saves if enabled) */
  stopRecording: () => eventWithTime[];
  /** Clear current events from memory */
  clearEvents: () => void;
  /** Current recorder configuration */
  config: RecorderConfig;
  /** Last saved session (if any) */
  lastSavedSession: RecordedSession | null;
  /** Manually trigger cleanup */
  runCleanup: () => CleanupResult;
  /** Current storage settings */
  storageSettings: StorageSettings;
}

// =============================================================================
// Hook Implementation
// =============================================================================

/**
 * Hook for session recording with automatic saving and storage management.
 *
 * Sessions are automatically saved when recording stops, based on the
 * configured storage policies. Old sessions are cleaned up automatically.
 *
 * @example
 * ```tsx
 * function App() {
 *   const {
 *     isRecording,
 *     startRecording,
 *     stopRecording,
 *     lastSavedSession
 *   } = useAutoSaveRecorder({
 *     onSessionSaved: (session) => {
 *       console.log('Session saved:', session.id);
 *     }
 *   });
 *
 *   return (
 *     <button onClick={isRecording ? stopRecording : startRecording}>
 *       {isRecording ? 'Stop' : 'Start'}
 *     </button>
 *   );
 * }
 * ```
 */
export function useAutoSaveRecorder(
  options: UseAutoSaveRecorderOptions = {}
): UseAutoSaveRecorderReturn {
  const {
    recorderConfig = DEFAULT_RECORDER_CONFIG,
    storageSettings: settingsOverride,
    onSessionSaved,
    onCleanup,
    onSessionSkipped,
  } = options;

  // Memoize storage settings to prevent unnecessary re-renders
  const storageSettings = useMemo<StorageSettings>(
    () => ({
      ...getStorageSettings(),
      ...settingsOverride,
    }),
    [settingsOverride]
  );

  // Track last saved session with state instead of ref
  const [lastSavedSession, setLastSavedSession] = useState<RecordedSession | null>(null);

  // Use base recorder
  const {
    isRecording,
    events,
    startRecording: baseStart,
    stopRecording: baseStop,
    clearEvents,
    config,
  } = useSessionRecorder(recorderConfig);

  // Run cleanup on mount
  useEffect(() => {
    const result = cleanupSessions(storageSettings);
    if (result.deletedCount > 0 && onCleanup) {
      onCleanup(result);
    }
    // Only run on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Enhanced stop recording with auto-save
  const stopRecording = useCallback(() => {
    const capturedEvents = baseStop();

    // Check if auto-save is enabled
    if (!storageSettings.autoSave) {
      return capturedEvents;
    }

    // Check minimum requirements
    if (capturedEvents.length < storageSettings.minEvents) {
      onSessionSkipped?.('too_few_events');
      return capturedEvents;
    }

    if (capturedEvents.length >= 2) {
      const duration =
        capturedEvents[capturedEvents.length - 1].timestamp -
        capturedEvents[0].timestamp;
      if (duration < storageSettings.minDurationMs) {
        onSessionSkipped?.('too_short');
        return capturedEvents;
      }
    }

    // Create and save session
    const session = createSession(
      capturedEvents,
      recorderConfig.redactionConfig || DEFAULT_REDACTION_CONFIG
    );
    const { saved, cleanup } = saveSessionWithPolicy(session, storageSettings);

    if (saved) {
      setLastSavedSession(session);
      onSessionSaved?.(session);
    }

    if (cleanup.deletedCount > 0) {
      onCleanup?.(cleanup);
    }

    return capturedEvents;
  }, [
    baseStop,
    storageSettings,
    recorderConfig.redactionConfig,
    onSessionSaved,
    onCleanup,
    onSessionSkipped,
  ]);

  // Manual cleanup function
  const runCleanup = useCallback(() => {
    const result = cleanupSessions(storageSettings);
    if (result.deletedCount > 0 && onCleanup) {
      onCleanup(result);
    }
    return result;
  }, [storageSettings, onCleanup]);

  return {
    isRecording,
    events,
    startRecording: baseStart,
    stopRecording,
    clearEvents,
    config,
    lastSavedSession,
    runCleanup,
    storageSettings,
  };
}

/**
 * Convenience hook with default auto-save enabled.
 */
export function useRecorderWithAutoSave(
  recorderConfig?: RecorderConfig
): UseAutoSaveRecorderReturn {
  return useAutoSaveRecorder({
    recorderConfig,
    storageSettings: { autoSave: true },
  });
}
