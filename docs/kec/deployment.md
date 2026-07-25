# KEC 课程管理平台 - 部署与运维指南

> **版本**：v1.3.0
> **数据库**：SQLite（启用 WAL 模式）
> **部署方式**：PM2 + deploy.sh
> **部署路径**：`/opt/1panel/www/sites/kec/index/kec-manager`

---

## 一、环境要求

| 组件     | 版本 / 要求                         | 说明                                               |
| -------- | ----------------------------------- | -------------------------------------------------- |
| 操作系统 | CentOS 7+ / Ubuntu 18+ / Debian 10+ |                                                    |
| Node.js  | >= 20.0.0                           | `package.json` 中 `engines.node` 强制约束          |
| npm      | >= 10.0.0                           | 随 Node.js 20+ 自带                                |
| Git      | 任意版本                            | 用于拉取代码                                       |
| sqlite3  | 可选                                | 用于数据库完整性校验（缺失时跳过校验，不阻塞部署） |
| PM2      | 最新版                              | 进程管理，deploy.sh 会自动安装                     |
| Nginx    | 1.18+                               | 反向代理 + 静态资源服务                            |
| 内存     | >= 2GB                              | 推荐                                               |
| 磁盘     | >= 10GB                             |                                                    |
| SQLite   | 3.x                                 | 系统自带                                           |

### 端口要求

| 端口 | 用途                                 |
| ---- | ------------------------------------ |
| 80   | Nginx HTTP                           |
| 443  | Nginx HTTPS                          |
| 3000 | 后端 API（生产环境，内部不对外暴露） |

> **端口说明**：生产环境后端固定监听 **3000**（由 `deploy.sh` 写入 `.env` 的 `PORT=3000`，Nginx 反向代理转发至 3000）。开发环境后端端口由 `server/.env` 的 `PORT` 决定（默认 3000），但 `vite.config.js` 的代理目标当前为 `http://localhost:3002`，本地开发时请将 `.env` 的 `PORT` 设为 `3002` 或同步修改代理目标，使前后端端口一致。

> **数据库说明**：当前 `schema.prisma` 的 `provider = "sqlite"`，仅支持 SQLite，不推荐 MySQL。

---

## 二、默认管理员账号

| 项目   | 值                       |
| ------ | ------------------------ |
| 用户名 | `admin`                  |
| 密码   | `admin@123456`           |
| 角色   | 超级管理员 (super_admin) |

**访问地址**：

- **开发环境前端**：http://localhost:5173（Vite 开发服务器）
- **开发环境后端 API**：http://localhost:3002（`vite.config.js` 代理目标为 3002，本地开发时 `server/.env` 的 `PORT` 应设为 `3002`）
- **生产环境**：取决于 Nginx 配置的域名

> 首次登录后请立即修改默认密码。忘记密码时，可执行以下命令重置数据库：
>
> ```bash
> cd server
> # Linux
> FORCE_RESET=true node prisma/seed.js
> # Windows PowerShell
> powershell -Command "$env:FORCE_RESET='true'; node prisma/seed.js"
> ```

---

## 三、快速部署（deploy.sh）

`deploy.sh` 是生产环境主推的一键部署脚本，支持本地或远程 SSH 部署。

### 使用方法

```bash
# 本地部署（首次或更新）
bash deploy.sh

# 远程部署
bash deploy.sh root@your-server.com
```

### 部署流程（10 步）

脚本会依次执行以下步骤，任一步骤失败即中止：

