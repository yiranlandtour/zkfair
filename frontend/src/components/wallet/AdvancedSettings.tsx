import React, { useState, useEffect } from 'react';
import { useAccount } from 'wagmi';
import { 
  Settings,
  Shield,
  Key,
  Globe,
  Bell,
  DollarSign,
  Clock,
  Lock,
  Eye,
  EyeOff,
  ToggleLeft,
  ToggleRight,
  Save,
  AlertCircle,
  CheckCircle,
  ChevronDown,
  ChevronRight,
  Zap,
  Database,
  Smartphone,
  Mail
} from 'lucide-react';

interface WalletSettings {
  security: {
    sessionTimeout: number; // minutes
    requireBiometric: boolean;
    autoLockEnabled: boolean;
    autoLockTimeout: number; // minutes
    transactionConfirmation: 'always' | 'threshold' | 'never';
    confirmationThreshold: string; // ETH amount
  };
  gas: {
    defaultPriority: 'low' | 'medium' | 'high' | 'custom';
    customGasPrice?: string;
    maxGasPrice: string;
    gasPriceAlert: boolean;
    gasPriceAlertThreshold: string;
  };
  notifications: {
    email: boolean;
    push: boolean;
    sms: boolean;
    transactionAlerts: boolean;
    securityAlerts: boolean;
    priceAlerts: boolean;
    weeklyReport: boolean;
  };
  privacy: {
    hideBalances: boolean;
    hideTransactionHistory: boolean;
    enableAnalytics: boolean;
    shareDataWithPartners: boolean;
  };
  network: {
    rpcEndpoint: string;
    bundlerUrl: string;
    fallbackRpc: string;
    connectionTimeout: number;
    maxRetries: number;
  };
  backup: {
    lastBackup?: Date;
    autoBackup: boolean;
    backupFrequency: 'daily' | 'weekly' | 'monthly';
    encryptBackups: boolean;
  };
}

interface SettingsSection {
  id: string;
  title: string;
  icon: React.ElementType;
  expanded: boolean;
}

