/**
 * Input Events Timeline Component
 *
 * Displays input events as markers on a timeline synchronized with video playback.
 * Shows density visualization and allows clicking to seek.
 */

import { useMemo } from 'react';
import './InputEventsTimeline.css';

interface InputEvent {
  timestamp: number;
  type: 'click' | 'keydown' | 'keyup' | 'scroll' | 'mousemove';
  x?: number;
  y?: number;
  key?: string;
}

interface InputEventsTimelineProps {
  events: InputEvent[];
  durationMs: number;
  currentTimeMs: number;
  onSeek: (timeMs: number) => void;
  height?: number;
}

interface EventBucket {
  startMs: number;
  endMs: number;
  clicks: number;
  keystrokes: number;
  scrolls: number;
  total: number;
}

// Generate event density buckets
function generateBuckets(events: InputEvent[], durationMs: number, bucketCount = 100): EventBucket[] {
  const bucketSize = Math.max(durationMs / bucketCount, 100);
  const buckets: EventBucket[] = [];

  for (let i = 0; i < bucketCount; i++) {
    buckets.push({
      startMs: i * bucketSize,
      endMs: (i + 1) * bucketSize,
      clicks: 0,
      keystrokes: 0,
      scrolls: 0,
      total: 0
    });
  }

  events.forEach(event => {
    const bucketIndex = Math.min(
      Math.floor(event.timestamp / bucketSize),
      bucketCount - 1
    );

    if (bucketIndex >= 0 && bucketIndex < buckets.length) {
      buckets[bucketIndex].total++;

      if (event.type === 'click') {
        buckets[bucketIndex].clicks++;
      } else if (event.type === 'keydown') {
        buckets[bucketIndex].keystrokes++;
      } else if (event.type === 'scroll') {
        buckets[bucketIndex].scrolls++;
      }
    }
  });

  return buckets;
}

export default function InputEventsTimeline({
  events,
  durationMs,
  currentTimeMs,
  onSeek,
  height = 60
}: InputEventsTimelineProps): JSX.Element {
  // Generate buckets for density visualization
  const buckets = useMemo(() => generateBuckets(events, durationMs), [events, durationMs]);

  // Find max for scaling
  const maxTotal = useMemo(() => {
    return Math.max(...buckets.map(b => b.total), 1);
  }, [buckets]);

  // Calculate progress percentage
  const progress = durationMs > 0 ? (currentTimeMs / durationMs) * 100 : 0;

  // Handle click to seek
  const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const percent = (e.clientX - rect.left) / rect.width;
    onSeek(percent * durationMs);
  };

  // Get significant events for markers (clicks and key combos)
  const markers = useMemo(() => {
    return events
      .filter(e => e.type === 'click' || (e.type === 'keydown' && e.key && e.key.length > 1))
      .slice(0, 100) // Limit markers
      .map(event => ({
        position: durationMs > 0 ? (event.timestamp / durationMs) * 100 : 0,
        type: event.type,
        label: event.type === 'click' ? '●' : event.key || '⌨'
      }));
  }, [events, durationMs]);

  // Event counts by type
  const eventCounts = useMemo(() => {
    const counts = { clicks: 0, keystrokes: 0, scrolls: 0 };
    events.forEach(e => {
      if (e.type === 'click') counts.clicks++;
      else if (e.type === 'keydown') counts.keystrokes++;
      else if (e.type === 'scroll') counts.scrolls++;
    });
    return counts;
  }, [events]);

  return (
    <div className="input-events-timeline" style={{ height }}>
      {/* Event type legend */}
      <div className="timeline-legend">
        <span className="legend-item clicks">
          <span className="legend-dot" />
          Clicks: {eventCounts.clicks}
        </span>
        <span className="legend-item keystrokes">
          <span className="legend-dot" />
          Keys: {eventCounts.keystrokes}
        </span>
        <span className="legend-item scrolls">
          <span className="legend-dot" />
          Scrolls: {eventCounts.scrolls}
        </span>
      </div>

      {/* Density visualization */}
      <div className="timeline-density" onClick={handleClick}>
        {buckets.map((bucket, index) => (
          <div
            key={index}
            className="density-bar"
            style={{
              width: `${100 / buckets.length}%`,
              height: `${(bucket.total / maxTotal) * 100}%`
            }}
            title={`${bucket.clicks} clicks, ${bucket.keystrokes} keys, ${bucket.scrolls} scrolls`}
          >
            {bucket.clicks > 0 && (
              <div
                className="bar-segment clicks"
                style={{ height: `${(bucket.clicks / bucket.total) * 100}%` }}
              />
            )}
            {bucket.keystrokes > 0 && (
              <div
                className="bar-segment keystrokes"
                style={{ height: `${(bucket.keystrokes / bucket.total) * 100}%` }}
              />
            )}
            {bucket.scrolls > 0 && (
              <div
                className="bar-segment scrolls"
                style={{ height: `${(bucket.scrolls / bucket.total) * 100}%` }}
              />
            )}
          </div>
        ))}

        {/* Progress overlay */}
        <div
          className="timeline-progress"
          style={{ width: `${progress}%` }}
        />

        {/* Playhead */}
        <div
          className="timeline-playhead"
          style={{ left: `${progress}%` }}
        />

        {/* Event markers */}
        <div className="event-markers">
          {markers.map((marker, index) => (
            <div
              key={index}
              className={`event-marker ${marker.type}`}
              style={{ left: `${marker.position}%` }}
              title={marker.label}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
