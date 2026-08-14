# 知行笔记（本站）Docker 部署指南

::: tip 适用范围
本文档**只针对「知行笔记」文档站点本体（vitepress-tip，纯静态 VitePress）**的容器化部署。
本站**没有后端、没有数据库**，构建产物就是一堆 HTML/CSS/JS。

如果你要部署的是 **KEC 课程管理平台**（带后端服务的独立项目），请看 [KEC Docker 部署指南](/kec/docker_deployment)。两者切勿混淆。
:::

## 为什么可以 Docker 化

VitePress 本质是把 Markdown 编译成静态文件（`docs/.vitepress/dist`），运行时不需要 Node 常驻。
所以我们用**多阶段构建**：第一阶段在 Node 里 `npm run docs:build`，第二阶段把 `dist` 丢进 `nginx:alpine` 直接托管。
最终镜像只有 nginx 本体大小（几 MB），启动秒级，比在宿主机装 Node + Nginx 更干净、可移植。

## 文件清单

仓库根目录已包含以下 4 个文件：

| 文件 | 作用 |
|------|------|
| `Dockerfile` | 多阶段：node:20-alpine 构建 → nginx:alpine 托管 |
| `docker-compose.yml` | 一键编排，宿主机 `8080` → 容器 `80` |
| `nginx.conf` | `try_files $uri $uri.html $uri/` 兼容 VitePress `.html` 链接，含 gzip 与静态缓存 |
| `.dockerignore` | 排除 `node_modules`、`dist`、部署脚本，缩小构建上下文 |

## 快速开始

在装有 Docker 的服务器上：

```bash
# 克隆（或 git pull 最新）
git clone https://gitee.com/shub77/vitepress-tip.git
cd vitepress-tip

# 构建并后台启动
docker compose up -d --build

# 查看日志
docker compose logs -f
```

访问 `http://服务器IP:8080` 即可看到站点。

> 本地 Windows / macOS 即使装了 Docker Desktop 也能跑 `docker compose up -d --build` 验证，
> 但生产请放在 Linux 服务器上。

## 与现有 1Panel 静态部署的关系

你当前已经有一条静态部署链路：

```
Gitee Go 构建 → 推送 output.tar.gz → ~/gitee_go/deploy/
→ deploy-web-v2.sh (cron) 检测 → 拷贝到 /opt/1panel/www/sites/sntip/index
```

Docker 方案是**独立的一层**，二者可以：

- **并存**：容器跑在 `:8080`，1Panel 站点继续跑在 `:80/:443`，互不影响；
- **替换**：把 1Panel 站点改为「反向代理」指向容器（见下），从此用镜像发版，不再依赖 Gitee Go 推 tar 包。

## 接入域名（1Panel 反向代理）

### 方案 A：新增子域（推荐，零风险）

1. 1Panel → 网站 → 创建网站，域名填 `docker.sntip.cn`，类型选 **反向代理**；
2. 代理地址填 `http://127.0.0.1:8080`；
3. 申请 Let's Encrypt 证书并开启 HTTPS 强制跳转。

### 方案 B：用容器替换主站 sntip.cn

在 1Panel 把现有 `sntip.cn` 站点**类型改为反向代理**（不再指向静态目录），代理地址同样填 `http://127.0.0.1:8080`。
这样以后发版只需要 `docker compose up -d --build`，Gitee Go 那条链路可以停用。

### 反代配置（可直接贴进 1Panel 网站「配置文件」的 server 块）

```nginx
    # 本站是纯静态，无需 SSE / WebSocket，简单反代即可
    location / {
        proxy_pass http://127.0.0.1:8080;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
```

> gzip 已由 1Panel/OpenResty 默认开启，代理响应会自动压缩，无需额外配置。
> 若你曾为 KEC 站点配置过 `proxy_buffering off` 等 SSE 相关指令，本站用不到，保持默认即可。

## 更新与回滚

```bash
# 拉取最新文档源码
git pull origin main

# 重新构建并重启容器（新版即生效）
docker compose up -d --build
```

回滚：Docker 没有版本号概念，最简单的方式是 `git checkout <旧提交>` 后重新 `docker compose up -d --build`；
若用镜像仓库（如阿里云 ACR），可给镜像打 tag，回滚时切 tag 重启。

## 常见问题

### 页面 404 / 链接打不开

- 本站 `base: '/'`，nginx.conf 已用 `try_files $uri $uri.html $uri/` 兼容 VitePress 默认带 `.html` 的链接。
- 如果你在 `config.ts` 里把 `base` 改成子路径（如 `/docs/`），nginx 需相应调整 `location` 前缀，否则会 404。

### 端口被占用

`docker-compose.yml` 默认把宿主机 `8080` 映射到容器 `80`。若 `8080` 被占，改映射即可，例如 `"8090:80"`。
**不要**直接改成 `":80"`，会和 1Panel/OpenResty 的 80 端口冲突。

### 想换端口或加 HTTPS

静态站点本身不带 HTTPS，HTTPS 由前置的 1Panel / OpenResty 负责（见上）。容器只管 80。

## 安全与缓存

- 镜像基于 `nginx:alpine`，定期 `docker compose pull` 基础镜像并更新即可；
- nginx.conf 已对 `css/js/svg/图片` 等设 7 天缓存（`immutable`），发版后带 hash 的文件名变化会自动绕过缓存；
- 不需要 volume 持久化（静态文件全在镜像里），容器销毁重建无损。

## 参考

- [KEC 课程管理平台 Docker 部署指南](/kec/docker_deployment)（独立后端项目，非本站）
- [1Panel 部署（本站静态）](/vite/1panel-deploy)
- [Gitee Go 流水线（本站）](/vite/gitee-go-deploy)
