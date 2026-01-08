import { app, shell, BrowserWindow, ipcMain, dialog, Tray, Menu, nativeImage } from 'electron';
import { join } from 'path';
import { electronApp, optimizer, is } from '@electron-toolkit/utils';
import { initDatabase, getDatabase } from './database';
import { setupRecordingHandlers } from './recordings';
import { setupOCRHandlers } from './ocr';
import type { SessionRecord, SessionStats, AppSettings } from './types';

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.mjs'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.on('ready-to-show', () => {
    mainWindow?.show();
  });

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url);
    return { action: 'deny' };
  });

  // Load the renderer
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL']);
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'));
  }

  // Minimize to tray instead of closing
  mainWindow.on('close', (event) => {
    if (!app.isQuitting) {
      event.preventDefault();
      mainWindow?.hide();
    }
  });
}

function createTray(): void {
  // Create a simple tray icon (16x16 placeholder)
  const icon = nativeImage.createEmpty();
  tray = new Tray(icon);

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Open Screencapture',
      click: () => {
        mainWindow?.show();
      }
    },
    {
      label: 'Import Session...',
      click: async () => {
        const result = await dialog.showOpenDialog({
          properties: ['openFile'],
          filters: [{ name: 'JSON Files', extensions: ['json'] }]
        });
        if (!result.canceled && result.filePaths.length > 0) {
          mainWindow?.webContents.send('import-session-file', result.filePaths[0]);
          mainWindow?.show();
        }
      }
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => {
        app.isQuitting = true;
        app.quit();
      }
    }
  ]);

  tray.setToolTip('Screencapture');
  tray.setContextMenu(contextMenu);

  tray.on('click', () => {
    mainWindow?.show();
  });
}

