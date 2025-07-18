import { ethers } from 'ethers';
import { SimpleAccountAPI, PaymasterAPI } from '@account-abstraction/sdk';
import { UserOperationStruct } from '@account-abstraction/contracts';
import EventEmitter from 'events';

export interface ZKFairConfig {
  rpcUrl: string;
  bundlerUrl: string;
  entryPointAddress: string;
  factoryAddress: string;
  paymasterAddress: string;
  apiUrl?: string;
}

export interface TransferOptions {
  to: string;
  amount: ethers.BigNumberish;
  token?: string; // Address for ERC20, undefined for native
  paymentToken?: 'USDC' | 'USDT' | 'NATIVE';
  maxGasPrice?: ethers.BigNumberish;
}

export interface BatchTransferOptions {
  transfers: Array<{
    to: string;
    amount: ethers.BigNumberish;
    token?: string;
  }>;
  paymentToken?: 'USDC' | 'USDT' | 'NATIVE';
}

export interface GasEstimate {
  estimatedGas: bigint;
  tokenAmount: bigint;
  tokenSymbol: string;
  usdValue: number;
  exchangeRate: bigint;
}

export class ZKFairSDK extends EventEmitter {
  private provider: ethers.Provider;
  private signer: ethers.Signer;
  private accountAPI: SimpleAccountAPI;
  private config: ZKFairConfig;
  private smartWalletAddress?: string;
  
  constructor(config: ZKFairConfig, signerOrProvider: ethers.Signer | ethers.Provider) {
    super();
    
    this.config = config;
    
    if ('getAddress' in signerOrProvider) {
      this.signer = signerOrProvider as ethers.Signer;
      this.provider = this.signer.provider!;
    } else {
      this.provider = signerOrProvider as ethers.Provider;
      throw new Error('Signer required for ZKFairSDK');
    }
    
    this.initializeAccountAPI();
  }
  
  private async initializeAccountAPI() {
    const paymasterAPI = new ZKFairPaymaster(
      this.config.paymasterAddress,
      this.provider
    );
    
    this.accountAPI = new SimpleAccountAPI({
      provider: this.provider,
      entryPointAddress: this.config.entryPointAddress,
      owner: this.signer,
      factoryAddress: this.config.factoryAddress,
      paymasterAPI,
    });
    
    this.smartWalletAddress = await this.accountAPI.getAccountAddress();
    this.emit('initialized', { address: this.smartWalletAddress });
  }
  
  // Core wallet functions
  async getAddress(): Promise<string> {
    if (!this.smartWalletAddress) {
      this.smartWalletAddress = await this.accountAPI.getAccountAddress();
    }
    return this.smartWalletAddress;
  }
  
  async isDeployed(): Promise<boolean> {
    const address = await this.getAddress();
    const code = await this.provider.getCode(address);
    return code !== '0x';
  }
  
  async deploy(): Promise<string> {
    if (await this.isDeployed()) {
      throw new Error('Smart wallet already deployed');
    }
    
    const deployOp = await this.accountAPI.createSignedUserOp({
      target: ethers.ZeroAddress,
      data: '0x',
      value: 0n,
    });
    
    return this.sendUserOperation(deployOp);
  }
  
  // Balance functions
  async getBalance(tokenAddress?: string): Promise<bigint> {
    const address = await this.getAddress();
    
    if (!tokenAddress || tokenAddress === ethers.ZeroAddress) {
      return this.provider.getBalance(address);
    }
    
    const token = new ethers.Contract(
      tokenAddress,
      ['function balanceOf(address) view returns (uint256)'],
      this.provider
    );
    
    return token.balanceOf(address);
  }
  
  async getBalances(tokens: string[]): Promise<Record<string, bigint>> {
    const balances: Record<string, bigint> = {};
    
    const promises = tokens.map(async (token) => {
      const balance = await this.getBalance(token);
      balances[token] = balance;
    });
    
    await Promise.all(promises);
    return balances;
  }
  
