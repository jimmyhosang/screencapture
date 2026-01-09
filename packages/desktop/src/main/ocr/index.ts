import { ipcMain, dialog } from 'electron';
import { readFile } from 'fs/promises';
import { existsSync } from 'fs';
import { getTextDetector, terminateTextDetector } from './textDetector';
import { getPIIScanner, terminatePIIScanner, PII_COLORS, computeTextHash, calculateMatchBounds } from './piiScanner';
import type { OCRConfig, OCRResult, TextRegion } from './types';
import type { PIIScanResult, PIIScannerConfig, PIIRegion } from './piiScanner';

export function setupOCRHandlers(): void {
  const detector = getTextDetector();
  const piiScanner = getPIIScanner();

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
    terminatePIIScanner();
  });

  // =========================================================================
  // PII Scanner Handlers
  // =========================================================================

  // Scan text regions for PII with detailed results
  ipcMain.handle('pii:scanRegions', (
    _,
    textRegions: TextRegion[],
    frameHash?: string
  ): PIIScanResult => {
    return piiScanner.scanFrame(textRegions, frameHash);
  });

  // Scan image for PII (OCR + PII detection combined)
  ipcMain.handle('pii:scanImage', async (
    _,
    imageData: string | ArrayBuffer,
    width: number,
    height: number
  ): Promise<{ ocrResult: OCRResult; piiResult: PIIScanResult }> => {
    try {
      let buffer: Buffer;
      if (typeof imageData === 'string') {
        buffer = Buffer.from(imageData, 'base64');
      } else {
        buffer = Buffer.from(imageData);
      }

      // Run OCR
      const ocrResult = await detector.processFrame(buffer, width, height);

      // Compute text hash for change detection
      const frameHash = computeTextHash(ocrResult.regions);

      // Scan for PII
      const piiResult = piiScanner.scanFrame(ocrResult.regions, frameHash);

      return { ocrResult, piiResult };
    } catch (error) {
      console.error('[PII] Scan image error:', error);
      return {
        ocrResult: {
          regions: [],
          processingTimeMs: 0,
          engine: detector.getEngine() as 'vision' | 'tesseract',
          frameWidth: width,
          frameHeight: height
        },
        piiResult: {
          regions: [],
          summary: {},
          processingTimeMs: 0,
          regionsScanned: 0
        }
      };
    }
  });

  // Get PII colors mapping
  ipcMain.handle('pii:getColors', (): Record<string, string> => {
    return { ...PII_COLORS };
  });

  // Calculate precise bounds for a PII match
  ipcMain.handle('pii:calculateMatchBounds', (
    _,
    regionBounds: { x: number; y: number; width: number; height: number },
    regionText: string,
    matchStart: number,
    matchEnd: number
  ): { x: number; y: number; width: number; height: number } => {
    return calculateMatchBounds(regionBounds, regionText, matchStart, matchEnd);
  });

  // Get PII scanner config
  ipcMain.handle('pii:getConfig', (): PIIScannerConfig => {
    return piiScanner.getConfig();
  });

  // Set PII scanner config
  ipcMain.handle('pii:setConfig', (_, config: Partial<PIIScannerConfig>): void => {
    piiScanner.setConfig(config);
  });

  // Add custom pattern
  ipcMain.handle('pii:addPattern', (
    _,
    name: string,
    regex: string,
    replacer: string,
    confidence?: 'high' | 'medium' | 'low'
  ): boolean => {
    return piiScanner.addPattern(name, regex, replacer, confidence || 'medium');
  });

  // Remove custom pattern
  ipcMain.handle('pii:removePattern', (_, name: string): boolean => {
    return piiScanner.removePattern(name);
  });

  // Clear PII scanner cache
  ipcMain.handle('pii:clearCache', (): void => {
    piiScanner.clearCache();
  });
}
