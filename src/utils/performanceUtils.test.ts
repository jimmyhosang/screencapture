import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  debounce,
  throttle,
  getCompiledRegex,
  clearRegexCache,
  getRegexCacheSize,
  recordEventCapture,
  recordRedactionTime,
  getPerformanceMetrics,
  resetPerformanceMetrics,
  isLargeText,
  estimateComplexity,
  createEventSampler,
  formatBytes,
} from './performanceUtils';

// =============================================================================
// Debounce Tests
// =============================================================================

describe('debounce', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it('should delay function execution', () => {
    const fn = vi.fn();
    const debounced = debounce(fn, 100);

    debounced();
    expect(fn).not.toHaveBeenCalled();

    vi.advanceTimersByTime(50);
    expect(fn).not.toHaveBeenCalled();

    vi.advanceTimersByTime(50);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('should reset timer on subsequent calls', () => {
    const fn = vi.fn();
    const debounced = debounce(fn, 100);

    debounced();
    vi.advanceTimersByTime(50);

    debounced();
    vi.advanceTimersByTime(50);

    expect(fn).not.toHaveBeenCalled();

    vi.advanceTimersByTime(50);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('should pass arguments to the function', () => {
    const fn = vi.fn();
    const debounced = debounce(fn, 100);

    debounced('arg1', 'arg2');
    vi.advanceTimersByTime(100);

    expect(fn).toHaveBeenCalledWith('arg1', 'arg2');
  });

  it('should cancel pending execution', () => {
    const fn = vi.fn();
    const debounced = debounce(fn, 100);

    debounced();
    debounced.cancel();
    vi.advanceTimersByTime(100);

    expect(fn).not.toHaveBeenCalled();
  });

  it('should flush pending execution immediately', () => {
    const fn = vi.fn();
    const debounced = debounce(fn, 100);

    debounced('test');
    debounced.flush();

    expect(fn).toHaveBeenCalledWith('test');
  });
});

// =============================================================================
// Throttle Tests
// =============================================================================

describe('throttle', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it('should execute immediately on first call', () => {
    const fn = vi.fn();
    const throttled = throttle(fn, 100);

    throttled();
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('should throttle subsequent calls', () => {
    const fn = vi.fn();
    const throttled = throttle(fn, 100);

    throttled();
    throttled();
    throttled();

    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('should allow call after interval passes', () => {
    const fn = vi.fn();
    const throttled = throttle(fn, 100);

    throttled();
    vi.advanceTimersByTime(100);
    throttled();

    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('should execute trailing call', () => {
    const fn = vi.fn();
    const throttled = throttle(fn, 100);

    throttled('first');
    throttled('second');

    vi.advanceTimersByTime(100);

    expect(fn).toHaveBeenCalledTimes(2);
    expect(fn).toHaveBeenLastCalledWith('second');
  });

  it('should cancel pending trailing call', () => {
    const fn = vi.fn();
    const throttled = throttle(fn, 100);

    throttled();
    throttled();
    throttled.cancel();
    vi.advanceTimersByTime(100);

    expect(fn).toHaveBeenCalledTimes(1);
  });
});

// =============================================================================
// Lazy Regex Compilation Tests
// =============================================================================

describe('getCompiledRegex', () => {
  beforeEach(() => {
    clearRegexCache();
  });

  it('should compile and cache regex', () => {
    const regex1 = getCompiledRegex('test', 'g');
    const regex2 = getCompiledRegex('test', 'g');

    expect(regex1.source).toBe('test');
    expect(regex2.source).toBe('test');
    expect(getRegexCacheSize()).toBe(1);
  });

  it('should cache different patterns separately', () => {
    getCompiledRegex('pattern1', 'g');
    getCompiledRegex('pattern2', 'g');

    expect(getRegexCacheSize()).toBe(2);
  });

  it('should cache different flags separately', () => {
    getCompiledRegex('test', 'g');
    getCompiledRegex('test', 'gi');

    expect(getRegexCacheSize()).toBe(2);
  });

  it('should return new instance to avoid lastIndex issues', () => {
    const regex1 = getCompiledRegex('\\d+', 'g');
    const text = '123 456';
    regex1.exec(text);

    const regex2 = getCompiledRegex('\\d+', 'g');
    const match = regex2.exec(text);

    expect(match?.[0]).toBe('123');
  });

  it('should clear cache', () => {
    getCompiledRegex('test', 'g');
    expect(getRegexCacheSize()).toBe(1);

    clearRegexCache();
    expect(getRegexCacheSize()).toBe(0);
  });
});

// =============================================================================
// Performance Metrics Tests
// =============================================================================

describe('Performance Metrics', () => {
  beforeEach(() => {
    resetPerformanceMetrics();
  });

  it('should track event captures', () => {
    recordEventCapture();
    recordEventCapture();
    recordEventCapture();

    const metrics = getPerformanceMetrics();
    expect(metrics.totalEvents).toBe(3);
  });

  it('should track redaction times', () => {
    recordRedactionTime(5);
    recordRedactionTime(10);
    recordRedactionTime(15);

    const metrics = getPerformanceMetrics();
    expect(metrics.avgRedactionTime).toBe(10);
    expect(metrics.peakRedactionTime).toBe(15);
    expect(metrics.totalRedactions).toBe(3);
  });

  it('should reset metrics', () => {
    recordEventCapture();
    recordRedactionTime(10);

    resetPerformanceMetrics();

    const metrics = getPerformanceMetrics();
    expect(metrics.totalEvents).toBe(0);
    expect(metrics.totalRedactions).toBe(0);
  });

  it('should generate warning for high redaction time', () => {
    recordRedactionTime(50);

    const metrics = getPerformanceMetrics();
    expect(metrics.performanceWarning).toBeTruthy();
    expect(metrics.performanceWarning).toContain('latency');
  });
});

// =============================================================================
// Text Size Estimation Tests
// =============================================================================

describe('isLargeText', () => {
  it('should return false for small text', () => {
    expect(isLargeText('Hello world')).toBe(false);
    expect(isLargeText('A'.repeat(500))).toBe(false);
  });

  it('should return true for large text', () => {
    expect(isLargeText('A'.repeat(1001))).toBe(true);
    expect(isLargeText('A'.repeat(5000))).toBe(true);
  });
});

describe('estimateComplexity', () => {
  it('should return higher score for longer text', () => {
    const short = estimateComplexity('Hello');
    const long = estimateComplexity('Hello'.repeat(100));

    expect(long).toBeGreaterThan(short);
  });

  it('should return higher score for text with special characters', () => {
    const plain = estimateComplexity('Hello world');
    const withSpecial = estimateComplexity('user@example.com:8080/path');

    expect(withSpecial).toBeGreaterThan(plain);
  });

  it('should return higher score for text with numbers', () => {
    const plain = estimateComplexity('Hello world');
    const withNumbers = estimateComplexity('Phone: 555-123-4567');

    expect(withNumbers).toBeGreaterThan(plain);
  });
});

// =============================================================================
// Sampling Strategy Tests
// =============================================================================

describe('createEventSampler', () => {
  describe('all strategy', () => {
    it('should accept all events', () => {
      const sampler = createEventSampler({ strategy: 'all' });

      expect(sampler({})).toBe(true);
      expect(sampler({})).toBe(true);
      expect(sampler({})).toBe(true);
    });
  });

  describe('throttled strategy', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    it('should throttle events', () => {
      const sampler = createEventSampler({
        strategy: 'throttled',
        maxEventsPerSecond: 10,
      });

      // First event should pass
      expect(sampler({})).toBe(true);

      // Immediate second event should be rejected
      expect(sampler({})).toBe(false);

      // After interval passes, should accept
      vi.advanceTimersByTime(100);
      expect(sampler({})).toBe(true);
    });
  });

  describe('keyframes strategy', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    it('should always accept FullSnapshot events', () => {
      const sampler = createEventSampler({
        strategy: 'keyframes',
        keyframeInterval: 1000,
      });

      // FullSnapshot (type 2) should always pass
      expect(sampler({ type: 2 })).toBe(true);
      expect(sampler({ type: 2 })).toBe(true);
    });

    it('should always accept Meta events', () => {
      const sampler = createEventSampler({
        strategy: 'keyframes',
        keyframeInterval: 1000,
      });

      // Meta (type 4) should always pass
      expect(sampler({ type: 4 })).toBe(true);
    });

    it('should accept events at keyframe intervals', () => {
      const sampler = createEventSampler({
        strategy: 'keyframes',
        keyframeInterval: 1000,
      });

      // Initial keyframe
      expect(sampler({ type: 2 })).toBe(true);

      // Incremental event before interval
      expect(sampler({ type: 3 })).toBe(false);

      // After interval
      vi.advanceTimersByTime(1000);
      expect(sampler({ type: 3 })).toBe(true);
    });
  });
});

// =============================================================================
// Utility Tests
// =============================================================================

describe('formatBytes', () => {
  it('should format bytes', () => {
    expect(formatBytes(500)).toBe('500 B');
  });

  it('should format kilobytes', () => {
    expect(formatBytes(1024)).toBe('1.0 KB');
    expect(formatBytes(2048)).toBe('2.0 KB');
  });

  it('should format megabytes', () => {
    expect(formatBytes(1024 * 1024)).toBe('1.0 MB');
    expect(formatBytes(5.5 * 1024 * 1024)).toBe('5.5 MB');
  });

  it('should format gigabytes', () => {
    expect(formatBytes(1024 * 1024 * 1024)).toBe('1.00 GB');
  });
});
