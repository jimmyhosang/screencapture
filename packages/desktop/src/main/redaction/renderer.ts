/**
 * RedactionRenderer - Applies visual redactions to image frames
 *
 * Supports multiple redaction styles:
 * - Solid color block
 * - Gaussian blur
 * - Pixelation
 * - Pattern fill (crosshatch)
 */

import type { TextBounds } from '../ocr/types';

// ============================================================================
// Types
// ============================================================================

export type RedactionStyle = 'solid' | 'blur' | 'pixelate' | 'pattern';

export interface RedactionRegion {
  bounds: TextBounds;
  style?: RedactionStyle;
  color?: string;
  // For temporal redactions (video)
  startTime?: number;
  endTime?: number;
}

export interface RedactionConfig {
  /** Default redaction style */
  defaultStyle: RedactionStyle;
  /** Default solid color (hex) */
  solidColor: string;
  /** Blur radius (pixels) */
  blurRadius: number;
  /** Pixelation block size */
  pixelSize: number;
  /** Pattern line width */
  patternLineWidth: number;
  /** Pattern color */
  patternColor: string;
  /** Padding around redacted region (pixels) */
  padding: number;
  /** Enable smooth edges */
  smoothEdges: boolean;
}

export const DEFAULT_REDACTION_CONFIG: RedactionConfig = {
  defaultStyle: 'solid',
  solidColor: '#000000',
  blurRadius: 10,
  pixelSize: 8,
  patternLineWidth: 2,
  patternColor: '#333333',
  padding: 2,
  smoothEdges: true,
};

// ============================================================================
// RedactionRenderer Class
// ============================================================================

export class RedactionRenderer {
  private config: RedactionConfig;
  private offscreenCanvas: OffscreenCanvas | null = null;
  private offscreenCtx: OffscreenCanvasRenderingContext2D | null = null;

  constructor(config: Partial<RedactionConfig> = {}) {
    this.config = { ...DEFAULT_REDACTION_CONFIG, ...config };
  }

  /**
   * Apply redactions to an ImageData object
   */
  applyRedactions(
    imageData: ImageData,
    regions: RedactionRegion[]
  ): ImageData {
    if (regions.length === 0) return imageData;

    // Create offscreen canvas if needed
    if (!this.offscreenCanvas ||
        this.offscreenCanvas.width !== imageData.width ||
        this.offscreenCanvas.height !== imageData.height) {
      this.offscreenCanvas = new OffscreenCanvas(imageData.width, imageData.height);
      this.offscreenCtx = this.offscreenCanvas.getContext('2d');
    }

    const ctx = this.offscreenCtx;
    if (!ctx) return imageData;

    // Draw original image
    ctx.putImageData(imageData, 0, 0);

    // Apply each redaction
    for (const region of regions) {
      this.applyRegionRedaction(ctx, region, imageData);
    }

    // Get result
    return ctx.getImageData(0, 0, imageData.width, imageData.height);
  }

  /**
   * Apply redactions to a canvas element
   */
  applyRedactionsToCanvas(
    canvas: HTMLCanvasElement | OffscreenCanvas,
    regions: RedactionRegion[]
  ): void {
    const ctx = canvas.getContext('2d') as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
    if (!ctx) return;

    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

    for (const region of regions) {
      this.applyRegionRedaction(ctx, region, imageData);
    }
  }

  /**
   * Apply redaction to a single region
   */
  private applyRegionRedaction(
    ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
    region: RedactionRegion,
    sourceData: ImageData
  ): void {
    const style = region.style || this.config.defaultStyle;
    const bounds = this.getPaddedBounds(region.bounds, sourceData.width, sourceData.height);

    switch (style) {
      case 'solid':
        this.applySolidRedaction(ctx, bounds, region.color);
        break;
      case 'blur':
        this.applyBlurRedaction(ctx, bounds, sourceData);
        break;
      case 'pixelate':
        this.applyPixelateRedaction(ctx, bounds, sourceData);
        break;
      case 'pattern':
        this.applyPatternRedaction(ctx, bounds, region.color);
        break;
    }
  }

  /**
   * Get bounds with padding (clamped to image dimensions)
   */
  private getPaddedBounds(bounds: TextBounds, maxWidth: number, maxHeight: number): TextBounds {
    const padding = this.config.padding;
    return {
      x: Math.max(0, bounds.x - padding),
      y: Math.max(0, bounds.y - padding),
      width: Math.min(maxWidth - bounds.x + padding, bounds.width + padding * 2),
      height: Math.min(maxHeight - bounds.y + padding, bounds.height + padding * 2),
    };
  }

  /**
   * Solid color block redaction
   */
  private applySolidRedaction(
    ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
    bounds: TextBounds,
    color?: string
  ): void {
    ctx.fillStyle = color || this.config.solidColor;

    if (this.config.smoothEdges) {
      const radius = Math.min(4, bounds.width / 4, bounds.height / 4);
      this.roundRect(ctx, bounds.x, bounds.y, bounds.width, bounds.height, radius);
      ctx.fill();
    } else {
      ctx.fillRect(bounds.x, bounds.y, bounds.width, bounds.height);
    }
  }

