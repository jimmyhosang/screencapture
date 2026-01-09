import { Worker } from 'worker_threads';
import { join } from 'path';
import { app } from 'electron';
import type { OCRConfig, OCRResult, TextRegion, DEFAULT_OCR_CONFIG } from './types';
import { detectPII } from '@screencapture/core';

// Cache for static region detection
interface CacheEntry {
  result: OCRResult;
  timestamp: number;
  imageHash: string;
}

export class TextDetector {
  private worker: Worker | null = null;
  private config: OCRConfig;
  private cache: Map<string, CacheEntry> = new Map();
  private frameCount = 0;
  private pendingRequests: Map<string, {
    resolve: (result: OCRResult) => void;
    reject: (error: Error) => void;
  }> = new Map();
  private isInitialized = false;
  private engine: 'vision' | 'tesseract' = 'tesseract';

  constructor(config: Partial<OCRConfig> = {}) {
    this.config = {
      preferredEngine: 'auto',
      languages: ['eng'],
      minConfidence: 0.5,
      frameSkip: 1,
      roi: null,
      enableCaching: true,
      cacheTTL: 1000,
      ...config
    };
  }

  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    // Determine which engine to use
    this.engine = await this.selectEngine();
    console.log(`[TextDetector] Using OCR engine: ${this.engine}`);

    // Initialize the appropriate worker
    const workerPath = this.engine === 'vision'
      ? join(__dirname, 'visionWorker.js')
      : join(__dirname, 'tesseractWorker.js');

