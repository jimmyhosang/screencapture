import { useState, useRef, useEffect, useCallback } from 'react';

interface TextBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface TextRegion {
  text: string;
  bounds: TextBounds;
  confidence: number;
}

interface OCRResult {
  regions: TextRegion[];
  processingTimeMs: number;
  engine: 'vision' | 'tesseract';
  frameWidth: number;
  frameHeight: number;
}

interface PIIRegion {
  region: TextRegion;
  piiTypes: string[];
}

interface OCRTestModeProps {
  onClose: () => void;
}

function OCRTestMode({ onClose }: OCRTestModeProps): JSX.Element {
  const [imagePath, setImagePath] = useState<string | null>(null);
  const [imageDataUrl, setImageDataUrl] = useState<string | null>(null);
  const [ocrResult, setOcrResult] = useState<OCRResult | null>(null);
  const [piiRegions, setPiiRegions] = useState<PIIRegion[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [engine, setEngine] = useState<string>('initializing...');
  const [selectedRegion, setSelectedRegion] = useState<TextRegion | null>(null);
  const [showPIIOnly, setShowPIIOnly] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);

  // Initialize OCR engine on mount
  useEffect(() => {
    const initOCR = async () => {
      try {
        const result = await window.api.ocr.initialize();
        setEngine(result.engine);
      } catch (err) {
        console.error('Failed to initialize OCR:', err);
        setEngine('failed');
      }
    };
    initOCR();

    return () => {
      window.api.ocr.terminate();
    };
  }, []);

  // Load image and draw on canvas
  const loadImage = useCallback((dataUrl: string) => {
    const img = new Image();
    img.onload = () => {
      imageRef.current = img;
      const canvas = canvasRef.current;
      if (canvas) {
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0);
        }
      }
    };
    img.src = dataUrl;
    setImageDataUrl(dataUrl);
  }, []);

  // Select image from file
  const handleSelectImage = async () => {
    try {
      const filePath = await window.api.ocr.selectTestImage();
      if (filePath) {
        setImagePath(filePath);
        setOcrResult(null);
        setPiiRegions([]);
        setSelectedRegion(null);
        setError(null);

        // Read file and convert to data URL
        const response = await fetch(`file://${filePath}`);
        const blob = await response.blob();
        const reader = new FileReader();
        reader.onload = (e) => {
          const dataUrl = e.target?.result as string;
          loadImage(dataUrl);
        };
        reader.readAsDataURL(blob);
      }
    } catch (err) {
      console.error('Failed to select image:', err);
      setError('Failed to load image');
    }
  };

  // Process image with OCR
  const handleProcessOCR = async () => {
    if (!imageDataUrl || !imageRef.current) return;

    setIsProcessing(true);
    setError(null);
    setSelectedRegion(null);

    try {
      const canvas = canvasRef.current;
      if (!canvas) return;

      // Get image data as base64
      const base64Data = imageDataUrl.split(',')[1];
      const width = imageRef.current.width;
      const height = imageRef.current.height;

      // Run OCR
      const result = await window.api.ocr.processFrame(base64Data, width, height);
      setOcrResult(result);

      // Also detect PII
      const pii = await window.api.ocr.detectPII(base64Data, width, height);
      setPiiRegions(pii);

      // Draw results on canvas
      drawResults(result, pii);
    } catch (err) {
      console.error('OCR processing failed:', err);
      setError('OCR processing failed');
    } finally {
      setIsProcessing(false);
    }
  };

  // Draw OCR results on canvas
  const drawResults = useCallback((result: OCRResult, pii: PIIRegion[]) => {
    const canvas = canvasRef.current;
    const img = imageRef.current;
    if (!canvas || !img) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Redraw image
    ctx.drawImage(img, 0, 0);

    // Create set of PII region texts for quick lookup
    const piiTexts = new Set(pii.map(p => p.region.text));

    // Draw text regions
    for (const region of result.regions) {
      const isPII = piiTexts.has(region.text);

      if (showPIIOnly && !isPII) continue;

      // Set colors based on confidence and PII status
      if (isPII) {
        ctx.strokeStyle = '#ef4444'; // Red for PII
        ctx.fillStyle = 'rgba(239, 68, 68, 0.2)';
      } else if (region.confidence >= 0.8) {
        ctx.strokeStyle = '#22c55e'; // Green for high confidence
        ctx.fillStyle = 'rgba(34, 197, 94, 0.1)';
      } else if (region.confidence >= 0.5) {
        ctx.strokeStyle = '#eab308'; // Yellow for medium confidence
        ctx.fillStyle = 'rgba(234, 179, 8, 0.1)';
      } else {
        ctx.strokeStyle = '#6b7280'; // Gray for low confidence
        ctx.fillStyle = 'rgba(107, 114, 128, 0.1)';
      }

      ctx.lineWidth = 2;
      ctx.fillRect(region.bounds.x, region.bounds.y, region.bounds.width, region.bounds.height);
      ctx.strokeRect(region.bounds.x, region.bounds.y, region.bounds.width, region.bounds.height);

      // Draw confidence percentage
      ctx.fillStyle = isPII ? '#ef4444' : '#22c55e';
      ctx.font = '12px monospace';
      ctx.fillText(
        `${Math.round(region.confidence * 100)}%`,
        region.bounds.x,
        region.bounds.y - 4
      );
    }
  }, [showPIIOnly]);

  // Redraw when showPIIOnly changes
  useEffect(() => {
    if (ocrResult && piiRegions) {
      drawResults(ocrResult, piiRegions);
    }
  }, [showPIIOnly, ocrResult, piiRegions, drawResults]);

  // Handle canvas click to select region
  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!ocrResult) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const x = (e.clientX - rect.left) * scaleX;
    const y = (e.clientY - rect.top) * scaleY;

    // Find clicked region
    for (const region of ocrResult.regions) {
      if (
        x >= region.bounds.x &&
        x <= region.bounds.x + region.bounds.width &&
        y >= region.bounds.y &&
        y <= region.bounds.y + region.bounds.height
      ) {
        setSelectedRegion(region);
        return;
      }
    }
    setSelectedRegion(null);
  };

  // Get PII types for a region
  const getPIITypes = (text: string): string[] => {
    const pii = piiRegions.find(p => p.region.text === text);
    return pii?.piiTypes || [];
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="ocr-test-container" onClick={(e) => e.stopPropagation()}>
        <div className="ocr-test-header">
          <h2>OCR Test Mode</h2>
          <div className="engine-badge">
            Engine: <strong>{engine}</strong>
          </div>
          <button className="btn-icon" onClick={onClose}>✕</button>
        </div>

        <div className="ocr-test-content">
          {/* Left panel: Image and controls */}
          <div className="ocr-test-image-panel">
            <div className="ocr-test-controls">
              <button className="btn btn-primary" onClick={handleSelectImage}>
                Select Image
              </button>
              <button
                className="btn btn-secondary"
                onClick={handleProcessOCR}
                disabled={!imageDataUrl || isProcessing}
              >
                {isProcessing ? 'Processing...' : 'Run OCR'}
              </button>
              {ocrResult && (
                <label className="toggle-label">
                  <input
                    type="checkbox"
                    checked={showPIIOnly}
                    onChange={(e) => setShowPIIOnly(e.target.checked)}
                  />
                  Show PII Only
                </label>
              )}
            </div>

            {error && (
              <div className="ocr-error">{error}</div>
            )}

            <div className="ocr-canvas-container">
              {!imageDataUrl ? (
                <div className="ocr-placeholder">
                  <p>Select an image to test OCR text detection</p>
                  <p className="hint">Supported formats: PNG, JPG, WebP, BMP, GIF</p>
                </div>
              ) : (
                <canvas
                  ref={canvasRef}
                  className="ocr-canvas"
                  onClick={handleCanvasClick}
                />
              )}
            </div>

            {imagePath && (
              <div className="ocr-file-path">
                <code>{imagePath}</code>
              </div>
            )}
          </div>

          {/* Right panel: Results */}
          <div className="ocr-test-results-panel">
            {ocrResult ? (
              <>
                <div className="ocr-stats">
                  <div className="stat-item">
                    <span className="stat-label">Processing Time</span>
                    <span className="stat-value">{ocrResult.processingTimeMs.toFixed(0)}ms</span>
                  </div>
                  <div className="stat-item">
                    <span className="stat-label">Regions Found</span>
                    <span className="stat-value">{ocrResult.regions.length}</span>
                  </div>
                  <div className="stat-item">
                    <span className="stat-label">PII Detected</span>
                    <span className="stat-value pii-count">{piiRegions.length}</span>
                  </div>
                  <div className="stat-item">
                    <span className="stat-label">Image Size</span>
                    <span className="stat-value">{ocrResult.frameWidth}x{ocrResult.frameHeight}</span>
                  </div>
                </div>

                {selectedRegion && (
                  <div className="ocr-selected-region">
                    <h4>Selected Region</h4>
                    <div className="region-detail">
                      <label>Text:</label>
                      <span className="region-text">{selectedRegion.text}</span>
                    </div>
                    <div className="region-detail">
                      <label>Confidence:</label>
                      <span className={`confidence ${selectedRegion.confidence >= 0.8 ? 'high' : selectedRegion.confidence >= 0.5 ? 'medium' : 'low'}`}>
                        {Math.round(selectedRegion.confidence * 100)}%
                      </span>
                    </div>
                    <div className="region-detail">
                      <label>Bounds:</label>
                      <span>
                        ({selectedRegion.bounds.x}, {selectedRegion.bounds.y}) -
                        {selectedRegion.bounds.width}x{selectedRegion.bounds.height}
                      </span>
                    </div>
                    {getPIITypes(selectedRegion.text).length > 0 && (
                      <div className="region-detail pii-warning">
                        <label>PII Types:</label>
                        <span>{getPIITypes(selectedRegion.text).join(', ')}</span>
                      </div>
                    )}
                  </div>
                )}

                <div className="ocr-regions-list">
                  <h4>
                    Detected Text
                    {showPIIOnly && ` (${piiRegions.length} PII)`}
                    {!showPIIOnly && ` (${ocrResult.regions.length} regions)`}
                  </h4>
                  <div className="regions-scroll">
                    {ocrResult.regions
                      .filter(r => !showPIIOnly || getPIITypes(r.text).length > 0)
                      .map((region, idx) => {
                        const piiTypes = getPIITypes(region.text);
                        return (
                          <div
                            key={idx}
                            className={`region-item ${selectedRegion === region ? 'selected' : ''} ${piiTypes.length > 0 ? 'pii' : ''}`}
                            onClick={() => setSelectedRegion(region)}
                          >
                            <span className="region-text">{region.text}</span>
                            <span className={`region-confidence ${region.confidence >= 0.8 ? 'high' : region.confidence >= 0.5 ? 'medium' : 'low'}`}>
                              {Math.round(region.confidence * 100)}%
                            </span>
                            {piiTypes.length > 0 && (
                              <span className="pii-badge">{piiTypes[0]}</span>
                            )}
                          </div>
                        );
                      })}
                  </div>
                </div>
              </>
            ) : (
              <div className="ocr-results-placeholder">
                <p>Run OCR to see detected text regions</p>
                <div className="ocr-legend">
                  <h4>Legend</h4>
                  <div className="legend-item">
                    <span className="legend-color high"></span>
                    <span>High confidence (&gt;80%)</span>
                  </div>
                  <div className="legend-item">
                    <span className="legend-color medium"></span>
                    <span>Medium confidence (50-80%)</span>
                  </div>
                  <div className="legend-item">
                    <span className="legend-color low"></span>
                    <span>Low confidence (&lt;50%)</span>
                  </div>
                  <div className="legend-item">
                    <span className="legend-color pii"></span>
                    <span>PII detected (email, phone, SSN, etc.)</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default OCRTestMode;
