# 架构提案（delivery-first）：`packages/sc2k` 一天十人合并出可玩版

> 视角：**交付优先**。10 个 AI 工程师并行开发 1 天，日终必须合并出"新城 → 划区 → 通电 → 长出房子 → 收税"的可玩版本；之后再长成完整复刻。一切架构决定都服从三个指标：**零文件重叠**（合并不可能冲突）、**零等待**（任何 WP 在任何时刻都能独立跑 typecheck/test/浏览器）、**分期可裁**（每个 WP 有 v1 切片与 v2 切片，日终只要求 v1）。
> 依据：`docs/spec/*.md` 十份规格（本文只引用，不重述数值）；仓库约定 `CONTRIBUTING.md`、`tsconfig.base.json`、`eslint.config.js`、`vitest.config.ts`。
> 与 `proposal-sim-first.md` 的关系：两份提案在**规格强制的事实**上一致（`i = x*128+y`、TL 角位锚点、`XBit` 掩码、`DAY_PHASES` 唯一日程、mulberry32 单流 PRNG、PixiJS v8、DOM 外壳）；本文在"怎么组织人和代码"上另做取舍，差异在 §0.4 列出。两者可合并：取 sim-first 的内核纪律，取本文的交付机制。
> 标记：`[决定]` 本文拍板；`[v1]` 日终必达；`[v2]` 次日起；`§x.y` 不带文件名指本文。

---

## 0. 交付策略总览

### 0.1 一句话

**WP0 先交付一个"全是桩"的、能跑能测能看的完整应用**（空城、速度按钮、Canvas 调试网格、12 个空系统），之后每个工程师只在自己独占的目录里**把桩换成实物**；`app/wire.ts` 从头到尾不改，合并 = 分支并集，CI 对并集跑 `typecheck + test + e2e`。

### 0.2 时间表（T = 开工）

| 时刻 | 事件 | 产出 / 门禁 |
|---|---|---|
| T+0:00 | 全员读规格；Lead 做 WP0 | 其余 9 人先写各自的 `tuning.ts`、测试夹具、空测试（不依赖契约细节） |
| T+1:30 | **契约冻结** `contracts-v1` | WP0 合并到 `sc2k/main`：`pnpm typecheck && pnpm test && pnpm --filter sc2k e2e` 全绿（桩应用） |
| T+1:30–7:00 | 第一波 10 个 WP 并行 | 每人一个 worktree / 分支，只碰独占文件（§9.1） |
| T+4:00 | **中途合并列车 #1**（只验类型与测试，不验玩法） | Lead 合并全部分支到临时分支跑并集门禁；失败的 WP 当场修 |
| T+7:00 | **合并列车 #2 → v1 可玩检查** | 冒烟：新城 → 煤电 + 电线 → R/C/I 分区 + 道路 → Cheetah 跑 24 个月 → 出现建筑、资金变化、Query 有数据 |
| T+7:00–10:00 | v1 修补；先完工者领第二波 WP（事件 / 素材导入） | |
| T+10:00 | **合并列车 #3 → 打标 `v1-playable`** | 无头 50 年长跑 + 确定性双跑 + Playwright 截图入 CI |
| 次日起 | v2 切片 | 灾害、情景、报纸、DAT 导入、全部窗口、地下视图、动画 |

### 0.3 四条机制

1. **桩即契约的可执行形态** `[决定]`：WP0 为每个系统目录写 `index.ts` 桩（`createXSystem = () => nullSystem('x')`），桩的查询返回**乐观值**（`hasPower → true`、`hasAccess → true`、`runTrip → ok`、`invented → true`、天气恒 Clear）。因此 T+2 的桩应用里分区就会长房子——zones 不必等 transport / utilities 落地就能在真实应用里被看见。
2. **零重叠文件清单**（§9.1）：每个 WP 的可写路径互斥；跨 WP 的唯一交汇点是 `src/contracts/**`（冻结）与 `src/app/wire.ts`（Lead 专属）。`pnpm-lock.yaml` 由 WP0 一次性加入全部依赖（`pixi.js` 已在仓库、`@playwright/test`），日内禁止新增依赖。
3. **两层存档** `[决定]`：`io/snapshot`（通用、按 schema 自动遍历 `CityState` 的 TypedArray 与标量，无损、无每模块代码，T+3 可用）承担保存 / 读取 / 自动存档 / 确定性哈希；`.SC2` 只是互通格式（W2 的切片）。于是"存档"不在任何 WP 的关键路径上。
4. **按在场即功能**：core 对缺席 / 桩系统一律跳过；`ToolDef.phase = 2` 的工具在工具栏隐藏（遵守 CONTRIBUTING"未实现的逻辑不进建造栏"）；桩 `PlacementQuery.availability` 返回 `notImplemented`。v1/v2 的边界由数据表而不是 if/else 决定。

### 0.4 与 sim-first 的明确差异

| 议题 | sim-first | 本文 `[决定]` | 理由（交付） |
|---|---|---|---|
| 自有存档 | `.SC2` 即自有格式 | 通用快照 `.sc2kweb` + `.SC2` 互通 | 存档 / 哈希 / 长跑在 T+3 就可用，且快照无损保存 lot 计时器、物件、灾害燃料（`.SC2` 按规格丢弃这些） |
| 锚点缓存 | core 维护 `anchorOf: Int32Array` | **不设共享派生缓存**；渲染 / 查询直接读 `XZON` 的 TL 位 + `FOOTPRINT` 探测（≤16 次） | 去掉最容易出 bug 的跨模块缓存失效；各模块私有缓存自便 |
| 接线 | 集成阶段写 `wire.ts` | WP0 写死 `wire.ts` + 全部桩，之后不改 | 合并零冲突，任何时刻应用可跑 |
| WP 数 | 14 并行 | 10 并行 + 2 第二波 + Lead 的 WP0 | 与 10 人一一对应；events / 素材导入不是 v1 必需 |
| 渲染 v1 | 分块 `cacheAsTexture` | v1 可见格精灵池 + zIndex；v2 再分块缓存 | 数据估算（§4.1）表明 v1 不需要分块就能 60 fps |
| 调色板循环 | CPU 烘焙循环页 | v1 不做循环；v2 同 sim-first | 非可玩性要素 |
| 科技 / 天气 | disasters 模块 | 同归 `sim/events`（第二波 W11）；v1 由桩提供"全部已发明 / 恒 Clear" | 不阻塞工具栏与年初序列 |

---

## 1. 包布局

### 1.1 目录（★ = WP0 创建；每行末尾标 owner）

```
packages/sc2k/
  package.json  tsconfig.json  tsconfig.sim.json  vite.config.ts  index.html  README.md     ★ W0
  docs/{spec,arch}/
  tools/  headless.ts hash-compare.ts (W1)   art-sheet.ts (W8)
  e2e/    smoke.spec.ts hash.spec.ts (W10)   playwright.config.ts ★ W0
  src/
    main.ts                     ★ W0   // 仅 `import './app/boot'`
    contracts/                  ★ W0   // 类型 + 微量运行时（grid/prng/footprint/net 常量）；冻结
    testkit/                    ★ W0   // 空城 ctx、乐观桩 Queries/Actions、迷你金城（golden-mini-city.ts）、哈希工具；仅测试 import
    sim/
      core/                     W1     // 调度器、命令队列、事件缓冲、hash、重放、无头入口
      terrain/                  W2
      utilities/  placement/    W3     （W3 还独占 src/data/**）
      zones/                    W4
      transport/                W5
      services/                 W6
      economy/                  W7     （含 scenario）
      events/                   W11    // disasters / weather / tech / news / things / dispatch（第二波）
    data/                       W3     // buildings.ts tools.ts techBaseYears.ts（SSOT，catalogue 规格）
    io/
      snapshot/                 W1     // 通用快照（§2.5）
      sc2/                      W2     // bytes.ts iff.ts rle.ts read.ts write.ts misc.ts mapping.ts
      assets/                   W12    // sprites/ palette/ text/ import/（含自带 DOM 面板 ui/）（第二波）
    art/                        W8     // raster.ts palette.ts recipes/ provider.ts
    render/                     W9     // PixiJS v8
    ui/                         W10    // DOM 外壳
    app/
      wire.ts                   ★ W0   // 唯一接线文件；import 各目录 index.ts；冻结
      stubs/                    ★ W0   // nullSystem、stubRenderer(Canvas2D 调试网格)、stubShell、stubProvider（洋红）
      boot.ts loop.ts session.ts  W10
```

每个 `src/sim/<id>/index.ts`、`src/art/index.ts`、`src/render/index.ts`、`src/ui/index.ts`、`src/io/sc2/index.ts`、`src/io/assets/index.ts` 由 WP0 写成**一行转发桩**（`export { createTerrainSystem } from '../../app/stubs/null'` 之类），对应 WP 接手后整目录重写。`wire.ts` 只 import 这些 `index.ts`，签名由契约固定。

**依赖方向**（ESLint `no-restricted-imports` 按目录）：`contracts ← data ← sim/* ← io/* ← render/ui ← app`；`sim/<a>` 禁止 import `sim/<b>`（只能经 `ctx.q / ctx.act`）；`art/render/ui` 禁止 import `sim/**`（只读 `CityState` 类型与 `Queries`）；`io/assets/import` 禁止 import 任何网络 API 模块。新包不 import `@ra2web/*`；源码一律相对路径（根 vitest glob 自动纳入，零改动）。

### 1.2 `package.json`

```json
{ "name": "sc2k", "version": "0.0.1", "private": true, "type": "module",
  "scripts": {
    "dev": "vite --port 5174", "build": "vite build", "preview": "vite preview",
    "typecheck": "tsc -p tsconfig.json --noEmit && tsc -p tsconfig.sim.json --noEmit",
    "headless": "tsx tools/headless.ts", "hash:compare": "tsx tools/hash-compare.ts",
    "art:sheet": "tsx tools/art-sheet.ts", "e2e": "playwright test -c e2e/playwright.config.ts" },
  "dependencies": { "pixi.js": "^8.6.0" },
  "devDependencies": { "@playwright/test": "^1.48.0", "@types/node": "^22.10.0", "vite": "^7.0.0" } }
```

根 `package.json` 的 `typecheck`（`pnpm -r run typecheck`）自动覆盖本包；根 `eslint.config.js` 由 WP0 追加一段，把现有"模拟内核禁 `Math.random/Date/performance/sin/cos/sqrt`"规则同样作用于 `packages/sc2k/src/{contracts,data,sim,art,io/sc2,io/snapshot}/**`（测试文件除外），并追加 `Math.pow/exp/log` 到禁用表（§2.6 确定性）。

### 1.3 `tsconfig`

