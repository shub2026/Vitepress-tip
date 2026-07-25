# KEC 课程管理平台

> 面向大中专职业院校教学管理人员的轻量级教学管理系统

**版本** v1.3.7 · **技术栈** Vue 3 + Express 5 + Prisma 6 · **数据库** SQLite WAL

KEC (Knowledge Education Course) 涵盖培养方案、班级管理、教师排课、教材协调和数据导入导出等核心功能，采用前后端分离架构，基于 PM2 + Nginx 部署。

---

## 功能概览

| 模块         | 能力                                                                                                                              |
| ------------ | --------------------------------------------------------------------------------------------------------------------------------- |
| 培养方案     | 按专业/层次制定方案，可视化课程矩阵编辑各学期课时分布，教材关联到学期                                                             |
| 班级管理     | 班级 CRUD、合班教学组、基于入学年份和学制动态计算年级与在读状态                                                                   |
| 教师管理     | 教师档案、任课/学院/层次偏好配置、自定义周课时                                                                                    |
| 自动排课     | 五阶段匹配 + 置换回溯算法，可选禁忌搜索优化；支持预览模式、批量排课、历史学期保护；自动排课结果可锁定，锁定后重置或重新排课不覆盖 |
| 教材管理     | 教材 CRUD、与培养方案学期关联、征订状态跟踪                                                                                       |
| 数据导入导出 | Excel 批量导入（班级/课程/教材/教师）、模板下载、多维度数据导出                                                                   |
| 统一查询     | 开课查询、教材查询、方案查询，多维度筛选与级联联动                                                                                |
| 课时统计     | 教师/班级/课程多维统计、图表可视化、Excel 导出                                                                                    |
| 用户管理     | 用户 CRUD、禁用/激活、密码重置（重置后下次登录强制改密），仅超级管理员可用                                                        |
| 审计日志     | 增删改全量记录，按模块/操作员/时间筛选                                                                                            |
| 权限控制     | 三级角色（super\_admin / admin / viewer），路由守卫 + API 鉴权双重校验                                                            |

---

## 技术栈

| 层     | 技术                                                                                      |
| ------ | ----------------------------------------------------------------------------------------- |
| 前端   | Vue 3.5 (Script Setup) + Element Plus 2.14 + Pinia 3 + Vite 6                             |
| 后端   | Express 5.1 + Prisma 6.19 + Winston 3.19                                                  |
| 数据库 | SQLite（WAL 模式）                                                                        |
| 认证   | JWT 双令牌（Access 15 min + Refresh 7 d）+ HttpOnly Cookie + CSRF 双重提交 + bcrypt 12 轮 |
| 测试   | Vitest + Supertest（1405 个用例）                                                         |
| 部署   | PM2 + Nginx                                                                               |

---

## 快速开始

### 环境要求

- Node.js >= 20
- npm >= 10

### 安装与启动

```bash
# 1. 克隆仓库
git clone https://gitee.com/shub77/kec-manager.git
cd kec-manager

# 2. 安装依赖（根目录 + server + client 三处）
npm install
cd server && npm install && cd ..
cd client && npm install && cd ..

# 3. 配置环境变量
cp server/.env.example server/.env
# 编辑 server/.env，填入：
#   JWT_SECRET         — 随机 64 位 hex
#   JWT_REFRESH_SECRET — 随机 64 位 hex
#   JWT_DOWNLOAD_SECRET — 随机 64 位 hex
# 开发环境若未设置，启动时自动生成临时密钥（仅本次进程有效）

# 4. 初始化数据库
npm run db:migrate          # 执行迁移
npm run db:generate         # 生成 Prisma Client
cd server && npm run db:seed && cd ..   # 种子数据

# 5. 启动开发服务
npm run dev                 # 前端 :5173 + 后端 :3002 同时启动
```

访问 <http://localhost:5173>，默认账户：

| 用户名  | 密码           | 备注             |
| ------- | -------------- | ---------------- |
| `admin` | `admin@123456` | 首次登录强制改密 |

---

## 常用命令

> 根目录脚本代理到 `server/` 或 `client/`，切勿在错误层级执行。

### 根目录

