/**
 * Permissions Manager
 *
 * Handles OS-level permissions required for screen capture and input tracking.
 * - macOS: Screen Recording, Accessibility permissions
 * - Windows: Generally no special permissions needed
 * - Linux: X11/Wayland access
 */

import { systemPreferences, shell, dialog, app, BrowserWindow } from 'electron';
import { ipcMain } from 'electron';

// =============================================================================
// Types
// =============================================================================

export interface PermissionStatus {
  screenCapture: 'granted' | 'denied' | 'not-determined' | 'restricted' | 'unknown';
  accessibility: 'granted' | 'denied' | 'not-determined' | 'restricted' | 'unknown';
  microphone: 'granted' | 'denied' | 'not-determined' | 'restricted' | 'unknown';
}

export interface PermissionCheckResult {
  allGranted: boolean;
  status: PermissionStatus;
  platform: NodeJS.Platform;
  missingPermissions: string[];
}

// =============================================================================
// PermissionsManager Class
// =============================================================================

export class PermissionsManager {
  private cachedStatus: PermissionStatus | null = null;
  private lastCheck: number = 0;
  private readonly cacheTimeout = 5000; // 5 seconds

  // ===========================================================================
  // Public Methods - Check Permissions
  // ===========================================================================

  /**
   * Check all required permissions for recording
   */
  async checkPermissions(): Promise<PermissionCheckResult> {
    const now = Date.now();

    // Use cache if recent
    if (this.cachedStatus && now - this.lastCheck < this.cacheTimeout) {
      return this.buildResult(this.cachedStatus);
    }

    const status = await this.getPermissionStatus();
    this.cachedStatus = status;
    this.lastCheck = now;

    return this.buildResult(status);
  }

  /**
   * Check if screen capture is allowed
   */
  async canCaptureScreen(): Promise<boolean> {
    const status = await this.getScreenCaptureStatus();
    return status === 'granted';
  }

  /**
   * Check if accessibility (for input tracking) is allowed
   */
  async canTrackInput(): Promise<boolean> {
    const status = await this.getAccessibilityStatus();
    return status === 'granted';
  }

  /**
   * Get detailed permission status
   */
  async getPermissionStatus(): Promise<PermissionStatus> {
    return {
      screenCapture: await this.getScreenCaptureStatus(),
      accessibility: await this.getAccessibilityStatus(),
      microphone: await this.getMicrophoneStatus()
    };
  }

  // ===========================================================================
  // Public Methods - Request Permissions
  // ===========================================================================

  /**
   * Request screen capture permission
   */
  async requestScreenCapture(): Promise<boolean> {
    if (process.platform !== 'darwin') {
      return true; // No explicit permission needed on Windows/Linux
    }

    try {
      // On macOS, we can't programmatically request screen recording permission
      // We can only check status and prompt user to open System Preferences
      const status = await this.getScreenCaptureStatus();

      if (status === 'granted') {
        return true;
      }

      // Show dialog prompting user to grant permission
      const result = await dialog.showMessageBox({
        type: 'warning',
        title: 'Screen Recording Permission Required',
        message: 'This app needs Screen Recording permission to capture your screen.',
        detail: 'Click "Open Settings" to grant permission in System Preferences > Privacy & Security > Screen Recording.',
        buttons: ['Open Settings', 'Cancel'],
        defaultId: 0,
        cancelId: 1
      });

      if (result.response === 0) {
        // Open System Preferences to Screen Recording
        shell.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture');
      }

      return false;
    } catch (error) {
      console.error('[Permissions] Error requesting screen capture:', error);
      return false;
    }
  }

  /**
   * Request accessibility permission (for input tracking)
   */
  async requestAccessibility(): Promise<boolean> {
    if (process.platform !== 'darwin') {
      return true; // No explicit permission needed on Windows/Linux
    }

    try {
      const status = await this.getAccessibilityStatus();

      if (status === 'granted') {
        return true;
      }

      // On macOS, we can use the trusted accessibility client API
      const isTrusted = systemPreferences.isTrustedAccessibilityClient(true);

      if (isTrusted) {
        return true;
      }

      // Show dialog prompting user to grant permission
      const result = await dialog.showMessageBox({
        type: 'warning',
        title: 'Accessibility Permission Required',
        message: 'This app needs Accessibility permission to track keyboard and mouse input.',
        detail: 'Click "Open Settings" to grant permission in System Preferences > Privacy & Security > Accessibility.',
        buttons: ['Open Settings', 'Cancel'],
        defaultId: 0,
        cancelId: 1
      });

      if (result.response === 0) {
        shell.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility');
      }

      return false;
    } catch (error) {
      console.error('[Permissions] Error requesting accessibility:', error);
      return false;
    }
  }

  /**
   * Request microphone permission
   */
  async requestMicrophone(): Promise<boolean> {
    if (process.platform !== 'darwin') {
      return true;
    }

    try {
      const status = await systemPreferences.askForMediaAccess('microphone');
      return status;
    } catch (error) {
      console.error('[Permissions] Error requesting microphone:', error);
      return false;
    }
  }

  /**
   * Open system preferences to the appropriate permission panel
   */
  openPermissionSettings(permission: 'screenCapture' | 'accessibility' | 'microphone'): void {
    if (process.platform !== 'darwin') {
      return;
    }

    const urls: Record<string, string> = {
      screenCapture: 'x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture',
      accessibility: 'x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility',
      microphone: 'x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone'
    };

    shell.openExternal(urls[permission]);
  }

