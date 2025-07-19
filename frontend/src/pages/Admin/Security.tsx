import React, { useState, useEffect } from 'react';
import {
  ShieldCheckIcon,
  ExclamationTriangleIcon,
  XCircleIcon,
  CheckCircleIcon,
  ClockIcon,
  LockClosedIcon,
  KeyIcon,
  FingerPrintIcon,
  UserGroupIcon,
  ChevronRightIcon
} from '@heroicons/react/24/outline';

interface SecurityEvent {
  id: string;
  type: 'auth_failure' | 'rate_limit' | 'suspicious_activity' | 'access_denied' | 'contract_pause';
  severity: 'low' | 'medium' | 'high' | 'critical';
  title: string;
  description: string;
  source: string;
  timestamp: string;
  status: 'open' | 'investigating' | 'resolved';
  affectedUsers?: number;
}

interface SecurityMetric {
  label: string;
  value: number;
  change: number;
  status: 'good' | 'warning' | 'critical';
}

export const AdminSecurity: React.FC = () => {
  const [events, setEvents] = useState<SecurityEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedEvent, setSelectedEvent] = useState<SecurityEvent | null>(null);
  const [timeFilter, setTimeFilter] = useState('24h');
  const [severityFilter, setSeverityFilter] = useState('all');

  useEffect(() => {
    fetchSecurityEvents();
    const interval = setInterval(fetchSecurityEvents, 30000); // Refresh every 30s
    return () => clearInterval(interval);
  }, [timeFilter, severityFilter]);

  const fetchSecurityEvents = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        timeRange: timeFilter,
        severity: severityFilter,
      });

      const response = await fetch(`/api/admin/security/events?${params}`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('authToken')}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        setEvents(data.events);
      }
    } catch (error) {
      console.error('Failed to fetch security events:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleResolveEvent = async (eventId: string) => {
    try {
      const response = await fetch(`/api/admin/security/events/${eventId}/resolve`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('authToken')}`,
        },
      });

      if (response.ok) {
        fetchSecurityEvents();
      }
    } catch (error) {
      console.error('Failed to resolve event:', error);
    }
  };

  const securityMetrics: SecurityMetric[] = [
    { label: 'Failed Auth Attempts', value: 23, change: -15, status: 'good' },
    { label: 'Rate Limit Hits', value: 156, change: 12, status: 'warning' },
    { label: 'Blocked IPs', value: 8, change: 2, status: 'warning' },
    { label: 'Active Sessions', value: 342, change: 5, status: 'good' },
  ];

  const getSeverityIcon = (severity: string) => {
    switch (severity) {
      case 'critical':
        return <XCircleIcon className="h-5 w-5 text-red-600" />;
      case 'high':
        return <ExclamationTriangleIcon className="h-5 w-5 text-orange-600" />;
      case 'medium':
        return <ExclamationTriangleIcon className="h-5 w-5 text-yellow-600" />;
      case 'low':
        return <CheckCircleIcon className="h-5 w-5 text-blue-600" />;
      default:
        return null;
    }
  };

  const getSeverityBadge = (severity: string) => {
    const colors = {
      critical: 'bg-red-100 text-red-800',
      high: 'bg-orange-100 text-orange-800',
      medium: 'bg-yellow-100 text-yellow-800',
      low: 'bg-blue-100 text-blue-800',
    };

    return (
      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${colors[severity as keyof typeof colors]}`}>
        {severity.charAt(0).toUpperCase() + severity.slice(1)}
      </span>
    );
  };

  const getStatusBadge = (status: string) => {
    const colors = {
      open: 'bg-red-100 text-red-800',
      investigating: 'bg-yellow-100 text-yellow-800',
      resolved: 'bg-green-100 text-green-800',
    };

    return (
      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${colors[status as keyof typeof colors]}`}>
        {status.charAt(0).toUpperCase() + status.slice(1)}
      </span>
    );
  };

  // Mock data for development
  useEffect(() => {
    if (events.length === 0 && !loading) {
      setEvents([
        {
          id: '1',
          type: 'auth_failure',
          severity: 'medium',
          title: 'Multiple failed login attempts',
          description: 'Detected 15 failed login attempts from IP 192.168.1.100',
          source: '192.168.1.100',
          timestamp: '2024-01-20T15:30:00Z',
          status: 'open',
          affectedUsers: 1,
        },
        {
          id: '2',
          type: 'rate_limit',
          severity: 'low',
          title: 'Rate limit exceeded',
          description: 'API rate limit exceeded for user 0x1234...5678',
          source: '0x1234567890123456789012345678901234567890',
          timestamp: '2024-01-20T14:45:00Z',
          status: 'resolved',
        },
        {
          id: '3',
          type: 'suspicious_activity',
          severity: 'high',
          title: 'Unusual transaction pattern detected',
          description: 'Multiple high-value transactions in short time period',
          source: '0x2345678901234567890123456789012345678901',
          timestamp: '2024-01-20T13:00:00Z',
          status: 'investigating',
          affectedUsers: 3,
        },
      ]);
    }
  }, [events, loading]);

  return (
    <div>
      <div className="sm:flex sm:items-center">
        <div className="sm:flex-auto">
          <h1 className="text-2xl font-semibold text-gray-900">Security Monitor</h1>
          <p className="mt-2 text-sm text-gray-700">
            Real-time security monitoring and threat detection
          </p>
        </div>
        <div className="mt-4 sm:mt-0 sm:ml-16 sm:flex-none space-x-3">
          <select
            value={timeFilter}
            onChange={(e) => setTimeFilter(e.target.value)}
            className="inline-flex rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50"
          >
            <option value="1h">Last Hour</option>
            <option value="24h">Last 24 Hours</option>
            <option value="7d">Last 7 Days</option>
            <option value="30d">Last 30 Days</option>
          </select>
          <select
            value={severityFilter}
            onChange={(e) => setSeverityFilter(e.target.value)}
            className="inline-flex rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50"
          >
            <option value="all">All Severities</option>
            <option value="critical">Critical</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>
        </div>
      </div>

      {/* Security Status Overview */}
      <div className="mt-6 bg-white rounded-lg shadow p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-medium text-gray-900">Security Status</h2>
          <div className="flex items-center">
            <ShieldCheckIcon className="h-5 w-5 text-green-500 mr-2" />
            <span className="text-sm font-medium text-green-600">System Secure</span>
          </div>
        </div>
        
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {securityMetrics.map((metric) => (
            <div key={metric.label} className="bg-gray-50 rounded-lg p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-500">{metric.label}</p>
                  <p className="mt-1 text-2xl font-semibold text-gray-900">{metric.value}</p>
                </div>
                <div className={`text-sm font-medium ${
                  metric.change < 0 ? 'text-green-600' : 'text-red-600'
                }`}>
                  {metric.change > 0 ? '+' : ''}{metric.change}%
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Active Threats */}
      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <div className="bg-white shadow rounded-lg">
            <div className="px-4 py-5 sm:px-6">
              <h3 className="text-lg font-medium text-gray-900">Security Events</h3>
            </div>
            <div className="border-t border-gray-200">
              {loading ? (
                <div className="px-4 py-8 text-center text-gray-500">Loading...</div>
              ) : events.length === 0 ? (
                <div className="px-4 py-8 text-center text-gray-500">No security events found</div>
              ) : (
                <ul className="divide-y divide-gray-200">
                  {events.map((event) => (
                    <li key={event.id} className="hover:bg-gray-50">
                      <button
                        onClick={() => setSelectedEvent(event)}
                        className="w-full px-4 py-4 text-left"
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center">
                            {getSeverityIcon(event.severity)}
                            <div className="ml-3">
                              <p className="text-sm font-medium text-gray-900">{event.title}</p>
                              <p className="text-sm text-gray-500">{event.description}</p>
                              <div className="mt-1 flex items-center space-x-4 text-xs text-gray-500">
                                <span>{new Date(event.timestamp).toLocaleString()}</span>
                                <span>•</span>
                                <span>Source: {event.source.length > 20 ? event.source.slice(0, 6) + '...' + event.source.slice(-4) : event.source}</span>
                                {event.affectedUsers && (
                                  <>
                                    <span>•</span>
                                    <span>{event.affectedUsers} users affected</span>
                                  </>
                                )}
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center space-x-2">
                            {getSeverityBadge(event.severity)}
                            {getStatusBadge(event.status)}
                            <ChevronRightIcon className="h-5 w-5 text-gray-400" />
                          </div>
                        </div>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>

        {/* Security Controls */}
        <div className="space-y-6">
          <div className="bg-white shadow rounded-lg p-6">
            <h3 className="text-lg font-medium text-gray-900 mb-4">Quick Actions</h3>
            <div className="space-y-3">
              <button className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 rounded-lg hover:bg-gray-100">
                <div className="flex items-center">
                  <LockClosedIcon className="h-5 w-5 text-gray-600 mr-3" />
                  <span className="text-sm font-medium text-gray-900">Emergency Pause</span>
                </div>
                <ChevronRightIcon className="h-5 w-5 text-gray-400" />
              </button>
              <button className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 rounded-lg hover:bg-gray-100">
                <div className="flex items-center">
                  <KeyIcon className="h-5 w-5 text-gray-600 mr-3" />
                  <span className="text-sm font-medium text-gray-900">Rotate Keys</span>
                </div>
                <ChevronRightIcon className="h-5 w-5 text-gray-400" />
              </button>
              <button className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 rounded-lg hover:bg-gray-100">
                <div className="flex items-center">
                  <FingerPrintIcon className="h-5 w-5 text-gray-600 mr-3" />
                  <span className="text-sm font-medium text-gray-900">Force 2FA</span>
                </div>
                <ChevronRightIcon className="h-5 w-5 text-gray-400" />
              </button>
              <button className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 rounded-lg hover:bg-gray-100">
                <div className="flex items-center">
                  <UserGroupIcon className="h-5 w-5 text-gray-600 mr-3" />
                  <span className="text-sm font-medium text-gray-900">Revoke Sessions</span>
                </div>
                <ChevronRightIcon className="h-5 w-5 text-gray-400" />
              </button>
            </div>
          </div>

          <div className="bg-white shadow rounded-lg p-6">
            <h3 className="text-lg font-medium text-gray-900 mb-4">Security Policies</h3>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600">Max Login Attempts</span>
                <span className="text-sm font-medium text-gray-900">5</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600">Session Timeout</span>
                <span className="text-sm font-medium text-gray-900">30 min</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600">IP Whitelist</span>
                <span className="text-sm font-medium text-green-600">Enabled</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600">2FA Required</span>
                <span className="text-sm font-medium text-green-600">Admins Only</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Recent Activity */}
      <div className="mt-6 bg-white shadow rounded-lg">
        <div className="px-4 py-5 sm:px-6">
          <h3 className="text-lg font-medium text-gray-900">Recent Admin Activity</h3>
        </div>
        <div className="border-t border-gray-200">
          <ul className="divide-y divide-gray-200">
            <li className="px-4 py-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-900">Admin user suspended account 0x1234...5678</p>
                  <p className="text-xs text-gray-500">admin@zkfair.com • 5 minutes ago</p>
                </div>
              </div>
            </li>
            <li className="px-4 py-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-900">System configuration updated: Rate limits increased</p>
                  <p className="text-xs text-gray-500">admin@zkfair.com • 1 hour ago</p>
                </div>
              </div>
            </li>
            <li className="px-4 py-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-900">Emergency pause activated and resolved</p>
                  <p className="text-xs text-gray-500">security@zkfair.com • 3 hours ago</p>
                </div>
              </div>
            </li>
          </ul>
        </div>
      </div>

      {/* Event Details Modal */}
      {selectedEvent && (
        <div className="fixed inset-0 bg-gray-500 bg-opacity-75 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-medium text-gray-900">Security Event Details</h3>
                <button
                  onClick={() => setSelectedEvent(null)}
                  className="text-gray-400 hover:text-gray-500"
                >
                  <XCircleIcon className="h-6 w-6" />
                </button>
              </div>
              
              <div className="space-y-4">
                <div className="flex items-center space-x-2">
                  {getSeverityIcon(selectedEvent.severity)}
                  <span className="text-lg font-medium">{selectedEvent.title}</span>
                </div>
                
                <div className="flex space-x-2">
                  {getSeverityBadge(selectedEvent.severity)}
                  {getStatusBadge(selectedEvent.status)}
                </div>
                
                <div>
                  <dt className="text-sm font-medium text-gray-500">Description</dt>
                  <dd className="mt-1 text-sm text-gray-900">{selectedEvent.description}</dd>
                </div>
                
                <div>
                  <dt className="text-sm font-medium text-gray-500">Source</dt>
                  <dd className="mt-1 text-sm text-gray-900 font-mono">{selectedEvent.source}</dd>
                </div>
                
                <div>
                  <dt className="text-sm font-medium text-gray-500">Timestamp</dt>
                  <dd className="mt-1 text-sm text-gray-900">{new Date(selectedEvent.timestamp).toLocaleString()}</dd>
                </div>
                
                {selectedEvent.affectedUsers && (
                  <div>
                    <dt className="text-sm font-medium text-gray-500">Affected Users</dt>
                    <dd className="mt-1 text-sm text-gray-900">{selectedEvent.affectedUsers}</dd>
                  </div>
                )}
                
                <div className="pt-4 flex space-x-3">
                  {selectedEvent.status !== 'resolved' && (
                    <button
                      onClick={() => {
                        handleResolveEvent(selectedEvent.id);
                        setSelectedEvent(null);
                      }}
                      className="flex-1 inline-flex justify-center rounded-md border border-transparent bg-green-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-green-700"
                    >
                      Mark as Resolved
                    </button>
                  )}
                  <button
                    onClick={() => setSelectedEvent(null)}
                    className="flex-1 inline-flex justify-center rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50"
                  >
                    Close
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};