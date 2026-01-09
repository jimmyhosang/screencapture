/**
 * CCaaS Webhook Server
 *
 * Express HTTP server that receives webhook events from CCaaS platforms.
 * Validates HMAC signatures and routes events to handlers.
 */

import express, { Request, Response, NextFunction } from 'express';
import { createHmac } from 'crypto';
import { Server } from 'http';
import {
  CCaaSWebhookConfig,
  CCaaSServerStatus,
  CCaaSEvent,
  CCaaSError,
  WebhookValidationResult,
  DEFAULT_CCAAS_CONFIG
} from './types';
import { getCallStateManager } from './call-state';
import { handleCCaaSEvent } from './event-handlers';

class WebhookServer {
  private app: express.Application;
  private server: Server | null = null;
  private config: CCaaSWebhookConfig = { ...DEFAULT_CCAAS_CONFIG };
  private startTime: Date | null = null;
  private totalEventsReceived = 0;
  private lastEventTime: Date | null = null;
  private errors: CCaaSError[] = [];
  private maxErrors = 100; // Keep last 100 errors

  constructor() {
    this.app = express();
    this.setupMiddleware();
    this.setupRoutes();
  }

  private setupMiddleware(): void {
    // Parse JSON body
    this.app.use(express.json());

    // Request logging
    this.app.use((req: Request, _res: Response, next: NextFunction) => {
      console.log(`[CCaaS] ${req.method} ${req.path}`);
      next();
    });
  }

  private setupRoutes(): void {
    // Health check endpoint
    this.app.get('/health', (_req: Request, res: Response) => {
      const callStateManager = getCallStateManager();
      res.json({
        status: 'healthy',
        uptime: this.getUptime(),
        activeRecordings: callStateManager.getActiveRecordingCount(),
        activeCalls: callStateManager.getActiveCallCount(),
        listeningPort: this.config.port
      });
    });

    // Main webhook endpoint
    this.app.post('/webhook', async (req: Request, res: Response) => {
      try {
        // Validate signature if secret is configured
        if (this.config.secret) {
          const signature = req.headers['x-webhook-signature'] as string;
          const timestamp = req.headers['x-webhook-timestamp'] as string;

          const validation = this.validateSignature(req.body, signature, timestamp);
          if (!validation.valid) {
            this.addError({ message: validation.error || 'Invalid signature' });
            res.status(401).json({ error: validation.error });
            return;
          }
        }

        // Validate event structure
        const validation = this.validateEvent(req.body);
        if (!validation.valid || !validation.event) {
          this.addError({ message: validation.error || 'Invalid event' });
          res.status(400).json({ error: validation.error });
          return;
        }

        const event = validation.event;

        // Check queue filtering
        if (this.config.allowedQueues.length > 0 && event.queueId) {
          if (!this.config.allowedQueues.includes(event.queueId)) {
            res.status(200).json({ status: 'ignored', reason: 'queue not in allowed list' });
            return;
          }
        }

        // Process the event
        this.totalEventsReceived++;
        this.lastEventTime = new Date();

        const result = await handleCCaaSEvent(event, this.config);

        res.json({
          status: 'processed',
          eventType: event.eventType,
          callId: event.callId,
          ...result
        });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        this.addError({ message: errorMessage });
        console.error('[CCaaS] Webhook error:', error);
        res.status(500).json({ error: 'Internal server error' });
      }
    });

    // Test endpoint for development
    this.app.post('/test', async (req: Request, res: Response) => {
      try {
        const validation = this.validateEvent(req.body);
        if (!validation.valid || !validation.event) {
          res.status(400).json({ error: validation.error });
          return;
        }

        // Process without signature validation
        const result = await handleCCaaSEvent(validation.event, this.config);
        res.json({ status: 'test_processed', ...result });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        res.status(500).json({ error: errorMessage });
      }
    });

    // 404 handler
    this.app.use((_req: Request, res: Response) => {
      res.status(404).json({ error: 'Not found' });
    });
  }

  private validateSignature(
    body: unknown,
    signature: string | undefined,
    timestamp: string | undefined
  ): WebhookValidationResult {
    if (!signature) {
      return { valid: false, error: 'Missing X-Webhook-Signature header' };
    }

    if (!timestamp) {
      return { valid: false, error: 'Missing X-Webhook-Timestamp header' };
    }

    // Check timestamp is within 5 minutes to prevent replay attacks
    const eventTime = parseInt(timestamp, 10);
    const now = Date.now();
    const fiveMinutes = 5 * 60 * 1000;

    if (isNaN(eventTime) || Math.abs(now - eventTime) > fiveMinutes) {
      return { valid: false, error: 'Invalid or expired timestamp' };
    }

    // Compute expected signature
    const payload = `${timestamp}.${JSON.stringify(body)}`;
    const expectedSignature = createHmac('sha256', this.config.secret)
      .update(payload)
      .digest('hex');

    // Constant-time comparison to prevent timing attacks
    const signatureBuffer = Buffer.from(signature);
    const expectedBuffer = Buffer.from(expectedSignature);

    if (
      signatureBuffer.length !== expectedBuffer.length ||
      !require('crypto').timingSafeEqual(signatureBuffer, expectedBuffer)
    ) {
      return { valid: false, error: 'Invalid signature' };
    }

    return { valid: true };
  }

