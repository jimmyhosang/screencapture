import type { eventWithTime } from '@rrweb/types';
import type {
  Message,
  RecordingState,
  StateUpdatePayload,
  StartRecordingPayload,
  RecordingEventPayload,
  SaveSessionPayload,
  Session,
  SessionMetadata,
  ExtensionSettings,
  PrivacySettings,
} from '../types';
import {
  DEFAULT_EXTENSION_SETTINGS,
  DEFAULT_PRIVACY_SETTINGS,
} from '../types';

/**
 * In-memory state for active recordings per tab
 */
interface TabRecordingState {
  state: RecordingState;
  events: eventWithTime[];
  startTime: number;
  url: string;
  settings: PrivacySettings;
}

const tabStates = new Map<number, TabRecordingState>();

/**
 * Storage keys
 */
const STORAGE_KEYS = {
  SESSIONS: 'screencapture_sessions',
  SETTINGS: 'screencapture_settings',
};

/**
 * Get extension settings from storage
 */
async function getSettings(): Promise<ExtensionSettings> {
  const result = await chrome.storage.sync.get(STORAGE_KEYS.SETTINGS);
  return result[STORAGE_KEYS.SETTINGS] || DEFAULT_EXTENSION_SETTINGS;
}

/**
 * Save extension settings to storage
 */
async function saveSettings(settings: Partial<ExtensionSettings>): Promise<void> {
  const current = await getSettings();
  await chrome.storage.sync.set({
    [STORAGE_KEYS.SETTINGS]: { ...current, ...settings },
  });
}

/**
 * Get all saved sessions metadata
 */
async function getSessionsMetadata(): Promise<SessionMetadata[]> {
  const result = await chrome.storage.local.get(STORAGE_KEYS.SESSIONS);
  const sessions = result[STORAGE_KEYS.SESSIONS] || [];
  // Return only metadata (without events) for listing
  return sessions.map((s: Session) => ({
    id: s.id,
    name: s.name,
    url: s.url,
    timestamp: s.timestamp,
    duration: s.duration,
    eventCount: s.eventCount,
    privacyConfig: s.privacyConfig,
  }));
}

/**
 * Save a session to storage
 */
async function saveSession(session: Session): Promise<boolean> {
  try {
    const result = await chrome.storage.local.get(STORAGE_KEYS.SESSIONS);
    const sessions: Session[] = result[STORAGE_KEYS.SESSIONS] || [];

    // Add new session at the beginning
    sessions.unshift(session);

    // Check storage quota (rough estimate)
    const dataSize = JSON.stringify(sessions).length;
    const settings = await getSettings();
    const maxBytes = settings.maxStorageMB * 1024 * 1024;

    if (dataSize > maxBytes) {
      console.warn('Storage limit exceeded');
      return false;
    }

    await chrome.storage.local.set({ [STORAGE_KEYS.SESSIONS]: sessions });
    return true;
  } catch (error) {
    console.error('Failed to save session:', error);
    return false;
  }
}

/**
 * Delete a session by ID
 */
async function deleteSession(sessionId: string): Promise<void> {
  const result = await chrome.storage.local.get(STORAGE_KEYS.SESSIONS);
  const sessions: Session[] = result[STORAGE_KEYS.SESSIONS] || [];
  const filtered = sessions.filter((s) => s.id !== sessionId);
  await chrome.storage.local.set({ [STORAGE_KEYS.SESSIONS]: filtered });
}

/**
 * Get a specific session with events
 */
async function getSession(sessionId: string): Promise<Session | null> {
  const result = await chrome.storage.local.get(STORAGE_KEYS.SESSIONS);
  const sessions: Session[] = result[STORAGE_KEYS.SESSIONS] || [];
  return sessions.find((s) => s.id === sessionId) || null;
}

/**
 * Generate unique session ID
 */
