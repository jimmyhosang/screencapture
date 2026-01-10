/**
 * Enhanced Video Player
 *
 * Custom video player with playback controls, window activity timeline,
 * and keyboard shortcuts.
 */

import { useRef, useState, useEffect, useCallback } from 'react';
import './EnhancedVideoPlayer.css';
import RedactionOverlay from './RedactionOverlay';

// Types
interface WindowActivity {
  timestamp: number;
  windowTitle: string;
  processName: string;
  url?: string;
}

interface IndexedRecording {
  id: string;
  callId: string;
  agentId: string;
  filename: string;
  filePath: string;
  duration: number;
  resolution: string;
  startTime: number;
  windowActivityPath: string | null;
}

interface EnhancedVideoPlayerProps {
  recording: IndexedRecording;
  onClose: () => void;
}

// Utility functions
function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

export function EnhancedVideoPlayer({ recording, onClose }: EnhancedVideoPlayerProps): JSX.Element {
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Playback state
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showControls, setShowControls] = useState(true);

  // Window activity
  const [windowActivity, setWindowActivity] = useState<WindowActivity[]>([]);
  const [currentActivity, setCurrentActivity] = useState<WindowActivity | null>(null);

  // Video dimensions for redaction overlay
  const [videoDimensions, setVideoDimensions] = useState({ width: 0, height: 0, displayWidth: 0, displayHeight: 0 });
  const [redactionEnabled, setRedactionEnabled] = useState(true);

  // Controls hide timer
  const hideControlsTimer = useRef<NodeJS.Timeout | null>(null);

  // Load window activity
  useEffect(() => {
    const loadWindowActivity = async () => {
      if (!recording.windowActivityPath) return;

      try {
        // Read file via IPC - for now we'll simulate or leave empty
        // In production, we'd fetch this via an IPC handler
        const response = await fetch(`file://${recording.windowActivityPath}`);
        if (response.ok) {
          const data = await response.json();
          setWindowActivity(data);
        }
      } catch (error) {
        // Window activity file might not exist
        console.log('No window activity data available');
      }
    };

    loadWindowActivity();
  }, [recording.windowActivityPath]);

  // Update current activity based on playback time
  useEffect(() => {
    if (windowActivity.length === 0) return;

    const recordingStart = recording.startTime;
    const currentTimestamp = recordingStart + currentTime * 1000;

    // Find the most recent activity before current time
    let current: WindowActivity | null = null;
    for (const activity of windowActivity) {
      if (activity.timestamp <= currentTimestamp) {
        current = activity;
      } else {
        break;
      }
    }

    setCurrentActivity(current);
  }, [currentTime, windowActivity, recording.startTime]);

  // Video event handlers
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

    // Track video resize for redaction overlay
    const handleResize = () => {
      setVideoDimensions({
        width: video.videoWidth,
        height: video.videoHeight,
        displayWidth: video.clientWidth,
        displayHeight: video.clientHeight
      });
    };
    video.addEventListener('loadedmetadata', handleResize);
    window.addEventListener('resize', handleResize);

    return () => {
      video.removeEventListener('timeupdate', handleTimeUpdate);
      video.removeEventListener('loadedmetadata', handleLoadedMetadata);
      video.removeEventListener('play', handlePlay);
      video.removeEventListener('pause', handlePause);
      video.removeEventListener('ended', handleEnded);
      video.removeEventListener('loadedmetadata', handleResize);
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if typing in an input
      if (e.target instanceof HTMLInputElement) return;

      switch (e.key) {
        case 'Escape':
          if (isFullscreen) {
            document.exitFullscreen();
          } else {
            onClose();
          }
          break;
        case ' ':
        case 'k':
          e.preventDefault();
          togglePlayPause();
          break;
        case 'ArrowLeft':
          e.preventDefault();
          seek(-5);
          break;
        case 'ArrowRight':
          e.preventDefault();
          seek(5);
          break;
        case 'ArrowUp':
          e.preventDefault();
          adjustVolume(0.1);
          break;
        case 'ArrowDown':
          e.preventDefault();
          adjustVolume(-0.1);
          break;
        case 'm':
          toggleMute();
          break;
        case 'f':
          toggleFullscreen();
          break;
        case '<':
        case ',':
          changeSpeed(-1);
          break;
        case '>':
        case '.':
          changeSpeed(1);
          break;
        case '0':
        case '1':
        case '2':
        case '3':
        case '4':
        case '5':
        case '6':
        case '7':
        case '8':
        case '9':
          const percent = parseInt(e.key) * 10;
          seekToPercent(percent);
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose, isFullscreen]);

  // Fullscreen change handler
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  // Auto-hide controls
  const resetHideTimer = useCallback(() => {
    setShowControls(true);
    if (hideControlsTimer.current) {
      clearTimeout(hideControlsTimer.current);
    }
    if (isPlaying) {
      hideControlsTimer.current = setTimeout(() => {
        setShowControls(false);
      }, 3000);
    }
  }, [isPlaying]);

  useEffect(() => {
    resetHideTimer();
    return () => {
      if (hideControlsTimer.current) {
        clearTimeout(hideControlsTimer.current);
      }
    };
  }, [isPlaying, resetHideTimer]);

  // Playback controls
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

  const seekToPercent = (percent: number) => {
    const video = videoRef.current;
    if (!video) return;
    video.currentTime = (video.duration * percent) / 100;
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const video = videoRef.current;
    if (!video) return;
    video.currentTime = parseFloat(e.target.value);
  };

  const handleProgressClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const video = videoRef.current;
    if (!video) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const percent = (e.clientX - rect.left) / rect.width;
    video.currentTime = video.duration * percent;
  };

  const changeSpeed = (direction: number) => {
    const speeds = [0.5, 1, 1.5, 2];
    const currentIndex = speeds.indexOf(playbackRate);
    const newIndex = Math.max(0, Math.min(speeds.length - 1, currentIndex + direction));
    handlePlaybackRateChange(speeds[newIndex]);
  };

  const handlePlaybackRateChange = (rate: number) => {
    const video = videoRef.current;
    if (!video) return;
    video.playbackRate = rate;
    setPlaybackRate(rate);
  };

  const adjustVolume = (delta: number) => {
    const video = videoRef.current;
    if (!video) return;
    const newVolume = Math.max(0, Math.min(1, volume + delta));
    video.volume = newVolume;
    setVolume(newVolume);
    setIsMuted(newVolume === 0);
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
    if (!containerRef.current) return;

    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else {
      containerRef.current.requestFullscreen();
    }
  };

  // Calculate progress
  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  // Get window activity markers
  const activityMarkers = windowActivity.map((activity) => {
    const recordingStart = recording.startTime;
    const activityTime = (activity.timestamp - recordingStart) / 1000; // in seconds
    return {
      position: duration > 0 ? (activityTime / duration) * 100 : 0,
      activity
    };
  });

  return (
    <div className="enhanced-player-overlay" onClick={onClose}>
      <div
        ref={containerRef}
        className={`enhanced-player-container ${isFullscreen ? 'fullscreen' : ''}`}
        onClick={(e) => e.stopPropagation()}
        onMouseMove={resetHideTimer}
      >
        {/* Header */}
        <div className={`player-header ${showControls ? 'visible' : ''}`}>
          <div className="player-title">
            <h3>{recording.filename}</h3>
            <span className="player-subtitle">
              Call: {recording.callId} • Agent: {recording.agentId}
            </span>
          </div>
          <button className="btn-close" onClick={onClose}>
            ✕
          </button>
        </div>

        {/* Video */}
        <div className="video-wrapper" onClick={togglePlayPause}>
          <video
            ref={videoRef}
            src={`file://${recording.filePath}`}
            className="video-element"
          />

          {/* Redaction Overlay */}
          {videoDimensions.displayWidth > 0 && (
            <RedactionOverlay
              recordingId={recording.id}
              currentTime={currentTime}
              videoWidth={videoDimensions.displayWidth}
              videoHeight={videoDimensions.displayHeight}
              frameWidth={videoDimensions.width}
              frameHeight={videoDimensions.height}
              enabled={redactionEnabled}
              style="blur"
              blurRadius={10}
              padding={4}
            />
          )}

          {/* Play overlay */}
          {!isPlaying && (
            <div className="play-overlay">
              <button className="play-button">▶</button>
            </div>
          )}

          {/* Current window activity */}
          {currentActivity && (
            <div className={`activity-indicator ${showControls ? 'visible' : ''}`}>
              <span className="activity-process">{currentActivity.processName}</span>
              <span className="activity-title">{currentActivity.windowTitle}</span>
            </div>
          )}
        </div>

        {/* Controls */}
        <div className={`player-controls ${showControls ? 'visible' : ''}`}>
          {/* Progress bar with activity markers */}
          <div className="progress-container" onClick={handleProgressClick}>
            <div className="progress-track">
              <div className="progress-fill" style={{ width: `${progress}%` }} />
              <div
                className="progress-handle"
                style={{ left: `${progress}%` }}
              />

              {/* Activity markers */}
              {activityMarkers.map((marker, index) => (
                <div
                  key={index}
                  className="activity-marker"
                  style={{ left: `${marker.position}%` }}
                  title={`${marker.activity.processName}: ${marker.activity.windowTitle}`}
                />
              ))}
            </div>
            <input
              type="range"
              className="progress-input"
              min="0"
              max={duration || 0}
              value={currentTime}
              onChange={handleSeek}
            />
          </div>

          {/* Time display */}
          <div className="time-display">
            <span>{formatTime(currentTime)}</span>
            <span className="time-separator">/</span>
            <span>{formatTime(duration)}</span>
          </div>

          {/* Control buttons */}
          <div className="controls-row">
            <div className="controls-left">
              {/* Play/Pause */}
              <button className="btn-control" onClick={togglePlayPause} title="Play/Pause (Space)">
                {isPlaying ? '⏸' : '▶'}
              </button>

              {/* Skip back */}
              <button className="btn-control" onClick={() => seek(-10)} title="Back 10s (←)">
                ⏪
              </button>

              {/* Skip forward */}
              <button className="btn-control" onClick={() => seek(10)} title="Forward 10s (→)">
                ⏩
              </button>

              {/* Volume */}
              <div className="volume-control">
                <button className="btn-control" onClick={toggleMute} title="Mute (M)">
                  {isMuted || volume === 0 ? '🔇' : volume > 0.5 ? '🔊' : '🔉'}
                </button>
                <input
                  type="range"
                  className="volume-slider"
                  min="0"
                  max="1"
                  step="0.05"
                  value={isMuted ? 0 : volume}
                  onChange={handleVolumeChange}
                />
              </div>
            </div>

            <div className="controls-center">
              {/* Playback speed */}
              <div className="speed-control">
                {[0.5, 1, 1.5, 2].map((rate) => (
                  <button
                    key={rate}
                    className={`speed-btn ${playbackRate === rate ? 'active' : ''}`}
                    onClick={() => handlePlaybackRateChange(rate)}
                    title={`${rate}x speed`}
                  >
                    {rate}x
                  </button>
                ))}
              </div>
            </div>

            <div className="controls-right">
              {/* Fullscreen */}
              <button className="btn-control" onClick={toggleFullscreen} title="Fullscreen (F)">
                {isFullscreen ? '⛶' : '⛶'}
              </button>
            </div>
          </div>
        </div>

        {/* Keyboard shortcuts help */}
        <div className={`shortcuts-help ${showControls ? 'visible' : ''}`}>
          <span>Space: Play/Pause</span>
          <span>←→: Seek</span>
          <span>&lt;&gt;: Speed</span>
          <span>F: Fullscreen</span>
          <span>M: Mute</span>
          <span>Esc: Close</span>
        </div>
      </div>
    </div>
  );
}

export default EnhancedVideoPlayer;
