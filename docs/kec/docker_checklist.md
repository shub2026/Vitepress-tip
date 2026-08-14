# Docker 部署检查清单

## 已修复的问题

### 1. Dockerfile 关键修复 ✓

- [x] **添加 Prisma 文件复制** - 生产镜像现在包含 `schema.prisma` 和 `migrations/`，确保 `prisma migrate deploy` 可执行
- [x] **安装 wget 和 curl** - Alpine 镜像默认没有 wget，健康检查需要
- [x] **添加 init:settings 命令** - 启动时初始化系统设置（current_semester 等）
- [x] **非 root 用户运行** - 创建 `nodejs` 用户（UID 1001），提升安全性
- [x] **移除 PM2 配置** - Docker 部署不需要 `ecosystem.config.cjs`

### 2. 上传目录持久化 ✓

**问题**：multer 使用 `os.tmpdir()` 存储上传文件，容器重启后丢失

**修复**：
- `import-shared.js` 新增 `UPLOAD_DIR` 环境变量支持
- `docker-compose.yml` 添加 `UPLOAD_DIR=/app/server/uploads`
- Volume 挂载 `./uploads:/app/server/uploads` 确保持久化

### 3. docker-compose.yml 优化 ✓

- [x] **添加 env_file** - 支持从 `.env` 文件加载敏感配置（JWT 密钥等）
- [x] **添加 UPLOAD_DIR** - multer 临时文件指向持久化卷
- [x] **完善注释** - 每个 volume 和环境变量都有清晰说明

### 4. 静态文件托管中间件 ✓

- [x] **新增 `static-files.js`** - 生产环境自动托管前端构建产物
- [x] **SPA fallback** - 非 API 路由返回 `index.html`
- [x] **智能路径查找** - 支持 Docker 和 PM2 两种部署路径

## 部署前必须检查

### 环境变量配置

```bash
# 1. 复制环境变量模板
cp .env.docker .env

# 2. 生成 JWT 密钥（执行 3 次，生成 3 个不同的密钥）
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"

# 3. 编辑 .env 文件，必须修改：
vim .env
```

**必须修改的配置项：**

| 变量 | 说明 | 示例 |
|------|------|------|
| `JWT_SECRET` | 访问令牌密钥 | 随机 128 位 hex |
| `JWT_REFRESH_SECRET` | 刷新令牌密钥 | 随机 128 位 hex |
| `JWT_DOWNLOAD_SECRET` | 下载令牌密钥 | 随机 128 位 hex |
| `CORS_ORIGINS` | 允许的前端域名 | `https://your-domain.com` |
| `DEFAULT_SEMESTER` | 当前学期 | `2025-2026-2` |

### 目录权限

```bash
# 确保数据目录存在且权限正确
mkdir -p data uploads logs
chmod 755 data uploads logs

# 如果使用非 root 用户运行 Docker
chown -R 1001:1001 data uploads logs
```

## 构建验证

```bash
# 1. 构建镜像（启用 BuildKit 加速）
export DOCKER_BUILDKIT=1
docker compose build

# 2. 检查镜像大小（预期约 300-400MB）
docker images kec-manager

# 3. 启动容器
docker compose up -d

# 4. 查看启动日志（确认迁移和种子执行成功）
docker compose logs -f

# 5. 等待健康检查通过（约 30-40 秒）
docker inspect --format='{{.State.Health.Status}}' kec-manager

# 6. 验证健康检查接口
curl http://localhost:3000/api/health
# 预期输出：{"status":"ok","timestamp":"...","database":"connected"}

# 7. 验证前端页面
curl -I http://localhost:3000/
# 预期：HTTP/1.1 200 OK, Content-Type: text/html
```

## 1Panel / OpenResty 配置

### 网站配置

1. 在 1Panel 创建网站，选择 **纯静态** 类型
2. 申请 SSL 证书（Let's Encrypt）
3. 替换网站配置为以下内容：

```nginx
server {
    listen 80;
    server_name your-domain.com;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name your-domain.com;

    # 1Panel 自动生成的 SSL 证书路径（根据实际修改）
    ssl_certificate     /opt/1panel/apps/openresty/openresty/conf/conf.d/ssl/your-domain.com/fullchain.pem;
    ssl_certificate_key /opt/1panel/apps/openresty/openresty/conf/conf.d/ssl/your-domain.com/privkey.pem;

    # 安全头（Nginx 层面）
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header Strict-Transport-Security "max-age=63072000" always;

    client_max_body_size 10M;

    # 反向代理到 Docker 容器
    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        
        # 重要：使用 $remote_addr 确保限流正确识别真实 IP
        proxy_set_header X-Forwarded-For $remote_addr;
        proxy_set_header X-Forwarded-Proto $scheme;
        
        # SSE 支持（排课进度推送）
        proxy_buffering off;
        proxy_cache off;
        
        # 超时配置（排课算法可能需要较长时间）
        proxy_connect_timeout 60s;
        proxy_send_timeout 120s;
        proxy_read_timeout 120s;
    }
}
```

### 启用 gzip 压缩

在 1Panel → OpenResty → 配置修改，在 `http {}` 块中添加：

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

## 常见问题排查

### 1. 容器启动失败：Prisma 迁移失败