  // Transfer functions
  async transfer(options: TransferOptions): Promise<string> {
    const { to, amount, token, paymentToken = 'USDC' } = options;
    
    let target: string;
    let data: string;
    let value: bigint;
    
    if (!token || token === ethers.ZeroAddress) {
      // Native token transfer
      target = to;
      data = '0x';
      value = BigInt(amount.toString());
    } else {
      // ERC20 transfer
      const tokenContract = new ethers.Interface([
        'function transfer(address to, uint256 amount) returns (bool)'
      ]);
      
      target = token;
      data = tokenContract.encodeFunctionData('transfer', [to, amount]);
      value = 0n;
    }
    
    const userOp = await this.createUserOp({
      target,
      data,
      value,
      paymentToken,
    });
    
    this.emit('transfer:pending', { to, amount, token });
    
    const userOpHash = await this.sendUserOperation(userOp);
    
    this.emit('transfer:sent', { userOpHash, to, amount, token });
    
    return userOpHash;
  }
  
  async batchTransfer(options: BatchTransferOptions): Promise<string> {
    const { transfers, paymentToken = 'USDC' } = options;
    
    const calls = transfers.map(({ to, amount, token }) => {
      if (!token || token === ethers.ZeroAddress) {
        return { target: to, data: '0x', value: BigInt(amount.toString()) };
      } else {
        const tokenContract = new ethers.Interface([
          'function transfer(address to, uint256 amount) returns (bool)'
        ]);
        
        return {
          target: token,
          data: tokenContract.encodeFunctionData('transfer', [to, amount]),
          value: 0n,
        };
      }
    });
    
    const batchData = this.encodeBatchCall(calls);
    const totalValue = calls.reduce((sum, call) => sum + call.value, 0n);
    
    const userOp = await this.createUserOp({
      target: await this.getAddress(),
      data: batchData,
      value: totalValue,
      paymentToken,
    });
    
    return this.sendUserOperation(userOp);
  }
  
  // Gas estimation
  async estimateTransactionCost(
    to: string,
    value: ethers.BigNumberish,
    data: string = '0x',
    paymentToken: 'USDC' | 'USDT' | 'NATIVE' = 'USDC'
  ): Promise<GasEstimate> {
    const userOp = await this.accountAPI.createUnsignedUserOp({
      target: to,
      data,
      value: BigInt(value.toString()),
    });
    
    // Set paymaster data
    userOp.paymasterAndData = await this.getPaymasterData(paymentToken);
    
    // Estimate gas
    const estimation = await this.estimateUserOpGas(userOp);
    
    const totalGas = 
      BigInt(estimation.preVerificationGas) +
      BigInt(estimation.verificationGasLimit) +
      BigInt(estimation.callGasLimit);
    
    // Get token price
    const { tokenAmount, exchangeRate } = await this.calculateTokenAmount(
      totalGas,
      paymentToken
    );
    
    // Get USD value
    const usdValue = await this.getUSDValue(tokenAmount, paymentToken);
    
    return {
      estimatedGas: totalGas,
      tokenAmount,
      tokenSymbol: paymentToken,
      usdValue,
      exchangeRate,
    };
  }
  
  // Transaction history
  async getTransactionHistory(options?: {
    address?: string;
    startDate?: Date;
    endDate?: Date;
    limit?: number;
    offset?: number;
  }): Promise<any[]> {
    const address = options?.address || await this.getAddress();
    
    const params = new URLSearchParams({
      address,
      limit: (options?.limit || 50).toString(),
      offset: (options?.offset || 0).toString(),
    });
    
    if (options?.startDate) {
      params.append('startDate', options.startDate.toISOString());
    }
    
    if (options?.endDate) {
      params.append('endDate', options.endDate.toISOString());
    }
    
    const response = await fetch(
      `${this.config.apiUrl}/transactions?${params}`
    );
    
    if (!response.ok) {
      throw new Error('Failed to fetch transaction history');
    }
    
    return response.json();
  }
  
