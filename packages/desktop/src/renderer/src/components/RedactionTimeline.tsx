import { useState, useRef, useCallback, useEffect } from 'react';

// Types
interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface TimelineEvent {
  id: string;
  type: 'manual' | 'auto-pii' | 'app-block';
  sourceId: string;
  startTime: number;
  endTime: number;
  bounds: BoundingBox;
  style: 'solid' | 'blur' | 'pixelate' | 'pattern';
  label?: string;
}

interface TimelineTrack {
  id: string;
  name: string;
  type: 'manual' | 'auto' | 'app';
  events: TimelineEvent[];
  visible: boolean;
  locked: boolean;
}

interface RedactionTimelineProps {
  duration: number;
  currentTime: number;
  tracks: TimelineTrack[];
  onSeek: (time: number) => void;
  onEventUpdate: (trackId: string, eventId: string, updates: Partial<TimelineEvent>) => void;
  onEventDelete: (trackId: string, eventId: string) => void;
  onTrackVisibilityChange: (trackId: string, visible: boolean) => void;
  selectedEventId?: string;
  onEventSelect: (trackId: string, eventId: string | null) => void;
}

// Track colors
const TRACK_COLORS: Record<string, string> = {
  manual: '#e94560',
  auto: '#3b82f6',
  app: '#f59e0b',
};

