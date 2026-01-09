/**
 * OCR Results Panel Component
 *
 * Displays OCR-extracted text synchronized with video playback.
 * Provides search functionality and timestamp-based navigation.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import './OcrResultsPanel.css';

// Types matching the backend
interface WordInfo {
  text: string;
  bbox: { x: number; y: number; width: number; height: number };
  confidence: number;
}

interface OcrFrame {
  timestamp: number;
  frameIndex: number;
  text: string;
  words: WordInfo[];
  confidence: number;
}

interface OcrReport {
  id: string;
  recordingId: string;
  processedAt: number;
  frameCount: number;
  timeline: OcrFrame[];
  fullText: string;
  uniqueWords: string[];
  processingDurationMs: number;
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';
  progress: number;
  error?: string;
}

interface OcrResultsPanelProps {
  recordingId: string;
  currentTime: number; // Current video playback time in seconds
  onSeekTo: (timestamp: number) => void;
  onClose?: () => void;
}

interface SearchResult {
  frameIndex: number;
  timestamp: number;
  text: string;
  matchCount: number;
}

export function OcrResultsPanel({
  recordingId,
  currentTime,
  onSeekTo,
  onClose
}: OcrResultsPanelProps) {
  const [report, setReport] = useState<OcrReport | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingProgress, setProcessingProgress] = useState(0);
  const [processingMessage, setProcessingMessage] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [currentSearchIndex, setCurrentSearchIndex] = useState(0);
  const [activeFrameIndex, setActiveFrameIndex] = useState(0);
  const [showFullText, setShowFullText] = useState(false);

  const timelineRef = useRef<HTMLDivElement>(null);
  const activeFrameRef = useRef<HTMLDivElement>(null);

  // Load OCR report
  useEffect(() => {
    loadReport();
    setupProgressListener();

    return () => {
      window.api.ocrProcessor.removeProgressListener();
    };
  }, [recordingId]);

  // Set up progress listener
  const setupProgressListener = () => {
    window.api.ocrProcessor.onProgress((data) => {
      if (data.recordingId === recordingId) {
        setIsProcessing(data.status === 'processing');
        setProcessingProgress(data.progress);
        setProcessingMessage(data.message || '');

        if (data.status === 'completed') {
          loadReport();
        } else if (data.status === 'failed') {
          setError(data.message || 'Processing failed');
          setIsProcessing(false);
        }
      }
    });
  };

  // Load report from backend
  const loadReport = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const result = await window.api.ocrProcessor.getReportByRecording(recordingId);
      setReport(result);

      if (result?.status === 'processing') {
        setIsProcessing(true);
        setProcessingProgress(result.progress);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load OCR report');
    } finally {
      setIsLoading(false);
    }
  };

  // Start OCR processing
  const startProcessing = async () => {
    setIsProcessing(true);
    setProcessingProgress(0);
    setProcessingMessage('Starting OCR processing...');
    setError(null);

    try {
      await window.api.ocrProcessor.queue(recordingId, {
        frameInterval: 2,
        languages: ['eng'],
        minConfidence: 0.5
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start OCR processing');
      setIsProcessing(false);
    }
  };

  // Update active frame based on current playback time
  useEffect(() => {
    if (!report?.timeline.length) return;

    // Find the frame closest to the current time
    let closestIndex = 0;
    let minDiff = Infinity;

    report.timeline.forEach((frame, index) => {
      const diff = Math.abs(frame.timestamp - currentTime);
      if (diff < minDiff) {
        minDiff = diff;
        closestIndex = index;
      }
    });

    setActiveFrameIndex(closestIndex);
  }, [currentTime, report]);

  // Scroll active frame into view
  useEffect(() => {
    if (activeFrameRef.current && timelineRef.current) {
      activeFrameRef.current.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest'
      });
    }
  }, [activeFrameIndex]);

  // Search functionality
  useEffect(() => {
    if (!report || !searchQuery.trim()) {
      setSearchResults([]);
      return;
    }

    const query = searchQuery.toLowerCase();
    const results: SearchResult[] = [];

    report.timeline.forEach((frame, index) => {
      const lowerText = frame.text.toLowerCase();
      if (lowerText.includes(query)) {
        const matches = lowerText.split(query).length - 1;
        results.push({
          frameIndex: index,
          timestamp: frame.timestamp,
          text: frame.text,
          matchCount: matches
        });
      }
    });

    setSearchResults(results);
    setCurrentSearchIndex(0);
  }, [searchQuery, report]);

  // Navigate to search result
  const goToSearchResult = (index: number) => {
    if (searchResults[index]) {
      setCurrentSearchIndex(index);
      onSeekTo(searchResults[index].timestamp);
    }
  };

  // Format timestamp
  const formatTimestamp = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Highlight search matches in text
  const highlightText = (text: string, query: string): JSX.Element => {
    if (!query.trim()) return <>{text}</>;

    const parts = text.split(new RegExp(`(${query})`, 'gi'));
    return (
      <>
        {parts.map((part, i) =>
          part.toLowerCase() === query.toLowerCase() ? (
            <mark key={i} className="search-highlight">
              {part}
            </mark>
          ) : (
            part
          )
        )}
      </>
    );
  };

  // Render loading state
  if (isLoading) {
    return (
      <div className="ocr-panel">
        <div className="ocr-panel-header">
          <h3>OCR Text Extraction</h3>
          {onClose && (
            <button className="btn-close" onClick={onClose}>
              X
            </button>
          )}
        </div>
        <div className="ocr-loading">
          <div className="spinner"></div>
          <p>Loading OCR data...</p>
        </div>
      </div>
    );
  }

  // Render processing state
  if (isProcessing) {
    return (
      <div className="ocr-panel">
        <div className="ocr-panel-header">
          <h3>OCR Text Extraction</h3>
          {onClose && (
            <button className="btn-close" onClick={onClose}>
              X
            </button>
          )}
        </div>
        <div className="ocr-processing">
          <div className="progress-bar">
            <div
              className="progress-fill"
              style={{ width: `${processingProgress}%` }}
            ></div>
          </div>
          <p className="progress-text">{Math.round(processingProgress)}%</p>
          <p className="progress-message">{processingMessage}</p>
          <button
            className="btn btn-secondary"
            onClick={() => window.api.ocrProcessor.cancelJob(recordingId)}
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  // Render no report state
  if (!report) {
    return (
      <div className="ocr-panel">
        <div className="ocr-panel-header">
          <h3>OCR Text Extraction</h3>
          {onClose && (
            <button className="btn-close" onClick={onClose}>
              X
            </button>
          )}
        </div>
        <div className="ocr-empty">
          <div className="empty-icon">T</div>
          <h4>No OCR Data Available</h4>
          <p>Extract text from this recording to enable text search and analysis.</p>
          <button className="btn btn-primary" onClick={startProcessing}>
            Start Text Extraction
          </button>
          {error && <p className="error-message">{error}</p>}
        </div>
      </div>
    );
  }

  // Get current frame
  const currentFrame = report.timeline[activeFrameIndex];

  return (
    <div className="ocr-panel">
      {/* Header */}
      <div className="ocr-panel-header">
        <h3>OCR Text Extraction</h3>
        <div className="header-actions">
          <button
            className={`btn btn-text ${showFullText ? 'active' : ''}`}
            onClick={() => setShowFullText(!showFullText)}
            title="Toggle full text view"
          >
            {showFullText ? 'Timeline' : 'Full Text'}
          </button>
          {onClose && (
            <button className="btn-close" onClick={onClose}>
              X
            </button>
          )}
        </div>
      </div>

      {/* Stats bar */}
      <div className="ocr-stats">
        <span>{report.frameCount} frames</span>
        <span>{report.uniqueWords.length} unique words</span>
        <span>{Math.round(report.processingDurationMs / 1000)}s processing</span>
      </div>

      {/* Search bar */}
      <div className="ocr-search">
        <input
          type="text"
          className="search-input"
          placeholder="Search text..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
        {searchResults.length > 0 && (
          <div className="search-nav">
            <span>
              {currentSearchIndex + 1} / {searchResults.length}
            </span>
            <button
              className="btn-nav"
              onClick={() =>
                goToSearchResult(
                  (currentSearchIndex - 1 + searchResults.length) % searchResults.length
                )
              }
            >
              Prev
            </button>
            <button
              className="btn-nav"
              onClick={() =>
                goToSearchResult((currentSearchIndex + 1) % searchResults.length)
              }
            >
              Next
            </button>
          </div>
        )}
      </div>

      {/* Content */}
      {showFullText ? (
        /* Full text view */
        <div className="ocr-full-text">
          <pre>{highlightText(report.fullText, searchQuery)}</pre>
        </div>
      ) : (
        /* Timeline view */
        <div className="ocr-timeline" ref={timelineRef}>
          {report.timeline.map((frame, index) => (
            <div
              key={frame.frameIndex}
              ref={index === activeFrameIndex ? activeFrameRef : null}
              className={`timeline-frame ${
                index === activeFrameIndex ? 'active' : ''
              } ${
                searchResults.some((r) => r.frameIndex === index) ? 'has-match' : ''
              }`}
              onClick={() => onSeekTo(frame.timestamp)}
            >
              <div className="frame-header">
                <span className="frame-timestamp">
                  {formatTimestamp(frame.timestamp)}
                </span>
                <span className="frame-confidence">
                  {Math.round(frame.confidence * 100)}%
                </span>
              </div>
              <div className="frame-text">
                {frame.text ? (
                  highlightText(frame.text.slice(0, 200), searchQuery)
                ) : (
                  <span className="no-text">No text detected</span>
                )}
                {frame.text.length > 200 && '...'}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Current frame details */}
      {currentFrame && !showFullText && (
        <div className="ocr-current-frame">
          <div className="current-frame-header">
            <span>
              Current: {formatTimestamp(currentFrame.timestamp)} (Frame{' '}
              {currentFrame.frameIndex + 1})
            </span>
          </div>
          <div className="current-frame-text">
            {currentFrame.text || 'No text detected at this timestamp'}
          </div>
          {currentFrame.words.length > 0 && (
            <div className="word-cloud">
              {currentFrame.words.slice(0, 20).map((word, i) => (
                <span
                  key={i}
                  className="word-tag"
                  style={{ opacity: 0.5 + word.confidence * 0.5 }}
                  title={`Confidence: ${Math.round(word.confidence * 100)}%`}
                >
                  {word.text}
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Error display */}
      {error && (
        <div className="ocr-error">
          <p>{error}</p>
          <button className="btn btn-secondary" onClick={loadReport}>
            Retry
          </button>
        </div>
      )}
    </div>
  );
}

export default OcrResultsPanel;
