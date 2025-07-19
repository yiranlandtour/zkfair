import React, { useState, useEffect } from 'react';
import {
  BellIcon,
  BellAlertIcon,
  PlusIcon,
  PencilIcon,
  TrashIcon,
  CheckIcon,
  XMarkIcon,
  FunnelIcon,
  EnvelopeIcon,
  DevicePhoneMobileIcon,
  ChatBubbleLeftIcon,
  ChevronDownIcon
} from '@heroicons/react/24/outline';

interface AlertRule {
  id: string;
  name: string;
  description: string;
  type: 'threshold' | 'anomaly' | 'pattern';
  metric: string;
  condition: string;
  threshold?: number;
  timeWindow?: string;
  severity: 'info' | 'warning' | 'error' | 'critical';
  enabled: boolean;
  channels: string[];
  lastTriggered?: string;
  triggerCount: number;
}

interface NotificationChannel {
  id: string;
  name: string;
  type: 'email' | 'sms' | 'slack' | 'webhook';
  config: any;
  enabled: boolean;
  createdAt: string;
}

export const AdminAlerts: React.FC = () => {
  const [alertRules, setAlertRules] = useState<AlertRule[]>([]);
  const [channels, setChannels] = useState<NotificationChannel[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateRule, setShowCreateRule] = useState(false);
  const [showCreateChannel, setShowCreateChannel] = useState(false);
  const [editingRule, setEditingRule] = useState<AlertRule | null>(null);
  const [filter, setFilter] = useState({
    severity: 'all',
    status: 'all',
  });

  useEffect(() => {
    fetchAlertRules();
    fetchChannels();
  }, []);

  const fetchAlertRules = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/admin/alerts/rules', {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('authToken')}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        setAlertRules(data.rules);
      }
    } catch (error) {
      console.error('Failed to fetch alert rules:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchChannels = async () => {
    try {
      const response = await fetch('/api/admin/alerts/channels', {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('authToken')}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        setChannels(data.channels);
      }
    } catch (error) {
      console.error('Failed to fetch channels:', error);
    }
  };

  const toggleRule = async (ruleId: string, enabled: boolean) => {
    try {
      const response = await fetch(`/api/admin/alerts/rules/${ruleId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('authToken')}`,
        },
        body: JSON.stringify({ enabled }),
      });

      if (response.ok) {
        setAlertRules(rules =>
          rules.map(rule =>
            rule.id === ruleId ? { ...rule, enabled } : rule
          )
        );
      }
    } catch (error) {
      console.error('Failed to toggle rule:', error);
    }
  };

  const deleteRule = async (ruleId: string) => {
    if (!confirm('Are you sure you want to delete this alert rule?')) return;

    try {
      const response = await fetch(`/api/admin/alerts/rules/${ruleId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('authToken')}`,
        },
      });

      if (response.ok) {
        setAlertRules(rules => rules.filter(rule => rule.id !== ruleId));
      }
    } catch (error) {
      console.error('Failed to delete rule:', error);
    }
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'critical':
        return 'text-red-600 bg-red-100';
      case 'error':
        return 'text-orange-600 bg-orange-100';
      case 'warning':
        return 'text-yellow-600 bg-yellow-100';
      case 'info':
        return 'text-blue-600 bg-blue-100';
      default:
        return 'text-gray-600 bg-gray-100';
    }
  };

  const getChannelIcon = (type: string) => {
    switch (type) {
      case 'email':
        return <EnvelopeIcon className="h-5 w-5" />;
      case 'sms':
        return <DevicePhoneMobileIcon className="h-5 w-5" />;
      case 'slack':
        return <ChatBubbleLeftIcon className="h-5 w-5" />;
      default:
        return <BellIcon className="h-5 w-5" />;
    }
  };

  // Mock data for development
  useEffect(() => {
    if (alertRules.length === 0 && !loading) {
      setAlertRules([
        {
          id: '1',
          name: 'High Transaction Failure Rate',
          description: 'Alert when transaction failure rate exceeds 10%',
          type: 'threshold',
          metric: 'transaction_failure_rate',
          condition: 'greater_than',
          threshold: 10,
          timeWindow: '5m',
          severity: 'critical',
          enabled: true,
          channels: ['email', 'slack'],
          lastTriggered: '2024-01-20T10:30:00Z',
          triggerCount: 3,
        },
        {
          id: '2',
          name: 'Low Paymaster Balance',
          description: 'Alert when paymaster balance falls below 100 ETH',
          type: 'threshold',
          metric: 'paymaster_balance',
          condition: 'less_than',
          threshold: 100,
          severity: 'warning',
          enabled: true,
          channels: ['email'],
          triggerCount: 1,
        },
        {
          id: '3',
          name: 'Unusual Gas Spike',
          description: 'Detect anomalous gas price increases',
          type: 'anomaly',
          metric: 'gas_price',
          condition: 'anomaly_detection',
          severity: 'warning',
          enabled: false,
          channels: ['slack'],
          triggerCount: 0,
        },
      ]);

      setChannels([
        {
          id: 'email',
          name: 'Email Notifications',
          type: 'email',
          config: { recipients: ['alerts@zkfair.com'] },
          enabled: true,
          createdAt: '2024-01-01T00:00:00Z',
        },
        {
          id: 'slack',
          name: 'Slack #alerts',
          type: 'slack',
          config: { webhook: 'https://hooks.slack.com/...' },
          enabled: true,
          createdAt: '2024-01-01T00:00:00Z',
        },
      ]);
    }
  }, [alertRules, loading]);

  const filteredRules = alertRules.filter(rule => {
    if (filter.severity !== 'all' && rule.severity !== filter.severity) return false;
    if (filter.status === 'enabled' && !rule.enabled) return false;
    if (filter.status === 'disabled' && rule.enabled) return false;
    return true;
  });

  return (
    <div>
      <div className="sm:flex sm:items-center">
        <div className="sm:flex-auto">
          <h1 className="text-2xl font-semibold text-gray-900">Alert Management</h1>
          <p className="mt-2 text-sm text-gray-700">
            Configure alert rules and notification channels
          </p>
        </div>
        <div className="mt-4 sm:mt-0 sm:ml-16 sm:flex-none space-x-3">
          <button
            onClick={() => setShowCreateChannel(true)}
            className="inline-flex items-center justify-center rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50"
          >
            <PlusIcon className="h-4 w-4 mr-2" />
            Add Channel
          </button>
          <button
            onClick={() => setShowCreateRule(true)}
            className="inline-flex items-center justify-center rounded-md border border-transparent bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700"
          >
            <PlusIcon className="h-4 w-4 mr-2" />
            Create Rule
          </button>
        </div>
      </div>

      {/* Alert Statistics */}
      <div className="mt-6 grid grid-cols-1 gap-5 sm:grid-cols-4">
        <div className="bg-white overflow-hidden rounded-lg shadow">
          <div className="p-5">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <BellIcon className="h-8 w-8 text-blue-400" />
              </div>
              <div className="ml-5 w-0 flex-1">
                <dl>
                  <dt className="text-sm font-medium text-gray-500 truncate">Total Rules</dt>
                  <dd className="text-2xl font-semibold text-gray-900">{alertRules.length}</dd>
                </dl>
              </div>
            </div>
          </div>
        </div>
        <div className="bg-white overflow-hidden rounded-lg shadow">
          <div className="p-5">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <CheckIcon className="h-8 w-8 text-green-400" />
              </div>
              <div className="ml-5 w-0 flex-1">
                <dl>
                  <dt className="text-sm font-medium text-gray-500 truncate">Active Rules</dt>
                  <dd className="text-2xl font-semibold text-gray-900">
                    {alertRules.filter(r => r.enabled).length}
                  </dd>
                </dl>
              </div>
            </div>
          </div>
        </div>
        <div className="bg-white overflow-hidden rounded-lg shadow">
          <div className="p-5">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <BellAlertIcon className="h-8 w-8 text-yellow-400" />
              </div>
              <div className="ml-5 w-0 flex-1">
                <dl>
                  <dt className="text-sm font-medium text-gray-500 truncate">Triggered (24h)</dt>
                  <dd className="text-2xl font-semibold text-gray-900">23</dd>
                </dl>
              </div>
            </div>
          </div>
        </div>
        <div className="bg-white overflow-hidden rounded-lg shadow">
          <div className="p-5">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <EnvelopeIcon className="h-8 w-8 text-purple-400" />
              </div>
              <div className="ml-5 w-0 flex-1">
                <dl>
                  <dt className="text-sm font-medium text-gray-500 truncate">Channels</dt>
                  <dd className="text-2xl font-semibold text-gray-900">{channels.length}</dd>
                </dl>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Notification Channels */}
      <div className="mt-8 bg-white shadow rounded-lg">
        <div className="px-4 py-5 sm:px-6">
          <h3 className="text-lg font-medium text-gray-900">Notification Channels</h3>
        </div>
        <div className="border-t border-gray-200">
          <ul className="divide-y divide-gray-200">
            {channels.map((channel) => (
              <li key={channel.id} className="px-4 py-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center">
                    <div className="flex-shrink-0 text-gray-400">
                      {getChannelIcon(channel.type)}
                    </div>
                    <div className="ml-3">
                      <p className="text-sm font-medium text-gray-900">{channel.name}</p>
                      <p className="text-sm text-gray-500">Type: {channel.type}</p>
                    </div>
                  </div>
                  <div className="flex items-center space-x-2">
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                      channel.enabled ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
                    }`}>
                      {channel.enabled ? 'Active' : 'Inactive'}
                    </span>
                    <button className="text-gray-400 hover:text-gray-600">
                      <PencilIcon className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* Filters */}
      <div className="mt-8 flex items-center space-x-4">
        <FunnelIcon className="h-5 w-5 text-gray-400" />
        <select
          value={filter.severity}
          onChange={(e) => setFilter({ ...filter, severity: e.target.value })}
          className="rounded-md border-gray-300 text-sm"
        >
          <option value="all">All Severities</option>
          <option value="critical">Critical</option>
          <option value="error">Error</option>
          <option value="warning">Warning</option>
          <option value="info">Info</option>
        </select>
        <select
          value={filter.status}
          onChange={(e) => setFilter({ ...filter, status: e.target.value })}
          className="rounded-md border-gray-300 text-sm"
        >
          <option value="all">All Status</option>
          <option value="enabled">Enabled</option>
          <option value="disabled">Disabled</option>
        </select>
      </div>

      {/* Alert Rules */}
      <div className="mt-6 bg-white shadow rounded-lg overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Rule
              </th>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Condition
              </th>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Severity
              </th>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Channels
              </th>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Last Triggered
              </th>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Status
              </th>
              <th scope="col" className="relative px-6 py-3">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {loading ? (
              <tr>
                <td colSpan={7} className="text-center py-8 text-gray-500">
                  Loading...
                </td>
              </tr>
            ) : filteredRules.length === 0 ? (
              <tr>
                <td colSpan={7} className="text-center py-8 text-gray-500">
                  No alert rules found
                </td>
              </tr>
            ) : (
              filteredRules.map((rule) => (
                <tr key={rule.id}>
                  <td className="px-6 py-4">
                    <div>
                      <div className="text-sm font-medium text-gray-900">{rule.name}</div>
                      <div className="text-sm text-gray-500">{rule.description}</div>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-900">
                      {rule.metric} {rule.condition} {rule.threshold}
                      {rule.timeWindow && ` (${rule.timeWindow})`}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getSeverityColor(rule.severity)}`}>
                      {rule.severity}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center space-x-1">
                      {rule.channels.map((channelId) => {
                        const channel = channels.find(c => c.id === channelId);
                        return channel ? (
                          <span key={channelId} className="text-gray-400">
                            {getChannelIcon(channel.type)}
                          </span>
                        ) : null;
                      })}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {rule.lastTriggered ? (
                      <div>
                        <div>{new Date(rule.lastTriggered).toLocaleDateString()}</div>
                        <div className="text-xs">{rule.triggerCount} times</div>
                      </div>
                    ) : (
                      'Never'
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <button
                      onClick={() => toggleRule(rule.id, !rule.enabled)}
                      className={`relative inline-flex items-center h-6 rounded-full w-11 ${
                        rule.enabled ? 'bg-blue-600' : 'bg-gray-200'
                      }`}
                    >
                      <span
                        className={`inline-block w-4 h-4 transform rounded-full bg-white transition ${
                          rule.enabled ? 'translate-x-6' : 'translate-x-1'
                        }`}
                      />
                    </button>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                    <button
                      onClick={() => setEditingRule(rule)}
                      className="text-blue-600 hover:text-blue-900 mr-3"
                    >
                      <PencilIcon className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => deleteRule(rule.id)}
                      className="text-red-600 hover:text-red-900"
                    >
                      <TrashIcon className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Recent Alerts */}
      <div className="mt-8 bg-white shadow rounded-lg">
        <div className="px-4 py-5 sm:px-6">
          <h3 className="text-lg font-medium text-gray-900">Recent Alerts</h3>
        </div>
        <div className="border-t border-gray-200">
          <ul className="divide-y divide-gray-200">
            <li className="px-4 py-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-900">High Transaction Failure Rate</p>
                  <p className="text-sm text-gray-500">Transaction failure rate reached 12% (threshold: 10%)</p>
                  <p className="text-xs text-gray-400 mt-1">10 minutes ago</p>
                </div>
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
                  critical
                </span>
              </div>
            </li>
            <li className="px-4 py-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-900">Low Paymaster Balance</p>
                  <p className="text-sm text-gray-500">Paymaster balance: 95 ETH (threshold: 100 ETH)</p>
                  <p className="text-xs text-gray-400 mt-1">2 hours ago</p>
                </div>
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
                  warning
                </span>
              </div>
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
};