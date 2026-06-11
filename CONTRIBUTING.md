# 贡献指南 · Contributing

欢迎贡献！提交 PR 前请过一遍下面几条。

## 开发

```bash
pnpm install            # 需要 Node ≥ 20、pnpm（仓库已 pin pnpm@11）
pnpm dev                # 客户端 + 服务器
pnpm lint && pnpm typecheck && pnpm test   # 提交前必过（CI 也会跑这三项）
```

## 两条硬规矩

1. **绝不提交任何游戏版权素材**：`.mix/.shp/.vxl/.pal/.hva/.aud` 以及从原版提取的图像/音频
   一律不入库（`game-data/` 已 gitignore）。本仓库只放原创代码。
2. **`packages/game` 必须保持确定性**（锁步联机的根基）：禁用 `Math.random`、`Date`、
   `performance.now`、`Math.sin/cos/sqrt/atan2`——用 sim 内的种子 PRNG 与查表三角；
   整数 lepton 坐标。ESLint 会拦截，跨环境状态哈希测试兜底。

## 约定

- TypeScript strict；提交保持 `pnpm lint`/`typecheck`/`test` 全绿。
- 注释/文案中英文皆可，与周围代码风格一致即可。
- 新单位/建筑等数据驱动，未实现的逻辑不要进建造栏（避免半残玩法）。

## 报告问题

开 Issue 时尽量附：复现步骤、浏览器/设备、是否联机、控制台报错。
