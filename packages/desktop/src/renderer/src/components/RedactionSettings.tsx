import { useState, useEffect } from 'react';

// Types for redaction settings
type RedactionStyle = 'solid' | 'blur' | 'pixelate' | 'pattern';
type RedactionModeType = 'realtime' | 'postprocess';

interface RedactionMode {
  mode: RedactionModeType;
  enabled: boolean;
  defaultStyle: RedactionStyle;
  autoDetectPII: boolean;
  piiTypes: string[];
}

interface RedactionConfig {
  defaultStyle: RedactionStyle;
  solidColor: string;
  blurRadius: number;
  pixelSize: number;
  patternLineWidth: number;
  patternColor: string;
  padding: number;
  smoothEdges: boolean;
}

interface AutoRedactionConfig {
  enabled: boolean;
  frameInterval: number;
  piiTypes: string[];
  style: 'blur' | 'solid';
  solidColor: string;
  keepOriginal: boolean;
  minConfidence: 'high' | 'medium' | 'low';
}

// PII type information
const PII_TYPES = [
  { id: 'ssn', name: 'Social Security Number', description: 'US SSN format (XXX-XX-XXXX)' },
  { id: 'creditCard', name: 'Credit Card', description: 'Common credit card formats' },
  { id: 'email', name: 'Email Address', description: 'Email addresses' },
  { id: 'phone', name: 'Phone Number', description: 'US phone numbers' },
  { id: 'apiKey', name: 'API Keys', description: 'Common API key patterns' },
  { id: 'ipv4', name: 'IPv4 Address', description: 'IP v4 addresses' },
  { id: 'ipv6', name: 'IPv6 Address', description: 'IP v6 addresses' },
  { id: 'dateOfBirth', name: 'Date of Birth', description: 'Birth date patterns' },
  { id: 'passport', name: 'Passport', description: 'Passport numbers' },
  { id: 'driverLicense', name: 'Driver License', description: 'Driver license patterns' },
  { id: 'iban', name: 'IBAN', description: 'International bank account numbers' },
  { id: 'bankAccount', name: 'Bank Account', description: 'Bank account numbers' },
];

// Style options
const STYLE_OPTIONS: { value: RedactionStyle; label: string; description: string }[] = [
  { value: 'blur', label: 'Blur', description: 'Gaussian blur effect' },
  { value: 'solid', label: 'Solid Block', description: 'Solid color overlay' },
  { value: 'pixelate', label: 'Pixelate', description: 'Pixelation effect' },
  { value: 'pattern', label: 'Pattern', description: 'Crosshatch pattern' },
];

