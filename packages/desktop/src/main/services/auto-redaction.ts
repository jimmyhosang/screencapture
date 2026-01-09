/**
 * Auto-Redaction Service
 *
 * Automatically detects and redacts PII from video recordings after capture.
 * Workflow:
 * 1. Extract frames at regular intervals from the video
 * 2. Run OCR on each frame to detect text regions
 * 3. Scan text regions for PII (SSN, credit cards, emails, etc.)
 * 4. Create redaction masks for detected PII
 * 5. Apply FFmpeg filters to create redacted video
 */

import { join, dirname, basename, extname } from 'path';
import { existsSync, promises as fs } from 'fs';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';
import ffprobeInstaller from '@ffprobe-installer/ffprobe';
import { getTextDetector } from '../ocr/textDetector';
import { getPIIScanner, type PIIRegion, type PIIScanResult } from '../ocr/piiScanner';
import type { TextBounds } from '../ocr/types';

// Set ffmpeg paths
ffmpeg.setFfmpegPath(ffmpegInstaller.path);
ffmpeg.setFfprobePath(ffprobeInstaller.path);

// =============================================================================
// Types
// =============================================================================

export interface AutoRedactionConfig {
  /** Enable automatic redaction after recording */
  enabled: boolean;
  /** Interval between frame extractions for analysis (seconds) */
  frameInterval: number;
  /** Types of PII to detect and redact */
  piiTypes: string[];
  /** Redaction style: 'blur' or 'solid' */
  style: 'blur' | 'solid';
  /** Color for solid style */
  solidColor: string;
  /** Keep original unredacted video */
  keepOriginal: boolean;
  /** Minimum confidence level for PII detection */
  minConfidence: 'high' | 'medium' | 'low';
}

export interface RedactionProgress {
  stage: 'extracting' | 'analyzing' | 'redacting' | 'complete' | 'error';
  progress: number; // 0-100
  framesAnalyzed: number;
  totalFrames: number;
  piiFound: number;
  message: string;
}

export interface RedactionResult {
  success: boolean;
  originalPath: string;
  redactedPath?: string;
  piiRegionsFound: number;
  processingTimeMs: number;
  error?: string;
}

interface FramePII {
  timestamp: number;
  regions: PIIRegion[];
}

interface VideoInfo {
  duration: number;
  width: number;
  height: number;
  fps: number;
}

// =============================================================================
// Default Configuration
// =============================================================================

export const DEFAULT_AUTO_REDACTION_CONFIG: AutoRedactionConfig = {
  enabled: false, // Disabled by default, user must opt-in
  frameInterval: 1.0, // Check every 1 second
  piiTypes: ['ssn', 'creditCard', 'email', 'phone', 'apiKey'],
  style: 'solid',
  solidColor: 'black',
  keepOriginal: false,
  minConfidence: 'medium',
};

// Store current config
let currentConfig: AutoRedactionConfig = { ...DEFAULT_AUTO_REDACTION_CONFIG };

// =============================================================================
// Auto-Redaction Service
// =============================================================================

export class AutoRedactionService {
  private tempDir: string | null = null;
  private progressCallback: ((progress: RedactionProgress) => void) | null = null;

  /**
   * Set progress callback for UI updates
   */
  onProgress(callback: (progress: RedactionProgress) => void): void {
    this.progressCallback = callback;
  }

