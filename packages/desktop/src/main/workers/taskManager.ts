/**
 * Background Task Manager
 *
 * Manages heavy background tasks with:
 * - Progress tracking
 * - Cancellation support
 * - Task queuing
 * - Priority levels
 */

import { ipcMain, BrowserWindow } from 'electron';
import { Worker } from 'worker_threads';
import { join } from 'path';
import { EventEmitter } from 'events';

// Types
export type TaskPriority = 'low' | 'normal' | 'high';
export type TaskStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
export type TaskType = 'export' | 'redaction' | 'ocr' | 'thumbnail' | 'analysis' | 'generic';

export interface TaskProgress {
  taskId: string;
  status: TaskStatus;
  progress: number;        // 0-100
  message: string;
  currentStep?: string;
  totalSteps?: number;
  currentStepIndex?: number;
  startTime: number;
  estimatedTimeRemaining?: number;
}

export interface Task {
  id: string;
  type: TaskType;
  priority: TaskPriority;
  status: TaskStatus;
  data: Record<string, unknown>;
  progress: number;
  message: string;
  result?: unknown;
  error?: string;
  createdAt: number;
  startedAt?: number;
  completedAt?: number;
  onProgress?: (progress: TaskProgress) => void;
}

export interface TaskOptions {
  priority?: TaskPriority;
  onProgress?: (progress: TaskProgress) => void;
}

class BackgroundTaskManager extends EventEmitter {
  private tasks: Map<string, Task> = new Map();
  private queue: string[] = [];  // Task IDs in priority order
  private workers: Map<string, Worker> = new Map();
  private maxConcurrent = 2;     // Max concurrent tasks
  private runningCount = 0;

  constructor() {
    super();
    this.setupIPC();
  }

  private setupIPC(): void {
    // Get all tasks
    ipcMain.handle('tasks:getAll', () => {
      return this.getAllTasks();
    });

    // Get task by ID
    ipcMain.handle('tasks:get', (_, taskId: string) => {
      return this.getTask(taskId);
    });

    // Cancel task
    ipcMain.handle('tasks:cancel', (_, taskId: string) => {
      return this.cancelTask(taskId);
    });

    // Clear completed tasks
    ipcMain.handle('tasks:clearCompleted', () => {
      return this.clearCompletedTasks();
    });

    // Create generic task (from renderer)
    ipcMain.handle('tasks:create', (_, type: TaskType, data: Record<string, unknown>, options?: TaskOptions) => {
      return this.createTask(type, data, options);
    });
  }

