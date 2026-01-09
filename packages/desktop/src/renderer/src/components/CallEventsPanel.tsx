/**
 * Call Events Panel Component
 *
 * Displays CCaaS call events associated with a recording.
 * Shows timeline of events like CALL_STARTED, HOLD, TRANSFER, etc.
 */

import { useState, useEffect } from 'react';
import './CallEventsPanel.css';

interface CallEvent {
  id: string;
  eventType: string;
  eventTimestamp: number;
  callId: string;
  agentId?: string;
  queueName?: string;
  direction?: string;
  callerNumber?: string;
  calledNumber?: string;
  metadata?: Record<string, unknown>;
}

interface RecordingCallMetadata {
  recordingId: string;
  callId: string;
  agentId?: string;
  queueName?: string;
  callDirection?: string;
}

interface CallEventsPanelProps {
  recordingId: string;
  onSeek?: (timeMs: number) => void;
  recordingStartTime?: number;
}

// Event type display configuration
const EVENT_CONFIG: Record<string, { icon: string; label: string; color: string }> = {
  CALL_STARTED: { icon: '📞', label: 'Call Started', color: '#10b981' },
  CALL_ENDED: { icon: '📴', label: 'Call Ended', color: '#ef4444' },
  CALL_HOLD: { icon: '⏸️', label: 'Put on Hold', color: '#f59e0b' },
  CALL_RESUME: { icon: '▶️', label: 'Resumed', color: '#10b981' },
  CALL_TRANSFER: { icon: '↗️', label: 'Transferred', color: '#6366f1' },
  CALL_CONFERENCE: { icon: '👥', label: 'Conference', color: '#8b5cf6' },
  CALL_MUTE: { icon: '🔇', label: 'Muted', color: '#6b7280' },
  CALL_UNMUTE: { icon: '🔊', label: 'Unmuted', color: '#10b981' },
  AGENT_ASSIGNED: { icon: '👤', label: 'Agent Assigned', color: '#3b82f6' },
  QUEUE_ENTERED: { icon: '📥', label: 'Entered Queue', color: '#0ea5e9' },
  QUEUE_LEFT: { icon: '📤', label: 'Left Queue', color: '#14b8a6' },
  WRAP_UP_STARTED: { icon: '📝', label: 'Wrap-up Started', color: '#a855f7' },
  WRAP_UP_ENDED: { icon: '✅', label: 'Wrap-up Ended', color: '#22c55e' }
};

function getEventConfig(eventType: string) {
  return (
    EVENT_CONFIG[eventType] || {
      icon: '📋',
      label: eventType.replace(/_/g, ' ').toLowerCase(),
      color: '#6b7280'
    }
  );
}

