/**
 * CCaaS Repositories
 *
 * Database access for call events, active window logs, and recording-call associations.
 */

import { ipcMain } from 'electron';
import { getDatabase } from '../database';

// =============================================================================
// Types
// =============================================================================

export interface CallEvent {
  id: string;
  callId: string;
  eventType: string;
  agentId?: string;
  customerId?: string;
  queueName?: string;
  direction?: 'inbound' | 'outbound';
  disposition?: string;
  durationSeconds?: number;
  timestamp: number;
  payload?: Record<string, unknown>;
  createdAt: number;
}

export interface ActiveWindowLog {
  id: string;
  recordingId: string;
  timestampMs: number;
  windowTitle?: string;
  processName?: string;
  url?: string;
}

export interface RecordingCallMetadata {
  callId?: string;
  agentId?: string;
  queueName?: string;
  callDirection?: 'inbound' | 'outbound';
}

// =============================================================================
// CallEventRepository
// =============================================================================

export class CallEventRepository {
  /**
   * Log a new call event
   */
  logEvent(event: Omit<CallEvent, 'id' | 'createdAt'>): CallEvent {
    const db = getDatabase();
    const id = `evt-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const createdAt = Date.now();

    const stmt = db.prepare(`
      INSERT INTO call_events (
        id, call_id, event_type, agent_id, customer_id, queue_name,
        direction, disposition, duration_seconds, timestamp, payload, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      id,
      event.callId,
      event.eventType,
      event.agentId || null,
      event.customerId || null,
      event.queueName || null,
      event.direction || null,
      event.disposition || null,
      event.durationSeconds || null,
      event.timestamp,
      event.payload ? JSON.stringify(event.payload) : null,
      createdAt
    );

    return { ...event, id, createdAt };
  }

  /**
   * Get all events for a specific call
   */
  getEventsForCall(callId: string): CallEvent[] {
    const db = getDatabase();
    const stmt = db.prepare(`
      SELECT * FROM call_events
      WHERE call_id = ?
      ORDER BY timestamp ASC
    `);

    const rows = stmt.all(callId) as Array<{
      id: string;
      call_id: string;
      event_type: string;
      agent_id: string | null;
      customer_id: string | null;
      queue_name: string | null;
      direction: string | null;
      disposition: string | null;
      duration_seconds: number | null;
      timestamp: number;
      payload: string | null;
      created_at: number;
    }>;

    return rows.map(this.mapRowToEvent);
  }

  /**
   * Get recent call events
   */
  getRecentEvents(limit = 50): CallEvent[] {
    const db = getDatabase();
    const stmt = db.prepare(`
      SELECT * FROM call_events
      ORDER BY timestamp DESC
      LIMIT ?
    `);

    const rows = stmt.all(limit) as Array<{
      id: string;
      call_id: string;
      event_type: string;
      agent_id: string | null;
      customer_id: string | null;
      queue_name: string | null;
      direction: string | null;
      disposition: string | null;
      duration_seconds: number | null;
      timestamp: number;
      payload: string | null;
      created_at: number;
    }>;

    return rows.map(this.mapRowToEvent);
  }

  /**
   * Get events by agent
   */
  getEventsByAgent(agentId: string, limit = 100): CallEvent[] {
    const db = getDatabase();
    const stmt = db.prepare(`
      SELECT * FROM call_events
      WHERE agent_id = ?
      ORDER BY timestamp DESC
      LIMIT ?
    `);

    const rows = stmt.all(agentId, limit) as Array<{
      id: string;
      call_id: string;
      event_type: string;
      agent_id: string | null;
      customer_id: string | null;
      queue_name: string | null;
      direction: string | null;
      disposition: string | null;
      duration_seconds: number | null;
      timestamp: number;
      payload: string | null;
      created_at: number;
    }>;

    return rows.map(this.mapRowToEvent);
  }

  /**
   * Get events in date range
   */
  getEventsInRange(startTime: number, endTime: number): CallEvent[] {
    const db = getDatabase();
    const stmt = db.prepare(`
      SELECT * FROM call_events
      WHERE timestamp >= ? AND timestamp <= ?
      ORDER BY timestamp DESC
    `);

    const rows = stmt.all(startTime, endTime) as Array<{
      id: string;
      call_id: string;
      event_type: string;
      agent_id: string | null;
      customer_id: string | null;
      queue_name: string | null;
      direction: string | null;
      disposition: string | null;
      duration_seconds: number | null;
      timestamp: number;
      payload: string | null;
      created_at: number;
    }>;

    return rows.map(this.mapRowToEvent);
  }