- `tsconfig.json`：extends base；`lib: ["ES2022","DOM","DOM.Iterable"]`；`types: ["vite/client"]`；`include: ["src","tools","e2e","vite.config.ts"]`。
- `tsconfig.sim.json`：extends base；`lib: ["ES2022"]`；`types: []`；`include: ["src/contracts","src/data","src/sim","src/art","src/io/sc2","src/io/snapshot","src/io/assets/sprites","src/io/assets/palette","src/io/assets/text"]`；`exclude: ["**/*.test.ts"]`。任何 `document / window / performance` 在这些目录里是编译错误。

### 1.4 Vite 与 `index.html`

`vite.config.ts`：`base: './'`、`build.target: 'es2022'`、`worker.format: 'es'`、`server: { port: 5174, host: true }`、无中间件（素材只从本地文件导入）。`index.html`：`<meta name="viewport" content="width=device-width, initial-scale=1, user-scalable=no">`、`<div id="app">`、`<script type="module" src="/src/main.ts">`、一个 `<style>` 定义 CSS 变量（斜面窗口的四色：面、高光、阴影、深阴影）与 `html,body{margin:0;height:100%;overflow:hidden}`。

---

## 2. 核心数据模型

### 2.1 真源：`CityState`（与 `.SC2` 同编码的图层 + 有存档映射的标量）

| 组 | 字段 | 类型 | 索引 / 存档 | 写者 |
|---|---|---|---|---|
| 地块层 | `xter xbld xzon xund xtxt xbit` | `Uint8Array(16384)` | `i = x*128 + y`；同名 chunk | §2.4 |
| 地形 | `alt waterLevel tunnelLevels` | `Uint8Array(16384)` | `ALTM` 拆位 | terrain |
| 标签 / 微模拟 / 物件 | `xlab(6400) xmic(1200) xthg(480)` | `Uint8Array` | 同名 chunk | services / events |
| 低分辨率图 | `xtrf xplt xval xcrm`(4096) `xplc xfir xpop xrog`(1024) | `Uint8Array` | `(x>>1)*64+(y>>1)`、`(x>>2)*32+(y>>2)` | services |
| 计数 | `counts.tile(256) zone(8) military(16)` | `Int32Array` | `MISC 0x01F0/0x05F0/0x0FA8` | core（`TileWriter`） |
| 图表 | `xgrp` | `Int32Array(832)` | `XGRP` | economy 推送 |
| 时钟 | `clock` | 标量 | `MISC 0x0010/0x000C/0x0FEC/0x0004` | core |
| 经济 | `economy` | 标量 + `Int32Array(11)` + `Uint8Array(11)` + `bonds[]` | `MISC` 税线 / 经费线 / 债券 / 法令 | economy |
| 人口 / 需求 | `census demand caps industry neighbors national` | 标量 / `Int32Array` | `MISC 0x0074…0x0720` | zones |
| 人口学 / 奖励 | `demographics(cohorts Int32Array(60)) rewards` | | `MISC 0x007C…, 0x0020/0x0078/0x0E4C…` | services |
| 天气 / 灾害 / 科技 | `weather disaster tech` | 标量 / `Int32Array(17)` | `MISC 0x0060…0x0070, 0x0738…, 0x1000…0x1048` | events |
| 报告 | `utilities.{power,water}`、`traffic`、`totals` | 标量 | `MISC 0x0030/0x104C`、`XGRP` | utilities / services |
| 元数据 | `cityName mayorName terrainMeta{seaLevel,coast,river,rotation} view{x,y,zoom}` | | `CNAM`、`MISC 0x0E40…/0x0008/0x1018…` | core / ui |
| 底稿 | `rawMisc: Int32Array(1200)` | | 不理解的偏移原值写回 | io/sc2 |
| **私有持久态** | `priv[systemId]` | 任意"快照可序列化"对象（数字 / 字符串 / 布尔 / TypedArray / 它们的数组与嵌套对象） | 只进快照，不进 `.SC2` | 各系统 |

`priv` 是本文的关键：zones 的 `LotState` 表、transport 的 `stations/bridges`、events 的 `marker/fuel/things`、economy 的 `ytd` 都放这里。它们**既是运行态又被快照无损保存**，无需每模块写序列化代码；读 `.SC2` 时按各规格"归零 / 重建"。

### 2.2 建筑实例：没有实例表 `[决定]`

- 多格建筑 = 占地每格 `xbld` 同 ID + `xzon` 高 4 位角标；**锚点 = TL 位（`0x40`）**，1×1 四位全置也含 TL，故"TL 置位格数 = 栋数"。
- 需要"整栋"的地方（渲染、查询、拆除、微模拟）用契约里的纯函数 `anchorOf(layers, i)`（`FOOTPRINT[id]` 探测 ≤ 16 次，O(1)）与 `forEachLotTile(anchor, n, fn)`。渲染只在 TL 位格画建筑精灵，不需要任何缓存。
- 各模块若要对象表（utilities 的 `plants[]`、transport 的 `stations[]`、zones 的 `lots`），放 `priv`，自己维护，别人不读。services 的覆盖图案以 TR 位为原点是其内部口径（由 TL 锚点 + `FOOTPRINT` 换算）。

### 2.3 地下层与低分辨率图

地下 = `xund`（地铁 / 管线 / 十字 / 入口 / 导弹井）+ `tunnelLevels`；没有第二套表。八张低分辨率图是真源（存档即它们），每月第 2 天整体替换（`services-models.md` §2.3）；`xtrf` 由 transport 经 `act.addTraffic` 累加、services 第 19 天衰减，全系统只有这两条写路径。

### 2.4 写入纪律：`TileWriter`（core 实现 `Actions` 中的 `set*`）

| 操作 | 入口 | 副作用 |
|---|---|---|
| 单格改 `xbld / xzon / xund / xter / alt / waterLevel / tunnelLevels` | `act.setXbld(i,id)`、`act.setXzon`、`act.setXund`、`act.setTerrain(i, alt, xter, waterLevel)` | 增量更新 `counts.*`；追加 `changeLog`（渲染脏格；`onTilesChanged` 扇出） |
| 单格位 | `act.setXbit(i, mask, on)` | 追加 `changeLog`（`kind:'bit'`） |
| 整层重建（`POWERED/WATERED`、八张图、`xtxt` 合成、`xthg`） | 直接写数组，阶段末 `act.layerChanged('xbit' \| 'maps' \| 'xtxt' \| 'xthg')` | 渲染整层刷新 |

`MISC 0x01F0` 的 256 项格计数因此恒与 `xbld` 一致；导出前再做一次全量对账断言。

### 2.5 序列化：两层 `[决定]`

**A. 通用快照 `.sc2kweb`（W1，T+3 可用）**

```
magic "SC2KWEBS" | u16 version=1 | u32 headerLen | header JSON | 连续原始字节
header = { fields: [{ path: "layers.xbld", kind: "u8", len: 16384 }, { path: "clock", kind: "json", json: {...} }, ...] }
```

- 生成规则：深度优先遍历 `CityState`（含 `priv`）：TypedArray → 原始字节条目；数字 / 字符串 / 布尔 / 普通对象 / 数组 → `json` 条目（键按插入序；真源里只有整数，JSON 跨引擎稳定）。无任何每模块代码。
- 读取：按 `path` 回填；缺失字段取 `createCityState()` 默认值；`version` 不同只做"缺失补默认"，不做迁移（日内不需要）。
- 用途：菜单"保存 / 载入"（IndexedDB `saves` + 文件下载）、自动存档（每游戏年）、确定性测试、`hashState = fnv1a(snapshotBytes)`（§2.6）。
- `[v2]` 经 `CompressionStream('gzip')` 压缩（≈ 250 KB → 30 KB）。

**B. `.SC2` 互通（W2 `io/sc2` + 各系统 `SaveHooks`）**

- `readSc2(buf) → Sc2Document`、`importCity(doc)`：按 `file-formats.md` §3.4.2 顺序调用各系统 `importFrom(ctx, doc, diag)`，再 `postLoad()`（电 / 水重扫不消费 PRNG、`cityCenter`、`trafficReport`、连接重算）。`exportCity → writeSc2`：各系统 `exportTo(ctx, doc)` 回填，`rawMisc` 透传未知偏移。
- 零区注册表（防碰撞，W0 写进 `contracts/io.ts` 的 `MISC`）：`0x1054/0x1058` PRNG 标志 / 状态（economy §2.13.5）、`0x105C` `saveFormatVersion`、`0x1060` `viewZoom`、`0x10BC–0x12BB` `xtxtShadow`（events）。
- 导入 `.SC2` 后 `priv` 为各规格的"归零 / 重建"值；之后的快照又是无损的。两种格式各司其职，不存在"两种格式漂移"：`.SC2` 的内容是 `.sc2kweb` 的真子集。

### 2.6 状态哈希与确定性

`hashState(s) = fnv1a32(snapshot(s).bytes)`——一处实现、零每模块代码；`replay(seed, commands)` 在 Node 与浏览器逐年哈希相同即通过。确定性红线：`sim/**` 只用整数与 `+ − × ÷ floor trunc round min max`（IEEE 754 跨引擎一致）；禁 `Math.random/pow/exp/log/sin/cos/sqrt`（ESLint）；`terrain.md` §3.6 的 `pow(n,1.15)` 改为 `n*(0.85+0.15*n)`；概率比较只用 `prng.float()` 与 `prng.int()`。

---

## 3. 模拟调度

### 3.1 tick、月、年

- **1 tick = 1 天**；1 月 = 25 天 = 25 tick；1 年 = 300 tick；`clock.age` 唯一真源，`dateOf(age)` 派生（`economy-budget.md` §2.2）。
- 每帧 `host.tick(dtMs)`：按 `MS_PER_DAY[speed]`（∞ / 480 / 160 / 40 / 0）把真实时间折成 n 天，African Swallow 每帧 ≤ 10 天；逐天 `advanceDay()`。
- `advanceDay()` 顺序执行 `DAY_PHASES[age % 25]`；任一阶段返回 `'suspend'`（模态框）则停在 `clock.phaseCursor`，UI 关闭后 `host.resume()` 从下一阶段续跑，**不重跑**；日末 `flushDirtyRescans()`（电 / 水即时重扫）再 `age++`。
- 灾害模式（`clock.mode == 2`）与暂停：日历不前进；`events.disasterTick()` 与 `thingsTick()` 按 `tickIntervalMs[speed]` 另行推进（`disasters-events.md` §2.2.1）；桩系统缺席时灾害模式永不进入。

### 3.2 阶段表（全仓库唯一真源 = `contracts/clock.ts`，原文 `economy-budget.md` §2.3）

