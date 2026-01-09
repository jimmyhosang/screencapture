/**
 * Global type declarations for window.api exposed by Electron preload script
 */

interface ElectronAPI {
    sessions: {
        getAll: () => Promise<unknown[]>;
        get: (id: string) => Promise<unknown | null>;
        save: (session: unknown) => Promise<{ success: boolean }>;
        delete: (id: string) => Promise<{ success: boolean }>;
        stats: () => Promise<{
            totalSessions: number;
            totalDuration: number;
            totalEvents: number;
            avgDuration: number;
        }>;
    };
    recording: {
        getSources: () => Promise<unknown[]>;
        startUrl: (url: string, config: unknown) => Promise<{ success: boolean; error?: string }>;
        stop: () => Promise<{ success: boolean; events?: unknown[]; duration?: number; error?: string }>;
        isActive: () => Promise<boolean>;
    };
    ocr: {
        initialize: () => Promise<{ engine: string }>;
        terminate: () => Promise<void>;
        selectTestImage: () => Promise<string | null>;
        processImage: (base64: string, width: number, height: number) => Promise<unknown>;
    };
    pii: {
        getColors: () => Promise<Record<string, string>>;
        scanImage: (base64: string, width: number, height: number) => Promise<{ ocrResult: unknown; piiResult: unknown }>;
    };
    settings: {
        get: (key: string) => Promise<unknown>;
        set: (key: string, value: unknown) => Promise<void>;
    };
    dialog: {
        openFile: (options?: unknown) => Promise<string | null>;
        saveFile: (options?: unknown) => Promise<string | null>;
    };
}

declare global {
    interface Window {
        api?: ElectronAPI;
    }
}

export { };
