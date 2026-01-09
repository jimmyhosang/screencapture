import { useState, useEffect, useCallback } from 'react';
import './DesktopCaptureControls.css';

interface CaptureSource {
  id: string;
  name: string;
  thumbnail: string;
  isScreen: boolean;
  isWindow: boolean;
}

// Thumbnail component with error handling
function SourceThumbnail({ src, alt, isScreen }: { src: string; alt: string; isScreen: boolean }) {
  const [hasError, setHasError] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const fallbackIcon = isScreen ? '🖥️' : '📋';

  // Check if thumbnail is valid
  const isValidThumbnail = src && src.startsWith('data:image');

  if (!isValidThumbnail || hasError) {
    return <div className="source-thumbnail placeholder">{fallbackIcon}</div>;
  }

  return (
    <>
      {isLoading && <div className="source-thumbnail placeholder loading">{fallbackIcon}</div>}
      <img
        src={src}
        alt={alt}
        className="source-thumbnail"
        style={{ display: isLoading ? 'none' : 'block' }}
        onLoad={() => setIsLoading(false)}
        onError={() => {
          setHasError(true);
          setIsLoading(false);
        }}
      />
    </>
  );
}

interface SessionProgress {
  sessionId: string;
  duration: number;
  inputEventCount: number;
  windowChangeCount: number;
}

interface CaptureConfig {
  quality: 'low' | 'medium' | 'high' | 'ultra';
  captureInputs: boolean;
  captureWindowActivity: boolean;
  keyboardMode: 'full' | 'masked' | 'none';
  enablePrivacyFilter: boolean;
}

interface DesktopCaptureControlsProps {
  onRecordingComplete?: (result: {
    sessionId: string;
    videoPath: string;
    duration: number;
    inputEventCount: number;
  }) => void;
}

const QUALITY_LABELS: Record<string, string> = {
  low: '720p (15fps) - Small files',
  medium: '1080p (24fps) - Balanced',
  high: '1080p (30fps) - High quality',
  ultra: 'Native (30fps) - Best quality'
};

