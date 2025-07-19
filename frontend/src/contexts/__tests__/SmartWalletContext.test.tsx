import React from 'react';
import { render, screen, waitFor, act } from '@testing-library/react';
import { SmartWalletProvider, useSmartWallet } from '../SmartWalletContext';
import { useAccount, useNetwork, usePublicClient, useWalletClient } from 'wagmi';
import { SimpleAccountAPI } from '@account-abstraction/sdk';

// Mock wagmi hooks
jest.mock('wagmi');
jest.mock('@account-abstraction/sdk');

const mockUseAccount = useAccount as jest.MockedFunction<typeof useAccount>;
const mockUseNetwork = useNetwork as jest.MockedFunction<typeof useNetwork>;
const mockUsePublicClient = usePublicClient as jest.MockedFunction<typeof usePublicClient>;
const mockUseWalletClient = useWalletClient as jest.MockedFunction<typeof useWalletClient>;

// Mock fetch
global.fetch = jest.fn();

// Test component to access context
const TestComponent = () => {
  const context = useSmartWallet();
  return (
    <div>
      <div data-testid="address">{context.smartWalletAddress || 'null'}</div>
      <div data-testid="deployed">{context.isDeployed.toString()}</div>
      <button onClick={() => context.deploySmartWallet()}>Deploy</button>
      <button onClick={() => context.sendUserOperation('0x123', '0x')}>Send</button>
      <button onClick={() => context.estimateGas('0x123', '0x')}>Estimate</button>
      <button onClick={async () => {
        const balance = await context.getBalance('0x0000000000000000000000000000000000000000');
        console.log(balance);
      }}>Get Balance</button>
    </div>
  );
};