  private validateEvent(body: unknown): WebhookValidationResult {
    if (!body || typeof body !== 'object') {
      return { valid: false, error: 'Invalid request body' };
    }

    const event = body as Record<string, unknown>;

    // Check required fields
    if (!event.eventType || typeof event.eventType !== 'string') {
      return { valid: false, error: 'Missing or invalid eventType' };
    }

    if (!event.callId || typeof event.callId !== 'string') {
      return { valid: false, error: 'Missing or invalid callId' };
    }

    if (!event.agentId || typeof event.agentId !== 'string') {
      return { valid: false, error: 'Missing or invalid agentId' };
    }

    if (!event.timestamp || typeof event.timestamp !== 'string') {
      return { valid: false, error: 'Missing or invalid timestamp' };
    }

    // Validate event type
    const validEventTypes = ['call.started', 'call.ended', 'call.transferred'];
    if (!validEventTypes.includes(event.eventType)) {
      return { valid: false, error: `Unknown event type: ${event.eventType}` };
    }

    // Type-specific validation
    if (event.eventType === 'call.started') {
      if (!event.direction || !['inbound', 'outbound'].includes(event.direction as string)) {
        return { valid: false, error: 'Missing or invalid direction for call.started' };
      }
    }

    if (event.eventType === 'call.ended') {
      if (typeof event.duration !== 'number') {
        return { valid: false, error: 'Missing or invalid duration for call.ended' };
      }
    }

    if (event.eventType === 'call.transferred') {
      if (
        !event.transferType ||
        !['warm', 'cold', 'conference'].includes(event.transferType as string)
      ) {
        return { valid: false, error: 'Missing or invalid transferType for call.transferred' };
      }
      if (!event.fromAgentId || typeof event.fromAgentId !== 'string') {
        return { valid: false, error: 'Missing or invalid fromAgentId for call.transferred' };
      }
    }

    return { valid: true, event: body as CCaaSEvent };
  }

  private addError(error: Partial<CCaaSError>): void {
    const fullError: CCaaSError = {
      timestamp: new Date().toISOString(),
      message: error.message || 'Unknown error',
      eventType: error.eventType,
      callId: error.callId
    };

    this.errors.push(fullError);

    // Keep only last N errors
    if (this.errors.length > this.maxErrors) {
      this.errors = this.errors.slice(-this.maxErrors);
    }
  }

  private getUptime(): number {
    if (!this.startTime) {
      return 0;
    }
    return Math.floor((Date.now() - this.startTime.getTime()) / 1000);
  }

  /**
   * Start the webhook server
   */
  async start(config?: Partial<CCaaSWebhookConfig>): Promise<boolean> {
    if (this.server) {
      console.log('[CCaaS] Server already running');
      return true;
    }

    if (config) {
      this.config = { ...this.config, ...config };
    }

    return new Promise((resolve) => {
      try {
        this.server = this.app.listen(this.config.port, () => {
          this.startTime = new Date();
          console.log(`[CCaaS] Webhook server listening on port ${this.config.port}`);
          resolve(true);
        });

        this.server.on('error', (error: NodeJS.ErrnoException) => {
          console.error('[CCaaS] Server error:', error);
          if (error.code === 'EADDRINUSE') {
            this.addError({ message: `Port ${this.config.port} is already in use` });
          }
          this.server = null;
          resolve(false);
        });
      } catch (error) {
        console.error('[CCaaS] Failed to start server:', error);
        resolve(false);
      }
    });
  }

  /**
   * Stop the webhook server
   */
  async stop(): Promise<boolean> {
    if (!this.server) {
      return true;
    }

    return new Promise((resolve) => {
      this.server!.close((error) => {
        if (error) {
          console.error('[CCaaS] Error stopping server:', error);
          resolve(false);
        } else {
          console.log('[CCaaS] Webhook server stopped');
          this.server = null;
          this.startTime = null;
          resolve(true);
        }
      });
    });
  }

  /**
   * Get server status
   */
  getStatus(): CCaaSServerStatus {
    const callStateManager = getCallStateManager();
    return {
      running: this.server !== null,
      port: this.config.port,
      uptime: this.getUptime(),
      activeRecordings: callStateManager.getActiveRecordingCount(),
      activeCalls: callStateManager.getActiveCallCount(),
      totalEventsReceived: this.totalEventsReceived,
      lastEventTime: this.lastEventTime?.toISOString(),
      errors: [...this.errors]
    };
  }

  /**
   * Get current configuration
   */
  getConfig(): CCaaSWebhookConfig {
    return { ...this.config };
  }

  /**
   * Update configuration (requires restart to take effect for port changes)
   */
  updateConfig(config: Partial<CCaaSWebhookConfig>): CCaaSWebhookConfig {
    this.config = { ...this.config, ...config };
    return { ...this.config };
  }

  /**
   * Test processing an event (bypasses signature validation)
   */
  async testEvent(event: CCaaSEvent): Promise<{ success: boolean; message: string }> {
    try {
      const result = await handleCCaaSEvent(event, this.config);
      return { success: true, message: `Event processed: ${JSON.stringify(result)}` };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return { success: false, message };
    }
  }

  /**
   * Check if server is running
   */
  isRunning(): boolean {
    return this.server !== null;
  }
}

// Singleton instance
let webhookServer: WebhookServer | null = null;

export function getWebhookServer(): WebhookServer {
  if (!webhookServer) {
    webhookServer = new WebhookServer();
  }
  return webhookServer;
}

export function resetWebhookServer(): void {
  if (webhookServer) {
    webhookServer.stop();
    webhookServer = null;
  }
}
