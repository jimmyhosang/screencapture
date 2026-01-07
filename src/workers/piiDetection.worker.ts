/**
 * Web Worker for PII Detection
 *
 * Offloads expensive PII detection and redaction to a background thread
 * to prevent blocking the main thread during recording.
 */

// =============================================================================
// Types
// =============================================================================

export interface PIIWorkerRequest {
  id: string;
  type: 'redact' | 'analyze';
  text: string;
  config: PIIWorkerConfig;
}

export interface PIIWorkerResponse {
  id: string;
  type: 'redact' | 'analyze';
  result: string | PIIAnalysisResult;
  processingTime: number;
}

export interface PIIWorkerConfig {
  email: boolean;
  phone: boolean;
  ssn: boolean;
  creditCard: boolean;
  ipv4?: boolean;
  ipv6?: boolean;
}

export interface PIIAnalysisResult {
  redactedText: string;
  matchCount: number;
  types: string[];
}

// =============================================================================
// Regex Patterns (duplicated for worker isolation)
// =============================================================================

const PATTERNS = {
  email: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
  phone: /(?<![.\d])(?:\+?1[-.\s]?)?(?:\(?\d{3}\)?[-.\s]?)?\d{3}[-.\s]?\d{4}(?![.\d])/g,
  ssn: /\b(?!000|666|9\d{2})\d{3}[-.\s]?(?!00)\d{2}[-.\s]?(?!0000)\d{4}\b/g,
  creditCard: /\b(?:\d{4}[-.\s]?){3}\d{4}\b|\b\d{13,19}\b/g,
  ipv4: /\b(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\b/g,
  ipv6: /(?:(?:[0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}|(?:[0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}|(?:[0-9a-fA-F]{1,4}:){1,5}(?::[0-9a-fA-F]{1,4}){1,2}|(?:[0-9a-fA-F]{1,4}:){1,4}(?::[0-9a-fA-F]{1,4}){1,3}|(?:[0-9a-fA-F]{1,4}:){1,3}(?::[0-9a-fA-F]{1,4}){1,4}|(?:[0-9a-fA-F]{1,4}:){1,2}(?::[0-9a-fA-F]{1,4}){1,5}|[0-9a-fA-F]{1,4}:(?::[0-9a-fA-F]{1,4}){1,6}|:(?::[0-9a-fA-F]{1,4}){1,7}|(?:[0-9a-fA-F]{1,4}:){1,7}:|::)/g,
};

// =============================================================================
// Luhn Algorithm for Credit Card Validation
// =============================================================================

function isValidLuhn(num: string): boolean {
  const digits = num.replace(/\D/g, '');
  if (digits.length < 13 || digits.length > 19) return false;

  let sum = 0;
  let isEven = false;

  for (let i = digits.length - 1; i >= 0; i--) {
    let digit = parseInt(digits[i], 10);

    if (isEven) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }

    sum += digit;
    isEven = !isEven;
  }

  return sum % 10 === 0;
}

// =============================================================================
// Redaction Functions
// =============================================================================

function redactEmail(text: string): string {
  return text.replace(PATTERNS.email, (match) => {
    const [local, domain] = match.split('@');
    const [domainName, ...tldParts] = domain.split('.');
    const tld = tldParts.join('.');
    return `${local[0]}***@${domainName[0]}***.${tld}`;
  });
}

function redactPhone(text: string): string {
  return text.replace(PATTERNS.phone, (match) => {
    const digits = match.replace(/\D/g, '');
    const last4 = digits.slice(-4);
    return `***-***-${last4}`;
  });
}

function redactSSN(text: string): string {
  return text.replace(PATTERNS.ssn, (match) => {
    const digits = match.replace(/\D/g, '');
    const last4 = digits.slice(-4);
    return `***-**-${last4}`;
  });
}

function redactCreditCard(text: string): string {
  return text.replace(PATTERNS.creditCard, (match) => {
    const digits = match.replace(/\D/g, '');
    if (!isValidLuhn(digits)) return match;
    const last4 = digits.slice(-4);
    return `****-****-****-${last4}`;
  });
}

function redactIPv4(text: string): string {
  return text.replace(PATTERNS.ipv4, (match) => {
    const firstOctet = match.split('.')[0];
    return `${firstOctet}.***.***.**`;
  });
}

function redactIPv6(text: string): string {
  return text.replace(PATTERNS.ipv6, () => '[IPv6 REDACTED]');
}

// =============================================================================
// Main Processing Functions
// =============================================================================

function redactText(text: string, config: PIIWorkerConfig): string {
  let result = text;

  if (config.email) result = redactEmail(result);
  if (config.phone) result = redactPhone(result);
  if (config.ssn) result = redactSSN(result);
  if (config.creditCard) result = redactCreditCard(result);
  if (config.ipv4) result = redactIPv4(result);
  if (config.ipv6) result = redactIPv6(result);

  return result;
}

function analyzeText(text: string, config: PIIWorkerConfig): PIIAnalysisResult {
  const types: string[] = [];
  let matchCount = 0;

  // Count matches for each enabled type
  if (config.email) {
    const matches = text.match(PATTERNS.email);
    if (matches) {
      matchCount += matches.length;
      types.push('email');
    }
  }

  if (config.phone) {
    const matches = text.match(PATTERNS.phone);
    if (matches) {
      matchCount += matches.length;
      types.push('phone');
    }
  }

  if (config.ssn) {
    const matches = text.match(PATTERNS.ssn);
    if (matches) {
      matchCount += matches.length;
      types.push('ssn');
    }
  }

  if (config.creditCard) {
    const matches = text.match(PATTERNS.creditCard);
    if (matches) {
      // Only count valid credit cards
      const validMatches = matches.filter((m) => isValidLuhn(m.replace(/\D/g, '')));
      if (validMatches.length > 0) {
        matchCount += validMatches.length;
        types.push('creditCard');
      }
    }
  }

  if (config.ipv4) {
    const matches = text.match(PATTERNS.ipv4);
    if (matches) {
      matchCount += matches.length;
      types.push('ipv4');
    }
  }

  if (config.ipv6) {
    const matches = text.match(PATTERNS.ipv6);
    if (matches) {
      matchCount += matches.length;
      types.push('ipv6');
    }
  }

  return {
    redactedText: redactText(text, config),
    matchCount,
    types,
  };
}

// =============================================================================
// Worker Message Handler
// =============================================================================

self.onmessage = (event: MessageEvent<PIIWorkerRequest>) => {
  const { id, type, text, config } = event.data;
  const startTime = performance.now();

  let result: string | PIIAnalysisResult;

  if (type === 'redact') {
    result = redactText(text, config);
  } else {
    result = analyzeText(text, config);
  }

  const processingTime = performance.now() - startTime;

  const response: PIIWorkerResponse = {
    id,
    type,
    result,
    processingTime,
  };

  self.postMessage(response);
};

// Signal that worker is ready
self.postMessage({ type: 'ready' });