| 步骤    | 操作            | 说明                                                                                 |
| ------- | --------------- | ------------------------------------------------------------------------------------ |
| [1/10]  | 检查前置条件    | Git、Node.js >=20、sqlite3（可选）                                                   |
| [2/10]  | 创建部署目录    | `PROJECT_DIR`、`server/data`、`client`、日志目录                                     |
| [3/10]  | 克隆 / 更新代码 | 已存在则 `git reset --hard origin/main`，否则 `git clone`                            |
| [4/10]  | 安装依赖        | server 与 client 均使用 `npm install`（含 devDependencies，prisma CLI / vite 需要）  |
| [5/10]  | 停止现有服务    | PM2 delete + `pkill` 残留 node 进程 + `sleep 2` 等待端口释放                         |
| [6/10]  | 配置环境变量    | `.env` 已存在则跳过；否则生成随机 JWT 密钥并写入                                     |
| [7/10]  | 初始化数据库    | 清理 WAL 残留 → `prisma migrate deploy` → `prisma generate` → `db:seed` → 完整性验证 |
| [8/10]  | 初始化系统设置  | `npm run init:settings`                                                              |
| [9/10]  | 构建前端        | 校验 esbuild → `vite build` → `npm prune --production` 清理 devDependencies          |
| [10/10] | 启动服务        | `pm2 start src/server.js --name kec-server` + 健康检查                               |

### 部署后验证

脚本会自动调用健康检查接口：

```bash
curl http://localhost:3000/api/health    # 期望返回 200
curl http://localhost:3000/api/settings  # 期望返回 200
```

---

### PM2 生态配置（ecosystem.config.cjs，可选）

项目根目录提供 `ecosystem.config.cjs`，封装了生产级 PM2 配置：

- **日志轮转**：`error_file` / `out_file` 指向 `./logs/`，`merge_logs` 合并输出
- **自动重启**：`autorestart: true` + `min_uptime: 10s` + `max_restarts: 10` + 指数退避 `exp_backoff_restart_delay`
- **内存限制**：`max_memory_restart: '512M'`，超过自动重启防止内存泄漏拖垮服务
- **单实例**：`instances: 1`（SQLite 不支持多进程写，必须单实例）

使用方式（替代 `pm2 start src/server.js`）：

```bash
cd server
pm2 start ecosystem.config.cjs
pm2 save
```

> 注意：当前 `deploy.sh` 仍使用 `pm2 start src/server.js --name kec-server` 直接启动，未接入 ecosystem 配置。如需启用，可修改 deploy.sh 的 [10/10] 启动步骤。

---

## 四、手动部署

如需精细化控制，可按以下步骤手动部署。

### 1. 安装基础环境

```bash
# 安装 Node.js 20.x（以 CentOS 为例）
curl -fsSL https://rpm.nodesource.com/setup_20.x | bash -
yum install -y nodejs

# 验证版本
node -v   # 应显示 v20.x.x
npm -v    # 应显示 10.x.x

# 安装 PM2（进程管理器）
npm install -g pm2

# 安装 Git（如未安装）
yum install -y git   # CentOS
# apt install -y git # Ubuntu/Debian
```

### 2. 安装 Nginx（如未安装）

```bash
# CentOS
yum install -y epel-release
yum install -y nginx
systemctl start nginx
systemctl enable nginx

# Ubuntu/Debian
apt update
apt install -y nginx
systemctl start nginx
systemctl enable nginx
```

### 3. 克隆代码

```bash
PROJECT_DIR="/opt/1panel/www/sites/kec/index/kec-manager"
mkdir -p $(dirname ${PROJECT_DIR})
git clone https://gitee.com/shub77/kec-manager.git ${PROJECT_DIR}
cd ${PROJECT_DIR}
```

### 4. 安装依赖

```bash
# 后端：需要 devDependencies 中的 prisma CLI 用于迁移
cd ${PROJECT_DIR}/server
npm install

# 前端：需要 devDependencies 中的 vite / esbuild 用于构建
cd ${PROJECT_DIR}/client
npm install
```

### 5. 配置环境变量

```bash
cd ${PROJECT_DIR}/server

# 生成 JWT 密钥
node -e "console.log('JWT_SECRET=' + require('crypto').randomBytes(64).toString('hex'))"
node -e "console.log('JWT_REFRESH_SECRET=' + require('crypto').randomBytes(64).toString('hex'))"
node -e "console.log('JWT_DOWNLOAD_SECRET=' + require('crypto').randomBytes(64).toString('hex'))"

# 复制模板并编辑
cp .env.production.example .env
vim .env
chmod 600 .env
```

