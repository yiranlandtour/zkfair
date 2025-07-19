import React, { useState, useEffect, useCallback } from 'react';
import { useAccount } from 'wagmi';
import { ethers } from 'ethers';
import { useSmartWallet } from '../contexts/SmartWalletContext';
import { TransferModal } from './TransferModal';
import { BalanceCard } from './BalanceCard';
import { TransactionHistory } from './TransactionHistory';
import { useWebSocket, useBalanceUpdates, useBlockUpdates } from '../hooks/useWebSocket';

interface BlockInfo {
  blockNumber: number;
  timestamp: number;
  transactionCount: number;
}

export const DashboardWithWebSocket: React.FC = () => {
  const { address: eoaAddress } = useAccount();
  const { 
    smartWalletAddress, 
    isDeployed, 
    deploySmartWallet,
    getBalance 
  } = useSmartWallet();
  
  const [isDeploying, setIsDeploying] = useState(false);
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [balances, setBalances] = useState({
    native: 0n,
    usdc: 0n
  });
  const [latestBlock, setLatestBlock] = useState<BlockInfo | null>(null);
  const [isConnected, setIsConnected] = useState(false);

  const usdcAddress = process.env.REACT_APP_USDC_ADDRESS || '';

  // Get auth token (you'd implement this based on your auth system)
  const authToken = localStorage.getItem('authToken') || '';

  // Initialize WebSocket connection
  const { isConnected: wsConnected, connect, disconnect } = useWebSocket(authToken, {
    autoConnect: true,
    onConnect: () => {
      console.log('WebSocket connected');
      setIsConnected(true);
    },
    onDisconnect: () => {
      console.log('WebSocket disconnected');
      setIsConnected(false);
    },
    onError: (error) => {
      console.error('WebSocket error:', error);
    },
  });

  // Subscribe to balance updates
  useBalanceUpdates(
    [ethers.ZeroAddress, usdcAddress],
    useCallback((update) => {
      if (update.address === smartWalletAddress) {
        setBalances({
          native: BigInt(update.balances[ethers.ZeroAddress] || '0'),
          usdc: BigInt(update.balances[usdcAddress] || '0'),
        });
      }
    }, [smartWalletAddress, usdcAddress])
  );

  // Subscribe to block updates
  useBlockUpdates((block) => {
    setLatestBlock({
      blockNumber: block.blockNumber,
      timestamp: block.timestamp,
      transactionCount: block.transactionCount,
    });
  });

  useEffect(() => {
    if (smartWalletAddress && isDeployed) {
      loadBalances();
    }
  }, [smartWalletAddress, isDeployed]);

  const loadBalances = async () => {
    if (!smartWalletAddress) return;
    
    const [native, usdc] = await Promise.all([
      getBalance(ethers.ZeroAddress),
      getBalance(usdcAddress)
    ]);
    
    setBalances({ native, usdc });
  };

  const handleDeploy = async () => {
    setIsDeploying(true);
    try {
      await deploySmartWallet();
      await loadBalances();
    } catch (error) {
      console.error('Failed to deploy smart wallet:', error);
    } finally {
      setIsDeploying(false);
    }
  };

  if (!eoaAddress) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <h2 className="text-2xl font-bold mb-4">Welcome to ZKFair L2</h2>
          <p className="text-gray-600">Please connect your wallet to continue</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Connection Status */}
      <div className="bg-white rounded-lg shadow-md p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <div className={`w-3 h-3 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'}`} />
            <span className="text-sm text-gray-600">
              {isConnected ? 'Connected' : 'Disconnected'}
            </span>
          </div>
          {latestBlock && (
            <div className="text-sm text-gray-600">
              Block #{latestBlock.blockNumber} • {latestBlock.transactionCount} txs
            </div>
          )}
        </div>
      </div>

      <div className="bg-white rounded-lg shadow-md p-6">
        <h2 className="text-xl font-bold mb-4">Smart Wallet</h2>
        
        {smartWalletAddress ? (
          <div className="space-y-4">
            <div>
              <label className="text-sm text-gray-600">Smart Wallet Address</label>
              <div className="font-mono text-sm bg-gray-100 p-2 rounded break-all">
                {smartWalletAddress}
              </div>
            </div>
            
            {!isDeployed ? (
              <div className="bg-yellow-50 border border-yellow-200 rounded p-4">
                <p className="text-sm text-yellow-800 mb-2">
                  Your smart wallet is not deployed yet. Deploy it to start using account abstraction features.
                </p>
                <button
                  onClick={handleDeploy}
                  disabled={isDeploying}
                  className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 disabled:opacity-50"
                >
                  {isDeploying ? 'Deploying...' : 'Deploy Smart Wallet'}
                </button>
              </div>
            ) : (
              <div className="bg-green-50 border border-green-200 rounded p-4">
                <p className="text-sm text-green-800">
                  ✓ Smart wallet deployed and ready to use
                </p>
              </div>
            )}
          </div>
        ) : (
          <div className="text-center py-8">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
            <p className="mt-4 text-gray-600">Initializing smart wallet...</p>
          </div>
        )}
      </div>

      {isDeployed && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <BalanceCard
              title="Native Token Balance"
              balance={balances.native}
              symbol="ZKG"
              decimals={18}
            />
            <BalanceCard
              title="USDC Balance"
              balance={balances.usdc}
              symbol="USDC"
              decimals={6}
            />
          </div>

          <div className="bg-white rounded-lg shadow-md p-6">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold">Actions</h3>
            </div>
            
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <button
                onClick={() => setShowTransferModal(true)}
                className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
              >
                Transfer
              </button>
              <button
                className="bg-gray-600 text-white px-4 py-2 rounded hover:bg-gray-700"
                disabled
              >
                Swap (Coming Soon)
              </button>
              <button
                className="bg-gray-600 text-white px-4 py-2 rounded hover:bg-gray-700"
                disabled
              >
                Bridge (Coming Soon)
              </button>
              <button
                onClick={loadBalances}
                className="bg-gray-200 text-gray-800 px-4 py-2 rounded hover:bg-gray-300"
              >
                Refresh Balances
              </button>
            </div>
          </div>

          <TransactionHistory smartWalletAddress={smartWalletAddress!} />
        </>
      )}

      {showTransferModal && (
        <TransferModal
          onClose={() => setShowTransferModal(false)}
          onSuccess={() => {
            setShowTransferModal(false);
            loadBalances();
          }}
        />
      )}
    </div>
  );
};