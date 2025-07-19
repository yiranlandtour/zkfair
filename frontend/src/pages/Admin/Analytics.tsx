import React, { useState, useEffect } from 'react';
import {
  ChartBarIcon,
  CalendarIcon,
  ArrowTrendingUpIcon,
  ArrowTrendingDownIcon,
  UsersIcon,
  CurrencyDollarIcon,
  BoltIcon,
  ClockIcon
} from '@heroicons/react/24/outline';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  Title,
  Tooltip,
  Legend,
  Filler,
} from 'chart.js';
import { Line, Bar, Doughnut } from 'react-chartjs-2';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  Title,
  Tooltip,
  Legend,
  Filler
);

interface TimeRange {
  label: string;
  value: '24h' | '7d' | '30d' | '90d';
}

export const AdminAnalytics: React.FC = () => {
  const [timeRange, setTimeRange] = useState<TimeRange['value']>('7d');
  const [loading, setLoading] = useState(true);
  const [metrics, setMetrics] = useState({
    totalVolume: 0,
    volumeChange: 0,
    totalUsers: 0,
    userChange: 0,
    totalTransactions: 0,
    transactionChange: 0,
    avgGasPrice: 0,
    gasChange: 0,
  });

  const timeRanges: TimeRange[] = [
    { label: '24 Hours', value: '24h' },
    { label: '7 Days', value: '7d' },
    { label: '30 Days', value: '30d' },
    { label: '90 Days', value: '90d' },
  ];

  useEffect(() => {
    fetchAnalytics();
  }, [timeRange]);

  const fetchAnalytics = async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/admin/analytics?range=${timeRange}`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('authToken')}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        setMetrics(data.metrics);
      }
    } catch (error) {
      console.error('Failed to fetch analytics:', error);
    } finally {
      setLoading(false);
    }
  };

  // Chart data
  const transactionVolumeData = {
    labels: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
    datasets: [
      {
        label: 'Transaction Volume',
        data: [65000, 72000, 68000, 85000, 92000, 78000, 95000],
        borderColor: 'rgb(59, 130, 246)',
        backgroundColor: 'rgba(59, 130, 246, 0.1)',
        fill: true,
        tension: 0.4,
      },
    ],
  };

  const userGrowthData = {
    labels: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
    datasets: [
      {
        label: 'New Users',
        data: [45, 52, 38, 65, 72, 58, 85],
        backgroundColor: 'rgba(34, 197, 94, 0.8)',
      },
      {
        label: 'Active Users',
        data: [320, 345, 330, 380, 420, 390, 450],
        backgroundColor: 'rgba(59, 130, 246, 0.8)',
      },
    ],
  };

  const gasUsageData = {
    labels: ['USDC', 'USDT', 'Native Token'],
    datasets: [
      {
        data: [45, 35, 20],
        backgroundColor: [
          'rgba(59, 130, 246, 0.8)',
          'rgba(34, 197, 94, 0.8)',
          'rgba(251, 146, 60, 0.8)',
        ],
        borderWidth: 0,
      },
    ],
  };

  const transactionStatusData = {
    labels: ['Success', 'Failed', 'Pending'],
    datasets: [
      {
        data: [89, 7, 4],
        backgroundColor: [
          'rgba(34, 197, 94, 0.8)',
          'rgba(239, 68, 68, 0.8)',
          'rgba(251, 191, 36, 0.8)',
        ],
        borderWidth: 0,
      },
    ],
  };

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'bottom' as const,
      },
    },
  };

  const lineChartOptions = {
    ...chartOptions,
    scales: {
      y: {
        beginAtZero: true,
      },
    },
  };

  return (
    <div>
      <div className="sm:flex sm:items-center">
        <div className="sm:flex-auto">
          <h1 className="text-2xl font-semibold text-gray-900">Analytics</h1>
          <p className="mt-2 text-sm text-gray-700">
            Comprehensive platform metrics and insights
          </p>
        </div>
        <div className="mt-4 sm:mt-0 sm:ml-16 sm:flex-none">
          <select
            value={timeRange}
            onChange={(e) => setTimeRange(e.target.value as TimeRange['value'])}
            className="inline-flex items-center rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50"
          >
            {timeRanges.map((range) => (
              <option key={range.value} value={range.value}>
                {range.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Key Metrics */}
      <div className="mt-6 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
        <div className="bg-white overflow-hidden rounded-lg shadow">
          <div className="p-5">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <CurrencyDollarIcon className="h-8 w-8 text-green-400" />
              </div>
              <div className="ml-5 w-0 flex-1">
                <dl>
                  <dt className="text-sm font-medium text-gray-500 truncate">Total Volume</dt>
                  <dd className="flex items-baseline">
                    <div className="text-2xl font-semibold text-gray-900">
                      $2.4M
                    </div>
                    <span className={`ml-2 flex items-baseline text-sm font-semibold ${
                      metrics.volumeChange >= 0 ? 'text-green-600' : 'text-red-600'
                    }`}>
                      {metrics.volumeChange >= 0 ? (
                        <ArrowTrendingUpIcon className="h-4 w-4 mr-0.5" />
                      ) : (
                        <ArrowTrendingDownIcon className="h-4 w-4 mr-0.5" />
                      )}
                      {Math.abs(metrics.volumeChange)}%
                    </span>
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
                <UsersIcon className="h-8 w-8 text-blue-400" />
              </div>
              <div className="ml-5 w-0 flex-1">
                <dl>
                  <dt className="text-sm font-medium text-gray-500 truncate">Total Users</dt>
                  <dd className="flex items-baseline">
                    <div className="text-2xl font-semibold text-gray-900">
                      12,456
                    </div>
                    <span className={`ml-2 flex items-baseline text-sm font-semibold ${
                      metrics.userChange >= 0 ? 'text-green-600' : 'text-red-600'
                    }`}>
                      {metrics.userChange >= 0 ? (
                        <ArrowTrendingUpIcon className="h-4 w-4 mr-0.5" />
                      ) : (
                        <ArrowTrendingDownIcon className="h-4 w-4 mr-0.5" />
                      )}
                      15%
                    </span>
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
                <BoltIcon className="h-8 w-8 text-yellow-400" />
              </div>
              <div className="ml-5 w-0 flex-1">
                <dl>
                  <dt className="text-sm font-medium text-gray-500 truncate">Transactions</dt>
                  <dd className="flex items-baseline">
                    <div className="text-2xl font-semibold text-gray-900">
                      145K
                    </div>
                    <span className="ml-2 flex items-baseline text-sm font-semibold text-green-600">
                      <ArrowTrendingUpIcon className="h-4 w-4 mr-0.5" />
                      23%
                    </span>
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
                <ClockIcon className="h-8 w-8 text-purple-400" />
              </div>
              <div className="ml-5 w-0 flex-1">
                <dl>
                  <dt className="text-sm font-medium text-gray-500 truncate">Avg Gas Price</dt>
                  <dd className="flex items-baseline">
                    <div className="text-2xl font-semibold text-gray-900">
                      12 gwei
                    </div>
                    <span className="ml-2 flex items-baseline text-sm font-semibold text-red-600">
                      <ArrowTrendingDownIcon className="h-4 w-4 mr-0.5" />
                      5%
                    </span>
                  </dd>
                </dl>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Charts */}
      <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Transaction Volume */}
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-medium text-gray-900 mb-4">Transaction Volume</h3>
          <div className="h-64">
            <Line data={transactionVolumeData} options={lineChartOptions} />
          </div>
        </div>

        {/* User Growth */}
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-medium text-gray-900 mb-4">User Growth</h3>
          <div className="h-64">
            <Bar data={userGrowthData} options={chartOptions} />
          </div>
        </div>

        {/* Gas Token Usage */}
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-medium text-gray-900 mb-4">Gas Token Distribution</h3>
          <div className="h-64">
            <Doughnut data={gasUsageData} options={chartOptions} />
          </div>
        </div>

        {/* Transaction Status */}
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-medium text-gray-900 mb-4">Transaction Status</h3>
          <div className="h-64">
            <Doughnut data={transactionStatusData} options={chartOptions} />
          </div>
        </div>
      </div>

      {/* Additional Metrics */}
      <div className="mt-8 bg-white shadow rounded-lg">
        <div className="px-4 py-5 sm:p-6">
          <h3 className="text-lg font-medium text-gray-900 mb-4">Platform Performance</h3>
          
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
            <div>
              <dt className="text-sm font-medium text-gray-500">Average Bundle Time</dt>
              <dd className="mt-1 text-3xl font-semibold text-gray-900">2.3s</dd>
              <p className="mt-1 text-sm text-gray-600">↓ 0.5s from last period</p>
            </div>
            
            <div>
              <dt className="text-sm font-medium text-gray-500">Success Rate</dt>
              <dd className="mt-1 text-3xl font-semibold text-gray-900">98.5%</dd>
              <p className="mt-1 text-sm text-gray-600">↑ 0.3% from last period</p>
            </div>
            
            <div>
              <dt className="text-sm font-medium text-gray-500">Avg UserOp Cost</dt>
              <dd className="mt-1 text-3xl font-semibold text-gray-900">$0.15</dd>
              <p className="mt-1 text-sm text-gray-600">↓ $0.02 from last period</p>
            </div>
          </div>
        </div>
      </div>

      {/* Top Operations */}
      <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="bg-white shadow rounded-lg">
          <div className="px-4 py-5 sm:p-6">
            <h3 className="text-lg font-medium text-gray-900 mb-4">Top Operations</h3>
            <div className="flow-root">
              <ul className="-my-5 divide-y divide-gray-200">
                <li className="py-4">
                  <div className="flex items-center space-x-4">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">Token Transfer</p>
                      <p className="text-sm text-gray-500">45,234 operations</p>
                    </div>
                    <div className="text-sm text-gray-900">32%</div>
                  </div>
                </li>
                <li className="py-4">
                  <div className="flex items-center space-x-4">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">Swap</p>
                      <p className="text-sm text-gray-500">28,156 operations</p>
                    </div>
                    <div className="text-sm text-gray-900">20%</div>
                  </div>
                </li>
                <li className="py-4">
                  <div className="flex items-center space-x-4">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">NFT Mint</p>
                      <p className="text-sm text-gray-500">19,872 operations</p>
                    </div>
                    <div className="text-sm text-gray-900">14%</div>
                  </div>
                </li>
              </ul>
            </div>
          </div>
        </div>

        <div className="bg-white shadow rounded-lg">
          <div className="px-4 py-5 sm:p-6">
            <h3 className="text-lg font-medium text-gray-900 mb-4">Top Gas Consumers</h3>
            <div className="flow-root">
              <ul className="-my-5 divide-y divide-gray-200">
                <li className="py-4">
                  <div className="flex items-center space-x-4">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate font-mono">0x1234...5678</p>
                      <p className="text-sm text-gray-500">2,345 USDC</p>
                    </div>
                    <div className="text-sm text-gray-900">1,234 txs</div>
                  </div>
                </li>
                <li className="py-4">
                  <div className="flex items-center space-x-4">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate font-mono">0x2345...6789</p>
                      <p className="text-sm text-gray-500">1,987 USDC</p>
                    </div>
                    <div className="text-sm text-gray-900">987 txs</div>
                  </div>
                </li>
                <li className="py-4">
                  <div className="flex items-center space-x-4">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate font-mono">0x3456...7890</p>
                      <p className="text-sm text-gray-500">1,654 USDC</p>
                    </div>
                    <div className="text-sm text-gray-900">876 txs</div>
                  </div>
                </li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};