export const AdvancedSettings: React.FC = () => {
  const { address } = useAccount();
  
  const [settings, setSettings] = useState<WalletSettings>({
    security: {
      sessionTimeout: 30,
      requireBiometric: false,
      autoLockEnabled: true,
      autoLockTimeout: 5,
      transactionConfirmation: 'threshold',
      confirmationThreshold: '0.1'
    },
    gas: {
      defaultPriority: 'medium',
      maxGasPrice: '100',
      gasPriceAlert: true,
      gasPriceAlertThreshold: '50'
    },
    notifications: {
      email: true,
      push: true,
      sms: false,
      transactionAlerts: true,
      securityAlerts: true,
      priceAlerts: false,
      weeklyReport: true
    },
    privacy: {
      hideBalances: false,
      hideTransactionHistory: false,
      enableAnalytics: true,
      shareDataWithPartners: false
    },
    network: {
      rpcEndpoint: process.env.REACT_APP_RPC_URL || '',
      bundlerUrl: process.env.REACT_APP_BUNDLER_URL || '',
      fallbackRpc: '',
      connectionTimeout: 30,
      maxRetries: 3
    },
    backup: {
      autoBackup: true,
      backupFrequency: 'weekly',
      encryptBackups: true
    }
  });

  const [sections, setSections] = useState<SettingsSection[]>([
    { id: 'security', title: 'Security', icon: Shield, expanded: true },
    { id: 'gas', title: 'Gas Settings', icon: Zap, expanded: false },
    { id: 'notifications', title: 'Notifications', icon: Bell, expanded: false },
    { id: 'privacy', title: 'Privacy', icon: Eye, expanded: false },
    { id: 'network', title: 'Network', icon: Globe, expanded: false },
    { id: 'backup', title: 'Backup & Recovery', icon: Database, expanded: false }
  ]);

  const [isSaving, setIsSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [showSecretPhrase, setShowSecretPhrase] = useState(false);

  useEffect(() => {
    loadSettings();
  }, [address]);

  const loadSettings = async () => {
    try {
      const response = await fetch(`/api/wallet-settings/${address}`);
      if (response.ok) {
        const data = await response.json();
        setSettings(data);
      }
    } catch (error) {
      console.error('Failed to load settings:', error);
    }
  };

  const saveSettings = async () => {
    setIsSaving(true);
    setSaveStatus('saving');
    
    try {
      const response = await fetch(`/api/wallet-settings/${address}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings)
      });

      if (response.ok) {
        setSaveStatus('saved');
        setTimeout(() => setSaveStatus('idle'), 3000);
      } else {
        setSaveStatus('error');
      }
    } catch (error) {
      console.error('Failed to save settings:', error);
      setSaveStatus('error');
    } finally {
      setIsSaving(false);
    }
  };

  const toggleSection = (sectionId: string) => {
    setSections(sections.map(s => 
      s.id === sectionId ? { ...s, expanded: !s.expanded } : s
    ));
  };

  const updateSetting = (category: keyof WalletSettings, key: string, value: any) => {
    setSettings({
      ...settings,
      [category]: {
        ...settings[category],
        [key]: value
      }
    });
  };

  const exportSettings = () => {
    const data = {
      settings,
      exportedAt: new Date().toISOString(),
      walletAddress: address
    };

    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `wallet-settings-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const importSettings = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = JSON.parse(e.target?.result as string);
        if (data.settings) {
          setSettings(data.settings);
          setSaveStatus('idle');
        }
      } catch (error) {
        console.error('Failed to import settings:', error);
        alert('Invalid settings file');
      }
    };
    reader.readAsText(file);
  };

  const resetToDefaults = () => {
    if (confirm('Are you sure you want to reset all settings to defaults?')) {
      window.location.reload(); // Simple reset - in production, reset to actual defaults
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <Settings className="w-8 h-8 text-gray-700" />
            Advanced Wallet Settings
          </h2>
          <div className="flex gap-2">
            <button
              onClick={() => document.getElementById('import-settings')?.click()}
              className="px-3 py-1 border border-gray-300 rounded hover:bg-gray-50 text-sm"
            >
              Import
            </button>
            <input
              id="import-settings"
              type="file"
              accept=".json"
              onChange={importSettings}
              className="hidden"
            />
            <button
              onClick={exportSettings}
              className="px-3 py-1 border border-gray-300 rounded hover:bg-gray-50 text-sm"
            >
              Export
            </button>
            <button
              onClick={resetToDefaults}
              className="px-3 py-1 border border-red-300 text-red-600 rounded hover:bg-red-50 text-sm"
            >
              Reset
            </button>
          </div>
        </div>

        <div className="space-y-4">
          {sections.map(section => {
            const Icon = section.icon;
            return (
              <div key={section.id} className="border rounded-lg">
                <button
                  onClick={() => toggleSection(section.id)}
                  className="w-full px-4 py-3 flex items-center justify-between hover:bg-gray-50 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <Icon className="w-5 h-5 text-gray-600" />
                    <span className="font-medium">{section.title}</span>
                  </div>
                  {section.expanded ? (
                    <ChevronDown className="w-5 h-5 text-gray-400" />
                  ) : (
                    <ChevronRight className="w-5 h-5 text-gray-400" />
                  )}
                </button>

                {section.expanded && (
                  <div className="px-4 py-4 border-t bg-gray-50">
                    {section.id === 'security' && (
                      <div className="space-y-4">
                        <div className="flex items-center justify-between">
                          <div>
                            <label className="font-medium">Session Timeout</label>
                            <p className="text-sm text-gray-600">Auto-logout after inactivity</p>
                          </div>
                          <div className="flex items-center gap-2">
                            <input
                              type="number"
                              value={settings.security.sessionTimeout}
                              onChange={(e) => updateSetting('security', 'sessionTimeout', parseInt(e.target.value))}
                              className="w-20 px-2 py-1 border rounded"
                              min="5"
                              max="120"
                            />
                            <span className="text-sm text-gray-600">minutes</span>
                          </div>
                        </div>

                        <div className="flex items-center justify-between">
                          <div>
                            <label className="font-medium">Biometric Authentication</label>
                            <p className="text-sm text-gray-600">Use fingerprint/face ID</p>
                          </div>
                          <button
                            onClick={() => updateSetting('security', 'requireBiometric', !settings.security.requireBiometric)}
                            className="text-2xl"
                          >
                            {settings.security.requireBiometric ? (
                              <ToggleRight className="text-blue-600" />
                            ) : (
                              <ToggleLeft className="text-gray-400" />
                            )}
                          </button>
                        </div>

                        <div className="flex items-center justify-between">
                          <div>
                            <label className="font-medium">Auto-Lock</label>
                            <p className="text-sm text-gray-600">Lock wallet when idle</p>
                          </div>
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => updateSetting('security', 'autoLockEnabled', !settings.security.autoLockEnabled)}
                              className="text-2xl"
                            >
                              {settings.security.autoLockEnabled ? (
                                <ToggleRight className="text-blue-600" />
                              ) : (
                                <ToggleLeft className="text-gray-400" />
                              )}
                            </button>
                            {settings.security.autoLockEnabled && (
                              <>
                                <input
                                  type="number"
                                  value={settings.security.autoLockTimeout}
                                  onChange={(e) => updateSetting('security', 'autoLockTimeout', parseInt(e.target.value))}
                                  className="w-16 px-2 py-1 border rounded"
                                  min="1"
                                  max="60"
                                />
                                <span className="text-sm text-gray-600">min</span>
                              </>
                            )}
                          </div>
                        </div>

                        <div>
                          <label className="font-medium block mb-2">Transaction Confirmation</label>
                          <select
                            value={settings.security.transactionConfirmation}
                            onChange={(e) => updateSetting('security', 'transactionConfirmation', e.target.value)}
                            className="w-full px-3 py-2 border rounded-lg"
                          >
                            <option value="always">Always confirm</option>
                            <option value="threshold">Confirm above threshold</option>
                            <option value="never">Never confirm</option>
                          </select>
                          {settings.security.transactionConfirmation === 'threshold' && (
                            <div className="mt-2 flex items-center gap-2">
                              <input
                                type="text"
                                value={settings.security.confirmationThreshold}
                                onChange={(e) => updateSetting('security', 'confirmationThreshold', e.target.value)}
                                className="flex-1 px-3 py-2 border rounded-lg"
                                placeholder="0.1"
                              />
                              <span className="text-sm text-gray-600">ETH</span>
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {section.id === 'gas' && (
                      <div className="space-y-4">
                        <div>
                          <label className="font-medium block mb-2">Default Gas Priority</label>
                          <select
                            value={settings.gas.defaultPriority}
                            onChange={(e) => updateSetting('gas', 'defaultPriority', e.target.value)}
                            className="w-full px-3 py-2 border rounded-lg"
                          >
                            <option value="low">Low (Slow)</option>
                            <option value="medium">Medium (Standard)</option>
                            <option value="high">High (Fast)</option>
                            <option value="custom">Custom</option>
                          </select>
                          {settings.gas.defaultPriority === 'custom' && (
                            <input
                              type="text"
                              value={settings.gas.customGasPrice || ''}
                              onChange={(e) => updateSetting('gas', 'customGasPrice', e.target.value)}
                              className="mt-2 w-full px-3 py-2 border rounded-lg"
                              placeholder="Gas price in Gwei"
                            />
                          )}
                        </div>

                        <div className="flex items-center justify-between">
                          <div>
                            <label className="font-medium">Max Gas Price</label>
                            <p className="text-sm text-gray-600">Reject if gas exceeds limit</p>
                          </div>
                          <div className="flex items-center gap-2">
                            <input
                              type="text"
                              value={settings.gas.maxGasPrice}
                              onChange={(e) => updateSetting('gas', 'maxGasPrice', e.target.value)}
                              className="w-20 px-2 py-1 border rounded"
                            />
                            <span className="text-sm text-gray-600">Gwei</span>
                          </div>
                        </div>

                        <div className="flex items-center justify-between">
                          <div>
                            <label className="font-medium">Gas Price Alerts</label>
                            <p className="text-sm text-gray-600">Notify when gas is high</p>
                          </div>
                          <button
                            onClick={() => updateSetting('gas', 'gasPriceAlert', !settings.gas.gasPriceAlert)}
                            className="text-2xl"
                          >
                            {settings.gas.gasPriceAlert ? (
                              <ToggleRight className="text-blue-600" />
                            ) : (
                              <ToggleLeft className="text-gray-400" />
                            )}
                          </button>
                        </div>
                      </div>
                    )}

                    {section.id === 'notifications' && (
                      <div className="space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <Mail className="w-4 h-4 text-gray-600" />
                              <span>Email</span>
                            </div>
                            <button
                              onClick={() => updateSetting('notifications', 'email', !settings.notifications.email)}
                              className="text-2xl"
                            >
                              {settings.notifications.email ? (
                                <ToggleRight className="text-blue-600" />
                              ) : (
                                <ToggleLeft className="text-gray-400" />
                              )}
                            </button>
                          </div>

                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <Smartphone className="w-4 h-4 text-gray-600" />
                              <span>Push</span>
                            </div>
                            <button
                              onClick={() => updateSetting('notifications', 'push', !settings.notifications.push)}
                              className="text-2xl"
                            >
                              {settings.notifications.push ? (
                                <ToggleRight className="text-blue-600" />
                              ) : (
                                <ToggleLeft className="text-gray-400" />
                              )}
                            </button>
                          </div>
                        </div>

                        <div className="border-t pt-4 space-y-3">
                          <h4 className="font-medium text-sm text-gray-700">Alert Types</h4>
                          {[
                            { key: 'transactionAlerts', label: 'Transaction Alerts' },
                            { key: 'securityAlerts', label: 'Security Alerts' },
                            { key: 'priceAlerts', label: 'Price Alerts' },
                            { key: 'weeklyReport', label: 'Weekly Reports' }
                          ].map(alert => (
                            <div key={alert.key} className="flex items-center justify-between">
                              <span>{alert.label}</span>
                              <button
                                onClick={() => updateSetting('notifications', alert.key, !settings.notifications[alert.key])}
                                className="text-2xl"
                              >
                                {settings.notifications[alert.key] ? (
                                  <ToggleRight className="text-blue-600" />
                                ) : (
                                  <ToggleLeft className="text-gray-400" />
                                )}
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {section.id === 'privacy' && (
                      <div className="space-y-4">
                        {[
                          { key: 'hideBalances', label: 'Hide Balances', desc: 'Show *** instead of amounts' },
                          { key: 'hideTransactionHistory', label: 'Hide Transaction History', desc: 'Require auth to view' },
                          { key: 'enableAnalytics', label: 'Usage Analytics', desc: 'Help improve the app' },
                          { key: 'shareDataWithPartners', label: 'Partner Sharing', desc: 'Share data with partners' }
                        ].map(item => (
                          <div key={item.key} className="flex items-center justify-between">
                            <div>
                              <label className="font-medium">{item.label}</label>
                              <p className="text-sm text-gray-600">{item.desc}</p>
                            </div>
                            <button
                              onClick={() => updateSetting('privacy', item.key, !settings.privacy[item.key])}
                              className="text-2xl"
                            >
                              {settings.privacy[item.key] ? (
                                <ToggleRight className="text-blue-600" />
                              ) : (
                                <ToggleLeft className="text-gray-400" />
                              )}
                            </button>
                          </div>
                        ))}
                      </div>
                    )}

                    {section.id === 'network' && (
                      <div className="space-y-4">
                        <div>
                          <label className="font-medium block mb-1">RPC Endpoint</label>
                          <input
                            type="text"
                            value={settings.network.rpcEndpoint}
                            onChange={(e) => updateSetting('network', 'rpcEndpoint', e.target.value)}
                            className="w-full px-3 py-2 border rounded-lg font-mono text-sm"
                            placeholder="https://..."
                          />
                        </div>

                        <div>
                          <label className="font-medium block mb-1">Bundler URL</label>
                          <input
                            type="text"
                            value={settings.network.bundlerUrl}
                            onChange={(e) => updateSetting('network', 'bundlerUrl', e.target.value)}
                            className="w-full px-3 py-2 border rounded-lg font-mono text-sm"
                            placeholder="https://..."
                          />
                        </div>

                        <div>
                          <label className="font-medium block mb-1">Fallback RPC</label>
                          <input
                            type="text"
                            value={settings.network.fallbackRpc}
                            onChange={(e) => updateSetting('network', 'fallbackRpc', e.target.value)}
                            className="w-full px-3 py-2 border rounded-lg font-mono text-sm"
                            placeholder="https://..."
                          />
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <label className="font-medium block mb-1">Connection Timeout</label>
                            <div className="flex items-center gap-2">
                              <input
                                type="number"
                                value={settings.network.connectionTimeout}
                                onChange={(e) => updateSetting('network', 'connectionTimeout', parseInt(e.target.value))}
                                className="flex-1 px-3 py-2 border rounded-lg"
                                min="5"
                                max="120"
                              />
                              <span className="text-sm text-gray-600">sec</span>
                            </div>
                          </div>

                          <div>
                            <label className="font-medium block mb-1">Max Retries</label>
                            <input
                              type="number"
                              value={settings.network.maxRetries}
                              onChange={(e) => updateSetting('network', 'maxRetries', parseInt(e.target.value))}
                              className="w-full px-3 py-2 border rounded-lg"
                              min="0"
                              max="10"
                            />
                          </div>
                        </div>
                      </div>
                    )}

                    {section.id === 'backup' && (
                      <div className="space-y-4">
                        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
                          <div className="flex items-start gap-2">
                            <AlertCircle className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" />
                            <p className="text-sm text-yellow-800">
                              Regular backups protect against data loss. Store backups securely and never share them.
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center justify-between">
                          <div>
                            <label className="font-medium">Auto Backup</label>
                            <p className="text-sm text-gray-600">Automatically backup wallet data</p>
                          </div>
                          <button
                            onClick={() => updateSetting('backup', 'autoBackup', !settings.backup.autoBackup)}
                            className="text-2xl"
                          >
                            {settings.backup.autoBackup ? (
                              <ToggleRight className="text-blue-600" />
                            ) : (
                              <ToggleLeft className="text-gray-400" />
                            )}
                          </button>
                        </div>

                        {settings.backup.autoBackup && (
                          <div>
                            <label className="font-medium block mb-2">Backup Frequency</label>
                            <select
                              value={settings.backup.backupFrequency}
                              onChange={(e) => updateSetting('backup', 'backupFrequency', e.target.value)}
                              className="w-full px-3 py-2 border rounded-lg"
                            >
                              <option value="daily">Daily</option>
                              <option value="weekly">Weekly</option>
                              <option value="monthly">Monthly</option>
                            </select>
                          </div>
                        )}

                        <div className="flex items-center justify-between">
                          <div>
                            <label className="font-medium">Encrypt Backups</label>
                            <p className="text-sm text-gray-600">Add encryption to backup files</p>
                          </div>
                          <button
                            onClick={() => updateSetting('backup', 'encryptBackups', !settings.backup.encryptBackups)}
                            className="text-2xl"
                          >
                            {settings.backup.encryptBackups ? (
                              <ToggleRight className="text-blue-600" />
                            ) : (
                              <ToggleLeft className="text-gray-400" />
                            )}
                          </button>
                        </div>

                        {settings.backup.lastBackup && (
                          <div className="text-sm text-gray-600">
                            Last backup: {new Date(settings.backup.lastBackup).toLocaleString()}
                          </div>
                        )}

                        <button
                          className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                        >
                          Backup Now
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Save Button */}
        <div className="mt-6 flex items-center justify-between">
          <div className="flex items-center gap-2">
            {saveStatus === 'saved' && (
              <>
                <CheckCircle className="w-5 h-5 text-green-600" />
                <span className="text-green-600">Settings saved successfully</span>
              </>
            )}
            {saveStatus === 'error' && (
              <>
                <AlertCircle className="w-5 h-5 text-red-600" />
                <span className="text-red-600">Failed to save settings</span>
              </>
            )}
          </div>
          <button
            onClick={saveSettings}
            disabled={isSaving}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
          >
            {isSaving ? (
              <>
                <Clock className="w-4 h-4 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Save className="w-4 h-4" />
                Save Settings
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};