  /**
   * Show combined permissions dialog
   */
  async showPermissionsDialog(): Promise<{
    screenCapture: boolean;
    accessibility: boolean;
    cancelled: boolean;
  }> {
    const status = await this.getPermissionStatus();
    const missing: string[] = [];

    if (status.screenCapture !== 'granted') {
      missing.push('Screen Recording');
    }
    if (status.accessibility !== 'granted') {
      missing.push('Accessibility');
    }

    if (missing.length === 0) {
      return { screenCapture: true, accessibility: true, cancelled: false };
    }

    const result = await dialog.showMessageBox({
      type: 'warning',
      title: 'Permissions Required',
      message: `This app needs the following permissions: ${missing.join(', ')}`,
      detail: `Please grant these permissions in System Preferences > Privacy & Security.\n\nScreen Recording: Required for capturing your screen.\nAccessibility: Required for tracking keyboard and mouse input.`,
      buttons: ['Open Screen Recording Settings', 'Open Accessibility Settings', 'Skip', 'Cancel'],
      defaultId: 0,
      cancelId: 3
    });

    switch (result.response) {
      case 0:
        this.openPermissionSettings('screenCapture');
        return { screenCapture: false, accessibility: status.accessibility === 'granted', cancelled: false };
      case 1:
        this.openPermissionSettings('accessibility');
        return { screenCapture: status.screenCapture === 'granted', accessibility: false, cancelled: false };
      case 2:
        return {
          screenCapture: status.screenCapture === 'granted',
          accessibility: status.accessibility === 'granted',
          cancelled: false
        };
      default:
        return { screenCapture: false, accessibility: false, cancelled: true };
    }
  }

  // ===========================================================================
  // Private Methods - Get Status
  // ===========================================================================

  private async getScreenCaptureStatus(): Promise<PermissionStatus['screenCapture']> {
    if (process.platform !== 'darwin') {
      return 'granted'; // Assume granted on non-macOS
    }

    try {
      // On macOS 10.15+, check screen capture permission
      const status = systemPreferences.getMediaAccessStatus('screen');

      switch (status) {
        case 'granted':
          return 'granted';
        case 'denied':
          return 'denied';
        case 'restricted':
          return 'restricted';
        case 'not-determined':
          return 'not-determined';
        default:
          return 'unknown';
      }
    } catch (error) {
      console.error('[Permissions] Error checking screen capture:', error);
      return 'unknown';
    }
  }

  private async getAccessibilityStatus(): Promise<PermissionStatus['accessibility']> {
    if (process.platform !== 'darwin') {
      return 'granted'; // Assume granted on non-macOS
    }

    try {
      // Check if we're a trusted accessibility client
      // Pass false to avoid prompting
      const isTrusted = systemPreferences.isTrustedAccessibilityClient(false);
      return isTrusted ? 'granted' : 'denied';
    } catch (error) {
      console.error('[Permissions] Error checking accessibility:', error);
      return 'unknown';
    }
  }

  private async getMicrophoneStatus(): Promise<PermissionStatus['microphone']> {
    if (process.platform !== 'darwin') {
      return 'granted';
    }

    try {
      const status = systemPreferences.getMediaAccessStatus('microphone');

      switch (status) {
        case 'granted':
          return 'granted';
        case 'denied':
          return 'denied';
        case 'restricted':
          return 'restricted';
        case 'not-determined':
          return 'not-determined';
        default:
          return 'unknown';
      }
    } catch (error) {
      console.error('[Permissions] Error checking microphone:', error);
      return 'unknown';
    }
  }

  // ===========================================================================
  // Private Methods - Helpers
  // ===========================================================================

  private buildResult(status: PermissionStatus): PermissionCheckResult {
    const missing: string[] = [];

    if (status.screenCapture !== 'granted') {
      missing.push('screenCapture');
    }
    if (status.accessibility !== 'granted') {
      missing.push('accessibility');
    }

    return {
      allGranted: missing.length === 0,
      status,
      platform: process.platform,
      missingPermissions: missing
    };
  }

  /**
   * Clear cached status
   */
  clearCache(): void {
    this.cachedStatus = null;
    this.lastCheck = 0;
  }
}

// =============================================================================
// Singleton Instance
// =============================================================================

let instance: PermissionsManager | null = null;

export function getPermissionsManager(): PermissionsManager {
  if (!instance) {
    instance = new PermissionsManager();
  }
  return instance;
}

export function resetPermissionsManager(): void {
  instance = null;
}

// =============================================================================
// IPC Handlers
// =============================================================================

export function setupPermissionsHandlers(): void {
  const manager = getPermissionsManager();

  ipcMain.handle('permissions:check', async () => {
    return manager.checkPermissions();
  });

  ipcMain.handle('permissions:getStatus', async () => {
    return manager.getPermissionStatus();
  });

  ipcMain.handle('permissions:canCaptureScreen', async () => {
    return manager.canCaptureScreen();
  });

  ipcMain.handle('permissions:canTrackInput', async () => {
    return manager.canTrackInput();
  });

  ipcMain.handle('permissions:requestScreenCapture', async () => {
    return manager.requestScreenCapture();
  });

  ipcMain.handle('permissions:requestAccessibility', async () => {
    return manager.requestAccessibility();
  });

  ipcMain.handle('permissions:requestMicrophone', async () => {
    return manager.requestMicrophone();
  });

  ipcMain.handle('permissions:openSettings', async (_, permission: 'screenCapture' | 'accessibility' | 'microphone') => {
    manager.openPermissionSettings(permission);
    return true;
  });

  ipcMain.handle('permissions:showDialog', async () => {
    return manager.showPermissionsDialog();
  });

  console.log('[Permissions] IPC handlers registered');
}
