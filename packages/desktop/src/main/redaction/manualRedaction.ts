/**
 * Manual Redaction Service
 *
 * Handles manual region marking, app blocking rules, and redaction profiles.
 */

import { app } from 'electron';
import { join } from 'path';
import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync, unlinkSync } from 'fs';
import type {
  ManualRegion,
  AppBlockRule,
  RedactionProfile,
  RedactionSession,
  TimelineTrack,
  TimelineEvent,
  DetectedWindow,
  BoundingBox,
  PROFILE_VERSION,
  DEFAULT_APP_BLOCK_RULES,
} from './types';

// ============================================================================
// Storage Paths
// ============================================================================

function getDataPath(): string {
  const userDataPath = app.getPath('userData');
  const redactionPath = join(userDataPath, 'redaction');
  if (!existsSync(redactionPath)) {
    mkdirSync(redactionPath, { recursive: true });
  }
  return redactionPath;
}

function getProfilesPath(): string {
  const profilesPath = join(getDataPath(), 'profiles');
  if (!existsSync(profilesPath)) {
    mkdirSync(profilesPath, { recursive: true });
  }
  return profilesPath;
}

function getRulesPath(): string {
  return join(getDataPath(), 'app-rules.json');
}

function getSessionsPath(): string {
  const sessionsPath = join(getDataPath(), 'sessions');
  if (!existsSync(sessionsPath)) {
    mkdirSync(sessionsPath, { recursive: true });
  }
  return sessionsPath;
}

// ============================================================================
// Manual Redaction Manager
// ============================================================================

export class ManualRedactionManager {
  private appBlockRules: AppBlockRule[] = [];
  private sessions: Map<string, RedactionSession> = new Map();
  private profiles: Map<string, RedactionProfile> = new Map();

  constructor() {
    this.loadAppBlockRules();
    this.loadProfiles();
  }

  // ---------------------------------------------------------------------------
  // App Block Rules
  // ---------------------------------------------------------------------------

  private loadAppBlockRules(): void {
    const rulesPath = getRulesPath();
    if (existsSync(rulesPath)) {
      try {
        const data = readFileSync(rulesPath, 'utf-8');
        this.appBlockRules = JSON.parse(data);
      } catch (error) {
        console.error('[ManualRedaction] Failed to load app rules:', error);
        this.appBlockRules = [...DEFAULT_APP_BLOCK_RULES];
      }
    } else {
      this.appBlockRules = [...DEFAULT_APP_BLOCK_RULES];
      this.saveAppBlockRules();
    }
  }

  private saveAppBlockRules(): void {
    const rulesPath = getRulesPath();
    try {
      writeFileSync(rulesPath, JSON.stringify(this.appBlockRules, null, 2));
    } catch (error) {
      console.error('[ManualRedaction] Failed to save app rules:', error);
    }
  }

  getAppBlockRules(): AppBlockRule[] {
    return [...this.appBlockRules];
  }

