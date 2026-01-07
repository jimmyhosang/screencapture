/**
 * Performance Utilities for Session Recording
 *
 * Provides debouncing, throttling, lazy compilation, and performance monitoring
 * to optimize PII redaction and event capture.
 */

// =============================================================================
// Types
// =============================================================================

export interface PerformanceMetrics {
  /** Events captured per second (rolling average) */
  eventsPerSecond: number;
  /** Average redaction processing time in ms */
  avgRedactionTime: number;
  /** Peak redaction processing time in ms */
  peakRedactionTime: number;
  /** Estimated memory usage in bytes */
  memoryUsage: number;
  /** Total events captured */
  totalEvents: number;
  /** Total redactions performed */
  totalRedactions: number;
  /** Warning if performance is degraded */
  performanceWarning: string | null;
}

export interface SamplingConfig {
  /** Sampling strategy for events */
  strategy: 'all' | 'throttled' | 'keyframes';
  /** Max events per second when throttled (default: 60) */
  maxEventsPerSecond?: number;
  /** Keyframe interval in ms when using keyframes strategy (default: 1000) */
  keyframeInterval?: number;
}

// =============================================================================
// Debounce and Throttle
// =============================================================================

/**
 * Creates a debounced version of a function.
 * The function will only be called after the specified delay has passed
 * since the last invocation.
 */
export function debounce<T extends (...args: unknown[]) => unknown>(
  fn: T,
  delay: number
): T & { cancel: () => void; flush: () => void } {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  let lastArgs: Parameters<T> | null = null;

  const debounced = function (this: unknown, ...args: Parameters<T>) {
    lastArgs = args;

    if (timeoutId !== null) {
      clearTimeout(timeoutId);
    }

    timeoutId = setTimeout(() => {
      timeoutId = null;
      if (lastArgs) {
        fn.apply(this, lastArgs);
        lastArgs = null;
      }
    }, delay);
  } as T & { cancel: () => void; flush: () => void };

  debounced.cancel = () => {
    if (timeoutId !== null) {
      clearTimeout(timeoutId);
      timeoutId = null;
    }
    lastArgs = null;
  };

  debounced.flush = function (this: unknown) {
    if (timeoutId !== null) {
      clearTimeout(timeoutId);
      timeoutId = null;
      if (lastArgs) {
        fn.apply(this, lastArgs);
        lastArgs = null;
      }
    }
  };

  return debounced;
}

/**
 * Creates a throttled version of a function.
 * The function will be called at most once per specified interval.
 */
export function throttle<T extends (...args: unknown[]) => unknown>(
  fn: T,
  interval: number
): T & { cancel: () => void } {
  let lastCall = 0;
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  let lastArgs: Parameters<T> | null = null;

  const throttled = function (this: unknown, ...args: Parameters<T>) {
    const now = Date.now();
    const timeSinceLastCall = now - lastCall;

    if (timeSinceLastCall >= interval) {
      lastCall = now;
      fn.apply(this, args);
    } else {
      // Schedule a trailing call
      lastArgs = args;
      if (timeoutId === null) {
        timeoutId = setTimeout(() => {
          lastCall = Date.now();
          timeoutId = null;
          if (lastArgs) {
            fn.apply(this, lastArgs);
            lastArgs = null;
          }
        }, interval - timeSinceLastCall);
      }
    }
  } as T & { cancel: () => void };

  throttled.cancel = () => {
    if (timeoutId !== null) {
      clearTimeout(timeoutId);
      timeoutId = null;
    }
    lastArgs = null;
  };

  return throttled;
}

// =============================================================================
// Lazy Regex Compilation
// =============================================================================

/**
 * Cache for compiled regex patterns to avoid recompilation.
 */
const regexCache = new Map<string, RegExp>();

/**
 * Gets or creates a compiled regex from the cache.
 * This avoids recompiling the same pattern multiple times.
 */
export function getCompiledRegex(pattern: string, flags: string = 'g'): RegExp {
  const cacheKey = `${pattern}:${flags}`;

  if (!regexCache.has(cacheKey)) {
    regexCache.set(cacheKey, new RegExp(pattern, flags));
  }

  // Create a new instance to reset lastIndex for global patterns
  const cached = regexCache.get(cacheKey)!;
  return new RegExp(cached.source, cached.flags);
}

/**
 * Clears the regex cache. Useful for testing or memory management.
 */
export function clearRegexCache(): void {
  regexCache.clear();
}

/**
 * Gets the current size of the regex cache.
 */
export function getRegexCacheSize(): number {
  return regexCache.size;
}

// =============================================================================
// Performance Metrics Tracking
// =============================================================================

interface MetricsState {
  eventTimestamps: number[];
  redactionTimes: number[];
  totalEvents: number;
  totalRedactions: number;
  startTime: number;
  lastWarningTime: number;
}

const METRICS_WINDOW_MS = 5000; // 5 second rolling window
const WARNING_THRESHOLD_MS = 16; // Warn if redaction takes longer than one frame (60fps)
const WARNING_COOLDOWN_MS = 5000; // Don't spam warnings

let metricsState: MetricsState = {
  eventTimestamps: [],
  redactionTimes: [],
  totalEvents: 0,
  totalRedactions: 0,
  startTime: Date.now(),
  lastWarningTime: 0,
};

/**
 * Records an event capture for metrics tracking.
 */
export function recordEventCapture(): void {
  const now = Date.now();
  metricsState.eventTimestamps.push(now);
  metricsState.totalEvents++;

  // Clean up old timestamps
  const cutoff = now - METRICS_WINDOW_MS;
  metricsState.eventTimestamps = metricsState.eventTimestamps.filter((t) => t > cutoff);
}

