# KEC 课程管理平台 — 部署与运维指南

> 版本 v1.0.0 · 数据库 SQLite (WAL) · 进程管理 PM2 · 反向代理 Nginx

> **部署方式说明**：项目支持两种部署方式，**主推 Docker 部署**（见 [Docker 部署指南](/kec/docker_deployment)）；
> 本文档描述 PM2 脚本部署方案（配合 `deploy.sh`），适用于无法使用 Docker 的环境。

---

## 一、环境要求

| 组件 | 要求 | 说明 |
| --- | --- | --- |
| 操作系统 | CentOS 7+ / Ubuntu 18+ / Debian 10+ | |
| Node.js | >= 20.0.0 | `engines` 强制约束 |
| npm | >= 10.0.0 | 随 Node.js 20 自带 |
| Git | 任意 | 拉取代码 |
| PM2 | 最新版 | 部署脚本自动安装 |
| Nginx | 1.18+ | 反向代理 + 静态资源 |
| sqlite3 | 可选 | 数据库完整性校验（缺失不阻塞部署） |
| 内存 | >= 2 GB | |
| 磁盘 | >= 10 GB | |

### 端口

| 端口 | 用途 |
| --- | --- |
| 80 / 443 | Nginx HTTP / HTTPS |
| 3000 | 后端 API（生产，仅内部） |
| 3002 | 后端 API（开发） |
| 5173 | Vite 开发服务器 |

---

## 二、一键部署（推荐）

```bash
# 本地部署（首次或更新）
bash deploy.sh

# 远程部署
bash deploy.sh root@your-server.com
```

### 执行流程（10 步）

| 步骤 | 操作 | 说明 |
| --- | --- | --- |
| 1/10 | 检查前置条件 | Git、Node.js >= 20、sqlite3（可选） |
| 2/10 | 创建部署目录 | 项目目录、数据目录、日志目录 |
| 3/10 | 克隆/更新代码 | 已存在则 `git reset --hard origin/main` |
| 4/10 | 安装依赖 | 智能跳过：仅依赖变化时执行 `npm ci` |
| 5/10 | 停止现有服务 | PM2 delete + 杀残留进程 + 等待端口释放 |
| 6/10 | 配置环境变量 | `.env` 已存在则跳过；否则生成随机 JWT 密钥 |
| 7/10 | 初始化数据库 | 清理 WAL → `prisma migrate deploy` → `prisma generate` → seed → 完整性验证 |
| 8/10 | 初始化系统设置 | `npm run init:settings` |
| 9/10 | 构建前端 | `vite build` → 清理 `.br` 文件 |
| 10/10 | 启动服务 | `pm2 start ecosystem.config.cjs` → `pm2 save` → 健康检查 |

### 部署后验证

```bash
curl http://localhost:3000/api/health    # 期望 200
curl http://localhost:3000/api/settings  # 期望 200
```

---

## 三、手动部署

### 1. 安装基础环境

```bash
# Node.js 20.x（CentOS）
curl -fsSL https://rpm.nodesource.com/setup_20.x | bash -
yum install -y nodejs

# PM2
npm install -g pm2

# Nginx
yum install -y epel-release && yum install -y nginx   # CentOS
# apt install -y nginx                                 # Ubuntu/Debian
systemctl enable --now nginx
```

### 2. 克隆代码

```bash
PROJECT_DIR="/opt/www/sites/kec/index/kec-manager"
mkdir -p $(dirname $PROJECT_DIR)
git clone https://gitee.com/shub77/kec-manager.git $PROJECT_DIR
cd $PROJECT_DIR
```

### 3. 安装依赖

```bash
cd server && npm install && cd ..
cd client && npm install && cd ..
```

### 4. 配置环境变量

```bash
cd server
cp .env.production.example .env

# 生成三个 JWT 密钥
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
# 执行三次，分别填入 JWT_SECRET / JWT_REFRESH_SECRET / JWT_DOWNLOAD_SECRET

vim .env
chmod 600 .env
```

### 5. 初始化数据库

```bash
cd server
rm -f data/kec.db-wal data/kec.db-shm
npx prisma migrate deploy
npx prisma generate
npm run db:seed
npm run init:settings
```

