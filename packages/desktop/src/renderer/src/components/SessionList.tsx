interface Session {
  id: string;
  name: string;
  timestamp: number;
  duration: number;
  eventCount: number;
}

interface SessionListProps {
  sessions: Session[];
  selectedId: string | null;
  onSelect: (session: Session) => void;
  onPlay: (session: Session) => void;
  onExport: (id: string) => void;
  onDelete: (id: string) => void;
}

function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  }
  return `${seconds}s`;
}

function formatDate(timestamp: number): string {
  const date = new Date(timestamp);
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));

  if (days === 0) {
    return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  } else if (days === 1) {
    return 'Yesterday';
  } else if (days < 7) {
    return `${days} days ago`;
  }
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function SessionList({
  sessions,
  selectedId,
  onSelect,
  onPlay,
  onExport,
  onDelete
}: SessionListProps): JSX.Element {
  if (sessions.length === 0) {
    return (
      <div className="session-list-container">
        <div className="empty-state">
          <div className="empty-state-icon">📁</div>
          <p>No sessions yet</p>
          <p style={{ fontSize: '0.75rem', marginTop: '8px' }}>
            Import a session to get started
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="session-list-container">
      <div className="session-list">
        {sessions.map((session) => (
          <div
            key={session.id}
            className={`session-item ${selectedId === session.id ? 'selected' : ''}`}
            onClick={() => onSelect(session)}
          >
            <div className="session-name">{session.name}</div>
            <div className="session-meta">
              <span>{formatDate(session.timestamp)}</span>
              <span>{formatDuration(session.duration)}</span>
              <span>{session.eventCount} events</span>
            </div>
            <div
              style={{
                display: 'flex',
                gap: '4px',
                marginTop: '8px'
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <button
                className="btn-icon"
                title="Play"
                onClick={() => onPlay(session)}
              >
                ▶️
              </button>
              <button
                className="btn-icon"
                title="Export"
                onClick={() => onExport(session.id)}
              >
                💾
              </button>
              <button
                className="btn-icon"
                title="Delete"
                onClick={() => onDelete(session.id)}
              >
                🗑️
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default SessionList;
