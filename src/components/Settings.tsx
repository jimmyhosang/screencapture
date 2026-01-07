import { useState, useEffect } from 'react';
import type { PrivacyConfig } from '../hooks/useRecorder';
import { getSettings, saveSettings, type AppSettings } from '../utils/sessionStorage';
import './Settings.css';

interface SettingsProps {
  isOpen: boolean;
  onClose: () => void;
  onSettingsChange: (settings: AppSettings) => void;
}

export function Settings({ isOpen, onClose, onSettingsChange }: SettingsProps) {
  const [settings, setSettings] = useState<AppSettings>(getSettings());

  useEffect(() => {
    if (isOpen) {
      setSettings(getSettings());
    }
  }, [isOpen]);

  const handlePrivacyChange = (key: keyof PrivacyConfig) => {
    const updated = {
      ...settings,
      defaultPrivacyConfig: {
        ...settings.defaultPrivacyConfig,
        [key]: !settings.defaultPrivacyConfig[key],
      },
    };
    setSettings(updated);
  };

  const handleAutoSaveChange = () => {
    const updated = { ...settings, autoSave: !settings.autoSave };
    setSettings(updated);
  };

  const handleStorageLimitChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseInt(e.target.value, 10);
    if (!isNaN(value) && value > 0) {
      const updated = { ...settings, maxStorageSize: value };
      setSettings(updated);
    }
  };

  const handleSamplingChange = (key: string, value: boolean | number | string) => {
    const updated = {
      ...settings,
      samplingConfig: {
        ...settings.samplingConfig,
        [key]: value,
      },
    };
    setSettings(updated);
  };

  const handleSave = () => {
    saveSettings(settings);
    onSettingsChange(settings);
    onClose();
  };

  const handleReset = () => {
    const defaultSettings = {
      defaultPrivacyConfig: {
        maskAllInputs: false,
        blockSensitiveElements: false,
        maskTextPatterns: false,
        customMaskFn: false,
      },
      maxStorageSize: 50,
      autoSave: true,
      samplingConfig: {
        mousemove: true,
        mouseInteraction: true,
        scroll: 150,
        input: 'last',
      },
    };
    setSettings(defaultSettings);
  };

  if (!isOpen) return null;

  return (
    <div className="settings-overlay" onClick={onClose}>
      <div className="settings-modal" onClick={(e) => e.stopPropagation()}>
        <div className="settings-header">
          <h2>Settings</h2>
          <button className="settings-close" onClick={onClose}>
            ×
          </button>
        </div>

        <div className="settings-body">
          {/* Default Privacy Settings */}
          <section className="settings-section">
            <h3>Default Privacy Settings</h3>
            <p className="section-hint">These privacy settings will be used by default for new recordings</p>

            <div className="settings-group">
              <label className="setting-item">
                <input
                  type="checkbox"
                  checked={settings.defaultPrivacyConfig.maskAllInputs}
                  onChange={() => handlePrivacyChange('maskAllInputs')}
                />
                <span className="setting-label">
                  <span className="setting-title">Mask All Inputs</span>
                  <span className="setting-desc">Replace all input values with asterisks</span>
                </span>
              </label>

              <label className="setting-item">
                <input
                  type="checkbox"
                  checked={settings.defaultPrivacyConfig.blockSensitiveElements}
                  onChange={() => handlePrivacyChange('blockSensitiveElements')}
                />
                <span className="setting-label">
                  <span className="setting-title">Block Sensitive Elements</span>
                  <span className="setting-desc">Hide elements with .sensitive or .pii class</span>
                </span>
              </label>

              <label className="setting-item">
                <input
                  type="checkbox"
                  checked={settings.defaultPrivacyConfig.maskTextPatterns}
                  onChange={() => handlePrivacyChange('maskTextPatterns')}
                />
                <span className="setting-label">
                  <span className="setting-title">Mask PII Patterns</span>
                  <span className="setting-desc">Automatically redact emails, phones, SSNs, credit cards</span>
                </span>
              </label>

              <label className="setting-item">
                <input
                  type="checkbox"
                  checked={settings.defaultPrivacyConfig.customMaskFn}
                  onChange={() => handlePrivacyChange('customMaskFn')}
                />
                <span className="setting-label">
                  <span className="setting-title">Custom Mask Function</span>
                  <span className="setting-desc">Mask any sequence of 4+ digits</span>
                </span>
              </label>
            </div>
          </section>

          {/* Storage Settings */}
          <section className="settings-section">
            <h3>Storage Settings</h3>

            <div className="settings-group">
              <label className="setting-item">
                <input
                  type="checkbox"
                  checked={settings.autoSave}
                  onChange={handleAutoSaveChange}
                />
                <span className="setting-label">
                  <span className="setting-title">Auto-Save Recordings</span>
                  <span className="setting-desc">Automatically save recordings when stopped</span>
                </span>
              </label>

              <div className="setting-item slider-item">
                <span className="setting-label">
                  <span className="setting-title">Storage Limit</span>
                  <span className="setting-desc">Maximum storage size for all recordings</span>
                </span>
                <div className="slider-control">
                  <input
                    type="range"
                    min="10"
                    max="200"
                    step="10"
                    value={settings.maxStorageSize}
                    onChange={handleStorageLimitChange}
                  />
                  <span className="slider-value">{settings.maxStorageSize} MB</span>
                </div>
              </div>
            </div>
          </section>

          {/* Recording Quality */}
          <section className="settings-section">
            <h3>Recording Quality</h3>
            <p className="section-hint">Adjust sampling rates for recording performance</p>

            <div className="settings-group">
              <label className="setting-item">
                <input
                  type="checkbox"
                  checked={settings.samplingConfig.mousemove}
                  onChange={(e) => handleSamplingChange('mousemove', e.target.checked)}
                />
                <span className="setting-label">
                  <span className="setting-title">Record Mouse Movement</span>
                  <span className="setting-desc">Capture mouse cursor position</span>
                </span>
              </label>

              <label className="setting-item">
                <input
                  type="checkbox"
                  checked={settings.samplingConfig.mouseInteraction}
                  onChange={(e) => handleSamplingChange('mouseInteraction', e.target.checked)}
                />
                <span className="setting-label">
                  <span className="setting-title">Record Mouse Interactions</span>
                  <span className="setting-desc">Capture clicks and mouse events</span>
                </span>
              </label>

              <div className="setting-item slider-item">
                <span className="setting-label">
                  <span className="setting-title">Scroll Sampling Interval</span>
                  <span className="setting-desc">Lower = smoother scrolling (higher file size)</span>
                </span>
                <div className="slider-control">
                  <input
                    type="range"
                    min="50"
                    max="500"
                    step="50"
                    value={settings.samplingConfig.scroll}
                    onChange={(e) => handleSamplingChange('scroll', parseInt(e.target.value, 10))}
                  />
                  <span className="slider-value">{settings.samplingConfig.scroll}ms</span>
                </div>
              </div>
            </div>
          </section>
        </div>

        <div className="settings-footer">
          <button className="settings-btn reset-btn" onClick={handleReset}>
            Reset to Defaults
          </button>
          <div className="settings-actions">
            <button className="settings-btn cancel-btn" onClick={onClose}>
              Cancel
            </button>
            <button className="settings-btn save-btn" onClick={handleSave}>
              Save Settings
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
