import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  redactEmail,
  redactPhone,
  redactSSN,
  redactCreditCard,
  redactAll,
  redactWithConfig,
  DEFAULT_REDACTION_CONFIG,
  // New exports
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
  addCustomPattern,
  removeCustomPattern,
  clearCustomPatterns,
  getCustomPatterns,
  analyzeForPII,
  redactExtended,
  EXTENDED_REDACTION_CONFIG,
} from './redactor';
import type { RedactionConfig, ExtendedRedactionConfig } from './redactor';

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

// =============================================================================
// New Pattern Tests
// =============================================================================

describe('redactIPv4', () => {
  describe('basic redaction', () => {
    it('should redact IPv4 addresses keeping first octet', () => {
      expect(redactIPv4('192.168.1.1')).toBe('192.***.***.**');
      expect(redactIPv4('10.0.0.1')).toBe('10.***.***.**');
      expect(redactIPv4('172.16.0.1')).toBe('172.***.***.**');
    });

    it('should handle IPs embedded in text', () => {
      expect(redactIPv4('Server IP: 192.168.1.100')).toBe('Server IP: 192.***.***.**');
    });

    it('should handle multiple IPs', () => {
      const input = 'Source: 10.0.0.1, Dest: 192.168.1.1';
      expect(redactIPv4(input)).toBe('Source: 10.***.***.**' + ', Dest: 192.***.***.**');
    });
  });

  describe('validation', () => {
    it('should not redact invalid IP addresses', () => {
      expect(redactIPv4('999.999.999.999')).toBe('999.999.999.999');
      expect(redactIPv4('256.1.1.1')).toBe('256.1.1.1');
    });

    it('should handle edge cases', () => {
      expect(redactIPv4('0.0.0.0')).toBe('0.***.***.**');
      expect(redactIPv4('255.255.255.255')).toBe('255.***.***.**');
    });
  });
});

describe('redactIPv6', () => {
  describe('basic redaction', () => {
    it('should redact full IPv6 addresses', () => {
      expect(redactIPv6('2001:0db8:85a3:0000:0000:8a2e:0370:7334')).toBe('[IPv6 REDACTED]');
    });

    it('should handle compressed IPv6', () => {
      expect(redactIPv6('2001:db8::1')).toBe('[IPv6 REDACTED]');
      expect(redactIPv6('::1')).toBe('[IPv6 REDACTED]');
    });

    it('should handle IPv6 in text', () => {
      expect(redactIPv6('Server: 2001:db8::1 online')).toBe('Server: [IPv6 REDACTED] online');
    });
  });
});

describe('redactDateOfBirth', () => {
  describe('US format (MM/DD/YYYY)', () => {
    it('should redact dates in MM/DD/YYYY format', () => {
      expect(redactDateOfBirth('DOB: 01/15/1990')).toBe('DOB: **/**/****');
      expect(redactDateOfBirth('12/31/2000')).toBe('**/**/****');
    });

    it('should handle various separators', () => {
      expect(redactDateOfBirth('01-15-1990')).toBe('**/**/****');
      expect(redactDateOfBirth('01.15.1990')).toBe('**/**/****');
    });
  });

  describe('ISO format (YYYY-MM-DD)', () => {
    it('should redact dates in YYYY-MM-DD format', () => {
      expect(redactDateOfBirth('1990-01-15')).toBe('**/**/****');
      expect(redactDateOfBirth('2000/12/31')).toBe('**/**/****');
    });
  });

  describe('edge cases', () => {
    it('should handle single digit months and days', () => {
      expect(redactDateOfBirth('1/5/1990')).toBe('**/**/****');
    });

    it('should not redact invalid dates', () => {
      expect(redactDateOfBirth('13/45/1990')).toBe('13/45/1990'); // Invalid month
    });
  });
});

describe('redactPassport', () => {
  describe('basic redaction', () => {
    it('should redact US passport format', () => {
      expect(redactPassport('Passport: A12345678')).toBe('Passport: A********');
    });

    it('should handle various country formats', () => {
      expect(redactPassport('AB1234567')).toBe('AB*******');
      expect(redactPassport('C123456789')).toBe('C*********');
    });

    it('should preserve country prefix', () => {
      const result = redactPassport('UK: AB12345678');
      expect(result).toContain('AB');
      expect(result).toContain('********');
    });
  });
});

