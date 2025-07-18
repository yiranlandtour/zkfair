# ZKFair L2 - 开发者速查手册

> ⚡ 本手册为开发者提供快速参考，包含常用代码片段、API 参考和最佳实践

## 目录

1. [环境设置](#1-环境设置)
2. [智能合约开发](#2-智能合约开发)
3. [前端集成](#3-前端集成)
4. [SDK 使用](#4-sdk-使用)
5. [API 参考](#5-api-参考)
6. [测试指南](#6-测试指南)
7. [常见模式](#7-常见模式)
8. [故障排查](#8-故障排查)

---

## 1. 环境设置

### 快速开始

```bash
# 克隆并启动
git clone https://github.com/zkfair/zkfair-l2
cd zkfair-l2
./scripts/quick-start.sh

# 环境变量
cp .env.example .env
# 编辑 .env 文件
```

### 必需的环境变量

```env
# L2 配置
L2_RPC_URL=http://localhost:8545
L2_CHAIN_ID=67890

# 合约地址（部署后自动生成）
ENTRY_POINT_ADDRESS=0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789
PAYMASTER_ADDRESS=0x...
FACTORY_ADDRESS=0x...
USDC_ADDRESS=0x...

# API 配置
BUNDLER_URL=http://localhost:3000
API_URL=http://localhost:4000
```

### 开发工具

```bash
# 安装 Foundry（智能合约开发）
curl -L https://foundry.paradigm.xyz | bash
foundryup

# 安装项目依赖
npm install
cd contracts && forge install
```

---

## 2. 智能合约开发

### 创建兼容 ZKFair 的合约

```solidity
// contracts/MyDApp.sol
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract MyDApp is Ownable {
    IERC20 public paymentToken;
    uint256 public serviceFee = 10 * 10**6; // 10 USDC
    
    event ServicePurchased(address indexed user, uint256 amount);
    
    constructor(address _paymentToken) Ownable(msg.sender) {
        paymentToken = IERC20(_paymentToken);
    }
    
    function purchaseService() external {
        // 自动兼容智能钱包
        address user = msg.sender;
        
        // 收取费用
        paymentToken.transferFrom(user, address(this), serviceFee);
        
        // 提供服务
        _provideService(user);
        
        emit ServicePurchased(user, serviceFee);
    }
    
    function _provideService(address user) private {
        // 你的业务逻辑
    }
}
```

### 部署合约

```bash
# 编译
forge build

# 部署到本地
forge create MyDApp \
  --constructor-args $USDC_ADDRESS \
  --rpc-url http://localhost:8545 \
  --private-key $PRIVATE_KEY

# 部署脚本
forge script script/Deploy.s.sol --broadcast
```

### 与 Paymaster 集成

```solidity
// 让你的合约支持 Paymaster 元交易
contract PaymasterFriendly {
    // 使用 msg.sender 而不是 tx.origin
    function doSomething() external {
        address user = msg.sender; // 智能钱包地址
        // 业务逻辑
    }
    
    // 支持批量操作
    function batchOperation(
        address[] calldata targets,
        bytes[] calldata data
    ) external {
        for (uint i = 0; i < targets.length; i++) {
            (bool success,) = targets[i].call(data[i]);
            require(success, "Batch operation failed");
        }
    }
}
```

---

## 3. 前端集成

### React 组件示例

```typescript
// components/TransferWithUSDC.tsx
import { useSmartWallet } from '@/hooks/useSmartWallet';
import { ethers } from 'ethers';

export function TransferWithUSDC() {
  const { smartWallet, isReady } = useSmartWallet();
  const [recipient, setRecipient] = useState('');
  const [amount, setAmount] = useState('');
  const [loading, setLoading] = useState(false);
  
  const handleTransfer = async () => {
    if (!smartWallet || !isReady) return;
    
    setLoading(true);
    try {
      // 创建交易，使用 USDC 支付 Gas！
      const tx = await smartWallet.transfer({
        to: recipient,
        amount: ethers.parseUnits(amount, 6), // USDC 6 位小数
        token: 'USDC',
        paymentToken: 'USDC' // 关键：用 USDC 支付 Gas
      });
      
      // 等待确认
      await tx.wait();
      alert('转账成功！');
    } catch (error) {
      console.error('转账失败:', error);
      alert('转账失败');
    } finally {
      setLoading(false);
    }
  };
  
  return (
    <div className="p-4 border rounded">
      <h3>使用 USDC 转账（Gas 也用 USDC 支付）</h3>
      
      <input
        type="text"
        placeholder="接收地址"
        value={recipient}
        onChange={(e) => setRecipient(e.target.value)}
        className="w-full p-2 border rounded"
      />
      
      <input
        type="number"
        placeholder="金额 (USDC)"
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        className="w-full p-2 border rounded mt-2"
      />
      
      <button
        onClick={handleTransfer}
        disabled={loading || !isReady}
        className="w-full p-2 bg-blue-500 text-white rounded mt-2"
      >
        {loading ? '处理中...' : '发送'}
      </button>
      
      <p className="text-sm text-gray-600 mt-2">
        * Gas 费将从你的 USDC 余额中扣除
      </p>
    </div>
  );
}
```

### 钱包连接 Hook

```typescript
// hooks/useSmartWallet.ts
import { useEffect, useState } from 'react';
import { ZKFairSDK } from '@zkfair/sdk';
import { useAccount, useSigner } from 'wagmi';

export function useSmartWallet() {
  const { address } = useAccount();
  const { data: signer } = useSigner();
  const [sdk, setSdk] = useState<ZKFairSDK | null>(null);
  const [smartWalletAddress, setSmartWalletAddress] = useState<string>('');
  const [isDeployed, setIsDeployed] = useState(false);
  
  useEffect(() => {
    if (signer) {
      const zkfairSDK = new ZKFairSDK({
        rpcUrl: process.env.NEXT_PUBLIC_L2_RPC_URL!,
        bundlerUrl: process.env.NEXT_PUBLIC_BUNDLER_URL!,
        entryPointAddress: process.env.NEXT_PUBLIC_ENTRY_POINT!,
        factoryAddress: process.env.NEXT_PUBLIC_FACTORY!,
        paymasterAddress: process.env.NEXT_PUBLIC_PAYMASTER!,
      }, signer);
      
      setSdk(zkfairSDK);
      
      // 获取智能钱包地址
      zkfairSDK.getAddress().then(setSmartWalletAddress);
      zkfairSDK.isDeployed().then(setIsDeployed);
    }
  }, [signer]);
  
  return {
    sdk,
    smartWalletAddress,
    isDeployed,
    isReady: !!sdk && !!smartWalletAddress,
  };
}
```

---

## 4. SDK 使用

### 基础操作

```typescript
import { ZKFairSDK } from '@zkfair/sdk';

// 初始化 SDK
const sdk = new ZKFairSDK(config, signer);

// 获取地址
const address = await sdk.getAddress();

// 检查部署状态
const isDeployed = await sdk.isDeployed();
if (!isDeployed) {
  await sdk.deploy();
}

// 查询余额
const usdcBalance = await sdk.getBalance(USDC_ADDRESS);
const ethBalance = await sdk.getBalance(); // 原生代币
```

### 转账操作

```typescript
// 简单转账（使用 USDC 支付 Gas）
const txHash = await sdk.transfer({
  to: '0x...',
  amount: ethers.parseUnits('100', 6),
  token: USDC_ADDRESS,
  paymentToken: 'USDC'
});

// 批量转账
const txHash = await sdk.batchTransfer({
  transfers: [
    { to: '0x1...', amount: '100', token: USDC_ADDRESS },
    { to: '0x2...', amount: '200', token: USDC_ADDRESS },
    { to: '0x3...', amount: '300', token: USDC_ADDRESS }
  ],
  paymentToken: 'USDC'
});

// 等待确认
const receipt = await sdk.waitForTransaction(txHash);
```

### 高级功能

```typescript
// Gas 估算
const estimate = await sdk.estimateTransactionCost(
  '0x...', // to
  '0',     // value
  '0x',    // data
  'USDC'   // payment token
);
console.log(`预计费用: ${estimate.tokenAmount} ${estimate.tokenSymbol}`);

// 交易历史
const history = await sdk.getTransactionHistory({
  limit: 10,
  offset: 0
});

// 批准代币
await sdk.approveToken(
  USDC_ADDRESS,
  PAYMASTER_ADDRESS,
  ethers.MaxUint256
);
```

---

## 5. API 参考

### RESTful API

#### 获取交易历史
```http
GET /api/transactions/:address
Query: ?page=1&limit=50

Response:
{
  "transactions": [...],
  "pagination": {
    "page": 1,
    "limit": 50,
    "total": 100
  }
}
```

#### 获取 Gas 统计
```http
GET /api/stats/gas
Query: ?period=24h

Response:
{
  "period": "24h",
  "totalOperations": 1000,
  "totalGasSponsored": "100000000",
  "averageGasCost": "100000"
}
```

### Bundler RPC

#### 发送 UserOperation
```javascript
const response = await fetch(`${BUNDLER_URL}/rpc`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    jsonrpc: '2.0',
    method: 'eth_sendUserOperation',
    params: [userOp, entryPointAddress],
    id: 1
  })
});
```

#### 估算 Gas
```javascript
const response = await fetch(`${BUNDLER_URL}/rpc`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    jsonrpc: '2.0',
    method: 'eth_estimateUserOperationGas',
    params: [userOp, entryPointAddress],
    id: 1
  })
});
```

---

## 6. 测试指南

### 单元测试（智能合约）

```solidity
// test/MyDApp.t.sol
pragma solidity ^0.8.19;

import "forge-std/Test.sol";
import "../src/MyDApp.sol";

contract MyDAppTest is Test {
    MyDApp public dapp;
    address public user = address(0x1);
    
    function setUp() public {
        dapp = new MyDApp(USDC_ADDRESS);
        
        // 给用户一些 USDC
        deal(USDC_ADDRESS, user, 1000 * 10**6);
        
        // 用户批准合约
        vm.prank(user);
        IERC20(USDC_ADDRESS).approve(address(dapp), type(uint256).max);
    }
    
    function testPurchaseService() public {
        vm.prank(user);
        dapp.purchaseService();
        
        assertEq(
            IERC20(USDC_ADDRESS).balanceOf(address(dapp)),
            10 * 10**6
        );
    }
}
```

运行测试：
```bash
forge test -vvv
```

### 集成测试（TypeScript）

```typescript
// tests/integration/transfer.test.ts
import { expect } from 'chai';
import { setupTest } from '../helpers';

describe('USDC Gas Payment', () => {
  let sdk: ZKFairSDK;
  let testAddress: string;
  
  before(async () => {
    ({ sdk, testAddress } = await setupTest());
  });
  
  it('should transfer USDC paying gas with USDC', async () => {
    // 获取初始余额
    const initialBalance = await sdk.getBalance(USDC_ADDRESS);
    
    // 执行转账
    const txHash = await sdk.transfer({
      to: testAddress,
      amount: ethers.parseUnits('10', 6),
      token: USDC_ADDRESS,
      paymentToken: 'USDC'
    });
    
    // 等待确认
    await sdk.waitForTransaction(txHash);
    
    // 检查余额变化
    const finalBalance = await sdk.getBalance(USDC_ADDRESS);
    expect(initialBalance - finalBalance).to.be.gt(
      ethers.parseUnits('10', 6)
    ); // 包含 Gas 费
  });
});
```

---

## 7. 常见模式

### 模式 1：DeFi 集成

```solidity
contract DeFiIntegration {
    IUniswapV2Router public router;
    IERC20 public usdc;
    
    // 支持智能钱包的 Swap
    function swapWithSmartWallet(
        uint256 amountIn,
        uint256 amountOutMin,
        address[] calldata path
    ) external {
        // 从智能钱包转入代币
        IERC20(path[0]).transferFrom(msg.sender, address(this), amountIn);
        
        // 批准 Router
        IERC20(path[0]).approve(address(router), amountIn);
        
        // 执行 Swap
        router.swapExactTokensForTokens(
            amountIn,
            amountOutMin,
            path,
            msg.sender, // 输出直接给用户
            block.timestamp + 300
        );
    }
}
```

### 模式 2：NFT 市场

```solidity
contract NFTMarketplace {
    using SafeERC20 for IERC20;
    
    struct Listing {
        address seller;
        uint256 price;
        IERC20 paymentToken;
    }
    
    mapping(address => mapping(uint256 => Listing)) public listings;
    
    // 购买 NFT（支持稳定币支付）
    function buyNFT(
        address nftContract,
        uint256 tokenId
    ) external {
        Listing memory listing = listings[nftContract][tokenId];
        require(listing.seller != address(0), "Not listed");
        
        // 支付
        listing.paymentToken.safeTransferFrom(
            msg.sender,
            listing.seller,
            listing.price
        );
        
        // 转移 NFT
        IERC721(nftContract).safeTransferFrom(
            listing.seller,
            msg.sender,
            tokenId
        );
        
        delete listings[nftContract][tokenId];
    }
}
```

### 模式 3：订阅服务

```solidity
contract SubscriptionService {
    struct Subscription {
        uint256 expiry;
        uint256 tier;
    }
    
    mapping(address => Subscription) public subscriptions;
    uint256[] public tierPrices = [10e6, 25e6, 50e6]; // USDC
    
    function subscribe(uint256 tier, uint256 duration) external {
        require(tier < tierPrices.length, "Invalid tier");
        
        uint256 cost = tierPrices[tier] * duration;
        usdc.transferFrom(msg.sender, address(this), cost);
        
        subscriptions[msg.sender] = Subscription({
            expiry: block.timestamp + (duration * 30 days),
            tier: tier
        });
    }
}
```

---

## 8. 故障排查

### 常见错误

#### 1. "User operation reverted"
```javascript
// 检查：
// 1. 用户 USDC 余额
const balance = await sdk.getBalance(USDC_ADDRESS);

// 2. Paymaster 批准
const allowance = await usdcContract.allowance(
  smartWalletAddress,
  PAYMASTER_ADDRESS
);

// 3. 每日限额
const limits = await paymaster.getUserLimits(smartWalletAddress);
```

#### 2. "Insufficient balance for gas"
```javascript
// 解决方案：
// 1. 确保 Paymaster 有足够的 ETH
// 2. 检查用户 USDC 余额
// 3. 验证汇率设置
```

#### 3. "Smart wallet not deployed"
```javascript
// 部署智能钱包
if (!await sdk.isDeployed()) {
  console.log('部署智能钱包...');
  await sdk.deploy();
}
```

### 调试技巧

```javascript
// 1. 启用详细日志
const sdk = new ZKFairSDK(config, signer);
sdk.on('*', (event, data) => {
  console.log(`[SDK] ${event}:`, data);
});

// 2. 模拟交易
const simulation = await bundler.simulateUserOperation(userOp);
console.log('模拟结果:', simulation);

// 3. 检查 Paymaster 状态
const paymasterBalance = await provider.getBalance(PAYMASTER_ADDRESS);
const limits = await paymaster.getGlobalLimits();
```

### 性能优化

```javascript
// 1. 批量操作
const batch = await sdk.batchTransfer({
  transfers: Array(10).fill({
    to: address,
    amount: '1',
    token: USDC_ADDRESS
  }),
  paymentToken: 'USDC'
});

// 2. 缓存常用数据
const cache = new Map();
async function getCachedBalance(token) {
  const key = `balance:${token}`;
  if (!cache.has(key)) {
    cache.set(key, await sdk.getBalance(token));
  }
  return cache.get(key);
}

// 3. 并行请求
const [balance, history, estimate] = await Promise.all([
  sdk.getBalance(USDC_ADDRESS),
  sdk.getTransactionHistory(),
  sdk.estimateTransactionCost(...)
]);
```

---

## 🚀 快速链接

- [完整 API 文档](https://docs.zkfair.io/api)
- [Solidity 示例](../contracts/examples/)
- [前端示例](../frontend/src/examples/)
- [SDK 源码](../sdk/src/)

## 💬 需要帮助？

- Discord: https://discord.gg/zkfair
- GitHub Issues: https://github.com/zkfair/zkfair-l2/issues
- Stack Overflow: [#zkfair](https://stackoverflow.com/questions/tagged/zkfair)

---

💡 **提示**：保持这个手册在手边，它包含了 90% 你需要的代码片段！