```bash
npm run dev              # 同时启动前后端
npm run dev:server       # 仅后端
npm run dev:client       # 仅前端
npm run db:migrate       # 数据库迁移
npm run db:generate      # 生成 Prisma Client
npm run version:patch    # 补丁版本 1.3.7 → 1.3.8
npm run version:minor    # 次版本   1.3.7 → 1.4.0
npm run version:major    # 主版本   1.3.7 → 2.0.0
```

### server/

```bash
npm run dev              # --watch 自动重启，端口 3002
npm start                # 生产模式
npm run db:seed          # 种子数据
npm run db:seed:dev      # 含开发测试数据
npm run db:seed:reset    # 强制重置 + 重新 seed
npm run db:reset         # 重建数据库
npm run init:settings    # 初始化系统设置
npm run diagnose         # 数据一致性诊断
npm test                 # Vitest（62 个测试文件）
npm run test:watch       # 监听模式
npm run test:coverage    # 覆盖率报告
npm run lint             # ESLint 检查并修复
npm run format           # Prettier 格式化
```

### client/

```bash
npm run dev              # Vite 开发服务器，端口 5173
npm run build            # 生产构建
npm run preview          # 预览构建产物
npm run analyze          # 包体积分析
npm run lint             # ESLint 检查并修复
npm run format           # Prettier 格式化
```

---

## 项目结构

```
kec-manager/
├── client/                          # 前端 Vue 3 + Element Plus
│   ├── src/
│   │   ├── api/                     # API 接口（17 个模块 + 类型定义）
│   │   ├── components/              # 公共组件（21 个 + filter/ 筛选器子目录）
│   │   ├── composables/             # 组合式函数（useCrudList、useImport、useExport 等 12 个）
│   │   ├── router/                  # 路由配置 + 三级权限守卫
│   │   ├── stores/                  # Pinia 状态（auth、settings、classData）
│   │   ├── styles/                  # 全局样式 + 主题变量
│   │   ├── utils/                   # 工具（axios 封装、缓存、Cookie、下载）
│   │   └── views/                   # 页面视图（14 个模块目录 + 顶层页面）
│   └── vite.config.js               # Vite 构建 + 分包策略
├── server/                          # 后端 Express + Prisma
│   ├── src/
│   │   ├── controllers/             # 请求处理（含 export/、import/、plan/ 子模块）
│   │   ├── middleware/              # 认证 / CSRF / XSS / 校验 / 分页 / 命名转换
│   │   ├── routes/                  # 路由定义（18 个模块）
│   │   ├── services/                # 业务逻辑
│   │   │   └── arrange/             # 排课算法（五阶段 + 禁忌搜索）
│   │   ├── constants/               # 应用常量（课时设置、教材内聚、禁忌搜索参数）
│   │   └── utils/                   # Excel / SSE / 排序 / 日志工具
│   ├── prisma/
│   │   ├── schema.prisma            # 21 个数据模型
│   │   ├── migrations/              # 迁移文件
│   │   └── seed.js                  # 种子数据
│   ├── scripts/                     # 运维脚本（诊断、密码重置、数据库重建）
│   └── vitest.config.js             # 测试配置
├── docs/                            # 项目文档（6 篇）
├── scripts/version.js               # 版本管理脚本
├── deploy.sh                        # 一键部署脚本
├── deploy_ssh.sh                    # SSH 远程部署
├── ecosystem.config.cjs             # PM2 进程配置
└── package.json                     # 根配置
```

---

## 数据模型

| 模型                          | 说明                                 |
| ----------------------------- | ------------------------------------ |
| `users`                       | 用户账户（三级角色）                 |
| `colleges`                    | 学院/系部                            |
| `majors`                      | 专业                                 |
| `training_levels`             | 培养层次                             |
| `classes`                     | 班级（入学年份、学制、状态、合班组） |
| `class_combinations`          | 合班教学组                           |
| `courses`                     | 课程（名称唯一约束）                 |
| `textbooks`                   | 教材（书名唯一约束）                 |
| `training_plans`              | 培养方案                             |
| `plan_courses`                | 方案课程（起止学期、周课时）         |
| `plan_course_semesters`       | 课程学期明细（周课时、周数）         |
| `plan_textbooks`              | 课程-教材关联                        |
| `teachers`                    | 教师档案                             |
| `teacher_courses`             | 教师任课关联                         |
| `teacher_scheduling_colleges` | 教师上课学院意向                     |
| `teacher_training_levels`     | 教师培养层次意向                     |
| `teaching_assignments`        | 排课记录（手动/自动标记、锁定状态）  |
| `system_settings`             | 系统配置                             |
| `audit_logs`                  | 审计日志                             |
| `token_blacklist`             | JWT 令牌黑名单                       |
| `arrange_locks`               | 排课并发锁（跨进程互斥）             |

