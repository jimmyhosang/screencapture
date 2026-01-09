
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ManualRedactionManager } from './manualRedaction';
import { join } from 'path';
import { mkdirSync, rmSync, existsSync } from 'fs';
import os from 'os';

// Mock Electron app.getPath
const mockUserDataPath = join(os.tmpdir(), 'screencapture-test-redaction-' + Date.now());

vi.mock('electron', () => ({
    app: {
        getPath: () => mockUserDataPath,
    },
}));

describe('ManualRedactionManager', () => {
    let manager: ManualRedactionManager;

    beforeEach(() => {
        // Clean up temp dir
        if (existsSync(mockUserDataPath)) {
            rmSync(mockUserDataPath, { recursive: true, force: true });
        }
        mkdirSync(mockUserDataPath, { recursive: true });

        // Create new instance
        manager = new ManualRedactionManager();
    });

    afterEach(() => {
        // Cleanup
        if (existsSync(mockUserDataPath)) {
            rmSync(mockUserDataPath, { recursive: true, force: true });
        }
        vi.clearAllMocks();
    });

    describe('App Block Rules', () => {
        it('should load default rules if no file exists', () => {
            const rules = manager.getAppBlockRules();
            expect(rules.length).toBeGreaterThan(0);
            expect(rules.find(r => r.id === 'slack-default')).toBeDefined();
        });

        it('should add a new blocking rule', () => {
            const newRule = manager.addAppBlockRule({
                name: 'Test Rule',
                matchType: 'contains',
                pattern: 'Secret',
                action: 'blur',
                enabled: true,
            });

            expect(newRule.id).toBeDefined();
            expect(manager.getAppBlockRules()).toContainEqual(newRule);
        });

        it('should match a window against rules', () => {
            // Enable a rule first
            manager.addAppBlockRule({
                name: 'Confidential Doc',
                matchType: 'contains',
                pattern: 'Confidential',
                action: 'solid',
                enabled: true,
            });

            const match = manager.matchWindowToRules({
                id: '1',
                title: 'Project X - Confidential Design',
                appName: 'Figma',
                ownerName: 'Figma',
                width: 100,
                height: 100,
                x: 0,
                y: 0,
            });

            expect(match).toBeDefined();
            expect(match?.name).toBe('Confidential Doc');
        });

        it('should not match if rule is disabled', () => {
            manager.addAppBlockRule({
                name: 'Disabled Rule',
                matchType: 'contains',
                pattern: 'Confidential',
                action: 'solid',
                enabled: false,
            });

            const match = manager.matchWindowToRules({
                id: '1',
                title: 'Project X - Confidential Design',
                appName: 'Figma',
                ownerName: 'Figma',
                width: 100,
                height: 100,
                x: 0,
                y: 0,
            });

            expect(match).toBeNull();
        });
    });

    describe('Sessions', () => {
        it('should create a new session', () => {
            const session = manager.createSession('test-recording-1', 1000, { width: 1920, height: 1080 });
            expect(session.recordingId).toBe('test-recording-1');
            expect(session.tracks).toHaveLength(3); // manual, auto, app
            expect(manager.getSession('test-recording-1')).toBeDefined();
        });

        it('should persist session to disk', () => {
            manager.createSession('test-save', 500, { width: 800, height: 600 });
            const saved = manager.saveSession('test-save');
            expect(saved).toBe(true);

            // Verify file exists
            const sessionPath = join(mockUserDataPath, 'redaction', 'sessions', 'test-save.json');
            expect(existsSync(sessionPath)).toBe(true);
        });
    });

    describe('Manual Regions', () => {
        it('should add a manual region and update timeline', () => {
            manager.createSession('rec-1', 1000, { width: 100, height: 100 });

            const region = manager.addRegion('rec-1', {
                type: 'static',
                startTime: 0,
                endTime: 100,
                bounds: { x: 10, y: 10, width: 50, height: 50 },
                label: 'Sensitive Area',
            });

            expect(region).toBeDefined();

            const session = manager.getSession('rec-1');
            const manualTrack = session?.tracks.find(t => t.id === 'manual');

            expect(manualTrack?.events).toHaveLength(1);
            expect(manualTrack?.events[0].sourceId).toBe(region?.id);
        });
    });

    describe('Profiles', () => {
        it('should create and retrieve a profile', () => {
            const profile = manager.createProfile({
                name: 'My Custom Profile',
                description: 'Test profile',
                appBlockRules: [],
                autoRedactionRules: [],
            });

            expect(profile.id).toBeDefined();
            expect(manager.getProfile(profile.id)).toEqual(profile);

            // Verify persistence
            const profilePath = join(mockUserDataPath, 'redaction', 'profiles', `${profile.id}.json`);
            expect(existsSync(profilePath)).toBe(true);
        });
    });
});
