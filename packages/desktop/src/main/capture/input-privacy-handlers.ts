/**
 * Input Privacy IPC Handlers
 *
 * Exposes privacy filter configuration to the renderer process.
 */

import { ipcMain } from 'electron';
import { getInputPrivacyFilter, type PrivacyConfig } from './input-privacy-filter';

export function setupInputPrivacyHandlers(): void {
  const filter = getInputPrivacyFilter();

  // Get privacy config
  ipcMain.handle('privacy:getConfig', async () => {
    return filter.getConfig();
  });

  // Update privacy config
  ipcMain.handle('privacy:setConfig', async (_, config: Partial<PrivacyConfig>) => {
    filter.setConfig(config);
    return filter.getConfig();
  });

  // Add sensitive app pattern
  ipcMain.handle('privacy:addSensitiveApp', async (_, pattern: string) => {
    filter.addSensitiveApp(pattern);
    return true;
  });

  // Add trusted app pattern
  ipcMain.handle('privacy:addTrustedApp', async (_, pattern: string) => {
    filter.addTrustedApp(pattern);
    return true;
  });

  // Add excluded app pattern
  ipcMain.handle('privacy:addExcludedApp', async (_, pattern: string) => {
    filter.addExcludedApp(pattern);
    return true;
  });

  // Get privacy decision for current context
  ipcMain.handle('privacy:getDecision', async () => {
    return filter.getPrivacyDecision();
  });

  // Update window context (for testing)
  ipcMain.handle('privacy:setWindowContext', async (_, context: {
    processName?: string;
    windowTitle?: string;
    url?: string;
  }) => {
    filter.setWindowContext(context);
    return true;
  });

  console.log('[InputPrivacy] IPC handlers registered');
}
