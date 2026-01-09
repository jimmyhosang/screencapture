/**
 * Session Player Component
 *
 * Integrated video player with input event overlay and timeline.
 * Displays desktop recordings with synchronized input visualization.
 */

import { useRef, useState, useEffect, useCallback } from 'react';
import InputEventOverlay from './InputEventOverlay';
import InputEventsTimeline from './InputEventsTimeline';
import './SessionPlayer.css';

// Types
interface InputEvent {
  timestamp: number;
  type: 'click' | 'keydown' | 'keyup' | 'scroll' | 'mousemove';
  x?: number;
  y?: number;
  button?: number;
  keycode?: number;
  key?: string;
  scrollDelta?: { x: number; y: number };
  duration?: number;
  modifiers?: {
    ctrl: boolean;
    alt: boolean;
    shift: boolean;
    meta: boolean;
  };
}

interface SessionRecording {
  id: string;
  recordingId?: string;
  videoPath: string;
  inputEventsPath?: string;
  windowLogPath?: string;
  durationMs: number;
  fileSize: number;
  resolutionWidth: number;
  resolutionHeight: number;
  frameRate?: number;
  quality?: string;
  inputEventCount: number;
  windowChangeCount: number;
  callId?: string;
  agentId?: string;
  status: string;
  createdAt: number;
}

interface SessionPlayerProps {
  session: SessionRecording;
  onClose: () => void;
}

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