### 6. 初始化数据库

```bash
cd ${PROJECT_DIR}/server

# 清理可能的 WAL/SHM 残留
rm -f data/kec.db-wal data/kec.db-shm 2>/dev/null || true

# 应用迁移
npx prisma migrate deploy
npx prisma generate

# 初始化种子数据
npm run db:seed

# 初始化系统设置
npm run init:settings
```

### 7. 构建前端

```bash
cd ${PROJECT_DIR}/client
npm run build

# 清理开发依赖，减少生产体积
npm prune --production
cd ${PROJECT_DIR}/server
npm prune --production
```

### 8. 启动服务

```bash
cd ${PROJECT_DIR}/server
pm2 start src/server.js --name kec-server
pm2 save
pm2 startup
```

---

## 五、Nginx 配置

前端在 `client/dist` 原地构建，Nginx `root` 直接指向该目录，不拷贝到其他位置。

```nginx
server {
    listen 80;
    server_name your-domain.com;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name your-domain.com;

    ssl_certificate     /etc/letsencrypt/live/your-domain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/your-domain.com/privkey.pem;

    # 安全头
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "0" always;

    # 前端静态文件：直接指向项目构建产物
    root /opt/1panel/www/sites/kec/index/kec-manager/client/dist;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }

    # 后端 API 反向代理（后端 3000 端口仅内部访问）
    location /api/ {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;

        # 文件上传大小限制
        client_max_body_size 10m;
    }

    # 静态资源长缓存
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }
}
```

### 配置 HTTPS（Let's Encrypt）

```bash
# 安装 certbot
yum install -y certbot python3-certbot-nginx   # CentOS
# apt install -y certbot python3-certbot-nginx # Ubuntu/Debian

# 申请并自动配置证书
certbot --nginx -d your-domain.com

# 验证自动续期
certbot renew --dry-run
```

重载 Nginx：

```bash
nginx -t && nginx -s reload
```

---

## 六、环境变量说明

### 必填项

| 变量                  | 说明                       | 示例                                                                       |
| --------------------- | -------------------------- | -------------------------------------------------------------------------- |
| `JWT_SECRET`          | JWT 签名密钥               | `node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"` |
| `JWT_REFRESH_SECRET`  | Refresh Token 签名密钥     | 同上，独立生成                                                             |
| `JWT_DOWNLOAD_SECRET` | 下载令牌签名密钥           | 同上，独立生成                                                             |
| `DEFAULT_SEMESTER`    | 当前默认学期               | `2025-2026-2`                                                              |
| `CORS_ORIGINS`        | 允许的前端域名（逗号分隔） | `https://your-domain.com,https://www.your-domain.com`                      |

### 可选项

| 变量                     | 默认值                        | 说明                                              |
| ------------------------ | ----------------------------- | ------------------------------------------------- |
| `NODE_ENV`               | `production`                  | 运行环境                                          |
| `DATABASE_URL`           | `file:.../server/data/kec.db` | SQLite 数据库路径                                 |
| `PORT`                   | `3000`                        | 后端监听端口（内部）                              |
| `JWT_EXPIRES_IN`         | `15m`                         | Access Token 有效期（不建议超过 1h）              |
| `JWT_REFRESH_EXPIRES_IN` | `7d`                          | Refresh Token 有效期                              |
| `LOG_LEVEL`              | `info`                        | 日志级别（error/warn/info/http/debug）            |
| `MAX_FILE_SIZE`          | `10`                          | 文件上传大小限制（MB）                            |
| `BCRYPT_ROUNDS`          | `12`                          | bcrypt 加密轮数（10-14 之间，值越大越安全但越慢） |

### SQLite WAL 配置（自动生效）

`server/src/lib/prisma.js` 在启动时自动应用以下 PRAGMA，无需手动配置：

```sql
PRAGMA journal_mode = WAL;          -- WAL 模式，提升并发读性能
PRAGMA busy_timeout = 5000;         -- 写锁等待 5 秒
PRAGMA synchronous = NORMAL;        -- 平衡性能与数据安全
```

