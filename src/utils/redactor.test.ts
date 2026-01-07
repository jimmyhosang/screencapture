import { describe, it, expect } from 'vitest';
import {
  redactEmail,
  redactPhone,
  redactSSN,
  redactCreditCard,
  redactAll,
  redactWithConfig,
  DEFAULT_REDACTION_CONFIG,
} from './redactor';
import type { RedactionConfig } from './redactor';

describe('redactEmail', () => {
  describe('basic redaction', () => {
    it('should redact standard email addresses', () => {
      expect(redactEmail('john@example.com')).toBe('j***@e***.com');
      expect(redactEmail('jane.doe@company.org')).toBe('j***@c***.org');
    });

    it('should preserve first character of local part', () => {
      expect(redactEmail('a@b.com')).toBe('a***@b***.com');
      expect(redactEmail('zebra@domain.net')).toBe('z***@d***.net');
    });

    it('should preserve TLD', () => {
      expect(redactEmail('user@domain.io')).toBe('u***@d***.io');
      expect(redactEmail('user@domain.co.uk')).toBe('u***@d***.uk');
    });

    it('should handle emails embedded in text', () => {
      expect(redactEmail('Contact me at john@example.com for help')).toBe(
        'Contact me at j***@e***.com for help'
      );
    });
  });

  describe('multiple emails', () => {
    it('should redact all emails in text', () => {
      const input = 'Email john@a.com or jane@b.org';
      const result = redactEmail(input);
      expect(result).toBe('Email j***@a***.com or j***@b***.org');
    });
  });

  describe('non-email text', () => {
    it('should pass through text without emails unchanged', () => {
      expect(redactEmail('Hello world')).toBe('Hello world');
      expect(redactEmail('No email here')).toBe('No email here');
      expect(redactEmail('')).toBe('');
    });
  });
});

describe('redactPhone', () => {
  describe('basic redaction', () => {
    it('should redact phone numbers keeping last 4 digits', () => {
      expect(redactPhone('(555) 123-4567')).toBe('***-***-4567');
      expect(redactPhone('555-123-4567')).toBe('***-***-4567');
      expect(redactPhone('5551234567')).toBe('***-***-4567');
    });

    it('should handle phones with country code', () => {
      expect(redactPhone('+1-555-123-4567')).toBe('***-***-4567');
      expect(redactPhone('1-555-123-4567')).toBe('***-***-4567');
    });

    it('should handle various separators', () => {
      expect(redactPhone('555.123.4567')).toBe('***-***-4567');
      expect(redactPhone('555 123 4567')).toBe('***-***-4567');
    });

    it('should handle phones embedded in text', () => {
      expect(redactPhone('Call me at (555) 123-4567 anytime')).toBe(
        'Call me at ***-***-4567 anytime'
      );
    });
  });

  describe('multiple phones', () => {
    it('should redact all phone numbers in text', () => {
      const input = 'Home: 555-111-2222, Work: 555-333-4444';
      const result = redactPhone(input);
      expect(result).toBe('Home: ***-***-2222, Work: ***-***-4444');
    });
  });

  describe('non-phone text', () => {
    it('should pass through text without phones unchanged', () => {
      expect(redactPhone('Hello world')).toBe('Hello world');
      expect(redactPhone('123-456')).toBe('123-456'); // Too short
      expect(redactPhone('')).toBe('');
    });
  });
});

describe('redactSSN', () => {
  describe('basic redaction', () => {
    it('should redact SSNs keeping last 4 digits', () => {
      expect(redactSSN('123-45-6789')).toBe('***-**-6789');
      expect(redactSSN('234-56-7890')).toBe('***-**-7890');
    });

    it('should handle various separators', () => {
      expect(redactSSN('123 45 6789')).toBe('***-**-6789');
      expect(redactSSN('123.45.6789')).toBe('***-**-6789');
      expect(redactSSN('123456789')).toBe('***-**-6789');
    });

    it('should handle SSNs embedded in text', () => {
      expect(redactSSN('SSN: 123-45-6789')).toBe('SSN: ***-**-6789');
      expect(redactSSN('My SSN is 234-56-7890, thanks')).toBe(
        'My SSN is ***-**-7890, thanks'
      );
    });
  });

  describe('multiple SSNs', () => {
    it('should redact all SSNs in text', () => {
      const input = 'SSN1: 123-45-6789, SSN2: 234-56-7890';
      const result = redactSSN(input);
      expect(result).toBe('SSN1: ***-**-6789, SSN2: ***-**-7890');
    });
  });

  describe('invalid SSNs', () => {
    it('should not redact invalid SSNs', () => {
      expect(redactSSN('000-12-3456')).toBe('000-12-3456'); // Starts with 000
      expect(redactSSN('666-12-3456')).toBe('666-12-3456'); // Starts with 666
      expect(redactSSN('900-12-3456')).toBe('900-12-3456'); // Starts with 9XX
    });
  });

  describe('non-SSN text', () => {
    it('should pass through text without SSNs unchanged', () => {
      expect(redactSSN('Hello world')).toBe('Hello world');
      expect(redactSSN('12-34-5678')).toBe('12-34-5678'); // Wrong format
      expect(redactSSN('')).toBe('');
    });
  });
});

