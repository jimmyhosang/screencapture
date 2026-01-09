/**
 * Window Activity Timeline Component
 *
 * Horizontal bar showing application usage during a recording.
 * Color-coded segments for different apps, clickable to seek video.
 */

import { useState, useEffect, useMemo } from 'react';
import './WindowActivityTimeline.css';

interface WindowLog {
  id: string;
  recordingId: string;
  timestampMs: number;
  windowTitle?: string;
  processName?: string;
  url?: string;
}

interface TimelineSegment {
  processName: string;
  startMs: number;
  endMs: number;
  startPercent: number;
  widthPercent: number;
  color: string;
  windowTitle?: string;
}

interface WindowActivityTimelineProps {
  recordingId: string;
  duration: number; // Total duration in milliseconds
  currentTime: number; // Current playback time in milliseconds
  onSeek: (timeMs: number) => void;
}

// Color palette for different applications
const APP_COLORS: Record<string, string> = {
  'chrome': '#4285f4',
  'google chrome': '#4285f4',
  'firefox': '#ff7139',
  'mozilla firefox': '#ff7139',
  'safari': '#006cff',
  'microsoft edge': '#0078d4',
  'msedge': '#0078d4',
  'slack': '#4a154b',
  'teams': '#6264a7',
  'microsoft teams': '#6264a7',
  'zoom': '#2d8cff',
  'discord': '#5865f2',
  'code': '#007acc',
  'visual studio code': '#007acc',
  'terminal': '#000000',
  'iterm': '#000000',
  'finder': '#007aff',
  'explorer': '#ffb900',
  'outlook': '#0078d4',
  'mail': '#007aff',
  'salesforce': '#00a1e0',
  'zendesk': '#03363d',
  'unknown': '#9ca3af'
};

function getAppColor(processName: string): string {
  const lower = processName.toLowerCase();
  for (const [key, color] of Object.entries(APP_COLORS)) {
    if (lower.includes(key)) {
      return color;
    }
  }
  // Generate consistent color for unknown apps
  let hash = 0;
  for (let i = 0; i < processName.length; i++) {
    hash = processName.charCodeAt(i) + ((hash << 5) - hash);
  }
  const hue = Math.abs(hash % 360);
  return `hsl(${hue}, 60%, 50%)`;
}

export default function WindowActivityTimeline({
  recordingId,
  duration,
  currentTime,
  onSeek
}: WindowActivityTimelineProps): JSX.Element {
  const [windowLogs, setWindowLogs] = useState<WindowLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [hoveredSegment, setHoveredSegment] = useState<TimelineSegment | null>(null);

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

  // Calculate timeline segments
  const segments = useMemo((): TimelineSegment[] => {
    if (windowLogs.length < 2 || duration <= 0) return [];

    const result: TimelineSegment[] = [];

    for (let i = 0; i < windowLogs.length; i++) {
      const current = windowLogs[i];
      const next = windowLogs[i + 1];
      const endMs = next ? next.timestampMs : duration;
      const processName = current.processName || 'Unknown';

      result.push({
        processName,
        startMs: current.timestampMs,
        endMs,
        startPercent: (current.timestampMs / duration) * 100,
        widthPercent: ((endMs - current.timestampMs) / duration) * 100,
        color: getAppColor(processName),
        windowTitle: current.windowTitle
      });
    }

    return result;
  }, [windowLogs, duration]);

  // Get unique processes for legend
  const uniqueProcesses = useMemo(() => {
    const processes = new Map<string, string>();
    segments.forEach((s) => {
      if (!processes.has(s.processName)) {
        processes.set(s.processName, s.color);
      }
    });
    return Array.from(processes.entries());
  }, [segments]);

  // Current position marker
  const currentPositionPercent = (currentTime / duration) * 100;

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
    return `${mins}m ${secs}s`;
  };

  if (isLoading) {
    return (
      <div className="window-timeline loading">
        <div className="loading-text">Loading activity...</div>
      </div>
    );
  }

  if (segments.length === 0) {
    return (
      <div className="window-timeline empty">
        <div className="empty-text">No window activity recorded</div>
      </div>
    );
  }

  return (
    <div className="window-timeline">
      {/* Timeline bar */}
      <div
        className="timeline-bar"
        onClick={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          const percent = (e.clientX - rect.left) / rect.width;
          onSeek(percent * duration);
        }}
      >
        {segments.map((segment, index) => (
          <div
            key={index}
            className="timeline-segment"
            style={{
              left: `${segment.startPercent}%`,
              width: `${segment.widthPercent}%`,
              backgroundColor: segment.color
            }}
            onMouseEnter={() => setHoveredSegment(segment)}
            onMouseLeave={() => setHoveredSegment(null)}
            onClick={(e) => {
              e.stopPropagation();
              onSeek(segment.startMs);
            }}
          />
        ))}

        {/* Current position marker */}
        <div
          className="current-position"
          style={{ left: `${currentPositionPercent}%` }}
        />
      </div>

      {/* Tooltip */}
      {hoveredSegment && (
        <div
          className="timeline-tooltip"
          style={{
            left: `${hoveredSegment.startPercent + hoveredSegment.widthPercent / 2}%`
          }}
        >
          <div className="tooltip-app">{hoveredSegment.processName}</div>
          <div className="tooltip-title">
            {hoveredSegment.windowTitle?.slice(0, 50)}
            {(hoveredSegment.windowTitle?.length || 0) > 50 && '...'}
          </div>
          <div className="tooltip-time">
            {formatTime(hoveredSegment.startMs)} ({formatDuration(hoveredSegment.endMs - hoveredSegment.startMs)})
          </div>
        </div>
      )}

      {/* Legend */}
      <div className="timeline-legend">
        {uniqueProcesses.slice(0, 6).map(([name, color]) => (
          <div key={name} className="legend-item">
            <span className="legend-color" style={{ backgroundColor: color }} />
            <span className="legend-name">{name}</span>
          </div>
        ))}
        {uniqueProcesses.length > 6 && (
          <div className="legend-item more">+{uniqueProcesses.length - 6} more</div>
        )}
      </div>
    </div>
  );
}
