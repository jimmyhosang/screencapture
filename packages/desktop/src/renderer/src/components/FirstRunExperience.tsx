import { useState, useEffect, useCallback } from 'react';

// Storage key for tracking first run
const FIRST_RUN_KEY = 'screencapture_first_run_completed';

interface FirstRunExperienceProps {
  onComplete: () => void;
}

type PermissionStatus = 'pending' | 'granted' | 'denied' | 'checking';

interface Step {
  id: string;
  title: string;
  completed: boolean;
}

const SHORTCUTS = [
  { action: 'Start/Stop Recording', key: 'Ctrl+Shift+R', mac: '⌘+Shift+R' },
  { action: 'Pause/Resume Recording', key: 'Ctrl+Shift+P', mac: '⌘+Shift+P' },
  { action: 'Quick Screenshot', key: 'Ctrl+Shift+S', mac: '⌘+Shift+S' },
  { action: 'Toggle Performance Monitor', key: 'Ctrl+Shift+M', mac: '⌘+Shift+M' },
];

function FirstRunExperience({ onComplete }: FirstRunExperienceProps): JSX.Element | null {
  const [currentStep, setCurrentStep] = useState(0);
  const [steps, setSteps] = useState<Step[]>([
    { id: 'welcome', title: 'Welcome', completed: false },
    { id: 'permissions', title: 'Permissions', completed: false },
    { id: 'shortcuts', title: 'Shortcuts', completed: false },
    { id: 'privacy', title: 'Privacy', completed: false },
    { id: 'ready', title: 'Ready', completed: false },
  ]);
  const [screenPermission, setScreenPermission] = useState<PermissionStatus>('pending');
  const [isVisible, setIsVisible] = useState(false);
  const [isMac] = useState(() => navigator.platform.toLowerCase().includes('mac'));

  // Check if first run has been completed
  useEffect(() => {
    const completed = localStorage.getItem(FIRST_RUN_KEY);
    if (!completed) {
      setIsVisible(true);
    }
  }, []);

  // Check screen capture permission
  const checkScreenPermission = useCallback(async () => {
    setScreenPermission('checking');
    try {
      // Try to get screen sources to check permission
      const sources = await window.api.recording.getSources();
      if (sources && sources.length > 0) {
        setScreenPermission('granted');
        markStepComplete('permissions');
      } else {
        setScreenPermission('denied');
      }
    } catch (error) {
      console.error('Error checking screen permission:', error);
      setScreenPermission('denied');
    }
  }, []);

  useEffect(() => {
    if (currentStep === 1 && screenPermission === 'pending') {
      checkScreenPermission();
    }
  }, [currentStep, screenPermission, checkScreenPermission]);

  const markStepComplete = (stepId: string) => {
    setSteps(prev => prev.map(s =>
      s.id === stepId ? { ...s, completed: true } : s
    ));
  };

  const handleNext = () => {
    markStepComplete(steps[currentStep].id);
    if (currentStep < steps.length - 1) {
      setCurrentStep(currentStep + 1);
    }
  };

  const handlePrevious = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handleComplete = () => {
    localStorage.setItem(FIRST_RUN_KEY, 'true');
    setIsVisible(false);
    onComplete();
  };

  const handleSkip = () => {
    localStorage.setItem(FIRST_RUN_KEY, 'true');
    setIsVisible(false);
    onComplete();
  };

  if (!isVisible) return null;

  return (
    <div className="first-run-overlay">
      <div className="first-run-modal">
        <div className="first-run-header">
          <h2>Welcome to Screencapture</h2>
          <p>Let's set up a few things to get you started</p>
        </div>

        <div className="first-run-content">
          {/* Step 0: Welcome */}
          {currentStep === 0 && (
            <div className="first-run-step">
              <div className="welcome-content">
                <div className="welcome-icon">
                  <svg viewBox="0 0 24 24" width="64" height="64" fill="var(--accent)">
                    <path d="M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4z"/>
                  </svg>
                </div>
                <h3>Record Your Screen with Privacy</h3>
                <p>Screencapture helps you record your screen while automatically protecting sensitive information using advanced PII detection and redaction.</p>

                <div className="feature-list">
                  <div className="feature-item">
                    <span className="feature-icon">🎥</span>
                    <span>High-quality screen recording</span>
                  </div>
                  <div className="feature-item">
                    <span className="feature-icon">🔒</span>
                    <span>Automatic PII detection & redaction</span>
                  </div>
                  <div className="feature-item">
                    <span className="feature-icon">✏️</span>
                    <span>Manual region redaction tools</span>
                  </div>
                  <div className="feature-item">
                    <span className="feature-icon">📊</span>
                    <span>Performance monitoring</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Step 1: Permissions */}
          {currentStep === 1 && (
            <div className="first-run-step">
              <div className="step-header">
                <div className="step-number">1</div>
                <h3>Screen Recording Permission</h3>
              </div>
              <div className="step-content">
                <p>Screencapture needs permission to record your screen. This is required for the app to function.</p>

                <div className={`permission-status ${screenPermission}`}>
                  {screenPermission === 'checking' && (
                    <>
                      <span className="status-icon">⏳</span>
                      <span>Checking permission...</span>
                    </>
                  )}
                  {screenPermission === 'granted' && (
                    <>
                      <span className="status-icon">✓</span>
                      <span>Screen recording permission granted</span>
                    </>
                  )}
                  {screenPermission === 'denied' && (
                    <>
                      <span className="status-icon">⚠</span>
                      <span>Permission not granted - you may need to enable it in system settings</span>
                    </>
                  )}
                  {screenPermission === 'pending' && (
                    <>
                      <span className="status-icon">•</span>
                      <span>Permission check pending</span>
                    </>
                  )}
                </div>

                {screenPermission === 'denied' && (
                  <div className="permission-help">
                    <p>To enable screen recording:</p>
                    {isMac ? (
                      <ol>
                        <li>Open System Preferences → Security & Privacy</li>
                        <li>Click the Privacy tab</li>
                        <li>Select Screen Recording from the left sidebar</li>
                        <li>Check the box next to Screencapture</li>
                        <li>Restart the app if needed</li>
                      </ol>
                    ) : (
                      <ol>
                        <li>When prompted, select a screen or window to share</li>
                        <li>Click "Share" to grant permission</li>
                        <li>The permission will be remembered for future sessions</li>
                      </ol>
                    )}
                    <button className="btn btn-primary btn-sm" onClick={checkScreenPermission}>
                      Check Again
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Step 2: Keyboard Shortcuts */}
          {currentStep === 2 && (
            <div className="first-run-step">
              <div className="step-header">
                <div className="step-number">2</div>
                <h3>Keyboard Shortcuts</h3>
              </div>
              <div className="step-content">
                <p>Use these global shortcuts to control recording from anywhere:</p>

                <div className="shortcuts-list">
                  {SHORTCUTS.map((shortcut, i) => (
                    <div key={i} className="shortcut-item">
                      <span>{shortcut.action}</span>
                      <span className="shortcut-key">{isMac ? shortcut.mac : shortcut.key}</span>
                    </div>
                  ))}
                </div>

                <p className="shortcut-note">
                  These shortcuts work even when the app is minimized or in the background.
                </p>
              </div>
            </div>
          )}

          {/* Step 3: Privacy Settings */}
          {currentStep === 3 && (
            <div className="first-run-step">
              <div className="step-header">
                <div className="step-number">3</div>
                <h3>Privacy Features</h3>
              </div>
              <div className="step-content">
                <p>Screencapture includes powerful privacy protection features:</p>

                <div className="privacy-features">
                  <div className="privacy-feature">
                    <h4>🔍 Automatic PII Detection</h4>
                    <p>OCR-based detection of emails, phone numbers, SSNs, credit cards, and more</p>
                  </div>
                  <div className="privacy-feature">
                    <h4>🖌️ Manual Redaction</h4>
                    <p>Draw regions to blur or block specific areas</p>
                  </div>
                  <div className="privacy-feature">
                    <h4>📱 App Blocking</h4>
                    <p>Automatically blur specific applications (Slack, Discord, password managers)</p>
                  </div>
                  <div className="privacy-feature">
                    <h4>📋 Redaction Profiles</h4>
                    <p>Save and share redaction configurations for different use cases</p>
                  </div>
                </div>

                <p className="privacy-note">
                  You can configure privacy settings in the Settings panel after setup.
                </p>
              </div>
            </div>
          )}

          {/* Step 4: Ready */}
          {currentStep === 4 && (
            <div className="first-run-step">
              <div className="step-header">
                <div className="step-number">✓</div>
                <h3>You're All Set!</h3>
              </div>
              <div className="step-content">
                <p>Screencapture is ready to use. Here's how to get started:</p>

                <div className="getting-started">
                  <div className="start-step">
                    <span className="start-number">1</span>
                    <span>Select a screen or window source from the main panel</span>
                  </div>
                  <div className="start-step">
                    <span className="start-number">2</span>
                    <span>Configure your recording quality and privacy settings</span>
                  </div>
                  <div className="start-step">
                    <span className="start-number">3</span>
                    <span>Click "Start Recording" or press {isMac ? '⌘+Shift+R' : 'Ctrl+Shift+R'}</span>
                  </div>
                  <div className="start-step">
                    <span className="start-number">4</span>
                    <span>Review and export your recordings from the sidebar</span>
                  </div>
                </div>

                <div className="tips-box">
                  <h4>Quick Tips</h4>
                  <ul>
                    <li>Use the system tray icon for quick access</li>
                    <li>Check the Performance Monitor to ensure smooth recording</li>
                    <li>Set up App Block Rules for recurring privacy needs</li>
                  </ul>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="first-run-footer">
          <div className="step-indicators">
            {steps.map((step, i) => (
              <div
                key={step.id}
                className={`step-dot ${i === currentStep ? 'active' : ''} ${step.completed ? 'completed' : ''}`}
                onClick={() => setCurrentStep(i)}
              />
            ))}
          </div>

          <div className="footer-buttons">
            {currentStep > 0 && (
              <button className="btn btn-ghost" onClick={handlePrevious}>
                Back
              </button>
            )}
            {currentStep === 0 && (
              <button className="btn btn-ghost" onClick={handleSkip}>
                Skip Setup
              </button>
            )}
            {currentStep < steps.length - 1 ? (
              <button className="btn btn-primary" onClick={handleNext}>
                Next
              </button>
            ) : (
              <button className="btn btn-primary" onClick={handleComplete}>
                Get Started
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// Helper to check if first run is needed
export function isFirstRun(): boolean {
  return !localStorage.getItem(FIRST_RUN_KEY);
}

// Helper to reset first run (for testing)
export function resetFirstRun(): void {
  localStorage.removeItem(FIRST_RUN_KEY);
}

export default FirstRunExperience;
