import { useState, useCallback, useRef, useEffect } from 'react';
import type { eventWithTime } from '@rrweb/types';
import {
  listSessionsExtended,
  loadSession,
  deleteSession,
  exportSession,
  importSession,
  formatDuration,
  getStorageStats,
  cleanupSessions,
  clearAllSessions,
  type ExtendedSessionSummary,
  type StorageStats,
} from '../utils/sessionStorage';
import { StorageSettings } from './StorageSettings';
import './SessionList.css';

interface SessionListProps {
  /** Callback when a session is selected for replay */
  onReplay: (events: eventWithTime[]) => void;
  /** Currently recorded events (to show "current session" option) */
  currentEvents?: eventWithTime[];
  /** Whether recording is currently active */
  isRecording?: boolean;
  /** Auto-refresh interval in ms (0 to disable) */
  refreshInterval?: number;
  /** Show storage settings panel */
  showSettings?: boolean;
}

/**
 * Component that displays saved recording sessions with management controls.
 */
export function SessionList({
  onReplay,
  currentEvents,
  isRecording,
  refreshInterval = 5000,
  showSettings: initialShowSettings = false,
}: SessionListProps) {
  // Use lazy initialization to load sessions immediately
  const [sessions, setSessions] = useState<ExtendedSessionSummary[]>(() => listSessionsExtended());
  const [stats, setStats] = useState<StorageStats | null>(() => getStorageStats());
  const [isLoading, setIsLoading] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [clearAllConfirm, setClearAllConfirm] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [importSuccess, setImportSuccess] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(initialShowSettings);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [sortBy, setSortBy] = useState<'date' | 'duration' | 'events'>('date');
  const [sortDesc, setSortDesc] = useState(true);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load sessions
  const refreshSessions = useCallback(() => {
    const sessionList = listSessionsExtended();
    setSessions(sessionList);
    setStats(getStorageStats());
    setIsLoading(false);
  }, []);

  // Auto-refresh
  useEffect(() => {
    if (refreshInterval > 0) {
      const interval = setInterval(refreshSessions, refreshInterval);
      return () => clearInterval(interval);
    }
  }, [refreshInterval, refreshSessions]);

  // Sort sessions
  const sortedSessions = [...sessions].sort((a, b) => {
    let comparison = 0;
    switch (sortBy) {
      case 'date':
        comparison = a.startTime - b.startTime;
        break;
      case 'duration':
        comparison = a.duration - b.duration;
        break;
      case 'events':
        comparison = a.eventCount - b.eventCount;
        break;
    }
    return sortDesc ? -comparison : comparison;
  });

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
      setSelectedIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      refreshSessions();
    },
    [refreshSessions]
  );

  const cancelDelete = useCallback(() => {
    setDeleteConfirm(null);
  }, []);

  // Bulk delete
  const handleBulkDelete = useCallback(() => {
    selectedIds.forEach((id) => deleteSession(id));
    setSelectedIds(new Set());
    refreshSessions();
  }, [selectedIds, refreshSessions]);

  // Clear all
  const handleClearAll = useCallback(() => {
    setClearAllConfirm(true);
  }, []);

  const confirmClearAll = useCallback(() => {
    clearAllSessions();
    setClearAllConfirm(false);
    setSelectedIds(new Set());
    refreshSessions();
  }, [refreshSessions]);

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

  // Selection handling
  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const selectAll = useCallback(() => {
    if (selectedIds.size === sessions.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(sessions.map((s) => s.id)));
    }
  }, [sessions, selectedIds.size]);

  // Cleanup expired
  const handleCleanup = useCallback(() => {
    const result = cleanupSessions();
    if (result.deletedCount > 0) {
      refreshSessions();
    }
  }, [refreshSessions]);

  // Toggle sort
  const handleSort = useCallback(
    (field: 'date' | 'duration' | 'events') => {
      if (sortBy === field) {
        setSortDesc(!sortDesc);
      } else {
        setSortBy(field);
        setSortDesc(true);
      }
    },
    [sortBy, sortDesc]
  );

  return (
    <div className="session-list">
      {/* Header */}
      <div className="session-list-header">
        <div className="session-list-title">
          <h3>Recordings</h3>
          {stats && (
            <span className="session-count">
              {stats.totalSessions} session{stats.totalSessions !== 1 ? 's' : ''} ({stats.totalSize.formatted})
            </span>
          )}
        </div>
        <div className="session-list-actions">
          <button
            className="header-btn"
            onClick={() => setShowSettings(!showSettings)}
            title="Storage Settings"
          >
            <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16">
              <path d="M19.14 12.94c.04-.31.06-.63.06-.94 0-.31-.02-.63-.06-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.04.31-.06.63-.06.94s.02.63.06.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z" />
            </svg>
          </button>
          <button className="header-btn" onClick={handleImportClick} title="Import Session">
            <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16">
              <path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z" />
            </svg>
          </button>
          <button className="header-btn" onClick={refreshSessions} title="Refresh">
            <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16">
              <path d="M17.65 6.35C16.2 4.9 14.21 4 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08c-.82 2.33-3.04 4-5.65 4-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z" />
            </svg>
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

      {/* Settings Panel */}
      {showSettings && (
        <div className="session-list-settings">
          <StorageSettings
            compact={false}
            onSettingsSaved={() => refreshSessions()}
            onCleanup={() => refreshSessions()}
          />
        </div>
      )}

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

      {/* Bulk actions */}
      {selectedIds.size > 0 && (
        <div className="bulk-actions">
          <span className="bulk-count">{selectedIds.size} selected</span>
          <button className="bulk-btn bulk-btn--delete" onClick={handleBulkDelete}>
            Delete Selected
          </button>
          <button className="bulk-btn bulk-btn--cancel" onClick={() => setSelectedIds(new Set())}>
            Clear Selection
          </button>
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

      {/* Sort controls */}
      {sessions.length > 1 && (
        <div className="sort-controls">
          <button
            className={`sort-btn ${sortBy === 'date' ? 'sort-btn--active' : ''}`}
            onClick={() => handleSort('date')}
          >
            Date {sortBy === 'date' && (sortDesc ? '↓' : '↑')}
          </button>
          <button
            className={`sort-btn ${sortBy === 'duration' ? 'sort-btn--active' : ''}`}
            onClick={() => handleSort('duration')}
          >
            Duration {sortBy === 'duration' && (sortDesc ? '↓' : '↑')}
          </button>
          <button
            className={`sort-btn ${sortBy === 'events' ? 'sort-btn--active' : ''}`}
            onClick={() => handleSort('events')}
          >
            Events {sortBy === 'events' && (sortDesc ? '↓' : '↑')}
          </button>
          {sessions.length > 0 && (
            <button className="sort-btn sort-btn--select" onClick={selectAll}>
              {selectedIds.size === sessions.length ? 'Deselect All' : 'Select All'}
            </button>
          )}
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
          <p>No saved recordings</p>
          <p className="session-list-hint">
            {stats?.settings.autoSave
              ? 'Recordings will be saved automatically when you stop recording'
              : 'Enable auto-save in settings or save recordings manually'}
          </p>
        </div>
      ) : (
        <div className="session-items">
          {sortedSessions.map((session) => (
            <div
              key={session.id}
              className={`session-item ${deleteConfirm === session.id ? 'session-item--deleting' : ''} ${
                session.isExpired ? 'session-item--expired' : ''
              } ${selectedIds.has(session.id) ? 'session-item--selected' : ''}`}
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
                  <div className="session-checkbox">
                    <input
                      type="checkbox"
                      checked={selectedIds.has(session.id)}
                      onChange={() => toggleSelect(session.id)}
                    />
                  </div>
                  <div className="session-info" onClick={() => handleReplay(session.id)}>
                    <div className="session-title">
                      <span className="session-relative-time">{session.relativeTime}</span>
                      {session.isExpired && (
                        <span className="session-badge session-badge--expired">Expired</span>
                      )}
                    </div>
                    <div className="session-meta">
                      <span className="session-duration">{formatDuration(session.duration)}</span>
                      <span className="session-divider">•</span>
                      <span className="session-events">{session.eventCount} events</span>
                      <span className="session-divider">•</span>
                      <span className="session-size">{session.sizeFormatted}</span>
                    </div>
                    <div className="session-url" title={session.url}>
                      {session.url}
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

      {/* Footer actions */}
      {sessions.length > 0 && (
        <div className="session-list-footer">
          {stats && stats.expiredCount > 0 && (
            <button className="footer-btn footer-btn--cleanup" onClick={handleCleanup}>
              Clean up {stats.expiredCount} expired session{stats.expiredCount !== 1 ? 's' : ''}
            </button>
          )}
          {clearAllConfirm ? (
            <div className="clear-all-confirm">
              <span>Delete all sessions?</span>
              <button className="confirm-btn confirm-btn--delete" onClick={confirmClearAll}>
                Yes, delete all
              </button>
              <button
                className="confirm-btn confirm-btn--cancel"
                onClick={() => setClearAllConfirm(false)}
              >
                Cancel
              </button>
            </div>
          ) : (
            <button className="footer-btn footer-btn--clear" onClick={handleClearAll}>
              Clear All
            </button>
          )}
        </div>
      )}
    </div>
  );
}
