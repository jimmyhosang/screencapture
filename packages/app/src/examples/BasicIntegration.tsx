/**
 * Basic Integration Example
 *
 * This example shows the minimal code needed to add session recording
 * to any React application. Copy and adapt as needed.
 *
 * @example
 * ```tsx
 * import { RecordingProvider } from './examples/BasicIntegration';
 *
 * function App() {
 *   return (
 *     <RecordingProvider>
 *       <YourApp />
 *     </RecordingProvider>
 *   );
 * }
 * ```
 */

import { useState, useCallback, createContext, useContext, type ReactNode } from 'react';
import type { eventWithTime } from '@rrweb/types';
import { useSessionRecorder, DEFAULT_RECORDER_CONFIG } from '../hooks/useRecorder';
import { PlayerModal } from '../components/PlayerModal';

// =============================================================================
// Types
// =============================================================================

interface RecordingContextType {
  /** Whether recording is currently active */
  isRecording: boolean;
  /** Number of events captured */
  eventCount: number;
  /** Start recording */
  startRecording: () => void;
  /** Stop recording */
  stopRecording: () => void;
  /** Play back the recorded session */
  playRecording: () => void;
}

// =============================================================================
// Context
// =============================================================================

const RecordingContext = createContext<RecordingContextType | null>(null);

/**
 * Hook to access recording functionality from any component.
 *
 * @example
 * ```tsx
 * function MyComponent() {
 *   const { isRecording, startRecording, stopRecording } = useRecording();
 *
 *   return (
 *     <button onClick={isRecording ? stopRecording : startRecording}>
 *       {isRecording ? 'Stop' : 'Start'} Recording
 *     </button>
 *   );
 * }
 * ```
 */
export function useRecording(): RecordingContextType {
  const context = useContext(RecordingContext);
  if (!context) {
    throw new Error('useRecording must be used within a RecordingProvider');
  }
  return context;
}

// =============================================================================
// Provider Component
// =============================================================================

interface RecordingProviderProps {
  children: ReactNode;
}

/**
 * Provides recording functionality to the entire app.
 * Wrap your app with this provider to enable session recording.
 *
 * @example
 * ```tsx
 * function App() {
 *   return (
 *     <RecordingProvider>
 *       <Header />
 *       <Main />
 *       <Footer />
 *     </RecordingProvider>
 *   );
 * }
 * ```
 */
export function RecordingProvider({ children }: RecordingProviderProps) {
  const { isRecording, events, startRecording, stopRecording } = useSessionRecorder(
    DEFAULT_RECORDER_CONFIG
  );
  const [isPlayerOpen, setIsPlayerOpen] = useState(false);
  const [playbackEvents, setPlaybackEvents] = useState<eventWithTime[]>([]);

  const handleStopRecording = useCallback(() => {
    const capturedEvents = stopRecording();
    setPlaybackEvents(capturedEvents);
  }, [stopRecording]);

  const handlePlayRecording = useCallback(() => {
    if (events.length >= 2) {
      setPlaybackEvents(events);
      setIsPlayerOpen(true);
    }
  }, [events]);

  const contextValue: RecordingContextType = {
    isRecording,
    eventCount: events.length,
    startRecording,
    stopRecording: handleStopRecording,
    playRecording: handlePlayRecording,
  };

  return (
    <RecordingContext.Provider value={contextValue}>
      {children}

      {/* Playback Modal */}
      <PlayerModal
        isOpen={isPlayerOpen}
        onClose={() => setIsPlayerOpen(false)}
        events={playbackEvents}
      />
    </RecordingContext.Provider>
  );
}

// =============================================================================
// Recording Controls Component
// =============================================================================

/**
 * Pre-built recording control buttons.
 * Drop this component anywhere in your app (inside RecordingProvider).
 *
 * @example
 * ```tsx
 * function Header() {
 *   return (
 *     <header>
 *       <h1>My App</h1>
 *       <RecordingControls />
 *     </header>
 *   );
 * }
 * ```
 */
export function RecordingControls() {
  const { isRecording, eventCount, startRecording, stopRecording, playRecording } = useRecording();

  return (
    <div className="recording-controls" style={styles.controls}>
      {!isRecording ? (
        <button onClick={startRecording} style={styles.startButton}>
          Start Recording
        </button>
      ) : (
        <>
          <span style={styles.indicator}>
            <span style={styles.recordingDot} />
            Recording ({eventCount} events)
          </span>
          <button onClick={stopRecording} style={styles.stopButton}>
            Stop
          </button>
        </>
      )}

      {!isRecording && eventCount >= 2 && (
        <button onClick={playRecording} style={styles.playButton}>
          Play Recording
        </button>
      )}
    </div>
  );
}

// =============================================================================
// Styles (inline for portability)
// =============================================================================

const styles: Record<string, React.CSSProperties> = {
  controls: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    padding: '8px',
  },
  indicator: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    fontSize: '14px',
    color: '#ef4444',
  },
  recordingDot: {
    width: '8px',
    height: '8px',
    borderRadius: '50%',
    backgroundColor: '#ef4444',
    animation: 'pulse 1.5s infinite',
  },
  startButton: {
    padding: '8px 16px',
    backgroundColor: '#22c55e',
    color: 'white',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '14px',
  },
  stopButton: {
    padding: '8px 16px',
    backgroundColor: '#ef4444',
    color: 'white',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '14px',
  },
  playButton: {
    padding: '8px 16px',
    backgroundColor: '#3b82f6',
    color: 'white',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '14px',
  },
};

// =============================================================================
// Complete Usage Example
// =============================================================================

/**
 * Complete example showing how to use the recording system.
 * This component can be used as a starting point for your own implementation.
 */
export function BasicIntegrationExample() {
  return (
    <RecordingProvider>
      <div style={{ padding: '20px' }}>
        <h1>Session Recording Demo</h1>
        <RecordingControls />

        <div style={{ marginTop: '20px' }}>
          <p>Interact with this page and your actions will be recorded.</p>
          <input type="text" placeholder="Type something..." style={{ padding: '8px' }} />
          <button style={{ marginLeft: '8px', padding: '8px 16px' }}>Click Me</button>
        </div>
      </div>
    </RecordingProvider>
  );
}

export default BasicIntegrationExample;
