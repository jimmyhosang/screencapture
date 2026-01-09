/**
 * Media Capture Service (Renderer Process)
 *
 * Handles MediaStream and MediaRecorder for desktop capture.
 * Communicates with main process via IPC.
 */

// =============================================================================
// Types
// =============================================================================

interface CaptureSession {
  sessionId: string;
  sourceId: string;
  stream: MediaStream | null;
  recorder: MediaRecorder | null;
  chunks: Blob[];
  chunkIndex: number;
  startTime: number;
  isPaused: boolean;
  chunkInterval: ReturnType<typeof setInterval> | null;
}

interface MediaConstraints {
  audio: boolean;
  video: {
    mandatory: {
      chromeMediaSource: string;
      chromeMediaSourceId: string;
      minWidth: number;
      maxWidth: number;
      minHeight: number;
      maxHeight: number;
      minFrameRate: number;
      maxFrameRate: number;
    };
  };
}

// =============================================================================
// Constants
// =============================================================================

const CHUNK_INTERVAL_MS = 10000; // Send chunks every 10 seconds
const MIME_TYPE = 'video/webm;codecs=vp9';
const FALLBACK_MIME_TYPE = 'video/webm;codecs=vp8';

// =============================================================================
// MediaCaptureService Class
// =============================================================================

class MediaCaptureService {
  private sessions: Map<string, CaptureSession> = new Map();

  constructor() {
    this.setupIPCListeners();
  }

  /**
   * Set up IPC listeners from main process
   */
  private setupIPCListeners(): void {
    // Listen for capture commands from main process
    window.electron?.ipcRenderer?.on('capture:startMedia', (_event: unknown, data: {
      sessionId: string;
      sourceId: string;
      constraints: MediaConstraints;
    }) => {
      this.startCapture(data.sessionId, data.sourceId, data.constraints);
    });

    window.electron?.ipcRenderer?.on('capture:stopMedia', (_event: unknown, data: {
      sessionId: string;
    }) => {
      this.stopCapture(data.sessionId);
    });

    window.electron?.ipcRenderer?.on('capture:pauseMedia', (_event: unknown, data: {
      sessionId: string;
    }) => {
      this.pauseCapture(data.sessionId);
    });

    window.electron?.ipcRenderer?.on('capture:resumeMedia', (_event: unknown, data: {
      sessionId: string;
    }) => {
      this.resumeCapture(data.sessionId);
    });
  }

  /**
   * Start capturing from a source
   */
  async startCapture(
    sessionId: string,
    sourceId: string,
    constraints: MediaConstraints
  ): Promise<void> {
    console.log(`[MediaCapture] Starting capture for session: ${sessionId}`);

    try {
      // Get media stream from desktopCapturer
      const stream = await navigator.mediaDevices.getUserMedia(constraints as unknown as MediaStreamConstraints);

      // Create session
      const session: CaptureSession = {
        sessionId,
        sourceId,
        stream,
        recorder: null,
        chunks: [],
        chunkIndex: 0,
        startTime: Date.now(),
        isPaused: false,
        chunkInterval: null
      };

      // Create MediaRecorder
      const mimeType = MediaRecorder.isTypeSupported(MIME_TYPE) ? MIME_TYPE : FALLBACK_MIME_TYPE;
      session.recorder = new MediaRecorder(stream, {
        mimeType,
        videoBitsPerSecond: 2500000 // 2.5 Mbps default
      });

      // Handle data available
      session.recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          session.chunks.push(event.data);
        }
      };

      // Handle recording start
      session.recorder.onstart = () => {
        console.log(`[MediaCapture] Recording started for session: ${sessionId}`);
        this.notifyMain('capture:started', { sessionId });
      };

      // Handle recording stop
      session.recorder.onstop = async () => {
        console.log(`[MediaCapture] Recording stopped for session: ${sessionId}`);
        await this.sendAllChunks(session);
      };

      // Handle errors
      session.recorder.onerror = (event) => {
        console.error(`[MediaCapture] Recording error:`, event);
        this.notifyMain('capture:error', {
          sessionId,
          error: 'MediaRecorder error occurred'
        });
      };

      this.sessions.set(sessionId, session);

      // Start recording
      session.recorder.start(CHUNK_INTERVAL_MS);

