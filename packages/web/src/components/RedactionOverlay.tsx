import { useEffect, useRef, useState, useCallback } from 'react';
import { detectPII } from '@screencapture/core';
import type { RecorderConfig } from '../hooks/useRecorder';
import './RedactionOverlay.css';

interface RedactionOverlayProps {
  /** Whether recording is currently active */
  isRecording: boolean;
  /** Whether to show redaction indicators */
  showIndicators: boolean;
  /** The recorder configuration to determine what's being redacted */
  config?: Partial<RecorderConfig>;
  /** Container element to scan for PII (defaults to document.body) */
  containerRef?: React.RefObject<HTMLElement | null>;
}

interface RedactedElement {
  element: Element;
  type: 'input' | 'text' | 'blocked';
  piiTypes?: string[];
  rect: DOMRect;
}

/**
 * Overlay component that shows visual indicators for redacted elements during recording.
 * Helps users understand what data is being protected without affecting the application.
 */
export function RedactionOverlay({
  isRecording,
  showIndicators,
  config,
  containerRef,
}: RedactionOverlayProps) {
  const [redactedElements, setRedactedElements] = useState<RedactedElement[]>([]);
  const [tooltipInfo, setTooltipInfo] = useState<{
    visible: boolean;
    x: number;
    y: number;
    types: string[];
  } | null>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const scanIntervalRef = useRef<number | null>(null);

  // Get the container to scan
  const getContainer = useCallback(() => {
    return containerRef?.current || document.body;
  }, [containerRef]);

  // Scan for elements that would be redacted
  const scanForRedactedElements = useCallback(() => {
    if (!isRecording || !showIndicators) {
      setRedactedElements([]);
      return;
    }

    const container = getContainer();
    const elements: RedactedElement[] = [];

    // Find masked input fields
    if (config?.maskAllInputs) {
      const inputs = container.querySelectorAll('input, textarea, select');
      inputs.forEach((input) => {
        const inputEl = input as HTMLInputElement;
        const type = inputEl.type?.toLowerCase() || 'text';

        // Check if this input type is masked
        const maskOptions = config.maskInputOptions;
        const isMasked = config.maskAllInputs ||
          (maskOptions && (
            (type === 'password' && maskOptions.password) ||
            (type === 'email' && maskOptions.email) ||
            (type === 'tel' && maskOptions.tel) ||
            (type === 'text' && maskOptions.text) ||
            (type === 'number' && maskOptions.number) ||
            (type === 'search' && maskOptions.search) ||
            (type === 'url' && maskOptions.url) ||
            (inputEl.tagName === 'TEXTAREA' && maskOptions.textarea) ||
            (inputEl.tagName === 'SELECT' && maskOptions.select)
          ));

        if (isMasked) {
          elements.push({
            element: input,
            type: 'input',
            rect: input.getBoundingClientRect(),
          });
        }
      });
    }

    // Find blocked elements
    if (config?.blockSelectors && config.blockSelectors.length > 0) {
      const selectorString = config.blockSelectors.join(', ');
      try {
        const blocked = container.querySelectorAll(selectorString);
        blocked.forEach((el) => {
          elements.push({
            element: el,
            type: 'blocked',
            rect: el.getBoundingClientRect(),
          });
        });
      } catch {
        // Invalid selector, ignore
      }
    }

    // Find text nodes with PII
    if (config?.maskTextContent && config?.redactionConfig) {
      const walker = document.createTreeWalker(
        container,
        NodeFilter.SHOW_TEXT,
        null
      );

      let node: Node | null;
      while ((node = walker.nextNode())) {
        const text = node.textContent || '';
        if (text.trim().length > 0) {
          const piiResult = detectPII(text);
          if (piiResult.hasPII) {
            // Check if any of the detected types are configured for redaction
            const activeTypes = piiResult.types.filter((type: string) => {
              const redactionConfig = config.redactionConfig;
              if (!redactionConfig) return false;
              return (
                (type === 'email' && redactionConfig.email) ||
                (type === 'phone' && redactionConfig.phone) ||
                (type === 'ssn' && redactionConfig.ssn) ||
                (type === 'creditCard' && redactionConfig.creditCard)
              );
            });

            if (activeTypes.length > 0 && node.parentElement) {
              const range = document.createRange();
              range.selectNodeContents(node);
              const rect = range.getBoundingClientRect();

              if (rect.width > 0 && rect.height > 0) {
                elements.push({
                  element: node.parentElement,
                  type: 'text',
                  piiTypes: activeTypes,
                  rect,
                });
              }
            }
          }
        }
      }
    }

    setRedactedElements(elements);
  }, [isRecording, showIndicators, config, getContainer]);

  // Set up scanning interval
  useEffect(() => {
    if (isRecording && showIndicators) {
      // Initial scan
      scanForRedactedElements();

      // Scan periodically for dynamic content
      scanIntervalRef.current = window.setInterval(scanForRedactedElements, 1000);

      // Also scan on scroll and resize
      const handleUpdate = () => scanForRedactedElements();
      window.addEventListener('scroll', handleUpdate, true);
      window.addEventListener('resize', handleUpdate);

      return () => {
        if (scanIntervalRef.current) {
          clearInterval(scanIntervalRef.current);
        }
        window.removeEventListener('scroll', handleUpdate, true);
        window.removeEventListener('resize', handleUpdate);
      };
    } else {
      setRedactedElements([]);
    }
  }, [isRecording, showIndicators, scanForRedactedElements]);

  // Handle tooltip display
  const showTooltip = useCallback((e: React.MouseEvent, types: string[]) => {
    setTooltipInfo({
      visible: true,
      x: e.clientX,
      y: e.clientY - 30,
      types,
    });
  }, []);

  const hideTooltip = useCallback(() => {
    setTooltipInfo(null);
  }, []);

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

  if (!isRecording || !showIndicators || redactedElements.length === 0) {
    return null;
  }

  return (
    <div
      ref={overlayRef}
      className="redaction-overlay"
      data-redaction-overlay="true"
    >
      {redactedElements.map((item, index) => {
        const { rect, type, piiTypes } = item;

        // Skip elements that are not visible
        if (rect.width === 0 || rect.height === 0) {
          return null;
        }

        return (
          <div
            key={`${type}-${index}`}
            className={`redaction-indicator redaction-indicator--${type}`}
            style={{
              left: rect.left + window.scrollX,
              top: rect.top + window.scrollY,
              width: rect.width,
              height: rect.height,
            }}
            onMouseEnter={(e) => {
              if (piiTypes && piiTypes.length > 0) {
                showTooltip(e, piiTypes);
              }
            }}
            onMouseLeave={hideTooltip}
          >
            {type === 'input' && (
              <span className="redaction-badge redaction-badge--lock">
                <svg viewBox="0 0 24 24" fill="currentColor" width="12" height="12">
                  <path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2z"/>
                </svg>
              </span>
            )}
            {type === 'blocked' && (
              <span className="redaction-badge redaction-badge--blocked">
                <svg viewBox="0 0 24 24" fill="currentColor" width="12" height="12">
                  <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zM4 12c0-4.42 3.58-8 8-8 1.85 0 3.55.63 4.9 1.69L5.69 16.9C4.63 15.55 4 13.85 4 12zm8 8c-1.85 0-3.55-.63-4.9-1.69L18.31 7.1C19.37 8.45 20 10.15 20 12c0 4.42-3.58 8-8 8z"/>
                </svg>
              </span>
            )}
            {type === 'text' && piiTypes && (
              <span className="redaction-badge redaction-badge--pii">
                PII
              </span>
            )}
          </div>
        );
      })}

      {/* Tooltip */}
      {tooltipInfo && tooltipInfo.visible && (
        <div
          className="redaction-tooltip"
          style={{
            left: tooltipInfo.x,
            top: tooltipInfo.y,
          }}
        >
          <span className="redaction-tooltip-title">Redacted:</span>
          {tooltipInfo.types.map((type) => (
            <span key={type} className="redaction-tooltip-type">
              {formatPiiType(type)}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Hook to manage redaction indicator visibility.
 */
export function useRedactionIndicators(initialVisible = true) {
  const [showIndicators, setShowIndicators] = useState(initialVisible);

  const toggleIndicators = useCallback(() => {
    setShowIndicators((prev) => !prev);
  }, []);

  return {
    showIndicators,
    setShowIndicators,
    toggleIndicators,
  };
}
