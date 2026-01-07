import { useEffect, useRef } from 'react';
import rrwebPlayer from 'rrweb-player';
import type { eventWithTime } from '@rrweb/types';
import 'rrweb-player/dist/style.css';
import './PlayerModal.css';

interface PlayerModalProps {
  isOpen: boolean;
  onClose: () => void;
  events: eventWithTime[];
}

export function PlayerModal({ isOpen, onClose, events }: PlayerModalProps) {
  const playerContainerRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<rrwebPlayer | null>(null);

  useEffect(() => {
    if (!isOpen || !playerContainerRef.current || events.length < 2) {
      return;
    }

    // Clear any existing player
    if (playerRef.current) {
      playerRef.current.pause();
      playerRef.current = null;
    }
    playerContainerRef.current.innerHTML = '';

    // Create new player
    playerRef.current = new rrwebPlayer({
      target: playerContainerRef.current,
      props: {
        events,
        width: 800,
        height: 500,
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
  }, [isOpen, events]);

  if (!isOpen) return null;

  return (
    <div className="player-modal-overlay" onClick={onClose}>
      <div className="player-modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="player-modal-header">
          <h2>Session Playback</h2>
          <button className="player-modal-close" onClick={onClose}>
            ×
          </button>
        </div>
        <div className="player-modal-body">
          {events.length < 2 ? (
            <p className="player-modal-empty">
              No recording available. Start recording a session first.
            </p>
          ) : (
            <div ref={playerContainerRef} className="player-container" />
          )}
        </div>
      </div>
    </div>
  );
}
