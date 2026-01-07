import { useState } from 'react';
import { useRecorder } from './hooks/useRecorder';
import { PlayerModal } from './components/PlayerModal';
import './App.css';

function App() {
  const { isRecording, events, startRecording, stopRecording, clearEvents } = useRecorder();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [count, setCount] = useState(0);
  const [inputValue, setInputValue] = useState('');

  const handleToggleRecording = () => {
    if (isRecording) {
      stopRecording();
    } else {
      clearEvents();
      startRecording();
    }
  };

  const handleOpenPlayer = () => {
    if (isRecording) {
      stopRecording();
    }
    setIsModalOpen(true);
  };

  return (
    <div className="app">
      <header className="app-header">
        <h1>rrweb Session Recorder</h1>
        <p className="subtitle">Record and replay user sessions</p>
      </header>

      <div className="controls">
        <button
          className={`control-btn ${isRecording ? 'recording' : ''}`}
          onClick={handleToggleRecording}
        >
          {isRecording ? (
            <>
              <span className="record-indicator" />
              Stop Recording
            </>
          ) : (
            'Start Recording'
          )}
        </button>

        <button
          className="control-btn play-btn"
          onClick={handleOpenPlayer}
          disabled={events.length < 2}
        >
          Play Recording ({events.length} events)
        </button>
      </div>

      <div className="demo-section">
        <h2>Interactive Demo Area</h2>
        <p className="demo-hint">
          Interact with the elements below while recording to capture your session
        </p>

        <div className="demo-grid">
          <div className="demo-card">
            <h3>Counter</h3>
            <div className="counter">
              <button onClick={() => setCount((c) => Math.max(0, c - 1))}>-</button>
              <span className="counter-value">{count}</span>
              <button onClick={() => setCount((c) => c + 1)}>+</button>
            </div>
          </div>

          <div className="demo-card">
            <h3>Text Input</h3>
            <input
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              placeholder="Type something..."
              className="demo-input"
            />
            {inputValue && <p className="input-preview">You typed: {inputValue}</p>}
          </div>

          <div className="demo-card">
            <h3>Hover Effects</h3>
            <div className="hover-grid">
              <div className="hover-box box-1">1</div>
              <div className="hover-box box-2">2</div>
              <div className="hover-box box-3">3</div>
              <div className="hover-box box-4">4</div>
            </div>
          </div>

          <div className="demo-card">
            <h3>Scrollable Content</h3>
            <div className="scroll-box">
              {Array.from({ length: 20 }, (_, i) => (
                <p key={i}>Scrollable item #{i + 1}</p>
              ))}
            </div>
          </div>
        </div>
      </div>

      <PlayerModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        events={events}
      />
    </div>
  );
}

export default App;
