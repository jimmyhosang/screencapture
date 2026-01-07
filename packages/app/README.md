# React Session Recording with Privacy

A React session recording and replay library built on [rrweb](https://www.rrweb.io/) with built-in PII redaction and privacy controls. Capture user sessions for debugging, UX research, and support while protecting sensitive data.

## Features

- **Session Recording**: Capture DOM mutations, user interactions, and network events
- **Privacy-First**: Built-in PII detection and redaction for emails, phone numbers, SSNs, credit cards
- **Performance Optimized**: Debounced redaction, Web Workers, sampling strategies
- **Compliance Ready**: Pre-configured patterns for HIPAA, PCI DSS, and GDPR
- **Custom Patterns**: Add your own regex patterns with confidence scoring
- **Replay Player**: Full-featured playback with timeline, speed controls, and event inspection

## Quick Start

### Installation

```bash
npm install rrweb rrweb-player @rrweb/types
```

### Basic Usage

```tsx
import { RecordingProvider, RecordingControls } from './examples/BasicIntegration';

function App() {
  return (
    <RecordingProvider>
      <Header />
      <RecordingControls />
      <Main />
    </RecordingProvider>
  );
}
```

### Using the Hook Directly

```tsx
import { useSessionRecorder, DEFAULT_RECORDER_CONFIG } from './hooks/useRecorder';

function MyComponent() {
  const { isRecording, events, startRecording, stopRecording } = useSessionRecorder(
    DEFAULT_RECORDER_CONFIG
  );

  return (
    <div>
      <button onClick={isRecording ? stopRecording : startRecording}>
        {isRecording ? 'Stop' : 'Start'} Recording
      </button>
      <p>Events captured: {events.length}</p>
    </div>
  );
}
```

## API Reference

### Hooks

#### `useSessionRecorder(config: RecorderConfig)`

The primary hook for session recording with privacy features.

```typescript
interface RecorderConfig {
  maskAllInputs: boolean;      // Mask input field values (default: true)
  maskTextContent: boolean;    // Mask text matching PII patterns (default: true)
  blockSelectors: string[];    // Elements to completely exclude
  redactionConfig: RedactionConfig;
  maskTextSelectors: string[]; // Elements to always mask
  inlineStylesheet: boolean;   // Inline styles for accurate replay
}

interface UseSessionRecorderReturn {
  isRecording: boolean;
  events: eventWithTime[];
  startRecording: () => void;
  stopRecording: () => eventWithTime[];
  clearEvents: () => void;
  config: RecorderConfig;
}
```

#### `useOptimizedRecorder(config: OptimizedRecorderConfig)`

Performance-optimized recording with sampling and metrics.

```typescript
interface OptimizedRecorderConfig extends RecorderConfig {
  sampling: SamplingConfig;      // Event sampling strategy
  redactionDebounceMs: number;   // Debounce delay (default: 50)
  useWorkers: boolean;           // Use Web Workers (default: true)
  workerThreshold: number;       // Text length for worker offload
  trackPerformance: boolean;     // Enable metrics tracking
}

interface SamplingConfig {
  strategy: 'all' | 'throttled' | 'keyframes';
  maxEventsPerSecond?: number;   // For 'throttled' strategy
  keyframeInterval?: number;     // For 'keyframes' strategy (ms)
}
```

**Preset Configurations:**

```typescript
import {
  DEFAULT_OPTIMIZED_CONFIG,
  HIGH_PERFORMANCE_CONFIG,
  LOW_BANDWIDTH_CONFIG
} from './hooks/useOptimizedRecorder';
```

#### `useHighPerformanceRecorder()`

Pre-configured for smooth recording with throttled sampling (30 events/sec).

#### `useLowBandwidthRecorder()`

Pre-configured for reduced data volume with keyframe-only capture.

### Utilities

#### Redaction (`src/utils/redactor.ts`)

```typescript
// Simple redaction
import { redactPII } from './utils/redactor';
const safe = redactPII('Email: john@example.com'); // "Email: [EMAIL REDACTED]"

// Configurable redaction
import { redactWithConfig, type RedactionConfig } from './utils/redactor';
const config: RedactionConfig = {
  email: true,
  phone: true,
  ssn: true,
  creditCard: true,
};
const safe = redactWithConfig(text, config);
```

#### PII Detection (`src/utils/piiDetector.ts`)

```typescript
import { detectPII, type PIIMatch } from './utils/piiDetector';

const matches: PIIMatch[] = detectPII('Call me at 555-123-4567');
// [{ type: 'phone', value: '555-123-4567', start: 11, end: 23, confidence: 'high' }]
```

#### Custom Patterns (`src/utils/customPatterns.ts`)

```typescript
import { registerPattern, setPatternEnabled } from './utils/customPatterns';

// Register a custom pattern
registerPattern({
  name: 'employee-id',
  pattern: /EMP-\d{6}/gi,
  replacement: '[EMPLOYEE_ID]',
  category: 'identifier',
  priority: 10,
  enabled: true,
});

// Toggle patterns
setPatternEnabled('employee-id', false);
```

#### Performance Utilities (`src/utils/performanceUtils.ts`)

```typescript
import {
  debounce,
  throttle,
  getPerformanceMetrics,
  createEventSampler,
} from './utils/performanceUtils';

// Debounce with cancel/flush
const debouncedFn = debounce(expensiveFn, 100);
debouncedFn.cancel();
debouncedFn.flush();

// Get current metrics
const metrics = getPerformanceMetrics();
console.log(metrics.eventsPerSecond, metrics.avgRedactionTime);
```

### Components

#### `PlayerModal`

Modal wrapper for rrweb-player.

```tsx
<PlayerModal
  isOpen={showPlayer}
  onClose={() => setShowPlayer(false)}
  events={recordedEvents}
/>
```

#### `PerformanceMonitor`

Real-time performance metrics display.

```tsx
<PerformanceMonitor
  isRecording={isRecording}
  updateInterval={1000}
  position="bottom-right"
  defaultExpanded={false}
/>
```

#### `VirtualEventList`

Virtualized list for displaying large numbers of events.

```tsx
<VirtualEventList
  events={events}
  rowHeight={40}
  containerHeight={400}
  onEventClick={(event, index) => console.log(event)}
  onSeekTo={(timeOffset) => player.goto(timeOffset)}
/>
```

## Configuration Options

### Redaction Configuration

```typescript
interface RedactionConfig {
  email?: boolean;      // Redact email addresses
  phone?: boolean;      // Redact phone numbers
  ssn?: boolean;        // Redact Social Security Numbers
  creditCard?: boolean; // Redact credit card numbers
}
```

### Block Selectors

Completely exclude elements from recording:

```typescript
const config = {
  blockSelectors: [
    '.do-not-record',      // Class selector
    '[data-private]',      // Attribute selector
    '#secret-section',     // ID selector
    'input[type="password"]', // Specific inputs
  ],
};
```

### Mask Text Selectors

Always mask text content (regardless of PII detection):

```typescript
const config = {
  maskTextSelectors: [
    '.sensitive',
    '.pii',
    '[data-sensitive]',
    '.user-data',
  ],
};
```

### Sampling Strategies

**All Events** (default): Capture everything

```typescript
sampling: { strategy: 'all' }
```

**Throttled**: Limit events per second

```typescript
sampling: {
  strategy: 'throttled',
  maxEventsPerSecond: 30, // Max 30 events/sec
}
```

**Keyframes**: Only capture snapshots at intervals

```typescript
sampling: {
  strategy: 'keyframes',
  keyframeInterval: 2000, // Every 2 seconds
}
```

## Privacy Best Practices

### 1. Defense in Depth

Use multiple layers of protection:

```typescript
const config = {
  // Layer 1: Block sensitive areas entirely
  blockSelectors: ['[data-private]', '.payment-form'],

  // Layer 2: Always mask certain elements
  maskTextSelectors: ['.user-email', '.phone-display'],

  // Layer 3: Automatic PII detection
  redactionConfig: {
    email: true,
    phone: true,
    ssn: true,
    creditCard: true,
  },

  // Layer 4: Mask all input values
  maskAllInputs: true,
};
```

### 2. Mark Sensitive Elements

Add data attributes to sensitive elements in your HTML:

```html
<!-- Completely excluded from recording -->
<div data-private>
  <p>This content will not be recorded</p>
</div>

<!-- Text will be masked -->
<span data-sensitive>John Doe</span>
```

### 3. Audit Your Patterns

Test redaction before production:

```typescript
import { redactPII } from './utils/redactor';

// Test with sample data
const testCases = [
  'Email: user@company.com',
  'SSN: 123-45-6789',
  'Card: 4111-1111-1111-1111',
];

testCases.forEach(test => {
  console.log('Input:', test);
  console.log('Output:', redactPII(test));
});
```

### 4. Limit Recording Scope

Only record what you need:

```typescript
// Record only specific container
const config = {
  // Only record within this element
  rootElement: document.getElementById('app-container'),
};
```

## Compliance Patterns

### HIPAA Compliance

For healthcare applications:

```typescript
import { HIPAA_CONFIG } from './examples/AdvancedIntegration';

// Includes:
// - Medical record number patterns
// - Date of birth detection
// - Strict text masking
// - All standard PII redaction
```

### PCI DSS Compliance

For payment processing:

```typescript
import { PCI_DSS_CONFIG } from './examples/AdvancedIntegration';

// Includes:
// - Credit card number validation (Luhn algorithm)
// - CVV masking
// - Expiration date detection
// - Cardholder name redaction
```

### GDPR Compliance

For EU data protection:

```typescript
import { GDPR_CONFIG } from './examples/AdvancedIntegration';

// Includes:
// - EU phone number formats
// - IBAN detection
// - VAT number patterns
// - Address redaction
```

### Custom Compliance Patterns

Register your own patterns for specific requirements:

```typescript
import { registerPattern } from './utils/customPatterns';

// Healthcare: Medical Record Numbers
registerPattern({
  name: 'mrn',
  pattern: /MRN[:\s]*\d{7,10}/gi,
  replacement: '[MRN REDACTED]',
  category: 'medical',
  priority: 20,
});

// Financial: Account Numbers
registerPattern({
  name: 'account-number',
  pattern: /(?:account|acct)[:\s#]*\d{8,12}/gi,
  replacement: '[ACCOUNT REDACTED]',
  category: 'financial',
  priority: 15,
});
```

## Performance Tuning

### High-Traffic Applications

```typescript
import { HIGH_PERFORMANCE_CONFIG } from './hooks/useOptimizedRecorder';

// Or customize:
const config = {
  sampling: {
    strategy: 'throttled',
    maxEventsPerSecond: 30,
  },
  redactionDebounceMs: 100,
  useWorkers: true,
  workerThreshold: 500,
};
```

### Mobile / Low-Bandwidth

```typescript
import { LOW_BANDWIDTH_CONFIG } from './hooks/useOptimizedRecorder';

// Or customize:
const config = {
  sampling: {
    strategy: 'keyframes',
    keyframeInterval: 2000,
  },
  inlineStylesheet: false, // Reduce payload size
};
```

### Monitor Performance

```tsx
import { PerformanceMonitor } from './components/PerformanceMonitor';

function App() {
  return (
    <>
      <YourApp />
      {process.env.NODE_ENV === 'development' && (
        <PerformanceMonitor isRecording={isRecording} />
      )}
    </>
  );
}
```

## Session Storage

### Using Session Saver Hook

```typescript
import { useSessionSaver } from './hooks/useSessionSaver';

const { saveSession, getSessions, deleteSession } = useSessionSaver({
  storageKey: 'app-sessions',
  maxSessions: 10,
  compression: true,
});

// Save a session
const sessionId = await saveSession(events, {
  name: 'Bug Report',
  tags: ['bug', 'checkout'],
});

// List sessions
const sessions = getSessions();

// Delete old sessions
deleteSession(sessionId);
```

### Custom Storage Backend

```typescript
import { sessionStorage } from './utils/sessionStorage';

// Save to your backend
const compressed = sessionStorage.compress(events);
await fetch('/api/sessions', {
  method: 'POST',
  body: JSON.stringify({ events: compressed }),
});

// Load from backend
const response = await fetch(`/api/sessions/${id}`);
const { events: compressed } = await response.json();
const events = sessionStorage.decompress(compressed);
```

## Development

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Run tests
npm test

# Run linter
npm run lint

# Build for production
npm run build
```

## License

MIT
