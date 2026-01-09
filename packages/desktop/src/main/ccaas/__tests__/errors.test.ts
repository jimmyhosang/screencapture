/**
 * Error Handling Tests
 *
 * Unit tests for CCaaS error utilities
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

import {
  CCaaSError,
  WebhookValidationError,
  SignatureValidationError,
  RecordingError,
  DatabaseError,
  ConfigurationError,
  ServerError,
  ErrorCodes,
  getErrorMessage,
  getErrorCode,
  formatErrorForUser,
  logError,
  withRetry,
  isCCaaSError,
  isWebhookValidationError,
  isRecordingError
} from '../errors';

describe('Custom Error Classes', () => {
  describe('CCaaSError', () => {
    it('should create error with code and context', () => {
      const error = new CCaaSError('Test error', 'TEST_CODE', { foo: 'bar' });

      expect(error.message).toBe('Test error');
      expect(error.code).toBe('TEST_CODE');
      expect(error.context).toEqual({ foo: 'bar' });
      expect(error.timestamp).toBeInstanceOf(Date);
    });

    it('should serialize to JSON', () => {
      const error = new CCaaSError('Test', 'CODE');
      const json = error.toJSON();

      expect(json.name).toBe('CCaaSError');
      expect(json.message).toBe('Test');
      expect(json.code).toBe('CODE');
      expect(json.timestamp).toBeDefined();
    });
  });

  describe('WebhookValidationError', () => {
    it('should have correct code', () => {
      const error = new WebhookValidationError('Invalid event');
      expect(error.code).toBe('WEBHOOK_VALIDATION_ERROR');
      expect(error.name).toBe('WebhookValidationError');
    });
  });

  describe('SignatureValidationError', () => {
    it('should have correct code', () => {
      const error = new SignatureValidationError('Invalid signature');
      expect(error.code).toBe('SIGNATURE_VALIDATION_ERROR');
      expect(error.name).toBe('SignatureValidationError');
    });
  });

  describe('RecordingError', () => {
    it('should store callId and recordingId', () => {
      const error = new RecordingError('Recording failed', {
        callId: 'call-123',
        recordingId: 'rec-456'
      });

      expect(error.callId).toBe('call-123');
      expect(error.recordingId).toBe('rec-456');
      expect(error.code).toBe('RECORDING_ERROR');
    });
  });

  describe('DatabaseError', () => {
    it('should store operation name', () => {
      const error = new DatabaseError('Insert failed', 'INSERT');
      expect(error.operation).toBe('INSERT');
    });
  });

  describe('ConfigurationError', () => {
    it('should store field name', () => {
      const error = new ConfigurationError('Invalid port', 'port');
      expect(error.field).toBe('port');
    });
  });

  describe('ServerError', () => {
    it('should store port number', () => {
      const error = new ServerError('Port in use', 8080);
      expect(error.port).toBe(8080);
    });
  });
});

describe('Error Codes', () => {
  it('should have unique error codes', () => {
    const codes = Object.values(ErrorCodes);
    const uniqueCodes = new Set(codes);
    expect(uniqueCodes.size).toBe(codes.length);
  });

  it('should have codes for all error categories', () => {
    expect(ErrorCodes.MISSING_SIGNATURE).toBeDefined();
    expect(ErrorCodes.RECORDING_START_FAILED).toBeDefined();
    expect(ErrorCodes.DB_INSERT_FAILED).toBeDefined();
    expect(ErrorCodes.PORT_IN_USE).toBeDefined();
    expect(ErrorCodes.INVALID_PORT).toBeDefined();
  });
});

describe('Utility Functions', () => {
  describe('getErrorMessage', () => {
    it('should extract message from Error', () => {
      const error = new Error('Test message');
      expect(getErrorMessage(error)).toBe('Test message');
    });

    it('should handle string error', () => {
      expect(getErrorMessage('String error')).toBe('String error');
    });

    it('should handle object with message', () => {
      expect(getErrorMessage({ message: 'Object message' })).toBe('Object message');
    });

    it('should return default for unknown types', () => {
      expect(getErrorMessage(null)).toBe('Unknown error occurred');
      expect(getErrorMessage(undefined)).toBe('Unknown error occurred');
      expect(getErrorMessage(123)).toBe('Unknown error occurred');
    });
  });

  describe('getErrorCode', () => {
    it('should extract code from CCaaSError', () => {
      const error = new CCaaSError('Test', 'MY_CODE');
      expect(getErrorCode(error)).toBe('MY_CODE');
    });

    it('should extract code from object with code', () => {
      expect(getErrorCode({ code: 'SOME_CODE' })).toBe('SOME_CODE');
    });

    it('should return undefined for errors without code', () => {
      expect(getErrorCode(new Error('Test'))).toBeUndefined();
      expect(getErrorCode('string error')).toBeUndefined();
    });
  });

  describe('formatErrorForUser', () => {
    it('should format CCaaSError with code', () => {
      const error = new CCaaSError('Connection failed', 'CONN_ERR');
      expect(formatErrorForUser(error)).toBe('[CONN_ERR] Connection failed');
    });

    it('should format regular error without code', () => {
      const error = new Error('Simple error');
      expect(formatErrorForUser(error)).toBe('Simple error');
    });
  });

  describe('logError', () => {
    beforeEach(() => {
      vi.spyOn(console, 'error').mockImplementation(() => {});
    });

    it('should log error with context', () => {
      const error = new Error('Test error');
      logError(error, { operation: 'test', callId: 'call-123' });

      expect(console.error).toHaveBeenCalled();
    });
  });
});

describe('withRetry', () => {
  it('should return result on success', async () => {
    const fn = vi.fn().mockResolvedValue('success');
    const result = await withRetry(fn);
    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('should retry on failure', async () => {
    const fn = vi.fn()
      .mockRejectedValueOnce(new Error('Fail 1'))
      .mockRejectedValueOnce(new Error('Fail 2'))
      .mockResolvedValue('success');

    const result = await withRetry(fn, {
      maxAttempts: 3,
      baseDelayMs: 10 // Fast for testing
    });

    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('should throw after max attempts', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('Always fails'));

    await expect(
      withRetry(fn, { maxAttempts: 2, baseDelayMs: 10 })
    ).rejects.toThrow('Always fails');

    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('should call onRetry callback', async () => {
    const onRetry = vi.fn();
    const fn = vi.fn()
      .mockRejectedValueOnce(new Error('Fail'))
      .mockResolvedValue('success');

    await withRetry(fn, {
      maxAttempts: 2,
      baseDelayMs: 10,
      onRetry
    });

    expect(onRetry).toHaveBeenCalledWith(expect.any(Error), 1);
  });
});

describe('Type Guards', () => {
  describe('isCCaaSError', () => {
    it('should return true for CCaaSError', () => {
      expect(isCCaaSError(new CCaaSError('Test', 'CODE'))).toBe(true);
    });

    it('should return true for subclasses', () => {
      expect(isCCaaSError(new WebhookValidationError('Test'))).toBe(true);
      expect(isCCaaSError(new RecordingError('Test'))).toBe(true);
    });

    it('should return false for regular errors', () => {
      expect(isCCaaSError(new Error('Test'))).toBe(false);
      expect(isCCaaSError('string')).toBe(false);
      expect(isCCaaSError(null)).toBe(false);
    });
  });

  describe('isWebhookValidationError', () => {
    it('should return true for WebhookValidationError', () => {
      expect(isWebhookValidationError(new WebhookValidationError('Test'))).toBe(true);
    });

    it('should return false for other errors', () => {
      expect(isWebhookValidationError(new CCaaSError('Test', 'CODE'))).toBe(false);
      expect(isWebhookValidationError(new Error('Test'))).toBe(false);
    });
  });

  describe('isRecordingError', () => {
    it('should return true for RecordingError', () => {
      expect(isRecordingError(new RecordingError('Test'))).toBe(true);
    });

    it('should return false for other errors', () => {
      expect(isRecordingError(new Error('Test'))).toBe(false);
    });
  });
});
