# KEC 课程管理平台

面向大中专职业院校教学管理人员的轻量级教学管理系统，涵盖培养方案、班级管理、教师排课、教材协调和数据导入导出等核心业务。

**版本** v1.9.1 · **架构** 前后端分离 · **部署** Docker / PM2 + Nginx

---

## 功能概览

| 模块 | 能力 |
| --- | --- |
| 培养方案 | 按专业/层次制定方案，可视化课程矩阵编辑各学期课时分布，教材关联到学期 |
| 班级管理 | 班级 CRUD、合班教学组、基于入学年份和学制动态计算年级与在读状态 |
| 教师管理 | 教师档案（含备注）、任课/学院/层次偏好配置、自定义周课时 |
| 自动排课 | 五阶段匹配 + 置换回溯 + 可选禁忌搜索优化；批量排课、排课锁定、历史学期保护 |
| 教材管理 | 教材 CRUD、与培养方案学期关联、征订状态跟踪 |
| 数据导入导出 | Excel 批量导入（班级/课程/教材/教师）、模板下载、多维度数据导出；教师导入兼容旧版“教师资格类型”列名（已更名为“备注”） |
| 统一查询 | 开课查询、教材查询、方案查询，多维度筛选与级联联动 |
| 课时统计 | 教师/班级/课程多维统计、图表可视化、Excel 导出（含教师备注） |
| 用户管理 | 用户 CRUD、禁用/激活、密码重置（重置后强制改密），仅超级管理员可用 |
| 审计日志 | 增删改全量记录，按模块/操作员/时间筛选 |
| 权限控制 | 三级角色（super_admin / admin / viewer），路由守卫 + API 鉴权双重校验 |

---

## 技术栈

| 层 | 技术 |
| --- | --- |
| 前端 | Vue 3.5 (Script Setup) + Element Plus 2.14 + Pinia 3 + Vite 6 |
| 后端 | Express 5.1 + Prisma 6.19 + Winston 3.19 |
| 数据库 | SQLite（WAL 模式，单实例部署） |
| 认证 | JWT 双令牌（Access 15min + Refresh 7d）+ HttpOnly Cookie + CSRF 双重提交 + bcrypt |
| 安全 | Helmet + 速率限制 + XSS 清洗 + 输入校验 + 审计日志 |
| 测试 | Vitest + Supertest（后端 1575 用例 / 前端 211 用例） |
| 部署 | Docker（推荐）/ PM2 进程管理 + Nginx 反向代理 + 一键部署脚本 |

---

## 快速开始

### 环境要求

- Node.js >= 20
- npm >= 10
- （可选）Docker 20.10+ / Docker Compose 2.0+（用于容器化部署）

### 方式一：Docker 部署（推荐生产环境）

```bash
git clone https://gitee.com/shub77/kec-manager.git
cd kec-manager

# 配置环境变量（务必替换三个 JWT 密钥）
cp .env.docker .env

# 构建并启动（自动执行数据库迁移与种子数据）
docker compose up -d --build

# 查看启动日志
docker compose logs -f
```

访问 http://localhost:3000，默认账户 `admin` / `admin@123456`（首次登录强制改密）。

详见 [Docker 部署指南](/kec/docker_deployment) 与 [Docker 部署检查清单](/kec/docker_checklist)。

### 方式二：本地开发启动

```bash
# 克隆仓库
git clone https://gitee.com/shub77/kec-manager.git
cd kec-manager

# 安装依赖（根目录 + server + client）
npm install
cd server && npm install && cd ..
cd client && npm install && cd ..

# 配置环境变量
cp server/.env.example server/.env
# 编辑 server/.env，生产环境需替换三个 JWT 密钥为随机 64 位 hex

# 初始化数据库
npm run db:migrate
npm run db:generate
cd server && npm run db:seed && cd ..

# 启动开发服务（前端 :5173 + 后端 :3002）
npm run dev
```

