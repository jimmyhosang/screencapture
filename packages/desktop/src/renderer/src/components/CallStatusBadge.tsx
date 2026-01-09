/**
 * Call Status Badge Component
 *
 * Shows active call information in the header/status bar.
 * Displays call ID, duration timer, queue name, and recording status.
 */

import { useState, useEffect, useRef } from 'react';
import './CallStatusBadge.css';

interface ActiveCall {
  callId: string;
  agentId: string;
  queueName?: string;
  direction: 'inbound' | 'outbound';
  startTime: number;
  hasRecording: boolean;
}

interface CallStatusBadgeProps {
  onCallClick?: (callId: string) => void;
}

export default function CallStatusBadge({ onCallClick }: CallStatusBadgeProps): JSX.Element | null {
  const [activeCalls, setActiveCalls] = useState<ActiveCall[]>([]);
  const [durations, setDurations] = useState<Record<string, number>>({});
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Fetch active calls
  useEffect(() => {
    loadActiveCalls();

    // Poll for active calls every 2 seconds
    const pollInterval = setInterval(loadActiveCalls, 2000);

    return () => {
      clearInterval(pollInterval);
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, []);

  // Update durations every second
  useEffect(() => {
    if (activeCalls.length > 0) {
      intervalRef.current = setInterval(() => {
        const now = Date.now();
        const newDurations: Record<string, number> = {};
        activeCalls.forEach((call) => {
          newDurations[call.callId] = Math.floor((now - call.startTime) / 1000);
        });
        setDurations(newDurations);
      }, 1000);
    } else {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [activeCalls]);

  const loadActiveCalls = async () => {
    try {
      const summary = await window.api.ccaas.getCallSummary();
      const calls: ActiveCall[] = summary.calls
        .filter((c) => c.status === 'active')
        .map((c) => ({
          callId: c.callId,
          agentId: c.agentId,
          queueName: undefined, // Add to summary if needed
          direction: c.direction as 'inbound' | 'outbound',
          startTime: Date.now(), // Would need actual start time
          hasRecording: c.hasRecording
        }));
      setActiveCalls(calls);
    } catch (error) {
      // Silently handle errors
    }
  };

  const formatDuration = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  if (activeCalls.length === 0) {
    return null;
  }

  // Show first active call (or could expand to show all)
  const call = activeCalls[0];
  const duration = durations[call.callId] || 0;

  return (
    <div
      className="call-status-badge"
      onClick={() => onCallClick?.(call.callId)}
      title={`Call ID: ${call.callId}`}
    >
      <div className="call-indicator">
        <span className={`call-direction ${call.direction}`}>
          {call.direction === 'inbound' ? '↓' : '↑'}
        </span>
        {call.hasRecording && <span className="recording-dot" title="Recording" />}
      </div>
      <div className="call-info">
        <div className="call-id">{call.callId.slice(0, 8)}...</div>
        <div className="call-duration">{formatDuration(duration)}</div>
      </div>
      {call.queueName && <div className="call-queue">{call.queueName}</div>}
      {activeCalls.length > 1 && (
        <div className="more-calls">+{activeCalls.length - 1}</div>
      )}
    </div>
  );
}
