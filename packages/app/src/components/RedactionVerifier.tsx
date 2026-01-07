import { useState, useEffect, useCallback } from 'react';
import type { eventWithTime } from '@rrweb/types';
import { detectPII } from '../utils/piiDetector';
import { redactAll } from '../utils/redactor';
import './RedactionVerifier.css';

interface RedactionVerifierProps {
  /** The recorded events to verify */
  events: eventWithTime[];
  /** Callback to seek the player to a specific time */
  onSeekTo?: (timeOffset: number) => void;
}

interface PIIIssue {
  /** Unique ID for the issue */
  id: string;
  /** Timestamp offset from recording start (in ms) */
  timestamp: number;
  /** Type of PII detected */
  piiTypes: string[];
  /** The original text (will be redacted in display) */
  originalText: string;
  /** Context about where this was found */
  context: string;
  /** Event type that contained this */
  eventType: string;
}

interface VerificationStep {
  id: string;
  name: string;
  description: string;
  status: 'pending' | 'running' | 'completed' | 'skipped';
  itemsChecked: number;
  issuesFound: number;
}

type VerificationStatus = 'idle' | 'running' | 'completed';

/**
 * Component that verifies recorded sessions for unredacted PII.
 * Scans all text mutations and input values to detect potential privacy issues.
 */
