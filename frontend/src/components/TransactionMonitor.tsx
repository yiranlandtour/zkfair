import React, { useState, useEffect } from 'react';
import { useUserOperationStatus } from '../hooks/useWebSocket';
import { ethers } from 'ethers';

interface TransactionMonitorProps {
  userOpHash: string;
  onComplete?: () => void;
}

export const TransactionMonitor: React.FC<TransactionMonitorProps> = ({
  userOpHash,
  onComplete,
}) => {
  const status = useUserOperationStatus(userOpHash);
  const [elapsedTime, setElapsedTime] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setElapsedTime((prev) => prev + 1);
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (status && (status.status === 'included' || status.status === 'failed')) {
      onComplete?.();
    }
  }, [status, onComplete]);

  const getStatusIcon = () => {
    if (!status) return '⏳';
    switch (status.status) {
      case 'pending':
        return '⏳';
      case 'included':
        return '✅';
      case 'failed':
        return '❌';
      default:
        return '❓';
    }
  };

  const getStatusText = () => {
    if (!status) return 'Initializing...';
    switch (status.status) {
      case 'pending':
        return 'Transaction pending...';
      case 'included':
        return 'Transaction confirmed!';
      case 'failed':
        return 'Transaction failed';
      default:
        return 'Unknown status';
    }
  };

  const getStatusColor = () => {
    if (!status) return 'text-gray-600';
    switch (status.status) {
      case 'pending':
        return 'text-yellow-600';
      case 'included':
        return 'text-green-600';
      case 'failed':
        return 'text-red-600';
      default:
        return 'text-gray-600';
    }
  };

  return (
    <div className="bg-white rounded-lg shadow-md p-6">
      <h3 className="text-lg font-semibold mb-4">Transaction Status</h3>
      
      <div className="space-y-4">
        {/* Status Header */}
        <div className="flex items-center space-x-3">
          <span className="text-2xl">{getStatusIcon()}</span>
          <div>
            <p className={`font-medium ${getStatusColor()}`}>
              {getStatusText()}
            </p>
            <p className="text-sm text-gray-500">
              {elapsedTime}s elapsed
            </p>
          </div>
        </div>

        {/* UserOp Hash */}
        <div>
          <label className="text-sm text-gray-600">UserOperation Hash</label>
          <div className="font-mono text-xs bg-gray-100 p-2 rounded break-all">
            {userOpHash}
          </div>
        </div>

        {/* Transaction Hash (if available) */}
        {status?.transactionHash && (
          <div>
            <label className="text-sm text-gray-600">Transaction Hash</label>
            <div className="font-mono text-xs bg-gray-100 p-2 rounded break-all">
              <a
                href={`${process.env.REACT_APP_EXPLORER_URL}/tx/${status.transactionHash}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 hover:underline"
              >
                {status.transactionHash}
              </a>
            </div>
          </div>
        )}

        {/* Block Number */}
        {status?.blockNumber && (
          <div className="flex justify-between text-sm">
            <span className="text-gray-600">Block Number</span>
            <span className="font-medium">#{status.blockNumber}</span>
          </div>
        )}

        {/* Gas Cost */}
        {status?.actualGasCost && (
          <div className="flex justify-between text-sm">
            <span className="text-gray-600">Gas Cost</span>
            <span className="font-medium">
              {ethers.formatUnits(status.actualGasCost, 'gwei')} gwei
            </span>
          </div>
        )}

        {/* Error Reason */}
        {status?.reason && (
          <div className="bg-red-50 border border-red-200 rounded p-3">
            <p className="text-sm text-red-800">
              <strong>Error:</strong> {status.reason}
            </p>
          </div>
        )}

        {/* Progress Bar */}
        {status?.status === 'pending' && (
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div
              className="bg-blue-600 h-2 rounded-full animate-pulse"
              style={{ width: '60%' }}
            />
          </div>
        )}
      </div>
    </div>
  );
};