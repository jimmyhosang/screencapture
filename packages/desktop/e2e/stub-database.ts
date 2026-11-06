/**
 * Stand-in for src/main/database.ts in the e2e harness: the real module opens
 * SQLite via better-sqlite3, which isn't needed to exercise capture/redaction.
 */
import { app } from 'electron';
import { join } from 'path';
import { mkdirSync } from 'fs';

function dir(name: string): string {
  const p = join(app.getPath('userData'), name);
  mkdirSync(p, { recursive: true });
  return p;
}

export const getRecordingsPath = (): string => dir('recordings');
export const getThumbnailsPath = (): string => dir('thumbnails');
