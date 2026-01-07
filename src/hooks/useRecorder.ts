import { useCallback, useRef, useState } from 'react';
import * as rrweb from 'rrweb';
import type { eventWithTime } from '@rrweb/types';

export interface UseRecorderReturn {
  isRecording: boolean;
  events: eventWithTime[];
  startRecording: () => void;
  stopRecording: () => eventWithTime[];
  clearEvents: () => void;
}

export function useRecorder(): UseRecorderReturn {
  const [isRecording, setIsRecording] = useState(false);
  const [events, setEvents] = useState<eventWithTime[]>([]);
  const stopFnRef = useRef<(() => void) | null>(null);
  const eventsRef = useRef<eventWithTime[]>([]);

  const startRecording = useCallback(() => {
    if (isRecording) return;

    eventsRef.current = [];

    const stopFn = rrweb.record({
      emit(event) {
        eventsRef.current.push(event);
      },
      // Record all mutations including text input
      maskAllInputs: false,
      // Capture scroll positions
      recordCanvas: true,
      // Sample mouse movements for smoother playback
      sampling: {
        mousemove: true,
        mouseInteraction: true,
        scroll: 150,
        input: 'last',
      },
    });

    if (stopFn) {
      stopFnRef.current = stopFn;
    }

    setIsRecording(true);
  }, [isRecording]);

  const stopRecording = useCallback(() => {
    if (stopFnRef.current) {
      stopFnRef.current();
      stopFnRef.current = null;
    }
    setIsRecording(false);
    setEvents([...eventsRef.current]);
    return eventsRef.current;
  }, []);

  const clearEvents = useCallback(() => {
    setEvents([]);
  }, []);

  return {
    isRecording,
    events,
    startRecording,
    stopRecording,
    clearEvents,
  };
}
