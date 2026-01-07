/**
 * PII Redaction Utilities
 *
 * This module provides functions to redact various types of PII in text strings
 * while preserving partial information for identification purposes.
 */

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
 * Default configuration with all redactions enabled.
 */
export const DEFAULT_REDACTION_CONFIG: RedactionConfig = {
  email: true,
  phone: true,
  ssn: true,
  creditCard: true,
};

// Regex patterns for matching PII
const EMAIL_PATTERN = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
const PHONE_PATTERN = /(?<![.\d])(?:\+?1[-.\s]?)?(?:\(?\d{3}\)?[-.\s]?)?\d{3}[-.\s]?\d{4}(?![.\d])/g;
const SSN_PATTERN = /\b(?!000|666|9\d{2})\d{3}[-.\s]?(?!00)\d{2}[-.\s]?(?!0000)\d{4}\b/g;
const CREDIT_CARD_PATTERN = /\b(?:\d{4}[-.\s]?){3}\d{4}\b|\b\d{13,19}\b/g;

/**
 * Redacts an email address while preserving first character and domain hint.
 * Example: "john.doe@example.com" → "j***@e***.com"
 *
 * @param text - The text containing email addresses to redact
 * @returns Text with redacted email addresses
 *
 * @example
 * ```typescript
 * redactEmail('Contact: john@example.com');
 * // Returns: 'Contact: j***@e***.com'
 * ```
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
 * Example: "(555) 123-4567" → "***-***-4567"
 *
 * @param text - The text containing phone numbers to redact
 * @returns Text with redacted phone numbers
 *
 * @example
 * ```typescript
 * redactPhone('Call: (555) 123-4567');
 * // Returns: 'Call: ***-***-4567'
 * ```
 */
export function redactPhone(text: string): string {
  return text.replace(PHONE_PATTERN, (match) => {
    // Extract only digits
    const digits = match.replace(/\D/g, '');
    const last4 = digits.slice(-4);
    return `***-***-${last4}`;
  });
}

/**
 * Redacts a Social Security Number while preserving the last 4 digits.
 * Example: "123-45-6789" → "***-**-6789"
 *
 * @param text - The text containing SSNs to redact
 * @returns Text with redacted SSNs
 *
 * @example
 * ```typescript
 * redactSSN('SSN: 123-45-6789');
 * // Returns: 'SSN: ***-**-6789'
 * ```
 */
export function redactSSN(text: string): string {
  return text.replace(SSN_PATTERN, (match) => {
    const digits = match.replace(/\D/g, '');
    const last4 = digits.slice(-4);
    return `***-**-${last4}`;
  });
}

/**
 * Validates a credit card number using the Luhn algorithm.
 */
