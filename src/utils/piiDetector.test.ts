import { describe, it, expect } from 'vitest';
import {
  detectEmail,
  detectPhone,
  detectSSN,
  detectCreditCard,
  detectPII,
} from './piiDetector';

describe('detectEmail', () => {
  describe('positive matches', () => {
    it('should detect standard email addresses', () => {
      expect(detectEmail('john@example.com')).toBe(true);
      expect(detectEmail('jane.doe@company.org')).toBe(true);
      expect(detectEmail('user123@domain.net')).toBe(true);
    });

    it('should detect emails with subdomains', () => {
      expect(detectEmail('user@mail.subdomain.example.com')).toBe(true);
      expect(detectEmail('test@api.v2.service.io')).toBe(true);
    });

    it('should detect emails with plus signs and dots', () => {
      expect(detectEmail('user+tag@example.com')).toBe(true);
      expect(detectEmail('first.last@example.com')).toBe(true);
      expect(detectEmail('user.name+filter@domain.co.uk')).toBe(true);
    });

    it('should detect emails embedded in text', () => {
      expect(detectEmail('Contact me at john@example.com for more info')).toBe(true);
      expect(detectEmail('Email: support@company.com')).toBe(true);
    });

    it('should detect emails with various TLDs', () => {
      expect(detectEmail('user@domain.io')).toBe(true);
      expect(detectEmail('user@domain.co')).toBe(true);
      expect(detectEmail('user@domain.museum')).toBe(true);
    });
  });

  describe('negative cases', () => {
    it('should not match incomplete emails', () => {
      expect(detectEmail('john@')).toBe(false);
      expect(detectEmail('@example.com')).toBe(false);
      expect(detectEmail('john@example')).toBe(false);
    });

    it('should not match text without @ symbol', () => {
      expect(detectEmail('john.example.com')).toBe(false);
      expect(detectEmail('not an email')).toBe(false);
    });

    it('should not match plain text', () => {
      expect(detectEmail('Hello world')).toBe(false);
      expect(detectEmail('')).toBe(false);
      expect(detectEmail('12345')).toBe(false);
    });
  });
});

describe('detectPhone', () => {
  describe('positive matches', () => {
    it('should detect standard US phone formats', () => {
      expect(detectPhone('(555) 123-4567')).toBe(true);
      expect(detectPhone('555-123-4567')).toBe(true);
      expect(detectPhone('5551234567')).toBe(true);
    });

    it('should detect phones with country code', () => {
      expect(detectPhone('+1-555-123-4567')).toBe(true);
      expect(detectPhone('+1 555 123 4567')).toBe(true);
      expect(detectPhone('1-555-123-4567')).toBe(true);
    });

    it('should detect phones with dots as separators', () => {
      expect(detectPhone('555.123.4567')).toBe(true);
      expect(detectPhone('1.555.123.4567')).toBe(true);
    });

    it('should detect phones with spaces', () => {
      expect(detectPhone('555 123 4567')).toBe(true);
      expect(detectPhone('(555) 123 4567')).toBe(true);
    });

    it('should detect phones embedded in text', () => {
      expect(detectPhone('Call me at (555) 123-4567 anytime')).toBe(true);
      expect(detectPhone('Phone: 555-123-4567')).toBe(true);
    });

    it('should detect 7-digit local numbers', () => {
      expect(detectPhone('Call 555-1234')).toBe(true);
      expect(detectPhone('5551234')).toBe(true);
    });
  });

  describe('negative cases', () => {
    it('should not match numbers that are too short', () => {
      expect(detectPhone('555-123')).toBe(false);
      expect(detectPhone('12345')).toBe(false);
    });

    it('should not match very short number sequences', () => {
      expect(detectPhone('123-456')).toBe(false);
      expect(detectPhone('12-3456')).toBe(false);
    });

    it('should not match plain text', () => {
      expect(detectPhone('Hello world')).toBe(false);
      expect(detectPhone('')).toBe(false);
      expect(detectPhone('phone number')).toBe(false);
    });
  });
});

