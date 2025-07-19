import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TransferModal } from '../TransferModal';
import { useSmartWallet } from '../../contexts/SmartWalletContext';
import { parseEther, parseUnits } from 'ethers';

// Mock the context
jest.mock('../../contexts/SmartWalletContext');

const mockUseSmartWallet = useSmartWallet as jest.MockedFunction<typeof useSmartWallet>;

describe('TransferModal', () => {
  const mockOnClose = jest.fn();
  const mockOnSuccess = jest.fn();
  const mockSendUserOperation = jest.fn();
  const mockEstimateGas = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    mockUseSmartWallet.mockReturnValue({
      sendUserOperation: mockSendUserOperation,
      estimateGas: mockEstimateGas,
      smartWalletAddress: '0x123',
      isDeployed: true,
      deploySmartWallet: jest.fn(),
      getBalance: jest.fn(),
    } as any);
  });

  it('renders transfer modal with initial state', () => {
    render(<TransferModal onClose={mockOnClose} onSuccess={mockOnSuccess} />);
    
    expect(screen.getByText('Transfer Tokens')).toBeInTheDocument();
    expect(screen.getByLabelText('Token')).toHaveValue('usdc');
    expect(screen.getByLabelText('Recipient Address')).toHaveValue('');
    expect(screen.getByLabelText('Amount')).toHaveValue('');
    expect(screen.getByText('Cancel')).toBeInTheDocument();
    expect(screen.getByText('Send')).toBeInTheDocument();
  });

  it('allows token type selection', async () => {
    render(<TransferModal onClose={mockOnClose} onSuccess={mockOnSuccess} />);
    
    const tokenSelect = screen.getByLabelText('Token');
    await userEvent.selectOptions(tokenSelect, 'native');
    
    expect(tokenSelect).toHaveValue('native');
  });

  it('validates recipient address', async () => {
    render(<TransferModal onClose={mockOnClose} onSuccess={mockOnSuccess} />);
    
    const recipientInput = screen.getByLabelText('Recipient Address');
    const sendButton = screen.getByText('Send');
    
    // Invalid address
    await userEvent.type(recipientInput, 'invalid-address');
    await userEvent.type(screen.getByLabelText('Amount'), '10');
    await userEvent.click(sendButton);
    
    await waitFor(() => {
      expect(screen.getByText('Invalid recipient address')).toBeInTheDocument();
    });
  });

  it('estimates gas when inputs are valid', async () => {
    mockEstimateGas.mockResolvedValue(parseUnits('21000', 'gwei'));
    
    render(<TransferModal onClose={mockOnClose} onSuccess={mockOnSuccess} />);
    
    const recipientInput = screen.getByLabelText('Recipient Address');
    const amountInput = screen.getByLabelText('Amount');
    
    await userEvent.type(recipientInput, '0x742d35Cc6634C0532925a3b844Bc9e7595f89590');
    await userEvent.type(amountInput, '10');
    
    // Trigger blur event to estimate gas
    fireEvent.blur(amountInput);
    
    await waitFor(() => {
      expect(mockEstimateGas).toHaveBeenCalled();
      expect(screen.getByText('Estimated Gas:')).toBeInTheDocument();
      expect(screen.getByText('21000.0 gwei')).toBeInTheDocument();
    });
  });

  it('shows gas payment method for USDC transfers', async () => {
    mockEstimateGas.mockResolvedValue(parseUnits('21000', 'gwei'));
    
    render(<TransferModal onClose={mockOnClose} onSuccess={mockOnSuccess} />);
    
    await userEvent.type(screen.getByLabelText('Recipient Address'), '0x742d35Cc6634C0532925a3b844Bc9e7595f89590');
    await userEvent.type(screen.getByLabelText('Amount'), '10');
    fireEvent.blur(screen.getByLabelText('Amount'));
    
    await waitFor(() => {
      expect(screen.getByText('Paid with USDC')).toBeInTheDocument();
    });
  });

  it('sends USDC transfer successfully', async () => {
    mockSendUserOperation.mockResolvedValue('0xhash123');
    
    render(<TransferModal onClose={mockOnClose} onSuccess={mockOnSuccess} />);
    
    await userEvent.type(screen.getByLabelText('Recipient Address'), '0x742d35Cc6634C0532925a3b844Bc9e7595f89590');
    await userEvent.type(screen.getByLabelText('Amount'), '10');
    await userEvent.click(screen.getByText('Send'));
    
    await waitFor(() => {
      expect(mockSendUserOperation).toHaveBeenCalled();
      expect(mockOnSuccess).toHaveBeenCalled();
    });
  });

  it('sends native token transfer successfully', async () => {
    mockSendUserOperation.mockResolvedValue('0xhash123');
    
    render(<TransferModal onClose={mockOnClose} onSuccess={mockOnSuccess} />);
    
    await userEvent.selectOptions(screen.getByLabelText('Token'), 'native');
    await userEvent.type(screen.getByLabelText('Recipient Address'), '0x742d35Cc6634C0532925a3b844Bc9e7595f89590');
    await userEvent.type(screen.getByLabelText('Amount'), '0.1');
    await userEvent.click(screen.getByText('Send'));
    
    await waitFor(() => {
      expect(mockSendUserOperation).toHaveBeenCalledWith(
        '0x742d35Cc6634C0532925a3b844Bc9e7595f89590',
        '0x',
        parseEther('0.1')
      );
      expect(mockOnSuccess).toHaveBeenCalled();
    });
  });

  it('handles transfer errors gracefully', async () => {
    mockSendUserOperation.mockRejectedValue(new Error('Insufficient funds'));
    
    render(<TransferModal onClose={mockOnClose} onSuccess={mockOnSuccess} />);
    
    await userEvent.type(screen.getByLabelText('Recipient Address'), '0x742d35Cc6634C0532925a3b844Bc9e7595f89590');
    await userEvent.type(screen.getByLabelText('Amount'), '10');
    await userEvent.click(screen.getByText('Send'));
    
    await waitFor(() => {
      expect(screen.getByText('Insufficient funds')).toBeInTheDocument();
    });
  });

  it('disables send button when loading', async () => {
    mockSendUserOperation.mockImplementation(() => new Promise(() => {})); // Never resolves
    
    render(<TransferModal onClose={mockOnClose} onSuccess={mockOnSuccess} />);
    
    await userEvent.type(screen.getByLabelText('Recipient Address'), '0x742d35Cc6634C0532925a3b844Bc9e7595f89590');
    await userEvent.type(screen.getByLabelText('Amount'), '10');
    
    const sendButton = screen.getByText('Send');
    await userEvent.click(sendButton);
    
    expect(screen.getByText('Sending...')).toBeInTheDocument();
    expect(screen.getByText('Sending...')).toBeDisabled();
  });

  it('closes modal when cancel is clicked', async () => {
    render(<TransferModal onClose={mockOnClose} onSuccess={mockOnSuccess} />);
    
    await userEvent.click(screen.getByText('Cancel'));
    
    expect(mockOnClose).toHaveBeenCalled();
  });

  it('has proper overlay styling', () => {
    const { container } = render(<TransferModal onClose={mockOnClose} onSuccess={mockOnSuccess} />);
    
    const overlay = container.querySelector('.fixed.inset-0');
    expect(overlay).toHaveClass('bg-black', 'bg-opacity-50');
  });
});