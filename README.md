# Screencapture

A comprehensive screen recording and session replay platform with advanced privacy controls, PII detection, and cross-platform support. Built as a monorepo with a Chrome extension, Electron desktop app, and shared core library.

## Packages

| Package | Description |
|---------|-------------|
| `@screencapture/desktop` | Electron desktop app with native screen capture, SQLite storage, OCR, and video export |
| `@screencapture/extension` | Chrome extension for browser session recording |
| `@screencapture/core` | Shared utilities for PII detection and privacy |
| `@screencapture/web` | Web-based session player and analyzer |

## Key Features

### 🎬 Native Desktop Capture
- **Screen & Window Recording**: Full native capture using Electron's `desktopCapturer` API
- **Input Event Tracking**: Records mouse clicks, keystrokes, and scroll events with timestamps
- **Input Privacy Filter**: Automatically masks sensitive keystrokes (passwords, credit cards)
- **Permission Management**: Handles macOS screen recording permissions gracefully
- **Session Recording Manager**: Complete lifecycle management with pause/resume support

### 🔒 Privacy-First Recording
- **Automatic PII Detection**: OCR-based text detection with pattern matching for emails, phone numbers, SSNs, credit cards, and more
- **Visual Redaction**: Multiple styles (solid, blur, pixelate, pattern) with real-time or post-process modes
- **Manual Redaction Tools**: Draw regions to mark sensitive areas, with static, tracked, or temporary region types
- **App/Window Blocking**: Automatically blur specific applications (Slack, Discord, password managers)
- **Redaction Profiles**: Save and share configurations with presets for HIPAA, Financial, and Demo modes

### 🎯 Real-Time Redaction Playback
- **Motion Interpolation**: Redaction boxes track content movement during video playback
- **Frame Bracketing**: Intelligently finds OCR keyframes and interpolates positions between them
- **Word Tracking**: Matches PII text across consecutive frames for smooth tracking
- **CSS Transitions**: Smooth visual transitions for natural-looking redaction movement
- **Auto-OCR Processing**: New recordings automatically queue OCR for immediate redaction support
- **PII Pattern Support**: Emails, phone numbers, SSN, credit cards, IP addresses, dates

### 🖥️ Desktop Application
- **Screen Recording**: Capture screens and windows with configurable quality
- **OCR Text Detection**: Real-time text recognition for PII scanning
- **Video Export**: Export recordings with FFmpeg integration
- **Session Management**: SQLite storage with import/export capabilities
- **Performance Monitoring**: Real-time FPS, memory, CPU tracking with bottleneck detection
- **Background Processing**: Async task queue for exports, OCR, and redaction
- **Quality Presets**: Low (15fps/480p), Medium (24fps/720p), High (30fps/1080p), Ultra (60fps/native)
- **Global Shortcuts**: Control recording from anywhere with keyboard shortcuts
- **System Tray**: Quick access to recording controls and status
- **Contact Center Integration (CCaaS)**: Webhook server for call event integration

### 🌐 Browser Extension
- **Session Recording**: Capture DOM interactions using rrweb
- **Privacy Controls**: Mask inputs, block elements, configurable redaction
- **Session Export**: Save and export recordings as JSON

## 🚀 Quick Start

### Prerequisites
- Node.js 22.12+ (we use v22.21.1)
- pnpm 10+

### Desktop App

```bash
# Clone the repository
git clone https://github.com/jimmyhosang/screencapture.git
cd screencapture

# Install dependencies
pnpm install

# Start development
pnpm --filter @screencapture/desktop dev

# Build for production
pnpm --filter @screencapture/desktop build
```

### Chrome Extension

```bash
# Build the extension
pnpm --filter @screencapture/extension build

# Load in Chrome:
# 1. Open chrome://extensions/
# 2. Enable "Developer mode"
# 3. Click "Load unpacked"
# 4. Select packages/extension/dist
```

### Run Tests

```bash
# Run all tests
pnpm --filter @screencapture/desktop test

# Run with coverage
pnpm --filter @screencapture/desktop test:coverage
```

## Architecture

```
screencapture/
├── packages/
│   ├── desktop/              # Electron desktop application
│   │   ├── src/
│   │   │   ├── main/         # Electron main process
│   │   │   │   ├── capture/  # Native screen capture system
│   │   │   │   │   ├── desktop-capturer.ts   # Screen/window capture
│   │   │   │   │   ├── input-tracker.ts      # Mouse/keyboard tracking
│   │   │   │   │   ├── input-privacy.ts      # Privacy filtering
│   │   │   │   │   └── input-privacy-filter.ts
│   │   │   │   ├── services/ # Core services
│   │   │   │   │   ├── session-recording-manager.ts
│   │   │   │   │   ├── permissions-manager.ts
│   │   │   │   │   └── input-events-repository.ts
│   │   │   │   ├── ccaas/    # Contact center integration
│   │   │   │   ├── ocr/      # Text detection services
│   │   │   │   ├── redaction/# Redaction rendering
│   │   │   │   ├── tracking/ # Window activity tracking
│   │   │   │   └── workers/  # Background task manager
│   │   │   ├── preload/      # Context bridge
│   │   │   └── renderer/     # React UI
│   │   │       └── src/components/
│   │   │           ├── DesktopCaptureControls.tsx
│   │   │           ├── SessionPlayer.tsx
│   │   │           ├── InputEventsTimeline.tsx
│   │   │           └── PermissionsStatus.tsx
│   │   └── electron.vite.config.ts
│   │
│   ├── extension/            # Chrome browser extension
│   │   ├── src/
│   │   │   ├── background/   # Service worker
│   │   │   ├── content/      # Content script (rrweb)
│   │   │   └── popup/        # React popup UI
│   │   └── vite.config.ts
│   │
│   ├── core/                 # Shared utilities
│   │   └── src/
│   │       ├── privacy/      # PII detection, redaction
│   │       └── performance/  # Performance utilities
│   │
│   └── web/                  # Web session player
│       └── src/
│           ├── hooks/        # Recording hooks
│           ├── components/   # UI components
│           └── utils/        # Utilities
```

