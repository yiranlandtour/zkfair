import React, { useState, useEffect } from 'react';
import { 
  UserGroupIcon, 
  CubeTransparentIcon,
  DocumentTextIcon,
  BanknotesIcon,
  ArrowUpIcon,
  ArrowDownIcon,
  ExclamationTriangleIcon
} from '@heroicons/react/24/outline';
import { Line, Bar } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend,
  Filler
} from 'chart.js';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend,
  Filler
);

interface Stat {
  name: string;
  value: string;
  change: string;
  changeType: 'increase' | 'decrease';
  icon: React.ComponentType<{ className?: string }>;
}

interface SystemHealth {
  service: string;
  status: 'healthy' | 'warning' | 'error';
  uptime: string;
  lastCheck: string;
}

export const AdminDashboard: React.FC = () => {
  const [stats, setStats] = useState<Stat[]>([
    {
      name: 'Total Users',
      value: '12,345',
      change: '+4.75%',
      changeType: 'increase',
      icon: UserGroupIcon,
    },
    {
      name: 'Smart Wallets',
      value: '8,234',
      change: '+12.3%',
      changeType: 'increase',
      icon: CubeTransparentIcon,
    },
    {
      name: 'Transactions (24h)',
      value: '45,678',
      change: '-2.1%',
      changeType: 'decrease',
      icon: DocumentTextIcon,
    },
    {
      name: 'Total Value Locked',
      value: '$12.4M',
      change: '+8.9%',
      changeType: 'increase',
      icon: BanknotesIcon,
    },
  ]);

  const [systemHealth, setSystemHealth] = useState<SystemHealth[]>([
    { service: 'API Server', status: 'healthy', uptime: '99.9%', lastCheck: '2 min ago' },
    { service: 'WebSocket Server', status: 'healthy', uptime: '99.8%', lastCheck: '1 min ago' },
    { service: 'Bundler Service', status: 'healthy', uptime: '99.7%', lastCheck: '3 min ago' },
    { service: 'CDK Node', status: 'warning', uptime: '98.5%', lastCheck: '1 min ago' },
    { service: 'Database', status: 'healthy', uptime: '99.99%', lastCheck: '1 min ago' },
    { service: 'Redis Cache', status: 'healthy', uptime: '99.95%', lastCheck: '2 min ago' },
  ]);

  const [recentAlerts] = useState([
    { id: 1, type: 'warning', message: 'High gas prices detected', time: '15 min ago' },
    { id: 2, type: 'info', message: 'System backup completed', time: '1 hour ago' },
    { id: 3, type: 'error', message: 'Failed transaction: insufficient paymaster funds', time: '2 hours ago' },
  ]);

  // Chart data
  const transactionChartData = {
    labels: ['00:00', '04:00', '08:00', '12:00', '16:00', '20:00', '24:00'],
    datasets: [
      {
        label: 'Transactions',
        data: [1200, 1900, 3000, 5000, 4200, 3100, 2400],
        borderColor: 'rgb(59, 130, 246)',
        backgroundColor: 'rgba(59, 130, 246, 0.1)',
        fill: true,
        tension: 0.4,
      },
    ],
  };

  const gasUsageChartData = {
    labels: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
    datasets: [
      {
        label: 'Native Gas',
        data: [12, 19, 15, 25, 22, 30, 28],
        backgroundColor: 'rgba(59, 130, 246, 0.8)',
      },
      {
        label: 'Stablecoin Gas',
        data: [28, 35, 40, 45, 50, 48, 52],
        backgroundColor: 'rgba(34, 197, 94, 0.8)',
      },
    ],
  };

  const chartOptions = {
    responsive: true,
    plugins: {
      legend: {
        position: 'top' as const,
      },
    },
    scales: {
      y: {
        beginAtZero: true,
      },
    },
  };

  useEffect(() => {
    // Fetch real data from API
    const fetchDashboardData = async () => {
      try {
        const response = await fetch('/api/admin/dashboard', {
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('authToken')}`,
          },
        });
        if (response.ok) {
          const data = await response.json();
          // Update state with real data
        }
      } catch (error) {
        console.error('Failed to fetch dashboard data:', error);
      }
    };

    fetchDashboardData();
    const interval = setInterval(fetchDashboardData, 30000); // Refresh every 30 seconds

    return () => clearInterval(interval);
  }, []);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'healthy':
        return 'bg-green-100 text-green-800';
      case 'warning':
        return 'bg-yellow-100 text-yellow-800';
      case 'error':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const getAlertIcon = (type: string) => {
    switch (type) {
      case 'error':
        return 'text-red-500';
      case 'warning':
        return 'text-yellow-500';
      default:
        return 'text-blue-500';
    }
  };

  return (
    <div>
      <h1 className="text-2xl font-semibold text-gray-900">Dashboard</h1>
      
      {/* Stats Grid */}
      <div className="mt-6 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => (
          <div key={stat.name} className="bg-white overflow-hidden rounded-lg shadow">
            <div className="p-5">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <stat.icon className="h-6 w-6 text-gray-400" />
                </div>
                <div className="ml-5 w-0 flex-1">
                  <dl>
                    <dt className="text-sm font-medium text-gray-500 truncate">{stat.name}</dt>
                    <dd className="flex items-baseline">
                      <div className="text-2xl font-semibold text-gray-900">{stat.value}</div>
                      <div className={`ml-2 flex items-baseline text-sm font-semibold ${
                        stat.changeType === 'increase' ? 'text-green-600' : 'text-red-600'
                      }`}>
                        {stat.changeType === 'increase' ? (
                          <ArrowUpIcon className="h-4 w-4 flex-shrink-0" />
                        ) : (
                          <ArrowDownIcon className="h-4 w-4 flex-shrink-0" />
                        )}
                        <span className="ml-1">{stat.change}</span>
                      </div>
                    </dd>
                  </dl>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Charts */}
      <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="bg-white p-6 rounded-lg shadow">
          <h3 className="text-lg font-medium text-gray-900 mb-4">24h Transaction Volume</h3>
          <Line data={transactionChartData} options={chartOptions} />
        </div>
        
        <div className="bg-white p-6 rounded-lg shadow">
          <h3 className="text-lg font-medium text-gray-900 mb-4">Weekly Gas Usage</h3>
          <Bar data={gasUsageChartData} options={chartOptions} />
        </div>
      </div>

      {/* System Health and Alerts */}
      <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* System Health */}
        <div className="bg-white rounded-lg shadow">
          <div className="p-6">
            <h3 className="text-lg font-medium text-gray-900 mb-4">System Health</h3>
            <div className="space-y-3">
              {systemHealth.map((service) => (
                <div key={service.service} className="flex items-center justify-between">
                  <div className="flex items-center">
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusColor(service.status)}`}>
                      {service.status}
                    </span>
                    <span className="ml-3 text-sm font-medium text-gray-900">{service.service}</span>
                  </div>
                  <div className="text-sm text-gray-500">
                    <span className="font-medium">{service.uptime}</span> uptime • {service.lastCheck}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Recent Alerts */}
        <div className="bg-white rounded-lg shadow">
          <div className="p-6">
            <h3 className="text-lg font-medium text-gray-900 mb-4">Recent Alerts</h3>
            <div className="space-y-3">
              {recentAlerts.map((alert) => (
                <div key={alert.id} className="flex items-start">
                  <ExclamationTriangleIcon className={`h-5 w-5 mt-0.5 ${getAlertIcon(alert.type)}`} />
                  <div className="ml-3 flex-1">
                    <p className="text-sm text-gray-900">{alert.message}</p>
                    <p className="text-xs text-gray-500 mt-1">{alert.time}</p>
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-4">
              <a href="/admin/alerts" className="text-sm font-medium text-blue-600 hover:text-blue-500">
                View all alerts →
              </a>
            </div>
          </div>
        </div>
      </div>

      {/* Recent Activity */}
      <div className="mt-8 bg-white shadow rounded-lg">
        <div className="p-6">
          <h3 className="text-lg font-medium text-gray-900 mb-4">Recent Activity</h3>
          <div className="flow-root">
            <ul className="-mb-8">
              <li>
                <div className="relative pb-8">
                  <span className="absolute top-4 left-4 -ml-px h-full w-0.5 bg-gray-200" aria-hidden="true"></span>
                  <div className="relative flex space-x-3">
                    <div>
                      <span className="h-8 w-8 rounded-full bg-blue-500 flex items-center justify-center ring-8 ring-white">
                        <UserGroupIcon className="h-5 w-5 text-white" />
                      </span>
                    </div>
                    <div className="min-w-0 flex-1 pt-1.5 flex justify-between space-x-4">
                      <div>
                        <p className="text-sm text-gray-900">New user registered <span className="font-medium">0x1234...5678</span></p>
                      </div>
                      <div className="text-right text-sm whitespace-nowrap text-gray-500">
                        <time dateTime="2024-01-01">5 min ago</time>
                      </div>
                    </div>
                  </div>
                </div>
              </li>
              <li>
                <div className="relative pb-8">
                  <span className="absolute top-4 left-4 -ml-px h-full w-0.5 bg-gray-200" aria-hidden="true"></span>
                  <div className="relative flex space-x-3">
                    <div>
                      <span className="h-8 w-8 rounded-full bg-green-500 flex items-center justify-center ring-8 ring-white">
                        <CubeTransparentIcon className="h-5 w-5 text-white" />
                      </span>
                    </div>
                    <div className="min-w-0 flex-1 pt-1.5 flex justify-between space-x-4">
                      <div>
                        <p className="text-sm text-gray-900">Smart wallet deployed for <span className="font-medium">0xabcd...ef01</span></p>
                      </div>
                      <div className="text-right text-sm whitespace-nowrap text-gray-500">
                        <time dateTime="2024-01-01">12 min ago</time>
                      </div>
                    </div>
                  </div>
                </div>
              </li>
              <li>
                <div className="relative pb-8">
                  <div className="relative flex space-x-3">
                    <div>
                      <span className="h-8 w-8 rounded-full bg-yellow-500 flex items-center justify-center ring-8 ring-white">
                        <ExclamationTriangleIcon className="h-5 w-5 text-white" />
                      </span>
                    </div>
                    <div className="min-w-0 flex-1 pt-1.5 flex justify-between space-x-4">
                      <div>
                        <p className="text-sm text-gray-900">High gas price alert triggered</p>
                      </div>
                      <div className="text-right text-sm whitespace-nowrap text-gray-500">
                        <time dateTime="2024-01-01">25 min ago</time>
                      </div>
                    </div>
                  </div>
                </div>
              </li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
};