export default function SessionPlayer({ session, onClose }: SessionPlayerProps): JSX.Element {
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Video state
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [videoSize, setVideoSize] = useState({ width: 0, height: 0 });

  // Input events state
  const [inputEvents, setInputEvents] = useState<InputEvent[]>([]);
  const [showOverlay, setShowOverlay] = useState(true);
  const [showCursor, setShowCursor] = useState(true);
  const [showClicks, setShowClicks] = useState(true);
  const [showKeystrokes, setShowKeystrokes] = useState(true);

  // Controls timer
  const hideControlsTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load input events
  useEffect(() => {
    const loadInputEvents = async () => {
      if (!session.recordingId || session.inputEventCount === 0) return;

      try {
        // Fetch input events via IPC
        if (window.api?.inputEvents?.get) {
          const events = await window.api.inputEvents.get(session.recordingId);
          // Convert from stored format
          const converted = events.map((e: {
            timestampMs: number;
            eventType: string;
            x?: number;
            y?: number;
            button?: number;
            keycode?: number;
            keyName?: string;
            scrollDeltaX?: number;
            scrollDeltaY?: number;
            durationMs?: number;
            modifiers?: InputEvent['modifiers'];
          }) => ({
            timestamp: e.timestampMs,
            type: e.eventType as InputEvent['type'],
            x: e.x,
            y: e.y,
            button: e.button,
            keycode: e.keycode,
            key: e.keyName,
            scrollDelta: e.scrollDeltaX !== undefined || e.scrollDeltaY !== undefined
              ? { x: e.scrollDeltaX || 0, y: e.scrollDeltaY || 0 }
              : undefined,
            duration: e.durationMs,
            modifiers: e.modifiers
          }));
          setInputEvents(converted);
        }
      } catch (err) {
        console.error('Failed to load input events:', err);
      }
    };

    loadInputEvents();
  }, [session.recordingId, session.inputEventCount]);

  // Video event handlers
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handleTimeUpdate = () => setCurrentTime(video.currentTime);
    const handleLoadedMetadata = () => {
      setDuration(video.duration);
      setVideoSize({
        width: video.videoWidth,
        height: video.videoHeight
      });
    };
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

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
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
        case 'm':
          toggleMute();
          break;
        case 'f':
          toggleFullscreen();
          break;
        case 'o':
          setShowOverlay(prev => !prev);
          break;
        case 'c':
          setShowCursor(prev => !prev);
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isFullscreen, onClose]);

  // Fullscreen handler
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
      hideControlsTimer.current = setTimeout(() => setShowControls(false), 3000);
    }
  }, [isPlaying]);

  useEffect(() => {
    resetHideTimer();
    return () => {
      if (hideControlsTimer.current) clearTimeout(hideControlsTimer.current);
    };
  }, [isPlaying, resetHideTimer]);

  // Playback controls
  const togglePlayPause = () => {
    const video = videoRef.current;
    if (!video) return;
    video.paused ? video.play() : video.pause();
  };

  const seek = (delta: number) => {
    const video = videoRef.current;
    if (!video) return;
    video.currentTime = Math.max(0, Math.min(video.duration, video.currentTime + delta));
  };

  const seekTo = (timeMs: number) => {
    const video = videoRef.current;
    if (!video) return;
    video.currentTime = timeMs / 1000;
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
    if (!containerRef.current) return;
    document.fullscreenElement
      ? document.exitFullscreen()
      : containerRef.current.requestFullscreen();
  };

  // Calculate progress
  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;
  const currentTimeMs = currentTime * 1000;

  // Get video element dimensions for overlay scaling
  const videoElement = videoRef.current;
  const videoRect = videoElement?.getBoundingClientRect();

  return (
    <div className="session-player-overlay" onClick={onClose}>
      <div
        ref={containerRef}
        className={`session-player-container ${isFullscreen ? 'fullscreen' : ''}`}
        onClick={(e) => e.stopPropagation()}
        onMouseMove={resetHideTimer}
      >
        {/* Header */}
        <div className={`player-header ${showControls ? 'visible' : ''}`}>
          <div className="player-title">
            <h3>Session Recording</h3>
            <span className="player-subtitle">
              {session.callId && `Call: ${session.callId} • `}
              {session.agentId && `Agent: ${session.agentId} • `}
              {session.resolutionWidth}x{session.resolutionHeight}
            </span>
          </div>

          {/* Overlay controls */}
          <div className="overlay-toggles">
            <label className="toggle-label">
              <input
                type="checkbox"
                checked={showOverlay}
                onChange={(e) => setShowOverlay(e.target.checked)}
              />
              Overlay
            </label>
            <label className="toggle-label">
              <input
                type="checkbox"
                checked={showCursor}
                onChange={(e) => setShowCursor(e.target.checked)}
              />
              Cursor
            </label>
            <label className="toggle-label">
              <input
                type="checkbox"
                checked={showClicks}
                onChange={(e) => setShowClicks(e.target.checked)}
              />
              Clicks
            </label>
            <label className="toggle-label">
              <input
                type="checkbox"
                checked={showKeystrokes}
                onChange={(e) => setShowKeystrokes(e.target.checked)}
              />
              Keys
            </label>
          </div>

          <button className="btn-close" onClick={onClose}>✕</button>
        </div>

        {/* Video wrapper */}
        <div className="video-wrapper" onClick={togglePlayPause}>
          <video
            ref={videoRef}
            src={`file://${session.videoPath}`}
            className="video-element"
          />

          {/* Input event overlay */}
          {showOverlay && videoRect && inputEvents.length > 0 && (
            <InputEventOverlay
              events={inputEvents}
              currentTimeMs={currentTimeMs}
              recordingStartMs={session.createdAt}
              videoWidth={videoRect.width}
              videoHeight={videoRect.height}
              sourceWidth={session.resolutionWidth}
              sourceHeight={session.resolutionHeight}
              showCursor={showCursor}
              showClicks={showClicks}
              showKeystrokes={showKeystrokes}
            />
          )}

          {/* Play overlay */}
          {!isPlaying && (
            <div className="play-overlay">
              <button className="play-button">▶</button>
            </div>
          )}

          {/* Event count indicator */}
          {inputEvents.length > 0 && (
            <div className={`event-count-indicator ${showControls ? 'visible' : ''}`}>
              {inputEvents.length.toLocaleString()} input events
            </div>
          )}
        </div>

        {/* Input events timeline */}
        {inputEvents.length > 0 && (
          <InputEventsTimeline
            events={inputEvents}
            durationMs={session.durationMs}
            currentTimeMs={currentTimeMs}
            onSeek={seekTo}
          />
        )}

        {/* Controls */}
        <div className={`player-controls ${showControls ? 'visible' : ''}`}>
          {/* Progress bar */}
          <div className="progress-container" onClick={handleProgressClick}>
            <div className="progress-track">
              <div className="progress-fill" style={{ width: `${progress}%` }} />
              <div className="progress-handle" style={{ left: `${progress}%` }} />
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
              <button className="btn-control" onClick={togglePlayPause} title="Play/Pause (Space)">
                {isPlaying ? '⏸' : '▶'}
              </button>
              <button className="btn-control" onClick={() => seek(-10)} title="Back 10s (←)">
                ⏪
              </button>
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
              <button className="btn-control" onClick={toggleFullscreen} title="Fullscreen (F)">
                ⛶
              </button>
            </div>
          </div>
        </div>

        {/* Keyboard shortcuts help */}
        <div className={`shortcuts-help ${showControls ? 'visible' : ''}`}>
          <span>Space: Play</span>
          <span>←→: Seek</span>
          <span>O: Overlay</span>
          <span>C: Cursor</span>
          <span>F: Fullscreen</span>
          <span>Esc: Close</span>
        </div>
      </div>
    </div>
  );
}
