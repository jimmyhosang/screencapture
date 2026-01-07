/**
 * PII Worker Manager
 *
 * Manages a pool of Web Workers for offloading PII detection
 * to prevent blocking the main thread during recording.
 */

import type {
  PIIWorkerRequest,
  PIIWorkerResponse,
  PIIWorkerConfig,
  PIIAnalysisResult,
} from '../workers/piiDetection.worker';

// Re-export types
export type { PIIWorkerConfig, PIIAnalysisResult };

// =============================================================================
// Types
// =============================================================================

interface PendingRequest {
  resolve: (result: string | PIIAnalysisResult) => void;
  reject: (error: Error) => void;
  startTime: number;
}

interface WorkerPoolEntry {
  worker: Worker;
  busy: boolean;
}

// =============================================================================
// Worker Manager
// =============================================================================

class PIIWorkerManager {
  private workers: WorkerPoolEntry[] = [];
  private pendingRequests = new Map<string, PendingRequest>();
  private requestQueue: PIIWorkerRequest[] = [];
  private requestIdCounter = 0;
  private isInitialized = false;
  private initPromise: Promise<void> | null = null;
  private workerCount: number;

  constructor(workerCount = 2) {
    this.workerCount = Math.max(1, Math.min(workerCount, navigator.hardwareConcurrency || 4));
  }

  /**
   * Initializes the worker pool.
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) return;
    if (this.initPromise) return this.initPromise;

    this.initPromise = this.createWorkers();
    await this.initPromise;
    this.isInitialized = true;
  }

  private async createWorkers(): Promise<void> {
    const workerPromises = Array.from({ length: this.workerCount }, async () => {
      // Use Vite's worker import syntax
      const worker = new Worker(
        new URL('../workers/piiDetection.worker.ts', import.meta.url),
        { type: 'module' }
      );

      return new Promise<WorkerPoolEntry>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Worker initialization timeout'));
        }, 5000);

        worker.onmessage = (event) => {
          if (event.data.type === 'ready') {
            clearTimeout(timeout);
            worker.onmessage = this.handleWorkerMessage.bind(this);
            resolve({ worker, busy: false });
          }
        };

        worker.onerror = (error) => {
          clearTimeout(timeout);
          reject(error);
        };
      });
    });

    try {
      this.workers = await Promise.all(workerPromises);
    } catch (error) {
      console.warn('[PIIWorkerManager] Failed to initialize workers, falling back to main thread:', error);
      this.workers = [];
    }
  }

  private handleWorkerMessage(event: MessageEvent<PIIWorkerResponse>): void {
    const { id, result, processingTime } = event.data;

    const pending = this.pendingRequests.get(id);
    if (pending) {
      this.pendingRequests.delete(id);
      pending.resolve(result);

      // Log slow processing
      if (processingTime > 10) {
        console.debug(`[PIIWorkerManager] Request ${id} took ${processingTime.toFixed(2)}ms`);
      }
    }

    // Find the worker that sent this message and mark it as not busy
    const worker = this.workers.find((w) => w.busy);
    if (worker) {
      worker.busy = false;
    }

    // Process next queued request
    this.processQueue();
  }

  private processQueue(): void {
    if (this.requestQueue.length === 0) return;

    const availableWorker = this.workers.find((w) => !w.busy);
    if (!availableWorker) return;

    const request = this.requestQueue.shift()!;
    availableWorker.busy = true;
    availableWorker.worker.postMessage(request);
  }

  private generateRequestId(): string {
    return `req_${++this.requestIdCounter}_${Date.now()}`;
  }

  /**
   * Redacts PII from text using a worker.
   * Falls back to synchronous processing if workers aren't available.
   */
  async redact(text: string, config: PIIWorkerConfig): Promise<string> {
    // For small text, process synchronously
    if (text.length < 500 || this.workers.length === 0) {
      return this.redactSync(text, config);
    }

    await this.initialize();

    return new Promise<string>((resolve, reject) => {
      const id = this.generateRequestId();

      const request: PIIWorkerRequest = {
        id,
        type: 'redact',
        text,
        config,
      };

      this.pendingRequests.set(id, {
        resolve: resolve as (result: string | PIIAnalysisResult) => void,
        reject,
        startTime: Date.now(),
      });

      // Add to queue
      this.requestQueue.push(request);
      this.processQueue();

      // Timeout after 5 seconds
      setTimeout(() => {
        if (this.pendingRequests.has(id)) {
          this.pendingRequests.delete(id);
          // Fall back to sync processing
          resolve(this.redactSync(text, config));
        }
      }, 5000);
    });
  }