describe('redactDriverLicense', () => {
  describe('basic redaction', () => {
    it('should redact driver license patterns', () => {
      expect(redactDriverLicense('DL: A1234567')).toBe('DL: A******');
    });

    it('should handle numeric formats', () => {
      const input = 'License: 123-45-6789';
      const result = redactDriverLicense(input);
      expect(result).toContain('REDACTED');
    });
  });
});

describe('redactIBAN', () => {
  describe('basic redaction', () => {
    it('should redact valid IBANs preserving country code', () => {
      // German IBAN (valid checksum)
      expect(redactIBAN('DE89370400440532013000')).toBe('DE********************');
    });

    it('should handle IBANs in text', () => {
      const input = 'Account: DE89370400440532013000';
      expect(redactIBAN(input)).toBe('Account: DE********************');
    });
  });

  describe('validation', () => {
    it('should not redact invalid IBANs', () => {
      // Invalid checksum
      expect(redactIBAN('DE00000000000000000000')).toBe('DE00000000000000000000');
    });
  });
});

describe('redactBankAccount', () => {
  describe('basic redaction', () => {
    it('should redact routing + account patterns', () => {
      expect(redactBankAccount('Account: 123456789-1234567890')).toBe('Account: ****-****-7890');
    });

    it('should preserve last 4 digits', () => {
      const result = redactBankAccount('Bank: 123456789 9876543210');
      expect(result).toContain('3210');
    });
  });
});

describe('redactAPIKey', () => {
  // Note: Stripe key tests removed due to GitHub secret scanning blocking fake test keys
  // The pattern matching is verified through other API key tests below

  describe('GitHub tokens', () => {
    it('should redact GitHub personal access tokens', () => {
      const token = 'ghp_abcdefghijklmnopqrstuvwxyz0123456789';
      const result = redactAPIKey(token);
      expect(result).toBe('ghp_********************');
    });

    it('should redact new GitHub PAT format', () => {
      const token = 'github_pat_abcdefghijklmnopqrstuvwx';
      const result = redactAPIKey(token);
      expect(result).toBe('github_pat_********************');
    });
  });

  describe('AWS keys', () => {
    it('should redact AWS access key IDs', () => {
      const key = 'AKIAIOSFODNN7EXAMPLE';
      const result = redactAPIKey(key);
      expect(result).toBe('AKIA********************');
    });
  });

  describe('Slack tokens', () => {
    it('should redact Slack bot tokens', () => {
      const token = 'xoxb-123456789012-1234567890123-abcdefghij';
      const result = redactAPIKey(token);
      expect(result).toBe('xoxb-********************');
    });
  });

  describe('Google API keys', () => {
    it('should redact Google API keys', () => {
      const key = 'AIzaSyDaGmWKa4JsXZ-HjGw7ISLn_3namBGewQe';
      const result = redactAPIKey(key);
      expect(result).toBe('AIza********************');
    });
  });
});

describe('redactName', () => {
  describe('context-based detection', () => {
    it('should redact names preceded by "Name:"', () => {
      expect(redactName('Name: John Smith')).toBe('Name: J.S.');
    });

    it('should redact names preceded by "name:"', () => {
      expect(redactName('name: Jane Doe')).toBe('name: J.D.');
    });

    it('should handle "Full Name:"', () => {
      expect(redactName('Full Name: John Michael Smith')).toBe('Full Name: J.M.S.');
    });

    it('should handle "First Name:" and "Last Name:"', () => {
      expect(redactName('First Name: John')).toBe('First Name: J.');
      expect(redactName('Last Name: Smith')).toBe('Last Name: S.');
    });
  });

  describe('non-name text', () => {
    it('should not redact text without name context', () => {
      expect(redactName('Hello John Smith')).toBe('Hello John Smith');
    });
  });
});

describe('redactCurrency', () => {
  describe('with symbols', () => {
    it('should redact dollar amounts', () => {
      expect(redactCurrency('$1,234.56')).toBe('$***.** ');
      expect(redactCurrency('Total: $500.00')).toBe('Total: $***.** ');
    });

    it('should redact euro amounts', () => {
      expect(redactCurrency('€1,234.56')).toBe('€***.** ');
    });

    it('should redact pound amounts', () => {
      expect(redactCurrency('£500.00')).toBe('£***.** ');
    });

    it('should redact yen amounts', () => {
      expect(redactCurrency('¥10,000')).toBe('¥***.** ');
    });
  });

  describe('with currency codes', () => {
    it('should redact USD amounts', () => {
      expect(redactCurrency('USD 1,234.56')).toBe('USD***.** ');
    });
  });

  describe('with text suffixes', () => {
    it('should redact amounts followed by "dollars"', () => {
      expect(redactCurrency('500 dollars')).toBe('[AMOUNT REDACTED]');
      expect(redactCurrency('1,000 euros')).toBe('[AMOUNT REDACTED]');
    });
  });
});

