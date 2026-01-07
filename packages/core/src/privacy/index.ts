/**
 * Privacy module - PII detection and redaction utilities
 */

// Re-export all from redactor
export {
  // Types
  type ConfidenceLevel,
  type BuiltInPIIType,
  type PIIType,
  type RedactionConfig,
  type ExtendedRedactionConfig,
  type CustomPattern,
  type PIIMatch,
  type PIIAnalysisResult,
  // Constants
  DEFAULT_REDACTION_CONFIG,
  EXTENDED_REDACTION_CONFIG,
  // Custom pattern functions
  addCustomPattern,
  removeCustomPattern,
  getCustomPatterns,
  clearCustomPatterns,
  // Validation functions
  luhnValidate,
  validateIBAN,
  // Individual redaction functions
  redactEmail,
  redactPhone,
  redactSSN,
  redactCreditCard,
  redactIPv4,
  redactIPv6,
  redactDateOfBirth,
  redactPassport,
  redactDriverLicense,
  redactIBAN,
  redactBankAccount,
  redactAPIKey,
  redactName,
  redactCurrency,
  // Main redaction functions
  redactAll,
  redactWithConfig,
  redactExtended,
  analyzeForPII,
} from './redactor.js';

// Re-export all from piiDetector
export {
  type PIIDetectionResult,
  detectEmail,
  detectPhone,
  detectSSN,
  detectCreditCard,
  detectPII,
} from './piiDetector.js';