// IPC Handlers for session CRUD operations
function setupIpcHandlers(): void {
  const db = getDatabase();

  // Get all sessions (metadata only)
  ipcMain.handle('sessions:getAll', (): SessionRecord[] => {
    const stmt = db.prepare(`
      SELECT id, name, timestamp, duration, eventCount, privacyConfig
      FROM sessions
      ORDER BY timestamp DESC
    `);
    return stmt.all() as SessionRecord[];
  });

  // Get single session with events
  ipcMain.handle('sessions:get', (_, id: string): SessionRecord | null => {
    const stmt = db.prepare('SELECT * FROM sessions WHERE id = ?');
    const row = stmt.get(id) as SessionRecord | undefined;
    if (row && row.events) {
      row.events = JSON.parse(row.events as unknown as string);
      row.privacyConfig = row.privacyConfig ? JSON.parse(row.privacyConfig as unknown as string) : null;
    }
    return row || null;
  });

  // Save a new session
  ipcMain.handle('sessions:save', (_, session: SessionRecord): boolean => {
    try {
      const stmt = db.prepare(`
        INSERT INTO sessions (id, name, timestamp, duration, eventCount, events, privacyConfig)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `);
      stmt.run(
        session.id,
        session.name,
        session.timestamp,
        session.duration,
        session.eventCount,
        JSON.stringify(session.events),
        session.privacyConfig ? JSON.stringify(session.privacyConfig) : null
      );
      return true;
    } catch (error) {
      console.error('Error saving session:', error);
      return false;
    }
  });

  // Update session
  ipcMain.handle('sessions:update', (_, id: string, updates: Partial<SessionRecord>): boolean => {
    try {
      const fields: string[] = [];
      const values: unknown[] = [];

      if (updates.name !== undefined) {
        fields.push('name = ?');
        values.push(updates.name);
      }

      if (fields.length === 0) return false;

      values.push(id);
      const stmt = db.prepare(`UPDATE sessions SET ${fields.join(', ')} WHERE id = ?`);
      stmt.run(...values);
      return true;
    } catch (error) {
      console.error('Error updating session:', error);
      return false;
    }
  });

  // Delete session
  ipcMain.handle('sessions:delete', (_, id: string): boolean => {
    try {
      const stmt = db.prepare('DELETE FROM sessions WHERE id = ?');
      stmt.run(id);
      return true;
    } catch (error) {
      console.error('Error deleting session:', error);
      return false;
    }
  });

  // Get session stats
  ipcMain.handle('sessions:stats', (): SessionStats => {
    const countStmt = db.prepare('SELECT COUNT(*) as count FROM sessions');
    const durationStmt = db.prepare('SELECT SUM(duration) as total FROM sessions');
    const eventsStmt = db.prepare('SELECT SUM(eventCount) as total FROM sessions');

    const count = (countStmt.get() as { count: number }).count;
    const totalDuration = (durationStmt.get() as { total: number | null }).total || 0;
    const totalEvents = (eventsStmt.get() as { total: number | null }).total || 0;

    return {
      sessionCount: count,
      totalDuration,
      totalEvents,
      averageDuration: count > 0 ? totalDuration / count : 0
    };
  });

  // Import session from JSON file
  ipcMain.handle('sessions:import', async (_, filePath: string): Promise<SessionRecord | null> => {
    try {
      const fs = await import('fs/promises');
      const content = await fs.readFile(filePath, 'utf-8');
      const data = JSON.parse(content);

      // Handle both single session and array of sessions
      const sessions = Array.isArray(data) ? data : [data];
      const imported: SessionRecord[] = [];

      for (const sessionData of sessions) {
        const session: SessionRecord = {
          id: sessionData.id || crypto.randomUUID(),
          name: sessionData.name || `Imported Session`,
          timestamp: sessionData.timestamp || Date.now(),
          duration: sessionData.duration || 0,
          eventCount: sessionData.events?.length || sessionData.eventCount || 0,
          events: sessionData.events || [],
          privacyConfig: sessionData.privacyConfig || null
        };

        const stmt = db.prepare(`
          INSERT OR REPLACE INTO sessions (id, name, timestamp, duration, eventCount, events, privacyConfig)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `);
        stmt.run(
          session.id,
          session.name,
          session.timestamp,
          session.duration,
          session.eventCount,
          JSON.stringify(session.events),
          session.privacyConfig ? JSON.stringify(session.privacyConfig) : null
        );
        imported.push(session);
      }

      return imported[0] || null;
    } catch (error) {
      console.error('Error importing session:', error);
      return null;
    }
  });

  // Export session to JSON file
  ipcMain.handle('sessions:export', async (_, id: string): Promise<boolean> => {
    try {
      const stmt = db.prepare('SELECT * FROM sessions WHERE id = ?');
      const session = stmt.get(id) as SessionRecord | undefined;

      if (!session) return false;

      const result = await dialog.showSaveDialog({
        defaultPath: `session-${session.name.replace(/\s+/g, '-')}.json`,
        filters: [{ name: 'JSON Files', extensions: ['json'] }]
      });

      if (result.canceled || !result.filePath) return false;

      const fs = await import('fs/promises');
      const exportData = {
        ...session,
        events: JSON.parse(session.events as unknown as string),
        privacyConfig: session.privacyConfig ? JSON.parse(session.privacyConfig as unknown as string) : null
      };
      await fs.writeFile(result.filePath, JSON.stringify(exportData, null, 2));
      return true;
    } catch (error) {
      console.error('Error exporting session:', error);
      return false;
    }
  });

  // Show open dialog for import
  ipcMain.handle('dialog:openFile', async (): Promise<string | null> => {
    const result = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters: [{ name: 'JSON Files', extensions: ['json'] }]
    });
    return result.canceled ? null : result.filePaths[0] || null;
  });

  // Settings handlers
  ipcMain.handle('settings:get', (): AppSettings => {
    const stmt = db.prepare('SELECT value FROM settings WHERE key = ?');
    const row = stmt.get('app_settings') as { value: string } | undefined;
    if (row) {
      return JSON.parse(row.value);
    }
    return {
      theme: 'system',
      defaultPrivacy: {
        maskInputs: true,
        blockSensitive: true,
        maskPiiPatterns: true
      },
      autoImportPath: null,
      recordingsPath: null
    };
  });

  ipcMain.handle('settings:set', (_, settings: AppSettings): boolean => {
    try {
      const stmt = db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)');
      stmt.run('app_settings', JSON.stringify(settings));
      return true;
    } catch (error) {
      console.error('Error saving settings:', error);
      return false;
    }
  });
}

// Extend app with isQuitting property
declare module 'electron' {
  interface App {
    isQuitting?: boolean;
  }
}

app.whenReady().then(() => {
  // Set app user model id for windows
  electronApp.setAppUserModelId('com.screencapture.desktop');

  // Default open or close DevTools by F12 in development
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window);
  });

  // Initialize database
  initDatabase();

  // Setup IPC handlers
  setupIpcHandlers();
  setupRecordingHandlers();
  setupOCRHandlers();

  // Create window and tray
  createWindow();
  createTray();

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    } else {
      mainWindow?.show();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  app.isQuitting = true;
});