访问 http://localhost:5173，默认账户 `admin` / `admin@123456`（首次登录强制改密）。

---

## 常用命令

### 根目录

```bash
npm run dev              # 同时启动前后端
npm run dev:server       # 仅后端（:3002）
npm run dev:client       # 仅前端（:5173）
npm run db:migrate       # 数据库迁移
npm run db:generate      # 生成 Prisma Client
npm run version:patch    # 补丁版本 +1
npm run version:minor    # 次版本 +1
npm run version:major    # 主版本 +1
```

### server/

```bash
npm run dev              # --watch 自动重启
npm start                # 生产模式
npm run db:seed          # 种子数据（幂等）
npm run db:seed:dev      # 含开发测试数据
npm run db:seed:reset    # 强制重置 + 重新 seed
npm run db:reset         # 重建数据库
npm run init:settings    # 初始化系统设置
npm test                 # Vitest（71 个测试文件）
npm run test:coverage    # 覆盖率报告
npm run lint             # ESLint 检查并修复
npm run format           # Prettier 格式化
```

### client/

```bash
npm run dev              # Vite 开发服务器（:5173）
npm run build            # 生产构建
npm run preview          # 预览构建产物
npm run analyze          # 包体积分析
npm test                 # Vitest（23 个测试文件）
npm run test:coverage    # 覆盖率报告
npm run lint             # ESLint 检查并修复
npm run format           # Prettier 格式化
```

---

## 项目结构

```
kec-manager/
├── client/                          # 前端 Vue 3 + Element Plus
│   ├── src/
│   │   ├── api/                     # API 接口层（17 个模块）
│   │   ├── components/              # 公共组件（21 个）
│   │   ├── composables/             # 组合式函数（12 个）
│   │   ├── router/                  # 路由 + 三级权限守卫
│   │   ├── stores/                  # Pinia 状态（auth / settings / classData）
│   │   ├── styles/                  # 全局样式 + 设计令牌
│   │   ├── utils/                   # 工具（axios 封装、缓存、Cookie、下载）
│   │   └── views/                   # 页面视图（14 个模块目录）
│   └── vite.config.js               # 构建配置 + 分包策略
├── server/                          # 后端 Express + Prisma
│   ├── src/
│   │   ├── controllers/             # 请求处理（含 export / import / plan 子模块）
│   │   ├── middleware/              # 认证 / CSRF / XSS / 校验 / 分页 / 命名转换
│   │   ├── routes/                  # 路由定义（17 个模块）
│   │   ├── services/                # 业务逻辑
│   │   │   └── arrange/             # 排课算法（五阶段 + 禁忌搜索）
│   │   ├── constants/               # 应用常量
│   │   └── utils/                   # Excel / SSE / 排序 / 日志
│   ├── prisma/
│   │   ├── schema.prisma            # 21 个数据模型
│   │   ├── migrations/              # 迁移文件（18 次迭代）
│   │   └── seed.js                  # 种子数据
│   └── scripts/                     # 运维脚本（密码重置、数据库重建）
├── docs/                            # 项目文档
├── scripts/version.js               # 版本管理脚本
├── deploy.sh                        # 一键部署（本地/远程，PM2 方案）
├── ecosystem.config.cjs             # PM2 进程配置
├── Dockerfile                       # Docker 多阶段构建
├── docker-compose.yml               # Docker Compose 编排
├── docker-entrypoint.sh             # 容器启动脚本（权限处理）
├── .env.docker                      # Docker 环境变量模板
└── package.json                     # 根配置
```

---

## 数据模型

