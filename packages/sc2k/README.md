# 网页版模拟城市 2000 · SC2K Web（原创复刻）

> 以 1990 年代经典城市模拟游戏《模拟城市 2000》Windows 95 特别版为蓝本，用 TypeScript + PixiJS v8
> 在浏览器中复刻其模拟规则、等距像素画面与 Win95 风格界面。PC 与手机触控皆可玩。

`packages/sc2k` 是 `ra2-web` 单仓库中的一个**独立包**：不依赖 `@ra2web/*`，可随时拆成单独仓库。

## 版权声明（请先读）

- 本仓库**不包含**任何原版游戏文件、精灵、调色板、音频或文本。程序化像素美术、全部玩家可见文案、
  报纸模板、音效均为**原创**；CI 用关键词黑名单扫描（`tools/strings-scan.ts`）防止原版专有文本混入。
- 玩家可以在页面内导入**自己合法拥有**的 Win95 版游戏文件（`LARGE.DAT` / `SMALLMED.DAT` / `SPECIAL.DAT`
  精灵库、`PAL_MSTR.BMP` 调色板、`.SC2` 存档）以获得原版画面与读取原版城市。导入的字节只存在于页面内存、
  Web Worker 与本机浏览器的 IndexedDB，**不会上传到任何服务器**（`src/io/assets/` 目录经 ESLint 禁止 import
  任何网络模块）。无文件时使用原创美术，照样完整可玩。
- 本项目为非官方粉丝 / 教学性质，与原游戏的开发商、发行商无任何关联。"SimCity" 等为其所有者的商标。

## 玩法概览

| 系统 | 内容 |
|---|---|
| 地形 | 128×128 地图、32 级海拔、海岸 / 河流 / 丘陵 / 水面 / 树木参数化生成；抬高 / 降低 / 整平 / 置水 / 植树 / 推土 |
| 分区与生长 | 住宅 / 商业 / 工业轻密六种分区，1×1 → 2×2 → 3×3 逐级成长、衰退、废弃、瓦砾；RCI 需求受税率、法令、邻城连接、国家经济影响 |
| 电力 | 煤 / 油 / 气 / 核 / 水电 / 风 / 太阳能 / 微波 / 聚变电厂按科技年份解锁，电线与建筑相邻传导，供需不足即停电 |
| 供水 | 水泵（临水产量更高）、水塔、净水厂、海水淡化厂，地下管线层与地下视图 |
| 交通 | 道路 / 铁路 / 电线 15 种片段自动选形、交叉件、坡道、堤道 / 铁路桥 / 高架电线、公交站 / 火车站、邻城连接、出行模拟与交通密度 |
| 公共服务 | 警局 / 消防 / 医院 / 学校 / 大学 / 图书馆 / 博物馆 / 公园 / 动物园 / 体育场 / 码头 / 监狱 / 市政厅 / 市长官邸 / 雕像 / 巨型住区…… 覆盖、地价、犯罪、污染、教育、健康八张数据图 |
| 经济 | 财产税、11 种产业税、20 条法令、债券与信用评级、11 条部门经费、年度预算窗口、破产 |
| 灾害与事件 | 火灾 / 洪水 / 龙卷风 / 地震 / 怪兽（随机或菜单触发）、警消调度、天气、科技发明公告、订阅报纸与号外 |
| 界面 | 菜单栏 / 分组工具栏 / 状态栏 / RCI 指示器；预算、法令、债券、地图（15 图层）、图表、邻城、报纸、查询、存读档窗口；四向旋转、三级缩放、地下视图、触控手势 |
| 存档 | 自有 `.sc2kweb` 快照（含私有态，确定性往返）与原版 `.SC2` 格式双向读写 |

## 快速开始

```bash
pnpm install                      # 仓库根；需要 Node ≥ 22、pnpm 11
pnpm --filter sc2k dev            # http://localhost:5174
pnpm --filter sc2k build          # 产物在 packages/sc2k/dist（纯静态，任意静态托管即可）
```

开发期常用：

