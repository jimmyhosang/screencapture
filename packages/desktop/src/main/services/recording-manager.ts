/**
 * Recording Manager Service
 *
 * Orchestrates CCaaS events to screen recordings.
 * Handles multiple simultaneous recordings, auto-recovery, and cleanup.
 */

import { app, ipcMain } from 'electron';
import { join } from 'path';
import { existsSync, mkdirSync, writeFileSync, readFileSync, unlinkSync } from 'fs';
import {
  getScreenRecorder,
  resetScreenRecorder,
  SourceInfo,
  RecordingOptions,
  RecordingResult,
  RecordingState
} from './screen-recorder';
import { getCallStateManager } from '../ccaas/call-state';
import { getActiveWindowTracker } from '../tracking';
import { getDatabase, getRecordingsPath } from '../database';
import type { VideoRecording } from '../types';

// =============================================================================
// Types
// =============================================================================

export interface ManagedRecording {
  recordingId: string;
  callId: string;
  agentId: string;
  sourceId: string;
  startTime: Date;
  status: 'active' | 'stopping' | 'stopped' | 'error';
  errorMessage?: string;
  result?: RecordingResult;
}

export interface RecordingManagerConfig {
  defaultResolution: { width: number; height: number };
  defaultFrameRate: number;
  maxDuration: number; // milliseconds
  autoSelectSource: boolean; // Auto-select primary display
  retryOnCrash: boolean;
  maxRetries: number;
}

const DEFAULT_CONFIG: RecordingManagerConfig = {
  defaultResolution: { width: 1920, height: 1080 },
  defaultFrameRate: 15,
  maxDuration: 2 * 60 * 60 * 1000, // 2 hours
  autoSelectSource: true,
  retryOnCrash: true,
  maxRetries: 3
};

// =============================================================================
// RecordingManager Class
// =============================================================================

export class RecordingManager {
  private config: RecordingManagerConfig;
  private managedRecordings: Map<string, ManagedRecording> = new Map();
  private callToRecording: Map<string, string> = new Map(); // callId -> recordingId
  private retryCount: Map<string, number> = new Map();
  private isShuttingDown = false;

  constructor(config: Partial<RecordingManagerConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.setupEventHandlers();
    this.setupIpcHandlers();
  }

  /**
   * Start recording for a CCaaS call
   */
  async startRecordingForCall(
    callId: string,
    agentId: string,
    sourceId?: string
  ): Promise<string | null> {
    // Check if already recording this call
    if (this.callToRecording.has(callId)) {
      console.log(`[RecordingManager] Already recording call ${callId}`);
      return this.callToRecording.get(callId) || null;
    }

    const recorder = getScreenRecorder();

    // Auto-select source if not provided
    let selectedSourceId = sourceId;
    if (!selectedSourceId && this.config.autoSelectSource) {
      const sources = await recorder.getSources();
      const primaryScreen = sources.find(
        (s) => s.type === 'screen' && s.name.toLowerCase().includes('entire screen')
      );
      selectedSourceId = primaryScreen?.id || sources.find((s) => s.type === 'screen')?.id;
    }

    if (!selectedSourceId) {
      console.error(`[RecordingManager] No source available for recording`);
      return null;
    }

    try {
      const options: RecordingOptions = {
        sourceId: selectedSourceId,
        callId,
        agentId,
        resolution: this.config.defaultResolution,
        frameRate: this.config.defaultFrameRate,
        maxDuration: this.config.maxDuration
      };

      const recordingId = await recorder.startRecording(options);

      // Track managed recording
      const managed: ManagedRecording = {
        recordingId,
        callId,
        agentId,
        sourceId: selectedSourceId,
        startTime: new Date(),
        status: 'active'
      };

      this.managedRecordings.set(recordingId, managed);
      this.callToRecording.set(callId, recordingId);
      this.retryCount.set(recordingId, 0);

      // Update call state with recording ID
      const callStateManager = getCallStateManager();
      callStateManager.setRecordingSession(callId, recordingId);

      // Start window tracking for this recording
      const windowTracker = getActiveWindowTracker();
      windowTracker.start(recordingId);

      console.log(`[RecordingManager] Started recording ${recordingId} for call ${callId}`);

      return recordingId;
    } catch (error) {
      console.error(`[RecordingManager] Failed to start recording for call ${callId}:`, error);
      return null;
    }
  }

