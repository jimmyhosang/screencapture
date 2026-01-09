/**
 * CCaaS Settings Component
 *
 * Configuration for Contact Center as a Service integration.
 * Allows enabling/disabling webhook server, configuring port/secret, and testing.
 */

import { useState, useEffect, useCallback } from 'react';
import './CcaasSettings.css';

interface CCaaSConfig {
  enabled: boolean;
  port: number;
  secret: string;
  autoRecordOnCallStart: boolean;
  enabledQueues: string[];
}

interface WebhookStatus {
  listening: boolean;
  port: number;
  uptime: number;
  requestCount: number;
  lastError?: string;
}

export default function CcaasSettings(): JSX.Element {
  const [config, setConfig] = useState<CCaaSConfig>({
    enabled: false,
    port: 3847,
    secret: '',
    autoRecordOnCallStart: true,
    enabledQueues: []
  });
  const [status, setStatus] = useState<WebhookStatus | null>(null);
  const [showSecret, setShowSecret] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [portError, setPortError] = useState<string | null>(null);
  const [queueFilter, setQueueFilter] = useState('');

  // Load config and status on mount
  useEffect(() => {
    loadConfig();
    loadStatus();

    // Poll status every 5 seconds
    const interval = setInterval(loadStatus, 5000);
    return () => clearInterval(interval);
  }, []);

  const loadConfig = async () => {
    try {
      const cfg = await window.api.ccaas.getConfig();
      setConfig({
        enabled: cfg.enabled || false,
        port: cfg.port || 3847,
        secret: cfg.secret || '',
        autoRecordOnCallStart: cfg.autoRecordOnCallStart !== false,
        enabledQueues: cfg.enabledQueues || []
      });
      setQueueFilter(cfg.enabledQueues?.join(', ') || '');
    } catch (error) {
      console.error('Failed to load CCaaS config:', error);
    }
  };

  const loadStatus = async () => {
    try {
      const s = await window.api.ccaas.getStatus();
      setStatus(s);
    } catch (error) {
      console.error('Failed to load CCaaS status:', error);
    }
  };

  const validatePort = (port: number): string | null => {
    if (port < 1024) return 'Port must be 1024 or higher';
    if (port > 65535) return 'Port must be 65535 or lower';
    return null;
  };

  const updateConfig = async (updates: Partial<CCaaSConfig>) => {
    const newConfig = { ...config, ...updates };
    setConfig(newConfig);

    // Validate port
    if (updates.port !== undefined) {
      const error = validatePort(updates.port);
      setPortError(error);
      if (error) return;
    }

    try {
      await window.api.ccaas.updateConfig(newConfig);
    } catch (error) {
      console.error('Failed to update CCaaS config:', error);
    }
  };

  const handleEnableToggle = async () => {
    const newEnabled = !config.enabled;

    if (newEnabled) {
      // Start server
      const success = await window.api.ccaas.start({
        port: config.port,
        secret: config.secret,
        autoRecordOnCallStart: config.autoRecordOnCallStart,
        enabledQueues: config.enabledQueues
      });

      if (!success) {
        setPortError('Failed to start server. Port may be in use.');
        return;
      }
    } else {
      // Stop server
      await window.api.ccaas.stop();
    }

    setConfig((prev) => ({ ...prev, enabled: newEnabled }));
    await window.api.ccaas.updateConfig({ enabled: newEnabled });
    loadStatus();
  };

  const generateSecret = () => {
    const array = new Uint8Array(32);
    crypto.getRandomValues(array);
    const secret = Array.from(array, (b) => b.toString(16).padStart(2, '0')).join('');
    updateConfig({ secret });
  };

  const testWebhook = async () => {
    setIsTesting(true);
    setTestResult(null);

    try {
      const result = await window.api.ccaas.testWebhook({
        event: 'call.started',
        data: {
          callId: `test-${Date.now()}`,
          agentId: 'test-agent',
          queueName: 'test-queue',
          direction: 'inbound',
          timestamp: new Date().toISOString()
        }
      });
      setTestResult(result);
    } catch (error) {
      setTestResult({
        success: false,
        message: error instanceof Error ? error.message : 'Test failed'
      });
    } finally {
      setIsTesting(false);
    }
  };

  const handleQueueFilterChange = (value: string) => {
    setQueueFilter(value);
    const queues = value
      .split(',')
      .map((q) => q.trim())
      .filter((q) => q.length > 0);
    updateConfig({ enabledQueues: queues });
  };

  return (
    <div className="settings-section">
      <div className="section-header">
        <h3>Contact Center Integration</h3>
        <div className={`status-badge ${status?.listening ? 'active' : 'inactive'}`}>
          {status?.listening ? `Listening on port ${status.port}` : 'Not running'}
        </div>
      </div>

      {/* Enable Toggle */}
      <div className="setting-row">
        <div>
          <div className="setting-label">Enable CCaaS Integration</div>
          <div className="setting-description">
            Start webhook server to receive contact center events
          </div>
        </div>
        <div
          className={`toggle ${config.enabled ? 'active' : ''}`}
          onClick={handleEnableToggle}
        />
      </div>

      {/* Webhook Port */}
      <div className="setting-row">
        <div>
          <div className="setting-label">Webhook Port</div>
          <div className="setting-description">
            HTTP port for receiving CCaaS webhooks (1024-65535)
          </div>
        </div>
        <div className="input-group">
          <input
            type="number"
            className={`input-number ${portError ? 'error' : ''}`}
            value={config.port}
            onChange={(e) => updateConfig({ port: parseInt(e.target.value) || 3847 })}
            min={1024}
            max={65535}
            disabled={config.enabled}
          />
          {portError && <div className="input-error">{portError}</div>}
        </div>
      </div>

      {/* Webhook Secret */}
      <div className="setting-row">
        <div>
          <div className="setting-label">Webhook Secret</div>
          <div className="setting-description">
            HMAC secret for verifying webhook signatures
          </div>
        </div>
        <div className="input-group secret-input">
          <input
            type={showSecret ? 'text' : 'password'}
            className="input-text"
            value={config.secret}
            onChange={(e) => updateConfig({ secret: e.target.value })}
            placeholder="Enter secret or generate"
          />
          <button
            className="btn btn-icon"
            onClick={() => setShowSecret(!showSecret)}
            title={showSecret ? 'Hide' : 'Show'}
          >
            {showSecret ? '🙈' : '👁️'}
          </button>
          <button
            className="btn btn-secondary btn-small"
            onClick={generateSecret}
          >
            Generate
          </button>
        </div>
      </div>

      {/* Queue Filter */}
      <div className="setting-row">
        <div>
          <div className="setting-label">Queue Filter</div>
          <div className="setting-description">
            Comma-separated queue names (leave empty for all queues)
          </div>
        </div>
        <input
          type="text"
          className="input-text"
          value={queueFilter}
          onChange={(e) => handleQueueFilterChange(e.target.value)}
          placeholder="support, sales, billing"
        />
      </div>

      {/* Auto-record Toggle */}
      <div className="setting-row">
        <div>
          <div className="setting-label">Auto-record on Call Start</div>
          <div className="setting-description">
            Automatically start recording when a call begins
          </div>
        </div>
        <div
          className={`toggle ${config.autoRecordOnCallStart ? 'active' : ''}`}
          onClick={() => updateConfig({ autoRecordOnCallStart: !config.autoRecordOnCallStart })}
        />
      </div>

      {/* Test Connection */}
      <div className="setting-row">
        <div>
          <div className="setting-label">Test Connection</div>
          <div className="setting-description">
            Send a test event to verify webhook configuration
          </div>
        </div>
        <button
          className="btn btn-secondary"
          onClick={testWebhook}
          disabled={!config.enabled || isTesting}
        >
          {isTesting ? 'Testing...' : 'Test Webhook'}
        </button>
      </div>

      {/* Test Result */}
      {testResult && (
        <div className={`test-result ${testResult.success ? 'success' : 'error'}`}>
          {testResult.success ? '✓' : '✗'} {testResult.message}
        </div>
      )}

      {/* Status Details */}
      {status?.listening && (
        <div className="status-details">
          <div className="status-item">
            <span className="status-label">Uptime:</span>
            <span>{formatUptime(status.uptime)}</span>
          </div>
          <div className="status-item">
            <span className="status-label">Requests:</span>
            <span>{status.requestCount}</span>
          </div>
          {status.lastError && (
            <div className="status-item error">
              <span className="status-label">Last Error:</span>
              <span>{status.lastError}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function formatUptime(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  if (hours > 0) {
    return `${hours}h ${minutes % 60}m`;
  } else if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  }
  return `${seconds}s`;
}
