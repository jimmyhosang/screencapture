import { useCallback, useRef, useState } from 'react';
import * as rrweb from 'rrweb';
import type { eventWithTime } from '@rrweb/types';

// Regex patterns for sensitive data
const PATTERNS = {
  email: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
  phone: /(\+?1[-.\s]?)?(\(?\d{3}\)?[-.\s]?)?\d{3}[-.\s]?\d{4}/g,
  ssn: /\b\d{3}[-.\s]?\d{2}[-.\s]?\d{4}\b/g,
  creditCard: /\b(?:\d{4}[-.\s]?){3}\d{4}\b/g,
};

export interface PrivacyConfig {
  maskAllInputs: boolean;
  blockSensitiveElements: boolean;
  maskTextPatterns: boolean;
  customMaskFn: boolean;
}

export const DEFAULT_PRIVACY_CONFIG: PrivacyConfig = {
  maskAllInputs: false,
  blockSensitiveElements: false,
  maskTextPatterns: false,
  customMaskFn: false,
};

export interface UseRecorderReturn {
  isRecording: boolean;
  events: eventWithTime[];
  startRecording: (config?: PrivacyConfig) => void;
  stopRecording: () => eventWithTime[];
  clearEvents: () => void;
}

// Custom mask function that redacts sensitive patterns
function createMaskTextFn(config: PrivacyConfig) {
  return (text: string): string => {
    if (!config.maskTextPatterns && !config.customMaskFn) {
      return text;
    }

    let masked = text;

    if (config.maskTextPatterns) {
      // Mask emails
      masked = masked.replace(PATTERNS.email, '[EMAIL REDACTED]');
      // Mask phone numbers
      masked = masked.replace(PATTERNS.phone, '[PHONE REDACTED]');
      // Mask SSNs
      masked = masked.replace(PATTERNS.ssn, '[SSN REDACTED]');
      // Mask credit card numbers
      masked = masked.replace(PATTERNS.creditCard, '[CARD REDACTED]');
    }

    if (config.customMaskFn) {
      // Additional custom redaction - mask any sequence of 4+ digits
      masked = masked.replace(/\b\d{4,}\b/g, (match) => '*'.repeat(match.length));
    }

    return masked;
  };
}

export function useRecorder(): UseRecorderReturn {
  const [isRecording, setIsRecording] = useState(false);
  const [events, setEvents] = useState<eventWithTime[]>([]);
  const stopFnRef = useRef<(() => void) | null>(null);
  const eventsRef = useRef<eventWithTime[]>([]);

  const startRecording = useCallback((config: PrivacyConfig = DEFAULT_PRIVACY_CONFIG) => {
    if (isRecording) return;

    eventsRef.current = [];

    const maskTextFn = createMaskTextFn(config);

    const stopFn = rrweb.record({
      emit(event) {
        eventsRef.current.push(event);
      },
      // Privacy: Mask all input values
      maskAllInputs: config.maskAllInputs,
      // Privacy: Block elements with specific classes
      blockClass: config.blockSensitiveElements ? /sensitive|pii/ : undefined,
      // Privacy: Custom text masking function
      maskTextFn: (config.maskTextPatterns || config.customMaskFn) ? maskTextFn : undefined,
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
