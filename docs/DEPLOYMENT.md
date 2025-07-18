# ZKFair L2 部署指南

## 目录

1. [部署概览](#部署概览)
2. [前置准备](#前置准备)
3. [部署步骤](#部署步骤)
4. [配置详解](#配置详解)
5. [监控与维护](#监控与维护)
6. [升级流程](#升级流程)

## 部署概览

ZKFair L2 的部署分为以下几个阶段：

1. **基础设施准备**: 服务器、数据库、网络配置
2. **L1 合约部署**: 在以太坊主网/测试网部署 CDK 合约
3. **L2 节点部署**: 部署 Polygon CDK 节点
4. **Celestia 集成**: 配置 Celestia DA 层
5. **ERC-4337 部署**: 部署 EntryPoint、Paymaster 等合约
6. **服务部署**: Bundler、API、前端等服务

## 前置准备

### 1. 硬件要求

**CDK 节点服务器**:
- CPU: 16 核心 AMD EPYC 或 Intel Xeon
- RAM: 64GB DDR4
- 存储: 2TB NVMe SSD
- 网络: 1Gbps 对称带宽

**Bundler/API 服务器**:
- CPU: 8 核心
- RAM: 32GB
- 存储: 500GB SSD
- 网络: 100Mbps+

### 2. 软件依赖

```bash
# 更新系统
sudo apt update && sudo apt upgrade -y

# 安装必要软件
sudo apt install -y \
  build-essential \
  git \
  curl \
  wget \
  jq \
  postgresql-14 \
  redis-server \
  nginx \
  certbot \
  python3-certbot-nginx
```

### 3. 账户准备

- [ ] 以太坊主网账户（用于部署 L1 合约）
- [ ] Celestia 账户（用于 DA 服务）
- [ ] 域名和 SSL 证书
- [ ] AWS/GCP 账户（如果使用云服务）

## 部署步骤

### 第一阶段：L1 合约部署

1. **准备部署账户**
```bash
# 设置环境变量
export DEPLOYER_PRIVATE_KEY="your-private-key"
export L1_RPC_URL="https://eth-mainnet.g.alchemy.com/v2/your-key"
```

2. **部署 CDK L1 合约**
```bash
cd cdk-contracts
forge script script/DeployL1.s.sol \
  --rpc-url $L1_RPC_URL \
  --private-key $DEPLOYER_PRIVATE_KEY \
  --broadcast \
  --verify \
  --etherscan-api-key $ETHERSCAN_KEY
```

3. **记录合约地址**
```json
{
  "polygonZkEVMAddress": "0x...",
  "polygonRollupManagerAddress": "0x...",
  "polygonZkEVMGlobalExitRootAddress": "0x...",
  "polTokenAddress": "0x..."
}
```

### 第二阶段：L2 节点部署

1. **配置 PostgreSQL**
```bash
# 创建数据库
sudo -u postgres createdb zkfair_state
sudo -u postgres createdb zkfair_pool

# 创建用户
sudo -u postgres createuser zkfair -P
sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE zkfair_state TO zkfair;"
sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE zkfair_pool TO zkfair;"
```

2. **配置 CDK 节点**
```bash
# 复制配置模板
cp cdk-node/config/node.toml.example cdk-node/config/node.toml

# 编辑配置文件
nano cdk-node/config/node.toml
```

关键配置：
```toml
[State]
User = "zkfair"
Password = "your-password"
Name = "zkfair_state"

[Etherman]
L1URL = "https://eth-mainnet.g.alchemy.com/v2/your-key"

[Sequencer]
L2Coinbase = "0x617b3a3528F9cDd6630fd3301B9c8911F7Bf063D"
PrivateKey = {Path = "/keys/sequencer.key", Password = "password"}
```

3. **启动节点**
```bash
# 使用 systemd 管理
sudo cp scripts/zkfair-node.service /etc/systemd/system/
sudo systemctl enable zkfair-node
sudo systemctl start zkfair-node

# 查看日志
sudo journalctl -u zkfair-node -f
```

### 第三阶段：Celestia DA 配置

1. **部署 Celestia 轻节点**
```bash
# 下载 Celestia 节点
wget https://github.com/celestiaorg/celestia-node/releases/download/v0.11.0/celestia
chmod +x celestia

# 初始化节点
./celestia light init --p2p.network mainnet

# 启动节点
./celestia light start --core.ip consensus.celestia.org
```

2. **配置 CDK-Celestia 集成**
```toml
[DataAvailability]
Type = "celestia"
CelestiaConfig.Endpoint = "http://localhost:26658"
CelestiaConfig.NamespaceID = "0x00000000000000000000000000000000000000000000000000000001"
CelestiaConfig.AuthToken = "your-auth-token"
```

### 第四阶段：ERC-4337 基础设施

1. **部署 EntryPoint 合约**
```bash
cd contracts
forge script script/DeployEntryPoint.s.sol \
  --rpc-url $L2_RPC_URL \
  --private-key $DEPLOYER_PRIVATE_KEY \
  --broadcast
```

2. **部署 Paymaster 合约**
```bash
forge script script/DeployPaymaster.s.sol \
  --rpc-url $L2_RPC_URL \
  --private-key $DEPLOYER_PRIVATE_KEY \
  --broadcast
```

3. **配置 Paymaster**
```javascript
// 设置 USDC 预言机
await paymaster.setTokenOracle(
  USDC_ADDRESS,
  CHAINLINK_USDC_ORACLE,
  105000 // 5% markup
);

// 注入初始资金
await paymaster.deposit({ value: ethers.parseEther("10") });
```

### 第五阶段：Bundler 部署

1. **配置 Redis**
```bash
# 编辑 Redis 配置
sudo nano /etc/redis/redis.conf

# 设置密码
requirepass your-redis-password

# 重启 Redis
sudo systemctl restart redis
```

2. **部署 Bundler**
```bash
cd bundler

# 设置环境变量
cp .env.example .env
nano .env

# 构建
npm run build

# 使用 PM2 管理
npm install -g pm2
pm2 start dist/index.js --name zkfair-bundler
pm2 save
pm2 startup
```

### 第六阶段：API 和前端部署

1. **部署后端 API**
```bash
cd backend

# 初始化数据库
npx prisma migrate deploy

# 启动服务
pm2 start dist/index.js --name zkfair-api
```

2. **部署前端**
```bash
cd frontend

# 构建生产版本
npm run build

# 配置 Nginx
sudo nano /etc/nginx/sites-available/zkfair
```

Nginx 配置：
```nginx
server {
    server_name zkfair.io;
    root /var/www/zkfair/build;
    
    location / {
        try_files $uri /index.html;
    }
    
    location /api {
        proxy_pass http://localhost:4000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

3. **配置 SSL**
```bash
sudo certbot --nginx -d zkfair.io -d www.zkfair.io
```

## 配置详解

### 环境变量

创建 `.env.production` 文件：

```env
# L1 配置
L1_RPC_URL=https://eth-mainnet.g.alchemy.com/v2/your-key
L1_CHAIN_ID=1

# L2 配置
L2_RPC_URL=https://rpc.zkfair.io
L2_CHAIN_ID=67890

# 合约地址
ENTRY_POINT_ADDRESS=0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789
PAYMASTER_ADDRESS=0x...
FACTORY_ADDRESS=0x...
USDC_ADDRESS=0x...

# Bundler 配置
BUNDLER_PRIVATE_KEY=0x...
BUNDLER_BENEFICIARY=0x...
MAX_BUNDLE_SIZE=10
BUNDLE_INTERVAL=2000

# API 配置
DATABASE_URL=postgresql://zkfair:password@localhost:5432/zkfair
REDIS_URL=redis://:password@localhost:6379

# Celestia 配置
CELESTIA_ENDPOINT=http://localhost:26658
CELESTIA_NAMESPACE=0x...
CELESTIA_AUTH_TOKEN=...
```

### 安全配置

1. **防火墙规则**
```bash
# 允许必要端口
sudo ufw allow 22/tcp    # SSH
sudo ufw allow 80/tcp    # HTTP
sudo ufw allow 443/tcp   # HTTPS
sudo ufw allow 8545/tcp  # RPC (仅内网)
sudo ufw enable
```

2. **密钥管理**
- 使用 AWS KMS 或 HashiCorp Vault
- 定期轮换密钥
- 实施多签方案

## 监控与维护

### 1. 监控设置

**Prometheus 配置**:
```yaml
scrape_configs:
  - job_name: 'zkfair-node'
    static_configs:
      - targets: ['localhost:9090']
  
  - job_name: 'zkfair-bundler'
    static_configs:
      - targets: ['localhost:3001']
```

**Grafana 仪表板**:
- 导入预设仪表板: `grafana/dashboards/`
- 配置告警规则

### 2. 日志管理

```bash
# 配置日志轮转
sudo nano /etc/logrotate.d/zkfair

/var/log/zkfair/*.log {
    daily
    rotate 7
    compress
    delaycompress
    missingok
    notifempty
}
```

### 3. 备份策略

```bash
# 数据库备份脚本
#!/bin/bash
pg_dump -U zkfair zkfair_state > /backup/state_$(date +%Y%m%d).sql
pg_dump -U zkfair zkfair_pool > /backup/pool_$(date +%Y%m%d).sql

# 上传到 S3
aws s3 sync /backup s3://zkfair-backups/
```

## 升级流程

### 1. 合约升级

```bash
# 部署新实现
forge script script/UpgradePaymaster.s.sol --broadcast

# 执行升级
cast send $PROXY_ADDRESS "upgradeTo(address)" $NEW_IMPLEMENTATION
```

### 2. 节点升级

```bash
# 停止服务
sudo systemctl stop zkfair-node

# 备份数据
cp -r /var/zkfair/data /var/zkfair/data.backup

# 更新二进制
wget https://github.com/zkfair/releases/latest/zkfair-node
chmod +x zkfair-node
sudo mv zkfair-node /usr/local/bin/

# 启动服务
sudo systemctl start zkfair-node
```

### 3. 零停机升级

使用蓝绿部署策略：
1. 部署新版本到备用环境
2. 同步数据
3. 切换负载均衡器
4. 验证新版本
5. 停止旧版本

## 故障恢复

### 1. 节点故障

```bash
# 检查节点状态
curl http://localhost:8545 -X POST \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"eth_syncing","params":[],"id":1}'

# 重新同步
./scripts/resync.sh --from-block $BLOCK_NUMBER
```

### 2. 数据库恢复

```bash
# 恢复数据库
psql -U zkfair zkfair_state < /backup/state_latest.sql
psql -U zkfair zkfair_pool < /backup/pool_latest.sql
```

## 性能调优

### 1. CDK 节点优化

```toml
[Executor]
MaxResourceExhaustedAttempts = 5
MaxGRPCMessageSize = 200000000

[Pool]
MaxTxBytesSize = 131072
MaxTxDataBytesSize = 100000
```

### 2. 数据库优化

```sql
-- 创建索引
CREATE INDEX idx_user_operations_sender ON user_operations(sender);
CREATE INDEX idx_user_operations_timestamp ON user_operations(timestamp);

-- 分区表
CREATE TABLE user_operations_2024_01 PARTITION OF user_operations
FOR VALUES FROM ('2024-01-01') TO ('2024-02-01');
```

## 检查清单

部署完成后，确保以下项目都已完成：

- [ ] 所有服务正常运行
- [ ] SSL 证书已配置
- [ ] 监控告警已设置
- [ ] 备份计划已实施
- [ ] 安全审计已通过
- [ ] 文档已更新
- [ ] 团队培训已完成

## 支持

如需技术支持：
- Discord: https://discord.gg/zkfair
- Email: support@zkfair.io
- 文档: https://docs.zkfair.io