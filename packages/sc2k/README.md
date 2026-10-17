# sc2k —— 网页版模拟城市 2000 复刻（原创实现）

`packages/sc2k` 是 `ra2-web` 单仓库中的一个独立包：以 1990 年代经典城市模拟游戏的 Win95 特别版为蓝本，用 TypeScript + PixiJS v8 在浏览器中复刻其模拟规则与等距渲染。**本包只含原创代码与原创占位美术**。

## 版权声明

- 本仓库**不包含**任何原版游戏文件、精灵、调色板、音频或文本；程序化占位美术与全部玩家可见文案均为原创（CI 用关键词黑名单扫描 `tools/strings-scan.ts`）。
- 玩家可以在页面内导入**自己合法拥有**的游戏文件（`.DAT` 精灵库、`PAL_MSTR.BMP`、`.SC2` 存档）。导入的字节只存在于页面内存、Worker 与本机浏览器的 IndexedDB，**不会上传到任何服务器**（`src/io/assets/` 目录经 ESLint 禁止 import 网络模块）。
- 本项目与原游戏的开发商、发行商无任何关联。

## 快速开始

```bash
pnpm install                      # 仓库根；pnpm 11 / Node 22
pnpm --filter sc2k dev            # http://localhost:5174
pnpm --filter sc2k typecheck      # 两套 tsconfig（含无 DOM 的 sim 配置）
pnpm test                         # 根 vitest，自动包含 packages/sc2k/src/**/*.test.ts
pnpm lint                         # 根 ESLint（含 sc2k 的确定性与依赖方向规则）
pnpm --filter sc2k e2e            # Playwright（Chromium 路径见 e2e/playwright.config.ts）
pnpm --filter sc2k headless       # 无头长跑（WP1）
```

调试：开发模式或 URL 带 `?debug` 时，`window.__sc2k = { host, renderer, shell, version }`。

## 目录结构（摘要，详见 `docs/ARCHITECTURE.md` §2）

```
src/
  main.ts            仅 import './app/boot'
  contracts/         类型 + 微量运行时（唯一接口真源，冻结后只加不改）
  data/              建筑 / 工具 / 法令 / 文案表（SSOT）
  sim/<id>/          九个模拟系统（core terrain placement utilities zones transport services economy events）
  io/{snapshot,sc2,assets}/   快照、.SC2 编解码、本地导入
  art/               程序化精灵
  render/{scene,cpu,pixi}/    场景编译（纯函数）、CPU 合成（像素验收）、Pixi 后端
  ui/  audio/        DOM 外壳、音效
  app/               wire.ts（唯一接线文件，DOM-free 半边）、wireDom.ts（渲染 / 外壳 / 素材库半边，仅 boot 用）、boot.ts、v1Tools.ts、stubs/（WP0 桩）、patches/
tools/               gen-catalogue / strings-scan / headless / hash-compare / art-sheet
e2e/                 Playwright 冒烟
docs/                ARCHITECTURE / CONTRACTS / WORKPLAN / spec/ / contract-rfc / open-questions
```

## 文档索引

| 文档 | 内容 |
|---|---|
| `docs/ARCHITECTURE.md` | 最终架构：目录与依赖方向、数据模型、调度、渲染、UI、测试、预算 |
| `docs/CONTRACTS.md` | 共享契约蓝本（代码落地后以 `src/contracts/**` 为准） |
| `docs/WORKPLAN.md` | WP0 + 14 个并行工作包、独占文件、验收、合并列车 |
| `docs/spec/*.md` | 领域规格（数值来源） |
| `docs/contract-rfc.md` | 日内契约变更 RFC 表 |
| `docs/open-questions.md` | 开放问题汇总 |

## 当前状态

WP0 脚手架：全桩应用（空城、速度按钮、CPU 合成首帧、9 个空系统）。各目录的 `index.ts` 为转发桩，由对应 WP 接手重写；`src/app/wire.ts` 只改 `WIRE_STUB_ALLOWLIST`。
