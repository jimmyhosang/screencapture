# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

A React session recording and replay application built with rrweb. This demo app captures DOM events and user interactions, then allows playback of those recorded sessions using rrweb-player.

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
- Configuration: `maskAllInputs: false` to capture text input, `recordCanvas: true` for canvas recording
- Sampling configuration controls mouse movement and scroll event granularity
- Returns: `startRecording()`, `stopRecording()`, `clearEvents()` functions and current state

**App Component** (`src/App.tsx`)
- Main application with recording controls and demo UI
- Demo elements (counter, text input, hover boxes, scrollable content) showcase different interaction types that rrweb can capture
- Manages PlayerModal open/close state
- Stops recording before opening player to ensure all events are captured

**PlayerModal Component** (`src/components/PlayerModal.tsx`)
- Modal wrapper for rrweb-player
- Creates new rrwebPlayer instance when modal opens with recorded events
- Player configuration: 800x500 viewport, autoPlay enabled, speed controls (1x, 2x, 4x, 8x)
- Cleans up player instance on unmount to prevent memory leaks
- Requires minimum 2 events to enable playback (full snapshot + at least one incremental event)

### Data Flow

1. User clicks "Start Recording" → `useRecorder.startRecording()` → rrweb.record() begins emitting events
2. Events accumulate in state via `setEvents()` callback
3. User clicks "Stop Recording" or "Play Recording" → `stopRecording()` called
4. Events passed to PlayerModal → new rrwebPlayer instance created with events array
5. Player renders recorded session with full playback controls

## Key Technologies

- **rrweb**: Records and replays sessions by serializing DOM mutations and user interactions
- **rrweb-player**: Pre-built player component with timeline, speed controls, and playback controls
- **React 19**: Latest React with new features (no React Compiler enabled)
- **Vite**: Build tool with HMR (Hot Module Replacement)
- **TypeScript**: Strict type checking enabled via tsconfig files

## Important Notes

- rrweb events are of type `eventWithTime` from `@rrweb/types`
- The first event is always a full DOM snapshot (Meta event), subsequent events are incremental mutations
- Recording must be stopped before playback to prevent concurrent recording/playback issues
- PlayerModal clears and recreates player on each open to ensure fresh state
- Event array persists after stopping recording until explicitly cleared with `clearEvents()`
