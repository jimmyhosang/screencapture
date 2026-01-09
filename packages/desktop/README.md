# @screencapture/desktop

Electron desktop application for screen recording and replay with advanced privacy controls, OCR-based PII detection, and comprehensive redaction tools.

## Features

### Core Recording
- **Screen & Window Capture**: Record entire screens or individual windows
- **Quality Presets**: Low (15fps/480p), Medium (24fps/720p), High (30fps/1080p), Ultra (60fps/native)
- **Custom Quality**: Configure frame rate, resolution, bitrate, and codec (H.264, VP9, AV1)
- **Audio Recording**: Optional audio capture with configurable bitrate

### Privacy & Redaction

#### Automatic PII Detection
- **OCR Text Detection**: Real-time text recognition using Tesseract.js or native TextDetector API
- **Pattern Matching**: Detect emails, phone numbers, SSNs, credit cards, dates of birth
- **Color-Coded Debug Mode**: Visual overlay showing detected PII types
- **Confidence Levels**: High, medium, and low confidence scoring

#### Manual Redaction Tools
- **Region Editor**: Draw rectangles to mark sensitive areas
- **Region Types**: Static, tracked (follows content), temporary
- **Timeline Editor**: Edit redaction time ranges with drag handles
- **Multiple Styles**: Solid color, blur, pixelate, pattern fill

#### App/Window Blocking
- **Pattern Matching**: Exact match, contains, or regex patterns
- **Quick Presets**: Slack, Discord, password managers, private browsing
- **Block Actions**: Blur, solid color, pixelate, or completely hide

#### Redaction Profiles
- **HIPAA Compliant**: Healthcare-focused PII types
- **Financial Privacy**: Credit cards, SSNs, bank accounts
- **Demo Mode**: Minimal redaction for presentations
- **Import/Export**: Share profiles as JSON files

### Performance Monitoring
- **Real-time Metrics**: FPS, frame time, memory usage, CPU usage
- **Processing Pipeline**: Capture, OCR, PII scan, redaction timing
- **Bottleneck Detection**: Automatic alerts for performance issues
- **Three View Modes**: Summary, detailed breakdown, historical charts

### Background Processing
- **Task Queue**: Priority-based queuing (high/normal/low)
- **Progress Tracking**: Real-time progress updates
- **Cancellation**: Cancel running tasks
- **Task Types**: Export, redaction, OCR analysis, thumbnails

### Session Management
- **SQLite Database**: Persistent local storage
- **Import/Export**: JSON file support
- **Metadata**: Name, timestamp, duration, event count, privacy config
- **Search & Filter**: Find recordings quickly

### System Integration
- **Global Shortcuts**: Control recording from anywhere
- **System Tray**: Quick access to controls and status
- **First-Run Wizard**: Guided setup with permission checks
- **Cross-Platform**: macOS, Windows, Linux

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl/Cmd+Shift+R` | Start/Stop Recording |
| `Ctrl/Cmd+Shift+P` | Pause/Resume Recording |
| `Ctrl/Cmd+Shift+S` | Quick Screenshot |
| `Ctrl/Cmd+Shift+M` | Toggle Performance Monitor |

## Development

```bash
# Install dependencies (from monorepo root)
pnpm install

# Start development
pnpm --filter @screencapture/desktop dev

# Build for production
pnpm --filter @screencapture/desktop build

# Type checking
pnpm --filter @screencapture/desktop typecheck

# Linting
pnpm --filter @screencapture/desktop lint
```

## Building Distributables

```bash
# Build for current platform (unpacked)
pnpm --filter @screencapture/desktop build:unpack

