# 代码格式化指南

本项目已配置 Prettier 和 ESLint 用于代码格式化和代码质量检查。

## 已安装的工具

### 前端 (client/)

- **Prettier**: 代码格式化工具
- **ESLint**: 代码质量检查工具
- **eslint-plugin-vue**: Vue文件支持
- **@vue/eslint-config-prettier**: Prettier与ESLint集成

### 后端 (server/)

- **Prettier**: 代码格式化工具
- **ESLint**: 代码质量检查工具

## 使用方法

### 前端代码格式化

```bash
cd client

# 格式化所有代码
npm run format

# 运行ESLint检查并自动修复
npm run lint
```

### 后端代码格式化

```bash
cd server

# 格式化所有代码
npm run format

# 运行ESLint检查并自动修复
npm run lint
```

## 配置文件

### Prettier配置 (.prettierrc)

- 使用分号
- 单引号
- 行宽100字符
- 2空格缩进
- 尾随逗号(es5)

### ESLint配置 (eslint.config.js)

- 前端: Vue 3推荐规则 + Prettier集成（通过 `@vue/eslint-config-prettier`）
- 后端: ESLint推荐规则（`js.configs.recommended`，未集成 Prettier）
- 前端配置浏览器全局变量（`console`、`window`、`document`、`localStorage`、`setTimeout` 等）
- 后端配置 Node.js 全局变量（`console`、`process`、`__dirname`、`__filename` 等）

### 已关闭/降级的 ESLint 规则

- 前端 (`client/eslint.config.js`):
  - `vue/multi-word-component-names`: `'off'`
  - `vue/no-v-html`: `'off'`
  - `no-unused-vars`: `'warn'`
- 后端 (`server/eslint.config.js`):
  - `no-unused-vars`: `'warn'`
  - `no-console`: `'off'`

## IDE集成建议

### VS Code

1. 安装扩展:
   - Prettier - Code formatter
   - ESLint

2. 在 `.vscode/settings.json` 中添加:

```json
{
  "editor.formatOnSave": true,
  "editor.defaultFormatter": "esbenp.prettier-vscode",
  "editor.codeActionsOnSave": {
    "source.fixAll.eslint": "explicit"
  }
}
```

### WebStorm/IntelliJ IDEA

1. 设置 → Languages & Frameworks → JavaScript → Prettier
2. 启用 "Run on save for files"

## 忽略文件

以下文件不会被格式化:

- node_modules/
- dist/
- build/
- logs/
- *.log
- .env文件
- 数据库文件

## 注意事项

1. **提交前格式化**: 建议在提交代码前运行格式化命令
2. **团队协作**: 确保团队成员使用相同的格式化配置
3. **CI/CD**: 可以在CI流程中添加lint检查步骤

## 常见问题

### Q: 格式化后代码变化很大？

A: 这是正常的，特别是第一次格式化。格式化会统一代码风格。

### Q: ESLint报告很多警告？

A: 大部分是未使用变量的警告，可以根据需要调整规则或清理代码。

### Q: 如何自定义格式化规则？

A: 修改 `.prettierrc` 文件中的配置项。
