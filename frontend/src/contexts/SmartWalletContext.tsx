import React, { createContext, useContext, useState, useEffect } from 'react';
import { useAccount, useNetwork, usePublicClient, useWalletClient } from 'wagmi';
import { SimpleAccountAPI, PaymasterAPI } from '@account-abstraction/sdk';
import { UserOperationStruct } from '@account-abstraction/contracts';
import { ethers } from 'ethers';

interface SmartWalletContextType {
  smartWalletAddress: string | null;
  isDeployed: boolean;
  deploySmartWallet: () => Promise<void>;
  sendUserOperation: (target: string, data: string, value?: bigint) => Promise<string>;
  estimateGas: (target: string, data: string, value?: bigint) => Promise<bigint>;
  getBalance: (token: string) => Promise<bigint>;
}

const SmartWalletContext = createContext<SmartWalletContextType | null>(null);

export const useSmartWallet = () => {
  const context = useContext(SmartWalletContext);
  if (!context) {
    throw new Error('useSmartWallet must be used within SmartWalletProvider');
  }
  return context;
};

class StablecoinPaymaster implements PaymasterAPI {
  constructor(
    private paymasterAddress: string,
    private tokenAddress: string,
    private provider: any
  ) {}

  async getPaymasterAndData(
    userOp: Partial<UserOperationStruct>
  ): Promise<string> {
    const exchangeRate = await this.getExchangeRate();
    
    return ethers.concat([
      this.paymasterAddress,
      this.tokenAddress,
      ethers.toBeHex(exchangeRate, 32)
    ]);
  }

  private async getExchangeRate(): Promise<bigint> {
    return ethers.parseEther('1');
  }
}

export const SmartWalletProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { address } = useAccount();
  const { chain } = useNetwork();
  const publicClient = usePublicClient();
  const { data: walletClient } = useWalletClient();
  
  const [smartWalletAddress, setSmartWalletAddress] = useState<string | null>(null);
  const [isDeployed, setIsDeployed] = useState(false);
  const [accountAPI, setAccountAPI] = useState<SimpleAccountAPI | null>(null);

  useEffect(() => {
    if (address && walletClient && publicClient) {
      initializeSmartWallet();
    }
  }, [address, walletClient, publicClient]);

  const initializeSmartWallet = async () => {
    if (!address || !walletClient || !publicClient) return;

    const provider = new ethers.BrowserProvider(walletClient);
    const signer = await provider.getSigner();
    
    const factoryAddress = process.env.REACT_APP_FACTORY_ADDRESS!;
    const entryPointAddress = process.env.REACT_APP_ENTRY_POINT_ADDRESS!;
    const paymasterAddress = process.env.REACT_APP_PAYMASTER_ADDRESS!;
    const usdcAddress = process.env.REACT_APP_USDC_ADDRESS!;
    
    const api = new SimpleAccountAPI({
      provider,
      entryPointAddress,
      owner: signer,
      factoryAddress,
      paymasterAPI: new StablecoinPaymaster(paymasterAddress, usdcAddress, provider)
    });
    
    setAccountAPI(api);
    
    const walletAddress = await api.getAccountAddress();
    setSmartWalletAddress(walletAddress);
    
    const code = await provider.getCode(walletAddress);
    setIsDeployed(code !== '0x');
  };

  const deploySmartWallet = async () => {
    if (!accountAPI) throw new Error('Smart wallet not initialized');
    
    const op = await accountAPI.createSignedUserOp({
      target: ethers.ZeroAddress,
      data: '0x',
      value: 0n
    });
    
    const userOpHash = await sendUserOp(op);
    await waitForUserOp(userOpHash);
    
    setIsDeployed(true);
  };

  const sendUserOperation = async (
    target: string,
    data: string,
    value: bigint = 0n
  ): Promise<string> => {
    if (!accountAPI) throw new Error('Smart wallet not initialized');
    
    const op = await accountAPI.createSignedUserOp({
      target,
      data,
      value
    });
    
    return sendUserOp(op);
  };

  const sendUserOp = async (userOp: UserOperationStruct): Promise<string> => {
    const bundlerUrl = process.env.REACT_APP_BUNDLER_URL || 'http://localhost:3000';
    
    const response = await fetch(`${bundlerUrl}/rpc`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'eth_sendUserOperation',
        params: [userOp, process.env.REACT_APP_ENTRY_POINT_ADDRESS],
        id: 1
      })
    });
    
    const result = await response.json();
    if (result.error) throw new Error(result.error.message);
    
    return result.result;
  };

  const waitForUserOp = async (userOpHash: string): Promise<any> => {
    const bundlerUrl = process.env.REACT_APP_BUNDLER_URL || 'http://localhost:3000';
    
    while (true) {
      const response = await fetch(`${bundlerUrl}/rpc`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          method: 'eth_getUserOperationReceipt',
          params: [userOpHash],
          id: 1
        })
      });
      
      const result = await response.json();
      if (result.result) return result.result;
      
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  };

  const estimateGas = async (
    target: string,
    data: string,
    value: bigint = 0n
  ): Promise<bigint> => {
    if (!accountAPI) throw new Error('Smart wallet not initialized');
    
    const op = await accountAPI.createUnsignedUserOp({
      target,
      data,
      value
    });
    
    const bundlerUrl = process.env.REACT_APP_BUNDLER_URL || 'http://localhost:3000';
    
    const response = await fetch(`${bundlerUrl}/rpc`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'eth_estimateUserOperationGas',
        params: [op, process.env.REACT_APP_ENTRY_POINT_ADDRESS],
        id: 1
      })
    });
    
    const result = await response.json();
    if (result.error) throw new Error(result.error.message);
    
    return BigInt(result.result.callGasLimit) + 
           BigInt(result.result.verificationGasLimit) + 
           BigInt(result.result.preVerificationGas);
  };

  const getBalance = async (tokenAddress: string): Promise<bigint> => {
    if (!publicClient || !smartWalletAddress) return 0n;
    
    if (tokenAddress === ethers.ZeroAddress) {
      return publicClient.getBalance({ address: smartWalletAddress as `0x${string}` });
    }
    
    const balance = await publicClient.readContract({
      address: tokenAddress as `0x${string}`,
      abi: [
        {
          name: 'balanceOf',
          type: 'function',
          stateMutability: 'view',
          inputs: [{ name: 'account', type: 'address' }],
          outputs: [{ name: 'balance', type: 'uint256' }]
        }
      ],
      functionName: 'balanceOf',
      args: [smartWalletAddress]
    });
    
    return balance as bigint;
  };

  return (
    <SmartWalletContext.Provider
      value={{
        smartWalletAddress,
        isDeployed,
        deploySmartWallet,
        sendUserOperation,
        estimateGas,
        getBalance
      }}
    >
      {children}
    </SmartWalletContext.Provider>
  );
};