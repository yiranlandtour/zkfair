const express = require('express');
const { ethers } = require('ethers');
const { register, Gauge, Counter, Histogram } = require('prom-client');

// Configuration
const PORT = process.env.PORT || 9200;
const RPC_URL = process.env.RPC_URL || 'http://polygon-cdk-rpc:8545';
const POLL_INTERVAL = parseInt(process.env.POLL_INTERVAL) || 30000; // 30 seconds

// Contract addresses
const CONTRACTS = {
  entryPoint: process.env.ENTRY_POINT || '0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789',
  paymaster: process.env.PAYMASTER || '0x0000000000000000000000000000000000000000',
  factory: process.env.FACTORY || '0x0000000000000000000000000000000000000000',
};

// Initialize provider
const provider = new ethers.JsonRpcProvider(RPC_URL);

// Metrics
const metrics = {
  // EntryPoint metrics
  userOperationsTotal: new Counter({
    name: 'contract_entrypoint_userops_total',
    help: 'Total number of UserOperations processed',
    labelNames: ['status'],
  }),
  depositedBalance: new Gauge({
    name: 'contract_entrypoint_deposited_balance',
    help: 'Total deposited balance in EntryPoint',
    labelNames: ['address'],
  }),
  
  // Paymaster metrics
  paymasterBalance: new Gauge({
    name: 'contract_paymaster_balance_eth',
    help: 'Paymaster ETH balance',
  }),
  paymasterStake: new Gauge({
    name: 'contract_paymaster_stake_eth',
    help: 'Paymaster stake in EntryPoint',
  }),
  sponsoredGasTotal: new Counter({
    name: 'contract_paymaster_sponsored_gas_total',
    help: 'Total gas sponsored by paymaster',
    labelNames: ['token'],
  }),
  tokenPriceUSD: new Gauge({
    name: 'contract_paymaster_token_price_usd',
    help: 'Token price in USD from oracle',
    labelNames: ['token'],
  }),
  dailyLimitUsed: new Gauge({
    name: 'contract_paymaster_daily_limit_used',
    help: 'Daily limit used per user',
    labelNames: ['user'],
  }),
  
  // Smart Wallet metrics
  walletsCreated: new Counter({
    name: 'contract_wallets_created_total',
    help: 'Total smart wallets created',
  }),
  walletBalance: new Gauge({
    name: 'contract_wallet_balance_eth',
    help: 'Smart wallet ETH balance',
    labelNames: ['wallet'],
  }),
  
  // General contract metrics
  contractCallDuration: new Histogram({
    name: 'contract_call_duration_seconds',
    help: 'Duration of contract calls',
    labelNames: ['contract', 'method'],
    buckets: [0.1, 0.5, 1, 2, 5, 10],
  }),
  contractCallErrors: new Counter({
    name: 'contract_call_errors_total',
    help: 'Total contract call errors',
    labelNames: ['contract', 'method', 'error'],
  }),
};

// Contract ABIs (simplified)
const ENTRY_POINT_ABI = [
  'function depositInfo(address account) view returns (uint112 deposit, bool staked, uint112 stake, uint32 unstakeDelaySec, uint48 withdrawTime)',
  'function getDepositInfo(address account) view returns (tuple(uint112 deposit, bool staked, uint112 stake, uint32 unstakeDelaySec, uint48 withdrawTime) info)',
  'event UserOperationEvent(bytes32 indexed userOpHash, address indexed sender, address indexed paymaster, uint256 nonce, bool success, uint256 actualGasCost, uint256 actualGasUsed)',
];

const PAYMASTER_ABI = [
  'function getDeposit() view returns (uint256)',
  'function tokenOracles(address token) view returns (address oracle, uint256 priceMarkup)',
  'function userLimits(address user) view returns (uint256 dailyLimit, uint256 usedToday, uint256 lastReset)',
  'event GasSponsored(address indexed user, address indexed token, uint256 tokenAmount, uint256 ethCost)',
];