function luhnValidate(cardNumber: string): boolean {
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
 * Redacts a credit card number while preserving the last 4 digits.
 * Only redacts numbers that pass Luhn validation.
 * Example: "4111-1111-1111-1111" → "****-****-****-1111"
 *
 * @param text - The text containing credit card numbers to redact
 * @returns Text with redacted credit card numbers
 *
 * @example
 * ```typescript
 * redactCreditCard('Card: 4111-1111-1111-1111');
 * // Returns: 'Card: ****-****-****-1111'
 * ```
 */
export function redactCreditCard(text: string): string {
  return text.replace(CREDIT_CARD_PATTERN, (match) => {
    // Only redact if it passes Luhn validation
    if (!luhnValidate(match)) {
      return match;
    }

    const digits = match.replace(/\D/g, '');
    const last4 = digits.slice(-4);
    return `****-****-****-${last4}`;
  });
}

/**
 * Represents a match found in text with its position and type.
 */
interface PIIMatch {
  start: number;
  end: number;
  type: 'email' | 'phone' | 'ssn' | 'creditCard';
  original: string;
  redacted: string;
}

/**
 * Finds all PII matches in text and returns them sorted by position.
 */
function findAllMatches(text: string, config: RedactionConfig): PIIMatch[] {
  const matches: PIIMatch[] = [];

  if (config.email) {
    const emailRegex = new RegExp(EMAIL_PATTERN.source, 'g');
    let match;
    while ((match = emailRegex.exec(text)) !== null) {
      const [localPart, domain] = match[0].split('@');
      if (localPart && domain) {
        const domainParts = domain.split('.');
        const tld = domainParts.pop() || '';
        const domainName = domainParts.join('.');
        const redacted = `${localPart.charAt(0)}***@${domainName.charAt(0)}***.${tld}`;
        matches.push({
          start: match.index,
          end: match.index + match[0].length,
          type: 'email',
          original: match[0],
          redacted,
        });
      }
    }
  }

  if (config.phone) {
    const phoneRegex = new RegExp(PHONE_PATTERN.source, 'g');
    let match;
    while ((match = phoneRegex.exec(text)) !== null) {
      const digits = match[0].replace(/\D/g, '');
      const last4 = digits.slice(-4);
      matches.push({
        start: match.index,
        end: match.index + match[0].length,
        type: 'phone',
        original: match[0],
        redacted: `***-***-${last4}`,
      });
    }
  }

  if (config.ssn) {
    const ssnRegex = new RegExp(SSN_PATTERN.source, 'g');
    let match;
    while ((match = ssnRegex.exec(text)) !== null) {
      const digits = match[0].replace(/\D/g, '');
      const last4 = digits.slice(-4);
      matches.push({
        start: match.index,
        end: match.index + match[0].length,
        type: 'ssn',
        original: match[0],
        redacted: `***-**-${last4}`,
      });
    }
  }

  if (config.creditCard) {
    const ccRegex = new RegExp(CREDIT_CARD_PATTERN.source, 'g');
    let match;
    while ((match = ccRegex.exec(text)) !== null) {
      if (luhnValidate(match[0])) {
        const digits = match[0].replace(/\D/g, '');
        const last4 = digits.slice(-4);
        matches.push({
          start: match.index,
          end: match.index + match[0].length,
          type: 'creditCard',
          original: match[0],
          redacted: `****-****-****-${last4}`,
        });
      }
    }
  }

  // Sort by start position (descending) to replace from end to start
  return matches.sort((a, b) => b.start - a.start);
}

/**
 * Removes overlapping matches, keeping the longest match at each position.
 */
function removeOverlaps(matches: PIIMatch[]): PIIMatch[] {
  if (matches.length === 0) return [];

  // Sort by start position ascending, then by length descending
  const sorted = [...matches].sort((a, b) => {
    if (a.start !== b.start) return a.start - b.start;
    return (b.end - b.start) - (a.end - a.start);
  });

  const result: PIIMatch[] = [sorted[0]];

  for (let i = 1; i < sorted.length; i++) {
    const current = sorted[i];
    const last = result[result.length - 1];

    // If current doesn't overlap with last, add it
    if (current.start >= last.end) {
      result.push(current);
    }
    // If they overlap, keep the one that started earlier (already in result)
  }

  // Sort descending by start for replacement
  return result.sort((a, b) => b.start - a.start);
}

/**
 * Applies all redaction types to the text.
 * Handles overlapping matches gracefully by keeping the longest match.
 *
 * @param text - The text to redact
 * @returns Text with all PII types redacted
 *
 * @example
 * ```typescript
 * redactAll('Email: john@example.com, SSN: 123-45-6789');
 * // Returns: 'Email: j***@e***.com, SSN: ***-**-6789'
 * ```
 */
export function redactAll(text: string): string {
  return redactWithConfig(text, DEFAULT_REDACTION_CONFIG);
}

/**
 * Applies redactions based on the provided configuration.
 * Only redacts PII types that are enabled in the config.
 *
 * @param text - The text to redact
 * @param config - Configuration specifying which redaction types to apply
 * @returns Text with configured PII types redacted
 *
 * @example
 * ```typescript
 * const config = { email: true, phone: false, ssn: true, creditCard: false };
 * redactWithConfig('Email: john@example.com, Phone: 555-123-4567', config);
 * // Returns: 'Email: j***@e***.com, Phone: 555-123-4567'
 * ```
 */
export function redactWithConfig(text: string, config: RedactionConfig): string {
  const matches = findAllMatches(text, config);
  const nonOverlapping = removeOverlaps(matches);

  let result = text;
  for (const match of nonOverlapping) {
    result = result.slice(0, match.start) + match.redacted + result.slice(match.end);
  }

  return result;
}
