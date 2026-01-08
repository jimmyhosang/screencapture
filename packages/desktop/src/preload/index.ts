import { contextBridge, ipcRenderer } from 'electron';
import type { SessionRecord, SessionStats, AppSettings, VideoRecording, VideoRecordingStats, ExportOptions } from '../main/types';

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
