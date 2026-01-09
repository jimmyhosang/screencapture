/**
 * Capture Error Types and Utilities
 *
 * Standardized error handling for the desktop capture system.
 */

// =============================================================================
// Error Types
// =============================================================================

export enum CaptureErrorCode {
  // Permission errors
  PERMISSION_DENIED = 'PERMISSION_DENIED',
  ACCESSIBILITY_DENIED = 'ACCESSIBILITY_DENIED',
  SCREEN_CAPTURE_DENIED = 'SCREEN_CAPTURE_DENIED',

  // Source errors
  SOURCE_NOT_FOUND = 'SOURCE_NOT_FOUND',
  SOURCE_UNAVAILABLE = 'SOURCE_UNAVAILABLE',
  SOURCE_DISAPPEARED = 'SOURCE_DISAPPEARED',

  // Recording errors
  RECORDING_ALREADY_ACTIVE = 'RECORDING_ALREADY_ACTIVE',
  RECORDING_NOT_FOUND = 'RECORDING_NOT_FOUND',
  RECORDING_NOT_ACTIVE = 'RECORDING_NOT_ACTIVE',
  RECORDING_FAILED = 'RECORDING_FAILED',

  // State errors
  INVALID_STATE_TRANSITION = 'INVALID_STATE_TRANSITION',
  SESSION_NOT_FOUND = 'SESSION_NOT_FOUND',

  // System errors
  DISK_FULL = 'DISK_FULL',
  FILE_WRITE_ERROR = 'FILE_WRITE_ERROR',
  SYSTEM_ERROR = 'SYSTEM_ERROR',

  // Input tracking errors
  INPUT_TRACKING_FAILED = 'INPUT_TRACKING_FAILED',
  INPUT_HOOK_ERROR = 'INPUT_HOOK_ERROR',

  // Window tracking errors
  WINDOW_TRACKING_FAILED = 'WINDOW_TRACKING_FAILED',

  // Unknown
  UNKNOWN = 'UNKNOWN'
}

export interface CaptureErrorDetails {
  code: CaptureErrorCode;
  recoverable: boolean;
  suggestion?: string;
  originalError?: Error;
}

export class CaptureError extends Error {
  public readonly code: CaptureErrorCode;
  public readonly recoverable: boolean;
  public readonly suggestion?: string;
  public readonly originalError?: Error;

  constructor(details: CaptureErrorDetails, message?: string) {
    super(message || getDefaultMessage(details.code));
    this.name = 'CaptureError';
    this.code = details.code;
    this.recoverable = details.recoverable;
    this.suggestion = details.suggestion;
    this.originalError = details.originalError;

    // Maintains proper stack trace in V8
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, CaptureError);
    }
  }

  toJSON() {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      recoverable: this.recoverable,
      suggestion: this.suggestion,
      stack: this.stack
    };
  }
}

// =============================================================================
// Error Factory Functions
// =============================================================================

export function permissionDeniedError(type: 'screen' | 'accessibility'): CaptureError {
  const code = type === 'screen'
    ? CaptureErrorCode.SCREEN_CAPTURE_DENIED
    : CaptureErrorCode.ACCESSIBILITY_DENIED;

  return new CaptureError({
    code,
    recoverable: false,
    suggestion: type === 'screen'
      ? 'Please grant Screen Recording permission in System Preferences > Privacy & Security'
      : 'Please grant Accessibility permission in System Preferences > Privacy & Security'
  });
}

export function sourceNotFoundError(sourceId: string): CaptureError {
  return new CaptureError({
    code: CaptureErrorCode.SOURCE_NOT_FOUND,
    recoverable: true,
    suggestion: 'Please refresh the source list and select a valid capture source'
  }, `Capture source '${sourceId}' not found`);
}

export function sourceDisappearedError(sourceName: string): CaptureError {
  return new CaptureError({
    code: CaptureErrorCode.SOURCE_DISAPPEARED,
    recoverable: false,
    suggestion: 'The capture source (window/screen) is no longer available'
  }, `Capture source '${sourceName}' disappeared during recording`);
}

export function recordingAlreadyActiveError(sessionId: string): CaptureError {
  return new CaptureError({
    code: CaptureErrorCode.RECORDING_ALREADY_ACTIVE,
    recoverable: false,
    suggestion: 'Stop the current recording before starting a new one'
  }, `Recording session '${sessionId}' is already active`);
}

export function sessionNotFoundError(sessionId: string): CaptureError {
  return new CaptureError({
    code: CaptureErrorCode.SESSION_NOT_FOUND,
    recoverable: false
  }, `Session '${sessionId}' not found`);
}

