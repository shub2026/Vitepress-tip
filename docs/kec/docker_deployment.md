# KEC 课程管理平台 - Docker 部署指南

## 概述

Docker 部署方案采用**多阶段构建**，将前端构建产物直接打包进后端镜像，形成一个完整的单容器应用。这种方式的优势：

- **简化部署**：无需在服务器上安装 Node.js、npm、PM2 等工具
- **环境一致性**：开发、测试、生产环境完全一致
- **快速回滚**：只需切换镜像标签即可回滚到任意版本
- **资源隔离**：容器化运行，不影响宿主机其他服务

> 本方案与 PM2 脚本部署（见 [部署与运维指南](/kec/deployment)）互不影响，可按环境自由选择。

## 架构说明

```
┌─────────────────────────────────────┐
│         Docker Container            │
│  ┌───────────────────────────────┐  │
│  │   Node.js 20 Alpine           │  │
│  │  ┌─────────────────────────┐  │  │
│  │  │ Express Server (:3000)  │  │  │
│  │  │  - API Routes (/api)    │  │  │
│  │  │  - Static Files (/)     │  │  │
│  │  └─────────────────────────┘  │  │
│  │         ↓                      │  │
│  │  SQLite (WAL mode)            │  │
│  └───────────────────────────────┘  │
│              ↕ (volume mount)        │
└─────────────────────────────────────┘
         ↓
   Host: ./data, ./uploads, ./logs
```

前端静态资源的缓存策略由应用层控制：

- 带 hash 的 JS/CSS 资源：`Cache-Control: public, max-age=1y, immutable`
- `index.html`：`no-cache`（每次验证，保证发版后用户立即拿到新入口文件）

因此 Nginx 层**不需要**额外配置静态缓存，也**不要**启用 `proxy_cache`（会破坏 SSE 排课进度推送）。

## 快速开始

### 1. 环境要求

- Docker 20.10+
- Docker Compose 2.0+
- 至少 1GB 可用内存（构建时需要约 1.5GB，小内存服务器建议临时加 swap）

### 2. 克隆项目

```bash
git clone https://gitee.com/shub77/kec-manager.git
cd kec-manager
```

### 3. 配置环境变量

```bash
# 复制环境变量模板
cp .env.docker .env

# 编辑 .env 文件，必须修改以下内容：
vim .env
```

**必须修改的配置项：**

```bash
# 生成 JWT 密钥（执行以下命令 3 次，生成 3 个不同的密钥）
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"

# 将生成的密钥填入 .env
JWT_SECRET=<第一个密钥>
JWT_REFRESH_SECRET=<第二个密钥>
JWT_DOWNLOAD_SECRET=<第三个密钥>

# 修改为你的实际域名（多个来源用英文逗号分隔）
CORS_ORIGINS=https://your-domain.com,https://www.your-domain.com

# 修改为当前学期
DEFAULT_SEMESTER=2025-2026-2
```

**国内服务器额外配置（重要）：**

`docker-compose.yml` 中基础镜像通过 `NODE_IMAGE` 变量控制，默认官方 `node:20-alpine`。国内网络访问 Docker Hub 不稳定，**强烈建议**在 `.env` 中配置镜像加速地址：

```bash
# .env 不会被 git 提交，可安全存放个人专属加速地址
NODE_IMAGE=<你的镜像加速地址>/library/node:20-alpine
```

> ⚠️ **关键认知**：Docker BuildKit **不会**读取 `/etc/docker/daemon.json` 中配置的 `registry-mirrors`。
> 即使 `docker pull` 走加速正常，`docker compose build` 解析基础镜像时仍会直连 Docker Hub 并可能长时间卡死在 `Building 0.0s (0/0)`。
> 必须通过 `NODE_IMAGE` 把加速地址显式传给构建过程（`.env` 方案不污染仓库）。

### 4. 构建并启动

```bash
# 构建镜像（首次约需 3-5 分钟，依赖缓存命中后约 30 秒）
docker compose build

# 启动服务（后台运行）
docker compose up -d

# 查看启动日志
docker compose logs -f
```

