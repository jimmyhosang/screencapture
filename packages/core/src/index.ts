/**
 * @screencapture/core
 *
 * Core utilities for screencapture - PII detection, redaction, session management,
 * and recording configuration helpers.
 *
 * This package provides platform-agnostic utilities that can be used by:
 * - Web application
 * - Browser extension
 * - Desktop application
 */

// Privacy module - PII detection and redaction
export * from './privacy/index.js';

// Performance module - debounce, throttle, metrics
export * from './performance/index.js';

// Session module - types and storage interfaces
export * from './session/index.js';

// Recorder module - configuration types and presets
export * from './recorder/index.js';