describe('detectSSN', () => {
  describe('positive matches', () => {
    it('should detect standard SSN format', () => {
      expect(detectSSN('123-45-6789')).toBe(true);
      expect(detectSSN('234-56-7890')).toBe(true);
    });

    it('should detect SSN with spaces', () => {
      expect(detectSSN('123 45 6789')).toBe(true);
    });

    it('should detect SSN with dots', () => {
      expect(detectSSN('123.45.6789')).toBe(true);
    });

    it('should detect SSN without separators', () => {
      expect(detectSSN('123456789')).toBe(true);
    });

    it('should detect SSN embedded in text', () => {
      expect(detectSSN('SSN: 123-45-6789')).toBe(true);
      expect(detectSSN('My social is 234-56-7890')).toBe(true);
    });
  });

  describe('negative cases', () => {
    it('should not match invalid SSN starting with 000', () => {
      expect(detectSSN('000-12-3456')).toBe(false);
    });

    it('should not match invalid SSN starting with 666', () => {
      expect(detectSSN('666-12-3456')).toBe(false);
    });

    it('should not match invalid SSN starting with 9XX', () => {
      expect(detectSSN('900-12-3456')).toBe(false);
      expect(detectSSN('999-12-3456')).toBe(false);
    });

    it('should not match SSN with 00 in middle group', () => {
      expect(detectSSN('123-00-4567')).toBe(false);
    });

    it('should not match SSN with 0000 in last group', () => {
      expect(detectSSN('123-45-0000')).toBe(false);
    });

    it('should not match numbers that are too short or long', () => {
      expect(detectSSN('12-34-5678')).toBe(false);
      expect(detectSSN('1234-56-7890')).toBe(false);
    });

    it('should not match plain text', () => {
      expect(detectSSN('Hello world')).toBe(false);
      expect(detectSSN('')).toBe(false);
    });
  });
});

describe('detectCreditCard', () => {
  describe('positive matches', () => {
    it('should detect valid Visa test numbers', () => {
      expect(detectCreditCard('4111111111111111')).toBe(true);
      expect(detectCreditCard('4111-1111-1111-1111')).toBe(true);
      expect(detectCreditCard('4111 1111 1111 1111')).toBe(true);
    });

    it('should detect valid Mastercard test numbers', () => {
      expect(detectCreditCard('5500000000000004')).toBe(true);
      expect(detectCreditCard('5500-0000-0000-0004')).toBe(true);
    });

    it('should detect valid Amex test numbers', () => {
      expect(detectCreditCard('378282246310005')).toBe(true);
      expect(detectCreditCard('371449635398431')).toBe(true);
    });

    it('should detect valid Discover test numbers', () => {
      expect(detectCreditCard('6011111111111117')).toBe(true);
    });

    it('should detect cards embedded in text', () => {
      expect(detectCreditCard('Card: 4111-1111-1111-1111')).toBe(true);
      expect(detectCreditCard('Pay with 4111111111111111')).toBe(true);
    });
  });

  describe('negative cases', () => {
    it('should not match numbers failing Luhn check', () => {
      expect(detectCreditCard('1234567890123456')).toBe(false);
      expect(detectCreditCard('1234-5678-9012-3456')).toBe(false);
    });

    it('should not match numbers that are too short', () => {
      expect(detectCreditCard('411111111111')).toBe(false); // 12 digits
      expect(detectCreditCard('12345')).toBe(false);
    });

    it('should not match plain text', () => {
      expect(detectCreditCard('Hello world')).toBe(false);
      expect(detectCreditCard('')).toBe(false);
      expect(detectCreditCard('credit card number')).toBe(false);
    });

    it('should not match random long numbers failing Luhn', () => {
      expect(detectCreditCard('9999999999999999')).toBe(false);
      expect(detectCreditCard('1111111111111112')).toBe(false); // Fails Luhn
    });
  });
});

