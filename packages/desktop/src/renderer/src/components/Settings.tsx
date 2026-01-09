import { useState, useEffect } from 'react';
import RedactionSettings from './RedactionSettings';
import CcaasSettings from './CcaasSettings';

interface AppSettings {
  theme: 'light' | 'dark' | 'system';
  defaultPrivacy: {
    maskInputs: boolean;
    blockSensitive: boolean;
    maskPiiPatterns: boolean;
  };
  autoImportPath: string | null;
}

function Settings(): JSX.Element {
  const [settings, setSettings] = useState<AppSettings>({
    theme: 'system',
    defaultPrivacy: {
      maskInputs: true,
      blockSensitive: true,
      maskPiiPatterns: true
    },
    autoImportPath: null
  });
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    const loaded = await window.api.settings.get();
    setSettings(loaded);
  };

  const saveSettings = async () => {
    const success = await window.api.settings.set(settings);
    if (success) {
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    }
  };

  const updatePrivacy = (key: keyof AppSettings['defaultPrivacy'], value: boolean) => {
    setSettings((prev) => ({
      ...prev,
      defaultPrivacy: {
        ...prev.defaultPrivacy,
        [key]: value
      }
    }));
  };

  return (
    <>
      <div className="main-header">
        <h2>Settings</h2>
        <button className="btn btn-primary" onClick={saveSettings}>
          {saved ? 'Saved!' : 'Save Settings'}
        </button>
      </div>

      <div className="settings-page">
        <div className="settings-section">
          <h3>Appearance</h3>
          <div className="setting-row">
            <div>
              <div className="setting-label">Theme</div>
              <div className="setting-description">Choose your preferred color scheme</div>
            </div>
            <select
              value={settings.theme}
              onChange={(e) =>
                setSettings((prev) => ({
                  ...prev,
                  theme: e.target.value as AppSettings['theme']
                }))
              }
              style={{
                padding: '8px 12px',
                borderRadius: '6px',
                border: '1px solid var(--border)',
                background: 'var(--bg-primary)',
                color: 'var(--text-primary)'
              }}
            >
              <option value="system">System</option>
              <option value="dark">Dark</option>
              <option value="light">Light</option>
            </select>
          </div>
        </div>

        <div className="settings-section">
          <h3>Default Privacy Settings</h3>
          <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '16px' }}>
            These settings apply to newly imported sessions
          </p>

          <div className="setting-row">
            <div>
              <div className="setting-label">Mask Input Values</div>
              <div className="setting-description">
                Hide text entered in input fields
              </div>
            </div>
            <div
              className={`toggle ${settings.defaultPrivacy.maskInputs ? 'active' : ''}`}
              onClick={() => updatePrivacy('maskInputs', !settings.defaultPrivacy.maskInputs)}
            />
          </div>

          <div className="setting-row">
            <div>
              <div className="setting-label">Block Sensitive Elements</div>
              <div className="setting-description">
                Hide elements with .sensitive or .pii classes
              </div>
            </div>
            <div
              className={`toggle ${settings.defaultPrivacy.blockSensitive ? 'active' : ''}`}
              onClick={() =>
                updatePrivacy('blockSensitive', !settings.defaultPrivacy.blockSensitive)
              }
            />
          </div>

          <div className="setting-row">
            <div>
              <div className="setting-label">Mask PII Patterns</div>
              <div className="setting-description">
                Auto-redact emails, phone numbers, SSNs, credit cards
              </div>
            </div>
            <div
              className={`toggle ${settings.defaultPrivacy.maskPiiPatterns ? 'active' : ''}`}
              onClick={() =>
                updatePrivacy('maskPiiPatterns', !settings.defaultPrivacy.maskPiiPatterns)
              }
            />
          </div>
        </div>

        <RedactionSettings />

        <CcaasSettings />

        <div className="settings-section">
          <h3>About</h3>
          <div className="setting-row">
            <div>
              <div className="setting-label">Screencapture Desktop</div>
              <div className="setting-description">
                Version 1.0.0 | Session recording and replay with privacy controls
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

export default Settings;
