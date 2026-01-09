/**
 * Permissions Status Component
 *
 * Displays OS permission status and provides buttons to request/grant permissions.
 */

import { useState, useEffect, useCallback } from 'react';
import './PermissionsStatus.css';

interface PermissionStatus {
  screenCapture: 'granted' | 'denied' | 'not-determined' | 'restricted' | 'unknown';
  accessibility: 'granted' | 'denied' | 'not-determined' | 'restricted' | 'unknown';
  microphone: 'granted' | 'denied' | 'not-determined' | 'restricted' | 'unknown';
}

interface PermissionCheckResult {
  allGranted: boolean;
  status: PermissionStatus;
  platform: string;
  missingPermissions: string[];
}

interface PermissionsStatusProps {
  onAllGranted?: () => void;
  showMicrophone?: boolean;
  compact?: boolean;
}

const STATUS_ICONS: Record<string, string> = {
  granted: '✓',
  denied: '✕',
  'not-determined': '?',
  restricted: '⊘',
  unknown: '?'
};

const STATUS_LABELS: Record<string, string> = {
  granted: 'Granted',
  denied: 'Denied',
  'not-determined': 'Not Asked',
  restricted: 'Restricted',
  unknown: 'Unknown'
};

export default function PermissionsStatus({
  onAllGranted,
  showMicrophone = false,
  compact = false
}: PermissionsStatusProps): JSX.Element | null {
  const [status, setStatus] = useState<PermissionCheckResult | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRequesting, setIsRequesting] = useState<string | null>(null);

  // Check if we're in Electron
  const isElectron = typeof window !== 'undefined' && window.api?.permissions;

  const checkPermissions = useCallback(async () => {
    if (!isElectron) return;

    try {
      const result = await window.api.permissions.check();
      setStatus(result);

      if (result.allGranted && onAllGranted) {
        onAllGranted();
      }
    } catch (err) {
      console.error('Failed to check permissions:', err);
    } finally {
      setIsLoading(false);
    }
  }, [isElectron, onAllGranted]);

  useEffect(() => {
    checkPermissions();

    // Poll for permission changes
    const interval = setInterval(checkPermissions, 5000);
    return () => clearInterval(interval);
  }, [checkPermissions]);

  const handleRequestScreenCapture = async () => {
    if (!isElectron) return;

    setIsRequesting('screenCapture');
    try {
      await window.api.permissions.requestScreenCapture();
      // Recheck after a delay (user may need to restart app)
      setTimeout(checkPermissions, 1000);
    } finally {
      setIsRequesting(null);
    }
  };

  const handleRequestAccessibility = async () => {
    if (!isElectron) return;

    setIsRequesting('accessibility');
    try {
      await window.api.permissions.requestAccessibility();
      setTimeout(checkPermissions, 1000);
    } finally {
      setIsRequesting(null);
    }
  };

  const handleOpenSettings = (permission: 'screenCapture' | 'accessibility' | 'microphone') => {
    if (!isElectron) return;
    window.api.permissions.openSettings(permission);
  };

  // Not in Electron or still loading
  if (!isElectron || isLoading) {
    return null;
  }

  // All permissions granted
  if (status?.allGranted) {
    if (compact) {
      return (
        <div className="permissions-status compact granted">
          <span className="status-icon">✓</span>
          <span>All permissions granted</span>
        </div>
      );
    }
    return null;
  }

  // Not macOS - no special permissions UI needed
  if (status?.platform !== 'darwin') {
    return null;
  }

  const screenStatus = status?.status.screenCapture || 'unknown';
  const accessibilityStatus = status?.status.accessibility || 'unknown';
  const micStatus = status?.status.microphone || 'unknown';

  if (compact) {
    const missingCount = status?.missingPermissions.length || 0;
    return (
      <div className="permissions-status compact warning" onClick={() => handleOpenSettings('screenCapture')}>
        <span className="status-icon">⚠️</span>
        <span>{missingCount} permission{missingCount !== 1 ? 's' : ''} needed</span>
      </div>
    );
  }

  return (
    <div className="permissions-status">
      <div className="permissions-header">
        <h4>⚠️ Permissions Required</h4>
        <p>Grant the following permissions to enable recording:</p>
      </div>

      <div className="permissions-list">
        {/* Screen Capture */}
        <div className={`permission-item ${screenStatus}`}>
          <div className="permission-info">
            <div className="permission-icon">🖥️</div>
            <div className="permission-details">
              <span className="permission-name">Screen Recording</span>
              <span className="permission-description">
                Required to capture your screen
              </span>
            </div>
          </div>
          <div className="permission-status">
            <span className={`status-badge ${screenStatus}`}>
              {STATUS_ICONS[screenStatus]} {STATUS_LABELS[screenStatus]}
            </span>
            {screenStatus !== 'granted' && (
              <button
                className="btn btn-sm"
                onClick={handleRequestScreenCapture}
                disabled={isRequesting === 'screenCapture'}
              >
                {isRequesting === 'screenCapture' ? 'Opening...' : 'Grant'}
              </button>
            )}
          </div>
        </div>

        {/* Accessibility */}
        <div className={`permission-item ${accessibilityStatus}`}>
          <div className="permission-info">
            <div className="permission-icon">⌨️</div>
            <div className="permission-details">
              <span className="permission-name">Accessibility</span>
              <span className="permission-description">
                Required for keyboard & mouse tracking
              </span>
            </div>
          </div>
          <div className="permission-status">
            <span className={`status-badge ${accessibilityStatus}`}>
              {STATUS_ICONS[accessibilityStatus]} {STATUS_LABELS[accessibilityStatus]}
            </span>
            {accessibilityStatus !== 'granted' && (
              <button
                className="btn btn-sm"
                onClick={handleRequestAccessibility}
                disabled={isRequesting === 'accessibility'}
              >
                {isRequesting === 'accessibility' ? 'Opening...' : 'Grant'}
              </button>
            )}
          </div>
        </div>

        {/* Microphone (optional) */}
        {showMicrophone && (
          <div className={`permission-item ${micStatus}`}>
            <div className="permission-info">
              <div className="permission-icon">🎤</div>
              <div className="permission-details">
                <span className="permission-name">Microphone</span>
                <span className="permission-description">
                  Optional - for audio recording
                </span>
              </div>
            </div>
            <div className="permission-status">
              <span className={`status-badge ${micStatus}`}>
                {STATUS_ICONS[micStatus]} {STATUS_LABELS[micStatus]}
              </span>
              {micStatus !== 'granted' && (
                <button
                  className="btn btn-sm"
                  onClick={() => handleOpenSettings('microphone')}
                >
                  Grant
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      <div className="permissions-footer">
        <p className="permissions-note">
          After granting permissions, you may need to restart the app.
        </p>
        <button
          className="btn btn-secondary"
          onClick={checkPermissions}
        >
          🔄 Refresh Status
        </button>
      </div>
    </div>
  );
}
