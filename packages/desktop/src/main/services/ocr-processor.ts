/**
 * OCR Processor Service
 *
 * Extracts text from video recordings using Tesseract.js.
 * Processes frames at configurable intervals, stores results in database,
 * and provides a background processing queue.
 */

import { ipcMain, BrowserWindow } from 'electron';
import { Worker } from 'worker_threads';
import { join, basename } from 'path';
import { existsSync, mkdirSync, unlinkSync, readdirSync } from 'fs';
import { readFile, writeFile, rm } from 'fs/promises';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';
import { getDatabase } from '../database';
import { getStorageManager } from './storage-manager';
import { getRecordingIndexer } from './recording-indexer';

// Set ffmpeg path
ffmpeg.setFfmpegPath(ffmpegInstaller.path);

// =============================================================================
// Types
// =============================================================================

export interface WordInfo {
  text: string;
  bbox: { x: number; y: number; width: number; height: number };
  confidence: number;
}

export interface OcrFrameResult {
  text: string;
  words: WordInfo[];
  confidence: number;
  processingTimeMs: number;
}

export interface OcrFrame {
  timestamp: number; // seconds
  frameIndex: number;
  text: string;
  words: WordInfo[];
  confidence: number;
}

export interface OcrOptions {
  frameInterval: number; // seconds between frames (default 2)
  languages: string[]; // ISO 639-3 codes (default ['eng'])
  minConfidence: number; // 0-1, ignore words below (default 0.5)
  regions?: Rectangle[]; // optional screen regions to process
  priority?: 'high' | 'normal' | 'low';
  psmMode?: number; // Tesseract page segmentation mode (default 3)
}

export interface Rectangle {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface OcrReport {
  id: string;
  recordingId: string;
  processedAt: number;
  frameCount: number;
  timeline: OcrFrame[];
  fullText: string;
  uniqueWords: string[];
  processingDurationMs: number;
  options: OcrOptions;
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';
  progress: number;
  error?: string;
}

export interface OcrJobStatus {
  jobId: string;
  recordingId: string;
  status: 'queued' | 'processing' | 'completed' | 'failed' | 'cancelled';
  progress: number;
  currentFrame?: number;
  totalFrames?: number;
  error?: string;
}

const DEFAULT_OPTIONS: OcrOptions = {
  frameInterval: 2,
  languages: ['eng'],
  minConfidence: 0.5,
  priority: 'normal',
  psmMode: 3
};

// =============================================================================
// OcrProcessor Class
// =============================================================================

export class OcrProcessor {
  private processingQueue: Array<{
    jobId: string;
    recordingId: string;
    options: OcrOptions;
    priority: number;
  }> = [];
  private isProcessing = false;
  private currentJob: string | null = null;
  private isCancelled = false;
  private isPaused = false;
  private tempDir: string;
  private workerPool: Worker[] = [];
  private maxWorkers = 2;

  constructor() {
    const storage = getStorageManager();
    this.tempDir = join(storage.getPaths().temp, 'ocr-frames');
    this.ensureDirectories();
    this.ensureTable();
  }

  /**
   * Ensure required directories exist
   */
  private ensureDirectories(): void {
    if (!existsSync(this.tempDir)) {
      mkdirSync(this.tempDir, { recursive: true });
    }
  }

  /**
   * Ensure database table exists
   */
  private ensureTable(): void {
    const db = getDatabase();
    db.exec(`
      CREATE TABLE IF NOT EXISTS ocr_reports (
        id TEXT PRIMARY KEY,
        recordingId TEXT NOT NULL,
        processedAt INTEGER NOT NULL,
        frameCount INTEGER NOT NULL,
        timeline TEXT NOT NULL,
        fullText TEXT NOT NULL,
        uniqueWords TEXT NOT NULL,
        processingDurationMs INTEGER NOT NULL,
        options TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        progress REAL DEFAULT 0,
        error TEXT,
        createdAt INTEGER NOT NULL,
        updatedAt INTEGER NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_ocr_reports_recordingId ON ocr_reports(recordingId);
      CREATE INDEX IF NOT EXISTS idx_ocr_reports_status ON ocr_reports(status);
    `);
  }

