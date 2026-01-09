/**
 * Performance Monitoring Service
 *
 * Tracks and reports performance metrics for the screen recording application:
 * - Frame processing time
 * - Memory usage
 * - CPU usage
 * - FPS metrics
 * - Bottleneck detection
 */

import { ipcMain, BrowserWindow } from 'electron';
import * as os from 'os';

// Types
export interface FrameMetrics {
  timestamp: number;
  captureTime: number;      // Time to capture frame (ms)
  ocrTime: number;          // Time for OCR processing (ms)
  piiScanTime: number;      // Time for PII detection (ms)
  redactionTime: number;    // Time to apply redactions (ms)
  totalTime: number;        // Total frame processing time (ms)
  frameSize: number;        // Frame size in bytes
}

export interface PerformanceSnapshot {
  timestamp: number;
  fps: {
    current: number;
    average: number;
    min: number;
    max: number;
  };
  frameTime: {
    current: number;
    average: number;
    min: number;
    max: number;
  };
  memory: {
    heapUsed: number;       // MB
    heapTotal: number;      // MB
    external: number;       // MB
    rss: number;            // MB - Resident Set Size
    percentUsed: number;    // Percentage of system memory
  };
  cpu: {
    percentUsed: number;    // Approximate CPU usage
    loadAverage: number[];  // 1, 5, 15 minute load averages
  };
  processing: {
    captureAvg: number;
    ocrAvg: number;
    piiScanAvg: number;
    redactionAvg: number;
    totalAvg: number;
  };
  bottlenecks: string[];    // List of detected performance issues
}

export interface PerformanceConfig {
  enabled: boolean;
  sampleInterval: number;   // How often to sample (ms)
  historySize: number;      // Number of samples to keep
  reportInterval: number;   // How often to send updates to renderer (ms)
  thresholds: {
    frameTimeWarning: number;   // ms
    frameTimeCritical: number;  // ms
    memoryWarning: number;      // percentage
    memoryCritical: number;     // percentage
    fpsWarning: number;         // fps
    fpsCritical: number;        // fps
  };
}

// Default configuration
const DEFAULT_CONFIG: PerformanceConfig = {
  enabled: true,
  sampleInterval: 100,
  historySize: 1000,
  reportInterval: 1000,
  thresholds: {
    frameTimeWarning: 50,
    frameTimeCritical: 100,
    memoryWarning: 70,
    memoryCritical: 90,
    fpsWarning: 20,
    fpsCritical: 10
  }
};

class PerformanceMonitor {
  private config: PerformanceConfig = { ...DEFAULT_CONFIG };
  private frameMetrics: FrameMetrics[] = [];
  private snapshots: PerformanceSnapshot[] = [];
  private reportTimer: NodeJS.Timeout | null = null;
  private lastCpuInfo: { idle: number; total: number } | null = null;
  private isRecording = false;
  private frameCount = 0;
  private lastFrameTime = 0;
  private fpsHistory: number[] = [];

  constructor() {
    this.startMonitoring();
  }

  // Start periodic monitoring
  private startMonitoring(): void {
    if (this.reportTimer) {
      clearInterval(this.reportTimer);
    }

    this.reportTimer = setInterval(() => {
      if (this.config.enabled) {
        const snapshot = this.createSnapshot();
        this.snapshots.push(snapshot);

        // Trim history
        while (this.snapshots.length > this.config.historySize) {
          this.snapshots.shift();
        }

        // Send to renderer
        this.broadcastSnapshot(snapshot);
      }
    }, this.config.reportInterval);
  }

  // Record a frame processing event
  recordFrame(metrics: Omit<FrameMetrics, 'timestamp'>): void {
    const now = Date.now();

    // Calculate FPS
    if (this.lastFrameTime > 0) {
      const delta = now - this.lastFrameTime;
      if (delta > 0) {
        const fps = 1000 / delta;
        this.fpsHistory.push(fps);
        if (this.fpsHistory.length > 60) {
          this.fpsHistory.shift();
        }
      }
    }
    this.lastFrameTime = now;

    const frameMetric: FrameMetrics = {
      ...metrics,
      timestamp: now
    };

    this.frameMetrics.push(frameMetric);
    this.frameCount++;

    // Trim history
    while (this.frameMetrics.length > this.config.historySize) {
      this.frameMetrics.shift();
    }
  }

