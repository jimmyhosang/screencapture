/**
 * Redaction Overlay Component with Motion Interpolation
 *
 * Renders redaction boxes over video based on OCR data with motion tracking.
 * Interpolates box positions between OCR keyframes for smooth movement.
 * Supports multiple styles: blur, solid, pixelate, pattern.
 */

import React, { useState, useEffect, useMemo, memo } from 'react';
import './RedactionOverlay.css';

// =============================================================================
// Types
// =============================================================================

interface BoundingBox {
    x: number;
    y: number;
    width: number;
    height: number;
}

interface WordInfo {
    text: string;
    bbox: BoundingBox;
    confidence: number;
}

interface OcrFrame {
    timestamp: number;
    frameIndex: number;
    text: string;
    words: WordInfo[];
    confidence: number;
}

interface RedactionRule {
    id: string;
    type: 'pii' | 'keyword' | 'app' | 'manual';
    pattern?: string;
    regex?: RegExp;
    style: 'blur' | 'solid' | 'pixelate' | 'pattern';
}

interface InterpolatedWord {
    text: string;
    bbox: BoundingBox;
    confidence: number;
    isInterpolated: boolean;
}

interface RedactionOverlayProps {
    recordingId: string;
    currentTime: number; // in seconds
    videoWidth: number;
    videoHeight: number;
    frameWidth: number; // original frame dimensions from OCR
    frameHeight: number;
    enabled?: boolean;
    style?: 'blur' | 'solid' | 'pixelate' | 'pattern';
    blurRadius?: number;
    padding?: number;
}

// =============================================================================
// Default PII Patterns
// =============================================================================

