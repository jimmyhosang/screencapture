/**
 * Storage Manager Service
 *
 * Manages recording storage paths, disk space monitoring,
 * and automatic cleanup of old recordings.
 */

import { app, ipcMain } from 'electron';
import { join, dirname } from 'path';
import {
  existsSync,
  mkdirSync,
  statSync,
  readdirSync,
  unlinkSync,
  rmdirSync
} from 'fs';
import { stat, readdir, unlink, rmdir } from 'fs/promises';

// =============================================================================
// Types
// =============================================================================

export interface StorageConfig {
  basePath: string;
  retentionDays: number;
  diskThresholdPercent: number; // Alert when disk usage exceeds this
  diskThresholdBytes: number; // Or when free space falls below this
  autoCleanup: boolean;
  cleanupIntervalHours: number;
}

export interface StorageStats {
  totalSpace: number;
  freeSpace: number;
  usedSpace: number;
  usedPercent: number;
  recordingsSize: number;
  recordingsCount: number;
  oldestRecording: Date | null;
  newestRecording: Date | null;
}

export interface StoragePaths {
  base: string;
  recordings: string;
  thumbnails: string;
  temp: string;
  exports: string;
}

export interface RecordingPaths {
  directory: string;
  videoFile: string;
  metadataFile: string;
  thumbnailFile: string;
  windowActivityFile: string;
}

const DEFAULT_CONFIG: StorageConfig = {
  basePath: '',
  retentionDays: 90,
  diskThresholdPercent: 90,
  diskThresholdBytes: 10 * 1024 * 1024 * 1024, // 10GB
  autoCleanup: true,
  cleanupIntervalHours: 24
};

// =============================================================================
// StorageManager Class
// =============================================================================

export class StorageManager {
  private config: StorageConfig;
  private paths: StoragePaths;
  private cleanupTimer: NodeJS.Timeout | null = null;
  private diskAlertCallback: ((stats: StorageStats) => void) | null = null;

  constructor(config: Partial<StorageConfig> = {}) {
    const basePath = config.basePath || join(app.getPath('userData'), 'recordings');
    this.config = { ...DEFAULT_CONFIG, ...config, basePath };
    this.paths = this.initializePaths();
    this.ensureDirectories();

    if (this.config.autoCleanup) {
      this.startCleanupScheduler();
    }
  }

  /**
   * Initialize storage paths structure
   */
  private initializePaths(): StoragePaths {
    return {
      base: this.config.basePath,
      recordings: join(this.config.basePath, 'videos'),
      thumbnails: join(this.config.basePath, 'thumbnails'),
      temp: join(this.config.basePath, 'temp'),
      exports: join(this.config.basePath, 'exports')
    };
  }

  /**
   * Ensure all required directories exist
   */
  private ensureDirectories(): void {
    Object.values(this.paths).forEach((path) => {
      if (!existsSync(path)) {
        mkdirSync(path, { recursive: true });
      }
    });
  }

  /**
   * Get paths for a specific recording
   */
  getRecordingPaths(callId: string, timestamp: Date = new Date()): RecordingPaths {
    const year = timestamp.getFullYear();
    const month = String(timestamp.getMonth() + 1).padStart(2, '0');
    const dateFolder = `${year}-${month}`;
    const timestampStr = timestamp.toISOString().replace(/[:.]/g, '-');
    const baseFilename = `${callId}_${timestampStr}`;

    const directory = join(this.paths.recordings, dateFolder, callId);

    // Ensure directory exists
    if (!existsSync(directory)) {
      mkdirSync(directory, { recursive: true });
    }

    return {
      directory,
      videoFile: join(directory, `${baseFilename}.webm`),
      metadataFile: join(directory, `${baseFilename}.meta.json`),
      thumbnailFile: join(this.paths.thumbnails, `${callId}_${timestampStr}.jpg`),
      windowActivityFile: join(directory, `${baseFilename}.activity.json`)
    };
  }

  /**
   * Get all storage paths
   */
  getPaths(): StoragePaths {
    return { ...this.paths };
  }