## Desktop App Features

### Native Screen Capture

The new capture system provides comprehensive screen recording:

```typescript
// Start a capture session
await window.api.capture.start({
  sourceId: 'screen:0',        // Screen or window ID
  frameRate: 30,               // Capture FPS
  trackInputs: true,           // Enable input tracking
  privacyMode: 'moderate'      // 'strict' | 'moderate' | 'permissive'
});

// Stop and get session data
const session = await window.api.capture.stop();
```

**Input Tracking Features:**
- Mouse clicks with position, button, and click count
- Keyboard events with privacy-filtered characters
- Scroll events with delta and position
- All events timestamped relative to session start

### Session Playback

The `SessionPlayer` component provides full playback with:
- Video timeline with seek controls
- Input event overlay (visualizes clicks/keys)
- Speed controls (0.5x to 4x)
- Event timeline panel

### Performance Monitoring

Real-time tracking with three view modes:

- **Summary**: Quick stats (FPS, frame time, memory, CPU)
- **Detailed**: Processing pipeline breakdown (capture, OCR, PII scan, redaction times)
- **Chart**: Historical graphs for FPS, memory, and frame time

### Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl+Shift+R` | Start/Stop Recording |
| `Ctrl+Shift+P` | Pause/Resume Recording |
| `Ctrl+Shift+S` | Quick Screenshot |
| `Ctrl+Shift+M` | Toggle Performance Monitor |

### Redaction System

**Automatic Detection:**
- Email addresses
- Phone numbers (US formats)
- Social Security Numbers
- Credit card numbers
- Dates of birth
- Custom patterns via regex

**Manual Tools:**
- Rectangle drawing tool for region marking
- Region types: static, tracked (follows content), temporary
- Timeline editor for time-based redactions
- App blocking rules with pattern matching

**Redaction Styles:**
- Solid color overlay
- Gaussian blur (configurable intensity)
- Pixelation
- Pattern fill

### Quality Options

| Preset | Frame Rate | Resolution | Est. Size |
|--------|------------|------------|-----------|
| Low | 15 fps | 480p | ~50MB/hr |
| Medium | 24 fps | 720p | ~150MB/hr |
| High | 30 fps | 1080p | ~350MB/hr |
| Ultra | 60 fps | Native | ~700MB/hr |

## Privacy Compliance

### Built-in Presets

- **HIPAA Compliant**: SSN, DOB, medical record numbers, addresses
- **Financial Privacy**: SSN, credit cards, bank accounts, tax IDs
- **Demo Mode**: Email, phone (minimal redaction for demos)

### Input Privacy Modes

| Mode | Description |
|------|-------------|
| `strict` | Mask all keyboard input, no exceptions |
| `moderate` | Allow navigation keys, mask alphanumeric |
| `permissive` | Only mask detected sensitive patterns |

### Custom Patterns

```typescript
// Add custom PII pattern
await window.api.pii.addPattern(
  'employee-id',
  /EMP-\d{6}/gi,
  '[EMPLOYEE_ID]',
  'high'
);
```

## Development

### Commands

```bash
# Install all dependencies
pnpm install

# Start desktop app development
pnpm --filter @screencapture/desktop dev

# Build desktop app
pnpm --filter @screencapture/desktop build

# Run tests
pnpm --filter @screencapture/desktop test

# Build extension
pnpm --filter @screencapture/extension build

# Run linter
pnpm run lint
```

### Building Distributables

```bash
# Build for current platform
pnpm --filter @screencapture/desktop build:unpack

# Build for specific platforms
pnpm --filter @screencapture/desktop build:mac
pnpm --filter @screencapture/desktop build:win
pnpm --filter @screencapture/desktop build:linux
```

## Technology Stack

- **Framework**: Electron 33+ / React 19
- **Build**: Vite + electron-vite
- **Database**: SQLite (better-sqlite3)
- **Recording**: rrweb for DOM, native `desktopCapturer` for video
- **OCR**: Tesseract.js / Native TextDetector API / macOS Vision
- **Video**: FFmpeg for export and processing
- **Testing**: Vitest with comprehensive coverage
- **Language**: TypeScript (strict mode)

## Security

- Context isolation enabled
- Node integration disabled
- Sandboxed renderer process
- IPC-based communication only
- No external network calls for PII processing
- Input events filtered before storage

## License

MIT

## Contributing

Contributions are welcome! Please read our contributing guidelines before submitting PRs.

## Support

- [Report Issues](https://github.com/jimmyhosang/screencapture/issues)
- [Documentation](https://github.com/jimmyhosang/screencapture/wiki)