| day | 阶段（行序 = 执行序） | owner 系统 |
|---|---|---|
| 0 | `settleMonth → closeYear¹ → techCheck¹ → nationalAnnual¹ → neighborsAnnual¹ → approvalSurvey¹ → facilityAnnual¹ → utilitiesAnnual¹ → budgetWindow¹ → beginMonth` | economy / economy / events / zones(+economy 的 fedRate 在同 runner 内由 economy 注册 `nationalAnnual.economy`) / zones / services / services / utilities / economy / zones |
| 1 | `powerScan` | utilities |
| 2 | `dataMaps` | services |
| 3–18 | `growthScan(step, substep)`：core 按 `x = step; x += 4` 外层、`y = substep; y += 4` 内层遍历，每格依次 `transport.growthVisit → zones.growthVisit → services.growthVisit` | core 主循环 |
| 19 | `trafficDecay` | services |
| 20 | `waterScan` | utilities |
| 21 | `census → demand → demographics → graphs` | zones / zones / services / economy |
| 22 | `milestones → scenario → solvency` | services / economy / economy |
| 23 | `uiRefresh`（只发事件） | core |
| 24 | `weatherAndDisaster → cityStatus → news` | events / services / events |

¹ 仅 1 月且 `age > 0`。`PHASE_IO`（读 / bulk 写 / point 写 / 用 PRNG / 可挂起）随表落在契约；`sim/core/dayPhases.test.ts` 静态断言：同日无两个阶段 bulk 写同一层、每层每月至多一个 bulk 写者、读 `@dN` 的阶段天数 ≥ N、`PHASE_OWNER` 覆盖全部 `PhaseId`。缺席系统的阶段直接跳过（不消费 PRNG）。

### 3.3 命令、事件、PRNG

- **命令**：UI 的一切改动都是 `Command`（§9.3）；`host.dispatch(cmd)` 只在 `phaseCursor == 0`（两天之间）或挂起期间执行，同步返回 `CommandResult`，并追加 `commandLog[{age, seq, cmd}]`。处理者由 owner 系统在 `commands` 字段注册，一个 `type` 一个处理者（core 注册时断言）。
- **事件**：阶段 / 命令把 `SimEvent` push 进 `ctx.events`；`host.drainEvents()` 每帧由 app 取走并经 `EventBus.on(type, fn)` 扇出到 UI / 渲染 / 音效。sim 内没有订阅者。
- **PRNG**：单一 `sim` 流（mulberry32，`economy-budget.md` §2.13，测试向量固化）；消费者只有阶段 runner（按 §3.2 行序 + 各规格内部遍历序）、命令处理函数、灾害 / 物件 tick。`terrain` 流用新城 seed；`brush` 流 `hash32(prng.state(), age, x, y, stroke)`（只读 `state()`）；`art` 用无状态 `hashNoise`；UI 装饰用 `Math.random`。预览（费用、可放置性、债券利率）不得消费 `sim` 流。

### 3.4 每月性能预算（128×128，估算）

| 阶段 | 工作量 | 估计 |
|---|---|---|
| `powerScan` + `waterScan` | 各两遍 BFS ≤ 16,384 格，预分配 `Int32Array` 队列，零分配 | 0.3–1 ms |
| `dataMaps` | ≈ 10 遍 16,384 + 3×4,096 + 2×1,024 整数运算 | 1–2 ms |
| `growthScan`（16 天合计） | 16,384 次访问；划区 30% 时 ≈ 5,000 次 `runTrip`，每次 ≤ 100 步 × ≤ 4 次表查 ≈ 600 ops | 3–8 ms；最坏（全图密区 + 大路网）≈ 40 ms |
| 其余阶段 | O(4,096) 或 O(150) | < 0.5 ms |
| **每月合计** | | **典型 6–15 ms，最坏 ≈ 50 ms** |

推论：100 年 = 1,200 月 ≈ 10–20 s 无头；CI 的 2×50 年双跑 < 60 s；African Swallow 每帧最重一天 ≤ 3 ms。内存：真源 ≈ 200 KB，`priv` < 1 MB，快照 ≈ 250 KB。

---

## 4. 渲染

### 4.1 选型：PixiJS v8 `[决定]`，v1 不分块

数据估算（M 档 32×16，1600×900 视口）：可见地块 ≈ (1600/32+2)×(900/8+2) ≈ 52×115 ≈ **6,000 格**，每格 1 张地形 + 平均 0.6 张建筑 / 路网 / 树 ≈ **9,500 张精灵**。Canvas2D 每张 `drawImage` ≈ 1–2 µs（桌面）→ 每帧 10–20 ms 且每次滚动全量重画，移动端 ×3，不可行；Pixi v8 把 9,500 个同图集精灵合成 1–3 个 draw call，GPU < 2 ms，CPU 只在视口 / 脏格变化时重建受影响精灵。仓库已有 `pixi.js ^8.6.0`，不新增依赖。Canvas2D 只用于小地图（`ImageData 128×128`）与 WP0 的调试桩渲染器。

| 项 | `[v1]` | `[v2]` |
|---|---|---|
| 容器 | 一个 `worldLayer`（`sortableChildren = true`）+ `dynamicLayer` + `previewLayer` | + 64 个 16×16 分块 `cacheAsTexture`、`undergroundLayer` |
| 精灵池 | 视口可见格 + 外扩 2 格；视图变化 → 全量重分配（≤ 10k 次属性赋值 ≈ 2–4 ms）；脏格 → 只更新该格及其锚格 | 分块重建按帧配额 ≤ 8 块 |
| 深度 | `zIndex = (rx + ry) * 8 + sub`：地形 0、水面 1、分区底色 2、路网 3、树 / 建筑 4、覆盖物 5、角色 6、预览 7 | 块间 `(cx+cy)`、块内同式 |
| 缩放 | S / M / L 三档，每档独立图集懒生成，瞬切 | + XS / XL 整数倍派生 |
| 动画 | 无（水面静帧，断电图标 1 fps 闪烁用 `visible` 切换） | 帧动画时钟（2/3/4/6/8/10 fps 分组同相位）+ 调色板循环（只重烘焙循环页） |

### 4.2 投影、海拔、旋转、拾取（`ui-art.md` §3.1 / §3.3）

- `(rx, ry) = rotate^r(x, y)`，`rotate(x,y) = (y, 127 − x)`；`sx = ox + (rx − ry)·S`，`sy = oy + (rx + ry)·S/2 − h·LEVEL`，`S = tileW/2`，`LEVEL = {S:6, M:12, L:24}`。
- **数据永不旋转**：坡面 nibble 用 `SLOPE_ROT_CCW`（唯一真源 `sim/terrain/slope.ts`，渲染器 import，不重抄）；网络件 / 隧道口 / 高速 / 交叉件按 `ui-art.md` §3.3 的环置换（`render/rotation.ts`）；`XBit.Flipped` 件 `drawFlip = flipped XOR (rotation & 1)` 水平镜像；建筑精灵不变。
- 多格建筑：只在 TL 锚格触发绘制；精灵锚点对齐到"旋转后占地内 `rx+ry` 最大的格"的底顶点（4 个占地角旋转后取最大者）。
- 拾取：从 31 级向 0 级逆投影 + 四边形点内测试，只按地面（`ui-art.md` §3.1）。
- 地图朝向观者的两条边（旋转后 `rx == 127 || ry == 127`）画岩壁到 0 级。

### 4.3 精灵管线与真实精灵接入点

```
SpriteProvider[]（顺序：dat? → procedural）──bitmap(key, scale)──▶ IndexedBitmap（索引色，0 = 透明）
  ──▶ AtlasPacker(2048², shelf)  ──▶ CPU 用 Palette 烘焙 RGBA ──▶ Pixi TextureSource(nearest, roundPixels)
  回退链：DAT 原生(XS/S/M) → DAT 整数倍放大 → procedural(S/M/L 原生) → 洋红占位
```

真实精灵只有一个接入点：`renderer.setProviders([datProvider, proceduralProvider])` 后 `atlas.invalidate()`；渲染器不知道文件格式。`[v1]` 调色板烘焙一次；`[v2]` 循环页每 tick 重烘焙 ≈ 30 张小纹理。

### 4.4 脏区与性能预算

sim 的 `changeLog`（格索引数组 + 脏层）由 `RenderSource.takeChanges()` 每帧取走；单格 → 更新该格的 ≤ 3 张精灵 + 其锚格；`layerChanged('xbit')` → 只刷断电图标；`'maps'` → 只刷小地图 / 热力叠加。帧预算：静态 ≤ 10k 精灵、动态 ≤ 600、角色 ≤ 39；纹理 `scaleMode: 'nearest'`、`antialias: false`、`resolution: 1`。

---

## 5. UI

- **选型** `[决定]`：原生 DOM + CSS 变量复刻斜面窗口；一个 ≈ 60 行的 `h()` 构建器 + `Store<T>`（`get/set/subscribe`，批量通知）；无框架（可拆仓、Playwright 选择器稳定、与 canvas 完全分离——render 与 ui 两个 WP 不可能冲突）。
- **窗口系统**：`WindowManager`（非模态浮动窗：拖动、z 序、同类单例、位置记 `localStorage`）+ `ModalHost`（计数式，与 `clock.modalPause` 同步；模态打开时 `host.dispatch` 仍可用于 `modalAnswer`）。
- **工具栏 / 菜单 / 状态区**：按 `ui-art.md` §2.1–§2.4；按钮与子工具来自 `data/tools.ts`（SSOT），`phase = 2` 的隐藏；可用性文本来自 `q.placement.availability(toolId)`；RCI 指示器读 `state.demand`；诉求行读 `cityStatus` 事件。
- **窗口清单**：`[v1]` Budget（简版：税率 + 11 滑块 + 现金流 + 自动预算）、Map（Structures / Zones / Power / Water / 四张 64² 热力）、Query、NewCity、Save/Load；`[v2]` Graphs、Population、Industries、Neighbors、Ordinances、Bonds、Newspaper、Scenario ×3、ImportAssets（由 W12 自带面板经 `mountAssetImporter(el)` 挂入）。
- **查询**：`QueryWindow` 用 `anchorOf` 找整栋；字段来自 `q.services.queryStats(i)`、`q.utilities.plantAt(i)`、`q.transport.stationAt(i)`、各图层取值的离散化（`ui-art.md` §2.5.2）。
- **输入模型**：`ToolController` 状态机，十种操作模式 Click / Paint / Line / Rect / Place / Dispatch / Query / Sign / Center / Help（`ui-art.md` §2.8）；统一指针事件（鼠标 / 触控 / 笔），`touch-action: none`；手势：单指 = 工具，双指 = 平移 / 捏合换档 / 旋转一档，长按 = Query；键盘按 `ui-art.md` §2.8（`Ctrl+S` `preventDefault`；`Esc` 语义栈）。
- **消息流**：

```
DOM 事件 → ToolController / Menus ──Command──▶ SimHost.dispatch ──CommandResult──▶ 状态区（cost / reason）
                 ▲                                   │ tick(dt) 每帧
            UiStore ◀── EventBus.on(type) ◀── host.drainEvents()
                 │ ViewState                          │ changeLog / layerChanged
                 ▼                                    ▼
            Windows / Toolbar / StatusBar      Renderer.frame(dt) ← RenderSource.takeChanges()
```