### 6. 构建前端

```bash
cd client
npm run build
```

### 7. 启动服务

```bash
cd $PROJECT_DIR
pm2 start ecosystem.config.cjs
pm2 save
pm2 startup
```

---

## 四、默认管理员账号

| 项目 | 值 |
| --- | --- |
| 用户名 | `admin` |
| 密码 | `admin@123456` |
| 角色 | super_admin |

首次登录后强制修改密码。忘记密码时重置：

```bash
cd server
FORCE_RESET=true node prisma/seed.js
```

---

## 五、PM2 进程配置

`ecosystem.config.cjs` 关键配置：

| 配置项 | 值 | 说明 |
| --- | --- | --- |
| name | `kec-server` | 进程名 |
| instances | 1 | SQLite 不支持多进程写 |
| max_memory_restart | 512M | 超限自动重启 |
| autorestart | true | 崩溃自动拉起 |
| exp_backoff_restart_delay | 100ms | 指数退避 |
| max_restarts | 10 | 防止无限重启 |
| error_file | ./logs/pm2-error.log | 与 winston 日志分离 |

```bash
# 常用操作
pm2 status
pm2 logs kec-server
pm2 restart kec-server
pm2 stop kec-server
pm2 delete kec-server
```

---

## 六、Nginx 配置

前端构建产物在 `client/dist`，Nginx 直接指向该目录。

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

    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;

    root /opt/www/sites/kec/index/kec-manager/client/dist;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }

    location /api/ {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
        client_max_body_size 10m;
    }

    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }
}
```

### HTTPS 证书

```bash
# 安装 certbot
yum install -y certbot python3-certbot-nginx   # CentOS
# apt install -y certbot python3-certbot-nginx # Ubuntu/Debian

certbot --nginx -d your-domain.com
certbot renew --dry-run
```

### 静态资源预压缩

前端构建已通过 `vite-plugin-compression` 生成 `.gz` 文件。在 Nginx http 块添加：

```nginx
gzip_static on;

gzip on;
gzip_comp_level 6;
gzip_min_length 1024;
gzip_vary on;
gzip_proxied any;
gzip_types text/plain text/css text/xml text/javascript
    application/javascript application/json application/xml
    image/svg+xml font/ttf font/otf font/woff font/woff2;
```

验证：

```bash
curl -sI -H "Accept-Encoding: gzip" https://your-domain.com/assets/index-xxxx.js | grep content-encoding
# 期望：content-encoding: gzip
```

---

## 七、环境变量说明

### 必填

| 变量 | 说明 |
| --- | --- |
| `JWT_SECRET` | JWT 签名密钥（64 位 hex） |
| `JWT_REFRESH_SECRET` | Refresh Token 签名密钥 |
| `JWT_DOWNLOAD_SECRET` | 下载令牌签名密钥 |
| `CORS_ORIGINS` | 允许的前端域名（逗号分隔） |
| `DEFAULT_SEMESTER` | 当前默认学期（如 `2025-2026-2`） |

### 可选

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `NODE_ENV` | `production` | 运行环境 |
| `DATABASE_URL` | 绝对路径 | SQLite 数据库路径 |
| `PORT` | `3000` | 后端监听端口 |
| `JWT_EXPIRES_IN` | `15m` | Access Token 有效期 |
| `JWT_REFRESH_EXPIRES_IN` | `7d` | Refresh Token 有效期 |
| `LOG_LEVEL` | `info` | 日志级别 |
| `MAX_FILE_SIZE` | `10` | 上传限制（MB） |
| `BCRYPT_ROUNDS` | `12` | bcrypt 轮数 |

### SQLite WAL（自动生效）

`server/src/lib/prisma.js` 启动时自动执行：

```sql
PRAGMA journal_mode = WAL;
PRAGMA busy_timeout = 5000;
PRAGMA synchronous = NORMAL;
```

---

## 八、更新部署

### 方式对比

| 方式 | 适用场景 | 推荐度 |
| --- | --- | --- |
| 服务器本地 `deploy.sh` | 首次部署、生产更新 | 最推荐 |
| 远程 `deploy.sh root@server` | 不便登录服务器 | 推荐 |
| 手动更新 | 故障排查、精细控制 | 备用 |

> `deploy.sh` 先停服务再迁移（安全），重复执行即为增量更新：依赖未变化时自动跳过安装，仅重新构建前端并重启服务。

### 本地更新（推荐）

```bash
cd /opt/www/sites/kec/index/kec-manager

