import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { setupRecordingHandlers } from './recorder';
import { BrowserWindow } from 'electron';

const mocks = vi.hoisted(() => {
    const windowListeners: Record<string, Function> = {};
    return {
        windowListeners,
        loadURL: vi.fn().mockResolvedValue(undefined),
        close: vi.fn(() => windowListeners['closed']?.()),
        destroy: vi.fn(),
        send: vi.fn(),
        handle: vi.fn(),
        on: vi.fn(),
        removeListener: vi.fn(),
        getSources: vi.fn().mockResolvedValue([{ id: 'screen:1', name: 'Screen 1', thumbnail: { toDataURL: () => 'data:img' } }])
    };
});

const RECORDER_WC_ID = 42;

vi.mock('electron', () => {
    const MockBrowserWindow = vi.fn(function () {
        return {
            loadURL: mocks.loadURL,
            webContents: { id: RECORDER_WC_ID, on: vi.fn(), send: mocks.send },
            on: (event: string, fn: Function) => { mocks.windowListeners[event] = fn; },
            close: mocks.close,
            destroy: mocks.destroy,
            isDestroyed: () => false
        };
    });
    return {
        ipcMain: { handle: mocks.handle, on: mocks.on, removeListener: mocks.removeListener },
        desktopCapturer: { getSources: mocks.getSources },
        BrowserWindow: MockBrowserWindow
    };
});

describe('URL recorder', () => {
    let handlers: Record<string, Function> = {};
    let listeners: Record<string, Function[]> = {};

    /** Simulate a message from a renderer (default: the recording window) */
    const fromRenderer = (channel: string, payload?: unknown, senderId = RECORDER_WC_ID) => {
        const event: { sender: { id: number }; returnValue?: unknown } = { sender: { id: senderId } };
        for (const fn of listeners[channel] ?? []) fn(event, payload);
        return event;
    };

    beforeEach(() => {
        vi.clearAllMocks();
        handlers = {};
        listeners = {};
        mocks.handle.mockImplementation((channel: string, fn: Function) => { handlers[channel] = fn; });
        mocks.on.mockImplementation((channel: string, fn: Function) => {
            (listeners[channel] ??= []).push(fn);
        });
        mocks.removeListener.mockImplementation((channel: string, fn: Function) => {
            listeners[channel] = (listeners[channel] ?? []).filter((f) => f !== fn);
        });
        // The preload acknowledges a stop request right away
        mocks.send.mockImplementation((channel: string) => {
            if (channel === 'recorder:stop') fromRenderer('recorder:stopped');
        });
        setupRecordingHandlers();
    });

    afterEach(async () => {
        await handlers['recording:stop']?.(null);
    });

    it('registers IPC handlers for the UI and the recorder preload', () => {
        for (const ch of ['recording:getSources', 'recording:startUrl', 'recording:stop', 'recording:isActive']) {
            expect(handlers[ch]).toBeTypeOf('function');
        }
        expect(listeners['recorder:getConfig']).toHaveLength(1);
        expect(listeners['recorder:event']).toHaveLength(1);
    });

    it('lists capture sources', async () => {
        const result = await handlers['recording:getSources'](null);
        expect(result).toEqual([{ id: 'screen:1', name: 'Screen 1', type: 'screen', thumbnailDataUrl: 'data:img' }]);
    });

    it('opens the URL in a window that records via the bundled preload', async () => {
        const result = await handlers['recording:startUrl'](null, 'https://example.com', { maskAllInputs: true });

        expect(result).toEqual({ success: true });
        const options = (BrowserWindow as any).mock.calls[0][0];
        expect(options.webPreferences.preload).toMatch(/preload[\\/]recorder\.mjs$/);
        expect(options.webPreferences.contextIsolation).toBe(true);
        expect(options.webPreferences.webSecurity).not.toBe(false);
        expect(mocks.loadURL).toHaveBeenCalledWith('https://example.com');
        expect(await handlers['recording:isActive'](null)).toBe(true);
    });

    it('gives the privacy config only to the recording window', async () => {
        const config = { maskAllInputs: true, maskTextContent: true };
        await handlers['recording:startUrl'](null, 'https://example.com', config);

        expect(fromRenderer('recorder:getConfig').returnValue).toEqual(config);
        expect(fromRenderer('recorder:getConfig', undefined, 7).returnValue).toBeNull();
    });

    it('rejects invalid and non-web URLs', async () => {
        expect((await handlers['recording:startUrl'](null, 'not a url', {})).success).toBe(false);
        expect((await handlers['recording:startUrl'](null, 'javascript:alert(1)', {})).success).toBe(false);
        expect(BrowserWindow).not.toHaveBeenCalled();
    });

    it('prevents a second recording while one is active', async () => {
        await handlers['recording:startUrl'](null, 'https://1.com', {});
        const result = await handlers['recording:startUrl'](null, 'https://2.com', {});
        expect(result).toEqual({ success: false, error: 'Recording already in progress' });
    });

    it('returns events streamed from the recording window and closes it', async () => {
        await handlers['recording:startUrl'](null, 'https://example.com', {});
        fromRenderer('recorder:event', { type: 4 });
        fromRenderer('recorder:event', { type: 2 });
        fromRenderer('recorder:event', { type: 99 }, 7); // other window: ignored
        // A navigation means a fresh page, but events keep accumulating
        fromRenderer('recorder:event', { type: 4 });

        const result = await handlers['recording:stop'](null);

        expect(mocks.send).toHaveBeenCalledWith('recorder:stop');
        expect(result.success).toBe(true);
        expect(result.events).toEqual([{ type: 4 }, { type: 2 }, { type: 4 }]);
        expect(mocks.close).toHaveBeenCalled();
        expect(await handlers['recording:isActive'](null)).toBe(false);
    });

    it('keeps captured events if the user closes the window before stopping', async () => {
        await handlers['recording:startUrl'](null, 'https://example.com', {});
        fromRenderer('recorder:event', { type: 4 });
        fromRenderer('recorder:event', { type: 2 });
        mocks.windowListeners['closed']();

        const result = await handlers['recording:stop'](null);
        expect(result.success).toBe(true);
        expect(result.events).toHaveLength(2);
    });

    it('does not report success for a recording with nothing captured', async () => {
        await handlers['recording:startUrl'](null, 'https://example.com', {});
        const result = await handlers['recording:stop'](null);
        expect(result.success).toBe(false);
        expect(result.error).toMatch(/Nothing was captured/);
    });
});