const FACTORY_ABI = [
  'event WalletCreated(address indexed wallet, address indexed owner, uint256 salt)',
];

// Initialize contracts
let entryPoint, paymaster, factory;

async function initializeContracts() {
  try {
    if (CONTRACTS.entryPoint !== '0x0000000000000000000000000000000000000000') {
      entryPoint = new ethers.Contract(CONTRACTS.entryPoint, ENTRY_POINT_ABI, provider);
      console.log('EntryPoint contract initialized');
    }
    
    if (CONTRACTS.paymaster !== '0x0000000000000000000000000000000000000000') {
      paymaster = new ethers.Contract(CONTRACTS.paymaster, PAYMASTER_ABI, provider);
      console.log('Paymaster contract initialized');
    }
    
    if (CONTRACTS.factory !== '0x0000000000000000000000000000000000000000') {
      factory = new ethers.Contract(CONTRACTS.factory, FACTORY_ABI, provider);
      console.log('Factory contract initialized');
    }
  } catch (error) {
    console.error('Error initializing contracts:', error);
  }
}

// Collect metrics
async function collectMetrics() {
  const startTime = Date.now();
  
  try {
    // Collect EntryPoint metrics
    if (entryPoint) {
      try {
        // Get paymaster deposit info
        if (CONTRACTS.paymaster !== '0x0000000000000000000000000000000000000000') {
          const depositInfo = await entryPoint.getDepositInfo(CONTRACTS.paymaster);
          metrics.paymasterStake.set(parseFloat(ethers.formatEther(depositInfo.stake)));
        }
      } catch (error) {
        metrics.contractCallErrors.inc({ contract: 'entrypoint', method: 'getDepositInfo', error: error.code || 'unknown' });
      }
    }
    
    // Collect Paymaster metrics
    if (paymaster) {
      try {
        const balance = await provider.getBalance(CONTRACTS.paymaster);
        metrics.paymasterBalance.set(parseFloat(ethers.formatEther(balance)));
      } catch (error) {
        metrics.contractCallErrors.inc({ contract: 'paymaster', method: 'getBalance', error: error.code || 'unknown' });
      }
    }
    
    // Collect chain metrics
    try {
      const blockNumber = await provider.getBlockNumber();
      const block = await provider.getBlock(blockNumber);
      
      // You can add more chain-specific metrics here
    } catch (error) {
      console.error('Error collecting chain metrics:', error);
    }
    
  } catch (error) {
    console.error('Error collecting metrics:', error);
  }
  
  const duration = (Date.now() - startTime) / 1000;
  metrics.contractCallDuration.observe({ contract: 'exporter', method: 'collectMetrics' }, duration);
}

// Set up event listeners
async function setupEventListeners() {
  if (entryPoint) {
    entryPoint.on('UserOperationEvent', (userOpHash, sender, paymasterAddr, nonce, success, actualGasCost, actualGasUsed) => {
      metrics.userOperationsTotal.inc({ status: success ? 'success' : 'failed' });
    });
  }
  
  if (paymaster) {
    paymaster.on('GasSponsored', (user, token, tokenAmount, ethCost) => {
      metrics.sponsoredGasTotal.inc({ token: token.toLowerCase() }, parseFloat(ethers.formatEther(ethCost)));
    });
  }
  
  if (factory) {
    factory.on('WalletCreated', (wallet, owner, salt) => {
      metrics.walletsCreated.inc();
    });
  }
}

// Express app
const app = express();

app.get('/metrics', async (req, res) => {
  try {
    res.set('Content-Type', register.contentType);
    res.end(await register.metrics());
  } catch (error) {
    res.status(500).end(error);
  }
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok', uptime: process.uptime() });
});

// Start server
async function start() {
  await initializeContracts();
  await setupEventListeners();
  
  // Start collecting metrics
  setInterval(collectMetrics, POLL_INTERVAL);
  await collectMetrics(); // Initial collection
  
  app.listen(PORT, () => {
    console.log(`Contract exporter listening on port ${PORT}`);
  });
}

start().catch(console.error);