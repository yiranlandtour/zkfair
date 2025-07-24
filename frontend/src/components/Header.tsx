import React from 'react';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { Link, useLocation } from 'react-router-dom';

export const Header: React.FC = () => {
  const location = useLocation();
  
  return (
    <header className="bg-white shadow-sm border-b">
      <div className="container mx-auto px-4 py-4">
        <div className="flex justify-between items-center">
          <div className="flex items-center space-x-4">
            <Link to="/" className="text-2xl font-bold text-gray-900 hover:text-blue-600">
              ZKFair L2
            </Link>
            <span className="text-sm text-gray-500">
              Polygon CDK + Celestia DA + Stablecoin Gas
            </span>
          </div>
          
          <div className="flex items-center space-x-4">
            <Link
              to="/"
              className={`px-3 py-2 rounded-md text-sm font-medium ${
                location.pathname === '/' 
                  ? 'text-blue-600 bg-blue-50' 
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              Dashboard
            </Link>
            <Link
              to="/wallet"
              className={`px-3 py-2 rounded-md text-sm font-medium ${
                location.pathname === '/wallet' 
                  ? 'text-blue-600 bg-blue-50' 
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              Advanced Wallet
            </Link>
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