    // For now, we'll use Tesseract.js directly in the main process
    // Worker implementation can be added later for better performance
    this.isInitialized = true;
  }

  private async selectEngine(): Promise<'vision' | 'tesseract'> {
    if (this.config.preferredEngine === 'tesseract') {
      return 'tesseract';
    }

    if (this.config.preferredEngine === 'vision' || this.config.preferredEngine === 'auto') {
      // Check if running on macOS
      if (process.platform === 'darwin') {
        try {
          // Try to load macOS Vision module
          // eslint-disable-next-line @typescript-eslint/no-require-imports
          require('@aspect-build/macos-system-ocr');
          return 'vision';
        } catch {
          console.log('[TextDetector] macOS Vision module not available, falling back to Tesseract');
        }
      }
    }

    return 'tesseract';
  }

  async processFrame(
    imageData: Buffer | Uint8Array,
    width: number,
    height: number
  ): Promise<OCRResult> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    // Frame skipping
    this.frameCount++;
    if (this.config.frameSkip > 1 && this.frameCount % this.config.frameSkip !== 0) {
      return {
        regions: [],
        processingTimeMs: 0,
        engine: this.engine,
        frameWidth: width,
        frameHeight: height
      };
    }

    // Check cache
    if (this.config.enableCaching) {
      const cacheKey = this.computeImageHash(imageData);
      const cached = this.cache.get(cacheKey);
      if (cached && Date.now() - cached.timestamp < this.config.cacheTTL) {
        return { ...cached.result, processingTimeMs: 0 };
      }
    }

    const startTime = performance.now();
    let result: OCRResult;

    try {
      if (this.engine === 'vision') {
        result = await this.processWithVision(imageData, width, height);
      } else {
        result = await this.processWithTesseract(imageData, width, height);
      }

      result.processingTimeMs = performance.now() - startTime;

      // Filter by confidence
      result.regions = result.regions.filter(r => r.confidence >= this.config.minConfidence);

      // Cache result
      if (this.config.enableCaching) {
        const cacheKey = this.computeImageHash(imageData);
        this.cache.set(cacheKey, {
          result,
          timestamp: Date.now(),
          imageHash: cacheKey
        });

        // Clean old cache entries
        this.cleanCache();
      }

      return result;
    } catch (error) {
      console.error('[TextDetector] Processing error:', error);
      return {
        regions: [],
        processingTimeMs: performance.now() - startTime,
        engine: this.engine,
        frameWidth: width,
        frameHeight: height
      };
    }
  }

  private async processWithVision(
    imageData: Buffer | Uint8Array,
    width: number,
    height: number
  ): Promise<OCRResult> {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { recognizeText } = require('@aspect-build/macos-system-ocr');

      const result = await recognizeText(Buffer.from(imageData), {
        languages: this.config.languages
      });

      const regions: TextRegion[] = result.observations.map((obs: {
        text: string;
        confidence: number;
        boundingBox: { x: number; y: number; width: number; height: number };
      }) => ({
        text: obs.text,
        confidence: obs.confidence,
        bounds: {
          x: Math.round(obs.boundingBox.x * width),
          y: Math.round((1 - obs.boundingBox.y - obs.boundingBox.height) * height),
          width: Math.round(obs.boundingBox.width * width),
          height: Math.round(obs.boundingBox.height * height)
        }
      }));

      return {
        regions,
        processingTimeMs: 0,
        engine: 'vision',
        frameWidth: width,
        frameHeight: height
      };
    } catch (error) {
      console.error('[TextDetector] Vision error:', error);
      // Fallback to Tesseract
      return this.processWithTesseract(imageData, width, height);
    }
  }

  private async processWithTesseract(
    imageData: Buffer | Uint8Array,
    width: number,
    height: number
  ): Promise<OCRResult> {
    const Tesseract = await import('tesseract.js');

    // Create worker if not exists
    const worker = await Tesseract.createWorker(this.config.languages.join('+'));

    try {
      const { data } = await worker.recognize(Buffer.from(imageData));

      const regions: TextRegion[] = [];

      // Process lines for better grouping
      if (data.lines) {
        for (const line of data.lines) {
          if (line.text.trim()) {
            regions.push({
              text: line.text.trim(),
              confidence: line.confidence / 100,
              bounds: {
                x: line.bbox.x0,
                y: line.bbox.y0,
                width: line.bbox.x1 - line.bbox.x0,
                height: line.bbox.y1 - line.bbox.y0
              },
              words: line.words?.map(word => ({
                text: word.text,
                confidence: word.confidence / 100,
                bounds: {
                  x: word.bbox.x0,
                  y: word.bbox.y0,
                  width: word.bbox.x1 - word.bbox.x0,
                  height: word.bbox.y1 - word.bbox.y0
                }
              }))
            });
          }
        }
      }

      await worker.terminate();

      return {
        regions,
        processingTimeMs: 0,
        engine: 'tesseract',
        frameWidth: width,
        frameHeight: height
      };
    } catch (error) {
      await worker.terminate();
      throw error;
    }
  }

  // Find regions containing PII
  async detectPIIRegions(
    imageData: Buffer | Uint8Array,
    width: number,
    height: number
  ): Promise<{ region: TextRegion; piiTypes: string[] }[]> {
    const result = await this.processFrame(imageData, width, height);
    const piiRegions: { region: TextRegion; piiTypes: string[] }[] = [];

    for (const region of result.regions) {
      const piiResult = detectPII(region.text);
      if (piiResult.hasPII) {
        piiRegions.push({
          region,
          piiTypes: piiResult.types
        });
      }
    }

    return piiRegions;
  }

  // Simple hash for caching (using first/last bytes and size)
  private computeImageHash(imageData: Buffer | Uint8Array): string {
    const len = imageData.length;
    if (len < 100) {
      return Buffer.from(imageData).toString('base64');
    }
    // Sample bytes from start, middle, and end
    const sample = [
      ...imageData.slice(0, 20),
      ...imageData.slice(Math.floor(len / 2) - 10, Math.floor(len / 2) + 10),
      ...imageData.slice(len - 20)
    ];
    return `${len}-${Buffer.from(sample).toString('base64')}`;
  }

  private cleanCache(): void {
    const now = Date.now();
    for (const [key, entry] of this.cache.entries()) {
      if (now - entry.timestamp > this.config.cacheTTL * 2) {
        this.cache.delete(key);
      }
    }
  }

  setConfig(config: Partial<OCRConfig>): void {
    this.config = { ...this.config, ...config };
  }

  getConfig(): OCRConfig {
    return { ...this.config };
  }

  getEngine(): string {
    return this.engine;
  }

  clearCache(): void {
    this.cache.clear();
  }

  async terminate(): Promise<void> {
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }
    this.cache.clear();
    this.isInitialized = false;
  }
}

// Singleton instance
let detectorInstance: TextDetector | null = null;

export function getTextDetector(config?: Partial<OCRConfig>): TextDetector {
  if (!detectorInstance) {
    detectorInstance = new TextDetector(config);
  }
  return detectorInstance;
}

export function terminateTextDetector(): void {
  if (detectorInstance) {
    detectorInstance.terminate();
    detectorInstance = null;
  }
}
