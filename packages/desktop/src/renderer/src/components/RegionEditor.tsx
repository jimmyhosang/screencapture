import { useState, useRef, useEffect, useCallback } from 'react';

// Types
type RegionType = 'static' | 'tracked' | 'temporary';
type RedactionStyle = 'solid' | 'blur' | 'pixelate' | 'pattern';
type DrawingTool = 'select' | 'rectangle' | 'pan';

interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface ManualRegion {
  id: string;
  type: RegionType;
  bounds: BoundingBox;
  label?: string;
  style: RedactionStyle;
  color?: string;
  startTime?: number;
  endTime?: number;
  createdAt: number;
}

interface RegionEditorProps {
  videoElement?: HTMLVideoElement | null;
  videoWidth: number;
  videoHeight: number;
  currentTime: number;
  duration: number;
  regions: ManualRegion[];
  onRegionAdd: (region: Omit<ManualRegion, 'id' | 'createdAt'>) => void;
  onRegionUpdate: (regionId: string, updates: Partial<ManualRegion>) => void;
  onRegionDelete: (regionId: string) => void;
  selectedRegionId?: string;
  onRegionSelect: (regionId: string | null) => void;
  isPausedForRedaction?: boolean;
  defaultStyle?: RedactionStyle;
  defaultColor?: string;
}

// Style colors for visualization
const STYLE_COLORS: Record<RedactionStyle, string> = {
  solid: '#000000',
  blur: '#3b82f6',
  pixelate: '#8b5cf6',
  pattern: '#f59e0b',
};

