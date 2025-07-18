import React, { useState } from 'react';
import { ethers } from 'ethers';
import { useSmartWallet } from '../contexts/SmartWalletContext';

interface TransferModalProps {
  onClose: () => void;
  onSuccess: () => void;
}

export const TransferModal: React.FC<TransferModalProps> = ({ onClose, onSuccess }) => {
  const { sendUserOperation, estimateGas } = useSmartWallet();
  
  const [recipient, setRecipient] = useState('');
  const [amount, setAmount] = useState('');
  const [tokenType, setTokenType] = useState<'native' | 'usdc'>('usdc');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [gasEstimate, setGasEstimate] = useState<bigint | null>(null);

  const usdcAddress = process.env.REACT_APP_USDC_ADDRESS || '';

  const handleEstimateGas = async () => {
    if (!ethers.isAddress(recipient) || !amount) return;
    
    try {
      let gas: bigint;
      
      if (tokenType === 'native') {
        gas = await estimateGas(
          recipient,
          '0x',
          ethers.parseEther(amount)
        );
      } else {
        const transferData = new ethers.Interface([
          'function transfer(address to, uint256 amount) returns (bool)'
        ]).encodeFunctionData('transfer', [
          recipient,
          ethers.parseUnits(amount, 6)
        ]);
        
        gas = await estimateGas(usdcAddress, transferData);
      }
      
      setGasEstimate(gas);
    } catch (err: any) {
      console.error('Gas estimation failed:', err);
    }
  };

  const handleTransfer = async () => {
    setError('');
    setIsLoading(true);
    
    try {
      if (!ethers.isAddress(recipient)) {
        throw new Error('Invalid recipient address');
      }
      
      let userOpHash: string;
      
      if (tokenType === 'native') {
        userOpHash = await sendUserOperation(
          recipient,
          '0x',
          ethers.parseEther(amount)
        );
      } else {
        const transferData = new ethers.Interface([
          'function transfer(address to, uint256 amount) returns (bool)'
        ]).encodeFunctionData('transfer', [
          recipient,
          ethers.parseUnits(amount, 6)
        ]);
        
        userOpHash = await sendUserOperation(usdcAddress, transferData);
      }
      
      console.log('UserOperation sent:', userOpHash);
      onSuccess();
    } catch (err: any) {
      setError(err.message || 'Transfer failed');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg max-w-md w-full p-6">
        <h2 className="text-xl font-bold mb-4">Transfer Tokens</h2>
        
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Token</label>
            <select
              value={tokenType}
              onChange={(e) => setTokenType(e.target.value as 'native' | 'usdc')}
              className="w-full border rounded px-3 py-2"
            >
              <option value="usdc">USDC (Pay gas with USDC)</option>
              <option value="native">ZKG (Native token)</option>
            </select>
          </div>
          
          <div>
            <label className="block text-sm font-medium mb-1">Recipient Address</label>
            <input
              type="text"
              value={recipient}
              onChange={(e) => setRecipient(e.target.value)}
              onBlur={handleEstimateGas}
              placeholder="0x..."
              className="w-full border rounded px-3 py-2"
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium mb-1">Amount</label>
            <input
              type="text"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              onBlur={handleEstimateGas}
              placeholder="0.0"
              className="w-full border rounded px-3 py-2"
            />
          </div>
          
          {gasEstimate && (
            <div className="bg-gray-50 rounded p-3 text-sm">
              <div className="flex justify-between">
                <span>Estimated Gas:</span>
                <span>{ethers.formatUnits(gasEstimate, 'gwei')} gwei</span>
              </div>
              {tokenType === 'usdc' && (
                <div className="flex justify-between mt-1">
                  <span>Gas Payment:</span>
                  <span className="text-green-600">Paid with USDC</span>
                </div>
              )}
            </div>
          )}
          
          {error && (
            <div className="bg-red-50 text-red-600 p-3 rounded text-sm">
              {error}
            </div>
          )}
        </div>
        
        <div className="flex justify-end space-x-3 mt-6">
          <button
            onClick={onClose}
            className="px-4 py-2 text-gray-600 hover:text-gray-800"
          >
            Cancel
          </button>
          <button
            onClick={handleTransfer}
            disabled={isLoading || !recipient || !amount}
            className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 disabled:opacity-50"
          >
            {isLoading ? 'Sending...' : 'Send'}
          </button>
        </div>
      </div>
    </div>
  );
};