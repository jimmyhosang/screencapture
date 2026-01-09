/**
 * Input Events Repository
 *
 * Database repository for storing and retrieving input events
 * associated with recordings.
 */

import { getDatabase } from '../database';
import type { InputEvent } from '../capture';

// =============================================================================
// Types
// =============================================================================

export interface StoredInputEvent {
  id: number;
  recordingId: string;
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
  modifiers?: {
    ctrl: boolean;
    alt: boolean;
    shift: boolean;
    meta: boolean;
  };
}

export interface InputEventSummary {
  recordingId: string;
  totalEvents: number;
  clickCount: number;
  keystrokeCount: number;
  scrollCount: number;
  mouseMoveCount: number;
  firstEventMs: number | null;
  lastEventMs: number | null;
  createdAt: number;
}

export interface InputEventFilter {
  recordingId?: string;
  eventTypes?: string[];
  startTime?: number;
  endTime?: number;
  limit?: number;
  offset?: number;
}

// =============================================================================
// InputEventsRepository Class
// =============================================================================

export class InputEventsRepository {
  /**
   * Save a batch of input events for a recording
   */
  saveEvents(recordingId: string, events: InputEvent[]): number {
    if (events.length === 0) return 0;

    const db = getDatabase();

    const insertStmt = db.prepare(`
      INSERT INTO input_events (
        recording_id, timestamp_ms, event_type, x, y, button,
        keycode, key_name, scroll_delta_x, scroll_delta_y,
        duration_ms, modifiers
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const insertMany = db.transaction((items: InputEvent[]) => {
      for (const event of items) {
        insertStmt.run(
          recordingId,
          event.timestamp,
          event.type,
          event.x ?? null,
          event.y ?? null,
          event.button ?? null,
          event.keycode ?? null,
          event.key ?? null,
          event.scrollDelta?.x ?? null,
          event.scrollDelta?.y ?? null,
          event.duration ?? null,
          event.modifiers ? JSON.stringify(event.modifiers) : null
        );
      }
      return items.length;
    });

    const count = insertMany(events);

    // Update summary
    this.updateSummary(recordingId);

    // Update recordings table
    db.prepare(`
      UPDATE recordings
      SET input_event_count = ?, has_input_tracking = 1
      WHERE id = ?
    `).run(count, recordingId);

    console.log(`[InputEventsRepo] Saved ${count} events for recording ${recordingId}`);
    return count;
  }

  /**
   * Get events for a recording
   */
  getEventsForRecording(
    recordingId: string,
    options: { limit?: number; offset?: number; types?: string[] } = {}
  ): StoredInputEvent[] {
    const db = getDatabase();
    const { limit = 10000, offset = 0, types } = options;

    let query = `
      SELECT id, recording_id, timestamp_ms, event_type, x, y, button,
             keycode, key_name, scroll_delta_x, scroll_delta_y,
             duration_ms, modifiers
      FROM input_events
      WHERE recording_id = ?
    `;

    const params: (string | number)[] = [recordingId];

    if (types && types.length > 0) {
      query += ` AND event_type IN (${types.map(() => '?').join(', ')})`;
      params.push(...types);
    }

    query += ` ORDER BY timestamp_ms ASC LIMIT ? OFFSET ?`;
    params.push(limit, offset);

    const rows = db.prepare(query).all(...params) as Array<{
      id: number;
      recording_id: string;
      timestamp_ms: number;
      event_type: string;
      x: number | null;
      y: number | null;
      button: number | null;
      keycode: number | null;
      key_name: string | null;
      scroll_delta_x: number | null;
      scroll_delta_y: number | null;
      duration_ms: number | null;
      modifiers: string | null;
    }>;

    return rows.map((row) => ({
      id: row.id,
      recordingId: row.recording_id,
      timestampMs: row.timestamp_ms,
      eventType: row.event_type,
      x: row.x ?? undefined,
      y: row.y ?? undefined,
      button: row.button ?? undefined,
      keycode: row.keycode ?? undefined,
      keyName: row.key_name ?? undefined,
      scrollDeltaX: row.scroll_delta_x ?? undefined,
      scrollDeltaY: row.scroll_delta_y ?? undefined,
      durationMs: row.duration_ms ?? undefined,
      modifiers: row.modifiers ? JSON.parse(row.modifiers) : undefined
    }));
  }

  /**
   * Get events within a time range
   */
  getEventsInTimeRange(
    recordingId: string,
    startMs: number,
    endMs: number
  ): StoredInputEvent[] {
    const db = getDatabase();

    const rows = db.prepare(`
      SELECT id, recording_id, timestamp_ms, event_type, x, y, button,
             keycode, key_name, scroll_delta_x, scroll_delta_y,
             duration_ms, modifiers
      FROM input_events
      WHERE recording_id = ? AND timestamp_ms >= ? AND timestamp_ms <= ?
      ORDER BY timestamp_ms ASC
    `).all(recordingId, startMs, endMs) as Array<{
      id: number;
      recording_id: string;
      timestamp_ms: number;
      event_type: string;
      x: number | null;
      y: number | null;
      button: number | null;
      keycode: number | null;
      key_name: string | null;
      scroll_delta_x: number | null;
      scroll_delta_y: number | null;
      duration_ms: number | null;
      modifiers: string | null;
    }>;

    return rows.map((row) => ({
      id: row.id,
      recordingId: row.recording_id,
      timestampMs: row.timestamp_ms,
      eventType: row.event_type,
      x: row.x ?? undefined,
      y: row.y ?? undefined,
      button: row.button ?? undefined,
      keycode: row.keycode ?? undefined,
      keyName: row.key_name ?? undefined,
      scrollDeltaX: row.scroll_delta_x ?? undefined,
      scrollDeltaY: row.scroll_delta_y ?? undefined,
      durationMs: row.duration_ms ?? undefined,
      modifiers: row.modifiers ? JSON.parse(row.modifiers) : undefined
    }));
  }

  /**
   * Get event count for a recording
   */
  getEventCount(recordingId: string): number {
    const db = getDatabase();
    const row = db.prepare(`
      SELECT COUNT(*) as count FROM input_events WHERE recording_id = ?
    `).get(recordingId) as { count: number };
    return row.count;
  }

  /**
   * Get event summary for a recording
   */
  getSummary(recordingId: string): InputEventSummary | null {
    const db = getDatabase();

    const row = db.prepare(`
      SELECT * FROM input_event_summary WHERE recording_id = ?
    `).get(recordingId) as {
      recording_id: string;
      total_events: number;
      click_count: number;
      keystroke_count: number;
      scroll_count: number;
      mouse_move_count: number;
      first_event_ms: number | null;
      last_event_ms: number | null;
      created_at: number;
    } | undefined;

    if (!row) return null;

    return {
      recordingId: row.recording_id,
      totalEvents: row.total_events,
      clickCount: row.click_count,
      keystrokeCount: row.keystroke_count,
      scrollCount: row.scroll_count,
      mouseMoveCount: row.mouse_move_count,
      firstEventMs: row.first_event_ms,
      lastEventMs: row.last_event_ms,
      createdAt: row.created_at
    };
  }

  /**
   * Update or create event summary for a recording
   */
  updateSummary(recordingId: string): void {
    const db = getDatabase();

    // Calculate summary from events
    const stats = db.prepare(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN event_type = 'click' THEN 1 ELSE 0 END) as clicks,
        SUM(CASE WHEN event_type = 'keydown' THEN 1 ELSE 0 END) as keystrokes,
        SUM(CASE WHEN event_type = 'scroll' THEN 1 ELSE 0 END) as scrolls,
        SUM(CASE WHEN event_type = 'mousemove' THEN 1 ELSE 0 END) as mousemoves,
        MIN(timestamp_ms) as first_ms,
        MAX(timestamp_ms) as last_ms
      FROM input_events
      WHERE recording_id = ?
    `).get(recordingId) as {
      total: number;
      clicks: number;
      keystrokes: number;
      scrolls: number;
      mousemoves: number;
      first_ms: number | null;
      last_ms: number | null;
    };

    db.prepare(`
      INSERT OR REPLACE INTO input_event_summary (
        recording_id, total_events, click_count, keystroke_count,
        scroll_count, mouse_move_count, first_event_ms, last_event_ms,
        created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      recordingId,
      stats.total,
      stats.clicks,
      stats.keystrokes,
      stats.scrolls,
      stats.mousemoves,
      stats.first_ms,
      stats.last_ms,
      Date.now()
    );
  }

  /**
   * Delete events for a recording
   */
  deleteEventsForRecording(recordingId: string): number {
    const db = getDatabase();

    // Delete events
    const result = db.prepare(`
      DELETE FROM input_events WHERE recording_id = ?
    `).run(recordingId);

    // Delete summary
    db.prepare(`
      DELETE FROM input_event_summary WHERE recording_id = ?
    `).run(recordingId);

    return result.changes;
  }

  /**
   * Get recordings with input events
   */
  getRecordingsWithInputEvents(limit = 100): Array<{
    recordingId: string;
    eventCount: number;
    hasInputTracking: boolean;
  }> {
    const db = getDatabase();

    const rows = db.prepare(`
      SELECT id, input_event_count, has_input_tracking
      FROM recordings
      WHERE has_input_tracking = 1
      ORDER BY startTime DESC
      LIMIT ?
    `).all(limit) as Array<{
      id: string;
      input_event_count: number;
      has_input_tracking: number;
    }>;

    return rows.map((row) => ({
      recordingId: row.id,
      eventCount: row.input_event_count,
      hasInputTracking: row.has_input_tracking === 1
    }));
  }

  /**
   * Convert InputEvent[] to StoredInputEvent format for saving
   */
  convertFromInputEvents(events: InputEvent[]): Array<Omit<StoredInputEvent, 'id' | 'recordingId'>> {
    return events.map((event) => ({
      timestampMs: event.timestamp,
      eventType: event.type,
      x: event.x,
      y: event.y,
      button: event.button,
      keycode: event.keycode,
      keyName: event.key,
      scrollDeltaX: event.scrollDelta?.x,
      scrollDeltaY: event.scrollDelta?.y,
      durationMs: event.duration,
      modifiers: event.modifiers
    }));
  }

  /**
   * Convert StoredInputEvent to InputEvent format for playback
   */
  convertToInputEvents(events: StoredInputEvent[]): InputEvent[] {
    return events.map((event) => ({
      timestamp: event.timestampMs,
      type: event.eventType as InputEvent['type'],
      x: event.x,
      y: event.y,
      button: event.button,
      keycode: event.keycode,
      key: event.keyName,
      scrollDelta: event.scrollDeltaX !== undefined || event.scrollDeltaY !== undefined
        ? { x: event.scrollDeltaX || 0, y: event.scrollDeltaY || 0 }
        : undefined,
      duration: event.durationMs,
      modifiers: event.modifiers
    }));
  }
}

// =============================================================================
// Singleton and IPC Handlers
// =============================================================================

let repository: InputEventsRepository | null = null;

export function getInputEventsRepository(): InputEventsRepository {
  if (!repository) {
    repository = new InputEventsRepository();
  }
  return repository;
}

export function resetInputEventsRepository(): void {
  repository = null;
}

export function setupInputEventsHandlers(): void {
  const { ipcMain } = require('electron');
  const repo = getInputEventsRepository();

  ipcMain.handle('inputEvents:save', async (_, recordingId: string, events: InputEvent[]) => {
    return repo.saveEvents(recordingId, events);
  });

  ipcMain.handle('inputEvents:get', async (_, recordingId: string, options?: {
    limit?: number;
    offset?: number;
    types?: string[];
  }) => {
    return repo.getEventsForRecording(recordingId, options);
  });

  ipcMain.handle('inputEvents:getInRange', async (_, recordingId: string, startMs: number, endMs: number) => {
    return repo.getEventsInTimeRange(recordingId, startMs, endMs);
  });

  ipcMain.handle('inputEvents:getSummary', async (_, recordingId: string) => {
    return repo.getSummary(recordingId);
  });

  ipcMain.handle('inputEvents:getCount', async (_, recordingId: string) => {
    return repo.getEventCount(recordingId);
  });

  ipcMain.handle('inputEvents:delete', async (_, recordingId: string) => {
    return repo.deleteEventsForRecording(recordingId);
  });

  console.log('[InputEventsRepo] IPC handlers registered');
}