/**
 * Records a redaction operation's processing time.
 */
export function recordRedactionTime(timeMs: number): void {
  const now = Date.now();
  metricsState.redactionTimes.push(timeMs);
  metricsState.totalRedactions++;

  // Keep only recent samples (last 100)
  if (metricsState.redactionTimes.length > 100) {
    metricsState.redactionTimes = metricsState.redactionTimes.slice(-100);
  }

  // Check for performance warning
  if (timeMs > WARNING_THRESHOLD_MS && now - metricsState.lastWarningTime > WARNING_COOLDOWN_MS) {
    metricsState.lastWarningTime = now;
    console.warn(`[PerformanceMonitor] Redaction took ${timeMs.toFixed(2)}ms (threshold: ${WARNING_THRESHOLD_MS}ms)`);
  }
}

/**
 * Gets current performance metrics.
 */
export function getPerformanceMetrics(): PerformanceMetrics {
  const now = Date.now();
  const cutoff = now - METRICS_WINDOW_MS;

  // Calculate events per second (rolling average over window)
  const recentEvents = metricsState.eventTimestamps.filter((t) => t > cutoff);
  const eventsPerSecond = (recentEvents.length / METRICS_WINDOW_MS) * 1000;

  // Calculate redaction times
  const redactionTimes = metricsState.redactionTimes;
  const avgRedactionTime =
    redactionTimes.length > 0
      ? redactionTimes.reduce((sum, t) => sum + t, 0) / redactionTimes.length
      : 0;
  const peakRedactionTime = redactionTimes.length > 0 ? Math.max(...redactionTimes) : 0;

  // Estimate memory usage (rough estimate based on event count)
  // Average event size is ~2KB, but varies significantly
  const estimatedEventSize = 2048;
  const memoryUsage = metricsState.totalEvents * estimatedEventSize;

  // Determine warning
  let performanceWarning: string | null = null;
  if (peakRedactionTime > WARNING_THRESHOLD_MS * 2) {
    performanceWarning = `High redaction latency detected (${peakRedactionTime.toFixed(1)}ms peak)`;
  } else if (eventsPerSecond > 100) {
    performanceWarning = `High event rate (${eventsPerSecond.toFixed(0)} events/sec)`;
  } else if (memoryUsage > 50 * 1024 * 1024) {
    performanceWarning = `High memory usage (~${(memoryUsage / (1024 * 1024)).toFixed(1)}MB)`;
  }

  return {
    eventsPerSecond,
    avgRedactionTime,
    peakRedactionTime,
    memoryUsage,
    totalEvents: metricsState.totalEvents,
    totalRedactions: metricsState.totalRedactions,
    performanceWarning,
  };
}

/**
 * Resets all performance metrics.
 */
export function resetPerformanceMetrics(): void {
  metricsState = {
    eventTimestamps: [],
    redactionTimes: [],
    totalEvents: 0,
    totalRedactions: 0,
    startTime: Date.now(),
    lastWarningTime: 0,
  };
}

// =============================================================================
// Text Size Estimation
// =============================================================================

/**
 * Estimates if text is "large" and should be processed in a Web Worker.
 * Threshold is based on typical DOM text node sizes.
 */
export function isLargeText(text: string): boolean {
  return text.length > 1000;
}

/**
 * Estimates processing complexity for text.
 * Higher numbers indicate more complex text that may benefit from async processing.
 */
export function estimateComplexity(text: string): number {
  let score = text.length / 100;

  // More special characters = potentially more regex work
  const specialChars = (text.match(/[@.\-:/]/g) || []).length;
  score += specialChars * 0.5;

  // More numbers = more potential PII patterns
  const numbers = (text.match(/\d/g) || []).length;
  score += numbers * 0.3;

  return score;
}

// =============================================================================
// Sampling Utilities
// =============================================================================

/**
 * Creates an event sampler based on the sampling configuration.
 */
export function createEventSampler(config: SamplingConfig): (event: unknown) => boolean {
  switch (config.strategy) {
    case 'all':
      return () => true;

    case 'throttled': {
      const maxPerSecond = config.maxEventsPerSecond ?? 60;
      const minInterval = 1000 / maxPerSecond;
      let lastEventTime = 0;

      return () => {
        const now = Date.now();
        if (now - lastEventTime >= minInterval) {
          lastEventTime = now;
          return true;
        }
        return false;
      };
    }

    case 'keyframes': {
      const interval = config.keyframeInterval ?? 1000;
      let lastKeyframeTime = 0;

      return (event: unknown) => {
        const now = Date.now();

        // Always capture keyframe events
        const eventType = (event as { type?: number })?.type;
        // rrweb event types: 2 = FullSnapshot, 4 = Meta
        if (eventType === 2 || eventType === 4) {
          lastKeyframeTime = now;
          return true;
        }

        // Capture at keyframe intervals
        if (now - lastKeyframeTime >= interval) {
          lastKeyframeTime = now;
          return true;
        }

        return false;
      };
    }

    default:
      return () => true;
  }
}

// =============================================================================
// Memory Utilities
// =============================================================================

/**
 * Formats bytes to human-readable string.
 */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

/**
 * Gets actual memory usage if available (Chrome only).
 */
export function getActualMemoryUsage(): number | null {
  if (
    typeof performance !== 'undefined' &&
    'memory' in performance &&
    (performance as { memory?: { usedJSHeapSize?: number } }).memory?.usedJSHeapSize
  ) {
    return (performance as { memory: { usedJSHeapSize: number } }).memory.usedJSHeapSize;
  }
  return null;
}
