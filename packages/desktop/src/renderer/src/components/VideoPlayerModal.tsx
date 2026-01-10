import { useEffect, useRef, useState } from 'react';
import './VideoPlayerModal.css';
import RedactionOverlay from './RedactionOverlay';

interface VideoPlayerModalProps {
  filePath: string;
  title: string;
  recordingId: string;
  onClose: () => void;
}

function VideoPlayerModal({ filePath, title, recordingId, onClose }: VideoPlayerModalProps): JSX.Element {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [videoDimensions, setVideoDimensions] = useState({ width: 0, height: 0, displayWidth: 0, displayHeight: 0 });
  const [ocrReady, setOcrReady] = useState(false);

  // Convert file path to file:// URL
  const videoSrc = `file://${filePath}`;

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handleTimeUpdate = () => setCurrentTime(video.currentTime);
    const handleDurationChange = () => setDuration(video.duration);
    const handlePlay = () => setIsPlaying(true);
    const handlePause = () => setIsPlaying(false);
    const handleError = () => {
      setError('Failed to load video. The file may be corrupted or unavailable.');
    };
    const handleLoadedMetadata = () => {
      setVideoDimensions({
        width: video.videoWidth,
        height: video.videoHeight,
        displayWidth: video.clientWidth,
        displayHeight: video.clientHeight
      });
    };

    video.addEventListener('timeupdate', handleTimeUpdate);
    video.addEventListener('durationchange', handleDurationChange);
    video.addEventListener('play', handlePlay);
    video.addEventListener('pause', handlePause);
    video.addEventListener('error', handleError);
    video.addEventListener('loadedmetadata', handleLoadedMetadata);
    window.addEventListener('resize', handleLoadedMetadata);

    // Auto-play on mount
    video.play().catch(() => {
      // Autoplay might be blocked, that's okay
    });

    return () => {
      video.removeEventListener('timeupdate', handleTimeUpdate);
      video.removeEventListener('durationchange', handleDurationChange);
      video.removeEventListener('play', handlePlay);
      video.removeEventListener('pause', handlePause);
      video.removeEventListener('error', handleError);
      video.removeEventListener('loadedmetadata', handleLoadedMetadata);
      window.removeEventListener('resize', handleLoadedMetadata);
    };
  }, []);

  // Handle escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      } else if (e.key === ' ') {
        e.preventDefault();
        togglePlayPause();
      } else if (e.key === 'ArrowLeft') {
        skip(-10);
      } else if (e.key === 'ArrowRight') {
        skip(10);
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

  const skip = (seconds: number) => {
    const video = videoRef.current;
    if (!video) return;
    video.currentTime = Math.max(0, Math.min(video.duration, video.currentTime + seconds));
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const video = videoRef.current;
    if (!video) return;
    video.currentTime = parseFloat(e.target.value);
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const video = videoRef.current;
    if (!video) return;
    const newVolume = parseFloat(e.target.value);
    video.volume = newVolume;
    setVolume(newVolume);
  };

  const handlePlaybackRateChange = (rate: number) => {
    const video = videoRef.current;
    if (!video) return;
    video.playbackRate = rate;
    setPlaybackRate(rate);
  };

  const formatTime = (seconds: number): string => {
    if (!isFinite(seconds)) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="video-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>{title}</h3>
          <button className="btn btn-secondary" onClick={onClose}>
            Close (Esc)
          </button>
        </div>

        <div className="video-container">
          {error ? (
            <div className="video-error">
              <span className="error-icon">⚠️</span>
              <p>{error}</p>
              <p className="error-path">{filePath}</p>
            </div>
          ) : (
            <div className="video-wrapper" style={{ position: 'relative' }}>
              <video
                ref={videoRef}
                src={videoSrc}
                className="video-player"
                onClick={togglePlayPause}
              />
              {/* Redaction Overlay */}
              {videoDimensions.displayWidth > 0 && (
                <RedactionOverlay
                  recordingId={recordingId}
                  currentTime={currentTime}
                  videoWidth={videoDimensions.displayWidth}
                  videoHeight={videoDimensions.displayHeight}
                  frameWidth={videoDimensions.width}
                  frameHeight={videoDimensions.height}
                  enabled={true}
                  style="blur"
                  blurRadius={15}
                  padding={20}
                />
              )}
            </div>
          )}
        </div>

        <div className="video-controls">
          {/* Play/Pause button */}
          <button className="control-btn" onClick={togglePlayPause}>
            {isPlaying ? '⏸️' : '▶️'}
          </button>

          {/* Skip buttons */}
          <button className="control-btn" onClick={() => skip(-10)} title="Back 10s">
            ⏪
          </button>
          <button className="control-btn" onClick={() => skip(10)} title="Forward 10s">
            ⏩
          </button>

          {/* Time display */}
          <span className="time-display">
            {formatTime(currentTime)} / {formatTime(duration)}
          </span>

          {/* Seek bar */}
          <input
            type="range"
            className="seek-bar"
            min={0}
            max={duration || 100}
            value={currentTime}
            onChange={handleSeek}
          />

          {/* Volume control */}
          <span className="volume-icon">{volume === 0 ? '🔇' : volume < 0.5 ? '🔉' : '🔊'}</span>
          <input
            type="range"
            className="volume-bar"
            min={0}
            max={1}
            step={0.1}
            value={volume}
            onChange={handleVolumeChange}
          />

          {/* Playback speed */}
          <select
            className="speed-select"
            value={playbackRate}
            onChange={(e) => handlePlaybackRateChange(parseFloat(e.target.value))}
          >
            <option value={0.5}>0.5x</option>
            <option value={1}>1x</option>
            <option value={1.5}>1.5x</option>
            <option value={2}>2x</option>
            <option value={4}>4x</option>
          </select>
        </div>

        <div className="video-shortcuts">
          <span>Space: Play/Pause</span>
          <span>←/→: Skip 10s</span>
          <span>Esc: Close</span>
        </div>
      </div>
    </div>
  );
}

export default VideoPlayerModal;
