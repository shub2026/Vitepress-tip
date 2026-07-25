# 版本管理指南

## 📋 概述

KEC课程管理平台使用自动化的版本管理工具,无需手动修改多个文件。所有版本号会同步更新。

## 🚀 快速开始

### 查看当前版本

```bash
npm run version
# 或
node scripts/version.js
```

### 更新版本

#### 方式1: 自动递增(推荐)

```bash
# 补丁版本 (bug修复): 1.0.1 -> 1.0.2
npm run version:patch

# 次版本 (新功能): 1.0.1 -> 1.1.0
npm run version:minor

# 主版本 (重大变更): 1.0.1 -> 2.0.0
npm run version:major
```

#### 方式2: 直接指定版本号

```bash
# 直接设置为指定版本
npm run version 1.2.3
# 或
node scripts/version.js 1.2.3
```

## 📖 语义化版本说明

本项目遵循 [Semantic Versioning](https://semver.org/lang/zh-CN/) 规范:

- **主版本号(Major)**: 不兼容的API修改
- **次版本号(Minor)**: 向下兼容的功能性新增
- **修订号(Patch)**: 向下兼容的问题修正

**示例**: `v1.2.3`

- `1` = 主版本
- `2` = 次版本
- `3` = 修订号

## 🔄 版本更新流程

### 标准流程

1. **开发新功能或修复bug**
2. **测试通过后,更新版本号**:
   ```bash
   # 根据变更类型选择
   npm run version:patch   # bug修复
   npm run version:minor   # 新功能
   npm run version:major   # 破坏性变更
   ```
3. **提交代码并打标签**:
   ```bash
   git add .
   git commit -m "chore: bump version to v1.0.2"
   git tag v1.0.2
   git push && git push --tags
   ```

### 完整示例

```bash
# 1. 完成功能开发后,增加次版本
npm run version:minor

# 输出:
# 🔄 更新版本: v1.0.1 → v1.1.0
# ✓ package.json: 1.0.1 → 1.1.0
# ✓ client/package.json: 1.0.1 → 1.1.0
# ✓ server/package.json: 1.0.1 → 1.1.0
# ✅ 成功更新 3 个文件

# 2. 提交更改
git add package.json client/package.json server/package.json
git commit -m "chore: bump version to v1.1.0"

# 3. 创建Git标签
git tag v1.1.0

# 4. 推送到远程仓库
git push && git push --tags
```

## 📁 自动更新的文件

运行版本更新脚本后,以下文件会自动同步版本号:

- `package.json` (根目录)
- `client/package.json` (前端)
- `server/package.json` (后端)

**注意**:

- 前端通过 Vite 配置从根目录 `package.json` 读取版本号
- 数据库中的 `system.version` 需要手动更新或通过系统设置界面修改

## 💡 最佳实践

### 1. 何时更新版本?

- **Patch**: Bug修复、安全补丁、文档更新
- **Minor**: 新功能、向后兼容的API变更
- **Major**: 破坏性变更、架构重构、数据库迁移

### 2. 版本更新时机

```
开发阶段          版本示例      说明
─────────────────────────────────────
初始开发          0.1.0        功能不完善
Alpha测试         0.x.0        核心功能完成
Beta测试          0.x.0        功能完整,可能有bug
RC候选            0.x.0        准备发布
正式发布          1.0.0        第一个稳定版本
Bug修复           1.0.1        补丁更新
新功能            1.1.0        次版本更新
重大重构          2.0.0        主版本更新
```

### 3. Git工作流

```bash
# 在feature分支开发
git checkout -b feature/new-feature
# ... 开发代码 ...
git add .
git commit -m "feat: add new feature"

# 合并到主分支
git checkout main
git merge feature/new-feature

# 更新版本
npm run version:minor

# 提交并打标签
git add .
git commit -m "chore: bump version to v1.1.0"
git tag v1.1.0
git push && git push --tags
```

## 🔧 高级用法

### 批量更新依赖后发布新版本

```bash
# 1. 更新依赖
npm update

# 2. 测试应用
npm run dev

# 3. 如果一切正常,增加补丁版本
npm run version:patch

# 4. 提交
git add .
git commit -m "chore: update dependencies and bump version"
git tag v1.0.2
git push && git push --tags
```

### 回滚版本

```bash
# 如果发布的版本有问题,可以回滚
git revert HEAD
git tag -d v1.0.2          # 删除本地标签
git push --delete origin v1.0.2  # 删除远程标签

# 重新修复后发布
npm run version:patch
```

## ❓ 常见问题

### Q: 为什么不能手动修改package.json?

A: 手动修改容易遗漏某些文件,导致版本号不一致。使用自动化脚本可以确保所有文件同步更新。

### Q: 数据库中的版本号怎么更新?

A: 有两种方式:

1. 通过系统设置界面(推荐)
2. 运行SQL: `UPDATE system_settings SET value = '1.0.2' WHERE key = 'system.version';`

### Q: 忘记了上次更新的版本怎么办?

A: 运行 `npm run version` 查看当前版本，然后根据变更类型选择合适的更新命令。

### Q: 可以同时更新多个版本吗?

A: 不建议。应该按照 Patch → Minor → Major 的顺序逐步更新,每次更新都要充分测试。

## 📞 技术支持

如遇问题,请检查:

1. Node.js 版本是否正常
2. 是否有足够的文件权限
3. Git仓库状态是否正常

---

**最后更新**: 2026-07-13
**文档版本**: 1.0.0
