/**
 * Redaction Module - IPC Handlers
 *
 * Provides redaction services for both real-time and post-processing modes:
 * - Real-time: Apply redactions to frames during recording/preview
 * - Post-process: Apply redactions to recorded videos using FFmpeg
 */

import { ipcMain, dialog } from 'electron';
import { existsSync } from 'fs';
import { join } from 'path';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';
import { getRedactionRenderer, terminateRedactionRenderer } from './renderer';
import type { RedactionConfig, RedactionRegion, RedactionStyle } from './renderer';
import type { PIIRegion } from '../ocr/piiScanner';
import type { TextBounds } from '../ocr/types';
import { getRecordingsPath, getThumbnailsPath } from '../database';
import { getManualRedactionManager, terminateManualRedactionManager } from './manualRedaction';
import type {
  ManualRegion,
  AppBlockRule,
  RedactionProfile,
  RedactionSession,
  TimelineEvent,
  DetectedWindow,
} from './types';

// Set ffmpeg path
ffmpeg.setFfmpegPath(ffmpegInstaller.path);

// ============================================================================
// Types
// ============================================================================

export interface RedactionMask {
  /** Unique ID for the mask */
  id: string;
  /** Recording ID this mask belongs to */
  recordingId: string;
  /** Start timestamp in ms */
  startTime: number;
  /** End timestamp in ms */
  endTime: number;
  /** List of regions to redact */
  regions: RedactionMaskRegion[];
  /** Creation timestamp */
  createdAt: number;
}

export interface RedactionMaskRegion {
  /** Bounding box */
  bounds: TextBounds;
  /** Redaction style */
  style: RedactionStyle;
  /** PII type (for auto-detected regions) */
  piiType?: string;
  /** Confidence level */
  confidence?: 'high' | 'medium' | 'low';
  /** Color for solid/pattern styles */
  color?: string;
}

export interface RedactionMode {
  /** Mode: real-time applies during recording, post-process after */
  mode: 'realtime' | 'postprocess';
  /** Whether redaction is enabled */
  enabled: boolean;
  /** Default style for new redactions */
  defaultStyle: RedactionStyle;
  /** Auto-detect PII */
  autoDetectPII: boolean;
  /** Which PII types to detect */
  piiTypes: string[];
}

export interface ApplyRedactionOptions {
  /** Input video path */
  inputPath: string;
  /** Output video path (optional, defaults to temp file) */
  outputPath?: string;
  /** Redaction masks to apply */
  masks: RedactionMask[];
  /** Video codec */
  codec?: 'h264' | 'vp9';
  /** Quality (CRF value) */
  quality?: number;
}

// ============================================================================
// Default Configuration
// ============================================================================

const DEFAULT_REDACTION_MODE: RedactionMode = {
  mode: 'postprocess',
  enabled: true,
  defaultStyle: 'blur',
  autoDetectPII: true,
  piiTypes: ['ssn', 'creditCard', 'email', 'phone', 'apiKey'],
};

// In-memory storage for masks (could be persisted to DB)
const redactionMasks: Map<string, RedactionMask[]> = new Map();
let currentMode: RedactionMode = { ...DEFAULT_REDACTION_MODE };

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Convert PII regions to redaction mask regions
 */
function piiToMaskRegions(
  piiRegions: PIIRegion[],
  style: RedactionStyle = 'blur'
): RedactionMaskRegion[] {
  return piiRegions.map(pii => ({
    bounds: pii.bounds,
    style,
    piiType: pii.type,
    confidence: pii.confidence,
    color: pii.color,
  }));
}

/**
 * Generate FFmpeg filter string for redaction regions
 */
