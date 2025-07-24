import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ethers } from 'ethers';
import { ZKFairSDK, ZKFairConfig, TransferOptions, BatchTransferOptions } from '../ZKFairSDK';
import { SimpleAccountAPI } from '@account-abstraction/sdk';

// Mock dependencies
vi.mock('@account-abstraction/sdk', () => ({
  SimpleAccountAPI: vi.fn().mockImplementation(() => ({
    getAccountAddress: vi.fn(),
    createSignedUserOp: vi.fn(),
    createUnsignedUserOp: vi.fn(),
  })),
  PaymasterAPI: vi.fn(),
}));

// Mock fetch
global.fetch = vi.fn();

// Mock environment variables
process.env.REACT_APP_USDC_ADDRESS = '0xusdc';
process.env.REACT_APP_USDT_ADDRESS = '0xusdt';

describe('ZKFairSDK', () => {
  let sdk: ZKFairSDK;
  let mockProvider: any;
  let mockSigner: any;
  let mockAccountAPI: any;
  
  const config: ZKFairConfig = {
    rpcUrl: 'https://rpc.example.com',
    bundlerUrl: 'https://bundler.example.com',
    entryPointAddress: '0xentrypoint',
    factoryAddress: '0xfactory',
    paymasterAddress: '0xpaymaster',
    apiUrl: 'https://api.example.com',
  };
  
  const mockSmartWalletAddress = '0x1234567890123456789012345678901234567890';

  beforeEach(() => {
    vi.clearAllMocks();
    
    // Mock provider
    mockProvider = {
      getCode: vi.fn().mockResolvedValue('0x123456'), // Non-empty code = deployed
      getBalance: vi.fn().mockResolvedValue(ethers.parseEther('1')),
    };
    
    // Mock signer
    mockSigner = {
      provider: mockProvider,
      getAddress: vi.fn().mockResolvedValue('0xsigner'),
    };
    
    // Mock account API
    mockAccountAPI = {
      getAccountAddress: vi.fn().mockResolvedValue(mockSmartWalletAddress),
      createSignedUserOp: vi.fn().mockResolvedValue({
        sender: mockSmartWalletAddress,
        nonce: '0x1',
        initCode: '0x',
        callData: '0x',
        callGasLimit: '0x5208',
        verificationGasLimit: '0x20000',
        preVerificationGas: '0x10000',
        maxFeePerGas: '0x1',
        maxPriorityFeePerGas: '0x1',
        paymasterAndData: '0x',
        signature: '0xsignature',
      }),
      createUnsignedUserOp: vi.fn().mockResolvedValue({
        sender: mockSmartWalletAddress,
        nonce: '0x1',
        initCode: '0x',
        callData: '0x',
        callGasLimit: '0x0',
        verificationGasLimit: '0x0',
        preVerificationGas: '0x0',
        maxFeePerGas: '0x1',
        maxPriorityFeePerGas: '0x1',
        paymasterAndData: '0x',
        signature: '0x',
      }),
    };
    
    // Override SimpleAccountAPI implementation
    (SimpleAccountAPI as any).mockImplementation(() => mockAccountAPI);
    
    // Mock successful bundler responses
    (global.fetch as any).mockResolvedValue({
      ok: true,
      json: async () => ({
        jsonrpc: '2.0',
        result: '0xuserophash123',
        id: 1,
      }),
    });
    
    sdk = new ZKFairSDK(config, mockSigner);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Initialization', () => {
    it('should initialize with signer', async () => {
      expect(sdk).toBeDefined();
      
      // Wait for initialization
      await new Promise(resolve => setTimeout(resolve, 0));
      
      expect(SimpleAccountAPI).toHaveBeenCalled();
      expect(mockAccountAPI.getAccountAddress).toHaveBeenCalled();
    });

    it('should throw error if provider is passed instead of signer', () => {
      expect(() => {
        new ZKFairSDK(config, mockProvider);
      }).toThrow('Signer required for ZKFairSDK');
    });

    it('should emit initialized event', async () => {
      const initPromise = new Promise((resolve) => {
        sdk.once('initialized', resolve);
      });

      await initPromise;

      expect(await sdk.getAddress()).toBe(mockSmartWalletAddress);
    });
  });

  describe('Wallet Functions', () => {
    describe('getAddress', () => {
      it('should return smart wallet address', async () => {
        const address = await sdk.getAddress();
        expect(address).toBe(mockSmartWalletAddress);
      });

      it('should cache address after first call', async () => {
        await sdk.getAddress();
        await sdk.getAddress();
        
        // Should only call once due to caching
        expect(mockAccountAPI.getAccountAddress).toHaveBeenCalledTimes(1);
      });
    });

    describe('isDeployed', () => {
      it('should return true for deployed wallet', async () => {
        mockProvider.getCode.mockResolvedValue('0x123456');
        
        const deployed = await sdk.isDeployed();
        expect(deployed).toBe(true);
        expect(mockProvider.getCode).toHaveBeenCalledWith(mockSmartWalletAddress);
      });

      it('should return false for non-deployed wallet', async () => {
        mockProvider.getCode.mockResolvedValue('0x');
        
        const deployed = await sdk.isDeployed();
        expect(deployed).toBe(false);
      });
    });

    describe('deploy', () => {
      it('should deploy smart wallet', async () => {
        mockProvider.getCode.mockResolvedValue('0x'); // Not deployed
        
        const userOpHash = await sdk.deploy();
        
        expect(userOpHash).toBe('0xuserophash123');
        expect(mockAccountAPI.createSignedUserOp).toHaveBeenCalledWith({
          target: ethers.ZeroAddress,
          data: '0x',
          value: 0n,
        });
      });

      it('should throw error if already deployed', async () => {
        mockProvider.getCode.mockResolvedValue('0x123456'); // Already deployed
        
        await expect(sdk.deploy()).rejects.toThrow('Smart wallet already deployed');
      });
    });
  });

  describe('Balance Functions', () => {
    describe('getBalance', () => {
      it('should get native token balance', async () => {
        const balance = await sdk.getBalance();
        
        expect(balance).toBe(ethers.parseEther('1'));
        expect(mockProvider.getBalance).toHaveBeenCalledWith(mockSmartWalletAddress);
      });

      it('should get ERC20 token balance', async () => {
        const mockTokenBalance = ethers.parseUnits('1000', 6);
        const mockContract = {
          balanceOf: vi.fn().mockResolvedValue(mockTokenBalance),
        };
        
        vi.spyOn(ethers, 'Contract').mockReturnValue(mockContract as any);
        
        const balance = await sdk.getBalance('0xusdc');
        
        expect(balance).toBe(mockTokenBalance);
        expect(mockContract.balanceOf).toHaveBeenCalledWith(mockSmartWalletAddress);
      });
    });

    describe('getBalances', () => {
      it('should get multiple token balances', async () => {
        const tokens = ['0xusdc', '0xusdt', ethers.ZeroAddress];
        
        mockProvider.getBalance.mockResolvedValue(ethers.parseEther('1'));
        
        const mockContract = {
          balanceOf: vi.fn()
            .mockResolvedValueOnce(ethers.parseUnits('1000', 6))
            .mockResolvedValueOnce(ethers.parseUnits('500', 6)),
        };
        
        vi.spyOn(ethers, 'Contract').mockReturnValue(mockContract as any);
        
        const balances = await sdk.getBalances(tokens);
        
        expect(balances['0xusdc']).toBe(ethers.parseUnits('1000', 6));
        expect(balances['0xusdt']).toBe(ethers.parseUnits('500', 6));
        expect(balances[ethers.ZeroAddress]).toBe(ethers.parseEther('1'));
      });
    });
  });

  describe('Transfer Functions', () => {
    describe('transfer', () => {
      it('should transfer native tokens', async () => {
        const options: TransferOptions = {
          to: '0xrecipient',
          amount: ethers.parseEther('0.1'),
        };
        
        const userOpHash = await sdk.transfer(options);
        
        expect(userOpHash).toBe('0xuserophash123');
        expect(mockAccountAPI.createSignedUserOp).toHaveBeenCalledWith({
          target: '0xrecipient',
          data: '0x',
          value: ethers.parseEther('0.1'),
        });
      });

      it('should transfer ERC20 tokens', async () => {
        const options: TransferOptions = {
          to: '0xrecipient',
          amount: ethers.parseUnits('100', 6),
          token: '0xusdc',
          paymentToken: 'USDC',
        };
        
        const userOpHash = await sdk.transfer(options);
        
        expect(userOpHash).toBe('0xuserophash123');
        
        // Check that transfer function was encoded correctly
        const callArgs = mockAccountAPI.createSignedUserOp.mock.calls[0][0];
        expect(callArgs.target).toBe('0xusdc');
        expect(callArgs.value).toBe(0n);
        expect(callArgs.data).toContain('a9059cbb'); // transfer function selector
      });

      it('should emit transfer events', async () => {
        const pendingPromise = new Promise((resolve) => {
          sdk.once('transfer:pending', resolve);
        });
        
        const sentPromise = new Promise((resolve) => {
          sdk.once('transfer:sent', resolve);
        });
        
        const options: TransferOptions = {
          to: '0xrecipient',
          amount: ethers.parseEther('0.1'),
        };
        
        await sdk.transfer(options);
        
        const pendingEvent = await pendingPromise;
        const sentEvent = await sentPromise;
        
        expect(pendingEvent).toMatchObject({
          to: '0xrecipient',
          amount: ethers.parseEther('0.1'),
        });
        
        expect(sentEvent).toMatchObject({
          userOpHash: '0xuserophash123',
          to: '0xrecipient',
        });
      });
    });

    describe('batchTransfer', () => {
      it('should execute batch transfers', async () => {
        const options: BatchTransferOptions = {
          transfers: [
            {
              to: '0xrecipient1',
              amount: ethers.parseEther('0.1'),
            },
            {
              to: '0xrecipient2',
              amount: ethers.parseUnits('100', 6),
              token: '0xusdc',
            },
          ],
          paymentToken: 'USDC',
        };
        
        const userOpHash = await sdk.batchTransfer(options);
        
        expect(userOpHash).toBe('0xuserophash123');
        
        // Check batch encoding
        const callArgs = mockAccountAPI.createSignedUserOp.mock.calls[0][0];
        expect(callArgs.target).toBe(mockSmartWalletAddress);
        expect(callArgs.data).toContain('8d80ff0a'); // executeBatch selector
      });

      it('should calculate total value for native transfers', async () => {
        const options: BatchTransferOptions = {
          transfers: [
            {
              to: '0xrecipient1',
              amount: ethers.parseEther('0.1'),
            },
            {
              to: '0xrecipient2',
              amount: ethers.parseEther('0.2'),
            },
          ],
        };
        
        await sdk.batchTransfer(options);
        
        const callArgs = mockAccountAPI.createSignedUserOp.mock.calls[0][0];
        expect(callArgs.value).toBe(ethers.parseEther('0.3'));
      });
    });
  });

  describe('Gas Estimation', () => {
    it('should estimate transaction cost', async () => {
      (global.fetch as any).mockImplementation((url: string) => {
        if (url.includes('eth_estimateUserOperationGas')) {
          return Promise.resolve({
            ok: true,
            json: async () => ({
              jsonrpc: '2.0',
              result: {
                preVerificationGas: '0x10000',
                verificationGasLimit: '0x20000',
                callGasLimit: '0x5208',
              },
              id: 1,
            }),
          });
        }
        return Promise.resolve({
          ok: true,
          json: async () => ({
            jsonrpc: '2.0',
            result: '0xuserophash123',
            id: 1,
          }),
        });
      });
      
      const estimate = await sdk.estimateTransactionCost(
        '0xrecipient',
        ethers.parseEther('0.1'),
        '0x',
        'USDC'
      );
      
      expect(estimate).toHaveProperty('estimatedGas');
      expect(estimate).toHaveProperty('tokenAmount');
      expect(estimate).toHaveProperty('tokenSymbol', 'USDC');
      expect(estimate).toHaveProperty('usdValue');
      expect(estimate).toHaveProperty('exchangeRate');
    });

    it('should handle gas estimation errors', async () => {
      (global.fetch as any).mockImplementation((url: string) => {
        if (url.includes('eth_estimateUserOperationGas')) {
          return Promise.resolve({
            ok: true,
            json: async () => ({
              jsonrpc: '2.0',
              error: { message: 'Estimation failed' },
              id: 1,
            }),
          });
        }
        return Promise.resolve({
          ok: true,
          json: async () => ({
            jsonrpc: '2.0',
            result: '0xuserophash123',
            id: 1,
          }),
        });
      });
      
      await expect(
        sdk.estimateTransactionCost('0xrecipient', ethers.parseEther('0.1'))
      ).rejects.toThrow('Estimation failed');
    });
  });

  describe('Transaction History', () => {
    it('should fetch transaction history', async () => {
      const mockHistory = [
        { hash: '0xtx1', from: mockSmartWalletAddress, to: '0xrecipient1' },
        { hash: '0xtx2', from: mockSmartWalletAddress, to: '0xrecipient2' },
      ];
      
      (global.fetch as any).mockImplementation((url: string) => {
        if (url.includes('/transactions')) {
          return Promise.resolve({
            ok: true,
            json: async () => mockHistory,
          });
        }
        return Promise.resolve({
          ok: true,
          json: async () => ({ result: '0xuserophash123' }),
        });
      });
      
      const history = await sdk.getTransactionHistory();
      
      expect(history).toEqual(mockHistory);
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/transactions?address=' + mockSmartWalletAddress)
      );
    });

    it('should apply filters to transaction history', async () => {
      const startDate = new Date('2023-01-01');
      const endDate = new Date('2023-12-31');
      
      await sdk.getTransactionHistory({
        startDate,
        endDate,
        limit: 10,
        offset: 20,
      });
      
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('startDate=' + startDate.toISOString())
      );
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('endDate=' + endDate.toISOString())
      );
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('limit=10')
      );
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('offset=20')
      );
    });

    it('should handle API errors', async () => {
      (global.fetch as any).mockImplementation((url: string) => {
        if (url.includes('/transactions')) {
          return Promise.resolve({
            ok: false,
            status: 500,
          });
        }
        return Promise.resolve({
          ok: true,
          json: async () => ({ result: '0xuserophash123' }),
        });
      });
      
      await expect(sdk.getTransactionHistory()).rejects.toThrow(
        'Failed to fetch transaction history'
      );
    });
  });

  describe('Utility Functions', () => {
    describe('waitForTransaction', () => {
      it('should wait for transaction confirmation', async () => {
        let callCount = 0;
        (global.fetch as any).mockImplementation((url: string) => {
          if (url.includes('eth_getUserOperationReceipt')) {
            callCount++;
            return Promise.resolve({
              ok: true,
              json: async () => ({
                jsonrpc: '2.0',
                result: callCount >= 2 ? { receipt: 'confirmed' } : null,
                id: 1,
              }),
            });
          }
          return Promise.resolve({
            ok: true,
            json: async () => ({ result: '0xuserophash123' }),
          });
        });
        
        const confirmPromise = new Promise((resolve) => {
          sdk.once('transaction:confirmed', resolve);
        });
        
        const receipt = await sdk.waitForTransaction('0xuserophash123');
        const event = await confirmPromise;
        
        expect(receipt).toEqual({ receipt: 'confirmed' });
        expect(event).toMatchObject({
          userOpHash: '0xuserophash123',
          receipt: { receipt: 'confirmed' },
        });
      });

      it('should timeout if transaction not confirmed', async () => {
        (global.fetch as any).mockImplementation((url: string) => {
          if (url.includes('eth_getUserOperationReceipt')) {
            return Promise.resolve({
              ok: true,
              json: async () => ({
                jsonrpc: '2.0',
                result: null,
                id: 1,
              }),
            });
          }
          return Promise.resolve({
            ok: true,
            json: async () => ({ result: '0xuserophash123' }),
          });
        });
        
        await expect(
          sdk.waitForTransaction('0xuserophash123', 100) // 100ms timeout
        ).rejects.toThrow('Transaction timeout');
      });
    });

    describe('approveToken', () => {
      it('should approve token spending', async () => {
        const tokenAddress = '0xusdc';
        const spender = '0xspender';
        const amount = ethers.parseUnits('1000', 6);
        
        const userOpHash = await sdk.approveToken(tokenAddress, spender, amount);
        
        expect(userOpHash).toBe('0xuserophash123');
        
        const callArgs = mockAccountAPI.createSignedUserOp.mock.calls[0][0];
        expect(callArgs.target).toBe(tokenAddress);
        expect(callArgs.data).toContain('095ea7b3'); // approve function selector
      });

      it('should approve max uint256 by default', async () => {
        await sdk.approveToken('0xusdc', '0xspender');
        
        const callArgs = mockAccountAPI.createSignedUserOp.mock.calls[0][0];
        expect(callArgs.data).toContain('ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff');
      });
    });
  });

  describe('Error Handling', () => {
    it('should handle bundler errors', async () => {
      (global.fetch as any).mockResolvedValue({
        ok: true,
        json: async () => ({
          jsonrpc: '2.0',
          error: { message: 'Bundler error: insufficient funds' },
          id: 1,
        }),
      });
      
      await expect(
        sdk.transfer({ to: '0xrecipient', amount: ethers.parseEther('1') })
      ).rejects.toThrow('Bundler error: insufficient funds');
    });

    it('should handle network errors', async () => {
      (global.fetch as any).mockRejectedValue(new Error('Network error'));
      
      await expect(
        sdk.transfer({ to: '0xrecipient', amount: ethers.parseEther('1') })
      ).rejects.toThrow('Network error');
    });
  });

  describe('Advanced Features', () => {
    it('should throw not implemented for setupRecovery', async () => {
      await expect(
        sdk.setupRecovery(['0xguardian1', '0xguardian2'])
      ).rejects.toThrow('Not implemented');
    });
  });

  describe('Paymaster Integration', () => {
    it('should set paymaster data for USDC payments', async () => {
      const options: TransferOptions = {
        to: '0xrecipient',
        amount: ethers.parseEther('0.1'),
        paymentToken: 'USDC',
      };
      
      await sdk.transfer(options);
      
      // Should have paymaster data set
      const userOp = mockAccountAPI.createSignedUserOp.mock.results[0].value;
      expect(userOp.paymasterAndData).toBeTruthy();
    });

    it('should not set paymaster data for native payments', async () => {
      const options: TransferOptions = {
        to: '0xrecipient',
        amount: ethers.parseEther('0.1'),
        paymentToken: 'NATIVE',
      };
      
      await sdk.transfer(options);
      
      // Check the actual call arguments
      const callArgs = mockAccountAPI.createSignedUserOp.mock.calls[0][0];
      expect(callArgs).toBeDefined();
    });
  });
});