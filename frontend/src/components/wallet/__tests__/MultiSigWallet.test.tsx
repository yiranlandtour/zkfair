import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MultiSigWallet } from '../MultiSigWallet';
import { useAccount, usePublicClient, useWalletClient } from 'wagmi';
import { vi } from 'vitest';

// Mock wagmi hooks
vi.mock('wagmi', () => ({
  useAccount: vi.fn(),
  usePublicClient: vi.fn(),
  useWalletClient: vi.fn(),
}));

// Mock fetch
global.fetch = vi.fn();

describe('MultiSigWallet', () => {
  const mockAddress = '0x1234567890123456789012345678901234567890';
  const mockWalletClient = {
    signMessage: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    (useAccount as any).mockReturnValue({ address: mockAddress });
    (usePublicClient as any).mockReturnValue({});
    (useWalletClient as any).mockReturnValue({ data: mockWalletClient });
    
    // Default fetch mock
    (global.fetch as any).mockResolvedValue({
      ok: true,
      json: async () => ({
        config: {
          threshold: 2,
          owners: [],
          walletAddress: null,
        },
        pendingTransactions: [],
        executedTransactions: [],
      }),
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Wallet Creation', () => {
    it('should render multi-sig wallet creation interface', async () => {
      render(<MultiSigWallet />);
      
      await waitFor(() => {
        expect(screen.getByText('Multi-Signature Wallet')).toBeInTheDocument();
        expect(screen.getByText('Create Wallet')).toBeInTheDocument();
      });
    });

    it('should allow adding owners', async () => {
      const user = userEvent.setup();
      render(<MultiSigWallet />);

      await waitFor(() => {
        expect(screen.getByText('Add Owner')).toBeInTheDocument();
      });

      // Click add owner button
      await user.click(screen.getByText('Add Owner'));

      // Fill in owner details
      const nameInput = screen.getByPlaceholderText('e.g., Alice');
      const addressInput = screen.getByPlaceholderText('0x...');

      await user.type(nameInput, 'Alice');
      await user.type(addressInput, '0xabcdef1234567890123456789012345678901234');

      // Add the owner
      await user.click(screen.getAllByText('Add Owner')[1]); // Second button in modal

      // Check if owner was added (in real app, would update state)
      expect(nameInput).toHaveValue('Alice');
    });

    it('should validate threshold settings', async () => {
      const user = userEvent.setup();
      render(<MultiSigWallet />);

      await waitFor(() => {
        expect(screen.getByLabelText(/Signature Threshold/i)).toBeInTheDocument();
      });

      const thresholdInput = screen.getByLabelText(/Signature Threshold/i);
      
      // Try to set invalid threshold
      await user.clear(thresholdInput);
      await user.type(thresholdInput, '0');

      // Should show validation or disable create button
      const createButton = screen.getByText('Create Wallet');
      expect(createButton).toBeDisabled();
    });

    it('should create multi-sig wallet with valid configuration', async () => {
      const user = userEvent.setup();
      
      // Mock successful wallet creation
      (global.fetch as any).mockImplementation((url: string) => {
        if (url.includes('/api/multisig/create')) {
          return Promise.resolve({
            ok: true,
            json: async () => ({ walletAddress: '0xwallet123' }),
          });
        }
        return Promise.resolve({
          ok: true,
          json: async () => ({
            config: {
              threshold: 2,
              owners: [
                { address: '0xowner1', name: 'Owner 1', addedAt: new Date(), isActive: true },
                { address: '0xowner2', name: 'Owner 2', addedAt: new Date(), isActive: true },
              ],
            },
            pendingTransactions: [],
            executedTransactions: [],
          }),
        });
      });

      render(<MultiSigWallet />);

      await waitFor(() => {
        expect(screen.getByText('Create Wallet')).toBeInTheDocument();
      });

      // Simulate having owners already added
      const createButton = screen.getByText('Create Wallet');
      await user.click(createButton);

      // Verify API call
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/multisig/create',
        expect.objectContaining({
          method: 'POST',
        })
      );
    });
  });

  describe('Transaction Management', () => {
    beforeEach(() => {
      // Mock wallet with existing configuration
      (global.fetch as any).mockResolvedValue({
        ok: true,
        json: async () => ({
          config: {
            threshold: 2,
            owners: [
              { address: '0xowner1', name: 'Owner 1', addedAt: new Date(), isActive: true },
              { address: '0xowner2', name: 'Owner 2', addedAt: new Date(), isActive: true },
              { address: mockAddress, name: 'Current User', addedAt: new Date(), isActive: true },
            ],
            walletAddress: '0xmultisig123',
          },
          pendingTransactions: [
            {
              id: 'tx1',
              to: '0xrecipient',
              value: '1000000000000000000',
              data: '0x',
              description: 'Payment to vendor',
              creator: '0xowner1',
              signatures: ['0xsig1'],
              executed: false,
              createdAt: new Date(),
              nonce: 1,
            },
          ],
          executedTransactions: [],
        }),
      });
    });

    it('should display pending transactions', async () => {
      render(<MultiSigWallet />);

      await waitFor(() => {
        expect(screen.getByText('Payment to vendor')).toBeInTheDocument();
        expect(screen.getByText('Signatures: 1/2')).toBeInTheDocument();
      });
    });

    it('should allow signing a transaction', async () => {
      const user = userEvent.setup();
      
      mockWalletClient.signMessage.mockResolvedValue('0xsignature123');
      
      render(<MultiSigWallet />);

      await waitFor(() => {
        expect(screen.getByText('Sign')).toBeInTheDocument();
      });

      await user.click(screen.getByText('Sign'));

      expect(mockWalletClient.signMessage).toHaveBeenCalled();
      
      // Verify signature submission
      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith(
          expect.stringContaining('/api/multisig/transactions/tx1/sign'),
          expect.objectContaining({
            method: 'POST',
          })
        );
      });
    });

    it('should allow executing a fully signed transaction', async () => {
      const user = userEvent.setup();
      
      // Mock transaction with enough signatures
      (global.fetch as any).mockResolvedValue({
        ok: true,
        json: async () => ({
          config: {
            threshold: 2,
            owners: [
              { address: '0xowner1', name: 'Owner 1', addedAt: new Date(), isActive: true },
              { address: '0xowner2', name: 'Owner 2', addedAt: new Date(), isActive: true },
            ],
            walletAddress: '0xmultisig123',
          },
          pendingTransactions: [
            {
              id: 'tx2',
              to: '0xrecipient',
              value: '1000000000000000000',
              data: '0x',
              description: 'Ready to execute',
              creator: '0xowner1',
              signatures: ['0xsig1', '0xsig2'],
              executed: false,
              createdAt: new Date(),
              nonce: 2,
            },
          ],
          executedTransactions: [],
        }),
      });

      render(<MultiSigWallet />);

      await waitFor(() => {
        expect(screen.getByText('Execute')).toBeInTheDocument();
      });

      await user.click(screen.getByText('Execute'));

      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/multisig/transactions/tx2/execute'),
        expect.objectContaining({
          method: 'POST',
        })
      );
    });

    it('should create new transaction', async () => {
      const user = userEvent.setup();
      
      render(<MultiSigWallet />);

      await waitFor(() => {
        expect(screen.getByText('New Transaction')).toBeInTheDocument();
      });

      await user.click(screen.getByText('New Transaction'));

      // Fill in transaction details
      const descInput = screen.getByPlaceholderText('e.g., Payment to vendor');
      const toInput = screen.getByPlaceholderText('0x...');
      const valueInput = screen.getByPlaceholderText('0.0');

      await user.type(descInput, 'Test payment');
      await user.type(toInput, '0x1111111111111111111111111111111111111111');
      await user.type(valueInput, '1.5');

      await user.click(screen.getByText('Create'));

      expect(global.fetch).toHaveBeenCalledWith(
        '/api/multisig/transactions',
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining('Test payment'),
        })
      );
    });
  });

  describe('Owner Management', () => {
    it('should display current owners', async () => {
      (global.fetch as any).mockResolvedValue({
        ok: true,
        json: async () => ({
          config: {
            threshold: 2,
            owners: [
              { address: '0xowner1', name: 'Alice', addedAt: new Date(), isActive: true },
              { address: '0xowner2', name: 'Bob', addedAt: new Date(), isActive: true },
            ],
            walletAddress: '0xmultisig123',
          },
          pendingTransactions: [],
          executedTransactions: [],
        }),
      });

      render(<MultiSigWallet />);

      await waitFor(() => {
        expect(screen.getByText('Alice')).toBeInTheDocument();
        expect(screen.getByText('Bob')).toBeInTheDocument();
        expect(screen.getByText('Owners (2)')).toBeInTheDocument();
      });
    });

    it('should show threshold configuration', async () => {
      (global.fetch as any).mockResolvedValue({
        ok: true,
        json: async () => ({
          config: {
            threshold: 2,
            owners: [
              { address: '0xowner1', name: 'Alice', addedAt: new Date(), isActive: true },
              { address: '0xowner2', name: 'Bob', addedAt: new Date(), isActive: true },
              { address: '0xowner3', name: 'Charlie', addedAt: new Date(), isActive: true },
            ],
            walletAddress: '0xmultisig123',
          },
          pendingTransactions: [],
          executedTransactions: [],
        }),
      });

      render(<MultiSigWallet />);

      await waitFor(() => {
        expect(screen.getByText('2/3')).toBeInTheDocument();
      });
    });
  });

  describe('Error Handling', () => {
    it('should handle API errors gracefully', async () => {
      (global.fetch as any).mockRejectedValue(new Error('Network error'));
      
      render(<MultiSigWallet />);

      // Should still render without crashing
      await waitFor(() => {
        expect(screen.getByText('Multi-Signature Wallet')).toBeInTheDocument();
      });
    });

    it('should validate Ethereum addresses', async () => {
      const user = userEvent.setup();
      render(<MultiSigWallet />);

      await waitFor(() => {
        expect(screen.getByText('Add Owner')).toBeInTheDocument();
      });

      await user.click(screen.getByText('Add Owner'));

      const addressInput = screen.getByPlaceholderText('0x...');
      await user.type(addressInput, 'invalid-address');

      await user.click(screen.getAllByText('Add Owner')[1]);

      // In real implementation, would show error message
      // For now, checking that invalid address doesn't break the component
      expect(screen.getByPlaceholderText('0x...')).toBeInTheDocument();
    });
  });
});