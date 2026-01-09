import { useState, useEffect } from 'react';

// Types
type BlockAction = 'blur' | 'solid' | 'pixelate' | 'hide';
type MatchType = 'exact' | 'contains' | 'regex';

interface AppBlockRule {
  id: string;
  name: string;
  matchType: MatchType;
  pattern: string;
  appName?: string;
  action: BlockAction;
  color?: string;
  enabled: boolean;
  createdAt: number;
}

interface AppBlockRulesProps {
  onRuleChange?: () => void;
}

// Action display info
const ACTION_INFO: Record<BlockAction, { label: string; color: string }> = {
  blur: { label: 'Blur', color: '#3b82f6' },
  solid: { label: 'Solid Block', color: '#000000' },
  pixelate: { label: 'Pixelate', color: '#8b5cf6' },
  hide: { label: 'Hide Completely', color: '#ef4444' },
};

function AppBlockRules({ onRuleChange }: AppBlockRulesProps): JSX.Element {
  const [rules, setRules] = useState<AppBlockRule[]>([]);
  const [isAddingRule, setIsAddingRule] = useState(false);
  const [editingRuleId, setEditingRuleId] = useState<string | null>(null);

  // New rule form state
  const [newRule, setNewRule] = useState<Partial<AppBlockRule>>({
    name: '',
    matchType: 'contains',
    pattern: '',
    action: 'blur',
    enabled: true,
  });

  // Load rules on mount
  useEffect(() => {
    loadRules();
  }, []);

  const loadRules = async () => {
    try {
      const loadedRules = await window.api.manual.getAppBlockRules();
      setRules(loadedRules);
    } catch (error) {
      console.error('Failed to load app block rules:', error);
    }
  };

  const handleAddRule = async () => {
    if (!newRule.name || !newRule.pattern) return;

    try {
      const rule = await window.api.manual.addAppBlockRule({
        name: newRule.name,
        matchType: newRule.matchType || 'contains',
        pattern: newRule.pattern,
        appName: newRule.appName,
        action: newRule.action || 'blur',
        color: newRule.color,
        enabled: newRule.enabled ?? true,
      });

      setRules((prev) => [...prev, rule]);
      setNewRule({
        name: '',
        matchType: 'contains',
        pattern: '',
        action: 'blur',
        enabled: true,
      });
      setIsAddingRule(false);
      onRuleChange?.();
    } catch (error) {
      console.error('Failed to add rule:', error);
    }
  };

  const handleUpdateRule = async (id: string, updates: Partial<AppBlockRule>) => {
    try {
      const success = await window.api.manual.updateAppBlockRule(id, updates);
      if (success) {
        setRules((prev) =>
          prev.map((rule) => (rule.id === id ? { ...rule, ...updates } : rule))
        );
        setEditingRuleId(null);
        onRuleChange?.();
      }
    } catch (error) {
      console.error('Failed to update rule:', error);
    }
  };

  const handleDeleteRule = async (id: string) => {
    try {
      const success = await window.api.manual.deleteAppBlockRule(id);
      if (success) {
        setRules((prev) => prev.filter((rule) => rule.id !== id));
        onRuleChange?.();
      }
    } catch (error) {
      console.error('Failed to delete rule:', error);
    }
  };

  const handleToggleRule = async (id: string, enabled: boolean) => {
    await handleUpdateRule(id, { enabled });
  };

  return (
    <div className="app-block-rules">
      <div className="rules-header">
        <h3>App/Window Blocking Rules</h3>
        <p className="rules-description">
          Create rules to automatically blur or block specific application windows during recording.
        </p>
        <button
          className="btn btn-primary btn-sm"
          onClick={() => setIsAddingRule(true)}
        >
          + Add Rule
        </button>
      </div>

      {/* Add Rule Form */}
      {isAddingRule && (
        <div className="rule-form">
          <h4>New Rule</h4>
          <div className="form-row">
            <label>Rule Name</label>
            <input
              type="text"
              placeholder="e.g., Slack Messages"
              value={newRule.name || ''}
              onChange={(e) => setNewRule({ ...newRule, name: e.target.value })}
            />
          </div>

          <div className="form-row">
            <label>Match Type</label>
            <select
              value={newRule.matchType}
              onChange={(e) => setNewRule({ ...newRule, matchType: e.target.value as MatchType })}
            >
              <option value="contains">Contains</option>
              <option value="exact">Exact Match</option>
              <option value="regex">Regular Expression</option>
            </select>
          </div>

          <div className="form-row">
            <label>Window Title Pattern</label>
            <input
              type="text"
              placeholder={newRule.matchType === 'regex' ? 'e.g., (Slack|Discord)' : 'e.g., Slack'}
              value={newRule.pattern || ''}
              onChange={(e) => setNewRule({ ...newRule, pattern: e.target.value })}
            />
          </div>

          <div className="form-row">
            <label>App Name (optional)</label>
            <input
              type="text"
              placeholder="e.g., Slack"
              value={newRule.appName || ''}
              onChange={(e) => setNewRule({ ...newRule, appName: e.target.value })}
            />
          </div>

          <div className="form-row">
            <label>Action</label>
            <select
              value={newRule.action}
              onChange={(e) => setNewRule({ ...newRule, action: e.target.value as BlockAction })}
            >
              {Object.entries(ACTION_INFO).map(([action, info]) => (
                <option key={action} value={action}>
                  {info.label}
                </option>
              ))}
            </select>
          </div>

          {newRule.action === 'solid' && (
            <div className="form-row">
              <label>Block Color</label>
              <input
                type="color"
                value={newRule.color || '#000000'}
                onChange={(e) => setNewRule({ ...newRule, color: e.target.value })}
              />
            </div>
          )}

          <div className="form-actions">
            <button className="btn btn-ghost" onClick={() => setIsAddingRule(false)}>
              Cancel
            </button>
            <button
              className="btn btn-primary"
              onClick={handleAddRule}
              disabled={!newRule.name || !newRule.pattern}
            >
              Add Rule
            </button>
          </div>
        </div>
      )}

      {/* Rules List */}
      <div className="rules-list">
        {rules.length === 0 ? (
          <div className="rules-empty">
            <p>No blocking rules defined</p>
            <p className="hint">
              Create rules to automatically redact specific apps or windows
            </p>
          </div>
        ) : (
          rules.map((rule) => (
            <div
              key={rule.id}
              className={`rule-item ${!rule.enabled ? 'disabled' : ''}`}
            >
              {editingRuleId === rule.id ? (
                <RuleEditForm
                  rule={rule}
                  onSave={(updates) => handleUpdateRule(rule.id, updates)}
                  onCancel={() => setEditingRuleId(null)}
                />
              ) : (
                <>
                  <div className="rule-toggle">
                    <div
                      className={`toggle ${rule.enabled ? 'active' : ''}`}
                      onClick={() => handleToggleRule(rule.id, !rule.enabled)}
                    />
                  </div>

                  <div className="rule-info">
                    <div className="rule-name">{rule.name}</div>
                    <div className="rule-pattern">
                      <span className="match-type">{rule.matchType}:</span>
                      <code>{rule.pattern}</code>
                      {rule.appName && (
                        <span className="app-name">in {rule.appName}</span>
                      )}
                    </div>
                  </div>

                  <div
                    className="rule-action"
                    style={{
                      backgroundColor: `${ACTION_INFO[rule.action].color}20`,
                      color: ACTION_INFO[rule.action].color,
                    }}
                  >
                    {ACTION_INFO[rule.action].label}
                  </div>

                  <div className="rule-actions">
                    <button
                      className="btn-icon"
                      onClick={() => setEditingRuleId(rule.id)}
                      title="Edit"
                    >
                      <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
                        <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z" />
                      </svg>
                    </button>
                    <button
                      className="btn-icon danger"
                      onClick={() => handleDeleteRule(rule.id)}
                      title="Delete"
                    >
                      <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
                        <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z" />
                      </svg>
                    </button>
                  </div>
                </>
              )}
            </div>
          ))
        )}
      </div>

      {/* Preset Rules */}
      <div className="preset-rules">
        <h4>Quick Add Presets</h4>
        <div className="preset-buttons">
          <button
            className="preset-btn"
            onClick={() => {
              setNewRule({
                name: 'Slack',
                matchType: 'contains',
                pattern: 'Slack',
                action: 'blur',
                enabled: true,
              });
              setIsAddingRule(true);
            }}
          >
            Slack
          </button>
          <button
            className="preset-btn"
            onClick={() => {
              setNewRule({
                name: 'Password Managers',
                matchType: 'regex',
                pattern: '(1Password|LastPass|Bitwarden|KeePass)',
                action: 'solid',
                color: '#000000',
                enabled: true,
              });
              setIsAddingRule(true);
            }}
          >
            Password Managers
          </button>
          <button
            className="preset-btn"
            onClick={() => {
              setNewRule({
                name: 'Private Browsing',
                matchType: 'regex',
                pattern: '(Private|Incognito)',
                action: 'solid',
                color: '#000000',
                enabled: true,
              });
              setIsAddingRule(true);
            }}
          >
            Private/Incognito
          </button>
          <button
            className="preset-btn"
            onClick={() => {
              setNewRule({
                name: 'Discord',
                matchType: 'contains',
                pattern: 'Discord',
                action: 'blur',
                enabled: true,
              });
              setIsAddingRule(true);
            }}
          >
            Discord
          </button>
        </div>
      </div>
    </div>
  );
}

