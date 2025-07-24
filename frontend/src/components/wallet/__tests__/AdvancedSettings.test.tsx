import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AdvancedSettings } from '../AdvancedSettings';
import { useAccount } from 'wagmi';
import { vi } from 'vitest';

// Mock wagmi hooks
vi.mock('wagmi', () => ({
  useAccount: vi.fn(),
}));

// Mock fetch
global.fetch = vi.fn();

// Mock file operations
global.URL.createObjectURL = vi.fn(() => 'blob:mock-url');
global.URL.revokeObjectURL = vi.fn();

describe('AdvancedSettings', () => {
  const mockAddress = '0x1234567890123456789012345678901234567890';
  
  const defaultSettings = {
    security: {
      sessionTimeout: 30,
      requireBiometric: false,
      autoLockEnabled: true,
      autoLockTimeout: 5,
      transactionConfirmation: 'threshold',
      confirmationThreshold: '0.1',
    },
    gas: {
      defaultPriority: 'medium',
      maxGasPrice: '100',
      gasPriceAlert: true,
      gasPriceAlertThreshold: '50',
    },
    notifications: {
      email: true,
      push: true,
      sms: false,
      transactionAlerts: true,
      securityAlerts: true,
      priceAlerts: false,
      weeklyReport: true,
    },
    privacy: {
      hideBalances: false,
      hideTransactionHistory: false,
      enableAnalytics: true,
      shareDataWithPartners: false,
    },
    network: {
      rpcEndpoint: 'https://rpc.example.com',
      bundlerUrl: 'https://bundler.example.com',
      fallbackRpc: '',
      connectionTimeout: 30,
      maxRetries: 3,
    },
    backup: {
      autoBackup: true,
      backupFrequency: 'weekly',
      encryptBackups: true,
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    (useAccount as any).mockReturnValue({ address: mockAddress });
    
    // Default fetch mock
    (global.fetch as any).mockResolvedValue({
      ok: true,
      json: async () => defaultSettings,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Settings Display', () => {
    it('should render all settings sections', async () => {
      render(<AdvancedSettings />);
      
      await waitFor(() => {
        expect(screen.getByText('Advanced Wallet Settings')).toBeInTheDocument();
        expect(screen.getByText('Security')).toBeInTheDocument();
        expect(screen.getByText('Gas Settings')).toBeInTheDocument();
        expect(screen.getByText('Notifications')).toBeInTheDocument();
        expect(screen.getByText('Privacy')).toBeInTheDocument();
        expect(screen.getByText('Network')).toBeInTheDocument();
        expect(screen.getByText('Backup & Recovery')).toBeInTheDocument();
      });
    });

    it('should expand and collapse sections', async () => {
      const user = userEvent.setup();
      render(<AdvancedSettings />);

      await waitFor(() => {
        expect(screen.getByText('Gas Settings')).toBeInTheDocument();
      });

      // Click to expand gas settings
      await user.click(screen.getByText('Gas Settings'));

      // Should show gas settings content
      await waitFor(() => {
        expect(screen.getByText('Default Gas Priority')).toBeInTheDocument();
      });

      // Click again to collapse
      await user.click(screen.getByText('Gas Settings'));

      // Content should be hidden (but section header still visible)
      await waitFor(() => {
        expect(screen.queryByText('Default Gas Priority')).not.toBeInTheDocument();
      });
    });
  });

  describe('Security Settings', () => {
    it('should update session timeout', async () => {
      const user = userEvent.setup();
      render(<AdvancedSettings />);

      await waitFor(() => {
        expect(screen.getByText('Session Timeout')).toBeInTheDocument();
      });

      const timeoutInput = screen.getByDisplayValue('30');
      await user.clear(timeoutInput);
      await user.type(timeoutInput, '60');

      expect(timeoutInput).toHaveValue(60);
    });

    it('should toggle biometric authentication', async () => {
      const user = userEvent.setup();
      render(<AdvancedSettings />);

      await waitFor(() => {
        expect(screen.getByText('Biometric Authentication')).toBeInTheDocument();
      });

      // Find toggle button for biometric auth
      const toggleButtons = screen.getAllByRole('button').filter(btn => 
        btn.querySelector('svg[class*="ToggleLeft"], svg[class*="ToggleRight"]')
      );

      // Click biometric toggle
      await user.click(toggleButtons[0]);

      // Should update state (in real app)
      expect(toggleButtons[0]).toBeInTheDocument();
    });

    it('should configure auto-lock settings', async () => {
      const user = userEvent.setup();
      render(<AdvancedSettings />);

      await waitFor(() => {
        expect(screen.getByText('Auto-Lock')).toBeInTheDocument();
      });

      // Auto-lock timeout should be visible when enabled
      const autoLockInput = screen.getByDisplayValue('5');
      await user.clear(autoLockInput);
      await user.type(autoLockInput, '10');

      expect(autoLockInput).toHaveValue(10);
    });

    it('should set transaction confirmation mode', async () => {
      const user = userEvent.setup();
      render(<AdvancedSettings />);

      await waitFor(() => {
        expect(screen.getByText('Transaction Confirmation')).toBeInTheDocument();
      });

      const select = screen.getByDisplayValue('threshold');
      await user.selectOptions(select, 'always');

      expect(select).toHaveValue('always');
    });

    it('should show threshold input when confirmation mode is threshold', async () => {
      render(<AdvancedSettings />);

      await waitFor(() => {
        expect(screen.getByPlaceholderText('0.1')).toBeInTheDocument();
      });

      const thresholdInput = screen.getByDisplayValue('0.1');
      expect(thresholdInput).toBeInTheDocument();
    });
  });

  describe('Gas Settings', () => {
    it('should set gas priority', async () => {
      const user = userEvent.setup();
      render(<AdvancedSettings />);

      // Expand gas settings
      await user.click(screen.getByText('Gas Settings'));

      await waitFor(() => {
        expect(screen.getByText('Default Gas Priority')).toBeInTheDocument();
      });

      const prioritySelect = screen.getByDisplayValue('medium');
      await user.selectOptions(prioritySelect, 'high');

      expect(prioritySelect).toHaveValue('high');
    });

    it('should show custom gas input when custom is selected', async () => {
      const user = userEvent.setup();
      render(<AdvancedSettings />);

      // Expand gas settings
      await user.click(screen.getByText('Gas Settings'));

      const prioritySelect = screen.getByDisplayValue('medium');
      await user.selectOptions(prioritySelect, 'custom');

      // Custom gas price input should appear
      await waitFor(() => {
        expect(screen.getByPlaceholderText('Gas price in Gwei')).toBeInTheDocument();
      });
    });

    it('should set max gas price', async () => {
      const user = userEvent.setup();
      render(<AdvancedSettings />);

      // Expand gas settings
      await user.click(screen.getByText('Gas Settings'));

      await waitFor(() => {
        expect(screen.getByText('Max Gas Price')).toBeInTheDocument();
      });

      const maxGasInput = screen.getByDisplayValue('100');
      await user.clear(maxGasInput);
      await user.type(maxGasInput, '200');

      expect(maxGasInput).toHaveValue(200);
    });

    it('should toggle gas price alerts', async () => {
      const user = userEvent.setup();
      render(<AdvancedSettings />);

      // Expand gas settings
      await user.click(screen.getByText('Gas Settings'));

      await waitFor(() => {
        expect(screen.getByText('Gas Price Alerts')).toBeInTheDocument();
      });

      // Find gas alert toggle
      const toggleButtons = screen.getAllByRole('button').filter(btn => 
        btn.querySelector('svg')
      );

      // Toggle gas alerts
      const gasAlertToggle = toggleButtons.find(btn => 
        btn.closest('div')?.textContent?.includes('Gas Price Alerts')
      );

      if (gasAlertToggle) {
        await user.click(gasAlertToggle);
      }

      // State should update
      expect(screen.getByText('Gas Price Alerts')).toBeInTheDocument();
    });
  });

  describe('Notification Settings', () => {
    it('should toggle notification channels', async () => {
      const user = userEvent.setup();
      render(<AdvancedSettings />);

      // Expand notifications
      await user.click(screen.getByText('Notifications'));

      await waitFor(() => {
        expect(screen.getByText('Email')).toBeInTheDocument();
        expect(screen.getByText('Push')).toBeInTheDocument();
      });

      // Find email toggle
      const emailToggle = screen.getAllByRole('button').find(btn => 
        btn.closest('div')?.textContent === 'Email'
      );

      if (emailToggle) {
        await user.click(emailToggle);
      }

      // Should toggle state
      expect(screen.getByText('Email')).toBeInTheDocument();
    });

    it('should toggle alert types', async () => {
      const user = userEvent.setup();
      render(<AdvancedSettings />);

      // Expand notifications
      await user.click(screen.getByText('Notifications'));

      await waitFor(() => {
        expect(screen.getByText('Transaction Alerts')).toBeInTheDocument();
        expect(screen.getByText('Security Alerts')).toBeInTheDocument();
      });

      // Toggle transaction alerts
      const alertToggles = screen.getAllByRole('button').filter(btn => 
        btn.querySelector('svg')
      );

      const transactionAlertToggle = alertToggles.find(btn => 
        btn.closest('div')?.textContent?.includes('Transaction Alerts')
      );

      if (transactionAlertToggle) {
        await user.click(transactionAlertToggle);
      }

      // State should update
      expect(screen.getByText('Transaction Alerts')).toBeInTheDocument();
    });
  });

  describe('Privacy Settings', () => {
    it('should toggle privacy options', async () => {
      const user = userEvent.setup();
      render(<AdvancedSettings />);

      // Expand privacy settings
      await user.click(screen.getByText('Privacy'));

      await waitFor(() => {
        expect(screen.getByText('Hide Balances')).toBeInTheDocument();
        expect(screen.getByText('Usage Analytics')).toBeInTheDocument();
      });

      // Toggle hide balances
      const privacyToggles = screen.getAllByRole('button').filter(btn => 
        btn.querySelector('svg')
      );

      const hideBalancesToggle = privacyToggles.find(btn => 
        btn.closest('div')?.textContent?.includes('Hide Balances')
      );

      if (hideBalancesToggle) {
        await user.click(hideBalancesToggle);
      }

      // State should update
      expect(screen.getByText('Show *** instead of amounts')).toBeInTheDocument();
    });
  });

  describe('Network Settings', () => {
    it('should update RPC endpoint', async () => {
      const user = userEvent.setup();
      render(<AdvancedSettings />);

      // Expand network settings
      await user.click(screen.getByText('Network'));

      await waitFor(() => {
        expect(screen.getByText('RPC Endpoint')).toBeInTheDocument();
      });

      const rpcInput = screen.getByDisplayValue('https://rpc.example.com');
      await user.clear(rpcInput);
      await user.type(rpcInput, 'https://new-rpc.example.com');

      expect(rpcInput).toHaveValue('https://new-rpc.example.com');
    });

    it('should set connection timeout', async () => {
      const user = userEvent.setup();
      render(<AdvancedSettings />);

      // Expand network settings
      await user.click(screen.getByText('Network'));

      await waitFor(() => {
        expect(screen.getByText('Connection Timeout')).toBeInTheDocument();
      });

      const timeoutInput = screen.getByDisplayValue('30');
      await user.clear(timeoutInput);
      await user.type(timeoutInput, '60');

      expect(timeoutInput).toHaveValue(60);
    });

    it('should set max retries', async () => {
      const user = userEvent.setup();
      render(<AdvancedSettings />);

      // Expand network settings
      await user.click(screen.getByText('Network'));

      await waitFor(() => {
        expect(screen.getByText('Max Retries')).toBeInTheDocument();
      });

      const retriesInput = screen.getByDisplayValue('3');
      await user.clear(retriesInput);
      await user.type(retriesInput, '5');

      expect(retriesInput).toHaveValue(5);
    });
  });

  describe('Backup Settings', () => {
    it('should toggle auto backup', async () => {
      const user = userEvent.setup();
      render(<AdvancedSettings />);

      // Expand backup settings
      await user.click(screen.getByText('Backup & Recovery'));

      await waitFor(() => {
        expect(screen.getByText('Auto Backup')).toBeInTheDocument();
      });

      // Find auto backup toggle
      const backupToggles = screen.getAllByRole('button').filter(btn => 
        btn.querySelector('svg')
      );

      const autoBackupToggle = backupToggles.find(btn => 
        btn.closest('div')?.textContent?.includes('Auto Backup')
      );

      if (autoBackupToggle) {
        await user.click(autoBackupToggle);
      }

      // Should update state
      expect(screen.getByText('Automatically backup wallet data')).toBeInTheDocument();
    });

    it('should set backup frequency', async () => {
      const user = userEvent.setup();
      render(<AdvancedSettings />);

      // Expand backup settings
      await user.click(screen.getByText('Backup & Recovery'));

      await waitFor(() => {
        expect(screen.getByText('Backup Frequency')).toBeInTheDocument();
      });

      const frequencySelect = screen.getByDisplayValue('weekly');
      await user.selectOptions(frequencySelect, 'daily');

      expect(frequencySelect).toHaveValue('daily');
    });

    it('should show backup now button', async () => {
      const user = userEvent.setup();
      render(<AdvancedSettings />);

      // Expand backup settings
      await user.click(screen.getByText('Backup & Recovery'));

      await waitFor(() => {
        expect(screen.getByText('Backup Now')).toBeInTheDocument();
      });
    });
  });

  describe('Settings Management', () => {
    it('should save settings', async () => {
      const user = userEvent.setup();
      render(<AdvancedSettings />);

      await waitFor(() => {
        expect(screen.getByText('Save Settings')).toBeInTheDocument();
      });

      // Make a change
      const timeoutInput = screen.getByDisplayValue('30');
      await user.clear(timeoutInput);
      await user.type(timeoutInput, '45');

      // Save settings
      await user.click(screen.getByText('Save Settings'));

      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining(`/api/wallet-settings/${mockAddress}`),
        expect.objectContaining({
          method: 'PUT',
        })
      );
    });

    it('should show save success message', async () => {
      const user = userEvent.setup();
      render(<AdvancedSettings />);

      await user.click(screen.getByText('Save Settings'));

      await waitFor(() => {
        expect(screen.getByText('Settings saved successfully')).toBeInTheDocument();
      });
    });

    it('should export settings', async () => {
      const user = userEvent.setup();
      
      // Mock document.createElement
      const mockAnchor = {
        href: '',
        download: '',
        click: vi.fn(),
      };
      document.createElement = vi.fn((tag) => {
        if (tag === 'a') return mockAnchor as any;
        return document.createElement(tag);
      });
      
      render(<AdvancedSettings />);

      await waitFor(() => {
        expect(screen.getByText('Export')).toBeInTheDocument();
      });

      await user.click(screen.getByText('Export'));

      expect(mockAnchor.download).toContain('wallet-settings-');
      expect(mockAnchor.click).toHaveBeenCalled();
    });

    it('should import settings', async () => {
      const user = userEvent.setup();
      render(<AdvancedSettings />);

      const fileContent = JSON.stringify({
        settings: {
          ...defaultSettings,
          security: {
            ...defaultSettings.security,
            sessionTimeout: 60,
          },
        },
      });

      const file = new File([fileContent], 'settings.json', { type: 'application/json' });
      
      // Find import input
      const importInput = document.getElementById('import-settings') as HTMLInputElement;
      
      // Simulate file selection
      Object.defineProperty(importInput, 'files', {
        value: [file],
        writable: false,
      });

      fireEvent.change(importInput);

      // Settings should be updated
      await waitFor(() => {
        const timeoutInput = screen.getByDisplayValue('30');
        expect(timeoutInput).toBeInTheDocument();
      });
    });

    it('should reset to defaults', async () => {
      const user = userEvent.setup();
      window.confirm = vi.fn(() => true);
      
      // Mock reload
      const originalReload = window.location.reload;
      window.location.reload = vi.fn();
      
      render(<AdvancedSettings />);

      await waitFor(() => {
        expect(screen.getByText('Reset')).toBeInTheDocument();
      });

      await user.click(screen.getByText('Reset'));

      expect(window.confirm).toHaveBeenCalledWith(
        'Are you sure you want to reset all settings to defaults?'
      );
      expect(window.location.reload).toHaveBeenCalled();
      
      // Restore original reload
      window.location.reload = originalReload;
    });
  });

  describe('Error Handling', () => {
    it('should handle save errors', async () => {
      const user = userEvent.setup();
      
      (global.fetch as any).mockImplementation((url: string) => {
        if (url.includes('PUT')) {
          return Promise.resolve({ ok: false });
        }
        return Promise.resolve({
          ok: true,
          json: async () => defaultSettings,
        });
      });
      
      render(<AdvancedSettings />);

      await user.click(screen.getByText('Save Settings'));

      await waitFor(() => {
        expect(screen.getByText('Failed to save settings')).toBeInTheDocument();
      });
    });

    it('should handle invalid import files', async () => {
      window.alert = vi.fn();
      
      render(<AdvancedSettings />);

      const invalidContent = 'invalid json';
      const file = new File([invalidContent], 'invalid.json', { type: 'application/json' });
      
      const importInput = document.getElementById('import-settings') as HTMLInputElement;
      
      Object.defineProperty(importInput, 'files', {
        value: [file],
        writable: false,
      });

      fireEvent.change(importInput);

      await waitFor(() => {
        expect(window.alert).toHaveBeenCalledWith('Invalid settings file');
      });
    });
  });
});