  // Utility functions
  async waitForTransaction(userOpHash: string, timeout = 60000): Promise<any> {
    const startTime = Date.now();
    
    while (Date.now() - startTime < timeout) {
      const receipt = await this.getUserOpReceipt(userOpHash);
      
      if (receipt) {
        this.emit('transaction:confirmed', { userOpHash, receipt });
        return receipt;
      }
      
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    throw new Error('Transaction timeout');
  }
  
  // Advanced features
  async setupRecovery(guardians: string[]): Promise<string> {
    // Implementation for social recovery setup
    throw new Error('Not implemented');
  }
  
  async approveToken(
    tokenAddress: string,
    spender: string,
    amount: ethers.BigNumberish = ethers.MaxUint256
  ): Promise<string> {
    const tokenContract = new ethers.Interface([
      'function approve(address spender, uint256 amount) returns (bool)'
    ]);
    
    const data = tokenContract.encodeFunctionData('approve', [spender, amount]);
    
    const userOp = await this.createUserOp({
      target: tokenAddress,
      data,
      value: 0n,
      paymentToken: 'USDC',
    });
    
    return this.sendUserOperation(userOp);
  }
  
  // Private helper methods
  private async createUserOp(params: {
    target: string;
    data: string;
    value: bigint;
    paymentToken: 'USDC' | 'USDT' | 'NATIVE';
  }): Promise<UserOperationStruct> {
    const userOp = await this.accountAPI.createSignedUserOp({
      target: params.target,
      data: params.data,
      value: params.value,
    });
    
    if (params.paymentToken !== 'NATIVE') {
      userOp.paymasterAndData = await this.getPaymasterData(params.paymentToken);
    }
    
    return userOp;
  }
  
  private async getPaymasterData(
    paymentToken: 'USDC' | 'USDT' | 'NATIVE'
  ): Promise<string> {
    if (paymentToken === 'NATIVE') return '0x';
    
    const tokenAddresses = {
      USDC: process.env.REACT_APP_USDC_ADDRESS!,
      USDT: process.env.REACT_APP_USDT_ADDRESS!,
    };
    
    const exchangeRate = await this.getExchangeRate(paymentToken);
    
    return ethers.concat([
      this.config.paymasterAddress,
      tokenAddresses[paymentToken],
      ethers.toBeHex(exchangeRate, 32),
    ]);
  }
  
  private async sendUserOperation(userOp: UserOperationStruct): Promise<string> {
    const response = await fetch(`${this.config.bundlerUrl}/rpc`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'eth_sendUserOperation',
        params: [userOp, this.config.entryPointAddress],
        id: 1,
      }),
    });
    
    const result = await response.json();
    
    if (result.error) {
      throw new Error(result.error.message);
    }
    
    return result.result;
  }
  
  private async estimateUserOpGas(userOp: UserOperationStruct): Promise<any> {
    const response = await fetch(`${this.config.bundlerUrl}/rpc`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'eth_estimateUserOperationGas',
        params: [userOp, this.config.entryPointAddress],
        id: 1,
      }),
    });
    
    const result = await response.json();
    
    if (result.error) {
      throw new Error(result.error.message);
    }
    
    return result.result;
  }
  
  private async getUserOpReceipt(userOpHash: string): Promise<any> {
    const response = await fetch(`${this.config.bundlerUrl}/rpc`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'eth_getUserOperationReceipt',
        params: [userOpHash],
        id: 1,
      }),
    });
    
    const result = await response.json();
    return result.result;
  }
  
  private encodeBatchCall(calls: Array<{ target: string; data: string; value: bigint }>) {
    const iface = new ethers.Interface([
      'function executeBatch(address[] calldata dest, uint256[] calldata value, bytes[] calldata func)',
    ]);
    
    const targets = calls.map(c => c.target);
    const values = calls.map(c => c.value);
    const datas = calls.map(c => c.data);
    
    return iface.encodeFunctionData('executeBatch', [targets, values, datas]);
  }
  
  private async getExchangeRate(token: string): Promise<bigint> {
    // In production, fetch from oracle
    return ethers.parseEther('1');
  }
  
  private async calculateTokenAmount(
    gasAmount: bigint,
    token: string
  ): Promise<{ tokenAmount: bigint; exchangeRate: bigint }> {
    const exchangeRate = await this.getExchangeRate(token);
    const tokenAmount = (gasAmount * exchangeRate) / ethers.parseEther('1');
    
    return { tokenAmount, exchangeRate };
  }
  
  private async getUSDValue(amount: bigint, token: string): Promise<number> {
    // In production, fetch from price feed
    const prices: Record<string, number> = {
      USDC: 1.0,
      USDT: 1.0,
      NATIVE: 2000, // Example ETH price
    };
    
    const decimals = token === 'NATIVE' ? 18 : 6;
    const value = Number(ethers.formatUnits(amount, decimals));
    
    return value * (prices[token] || 0);
  }
}

// Custom Paymaster implementation
class ZKFairPaymaster implements PaymasterAPI {
  constructor(
    private paymasterAddress: string,
    private provider: ethers.Provider
  ) {}
  
  async getPaymasterAndData(
    userOp: Partial<UserOperationStruct>
  ): Promise<string> {
    // This would be set by the SDK based on user preferences
    return '0x';
  }
}