const PII_PATTERNS: Array<{ name: string; pattern: RegExp }> = [
    // Email addresses
    { name: 'email', pattern: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/i },
    // Phone numbers (various formats)
    { name: 'phone', pattern: /\b(\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/ },
    // SSN
    { name: 'ssn', pattern: /\b\d{3}[-.\s]?\d{2}[-.\s]?\d{4}\b/ },
    // Credit card numbers
    { name: 'credit_card', pattern: /\b(?:\d{4}[-.\s]?){3}\d{4}\b/ },
    // IP addresses
    { name: 'ip', pattern: /\b(?:\d{1,3}\.){3}\d{1,3}\b/ },
    // Dates (various formats)
    { name: 'date', pattern: /\b(?:\d{1,2}[-/]\d{1,2}[-/]\d{2,4}|\d{4}[-/]\d{1,2}[-/]\d{1,2})\b/ },
];

// =============================================================================
// Motion Interpolation Utilities
// =============================================================================

/**
 * Find matching word in another frame by text similarity
 */
function findMatchingWord(word: WordInfo, targetFrame: OcrFrame): WordInfo | null {
    // Exact text match
    for (const targetWord of targetFrame.words) {
        if (targetWord.text === word.text) {
            return targetWord;
        }
    }
    // Partial match (for OCR variations)
    for (const targetWord of targetFrame.words) {
        if (targetWord.text.includes(word.text) || word.text.includes(targetWord.text)) {
            return targetWord;
        }
    }
    return null;
}

/**
 * Interpolate between two bounding boxes based on time fraction
 */
function interpolateBbox(
    from: BoundingBox,
    to: BoundingBox,
    fraction: number
): BoundingBox {
    return {
        x: from.x + (to.x - from.x) * fraction,
        y: from.y + (to.y - from.y) * fraction,
        width: from.width + (to.width - from.width) * fraction,
        height: from.height + (to.height - from.height) * fraction,
    };
}

/**
 * Calculate interpolated words with motion tracking
 */
function getInterpolatedWords(
    currentTime: number,
    frames: OcrFrame[],
    rules: RedactionRule[]
): InterpolatedWord[] {
    if (frames.length === 0) return [];

    // Sort frames by timestamp
    const sortedFrames = [...frames].sort((a, b) => a.timestamp - b.timestamp);

    // Find the bracketing frames (prevFrame <= currentTime < nextFrame)
    let prevFrame: OcrFrame | null = null;
    let nextFrame: OcrFrame | null = null;

    for (let i = 0; i < sortedFrames.length; i++) {
        const frame = sortedFrames[i];
        if (frame.timestamp <= currentTime) {
            prevFrame = frame;
        }
        if (frame.timestamp > currentTime && !nextFrame) {
            nextFrame = frame;
            break;
        }
    }

    // If we're past the last frame, use the last frame
    if (!prevFrame && sortedFrames.length > 0) {
        prevFrame = sortedFrames[0];
    }

    if (!prevFrame) return [];

    // Get PII words from the previous (base) frame
    const piiWords: InterpolatedWord[] = [];

    for (const word of prevFrame.words) {
        // Check if word matches any PII pattern
        let isPii = false;
        for (const rule of rules) {
            if (rule.regex && rule.regex.test(word.text)) {
                isPii = true;
                break;
            }
        }

        if (!isPii) continue;

        // If we have a next frame, try to interpolate
        if (nextFrame && nextFrame.timestamp > prevFrame.timestamp) {
            const matchingWord = findMatchingWord(word, nextFrame);

            if (matchingWord) {
                // Calculate interpolation fraction
                const totalDelta = nextFrame.timestamp - prevFrame.timestamp;
                const currentDelta = currentTime - prevFrame.timestamp;
                const fraction = Math.min(1, Math.max(0, currentDelta / totalDelta));

                // Interpolate the bounding box
                const interpolatedBbox = interpolateBbox(word.bbox, matchingWord.bbox, fraction);

                piiWords.push({
                    text: word.text,
                    bbox: interpolatedBbox,
                    confidence: word.confidence,
                    isInterpolated: true,
                });
            } else {
                // No match in next frame - use current position with larger padding (will disappear soon)
                piiWords.push({
                    text: word.text,
                    bbox: word.bbox,
                    confidence: word.confidence,
                    isInterpolated: false,
                });
            }
        } else {
            // No next frame - just use current position
            piiWords.push({
                text: word.text,
                bbox: word.bbox,
                confidence: word.confidence,
                isInterpolated: false,
            });
        }
    }

    // Also check for words in next frame that weren't in prev frame (newly appearing)
    if (nextFrame) {
        for (const word of nextFrame.words) {
            // Check if word matches any PII pattern
            let isPii = false;
            for (const rule of rules) {
                if (rule.regex && rule.regex.test(word.text)) {
                    isPii = true;
                    break;
                }
            }

            if (!isPii) continue;

            // Check if we already have this word from prev frame
            const alreadyTracked = piiWords.some(pw => pw.text === word.text);
            if (alreadyTracked) continue;

            // This word is appearing - fade in from its position
            const totalDelta = nextFrame.timestamp - (prevFrame?.timestamp || 0);
            const currentDelta = currentTime - (prevFrame?.timestamp || 0);
            const fraction = Math.min(1, Math.max(0, currentDelta / totalDelta));

            // Only show if we're close to the next frame (>50% through)
            if (fraction > 0.5) {
                piiWords.push({
                    text: word.text,
                    bbox: word.bbox,
                    confidence: word.confidence,
                    isInterpolated: true,
                });
            }
        }
    }

    return piiWords;
}

// =============================================================================
// Redaction Box Component
// =============================================================================

interface RedactionBoxProps {
    x: number;
    y: number;
    width: number;
    height: number;
    style: 'blur' | 'solid' | 'pixelate' | 'pattern';
    blurRadius?: number;
    padding?: number;
    isInterpolated?: boolean;
}

const RedactionBox = memo(function RedactionBox({
    x,
    y,
    width,
    height,
    style,
    blurRadius = 10,
    padding = 2,
}: RedactionBoxProps): React.JSX.Element {
    const boxStyle: React.CSSProperties = {
        position: 'absolute',
        left: `${x - padding}px`,
        top: `${y - padding}px`,
        width: `${width + padding * 2}px`,
        height: `${height + padding * 2}px`,
        pointerEvents: 'none',
        transition: 'left 0.05s linear, top 0.05s linear, width 0.05s linear, height 0.05s linear',
    };

    if (style === 'blur') {
        boxStyle.backdropFilter = `blur(${blurRadius}px)`;
        boxStyle.WebkitBackdropFilter = `blur(${blurRadius}px)`;
        boxStyle.background = 'rgba(0, 0, 0, 0.1)';
        boxStyle.borderRadius = '2px';
    } else if (style === 'solid') {
        boxStyle.background = '#000';
        boxStyle.borderRadius = '2px';
    } else if (style === 'pixelate') {
        boxStyle.background = 'linear-gradient(45deg, #333 25%, #666 25%, #666 50%, #333 50%, #333 75%, #666 75%)';
        boxStyle.backgroundSize = '4px 4px';
        boxStyle.borderRadius = '2px';
    } else if (style === 'pattern') {
        boxStyle.background = 'repeating-linear-gradient(45deg, #000, #000 2px, #333 2px, #333 4px)';
        boxStyle.borderRadius = '2px';
    }

    return <div className={`redaction-box style-${style}`} style={boxStyle} />;
});

// =============================================================================
// Main Component
// =============================================================================

function RedactionOverlay({
    recordingId,
    currentTime,
    videoWidth,
    videoHeight,
    frameWidth,
    frameHeight,
    enabled = true,
    style = 'blur',
    blurRadius = 10,
    padding = 2,
}: RedactionOverlayProps): React.JSX.Element | null {
    const [ocrFrames, setOcrFrames] = useState<OcrFrame[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    // Build redaction rules from PII patterns
    const redactionRules = useMemo<RedactionRule[]>(() => {
        return PII_PATTERNS.map((p, index) => ({
            id: `pii-${index}`,
            type: 'pii' as const,
            regex: p.pattern,
            style: style,
        }));
    }, [style]);

    // Load OCR data on mount
    useEffect(() => {
        const loadOcrData = async () => {
            if (!window.api?.ocrProcessor?.getReportByRecording) {
                console.warn('[RedactionOverlay] OCR API not available');
                setIsLoading(false);
                return;
            }

            try {
                console.log('[RedactionOverlay] Loading OCR data for recording:', recordingId);
                const report = await window.api.ocrProcessor.getReportByRecording(recordingId);
                console.log('[RedactionOverlay] OCR report:', report ? `${report.timeline?.length || 0} frames` : 'null');
                if (report?.timeline) {
                    setOcrFrames(report.timeline);
                }
            } catch (error) {
                console.error('[RedactionOverlay] Failed to load OCR data:', error);
            } finally {
                setIsLoading(false);
            }
        };

        loadOcrData();
    }, [recordingId]);

    // Calculate interpolated words with motion tracking
    const interpolatedWords = useMemo(() => {
        if (!enabled || ocrFrames.length === 0) {
            return [];
        }
        return getInterpolatedWords(currentTime, ocrFrames, redactionRules);
    }, [currentTime, ocrFrames, redactionRules, enabled]);

    // Calculate scale factors for coordinate mapping
    const scaleX = videoWidth / (frameWidth || videoWidth);
    const scaleY = videoHeight / (frameHeight || videoHeight);

    if (!enabled || isLoading || interpolatedWords.length === 0) {
        return null;
    }

    return (
        <div
            className="redaction-overlay-container"
            style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: videoWidth,
                height: videoHeight,
                pointerEvents: 'none',
                overflow: 'hidden',
            }}
        >
            {interpolatedWords.map((word, index) => (
                <RedactionBox
                    key={`redact-${word.text}-${index}`}
                    x={word.bbox.x * scaleX}
                    y={word.bbox.y * scaleY}
                    width={word.bbox.width * scaleX}
                    height={word.bbox.height * scaleY}
                    style={style}
                    blurRadius={blurRadius}
                    padding={padding}
                    isInterpolated={word.isInterpolated}
                />
            ))}
        </div>
    );
}

export default RedactionOverlay;
