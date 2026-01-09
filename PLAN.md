# Screen Recording with PII Redaction - Technical Plan

## Executive Summary

This document outlines the technical approach for extending the Screencapture Electron desktop app to support real screen recording with automatic PII redaction. The solution leverages existing codebase assets (14+ PII detection patterns, worker pool infrastructure, session management) while introducing new capabilities for screen capture, OCR-based text detection, and video processing.

**Key Recommendation:** Implement a **hybrid redaction strategy** with real-time preview masking and post-process video redaction for optimal balance of user experience and accuracy.

---

## 1. Existing Codebase Analysis

### 1.1 Reusable Components

| Component | Location | Reuse Strategy |
|-----------|----------|----------------|
| **PII Detection** | `packages/core/src/privacy/piiDetector.ts` | Direct reuse for OCR text analysis |
| **PII Redaction** | `packages/core/src/privacy/redactor.ts` | Apply to extracted text regions |
| **Confidence Scoring** | `redactor.ts:299-434` | Filter low-confidence detections |
| **Custom Patterns** | `redactor.ts:233-293` | User-defined sensitive regions |
| **Worker Pool** | `packages/web/src/utils/piiWorkerManager.ts` | Offload OCR/redaction from main thread |
| **Performance Utils** | `packages/core/src/performance/` | Debounce, throttle, metrics tracking |
| **Session Storage** | `packages/desktop/src/main/database.ts` | SQLite schema for recordings |
| **IPC Handlers** | `packages/desktop/src/main/index.ts` | Extend for screen capture APIs |
| **Privacy Config** | `packages/core/src/session/` | Extend for screen-specific settings |

### 1.2 Code That Can Be Directly Reused

```
packages/core/
├── privacy/
│   ├── piiDetector.ts      ✅ 100% reusable (detectPII, patterns)
│   └── redactor.ts         ✅ 95% reusable (redactWithConfig, analyzeForPII)
├── performance/
│   └── index.ts            ✅ 100% reusable (debounce, throttle, metrics)
└── session/
    └── index.ts            ⚠️ Extend types for video sessions

packages/desktop/
├── main/
│   ├── database.ts         ⚠️ Extend schema for video metadata
│   └── index.ts            ⚠️ Add screen capture IPC handlers
└── preload/
    └── index.ts            ⚠️ Expose screen capture API
```

### 1.3 New Code Required

```
packages/desktop/src/
├── main/
│   ├── screenCapture.ts    🆕 desktopCapturer integration
│   ├── ocrEngine.ts        🆕 Tesseract/PaddleOCR wrapper
│   ├── videoProcessor.ts   🆕 FFmpeg redaction pipeline
│   └── nativeMessaging.ts  🆕 Extension communication
├── renderer/src/
│   ├── components/
│   │   ├── SourcePicker.tsx    🆕 Screen/window selection UI
│   │   ├── RecordingOverlay.tsx 🆕 Live preview with regions
│   │   ├── RedactionEditor.tsx  🆕 Manual region marking
│   │   └── VideoExporter.tsx    🆕 Export settings UI
│   └── hooks/
│       ├── useScreenCapture.ts  🆕 Capture state management
│       └── useVideoRedaction.ts 🆕 Redaction pipeline hook
└── workers/
    ├── ocr.worker.ts       🆕 Background OCR processing
    └── ffmpeg.worker.ts    🆕 Video encoding worker
```

---

## 2. Technical Architecture

