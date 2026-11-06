/**
 * Recording Module - Handles screen/window recording with rrweb
 * 
 * Opens a BrowserWindow to the target URL; a bundled preload records the DOM
 * with rrweb and redacts PII using @screencapture/core.
 */

import { BrowserWindow, ipcMain, desktopCapturer } from 'electron';
import { join } from 'path';

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
    /** null once the user has closed the recording window */
    window: BrowserWindow | null;
    webContentsId: number;
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
 * Start recording a URL in a new BrowserWindow.
 *
 * Recording is done by a bundled preload (preload/recorder) that runs in every
 * page the window loads and streams rrweb events here, so it works offline,
 * isn't blocked by the page's CSP, and keeps recording across navigation.
 */
async function startRecordingUrl(
    url: string,
    config: Partial<RecorderConfig>
): Promise<{ success: boolean; error?: string }> {
    if (activeRecording) {
        return { success: false, error: 'Recording already in progress' };
    }

    let parsed: URL;
    try {
        parsed = new URL(url);
    } catch {
        return { success: false, error: 'Please enter a valid URL' };
    }
    if (!['http:', 'https:', 'file:'].includes(parsed.protocol)) {
        return { success: false, error: 'Only http, https and file URLs can be recorded' };
    }

    try {
        const recordingWindow = new BrowserWindow({
            width: 1280,
            height: 720,
            title: `Recording: ${url}`,
            webPreferences: {
                preload: join(__dirname, '../preload/recorder.mjs'),
                nodeIntegration: false,
                contextIsolation: true,
                sandbox: false // required for the ESM preload
            }
        });

        activeRecording = {
            window: recordingWindow,
            webContentsId: recordingWindow.webContents.id,
            events: [],
            startTime: Date.now(),
            config
        };

        // Keep what was captured if the user closes the window before stopping
        recordingWindow.on('closed', () => {
            if (activeRecording?.window === recordingWindow) {
                activeRecording.window = null;
            }
        });

        recordingWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL) => {
            // Ignore -3 (ERR_ABORTED) as it often happens during redirects
            if (errorCode !== -3) {
                console.error(`Failed to load ${validatedURL}: ${errorDescription} (${errorCode})`);
            }
        });

        await recordingWindow.loadURL(url);
        return { success: true };
    } catch (error) {
        activeRecording?.window?.destroy();
        activeRecording = null;
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

    const recording = activeRecording;
    const win = recording.window;

    // Ask the page to stop and wait until its last events have arrived
    if (win && !win.isDestroyed()) {
        await new Promise<void>((resolve) => {
            const timeout = setTimeout(done, 2000);
            function done(): void {
                clearTimeout(timeout);
                ipcMain.removeListener('recorder:stopped', onStopped);
                resolve();
            }
            function onStopped(event: Electron.IpcMainEvent): void {
                if (event.sender.id === recording.webContentsId) done();
            }
            ipcMain.on('recorder:stopped', onStopped);
            win.webContents.send('recorder:stop');
        });
        win.close();
    }

    activeRecording = null;
    const duration = Date.now() - recording.startTime;

    // A recording needs at least a meta + full snapshot event to be playable
    if (recording.events.length < 2) {
        return {
            success: false,
            error: 'Nothing was captured from the page, so the recording was not saved'
        };
    }

    return { success: true, events: recording.events, duration };
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

    // Recorder preload: config lookup (sync, so it can start before page scripts)
    ipcMain.on('recorder:getConfig', (event) => {
        event.returnValue =
            activeRecording && event.sender.id === activeRecording.webContentsId
                ? activeRecording.config
                : null;
    });

    // Recorder preload: captured events (across every page the window visits)
    ipcMain.on('recorder:event', (event, rrwebEvent: unknown) => {
        if (activeRecording && event.sender.id === activeRecording.webContentsId) {
            activeRecording.events.push(rrwebEvent);
        }
    });
}