```bash
# 查看详细错误
docker compose logs | grep -i prisma

# 常见原因：
# - 数据库文件被锁定（另一个容器实例正在运行）
# - 磁盘空间不足
# - SQLite 文件损坏

# 解决方案：
docker compose down
rm -f data/kec.db-wal data/kec.db-shm
docker compose up -d
```

### 2. 健康检查失败：wget 未找到

```bash
# 检查镜像是否正确构建
docker run --rm kec-manager wget --version

# 如果 wget 不存在，重新构建镜像
docker compose build --no-cache
docker compose up -d
```

### 3. 上传文件丢失

```bash
# 检查 UPLOAD_DIR 环境变量
docker compose exec kec-manager printenv UPLOAD_DIR
# 预期输出：/app/server/uploads

# 检查 volume 挂载
docker inspect kec-manager | grep -A 5 Mounts

# 检查目录权限
docker compose exec kec-manager ls -la /app/server/uploads
```

### 4. 前端页面 404

```bash
# 检查前端构建产物
docker compose exec kec-manager ls -la /app/client/dist

# 检查静态文件中间件日志
docker compose logs | grep -i static

# 如果 dist 目录不存在，重新构建
docker compose build --no-cache
```

### 5. 排课进度不更新（SSE 问题）

```bash
# 检查 Nginx 是否禁用缓冲
# 在 1Panel 网站配置中确认有：proxy_buffering off;

# 测试 SSE 接口
curl -N -H "Accept: text/event-stream" \
  http://localhost:3000/api/teaching-arrange/progress
```

### 6. 数据库迁移卡住

```bash
# 进入容器手动检查
docker compose exec kec-manager sh

# 查看迁移状态
npx prisma migrate status

# 如果有未完成的迁移，手动应用
npx prisma migrate deploy

# 退出并重启
exit
docker compose restart
```

## 数据备份

### 自动备份脚本

```bash
#!/bin/bash
# backup-kec.sh

BACKUP_DIR="/backup/kec"
DATE=$(date +%Y%m%d_%H%M%S)
mkdir -p "$BACKUP_DIR"

# 备份数据库（SQLite 支持在线备份）
sqlite3 ./data/kec.db ".backup '$BACKUP_DIR/kec_$DATE.db'"

# 压缩备份
gzip "$BACKUP_DIR/kec_$DATE.db"

# 保留最近 30 天的备份
find "$BACKUP_DIR" -name "kec_*.db.gz" -mtime +30 -delete

echo "备份完成: $BACKUP_DIR/kec_$DATE.db.gz"
```

### 添加到 crontab

```bash
# 每天凌晨 2 点自动备份
0 2 * * * /path/to/backup-kec.sh >> /var/log/kec-backup.log 2>&1
```

## 更新部署

```bash
# 1. 拉取最新代码
git pull origin main

# 2. 重新构建镜像
docker compose build

# 3. 重启服务（自动执行迁移）
docker compose up -d

# 4. 查看更新日志
docker compose logs --tail 100

# 5. 验证健康检查
curl http://localhost:3000/api/health
```

## 回滚方案

```bash
# 1. 切换到目标版本
git checkout v1.0.0

# 2. 重新构建并启动
docker compose build
docker compose up -d

# 3. 如果需要回滚数据库，使用备份恢复
# 参见"数据备份"章节
```

## 安全加固

### 1. 资源限制

在 `docker-compose.yml` 中添加：

```yaml
services:
  kec-manager:
    # ... 其他配置
    deploy:
      resources:
        limits:
          cpus: '1.0'
          memory: 1G
        reservations:
          cpus: '0.5'
          memory: 512M
```

### 2. 只读文件系统

```yaml
services:
  kec-manager:
    # ... 其他配置
    read_only: true
    tmpfs:
      - /tmp
```

### 3. 网络隔离

```yaml
services:
  kec-manager:
    # ... 其他配置
    networks:
      - kec-net

networks:
  kec-net:
    driver: bridge
```

## 监控建议

### 日志轮转

```bash
# 创建 logrotate 配置
cat > /etc/logrotate.d/kec-manager << 'EOF'
/path/to/kec-manager/logs/*.log {
    daily
    rotate 7
    compress
    delaycompress
    missingok
    notifempty
    create 0644 nodejs nodejs
}
EOF
```

### 容器监控

```bash
# 实时查看资源使用
docker stats kec-manager

# 查看容器详细信息
docker inspect kec-manager

# 查看健康检查历史
docker inspect --format='{{json .State.Health}}' kec-manager | jq
```

## 验证清单

部署完成后，逐项检查：

- [ ] 容器状态为 `running`
- [ ] 健康检查状态为 `healthy`
- [ ] `/api/health` 返回 200
- [ ] 前端首页可访问
- [ ] 登录功能正常
- [ ] 文件上传成功（检查 `./uploads` 目录）
- [ ] 日志文件生成（检查 `./logs` 目录）
- [ ] 数据库文件存在（检查 `./data/kec.db`）
- [ ] Nginx 反向代理配置正确
- [ ] HTTPS 证书有效
- [ ] 自动备份脚本已配置

## 联系支持

如遇到问题，请提供以下信息：

1. `docker compose logs` 输出
2. `docker inspect kec-manager` 输出
3. `.env` 文件内容（脱敏后）
4. 服务器操作系统版本
5. Docker 和 Docker Compose 版本