  /**
   * Process a video file and apply automatic PII redaction
   */
  async processVideo(
    videoPath: string,
    config: Partial<AutoRedactionConfig> = {}
  ): Promise<RedactionResult> {
    const startTime = Date.now();
    const fullConfig = { ...currentConfig, ...config };

    if (!fullConfig.enabled) {
      return {
        success: true,
        originalPath: videoPath,
        piiRegionsFound: 0,
        processingTimeMs: Date.now() - startTime,
      };
    }

    console.log(`[AutoRedaction] Processing video: ${videoPath}`);

    // Validate input
    if (!existsSync(videoPath)) {
      return {
        success: false,
        originalPath: videoPath,
        piiRegionsFound: 0,
        processingTimeMs: Date.now() - startTime,
        error: 'Video file not found',
      };
    }

    try {
      // Get video info
      this.reportProgress('extracting', 0, 0, 0, 0, 'Getting video information...');
      const videoInfo = await this.getVideoInfo(videoPath);
      console.log(`[AutoRedaction] Video info: ${videoInfo.duration}s, ${videoInfo.width}x${videoInfo.height}, ${videoInfo.fps} fps`);

      // Create temp directory for frame extraction
      this.tempDir = join(dirname(videoPath), `.redaction_${Date.now()}`);
      await fs.mkdir(this.tempDir, { recursive: true });

      // Calculate frame count
      const totalFrames = Math.ceil(videoInfo.duration / fullConfig.frameInterval);
      console.log(`[AutoRedaction] Will analyze ${totalFrames} frames`);

      // Extract and analyze frames
      this.reportProgress('analyzing', 0, 0, totalFrames, 0, 'Analyzing frames for PII...');
      const framePII = await this.extractAndAnalyzeFrames(
        videoPath,
        videoInfo,
        fullConfig,
        totalFrames
      );

      // Count total PII regions
      const totalPII = framePII.reduce((sum, f) => sum + f.regions.length, 0);
      console.log(`[AutoRedaction] Found ${totalPII} PII regions across ${framePII.length} frames`);

      if (totalPII === 0) {
        // No PII found, no need to redact
        await this.cleanup();
        return {
          success: true,
          originalPath: videoPath,
          piiRegionsFound: 0,
          processingTimeMs: Date.now() - startTime,
        };
      }

      // Apply redaction
      this.reportProgress('redacting', 80, totalFrames, totalFrames, totalPII, 'Applying redaction...');
      const redactedPath = await this.applyRedaction(
        videoPath,
        framePII,
        videoInfo,
        fullConfig
      );

      // Handle original file
      if (!fullConfig.keepOriginal && redactedPath) {
        // Replace original with redacted version
        const backupPath = videoPath.replace(extname(videoPath), '_original' + extname(videoPath));
        await fs.rename(videoPath, backupPath);
        await fs.rename(redactedPath, videoPath);
        // Delete backup
        await fs.unlink(backupPath);
      }

      // Cleanup temp files
      await this.cleanup();

      this.reportProgress('complete', 100, totalFrames, totalFrames, totalPII, 'Redaction complete');

      return {
        success: true,
        originalPath: videoPath,
        redactedPath: fullConfig.keepOriginal ? redactedPath : videoPath,
        piiRegionsFound: totalPII,
        processingTimeMs: Date.now() - startTime,
      };
    } catch (error) {
      console.error('[AutoRedaction] Error processing video:', error);
      await this.cleanup();
      this.reportProgress('error', 0, 0, 0, 0, String(error));

      return {
        success: false,
        originalPath: videoPath,
        piiRegionsFound: 0,
        processingTimeMs: Date.now() - startTime,
        error: String(error),
      };
    }
  }

  /**
   * Get video information using ffprobe
   */
  private async getVideoInfo(videoPath: string): Promise<VideoInfo> {
    return new Promise((resolve, reject) => {
      ffmpeg.ffprobe(videoPath, (err, metadata) => {
        if (err) {
          reject(err);
          return;
        }

        const videoStream = metadata.streams.find(s => s.codec_type === 'video');
        if (!videoStream) {
          reject(new Error('No video stream found'));
          return;
        }

        // Parse framerate
        let fps = 30;
        if (videoStream.r_frame_rate) {
          const [num, den] = videoStream.r_frame_rate.split('/').map(Number);
          fps = den ? num / den : num;
        }

        resolve({
          duration: metadata.format.duration || 0,
          width: videoStream.width || 1920,
          height: videoStream.height || 1080,
          fps,
        });
      });
    });
  }

  /**
   * Extract frames and analyze them for PII
   */
  private async extractAndAnalyzeFrames(
    videoPath: string,
    videoInfo: VideoInfo,
    config: AutoRedactionConfig,
    totalFrames: number
  ): Promise<FramePII[]> {
    const framePII: FramePII[] = [];
    const detector = getTextDetector();
    const piiScanner = getPIIScanner({
      minConfidence: config.minConfidence,
    });

    // Initialize OCR
    await detector.initialize();

    // Extract frames at intervals
    for (let i = 0; i < totalFrames; i++) {
      const timestamp = i * config.frameInterval;
      const framePath = join(this.tempDir!, `frame_${i.toString().padStart(5, '0')}.png`);

      try {
        // Extract frame
        await this.extractFrame(videoPath, timestamp, framePath);

        // Read frame
        const frameBuffer = await fs.readFile(framePath);

        // Run OCR
        const ocrResult = await detector.processFrame(frameBuffer, videoInfo.width, videoInfo.height);

        // Scan for PII
        const piiResult = piiScanner.scanFrame(ocrResult.regions);

        if (piiResult.regions.length > 0) {
          framePII.push({
            timestamp,
            regions: piiResult.regions,
          });
        }

        // Delete frame to save space
        await fs.unlink(framePath).catch(() => {});

        // Report progress
        const progress = Math.round(((i + 1) / totalFrames) * 70); // 0-70% for analysis
        const piiCount = framePII.reduce((sum, f) => sum + f.regions.length, 0);
        this.reportProgress('analyzing', progress, i + 1, totalFrames, piiCount,
          `Analyzed frame ${i + 1}/${totalFrames}`);

      } catch (err) {
        console.warn(`[AutoRedaction] Failed to analyze frame at ${timestamp}s:`, err);
      }
    }

    return framePII;
  }

