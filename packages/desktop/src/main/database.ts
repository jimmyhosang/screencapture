import Database from 'better-sqlite3';
import { app } from 'electron';
import { join } from 'path';
import { existsSync, mkdirSync } from 'fs';

let db: Database.Database | null = null;

// Schema version for migrations
const SCHEMA_VERSION = 3;

export function initDatabase(): void {
  const userDataPath = app.getPath('userData');

  // Ensure directory exists
  if (!existsSync(userDataPath)) {
    mkdirSync(userDataPath, { recursive: true });
  }

  const dbPath = join(userDataPath, 'screencapture.db');
  db = new Database(dbPath);

  // Enable WAL mode for better performance
  db.pragma('journal_mode = WAL');

  // Check and run migrations
  runMigrations();
}

function runMigrations(): void {
  if (!db) return;

  // Get current schema version
  db.exec(`CREATE TABLE IF NOT EXISTS schema_version (version INTEGER)`);
  const versionRow = db.prepare('SELECT version FROM schema_version LIMIT 1').get() as { version: number } | undefined;
  const currentVersion = versionRow?.version || 0;

  if (currentVersion < 1) {
    // Initial schema (v1)
    db.exec(`
      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        timestamp INTEGER NOT NULL,
        duration INTEGER NOT NULL,
        eventCount INTEGER NOT NULL,
        events TEXT NOT NULL,
        privacyConfig TEXT
      );

      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS recordings (
        id TEXT PRIMARY KEY,
        filename TEXT NOT NULL,
        sourceType TEXT NOT NULL,
        sourceName TEXT NOT NULL,
        duration INTEGER NOT NULL,
        startTime INTEGER NOT NULL,
        resolution TEXT NOT NULL,
        fps INTEGER NOT NULL,
        fileSize INTEGER NOT NULL,
        filePath TEXT NOT NULL,
        thumbnailPath TEXT,
        redactionConfig TEXT,
        status TEXT NOT NULL DEFAULT 'ready',
        createdAt INTEGER NOT NULL,
        updatedAt INTEGER NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_sessions_timestamp ON sessions(timestamp DESC);
      CREATE INDEX IF NOT EXISTS idx_recordings_startTime ON recordings(startTime DESC);
      CREATE INDEX IF NOT EXISTS idx_recordings_status ON recordings(status);
    `);
  }

  if (currentVersion < 2) {
    // CCaaS and window tracking schema (v2)
    db.exec(`
      -- Add CCaaS columns to recordings table
      ALTER TABLE recordings ADD COLUMN call_id TEXT;
      ALTER TABLE recordings ADD COLUMN agent_id TEXT;
      ALTER TABLE recordings ADD COLUMN queue_name TEXT;
      ALTER TABLE recordings ADD COLUMN call_direction TEXT;
    `);

    db.exec(`
      -- Call events table for CCaaS webhook events
      CREATE TABLE IF NOT EXISTS call_events (
        id TEXT PRIMARY KEY,
        call_id TEXT NOT NULL,
        event_type TEXT NOT NULL,
        agent_id TEXT,
        customer_id TEXT,
        queue_name TEXT,
        direction TEXT,
        disposition TEXT,
        duration_seconds INTEGER,
        timestamp INTEGER NOT NULL,
        payload TEXT,
        created_at INTEGER DEFAULT (unixepoch())
      );

      CREATE INDEX IF NOT EXISTS idx_call_events_call_id ON call_events(call_id);
      CREATE INDEX IF NOT EXISTS idx_call_events_timestamp ON call_events(timestamp DESC);
      CREATE INDEX IF NOT EXISTS idx_call_events_agent_id ON call_events(agent_id);

      -- Active window log for tracking app usage during recordings
      CREATE TABLE IF NOT EXISTS active_window_log (
        id TEXT PRIMARY KEY,
        recording_id TEXT NOT NULL,
        timestamp_ms INTEGER NOT NULL,
        window_title TEXT,
        process_name TEXT,
        url TEXT,
        FOREIGN KEY (recording_id) REFERENCES recordings(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_active_window_log_recording_id ON active_window_log(recording_id);
      CREATE INDEX IF NOT EXISTS idx_active_window_log_timestamp ON active_window_log(timestamp_ms);

      -- Add indexes for CCaaS columns
      CREATE INDEX IF NOT EXISTS idx_recordings_call_id ON recordings(call_id);
      CREATE INDEX IF NOT EXISTS idx_recordings_agent_id ON recordings(agent_id);
    `);
  }

  if (currentVersion < 3) {
    // Input events and session recordings schema (v3)
    db.exec(`
      -- Input events table for mouse, keyboard, scroll events
      CREATE TABLE IF NOT EXISTS input_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        recording_id TEXT NOT NULL,
        timestamp_ms INTEGER NOT NULL,
        event_type TEXT NOT NULL,
        x INTEGER,
        y INTEGER,
        button INTEGER,
        keycode INTEGER,
        key_name TEXT,
        scroll_delta_x INTEGER,
        scroll_delta_y INTEGER,
        duration_ms INTEGER,
        modifiers TEXT,
        FOREIGN KEY (recording_id) REFERENCES recordings(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_input_events_recording_id ON input_events(recording_id);
      CREATE INDEX IF NOT EXISTS idx_input_events_timestamp ON input_events(timestamp_ms);
      CREATE INDEX IF NOT EXISTS idx_input_events_type ON input_events(event_type);

      -- Session recordings table for unified recording sessions
      CREATE TABLE IF NOT EXISTS session_recordings (
        id TEXT PRIMARY KEY,
        recording_id TEXT,
        video_path TEXT NOT NULL,
        input_events_path TEXT,
        window_log_path TEXT,
        duration_ms INTEGER NOT NULL,
        file_size INTEGER NOT NULL,
        resolution_width INTEGER NOT NULL,
        resolution_height INTEGER NOT NULL,
        frame_rate INTEGER,
        quality TEXT,
        input_event_count INTEGER DEFAULT 0,
        window_change_count INTEGER DEFAULT 0,
        call_id TEXT,
        agent_id TEXT,
        metadata TEXT,
        status TEXT NOT NULL DEFAULT 'ready',
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        FOREIGN KEY (recording_id) REFERENCES recordings(id) ON DELETE SET NULL
      );

      CREATE INDEX IF NOT EXISTS idx_session_recordings_created_at ON session_recordings(created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_session_recordings_status ON session_recordings(status);
      CREATE INDEX IF NOT EXISTS idx_session_recordings_call_id ON session_recordings(call_id);

      -- Input event summary for quick stats (aggregated per recording)
      CREATE TABLE IF NOT EXISTS input_event_summary (
        recording_id TEXT PRIMARY KEY,
        total_events INTEGER DEFAULT 0,
        click_count INTEGER DEFAULT 0,
        keystroke_count INTEGER DEFAULT 0,
        scroll_count INTEGER DEFAULT 0,
        mouse_move_count INTEGER DEFAULT 0,
        first_event_ms INTEGER,
        last_event_ms INTEGER,
        created_at INTEGER NOT NULL,
        FOREIGN KEY (recording_id) REFERENCES recordings(id) ON DELETE CASCADE
      );

      -- Add input tracking columns to recordings
      ALTER TABLE recordings ADD COLUMN input_events_path TEXT;
      ALTER TABLE recordings ADD COLUMN input_event_count INTEGER DEFAULT 0;
      ALTER TABLE recordings ADD COLUMN has_input_tracking INTEGER DEFAULT 0;
    `);
  }

  // Update schema version
  if (currentVersion < SCHEMA_VERSION) {
    db.prepare('DELETE FROM schema_version').run();
    db.prepare('INSERT INTO schema_version (version) VALUES (?)').run(SCHEMA_VERSION);
    console.log(`[Database] Migrated schema to version ${SCHEMA_VERSION}`);
  }
}

export function getDatabase(): Database.Database {
  if (!db) {
    throw new Error('Database not initialized. Call initDatabase() first.');
  }
  return db;
}

export function closeDatabase(): void {
  if (db) {
    db.close();
    db = null;
  }
}

export function getRecordingsPath(): string {
  const userDataPath = app.getPath('userData');
  const recordingsPath = join(userDataPath, 'recordings');
  if (!existsSync(recordingsPath)) {
    mkdirSync(recordingsPath, { recursive: true });
  }
  return recordingsPath;
}

export function getThumbnailsPath(): string {
  const userDataPath = app.getPath('userData');
  const thumbnailsPath = join(userDataPath, 'thumbnails');
  if (!existsSync(thumbnailsPath)) {
    mkdirSync(thumbnailsPath, { recursive: true });
  }
  return thumbnailsPath;
}
