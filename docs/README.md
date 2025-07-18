# ZKFair L2 文档中心

欢迎来到 ZKFair L2 的文档中心！这里整理了所有文档，帮助你快速找到需要的信息。

## 📚 文档导航

### 🎯 根据你的角色选择

#### 我是新手
- 📖 [**完整指南**](COMPLETE_GUIDE.md) - 从零开始了解项目（推荐先读）
- 🚀 [**项目概览**](../OVERVIEW.md) - 快速了解项目全貌
- ❓ [**常见问题**](COMPLETE_GUIDE.md#6-常见问题) - 解答你的疑问

#### 我是开发者
- 💻 [**开发指南**](DEVELOPMENT.md) - 详细的开发流程
- 🏗️ [**架构设计**](ARCHITECTURE.md) - 深入理解系统设计
- 🔧 [**API 文档**](API_REFERENCE.md) - 接口说明（建设中）

#### 我是运维人员
- 🚢 [**部署指南**](DEPLOYMENT.md) - 生产环境部署
- 📊 [**监控指南**](MONITORING.md) - 系统监控（建设中）
- 🔐 [**安全指南**](SECURITY.md) - 安全最佳实践（建设中）

#### 我是决策者
- 📈 [**执行摘要**](../EXECUTIVE_SUMMARY.md) - 商业价值和愿景
- 📋 [**项目总结**](PROJECT_SUMMARY.md) - 技术实现总结
- 🔍 [**深度审查**](FINAL_REVIEW.md) - 项目评估和改进

### 📂 文档结构

```
docs/
├── README.md              # 本文件 - 文档导航
├── COMPLETE_GUIDE.md      # ⭐ 新手必读 - 完整指南
├── DEVELOPMENT.md         # 开发者指南
├── DEPLOYMENT.md          # 部署指南
├── ARCHITECTURE.md        # 架构设计
├── PROJECT_SUMMARY.md     # 项目总结
└── FINAL_REVIEW.md        # 深度审查报告

项目根目录/
├── README.md              # 项目介绍
├── OVERVIEW.md            # 快速概览
└── EXECUTIVE_SUMMARY.md   # 执行摘要
```

### 🗺️ 学习路径

#### 路径 1：快速上手（1 小时）
1. 阅读 [完整指南](COMPLETE_GUIDE.md) 的前 4 章
2. 运行快速启动脚本
3. 完成第一笔交易

#### 路径 2：深入开发（1 天）
1. 完成"快速上手"
2. 阅读 [开发指南](DEVELOPMENT.md)
3. 学习 [架构设计](ARCHITECTURE.md)
4. 尝试部署自己的合约

#### 路径 3：生产部署（1 周）
1. 完成前两个路径
2. 研究 [部署指南](DEPLOYMENT.md)
3. 设置监控和告警
4. 进行安全审查

### 📋 快速参考

#### 常用命令
```bash
# 快速启动
./scripts/quick-start.sh

# 查看日志
docker-compose logs -f

# 运行测试
npm test

# 部署合约
npm run deploy:contracts
```

#### 重要地址
- 前端：http://localhost
- API：http://localhost:4000
- Bundler：http://localhost:3000
- L2 RPC：http://localhost:8545

#### 环境变量
```env
L2_CHAIN_ID=67890
ENTRY_POINT_ADDRESS=<部署后填写>
PAYMASTER_ADDRESS=<部署后填写>
```

### 🔍 如何使用文档

1. **新手入门**
   - 先读 [完整指南](COMPLETE_GUIDE.md)
   - 动手运行项目
   - 遇到问题查看 FAQ

2. **开发集成**
   - 参考 [开发指南](DEVELOPMENT.md)
   - 查看代码示例
   - 使用 SDK 集成

3. **部署上线**
   - 遵循 [部署指南](DEPLOYMENT.md)
   - 配置监控系统
   - 制定运维计划

### 💡 文档特色

- **🎯 面向角色**：根据你的身份推荐合适的文档
- **📖 循序渐进**：从概念到实践，由浅入深
- **💻 示例丰富**：大量代码示例和配置模板
- **🔧 实用导向**：注重实际操作，不仅是理论

### 🤝 贡献文档

发现错误或想要改进文档？欢迎贡献！

1. Fork 项目
2. 创建分支：`git checkout -b docs/improve-xxx`
3. 提交 PR

### 📞 获取帮助

- **Discord**: https://discord.gg/zkfair
- **GitHub Issues**: https://github.com/zkfair/zkfair-l2/issues
- **Email**: docs@zkfair.io

---

**提示**：推荐使用 VS Code + Markdown Preview 插件阅读文档，体验更佳！

**最后更新**：2024-01-18