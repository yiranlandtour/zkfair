import React, { useState, useEffect } from 'react';
import {
  BellIcon,
  EnvelopeIcon,
  DevicePhoneMobileIcon,
  GlobeAltIcon,
  ChartBarIcon,
  ExclamationTriangleIcon,
  CheckCircleIcon,
  XCircleIcon,
  ArrowPathIcon,
  FunnelIcon,
  MagnifyingGlassIcon
} from '@heroicons/react/24/outline';
import { Line } from 'react-chartjs-2';

interface NotificationStats {
  total: number;
  delivered: number;
  failed: number;
  pending: number;
  byChannel: {
    email: { sent: number; delivered: number; failed: number };
    sms: { sent: number; delivered: number; failed: number };
    push: { sent: number; delivered: number; failed: number };
    webhook: { sent: number; delivered: number; failed: number };
    inApp: { sent: number; delivered: number; failed: number };
  };
}

interface QueueStatus {
  high: { waiting: number; active: number; completed: number; failed: number };
  normal: { waiting: number; active: number; completed: number; failed: number };
  low: { waiting: number; active: number; completed: number; failed: number };
  digest: { waiting: number; active: number; completed: number; failed: number };
}

interface NotificationEvent {
  id: string;
  type: string;
  channel: string;
  recipient: string;
  status: 'pending' | 'delivered' | 'failed';
  timestamp: string;
  error?: string;
  messageId?: string;
}

