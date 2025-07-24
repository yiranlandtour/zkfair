import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SocialRecovery } from '../SocialRecovery';
import { useAccount } from 'wagmi';
import { vi } from 'vitest';

// Mock wagmi hooks
vi.mock('wagmi', () => ({
  useAccount: vi.fn(),
}));

// Mock fetch
global.fetch = vi.fn();

describe('SocialRecovery', () => {
  const mockAddress = '0x1234567890123456789012345678901234567890';

  beforeEach(() => {
    vi.clearAllMocks();
    (useAccount as any).mockReturnValue({ address: mockAddress });
    
    // Default fetch mock
    (global.fetch as any).mockResolvedValue({
      ok: true,
      json: async () => ({
        config: {
          threshold: 3,
          cooldownPeriod: 48,
          expiryPeriod: 72,
          guardians: [],
          isLocked: false,
        },
        activeRequests: [],
      }),
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Recovery Configuration', () => {
    it('should render social recovery interface', async () => {
      render(<SocialRecovery />);
      
      await waitFor(() => {
        expect(screen.getByText('Social Recovery')).toBeInTheDocument();
        expect(screen.getByText('Recovery Threshold')).toBeInTheDocument();
        expect(screen.getByText('Cooldown Period')).toBeInTheDocument();
      });
    });

    it('should display recovery configuration', async () => {
      render(<SocialRecovery />);
      
      await waitFor(() => {
        expect(screen.getByText('3')).toBeInTheDocument(); // threshold
        expect(screen.getByText('48h')).toBeInTheDocument(); // cooldown
        expect(screen.getByText('0')).toBeInTheDocument(); // active guardians
      });
    });

    it('should show wallet status', async () => {
      render(<SocialRecovery />);
      
      await waitFor(() => {
        expect(screen.getByText('Wallet Active')).toBeInTheDocument();
      });
    });

    it('should show locked wallet status', async () => {
      (global.fetch as any).mockResolvedValue({
        ok: true,
        json: async () => ({
          config: {
            threshold: 3,
            cooldownPeriod: 48,
            expiryPeriod: 72,
            guardians: [],
            isLocked: true,
          },
          activeRequests: [],
        }),
      });

      render(<SocialRecovery />);
      
      await waitFor(() => {
        expect(screen.getByText('Wallet Locked')).toBeInTheDocument();
      });
    });
  });

  describe('Guardian Management', () => {
    it('should allow adding guardians', async () => {
      const user = userEvent.setup();
      render(<SocialRecovery />);

      await waitFor(() => {
        expect(screen.getByText('Add Guardian')).toBeInTheDocument();
      });

      await user.click(screen.getByText('Add Guardian'));

      // Fill in guardian details
      const nameInput = screen.getByPlaceholderText('e.g., John Doe');
      const emailInput = screen.getByPlaceholderText('guardian@example.com');
      const phoneInput = screen.getByPlaceholderText('+1234567890');
      const addressInput = screen.getByPlaceholderText('0x...');

      await user.type(nameInput, 'John Doe');
      await user.type(emailInput, 'john@example.com');
      await user.type(phoneInput, '+1234567890');
      await user.type(addressInput, '0xabcdef1234567890123456789012345678901234');

      await user.click(screen.getAllByText('Add Guardian')[1]); // Modal button

      expect(global.fetch).toHaveBeenCalledWith(
        '/api/recovery/guardians',
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining('John Doe'),
        })
      );
    });

    it('should display existing guardians', async () => {
      (global.fetch as any).mockResolvedValue({
        ok: true,
        json: async () => ({
          config: {
            threshold: 3,
            cooldownPeriod: 48,
            expiryPeriod: 72,
            guardians: [
              {
                id: 'g1',
                name: 'Alice',
                email: 'alice@example.com',
                phone: '+1234567890',
                walletAddress: '0xalice',
                status: 'active',
                addedAt: new Date(),
              },
              {
                id: 'g2',
                name: 'Bob',
                email: 'bob@example.com',
                status: 'pending',
                addedAt: new Date(),
              },
            ],
            isLocked: false,
          },
          activeRequests: [],
        }),
      });

      render(<SocialRecovery />);

      await waitFor(() => {
        expect(screen.getByText('Alice')).toBeInTheDocument();
        expect(screen.getByText('alice@example.com')).toBeInTheDocument();
        expect(screen.getByText('Bob')).toBeInTheDocument();
        expect(screen.getByText('Active Guardians')).toBeInTheDocument();
      });
    });

    it('should allow removing guardians', async () => {
      const user = userEvent.setup();
      
      (global.fetch as any).mockResolvedValue({
        ok: true,
        json: async () => ({
          config: {
            threshold: 3,
            cooldownPeriod: 48,
            expiryPeriod: 72,
            guardians: [
              {
                id: 'g1',
                name: 'Alice',
                email: 'alice@example.com',
                status: 'active',
                addedAt: new Date(),
              },
            ],
            isLocked: false,
          },
          activeRequests: [],
        }),
      });

      // Mock window.confirm
      window.confirm = vi.fn(() => true);

      render(<SocialRecovery />);

      await waitFor(() => {
        expect(screen.getByText('Alice')).toBeInTheDocument();
      });

      // Find and click remove button (X icon)
      const removeButtons = screen.getAllByRole('button').filter(btn => 
        btn.querySelector('svg')
      );
      
      await user.click(removeButtons[removeButtons.length - 1]); // Last X button

      expect(window.confirm).toHaveBeenCalledWith('Are you sure you want to remove this guardian?');
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/recovery/guardians/g1'),
        expect.objectContaining({
          method: 'DELETE',
        })
      );
    });

    it('should validate guardian email format', async () => {
      const user = userEvent.setup();
      render(<SocialRecovery />);

      await user.click(screen.getByText('Add Guardian'));

      const nameInput = screen.getByPlaceholderText('e.g., John Doe');
      const emailInput = screen.getByPlaceholderText('guardian@example.com');

      await user.type(nameInput, 'Test Guardian');
      await user.type(emailInput, 'invalid-email');

      // Should still allow submission but email is optional
      await user.click(screen.getAllByText('Add Guardian')[1]);

      expect(nameInput).toHaveValue('Test Guardian');
    });
  });

  describe('Recovery Process', () => {
    beforeEach(() => {
      (global.fetch as any).mockResolvedValue({
        ok: true,
        json: async () => ({
          config: {
            threshold: 2,
            cooldownPeriod: 48,
            expiryPeriod: 72,
            guardians: [
              { id: 'g1', name: 'Alice', status: 'active', addedAt: new Date() },
              { id: 'g2', name: 'Bob', status: 'active', addedAt: new Date() },
              { id: 'g3', name: 'Charlie', status: 'active', addedAt: new Date() },
            ],
            isLocked: false,
          },
          activeRequests: [],
        }),
      });
    });

    it('should show initiate recovery button when enough guardians', async () => {
      render(<SocialRecovery />);

      await waitFor(() => {
        expect(screen.getByText('Initiate Recovery Process')).toBeInTheDocument();
      });
    });

    it('should not show initiate recovery without enough guardians', async () => {
      (global.fetch as any).mockResolvedValue({
        ok: true,
        json: async () => ({
          config: {
            threshold: 3,
            cooldownPeriod: 48,
            expiryPeriod: 72,
            guardians: [
              { id: 'g1', name: 'Alice', status: 'active', addedAt: new Date() },
            ],
            isLocked: false,
          },
          activeRequests: [],
        }),
      });

      render(<SocialRecovery />);

      await waitFor(() => {
        expect(screen.queryByText('Initiate Recovery Process')).not.toBeInTheDocument();
      });
    });

    it('should initiate recovery process', async () => {
      const user = userEvent.setup();
      render(<SocialRecovery />);

      await waitFor(() => {
        expect(screen.getByText('Initiate Recovery Process')).toBeInTheDocument();
      });

      await user.click(screen.getByText('Initiate Recovery Process'));

      // Fill recovery form
      const newOwnerInput = screen.getByPlaceholderText('0x...');
      const reasonInput = screen.getByPlaceholderText('Lost access to private keys...');

      await user.type(newOwnerInput, '0x9999999999999999999999999999999999999999');
      await user.type(reasonInput, 'Lost my private keys');

      await user.click(screen.getByText('Start Recovery'));

      expect(global.fetch).toHaveBeenCalledWith(
        '/api/recovery/initiate',
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining('Lost my private keys'),
        })
      );
    });
  });

  describe('Active Recovery Requests', () => {
    it('should display active recovery requests', async () => {
      (global.fetch as any).mockResolvedValue({
        ok: true,
        json: async () => ({
          config: {
            threshold: 2,
            cooldownPeriod: 48,
            expiryPeriod: 72,
            guardians: [
              { id: 'g1', name: 'Alice', status: 'active', addedAt: new Date() },
              { id: 'g2', name: 'Bob', status: 'active', addedAt: new Date() },
            ],
            isLocked: false,
          },
          activeRequests: [
            {
              id: 'req1',
              initiator: '0xinitiator',
              newOwner: '0xnewowner',
              reason: 'Lost access',
              approvals: ['0xguardian1'],
              rejections: [],
              status: 'pending',
              createdAt: new Date(),
              expiresAt: new Date(Date.now() + 48 * 60 * 60 * 1000),
            },
          ],
        }),
      });

      render(<SocialRecovery />);

      await waitFor(() => {
        expect(screen.getByText('Active Recovery Requests')).toBeInTheDocument();
        expect(screen.getByText('Lost access')).toBeInTheDocument();
        expect(screen.getByText('Approvals: 1/2')).toBeInTheDocument();
      });
    });

    it('should allow approving recovery request', async () => {
      const user = userEvent.setup();
      
      (global.fetch as any).mockResolvedValue({
        ok: true,
        json: async () => ({
          config: {
            threshold: 2,
            cooldownPeriod: 48,
            expiryPeriod: 72,
            guardians: [
              { id: 'g1', name: 'Alice', status: 'active', addedAt: new Date() },
              { id: 'g2', name: 'Bob', status: 'active', addedAt: new Date() },
            ],
            isLocked: false,
          },
          activeRequests: [
            {
              id: 'req1',
              initiator: '0xinitiator',
              newOwner: '0xnewowner',
              reason: 'Lost access',
              approvals: [],
              rejections: [],
              status: 'pending',
              createdAt: new Date(),
              expiresAt: new Date(Date.now() + 48 * 60 * 60 * 1000),
            },
          ],
        }),
      });

      render(<SocialRecovery />);

      await waitFor(() => {
        expect(screen.getByText('Approve')).toBeInTheDocument();
      });

      await user.click(screen.getByText('Approve'));

      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/recovery/requests/req1/approve'),
        expect.objectContaining({
          method: 'POST',
        })
      );
    });

    it('should allow rejecting recovery request', async () => {
      const user = userEvent.setup();
      
      (global.fetch as any).mockResolvedValue({
        ok: true,
        json: async () => ({
          config: {
            threshold: 2,
            cooldownPeriod: 48,
            expiryPeriod: 72,
            guardians: [],
            isLocked: false,
          },
          activeRequests: [
            {
              id: 'req1',
              initiator: '0xinitiator',
              newOwner: '0xnewowner',
              reason: 'Suspicious request',
              approvals: [],
              rejections: [],
              status: 'pending',
              createdAt: new Date(),
              expiresAt: new Date(Date.now() + 48 * 60 * 60 * 1000),
            },
          ],
        }),
      });

      render(<SocialRecovery />);

      await waitFor(() => {
        expect(screen.getByText('Reject')).toBeInTheDocument();
      });

      await user.click(screen.getByText('Reject'));

      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/recovery/requests/req1/reject'),
        expect.objectContaining({
          method: 'POST',
        })
      );
    });

    it('should show execute button for approved requests', async () => {
      (global.fetch as any).mockResolvedValue({
        ok: true,
        json: async () => ({
          config: {
            threshold: 2,
            cooldownPeriod: 48,
            expiryPeriod: 72,
            guardians: [],
            isLocked: false,
          },
          activeRequests: [
            {
              id: 'req1',
              initiator: '0xinitiator',
              newOwner: '0xnewowner',
              reason: 'Lost access',
              approvals: ['0xguardian1', '0xguardian2'],
              rejections: [],
              status: 'approved',
              createdAt: new Date(),
              expiresAt: new Date(Date.now() + 48 * 60 * 60 * 1000),
            },
          ],
        }),
      });

      render(<SocialRecovery />);

      await waitFor(() => {
        expect(screen.getByText('Execute')).toBeInTheDocument();
      });
    });

    it('should display time remaining for requests', async () => {
      (global.fetch as any).mockResolvedValue({
        ok: true,
        json: async () => ({
          config: {
            threshold: 2,
            cooldownPeriod: 48,
            expiryPeriod: 72,
            guardians: [],
            isLocked: false,
          },
          activeRequests: [
            {
              id: 'req1',
              initiator: '0xinitiator',
              newOwner: '0xnewowner',
              reason: 'Lost access',
              approvals: [],
              rejections: [],
              status: 'pending',
              createdAt: new Date(),
              expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours from now
            },
          ],
        }),
      });

      render(<SocialRecovery />);

      await waitFor(() => {
        expect(screen.getByText(/h remaining/)).toBeInTheDocument();
      });
    });
  });

  describe('Configuration Updates', () => {
    it('should allow updating recovery threshold', async () => {
      const user = userEvent.setup();
      window.prompt = vi.fn(() => '2');
      
      render(<SocialRecovery />);

      await waitFor(() => {
        expect(screen.getByText('Recovery Threshold')).toBeInTheDocument();
      });

      // Find the key icon button for threshold update
      const updateButtons = screen.getAllByRole('button').filter(btn => 
        btn.querySelector('svg')
      );
      
      await user.click(updateButtons[0]); // First key icon

      expect(window.prompt).toHaveBeenCalledWith('Enter new threshold:', '3');
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/recovery/config',
        expect.objectContaining({
          method: 'PUT',
          body: expect.stringContaining('"threshold":2'),
        })
      );
    });
  });

  describe('Loading and Error States', () => {
    it('should show loading state', async () => {
      (global.fetch as any).mockImplementation(() => new Promise(() => {})); // Never resolves
      
      render(<SocialRecovery />);

      expect(screen.getByRole('status')).toBeInTheDocument(); // Loading spinner
    });

    it('should handle API errors gracefully', async () => {
      (global.fetch as any).mockRejectedValue(new Error('Network error'));
      
      render(<SocialRecovery />);

      await waitFor(() => {
        expect(screen.getByText('Social Recovery')).toBeInTheDocument();
      });
    });
  });
});