# ZKFair L2 故障排查指南 🔧

> 遇到问题？别慌！这份指南涵盖了 99% 的常见问题和解决方案

## 目录

1. [快速诊断](#1-快速诊断)
2. [环境问题](#2-环境问题)
3. [智能合约问题](#3-智能合约问题)
4. [前端问题](#4-前端问题)
5. [交易问题](#5-交易问题)
6. [性能问题](#6-性能问题)
7. [部署问题](#7-部署问题)
8. [紧急情况处理](#8-紧急情况处理)

---

## 1. 快速诊断

### 🏥 健康检查脚本

```bash
#!/bin/bash
# scripts/health-check.sh

echo "🔍 ZKFair L2 健康检查"
echo "===================="

# 检查 Docker
echo -n "Docker 状态: "
if docker ps > /dev/null 2>&1; then
    echo "✅ 运行中"
else
    echo "❌ 未运行"
    echo "  → 运行: sudo systemctl start docker"
fi

# 检查服务
services=("postgres" "redis" "cdk-node" "bundler" "api" "frontend")
for service in "${services[@]}"; do
    echo -n "$service 状态: "
    if docker-compose ps | grep -q "$service.*Up"; then
        echo "✅ 运行中"
    else
        echo "❌ 未运行"
        echo "  → 运行: docker-compose up -d $service"
    fi
done

# 检查端口
ports=("8545:L2 RPC" "3000:Bundler" "4000:API" "80:Frontend")
for port_info in "${ports[@]}"; do
    port=$(echo $port_info | cut -d: -f1)
    name=$(echo $port_info | cut -d: -f2)
    echo -n "$name 端口 $port: "
    if lsof -i:$port > /dev/null 2>&1; then
        echo "✅ 监听中"
    else
        echo "❌ 未监听"
    fi
done

# 检查连接
echo -n "L2 节点连接: "
if curl -s -X POST http://localhost:8545 \
    -H "Content-Type: application/json" \
    -d '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}' \
    > /dev/null 2>&1; then
    echo "✅ 正常"
else
    echo "❌ 无法连接"
fi
```

### 🔍 常见症状对照表

| 症状 | 可能原因 | 快速修复 |
|------|----------|----------|
| 页面打不开 | 前端服务未启动 | `docker-compose up -d frontend` |
| 交易失败 | Gas 不足 | 检查 USDC 余额 |
| 连接钱包失败 | 网络配置错误 | 检查 chainId: 67890 |
| API 错误 | 后端服务崩溃 | `docker-compose restart api` |
| 交易卡住 | Bundler 问题 | 查看 Bundler 日志 |

---

## 2. 环境问题

### 问题：Docker 容器启动失败

**症状**：
```
ERROR: for postgres Cannot start service postgres: driver failed programming external connectivity
```

**解决方案**：
```bash
# 1. 检查端口占用
sudo lsof -i :5432
# 如果被占用，杀掉进程或更改端口

# 2. 清理并重启
docker-compose down -v
docker system prune -f
docker-compose up -d

# 3. 如果还不行，检查 Docker 守护进程
sudo systemctl restart docker
```

### 问题：内存不足

**症状**：
```
FATAL: could not map anonymous shared memory: Cannot allocate memory
```

**解决方案**：
```bash
# 1. 检查内存使用
free -h

# 2. 增加 swap（临时方案）
sudo fallocate -l 4G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile

# 3. 优化 Docker 内存限制
# 编辑 docker-compose.yml，添加：
services:
  cdk-node:
    mem_limit: 2g
    memswap_limit: 2g
```

### 问题：网络连接问题

**症状**：
```
Error: connect ECONNREFUSED 127.0.0.1:8545
```

**解决方案**：
```bash
# 1. 检查 Docker 网络
docker network ls
docker network inspect zkfair-network

# 2. 重建网络
docker-compose down
docker network prune -f
docker-compose up -d

# 3. 使用 Docker 内部地址
# 将 localhost 改为服务名，如：
# http://localhost:8545 → http://cdk-node:8545
```

---

## 3. 智能合约问题

### 问题：合约部署失败

**症状**：
```
Error: insufficient funds for gas * price + value
```

**解决方案**：
```bash
# 1. 检查账户余额
cast balance $DEPLOYER_ADDRESS --rpc-url $L2_RPC_URL

# 2. 获取测试币
curl -X POST $L2_RPC_URL \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "method": "eth_sendTransaction",
    "params": [{
      "from": "'$FAUCET_ADDRESS'",
      "to": "'$DEPLOYER_ADDRESS'",
      "value": "0x1BC16D674EC80000"
    }],
    "id": 1
  }'

# 3. 重新部署
forge create MyContract --rpc-url $L2_RPC_URL --private-key $PRIVATE_KEY
```

### 问题：合约调用失败

**症状**：
```
Error: execution reverted: ERC20: transfer amount exceeds balance
```

**调试步骤**：
```solidity
// 1. 添加调试日志
contract MyContract {
    event Debug(string message, uint256 value);
    
    function transfer(uint256 amount) public {
        emit Debug("Balance", token.balanceOf(msg.sender));
        emit Debug("Amount", amount);
        require(token.balanceOf(msg.sender) >= amount, "Insufficient balance");
        // ...
    }
}

// 2. 使用 forge 调试
forge test -vvvv --match-test testTransfer

// 3. 使用 cast 调用
cast call $CONTRACT "balanceOf(address)" $USER_ADDRESS --rpc-url $L2_RPC_URL
```

### 问题：Gas 估算错误

**症状**：
```
Error: gas required exceeds allowance
```

**解决方案**：
```javascript
// 1. 手动设置 gas limit
const tx = await contract.myMethod(params, {
  gasLimit: 1000000 // 设置一个较高的值
});

// 2. 动态估算并增加缓冲
const estimatedGas = await contract.estimateGas.myMethod(params);
const tx = await contract.myMethod(params, {
  gasLimit: estimatedGas.mul(120).div(100) // 增加 20% 缓冲
});

// 3. 检查 Paymaster 配置
const paymasterBalance = await provider.getBalance(PAYMASTER_ADDRESS);
console.log("Paymaster balance:", ethers.utils.formatEther(paymasterBalance));
```

---

## 4. 前端问题

### 问题：钱包连接失败

**症状**：
```
MetaMask - RPC Error: Invalid parameters: must provide an Ethereum address
```

**解决方案**：
```javascript
// 1. 确保正确的链配置
const zkFairChain = {
  id: 67890,
  name: 'ZKFair L2',
  network: 'zkfair',
  nativeCurrency: {
    decimals: 18,
    name: 'ZKFair Gas',
    symbol: 'ZKG',
  },
  rpcUrls: {
    default: { http: ['http://localhost:8545'] },
    public: { http: ['http://localhost:8545'] },
  },
};

// 2. 手动添加网络
async function addNetwork() {
  try {
    await window.ethereum.request({
      method: 'wallet_addEthereumChain',
      params: [{
        chainId: '0x108b2', // 67890 in hex
        chainName: 'ZKFair L2',
        nativeCurrency: {
          name: 'ZKG',
          symbol: 'ZKG',
          decimals: 18
        },
        rpcUrls: ['http://localhost:8545'],
      }],
    });
  } catch (error) {
    console.error('Failed to add network:', error);
  }
}
```

### 问题：交易签名失败

**症状**：
```
Error: User rejected the request
```

**解决方案**：
```javascript
// 1. 检查 UserOperation 格式
console.log('UserOp:', JSON.stringify(userOp, null, 2));

// 2. 验证签名前的数据
const userOpHash = await entryPoint.getUserOpHash(userOp);
console.log('UserOp Hash:', userOpHash);

// 3. 使用正确的签名方法
const signature = await signer.signMessage(ethers.utils.arrayify(userOpHash));
userOp.signature = signature;
```

### 问题：UI 状态不更新

**症状**：交易成功但界面没有更新

**解决方案**：
```javascript
// 1. 强制刷新余额
const refreshBalance = async () => {
  // 清除缓存
  queryClient.invalidateQueries(['balance', address]);
  
  // 重新获取
  const newBalance = await sdk.getBalance(USDC_ADDRESS);
  setBalance(newBalance);
};

// 2. 监听事件
useEffect(() => {
  const handleTransfer = (from, to, amount) => {
    if (from === address || to === address) {
      refreshBalance();
    }
  };
  
  contract.on('Transfer', handleTransfer);
  return () => contract.off('Transfer', handleTransfer);
}, [address]);

// 3. 轮询状态
useInterval(() => {
  refreshBalance();
}, 5000); // 每 5 秒刷新
```

---

## 5. 交易问题

### 问题：UserOperation 失败

**症状**：
```
Error: AA23 reverted: Paymaster validation failed
```

**诊断流程**：
```javascript
// 1. 检查 Paymaster 余额
const balance = await provider.getBalance(PAYMASTER_ADDRESS);
console.log('Paymaster ETH balance:', ethers.formatEther(balance));

// 2. 检查用户 USDC 余额和授权
const usdcBalance = await usdcContract.balanceOf(userAddress);
const allowance = await usdcContract.allowance(userAddress, PAYMASTER_ADDRESS);
console.log('USDC balance:', ethers.formatUnits(usdcBalance, 6));
console.log('USDC allowance:', ethers.formatUnits(allowance, 6));

// 3. 检查限额
const limits = await paymaster.getUserLimits(userAddress);
console.log('Daily limit:', limits.dailyLimit);
console.log('Daily spent:', limits.dailySpent);

// 4. 模拟交易
try {
  const result = await bundler.simulateValidation(userOp);
  console.log('Simulation result:', result);
} catch (error) {
  console.error('Simulation failed:', error);
}
```

### 问题：交易卡在 pending

**症状**：交易提交后长时间没有确认

**解决方案**：
```bash
# 1. 检查 Bundler 日志
docker-compose logs -f bundler | grep ERROR

# 2. 检查内存池
curl -X POST http://localhost:3000/rpc \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "method": "eth_getUserOperationByHash",
    "params": ["0x...userOpHash"],
    "id": 1
  }'

# 3. 手动触发打包
docker-compose exec bundler node scripts/force-bundle.js

# 4. 重启 Bundler
docker-compose restart bundler
```

### 问题：Gas 价格异常

**症状**：
```
Error: maxFeePerGas (0x...) is less than block base fee
```

**解决方案**：
```javascript
// 1. 获取当前 gas 价格
const feeData = await provider.getFeeData();
console.log('Current gas price:', feeData);

// 2. 设置合理的 gas 价格
const userOp = {
  ...baseUserOp,
  maxFeePerGas: feeData.maxFeePerGas.mul(110).div(100), // +10%
  maxPriorityFeePerGas: feeData.maxPriorityFeePerGas.mul(110).div(100)
};

// 3. 使用固定 gas 价格（测试网）
const userOp = {
  ...baseUserOp,
  maxFeePerGas: ethers.parseUnits('10', 'gwei'),
  maxPriorityFeePerGas: ethers.parseUnits('2', 'gwei')
};
```

---

## 6. 性能问题

### 问题：API 响应慢

**症状**：API 请求超过 5 秒

**优化方案**：
```javascript
// 1. 检查数据库索引
-- 添加缺失的索引
CREATE INDEX idx_user_operations_sender_timestamp 
ON user_operations(sender, timestamp DESC);

CREATE INDEX idx_paymaster_transactions_user_token 
ON paymaster_transactions(user, token, timestamp DESC);

// 2. 实现缓存
import { CacheManager } from './services/cacheManager';

const cache = new CacheManager(REDIS_URL);

// 使用缓存
const getTransactions = async (address: string) => {
  return cache.wrap(
    `transactions:${address}`,
    async () => {
      // 昂贵的数据库查询
      return await prisma.userOperation.findMany({
        where: { sender: address },
        orderBy: { timestamp: 'desc' },
        take: 50
      });
    },
    { ttl: 300 } // 5 分钟缓存
  );
};

// 3. 分页优化
const transactions = await prisma.userOperation.findMany({
  where: { sender: address },
  skip: (page - 1) * limit,
  take: limit,
  select: {
    // 只选择需要的字段
    userOpHash: true,
    sender: true,
    actualGasCost: true,
    timestamp: true
  }
});
```

### 问题：内存泄漏

**症状**：服务运行一段时间后变慢或崩溃

**诊断和修复**：
```javascript
// 1. 添加内存监控
setInterval(() => {
  const usage = process.memoryUsage();
  console.log('Memory usage:', {
    rss: `${Math.round(usage.rss / 1024 / 1024)}MB`,
    heapUsed: `${Math.round(usage.heapUsed / 1024 / 1024)}MB`,
    heapTotal: `${Math.round(usage.heapTotal / 1024 / 1024)}MB`
  });
}, 60000);

// 2. 修复事件监听器泄漏
class EventListener {
  private listeners: Map<string, any> = new Map();
  
  start() {
    const handler = this.handleEvent.bind(this);
    this.contract.on('Transfer', handler);
    this.listeners.set('Transfer', handler);
  }
  
  stop() {
    // 清理所有监听器
    for (const [event, handler] of this.listeners) {
      this.contract.off(event, handler);
    }
    this.listeners.clear();
  }
}

// 3. 限制并发请求
import pLimit from 'p-limit';
const limit = pLimit(10); // 最多 10 个并发

const results = await Promise.all(
  addresses.map(addr => 
    limit(() => getBalance(addr))
  )
);
```

### 问题：数据库连接耗尽

**症状**：
```
Error: too many connections for role "zkfair"
```

**解决方案**：
```javascript
// 1. 配置连接池
const prisma = new PrismaClient({
  datasources: {
    db: {
      url: DATABASE_URL,
    },
  },
  // 连接池配置
  connection_limit: 10,
  pool_timeout: 10,
  pool_size: 10,
});

// 2. 确保正确关闭连接
async function processData() {
  try {
    await prisma.$transaction(async (tx) => {
      // 事务操作
    });
  } finally {
    await prisma.$disconnect();
  }
}

// 3. 监控连接数
SELECT count(*) FROM pg_stat_activity 
WHERE datname = 'zkfair_state';
```

---

## 7. 部署问题

### 问题：生产环境部署失败

**症状**：服务无法启动或频繁重启

**检查清单**：
```bash
#!/bin/bash
# deployment-check.sh

echo "🚀 部署前检查"

# 1. 环境变量
required_vars=(
  "L1_RPC_URL"
  "L2_CHAIN_ID"
  "ENTRY_POINT_ADDRESS"
  "PAYMASTER_ADDRESS"
  "DATABASE_URL"
  "REDIS_URL"
)

for var in "${required_vars[@]}"; do
  if [ -z "${!var}" ]; then
    echo "❌ 缺少环境变量: $var"
    exit 1
  else
    echo "✅ $var 已设置"
  fi
done

# 2. 端口可用性
ports=(80 443 8545 3000 4000)
for port in "${ports[@]}"; do
  if lsof -i:$port > /dev/null 2>&1; then
    echo "❌ 端口 $port 已被占用"
  else
    echo "✅ 端口 $port 可用"
  fi
done

# 3. 磁盘空间
available=$(df -BG / | awk 'NR==2 {print $4}' | sed 's/G//')
if [ $available -lt 50 ]; then
  echo "❌ 磁盘空间不足: ${available}GB"
else
  echo "✅ 磁盘空间充足: ${available}GB"
fi

# 4. 内存
available_mem=$(free -g | awk 'NR==2 {print $7}')
if [ $available_mem -lt 8 ]; then
  echo "❌ 可用内存不足: ${available_mem}GB"
else
  echo "✅ 可用内存充足: ${available_mem}GB"
fi
```

### 问题：SSL 证书问题

**症状**：HTTPS 无法访问

**解决方案**：
```bash
# 1. 使用 Let's Encrypt 自动获取
sudo certbot --nginx -d zkfair.io -d www.zkfair.io

# 2. 自动续期
sudo certbot renew --dry-run

# 3. 手动配置 nginx
server {
    listen 443 ssl http2;
    server_name zkfair.io;
    
    ssl_certificate /etc/letsencrypt/live/zkfair.io/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/zkfair.io/privkey.pem;
    
    # 安全头
    add_header Strict-Transport-Security "max-age=31536000" always;
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
}
```

---

## 8. 紧急情况处理

### 🚨 服务完全宕机

**立即行动**：
```bash
# 1. 备份当前状态
docker-compose exec postgres pg_dump -U zkfair zkfair_state > backup_$(date +%Y%m%d_%H%M%S).sql

# 2. 保存日志
docker-compose logs > crash_logs_$(date +%Y%m%d_%H%M%S).log

# 3. 重启所有服务
docker-compose down
docker-compose up -d

# 4. 验证服务
curl http://localhost:4000/api/health
```

### 🚨 资金被盗风险

**立即行动**：
```javascript
// 1. 暂停 Paymaster
const paymaster = new ethers.Contract(PAYMASTER_ADDRESS, abi, signer);
await paymaster.pause();

// 2. 提取剩余资金
const balance = await provider.getBalance(PAYMASTER_ADDRESS);
await paymaster.withdrawEth(SAFE_ADDRESS, balance);

// 3. 通知用户
// 更新前端显示紧急通知
```

### 🚨 数据库崩溃

**恢复流程**：
```bash
# 1. 从备份恢复
psql -U zkfair -d postgres -c "DROP DATABASE IF EXISTS zkfair_state"
psql -U zkfair -d postgres -c "CREATE DATABASE zkfair_state"
psql -U zkfair zkfair_state < latest_backup.sql

# 2. 验证数据完整性
psql -U zkfair -d zkfair_state -c "SELECT COUNT(*) FROM user_operations"

# 3. 重建索引
psql -U zkfair -d zkfair_state -c "REINDEX DATABASE zkfair_state"
```

---

## 📞 获取帮助

### 社区支持
- Discord: https://discord.gg/zkfair (最快响应)
- Telegram: https://t.me/zkfair
- GitHub Issues: https://github.com/zkfair/zkfair-l2/issues

### 紧急联系
- 技术支持邮箱: support@zkfair.io
- 紧急热线: +1-xxx-xxx-xxxx (仅限严重事故)

### 有用的命令别名

```bash
# 添加到 ~/.bashrc 或 ~/.zshrc
alias zkl='docker-compose logs -f'
alias zks='docker-compose ps'
alias zkr='docker-compose restart'
alias zkh='curl -s http://localhost:4000/api/health | jq'
```

---

💡 **记住**：
- 遇到问题先看日志
- 备份永远不嫌多
- 社区是最好的资源

🚀 **保持冷静，问题总有解决方案！**