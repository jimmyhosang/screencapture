import { useState, useRef } from 'react';
import { useRecorder, DEFAULT_PRIVACY_CONFIG } from './hooks/useRecorder';
import type { PrivacyConfig, RecorderConfig } from './hooks/useRecorder';
import { PlayerModal } from './components/PlayerModal';
import { RedactionOverlay, useRedactionIndicators } from './components/RedactionOverlay';
import './App.css';

// Convert legacy PrivacyConfig to RecorderConfig for the overlay
function privacyToRecorderConfig(privacy: PrivacyConfig): Partial<RecorderConfig> {
  return {
    maskAllInputs: privacy.maskAllInputs,
    maskTextContent: privacy.maskTextPatterns,
    blockSelectors: privacy.blockSensitiveElements ? ['.sensitive', '.pii'] : [],
    redactionConfig: {
      email: privacy.maskTextPatterns,
      phone: privacy.maskTextPatterns,
      ssn: privacy.maskTextPatterns,
      creditCard: privacy.maskTextPatterns,
    },
    maskTextSelectors: privacy.blockSensitiveElements ? ['.sensitive', '.pii'] : [],
    maskInputOptions: {
      password: true,
      email: privacy.maskAllInputs,
      tel: privacy.maskAllInputs,
      text: privacy.maskAllInputs,
      number: privacy.maskAllInputs,
      color: false,
      date: false,
      range: false,
      search: privacy.maskAllInputs,
      url: privacy.maskAllInputs,
      textarea: privacy.maskAllInputs,
      select: privacy.maskAllInputs,
    },
  };
}