// =============================================================================
// Custom Pattern Tests
// =============================================================================

describe('Custom Patterns', () => {
  beforeEach(() => {
    clearCustomPatterns();
  });

  afterEach(() => {
    clearCustomPatterns();
  });

  describe('addCustomPattern', () => {
    it('should add a custom pattern', () => {
      addCustomPattern('employeeId', /\bEMP-\d{6}\b/, () => 'EMP-******');
      const patterns = getCustomPatterns();
      expect(patterns.has('employeeId')).toBe(true);
    });

    it('should use custom pattern in redaction', () => {
      addCustomPattern('employeeId', /\bEMP-\d{6}\b/, () => 'EMP-******');

      const config: ExtendedRedactionConfig = {
        email: false,
        phone: false,
        ssn: false,
        creditCard: false,
        customPatterns: ['employeeId'],
      };

      const result = redactWithConfig('Employee: EMP-123456', config);
      expect(result).toBe('Employee: EMP-******');
    });

    it('should handle patterns without global flag', () => {
      addCustomPattern('test', /TEST-\d+/, () => 'TEST-***');
      const patterns = getCustomPatterns();
      const pattern = patterns.get('test');
      expect(pattern?.regex.flags).toContain('g');
    });
  });

  describe('removeCustomPattern', () => {
    it('should remove an existing pattern', () => {
      addCustomPattern('temp', /temp/, () => '***');
      expect(removeCustomPattern('temp')).toBe(true);
      expect(getCustomPatterns().has('temp')).toBe(false);
    });

    it('should return false for non-existent pattern', () => {
      expect(removeCustomPattern('nonexistent')).toBe(false);
    });
  });

  describe('clearCustomPatterns', () => {
    it('should remove all custom patterns', () => {
      addCustomPattern('a', /a/, () => '*');
      addCustomPattern('b', /b/, () => '*');
      clearCustomPatterns();
      expect(getCustomPatterns().size).toBe(0);
    });
  });

  describe('custom pattern with confidence', () => {
    it('should use specified confidence level', () => {
      addCustomPattern('highConf', /HIGH-\d+/, () => 'HIGH-***', 'high');

      const config: ExtendedRedactionConfig = {
        email: false,
        phone: false,
        ssn: false,
        creditCard: false,
        customPatterns: ['highConf'],
        minConfidence: 'high',
      };

      const result = analyzeForPII('Code: HIGH-12345', config);
      expect(result.matches.length).toBe(1);
      expect(result.matches[0].confidence).toBe('high');
    });
  });
});

// =============================================================================
// Confidence Scoring Tests
// =============================================================================

