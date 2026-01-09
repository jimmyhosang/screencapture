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
  type: string;
  bounds: TextBounds;
  confidence: 'high' | 'medium' | 'low';
  originalText: string;
  matchedText: string;
  redactedText: string;
  color: string;
  matchStart: number;
  matchEnd: number;
}

interface PIIScanResult {
  regions: PIIRegion[];
  summary: Record<string, number>;
  processingTimeMs: number;
  regionsScanned: number;
}

interface OCRTestModeProps {
  onClose: () => void;
}

// PII type display names and descriptions
const PII_TYPE_INFO: Record<string, { name: string; icon: string; description: string }> = {
  ssn: { name: 'SSN', icon: '🔴', description: 'Social Security Number' },
  creditCard: { name: 'Credit Card', icon: '💳', description: 'Credit/Debit Card Number' },
  bankAccount: { name: 'Bank Account', icon: '🏦', description: 'Bank Account Number' },
  iban: { name: 'IBAN', icon: '🌍', description: 'International Bank Account' },
  email: { name: 'Email', icon: '📧', description: 'Email Address' },
  phone: { name: 'Phone', icon: '📱', description: 'Phone Number' },
  ipv4: { name: 'IPv4', icon: '🌐', description: 'IP Address (v4)' },
  ipv6: { name: 'IPv6', icon: '🌐', description: 'IP Address (v6)' },
  apiKey: { name: 'API Key', icon: '🔑', description: 'API Key/Token' },
  passport: { name: 'Passport', icon: '🛂', description: 'Passport Number' },
  driverLicense: { name: 'License', icon: '🪪', description: "Driver's License" },
  dateOfBirth: { name: 'DOB', icon: '🎂', description: 'Date of Birth' },
  name: { name: 'Name', icon: '👤', description: 'Personal Name' },
  currency: { name: 'Currency', icon: '💰', description: 'Currency Amount' },
};

