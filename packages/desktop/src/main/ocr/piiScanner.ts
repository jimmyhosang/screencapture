/**
 * PII Scanner Service
 *
 * Scans OCR text regions for PII (Personally Identifiable Information)
 * and provides detailed match information with visual overlay support.
 */

import { analyzeForPII, addCustomPattern, removeCustomPattern, clearCustomPatterns } from '@screencapture/core';
import type { PIIMatch, ExtendedRedactionConfig, ConfidenceLevel } from '@screencapture/core';
import type { TextRegion, TextBounds } from './types';

// ============================================================================
// Types
// ============================================================================

/**
 * Color codes for different PII types (for visual overlays)
 */
export const PII_COLORS: Record<string, string> = {
  ssn: '#ef4444',        // Red - highest sensitivity
  creditCard: '#dc2626', // Dark red
  bankAccount: '#b91c1c',// Darker red
  iban: '#991b1b',       // Very dark red

  email: '#3b82f6',      // Blue
  phone: '#2563eb',      // Darker blue

  ipv4: '#8b5cf6',       // Purple
  ipv6: '#7c3aed',       // Darker purple
  apiKey: '#6d28d9',     // Very dark purple

  passport: '#f59e0b',   // Amber
  driverLicense: '#d97706', // Dark amber
  dateOfBirth: '#b45309', // Darker amber

  name: '#10b981',       // Green
  currency: '#059669',   // Darker green

  custom: '#6b7280',     // Gray for custom patterns
  unknown: '#9ca3af',    // Light gray
};

/**
 * Represents a detected PII region in the frame
 */
export interface PIIRegion {
  /** Type of PII detected */
  type: string;
  /** Bounding box of the text region containing PII */
  bounds: TextBounds;
  /** Confidence level of detection */
  confidence: ConfidenceLevel;
  /** Original text (full region text) */
  originalText: string;
  /** The specific matched text */
  matchedText: string;
  /** Redacted version of the text */
  redactedText: string;
  /** Color for visual overlay */
  color: string;
  /** Character position of match within the region text */
  matchStart: number;
  /** End position of match within the region text */
  matchEnd: number;
}

/**
 * Result of scanning a frame for PII
 */
export interface PIIScanResult {
  /** All PII regions found */
  regions: PIIRegion[];
  /** Count by PII type */
  summary: Record<string, number>;
  /** Total processing time in ms */
  processingTimeMs: number;
  /** Total text regions scanned */
  regionsScanned: number;
  /** Frame hash for change detection */
  frameHash?: string;
}

/**
 * Configuration for the PII scanner
 */
export interface PIIScannerConfig extends Partial<ExtendedRedactionConfig> {
  /** Enable change detection to skip unchanged frames */
  enableChangeDetection?: boolean;
  /** Custom patterns to add */
  customPatterns?: Array<{
    name: string;
    regex: string;
    replacer: string;
    confidence?: ConfidenceLevel;
  }>;
}

// ============================================================================
// Default Configuration
// ============================================================================

export const DEFAULT_PII_SCANNER_CONFIG: PIIScannerConfig = {
  email: true,
  phone: true,
  ssn: true,
  creditCard: true,
  ipv4: true,
  ipv6: true,
  dateOfBirth: true,
  passport: true,
  driverLicense: true,
  iban: true,
  bankAccount: true,
  apiKey: true,
  name: true,
  currency: true,
  minConfidence: 'low',
  enableChangeDetection: true,
};

// ============================================================================
// PII Scanner Class
// ============================================================================

export class PIIScanner {
  private config: PIIScannerConfig;
  private lastFrameHash: string | null = null;
  private lastResult: PIIScanResult | null = null;
  private registeredPatterns: Set<string> = new Set();

  constructor(config: Partial<PIIScannerConfig> = {}) {
    this.config = { ...DEFAULT_PII_SCANNER_CONFIG, ...config };
    this.registerCustomPatterns();
  }

  /**
   * Register custom patterns from config
   */
  private registerCustomPatterns(): void {
    if (this.config.customPatterns) {
      for (const pattern of this.config.customPatterns) {
        try {
          const regex = new RegExp(pattern.regex, 'g');
          const replacer = (match: string) => pattern.replacer.replace(/\$&/g, match);
          addCustomPattern(pattern.name, regex, replacer, pattern.confidence || 'medium');
          this.registeredPatterns.add(pattern.name);
        } catch (error) {
          console.error(`[PIIScanner] Invalid custom pattern "${pattern.name}":`, error);
        }
      }
    }
  }