| 模型 | 说明 |
| --- | --- |
| `users` | 用户账户（三级角色、令牌版本、登录锁定） |
| `colleges` | 学院/系部 |
| `majors` | 专业 |
| `training_levels` | 培养层次 |
| `classes` | 班级（入学年份、学制、状态、合班组） |
| `class_combinations` | 合班教学组 |
| `courses` | 课程（名称唯一） |
| `textbooks` | 教材（书名唯一） |
| `training_plans` | 培养方案（draft / active / archived） |
| `plan_courses` | 方案课程（起止学期、周课时） |
| `plan_course_semesters` | 课程学期明细（周课时、周数） |
| `plan_textbooks` | 课程-教材关联 |
| `teachers` | 教师档案（归属学院、人员类型、备注） |
| `teacher_courses` | 教师任课关联 |
| `teacher_scheduling_colleges` | 教师上课学院意向 |
| `teacher_training_levels` | 教师培养层次意向 |
| `teaching_assignments` | 排课记录（手动/自动、锁定状态） |
| `system_settings` | 系统配置（KV 存储） |
| `audit_logs` | 审计日志 |
| `token_blacklist` | JWT 令牌黑名单 |
| `arrange_locks` | 排课并发锁（跨进程互斥） |

---

## API 概览

所有接口以 `/api` 为前缀，除登录和健康检查外均需 JWT 认证。

| 模块 | 路径 | 说明 |
| --- | --- | --- |
| 健康检查 | `/api/health` | 服务状态（公开） |
| 认证 | `/api/auth` | 登录 / 刷新令牌 / 修改密码 / CSRF 令牌 |
| 学院 | `/api/colleges` | CRUD |
| 专业 | `/api/majors` | CRUD |
| 培养层次 | `/api/training-levels` | CRUD |
| 课程 | `/api/courses` | CRUD + 导入导出 |
| 教材 | `/api/textbooks` | CRUD + 批量操作 + 导入导出 |
| 班级 | `/api/classes` | CRUD + 合班组 + 导入 |
| 培养方案 | `/api/plans` | 方案管理 + 课程矩阵 + 教材关联 |
| 教师 | `/api/teachers` | CRUD + 导入导出 |
| 排课 | `/api/teaching-arrange` | 手动/自动/批量排课 + 锁定 + SSE 进度 |
| 查询 | `/api/query` | 学期/教材/方案多维查询 |
| 导出 | `/api/export` | Excel 导出 + 模板下载 |
| 导入 | `/api/import` | Excel 批量导入 |
| 系统设置 | `/api/settings` | 学期配置 / 排课优化 / 数据重置 |
| 用户管理 | `/api/users` | 用户 CRUD + 密码重置（super_admin） |
| 审计日志 | `/api/audit` | 操作日志查询（super_admin） |
| 首页概览 | `/api/dashboard` | 统计数据 |

---

## 角色权限

| 功能 | super_admin | admin | viewer |
| --- | :---: | :---: | :---: |
| 查看数据 | ✓ | ✓ | ✓ |
| 基础数据管理（学院/专业/课程等） | ✓ | ✓ | — |
| 培养方案与排课 | ✓ | ✓ | — |
| 导入/导出 | ✓ | ✓ | — |
| 用户管理 / 系统设置 / 数据重置 | ✓ | — | — |
| 审计日志 | ✓ | — | — |

---

## 排课算法

自动排课采用**五阶段匹配 + 置换回溯**，可选叠加**禁忌搜索优化层**：

1. **意向教师分配** — 有学院/层次意向的教师严格按意向拿第一本教材
2. **无意向教师分配** — 无意向教师按课时容量拿第一本教材
3. **追加同教材班级** — 所有教师追加已持有教材的班级（不增加教材数）
4. **第二本教材分配** — 有剩余容量的教师拿第二本教材
5. **兜底放宽约束** — 剩余班级用评分制放宽匹配

关键约束：教材内聚（先拿完一本再拿下一本）、容量约束（周课时不超限）、手动排课保护（永不覆盖）、锁定保护（已锁定记录不受重置/重排影响）、合班一致性（同组共享教师）、置换回溯（链式驱逐提升分配率）。

禁忌搜索默认关闭，可通过系统设置页面动态启用。算法模块位于 `server/src/services/arrange/`。

---

## 部署

### Docker 部署（推荐）

