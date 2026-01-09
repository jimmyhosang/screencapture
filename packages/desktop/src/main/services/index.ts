/**
 * Services Module
 *
 * Exports all main process services for screen recording and management.
 */

export {
  ScreenRecorder,
  getScreenRecorder,
  resetScreenRecorder,
  type SourceInfo,
  type RecordingOptions,
  type RecordingResult,
  type RecordingState,
  type WindowActivity
} from './screen-recorder';

export {
  RecordingManager,
  getRecordingManager,
  setupRecordingManagerHandlers,
  shutdownRecordingManager,
  type ManagedRecording,
  type RecordingManagerConfig
} from './recording-manager';

export {
  StorageManager,
  getStorageManager,
  setupStorageHandlers,
  shutdownStorageManager,
  type StorageConfig,
  type StorageStats,
  type StoragePaths,
  type RecordingPaths
} from './storage-manager';

export {
  RecordingIndexer,
  getRecordingIndexer,
  setupIndexerHandlers,
  shutdownRecordingIndexer,
  type IndexedRecording,
  type RecordingMetadata,
  type RecordingFilter,
  type PaginatedRecordings
} from './recording-indexer';

export {
  OcrProcessor,
  getOcrProcessor,
  setupOcrProcessorHandlers,
  shutdownOcrProcessor,
  type OcrOptions,
  type OcrReport,
  type OcrFrame,
  type OcrJobStatus,
  type WordInfo,
  type Rectangle
} from './ocr-processor';

export {
  SessionRecordingManager,
  getSessionRecordingManager,
  setupSessionRecordingManagerHandlers,
  shutdownSessionRecordingManager,
  type SessionRecordingConfig,
  type SessionRecordingState,
  type SessionRecordingResult,
  type SessionProgressData,
  type SessionEventType
} from './session-recording-manager';