export const NotificationCenter: React.FC = () => {
  const [stats, setStats] = useState<NotificationStats>({
    total: 0,
    delivered: 0,
    failed: 0,
    pending: 0,
    byChannel: {
      email: { sent: 0, delivered: 0, failed: 0 },
      sms: { sent: 0, delivered: 0, failed: 0 },
      push: { sent: 0, delivered: 0, failed: 0 },
      webhook: { sent: 0, delivered: 0, failed: 0 },
      inApp: { sent: 0, delivered: 0, failed: 0 },
    },
  });

  const [queueStatus, setQueueStatus] = useState<QueueStatus>({
    high: { waiting: 0, active: 0, completed: 0, failed: 0 },
    normal: { waiting: 0, active: 0, completed: 0, failed: 0 },
    low: { waiting: 0, active: 0, completed: 0, failed: 0 },
    digest: { waiting: 0, active: 0, completed: 0, failed: 0 },
  });

  const [recentEvents, setRecentEvents] = useState<NotificationEvent[]>([]);
  const [selectedChannel, setSelectedChannel] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [timeRange, setTimeRange] = useState('24h');
  const [autoRefresh, setAutoRefresh] = useState(true);

  useEffect(() => {
    fetchNotificationStats();
    fetchQueueStatus();
    fetchRecentEvents();

    if (autoRefresh) {
      const interval = setInterval(() => {
        fetchNotificationStats();
        fetchQueueStatus();
        fetchRecentEvents();
      }, 5000);
      return () => clearInterval(interval);
    }
  }, [autoRefresh, selectedChannel, timeRange]);

  const fetchNotificationStats = async () => {
    try {
      const response = await fetch(`/api/admin/notifications/stats?timeRange=${timeRange}`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('authToken')}`,
        },
      });
      if (response.ok) {
        const data = await response.json();
        setStats(data);
      }
    } catch (error) {
      console.error('Failed to fetch notification stats:', error);
    }
  };

  const fetchQueueStatus = async () => {
    try {
      const response = await fetch('/api/notifications/admin/queue-status', {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('authToken')}`,
        },
      });
      if (response.ok) {
        const data = await response.json();
        setQueueStatus(data);
      }
    } catch (error) {
      console.error('Failed to fetch queue status:', error);
    }
  };

  const fetchRecentEvents = async () => {
    try {
      const params = new URLSearchParams({
        limit: '20',
        ...(selectedChannel !== 'all' && { channel: selectedChannel }),
        ...(searchQuery && { search: searchQuery }),
      });
      
      const response = await fetch(`/api/admin/notifications/events?${params}`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('authToken')}`,
        },
      });
      if (response.ok) {
        const data = await response.json();
        setRecentEvents(data);
      }
    } catch (error) {
      console.error('Failed to fetch recent events:', error);
    }
  };

  const sendTestNotification = async (channel: string) => {
    try {
      const response = await fetch('/api/admin/notifications/test', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('authToken')}`,
        },
        body: JSON.stringify({ channel }),
      });
      
      if (response.ok) {
        alert(`Test ${channel} notification sent successfully`);
        fetchRecentEvents();
      }
    } catch (error) {
      console.error('Failed to send test notification:', error);
      alert('Failed to send test notification');
    }
  };

  const retryFailedNotification = async (notificationId: string) => {
    try {
      const response = await fetch(`/api/admin/notifications/retry/${notificationId}`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('authToken')}`,
        },
      });
      
      if (response.ok) {
        fetchRecentEvents();
      }
    } catch (error) {
      console.error('Failed to retry notification:', error);
    }
  };

  const deliveryRateChartData = {
    labels: ['00:00', '04:00', '08:00', '12:00', '16:00', '20:00'],
    datasets: [
      {
        label: 'Delivered',
        data: [95, 94, 96, 97, 95, 96],
        borderColor: 'rgb(34, 197, 94)',
        backgroundColor: 'rgba(34, 197, 94, 0.1)',
        fill: true,
        tension: 0.4,
      },
      {
        label: 'Failed',
        data: [5, 6, 4, 3, 5, 4],
        borderColor: 'rgb(239, 68, 68)',
        backgroundColor: 'rgba(239, 68, 68, 0.1)',
        fill: true,
        tension: 0.4,
      },
    ],
  };

  const chartOptions = {
    responsive: true,
    plugins: {
      legend: {
        position: 'top' as const,
      },
      tooltip: {
        callbacks: {
          label: (context: any) => `${context.parsed.y}%`,
        },
      },
    },
    scales: {
      y: {
        beginAtZero: true,
        max: 100,
        ticks: {
          callback: (value: any) => `${value}%`,
        },
      },
    },
  };

  const getChannelIcon = (channel: string) => {
    switch (channel) {
      case 'email':
        return EnvelopeIcon;
      case 'sms':
        return DevicePhoneMobileIcon;
      case 'push':
        return BellIcon;
      case 'webhook':
        return GlobeAltIcon;
      default:
        return BellIcon;
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'delivered':
        return <CheckCircleIcon className="h-5 w-5 text-green-500" />;
      case 'failed':
        return <XCircleIcon className="h-5 w-5 text-red-500" />;
      default:
        return <ArrowPathIcon className="h-5 w-5 text-yellow-500 animate-spin" />;
    }
  };

  const getDeliveryRate = (channel: any) => {
    const total = channel.sent || 0;
    const delivered = channel.delivered || 0;
    return total > 0 ? Math.round((delivered / total) * 100) : 0;
  };

  return (
    <div>
      <div className="sm:flex sm:items-center">
        <div className="sm:flex-auto">
          <h1 className="text-2xl font-semibold text-gray-900">Notification Center</h1>
          <p className="mt-2 text-sm text-gray-700">
            Monitor and manage notification delivery across all channels
          </p>
        </div>
        <div className="mt-4 sm:mt-0 sm:ml-16 sm:flex-none">
          <div className="flex items-center space-x-3">
            <select
              value={timeRange}
              onChange={(e) => setTimeRange(e.target.value)}
              className="block rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
            >
              <option value="1h">Last Hour</option>
              <option value="24h">Last 24 Hours</option>
              <option value="7d">Last 7 Days</option>
              <option value="30d">Last 30 Days</option>
            </select>
            <button
              onClick={() => setAutoRefresh(!autoRefresh)}
              className={`inline-flex items-center px-3 py-2 border rounded-md text-sm font-medium ${
                autoRefresh
                  ? 'border-green-300 text-green-700 bg-green-50'
                  : 'border-gray-300 text-gray-700 bg-white'
              }`}
            >
              <ArrowPathIcon className={`h-4 w-4 mr-1 ${autoRefresh ? 'animate-spin' : ''}`} />
              {autoRefresh ? 'Auto-refresh ON' : 'Auto-refresh OFF'}
            </button>
          </div>
        </div>
      </div>

      {/* Overall Stats */}
      <div className="mt-6 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
        <div className="bg-white overflow-hidden rounded-lg shadow">
          <div className="p-5">
            <dt className="text-sm font-medium text-gray-500 truncate">Total Sent</dt>
            <dd className="mt-1 text-3xl font-semibold text-gray-900">{stats.total.toLocaleString()}</dd>
          </div>
        </div>
        <div className="bg-white overflow-hidden rounded-lg shadow">
          <div className="p-5">
            <dt className="text-sm font-medium text-gray-500 truncate">Delivered</dt>
            <dd className="mt-1 text-3xl font-semibold text-green-600">{stats.delivered.toLocaleString()}</dd>
            <p className="text-sm text-gray-500">
              {stats.total > 0 ? Math.round((stats.delivered / stats.total) * 100) : 0}% success rate
            </p>
          </div>
        </div>
        <div className="bg-white overflow-hidden rounded-lg shadow">
          <div className="p-5">
            <dt className="text-sm font-medium text-gray-500 truncate">Failed</dt>
            <dd className="mt-1 text-3xl font-semibold text-red-600">{stats.failed.toLocaleString()}</dd>
            <p className="text-sm text-gray-500">
              {stats.total > 0 ? Math.round((stats.failed / stats.total) * 100) : 0}% failure rate
            </p>
          </div>
        </div>
        <div className="bg-white overflow-hidden rounded-lg shadow">
          <div className="p-5">
            <dt className="text-sm font-medium text-gray-500 truncate">Pending</dt>
            <dd className="mt-1 text-3xl font-semibold text-yellow-600">{stats.pending.toLocaleString()}</dd>
          </div>
        </div>
      </div>

      {/* Channel Stats */}
      <div className="mt-8 bg-white shadow rounded-lg">
        <div className="p-6">
          <h3 className="text-lg font-medium text-gray-900 mb-4">Channel Performance</h3>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
            {Object.entries(stats.byChannel).map(([channel, data]) => {
              const Icon = getChannelIcon(channel);
              const deliveryRate = getDeliveryRate(data);
              
              return (
                <div key={channel} className="relative bg-gray-50 rounded-lg p-4">
                  <div className="flex items-center justify-between mb-2">
                    <Icon className="h-5 w-5 text-gray-400" />
                    <button
                      onClick={() => sendTestNotification(channel)}
                      className="text-xs text-blue-600 hover:text-blue-500"
                    >
                      Test
                    </button>
                  </div>
                  <p className="text-sm font-medium text-gray-900 capitalize">{channel}</p>
                  <p className="text-2xl font-semibold text-gray-900">{data.sent}</p>
                  <div className="mt-2">
                    <div className="flex justify-between text-xs">
                      <span className="text-gray-500">Delivery Rate</span>
                      <span className={`font-medium ${
                        deliveryRate >= 95 ? 'text-green-600' : 
                        deliveryRate >= 80 ? 'text-yellow-600' : 'text-red-600'
                      }`}>
                        {deliveryRate}%
                      </span>
                    </div>
                    <div className="mt-1 bg-gray-200 rounded-full h-2">
                      <div
                        className={`h-2 rounded-full ${
                          deliveryRate >= 95 ? 'bg-green-500' : 
                          deliveryRate >= 80 ? 'bg-yellow-500' : 'bg-red-500'
                        }`}
                        style={{ width: `${deliveryRate}%` }}
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Queue Status */}
      <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="bg-white shadow rounded-lg">
          <div className="p-6">
            <h3 className="text-lg font-medium text-gray-900 mb-4">Queue Status</h3>
            <div className="space-y-3">
              {Object.entries(queueStatus).map(([priority, status]) => (
                <div key={priority} className="border rounded-lg p-3">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium text-gray-900 capitalize">{priority} Priority</span>
                    <div className="flex space-x-2 text-xs">
                      <span className="text-yellow-600">⏳ {status.waiting}</span>
                      <span className="text-blue-600">▶ {status.active}</span>
                      <span className="text-green-600">✓ {status.completed}</span>
                      <span className="text-red-600">✗ {status.failed}</span>
                    </div>
                  </div>
                  <div className="flex h-2 space-x-1">
                    <div 
                      className="bg-yellow-500 rounded-l"
                      style={{ width: `${(status.waiting / (status.waiting + status.active + status.completed + status.failed)) * 100}%` }}
                    />
                    <div 
                      className="bg-blue-500"
                      style={{ width: `${(status.active / (status.waiting + status.active + status.completed + status.failed)) * 100}%` }}
                    />
                    <div 
                      className="bg-green-500"
                      style={{ width: `${(status.completed / (status.waiting + status.active + status.completed + status.failed)) * 100}%` }}
                    />
                    <div 
                      className="bg-red-500 rounded-r"
                      style={{ width: `${(status.failed / (status.waiting + status.active + status.completed + status.failed)) * 100}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="bg-white shadow rounded-lg">
          <div className="p-6">
            <h3 className="text-lg font-medium text-gray-900 mb-4">Delivery Rate Trend</h3>
            <Line data={deliveryRateChartData} options={chartOptions} />
          </div>
        </div>
      </div>

      {/* Recent Events */}
      <div className="mt-8 bg-white shadow rounded-lg">
        <div className="p-6">
          <div className="sm:flex sm:items-center">
            <div className="sm:flex-auto">
              <h3 className="text-lg font-medium text-gray-900">Recent Notification Events</h3>
            </div>
            <div className="mt-4 sm:mt-0 sm:ml-16 sm:flex-none">
              <div className="flex space-x-3">
                <div className="relative">
                  <MagnifyingGlassIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <input
                    type="text"
                    placeholder="Search recipients..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-10 pr-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
                <select
                  value={selectedChannel}
                  onChange={(e) => setSelectedChannel(e.target.value)}
                  className="block rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                >
                  <option value="all">All Channels</option>
                  <option value="email">Email</option>
                  <option value="sms">SMS</option>
                  <option value="push">Push</option>
                  <option value="webhook">Webhook</option>
                  <option value="inApp">In-App</option>
                </select>
              </div>
            </div>
          </div>

          <div className="mt-6 overflow-hidden">
            <table className="min-w-full divide-y divide-gray-200">
              <thead>
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Type
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Channel
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Recipient
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Time
                  </th>
                  <th className="relative px-6 py-3">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {recentEvents.map((event) => {
                  const Icon = getChannelIcon(event.channel);
                  return (
                    <tr key={event.id}>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {getStatusIcon(event.status)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {event.type}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center">
                          <Icon className="h-4 w-4 text-gray-400 mr-2" />
                          <span className="text-sm text-gray-900 capitalize">{event.channel}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {event.recipient}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {new Date(event.timestamp).toLocaleString()}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                        {event.status === 'failed' && (
                          <button
                            onClick={() => retryFailedNotification(event.id)}
                            className="text-blue-600 hover:text-blue-900"
                          >
                            Retry
                          </button>
                        )}
                        {event.messageId && (
                          <span className="text-xs text-gray-500 ml-2">
                            ID: {event.messageId.substring(0, 8)}...
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};