function RedactionSettings(): JSX.Element {
  const [mode, setMode] = useState<RedactionMode>({
    mode: 'postprocess',
    enabled: true,
    defaultStyle: 'blur',
    autoDetectPII: true,
    piiTypes: ['ssn', 'creditCard', 'email', 'phone', 'apiKey'],
  });

  const [config, setConfig] = useState<RedactionConfig>({
    defaultStyle: 'blur',
    solidColor: '#000000',
    blurRadius: 10,
    pixelSize: 8,
    patternLineWidth: 2,
    patternColor: '#333333',
    padding: 2,
    smoothEdges: true,
  });

  const [autoConfig, setAutoConfig] = useState<AutoRedactionConfig>({
    enabled: false,
    frameInterval: 1.0,
    piiTypes: ['ssn', 'creditCard', 'email', 'phone', 'apiKey'],
    style: 'solid',
    solidColor: 'black',
    keepOriginal: false,
    minConfidence: 'medium',
  });

  const [saved, setSaved] = useState(false);
  const [activeTab, setActiveTab] = useState<'mode' | 'style' | 'pii' | 'auto'>('auto');

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      const loadedMode = await window.api.redaction.getMode();
      const loadedConfig = await window.api.redaction.getConfig();
      setMode(loadedMode);
      setConfig(loadedConfig);

      // Load auto-redaction config
      if (window.api.sessionManager?.getAutoRedactionConfig) {
        const loadedAutoConfig = await window.api.sessionManager.getAutoRedactionConfig();
        setAutoConfig(loadedAutoConfig);
      }
    } catch (error) {
      console.error('Failed to load redaction settings:', error);
    }
  };

  const saveSettings = async () => {
    try {
      await window.api.redaction.setMode(mode);
      await window.api.redaction.setConfig(config);

      // Save auto-redaction config
      if (window.api.sessionManager?.setAutoRedactionConfig) {
        await window.api.sessionManager.setAutoRedactionConfig(autoConfig);
      }

      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (error) {
      console.error('Failed to save redaction settings:', error);
    }
  };

  const togglePIIType = (typeId: string) => {
    setMode((prev) => ({
      ...prev,
      piiTypes: prev.piiTypes.includes(typeId)
        ? prev.piiTypes.filter((t) => t !== typeId)
        : [...prev.piiTypes, typeId],
    }));
  };

  const selectAllPII = () => {
    setMode((prev) => ({
      ...prev,
      piiTypes: PII_TYPES.map((t) => t.id),
    }));
  };

  const deselectAllPII = () => {
    setMode((prev) => ({
      ...prev,
      piiTypes: [],
    }));
  };

  const toggleAutoPIIType = (typeId: string) => {
    setAutoConfig((prev) => ({
      ...prev,
      piiTypes: prev.piiTypes.includes(typeId)
        ? prev.piiTypes.filter((t) => t !== typeId)
        : [...prev.piiTypes, typeId],
    }));
  };

  return (
    <div className="redaction-settings">
      <div className="settings-header">
        <h3>Redaction Settings</h3>
        <button className="btn btn-primary btn-sm" onClick={saveSettings}>
          {saved ? 'Saved!' : 'Save'}
        </button>
      </div>

      {/* Tab Navigation */}
      <div className="settings-tabs">
        <button
          className={`tab ${activeTab === 'auto' ? 'active' : ''}`}
          onClick={() => setActiveTab('auto')}
        >
          Auto-Redact
        </button>
        <button
          className={`tab ${activeTab === 'mode' ? 'active' : ''}`}
          onClick={() => setActiveTab('mode')}
        >
          Mode
        </button>
        <button
          className={`tab ${activeTab === 'style' ? 'active' : ''}`}
          onClick={() => setActiveTab('style')}
        >
          Style
        </button>
        <button
          className={`tab ${activeTab === 'pii' ? 'active' : ''}`}
          onClick={() => setActiveTab('pii')}
        >
          PII Types
        </button>
      </div>

      {/* Auto-Redact Tab */}
      {activeTab === 'auto' && (
        <div className="settings-panel">
          <div className="info-box" style={{ marginBottom: '16px', backgroundColor: 'var(--bg-warning, #fef3cd)', borderColor: 'var(--border-warning, #ffc107)' }}>
            <strong>Automatic Post-Recording Redaction</strong>
            <p style={{ marginTop: '8px', marginBottom: 0, fontSize: '0.85rem' }}>
              When enabled, recordings will be automatically scanned for PII (SSN, credit cards, emails, etc.)
              after capture and sensitive information will be redacted before the file is saved.
            </p>
          </div>

          <div className="setting-row">
            <div>
              <div className="setting-label">Enable Auto-Redaction</div>
              <div className="setting-description">Automatically scan and redact PII after each recording</div>
            </div>
            <div
              className={`toggle ${autoConfig.enabled ? 'active' : ''}`}
              onClick={() => setAutoConfig((prev) => ({ ...prev, enabled: !prev.enabled }))}
            />
          </div>

          {autoConfig.enabled && (
            <>
              <div className="setting-row">
                <div>
                  <div className="setting-label">Scan Interval</div>
                  <div className="setting-description">How often to analyze frames (in seconds)</div>
                </div>
                <select
                  value={autoConfig.frameInterval}
                  onChange={(e) => setAutoConfig((prev) => ({ ...prev, frameInterval: parseFloat(e.target.value) }))}
                  className="setting-select"
                >
                  <option value={0.5}>Every 0.5s (thorough, slower)</option>
                  <option value={1}>Every 1s (balanced)</option>
                  <option value={2}>Every 2s (faster)</option>
                  <option value={5}>Every 5s (quick scan)</option>
                </select>
              </div>

              <div className="setting-row">
                <div>
                  <div className="setting-label">Redaction Style</div>
                  <div className="setting-description">How PII areas appear in the video</div>
                </div>
                <select
                  value={autoConfig.style}
                  onChange={(e) => setAutoConfig((prev) => ({ ...prev, style: e.target.value as 'blur' | 'solid' }))}
                  className="setting-select"
                >
                  <option value="solid">Solid Black Box</option>
                  <option value="blur">Blur</option>
                </select>
              </div>

              <div className="setting-row">
                <div>
                  <div className="setting-label">Detection Confidence</div>
                  <div className="setting-description">Minimum confidence for PII detection</div>
                </div>
                <select
                  value={autoConfig.minConfidence}
                  onChange={(e) => setAutoConfig((prev) => ({ ...prev, minConfidence: e.target.value as 'high' | 'medium' | 'low' }))}
                  className="setting-select"
                >
                  <option value="high">High (fewer false positives)</option>
                  <option value="medium">Medium (balanced)</option>
                  <option value="low">Low (catch more PII)</option>
                </select>
              </div>

              <div className="setting-row">
                <div>
                  <div className="setting-label">Keep Original</div>
                  <div className="setting-description">Save both original and redacted versions</div>
                </div>
                <div
                  className={`toggle ${autoConfig.keepOriginal ? 'active' : ''}`}
                  onClick={() => setAutoConfig((prev) => ({ ...prev, keepOriginal: !prev.keepOriginal }))}
                />
              </div>

              <div style={{ marginTop: '16px' }}>
                <div className="setting-label" style={{ marginBottom: '12px' }}>PII Types to Detect</div>
                <div className="pii-types-list">
                  {PII_TYPES.slice(0, 5).map((type) => (
                    <div
                      key={type.id}
                      className={`pii-type-item ${autoConfig.piiTypes.includes(type.id) ? 'selected' : ''}`}
                      onClick={() => toggleAutoPIIType(type.id)}
                    >
                      <div className="pii-type-checkbox">
                        {autoConfig.piiTypes.includes(type.id) && (
                          <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
                            <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
                          </svg>
                        )}
                      </div>
                      <div className="pii-type-info">
                        <div className="pii-type-name">{type.name}</div>
                        <div className="pii-type-description">{type.description}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* Mode Tab */}
      {activeTab === 'mode' && (
        <div className="settings-panel">
          <div className="setting-row">
            <div>
              <div className="setting-label">Enable Redaction</div>
              <div className="setting-description">Apply redactions to detected PII</div>
            </div>
            <div
              className={`toggle ${mode.enabled ? 'active' : ''}`}
              onClick={() => setMode((prev) => ({ ...prev, enabled: !prev.enabled }))}
            />
          </div>

          <div className="setting-row">
            <div>
              <div className="setting-label">Redaction Mode</div>
              <div className="setting-description">When to apply redactions</div>
            </div>
            <select
              value={mode.mode}
              onChange={(e) => setMode((prev) => ({ ...prev, mode: e.target.value as RedactionModeType }))}
              className="setting-select"
            >
              <option value="postprocess">Post-Process (After Recording)</option>
              <option value="realtime">Real-Time (During Recording)</option>
            </select>
          </div>

          <div className="info-box">
            {mode.mode === 'realtime' ? (
              <>
                <strong>Real-Time Mode:</strong> Redactions are applied during recording.
                The original PII is never stored. Best for maximum privacy.
              </>
            ) : (
              <>
                <strong>Post-Process Mode:</strong> Recording stores original video.
                Redactions are applied during export. Allows reviewing and editing
                redaction masks before applying.
              </>
            )}
          </div>

          <div className="setting-row">
            <div>
              <div className="setting-label">Auto-Detect PII</div>
              <div className="setting-description">
                Automatically scan frames for sensitive information
              </div>
            </div>
            <div
              className={`toggle ${mode.autoDetectPII ? 'active' : ''}`}
              onClick={() => setMode((prev) => ({ ...prev, autoDetectPII: !prev.autoDetectPII }))}
            />
          </div>
        </div>
      )}

      {/* Style Tab */}
      {activeTab === 'style' && (
        <div className="settings-panel">
          <div className="setting-row">
            <div>
              <div className="setting-label">Default Style</div>
              <div className="setting-description">How redacted areas appear</div>
            </div>
            <select
              value={mode.defaultStyle}
              onChange={(e) => {
                const style = e.target.value as RedactionStyle;
                setMode((prev) => ({ ...prev, defaultStyle: style }));
                setConfig((prev) => ({ ...prev, defaultStyle: style }));
              }}
              className="setting-select"
            >
              {STYLE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          {/* Style Preview */}
          <div className="style-preview">
            <div className="preview-label">Preview</div>
            <div className="preview-container">
              <div className={`preview-sample style-${mode.defaultStyle}`}>
                <span className="sample-text">john.doe@email.com</span>
                <div className="redaction-overlay" style={{
                  backgroundColor: mode.defaultStyle === 'solid' ? config.solidColor : undefined,
                }} />
              </div>
            </div>
          </div>

          {/* Style-specific settings */}
          {mode.defaultStyle === 'solid' && (
            <div className="setting-row">
              <div>
                <div className="setting-label">Solid Color</div>
                <div className="setting-description">Color for solid block redaction</div>
              </div>
              <input
                type="color"
                value={config.solidColor}
                onChange={(e) => setConfig((prev) => ({ ...prev, solidColor: e.target.value }))}
                className="color-picker"
              />
            </div>
          )}

          {mode.defaultStyle === 'blur' && (
            <div className="setting-row">
              <div>
                <div className="setting-label">Blur Radius: {config.blurRadius}px</div>
                <div className="setting-description">Strength of blur effect</div>
              </div>
              <input
                type="range"
                min="5"
                max="30"
                value={config.blurRadius}
                onChange={(e) => setConfig((prev) => ({ ...prev, blurRadius: parseInt(e.target.value) }))}
                className="slider"
              />
            </div>
          )}

          {mode.defaultStyle === 'pixelate' && (
            <div className="setting-row">
              <div>
                <div className="setting-label">Pixel Size: {config.pixelSize}px</div>
                <div className="setting-description">Size of pixelation blocks</div>
              </div>
              <input
                type="range"
                min="4"
                max="20"
                value={config.pixelSize}
                onChange={(e) => setConfig((prev) => ({ ...prev, pixelSize: parseInt(e.target.value) }))}
                className="slider"
              />
            </div>
          )}

          {mode.defaultStyle === 'pattern' && (
            <div className="setting-row">
              <div>
                <div className="setting-label">Pattern Color</div>
                <div className="setting-description">Color for pattern lines</div>
              </div>
              <input
                type="color"
                value={config.patternColor}
                onChange={(e) => setConfig((prev) => ({ ...prev, patternColor: e.target.value }))}
                className="color-picker"
              />
            </div>
          )}

          <div className="setting-row">
            <div>
              <div className="setting-label">Padding: {config.padding}px</div>
              <div className="setting-description">Extra space around redacted areas</div>
            </div>
            <input
              type="range"
              min="0"
              max="10"
              value={config.padding}
              onChange={(e) => setConfig((prev) => ({ ...prev, padding: parseInt(e.target.value) }))}
              className="slider"
            />
          </div>

          <div className="setting-row">
            <div>
              <div className="setting-label">Smooth Edges</div>
              <div className="setting-description">Round corners on redaction boxes</div>
            </div>
            <div
              className={`toggle ${config.smoothEdges ? 'active' : ''}`}
              onClick={() => setConfig((prev) => ({ ...prev, smoothEdges: !prev.smoothEdges }))}
            />
          </div>
        </div>
      )}

      {/* PII Types Tab */}
      {activeTab === 'pii' && (
        <div className="settings-panel">
          <div className="pii-actions">
            <button className="btn btn-sm" onClick={selectAllPII}>
              Select All
            </button>
            <button className="btn btn-sm" onClick={deselectAllPII}>
              Deselect All
            </button>
          </div>

          <div className="pii-types-list">
            {PII_TYPES.map((type) => (
              <div
                key={type.id}
                className={`pii-type-item ${mode.piiTypes.includes(type.id) ? 'selected' : ''}`}
                onClick={() => togglePIIType(type.id)}
              >
                <div className="pii-type-checkbox">
                  {mode.piiTypes.includes(type.id) && (
                    <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
                      <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
                    </svg>
                  )}
                </div>
                <div className="pii-type-info">
                  <div className="pii-type-name">{type.name}</div>
                  <div className="pii-type-description">{type.description}</div>
                </div>
              </div>
            ))}
          </div>

          <div className="info-box" style={{ marginTop: '16px' }}>
            <strong>Note:</strong> Only selected PII types will be detected and redacted.
            More types may slow down real-time processing.
          </div>
        </div>
      )}
    </div>
  );
}

export default RedactionSettings;
