# ZKFair L2 开发文档

## 目录

1. [架构概览](#架构概览)
2. [环境设置](#环境设置)
3. [核心组件](#核心组件)
4. [开发流程](#开发流程)
5. [测试指南](#测试指南)
6. [故障排除](#故障排除)

## 架构概览

ZKFair L2 是一个模块化的 Layer 2 解决方案，包含以下核心组件：

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│   用户 DApp     │────▶│  Smart Wallet    │────▶│    Bundler      │
└─────────────────┘     └──────────────────┘     └─────────────────┘
                                │                          │
                                ▼                          ▼
                        ┌──────────────────┐     ┌─────────────────┐
                        │   Paymaster      │     │  EntryPoint     │
                        └──────────────────┘     └─────────────────┘
                                                          │
                                                          ▼
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│  Polygon CDK    │────▶│   Celestia DA    │────▶│   Ethereum L1   │
└─────────────────┘     └──────────────────┘     └─────────────────┘
```

### 关键技术栈

- **执行层**: Polygon CDK (Erigon Stack)
- **数据可用性**: Celestia
- **账户抽象**: ERC-4337
- **智能合约**: Solidity 0.8.19+
- **前端**: React + TypeScript + Wagmi
- **后端**: Node.js + Express + Prisma

## 环境设置

### 1. 系统要求

- Ubuntu 20.04+ 或 macOS 12+
- 16GB+ RAM
- 500GB+ SSD
- Docker & Docker Compose
- Node.js v18+
- Go 1.21+
- Rust 1.70+

### 2. 安装依赖

```bash
# 安装基础工具
sudo apt update
sudo apt install -y build-essential git curl

# 安装 Node.js
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt install -y nodejs

# 安装 Go
wget https://go.dev/dl/go1.21.0.linux-amd64.tar.gz
sudo tar -C /usr/local -xzf go1.21.0.linux-amd64.tar.gz
export PATH=$PATH:/usr/local/go/bin

# 安装 Rust
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

# 安装 Foundry
curl -L https://foundry.paradigm.xyz | bash
foundryup

# 安装 Docker
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER
```

### 3. 克隆项目

```bash
git clone https://github.com/yourusername/zkfair
cd zkfair
npm install
```

## 核心组件

### 1. Polygon CDK 节点

CDK 节点是 L2 的核心执行环境。

**配置文件**: `cdk-node/config/node.toml`

关键配置项：
- L2 Chain ID: 67890
- Sequencer 地址
- Celestia DA 配置
- RPC 端口设置

**启动节点**:
```bash
cd cdk-node
./scripts/start-node.sh
```

### 2. Celestia DA 集成

Celestia 提供数据可用性服务，大幅降低 DA 成本。

**核心代码**: `celestia-da/src/`
- `publisher.go`: 发布批次数据到 Celestia
- `integration.go`: CDK 与 Celestia 的集成接口

**配置项**:
```toml
[DataAvailability]
Type = "celestia"
CelestiaConfig.Endpoint = "http://localhost:26658"
CelestiaConfig.NamespaceID = "0x74657374..."
```

### 3. ERC-4337 基础设施

#### EntryPoint 合约
- 全局单例合约，处理 UserOperations
- 地址配置在环境变量中

#### Paymaster 合约
- 允许用户使用 USDC 支付 Gas
- 集成 Chainlink 价格预言机
- 支持多种稳定币

#### Bundler 服务
- 收集和提交 UserOperations
- 基于 TypeScript 实现
- Redis 用于内存池管理

### 4. 智能钱包

- 基于 ERC-4337 标准
- 支持批量交易
- 可升级架构 (UUPS)

## 开发流程

### 1. 本地开发环境

```bash
# 启动所有服务
docker-compose up -d

# 部署合约
cd contracts
forge script script/Deploy.s.sol --rpc-url http://localhost:8545 --broadcast

# 启动 Bundler
cd ../bundler
npm run dev

# 启动前端
cd ../frontend
npm run start

# 启动后端 API
cd ../backend
npm run dev
```

### 2. 智能合约开发

```bash
# 编译合约
forge build

# 运行测试
forge test

# 部署到测试网
forge script script/Deploy.s.sol --rpc-url $RPC_URL --broadcast --verify
```

### 3. 前端开发

前端使用 React + TypeScript，主要功能：
- 钱包连接 (RainbowKit)
- 智能钱包管理
- 稳定币 Gas 支付
- 交易历史查询

关键组件：
- `SmartWalletContext`: 智能钱包状态管理
- `Dashboard`: 主界面
- `TransferModal`: 转账功能

### 4. 后端开发

后端提供 API 服务和事件监听：
- 交易历史 API
- 统计数据 API
- 事件监听服务

## 测试指南

### 1. 单元测试

```bash
# 合约测试
cd contracts
forge test -vvv

# 前端测试
cd frontend
npm test

# 后端测试
cd backend
npm test
```

### 2. 集成测试

```bash
cd tests
npm run test:integration
```

### 3. E2E 测试

```bash
cd tests
npm run test:e2e
```

## 部署检查清单

- [ ] 环境变量配置完整
- [ ] 数据库已初始化
- [ ] 合约已部署并验证
- [ ] Bundler 服务运行正常
- [ ] Celestia 连接正常
- [ ] 监控系统已配置

## 故障排除

### 常见问题

1. **CDK 节点无法启动**
   - 检查端口占用
   - 验证配置文件
   - 查看日志: `tail -f /var/log/zkfair/node.log`

2. **Celestia DA 失败**
   - 检查 Celestia 节点状态
   - 验证 namespace ID
   - 确认余额充足

3. **UserOperation 失败**
   - 检查 Paymaster 余额
   - 验证签名
   - 查看 Bundler 日志

4. **前端连接问题**
   - 确认 RPC URL 正确
   - 检查 CORS 设置
   - 清除浏览器缓存

### 调试技巧

1. 使用 Tenderly 调试交易
2. 启用详细日志模式
3. 使用 Postman 测试 API
4. 监控 Gas 使用情况

## 性能优化

1. **批量处理**: Bundler 批量提交 UserOperations
2. **缓存策略**: Redis 缓存常用数据
3. **数据压缩**: 发送到 Celestia 前压缩数据
4. **并发控制**: 限制并发请求数

## 安全考虑

1. **私钥管理**: 使用 HSM 或密钥管理服务
2. **访问控制**: 实施严格的 RBAC
3. **审计日志**: 记录所有关键操作
4. **监控告警**: 设置异常检测

## 附录

### 有用的命令

```bash
# 查看 L2 状态
curl http://localhost:8545 -X POST -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}'

# 查询 Celestia 状态
curl http://localhost:26658/status

# 检查 Bundler 健康状态
curl http://localhost:3000/health

# 查看智能合约日志
cast logs --address $CONTRACT_ADDRESS --from-block latest
```

### 相关资源

- [Polygon CDK 文档](https://docs.polygon.technology/cdk/)
- [Celestia 文档](https://docs.celestia.org/)
- [ERC-4337 规范](https://eips.ethereum.org/EIPS/eip-4337)
- [项目 Discord](https://discord.gg/zkfair)