export default function CallEventsPanel({
  recordingId,
  onSeek,
  recordingStartTime
}: CallEventsPanelProps): JSX.Element {
  const [callMetadata, setCallMetadata] = useState<RecordingCallMetadata | null>(null);
  const [events, setEvents] = useState<CallEvent[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Load call metadata and events
  useEffect(() => {
    loadCallData();
  }, [recordingId]);

  const loadCallData = async () => {
    setIsLoading(true);
    setError(null);

    try {
      // Get call metadata for this recording
      const metadata = await window.api.recordingCalls.getByRecordingId(recordingId);
      setCallMetadata(metadata);

      if (metadata?.callId) {
        // Get events for this call
        const callEvents = await window.api.calls.getEvents(metadata.callId);
        setEvents(callEvents);
      } else {
        setEvents([]);
      }
    } catch (err) {
      console.error('Failed to load call data:', err);
      setError(err instanceof Error ? err.message : 'Failed to load call data');
    } finally {
      setIsLoading(false);
    }
  };

  const formatTimestamp = (timestamp: number): string => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  };

  const formatRelativeTime = (eventTimestamp: number): string => {
    if (!recordingStartTime) return '';

    const diffMs = eventTimestamp - recordingStartTime;
    if (diffMs < 0) return 'Before recording';

    const totalSeconds = Math.floor(diffMs / 1000);
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `+${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const handleEventClick = (event: CallEvent) => {
    if (onSeek && recordingStartTime) {
      const offsetMs = event.eventTimestamp - recordingStartTime;
      if (offsetMs >= 0) {
        onSeek(offsetMs);
      }
    }
  };

  if (isLoading) {
    return (
      <div className="call-events-panel loading">
        <div className="loading-spinner" />
        <span>Loading call data...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="call-events-panel error">
        <div className="error-icon">⚠️</div>
        <span>{error}</span>
        <button className="btn btn-secondary" onClick={loadCallData}>
          Retry
        </button>
      </div>
    );
  }

  if (!callMetadata) {
    return (
      <div className="call-events-panel empty">
        <div className="empty-icon">📞</div>
        <span>No call associated with this recording</span>
        <p className="empty-hint">
          Recordings triggered by CCaaS webhooks will show call events here.
        </p>
      </div>
    );
  }

  return (
    <div className="call-events-panel">
      {/* Call Info Header */}
      <div className="call-info-header">
        <div className="call-info-row">
          <span className="info-label">Call ID</span>
          <span className="info-value mono">{callMetadata.callId}</span>
        </div>
        {callMetadata.agentId && (
          <div className="call-info-row">
            <span className="info-label">Agent</span>
            <span className="info-value">{callMetadata.agentId}</span>
          </div>
        )}
        {callMetadata.queueName && (
          <div className="call-info-row">
            <span className="info-label">Queue</span>
            <span className="info-value">{callMetadata.queueName}</span>
          </div>
        )}
        {callMetadata.callDirection && (
          <div className="call-info-row">
            <span className="info-label">Direction</span>
            <span className={`info-value direction ${callMetadata.callDirection}`}>
              {callMetadata.callDirection === 'inbound' ? '📥 Inbound' : '📤 Outbound'}
            </span>
          </div>
        )}
      </div>

      {/* Events Timeline */}
      <div className="events-section">
        <h4 className="section-title">Call Events ({events.length})</h4>

        {events.length === 0 ? (
          <div className="no-events">
            <span>No events recorded for this call</span>
          </div>
        ) : (
          <div className="events-timeline">
            {events.map((event, index) => {
              const config = getEventConfig(event.eventType);
              const isFirst = index === 0;
              const isLast = index === events.length - 1;

              return (
                <div
                  key={event.id}
                  className={`event-item ${isFirst ? 'first' : ''} ${isLast ? 'last' : ''}`}
                  onClick={() => handleEventClick(event)}
                  style={{ '--event-color': config.color } as React.CSSProperties}
                >
                  <div className="event-connector">
                    <div className="connector-line top" />
                    <div className="connector-dot">{config.icon}</div>
                    <div className="connector-line bottom" />
                  </div>

                  <div className="event-content">
                    <div className="event-header">
                      <span className="event-label">{config.label}</span>
                      <span className="event-time">
                        {formatTimestamp(event.eventTimestamp)}
                        {recordingStartTime && (
                          <span className="relative-time">
                            {formatRelativeTime(event.eventTimestamp)}
                          </span>
                        )}
                      </span>
                    </div>

                    {/* Event-specific details */}
                    {event.callerNumber && (
                      <div className="event-detail">
                        From: {event.callerNumber}
                      </div>
                    )}
                    {event.calledNumber && (
                      <div className="event-detail">
                        To: {event.calledNumber}
                      </div>
                    )}
                    {event.queueName && event.eventType.includes('QUEUE') && (
                      <div className="event-detail">Queue: {event.queueName}</div>
                    )}
                    {event.metadata && Object.keys(event.metadata).length > 0 && (
                      <div className="event-metadata">
                        {Object.entries(event.metadata).map(([key, value]) => (
                          <span key={key} className="metadata-tag">
                            {key}: {String(value)}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
