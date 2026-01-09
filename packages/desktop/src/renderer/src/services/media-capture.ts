/**
 * Media Capture Service (Renderer Process)
 *
 * Handles MediaStream and MediaRecorder for desktop capture.
 * Communicates with main process via the window.api.capture API.
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

const CHUNK_INTERVAL_MS = 5000; // Send chunks every 5 seconds (more frequent for reliability)
const MIME_TYPE = 'video/webm;codecs=vp9';
const FALLBACK_MIME_TYPE = 'video/webm;codecs=vp8';
const BASIC_MIME_TYPE = 'video/webm';

// =============================================================================
// MediaCaptureService Class
// =============================================================================

class MediaCaptureService {
  private sessions: Map<string, CaptureSession> = new Map();
  private initialized: boolean = false;

  constructor() {
    // Don't auto-initialize - wait for explicit call
  }

  /**
   * Initialize the service and set up IPC listeners
   */
  initialize(): void {
    if (this.initialized) {
      return;
    }

    // Check if we're in Electron with the capture API
    if (!window.api?.capture) {
      console.warn('[MediaCapture] Not in Electron environment or capture API not available');
      return;
    }

    this.setupIPCListeners();
    this.initialized = true;
    console.log('[MediaCapture] Service initialized');
  }

  /**
   * Set up IPC listeners from main process using window.api
   */
  private setupIPCListeners(): void {
    // Listen for capture commands from main process
    window.api.capture.onStartMedia((data) => {
      console.log('[MediaCapture] Received startMedia command:', data.sessionId);
      this.startCapture(data.sessionId, data.sourceId, data.constraints as MediaConstraints);
    });

    window.api.capture.onStopMedia((data) => {
      console.log('[MediaCapture] Received stopMedia command:', data.sessionId);
      this.stopCapture(data.sessionId);
    });

    window.api.capture.onPauseMedia((data) => {
      console.log('[MediaCapture] Received pauseMedia command:', data.sessionId);
      this.pauseCapture(data.sessionId);
    });

    window.api.capture.onResumeMedia((data) => {
      console.log('[MediaCapture] Received resumeMedia command:', data.sessionId);
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
    console.log(`[MediaCapture] Source ID: ${sourceId}`);
    console.log(`[MediaCapture] Constraints:`, JSON.stringify(constraints, null, 2));

    try {
      // Get media stream from desktopCapturer
      console.log('[MediaCapture] Requesting media stream...');
      const stream = await navigator.mediaDevices.getUserMedia(constraints as unknown as MediaStreamConstraints);
      console.log(`[MediaCapture] Got media stream with ${stream.getVideoTracks().length} video tracks`);

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

      // Find supported MIME type
      let mimeType = BASIC_MIME_TYPE;
      if (MediaRecorder.isTypeSupported(MIME_TYPE)) {
        mimeType = MIME_TYPE;
      } else if (MediaRecorder.isTypeSupported(FALLBACK_MIME_TYPE)) {
        mimeType = FALLBACK_MIME_TYPE;
      }
      console.log(`[MediaCapture] Using MIME type: ${mimeType}`);

      // Create MediaRecorder
      session.recorder = new MediaRecorder(stream, {
        mimeType,
        videoBitsPerSecond: 2500000 // 2.5 Mbps default
      });

      // Handle data available - this is called periodically and when stop is called
      session.recorder.ondataavailable = (event) => {
        console.log(`[MediaCapture] Data available: ${event.data.size} bytes`);
        if (event.data.size > 0) {
          session.chunks.push(event.data);
          console.log(`[MediaCapture] Total chunks: ${session.chunks.length}`);
        }
      };

      // Handle recording start
      session.recorder.onstart = () => {
        console.log(`[MediaCapture] Recording started for session: ${sessionId}`);
        window.api.capture.notifyStarted(sessionId);
      };

      // Handle recording stop
      session.recorder.onstop = async () => {
        console.log(`[MediaCapture] Recording stopped for session: ${sessionId}`);
        console.log(`[MediaCapture] Final chunks count: ${session.chunks.length}`);
        await this.sendAllChunks(session);
        window.api.capture.notifyStopped(sessionId);
      };

      // Handle errors
      session.recorder.onerror = (event) => {
        console.error(`[MediaCapture] Recording error:`, event);
        window.api.capture.notifyError(sessionId, 'MediaRecorder error occurred');
      };

      this.sessions.set(sessionId, session);

      // Start recording with timeslice to get chunks periodically
      console.log(`[MediaCapture] Starting MediaRecorder with ${CHUNK_INTERVAL_MS}ms timeslice`);
      session.recorder.start(CHUNK_INTERVAL_MS);

      // Set up periodic chunk sending (backup)
      session.chunkInterval = setInterval(() => {
        if (session.chunks.length > 0) {
          this.sendPendingChunks(session);
        }
      }, CHUNK_INTERVAL_MS + 1000); // Slightly offset from recorder interval

    } catch (error) {
      console.error(`[MediaCapture] Failed to start capture:`, error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to start capture';
      window.api.capture.notifyError(sessionId, errorMessage);
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

    // Stop recorder - this will trigger onstop and send remaining data
    if (session.recorder && session.recorder.state !== 'inactive') {
      // Request data before stopping
      if (session.recorder.state === 'recording') {
        session.recorder.requestData();
      }
      session.recorder.stop();
    }

    // Stop all tracks
    if (session.stream) {
      session.stream.getTracks().forEach((track) => track.stop());
    }

    // Cleanup session after a delay to ensure all data is sent
    setTimeout(() => {
      this.sessions.delete(sessionId);
    }, 2000);
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

  /**
   * Check if service is initialized
   */
  isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * Cleanup resources
   */
  cleanup(): void {
    // Stop all active sessions
    for (const sessionId of this.sessions.keys()) {
      this.stopCapture(sessionId);
    }

    // Remove listeners
    if (window.api?.capture?.removeAllListeners) {
      window.api.capture.removeAllListeners();
    }

    this.initialized = false;
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

    console.log(`[MediaCapture] Sending ${session.chunks.length} pending chunks`);

    // Combine all pending chunks
    const blob = new Blob(session.chunks, { type: 'video/webm' });
    const arrayBuffer = await blob.arrayBuffer();

    console.log(`[MediaCapture] Chunk blob size: ${blob.size} bytes`);

    // Send to main process
    window.api.capture.sendChunk({
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
      console.log(`[MediaCapture] No chunks to send for session: ${session.sessionId}`);
      return;
    }

    // Wait a moment for any final data
    await new Promise((resolve) => setTimeout(resolve, 200));

    console.log(`[MediaCapture] Sending all ${session.chunks.length} final chunks`);

    // Send remaining chunks
    const blob = new Blob(session.chunks, { type: 'video/webm' });
    const arrayBuffer = await blob.arrayBuffer();

    console.log(`[MediaCapture] Final chunk blob size: ${blob.size} bytes`);

    window.api.capture.sendChunk({
      sessionId: session.sessionId,
      index: session.chunkIndex,
      data: arrayBuffer,
      timestamp: Date.now(),
      duration: Date.now() - session.startTime
    });

    session.chunks = [];
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
  const service = getMediaCaptureService();
  service.initialize();
}

export function cleanupMediaCapture(): void {
  if (instance) {
    instance.cleanup();
    instance = null;
  }
}
