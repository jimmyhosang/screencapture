/**
 * Window Activity Log Component
 *
 * Scrollable list showing detailed window activity during a recording.
 * Each entry shows timestamp, app name, window title, and duration.
 */

import { useState, useEffect, useMemo } from 'react';
import './WindowActivityLog.css';

interface WindowLog {
  id: string;
  recordingId: string;
  timestampMs: number;
  windowTitle?: string;
  processName?: string;
  url?: string;
}

interface WindowActivityLogProps {
  recordingId: string;
  duration: number; // Total duration in milliseconds
  currentTime: number; // Current playback time in milliseconds
  onSeek: (timeMs: number) => void;
}

// App icons (emoji fallback)
const APP_ICONS: Record<string, string> = {
  chrome: '🌐',
  'google chrome': '🌐',
  firefox: '🦊',
  safari: '🧭',
  'microsoft edge': '🌐',
  slack: '💬',
  teams: '👥',
  'microsoft teams': '👥',
  zoom: '📹',
  discord: '🎮',
  code: '💻',
  'visual studio code': '💻',
  terminal: '⬛',
  iterm: '⬛',
  finder: '📁',
  explorer: '📁',
  outlook: '📧',
  mail: '📧',
  salesforce: '☁️',
  zendesk: '🎫'
};

function getAppIcon(processName: string): string {
  const lower = processName.toLowerCase();
  for (const [key, icon] of Object.entries(APP_ICONS)) {
    if (lower.includes(key)) {
      return icon;
    }
  }
  return '📱';
}

export default function WindowActivityLog({
  recordingId,
  duration,
  currentTime,
  onSeek
}: WindowActivityLogProps): JSX.Element {
  const [windowLogs, setWindowLogs] = useState<WindowLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filter, setFilter] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Load window logs
  useEffect(() => {
    loadWindowLogs();
  }, [recordingId]);

  const loadWindowLogs = async () => {
    setIsLoading(true);
    try {
      const logs = await window.api.tracking.getWindowLog(recordingId);
      setWindowLogs(logs);
    } catch (error) {
      console.error('Failed to load window logs:', error);
    } finally {
      setIsLoading(false);
    }
  };

  // Calculate enriched entries with duration
  const entries = useMemo(() => {
    if (windowLogs.length === 0) return [];

    return windowLogs.map((log, index) => {
      const next = windowLogs[index + 1];
      const endMs = next ? next.timestampMs : duration;
      const durationMs = endMs - log.timestampMs;

      return {
        ...log,
        endMs,
        durationMs,
        icon: getAppIcon(log.processName || 'Unknown')
      };
    });
  }, [windowLogs, duration]);

  // Filter entries
  const filteredEntries = useMemo(() => {
    if (!filter.trim()) return entries;

    const query = filter.toLowerCase();
    return entries.filter(
      (entry) =>
        entry.processName?.toLowerCase().includes(query) ||
        entry.windowTitle?.toLowerCase().includes(query) ||
        entry.url?.toLowerCase().includes(query)
    );
  }, [entries, filter]);

  // Find current entry based on playback time
  const currentEntryIndex = useMemo(() => {
    for (let i = entries.length - 1; i >= 0; i--) {
      if (entries[i].timestampMs <= currentTime) {
        return i;
      }
    }
    return 0;
  }, [entries, currentTime]);

  // Calculate activity summary
  const activitySummary = useMemo(() => {
    const byApp = new Map<string, number>();

    entries.forEach((entry) => {
      const app = entry.processName || 'Unknown';
      const existing = byApp.get(app) || 0;
      byApp.set(app, existing + entry.durationMs);
    });

    return Array.from(byApp.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);
  }, [entries]);

  const formatTime = (ms: number): string => {
    const totalSeconds = Math.floor(ms / 1000);
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const formatDuration = (ms: number): string => {
    const totalSeconds = Math.floor(ms / 1000);
    if (totalSeconds < 60) return `${totalSeconds}s`;
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    if (mins < 60) return `${mins}m ${secs}s`;
    const hours = Math.floor(mins / 60);
    const remainingMins = mins % 60;
    return `${hours}h ${remainingMins}m`;
  };

  if (isLoading) {
    return (
      <div className="window-activity-log loading">
        <div className="loading-spinner" />
        <span>Loading activity log...</span>
      </div>
    );
  }

  if (entries.length === 0) {
    return (
      <div className="window-activity-log empty">
        <div className="empty-icon">📋</div>
        <span>No window activity recorded</span>
      </div>
    );
  }

  return (
    <div className="window-activity-log">
      {/* Summary Section */}
      <div className="activity-summary">
        <h4>Top Applications</h4>
        <div className="summary-apps">
          {activitySummary.map(([app, timeMs]) => (
            <div key={app} className="summary-app">
              <span className="app-icon">{getAppIcon(app)}</span>
              <span className="app-name">{app}</span>
              <span className="app-time">{formatDuration(timeMs)}</span>
              <div
                className="app-bar"
                style={{ width: `${(timeMs / duration) * 100}%` }}
              />
            </div>
          ))}
        </div>
      </div>

      {/* Filter */}
      <div className="activity-filter">
        <input
          type="text"
          placeholder="Filter by app or title..."
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="filter-input"
        />
        <span className="entry-count">
          {filteredEntries.length} / {entries.length} entries
        </span>
      </div>

      {/* Activity List */}
      <div className="activity-list">
        {filteredEntries.map((entry, index) => {
          const isActive =
            currentTime >= entry.timestampMs && currentTime < entry.endMs;
          const isExpanded = expandedId === entry.id;

          return (
            <div
              key={entry.id}
              className={`activity-entry ${isActive ? 'active' : ''} ${isExpanded ? 'expanded' : ''}`}
              onClick={() => onSeek(entry.timestampMs)}
            >
              <div className="entry-main">
                <span className="entry-icon">{entry.icon}</span>
                <div className="entry-content">
                  <div className="entry-app">{entry.processName || 'Unknown'}</div>
                  <div className="entry-title">
                    {entry.windowTitle?.slice(0, 60)}
                    {(entry.windowTitle?.length || 0) > 60 && '...'}
                  </div>
                </div>
                <div className="entry-meta">
                  <span className="entry-time">{formatTime(entry.timestampMs)}</span>
                  <span className="entry-duration">{formatDuration(entry.durationMs)}</span>
                </div>
                <button
                  className="entry-expand"
                  onClick={(e) => {
                    e.stopPropagation();
                    setExpandedId(isExpanded ? null : entry.id);
                  }}
                >
                  {isExpanded ? '−' : '+'}
                </button>
              </div>

              {isExpanded && (
                <div className="entry-details">
                  <div className="detail-row">
                    <span className="detail-label">Full Title:</span>
                    <span className="detail-value">{entry.windowTitle || 'N/A'}</span>
                  </div>
                  {entry.url && (
                    <div className="detail-row">
                      <span className="detail-label">URL:</span>
                      <span className="detail-value url">{entry.url}</span>
                    </div>
                  )}
                  <div className="detail-row">
                    <span className="detail-label">Time Range:</span>
                    <span className="detail-value">
                      {formatTime(entry.timestampMs)} - {formatTime(entry.endMs)}
                    </span>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