  addAppBlockRule(rule: Omit<AppBlockRule, 'id' | 'createdAt'>): AppBlockRule {
    const newRule: AppBlockRule = {
      ...rule,
      id: `rule-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      createdAt: Date.now(),
    };
    this.appBlockRules.push(newRule);
    this.saveAppBlockRules();
    return newRule;
  }

  updateAppBlockRule(id: string, updates: Partial<AppBlockRule>): boolean {
    const index = this.appBlockRules.findIndex(r => r.id === id);
    if (index === -1) return false;

    this.appBlockRules[index] = { ...this.appBlockRules[index], ...updates };
    this.saveAppBlockRules();
    return true;
  }

  deleteAppBlockRule(id: string): boolean {
    const index = this.appBlockRules.findIndex(r => r.id === id);
    if (index === -1) return false;

    this.appBlockRules.splice(index, 1);
    this.saveAppBlockRules();
    return true;
  }

  /**
   * Check if a window matches any enabled blocking rule
   */
  matchWindowToRules(window: DetectedWindow): AppBlockRule | null {
    for (const rule of this.appBlockRules) {
      if (!rule.enabled) continue;

      let matches = false;

      // Check app name if specified
      if (rule.appName) {
        const appNameLower = window.appName.toLowerCase();
        if (!appNameLower.includes(rule.appName.toLowerCase())) {
          continue;
        }
      }

      // Check window title
      switch (rule.matchType) {
        case 'exact':
          matches = window.title === rule.pattern;
          break;
        case 'contains':
          matches = window.title.toLowerCase().includes(rule.pattern.toLowerCase());
          break;
        case 'regex':
          try {
            const regex = new RegExp(rule.pattern, 'i');
            matches = regex.test(window.title);
          } catch {
            matches = false;
          }
          break;
      }

      if (matches) {
        return rule;
      }
    }

    return null;
  }

  // ---------------------------------------------------------------------------
  // Redaction Sessions
  // ---------------------------------------------------------------------------

  createSession(
    recordingId: string,
    duration: number,
    dimensions: { width: number; height: number }
  ): RedactionSession {
    const session: RedactionSession = {
      recordingId,
      duration,
      dimensions,
      regions: [],
      tracks: [
        {
          id: 'manual',
          name: 'Manual Redactions',
          type: 'manual',
          events: [],
          visible: true,
          locked: false,
        },
        {
          id: 'auto',
          name: 'Auto-Detected PII',
          type: 'auto',
          events: [],
          visible: true,
          locked: true,
        },
        {
          id: 'app',
          name: 'App Blocking',
          type: 'app',
          events: [],
          visible: true,
          locked: true,
        },
      ],
      isDirty: false,
    };

    this.sessions.set(recordingId, session);
    return session;
  }

  getSession(recordingId: string): RedactionSession | null {
    return this.sessions.get(recordingId) || null;
  }

  /**
   * Load session from disk if exists
   */
  loadSession(recordingId: string): RedactionSession | null {
    // Check in-memory first
    if (this.sessions.has(recordingId)) {
      return this.sessions.get(recordingId)!;
    }

    // Try to load from disk
    const sessionPath = join(getSessionsPath(), `${recordingId}.json`);
    if (existsSync(sessionPath)) {
      try {
        const data = readFileSync(sessionPath, 'utf-8');
        const session = JSON.parse(data) as RedactionSession;
        this.sessions.set(recordingId, session);
        return session;
      } catch (error) {
        console.error('[ManualRedaction] Failed to load session:', error);
      }
    }

    return null;
  }

  saveSession(recordingId: string): boolean {
    const session = this.sessions.get(recordingId);
    if (!session) return false;

    const sessionPath = join(getSessionsPath(), `${recordingId}.json`);
    try {
      session.lastSaved = Date.now();
      session.isDirty = false;
      writeFileSync(sessionPath, JSON.stringify(session, null, 2));
      return true;
    } catch (error) {
      console.error('[ManualRedaction] Failed to save session:', error);
      return false;
    }
  }

  deleteSession(recordingId: string): boolean {
    this.sessions.delete(recordingId);

    const sessionPath = join(getSessionsPath(), `${recordingId}.json`);
    if (existsSync(sessionPath)) {
      try {
        unlinkSync(sessionPath);
      } catch (error) {
        console.error('[ManualRedaction] Failed to delete session file:', error);
      }
    }

    return true;
  }

  // ---------------------------------------------------------------------------
  // Manual Regions
  // ---------------------------------------------------------------------------

  addRegion(recordingId: string, region: Omit<ManualRegion, 'id' | 'createdAt'>): ManualRegion | null {
    const session = this.sessions.get(recordingId);
    if (!session) return null;

    const newRegion: ManualRegion = {
      ...region,
      id: `region-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      createdAt: Date.now(),
    };

    session.regions.push(newRegion);
    session.isDirty = true;

    // Add to timeline
    this.addRegionToTimeline(session, newRegion);

    return newRegion;
  }

  updateRegion(recordingId: string, regionId: string, updates: Partial<ManualRegion>): boolean {
    const session = this.sessions.get(recordingId);
    if (!session) return false;

    const index = session.regions.findIndex(r => r.id === regionId);
    if (index === -1) return false;

    session.regions[index] = { ...session.regions[index], ...updates };
    session.isDirty = true;

    // Update timeline
    this.updateRegionInTimeline(session, session.regions[index]);

    return true;
  }

  deleteRegion(recordingId: string, regionId: string): boolean {
    const session = this.sessions.get(recordingId);
    if (!session) return false;

    const index = session.regions.findIndex(r => r.id === regionId);
    if (index === -1) return false;

    session.regions.splice(index, 1);
    session.isDirty = true;

    // Remove from timeline
    this.removeRegionFromTimeline(session, regionId);

    return true;
  }

