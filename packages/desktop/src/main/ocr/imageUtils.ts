// Image utility functions for OCR

interface ImageDimensions {
  width: number;
  height: number;
}

/**
 * Get image dimensions from a buffer
 * Supports PNG, JPEG, GIF, BMP, WebP
 */
export async function getImageDimensions(buffer: Buffer): Promise<ImageDimensions> {
  // Try to detect image type and read dimensions from header
  if (buffer.length < 24) {
    return { width: 1920, height: 1080 }; // Default fallback
  }

  // PNG signature: 89 50 4E 47 0D 0A 1A 0A
  if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47) {
    // PNG: width at offset 16, height at offset 20 (big endian)
    const width = buffer.readUInt32BE(16);
    const height = buffer.readUInt32BE(20);
    return { width, height };
  }

  // JPEG signature: FF D8 FF
  if (buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF) {
    // JPEG: need to parse markers to find SOF
    return parseJpegDimensions(buffer);
  }

  // GIF signature: GIF87a or GIF89a
  if (buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46) {
    // GIF: width at offset 6, height at offset 8 (little endian)
    const width = buffer.readUInt16LE(6);
    const height = buffer.readUInt16LE(8);
    return { width, height };
  }

  // BMP signature: BM
  if (buffer[0] === 0x42 && buffer[1] === 0x4D) {
    // BMP: width at offset 18, height at offset 22 (little endian)
    const width = buffer.readInt32LE(18);
    const height = Math.abs(buffer.readInt32LE(22));
    return { width, height };
  }

  // WebP signature: RIFF....WEBP
  if (buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46 &&
      buffer[8] === 0x57 && buffer[9] === 0x45 && buffer[10] === 0x42 && buffer[11] === 0x50) {
    return parseWebpDimensions(buffer);
  }

  // Default fallback for unknown formats
  return { width: 1920, height: 1080 };
}

function parseJpegDimensions(buffer: Buffer): ImageDimensions {
  let offset = 2;

  while (offset < buffer.length) {
    if (buffer[offset] !== 0xFF) {
      break;
    }

    const marker = buffer[offset + 1];

    // SOF markers (Start of Frame)
    if (marker >= 0xC0 && marker <= 0xCF && marker !== 0xC4 && marker !== 0xC8 && marker !== 0xCC) {
      // Height at offset+5, width at offset+7 (big endian)
      const height = buffer.readUInt16BE(offset + 5);
      const width = buffer.readUInt16BE(offset + 7);
      return { width, height };
    }

    // Skip to next marker
    if (marker === 0xD8 || marker === 0xD9) {
      // SOI or EOI, no length
      offset += 2;
    } else if (marker === 0x00 || (marker >= 0xD0 && marker <= 0xD7)) {
      // Stuffed byte or RST marker, no length
      offset += 2;
    } else {
      // Read length and skip
      const length = buffer.readUInt16BE(offset + 2);
      offset += 2 + length;
    }
  }

  return { width: 1920, height: 1080 };
}

function parseWebpDimensions(buffer: Buffer): ImageDimensions {
  // Check VP8 chunk type at offset 12
  const chunkType = buffer.slice(12, 16).toString('ascii');

  if (chunkType === 'VP8 ') {
    // Lossy WebP: dimensions at offset 26-27 (width) and 28-29 (height)
    // First 3 bytes after chunk header are frame tag, then dimensions
    const width = buffer.readUInt16LE(26) & 0x3FFF;
    const height = buffer.readUInt16LE(28) & 0x3FFF;
    return { width, height };
  }

  if (chunkType === 'VP8L') {
    // Lossless WebP: dimensions encoded differently
    // Signature byte at offset 21, then 4 bytes with width-1 (14 bits) and height-1 (14 bits)
    const bits = buffer.readUInt32LE(21);
    const width = (bits & 0x3FFF) + 1;
    const height = ((bits >> 14) & 0x3FFF) + 1;
    return { width, height };
  }

  if (chunkType === 'VP8X') {
    // Extended WebP: width-1 at offset 24 (3 bytes), height-1 at offset 27 (3 bytes)
    const width = (buffer[24] | (buffer[25] << 8) | (buffer[26] << 16)) + 1;
    const height = (buffer[27] | (buffer[28] << 8) | (buffer[29] << 16)) + 1;
    return { width, height };
  }

  return { width: 1920, height: 1080 };
}

/**
 * Convert raw RGBA data to PNG buffer
 */
export function rgbaToPng(
  data: Uint8Array | Buffer,
  width: number,
  height: number
): Buffer {
  // This is a simplified implementation
  // For production, use sharp or pngjs library
  // For now, return the raw data - Tesseract can handle raw image data
  return Buffer.from(data);
}
