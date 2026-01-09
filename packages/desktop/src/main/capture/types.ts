/**
 * Desktop Capture Types
 *
 * Type definitions for the desktop screen capture system.
 */

// =============================================================================
// Capture Sources
// =============================================================================

export interface CaptureSource {
  id: string;
  name: string;
  thumbnail: string; // base64 data URL
  displayId?: string;
  isScreen: boolean;
  isWindow: boolean;
  appIcon?: string; // base64 data URL for window icon
}

// =============================================================================
// Capture Options & Configuration
// =============================================================================

export type CaptureQuality = 'low' | 'medium' | 'high' | 'ultra';

export interface CaptureResolution {
  width: number;
  height: number;
}

export interface CaptureOptions {
  sourceId: string;
  resolution?: CaptureResolution;
  frameRate?: number;
  videoBitrate?: number;
  quality?: CaptureQuality;
  outputDir?: string;
  sessionMetadata?: Record<string, unknown>;
}

export interface QualityPreset {
  frameRate: number;
  resolution: CaptureResolution;
  videoBitrate: number;
}

export const QUALITY_PRESETS: Record<CaptureQuality, QualityPreset> = {
  low: {
    frameRate: 15,
    resolution: { width: 1280, height: 720 },
    videoBitrate: 1500000 // 1.5 Mbps
  },
  medium: {
    frameRate: 24,
    resolution: { width: 1920, height: 1080 },
    videoBitrate: 2500000 // 2.5 Mbps
  },
  high: {
    frameRate: 30,
    resolution: { width: 1920, height: 1080 },
    videoBitrate: 4000000 // 4 Mbps
  },
  ultra: {
    frameRate: 30,
    resolution: { width: 0, height: 0 }, // Native resolution
    videoBitrate: 6000000 // 6 Mbps
  }
};

// =============================================================================
// Capture State & Results
// =============================================================================

export type CaptureStatus = 'idle' | 'starting' | 'recording' | 'paused' | 'stopping' | 'stopped' | 'error';

export interface CaptureState {
  sessionId: string;
  sourceId: string;
  sourceName: string;
  status: CaptureStatus;
  startTime: number;
  pausedTime: number; // Total time paused
  filePath: string;
  tempDir: string;
  chunkCount: number;
  options: CaptureOptions;
  error?: string;
}

export interface CaptureResult {
  sessionId: string;
  filePath: string;
  duration: number; // milliseconds
  fileSize: number; // bytes
  resolution: CaptureResolution;
  frameRate: number;
  chunksMerged: number;
}

export interface CaptureChunk {
  sessionId: string;
  index: number;
  data: ArrayBuffer;
  timestamp: number;
  duration: number;
}

// =============================================================================
// Capture Events
// =============================================================================

export interface CaptureStartedEvent {
  sessionId: string;
  sourceId: string;
  sourceName: string;
  startTime: number;
}

export interface CaptureStoppedEvent {
  sessionId: string;
  result: CaptureResult;
}

export interface CapturePausedEvent {
  sessionId: string;
  pauseTime: number;
}

export interface CaptureResumedEvent {
  sessionId: string;
  resumeTime: number;
}

export interface CaptureErrorEvent {
  sessionId: string;
  error: string;
  recoverable: boolean;
}

export interface CaptureProgressEvent {
  sessionId: string;
  duration: number;
  chunkCount: number;
  fileSize: number;
}

// =============================================================================
// IPC Channel Types
// =============================================================================

export const CAPTURE_IPC_CHANNELS = {
  GET_SOURCES: 'capture:getSources',
  START: 'capture:start',
  STOP: 'capture:stop',
  PAUSE: 'capture:pause',
  RESUME: 'capture:resume',
  GET_STATE: 'capture:getState',
  GET_ACTIVE: 'capture:getActive',
  CHUNK: 'capture:chunk',
  ERROR: 'capture:error',
  PROGRESS: 'capture:progress',
  STARTED: 'capture:started',
  STOPPED: 'capture:stopped',
  PAUSED: 'capture:paused',
  RESUMED: 'capture:resumed'
} as const;

// =============================================================================
// Renderer → Main Commands
// =============================================================================

export interface StartCaptureCommand {
  sourceId: string;
  options?: Partial<CaptureOptions>;
}

export interface StopCaptureCommand {
  sessionId: string;
}

// =============================================================================
// Main → Renderer Commands
// =============================================================================

export interface RequestMediaStreamCommand {
  sessionId: string;
  sourceId: string;
  constraints: MediaStreamConstraints;
}

export interface StopMediaStreamCommand {
  sessionId: string;
}
