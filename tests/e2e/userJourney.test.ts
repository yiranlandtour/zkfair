import { ethers } from 'ethers';
import { expect } from 'chai';
import { SimpleAccountAPI } from '@account-abstraction/sdk';
import { deployContracts, setupTestEnvironment, fundAccount } from '../helpers';

describe('ZKFair L2 - Complete User Journey E2E Tests', () => {
  let provider: ethers.Provider;
  let owner: ethers.Wallet;
  let bundlerUrl: string;
  let contracts: any;
  let accountAPI: SimpleAccountAPI;
  
  before(async () => {
    ({ provider, owner, bundlerUrl, contracts } = await setupTestEnvironment());
  });
  
  describe('Wallet Creation and Deployment', () => {
    it('should create and deploy a smart wallet', async () => {
      // Create wallet API
      accountAPI = new SimpleAccountAPI({
        provider,
        entryPointAddress: contracts.entryPoint.address,
        owner,
        factoryAddress: contracts.factory.address,
      });
      
      // Get predicted address
      const walletAddress = await accountAPI.getAccountAddress();
      expect(ethers.isAddress(walletAddress)).to.be.true;
      
      // Check wallet not deployed yet
      const codeBefore = await provider.getCode(walletAddress);
      expect(codeBefore).to.equal('0x');
      
      // Deploy wallet
      const deployOp = await accountAPI.createSignedUserOp({
        target: ethers.ZeroAddress,
        data: '0x',
        value: 0n,
      });
      
      const response = await sendUserOperation(deployOp, bundlerUrl);
      const receipt = await waitForUserOpReceipt(response.userOpHash, bundlerUrl);
      
      expect(receipt.success).to.be.true;
      
      // Verify deployment
      const codeAfter = await provider.getCode(walletAddress);
      expect(codeAfter).to.not.equal('0x');
    });
  });
  
  describe('USDC Gas Payment Flow', () => {
    let usdcContract: any;
    let walletAddress: string;
    
    before(async () => {
      walletAddress = await accountAPI.getAccountAddress();
      usdcContract = await ethers.getContractAt('ERC20', contracts.usdc.address);
    });
    
    it('should setup USDC for gas payments', async () => {
      // Fund wallet with USDC
      const amount = ethers.parseUnits('100', 6); // 100 USDC
      await fundAccount(walletAddress, contracts.usdc.address, amount);
      
      const balance = await usdcContract.balanceOf(walletAddress);
      expect(balance).to.equal(amount);
      
      // Approve Paymaster
      const approveData = usdcContract.interface.encodeFunctionData('approve', [
        contracts.paymaster.address,
        ethers.MaxUint256,
      ]);
      
      const approveOp = await accountAPI.createSignedUserOp({
        target: contracts.usdc.address,
        data: approveData,
        value: 0n,
        paymasterAndData: ethers.concat([
          contracts.paymaster.address,
          contracts.usdc.address,
          ethers.toBeHex(ethers.parseEther('1'), 32), // 1:1 exchange rate for test
        ]),
      });
      
      const response = await sendUserOperation(approveOp, bundlerUrl);
      const receipt = await waitForUserOpReceipt(response.userOpHash, bundlerUrl);
      
      expect(receipt.success).to.be.true;
      
      // Verify approval
      const allowance = await usdcContract.allowance(walletAddress, contracts.paymaster.address);
      expect(allowance).to.equal(ethers.MaxUint256);
    });
    
    it('should execute transfer paying gas with USDC', async () => {
      const recipient = ethers.Wallet.createRandom().address;
      const transferAmount = ethers.parseEther('0.1');
      
      // Record balances before
      const usdcBefore = await usdcContract.balanceOf(walletAddress);
      const ethBefore = await provider.getBalance(recipient);
      
      // Create transfer operation
      const transferOp = await accountAPI.createSignedUserOp({
        target: recipient,
        data: '0x',
        value: transferAmount,
        paymasterAndData: ethers.concat([
          contracts.paymaster.address,
          contracts.usdc.address,
          ethers.toBeHex(ethers.parseEther('1'), 32),
        ]),
      });
      
      const response = await sendUserOperation(transferOp, bundlerUrl);
      const receipt = await waitForUserOpReceipt(response.userOpHash, bundlerUrl);
      
      expect(receipt.success).to.be.true;
      
      // Verify transfer
      const ethAfter = await provider.getBalance(recipient);
      expect(ethAfter - ethBefore).to.equal(transferAmount);
      
      // Verify USDC was used for gas
      const usdcAfter = await usdcContract.balanceOf(walletAddress);
      expect(usdcBefore - usdcAfter).to.be.gt(0);
      
      // Log gas cost in USDC
      const gasCostUSDC = ethers.formatUnits(usdcBefore - usdcAfter, 6);
      console.log(`Gas cost: ${gasCostUSDC} USDC`);
    });
  });
  
  describe('Batch Operations', () => {
    it('should execute multiple transfers in one transaction', async () => {
      const recipients = [
        ethers.Wallet.createRandom().address,
        ethers.Wallet.createRandom().address,
        ethers.Wallet.createRandom().address,
      ];
      const amount = ethers.parseEther('0.01');
      
      // Encode batch transfer
      const batchData = encodeBatchTransfer(recipients, amount);
      
      const batchOp = await accountAPI.createSignedUserOp({
        target: await accountAPI.getAccountAddress(),
        data: batchData,
        value: amount * 3n,
        paymasterAndData: getPaymasterData(contracts),
      });
      
      const response = await sendUserOperation(batchOp, bundlerUrl);
      const receipt = await waitForUserOpReceipt(response.userOpHash, bundlerUrl);
      
      expect(receipt.success).to.be.true;
      
      // Verify all transfers
      for (const recipient of recipients) {
        const balance = await provider.getBalance(recipient);
        expect(balance).to.equal(amount);
      }
    });
  });
  
  describe('Error Scenarios', () => {
    it('should fail when USDC balance insufficient', async () => {
      // Drain USDC balance
      const balance = await usdcContract.balanceOf(walletAddress);
      const drainData = usdcContract.interface.encodeFunctionData('transfer', [
        owner.address,
        balance,
      ]);
      
      await executeUserOp(accountAPI, contracts.usdc.address, drainData);
      
      // Try to execute operation without USDC
      const failOp = await accountAPI.createSignedUserOp({
        target: ethers.Wallet.createRandom().address,
        data: '0x',
        value: ethers.parseEther('0.01'),
        paymasterAndData: getPaymasterData(contracts),
      });
      
      await expect(sendUserOperation(failOp, bundlerUrl))
        .to.be.rejectedWith('Insufficient balance');
    });
    
    it('should respect daily limits', async () => {
      // Fund wallet with USDC
      await fundAccount(walletAddress, contracts.usdc.address, ethers.parseUnits('10000', 6));
      
      // Try to exceed daily limit
      const largeTransferOp = await accountAPI.createSignedUserOp({
        target: ethers.Wallet.createRandom().address,
        data: '0x',
        value: ethers.parseEther('100'), // Assuming this exceeds limit
        paymasterAndData: getPaymasterData(contracts),
      });
      
      await expect(sendUserOperation(largeTransferOp, bundlerUrl))
        .to.be.rejectedWith('daily limit exceeded');
    });
  });
  
  describe('Performance Tests', () => {
    it('should handle concurrent operations', async () => {
      const operations = [];
      const operationCount = 10;
      
      // Create multiple operations
      for (let i = 0; i < operationCount; i++) {
        const op = await accountAPI.createSignedUserOp({
          target: ethers.Wallet.createRandom().address,
          data: '0x',
          value: ethers.parseEther('0.001'),
          paymasterAndData: getPaymasterData(contracts),
        });
        operations.push(op);
      }
      
      // Send all operations concurrently
      const startTime = Date.now();
      const promises = operations.map(op => sendUserOperation(op, bundlerUrl));
      const responses = await Promise.all(promises);
      
      // Wait for all receipts
      const receipts = await Promise.all(
        responses.map(r => waitForUserOpReceipt(r.userOpHash, bundlerUrl))
      );
      
      const endTime = Date.now();
      const duration = (endTime - startTime) / 1000;
      
      // Verify all succeeded
      receipts.forEach(receipt => {
        expect(receipt.success).to.be.true;
      });
      
      console.log(`Processed ${operationCount} operations in ${duration}s`);
      expect(duration).to.be.lt(30); // Should complete within 30 seconds
    });
  });
});