  /**
   * Get storage statistics
   */
  async getStats(): Promise<StorageStats> {
    try {
      // Get disk space (cross-platform)
      const diskInfo = await this.getDiskSpace(this.paths.base);

      // Calculate recordings size and count
      const recordingsInfo = await this.getRecordingsInfo();

      return {
        totalSpace: diskInfo.total,
        freeSpace: diskInfo.free,
        usedSpace: diskInfo.total - diskInfo.free,
        usedPercent: ((diskInfo.total - diskInfo.free) / diskInfo.total) * 100,
        recordingsSize: recordingsInfo.totalSize,
        recordingsCount: recordingsInfo.count,
        oldestRecording: recordingsInfo.oldest,
        newestRecording: recordingsInfo.newest
      };
    } catch (error) {
      console.error('[StorageManager] Error getting stats:', error);
      return {
        totalSpace: 0,
        freeSpace: 0,
        usedSpace: 0,
        usedPercent: 0,
        recordingsSize: 0,
        recordingsCount: 0,
        oldestRecording: null,
        newestRecording: null
      };
    }
  }

  /**
   * Get disk space information
   */
  private async getDiskSpace(path: string): Promise<{ total: number; free: number }> {
    try {
      // Use Node.js statfs (available in Node 18+)
      const fs = await import('fs/promises');
      if ('statfs' in fs) {
        const stats = await (fs as typeof fs & { statfs: (path: string) => Promise<{ bsize: number; blocks: number; bfree: number }> }).statfs(path);
        return {
          total: stats.bsize * stats.blocks,
          free: stats.bsize * stats.bfree
        };
      }
    } catch {
      // Fallback: estimate based on file system
    }

    // Fallback values
    return {
      total: 500 * 1024 * 1024 * 1024, // Assume 500GB
      free: 100 * 1024 * 1024 * 1024 // Assume 100GB free
    };
  }

  /**
   * Get recordings information
   */
  private async getRecordingsInfo(): Promise<{
    count: number;
    totalSize: number;
    oldest: Date | null;
    newest: Date | null;
  }> {
    let count = 0;
    let totalSize = 0;
    let oldest: Date | null = null;
    let newest: Date | null = null;

    const processDirectory = async (dir: string): Promise<void> => {
      if (!existsSync(dir)) return;

      const entries = await readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = join(dir, entry.name);
        if (entry.isDirectory()) {
          await processDirectory(fullPath);
        } else if (entry.name.endsWith('.webm')) {
          count++;
          const stats = await stat(fullPath);
          totalSize += stats.size;

          if (!oldest || stats.mtime < oldest) {
            oldest = stats.mtime;
          }
          if (!newest || stats.mtime > newest) {
            newest = stats.mtime;
          }
        }
      }
    };

    await processDirectory(this.paths.recordings);

