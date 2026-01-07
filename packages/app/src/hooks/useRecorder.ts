import { useCallback, useRef, useState } from 'react';
import * as rrweb from 'rrweb';
import type { eventWithTime } from '@rrweb/types';
import { redactWithConfig, DEFAULT_REDACTION_CONFIG } from '../utils/redactor';
import type { RedactionConfig } from '../utils/redactor';

/**
 * Configuration for the session recorder with privacy options.
 */
export interface RecorderConfig {
  /** Mask all input field values with asterisks (default: true) */
  maskAllInputs: boolean;
  /** Mask text content matching PII patterns (default: true) */
  maskTextContent: boolean;
  /** CSS selectors for elements to completely block from recording */
  blockSelectors: string[];
  /** Configuration for which PII types to redact */
  redactionConfig: RedactionConfig;
  /** Additional CSS selectors for elements whose text should be masked */
  maskTextSelectors: string[];
  /** Whether to inline stylesheets for accurate replay (default: true) */
  inlineStylesheet: boolean;
  /** Mask specific input types */
  maskInputOptions: {
    password: boolean;
    email: boolean;
    tel: boolean;
    text: boolean;
    number: boolean;
    color: boolean;
    date: boolean;
    range: boolean;
    search: boolean;
    url: boolean;
    textarea: boolean;
    select: boolean;
  };
}

/**
 * Default recorder configuration with moderate privacy settings.
 */
export const DEFAULT_RECORDER_CONFIG: RecorderConfig = {
  maskAllInputs: true,
  maskTextContent: true,
  blockSelectors: ['.do-not-record', '[data-private]'],
  redactionConfig: DEFAULT_REDACTION_CONFIG,
  maskTextSelectors: ['.sensitive', '.pii', '[data-sensitive]'],
  inlineStylesheet: true,
  maskInputOptions: {
    password: true,
    email: true,
    tel: true,
    text: false,
    number: false,
    color: false,
    date: false,
    range: false,
    search: false,
    url: false,
    textarea: false,
    select: false,
  },
};

/**
 * Maximum privacy configuration - all protections enabled.
 */
export const SECURE_RECORDER_CONFIG: RecorderConfig = {
  maskAllInputs: true,
  maskTextContent: true,
  blockSelectors: ['.do-not-record', '[data-private]', '.sensitive', '.pii', '[data-sensitive]'],
  redactionConfig: {
    email: true,
    phone: true,
    ssn: true,
    creditCard: true,
  },
  maskTextSelectors: ['input', 'textarea', '.user-content', '[data-user-input]'],
  inlineStylesheet: true,
  maskInputOptions: {
    password: true,
    email: true,
    tel: true,
    text: true,
    number: true,
    color: false,
    date: true,
    range: false,
    search: true,
    url: true,
    textarea: true,
    select: true,
  },
};

// Legacy PrivacyConfig for backwards compatibility
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

export interface UseSessionRecorderReturn {
  isRecording: boolean;
  events: eventWithTime[];
  startRecording: () => void;
  stopRecording: () => eventWithTime[];
  clearEvents: () => void;
  config: RecorderConfig;
}

/**
 * Creates a mask text function that applies PII redaction at capture time.
 */
function createRedactionMaskFn(config: RecorderConfig) {
  return (text: string): string => {
    if (!config.maskTextContent) {
      return text;
    }
    return redactWithConfig(text, config.redactionConfig);
  };
}

/**
 * Converts block selectors array to a regex pattern for rrweb.
 */
function createBlockClassRegex(selectors: string[]): RegExp | undefined {
  const classSelectors = selectors
    .filter((s) => s.startsWith('.'))
    .map((s) => s.slice(1).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));

  if (classSelectors.length === 0) {
    return undefined;
  }

  return new RegExp(classSelectors.join('|'));
}

/**
 * Creates the blockSelector string for rrweb to block elements from recording.
 */
function createBlockSelector(selectors: string[]): string | undefined {
  if (selectors.length === 0) {
    return undefined;
  }
  return selectors.join(', ');
}

/**
 * Creates the maskTextSelector for rrweb to identify elements for text masking.
 */
function createMaskTextSelector(selectors: string[]): string | undefined {
  if (selectors.length === 0) {
    return undefined;
  }
  return selectors.join(', ');
}

/**
 * Hook for session recording with configurable privacy settings.
 * Uses the new RecorderConfig for comprehensive privacy control.
 *
 * @param initialConfig - Initial configuration for the recorder
 * @returns Recording state and control functions
 *
 * @example
 * ```typescript
 * const { isRecording, events, startRecording, stopRecording } = useSessionRecorder();
 *
 * // Start recording with default privacy settings
 * startRecording();
 *
 * // Stop and get events
 * const recordedEvents = stopRecording();
 * ```
 */