---

## API 接口

所有接口以 `/api` 为前缀，除登录和健康检查外均需 JWT 认证。

| 模块     | 路径                    | 说明                                          |
| -------- | ----------------------- | --------------------------------------------- |
| 健康检查 | `/api/health`           | 服务状态（公开）                              |
| 认证     | `/api/auth`             | 登录 / 刷新令牌 / 修改密码 / CSRF 令牌        |
| 学院     | `/api/colleges`         | CRUD                                          |
| 专业     | `/api/majors`           | CRUD                                          |
| 培养层次 | `/api/training-levels`  | CRUD                                          |
| 课程     | `/api/courses`          | CRUD + 导入导出                               |
| 教材     | `/api/textbooks`        | CRUD + 批量操作 + 导入导出                    |
| 班级     | `/api/classes`          | CRUD + 合班组 + 导入                          |
| 培养方案 | `/api/plans`            | 方案管理 + 课程矩阵 + 教材关联                |
| 教师     | `/api/teachers`         | CRUD + 导入导出                               |
| 排课     | `/api/teaching-arrange` | 手动 / 自动 / 批量排课 + 锁定/解锁 + SSE 进度 |
| 查询     | `/api/query`            | 学期 / 教材 / 方案多维查询                    |
| 导出     | `/api/export`           | Excel 导出 + 模板下载                         |
| 导入     | `/api/import`           | Excel 批量导入                                |
| 系统设置 | `/api/settings`         | 学期配置 / 排课优化 / 数据重置                |
| 用户管理 | `/api/users`            | 用户 CRUD + 密码重置（超级管理员权限）        |
| 审计日志 | `/api/audit`            | 操作日志查询（超级管理员）                    |
| 首页概览 | `/api/dashboard`        | 统计数据概览                                  |

---

## 角色权限

| 功能                             | super\_admin | admin | viewer |
| -------------------------------- | :----------: | :---: | :----: |
| 查看数据                         |      ✓       |   ✓   |   ✓    |
| 基础数据管理（学院/专业/课程等） |      ✓       |   ✓   |   —    |
| 培养方案与排课                   |      ✓       |   ✓   |   —    |
| 导入/导出                        |      ✓       |   ✓   |   —    |
| 用户管理 / 系统设置 / 数据重置   |      ✓       |   —   |   —    |
| 审计日志                         |      ✓       |   —   |   —    |

> 系统管理模块（用户管理、系统设置、操作日志）整体仅超级管理员可见可操作；普通管理员可访问除系统管理外的全部功能页面。

---

## 排课算法

自动排课采用 **五阶段匹配 + 置换回溯** 算法，可选叠加 **禁忌搜索优化层**：

1. **意向教师分配** — 有指定学院/层次意向的教师严格按意向拿第一本教材
2. **无意向教师分配** — 无指定意向的教师按课时容量拿第一本教材
3. **追加同教材班级** — 所有教师追加已持有教材的班级（不增加教材数）
4. **第二本教材分配** — 有剩余容量的教师拿第二本教材
5. **兜底放宽约束** — 剩余班级用评分制放宽匹配

**关键约束**：

- **教材内聚** — 所有教师先拿完第一本教材，再拿第二本，优先拿完一个学院的班级
- **容量约束** — 按周课时和教师标准/满载容量直接计算，教师课时不超限
- **手动排课保护** — 自动排课永远不覆盖手动排课记录
- **锁定保护** — 已锁定的自动排课在重置和重新排课时均保留
- **合班一致性** — 同一合班组的成员班强制共享同一教师，按逻辑教学单元计课时
- **置换回溯** — 对未分配班级尝试驱逐→递归链式置换，提升全局分配率
- **禁忌搜索（可选）** — 在贪心初始解基础上通过 Insert/Shift/Swap 邻域搜索迭代优化