  /**
   * Gaussian blur redaction (approximated with box blur)
   */
  private applyBlurRedaction(
    ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
    bounds: TextBounds,
    sourceData: ImageData
  ): void {
    const { x, y, width, height } = bounds;
    const radius = this.config.blurRadius;

    // Extract region
    const regionData = this.extractRegion(sourceData, x, y, width, height);
    if (!regionData) return;

    // Apply box blur multiple times (approximates Gaussian)
    const blurred = this.boxBlur(regionData, width, height, radius);

    // Create ImageData from blurred result
    const blurredImageData = new ImageData(blurred, width, height);

    // Draw blurred region
    ctx.putImageData(blurredImageData, x, y);
  }

  /**
   * Pixelation redaction
   */
  private applyPixelateRedaction(
    ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
    bounds: TextBounds,
    sourceData: ImageData
  ): void {
    const { x, y, width, height } = bounds;
    const pixelSize = this.config.pixelSize;

    // Extract region
    const regionData = this.extractRegion(sourceData, x, y, width, height);
    if (!regionData) return;

    // Pixelate
    const pixelated = this.pixelate(regionData, width, height, pixelSize);

    // Create ImageData from pixelated result
    const pixelatedImageData = new ImageData(pixelated, width, height);

    // Draw pixelated region
    ctx.putImageData(pixelatedImageData, x, y);
  }

  /**
   * Pattern fill redaction (crosshatch)
   */
  private applyPatternRedaction(
    ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
    bounds: TextBounds,
    color?: string
  ): void {
    const { x, y, width, height } = bounds;
    const lineWidth = this.config.patternLineWidth;
    const patternColor = color || this.config.patternColor;

    // Fill background first
    ctx.fillStyle = this.config.solidColor;
    ctx.fillRect(x, y, width, height);

    // Draw crosshatch pattern
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, width, height);
    ctx.clip();

    ctx.strokeStyle = patternColor;
    ctx.lineWidth = lineWidth;

    const spacing = 6;

    // Diagonal lines (top-left to bottom-right)
    for (let i = -height; i < width + height; i += spacing) {
      ctx.beginPath();
      ctx.moveTo(x + i, y);
      ctx.lineTo(x + i + height, y + height);
      ctx.stroke();
    }

    // Diagonal lines (top-right to bottom-left)
    for (let i = 0; i < width + height; i += spacing) {
      ctx.beginPath();
      ctx.moveTo(x + i, y);
      ctx.lineTo(x + i - height, y + height);
      ctx.stroke();
    }

