/**
 * Recordings Page
 *
 * Advanced recordings listing with search, filters, pagination,
 * and video playback support.
 */

import { useState, useEffect, useCallback } from 'react';
import '../styles/RecordingsPage.css';

// Types matching the indexer service
interface IndexedRecording {
  id: string;
  callId: string;
  agentId: string;
  filename: string;
  filePath: string;
  duration: number;
  resolution: string;
  fileSize: number;
  fps: number;
  codec: string;
  startTime: number;
  endTime: number;
  thumbnailPath: string | null;
  thumbnailBase64: string | null;
  metadataPath: string | null;
  windowActivityPath: string | null;
  status: 'pending_review' | 'reviewed' | 'redacted' | 'archived' | 'deleted';
  tags: string[];
  notes: string | null;
  createdAt: number;
  updatedAt: number;
  indexedAt: number;
}

interface RecordingFilter {
  startDate?: number;
  endDate?: number;
  agentId?: string;
  callId?: string;
  status?: string;
  search?: string;
}

interface PaginatedRecordings {
  recordings: IndexedRecording[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

interface RecordingsPageProps {
  onPlay: (recording: IndexedRecording) => void;
}

// Utility functions
function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  if (hours > 0) {
    return `${hours}:${(minutes % 60).toString().padStart(2, '0')}:${(seconds % 60).toString().padStart(2, '0')}`;
  }
  return `${minutes}:${(seconds % 60).toString().padStart(2, '0')}`;
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

function formatDateInput(date: Date): string {
  return date.toISOString().split('T')[0];
}

const STATUS_OPTIONS = [
  { value: '', label: 'All Statuses' },
  { value: 'pending_review', label: 'Pending Review' },
  { value: 'reviewed', label: 'Reviewed' },
  { value: 'redacted', label: 'Redacted' },
  { value: 'archived', label: 'Archived' }
];

const STATUS_COLORS: Record<string, string> = {
  pending_review: '#f59e0b',
  reviewed: '#10b981',
  redacted: '#8b5cf6',
  archived: '#6b7280',
  deleted: '#ef4444'
};

export function RecordingsPage({ onPlay }: RecordingsPageProps): JSX.Element {
  // State
  const [recordings, setRecordings] = useState<IndexedRecording[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [agentFilter, setAgentFilter] = useState('');
  const [callIdFilter, setCallIdFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  // Agent IDs for dropdown
  const [agentIds, setAgentIds] = useState<string[]>([]);

  // Selected recording
  const [selectedRecording, setSelectedRecording] = useState<IndexedRecording | null>(null);
  const [showDetails, setShowDetails] = useState(false);

  // Stats
  const [stats, setStats] = useState<{
    total: number;
    byStatus: Record<string, number>;
    totalDuration: number;
    totalSize: number;
  } | null>(null);

  const PAGE_SIZE = 20;

  // Load agent IDs
  useEffect(() => {
    const loadAgentIds = async () => {
      try {
        if (window.api?.indexer?.getAgentIds) {
          const ids = await window.api.indexer.getAgentIds();
          setAgentIds(ids);
        }
      } catch (err) {
        console.error('Failed to load agent IDs:', err);
      }
    };
    loadAgentIds();
  }, []);

  // Load stats
  useEffect(() => {
    const loadStats = async () => {
      try {
        if (window.api?.indexer?.getStats) {
          const s = await window.api.indexer.getStats();
          setStats(s);
        }
      } catch (err) {
        console.error('Failed to load stats:', err);
      }
    };
    loadStats();
  }, [recordings]);

  // Build filter object
  const buildFilter = useCallback((): RecordingFilter => {
    const filter: RecordingFilter = {};

    if (searchQuery) {
      filter.search = searchQuery;
    }
    if (agentFilter) {
      filter.agentId = agentFilter;
    }
    if (callIdFilter) {
      filter.callId = callIdFilter;
    }
    if (statusFilter) {
      filter.status = statusFilter;
    }
    if (startDate) {
      filter.startDate = new Date(startDate).getTime();
    }
    if (endDate) {
      filter.endDate = new Date(endDate).setHours(23, 59, 59, 999);
    }

    return filter;
  }, [searchQuery, agentFilter, callIdFilter, statusFilter, startDate, endDate]);

  // Load recordings
  const loadRecordings = useCallback(async () => {
    if (!window.api?.indexer?.list) {
      setError('Indexer API not available');
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const filter = buildFilter();
      const result: PaginatedRecordings = await window.api.indexer.list(filter, page, PAGE_SIZE);

      setRecordings(result.recordings);
      setTotal(result.total);
      setTotalPages(result.totalPages);
    } catch (err) {
      console.error('Failed to load recordings:', err);
      setError('Failed to load recordings');
    } finally {
      setLoading(false);
    }
  }, [buildFilter, page]);

  // Load on mount and when filters change
  useEffect(() => {
    loadRecordings();
  }, [loadRecordings]);

  // Reset page when filters change
  useEffect(() => {
    setPage(1);
  }, [searchQuery, agentFilter, callIdFilter, statusFilter, startDate, endDate]);

  // Reindex recordings
  const handleReindex = async () => {
    if (!window.api?.indexer?.indexAll) return;

    setLoading(true);
    try {
      await window.api.indexer.indexAll();
      await loadRecordings();
    } catch (err) {
      console.error('Reindex failed:', err);
      setError('Failed to reindex recordings');
    } finally {
      setLoading(false);
    }
  };

  // Update recording status
  const handleStatusChange = async (id: string, status: IndexedRecording['status']) => {
    if (!window.api?.indexer?.updateStatus) return;

    try {
      await window.api.indexer.updateStatus(id, status);
      await loadRecordings();
      if (selectedRecording?.id === id) {
        setSelectedRecording({ ...selectedRecording, status });
      }
    } catch (err) {
      console.error('Failed to update status:', err);
    }
  };

  // Delete recording
  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this recording?')) return;
    if (!window.api?.indexer?.delete) return;

    try {
      await window.api.indexer.delete(id);
      await loadRecordings();
      if (selectedRecording?.id === id) {
        setSelectedRecording(null);
        setShowDetails(false);
      }
    } catch (err) {
      console.error('Failed to delete recording:', err);
    }
  };

  // Clear filters
  const clearFilters = () => {
    setSearchQuery('');
    setAgentFilter('');
    setCallIdFilter('');
    setStatusFilter('');
    setStartDate('');
    setEndDate('');
  };

  // Handle row click
  const handleRowClick = (recording: IndexedRecording) => {
    setSelectedRecording(recording);
    setShowDetails(true);
  };

  return (
    <div className="recordings-page">
      {/* Header */}
      <div className="recordings-page-header">
        <div className="header-title">
          <h1>Recordings</h1>
          {stats && (
            <span className="header-stats">
              {stats.total} recordings • {formatDuration(stats.totalDuration)} total •{' '}
              {formatFileSize(stats.totalSize)}
            </span>
          )}
        </div>
        <div className="header-actions">
          <button className="btn btn-secondary" onClick={handleReindex} disabled={loading}>
            🔄 Reindex
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="recordings-filters">
        <div className="filter-row">
          {/* Search */}
          <div className="filter-group search-group">
            <input
              type="text"
              className="filter-input search-input"
              placeholder="Search by call ID, agent ID, or filename..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          {/* Date range */}
          <div className="filter-group">
            <label>From</label>
            <input
              type="date"
              className="filter-input"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
          </div>
          <div className="filter-group">
            <label>To</label>
            <input
              type="date"
              className="filter-input"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
            />
          </div>
        </div>

        <div className="filter-row">
          {/* Agent filter */}
          <div className="filter-group">
            <label>Agent</label>
            <select
              className="filter-input"
              value={agentFilter}
              onChange={(e) => setAgentFilter(e.target.value)}
            >
              <option value="">All Agents</option>
              {agentIds.map((id) => (
                <option key={id} value={id}>
                  {id}
                </option>
              ))}
            </select>
          </div>

          {/* Call ID filter */}
          <div className="filter-group">
            <label>Call ID</label>
            <input
              type="text"
              className="filter-input"
              placeholder="Filter by call ID..."
              value={callIdFilter}
              onChange={(e) => setCallIdFilter(e.target.value)}
            />
          </div>

          {/* Status filter */}
          <div className="filter-group">
            <label>Status</label>
            <select
              className="filter-input"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              {STATUS_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          {/* Clear filters */}
          <button className="btn btn-text" onClick={clearFilters}>
            Clear Filters
          </button>
        </div>
      </div>

      {/* Error message */}
      {error && (
        <div className="error-banner">
          <span>⚠️ {error}</span>
          <button onClick={() => setError(null)}>✕</button>
        </div>
      )}

      {/* Content */}
      <div className="recordings-content-wrapper">
        {/* Table */}
        <div className={`recordings-table-container ${showDetails ? 'with-details' : ''}`}>
          {loading ? (
            <div className="loading-state">
              <div className="spinner"></div>
              <p>Loading recordings...</p>
            </div>
          ) : recordings.length === 0 ? (
            <div className="empty-state">
              <div className="empty-icon">📹</div>
              <h3>No recordings found</h3>
              <p>Try adjusting your filters or reindexing</p>
            </div>
          ) : (
            <>
              <table className="recordings-table">
                <thead>
                  <tr>
                    <th style={{ width: '80px' }}>Preview</th>
                    <th>Call ID</th>
                    <th>Agent</th>
                    <th>Date</th>
                    <th>Duration</th>
                    <th>Status</th>
                    <th>Size</th>
                    <th style={{ width: '100px' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {recordings.map((recording) => (
                    <tr
                      key={recording.id}
                      className={selectedRecording?.id === recording.id ? 'selected' : ''}
                      onClick={() => handleRowClick(recording)}
                    >
                      <td className="thumbnail-cell">
                        {recording.thumbnailBase64 ? (
                          <img
                            src={recording.thumbnailBase64}
                            alt=""
                            className="table-thumbnail"
                          />
                        ) : (
                          <div className="table-thumbnail-placeholder">🎥</div>
                        )}
                      </td>
                      <td className="call-id-cell">
                        <span className="call-id">{recording.callId}</span>
                      </td>
                      <td>{recording.agentId}</td>
                      <td>{formatDate(recording.startTime)}</td>
                      <td>{formatDuration(recording.duration)}</td>
                      <td>
                        <span
                          className="status-badge"
                          style={{ backgroundColor: STATUS_COLORS[recording.status] }}
                        >
                          {recording.status.replace('_', ' ')}
                        </span>
                      </td>
                      <td>{formatFileSize(recording.fileSize)}</td>
                      <td className="actions-cell" onClick={(e) => e.stopPropagation()}>
                        <button
                          className="btn-icon"
                          title="Play"
                          onClick={() => onPlay(recording)}
                        >
                          ▶️
                        </button>
                        <button
                          className="btn-icon"
                          title="Delete"
                          onClick={() => handleDelete(recording.id)}
                        >
                          🗑️
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {/* Pagination */}
              <div className="pagination">
                <span className="pagination-info">
                  Showing {(page - 1) * PAGE_SIZE + 1} -{' '}
                  {Math.min(page * PAGE_SIZE, total)} of {total}
                </span>
                <div className="pagination-controls">
                  <button
                    className="btn btn-secondary"
                    disabled={page <= 1}
                    onClick={() => setPage(1)}
                  >
                    ⟨⟨
                  </button>
                  <button
                    className="btn btn-secondary"
                    disabled={page <= 1}
                    onClick={() => setPage(page - 1)}
                  >
                    ⟨
                  </button>
                  <span className="page-indicator">
                    Page {page} of {totalPages}
                  </span>
                  <button
                    className="btn btn-secondary"
                    disabled={page >= totalPages}
                    onClick={() => setPage(page + 1)}
                  >
                    ⟩
                  </button>
                  <button
                    className="btn btn-secondary"
                    disabled={page >= totalPages}
                    onClick={() => setPage(totalPages)}
                  >
                    ⟩⟩
                  </button>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Details panel */}
        {showDetails && selectedRecording && (
          <div className="recording-details-panel">
            <div className="details-header">
              <h3>Recording Details</h3>
              <button className="btn-icon" onClick={() => setShowDetails(false)}>
                ✕
              </button>
            </div>

            {/* Thumbnail */}
            <div className="details-thumbnail">
              {selectedRecording.thumbnailBase64 ? (
                <img src={selectedRecording.thumbnailBase64} alt="" />
              ) : (
                <div className="thumbnail-placeholder">🎥</div>
              )}
            </div>

            {/* Info */}
            <div className="details-info">
              <div className="info-row">
                <span className="info-label">Call ID</span>
                <span className="info-value">{selectedRecording.callId}</span>
              </div>
              <div className="info-row">
                <span className="info-label">Agent ID</span>
                <span className="info-value">{selectedRecording.agentId}</span>
              </div>
              <div className="info-row">
                <span className="info-label">Started</span>
                <span className="info-value">{formatDate(selectedRecording.startTime)}</span>
              </div>
              <div className="info-row">
                <span className="info-label">Duration</span>
                <span className="info-value">{formatDuration(selectedRecording.duration)}</span>
              </div>
              <div className="info-row">
                <span className="info-label">Resolution</span>
                <span className="info-value">
                  {selectedRecording.resolution} @ {selectedRecording.fps}fps
                </span>
              </div>
              <div className="info-row">
                <span className="info-label">Size</span>
                <span className="info-value">{formatFileSize(selectedRecording.fileSize)}</span>
              </div>
              <div className="info-row">
                <span className="info-label">Codec</span>
                <span className="info-value">{selectedRecording.codec}</span>
              </div>
              <div className="info-row">
                <span className="info-label">File</span>
                <span className="info-value filename">{selectedRecording.filename}</span>
              </div>
            </div>

            {/* Status selector */}
            <div className="details-status">
              <label>Status</label>
              <select
                value={selectedRecording.status}
                onChange={(e) =>
                  handleStatusChange(
                    selectedRecording.id,
                    e.target.value as IndexedRecording['status']
                  )
                }
              >
                {STATUS_OPTIONS.filter((o) => o.value).map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Tags */}
            {selectedRecording.tags.length > 0 && (
              <div className="details-tags">
                <label>Tags</label>
                <div className="tags-list">
                  {selectedRecording.tags.map((tag) => (
                    <span key={tag} className="tag">
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Notes */}
            {selectedRecording.notes && (
              <div className="details-notes">
                <label>Notes</label>
                <p>{selectedRecording.notes}</p>
              </div>
            )}

            {/* Actions */}
            <div className="details-actions">
              <button className="btn btn-primary" onClick={() => onPlay(selectedRecording)}>
                ▶️ Play Recording
              </button>
              <button
                className="btn btn-danger"
                onClick={() => handleDelete(selectedRecording.id)}
              >
                🗑️ Delete
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default RecordingsPage;
