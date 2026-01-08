export interface PrivacyConfig {
  maskInputs: boolean;
  blockSensitive: boolean;
  maskPiiPatterns: boolean;
  customMaskFn?: boolean;
}

export interface SessionRecord {
  id: string;
  name: string;
  timestamp: number;
  duration: number;
  eventCount: number;
  events?: unknown[];
  privacyConfig?: PrivacyConfig | null;
}

export interface SessionStats {
  sessionCount: number;
  totalDuration: number;
  totalEvents: number;
  averageDuration: number;
}

export interface AppSettings {
  theme: 'light' | 'dark' | 'system';
  defaultPrivacy: {
    maskInputs: boolean;
    blockSensitive: boolean;
    maskPiiPatterns: boolean;
  };
  autoImportPath: string | null;
}