// Helper functions
async function sendUserOperation(userOp: any, bundlerUrl: string) {
  const response = await fetch(`${bundlerUrl}/rpc`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      method: 'eth_sendUserOperation',
      params: [userOp, contracts.entryPoint.address],
      id: 1,
    }),
  });
  
  const result = await response.json();
  if (result.error) throw new Error(result.error.message);
  
  return result.result;
}

async function waitForUserOpReceipt(userOpHash: string, bundlerUrl: string) {
  let attempts = 0;
  const maxAttempts = 30;
  
  while (attempts < maxAttempts) {
    const response = await fetch(`${bundlerUrl}/rpc`, {
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
    if (result.result) return result.result;
    
    await new Promise(resolve => setTimeout(resolve, 1000));
    attempts++;
  }
  
  throw new Error('UserOperation receipt timeout');
}

function getPaymasterData(contracts: any) {
  return ethers.concat([
    contracts.paymaster.address,
    contracts.usdc.address,
    ethers.toBeHex(ethers.parseEther('1'), 32),
  ]);
}

function encodeBatchTransfer(recipients: string[], amount: bigint) {
  const iface = new ethers.Interface([
    'function executeBatch(address[] calldata dest, uint256[] calldata value, bytes[] calldata func)',
  ]);
  
  const values = recipients.map(() => amount);
  const funcs = recipients.map(() => '0x');
  
  return iface.encodeFunctionData('executeBatch', [recipients, values, funcs]);
}