      // Set up periodic chunk sending
      session.chunkInterval = setInterval(() => {
        this.sendPendingChunks(session);
      }, CHUNK_INTERVAL_MS);

    } catch (error) {
      console.error(`[MediaCapture] Failed to start capture:`, error);
      this.notifyMain('capture:error', {
        sessionId,
        error: error instanceof Error ? error.message : 'Failed to start capture'
      });
    }
  }

  /**
   * Stop capturing
   */
  async stopCapture(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      console.warn(`[MediaCapture] Session not found: ${sessionId}`);
      return;
    }

    console.log(`[MediaCapture] Stopping capture for session: ${sessionId}`);

    // Clear chunk interval
    if (session.chunkInterval) {
      clearInterval(session.chunkInterval);
      session.chunkInterval = null;
    }

    // Stop recorder
    if (session.recorder && session.recorder.state !== 'inactive') {
      session.recorder.stop();
    }

    // Stop all tracks
    if (session.stream) {
      session.stream.getTracks().forEach((track) => track.stop());
    }

    // Send any remaining chunks
    await this.sendAllChunks(session);

    // Cleanup
    this.sessions.delete(sessionId);
  }

  /**
   * Pause capturing
   */
  pauseCapture(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (!session || !session.recorder) {
      return;
    }

    if (session.recorder.state === 'recording') {
      session.recorder.pause();
      session.isPaused = true;
      console.log(`[MediaCapture] Paused capture for session: ${sessionId}`);
    }
  }

  /**
   * Resume capturing
   */
  resumeCapture(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (!session || !session.recorder) {
      return;
    }

    if (session.recorder.state === 'paused') {
      session.recorder.resume();
      session.isPaused = false;
      console.log(`[MediaCapture] Resumed capture for session: ${sessionId}`);
    }
  }

  /**
   * Get active sessions
   */
  getActiveSessions(): string[] {
    return Array.from(this.sessions.keys());
  }

  /**
   * Check if a session is active
   */
  isSessionActive(sessionId: string): boolean {
    return this.sessions.has(sessionId);
  }

  // ===========================================================================
  // Private Methods
  // ===========================================================================

  /**
   * Send pending chunks to main process
   */
  private async sendPendingChunks(session: CaptureSession): Promise<void> {
    if (session.chunks.length === 0) {
      return;
    }

    // Combine all pending chunks
    const blob = new Blob(session.chunks, { type: 'video/webm' });
    const arrayBuffer = await blob.arrayBuffer();

    // Send to main process
    this.notifyMain('capture:chunk', {
      sessionId: session.sessionId,
      index: session.chunkIndex,
      data: arrayBuffer,
      timestamp: Date.now(),
      duration: Date.now() - session.startTime
    });

    // Clear sent chunks
    session.chunkIndex++;
    session.chunks = [];
  }

  /**
   * Send all remaining chunks
   */
  private async sendAllChunks(session: CaptureSession): Promise<void> {
    if (session.chunks.length === 0) {
      return;
    }

    // Wait a moment for any final data
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Send remaining chunks
    const blob = new Blob(session.chunks, { type: 'video/webm' });
    const arrayBuffer = await blob.arrayBuffer();

    this.notifyMain('capture:chunk', {
      sessionId: session.sessionId,
      index: session.chunkIndex,
      data: arrayBuffer,
      timestamp: Date.now(),
      duration: Date.now() - session.startTime
    });

    session.chunks = [];
  }

  /**
   * Send message to main process
   */
  private notifyMain(channel: string, data: unknown): void {
    window.electron?.ipcRenderer?.send(channel, data);
  }
}

// =============================================================================
// Singleton Export
// =============================================================================

let instance: MediaCaptureService | null = null;

export function getMediaCaptureService(): MediaCaptureService {
  if (!instance) {
    instance = new MediaCaptureService();
  }
  return instance;
}

export function initializeMediaCapture(): void {
  getMediaCaptureService();
}

// Type declaration for window.electron
declare global {
  interface Window {
    electron?: {
      ipcRenderer?: {
        on: (channel: string, callback: (event: unknown, ...args: unknown[]) => void) => void;
        send: (channel: string, data: unknown) => void;
        invoke: (channel: string, ...args: unknown[]) => Promise<unknown>;
      };
    };
  }
}
