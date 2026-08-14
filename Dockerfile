# ---- 构建阶段 ----
FROM node:20-alpine AS build
WORKDIR /app
# VitePress 的 lastUpdated 功能依赖 git 获取文件最后提交时间
RUN apk add --no-cache git
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run docs:build

# ---- 运行阶段 ----
FROM nginx:alpine
# 自定义 nginx 配置，兼容 VitePress 的 .html / 目录式访问
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/docs/.vitepress/dist /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
