/**
 * Advanced Integration Example
 *
 * This example demonstrates all features of the session recording library:
 * - Custom redaction patterns
 * - Session management (save, load, export)
 * - Performance monitoring
 * - Privacy controls
 * - Custom hooks configuration
 *
 * Use this as a reference for production implementations.
 */

import { useState, useCallback, useEffect } from 'react';
import type { eventWithTime } from '@rrweb/types';

// Hooks
import {
  useOptimizedRecorder,
  type OptimizedRecorderConfig,
} from '../hooks/useOptimizedRecorder';

// Components
import { PlayerModal } from '../components/PlayerModal';
import { SessionList } from '../components/SessionList';
import { PerformanceMonitor } from '../components/PerformanceMonitor';
import { RedactionOverlay } from '../components/RedactionOverlay';

// Utilities
import {
  addCustomPattern,
  clearCustomPatterns,
  type ExtendedRedactionConfig,
} from '../utils/redactor';
import {
  saveSession,
  createSession,
  type RecordedSession,
} from '../utils/sessionStorage';

// =============================================================================
// Custom Configuration
// =============================================================================

/**
 * Example: HIPAA-compliant configuration for healthcare applications.
 * Aggressively redacts all potential PHI (Protected Health Information).
 */
export const HIPAA_CONFIG: OptimizedRecorderConfig = {
  maskAllInputs: true,
  maskTextContent: true,
  blockSelectors: [
    '.patient-data',
    '.medical-record',
    '[data-hipaa]',
    '[data-phi]',
    '.ssn',
    '.dob',
    '.insurance-id',
  ],
  redactionConfig: {
    email: true,
    phone: true,
    ssn: true,
    creditCard: true,
  },
  maskTextSelectors: [
    'input',
    'textarea',
    '.patient-name',
    '.diagnosis',
    '.prescription',
  ],
  inlineStylesheet: true,
  sampling: {
    strategy: 'throttled',
    maxEventsPerSecond: 30,
  },
  redactionDebounceMs: 50,
  useWorkers: true,
  workerThreshold: 500,
  trackPerformance: true,
};

/**
 * Example: PCI DSS compliant configuration for payment processing.
 * Focuses on cardholder data protection.
 */
export const PCI_DSS_CONFIG: OptimizedRecorderConfig = {
  maskAllInputs: true,
  maskTextContent: true,
  blockSelectors: [
    '.payment-form',
    '.credit-card-input',
    '[data-pci]',
    '.cvv',
    '.card-number',
    '.expiry-date',
  ],
  redactionConfig: {
    email: true,
    phone: true,
    ssn: true,
    creditCard: true,
  },
  maskTextSelectors: [
    'input[type="password"]',
    'input[autocomplete="cc-number"]',
    'input[autocomplete="cc-csc"]',
    '.billing-address',
  ],
  inlineStylesheet: true,
  sampling: {
    strategy: 'all',
  },
  redactionDebounceMs: 0,
  useWorkers: true,
  workerThreshold: 1000,
  trackPerformance: true,
};

/**
 * Example: GDPR compliant configuration for EU users.
 * Focuses on personal data protection.
 */
export const GDPR_CONFIG: OptimizedRecorderConfig = {
  maskAllInputs: true,
  maskTextContent: true,
  blockSelectors: [
    '.personal-data',
    '[data-gdpr]',
    '.cookie-consent',
    '.user-profile',
  ],
  redactionConfig: {
    email: true,
    phone: true,
    ssn: true,
    creditCard: true,
  },
  maskTextSelectors: [
    '.name',
    '.address',
    '.email',
    '.phone',
    '.ip-address',
  ],
  inlineStylesheet: true,
  sampling: {
    strategy: 'keyframes',
    keyframeInterval: 2000,
  },
  redactionDebounceMs: 100,
  useWorkers: true,
  workerThreshold: 500,
  trackPerformance: true,
};

// =============================================================================
// Custom Patterns Setup
// =============================================================================

/**
 * Registers custom redaction patterns for domain-specific data.
 * Call this before starting recording.
 */