  /**
   * Delete events for a call
   */
  deleteEventsForCall(callId: string): number {
    const db = getDatabase();
    const stmt = db.prepare('DELETE FROM call_events WHERE call_id = ?');
    const result = stmt.run(callId);
    return result.changes;
  }

  /**
   * Get unique call IDs
   */
  getUniqueCallIds(limit = 100): string[] {
    const db = getDatabase();
    const stmt = db.prepare(`
      SELECT DISTINCT call_id FROM call_events
      ORDER BY timestamp DESC
      LIMIT ?
    `);
    const rows = stmt.all(limit) as Array<{ call_id: string }>;
    return rows.map((r) => r.call_id);
  }

  private mapRowToEvent(row: {
    id: string;
    call_id: string;
    event_type: string;
    agent_id: string | null;
    customer_id: string | null;
    queue_name: string | null;
    direction: string | null;
    disposition: string | null;
    duration_seconds: number | null;
    timestamp: number;
    payload: string | null;
    created_at: number;
  }): CallEvent {
    return {
      id: row.id,
      callId: row.call_id,
      eventType: row.event_type,
      agentId: row.agent_id || undefined,
      customerId: row.customer_id || undefined,
      queueName: row.queue_name || undefined,
      direction: row.direction as 'inbound' | 'outbound' | undefined,
      disposition: row.disposition || undefined,
      durationSeconds: row.duration_seconds || undefined,
      timestamp: row.timestamp,
      payload: row.payload ? JSON.parse(row.payload) : undefined,
      createdAt: row.created_at
    };
  }
}

// =============================================================================
// ActiveWindowRepository
// =============================================================================

export class ActiveWindowRepository {
  /**
   * Log a window activity entry
   */
  logWindow(entry: Omit<ActiveWindowLog, 'id'>): ActiveWindowLog {
    const db = getDatabase();
    const id = `win-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    const stmt = db.prepare(`
      INSERT INTO active_window_log (
        id, recording_id, timestamp_ms, window_title, process_name, url
      ) VALUES (?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      id,
      entry.recordingId,
      entry.timestampMs,
      entry.windowTitle || null,
      entry.processName || null,
      entry.url || null
    );

    return { ...entry, id };
  }