### 2.1 High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              ELECTRON MAIN PROCESS                           │
├─────────────────────────────────────────────────────────────────────────────┤
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐ │
│  │DesktopCapture│  │  OCR Engine  │  │Video Processor│  │ Native Messaging│ │
│  │    Module    │  │  (Tesseract) │  │   (FFmpeg)   │  │    Host         │ │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘  └────────┬─────────┘ │
│         │                 │                  │                   │           │
│         └─────────────────┴──────────────────┴───────────────────┘           │
│                                    │                                          │
│                              IPC Bridge                                       │
│                                    │                                          │
├─────────────────────────────────────────────────────────────────────────────┤
│                             RENDERER PROCESS                                  │
├─────────────────────────────────────────────────────────────────────────────┤
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐ │
│  │ Source Picker│  │   Live View  │  │   Redaction  │  │   Session List   │ │
│  │     UI       │  │   Preview    │  │    Editor    │  │   & Playback     │ │
│  └──────────────┘  └──────────────┘  └──────────────┘  └──────────────────┘ │
│                                                                               │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │                        Web Workers                                    │   │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐                   │   │
│  │  │ OCR Worker  │  │FFmpeg Worker│  │ PII Worker  │ (existing)        │   │
│  │  └─────────────┘  └─────────────┘  └─────────────┘                   │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                              DATA LAYER                                       │
├─────────────────────────────────────────────────────────────────────────────┤
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐ │
│  │   SQLite DB  │  │ Video Files  │  │  Thumbnails  │  │  Redaction Maps  │ │
│  │  (metadata)  │  │   (.webm)    │  │    (.jpg)    │  │     (.json)      │ │
│  └──────────────┘  └──────────────┘  └──────────────┘  └──────────────────┘ │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 2.2 Recording Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           RECORDING PIPELINE                                  │
└─────────────────────────────────────────────────────────────────────────────┘

User clicks "Record"
        │
        ▼
┌───────────────────┐
│  1. Source Picker │  ← desktopCapturer.getSources()
│  - Screens        │    Returns thumbnails + IDs
│  - Windows        │
│  - Tabs (via ext) │
└─────────┬─────────┘
          │
          ▼
┌───────────────────┐
│  2. Configure     │  ← User selects privacy settings
│  - Auto-redact    │    - PII types to detect
│  - Manual regions │    - Apps to always blur
│  - Quality        │    - Resolution/FPS
└─────────┬─────────┘
          │
          ▼
┌───────────────────┐     ┌───────────────────┐
│  3. Start Capture │────▶│  MediaRecorder    │
│  getUserMedia()   │     │  (WebM/VP9)       │
└─────────┬─────────┘     └─────────┬─────────┘
          │                         │
          │ Every N frames          │ Continuous
          ▼                         ▼
┌───────────────────┐     ┌───────────────────┐
│  4. OCR Sampling  │     │  5. Raw Recording │
│  - Extract frame  │     │  - Temp file      │
│  - Run Tesseract  │     │  - No redaction   │
│  - Detect regions │     │                   │
└─────────┬─────────┘     └─────────┬─────────┘
          │                         │
          │ PII bounding boxes      │
          ▼                         │
┌───────────────────┐               │
│  6. Live Preview  │               │
│  - Blur overlay   │               │
│  - Region markers │               │
└───────────────────┘               │
                                    │
User clicks "Stop"                  │
          │                         │
          ▼                         ▼
┌─────────────────────────────────────────────────────────────────┐
│                    7. POST-PROCESSING PIPELINE                   │
├─────────────────────────────────────────────────────────────────┤
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────────────┐  │
│  │  Full OCR   │───▶│  Generate   │───▶│  Apply Redaction    │  │
│  │  Analysis   │    │  Redaction  │    │  (FFmpeg + drawbox) │  │
│  │             │    │  Timeline   │    │                     │  │
│  └─────────────┘    └─────────────┘    └──────────┬──────────┘  │
│                                                    │             │
│  ┌─────────────────────────────────────────────────┘             │
│  │                                                               │
│  ▼                                                               │
│  ┌─────────────────────────────────────────────────────────────┐ │
│  │  8. Save Session                                             │ │
│  │  - Redacted video (.webm)                                    │ │
│  │  - Metadata (SQLite)                                         │ │
│  │  - Redaction map (.json) for re-editing                      │ │
│  │  - Thumbnail                                                  │ │
│  └─────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