  /**
   * Analyzes text for PII using a worker.
   */
  async analyze(text: string, config: PIIWorkerConfig): Promise<PIIAnalysisResult> {
    if (text.length < 500 || this.workers.length === 0) {
      return this.analyzeSync(text, config);
    }

    await this.initialize();

    return new Promise<PIIAnalysisResult>((resolve, reject) => {
      const id = this.generateRequestId();

      const request: PIIWorkerRequest = {
        id,
        type: 'analyze',
        text,
        config,
      };

      this.pendingRequests.set(id, {
        resolve: resolve as (result: string | PIIAnalysisResult) => void,
        reject,
        startTime: Date.now(),
      });

      this.requestQueue.push(request);
      this.processQueue();

      // Timeout after 5 seconds
      setTimeout(() => {
        if (this.pendingRequests.has(id)) {
          this.pendingRequests.delete(id);
          resolve(this.analyzeSync(text, config));
        }
      }, 5000);
    });
  }

  /**
   * Synchronous redaction fallback (same patterns as worker).
   */
  private redactSync(text: string, config: PIIWorkerConfig): string {
    let result = text;

    if (config.email) {
      result = result.replace(
        /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
        (match) => {
          const [local, domain] = match.split('@');
          const [domainName, ...tldParts] = domain.split('.');
          const tld = tldParts.join('.');
          return `${local[0]}***@${domainName[0]}***.${tld}`;
        }
      );
    }

    if (config.phone) {
      result = result.replace(
        /(?<![.\d])(?:\+?1[-.\s]?)?(?:\(?\d{3}\)?[-.\s]?)?\d{3}[-.\s]?\d{4}(?![.\d])/g,
        (match) => {
          const digits = match.replace(/\D/g, '');
          const last4 = digits.slice(-4);
          return `***-***-${last4}`;
        }
      );
    }

    if (config.ssn) {
      result = result.replace(
        /\b(?!000|666|9\d{2})\d{3}[-.\s]?(?!00)\d{2}[-.\s]?(?!0000)\d{4}\b/g,
        (match) => {
          const digits = match.replace(/\D/g, '');
          const last4 = digits.slice(-4);
          return `***-**-${last4}`;
        }
      );
    }

    if (config.creditCard) {
      result = result.replace(
        /\b(?:\d{4}[-.\s]?){3}\d{4}\b|\b\d{13,19}\b/g,
        (match) => {
          const digits = match.replace(/\D/g, '');
          // Luhn check
          let sum = 0;
          let isEven = false;
          for (let i = digits.length - 1; i >= 0; i--) {
            let digit = parseInt(digits[i], 10);
            if (isEven) {
              digit *= 2;
              if (digit > 9) digit -= 9;
            }
            sum += digit;
            isEven = !isEven;
          }
          if (sum % 10 !== 0) return match;

          const last4 = digits.slice(-4);
          return `****-****-****-${last4}`;
        }
      );
    }

    if (config.ipv4) {
      result = result.replace(
        /\b(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\b/g,
        (match) => {
          const firstOctet = match.split('.')[0];
          return `${firstOctet}.***.***.**`;
        }
      );
    }

    if (config.ipv6) {
      result = result.replace(
        /(?:(?:[0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}|(?:[0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}|(?:[0-9a-fA-F]{1,4}:){1,5}(?::[0-9a-fA-F]{1,4}){1,2}|(?:[0-9a-fA-F]{1,4}:){1,4}(?::[0-9a-fA-F]{1,4}){1,3}|(?:[0-9a-fA-F]{1,4}:){1,3}(?::[0-9a-fA-F]{1,4}){1,4}|(?:[0-9a-fA-F]{1,4}:){1,2}(?::[0-9a-fA-F]{1,4}){1,5}|[0-9a-fA-F]{1,4}:(?::[0-9a-fA-F]{1,4}){1,6}|:(?::[0-9a-fA-F]{1,4}){1,7}|(?:[0-9a-fA-F]{1,4}:){1,7}:|::)/g,
        () => '[IPv6 REDACTED]'
      );
    }

    return result;
  }

  /**
   * Synchronous analysis fallback.
   */
  private analyzeSync(text: string, config: PIIWorkerConfig): PIIAnalysisResult {
    const types: string[] = [];
    let matchCount = 0;

    if (config.email) {
      const matches = text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g);
      if (matches) {
        matchCount += matches.length;
        types.push('email');
      }
    }

    if (config.phone) {
      const matches = text.match(/(?<![.\d])(?:\+?1[-.\s]?)?(?:\(?\d{3}\)?[-.\s]?)?\d{3}[-.\s]?\d{4}(?![.\d])/g);
      if (matches) {
        matchCount += matches.length;
        types.push('phone');
      }
    }

    if (config.ssn) {
      const matches = text.match(/\b(?!000|666|9\d{2})\d{3}[-.\s]?(?!00)\d{2}[-.\s]?(?!0000)\d{4}\b/g);
      if (matches) {
        matchCount += matches.length;
        types.push('ssn');
      }
    }

    if (config.creditCard) {
      const matches = text.match(/\b(?:\d{4}[-.\s]?){3}\d{4}\b|\b\d{13,19}\b/g);
      if (matches) {
        matchCount += matches.length;
        types.push('creditCard');
      }
    }

    if (config.ipv4) {
      const matches = text.match(/\b(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\b/g);
      if (matches) {
        matchCount += matches.length;
        types.push('ipv4');
      }
    }

    if (config.ipv6) {
      const matches = text.match(/(?:(?:[0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}|(?:[0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}|(?:[0-9a-fA-F]{1,4}:){1,5}(?::[0-9a-fA-F]{1,4}){1,2}|(?:[0-9a-fA-F]{1,4}:){1,4}(?::[0-9a-fA-F]{1,4}){1,3}|(?:[0-9a-fA-F]{1,4}:){1,3}(?::[0-9a-fA-F]{1,4}){1,4}|(?:[0-9a-fA-F]{1,4}:){1,2}(?::[0-9a-fA-F]{1,4}){1,5}|[0-9a-fA-F]{1,4}:(?::[0-9a-fA-F]{1,4}){1,6}|:(?::[0-9a-fA-F]{1,4}){1,7}|(?:[0-9a-fA-F]{1,4}:){1,7}:|::)/g);
      if (matches) {
        matchCount += matches.length;
        types.push('ipv6');
      }
    }

    return {
      redactedText: this.redactSync(text, config),
      matchCount,
      types,
    };
  }

  /**
   * Terminates all workers.
   */
  terminate(): void {
    this.workers.forEach((w) => w.worker.terminate());
    this.workers = [];
    this.pendingRequests.clear();
    this.requestQueue = [];
    this.isInitialized = false;
    this.initPromise = null;
  }

  /**
   * Gets the number of active workers.
   */
  getWorkerCount(): number {
    return this.workers.length;
  }

  /**
   * Gets the number of busy workers.
   */
  getBusyWorkerCount(): number {
    return this.workers.filter((w) => w.busy).length;
  }

  /**
   * Gets the queue length.
   */
  getQueueLength(): number {
    return this.requestQueue.length;
  }
}

// Singleton instance
let managerInstance: PIIWorkerManager | null = null;

/**
 * Gets the shared PII worker manager instance.
 */
export function getPIIWorkerManager(): PIIWorkerManager {
  if (!managerInstance) {
    managerInstance = new PIIWorkerManager();
  }
  return managerInstance;
}

/**
 * Terminates the shared worker manager.
 */
export function terminatePIIWorkers(): void {
  if (managerInstance) {
    managerInstance.terminate();
    managerInstance = null;
  }
}
