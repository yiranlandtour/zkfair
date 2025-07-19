import React, { useState, useEffect } from 'react';
import { 
  CogIcon, 
  CheckIcon,
  ExclamationTriangleIcon,
  ArrowPathIcon,
  ServerIcon,
  CpuChipIcon,
  CircleStackIcon,
  CloudIcon
} from '@heroicons/react/24/outline';

interface SystemConfig {
  paymasterSettings: {
    dailyLimit: string;
    perTransactionLimit: string;
    whitelistEnabled: boolean;
    emergencyPauseEnabled: boolean;
  };
  bundlerSettings: {
    maxBundleSize: number;
    bundleInterval: number;
    priorityFeePerGas: string;
    maxFeePerGas: string;
  };
  gasSettings: {
    exchangeRate: string;
    markupPercentage: number;
    minBalance: string;
    autoRefillEnabled: boolean;
  };
  networkSettings: {
    l2RpcUrl: string;
    celestiaLightNode: string;
    blockConfirmations: number;
    syncInterval: number;
  };
}

interface SystemMetrics {
  cpuUsage: number;
  memoryUsage: number;
  diskUsage: number;
  networkLatency: number;
  uptime: string;
  lastBackup: string;
}

export const AdminSystem: React.FC = () => {
  const [config, setConfig] = useState<SystemConfig>({
    paymasterSettings: {
      dailyLimit: '10000',
      perTransactionLimit: '100',
      whitelistEnabled: true,
      emergencyPauseEnabled: false,
    },
    bundlerSettings: {
      maxBundleSize: 10,
      bundleInterval: 30,
      priorityFeePerGas: '1.5',
      maxFeePerGas: '50',
    },
    gasSettings: {
      exchangeRate: '1.0',
      markupPercentage: 10,
      minBalance: '0.1',
      autoRefillEnabled: true,
    },
    networkSettings: {
      l2RpcUrl: 'http://localhost:8545',
      celestiaLightNode: 'http://localhost:26658',
      blockConfirmations: 3,
      syncInterval: 5,
    },
  });

  const [metrics, setMetrics] = useState<SystemMetrics>({
    cpuUsage: 45,
    memoryUsage: 62,
    diskUsage: 38,
    networkLatency: 23,
    uptime: '15d 7h 23m',
    lastBackup: '2 hours ago',
  });

  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState('paymaster');

  useEffect(() => {
    fetchSystemConfig();
    fetchSystemMetrics();
    
    const interval = setInterval(fetchSystemMetrics, 10000);
    return () => clearInterval(interval);
  }, []);

  const fetchSystemConfig = async () => {
    try {
      const response = await fetch('/api/admin/system/config', {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('authToken')}`,
        },
      });
      if (response.ok) {
        const data = await response.json();
        setConfig(data);
      }
    } catch (error) {
      console.error('Failed to fetch system config:', error);
    }
  };

  const fetchSystemMetrics = async () => {
    try {
      const response = await fetch('/api/admin/system/metrics', {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('authToken')}`,
        },
      });
      if (response.ok) {
        const data = await response.json();
        setMetrics(data);
      }
    } catch (error) {
      console.error('Failed to fetch system metrics:', error);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const response = await fetch('/api/admin/system/config', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('authToken')}`,
        },
        body: JSON.stringify(config),
      });
      
      if (response.ok) {
        // Show success notification
        alert('System configuration updated successfully');
      }
    } catch (error) {
      console.error('Failed to save config:', error);
      alert('Failed to save configuration');
    } finally {
      setSaving(false);
    }
  };

  const handleEmergencyPause = async () => {
    if (!confirm('Are you sure you want to emergency pause the system?')) return;

    try {
      const response = await fetch('/api/admin/system/emergency-pause', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('authToken')}`,
        },
      });
      
      if (response.ok) {
        setConfig(prev => ({
          ...prev,
          paymasterSettings: {
            ...prev.paymasterSettings,
            emergencyPauseEnabled: true,
          },
        }));
        alert('System emergency pause activated');
      }
    } catch (error) {
      console.error('Failed to emergency pause:', error);
    }
  };

  const getUsageColor = (usage: number) => {
    if (usage < 50) return 'bg-green-500';
    if (usage < 80) return 'bg-yellow-500';
    return 'bg-red-500';
  };

  return (
    <div>
      <div className="sm:flex sm:items-center">
        <div className="sm:flex-auto">
          <h1 className="text-2xl font-semibold text-gray-900">System Settings</h1>
          <p className="mt-2 text-sm text-gray-700">
            Configure system parameters and monitor performance
          </p>
        </div>
        <div className="mt-4 sm:mt-0 sm:ml-16 sm:flex-none space-x-3">
          <button
            onClick={handleEmergencyPause}
            disabled={config.paymasterSettings.emergencyPauseEnabled}
            className="inline-flex items-center justify-center rounded-md border border-red-300 bg-white px-4 py-2 text-sm font-medium text-red-700 shadow-sm hover:bg-red-50 disabled:opacity-50"
          >
            <ExclamationTriangleIcon className="h-4 w-4 mr-2" />
            Emergency Pause
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="inline-flex items-center justify-center rounded-md border border-transparent bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700"
          >
            {saving ? (
              <>
                <ArrowPathIcon className="h-4 w-4 mr-2 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <CheckIcon className="h-4 w-4 mr-2" />
                Save Changes
              </>
            )}
          </button>
        </div>
      </div>

      {/* System Metrics */}
      <div className="mt-6 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
        <div className="bg-white overflow-hidden rounded-lg shadow">
          <div className="p-5">
            <div className="flex items-center">
              <CpuChipIcon className="h-8 w-8 text-gray-400" />
              <div className="ml-5 flex-1">
                <dt className="text-sm font-medium text-gray-500">CPU Usage</dt>
                <dd className="mt-1">
                  <div className="flex items-center">
                    <div className="flex-1 bg-gray-200 rounded-full h-2">
                      <div
                        className={`h-2 rounded-full ${getUsageColor(metrics.cpuUsage)}`}
                        style={{ width: `${metrics.cpuUsage}%` }}
                      />
                    </div>
                    <span className="ml-2 text-sm font-medium text-gray-900">
                      {metrics.cpuUsage}%
                    </span>
                  </div>
                </dd>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white overflow-hidden rounded-lg shadow">
          <div className="p-5">
            <div className="flex items-center">
              <ServerIcon className="h-8 w-8 text-gray-400" />
              <div className="ml-5 flex-1">
                <dt className="text-sm font-medium text-gray-500">Memory Usage</dt>
                <dd className="mt-1">
                  <div className="flex items-center">
                    <div className="flex-1 bg-gray-200 rounded-full h-2">
                      <div
                        className={`h-2 rounded-full ${getUsageColor(metrics.memoryUsage)}`}
                        style={{ width: `${metrics.memoryUsage}%` }}
                      />
                    </div>
                    <span className="ml-2 text-sm font-medium text-gray-900">
                      {metrics.memoryUsage}%
                    </span>
                  </div>
                </dd>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white overflow-hidden rounded-lg shadow">
          <div className="p-5">
            <div className="flex items-center">
              <CircleStackIcon className="h-8 w-8 text-gray-400" />
              <div className="ml-5 flex-1">
                <dt className="text-sm font-medium text-gray-500">Disk Usage</dt>
                <dd className="mt-1">
                  <div className="flex items-center">
                    <div className="flex-1 bg-gray-200 rounded-full h-2">
                      <div
                        className={`h-2 rounded-full ${getUsageColor(metrics.diskUsage)}`}
                        style={{ width: `${metrics.diskUsage}%` }}
                      />
                    </div>
                    <span className="ml-2 text-sm font-medium text-gray-900">
                      {metrics.diskUsage}%
                    </span>
                  </div>
                </dd>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white overflow-hidden rounded-lg shadow">
          <div className="p-5">
            <div className="flex items-center">
              <CloudIcon className="h-8 w-8 text-gray-400" />
              <div className="ml-5 flex-1">
                <dt className="text-sm font-medium text-gray-500">Network</dt>
                <dd className="mt-1">
                  <div className="text-lg font-semibold text-gray-900">
                    {metrics.networkLatency}ms
                  </div>
                  <div className="text-xs text-gray-500">latency</div>
                </dd>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-4 text-sm">
        <div className="bg-white rounded-lg shadow p-4">
          <span className="text-gray-500">System Uptime:</span>
          <span className="ml-2 font-medium">{metrics.uptime}</span>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <span className="text-gray-500">Last Backup:</span>
          <span className="ml-2 font-medium">{metrics.lastBackup}</span>
        </div>
      </div>

      {/* Configuration Tabs */}
      <div className="mt-8">
        <div className="border-b border-gray-200">
          <nav className="-mb-px flex space-x-8">
            {['paymaster', 'bundler', 'gas', 'network'].map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`whitespace-nowrap py-2 px-1 border-b-2 font-medium text-sm ${
                  activeTab === tab
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                {tab.charAt(0).toUpperCase() + tab.slice(1)} Settings
              </button>
            ))}
          </nav>
        </div>

        <div className="mt-6 bg-white shadow rounded-lg p-6">
          {activeTab === 'paymaster' && (
            <div className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-gray-700">
                  Daily Limit (USDC)
                </label>
                <input
                  type="number"
                  value={config.paymasterSettings.dailyLimit}
                  onChange={(e) => setConfig({
                    ...config,
                    paymasterSettings: {
                      ...config.paymasterSettings,
                      dailyLimit: e.target.value,
                    },
                  })}
                  className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700">
                  Per Transaction Limit (USDC)
                </label>
                <input
                  type="number"
                  value={config.paymasterSettings.perTransactionLimit}
                  onChange={(e) => setConfig({
                    ...config,
                    paymasterSettings: {
                      ...config.paymasterSettings,
                      perTransactionLimit: e.target.value,
                    },
                  })}
                  className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                />
              </div>

              <div className="flex items-center">
                <input
                  type="checkbox"
                  checked={config.paymasterSettings.whitelistEnabled}
                  onChange={(e) => setConfig({
                    ...config,
                    paymasterSettings: {
                      ...config.paymasterSettings,
                      whitelistEnabled: e.target.checked,
                    },
                  })}
                  className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                />
                <label className="ml-2 block text-sm text-gray-900">
                  Enable whitelist requirement
                </label>
              </div>

              {config.paymasterSettings.emergencyPauseEnabled && (
                <div className="rounded-md bg-red-50 p-4">
                  <div className="flex">
                    <ExclamationTriangleIcon className="h-5 w-5 text-red-400" />
                    <div className="ml-3">
                      <h3 className="text-sm font-medium text-red-800">
                        Emergency Pause Active
                      </h3>
                      <p className="mt-2 text-sm text-red-700">
                        The paymaster is currently paused. No new transactions will be sponsored.
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {activeTab === 'bundler' && (
            <div className="space-y-6">
              <div className="grid grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700">
                    Max Bundle Size
                  </label>
                  <input
                    type="number"
                    value={config.bundlerSettings.maxBundleSize}
                    onChange={(e) => setConfig({
                      ...config,
                      bundlerSettings: {
                        ...config.bundlerSettings,
                        maxBundleSize: parseInt(e.target.value),
                      },
                    })}
                    className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700">
                    Bundle Interval (seconds)
                  </label>
                  <input
                    type="number"
                    value={config.bundlerSettings.bundleInterval}
                    onChange={(e) => setConfig({
                      ...config,
                      bundlerSettings: {
                        ...config.bundlerSettings,
                        bundleInterval: parseInt(e.target.value),
                      },
                    })}
                    className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700">
                    Priority Fee (Gwei)
                  </label>
                  <input
                    type="text"
                    value={config.bundlerSettings.priorityFeePerGas}
                    onChange={(e) => setConfig({
                      ...config,
                      bundlerSettings: {
                        ...config.bundlerSettings,
                        priorityFeePerGas: e.target.value,
                      },
                    })}
                    className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700">
                    Max Fee (Gwei)
                  </label>
                  <input
                    type="text"
                    value={config.bundlerSettings.maxFeePerGas}
                    onChange={(e) => setConfig({
                      ...config,
                      bundlerSettings: {
                        ...config.bundlerSettings,
                        maxFeePerGas: e.target.value,
                      },
                    })}
                    className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                  />
                </div>
              </div>
            </div>
          )}

          {activeTab === 'gas' && (
            <div className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-gray-700">
                  USDC/Gas Exchange Rate
                </label>
                <input
                  type="text"
                  value={config.gasSettings.exchangeRate}
                  onChange={(e) => setConfig({
                    ...config,
                    gasSettings: {
                      ...config.gasSettings,
                      exchangeRate: e.target.value,
                    },
                  })}
                  className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700">
                  Markup Percentage
                </label>
                <input
                  type="number"
                  value={config.gasSettings.markupPercentage}
                  onChange={(e) => setConfig({
                    ...config,
                    gasSettings: {
                      ...config.gasSettings,
                      markupPercentage: parseInt(e.target.value),
                    },
                  })}
                  className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700">
                  Minimum Balance (ETH)
                </label>
                <input
                  type="text"
                  value={config.gasSettings.minBalance}
                  onChange={(e) => setConfig({
                    ...config,
                    gasSettings: {
                      ...config.gasSettings,
                      minBalance: e.target.value,
                    },
                  })}
                  className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                />
              </div>

              <div className="flex items-center">
                <input
                  type="checkbox"
                  checked={config.gasSettings.autoRefillEnabled}
                  onChange={(e) => setConfig({
                    ...config,
                    gasSettings: {
                      ...config.gasSettings,
                      autoRefillEnabled: e.target.checked,
                    },
                  })}
                  className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                />
                <label className="ml-2 block text-sm text-gray-900">
                  Enable automatic balance refill
                </label>
              </div>
            </div>
          )}

          {activeTab === 'network' && (
            <div className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-gray-700">
                  L2 RPC URL
                </label>
                <input
                  type="text"
                  value={config.networkSettings.l2RpcUrl}
                  onChange={(e) => setConfig({
                    ...config,
                    networkSettings: {
                      ...config.networkSettings,
                      l2RpcUrl: e.target.value,
                    },
                  })}
                  className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700">
                  Celestia Light Node URL
                </label>
                <input
                  type="text"
                  value={config.networkSettings.celestiaLightNode}
                  onChange={(e) => setConfig({
                    ...config,
                    networkSettings: {
                      ...config.networkSettings,
                      celestiaLightNode: e.target.value,
                    },
                  })}
                  className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                />
              </div>

              <div className="grid grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700">
                    Block Confirmations
                  </label>
                  <input
                    type="number"
                    value={config.networkSettings.blockConfirmations}
                    onChange={(e) => setConfig({
                      ...config,
                      networkSettings: {
                        ...config.networkSettings,
                        blockConfirmations: parseInt(e.target.value),
                      },
                    })}
                    className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700">
                    Sync Interval (seconds)
                  </label>
                  <input
                    type="number"
                    value={config.networkSettings.syncInterval}
                    onChange={(e) => setConfig({
                      ...config,
                      networkSettings: {
                        ...config.networkSettings,
                        syncInterval: parseInt(e.target.value),
                      },
                    })}
                    className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                  />
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};