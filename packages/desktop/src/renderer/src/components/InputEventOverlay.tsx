/**
 * Input Event Overlay Component
 *
 * Renders visual indicators for mouse clicks, cursor position,
 * keyboard input, and scroll events synchronized with video playback.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import './InputEventOverlay.css';

// Types
export interface InputEvent {
  timestamp: number;
  type: 'click' | 'keydown' | 'keyup' | 'scroll' | 'mousemove';
  x?: number;
  y?: number;
  button?: number;
  keycode?: number;
  key?: string;
  scrollDelta?: { x: number; y: number };
  duration?: number;
  modifiers?: {
    ctrl: boolean;
    alt: boolean;
    shift: boolean;
    meta: boolean;
  };
}

interface InputEventOverlayProps {
  events: InputEvent[];
  currentTimeMs: number;
  recordingStartMs: number;
  videoWidth: number;
  videoHeight: number;
  sourceWidth: number;
  sourceHeight: number;
  showCursor?: boolean;
  showClicks?: boolean;
  showKeystrokes?: boolean;
  showScrollIndicators?: boolean;
  keystrokeFadeDuration?: number;
}

interface ClickRipple {
  id: string;
  x: number;
  y: number;
  timestamp: number;
  button: number;
}

interface KeystrokeDisplay {
  id: string;
  key: string;
  modifiers?: InputEvent['modifiers'];
  timestamp: number;
}

interface ScrollIndicator {
  id: string;
  x: number;
  y: number;
  deltaY: number;
  timestamp: number;
}

// Format key for display
function formatKey(event: InputEvent): string {
  const parts: string[] = [];

  if (event.modifiers?.ctrl) parts.push('Ctrl');
  if (event.modifiers?.alt) parts.push('Alt');
  if (event.modifiers?.shift) parts.push('Shift');
  if (event.modifiers?.meta) parts.push('⌘');

  // Format the key name
  let keyName = event.key || '';

  // Handle special keys
  const specialKeys: Record<number, string> = {
    8: '⌫',      // Backspace
    9: 'Tab',
    13: '↵',     // Enter
    27: 'Esc',
    32: 'Space',
    37: '←',
    38: '↑',
    39: '→',
    40: '↓',
    46: 'Del',
  };

  if (event.keycode && specialKeys[event.keycode]) {
    keyName = specialKeys[event.keycode];
  } else if (keyName.length === 1) {
    keyName = keyName.toUpperCase();
  }

  if (keyName) {
    parts.push(keyName);
  }

  return parts.join(' + ');
}

export default function InputEventOverlay({
  events,
  currentTimeMs,
  recordingStartMs,
  videoWidth,
  videoHeight,
  sourceWidth,
  sourceHeight,
  showCursor = true,
  showClicks = true,
  showKeystrokes = true,
  showScrollIndicators = true,
  keystrokeFadeDuration = 2000
}: InputEventOverlayProps): JSX.Element {
  // State for visual effects
  const [cursorPosition, setCursorPosition] = useState<{ x: number; y: number } | null>(null);
  const [clickRipples, setClickRipples] = useState<ClickRipple[]>([]);
  const [keystrokes, setKeystrokes] = useState<KeystrokeDisplay[]>([]);
  const [scrollIndicators, setScrollIndicators] = useState<ScrollIndicator[]>([]);

  // Track last processed event index
  const lastProcessedIndex = useRef(-1);
  const processedEventIds = useRef<Set<string>>(new Set());

  // Scale factor for coordinates
  const scaleX = videoWidth / sourceWidth;
  const scaleY = videoHeight / sourceHeight;

  // Process events up to current time
  useEffect(() => {
    const currentAbsoluteTime = recordingStartMs + currentTimeMs;

    // Find events that should be active now
    const activeEvents = events.filter((event, index) => {
      const eventId = `${event.timestamp}-${index}`;
      const eventRelativeTime = event.timestamp;
      const isInRange = eventRelativeTime <= currentTimeMs;
      const isRecent = currentTimeMs - eventRelativeTime < 500; // 500ms window

      return isInRange && isRecent && !processedEventIds.current.has(eventId);
    });

    // Process new events
    activeEvents.forEach((event, idx) => {
      const eventId = `${event.timestamp}-${events.indexOf(event)}`;
      processedEventIds.current.add(eventId);

      // Update cursor position for mouse events
      if ((event.type === 'click' || event.type === 'mousemove') && event.x !== undefined && event.y !== undefined) {
        setCursorPosition({ x: event.x * scaleX, y: event.y * scaleY });
      }

      // Add click ripple
      if (event.type === 'click' && event.x !== undefined && event.y !== undefined && showClicks) {
        const ripple: ClickRipple = {
          id: `click-${Date.now()}-${idx}`,
          x: event.x * scaleX,
          y: event.y * scaleY,
          timestamp: Date.now(),
          button: event.button || 0
        };
        setClickRipples(prev => [...prev, ripple]);

        // Remove ripple after animation
        setTimeout(() => {
          setClickRipples(prev => prev.filter(r => r.id !== ripple.id));
        }, 600);
      }

      // Add keystroke display
      if (event.type === 'keydown' && showKeystrokes && event.key) {
        const keystroke: KeystrokeDisplay = {
          id: `key-${Date.now()}-${idx}`,
          key: formatKey(event),
          modifiers: event.modifiers,
          timestamp: Date.now()
        };
        setKeystrokes(prev => [...prev.slice(-5), keystroke]); // Keep last 5 keystrokes

        // Remove after fade duration
        setTimeout(() => {
          setKeystrokes(prev => prev.filter(k => k.id !== keystroke.id));
        }, keystrokeFadeDuration);
      }

      // Add scroll indicator
      if (event.type === 'scroll' && showScrollIndicators && event.x !== undefined && event.y !== undefined) {
        const indicator: ScrollIndicator = {
          id: `scroll-${Date.now()}-${idx}`,
          x: event.x * scaleX,
          y: event.y * scaleY,
          deltaY: event.scrollDelta?.y || 0,
          timestamp: Date.now()
        };
        setScrollIndicators(prev => [...prev, indicator]);

        // Remove after animation
        setTimeout(() => {
          setScrollIndicators(prev => prev.filter(s => s.id !== indicator.id));
        }, 400);
      }
    });

    // Clear old processed IDs periodically
    if (processedEventIds.current.size > 1000) {
      processedEventIds.current.clear();
    }
  }, [currentTimeMs, events, recordingStartMs, scaleX, scaleY, showClicks, showKeystrokes, showScrollIndicators, keystrokeFadeDuration]);

  // Reset state when seeking backwards
  useEffect(() => {
    // Simple reset on significant time change
    processedEventIds.current.clear();
    setClickRipples([]);
    setScrollIndicators([]);
  }, [Math.floor(currentTimeMs / 1000)]); // Reset every second of playback

  return (
    <div className="input-event-overlay">
      {/* Custom cursor */}
      {showCursor && cursorPosition && (
        <div
          className="cursor-indicator"
          style={{
            transform: `translate(${cursorPosition.x}px, ${cursorPosition.y}px)`
          }}
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
            <path
              d="M5 3L19 12L12 13L9 20L5 3Z"
              fill="white"
              stroke="black"
              strokeWidth="1.5"
            />
          </svg>
        </div>
      )}

      {/* Click ripples */}
      {clickRipples.map(ripple => (
        <div
          key={ripple.id}
          className={`click-ripple ${ripple.button === 2 ? 'right-click' : ''}`}
          style={{
            left: ripple.x,
            top: ripple.y
          }}
        >
          <span className="ripple-ring" />
          <span className="ripple-ring delay" />
        </div>
      ))}

      {/* Scroll indicators */}
      {scrollIndicators.map(indicator => (
        <div
          key={indicator.id}
          className={`scroll-indicator ${indicator.deltaY > 0 ? 'scroll-down' : 'scroll-up'}`}
          style={{
            left: indicator.x,
            top: indicator.y
          }}
        >
          {indicator.deltaY > 0 ? '↓' : '↑'}
        </div>
      ))}

      {/* Keystroke display */}
      {keystrokes.length > 0 && (
        <div className="keystroke-display">
          {keystrokes.map(keystroke => (
            <span key={keystroke.id} className="keystroke-key">
              {keystroke.key}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
