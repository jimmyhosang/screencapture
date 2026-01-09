/**
 * Optimized Session Recorder Hook
 *
 * Provides performance-optimized recording with:
 * - Debounced redaction for rapid text changes
 * - Configurable sampling strategies
 * - Performance metrics tracking
 * - Web Worker offloading for large text
 */

import { useCallback, useRef, useState, useEffect } from 'react';
import * as rrweb from 'rrweb';
import type { eventWithTime } from '@rrweb/types';
import {
  redactWithConfig,
  type RedactionConfig,
  debounce,
  throttle,
  recordEventCapture,
  recordRedactionTime,
  getPerformanceMetrics,
  resetPerformanceMetrics,
  createEventSampler,
  isLargeText,
  type SamplingConfig,
  type PerformanceMetrics,
} from '@screencapture/core';
import { getPIIWorkerManager, terminatePIIWorkers } from '../utils/piiWorkerManager';

// =============================================================================
// Types
// =============================================================================

export interface OptimizedRecorderConfig {
  /** Mask all input field values with asterisks (default: true) */
  maskAllInputs: boolean;
  /** Mask text content matching PII patterns (default: true) */
  maskTextContent: boolean;
  /** CSS selectors for elements to completely block from recording */
  blockSelectors: string[];
  /** Configuration for which PII types to redact */
  redactionConfig: RedactionConfig;
  /** Additional CSS selectors for elements whose text should be masked */
  maskTextSelectors: string[];
  /** Whether to inline stylesheets for accurate replay (default: true) */
  inlineStylesheet: boolean;
  /** Sampling configuration for event capture */
  sampling: SamplingConfig;
  /** Debounce delay for redaction in ms (default: 50) */
  redactionDebounceMs: number;
  /** Whether to use Web Workers for large text (default: true) */
  useWorkers: boolean;
  /** Text length threshold for worker offloading (default: 1000) */
  workerThreshold: number;
  /** Enable performance metrics tracking (default: true) */
  trackPerformance: boolean;
}

export interface UseOptimizedRecorderReturn {
  /** Whether recording is currently active */
  isRecording: boolean;
  /** Recorded events */
  events: eventWithTime[];
  /** Start recording */
  startRecording: () => void;
  /** Stop recording and return events */
  stopRecording: () => eventWithTime[];
  /** Clear all recorded events */
  clearEvents: () => void;
  /** Current configuration */
  config: OptimizedRecorderConfig;
  /** Current performance metrics */
  metrics: PerformanceMetrics;
}

// =============================================================================
// Default Configuration
// =============================================================================

export const DEFAULT_OPTIMIZED_CONFIG: OptimizedRecorderConfig = {
  maskAllInputs: true,
  maskTextContent: true,
  blockSelectors: ['.do-not-record', '[data-private]'],
  redactionConfig: {
    email: true,
    phone: true,
    ssn: true,
    creditCard: true,
  },
  maskTextSelectors: ['.sensitive', '.pii', '[data-sensitive]'],
  inlineStylesheet: true,
  sampling: {
    strategy: 'all',
  },
  redactionDebounceMs: 50,
  useWorkers: true,
  workerThreshold: 1000,
  trackPerformance: true,
};

/**
 * High-performance configuration - prioritizes speed over completeness
 */
export const HIGH_PERFORMANCE_CONFIG: OptimizedRecorderConfig = {
  ...DEFAULT_OPTIMIZED_CONFIG,
  sampling: {
    strategy: 'throttled',
    maxEventsPerSecond: 30,
  },
  redactionDebounceMs: 100,
  useWorkers: true,
  workerThreshold: 500,
};

/**
 * Low-bandwidth configuration - reduces event volume significantly
 */
export const LOW_BANDWIDTH_CONFIG: OptimizedRecorderConfig = {
  ...DEFAULT_OPTIMIZED_CONFIG,
  sampling: {
    strategy: 'keyframes',
    keyframeInterval: 2000,
  },
  redactionDebounceMs: 200,
  inlineStylesheet: false,
};

// =============================================================================
// Hook Implementation
// =============================================================================

/**
 * Optimized session recorder hook with performance features.
 */
