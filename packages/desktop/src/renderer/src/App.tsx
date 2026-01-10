import { useState, useEffect, useCallback } from 'react';
import Dashboard from './components/Dashboard';
import SessionList from './components/SessionList';
import PlayerModal from './components/PlayerModal';
import VideoPlayerModal from './components/VideoPlayerModal';
import Settings from './components/Settings';
import RecordingControls from './components/RecordingControls';
import DesktopCaptureControls from './components/DesktopCaptureControls';
import OCRTestMode from './components/OCRTestMode';
import { initializeMediaCapture, cleanupMediaCapture } from './services/media-capture';

type View = 'dashboard' | 'settings' | 'record';
type RecordMode = 'url' | 'desktop';

interface Session {
  id: string;
  name: string;
  timestamp: number;
  duration: number;
  eventCount: number;
  events?: unknown[];
  privacyConfig?: {
    maskInputs: boolean;
    blockSensitive: boolean;
    maskPiiPatterns: boolean;
  } | null;
  // Desktop recording fields
  isDesktopRecording?: boolean;
  filePath?: string;
  thumbnailBase64?: string;
  resolution?: string;
}

interface Stats {
  sessionCount: number;
  totalDuration: number;
  totalEvents: number;
  averageDuration: number;
}

function App(): JSX.Element {
  const [view, setView] = useState<View>('dashboard');
  const [recordMode, setRecordMode] = useState<RecordMode>('desktop');
  const [sessions, setSessions] = useState<Session[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [selectedSession, setSelectedSession] = useState<Session | null>(null);
  const [playingSession, setPlayingSession] = useState<Session | null>(null);
  const [playingVideo, setPlayingVideo] = useState<{ filePath: string; title: string; recordingId: string } | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [showOCRTest, setShowOCRTest] = useState(false);

  const loadSessions = useCallback(async () => {
    const allSessions: Session[] = [];

    // Load URL recording sessions (rrweb)
    if (window.api?.sessions?.getAll) {
      try {
        const urlSessions = await window.api.sessions.getAll();
        allSessions.push(...urlSessions);
      } catch (err) {
        console.error('Failed to load URL sessions:', err);
      }
    }

    // Load desktop recording sessions from indexer
    if (window.api?.indexer?.list) {
      try {
        const result = await window.api.indexer.list({}, 1, 100);
        const desktopSessions = result.recordings.map((rec: {
          id: string;
          filename: string;
          startTime: number;
          duration: number;
          filePath: string;
          thumbnailBase64?: string;
          resolution?: string;
        }) => ({
          id: rec.id,
          name: rec.filename.replace('.webm', ''),
          timestamp: rec.startTime,
          duration: rec.duration,
          eventCount: 0,
          isDesktopRecording: true,
          filePath: rec.filePath,
          thumbnailBase64: rec.thumbnailBase64,
          resolution: rec.resolution
        }));
        allSessions.push(...desktopSessions);
      } catch (err) {
        console.error('Failed to load desktop recordings:', err);
      }
    }

    // Sort by timestamp descending (newest first)
    allSessions.sort((a, b) => b.timestamp - a.timestamp);
    setSessions(allSessions);
  }, []);

  const loadStats = useCallback(async () => {
    if (!window.api?.sessions?.stats) {
      console.error('window.api.sessions.stats is not available');
      return;
    }
    const sessionStats = await window.api.sessions.stats();
    setStats(sessionStats);
  }, []);

  useEffect(() => {
    loadSessions();
    loadStats();

    // Initialize media capture service for desktop recording
    initializeMediaCapture();

    // Listen for import events from tray
    if (window.api?.on?.importSessionFile) {
      window.api.on.importSessionFile(async (filePath: string) => {
        const imported = await window.api.sessions.import(filePath);
        if (imported) {
          loadSessions();
          loadStats();
        }
      });
    }

    // Cleanup on unmount
    return () => {
      cleanupMediaCapture();
    };
  }, [loadSessions, loadStats]);

  const handleImport = async () => {
    const filePath = await window.api.dialog.openFile();
    if (filePath) {
      const imported = await window.api.sessions.import(filePath);
      if (imported) {
        loadSessions();
        loadStats();
      }
    }
  };

  const handleExport = async (id: string) => {
    await window.api.sessions.export(id);
  };

  const handleDelete = async (id: string) => {
    // Check if this is a desktop recording
    const session = sessions.find(s => s.id === id);
    let confirmed = false;

    if (session?.isDesktopRecording && window.api?.indexer?.delete) {
      // Delete from indexer (desktop recordings)
      confirmed = await window.api.indexer.delete(id);
    } else {
      // Delete from sessions (URL recordings)
      confirmed = await window.api.sessions.delete(id);
    }

    if (confirmed) {
      if (selectedSession?.id === id) {
        setSelectedSession(null);
      }
      loadSessions();
      loadStats();
    }
  };

  const handlePlay = async (session: Session) => {
    if (session.isDesktopRecording && session.filePath) {
      // For desktop recordings, use in-app video player
      setPlayingVideo({
        filePath: session.filePath,
        title: session.name,
        recordingId: session.id
      });
      return;
    }

    // Load full session with events (URL recordings)
    const fullSession = await window.api.sessions.get(session.id);
    if (fullSession && fullSession.events) {
      setPlayingSession(fullSession);
    }
  };

  const filteredSessions = sessions.filter((session) =>
    session.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="app">
      {/* Sidebar */}
      <div className="sidebar">
        <div className="sidebar-header">
          <h1>Screencapture</h1>
          <p>Session Recording & Replay</p>
        </div>

        {/* Navigation */}
        <div className="nav-tabs">
          <button
            className={`nav-tab ${view === 'dashboard' ? 'active' : ''}`}
            onClick={() => setView('dashboard')}
          >
            Dashboard
          </button>
          <button
            className={`nav-tab ${view === 'record' ? 'active' : ''}`}
            onClick={() => setView('record')}
          >
            Record
          </button>
          <button
            className={`nav-tab ${view === 'settings' ? 'active' : ''}`}
            onClick={() => setView('settings')}
          >
            Settings
          </button>
        </div>

        {/* Search */}
        <input
          type="text"
          className="search-input"
          placeholder="Search sessions..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />

        {/* Session list */}
        <SessionList
          sessions={filteredSessions}
          selectedId={selectedSession?.id || null}
          onSelect={setSelectedSession}
          onPlay={handlePlay}
          onExport={handleExport}
          onDelete={handleDelete}
        />

        {/* Toolbar */}
        <div className="toolbar">
          <button className="btn btn-primary" onClick={handleImport}>
            Import Session
          </button>
          <button className="btn btn-secondary" onClick={() => setShowOCRTest(true)}>
            OCR Test
          </button>
        </div>
      </div>

      {/* Main content */}
      <div className="main-content">
        {view === 'dashboard' && (
          <Dashboard
            stats={stats}
            selectedSession={selectedSession}
            onPlay={handlePlay}
          />
        )}
        {view === 'record' && (
          <div className="record-view">
            {/* Record Mode Tabs */}
            <div className="record-mode-tabs">
              <button
                className={`mode-tab ${recordMode === 'desktop' ? 'active' : ''}`}
                onClick={() => setRecordMode('desktop')}
              >
                🖥️ Desktop Capture
              </button>
              <button
                className={`mode-tab ${recordMode === 'url' ? 'active' : ''}`}
                onClick={() => setRecordMode('url')}
              >
                🌐 URL Recording
              </button>
            </div>

            {/* Desktop Capture Mode */}
            {recordMode === 'desktop' && (
              <DesktopCaptureControls
                onRecordingComplete={async (result) => {
                  // Reload sessions after desktop capture
                  loadSessions();
                  loadStats();
                  setView('dashboard');
                }}
              />
            )}

            {/* URL Recording Mode */}
            {recordMode === 'url' && (
              <RecordingControls
                onRecordingComplete={async (events, duration, privacyConfig) => {
                  // Save the recording as a new session
                  const session = {
                    id: crypto.randomUUID(),
                    name: `Recording ${new Date().toLocaleString()}`,
                    timestamp: Date.now(),
                    duration,
                    eventCount: events.length,
                    events,
                    privacyConfig: {
                      maskInputs: privacyConfig.maskAllInputs,
                      blockSensitive: privacyConfig.blockSensitive,
                      maskPiiPatterns: privacyConfig.maskPiiPatterns
                    }
                  };
                  await window.api.sessions.save(session);
                  loadSessions();
                  loadStats();
                  setView('dashboard');
                }}
              />
            )}
          </div>
        )}
        {view === 'settings' && <Settings />}
      </div>

      {/* Player modal for URL recordings */}
      {playingSession && playingSession.events && (
        <PlayerModal
          session={playingSession}
          onClose={() => setPlayingSession(null)}
        />
      )}

      {/* Video player modal for desktop recordings */}
      {playingVideo && (
        <VideoPlayerModal
          filePath={playingVideo.filePath}
          title={playingVideo.title}
          recordingId={playingVideo.recordingId}
          onClose={() => setPlayingVideo(null)}
        />
      )}

      {/* OCR Test mode modal */}
      {showOCRTest && (
        <OCRTestMode onClose={() => setShowOCRTest(false)} />
      )}
    </div>
  );
}

export default App;