```bash
cp .env.docker .env       # 配置环境变量（替换 JWT 密钥）
docker compose up -d --build
```

容器启动时自动执行数据库迁移与种子数据，SQLite 数据库、上传文件、日志通过 volume 持久化到宿主机。

### 脚本部署（PM2 + Nginx）

```bash
# 本地一键部署
bash deploy.sh

# 远程部署
bash deploy.sh root@your-server.com

# 自定义部署目录（默认 /opt/www/sites/kec/index/kec-manager）
PROJECT_DIR=/your/custom/path bash deploy.sh root@your-server.com
```

部署脚本自动完成：环境检查 → 代码拉取 → 依赖安装 → 停止旧服务 → 环境变量 → 数据库迁移 → 前端构建 → PM2 启动 → 健康检查。重复执行即为增量更新（依赖未变化时自动跳过安装）。

详细部署与运维指南见 [部署与运维指南](/kec/deployment) 与 [Docker 部署指南](/kec/docker_deployment)。

### 服务器最低要求

| 项目 | 配置 |
| --- | --- |
| CPU / 内存 | 1 核 / 2 GB |
| 磁盘 | 10 GB |
| 系统 | CentOS 7+ / Ubuntu 18+ / Debian 10+ |
| 软件 | Node.js 20+, Nginx 1.18+, PM2, Git（Docker 部署仅需 Docker 20.10+） |

---

## 环境变量

| 变量 | 说明 | 开发默认值 |
| --- | --- | --- |
| `NODE_ENV` | 运行环境 | `development` |
| `PORT` | 后端端口 | `3002`（生产 `3000`） |
| `DATABASE_URL` | SQLite 连接串 | `file:./data/kec.db` |
| `JWT_SECRET` | 访问令牌签名密钥 | 开发环境自动生成 |
| `JWT_REFRESH_SECRET` | 刷新令牌签名密钥 | 开发环境自动生成 |
| `JWT_DOWNLOAD_SECRET` | 下载令牌签名密钥 | 开发环境自动生成 |
| `JWT_EXPIRES_IN` | 访问令牌有效期 | `15m` |
| `JWT_REFRESH_EXPIRES_IN` | 刷新令牌有效期 | `7d` |
| `CORS_ORIGINS` | 允许的前端域名 | `http://localhost:5173` |
| `LOG_LEVEL` | 日志级别 | `debug`（生产 `info`） |
| `BCRYPT_ROUNDS` | bcrypt 迭代次数 | `12` |
| `MAX_FILE_SIZE` | 上传大小限制（MB） | `10` |
| `DEFAULT_SEMESTER` | 默认学期 | `2025-2026-2` |

> 数据库文件实际位于 `server/prisma/data/kec.db`（`file:./data/kec.db` 相对于 `prisma/schema.prisma` 解析）。

---

## 相关文档

| 文档 | 说明 |
| --- | --- |
| [部署与运维指南](/kec/deployment) | 部署、更新、备份恢复、故障排查 |
| [Docker 部署指南](/kec/docker_deployment) | Docker 部署、1Panel/OpenResty 集成、更新回滚 |
| [Docker 部署检查清单](/kec/docker_checklist) | Docker 部署验证、故障排查、安全加固 |
| [排课算法说明](/kec/scheduling_algorithm) | 五阶段算法、评分机制、教材内聚策略 |
| [排课算法审计](/kec/scheduling_algorithm_audit) | 算法审计发现与修复跟踪 |
| [学期计算说明](/kec/semester-calculation) | 学期状态计算逻辑 |
| [代码格式化指南](/kec/code_formatting) | Prettier + ESLint 配置 |
| [命名规范迁移](/kec/naming_convention_migration) | 前后端命名规范 |
| [版本管理指南](/kec/version_management) | 语义化版本与自动化脚本 |
| [微信小程序评估报告](/kec/miniprogram-assessment) | 小程序端可行性评估与 MVP 建议 |

---

## 许可证

[MIT License](LICENSE)
