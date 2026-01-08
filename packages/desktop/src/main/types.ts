export interface PrivacyConfig {
  maskInputs: boolean;
  blockSensitive: boolean;
  maskPiiPatterns: boolean;
  customMaskFn?: boolean;
}

export interface SessionRecord {
  id: string;
  name: string;
  timestamp: number;
  duration: number;
  eventCount: number;
  events?: unknown[];
  privacyConfig?: PrivacyConfig | null;
}

export interface SessionStats {
  sessionCount: number;
  totalDuration: number;
  totalEvents: number;
  averageDuration: number;
}

export interface AppSettings {
  theme: 'light' | 'dark' | 'system';
  defaultPrivacy: {
    maskInputs: boolean;
    blockSensitive: boolean;
    maskPiiPatterns: boolean;
  };
  autoImportPath: string | null;
  recordingsPath: string | null;
}

// Video Recording Types
export type SourceType = 'screen' | 'window' | 'tab';
export type RecordingStatus = 'recording' | 'processing' | 'ready' | 'error';

export interface RedactionRegion {
  id: string;
  startTime: number;
  endTime: number;
  bbox: { x: number; y: number; w: number; h: number };
  type: 'auto' | 'manual' | 'app-rule';
  piiType?: string;
  confidence?: number;
  style: 'blur' | 'black' | 'pixelate';
}

export interface RedactionConfig {
  enabled: boolean;
  autoDetectPII: boolean;
  piiTypes: string[];
  appRules: { appName: string; action: 'blur' | 'block' }[];
  regions: RedactionRegion[];
}

export interface VideoRecording {
  id: string;
  filename: string;
  sourceType: SourceType;
  sourceName: string;
  duration: number;
  startTime: number;
  resolution: string;
  fps: number;
  fileSize: number;
  filePath: string;
  thumbnailPath: string | null;
  redactionConfig: RedactionConfig | null;
  status: RecordingStatus;
  createdAt: number;
  updatedAt: number;
}

export interface VideoRecordingStats {
  recordingCount: number;
  totalDuration: number;
  totalSize: number;
  averageDuration: number;
}

export interface ExportOptions {
  format: 'mp4' | 'webm';
  quality: 'low' | 'medium' | 'high';
  resolution: string | null;  // null = original
  includeAudio: boolean;
  applyRedaction: boolean;
}