# 备份数据库
cp server/data/kec.db server/data/kec.db.backup.$(date +%Y%m%d_%H%M%S)

# 拉取并部署
git pull
bash deploy.sh
```

### 远程更新

在本机执行，脚本通过 SSH 在服务器上完成同样的部署流程：

```bash
bash deploy.sh root@your-server-ip

# 自定义部署目录
PROJECT_DIR=/your/custom/path bash deploy.sh root@your-server-ip
```

### 手动更新

```bash
PROJECT_DIR="/opt/www/sites/kec/index/kec-manager"
cd $PROJECT_DIR

# 1. 备份
cp server/data/kec.db server/data/kec.db.backup.$(date +%Y%m%d_%H%M%S)

# 2. 拉取代码
git pull origin main

# 3. 安装依赖
cd server && npm install && cd ..
cd client && npm install && cd ..

# 4. 停止服务（释放 SQLite 写锁）
pm2 delete kec-server
sleep 2

# 5. 数据库迁移
cd server
npx prisma migrate deploy
npx prisma generate
cd ..

# 6. 构建前端
cd client && npm run build && cd ..

# 7. 启动
pm2 start ecosystem.config.cjs
pm2 save
```

### 更新前检查清单

- [ ] 已备份数据库
- [ ] 已查看变更日志（`git log --oneline`）
- [ ] 已通知用户（如有必要）
- [ ] 选择低峰期执行
- [ ] 已准备回滚方案

---

## 九、数据库备份与恢复

### 备份方式

```bash
PROJECT_DIR="/opt/www/sites/kec/index/kec-manager"

# 方式 1：sqlite3 在线备份（推荐，避免 WAL 不一致）
sqlite3 $PROJECT_DIR/server/data/kec.db \
  ".backup '$PROJECT_DIR/backups/kec_$(date +%Y%m%d).db'"

# 方式 2：直接复制（需先停服务）
cp $PROJECT_DIR/server/data/kec.db $PROJECT_DIR/backups/kec_$(date +%Y%m%d).db

# 方式 3：导出 SQL
sqlite3 $PROJECT_DIR/server/data/kec.db ".dump" > backups/backup_$(date +%Y%m%d).sql
```

### 定时备份（crontab）

```bash
#!/bin/bash
# /opt/www/sites/kec/backup.sh
DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="/opt/www/sites/kec/backups"
PROJECT_DIR="/opt/www/sites/kec/index/kec-manager"

mkdir -p $BACKUP_DIR
sqlite3 $PROJECT_DIR/server/data/kec.db ".backup '$BACKUP_DIR/kec_${DATE}.db'"
cp $PROJECT_DIR/server/.env $BACKUP_DIR/env_${DATE}

# 保留 30 天
find $BACKUP_DIR -name "*.db" -mtime +30 -delete
find $BACKUP_DIR -name "env_*" -mtime +30 -delete
```

```bash
crontab -e
# 每日凌晨 2 点
0 2 * * * /opt/www/sites/kec/backup.sh
```

### 备份策略

| 频率 | 类型 | 保留 |
| --- | --- | --- |
| 每次更新前 | 手动备份 | 永久 |
| 每天凌晨 | 定时备份 | 30 天 |
| 每周日 | 完整 SQL 导出 | 90 天 |

### 恢复

```bash
# 1. 停止服务
pm2 delete kec-server

# 2. 替换数据库
cp /path/to/backup/kec_YYYYMMDD.db $PROJECT_DIR/server/data/kec.db
rm -f $PROJECT_DIR/server/data/kec.db-wal $PROJECT_DIR/server/data/kec.db-shm