describe('detectPII', () => {
  describe('single PII type detection', () => {
    it('should detect only email', () => {
      const result = detectPII('Contact: john@example.com');
      expect(result.hasPII).toBe(true);
      expect(result.types).toEqual(['email']);
    });

    it('should detect only phone', () => {
      const result = detectPII('Call: (555) 123-4567');
      expect(result.hasPII).toBe(true);
      expect(result.types).toEqual(['phone']);
    });

    it('should detect only SSN', () => {
      const result = detectPII('SSN: 123-45-6789');
      expect(result.hasPII).toBe(true);
      expect(result.types).toEqual(['ssn']);
    });

    it('should detect only credit card', () => {
      // Use format without dashes to avoid phone pattern match
      const result = detectPII('Card: 4111111111111111');
      expect(result.hasPII).toBe(true);
      expect(result.types).toEqual(['creditCard']);
    });
  });

  describe('multiple PII types detection', () => {
    it('should detect email and phone', () => {
      const result = detectPII('Email: john@example.com, Phone: (555) 123-4567');
      expect(result.hasPII).toBe(true);
      expect(result.types).toContain('email');
      expect(result.types).toContain('phone');
      expect(result.types).toHaveLength(2);
    });

    it('should detect all PII types', () => {
      const text = `
        Email: john@example.com
        Phone: (555) 123-4567
        SSN: 123-45-6789
        Card: 4111-1111-1111-1111
      `;
      const result = detectPII(text);
      expect(result.hasPII).toBe(true);
      expect(result.types).toContain('email');
      expect(result.types).toContain('phone');
      expect(result.types).toContain('ssn');
      expect(result.types).toContain('creditCard');
      expect(result.types).toHaveLength(4);
    });

    it('should detect SSN and credit card', () => {
      const result = detectPII('SSN: 123-45-6789, Card: 4111111111111111');
      expect(result.hasPII).toBe(true);
      expect(result.types).toContain('ssn');
      expect(result.types).toContain('creditCard');
    });
  });

  describe('no PII detection', () => {
    it('should return empty for plain text', () => {
      const result = detectPII('Hello, this is just regular text.');
      expect(result.hasPII).toBe(false);
      expect(result.types).toEqual([]);
    });

    it('should return empty for empty string', () => {
      const result = detectPII('');
      expect(result.hasPII).toBe(false);
      expect(result.types).toEqual([]);
    });

    it('should return empty for numbers that are not PII', () => {
      const result = detectPII('Order #12345, Qty: 100');
      expect(result.hasPII).toBe(false);
      expect(result.types).toEqual([]);
    });
  });

  describe('edge cases', () => {
    it('should handle text with partial matches', () => {
      // These look like PII but aren't valid
      const result = detectPII('john@ and @example.com and 123-45');
      expect(result.hasPII).toBe(false);
    });

    it('should handle multiple occurrences of same PII type', () => {
      const result = detectPII('john@a.com and jane@b.com');
      expect(result.hasPII).toBe(true);
      expect(result.types).toEqual(['email']);
      expect(result.types).toHaveLength(1); // Only counted once
    });

    it('should handle mixed valid and invalid data', () => {
      const result = detectPII('Valid: john@example.com, Invalid: 000-00-0000');
      expect(result.hasPII).toBe(true);
      expect(result.types).toContain('email');
      expect(result.types).not.toContain('ssn'); // Invalid SSN
    });

    it('should handle special characters around PII', () => {
      const result = detectPII('<john@example.com> [555-123-4567]');
      expect(result.hasPII).toBe(true);
      expect(result.types).toContain('email');
      expect(result.types).toContain('phone');
    });

    it('should handle newlines and whitespace', () => {
      const result = detectPII('Email:\n\tjohn@example.com\n\nPhone:\t555-123-4567');
      expect(result.hasPII).toBe(true);
      expect(result.types).toContain('email');
      expect(result.types).toContain('phone');
    });
  });
});
