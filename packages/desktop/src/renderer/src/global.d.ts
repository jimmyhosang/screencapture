/**
 * Global type declarations for window.api exposed by Electron preload script.
 * Hand-written subset covering the surface the renderer actually calls.
 * The full Api type lives in preload/index.ts; we keep this shim isolated
 * from main-process imports to avoid pulling unrelated TS errors into the
 * renderer typecheck.
 */

interface CaptureSource {
  id: string;
  name: string;
  thumbnail: string;
  isScreen: boolean;
  isWindow: boolean;
}

interface AutoRedactionConfig {
  enabled: boolean;
  frameInterval: number;
  piiTypes: string[];
  style: 'blur' | 'solid';
  solidColor: string;
  keepOriginal: boolean;
  minConfidence: 'high' | 'medium' | 'low';
}

interface SessionStartConfig {
  quality?: 'low' | 'medium' | 'high' | 'ultra';
  captureInputs?: boolean;
  captureWindowActivity?: boolean;
  keyboardMode?: 'full' | 'masked' | 'none';
  enablePrivacyFilter?: boolean;
  [key: string]: unknown;
}

interface SessionManagerAPI {
  getSources: () => Promise<CaptureSource[]>;
  start: (sourceId: string, config?: SessionStartConfig) => Promise<string>;
  stop: (sessionId: string) => Promise<{ sessionId: string; videoPath: string; duration: number }>;
  pause: (sessionId: string) => Promise<{ success: boolean }>;
  resume: (sessionId: string) => Promise<{ success: boolean }>;
  isRecording: () => Promise<boolean>;
  getAutoRedactionConfig: () => Promise<AutoRedactionConfig>;
  setAutoRedactionConfig: (config: Partial<AutoRedactionConfig>) => Promise<{ success: boolean }>;
  isAutoRedactionEnabled: () => Promise<boolean>;
  onStarted: (cb: (data: { sessionId: string; sourceId: string; sourceName: string }) => void) => void;
  onStopping: (cb: (data: { sessionId: string }) => void) => void;
  onStopped: (cb: (data: { sessionId: string; videoPath?: string }) => void) => void;
  onPaused: (cb: (data: { sessionId: string }) => void) => void;
  onResumed: (cb: (data: { sessionId: string }) => void) => void;
  onError: (cb: (data: { sessionId?: string; error: string }) => void) => void;
  onProgress: (cb: (data: { sessionId: string; [key: string]: unknown }) => void) => void;
  onRedacting?: (cb: (data: { sessionId: string; message?: string }) => void) => void;
  onRedactionProgress?: (cb: (data: { sessionId: string; percent?: number; piiCount?: number; complete?: boolean }) => void) => void;
  removeAllListeners?: () => void;
}

interface IndexerRecording {
  id: string;
  filename: string;
  startTime: number;
  duration: number;
  filePath: string;
  thumbnailBase64?: string;
  resolution?: string;
}

interface IndexerAPI {
  list: (filter?: unknown, page?: number, pageSize?: number) => Promise<{ recordings: IndexerRecording[]; total?: number }>;
  get: (id: string) => Promise<IndexerRecording | null>;
  getVideoPath: (id: string) => Promise<string | null>;
  delete: (id: string) => Promise<boolean>;
  export: (id: string, outputPath: string) => Promise<{ success: boolean }>;
  indexAll: () => Promise<{ indexed: number; errors: number }>;
}

interface ElectronAPI {
  sessions: {
    getAll: () => Promise<unknown[]>;
    get: (id: string) => Promise<unknown | null>;
    save: (session: unknown) => Promise<{ success: boolean }>;
    delete: (id: string) => Promise<{ success: boolean }>;
    stats: () => Promise<{
      totalSessions: number;
      totalDuration: number;
      totalEvents: number;
      avgDuration: number;
    }>;
    import: (filePath: string) => Promise<unknown>;
    export: (id: string) => Promise<unknown>;
  };
  sessionManager: SessionManagerAPI;
  indexer: IndexerAPI;
  recording: {
    getSources: () => Promise<unknown[]>;
    startUrl: (url: string, config: unknown) => Promise<{ success: boolean; error?: string }>;
    stop: () => Promise<{ success: boolean; events?: unknown[]; duration?: number; error?: string }>;
    isActive: () => Promise<boolean>;
  };
  ocr: {
    initialize: () => Promise<{ engine: string }>;
    terminate: () => Promise<void>;
    selectTestImage: () => Promise<string | null>;
    processImage: (base64: string, width: number, height: number) => Promise<unknown>;
  };
  pii: {
    getColors: () => Promise<Record<string, string>>;
    scanImage: (base64: string, width: number, height: number) => Promise<{ ocrResult: unknown; piiResult: unknown }>;
  };
  settings: {
    get: (key: string) => Promise<unknown>;
    set: (key: string, value: unknown) => Promise<void>;
  };
  dialog: {
    openFile: (options?: unknown) => Promise<string | null>;
    saveFile: (options?: unknown) => Promise<string | null>;
  };
  on?: {
    importSessionFile?: (cb: (filePath: string) => void) => void;
  };
  [key: string]: unknown;
}

declare global {
  interface Window {
    api?: ElectronAPI;
  }
}

export {};