### 2.3 Data Flow for Redaction

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         REDACTION DATA FLOW                                   │
└─────────────────────────────────────────────────────────────────────────────┘

Video Frame (1920x1080)
        │
        ▼
┌───────────────────────────────────────────────────────────────┐
│  FRAME EXTRACTION (Every 500ms during recording)              │
│  - Canvas.drawImage(videoElement)                             │
│  - canvas.toBlob('image/jpeg', 0.8)                           │
│  - ~50KB per frame                                            │
└─────────────────────────────────┬─────────────────────────────┘
                                  │
                                  ▼
┌───────────────────────────────────────────────────────────────┐
│  OCR ENGINE (Tesseract.js in Worker)                          │
│  - recognize(imageBlob)                                       │
│  - Returns: { text, words: [{ text, bbox, confidence }] }     │
│  - ~200-500ms per frame                                       │
└─────────────────────────────────┬─────────────────────────────┘
                                  │
                                  ▼
┌───────────────────────────────────────────────────────────────┐
│  PII DETECTION (Reuse @screencapture/core)                    │
│  - For each word: analyzeForPII(word.text)                    │
│  - Filter by confidence threshold (>= 0.7)                    │
│  - Map word.bbox to video coordinates                         │
│  - Merge overlapping regions                                  │
└─────────────────────────────────┬─────────────────────────────┘
                                  │
                                  ▼
┌───────────────────────────────────────────────────────────────┐
│  REDACTION MAP (JSON)                                         │
│  {                                                            │
│    "sessionId": "...",                                        │
│    "regions": [                                               │
│      {                                                        │
│        "startTime": 1.5,                                      │
│        "endTime": 3.2,                                        │
│        "bbox": { "x": 100, "y": 200, "w": 150, "h": 20 },     │
│        "type": "email",                                       │
│        "confidence": 0.95,                                    │
│        "redactedText": "j***@example.com"                     │
│      }                                                        │
│    ],                                                         │
│    "manualRegions": [...],                                    │
│    "appBlurRules": [{ "appName": "Slack", "blur": true }]     │
│  }                                                            │
└─────────────────────────────────┬─────────────────────────────┘
                                  │
                                  ▼
┌───────────────────────────────────────────────────────────────┐
│  VIDEO REDACTION (FFmpeg)                                     │
│                                                               │
│  ffmpeg -i input.webm                                         │
│    -vf "                                                      │
│      drawbox=x=100:y=200:w=150:h=20:                          │
│        color=black:t=fill:enable='between(t,1.5,3.2)',        │
│      boxblur=10:enable='between(t,5.0,10.0)'                  │
│    "                                                          │
│    -c:a copy output.webm                                      │
└───────────────────────────────────────────────────────────────┘
```

---

## 3. Technology Decisions

### 3.1 Screen Capture: Electron desktopCapturer

**Decision:** Use `desktopCapturer` in main process with `setDisplayMediaRequestHandler`

**Rationale:**
- Official Electron API with good documentation
- Security model requires main process (renderer deprecated)
- Supports screen, window, and tab capture
- Integrates with MediaRecorder for WebM output

**Implementation Pattern:**
```typescript
// main/screenCapture.ts
import { desktopCapturer, session } from 'electron';

