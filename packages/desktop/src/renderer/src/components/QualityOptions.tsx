import { useState, useEffect } from 'react';

// Types
export type QualityPreset = 'low' | 'medium' | 'high' | 'ultra' | 'custom';

export interface QualitySettings {
  preset: QualityPreset;
  frameRate: number;
  resolution: 'native' | '1080p' | '720p' | '480p';
  bitrate: number;        // kbps
  codec: 'h264' | 'vp9' | 'av1';
  audioEnabled: boolean;
  audioBitrate: number;   // kbps
}

interface QualityOptionsProps {
  settings: QualitySettings;
  onChange: (settings: QualitySettings) => void;
  isRecording?: boolean;
}

// Preset configurations
const PRESETS: Record<Exclude<QualityPreset, 'custom'>, Omit<QualitySettings, 'preset'>> = {
  low: {
    frameRate: 15,
    resolution: '480p',
    bitrate: 1000,
    codec: 'h264',
    audioEnabled: false,
    audioBitrate: 64
  },
  medium: {
    frameRate: 24,
    resolution: '720p',
    bitrate: 2500,
    codec: 'h264',
    audioEnabled: true,
    audioBitrate: 128
  },
  high: {
    frameRate: 30,
    resolution: '1080p',
    bitrate: 5000,
    codec: 'h264',
    audioEnabled: true,
    audioBitrate: 192
  },
  ultra: {
    frameRate: 60,
    resolution: 'native',
    bitrate: 10000,
    codec: 'vp9',
    audioEnabled: true,
    audioBitrate: 256
  }
};

const PRESET_INFO: Record<Exclude<QualityPreset, 'custom'>, { name: string; description: string; size: string }> = {
  low: {
    name: 'Low',
    description: 'Minimal file size, lower quality',
    size: '~50MB/hr'
  },
  medium: {
    name: 'Medium',
    description: 'Balanced quality and size',
    size: '~150MB/hr'
  },
  high: {
    name: 'High',
    description: 'High quality, larger files',
    size: '~350MB/hr'
  },
  ultra: {
    name: 'Ultra',
    description: 'Maximum quality, very large files',
    size: '~700MB/hr'
  }
};

const FRAME_RATES = [15, 24, 30, 60];
const RESOLUTIONS = ['native', '1080p', '720p', '480p'] as const;
const CODECS = [
  { value: 'h264', label: 'H.264 (Best compatibility)' },
  { value: 'vp9', label: 'VP9 (Better compression)' },
  { value: 'av1', label: 'AV1 (Best quality, slower)' }
] as const;