---

## 七、更新部署

### 更新方式对比

| 方式                            | 适用场景                 | 复杂度 | 风险 | 推荐度 |
| ------------------------------- | ------------------------ | ------ | ---- | ------ |
| **SSH 远程部署**                | 日常更新、不便登录服务器 | 简单   | 低   | 推荐   |
| **服务器本地部署**（deploy.sh） | 首次部署、生产环境       | 简单   | 低   | 最推荐 |
| **手动更新**                    | 故障排查、精细控制       | 复杂   | 中   | 备用   |

> **deploy_ssh.sh 与 deploy.sh 的迁移时序差异**：
> `deploy_ssh.sh` 为旧版远程脚本，其执行顺序为 **"先迁移后停服务"**：在旧 PM2 进程仍持有 SQLite 连接时执行 `prisma migrate deploy`，高并发下可能触发 `SQLITE_BUSY: database is locked` 错误。
> `deploy.sh`（服务器本地部署）的顺序为 **"先停服务后迁移"**：先 `pm2 delete` 释放连接，再执行迁移，安全性更高。
> **生产环境推荐使用 `deploy.sh`**；仅在不便登录服务器时使用 `deploy_ssh.sh`，并在低峰期执行。

### 方式一：SSH 远程部署

#### 前置条件

```bash
# 检查是否已配置 SSH 密钥
ls -la ~/.ssh/id_*.pub

# 如果没有，生成密钥
ssh-keygen -t ed25519 -C "your_email@example.com"

# 复制公钥到服务器
ssh-copy-id -p 22 root@your-server-ip
```

#### 使用步骤

```bash
# 方法A：直接执行（不保存文件）
bash <(curl -s https://gitee.com/shub77/kec-manager/raw/main/deploy_ssh.sh) \
  root@your-server-ip

# 方法B：下载后执行
curl -O https://gitee.com/shub77/kec-manager/raw/main/deploy_ssh.sh
bash deploy_ssh.sh root@your-server-ip
```

**模式选项**：

```bash
# 完整部署（推荐用于版本升级）
bash deploy_ssh.sh root@your-server-ip

# 仅更新代码（快速重启，适用于小 bug 修复）
bash deploy_ssh.sh root@your-server-ip --update-only

# 仅备份数据库
bash deploy_ssh.sh root@your-server-ip --backup-only

# 自定义 SSH 端口
bash deploy_ssh.sh root@192.168.1.100 --port 2222

# 查看帮助
bash deploy_ssh.sh --help
```

执行流程：

```
[0/10] 检查 SSH 连接
[1/10] 备份数据库
[2/10] 拉取最新代码
[3/10] 安装依赖
[4/10] 数据库迁移
[5/10] 构建前端
[6/10] 重启服务
[7/10] 等待服务启动
[8/10] 健康检查
[9/10] 显示服务状态
[10/10] 显示磁盘使用情况
```

### 方式二：服务器本地部署（deploy.sh，推荐）

```bash
cd /opt/1panel/www/sites/kec/index/kec-manager

# 备份数据库（重要！）
cp server/data/kec.db server/data/kec.db.backup.$(date +%Y%m%d_%H%M%S)

# 拉取最新代码
git pull

# 执行部署脚本
bash deploy.sh
```

脚本会自动完成：拉取最新代码 → 安装依赖 → 停止旧服务 → 数据库迁移 → 构建前端 → 启动新服务。

### 方式三：手动更新

```bash
PROJECT_DIR="/opt/1panel/www/sites/kec/index/kec-manager"
cd ${PROJECT_DIR}

# 1. 备份数据库
cp server/data/kec.db server/data/kec.db.backup.$(date +%Y%m%d_%H%M%S)

# 2. 拉取代码
git fetch
git diff HEAD..origin/main --stat   # 查看变更
git pull origin main

# 3. 安装依赖
cd server && npm install
cd ../client && npm install

# 4. 停止服务（释放 SQLite 写锁，避免迁移时报 "database is locked"）
pm2 delete kec-server
sleep 2

# 5. 数据库迁移
cd ${PROJECT_DIR}/server
npx prisma migrate deploy
npx prisma generate

# 6. 构建前端
cd ${PROJECT_DIR}/client
npm run build
npm prune --production
cd ${PROJECT_DIR}/server
npm prune --production

# 7. 启动服务
pm2 start src/server.js --name kec-server
pm2 save
```

