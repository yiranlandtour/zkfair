import React from 'react';
import { ConnectButton } from '@rainbow-me/rainbowkit';

export const Header: React.FC = () => {
  return (
    <header className="bg-white shadow-sm border-b">
      <div className="container mx-auto px-4 py-4">
        <div className="flex justify-between items-center">
          <div className="flex items-center space-x-4">
            <h1 className="text-2xl font-bold text-gray-900">ZKFair L2</h1>
            <span className="text-sm text-gray-500">
              Polygon CDK + Celestia DA + Stablecoin Gas
            </span>
          </div>
          
          <div className="flex items-center space-x-4">
            <a
              href="https://docs.zkfair.io"
              target="_blank"
              rel="noopener noreferrer"
              className="text-gray-600 hover:text-gray-900"
            >
              Docs
            </a>
            <a
              href="https://faucet.zkfair.io"
              target="_blank"
              rel="noopener noreferrer"
              className="text-gray-600 hover:text-gray-900"
            >
              Faucet
            </a>
            <ConnectButton />
          </div>
        </div>
      </div>
    </header>
  );
};