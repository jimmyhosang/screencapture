# Security Documentation

This document describes the security architecture, data handling practices, and recommendations for production deployment of the React Session Recording library.

## Table of Contents

- [Data Capture Overview](#data-capture-overview)
- [PII Redaction](#pii-redaction)
- [Data Storage](#data-storage)
- [Threat Model](#threat-model)
- [Production Recommendations](#production-recommendations)
- [Compliance Considerations](#compliance-considerations)
- [Incident Response](#incident-response)

## Data Capture Overview

### What Data Is Captured

Session recording captures DOM mutations and user interactions to enable session replay:

| Data Type | Description | Captured By Default |
|-----------|-------------|---------------------|
| DOM Structure | HTML elements and attributes | Yes |
| Text Content | Visible text on the page | Yes (redacted) |
| Input Values | Form field values | Yes (masked) |
| Mouse Movement | Cursor position coordinates | Yes |
| Mouse Clicks | Click events and targets | Yes |
| Scroll Position | Viewport scroll coordinates | Yes |
| Keyboard Events | Input timing (not keystrokes) | Yes |
| Network Requests | Not captured | No |
| Console Logs | Optional via plugin | No |
| Canvas Content | Images rendered on canvas | Optional |

### What Data Is NOT Captured

- Passwords (always masked by rrweb)
- Network request/response bodies
- Cookies or session tokens
- Local storage contents
- JavaScript memory/variables
- Browser extensions content

## PII Redaction

### Built-in PII Detection

The library automatically detects and redacts common PII patterns:

| PII Type | Pattern Examples | Replacement |
|----------|------------------|-------------|
| Email | user@domain.com | [EMAIL REDACTED] |
| Phone | (555) 123-4567, +1-555-123-4567 | [PHONE REDACTED] |
| SSN | 123-45-6789 | [SSN REDACTED] |
| Credit Card | 4111-1111-1111-1111 | [CREDIT_CARD REDACTED] |

### Redaction Confidence Levels

PII matches are assigned confidence levels:

- **High**: Pattern matches with validation (e.g., Luhn check for credit cards)
- **Medium**: Pattern matches format but lacks secondary validation
- **Low**: Possible match that may be a false positive

### Redaction Processing

```
User Action → DOM Mutation → Text Extracted → PII Detection → Redaction → Event Stored
                                    ↓
                           Custom Patterns Applied
                                    ↓
                           Confidence Scoring
```

### Limitations

Redaction is pattern-based and cannot guarantee 100% PII removal:

- **Names**: Personal names are not automatically detected (too many false positives)
- **Addresses**: Street addresses are not automatically detected
- **Custom Identifiers**: Application-specific IDs require custom patterns
- **Images**: Text in images (canvas, screenshots) is not redacted
- **Obfuscated Data**: Encoded or encrypted PII is not detected

**Recommendation**: Use block selectors for known sensitive areas rather than relying solely on pattern matching.

## Data Storage

### Client-Side Storage

By default, recorded events are stored in memory:

```typescript
// Events stored in React state
const [events, setEvents] = useState<eventWithTime[]>([]);
```

Optional localStorage persistence:

```typescript
// Uses localStorage via sessionStorage utility
localStorage.setItem('sessions', JSON.stringify(compressedEvents));
```

### Storage Security Considerations

| Storage Method | Persistence | Security Level | Recommendation |
|----------------|-------------|----------------|----------------|
| Memory (default) | Tab lifetime | High | Development only |
| localStorage | Permanent | Low | Not for production |
| sessionStorage | Tab lifetime | Medium | Testing only |
| IndexedDB | Permanent | Low | Not for production |
| Server upload | Depends | High | Production |

### Data Retention

- **Memory**: Cleared when tab closes
- **localStorage**: Persists until explicitly cleared
- **Server**: Follow your organization's retention policy

## Threat Model

### Threats Addressed

| Threat | Mitigation |
|--------|------------|
| PII in recordings | Automatic redaction, block selectors |
| Unauthorized playback | Access control (implement at app level) |
| Data interception | HTTPS for upload (implement at app level) |
| XSS via recordings | rrweb sanitizes replay content |

### Threats NOT Addressed

| Threat | Required Mitigation |
|--------|---------------------|
| Malicious extensions | Cannot prevent extension access to DOM |
| Compromised browser | Client-side security limitations |
| Physical access | Device-level security required |
| Server-side breaches | Server security measures required |

### Attack Vectors

#### DOM Injection
**Risk**: Attacker injects content that gets recorded
**Mitigation**: Standard XSS prevention (CSP, sanitization)

#### Replay XSS
**Risk**: Malicious content in recording executes during playback
**Mitigation**: rrweb-player sandboxes replay in iframe with sandbox attributes

#### Data Exfiltration
**Risk**: Recording data sent to unauthorized server
**Mitigation**: Implement server-side validation, CORS policies

## Production Recommendations

### 1. Server-Side Storage

Never store recordings in localStorage for production:

```typescript
// DO: Upload to secure backend
async function uploadSession(events: eventWithTime[]) {
  const response = await fetch('/api/sessions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${authToken}`,
    },
    body: JSON.stringify({
      events: compress(events),
      timestamp: Date.now(),
    }),
  });
  return response.json();
}

// DON'T: Store locally in production
localStorage.setItem('sessions', JSON.stringify(events)); // UNSAFE
```

### 2. Access Control

Implement authentication for playback:

```typescript
// Server-side session retrieval with auth
app.get('/api/sessions/:id', authenticate, authorize, async (req, res) => {
  const session = await Session.findById(req.params.id);

  // Verify user has access to this session
  if (!canAccessSession(req.user, session)) {
    return res.status(403).json({ error: 'Unauthorized' });
  }

  res.json(session);
});
```

### 3. Encryption at Rest

Encrypt stored recordings:

```typescript
// Server-side encryption before storage
import crypto from 'crypto';

function encryptSession(events: eventWithTime[], key: Buffer): string {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);

  let encrypted = cipher.update(JSON.stringify(events), 'utf8', 'base64');
  encrypted += cipher.final('base64');

  return JSON.stringify({
    iv: iv.toString('base64'),
    data: encrypted,
    tag: cipher.getAuthTag().toString('base64'),
  });
}
```

### 4. Audit Logging

Log access to recordings:

```typescript
// Log all session access
async function logSessionAccess(userId: string, sessionId: string, action: string) {
  await AuditLog.create({
    userId,
    sessionId,
    action, // 'view', 'download', 'delete'
    timestamp: new Date(),
    ip: request.ip,
    userAgent: request.headers['user-agent'],
  });
}
```

### 5. Data Retention Policy

Implement automatic cleanup:

```typescript
// Delete sessions older than retention period
async function cleanupOldSessions(retentionDays: number) {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - retentionDays);

  await Session.deleteMany({
    createdAt: { $lt: cutoff },
  });
}

// Run daily
setInterval(() => cleanupOldSessions(30), 24 * 60 * 60 * 1000);
```

### 6. User Consent

Always obtain consent before recording:

```tsx
function ConsentBanner({ onAccept, onDecline }) {
  return (
    <div className="consent-banner">
      <p>
        We record sessions to improve your experience.
        Personal information is automatically removed.
        <a href="/privacy">Learn more</a>
      </p>
      <button onClick={onAccept}>Accept</button>
      <button onClick={onDecline}>Decline</button>
    </div>
  );
}

function App() {
  const [hasConsent, setHasConsent] = useState(false);

  return (
    <>
      {!hasConsent && (
        <ConsentBanner
          onAccept={() => setHasConsent(true)}
          onDecline={() => setHasConsent(false)}
        />
      )}
      {hasConsent && <RecordingProvider>...</RecordingProvider>}
    </>
  );
}
```

## Compliance Considerations

### HIPAA (Healthcare)

For applications handling Protected Health Information (PHI):

1. **Business Associate Agreement**: Required if vendor stores PHI
2. **Encryption**: AES-256 for data at rest and TLS 1.2+ in transit
3. **Access Controls**: Role-based access with audit logging
4. **Data Retention**: Follow minimum necessary principle

```typescript
import { HIPAA_CONFIG } from './examples/AdvancedIntegration';

// Additional HIPAA patterns
registerPattern({
  name: 'mrn',
  pattern: /MRN[:\s]*\d{7,10}/gi,
  replacement: '[MRN REDACTED]',
  category: 'medical',
  priority: 20,
});
```

### PCI DSS (Payment)

For applications processing payment card data:

1. **Never Store**: CVV/CVC must never be stored
2. **Mask PANs**: Show only last 4 digits
3. **Encryption**: Strong encryption for cardholder data
4. **Network Segmentation**: Isolate cardholder data environment

```typescript
import { PCI_DSS_CONFIG } from './examples/AdvancedIntegration';

// Block entire payment forms
const config = {
  blockSelectors: [
    '#payment-form',
    '.credit-card-input',
    '[data-payment]',
  ],
};
```

### GDPR (EU Data Protection)

For applications processing EU personal data:

1. **Legal Basis**: Obtain consent or establish legitimate interest
2. **Data Subject Rights**: Enable data access and deletion
3. **Data Protection Officer**: Appoint if required
4. **Cross-Border Transfers**: Ensure adequate protections

```typescript
// Implement right to erasure
async function deleteUserData(userId: string) {
  // Delete all sessions for user
  await Session.deleteMany({ userId });

  // Log deletion for compliance
  await AuditLog.create({
    action: 'gdpr_erasure',
    userId,
    timestamp: new Date(),
  });
}
```

### CCPA (California)

For applications handling California consumer data:

1. **Disclosure**: Inform consumers about data collection
2. **Opt-Out**: Provide clear opt-out mechanism
3. **Non-Discrimination**: Don't discriminate against opt-outs
4. **Data Access**: Provide data upon request

## Incident Response

### If PII Is Exposed

1. **Stop Recording**: Immediately disable recording
   ```typescript
   stopRecording();
   ```

2. **Assess Scope**: Identify affected sessions and users

3. **Delete Affected Data**: Remove sessions containing exposed PII
   ```typescript
   await Session.deleteMany({
     createdAt: { $gte: incidentStart, $lte: incidentEnd }
   });
   ```

4. **Notify**: Follow breach notification requirements (72 hours for GDPR)

5. **Remediate**: Fix the root cause before re-enabling

### Contact

Report security issues to: [your-security-email@company.com]

## Security Checklist

Before deploying to production:

- [ ] PII redaction tested with representative data
- [ ] Block selectors configured for all sensitive areas
- [ ] User consent mechanism implemented
- [ ] Server-side storage with encryption
- [ ] Access controls and authentication
- [ ] Audit logging enabled
- [ ] Data retention policy configured
- [ ] Backup and recovery procedures
- [ ] Incident response plan documented
- [ ] Compliance requirements reviewed

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0.0 | 2024-01-01 | Initial security documentation |
