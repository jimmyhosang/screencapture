// Content script for screen capture recording
import * as rrweb from 'rrweb';

console.log('Screen Capture Extension: Content script loaded');

interface RecordedEvent {
  type: number;
  data: any;
  timestamp: number;
}

let isRecording = false;
let stopFn: (() => void) | undefined;
let events: RecordedEvent[] = [];
let recordingStartTime = 0;

// Listen for messages from background or popup
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  console.log('Content script received message:', message);

  if (message.type === 'START_RECORDING') {
    if (!isRecording) {
      startRecording(message.config || {});
      sendResponse({ success: true, isRecording: true });
    } else {
      sendResponse({ success: false, error: 'Already recording' });
    }
  }

  if (message.type === 'STOP_RECORDING') {
    if (isRecording) {
      const recordingData = stopRecording();
      sendResponse({ success: true, recording: recordingData });
    } else {
      sendResponse({ success: false, error: 'Not recording' });
    }
  }

  if (message.type === 'GET_STATE') {
    sendResponse({
      isRecording,
      eventCount: events.length,
      duration: isRecording ? Date.now() - recordingStartTime : 0
    });
  }

  return false;
});

function startRecording(config: any) {
  console.log('Starting recording with config:', config);
  events = [];
  recordingStartTime = Date.now();

  stopFn = rrweb.record({
    emit(event) {
      events.push(event as RecordedEvent);
    },
    // Apply privacy config
    maskAllInputs: config.maskAllInputs || false,
    blockClass: config.blockSensitiveElements ? /sensitive|pii/ : undefined,
    sampling: {
      mousemove: true,
      mouseInteraction: true,
      scroll: 150,
      input: 'last',
    },
  });

  isRecording = true;
  console.log('Recording started');

  // Show recording indicator
  showRecordingIndicator();
}

function stopRecording() {
  console.log('Stopping recording');

  if (stopFn) {
    stopFn();
    stopFn = undefined;
  }

  isRecording = false;
  const duration = Date.now() - recordingStartTime;

  // Hide recording indicator
  hideRecordingIndicator();

  const recording = {
    id: `recording-${Date.now()}`,
    name: `Recording ${new Date().toLocaleString()}`,
    timestamp: recordingStartTime,
    duration,
    eventCount: events.length,
    events: [...events],
    url: window.location.href,
  };

  console.log('Recording stopped:', recording);

  // Save to chrome storage
  chrome.runtime.sendMessage({
    type: 'SAVE_RECORDING',
    recording
  });

  return recording;
}

// Recording indicator UI
let indicator: HTMLDivElement | null = null;

function showRecordingIndicator() {
  if (indicator) return;

  indicator = document.createElement('div');
  indicator.id = 'screencapture-recording-indicator';
  indicator.innerHTML = `
    <div style="
      position: fixed;
      top: 10px;
      right: 10px;
      background: #f44336;
      color: white;
      padding: 8px 16px;
      border-radius: 20px;
      font-family: sans-serif;
      font-size: 14px;
      font-weight: 500;
      z-index: 999999;
      box-shadow: 0 2px 8px rgba(0,0,0,0.3);
      display: flex;
      align-items: center;
      gap: 8px;
    ">
      <span style="
        width: 8px;
        height: 8px;
        background: white;
        border-radius: 50%;
        animation: pulse 1.5s ease-in-out infinite;
      "></span>
      Recording
    </div>
    <style>
      @keyframes pulse {
        0%, 100% { opacity: 1; }
        50% { opacity: 0.3; }
      }
    </style>
  `;

  document.body.appendChild(indicator);
}

function hideRecordingIndicator() {
  if (indicator) {
    indicator.remove();
    indicator = null;
  }
}

export {};