export function registerCustomPatterns(): void {
  // Clear any existing custom patterns
  clearCustomPatterns();

  // Medical Record Number (MRN) - Common in healthcare
  addCustomPattern(
    'mrn',
    /\bMRN[-:\s]?\d{6,10}\b/gi,
    () => 'MRN-[REDACTED]',
    'high'
  );

  // Patient ID
  addCustomPattern(
    'patientId',
    /\bPT[-:\s]?\d{5,8}\b/gi,
    () => 'PT-[REDACTED]',
    'high'
  );

  // Employee ID
  addCustomPattern(
    'employeeId',
    /\bEMP[-:\s]?\d{5,8}\b/gi,
    () => 'EMP-[REDACTED]',
    'medium'
  );

  // Order/Invoice numbers
  addCustomPattern(
    'orderId',
    /\b(?:ORD|INV|ORDER|INVOICE)[-:\s]?\d{6,12}\b/gi,
    (match) => match.split(/[-:\s]/)[0] + '-[REDACTED]',
    'low'
  );

  // Custom account numbers
  addCustomPattern(
    'accountNumber',
    /\bACCT?[-:\s]?\d{8,16}\b/gi,
    () => 'ACCT-[REDACTED]',
    'medium'
  );

  // Vehicle Identification Numbers (VIN)
  addCustomPattern(
    'vin',
    /\b[A-HJ-NPR-Z0-9]{17}\b/g,
    () => '[VIN REDACTED]',
    'medium'
  );

  // License plate patterns (US format examples)
  addCustomPattern(
    'licensePlate',
    /\b[A-Z]{1,3}[-\s]?\d{1,4}[-\s]?[A-Z]{0,3}\b/g,
    () => '[PLATE REDACTED]',
    'low'
  );
}

// =============================================================================
// Advanced Recording Hook
// =============================================================================

interface UseAdvancedRecorderOptions {
  /** Recording configuration preset */
  preset?: 'hipaa' | 'pci' | 'gdpr' | 'default';
  /** Enable custom patterns */
  useCustomPatterns?: boolean;
  /** Auto-save session after stopping */
  autoSave?: boolean;
  /** Enable performance monitoring overlay */
  showPerformanceMonitor?: boolean;
  /** Enable redaction visual indicators */
  showRedactionOverlay?: boolean;
}

interface UseAdvancedRecorderReturn {
  /** Recording state */
  isRecording: boolean;
  /** Captured events */
  events: eventWithTime[];
  /** Performance metrics */
  metrics: ReturnType<typeof useOptimizedRecorder>['metrics'];
  /** Start recording */
  startRecording: () => void;
  /** Stop recording */
  stopRecording: () => eventWithTime[];
  /** Clear events */
  clearEvents: () => void;
  /** Save current session */
  saveCurrentSession: (name?: string) => RecordedSession | null;
  /** Active configuration */
  config: OptimizedRecorderConfig;
}

/**
 * Advanced recording hook with presets and session management.
 *
 * @example
 * ```tsx
 * function MyApp() {
 *   const {
 *     isRecording,
 *     startRecording,
 *     stopRecording,
 *     saveCurrentSession
 *   } = useAdvancedRecorder({
 *     preset: 'hipaa',
 *     autoSave: true,
 *     showPerformanceMonitor: true
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
export function useAdvancedRecorder(
  options: UseAdvancedRecorderOptions = {}
): UseAdvancedRecorderReturn {
  const {
    preset = 'default',
    useCustomPatterns = false,
    autoSave = false,
  } = options;

  // Select configuration based on preset
  const configMap: Record<string, OptimizedRecorderConfig> = {
    hipaa: HIPAA_CONFIG,
    pci: PCI_DSS_CONFIG,
    gdpr: GDPR_CONFIG,
    default: {
      maskAllInputs: true,
      maskTextContent: true,
      blockSelectors: ['.do-not-record', '[data-private]'],
      redactionConfig: {
        email: true,
        phone: true,
        ssn: true,
        creditCard: true,
      },
      maskTextSelectors: ['.sensitive', '.pii'],
      inlineStylesheet: true,
      sampling: { strategy: 'all' },
      redactionDebounceMs: 50,
      useWorkers: true,
      workerThreshold: 1000,
      trackPerformance: true,
    },
  };

  const selectedConfig = configMap[preset] || configMap.default;

  // Initialize recorder with selected config
  const {
    isRecording,
    events,
    startRecording: baseStart,
    stopRecording: baseStop,
    clearEvents,
    config,
    metrics,
  } = useOptimizedRecorder(selectedConfig);

  // Register custom patterns on mount if enabled
  useEffect(() => {
    if (useCustomPatterns) {
      registerCustomPatterns();
    }
    return () => {
      if (useCustomPatterns) {
        clearCustomPatterns();
      }
    };
  }, [useCustomPatterns]);

  // Enhanced start recording
  const startRecording = useCallback(() => {
    if (useCustomPatterns) {
      registerCustomPatterns();
    }
    baseStart();
  }, [baseStart, useCustomPatterns]);

  // Enhanced stop recording with auto-save
  const stopRecording = useCallback(() => {
    const capturedEvents = baseStop();

    if (autoSave && capturedEvents.length >= 2) {
      const redactionConfig: ExtendedRedactionConfig = {
        ...selectedConfig.redactionConfig,
        customPatterns: useCustomPatterns ? ['mrn', 'patientId', 'employeeId'] : undefined,
      };
      const session = createSession(capturedEvents, redactionConfig);
      saveSession(session);
    }

    return capturedEvents;
  }, [baseStop, autoSave, selectedConfig.redactionConfig, useCustomPatterns]);

  // Manual save function
  const saveCurrentSession = useCallback(
    (_name?: string): RecordedSession | null => {
      if (events.length < 2) {
        console.warn('Not enough events to save');
        return null;
      }

      const redactionConfig: ExtendedRedactionConfig = {
        ...selectedConfig.redactionConfig,
        customPatterns: useCustomPatterns ? ['mrn', 'patientId', 'employeeId'] : undefined,
      };
      const session = createSession(events, redactionConfig);
      saveSession(session);
      return session;
    },
    [events, selectedConfig.redactionConfig, useCustomPatterns]
  );

  return {
    isRecording,
    events,
    metrics,
    startRecording,
    stopRecording,
    clearEvents,
    saveCurrentSession,
    config,
  };
}

// =============================================================================
// Advanced Integration Component
// =============================================================================

interface AdvancedIntegrationProps {
  /** Compliance preset to use */
  preset?: 'hipaa' | 'pci' | 'gdpr' | 'default';
}

