/**
 * Capture Preload Script
 *
 * Exposes desktop capture APIs to the renderer process via contextBridge.
 */

import { contextBridge, ipcRenderer, desktopCapturer } from 'electron';

// =============================================================================
// Capture API
// =============================================================================

const captureAPI = {
  /**
   * Get available capture sources (screens and windows)
   */
  getSources: async (): Promise<Array<{
    id: string;
    name: string;
    thumbnail: string;
    displayId?: string;
    isScreen: boolean;
    isWindow: boolean;
    appIcon?: string;
  }>> => {
    return ipcRenderer.invoke('capture:getSources');
  },

  /**
   * Get media stream for a source (used by renderer MediaRecorder)
   */
  getMediaStream: async (sourceId: string, constraints?: {
    width?: number;
    height?: number;
    frameRate?: number;
  }): Promise<MediaStream> => {
    const sources = await desktopCapturer.getSources({
      types: ['screen', 'window']
    });

    const source = sources.find((s) => s.id === sourceId);
    if (!source) {
      throw new Error(`Source not found: ${sourceId}`);
    }

    // Build constraints for getUserMedia
    const width = constraints?.width || 1920;
    const height = constraints?.height || 1080;
    const frameRate = constraints?.frameRate || 30;

    const stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        // @ts-expect-error - Electron-specific mandatory constraints
        mandatory: {
          chromeMediaSource: 'desktop',
          chromeMediaSourceId: sourceId,
          minWidth: width,
          maxWidth: width,
          minHeight: height,
          maxHeight: height,
          minFrameRate: frameRate,
          maxFrameRate: frameRate
        }
      }
    });

    return stream;
  },

  /**
   * Start a capture session
   */
  startCapture: async (options: {
    sourceId: string;
    quality?: 'low' | 'medium' | 'high' | 'ultra';
    resolution?: { width: number; height: number };
    frameRate?: number;
    metadata?: Record<string, unknown>;
  }): Promise<{ sessionId: string }> => {
    return ipcRenderer.invoke('capture:start', options);
  },

  /**
   * Stop a capture session
   */
  stopCapture: async (sessionId: string): Promise<{
    sessionId: string;
    filePath: string;
    duration: number;
    fileSize: number;
  }> => {
    return ipcRenderer.invoke('capture:stop', sessionId);
  },

  /**
   * Pause a capture session
   */
  pauseCapture: async (sessionId: string): Promise<void> => {
    return ipcRenderer.invoke('capture:pause', sessionId);
  },

  /**
   * Resume a paused capture session
   */
  resumeCapture: async (sessionId: string): Promise<void> => {
    return ipcRenderer.invoke('capture:resume', sessionId);
  },

  /**
   * Get state of a capture session
   */
  getSessionState: async (sessionId: string): Promise<{
    sessionId: string;
    sourceId: string;
    sourceName: string;
    status: string;
    startTime: number;
    duration: number;
  } | null> => {
    return ipcRenderer.invoke('capture:getState', sessionId);
  },

  /**
   * Get all active capture sessions
   */
  getActiveSessions: async (): Promise<Array<{
    sessionId: string;
    sourceId: string;
    sourceName: string;
    status: string;
    startTime: number;
  }>> => {
    return ipcRenderer.invoke('capture:getActive');
  },

  /**
   * Send a video chunk to main process
   */
  sendChunk: (data: {
    sessionId: string;
    index: number;
    data: ArrayBuffer;
    timestamp: number;
    duration: number;
  }): void => {
    ipcRenderer.send('capture:chunk', data);
  },

  /**
   * Listen for capture events
   */
  onCaptureStarted: (callback: (data: {
    sessionId: string;
    sourceId: string;
    sourceName: string;
  }) => void): void => {
    ipcRenderer.on('capture:started', (_, data) => callback(data));
  },

  onCaptureStopped: (callback: (data: {
    sessionId: string;
    filePath: string;
    duration: number;
    fileSize: number;
  }) => void): void => {
    ipcRenderer.on('capture:stopped', (_, data) => callback(data));
  },

  onCapturePaused: (callback: (data: { sessionId: string }) => void): void => {
    ipcRenderer.on('capture:paused', (_, data) => callback(data));
  },

  onCaptureResumed: (callback: (data: { sessionId: string }) => void): void => {
    ipcRenderer.on('capture:resumed', (_, data) => callback(data));
  },

  onCaptureError: (callback: (data: {
    sessionId: string;
    error: string;
  }) => void): void => {
    ipcRenderer.on('capture:error', (_, data) => callback(data));
  },

  onCaptureProgress: (callback: (data: {
    sessionId: string;
    duration: number;
    chunkCount: number;
  }) => void): void => {
    ipcRenderer.on('capture:progress', (_, data) => callback(data));
  },

  /**
   * Listen for media capture commands from main process
   */
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

  /**
   * Notify main process of capture events from renderer
   */
  notifyCaptureStarted: (sessionId: string): void => {
    ipcRenderer.send('capture:started', { sessionId });
  },

  notifyCaptureStopped: (sessionId: string): void => {
    ipcRenderer.send('capture:stopped', { sessionId });
  },

  notifyCaptureError: (sessionId: string, error: string): void => {
    ipcRenderer.send('capture:error', { sessionId, error });
  },

  /**
   * Remove all capture event listeners
   */
  removeAllListeners: (): void => {
    ipcRenderer.removeAllListeners('capture:started');
    ipcRenderer.removeAllListeners('capture:stopped');
    ipcRenderer.removeAllListeners('capture:paused');
    ipcRenderer.removeAllListeners('capture:resumed');
    ipcRenderer.removeAllListeners('capture:error');
    ipcRenderer.removeAllListeners('capture:progress');
    ipcRenderer.removeAllListeners('capture:startMedia');
    ipcRenderer.removeAllListeners('capture:stopMedia');
    ipcRenderer.removeAllListeners('capture:pauseMedia');
    ipcRenderer.removeAllListeners('capture:resumeMedia');
  }
};

// =============================================================================
// Export
// =============================================================================

export type CaptureAPI = typeof captureAPI;

export function exposeCaptureAPI(): void {
  if (process.contextIsolated) {
    try {
      contextBridge.exposeInMainWorld('capture', captureAPI);
    } catch (error) {
      console.error('[Capture Preload] Failed to expose API:', error);
    }
  } else {
    // @ts-expect-error - Fallback for non-isolated context
    window.capture = captureAPI;
  }
}
