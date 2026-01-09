/**
 * PII Redaction Utilities
 *
 * This module provides functions to redact various types of PII in text strings
 * while preserving partial information for identification purposes.
 *
 * Features:
 * - Built-in patterns for common PII types
 * - Custom pattern support
 * - Context-aware detection
 * - Confidence scoring
 */

// =============================================================================
// Types and Interfaces
// =============================================================================

/**
 * Confidence level for PII detection.
 */
export type ConfidenceLevel = 'high' | 'medium' | 'low';

/**
 * Built-in PII types.
 */
export type BuiltInPIIType =
  | 'email'
  | 'phone'
  | 'ssn'
  | 'creditCard'
  | 'ipv4'
  | 'ipv6'
  | 'dateOfBirth'
  | 'passport'
  | 'driverLicense'
  | 'iban'
  | 'bankAccount'
  | 'apiKey'
  | 'name'
  | 'currency';

/**
 * All PII types including custom patterns.
 */
export type PIIType = BuiltInPIIType | `custom:${string}`;

/**
 * Configuration for enabling/disabling specific redaction types.
 */
export interface RedactionConfig {
  /** Enable email redaction */
  email: boolean;
  /** Enable phone number redaction */
  phone: boolean;
  /** Enable SSN redaction */
  ssn: boolean;
  /** Enable credit card redaction */
  creditCard: boolean;
}

/**
 * Extended configuration with all built-in patterns.
 */
export interface ExtendedRedactionConfig extends RedactionConfig {
  /** Enable IPv4 address redaction */
  ipv4?: boolean;
  /** Enable IPv6 address redaction */
  ipv6?: boolean;
  /** Enable date of birth redaction */
  dateOfBirth?: boolean;
  /** Enable passport number redaction */
  passport?: boolean;
  /** Enable driver's license redaction */
  driverLicense?: boolean;
  /** Enable IBAN redaction */
  iban?: boolean;
  /** Enable bank account number redaction */
  bankAccount?: boolean;
  /** Enable API key/token redaction */
  apiKey?: boolean;
  /** Enable context-based name detection */
  name?: boolean;
  /** Enable currency amount redaction */
  currency?: boolean;
  /** Custom patterns to apply */
  customPatterns?: string[];
  /** Minimum confidence level to redact (default: 'low' - redact everything) */
  minConfidence?: ConfidenceLevel;
}

/**
 * Custom pattern definition.
 */
export interface CustomPattern {
  /** Unique name for the pattern */
  name: string;
  /** Regular expression to match */
  regex: RegExp;
  /** Function to generate redacted replacement */
  replacer: (match: string) => string;
  /** Default confidence level for this pattern */
  confidence?: ConfidenceLevel;
}

/**
 * Represents a match found in text with its position, type, and confidence.
 */
export interface PIIMatch {
  start: number;
  end: number;
  type: PIIType;
  original: string;
  redacted: string;
  confidence: ConfidenceLevel;
  context?: string;
}

/**
 * Result of analyzing text for PII.
 */
export interface PIIAnalysisResult {
  /** The redacted text */
  redactedText: string;
  /** All matches found */
  matches: PIIMatch[];
  /** Summary of matches by type */
  summary: Record<string, number>;
}

// =============================================================================
// Default Configuration
// =============================================================================

/**
 * Default configuration with basic redactions enabled.
 */
export const DEFAULT_REDACTION_CONFIG: RedactionConfig = {
  email: true,
  phone: true,
  ssn: true,
  creditCard: true,
};

/**
 * Extended default configuration with all patterns enabled.
 */
export const EXTENDED_REDACTION_CONFIG: ExtendedRedactionConfig = {
  ...DEFAULT_REDACTION_CONFIG,
  ipv4: true,
  ipv6: true,
  dateOfBirth: true,
  passport: true,
  driverLicense: true,
  iban: true,
  bankAccount: true,
  apiKey: true,
  name: true,
  currency: true,
  minConfidence: 'low',
};

// =============================================================================
// Pattern Definitions
// =============================================================================

// Original patterns
const EMAIL_PATTERN = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
const PHONE_PATTERN =
  /(?<![.\d])(?:\+?1[-.\s]?)?(?:\(?\d{3}\)?[-.\s]?)?\d{3}[-.\s]?\d{4}(?![.\d])/g;
