import { useState, useCallback } from 'react';
import type { eventWithTime } from '@rrweb/types';
import type { RecordedSession } from '../utils/sessionStorage';

/**
 * Hook to manage session saving functionality.
 */
export function useSessionSaver() {
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const saveCurrentSession = useCallback(
    async (
      events: eventWithTime[],
      redactionConfig: {
        email: boolean;
        phone: boolean;
        ssn: boolean;
        creditCard: boolean;
      }
    ): Promise<RecordedSession | null> => {
      if (events.length < 2) {
        setSaveError('Not enough events to save');
        return null;
      }

      setIsSaving(true);
      setSaveError(null);

      try {
        // Dynamically import to avoid circular dependencies
        const { createSession, saveSession } = await import('../utils/sessionStorage');
        const session = createSession(events, redactionConfig);
        saveSession(session);
        setIsSaving(false);
        return session;
      } catch (error) {
        setSaveError(error instanceof Error ? error.message : 'Failed to save session');
        setIsSaving(false);
        return null;
      }
    },
    []
  );

  return {
    isSaving,
    saveError,
    saveCurrentSession,
    clearSaveError: () => setSaveError(null),
  };
}
