import { ipcMain, dialog, app } from 'electron';
import { join, basename } from 'path';
import { existsSync, unlinkSync, statSync, copyFileSync } from 'fs';
import { unlink, stat, copyFile, readdir } from 'fs/promises';
import { getDatabase, getRecordingsPath, getThumbnailsPath } from './database';
import type { VideoRecording, VideoRecordingStats, ExportOptions } from './types';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';

// Set ffmpeg path
ffmpeg.setFfmpegPath(ffmpegInstaller.path);

// Parse frame rate fraction (e.g., "30/1" or "24000/1001") safely without eval
function parseFrameRate(frameRate: string): number {
  const parts = frameRate.split('/');
  if (parts.length === 2) {
    const numerator = parseInt(parts[0], 10);
    const denominator = parseInt(parts[1], 10);
    if (!isNaN(numerator) && !isNaN(denominator) && denominator !== 0) {
      return numerator / denominator;
    }
  }
  const parsed = parseFloat(frameRate);
  return isNaN(parsed) ? 30 : parsed;
}

export function setupRecordingHandlers(): void {
  const db = getDatabase();

  // Get all recordings (metadata only)
  ipcMain.handle('recordings:getAll', (): VideoRecording[] => {
    const stmt = db.prepare(`
      SELECT id, filename, sourceType, sourceName, duration, startTime,
             resolution, fps, fileSize, filePath, thumbnailPath,
             redactionConfig, status, createdAt, updatedAt
      FROM recordings
      ORDER BY startTime DESC
    `);
    const rows = stmt.all() as Array<VideoRecording & { redactionConfig: string | null }>;
    return rows.map(row => ({
      ...row,
      redactionConfig: row.redactionConfig ? JSON.parse(row.redactionConfig) : null
    }));
  });

  // Get single recording
  ipcMain.handle('recordings:get', (_, id: string): VideoRecording | null => {
    const stmt = db.prepare('SELECT * FROM recordings WHERE id = ?');
    const row = stmt.get(id) as (VideoRecording & { redactionConfig: string | null }) | undefined;
    if (!row) return null;
    return {
      ...row,
      redactionConfig: row.redactionConfig ? JSON.parse(row.redactionConfig) : null
    };
  });

  // Save a new recording
  ipcMain.handle('recordings:save', (_, recording: VideoRecording): boolean => {
    try {
      const stmt = db.prepare(`
        INSERT INTO recordings (
          id, filename, sourceType, sourceName, duration, startTime,
          resolution, fps, fileSize, filePath, thumbnailPath,
          redactionConfig, status, createdAt, updatedAt
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      stmt.run(
        recording.id,
        recording.filename,
        recording.sourceType,
        recording.sourceName,
        recording.duration,
        recording.startTime,
        recording.resolution,
        recording.fps,
        recording.fileSize,
        recording.filePath,
        recording.thumbnailPath,
        recording.redactionConfig ? JSON.stringify(recording.redactionConfig) : null,
        recording.status,
        recording.createdAt,
        recording.updatedAt
      );
      return true;
    } catch (error) {
      console.error('Error saving recording:', error);
      return false;
    }
  });

  // Update recording
  ipcMain.handle('recordings:update', (_, id: string, updates: Partial<VideoRecording>): boolean => {
    try {
      const fields: string[] = [];
      const values: unknown[] = [];

      if (updates.filename !== undefined) {
        fields.push('filename = ?');
        values.push(updates.filename);
      }
      if (updates.status !== undefined) {
        fields.push('status = ?');
        values.push(updates.status);
      }
      if (updates.redactionConfig !== undefined) {
        fields.push('redactionConfig = ?');
        values.push(updates.redactionConfig ? JSON.stringify(updates.redactionConfig) : null);
      }
      if (updates.thumbnailPath !== undefined) {
        fields.push('thumbnailPath = ?');
        values.push(updates.thumbnailPath);
      }

      if (fields.length === 0) return false;

      fields.push('updatedAt = ?');
      values.push(Date.now());
      values.push(id);

      const stmt = db.prepare(`UPDATE recordings SET ${fields.join(', ')} WHERE id = ?`);
      stmt.run(...values);
      return true;
    } catch (error) {
      console.error('Error updating recording:', error);
      return false;
    }
  });

  // Delete recording
  ipcMain.handle('recordings:delete', async (_, id: string): Promise<boolean> => {
    try {
      // Get recording info first
      const stmt = db.prepare('SELECT filePath, thumbnailPath FROM recordings WHERE id = ?');
      const row = stmt.get(id) as { filePath: string; thumbnailPath: string | null } | undefined;

      if (row) {
        // Delete video file
        if (existsSync(row.filePath)) {
          await unlink(row.filePath);
        }
        // Delete thumbnail
        if (row.thumbnailPath && existsSync(row.thumbnailPath)) {
          await unlink(row.thumbnailPath);
        }
      }

      // Delete from database
      const deleteStmt = db.prepare('DELETE FROM recordings WHERE id = ?');
      deleteStmt.run(id);
      return true;
    } catch (error) {
      console.error('Error deleting recording:', error);
      return false;
    }
  });

  // Get recording stats
  ipcMain.handle('recordings:stats', (): VideoRecordingStats => {
    const countStmt = db.prepare('SELECT COUNT(*) as count FROM recordings');
    const durationStmt = db.prepare('SELECT SUM(duration) as total FROM recordings');
    const sizeStmt = db.prepare('SELECT SUM(fileSize) as total FROM recordings');

    const count = (countStmt.get() as { count: number }).count;
    const totalDuration = (durationStmt.get() as { total: number | null }).total || 0;
    const totalSize = (sizeStmt.get() as { total: number | null }).total || 0;

    return {
      recordingCount: count,
      totalDuration,
      totalSize,
      averageDuration: count > 0 ? totalDuration / count : 0
    };
  });

  // Generate thumbnail for recording
  ipcMain.handle('recordings:generateThumbnail', async (_, id: string): Promise<string | null> => {
    try {
      const stmt = db.prepare('SELECT filePath FROM recordings WHERE id = ?');
      const row = stmt.get(id) as { filePath: string } | undefined;
      if (!row || !existsSync(row.filePath)) return null;

      const thumbnailsPath = getThumbnailsPath();
      const thumbnailPath = join(thumbnailsPath, `${id}.jpg`);

      return new Promise((resolve, reject) => {
        ffmpeg(row.filePath)
          .screenshots({
            count: 1,
            folder: thumbnailsPath,
            filename: `${id}.jpg`,
            size: '320x180'
          })
          .on('end', () => {
            // Update database with thumbnail path
            const updateStmt = db.prepare('UPDATE recordings SET thumbnailPath = ?, updatedAt = ? WHERE id = ?');
            updateStmt.run(thumbnailPath, Date.now(), id);
            resolve(thumbnailPath);
          })
          .on('error', (err) => {
            console.error('Thumbnail generation error:', err);
            reject(err);
          });
      });
    } catch (error) {
      console.error('Error generating thumbnail:', error);
      return null;
    }
  });

  // Export recording
  ipcMain.handle('recordings:export', async (_, id: string, options: ExportOptions): Promise<string | null> => {
    try {
      const stmt = db.prepare('SELECT * FROM recordings WHERE id = ?');
      const recording = stmt.get(id) as VideoRecording | undefined;
      if (!recording || !existsSync(recording.filePath)) return null;

      // Show save dialog
      const defaultName = `${recording.filename.replace(/\.[^.]+$/, '')}_export.${options.format}`;
      const result = await dialog.showSaveDialog({
        defaultPath: defaultName,
        filters: [
          { name: options.format.toUpperCase(), extensions: [options.format] }
        ]
      });

      if (result.canceled || !result.filePath) return null;

      const outputPath = result.filePath;

      return new Promise((resolve, reject) => {
        let command = ffmpeg(recording.filePath);

        // Set quality based on options
        if (options.format === 'mp4') {
          const crf = options.quality === 'high' ? 18 : options.quality === 'medium' ? 23 : 28;
          command = command
            .videoCodec('libx264')
            .addOption('-crf', crf.toString())
            .addOption('-preset', 'medium');
        } else {
          const crf = options.quality === 'high' ? 20 : options.quality === 'medium' ? 30 : 40;
          command = command
            .videoCodec('libvpx-vp9')
            .addOption('-crf', crf.toString())
            .addOption('-b:v', '0');
        }

        // Handle resolution
        if (options.resolution) {
          command = command.size(options.resolution);
        }

        // Handle audio
        if (!options.includeAudio) {
          command = command.noAudio();
        } else {
          command = command.audioCodec('aac');
        }

        // Apply redaction filters if enabled
        if (options.applyRedaction && recording.redactionConfig?.regions?.length) {
          const filters = recording.redactionConfig.regions.map(region => {
            if (region.style === 'blur') {
              return `boxblur=10:enable='between(t,${region.startTime},${region.endTime})'[tmp];` +
                     `[tmp]crop=${region.bbox.w}:${region.bbox.h}:${region.bbox.x}:${region.bbox.y}`;
            } else {
              return `drawbox=x=${region.bbox.x}:y=${region.bbox.y}:w=${region.bbox.w}:h=${region.bbox.h}:` +
                     `color=black:t=fill:enable='between(t,${region.startTime},${region.endTime})'`;
            }
          }).join(',');

          if (filters) {
            command = command.videoFilters(filters);
          }
        }

        command
          .output(outputPath)
          .on('end', () => resolve(outputPath))
          .on('error', (err) => {
            console.error('Export error:', err);
            reject(err);
          })
          .run();
      });
    } catch (error) {
      console.error('Error exporting recording:', error);
      return null;
    }
  });

  // Import recording from file
  ipcMain.handle('recordings:import', async (): Promise<VideoRecording | null> => {
    try {
      const result = await dialog.showOpenDialog({
        properties: ['openFile'],
        filters: [
          { name: 'Video Files', extensions: ['webm', 'mp4', 'mkv', 'avi', 'mov'] }
        ]
      });

      if (result.canceled || !result.filePaths.length) return null;

      const sourcePath = result.filePaths[0];
      const filename = basename(sourcePath);
      const recordingsPath = getRecordingsPath();
      const id = `rec-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      const destPath = join(recordingsPath, `${id}_${filename}`);

      // Copy file to recordings folder
      await copyFile(sourcePath, destPath);

      // Get file stats
      const fileStat = await stat(destPath);

      // Get video metadata using ffprobe
      const metadata = await new Promise<{ duration: number; resolution: string; fps: number }>((resolve, reject) => {
        ffmpeg.ffprobe(destPath, (err, data) => {
          if (err) {
            reject(err);
            return;
          }
          const videoStream = data.streams.find(s => s.codec_type === 'video');
          resolve({
            duration: Math.round((data.format.duration || 0) * 1000),
            resolution: videoStream ? `${videoStream.width}x${videoStream.height}` : '0x0',
            fps: videoStream?.r_frame_rate ? parseFrameRate(videoStream.r_frame_rate) : 30
          });
        });
      });

      const recording: VideoRecording = {
        id,
        filename,
        sourceType: 'screen',
        sourceName: 'Imported',
        duration: metadata.duration,
        startTime: Date.now(),
        resolution: metadata.resolution,
        fps: Math.round(metadata.fps),
        fileSize: fileStat.size,
        filePath: destPath,
        thumbnailPath: null,
        redactionConfig: null,
        status: 'ready',
        createdAt: Date.now(),
        updatedAt: Date.now()
      };

      // Save to database
      const stmt = db.prepare(`
        INSERT INTO recordings (
          id, filename, sourceType, sourceName, duration, startTime,
          resolution, fps, fileSize, filePath, thumbnailPath,
          redactionConfig, status, createdAt, updatedAt
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      stmt.run(
        recording.id,
        recording.filename,
        recording.sourceType,
        recording.sourceName,
        recording.duration,
        recording.startTime,
        recording.resolution,
        recording.fps,
        recording.fileSize,
        recording.filePath,
        recording.thumbnailPath,
        null,
        recording.status,
        recording.createdAt,
        recording.updatedAt
      );

      return recording;
    } catch (error) {
      console.error('Error importing recording:', error);
      return null;
    }
  });

  // Get recordings folder path
  ipcMain.handle('recordings:getPath', (): string => {
    return getRecordingsPath();
  });

  // Open recordings folder in file manager
  ipcMain.handle('recordings:openFolder', async (): Promise<void> => {
    const { shell } = await import('electron');
    shell.openPath(getRecordingsPath());
  });
}
