import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import type { eventWithTime } from '@rrweb/types';
import './VirtualEventList.css';

// =============================================================================
// Types
// =============================================================================

interface VirtualEventListProps {
  /** Events to display */
  events: eventWithTime[];
  /** Height of each row in pixels */
  rowHeight?: number;
  /** Height of the container */
  containerHeight?: number;
  /** Number of extra rows to render above/below viewport */
  overscan?: number;
  /** Callback when an event is clicked */
  onEventClick?: (event: eventWithTime, index: number) => void;
  /** Callback to seek player to a specific time */
  onSeekTo?: (timeOffset: number) => void;
}

interface EventRowProps {
  event: eventWithTime;
  index: number;
  startTime: number;
  onClick?: () => void;
  onSeekTo?: (timeOffset: number) => void;
  style: React.CSSProperties;
}

// =============================================================================
// Event Type Labels
// =============================================================================

const EVENT_TYPE_LABELS: Record<number, string> = {
  0: 'DomContentLoaded',
  1: 'Load',
  2: 'FullSnapshot',
  3: 'IncrementalSnapshot',
  4: 'Meta',
  5: 'Custom',
  6: 'Plugin',
};

const INCREMENTAL_SOURCE_LABELS: Record<number, string> = {
  0: 'Mutation',
  1: 'MouseMove',
  2: 'MouseInteraction',
  3: 'Scroll',
  4: 'ViewportResize',
  5: 'Input',
  6: 'TouchMove',
  7: 'MediaInteraction',
  8: 'StyleSheetRule',
  9: 'CanvasMutation',
  10: 'Font',
  11: 'Log',
  12: 'Drag',
  13: 'StyleDeclaration',
  14: 'Selection',
  15: 'AdoptedStyleSheet',
};

// =============================================================================
// Helper Functions
// =============================================================================

function formatTimestamp(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const millis = ms % 1000;
  return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}.${millis.toString().padStart(3, '0')}`;
}

function getEventTypeLabel(event: eventWithTime): string {
  const baseType = EVENT_TYPE_LABELS[event.type] || `Type ${event.type}`;

  // For incremental snapshots, add source type
  if (event.type === 3 && 'data' in event) {
    const data = event.data as { source?: number };
    if (typeof data.source === 'number') {
      const sourceLabel = INCREMENTAL_SOURCE_LABELS[data.source] || `Source ${data.source}`;
      return `${sourceLabel}`;
    }
  }

  return baseType;
}

function getEventIcon(event: eventWithTime): string {
  switch (event.type) {
    case 2:
      return '📷'; // FullSnapshot
    case 4:
      return 'ℹ️'; // Meta
    case 3:
      // Incremental snapshot
      if ('data' in event) {
        const data = event.data as { source?: number };
        switch (data.source) {
          case 0:
            return '🔄'; // Mutation
          case 1:
          case 2:
            return '🖱️'; // Mouse
          case 3:
            return '📜'; // Scroll
          case 4:
            return '📐'; // Resize
          case 5:
            return '⌨️'; // Input
          case 6:
            return '👆'; // Touch
          default:
            return '📝';
        }
      }
      return '📝';
    default:
      return '📌';
  }
}

// =============================================================================
// Event Row Component
// =============================================================================

function EventRow({ event, index, startTime, onClick, onSeekTo, style }: EventRowProps) {
  const timeOffset = event.timestamp - startTime;
  const typeLabel = getEventTypeLabel(event);
  const icon = getEventIcon(event);

  const handleSeek = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onSeekTo?.(timeOffset);
    },
    [onSeekTo, timeOffset]
  );

  return (
    <div className="virtual-event-row" style={style} onClick={onClick}>
      <span className="virtual-event-index">{index + 1}</span>
      <span className="virtual-event-icon">{icon}</span>
      <span className="virtual-event-type">{typeLabel}</span>
      <span className="virtual-event-time">{formatTimestamp(timeOffset)}</span>
      {onSeekTo && (
        <button className="virtual-event-seek" onClick={handleSeek} title="Seek to this event">
          ▶
        </button>
      )}
    </div>
  );
}

// =============================================================================
// Main Component
// =============================================================================

/**
 * Virtual scrolling event list for efficient rendering of large event lists.
 * Only renders visible rows plus overscan buffer.
 */
export function VirtualEventList({
  events,
  rowHeight = 40,
  containerHeight = 400,
  overscan = 5,
  onEventClick,
  onSeekTo,
}: VirtualEventListProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);

  // Calculate start time from first event
  const startTime = useMemo(() => {
    return events.length > 0 ? events[0].timestamp : 0;
  }, [events]);

  // Calculate visible range
  const { startIndex, endIndex, visibleCount } = useMemo(() => {
    const visibleCount = Math.ceil(containerHeight / rowHeight);
    const startIndex = Math.max(0, Math.floor(scrollTop / rowHeight) - overscan);
    const endIndex = Math.min(events.length, startIndex + visibleCount + overscan * 2);
    return { startIndex, endIndex, visibleCount };
  }, [scrollTop, containerHeight, rowHeight, events.length, overscan]);

  // Calculate total height
  const totalHeight = events.length * rowHeight;

  // Handle scroll
  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    setScrollTop(e.currentTarget.scrollTop);
  }, []);

  // Scroll to bottom when new events are added
  useEffect(() => {
    if (containerRef.current) {
      // Only auto-scroll if already near bottom
      const container = containerRef.current;
      const isNearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < rowHeight * 3;
      if (isNearBottom) {
        container.scrollTop = container.scrollHeight;
      }
    }
  }, [events.length, rowHeight]);

  // Generate visible rows
  const visibleRows = useMemo(() => {
    const rows: React.ReactNode[] = [];

    for (let i = startIndex; i < endIndex; i++) {
      const event = events[i];
      if (!event) continue;

      const style: React.CSSProperties = {
        position: 'absolute',
        top: i * rowHeight,
        left: 0,
        right: 0,
        height: rowHeight,
      };

      rows.push(
        <EventRow
          key={`${event.timestamp}-${i}`}
          event={event}
          index={i}
          startTime={startTime}
          onClick={onEventClick ? () => onEventClick(event, i) : undefined}
          onSeekTo={onSeekTo}
          style={style}
        />
      );
    }

    return rows;
  }, [events, startIndex, endIndex, rowHeight, startTime, onEventClick, onSeekTo]);

  if (events.length === 0) {
    return (
      <div className="virtual-event-list-empty">
        <p>No events recorded yet</p>
      </div>
    );
  }

  return (
    <div className="virtual-event-list-container">
      {/* Header */}
      <div className="virtual-event-list-header">
        <span className="virtual-event-header-cell virtual-event-header-index">#</span>
        <span className="virtual-event-header-cell virtual-event-header-type">Event</span>
        <span className="virtual-event-header-cell virtual-event-header-time">Time</span>
      </div>

      {/* Summary */}
      <div className="virtual-event-list-summary">
        <span>{events.length.toLocaleString()} events</span>
        <span>•</span>
        <span>
          Duration: {formatTimestamp(events[events.length - 1].timestamp - startTime)}
        </span>
        <span>•</span>
        <span>Showing {Math.min(visibleCount, events.length)} of {events.length}</span>
      </div>

      {/* Scrollable container */}
      <div
        ref={containerRef}
        className="virtual-event-list-scroll"
        style={{ height: containerHeight }}
        onScroll={handleScroll}
      >
        {/* Spacer for total height */}
        <div className="virtual-event-list-spacer" style={{ height: totalHeight }}>
          {visibleRows}
        </div>
      </div>
    </div>
  );
}

export default VirtualEventList;