    return { count, totalSize, oldest, newest };
  }

  /**
   * Check if disk space is low
   */
  async checkDiskSpace(): Promise<{ isLow: boolean; stats: StorageStats }> {
    const stats = await this.getStats();

    const isLow =
      stats.usedPercent >= this.config.diskThresholdPercent ||
      stats.freeSpace <= this.config.diskThresholdBytes;

    if (isLow && this.diskAlertCallback) {
      this.diskAlertCallback(stats);
    }

    return { isLow, stats };
  }

  /**
   * Set disk alert callback
   */
  onDiskAlert(callback: (stats: StorageStats) => void): void {
    this.diskAlertCallback = callback;
  }

  /**
   * Clean up old recordings based on retention policy
   */
  async cleanupOldRecordings(): Promise<{ deleted: number; freedBytes: number }> {
    if (this.config.retentionDays <= 0) {
      return { deleted: 0, freedBytes: 0 };
    }

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - this.config.retentionDays);

    let deleted = 0;
    let freedBytes = 0;

    const processDirectory = async (dir: string): Promise<void> => {
      if (!existsSync(dir)) return;

      const entries = await readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = join(dir, entry.name);
        if (entry.isDirectory()) {
          await processDirectory(fullPath);
          // Try to remove empty directories
          try {
            const remaining = await readdir(fullPath);
            if (remaining.length === 0) {
              await rmdir(fullPath);
            }
          } catch {}
        } else {
          const stats = await stat(fullPath);
          if (stats.mtime < cutoffDate) {
            freedBytes += stats.size;
            await unlink(fullPath);
            deleted++;
          }
        }
      }
    };

    try {
      await processDirectory(this.paths.recordings);
      // Also clean thumbnails
      await processDirectory(this.paths.thumbnails);
      console.log(`[StorageManager] Cleanup complete: ${deleted} files, ${freedBytes} bytes freed`);
    } catch (error) {
      console.error('[StorageManager] Cleanup error:', error);
    }

    return { deleted, freedBytes };
  }

  /**
   * Start automatic cleanup scheduler
   */
  private startCleanupScheduler(): void {
    const intervalMs = this.config.cleanupIntervalHours * 60 * 60 * 1000;

    // Run cleanup once on start
    setTimeout(() => this.cleanupOldRecordings(), 60000); // After 1 minute

    // Schedule periodic cleanup
    this.cleanupTimer = setInterval(() => {
      this.cleanupOldRecordings();
      this.checkDiskSpace();
    }, intervalMs);
  }

  /**
   * Stop cleanup scheduler
   */
  stopCleanupScheduler(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
  }

  /**
   * Clean up temp files
   */
  async cleanupTemp(): Promise<void> {
    if (!existsSync(this.paths.temp)) return;

    const entries = await readdir(this.paths.temp);
    for (const entry of entries) {
      try {
        await unlink(join(this.paths.temp, entry));
      } catch {}
    }
  }

  /**
   * Get temporary file path
   */
  getTempPath(filename: string): string {
    return join(this.paths.temp, filename);
  }

  /**
   * Get export file path
   */
  getExportPath(filename: string): string {
    return join(this.paths.exports, filename);
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<StorageConfig>): void {
    const wasAutoCleanup = this.config.autoCleanup;
    this.config = { ...this.config, ...config };

    // Handle cleanup scheduler changes
    if (config.autoCleanup !== undefined) {
      if (config.autoCleanup && !wasAutoCleanup) {
        this.startCleanupScheduler();
      } else if (!config.autoCleanup && wasAutoCleanup) {
        this.stopCleanupScheduler();
      }
    }
  }

  /**
   * Get current configuration
   */
  getConfig(): StorageConfig {
    return { ...this.config };
  }

  /**
   * Calculate storage needed for duration
   */
  estimateStorageNeeded(durationSeconds: number, bitrateKbps: number = 2500): number {
    return (durationSeconds * bitrateKbps * 1000) / 8;
  }

  /**
   * Check if there's enough space for a recording
   */
  async hasSpaceFor(estimatedBytes: number): Promise<boolean> {
    const stats = await this.getStats();
    return stats.freeSpace > estimatedBytes + this.config.diskThresholdBytes;
  }

  /**
   * Shutdown and cleanup
   */
  shutdown(): void {
    this.stopCleanupScheduler();
  }
}

// =============================================================================
// Singleton and IPC Handlers
// =============================================================================

let storageManager: StorageManager | null = null;

export function getStorageManager(): StorageManager {
  if (!storageManager) {
    storageManager = new StorageManager();
  }
  return storageManager;
}

export function setupStorageHandlers(): void {
  const manager = getStorageManager();

  ipcMain.handle('storage:getStats', async () => {
    return manager.getStats();
  });

  ipcMain.handle('storage:getPaths', () => {
    return manager.getPaths();
  });

  ipcMain.handle('storage:getConfig', () => {
    return manager.getConfig();
  });

  ipcMain.handle('storage:updateConfig', (_, config: Partial<StorageConfig>) => {
    manager.updateConfig(config);
    return manager.getConfig();
  });

  ipcMain.handle('storage:cleanup', async () => {
    return manager.cleanupOldRecordings();
  });

  ipcMain.handle('storage:checkDiskSpace', async () => {
    return manager.checkDiskSpace();
  });

  console.log('[StorageManager] IPC handlers registered');
}

export function shutdownStorageManager(): void {
  if (storageManager) {
    storageManager.shutdown();
    storageManager = null;
  }
}
