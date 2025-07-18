import { ethers } from 'ethers';
import { PrismaClient } from '@prisma/client';
import { EntryPoint__factory } from '@account-abstraction/contracts';

export class EventListener {
  private entryPoint: ethers.Contract;
  private lastProcessedBlock: number = 0;
  
  constructor(
    private provider: ethers.Provider,
    private prisma: PrismaClient
  ) {
    const entryPointAddress = process.env.ENTRY_POINT_ADDRESS!;
    this.entryPoint = EntryPoint__factory.connect(entryPointAddress, provider);
  }

  async start() {
    const currentBlock = await this.provider.getBlockNumber();
    this.lastProcessedBlock = currentBlock - 1000;
    
    this.entryPoint.on('UserOperationEvent', async (
      userOpHash: string,
      sender: string,
      paymaster: string,
      nonce: bigint,
      success: boolean,
      actualGasCost: bigint,
      actualGasUsed: bigint,
      event: ethers.EventLog
    ) => {
      await this.handleUserOperationEvent({
        userOpHash,
        sender,
        paymaster,
        nonce,
        success,
        actualGasCost,
        actualGasUsed,
        transactionHash: event.transactionHash,
        blockNumber: event.blockNumber,
        timestamp: (await event.getBlock()).timestamp
      });
    });
    
    setInterval(() => this.processBlocks(), 5000);
  }

  private async handleUserOperationEvent(data: any) {
    try {
      await this.prisma.userOperation.create({
        data: {
          userOpHash: data.userOpHash,
          sender: data.sender,
          paymaster: data.paymaster || ethers.ZeroAddress,
          nonce: data.nonce.toString(),
          success: data.success,
          actualGasCost: data.actualGasCost.toString(),
          actualGasUsed: data.actualGasUsed.toString(),
          transactionHash: data.transactionHash,
          blockNumber: data.blockNumber,
          timestamp: new Date(data.timestamp * 1000)
        }
      });
      
      console.log(`Processed UserOperation: ${data.userOpHash}`);
    } catch (error) {
      console.error('Failed to process UserOperation event:', error);
    }
  }

  private async processBlocks() {
    try {
      const currentBlock = await this.provider.getBlockNumber();
      
      if (currentBlock > this.lastProcessedBlock) {
        const events = await this.entryPoint.queryFilter(
          'UserOperationEvent',
          this.lastProcessedBlock + 1,
          currentBlock
        );
        
        for (const event of events) {
          await this.handleUserOperationEvent({
            userOpHash: event.args[0],
            sender: event.args[1],
            paymaster: event.args[2],
            nonce: event.args[3],
            success: event.args[4],
            actualGasCost: event.args[5],
            actualGasUsed: event.args[6],
            transactionHash: event.transactionHash,
            blockNumber: event.blockNumber,
            timestamp: (await event.getBlock()).timestamp
          });
        }
        
        this.lastProcessedBlock = currentBlock;
      }
    } catch (error) {
      console.error('Failed to process blocks:', error);
    }
  }
}