session.defaultSession.setDisplayMediaRequestHandler(async (request, callback) => {
  const sources = await desktopCapturer.getSources({
    types: ['screen', 'window'],
    thumbnailSize: { width: 320, height: 180 }
  });

  // Let renderer show picker, then callback with selected source
  callback({ video: sources[selectedIndex] });
});
```

**References:**
- [Electron desktopCapturer Docs](https://www.electronjs.org/docs/latest/api/desktop-capturer)
- [Fireship Electron Screen Recorder Tutorial](https://fireship.io/lessons/electron-screen-recorder-project-tutorial/)

### 3.2 OCR Engine: Tesseract.js (Primary) + Native Fallback

**Decision:** Use Tesseract.js for real-time sampling, with option for native Tesseract post-processing

| Approach | Latency | Accuracy | Integration |
|----------|---------|----------|-------------|
| Tesseract.js | 200-500ms/frame | 85-92% | Easy (npm) |
| Native Tesseract | 50-150ms/frame | 90-95% | Requires binary |
| PaddleOCR | 30-100ms/frame | 92-97% | Complex setup |

**Rationale:**
- Tesseract.js runs in Web Worker (no native deps)
- Sufficient for real-time preview (sampling every 500ms)
- Native Tesseract optional for post-process accuracy
- Existing worker pool infrastructure can be extended

**Implementation:**
```typescript
// workers/ocr.worker.ts
import Tesseract from 'tesseract.js';

let worker: Tesseract.Worker | null = null;

async function initialize() {
  worker = await Tesseract.createWorker('eng');
}

async function recognizeFrame(imageBlob: Blob) {
  const { data } = await worker.recognize(imageBlob);
  return data.words.map(word => ({
    text: word.text,
    bbox: word.bbox,
    confidence: word.confidence
  }));
}
```

**References:**
- [Tesseract.js GitHub](https://github.com/naptha/tesseract.js)
- [OCR Accuracy Benchmark 2025](https://research.aimultiple.com/ocr-accuracy/)
- [Best Open-Source OCR Comparison](https://www.koncile.ai/en/ressources/is-tesseract-still-the-best-open-source-ocr)

### 3.3 Video Processing: FFmpeg.wasm + Canvas Preview

**Decision:** Hybrid approach
- **Live Preview:** Canvas 2D with blur overlay (simple, fast)
- **Post-Process:** FFmpeg.wasm for final redaction (accurate, flexible)

**Rationale:**
- Canvas blur is fast enough for real-time preview (~16ms/frame)
- FFmpeg provides precise control over redaction regions
- FFmpeg.wasm avoids native binary dependency
- WebGL not needed for simple box blur operations

**Performance Comparison:**
| Method | Frame Time | Use Case |
|--------|------------|----------|
| Canvas 2D blur | 15-22ms | Live preview |
| WebGL blur | 10-15ms | High-res preview |
| FFmpeg drawbox | N/A (batch) | Post-process |
| FFmpeg boxblur | N/A (batch) | Post-process |

**Implementation:**
```typescript
// Live preview with Canvas
function drawRedactionOverlay(
  ctx: CanvasRenderingContext2D,
  regions: RedactionRegion[]
) {
  for (const region of regions) {
    ctx.filter = 'blur(10px)';
    ctx.drawImage(
      sourceCanvas,
      region.x, region.y, region.w, region.h,
      region.x, region.y, region.w, region.h
    );
    ctx.filter = 'none';
  }
}