UI 从不读 `MISC`、不写图层；拖动预览调用 `q.placement.preview(cmd)`（纯函数、不消费 PRNG、不写状态）。

---

## 6. 美术

- **接口**：`SpriteProvider { name, palette, nativeScales, has, bitmap, frameCount, fps }`（`ui-art.md` §3.4）；两种来源都产出 `IndexedBitmap { w, h, data, anchorX, anchorY, cycling }`。
- **生成器分层**：`raster.ts` 原语（`fillPoly / strokePoly / fillDiamond / ditherFill / isoLine / blit / hashNoise`）→ `isoBox` 三面盒体（光源左上，顶面 `i0+2`、左面 `i0`、右面 `i0−2`）→ 配方。
- **多样性保证**（R/C/I 各档不"千篇一律"）`[决定]`：`genBuilding(id)` = `skeleton(zone, level)` × `tier palette` × `jitter(seed = id)`：
  - 骨架按 (zone, level) 共 12 种：R 坡顶小屋 / 公寓盒 / 公寓盒+女儿墙 / 高层；C 店面 / 中层玻璃 / 中层塔 / 高塔；I 仓棚 / 锯齿顶 / 罐体 / 大厂。
  - tier 决定 ramp（R：Brick / WarmGray / Neutral；C：WarmGray / Glass / Neutral；I：Rust / WarmGray / Teal）与附属物集合（泳池 / 车库 / 招牌 / 烟囱）。
  - `seed = id` 驱动高度 ±10%、窗格亮灭、附属物落点、屋顶分支。
  - vitest：同 (zone, level, tier) 组内任意两 ID 位图哈希不同；组间平均亮度差 ≥ 阈值。
  - `[v1]` 用这套参数化骨架覆盖全部 0x70–0xC5 与公共建筑的"类别盒体"；`[v2]` 按 `ui-art.md` §3.8 的逐 ID 配方表精修（同一函数签名，替换内部）。
- **原创调色板**：`buildPalette()` 生成 16 色带 × 8 阶 + 保留区 + 三个循环组（`ui-art.md` §3.5），不是数据文件；DAT 导入时调色板来自玩家文件，循环组由 `PAL_STTC` 推断。
- 全部函数纯、确定性；`art:sheet` 拼 contact sheet 到 `docs/art-preview/`（不入 git）供人工检视。

---

## 7. 文件格式与本地导入

- **解析器接口**（`file-formats.md` §3）：`ByteReader/Writer`（显式 `u16be/u16le…`）、`readSc2(buf) → ReadResult<Sc2Document>`、`writeSc2(doc)`、`parseSpriteArchive / decodeSprite`、`readPaletteBmp / cycledIndex`、`readNewsData`；`identify(file, head64)` 魔数表；错误码表原样采用。
- **导入编排**：`io/sc2/mapping.ts` 持有 `SaveHooks` 注册表（各系统 `importFrom / exportTo / postLoad`），顺序 = `file-formats.md` §3.4.2；诊断只记录、不拒绝（第三方存档角标不规范、`XTXT` 被灾害标记覆盖等一律"修复 + 诊断"）。
- **浏览器导入**（`io/assets/import`，第二波 W12）：目录授权 / 多选 / 拖放三来源 → `identify` → Worker 解码 → IndexedDB `sc2k-assets`（`files / decoded / handles / saves / meta`，`file-formats.md` §3.9.5）→ `DatSpriteProvider`。隐私红线：字节流不出页面；该目录 ESLint 禁 import 网络模块。
- **启动序列**：`prefs.useOriginalArt && decoded 缓存命中` → `DatSpriteProvider`；否则 `ProceduralSpriteProvider`；`saves` store 同时容纳 `.sc2kweb` 与 `.SC2` 两种记录（`kind` 字段区分）。

---

## 8. 测试策略

| 层 | 内容 | 门禁 |
|---|---|---|
| 单元（各 WP 自带） | PRNG 测试向量；`tileIndex` 反转置（power-water T1/T2）；坡面置换 = 角点重命名；RLE 往返属性测试；精灵解码手工夹具（含重复 ID 策略）；`DAY_PHASES/PHASE_IO/PHASE_OWNER` 不变量；`splitMonthly` 之和 = 年额；电 / 水 BFS T4–T9；24 偏移可达；模式转移表逐行；需求 / 人口学公式；法令表与 zones 乘数一致；`FOOTPRINT` 集合；`canPlace` 12 种拒绝原因 | 每次 push：`pnpm test`（根 vitest） |
| 契约一致 | 系统注册的 `phases ⊆ PHASE_OWNER[id]`、`actions ⊆ ACTION_OWNER[id]`、`commands` 无重复处理者、`queries` 只填自己的键 | `sim/core/registry.test.ts`，WP0 起即有效（对桩也跑） |
| 确定性 | 同 seed + 同命令日志两次运行 `hashState` 逐年相同；Node 与 Playwright 浏览器各跑 5 年哈希一致；快照 `load(save(S))` 哈希不变 | `sim/core/determinism.test.ts`、`e2e/hash.spec.ts` |
| 存档往返 | `.sc2kweb`：任意状态哈希不变；`.SC2`：新城 / 3 年 / 灾害中 `hash(import(export(S)))` 在"规格声明归零"的 `priv` 之外相同 | `io/snapshot/*.test.ts`、`io/sc2/roundtrip.test.ts` |
| 无头长跑 | `testkit/golden-mini-city.ts`（煤电 + 电线 + R/C/I + 道路 + 水泵管线的命令脚本）跑 50 年（CI）/ 100 年（`SC2K_LONGRUN=1`）：不抛错、无 NaN、第 20 年 `normalPop ∈ [3,000, 60,000]`、无单月 > 50% 跳变、`funds > −10^6`、利用率 ≤ 100；空城 100 年人口恒 0 | `sim/core/longrun.test.ts`、`tools/headless.ts` 输出 `{year, hash, pop, funds}[]` |
| 浏览器冒烟 | Playwright（预装 Chromium）：标题页 → 新城 → 放电厂 / 电线 / 分区 / 道路 → Cheetah 24 个月 → 截图；断言 canvas 非空白、资金变化、无 console error；载入手工夹具 `.SC2` | `e2e/smoke.spec.ts`；对桩应用也能跑（WP0 起） |
| 美术快照 | 全部生成函数 FNV 哈希快照 + 多样性断言 + 菱形行宽 / 无缝规则 | `art/**/*.test.ts` |
| 合并列车 | 并集分支上跑以上全部 | T+4 / T+7 / T+10 |

---

## 9. 工作分解

### 9.1 WP 总览（W0 串行先做；W1–W10 第一波并行，与 10 人一一对应，Lead = W0 + W1；W11–W12 第二波由先完工者领）

规模 = 预估源码 + 测试行数（全量 / 其中 v1 切片）。"依赖契约"列出该 WP 实现或消费的契约键。独占路径之外**一个字节都不许写**；需要别人的东西 → 先用 `testkit` 桩，缺口走 §9.4 的 RFC。