  /**
   * Scan text regions for PII
   */
  scanFrame(textRegions: TextRegion[], frameHash?: string): PIIScanResult {
    const startTime = performance.now();

    // Check for unchanged frame
    if (this.config.enableChangeDetection && frameHash && frameHash === this.lastFrameHash && this.lastResult) {
      return {
        ...this.lastResult,
        processingTimeMs: performance.now() - startTime,
      };
    }

    const piiRegions: PIIRegion[] = [];
    const summary: Record<string, number> = {};

    for (const region of textRegions) {
      if (!region.text || region.text.trim().length === 0) continue;

      // Analyze text for PII
      const analysis = analyzeForPII(region.text, {
        email: this.config.email ?? true,
        phone: this.config.phone ?? true,
        ssn: this.config.ssn ?? true,
        creditCard: this.config.creditCard ?? true,
        ipv4: this.config.ipv4,
        ipv6: this.config.ipv6,
        dateOfBirth: this.config.dateOfBirth,
        passport: this.config.passport,
        driverLicense: this.config.driverLicense,
        iban: this.config.iban,
        bankAccount: this.config.bankAccount,
        apiKey: this.config.apiKey,
        name: this.config.name,
        currency: this.config.currency,
        minConfidence: this.config.minConfidence || 'low',
        customPatterns: Array.from(this.registeredPatterns),
      });

      // Convert matches to PIIRegions
      for (const match of analysis.matches) {
        const piiType = match.type.startsWith('custom:') ? match.type.slice(7) : match.type;

        piiRegions.push({
          type: match.type,
          bounds: region.bounds,
          confidence: match.confidence,
          originalText: region.text,
          matchedText: match.original,
          redactedText: match.redacted,
          color: this.getColorForType(match.type),
          matchStart: match.start,
          matchEnd: match.end,
        });

        // Update summary
        summary[piiType] = (summary[piiType] || 0) + 1;
      }
    }

    const result: PIIScanResult = {
      regions: piiRegions,
      summary,
      processingTimeMs: performance.now() - startTime,
      regionsScanned: textRegions.length,
      frameHash,
    };

    // Cache for change detection
    if (frameHash) {
      this.lastFrameHash = frameHash;
      this.lastResult = result;
    }

    return result;
  }

  /**
   * Scan a single text region
   */
  scanRegion(region: TextRegion): PIIRegion[] {
    const result = this.scanFrame([region]);
    return result.regions;
  }

  /**
   * Get color for PII type
   */
  getColorForType(type: string): string {
    if (type.startsWith('custom:')) {
      return PII_COLORS.custom;
    }
    return PII_COLORS[type] || PII_COLORS.unknown;
  }

  /**
   * Add a custom pattern at runtime
   */
  addPattern(name: string, regex: string, replacer: string, confidence: ConfidenceLevel = 'medium'): boolean {
    try {
      const regexObj = new RegExp(regex, 'g');
      const replacerFn = (match: string) => replacer.replace(/\$&/g, match);
      addCustomPattern(name, regexObj, replacerFn, confidence);
      this.registeredPatterns.add(name);
      return true;
    } catch (error) {
      console.error(`[PIIScanner] Failed to add pattern "${name}":`, error);
      return false;
    }
  }

  /**
   * Remove a custom pattern
   */
  removePattern(name: string): boolean {
    if (this.registeredPatterns.has(name)) {
      removeCustomPattern(name);
      this.registeredPatterns.delete(name);
      return true;
    }
    return false;
  }

  /**
   * Clear cached results
   */
  clearCache(): void {
    this.lastFrameHash = null;
    this.lastResult = null;
  }

  /**
   * Update configuration
   */
  setConfig(config: Partial<PIIScannerConfig>): void {
    this.config = { ...this.config, ...config };

    // Re-register custom patterns if they changed
    if (config.customPatterns) {
      // Clear old patterns
      for (const name of this.registeredPatterns) {
        removeCustomPattern(name);
      }
      this.registeredPatterns.clear();
      this.registerCustomPatterns();
    }
  }

  /**
   * Get current configuration
   */
  getConfig(): PIIScannerConfig {
    return { ...this.config };
  }

  /**
   * Clean up resources
   */
  terminate(): void {
    // Clear custom patterns
    for (const name of this.registeredPatterns) {
      removeCustomPattern(name);
    }
    this.registeredPatterns.clear();
    this.clearCache();
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let scannerInstance: PIIScanner | null = null;

export function getPIIScanner(config?: Partial<PIIScannerConfig>): PIIScanner {
  if (!scannerInstance) {
    scannerInstance = new PIIScanner(config);
  }
  return scannerInstance;
}

export function terminatePIIScanner(): void {
  if (scannerInstance) {
    scannerInstance.terminate();
    scannerInstance = null;
  }
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Calculate precise bounds for a PII match within a text region
 * This estimates the pixel bounds of the specific matched text
 */
export function calculateMatchBounds(
  regionBounds: TextBounds,
  regionText: string,
  matchStart: number,
  matchEnd: number
): TextBounds {
  // Estimate character width based on region width and text length
  const charWidth = regionBounds.width / Math.max(regionText.length, 1);

  return {
    x: regionBounds.x + Math.round(matchStart * charWidth),
    y: regionBounds.y,
    width: Math.round((matchEnd - matchStart) * charWidth),
    height: regionBounds.height,
  };
}

/**
 * Check if two frames have the same text content (for change detection)
 */
export function computeTextHash(regions: TextRegion[]): string {
  const texts = regions
    .map(r => `${r.text}|${r.bounds.x},${r.bounds.y}`)
    .sort()
    .join('\n');

  // Simple hash
  let hash = 0;
  for (let i = 0; i < texts.length; i++) {
    const char = texts.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return hash.toString(16);
}
