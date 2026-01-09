import { useState, useEffect } from 'react';

// Types matching the main process
type TaskStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
type TaskType = 'export' | 'redaction' | 'ocr' | 'thumbnail' | 'analysis' | 'generic';

interface TaskUpdate {
  taskId: string;
  type: TaskType;
  status: TaskStatus;
  progress: number;
  message: string;
  result?: unknown;
  error?: string;
}

interface TaskQueueProps {
  isVisible: boolean;
  onClose: () => void;
}

const TASK_TYPE_ICONS: Record<TaskType, string> = {
  export: '📤',
  redaction: '🔒',
  ocr: '🔍',
  thumbnail: '🖼️',
  analysis: '📊',
  generic: '⚙️'
};

const STATUS_COLORS: Record<TaskStatus, string> = {
  pending: '#6b7280',
  running: '#3b82f6',
  completed: '#10b981',
  failed: '#ef4444',
  cancelled: '#f59e0b'
};

function TaskQueue({ isVisible, onClose }: TaskQueueProps): JSX.Element | null {
  const [tasks, setTasks] = useState<TaskUpdate[]>([]);

  useEffect(() => {
    if (!isVisible) return;

    // Load initial tasks
    window.api.tasks.getAll().then(setTasks);

    // Subscribe to task updates
    const handleUpdate = (update: TaskUpdate) => {
      setTasks(prev => {
        const existing = prev.findIndex(t => t.taskId === update.taskId);
        if (existing >= 0) {
          const updated = [...prev];
          updated[existing] = update;
          return updated;
        }
        return [update, ...prev];
      });
    };

    const handleListUpdate = (taskList: TaskUpdate[]) => {
      setTasks(taskList);
    };

    window.api.tasks.onUpdate(handleUpdate);
    window.api.tasks.onListUpdate(handleListUpdate);

    return () => {
      window.api.tasks.removeUpdateListener();
      window.api.tasks.removeListUpdateListener();
    };
  }, [isVisible]);

  const handleCancel = async (taskId: string) => {
    await window.api.tasks.cancel(taskId);
  };

  const handleClearCompleted = async () => {
    await window.api.tasks.clearCompleted();
    const remaining = await window.api.tasks.getAll();
    setTasks(remaining);
  };

  const formatTime = (ms: number): string => {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const secs = seconds % 60;
    if (minutes > 0) {
      return `${minutes}m ${secs}s`;
    }
    return `${secs}s`;
  };

  if (!isVisible) return null;

  const runningTasks = tasks.filter(t => t.status === 'running');
  const pendingTasks = tasks.filter(t => t.status === 'pending');
  const completedTasks = tasks.filter(t => ['completed', 'failed', 'cancelled'].includes(t.status));

  return (
    <div className="task-queue">
      <div className="task-queue-header">
        <h3>Background Tasks</h3>
        <div className="task-queue-controls">
          {completedTasks.length > 0 && (
            <button className="btn btn-ghost btn-sm" onClick={handleClearCompleted}>
              Clear Completed
            </button>
          )}
          <button className="btn-close" onClick={onClose}>×</button>
        </div>
      </div>

      <div className="task-queue-content">
        {tasks.length === 0 ? (
          <div className="task-queue-empty">
            <p>No background tasks</p>
            <p className="hint">Export videos, apply redactions, and more without blocking the UI</p>
          </div>
        ) : (
          <>
            {/* Running Tasks */}
            {runningTasks.length > 0 && (
              <div className="task-section">
                <h4>Running ({runningTasks.length})</h4>
                {runningTasks.map(task => (
                  <TaskItem
                    key={task.taskId}
                    task={task}
                    onCancel={() => handleCancel(task.taskId)}
                  />
                ))}
              </div>
            )}

            {/* Pending Tasks */}
            {pendingTasks.length > 0 && (
              <div className="task-section">
                <h4>Queued ({pendingTasks.length})</h4>
                {pendingTasks.map(task => (
                  <TaskItem
                    key={task.taskId}
                    task={task}
                    onCancel={() => handleCancel(task.taskId)}
                  />
                ))}
              </div>
            )}

            {/* Completed Tasks */}
            {completedTasks.length > 0 && (
              <div className="task-section">
                <h4>Completed ({completedTasks.length})</h4>
                {completedTasks.slice(0, 10).map(task => (
                  <TaskItem
                    key={task.taskId}
                    task={task}
                  />
                ))}
                {completedTasks.length > 10 && (
                  <p className="more-tasks">+ {completedTasks.length - 10} more</p>
                )}
              </div>
            )}
          </>
        )}
      </div>

      <div className="task-queue-footer">
        <span className="task-summary">
          {runningTasks.length > 0 && `${runningTasks.length} running`}
          {runningTasks.length > 0 && pendingTasks.length > 0 && ' • '}
          {pendingTasks.length > 0 && `${pendingTasks.length} queued`}
          {(runningTasks.length === 0 && pendingTasks.length === 0) && 'All tasks complete'}
        </span>
      </div>
    </div>
  );
}

interface TaskItemProps {
  task: TaskUpdate;
  onCancel?: () => void;
}

function TaskItem({ task, onCancel }: TaskItemProps): JSX.Element {
  const isRunning = task.status === 'running';
  const isPending = task.status === 'pending';
  const canCancel = isRunning || isPending;

  return (
    <div className={`task-item ${task.status}`}>
      <div className="task-icon">{TASK_TYPE_ICONS[task.type]}</div>

      <div className="task-info">
        <div className="task-type">{task.type}</div>
        <div className="task-message">{task.message}</div>

        {isRunning && (
          <div className="task-progress">
            <div className="progress-bar">
              <div
                className="progress-fill"
                style={{
                  width: `${task.progress}%`,
                  backgroundColor: STATUS_COLORS[task.status]
                }}
              />
            </div>
            <span className="progress-text">{Math.round(task.progress)}%</span>
          </div>
        )}

        {task.error && (
          <div className="task-error">{task.error}</div>
        )}
      </div>

      <div className="task-status">
        <span
          className="status-badge"
          style={{ backgroundColor: `${STATUS_COLORS[task.status]}20`, color: STATUS_COLORS[task.status] }}
        >
          {task.status}
        </span>

        {canCancel && onCancel && (
          <button className="btn-cancel" onClick={onCancel} title="Cancel">
            ×
          </button>
        )}
      </div>
    </div>
  );
}

export default TaskQueue;
