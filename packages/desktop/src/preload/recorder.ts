/**
 * Preload for the URL-recording window.
 *
 * Runs before every page load in that window (so recording survives
 * navigation), records the DOM with a bundled copy of rrweb (no CDN, not
 * subject to the page's CSP) and streams events to the main process.
 * PII in page text is redacted at capture time with @screencapture/core.
 */
import { ipcRenderer } from 'electron';
import { record } from 'rrweb';
import { redactWithConfig, DEFAULT_REDACTION_CONFIG } from '@screencapture/core';

interface RecorderConfig {
  maskAllInputs?: boolean;
  maskTextContent?: boolean;
  blockSelectors?: string[];
  maskTextSelectors?: string[];
  maskInputOptions?: Record<string, boolean>;
}

const config: RecorderConfig | null = ipcRenderer.sendSync('recorder:getConfig');

if (config) {
  const blockSelectors = config.blockSelectors ?? [];
  const stop = record({
    emit(event) {
      ipcRenderer.send('recorder:event', event);
    },
    maskAllInputs: config.maskAllInputs ?? true,
    maskInputOptions: { password: true, ...config.maskInputOptions },
    blockSelector: blockSelectors.length ? blockSelectors.join(', ') : undefined,
    // rrweb only runs maskTextFn on elements matching maskTextSelector, so
    // match everything when PII redaction is on (non-PII text is unchanged).
    maskTextSelector: config.maskTextContent
      ? '*'
      : config.maskTextSelectors?.join(', ') || undefined,
    maskTextFn: config.maskTextContent
      ? (text: string) => redactWithConfig(text, DEFAULT_REDACTION_CONFIG)
      : undefined,
    inlineStylesheet: true,
    collectFonts: true,
  });

  // Main asks us to stop; reply after the last event so nothing is lost
  ipcRenderer.on('recorder:stop', () => {
    stop?.();
    ipcRenderer.send('recorder:stopped');
  });
}
