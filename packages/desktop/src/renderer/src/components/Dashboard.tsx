interface Stats {
  sessionCount: number;
  totalDuration: number;
  totalEvents: number;
  averageDuration: number;
}

interface Session {
  id: string;
  name: string;
  timestamp: number;
  duration: number;
  eventCount: number;
  events?: unknown[];
  privacyConfig?: {
    maskInputs: boolean;
    blockSensitive: boolean;
    maskPiiPatterns: boolean;
  } | null;
}

interface DashboardProps {
  stats: Stats | null;
  selectedSession: Session | null;
  onPlay: (session: Session) => void;
}

function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  if (hours > 0) {
    return `${hours}h ${minutes % 60}m`;
  }
  if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  }
  return `${seconds}s`;
}

function formatDate(timestamp: number): string {
  return new Date(timestamp).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function Dashboard({ stats, selectedSession, onPlay }: DashboardProps): JSX.Element {
  return (
    <>
      <div className="main-header">
        <h2>Dashboard</h2>
      </div>

      {/* Stats grid */}
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-value">{stats?.sessionCount || 0}</div>
          <div className="stat-label">Total Sessions</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">
            {stats ? formatDuration(stats.totalDuration) : '0s'}
          </div>
          <div className="stat-label">Total Duration</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">
            {stats?.totalEvents.toLocaleString() || 0}
          </div>
          <div className="stat-label">Total Events</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">
            {stats ? formatDuration(stats.averageDuration) : '0s'}
          </div>
          <div className="stat-label">Avg Duration</div>
        </div>
      </div>

      {/* Selected session details */}
      <div className="player-container">
        <div className="player-header">
          <h3>{selectedSession ? selectedSession.name : 'No Session Selected'}</h3>
          {selectedSession && (
            <button className="btn btn-primary" onClick={() => onPlay(selectedSession)}>
              Play Session
            </button>
          )}
        </div>

        <div className="player-wrapper">
          {selectedSession ? (
            <div className="player-placeholder">
              <div style={{ fontSize: '4rem', marginBottom: '16px' }}>🎬</div>
              <h3>{selectedSession.name}</h3>
              <p style={{ marginTop: '8px' }}>
                {formatDate(selectedSession.timestamp)}
              </p>
              <p style={{ marginTop: '4px' }}>
                Duration: {formatDuration(selectedSession.duration)} |{' '}
                Events: {selectedSession.eventCount.toLocaleString()}
              </p>
              {selectedSession.privacyConfig && (
                <p style={{ marginTop: '8px', fontSize: '0.75rem' }}>
                  Privacy:{' '}
                  {selectedSession.privacyConfig.maskInputs && 'Masked Inputs '}
                  {selectedSession.privacyConfig.blockSensitive && 'Blocked Sensitive '}
                  {selectedSession.privacyConfig.maskPiiPatterns && 'PII Redacted'}
                </p>
              )}
              <button
                className="btn btn-primary"
                style={{ marginTop: '24px' }}
                onClick={() => onPlay(selectedSession)}
              >
                Play Recording
              </button>
            </div>
          ) : (
            <div className="player-placeholder">
              <div className="empty-state-icon">📼</div>
              <p>Select a session from the sidebar to view details</p>
              <p style={{ marginTop: '8px', fontSize: '0.875rem' }}>
                Or import a session JSON file to get started
              </p>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

export default Dashboard;