| WP | 目标与 v1 / v2 切片 | 独占文件 / 目录 | 依赖契约 | 验收测试 | 规模 |
|---|---|---|---|---|---|
| **W0 脚手架 + 契约 + 桩**（Lead，T+0–1:30） | 包文件、`src/contracts/**`（§9.3 全文落地，含 `FOOTPRINT`、`PIECE_MASK`、`DAY_PHASES/PHASE_IO/PHASE_OWNER/ACTION_OWNER`、`MISC` 偏移表）、`src/testkit/**`（`createTestContext()` 空城、乐观桩 `Queries/Actions`、`golden-mini-city.ts`、`hashOf`）、`src/app/wire.ts`、`src/app/stubs/**`（`nullSystem`、Canvas2D 调试渲染器、最小外壳：速度按钮 + 资金 / 日期 + 新城按钮、洋红 provider）、各目录转发桩 `index.ts`、`e2e/playwright.config.ts`、根 eslint 追加段、`src/main.ts` | 上述全部 | — | `pnpm typecheck/lint/test/e2e` 全绿；`registry.test` 对桩通过；桩应用能新城并推进日历 | 1,100 |
| **W1 sim-core + 快照**（Lead，T+1:30 起） | `[v1]` `advanceDay/resume/tick`、`CommandQueue` + 日志、`TileWriter`（计数 / changeLog）、`EventBuffer`、`createSim(systems)` 注册断言、`SimHost`、`io/snapshot`、`hashState`、`replay`、无头入口；`[v2]` 自动存档策略、命令日志导出、性能计时器 | `src/sim/core/**`、`src/io/snapshot/**`、`tools/headless.ts`、`tools/hash-compare.ts` | 实现 `Actions.set*/layerChanged/emit`、`SimHost`；消费 `System` | `dayPhases.test`、`tileWriter.test`（计数恒等）、`snapshot.test`（往返哈希）、`determinism.test`（桩系统）、`longrun` 骨架 | 1,500 / 1,200 |
| **W2 terrain + `.SC2` 编解码** | `[v1]` 层 / 坡面表 / 旋转置换 / 角点场 / 生成器（fBm 多项式近似）/ Raise / Lower / Level / Trees / Bulldoze 地表 / 水体重算 / 咸淡 / `TerrainQuery`；`readSc2` + `importCity` 编排（读档）；`[v2]` 溪流、水工具、海平面、桥 / 隧道的地形改动、`autoTerraformForNetwork`、`writeSc2` + `exportCity`、情景 chunk | `src/sim/terrain/**`、`src/io/sc2/**` | 实现 `Queries.terrain`、`Actions.setTerrain` 的语义校验；`Sc2Document`、`SaveHooks` | `terrain.md` §2.5.4 数据级用例；生成器固定 seed 快照；工具费用与拒绝；`refloodAll` 幂等；RLE 属性测试；Mac 头 / Classic 识别；手工样例往返 | 2,700 / 1,800 |
| **W3 build：数据表 + 放置 + 电水** | `[v1]` `data/buildings.ts(256)/tools.ts/techBaseYears.ts`、`FOOTPRINT` 对账、`canPlace/place/demolish/zoneRect/dezone/network 放置（调用 W5 的选形）`、费用门控、`preview`、`availability`；电 / 水两遍 BFS、电厂表、`dirty` 重扫、线 / 管放置；`[v2]` NIMBY、水塔 / 净水 / 淡化、电厂寿命与年度更新、Energy Conservation、微模拟槽位分配调用 | `src/data/**`、`src/sim/placement/**`、`src/sim/utilities/**` | 实现 `Queries.placement/utilities`、`Actions.requestRescan`；消费 `charge/allocMicrosim/setXbld/setXzon/setXund/setXbit/pieceFor` | `catalogue` §3.2 全部不变量；造价快照；`canPlace` 12 种原因；`power-water.md` §3.8 T1–T9；762 格；水塔二值 | 2,900 / 2,100 |
| **W4 zones + 需求** | `[v1]` 4×4 子步访问、`LotState`（`priv`）、`findLot`、施工 / 衰退 / 废弃状态机、人口汇总 / 税基、RCI 需求（主干 + 税率 + cap）、`census` 快照；`[v2]` 11 产业、邻城、国家经济、教堂、贫富档迟滞、legacy score 模型 | `src/sim/zones/**` | 消费 `q.utilities.hasPower/poweredSelf/watered`、`q.transport.hasAccess/runTrip`、`q.services`（地价）、`act.setXbld/setXzon`；实现 `Queries.zones` | `zones` §3.7 八项（首栋房子从电线旁长出、24 偏移、地价门槛、出行失败只衰退、需求 0 静止、税基含 arco、确定性） | 2,000 / 1,300 |
| **W5 transport + 交通** | `[v1]` 五族 15 片段选形与交叉件（`pieceFor`）、`hasAccess`（24 偏移 + 脏缓存）、`runTrip`（表驱动转移、回溯、512 栈）、`addTraffic` 调用、`roadTileCounts`、邻城连接计数；`[v2]` 高速块 / 匝道 / 隧道 / 桥与对话框 / 2×2 车站 / 地铁 / 地铁↔铁路 / 预算衰败 / 装饰列车谓词 | `src/sim/transport/**` | 实现 `Queries.transport`、`Actions.markAccessDirty`；消费 `act.addTraffic/allocMicrosim`、`q.terrain` | 24 偏移测试（(2,2)/(3,1) 不可达，(3,0)/(2,1) 可达）；转移表逐行；回溯恢复步数；`roadTileCounts` 增量 = 全量；桥长度阈值 | 2,600 / 1,400 |
| **W6 services** | `[v1]` 八张图层重算（污染 / 中心 / 宜居 / 地价 / 覆盖 / 密度 / 增长 / 犯罪）、警 / 消 / 医 / 校 / 公园放置效果、微模拟记录分配、`XTRF` owner（`addTraffic/decayTraffic/trafficReport`）、里程碑、诉求链 `cityStatus`；`[v2]` 人口学全量、年度微模拟全表、支持率抽样、军事基地、Arcology、海港 / 机场生长、NIMBY 窗口 | `src/sim/services/**` | 实现 `Queries.services`、`Actions.addTraffic/allocMicrosim/freeMicrosim`；消费 `q.economy.funding`、`q.utilities`、`q.transport.roadTileCounts`、`state.census` | `Σ XVAL == landValueSum`；覆盖图案值表；`decayTraffic` 后 `Σ XTRF == trafficReport.total`；里程碑严格大于；人口学月序（v2） | 2,800 / 1,400 |
| **W7 economy + 情景** | `[v1]` `settleMonth`（税收 / 经费 / 利息 / 历史块）、`charge/canAfford`、债券发行 / 偿还（评级简化为 fed + 张数）、预算视图模型、`closeYear`、图表推送、Hard 开局债券；`[v2]` 法令金额与位序、信用评级全式、弹劾、情景加载 / 评估 / 写回、`taxGripe/underfunded` | `src/sim/economy/**` | 实现 `Queries.economy`、`Actions.charge`；消费 `state.census`、`q.services.structureCounts`、`q.transport.roadTileCounts`、`counts` | `splitMonthly`；Hard 开局债券；50 张 25% 无溢出；法令向下取整；情景 0 = 不检查；读档重建 YTD | 1,900 / 1,100 |
| **W8 art（程序化精灵）** | `[v1]` 调色板、光栅原语、地形 14 坡面 ×3 海拔带、水面 21 形、路网 / 铁路 / 电线 / 管线 15 片段、树 7 档、瓦砾 / 分区底色 / 施工 / 废弃、参数化建筑骨架（§6）覆盖全部 ≥ 0x70、`ProceduralSpriteProvider`；`[v2]` 逐 ID 配方表、覆盖物 / 角色 / 图标、循环色位图、`art:sheet` | `src/art/**`、`tools/art-sheet.ts` | 实现 `SpriteProvider`；消费 `FOOTPRINT`、`IndexedBitmap` | 位图哈希快照；菱形行宽规则；无缝不重叠；多样性断言 | 2,400 / 1,300 |
| **W9 render（PixiJS v8）** | `[v1]` `Application`、投影 / 拾取 / 旋转置换、可见格精灵池、图集 + 烘焙、脏格更新、预览层、断电图标、三档缩放、小地图位图生成器；`[v2]` 分块缓存、地下视图、动画时钟、调色板循环、角色插值、热力叠加 | `src/render/**` | 实现 `Renderer`；消费 `RenderSource`、`ViewState`、`SpriteProvider`、`SLOPE_ROT_CCW`（从 `sim/terrain/slope.ts` 只 import 常量——唯一允许的 render→sim import，lint 白名单） | 像素快照（旋转用例、翻转用例）；拾取往返；脏格只更新受影响精灵 | 2,200 / 1,300 |
| **W10 shell（ui + app + e2e）** | `[v1]` `h()/Store`、菜单栏、浮动工具栏 + 子工具条、状态区、`WindowManager/ModalHost`、`ToolController` 十模式、NewCity / Budget(简) / Map / Query / Save-Load、`app/{boot,loop,session}`、Playwright 冒烟；`[v2]` 其余窗口、触控手势、窄屏布局、键盘全表、报纸视图、情景窗口 | `src/ui/**`、`src/app/boot.ts loop.ts session.ts`、`e2e/*.spec.ts` | 消费 `SimHost`、`Command/SimEvent`、`Queries`、`Renderer`、`data/tools`（经 `host.catalogue`） | 工具状态机单测（jsdom）；`smoke.spec`（对桩也能跑）；`hash.spec` | 2,600 / 1,500 |
| **W11 events**（第二波） | 灾害状态机 / 毁损例程 / `marker + xtxtShadow` / 天气 / 科技时间线 / 报纸池与顾问 / 常驻物件 / 调度单位 | `src/sim/events/**` | 实现 `Actions.destroyStructure/news`、`Queries.disasters/tech`；消费 `q.services.cityCenter`、`q.transport.*Mask/bridgeBlocksShips`、`act.setXbld/setTerrain` | 警局点火扑灭后标签不变；灾害中快照 / `.SC2` 往返；空难按需起飞；列车三槽原子；天气权重和 = 100；发明槽位 | 2,800 |
| **W12 assets（DAT 导入）**（第二波） | 精灵归档 / 解码 / ID 对齐、调色板 BMP 与循环、文本库、三来源导入、IndexedDB、Worker、`DatSpriteProvider`、自带 DOM 导入面板 `mountAssetImporter(el)` | `src/io/assets/**` | 实现 `SpriteProvider`（dat）、`AssetStore`；消费 `IndexedBitmap`、`Palette` | §3.5.4 手工夹具（重复 ID 两策略）；`cycledIndex` 方向；`identify` 魔数表；隐私 lint | 1,800 |

集成（T+7 起，Lead）：删除 `app/stubs/**` 中已被替换的桩、修 `wire.ts` 的系统顺序、跨模块修补只许在**对方 WP 的分支上提 patch**，不直接改。

### 9.2 WP 内部约定

每个 `src/sim/<id>/`：`index.ts`（`export function createXSystem(): System`）、`tuning.ts`（`XTuning` + `DEFAULT_X_TUNING`；所有 `[低]/[设计]` 数值在此）、`phases.ts`、`commands.ts`、`queries.ts`、`save.ts`（`importFrom/exportTo/postLoad`）、`*.test.ts`。调参经 `getTuning(ctx, 'zones', DEFAULT_ZONE_TUNING)` 浅合并，契约不认识任何模块的 Tuning 类型。私有运行态一律放 `ctx.state.priv[id]`（快照可序列化），别的模块不读。

### 9.3 共享契约代码（`src/contracts/`，T+1:30 冻结；此处为完整签名，WP0 原样落地并补实现体）

