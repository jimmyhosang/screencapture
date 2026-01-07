/**
 * Recorder Configuration Types
 *
 * Configuration types and presets for rrweb recording.
 */

import type { RedactionConfig } from '../privacy/redactor.js';

/**
 * Input masking options for specific input types.
 */
export interface MaskInputOptions {
  password: boolean;
  email: boolean;
  tel: boolean;
  text: boolean;
  number: boolean;
  color: boolean;
  date: boolean;
  range: boolean;
  search: boolean;
  url: boolean;
  textarea: boolean;
  select: boolean;
}

/**
 * Configuration for the session recorder with privacy options.
 */
export interface RecorderConfig {
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
  /** Mask specific input types */
  maskInputOptions: MaskInputOptions;
}

/**
 * Default recorder configuration with moderate privacy settings.
 */
export const DEFAULT_RECORDER_CONFIG: RecorderConfig = {
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
  maskInputOptions: {
    password: true,
    email: true,
    tel: true,
    text: false,
    number: false,
    color: false,
    date: false,
    range: false,
    search: false,
    url: false,
    textarea: false,
    select: false,
  },
};

/**
 * Maximum privacy configuration - all protections enabled.
 */
export const SECURE_RECORDER_CONFIG: RecorderConfig = {
  maskAllInputs: true,
  maskTextContent: true,
  blockSelectors: ['.do-not-record', '[data-private]', '.sensitive', '.pii', '[data-sensitive]'],
  redactionConfig: {
    email: true,
    phone: true,
    ssn: true,
    creditCard: true,
  },
  maskTextSelectors: ['input', 'textarea', '.user-content', '[data-user-input]'],
  inlineStylesheet: true,
  maskInputOptions: {
    password: true,
    email: true,
    tel: true,
    text: true,
    number: true,
    color: false,
    date: true,
    range: false,
    search: true,
    url: true,
    textarea: true,
    select: true,
  },
};

/**
 * Minimal privacy configuration - only passwords masked.
 */
export const MINIMAL_RECORDER_CONFIG: RecorderConfig = {
  maskAllInputs: false,
  maskTextContent: false,
  blockSelectors: [],
  redactionConfig: {
    email: false,
    phone: false,
    ssn: false,
    creditCard: false,
  },
  maskTextSelectors: [],
  inlineStylesheet: true,
  maskInputOptions: {
    password: true,
    email: false,
    tel: false,
    text: false,
    number: false,
    color: false,
    date: false,
    range: false,
    search: false,
    url: false,
    textarea: false,
    select: false,
  },
};

/**
 * Creates a block class regex from selectors.
 */
export function createBlockClassRegex(selectors: string[]): RegExp | undefined {
  const classSelectors = selectors
    .filter((s) => s.startsWith('.'))
    .map((s) => s.slice(1).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));

  if (classSelectors.length === 0) {
    return undefined;
  }

  return new RegExp(classSelectors.join('|'));
}

/**
 * Creates a block selector string for rrweb.
 */
export function createBlockSelector(selectors: string[]): string | undefined {
  if (selectors.length === 0) {
    return undefined;
  }
  return selectors.join(', ');
}

/**
 * Creates a mask text selector for rrweb.
 */
export function createMaskTextSelector(selectors: string[]): string | undefined {
  if (selectors.length === 0) {
    return undefined;
  }
  return selectors.join(', ');
}

/**
 * Merges recorder configs, with later configs taking precedence.
 */
export function mergeRecorderConfigs(
  ...configs: Partial<RecorderConfig>[]
): RecorderConfig {
  return configs.reduce<RecorderConfig>(
    (merged, config) => ({
      ...merged,
      ...config,
      blockSelectors: config.blockSelectors || merged.blockSelectors,
      maskTextSelectors: config.maskTextSelectors || merged.maskTextSelectors,
      redactionConfig: {
        ...merged.redactionConfig,
        ...(config.redactionConfig || {}),
      },
      maskInputOptions: {
        ...merged.maskInputOptions,
        ...(config.maskInputOptions || {}),
      },
    }),
    DEFAULT_RECORDER_CONFIG
  );
}
