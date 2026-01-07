# Screen Capture Browser Extension

A Chrome/Firefox browser extension for recording and replaying user sessions with rrweb.

## Features

- 🎥 Record user sessions on any website
- 🔒 Privacy controls (mask inputs, block sensitive elements)
- 💾 Save recordings to browser storage
- ▶️ View recording history
- 🎬 Simple popup UI for controlling recordings

## Development

### Build the Extension

```bash
# From monorepo root
pnpm --filter @screencapture/extension build

# Watch mode for development
pnpm --filter @screencapture/extension dev
```

### Load in Chrome

1. Build the extension (see above)
2. Open Chrome and go to `chrome://extensions/`
3. Enable "Developer mode" (toggle in top right)
4. Click "Load unpacked"
5. Select the `dist/` folder from this package

### Load in Firefox

1. Build the extension
2. Open Firefox and go to `about:debugging`
3. Click "This Firefox"
4. Click "Load Temporary Add-on"
5. Select the `dist/manifest.json` file

## Structure

```
src/
├── background/       # Service worker (message passing)
│   └── index.ts
├── content/          # Content script (injected into pages)
│   └── index.ts
├── popup/            # Extension popup UI
│   ├── index.html
│   └── index.ts
├── manifest.json     # Extension manifest (v3)
public/
└── icons/            # Extension icons (16, 48, 128px)
```

## How It Works

1. **Content Script** (`src/content/index.ts`)
   - Injected into every web page
   - Uses rrweb to record DOM events
   - Communicates with background and popup

2. **Background Script** (`src/background/index.ts`)
   - Service worker for message passing
   - Manages extension state
   - Handles storage operations

3. **Popup** (`src/popup/`)
   - UI for starting/stopping recordings
   - Shows recording status
   - Displays recent recordings
   - Privacy settings controls

## Privacy Features

- **Mask All Inputs**: Replace input values with asterisks
- **Block Sensitive Elements**: Hide elements with `.sensitive` or `.pii` classes

## Storage

Recordings are saved to `chrome.storage.local` with metadata:
- Recording ID
- Timestamp
- Duration
- Event count
- URL where recorded
- Privacy configuration

## Permissions

- `activeTab`: Access current tab for recording
- `storage`: Save recordings
- `tabs`: Communicate with tabs
- `<all_urls>`: Inject content script on all pages

## TODO

- Add placeholder icons to `public/icons/` (16x16, 48x48, 128x128 PNG)
- Export recordings as JSON files
- Sync recordings across devices
- Playback UI in extension