  /**
   * Extract frames from video at specified interval
   */
  async extractFrames(videoPath: string, interval: number): Promise<string[]> {
    if (!existsSync(videoPath)) {
      throw new Error(`Video file not found: ${videoPath}`);
    }

    const jobDir = join(this.tempDir, `job-${Date.now()}`);
    mkdirSync(jobDir, { recursive: true });

    return new Promise((resolve, reject) => {
      const framePaths: string[] = [];

      ffmpeg(videoPath)
        .outputOptions([
          `-vf fps=1/${interval}`, // Extract 1 frame every N seconds
          '-q:v 2' // High quality JPEG
        ])
        .output(join(jobDir, 'frame-%04d.png'))
        .on('end', () => {
          // Collect frame paths
          try {
            const files = readdirSync(jobDir)
              .filter(f => f.endsWith('.png'))
              .sort()
              .map(f => join(jobDir, f));
            resolve(files);
          } catch (error) {
            reject(error);
          }
        })
        .on('error', (err) => {
          reject(new Error(`Frame extraction failed: ${err.message}`));
        })
        .run();
    });
  }

  /**
   * Process a single frame with Tesseract
   */
  async processFrame(
    framePath: string,
    options: OcrOptions
  ): Promise<OcrFrameResult> {
    const startTime = performance.now();

    // Import Tesseract dynamically
    const Tesseract = await import('tesseract.js');

    // Create worker with configured languages
    const langCode = options.languages.join('+');
    const worker = await Tesseract.createWorker(langCode);

    try {
      // Configure Tesseract parameters
      await worker.setParameters({
        tessedit_pageseg_mode: String(options.psmMode || 3)
      });

      // Read image
      const imageBuffer = await readFile(framePath);

      // Process with region cropping if specified
      const { data } = await worker.recognize(imageBuffer);

      // Extract words with bounding boxes
      const words: WordInfo[] = [];
      let totalConfidence = 0;
      let wordCount = 0;

      if (data.words) {
        for (const word of data.words) {
          const confidence = word.confidence / 100;
          if (confidence >= options.minConfidence && word.text.trim()) {
            words.push({
              text: word.text.trim(),
              bbox: {
                x: word.bbox.x0,
                y: word.bbox.y0,
                width: word.bbox.x1 - word.bbox.x0,
                height: word.bbox.y1 - word.bbox.y0
              },
              confidence
            });
            totalConfidence += confidence;
            wordCount++;
          }
        }
      }

      await worker.terminate();

      return {
        text: data.text.trim(),
        words,
        confidence: wordCount > 0 ? totalConfidence / wordCount : 0,
        processingTimeMs: performance.now() - startTime
      };
    } catch (error) {
      await worker.terminate();
      throw error;
    }
  }

