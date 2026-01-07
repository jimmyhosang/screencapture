import { useState, useEffect, useCallback } from 'react';
import {
  getPerformanceMetrics,
  formatBytes,
  getActualMemoryUsage,
  type PerformanceMetrics,
} from '../utils/performanceUtils';
import './PerformanceMonitor.css';

// =============================================================================
// Types
// =============================================================================

interface PerformanceMonitorProps {
  /** Whether recording is active (affects update frequency) */
  isRecording?: boolean;
  /** Update interval in ms (default: 1000) */
  updateInterval?: number;
  /** Whether to show the expanded view by default */
  defaultExpanded?: boolean;
  /** Position of the monitor */
  position?: 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left';
  /** Optional custom metrics from the recorder hook */
  metrics?: PerformanceMetrics;
}

interface MetricCardProps {
  label: string;
  value: string | number;
  unit?: string;
  status?: 'normal' | 'warning' | 'critical';
  icon?: React.ReactNode;
}

// =============================================================================
// Helper Components
// =============================================================================

function MetricCard({ label, value, unit, status = 'normal', icon }: MetricCardProps) {
  return (
    <div className={`perf-metric-card perf-metric-card--${status}`}>
      <div className="perf-metric-header">
        {icon && <span className="perf-metric-icon">{icon}</span>}
        <span className="perf-metric-label">{label}</span>
      </div>
      <div className="perf-metric-value">
        <span className="perf-metric-number">{value}</span>
        {unit && <span className="perf-metric-unit">{unit}</span>}
      </div>
    </div>
  );
}

// Icons as inline SVG
const Icons = {
  events: (
    <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16">
      <path d="M14 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8l-6-6zm4 18H6V4h7v5h5v11z" />
    </svg>
  ),
  speed: (
    <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16">
      <path d="M20.38 8.57l-1.23 1.85a8 8 0 0 1-.22 7.58H5.07A8 8 0 0 1 15.58 6.85l1.85-1.23A10 10 0 0 0 3.35 19a2 2 0 0 0 1.72 1h13.85a2 2 0 0 0 1.74-1 10 10 0 0 0-.27-10.44z" />
      <path d="M10.59 15.41a2 2 0 0 0 2.83 0l5.66-8.49-8.49 5.66a2 2 0 0 0 0 2.83z" />
    </svg>
  ),
  memory: (
    <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16">
      <path d="M17 20H4V10c0-.55-.45-1-1-1s-1 .45-1 1v11c0 .55.45 1 1 1h14c.55 0 1-.45 1-1s-.45-1-1-1zM21 4h-6c-.55 0-1 .45-1 1v14c0 .55.45 1 1 1h6c.55 0 1-.45 1-1V5c0-.55-.45-1-1-1zm-1 14h-4V6h4v12z" />
    </svg>
  ),
  time: (
    <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16">
      <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm.5-13H11v6l5.25 3.15.75-1.23-4.5-2.67z" />
    </svg>
  ),
  warning: (
    <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16">
      <path d="M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z" />
    </svg>
  ),
};

// =============================================================================
// Main Component
// =============================================================================

/**
 * Performance monitoring overlay that displays real-time metrics
 * about recording performance.
 */
export function PerformanceMonitor({
  isRecording = false,
  updateInterval = 1000,
  defaultExpanded = false,
  position = 'bottom-right',
  metrics: externalMetrics,
}: PerformanceMonitorProps) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);
  const [metrics, setMetrics] = useState<PerformanceMetrics>(() => getPerformanceMetrics());
  const [actualMemory, setActualMemory] = useState<number | null>(null);

  // Update metrics periodically
  useEffect(() => {
    const interval = isRecording ? updateInterval : updateInterval * 2;

    const updateMetrics = () => {
      // Use external metrics if provided, otherwise get from global state
      setMetrics(externalMetrics ?? getPerformanceMetrics());
      setActualMemory(getActualMemoryUsage());
    };

    updateMetrics();
    const intervalId = setInterval(updateMetrics, interval);

    return () => clearInterval(intervalId);
  }, [isRecording, updateInterval, externalMetrics]);

  const toggleExpanded = useCallback(() => {
    setIsExpanded((prev) => !prev);
  }, []);

  // Determine status levels
  const getEventsStatus = (): 'normal' | 'warning' | 'critical' => {
    if (metrics.eventsPerSecond > 100) return 'critical';
    if (metrics.eventsPerSecond > 60) return 'warning';
    return 'normal';
  };

  const getRedactionStatus = (): 'normal' | 'warning' | 'critical' => {
    if (metrics.peakRedactionTime > 32) return 'critical';
    if (metrics.peakRedactionTime > 16) return 'warning';
    return 'normal';
  };

  const getMemoryStatus = (): 'normal' | 'warning' | 'critical' => {
    if (metrics.memoryUsage > 100 * 1024 * 1024) return 'critical';
    if (metrics.memoryUsage > 50 * 1024 * 1024) return 'warning';
    return 'normal';
  };

  const displayMemory = actualMemory ?? metrics.memoryUsage;

  return (
    <div className={`perf-monitor perf-monitor--${position} ${isExpanded ? 'perf-monitor--expanded' : ''}`}>
      {/* Collapsed View */}
      {!isExpanded && (
        <button className="perf-monitor-toggle" onClick={toggleExpanded}>
          <span className={`perf-status-dot ${isRecording ? 'perf-status-dot--recording' : ''}`} />
          <span className="perf-monitor-label">
            {isRecording ? `${metrics.eventsPerSecond.toFixed(0)} e/s` : 'Perf'}
          </span>
          {metrics.performanceWarning && (
            <span className="perf-warning-icon">{Icons.warning}</span>
          )}
        </button>
      )}

      {/* Expanded View */}
      {isExpanded && (
        <div className="perf-monitor-panel">
          <div className="perf-monitor-header">
            <h4>Performance Monitor</h4>
            <button className="perf-monitor-close" onClick={toggleExpanded}>
              &times;
            </button>
          </div>

          {/* Warning Banner */}
          {metrics.performanceWarning && (
            <div className="perf-warning-banner">
              {Icons.warning}
              <span>{metrics.performanceWarning}</span>
            </div>
          )}

          {/* Metrics Grid */}
          <div className="perf-metrics-grid">
            <MetricCard
              label="Events/sec"
              value={metrics.eventsPerSecond.toFixed(1)}
              status={getEventsStatus()}
              icon={Icons.events}
            />

            <MetricCard
              label="Total Events"
              value={metrics.totalEvents.toLocaleString()}
              icon={Icons.events}
            />

            <MetricCard
              label="Avg Redaction"
              value={metrics.avgRedactionTime.toFixed(2)}
              unit="ms"
              status={getRedactionStatus()}
              icon={Icons.time}
            />

            <MetricCard
              label="Peak Redaction"
              value={metrics.peakRedactionTime.toFixed(2)}
              unit="ms"
              status={getRedactionStatus()}
              icon={Icons.speed}
            />

            <MetricCard
              label="Memory"
              value={formatBytes(displayMemory)}
              status={getMemoryStatus()}
              icon={Icons.memory}
            />

            <MetricCard
              label="Redactions"
              value={metrics.totalRedactions.toLocaleString()}
              icon={Icons.time}
            />
          </div>

          {/* Recording Status */}
          <div className="perf-recording-status">
            <span className={`perf-status-indicator ${isRecording ? 'perf-status-indicator--active' : ''}`}>
              {isRecording ? 'Recording' : 'Idle'}
            </span>
            {actualMemory === null && (
              <span className="perf-memory-note">* Estimated memory</span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default PerformanceMonitor;
