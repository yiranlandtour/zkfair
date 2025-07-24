import React, { useState } from 'react';
import { useAccount } from 'wagmi';
import { 
  Wallet,
  Shield,
  Users,
  Package,
  Settings,
  ChevronRight,
  Lock,
  Key,
  Activity
} from 'lucide-react';
import { MultiSigWallet } from './MultiSigWallet';
import { SocialRecovery } from './SocialRecovery';
import { BatchTransactions } from './BatchTransactions';
import { AdvancedSettings } from './AdvancedSettings';
import { useSmartWallet } from '../../contexts/SmartWalletContext';

interface Tab {
  id: string;
  name: string;
  icon: React.ElementType;
  component: React.ComponentType;
  description: string;
}

export const AdvancedWallet: React.FC = () => {
  const { address } = useAccount();
  const { smartWalletAddress, isDeployed } = useSmartWallet();
  
  const [activeTab, setActiveTab] = useState('overview');

  const tabs: Tab[] = [
    {
      id: 'overview',
      name: 'Overview',
      icon: Wallet,
      component: WalletOverview,
      description: 'Wallet status and quick actions'
    },
    {
      id: 'multisig',
      name: 'Multi-Sig',
      icon: Users,
      component: MultiSigWallet,
      description: 'Manage multi-signature wallets'
    },
    {
      id: 'recovery',
      name: 'Social Recovery',
      icon: Shield,
      component: SocialRecovery,
      description: 'Set up wallet recovery guardians'
    },
    {
      id: 'batch',
      name: 'Batch Transactions',
      icon: Package,
      component: BatchTransactions,
      description: 'Execute multiple transactions at once'
    },
    {
      id: 'settings',
      name: 'Settings',
      icon: Settings,
      component: AdvancedSettings,
      description: 'Advanced wallet configuration'
    }
  ];

  const ActiveComponent = tabs.find(tab => tab.id === activeTab)?.component || WalletOverview;

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="container mx-auto px-4 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2">Advanced Wallet Features</h1>
          <p className="text-gray-600">
            Enhanced security and functionality for your smart wallet
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Sidebar Navigation */}
          <div className="lg:col-span-1">
            <div className="bg-white rounded-lg shadow p-4">
              <h3 className="font-semibold text-gray-700 mb-4">Features</h3>
              <nav className="space-y-2">
                {tabs.map(tab => {
                  const Icon = tab.icon;
                  return (
                    <button
                      key={tab.id}
                      onClick={() => setActiveTab(tab.id)}
                      className={`w-full flex items-center justify-between p-3 rounded-lg transition-colors ${
                        activeTab === tab.id
                          ? 'bg-blue-50 text-blue-600 border-l-4 border-blue-600'
                          : 'hover:bg-gray-50'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <Icon className="w-5 h-5" />
                        <span className="font-medium">{tab.name}</span>
                      </div>
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  );
                })}
              </nav>
            </div>

            {/* Wallet Info Card */}
            <div className="bg-white rounded-lg shadow p-4 mt-4">
              <h3 className="font-semibold text-gray-700 mb-3">Wallet Info</h3>
              <div className="space-y-2">
                <div>
                  <p className="text-sm text-gray-600">EOA Address</p>
                  <p className="font-mono text-xs">
                    {address ? `${address.slice(0, 6)}...${address.slice(-4)}` : 'Not connected'}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Smart Wallet</p>
                  <p className="font-mono text-xs">
                    {smartWalletAddress ? `${smartWalletAddress.slice(0, 6)}...${smartWalletAddress.slice(-4)}` : 'Not deployed'}
                  </p>
                </div>
                <div className="pt-2">
                  <div className="flex items-center gap-2">
                    <div className={`w-2 h-2 rounded-full ${isDeployed ? 'bg-green-500' : 'bg-yellow-500'}`} />
                    <span className="text-sm text-gray-600">
                      {isDeployed ? 'Deployed' : 'Not deployed'}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Main Content */}
          <div className="lg:col-span-3">
            <ActiveComponent />
          </div>
        </div>
      </div>
    </div>
  );
};

// Wallet Overview Component
const WalletOverview: React.FC = () => {
  const { smartWalletAddress, isDeployed } = useSmartWallet();
  
  const features = [
    {
      icon: Users,
      title: 'Multi-Signature Wallet',
      description: 'Create wallets that require multiple signatures for transactions',
      status: 'Available',
      color: 'blue'
    },
    {
      icon: Shield,
      title: 'Social Recovery',
      description: 'Recover your wallet with help from trusted guardians',
      status: 'Available',
      color: 'purple'
    },
    {
      icon: Package,
      title: 'Batch Transactions',
      description: 'Save gas by bundling multiple transactions into one',
      status: 'Available',
      color: 'green'
    },
    {
      icon: Lock,
      title: 'Advanced Security',
      description: 'Enhanced security features including biometric auth and auto-lock',
      status: 'Configured',
      color: 'orange'
    }
  ];

  const recentActivity = [
    { type: 'security', message: 'Social recovery guardian added', time: '2 hours ago' },
    { type: 'transaction', message: 'Batch transaction executed (3 operations)', time: '5 hours ago' },
    { type: 'settings', message: 'Auto-lock enabled', time: '1 day ago' },
    { type: 'multisig', message: 'Multi-sig wallet created', time: '3 days ago' }
  ];

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-2xl font-bold mb-6">Wallet Overview</h2>
        
        {/* Status Banner */}
        <div className={`rounded-lg p-4 mb-6 ${isDeployed ? 'bg-green-50 border border-green-200' : 'bg-yellow-50 border border-yellow-200'}`}>
          <div className="flex items-center gap-3">
            <div className={`w-3 h-3 rounded-full ${isDeployed ? 'bg-green-500' : 'bg-yellow-500'}`} />
            <div>
              <p className="font-medium">
                {isDeployed ? 'Smart Wallet Active' : 'Smart Wallet Not Deployed'}
              </p>
              <p className="text-sm text-gray-600 mt-1">
                {isDeployed 
                  ? 'All advanced features are available'
                  : 'Deploy your smart wallet to access advanced features'
                }
              </p>
            </div>
          </div>
        </div>

        {/* Feature Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          {features.map((feature, index) => {
            const Icon = feature.icon;
            return (
              <div key={index} className="border rounded-lg p-4 hover:shadow-md transition-shadow">
                <div className="flex items-start gap-3">
                  <div className={`p-2 rounded-lg bg-${feature.color}-100`}>
                    <Icon className={`w-6 h-6 text-${feature.color}-600`} />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center justify-between">
                      <h3 className="font-semibold">{feature.title}</h3>
                      <span className={`text-xs px-2 py-1 rounded-full bg-${feature.color}-100 text-${feature.color}-700`}>
                        {feature.status}
                      </span>
                    </div>
                    <p className="text-sm text-gray-600 mt-1">{feature.description}</p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Recent Activity */}
        <div>
          <h3 className="font-semibold mb-3 flex items-center gap-2">
            <Activity className="w-5 h-5" />
            Recent Activity
          </h3>
          <div className="space-y-3">
            {recentActivity.map((activity, index) => (
              <div key={index} className="flex items-center justify-between py-2 border-b last:border-0">
                <div className="flex items-center gap-3">
                  <div className={`w-2 h-2 rounded-full ${
                    activity.type === 'security' ? 'bg-purple-500' :
                    activity.type === 'transaction' ? 'bg-green-500' :
                    activity.type === 'settings' ? 'bg-gray-500' :
                    'bg-blue-500'
                  }`} />
                  <p className="text-sm">{activity.message}</p>
                </div>
                <span className="text-xs text-gray-500">{activity.time}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Quick Stats */}
        <div className="grid grid-cols-3 gap-4 mt-6 pt-6 border-t">
          <div className="text-center">
            <p className="text-2xl font-bold">2</p>
            <p className="text-sm text-gray-600">Active Guardians</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-bold">5</p>
            <p className="text-sm text-gray-600">Batch Templates</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-bold">3/5</p>
            <p className="text-sm text-gray-600">Security Score</p>
          </div>
        </div>
      </div>
    </div>
  );
};