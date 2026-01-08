import { useState, useEffect, useCallback } from 'react';

// Types matching the main process
interface PerformanceSnapshot {
  timestamp: number;
  fps: {
    current: number;
    average: number;
    min: number;
    max: number;
  };
  frameTime: {
    current: number;
    average: number;
    min: number;
    max: number;
  };
  memory: {
    heapUsed: number;
    heapTotal: number;
    external: number;
    rss: number;
    percentUsed: number;
  };
  cpu: {
    percentUsed: number;
    loadAverage: number[];
  };
  processing: {
    captureAvg: number;
    ocrAvg: number;
    piiScanAvg: number;
    redactionAvg: number;
    totalAvg: number;
  };
  bottlenecks: string[];
}

interface PerformanceMonitorProps {
  isVisible: boolean;
  onClose: () => void;
  isRecording?: boolean;
}

function PerformanceMonitor({ isVisible, onClose, isRecording = false }: PerformanceMonitorProps): JSX.Element | null {
  const [snapshot, setSnapshot] = useState<PerformanceSnapshot | null>(null);
  const [history, setHistory] = useState<PerformanceSnapshot[]>([]);
  const [viewMode, setViewMode] = useState<'summary' | 'detailed' | 'chart'>('summary');

  // Subscribe to performance updates
  useEffect(() => {
    if (!isVisible) return;

    window.api.performance.onUpdate((newSnapshot) => {
      setSnapshot(newSnapshot);
      setHistory(prev => {
        const updated = [...prev, newSnapshot];
        // Keep last 60 snapshots (1 minute at 1/sec)
        if (updated.length > 60) {
          updated.shift();
        }
        return updated;
      });
    });

    // Load initial snapshot
    window.api.performance.getLatestSnapshot().then(s => {
      if (s) setSnapshot(s);
    });

    return () => {
      window.api.performance.removeUpdateListener();
    };
  }, [isVisible]);

  const formatBytes = useCallback((mb: number): string => {
    if (mb < 1) return `${(mb * 1024).toFixed(0)} KB`;
    if (mb < 1024) return `${mb.toFixed(1)} MB`;
    return `${(mb / 1024).toFixed(2)} GB`;
  }, []);

  const formatTime = useCallback((ms: number): string => {
    if (ms < 1) return `${(ms * 1000).toFixed(0)} µs`;
    if (ms < 1000) return `${ms.toFixed(1)} ms`;
    return `${(ms / 1000).toFixed(2)} s`;
  }, []);

  const getStatusColor = useCallback((value: number, warning: number, critical: number, inverse = false): string => {
    if (inverse) {
      if (value < critical) return 'var(--color-error)';
      if (value < warning) return 'var(--color-warning)';
      return 'var(--color-success)';
    }
    if (value > critical) return 'var(--color-error)';
    if (value > warning) return 'var(--color-warning)';
    return 'var(--color-success)';
  }, []);

  if (!isVisible) return null;

  return (
    <div className="performance-monitor">
      <div className="perf-header">
        <h3>Performance Monitor</h3>
        <div className="perf-controls">
          <div className="view-toggle">
            <button
              className={viewMode === 'summary' ? 'active' : ''}
              onClick={() => setViewMode('summary')}
            >
              Summary
            </button>
            <button
              className={viewMode === 'detailed' ? 'active' : ''}
              onClick={() => setViewMode('detailed')}
            >
              Detailed
            </button>
            <button
              className={viewMode === 'chart' ? 'active' : ''}
              onClick={() => setViewMode('chart')}
            >
              Chart
            </button>
          </div>
          <button className="btn-close" onClick={onClose}>×</button>
        </div>
      </div>

      {!snapshot ? (
        <div className="perf-loading">
          <p>Waiting for performance data...</p>
        </div>
      ) : viewMode === 'summary' ? (
        <div className="perf-summary">
          {/* Quick Stats Row */}
          <div className="perf-quick-stats">
            <div className="stat-card">
              <div className="stat-label">FPS</div>
              <div
                className="stat-value"
                style={{ color: getStatusColor(snapshot.fps.average, 20, 10, true) }}
              >
                {snapshot.fps.average.toFixed(1)}
              </div>
              <div className="stat-range">
                {snapshot.fps.min.toFixed(0)} - {snapshot.fps.max.toFixed(0)}
              </div>
            </div>

            <div className="stat-card">
              <div className="stat-label">Frame Time</div>
              <div
                className="stat-value"
                style={{ color: getStatusColor(snapshot.frameTime.average, 50, 100) }}
              >
                {formatTime(snapshot.frameTime.average)}
              </div>
              <div className="stat-range">
                {formatTime(snapshot.frameTime.min)} - {formatTime(snapshot.frameTime.max)}
              </div>
            </div>

            <div className="stat-card">
              <div className="stat-label">Memory</div>
              <div
                className="stat-value"
                style={{ color: getStatusColor(snapshot.memory.percentUsed, 70, 90) }}
              >
                {formatBytes(snapshot.memory.rss)}
              </div>
              <div className="stat-range">
                {snapshot.memory.percentUsed.toFixed(1)}% of system
              </div>
            </div>

            <div className="stat-card">
              <div className="stat-label">CPU</div>
              <div
                className="stat-value"
                style={{ color: getStatusColor(snapshot.cpu.percentUsed, 60, 80) }}
              >
                {snapshot.cpu.percentUsed.toFixed(1)}%
              </div>
              <div className="stat-range">
                Load: {snapshot.cpu.loadAverage.map(l => l.toFixed(2)).join(', ')}
              </div>
            </div>
          </div>

          {/* Recording Status */}
          <div className="perf-recording-status">
            <span className={`recording-indicator ${isRecording ? 'active' : ''}`} />
            {isRecording ? 'Recording Active' : 'Not Recording'}
          </div>

          {/* Bottlenecks */}
          {snapshot.bottlenecks.length > 0 && (
            <div className="perf-bottlenecks">
              <h4>Issues Detected</h4>
              <ul>
                {snapshot.bottlenecks.map((issue, i) => (
                  <li
                    key={i}
                    className={issue.startsWith('Critical') ? 'critical' : 'warning'}
                  >
                    {issue}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      ) : viewMode === 'detailed' ? (
        <div className="perf-detailed">
          {/* Processing Pipeline */}
          <div className="perf-section">
            <h4>Processing Pipeline</h4>
            <div className="pipeline-chart">
              {[
                { label: 'Capture', time: snapshot.processing.captureAvg, color: '#3b82f6' },
                { label: 'OCR', time: snapshot.processing.ocrAvg, color: '#8b5cf6' },
                { label: 'PII Scan', time: snapshot.processing.piiScanAvg, color: '#f59e0b' },
                { label: 'Redaction', time: snapshot.processing.redactionAvg, color: '#ef4444' }
              ].map((stage, i) => {
                const total = snapshot.processing.totalAvg || 1;
                const width = Math.max((stage.time / total) * 100, 5);
                return (
                  <div key={i} className="pipeline-stage">
                    <div className="stage-label">
                      <span>{stage.label}</span>
                      <span>{formatTime(stage.time)}</span>
                    </div>
                    <div className="stage-bar">
                      <div
                        className="stage-fill"
                        style={{ width: `${width}%`, backgroundColor: stage.color }}
                      />
                    </div>
                  </div>
                );
              })}
              <div className="pipeline-total">
                Total: {formatTime(snapshot.processing.totalAvg)}
              </div>
            </div>
          </div>

          {/* Memory Breakdown */}
          <div className="perf-section">
            <h4>Memory Usage</h4>
            <div className="memory-breakdown">
              <div className="memory-item">
                <span>Heap Used</span>
                <span>{formatBytes(snapshot.memory.heapUsed)}</span>
              </div>
              <div className="memory-item">
                <span>Heap Total</span>
                <span>{formatBytes(snapshot.memory.heapTotal)}</span>
              </div>
              <div className="memory-item">
                <span>External</span>
                <span>{formatBytes(snapshot.memory.external)}</span>
              </div>
              <div className="memory-item">
                <span>RSS (Total)</span>
                <span>{formatBytes(snapshot.memory.rss)}</span>
              </div>
            </div>
            <div className="memory-bar">
              <div
                className="memory-fill"
                style={{
                  width: `${Math.min(snapshot.memory.percentUsed, 100)}%`,
                  backgroundColor: getStatusColor(snapshot.memory.percentUsed, 70, 90)
                }}
              />
            </div>
          </div>

          {/* Frame Time Stats */}
          <div className="perf-section">
            <h4>Frame Timing</h4>
            <div className="frame-stats">
              <div className="frame-stat">
                <span className="label">Current</span>
                <span className="value">{formatTime(snapshot.frameTime.current)}</span>
              </div>
              <div className="frame-stat">
                <span className="label">Average</span>
                <span className="value">{formatTime(snapshot.frameTime.average)}</span>
              </div>
              <div className="frame-stat">
                <span className="label">Min</span>
                <span className="value">{formatTime(snapshot.frameTime.min)}</span>
              </div>
              <div className="frame-stat">
                <span className="label">Max</span>
                <span className="value">{formatTime(snapshot.frameTime.max)}</span>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="perf-chart">
          {/* Simple FPS Chart */}
          <div className="chart-container">
            <h4>FPS History (Last 60s)</h4>
            <div className="chart-canvas">
              <svg viewBox="0 0 400 100" preserveAspectRatio="none">
                {/* Grid lines */}
                <line x1="0" y1="25" x2="400" y2="25" stroke="#333" strokeDasharray="2" />
                <line x1="0" y1="50" x2="400" y2="50" stroke="#333" strokeDasharray="2" />
                <line x1="0" y1="75" x2="400" y2="75" stroke="#333" strokeDasharray="2" />

                {/* FPS line */}
                {history.length > 1 && (
                  <polyline
                    fill="none"
                    stroke="#3b82f6"
                    strokeWidth="2"
                    points={history.map((s, i) => {
                      const x = (i / (history.length - 1)) * 400;
                      const y = 100 - Math.min((s.fps.average / 60) * 100, 100);
                      return `${x},${y}`;
                    }).join(' ')}
                  />
                )}

                {/* Warning threshold */}
                <line x1="0" y1={100 - (20/60) * 100} x2="400" y2={100 - (20/60) * 100} stroke="#f59e0b" strokeDasharray="4" />
                <text x="405" y={100 - (20/60) * 100 + 4} fill="#f59e0b" fontSize="10">20 fps</text>
              </svg>
              <div className="chart-labels">
                <span>60 fps</span>
                <span>45 fps</span>
                <span>30 fps</span>
                <span>15 fps</span>
                <span>0 fps</span>
              </div>
            </div>
          </div>

          {/* Memory Chart */}
          <div className="chart-container">
            <h4>Memory History (Last 60s)</h4>
            <div className="chart-canvas">
              <svg viewBox="0 0 400 100" preserveAspectRatio="none">
                {/* Grid lines */}
                <line x1="0" y1="25" x2="400" y2="25" stroke="#333" strokeDasharray="2" />
                <line x1="0" y1="50" x2="400" y2="50" stroke="#333" strokeDasharray="2" />
                <line x1="0" y1="75" x2="400" y2="75" stroke="#333" strokeDasharray="2" />

                {/* Memory line */}
                {history.length > 1 && (
                  <polyline
                    fill="none"
                    stroke="#10b981"
                    strokeWidth="2"
                    points={history.map((s, i) => {
                      const x = (i / (history.length - 1)) * 400;
                      const y = 100 - s.memory.percentUsed;
                      return `${x},${y}`;
                    }).join(' ')}
                  />
                )}

                {/* Warning threshold */}
                <line x1="0" y1={100 - 70} x2="400" y2={100 - 70} stroke="#f59e0b" strokeDasharray="4" />
              </svg>
              <div className="chart-labels">
                <span>100%</span>
                <span>75%</span>
                <span>50%</span>
                <span>25%</span>
                <span>0%</span>
              </div>
            </div>
          </div>

          {/* Frame Time Chart */}
          <div className="chart-container">
            <h4>Frame Time History (Last 60s)</h4>
            <div className="chart-canvas">
              <svg viewBox="0 0 400 100" preserveAspectRatio="none">
                {/* Grid lines */}
                <line x1="0" y1="25" x2="400" y2="25" stroke="#333" strokeDasharray="2" />
                <line x1="0" y1="50" x2="400" y2="50" stroke="#333" strokeDasharray="2" />
                <line x1="0" y1="75" x2="400" y2="75" stroke="#333" strokeDasharray="2" />

                {/* Frame time line (inverted so lower is better) */}
                {history.length > 1 && (
                  <polyline
                    fill="none"
                    stroke="#8b5cf6"
                    strokeWidth="2"
                    points={history.map((s, i) => {
                      const x = (i / (history.length - 1)) * 400;
                      const y = Math.min((s.frameTime.average / 100) * 100, 100);
                      return `${x},${y}`;
                    }).join(' ')}
                  />
                )}

                {/* Warning threshold (50ms) */}
                <line x1="0" y1={50} x2="400" y2={50} stroke="#f59e0b" strokeDasharray="4" />
              </svg>
              <div className="chart-labels">
                <span>0ms</span>
                <span>25ms</span>
                <span>50ms</span>
                <span>75ms</span>
                <span>100ms</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Keyboard shortcut hint */}
      <div className="perf-footer">
        <span className="shortcut-hint">Press Ctrl+Shift+M to toggle</span>
      </div>
    </div>
  );
}

export default PerformanceMonitor;