function generateFFmpegFilters(
  masks: RedactionMask[],
  fps: number = 30
): string {
  const filters: string[] = [];

  for (const mask of masks) {
    const startSec = mask.startTime / 1000;
    const endSec = mask.endTime / 1000;

    for (const region of mask.regions) {
      const { x, y, width, height } = region.bounds;
      const enableExpr = `between(t,${startSec},${endSec})`;

      switch (region.style) {
        case 'blur':
          // Use box blur filter
          filters.push(
            `split[main][blur];` +
            `[blur]crop=${width}:${height}:${x}:${y},boxblur=10:10[blurred];` +
            `[main][blurred]overlay=${x}:${y}:enable='${enableExpr}'`
          );
          break;

        case 'pixelate':
          // Scale down and up for pixelation effect
          const pixelSize = 8;
          filters.push(
            `split[main][pix];` +
            `[pix]crop=${width}:${height}:${x}:${y},` +
            `scale=iw/${pixelSize}:ih/${pixelSize}:flags=neighbor,` +
            `scale=${width}:${height}:flags=neighbor[pixelated];` +
            `[main][pixelated]overlay=${x}:${y}:enable='${enableExpr}'`
          );
          break;

        case 'solid':
          // Draw filled box
          const color = region.color || 'black';
          filters.push(
            `drawbox=x=${x}:y=${y}:w=${width}:h=${height}:` +
            `color=${color}:t=fill:enable='${enableExpr}'`
          );
          break;

        case 'pattern':
          // Crosshatch pattern using multiple drawbox calls
          const patternColor = region.color || '#333333';
          filters.push(
            `drawbox=x=${x}:y=${y}:w=${width}:h=${height}:` +
            `color=black:t=fill:enable='${enableExpr}'`
          );
          // Add diagonal lines (simplified - full pattern would need more complex filter)
          break;
      }
    }
  }

  // For multiple regions, we need to chain the filters properly
  // Simplify by using drawbox for most cases
  if (filters.length > 0) {
    // Combine filters more efficiently
    const combinedFilters: string[] = [];

    for (const mask of masks) {
      const startSec = mask.startTime / 1000;
      const endSec = mask.endTime / 1000;

      for (const region of mask.regions) {
        const { x, y, width, height } = region.bounds;
        const enableExpr = `between(t,${startSec.toFixed(3)},${endSec.toFixed(3)})`;

        if (region.style === 'blur') {
          // For blur, we'll use a simpler approach with avgblur on the region
          combinedFilters.push(
            `drawbox=x=${x}:y=${y}:w=${width}:h=${height}:` +
            `color=black@0.8:t=fill:enable='${enableExpr}'`
          );
        } else if (region.style === 'solid') {
          const color = region.color?.replace('#', '0x') || 'black';
          combinedFilters.push(
            `drawbox=x=${x}:y=${y}:w=${width}:h=${height}:` +
            `color=${color}:t=fill:enable='${enableExpr}'`
          );
        } else {
          // Default to black box for other styles
          combinedFilters.push(
            `drawbox=x=${x}:y=${y}:w=${width}:h=${height}:` +
            `color=black:t=fill:enable='${enableExpr}'`
          );
        }
      }
    }

    return combinedFilters.join(',');
  }

  return '';
}

// ============================================================================
// IPC Handlers
// ============================================================================

