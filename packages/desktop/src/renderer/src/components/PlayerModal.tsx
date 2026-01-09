import { useEffect, useRef } from 'react';
import rrwebPlayer from 'rrweb-player';
import 'rrweb-player/dist/style.css';

interface Session {
  id: string;
  name: string;
  timestamp: number;
  duration: number;
  eventCount: number;
  events?: unknown[];
}

interface PlayerModalProps {
  session: Session;
  onClose: () => void;
}

function PlayerModal({ session, onClose }: PlayerModalProps): JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<rrwebPlayer | null>(null);

  useEffect(() => {
    if (!containerRef.current || !session.events || session.events.length === 0) {
      return;
    }

    // Clean up existing player
    if (playerRef.current) {
      playerRef.current.pause();
      playerRef.current = null;
    }

    // Clear container
    containerRef.current.innerHTML = '';

    // Calculate player dimensions
    const containerWidth = containerRef.current.clientWidth;
    const containerHeight = containerRef.current.clientHeight;

    // Create new player
    playerRef.current = new rrwebPlayer({
      target: containerRef.current,
      props: {
        events: session.events as Parameters<typeof rrwebPlayer>[0]['props']['events'],
        width: containerWidth,
        height: containerHeight,
        autoPlay: true,
        showController: true,
        speedOption: [1, 2, 4, 8]
      }
    });

    return () => {
      if (playerRef.current) {
        playerRef.current.pause();
        playerRef.current = null;
      }
    };
  }, [session]);

  // Handle escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>{session.name}</h3>
          <button className="btn btn-secondary" onClick={onClose}>
            Close (Esc)
          </button>
        </div>
        <div className="modal-body" ref={containerRef} />
      </div>
    </div>
  );
}

export default PlayerModal;
