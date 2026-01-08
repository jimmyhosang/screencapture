import { useState, useEffect } from 'react';

// Types
type BlockAction = 'blur' | 'solid' | 'pixelate' | 'hide';
type RedactionStyle = 'solid' | 'blur' | 'pixelate' | 'pattern';

interface AppBlockRule {
  id: string;
  name: string;
  matchType: 'exact' | 'contains' | 'regex';
  pattern: string;
  appName?: string;
  action: BlockAction;
  color?: string;
  enabled: boolean;
  createdAt: number;
}

interface RedactionProfile {
  id: string;
  name: string;
  description?: string;
  version: string;
  appBlockRules: AppBlockRule[];
  piiTypes: string[];
  defaultStyle: RedactionStyle;
  defaultColor: string;
  customPatterns?: Array<{
    name: string;
    regex: string;
    replacer: string;
  }>;
  tags?: string[];
  createdAt: number;
  updatedAt: number;
}

interface RedactionProfilesProps {
  onProfileApply?: (profileId: string) => void;
  recordingId?: string;
}

// Preset profiles
const PRESET_PROFILES = [
  {
    name: 'HIPAA Compliant',
    description: 'Redact PHI (Protected Health Information) for healthcare compliance',
    tags: ['healthcare', 'compliance', 'hipaa'],
    piiTypes: ['ssn', 'dateOfBirth', 'email', 'phone', 'creditCard'],
    defaultStyle: 'solid' as RedactionStyle,
    defaultColor: '#000000',
  },
  {
    name: 'Financial Privacy',
    description: 'Redact financial information and account numbers',
    tags: ['finance', 'banking', 'pci'],
    piiTypes: ['ssn', 'creditCard', 'bankAccount', 'iban'],
    defaultStyle: 'blur' as RedactionStyle,
    defaultColor: '#000000',
  },
  {
    name: 'Demo Mode',
    description: 'Light redaction for product demos and presentations',
    tags: ['demo', 'presentation'],
    piiTypes: ['email', 'phone'],
    defaultStyle: 'blur' as RedactionStyle,
    defaultColor: '#333333',
  },
];

// PII type display info
const PII_TYPES = [
  { id: 'ssn', name: 'Social Security Number' },
  { id: 'creditCard', name: 'Credit Card' },
  { id: 'email', name: 'Email Address' },
  { id: 'phone', name: 'Phone Number' },
  { id: 'dateOfBirth', name: 'Date of Birth' },
  { id: 'bankAccount', name: 'Bank Account' },
  { id: 'iban', name: 'IBAN' },
  { id: 'apiKey', name: 'API Key' },
  { id: 'ipv4', name: 'IPv4 Address' },
  { id: 'passport', name: 'Passport Number' },
];

