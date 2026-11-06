import { describe, it, expect } from 'vitest';
import {
  redactWithConfig,
  redactAll,
  redactPhone,
  analyzeForPII,
  DEFAULT_REDACTION_CONFIG,
} from './redactor';

const redact = (text: string) => redactWithConfig(text, DEFAULT_REDACTION_CONFIG);

describe('redactWithConfig (default config)', () => {
  it('redacts emails, keeping only a hint', () => {
    expect(redact('Contact: jane.doe@example.com')).toBe('Contact: j***@e***.com');
  });

  it('redacts common phone formats, keeping the last 4 digits', () => {
    expect(redact('Phone: (555) 867-5309')).toBe('Phone: ***-***-5309');
    expect(redact('Phone: 555.444.1212')).toBe('Phone: ***-***-1212');
    expect(redact('Phone: +1 555 222 3333')).toBe('Phone: ***-***-3333');
  });

  it('redacts phone numbers at the end of a sentence', () => {
    // Regression: a trailing period used to make the pattern reject the match
    expect(redact('Call 1-800-555-0199.')).toBe('Call ***-***-0199.');
    expect(redact('My number is 555-222-3333.')).toBe('My number is ***-***-3333.');
    expect(redactPhone('Reach me at (555) 867-5309.')).toBe('Reach me at ***-***-5309.');
  });

  it('does not treat decimals or IP addresses as phone numbers', () => {
    expect(redact('Pi is 3.1415926535')).toBe('Pi is 3.1415926535');
    expect(redact('Server at 192.168.100.1')).toBe('Server at 192.168.100.1');
  });

  it('redacts SSNs but skips invalid area numbers', () => {
    expect(redact('SSN: 123-45-6789')).toBe('SSN: ***-**-6789');
    // 9xx is the ITIN range, never a valid SSN
    expect(redact('Ref 987-65-4321')).not.toContain('***-**-');
  });

  it('redacts Luhn-valid card numbers only', () => {
    expect(redact('Card: 4111 1111 1111 1111')).toBe('Card: ****-****-****-1111');
    // Fails Luhn, so it is not redacted as a card (other patterns may still match parts)
    expect(redact('Card: 4111 1111 1111 1112')).not.toContain('****-****-****-');
  });

  it('handles several PII types in one string', () => {
    const out = redactAll('Email a@b.co or call 555-867-5309, SSN 123-45-6789.');
    expect(out).not.toContain('a@b.co');
    expect(out).not.toContain('867-5309');
    expect(out).not.toContain('123-45-6789');
  });

  it('leaves text without PII unchanged', () => {
    const safe = 'This sentence has no personal data. Version 2.0, page 42.';
    expect(redact(safe)).toBe(safe);
  });

  it('respects disabled types', () => {
    const text = 'jane@example.com 555-867-5309';
    const out = redactWithConfig(text, { ...DEFAULT_REDACTION_CONFIG, email: false });
    expect(out).toContain('jane@example.com');
    expect(out).not.toContain('867-5309');
  });
});

describe('analyzeForPII', () => {
  it('reports matches with types and the redacted text', () => {
    const result = analyzeForPII('Mail jane@example.com, call 555-867-5309.');
    const types = result.matches.map((m) => m.type);
    expect(types).toContain('email');
    expect(types).toContain('phone');
    expect(result.redactedText).not.toContain('jane@example.com');
    expect(result.redactedText).not.toContain('867-5309');
  });
});
