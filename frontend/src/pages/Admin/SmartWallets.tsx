import React, { useState, useEffect } from 'react';
import { 
  CubeTransparentIcon,
  MagnifyingGlassIcon,
  ArrowTopRightOnSquareIcon,
  BoltIcon,
  CheckCircleIcon,
  XCircleIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ArrowPathIcon
} from '@heroicons/react/24/outline';
import { ethers } from 'ethers';

interface SmartWallet {
  id: string;
  address: string;
  owner: string;
  deployed: boolean;
  deploymentTx?: string;
  createdAt: string;
  lastUsed?: string;
  transactionCount: number;
  nonce: number;
  balance: string;
  status: 'active' | 'inactive' | 'suspended';
  modules: string[];
}

export const AdminSmartWallets: React.FC = () => {
  const [wallets, setWallets] = useState<SmartWallet[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterDeployed, setFilterDeployed] = useState<string>('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [selectedWallet, setSelectedWallet] = useState<SmartWallet | null>(null);

  useEffect(() => {
    fetchWallets();
  }, [currentPage, searchTerm, filterDeployed]);

  const fetchWallets = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: currentPage.toString(),
        limit: '20',
        search: searchTerm,
        deployed: filterDeployed,
      });

      const response = await fetch(`/api/admin/smart-wallets?${params}`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('authToken')}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        setWallets(data.wallets);
        setTotalPages(data.totalPages);
      }
    } catch (error) {
      console.error('Failed to fetch wallets:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleRefreshBalance = async (walletAddress: string) => {
    try {
      const response = await fetch(`/api/admin/smart-wallets/${walletAddress}/refresh`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('authToken')}`,
        },
      });

      if (response.ok) {
        fetchWallets();
      }
    } catch (error) {
      console.error('Failed to refresh balance:', error);
    }
  };

  const formatAddress = (address: string) => {
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  // Mock data for development
  useEffect(() => {
    if (wallets.length === 0 && !loading) {
      setWallets([
        {
          id: '1',
          address: '0xAbCdEfAbCdEfAbCdEfAbCdEfAbCdEfAbCdEfAbCd',
          owner: '0x1234567890123456789012345678901234567890',
          deployed: true,
          deploymentTx: '0x9876543210987654321098765432109876543210987654321098765432109876',
          createdAt: '2024-01-15T10:00:00Z',
          lastUsed: '2024-01-20T15:30:00Z',
          transactionCount: 156,
          nonce: 157,
          balance: '1234567890000000000',
          status: 'active',
          modules: ['0x1111111111111111111111111111111111111111'],
        },
        {
          id: '2',
          address: '0xBcDeFbCdEfBcDeFbCdEfBcDeFbCdEfBcDeFbCdEf',
          owner: '0x2345678901234567890123456789012345678901',
          deployed: false,
          createdAt: '2024-01-18T14:00:00Z',
          transactionCount: 0,
          nonce: 0,
          balance: '0',
          status: 'inactive',
          modules: [],
        },
      ]);
    }
  }, [wallets, loading]);

  return (
    <div>
      <div className="sm:flex sm:items-center">
        <div className="sm:flex-auto">
          <h1 className="text-2xl font-semibold text-gray-900">Smart Wallets</h1>
          <p className="mt-2 text-sm text-gray-700">
            Manage and monitor ERC-4337 smart contract wallets
          </p>
        </div>
        <div className="mt-4 sm:mt-0 sm:ml-16 sm:flex-none">
          <button
            type="button"
            className="inline-flex items-center justify-center rounded-md border border-transparent bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700"
          >
            Deploy New Wallet
          </button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="mt-6 grid grid-cols-1 gap-5 sm:grid-cols-4">
        <div className="bg-white overflow-hidden rounded-lg shadow">
          <div className="p-5">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <CubeTransparentIcon className="h-6 w-6 text-blue-400" />
              </div>
              <div className="ml-5 w-0 flex-1">
                <dl>
                  <dt className="text-sm font-medium text-gray-500 truncate">Total Wallets</dt>
                  <dd className="text-2xl font-semibold text-gray-900">1,234</dd>
                </dl>
              </div>
            </div>
          </div>
        </div>
        <div className="bg-white overflow-hidden rounded-lg shadow">
          <div className="p-5">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <CheckCircleIcon className="h-6 w-6 text-green-400" />
              </div>
              <div className="ml-5 w-0 flex-1">
                <dl>
                  <dt className="text-sm font-medium text-gray-500 truncate">Deployed</dt>
                  <dd className="text-2xl font-semibold text-gray-900">856</dd>
                </dl>
              </div>
            </div>
          </div>
        </div>
        <div className="bg-white overflow-hidden rounded-lg shadow">
          <div className="p-5">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <BoltIcon className="h-6 w-6 text-yellow-400" />
              </div>
              <div className="ml-5 w-0 flex-1">
                <dl>
                  <dt className="text-sm font-medium text-gray-500 truncate">Active (24h)</dt>
                  <dd className="text-2xl font-semibold text-gray-900">342</dd>
                </dl>
              </div>
            </div>
          </div>
        </div>
        <div className="bg-white overflow-hidden rounded-lg shadow">
          <div className="p-5">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <ArrowTopRightOnSquareIcon className="h-6 w-6 text-purple-400" />
              </div>
              <div className="ml-5 w-0 flex-1">
                <dl>
                  <dt className="text-sm font-medium text-gray-500 truncate">Total Value</dt>
                  <dd className="text-2xl font-semibold text-gray-900">$2.4M</dd>
                </dl>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="mt-6 flex flex-col sm:flex-row gap-4">
        <div className="flex-1">
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <MagnifyingGlassIcon className="h-5 w-5 text-gray-400" />
            </div>
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md leading-5 bg-white placeholder-gray-500 focus:outline-none focus:placeholder-gray-400 focus:ring-1 focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
              placeholder="Search by address or owner..."
            />
          </div>
        </div>
        <select
          value={filterDeployed}
          onChange={(e) => setFilterDeployed(e.target.value)}
          className="block w-48 pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm rounded-md"
        >
          <option value="all">All Wallets</option>
          <option value="deployed">Deployed Only</option>
          <option value="undeployed">Undeployed Only</option>
        </select>
      </div>

      {/* Wallets Table */}
      <div className="mt-6 flex flex-col">
        <div className="-my-2 -mx-4 overflow-x-auto sm:-mx-6 lg:-mx-8">
          <div className="inline-block min-w-full py-2 align-middle md:px-6 lg:px-8">
            <div className="overflow-hidden shadow ring-1 ring-black ring-opacity-5 md:rounded-lg">
              <table className="min-w-full divide-y divide-gray-300">
                <thead className="bg-gray-50">
                  <tr>
                    <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">
                      Wallet Address
                    </th>
                    <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">
                      Owner
                    </th>
                    <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">
                      Status
                    </th>
                    <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">
                      Balance
                    </th>
                    <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">
                      Transactions
                    </th>
                    <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">
                      Last Activity
                    </th>
                    <th scope="col" className="relative py-3.5 pl-3 pr-4 sm:pr-6">
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 bg-white">
                  {loading ? (
                    <tr>
                      <td colSpan={7} className="text-center py-8 text-gray-500">
                        Loading...
                      </td>
                    </tr>
                  ) : wallets.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="text-center py-8 text-gray-500">
                        No wallets found
                      </td>
                    </tr>
                  ) : (
                    wallets.map((wallet) => (
                      <tr key={wallet.id} className="hover:bg-gray-50">
                        <td className="whitespace-nowrap px-3 py-4 text-sm">
                          <div className="flex items-center">
                            <div>
                              <div className="font-mono text-sm text-gray-900">
                                {formatAddress(wallet.address)}
                              </div>
                              {wallet.deployed ? (
                                <div className="text-xs text-green-600 flex items-center mt-1">
                                  <CheckCircleIcon className="h-3 w-3 mr-1" />
                                  Deployed
                                </div>
                              ) : (
                                <div className="text-xs text-gray-500 flex items-center mt-1">
                                  <XCircleIcon className="h-3 w-3 mr-1" />
                                  Not Deployed
                                </div>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="whitespace-nowrap px-3 py-4 text-sm">
                          <div className="font-mono text-xs text-gray-900">
                            {formatAddress(wallet.owner)}
                          </div>
                        </td>
                        <td className="whitespace-nowrap px-3 py-4 text-sm">
                          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                            wallet.status === 'active' 
                              ? 'bg-green-100 text-green-800'
                              : wallet.status === 'suspended'
                              ? 'bg-red-100 text-red-800'
                              : 'bg-gray-100 text-gray-800'
                          }`}>
                            {wallet.status.charAt(0).toUpperCase() + wallet.status.slice(1)}
                          </span>
                        </td>
                        <td className="whitespace-nowrap px-3 py-4 text-sm">
                          <div className="flex items-center">
                            <span className="text-gray-900">
                              {ethers.formatEther(wallet.balance)} ETH
                            </span>
                            <button
                              onClick={() => handleRefreshBalance(wallet.address)}
                              className="ml-2 text-gray-400 hover:text-gray-600"
                            >
                              <ArrowPathIcon className="h-4 w-4" />
                            </button>
                          </div>
                        </td>
                        <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-900">
                          {wallet.transactionCount}
                        </td>
                        <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">
                          {wallet.lastUsed ? formatDate(wallet.lastUsed) : 'Never'}
                        </td>
                        <td className="relative whitespace-nowrap py-4 pl-3 pr-4 text-right text-sm font-medium sm:pr-6">
                          <button
                            onClick={() => setSelectedWallet(wallet)}
                            className="text-blue-600 hover:text-blue-900 mr-4"
                          >
                            Details
                          </button>
                          <a
                            href={`${process.env.REACT_APP_EXPLORER_URL}/address/${wallet.address}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-600 hover:text-blue-900"
                          >
                            Explorer
                          </a>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      {/* Pagination */}
      <div className="mt-4 flex items-center justify-between">
        <div className="flex-1 flex justify-between sm:hidden">
          <button
            onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
            disabled={currentPage === 1}
            className="relative inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"
          >
            Previous
          </button>
          <button
            onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
            disabled={currentPage === totalPages}
            className="ml-3 relative inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"
          >
            Next
          </button>
        </div>
        <div className="hidden sm:flex-1 sm:flex sm:items-center sm:justify-between">
          <div>
            <p className="text-sm text-gray-700">
              Page <span className="font-medium">{currentPage}</span> of{' '}
              <span className="font-medium">{totalPages}</span>
            </p>
          </div>
          <div>
            <nav className="relative z-0 inline-flex rounded-md shadow-sm -space-x-px">
              <button
                onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                disabled={currentPage === 1}
                className="relative inline-flex items-center px-2 py-2 rounded-l-md border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50"
              >
                <ChevronLeftIcon className="h-5 w-5" />
              </button>
              <button
                onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
                disabled={currentPage === totalPages}
                className="relative inline-flex items-center px-2 py-2 rounded-r-md border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50"
              >
                <ChevronRightIcon className="h-5 w-5" />
              </button>
            </nav>
          </div>
        </div>
      </div>

      {/* Wallet Details Modal */}
      {selectedWallet && (
        <div className="fixed inset-0 bg-gray-500 bg-opacity-75 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-medium text-gray-900">Wallet Details</h3>
                <button
                  onClick={() => setSelectedWallet(null)}
                  className="text-gray-400 hover:text-gray-500"
                >
                  <XCircleIcon className="h-6 w-6" />
                </button>
              </div>
              
              <div className="space-y-4">
                <div>
                  <dt className="text-sm font-medium text-gray-500">Address</dt>
                  <dd className="mt-1 text-sm text-gray-900 font-mono">{selectedWallet.address}</dd>
                </div>
                
                <div>
                  <dt className="text-sm font-medium text-gray-500">Owner</dt>
                  <dd className="mt-1 text-sm text-gray-900 font-mono">{selectedWallet.owner}</dd>
                </div>
                
                <div>
                  <dt className="text-sm font-medium text-gray-500">Deployment Transaction</dt>
                  <dd className="mt-1">
                    {selectedWallet.deploymentTx ? (
                      <a
                        href={`${process.env.REACT_APP_EXPLORER_URL}/tx/${selectedWallet.deploymentTx}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-600 hover:text-blue-900 font-mono text-sm"
                      >
                        {formatAddress(selectedWallet.deploymentTx)}
                      </a>
                    ) : (
                      <span className="text-gray-500">Not deployed</span>
                    )}
                  </dd>
                </div>
                
                <div>
                  <dt className="text-sm font-medium text-gray-500">Nonce</dt>
                  <dd className="mt-1 text-sm text-gray-900">{selectedWallet.nonce}</dd>
                </div>
                
                <div>
                  <dt className="text-sm font-medium text-gray-500">Modules</dt>
                  <dd className="mt-1">
                    {selectedWallet.modules.length > 0 ? (
                      <ul className="space-y-1">
                        {selectedWallet.modules.map((module, idx) => (
                          <li key={idx} className="text-sm text-gray-900 font-mono">
                            {formatAddress(module)}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <span className="text-gray-500">No modules installed</span>
                    )}
                  </dd>
                </div>
                
                <div>
                  <dt className="text-sm font-medium text-gray-500">Created</dt>
                  <dd className="mt-1 text-sm text-gray-900">{formatDate(selectedWallet.createdAt)}</dd>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};