import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { WagmiConfig, createConfig, configureChains } from 'wagmi';
import { publicProvider } from 'wagmi/providers/public';
import { getDefaultWallets, RainbowKitProvider } from '@rainbow-me/rainbowkit';
import { Chain } from 'wagmi/chains';
import '@rainbow-me/rainbowkit/styles.css';

import { Dashboard } from './components/Dashboard';
import { Header } from './components/Header';
import { SmartWalletProvider } from './contexts/SmartWalletContext';
import { AdminLayout } from './pages/Admin/AdminLayout';
import { AdminDashboard } from './pages/Admin/Dashboard';
import { AdminUsers } from './pages/Admin/Users';
import { AdminTransactions } from './pages/Admin/Transactions';
import { AdminSystem } from './pages/Admin/System';
import { AdminSmartWallets } from './pages/Admin/SmartWallets';
import { AdminAnalytics } from './pages/Admin/Analytics';
import { AdminSecurity } from './pages/Admin/Security';
import { AdminAlerts } from './pages/Admin/Alerts';
import { NotificationCenter } from './pages/Admin/NotificationCenter';
import { AdvancedWallet } from './components/wallet/AdvancedWallet';

const zkFairChain: Chain = {
  id: 67890,
  name: 'ZKFair L2',
  network: 'zkfair',
  nativeCurrency: {
    decimals: 18,
    name: 'ZKFair Gas',
    symbol: 'ZKG',
  },
  rpcUrls: {
    default: { http: ['http://localhost:8545'] },
    public: { http: ['http://localhost:8545'] },
  },
  blockExplorers: {
    default: { name: 'ZKFair Explorer', url: 'http://localhost:4000' },
  },
  testnet: true,
};

const { chains, publicClient, webSocketPublicClient } = configureChains(
  [zkFairChain],
  [publicProvider()]
);

const { connectors } = getDefaultWallets({
  appName: 'ZKFair L2',
  projectId: 'YOUR_WALLETCONNECT_PROJECT_ID',
  chains,
});

const config = createConfig({
  autoConnect: true,
  connectors,
  publicClient,
  webSocketPublicClient,
});

function App() {
  return (
    <WagmiConfig config={config}>
      <RainbowKitProvider chains={chains}>
        <SmartWalletProvider>
          <Router>
            <div className="min-h-screen bg-gray-50">
              <Header />
              <main>
                <Routes>
                  <Route path="/" element={
                    <div className="container mx-auto px-4 py-8">
                      <Dashboard />
                    </div>
                  } />
                  <Route path="/wallet" element={
                    <div className="container mx-auto px-4 py-8">
                      <AdvancedWallet />
                    </div>
                  } />
                  <Route path="/admin" element={<AdminLayout />}>
                    <Route index element={<AdminDashboard />} />
                    <Route path="users" element={<AdminUsers />} />
                    <Route path="wallets" element={<AdminSmartWallets />} />
                    <Route path="transactions" element={<AdminTransactions />} />
                    <Route path="analytics" element={<AdminAnalytics />} />
                    <Route path="security" element={<AdminSecurity />} />
                    <Route path="alerts" element={<AdminAlerts />} />
                    <Route path="system" element={<AdminSystem />} />
                    <Route path="notifications" element={<NotificationCenter />} />
                  </Route>
                </Routes>
              </main>
            </div>
          </Router>
        </SmartWalletProvider>
      </RainbowKitProvider>
    </WagmiConfig>
  );
}

export default App;