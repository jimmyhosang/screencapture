import { ipcMain, dialog } from 'electron';
import { readFile } from 'fs/promises';
import { existsSync } from 'fs';
import { getTextDetector, terminateTextDetector } from './textDetector';
import type { OCRConfig, OCRResult, TextRegion } from './types';

export function setupOCRHandlers(): void {
  const detector = getTextDetector();

  // Initialize OCR engine
  ipcMain.handle('ocr:initialize', async (): Promise<{ success: boolean; engine: string }> => {
    try {
      await detector.initialize();
      return { success: true, engine: detector.getEngine() };
    } catch (error) {
      console.error('[OCR] Initialization error:', error);
      return { success: false, engine: 'none' };
    }
  });

  // Process image data (from renderer, as base64 or array buffer)
  ipcMain.handle('ocr:processFrame', async (
    _,
    imageData: string | ArrayBuffer,
    width: number,
    height: number
  ): Promise<OCRResult> => {
    try {
      let buffer: Buffer;
      if (typeof imageData === 'string') {
        // Base64 encoded
        buffer = Buffer.from(imageData, 'base64');
      } else {
        buffer = Buffer.from(imageData);
      }
      return await detector.processFrame(buffer, width, height);
    } catch (error) {
      console.error('[OCR] Process frame error:', error);
      return {
        regions: [],
        processingTimeMs: 0,
        engine: detector.getEngine() as 'vision' | 'tesseract',
        frameWidth: width,
        frameHeight: height
      };
    }
  });

  // Process image file directly
  ipcMain.handle('ocr:processFile', async (_, filePath: string): Promise<OCRResult | null> => {
    try {
      if (!existsSync(filePath)) {
        console.error('[OCR] File not found:', filePath);
        return null;
      }

      const imageBuffer = await readFile(filePath);

      // Get image dimensions - for now assume reasonable defaults
      // In production, use sharp or another library to read actual dimensions
      const { getImageDimensions } = await import('./imageUtils');
      const { width, height } = await getImageDimensions(imageBuffer);

      return await detector.processFrame(imageBuffer, width, height);
    } catch (error) {
      console.error('[OCR] Process file error:', error);
      return null;
    }
  });

  // Detect PII regions in image
  ipcMain.handle('ocr:detectPII', async (
    _,
    imageData: string | ArrayBuffer,
    width: number,
    height: number
  ): Promise<{ region: TextRegion; piiTypes: string[] }[]> => {
    try {
      let buffer: Buffer;
      if (typeof imageData === 'string') {
        buffer = Buffer.from(imageData, 'base64');
      } else {
        buffer = Buffer.from(imageData);
      }
      return await detector.detectPIIRegions(buffer, width, height);
    } catch (error) {
      console.error('[OCR] Detect PII error:', error);
      return [];
    }
  });

  // Open file dialog for test image
  ipcMain.handle('ocr:selectTestImage', async (): Promise<string | null> => {
    const result = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters: [
        { name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp', 'bmp', 'gif'] }
      ]
    });
    return result.canceled ? null : result.filePaths[0] || null;
  });

  // Get current OCR config
  ipcMain.handle('ocr:getConfig', (): OCRConfig => {
    return detector.getConfig();
  });

  // Update OCR config
  ipcMain.handle('ocr:setConfig', (_, config: Partial<OCRConfig>): void => {
    detector.setConfig(config);
  });

  // Get engine info
  ipcMain.handle('ocr:getEngine', (): string => {
    return detector.getEngine();
  });

  // Clear cache
  ipcMain.handle('ocr:clearCache', (): void => {
    detector.clearCache();
  });

  // Terminate OCR (cleanup)
  ipcMain.handle('ocr:terminate', async (): Promise<void> => {
    await terminateTextDetector();
  });
}