  // Create a performance snapshot
  private createSnapshot(): PerformanceSnapshot {
    const now = Date.now();
    const memUsage = process.memoryUsage();
    const totalMem = os.totalmem();

    // Calculate FPS stats
    const fps = this.calculateFpsStats();

    // Calculate frame time stats
    const frameTime = this.calculateFrameTimeStats();

    // Calculate processing time averages
    const processing = this.calculateProcessingStats();

    // Calculate CPU usage
    const cpu = this.calculateCpuUsage();

    // Detect bottlenecks
    const bottlenecks = this.detectBottlenecks(fps, frameTime, memUsage, processing);

    return {
      timestamp: now,
      fps,
      frameTime,
      memory: {
        heapUsed: memUsage.heapUsed / (1024 * 1024),
        heapTotal: memUsage.heapTotal / (1024 * 1024),
        external: memUsage.external / (1024 * 1024),
        rss: memUsage.rss / (1024 * 1024),
        percentUsed: (memUsage.rss / totalMem) * 100
      },
      cpu,
      processing,
      bottlenecks
    };
  }

  private calculateFpsStats(): PerformanceSnapshot['fps'] {
    if (this.fpsHistory.length === 0) {
      return { current: 0, average: 0, min: 0, max: 0 };
    }

    const current = this.fpsHistory[this.fpsHistory.length - 1] || 0;
    const sum = this.fpsHistory.reduce((a, b) => a + b, 0);
    const average = sum / this.fpsHistory.length;
    const min = Math.min(...this.fpsHistory);
    const max = Math.max(...this.fpsHistory);

    return { current, average, min, max };
  }

  private calculateFrameTimeStats(): PerformanceSnapshot['frameTime'] {
    const recentFrames = this.frameMetrics.slice(-60);

    if (recentFrames.length === 0) {
      return { current: 0, average: 0, min: 0, max: 0 };
    }

    const times = recentFrames.map(f => f.totalTime);
    const current = times[times.length - 1] || 0;
    const sum = times.reduce((a, b) => a + b, 0);
    const average = sum / times.length;
    const min = Math.min(...times);
    const max = Math.max(...times);

    return { current, average, min, max };
  }

  private calculateProcessingStats(): PerformanceSnapshot['processing'] {
    const recentFrames = this.frameMetrics.slice(-60);

    if (recentFrames.length === 0) {
      return {
        captureAvg: 0,
        ocrAvg: 0,
        piiScanAvg: 0,
        redactionAvg: 0,
        totalAvg: 0
      };
    }

    const count = recentFrames.length;
    return {
      captureAvg: recentFrames.reduce((a, f) => a + f.captureTime, 0) / count,
      ocrAvg: recentFrames.reduce((a, f) => a + f.ocrTime, 0) / count,
      piiScanAvg: recentFrames.reduce((a, f) => a + f.piiScanTime, 0) / count,
      redactionAvg: recentFrames.reduce((a, f) => a + f.redactionTime, 0) / count,
      totalAvg: recentFrames.reduce((a, f) => a + f.totalTime, 0) / count
    };
  }

  private calculateCpuUsage(): PerformanceSnapshot['cpu'] {
    const cpus = os.cpus();
    let idle = 0;
    let total = 0;

    for (const cpu of cpus) {
      idle += cpu.times.idle;
      total += cpu.times.user + cpu.times.nice + cpu.times.sys + cpu.times.idle + cpu.times.irq;
    }

    let percentUsed = 0;
    if (this.lastCpuInfo) {
      const idleDelta = idle - this.lastCpuInfo.idle;
      const totalDelta = total - this.lastCpuInfo.total;
      if (totalDelta > 0) {
        percentUsed = 100 - (idleDelta / totalDelta) * 100;
      }
    }

    this.lastCpuInfo = { idle, total };

    return {
      percentUsed,
      loadAverage: os.loadavg()
    };
  }

  private detectBottlenecks(
    fps: PerformanceSnapshot['fps'],
    frameTime: PerformanceSnapshot['frameTime'],
    memUsage: NodeJS.MemoryUsage,
    processing: PerformanceSnapshot['processing']
  ): string[] {
    const bottlenecks: string[] = [];
    const { thresholds } = this.config;

    // Check FPS
    if (fps.average > 0 && fps.average < thresholds.fpsCritical) {
      bottlenecks.push(`Critical: FPS is ${fps.average.toFixed(1)} (below ${thresholds.fpsCritical})`);
    } else if (fps.average > 0 && fps.average < thresholds.fpsWarning) {
      bottlenecks.push(`Warning: FPS is ${fps.average.toFixed(1)} (below ${thresholds.fpsWarning})`);
    }

    // Check frame time
    if (frameTime.average > thresholds.frameTimeCritical) {
      bottlenecks.push(`Critical: Frame time is ${frameTime.average.toFixed(1)}ms (above ${thresholds.frameTimeCritical}ms)`);
    } else if (frameTime.average > thresholds.frameTimeWarning) {
      bottlenecks.push(`Warning: Frame time is ${frameTime.average.toFixed(1)}ms (above ${thresholds.frameTimeWarning}ms)`);
    }

    // Check memory
    const totalMem = os.totalmem();
    const memPercent = (memUsage.rss / totalMem) * 100;
    if (memPercent > thresholds.memoryCritical) {
      bottlenecks.push(`Critical: Memory usage is ${memPercent.toFixed(1)}% (above ${thresholds.memoryCritical}%)`);
    } else if (memPercent > thresholds.memoryWarning) {
      bottlenecks.push(`Warning: Memory usage is ${memPercent.toFixed(1)}% (above ${thresholds.memoryWarning}%)`);
    }

    // Identify slowest processing stage
    const stages = [
      { name: 'OCR', time: processing.ocrAvg },
      { name: 'PII Scan', time: processing.piiScanAvg },
      { name: 'Redaction', time: processing.redactionAvg },
      { name: 'Capture', time: processing.captureAvg }
    ].filter(s => s.time > 0);

    if (stages.length > 0) {
      stages.sort((a, b) => b.time - a.time);
      if (stages[0].time > 20) {
        bottlenecks.push(`Bottleneck: ${stages[0].name} takes ${stages[0].time.toFixed(1)}ms avg`);
      }
    }

    return bottlenecks;
  }

