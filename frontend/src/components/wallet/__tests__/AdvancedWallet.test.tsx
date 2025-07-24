import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AdvancedWallet } from '../AdvancedWallet';
import { useAccount } from 'wagmi';
import { useSmartWallet } from '../../../contexts/SmartWalletContext';
import { vi } from 'vitest';

// Mock wagmi hooks
vi.mock('wagmi', () => ({
  useAccount: vi.fn(),
}));

// Mock SmartWallet context
vi.mock('../../../contexts/SmartWalletContext', () => ({
  useSmartWallet: vi.fn(),
}));

// Mock child components
vi.mock('../MultiSigWallet', () => ({
  MultiSigWallet: () => <div>MultiSigWallet Component</div>,
}));

vi.mock('../SocialRecovery', () => ({
  SocialRecovery: () => <div>SocialRecovery Component</div>,
}));

vi.mock('../BatchTransactions', () => ({
  BatchTransactions: () => <div>BatchTransactions Component</div>,
}));

vi.mock('../AdvancedSettings', () => ({
  AdvancedSettings: () => <div>AdvancedSettings Component</div>,
}));

// Mock fetch
global.fetch = vi.fn();

describe('AdvancedWallet', () => {
  const mockAddress = '0x1234567890123456789012345678901234567890';
  const mockSmartWalletAddress = '0xabcdef1234567890123456789012345678901234';

  beforeEach(() => {
    vi.clearAllMocks();
    (useAccount as any).mockReturnValue({ address: mockAddress });
    (useSmartWallet as any).mockReturnValue({
      smartWalletAddress: mockSmartWalletAddress,
      isDeployed: true,
    });
    
    // Default fetch mock
    (global.fetch as any).mockResolvedValue({
      ok: true,
      json: async () => ({}),
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Layout and Navigation', () => {
    it('should render advanced wallet interface', () => {
      render(<AdvancedWallet />);
      
      expect(screen.getByText('Advanced Wallet Features')).toBeInTheDocument();
      expect(screen.getByText('Enhanced security and functionality for your smart wallet')).toBeInTheDocument();
    });

    it('should display navigation sidebar', () => {
      render(<AdvancedWallet />);
      
      expect(screen.getByText('Features')).toBeInTheDocument();
      expect(screen.getByText('Overview')).toBeInTheDocument();
      expect(screen.getByText('Multi-Sig')).toBeInTheDocument();
      expect(screen.getByText('Social Recovery')).toBeInTheDocument();
      expect(screen.getByText('Batch Transactions')).toBeInTheDocument();
      expect(screen.getByText('Settings')).toBeInTheDocument();
    });

    it('should display wallet info card', () => {
      render(<AdvancedWallet />);
      
      expect(screen.getByText('Wallet Info')).toBeInTheDocument();
      expect(screen.getByText('EOA Address')).toBeInTheDocument();
      expect(screen.getByText('Smart Wallet')).toBeInTheDocument();
      expect(screen.getByText('Deployed')).toBeInTheDocument();
    });

    it('should show wallet addresses', () => {
      render(<AdvancedWallet />);
      
      // Check shortened addresses
      expect(screen.getByText('0x1234...7890')).toBeInTheDocument(); // EOA
      expect(screen.getByText('0xabcd...1234')).toBeInTheDocument(); // Smart wallet
    });

    it('should show not deployed status', () => {
      (useSmartWallet as any).mockReturnValue({
        smartWalletAddress: null,
        isDeployed: false,
      });

      render(<AdvancedWallet />);
      
      expect(screen.getByText('Not deployed')).toBeInTheDocument();
    });
  });

  describe('Tab Navigation', () => {
    it('should show overview by default', () => {
      render(<AdvancedWallet />);
      
      expect(screen.getByText('Wallet Overview')).toBeInTheDocument();
      expect(screen.getByText('Smart Wallet Active')).toBeInTheDocument();
    });

    it('should switch to Multi-Sig tab', async () => {
      const user = userEvent.setup();
      render(<AdvancedWallet />);
      
      await user.click(screen.getByText('Multi-Sig'));
      
      expect(screen.getByText('MultiSigWallet Component')).toBeInTheDocument();
    });

    it('should switch to Social Recovery tab', async () => {
      const user = userEvent.setup();
      render(<AdvancedWallet />);
      
      await user.click(screen.getByText('Social Recovery'));
      
      expect(screen.getByText('SocialRecovery Component')).toBeInTheDocument();
    });

    it('should switch to Batch Transactions tab', async () => {
      const user = userEvent.setup();
      render(<AdvancedWallet />);
      
      await user.click(screen.getByText('Batch Transactions'));
      
      expect(screen.getByText('BatchTransactions Component')).toBeInTheDocument();
    });

    it('should switch to Settings tab', async () => {
      const user = userEvent.setup();
      render(<AdvancedWallet />);
      
      await user.click(screen.getByText('Settings'));
      
      expect(screen.getByText('AdvancedSettings Component')).toBeInTheDocument();
    });

    it('should highlight active tab', async () => {
      const user = userEvent.setup();
      render(<AdvancedWallet />);
      
      // Click Multi-Sig tab
      const multiSigButton = screen.getByText('Multi-Sig');
      await user.click(multiSigButton);
      
      // Check if button has active styles
      expect(multiSigButton.closest('button')).toHaveClass('bg-blue-50', 'text-blue-600');
    });
  });

  describe('Overview Tab', () => {
    it('should display feature cards', () => {
      render(<AdvancedWallet />);
      
      expect(screen.getByText('Multi-Signature Wallet')).toBeInTheDocument();
      expect(screen.getByText('Create wallets that require multiple signatures for transactions')).toBeInTheDocument();
      
      expect(screen.getByText('Social Recovery')).toBeInTheDocument();
      expect(screen.getByText('Recover your wallet with help from trusted guardians')).toBeInTheDocument();
      
      expect(screen.getByText('Batch Transactions')).toBeInTheDocument();
      expect(screen.getByText('Save gas by bundling multiple transactions into one')).toBeInTheDocument();
      
      expect(screen.getByText('Advanced Security')).toBeInTheDocument();
      expect(screen.getByText('Enhanced security features including biometric auth and auto-lock')).toBeInTheDocument();
    });

    it('should show feature status badges', () => {
      render(<AdvancedWallet />);
      
      // Should have multiple "Available" badges
      const availableBadges = screen.getAllByText('Available');
      expect(availableBadges.length).toBeGreaterThan(0);
      
      expect(screen.getByText('Configured')).toBeInTheDocument();
    });

    it('should display recent activity', () => {
      render(<AdvancedWallet />);
      
      expect(screen.getByText('Recent Activity')).toBeInTheDocument();
      expect(screen.getByText('Social recovery guardian added')).toBeInTheDocument();
      expect(screen.getByText('Batch transaction executed (3 operations)')).toBeInTheDocument();
      expect(screen.getByText('Auto-lock enabled')).toBeInTheDocument();
      expect(screen.getByText('Multi-sig wallet created')).toBeInTheDocument();
    });

    it('should show quick stats', () => {
      render(<AdvancedWallet />);
      
      expect(screen.getByText('Active Guardians')).toBeInTheDocument();
      expect(screen.getByText('2')).toBeInTheDocument();
      
      expect(screen.getByText('Batch Templates')).toBeInTheDocument();
      expect(screen.getByText('5')).toBeInTheDocument();
      
      expect(screen.getByText('Security Score')).toBeInTheDocument();
      expect(screen.getByText('3/5')).toBeInTheDocument();
    });

    it('should show deployment status banner for deployed wallet', () => {
      render(<AdvancedWallet />);
      
      expect(screen.getByText('Smart Wallet Active')).toBeInTheDocument();
      expect(screen.getByText('All advanced features are available')).toBeInTheDocument();
    });

    it('should show deployment status banner for non-deployed wallet', () => {
      (useSmartWallet as any).mockReturnValue({
        smartWalletAddress: null,
        isDeployed: false,
      });

      render(<AdvancedWallet />);
      
      expect(screen.getByText('Smart Wallet Not Deployed')).toBeInTheDocument();
      expect(screen.getByText('Deploy your smart wallet to access advanced features')).toBeInTheDocument();
    });
  });

  describe('Responsive Behavior', () => {
    it('should render in mobile layout', () => {
      // Mock window width
      Object.defineProperty(window, 'innerWidth', {
        writable: true,
        configurable: true,
        value: 375,
      });

      render(<AdvancedWallet />);
      
      // Should still render main components
      expect(screen.getByText('Advanced Wallet Features')).toBeInTheDocument();
      expect(screen.getByText('Features')).toBeInTheDocument();
    });
  });

  describe('Component Integration', () => {
    it('should render child components when tabs are selected', async () => {
      const user = userEvent.setup();
      render(<AdvancedWallet />);
      
      // Test each tab renders its component
      await user.click(screen.getByText('Multi-Sig'));
      expect(screen.getByText('MultiSigWallet Component')).toBeInTheDocument();
      
      await user.click(screen.getByText('Social Recovery'));
      expect(screen.getByText('SocialRecovery Component')).toBeInTheDocument();
      
      await user.click(screen.getByText('Batch Transactions'));
      expect(screen.getByText('BatchTransactions Component')).toBeInTheDocument();
      
      await user.click(screen.getByText('Settings'));
      expect(screen.getByText('AdvancedSettings Component')).toBeInTheDocument();
    });
  });

  describe('Error Handling', () => {
    it('should handle missing wallet connection gracefully', () => {
      (useAccount as any).mockReturnValue({ address: null });
      
      render(<AdvancedWallet />);
      
      expect(screen.getByText('Not connected')).toBeInTheDocument();
    });

    it('should handle missing smart wallet gracefully', () => {
      (useSmartWallet as any).mockReturnValue({
        smartWalletAddress: null,
        isDeployed: false,
      });
      
      render(<AdvancedWallet />);
      
      expect(screen.getByText('Not deployed')).toBeInTheDocument();
    });
  });

  describe('Tab Descriptions', () => {
    it('should show tab descriptions in navigation', () => {
      render(<AdvancedWallet />);
      
      // Check if navigation includes descriptions
      const nav = screen.getByRole('navigation');
      expect(nav).toBeInTheDocument();
      
      // Tab names should be visible
      expect(screen.getByText('Overview')).toBeInTheDocument();
      expect(screen.getByText('Multi-Sig')).toBeInTheDocument();
    });
  });
});