### 5. 验证部署

```bash
# 检查容器状态（应为 healthy）
docker compose ps

# 测试健康检查接口
curl http://localhost:3000/api/health

# 预期输出：
# {"status":"ok","timestamp":"...","database":"connected"}

# 验证首页 Content-Type（必须是 text/html）
curl -s -D - -o /dev/null http://localhost:3000/ | grep -i content-type
```

访问 http://localhost:3000，使用默认账户登录：
- 用户名：`admin`
- 密码：`admin@123456`（首次登录需修改密码）

## 生产环境部署

### 在 1Panel 上部署（推荐）

1Panel 使用 OpenResty 作为 Web 服务器。核心思路：**网站不做静态托管，只做 HTTPS 终结 + 反向代理到容器**。

**步骤 1：通过 Docker Compose 启动应用**

```bash
cd /path/to/kec-manager
cp .env.docker .env
vim .env  # 修改配置（含 NODE_IMAGE）
docker compose up -d --build
```

**步骤 2：在 1Panel 创建网站**

1. 打开 1Panel 控制台 → 网站 → 创建网站
2. 填写域名：`your-domain.com`
3. 选择类型：`静态网站`（仅用于生成站点配置和申请证书，实际不做静态托管）
4. 点击创建

**步骤 3：申请 SSL 证书**

网站 → your-domain.com → HTTPS → Let's Encrypt → 申请证书，并开启 HTTP 强制跳转。

**步骤 4：修改网站配置为反向代理**

进入 网站 → your-domain.com → 配置文件，在 `server {}` 块中：

1. **删除** `root /www/sites/xxx/index;`、`index ...;` 等静态托管指令
2. **添加**以下内容：

```nginx
    # 文件上传大小限制（应用允许 10MB，留余量；不配置会 413）
    client_max_body_size 15M;

    # 反向代理到 Docker 容器
    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        # 用 $remote_addr 覆盖而非追加，防止伪造 XFF 绕过应用层限流
        proxy_set_header X-Forwarded-For $remote_addr;
        proxy_set_header X-Forwarded-Proto $scheme;

        # SSE 支持（排课进度推送），必须禁用缓冲和缓存
        proxy_buffering off;
        proxy_cache off;

        # 排课耗时较长，放宽超时
        proxy_connect_timeout 60s;
        proxy_send_timeout 120s;
        proxy_read_timeout 120s;
    }
```

保存后在 1Panel 中重载 OpenResty。

> ⚠️ **常见错误**：不要把 `location` 块放进 `/usr/local/openresty/nginx/conf/conf.d/*.conf`
> 单独文件（那是 http 层级，会报 `location directive is not allowed here`），
> 必须写在网站自己的 `server {}` 块里。
> 1Panel 的 nginx 二进制不在 PATH，验证配置用 1Panel 界面的重载按钮，或
> `docker exec 1panel-openresty nginx -t`（按实际容器名调整）。

**关于 gzip**：1Panel OpenResty 主配置默认已启用动态 gzip，代理响应会被自动压缩，无需额外配置。
（Vite 构建产物的 `.gz` 预压缩文件在反向代理模式下由 nginx 动态压缩替代，效果接近。）

### 传统 Nginx 反向代理（非 1Panel 环境）

```nginx
# /etc/nginx/conf.d/kec.conf

server {
    listen 80;
    server_name your-domain.com;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name your-domain.com;

    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;

    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_prefer_server_ciphers off;
    ssl_session_cache shared:SSL:10m;
    ssl_session_timeout 1d;
    ssl_session_tickets off;

    add_header Strict-Transport-Security "max-age=63072000" always;

    client_max_body_size 15M;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $remote_addr;
        proxy_set_header X-Forwarded-Proto $scheme;

        # SSE 支持
        proxy_buffering off;
        proxy_cache off;

        proxy_connect_timeout 60s;
        proxy_send_timeout 120s;
        proxy_read_timeout 120s;
    }
}
```

重载 Nginx：