export function invalidStateTransitionError(from: string, to: string): CaptureError {
  return new CaptureError({
    code: CaptureErrorCode.INVALID_STATE_TRANSITION,
    recoverable: false
  }, `Invalid state transition from '${from}' to '${to}'`);
}

export function diskFullError(): CaptureError {
  return new CaptureError({
    code: CaptureErrorCode.DISK_FULL,
    recoverable: false,
    suggestion: 'Free up disk space or change the recording storage location'
  }, 'Insufficient disk space for recording');
}

export function inputTrackingError(originalError: Error): CaptureError {
  return new CaptureError({
    code: CaptureErrorCode.INPUT_TRACKING_FAILED,
    recoverable: true,
    suggestion: 'Recording will continue without input tracking. Check accessibility permissions.',
    originalError
  }, 'Input tracking failed to start');
}

export function windowTrackingError(originalError: Error): CaptureError {
  return new CaptureError({
    code: CaptureErrorCode.WINDOW_TRACKING_FAILED,
    recoverable: true,
    suggestion: 'Recording will continue without window tracking.',
    originalError
  }, 'Window tracking failed to start');
}

export function systemError(originalError: Error): CaptureError {
  return new CaptureError({
    code: CaptureErrorCode.SYSTEM_ERROR,
    recoverable: false,
    originalError
  }, originalError.message);
}

// =============================================================================
// Error Detection
// =============================================================================

export function isCaptureError(error: unknown): error is CaptureError {
  return error instanceof CaptureError;
}

export function isPermissionError(error: unknown): boolean {
  if (!isCaptureError(error)) return false;

  return [
    CaptureErrorCode.PERMISSION_DENIED,
    CaptureErrorCode.SCREEN_CAPTURE_DENIED,
    CaptureErrorCode.ACCESSIBILITY_DENIED
  ].includes(error.code);
}

export function isRecoverableError(error: unknown): boolean {
  if (isCaptureError(error)) {
    return error.recoverable;
  }
  return false;
}

// =============================================================================
// Error Message Helpers
// =============================================================================

function getDefaultMessage(code: CaptureErrorCode): string {
  const messages: Record<CaptureErrorCode, string> = {
    [CaptureErrorCode.PERMISSION_DENIED]: 'Permission denied',
    [CaptureErrorCode.ACCESSIBILITY_DENIED]: 'Accessibility permission denied',
    [CaptureErrorCode.SCREEN_CAPTURE_DENIED]: 'Screen capture permission denied',
    [CaptureErrorCode.SOURCE_NOT_FOUND]: 'Capture source not found',
    [CaptureErrorCode.SOURCE_UNAVAILABLE]: 'Capture source unavailable',
    [CaptureErrorCode.SOURCE_DISAPPEARED]: 'Capture source disappeared',
    [CaptureErrorCode.RECORDING_ALREADY_ACTIVE]: 'Recording already active',
    [CaptureErrorCode.RECORDING_NOT_FOUND]: 'Recording not found',
    [CaptureErrorCode.RECORDING_NOT_ACTIVE]: 'Recording not active',
    [CaptureErrorCode.RECORDING_FAILED]: 'Recording failed',
    [CaptureErrorCode.INVALID_STATE_TRANSITION]: 'Invalid state transition',
    [CaptureErrorCode.SESSION_NOT_FOUND]: 'Session not found',
    [CaptureErrorCode.DISK_FULL]: 'Disk full',
    [CaptureErrorCode.FILE_WRITE_ERROR]: 'File write error',
    [CaptureErrorCode.SYSTEM_ERROR]: 'System error',
    [CaptureErrorCode.INPUT_TRACKING_FAILED]: 'Input tracking failed',
    [CaptureErrorCode.INPUT_HOOK_ERROR]: 'Input hook error',
    [CaptureErrorCode.WINDOW_TRACKING_FAILED]: 'Window tracking failed',
    [CaptureErrorCode.UNKNOWN]: 'Unknown error'
  };

  return messages[code] || 'Unknown error';
}

// =============================================================================
// Error Wrapping
// =============================================================================

export function wrapError(error: unknown, defaultCode = CaptureErrorCode.UNKNOWN): CaptureError {
  if (isCaptureError(error)) {
    return error;
  }

  if (error instanceof Error) {
    // Try to detect error type from message
    const message = error.message.toLowerCase();

    if (message.includes('permission')) {
      return new CaptureError({
        code: CaptureErrorCode.PERMISSION_DENIED,
        recoverable: false,
        originalError: error
      }, error.message);
    }

    if (message.includes('disk') || message.includes('space') || message.includes('enospc')) {
      return diskFullError();
    }

    return new CaptureError({
      code: defaultCode,
      recoverable: false,
      originalError: error
    }, error.message);
  }

  return new CaptureError({
    code: defaultCode,
    recoverable: false
  }, String(error));
}
