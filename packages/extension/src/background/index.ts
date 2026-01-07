// Background service worker for screen capture extension

console.log('Screen Capture Extension: Background script loaded');

// Listen for messages from content scripts or popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('Background received message:', message);

  if (message.type === 'START_RECORDING') {
    // Forward to content script
    if (sender.tab?.id) {
      chrome.tabs.sendMessage(sender.tab.id, { type: 'START_RECORDING', config: message.config });
    }
    sendResponse({ success: true });
  }

  if (message.type === 'STOP_RECORDING') {
    // Forward to content script
    if (sender.tab?.id) {
      chrome.tabs.sendMessage(sender.tab.id, { type: 'STOP_RECORDING' });
    }
    sendResponse({ success: true });
  }

  if (message.type === 'GET_RECORDING_STATE') {
    // Query content script for state
    if (sender.tab?.id) {
      chrome.tabs.sendMessage(sender.tab.id, { type: 'GET_STATE' }, (response) => {
        sendResponse(response);
      });
      return true; // Keep channel open for async response
    }
  }

  if (message.type === 'SAVE_RECORDING') {
    // Save recording to storage
    chrome.storage.local.get(['recordings'], (result) => {
      const recordings = result.recordings || [];
      recordings.push(message.recording);
      chrome.storage.local.set({ recordings }, () => {
        sendResponse({ success: true });
      });
    });
    return true; // Keep channel open for async response
  }

  return false;
});

// Handle extension icon click
chrome.action.onClicked.addListener((tab) => {
  console.log('Extension icon clicked for tab:', tab.id);
});

export {};