describe('redactCreditCard', () => {
  describe('basic redaction', () => {
    it('should redact credit cards keeping last 4 digits', () => {
      expect(redactCreditCard('4111111111111111')).toBe('****-****-****-1111');
      expect(redactCreditCard('4111-1111-1111-1111')).toBe('****-****-****-1111');
    });

    it('should handle various separators', () => {
      expect(redactCreditCard('4111 1111 1111 1111')).toBe('****-****-****-1111');
      expect(redactCreditCard('5500-0000-0000-0004')).toBe('****-****-****-0004');
    });

    it('should handle cards embedded in text', () => {
      expect(redactCreditCard('Card: 4111111111111111')).toBe(
        'Card: ****-****-****-1111'
      );
    });
  });

  describe('Luhn validation', () => {
    it('should not redact numbers failing Luhn check', () => {
      expect(redactCreditCard('1234567890123456')).toBe('1234567890123456');
      expect(redactCreditCard('1111111111111112')).toBe('1111111111111112');
    });

    it('should redact valid test card numbers', () => {
      // Visa test
      expect(redactCreditCard('4111111111111111')).toBe('****-****-****-1111');
      // Mastercard test
      expect(redactCreditCard('5500000000000004')).toBe('****-****-****-0004');
      // Discover test
      expect(redactCreditCard('6011111111111117')).toBe('****-****-****-1117');
    });
  });

  describe('multiple cards', () => {
    it('should redact all valid cards in text', () => {
      const input = 'Card1: 4111111111111111, Card2: 5500000000000004';
      const result = redactCreditCard(input);
      expect(result).toBe('Card1: ****-****-****-1111, Card2: ****-****-****-0004');
    });
  });

  describe('non-card text', () => {
    it('should pass through text without cards unchanged', () => {
      expect(redactCreditCard('Hello world')).toBe('Hello world');
      expect(redactCreditCard('123456789012')).toBe('123456789012'); // Too short
      expect(redactCreditCard('')).toBe('');
    });
  });
});

describe('redactAll', () => {
  describe('single PII type', () => {
    it('should redact emails', () => {
      expect(redactAll('Email: john@example.com')).toBe('Email: j***@e***.com');
    });

    it('should redact phones', () => {
      expect(redactAll('Phone: 555-123-4567')).toBe('Phone: ***-***-4567');
    });

    it('should redact SSNs', () => {
      expect(redactAll('SSN: 123-45-6789')).toBe('SSN: ***-**-6789');
    });

    it('should redact credit cards', () => {
      expect(redactAll('Card: 4111111111111111')).toBe('Card: ****-****-****-1111');
    });
  });

  describe('multiple PII types', () => {
    it('should redact all PII types in one string', () => {
      const input = 'Email: john@example.com, SSN: 123-45-6789';
      const result = redactAll(input);
      expect(result).toBe('Email: j***@e***.com, SSN: ***-**-6789');
    });

    it('should redact all four types', () => {
      const input = `
        Email: john@example.com
        Phone: 555-123-4567
        SSN: 123-45-6789
        Card: 4111111111111111
      `;
      const result = redactAll(input);
      expect(result).toContain('j***@e***.com');
      expect(result).toContain('***-***-4567');
      expect(result).toContain('***-**-6789');
      expect(result).toContain('****-****-****-1111');
    });
  });

  describe('non-PII text', () => {
    it('should pass through text without PII unchanged', () => {
      expect(redactAll('Hello world, no PII here!')).toBe('Hello world, no PII here!');
      expect(redactAll('')).toBe('');
    });
  });

  describe('preserves structure', () => {
    it('should preserve surrounding text and punctuation', () => {
      const input = 'Contact john@example.com (urgent)';
      const result = redactAll(input);
      expect(result).toBe('Contact j***@e***.com (urgent)');
    });

    it('should preserve whitespace', () => {
      const input = '  SSN:   123-45-6789  ';
      const result = redactAll(input);
      expect(result).toBe('  SSN:   ***-**-6789  ');
    });
  });
});

