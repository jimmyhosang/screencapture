/**
 * CCaaS (Contact Center as a Service) Integration Types
 *
 * Handles webhook events from contact center platforms to trigger
 * automatic screen recordings based on call lifecycle events.
 */

// =============================================================================
// Webhook Event Types
// =============================================================================

export type CCaaSEventType = 'call.started' | 'call.ended' | 'call.transferred';

export interface CCaaSBaseEvent {
  eventType: CCaaSEventType;
  timestamp: string; // ISO 8601 format
  callId: string;
  agentId: string;
  queueId?: string;
  metadata?: Record<string, unknown>;
}

export interface CallStartedEvent extends CCaaSBaseEvent {
  eventType: 'call.started';
  direction: 'inbound' | 'outbound';
  customerId?: string;
  customerPhone?: string;
  ani?: string; // Automatic Number Identification
  dnis?: string; // Dialed Number Identification Service
}

export interface CallEndedEvent extends CCaaSBaseEvent {
  eventType: 'call.ended';
  duration: number; // seconds
  disposition?: string; // e.g., 'completed', 'abandoned', 'transferred'
  holdTime?: number; // seconds
  talkTime?: number; // seconds
  wrapUpCode?: string;
}

export interface CallTransferredEvent extends CCaaSBaseEvent {
  eventType: 'call.transferred';
  transferType: 'warm' | 'cold' | 'conference';
  fromAgentId: string;
  toAgentId?: string;
  toQueueId?: string;
  toExternalNumber?: string;
}

export type CCaaSEvent = CallStartedEvent | CallEndedEvent | CallTransferredEvent;

// =============================================================================
// Webhook Configuration
// =============================================================================

export interface CCaaSWebhookConfig {
  enabled: boolean;
  port: number;
  secret: string; // For HMAC signature validation
  allowedQueues: string[]; // Empty array = all queues
  autoRecord: boolean;
  recordingPath?: string; // Override default recording path
}

export const DEFAULT_CCAAS_CONFIG: CCaaSWebhookConfig = {
  enabled: false,
  port: 3847,
  secret: '',
  allowedQueues: [],
  autoRecord: true,
  recordingPath: undefined
};

// =============================================================================
// Call State Management
// =============================================================================

export type CallStatus = 'active' | 'on_hold' | 'transferring' | 'ended';

export interface CallState {
  callId: string;
  agentId: string;
  queueId?: string;
  status: CallStatus;
  direction: 'inbound' | 'outbound';
  startTime: Date;
  endTime?: Date;
  recordingSessionId?: string; // Links to our recording system
  customerId?: string;
  customerPhone?: string;
  transfers: TransferRecord[];
  metadata?: Record<string, unknown>;
}

export interface TransferRecord {
  timestamp: Date;
  transferType: 'warm' | 'cold' | 'conference';
  fromAgentId: string;
  toAgentId?: string;
  toQueueId?: string;
  toExternalNumber?: string;
}

// =============================================================================
// Server Status
// =============================================================================

export interface CCaaSServerStatus {
  running: boolean;
  port: number;
  uptime: number; // seconds
  activeRecordings: number;
  activeCalls: number;
  totalEventsReceived: number;
  lastEventTime?: string;
  errors: CCaaSError[];
}

export interface CCaaSError {
  timestamp: string;
  message: string;
  eventType?: CCaaSEventType;
  callId?: string;
}

// =============================================================================
// IPC Types
// =============================================================================

export interface CCaaSIPCHandlers {
  'ccaas:getStatus': () => Promise<CCaaSServerStatus>;
  'ccaas:start': (config?: Partial<CCaaSWebhookConfig>) => Promise<boolean>;
  'ccaas:stop': () => Promise<boolean>;
  'ccaas:testWebhook': (event: CCaaSEvent) => Promise<{ success: boolean; message: string }>;
  'ccaas:getConfig': () => Promise<CCaaSWebhookConfig>;
  'ccaas:updateConfig': (config: Partial<CCaaSWebhookConfig>) => Promise<CCaaSWebhookConfig>;
}

// =============================================================================
// Webhook Validation
// =============================================================================

export interface WebhookValidationResult {
  valid: boolean;
  error?: string;
  event?: CCaaSEvent;
}

export interface WebhookRequest {
  body: unknown;
  signature?: string;
  timestamp?: string;
}
