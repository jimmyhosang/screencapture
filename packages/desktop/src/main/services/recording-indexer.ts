/**
 * Recording Indexer Service
 *
 * Indexes recordings in SQLite, extracts metadata using ffprobe,
 * generates thumbnails, and watches for new recordings.
 */

import { ipcMain } from 'electron';
import { join, basename, dirname } from 'path';
import { existsSync, watch, FSWatcher } from 'fs';
import { readdir, stat, readFile, writeFile } from 'fs/promises';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';
import { getDatabase } from '../database';
import { getStorageManager } from './storage-manager';

// Set ffmpeg path
ffmpeg.setFfmpegPath(ffmpegInstaller.path);

// =============================================================================
// Types
// =============================================================================

export interface IndexedRecording {
  id: string;
  callId: string;
  agentId: string;
  filename: string;
  filePath: string;
  duration: number; // milliseconds
  resolution: string;
  fileSize: number;
  fps: number;
  codec: string;
  startTime: number; // timestamp
  endTime: number; // timestamp
  thumbnailPath: string | null;
  thumbnailBase64: string | null;
  metadataPath: string | null;
  windowActivityPath: string | null;
  status: 'pending_review' | 'reviewed' | 'redacted' | 'archived' | 'deleted';
  tags: string[];
  notes: string | null;
  createdAt: number;
  updatedAt: number;
  indexedAt: number;
}

export interface RecordingMetadata {
  callId: string;
  agentId: string;
  startTime: string;
  endTime?: string;
  duration: number;
  direction?: 'inbound' | 'outbound';
  customerId?: string;
  customerPhone?: string;
  queueId?: string;
  dispositionCode?: string;
  tags?: string[];
  notes?: string;
}

export interface RecordingFilter {
  startDate?: number;
  endDate?: number;
  agentId?: string;
  callId?: string;
  status?: string;
  search?: string;
  tags?: string[];
}

