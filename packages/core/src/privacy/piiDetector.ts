/**
 * PII (Personally Identifiable Information) Detection Utilities
 *
 * This module provides functions to detect various types of PII in text strings,
 * including emails, phone numbers, Social Security Numbers, and credit card numbers.
 */

/**
 * Regular expression pattern for matching standard email addresses.
 * Matches: user@domain.com, user.name+tag@sub.domain.co.uk, etc.
 */
const EMAIL_PATTERN = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/;

/**
 * Regular expression pattern for matching US phone numbers.
 * Matches: (555) 555-5555, 555-555-5555, +1-555-555-5555
 * STRICTER: Requires at least 10 digits and appropriate separators.
 * Avoids matching sequence of digits that look like orders or IDs.
 */
const PHONE_PATTERN = /(?:\+?1[-.\s]?)?(?:\(\d{3}\)|\d{3})[-.\s]?\d{3}[-.\s]?\d{4}(?!\d)/;

/**
 * Regular expression pattern for matching Social Security Numbers.
 * Matches: XXX-XX-XXXX format.
 * STRICTER: Ensures it's not 000-00-0000.
 */
const SSN_PATTERN = /\b(?!000|666|9\d{2})\d{3}[-.\s]?(?!00)\d{2}[-.\s]?(?!0000)\d{4}\b/;

/**
 * Regular expression pattern for matching credit card numbers.
 * Matches 13-19 digit numbers with optional separators (spaces, dashes).
 * Covers most major card formats: Visa, Mastercard, Amex, Discover, etc.
 */
const CREDIT_CARD_PATTERN = /\b(?:\d{4}[-.\s]?){3,4}\d{1,4}\b|\b\d{13,19}\b/;

/**
 * Detects if the given text contains an email address.
 *
 * @param text - The text string to check for email addresses
 * @returns true if an email address is found, false otherwise
 *
 * @example
 * ```typescript
 * detectEmail('Contact me at john@example.com'); // true
 * detectEmail('No email here'); // false
 * ```
 */
export function detectEmail(text: string): boolean {
  return EMAIL_PATTERN.test(text);
}

/**
 * Detects if the given text contains a phone number.
 * Supports various US phone number formats including:
 * - (555) 555-5555
 * - 555-555-5555
 * - 5555555555
 * - +1-555-555-5555
 * - 555.555.5555
 *
 * @param text - The text string to check for phone numbers
 * @returns true if a phone number is found, false otherwise
 *
 * @example
 * ```typescript
 * detectPhone('Call me at (555) 123-4567'); // true
 * detectPhone('My number is 5551234567'); // true
 * detectPhone('No phone here'); // false
 * ```
 */
export function detectPhone(text: string): boolean {
  return PHONE_PATTERN.test(text);
}

/**
 * Detects if the given text contains a Social Security Number (SSN).
 * Matches the standard XXX-XX-XXXX format with various separators.
 * Excludes obviously invalid SSNs (e.g., those starting with 000, 666, or 9XX).
 *
 * @param text - The text string to check for SSNs
 * @returns true if an SSN is found, false otherwise
 *
 * @example
 * ```typescript
 * detectSSN('SSN: 123-45-6789'); // true
 * detectSSN('Invalid: 000-00-0000'); // false (invalid SSN format)
 * detectSSN('No SSN here'); // false
 * ```
 */
export function detectSSN(text: string): boolean {
  return SSN_PATTERN.test(text);
}

/**
 * Validates a credit card number using the Luhn algorithm.
 * This is a checksum formula used to validate identification numbers.
 *
 * @param cardNumber - The credit card number (digits only)
 * @returns true if the number passes Luhn validation, false otherwise
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
 * Detects if the given text contains a credit card number.
 * Matches 13-19 digit card numbers with optional separators.
 * Performs basic Luhn validation to reduce false positives.
 *
 * @param text - The text string to check for credit card numbers
 * @returns true if a valid credit card number is found, false otherwise
 *
 * @example
 * ```typescript
 * detectCreditCard('Card: 4111-1111-1111-1111'); // true (valid test Visa)
 * detectCreditCard('Card: 4111111111111111'); // true
 * detectCreditCard('Not a card: 1234-5678-9012-3456'); // false (fails Luhn)
 * ```
 */
export function detectCreditCard(text: string): boolean {
  const matches = text.match(new RegExp(CREDIT_CARD_PATTERN.source, 'g'));

  if (!matches) {
    return false;
  }

  // Check if any match passes Luhn validation
  return matches.some((match) => luhnValidate(match));
}

/**
 * PII detection result containing whether PII was found and which types.
 */
export interface PIIDetectionResult {
  /** Whether any PII was detected in the text */
  hasPII: boolean;
  /** Array of PII types found (e.g., ['email', 'phone']) */
  types: string[];
}

/**
 * Comprehensive PII detection that checks for all supported PII types.
 * Runs all individual detectors and aggregates the results.
 *
 * @param text - The text string to check for PII
 * @returns An object containing whether PII was found and which types
 *
 * @example
 * ```typescript
 * detectPII('Email: john@example.com, SSN: 123-45-6789');
 * // Returns: { hasPII: true, types: ['email', 'ssn'] }
 *
 * detectPII('No sensitive data here');
 * // Returns: { hasPII: false, types: [] }
 * ```
 */
export function detectPII(text: string): PIIDetectionResult {
  const types: string[] = [];

  if (detectEmail(text)) {
    types.push('email');
  }

  if (detectPhone(text)) {
    types.push('phone');
  }

  if (detectSSN(text)) {
    types.push('ssn');
  }

  if (detectCreditCard(text)) {
    types.push('creditCard');
  }

  return {
    hasPII: types.length > 0,
    types,
  };
}
