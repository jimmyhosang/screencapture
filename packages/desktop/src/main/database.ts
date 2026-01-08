import Database from 'better-sqlite3';
import { app } from 'electron';
import { join } from 'path';
import { existsSync, mkdirSync } from 'fs';

let db: Database.Database | null = null;

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

  // Create tables
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