const SSN_PATTERN = /\b(?!000|666|9\d{2})\d{3}[-.\s]?(?!00)\d{2}[-.\s]?(?!0000)\d{4}\b/g;
const CREDIT_CARD_PATTERN = /\b(?:\d{4}[-.\s]?){3}\d{4}\b|\b\d{13,19}\b/g;

// New patterns
const IPV4_PATTERN =
  /\b(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\b/g;
// IPv6 pattern - handles full, compressed, and loopback forms
// Order matters: patterns ending with hex groups must come BEFORE patterns ending with ::
// to avoid partial matches like matching "2001:db8::" instead of "2001:db8::1"
const IPV6_PATTERN = new RegExp(
  '(?:' +
    // Full form: 8 groups (most specific, try first)
    '(?:[0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}' +
    // :: with groups on both sides (patterns ending with hex group)
    '|(?:[0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}' +
    '|(?:[0-9a-fA-F]{1,4}:){1,5}(?::[0-9a-fA-F]{1,4}){1,2}' +
    '|(?:[0-9a-fA-F]{1,4}:){1,4}(?::[0-9a-fA-F]{1,4}){1,3}' +
    '|(?:[0-9a-fA-F]{1,4}:){1,3}(?::[0-9a-fA-F]{1,4}){1,4}' +
    '|(?:[0-9a-fA-F]{1,4}:){1,2}(?::[0-9a-fA-F]{1,4}){1,5}' +
    '|[0-9a-fA-F]{1,4}:(?::[0-9a-fA-F]{1,4}){1,6}' +
    // :: at the start with trailing groups (e.g., ::1, ::ffff:192.0.2.1)
    '|:(?::[0-9a-fA-F]{1,4}){1,7}' +
    // :: at the end (patterns ending with ::) - must come AFTER patterns with trailing hex
    '|(?:[0-9a-fA-F]{1,4}:){1,7}:' +
    // Just :: (all zeros - shortest match, try last)
    '|::' +
  ')',
  'g'
);

// Date of birth patterns (various formats)
const DOB_PATTERN =
  /\b(?:(?:0?[1-9]|1[0-2])[-/.](?:0?[1-9]|[12][0-9]|3[01])[-/.](?:19|20)\d{2}|(?:19|20)\d{2}[-/.](?:0?[1-9]|1[0-2])[-/.](?:0?[1-9]|[12][0-9]|3[01]))\b/g;

// Passport patterns (US and common international formats)
const PASSPORT_PATTERN = /\b[A-Z]{1,2}\d{6,9}\b/g;

// Driver's license patterns (US state formats - simplified)
const DRIVER_LICENSE_PATTERN =
  /\b(?:[A-Z]{1,2}\d{5,8}|\d{1,3}[-\s]?\d{2,3}[-\s]?\d{4}|[A-Z]\d{3}[-\s]?\d{3}[-\s]?\d{3}[-\s]?\d{3})\b/g;

// IBAN pattern (International Bank Account Number)
const IBAN_PATTERN = /\b[A-Z]{2}\d{2}[A-Z0-9]{4,30}\b/g;

// US Bank account patterns (routing + account)
const BANK_ACCOUNT_PATTERN = /\b\d{9}[-\s]?\d{4,17}\b/g;

// API key patterns (common formats)
const API_KEY_PATTERN =
  /\b(?:sk_live_[a-zA-Z0-9]{24,}|sk_test_[a-zA-Z0-9]{24,}|pk_live_[a-zA-Z0-9]{24,}|pk_test_[a-zA-Z0-9]{24,}|ghp_[a-zA-Z0-9]{36,}|github_pat_[a-zA-Z0-9_]{22,}|gho_[a-zA-Z0-9]{36,}|ghu_[a-zA-Z0-9]{36,}|ghs_[a-zA-Z0-9]{36,}|ghr_[a-zA-Z0-9]{36,}|xox[baprs]-[a-zA-Z0-9-]{10,}|AIza[a-zA-Z0-9_-]{35}|ya29\.[a-zA-Z0-9_-]+|AKIA[A-Z0-9]{16}|[a-zA-Z0-9]{32,}(?:_[a-zA-Z0-9]{8,})?)\b/g;

// Context-based name pattern (preceded by "Name:", "name:", etc.)
const NAME_CONTEXT_PATTERN =
  /(?:(?:full\s*)?name|first\s*name|last\s*name|surname|given\s*name)\s*[:=]\s*([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,3})/gi;

// Currency pattern (preceded by currency symbols)
const CURRENCY_PATTERN =
  /(?:[\$\€\£\¥]|USD|EUR|GBP|JPY)\s*\d{1,3}(?:,\d{3})*(?:\.\d{2})?\b|\b\d{1,3}(?:,\d{3})*(?:\.\d{2})?\s*(?:dollars?|euros?|pounds?|yen)\b/gi;

// =============================================================================
// Custom Pattern Registry
// =============================================================================

const customPatterns = new Map<string, CustomPattern>();

/**
 * Adds a custom pattern for PII detection and redaction.
 *
 * @param name - Unique name for the pattern
 * @param regex - Regular expression to match (should have 'g' flag)
 * @param replacer - Function to generate redacted replacement
 * @param confidence - Default confidence level (default: 'medium')
 *
 * @example
 * ```typescript
 * addCustomPattern(
 *   'employeeId',
 *   /\bEMP-\d{6}\b/g,
 *   (match) => 'EMP-******',
 *   'high'
 * );
 * ```
 */
export function addCustomPattern(
  name: string,
  regex: RegExp,
  replacer: (match: string) => string,
  confidence: ConfidenceLevel = 'medium'
): void {
  // Ensure regex has global flag
  const flags = regex.flags.includes('g') ? regex.flags : regex.flags + 'g';
  const globalRegex = new RegExp(regex.source, flags);

  customPatterns.set(name, {
    name,
    regex: globalRegex,
    replacer,
    confidence,
  });
}

/**
 * Removes a custom pattern by name.
 *
 * @param name - Name of the pattern to remove
 * @returns true if pattern was removed, false if not found
 */
export function removeCustomPattern(name: string): boolean {
  return customPatterns.delete(name);
}

/**
 * Gets all registered custom patterns.
 */
export function getCustomPatterns(): Map<string, CustomPattern> {
  return new Map(customPatterns);
}

/**
 * Clears all custom patterns.
 */
export function clearCustomPatterns(): void {
  customPatterns.clear();
}

// =============================================================================
// Confidence Scoring
// =============================================================================

const CONFIDENCE_ORDER: Record<ConfidenceLevel, number> = {
  low: 1,
  medium: 2,
  high: 3,
};

/**
 * Compares confidence levels.
 * @returns true if level meets or exceeds minimum
 */
function meetsConfidenceThreshold(level: ConfidenceLevel, minimum: ConfidenceLevel): boolean {
  return CONFIDENCE_ORDER[level] >= CONFIDENCE_ORDER[minimum];
}

/**
 * Determines confidence level based on context and pattern characteristics.
 */
function calculateConfidence(
  type: PIIType,
  match: string,
  text: string,
  startIndex: number
): ConfidenceLevel {
  const contextBefore = text.slice(Math.max(0, startIndex - 50), startIndex).toLowerCase();

  switch (type) {
    case 'email':
      // High confidence if preceded by email-related words
      if (/(?:email|e-mail|mail|contact)\s*[:=]?\s*$/.test(contextBefore)) {
        return 'high';
      }
      // High confidence for standard email format
      if (match.includes('@') && match.includes('.')) {
        return 'high';
      }
      return 'medium';

    case 'phone':
      // High confidence if preceded by phone-related words
      if (/(?:phone|tel|mobile|cell|fax|call)\s*[:=]?\s*$/.test(contextBefore)) {
        return 'high';
      }
      // Higher confidence for formatted numbers
      if (/\(\d{3}\)|\d{3}-\d{3}-\d{4}/.test(match)) {
        return 'high';
      }
      return 'medium';

    case 'ssn':
      // High confidence if preceded by SSN-related words
      if (/(?:ssn|social\s*security|ss#)\s*[:=]?\s*$/.test(contextBefore)) {
        return 'high';
      }
      // Standard SSN format is high confidence
      if (/\d{3}-\d{2}-\d{4}/.test(match)) {
        return 'high';
      }
      return 'medium';

    case 'creditCard':
      // High confidence due to Luhn validation
      return 'high';

    case 'ipv4':
    case 'ipv6':
      // High confidence if preceded by IP-related words
      if (/(?:ip|address|server|host)\s*[:=]?\s*$/.test(contextBefore)) {
        return 'high';
      }
      return 'medium';

    case 'dateOfBirth':
      // High confidence if preceded by DOB-related words
      if (/(?:dob|birth|born|birthday|date\s*of\s*birth)\s*[:=]?\s*$/.test(contextBefore)) {
        return 'high';
      }
      return 'low';

    case 'passport':
      // High confidence if preceded by passport-related words
      if (/(?:passport|travel\s*doc)\s*[:=]?\s*$/.test(contextBefore)) {
        return 'high';
      }
      return 'low';

    case 'driverLicense':
      // High confidence if preceded by license-related words
      if (/(?:license|licence|dl|driver)\s*[:=]?\s*$/.test(contextBefore)) {
        return 'high';
      }
      return 'low';

    case 'iban':
      // IBAN format is fairly distinctive
      if (/^[A-Z]{2}\d{2}/.test(match)) {
        return 'high';
      }
      return 'medium';

    case 'bankAccount':
      // High confidence if preceded by bank-related words
      if (/(?:account|acct|routing|bank)\s*[:=]?\s*$/.test(contextBefore)) {
        return 'high';
      }
      return 'low';

    case 'apiKey':
      // API key prefixes are distinctive
      if (
        /^(?:sk_|pk_|ghp_|github_pat_|gho_|ghu_|ghs_|ghr_|xox|AIza|ya29\.|AKIA)/.test(match)
      ) {
        return 'high';
      }
      return 'medium';

    case 'name':
      // Context-based detection always medium since it relies on labels
      return 'medium';

    case 'currency':
      // High confidence if has currency symbol
      if (/^[\$\€\£\¥]/.test(match)) {
        return 'high';
      }
      return 'medium';

    default:
      // Custom patterns use their defined confidence
      if (type.startsWith('custom:')) {
        const patternName = type.slice(7);
        const pattern = customPatterns.get(patternName);
        return pattern?.confidence || 'medium';
      }
      return 'medium';
  }
}

// =============================================================================
// Validation Functions
// =============================================================================

/**
 * Validates a credit card number using the Luhn algorithm.
 */
export function luhnValidate(cardNumber: string): boolean {
  const digits = cardNumber.replace(/\D/g, '');

  if (digits.length < 13 || digits.length > 19) {
    return false;
  }

  let sum = 0;
  let isEven = false;

  for (let i = digits.length - 1; i >= 0; i--) {
    let digit = parseInt(digits[i], 10);

    if (isEven) {
      digit *= 2;
      if (digit > 9) {
        digit -= 9;
      }
    }

    sum += digit;
    isEven = !isEven;
  }

  return sum % 10 === 0;
}

/**
 * Validates IBAN checksum.
 */
export function validateIBAN(iban: string): boolean {
  const cleaned = iban.replace(/\s/g, '').toUpperCase();
  if (cleaned.length < 15 || cleaned.length > 34) {
    return false;
  }

  // Move first 4 chars to end
  const rearranged = cleaned.slice(4) + cleaned.slice(0, 4);

  // Convert letters to numbers (A=10, B=11, etc.)
  let numericString = '';
  for (const char of rearranged) {
    if (/[A-Z]/.test(char)) {
      numericString += (char.charCodeAt(0) - 55).toString();
    } else {
      numericString += char;
    }
  }

  // Calculate mod 97 using string division to handle large numbers
  let remainder = 0;
  for (const digit of numericString) {
    remainder = (remainder * 10 + parseInt(digit, 10)) % 97;
  }

  return remainder === 1;
}

// =============================================================================
// Redaction Functions
// =============================================================================

/**
 * Redacts an email address while preserving first character and domain hint.
 */
export function redactEmail(text: string): string {
  return text.replace(EMAIL_PATTERN, (match) => {
    const [localPart, domain] = match.split('@');
    if (!localPart || !domain) return match;

    const domainParts = domain.split('.');
    const tld = domainParts.pop() || '';
    const domainName = domainParts.join('.');

    const redactedLocal = localPart.charAt(0) + '***';
    const redactedDomain = domainName.charAt(0) + '***';

    return `${redactedLocal}@${redactedDomain}.${tld}`;
  });
}

/**
 * Redacts a phone number while preserving the last 4 digits.
 */
export function redactPhone(text: string): string {
  return text.replace(PHONE_PATTERN, (match) => {
    const digits = match.replace(/\D/g, '');
    const last4 = digits.slice(-4);
    return `***-***-${last4}`;
  });
}

/**
 * Redacts a Social Security Number while preserving the last 4 digits.
 */
export function redactSSN(text: string): string {
  return text.replace(SSN_PATTERN, (match) => {
    const digits = match.replace(/\D/g, '');
    const last4 = digits.slice(-4);
    return `***-**-${last4}`;
  });
}

/**
 * Redacts a credit card number while preserving the last 4 digits.
 */
export function redactCreditCard(text: string): string {
  return text.replace(CREDIT_CARD_PATTERN, (match) => {
    if (!luhnValidate(match)) {
      return match;
    }
    const digits = match.replace(/\D/g, '');
    const last4 = digits.slice(-4);
    return `****-****-****-${last4}`;
  });
}

/**
 * Redacts an IPv4 address while preserving the first octet.
 */
export function redactIPv4(text: string): string {
  return text.replace(IPV4_PATTERN, (match) => {
    const firstOctet = match.split('.')[0];
    return `${firstOctet}.***.***.**`;
  });
}

/**
 * Redacts an IPv6 address.
 */
export function redactIPv6(text: string): string {
  return text.replace(IPV6_PATTERN, () => '[IPv6 REDACTED]');
}

/**
 * Redacts a date of birth while preserving the year.
 */
export function redactDateOfBirth(text: string): string {
  return text.replace(DOB_PATTERN, () => {
    return `**/**/****`;
  });
}

/**
 * Redacts a passport number while preserving the country prefix.
 */
export function redactPassport(text: string): string {
  return text.replace(PASSPORT_PATTERN, (match) => {
    const prefix = match.match(/^[A-Z]{1,2}/)?.[0] || '';
    return `${prefix}${'*'.repeat(match.length - prefix.length)}`;
  });
}

/**
 * Redacts a driver's license number.
 */
export function redactDriverLicense(text: string): string {
  return text.replace(DRIVER_LICENSE_PATTERN, (match) => {
    const prefix = match.match(/^[A-Z]{1,2}/)?.[0] || '';
    return prefix ? `${prefix}${'*'.repeat(6)}` : '[DL REDACTED]';
  });
}

/**
 * Redacts an IBAN while preserving country code.
 */
export function redactIBAN(text: string): string {
  return text.replace(IBAN_PATTERN, (match) => {
    if (!validateIBAN(match)) {
      return match;
    }
    const countryCode = match.slice(0, 2);
    return `${countryCode}${'*'.repeat(Math.min(match.length - 2, 20))}`;
  });
}

/**
 * Redacts a bank account number.
 */
export function redactBankAccount(text: string): string {
  return text.replace(BANK_ACCOUNT_PATTERN, (match) => {
    const last4 = match.replace(/\D/g, '').slice(-4);
    return `****-****-${last4}`;
  });
}

/**
 * Redacts API keys and tokens.
 */
export function redactAPIKey(text: string): string {
  return text.replace(API_KEY_PATTERN, (match) => {
    // Preserve prefix for identification
    const prefixMatch = match.match(
      /^(?:sk_live_|sk_test_|pk_live_|pk_test_|ghp_|github_pat_|gho_|ghu_|ghs_|ghr_|xox[baprs]-|AIza|ya29\.|AKIA)/
    );
    if (prefixMatch) {
      return `${prefixMatch[0]}${'*'.repeat(20)}`;
    }
    return '[API_KEY_REDACTED]';
  });
}

/**
 * Redacts names found in context (e.g., "Name: John Smith").
 */
export function redactName(text: string): string {
  return text.replace(NAME_CONTEXT_PATTERN, (match, name) => {
    const label = match.slice(0, match.indexOf(name));
    const initials = name
      .split(/\s+/)
      .map((n: string) => n.charAt(0))
      .join('.');
    return `${label}${initials}.`;
  });
}

/**
 * Redacts currency amounts.
 */
export function redactCurrency(text: string): string {
  return text.replace(CURRENCY_PATTERN, (match) => {
    const symbolMatch = match.match(/^[\$\€\£\¥]|USD|EUR|GBP|JPY/);
    if (symbolMatch) {
      return `${symbolMatch[0]}***.** `;
    }
    return '[AMOUNT REDACTED]';
  });
}

// =============================================================================
// Match Finding Functions
// =============================================================================

/**
 * Finds all PII matches in text based on configuration.
 */
function findAllMatches(
  text: string,
  config: ExtendedRedactionConfig
): PIIMatch[] {
  const matches: PIIMatch[] = [];
  const minConfidence = config.minConfidence || 'low';

  // Helper to add matches for a pattern
  const addMatches = (
    pattern: RegExp,
    type: PIIType,
    getRedacted: (match: string) => string,
    validator?: (match: string) => boolean
  ) => {
    const regex = new RegExp(pattern.source, 'g');
    let match;
    while ((match = regex.exec(text)) !== null) {
      if (validator && !validator(match[0])) continue;

      const confidence = calculateConfidence(type, match[0], text, match.index);
      if (!meetsConfidenceThreshold(confidence, minConfidence)) continue;

      matches.push({
        start: match.index,
        end: match.index + match[0].length,
        type,
        original: match[0],
        redacted: getRedacted(match[0]),
        confidence,
      });
    }
  };

  // Original patterns
  if (config.email) {
    addMatches(EMAIL_PATTERN, 'email', (m) => {
      const [localPart, domain] = m.split('@');
      if (!localPart || !domain) return m;
      const domainParts = domain.split('.');
      const tld = domainParts.pop() || '';
      const domainName = domainParts.join('.');
      return `${localPart.charAt(0)}***@${domainName.charAt(0)}***.${tld}`;
    });
  }

  if (config.phone) {
    addMatches(PHONE_PATTERN, 'phone', (m) => {
      const digits = m.replace(/\D/g, '');
      return `***-***-${digits.slice(-4)}`;
    });
  }

  if (config.ssn) {
    addMatches(SSN_PATTERN, 'ssn', (m) => {
      const digits = m.replace(/\D/g, '');
      return `***-**-${digits.slice(-4)}`;
    });
  }

  if (config.creditCard) {
    addMatches(
      CREDIT_CARD_PATTERN,
      'creditCard',
      (m) => {
        const digits = m.replace(/\D/g, '');
        return `****-****-****-${digits.slice(-4)}`;
      },
      luhnValidate
    );
  }

  // Extended patterns
  if (config.ipv4) {
    addMatches(IPV4_PATTERN, 'ipv4', (m) => `${m.split('.')[0]}.***.***.**`);
  }

  if (config.ipv6) {
    addMatches(IPV6_PATTERN, 'ipv6', () => '[IPv6 REDACTED]');
  }

  if (config.dateOfBirth) {
    addMatches(DOB_PATTERN, 'dateOfBirth', () => '**/**/****');
  }

  if (config.passport) {
    addMatches(PASSPORT_PATTERN, 'passport', (m) => {
      const prefix = m.match(/^[A-Z]{1,2}/)?.[0] || '';
      return `${prefix}${'*'.repeat(m.length - prefix.length)}`;
    });
  }

  if (config.driverLicense) {
    addMatches(DRIVER_LICENSE_PATTERN, 'driverLicense', (m) => {
      const prefix = m.match(/^[A-Z]{1,2}/)?.[0] || '';
      return prefix ? `${prefix}${'*'.repeat(6)}` : '[DL REDACTED]';
    });
  }

  if (config.iban) {
    addMatches(
      IBAN_PATTERN,
      'iban',
      (m) => `${m.slice(0, 2)}${'*'.repeat(Math.min(m.length - 2, 20))}`,
      validateIBAN
    );
  }

  if (config.bankAccount) {
    addMatches(BANK_ACCOUNT_PATTERN, 'bankAccount', (m) => {
      const last4 = m.replace(/\D/g, '').slice(-4);
      return `****-****-${last4}`;
    });
  }

  if (config.apiKey) {
    addMatches(API_KEY_PATTERN, 'apiKey', (m) => {
      const prefixMatch = m.match(
        /^(?:sk_live_|sk_test_|pk_live_|pk_test_|ghp_|github_pat_|gho_|ghu_|ghs_|ghr_|xox[baprs]-|AIza|ya29\.|AKIA)/
      );
      return prefixMatch ? `${prefixMatch[0]}${'*'.repeat(20)}` : '[API_KEY_REDACTED]';
    });
  }

  if (config.name) {
    const nameRegex = new RegExp(NAME_CONTEXT_PATTERN.source, 'gi');
    let match;
    while ((match = nameRegex.exec(text)) !== null) {
      const name = match[1];
      const label = match[0].slice(0, match[0].indexOf(name));
      const initials = name
        .split(/\s+/)
        .map((n: string) => n.charAt(0))
        .join('.');

      const confidence = calculateConfidence('name', match[0], text, match.index);
      if (!meetsConfidenceThreshold(confidence, minConfidence)) continue;

      matches.push({
        start: match.index,
        end: match.index + match[0].length,
        type: 'name',
        original: match[0],
        redacted: `${label}${initials}.`,
        confidence,
      });
    }
  }

  if (config.currency) {
    addMatches(CURRENCY_PATTERN, 'currency', (m) => {
      const symbolMatch = m.match(/^[\$\€\£\¥]|USD|EUR|GBP|JPY/);
      return symbolMatch ? `${symbolMatch[0]}***.** ` : '[AMOUNT REDACTED]';
    });
  }

  // Custom patterns
  if (config.customPatterns) {
    for (const patternName of config.customPatterns) {
      const pattern = customPatterns.get(patternName);
      if (pattern) {
        addMatches(
          pattern.regex,
          `custom:${patternName}` as PIIType,
          pattern.replacer
        );
      }
    }
  }

  return matches.sort((a, b) => b.start - a.start);
}

/**
 * Removes overlapping matches, keeping the longest match at each position.
 */
function removeOverlaps(matches: PIIMatch[]): PIIMatch[] {
  if (matches.length === 0) return [];

  const sorted = [...matches].sort((a, b) => {
    if (a.start !== b.start) return a.start - b.start;
    return b.end - b.start - (a.end - a.start);
  });

  const result: PIIMatch[] = [sorted[0]];

  for (let i = 1; i < sorted.length; i++) {
    const current = sorted[i];
    const last = result[result.length - 1];

    if (current.start >= last.end) {
      result.push(current);
    }
  }

  return result.sort((a, b) => b.start - a.start);
}

// =============================================================================
// Main Redaction Functions
// =============================================================================

/**
 * Applies all redaction types to the text.
 */
export function redactAll(text: string): string {
  return redactWithConfig(text, DEFAULT_REDACTION_CONFIG);
}

/**
 * Applies redactions based on the provided configuration.
 */
export function redactWithConfig(
  text: string,
  config: RedactionConfig | ExtendedRedactionConfig
): string {
  const extendedConfig: ExtendedRedactionConfig = {
    ...config,
    minConfidence: (config as ExtendedRedactionConfig).minConfidence || 'low',
  };

  const matches = findAllMatches(text, extendedConfig);
  const nonOverlapping = removeOverlaps(matches);

  let result = text;
  for (const match of nonOverlapping) {
    result = result.slice(0, match.start) + match.redacted + result.slice(match.end);
  }

  return result;
}

/**
 * Analyzes text for PII and returns detailed results including confidence scores.
 *
 * @param text - The text to analyze
 * @param config - Configuration for which patterns to check
 * @returns Analysis result with redacted text, matches, and summary
 *
 * @example
 * ```typescript
 * const result = analyzeForPII('Email: john@example.com, IP: 192.168.1.1', {
 *   email: true,
 *   ipv4: true,
 *   minConfidence: 'medium'
 * });
 * console.log(result.matches); // Array of matches with confidence levels
 * console.log(result.redactedText); // Redacted version
 * ```
 */
export function analyzeForPII(
  text: string,
  config: ExtendedRedactionConfig = EXTENDED_REDACTION_CONFIG
): PIIAnalysisResult {
  const matches = findAllMatches(text, config);
  const nonOverlapping = removeOverlaps(matches);

  // Generate redacted text
  let redactedText = text;
  for (const match of nonOverlapping) {
    redactedText =
      redactedText.slice(0, match.start) + match.redacted + redactedText.slice(match.end);
  }

  // Generate summary
  const summary: Record<string, number> = {};
  for (const match of nonOverlapping) {
    summary[match.type] = (summary[match.type] || 0) + 1;
  }

  return {
    redactedText,
    matches: nonOverlapping.sort((a, b) => a.start - b.start),
    summary,
  };
}

/**
 * Redacts text with extended configuration including all new patterns.
 *
 * @param text - The text to redact
 * @param config - Extended configuration
 * @returns Redacted text
 */
export function redactExtended(
  text: string,
  config: ExtendedRedactionConfig = EXTENDED_REDACTION_CONFIG
): string {
  return redactWithConfig(text, config);
}