export default function DesktopCaptureControls({ onRecordingComplete }: DesktopCaptureControlsProps): JSX.Element {
  const [sources, setSources] = useState<CaptureSource[]>([]);
  const [selectedSource, setSelectedSource] = useState<CaptureSource | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [progress, setProgress] = useState<SessionProgress | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [config, setConfig] = useState<CaptureConfig>({
    quality: 'medium',
    captureInputs: true,
    captureWindowActivity: true,
    keyboardMode: 'masked',
    enablePrivacyFilter: true
  });

  // Check if running in Electron with sessionManager available
  const isElectron = typeof window !== 'undefined' && window.api?.sessionManager;

  // Load available sources
  const loadSources = useCallback(async () => {
    if (!isElectron) return;

    setIsLoading(true);
    try {
      const sourcesData = await window.api.sessionManager.getSources();
      setSources(sourcesData);

      // Auto-select first screen if available
      const firstScreen = sourcesData.find(s => s.isScreen);
      if (firstScreen) {
        setSelectedSource(firstScreen);
      }
    } catch (err) {
      setError('Failed to load capture sources');
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  }, [isElectron]);

  // Load sources on mount
  useEffect(() => {
    loadSources();
  }, [loadSources]);

  // Set up event listeners
  useEffect(() => {
    if (!isElectron) return;

    const handleProgress = (data: SessionProgress) => {
      setProgress(data);
    };

    const handleStarted = (data: { sessionId: string }) => {
      setSessionId(data.sessionId);
      setIsRecording(true);
      setIsPaused(false);
    };

    const handleStopped = (data: { sessionId: string; result: Record<string, unknown> }) => {
      setIsRecording(false);
      setIsPaused(false);
      setSessionId(null);
      setProgress(null);

      if (onRecordingComplete && data.result) {
        onRecordingComplete({
          sessionId: data.sessionId,
          videoPath: data.result.videoPath as string,
          duration: data.result.duration as number,
          inputEventCount: data.result.inputEventCount as number
        });
      }
    };

    const handleError = (data: { sessionId: string; error: string }) => {
      setError(data.error);
      setIsRecording(false);
      setIsPaused(false);
    };

    const handlePaused = () => setIsPaused(true);
    const handleResumed = () => setIsPaused(false);

    window.api.sessionManager.onProgress(handleProgress);
    window.api.sessionManager.onStarted(handleStarted);
    window.api.sessionManager.onStopped(handleStopped);
    window.api.sessionManager.onError(handleError);
    window.api.sessionManager.onPaused(handlePaused);
    window.api.sessionManager.onResumed(handleResumed);

    return () => {
      window.api.sessionManager.removeAllListeners();
    };
  }, [isElectron, onRecordingComplete]);

  const handleStartRecording = async () => {
    if (!selectedSource) {
      setError('Please select a capture source');
      return;
    }

    setError(null);

    try {
      const newSessionId = await window.api.sessionManager.start(selectedSource.id, {
        quality: config.quality,
        captureInputs: config.captureInputs,
        captureWindowActivity: config.captureWindowActivity,
        keyboardMode: config.keyboardMode,
        enablePrivacyFilter: config.enablePrivacyFilter
      });
      setSessionId(newSessionId);
      setIsRecording(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start recording');
    }
  };

  const handleStopRecording = async () => {
    if (!sessionId) return;

    try {
      await window.api.sessionManager.stop(sessionId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to stop recording');
    }
  };

  const handlePauseResume = async () => {
    if (!sessionId) return;

    try {
      if (isPaused) {
        await window.api.sessionManager.resume(sessionId);
      } else {
        await window.api.sessionManager.pause(sessionId);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to pause/resume');
    }
  };

  const formatDuration = (ms: number): string => {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);

    if (hours > 0) {
      return `${hours}:${String(minutes % 60).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
    }
    return `${minutes}:${String(seconds % 60).padStart(2, '0')}`;
  };

  // Not in Electron
  if (!isElectron) {
    return (
      <div className="desktop-capture-controls">
        <h2>🖥️ Desktop Capture</h2>
        <div className="error-message" style={{
          padding: '24px',
          textAlign: 'center',
          backgroundColor: 'rgba(239, 68, 68, 0.1)',
          borderRadius: '8px',
          marginTop: '16px'
        }}>
          <p style={{ fontSize: '18px', marginBottom: '8px' }}>⚠️ Electron Required</p>
          <p style={{ opacity: 0.8 }}>Desktop capture requires the native Electron application.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="desktop-capture-controls">
      <h2>🖥️ Desktop Capture</h2>

      {/* Source Selection */}
      {!isRecording && (
        <div className="source-selection">
          <div className="source-header">
            <h3>Select Capture Source</h3>
            <button
              className="btn btn-secondary btn-sm"
              onClick={loadSources}
              disabled={isLoading}
            >
              🔄 Refresh
            </button>
          </div>

          {isLoading ? (
            <div className="loading-sources">Loading sources...</div>
          ) : (
            <div className="source-grid">
              {/* Screens */}
              <div className="source-group">
                <h4>Screens</h4>
                <div className="source-list">
                  {sources.filter(s => s.isScreen).map(source => (
                    <div
                      key={source.id}
                      className={`source-item ${selectedSource?.id === source.id ? 'selected' : ''}`}
                      onClick={() => setSelectedSource(source)}
                    >
                      <SourceThumbnail src={source.thumbnail} alt={source.name} isScreen={true} />
                      <span className="source-name">{source.name}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Windows */}
              <div className="source-group">
                <h4>Windows</h4>
                <div className="source-list">
                  {sources.filter(s => s.isWindow).slice(0, 10).map(source => (
                    <div
                      key={source.id}
                      className={`source-item ${selectedSource?.id === source.id ? 'selected' : ''}`}
                      onClick={() => setSelectedSource(source)}
                    >
                      <SourceThumbnail src={source.thumbnail} alt={source.name} isScreen={false} />
                      <span className="source-name">{source.name}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Recording Config */}
      {!isRecording && (
        <div className="capture-config">
          <h3>Recording Settings</h3>

          <div className="config-row">
            <label htmlFor="quality">Quality</label>
            <select
              id="quality"
              value={config.quality}
              onChange={(e) => setConfig({ ...config, quality: e.target.value as CaptureConfig['quality'] })}
            >
              {Object.entries(QUALITY_LABELS).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </div>

          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={config.captureInputs}
              onChange={(e) => setConfig({ ...config, captureInputs: e.target.checked })}
            />
            <span>Capture mouse & keyboard inputs</span>
          </label>

          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={config.captureWindowActivity}
              onChange={(e) => setConfig({ ...config, captureWindowActivity: e.target.checked })}
            />
            <span>Track active window changes</span>
          </label>

          {config.captureInputs && (
            <div className="config-row nested">
              <label htmlFor="keyboardMode">Keyboard Capture</label>
              <select
                id="keyboardMode"
                value={config.keyboardMode}
                onChange={(e) => setConfig({ ...config, keyboardMode: e.target.value as CaptureConfig['keyboardMode'] })}
              >
                <option value="masked">Masked (recommended)</option>
                <option value="full">Full capture</option>
                <option value="none">None (privacy)</option>
              </select>
            </div>
          )}

          {config.captureInputs && (
            <label className="checkbox-label nested">
              <input
                type="checkbox"
                checked={config.enablePrivacyFilter}
                onChange={(e) => setConfig({ ...config, enablePrivacyFilter: e.target.checked })}
              />
              <span>Filter inputs in sensitive apps (password managers, banking)</span>
            </label>
          )}
        </div>
      )}

      {/* Recording Status */}
      {isRecording && progress && (
        <div className="recording-status">
          <div className="status-header">
            <span className={`recording-indicator ${isPaused ? 'paused' : ''}`}></span>
            <span className="status-text">
              {isPaused ? 'Recording Paused' : 'Recording in Progress'}
            </span>
          </div>

          <div className="progress-stats">
            <div className="stat">
              <span className="stat-value">{formatDuration(progress.duration)}</span>
              <span className="stat-label">Duration</span>
            </div>
            <div className="stat">
              <span className="stat-value">{progress.inputEventCount.toLocaleString()}</span>
              <span className="stat-label">Input Events</span>
            </div>
            <div className="stat">
              <span className="stat-value">{progress.windowChangeCount}</span>
              <span className="stat-label">Window Changes</span>
            </div>
          </div>

          {selectedSource && (
            <div className="source-info">
              Recording: <strong>{selectedSource.name}</strong>
            </div>
          )}
        </div>
      )}

      {/* Error Display */}
      {error && (
        <div className="error-message">
          {error}
          <button className="btn-dismiss" onClick={() => setError(null)}>×</button>
        </div>
      )}

      {/* Action Buttons */}
      <div className="action-buttons">
        {!isRecording ? (
          <button
            className="btn btn-record"
            onClick={handleStartRecording}
            disabled={!selectedSource || isLoading}
          >
            ⏺ Start Capture
          </button>
        ) : (
          <>
            <button
              className="btn btn-pause"
              onClick={handlePauseResume}
            >
              {isPaused ? '▶️ Resume' : '⏸️ Pause'}
            </button>
            <button
              className="btn btn-stop"
              onClick={handleStopRecording}
            >
              ⏹ Stop Capture
            </button>
          </>
        )}
      </div>
    </div>
  );
}
