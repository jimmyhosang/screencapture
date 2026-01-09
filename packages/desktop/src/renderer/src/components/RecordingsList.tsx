import { useState, useEffect, useCallback } from 'react';

interface VideoRecording {
  id: string;
  filename: string;
  sourceType: string;
  sourceName: string;
  duration: number;
  startTime: number;
  resolution: string;
  fps: number;
  fileSize: number;
  filePath: string;
  thumbnailPath: string | null;
  status: string;
}

interface RecordingStats {
  recordingCount: number;
  totalDuration: number;
  totalSize: number;
  averageDuration: number;
}

interface RecordingsListProps {
  onPlay: (recording: VideoRecording) => void;
  onExport: (recording: VideoRecording) => void;
}

function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  if (hours > 0) {
    return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
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

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function RecordingsList({ onPlay, onExport }: RecordingsListProps): JSX.Element {
  const [recordings, setRecordings] = useState<VideoRecording[]>([]);
  const [stats, setStats] = useState<RecordingStats | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const loadRecordings = useCallback(async () => {
    if (!window.api?.indexer?.list) {
      console.error('indexer API not available');
      setLoading(false);
      return;
    }
    try {
      // Use indexer.list to get paginated recordings
      const result = await window.api.indexer.list({}, 1, 100);

      // Map indexed recordings to the VideoRecording interface
      const mappedRecordings = result.recordings.map(rec => ({
        id: rec.id,
        filename: rec.filename,
        sourceType: 'screen', // Default for now
        sourceName: rec.callId || 'Unknown',
        duration: rec.duration,
        startTime: rec.startTime,
        resolution: rec.resolution,
        fps: rec.fps,
        fileSize: rec.fileSize,
        filePath: rec.filePath,
        thumbnailPath: rec.thumbnailPath,
        status: rec.status
      }));

      setRecordings(mappedRecordings);

      // Calculate stats from the recordings
      const totalDuration = mappedRecordings.reduce((sum, r) => sum + r.duration, 0);
      const totalSize = mappedRecordings.reduce((sum, r) => sum + r.fileSize, 0);
      setStats({
        recordingCount: mappedRecordings.length,
        totalDuration,
        totalSize,
        averageDuration: mappedRecordings.length > 0 ? totalDuration / mappedRecordings.length : 0
      });
    } catch (error) {
      console.error('Error loading recordings:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadRecordings();
  }, [loadRecordings]);

  const handleImport = async () => {
    // Import functionality - could be added to indexer later
    alert('Import feature coming soon!');
  };

  const handleDelete = async (id: string) => {
    const confirmed = window.confirm('Are you sure you want to delete this recording?');
    if (confirmed) {
      await window.api.indexer.delete(id);
      if (selectedId === id) {
        setSelectedId(null);
      }
      loadRecordings();
    }
  };

  const handleOpenFolder = async () => {
    // Open the recordings folder
    const paths = await window.api.storage.getPaths();
    window.open(`file://${paths.recordings}`);
  };

  const filteredRecordings = recordings.filter(recording =>
    recording.filename.toLowerCase().includes(searchQuery.toLowerCase()) ||
    recording.sourceName.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const selectedRecording = recordings.find(r => r.id === selectedId);

  if (loading) {
    return (
      <div className="recordings-container">
        <div className="empty-state">
          <div className="empty-state-icon">⏳</div>
          <p>Loading recordings...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="recordings-container">
      {/* Header with stats */}
      <div className="recordings-header">
        <h2>Video Recordings</h2>
        {stats && (
          <div className="recordings-stats">
            <span>{stats.recordingCount} recordings</span>
            <span>•</span>
            <span>{formatDuration(stats.totalDuration)} total</span>
            <span>•</span>
            <span>{formatFileSize(stats.totalSize)}</span>
          </div>
        )}
      </div>

      {/* Toolbar */}
      <div className="recordings-toolbar">
        <input
          type="text"
          className="search-input"
          placeholder="Search recordings..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
        <div className="toolbar-actions">
          <button className="btn btn-secondary" onClick={handleOpenFolder}>
            📁 Open Folder
          </button>
          <button className="btn btn-primary" onClick={handleImport}>
            📥 Import
          </button>
        </div>
      </div>

      {/* Recordings grid */}
      <div className="recordings-content">
        {filteredRecordings.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">🎬</div>
            <p>No recordings yet</p>
            <p style={{ fontSize: '0.875rem', marginTop: '8px' }}>
              Import a video file or start recording
            </p>
            <button className="btn btn-primary" style={{ marginTop: '16px' }} onClick={handleImport}>
              Import Recording
            </button>
          </div>
        ) : (
          <div className="recordings-grid">
            {filteredRecordings.map((recording) => (
              <div
                key={recording.id}
                className={`recording-card ${selectedId === recording.id ? 'selected' : ''}`}
                onClick={() => setSelectedId(recording.id)}
              >
                {/* Thumbnail */}
                <div className="recording-thumbnail">
                  {recording.thumbnailPath ? (
                    <img
                      src={`file://${recording.thumbnailPath}`}
                      alt={recording.filename}
                      onError={(e) => {
                        (e.target as HTMLImageElement).style.display = 'none';
                      }}
                    />
                  ) : (
                    <div className="thumbnail-placeholder">
                      <span>🎥</span>
                    </div>
                  )}
                  <div className="recording-duration">{formatDuration(recording.duration)}</div>
                </div>

                {/* Info */}
                <div className="recording-info">
                  <div className="recording-filename">{recording.filename}</div>
                  <div className="recording-meta">
                    <span>{formatDate(recording.startTime)}</span>
                    <span>{recording.resolution}</span>
                  </div>
                  <div className="recording-meta">
                    <span>{recording.sourceName}</span>
                    <span>{formatFileSize(recording.fileSize)}</span>
                  </div>
                </div>

                {/* Actions */}
                <div className="recording-actions" onClick={(e) => e.stopPropagation()}>
                  <button
                    className="btn-icon"
                    title="Play"
                    onClick={() => onPlay(recording)}
                  >
                    ▶️
                  </button>
                  <button
                    className="btn-icon"
                    title="Export"
                    onClick={() => onExport(recording)}
                  >
                    💾
                  </button>
                  <button
                    className="btn-icon"
                    title="Delete"
                    onClick={() => handleDelete(recording.id)}
                  >
                    🗑️
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Selected recording details */}
      {selectedRecording && (
        <div className="recording-details">
          <h3>{selectedRecording.filename}</h3>
          <div className="details-grid">
            <div className="detail-item">
              <span className="detail-label">Source</span>
              <span className="detail-value">{selectedRecording.sourceName} ({selectedRecording.sourceType})</span>
            </div>
            <div className="detail-item">
              <span className="detail-label">Duration</span>
              <span className="detail-value">{formatDuration(selectedRecording.duration)}</span>
            </div>
            <div className="detail-item">
              <span className="detail-label">Resolution</span>
              <span className="detail-value">{selectedRecording.resolution} @ {selectedRecording.fps}fps</span>
            </div>
            <div className="detail-item">
              <span className="detail-label">File Size</span>
              <span className="detail-value">{formatFileSize(selectedRecording.fileSize)}</span>
            </div>
            <div className="detail-item">
              <span className="detail-label">Recorded</span>
              <span className="detail-value">{formatDate(selectedRecording.startTime)}</span>
            </div>
            <div className="detail-item">
              <span className="detail-label">Status</span>
              <span className="detail-value">{selectedRecording.status}</span>
            </div>
          </div>
          <div className="details-actions">
            <button className="btn btn-primary" onClick={() => onPlay(selectedRecording)}>
              ▶️ Play Recording
            </button>
            <button className="btn btn-secondary" onClick={() => onExport(selectedRecording)}>
              💾 Export
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default RecordingsList;
