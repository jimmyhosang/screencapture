import { useState, useEffect } from 'react';
import './RecordingControls.css';

interface RecordingConfig {
    maskAllInputs: boolean;
    maskPiiPatterns: boolean;
    blockSensitive: boolean;
}

interface RecordingControlsProps {
    onRecordingComplete: (events: unknown[], duration: number, config: RecordingConfig) => void;
}

export default function RecordingControls({ onRecordingComplete }: RecordingControlsProps): JSX.Element {
    const [url, setUrl] = useState('https://');
    const [isRecording, setIsRecording] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Privacy config
    const [config, setConfig] = useState<RecordingConfig>({
        maskAllInputs: true,
        maskPiiPatterns: true,
        blockSensitive: true
    });

    // Check if running in Electron with window.api available
    const isElectron = typeof window !== 'undefined' && window.api?.recording;

    // Check recording state on mount (only if Electron)
    useEffect(() => {
        if (isElectron) {
            window.api.recording.isActive().then(setIsRecording);
        }
    }, [isElectron]);

    // If not in Electron, show fallback UI
    if (!isElectron) {
        return (
            <div className="recording-controls">
                <h2>🎥 Record Session</h2>
                <div className="error-message" style={{
                    padding: '24px',
                    textAlign: 'center',
                    backgroundColor: 'rgba(239, 68, 68, 0.1)',
                    borderRadius: '8px',
                    marginTop: '16px'
                }}>
                    <p style={{ fontSize: '18px', marginBottom: '8px' }}>⚠️ Electron Required</p>
                    <p style={{ opacity: 0.8 }}>Recording features require the native Electron application.</p>
                    <p style={{ opacity: 0.6, fontSize: '14px', marginTop: '12px' }}>
                        Run <code>pnpm --filter @screencapture/desktop dev</code> to start the full app.
                    </p>
                </div>
            </div>
        );
    }

    const handleStart = async () => {
        if (!url || url === 'https://') {
            setError('Please enter a valid URL');
            return;
        }

        setError(null);

        const result = await window.api.recording.startUrl(url, {
            maskAllInputs: config.maskAllInputs,
            maskTextContent: config.maskPiiPatterns,
            blockSelectors: config.blockSensitive ? ['.sensitive', '.pii', '[data-private]'] : [],
            maskTextSelectors: config.maskPiiPatterns ? ['.sensitive', '.pii'] : [],
            maskInputOptions: {
                password: true,
                email: config.maskAllInputs,
                tel: config.maskAllInputs,
                text: config.maskAllInputs,
                textarea: config.maskAllInputs
            }
        });

        if (result.success) {
            setIsRecording(true);
        } else {
            setError(result.error || 'Failed to start recording');
        }
    };

    const handleStop = async () => {
        const result = await window.api.recording.stop();

        if (result.success && result.events) {
            setIsRecording(false);
            onRecordingComplete(result.events, result.duration || 0, config);
        } else {
            setError(result.error || 'Failed to stop recording');
            setIsRecording(false);
        }
    };

    return (
        <div className="recording-controls">
            <h2>🎥 Record Session</h2>

            {/* URL Input */}
            <div className="input-group">
                <label htmlFor="record-url">Target URL</label>
                <input
                    id="record-url"
                    type="url"
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    placeholder="https://example.com"
                    disabled={isRecording}
                />
            </div>

            {/* Privacy Config */}
            <div className="privacy-config">
                <h3>Privacy Settings</h3>

                <label className="checkbox-label">
                    <input
                        type="checkbox"
                        checked={config.maskAllInputs}
                        onChange={(e) => setConfig({ ...config, maskAllInputs: e.target.checked })}
                        disabled={isRecording}
                    />
                    <span>Mask all inputs</span>
                </label>

                <label className="checkbox-label">
                    <input
                        type="checkbox"
                        checked={config.maskPiiPatterns}
                        onChange={(e) => setConfig({ ...config, maskPiiPatterns: e.target.checked })}
                        disabled={isRecording}
                    />
                    <span>Mask PII patterns (email, phone, SSN)</span>
                </label>

                <label className="checkbox-label">
                    <input
                        type="checkbox"
                        checked={config.blockSensitive}
                        onChange={(e) => setConfig({ ...config, blockSensitive: e.target.checked })}
                        disabled={isRecording}
                    />
                    <span>Block sensitive elements</span>
                </label>
            </div>

            {/* Error Display */}
            {error && <div className="error-message">{error}</div>}

            {/* Recording Status */}
            {isRecording && (
                <div className="recording-status">
                    <span className="recording-indicator"></span>
                    Recording in progress...
                </div>
            )}

            {/* Action Buttons */}
            <div className="action-buttons">
                {!isRecording ? (
                    <button className="btn btn-record" onClick={handleStart}>
                        ⏺ Start Recording
                    </button>
                ) : (
                    <button className="btn btn-stop" onClick={handleStop}>
                        ⏹ Stop Recording
                    </button>
                )}
            </div>
        </div>
    );
}