function QualityOptions({ settings, onChange, isRecording = false }: QualityOptionsProps): JSX.Element {
  const [localSettings, setLocalSettings] = useState<QualitySettings>(settings);

  useEffect(() => {
    setLocalSettings(settings);
  }, [settings]);

  const handlePresetSelect = (preset: QualityPreset) => {
    if (preset === 'custom') {
      onChange({ ...localSettings, preset: 'custom' });
    } else {
      onChange({ ...PRESETS[preset], preset });
    }
  };

  const handleSettingChange = <K extends keyof QualitySettings>(
    key: K,
    value: QualitySettings[K]
  ) => {
    const newSettings = {
      ...localSettings,
      [key]: value,
      preset: 'custom' as QualityPreset
    };
    setLocalSettings(newSettings);
    onChange(newSettings);
  };

  const getEstimatedFileSize = (): string => {
    // Rough estimation based on bitrate
    const videoBitrate = localSettings.bitrate;
    const audioBitrate = localSettings.audioEnabled ? localSettings.audioBitrate : 0;
    const totalKbps = videoBitrate + audioBitrate;
    const mbPerHour = (totalKbps * 3600) / 8 / 1024;

    if (mbPerHour < 1000) {
      return `~${Math.round(mbPerHour)}MB/hr`;
    }
    return `~${(mbPerHour / 1024).toFixed(1)}GB/hr`;
  };

  return (
    <div className="quality-options">
      {/* Presets */}
      <div className="quality-presets">
        <h4>Quality Presets</h4>
        <div className="preset-cards">
          {(Object.keys(PRESETS) as Exclude<QualityPreset, 'custom'>[]).map((preset) => (
            <div
              key={preset}
              className={`preset-card ${localSettings.preset === preset ? 'selected' : ''}`}
              onClick={() => !isRecording && handlePresetSelect(preset)}
              style={{ opacity: isRecording ? 0.5 : 1, cursor: isRecording ? 'not-allowed' : 'pointer' }}
            >
              <div className="preset-name">{PRESET_INFO[preset].name}</div>
              <div className="preset-desc">{PRESET_INFO[preset].description}</div>
              <div className="preset-specs">
                {PRESETS[preset].frameRate}fps • {PRESETS[preset].resolution} • {PRESET_INFO[preset].size}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Custom Settings */}
      <div className="quality-custom">
        <h4>Custom Settings {localSettings.preset === 'custom' && <span className="custom-badge">Active</span>}</h4>

        {/* Frame Rate */}
        <div className="quality-row">
          <label>Frame Rate</label>
          <select
            value={localSettings.frameRate}
            onChange={(e) => handleSettingChange('frameRate', Number(e.target.value))}
            disabled={isRecording}
          >
            {FRAME_RATES.map((fps) => (
              <option key={fps} value={fps}>{fps} fps</option>
            ))}
          </select>
        </div>

        {/* Resolution */}
        <div className="quality-row">
          <label>Resolution</label>
          <select
            value={localSettings.resolution}
            onChange={(e) => handleSettingChange('resolution', e.target.value as QualitySettings['resolution'])}
            disabled={isRecording}
          >
            {RESOLUTIONS.map((res) => (
              <option key={res} value={res}>
                {res === 'native' ? 'Native (Source Resolution)' : res}
              </option>
            ))}
          </select>
        </div>

        {/* Video Bitrate */}
        <div className="quality-row">
          <label>Video Bitrate</label>
          <input
            type="range"
            min={500}
            max={20000}
            step={500}
            value={localSettings.bitrate}
            onChange={(e) => handleSettingChange('bitrate', Number(e.target.value))}
            disabled={isRecording}
          />
          <span className="value-display">{(localSettings.bitrate / 1000).toFixed(1)} Mbps</span>
        </div>

        {/* Codec */}
        <div className="quality-row">
          <label>Codec</label>
          <select
            value={localSettings.codec}
            onChange={(e) => handleSettingChange('codec', e.target.value as QualitySettings['codec'])}
            disabled={isRecording}
          >
            {CODECS.map((codec) => (
              <option key={codec.value} value={codec.value}>{codec.label}</option>
            ))}
          </select>
        </div>

        {/* Audio */}
        <div className="quality-row">
          <label>Audio</label>
          <div className="toggle-group">
            <label className="toggle-label">
              <input
                type="checkbox"
                checked={localSettings.audioEnabled}
                onChange={(e) => handleSettingChange('audioEnabled', e.target.checked)}
                disabled={isRecording}
              />
              <span>Enable Audio Recording</span>
            </label>
          </div>
        </div>

        {localSettings.audioEnabled && (
          <div className="quality-row">
            <label>Audio Bitrate</label>
            <select
              value={localSettings.audioBitrate}
              onChange={(e) => handleSettingChange('audioBitrate', Number(e.target.value))}
              disabled={isRecording}
            >
              <option value={64}>64 kbps (Low)</option>
              <option value={128}>128 kbps (Medium)</option>
              <option value={192}>192 kbps (High)</option>
              <option value={256}>256 kbps (Very High)</option>
              <option value={320}>320 kbps (Lossless-like)</option>
            </select>
          </div>
        )}

        {/* Estimated File Size */}
        <div className="quality-row estimated">
          <label>Estimated Size</label>
          <span className="value-display estimated-size">{getEstimatedFileSize()}</span>
        </div>
      </div>

      {isRecording && (
        <div className="quality-warning">
          Quality settings cannot be changed while recording is active.
        </div>
      )}
    </div>
  );
}

export default QualityOptions;
export { PRESETS as QUALITY_PRESETS };
