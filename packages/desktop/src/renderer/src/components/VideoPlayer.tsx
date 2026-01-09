import { useRef, useState, useEffect } from 'react';

interface VideoRecording {
  id: string;
  filename: string;
  filePath: string;
  duration: number;
  resolution: string;
}

interface VideoPlayerProps {
  recording: VideoRecording;
  onClose: () => void;
}

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

interface OcrStatus {
  status: 'not_started' | 'queued' | 'processing' | 'completed' | 'failed';
  progress?: number;
  message?: string;
}

function VideoPlayer({ recording, onClose }: VideoPlayerProps): JSX.Element {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [ocrStatus, setOcrStatus] = useState<OcrStatus>({ status: 'not_started' });

  // Check OCR status on mount
  useEffect(() => {
    const checkOcrStatus = async () => {
      if (!window.api?.ocrProcessor?.getReportByRecording) return;

      try {
        const report = await window.api.ocrProcessor.getReportByRecording(recording.id);
        if (report) {
          setOcrStatus({
            status: report.status as OcrStatus['status'],
            progress: report.progress,
            message: report.status === 'completed' ? 'OCR completed - Redaction available' : undefined
          });
        } else {
          setOcrStatus({ status: 'not_started', message: 'OCR not yet processed' });
        }
      } catch (error) {
        console.error('[VideoPlayer] Failed to check OCR status:', error);
      }
    };

    checkOcrStatus();

    // Listen for OCR progress updates
    if (window.api?.ocrProcessor?.onProgress) {
      const progressListener = (data: { recordingId: string; status: string; progress: number; message?: string }) => {
        if (data.recordingId === recording.id) {
          setOcrStatus({
            status: data.status as OcrStatus['status'],
            progress: data.progress,
            message: data.message
          });
        }
      };
      window.api.ocrProcessor.onProgress(progressListener);

      return () => {
        if (window.api?.ocrProcessor?.removeProgressListener) {
          window.api.ocrProcessor.removeProgressListener();
        }
      };
    }
  }, [recording.id]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handleTimeUpdate = () => setCurrentTime(video.currentTime);
    const handleLoadedMetadata = () => setDuration(video.duration);
    const handlePlay = () => setIsPlaying(true);
    const handlePause = () => setIsPlaying(false);
    const handleEnded = () => setIsPlaying(false);

    video.addEventListener('timeupdate', handleTimeUpdate);
    video.addEventListener('loadedmetadata', handleLoadedMetadata);
    video.addEventListener('play', handlePlay);
    video.addEventListener('pause', handlePause);
    video.addEventListener('ended', handleEnded);

    return () => {
      video.removeEventListener('timeupdate', handleTimeUpdate);
      video.removeEventListener('loadedmetadata', handleLoadedMetadata);
      video.removeEventListener('play', handlePlay);
      video.removeEventListener('pause', handlePause);
      video.removeEventListener('ended', handleEnded);
    };
  }, []);

  // Handle keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      } else if (e.key === ' ' || e.key === 'k') {
        e.preventDefault();
        togglePlayPause();
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        seek(-5);
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        seek(5);
      } else if (e.key === 'm') {
        toggleMute();
      } else if (e.key === 'f') {
        toggleFullscreen();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const togglePlayPause = () => {
    const video = videoRef.current;
    if (!video) return;

    if (video.paused) {
      video.play();
    } else {
      video.pause();
    }
  };

  const seek = (delta: number) => {
    const video = videoRef.current;
    if (!video) return;
    video.currentTime = Math.max(0, Math.min(video.duration, video.currentTime + delta));
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const video = videoRef.current;
    if (!video) return;
    video.currentTime = parseFloat(e.target.value);
  };

  const handlePlaybackRateChange = (rate: number) => {
    const video = videoRef.current;
    if (!video) return;
    video.playbackRate = rate;
    setPlaybackRate(rate);
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const video = videoRef.current;
    if (!video) return;
    const newVolume = parseFloat(e.target.value);
    video.volume = newVolume;
    setVolume(newVolume);
    setIsMuted(newVolume === 0);
  };

  const toggleMute = () => {
    const video = videoRef.current;
    if (!video) return;
    video.muted = !video.muted;
    setIsMuted(video.muted);
  };

  const toggleFullscreen = () => {
    const container = document.querySelector('.video-player-container');
    if (!container) return;

    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else {
      container.requestFullscreen();
    }
  };

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="video-player-container" onClick={(e) => e.stopPropagation()}>
        <div className="video-player-header">
          <h3>{recording.filename}</h3>
          <div className="video-player-info">
            <span>{recording.resolution}</span>
            {/* OCR/Redaction Status */}
            {ocrStatus.status === 'processing' && (
              <span style={{ marginLeft: '12px', color: '#f59e0b', fontSize: '0.875rem' }}>
                🔄 Processing OCR... {ocrStatus.progress?.toFixed(0)}%
              </span>
            )}
            {ocrStatus.status === 'completed' && (
              <span style={{ marginLeft: '12px', color: '#10b981', fontSize: '0.875rem' }}>
                ✓ Redaction ready
              </span>
            )}
            {ocrStatus.status === 'queued' && (
              <span style={{ marginLeft: '12px', color: '#6b7280', fontSize: '0.875rem' }}>
                ⏳ OCR queued...
              </span>
            )}
            {ocrStatus.status === 'not_started' && (
              <span style={{ marginLeft: '12px', color: '#6b7280', fontSize: '0.875rem' }}>
                ℹ️ No redaction - OCR processing in background
              </span>
            )}
          </div>
          <button className="btn btn-secondary" onClick={onClose}>
            ✕ Close (Esc)
          </button>
        </div>

        <div className="video-wrapper" onClick={togglePlayPause}>
          <video
            ref={videoRef}
            src={`media://${recording.filePath}`}
            className="video-element"
            onError={(e) => {
              console.error('[VideoPlayer] Video load error:', e);
              const video = e.currentTarget;
              console.error('[VideoPlayer] Error details:', {
                error: video.error,
                networkState: video.networkState,
                readyState: video.readyState,
                src: video.src,
                originalPath: recording.filePath
              });
            }}
            onLoadedMetadata={() => console.log('[VideoPlayer] Video metadata loaded')}
            onCanPlay={() => console.log('[VideoPlayer] Video can play')}
          />
          {!isPlaying && (
            <div className="play-overlay">
              <span className="play-button">▶</span>
            </div>
          )}
        </div>

        <div className="video-controls">
          {/* Progress bar */}
          <div className="progress-container">
            <span className="time-display">{formatTime(currentTime)}</span>
            <input
              type="range"
              className="progress-bar"
              min="0"
              max={duration || 0}
              value={currentTime}
              onChange={handleSeek}
              style={{
                background: `linear-gradient(to right, var(--accent) ${progress}%, var(--border) ${progress}%)`
              }}
            />
            <span className="time-display">{formatTime(duration)}</span>
          </div>

          {/* Control buttons */}
          <div className="controls-row">
            <div className="controls-left">
              <button className="btn-icon" onClick={togglePlayPause}>
                {isPlaying ? '⏸️' : '▶️'}
              </button>
              <button className="btn-icon" onClick={() => seek(-10)}>
                ⏪
              </button>
              <button className="btn-icon" onClick={() => seek(10)}>
                ⏩
              </button>

              {/* Volume */}
              <button className="btn-icon" onClick={toggleMute}>
                {isMuted ? '🔇' : volume > 0.5 ? '🔊' : '🔉'}
              </button>
              <input
                type="range"
                className="volume-slider"
                min="0"
                max="1"
                step="0.1"
                value={isMuted ? 0 : volume}
                onChange={handleVolumeChange}
              />
            </div>

            <div className="controls-center">
              {/* Playback speed */}
              <div className="speed-controls">
                {[0.5, 1, 1.5, 2, 4].map((rate) => (
                  <button
                    key={rate}
                    className={`speed-btn ${playbackRate === rate ? 'active' : ''}`}
                    onClick={() => handlePlaybackRateChange(rate)}
                  >
                    {rate}x
                  </button>
                ))}
              </div>
            </div>

            <div className="controls-right">
              <button className="btn-icon" onClick={toggleFullscreen}>
                ⛶
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default VideoPlayer;