  /**
   * Process an entire recording
   */
  async processRecording(
    recordingId: string,
    options: Partial<OcrOptions> = {}
  ): Promise<OcrReport> {
    const fullOptions: OcrOptions = { ...DEFAULT_OPTIONS, ...options };
    const startTime = performance.now();

    // Get recording info
    const indexer = getRecordingIndexer();
    const recording = indexer.getById(recordingId);

    if (!recording) {
      throw new Error(`Recording not found: ${recordingId}`);
    }

    if (!existsSync(recording.filePath)) {
      throw new Error(`Recording file not found: ${recording.filePath}`);
    }

    // Create report entry
    const reportId = `ocr-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const report: OcrReport = {
      id: reportId,
      recordingId,
      processedAt: Date.now(),
      frameCount: 0,
      timeline: [],
      fullText: '',
      uniqueWords: [],
      processingDurationMs: 0,
      options: fullOptions,
      status: 'processing',
      progress: 0
    };

    this.saveReport(report);
    this.notifyProgress(reportId, recordingId, 'processing', 0);

    let framePaths: string[] = [];

    try {
      // Extract frames
      this.notifyProgress(reportId, recordingId, 'processing', 5, 'Extracting frames...');
      framePaths = await this.extractFrames(recording.filePath, fullOptions.frameInterval);
      report.frameCount = framePaths.length;

      if (framePaths.length === 0) {
        throw new Error('No frames extracted from video');
      }

      // Process each frame
      const timeline: OcrFrame[] = [];
      const allText: string[] = [];
      const wordSet = new Set<string>();

      for (let i = 0; i < framePaths.length; i++) {
        // Check for cancellation
        if (this.isCancelled && this.currentJob === reportId) {
          report.status = 'cancelled';
          this.saveReport(report);
          this.cleanupFrames(framePaths);
          throw new Error('Processing cancelled');
        }

        // Check for pause
        while (this.isPaused && this.currentJob === reportId) {
          await new Promise(resolve => setTimeout(resolve, 500));
        }

        const framePath = framePaths[i];
        const timestamp = i * fullOptions.frameInterval;
        const progress = 5 + (90 * (i + 1)) / framePaths.length;

        try {
          const result = await this.processFrame(framePath, fullOptions);

          timeline.push({
            timestamp,
            frameIndex: i,
            text: result.text,
            words: result.words,
            confidence: result.confidence
          });

          // Collect text
          if (result.text) {
            allText.push(result.text);
          }

          // Collect unique words
          result.words.forEach(w => {
            const word = w.text.toLowerCase().replace(/[^a-z0-9]/g, '');
            if (word.length > 2) {
              wordSet.add(word);
            }
          });

          this.notifyProgress(reportId, recordingId, 'processing', progress, `Frame ${i + 1}/${framePaths.length}`);
        } catch (frameError) {
          console.error(`[OcrProcessor] Error processing frame ${i}:`, frameError);
          // Continue with other frames
        }
      }

      // Compile results
      report.timeline = timeline;
      report.fullText = this.deduplicateText(allText);
      report.uniqueWords = Array.from(wordSet).sort();
      report.processingDurationMs = performance.now() - startTime;
      report.status = 'completed';
      report.progress = 100;

      this.saveReport(report);
      this.notifyProgress(reportId, recordingId, 'completed', 100);

      // Cleanup temp frames
      this.cleanupFrames(framePaths);

      return report;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      report.status = 'failed';
      report.error = errorMessage;
      this.saveReport(report);
      this.notifyProgress(reportId, recordingId, 'failed', report.progress, errorMessage);

      // Cleanup temp frames
      if (framePaths.length > 0) {
        this.cleanupFrames(framePaths);
      }

      throw error;
    }
  }

  /**
   * Deduplicate consecutive similar text
   */
  private deduplicateText(textArray: string[]): string {
    const uniqueLines: string[] = [];
    let prevText = '';

    for (const text of textArray) {
      // Only add if significantly different from previous
      if (text && this.textDifference(prevText, text) > 0.3) {
        uniqueLines.push(text);
        prevText = text;
      }
    }

    return uniqueLines.join('\n\n---\n\n');
  }

  /**
   * Calculate text difference ratio
   */
  private textDifference(a: string, b: string): number {
    if (!a || !b) return 1;
    const wordsA = new Set(a.toLowerCase().split(/\s+/));
    const wordsB = new Set(b.toLowerCase().split(/\s+/));
    const intersection = new Set([...wordsA].filter(x => wordsB.has(x)));
    const union = new Set([...wordsA, ...wordsB]);
    return 1 - (intersection.size / union.size);
  }

  /**
   * Cleanup temporary frame files
   */
  private async cleanupFrames(framePaths: string[]): Promise<void> {
    if (framePaths.length === 0) return;

    const jobDir = join(framePaths[0], '..');
    try {
      await rm(jobDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  }

  /**
   * Save report to database
   */
  private saveReport(report: OcrReport): void {
    const db = getDatabase();
    const stmt = db.prepare(`
      INSERT OR REPLACE INTO ocr_reports (
        id, recordingId, processedAt, frameCount, timeline, fullText,
        uniqueWords, processingDurationMs, options, status, progress, error,
        createdAt, updatedAt
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const now = Date.now();
    stmt.run(
      report.id,
      report.recordingId,
      report.processedAt,
      report.frameCount,
      JSON.stringify(report.timeline),
      report.fullText,
      JSON.stringify(report.uniqueWords),
      report.processingDurationMs,
      JSON.stringify(report.options),
      report.status,
      report.progress,
      report.error || null,
      now,
      now
    );
  }

  /**
   * Notify renderer of progress
   */
  private notifyProgress(
    jobId: string,
    recordingId: string,
    status: string,
    progress: number,
    message?: string
  ): void {
    const mainWindow = BrowserWindow.getAllWindows().find(w => !w.isDestroyed());
    if (mainWindow) {
      mainWindow.webContents.send('ocr:progress', {
        jobId,
        recordingId,
        status,
        progress,
        message
      });
    }
  }

  /**
   * Queue a recording for background processing
   */
  queueRecording(recordingId: string, options: Partial<OcrOptions> = {}): string {
    const jobId = `job-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const fullOptions: OcrOptions = { ...DEFAULT_OPTIONS, ...options };
    const priority = fullOptions.priority === 'high' ? 0 : fullOptions.priority === 'low' ? 2 : 1;

    this.processingQueue.push({
      jobId,
      recordingId,
      options: fullOptions,
      priority
    });

    // Sort by priority (lower number = higher priority)
    this.processingQueue.sort((a, b) => a.priority - b.priority);

    // Start processing if not already running
    this.processQueue();

    return jobId;
  }

  /**
   * Process queued recordings
   */
  private async processQueue(): Promise<void> {
    if (this.isProcessing || this.processingQueue.length === 0) {
      return;
    }

    this.isProcessing = true;
    this.isCancelled = false;

    while (this.processingQueue.length > 0 && !this.isCancelled) {
      const job = this.processingQueue.shift();
      if (!job) break;

      this.currentJob = job.jobId;

      try {
        console.log(`[OcrProcessor] Processing recording: ${job.recordingId}`);
        await this.processRecording(job.recordingId, job.options);
      } catch (error) {
        console.error(`[OcrProcessor] Job ${job.jobId} failed:`, error);
      }

      this.currentJob = null;
    }

    this.isProcessing = false;
  }

  /**
   * Cancel current processing
   */
  cancelCurrent(): void {
    this.isCancelled = true;
  }

  /**
   * Cancel specific job
   */
  cancelJob(jobId: string): boolean {
    // Check if it's the current job
    if (this.currentJob === jobId) {
      this.isCancelled = true;
      return true;
    }

    // Remove from queue
    const index = this.processingQueue.findIndex(j => j.jobId === jobId);
    if (index !== -1) {
      this.processingQueue.splice(index, 1);
      return true;
    }

    return false;
  }

  /**
   * Pause processing
   */
  pause(): void {
    this.isPaused = true;
  }

  /**
   * Resume processing
   */
  resume(): void {
    this.isPaused = false;
    if (!this.isProcessing) {
      this.processQueue();
    }
  }

  /**
   * Get queue status
   */
  getQueueStatus(): OcrJobStatus[] {
    const status: OcrJobStatus[] = [];

    // Current job
    if (this.currentJob) {
      const report = this.getReport(this.currentJob);
      if (report) {
        status.push({
          jobId: this.currentJob,
          recordingId: report.recordingId,
          status: 'processing',
          progress: report.progress
        });
      }
    }

    // Queued jobs
    for (const job of this.processingQueue) {
      status.push({
        jobId: job.jobId,
        recordingId: job.recordingId,
        status: 'queued',
        progress: 0
      });
    }

    return status;
  }

  /**
   * Get report by ID
   */
  getReport(id: string): OcrReport | null {
    const db = getDatabase();
    const stmt = db.prepare('SELECT * FROM ocr_reports WHERE id = ?');
    const row = stmt.get(id) as (OcrReport & { timeline: string; uniqueWords: string; options: string }) | undefined;

    if (row) {
      return {
        ...row,
        timeline: JSON.parse(row.timeline),
        uniqueWords: JSON.parse(row.uniqueWords),
        options: JSON.parse(row.options)
      };
    }
    return null;
  }

  /**
   * Get report by recording ID
   */
  getReportByRecording(recordingId: string): OcrReport | null {
    const db = getDatabase();
    const stmt = db.prepare('SELECT * FROM ocr_reports WHERE recordingId = ? ORDER BY processedAt DESC LIMIT 1');
    const row = stmt.get(recordingId) as (OcrReport & { timeline: string; uniqueWords: string; options: string }) | undefined;

    if (row) {
      return {
        ...row,
        timeline: JSON.parse(row.timeline),
        uniqueWords: JSON.parse(row.uniqueWords),
        options: JSON.parse(row.options)
      };
    }
    return null;
  }

  /**
   * Get all reports
   */
  getAllReports(): OcrReport[] {
    const db = getDatabase();
    const stmt = db.prepare('SELECT * FROM ocr_reports ORDER BY processedAt DESC');
    const rows = stmt.all() as Array<OcrReport & { timeline: string; uniqueWords: string; options: string }>;

    return rows.map(row => ({
      ...row,
      timeline: JSON.parse(row.timeline),
      uniqueWords: JSON.parse(row.uniqueWords),
      options: JSON.parse(row.options)
    }));
  }

  /**
   * Delete report
   */
  deleteReport(id: string): boolean {
    const db = getDatabase();
    const stmt = db.prepare('DELETE FROM ocr_reports WHERE id = ?');
    const result = stmt.run(id);
    return result.changes > 0;
  }

  /**
   * Search OCR text
   */
  searchText(query: string, recordingId?: string): Array<{
    reportId: string;
    recordingId: string;
    frames: Array<{ timestamp: number; text: string; matchCount: number }>;
  }> {
    const db = getDatabase();
    const lowerQuery = query.toLowerCase();

    let reports: OcrReport[];
    if (recordingId) {
      const report = this.getReportByRecording(recordingId);
      reports = report ? [report] : [];
    } else {
      reports = this.getAllReports();
    }

    const results: Array<{
      reportId: string;
      recordingId: string;
      frames: Array<{ timestamp: number; text: string; matchCount: number }>;
    }> = [];

    for (const report of reports) {
      const matchingFrames: Array<{ timestamp: number; text: string; matchCount: number }> = [];

      for (const frame of report.timeline) {
        const lowerText = frame.text.toLowerCase();
        if (lowerText.includes(lowerQuery)) {
          const matches = lowerText.split(lowerQuery).length - 1;
          matchingFrames.push({
            timestamp: frame.timestamp,
            text: frame.text,
            matchCount: matches
          });
        }
      }

      if (matchingFrames.length > 0) {
        results.push({
          reportId: report.id,
          recordingId: report.recordingId,
          frames: matchingFrames
        });
      }
    }

    return results;
  }

  /**
   * Get text at specific timestamp
   */
  getTextAtTimestamp(recordingId: string, timestamp: number): OcrFrame | null {
    const report = this.getReportByRecording(recordingId);
    if (!report) return null;

    // Find closest frame
    let closestFrame: OcrFrame | null = null;
    let minDiff = Infinity;

    for (const frame of report.timeline) {
      const diff = Math.abs(frame.timestamp - timestamp);
      if (diff < minDiff) {
        minDiff = diff;
        closestFrame = frame;
      }
    }

    return closestFrame;
  }

  /**
   * Cleanup and shutdown
   */
  async shutdown(): Promise<void> {
    this.isCancelled = true;
    this.processingQueue = [];

    // Wait for current processing to stop
    let attempts = 0;
    while (this.isProcessing && attempts < 10) {
      await new Promise(resolve => setTimeout(resolve, 500));
      attempts++;
    }

    // Cleanup temp directory
    try {
      const files = readdirSync(this.tempDir);
      for (const file of files) {
        try {
          await rm(join(this.tempDir, file), { recursive: true, force: true });
        } catch {}
      }
    } catch {}
  }
}

// =============================================================================
// Singleton and IPC Handlers
// =============================================================================

let ocrProcessor: OcrProcessor | null = null;

export function getOcrProcessor(): OcrProcessor {
  if (!ocrProcessor) {
    ocrProcessor = new OcrProcessor();
  }
  return ocrProcessor;
}

export function setupOcrProcessorHandlers(): void {
  const processor = getOcrProcessor();

  // Queue recording for processing
  ipcMain.handle('ocrProcessor:queue', (_, recordingId: string, options?: Partial<OcrOptions>) => {
    return processor.queueRecording(recordingId, options);
  });

  // Process recording immediately
  ipcMain.handle('ocrProcessor:process', async (_, recordingId: string, options?: Partial<OcrOptions>) => {
    return processor.processRecording(recordingId, options);
  });

  // Get report by ID
  ipcMain.handle('ocrProcessor:getReport', (_, id: string) => {
    return processor.getReport(id);
  });

  // Get report by recording ID
  ipcMain.handle('ocrProcessor:getReportByRecording', (_, recordingId: string) => {
    return processor.getReportByRecording(recordingId);
  });

  // Get all reports
  ipcMain.handle('ocrProcessor:getAllReports', () => {
    return processor.getAllReports();
  });

  // Delete report
  ipcMain.handle('ocrProcessor:deleteReport', (_, id: string) => {
    return processor.deleteReport(id);
  });

  // Search text
  ipcMain.handle('ocrProcessor:search', (_, query: string, recordingId?: string) => {
    return processor.searchText(query, recordingId);
  });

  // Get text at timestamp
  ipcMain.handle('ocrProcessor:getTextAtTimestamp', (_, recordingId: string, timestamp: number) => {
    return processor.getTextAtTimestamp(recordingId, timestamp);
  });

  // Get queue status
  ipcMain.handle('ocrProcessor:getQueueStatus', () => {
    return processor.getQueueStatus();
  });

  // Cancel job
  ipcMain.handle('ocrProcessor:cancelJob', (_, jobId: string) => {
    return processor.cancelJob(jobId);
  });

  // Pause processing
  ipcMain.handle('ocrProcessor:pause', () => {
    processor.pause();
  });

  // Resume processing
  ipcMain.handle('ocrProcessor:resume', () => {
    processor.resume();
  });

  console.log('[OcrProcessor] IPC handlers registered');
}

export function shutdownOcrProcessor(): void {
  if (ocrProcessor) {
    ocrProcessor.shutdown();
    ocrProcessor = null;
  }
}