// Post-process with FFmpeg
async function applyRedaction(inputPath: string, regions: RedactionRegion[]) {
  const filterComplex = regions.map(r =>
    `drawbox=x=${r.x}:y=${r.y}:w=${r.w}:h=${r.h}:` +
    `color=black@0.8:t=fill:enable='between(t,${r.start},${r.end})'`
  ).join(',');

  await ffmpeg.run(
    '-i', inputPath,
    '-vf', filterComplex,
    '-c:a', 'copy',
    outputPath
  );
}
```

**References:**
- [Real-time Video Filters with WebCodecs](https://transloadit.com/devtips/real-time-video-filters-in-browsers-with-ffmpeg-and-webcodecs/)
- [WebGL Video Processing Analysis](https://github.com/dominique-mueller/javascript-video-processing-analysis)
- [Video Frame Processing Comparison](https://webrtchacks.com/video-frame-processing-on-the-web-webassembly-webgpu-webgl-webcodecs-webnn-and-webtransport/)

### 3.4 Storage Format

**Decision:**
- **Raw Recording:** WebM (VP9) for quality/size balance
- **Metadata:** SQLite (extend existing schema)
- **Redaction Map:** JSON file (enables re-editing)

**Schema Extension:**
```sql
CREATE TABLE video_sessions (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  timestamp INTEGER NOT NULL,
  duration INTEGER NOT NULL,

  -- Video-specific
  videoPath TEXT NOT NULL,      -- Path to .webm file
  thumbnailPath TEXT,           -- Preview thumbnail
  redactionMapPath TEXT,        -- JSON redaction timeline

  -- Capture metadata
  sourceType TEXT,              -- 'screen' | 'window' | 'tab'
  sourceName TEXT,              -- Window/app name
  resolution TEXT,              -- '1920x1080'
  fps INTEGER,                  -- 30 or 60

  -- Privacy
  privacyConfig TEXT,           -- JSON privacy settings
  autoRedacted INTEGER,         -- Boolean: auto-redaction applied
  manualRegions INTEGER,        -- Count of manual regions

  -- Status
  status TEXT DEFAULT 'raw',    -- 'raw' | 'processing' | 'redacted'
  originalPath TEXT             -- Keep original for re-processing
);
```

---

## 4. Real-Time vs Post-Process Redaction

### 4.1 Comparison Matrix

| Factor | Real-Time | Post-Process | Hybrid (Recommended) |
|--------|-----------|--------------|----------------------|
| **User Experience** | Immediate feedback | Delayed feedback | Best of both |
| **CPU Usage** | High (constant OCR) | Low during recording | Moderate |
| **Accuracy** | Lower (sampling) | Higher (full analysis) | Highest |
| **Editability** | Limited | Full control | Full control |
| **Recording Quality** | May drop frames | Pristine original | Pristine original |
| **Implementation** | Complex | Simpler | Moderate |

### 4.2 Recommendation: Hybrid Approach

**Phase 1 (During Recording):**
- Record raw video without redaction
- Sample frames every 500ms for OCR
- Show live preview with approximate blur regions
- Build preliminary redaction map

**Phase 2 (Post-Recording):**
- Run full OCR on all frames (or keyframes)
- Refine redaction map with higher accuracy
- Allow user to review and edit regions
- Apply FFmpeg redaction to create final video

**Why Hybrid?**
1. **No quality loss:** Original video preserved
2. **User control:** Review before sharing
3. **Better accuracy:** Post-process OCR can use multiple passes
4. **Editability:** Redaction map can be modified anytime
5. **Performance:** Recording doesn't drop frames from OCR load

---

## 5. Technical Risks and Mitigations

### 5.1 Risk Matrix

| Risk | Impact | Probability | Mitigation |
|------|--------|-------------|------------|
| **OCR performance** | Dropped frames, high CPU | Medium | Worker pool, sampling, native fallback |
| **OCR accuracy** | Missed PII | Medium | Confidence thresholds, manual review, multi-pass |
| **Large video files** | Storage/memory issues | Medium | Compression, chunked processing, streaming |
| **Cross-platform FFmpeg** | Different behavior per OS | Low | FFmpeg.wasm (consistent), thorough testing |
| **macOS permissions** | Screen recording denied | High | Clear permission prompts, fallback messaging |
| **Electron security** | Context isolation bypass | Low | Strict IPC, no nodeIntegration, sandboxing |
| **Memory leaks** | App crashes over time | Medium | VideoFrame.close(), worker cleanup, profiling |

### 5.2 Platform-Specific Considerations

**macOS:**
- Requires explicit screen recording permission
- System Preferences → Security & Privacy → Screen Recording
- Need to guide user through permission flow
- Consider using `systemPreferences.getMediaAccessStatus('screen')`

**Windows:**
- Generally works without special permissions
- Some enterprise policies may block capture
- UAC may interfere with certain windows

**Linux:**
- PipeWire returns single source for combined screen/window
- X11 vs Wayland differences
- May need Flatpak portal integration

---

## 6. Implementation Phases

### Phase 1: Basic Screen Recording (Complexity: Medium)
**Duration Estimate: 1-2 weeks**

- [ ] Implement source picker UI with thumbnails
- [ ] Add desktopCapturer integration in main process
- [ ] Create MediaRecorder wrapper for WebM output
- [ ] Save raw recordings to file system
- [ ] Basic playback with rrweb-player (video mode)
- [ ] Extend SQLite schema for video sessions
- [ ] Add recording controls (start/stop/pause)

**Deliverable:** App can record screen/windows and play back without redaction

### Phase 2: OCR Integration (Complexity: High)
**Duration Estimate: 2-3 weeks**

- [ ] Set up Tesseract.js in Web Worker
- [ ] Implement frame sampling during recording
- [ ] Build OCR result aggregation and deduplication
- [ ] Create redaction map data structure
- [ ] Integrate with existing PII detection from core
- [ ] Add confidence filtering and thresholds
- [ ] Implement live preview with blur overlay

**Deliverable:** OCR detects text during recording, preliminary blur shown

### Phase 3: Redaction Editor (Complexity: Medium)
**Duration Estimate: 1-2 weeks**

- [ ] Build timeline-based redaction editor UI
- [ ] Show detected PII regions on video frames
- [ ] Allow manual region drawing/editing
- [ ] Implement app-based blur rules (e.g., "always blur Slack")
- [ ] Save/load redaction maps
- [ ] Add undo/redo for region editing

**Deliverable:** Users can review and edit redaction regions before export

### Phase 4: Video Processing (Complexity: High)
**Duration Estimate: 2-3 weeks**

- [ ] Integrate FFmpeg.wasm
- [ ] Implement redaction filter generation from map
- [ ] Build video processing pipeline with progress
- [ ] Handle large files with chunked processing
- [ ] Add export options (quality, format)
- [ ] Implement thumbnail generation

**Deliverable:** Export redacted videos as MP4/WebM

### Phase 5: Polish & Extension (Complexity: Medium)
**Duration Estimate: 1-2 weeks**

- [ ] Native messaging host for browser extension
- [ ] System tray recording controls
- [ ] Keyboard shortcuts (global hotkeys)
- [ ] Performance optimization and profiling
- [ ] Cross-platform testing and fixes
- [ ] Error handling and recovery

**Deliverable:** Production-ready application

---

## 7. API Design

### 7.1 IPC Channels (Main ↔ Renderer)

```typescript
// Screen Capture
'capture:getSources' → { type: 'screen' | 'window' | 'all' }
                     ← Source[]