```bash
pnpm lint                         # 根 ESLint（含 sc2k 的确定性与依赖方向规则）
pnpm --filter sc2k lint           # 原创性黑名单扫描 + 数据表产物一致性
pnpm --filter sc2k typecheck      # 两套 tsconfig（含无 DOM 的 sim 配置）
pnpm test                         # 根 vitest，自动包含 packages/sc2k/src/**/*.test.ts
pnpm --filter sc2k e2e            # Playwright 冒烟 / 浏览器与 Node 哈希一致性
pnpm --filter sc2k headless -- --years 50 --script golden-mini-city   # 无头长跑
pnpm --filter sc2k hash:compare -- --years 20                          # 确定性双跑比对
pnpm --filter sc2k art:sheet                                           # 原创精灵总览图
```

调试：开发模式或 URL 带 `?debug` 时，`window.__sc2k = { host, renderer, shell, version }`，可直接
`host.dispatch({...})`、读 `host.state`、`renderer.stats()`、`shell.openWindow('budget')`。

## 架构（摘要，详见 `docs/ARCHITECTURE.md`）

```
src/
  contracts/   共享契约：坐标 / 旋转置换 / 占地 / 网络片段 / PRNG / CityState / 日程表 / System 接口 / 命令与事件 / 快照 schema
  data/        建筑(256) / 工具(67) / 法令(20) / 科技年份 / 中英文文案表（由规格表脚本生成或手写，SSOT）
  sim/         九个系统：core terrain placement utilities zones transport services economy events（纯 TS，无 DOM，确定性）
  io/          snapshot（.sc2kweb）、sc2（.SC2 IFF/RLE 编解码）、assets（DAT 精灵 / 调色板解码、IndexedDB、导入面板）
  art/         原创程序化像素精灵（782 张 × S/M/L 三档）与 256 色原创调色板
  render/      scene（纯函数场景编译 / 投影 / 拾取 / 小地图）、cpu（像素验收与 PNG）、pixi（16 条深度带的 WebGL 后端）
  ui/ audio/   Win95 风格 DOM 外壳、窗口与模态、工具控制器与触控、WebAudio 原创音效
  app/         wire.ts（唯一接线文件）、boot / loop / session
```

关键约定：

- **确定性**：模拟层只用种子 PRNG（mulberry32），禁用 `Math.random / Date / performance` 与浮点三角函数（ESLint 强制）；
  同种子双跑逐年哈希一致，浏览器与 Node 哈希一致（e2e 校验）；命令日志可重放。
- **一天 = 若干阶段**：每月 25 天，第 0 天结算 / 年度事务，第 1 天电力扫描，第 3–18 天 4×4 子步生长扫描，
  第 19–24 天交通衰减 / 供水 / 普查与需求 / 图表 / 里程碑 / 天气与灾害 / 报纸（`contracts/clock.ts`）。
- **图层即真源**：与 `.SC2` 同编码的 `XTER / XBLD / XZON / XUND / XTXT / XBIT` 等 `Uint8Array` 图层 + 低分辨率数据图，没有建筑实例表。
- **依赖方向**：`contracts ← data ← sim ← io ← art ← render ← ui/audio ← app`，由 ESLint `no-restricted-imports` 按目录强制。

## 文档索引

| 文档 | 内容 |
|---|---|
| `docs/ARCHITECTURE.md` | 最终架构：目录与依赖方向、数据模型、调度、渲染、UI、测试、预算 |
| `docs/CONTRACTS.md` | 共享契约蓝本（代码落地后以 `src/contracts/**` 为准） |
| `docs/WORKPLAN.md` | 14 个并行工作包的分解、独占文件、验收 |
| `docs/spec/*.md` | 十个领域的原版机制规格（数值来源） |
| `docs/contract-rfc.md` / `docs/open-questions.md` | 契约变更记录与开放问题 |

## 路线图（v2）

高速公路与匝道、隧道、开启桥 / 吊桥、地铁换乘、11 种产业与国家经济、巨型住区入住 / 升空、海港 / 机场生长、
更多灾害（飓风 / 空难 / 暴乱 / 火山 / 核泄漏）与常驻物件（飞机 / 船 / 列车）、报纸全部 67 类版面、人口 / 产业窗口、
调色板循环动画、窄屏布局、音乐。详见 `docs/WORKPLAN.md` §6.3。

## 缘起

本包由 Claude（Fable 5.1）从一句提示词出发，自主完成调研、架构、契约、15 个并行工作包的实现与集成。
代码以 MIT 许可开源（见仓库根 `LICENSE`）；MIT 仅覆盖本仓库的代码，不涉及任何第三方游戏素材。
