# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

A full-featured session recording and replay system built with rrweb, distributed as both a web application and browser extension. Captures DOM events and user interactions with comprehensive privacy controls, session history management, persistent storage, and import/export capabilities.

## Monorepo Structure

This is a pnpm workspace monorepo with the following packages:

- **`packages/app`** - React web application for recording and replaying sessions
  - Full-featured UI with session history, settings, and privacy controls
  - See `packages/app/CLAUDE.md` for detailed app architecture

- **`packages/extension`** - Browser extension (Chrome/Firefox/Edge)
  - Content script for injecting recording capability into web pages
  - Popup UI for controlling recordings
  - Background service worker for message passing

## Development Commands

### Prerequisites
- Node.js 22.12+ (currently using v22.21.1)
- pnpm 10+ (installed globally)

### Installation
```bash
# Install all dependencies
pnpm install
```

### Development
```bash
# Start web app development server (http://localhost:5173)
pnpm dev

# Build extension in watch mode (for development)
pnpm --filter @screencapture/extension dev

# Run specific package
pnpm --filter @screencapture/app dev
pnpm --filter @screencapture/extension dev
```

### Building
```bash
# Build everything for production
pnpm build

# Build specific package
pnpm --filter @screencapture/app build
pnpm --filter @screencapture/extension build
```

### Testing & Linting
```bash
# Run all tests
pnpm test

# Run linters
pnpm lint
```

## Extension Development

After building the extension:

1. Build the extension: `pnpm --filter @screencapture/extension build`
2. Open Chrome and navigate to `chrome://extensions/`
3. Enable "Developer mode" (top right)
4. Click "Load unpacked"
5. Select `packages/extension/dist` folder

The extension will:
- Add a browser action icon
- Inject recording capability into web pages
- Provide popup UI for controlling recordings
- Save recordings to chrome.storage

## Package Dependencies

- Both packages share rrweb as a core dependency
- Extension uses `@types/chrome` for Chrome Extension APIs
- App uses React, Vite, and rrweb-player for UI

## Key Technologies

- **pnpm workspaces**: Monorepo management
- **rrweb**: Session recording and replay
- **React 19**: UI framework (app only)
- **Vite**: Build tool for both packages
- **TypeScript**: Type safety across all packages
- **vite-plugin-web-extension**: Extension build plugin

## Important Notes

- Use `pnpm` not `npm` for all package management
- Extension manifest is v3 (modern Chrome extensions)
- Both packages can share code if needed via workspace protocol
- Extension needs placeholder icons before loading (see `packages/extension/public/icons/README.md`)