function generateSessionId(): string {
  return `session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Get tab state
 */
function getTabState(tabId: number): TabRecordingState | undefined {
  return tabStates.get(tabId);
}

/**
 * Broadcast state update to popup
 */
async function broadcastStateUpdate(tabId: number): Promise<void> {
  const tabState = getTabState(tabId);
  const payload: StateUpdatePayload = {
    state: tabState?.state || 'idle',
    tabId,
    eventCount: tabState?.events.length || 0,
    startTime: tabState?.startTime,
    url: tabState?.url,
  };

  // Send to popup if open
  try {
    await chrome.runtime.sendMessage({
      type: 'STATE_UPDATE',
      payload,
    });
  } catch {
    // Popup might not be open
  }
}

/**
 * Handle messages from popup and content scripts
 */
chrome.runtime.onMessage.addListener((message: Message, sender, sendResponse) => {
  const tabId = sender.tab?.id;

  (async () => {
    try {
      switch (message.type) {
        case 'START_RECORDING': {
          if (!tabId) {
            // Message from popup - get active tab
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            if (!tab?.id) {
              sendResponse({ success: false, error: 'No active tab' });
              return;
            }
            const activeTabId = tab.id;
            const payload = message.payload as StartRecordingPayload | undefined;
            const settings = await getSettings();

            tabStates.set(activeTabId, {
              state: 'recording',
              events: [],
              startTime: Date.now(),
              url: tab.url || '',
              settings: {
                ...DEFAULT_PRIVACY_SETTINGS,
                ...settings.privacySettings,
                ...payload?.settings,
              },
            });

            // Inject content script and start recording
            await chrome.tabs.sendMessage(activeTabId, {
              type: 'START_RECORDING',
              payload: { settings: tabStates.get(activeTabId)?.settings },
            });

            await broadcastStateUpdate(activeTabId);
            sendResponse({ success: true, tabId: activeTabId });
          }
          break;
        }

        case 'STOP_RECORDING': {
          const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
          const activeTabId = tab?.id;
          if (!activeTabId) {
            sendResponse({ success: false, error: 'No active tab' });
            return;
          }

          const tabState = getTabState(activeTabId);
          if (!tabState) {
            sendResponse({ success: false, error: 'No recording in progress' });
            return;
          }

          // Tell content script to stop
          await chrome.tabs.sendMessage(activeTabId, { type: 'STOP_RECORDING' });

          // Update state
          tabState.state = 'idle';

          // Auto-save if enabled
          const settings = await getSettings();
          if (settings.autoSave && tabState.events.length > 0) {
            const session: Session = {
              id: generateSessionId(),
              name: `Recording ${new Date().toLocaleString()}`,
              url: tabState.url,
              timestamp: tabState.startTime,
              duration: Date.now() - tabState.startTime,
              eventCount: tabState.events.length,
              events: tabState.events,
              privacyConfig: tabState.settings,
            };
            await saveSession(session);
          }

          await broadcastStateUpdate(activeTabId);
          sendResponse({
            success: true,
            events: tabState.events,
            duration: Date.now() - tabState.startTime,
          });

          // Clear tab state
          tabStates.delete(activeTabId);
          break;
        }

        case 'GET_STATE': {
          const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
          const activeTabId = tab?.id;
          const tabState = activeTabId ? getTabState(activeTabId) : undefined;

          sendResponse({
            state: tabState?.state || 'idle',
            tabId: activeTabId,
            eventCount: tabState?.events.length || 0,
            startTime: tabState?.startTime,
            url: tabState?.url,
          });
          break;
        }

        case 'RECORDING_EVENT': {
          const eventPayload = message.payload as RecordingEventPayload;
          const eventTabId = eventPayload.tabId;
          const tabState = getTabState(eventTabId);

          if (tabState && tabState.state === 'recording') {
            tabState.events.push(eventPayload.event);

            // Periodically update popup
            if (tabState.events.length % 10 === 0) {
              await broadcastStateUpdate(eventTabId);
            }
          }
          sendResponse({ success: true });
          break;
        }

        case 'SAVE_SESSION': {
          const savePayload = message.payload as SaveSessionPayload;
          const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
          const activeTabId = tab?.id;
          const tabState = activeTabId ? getTabState(activeTabId) : undefined;

          if (!tabState || tabState.events.length === 0) {
            sendResponse({ success: false, error: 'No recording to save' });
            return;
          }

          const session: Session = {
            id: generateSessionId(),
            name: savePayload.name || `Recording ${new Date().toLocaleString()}`,
            url: tabState.url,
            timestamp: tabState.startTime,
            duration: Date.now() - tabState.startTime,
            eventCount: tabState.events.length,
            events: tabState.events,
            privacyConfig: tabState.settings,
          };

          const saved = await saveSession(session);
          sendResponse({ success: saved, sessionId: session.id });
          break;
        }

        case 'GET_SESSIONS': {
          const sessions = await getSessionsMetadata();
          sendResponse({ sessions });
          break;
        }

        case 'DELETE_SESSION': {
          const sessionId = message.payload as string;
          await deleteSession(sessionId);
          sendResponse({ success: true });
          break;
        }

        case 'EXPORT_SESSION': {
          const exportSessionId = message.payload as string;
          const session = await getSession(exportSessionId);
          sendResponse({ session });
          break;
        }

        default:
          sendResponse({ error: 'Unknown message type' });
      }
    } catch (error) {
      console.error('Background script error:', error);
      sendResponse({ success: false, error: String(error) });
    }
  })();

  // Return true to indicate async response
  return true;
});

/**
 * Clean up when tab is closed
 */
chrome.tabs.onRemoved.addListener((tabId) => {
  tabStates.delete(tabId);
});

/**
 * Handle extension install/update
 */
chrome.runtime.onInstalled.addListener(async (details) => {
  if (details.reason === 'install') {
    // Set default settings on first install
    await saveSettings(DEFAULT_EXTENSION_SETTINGS);
    console.log('Screencapture extension installed');
  }
});

console.log('Screencapture background service worker loaded');