export function useSessionRecorder(
  initialConfig: RecorderConfig = DEFAULT_RECORDER_CONFIG
): UseSessionRecorderReturn {
  const [isRecording, setIsRecording] = useState(false);
  const [events, setEvents] = useState<eventWithTime[]>([]);
  const stopFnRef = useRef<(() => void) | null>(null);
  const eventsRef = useRef<eventWithTime[]>([]);
  const configRef = useRef<RecorderConfig>(initialConfig);

  const startRecording = useCallback(() => {
    if (isRecording) return;

    eventsRef.current = [];
    const config = configRef.current;

    const maskTextFn = createRedactionMaskFn(config);
    const blockClass = createBlockClassRegex(config.blockSelectors);
    const blockSelector = createBlockSelector(config.blockSelectors);
    const maskTextSelector = createMaskTextSelector(config.maskTextSelectors);

    const stopFn = rrweb.record({
      emit(event) {
        eventsRef.current.push(event);
      },
      // Privacy: Mask all input values
      maskAllInputs: config.maskAllInputs,
      // Privacy: Block elements with specific classes (regex-based)
      blockClass,
      // Privacy: Block elements matching selectors (function-based)
      blockSelector,
      // Privacy: CSS selector for elements whose text should be masked
      maskTextSelector,
      // Privacy: Custom text masking function using our redactor
      maskTextFn,
      // Privacy: Mask specific input types
      maskInputOptions: config.maskInputOptions,
      // Accurate replay: Inline stylesheets
      inlineStylesheet: config.inlineStylesheet,
      // Capture canvas content
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
    eventsRef.current = [];
  }, []);

  return {
    isRecording,
    events,
    startRecording,
    stopRecording,
    clearEvents,
    config: configRef.current,
  };
}

/**
 * Hook for session recording with maximum privacy settings.
 * All PII redaction and blocking features are enabled by default.
 *
 * Use this when recording sessions that may contain sensitive user data.
 *
 * @returns Recording state and control functions
 *
 * @example
 * ```typescript
 * const { isRecording, events, startRecording, stopRecording } = useSecureSessionRecorder();
 *
 * // All privacy protections are enabled automatically
 * startRecording();
 * ```
 */
export function useSecureSessionRecorder(): UseSessionRecorderReturn {
  return useSessionRecorder(SECURE_RECORDER_CONFIG);
}

// Legacy hook for backwards compatibility
// Regex patterns for sensitive data (used by legacy hook)
const PATTERNS = {
  email: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
  phone: /(\+?1[-.\s]?)?(\(?\d{3}\)?[-.\s]?)?\d{3}[-.\s]?\d{4}/g,
  ssn: /\b\d{3}[-.\s]?\d{2}[-.\s]?\d{4}\b/g,
  creditCard: /\b(?:\d{4}[-.\s]?){3}\d{4}\b/g,
};

// Legacy mask function for backwards compatibility
function createLegacyMaskTextFn(config: PrivacyConfig) {
  return (text: string): string => {
    if (!config.maskTextPatterns && !config.customMaskFn) {
      return text;
    }

    let masked = text;

    if (config.maskTextPatterns) {
      masked = masked.replace(PATTERNS.email, '[EMAIL REDACTED]');
      masked = masked.replace(PATTERNS.phone, '[PHONE REDACTED]');
      masked = masked.replace(PATTERNS.ssn, '[SSN REDACTED]');
      masked = masked.replace(PATTERNS.creditCard, '[CARD REDACTED]');
    }

    if (config.customMaskFn) {
      masked = masked.replace(/\b\d{4,}\b/g, (match) => '*'.repeat(match.length));
    }

    return masked;
  };
}

/**
 * Legacy hook for session recording.
 * @deprecated Use useSessionRecorder or useSecureSessionRecorder instead.
 */
export function useRecorder(): UseRecorderReturn {
  const [isRecording, setIsRecording] = useState(false);
  const [events, setEvents] = useState<eventWithTime[]>([]);
  const stopFnRef = useRef<(() => void) | null>(null);
  const eventsRef = useRef<eventWithTime[]>([]);

  const startRecording = useCallback(
    (config: PrivacyConfig = DEFAULT_PRIVACY_CONFIG) => {
      if (isRecording) return;

      eventsRef.current = [];

      const maskTextFn = createLegacyMaskTextFn(config);

      const stopFn = rrweb.record({
        emit(event) {
          eventsRef.current.push(event);
        },
        maskAllInputs: config.maskAllInputs,
        blockClass: config.blockSensitiveElements ? /sensitive|pii/ : undefined,
        maskTextFn: config.maskTextPatterns || config.customMaskFn ? maskTextFn : undefined,
        recordCanvas: true,
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
    },
    [isRecording]
  );

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

// Re-export RedactionConfig for convenience
export type { RedactionConfig };