export function RedactionVerifier({ events, onSeekTo }: RedactionVerifierProps) {
  const [status, setStatus] = useState<VerificationStatus>('idle');
  const [issues, setIssues] = useState<PIIIssue[]>([]);
  const [steps, setSteps] = useState<VerificationStep[]>([]);
  const [progress, setProgress] = useState(0);

  // Initialize verification steps
  const initializeSteps = useCallback((): VerificationStep[] => {
    return [
      {
        id: 'meta',
        name: 'Analyzing Recording Metadata',
        description: 'Reading recording structure and timeline',
        status: 'pending',
        itemsChecked: 0,
        issuesFound: 0,
      },
      {
        id: 'fullsnapshot',
        name: 'Scanning Full Snapshots',
        description: 'Checking initial page content for PII',
        status: 'pending',
        itemsChecked: 0,
        issuesFound: 0,
      },
      {
        id: 'mutations',
        name: 'Scanning Text Mutations',
        description: 'Analyzing DOM text changes during session',
        status: 'pending',
        itemsChecked: 0,
        issuesFound: 0,
      },
      {
        id: 'inputs',
        name: 'Scanning Input Values',
        description: 'Checking form input and textarea values',
        status: 'pending',
        itemsChecked: 0,
        issuesFound: 0,
      },
      {
        id: 'attributes',
        name: 'Scanning Attributes',
        description: 'Checking element attributes for sensitive data',
        status: 'pending',
        itemsChecked: 0,
        issuesFound: 0,
      },
      {
        id: 'summary',
        name: 'Generating Report',
        description: 'Compiling verification results',
        status: 'pending',
        itemsChecked: 0,
        issuesFound: 0,
      },
    ];
  }, []);

  // Update a specific step
  const updateStep = useCallback(
    (stepId: string, updates: Partial<VerificationStep>) => {
      setSteps((prev) =>
        prev.map((step) => (step.id === stepId ? { ...step, ...updates } : step))
      );
    },
    []
  );

  // Extract text content from a node recursively
  const extractTextFromNode = useCallback((node: unknown): string[] => {
    const texts: string[] = [];

    if (!node || typeof node !== 'object') return texts;

    const n = node as Record<string, unknown>;

    // Check for text content
    if (n.textContent && typeof n.textContent === 'string') {
      texts.push(n.textContent);
    }

    // Check for value (inputs)
    if (n.value && typeof n.value === 'string') {
      texts.push(n.value);
    }

    // Check for attributes
    if (n.attributes && typeof n.attributes === 'object') {
      const attrs = n.attributes as Record<string, string>;
      ['value', 'placeholder', 'title', 'alt', 'aria-label'].forEach((attr) => {
        if (attrs[attr]) {
          texts.push(attrs[attr]);
        }
      });
    }

    // Recurse into children
    if (n.childNodes && Array.isArray(n.childNodes)) {
      for (const child of n.childNodes) {
        texts.push(...extractTextFromNode(child));
      }
    }

    return texts;
  }, []);

  // Scan events for PII
  const runVerification = useCallback(async () => {
    if (events.length === 0) return;

    setStatus('running');
    setIssues([]);
    setSteps(initializeSteps());
    setProgress(0);

    const foundIssues: PIIIssue[] = [];
    const startTime = events[0]?.timestamp || 0;
    let issueId = 0;

    const createIssue = (
      timestamp: number,
      piiTypes: string[],
      originalText: string,
      context: string,
      eventType: string
    ): PIIIssue => ({
      id: `issue-${issueId++}`,
      timestamp: timestamp - startTime,
      piiTypes,
      originalText,
      context,
      eventType,
    });

    // Step 1: Analyze metadata
    updateStep('meta', { status: 'running' });
    await new Promise((r) => setTimeout(r, 100));
    updateStep('meta', {
      status: 'completed',
      itemsChecked: events.length,
    });
    setProgress(10);

    // Step 2: Scan full snapshots (type 2)
    updateStep('fullsnapshot', { status: 'running' });
    let snapshotCount = 0;
    let snapshotIssues = 0;

    for (const event of events) {
      if (event.type === 2) {
        // FullSnapshot
        snapshotCount++;
        const data = event.data as { node?: unknown };
        if (data.node) {
          const texts = extractTextFromNode(data.node);
          for (const text of texts) {
            if (text.trim()) {
              const result = detectPII(text);
              if (result.hasPII) {
                snapshotIssues++;
                foundIssues.push(
                  createIssue(
                    event.timestamp,
                    result.types,
                    text,
                    'Initial page snapshot',
                    'FullSnapshot'
                  )
                );
              }
            }
          }
        }
      }
    }

    updateStep('fullsnapshot', {
      status: 'completed',
      itemsChecked: snapshotCount,
      issuesFound: snapshotIssues,
    });
    setProgress(30);

    // Step 3: Scan text mutations (type 3, incremental)
    updateStep('mutations', { status: 'running' });
    let mutationCount = 0;
    let mutationIssues = 0;

    for (const event of events) {
      if (event.type === 3) {
        // IncrementalSnapshot
        const data = event.data as {
          source?: number;
          texts?: Array<{ value: string }>;
          adds?: Array<{ node?: unknown }>;
        };

        // Text mutations (source 5)
        if (data.source === 5 && data.texts) {
          for (const textMutation of data.texts) {
            mutationCount++;
            if (textMutation.value?.trim()) {
              const result = detectPII(textMutation.value);
              if (result.hasPII) {
                mutationIssues++;
                foundIssues.push(
                  createIssue(
                    event.timestamp,
                    result.types,
                    textMutation.value,
                    'Text content change',
                    'TextMutation'
                  )
                );
              }
            }
          }
        }

        // Added nodes (source 0)
        if (data.source === 0 && data.adds) {
          for (const add of data.adds) {
            if (add.node) {
              const texts = extractTextFromNode(add.node);
              for (const text of texts) {
                mutationCount++;
                if (text.trim()) {
                  const result = detectPII(text);
                  if (result.hasPII) {
                    mutationIssues++;
                    foundIssues.push(
                      createIssue(
                        event.timestamp,
                        result.types,
                        text,
                        'Added DOM node',
                        'NodeAdd'
                      )
                    );
                  }
                }
              }
            }
          }
        }
      }
    }

    updateStep('mutations', {
      status: 'completed',
      itemsChecked: mutationCount,
      issuesFound: mutationIssues,
    });
    setProgress(60);

    // Step 4: Scan input values (source 5 - Input)
    updateStep('inputs', { status: 'running' });
    let inputCount = 0;
    let inputIssues = 0;

    for (const event of events) {
      if (event.type === 3) {
        const data = event.data as {
          source?: number;
          text?: string;
        };

        // Input events (source 5)
        if (data.source === 5 && data.text) {
          inputCount++;
          const result = detectPII(data.text);
          if (result.hasPII) {
            inputIssues++;
            foundIssues.push(
              createIssue(
                event.timestamp,
                result.types,
                data.text,
                'Input field value',
                'InputValue'
              )
            );
          }
        }
      }
    }

    updateStep('inputs', {
      status: 'completed',
      itemsChecked: inputCount,
      issuesFound: inputIssues,
    });
    setProgress(80);

    // Step 5: Scan attributes
    updateStep('attributes', { status: 'running' });
    let attrCount = 0;
    let attrIssues = 0;

    for (const event of events) {
      if (event.type === 3) {
        const data = event.data as {
          source?: number;
          attributes?: Array<{ attributes: Record<string, string | null> }>;
        };

        // Attribute mutations (source 2)
        if (data.source === 2 && data.attributes) {
          for (const attrMutation of data.attributes) {
            for (const [key, value] of Object.entries(attrMutation.attributes)) {
              if (value && typeof value === 'string') {
                attrCount++;
                const result = detectPII(value);
                if (result.hasPII) {
                  attrIssues++;
                  foundIssues.push(
                    createIssue(
                      event.timestamp,
                      result.types,
                      value,
                      `Attribute: ${key}`,
                      'AttributeChange'
                    )
                  );
                }
              }
            }
          }
        }
      }
    }

    updateStep('attributes', {
      status: 'completed',
      itemsChecked: attrCount,
      issuesFound: attrIssues,
    });
    setProgress(95);

    // Step 6: Generate summary
    updateStep('summary', { status: 'running' });
    await new Promise((r) => setTimeout(r, 200));
    updateStep('summary', {
      status: 'completed',
      itemsChecked: foundIssues.length,
      issuesFound: foundIssues.length,
    });
    setProgress(100);

    setIssues(foundIssues);
    setStatus('completed');
  }, [events, initializeSteps, updateStep, extractTextFromNode]);

  // Auto-run verification when events change
  useEffect(() => {
    if (events.length > 0 && status === 'idle') {
      runVerification();
    }
  }, [events, status, runVerification]);

  // Format timestamp for display
  const formatTime = (ms: number): string => {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
  };

  // Format PII type for display
  const formatPiiType = (type: string): string => {
    const typeMap: Record<string, string> = {
      email: 'Email',
      phone: 'Phone',
      ssn: 'SSN',
      creditCard: 'Credit Card',
    };
    return typeMap[type] || type;
  };

  // Get step icon based on status
  const getStepIcon = (stepStatus: VerificationStep['status']) => {
    switch (stepStatus) {
      case 'pending':
        return <span className="step-icon step-icon--pending">○</span>;
      case 'running':
        return <span className="step-icon step-icon--running">◌</span>;
      case 'completed':
        return <span className="step-icon step-icon--completed">✓</span>;
      case 'skipped':
        return <span className="step-icon step-icon--skipped">–</span>;
    }
  };

  return (
    <div className="redaction-verifier">
      <div className="verifier-header">
        <h3>Redaction Verification</h3>
        <p className="verifier-description">
          Scanning recorded session for unredacted PII
        </p>
      </div>

      {/* Progress Bar */}
      {status === 'running' && (
        <div className="verifier-progress">
          <div className="progress-bar">
            <div className="progress-fill" style={{ width: `${progress}%` }} />
          </div>
          <span className="progress-text">{progress}%</span>
        </div>
      )}

      {/* Verification Steps */}
      <div className="verification-steps">
        <h4>Verification Steps</h4>
        <div className="steps-list">
          {steps.map((step) => (
            <div
              key={step.id}
              className={`verification-step verification-step--${step.status}`}
            >
              {getStepIcon(step.status)}
              <div className="step-content">
                <div className="step-header">
                  <span className="step-name">{step.name}</span>
                  {step.status === 'completed' && (
                    <span className="step-stats">
                      {step.itemsChecked} checked
                      {step.issuesFound > 0 && (
                        <span className="step-issues">
                          , {step.issuesFound} issues
                        </span>
                      )}
                    </span>
                  )}
                </div>
                <span className="step-description">{step.description}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Results Summary */}
      {status === 'completed' && (
        <div className="verification-results">
          <h4>Results</h4>
          {issues.length === 0 ? (
            <div className="result-badge result-badge--success">
              <span className="badge-icon">✓</span>
              <span className="badge-text">No PII detected</span>
              <span className="badge-description">
                Your redaction settings appear to be working correctly
              </span>
            </div>
          ) : (
            <div className="result-badge result-badge--warning">
              <span className="badge-icon">⚠</span>
              <span className="badge-text">
                Potential PII found: {issues.length} instance{issues.length !== 1 ? 's' : ''}
              </span>
              <span className="badge-description">
                Review the issues below and adjust your privacy settings
              </span>
            </div>
          )}
        </div>
      )}

      {/* Issues List */}
      {issues.length > 0 && (
        <div className="issues-list">
          <h4>Detected Issues</h4>
          {issues.map((issue) => (
            <div key={issue.id} className="issue-item">
              <div className="issue-header">
                <div className="issue-time">
                  <span className="time-label">Time:</span>
                  <span className="time-value">{formatTime(issue.timestamp)}</span>
                </div>
                <div className="issue-types">
                  {issue.piiTypes.map((type) => (
                    <span key={type} className={`pii-type-badge pii-type-badge--${type}`}>
                      {formatPiiType(type)}
                    </span>
                  ))}
                </div>
              </div>
              <div className="issue-context">
                <span className="context-label">Found in:</span>
                <span className="context-value">
                  {issue.context} ({issue.eventType})
                </span>
              </div>
              <div className="issue-snippet">
                <span className="snippet-label">Content (redacted):</span>
                <code className="snippet-value">{redactAll(issue.originalText)}</code>
              </div>
              {onSeekTo && (
                <button
                  className="jump-to-btn"
                  onClick={() => onSeekTo(issue.timestamp)}
                >
                  <svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14">
                    <path d="M8 5v14l11-7z" />
                  </svg>
                  Jump to this moment
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Re-run Button */}
      {status === 'completed' && (
        <div className="verifier-actions">
          <button className="rerun-btn" onClick={runVerification}>
            <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16">
              <path d="M17.65 6.35C16.2 4.9 14.21 4 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08c-.82 2.33-3.04 4-5.65 4-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z" />
            </svg>
            Run Verification Again
          </button>
        </div>
      )}
    </div>
  );
}