  // Create a new background task
  createTask(type: TaskType, data: Record<string, unknown>, options?: TaskOptions): string {
    const taskId = `task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const priority = options?.priority || 'normal';

    const task: Task = {
      id: taskId,
      type,
      priority,
      status: 'pending',
      data,
      progress: 0,
      message: 'Waiting in queue...',
      createdAt: Date.now(),
      onProgress: options?.onProgress
    };

    this.tasks.set(taskId, task);
    this.addToQueue(taskId, priority);
    this.broadcastTaskUpdate(task);
    this.processQueue();

    return taskId;
  }

  // Add task to queue with priority ordering
  private addToQueue(taskId: string, priority: TaskPriority): void {
    const priorityOrder = { high: 0, normal: 1, low: 2 };
    const taskPriority = priorityOrder[priority];

    let insertIndex = this.queue.length;
    for (let i = 0; i < this.queue.length; i++) {
      const existingTask = this.tasks.get(this.queue[i]);
      if (existingTask && priorityOrder[existingTask.priority] > taskPriority) {
        insertIndex = i;
        break;
      }
    }

    this.queue.splice(insertIndex, 0, taskId);
  }

  // Process queued tasks
  private async processQueue(): Promise<void> {
    while (this.runningCount < this.maxConcurrent && this.queue.length > 0) {
      const taskId = this.queue.shift();
      if (!taskId) continue;

      const task = this.tasks.get(taskId);
      if (!task || task.status !== 'pending') continue;

      this.runningCount++;
      task.status = 'running';
      task.startedAt = Date.now();
      task.message = 'Starting...';
      this.broadcastTaskUpdate(task);

      try {
        await this.executeTask(task);
      } catch (error) {
        task.status = 'failed';
        task.error = error instanceof Error ? error.message : String(error);
        task.completedAt = Date.now();
        this.broadcastTaskUpdate(task);
      }

      this.runningCount--;
      this.processQueue();
    }
  }

  // Execute a task
  private async executeTask(task: Task): Promise<void> {
    switch (task.type) {
      case 'export':
        await this.runExportTask(task);
        break;
      case 'redaction':
        await this.runRedactionTask(task);
        break;
      case 'ocr':
        await this.runOCRTask(task);
        break;
      case 'thumbnail':
        await this.runThumbnailTask(task);
        break;
      case 'analysis':
        await this.runAnalysisTask(task);
        break;
      default:
        await this.runGenericTask(task);
    }
  }

  // Export video task
  private async runExportTask(task: Task): Promise<void> {
    const { recordingId, options } = task.data as { recordingId: string; options: Record<string, unknown> };

    // Simulate export with progress
    const steps = ['Preparing', 'Encoding Video', 'Applying Redactions', 'Finalizing'];

    for (let i = 0; i < steps.length; i++) {
      if (task.status === 'cancelled') break;

      task.currentStep = steps[i];
      task.message = steps[i];
      task.progress = (i / steps.length) * 100;
      this.broadcastTaskUpdate(task);

      // Simulate work for each step
      await this.delay(500 + Math.random() * 1000);
    }

    if (task.status !== 'cancelled') {
      task.status = 'completed';
      task.progress = 100;
      task.message = 'Export complete';
      task.result = { success: true, path: `/exports/${recordingId}.mp4` };
      task.completedAt = Date.now();
      this.broadcastTaskUpdate(task);
    }
  }

  // Apply redactions task
  private async runRedactionTask(task: Task): Promise<void> {
    const { recordingId, masks } = task.data as { recordingId: string; masks: unknown[] };

    const totalFrames = 100; // Simulate 100 frames
    for (let frame = 0; frame < totalFrames; frame++) {
      if (task.status === 'cancelled') break;

      task.progress = (frame / totalFrames) * 100;
      task.message = `Processing frame ${frame + 1}/${totalFrames}`;
      this.broadcastTaskUpdate(task);

      await this.delay(50); // Simulate frame processing
    }

    if (task.status !== 'cancelled') {
      task.status = 'completed';
      task.progress = 100;
      task.message = 'Redaction complete';
      task.result = { framesProcessed: totalFrames };
      task.completedAt = Date.now();
      this.broadcastTaskUpdate(task);
    }
  }

  // OCR analysis task
  private async runOCRTask(task: Task): Promise<void> {
    const { frames } = task.data as { frames: string[] };
    const totalFrames = frames?.length || 10;

    for (let i = 0; i < totalFrames; i++) {
      if (task.status === 'cancelled') break;

      task.progress = (i / totalFrames) * 100;
      task.message = `Analyzing frame ${i + 1}/${totalFrames}`;
      this.broadcastTaskUpdate(task);

      await this.delay(200); // Simulate OCR
    }

    if (task.status !== 'cancelled') {
      task.status = 'completed';
      task.progress = 100;
      task.message = 'OCR analysis complete';
      task.result = { framesAnalyzed: totalFrames, piiFound: Math.floor(Math.random() * 10) };
      task.completedAt = Date.now();
      this.broadcastTaskUpdate(task);
    }
  }

  // Generate thumbnail task
  private async runThumbnailTask(task: Task): Promise<void> {
    task.message = 'Generating thumbnail...';
    task.progress = 50;
    this.broadcastTaskUpdate(task);

    await this.delay(500);

    task.status = 'completed';
    task.progress = 100;
    task.message = 'Thumbnail generated';
    task.result = { thumbnailPath: '/thumbnails/thumb.jpg' };
    task.completedAt = Date.now();
    this.broadcastTaskUpdate(task);
  }

  // Video analysis task
  private async runAnalysisTask(task: Task): Promise<void> {
    const steps = ['Scanning video', 'Detecting scenes', 'Identifying PII', 'Generating report'];

    for (let i = 0; i < steps.length; i++) {
      if (task.status === 'cancelled') break;

      task.message = steps[i];
      task.progress = ((i + 1) / steps.length) * 100;
      this.broadcastTaskUpdate(task);

      await this.delay(1000);
    }

    if (task.status !== 'cancelled') {
      task.status = 'completed';
      task.progress = 100;
      task.message = 'Analysis complete';
      task.result = { scenes: 12, piiRegions: 5, duration: '5:32' };
      task.completedAt = Date.now();
      this.broadcastTaskUpdate(task);
    }
  }

  // Generic task
  private async runGenericTask(task: Task): Promise<void> {
    const duration = (task.data.duration as number) || 5000;
    const steps = 10;

    for (let i = 0; i < steps; i++) {
      if (task.status === 'cancelled') break;

      task.progress = ((i + 1) / steps) * 100;
      task.message = `Processing... ${Math.round(task.progress)}%`;
      this.broadcastTaskUpdate(task);

      await this.delay(duration / steps);
    }

    if (task.status !== 'cancelled') {
      task.status = 'completed';
      task.progress = 100;
      task.message = 'Task complete';
      task.completedAt = Date.now();
      this.broadcastTaskUpdate(task);
    }
  }

  // Cancel a running task
  cancelTask(taskId: string): boolean {
    const task = this.tasks.get(taskId);
    if (!task) return false;

    // Remove from queue if pending
    const queueIndex = this.queue.indexOf(taskId);
    if (queueIndex >= 0) {
      this.queue.splice(queueIndex, 1);
    }

    // Cancel if running
    if (task.status === 'running' || task.status === 'pending') {
      task.status = 'cancelled';
      task.message = 'Cancelled by user';
      task.completedAt = Date.now();
      this.broadcastTaskUpdate(task);

      // Terminate worker if exists
      const worker = this.workers.get(taskId);
      if (worker) {
        worker.terminate();
        this.workers.delete(taskId);
      }

      return true;
    }

    return false;
  }

  // Get task by ID
  getTask(taskId: string): Task | null {
    return this.tasks.get(taskId) || null;
  }

  // Get all tasks
  getAllTasks(): Task[] {
    return Array.from(this.tasks.values())
      .sort((a, b) => b.createdAt - a.createdAt);
  }

  // Get tasks by status
  getTasksByStatus(status: TaskStatus): Task[] {
    return Array.from(this.tasks.values())
      .filter(t => t.status === status)
      .sort((a, b) => b.createdAt - a.createdAt);
  }

  // Clear completed/failed/cancelled tasks
  clearCompletedTasks(): number {
    let count = 0;
    for (const [taskId, task] of this.tasks) {
      if (['completed', 'failed', 'cancelled'].includes(task.status)) {
        this.tasks.delete(taskId);
        count++;
      }
    }
    this.broadcastTaskListUpdate();
    return count;
  }

  // Broadcast task update to renderer
  private broadcastTaskUpdate(task: Task): void {
    // Call progress callback if set
    if (task.onProgress) {
      task.onProgress({
        taskId: task.id,
        status: task.status,
        progress: task.progress,
        message: task.message,
        currentStep: task.currentStep,
        startTime: task.startedAt || task.createdAt,
        estimatedTimeRemaining: this.estimateTimeRemaining(task)
      });
    }

    // Send to all windows
    const windows = BrowserWindow.getAllWindows();
    for (const window of windows) {
      if (!window.isDestroyed()) {
        window.webContents.send('tasks:update', {
          taskId: task.id,
          type: task.type,
          status: task.status,
          progress: task.progress,
          message: task.message,
          result: task.result,
          error: task.error
        });
      }
    }

    this.emit('taskUpdate', task);
  }

  // Broadcast full task list update
  private broadcastTaskListUpdate(): void {
    const tasks = this.getAllTasks();
    const windows = BrowserWindow.getAllWindows();
    for (const window of windows) {
      if (!window.isDestroyed()) {
        window.webContents.send('tasks:listUpdate', tasks);
      }
    }
  }

  // Estimate remaining time based on progress
  private estimateTimeRemaining(task: Task): number | undefined {
    if (!task.startedAt || task.progress <= 0) return undefined;

    const elapsed = Date.now() - task.startedAt;
    const rate = task.progress / elapsed;
    const remaining = (100 - task.progress) / rate;

    return Math.round(remaining);
  }

  // Helper delay function
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Set max concurrent tasks
  setMaxConcurrent(max: number): void {
    this.maxConcurrent = Math.max(1, Math.min(max, 4));
    this.processQueue();
  }

  // Terminate all workers and clear
  terminate(): void {
    // Cancel all running tasks
    for (const [taskId, worker] of this.workers) {
      worker.terminate();
    }
    this.workers.clear();

    // Clear tasks
    this.tasks.clear();
    this.queue = [];
    this.runningCount = 0;
  }
}

// Singleton instance
let taskManager: BackgroundTaskManager | null = null;

export function getTaskManager(): BackgroundTaskManager {
  if (!taskManager) {
    taskManager = new BackgroundTaskManager();
  }
  return taskManager;
}

export function terminateTaskManager(): void {
  if (taskManager) {
    taskManager.terminate();
    taskManager = null;
  }
}

// Setup IPC handlers
export function setupTaskHandlers(): void {
  // Initialize task manager (sets up IPC handlers)
  getTaskManager();
}
