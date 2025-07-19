import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { TransactionHistory } from '../TransactionHistory';

// Mock fetch
global.fetch = jest.fn();

const mockTransactions = [
  {
    userOpHash: '0x123',
    sender: '0x1234567890123456789012345678901234567890',
    target: '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd',
    value: '1000000000000000000', // 1 ETH
    success: true,
    timestamp: 1672531200,
    actualGasCost: '21000000000000', // 21000 gwei
    transactionHash: '0x9876543210987654321098765432109876543210',
  },
  {
    userOpHash: '0x456',
    sender: '0x1234567890123456789012345678901234567890',
    target: '0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef',
    value: '0', // Contract call
    success: false,
    timestamp: 1672531500,
    actualGasCost: '50000000000000', // 50000 gwei
    transactionHash: '0xfedcbafedcbafedcbafedcbafedcbafedcbafed',
  },
];

describe('TransactionHistory', () => {
  const defaultProps = {
    smartWalletAddress: '0x1234567890123456789012345678901234567890',
  };

  beforeEach(() => {
    jest.clearAllMocks();
    jest.clearAllTimers();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('renders loading state initially', () => {
    (fetch as jest.Mock).mockImplementation(() => new Promise(() => {}));
    
    const { container } = render(<TransactionHistory {...defaultProps} />);
    
    expect(screen.getByText('Transaction History')).toBeInTheDocument();
    expect(container.querySelector('.animate-spin')).toBeInTheDocument();
  });

  it('renders empty state when no transactions', async () => {
    (fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => [],
    });
    
    render(<TransactionHistory {...defaultProps} />);
    
    await waitFor(() => {
      expect(screen.getByText('No transactions yet')).toBeInTheDocument();
    });
  });

  it('renders transaction list successfully', async () => {
    (fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => mockTransactions,
    });
    
    render(<TransactionHistory {...defaultProps} />);
    
    await waitFor(() => {
      // Check headers
      expect(screen.getByText('Time')).toBeInTheDocument();
      expect(screen.getByText('Type')).toBeInTheDocument();
      expect(screen.getByText('To')).toBeInTheDocument();
      expect(screen.getByText('Value')).toBeInTheDocument();
      expect(screen.getByText('Gas Cost')).toBeInTheDocument();
      expect(screen.getByText('Status')).toBeInTheDocument();
      expect(screen.getByText('Tx Hash')).toBeInTheDocument();
      
      // Check first transaction
      expect(screen.getByText('Transfer')).toBeInTheDocument();
      expect(screen.getByText('1.0 ZKG')).toBeInTheDocument();
      expect(screen.getByText('21000.0 gwei')).toBeInTheDocument();
      expect(screen.getByText('Success')).toBeInTheDocument();
      
      // Check second transaction
      expect(screen.getByText('Contract')).toBeInTheDocument();
      expect(screen.getByText('0.0 ZKG')).toBeInTheDocument();
      expect(screen.getByText('50000.0 gwei')).toBeInTheDocument();
      expect(screen.getByText('Failed')).toBeInTheDocument();
    });
  });

  it('formats addresses correctly', async () => {
    (fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => mockTransactions,
    });
    
    render(<TransactionHistory {...defaultProps} />);
    
    await waitFor(() => {
      expect(screen.getByText('0xabcd...abcd')).toBeInTheDocument();
      expect(screen.getByText('0xdead...beef')).toBeInTheDocument();
    });
  });

  it('provides working explorer links', async () => {
    process.env.REACT_APP_EXPLORER_URL = 'https://explorer.zkfair.io';
    
    (fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => mockTransactions,
    });
    
    render(<TransactionHistory {...defaultProps} />);
    
    await waitFor(() => {
      const links = screen.getAllByRole('link');
      expect(links[0]).toHaveAttribute(
        'href',
        'https://explorer.zkfair.io/tx/0x9876543210987654321098765432109876543210'
      );
      expect(links[0]).toHaveAttribute('target', '_blank');
      expect(links[0]).toHaveAttribute('rel', 'noopener noreferrer');
    });
  });

  it('refreshes data periodically', async () => {
    (fetch as jest.Mock)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => mockTransactions.slice(0, 1),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => mockTransactions,
      });
    
    render(<TransactionHistory {...defaultProps} />);
    
    await waitFor(() => {
      expect(screen.queryByText('Contract')).not.toBeInTheDocument();
    });
    
    // Fast forward 10 seconds
    jest.advanceTimersByTime(10000);
    
    await waitFor(() => {
      expect(screen.getByText('Contract')).toBeInTheDocument();
    });
    
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('handles fetch errors gracefully', async () => {
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
    
    (fetch as jest.Mock).mockRejectedValueOnce(new Error('Network error'));
    
    render(<TransactionHistory {...defaultProps} />);
    
    await waitFor(() => {
      expect(screen.getByText('No transactions yet')).toBeInTheDocument();
    });
    
    expect(consoleSpy).toHaveBeenCalledWith(
      'Failed to load transactions:',
      expect.any(Error)
    );
    
    consoleSpy.mockRestore();
  });

  it('shows correct status styling', async () => {
    (fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => mockTransactions,
    });
    
    render(<TransactionHistory {...defaultProps} />);
    
    await waitFor(() => {
      const successBadge = screen.getByText('Success');
      expect(successBadge).toHaveClass('bg-green-100', 'text-green-800');
      
      const failedBadge = screen.getByText('Failed');
      expect(failedBadge).toHaveClass('bg-red-100', 'text-red-800');
    });
  });

  it('cleans up interval on unmount', async () => {
    const clearIntervalSpy = jest.spyOn(global, 'clearInterval');
    
    (fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => [],
    });
    
    const { unmount } = render(<TransactionHistory {...defaultProps} />);
    
    await waitFor(() => {
      expect(screen.getByText('No transactions yet')).toBeInTheDocument();
    });
    
    unmount();
    
    expect(clearIntervalSpy).toHaveBeenCalled();
  });
});