  getRegionsAtTime(recordingId: string, time: number): ManualRegion[] {
    const session = this.sessions.get(recordingId);
    if (!session) return [];

    return session.regions.filter(region => {
      if (region.type === 'static') {
        return true;
      }
      if (region.type === 'temporary') {
        const start = region.startTime ?? 0;
        const end = region.endTime ?? session.duration;
        return time >= start && time <= end;
      }
      // Tracked regions are always active
      return true;
    });
  }

  // ---------------------------------------------------------------------------
  // Timeline Management
  // ---------------------------------------------------------------------------

  private addRegionToTimeline(session: RedactionSession, region: ManualRegion): void {
    const manualTrack = session.tracks.find(t => t.id === 'manual');
    if (!manualTrack) return;

    const event: TimelineEvent = {
      id: `event-${region.id}`,
      type: 'manual',
      sourceId: region.id,
      startTime: region.startTime ?? 0,
      endTime: region.endTime ?? session.duration,
      bounds: region.bounds,
      style: region.style,
      label: region.label,
    };

    manualTrack.events.push(event);
  }

  private updateRegionInTimeline(session: RedactionSession, region: ManualRegion): void {
    const manualTrack = session.tracks.find(t => t.id === 'manual');
    if (!manualTrack) return;

    const eventIndex = manualTrack.events.findIndex(e => e.sourceId === region.id);
    if (eventIndex === -1) return;

    manualTrack.events[eventIndex] = {
      ...manualTrack.events[eventIndex],
      startTime: region.startTime ?? 0,
      endTime: region.endTime ?? session.duration,
      bounds: region.bounds,
      style: region.style,
      label: region.label,
    };
  }

  private removeRegionFromTimeline(session: RedactionSession, regionId: string): void {
    const manualTrack = session.tracks.find(t => t.id === 'manual');
    if (!manualTrack) return;

    const eventIndex = manualTrack.events.findIndex(e => e.sourceId === regionId);
    if (eventIndex !== -1) {
      manualTrack.events.splice(eventIndex, 1);
    }
  }

