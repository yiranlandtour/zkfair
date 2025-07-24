import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BatchTransactions } from '../BatchTransactions';
import { useAccount } from 'wagmi';
import { useSmartWallet } from '../../../contexts/SmartWalletContext';
import { vi } from 'vitest';
import { ethers } from 'ethers';

// Mock wagmi hooks
vi.mock('wagmi', () => ({
  useAccount: vi.fn(),
}));

// Mock SmartWallet context
vi.mock('../../../contexts/SmartWalletContext', () => ({
  useSmartWallet: vi.fn(),
}));

// Mock fetch
global.fetch = vi.fn();

// Mock file operations
global.URL.createObjectURL = vi.fn(() => 'blob:mock-url');
global.URL.revokeObjectURL = vi.fn();

describe('BatchTransactions', () => {
  const mockAddress = '0x1234567890123456789012345678901234567890';
  const mockSmartWallet = {
    sendUserOperation: vi.fn(),
    estimateGas: vi.fn(),
    getBalance: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    (useAccount as any).mockReturnValue({ address: mockAddress });
    (useSmartWallet as any).mockReturnValue(mockSmartWallet);
    
    // Default fetch mock for templates
    (global.fetch as any).mockResolvedValue({
      ok: true,
      json: async () => [],
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Transaction Queue Management', () => {
    it('should render batch transactions interface', async () => {
      render(<BatchTransactions />);
      
      await waitFor(() => {
        expect(screen.getByText('Batch Transactions')).toBeInTheDocument();
        expect(screen.getByText('Add Transaction')).toBeInTheDocument();
      });
    });

    it('should add transaction to batch', async () => {
      const user = userEvent.setup();
      render(<BatchTransactions />);

      // Fill in transaction details
      const descInput = screen.getByPlaceholderText('e.g., Payment to vendor');
      const toInput = screen.getByPlaceholderText('0x...');
      const valueInput = screen.getByPlaceholderText('0.0');

      await user.type(descInput, 'Test Payment');
      await user.type(toInput, '0xabcdef1234567890123456789012345678901234');
      await user.type(valueInput, '1.5');

      // Add transaction
      await user.click(screen.getByRole('button', { name: /add transaction/i }));

      // Check if transaction appears in queue
      await waitFor(() => {
        expect(screen.getByText('Test Payment')).toBeInTheDocument();
        expect(screen.getByText('1.5 ETH')).toBeInTheDocument();
      });
    });

    it('should validate recipient address', async () => {
      const user = userEvent.setup();
      window.alert = vi.fn();
      
      render(<BatchTransactions />);

      const descInput = screen.getByPlaceholderText('e.g., Payment to vendor');
      const toInput = screen.getByPlaceholderText('0x...');
      
      await user.type(descInput, 'Invalid Address Test');
      await user.type(toInput, 'invalid-address');

      await user.click(screen.getByRole('button', { name: /add transaction/i }));

      expect(window.alert).toHaveBeenCalledWith('Invalid recipient address');
    });

    it('should remove transaction from batch', async () => {
      const user = userEvent.setup();
      render(<BatchTransactions />);

      // Add a transaction first
      const descInput = screen.getByPlaceholderText('e.g., Payment to vendor');
      const toInput = screen.getByPlaceholderText('0x...');
      
      await user.type(descInput, 'Transaction to Remove');
      await user.type(toInput, '0xabcdef1234567890123456789012345678901234');

      await user.click(screen.getByRole('button', { name: /add transaction/i }));

      // Wait for transaction to appear
      await waitFor(() => {
        expect(screen.getByText('Transaction to Remove')).toBeInTheDocument();
      });

      // Remove transaction
      const removeButton = screen.getByRole('button', { name: '' }).querySelector('svg');
      if (removeButton) {
        await user.click(removeButton.parentElement as HTMLElement);
      }

      // Transaction should be removed
      await waitFor(() => {
        expect(screen.queryByText('Transaction to Remove')).not.toBeInTheDocument();
      });
    });

    it('should display batch count', async () => {
      const user = userEvent.setup();
      render(<BatchTransactions />);

      // Add multiple transactions
      const descInput = screen.getByPlaceholderText('e.g., Payment to vendor');
      const toInput = screen.getByPlaceholderText('0x...');
      
      for (let i = 0; i < 3; i++) {
        await user.clear(descInput);
        await user.clear(toInput);
        await user.type(descInput, `Transaction ${i + 1}`);
        await user.type(toInput, `0x${i}bcdef1234567890123456789012345678901234`);
        await user.click(screen.getByRole('button', { name: /add transaction/i }));
      }

      await waitFor(() => {
        expect(screen.getByText('Batch Queue (3 transactions)')).toBeInTheDocument();
      });
    });
  });

  describe('Gas Estimation', () => {
    it('should estimate gas for batch', async () => {
      const user = userEvent.setup();
      
      // Mock gas estimation
      mockSmartWallet.estimateGas.mockResolvedValue(ethers.parseEther('0.001'));
      
      render(<BatchTransactions />);

      // Add a transaction
      const descInput = screen.getByPlaceholderText('e.g., Payment to vendor');
      const toInput = screen.getByPlaceholderText('0x...');
      
      await user.type(descInput, 'Gas Test');
      await user.type(toInput, '0xabcdef1234567890123456789012345678901234');
      await user.click(screen.getByRole('button', { name: /add transaction/i }));

      // Estimate gas
      await waitFor(() => {
        expect(screen.getByText('Estimate Gas')).toBeInTheDocument();
      });
      
      await user.click(screen.getByText('Estimate Gas'));

      await waitFor(() => {
        expect(screen.getByText('Gas Estimate')).toBeInTheDocument();
        expect(mockSmartWallet.estimateGas).toHaveBeenCalled();
      });
    });

    it('should display gas estimate with USD value', async () => {
      const user = userEvent.setup();
      
      mockSmartWallet.estimateGas.mockResolvedValue(ethers.parseEther('0.002'));
      
      render(<BatchTransactions />);

      // Add transaction and estimate gas
      const descInput = screen.getByPlaceholderText('e.g., Payment to vendor');
      const toInput = screen.getByPlaceholderText('0x...');
      
      await user.type(descInput, 'Test');
      await user.type(toInput, '0xabcdef1234567890123456789012345678901234');
      await user.click(screen.getByRole('button', { name: /add transaction/i }));
      
      await user.click(screen.getByText('Estimate Gas'));

      await waitFor(() => {
        expect(screen.getByText(/ETH/)).toBeInTheDocument();
        expect(screen.getByText(/USD/)).toBeInTheDocument();
      });
    });
  });

  describe('Batch Execution', () => {
    it('should execute batch transactions', async () => {
      const user = userEvent.setup();
      
      mockSmartWallet.sendUserOperation.mockResolvedValue('0xuserop123');
      
      render(<BatchTransactions />);

      // Add transactions
      const descInput = screen.getByPlaceholderText('e.g., Payment to vendor');
      const toInput = screen.getByPlaceholderText('0x...');
      
      await user.type(descInput, 'Batch Tx 1');
      await user.type(toInput, '0xabcdef1234567890123456789012345678901234');
      await user.click(screen.getByRole('button', { name: /add transaction/i }));

      // Execute batch
      await user.click(screen.getByText(/Execute Batch/));

      expect(mockSmartWallet.sendUserOperation).toHaveBeenCalled();
    });

    it('should show execution progress', async () => {
      const user = userEvent.setup();
      
      // Mock delayed execution
      mockSmartWallet.sendUserOperation.mockImplementation(
        () => new Promise(resolve => setTimeout(() => resolve('0xuserop123'), 100))
      );
      
      render(<BatchTransactions />);

      // Add transaction
      const descInput = screen.getByPlaceholderText('e.g., Payment to vendor');
      const toInput = screen.getByPlaceholderText('0x...');
      
      await user.type(descInput, 'Test');
      await user.type(toInput, '0xabcdef1234567890123456789012345678901234');
      await user.click(screen.getByRole('button', { name: /add transaction/i }));

      // Execute
      await user.click(screen.getByText(/Execute Batch/));

      // Should show executing state
      expect(screen.getByText('Executing...')).toBeInTheDocument();

      // Wait for completion
      await waitFor(() => {
        expect(screen.queryByText('Executing...')).not.toBeInTheDocument();
      });
    });

    it('should handle execution errors', async () => {
      const user = userEvent.setup();
      
      mockSmartWallet.sendUserOperation.mockRejectedValue(new Error('Execution failed'));
      
      render(<BatchTransactions />);

      // Add transaction
      const descInput = screen.getByPlaceholderText('e.g., Payment to vendor');
      const toInput = screen.getByPlaceholderText('0x...');
      
      await user.type(descInput, 'Test');
      await user.type(toInput, '0xabcdef1234567890123456789012345678901234');
      await user.click(screen.getByRole('button', { name: /add transaction/i }));

      // Execute
      await user.click(screen.getByText(/Execute Batch/));

      // Error should be handled gracefully
      await waitFor(() => {
        expect(mockSmartWallet.sendUserOperation).toHaveBeenCalled();
      });
    });
  });

  describe('Templates', () => {
    it('should save batch as template', async () => {
      const user = userEvent.setup();
      
      render(<BatchTransactions />);

      // Add transaction
      const descInput = screen.getByPlaceholderText('e.g., Payment to vendor');
      const toInput = screen.getByPlaceholderText('0x...');
      
      await user.type(descInput, 'Template Transaction');
      await user.type(toInput, '0xabcdef1234567890123456789012345678901234');
      await user.click(screen.getByRole('button', { name: /add transaction/i }));

      // Save as template
      await user.click(screen.getByText('Save as Template'));

      // Fill template details
      const nameInput = screen.getByPlaceholderText('e.g., Monthly Payments');
      const descriptionInput = screen.getByPlaceholderText('Template description...');
      
      await user.type(nameInput, 'Test Template');
      await user.type(descriptionInput, 'Template for testing');

      await user.click(screen.getByText('Save Template'));

      expect(global.fetch).toHaveBeenCalledWith(
        '/api/batch-templates',
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining('Test Template'),
        })
      );
    });

    it('should load templates', async () => {
      (global.fetch as any).mockResolvedValue({
        ok: true,
        json: async () => [
          {
            id: 't1',
            name: 'Monthly Payments',
            description: 'Regular monthly payments',
            transactions: [
              {
                id: '1',
                to: '0xabc',
                value: '1000000000000000000',
                data: '0x',
                description: 'Rent payment',
              },
            ],
          },
        ],
      });

      const user = userEvent.setup();
      render(<BatchTransactions />);

      await waitFor(() => {
        expect(screen.getByText('Load from Template')).toBeInTheDocument();
      });

      // Select template
      const select = screen.getByRole('combobox');
      await user.selectOptions(select, 't1');

      // Template transactions should be loaded
      await waitFor(() => {
        expect(screen.getByText('Rent payment')).toBeInTheDocument();
      });
    });
  });

  describe('Import/Export', () => {
    it('should export batch to JSON', async () => {
      const user = userEvent.setup();
      
      // Mock document.createElement and click
      const mockAnchor = {
        href: '',
        download: '',
        click: vi.fn(),
      };
      document.createElement = vi.fn((tag) => {
        if (tag === 'a') return mockAnchor as any;
        return document.createElement(tag);
      });
      
      render(<BatchTransactions />);

      // Add transaction
      const descInput = screen.getByPlaceholderText('e.g., Payment to vendor');
      const toInput = screen.getByPlaceholderText('0x...');
      
      await user.type(descInput, 'Export Test');
      await user.type(toInput, '0xabcdef1234567890123456789012345678901234');
      await user.click(screen.getByRole('button', { name: /add transaction/i }));

      // Export
      await user.click(screen.getByText('Export'));

      expect(mockAnchor.download).toContain('batch-');
      expect(mockAnchor.click).toHaveBeenCalled();
    });

    it('should import batch from JSON', async () => {
      const user = userEvent.setup();
      
      render(<BatchTransactions />);

      const fileContent = JSON.stringify({
        transactions: [
          {
            to: '0xabcdef1234567890123456789012345678901234',
            value: '1000000000000000000',
            data: '0x',
            description: 'Imported Transaction',
          },
        ],
        metadata: {
          created: new Date().toISOString(),
          creator: mockAddress,
        },
      });

      const file = new File([fileContent], 'batch.json', { type: 'application/json' });
      
      // Find import input
      const importInput = document.getElementById('import-batch') as HTMLInputElement;
      
      // Simulate file selection
      Object.defineProperty(importInput, 'files', {
        value: [file],
        writable: false,
      });

      fireEvent.change(importInput);

      // Wait for file to be processed
      await waitFor(() => {
        expect(screen.getByText('Imported Transaction')).toBeInTheDocument();
      });
    });

    it('should handle invalid import files', async () => {
      window.alert = vi.fn();
      
      render(<BatchTransactions />);

      const invalidContent = 'invalid json';
      const file = new File([invalidContent], 'invalid.json', { type: 'application/json' });
      
      const importInput = document.getElementById('import-batch') as HTMLInputElement;
      
      Object.defineProperty(importInput, 'files', {
        value: [file],
        writable: false,
      });

      fireEvent.change(importInput);

      await waitFor(() => {
        expect(window.alert).toHaveBeenCalledWith('Invalid batch file');
      });
    });
  });

  describe('Transaction Details', () => {
    it('should display transaction details in queue', async () => {
      const user = userEvent.setup();
      render(<BatchTransactions />);

      // Add transaction with data
      const descInput = screen.getByPlaceholderText('e.g., Payment to vendor');
      const toInput = screen.getByPlaceholderText('0x...');
      const dataInput = screen.getByPlaceholderText('0x');
      
      await user.type(descInput, 'Contract Call');
      await user.type(toInput, '0xabcdef1234567890123456789012345678901234');
      await user.type(dataInput, '0x123456');

      await user.click(screen.getByRole('button', { name: /add transaction/i }));

      await waitFor(() => {
        expect(screen.getByText('Contract Call')).toBeInTheDocument();
        expect(screen.getByText(/0x123456/)).toBeInTheDocument();
      });
    });

    it('should number transactions in order', async () => {
      const user = userEvent.setup();
      render(<BatchTransactions />);

      // Add multiple transactions
      const descInput = screen.getByPlaceholderText('e.g., Payment to vendor');
      const toInput = screen.getByPlaceholderText('0x...');
      
      for (let i = 0; i < 3; i++) {
        await user.clear(descInput);
        await user.clear(toInput);
        await user.type(descInput, `Transaction ${i + 1}`);
        await user.type(toInput, `0x${i}bcdef1234567890123456789012345678901234`);
        await user.click(screen.getByRole('button', { name: /add transaction/i }));
      }

      await waitFor(() => {
        expect(screen.getByText('#1')).toBeInTheDocument();
        expect(screen.getByText('#2')).toBeInTheDocument();
        expect(screen.getByText('#3')).toBeInTheDocument();
      });
    });
  });
});