'capture:start' → { sourceId: string, config: CaptureConfig }
               ← { success: boolean, sessionId?: string }

'capture:stop' → { sessionId: string }
              ← { videoPath: string, duration: number }

'capture:pause' / 'capture:resume' → { sessionId: string }

// OCR Processing
'ocr:processFrame' → { imageData: ArrayBuffer }
                   ← { words: OcrWord[], processingTime: number }

'ocr:setLanguage' → { lang: string }

// Redaction
'redaction:analyze' → { sessionId: string }
                    ← { regions: RedactionRegion[], progress: number }

'redaction:apply' → { sessionId: string, map: RedactionMap }
                  ← { outputPath: string, progress: number }

// Export
'export:video' → { sessionId: string, options: ExportOptions }
              ← { outputPath: string, progress: number }
```

### 7.2 Types

```typescript
interface CaptureConfig {
  resolution: { width: number; height: number };
  fps: 30 | 60;
  audio: boolean;
  privacy: PrivacyConfig;
  ocrSamplingInterval: number;  // ms, 0 = disabled
}

interface RedactionRegion {
  id: string;
  startTime: number;
  endTime: number;
  bbox: { x: number; y: number; w: number; h: number };
  type: 'auto' | 'manual' | 'app-rule';
  piiType?: string;  // 'email', 'phone', etc.
  confidence?: number;
  style: 'blur' | 'black' | 'pixelate';
}

