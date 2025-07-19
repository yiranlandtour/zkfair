import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Dashboard } from '../Dashboard';
import { useAccount } from 'wagmi';
import { useSmartWallet } from '../../contexts/SmartWalletContext';
import { parseUnits } from 'ethers';

// Mock dependencies
jest.mock('wagmi');
jest.mock('../../contexts/SmartWalletContext');
jest.mock('../TransferModal', () => ({
  TransferModal: ({ onClose, onSuccess }: any) => (
    <div data-testid="transfer-modal">
      <button onClick={onClose}>Close</button>
      <button onClick={onSuccess}>Success</button>
    </div>
  ),
}));
jest.mock('../TransactionHistory', () => ({
  TransactionHistory: ({ smartWalletAddress }: any) => (
    <div data-testid="transaction-history">
      Transaction History for {smartWalletAddress}
    </div>
  ),
}));

const mockUseAccount = useAccount as jest.MockedFunction<typeof useAccount>;
const mockUseSmartWallet = useSmartWallet as jest.MockedFunction<typeof useSmartWallet>;

describe('Dashboard', () => {
  const mockDeploySmartWallet = jest.fn();
  const mockGetBalance = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    mockUseAccount.mockReturnValue({
      address: undefined,
      isConnected: false,
    } as any);
    mockUseSmartWallet.mockReturnValue({
      smartWalletAddress: null,
      isDeployed: false,
      deploySmartWallet: mockDeploySmartWallet,
      getBalance: mockGetBalance,
    } as any);
  });

  it('shows connect wallet message when not connected', () => {
    render(<Dashboard />);
    
    expect(screen.getByText('Welcome to ZKFair L2')).toBeInTheDocument();
    expect(screen.getByText('Please connect your wallet to continue')).toBeInTheDocument();
  });

  it('shows loading state when initializing smart wallet', () => {
    mockUseAccount.mockReturnValue({
      address: '0x1234567890123456789012345678901234567890',
      isConnected: true,
    } as any);
    
    render(<Dashboard />);
    
    expect(screen.getByText('Initializing smart wallet...')).toBeInTheDocument();
  });

  it('shows smart wallet address when initialized', () => {
    mockUseAccount.mockReturnValue({
      address: '0x1234567890123456789012345678901234567890',
      isConnected: true,
    } as any);
    mockUseSmartWallet.mockReturnValue({
      smartWalletAddress: '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd',
      isDeployed: false,
      deploySmartWallet: mockDeploySmartWallet,
      getBalance: mockGetBalance,
    } as any);
    
    render(<Dashboard />);
    
    expect(screen.getByText('Smart Wallet')).toBeInTheDocument();
    expect(screen.getByText('0xabcdefabcdefabcdefabcdefabcdefabcdefabcd')).toBeInTheDocument();
  });

  it('shows deploy prompt when wallet not deployed', () => {
    mockUseAccount.mockReturnValue({
      address: '0x1234567890123456789012345678901234567890',
      isConnected: true,
    } as any);
    mockUseSmartWallet.mockReturnValue({
      smartWalletAddress: '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd',
      isDeployed: false,
      deploySmartWallet: mockDeploySmartWallet,
      getBalance: mockGetBalance,
    } as any);
    
    render(<Dashboard />);
    
    expect(screen.getByText(/Your smart wallet is not deployed yet/)).toBeInTheDocument();
    expect(screen.getByText('Deploy Smart Wallet')).toBeInTheDocument();
  });

  it('handles wallet deployment', async () => {
    mockUseAccount.mockReturnValue({
      address: '0x1234567890123456789012345678901234567890',
      isConnected: true,
    } as any);
    mockUseSmartWallet.mockReturnValue({
      smartWalletAddress: '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd',
      isDeployed: false,
      deploySmartWallet: mockDeploySmartWallet,
      getBalance: mockGetBalance,
    } as any);
    
    render(<Dashboard />);
    
    const deployButton = screen.getByText('Deploy Smart Wallet');
    await userEvent.click(deployButton);
    
    expect(screen.getByText('Deploying...')).toBeInTheDocument();
    expect(mockDeploySmartWallet).toHaveBeenCalled();
  });

  it('shows deployed status and features when deployed', () => {
    mockUseAccount.mockReturnValue({
      address: '0x1234567890123456789012345678901234567890',
      isConnected: true,
    } as any);
    mockUseSmartWallet.mockReturnValue({
      smartWalletAddress: '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd',
      isDeployed: true,
      deploySmartWallet: mockDeploySmartWallet,
      getBalance: mockGetBalance,
    } as any);
    mockGetBalance.mockResolvedValue(parseUnits('100', 6));
    
    render(<Dashboard />);
    
    // Check deployed status
    expect(screen.getByText(/Smart wallet deployed and ready to use/)).toBeInTheDocument();
    
    // Check balance cards
    expect(screen.getByText('Native Token Balance')).toBeInTheDocument();
    expect(screen.getByText('USDC Balance')).toBeInTheDocument();
    
    // Check action buttons
    expect(screen.getByText('Transfer')).toBeInTheDocument();
    expect(screen.getByText('Swap (Coming Soon)')).toBeInTheDocument();
    expect(screen.getByText('Bridge (Coming Soon)')).toBeInTheDocument();
    expect(screen.getByText('Refresh Balances')).toBeInTheDocument();
    
    // Check transaction history
    expect(screen.getByTestId('transaction-history')).toBeInTheDocument();
  });

  it('loads balances when deployed', async () => {
    mockUseAccount.mockReturnValue({
      address: '0x1234567890123456789012345678901234567890',
      isConnected: true,
    } as any);
    mockUseSmartWallet.mockReturnValue({
      smartWalletAddress: '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd',
      isDeployed: true,
      deploySmartWallet: mockDeploySmartWallet,
      getBalance: mockGetBalance,
    } as any);
    mockGetBalance
      .mockResolvedValueOnce(parseUnits('1', 18)) // Native
      .mockResolvedValueOnce(parseUnits('100', 6)); // USDC
    
    render(<Dashboard />);
    
    await waitFor(() => {
      expect(mockGetBalance).toHaveBeenCalledTimes(2);
    });
  });

  it('opens transfer modal when transfer button clicked', async () => {
    mockUseAccount.mockReturnValue({
      address: '0x1234567890123456789012345678901234567890',
      isConnected: true,
    } as any);
    mockUseSmartWallet.mockReturnValue({
      smartWalletAddress: '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd',
      isDeployed: true,
      deploySmartWallet: mockDeploySmartWallet,
      getBalance: mockGetBalance,
    } as any);
    
    render(<Dashboard />);
    
    const transferButton = screen.getByText('Transfer');
    await userEvent.click(transferButton);
    
    expect(screen.getByTestId('transfer-modal')).toBeInTheDocument();
  });

  it('closes transfer modal and refreshes balances on success', async () => {
    mockUseAccount.mockReturnValue({
      address: '0x1234567890123456789012345678901234567890',
      isConnected: true,
    } as any);
    mockUseSmartWallet.mockReturnValue({
      smartWalletAddress: '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd',
      isDeployed: true,
      deploySmartWallet: mockDeploySmartWallet,
      getBalance: mockGetBalance,
    } as any);
    
    render(<Dashboard />);
    
    // Open modal
    await userEvent.click(screen.getByText('Transfer'));
    
    // Click success in modal
    await userEvent.click(screen.getByText('Success'));
    
    // Modal should be closed
    expect(screen.queryByTestId('transfer-modal')).not.toBeInTheDocument();
    
    // Balances should be refreshed
    await waitFor(() => {
      expect(mockGetBalance).toHaveBeenCalled();
    });
  });

  it('refreshes balances when refresh button clicked', async () => {
    mockUseAccount.mockReturnValue({
      address: '0x1234567890123456789012345678901234567890',
      isConnected: true,
    } as any);
    mockUseSmartWallet.mockReturnValue({
      smartWalletAddress: '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd',
      isDeployed: true,
      deploySmartWallet: mockDeploySmartWallet,
      getBalance: mockGetBalance,
    } as any);
    mockGetBalance.mockResolvedValue(BigInt(0));
    
    render(<Dashboard />);
    
    await waitFor(() => {
      expect(screen.getByText('Refresh Balances')).toBeInTheDocument();
    });
    
    // Clear previous calls
    mockGetBalance.mockClear();
    
    await userEvent.click(screen.getByText('Refresh Balances'));
    
    expect(mockGetBalance).toHaveBeenCalledTimes(2);
  });

  it('disables coming soon buttons', () => {
    mockUseAccount.mockReturnValue({
      address: '0x1234567890123456789012345678901234567890',
      isConnected: true,
    } as any);
    mockUseSmartWallet.mockReturnValue({
      smartWalletAddress: '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd',
      isDeployed: true,
      deploySmartWallet: mockDeploySmartWallet,
      getBalance: mockGetBalance,
    } as any);
    
    render(<Dashboard />);
    
    expect(screen.getByText('Swap (Coming Soon)')).toBeDisabled();
    expect(screen.getByText('Bridge (Coming Soon)')).toBeDisabled();
  });
});