describe('Confidence Scoring', () => {
  describe('analyzeForPII', () => {
    it('should return confidence levels for matches', () => {
      const result = analyzeForPII('Email: john@example.com', {
        email: true,
        phone: false,
        ssn: false,
        creditCard: false,
      });

      expect(result.matches.length).toBe(1);
      expect(result.matches[0].confidence).toBe('high'); // Has context "Email:"
    });

    it('should return summary of matches', () => {
      const result = analyzeForPII('john@a.com, jane@b.com', {
        email: true,
        phone: false,
        ssn: false,
        creditCard: false,
      });

      expect(result.summary.email).toBe(2);
    });

    it('should return redacted text', () => {
      const result = analyzeForPII('SSN: 123-45-6789', {
        email: false,
        phone: false,
        ssn: true,
        creditCard: false,
      });

      expect(result.redactedText).toBe('SSN: ***-**-6789');
    });
  });

  describe('minConfidence filtering', () => {
    it('should filter out low confidence matches when minConfidence is medium', () => {
      const config: ExtendedRedactionConfig = {
        email: false,
        phone: false,
        ssn: false,
        creditCard: false,
        dateOfBirth: true,
        minConfidence: 'medium',
      };

      // Date without context has low confidence
      const result = analyzeForPII('01/15/1990', config);
      expect(result.matches.length).toBe(0);
    });

    it('should include high confidence matches when minConfidence is high', () => {
      const config: ExtendedRedactionConfig = {
        email: false,
        phone: false,
        ssn: false,
        creditCard: true,
        minConfidence: 'high',
      };

      // Credit card passes Luhn = high confidence
      const result = analyzeForPII('Card: 4111111111111111', config);
      expect(result.matches.length).toBe(1);
    });

    it('should include all matches when minConfidence is low', () => {
      const config: ExtendedRedactionConfig = {
        email: false,
        phone: false,
        ssn: false,
        creditCard: false,
        dateOfBirth: true,
        minConfidence: 'low',
      };

      const result = analyzeForPII('01/15/1990', config);
      expect(result.matches.length).toBe(1);
    });
  });

  describe('context-based confidence boost', () => {
    it('should have high confidence when email has "Email:" prefix', () => {
      const result = analyzeForPII('Email: test@example.com', {
        email: true,
        phone: false,
        ssn: false,
        creditCard: false,
      });

      expect(result.matches[0].confidence).toBe('high');
    });

    it('should have high confidence when phone has "Phone:" prefix', () => {
      const result = analyzeForPII('Phone: 555-123-4567', {
        email: false,
        phone: true,
        ssn: false,
        creditCard: false,
      });

      expect(result.matches[0].confidence).toBe('high');
    });

    it('should have high confidence when SSN has "SSN:" prefix', () => {
      const result = analyzeForPII('SSN: 123-45-6789', {
        email: false,
        phone: false,
        ssn: true,
        creditCard: false,
      });

      expect(result.matches[0].confidence).toBe('high');
    });
  });
});

// =============================================================================
// Extended Redaction Tests
// =============================================================================

describe('redactExtended', () => {
  it('should redact all extended patterns with default config', () => {
    const input = `
      Email: john@example.com
      IP: 192.168.1.1
      Name: John Smith
      Amount: $1,234.56
    `;

    const result = redactExtended(input, EXTENDED_REDACTION_CONFIG);

    expect(result).toContain('j***@e***.com');
    expect(result).toContain('192.***.***.**');
    expect(result).toContain('J.S.');
    expect(result).toContain('$***.** ');
  });

  it('should handle selective extended config', () => {
    const config: ExtendedRedactionConfig = {
      email: true,
      phone: false,
      ssn: false,
      creditCard: false,
      ipv4: true,
      ipv6: false,
    };

    const input = 'Email: john@example.com, IP: 192.168.1.1, Phone: 555-123-4567';
    const result = redactExtended(input, config);

    expect(result).toContain('j***@e***.com');
    expect(result).toContain('192.***.***.**');
    expect(result).toContain('555-123-4567'); // Not redacted
  });
});

// =============================================================================
// Integration Tests
// =============================================================================

describe('Integration', () => {
  describe('multiple pattern types', () => {
    it('should handle document with various PII types', () => {
      const document = `
        Customer Profile
        ================
        Name: John Smith
        Email: john.smith@company.com
        Phone: (555) 123-4567
        SSN: 123-45-6789
        DOB: 01/15/1990
        IP Address: 192.168.1.100
        API Key: ghp_abcdefghijklmnopqrstuvwxyz0123456789
        Balance: $1,234.56
      `;

      const result = analyzeForPII(document, EXTENDED_REDACTION_CONFIG);

      expect(result.summary.email).toBe(1);
      expect(result.summary.phone).toBe(1);
      expect(result.summary.ssn).toBe(1);
      expect(result.summary.name).toBe(1);
      expect(result.summary.ipv4).toBe(1);
      expect(result.summary.apiKey).toBe(1);
      expect(result.summary.currency).toBe(1);
    });
  });

  describe('backward compatibility', () => {
    it('should work with original RedactionConfig', () => {
      const config: RedactionConfig = {
        email: true,
        phone: true,
        ssn: true,
        creditCard: true,
      };

      const result = redactWithConfig('john@example.com, 555-123-4567', config);
      expect(result).toContain('j***@e***.com');
      expect(result).toContain('***-***-4567');
    });

    it('should maintain original function behavior', () => {
      // Original functions should work exactly as before
      expect(redactEmail('john@example.com')).toBe('j***@e***.com');
      expect(redactPhone('555-123-4567')).toBe('***-***-4567');
      expect(redactSSN('123-45-6789')).toBe('***-**-6789');
      expect(redactCreditCard('4111111111111111')).toBe('****-****-****-1111');
    });
  });
});