  /**
   * Extract a single frame from video
   */
  private extractFrame(videoPath: string, timestamp: number, outputPath: string): Promise<void> {
    return new Promise((resolve, reject) => {
      ffmpeg(videoPath)
        .seekInput(timestamp)
        .frames(1)
        .output(outputPath)
        .on('end', () => resolve())
        .on('error', reject)
        .run();
    });
  }

  /**
   * Apply redaction filters using FFmpeg
   */
  private async applyRedaction(
    videoPath: string,
    framePII: FramePII[],
    videoInfo: VideoInfo,
    config: AutoRedactionConfig
  ): Promise<string> {
    const ext = extname(videoPath);
    const redactedPath = videoPath.replace(ext, `_redacted${ext}`);

    // Build FFmpeg filter string
    const filters = this.buildRedactionFilters(framePII, videoInfo, config);

    return new Promise((resolve, reject) => {
      let command = ffmpeg(videoPath);

      // Apply redaction filters
      if (filters) {
        command = command.videoFilters(filters);
      }

      // Output settings - use same codec as input when possible
      command
        .videoCodec('libx264')
        .addOption('-crf', '18')
        .addOption('-preset', 'medium')
        .output(redactedPath)
        .on('progress', (progress) => {
          const percent = progress.percent || 0;
          const reportPercent = 80 + Math.round(percent * 0.2); // 80-100% for encoding
          this.reportProgress('redacting', reportPercent, 0, 0, 0,
            `Encoding: ${Math.round(percent)}%`);
        })
        .on('end', () => resolve(redactedPath))
        .on('error', reject)
        .run();
    });
  }

  /**
   * Build FFmpeg filter string from PII regions
   */
  private buildRedactionFilters(
    framePII: FramePII[],
    videoInfo: VideoInfo,
    config: AutoRedactionConfig
  ): string {
    const filters: string[] = [];

    for (const frame of framePII) {
      // Each region gets a drawbox filter with time-based enable
      const startTime = Math.max(0, frame.timestamp - config.frameInterval / 2);
      const endTime = frame.timestamp + config.frameInterval / 2;

      for (const region of frame.regions) {
        // Skip if not a configured PII type
        const piiType = region.type.startsWith('custom:')
          ? region.type.slice(7)
          : region.type;

        if (!config.piiTypes.includes(piiType) && !config.piiTypes.includes('all')) {
          continue;
        }

        const { x, y, width, height } = region.bounds;

        // Add some padding to the bounding box
        const padding = 5;
        const paddedX = Math.max(0, x - padding);
        const paddedY = Math.max(0, y - padding);
        const paddedW = Math.min(videoInfo.width - paddedX, width + padding * 2);
        const paddedH = Math.min(videoInfo.height - paddedY, height + padding * 2);

        // Time-based enable expression
        const enableExpr = `between(t,${startTime.toFixed(3)},${endTime.toFixed(3)})`;

        // Use drawbox for solid or black overlay (simpler and more reliable)
        const color = config.style === 'solid' ? config.solidColor : 'black';
        filters.push(
          `drawbox=x=${paddedX}:y=${paddedY}:w=${paddedW}:h=${paddedH}:` +
          `color=${color}:t=fill:enable='${enableExpr}'`
        );
      }
    }

    return filters.join(',');
  }

  /**
   * Report progress to callback
   */
  private reportProgress(
    stage: RedactionProgress['stage'],
    progress: number,
    framesAnalyzed: number,
    totalFrames: number,
    piiFound: number,
    message: string
  ): void {
    if (this.progressCallback) {
      this.progressCallback({
        stage,
        progress,
        framesAnalyzed,
        totalFrames,
        piiFound,
        message,
      });
    }
  }

  /**
   * Cleanup temp files
   */
  private async cleanup(): Promise<void> {
    if (this.tempDir && existsSync(this.tempDir)) {
      try {
        const files = await fs.readdir(this.tempDir);
        for (const file of files) {
          await fs.unlink(join(this.tempDir, file)).catch(() => {});
        }
        await fs.rmdir(this.tempDir).catch(() => {});
      } catch {
        // Ignore cleanup errors
      }
      this.tempDir = null;
    }
  }
}

// =============================================================================
// Singleton and Config Management
// =============================================================================

let serviceInstance: AutoRedactionService | null = null;

export function getAutoRedactionService(): AutoRedactionService {
  if (!serviceInstance) {
    serviceInstance = new AutoRedactionService();
  }
  return serviceInstance;
}

export function getAutoRedactionConfig(): AutoRedactionConfig {
  return { ...currentConfig };
}

export function setAutoRedactionConfig(config: Partial<AutoRedactionConfig>): void {
  currentConfig = { ...currentConfig, ...config };
}

export function isAutoRedactionEnabled(): boolean {
  return currentConfig.enabled;
}
