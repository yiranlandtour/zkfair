import React, { useState, useEffect } from 'react';
import { useAccount, usePublicClient, useWalletClient } from 'wagmi';
import { 
  Users, 
  Plus, 
  Shield, 
  FileSignature, 
  CheckCircle, 
  XCircle,
  Clock,
  AlertCircle,
  Send,
  Key
} from 'lucide-react';
import { ethers } from 'ethers';

interface Owner {
  address: string;
  name: string;
  addedAt: Date;
  isActive: boolean;
}

interface Transaction {
  id: string;
  to: string;
  value: string;
  data: string;
  description: string;
  creator: string;
  signatures: string[];
  executed: boolean;
  createdAt: Date;
  nonce: number;
}

interface MultiSigConfig {
  threshold: number;
  owners: Owner[];
  walletAddress?: string;
}

export const MultiSigWallet: React.FC = () => {
  const { address } = useAccount();
  const publicClient = usePublicClient();
  const { data: walletClient } = useWalletClient();
  
  const [config, setConfig] = useState<MultiSigConfig>({
    threshold: 2,
    owners: []
  });
  
  const [pendingTransactions, setPendingTransactions] = useState<Transaction[]>([]);
  const [executedTransactions, setExecutedTransactions] = useState<Transaction[]>([]);
  const [isCreatingWallet, setIsCreatingWallet] = useState(false);
  const [showAddOwner, setShowAddOwner] = useState(false);
  const [showCreateTx, setShowCreateTx] = useState(false);
  const [newOwnerAddress, setNewOwnerAddress] = useState('');
  const [newOwnerName, setNewOwnerName] = useState('');
  
  const [newTx, setNewTx] = useState({
    to: '',
    value: '',
    data: '0x',
    description: ''
  });

  useEffect(() => {
    loadMultiSigData();
  }, [address]);

  const loadMultiSigData = async () => {
    try {
      const response = await fetch(`/api/multisig/${address}`);
      if (response.ok) {
        const data = await response.json();
        setConfig(data.config);
        setPendingTransactions(data.pendingTransactions);
        setExecutedTransactions(data.executedTransactions);
      }
    } catch (error) {
      console.error('Failed to load multi-sig data:', error);
    }
  };

  const createMultiSigWallet = async () => {
    if (config.owners.length < config.threshold) {
      alert('Need at least ' + config.threshold + ' owners');
      return;
    }

    setIsCreatingWallet(true);
    try {
      const response = await fetch('/api/multisig/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          owners: config.owners.map(o => o.address),
          threshold: config.threshold,
          creator: address
        })
      });

      if (response.ok) {
        const { walletAddress } = await response.json();
        setConfig({ ...config, walletAddress });
        await loadMultiSigData();
      }
    } catch (error) {
      console.error('Failed to create multi-sig wallet:', error);
    } finally {
      setIsCreatingWallet(false);
    }
  };

  const addOwner = () => {
    if (!ethers.isAddress(newOwnerAddress)) {
      alert('Invalid address');
      return;
    }

    const newOwner: Owner = {
      address: newOwnerAddress,
      name: newOwnerName || 'Owner ' + (config.owners.length + 1),
      addedAt: new Date(),
      isActive: true
    };

    setConfig({
      ...config,
      owners: [...config.owners, newOwner]
    });

    setNewOwnerAddress('');
    setNewOwnerName('');
    setShowAddOwner(false);
  };

  const removeOwner = (address: string) => {
    setConfig({
      ...config,
      owners: config.owners.filter(o => o.address !== address)
    });
  };

  const createTransaction = async () => {
    if (!config.walletAddress) return;

    try {
      const response = await fetch('/api/multisig/transactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          walletAddress: config.walletAddress,
          ...newTx,
          creator: address
        })
      });

      if (response.ok) {
        await loadMultiSigData();
        setShowCreateTx(false);
        setNewTx({ to: '', value: '', data: '0x', description: '' });
      }
    } catch (error) {
      console.error('Failed to create transaction:', error);
    }
  };

  const signTransaction = async (txId: string) => {
    if (!walletClient) return;

    try {
      const tx = pendingTransactions.find(t => t.id === txId);
      if (!tx) return;

      const message = ethers.solidityPackedKeccak256(
        ['address', 'uint256', 'bytes', 'uint256'],
        [tx.to, tx.value, tx.data, tx.nonce]
      );

      const signature = await walletClient.signMessage({
        message: { raw: message as `0x${string}` }
      });

      const response = await fetch(`/api/multisig/transactions/${txId}/sign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          signature,
          signer: address
        })
      });

      if (response.ok) {
        await loadMultiSigData();
      }
    } catch (error) {
      console.error('Failed to sign transaction:', error);
    }
  };

  const executeTransaction = async (txId: string) => {
    const tx = pendingTransactions.find(t => t.id === txId);
    if (!tx || tx.signatures.length < config.threshold) return;

    try {
      const response = await fetch(`/api/multisig/transactions/${txId}/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          executor: address
        })
      });

      if (response.ok) {
        await loadMultiSigData();
      }
    } catch (error) {
      console.error('Failed to execute transaction:', error);
    }
  };

  const hasSigned = (tx: Transaction) => {
    return tx.signatures.some(sig => {
      // In a real implementation, recover signer from signature
      return false;
    });
  };

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <Shield className="w-8 h-8 text-blue-600" />
            Multi-Signature Wallet
          </h2>
          {!config.walletAddress && (
            <button
              onClick={createMultiSigWallet}
              disabled={isCreatingWallet || config.owners.length < 2}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              {isCreatingWallet ? 'Creating...' : 'Create Wallet'}
            </button>
          )}
        </div>

        {config.walletAddress ? (
          <div className="space-y-6">
            <div className="bg-gray-50 rounded-lg p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600">Wallet Address</p>
                  <p className="font-mono text-sm">{config.walletAddress}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm text-gray-600">Threshold</p>
                  <p className="text-2xl font-bold">
                    {config.threshold}/{config.owners.length}
                  </p>
                </div>
              </div>
            </div>

            <div>
              <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
                <Users className="w-5 h-5" />
                Owners ({config.owners.length})
              </h3>
              <div className="space-y-2">
                {config.owners.map((owner) => (
                  <div key={owner.address} className="flex items-center justify-between bg-gray-50 rounded-lg p-3">
                    <div>
                      <p className="font-medium">{owner.name}</p>
                      <p className="text-sm text-gray-600 font-mono">{owner.address}</p>
                    </div>
                    {owner.isActive ? (
                      <CheckCircle className="w-5 h-5 text-green-600" />
                    ) : (
                      <XCircle className="w-5 h-5 text-red-600" />
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-lg font-semibold flex items-center gap-2">
                  <FileSignature className="w-5 h-5" />
                  Pending Transactions ({pendingTransactions.length})
                </h3>
                <button
                  onClick={() => setShowCreateTx(true)}
                  className="px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 text-sm"
                >
                  New Transaction
                </button>
              </div>
              
              <div className="space-y-3">
                {pendingTransactions.map((tx) => (
                  <div key={tx.id} className="border rounded-lg p-4">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <p className="font-medium">{tx.description}</p>
                        <p className="text-sm text-gray-600 mt-1">
                          To: <span className="font-mono">{tx.to}</span>
                        </p>
                        <p className="text-sm text-gray-600">
                          Value: {ethers.formatEther(tx.value)} ETH
                        </p>
                        <div className="flex items-center gap-4 mt-2">
                          <span className="text-sm text-gray-600">
                            Signatures: {tx.signatures.length}/{config.threshold}
                          </span>
                          <span className="text-sm text-gray-500">
                            Created by: {tx.creator.slice(0, 6)}...{tx.creator.slice(-4)}
                          </span>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        {!hasSigned(tx) && (
                          <button
                            onClick={() => signTransaction(tx.id)}
                            className="px-3 py-1 bg-green-600 text-white rounded hover:bg-green-700 text-sm"
                          >
                            Sign
                          </button>
                        )}
                        {tx.signatures.length >= config.threshold && !tx.executed && (
                          <button
                            onClick={() => executeTransaction(tx.id)}
                            className="px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 text-sm"
                          >
                            Execute
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
                {pendingTransactions.length === 0 && (
                  <p className="text-gray-500 text-center py-8">No pending transactions</p>
                )}
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Signature Threshold
              </label>
              <input
                type="number"
                min="1"
                max={config.owners.length || 1}
                value={config.threshold}
                onChange={(e) => setConfig({ ...config, threshold: parseInt(e.target.value) })}
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
              />
              <p className="text-sm text-gray-600 mt-1">
                Number of signatures required to execute transactions
              </p>
            </div>

            <div>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-lg font-semibold">Wallet Owners</h3>
                <button
                  onClick={() => setShowAddOwner(true)}
                  className="px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 text-sm flex items-center gap-1"
                >
                  <Plus className="w-4 h-4" />
                  Add Owner
                </button>
              </div>
              
              <div className="space-y-2">
                {config.owners.map((owner) => (
                  <div key={owner.address} className="flex items-center justify-between bg-gray-50 rounded-lg p-3">
                    <div>
                      <p className="font-medium">{owner.name}</p>
                      <p className="text-sm text-gray-600 font-mono">{owner.address}</p>
                    </div>
                    <button
                      onClick={() => removeOwner(owner.address)}
                      className="text-red-600 hover:text-red-700"
                    >
                      <XCircle className="w-5 h-5" />
                    </button>
                  </div>
                ))}
                {config.owners.length === 0 && (
                  <p className="text-gray-500 text-center py-8">
                    Add at least {config.threshold} owners to create wallet
                  </p>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Add Owner Modal */}
      {showAddOwner && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <h3 className="text-lg font-semibold mb-4">Add Owner</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Owner Name
                </label>
                <input
                  type="text"
                  value={newOwnerName}
                  onChange={(e) => setNewOwnerName(e.target.value)}
                  placeholder="e.g., Alice"
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Wallet Address
                </label>
                <input
                  type="text"
                  value={newOwnerAddress}
                  onChange={(e) => setNewOwnerAddress(e.target.value)}
                  placeholder="0x..."
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div className="flex gap-3 pt-4">
                <button
                  onClick={addOwner}
                  className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                >
                  Add Owner
                </button>
                <button
                  onClick={() => setShowAddOwner(false)}
                  className="flex-1 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Create Transaction Modal */}
      {showCreateTx && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <h3 className="text-lg font-semibold mb-4">Create Transaction</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Description
                </label>
                <input
                  type="text"
                  value={newTx.description}
                  onChange={(e) => setNewTx({ ...newTx, description: e.target.value })}
                  placeholder="e.g., Payment to vendor"
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  To Address
                </label>
                <input
                  type="text"
                  value={newTx.to}
                  onChange={(e) => setNewTx({ ...newTx, to: e.target.value })}
                  placeholder="0x..."
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Value (ETH)
                </label>
                <input
                  type="text"
                  value={newTx.value}
                  onChange={(e) => setNewTx({ ...newTx, value: e.target.value })}
                  placeholder="0.0"
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Data (optional)
                </label>
                <input
                  type="text"
                  value={newTx.data}
                  onChange={(e) => setNewTx({ ...newTx, data: e.target.value })}
                  placeholder="0x"
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div className="flex gap-3 pt-4">
                <button
                  onClick={createTransaction}
                  className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                >
                  Create
                </button>
                <button
                  onClick={() => setShowCreateTx(false)}
                  className="flex-1 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};