import React, { useState, useEffect } from 'react';
import { ethers } from 'ethers';

interface Transaction {
  userOpHash: string;
  sender: string;
  target: string;
  value: string;
  success: boolean;
  timestamp: number;
  actualGasCost: string;
  transactionHash: string;
}

interface TransactionHistoryProps {
  smartWalletAddress: string;
}

export const TransactionHistory: React.FC<TransactionHistoryProps> = ({ 
  smartWalletAddress 
}) => {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadTransactions();
    const interval = setInterval(loadTransactions, 10000);
    return () => clearInterval(interval);
  }, [smartWalletAddress]);

  const loadTransactions = async () => {
    try {
      const response = await fetch(
        `${process.env.REACT_APP_API_URL}/transactions/${smartWalletAddress}`
      );
      
      if (response.ok) {
        const data = await response.json();
        setTransactions(data);
      }
    } catch (error) {
      console.error('Failed to load transactions:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const formatAddress = (address: string) => {
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  };

  const formatTimestamp = (timestamp: number) => {
    return new Date(timestamp * 1000).toLocaleString();
  };

  if (isLoading) {
    return (
      <div className="bg-white rounded-lg shadow-md p-6">
        <h3 className="text-lg font-semibold mb-4">Transaction History</h3>
        <div className="text-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow-md p-6">
      <h3 className="text-lg font-semibold mb-4">Transaction History</h3>
      
      {transactions.length === 0 ? (
        <p className="text-gray-500 text-center py-8">No transactions yet</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="text-left border-b">
                <th className="pb-2 text-sm font-medium">Time</th>
                <th className="pb-2 text-sm font-medium">Type</th>
                <th className="pb-2 text-sm font-medium">To</th>
                <th className="pb-2 text-sm font-medium">Value</th>
                <th className="pb-2 text-sm font-medium">Gas Cost</th>
                <th className="pb-2 text-sm font-medium">Status</th>
                <th className="pb-2 text-sm font-medium">Tx Hash</th>
              </tr>
            </thead>
            <tbody>
              {transactions.map((tx) => (
                <tr key={tx.userOpHash} className="border-b">
                  <td className="py-3 text-sm">
                    {formatTimestamp(tx.timestamp)}
                  </td>
                  <td className="py-3 text-sm">
                    {tx.value === '0' ? 'Contract' : 'Transfer'}
                  </td>
                  <td className="py-3 text-sm font-mono">
                    {formatAddress(tx.target)}
                  </td>
                  <td className="py-3 text-sm">
                    {ethers.formatEther(tx.value)} ZKG
                  </td>
                  <td className="py-3 text-sm">
                    {ethers.formatUnits(tx.actualGasCost, 'gwei')} gwei
                  </td>
                  <td className="py-3 text-sm">
                    <span className={`px-2 py-1 rounded text-xs ${
                      tx.success 
                        ? 'bg-green-100 text-green-800' 
                        : 'bg-red-100 text-red-800'
                    }`}>
                      {tx.success ? 'Success' : 'Failed'}
                    </span>
                  </td>
                  <td className="py-3 text-sm">
                    <a
                      href={`${process.env.REACT_APP_EXPLORER_URL}/tx/${tx.transactionHash}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-600 hover:underline font-mono"
                    >
                      {formatAddress(tx.transactionHash)}
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};