# 3. 重启
cd $PROJECT_DIR && pm2 start ecosystem.config.cjs
```

---

## 十、回滚操作

### 快速回滚

```bash
cd /opt/www/sites/kec/index/kec-manager

pm2 stop kec-server
git reset --hard HEAD~1

# 恢复数据库（如需要）
cp backups/kec_YYYYMMDD.db server/data/kec.db

pm2 delete kec-server
pm2 start ecosystem.config.cjs
pm2 save
```

### 完整回滚

```bash
pm2 delete kec-server

git log --oneline              # 找到目标 commit
git reset --hard <commit-hash>

cd server && rm -rf node_modules && npm install
cd ../client && rm -rf node_modules && npm install && npm run build

cp backups/kec_YYYYMMDD.db server/data/kec.db
cd ..
pm2 start ecosystem.config.cjs
pm2 save

# 验证
sleep 5
curl http://localhost:3000/api/health
pm2 logs kec-server --lines 20
```

---

## 十一、故障排查

### 查看日志

```bash
pm2 logs kec-server              # 实时日志
pm2 logs kec-server --err -n 50  # 最近 50 条错误
tail -f /var/log/nginx/error.log # Nginx 错误
```

### 常见问题

#### `/api/settings` 返回 500

`system_settings` 表为空：

```bash
cd server && npm run init:settings && pm2 restart kec-server
```

#### `/api/auth/login` 返回 500

`users` 表为空：

```bash
cd server && npm run db:seed && pm2 restart kec-server
```

#### Prisma 迁移报 "database is locked"

旧进程持有 SQLite 写锁：

```bash
pm2 delete kec-server
pkill -f '^node.*server/src/server\.js' 2>/dev/null || true
sleep 2
rm -f server/data/kec.db-wal server/data/kec.db-shm
cd server && npx prisma migrate deploy
```

#### Nginx 502 Bad Gateway

后端未启动或端口不对：

```bash
pm2 status
ss -tlnp | grep 3000
pm2 restart kec-server
```

#### CORS 跨域错误

```bash
grep CORS_ORIGINS server/.env   # 确认域名正确
pm2 restart kec-server
```

#### 前端 404 / 页面空白

```bash
ls client/dist/index.html       # 确认构建产物存在
nginx -t && nginx -s reload     # 确认 Nginx 配置正确
```

#### esbuild 构建失败

```bash
cd client
rm -rf node_modules/esbuild node_modules/@esbuild
npm install esbuild --no-cache
npm run build
```

#### JWT 认证异常

```bash
# 检查密钥格式（纯 hex，>= 32 字符）
grep JWT_SECRET server/.env
```

---

## 十二、运维命令速查

```bash
# 服务管理
pm2 status
pm2 logs kec-server
pm2 restart kec-server
pm2 stop kec-server

# 数据库
cd server
npm run db:seed          # 重新初始化管理员
npm run init:settings    # 初始化系统设置

# 更新
cd /opt/www/sites/kec/index/kec-manager
git pull && bash deploy.sh

# 健康检查
curl http://localhost:3000/api/health

# 查看版本
git log --oneline -3
```

---

## 十三、更新后监控

更新后 24 小时内关注：

```bash
# 服务状态
pm2 status

# 错误日志
pm2 logs kec-server --err

# 数据库大小
du -sh server/data/kec.db

# 内存使用
pm2 monit
```

---

## 十四、项目目录结构（生产）

```
/opt/www/sites/kec/index/kec-manager/
├── client/
│   ├── dist/                # 构建产物（Nginx root 指向此处）
│   ├── src/                 # 前端源码
│   └── package.json
├── server/
│   ├── data/                # SQLite 数据库文件
│   │   └── kec.db
│   ├── prisma/
│   │   └── schema.prisma
│   ├── src/
│   │   ├── routes/
│   │   ├── services/
│   │   ├── middleware/
│   │   └── app.js
│   ├── scripts/             # 运维脚本
│   ├── .env                 # 环境变量（不提交 Git）
│   └── package.json
├── logs/                    # PM2 日志
├── docs/                    # 项目文档
├── deploy.sh
├── ecosystem.config.cjs
└── README.md
```