interface RedactionMap {
  sessionId: string;
  version: 1;
  regions: RedactionRegion[];
  appRules: AppBlurRule[];
  settings: {
    defaultStyle: 'blur' | 'black' | 'pixelate';
    blurRadius: number;
  };
}

interface AppBlurRule {
  appName: string;
  windowTitlePattern?: RegExp;
  action: 'blur-full' | 'blur-region' | 'block';
}
```

---

## 8. Testing Strategy

### 8.1 Unit Tests
- PII detection patterns (reuse existing)
- Redaction map serialization
- Time range calculations
- Bounding box merging

### 8.2 Integration Tests
- desktopCapturer source enumeration
- MediaRecorder output format
- FFmpeg filter generation
- SQLite schema operations

### 8.3 E2E Tests
- Full recording → redaction → export flow
- Permission request handling
- Large file processing
- Cross-platform behavior

### 8.4 Performance Tests
- OCR latency under load
- Memory usage during long recordings
- CPU usage with different sample rates
- FFmpeg processing time vs file size

---

## 9. Security Considerations

### 9.1 Electron Security Checklist
- [x] Context isolation enabled
- [x] Node integration disabled
- [x] Sandbox enabled
- [ ] Validate all IPC inputs
- [ ] Sanitize file paths
- [ ] Limit file system access scope

### 9.2 PII Handling
- Never log detected PII values
- Store redaction maps separately from videos
- Clear temporary files after processing
- Consider encryption for stored videos

### 9.3 Permissions
- Request minimum necessary permissions
- Explain why screen recording is needed
- Provide clear permission revocation path

---

## 10. Future Considerations

### 10.1 Potential Enhancements
- **Cloud backup** with end-to-end encryption
- **AI-powered detection** for faces, documents
- **Collaborative review** for team settings
- **Streaming output** for real-time sharing
- **Voice redaction** for audio PII
- **Scheduled recording** for automated captures

### 10.2 Performance Optimizations
- **WebGPU** for GPU-accelerated processing
- **WebCodecs** for lower-level video control
- **Native Tesseract** for faster OCR
- **Incremental OCR** only on changed regions

---

## Appendix A: Dependencies

```json
{
  "dependencies": {
    "@ffmpeg/ffmpeg": "^0.12.7",
    "@ffmpeg/util": "^0.12.1",
    "tesseract.js": "^5.0.4",
    "@screencapture/core": "workspace:*",
    "better-sqlite3": "^11.7.0"
  },
  "devDependencies": {
    "@electron/rebuild": "^3.6.0",
    "@types/dom-mediacapture-record": "^1.0.16"
  }
}
```

## Appendix B: References

1. [Electron desktopCapturer API](https://www.electronjs.org/docs/latest/api/desktop-capturer)
2. [Electron Screen Recorder Tutorial - Fireship](https://fireship.io/lessons/electron-screen-recorder-project-tutorial/)
3. [Tesseract.js Documentation](https://tesseract.projectnaptha.com/)
4. [FFmpeg.wasm GitHub](https://github.com/ffmpegwasm/ffmpeg.wasm)
5. [Real-time Video Filters with WebCodecs](https://transloadit.com/devtips/real-time-video-filters-in-browsers-with-ffmpeg-and-webcodecs/)
6. [WebGL Video Processing Analysis](https://github.com/dominique-mueller/javascript-video-processing-analysis)
7. [OCR Accuracy Benchmark 2025](https://research.aimultiple.com/ocr-accuracy/)
8. [Best Open-Source OCR Tools 2025](https://www.koncile.ai/en/ressources/is-tesseract-still-the-best-open-source-ocr)