### 更新前检查清单

- [ ] 已备份数据库
- [ ] 已查看更新日志（git log）
- [ ] 已通知用户（如有必要）
- [ ] 选择在低峰期执行
- [ ] 已准备回滚方案

### 更新时机选择

| 更新类型      | 推荐时间   | 理由           |
| ------------- | ---------- | -------------- |
| 紧急 bug 修复 | 立即       | 影响用户体验   |
| 小功能更新    | 工作日晚上 | 用户较少       |
| 大版本升级    | 周末凌晨   | 最低峰期       |
| 数据库变更    | 周日凌晨   | 有充足时间回滚 |

---

## 八、数据库备份与恢复

### 自动备份

`deploy_ssh.sh` 执行时会自动备份数据库到 `/opt/1panel/www/sites/kec/index/kec-manager/backups/`，保留最近 10 个。

### 手动备份

```bash
PROJECT_DIR="/opt/1panel/www/sites/kec/index/kec-manager"

# 方法1：直接复制
cp ${PROJECT_DIR}/server/data/kec.db \
   ${PROJECT_DIR}/server/data/kec.db.backup.$(date +%Y%m%d_%H%M%S)

# 方法2：使用 sqlite3 在线备份（避免直接 cp 导致的 WAL 不一致）
sqlite3 ${PROJECT_DIR}/server/data/kec.db \
  ".backup '${PROJECT_DIR}/server/data/backup/kec_$(date +%Y%m%d).db'"

# 方法3：导出 SQL
sqlite3 ${PROJECT_DIR}/server/data/kec.db ".dump" > backup_$(date +%Y%m%d).sql

# 方法4：压缩备份
tar czf backup_$(date +%Y%m%d).tar.gz ${PROJECT_DIR}/server/data/kec.db
```

### 备份脚本（加入 crontab）

```bash
#!/bin/bash
# backup.sh
DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="/opt/1panel/www/sites/kec/index/log/kec-manager/backup"
PROJECT_DIR="/opt/1panel/www/sites/kec/index/kec-manager"

mkdir -p $BACKUP_DIR

# 使用 sqlite3 在线备份（避免直接 cp 导致的 WAL 不一致）
sqlite3 ${PROJECT_DIR}/server/data/kec.db ".backup '${BACKUP_DIR}/kec_${DATE}.db'"

# 备份 .env 配置
cp ${PROJECT_DIR}/server/.env ${BACKUP_DIR}/env_${DATE}"

# 保留最近 30 天
find $BACKUP_DIR -name "*.db" -mtime +30 -delete
find $BACKUP_DIR -name "env_*" -mtime +30 -delete

echo "Backup completed: kec_${DATE}.db"
```

```bash
crontab -e

# 每日凌晨 2 点备份
0 2 * * * /path/to/backup.sh

# 每周日凌晨 3 点完整备份（导出 SQL 并压缩）
0 3 * * 0 sqlite3 /opt/1panel/www/sites/kec/index/kec-manager/server/data/kec.db ".dump" | gzip > /opt/1panel/www/sites/kec/index/kec-manager/backups/kec_full_$(date +\%Y\%m\%d).sql.gz
```

### 备份策略建议

| 频率       | 类型     | 保留时间         |
| ---------- | -------- | ---------------- |
| 每次更新前 | 自动备份 | 永久（手动清理） |
| 每天凌晨   | 定时备份 | 30 天            |
| 每周日     | 完整备份 | 90 天            |

### 恢复数据库