  /**
   * Batch log multiple window entries
   */
  logWindowBatch(entries: Array<Omit<ActiveWindowLog, 'id'>>): number {
    const db = getDatabase();
    const stmt = db.prepare(`
      INSERT INTO active_window_log (
        id, recording_id, timestamp_ms, window_title, process_name, url
      ) VALUES (?, ?, ?, ?, ?, ?)
    `);

    const insertMany = db.transaction((items: Array<Omit<ActiveWindowLog, 'id'>>) => {
      for (const entry of items) {
        const id = `win-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        stmt.run(
          id,
          entry.recordingId,
          entry.timestampMs,
          entry.windowTitle || null,
          entry.processName || null,
          entry.url || null
        );
      }
      return items.length;
    });

    return insertMany(entries);
  }

  /**
   * Get window logs for a recording
   */
  getWindowsForRecording(recordingId: string): ActiveWindowLog[] {
    const db = getDatabase();
    const stmt = db.prepare(`
      SELECT * FROM active_window_log
      WHERE recording_id = ?
      ORDER BY timestamp_ms ASC
    `);

    const rows = stmt.all(recordingId) as Array<{
      id: string;
      recording_id: string;
      timestamp_ms: number;
      window_title: string | null;
      process_name: string | null;
      url: string | null;
    }>;

    return rows.map((row) => ({
      id: row.id,
      recordingId: row.recording_id,
      timestampMs: row.timestamp_ms,
      windowTitle: row.window_title || undefined,
      processName: row.process_name || undefined,
      url: row.url || undefined
    }));
  }

  /**
   * Get window at specific timestamp
   */
  getWindowAtTimestamp(recordingId: string, timestampMs: number): ActiveWindowLog | null {
    const db = getDatabase();
    const stmt = db.prepare(`
      SELECT * FROM active_window_log
      WHERE recording_id = ? AND timestamp_ms <= ?
      ORDER BY timestamp_ms DESC
      LIMIT 1
    `);

    const row = stmt.get(recordingId, timestampMs) as {
      id: string;
      recording_id: string;
      timestamp_ms: number;
      window_title: string | null;
      process_name: string | null;
      url: string | null;
    } | undefined;

    if (!row) return null;

    return {
      id: row.id,
      recordingId: row.recording_id,
      timestampMs: row.timestamp_ms,
      windowTitle: row.window_title || undefined,
      processName: row.process_name || undefined,
      url: row.url || undefined
    };
  }

  /**
   * Get unique processes for a recording
   */
  getUniqueProcesses(recordingId: string): string[] {
    const db = getDatabase();
    const stmt = db.prepare(`
      SELECT DISTINCT process_name FROM active_window_log
      WHERE recording_id = ? AND process_name IS NOT NULL
      ORDER BY process_name
    `);
    const rows = stmt.all(recordingId) as Array<{ process_name: string }>;
    return rows.map((r) => r.process_name);
  }

  /**
   * Get window activity summary (time spent per app)
   */
  getActivitySummary(recordingId: string): Array<{
    processName: string;
    totalTimeMs: number;
    percentage: number;
  }> {
    const windows = this.getWindowsForRecording(recordingId);
    if (windows.length < 2) return [];

    const timeByProcess: Record<string, number> = {};
    let totalTime = 0;

    for (let i = 0; i < windows.length - 1; i++) {
      const current = windows[i];
      const next = windows[i + 1];
      const duration = next.timestampMs - current.timestampMs;
      const process = current.processName || 'Unknown';

      timeByProcess[process] = (timeByProcess[process] || 0) + duration;
      totalTime += duration;
    }

    return Object.entries(timeByProcess)
      .map(([processName, totalTimeMs]) => ({
        processName,
        totalTimeMs,
        percentage: totalTime > 0 ? (totalTimeMs / totalTime) * 100 : 0
      }))
      .sort((a, b) => b.totalTimeMs - a.totalTimeMs);
  }

  /**
   * Delete window logs for a recording
   */
  deleteWindowsForRecording(recordingId: string): number {
    const db = getDatabase();
    const stmt = db.prepare('DELETE FROM active_window_log WHERE recording_id = ?');
    const result = stmt.run(recordingId);
    return result.changes;
  }
}

// =============================================================================
// Recording Call Metadata Updates
// =============================================================================

export class RecordingCallRepository {
  /**
   * Update recording with call metadata
   */
  updateCallMetadata(recordingId: string, metadata: RecordingCallMetadata): boolean {
    const db = getDatabase();
    const updates: string[] = [];
    const values: unknown[] = [];

    if (metadata.callId !== undefined) {
      updates.push('call_id = ?');
      values.push(metadata.callId);
    }
    if (metadata.agentId !== undefined) {
      updates.push('agent_id = ?');
      values.push(metadata.agentId);
    }
    if (metadata.queueName !== undefined) {
      updates.push('queue_name = ?');
      values.push(metadata.queueName);
    }
    if (metadata.callDirection !== undefined) {
      updates.push('call_direction = ?');
      values.push(metadata.callDirection);
    }

    if (updates.length === 0) return false;

    updates.push('updatedAt = ?');
    values.push(Date.now());
    values.push(recordingId);

    const stmt = db.prepare(`UPDATE recordings SET ${updates.join(', ')} WHERE id = ?`);
    const result = stmt.run(...values);
    return result.changes > 0;
  }

  /**
   * Get recording by call ID
   */
  getByCallId(callId: string): Array<{
    id: string;
    filename: string;
    callId: string;
    agentId?: string;
    queueName?: string;
    callDirection?: string;
    startTime: number;
    duration: number;
  }> {
    const db = getDatabase();
    const stmt = db.prepare(`
      SELECT id, filename, call_id, agent_id, queue_name, call_direction, startTime, duration
      FROM recordings
      WHERE call_id = ?
      ORDER BY startTime DESC
    `);

    const rows = stmt.all(callId) as Array<{
      id: string;
      filename: string;
      call_id: string;
      agent_id: string | null;
      queue_name: string | null;
      call_direction: string | null;
      startTime: number;
      duration: number;
    }>;

    return rows.map((row) => ({
      id: row.id,
      filename: row.filename,
      callId: row.call_id,
      agentId: row.agent_id || undefined,
      queueName: row.queue_name || undefined,
      callDirection: row.call_direction || undefined,
      startTime: row.startTime,
      duration: row.duration
    }));
  }

  /**
   * Get call metadata for a recording
   */
  getCallMetadata(recordingId: string): {
    recordingId: string;
    callId: string;
    agentId?: string;
    queueName?: string;
    callDirection?: string;
  } | null {
    const db = getDatabase();
    const stmt = db.prepare(`
      SELECT id, call_id, agent_id, queue_name, call_direction
      FROM recordings
      WHERE id = ? AND call_id IS NOT NULL
    `);

    const row = stmt.get(recordingId) as {
      id: string;
      call_id: string | null;
      agent_id: string | null;
      queue_name: string | null;
      call_direction: string | null;
    } | undefined;

    if (!row || !row.call_id) return null;

    return {
      recordingId: row.id,
      callId: row.call_id,
      agentId: row.agent_id || undefined,
      queueName: row.queue_name || undefined,
      callDirection: row.call_direction || undefined
    };
  }

  /**
   * Get recordings with call metadata
   */
  getRecordingsWithCalls(limit = 50): Array<{
    id: string;
    filename: string;
    callId?: string;
    agentId?: string;
    queueName?: string;
    callDirection?: string;
    startTime: number;
    duration: number;
  }> {
    const db = getDatabase();
    const stmt = db.prepare(`
      SELECT id, filename, call_id, agent_id, queue_name, call_direction, startTime, duration
      FROM recordings
      WHERE call_id IS NOT NULL
      ORDER BY startTime DESC
      LIMIT ?
    `);

    const rows = stmt.all(limit) as Array<{
      id: string;
      filename: string;
      call_id: string | null;
      agent_id: string | null;
      queue_name: string | null;
      call_direction: string | null;
      startTime: number;
      duration: number;
    }>;

    return rows.map((row) => ({
      id: row.id,
      filename: row.filename,
      callId: row.call_id || undefined,
      agentId: row.agent_id || undefined,
      queueName: row.queue_name || undefined,
      callDirection: row.call_direction || undefined,
      startTime: row.startTime,
      duration: row.duration
    }));
  }
}

// =============================================================================
// Singleton Instances
// =============================================================================

let callEventRepo: CallEventRepository | null = null;
let activeWindowRepo: ActiveWindowRepository | null = null;
let recordingCallRepo: RecordingCallRepository | null = null;

export function getCallEventRepository(): CallEventRepository {
  if (!callEventRepo) {
    callEventRepo = new CallEventRepository();
  }
  return callEventRepo;
}

export function getActiveWindowRepository(): ActiveWindowRepository {
  if (!activeWindowRepo) {
    activeWindowRepo = new ActiveWindowRepository();
  }
  return activeWindowRepo;
}

export function getRecordingCallRepository(): RecordingCallRepository {
  if (!recordingCallRepo) {
    recordingCallRepo = new RecordingCallRepository();
  }
  return recordingCallRepo;
}

// =============================================================================
// IPC Handlers
// =============================================================================

export function setupCCaaSRepositoryHandlers(): void {
  const callRepo = getCallEventRepository();
  const windowRepo = getActiveWindowRepository();
  const recordingCallRepo = getRecordingCallRepository();

  // Call Events
  ipcMain.handle('calls:getEvents', (_, callId: string) => {
    return callRepo.getEventsForCall(callId);
  });

  ipcMain.handle('calls:getRecent', (_, limit?: number) => {
    return callRepo.getRecentEvents(limit);
  });

  ipcMain.handle('calls:getEventsByAgent', (_, agentId: string, limit?: number) => {
    return callRepo.getEventsByAgent(agentId, limit);
  });

  ipcMain.handle('calls:getEventsInRange', (_, startTime: number, endTime: number) => {
    return callRepo.getEventsInRange(startTime, endTime);
  });

  ipcMain.handle('calls:getUniqueCallIds', (_, limit?: number) => {
    return callRepo.getUniqueCallIds(limit);
  });

  // Active Window Logs
  ipcMain.handle('tracking:getWindowLog', (_, recordingId: string) => {
    return windowRepo.getWindowsForRecording(recordingId);
  });

  ipcMain.handle('tracking:getWindowAtTimestamp', (_, recordingId: string, timestampMs: number) => {
    return windowRepo.getWindowAtTimestamp(recordingId, timestampMs);
  });

  ipcMain.handle('tracking:getUniqueProcesses', (_, recordingId: string) => {
    return windowRepo.getUniqueProcesses(recordingId);
  });

  ipcMain.handle('tracking:getActivitySummary', (_, recordingId: string) => {
    return windowRepo.getActivitySummary(recordingId);
  });

  // Recording-Call Association
  ipcMain.handle('recordings:getByCallId', (_, callId: string) => {
    return recordingCallRepo.getByCallId(callId);
  });

  ipcMain.handle('recordings:getCallMetadata', (_, recordingId: string) => {
    return recordingCallRepo.getCallMetadata(recordingId);
  });

  ipcMain.handle('recordings:updateCallMetadata', (_, recordingId: string, metadata: RecordingCallMetadata) => {
    return recordingCallRepo.updateCallMetadata(recordingId, metadata);
  });

  ipcMain.handle('recordings:getWithCalls', (_, limit?: number) => {
    return recordingCallRepo.getRecordingsWithCalls(limit);
  });

  console.log('[CCaaSRepositories] IPC handlers registered');
}