    ctx.restore();
  }

  /**
   * Extract a region from ImageData as Uint8ClampedArray
   */
  private extractRegion(
    imageData: ImageData,
    x: number,
    y: number,
    width: number,
    height: number
  ): Uint8ClampedArray | null {
    const { data, width: imgWidth } = imageData;

    // Clamp bounds
    const sx = Math.max(0, Math.floor(x));
    const sy = Math.max(0, Math.floor(y));
    const sw = Math.min(width, imgWidth - sx);
    const sh = Math.min(height, imageData.height - sy);

    if (sw <= 0 || sh <= 0) return null;

    const regionData = new Uint8ClampedArray(sw * sh * 4);

    for (let row = 0; row < sh; row++) {
      const srcOffset = ((sy + row) * imgWidth + sx) * 4;
      const dstOffset = row * sw * 4;
      for (let col = 0; col < sw; col++) {
        regionData[dstOffset + col * 4] = data[srcOffset + col * 4];
        regionData[dstOffset + col * 4 + 1] = data[srcOffset + col * 4 + 1];
        regionData[dstOffset + col * 4 + 2] = data[srcOffset + col * 4 + 2];
        regionData[dstOffset + col * 4 + 3] = data[srcOffset + col * 4 + 3];
      }
    }

    return regionData;
  }

  /**
   * Apply box blur to image data
   */
  private boxBlur(
    data: Uint8ClampedArray,
    width: number,
    height: number,
    radius: number
  ): Uint8ClampedArray {
    const result = new Uint8ClampedArray(data.length);
    const passes = 3; // Multiple passes approximate Gaussian blur

    let source = data;
    let target = result;

    for (let pass = 0; pass < passes; pass++) {
      // Horizontal pass
      this.boxBlurH(source, target, width, height, radius);

      // Swap buffers
      [source, target] = [target, source];

      // Vertical pass
      this.boxBlurV(source, target, width, height, radius);

      // Swap buffers for next pass
      [source, target] = [target, source];
    }

    return source;
  }

  /**
   * Horizontal box blur pass
   */
  private boxBlurH(
    source: Uint8ClampedArray,
    target: Uint8ClampedArray,
    width: number,
    height: number,
    radius: number
  ): void {
    const diameter = radius * 2 + 1;

    for (let y = 0; y < height; y++) {
      let r = 0, g = 0, b = 0, a = 0;
      const rowOffset = y * width * 4;

      // Initialize sum with first pixel * radius
      for (let x = -radius; x <= radius; x++) {
        const px = Math.max(0, Math.min(width - 1, x));
        r += source[rowOffset + px * 4];
        g += source[rowOffset + px * 4 + 1];
        b += source[rowOffset + px * 4 + 2];
        a += source[rowOffset + px * 4 + 3];
      }

      for (let x = 0; x < width; x++) {
        target[rowOffset + x * 4] = r / diameter;
        target[rowOffset + x * 4 + 1] = g / diameter;
        target[rowOffset + x * 4 + 2] = b / diameter;
        target[rowOffset + x * 4 + 3] = a / diameter;

        // Move window
        const removeX = Math.max(0, x - radius);
        const addX = Math.min(width - 1, x + radius + 1);

        r += source[rowOffset + addX * 4] - source[rowOffset + removeX * 4];
        g += source[rowOffset + addX * 4 + 1] - source[rowOffset + removeX * 4 + 1];
        b += source[rowOffset + addX * 4 + 2] - source[rowOffset + removeX * 4 + 2];
        a += source[rowOffset + addX * 4 + 3] - source[rowOffset + removeX * 4 + 3];
      }
    }
  }

  /**
   * Vertical box blur pass
   */
  private boxBlurV(
    source: Uint8ClampedArray,
    target: Uint8ClampedArray,
    width: number,
    height: number,
    radius: number
  ): void {
    const diameter = radius * 2 + 1;

    for (let x = 0; x < width; x++) {
      let r = 0, g = 0, b = 0, a = 0;

      // Initialize sum
      for (let y = -radius; y <= radius; y++) {
        const py = Math.max(0, Math.min(height - 1, y));
        const offset = py * width * 4 + x * 4;
        r += source[offset];
        g += source[offset + 1];
        b += source[offset + 2];
        a += source[offset + 3];
      }

      for (let y = 0; y < height; y++) {
        const offset = y * width * 4 + x * 4;
        target[offset] = r / diameter;
        target[offset + 1] = g / diameter;
        target[offset + 2] = b / diameter;
        target[offset + 3] = a / diameter;

        // Move window
        const removeY = Math.max(0, y - radius);
        const addY = Math.min(height - 1, y + radius + 1);

        const removeOffset = removeY * width * 4 + x * 4;
        const addOffset = addY * width * 4 + x * 4;

        r += source[addOffset] - source[removeOffset];
        g += source[addOffset + 1] - source[removeOffset + 1];
        b += source[addOffset + 2] - source[removeOffset + 2];
        a += source[addOffset + 3] - source[removeOffset + 3];
      }
    }
  }

  /**
   * Pixelate image data
   */
  private pixelate(
    data: Uint8ClampedArray,
    width: number,
    height: number,
    pixelSize: number
  ): Uint8ClampedArray {
    const result = new Uint8ClampedArray(data.length);

    for (let blockY = 0; blockY < height; blockY += pixelSize) {
      for (let blockX = 0; blockX < width; blockX += pixelSize) {
        // Calculate average color for this block
        let r = 0, g = 0, b = 0, a = 0;
        let count = 0;

        const blockEndY = Math.min(blockY + pixelSize, height);
        const blockEndX = Math.min(blockX + pixelSize, width);

        for (let y = blockY; y < blockEndY; y++) {
          for (let x = blockX; x < blockEndX; x++) {
            const offset = (y * width + x) * 4;
            r += data[offset];
            g += data[offset + 1];
            b += data[offset + 2];
            a += data[offset + 3];
            count++;
          }
        }

        r = Math.round(r / count);
        g = Math.round(g / count);
        b = Math.round(b / count);
        a = Math.round(a / count);

        // Fill block with average color
        for (let y = blockY; y < blockEndY; y++) {
          for (let x = blockX; x < blockEndX; x++) {
            const offset = (y * width + x) * 4;
            result[offset] = r;
            result[offset + 1] = g;
            result[offset + 2] = b;
            result[offset + 3] = a;
          }
        }
      }
    }

    return result;
  }

  /**
   * Draw rounded rectangle
   */
  private roundRect(
    ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
    x: number,
    y: number,
    width: number,
    height: number,
    radius: number
  ): void {
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + width - radius, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
    ctx.lineTo(x + width, y + height - radius);
    ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
    ctx.lineTo(x + radius, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.closePath();
  }

  /**
   * Update configuration
   */
  setConfig(config: Partial<RedactionConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Get current configuration
   */
  getConfig(): RedactionConfig {
    return { ...this.config };
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let rendererInstance: RedactionRenderer | null = null;

export function getRedactionRenderer(config?: Partial<RedactionConfig>): RedactionRenderer {
  if (!rendererInstance) {
    rendererInstance = new RedactionRenderer(config);
  }
  return rendererInstance;
}

export function terminateRedactionRenderer(): void {
  rendererInstance = null;
}
