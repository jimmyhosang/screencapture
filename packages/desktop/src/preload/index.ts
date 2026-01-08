import { contextBridge, ipcRenderer } from 'electron';
import type { SessionRecord, SessionStats, AppSettings, VideoRecording, VideoRecordingStats, ExportOptions } from '../main/types';
import type { OCRConfig, OCRResult, TextRegion, TextBounds } from '../main/ocr/types';
import type { PIIScanResult, PIIScannerConfig, PIIRegion } from '../main/ocr/piiScanner';
import type {
  RedactionConfig,
  RedactionRegion,
  RedactionStyle
} from '../main/redaction/renderer';
import type {
  RedactionMask,
  RedactionMaskRegion,
  RedactionMode,
  ApplyRedactionOptions
} from '../main/redaction';

// Expose protected methods that allow the renderer process to use
// ipcRenderer without exposing the entire object
const api = {
  // Session operations
  sessions: {
    getAll: (): Promise<SessionRecord[]> => ipcRenderer.invoke('sessions:getAll'),
    get: (id: string): Promise<SessionRecord | null> => ipcRenderer.invoke('sessions:get', id),
    save: (session: SessionRecord): Promise<boolean> => ipcRenderer.invoke('sessions:save', session),
    update: (id: string, updates: Partial<SessionRecord>): Promise<boolean> =>
      ipcRenderer.invoke('sessions:update', id, updates),
    delete: (id: string): Promise<boolean> => ipcRenderer.invoke('sessions:delete', id),
    stats: (): Promise<SessionStats> => ipcRenderer.invoke('sessions:stats'),
    import: (filePath: string): Promise<SessionRecord | null> =>
      ipcRenderer.invoke('sessions:import', filePath),
    export: (id: string): Promise<boolean> => ipcRenderer.invoke('sessions:export', id)
  },

  // Settings operations
  settings: {
    get: (): Promise<AppSettings> => ipcRenderer.invoke('settings:get'),
    set: (settings: AppSettings): Promise<boolean> => ipcRenderer.invoke('settings:set', settings)
  },

  // Dialog operations
  dialog: {
    openFile: (): Promise<string | null> => ipcRenderer.invoke('dialog:openFile')
  },

  // Event listeners
  on: {
    importSessionFile: (callback: (filePath: string) => void): void => {
      ipcRenderer.on('import-session-file', (_, filePath) => callback(filePath));
    }
  },

  // Recording operations (screen capture)
  recording: {
    getSources: (): Promise<Array<{ id: string; name: string; type: string; thumbnailDataUrl?: string }>> =>
      ipcRenderer.invoke('recording:getSources'),
    startUrl: (url: string, config: Record<string, unknown>): Promise<{ success: boolean; error?: string }> =>
      ipcRenderer.invoke('recording:startUrl', url, config),
    stop: (): Promise<{ success: boolean; events?: unknown[]; duration?: number; error?: string }> =>
      ipcRenderer.invoke('recording:stop'),
    isActive: (): Promise<boolean> =>
      ipcRenderer.invoke('recording:isActive')
  },

  // Video recordings management
  recordings: {
    getAll: (): Promise<VideoRecording[]> => ipcRenderer.invoke('recordings:getAll'),
    get: (id: string): Promise<VideoRecording | null> => ipcRenderer.invoke('recordings:get', id),
    save: (recording: VideoRecording): Promise<boolean> => ipcRenderer.invoke('recordings:save', recording),
    update: (id: string, updates: Partial<VideoRecording>): Promise<boolean> =>
      ipcRenderer.invoke('recordings:update', id, updates),
    delete: (id: string): Promise<boolean> => ipcRenderer.invoke('recordings:delete', id),
    stats: (): Promise<VideoRecordingStats> => ipcRenderer.invoke('recordings:stats'),
    generateThumbnail: (id: string): Promise<string | null> => ipcRenderer.invoke('recordings:generateThumbnail', id),
    export: (id: string, options: ExportOptions): Promise<string | null> =>
      ipcRenderer.invoke('recordings:export', id, options),
    import: (): Promise<VideoRecording | null> => ipcRenderer.invoke('recordings:import'),
    getPath: (): Promise<string> => ipcRenderer.invoke('recordings:getPath'),
    openFolder: (): Promise<void> => ipcRenderer.invoke('recordings:openFolder')
  },

  // OCR operations for text detection
  ocr: {
    initialize: (): Promise<{ success: boolean; engine: string }> =>
      ipcRenderer.invoke('ocr:initialize'),
    processFrame: (imageData: string | ArrayBuffer, width: number, height: number): Promise<OCRResult> =>
      ipcRenderer.invoke('ocr:processFrame', imageData, width, height),
    processFile: (filePath: string): Promise<OCRResult | null> =>
      ipcRenderer.invoke('ocr:processFile', filePath),
    detectPII: (imageData: string | ArrayBuffer, width: number, height: number): Promise<{ region: TextRegion; piiTypes: string[] }[]> =>
      ipcRenderer.invoke('ocr:detectPII', imageData, width, height),
    selectTestImage: (): Promise<string | null> =>
      ipcRenderer.invoke('ocr:selectTestImage'),
    getConfig: (): Promise<OCRConfig> =>
      ipcRenderer.invoke('ocr:getConfig'),
    setConfig: (config: Partial<OCRConfig>): Promise<void> =>
      ipcRenderer.invoke('ocr:setConfig', config),
    getEngine: (): Promise<string> =>
      ipcRenderer.invoke('ocr:getEngine'),
    clearCache: (): Promise<void> =>
      ipcRenderer.invoke('ocr:clearCache'),
    terminate: (): Promise<void> =>
      ipcRenderer.invoke('ocr:terminate')
  },

  // PII Scanner operations (enhanced PII detection on OCR results)
  pii: {
    scanRegions: (textRegions: TextRegion[], frameHash?: string): Promise<PIIScanResult> =>
      ipcRenderer.invoke('pii:scanRegions', textRegions, frameHash),
    scanImage: (imageData: string | ArrayBuffer, width: number, height: number): Promise<{ ocrResult: OCRResult; piiResult: PIIScanResult }> =>
      ipcRenderer.invoke('pii:scanImage', imageData, width, height),
    getColors: (): Promise<Record<string, string>> =>
      ipcRenderer.invoke('pii:getColors'),
    calculateMatchBounds: (
      regionBounds: { x: number; y: number; width: number; height: number },
      regionText: string,
      matchStart: number,
      matchEnd: number
    ): Promise<{ x: number; y: number; width: number; height: number }> =>
      ipcRenderer.invoke('pii:calculateMatchBounds', regionBounds, regionText, matchStart, matchEnd),
    getConfig: (): Promise<PIIScannerConfig> =>
      ipcRenderer.invoke('pii:getConfig'),
    setConfig: (config: Partial<PIIScannerConfig>): Promise<void> =>
      ipcRenderer.invoke('pii:setConfig', config),
    addPattern: (name: string, regex: string, replacer: string, confidence?: 'high' | 'medium' | 'low'): Promise<boolean> =>
      ipcRenderer.invoke('pii:addPattern', name, regex, replacer, confidence),
    removePattern: (name: string): Promise<boolean> =>
      ipcRenderer.invoke('pii:removePattern', name),
    clearCache: (): Promise<void> =>
      ipcRenderer.invoke('pii:clearCache')
  },

  // Redaction operations (apply visual redactions to frames/videos)
  redaction: {
    // Configuration
    getMode: (): Promise<RedactionMode> =>
      ipcRenderer.invoke('redaction:getMode'),
    setMode: (mode: Partial<RedactionMode>): Promise<void> =>
      ipcRenderer.invoke('redaction:setMode', mode),
    getConfig: (): Promise<RedactionConfig> =>
      ipcRenderer.invoke('redaction:getConfig'),
    setConfig: (config: Partial<RedactionConfig>): Promise<void> =>
      ipcRenderer.invoke('redaction:setConfig', config),

    // Real-time redaction (ImageData processing)
    applyToFrame: (
      imageData: Uint8ClampedArray,
      width: number,
      height: number,
      regions: RedactionRegion[]
    ): Promise<Uint8ClampedArray> =>
      ipcRenderer.invoke('redaction:applyToFrame', imageData, width, height, regions),
    applyFromPII: (
      imageData: Uint8ClampedArray,
      width: number,
      height: number,
      piiRegions: PIIRegion[]
    ): Promise<Uint8ClampedArray> =>
      ipcRenderer.invoke('redaction:applyFromPII', imageData, width, height, piiRegions),

    // Redaction masks (post-process mode)
    createMask: (
      recordingId: string,
      startTime: number,
      endTime: number,
      regions: RedactionMaskRegion[]
    ): Promise<RedactionMask> =>
      ipcRenderer.invoke('redaction:createMask', recordingId, startTime, endTime, regions),
    createMaskFromPII: (
      recordingId: string,
      startTime: number,
      endTime: number,
      piiRegions: PIIRegion[]
    ): Promise<RedactionMask> =>
      ipcRenderer.invoke('redaction:createMaskFromPII', recordingId, startTime, endTime, piiRegions),
    getMasks: (recordingId: string): Promise<RedactionMask[]> =>
      ipcRenderer.invoke('redaction:getMasks', recordingId),
    updateMask: (
      recordingId: string,
      maskId: string,
      updates: Partial<Omit<RedactionMask, 'id' | 'recordingId' | 'createdAt'>>
    ): Promise<boolean> =>
      ipcRenderer.invoke('redaction:updateMask', recordingId, maskId, updates),
    deleteMask: (recordingId: string, maskId: string): Promise<boolean> =>
      ipcRenderer.invoke('redaction:deleteMask', recordingId, maskId),
    clearMasks: (recordingId: string): Promise<void> =>
      ipcRenderer.invoke('redaction:clearMasks', recordingId),

    // Video processing
    applyToVideo: (options: ApplyRedactionOptions): Promise<{ success: boolean; outputPath?: string; error?: string }> =>
      ipcRenderer.invoke('redaction:applyToVideo', options),
    previewFrame: (
      videoPath: string,
      timestamp: number,
      masks: RedactionMask[]
    ): Promise<{ success: boolean; imageData?: Uint8ClampedArray; width?: number; height?: number; error?: string }> =>
      ipcRenderer.invoke('redaction:previewFrame', videoPath, timestamp, masks),

    // Cleanup
    terminate: (): Promise<void> =>
      ipcRenderer.invoke('redaction:terminate')
  }
};

// Use `contextBridge` APIs to expose Electron APIs to
// renderer only if context isolation is enabled
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('api', api);
  } catch (error) {
    console.error(error);
  }
} else {
  // @ts-expect-error - Fallback for non-isolated context
  window.api = api;
}

export type Api = typeof api;
