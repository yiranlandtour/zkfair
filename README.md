# ZKFair L2 - Polygon CDK with Celestia DA and Stablecoin Gas

## 项目概述

ZKFair L2 是一个创新的 Layer 2 解决方案，采用模块化区块链架构：
- **执行层**: Polygon CDK (Erigon Stack) 
- **数据可用性层**: Celestia
- **Gas支付**: 通过 ERC-4337 支持稳定币支付

## 技术栈

### 核心组件
- **Polygon CDK Erigon**: ZK-EVM 执行环境
- **Celestia**: 模块化数据可用性层
- **ERC-4337**: 账户抽象标准，实现稳定币Gas支付
- **智能合约**: Solidity 0.8.19+
- **前端**: React + TypeScript + Wagmi
- **后端**: Node.js + Express + TypeScript

### 关键特性
1. **高性能**: ZK-Rollup 技术提供高吞吐量
2. **低成本**: Celestia DA 降低 95%+ 数据成本
3. **用户友好**: 稳定币支付 Gas，降低用户门槛
4. **模块化**: 灵活可扩展的架构设计

## 项目结构

```
zkfair/
├── contracts/          # 智能合约代码
├── cdk-node/          # Polygon CDK 节点配置
├── celestia-da/       # Celestia DA 集成
├── bundler/           # ERC-4337 Bundler 服务
├── frontend/          # React DApp 前端
├── backend/           # API 服务后端
├── sdk/               # 智能钱包 SDK
├── scripts/           # 部署和管理脚本
├── tests/             # 测试套件
├── docs/              # 项目文档
└── docker/            # Docker 配置文件
```

## 快速开始

### 前置要求
- Node.js v18+
- Go 1.21+
- Rust 1.70+
- Docker & Docker Compose
- Foundry (智能合约开发工具链)

### 安装步骤

1. 克隆仓库
```bash
git clone https://github.com/yourusername/zkfair
cd zkfair
```

2. 安装依赖
```bash
npm install
cd contracts && forge install
```

3. 配置环境变量
```bash
cp .env.example .env
# 编辑 .env 文件，填入必要的配置
```

4. 启动本地开发环境
```bash
docker-compose up -d
```

## 开发指南

详细的开发文档请参考 [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md)

## 部署指南

生产环境部署请参考 [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)

## 贡献指南

欢迎贡献代码！请查看 [CONTRIBUTING.md](CONTRIBUTING.md)

## 许可证

MIT License