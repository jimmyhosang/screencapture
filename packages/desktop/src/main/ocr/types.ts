// OCR Types for Text Detection

export interface TextBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface TextRegion {
  text: string;
  bounds: TextBounds;
  confidence: number;
  // Original word-level data if available
  words?: TextWord[];
}

export interface TextWord {
  text: string;
  bounds: TextBounds;
  confidence: number;
}

export interface OCRResult {
  regions: TextRegion[];
  processingTimeMs: number;
  engine: 'vision' | 'tesseract';
  frameWidth: number;
  frameHeight: number;
}

export interface OCRConfig {
  // Which engine to prefer
  preferredEngine: 'auto' | 'vision' | 'tesseract';
  // Languages to detect (ISO 639-1 codes)
  languages: string[];
  // Minimum confidence threshold (0-1)
  minConfidence: number;
  // Process every Nth frame
  frameSkip: number;
  // Region of interest (null = full frame)
  roi: TextBounds | null;
  // Enable caching of static regions
  enableCaching: boolean;
  // Cache TTL in ms
  cacheTTL: number;
}

export const DEFAULT_OCR_CONFIG: OCRConfig = {
  preferredEngine: 'auto',
  languages: ['eng'],
  minConfidence: 0.5,
  frameSkip: 1,
  roi: null,
  enableCaching: true,
  cacheTTL: 1000
};

// Message types for worker communication
export type OCRWorkerMessage =
  | { type: 'init'; config: Partial<OCRConfig> }
  | { type: 'process'; id: string; imageData: ArrayBuffer; width: number; height: number }
  | { type: 'setConfig'; config: Partial<OCRConfig> }
  | { type: 'clearCache' }
  | { type: 'terminate' };

export type OCRWorkerResponse =
  | { type: 'ready'; engine: string }
  | { type: 'result'; id: string; result: OCRResult }
  | { type: 'error'; id: string; error: string }
  | { type: 'progress'; id: string; progress: number };