export interface PaginatedRecordings {
  recordings: IndexedRecording[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

// =============================================================================
// RecordingIndexer Class
// =============================================================================

export class RecordingIndexer {
  private watchers: FSWatcher[] = [];
  private isIndexing = false;
  private indexQueue: string[] = [];

  constructor() {
    this.ensureTable();
  }

  /**
   * Ensure the indexed_recordings table exists
   */
  private ensureTable(): void {
    const db = getDatabase();
    db.exec(`
      CREATE TABLE IF NOT EXISTS indexed_recordings (
        id TEXT PRIMARY KEY,
        callId TEXT NOT NULL,
        agentId TEXT NOT NULL,
        filename TEXT NOT NULL,
        filePath TEXT NOT NULL,
        duration INTEGER NOT NULL,
        resolution TEXT NOT NULL,
        fileSize INTEGER NOT NULL,
        fps REAL NOT NULL,
        codec TEXT NOT NULL,
        startTime INTEGER NOT NULL,
        endTime INTEGER NOT NULL,
        thumbnailPath TEXT,
        thumbnailBase64 TEXT,
        metadataPath TEXT,
        windowActivityPath TEXT,
        status TEXT NOT NULL DEFAULT 'pending_review',
        tags TEXT DEFAULT '[]',
        notes TEXT,
        createdAt INTEGER NOT NULL,
        updatedAt INTEGER NOT NULL,
        indexedAt INTEGER NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_indexed_recordings_callId ON indexed_recordings(callId);
      CREATE INDEX IF NOT EXISTS idx_indexed_recordings_agentId ON indexed_recordings(agentId);
      CREATE INDEX IF NOT EXISTS idx_indexed_recordings_startTime ON indexed_recordings(startTime DESC);
      CREATE INDEX IF NOT EXISTS idx_indexed_recordings_status ON indexed_recordings(status);
    `);
  }

  /**
   * Index all recordings in the storage directory
   */
  async indexAll(): Promise<{ indexed: number; errors: number }> {
    if (this.isIndexing) {
      console.log('[RecordingIndexer] Indexing already in progress');
      return { indexed: 0, errors: 0 };
    }

    this.isIndexing = true;
    let indexed = 0;
    let errors = 0;

    const storage = getStorageManager();
    const paths = storage.getPaths();

    console.log('[RecordingIndexer] Starting full index...');

    try {
      const recordings = await this.findAllRecordings(paths.recordings);

      for (const filePath of recordings) {
        try {
          const existing = this.getByPath(filePath);
          if (!existing) {
            await this.indexRecording(filePath);
            indexed++;
          }
        } catch (error) {
          console.error(`[RecordingIndexer] Error indexing ${filePath}:`, error);
          errors++;
        }
      }

      console.log(`[RecordingIndexer] Indexing complete: ${indexed} indexed, ${errors} errors`);
    } finally {
      this.isIndexing = false;
    }

    return { indexed, errors };
  }

  /**
   * Find all recording files recursively
   */
  private async findAllRecordings(dir: string): Promise<string[]> {
    const recordings: string[] = [];

    if (!existsSync(dir)) return recordings;

    const processDir = async (currentDir: string): Promise<void> => {
      const entries = await readdir(currentDir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = join(currentDir, entry.name);
        if (entry.isDirectory()) {
          // Skip chunk directories (temporary files during recording)
          if (entry.name.endsWith('_chunks')) {
            continue;
          }
          await processDir(fullPath);
        } else if (entry.name.endsWith('.webm')) {
          // Skip chunk files
          if (entry.name.startsWith('chunk_')) {
            continue;
          }
          recordings.push(fullPath);
        }
      }
    };

    await processDir(dir);
    return recordings;
  }

  /**
   * Index a single recording
   */
  async indexRecording(filePath: string): Promise<IndexedRecording> {
    console.log(`[RecordingIndexer] Indexing: ${filePath}`);

    // Extract video metadata using ffprobe (optional - fallback to defaults if ffprobe not available)
    let videoMeta;
    try {
      videoMeta = await this.extractVideoMetadata(filePath);
    } catch (error) {
      console.warn(`[RecordingIndexer] Could not extract video metadata, using defaults:`, (error as Error).message);
      videoMeta = { duration: 0, resolution: 'unknown', fps: 30, codec: 'webm' };
    }

    // Look for sidecar metadata file
    const metadataPath = filePath.replace('.webm', '.meta.json');
    let metadata: RecordingMetadata | null = null;
    if (existsSync(metadataPath)) {
      try {
        const content = await readFile(metadataPath, 'utf-8');
        metadata = JSON.parse(content);
      } catch {}
    }

    // Also check for _metadata.json pattern
    const altMetadataPath = filePath.replace('.webm', '_metadata.json');
    if (!metadata && existsSync(altMetadataPath)) {
      try {
        const content = await readFile(altMetadataPath, 'utf-8');
        metadata = JSON.parse(content);
      } catch {}
    }

    // Look for window activity file
    const activityPath = filePath.replace('.webm', '.activity.json');
    const altActivityPath = filePath.replace('.webm', '_window_activity.json');
    const windowActivityPath = existsSync(activityPath)
      ? activityPath
      : existsSync(altActivityPath)
        ? altActivityPath
        : null;

    // Generate thumbnail (optional - skip if ffmpeg not available)
    let thumbnailResult;
    try {
      thumbnailResult = await this.generateThumbnail(filePath);
    } catch (error) {
      console.warn(`[RecordingIndexer] Could not generate thumbnail:`, (error as Error).message);
      thumbnailResult = { success: false, thumbnailPath: null };
    }

    // Extract callId and agentId from filename or metadata
    const filename = basename(filePath);
    const callId = metadata?.callId || this.extractCallIdFromFilename(filename);
    const agentId = metadata?.agentId || 'unknown';

    // Get file stats
    const fileStats = await stat(filePath);

    const recording: IndexedRecording = {
      id: `idx-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      callId,
      agentId,
      filename,
      filePath,
      duration: videoMeta.duration,
      resolution: videoMeta.resolution,
      fileSize: fileStats.size,
      fps: videoMeta.fps,
      codec: videoMeta.codec,
      startTime: metadata?.startTime ? new Date(metadata.startTime).getTime() : fileStats.birthtime.getTime(),
      endTime: metadata?.endTime ? new Date(metadata.endTime).getTime() : fileStats.mtime.getTime(),
      thumbnailPath: thumbnailResult.path,
      thumbnailBase64: thumbnailResult.base64,
      metadataPath: existsSync(metadataPath) ? metadataPath : existsSync(altMetadataPath) ? altMetadataPath : null,
      windowActivityPath,
      status: 'pending_review',
      tags: metadata?.tags || [],
      notes: metadata?.notes || null,
      createdAt: fileStats.birthtime.getTime(),
      updatedAt: fileStats.mtime.getTime(),
      indexedAt: Date.now()
    };

    // Save to database
    this.saveRecording(recording);

    return recording;
  }

  /**
   * Extract video metadata using ffprobe
   */
  private extractVideoMetadata(
    filePath: string
  ): Promise<{ duration: number; resolution: string; fps: number; codec: string }> {
    return new Promise((resolve, reject) => {
      ffmpeg.ffprobe(filePath, (err, data) => {
        if (err) {
          reject(err);
          return;
        }

        const videoStream = data.streams.find((s) => s.codec_type === 'video');
        const duration = Math.round((data.format.duration || 0) * 1000);
        const resolution = videoStream ? `${videoStream.width}x${videoStream.height}` : '0x0';
        const fps = videoStream?.r_frame_rate ? this.parseFrameRate(videoStream.r_frame_rate) : 30;
        const codec = videoStream?.codec_name || 'unknown';

        resolve({ duration, resolution, fps, codec });
      });
    });
  }

  /**
   * Parse frame rate string
   */
  private parseFrameRate(frameRate: string): number {
    const parts = frameRate.split('/');
    if (parts.length === 2) {
      const num = parseInt(parts[0], 10);
      const den = parseInt(parts[1], 10);
      if (!isNaN(num) && !isNaN(den) && den !== 0) {
        return Math.round((num / den) * 100) / 100;
      }
    }
    return parseFloat(frameRate) || 30;
  }

  /**
   * Generate thumbnail at 10% timestamp
   */
  private async generateThumbnail(
    filePath: string
  ): Promise<{ path: string | null; base64: string | null }> {
    const storage = getStorageManager();
    const paths = storage.getPaths();
    const filename = basename(filePath, '.webm');
    const thumbnailPath = join(paths.thumbnails, `${filename}.jpg`);

    return new Promise((resolve) => {
      // Get duration first
      ffmpeg.ffprobe(filePath, (err, data) => {
        if (err) {
          resolve({ path: null, base64: null });
          return;
        }

        const duration = data.format.duration || 0;
        const timestamp = duration * 0.1; // 10% into the video

        ffmpeg(filePath)
          .screenshots({
            timestamps: [timestamp],
            filename: `${filename}.jpg`,
            folder: paths.thumbnails,
            size: '320x180'
          })
          .on('end', async () => {
            // Read thumbnail as base64
            try {
              const buffer = await readFile(thumbnailPath);
              const base64 = buffer.toString('base64');
              resolve({ path: thumbnailPath, base64: `data:image/jpeg;base64,${base64}` });
            } catch {
              resolve({ path: thumbnailPath, base64: null });
            }
          })
          .on('error', () => {
            resolve({ path: null, base64: null });
          });
      });
    });
  }

  /**
   * Extract call ID from filename
   */
  private extractCallIdFromFilename(filename: string): string {
    // Pattern: callId_timestamp.webm or rec-timestamp-random.webm
    const match = filename.match(/^([^_]+)_/) || filename.match(/^(rec-[^.]+)/);
    return match ? match[1] : filename.replace('.webm', '');
  }

  /**
   * Save recording to database
   */
  private saveRecording(recording: IndexedRecording): void {
    const db = getDatabase();
    const stmt = db.prepare(`
      INSERT OR REPLACE INTO indexed_recordings (
        id, callId, agentId, filename, filePath, duration, resolution,
        fileSize, fps, codec, startTime, endTime, thumbnailPath, thumbnailBase64,
        metadataPath, windowActivityPath, status, tags, notes, createdAt, updatedAt, indexedAt
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      recording.id,
      recording.callId,
      recording.agentId,
      recording.filename,
      recording.filePath,
      recording.duration,
      recording.resolution,
      recording.fileSize,
      recording.fps,
      recording.codec,
      recording.startTime,
      recording.endTime,
      recording.thumbnailPath,
      recording.thumbnailBase64,
      recording.metadataPath,
      recording.windowActivityPath,
      recording.status,
      JSON.stringify(recording.tags),
      recording.notes,
      recording.createdAt,
      recording.updatedAt,
      recording.indexedAt
    );
  }

  /**
   * Get recording by file path
   */
  getByPath(filePath: string): IndexedRecording | null {
    const db = getDatabase();
    const stmt = db.prepare('SELECT * FROM indexed_recordings WHERE filePath = ?');
    const row = stmt.get(filePath) as (IndexedRecording & { tags: string }) | undefined;
    if (row) {
      return { ...row, tags: JSON.parse(row.tags) };
    }
    return null;
  }

  /**
   * Get recording by ID
   */
  getById(id: string): IndexedRecording | null {
    const db = getDatabase();
    const stmt = db.prepare('SELECT * FROM indexed_recordings WHERE id = ?');
    const row = stmt.get(id) as (IndexedRecording & { tags: string }) | undefined;
    if (row) {
      return { ...row, tags: JSON.parse(row.tags) };
    }
    return null;
  }

  /**
   * List recordings with filtering and pagination
   */
  list(filter: RecordingFilter = {}, page = 1, pageSize = 20): PaginatedRecordings {
    const db = getDatabase();
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (filter.startDate) {
      conditions.push('startTime >= ?');
      params.push(filter.startDate);
    }

    if (filter.endDate) {
      conditions.push('startTime <= ?');
      params.push(filter.endDate);
    }

    if (filter.agentId) {
      conditions.push('agentId = ?');
      params.push(filter.agentId);
    }

    if (filter.callId) {
      conditions.push('callId LIKE ?');
      params.push(`%${filter.callId}%`);
    }

    if (filter.status) {
      conditions.push('status = ?');
      params.push(filter.status);
    }

    if (filter.search) {
      conditions.push('(callId LIKE ? OR agentId LIKE ? OR filename LIKE ?)');
      const searchTerm = `%${filter.search}%`;
      params.push(searchTerm, searchTerm, searchTerm);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // Get total count
    const countStmt = db.prepare(`SELECT COUNT(*) as count FROM indexed_recordings ${whereClause}`);
    const total = (countStmt.get(...params) as { count: number }).count;

    // Get paginated results
    const offset = (page - 1) * pageSize;
    const selectStmt = db.prepare(`
      SELECT * FROM indexed_recordings
      ${whereClause}
      ORDER BY startTime DESC
      LIMIT ? OFFSET ?
    `);

    const rows = selectStmt.all(...params, pageSize, offset) as Array<IndexedRecording & { tags: string }>;
    const recordings = rows.map((row) => ({
      ...row,
      tags: JSON.parse(row.tags)
    }));

    return {
      recordings,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize)
    };
  }

  /**
   * Update recording status
   */
  updateStatus(id: string, status: IndexedRecording['status']): boolean {
    const db = getDatabase();
    const stmt = db.prepare('UPDATE indexed_recordings SET status = ?, updatedAt = ? WHERE id = ?');
    const result = stmt.run(status, Date.now(), id);
    return result.changes > 0;
  }

  /**
   * Update recording notes
   */
  updateNotes(id: string, notes: string): boolean {
    const db = getDatabase();
    const stmt = db.prepare('UPDATE indexed_recordings SET notes = ?, updatedAt = ? WHERE id = ?');
    const result = stmt.run(notes, Date.now(), id);
    return result.changes > 0;
  }

  /**
   * Update recording tags
   */
  updateTags(id: string, tags: string[]): boolean {
    const db = getDatabase();
    const stmt = db.prepare('UPDATE indexed_recordings SET tags = ?, updatedAt = ? WHERE id = ?');
    const result = stmt.run(JSON.stringify(tags), Date.now(), id);
    return result.changes > 0;
  }

  /**
   * Soft delete recording
   */
  softDelete(id: string): boolean {
    return this.updateStatus(id, 'deleted');
  }

  /**
   * Start watching for new recordings
   */
  startWatching(): void {
    const storage = getStorageManager();
    const paths = storage.getPaths();

    if (!existsSync(paths.recordings)) return;

    console.log('[RecordingIndexer] Starting file watcher...');

    const watcher = watch(paths.recordings, { recursive: true }, async (eventType, filename) => {
      if (filename && filename.endsWith('.webm') && eventType === 'rename') {
        // Skip chunk files and files in chunk directories
        if (filename.includes('_chunks') || basename(filename).startsWith('chunk_')) {
          return;
        }
        const filePath = join(paths.recordings, filename);
        if (existsSync(filePath)) {
          // New file added, queue for indexing
          this.indexQueue.push(filePath);
          this.processIndexQueue();
        }
      }
    });

    this.watchers.push(watcher);
  }

  /**
   * Process index queue
   */
  private async processIndexQueue(): Promise<void> {
    if (this.isIndexing || this.indexQueue.length === 0) return;

    this.isIndexing = true;

    while (this.indexQueue.length > 0) {
      const filePath = this.indexQueue.shift();
      if (filePath && existsSync(filePath)) {
        try {
          const existing = this.getByPath(filePath);
          if (!existing) {
            // Wait a bit for file to be fully written
            await new Promise((resolve) => setTimeout(resolve, 2000));
            await this.indexRecording(filePath);
          }
        } catch (error) {
          console.error(`[RecordingIndexer] Error indexing ${filePath}:`, error);
        }
      }
    }

    this.isIndexing = false;
  }

  /**
   * Stop watching
   */
  stopWatching(): void {
    this.watchers.forEach((w) => w.close());
    this.watchers = [];
  }

  /**
   * Get distinct agent IDs for filtering
   */
  getAgentIds(): string[] {
    const db = getDatabase();
    const stmt = db.prepare('SELECT DISTINCT agentId FROM indexed_recordings ORDER BY agentId');
    const rows = stmt.all() as Array<{ agentId: string }>;
    return rows.map((r) => r.agentId);
  }

  /**
   * Get recording statistics
   */
  getStats(): {
    total: number;
    byStatus: Record<string, number>;
    totalDuration: number;
    totalSize: number;
  } {
    const db = getDatabase();

    const totalStmt = db.prepare('SELECT COUNT(*) as count FROM indexed_recordings');
    const total = (totalStmt.get() as { count: number }).count;

    const statusStmt = db.prepare(`
      SELECT status, COUNT(*) as count FROM indexed_recordings GROUP BY status
    `);
    const statusRows = statusStmt.all() as Array<{ status: string; count: number }>;
    const byStatus: Record<string, number> = {};
    statusRows.forEach((r) => {
      byStatus[r.status] = r.count;
    });

    const durationStmt = db.prepare('SELECT SUM(duration) as total FROM indexed_recordings');
    const totalDuration = (durationStmt.get() as { total: number | null }).total || 0;

    const sizeStmt = db.prepare('SELECT SUM(fileSize) as total FROM indexed_recordings');
    const totalSize = (sizeStmt.get() as { total: number | null }).total || 0;

    return { total, byStatus, totalDuration, totalSize };
  }
}

// =============================================================================
// Singleton and IPC Handlers
// =============================================================================

let recordingIndexer: RecordingIndexer | null = null;

export function getRecordingIndexer(): RecordingIndexer {
  if (!recordingIndexer) {
    recordingIndexer = new RecordingIndexer();
  }
  return recordingIndexer;
}

export function setupIndexerHandlers(): void {
  const indexer = getRecordingIndexer();

  // Index all recordings
  ipcMain.handle('indexer:indexAll', async () => {
    return indexer.indexAll();
  });

  // List recordings with filters
  ipcMain.handle(
    'indexer:list',
    (_, filter: RecordingFilter, page: number, pageSize: number) => {
      return indexer.list(filter, page, pageSize);
    }
  );

  // Get single recording
  ipcMain.handle('indexer:get', (_, id: string) => {
    return indexer.getById(id);
  });

  // Get recording by path
  ipcMain.handle('indexer:getByPath', (_, filePath: string) => {
    return indexer.getByPath(filePath);
  });

  // Update status
  ipcMain.handle('indexer:updateStatus', (_, id: string, status: IndexedRecording['status']) => {
    return indexer.updateStatus(id, status);
  });

  // Update notes
  ipcMain.handle('indexer:updateNotes', (_, id: string, notes: string) => {
    return indexer.updateNotes(id, notes);
  });

  // Update tags
  ipcMain.handle('indexer:updateTags', (_, id: string, tags: string[]) => {
    return indexer.updateTags(id, tags);
  });

  // Soft delete
  ipcMain.handle('indexer:delete', (_, id: string) => {
    return indexer.softDelete(id);
  });

  // Get video path for playback
  ipcMain.handle('indexer:getVideoPath', (_, id: string) => {
    const recording = indexer.getById(id);
    return recording?.filePath || null;
  });

  // Update metadata (tags, notes, customData)
  ipcMain.handle(
    'indexer:updateMetadata',
    (_, id: string, metadata: Partial<Pick<IndexedRecording, 'tags' | 'notes'>>) => {
      let success = true;
      if (metadata.tags !== undefined) {
        success = indexer.updateTags(id, metadata.tags) && success;
      }
      if (metadata.notes !== undefined) {
        success = indexer.updateNotes(id, metadata.notes) && success;
      }
      return success;
    }
  );

  // Export recording to external location
  ipcMain.handle('indexer:export', async (_, id: string, outputPath: string) => {
    const recording = indexer.getById(id);
    if (!recording || !existsSync(recording.filePath)) {
      return false;
    }
    try {
      const fs = await import('fs/promises');
      await fs.copyFile(recording.filePath, outputPath);
      return true;
    } catch (error) {
      console.error('[RecordingIndexer] Export error:', error);
      return false;
    }
  });

  // Reindex a single recording
  ipcMain.handle('indexer:reindex', async (_, id: string) => {
    const recording = indexer.getById(id);
    if (!recording || !existsSync(recording.filePath)) {
      return null;
    }
    // Delete old record and reindex
    const db = getDatabase();
    db.prepare('DELETE FROM indexed_recordings WHERE id = ?').run(id);
    return indexer.indexRecording(recording.filePath);
  });

  // Get agent IDs
  ipcMain.handle('indexer:getAgentIds', () => {
    return indexer.getAgentIds();
  });

  // Get stats
  ipcMain.handle('indexer:getStats', () => {
    return indexer.getStats();
  });

  // Start indexing and watching
  indexer.indexAll();
  indexer.startWatching();

  console.log('[RecordingIndexer] IPC handlers registered');
}

export function shutdownRecordingIndexer(): void {
  if (recordingIndexer) {
    recordingIndexer.stopWatching();
    recordingIndexer = null;
  }
}
