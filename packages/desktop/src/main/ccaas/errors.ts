/**
 * CCaaS Error Handling
 *
 * Custom error types and utilities for the CCaaS integration
 */

// =============================================================================
// Custom Error Types
// =============================================================================

/**
 * Base error class for CCaaS-related errors
 */
export class CCaaSError extends Error {
  public readonly code: string;
  public readonly timestamp: Date;
  public readonly context?: Record<string, unknown>;

  constructor(message: string, code: string, context?: Record<string, unknown>) {
    super(message);
    this.name = 'CCaaSError';
    this.code = code;
    this.timestamp = new Date();
    this.context = context;
    Error.captureStackTrace?.(this, this.constructor);
  }

  toJSON() {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      timestamp: this.timestamp.toISOString(),
      context: this.context,
      stack: this.stack
    };
  }
}

/**
 * Webhook validation errors
 */
export class WebhookValidationError extends CCaaSError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, 'WEBHOOK_VALIDATION_ERROR', context);
    this.name = 'WebhookValidationError';
  }
}

/**
 * Signature validation errors
 */
export class SignatureValidationError extends CCaaSError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, 'SIGNATURE_VALIDATION_ERROR', context);
    this.name = 'SignatureValidationError';
  }
}

/**
 * Recording errors
 */
export class RecordingError extends CCaaSError {
  public readonly callId?: string;
  public readonly recordingId?: string;

  constructor(
    message: string,
    options?: {
      callId?: string;
      recordingId?: string;
      context?: Record<string, unknown>;
    }
  ) {
    super(message, 'RECORDING_ERROR', options?.context);
    this.name = 'RecordingError';
    this.callId = options?.callId;
    this.recordingId = options?.recordingId;
  }
}

/**
 * Database errors
 */
export class DatabaseError extends CCaaSError {
  public readonly operation: string;

  constructor(message: string, operation: string, context?: Record<string, unknown>) {
    super(message, 'DATABASE_ERROR', context);
    this.name = 'DatabaseError';
    this.operation = operation;
  }
}

/**
 * Configuration errors
 */
export class ConfigurationError extends CCaaSError {
  public readonly field?: string;

  constructor(message: string, field?: string, context?: Record<string, unknown>) {
    super(message, 'CONFIGURATION_ERROR', context);
    this.name = 'ConfigurationError';
    this.field = field;
  }
}

/**
 * Server errors
 */
export class ServerError extends CCaaSError {
  public readonly port?: number;

  constructor(message: string, port?: number, context?: Record<string, unknown>) {
    super(message, 'SERVER_ERROR', context);
    this.name = 'ServerError';
    this.port = port;
  }
}

// =============================================================================
// Error Codes
// =============================================================================

export const ErrorCodes = {
  // Webhook errors
  MISSING_SIGNATURE: 'E001',
  INVALID_SIGNATURE: 'E002',
  EXPIRED_TIMESTAMP: 'E003',
  INVALID_EVENT_TYPE: 'E004',
  MISSING_REQUIRED_FIELD: 'E005',
  INVALID_FIELD_VALUE: 'E006',

  // Recording errors
  RECORDING_START_FAILED: 'E101',
  RECORDING_STOP_FAILED: 'E102',
  RECORDING_NOT_FOUND: 'E103',
  RECORDING_ALREADY_EXISTS: 'E104',

  // Database errors
  DB_INSERT_FAILED: 'E201',
  DB_UPDATE_FAILED: 'E202',
  DB_QUERY_FAILED: 'E203',
  DB_CONNECTION_ERROR: 'E204',

  // Server errors
  PORT_IN_USE: 'E301',
  SERVER_START_FAILED: 'E302',
  SERVER_STOP_FAILED: 'E303',

  // Configuration errors
  INVALID_PORT: 'E401',
  INVALID_SECRET: 'E402',
  INVALID_QUEUE_FILTER: 'E403'
} as const;

// =============================================================================
// Error Handling Utilities
// =============================================================================

/**
 * Safely extract error message from unknown error
 */
export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === 'string') {
    return error;
  }
  if (error && typeof error === 'object' && 'message' in error) {
    return String((error as { message: unknown }).message);
  }
  return 'Unknown error occurred';
}

/**
 * Safely extract error code from unknown error
 */
export function getErrorCode(error: unknown): string | undefined {
  if (error instanceof CCaaSError) {
    return error.code;
  }
  if (error && typeof error === 'object' && 'code' in error) {
    return String((error as { code: unknown }).code);
  }
  return undefined;
}

/**
 * Create a user-friendly error message
 */
export function formatErrorForUser(error: unknown): string {
  const message = getErrorMessage(error);
  const code = getErrorCode(error);

  if (code) {
    return `[${code}] ${message}`;
  }
  return message;
}

/**
 * Log error with context
 */
export function logError(
  error: unknown,
  context?: { operation?: string; callId?: string; recordingId?: string }
): void {
  const timestamp = new Date().toISOString();
  const message = getErrorMessage(error);
  const code = getErrorCode(error);

  const logParts = [
    `[CCaaS Error]`,
    timestamp,
    code ? `[${code}]` : '',
    context?.operation ? `(${context.operation})` : '',
    message
  ].filter(Boolean);

  console.error(logParts.join(' '));

  if (context?.callId) {
    console.error(`  Call ID: ${context.callId}`);
  }
  if (context?.recordingId) {
    console.error(`  Recording ID: ${context.recordingId}`);
  }
  if (error instanceof Error && error.stack) {
    console.error(`  Stack: ${error.stack}`);
  }
}

/**
 * Wrap async function with error handling
 */
export function withErrorHandling<T extends (...args: unknown[]) => Promise<unknown>>(
  fn: T,
  options?: {
    operation?: string;
    rethrow?: boolean;
    defaultValue?: ReturnType<T> extends Promise<infer U> ? U : never;
  }
): T {
  return (async (...args: Parameters<T>): Promise<ReturnType<T>> => {
    try {
      return await fn(...args);
    } catch (error) {
      logError(error, { operation: options?.operation });

      if (options?.rethrow) {
        throw error;
      }

      return options?.defaultValue as ReturnType<T>;
    }
  }) as T;
}

/**
 * Retry function with exponential backoff
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options?: {
    maxAttempts?: number;
    baseDelayMs?: number;
    maxDelayMs?: number;
    onRetry?: (error: unknown, attempt: number) => void;
  }
): Promise<T> {
  const maxAttempts = options?.maxAttempts ?? 3;
  const baseDelay = options?.baseDelayMs ?? 1000;
  const maxDelay = options?.maxDelayMs ?? 10000;

  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      if (attempt < maxAttempts) {
        const delay = Math.min(baseDelay * Math.pow(2, attempt - 1), maxDelay);
        options?.onRetry?.(error, attempt);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  throw lastError;
}

/**
 * Type guard for CCaaSError
 */
export function isCCaaSError(error: unknown): error is CCaaSError {
  return error instanceof CCaaSError;
}

/**
 * Type guard for specific error types
 */
export function isWebhookValidationError(error: unknown): error is WebhookValidationError {
  return error instanceof WebhookValidationError;
}

export function isSignatureValidationError(error: unknown): error is SignatureValidationError {
  return error instanceof SignatureValidationError;
}

export function isRecordingError(error: unknown): error is RecordingError {
  return error instanceof RecordingError;
}

export function isDatabaseError(error: unknown): error is DatabaseError {
  return error instanceof DatabaseError;
}

export function isConfigurationError(error: unknown): error is ConfigurationError {
  return error instanceof ConfigurationError;
}

export function isServerError(error: unknown): error is ServerError {
  return error instanceof ServerError;
}