算法模块位于 `server/src/services/arrange/`。禁忌搜索默认关闭，可通过系统设置页面动态启用。

---

## 部署

### 一键部署

```bash
# 本地部署
bash deploy.sh

# 远程部署
bash deploy.sh root@your-server.com

# SSH 远程部署（增量更新、备份）
bash deploy_ssh.sh root@your-server.com
```

部署脚本自动完成：环境检查 → 目录创建 → 代码拉取 → 依赖安装 → 停止旧服务 → 环境变量配置 → 数据库迁移 → 系统设置初始化 → 前端构建 → PM2 启动。

服务启动后：前端由 Nginx 代理（80 端口），后端 API 监听内部端口 3000（生产）不对外暴露，健康检查 `http://your-server:3000/api/health`。

### 服务器要求

| 项目 | 最低配置                            |
| ---- | ----------------------------------- |
| CPU  | 1 核                                |
| 内存 | 2 GB                                |
| 磁盘 | 10 GB                               |
| 系统 | CentOS 7+ / Ubuntu 18+ / Debian 10+ |
| 软件 | Node.js 20+, Nginx 1.18+, PM2, Git  |

---

## 环境变量

### 开发环境

| 变量                     | 说明             | 默认值                  |
| ------------------------ | ---------------- | ----------------------- |
| `NODE_ENV`               | 运行环境         | `development`           |
| `PORT`                   | 后端端口         | `3002`                  |
| `DATABASE_URL`           | SQLite 连接串    | `file:./data/kec.db`    |
| `JWT_SECRET`             | 访问令牌签名密钥 | 开发环境自动生成        |
| `JWT_REFRESH_SECRET`     | 刷新令牌签名密钥 | 开发环境自动生成        |
| `JWT_DOWNLOAD_SECRET`    | 下载令牌签名密钥 | 开发环境自动生成        |
| `JWT_EXPIRES_IN`         | 访问令牌有效期   | `15m`                   |
| `JWT_REFRESH_EXPIRES_IN` | 刷新令牌有效期   | `7d`                    |
| `CORS_ORIGINS`           | 允许的前端域名   | `http://localhost:5173` |
| `LOG_LEVEL`              | 日志级别         | `debug`                 |
| `BCRYPT_ROUNDS`          | bcrypt 迭代次数  | `10`                    |
| `MAX_FILE_SIZE`          | 上传文件大小限制 | `10` (MB)               |
| `DEFAULT_SEMESTER`       | 默认学期         | `2026-2027-1`           |

### 生产环境

| 变量            | 说明                                         |
| --------------- | -------------------------------------------- |
| `NODE_ENV`      | `production`                                 |
| `DATABASE_URL`  | 数据库绝对路径                               |
| `JWT_*`         | 三类密钥（随机 64 位 hex，部署脚本自动生成） |
| `CORS_ORIGINS`  | 生产域名                                     |
| `LOG_LEVEL`     | `info`                                       |
| `BCRYPT_ROUNDS` | `12`                                         |

> `DATABASE_URL` 中的 `file:./data/kec.db` 相对于 `prisma/schema.prisma` 解析，实际数据库文件位于 `server/prisma/data/kec.db`。

---

## 相关文档

| 文档                                                | 说明                               |
| --------------------------------------------------- | ---------------------------------- |
| [部署与运维指南](./deployment.md)                | 部署、更新、备份恢复、故障排查     |
| [排课算法说明](./scheduling_algorithm.md)        | 五阶段算法、评分机制、教材内聚策略 |
| [学期计算说明](./semester-calculation.md)        | 学期状态计算逻辑                   |
| [代码格式化指南](./code_formatting.md)           | Prettier + ESLint 配置             |
| [命名规范迁移](./naming_convention_migration.md) | 前后端命名规范与迁移方案           |
| [版本管理指南](./version_management.md)          | 语义化版本与自动化脚本             |

---

## 许可证

[MIT License](https://gitee.com/shub77/kec-manager/blob/main/LICENSE) — Copyright (c) 2026 Tim27
