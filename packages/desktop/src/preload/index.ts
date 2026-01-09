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
import type {
  ManualRegion,
  AppBlockRule,
  RedactionProfile,
  RedactionSession,
  TimelineEvent,
  DetectedWindow,
} from '../main/redaction/types';
import type {
  PerformanceConfig,
  PerformanceSnapshot,
  FrameMetrics
} from '../main/performance';
import type {
  Task,
  TaskType,
  TaskOptions,
  TaskStatus
} from '../main/workers/taskManager';
import type {
  CCaaSWebhookConfig,
  CCaaSServerStatus,
  CCaaSEvent,
  CallState
} from '../main/ccaas/types';

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
  },

  // Manual redaction operations (region marking, app blocking, profiles)
  manual: {
    // Sessions
    createSession: (
      recordingId: string,
      duration: number,
      dimensions: { width: number; height: number }
    ): Promise<RedactionSession> =>
      ipcRenderer.invoke('manual:createSession', recordingId, duration, dimensions),
    getSession: (recordingId: string): Promise<RedactionSession | null> =>
      ipcRenderer.invoke('manual:getSession', recordingId),
    saveSession: (recordingId: string): Promise<boolean> =>
      ipcRenderer.invoke('manual:saveSession', recordingId),
    deleteSession: (recordingId: string): Promise<boolean> =>
      ipcRenderer.invoke('manual:deleteSession', recordingId),

    // Regions
    addRegion: (
      recordingId: string,
      region: Omit<ManualRegion, 'id' | 'createdAt'>
    ): Promise<ManualRegion | null> =>
      ipcRenderer.invoke('manual:addRegion', recordingId, region),
    updateRegion: (
      recordingId: string,
      regionId: string,
      updates: Partial<ManualRegion>
    ): Promise<boolean> =>
      ipcRenderer.invoke('manual:updateRegion', recordingId, regionId, updates),
    deleteRegion: (recordingId: string, regionId: string): Promise<boolean> =>
      ipcRenderer.invoke('manual:deleteRegion', recordingId, regionId),
    getRegionsAtTime: (recordingId: string, time: number): Promise<ManualRegion[]> =>
      ipcRenderer.invoke('manual:getRegionsAtTime', recordingId, time),

    // App Block Rules
    getAppBlockRules: (): Promise<AppBlockRule[]> =>
      ipcRenderer.invoke('manual:getAppBlockRules'),
    addAppBlockRule: (rule: Omit<AppBlockRule, 'id' | 'createdAt'>): Promise<AppBlockRule> =>
      ipcRenderer.invoke('manual:addAppBlockRule', rule),
    updateAppBlockRule: (id: string, updates: Partial<AppBlockRule>): Promise<boolean> =>
      ipcRenderer.invoke('manual:updateAppBlockRule', id, updates),
    deleteAppBlockRule: (id: string): Promise<boolean> =>
      ipcRenderer.invoke('manual:deleteAppBlockRule', id),
    matchWindowToRules: (window: DetectedWindow): Promise<AppBlockRule | null> =>
      ipcRenderer.invoke('manual:matchWindowToRules', window),

    // Timeline
    addTimelineEvent: (
      recordingId: string,
      trackId: string,
      event: Omit<TimelineEvent, 'id'>
    ): Promise<TimelineEvent | null> =>
      ipcRenderer.invoke('manual:addTimelineEvent', recordingId, trackId, event),
    updateTimelineEvent: (
      recordingId: string,
      trackId: string,
      eventId: string,
      updates: Partial<TimelineEvent>
    ): Promise<boolean> =>
      ipcRenderer.invoke('manual:updateTimelineEvent', recordingId, trackId, eventId, updates),
    deleteTimelineEvent: (
      recordingId: string,
      trackId: string,
      eventId: string
    ): Promise<boolean> =>
      ipcRenderer.invoke('manual:deleteTimelineEvent', recordingId, trackId, eventId),

    // Profiles
    getProfiles: (): Promise<RedactionProfile[]> =>
      ipcRenderer.invoke('manual:getProfiles'),
    getProfile: (id: string): Promise<RedactionProfile | null> =>
      ipcRenderer.invoke('manual:getProfile', id),
    createProfile: (
      profile: Omit<RedactionProfile, 'id' | 'version' | 'createdAt' | 'updatedAt'>
    ): Promise<RedactionProfile> =>
      ipcRenderer.invoke('manual:createProfile', profile),
    updateProfile: (id: string, updates: Partial<RedactionProfile>): Promise<boolean> =>
      ipcRenderer.invoke('manual:updateProfile', id, updates),
    deleteProfile: (id: string): Promise<boolean> =>
      ipcRenderer.invoke('manual:deleteProfile', id),
    exportProfile: (id: string): Promise<boolean> =>
      ipcRenderer.invoke('manual:exportProfile', id),
    importProfile: (): Promise<RedactionProfile | null> =>
      ipcRenderer.invoke('manual:importProfile'),
    applyProfile: (recordingId: string, profileId: string): Promise<boolean> =>
      ipcRenderer.invoke('manual:applyProfile', recordingId, profileId)
  },

  // Performance monitoring operations
  performance: {
    getConfig: (): Promise<PerformanceConfig> =>
      ipcRenderer.invoke('performance:getConfig'),
    setConfig: (config: Partial<PerformanceConfig>): Promise<void> =>
      ipcRenderer.invoke('performance:setConfig', config),
    getLatestSnapshot: (): Promise<PerformanceSnapshot | null> =>
      ipcRenderer.invoke('performance:getLatestSnapshot'),
    getSnapshots: (count?: number): Promise<PerformanceSnapshot[]> =>
      ipcRenderer.invoke('performance:getSnapshots', count),
    getFrameMetrics: (count?: number): Promise<FrameMetrics[]> =>
      ipcRenderer.invoke('performance:getFrameMetrics', count),
    recordFrame: (metrics: Omit<FrameMetrics, 'timestamp'>): Promise<void> =>
      ipcRenderer.invoke('performance:recordFrame', metrics),
    setRecordingState: (recording: boolean): Promise<void> =>
      ipcRenderer.invoke('performance:setRecordingState', recording),
    reset: (): Promise<void> =>
      ipcRenderer.invoke('performance:reset'),
    terminate: (): Promise<void> =>
      ipcRenderer.invoke('performance:terminate'),
    onUpdate: (callback: (snapshot: PerformanceSnapshot) => void): void => {
      ipcRenderer.on('performance:update', (_, snapshot) => callback(snapshot));
    },
    removeUpdateListener: (): void => {
      ipcRenderer.removeAllListeners('performance:update');
    }
  },

  // Keyboard shortcuts (received from main process)
  shortcuts: {
    onToggleRecording: (callback: () => void): void => {
      ipcRenderer.on('shortcut:toggle-recording', callback);
    },
    onTogglePause: (callback: () => void): void => {
      ipcRenderer.on('shortcut:toggle-pause', callback);
    },
    onScreenshot: (callback: () => void): void => {
      ipcRenderer.on('shortcut:screenshot', callback);
    },
    onTogglePerformance: (callback: () => void): void => {
      ipcRenderer.on('shortcut:toggle-performance', callback);
    },
    // Notify main process of recording state changes
    notifyRecordingState: (recording: boolean, paused: boolean): void => {
      ipcRenderer.send('recording:stateChanged', recording, paused);
    },
    removeAllListeners: (): void => {
      ipcRenderer.removeAllListeners('shortcut:toggle-recording');
      ipcRenderer.removeAllListeners('shortcut:toggle-pause');
      ipcRenderer.removeAllListeners('shortcut:screenshot');
      ipcRenderer.removeAllListeners('shortcut:toggle-performance');
    }
  },

  // Background task operations
  tasks: {
    getAll: (): Promise<Task[]> =>
      ipcRenderer.invoke('tasks:getAll'),
    get: (taskId: string): Promise<Task | null> =>
      ipcRenderer.invoke('tasks:get', taskId),
    cancel: (taskId: string): Promise<boolean> =>
      ipcRenderer.invoke('tasks:cancel', taskId),
    clearCompleted: (): Promise<number> =>
      ipcRenderer.invoke('tasks:clearCompleted'),
    create: (type: TaskType, data: Record<string, unknown>, options?: TaskOptions): Promise<string> =>
      ipcRenderer.invoke('tasks:create', type, data, options),
    onUpdate: (callback: (update: { taskId: string; type: TaskType; status: TaskStatus; progress: number; message: string; result?: unknown; error?: string }) => void): void => {
      ipcRenderer.on('tasks:update', (_, update) => callback(update));
    },
    onListUpdate: (callback: (tasks: Task[]) => void): void => {
      ipcRenderer.on('tasks:listUpdate', (_, tasks) => callback(tasks));
    },
    removeUpdateListener: (): void => {
      ipcRenderer.removeAllListeners('tasks:update');
    },
    removeListUpdateListener: (): void => {
      ipcRenderer.removeAllListeners('tasks:listUpdate');
    }
  },

  // CCaaS (Contact Center as a Service) integration
  ccaas: {
    getStatus: (): Promise<CCaaSServerStatus> =>
      ipcRenderer.invoke('ccaas:getStatus'),
    start: (config?: Partial<CCaaSWebhookConfig>): Promise<boolean> =>
      ipcRenderer.invoke('ccaas:start', config),
    stop: (): Promise<boolean> =>
      ipcRenderer.invoke('ccaas:stop'),
    testWebhook: (event: CCaaSEvent): Promise<{ success: boolean; message: string }> =>
      ipcRenderer.invoke('ccaas:testWebhook', event),
    getConfig: (): Promise<CCaaSWebhookConfig> =>
      ipcRenderer.invoke('ccaas:getConfig'),
    updateConfig: (config: Partial<CCaaSWebhookConfig>): Promise<CCaaSWebhookConfig> =>
      ipcRenderer.invoke('ccaas:updateConfig', config),
    getCallSummary: (): Promise<{
      activeCalls: number;
      activeRecordings: number;
      calls: Array<{
        callId: string;
        agentId: string;
        direction: string;
        status: string;
        hasRecording: boolean;
      }>;
    }> =>
      ipcRenderer.invoke('ccaas:getCallSummary'),
    getActiveCalls: (): Promise<CallState[]> =>
      ipcRenderer.invoke('ccaas:getActiveCalls'),
    // Event listeners for CCaaS recording events
    onRecordingStart: (callback: (data: {
      sessionId: string;
      callId: string;
      agentId: string;
      direction: string;
      customerId?: string;
      timestamp: string;
    }) => void): void => {
      ipcRenderer.on('ccaas:recordingStart', (_, data) => callback(data));
    },
    onRecordingStop: (callback: (data: {
      sessionId: string;
      callId: string;
      timestamp: string;
    }) => void): void => {
      ipcRenderer.on('ccaas:recordingStop', (_, data) => callback(data));
    },
    removeRecordingListeners: (): void => {
      ipcRenderer.removeAllListeners('ccaas:recordingStart');
      ipcRenderer.removeAllListeners('ccaas:recordingStop');
    }
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
