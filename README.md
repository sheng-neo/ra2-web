# 网页版红色警戒2 · Web Red Alert 2

> **一句提示词，一个 AI（Claude / Fable 5），一个晚上，从零写出的网页版《红色警戒2》。**
> 浏览器即点即玩，适配 PC 与手机，支持多人联网锁步对战。

🎮 **在线试玩 → https://peaceful-wave-530.fly.dev**

[![CI](https://github.com/sheng-neo/ra2-web/actions/workflows/ci.yml/badge.svg)](https://github.com/sheng-neo/ra2-web/actions/workflows/ci.yml) ![license](https://img.shields.io/badge/license-MIT-blue) ![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178c6) ![PWA](https://img.shields.io/badge/PWA-ready-5a0fc8)

一个**从零手写**的网页 RTS 引擎：自带 C&C 文件格式解析器（MIX/SHP/VXL/TMP/PAL/CSF…）、
确定性锁步联机内核、PixiJS 等距渲染。

> ### 开源与版权（请先读）
> - 本仓库**只含原创代码，不含任何 EA 游戏素材**（`game-data/` 已 gitignore）。
> - 真实美术/音效由玩家在本机导入自己的游戏文件、或浏览器直连下载 **EA 官方免费**的
>   《泰伯利亚之日》素材渲染——**全程不经本仓库/服务器分发**；无素材时用原创占位美术，
>   无需任何文件即可游玩。
> - 本项目为**非官方粉丝 / 教学性质**，与 Electronic Arts 无任何关联；
>   "Command & Conquer""Red Alert""Tiberian Sun" 等为 EA 商标，归其所有。

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

## 已实现功能

**玩法**：基地建设（建造场/电厂/精炼厂/兵营/战车工厂/防御）、电力系统、矿石经济（采矿车 AI 往返）、生产队列与前置科技、建筑放置（毗邻建造半径）、集结点、修理/出售；战斗（武器→弹头→装甲百分比矩阵、弹道、溅射、防御塔、攻城车）、战争迷雾；单位指令（选择/框选/双击选同类/移动/攻击/攻击移动 A/停止 S/编队 Ctrl+数字）。

**模式**：单机遭遇战（难度/起始资金/地图大小可选，强 AI 会扩经济·建防御·成波进攻），多人联机锁步对战（大厅/房间/聊天/准备）。

**平台**：PC（鼠标键盘+边缘滚屏+小地图跳转）与手机（触控手势：点选/拖框选/单指下令/双指平移缩放，PWA 全屏）。

**美术**：自备红警2/泰伯利亚之日文件时渲染**真实** SHP 建筑步兵 + VXL 体素载具 + TMP 地形（仅本地解析，不分发）；无文件时回退原创 CC0 占位美术。程序合成音效。

## 里程碑（全部完成）

- [x] M0 工程脚手架 · M1 资源解析（MIX/INI/PAL/SHP/CSF）· M2 地图与等距地形
- [x] M3 确定性模拟内核 · M4 基地经济 · M5 战斗 · M6 体素载具（VXL/HVA）
- [x] **M7 多人联机锁步** · M8 手机触控+PWA · M9 音频 · M11 部署上线
- [x] 产品级打磨：真实地形、集结点/修理/出售、强 AI、攻城车、战争迷雾、
  压力/模糊/AI对战测试、加载遮罩、边缘滚屏、地图大小、停止/双击选同类等

测试 150 个全绿（含确定性压力测试、解析器健壮性、AI 对战全流程、端到端联机同步）。

## 确定性约定（重要）

`packages/game` 是锁步联机的根基，必须做到所有客户端逐 tick 算出**完全相同**的世界状态：

- 坐标用整数 lepton（1 格 = 256 lepton），沿用红警2 原版坐标系
- 角度用 256 级二进制角 + 查表三角，禁用 `Math.sin/cos/sqrt/atan2`
- 随机数只用 sim 内的种子 PRNG，禁用 `Math.random`
- 禁止读取真实时间（`Date`/`performance.now`）
- 以上由 ESLint 规则强制 + 跨环境状态哈希测试兜底

## 联机对战（M7）

```bash
# 终端 1：启动对战服务器（默认 7301）
pnpm dev:server
# 终端 2：启动客户端
pnpm dev:client
```

浏览器开两个标签 → 首页「🌐 联机对战」→ 填同一房间名 → 双方点准备 → 自动开局。
本机/局域网即可对战；架构为确定性锁步（命令经服务器中继，各端同序执行）。

## 部署上线（一个容器 + 一个 URL）

生产模式下，服务器在**同一端口**托管构建好的客户端与 WebSocket（同源、无跨域），
玩家只需访问一个网址即可联机：

```bash
# 本地按生产模式跑
pnpm --filter @ra2web/client build
PORT=8080 pnpm --filter @ra2web/server start   # 打开 http://localhost:8080

# 或用 Docker（云平台一键部署）
docker build -t ra2web .
docker run -p 8080:8080 ra2web
```

部署到任意支持 Docker + WebSocket 的平台（Fly.io、Render、Railway、自有 VPS 等）即可
公网对战。客户端在生产环境自动以同源 `ws/wss` 连接服务器，无需额外配置。

> 游戏文件：联机仅同步指令、不传素材；每位玩家在自己设备本地导入红警2文件
> （见 [game-data/README.md](game-data/README.md)）。当前占位美术版无需文件即可游玩。

## 缘起

这个项目由 **Claude（Fable 5）** 在一个晚上、从一句提示词开始、自主规划并实现——
当年红色警戒是一家公司数十人耗时两年的经典，如今一个 AI 一晚从零写就。
它也是「**用 AI 从零造开源项目**」这件事的一个起点。

## 许可

代码以 **MIT** 许可开源，见 [LICENSE](LICENSE)。

注意：MIT 仅覆盖**本仓库的代码**。游戏美术/音效/字体等版权素材**不在本仓库内、不随本项目分发**；
玩家需自备原版游戏文件，或使用 EA 官方免费开放的素材。本项目与 EA 无关。