function RegionEditor({
  videoElement,
  videoWidth,
  videoHeight,
  currentTime,
  duration,
  regions,
  onRegionAdd,
  onRegionUpdate,
  onRegionDelete,
  selectedRegionId,
  onRegionSelect,
  isPausedForRedaction = false,
  defaultStyle = 'blur',
  defaultColor = '#000000',
}: RegionEditorProps): JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const [tool, setTool] = useState<DrawingTool>('rectangle');
  const [isDrawing, setIsDrawing] = useState(false);
  const [drawStart, setDrawStart] = useState<{ x: number; y: number } | null>(null);
  const [drawEnd, setDrawEnd] = useState<{ x: number; y: number } | null>(null);
  const [regionType, setRegionType] = useState<RegionType>('static');
  const [style, setStyle] = useState<RedactionStyle>(defaultStyle);
  const [canvasScale, setCanvasScale] = useState(1);

  // Calculate canvas dimensions to fit container while maintaining aspect ratio
  useEffect(() => {
    if (!containerRef.current) return;

    const updateScale = () => {
      const container = containerRef.current;
      if (!container) return;

      const containerWidth = container.clientWidth - 40; // padding
      const containerHeight = container.clientHeight - 120; // controls space

      const scaleX = containerWidth / videoWidth;
      const scaleY = containerHeight / videoHeight;
      const scale = Math.min(scaleX, scaleY, 1);

      setCanvasScale(scale);
    };

    updateScale();
    window.addEventListener('resize', updateScale);
    return () => window.removeEventListener('resize', updateScale);
  }, [videoWidth, videoHeight]);

  // Draw canvas
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw video frame if available
    if (videoElement && !videoElement.paused) {
      ctx.drawImage(videoElement, 0, 0, canvas.width, canvas.height);
    } else {
      // Draw placeholder background
      ctx.fillStyle = '#1a1a2e';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Draw grid
      ctx.strokeStyle = '#2a2a4a';
      ctx.lineWidth = 1;
      const gridSize = 50;
      for (let x = 0; x < canvas.width; x += gridSize) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, canvas.height);
        ctx.stroke();
      }
      for (let y = 0; y < canvas.height; y += gridSize) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(canvas.width, y);
        ctx.stroke();
      }
    }

    // Draw existing regions
    for (const region of regions) {
      // Check if region should be visible at current time
      if (region.type === 'temporary') {
        const start = region.startTime ?? 0;
        const end = region.endTime ?? duration;
        if (currentTime < start || currentTime > end) continue;
      }

      const isSelected = region.id === selectedRegionId;
      const bounds = denormalizeBounds(region.bounds, canvas.width, canvas.height);

      // Draw region fill
      ctx.globalAlpha = 0.3;
      ctx.fillStyle = STYLE_COLORS[region.style] || defaultColor;
      ctx.fillRect(bounds.x, bounds.y, bounds.width, bounds.height);

      // Draw region border
      ctx.globalAlpha = 1;
      ctx.strokeStyle = isSelected ? '#e94560' : STYLE_COLORS[region.style];
      ctx.lineWidth = isSelected ? 3 : 2;
      ctx.setLineDash(isSelected ? [] : [5, 5]);
      ctx.strokeRect(bounds.x, bounds.y, bounds.width, bounds.height);
      ctx.setLineDash([]);

      // Draw label
      if (region.label) {
        ctx.fillStyle = '#fff';
        ctx.font = '12px sans-serif';
        ctx.fillText(region.label, bounds.x + 4, bounds.y + 14);
      }

      // Draw resize handles if selected
      if (isSelected) {
        drawResizeHandles(ctx, bounds);
      }
    }

    // Draw current drawing
    if (isDrawing && drawStart && drawEnd) {
      const x = Math.min(drawStart.x, drawEnd.x);
      const y = Math.min(drawStart.y, drawEnd.y);
      const width = Math.abs(drawEnd.x - drawStart.x);
      const height = Math.abs(drawEnd.y - drawStart.y);

      ctx.globalAlpha = 0.3;
      ctx.fillStyle = STYLE_COLORS[style];
      ctx.fillRect(x, y, width, height);

      ctx.globalAlpha = 1;
      ctx.strokeStyle = '#e94560';
      ctx.lineWidth = 2;
      ctx.strokeRect(x, y, width, height);

      // Show dimensions
      ctx.fillStyle = '#fff';
      ctx.font = '11px monospace';
      ctx.fillText(`${Math.round(width)}×${Math.round(height)}`, x + 4, y - 4);
    }
  }, [videoElement, regions, selectedRegionId, currentTime, duration, isDrawing, drawStart, drawEnd, style, defaultColor]);

  // Animation loop
  useEffect(() => {
    let animationId: number;

    const animate = () => {
      draw();
      animationId = requestAnimationFrame(animate);
    };

    animate();
    return () => cancelAnimationFrame(animationId);
  }, [draw]);

  // Draw resize handles
  const drawResizeHandles = (ctx: CanvasRenderingContext2D, bounds: BoundingBox) => {
    const handleSize = 8;
    const handles = [
      { x: bounds.x, y: bounds.y }, // top-left
      { x: bounds.x + bounds.width, y: bounds.y }, // top-right
      { x: bounds.x, y: bounds.y + bounds.height }, // bottom-left
      { x: bounds.x + bounds.width, y: bounds.y + bounds.height }, // bottom-right
    ];

    ctx.fillStyle = '#e94560';
    for (const handle of handles) {
      ctx.fillRect(
        handle.x - handleSize / 2,
        handle.y - handleSize / 2,
        handleSize,
        handleSize
      );
    }
  };

  // Normalize bounds to 0-1 range
  const normalizeBounds = (bounds: BoundingBox, width: number, height: number): BoundingBox => ({
    x: bounds.x / width,
    y: bounds.y / height,
    width: bounds.width / width,
    height: bounds.height / height,
  });

  // Denormalize bounds from 0-1 range
  const denormalizeBounds = (bounds: BoundingBox, width: number, height: number): BoundingBox => ({
    x: bounds.x * width,
    y: bounds.y * height,
    width: bounds.width * width,
    height: bounds.height * height,
  });

  // Get canvas coordinates from mouse event
  const getCanvasCoords = (e: React.MouseEvent<HTMLCanvasElement>): { x: number; y: number } => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };

    const rect = canvas.getBoundingClientRect();
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    };
  };

  // Find region at point
  const findRegionAtPoint = (x: number, y: number): ManualRegion | null => {
    const canvas = canvasRef.current;
    if (!canvas) return null;

    for (const region of [...regions].reverse()) {
      const bounds = denormalizeBounds(region.bounds, canvas.width, canvas.height);
      if (
        x >= bounds.x &&
        x <= bounds.x + bounds.width &&
        y >= bounds.y &&
        y <= bounds.y + bounds.height
      ) {
        return region;
      }
    }
    return null;
  };

  // Mouse handlers
  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const coords = getCanvasCoords(e);

    if (tool === 'select') {
      const region = findRegionAtPoint(coords.x, coords.y);
      onRegionSelect(region?.id || null);
    } else if (tool === 'rectangle') {
      setIsDrawing(true);
      setDrawStart(coords);
      setDrawEnd(coords);
    }
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return;

    const coords = getCanvasCoords(e);
    setDrawEnd(coords);
  };

  const handleMouseUp = () => {
    if (!isDrawing || !drawStart || !drawEnd) {
      setIsDrawing(false);
      return;
    }

    const canvas = canvasRef.current;
    if (!canvas) {
      setIsDrawing(false);
      return;
    }

    // Calculate bounds
    const x = Math.min(drawStart.x, drawEnd.x);
    const y = Math.min(drawStart.y, drawEnd.y);
    const width = Math.abs(drawEnd.x - drawStart.x);
    const height = Math.abs(drawEnd.y - drawStart.y);

    // Minimum size check
    if (width < 10 || height < 10) {
      setIsDrawing(false);
      setDrawStart(null);
      setDrawEnd(null);
      return;
    }

    // Create normalized bounds
    const bounds = normalizeBounds({ x, y, width, height }, canvas.width, canvas.height);

    // Create region
    const newRegion: Omit<ManualRegion, 'id' | 'createdAt'> = {
      type: regionType,
      bounds,
      style,
      color: style === 'solid' ? defaultColor : undefined,
      startTime: regionType === 'temporary' ? currentTime : undefined,
      endTime: regionType === 'temporary' ? Math.min(currentTime + 5000, duration) : undefined,
    };

    onRegionAdd(newRegion);

    setIsDrawing(false);
    setDrawStart(null);
    setDrawEnd(null);
  };

  // Handle delete key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedRegionId) {
        onRegionDelete(selectedRegionId);
        onRegionSelect(null);
      }
      if (e.key === 'Escape') {
        onRegionSelect(null);
        setIsDrawing(false);
        setDrawStart(null);
        setDrawEnd(null);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedRegionId, onRegionDelete, onRegionSelect]);

  const scaledWidth = videoWidth * canvasScale;
  const scaledHeight = videoHeight * canvasScale;

  return (
    <div className="region-editor" ref={containerRef}>
      {/* Toolbar */}
      <div className="region-editor-toolbar">
        <div className="tool-group">
          <button
            className={`tool-btn ${tool === 'select' ? 'active' : ''}`}
            onClick={() => setTool('select')}
            title="Select (V)"
          >
            <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
              <path d="M3 3l7.07 16.97 2.51-6.39 6.39-2.51L3 3z" />
            </svg>
          </button>
          <button
            className={`tool-btn ${tool === 'rectangle' ? 'active' : ''}`}
            onClick={() => setTool('rectangle')}
            title="Rectangle (R)"
          >
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="3" width="18" height="18" rx="2" />
            </svg>
          </button>
        </div>

        <div className="tool-divider" />

        <div className="tool-group">
          <label className="tool-label">Type:</label>
          <select
            value={regionType}
            onChange={(e) => setRegionType(e.target.value as RegionType)}
            className="tool-select"
          >
            <option value="static">Static (entire video)</option>
            <option value="temporary">Temporary (time range)</option>
          </select>
        </div>

        <div className="tool-group">
          <label className="tool-label">Style:</label>
          <select
            value={style}
            onChange={(e) => setStyle(e.target.value as RedactionStyle)}
            className="tool-select"
          >
            <option value="blur">Blur</option>
            <option value="solid">Solid</option>
            <option value="pixelate">Pixelate</option>
            <option value="pattern">Pattern</option>
          </select>
        </div>

        {isPausedForRedaction && (
          <div className="pause-indicator">
            <span className="pause-dot" /> Recording Paused
          </div>
        )}
      </div>

      {/* Canvas */}
      <div className="region-editor-canvas-wrapper">
        <canvas
          ref={canvasRef}
          width={scaledWidth}
          height={scaledHeight}
          className="region-editor-canvas"
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
        />
      </div>

      {/* Region List */}
      <div className="region-list">
        <h4>Regions ({regions.length})</h4>
        {regions.length === 0 ? (
          <p className="region-list-empty">Draw rectangles on the video to add redaction regions</p>
        ) : (
          <div className="region-items">
            {regions.map((region) => (
              <div
                key={region.id}
                className={`region-item ${region.id === selectedRegionId ? 'selected' : ''}`}
                onClick={() => onRegionSelect(region.id)}
              >
                <div
                  className="region-color"
                  style={{ backgroundColor: STYLE_COLORS[region.style] }}
                />
                <div className="region-info">
                  <span className="region-type">{region.type}</span>
                  <span className="region-style">{region.style}</span>
                  {region.type === 'temporary' && (
                    <span className="region-time">
                      {formatTime(region.startTime || 0)} - {formatTime(region.endTime || 0)}
                    </span>
                  )}
                </div>
                <button
                  className="region-delete"
                  onClick={(e) => {
                    e.stopPropagation();
                    onRegionDelete(region.id);
                  }}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// Format time in MM:SS format
function formatTime(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${minutes}:${secs.toString().padStart(2, '0')}`;
}

export default RegionEditor;