function OCRTestMode({ onClose }: OCRTestModeProps): JSX.Element {
  const [imagePath, setImagePath] = useState<string | null>(null);
  const [imageDataUrl, setImageDataUrl] = useState<string | null>(null);
  const [ocrResult, setOcrResult] = useState<OCRResult | null>(null);
  const [piiResult, setPiiResult] = useState<PIIScanResult | null>(null);
  const [piiColors, setPiiColors] = useState<Record<string, string>>({});
  const [isProcessing, setIsProcessing] = useState(false);
  const [engine, setEngine] = useState<string>('initializing...');
  const [selectedRegion, setSelectedRegion] = useState<TextRegion | null>(null);
  const [selectedPII, setSelectedPII] = useState<PIIRegion | null>(null);
  const [showOCRBoxes, setShowOCRBoxes] = useState(true);
  const [showPIIBoxes, setShowPIIBoxes] = useState(true);
  const [showPreciseBounds, setShowPreciseBounds] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);

  // Check if running in Electron with window.api available
  const isElectron = typeof window !== 'undefined' && window.api?.ocr;

  // Initialize OCR engine and get PII colors (only if Electron)
  useEffect(() => {
    if (!isElectron) return;

    const init = async () => {
      try {
        const result = await window.api.ocr.initialize();
        setEngine(result.engine);

        // Get PII colors
        const colors = await window.api.pii.getColors();
        setPiiColors(colors);
      } catch (err) {
        console.error('Failed to initialize:', err);
        setEngine('failed');
      }
    };
    init();

    return () => {
      if (isElectron) {
        window.api.ocr.terminate();
      }
    };
  }, [isElectron]);

  // If not in Electron, show fallback UI
  if (!isElectron) {
    return (
      <div className="modal-overlay" onClick={onClose}>
        <div className="ocr-test-container" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '500px' }}>
          <div className="ocr-test-header">
            <h2>OCR Test Mode</h2>
            <button className="btn-icon" onClick={onClose}>✕</button>
          </div>
          <div style={{
            padding: '32px',
            textAlign: 'center',
            backgroundColor: 'rgba(239, 68, 68, 0.1)',
            borderRadius: '8px',
            margin: '16px'
          }}>
            <p style={{ fontSize: '18px', marginBottom: '8px' }}>⚠️ Electron Required</p>
            <p style={{ opacity: 0.8 }}>OCR features require the native Electron application.</p>
            <p style={{ opacity: 0.6, fontSize: '14px', marginTop: '12px' }}>
              Run <code>pnpm --filter @screencapture/desktop dev</code> to start the full app.
            </p>
          </div>
        </div>
      </div>
    );
  }

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
        setPiiResult(null);
        setSelectedRegion(null);
        setSelectedPII(null);
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

  // Process image with OCR + PII detection
  const handleProcessOCR = async () => {
    if (!imageDataUrl || !imageRef.current) return;

    setIsProcessing(true);
    setError(null);
    setSelectedRegion(null);
    setSelectedPII(null);

    try {
      // Get image data as base64
      const base64Data = imageDataUrl.split(',')[1];
      const width = imageRef.current.width;
      const height = imageRef.current.height;

      // Use combined OCR + PII scan
      const { ocrResult: ocr, piiResult: pii } = await window.api.pii.scanImage(base64Data, width, height);
      setOcrResult(ocr);
      setPiiResult(pii);

      // Draw results
      drawResults(ocr, pii);
    } catch (err) {
      console.error('OCR processing failed:', err);
      setError('OCR processing failed');
    } finally {
      setIsProcessing(false);
    }
  };

  // Draw OCR and PII results on canvas
  const drawResults = useCallback((ocr: OCRResult, pii: PIIScanResult) => {
    const canvas = canvasRef.current;
    const img = imageRef.current;
    if (!canvas || !img) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Redraw image
    ctx.drawImage(img, 0, 0);

    // Draw OCR text regions (if enabled)
    if (showOCRBoxes) {
      for (const region of ocr.regions) {
        // Check if this region contains PII
        const hasPII = pii.regions.some(p => p.originalText === region.text);
        if (hasPII && showPIIBoxes) continue; // Skip - will be drawn by PII

        // Set color based on confidence
        if (region.confidence >= 0.8) {
          ctx.strokeStyle = '#22c55e'; // Green
          ctx.fillStyle = 'rgba(34, 197, 94, 0.1)';
        } else if (region.confidence >= 0.5) {
          ctx.strokeStyle = '#eab308'; // Yellow
          ctx.fillStyle = 'rgba(234, 179, 8, 0.1)';
        } else {
          ctx.strokeStyle = '#6b7280'; // Gray
          ctx.fillStyle = 'rgba(107, 114, 128, 0.1)';
        }

        ctx.lineWidth = 1;
        ctx.setLineDash([]);
        ctx.fillRect(region.bounds.x, region.bounds.y, region.bounds.width, region.bounds.height);
        ctx.strokeRect(region.bounds.x, region.bounds.y, region.bounds.width, region.bounds.height);
      }
    }

    // Draw PII regions (if enabled)
    if (showPIIBoxes) {
      for (const piiRegion of pii.regions) {
        const color = piiRegion.color || piiColors[piiRegion.type] || '#ef4444';

        // Draw full region with type color
        ctx.strokeStyle = color;
        ctx.fillStyle = hexToRgba(color, 0.15);
        ctx.lineWidth = 2;
        ctx.setLineDash([]);
        ctx.fillRect(piiRegion.bounds.x, piiRegion.bounds.y, piiRegion.bounds.width, piiRegion.bounds.height);
        ctx.strokeRect(piiRegion.bounds.x, piiRegion.bounds.y, piiRegion.bounds.width, piiRegion.bounds.height);

        // Draw precise match bounds (if enabled)
        if (showPreciseBounds && piiRegion.matchStart !== undefined) {
          const charWidth = piiRegion.bounds.width / Math.max(piiRegion.originalText.length, 1);
          const matchX = piiRegion.bounds.x + piiRegion.matchStart * charWidth;
          const matchWidth = (piiRegion.matchEnd - piiRegion.matchStart) * charWidth;

          ctx.fillStyle = hexToRgba(color, 0.4);
          ctx.fillRect(matchX, piiRegion.bounds.y, matchWidth, piiRegion.bounds.height);

          // Draw dashed border for precise match
          ctx.strokeStyle = color;
          ctx.setLineDash([4, 2]);
          ctx.strokeRect(matchX, piiRegion.bounds.y, matchWidth, piiRegion.bounds.height);
        }

        // Draw type label
        const typeInfo = PII_TYPE_INFO[piiRegion.type.replace('custom:', '')] || { icon: '⚠️', name: piiRegion.type };
        ctx.fillStyle = color;
        ctx.font = 'bold 11px sans-serif';
        ctx.fillText(
          `${typeInfo.icon} ${typeInfo.name}`,
          piiRegion.bounds.x,
          piiRegion.bounds.y - 4
        );
      }
    }

    ctx.setLineDash([]);
  }, [showOCRBoxes, showPIIBoxes, showPreciseBounds, piiColors]);

  // Redraw when display options change
  useEffect(() => {
    if (ocrResult && piiResult) {
      drawResults(ocrResult, piiResult);
    }
  }, [showOCRBoxes, showPIIBoxes, showPreciseBounds, ocrResult, piiResult, drawResults]);

  // Handle canvas click
  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!ocrResult || !piiResult) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const x = (e.clientX - rect.left) * scaleX;
    const y = (e.clientY - rect.top) * scaleY;

    // Check PII regions first
    for (const pii of piiResult.regions) {
      if (
        x >= pii.bounds.x &&
        x <= pii.bounds.x + pii.bounds.width &&
        y >= pii.bounds.y &&
        y <= pii.bounds.y + pii.bounds.height
      ) {
        setSelectedPII(pii);
        setSelectedRegion(null);
        return;
      }
    }

    // Then check OCR regions
    for (const region of ocrResult.regions) {
      if (
        x >= region.bounds.x &&
        x <= region.bounds.x + region.bounds.width &&
        y >= region.bounds.y &&
        y <= region.bounds.y + region.bounds.height
      ) {
        setSelectedRegion(region);
        setSelectedPII(null);
        return;
      }
    }

    setSelectedRegion(null);
    setSelectedPII(null);
  };

  // Helper to convert hex color to rgba
  function hexToRgba(hex: string, alpha: number): string {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

  // Get unique PII types found
  const piiTypesFound = piiResult ? Object.keys(piiResult.summary) : [];

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="ocr-test-container" onClick={(e) => e.stopPropagation()}>
        <div className="ocr-test-header">
          <h2>OCR Test Mode (Enhanced PII Detection)</h2>
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
                {isProcessing ? 'Processing...' : 'Run OCR + PII'}
              </button>
            </div>

            {/* Display options */}
            {ocrResult && (
              <div className="ocr-display-options">
                <label className="toggle-label">
                  <input
                    type="checkbox"
                    checked={showOCRBoxes}
                    onChange={(e) => setShowOCRBoxes(e.target.checked)}
                  />
                  OCR Boxes
                </label>
                <label className="toggle-label">
                  <input
                    type="checkbox"
                    checked={showPIIBoxes}
                    onChange={(e) => setShowPIIBoxes(e.target.checked)}
                  />
                  PII Boxes
                </label>
                <label className="toggle-label">
                  <input
                    type="checkbox"
                    checked={showPreciseBounds}
                    onChange={(e) => setShowPreciseBounds(e.target.checked)}
                  />
                  Precise Match
                </label>
              </div>
            )}

            {error && <div className="ocr-error">{error}</div>}

            <div className="ocr-canvas-container">
              {!imageDataUrl ? (
                <div className="ocr-placeholder">
                  <p>Select an image to test OCR + PII detection</p>
                  <p className="hint">Detects: SSN, Credit Cards, Emails, Phone Numbers, and more</p>
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
            {ocrResult && piiResult ? (
              <>
                {/* Stats */}
                <div className="ocr-stats">
                  <div className="stat-item">
                    <span className="stat-label">OCR Time</span>
                    <span className="stat-value">{ocrResult.processingTimeMs.toFixed(0)}ms</span>
                  </div>
                  <div className="stat-item">
                    <span className="stat-label">PII Time</span>
                    <span className="stat-value">{piiResult.processingTimeMs.toFixed(1)}ms</span>
                  </div>
                  <div className="stat-item">
                    <span className="stat-label">Text Regions</span>
                    <span className="stat-value">{ocrResult.regions.length}</span>
                  </div>
                  <div className="stat-item">
                    <span className="stat-label">PII Found</span>
                    <span className="stat-value pii-count">{piiResult.regions.length}</span>
                  </div>
                </div>

                {/* PII Summary by type */}
                {piiTypesFound.length > 0 && (
                  <div className="pii-summary">
                    <h4>PII Types Detected</h4>
                    <div className="pii-type-list">
                      {piiTypesFound.map(type => {
                        const info = PII_TYPE_INFO[type] || { icon: '⚠️', name: type, description: type };
                        const color = piiColors[type] || '#ef4444';
                        return (
                          <div key={type} className="pii-type-item" style={{ borderLeftColor: color }}>
                            <span className="pii-type-icon">{info.icon}</span>
                            <span className="pii-type-name">{info.name}</span>
                            <span className="pii-type-count">{piiResult.summary[type]}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Selected item details */}
                {selectedPII && (
                  <div className="ocr-selected-region pii-selected" style={{ borderLeftColor: selectedPII.color }}>
                    <h4>Selected PII</h4>
                    <div className="region-detail">
                      <label>Type:</label>
                      <span className="pii-type-badge" style={{ backgroundColor: hexToRgba(selectedPII.color, 0.2), color: selectedPII.color }}>
                        {PII_TYPE_INFO[selectedPII.type]?.icon} {PII_TYPE_INFO[selectedPII.type]?.name || selectedPII.type}
                      </span>
                    </div>
                    <div className="region-detail">
                      <label>Matched:</label>
                      <span className="region-text matched-text">{selectedPII.matchedText}</span>
                    </div>
                    <div className="region-detail">
                      <label>Redacted:</label>
                      <span className="region-text redacted-text">{selectedPII.redactedText}</span>
                    </div>
                    <div className="region-detail">
                      <label>Confidence:</label>
                      <span className={`confidence ${selectedPII.confidence}`}>
                        {selectedPII.confidence}
                      </span>
                    </div>
                    <div className="region-detail">
                      <label>Full Text:</label>
                      <span className="region-text">{selectedPII.originalText}</span>
                    </div>
                  </div>
                )}

                {selectedRegion && !selectedPII && (
                  <div className="ocr-selected-region">
                    <h4>Selected Text Region</h4>
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
                  </div>
                )}

                {/* PII Regions List */}
                <div className="ocr-regions-list">
                  <h4>
                    {piiResult.regions.length > 0 ? 'PII Regions' : 'No PII Detected'}
                    {piiResult.regions.length > 0 && ` (${piiResult.regions.length})`}
                  </h4>
                  <div className="regions-scroll">
                    {piiResult.regions.map((pii, idx) => {
                      const info = PII_TYPE_INFO[pii.type] || { icon: '⚠️', name: pii.type };
                      return (
                        <div
                          key={idx}
                          className={`region-item pii ${selectedPII === pii ? 'selected' : ''}`}
                          style={{ borderLeftColor: pii.color }}
                          onClick={() => { setSelectedPII(pii); setSelectedRegion(null); }}
                        >
                          <span className="pii-icon">{info.icon}</span>
                          <span className="region-text">{pii.matchedText}</span>
                          <span className="pii-badge" style={{ backgroundColor: hexToRgba(pii.color, 0.2), color: pii.color }}>
                            {info.name}
                          </span>
                        </div>
                      );
                    })}
                    {piiResult.regions.length === 0 && ocrResult.regions.length > 0 && (
                      <div className="no-pii-message">
                        No PII detected in {ocrResult.regions.length} text regions
                      </div>
                    )}
                  </div>
                </div>
              </>
            ) : (
              <div className="ocr-results-placeholder">
                <p>Run OCR + PII detection to analyze image</p>
                <div className="ocr-legend">
                  <h4>PII Types Detected</h4>
                  <div className="legend-grid">
                    {Object.entries(PII_TYPE_INFO).slice(0, 8).map(([type, info]) => (
                      <div key={type} className="legend-item">
                        <span className="legend-color" style={{ borderColor: piiColors[type] || '#888', backgroundColor: hexToRgba(piiColors[type] || '#888', 0.2) }}></span>
                        <span>{info.icon} {info.name}</span>
                      </div>
                    ))}
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
