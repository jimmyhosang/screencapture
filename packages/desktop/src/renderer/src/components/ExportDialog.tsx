import { useState } from 'react';

interface VideoRecording {
  id: string;
  filename: string;
  resolution: string;
  duration: number;
}

interface ExportOptions {
  format: 'mp4' | 'webm';
  quality: 'low' | 'medium' | 'high';
  resolution: string | null;
  includeAudio: boolean;
  applyRedaction: boolean;
}

interface ExportDialogProps {
  recording: VideoRecording;
  onClose: () => void;
  onExport: (options: ExportOptions) => void;
}

function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  }
  return `${seconds}s`;
}

function ExportDialog({ recording, onClose, onExport }: ExportDialogProps): JSX.Element {
  const [options, setOptions] = useState<ExportOptions>({
    format: 'mp4',
    quality: 'high',
    resolution: null,
    includeAudio: true,
    applyRedaction: true
  });
  const [exporting, setExporting] = useState(false);

  const resolutionOptions = [
    { value: null, label: `Original (${recording.resolution})` },
    { value: '1920x1080', label: '1080p (1920x1080)' },
    { value: '1280x720', label: '720p (1280x720)' },
    { value: '854x480', label: '480p (854x480)' },
    { value: '640x360', label: '360p (640x360)' }
  ];

  const handleExport = async () => {
    setExporting(true);
    try {
      await onExport(options);
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="export-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="export-header">
          <h3>Export Recording</h3>
          <button className="btn-icon" onClick={onClose}>✕</button>
        </div>

        <div className="export-content">
          {/* Recording info */}
          <div className="export-info">
            <p><strong>{recording.filename}</strong></p>
            <p>{recording.resolution} • {formatDuration(recording.duration)}</p>
          </div>

          {/* Format selection */}
          <div className="export-section">
            <label className="export-label">Format</label>
            <div className="format-options">
              <button
                className={`format-btn ${options.format === 'mp4' ? 'active' : ''}`}
                onClick={() => setOptions({ ...options, format: 'mp4' })}
              >
                <span className="format-icon">🎬</span>
                <span className="format-name">MP4</span>
                <span className="format-desc">Best compatibility</span>
              </button>
              <button
                className={`format-btn ${options.format === 'webm' ? 'active' : ''}`}
                onClick={() => setOptions({ ...options, format: 'webm' })}
              >
                <span className="format-icon">🌐</span>
                <span className="format-name">WebM</span>
                <span className="format-desc">Smaller file size</span>
              </button>
            </div>
          </div>

          {/* Quality selection */}
          <div className="export-section">
            <label className="export-label">Quality</label>
            <div className="quality-options">
              {(['low', 'medium', 'high'] as const).map((q) => (
                <button
                  key={q}
                  className={`quality-btn ${options.quality === q ? 'active' : ''}`}
                  onClick={() => setOptions({ ...options, quality: q })}
                >
                  {q === 'low' && '📉'}
                  {q === 'medium' && '📊'}
                  {q === 'high' && '📈'}
                  <span>{q.charAt(0).toUpperCase() + q.slice(1)}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Resolution selection */}
          <div className="export-section">
            <label className="export-label">Resolution</label>
            <select
              className="export-select"
              value={options.resolution || ''}
              onChange={(e) => setOptions({
                ...options,
                resolution: e.target.value || null
              })}
            >
              {resolutionOptions.map((opt) => (
                <option key={opt.label} value={opt.value || ''}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          {/* Toggle options */}
          <div className="export-section">
            <div className="toggle-row">
              <label className="toggle-label">Include Audio</label>
              <div
                className={`toggle ${options.includeAudio ? 'active' : ''}`}
                onClick={() => setOptions({ ...options, includeAudio: !options.includeAudio })}
              />
            </div>
            <div className="toggle-row">
              <label className="toggle-label">Apply Redaction</label>
              <div
                className={`toggle ${options.applyRedaction ? 'active' : ''}`}
                onClick={() => setOptions({ ...options, applyRedaction: !options.applyRedaction })}
              />
            </div>
          </div>
        </div>

        <div className="export-footer">
          <button className="btn btn-secondary" onClick={onClose} disabled={exporting}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={handleExport} disabled={exporting}>
            {exporting ? 'Exporting...' : 'Export'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default ExportDialog;