// Edit form for existing rule
interface RuleEditFormProps {
  rule: AppBlockRule;
  onSave: (updates: Partial<AppBlockRule>) => void;
  onCancel: () => void;
}

function RuleEditForm({ rule, onSave, onCancel }: RuleEditFormProps): JSX.Element {
  const [editedRule, setEditedRule] = useState<Partial<AppBlockRule>>({
    name: rule.name,
    matchType: rule.matchType,
    pattern: rule.pattern,
    appName: rule.appName,
    action: rule.action,
    color: rule.color,
  });

  return (
    <div className="rule-edit-form">
      <div className="form-row compact">
        <input
          type="text"
          value={editedRule.name || ''}
          onChange={(e) => setEditedRule({ ...editedRule, name: e.target.value })}
          placeholder="Rule name"
        />
        <select
          value={editedRule.matchType}
          onChange={(e) => setEditedRule({ ...editedRule, matchType: e.target.value as MatchType })}
        >
          <option value="contains">Contains</option>
          <option value="exact">Exact</option>
          <option value="regex">Regex</option>
        </select>
      </div>
      <div className="form-row compact">
        <input
          type="text"
          value={editedRule.pattern || ''}
          onChange={(e) => setEditedRule({ ...editedRule, pattern: e.target.value })}
          placeholder="Pattern"
        />
        <select
          value={editedRule.action}
          onChange={(e) => setEditedRule({ ...editedRule, action: e.target.value as BlockAction })}
        >
          {Object.entries(ACTION_INFO).map(([action, info]) => (
            <option key={action} value={action}>
              {info.label}
            </option>
          ))}
        </select>
      </div>
      <div className="form-actions compact">
        <button className="btn btn-ghost btn-sm" onClick={onCancel}>
          Cancel
        </button>
        <button
          className="btn btn-primary btn-sm"
          onClick={() => onSave(editedRule)}
        >
          Save
        </button>
      </div>
    </div>
  );
}

export default AppBlockRules;
