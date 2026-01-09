/**
 * CCaaS Event Handlers
 *
 * Handles incoming CCaaS webhook events and integrates with
 * the recording system to auto-start/stop recordings.
 */

import { BrowserWindow } from 'electron';
import {
  CCaaSEvent,
  CallStartedEvent,
  CallEndedEvent,
  CallTransferredEvent,
  CCaaSWebhookConfig
} from './types';
import { getCallStateManager } from './call-state';

// Import from recorder module - we'll need to expose these functions
// For now, we track state and emit events for the main process to handle
interface RecordingResult {
  success: boolean;
  sessionId?: string;
  error?: string;
}

interface EventHandlerResult {
  handled: boolean;
  action?: string;
  recordingId?: string;
  error?: string;
}

/**
 * Main event router - dispatches events to appropriate handlers
 */
export async function handleCCaaSEvent(
  event: CCaaSEvent,
  config: CCaaSWebhookConfig
): Promise<EventHandlerResult> {
  const callStateManager = getCallStateManager();

  console.log(`[CCaaS] Handling event: ${event.eventType} for call ${event.callId}`);

  switch (event.eventType) {
    case 'call.started':
      return handleCallStarted(event, config, callStateManager);

    case 'call.ended':
      return handleCallEnded(event, config, callStateManager);

    case 'call.transferred':
      return handleCallTransferred(event, config, callStateManager);

    default:
      console.warn(`[CCaaS] Unknown event type: ${(event as CCaaSEvent).eventType}`);
      return { handled: false, error: 'Unknown event type' };
  }
}

/**
 * Handle call.started event
 * - Creates call state entry
 * - Starts recording if autoRecord is enabled
 */
async function handleCallStarted(
  event: CallStartedEvent,
  config: CCaaSWebhookConfig,
  callStateManager: ReturnType<typeof getCallStateManager>
): Promise<EventHandlerResult> {
  // Check if call already exists (duplicate event)
  if (callStateManager.hasCall(event.callId)) {
    console.log(`[CCaaS] Call ${event.callId} already tracked, ignoring duplicate`);
    return { handled: true, action: 'duplicate_ignored' };
  }

  // Create call state entry
  const callState = callStateManager.startCall(event);

  // Start recording if auto-record is enabled
  if (config.autoRecord) {
    try {
      const result = await startRecordingForCall(event);
      if (result.success && result.sessionId) {
        callStateManager.setRecordingSession(event.callId, result.sessionId);
        console.log(`[CCaaS] Started recording ${result.sessionId} for call ${event.callId}`);
        return {
          handled: true,
          action: 'call_started_recording_started',
          recordingId: result.sessionId
        };
      } else {
        console.error(`[CCaaS] Failed to start recording for call ${event.callId}:`, result.error);
        return {
          handled: true,
          action: 'call_started_recording_failed',
          error: result.error
        };
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error(`[CCaaS] Error starting recording:`, error);
      return {
        handled: true,
        action: 'call_started_recording_error',
        error: errorMessage
      };
    }
  }

  return { handled: true, action: 'call_started' };
}

/**
 * Handle call.ended event
 * - Stops recording if one was started
 * - Updates call state with end details
 */
async function handleCallEnded(
  event: CallEndedEvent,
  _config: CCaaSWebhookConfig,
  callStateManager: ReturnType<typeof getCallStateManager>
): Promise<EventHandlerResult> {
  const callState = callStateManager.getCall(event.callId);

  if (!callState) {
    console.warn(`[CCaaS] Received call.ended for unknown call ${event.callId}`);
    return { handled: false, error: 'Unknown call' };
  }

  // Stop recording if one was started
  if (callState.recordingSessionId) {
    try {
      await stopRecordingForCall(event.callId, callState.recordingSessionId);
      console.log(
        `[CCaaS] Stopped recording ${callState.recordingSessionId} for call ${event.callId}`
      );
    } catch (error) {
      console.error(`[CCaaS] Error stopping recording:`, error);
    }
  }

  // Update call state
  callStateManager.endCall(event);

  return {
    handled: true,
    action: 'call_ended',
    recordingId: callState.recordingSessionId
  };
}

/**
 * Handle call.transferred event
 * - Updates call state with transfer details
 * - Recording continues through transfers
 */
async function handleCallTransferred(
  event: CallTransferredEvent,
  _config: CCaaSWebhookConfig,
  callStateManager: ReturnType<typeof getCallStateManager>
): Promise<EventHandlerResult> {
  const callState = callStateManager.getCall(event.callId);

  if (!callState) {
    console.warn(`[CCaaS] Received call.transferred for unknown call ${event.callId}`);
    return { handled: false, error: 'Unknown call' };
  }

  // Update call state with transfer
  callStateManager.transferCall(event);

  console.log(
    `[CCaaS] Call ${event.callId} transferred from ${event.fromAgentId} to ${event.toAgentId || event.toQueueId || event.toExternalNumber}`
  );

  return {
    handled: true,
    action: 'call_transferred',
    recordingId: callState.recordingSessionId
  };
}

/**
 * Start recording for a call
 * This creates a minimal recording session linked to the call
 */
async function startRecordingForCall(event: CallStartedEvent): Promise<RecordingResult> {
  // Get the main window to notify about recording start
  const mainWindow = BrowserWindow.getAllWindows().find((w) => !w.isDestroyed());

  if (!mainWindow) {
    return { success: false, error: 'No main window available' };
  }

  // Generate a session ID for the recording
  const sessionId = `ccaas-${event.callId}-${Date.now()}`;

  // Notify the renderer to start recording
  mainWindow.webContents.send('ccaas:recordingStart', {
    sessionId,
    callId: event.callId,
    agentId: event.agentId,
    direction: event.direction,
    customerId: event.customerId,
    timestamp: event.timestamp
  });

  return { success: true, sessionId };
}

/**
 * Stop recording for a call
 */
async function stopRecordingForCall(callId: string, sessionId: string): Promise<RecordingResult> {
  const mainWindow = BrowserWindow.getAllWindows().find((w) => !w.isDestroyed());

  if (!mainWindow) {
    return { success: false, error: 'No main window available' };
  }

  // Notify the renderer to stop recording
  mainWindow.webContents.send('ccaas:recordingStop', {
    sessionId,
    callId,
    timestamp: new Date().toISOString()
  });

  return { success: true, sessionId };
}

/**
 * Get summary of active calls and recordings
 */
export function getCallSummary(): {
  activeCalls: number;
  activeRecordings: number;
  calls: Array<{
    callId: string;
    agentId: string;
    direction: string;
    status: string;
    hasRecording: boolean;
  }>;
} {
  const callStateManager = getCallStateManager();
  const calls = callStateManager.getActiveCalls();

  return {
    activeCalls: calls.length,
    activeRecordings: calls.filter((c) => c.recordingSessionId).length,
    calls: calls.map((c) => ({
      callId: c.callId,
      agentId: c.agentId,
      direction: c.direction,
      status: c.status,
      hasRecording: !!c.recordingSessionId
    }))
  };
}
