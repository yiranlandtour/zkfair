# 贡献指南

感谢你对 ZKFair L2 项目的关注！我们欢迎所有形式的贡献。

## 🤝 如何贡献

### 1. 报告 Bug
- 使用 [Bug Report](.github/ISSUE_TEMPLATE/bug_report.md) 模板
- 提供详细的复现步骤
- 包含相关的日志和截图

### 2. 提出新功能
- 使用 [Feature Request](.github/ISSUE_TEMPLATE/feature_request.md) 模板
- 解释功能的价值和用例
- 考虑实现的可行性

### 3. 提交代码

#### 准备工作
```bash
# Fork 项目
# Clone 你的 fork
git clone https://github.com/YOUR_USERNAME/zkfair-l2.git
cd zkfair-l2

# 添加上游仓库
git remote add upstream https://github.com/zkfair/zkfair-l2.git

# 创建新分支
git checkout -b feature/your-feature-name
```

#### 开发流程
1. **编写代码**
   - 遵循现有的代码风格
   - 添加必要的注释
   - 更新相关文档

2. **测试**
   ```bash
   # 运行所有测试
   npm test
   
   # 运行特定测试
   npm test -- --grep "your test"
   ```

3. **提交**
   ```bash
   # 提交信息格式
   # type(scope): subject
   # 
   # 类型：feat/fix/docs/style/refactor/test/chore
   
   git commit -m "feat(paymaster): add daily limit feature"
   ```

4. **推送并创建 PR**
   ```bash
   git push origin feature/your-feature-name
   ```

### 4. 改进文档
- 修正错别字和语法错误
- 添加示例和说明
- 翻译文档

## 📋 代码规范

### Solidity
```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

/**
 * @title MyContract
 * @notice 合约说明
 * @dev 开发者说明
 */
contract MyContract {
    // 状态变量
    uint256 private _value;
    
    // 事件
    event ValueChanged(uint256 newValue);
    
    // 修饰符
    modifier onlyPositive(uint256 value) {
        require(value > 0, "Value must be positive");
        _;
    }
    
    // 函数
    function setValue(uint256 value) external onlyPositive(value) {
        _value = value;
        emit ValueChanged(value);
    }
}
```

### TypeScript
```typescript
/**
 * 函数说明
 * @param param 参数说明
 * @returns 返回值说明
 */
export async function myFunction(param: string): Promise<Result> {
  try {
    // 实现逻辑
    const result = await doSomething(param);
    return result;
  } catch (error) {
    // 错误处理
    logger.error('Function failed:', error);
    throw new CustomError('Operation failed', error);
  }
}
```

### Git 提交信息
```
feat: 新功能
fix: 修复 bug
docs: 文档更新
style: 代码格式调整
refactor: 代码重构
test: 测试相关
chore: 构建/工具相关
```

## 🔍 代码审查

### 审查重点
1. **功能性**：代码是否实现了预期功能
2. **安全性**：是否存在安全漏洞
3. **性能**：是否有性能问题
4. **可读性**：代码是否易于理解
5. **测试**：是否有充分的测试覆盖

### 审查流程
1. 自动化检查（CI/CD）
2. 至少一位维护者审查
3. 所有评论得到解决
4. 测试通过
5. 合并到主分支

## 🎯 优先事项

### 高优先级
- 安全漏洞修复
- 关键功能 bug
- 性能优化
- 文档改进

### 中优先级
- 新功能开发
- 代码重构
- 测试覆盖提升

### 低优先级
- 代码风格调整
- 非关键优化

## 📞 获取帮助

- **Discord**: https://discord.gg/zkfair
- **GitHub Discussions**: https://github.com/zkfair/zkfair-l2/discussions
- **Email**: dev@zkfair.io

## 🏆 贡献者

感谢所有贡献者！

<!-- ALL-CONTRIBUTORS-LIST:START -->
<!-- ALL-CONTRIBUTORS-LIST:END -->

## 📄 许可证

通过贡献代码，你同意你的贡献将在 MIT 许可证下发布。