# Build for specific platforms
pnpm --filter @screencapture/desktop build:mac
pnpm --filter @screencapture/desktop build:win
pnpm --filter @screencapture/desktop build:linux
```

## Architecture

```
src/
├── main/                    # Electron main process
│   ├── index.ts             # App entry, window, tray, IPC, shortcuts
│   ├── database.ts          # SQLite setup and queries
│   ├── recorder.ts          # Screen recording service
│   ├── recordings.ts        # Recording management IPC
│   ├── types.ts             # Shared types
│   │
│   ├── ocr/                 # Text detection services
│   │   ├── textDetector.ts  # OCR engine wrapper
│   │   ├── piiScanner.ts    # PII pattern matching
│   │   ├── imageUtils.ts    # Image processing utilities
│   │   └── index.ts         # IPC handlers
│   │
│   ├── redaction/           # Redaction system
│   │   ├── renderer.ts      # Apply redactions to frames
│   │   ├── manualRedaction.ts # Region editor, app blocking
│   │   ├── types.ts         # Redaction types
│   │   └── index.ts         # IPC handlers
│   │
│   ├── performance/         # Performance monitoring
│   │   └── index.ts         # Metrics collection and reporting
│   │
│   └── workers/             # Background processing
│       └── taskManager.ts   # Task queue with progress
│
├── preload/                 # Context bridge
│   └── index.ts             # Secure API exposure
│
└── renderer/                # React UI
    └── src/
        ├── App.tsx          # Main application
        ├── components/
        │   ├── Dashboard.tsx
        │   ├── SessionList.tsx
        │   ├── RecordingControls.tsx
        │   ├── PlayerModal.tsx
        │   ├── VideoPlayer.tsx
        │   ├── ExportDialog.tsx
        │   ├── Settings.tsx
        │   ├── OCRTestMode.tsx
        │   ├── RedactionSettings.tsx
        │   ├── RegionEditor.tsx
        │   ├── AppBlockRules.tsx
        │   ├── RedactionTimeline.tsx
        │   ├── RedactionProfiles.tsx
        │   ├── PerformanceMonitor.tsx
        │   ├── QualityOptions.tsx
        │   ├── FirstRunExperience.tsx
        │   └── TaskQueue.tsx
        └── styles/
            └── index.css
```

## API Reference

### Sessions API
```typescript
window.api.sessions.getAll()           // Get all sessions
window.api.sessions.get(id)            // Get session by ID
window.api.sessions.save(session)      // Save new session
window.api.sessions.delete(id)         // Delete session
window.api.sessions.export(id)         // Export to JSON
```

### Recording API
```typescript
window.api.recording.getSources()      // List available screens/windows
window.api.recording.startUrl(url, config)  // Start recording
window.api.recording.stop()            // Stop recording
window.api.recording.isActive()        // Check if recording
```

### OCR API
```typescript
window.api.ocr.initialize()            // Initialize OCR engine
window.api.ocr.processFrame(data, w, h) // Process single frame
window.api.pii.scanImage(data, w, h)   // Scan for PII
window.api.pii.addPattern(name, regex, replacer, confidence)
```

### Redaction API
```typescript
window.api.redaction.applyToFrame(data, w, h, regions)
window.api.redaction.createMask(recordingId, start, end, regions)
window.api.manual.addRegion(recordingId, region)
window.api.manual.addAppBlockRule(rule)
window.api.manual.createProfile(profile)
```

### Performance API
```typescript
window.api.performance.getLatestSnapshot()  // Current metrics
window.api.performance.getSnapshots(count)  // Historical data
window.api.performance.onUpdate(callback)   // Subscribe to updates
```

### Tasks API
```typescript
window.api.tasks.create(type, data, options)  // Create background task
window.api.tasks.cancel(taskId)               // Cancel task
window.api.tasks.onUpdate(callback)           // Subscribe to progress
```

## Configuration

### Quality Settings
```typescript
interface QualitySettings {
  preset: 'low' | 'medium' | 'high' | 'ultra' | 'custom';
  frameRate: 15 | 24 | 30 | 60;
  resolution: 'native' | '1080p' | '720p' | '480p';
  bitrate: number;        // kbps
  codec: 'h264' | 'vp9' | 'av1';
  audioEnabled: boolean;
  audioBitrate: number;   // kbps
}
```

### Redaction Config
```typescript
interface RedactionConfig {
  style: 'solid' | 'blur' | 'pixelate' | 'pattern';
  color: string;          // For solid style
  blurIntensity: number;  // 1-20, default 10
  pixelSize: number;      // 4-32, default 16
}
```

## Security

- Context isolation enabled
- Node integration disabled
- Sandboxed renderer process
- IPC-based communication only
- No external network calls for PII processing
- All data stored locally in SQLite

## Dependencies

- **Electron**: Desktop framework
- **electron-vite**: Build tooling
- **React 19**: UI framework
- **better-sqlite3**: Database
- **rrweb/rrweb-player**: Session recording and replay
- **Tesseract.js**: OCR engine (fallback)

## License

MIT