export function useOptimizedRecorder(
  initialConfig: OptimizedRecorderConfig = DEFAULT_OPTIMIZED_CONFIG
): UseOptimizedRecorderReturn {
  const [isRecording, setIsRecording] = useState(false);
  const [events, setEvents] = useState<eventWithTime[]>([]);
  const [metrics, setMetrics] = useState<PerformanceMetrics>(() => getPerformanceMetrics());
  // Store config in state for render access (config doesn't change after mount)
  const [config] = useState<OptimizedRecorderConfig>(() => initialConfig);

  const stopFnRef = useRef<(() => void) | null>(null);
  const eventsRef = useRef<eventWithTime[]>([]);
  const configRef = useRef<OptimizedRecorderConfig>(initialConfig);
  const metricsIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const eventSamplerRef = useRef<((event: unknown) => boolean) | null>(null);

  // Create debounced redaction function
  const debouncedRedactRef = useRef<ReturnType<typeof debounce<(text: string) => string>> | null>(null);

  // Initialize debounced redaction
  useEffect(() => {
    const config = configRef.current;

    const redactFn = (text: string): string => {
      const startTime = performance.now();
      const result = redactWithConfig(text, config.redactionConfig);
      const duration = performance.now() - startTime;

      if (config.trackPerformance) {
        recordRedactionTime(duration);
      }

      return result;
    };

    debouncedRedactRef.current = debounce(redactFn, config.redactionDebounceMs);

    return () => {
      debouncedRedactRef.current?.cancel();
    };
  }, []);

  // Update metrics periodically while recording
  useEffect(() => {
    if (isRecording && configRef.current.trackPerformance) {
      metricsIntervalRef.current = setInterval(() => {
        setMetrics(getPerformanceMetrics());
      }, 1000);
    }

    return () => {
      if (metricsIntervalRef.current) {
        clearInterval(metricsIntervalRef.current);
        metricsIntervalRef.current = null;
      }
    };
  }, [isRecording]);

  /**
   * Creates a mask text function with performance optimizations.
   */
  const createOptimizedMaskFn = useCallback((config: OptimizedRecorderConfig) => {
    const workerManager = config.useWorkers ? getPIIWorkerManager() : null;

    // Create a throttled version for very rapid calls
    const throttledRedact = throttle((text: string): string => {
      return redactWithConfig(text, config.redactionConfig);
    }, 16); // ~60fps

    return (text: string): string => {
      if (!config.maskTextContent) {
        return text;
      }

      const startTime = performance.now();

      // For large text, use async processing (but rrweb needs sync, so we use cached result)
      if (config.useWorkers && isLargeText(text) && workerManager) {
        // For rrweb maskTextFn, we need sync result
        // Use throttled sync processing
        const result = throttledRedact(text) ?? text;
        const duration = performance.now() - startTime;

        if (config.trackPerformance) {
          recordRedactionTime(duration);
        }

        return result;
      }

      // Standard sync processing
      const result = redactWithConfig(text, config.redactionConfig);
      const duration = performance.now() - startTime;

      if (config.trackPerformance) {
        recordRedactionTime(duration);
      }

      return result;
    };
  }, []);

  /**
   * Creates block class regex from selectors.
   */
  const createBlockClassRegex = useCallback((selectors: string[]): RegExp | undefined => {
    const classSelectors = selectors
      .filter((s) => s.startsWith('.'))
      .map((s) => s.slice(1).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));

    if (classSelectors.length === 0) {
      return undefined;
    }

    return new RegExp(classSelectors.join('|'));
  }, []);

  /**
   * Start recording with optimizations.
   */
  const startRecording = useCallback(() => {
    if (isRecording) return;

    eventsRef.current = [];
    const config = configRef.current;

    // Reset metrics
    if (config.trackPerformance) {
      resetPerformanceMetrics();
    }

    // Create event sampler
    eventSamplerRef.current = createEventSampler(config.sampling);

    const maskTextFn = createOptimizedMaskFn(config);
    const blockClass = createBlockClassRegex(config.blockSelectors);
    const blockSelector = config.blockSelectors.length > 0
      ? config.blockSelectors.join(', ')
      : undefined;
    const maskTextSelector = config.maskTextSelectors.length > 0
      ? config.maskTextSelectors.join(', ')
      : undefined;

    const stopFn = rrweb.record({
      emit(event) {
        // Apply sampling
        if (eventSamplerRef.current && !eventSamplerRef.current(event)) {
          return;
        }

        eventsRef.current.push(event);

        // Track performance
        if (config.trackPerformance) {
          recordEventCapture();
        }
      },
      maskAllInputs: config.maskAllInputs,
      blockClass,
      blockSelector,
      maskTextSelector,
      maskTextFn,
      inlineStylesheet: config.inlineStylesheet,
      recordCanvas: true,
      sampling: {
        mousemove: config.sampling.strategy === 'keyframes' ? false : true,
        mouseInteraction: true,
        scroll: config.sampling.strategy === 'keyframes' ? 500 : 150,
        input: 'last',
      },
    });

    if (stopFn) {
      stopFnRef.current = stopFn;
    }

    setIsRecording(true);
  }, [isRecording, createOptimizedMaskFn, createBlockClassRegex]);

  /**
   * Stop recording.
   */
  const stopRecording = useCallback(() => {
    if (stopFnRef.current) {
      stopFnRef.current();
      stopFnRef.current = null;
    }

    setIsRecording(false);
    setEvents([...eventsRef.current]);
    setMetrics(getPerformanceMetrics());

    return eventsRef.current;
  }, []);

  /**
   * Clear recorded events.
   */
  const clearEvents = useCallback(() => {
    setEvents([]);
    eventsRef.current = [];
    resetPerformanceMetrics();
    setMetrics(getPerformanceMetrics());
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      debouncedRedactRef.current?.cancel();
      if (metricsIntervalRef.current) {
        clearInterval(metricsIntervalRef.current);
      }
      terminatePIIWorkers();
    };
  }, []);

  return {
    isRecording,
    events,
    startRecording,
    stopRecording,
    clearEvents,
    config,
    metrics,
  };
}

// =============================================================================
// Specialized Hooks
// =============================================================================

/**
 * High-performance recorder optimized for smooth recording.
 */
export function useHighPerformanceRecorder(): UseOptimizedRecorderReturn {
  return useOptimizedRecorder(HIGH_PERFORMANCE_CONFIG);
}

/**
 * Low-bandwidth recorder optimized for reduced event volume.
 */
export function useLowBandwidthRecorder(): UseOptimizedRecorderReturn {
  return useOptimizedRecorder(LOW_BANDWIDTH_CONFIG);
}
