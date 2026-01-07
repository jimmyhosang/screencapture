# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

A full-featured React session recording and replay application built with rrweb. Captures DOM events and user interactions with comprehensive privacy controls, session history management, persistent storage, and import/export capabilities.

## Development Commands

```bash
# Install dependencies
npm install

# Start development server (http://localhost:5173)
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview

# Run linter
npm run lint
```

## Architecture

### Core Components

**useRecorder Hook** (`src/hooks/useRecorder.ts`)
- Custom hook that wraps rrweb's recording API
- Manages recording state (isRecording, events array)
- Supports configurable privacy settings passed at recording start
- Privacy features: input masking, sensitive element blocking, PII pattern redaction, custom masking
- Stores events in ref during recording to prevent performance issues
- Returns: `startRecording(config)`, `stopRecording()`, `clearEvents()` functions and current state

**useSessionManager Hook** (`src/hooks/useSessionManager.ts`)
- Manages session history and localStorage persistence
- Tracks all saved recordings with metadata (name, timestamp, duration, event count)
- Provides: save, load, delete, export, import, and storage statistics
- Auto-save capability based on settings
- Enforces storage limits and provides storage usage stats

**App Component** (`src/App.tsx`)
- Main application with two-panel layout: session history (left) and recording controls (right)
- Integrates all hooks and components
- Handles auto-save vs manual save prompt based on settings
- Manages privacy configuration UI and recording state
- Demo elements showcase different interaction types that rrweb can capture

**SessionHistory Component** (`src/components/SessionHistory.tsx`)
- Left sidebar displaying all saved recordings
- Features: play, delete, export per session; import, export all, clear all
- Shows storage usage with visual progress bar
- Displays session metadata (name, date, duration, event count, privacy tags)
- Highlights currently playing session

**Settings Component** (`src/components/Settings.tsx`)
- Modal for configuring application settings
- Default privacy settings for new recordings
- Storage limit configuration (10-200 MB slider)
- Auto-save toggle
- Recording quality settings (mouse tracking, scroll sampling interval)

**PlayerModal Component** (`src/components/PlayerModal.tsx`)
- Full-screen modal wrapper for rrweb-player (95% viewport)
- Dynamically sized player (90% width × 85% height of window)
- Creates new rrwebPlayer instance when modal opens
- Speed controls (1x, 2x, 4x, 8x), autoPlay enabled
- Cleans up player instance on unmount to prevent memory leaks
- Plays either current recording or selected session from history

### Data Flow

**Recording Flow:**
1. User configures privacy settings (or uses defaults from Settings)
2. User clicks "Start Recording" → `useRecorder.startRecording(privacyConfig)` → rrweb.record() begins
3. Events accumulate in `eventsRef` (not state - prevents re-renders)
4. User clicks "Stop Recording" → `stopRecording()` called → events synced to state
5. If auto-save enabled: session automatically saved to localStorage
6. If auto-save disabled: save prompt modal appears, user can name and save or discard

**Playback Flow:**
1. User clicks "Play Recording" (current) or clicks play on saved session
2. Session events loaded (from current recording or localStorage)
3. PlayerModal opens with events → new rrwebPlayer instance created
4. Player renders session in full-screen modal with playback controls

**Storage Flow:**
- Sessions saved to localStorage under `rrweb_sessions` key
- Settings saved to localStorage under `rrweb_settings` key
- Storage limit enforced before save (default 50MB, configurable 10-200MB)
- Sessions include: id, name, timestamp, duration, eventCount, events array, privacyConfig

## Key Technologies

- **rrweb**: Records and replays sessions by serializing DOM mutations and user interactions
- **rrweb-player**: Pre-built player component with timeline, speed controls, and playback controls
- **React 19**: Latest React with new features (no React Compiler enabled)
- **Vite**: Build tool with HMR (Hot Module Replacement)
- **TypeScript**: Strict type checking enabled via tsconfig files

## Key Features

### Privacy Controls
- **Mask All Inputs**: Replaces input values with asterisks during recording
- **Block Sensitive Elements**: Hides elements with `.sensitive` or `.pii` CSS classes
- **Mask PII Patterns**: Auto-redacts emails, phones, SSNs, credit cards using regex
- **Custom Mask Function**: Masks any sequence of 4+ digits
- Privacy settings can be configured per-recording or set as defaults in Settings

### Session Management
- **Persistent Storage**: All recordings saved to browser localStorage
- **Session Metadata**: Name, timestamp, duration, event count, privacy config
- **Storage Stats**: Real-time usage display with configurable limits
- **Auto-Save**: Optional automatic saving when recording stops
- **Import/Export**: Download sessions as JSON files, import previously saved sessions
- **Batch Operations**: Export all sessions, clear all sessions

### Performance Optimizations
- Events stored in ref during recording (not state) to prevent hundreds of re-renders per second
- Only sync events to state when recording stops
- Configurable sampling rates for mouse/scroll events

## Important Notes

- rrweb events are of type `eventWithTime` from `@rrweb/types`
- The first event is always a full DOM snapshot (Meta event), subsequent events are incremental mutations
- Sessions are stored in browser localStorage - clearing browser data will delete all recordings
- Large recordings can consume significant storage - monitor usage in SessionHistory panel
- Privacy masking happens during recording, not playback - cannot be changed retroactively
- Default privacy config loaded from Settings when app starts
- Player dynamically sizes to window dimensions for full-screen experience