function RedactionProfiles({ onProfileApply, recordingId }: RedactionProfilesProps): JSX.Element {
  const [profiles, setProfiles] = useState<RedactionProfile[]>([]);
  const [isCreating, setIsCreating] = useState(false);
  const [editingProfile, setEditingProfile] = useState<RedactionProfile | null>(null);
  const [selectedProfileId, setSelectedProfileId] = useState<string | null>(null);

  // New profile form state
  const [newProfile, setNewProfile] = useState({
    name: '',
    description: '',
    piiTypes: ['ssn', 'creditCard', 'email', 'phone'],
    defaultStyle: 'blur' as RedactionStyle,
    defaultColor: '#000000',
    tags: [] as string[],
  });

  // Load profiles on mount
  useEffect(() => {
    loadProfiles();
  }, []);

  const loadProfiles = async () => {
    try {
      const loadedProfiles = await window.api.manual.getProfiles();
      setProfiles(loadedProfiles);
    } catch (error) {
      console.error('Failed to load profiles:', error);
    }
  };

  const handleCreateProfile = async () => {
    if (!newProfile.name) return;

    try {
      // Get current app block rules
      const appBlockRules = await window.api.manual.getAppBlockRules();

      const profile = await window.api.manual.createProfile({
        name: newProfile.name,
        description: newProfile.description,
        appBlockRules: appBlockRules.filter(r => r.enabled),
        piiTypes: newProfile.piiTypes,
        defaultStyle: newProfile.defaultStyle,
        defaultColor: newProfile.defaultColor,
        tags: newProfile.tags,
      });

      setProfiles((prev) => [...prev, profile]);
      setNewProfile({
        name: '',
        description: '',
        piiTypes: ['ssn', 'creditCard', 'email', 'phone'],
        defaultStyle: 'blur',
        defaultColor: '#000000',
        tags: [],
      });
      setIsCreating(false);
    } catch (error) {
      console.error('Failed to create profile:', error);
    }
  };

  const handleDeleteProfile = async (id: string) => {
    try {
      const success = await window.api.manual.deleteProfile(id);
      if (success) {
        setProfiles((prev) => prev.filter((p) => p.id !== id));
        if (selectedProfileId === id) {
          setSelectedProfileId(null);
        }
      }
    } catch (error) {
      console.error('Failed to delete profile:', error);
    }
  };

  const handleExportProfile = async (id: string) => {
    try {
      await window.api.manual.exportProfile(id);
    } catch (error) {
      console.error('Failed to export profile:', error);
    }
  };

  const handleImportProfile = async () => {
    try {
      const profile = await window.api.manual.importProfile();
      if (profile) {
        setProfiles((prev) => [...prev, profile]);
      }
    } catch (error) {
      console.error('Failed to import profile:', error);
    }
  };

  const handleApplyProfile = async (profileId: string) => {
    if (!recordingId) return;

    try {
      const success = await window.api.manual.applyProfile(recordingId, profileId);
      if (success) {
        onProfileApply?.(profileId);
      }
    } catch (error) {
      console.error('Failed to apply profile:', error);
    }
  };

  const handleCreateFromPreset = async (preset: typeof PRESET_PROFILES[0]) => {
    try {
      const profile = await window.api.manual.createProfile({
        name: preset.name,
        description: preset.description,
        appBlockRules: [],
        piiTypes: preset.piiTypes,
        defaultStyle: preset.defaultStyle,
        defaultColor: preset.defaultColor,
        tags: preset.tags,
      });

      setProfiles((prev) => [...prev, profile]);
    } catch (error) {
      console.error('Failed to create preset profile:', error);
    }
  };

  const togglePIIType = (typeId: string) => {
    setNewProfile((prev) => ({
      ...prev,
      piiTypes: prev.piiTypes.includes(typeId)
        ? prev.piiTypes.filter((t) => t !== typeId)
        : [...prev.piiTypes, typeId],
    }));
  };

  return (
    <div className="redaction-profiles">
      <div className="profiles-header">
        <h3>Redaction Profiles</h3>
        <p className="profiles-description">
          Save and share redaction configurations. Apply profiles to standardize privacy settings.
        </p>
        <div className="header-actions">
          <button className="btn btn-ghost btn-sm" onClick={handleImportProfile}>
            Import
          </button>
          <button className="btn btn-primary btn-sm" onClick={() => setIsCreating(true)}>
            + New Profile
          </button>
        </div>
      </div>

      {/* Create Profile Form */}
      {isCreating && (
        <div className="profile-form">
          <h4>New Profile</h4>

          <div className="form-row">
            <label>Profile Name *</label>
            <input
              type="text"
              placeholder="e.g., HIPAA Compliant"
              value={newProfile.name}
              onChange={(e) => setNewProfile({ ...newProfile, name: e.target.value })}
            />
          </div>

          <div className="form-row">
            <label>Description</label>
            <textarea
              placeholder="Describe what this profile is for..."
              value={newProfile.description}
              onChange={(e) => setNewProfile({ ...newProfile, description: e.target.value })}
              rows={2}
            />
          </div>

          <div className="form-row">
            <label>Default Style</label>
            <select
              value={newProfile.defaultStyle}
              onChange={(e) => setNewProfile({ ...newProfile, defaultStyle: e.target.value as RedactionStyle })}
            >
              <option value="blur">Blur</option>
              <option value="solid">Solid Block</option>
              <option value="pixelate">Pixelate</option>
              <option value="pattern">Pattern</option>
            </select>
          </div>

          <div className="form-row">
            <label>PII Types to Detect</label>
            <div className="pii-checkboxes">
              {PII_TYPES.map((type) => (
                <label key={type.id} className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={newProfile.piiTypes.includes(type.id)}
                    onChange={() => togglePIIType(type.id)}
                  />
                  {type.name}
                </label>
              ))}
            </div>
          </div>

          <div className="form-actions">
            <button className="btn btn-ghost" onClick={() => setIsCreating(false)}>
              Cancel
            </button>
            <button
              className="btn btn-primary"
              onClick={handleCreateProfile}
              disabled={!newProfile.name}
            >
              Create Profile
            </button>
          </div>
        </div>
      )}

      {/* Preset Profiles */}
      <div className="preset-profiles">
        <h4>Quick Start Presets</h4>
        <div className="preset-cards">
          {PRESET_PROFILES.map((preset, index) => (
            <div key={index} className="preset-card">
              <div className="preset-header">
                <h5>{preset.name}</h5>
                <div className="preset-tags">
                  {preset.tags?.map((tag) => (
                    <span key={tag} className="tag">
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
              <p className="preset-description">{preset.description}</p>
              <div className="preset-pii">
                {preset.piiTypes.slice(0, 3).map((type) => (
                  <span key={type} className="pii-tag">
                    {type}
                  </span>
                ))}
                {preset.piiTypes.length > 3 && (
                  <span className="pii-more">+{preset.piiTypes.length - 3}</span>
                )}
              </div>
              <button
                className="btn btn-ghost btn-sm"
                onClick={() => handleCreateFromPreset(preset)}
              >
                Use This Preset
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Saved Profiles */}
      <div className="saved-profiles">
        <h4>My Profiles ({profiles.length})</h4>
        {profiles.length === 0 ? (
          <div className="profiles-empty">
            <p>No saved profiles yet</p>
            <p className="hint">Create a profile to save your redaction settings</p>
          </div>
        ) : (
          <div className="profiles-list">
            {profiles.map((profile) => (
              <div
                key={profile.id}
                className={`profile-item ${selectedProfileId === profile.id ? 'selected' : ''}`}
                onClick={() => setSelectedProfileId(profile.id === selectedProfileId ? null : profile.id)}
              >
                <div className="profile-main">
                  <div className="profile-name">{profile.name}</div>
                  {profile.description && (
                    <div className="profile-description">{profile.description}</div>
                  )}
                  <div className="profile-meta">
                    <span className="profile-style" data-style={profile.defaultStyle}>
                      {profile.defaultStyle}
                    </span>
                    <span className="profile-pii-count">
                      {profile.piiTypes.length} PII types
                    </span>
                    <span className="profile-date">
                      {new Date(profile.updatedAt).toLocaleDateString()}
                    </span>
                  </div>
                </div>

                <div className="profile-actions">
                  {recordingId && (
                    <button
                      className="btn btn-primary btn-sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleApplyProfile(profile.id);
                      }}
                    >
                      Apply
                    </button>
                  )}
                  <button
                    className="btn-icon"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleExportProfile(profile.id);
                    }}
                    title="Export"
                  >
                    <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
                      <path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z" />
                    </svg>
                  </button>
                  <button
                    className="btn-icon danger"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeleteProfile(profile.id);
                    }}
                    title="Delete"
                  >
                    <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
                      <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z" />
                    </svg>
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Profile Details Panel */}
      {selectedProfileId && (
        <ProfileDetailsPanel
          profile={profiles.find((p) => p.id === selectedProfileId)!}
          onClose={() => setSelectedProfileId(null)}
        />
      )}
    </div>
  );
}

// Profile details panel
interface ProfileDetailsPanelProps {
  profile: RedactionProfile;
  onClose: () => void;
}

function ProfileDetailsPanel({ profile, onClose }: ProfileDetailsPanelProps): JSX.Element {
  return (
    <div className="profile-details-panel">
      <div className="panel-header">
        <h4>{profile.name}</h4>
        <button className="btn-icon" onClick={onClose}>
          ×
        </button>
      </div>

      <div className="panel-content">
        {profile.description && (
          <div className="detail-section">
            <h5>Description</h5>
            <p>{profile.description}</p>
          </div>
        )}

        <div className="detail-section">
          <h5>Default Style</h5>
          <span className="style-badge" data-style={profile.defaultStyle}>
            {profile.defaultStyle}
          </span>
        </div>

        <div className="detail-section">
          <h5>PII Types ({profile.piiTypes.length})</h5>
          <div className="pii-list">
            {profile.piiTypes.map((type) => (
              <span key={type} className="pii-tag">
                {PII_TYPES.find((t) => t.id === type)?.name || type}
              </span>
            ))}
          </div>
        </div>

        {profile.appBlockRules.length > 0 && (
          <div className="detail-section">
            <h5>App Block Rules ({profile.appBlockRules.length})</h5>
            <div className="rules-list">
              {profile.appBlockRules.map((rule) => (
                <div key={rule.id} className="rule-item-small">
                  <span className="rule-name">{rule.name}</span>
                  <span className="rule-action">{rule.action}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {profile.tags && profile.tags.length > 0 && (
          <div className="detail-section">
            <h5>Tags</h5>
            <div className="tags-list">
              {profile.tags.map((tag) => (
                <span key={tag} className="tag">
                  {tag}
                </span>
              ))}
            </div>
          </div>
        )}

        <div className="detail-section">
          <h5>Version</h5>
          <span>{profile.version}</span>
        </div>

        <div className="detail-section">
          <h5>Last Updated</h5>
          <span>{new Date(profile.updatedAt).toLocaleString()}</span>
        </div>
      </div>
    </div>
  );
}

export default RedactionProfiles;