```bash
PROJECT_DIR="/opt/1panel/www/sites/kec/index/kec-manager"

# 1. 停止服务
pm2 delete kec-server

# 2. 替换数据库文件
cp /path/to/backup/kec_YYYYMMDD.db ${PROJECT_DIR}/server/data/kec.db
rm -f ${PROJECT_DIR}/server/data/kec.db-wal ${PROJECT_DIR}/server/data/kec.db-shm

# 3. 恢复 .env（如需）
cp /path/to/backup/env_YYYYMMDD ${PROJECT_DIR}/server/.env

# 4. 重启服务
cd ${PROJECT_DIR}/server && pm2 start src/server.js --name kec-server
```

---

## 九、回滚操作

### 快速回滚（推荐）

```bash
# 1. 停止当前服务
pm2 stop kec-server

# 2. 恢复到上一个版本
cd /opt/1panel/www/sites/kec/index/kec-manager
git reset --hard HEAD~1

# 3. 恢复数据库（如果需要）
cp backups/kec_backup_YYYYMMDD_HHMMSS.db server/data/kec.db

# 4. 重新启动
pm2 delete kec-server
cd server && pm2 start src/server.js --name kec-server
pm2 save
```

### 完整回滚

```bash
# 1. 停止服务
pm2 stop kec-server
pm2 delete kec-server

# 2. 恢复到指定版本
cd /opt/1panel/www/sites/kec/index/kec-manager
git log --oneline  # 找到要回滚的 commit hash
git reset --hard 9f3e2a1  # 例如

# 3. 恢复依赖
cd server && rm -rf node_modules && npm install
cd ../client && rm -rf node_modules && npm install && npm run build

# 4. 恢复数据库
cp backups/kec_backup_20260613.db server/data/kec.db

# 5. 启动服务
cd ../server
pm2 start src/server.js --name kec-server
pm2 save

# 6. 验证
sleep 5
curl http://localhost:3000/api/health
pm2 logs kec-server --lines 20
```

---

## 十、故障排查

### 查看日志

```bash
# PM2 实时日志
pm2 logs kec-server

# PM2 错误日志
pm2 logs kec-server --err --lines 50

# Nginx 错误日志
tail -f /var/log/nginx/error.log
```

### 常见问题

#### Q1：登录页报 `/api/settings` 500 错误

**原因：** `system_settings` 表为空

```bash
cd /opt/1panel/www/sites/kec/index/kec-manager/server
npm run init:settings
pm2 restart kec-server
```

#### Q2：登录报 `/api/auth/login` 500 错误

**原因：** `users` 表为空（管理员账号未创建）

```bash
cd /opt/1panel/www/sites/kec/index/kec-manager/server
npm run db:seed
pm2 restart kec-server
```

#### Q3：Prisma 迁移报 "database is locked"

**原因**：旧 Node 进程仍持有 SQLite 写锁。

```bash
pm2 delete kec-server
pkill -f '^node.*server/src/server\.js' 2>/dev/null || true
sleep 2
# 清理 WAL 残留
rm -f server/data/kec.db-wal server/data/kec.db-shm
npx prisma migrate deploy
```

> `deploy.sh` 的 [5/10] 已自动处理此问题。

#### Q4：PM2 进程冲突（端口占用）

```bash
pm2 delete kec-api 2>/dev/null || true
pm2 delete kec-server 2>/dev/null || true
cd /opt/1panel/www/sites/kec/index/kec-manager/server
pm2 start src/server.js --name kec-server
pm2 save
```

#### Q5：Nginx 502 Bad Gateway

**原因：** 后端服务未启动或端口不对

```bash
pm2 status
ss -tlnp | grep 3000
pm2 restart kec-server
```

#### Q6：CORS 跨域错误

```bash
# 检查 .env 中的域名是否正确
grep CORS_ORIGINS server/.env

# 修改后重启
pm2 restart kec-server
```

#### Q7：健康检查返回非 200

```bash
# 查看 PM2 日志
pm2 logs kec-server --lines 100

# 常见原因：
# - .env 中 JWT_SECRET 未配置或过短
# - Prisma Client 未生成（npx prisma generate）
# - 数据库迁移未完成（npx prisma migrate deploy）
```

#### Q8：前端 404 / 页面空白

