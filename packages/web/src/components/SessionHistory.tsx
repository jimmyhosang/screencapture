import { useRef } from 'react';
import type { SessionRecording } from '../utils/sessionStorage';
import './SessionHistory.css';

interface SessionHistoryProps {
  sessions: SessionRecording[];
  currentSessionId: string | null;
  storageStats: { usedMB: number; maxMB: number; sessionCount: number };
  onPlay: (id: string) => void;
  onDelete: (id: string) => void;
  onExport: (id: string) => void;
  onImport: (file: File) => void;
  onExportAll: () => void;
  onClearAll: () => void;
}

export function SessionHistory({
  sessions,
  currentSessionId,
  storageStats,
  onPlay,
  onDelete,
  onExport,
  onImport,
  onExportAll,
  onClearAll,
}: SessionHistoryProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      onImport(file);
      // Reset input so same file can be imported again
      e.target.value = '';
    }
  };

  const formatDuration = (ms: number): string => {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${minutes}:${secs.toString().padStart(2, '0')}`;
  };

  const formatDate = (timestamp: number): string => {
    const date = new Date(timestamp);
    return date.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const storagePercentage = (storageStats.usedMB / storageStats.maxMB) * 100;

  return (
    <div className="session-history">
      <div className="session-history-header">
        <h3>Session History</h3>
        <div className="session-actions">
          <button className="action-btn import-btn" onClick={handleImportClick} title="Import Session">
            ↑ Import
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/json,.json"
            onChange={handleFileChange}
            style={{ display: 'none' }}
          />
          <button
            className="action-btn export-all-btn"
            onClick={onExportAll}
            disabled={sessions.length === 0}
            title="Export All Sessions"
          >
            ↓ Export All
          </button>
          <button
            className="action-btn clear-all-btn"
            onClick={onClearAll}
            disabled={sessions.length === 0}
            title="Clear All Sessions"
          >
            🗑 Clear All
          </button>
        </div>
      </div>

      {/* Storage Stats */}
      <div className="storage-stats">
        <div className="storage-info">
          <span className="storage-label">Storage: {storageStats.sessionCount} sessions</span>
          <span className="storage-size">
            {storageStats.usedMB.toFixed(2)} MB / {storageStats.maxMB} MB
          </span>
        </div>
        <div className="storage-bar">
          <div
            className={`storage-fill ${storagePercentage > 80 ? 'warning' : ''}`}
            style={{ width: `${Math.min(storagePercentage, 100)}%` }}
          />
        </div>
      </div>

      {/* Session List */}
      <div className="session-list">
        {sessions.length === 0 ? (
          <div className="empty-state">
            <p>No recordings yet</p>
            <p className="empty-hint">Start recording to create your first session</p>
          </div>
        ) : (
          sessions.map((session) => (
            <div
              key={session.id}
              className={`session-item ${currentSessionId === session.id ? 'active' : ''}`}
            >
              <div className="session-info">
                <div className="session-name">{session.name}</div>
                <div className="session-meta">
                  <span className="session-date">{formatDate(session.timestamp)}</span>
                  <span className="session-duration">{formatDuration(session.duration)}</span>
                  <span className="session-events">{session.eventCount} events</span>
                </div>
                {session.privacyConfig && (
                  <div className="session-privacy">
                    {session.privacyConfig.maskAllInputs && <span className="privacy-tag">🔒 Masked</span>}
                    {session.privacyConfig.blockSensitiveElements && <span className="privacy-tag">🚫 Blocked</span>}
                    {session.privacyConfig.maskTextPatterns && <span className="privacy-tag">🔐 PII</span>}
                  </div>
                )}
              </div>
              <div className="session-actions-row">
                <button
                  className="session-btn play-btn"
                  onClick={() => onPlay(session.id)}
                  title="Play Recording"
                >
                  ▶
                </button>
                <button
                  className="session-btn export-btn"
                  onClick={() => onExport(session.id)}
                  title="Export Session"
                >
                  ↓
                </button>
                <button
                  className="session-btn delete-btn"
                  onClick={() => onDelete(session.id)}
                  title="Delete Session"
                >
                  ×
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
