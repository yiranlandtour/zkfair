import React from 'react';
import { ethers } from 'ethers';

interface BalanceCardProps {
  title: string;
  balance: bigint;
  symbol: string;
  decimals: number;
}

export const BalanceCard: React.FC<BalanceCardProps> = ({
  title,
  balance,
  symbol,
  decimals
}) => {
  const formattedBalance = ethers.formatUnits(balance, decimals);
  
  return (
    <div className="bg-white rounded-lg shadow-md p-6">
      <h3 className="text-sm text-gray-600 mb-2">{title}</h3>
      <div className="flex items-baseline space-x-2">
        <span className="text-2xl font-bold">
          {parseFloat(formattedBalance).toFixed(4)}
        </span>
        <span className="text-gray-600">{symbol}</span>
      </div>
    </div>
  );
};