  /**
   * Stop recording for a CCaaS call
   */
  async stopRecordingForCall(callId: string): Promise<RecordingResult | null> {
    const recordingId = this.callToRecording.get(callId);
    if (!recordingId) {
      console.log(`[RecordingManager] No recording found for call ${callId}`);
      return null;
    }

    return this.stopRecording(recordingId);
  }

  /**
   * Stop a specific recording
   */
  async stopRecording(recordingId: string): Promise<RecordingResult | null> {
    const managed = this.managedRecordings.get(recordingId);
    if (!managed) {
      console.log(`[RecordingManager] Recording ${recordingId} not managed`);
      return null;
    }

    if (managed.status !== 'active') {
      console.log(`[RecordingManager] Recording ${recordingId} is not active (${managed.status})`);
      return managed.result || null;
    }

    managed.status = 'stopping';

    try {
      // Stop window tracking and save logs
      const windowTracker = getActiveWindowTracker();
      if (windowTracker.isTracking() && windowTracker.getRecordingId() === recordingId) {
        windowTracker.stop(); // This saves to database automatically
      }

      const recorder = getScreenRecorder();
      const result = await recorder.stopRecording(recordingId);

      managed.status = 'stopped';
      managed.result = result;

      // Save to database
      await this.saveRecordingToDatabase(managed, result);

      // Cleanup maps
      this.callToRecording.delete(managed.callId);
      this.retryCount.delete(recordingId);

      console.log(`[RecordingManager] Stopped recording ${recordingId}`);

      return result;
    } catch (error) {
      managed.status = 'error';
      managed.errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error(`[RecordingManager] Error stopping recording ${recordingId}:`, error);

      // Try to recover if possible
      if (this.config.retryOnCrash) {
        await this.handleRecordingError(recordingId, error);
      }

      return null;
    }
  }

  /**
   * Get recording status for a call
   */
  getRecordingForCall(callId: string): ManagedRecording | null {
    const recordingId = this.callToRecording.get(callId);
    if (!recordingId) return null;
    return this.managedRecordings.get(recordingId) || null;
  }

  /**
   * Get all active recordings
   */
  getActiveRecordings(): ManagedRecording[] {
    return Array.from(this.managedRecordings.values()).filter((r) => r.status === 'active');
  }

