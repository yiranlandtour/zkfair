import React from 'react';
import { WagmiConfig, createConfig, configureChains } from 'wagmi';
import { publicProvider } from 'wagmi/providers/public';
import { getDefaultWallets, RainbowKitProvider } from '@rainbow-me/rainbowkit';
import { Chain } from 'wagmi/chains';
import '@rainbow-me/rainbowkit/styles.css';

import { Dashboard } from './components/Dashboard';
import { Header } from './components/Header';
import { SmartWalletProvider } from './contexts/SmartWalletContext';

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
          <div className="min-h-screen bg-gray-50">
            <Header />
            <main className="container mx-auto px-4 py-8">
              <Dashboard />
            </main>
          </div>
        </SmartWalletProvider>
      </RainbowKitProvider>
    </WagmiConfig>
  );
}

export default App;