describe('redactWithConfig', () => {
  describe('selective redaction', () => {
    it('should only redact enabled types', () => {
      const config: RedactionConfig = {
        email: true,
        phone: false,
        ssn: false,
        creditCard: false,
      };
      const input = 'Email: john@example.com, Phone: 555-123-4567';
      const result = redactWithConfig(input, config);
      expect(result).toBe('Email: j***@e***.com, Phone: 555-123-4567');
    });

    it('should redact only phone when configured', () => {
      const config: RedactionConfig = {
        email: false,
        phone: true,
        ssn: false,
        creditCard: false,
      };
      const input = 'Email: john@example.com, Phone: 555-123-4567';
      const result = redactWithConfig(input, config);
      expect(result).toBe('Email: john@example.com, Phone: ***-***-4567');
    });

    it('should redact only SSN when configured', () => {
      const config: RedactionConfig = {
        email: false,
        phone: false,
        ssn: true,
        creditCard: false,
      };
      const input = 'SSN: 123-45-6789, Card: 4111111111111111';
      const result = redactWithConfig(input, config);
      expect(result).toBe('SSN: ***-**-6789, Card: 4111111111111111');
    });

    it('should redact only credit card when configured', () => {
      const config: RedactionConfig = {
        email: false,
        phone: false,
        ssn: false,
        creditCard: true,
      };
      const input = 'SSN: 123-45-6789, Card: 4111111111111111';
      const result = redactWithConfig(input, config);
      expect(result).toBe('SSN: 123-45-6789, Card: ****-****-****-1111');
    });
  });

  describe('all disabled', () => {
    it('should return original text when all disabled', () => {
      const config: RedactionConfig = {
        email: false,
        phone: false,
        ssn: false,
        creditCard: false,
      };
      const input = 'Email: john@example.com, SSN: 123-45-6789';
      const result = redactWithConfig(input, config);
      expect(result).toBe(input);
    });
  });

  describe('default config', () => {
    it('should redact all with default config', () => {
      const input = 'Email: john@example.com, SSN: 123-45-6789';
      const result = redactWithConfig(input, DEFAULT_REDACTION_CONFIG);
      expect(result).toBe('Email: j***@e***.com, SSN: ***-**-6789');
    });
  });

  describe('multiple enabled types', () => {
    it('should redact email and SSN only', () => {
      const config: RedactionConfig = {
        email: true,
        phone: false,
        ssn: true,
        creditCard: false,
      };
      const input = 'john@example.com, 555-123-4567, 123-45-6789, 4111111111111111';
      const result = redactWithConfig(input, config);
      expect(result).toContain('j***@e***.com');
      expect(result).toContain('555-123-4567'); // Not redacted
      expect(result).toContain('***-**-6789');
      expect(result).toContain('4111111111111111'); // Not redacted
    });
  });
});

describe('edge cases', () => {
  describe('overlapping patterns', () => {
    it('should handle text where patterns might overlap', () => {
      // This tests that our overlap handling works
      const result = redactAll('Contact: john@example.com');
      expect(result).toBe('Contact: j***@e***.com');
    });
  });

  describe('special characters', () => {
    it('should handle PII surrounded by special characters', () => {
      expect(redactAll('<john@example.com>')).toBe('<j***@e***.com>');
      expect(redactAll('[SSN: 123-45-6789]')).toBe('[SSN: ***-**-6789]');
    });
  });

  describe('multiline text', () => {
    it('should handle multiline input', () => {
      const input = `Name: John Doe
Email: john@example.com
Phone: 555-123-4567
SSN: 123-45-6789`;
      const result = redactAll(input);
      expect(result).toContain('j***@e***.com');
      expect(result).toContain('***-***-4567');
      expect(result).toContain('***-**-6789');
    });
  });

  describe('repeated PII', () => {
    it('should redact repeated instances', () => {
      const input = 'john@example.com appears twice: john@example.com';
      const result = redactAll(input);
      expect(result).toBe('j***@e***.com appears twice: j***@e***.com');
    });
  });

  describe('adjacent PII', () => {
    it('should handle PII items close together', () => {
      const input = 'john@a.com jane@b.com';
      const result = redactAll(input);
      expect(result).toBe('j***@a***.com j***@b***.com');
    });
  });

  describe('mixed valid and invalid', () => {
    it('should only redact valid PII', () => {
      const input = 'Valid: 123-45-6789, Invalid: 000-00-0000';
      const result = redactSSN(input);
      expect(result).toBe('Valid: ***-**-6789, Invalid: 000-00-0000');
    });
  });
});
