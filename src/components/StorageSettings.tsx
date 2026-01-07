/**
 * Storage Settings Component
 *
 * UI for configuring session storage policies including:
 * - Maximum number of recordings to keep
 * - Retention period in days
 * - Auto-save preferences
 * - Minimum session requirements
 */

import { useState, useEffect, useCallback } from 'react';
import {
  getStorageSettings,
  saveStorageSettings,
  resetStorageSettings,
  getStorageStats,
  cleanupSessions,
  type StorageSettings as StorageSettingsType,
  type StorageStats,
  DEFAULT_STORAGE_SETTINGS,
} from '../utils/sessionStorage';
import './StorageSettings.css';

// =============================================================================
// Types
// =============================================================================

export interface StorageSettingsProps {
  /** Callback when settings are saved */
  onSettingsSaved?: (settings: StorageSettingsType) => void;
  /** Callback when cleanup is performed */
  onCleanup?: (deletedCount: number) => void;
  /** Whether to show in compact mode */
  compact?: boolean;
}

// =============================================================================
// Component
// =============================================================================

export function StorageSettings({
  onSettingsSaved,
  onCleanup,
  compact = false,
}: StorageSettingsProps) {
  const [settings, setSettings] = useState<StorageSettingsType>(DEFAULT_STORAGE_SETTINGS);
  const [stats, setStats] = useState<StorageStats | null>(null);
  const [hasChanges, setHasChanges] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(
    null
  );

  // Load settings and stats on mount
  useEffect(() => {
    setSettings(getStorageSettings());
    setStats(getStorageStats());
  }, []);

  // Refresh stats periodically
  useEffect(() => {
    const interval = setInterval(() => {
      setStats(getStorageStats());
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  // Handle setting changes
  const updateSetting = useCallback(
    <K extends keyof StorageSettingsType>(key: K, value: StorageSettingsType[K]) => {
      setSettings((prev) => ({ ...prev, [key]: value }));
      setHasChanges(true);
      setMessage(null);
    },
    []
  );

  // Save settings
  const handleSave = useCallback(() => {
    setIsSaving(true);
    try {
      const saved = saveStorageSettings(settings);
      setHasChanges(false);
      setMessage({ type: 'success', text: 'Settings saved successfully' });
      onSettingsSaved?.(saved);

      // Refresh stats after save
      setStats(getStorageStats());
    } catch {
      setMessage({ type: 'error', text: 'Failed to save settings' });
    } finally {
      setIsSaving(false);
    }
  }, [settings, onSettingsSaved]);

  // Reset to defaults
  const handleReset = useCallback(() => {
    const defaults = resetStorageSettings();
    setSettings(defaults);
    setHasChanges(false);
    setMessage({ type: 'success', text: 'Settings reset to defaults' });
    onSettingsSaved?.(defaults);
  }, [onSettingsSaved]);

  // Run cleanup
  const handleCleanup = useCallback(() => {
    const result = cleanupSessions(settings);
    setStats(getStorageStats());
    setMessage({
      type: 'success',
      text:
        result.deletedCount > 0
          ? `Cleaned up ${result.deletedCount} session(s)`
          : 'No sessions to clean up',
    });
    onCleanup?.(result.deletedCount);
  }, [settings, onCleanup]);

  // Clear message after delay
  useEffect(() => {
    if (message) {
      const timeout = setTimeout(() => setMessage(null), 3000);
      return () => clearTimeout(timeout);
    }
  }, [message]);

  if (compact) {
    return (
      <div className="storage-settings storage-settings--compact">
        <div className="storage-settings__header">
          <h4>Storage Settings</h4>
          {stats && (
            <span className="storage-settings__stats-badge">
              {stats.totalSessions} sessions ({stats.totalSize.formatted})
            </span>
          )}
        </div>

        <div className="storage-settings__compact-controls">
          <label className="storage-settings__checkbox">
            <input
              type="checkbox"
              checked={settings.autoSave}
              onChange={(e) => updateSetting('autoSave', e.target.checked)}
            />
            Auto-save recordings
          </label>

          <div className="storage-settings__inline-field">
            <label>Keep last</label>
            <input
              type="number"
              min="1"
              max="1000"
              value={settings.maxSessions}
              onChange={(e) => updateSetting('maxSessions', parseInt(e.target.value, 10) || 1)}
            />
            <span>recordings</span>
          </div>

          <div className="storage-settings__inline-field">
            <label>For</label>
            <input
              type="number"
              min="1"
              max="365"
              value={settings.retentionDays}
              onChange={(e) =>
                updateSetting('retentionDays', parseInt(e.target.value, 10) || 1)
              }
            />
            <span>days</span>
          </div>
        </div>

        {hasChanges && (
          <div className="storage-settings__actions">
            <button onClick={handleSave} disabled={isSaving} className="btn btn--primary">
              Save
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="storage-settings">
      <div className="storage-settings__header">
        <h3>Storage Settings</h3>
        {stats && stats.pendingDeletion > 0 && (
          <span className="storage-settings__warning-badge">
            {stats.pendingDeletion} session(s) pending cleanup
          </span>
        )}
      </div>

      {/* Stats Section */}
      {stats && (
        <div className="storage-settings__stats">
          <div className="storage-settings__stat">
            <span className="storage-settings__stat-value">{stats.totalSessions}</span>
            <span className="storage-settings__stat-label">Total Sessions</span>
          </div>
          <div className="storage-settings__stat">
            <span className="storage-settings__stat-value">{stats.totalSize.formatted}</span>
            <span className="storage-settings__stat-label">Storage Used</span>
          </div>
          <div className="storage-settings__stat">
            <span className="storage-settings__stat-value">{stats.expiredCount}</span>
            <span className="storage-settings__stat-label">Expired</span>
          </div>
        </div>
      )}

      {/* Message */}
      {message && (
        <div className={`storage-settings__message storage-settings__message--${message.type}`}>
          {message.text}
        </div>
      )}

      {/* Main Settings */}
      <div className="storage-settings__section">
        <h4>Recording</h4>

        <label className="storage-settings__checkbox">
          <input
            type="checkbox"
            checked={settings.autoSave}
            onChange={(e) => updateSetting('autoSave', e.target.checked)}
          />
          <span>
            <strong>Auto-save recordings</strong>
            <small>Automatically save sessions when recording stops</small>
          </span>
        </label>
      </div>

      <div className="storage-settings__section">
        <h4>Retention Policy</h4>

        <div className="storage-settings__field">
          <label htmlFor="maxSessions">Maximum recordings to keep</label>
          <div className="storage-settings__input-group">
            <input
              id="maxSessions"
              type="number"
              min="1"
              max="1000"
              value={settings.maxSessions}
              onChange={(e) =>
                updateSetting('maxSessions', parseInt(e.target.value, 10) || 1)
              }
            />
            <span className="storage-settings__input-suffix">sessions</span>
          </div>
          <small>Oldest sessions are deleted when limit is reached (0 = unlimited)</small>
        </div>

        <div className="storage-settings__field">
          <label htmlFor="retentionDays">Keep recordings for</label>
          <div className="storage-settings__input-group">
            <input
              id="retentionDays"
              type="number"
              min="1"
              max="365"
              value={settings.retentionDays}
              onChange={(e) =>
                updateSetting('retentionDays', parseInt(e.target.value, 10) || 1)
              }
            />
            <span className="storage-settings__input-suffix">days</span>
          </div>
          <small>Sessions older than this are automatically deleted (0 = forever)</small>
        </div>
      </div>

      {/* Advanced Settings */}
      <div className="storage-settings__section">
        <button
          className="storage-settings__toggle"
          onClick={() => setShowAdvanced(!showAdvanced)}
        >
          {showAdvanced ? '▼' : '▶'} Advanced Settings
        </button>

        {showAdvanced && (
          <div className="storage-settings__advanced">
            <div className="storage-settings__field">
              <label htmlFor="minDuration">Minimum recording duration</label>
              <div className="storage-settings__input-group">
                <input
                  id="minDuration"
                  type="number"
                  min="0"
                  max="60000"
                  step="1000"
                  value={settings.minDurationMs}
                  onChange={(e) =>
                    updateSetting('minDurationMs', parseInt(e.target.value, 10) || 0)
                  }
                />
                <span className="storage-settings__input-suffix">ms</span>
              </div>
              <small>
                Sessions shorter than {settings.minDurationMs / 1000}s won't be saved
              </small>
            </div>

            <div className="storage-settings__field">
              <label htmlFor="minEvents">Minimum events required</label>
              <div className="storage-settings__input-group">
                <input
                  id="minEvents"
                  type="number"
                  min="2"
                  max="100"
                  value={settings.minEvents}
                  onChange={(e) =>
                    updateSetting('minEvents', parseInt(e.target.value, 10) || 2)
                  }
                />
                <span className="storage-settings__input-suffix">events</span>
              </div>
              <small>Sessions with fewer events won't be saved</small>
            </div>
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="storage-settings__actions">
        <button
          onClick={handleSave}
          disabled={!hasChanges || isSaving}
          className="btn btn--primary"
        >
          {isSaving ? 'Saving...' : 'Save Settings'}
        </button>

        <button onClick={handleReset} className="btn btn--secondary">
          Reset to Defaults
        </button>

        <button
          onClick={handleCleanup}
          className="btn btn--warning"
          disabled={stats?.pendingDeletion === 0}
        >
          Clean Up Now
          {stats && stats.pendingDeletion > 0 && ` (${stats.pendingDeletion})`}
        </button>
      </div>
    </div>
  );
}

export default StorageSettings;
