/**
 * Recording Module - Handles screen/window recording with rrweb
 * 
 * Opens a BrowserWindow to the target URL and injects rrweb for DOM recording
 * with privacy controls from @screencapture/core.
 */

import { BrowserWindow, ipcMain, desktopCapturer } from 'electron';

/**
 * Recorder configuration compatible with @screencapture/core
 */
interface RecorderConfig {
    maskAllInputs?: boolean;
    maskTextContent?: boolean;
    blockSelectors?: string[];
    maskTextSelectors?: string[];
    maskInputOptions?: {
        password?: boolean;
        email?: boolean;
        tel?: boolean;
        text?: boolean;
        textarea?: boolean;
    };
}

interface RecordingSource {
    id: string;
    name: string;
    type: 'screen' | 'window';
    thumbnailDataUrl?: string;
}

interface RecordingSession {
    window: BrowserWindow;
    events: unknown[];
    startTime: number;
    config: Partial<RecorderConfig>;
}

let activeRecording: RecordingSession | null = null;

/**
 * Get available screens and windows for recording
 */
async function getSources(): Promise<RecordingSource[]> {
    const sources = await desktopCapturer.getSources({
        types: ['screen', 'window'],
        thumbnailSize: { width: 150, height: 150 }
    });

    return sources.map(source => ({
        id: source.id,
        name: source.name,
        type: source.id.startsWith('screen') ? 'screen' as const : 'window' as const,
        thumbnailDataUrl: source.thumbnail.toDataURL()
    }));
}

/**
 * Generate rrweb injection script with privacy config
 */
function generateRecordingScript(config: Partial<RecorderConfig>): string {
    const maskAllInputs = config.maskAllInputs ?? true;
    const blockClass = config.blockSelectors?.filter(s => s.startsWith('.')).map(s => s.slice(1)).join('|') || 'do-not-record';
    const maskTextSelector = config.maskTextSelectors?.join(', ') || '.sensitive, .pii, [data-sensitive]';

    return `
    (function() {
      const script = document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/npm/rrweb@2.0.0-alpha.4/dist/rrweb.min.js';
      script.onload = function() {
        window.__rrwebEvents = [];
        window.__rrwebStopFn = rrweb.record({
          emit: function(event) {
            window.__rrwebEvents.push(event);
          },
          maskAllInputs: ${maskAllInputs},
          blockClass: /${blockClass}/,
          maskTextSelector: '${maskTextSelector}',
          maskInputOptions: {
            password: true,
            email: ${config.maskInputOptions?.email ?? true},
            tel: ${config.maskInputOptions?.tel ?? true},
            text: ${config.maskInputOptions?.text ?? false},
            textarea: ${config.maskInputOptions?.textarea ?? false}
          },
          inlineStylesheet: true,
          collectFonts: true
        });
        console.log('[Screencapture] Recording started with privacy config');
      };
      document.head.appendChild(script);
    })();
  `;
}

/**
 * Start recording a URL in a new BrowserWindow
 */
async function startRecordingUrl(
    url: string,
    config: Partial<RecorderConfig>
): Promise<{ success: boolean; error?: string }> {
    if (activeRecording) {
        return { success: false, error: 'Recording already in progress' };
    }

    try {
        // Create recording window
        const recordingWindow = new BrowserWindow({
            width: 1280,
            height: 720,
            title: `Recording: ${url}`,
            webPreferences: {
                nodeIntegration: false,
                contextIsolation: true,
                sandbox: false, // Disable sandbox to allow cross-origin requests
                webSecurity: false // Allow loading cross-origin resources for recording
            }
        });

        // Handle navigation failures
        recordingWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL) => {
            // Ignore -3 (ERR_ABORTED) as it often happens during redirects
            if (errorCode !== -3) {
                console.error(`Failed to load ${validatedURL}: ${errorDescription} (${errorCode})`);
            }
        });

        // Load the target URL
        await recordingWindow.loadURL(url);

        // Wait a moment for page to settle before injecting script
        await new Promise(resolve => setTimeout(resolve, 500));

        // Inject rrweb recording script
        await recordingWindow.webContents.executeJavaScript(generateRecordingScript(config));

        activeRecording = {
            window: recordingWindow,
            events: [],
            startTime: Date.now(),
            config
        };

        // Handle window closing
        recordingWindow.on('closed', () => {
            activeRecording = null;
        });

        return { success: true };
    } catch (error) {
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Failed to start recording'
        };
    }
}

/**
 * Stop recording and return captured events
 */
async function stopRecording(): Promise<{
    success: boolean;
    events?: unknown[];
    duration?: number;
    error?: string;
}> {
    if (!activeRecording) {
        return { success: false, error: 'No active recording' };
    }

    try {
        const { window, startTime } = activeRecording;

        // Stop rrweb and get events
        const events = await window.webContents.executeJavaScript(`
      if (window.__rrwebStopFn) {
        window.__rrwebStopFn();
      }
      window.__rrwebEvents || [];
    `);

        const duration = Date.now() - startTime;

        // Close the recording window
        window.close();
        activeRecording = null;

        return {
            success: true,
            events,
            duration
        };
    } catch (error) {
        activeRecording = null;
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Failed to stop recording'
        };
    }
}

/**
 * Check if recording is active
 */
function isRecording(): boolean {
    return activeRecording !== null;
}

/**
 * Setup IPC handlers for recording operations
 */
export function setupRecordingHandlers(): void {
    ipcMain.handle('recording:getSources', getSources);

    ipcMain.handle('recording:startUrl', async (_, url: string, config: Partial<RecorderConfig>) => {
        return startRecordingUrl(url, config);
    });

    ipcMain.handle('recording:stop', stopRecording);

    ipcMain.handle('recording:isActive', isRecording);
}