describe('SmartWalletContext', () => {
  const mockPublicClient = {
    getBalance: jest.fn(),
    readContract: jest.fn(),
  };
  
  const mockWalletClient = {
    account: { address: '0x1234567890123456789012345678901234567890' },
    chain: { id: 1 },
  };

  const mockProvider = {
    getSigner: jest.fn(),
    getCode: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Default mock implementations
    mockUseAccount.mockReturnValue({
      address: '0x1234567890123456789012345678901234567890',
      isConnected: true,
    } as any);
    
    mockUseNetwork.mockReturnValue({
      chain: { id: 1 },
    } as any);
    
    mockUsePublicClient.mockReturnValue(mockPublicClient as any);
    
    mockUseWalletClient.mockReturnValue({
      data: mockWalletClient,
    } as any);

    // Mock ethers BrowserProvider
    jest.spyOn(require('ethers'), 'BrowserProvider').mockImplementation(() => mockProvider);
    
    // Mock SimpleAccountAPI
    (SimpleAccountAPI as jest.Mock).mockImplementation(() => ({
      getAccountAddress: jest.fn().mockResolvedValue('0xsmartwalletaddress'),
      createSignedUserOp: jest.fn().mockResolvedValue({
        sender: '0xsmartwalletaddress',
        nonce: '0x0',
        // ... other UserOp fields
      }),
      createUnsignedUserOp: jest.fn().mockResolvedValue({
        sender: '0xsmartwalletaddress',
        nonce: '0x0',
        // ... other UserOp fields
      }),
    }));
  });

  it('throws error when used outside provider', () => {
    // Suppress console.error for this test
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
    
    expect(() => {
      render(<TestComponent />);
    }).toThrow('useSmartWallet must be used within SmartWalletProvider');
    
    consoleSpy.mockRestore();
  });

  it('initializes smart wallet when account is connected', async () => {
    mockProvider.getCode.mockResolvedValue('0x123'); // Deployed wallet
    
    render(
      <SmartWalletProvider>
        <TestComponent />
      </SmartWalletProvider>
    );
    
    await waitFor(() => {
      expect(screen.getByTestId('address')).toHaveTextContent('0xsmartwalletaddress');
      expect(screen.getByTestId('deployed')).toHaveTextContent('true');
    });
  });

  it('detects undeployed wallet', async () => {
    mockProvider.getCode.mockResolvedValue('0x'); // Not deployed
    
    render(
      <SmartWalletProvider>
        <TestComponent />
      </SmartWalletProvider>
    );
    
    await waitFor(() => {
      expect(screen.getByTestId('address')).toHaveTextContent('0xsmartwalletaddress');
      expect(screen.getByTestId('deployed')).toHaveTextContent('false');
    });
  });

  it('handles wallet deployment', async () => {
    mockProvider.getCode.mockResolvedValue('0x'); // Initially not deployed
    (fetch as jest.Mock)
      .mockResolvedValueOnce({
        json: async () => ({ result: '0xopHash123' }),
      })
      .mockResolvedValueOnce({
        json: async () => ({ result: { success: true } }),
      });
    
    render(
      <SmartWalletProvider>
        <TestComponent />
      </SmartWalletProvider>
    );
    
    await waitFor(() => {
      expect(screen.getByTestId('deployed')).toHaveTextContent('false');
    });
    
    await act(async () => {
      screen.getByText('Deploy').click();
    });
    
    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining('eth_sendUserOperation'),
        })
      );
    });
  });

  it('sends user operations', async () => {
    mockProvider.getCode.mockResolvedValue('0x123'); // Deployed
    (fetch as jest.Mock).mockResolvedValueOnce({
      json: async () => ({ result: '0xopHash456' }),
    });
    
    render(
      <SmartWalletProvider>
        <TestComponent />
      </SmartWalletProvider>
    );
    
    await waitFor(() => {
      expect(screen.getByTestId('deployed')).toHaveTextContent('true');
    });
    
    await act(async () => {
      screen.getByText('Send').click();
    });
    
    expect(fetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        method: 'POST',
        body: expect.stringContaining('eth_sendUserOperation'),
      })
    );
  });

  it('estimates gas for operations', async () => {
    mockProvider.getCode.mockResolvedValue('0x123');
    (fetch as jest.Mock).mockResolvedValueOnce({
      json: async () => ({
        result: {
          callGasLimit: '0x5208',
          verificationGasLimit: '0x5208',
          preVerificationGas: '0x5208',
        },
      }),
    });
    
    render(
      <SmartWalletProvider>
        <TestComponent />
      </SmartWalletProvider>
    );
    
    await waitFor(() => {
      expect(screen.getByTestId('deployed')).toHaveTextContent('true');
    });
    
    await act(async () => {
      screen.getByText('Estimate').click();
    });
    
    expect(fetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        method: 'POST',
        body: expect.stringContaining('eth_estimateUserOperationGas'),
      })
    );
  });

  it('gets native token balance', async () => {
    mockProvider.getCode.mockResolvedValue('0x123');
    mockPublicClient.getBalance.mockResolvedValue(BigInt('1000000000000000000'));
    
    render(
      <SmartWalletProvider>
        <TestComponent />
      </SmartWalletProvider>
    );
    
    await waitFor(() => {
      expect(screen.getByTestId('deployed')).toHaveTextContent('true');
    });
    
    await act(async () => {
      screen.getByText('Get Balance').click();
    });
    
    expect(mockPublicClient.getBalance).toHaveBeenCalledWith({
      address: '0xsmartwalletaddress',
    });
  });

  it('gets ERC20 token balance', async () => {
    mockProvider.getCode.mockResolvedValue('0x123');
    mockPublicClient.readContract.mockResolvedValue(BigInt('100000000'));
    
    const TestComponentERC20 = () => {
      const { getBalance } = useSmartWallet();
      return (
        <button onClick={async () => {
          const balance = await getBalance('0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48');
          console.log(balance);
        }}>Get USDC Balance</button>
      );
    };
    
    render(
      <SmartWalletProvider>
        <TestComponentERC20 />
      </SmartWalletProvider>
    );
    
    await waitFor(() => {
      expect(screen.getByText('Get USDC Balance')).toBeInTheDocument();
    });
    
    await act(async () => {
      screen.getByText('Get USDC Balance').click();
    });
    
    expect(mockPublicClient.readContract).toHaveBeenCalledWith({
      address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
      abi: expect.any(Array),
      functionName: 'balanceOf',
      args: ['0xsmartwalletaddress'],
    });
  });

  it('handles errors in user operations', async () => {
    mockProvider.getCode.mockResolvedValue('0x123');
    (fetch as jest.Mock).mockResolvedValueOnce({
      json: async () => ({
        error: { message: 'Insufficient funds' },
      }),
    });
    
    const TestComponentWithError = () => {
      const { sendUserOperation } = useSmartWallet();
      const [error, setError] = React.useState<string>('');
      
      return (
        <div>
          <button onClick={async () => {
            try {
              await sendUserOperation('0x123', '0x');
            } catch (e: any) {
              setError(e.message);
            }
          }}>Send</button>
          <div data-testid="error">{error}</div>
        </div>
      );
    };
    
    render(
      <SmartWalletProvider>
        <TestComponentWithError />
      </SmartWalletProvider>
    );
    
    await waitFor(() => {
      expect(screen.getByText('Send')).toBeInTheDocument();
    });
    
    await act(async () => {
      screen.getByText('Send').click();
    });
    
    await waitFor(() => {
      expect(screen.getByTestId('error')).toHaveTextContent('Insufficient funds');
    });
  });

  it('does not initialize when wallet not connected', () => {
    mockUseAccount.mockReturnValue({
      address: undefined,
      isConnected: false,
    } as any);
    
    render(
      <SmartWalletProvider>
        <TestComponent />
      </SmartWalletProvider>
    );
    
    expect(screen.getByTestId('address')).toHaveTextContent('null');
    expect(screen.getByTestId('deployed')).toHaveTextContent('false');
  });
});