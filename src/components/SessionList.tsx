import { useState, useCallback, useRef } from 'react';
import type { eventWithTime } from '@rrweb/types';
import {
  listSessions,
  loadSession,
  deleteSession,
  exportSession,
  importSession,
  formatDuration,
  getStorageSize,
  type SessionSummary,
} from '../utils/sessionStorage';
import './SessionList.css';

interface SessionListProps {
  /** Callback when a session is selected for replay */
  onReplay: (events: eventWithTime[]) => void;
  /** Currently recorded events (to show "current session" option) */
  currentEvents?: eventWithTime[];
  /** Whether recording is currently active */
  isRecording?: boolean;
}

/**
 * Component that displays saved recording sessions with management controls.
 */
export function SessionList({ onReplay, currentEvents, isRecording }: SessionListProps) {
  // Use lazy initialization to load sessions immediately
  const [sessions, setSessions] = useState<SessionSummary[]>(() => listSessions());
  const [storageInfo, setStorageInfo] = useState<{ bytes: number; formatted: string }>(
    () => getStorageSize()
  );
  const [isLoading, setIsLoading] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [importSuccess, setImportSuccess] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load sessions - using lazy initialization for initial state
  const refreshSessions = useCallback(() => {
    const sessionList = listSessions();
    setSessions(sessionList);
    setStorageInfo(getStorageSize());
    setIsLoading(false);
  }, []);

  // Handle replay
  const handleReplay = useCallback(
    (id: string) => {
      const session = loadSession(id);
      if (session) {
        onReplay(session.events);
      }
    },
    [onReplay]
  );

  // Handle delete
  const handleDelete = useCallback((id: string) => {
    setDeleteConfirm(id);
  }, []);

  const confirmDelete = useCallback(
    (id: string) => {
      deleteSession(id);
      setDeleteConfirm(null);
      refreshSessions();
    },
    [refreshSessions]
  );

  const cancelDelete = useCallback(() => {
    setDeleteConfirm(null);
  }, []);

  // Handle export
  const handleExport = useCallback((id: string) => {
    try {
      exportSession(id);
    } catch (error) {
      console.error('Export failed:', error);
    }
  }, []);

  // Handle import
  const handleImportClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleFileChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      setImportError(null);
      setImportSuccess(null);

      const result = await importSession(file);
      if (result.success && result.session) {
        setImportSuccess(`Imported session with ${result.session.events.length} events`);
        refreshSessions();
        setTimeout(() => setImportSuccess(null), 3000);
      } else {
        setImportError(result.error || 'Import failed');
        setTimeout(() => setImportError(null), 5000);
      }

      // Reset the input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    },
    [refreshSessions]
  );

  // Play current session
  const handlePlayCurrent = useCallback(() => {
    if (currentEvents && currentEvents.length >= 2) {
      onReplay(currentEvents);
    }
  }, [currentEvents, onReplay]);

  return (
    <div className="session-list">
      <div className="session-list-header">
        <h3>Saved Sessions</h3>
        <div className="session-list-actions">
          <button className="import-btn" onClick={handleImportClick}>
            <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16">
              <path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z" />
            </svg>
            Import
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".json"
            onChange={handleFileChange}
            style={{ display: 'none' }}
          />
        </div>
      </div>

      {/* Import feedback */}
      {importError && (
        <div className="import-feedback import-feedback--error">
          <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16">
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z" />
          </svg>
          {importError}
        </div>
      )}
      {importSuccess && (
        <div className="import-feedback import-feedback--success">
          <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16">
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z" />
          </svg>
          {importSuccess}
        </div>
      )}

      {/* Current session */}
      {currentEvents && currentEvents.length >= 2 && !isRecording && (
        <div className="session-item session-item--current">
          <div className="session-info">
            <div className="session-title">
              <span className="session-badge session-badge--current">Current</span>
              <span className="session-events">{currentEvents.length} events</span>
            </div>
            <div className="session-meta">
              <span>
                Duration:{' '}
                {formatDuration(
                  (currentEvents[currentEvents.length - 1]?.timestamp || 0) -
                    (currentEvents[0]?.timestamp || 0)
                )}
              </span>
            </div>
          </div>
          <div className="session-actions">
            <button className="action-btn action-btn--play" onClick={handlePlayCurrent}>
              <svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18">
                <path d="M8 5v14l11-7z" />
              </svg>
            </button>
          </div>
        </div>
      )}

      {/* Session list */}
      {isLoading ? (
        <div className="session-list-loading">Loading sessions...</div>
      ) : sessions.length === 0 ? (
        <div className="session-list-empty">
          <svg viewBox="0 0 24 24" fill="currentColor" width="48" height="48">
            <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H5V5h14v14zM12 6c-3.31 0-6 2.69-6 6s2.69 6 6 6 6-2.69 6-6-2.69-6-6-6zm-1 9H9V9h2v6zm4 0h-2V9h2v6z" />
          </svg>
          <p>No saved sessions yet</p>
          <p className="session-list-hint">Record a session and save it to see it here</p>
        </div>
      ) : (
        <div className="session-items">
          {sessions.map((session) => (
            <div
              key={session.id}
              className={`session-item ${deleteConfirm === session.id ? 'session-item--deleting' : ''}`}
            >
              {deleteConfirm === session.id ? (
                <div className="delete-confirm">
                  <span>Delete this session?</span>
                  <div className="delete-confirm-actions">
                    <button
                      className="confirm-btn confirm-btn--delete"
                      onClick={() => confirmDelete(session.id)}
                    >
                      Delete
                    </button>
                    <button className="confirm-btn confirm-btn--cancel" onClick={cancelDelete}>
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="session-info">
                    <div className="session-title">
                      <span className="session-date">{session.date}</span>
                      <span className="session-events">{session.eventCount} events</span>
                    </div>
                    <div className="session-meta">
                      <span className="session-duration">{formatDuration(session.duration)}</span>
                      <span className="session-url" title={session.url}>
                        {session.url}
                      </span>
                    </div>
                  </div>
                  <div className="session-actions">
                    <button
                      className="action-btn action-btn--play"
                      onClick={() => handleReplay(session.id)}
                      title="Replay session"
                    >
                      <svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18">
                        <path d="M8 5v14l11-7z" />
                      </svg>
                    </button>
                    <button
                      className="action-btn action-btn--export"
                      onClick={() => handleExport(session.id)}
                      title="Export session"
                    >
                      <svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18">
                        <path d="M19 12v7H5v-7H3v7c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2v-7h-2zm-6 .67l2.59-2.58L17 11.5l-5 5-5-5 1.41-1.41L11 12.67V3h2v9.67z" />
                      </svg>
                    </button>
                    <button
                      className="action-btn action-btn--delete"
                      onClick={() => handleDelete(session.id)}
                      title="Delete session"
                    >
                      <svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18">
                        <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z" />
                      </svg>
                    </button>
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Storage info */}
      {sessions.length > 0 && (
        <div className="storage-info">
          <span className="storage-label">Storage used:</span>
          <span className="storage-value">{storageInfo.formatted}</span>
        </div>
      )}
    </div>
  );
}