function RedactionTimeline({
  duration,
  currentTime,
  tracks,
  onSeek,
  onEventUpdate,
  onEventDelete,
  onTrackVisibilityChange,
  selectedEventId,
  onEventSelect,
}: RedactionTimelineProps): JSX.Element {
  const timelineRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(1);
  const [scrollLeft, setScrollLeft] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [dragType, setDragType] = useState<'playhead' | 'event-start' | 'event-end' | 'event-move' | null>(null);
  const [dragEventInfo, setDragEventInfo] = useState<{ trackId: string; eventId: string } | null>(null);
  const [dragStartTime, setDragStartTime] = useState(0);

  // Calculate timeline width based on zoom
  const baseWidth = 1000;
  const timelineWidth = baseWidth * zoom;
  const pixelsPerMs = timelineWidth / duration;

  // Convert time to pixel position
  const timeToPixel = useCallback((time: number) => time * pixelsPerMs, [pixelsPerMs]);

  // Convert pixel position to time
  const pixelToTime = useCallback((pixel: number) => pixel / pixelsPerMs, [pixelsPerMs]);

  // Handle timeline click for seeking
  const handleTimelineClick = (e: React.MouseEvent) => {
    if (isDragging) return;

    const timeline = timelineRef.current;
    if (!timeline) return;

    const rect = timeline.getBoundingClientRect();
    const x = e.clientX - rect.left + scrollLeft;
    const time = Math.max(0, Math.min(duration, pixelToTime(x)));
    onSeek(time);
  };

  // Handle mouse down for dragging
  const handleMouseDown = (
    e: React.MouseEvent,
    type: 'playhead' | 'event-start' | 'event-end' | 'event-move',
    trackId?: string,
    eventId?: string
  ) => {
    e.stopPropagation();
    setIsDragging(true);
    setDragType(type);
    if (trackId && eventId) {
      setDragEventInfo({ trackId, eventId });
      const event = tracks.find(t => t.id === trackId)?.events.find(ev => ev.id === eventId);
      if (event) {
        setDragStartTime(type === 'event-end' ? event.endTime : event.startTime);
      }
    }
  };

  // Handle mouse move for dragging
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging || !dragType) return;

      const timeline = timelineRef.current;
      if (!timeline) return;

      const rect = timeline.getBoundingClientRect();
      const x = e.clientX - rect.left + scrollLeft;
      const time = Math.max(0, Math.min(duration, pixelToTime(x)));

      if (dragType === 'playhead') {
        onSeek(time);
      } else if (dragEventInfo) {
        const event = tracks.find(t => t.id === dragEventInfo.trackId)?.events.find(ev => ev.id === dragEventInfo.eventId);
        if (!event) return;

        if (dragType === 'event-start') {
          const newStart = Math.min(time, event.endTime - 100);
          onEventUpdate(dragEventInfo.trackId, dragEventInfo.eventId, { startTime: Math.max(0, newStart) });
        } else if (dragType === 'event-end') {
          const newEnd = Math.max(time, event.startTime + 100);
          onEventUpdate(dragEventInfo.trackId, dragEventInfo.eventId, { endTime: Math.min(duration, newEnd) });
        } else if (dragType === 'event-move') {
          const eventDuration = event.endTime - event.startTime;
          const deltaTime = time - dragStartTime;
          const newStart = Math.max(0, Math.min(duration - eventDuration, event.startTime + deltaTime));
          const newEnd = newStart + eventDuration;
          onEventUpdate(dragEventInfo.trackId, dragEventInfo.eventId, {
            startTime: newStart,
            endTime: newEnd,
          });
          setDragStartTime(time);
        }
      }
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      setDragType(null);
      setDragEventInfo(null);
    };

    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, dragType, dragEventInfo, dragStartTime, tracks, duration, pixelToTime, scrollLeft, onSeek, onEventUpdate]);

  // Handle scroll
  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    setScrollLeft(e.currentTarget.scrollLeft);
  };

  // Generate time markers
  const markers = [];
  const markerInterval = duration / 10;
  for (let time = 0; time <= duration; time += markerInterval) {
    markers.push({
      time,
      label: formatTime(time),
      position: timeToPixel(time),
    });
  }

  return (
    <div className="redaction-timeline">
      {/* Timeline Header */}
      <div className="timeline-header">
        <div className="timeline-controls">
          <span className="current-time">{formatTime(currentTime)}</span>
          <span className="duration">/ {formatTime(duration)}</span>
        </div>
        <div className="zoom-controls">
          <button
            className="btn-icon"
            onClick={() => setZoom((z) => Math.max(0.5, z - 0.25))}
            title="Zoom out"
          >
            -
          </button>
          <span className="zoom-level">{Math.round(zoom * 100)}%</span>
          <button
            className="btn-icon"
            onClick={() => setZoom((z) => Math.min(4, z + 0.25))}
            title="Zoom in"
          >
            +
          </button>
        </div>
      </div>

      {/* Track Labels */}
      <div className="timeline-tracks-labels">
        {tracks.map((track) => (
          <div key={track.id} className="track-label">
            <button
              className={`track-visibility ${track.visible ? 'visible' : ''}`}
              onClick={() => onTrackVisibilityChange(track.id, !track.visible)}
              title={track.visible ? 'Hide track' : 'Show track'}
            >
              <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor">
                {track.visible ? (
                  <path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z" />
                ) : (
                  <path d="M12 7c2.76 0 5 2.24 5 5 0 .65-.13 1.26-.36 1.83l2.92 2.92c1.51-1.26 2.7-2.89 3.43-4.75-1.73-4.39-6-7.5-11-7.5-1.4 0-2.74.25-3.98.7l2.16 2.16C10.74 7.13 11.35 7 12 7zM2 4.27l2.28 2.28.46.46C3.08 8.3 1.78 10.02 1 12c1.73 4.39 6 7.5 11 7.5 1.55 0 3.03-.3 4.38-.84l.42.42L19.73 22 21 20.73 3.27 3 2 4.27zM7.53 9.8l1.55 1.55c-.05.21-.08.43-.08.65 0 1.66 1.34 3 3 3 .22 0 .44-.03.65-.08l1.55 1.55c-.67.33-1.41.53-2.2.53-2.76 0-5-2.24-5-5 0-.79.2-1.53.53-2.2zm4.31-.78l3.15 3.15.02-.16c0-1.66-1.34-3-3-3l-.17.01z" />
                )}
              </svg>
            </button>
            <span
              className="track-name"
              style={{ color: TRACK_COLORS[track.type] }}
            >
              {track.name}
            </span>
            {track.locked && (
              <svg className="track-locked" viewBox="0 0 24 24" width="12" height="12" fill="currentColor">
                <path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2z" />
              </svg>
            )}
            <span className="track-count">{track.events.length}</span>
          </div>
        ))}
      </div>

      {/* Timeline Content */}
      <div
        className="timeline-content"
        ref={timelineRef}
        onClick={handleTimelineClick}
        onScroll={handleScroll}
      >
        <div className="timeline-inner" style={{ width: `${timelineWidth}px` }}>
          {/* Time Ruler */}
          <div className="time-ruler">
            {markers.map((marker, i) => (
              <div
                key={i}
                className="time-marker"
                style={{ left: `${marker.position}px` }}
              >
                <span className="marker-label">{marker.label}</span>
              </div>
            ))}
          </div>

          {/* Tracks */}
          <div className="timeline-tracks">
            {tracks.map((track) => (
              <div
                key={track.id}
                className={`timeline-track ${!track.visible ? 'hidden' : ''}`}
              >
                {/* Events */}
                {track.events.map((event) => {
                  const left = timeToPixel(event.startTime);
                  const width = timeToPixel(event.endTime - event.startTime);
                  const isSelected = event.id === selectedEventId;

                  return (
                    <div
                      key={event.id}
                      className={`timeline-event ${isSelected ? 'selected' : ''}`}
                      style={{
                        left: `${left}px`,
                        width: `${Math.max(width, 4)}px`,
                        backgroundColor: TRACK_COLORS[track.type],
                      }}
                      onClick={(e) => {
                        e.stopPropagation();
                        onEventSelect(track.id, isSelected ? null : event.id);
                      }}
                      onMouseDown={(e) => {
                        if (track.locked) return;
                        handleMouseDown(e, 'event-move', track.id, event.id);
                      }}
                    >
                      {/* Resize handles */}
                      {!track.locked && width > 20 && (
                        <>
                          <div
                            className="event-handle start"
                            onMouseDown={(e) => handleMouseDown(e, 'event-start', track.id, event.id)}
                          />
                          <div
                            className="event-handle end"
                            onMouseDown={(e) => handleMouseDown(e, 'event-end', track.id, event.id)}
                          />
                        </>
                      )}

                      {/* Event label */}
                      {width > 60 && (
                        <span className="event-label">{event.label || event.style}</span>
                      )}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>

          {/* Playhead */}
          <div
            className="timeline-playhead"
            style={{ left: `${timeToPixel(currentTime)}px` }}
            onMouseDown={(e) => handleMouseDown(e, 'playhead')}
          >
            <div className="playhead-head" />
            <div className="playhead-line" />
          </div>
        </div>
      </div>

      {/* Selected Event Details */}
      {selectedEventId && (
        <SelectedEventPanel
          tracks={tracks}
          selectedEventId={selectedEventId}
          onUpdate={onEventUpdate}
          onDelete={onEventDelete}
          onClose={() => onEventSelect('', null)}
        />
      )}
    </div>
  );
}

// Selected event panel component
interface SelectedEventPanelProps {
  tracks: TimelineTrack[];
  selectedEventId: string;
  onUpdate: (trackId: string, eventId: string, updates: Partial<TimelineEvent>) => void;
  onDelete: (trackId: string, eventId: string) => void;
  onClose: () => void;
}

function SelectedEventPanel({
  tracks,
  selectedEventId,
  onUpdate,
  onDelete,
  onClose,
}: SelectedEventPanelProps): JSX.Element | null {
  // Find the selected event
  let selectedEvent: TimelineEvent | null = null;
  let trackId: string = '';

  for (const track of tracks) {
    const event = track.events.find((e) => e.id === selectedEventId);
    if (event) {
      selectedEvent = event;
      trackId = track.id;
      break;
    }
  }

  if (!selectedEvent) return null;

  const track = tracks.find((t) => t.id === trackId);

  return (
    <div className="selected-event-panel">
      <div className="panel-header">
        <h4>Event Details</h4>
        <button className="btn-icon" onClick={onClose}>
          ×
        </button>
      </div>

      <div className="panel-content">
        <div className="detail-row">
          <label>Type:</label>
          <span>{selectedEvent.type}</span>
        </div>

        <div className="detail-row">
          <label>Style:</label>
          <span className="style-badge" data-style={selectedEvent.style}>
            {selectedEvent.style}
          </span>
        </div>

        <div className="detail-row">
          <label>Start:</label>
          <input
            type="text"
            value={formatTime(selectedEvent.startTime)}
            onChange={(e) => {
              const time = parseTime(e.target.value);
              if (!isNaN(time)) {
                onUpdate(trackId, selectedEvent!.id, { startTime: time });
              }
            }}
            disabled={track?.locked}
          />
        </div>

        <div className="detail-row">
          <label>End:</label>
          <input
            type="text"
            value={formatTime(selectedEvent.endTime)}
            onChange={(e) => {
              const time = parseTime(e.target.value);
              if (!isNaN(time)) {
                onUpdate(trackId, selectedEvent!.id, { endTime: time });
              }
            }}
            disabled={track?.locked}
          />
        </div>

        <div className="detail-row">
          <label>Duration:</label>
          <span>{formatTime(selectedEvent.endTime - selectedEvent.startTime)}</span>
        </div>

        {!track?.locked && (
          <button
            className="btn btn-danger btn-sm"
            onClick={() => onDelete(trackId, selectedEvent!.id)}
          >
            Delete Event
          </button>
        )}
      </div>
    </div>
  );
}

// Format time in MM:SS.mmm format
function formatTime(ms: number): string {
  const totalSeconds = ms / 1000;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = Math.floor(totalSeconds % 60);
  const milliseconds = Math.floor(ms % 1000);
  return `${minutes}:${seconds.toString().padStart(2, '0')}.${milliseconds.toString().padStart(3, '0')}`;
}

// Parse time from MM:SS.mmm format
function parseTime(str: string): number {
  const parts = str.split(':');
  if (parts.length !== 2) return NaN;

  const minutes = parseInt(parts[0], 10);
  const secondsParts = parts[1].split('.');
  const seconds = parseInt(secondsParts[0], 10);
  const milliseconds = secondsParts[1] ? parseInt(secondsParts[1].padEnd(3, '0'), 10) : 0;

  if (isNaN(minutes) || isNaN(seconds) || isNaN(milliseconds)) return NaN;

  return minutes * 60 * 1000 + seconds * 1000 + milliseconds;
}

export default RedactionTimeline;