```bash
nginx -t
systemctl reload nginx
```

### 配置 Systemd 服务（可选）

让 Docker Compose 随系统启动（compose 中已有 `restart: unless-stopped`，Docker 服务自启时容器也会自启，此步骤非必须）：

```bash
cat > /etc/systemd/system/kec-manager.service << 'EOF'
[Unit]
Description=KEC Manager Docker Compose
Requires=docker.service
After=docker.service

[Service]
Type=oneshot
RemainAfterExit=yes
WorkingDirectory=/path/to/kec-manager
ExecStart=/usr/bin/docker compose up -d
ExecStop=/usr/bin/docker compose down
TimeoutStartSec=300

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable kec-manager.service
```

## 数据持久化

### Volume 说明

docker-compose.yml 中配置了 3 个持久化卷：

| 卷名 | 容器路径 | 用途 |
|------|---------|------|
| `./data` | `/app/server/data` | SQLite 数据库文件 |
| `./uploads` | `/app/server/uploads` | 用户上传的文件 |
| `./logs` | `/app/server/logs` | 应用日志（Winston） |

### 备份数据

```bash
# SQLite WAL 模式：先 checkpoint 再复制，保证备份完整
docker compose exec kec-manager sh -c \
  'sqlite3 /app/server/data/kec.db "PRAGMA wal_checkpoint(TRUNCATE);"' \
  2>/dev/null || true

cp ./data/kec.db /backup/kec/kec_$(date +%Y%m%d_%H%M%S).db
```

定时备份可加入 crontab（每天凌晨 2 点）：

```
0 2 * * * cd /path/to/kec-manager && ./backup.sh
```

### 恢复数据

```bash
# 1. 停止容器
docker compose stop

# 2. 备份当前数据库（以防万一）
cp ./data/kec.db ./data/kec.db.bak.$(date +%Y%m%d)

# 3. 替换数据库文件（若源库为 WAL 模式，先做 wal_checkpoint 再复制）
cp /path/to/restored.db ./data/kec.db

# 4. 清理残留的 WAL/SHM 文件（避免旧 WAL 污染新库）
rm -f ./data/kec.db-wal ./data/kec.db-shm

# 5. 启动容器（自动执行 migrate）
docker compose up -d
```

## 更新部署

### 更新到最新版本

```bash
git pull origin main

# 重新构建并重启（自动执行数据库迁移）
docker compose up -d --build
```

> 仅修改业务代码时构建约 30 秒（依赖层命中缓存）；
> 修改 `package.json` 增删依赖时会重新安装依赖，约需 1-2 分钟。

### 回滚到特定版本

```bash
git checkout <目标版本>
docker compose up -d --build
```

## 监控与维护

### 查看日志

```bash
# 实时查看日志
docker compose logs -f

# 查看最近 100 行
docker compose logs --tail 100

# 查看应用日志文件
docker compose exec kec-manager tail -f /app/server/logs/app.log
```

### 监控容器状态

```bash
docker stats kec-manager
docker inspect --format='{{.State.Health.Status}}' kec-manager
```

### 磁盘清理注意

```bash
# ✅ 安全：只清理悬空镜像和停止的容器
docker system prune

# ❌ 危险：会删除基础镜像（如 node:20-alpine），
# 下次构建又要重新联网拉取，国内网络可能再次卡死
docker system prune -a
```

## 故障排查

### 构建卡在 `Building 0.0s (0/0)` 不动

BuildKit 正在联网解析基础镜像但网络不通（Docker Hub 或加速源不可达）。

```bash
# 1. Ctrl+C 中断
# 2. 检查本地是否已有基础镜像
docker images | grep node

# 3a. 有 → 离线构建
docker compose build --build-arg NODE_IMAGE=node:20-alpine --pull=never

# 3b. 没有 → 换一个可用的加速源重新拉取，再配进 .env
docker pull <加速地址>/library/node:20-alpine
```

根治方案：在 `.env` 配置稳定的 `NODE_IMAGE`（专属加速域名或自己的阿里云 ACR 仓库）。

