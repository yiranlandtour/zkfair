import { ethers } from 'ethers';
import { UserOperationStruct } from '@account-abstraction/contracts';
import { EntryPoint__factory } from '@account-abstraction/contracts';
import express from 'express';
import { Redis } from 'ioredis';

interface BundlerConfig {
  entryPointAddress: string;
  beneficiary: string;
  rpcUrl: string;
  port: number;
  redisUrl: string;
  maxBundleSize: number;
  bundleInterval: number;
  privateKey: string;
}

export class Bundler {
  private provider: ethers.JsonRpcProvider;
  private wallet: ethers.Wallet;
  private entryPoint: ethers.Contract;
  private redis: Redis;
  private app: express.Application;
  private userOpPool: Map<string, UserOperationStruct> = new Map();
  private bundleTimer: NodeJS.Timer | null = null;

  constructor(private config: BundlerConfig) {
    this.provider = new ethers.JsonRpcProvider(config.rpcUrl);
    this.wallet = new ethers.Wallet(config.privateKey, this.provider);
    this.entryPoint = EntryPoint__factory.connect(config.entryPointAddress, this.wallet);
    this.redis = new Redis(config.redisUrl);
    this.app = express();
    this.setupRoutes();
  }

  async start() {
    await this.redis.connect();
    this.startBundleTimer();
    
    this.app.listen(this.config.port, () => {
      console.log(`Bundler listening on port ${this.config.port}`);
    });
  }

  private setupRoutes() {
    this.app.use(express.json());

    this.app.post('/rpc', async (req, res) => {
      const { method, params, id } = req.body;

      try {
        switch (method) {
          case 'eth_sendUserOperation':
            const result = await this.handleSendUserOperation(params[0], params[1]);
            res.json({ jsonrpc: '2.0', result, id });
            break;
          
          case 'eth_estimateUserOperationGas':
            const gasEstimate = await this.estimateUserOperationGas(params[0], params[1]);
            res.json({ jsonrpc: '2.0', result: gasEstimate, id });
            break;
          
          case 'eth_getUserOperationReceipt':
            const receipt = await this.getUserOperationReceipt(params[0]);
            res.json({ jsonrpc: '2.0', result: receipt, id });
            break;
          
          case 'eth_supportedEntryPoints':
            res.json({ jsonrpc: '2.0', result: [this.config.entryPointAddress], id });
            break;
          
          default:
            res.status(400).json({
              jsonrpc: '2.0',
              error: { code: -32601, message: 'Method not found' },
              id
            });
        }
      } catch (error: any) {
        res.status(500).json({
          jsonrpc: '2.0',
          error: { code: -32603, message: error.message },
          id
        });
      }
    });
  }

  private async handleSendUserOperation(
    userOp: UserOperationStruct,
    entryPointAddress: string
  ): Promise<string> {
    if (entryPointAddress.toLowerCase() !== this.config.entryPointAddress.toLowerCase()) {
      throw new Error('Invalid entry point');
    }

    const userOpHash = await this.getUserOpHash(userOp);
    
    await this.validateUserOperation(userOp);
    
    this.userOpPool.set(userOpHash, userOp);
    await this.redis.set(`userop:${userOpHash}`, JSON.stringify(userOp), 'EX', 3600);
    
    if (this.userOpPool.size >= this.config.maxBundleSize) {
      await this.bundleAndSubmit();
    }
    
    return userOpHash;
  }

  private async validateUserOperation(userOp: UserOperationStruct): Promise<void> {
    const result = await this.entryPoint.simulateValidation(userOp, {
      gasLimit: 10000000
    });
    
    if (result.returnInfo.validationData !== 0n) {
      throw new Error('User operation validation failed');
    }
  }

  private async getUserOpHash(userOp: UserOperationStruct): Promise<string> {
    const chainId = (await this.provider.getNetwork()).chainId;
    return ethers.keccak256(
      ethers.AbiCoder.defaultAbiCoder().encode(
        ['address', 'uint256', 'bytes32'],
        [
          this.config.entryPointAddress,
          chainId,
          ethers.keccak256(ethers.AbiCoder.defaultAbiCoder().encode(
            ['address', 'uint256', 'bytes', 'bytes', 'uint256', 'uint256', 'uint256', 'uint256', 'uint256', 'bytes', 'bytes'],
            [
              userOp.sender,
              userOp.nonce,
              userOp.initCode,
              userOp.callData,
              userOp.callGasLimit,
              userOp.verificationGasLimit,
              userOp.preVerificationGas,
              userOp.maxFeePerGas,
              userOp.maxPriorityFeePerGas,
              userOp.paymasterAndData,
              userOp.signature
            ]
          ))
        ]
      )
    );
  }

  private startBundleTimer() {
    this.bundleTimer = setInterval(async () => {
      if (this.userOpPool.size > 0) {
        await this.bundleAndSubmit();
      }
    }, this.config.bundleInterval);
  }

  private async bundleAndSubmit() {
    const userOps = Array.from(this.userOpPool.values());
    if (userOps.length === 0) return;
    
    this.userOpPool.clear();
    
    try {
      const tx = await this.entryPoint.handleOps(userOps, this.config.beneficiary, {
        maxFeePerGas: await this.getGasPrice(),
        maxPriorityFeePerGas: await this.getPriorityFee()
      });
      
      const receipt = await tx.wait();
      console.log(`Bundle submitted: ${receipt.hash}`);
      
      for (const userOp of userOps) {
        const hash = await this.getUserOpHash(userOp);
        await this.redis.set(
          `receipt:${hash}`,
          JSON.stringify({
            userOpHash: hash,
            entryPoint: this.config.entryPointAddress,
            sender: userOp.sender,
            nonce: userOp.nonce.toString(),
            actualGasCost: receipt.gasUsed.toString(),
            actualGasUsed: receipt.gasUsed.toString(),
            success: true,
            receipt: {
              transactionHash: receipt.hash,
              transactionIndex: receipt.index,
              blockHash: receipt.blockHash,
              blockNumber: receipt.blockNumber,
              cumulativeGasUsed: receipt.cumulativeGasUsed.toString(),
              gasUsed: receipt.gasUsed.toString(),
              logs: receipt.logs
            }
          }),
          'EX',
          86400
        );
      }
    } catch (error) {
      console.error('Failed to submit bundle:', error);
      userOps.forEach(userOp => this.userOpPool.set(userOp.sender, userOp));
    }
  }

  private async estimateUserOperationGas(
    userOp: UserOperationStruct,
    entryPointAddress: string
  ): Promise<any> {
    const estimation = await this.entryPoint.estimateGas.handleOps(
      [userOp],
      this.config.beneficiary
    );
    
    return {
      preVerificationGas: '0x' + (50000n).toString(16),
      verificationGasLimit: '0x' + (estimation * 3n / 2n).toString(16),
      callGasLimit: '0x' + (estimation).toString(16)
    };
  }

  private async getUserOperationReceipt(userOpHash: string): Promise<any> {
    const receipt = await this.redis.get(`receipt:${userOpHash}`);
    return receipt ? JSON.parse(receipt) : null;
  }

  private async getGasPrice(): Promise<bigint> {
    const feeData = await this.provider.getFeeData();
    return feeData.gasPrice || 1000000000n;
  }

  private async getPriorityFee(): Promise<bigint> {
    const feeData = await this.provider.getFeeData();
    return feeData.maxPriorityFeePerGas || 1000000000n;
  }

  async stop() {
    if (this.bundleTimer) {
      clearInterval(this.bundleTimer);
    }
    await this.redis.quit();
  }
}