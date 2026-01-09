import Database from 'better-sqlite3';
import { app } from 'electron';
import { join } from 'path';
import { existsSync, mkdirSync } from 'fs';

let db: Database.Database | null = null;

// Schema version for migrations
const SCHEMA_VERSION = 2;

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
