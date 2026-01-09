// Popup script for extension UI
console.log('Popup script loaded');

const startBtn = document.getElementById('start-btn') as HTMLButtonElement;
const stopBtn = document.getElementById('stop-btn') as HTMLButtonElement;
const statusEl = document.getElementById('status') as HTMLSpanElement;
const eventCountEl = document.getElementById('event-count') as HTMLSpanElement;
const durationEl = document.getElementById('duration') as HTMLSpanElement;
const maskInputsCheckbox = document.getElementById('mask-inputs') as HTMLInputElement;
const blockSensitiveCheckbox = document.getElementById('block-sensitive') as HTMLInputElement;
const recordingsListEl = document.getElementById('recordings-list') as HTMLDivElement;

let updateInterval: number | null = null;

// Get current tab
async function getCurrentTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

// Update UI state
async function updateState() {
  const tab = await getCurrentTab();
  if (!tab.id) return;

  chrome.tabs.sendMessage(tab.id, { type: 'GET_STATE' }, (response) => {
    if (chrome.runtime.lastError) {
      console.error('Error getting state:', chrome.runtime.lastError);
      return;
    }

    if (response) {
      if (response.isRecording) {
        statusEl.innerHTML = '<span class="recording-indicator"><span class="recording-dot"></span>Recording</span>';
        startBtn.disabled = true;
        stopBtn.disabled = false;
        eventCountEl.textContent = response.eventCount.toString();
        durationEl.textContent = `${Math.floor(response.duration / 1000)}s`;
      } else {
        statusEl.textContent = 'Idle';
        startBtn.disabled = false;
        stopBtn.disabled = true;
        eventCountEl.textContent = '0';
        durationEl.textContent = '0s';
      }
    }
  });
}

// Start recording
startBtn.addEventListener('click', async () => {
  const tab = await getCurrentTab();
  if (!tab.id) return;

  const config = {
    maskAllInputs: maskInputsCheckbox.checked,
    blockSensitiveElements: blockSensitiveCheckbox.checked,
  };

  chrome.tabs.sendMessage(tab.id, { type: 'START_RECORDING', config }, (response) => {
    if (response?.success) {
      console.log('Recording started');
      updateState();

      // Start polling for updates
      if (updateInterval) clearInterval(updateInterval);
      updateInterval = window.setInterval(updateState, 1000);
    }
  });
});

// Stop recording
stopBtn.addEventListener('click', async () => {
  const tab = await getCurrentTab();
  if (!tab.id) return;

  chrome.tabs.sendMessage(tab.id, { type: 'STOP_RECORDING' }, (response) => {
    if (response?.success) {
      console.log('Recording stopped:', response.recording);
      updateState();
      loadRecordings();

      // Stop polling
      if (updateInterval) {
        clearInterval(updateInterval);
        updateInterval = null;
      }
    }
  });
});

// Load recordings from storage
function loadRecordings() {
  chrome.storage.local.get(['recordings'], (result) => {
    const recordings = result.recordings || [];

    if (recordings.length === 0) {
      recordingsListEl.innerHTML = '<p style="color: #888; font-size: 12px; text-align: center;">No recordings yet</p>';
      return;
    }

    recordingsListEl.innerHTML = recordings
      .slice(-5) // Show last 5
      .reverse()
      .map((rec: any) => `
        <div class="recording-item">
          <div class="recording-name">${rec.name}</div>
          <div class="recording-meta">
            ${rec.eventCount} events • ${Math.floor(rec.duration / 1000)}s
          </div>
        </div>
      `)
      .join('');
  });
}

// Initialize
updateState();
loadRecordings();

// Update state every second if recording
setInterval(() => {
  updateState();
}, 1000);

export {};