### 浏览器显示 HTML 源码

检查响应的 Content-Type：

```bash
# 注意：必须用 GET 请求验证（curl -I 是 HEAD，行为不同）
curl -s -D - -o /dev/null http://127.0.0.1:3000/ | grep -i content-type
```

- 返回 `text/html` 但浏览器仍显示源码 → **浏览器缓存了旧的错误响应**，
  Network 面板会显示 304。解决：`Ctrl+F5` 强制刷新或无痕窗口访问
- 返回 `application/json` → 服务端问题，检查是否部署了最新代码：
  `docker compose exec kec-manager cat /app/server/src/app.js | grep -A 2 "仅对 API"`

### 上传文件报 413

Nginx 未配置 `client_max_body_size`（默认仅 1MB），按上文配置为 `15M` 后重载。

### API 请求被 CSP 拦截

浏览器 Console 报 `violates Content Security Policy`。确认部署了最新代码
（CSP 已适配 SPA 同源部署，`connect-src 'self'` 放行 `/api` 请求）。
注意 CSP 只约束浏览器，微信小程序不受影响。

### 容器启动失败 / 反复重启

```bash
# 查看详细错误
docker compose logs --tail 50

# 检查环境变量是否正确注入
docker compose config

# 检查端口占用
ss -tlnp | grep 3000
```

### 数据库锁定

如果出现 "database is locked" 错误：

```bash
docker compose exec kec-manager sh -c \
  'sqlite3 /app/server/data/kec.db "PRAGMA wal_checkpoint(TRUNCATE);"'
```

### 内存不足（小内存服务器）

构建时 Docker 守护进程崩溃（报 EOF）或容器被 OOM 杀死：

```bash
# 检查 OOM 记录
dmesg | grep -i oom
free -h

# 临时加 swap
fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile

# 构建前可先停掉其他非关键容器释放内存
```

## 常见问题

**Q: 为什么不用 docker-compose 编排独立的 Nginx 容器？**
A: 单容器方案更简单，适合中小型部署。服务器上的 1Panel/OpenResty 已承担 HTTPS 和反代职责，无需再套一层。

**Q: SQLite 适合 Docker 部署吗？**
A: 适合。SQLite 通过 volume 挂载持久化，性能与直接部署无异。但注意不要同时运行多个容器实例（SQLite 不支持并发写入）。

**Q: 如何扩展为多实例部署？**
A: 需要将数据库切换为 MySQL/PostgreSQL，然后可以运行多个容器实例配合负载均衡。

**Q: 容器重启后数据会丢失吗？**
A: 不会。数据库、上传文件、日志都通过 volume 挂载到宿主机，容器重启不影响数据。

**Q: Docker 部署和 PM2 部署可以混用吗？**
A: 可以。两种部署方式共用同一套代码，互不影响。切换时注意：同一时间只能运行一个实例（端口和 SQLite 独占），切换前先停掉另一个。

**Q: 为什么 daemon.json 配了镜像加速，构建还是卡？**
A: BuildKit 不继承 daemon.json 的 `registry-mirrors`。请通过 `.env` 的 `NODE_IMAGE` 显式指定加速地址（见「快速开始 - 国内服务器额外配置」）。

## 安全建议

1. **修改默认密码**：首次登录后立即修改 admin 密码
2. **生成强 JWT 密钥**：使用 64 位随机 hex 字符串
3. **限制 CORS 域名**：仅允许信任的域名
4. **配置 HTTPS**：生产环境必须使用 HTTPS
5. **定期备份**：配置自动备份脚本
6. **谨慎清理磁盘**：不要使用 `docker system prune -a`
7. **XFF 覆盖而非追加**：Nginx 用 `proxy_set_header X-Forwarded-For $remote_addr;`，配合应用层限流防 IP 伪造

## 参考链接

- [Docker 官方文档](https://docs.docker.com/)
- [Docker Compose 官方文档](https://docs.docker.com/compose/)
- [项目 README](/kec/kec-manager)
- [部署与运维指南](/kec/deployment)
