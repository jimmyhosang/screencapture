import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { setupRecordingHandlers } from './recorder';
import { ipcMain, BrowserWindow, desktopCapturer } from 'electron';

// Explicitly hoist mocks to reference them in tests
const mocks = vi.hoisted(() => {
    return {
        loadURL: vi.fn().mockResolvedValue(undefined),
        close: vi.fn(),
        on: vi.fn(),
        executeJavaScript: vi.fn().mockResolvedValue([]),
        handle: vi.fn(),
        getSources: vi.fn().mockResolvedValue([{ id: 'screen:1', name: 'Screen 1', thumbnail: { toDataURL: () => 'data:img' } }])
    };
});

vi.mock('electron', () => {
    // Use a regular function for the mock implementation to support 'new'
    const MockBrowserWindow = vi.fn(function (options) { // Capture options
        // Store options for verification if needed, or simply let the testspy capture it
        return {
            loadURL: mocks.loadURL,
            webContents: {
                executeJavaScript: mocks.executeJavaScript,
                on: mocks.on
            },
            on: mocks.on,
            close: mocks.close,
            options // Expose options for test assertion if we returned the instance, but verification is done on constructor spy
        };
    });

    return {
        ipcMain: {
            handle: mocks.handle,
        },
        desktopCapturer: {
            getSources: mocks.getSources,
        },
        BrowserWindow: MockBrowserWindow,
    };
});

describe('Recorder Logic', () => {
    let handlers: Record<string, Function> = {};

    beforeEach(() => {
        vi.clearAllMocks();
        handlers = {};

        mocks.handle.mockImplementation((channel: string, listener: Function) => {
            handlers[channel] = listener;
        });

        setupRecordingHandlers();
    });

    afterEach(async () => {
        if (handlers['recording:stop']) {
            await handlers['recording:stop'](null);
        }
    });

    it('should register all recording handlers', () => {
        expect(mocks.handle).toHaveBeenCalledWith('recording:getSources', expect.any(Function));
        expect(mocks.handle).toHaveBeenCalledWith('recording:startUrl', expect.any(Function));
        expect(mocks.handle).toHaveBeenCalledWith('recording:stop', expect.any(Function));
        expect(mocks.handle).toHaveBeenCalledWith('recording:isActive', expect.any(Function));
    });

    it('should get recording sources', async () => {
        const result = await handlers['recording:getSources'](null);

        expect(mocks.getSources).toHaveBeenCalledWith({
            types: ['screen', 'window'],
            thumbnailSize: { width: 150, height: 150 }
        });
        expect(result).toHaveLength(1);
        expect(result[0].id).toBe('screen:1');
    });

    it('should start recording a URL', async () => {
        const url = 'https://example.com';
        const config = { maskAllInputs: true };

        const result = await handlers['recording:startUrl'](null, url, config);

        expect(result).toEqual({ success: true });
        expect(BrowserWindow).toHaveBeenCalledTimes(1);

        // Verify webPreferences fix for ERR_ABORTED
        const constructorOptions = (BrowserWindow as any).mock.calls[0][0];
        expect(constructorOptions.webPreferences.sandbox).toBe(false);
        expect(constructorOptions.webPreferences.webSecurity).toBe(false);

        expect(mocks.loadURL).toHaveBeenCalledWith(url);
        expect(mocks.executeJavaScript).toHaveBeenCalled();

        const isActive = await handlers['recording:isActive'](null);
        expect(isActive).toBe(true);
    });

    it('should prevent double recording', async () => {
        await handlers['recording:startUrl'](null, 'https://1.com', {});

        const result = await handlers['recording:startUrl'](null, 'https://2.com', {});

        expect(result.success).toBe(false);
        expect(result.error).toBe('Recording already in progress');
    });

    it('should stop recording', async () => {
        await handlers['recording:startUrl'](null, 'https://example.com', {});

        const result = await handlers['recording:stop'](null);

        expect(result.success).toBe(true);
        expect(mocks.close).toHaveBeenCalled();

        const isActive = await handlers['recording:isActive'](null);
        expect(isActive).toBe(false);
    });
});