/**
 * Complete advanced integration example with all features.
 */
export function AdvancedIntegration({ preset = 'default' }: AdvancedIntegrationProps) {
  const {
    isRecording,
    events,
    metrics,
    startRecording,
    stopRecording,
    clearEvents,
    saveCurrentSession,
    config,
  } = useAdvancedRecorder({
    preset,
    useCustomPatterns: true,
    autoSave: false,
    showPerformanceMonitor: true,
    showRedactionOverlay: true,
  });

  const [isPlayerOpen, setIsPlayerOpen] = useState(false);
  const [playbackEvents, setPlaybackEvents] = useState<eventWithTime[]>([]);
  const [showSettings, setShowSettings] = useState(false);

  const handlePlayCurrent = useCallback(() => {
    if (events.length >= 2) {
      setPlaybackEvents(events);
      setIsPlayerOpen(true);
    }
  }, [events]);

  const handleReplay = useCallback((sessionEvents: eventWithTime[]) => {
    setPlaybackEvents(sessionEvents);
    setIsPlayerOpen(true);
  }, []);

  const handleSave = useCallback(() => {
    const session = saveCurrentSession();
    if (session) {
      alert(`Session saved! ID: ${session.id}`);
    }
  }, [saveCurrentSession]);

  return (
    <div style={styles.container}>
      {/* Header */}
      <header style={styles.header}>
        <h1 style={styles.title}>Advanced Session Recording</h1>
        <div style={styles.preset}>
          Preset: <strong>{preset.toUpperCase()}</strong>
        </div>
      </header>

      {/* Controls */}
      <div style={styles.controls}>
        <div style={styles.controlGroup}>
          {!isRecording ? (
            <button onClick={startRecording} style={styles.startButton}>
              Start Recording
            </button>
          ) : (
            <>
              <div style={styles.recordingIndicator}>
                <span style={styles.recordingDot} />
                Recording ({events.length} events)
              </div>
              <button onClick={stopRecording} style={styles.stopButton}>
                Stop
              </button>
            </>
          )}

          {!isRecording && events.length >= 2 && (
            <>
              <button onClick={handlePlayCurrent} style={styles.playButton}>
                Play
              </button>
              <button onClick={handleSave} style={styles.saveButton}>
                Save Session
              </button>
              <button onClick={clearEvents} style={styles.clearButton}>
                Clear
              </button>
            </>
          )}
        </div>

        <button
          onClick={() => setShowSettings(!showSettings)}
          style={styles.settingsButton}
        >
          {showSettings ? 'Hide' : 'Show'} Settings
        </button>
      </div>

      {/* Settings Panel */}
      {showSettings && (
        <div style={styles.settingsPanel}>
          <h3>Active Configuration</h3>
          <pre style={styles.configDisplay}>
            {JSON.stringify(
              {
                maskAllInputs: config.maskAllInputs,
                maskTextContent: config.maskTextContent,
                blockSelectors: config.blockSelectors,
                sampling: config.sampling,
                useWorkers: config.useWorkers,
              },
              null,
              2
            )}
          </pre>
        </div>
      )}

      {/* Demo Content */}
      <div style={styles.demoContent}>
        <h2>Demo Content</h2>
        <p>Interact with these elements to test recording:</p>

        <div style={styles.formGroup}>
          <label>Email:</label>
          <input
            type="email"
            placeholder="user@example.com"
            style={styles.input}
          />
        </div>

        <div style={styles.formGroup}>
          <label>Phone:</label>
          <input
            type="tel"
            placeholder="555-123-4567"
            style={styles.input}
          />
        </div>

        <div style={styles.formGroup}>
          <label>SSN (masked):</label>
          <input
            type="text"
            placeholder="123-45-6789"
            className="ssn"
            style={styles.input}
          />
        </div>

        <div style={styles.formGroup}>
          <label>Credit Card:</label>
          <input
            type="text"
            placeholder="4111-1111-1111-1111"
            style={styles.input}
          />
        </div>

        <div style={styles.formGroup} className="patient-data" data-hipaa="true">
          <label>Patient MRN (custom pattern):</label>
          <input
            type="text"
            placeholder="MRN-12345678"
            style={styles.input}
          />
        </div>
      </div>

      {/* Session List */}
      <SessionList onReplay={handleReplay} currentEvents={events} isRecording={isRecording} />

      {/* Redaction Overlay (visual indicators) */}
      <RedactionOverlay
        isRecording={isRecording}
        showIndicators={true}
        redactionConfig={config.redactionConfig}
      />

      {/* Performance Monitor */}
      <PerformanceMonitor
        isRecording={isRecording}
        metrics={metrics}
        position="bottom-right"
      />

      {/* Playback Modal */}
      <PlayerModal
        isOpen={isPlayerOpen}
        onClose={() => setIsPlayerOpen(false)}
        events={playbackEvents}
      />
    </div>
  );
}