```ts
// ===== grid.ts =====
export const MAP = 128, TILES = 16384, HALF_N = 4096, QUARTER_N = 1024, MAX_ALT = 31;
export const tileIndex = (x: number, y: number) => x * 128 + y;      // x 主序（file-formats §2.2.1）
export const tileX = (i: number) => i >> 7, tileY = (i: number) => i & 127;
export const halfIndex = (x: number, y: number) => (x >> 1) * 64 + (y >> 1);
export const quarterIndex = (x: number, y: number) => (x >> 2) * 32 + (y >> 2);
export const inMap = (x: number, y: number) => x >= 0 && y >= 0 && x < 128 && y < 128;
export const enum Dir { T = 0, R = 1, B = 2, L = 3 }                 // T=−y R=+x B=+y L=−x
export const DX: readonly number[] = [0, 1, 0, -1], DY: readonly number[] = [-1, 0, 1, 0];
export function neighbor(i: number, d: Dir): number;                 // 越界 −1
export const SCAN_NEIGHBORS: ReadonlyArray<readonly [number, number]> = [[0, -1], [-1, 0], [0, 1], [1, 0]]; // 电水 BFS 顺序
export const enum XBit { SaltWater = 0x01, Flipped = 0x02, Water = 0x04, Mark = 0x08, Watered = 0x10, Piped = 0x20, Powered = 0x40, Powerable = 0x80 }
export const enum Corner { BL = 0x10, BR = 0x20, TL = 0x40, TR = 0x80, All = 0xF0 }
export const ANCHOR_BIT = Corner.TL;                                 // 全仓库唯一锚点约定
export const enum ZoneCode { None = 0, LightR, DenseR, LightC, DenseC, LightI, DenseI, Military, Airport, Seaport }
export const enum CityMode { TerrainEdit = 0, City = 1, Disaster = 2 }
export const DEVELOPED_FIRST = 0x70;

// ===== footprint.ts =====（catalogue §3.2 的集合；W3 的 data/buildings.ts 用测试对账，不得另写尺寸表）
export const FOOTPRINT: Uint8Array;                                  // 256；2x2: 0x61–0x6B, 0x8C–0xAD, 0xEB–0xF7; 3x3: 0xAE–0xC5, 0xD0–0xD6, 0xF8–0xFA; 4x4: 0xC9–0xCF, 0xD7–0xDA, 0xFB–0xFF; 其余 1（0x49/0x4A 高速直线段按 1 计）
export function anchorOf(l: Pick<TileLayers, 'xbld' | 'xzon'>, i: number): number;   // 格 → TL 锚格；xbld < 0x0E 或损坏 → −1；≤16 次探测
export function forEachLotTile(anchor: number, n: number, fn: (i: number, dx: number, dy: number) => void): void;
export function cornerBits(n: number, dx: number, dy: number): number;              // 1x1 → 0xF0；角格 TL/TR/BL/BR；内部 0

// ===== net.ts =====（transport §2.1 / §2.3；五族共用）
export const PIECE_MASK: readonly number[];                          // 15 项，bit0=T bit1=R bit2=B bit3=L
export const NET_BASE = { power: 0x0E, road: 0x1D, rail: 0x2C, subway: 0x01, pipe: 0x10 } as const;
export type NetFamily = keyof typeof NET_BASE;
export const isRoad: (id: number) => boolean, isRail: (id: number) => boolean, isHighway: (id: number) => boolean,
             isBridge: (id: number) => boolean, isPowerCarrier: (id: number) => boolean, isStationTile: (id: number) => boolean;
export const ACCESS_OFFSETS: ReadonlyArray<readonly [number, number]>;   // 24 偏移，transport §3.5 顺序

// ===== prng.ts =====（economy §2.13；每方法恰消费一次 next32；mulberry32 + FNV-1a）
export interface Prng { next32(): number; next15(): number; int(n: number): number; range(lo: number, hi: number): number;
  float(): number; bit(): boolean; pick<T>(a: readonly T[]): T; shuffle<T>(a: T[]): void; state(): number; seed(s: number): void }
export function createPrng(seed: number): Prng;
export function hash32(...parts: (number | string)[]): number;
export function fnv1aBytes(h: number, bytes: ArrayLike<number>): number;
export function hashNoise(seed: number, x: number, y: number): number;   // [0,1) 无状态，art 用

// ===== state.ts =====
export interface TileLayers { alt: Uint8Array; waterLevel: Uint8Array; tunnelLevels: Uint8Array;
  xter: Uint8Array; xbld: Uint8Array; xzon: Uint8Array; xund: Uint8Array; xtxt: Uint8Array; xbit: Uint8Array;
  xlab: Uint8Array; xmic: Uint8Array; xthg: Uint8Array }
export interface DataMaps { xtrf: Uint8Array; xplt: Uint8Array; xval: Uint8Array; xcrm: Uint8Array; xplc: Uint8Array; xfir: Uint8Array; xpop: Uint8Array; xrog: Uint8Array }
export interface Counts { tile: Int32Array; zone: Int32Array; military: Int32Array }
export type Speed = 1 | 2 | 3 | 4 | 5;
export interface ClockState { age: number; foundedYear: number; speed: Speed; mode: CityMode; modalPause: number; phaseCursor: number; accumMs: number; disasterTicks: number }
export interface GameDate { year: number; month: number; day: number }
export function dateOf(c: ClockState): GameDate;  export const monthIndex: (age: number) => number;
export interface TaxRates { r: number; c: number; i: number }
export interface Bond { rateRaw: number; issuedYear: number; issuedMonth: number }
export const enum BudgetLine { Police = 0, Fire, Health, Schools, Colleges, Roads, Highways, Bridges, Rail, Subway, Tunnel }
export const enum OrdinanceId { SalesTax = 0, IncomeTax, LegalizedGambling, ParkingFines, ProReading, AntiDrug, CprTraining, NeighborhoodWatch,
  EnergyConservation, NuclearFreeZone, HomelessShelter, PollutionControls, VolunteerFire, SmokingBan, FreeClinics, JuniorSports,
  TouristAdvertising, BusinessAdvertising, CityBeautification, AnnualCarnival }
export interface EconomyState { funds: number; difficulty: 1 | 2 | 3; taxRate: TaxRates; industryTax: Int32Array; funding: Uint8Array;
  ordinances: number; bonds: Bond[]; fedRateRaw: number; autoBudget: boolean; counters: { advertising: number; fame: number }; impeached: boolean }
export interface CensusSnapshot { res: number; com: number; ind: number; arcoPop: number; normalPop: number; citySize: number;
  taxableRes: number; taxableCom: number; taxableInd: number; workforcePct: number; workforce: number; jobs: number; unemployedN: number; unemploymentPct: number;
  tiles: { res: number; com: number; ind: number; total: number } }
export interface RciDemand { r: number; c: number; i: number }  export type DemandCaps = RciDemand;
export interface IndustryState { ratio: Int32Array; tax: Int32Array; demand: Int32Array; pollutionBonus: number }
export interface NeighborCity { index: number; name: string; population: number; value: number; fame: number; edge: 0 | 1 | 2 | 3; connections: { road: number; rail: number; highway: number } }
export interface NationalEconomy { population: number; value: number; tax: number; trend: 0 | 1 | 2 }
export interface DemographicsState { cohorts: Int32Array /*60 = 20 × [count, eqSum, leSum]*/; workforcePct: number; workforceEQ: number; workforceLE: number }
export interface RewardState { progression: number; grantedMask: number; militaryBase: 0 | 1 | 2 | 3 | 4 | 5; prisonBonus: 0 | 1; oldArrests: number; stadiumTeams: number; mayorApproval: number }
export interface WeatherState { heat: number; wind: number; humid: number; trend: number; season: 0 | 1 | 2 | 3 }
export interface DisasterCore { pending: number; current: number; active: boolean; pointX: number; pointY: number; noDisasters: boolean; autoGoto: boolean; windOverride: number | null }
export interface TechState { invented: Int32Array /*17*/; announced: Uint8Array /*17*/ }
export interface PowerReport { generation: number; consumers: number; supplied: number; usagePct: number; unpoweredBuildingTiles: number }
export interface WaterReport { supply: number; consumers: number; watered: number; usagePct: number; towerCapacity: number; towerCharged: number; treatmentCapacity: number; treatmentSufficient: boolean; unwateredBuildingTiles: number }
export interface TrafficReport { total: number; graph: number; roadTiles: number; highwayTiles: number; bridgeTiles: number }
export interface DataMapTotals { pollution: number; landValue: number; crime: number; developedTiles: number; centerX: number; centerY: number }
export type SnapshotValue = number | string | boolean | ArrayBufferView | SnapshotValue[] | { [k: string]: SnapshotValue };
export interface CityState {
  readonly formatVersion: 1; cityName: string; mayorName: string;
  layers: TileLayers; maps: DataMaps; counts: Counts; xgrp: Int32Array; rawMisc: Int32Array;
  clock: ClockState; terrain: { seaLevel: number; coast: boolean; river: boolean; rotation: 0 | 1 | 2 | 3 }; economy: EconomyState;
  census: CensusSnapshot; demand: RciDemand; caps: DemandCaps; industry: IndustryState; neighbors: NeighborCity[]; national: NationalEconomy;
  demographics: DemographicsState; rewards: RewardState; totals: DataMapTotals; traffic: TrafficReport;
  weather: WeatherState; disaster: DisasterCore; tech: TechState; utilities: { power: PowerReport; water: WaterReport };
  view: { x: number; y: number; zoom: number };
  priv: Partial<Record<SystemId, SnapshotValue>>;                   // 各系统私有持久态：进快照、进哈希、不进 .SC2
}
export function createCityState(): CityState;

// ===== clock.ts =====（economy §2.3 / §3.2 原表）
export type PhaseId = 'settleMonth' | 'closeYear' | 'techCheck' | 'nationalAnnual' | 'nationalAnnual.economy' | 'neighborsAnnual' | 'approvalSurvey'
  | 'facilityAnnual' | 'utilitiesAnnual' | 'budgetWindow' | 'beginMonth' | 'powerScan' | 'dataMaps' | 'growthScan' | 'trafficDecay' | 'waterScan'
  | 'census' | 'demand' | 'demographics' | 'graphs' | 'milestones' | 'scenario' | 'solvency' | 'uiRefresh' | 'weatherAndDisaster' | 'cityStatus' | 'news';
export const DAY_PHASES: Readonly<Record<number, readonly PhaseId[]>>;
export const PHASE_OWNER: Readonly<Record<PhaseId, SystemId>>;      // growthScan / uiRefresh 归 core
export type LayerName = 'XBLD' | 'XZON' | 'XUND' | 'XBIT.POWERED' | 'XBIT.WATERED' | 'XTRF' | 'XPLT' | 'XVAL' | 'XCRM' | 'XPLC' | 'XFIR' | 'XPOP' | 'XROG' | 'XMIC';
export interface PhaseIo { reads: LayerName[]; bulk: LayerName[]; point: LayerName[]; usesPrng: boolean; canSuspend: boolean }
export const PHASE_IO: Readonly<Record<PhaseId, PhaseIo>>;
export const growthStep = (day: number) => Math.floor((day - 3) / 4), growthSubstep = (day: number) => (day + 1) % 4;
export const MS_PER_DAY: Readonly<Record<Speed, number>>;           // {1: Infinity, 2: 480, 3: 160, 4: 40, 5: 0}
export const DISASTER_TICK_MS: Readonly<Record<Speed, number>>;     // {1: Infinity, 2: 200, 3: 100, 4: 50, 5: 25}

// ===== system.ts =====（任务书所谓 `System { name; step(ctx) }` 的落地形态）
export type SystemId = 'core' | 'terrain' | 'placement' | 'utilities' | 'zones' | 'transport' | 'services' | 'economy' | 'events';
export interface Diagnostic { level: 'info' | 'warn' | 'error'; code: string; message: string; at?: string }
export interface SimContext {
  readonly state: CityState; readonly prng: Prng; readonly tuning: Partial<Record<SystemId, unknown>>;
  readonly day: number;                       // 0..24；灾害 / 物件 tick 中为 −1
  readonly events: SimEvent[]; readonly diag: Diagnostic[];
  readonly q: Queries; readonly act: Actions; readonly catalogue: CatalogueApi;
}
export function getTuning<T extends object>(ctx: SimContext, id: SystemId, defaults: T): T;
export type PhaseResult = 'done' | 'suspend';
export type PhaseRunner = (ctx: SimContext, day: number) => PhaseResult;
export type CommandHandler<C extends Command = Command> = (ctx: SimContext, cmd: C) => CommandResult;
export interface System {
  readonly id: SystemId;
  readonly phases?: Partial<Record<PhaseId, PhaseRunner>>;          // 必须 ⊆ PHASE_OWNER 中标为本系统者
  growthVisit?(ctx: SimContext, x: number, y: number): void;        // core 按 transport → zones → services 调用
  disasterTick?(ctx: SimContext): void; thingsTick?(ctx: SimContext): void;
  readonly commands?: { [K in Command['type']]?: CommandHandler<Extract<Command, { type: K }>> };
  readonly queries?: Partial<Queries>;                              // 只能填自己的键
  readonly actions?: Partial<Actions>;                              // 只能填 ACTION_OWNER 归自己的键
  init(ctx: SimContext, p: NewCityParams): void;                    // 新城
  importFrom?(ctx: SimContext, doc: Sc2Document, diag: Diagnostic[]): void;   // 读 .SC2（快照不经此）
  exportTo?(ctx: SimContext, doc: Sc2Document): void;               // 写 .SC2
  postLoad?(ctx: SimContext): void;                                 // 任何读档后（快照 / .SC2）：重建私有缓存，不消费 PRNG
  onTilesChanged?(ctx: SimContext, tiles: ReadonlyArray<number>, kind: 'terrain' | 'building' | 'zone' | 'underground' | 'bit'): void;
}
export interface NewCityParams { name: string; difficulty: 1 | 2 | 3; startYear: 1900 | 1950 | 2000 | 2050; seed: number; terrainSeed: number;
  terrain: { coast: boolean; river: boolean; hills: number; water: number; trees: number } }
export function nullSystem(id: SystemId): System;                   // 桩：无阶段、无命令、无查询（查询由 testkit 乐观桩补）

// ===== queries.ts =====（跨系统只读；实现者 = owner；缺席时由 testkit/乐观桩 提供）
export interface TerrainQuery { alt(i: number): number; slope(i: number): number; isWater(i: number): boolean; isSalt(i: number): boolean; isFlatDry(i: number): boolean;
  waterDepth(i: number): number; treeDensity(i: number): number; cornerHeights(i: number): [number, number, number, number]; distanceToWater(i: number): number }
export interface UtilityQuery { poweredSelf(i: number): boolean; hasPower(i: number): boolean; watered(i: number): boolean; plantAt(i: number): { kind: string; ageYears: number; loadPct: number } | null }
export interface TripResult { ok: boolean; usedBus: boolean; usedRail: boolean; usedSubway: boolean; steps: number }
export interface TransportQuery { hasAccess(x: number, y: number): boolean; runTrip(i: number, zone: ZoneCode, popLevel: 0 | 1 | 2 | 3 | 4): TripResult;
  pieceFor(family: NetFamily, i: number): number;                   // 按四邻与坡面给出应写入的 XBLD/XUND 值；非法 → −1
  roadDistance(x: number, y: number): number; roadTileCounts(): { roadTiles: number; highwayTiles: number; bridgeTiles: number };
  connections(): { commerce: number; industry: number; total: number }; stationAt(i: number): { kind: number; id: number } | null;
  bridgeBlocksShips(i: number): boolean; railMask(i: number): number; subwayMask(i: number): number }
export interface ZonesQuery { lotAt(i: number): { anchor: number; size: 1 | 2 | 3; level: number; tier: number; phase: string } | null;
  recreation(): { smallPark: number; bigPark: number; marina: number; zoo: number; stadium: number } }
export interface ServicesQuery { structureCounts(): { police: number; prison: number; fire: number; hospital: number; school: number; college: number; busDepot: number };
  graphCurrent(s: 'pollution' | 'landValue' | 'crime'): number; cityCenter(): { x: number; y: number }; landValue(i: number): number;
  microsimOf(i: number): { slot: number; tileId: number; stat0: number; stat1: number; stat2: number; stat3: number } | null;
  queryStats(i: number): ReadonlyArray<{ key: string; value: string | number }>; seaportCranes(): number; airportRunwayGroups(): number; airportTiles(): number }
export interface EconomyQuery { canAfford(cost: number): boolean; funding(line: BudgetLine): number; ordinance(id: OrdinanceId): boolean; year(): number; budgetView(): unknown; bondView(): unknown }
export interface TechQuery { invented(key: TechKey): boolean }
export interface DisasterQuery { marker(i: number): number; focusPoints(): ReadonlyArray<{ x: number; y: number }>; thingsAt(i: number): ReadonlyArray<ThingView>; dispatchAvailable(kind: 0 | 1 | 2): number }
export interface ThingView { slot: number; type: number; x: number; y: number; z: number; px: number; py: number; dir: number; variant: number }
export interface PlacementQuery { canPlace(id: number, x: number, y: number): { ok: boolean; reason?: string; cost: number };
  availability(toolId: string): { enabled: boolean; reason?: string };
  preview(cmd: Command): { ok: boolean; cost: number; tiles: number[]; badTiles: number[]; reason?: string } }   // 纯函数，不消费 PRNG
export interface Queries { terrain: TerrainQuery; utilities: UtilityQuery; transport: TransportQuery; zones: ZonesQuery; services: ServicesQuery;
  economy: EconomyQuery; tech: TechQuery; disasters: DisasterQuery; placement: PlacementQuery }

// ===== actions.ts =====（跨系统写；每键一个 owner）
export type DestroyCause = number | 'PLANT_EOL' | 'BRIDGE' | 'DECAY' | 'LAUNCH' | 'BULLDOZE';
export interface Actions {
  setXbld(i: number, id: number): void; setXzon(i: number, v: number): void; setXund(i: number, v: number): void;       // core
  setXbit(i: number, mask: number, on: boolean): void; setTerrain(i: number, alt: number, xter: number, waterLevel: number): void;
  layerChanged(layer: 'xbit' | 'maps' | 'xtxt' | 'xthg' | 'xmic' | 'all'): void; emit(ev: SimEvent): void;
  charge(cost: number): boolean;                                                                                        // economy
  destroyStructure(x: number, y: number, cause: DestroyCause): void; news(type: number, value: number): void;          // events（桩：清格为瓦砾）
  addTraffic(tile: number, weight: number): void; allocMicrosim(tileId: number): number; freeMicrosim(slot: number): void; // services
  requestRescan(kind: 'power' | 'water'): void;                                                                         // utilities
  markAccessDirty(tiles: ReadonlyArray<number>): void;                                                                  // transport
}
export const ACTION_OWNER: Readonly<Record<keyof Actions, SystemId>>;

// ===== commands.ts =====
export type Command =
  | { type: 'placeBuilding'; id: number; x: number; y: number; team?: number }
  | { type: 'zoneRect'; zone: ZoneCode; x0: number; y0: number; x1: number; y1: number }
  | { type: 'dezone'; tiles: number[] } | { type: 'bulldoze'; tiles: number[] }
  | { type: 'terrainTool'; tool: 'raise' | 'lower' | 'level' | 'water' | 'trees' | 'forest' | 'stream' | 'stretch' | 'seaLevel'; path: number[]; arg?: number }
  | { type: 'network'; kind: NetFamily | 'highway'; from: number; to: number; bridge?: number }
  | { type: 'tunnel'; at: number } | { type: 'neighborConnection'; at: number; accept: boolean }
  | { type: 'setTax'; rates: TaxRates } | { type: 'setIndustryTax'; k: number; rate: number }
  | { type: 'setFunding'; line: BudgetLine; pct: number } | { type: 'setOrdinance'; id: OrdinanceId; on: boolean }
  | { type: 'issueBond' } | { type: 'repayBond' }
  | { type: 'setSpeed'; speed: Speed }
  | { type: 'setOption'; key: 'autoBudget' | 'autoGoto' | 'noDisasters' | 'sound' | 'music' | 'paperDelivery' | 'extraPaper'; value: boolean }
  | { type: 'requestDisaster'; kind: number; x?: number; y?: number } | { type: 'dispatch'; kind: 0 | 1 | 2; x: number; y: number }
  | { type: 'sign'; at: number; text: string | null } | { type: 'rename'; slot: number; text: string }
  | { type: 'cheat'; code: string } | { type: 'terrainDone' } | { type: 'setView'; x: number; y: number; zoom: number; rotation: 0 | 1 | 2 | 3 }
  | { type: 'modalAnswer'; dialog: string; answer: number };
export interface CommandResult { ok: boolean; cost: number; reason?: string; changed: number[] }
export interface LoggedCommand { age: number; seq: number; cmd: Command }

// ===== events.ts =====（sim → 外界；全部可 JSON 化）
export type SimEvent =
  | { type: 'monthSettled'; funds: number; net: number } | { type: 'yearClosed'; year: number } | { type: 'budgetWindow' }
  | { type: 'insufficientFunds'; cost: number } | { type: 'bondIssued'; rateRaw: number } | { type: 'bondRepaid' } | { type: 'bondRefused'; reason: string }
  | { type: 'fedRate'; direction: 'up' | 'down'; rateRaw: number } | { type: 'ordinance'; id: OrdinanceId; enacted: boolean }
  | { type: 'underfunded'; line: BudgetLine } | { type: 'taxGripe'; rate: number; severe: boolean } | { type: 'impeached'; funds: number }
  | { type: 'brownout'; unpowered: number } | { type: 'waterShortage'; unwatered: number } | { type: 'needPower' } | { type: 'needWater' }
  | { type: 'plantAging'; anchor: number } | { type: 'plantExpired'; anchor: number } | { type: 'plantAutoRebuilt'; anchor: number; cost: number }
  | { type: 'citizenDemand'; key: string } | { type: 'milestone'; progression: number } | { type: 'reward'; bit: number } | { type: 'militaryOffer' }
  | { type: 'approval'; pct: number; gripes: number[] } | { type: 'fundEducation' } | { type: 'fundPrison' } | { type: 'arcoLaunch'; count: number }
  | { type: 'weatherChanged'; weather: WeatherState } | { type: 'disasterStarted'; kind: number; x: number; y: number } | { type: 'disasterEnded'; kind: number; deaths: number }
  | { type: 'structureDestroyed'; x: number; y: number; oldId: number; cause: DestroyCause } | { type: 'explosion'; x: number; y: number }
  | { type: 'techInvented'; slot: number } | { type: 'newsStory'; storyType: number; value: number } | { type: 'paper'; extra: boolean }
  | { type: 'thingSpawned'; slot: number; thingType: number } | { type: 'thingRemoved'; slot: number; reason: string } | { type: 'helicopterReport'; x: number; y: number; level: number }
  | { type: 'bridgeCollapse'; x: number; y: number } | { type: 'connectionOffer'; at: number } | { type: 'bridgeChoice'; from: number; to: number; options: number[] }
  | { type: 'scenario'; result: 'won' | 'lost' } | { type: 'modeChanged'; mode: CityMode } | { type: 'message'; key: string; args?: Record<string, string | number> };

// ===== catalogue.ts =====（类型在契约；数据表由 W3 的 src/data 提供并经 host.catalogue 注入）
export type Footprint = 1 | 2 | 3 | 4;
export type TechKey = 'gas' | 'nuclear' | 'solar' | 'wind' | 'microwave' | 'fusion' | 'airport' | 'highways' | 'buses' | 'subways' | 'waterTreatment' | 'desalinization' | 'arcoPlymouth' | 'arcoForest' | 'arcoDarco' | 'arcoLaunch';
export interface BuildingDef { id: number; key: string; name: string; category: string; size: Footprint; placeable: boolean; tool?: string; cost: number; upkeepPerYear: number;
  budgetLine?: string; tech?: TechKey; unlock?: { rewardBit: 0 | 1 | 2 | 3 | 4; popOver: number; once: boolean }; powerable: boolean; consumesPower: boolean; piped: boolean; consumesWater: boolean;
  pollutionPerTile: number; popWeight: number; residents: number; jobs: number; zone?: { type: 'R' | 'C' | 'I'; tier: 0 | 1 | 2; weight: number; level: 1 | 2 | 3 | 4 };
  transition?: 'construction' | 'abandoned'; microsim?: { type: number; shared: boolean }; nimby: boolean; orient: 'none' | 'byId' | 'flipBit' | 'byIdAndFlip'; lifetimeYears?: number;
  placement?: { terrain: 'flat' | 'waterfall' | 'slopeEntrance' | 'any'; waterCellsInFootprint?: [number, number]; needsAdjacent?: 'road' | 'rail' | 'highway+road' }; phase: 1 | 2 }
export interface ToolDef { id: string; group: string; label: string; placeMode: 'point' | 'line' | 'rect' | 'path'; cursor: Footprint | 'variable' | 'none'; cost: number;
  costUnit: 'tile' | 'segment2x2' | 'click' | 'building' | 'changedTile' | 'none'; buildingIds?: readonly number[]; zoneCode?: number; undergroundView?: boolean; tech?: TechKey;
  hotkey?: string; availableIn: 'city' | 'map' | 'both'; phase: 1 | 2 }
export interface CatalogueApi { BUILDINGS: readonly BuildingDef[]; TOOLS: readonly ToolDef[]; TECH_BASE_YEAR: Readonly<Record<TechKey, number>> }

// ===== io.ts =====
export type ChunkId = 'CNAM' | 'MISC' | 'ALTM' | 'XTER' | 'XBLD' | 'XZON' | 'XUND' | 'XTXT' | 'XLAB' | 'XMIC' | 'XTHG' | 'XBIT' | 'XTRF' | 'XPLT' | 'XVAL' | 'XCRM' | 'XPLC' | 'XFIR' | 'XPOP' | 'XROG' | 'XGRP' | 'TEXT' | 'SCEN' | 'PICT' | 'TMPL';
export interface Sc2Document { cityName: string; misc: Int32Array; altm: Uint16Array; xter: Uint8Array; xbld: Uint8Array; xzon: Uint8Array; xund: Uint8Array; xtxt: Uint8Array; xbit: Uint8Array;
  xlab: Uint8Array; xmic: Uint8Array; xthg: Uint8Array; xtrf: Uint8Array; xplt: Uint8Array; xval: Uint8Array; xcrm: Uint8Array; xplc: Uint8Array; xfir: Uint8Array; xpop: Uint8Array; xrog: Uint8Array;
  xgrp: Int32Array; scenario?: { texts: { kind: number; text: string }[]; scen: Uint8Array; pict?: Uint8Array; tmpl?: Uint8Array }; unknownChunks: { id: string; data: Uint8Array }[] }
export const MISC: Readonly<Record<string, number>>;                 // file-formats §3.4.4 全表 + 零区：prngMarker 0x1054, prngState 0x1058, saveFormatVersion 0x105C, viewZoom 0x1060, xtxtShadow 0x10BC
export const miscGet: (m: Int32Array, off: number) => number, miscSet: (m: Int32Array, off: number, v: number) => void;
export const cohortOffset: (k: number, f: 'count' | 'eqSum' | 'leSum') => number;
export interface ReadResult<T> { value: T; diagnostics: Diagnostic[] }
export interface SnapshotCodec { encode(s: CityState): Uint8Array; decode(bytes: Uint8Array, into: CityState): Diagnostic[]; hash(s: CityState): number }

// ===== render.ts =====
export type ZoomLevel = 0 | 1 | 2 | 3 | 4;  export type ArtScale = 'XS' | 'S' | 'M' | 'L' | 'XL';
export interface ViewState { zoom: ZoomLevel; rotation: 0 | 1 | 2 | 3; centerX: number; centerY: number; underground: boolean;
  show: { buildings: boolean; signs: boolean; infrastructure: boolean; zones: boolean }; mapLayer: string | null }
export interface IndexedBitmap { w: number; h: number; data: Uint8Array; anchorX: number; anchorY: number; cycling: boolean }
export type SpriteKind = 'xbld' | 'terrain' | 'water' | 'xund' | 'overlay' | 'actor' | 'ui';
export interface SpriteKey { kind: SpriteKind; id: number; variant?: number; frame?: number }
export interface Palette { rgba: Uint8ClampedArray; cycles: Array<{ start: number; length: number; periodMs: number; dir: 1 | -1 }> }
export interface SpriteProvider { readonly name: 'procedural' | 'dat'; readonly palette: Palette; readonly nativeScales: ReadonlySet<ArtScale>;
  has(key: SpriteKey, scale: ArtScale): boolean; bitmap(key: SpriteKey, scale: ArtScale): IndexedBitmap | null; frameCount(key: SpriteKey): number; fps(key: SpriteKey): number }
export interface RenderSource { readonly state: Readonly<CityState>; readonly q: Pick<Queries, 'disasters' | 'transport' | 'zones' | 'utilities'>;
  takeChanges(): { tiles: Int32Array; layers: string[] }; readonly animTick: number }
export interface Renderer { mount(el: HTMLElement): void; setView(v: ViewState): void; frame(dtMs: number): void; pick(px: number, py: number): { x: number; y: number } | null;
  setPreview(p: { tiles: number[]; bad: number[] } | null): void; setProviders(p: SpriteProvider[]): void; minimap(mode: string, out: Uint8ClampedArray): void; destroy(): void }

// ===== host.ts =====（UI / app 唯一需要知道的 sim 外形；由 core 实现）
export interface SimHost {
  readonly state: Readonly<CityState>; readonly q: Queries; readonly catalogue: CatalogueApi;
  dispatch(cmd: Command): CommandResult; tick(dtMs: number): void; resume(): void; drainEvents(): SimEvent[];
  hash(): number; commandLog(): readonly LoggedCommand[];
  newCity(p: NewCityParams): void; loadSnapshot(bytes: Uint8Array): Diagnostic[]; saveSnapshot(): Uint8Array;
  importSc2(doc: Sc2Document): Diagnostic[]; exportSc2(): Sc2Document;
}
export interface EventBus { on<K extends SimEvent['type']>(type: K, fn: (e: Extract<SimEvent, { type: K }>) => void): () => void; publish(e: SimEvent): void }
```

