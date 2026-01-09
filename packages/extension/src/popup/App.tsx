import { useState, useEffect, useCallback } from 'react';
import type {
  RecordingState,
  StateUpdatePayload,
  SessionMetadata,
  PrivacySettings,
} from '../types';

interface RecordingInfo {
  state: RecordingState;
  eventCount: number;
  startTime?: number;
  url?: string;
  duration: number;
}

function App() {
  const [recordingInfo, setRecordingInfo] = useState<RecordingInfo>({
    state: 'idle',
    eventCount: 0,
    duration: 0,
  });
  const [sessions, setSessions] = useState<SessionMetadata[]>([]);
  const [showSettings, setShowSettings] = useState(false);
  const [settings, setSettings] = useState<PrivacySettings>({
    maskAllInputs: true,
    maskTextContent: true,
    blockSelectors: ['.do-not-record', '[data-private]'],
    redactionConfig: {
      email: true,
      phone: true,
      ssn: true,
      creditCard: true,
    },
  });

  // Format duration
  const formatDuration = (ms: number): string => {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);

    if (hours > 0) {
      return `${hours}:${String(minutes % 60).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
    }
    return `${minutes}:${String(seconds % 60).padStart(2, '0')}`;
  };

  // Fetch current state
  const fetchState = useCallback(async () => {
    try {
      const response = await chrome.runtime.sendMessage({ type: 'GET_STATE' });
      if (response) {
        const now = Date.now();
        setRecordingInfo({
          state: response.state || 'idle',
          eventCount: response.eventCount || 0,
          startTime: response.startTime,
          url: response.url,
          duration: response.startTime ? now - response.startTime : 0,
        });
      }
    } catch (error) {
      console.error('Failed to get state:', error);
    }
  }, []);

  // Fetch sessions
  const fetchSessions = useCallback(async () => {
    try {
      const response = await chrome.runtime.sendMessage({ type: 'GET_SESSIONS' });
      if (response?.sessions) {
        setSessions(response.sessions);
      }
    } catch (error) {
      console.error('Failed to get sessions:', error);
    }
  }, []);

  // Initial load
  useEffect(() => {
    fetchState();
    fetchSessions();
  }, [fetchState, fetchSessions]);

  // Update duration while recording
  useEffect(() => {
    if (recordingInfo.state === 'recording' && recordingInfo.startTime) {
      const interval = setInterval(() => {
        setRecordingInfo((prev) => ({
          ...prev,
          duration: Date.now() - (prev.startTime || Date.now()),
        }));
      }, 1000);
      return () => clearInterval(interval);
    }
  }, [recordingInfo.state, recordingInfo.startTime]);

  // Listen for state updates from background
  useEffect(() => {
    const handleMessage = (message: { type: string; payload?: StateUpdatePayload }) => {
      if (message.type === 'STATE_UPDATE' && message.payload) {
        const { state, eventCount, startTime, url } = message.payload;
        const now = Date.now();
        setRecordingInfo({
          state,
          eventCount,
          startTime,
          url,
          duration: startTime ? now - startTime : 0,
        });
      }
    };

    chrome.runtime.onMessage.addListener(handleMessage);
    return () => chrome.runtime.onMessage.removeListener(handleMessage);
  }, []);

  // Start recording
  const handleStartRecording = async () => {
    try {
      await chrome.runtime.sendMessage({
        type: 'START_RECORDING',
        payload: { settings },
      });
      await fetchState();
    } catch (error) {
      console.error('Failed to start recording:', error);
    }
  };

  // Stop recording
  const handleStopRecording = async () => {
    try {
      await chrome.runtime.sendMessage({ type: 'STOP_RECORDING' });
      await fetchState();
      await fetchSessions();
    } catch (error) {
      console.error('Failed to stop recording:', error);
    }
  };

  // Delete session
  const handleDeleteSession = async (sessionId: string) => {
    try {
      await chrome.runtime.sendMessage({
        type: 'DELETE_SESSION',
        payload: sessionId,
      });
      await fetchSessions();
    } catch (error) {
      console.error('Failed to delete session:', error);
    }
  };

  // Export session
  const handleExportSession = async (sessionId: string) => {
    try {
      const response = await chrome.runtime.sendMessage({
        type: 'EXPORT_SESSION',
        payload: sessionId,
      });

      if (response?.session) {
        const dataStr = JSON.stringify(response.session, null, 2);
        const blob = new Blob([dataStr], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `session-${response.session.name}.json`;
        link.click();
        URL.revokeObjectURL(url);
      }
    } catch (error) {
      console.error('Failed to export session:', error);
    }
  };

  // Toggle setting
  const toggleSetting = (key: keyof PrivacySettings | keyof typeof settings.redactionConfig) => {
    if (key in settings.redactionConfig) {
      setSettings((prev) => ({
        ...prev,
        redactionConfig: {
          ...prev.redactionConfig,
          [key]: !prev.redactionConfig[key as keyof typeof prev.redactionConfig],
        },
      }));
    } else {
      setSettings((prev) => ({
        ...prev,
        [key]: !prev[key as keyof PrivacySettings],
      }));
    }
  };

  return (
    <div className="popup">
      {/* Header */}
      <header className="header">
        <h1>Screencapture</h1>
        <button
          className="settings-btn"
          onClick={() => setShowSettings(!showSettings)}
          title="Settings"
        >
          {showSettings ? '✕' : '⚙'}
        </button>
      </header>

      {/* Settings Panel */}
      {showSettings && (
        <div className="settings-panel">
          <h3>Privacy Settings</h3>
          <label className="toggle-row">
            <input
              type="checkbox"
              checked={settings.maskAllInputs}
              onChange={() => toggleSetting('maskAllInputs')}
            />
            <span>Mask all inputs</span>
          </label>
          <label className="toggle-row">
            <input
              type="checkbox"
              checked={settings.maskTextContent}
              onChange={() => toggleSetting('maskTextContent')}
            />
            <span>Mask PII in text</span>
          </label>

          <h4>Redact PII Types</h4>
          <label className="toggle-row">
            <input
              type="checkbox"
              checked={settings.redactionConfig.email}
              onChange={() => toggleSetting('email')}
            />
            <span>Emails</span>
          </label>
          <label className="toggle-row">
            <input
              type="checkbox"
              checked={settings.redactionConfig.phone}
              onChange={() => toggleSetting('phone')}
            />
            <span>Phone numbers</span>
          </label>
          <label className="toggle-row">
            <input
              type="checkbox"
              checked={settings.redactionConfig.ssn}
              onChange={() => toggleSetting('ssn')}
            />
            <span>SSNs</span>
          </label>
          <label className="toggle-row">
            <input
              type="checkbox"
              checked={settings.redactionConfig.creditCard}
              onChange={() => toggleSetting('creditCard')}
            />
            <span>Credit cards</span>
          </label>
        </div>
      )}

      {/* Recording Status */}
      <div className={`status ${recordingInfo.state}`}>
        {recordingInfo.state === 'recording' ? (
          <>
            <div className="recording-indicator">
              <span className="dot"></span>
              Recording
            </div>
            <div className="stats">
              <span>{formatDuration(recordingInfo.duration)}</span>
              <span>{recordingInfo.eventCount} events</span>
            </div>
            {recordingInfo.url && (
              <div className="url" title={recordingInfo.url}>
                {new URL(recordingInfo.url).hostname}
              </div>
            )}
          </>
        ) : (
          <div className="idle-status">Ready to record</div>
        )}
      </div>

      {/* Controls */}
      <div className="controls">
        {recordingInfo.state === 'idle' ? (
          <button className="btn primary" onClick={handleStartRecording}>
            Start Recording
          </button>
        ) : (
          <button className="btn danger" onClick={handleStopRecording}>
            Stop Recording
          </button>
        )}
      </div>

      {/* Sessions List */}
      <div className="sessions">
        <h3>Recent Sessions ({sessions.length})</h3>
        {sessions.length === 0 ? (
          <div className="no-sessions">No recordings yet</div>
        ) : (
          <ul className="session-list">
            {sessions.slice(0, 5).map((session) => (
              <li key={session.id} className="session-item">
                <div className="session-info">
                  <span className="session-name">{session.name}</span>
                  <span className="session-meta">
                    {formatDuration(session.duration)} · {session.eventCount} events
                  </span>
                </div>
                <div className="session-actions">
                  <button
                    className="btn-icon"
                    onClick={() => handleExportSession(session.id)}
                    title="Export"
                  >
                    ↓
                  </button>
                  <button
                    className="btn-icon danger"
                    onClick={() => handleDeleteSession(session.id)}
                    title="Delete"
                  >
                    ✕
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Footer */}
      <footer className="footer">
        <span>Privacy-first session recording</span>
      </footer>
    </div>
  );
}

export default App;