export function setupRedactionHandlers(): void {
  const renderer = getRedactionRenderer();

  // -------------------------------------------------------------------------
  // Configuration
  // -------------------------------------------------------------------------

  /**
   * Get current redaction mode/config
   */
  ipcMain.handle('redaction:getMode', (): RedactionMode => {
    return { ...currentMode };
  });

  /**
   * Set redaction mode/config
   */
  ipcMain.handle('redaction:setMode', (_, mode: Partial<RedactionMode>): void => {
    currentMode = { ...currentMode, ...mode };
  });

  /**
   * Get renderer configuration
   */
  ipcMain.handle('redaction:getConfig', (): RedactionConfig => {
    return renderer.getConfig();
  });

  /**
   * Set renderer configuration
   */
  ipcMain.handle('redaction:setConfig', (_, config: Partial<RedactionConfig>): void => {
    renderer.setConfig(config);
  });

  // -------------------------------------------------------------------------
  // Real-time Redaction (ImageData processing)
  // -------------------------------------------------------------------------

  /**
   * Apply redactions to an image frame (for real-time preview)
   */
  ipcMain.handle('redaction:applyToFrame', (
    _,
    imageDataArray: Uint8ClampedArray,
    width: number,
    height: number,
    regions: RedactionRegion[]
  ): Uint8ClampedArray => {
    const imageData = new ImageData(new Uint8ClampedArray(imageDataArray), width, height);
    const result = renderer.applyRedactions(imageData, regions);
    return result.data;
  });

  /**
   * Apply redactions from PII regions
   */
  ipcMain.handle('redaction:applyFromPII', (
    _,
    imageDataArray: Uint8ClampedArray,
    width: number,
    height: number,
    piiRegions: PIIRegion[]
  ): Uint8ClampedArray => {
    const imageData = new ImageData(new Uint8ClampedArray(imageDataArray), width, height);

    // Convert PII regions to redaction regions
    const redactionRegions: RedactionRegion[] = piiRegions.map(pii => ({
      bounds: pii.bounds,
      style: currentMode.defaultStyle,
      color: pii.color,
    }));

    const result = renderer.applyRedactions(imageData, redactionRegions);
    return result.data;
  });

  // -------------------------------------------------------------------------
  // Redaction Masks (Post-process mode)
  // -------------------------------------------------------------------------

  /**
   * Create a new redaction mask for a recording
   */
  ipcMain.handle('redaction:createMask', (
    _,
    recordingId: string,
    startTime: number,
    endTime: number,
    regions: RedactionMaskRegion[]
  ): RedactionMask => {
    const mask: RedactionMask = {
      id: `mask-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      recordingId,
      startTime,
      endTime,
      regions,
      createdAt: Date.now(),
    };

    // Store mask
    const existingMasks = redactionMasks.get(recordingId) || [];
    existingMasks.push(mask);
    redactionMasks.set(recordingId, existingMasks);

    return mask;
  });

  /**
   * Create mask from PII scan results
   */
  ipcMain.handle('redaction:createMaskFromPII', (
    _,
    recordingId: string,
    startTime: number,
    endTime: number,
    piiRegions: PIIRegion[]
  ): RedactionMask => {
    const maskRegions = piiToMaskRegions(piiRegions, currentMode.defaultStyle);

    const mask: RedactionMask = {
      id: `mask-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      recordingId,
      startTime,
      endTime,
      regions: maskRegions,
      createdAt: Date.now(),
    };

    const existingMasks = redactionMasks.get(recordingId) || [];
    existingMasks.push(mask);
    redactionMasks.set(recordingId, existingMasks);

    return mask;
  });

  /**
   * Get all masks for a recording
   */
  ipcMain.handle('redaction:getMasks', (_, recordingId: string): RedactionMask[] => {
    return redactionMasks.get(recordingId) || [];
  });

  /**
   * Update a mask
   */
  ipcMain.handle('redaction:updateMask', (
    _,
    recordingId: string,
    maskId: string,
    updates: Partial<Omit<RedactionMask, 'id' | 'recordingId' | 'createdAt'>>
  ): boolean => {
    const masks = redactionMasks.get(recordingId);
    if (!masks) return false;

    const index = masks.findIndex(m => m.id === maskId);
    if (index === -1) return false;

    masks[index] = { ...masks[index], ...updates };
    return true;
  });

  /**
   * Delete a mask
   */
  ipcMain.handle('redaction:deleteMask', (_, recordingId: string, maskId: string): boolean => {
    const masks = redactionMasks.get(recordingId);
    if (!masks) return false;

    const index = masks.findIndex(m => m.id === maskId);
    if (index === -1) return false;

    masks.splice(index, 1);
    return true;
  });

  /**
   * Clear all masks for a recording
   */
  ipcMain.handle('redaction:clearMasks', (_, recordingId: string): void => {
    redactionMasks.delete(recordingId);
  });

  // -------------------------------------------------------------------------
  // Video Processing (Apply redactions to video files)
  // -------------------------------------------------------------------------

  /**
   * Apply redaction masks to a video file
   */
  ipcMain.handle('redaction:applyToVideo', async (
    _,
    options: ApplyRedactionOptions
  ): Promise<{ success: boolean; outputPath?: string; error?: string }> => {
    try {
      const { inputPath, masks, codec = 'h264', quality = 23 } = options;

      if (!existsSync(inputPath)) {
        return { success: false, error: 'Input file not found' };
      }

      // Generate output path if not provided
      const outputPath = options.outputPath ||
        join(getRecordingsPath(), `redacted_${Date.now()}.mp4`);

      // Generate FFmpeg filters
      const filterString = generateFFmpegFilters(masks);

      return new Promise((resolve) => {
        let command = ffmpeg(inputPath);

        // Set codec and quality
        if (codec === 'h264') {
          command = command
            .videoCodec('libx264')
            .addOption('-crf', quality.toString())
            .addOption('-preset', 'medium');
        } else {
          command = command
            .videoCodec('libvpx-vp9')
            .addOption('-crf', quality.toString())
            .addOption('-b:v', '0');
        }

        // Apply redaction filters
        if (filterString) {
          command = command.videoFilters(filterString);
        }

        command
          .output(outputPath)
          .on('end', () => {
            resolve({ success: true, outputPath });
          })
          .on('error', (err) => {
            console.error('[Redaction] FFmpeg error:', err);
            resolve({ success: false, error: err.message });
          })
          .run();
      });
    } catch (error) {
      console.error('[Redaction] Apply to video error:', error);
      return { success: false, error: String(error) };
    }
  });

  /**
   * Preview redaction on a single frame (extract and process)
   */
  ipcMain.handle('redaction:previewFrame', async (
    _,
    videoPath: string,
    timestamp: number, // in milliseconds
    masks: RedactionMask[]
  ): Promise<{ success: boolean; imageData?: Uint8ClampedArray; width?: number; height?: number; error?: string }> => {
    try {
      if (!existsSync(videoPath)) {
        return { success: false, error: 'Video file not found' };
      }

      const tempPath = join(getThumbnailsPath(), `preview_${Date.now()}.png`);
      const seekTime = timestamp / 1000;

      // Extract frame
      await new Promise<void>((resolve, reject) => {
        ffmpeg(videoPath)
          .seekInput(seekTime)
          .frames(1)
          .output(tempPath)
          .on('end', () => resolve())
          .on('error', reject)
          .run();
      });

      // Note: Reading and processing the image would require additional
      // image processing library (sharp, jimp, etc.)
      // For now, return success with path
      return {
        success: true,
        // In a full implementation, we'd read the image, apply redactions,
        // and return the processed ImageData
      };
    } catch (error) {
      console.error('[Redaction] Preview frame error:', error);
      return { success: false, error: String(error) };
    }
  });

  // -------------------------------------------------------------------------
  // Manual Redaction - Sessions
  // -------------------------------------------------------------------------

  const manualManager = getManualRedactionManager();

  /**
   * Create a new redaction session for a recording
   */
  ipcMain.handle('manual:createSession', (
    _,
    recordingId: string,
    duration: number,
    dimensions: { width: number; height: number }
  ): RedactionSession => {
    return manualManager.createSession(recordingId, duration, dimensions);
  });

  /**
   * Get or load a redaction session
   */
  ipcMain.handle('manual:getSession', (_, recordingId: string): RedactionSession | null => {
    return manualManager.loadSession(recordingId);
  });

  /**
   * Save a redaction session
   */
  ipcMain.handle('manual:saveSession', (_, recordingId: string): boolean => {
    return manualManager.saveSession(recordingId);
  });

  /**
   * Delete a redaction session
   */
  ipcMain.handle('manual:deleteSession', (_, recordingId: string): boolean => {
    return manualManager.deleteSession(recordingId);
  });

  // -------------------------------------------------------------------------
  // Manual Redaction - Regions
  // -------------------------------------------------------------------------

  /**
   * Add a manual redaction region
   */
  ipcMain.handle('manual:addRegion', (
    _,
    recordingId: string,
    region: Omit<ManualRegion, 'id' | 'createdAt'>
  ): ManualRegion | null => {
    return manualManager.addRegion(recordingId, region);
  });

  /**
   * Update a manual redaction region
   */
  ipcMain.handle('manual:updateRegion', (
    _,
    recordingId: string,
    regionId: string,
    updates: Partial<ManualRegion>
  ): boolean => {
    return manualManager.updateRegion(recordingId, regionId, updates);
  });

  /**
   * Delete a manual redaction region
   */
  ipcMain.handle('manual:deleteRegion', (_, recordingId: string, regionId: string): boolean => {
    return manualManager.deleteRegion(recordingId, regionId);
  });

  /**
   * Get regions active at a specific time
   */
  ipcMain.handle('manual:getRegionsAtTime', (_, recordingId: string, time: number): ManualRegion[] => {
    return manualManager.getRegionsAtTime(recordingId, time);
  });

  // -------------------------------------------------------------------------
  // Manual Redaction - App Block Rules
  // -------------------------------------------------------------------------

  /**
   * Get all app blocking rules
   */
  ipcMain.handle('manual:getAppBlockRules', (): AppBlockRule[] => {
    return manualManager.getAppBlockRules();
  });

  /**
   * Add an app blocking rule
   */
  ipcMain.handle('manual:addAppBlockRule', (
    _,
    rule: Omit<AppBlockRule, 'id' | 'createdAt'>
  ): AppBlockRule => {
    return manualManager.addAppBlockRule(rule);
  });

  /**
   * Update an app blocking rule
   */
  ipcMain.handle('manual:updateAppBlockRule', (
    _,
    id: string,
    updates: Partial<AppBlockRule>
  ): boolean => {
    return manualManager.updateAppBlockRule(id, updates);
  });

  /**
   * Delete an app blocking rule
   */
  ipcMain.handle('manual:deleteAppBlockRule', (_, id: string): boolean => {
    return manualManager.deleteAppBlockRule(id);
  });

  /**
   * Check if a window matches any blocking rule
   */
  ipcMain.handle('manual:matchWindowToRules', (_, window: DetectedWindow): AppBlockRule | null => {
    return manualManager.matchWindowToRules(window);
  });

  // -------------------------------------------------------------------------
  // Manual Redaction - Timeline
  // -------------------------------------------------------------------------

  /**
   * Add a timeline event
   */
  ipcMain.handle('manual:addTimelineEvent', (
    _,
    recordingId: string,
    trackId: string,
    event: Omit<TimelineEvent, 'id'>
  ): TimelineEvent | null => {
    return manualManager.addTimelineEvent(recordingId, trackId, event);
  });

  /**
   * Update a timeline event
   */
  ipcMain.handle('manual:updateTimelineEvent', (
    _,
    recordingId: string,
    trackId: string,
    eventId: string,
    updates: Partial<TimelineEvent>
  ): boolean => {
    return manualManager.updateTimelineEvent(recordingId, trackId, eventId, updates);
  });

  /**
   * Delete a timeline event
   */
  ipcMain.handle('manual:deleteTimelineEvent', (
    _,
    recordingId: string,
    trackId: string,
    eventId: string
  ): boolean => {
    return manualManager.deleteTimelineEvent(recordingId, trackId, eventId);
  });

  // -------------------------------------------------------------------------
  // Manual Redaction - Profiles
  // -------------------------------------------------------------------------

  /**
   * Get all saved profiles
   */
  ipcMain.handle('manual:getProfiles', (): RedactionProfile[] => {
    return manualManager.getProfiles();
  });

  /**
   * Get a specific profile
   */
  ipcMain.handle('manual:getProfile', (_, id: string): RedactionProfile | null => {
    return manualManager.getProfile(id);
  });

  /**
   * Create a new profile
   */
  ipcMain.handle('manual:createProfile', (
    _,
    profile: Omit<RedactionProfile, 'id' | 'version' | 'createdAt' | 'updatedAt'>
  ): RedactionProfile => {
    return manualManager.createProfile(profile);
  });

  /**
   * Update a profile
   */
  ipcMain.handle('manual:updateProfile', (_, id: string, updates: Partial<RedactionProfile>): boolean => {
    return manualManager.updateProfile(id, updates);
  });

  /**
   * Delete a profile
   */
  ipcMain.handle('manual:deleteProfile', (_, id: string): boolean => {
    return manualManager.deleteProfile(id);
  });

  /**
   * Export a profile to file
   */
  ipcMain.handle('manual:exportProfile', async (_, id: string): Promise<boolean> => {
    const profile = manualManager.getProfile(id);
    if (!profile) return false;

    const result = await dialog.showSaveDialog({
      defaultPath: `${profile.name.replace(/\s+/g, '-')}.json`,
      filters: [{ name: 'Redaction Profile', extensions: ['json'] }],
    });

    if (result.canceled || !result.filePath) return false;

    return manualManager.exportProfile(id, result.filePath);
  });

  /**
   * Import a profile from file
   */
  ipcMain.handle('manual:importProfile', async (): Promise<RedactionProfile | null> => {
    const result = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters: [{ name: 'Redaction Profile', extensions: ['json'] }],
    });

    if (result.canceled || !result.filePaths.length) return null;

    return manualManager.importProfile(result.filePaths[0]);
  });

  /**
   * Apply a profile to a session
   */
  ipcMain.handle('manual:applyProfile', (_, recordingId: string, profileId: string): boolean => {
    return manualManager.applyProfile(recordingId, profileId);
  });

  // -------------------------------------------------------------------------
  // Cleanup
  // -------------------------------------------------------------------------

  /**
   * Terminate redaction services
   */
  ipcMain.handle('redaction:terminate', (): void => {
    terminateRedactionRenderer();
    terminateManualRedactionManager();
    redactionMasks.clear();
  });
}
