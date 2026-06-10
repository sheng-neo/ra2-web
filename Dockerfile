# 网页版红警2 —— 单容器部署：构建客户端 + 在同端口托管客户端与对战服务器。
FROM node:22-slim AS build
WORKDIR /app
RUN corepack enable
COPY pnpm-workspace.yaml package.json tsconfig.base.json ./
COPY packages/data/package.json packages/data/
COPY packages/game/package.json packages/game/
COPY packages/client/package.json packages/client/
COPY packages/server/package.json packages/server/
RUN pnpm install --frozen-lockfile=false
COPY . .
RUN pnpm --filter @ra2web/client build

FROM node:22-slim AS run
WORKDIR /app
RUN corepack enable
ENV NODE_ENV=production
# 仅带运行服务器所需（含已构建的 client/dist 静态资源）
COPY --from=build /app /app
EXPOSE 8080
ENV PORT=8080
ENV STATIC_DIR=/app/packages/client/dist
CMD ["pnpm", "--filter", "@ra2web/server", "start"]
