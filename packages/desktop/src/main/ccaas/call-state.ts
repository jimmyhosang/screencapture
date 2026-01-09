/**
 * Call State Manager
 *
 * Manages active call states and their associated recordings.
 * Tracks calls from start to end and handles transfers.
 */

import { EventEmitter } from 'events';
import {
  CallState,
  CallStatus,
  TransferRecord,
  CallStartedEvent,
  CallEndedEvent,
  CallTransferredEvent
} from './types';

export class CallStateManager extends EventEmitter {
  private calls: Map<string, CallState> = new Map();
  private callsByAgent: Map<string, Set<string>> = new Map();

  constructor() {
    super();
  }

  /**
   * Start tracking a new call
   */
  startCall(event: CallStartedEvent): CallState {
    const callState: CallState = {
      callId: event.callId,
      agentId: event.agentId,
      queueId: event.queueId,
      status: 'active',
      direction: event.direction,
      startTime: new Date(event.timestamp),
      customerId: event.customerId,
      customerPhone: event.customerPhone,
      transfers: [],
      metadata: event.metadata
    };

    this.calls.set(event.callId, callState);
    this.addCallToAgent(event.agentId, event.callId);

    this.emit('call:started', callState);
    return callState;
  }

  /**
   * End tracking for a call
   */
  endCall(event: CallEndedEvent): CallState | undefined {
    const callState = this.calls.get(event.callId);
    if (!callState) {
      return undefined;
    }

    callState.status = 'ended';
    callState.endTime = new Date(event.timestamp);
    callState.metadata = {
      ...callState.metadata,
      duration: event.duration,
      disposition: event.disposition,
      holdTime: event.holdTime,
      talkTime: event.talkTime,
      wrapUpCode: event.wrapUpCode
    };

    this.removeCallFromAgent(callState.agentId, event.callId);
    this.emit('call:ended', callState);

    // Remove from active calls after emitting event
    this.calls.delete(event.callId);

    return callState;
  }

  /**
   * Handle call transfer
   */
  transferCall(event: CallTransferredEvent): CallState | undefined {
    const callState = this.calls.get(event.callId);
    if (!callState) {
      return undefined;
    }

    const transfer: TransferRecord = {
      timestamp: new Date(event.timestamp),
      transferType: event.transferType,
      fromAgentId: event.fromAgentId,
      toAgentId: event.toAgentId,
      toQueueId: event.toQueueId,
      toExternalNumber: event.toExternalNumber
    };

    callState.transfers.push(transfer);
    callState.status = 'transferring';

    // Update agent tracking if transferred to a new agent
    if (event.toAgentId && event.toAgentId !== callState.agentId) {
      this.removeCallFromAgent(callState.agentId, event.callId);
      callState.agentId = event.toAgentId;
      this.addCallToAgent(event.toAgentId, event.callId);
    }

    // After transfer completes, set back to active
    callState.status = 'active';

    this.emit('call:transferred', callState, transfer);
    return callState;
  }

  /**
   * Set the recording session ID for a call
   */
  setRecordingSession(callId: string, sessionId: string): boolean {
    const callState = this.calls.get(callId);
    if (!callState) {
      return false;
    }
    callState.recordingSessionId = sessionId;
    return true;
  }

  /**
   * Get recording session ID for a call
   */
  getRecordingSession(callId: string): string | undefined {
    return this.calls.get(callId)?.recordingSessionId;
  }

  /**
   * Get a specific call state
   */
  getCall(callId: string): CallState | undefined {
    return this.calls.get(callId);
  }

  /**
   * Get all active calls
   */
  getActiveCalls(): CallState[] {
    return Array.from(this.calls.values());
  }

  /**
   * Get active calls for a specific agent
   */
  getAgentCalls(agentId: string): CallState[] {
    const callIds = this.callsByAgent.get(agentId);
    if (!callIds) {
      return [];
    }
    return Array.from(callIds)
      .map((id) => this.calls.get(id))
      .filter((call): call is CallState => call !== undefined);
  }

  /**
   * Get count of active calls
   */
  getActiveCallCount(): number {
    return this.calls.size;
  }

  /**
   * Get count of active recordings
   */
  getActiveRecordingCount(): number {
    return Array.from(this.calls.values()).filter((call) => call.recordingSessionId).length;
  }

  /**
   * Check if a call is being tracked
   */
  hasCall(callId: string): boolean {
    return this.calls.has(callId);
  }

  /**
   * Update call status
   */
  updateStatus(callId: string, status: CallStatus): boolean {
    const callState = this.calls.get(callId);
    if (!callState) {
      return false;
    }
    callState.status = status;
    this.emit('call:statusChanged', callState);
    return true;
  }

  /**
   * Clear all calls (useful for shutdown)
   */
  clear(): void {
    const calls = this.getActiveCalls();
    this.calls.clear();
    this.callsByAgent.clear();
    calls.forEach((call) => this.emit('call:cleared', call));
  }

  // Private helpers

  private addCallToAgent(agentId: string, callId: string): void {
    if (!this.callsByAgent.has(agentId)) {
      this.callsByAgent.set(agentId, new Set());
    }
    this.callsByAgent.get(agentId)!.add(callId);
  }

  private removeCallFromAgent(agentId: string, callId: string): void {
    const calls = this.callsByAgent.get(agentId);
    if (calls) {
      calls.delete(callId);
      if (calls.size === 0) {
        this.callsByAgent.delete(agentId);
      }
    }
  }
}

// Singleton instance
let callStateManager: CallStateManager | null = null;

export function getCallStateManager(): CallStateManager {
  if (!callStateManager) {
    callStateManager = new CallStateManager();
  }
  return callStateManager;
}

export function resetCallStateManager(): void {
  if (callStateManager) {
    callStateManager.clear();
    callStateManager.removeAllListeners();
    callStateManager = null;
  }
}
