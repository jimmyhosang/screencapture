import React, { useCallback, useEffect, useState } from 'react';
import VideoPlayerModal from './components/VideoPlayerModal';
import { initializeMediaCapture, cleanupMediaCapture } from './services/media-capture';

interface Source {
  id: string;
  name: string;
  thumbnail: string;
  isScreen: boolean;
  isWindow: boolean;
}

interface Recording {
  id: string;
  filename: string;
  startTime: number;
  duration: number;
  filePath: string;
  thumbnailBase64?: string;
}

type Status =
  | { kind: 'idle' }
  | { kind: 'starting' }
  | { kind: 'recording'; startedAt: number }
  | { kind: 'stopping' }
  | { kind: 'redacting'; message: string; progress?: number }
  | { kind: 'saved'; piiCount: number };

function formatDuration(ms: number): string {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  return `${m}:${(s % 60).toString().padStart(2, '0')}`;
}

function formatDate(ts: number): string {
  return new Date(ts).toLocaleString();
}

function App(): React.JSX.Element {
  const [sources, setSources] = useState<Source[]>([]);
  const [selectedSourceId, setSelectedSourceId] = useState<string>('');
  const [autoRedact, setAutoRedact] = useState(true);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [status, setStatus] = useState<Status>({ kind: 'idle' });
  const [recordings, setRecordings] = useState<Recording[]>([]);
  const [playing, setPlaying] = useState<Recording | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);

  const loadRecordings = useCallback(async () => {
    if (!window.api?.indexer?.list) return;
    try {
      const result = await window.api.indexer.list({}, 1, 20);
      const all = result.recordings ?? [];
      // Indexer can return the same recording twice during reindex races; dedupe by id.
      const seen = new Set<string>();
      const unique = all.filter((r) => (seen.has(r.id) ? false : seen.add(r.id)));
      setRecordings(unique);
    } catch (err) {
      console.error('Failed to load recordings:', err);
    }
  }, []);

  const loadSources = useCallback(async () => {
    if (!window.api?.sessionManager?.getSources) return;
    try {
      const list = await window.api.sessionManager.getSources();
      setSources(list);
      if (list.length > 0) {
        setSelectedSourceId((prev) => prev || list[0].id);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to enumerate screens');
    }
  }, []);

  // Bootstrap: media capture bridge, sources, auto-redaction default ON, recordings.
  useEffect(() => {
    initializeMediaCapture();
    loadSources();
    loadRecordings();

    // Default the persisted config to enabled so the demo always redacts.
    if (window.api?.sessionManager?.setAutoRedactionConfig) {
      window.api.sessionManager
        .setAutoRedactionConfig({ enabled: true })
        .catch((err) => console.error('Failed to enable auto-redaction:', err));
    }

    return () => cleanupMediaCapture();
  }, [loadSources, loadRecordings]);

  // Tick elapsed time while recording
  useEffect(() => {
    if (status.kind !== 'recording') return;
    const id = setInterval(() => setElapsed(Date.now() - status.startedAt), 250);
    return () => clearInterval(id);
  }, [status]);

  // Subscribe to session lifecycle events from main
  useEffect(() => {
    const api = window.api?.sessionManager;
    if (!api) return;

    api.onStarted(({ sessionId: sid }) => {
      setSessionId(sid);
      setStatus({ kind: 'recording', startedAt: Date.now() });
    });

    api.onStopping(() => setStatus({ kind: 'stopping' }));

    api.onStopped((data) => {
      setSessionId(null);
      // session:stopped fires after redaction completes; pull final pii count from the result if present.
      const redaction = (data as { result?: { redaction?: { piiRegionsFound?: number } } })?.result?.redaction;
      const piiCount = redaction?.piiRegionsFound ?? 0;
      setStatus({ kind: 'saved', piiCount });
      setTimeout(() => setStatus({ kind: 'idle' }), 4000);
      loadRecordings();
    });

    api.onError(({ error: msg }) => {
      setError(msg ?? 'Recording error');
      setSessionId(null);
      setStatus({ kind: 'idle' });
    });

    api.onRedacting?.(({ message }) => {
      setStatus({ kind: 'redacting', message: message ?? 'Analyzing for PII…' });
    });

    api.onRedactionProgress?.((data) => {
      const progress = data as {
        stage?: 'extracting' | 'analyzing' | 'redacting' | 'complete' | 'error';
        progress?: number;
        message?: string;
        piiFound?: number;
      };
      // `session:stopped` handles the terminal "saved" state; here we just show interim progress.
      if (progress.stage && progress.stage !== 'complete' && progress.stage !== 'error') {
        setStatus({
          kind: 'redacting',
          message: progress.message ?? 'Redacting…',
          progress: progress.progress
        });
      }
    });

    return () => api.removeAllListeners?.();
  }, [loadRecordings]);

  const handleStart = async () => {
    setError(null);
    const api = window.api?.sessionManager;
    if (!api) {
      setError('Session manager not ready');
      return;
    }
    if (!selectedSourceId) {
      setError('Select a screen or window first');
      return;
    }
    setStatus({ kind: 'starting' });
    try {
      await api.setAutoRedactionConfig({ enabled: autoRedact });
      await api.start(selectedSourceId, {
        quality: 'high',
        captureInputs: false,
        captureWindowActivity: false
      });
      // onStarted listener will flip status -> recording
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start');
      setStatus({ kind: 'idle' });
    }
  };

  const handleStop = async () => {
    const api = window.api?.sessionManager;
    if (!api || !sessionId) return;
    try {
      await api.stop(sessionId);
      // onStopping / onStopped / redaction events drive the rest
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to stop');
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.api?.indexer?.delete) return;
    await window.api.indexer.delete(id);
    loadRecordings();
  };

  const isRecording = status.kind === 'recording';
  const isBusy = ['starting', 'stopping', 'redacting'].includes(status.kind);

  const statusLine = (() => {
    switch (status.kind) {
      case 'idle':
        return 'Ready';
      case 'starting':
        return 'Starting capture…';
      case 'recording':
        return `Recording · ${formatDuration(elapsed)}`;
      case 'stopping':
        return 'Stopping…';
      case 'redacting':
        return status.progress != null
          ? `${status.message} ${Math.round(status.progress)}%`
          : status.message;
      case 'saved':
        return status.piiCount > 0
          ? `Saved · redacted ${status.piiCount} PII region${status.piiCount === 1 ? '' : 's'}`
          : 'Saved · no PII detected';
    }
  })();

  return (
    <div className="mojo-app">
      <header className="mojo-header">
        <div className="mojo-wordmark">
          MOJO<span className="mojo-wordmark-cx">-CX</span>
          <span className="mojo-wordmark-copy">©</span>
        </div>
        <div className="mojo-tagline">Capture · Redact · Replay</div>
      </header>

      <main className="mojo-main">
        <h1 className="mojo-display">UNLOCK YOUR AGENT POTENTIAL</h1>

        <section className="mojo-card">
          <div className="mojo-field">
            <label htmlFor="source" className="mojo-label">
              Source
            </label>
            <select
              id="source"
              className="mojo-select"
              value={selectedSourceId}
              onChange={(e) => setSelectedSourceId(e.target.value)}
              disabled={isRecording || isBusy}
            >
              {sources.length === 0 && <option value="">No screens available</option>}
              {sources.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.isScreen ? '🖥️' : '🪟'} {s.name}
                </option>
              ))}
            </select>
          </div>

          <div className="mojo-toggle-row">
            <button
              type="button"
              role="switch"
              aria-checked={autoRedact}
              className={`mojo-toggle ${autoRedact ? 'on' : ''}`}
              onClick={() => setAutoRedact((v) => !v)}
              disabled={isRecording || isBusy}
            >
              <span className="mojo-toggle-knob" />
            </button>
            <div className="mojo-toggle-text">
              <div className="mojo-toggle-title">Auto-redact PII</div>
              <div className="mojo-toggle-desc">
                Detects emails, phone numbers, SSNs, and credit cards after capture.
              </div>
            </div>
          </div>

          <button
            type="button"
            className={`mojo-record-btn ${isRecording ? 'recording' : ''}`}
            onClick={isRecording ? handleStop : handleStart}
            disabled={isBusy && !isRecording}
          >
            <span className="mojo-record-dot" />
            {isRecording ? 'STOP RECORDING' : 'START RECORDING'}
          </button>

          <div className="mojo-status" data-kind={status.kind}>
            {statusLine}
          </div>

          {error && <div className="mojo-error">{error}</div>}
        </section>

        <section className="mojo-recordings">
          <div className="mojo-recordings-header">
            <h2 className="mojo-h2">Recent recordings</h2>
            <button className="mojo-link" onClick={loadRecordings}>
              Refresh
            </button>
          </div>

          {recordings.length === 0 ? (
            <div className="mojo-empty">No recordings yet.</div>
          ) : (
            <ul className="mojo-recording-list">
              {recordings.map((r) => (
                <li key={r.id} className="mojo-recording-item">
                  <div className="mojo-recording-meta">
                    <div className="mojo-recording-name">{r.filename.replace('.webm', '')}</div>
                    <div className="mojo-recording-sub">
                      {formatDate(r.startTime)} · {formatDuration(r.duration)}
                    </div>
                  </div>
                  <div className="mojo-recording-actions">
                    <button className="mojo-btn-ghost" onClick={() => setPlaying(r)}>
                      Play
                    </button>
                    <button className="mojo-btn-ghost mojo-danger" onClick={() => handleDelete(r.id)}>
                      Delete
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>

      {playing && (
        <VideoPlayerModal
          filePath={playing.filePath}
          title={playing.filename}
          recordingId={playing.id}
          onClose={() => setPlaying(null)}
        />
      )}
    </div>
  );
}

export default App;
