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
import type {
  SourceInfo,
  RecordingResult,
  RecordingState,
  WindowActivity
} from '../main/services/screen-recorder';
import type {
  ManagedRecording,
  RecordingManagerConfig
} from '../main/services/recording-manager';
import type {
  StorageConfig,
  StorageStats,
  StoragePaths
} from '../main/services/storage-manager';
import type {
  IndexedRecording,
  RecordingFilter,
  PaginatedRecordings
} from '../main/services/recording-indexer';
import type {
  OcrOptions,
  OcrReport,
  OcrFrame,
  OcrJobStatus
} from '../main/services/ocr-processor';

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
  },

  // Call Events (CCaaS event history)
  calls: {
    getEvents: (callId: string): Promise<Array<{
      id: string;
      callId: string;
      eventType: string;
      agentId?: string;
      customerId?: string;
      queueName?: string;
      direction?: 'inbound' | 'outbound';
      disposition?: string;
      durationSeconds?: number;
      timestamp: number;
      payload?: Record<string, unknown>;
      createdAt: number;
    }>> =>
      ipcRenderer.invoke('calls:getEvents', callId),
    getRecent: (limit?: number): Promise<Array<{
      id: string;
      callId: string;
      eventType: string;
      agentId?: string;
      timestamp: number;
      createdAt: number;
    }>> =>
      ipcRenderer.invoke('calls:getRecent', limit),
    getEventsByAgent: (agentId: string, limit?: number): Promise<Array<{
      id: string;
      callId: string;
      eventType: string;
      agentId?: string;
      timestamp: number;
    }>> =>
      ipcRenderer.invoke('calls:getEventsByAgent', agentId, limit),
    getEventsInRange: (startTime: number, endTime: number): Promise<Array<{
      id: string;
      callId: string;
      eventType: string;
      timestamp: number;
    }>> =>
      ipcRenderer.invoke('calls:getEventsInRange', startTime, endTime),
    getUniqueCallIds: (limit?: number): Promise<string[]> =>
      ipcRenderer.invoke('calls:getUniqueCallIds', limit)
  },

  // Active Window Tracking
  tracking: {
    // Tracking control
    start: (recordingId: string): Promise<boolean> =>
      ipcRenderer.invoke('tracking:start', recordingId),
    stop: (): Promise<Array<{
      timestampMs: number;
      windowTitle?: string;
      processName?: string;
      url?: string;
    }>> =>
      ipcRenderer.invoke('tracking:stop'),
    pause: (): Promise<boolean> =>
      ipcRenderer.invoke('tracking:pause'),
    resume: (): Promise<boolean> =>
      ipcRenderer.invoke('tracking:resume'),
    isActive: (): Promise<boolean> =>
      ipcRenderer.invoke('tracking:isActive'),
    getCurrentLogs: (): Promise<Array<{
      timestampMs: number;
      windowTitle?: string;
      processName?: string;
      url?: string;
    }>> =>
      ipcRenderer.invoke('tracking:getCurrentLogs'),
    getConfig: (): Promise<{
      pollIntervalMs: number;
      extractBrowserUrl: boolean;
      includeWindowBounds: boolean;
    }> =>
      ipcRenderer.invoke('tracking:getConfig'),
    setConfig: (config: Partial<{
      pollIntervalMs: number;
      extractBrowserUrl: boolean;
      includeWindowBounds: boolean;
    }>): Promise<{
      pollIntervalMs: number;
      extractBrowserUrl: boolean;
      includeWindowBounds: boolean;
    }> =>
      ipcRenderer.invoke('tracking:setConfig', config),
    // Database queries (from repositories)
    getWindowLog: (recordingId: string): Promise<Array<{
      id: string;
      recordingId: string;
      timestampMs: number;
      windowTitle?: string;
      processName?: string;
      url?: string;
    }>> =>
      ipcRenderer.invoke('tracking:getWindowLog', recordingId),
    getWindowAtTimestamp: (recordingId: string, timestampMs: number): Promise<{
      id: string;
      recordingId: string;
      timestampMs: number;
      windowTitle?: string;
      processName?: string;
      url?: string;
    } | null> =>
      ipcRenderer.invoke('tracking:getWindowAtTimestamp', recordingId, timestampMs),
    getUniqueProcesses: (recordingId: string): Promise<string[]> =>
      ipcRenderer.invoke('tracking:getUniqueProcesses', recordingId),
    getActivitySummary: (recordingId: string): Promise<Array<{
      processName: string;
      totalTimeMs: number;
      percentage: number;
    }>> =>
      ipcRenderer.invoke('tracking:getActivitySummary', recordingId),
    // Event listener for window changes
    onWindowChange: (callback: (data: {
      recordingId: string;
      timestampMs: number;
      windowTitle?: string;
      processName?: string;
      url?: string;
    }) => void): void => {
      ipcRenderer.on('tracking:windowChange', (_, data) => callback(data));
    },
    removeWindowChangeListener: (): void => {
      ipcRenderer.removeAllListeners('tracking:windowChange');
    }
  },

  // Recording-Call Association
  recordingCalls: {
    getByCallId: (callId: string): Promise<Array<{
      id: string;
      filename: string;
      callId: string;
      agentId?: string;
      queueName?: string;
      callDirection?: string;
      startTime: number;
      duration: number;
    }>> =>
      ipcRenderer.invoke('recordings:getByCallId', callId),
    getByRecordingId: (recordingId: string): Promise<{
      recordingId: string;
      callId: string;
      agentId?: string;
      queueName?: string;
      callDirection?: string;
    } | null> =>
      ipcRenderer.invoke('recordings:getCallMetadata', recordingId),
    updateCallMetadata: (recordingId: string, metadata: {
      callId?: string;
      agentId?: string;
      queueName?: string;
      callDirection?: 'inbound' | 'outbound';
    }): Promise<boolean> =>
      ipcRenderer.invoke('recordings:updateCallMetadata', recordingId, metadata),
    getWithCalls: (limit?: number): Promise<Array<{
      id: string;
      filename: string;
      callId?: string;
      agentId?: string;
      queueName?: string;
      callDirection?: string;
      startTime: number;
      duration: number;
    }>> =>
      ipcRenderer.invoke('recordings:getWithCalls', limit)
  },

  // Recording Manager (screen capture with desktopCapturer)
  recordingManager: {
    getSources: (): Promise<SourceInfo[]> =>
      ipcRenderer.invoke('recordingManager:getSources'),
    startForCall: (callId: string, agentId: string, sourceId?: string): Promise<string | null> =>
      ipcRenderer.invoke('recordingManager:startForCall', callId, agentId, sourceId),
    stopForCall: (callId: string): Promise<RecordingResult | null> =>
      ipcRenderer.invoke('recordingManager:stopForCall', callId),
    getForCall: (callId: string): Promise<ManagedRecording | null> =>
      ipcRenderer.invoke('recordingManager:getForCall', callId),
    getActive: (): Promise<ManagedRecording[]> =>
      ipcRenderer.invoke('recordingManager:getActive'),
    getConfig: (): Promise<RecordingManagerConfig> =>
      ipcRenderer.invoke('recordingManager:getConfig'),
    updateConfig: (config: Partial<RecordingManagerConfig>): Promise<RecordingManagerConfig> =>
      ipcRenderer.invoke('recordingManager:updateConfig', config)
  },

  // Storage Manager (paths, disk monitoring, cleanup)
  storage: {
    getStats: (): Promise<StorageStats> =>
      ipcRenderer.invoke('storage:getStats'),
    getPaths: (): Promise<StoragePaths> =>
      ipcRenderer.invoke('storage:getPaths'),
    getConfig: (): Promise<StorageConfig> =>
      ipcRenderer.invoke('storage:getConfig'),
    updateConfig: (config: Partial<StorageConfig>): Promise<StorageConfig> =>
      ipcRenderer.invoke('storage:updateConfig', config),
    cleanup: (): Promise<{ deleted: number; freedBytes: number }> =>
      ipcRenderer.invoke('storage:cleanup'),
    checkDiskSpace: (): Promise<{ isLow: boolean; stats: StorageStats }> =>
      ipcRenderer.invoke('storage:checkDiskSpace')
  },

  // Recording Indexer (SQLite indexing, metadata, thumbnails)
  indexer: {
    list: (filter?: Partial<RecordingFilter>, page?: number, pageSize?: number): Promise<PaginatedRecordings> =>
      ipcRenderer.invoke('indexer:list', filter || {}, page || 1, pageSize || 20),
    get: (id: string): Promise<IndexedRecording | null> =>
      ipcRenderer.invoke('indexer:get', id),
    getVideoPath: (id: string): Promise<string | null> =>
      ipcRenderer.invoke('indexer:getVideoPath', id),
    updateStatus: (id: string, status: IndexedRecording['status']): Promise<boolean> =>
      ipcRenderer.invoke('indexer:updateStatus', id, status),
    updateMetadata: (id: string, metadata: Partial<Pick<IndexedRecording, 'tags' | 'notes'>>): Promise<boolean> =>
      ipcRenderer.invoke('indexer:updateMetadata', id, metadata),
    delete: (id: string): Promise<boolean> =>
      ipcRenderer.invoke('indexer:delete', id),
    export: (id: string, outputPath: string): Promise<boolean> =>
      ipcRenderer.invoke('indexer:export', id, outputPath),
    indexAll: (): Promise<{ indexed: number; errors: number }> =>
      ipcRenderer.invoke('indexer:indexAll'),
    reindex: (id: string): Promise<IndexedRecording | null> =>
      ipcRenderer.invoke('indexer:reindex', id)
  },

  // OCR Processor (text extraction from recordings)
  ocrProcessor: {
    queue: (recordingId: string, options?: Partial<OcrOptions>): Promise<string> =>
      ipcRenderer.invoke('ocrProcessor:queue', recordingId, options),
    process: (recordingId: string, options?: Partial<OcrOptions>): Promise<OcrReport> =>
      ipcRenderer.invoke('ocrProcessor:process', recordingId, options),
    getReport: (id: string): Promise<OcrReport | null> =>
      ipcRenderer.invoke('ocrProcessor:getReport', id),
    getReportByRecording: (recordingId: string): Promise<OcrReport | null> =>
      ipcRenderer.invoke('ocrProcessor:getReportByRecording', recordingId),
    getAllReports: (): Promise<OcrReport[]> =>
      ipcRenderer.invoke('ocrProcessor:getAllReports'),
    deleteReport: (id: string): Promise<boolean> =>
      ipcRenderer.invoke('ocrProcessor:deleteReport', id),
    search: (query: string, recordingId?: string): Promise<Array<{
      reportId: string;
      recordingId: string;
      frames: Array<{ timestamp: number; text: string; matchCount: number }>;
    }>> =>
      ipcRenderer.invoke('ocrProcessor:search', query, recordingId),
    getTextAtTimestamp: (recordingId: string, timestamp: number): Promise<OcrFrame | null> =>
      ipcRenderer.invoke('ocrProcessor:getTextAtTimestamp', recordingId, timestamp),
    getQueueStatus: (): Promise<OcrJobStatus[]> =>
      ipcRenderer.invoke('ocrProcessor:getQueueStatus'),
    cancelJob: (jobId: string): Promise<boolean> =>
      ipcRenderer.invoke('ocrProcessor:cancelJob', jobId),
    pause: (): Promise<void> =>
      ipcRenderer.invoke('ocrProcessor:pause'),
    resume: (): Promise<void> =>
      ipcRenderer.invoke('ocrProcessor:resume'),
    // Event listener for progress updates
    onProgress: (callback: (data: {
      jobId: string;
      recordingId: string;
      status: string;
      progress: number;
      message?: string;
    }) => void): void => {
      ipcRenderer.on('ocr:progress', (_, data) => callback(data));
    },
    removeProgressListener: (): void => {
      ipcRenderer.removeAllListeners('ocr:progress');
    }
  },

  // Desktop Capture (native screen capture)
  capture: {
    getSources: (): Promise<Array<{
      id: string;
      name: string;
      thumbnail: string;
      displayId?: string;
      isScreen: boolean;
      isWindow: boolean;
      appIcon?: string;
    }>> =>
      ipcRenderer.invoke('capture:getSources'),
    start: (options: {
      sourceId: string;
      quality?: 'low' | 'medium' | 'high' | 'ultra';
      resolution?: { width: number; height: number };
      frameRate?: number;
      metadata?: Record<string, unknown>;
    }): Promise<{ sessionId: string }> =>
      ipcRenderer.invoke('capture:start', options),
    stop: (sessionId: string): Promise<{
      sessionId: string;
      filePath: string;
      duration: number;
      fileSize: number;
      resolution: { width: number; height: number };
      frameRate: number;
      chunksMerged: number;
    }> =>
      ipcRenderer.invoke('capture:stop', sessionId),
    pause: (sessionId: string): Promise<void> =>
      ipcRenderer.invoke('capture:pause', sessionId),
    resume: (sessionId: string): Promise<void> =>
      ipcRenderer.invoke('capture:resume', sessionId),
    getState: (sessionId: string): Promise<{
      sessionId: string;
      sourceId: string;
      sourceName: string;
      status: string;
      startTime: number;
      duration: number;
    } | null> =>
      ipcRenderer.invoke('capture:getState', sessionId),
    getActive: (): Promise<Array<{
      sessionId: string;
      sourceId: string;
      sourceName: string;
      status: string;
      startTime: number;
    }>> =>
      ipcRenderer.invoke('capture:getActive'),
    sendChunk: (data: {
      sessionId: string;
      index: number;
      data: ArrayBuffer;
      timestamp: number;
      duration: number;
    }): void => {
      ipcRenderer.send('capture:chunk', data);
    },
    notifyStarted: (sessionId: string): void => {
      ipcRenderer.send('capture:started', { sessionId });
    },
    notifyStopped: (sessionId: string): void => {
      ipcRenderer.send('capture:stopped', { sessionId });
    },
    notifyError: (sessionId: string, error: string): void => {
      ipcRenderer.send('capture:error', { sessionId, error });
    },
    // Event listeners
    onStartMedia: (callback: (data: {
      sessionId: string;
      sourceId: string;
      constraints: MediaStreamConstraints;
    }) => void): void => {
      ipcRenderer.on('capture:startMedia', (_, data) => callback(data));
    },
    onStopMedia: (callback: (data: { sessionId: string }) => void): void => {
      ipcRenderer.on('capture:stopMedia', (_, data) => callback(data));
    },
    onPauseMedia: (callback: (data: { sessionId: string }) => void): void => {
      ipcRenderer.on('capture:pauseMedia', (_, data) => callback(data));
    },
    onResumeMedia: (callback: (data: { sessionId: string }) => void): void => {
      ipcRenderer.on('capture:resumeMedia', (_, data) => callback(data));
    },
    onProgress: (callback: (data: {
      sessionId: string;
      duration: number;
      chunkCount: number;
    }) => void): void => {
      ipcRenderer.on('capture:progress', (_, data) => callback(data));
    },
    onError: (callback: (data: {
      sessionId: string;
      error: string;
    }) => void): void => {
      ipcRenderer.on('capture:error', (_, data) => callback(data));
    },
    removeAllListeners: (): void => {
      ipcRenderer.removeAllListeners('capture:startMedia');
      ipcRenderer.removeAllListeners('capture:stopMedia');
      ipcRenderer.removeAllListeners('capture:pauseMedia');
      ipcRenderer.removeAllListeners('capture:resumeMedia');
      ipcRenderer.removeAllListeners('capture:progress');
      ipcRenderer.removeAllListeners('capture:error');
    }
  },

  // Input Tracking (global mouse, keyboard, scroll events)
  input: {
    start: (sessionId: string, config?: {
      mouseMoveThrottleMs?: number;
      scrollThrottleMs?: number;
      significantMoveThreshold?: number;
      keyboardMode?: 'full' | 'masked' | 'none';
      excludedProcesses?: string[];
      captureMouseClicks?: boolean;
      captureMouseMove?: boolean;
      captureKeyboard?: boolean;
      captureScroll?: boolean;
    }): Promise<{ success: boolean; sessionId: string }> =>
      ipcRenderer.invoke('input:start', sessionId, config),
    stop: (): Promise<Array<{
      timestamp: number;
      type: 'mousedown' | 'mouseup' | 'click' | 'mousemove' | 'scroll' | 'keydown' | 'keyup';
      x?: number;
      y?: number;
      button?: number;
      keycode?: number;
      key?: string;
      modifiers?: { ctrl: boolean; alt: boolean; shift: boolean; meta: boolean };
      scrollDelta?: { x: number; y: number };
      duration?: number;
    }>> =>
      ipcRenderer.invoke('input:stop'),
    pause: (): Promise<{ success: boolean }> =>
      ipcRenderer.invoke('input:pause'),
    resume: (): Promise<{ success: boolean }> =>
      ipcRenderer.invoke('input:resume'),
    getEvents: (): Promise<Array<{
      timestamp: number;
      type: 'mousedown' | 'mouseup' | 'click' | 'mousemove' | 'scroll' | 'keydown' | 'keyup';
      x?: number;
      y?: number;
      button?: number;
      keycode?: number;
      key?: string;
      modifiers?: { ctrl: boolean; alt: boolean; shift: boolean; meta: boolean };
      scrollDelta?: { x: number; y: number };
      duration?: number;
    }>> =>
      ipcRenderer.invoke('input:getEvents'),
    getConfig: (): Promise<{
      mouseMoveThrottleMs: number;
      scrollThrottleMs: number;
      significantMoveThreshold: number;
      keyboardMode: 'full' | 'masked' | 'none';
      excludedProcesses: string[];
      captureMouseClicks: boolean;
      captureMouseMove: boolean;
      captureKeyboard: boolean;
      captureScroll: boolean;
    }> =>
      ipcRenderer.invoke('input:getConfig'),
    setConfig: (config: Partial<{
      mouseMoveThrottleMs: number;
      scrollThrottleMs: number;
      significantMoveThreshold: number;
      keyboardMode: 'full' | 'masked' | 'none';
      excludedProcesses: string[];
      captureMouseClicks: boolean;
      captureMouseMove: boolean;
      captureKeyboard: boolean;
      captureScroll: boolean;
    }>): Promise<{ success: boolean }> =>
      ipcRenderer.invoke('input:setConfig', config),
    getState: (): Promise<{
      sessionId: string | null;
      isTracking: boolean;
      isPaused: boolean;
      startTime: number;
      eventCount: number;
    }> =>
      ipcRenderer.invoke('input:getState'),
    updateWindow: (windowInfo: {
      processName?: string;
      windowTitle?: string;
      url?: string;
    }): void => {
      ipcRenderer.send('input:updateWindow', windowInfo);
    },
    saveEvents: (videoPath: string, events: Array<{
      timestamp: number;
      type: string;
      x?: number;
      y?: number;
      button?: number;
      keycode?: number;
      key?: string;
      modifiers?: { ctrl: boolean; alt: boolean; shift: boolean; meta: boolean };
      scrollDelta?: { x: number; y: number };
      duration?: number;
    }>): Promise<{ success: boolean; path: string }> =>
      ipcRenderer.invoke('input:saveEvents', videoPath, events),
    loadEvents: (videoPath: string): Promise<Array<{
      timestamp: number;
      type: string;
      x?: number;
      y?: number;
      button?: number;
      keycode?: number;
      key?: string;
      modifiers?: { ctrl: boolean; alt: boolean; shift: boolean; meta: boolean };
      scrollDelta?: { x: number; y: number };
      duration?: number;
    }>> =>
      ipcRenderer.invoke('input:loadEvents', videoPath)
  },

  // Session Recording Manager (unified orchestration)
  sessionManager: {
    getSources: (): Promise<Array<{
      id: string;
      name: string;
      thumbnail: string;
      isScreen: boolean;
      isWindow: boolean;
    }>> =>
      ipcRenderer.invoke('sessionManager:getSources'),
    start: (sourceId: string, config?: {
      quality?: 'low' | 'medium' | 'high' | 'ultra';
      resolution?: { width: number; height: number };
      frameRate?: number;
      captureInputs?: boolean;
      inputConfig?: {
        mouseMoveThrottleMs?: number;
        scrollThrottleMs?: number;
        keyboardMode?: 'full' | 'masked' | 'none';
        captureMouseClicks?: boolean;
        captureMouseMove?: boolean;
        captureKeyboard?: boolean;
        captureScroll?: boolean;
      };
      captureWindowActivity?: boolean;
      windowPollingInterval?: number;
      enablePrivacyFilter?: boolean;
      keyboardMode?: 'full' | 'masked' | 'none';
      metadata?: Record<string, unknown>;
      callId?: string;
      agentId?: string;
    }): Promise<string> =>
      ipcRenderer.invoke('sessionManager:start', sourceId, config),
    stop: (sessionId: string): Promise<{
      sessionId: string;
      videoPath: string;
      inputEventsPath: string | null;
      windowLogPath: string | null;
      duration: number;
      fileSize: number;
      inputEventCount: number;
      windowChangeCount: number;
      resolution: { width: number; height: number };
      metadata?: Record<string, unknown>;
    }> =>
      ipcRenderer.invoke('sessionManager:stop', sessionId),
    pause: (sessionId: string): Promise<{ success: boolean }> =>
      ipcRenderer.invoke('sessionManager:pause', sessionId),
    resume: (sessionId: string): Promise<{ success: boolean }> =>
      ipcRenderer.invoke('sessionManager:resume', sessionId),
    getSession: (sessionId: string): Promise<{
      sessionId: string;
      status: 'starting' | 'recording' | 'paused' | 'stopping' | 'stopped' | 'error';
      startTime: number;
      pausedTime: number;
      sourceId: string;
      sourceName: string;
      config: Record<string, unknown>;
      captureSessionId: string | null;
      inputEventCount: number;
      windowChangeCount: number;
      errorMessage?: string;
    } | null> =>
      ipcRenderer.invoke('sessionManager:getSession', sessionId),
    getActive: (): Promise<Array<{
      sessionId: string;
      status: string;
      startTime: number;
      sourceId: string;
      sourceName: string;
    }>> =>
      ipcRenderer.invoke('sessionManager:getActive'),
    isRecording: (): Promise<boolean> =>
      ipcRenderer.invoke('sessionManager:isRecording'),
    // Event listeners
    onStarting: (callback: (data: { sessionId: string }) => void): void => {
      ipcRenderer.on('sessionManager:session:starting', (_, data) => callback(data));
    },
    onStarted: (callback: (data: { sessionId: string; sourceId: string; sourceName: string }) => void): void => {
      ipcRenderer.on('sessionManager:session:started', (_, data) => callback(data));
    },
    onPaused: (callback: (data: { sessionId: string }) => void): void => {
      ipcRenderer.on('sessionManager:session:paused', (_, data) => callback(data));
    },
    onResumed: (callback: (data: { sessionId: string }) => void): void => {
      ipcRenderer.on('sessionManager:session:resumed', (_, data) => callback(data));
    },
    onStopping: (callback: (data: { sessionId: string }) => void): void => {
      ipcRenderer.on('sessionManager:session:stopping', (_, data) => callback(data));
    },
    onStopped: (callback: (data: { sessionId: string; result: Record<string, unknown> }) => void): void => {
      ipcRenderer.on('sessionManager:session:stopped', (_, data) => callback(data));
    },
    onError: (callback: (data: { sessionId: string; error: string }) => void): void => {
      ipcRenderer.on('sessionManager:session:error', (_, data) => callback(data));
    },
    onProgress: (callback: (data: {
      sessionId: string;
      duration: number;
      inputEventCount: number;
      windowChangeCount: number;
    }) => void): void => {
      ipcRenderer.on('sessionManager:session:progress', (_, data) => callback(data));
    },
    removeAllListeners: (): void => {
      ipcRenderer.removeAllListeners('sessionManager:session:starting');
      ipcRenderer.removeAllListeners('sessionManager:session:started');
      ipcRenderer.removeAllListeners('sessionManager:session:paused');
      ipcRenderer.removeAllListeners('sessionManager:session:resumed');
      ipcRenderer.removeAllListeners('sessionManager:session:stopping');
      ipcRenderer.removeAllListeners('sessionManager:session:stopped');
      ipcRenderer.removeAllListeners('sessionManager:session:error');
      ipcRenderer.removeAllListeners('sessionManager:session:progress');
    }
  },

  // Input Events Database (persistent storage)
  inputEvents: {
    save: (recordingId: string, events: Array<{
      timestamp: number;
      type: string;
      x?: number;
      y?: number;
      button?: number;
      keycode?: number;
      key?: string;
      modifiers?: { ctrl: boolean; alt: boolean; shift: boolean; meta: boolean };
      scrollDelta?: { x: number; y: number };
      duration?: number;
    }>): Promise<number> =>
      ipcRenderer.invoke('inputEvents:save', recordingId, events),
    get: (recordingId: string, options?: {
      limit?: number;
      offset?: number;
      types?: string[];
    }): Promise<Array<{
      id: number;
      recordingId: string;
      timestampMs: number;
      eventType: string;
      x?: number;
      y?: number;
      button?: number;
      keycode?: number;
      keyName?: string;
      scrollDeltaX?: number;
      scrollDeltaY?: number;
      durationMs?: number;
      modifiers?: { ctrl: boolean; alt: boolean; shift: boolean; meta: boolean };
    }>> =>
      ipcRenderer.invoke('inputEvents:get', recordingId, options),
    getInRange: (recordingId: string, startMs: number, endMs: number): Promise<Array<{
      id: number;
      recordingId: string;
      timestampMs: number;
      eventType: string;
      x?: number;
      y?: number;
      button?: number;
      keycode?: number;
      keyName?: string;
      scrollDeltaX?: number;
      scrollDeltaY?: number;
      durationMs?: number;
      modifiers?: { ctrl: boolean; alt: boolean; shift: boolean; meta: boolean };
    }>> =>
      ipcRenderer.invoke('inputEvents:getInRange', recordingId, startMs, endMs),
    getSummary: (recordingId: string): Promise<{
      recordingId: string;
      totalEvents: number;
      clickCount: number;
      keystrokeCount: number;
      scrollCount: number;
      mouseMoveCount: number;
      firstEventMs: number | null;
      lastEventMs: number | null;
      createdAt: number;
    } | null> =>
      ipcRenderer.invoke('inputEvents:getSummary', recordingId),
    getCount: (recordingId: string): Promise<number> =>
      ipcRenderer.invoke('inputEvents:getCount', recordingId),
    delete: (recordingId: string): Promise<number> =>
      ipcRenderer.invoke('inputEvents:delete', recordingId)
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
