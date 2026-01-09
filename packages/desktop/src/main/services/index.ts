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
