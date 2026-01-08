# @screencapture/desktop

Electron desktop app for session recording and replay with privacy controls.

## Features

- **SQLite Database**: Persistent local storage for all sessions
- **Session Management**: Import, export, search, and filter sessions
- **rrweb Player**: Full-featured playback with speed controls
- **System Tray**: Quick access to import and app controls
- **Privacy Settings**: Configure default privacy for recordings
- **Cross-Platform**: Builds for macOS, Windows, and Linux

## Development

```bash
# Install dependencies (from monorepo root)
pnpm install

# Start development
pnpm --filter @screencapture/desktop dev

# Build for production
pnpm --filter @screencapture/desktop build
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
├── main/           # Electron main process
│   ├── index.ts    # App entry, window, tray, IPC
│   ├── database.ts # SQLite setup and queries
│   └── types.ts    # Shared types
├── preload/        # Context bridge
│   └── index.ts    # Secure API exposure
└── renderer/       # React UI
    └── src/
        ├── App.tsx
        ├── components/
        │   ├── Dashboard.tsx
        │   ├── SessionList.tsx
        │   ├── PlayerModal.tsx
        │   └── Settings.tsx
        └── styles/
            └── index.css
```

## Importing Sessions

1. Click "Import Session" in the sidebar
2. Select a JSON file exported from the web app or extension
3. The session will be stored in SQLite and appear in the list

Supported formats:
- Single session JSON (from web app export)
- Array of sessions (batch export)
- Extension session exports

## Security

- Context isolation enabled
- Node integration disabled
- Sandboxed renderer process
- IPC-based communication only
