# @screencapture/extension

Chrome browser extension for screencapture - record and replay browser sessions with privacy-first PII redaction.

## Features

- **Session Recording**: Record DOM interactions using rrweb
- **PII Redaction**: Automatic redaction of emails, phone numbers, SSNs, credit cards
- **Privacy Controls**: Mask inputs, block elements, configurable redaction settings
- **Session Management**: Save, export, and delete recordings via chrome.storage
- **Visual Indicator**: Shows recording status on page

## Installation (Development)

1. Build the extension:
   ```bash
   # From the monorepo root
   pnpm install
   pnpm --filter @screencapture/extension build
   ```

2. Load in Chrome:
   - Open `chrome://extensions/`
   - Enable "Developer mode" (top right toggle)
   - Click "Load unpacked"
   - Select the `packages/extension/dist` folder

## Development

```bash
# Watch mode (rebuilds on file changes)
pnpm --filter @screencapture/extension dev

# Build once
pnpm --filter @screencapture/extension build
```

## Architecture

```
packages/extension/
├── src/
│   ├── background/       # Service worker - session management, chrome.storage
│   │   └── index.ts
│   ├── content/          # Content script - rrweb recording, PII redaction
│   │   └── index.ts
│   ├── popup/            # React popup UI
│   │   ├── App.tsx
│   │   ├── main.tsx
│   │   ├── styles.css
│   │   └── index.html
│   └── types/            # Shared TypeScript types
│       └── index.ts
├── public/
│   ├── manifest.json     # Chrome MV3 manifest
│   └── icons/            # Extension icons
├── dist/                 # Built extension (load this in Chrome)
├── vite.config.ts        # Vite build config
├── tsconfig.json         # TypeScript config
└── package.json
```

## Privacy Settings

The extension supports configurable privacy settings:

- **Mask All Inputs**: Replace all input values with asterisks
- **Mask Text Content**: Apply PII pattern redaction to text
- **Block Selectors**: CSS selectors for elements to exclude from recording
- **Redaction Config**: Toggle which PII types to redact (email, phone, SSN, credit card)

## Storage

- Sessions are stored in `chrome.storage.local`
- Settings are synced via `chrome.storage.sync`
- Default storage limit: 50MB (configurable)

## Shared Code

The extension uses `@screencapture/core` for:
- PII detection and redaction utilities
- Privacy configuration types
- Performance utilities

## Future Plans

- Native messaging for desktop app integration
- Firefox support
- Session replay in popup
- Cloud sync support