  private broadcastSnapshot(snapshot: PerformanceSnapshot): void {
    // Send to all renderer windows
    const windows = BrowserWindow.getAllWindows();
    for (const window of windows) {
      if (!window.isDestroyed()) {
        window.webContents.send('performance:update', snapshot);
      }
    }
  }

  // Public API
  getConfig(): PerformanceConfig {
    return { ...this.config };
  }

  setConfig(config: Partial<PerformanceConfig>): void {
    this.config = { ...this.config, ...config };

    if (config.thresholds) {
      this.config.thresholds = { ...DEFAULT_CONFIG.thresholds, ...config.thresholds };
    }

    // Restart monitoring with new interval if changed
    if (config.reportInterval !== undefined) {
      this.startMonitoring();
    }
  }

  getLatestSnapshot(): PerformanceSnapshot | null {
    return this.snapshots[this.snapshots.length - 1] || null;
  }

  getSnapshots(count?: number): PerformanceSnapshot[] {
    if (count === undefined) {
      return [...this.snapshots];
    }
    return this.snapshots.slice(-count);
  }

  getFrameMetrics(count?: number): FrameMetrics[] {
    if (count === undefined) {
      return [...this.frameMetrics];
    }
    return this.frameMetrics.slice(-count);
  }

  setRecordingState(recording: boolean): void {
    this.isRecording = recording;
    if (!recording) {
      // Reset frame metrics when recording stops
      this.fpsHistory = [];
      this.lastFrameTime = 0;
    }
  }

  reset(): void {
    this.frameMetrics = [];
    this.snapshots = [];
    this.fpsHistory = [];
    this.frameCount = 0;
    this.lastFrameTime = 0;
    this.lastCpuInfo = null;
  }

  terminate(): void {
    if (this.reportTimer) {
      clearInterval(this.reportTimer);
      this.reportTimer = null;
    }
    this.reset();
  }
}

// Singleton instance
let monitor: PerformanceMonitor | null = null;

export function getPerformanceMonitor(): PerformanceMonitor {
  if (!monitor) {
    monitor = new PerformanceMonitor();
  }
  return monitor;
}

export function terminatePerformanceMonitor(): void {
  if (monitor) {
    monitor.terminate();
    monitor = null;
  }
}

// Setup IPC handlers
export function setupPerformanceHandlers(): void {
  const perf = getPerformanceMonitor();

  // Configuration
  ipcMain.handle('performance:getConfig', () => {
    return perf.getConfig();
  });

  ipcMain.handle('performance:setConfig', (_, config: Partial<PerformanceConfig>) => {
    perf.setConfig(config);
  });

  // Metrics
  ipcMain.handle('performance:getLatestSnapshot', () => {
    return perf.getLatestSnapshot();
  });

  ipcMain.handle('performance:getSnapshots', (_, count?: number) => {
    return perf.getSnapshots(count);
  });

  ipcMain.handle('performance:getFrameMetrics', (_, count?: number) => {
    return perf.getFrameMetrics(count);
  });

  // Recording frame metrics (called from other services)
  ipcMain.handle('performance:recordFrame', (_, metrics: Omit<FrameMetrics, 'timestamp'>) => {
    perf.recordFrame(metrics);
  });

  // Recording state
  ipcMain.handle('performance:setRecordingState', (_, recording: boolean) => {
    perf.setRecordingState(recording);
  });

  // Reset
  ipcMain.handle('performance:reset', () => {
    perf.reset();
  });

  // Cleanup on app quit
  ipcMain.handle('performance:terminate', () => {
    terminatePerformanceMonitor();
  });
}