**原因**：Nginx `root` 未指向 `client/dist`，或前端未构建。

```bash
# 确认构建产物存在
ls /opt/1panel/www/sites/kec/index/kec-manager/client/dist/index.html

# 确认 Nginx 配置
nginx -t && nginx -s reload
```

#### Q9：esbuild 二进制异常导致前端构建崩溃

```bash
cd client
rm -rf node_modules/esbuild node_modules/@esbuild
npm install esbuild --no-cache
npm run build
```

> `deploy.sh` 的 [9/10] 已自动检测并修复此问题。

#### Q10：SSH 连接失败

```bash
# 1. 测试基本连接
ping your-server-ip

# 2. 检查 SSH 密钥
ls -la ~/.ssh/id_*.pub

# 3. 重新配置 SSH 密钥
ssh-copy-id -p 22 root@your-server-ip

# 4. 手动测试 SSH
ssh -v -p 22 root@your-server-ip
```

#### Q11：JWT 认证失败

```bash
# 检查密钥格式（应该是纯十六进制，无特殊字符）
echo $JWT_SECRET | grep -E '^[a-f0-9]+$'

# 密钥长度至少 32 字符
echo -n $JWT_SECRET | wc -c
```

#### Q12：JWT Token 过期太快

早期版本将 JWT 过期时间从 24h 改为 15m。这是**预期的安全增强**，Refresh Token 会自动刷新，用户应该无感知。如需调整：

```bash
vim server/.env
# 修改 JWT_EXPIRES_IN（不建议超过 1h）
JWT_EXPIRES_IN=30m
pm2 restart kec-server
```

---

## 十一、项目目录结构

```
/opt/1panel/www/sites/kec/index/kec-manager/
├── client/                  # 前端代码
│   ├── dist/               # 构建产物（Nginx 指向此目录）
│   ├── src/                # 前端源码
│   └── package.json
├── server/                  # 后端代码
│   ├── data/               # SQLite 数据库文件
│   │   └── kec.db
│   ├── prisma/             # 数据库 Schema 和迁移
│   │   └── schema.prisma
│   ├── src/                # 后端源码
│   │   ├── routes/         # API 路由
│   │   ├── services/       # 业务逻辑
│   │   ├── middleware/     # 中间件
│   │   └── app.js          # Express 入口
│   ├── scripts/                      # 运维脚本
│   │   ├── init-settings.js          # 初始化设置
│   │   ├── reset-database.js         # 重置数据库
│   │   └── update-admin-password.js  # 修改管理员密码
│   ├── .env                # 环境变量（不提交到 Git）
│   └── package.json
├── docs/                    # 项目文档
├── deploy.sh               # 部署脚本
└── README.md
```

---

## 十二、运维命令速查

```bash
# 服务管理
pm2 status                    # 查看状态
pm2 logs kec-server           # 查看日志
pm2 restart kec-server        # 重启服务
pm2 stop kec-server           # 停止服务

# 数据库
npm run db:seed               # 重新初始化管理员
npm run init:settings         # 初始化系统设置

# 更新
cd /opt/.../kec-manager
git pull && bash deploy.sh    # 拉取更新并部署

# 健康检查
curl http://localhost:3000/api/health

# 查看版本
git log --oneline -3
```

---

## 十三、更新后监控

**更新后 24 小时内监控：**

```bash
# 监控服务状态（每小时）
watch -n 3600 'pm2 status'

# 监控错误日志
tail -f /opt/1panel/www/sites/kec/index/log/kec-manager/error.log

# 监控数据库大小
du -sh server/data/kec.db
```

---

## 十四、更新日志

| 日期       | 版本    | 变更                                                                                                                   |
| ---------- | ------- | ---------------------------------------------------------------------------------------------------------------------- |
| 2026-07-02 | v2.17.1 | 合并 DEPLOYMENT_GUIDE / PRODUCTION_DEPLOYMENT / CONFIG_UPDATE_GUIDE / UPDATE_OPERATIONS_GUIDE / LOGIN_GUIDE 为统一文档 |