  addTimelineEvent(recordingId: string, trackId: string, event: Omit<TimelineEvent, 'id'>): TimelineEvent | null {
    const session = this.sessions.get(recordingId);
    if (!session) return null;

    const track = session.tracks.find(t => t.id === trackId);
    if (!track || track.locked) return null;

    const newEvent: TimelineEvent = {
      ...event,
      id: `event-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    };

    track.events.push(newEvent);
    session.isDirty = true;

    return newEvent;
  }

  updateTimelineEvent(
    recordingId: string,
    trackId: string,
    eventId: string,
    updates: Partial<TimelineEvent>
  ): boolean {
    const session = this.sessions.get(recordingId);
    if (!session) return false;

    const track = session.tracks.find(t => t.id === trackId);
    if (!track || track.locked) return false;

    const eventIndex = track.events.findIndex(e => e.id === eventId);
    if (eventIndex === -1) return false;

    track.events[eventIndex] = { ...track.events[eventIndex], ...updates };
    session.isDirty = true;

    return true;
  }

  deleteTimelineEvent(recordingId: string, trackId: string, eventId: string): boolean {
    const session = this.sessions.get(recordingId);
    if (!session) return false;

    const track = session.tracks.find(t => t.id === trackId);
    if (!track || track.locked) return false;

    const eventIndex = track.events.findIndex(e => e.id === eventId);
    if (eventIndex === -1) return false;

    track.events.splice(eventIndex, 1);
    session.isDirty = true;

    return true;
  }

  // ---------------------------------------------------------------------------
  // Profiles
  // ---------------------------------------------------------------------------

  private loadProfiles(): void {
    const profilesPath = getProfilesPath();
    try {
      const files = readdirSync(profilesPath).filter(f => f.endsWith('.json'));
      for (const file of files) {
        try {
          const data = readFileSync(join(profilesPath, file), 'utf-8');
          const profile = JSON.parse(data) as RedactionProfile;
          this.profiles.set(profile.id, profile);
        } catch (error) {
          console.error(`[ManualRedaction] Failed to load profile ${file}:`, error);
        }
      }
    } catch (error) {
      console.error('[ManualRedaction] Failed to load profiles:', error);
    }
  }

  getProfiles(): RedactionProfile[] {
    return Array.from(this.profiles.values());
  }

  getProfile(id: string): RedactionProfile | null {
    return this.profiles.get(id) || null;
  }

  createProfile(profile: Omit<RedactionProfile, 'id' | 'version' | 'createdAt' | 'updatedAt'>): RedactionProfile {
    const newProfile: RedactionProfile = {
      ...profile,
      id: `profile-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      version: '1.0.0',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    this.profiles.set(newProfile.id, newProfile);
    this.saveProfile(newProfile);

    return newProfile;
  }

  updateProfile(id: string, updates: Partial<RedactionProfile>): boolean {
    const profile = this.profiles.get(id);
    if (!profile) return false;

    const updated = { ...profile, ...updates, updatedAt: Date.now() };
    this.profiles.set(id, updated);
    this.saveProfile(updated);

    return true;
  }

  deleteProfile(id: string): boolean {
    if (!this.profiles.has(id)) return false;

    this.profiles.delete(id);

    const profilePath = join(getProfilesPath(), `${id}.json`);
    if (existsSync(profilePath)) {
      try {
        unlinkSync(profilePath);
      } catch (error) {
        console.error('[ManualRedaction] Failed to delete profile file:', error);
      }
    }

    return true;
  }

  private saveProfile(profile: RedactionProfile): void {
    const profilePath = join(getProfilesPath(), `${profile.id}.json`);
    try {
      writeFileSync(profilePath, JSON.stringify(profile, null, 2));
    } catch (error) {
      console.error('[ManualRedaction] Failed to save profile:', error);
    }
  }

  /**
   * Export profile to a file path
   */
  exportProfile(id: string, filePath: string): boolean {
    const profile = this.profiles.get(id);
    if (!profile) return false;

    try {
      writeFileSync(filePath, JSON.stringify(profile, null, 2));
      return true;
    } catch (error) {
      console.error('[ManualRedaction] Failed to export profile:', error);
      return false;
    }
  }

  /**
   * Import profile from a file path
   */
  importProfile(filePath: string): RedactionProfile | null {
    try {
      const data = readFileSync(filePath, 'utf-8');
      const imported = JSON.parse(data) as RedactionProfile;

      // Generate new ID to avoid conflicts
      const newProfile: RedactionProfile = {
        ...imported,
        id: `profile-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      this.profiles.set(newProfile.id, newProfile);
      this.saveProfile(newProfile);

      return newProfile;
    } catch (error) {
      console.error('[ManualRedaction] Failed to import profile:', error);
      return null;
    }
  }

  /**
   * Apply a profile to a session
   */
  applyProfile(recordingId: string, profileId: string): boolean {
    const session = this.sessions.get(recordingId);
    const profile = this.profiles.get(profileId);

    if (!session || !profile) return false;

    // Apply app blocking rules
    this.appBlockRules = [...profile.appBlockRules];
    this.saveAppBlockRules();

    // Mark session with applied profile
    session.appliedProfile = profileId;
    session.isDirty = true;

    return true;
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let managerInstance: ManualRedactionManager | null = null;

export function getManualRedactionManager(): ManualRedactionManager {
  if (!managerInstance) {
    managerInstance = new ManualRedactionManager();
  }
  return managerInstance;
}

export function terminateManualRedactionManager(): void {
  managerInstance = null;
}

// ============================================================================
// Default exports
// ============================================================================

const DEFAULT_APP_BLOCK_RULES_IMPL: AppBlockRule[] = [
  {
    id: 'slack-default',
    name: 'Slack Messages',
    matchType: 'contains',
    pattern: 'Slack',
    action: 'blur',
    enabled: false,
    createdAt: Date.now(),
  },
  {
    id: 'password-manager',
    name: 'Password Managers',
    matchType: 'regex',
    pattern: '(1Password|LastPass|Bitwarden|KeePass)',
    action: 'solid',
    color: '#000000',
    enabled: false,
    createdAt: Date.now(),
  },
  {
    id: 'private-browsing',
    name: 'Private/Incognito Browsing',
    matchType: 'regex',
    pattern: '(Private|Incognito)',
    action: 'solid',
    color: '#000000',
    enabled: false,
    createdAt: Date.now(),
  },
];

export { DEFAULT_APP_BLOCK_RULES_IMPL as DEFAULT_APP_BLOCK_RULES };