function App() {
  const { isRecording, events, startRecording, stopRecording, clearEvents } = useRecorder();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [count, setCount] = useState(0);
  const [inputValue, setInputValue] = useState('');
  const [privacyConfig, setPrivacyConfig] = useState<PrivacyConfig>(DEFAULT_PRIVACY_CONFIG);
  const { showIndicators, toggleIndicators } = useRedactionIndicators(true);
  const appRef = useRef<HTMLDivElement>(null);

  const handleToggleRecording = () => {
    if (isRecording) {
      stopRecording();
    } else {
      clearEvents();
      startRecording(privacyConfig);
    }
  };

  const handleOpenPlayer = () => {
    if (isRecording) {
      stopRecording();
    }
    setIsModalOpen(true);
  };

  const updatePrivacyConfig = (key: keyof PrivacyConfig) => {
    setPrivacyConfig((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  // Convert to RecorderConfig for the overlay
  const recorderConfig = privacyToRecorderConfig(privacyConfig);

  return (
    <div className="app" ref={appRef}>
      <header className="app-header">
        <h1>rrweb Session Recorder</h1>
        <p className="subtitle">Record and replay user sessions with privacy controls</p>
      </header>

      {/* Privacy Settings Panel */}
      <div className="privacy-panel">
        <h3>Privacy Settings</h3>
        <p className="privacy-hint">Configure these before starting a recording</p>
        <div className="privacy-options">
          <label className={`privacy-option ${privacyConfig.maskAllInputs ? 'active' : ''}`}>
            <input
              type="checkbox"
              checked={privacyConfig.maskAllInputs}
              onChange={() => updatePrivacyConfig('maskAllInputs')}
              disabled={isRecording}
            />
            <span className="option-content">
              <span className="option-title">Mask All Inputs</span>
              <span className="option-desc">Replace input values with asterisks</span>
            </span>
          </label>

          <label className={`privacy-option ${privacyConfig.blockSensitiveElements ? 'active' : ''}`}>
            <input
              type="checkbox"
              checked={privacyConfig.blockSensitiveElements}
              onChange={() => updatePrivacyConfig('blockSensitiveElements')}
              disabled={isRecording}
            />
            <span className="option-content">
              <span className="option-title">Block Sensitive Elements</span>
              <span className="option-desc">Hide elements with .sensitive or .pii class</span>
            </span>
          </label>

          <label className={`privacy-option ${privacyConfig.maskTextPatterns ? 'active' : ''}`}>
            <input
              type="checkbox"
              checked={privacyConfig.maskTextPatterns}
              onChange={() => updatePrivacyConfig('maskTextPatterns')}
              disabled={isRecording}
            />
            <span className="option-content">
              <span className="option-title">Mask PII Patterns</span>
              <span className="option-desc">Redact emails, phones, SSNs, credit cards</span>
            </span>
          </label>

          <label className={`privacy-option ${privacyConfig.customMaskFn ? 'active' : ''}`}>
            <input
              type="checkbox"
              checked={privacyConfig.customMaskFn}
              onChange={() => updatePrivacyConfig('customMaskFn')}
              disabled={isRecording}
            />
            <span className="option-content">
              <span className="option-title">Custom Mask Function</span>
              <span className="option-desc">Mask any sequence of 4+ digits</span>
            </span>
          </label>
        </div>

        {/* Redaction Indicators Toggle */}
        <div className="indicators-toggle-container">
          <button
            className={`redaction-toggle ${showIndicators ? 'active' : ''}`}
            onClick={toggleIndicators}
          >
            <span className="redaction-toggle-icon">
              <svg viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z"/>
              </svg>
            </span>
            Show Redaction Indicators
          </button>

          {/* Legend */}
          {showIndicators && isRecording && (
            <div className="redaction-legend">
              <div className="redaction-legend-item">
                <span className="redaction-legend-icon redaction-legend-icon--input" />
                <span>Masked Input</span>
              </div>
              <div className="redaction-legend-item">
                <span className="redaction-legend-icon redaction-legend-icon--blocked" />
                <span>Blocked Element</span>
              </div>
              <div className="redaction-legend-item">
                <span className="redaction-legend-icon redaction-legend-icon--pii" />
                <span>PII Detected</span>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="controls">
        <button
          className={`control-btn ${isRecording ? 'recording' : ''}`}
          onClick={handleToggleRecording}
        >
          {isRecording ? (
            <>
              <span className="record-indicator" />
              Stop Recording
            </>
          ) : (
            'Start Recording'
          )}
        </button>

        <button
          className="control-btn play-btn"
          onClick={handleOpenPlayer}
          disabled={events.length < 2}
        >
          Play Recording ({events.length} events)
        </button>
      </div>

      <div className="demo-section">
        <h2>Interactive Demo Area</h2>
        <p className="demo-hint">
          Interact with the elements below while recording to capture your session
        </p>

        <div className="demo-grid">
          <div className="demo-card">
            <h3>Counter</h3>
            <div className="counter">
              <button onClick={() => setCount((c) => Math.max(0, c - 1))}>-</button>
              <span className="counter-value">{count}</span>
              <button onClick={() => setCount((c) => c + 1)}>+</button>
            </div>
          </div>

          <div className="demo-card">
            <h3>Text Input</h3>
            <input
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              placeholder="Type something..."
              className="demo-input"
            />
            {inputValue && <p className="input-preview">You typed: {inputValue}</p>}
          </div>

          <div className="demo-card">
            <h3>Hover Effects</h3>
            <div className="hover-grid">
              <div className="hover-box box-1">1</div>
              <div className="hover-box box-2">2</div>
              <div className="hover-box box-3">3</div>
              <div className="hover-box box-4">4</div>
            </div>
          </div>

          <div className="demo-card">
            <h3>Scrollable Content</h3>
            <div className="scroll-box">
              {Array.from({ length: 20 }, (_, i) => (
                <p key={i}>Scrollable item #{i + 1}</p>
              ))}
            </div>
          </div>
        </div>

        {/* Privacy Demo Section */}
        <h2 className="section-title">Privacy Demo Area</h2>
        <p className="demo-hint">
          Test the privacy settings with these sensitive data examples
        </p>

        <div className="demo-grid">
          <div className="demo-card sensitive-card">
            <h3>PII Text Patterns</h3>
            <div className="pii-examples">
              <p><strong>Email:</strong> john.doe@example.com</p>
              <p><strong>Phone:</strong> (555) 123-4567</p>
              <p><strong>SSN:</strong> 123-45-6789</p>
              <p><strong>Card:</strong> 4111-1111-1111-1111</p>
            </div>
          </div>

          <div className="demo-card">
            <h3>Sensitive Input Fields</h3>
            <input
              type="password"
              placeholder="Enter password..."
              className="demo-input"
            />
            <input
              type="email"
              placeholder="Enter email..."
              className="demo-input"
              style={{ marginTop: '0.5rem' }}
            />
            <input
              type="tel"
              placeholder="Enter phone..."
              className="demo-input"
              style={{ marginTop: '0.5rem' }}
            />
          </div>

          <div className="demo-card" data-private>
            <h3>Blocked Element Demo</h3>
            <div className="sensitive pii-block">
              <p>This entire block has the "sensitive" class.</p>
              <p>SSN: 987-65-4321</p>
              <p>It will be hidden when "Block Sensitive Elements" is enabled.</p>
            </div>
            <p className="block-note">Enable "Block Sensitive Elements" to hide the above</p>
          </div>

          <div className="demo-card">
            <h3>Mixed Content</h3>
            <p>Contact support at help@company.com or call 1-800-555-0199.</p>
            <p>Order #123456789 confirmed.</p>
            <p className="pii">Account: 9876543210</p>
          </div>
        </div>
      </div>

      <PlayerModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        events={events}
      />

      {/* Redaction Overlay - shows indicators during recording */}
      <RedactionOverlay
        isRecording={isRecording}
        showIndicators={showIndicators}
        config={recorderConfig}
        containerRef={appRef}
      />
    </div>
  );
}

export default App;