  /**
   * Get available recording sources
   */
  async getSources(): Promise<SourceInfo[]> {
    const recorder = getScreenRecorder();
    return recorder.getSources();
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<RecordingManagerConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Get current configuration
   */
  getConfig(): RecordingManagerConfig {
    return { ...this.config };
  }

  /**
   * Shutdown and cleanup
   */
  async shutdown(): Promise<void> {
    this.isShuttingDown = true;
    console.log('[RecordingManager] Shutting down...');

    // Stop all active recordings
    const activeRecordings = this.getActiveRecordings();
    await Promise.all(
      activeRecordings.map((r) => this.stopRecording(r.recordingId).catch(console.error))
    );

    // Reset screen recorder
    resetScreenRecorder();

    console.log('[RecordingManager] Shutdown complete');
  }

  // =============================================================================
  // Private Methods
  // =============================================================================

  private setupEventHandlers(): void {
    // Listen for CCaaS call events
    const callStateManager = getCallStateManager();

    callStateManager.on('call:started', async (callState) => {
      console.log(`[RecordingManager] Call started: ${callState.callId}`);
      // Recording is triggered by CCaaS event handlers, not here
    });

    callStateManager.on('call:ended', async (callState) => {
      console.log(`[RecordingManager] Call ended: ${callState.callId}`);
      // Stop recording if active
      if (this.callToRecording.has(callState.callId)) {
        await this.stopRecordingForCall(callState.callId);
      }
    });

    callStateManager.on('call:cleared', async (callState) => {
      // Force stop if recording is still active during clear
      if (this.callToRecording.has(callState.callId)) {
        await this.stopRecordingForCall(callState.callId);
      }
    });

    // App quit handler
    app.on('before-quit', async () => {
      await this.shutdown();
    });
  }

  private setupIpcHandlers(): void {
    // Get available sources
    ipcMain.handle('recordingManager:getSources', async () => {
      return this.getSources();
    });

    // Start recording for call
    ipcMain.handle(
      'recordingManager:startForCall',
      async (_, callId: string, agentId: string, sourceId?: string) => {
        return this.startRecordingForCall(callId, agentId, sourceId);
      }
    );

    // Stop recording for call
    ipcMain.handle('recordingManager:stopForCall', async (_, callId: string) => {
      return this.stopRecordingForCall(callId);
    });

    // Get recording for call
    ipcMain.handle('recordingManager:getForCall', (_, callId: string) => {
      return this.getRecordingForCall(callId);
    });

    // Get all active recordings
    ipcMain.handle('recordingManager:getActive', () => {
      return this.getActiveRecordings();
    });

    // Get config
    ipcMain.handle('recordingManager:getConfig', () => {
      return this.getConfig();
    });

    // Update config
    ipcMain.handle('recordingManager:updateConfig', (_, config: Partial<RecordingManagerConfig>) => {
      this.updateConfig(config);
      return this.getConfig();
    });
  }

  private async saveRecordingToDatabase(
    managed: ManagedRecording,
    result: RecordingResult
  ): Promise<void> {
    try {
      const db = getDatabase();

      const recording: VideoRecording = {
        id: result.recordingId,
        filename: `${result.recordingId}.webm`,
        sourceType: 'screen',
        sourceName: `CCaaS Call ${managed.callId}`,
        duration: result.duration,
        startTime: managed.startTime.getTime(),
        resolution: `${this.config.defaultResolution.width}x${this.config.defaultResolution.height}`,
        fps: this.config.defaultFrameRate,
        fileSize: result.fileSize,
        filePath: result.filePath,
        thumbnailPath: null,
        redactionConfig: null,
        status: 'ready',
        createdAt: Date.now(),
        updatedAt: Date.now()
      };

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

      // Save call metadata as JSON sidecar
      const metadataPath = result.filePath.replace('.webm', '_metadata.json');
      const metadata = {
        recordingId: result.recordingId,
        callId: managed.callId,
        agentId: managed.agentId,
        startTime: managed.startTime.toISOString(),
        duration: result.duration,
        chunks: result.chunks,
        windowActivityPath: result.windowActivityPath
      };
      writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));

      console.log(`[RecordingManager] Saved recording to database: ${result.recordingId}`);
    } catch (error) {
      console.error(`[RecordingManager] Error saving recording to database:`, error);
    }
  }

  private async handleRecordingError(recordingId: string, error: unknown): Promise<void> {
    const managed = this.managedRecordings.get(recordingId);
    if (!managed || this.isShuttingDown) return;

    const retries = this.retryCount.get(recordingId) || 0;
    if (retries >= this.config.maxRetries) {
      console.error(
        `[RecordingManager] Max retries reached for ${recordingId}, giving up`
      );
      return;
    }

    console.log(`[RecordingManager] Attempting recovery for ${recordingId} (retry ${retries + 1})`);

    this.retryCount.set(recordingId, retries + 1);

    // Remove old mapping
    this.callToRecording.delete(managed.callId);
    this.managedRecordings.delete(recordingId);

    // Try to restart recording
    try {
      await this.startRecordingForCall(managed.callId, managed.agentId, managed.sourceId);
    } catch (retryError) {
      console.error(`[RecordingManager] Recovery failed for ${recordingId}:`, retryError);
    }
  }
}

// =============================================================================
// Singleton and Setup
// =============================================================================

let recordingManager: RecordingManager | null = null;

export function getRecordingManager(): RecordingManager {
  if (!recordingManager) {
    recordingManager = new RecordingManager();
  }
  return recordingManager;
}

export function setupRecordingManagerHandlers(): void {
  // Initialize manager (this also sets up IPC handlers)
  getRecordingManager();
  console.log('[RecordingManager] Handlers registered');
}

export async function shutdownRecordingManager(): Promise<void> {
  if (recordingManager) {
    await recordingManager.shutdown();
    recordingManager = null;
  }
}
