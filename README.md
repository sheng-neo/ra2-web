# 网页版红色警戒2

从零实现的网页版《命令与征服：红色警戒2》（原版）。浏览器即点即玩，适配 PC（鼠标键盘）与手机（触控），支持多人联网对战。

> 本仓库**只包含代码**，不含任何 EA 游戏素材。运行需要你自备红警2原版游戏文件，详见 [game-data/README.md](game-data/README.md)。

## 架构

pnpm monorepo，TypeScript 全栈：

| 包 | 职责 |
|----|------|
| `packages/data` | 红警2 文件格式解析器（MIX/INI/PAL/SHP/TMP/VXL/CSF/地图/音频），纯 TS，浏览器与 Node 通用 |
| `packages/game` | 确定性模拟内核（全整数运算 + 种子 PRNG + 状态哈希），客户端与服务器共享，锁步联机的根基 |
| `packages/client` | PixiJS v8 渲染、调色板着色器、UI、鼠标/触控输入（Vite） |
| `packages/server` | Node + WebSocket：大厅/房间 + 锁步命令中继 |

## 快速开始

```bash
# 1. 安装依赖（需要 Node ≥ 20 与 pnpm）
pnpm install

# 2. 准备游戏文件（见 game-data/README.md），然后校验
pnpm check-assets

# 3. 启动开发（客户端 + 服务器）
pnpm dev
```

常用命令：`pnpm test`（单元测试）· `pnpm lint` · `pnpm typecheck` · `pnpm build`

## 里程碑

- [x] M0 工程脚手架
- [ ] M1 资源解析层（MIX/INI/PAL/SHP/CSF + 资源浏览器）
- [ ] M2 地图与等距地形渲染
- [ ] M3 确定性模拟内核（移动/寻路/选择）
- [ ] M4 基地建设与采矿经济
- [ ] M5 战斗系统
- [ ] M6 体素载具（VXL/HVA 烘焙）
- [ ] **M7 多人联机 MVP（第一个可玩版本）**
- [ ] M8 手机触控适配 + PWA
- [ ] M9 音频
- [ ] M10 走向完整版（海空军/超武/特殊逻辑/观战回放）
- [ ] M11 部署上线

## 确定性约定（重要）

`packages/game` 是锁步联机的根基，必须做到所有客户端逐 tick 算出**完全相同**的世界状态：

- 坐标用整数 lepton（1 格 = 256 lepton），沿用红警2 原版坐标系
- 角度用 256 级二进制角 + 查表三角，禁用 `Math.sin/cos/sqrt/atan2`
- 随机数只用 sim 内的种子 PRNG，禁用 `Math.random`
- 禁止读取真实时间（`Date`/`performance.now`）
- 以上由 ESLint 规则强制 + 跨环境状态哈希测试兜底
