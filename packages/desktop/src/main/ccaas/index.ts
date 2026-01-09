/**
 * CCaaS Integration Module
 *
 * Provides webhook server for receiving contact center events
 * and automatically triggering screen recordings.
 */

import { ipcMain } from 'electron';
import { getWebhookServer, resetWebhookServer } from './webhook-server';
import { getCallStateManager, resetCallStateManager } from './call-state';
import { getCallSummary } from './event-handlers';
import { setupCCaaSRepositoryHandlers as setupRepositoryHandlers } from './repositories';
import type {
  CCaaSWebhookConfig,
  CCaaSServerStatus,
  CCaaSEvent
} from './types';

export { getWebhookServer, resetWebhookServer } from './webhook-server';
export { getCallStateManager, resetCallStateManager } from './call-state';
export { handleCCaaSEvent, getCallSummary } from './event-handlers';
export * from './types';
export * from './errors';
export {
  CallEventRepository,
  ActiveWindowRepository,
  RecordingCallRepository,
  getCallEventRepository,
  getActiveWindowRepository,
  getRecordingCallRepository,
  setupCCaaSRepositoryHandlers,
  type CallEvent,
  type ActiveWindowLog,
  type RecordingCallMetadata
} from './repositories';

/**
 * Setup IPC handlers for CCaaS integration
 */
export function setupCCaaSHandlers(): void {
  const server = getWebhookServer();

  // Get server status
  ipcMain.handle('ccaas:getStatus', (): CCaaSServerStatus => {
    return server.getStatus();
  });

  // Start the webhook server
  ipcMain.handle('ccaas:start', async (_, config?: Partial<CCaaSWebhookConfig>): Promise<boolean> => {
    console.log('[CCaaS] Starting webhook server...');
    return server.start(config);
  });

  // Stop the webhook server
  ipcMain.handle('ccaas:stop', async (): Promise<boolean> => {
    console.log('[CCaaS] Stopping webhook server...');
    return server.stop();
  });

  // Test webhook processing
  ipcMain.handle(
    'ccaas:testWebhook',
    async (_, event: CCaaSEvent): Promise<{ success: boolean; message: string }> => {
      console.log('[CCaaS] Testing webhook event...');
      return server.testEvent(event);
    }
  );

  // Get current configuration
  ipcMain.handle('ccaas:getConfig', (): CCaaSWebhookConfig => {
    return server.getConfig();
  });

  // Update configuration
  ipcMain.handle(
    'ccaas:updateConfig',
    (_, config: Partial<CCaaSWebhookConfig>): CCaaSWebhookConfig => {
      return server.updateConfig(config);
    }
  );

  // Get call summary
  ipcMain.handle('ccaas:getCallSummary', () => {
    return getCallSummary();
  });

  // Get active calls
  ipcMain.handle('ccaas:getActiveCalls', () => {
    const callStateManager = getCallStateManager();
    return callStateManager.getActiveCalls();
  });

  // Setup repository handlers (call events, window logs, recording-call association)
  setupRepositoryHandlers();

  console.log('[CCaaS] IPC handlers registered');
}

/**
 * Initialize CCaaS module with settings
 */
export async function initCCaaS(settings: Partial<CCaaSWebhookConfig>): Promise<void> {
  if (settings.enabled) {
    const server = getWebhookServer();
    const success = await server.start(settings);
    if (success) {
      console.log(`[CCaaS] Webhook server started on port ${settings.port}`);
    } else {
      console.error('[CCaaS] Failed to start webhook server');
    }
  }
}

/**
 * Cleanup CCaaS module on app shutdown
 */
export async function cleanupCCaaS(): Promise<void> {
  console.log('[CCaaS] Cleaning up...');
  resetWebhookServer();
  resetCallStateManager();
}
