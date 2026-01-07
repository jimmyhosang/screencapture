# Screen Capture - Session Recording & Replay

A comprehensive session recording and replay system built with [rrweb](https://www.rrweb.io/). Available as both a web application and browser extension.

## 📦 Packages

This is a pnpm monorepo containing:

- **[@screencapture/app](./packages/app)** - Full-featured React web application
- **[@screencapture/extension](./packages/extension)** - Chrome/Firefox browser extension

## ✨ Features

### Recording
- 🎥 Record complete user sessions (clicks, scrolls, inputs, mutations)
- 🔒 Privacy controls (mask inputs, block elements, redact PII)
- ⚡ High-performance recording (events stored in refs, not state)
- 📊 Configurable sampling rates

### Privacy
- **Mask All Inputs**: Replace form values with asterisks
- **Block Sensitive Elements**: Hide `.sensitive` or `.pii` classes
- **Mask PII Patterns**: Auto-redact emails, phones, SSNs, credit cards
- **Custom Masking**: Mask 4+ digit sequences

### Session Management
- 💾 Persistent localStorage storage
- 📤 Import/Export as JSON
- 🏷️ Session metadata (name, date, duration, event count)
- 📊 Storage usage tracking (configurable limits 10-200MB)
- 🔄 Auto-save or manual save options

### Playback
- ▶️ Full-screen player (95% viewport)
- ⏩ Speed controls (1x, 2x, 4x, 8x)
- ⏯️ Timeline with playback controls
- 📱 Responsive player sizing

## 🚀 Quick Start

### Prerequisites
- Node.js 22.12+ (we use v22.21.1)
- pnpm 10+

### Installation

```bash
# Install pnpm globally if you haven't
npm install -g pnpm

# Clone repository
git clone https://github.com/jimmyhosang/screencapture
cd screencapture

# Install all dependencies
pnpm install
```

### Run Web App

```bash
# Start development server
pnpm dev

# Open http://localhost:5173
```

### Build Extension

```bash
# Build extension
pnpm --filter @screencapture/extension build

# Load in Chrome:
# 1. Go to chrome://extensions/
# 2. Enable Developer mode
# 3. Click "Load unpacked"
# 4. Select packages/extension/dist/
```

## 📚 Documentation

- [Root CLAUDE.md](./CLAUDE.md) - Monorepo structure and commands
- [App CLAUDE.md](./packages/app/CLAUDE.md) - Detailed app architecture
- [Extension README](./packages/extension/README.md) - Extension development guide

## 🛠️ Development

### Build Commands

```bash
# Build everything
pnpm build

# Build specific package
pnpm --filter @screencapture/app build
pnpm --filter @screencapture/extension build

# Run tests
pnpm test

# Run linters
pnpm lint
```

### Project Structure

```
screencapture/
├── packages/
│   ├── app/              # React web application
│   │   ├── src/
│   │   │   ├── components/  # SessionHistory, Settings, PlayerModal
│   │   │   ├── hooks/       # useRecorder, useSessionManager
│   │   │   ├── utils/       # sessionStorage utilities
│   │   │   └── App.tsx
│   │   └── package.json
│   └── extension/        # Browser extension
│       ├── src/
│       │   ├── background/  # Service worker
│       │   ├── content/     # Content script (rrweb injection)
│       │   ├── popup/       # Extension popup UI
│       │   └── manifest.json
│       └── package.json
├── pnpm-workspace.yaml   # pnpm workspace config
└── package.json          # Root package with scripts
```

## 🎯 Use Cases

### Web App
- **User Testing**: Record and analyze user interactions
- **Bug Reproduction**: Capture exact steps leading to bugs
- **Training**: Record demos and walkthroughs
- **Analytics**: Understand user behavior patterns

### Extension
- **QA Testing**: Record sessions while testing web apps
- **Support**: Users can record issues and send recordings
- **Compliance**: Capture sessions for audit trails
- **Research**: UX research and usability testing

## 🔧 Technical Stack

- **Frontend**: React 19, TypeScript, Vite
- **Recording**: rrweb, rrweb-player
- **Monorepo**: pnpm workspaces
- **Storage**: localStorage (app), chrome.storage (extension)
- **Build**: Vite, vite-plugin-web-extension

## 📝 License

MIT

## 🤝 Contributing

Contributions welcome! Please read the documentation in each package for development guidelines.

## 🔗 Links

- [rrweb Documentation](https://www.rrweb.io/)
- [Chrome Extension Docs](https://developer.chrome.com/docs/extensions/)
- [pnpm Workspaces](https://pnpm.io/workspaces)
