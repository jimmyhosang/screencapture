/**
 * Manual Redaction Types
 *
 * Types for user-defined redaction regions, app blocking rules,
 * and redaction profiles.
 */

// ============================================================================
// Region Types
// ============================================================================

export type RegionType = 'static' | 'tracked' | 'temporary';

export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * A manually defined redaction region
 */
export interface ManualRegion {
  /** Unique region ID */
  id: string;
  /** Region type: static, tracked, or temporary */
  type: RegionType;
  /** Bounding box coordinates (relative to video dimensions, 0-1 normalized) */
  bounds: BoundingBox;
  /** Optional label for the region */
  label?: string;
  /** Redaction style to apply */
  style: 'solid' | 'blur' | 'pixelate' | 'pattern';
  /** Color for solid/pattern styles */
  color?: string;
  /** For temporary regions: start time in ms */
  startTime?: number;
  /** For temporary regions: end time in ms */
  endTime?: number;
  /** For tracked regions: window/element ID to track */
  trackingTarget?: string;
  /** For tracked regions: offset from tracked target */
  trackingOffset?: { x: number; y: number };
  /** Creation timestamp */
  createdAt: number;
}

// ============================================================================
// App/Window Blocking
// ============================================================================

export type BlockAction = 'blur' | 'solid' | 'pixelate' | 'hide';

/**
 * Rule for automatically blocking specific apps/windows
 */
export interface AppBlockRule {
  /** Unique rule ID */
  id: string;
  /** Rule name for display */
  name: string;
  /** Match type: exact, contains, regex */
  matchType: 'exact' | 'contains' | 'regex';
  /** Pattern to match against window title */
  pattern: string;
  /** Optional: match against app/process name */
  appName?: string;
  /** Action to take when matched */
  action: BlockAction;
  /** Color for solid action */
  color?: string;
  /** Whether rule is enabled */
  enabled: boolean;
  /** Creation timestamp */
  createdAt: number;
}

/**
 * Detected window information
 */
export interface DetectedWindow {
  /** Window ID */
  id: string;
  /** Window title */
  title: string;
  /** Application name */
  appName: string;
  /** Window bounds on screen */
  bounds: BoundingBox;
  /** Whether window is currently visible */
  visible: boolean;
  /** PID of the owning process */
  pid?: number;
}

// ============================================================================
// Redaction Timeline
// ============================================================================

/**
 * A redaction event on the timeline
 */
export interface TimelineEvent {
  /** Unique event ID */
  id: string;
  /** Type of redaction */
  type: 'manual' | 'auto-pii' | 'app-block';
  /** Reference to the region/rule that created this */
  sourceId: string;
  /** Start time in ms */
  startTime: number;
  /** End time in ms (or video duration for static) */
  endTime: number;
  /** Bounds at this time point */
  bounds: BoundingBox;
  /** Style applied */
  style: 'solid' | 'blur' | 'pixelate' | 'pattern';
  /** Label for display */
  label?: string;
}

/**
 * Timeline track containing related events
 */
export interface TimelineTrack {
  /** Track ID */
  id: string;
  /** Track name */
  name: string;
  /** Track type */
  type: 'manual' | 'auto' | 'app';
  /** Events in this track */
  events: TimelineEvent[];
  /** Whether track is visible */
  visible: boolean;
  /** Whether track is locked (no editing) */
  locked: boolean;
}

// ============================================================================
// Redaction Profiles
// ============================================================================

/**
 * A saved redaction profile that can be exported/imported
 */
export interface RedactionProfile {
  /** Profile ID */
  id: string;
  /** Profile name */
  name: string;
  /** Profile description */
  description?: string;
  /** Version for compatibility */
  version: string;
  /** App blocking rules */
  appBlockRules: AppBlockRule[];
  /** PII types to auto-detect */
  piiTypes: string[];
  /** Default redaction style */
  defaultStyle: 'solid' | 'blur' | 'pixelate' | 'pattern';
  /** Default color */
  defaultColor: string;
  /** Custom patterns for PII detection */
  customPatterns?: Array<{
    name: string;
    regex: string;
    replacer: string;
  }>;
  /** Tags for categorization */
  tags?: string[];
  /** Creation timestamp */
  createdAt: number;
  /** Last modified timestamp */
  updatedAt: number;
}

// ============================================================================
// Session State
// ============================================================================

/**
 * State for an active redaction session
 */
export interface RedactionSession {
  /** Recording ID this session is for */
  recordingId: string;
  /** Video duration in ms */
  duration: number;
  /** Video dimensions */
  dimensions: { width: number; height: number };
  /** Manual regions defined */
  regions: ManualRegion[];
  /** Timeline tracks */
  tracks: TimelineTrack[];
  /** Applied profile (if any) */
  appliedProfile?: string;
  /** Whether session has unsaved changes */
  isDirty: boolean;
  /** Last save timestamp */
  lastSaved?: number;
}

// ============================================================================
// Drawing Tool State
// ============================================================================

export type DrawingTool = 'select' | 'rectangle' | 'pan' | 'zoom';

export interface DrawingState {
  /** Active tool */
  tool: DrawingTool;
  /** Currently selected region IDs */
  selectedRegions: string[];
  /** Whether currently drawing */
  isDrawing: boolean;
  /** Drawing start point */
  startPoint?: { x: number; y: number };
  /** Current drawing bounds */
  currentBounds?: BoundingBox;
  /** Zoom level */
  zoom: number;
  /** Pan offset */
  panOffset: { x: number; y: number };
  /** Current playback time */
  currentTime: number;
  /** Whether video is playing */
  isPlaying: boolean;
  /** Whether recording is paused for redaction */
  isPausedForRedaction: boolean;
}

// ============================================================================
// Export Types
// ============================================================================

export const PROFILE_VERSION = '1.0.0';

export const DEFAULT_APP_BLOCK_RULES: AppBlockRule[] = [
  {
    id: 'slack-default',
    name: 'Slack Messages',
    matchType: 'contains',
    pattern: 'Slack',
    action: 'blur',
    enabled: false,
    createdAt: Date.now(),
  },
  {
    id: 'password-manager',
    name: 'Password Managers',
    matchType: 'regex',
    pattern: '(1Password|LastPass|Bitwarden|KeePass)',
    action: 'solid',
    color: '#000000',
    enabled: false,
    createdAt: Date.now(),
  },
  {
    id: 'private-browsing',
    name: 'Private/Incognito Browsing',
    matchType: 'regex',
    pattern: '(Private|Incognito)',
    action: 'solid',
    color: '#000000',
    enabled: false,
    createdAt: Date.now(),
  },
];

export const PRESET_PROFILES: Partial<RedactionProfile>[] = [
  {
    name: 'HIPAA Compliant',
    description: 'Redact PHI (Protected Health Information) for healthcare compliance',
    tags: ['healthcare', 'compliance', 'hipaa'],
    piiTypes: ['ssn', 'dateOfBirth', 'email', 'phone', 'creditCard'],
    defaultStyle: 'solid',
    defaultColor: '#000000',
  },
  {
    name: 'Financial Privacy',
    description: 'Redact financial information and account numbers',
    tags: ['finance', 'banking', 'pci'],
    piiTypes: ['ssn', 'creditCard', 'bankAccount', 'iban'],
    defaultStyle: 'blur',
    defaultColor: '#000000',
  },
  {
    name: 'Demo Mode',
    description: 'Light redaction for product demos and presentations',
    tags: ['demo', 'presentation'],
    piiTypes: ['email', 'phone'],
    defaultStyle: 'blur',
    defaultColor: '#333333',
  },
];