// =============================================================================
// Styles
// =============================================================================

const styles: Record<string, React.CSSProperties> = {
  container: {
    maxWidth: '900px',
    margin: '0 auto',
    padding: '20px',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '24px',
    paddingBottom: '16px',
    borderBottom: '1px solid #e5e7eb',
  },
  title: {
    margin: 0,
    fontSize: '24px',
    color: '#111827',
  },
  preset: {
    fontSize: '14px',
    color: '#6b7280',
  },
  controls: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '24px',
    padding: '16px',
    backgroundColor: '#f9fafb',
    borderRadius: '8px',
  },
  controlGroup: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
  },
  recordingIndicator: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    fontSize: '14px',
    color: '#dc2626',
    fontWeight: 500,
  },
  recordingDot: {
    width: '10px',
    height: '10px',
    borderRadius: '50%',
    backgroundColor: '#dc2626',
    animation: 'pulse 1.5s infinite',
  },
  startButton: {
    padding: '10px 20px',
    backgroundColor: '#22c55e',
    color: 'white',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '14px',
    fontWeight: 500,
  },
  stopButton: {
    padding: '10px 20px',
    backgroundColor: '#dc2626',
    color: 'white',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '14px',
    fontWeight: 500,
  },
  playButton: {
    padding: '10px 20px',
    backgroundColor: '#3b82f6',
    color: 'white',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '14px',
    fontWeight: 500,
  },
  saveButton: {
    padding: '10px 20px',
    backgroundColor: '#8b5cf6',
    color: 'white',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '14px',
    fontWeight: 500,
  },
  clearButton: {
    padding: '10px 20px',
    backgroundColor: '#6b7280',
    color: 'white',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '14px',
    fontWeight: 500,
  },
  settingsButton: {
    padding: '10px 20px',
    backgroundColor: 'transparent',
    color: '#6b7280',
    border: '1px solid #d1d5db',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '14px',
  },
  settingsPanel: {
    marginBottom: '24px',
    padding: '16px',
    backgroundColor: '#f3f4f6',
    borderRadius: '8px',
  },
  configDisplay: {
    margin: 0,
    padding: '12px',
    backgroundColor: '#1f2937',
    color: '#e5e7eb',
    borderRadius: '4px',
    fontSize: '12px',
    overflow: 'auto',
  },
  demoContent: {
    marginBottom: '24px',
    padding: '24px',
    backgroundColor: 'white',
    border: '1px solid #e5e7eb',
    borderRadius: '8px',
  },
  formGroup: {
    marginBottom: '16px',
  },
  input: {
    display: 'block',
    width: '100%',
    marginTop: '4px',
    padding: '10px 12px',
    border: '1px solid #d1d5db',
    borderRadius: '6px',
    fontSize: '14px',
  },
};

export default AdvancedIntegration;
