import { useEffect, useRef, useState, useCallback } from 'react';
import rrwebPlayer from 'rrweb-player';
import type { eventWithTime } from '@rrweb/types';
import { RedactionVerifier } from './RedactionVerifier';
import 'rrweb-player/dist/style.css';
import './PlayerModal.css';

interface PlayerModalProps {
  isOpen: boolean;
  onClose: () => void;
  events: eventWithTime[];
}

type TabId = 'player' | 'verifier';

export function PlayerModal({ isOpen, onClose, events }: PlayerModalProps) {
  const [activeTab, setActiveTab] = useState<TabId>('player');
  const playerContainerRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<rrwebPlayer | null>(null);

  useEffect(() => {
    if (!isOpen || !playerContainerRef.current || events.length < 2) {
      return;
    }

    // Only create player when on player tab
    if (activeTab !== 'player') {
      return;
    }

    // Clear any existing player
    if (playerRef.current) {
      playerRef.current.pause();
      playerRef.current = null;
    }
    playerContainerRef.current.innerHTML = '';

    // Calculate player dimensions based on viewport (accounting for modal padding and header)
    const width = Math.floor(window.innerWidth * 0.9);
    const height = Math.floor(window.innerHeight * 0.85) - 60; // Account for tabs

    // Create new player
    playerRef.current = new rrwebPlayer({
      target: playerContainerRef.current,
      props: {
        events,
        width,
        height,
        autoPlay: true,
        showController: true,
        speedOption: [1, 2, 4, 8],
      },
    });

    return () => {
      if (playerRef.current) {
        playerRef.current.pause();
        playerRef.current = null;
      }
    };
  }, [isOpen, events, activeTab]);

  // Handle closing - reset tab and call onClose
  const handleClose = useCallback(() => {
    setActiveTab('player');
    onClose();
  }, [onClose]);

  // Seek to a specific time in the player
  const handleSeekTo = useCallback((timeOffset: number) => {
    // Switch to player tab first
    setActiveTab('player');

    // Need a small delay to ensure player is rendered
    setTimeout(() => {
      if (playerRef.current) {
        playerRef.current.goto(timeOffset);
        playerRef.current.play();
      }
    }, 100);
  }, []);

  if (!isOpen) return null;

  return (
    <div className="player-modal-overlay" onClick={handleClose}>
      <div className="player-modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="player-modal-header">
          <h2>Session Playback</h2>
          <button className="player-modal-close" onClick={handleClose}>
            ×
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="player-modal-tabs">
          <button
            className={`player-modal-tab ${activeTab === 'player' ? 'active' : ''}`}
            onClick={() => setActiveTab('player')}
          >
            <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16">
              <path d="M8 5v14l11-7z" />
            </svg>
            Player
          </button>
          <button
            className={`player-modal-tab ${activeTab === 'verifier' ? 'active' : ''}`}
            onClick={() => setActiveTab('verifier')}
          >
            <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16">
              <path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm-2 16l-4-4 1.41-1.41L10 14.17l6.59-6.59L18 9l-8 8z" />
            </svg>
            Verify Redactions
          </button>
        </div>

        <div className="player-modal-body">
          {events.length < 2 ? (
            <p className="player-modal-empty">
              No recording available. Start recording a session first.
            </p>
          ) : (
            <>
              {/* Player Tab */}
              <div
                className={`player-tab-content ${activeTab === 'player' ? 'active' : ''}`}
              >
                <div ref={playerContainerRef} className="player-container" />
              </div>

              {/* Verifier Tab */}
              <div
                className={`player-tab-content ${activeTab === 'verifier' ? 'active' : ''}`}
              >
                {activeTab === 'verifier' && (
                  <RedactionVerifier events={events} onSeekTo={handleSeekTo} />
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