**不可协商项**（改动须 RFC）：`tileIndex` 主序、`ANCHOR_BIT = TL`、`DAY_PHASES/PHASE_OWNER/PHASE_IO`、`ACTION_OWNER`、`Command/SimEvent` 的 `type` 字面量、`Prng` 语义与 mulberry32 测试向量、`XBit` 掩码、`FOOTPRINT`、`priv` 的可序列化约束。

### 9.4 契约变更协议（日内）

- 只允许**加法**：新增可选字段、新增 `Command/SimEvent` 变体、新增 `Queries` 方法（桩同时给默认实现）。禁止改名、改语义、删键。
- 流程：在 `docs/arch/contract-rfc.md` 追加一行（谁 / 要什么 / 为什么 / 桩默认值）→ Lead 30 分钟内合并到 `contracts/` 与 `testkit/` → 群通知。等待期间 WP 在自己目录用局部类型先行。
- `testkit` 的乐观桩是契约的一部分：桩返回值必须让"只有 zones + core"的城市也能长房子（这是 T+4 合并列车的玩法冒烟能过的前提）。

---

## 10. 风险与取舍

| # | 风险 / 取舍 | 应对 |
|---|---|---|
| 1 | **契约冻结太早、T+4 才发现缺口** | §9.4 加法式 RFC + `priv` / `tuning` 逃生口；中途合并列车把缺口暴露在 T+4 而不是 T+7 |
| 2 | **乐观桩掩盖集成 bug**（桩说有电有路，真模块说没有） | 合并列车 #2 的玩法冒烟用 `golden-mini-city` 真命令脚本；每个 WP 的验收测试必须同时对"桩环境"与"自家真实现"运行一次 |
| 3 | **两种存档格式** | 快照是 schema 驱动的通用代码（不会漂移）；`.SC2` 往返测试只比对真源层；`priv` 明确不进 `.SC2` |
| 4 | **W3 过重**（数据表 + 放置 + 电水） | 数据表用 catalogue 规格的表格半机械转写（30 min）；水塔 / 净水 / 淡化 / NIMBY / 寿命全部 v2；若 T+4 落后，Lead 接走 utilities 的 `waterScan` |
| 5 | **规格残留冲突**（zones §3.1 的 `y*128+x`、transport 的 `(y,x)` 升序措辞、services 用 TR 原点） | 契约只暴露 `tileIndex/tileX/tileY`；lint 测试 grep `* 128` / `% 128` 字面量；电水 T2/T4–T7 反转置测试；TR 原点由 `anchorOf + FOOTPRINT` 换算 |
| 6 | **浮点确定性**（`pow`、`float()` 概率比较、JSON 数字格式） | ESLint 禁 `Math.pow/exp/log/sin/cos/sqrt`；`pow(n,1.15)` 多项式近似；真源只放整数；`float()` 跨引擎一致 |
| 7 | **生长扫描最坏 40 ms/月** | 表驱动 `step()`、预分配栈、`hasAccess` 脏缓存；长跑记录 p95；超预算时把四次尝试改为位扫描 |
| 8 | **Pixi v8 API 漂移**（`cacheAsTexture`、`TextureSource`） | v1 不用分块缓存；Pixi 只在 `render/pixi/*.ts` 触碰；锁 `^8.6.0`；像素快照 |
| 9 | **原版事实不确定**（车站 2×2、`0x104C`、`0x1018` 语义、费用口径） | 全部进 `tuning.ts` 开关或零区字段，默认取规格裁定；`docs/arch/open-questions.md` 汇总 |
| 10 | **第三方存档导入** | `importFrom` 一律"修复 + 诊断"；导入对话框展示诊断；不阻塞 |
| 11 | **主线程 sim 挤占帧预算** | `maxDaysPerFrame` 按上一帧耗时自适应；`SimHost` 已抽象，`SharedArrayBuffer` + Worker 作 v3 选项 |
| 12 | **程序化美术"不原汁原味"** | 美术 bible 固定网格 / 锚点 / 光照使 DAT 零改动替换；v1 骨架 + v2 逐 ID 配方同签名 |
| 13 | **十人中有人掉线** | 每 WP 的 v1 切片 ≤ 1,500 行；桩保证掉线 WP 不阻塞别人；Lead 的 W1 预留 30% 时间接盘 |
| 14 | **不做**：撤销、联机、Canvas2D 后备、DOS 素材、MIF、XS/XL 档（v1） | 命令日志 + 快照为撤销 / 分支预演留门 |

### 取舍小结

- 用"桩完整应用 + 零重叠目录 + 冻结接线文件"换取合并零冲突与任意时刻可演示；代价是 WP0 的 90 分钟与一份必须写得足够完整的契约（§9.3）。
- 用通用快照换取"存档 / 哈希 / 长跑不等任何人"；代价是多一种文件扩展名（它是 `.SC2` 的超集，不是分叉）。
- 用"渲染 / 查询直接读真源层"换取去掉跨模块缓存；代价是每次拾取 / 查询多 ≤ 16 次数组读取（可忽略）。
- 用 v1 精灵池换取渲染 WP 当天可交付；分块缓存、动画、循环色都是 v2 的纯增量。
