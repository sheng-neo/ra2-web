# 架构提案（sim-first）：`packages/sc2k` 网页版 SimCity 2000 复刻

> 视角：**模拟优先**。先把 128×128 的模拟内核做成可在 Node 中无头跑 100 年、同种子逐字节可复现的纯 TS 系统，渲染 / UI / 美术只是它的观察者与命令来源。
> 依据：`docs/spec/*.md` 十份领域规格（本文只引用，不重述数值）；仓库约定 `CONTRIBUTING.md`、`tsconfig.base.json`、`eslint.config.js`、`vitest.config.ts`。
> 术语：`[决定]` = 本提案拍板的架构决定；`[可选]` = 后续可切换；`§x.y` 不带文件名时指本文章节，带文件名时指规格章节。

## 0. 五条总原则

1. **层即真源，实例即缓存** `[决定]`：`CityState` 中唯一可信的数据是与 `.SC2` 同编码的 TypedArray 图层 + 少量有存档映射的标量结构；建筑实例表、电/水/路网图、车站/桥梁对象、微模拟绑定、灾害标记索引全部是派生缓存，由各模块的 `rebuild()` 幂等重建。于是"读档 → 内存"与"内存 → 写档"都是 O(1) 拷贝，`hash(load(save(S))) == hash(S)` 成为可测的不变量。
2. **一张日历表统治一切**：模拟 tick = 1 天；每天执行 `economy-budget.md` §2.3 的 `DAY_PHASES[day]`，每个阶段恰有一个 owner 模块；阶段可挂起（模态框）并从 `phaseCursor` 续跑。模块之间没有"谁调谁"，只有"谁在第几天第几步写哪一层"。
3. **单一 PRNG 流 + 命令日志 = 可重放城市**：`sim` 流（mulberry32，`economy-budget.md` §2.13）只在阶段与命令处理中消费；玩家命令只在日界执行并带 `(age, seq)` 记录；`replay(seed, commands)` 在 Node 与浏览器给出相同的 `hashState()`。
4. **模块只依赖契约**：`src/sim/<module>` 只能 import `src/contracts` 与 `src/data`；跨模块读经 `ctx.q.*`（查询接口），跨模块写经 `ctx.act.*`（单一 owner 的动作）。这是 14 个工作包可以零沟通并行的前提。
5. **编译期隔离 DOM**：`tsconfig.sim.json` 以 `lib: ["ES2022"]`、`types: []` 单独类型检查 `contracts / data / sim / art / io(纯解析部分)`；任何 `document`、`window`、`performance` 的引用在 sim 侧都是编译错误，而不是 code review 发现的问题。

---

## 1. 包布局

### 1.1 目录

```
packages/sc2k/
  package.json  tsconfig.json  tsconfig.sim.json  vite.config.ts  index.html  README.md
  docs/{spec,arch}/
  tools/                   # tsx 脚本：sim-run.ts（无头长跑）、sim-compare.ts（哈希比对）、art-preview.ts
  e2e/                     # Playwright 冒烟（smoke.spec.ts）
  src/
    main.ts                # 入口：仅 import './app'
    contracts/             # ★ 全 WP 共享契约（类型 + 极少量运行时微函数），WP0 落地后冻结
    data/                  # 数据表 SSOT：buildings.ts / tools.ts / techBaseYears.ts（building-catalogue.md）
    sim/                   # 纯 TS，无 DOM，确定性
      core/                # 调度器、命令队列、事件缓冲、TileWriter、状态哈希、重放、无头入口
      terrain/  utilities/  zones/  transport/  services/  economy/  disasters/  placement/
    io/                    # bytes.ts, sc2/（存档）, sprites/, palette/, text/（纯解析，进 sim tsconfig）
                           # import/（File/IndexedDB/Worker，DOM 侧）
    art/                   # 程序化精灵：raster.ts 原语 + 配方，输出 IndexedBitmap（纯函数，进 sim tsconfig）
    render/                # PixiJS v8 城市视图：投影、分块缓存、图集、动画、拾取
    ui/                    # DOM 外壳：窗口系统、工具栏、菜单、对话框、查询、输入
    app/                   # 组装：wire.ts（模块注册）、loop.ts（RAF）、session.ts（新城/读档/存档）、workers/
```

依赖方向（ESLint `no-restricted-imports` 按目录强制）：`contracts ← data ← sim/* ← io/sc2 ← app`；`art → contracts`；`render → contracts, art(类型)`；`ui → contracts`；只有 `app` 可以 import 所有层。`sim/<a>` 不得 import `sim/<b>`。

### 1.2 `package.json`

```json
{ "name": "sc2k", "version": "0.0.1", "private": true, "type": "module",
  "scripts": {
    "dev": "vite --port 5174", "build": "vite build", "preview": "vite preview",
    "typecheck": "tsc -p tsconfig.json --noEmit && tsc -p tsconfig.sim.json --noEmit",
    "sim:run": "tsx tools/sim-run.ts", "sim:compare": "tsx tools/sim-compare.ts",
    "art:preview": "tsx tools/art-preview.ts", "e2e": "playwright test -c e2e" },
  "dependencies": { "pixi.js": "^8.6.0" },
  "devDependencies": { "@types/node": "^22.10.0", "vite": "^7.0.0", "@playwright/test": "^1.48.0" } }
```

不依赖任何 `@ra2web/*`；测试由根 `vitest run` 的 glob `packages/*/src/**/*.test.ts` 自动纳入，**源码一律相对路径 import**（不引入 path alias，根 vitest 配置零改动）。WP0 需要在根 `eslint.config.js` 追加一段：把现有"模拟内核禁 `Math.random/Date/performance/sin/cos/sqrt/pow…`"规则同样作用于 `packages/sc2k/src/{sim,contracts,data,art}/**`（`art` 用 `hashNoise`）。

### 1.3 `tsconfig`

- `tsconfig.json`：extends base，`lib: ["ES2022","DOM","DOM.Iterable"]`，`types: ["vite/client"]`，`include: ["src","tools","vite.config.ts"]`。
- `tsconfig.sim.json`：extends base，`lib: ["ES2022"]`，`types: []`，`include: ["src/contracts","src/data","src/sim","src/art","src/io/bytes.ts","src/io/sc2","src/io/sprites","src/io/palette","src/io/text"]`，`exclude: ["**/*.test.ts"]`（测试可用 node 类型）。

### 1.4 Vite 与 `index.html`

`vite.config.ts`：`base: './'`（可静态托管）、`build.target: 'es2022'`、`worker: { format: 'es' }`、`server: { port: 5174, host: true }`；无自定义中间件（素材只从本地文件导入，不走 HTTP）。`[可选]` 注释掉的 COOP/COEP 头，启用后可用 `SharedArrayBuffer` 把 sim 搬进 Worker（§3.7）。
`index.html`：`<meta viewport, user-scalable=no>`、`<div id="app">`（UI 外壳挂载点，Pixi canvas 由 `CityView` 创建）、`<script type="module" src="/src/main.ts">`；CSS 变量定义 90 年代斜面风格（`ui-art.md` §1）。

---

## 2. 核心数据模型

### 2.1 `CityState`（真源部分）

| 组 | 字段 | 类型 / 大小 | 存档映射 | 写者 |
|---|---|---|---|---|
| 地块层 | `xter xbld xzon xund xtxt xbit` | `Uint8Array(16384)`，`i = x*128 + y` | 同名 chunk | 见 §2.4 |
| 地形 | `alt waterLevel tunnelLevels` | `Uint8Array(16384)` | `ALTM` 拆位 | terrain |
| 标签/微模拟/物件 | `xlab(6400) xmic(1200) xthg(480)` | `Uint8Array` | 同名 chunk | services / disasters |
| 低分辨率图 | `xtrf xplt xval xcrm`（4096）`xplc xfir xpop xrog`（1024） | `Uint8Array`，`idx64=(x>>1)*64+(y>>1)`、`idx32=(x>>2)*32+(y>>2)` | 同名 chunk | services |
| 时钟 | `clock: ClockState` | 标量 | `MISC 0x0010/0x000C/0x0FEC/0x0004` | core |
| 经济 | `economy: EconomyState` | 见契约 | `MISC` 税线/经费线/债券/法令 | economy |
| 人口与需求 | `census demand industry neighbors national` | 见契约 | `MISC 0x0074…0x0720` | zones |
| 人口学/奖励/微模拟统计 | `demographics rewards` | 见契约 | `MISC 0x007C…, 0x0020/0x0078/0x0E4C/0x1020…` | services |
| 天气/灾害/科技/报纸 | `weather disaster tech news` | 见契约 | `MISC 0x0060…0x0070, 0x0738…, 0x0E50…, 0x1000…0x1048` | disasters |
| 公用/交通统计 | `utilities: UtilityStats`、`traffic: TrafficReport` | 见契约 | `XGRP`、`MISC 0x0030/0x104C` | utilities / services |
| 计数 | `counts.tile: Int32Array(256)`、`counts.zone: Int32Array(8)`、`counts.military: Int32Array(16)` | 增量维护 | `MISC 0x01F0…/0x05F0…/0x0FA8…` | core（`TileWriter`） |
| 图表 | `xgrp: Int32Array(832)` | 16×52 | `XGRP` | economy（推送）|
| 地形元数据 | `terrainMeta: { seaLevel, coast, river, rotation }` | | `MISC 0x0E40/0x0E44/0x0E48/0x0008` | terrain / ui |
| 视图持久化 | `view: { viewX, viewY, zoom }` | | `MISC 0x1018/0x101C/0x1014` | ui |
| 底稿 | `rawMisc: Int32Array(1200)` | 导入原值 | 不理解的偏移原样写回 | io/sc2 |
| 情景 | `scenario: ScenarioState \| null` | | `SCEN/TEXT/PICT` | economy |

### 2.2 派生缓存（不是真源，不入哈希，`rebuild()` 幂等）

| 缓存 | 结构 | owner | 用途 |
|---|---|---|---|
| `anchorOf: Int32Array(16384)` | 格 → 所属建筑 TL 锚点格（`xbld < 0x0E` 为 −1） | core（随 `setXbld/setXzon` 增量维护） | 渲染多格建筑、查询、拆除、微模拟；O(1) 代替 `lotOf()` 的 16 次探测 |
| `lots: Map<anchor, LotState>` | 分区建筑运行态（phase / 计时器） | zones | 生长状态机；读档后计时器归零（`zones` §3.6） |
| `plants[] / stations[] / hwyBlocks[] / bridges[] / tunnels[] / connections[]` | 对象表 + `tile → id+1` 的 `Uint16Array` | utilities / transport | 网络求解与渲染 |
| `net conn subway station stationOf: Uint8/Uint16Array(16384)` | `transport-traffic.md` §3.2 | transport | 出行模型 |
| `marker fuel cloudLife riotLife: Uint8Array(16384)`、`things[40]`、`navRegion` | `disasters-events.md` §3.1 | disasters | 灾害与物件；`marker` 写档时合成进 `XTXT` |
| `microsim 绑定`、`cityCenter`、`developedHalf` | | services | 查询窗口、地价、犯罪 |
| `scratch`：`mark queue order: Int32Array(16384)` | 预分配 | utilities / traffic | 零分配 BFS |

**多格建筑的锚点** `[决定]`：全仓库统一 **TL 角位（`XZON & 0x40`）为锚点**，1×1 也含 TL 位，故"TL 置位格数 = 栋数"；services 的覆盖图案以 TR 角位为原点是其内部口径，经 `anchorOf` + `FOOTPRINT` 换算。`anchorOf` 由 `TileWriter` 在每次 `setXbld/setXzon` 后对受影响的 ≤ 4×4 邻域重算。

### 2.3 地下层

`xund`（地铁 / 管线 / 十字 / 地铁入口 / 导弹井）+ `tunnelLevels`（隧道深度）就是全部真源；地下视图渲染只读这两层与 `xbit.PIPED|WATERED`。没有第二套"地下建筑表"。

### 2.4 写入纪律：`TileWriter`

| 操作 | 入口 | 副作用 |
|---|---|---|
| 改 `xbld / xzon / xund / xter / alt / waterLevel / tunnelLevels` 的**单格** | `ctx.act.setXbld(i,id)` 等 | 更新 `counts.*`、`anchorOf`、追加 `changeLog`（渲染脏块、`onTilesChanged` 扇出） |
| 整层重建（`xbit.POWERED/WATERED`、八张图、`xtxt` 合成、`xthg`） | 直接写数组，阶段末 `ctx.act.layerChanged('xbit' \| 'maps' \| …)` 一次 | 渲染按层整体刷新（不逐格记日志） |
| `xbit` 单格位（放置时预置 `POWERABLE|PIPED`、雕像清位） | `ctx.act.setXbit(i, mask, on)` | 追加 `changeLog` |

这样"`MISC 0x01F0` 建筑格计数"永远与 `xbld` 一致，不需要导出时重数（导出前仍做一次全量对账断言）。

### 2.5 序列化

- **自有存档格式 = `.SC2` 本身** `[决定]`：规格已经把本项目需要的扩展字段放进原版存档恒为零的区间（`economy` §2.13.5 PRNG、`disasters` §2.5.1 标签侧表）。本文建立**零区注册表**防止碰撞：

| `MISC` 偏移 | 字段 | owner |
|---|---|---|
| `0x1054` / `0x1058` | `prngMarker` / `prngState` | economy（core 读写） |
| `0x105C` | `saveFormatVersion`（本项目 = 1；原版 = 0） | core |
| `0x1060` | `viewZoom`（若 §5 Q13 证实 `0x1014` 即缩放则废弃） | ui |
| `0x1064–0x10B7` | 保留 | — |
| `0x10BC–0x12BB` | `xtxtShadow`（'XSHD'） | disasters |

- IndexedDB `saves` store 存 `{ sc2: ArrayBuffer, meta: { cityName, year, population, savedAt, thumbnail } }`；文件导出就是同一份 `ArrayBuffer`。不存在第二种格式，也就不存在"两种格式漂移"。
- 导入 `.SC2`：`io/sc2.readSc2 → importCity()`，按 `file-formats.md` §3.4.2 的顺序调用各模块 `rebuild(doc, ctx, diag)`，再 `rebuildPostLoad()`（电/水重扫不消费 PRNG、`cityCenter`、`trafficReport`、连接重算）。导出：各模块 `exportTo(doc, ctx)` 回填 → `writeSc2`。
- 不入存档但影响后续演化的运行态（lot 计时器、物件寿命、灾害燃料）按各规格"读档归零 / 按类型默认值重建"，这是**有意**的：原版也如此，且保证第三方存档可导入。

### 2.6 状态哈希

`hashState(s)`：FNV-1a 32 位依次吃进 `layers.*`、`maps.*`、`xgrp`、`serializeScalars(s)`（固定字段序的 `Int32Array`）与 `prng.state()`，再 XOR 各模块 `hashPrivate()`（lot 计时器等）。`[决定]` 不用 JSON/structuredClone 参与哈希（字段序与浮点格式化不稳定）。所有标量在 sim 内都是整数或"仅经 `+−×÷ floor trunc round min max` 的双精度"（IEEE 754 基本运算跨引擎一致），禁用 `Math.pow/exp/log/sin/cos/sqrt`（`terrain.md` §3.6 的 `pow(n, 1.15)` 需改为 `n * (0.85 + 0.15 * n)` 或查表——列入风险 §10）。

---

## 3. 模拟调度

### 3.1 tick 与日历

- **1 tick = 1 天**；1 月 = 25 天，1 年 = 300 天；`age` 是唯一真源，`dateOf(age)` 派生（`economy` §2.2）。
- 每帧 `tick(dt)`：按速度档把真实时间换成 n 天（`msPerDay`，African Swallow 每帧 ≤ 10 天），逐天 `advanceDay()`；任一阶段返回 `'suspend'` 即停在 `phaseCursor`，UI 关闭模态后 `resume()` 续跑当日剩余阶段，**不重跑**已执行阶段。
- 灾害模式（`clock.mode == 2`）与暂停：日历不前进；`disasterTick()` 与 `thingsTick()` 按 `tickIntervalMs[speed]` 另行推进（`disasters` §2.2.1）。

### 3.2 阶段表与 owner（全仓库唯一真源 = `contracts/clock.ts` 的 `DAY_PHASES` 与 `PHASE_OWNER`）

| day | 阶段（行序即执行序） | owner |
|---|---|---|
| 0 | `settleMonth → closeYear¹ → techCheck¹ → nationalAnnual¹ → neighborsAnnual¹ → approvalSurvey¹ → facilityAnnual¹ → utilitiesAnnual¹ → budgetWindow¹ → beginMonth` | economy / economy / disasters(tech) / zones+economy / zones / services / services / utilities / economy / zones |
| 1 | `powerScan` | utilities |
| 2 | `dataMaps` | services |
| 3–18 | `growthScan(step, substep)`：每格依次 `transport.budgetTick → zones.growthVisit → services.onGrowthVisit`（`economy` §2.3.3） | core 主循环，三模块回调 |
| 19 | `trafficDecay` | services |
| 20 | `waterScan` | utilities |
| 21 | `census → demand → demographics → graphs` | zones / zones / services / economy |
| 22 | `milestones → scenario → solvency` | services / economy / economy |
| 23 | `uiRefresh`（空阶段，发事件） | core |
| 24 | `weatherAndDisaster → cityStatus → news` | disasters / services / disasters |

¹ 仅 1 月且 `age > 0`。`nationalAnnual` 由 zones（`natTrend/natPop`）与 economy（`fedRateRaw`）前后两个 runner 组成，契约里拆成 `nationalAnnual.zones` 与 `nationalAnnual.economy` 两个 PhaseId，避免一个阶段两个 owner。
`PHASE_IO`（每阶段声明的读 / bulk 写 / point 写 / 是否用 PRNG / 可否挂起）随表落在契约中，`sim/core/dayPhases.test.ts` 静态断言：每天无两个阶段 bulk 写同一层；每月每层至多一个 bulk 写者；读 `@dN` 的阶段天数 ≥ N。

### 3.3 命令

玩家 / UI 的一切改动都是 `Command`（§9.3），由 `CommandQueue` 在**两个 `advanceDay` 之间**（`phaseCursor == 0`）或挂起期间执行，执行即记入 `commandLog[(age, seq, cmd)]`。因为 `advanceDay` 同步完成于一帧之内，命令总在当帧处理，玩家无感知延迟。命令处理函数由 owner 模块注册，返回 `CommandResult { ok, cost, reason?, changed }`；放置类命令末尾触发 `flushDirtyRescans()`（电 / 水立即重扫，消费 `sim` 流，`power-water.md` §3.4）。

### 3.4 PRNG 约定（`economy` §2.13 的实施版）

| 流 | 创建 | 消费者 |
|---|---|---|
| `ctx.prng`（sim） | 新城 `createPrng(seed)` / 读档 `MISC 0x1058` 或 `hash32(cityName, age, funds, landValueSum)` | 阶段 runner（按 §3.2 行序与各规格内部遍历序）、命令处理、灾害 / 物件 tick |
| `terrain` | New City 对话框 seed | 仅地形生成 |
| `brush` | `createPrng(hash32(prng.state(), age, x, y, stroke))`（只读 `state()`） | 森林 / 水体刷子 |
| `art` | 无状态 `hashNoise(seed, x, y)` | 程序化美术 |
| `ui` | `Math.random` | 装饰抖动、报纸版式、UI 动画 |

硬规则：UI 预览不得消费 sim 流（债券利率预览 jitter=0）；`sim/**` 禁 `Math.random`（ESLint）；每个阶段内部的遍历顺序写进各自规格并以测试锁定。

### 3.5 每月性能预算（128×128，Node 20，估算）

| 阶段 | 工作量 | 估计 |
|---|---|---|
| `powerScan` / `waterScan` | 各两遍 BFS ≤ 16384 格，零分配 | 0.2–0.5 ms / 0.2–0.5 ms |
| `dataMaps` | ≈ 8 遍 16384 + 3×4096 + 2×1024 整数运算 | 1–2 ms |
| `growthScan`（16 天合计） | 16384 次访问；已划区 ≈ 30% 时约 5,000 次 `runTrip`，每次 ≤ 100 步 × 4 次尝试查表 | 典型 5–15 ms；最坏（全图密区 + 大路网）≈ 40 ms |
| `trafficDecay / census / demand / demographics / graphs` | 4096 + 若干 O(N) | < 0.5 ms |
| 年初序列（1 月） | 微模拟 150 条、100 次抽样 | < 0.5 ms |
| **每月合计** | | **典型 8–20 ms，最坏 ≈ 50 ms** |

推论：100 年 = 1,200 月 ≈ 10–25 s 无头；CI 的确定性双跑（2 × 50 年）在 60 s 内；African Swallow 每帧 10 天中最重的生长日 ≈ 1–3 ms，不影响 60 fps。内存：真源层 ≈ 180 KB，派生缓存 < 1 MB，`structuredClone` 快照 ≈ 1 ms（为将来的"撤销 / 分支预演"留门）。

### 3.6 事件

阶段与命令把 `SimEvent` push 进 `ctx.events`（每天一个数组）；`advanceDay` 返回后由 app 一次性 drain 给 UI / 渲染 / 音效 / 报纸。sim 内没有订阅者、没有回调闭包（保持确定性与可序列化）；需要跨模块"通知"的（电厂到期 → 毁损）走 `ctx.act.*` 同步调用。

### 3.7 线程模型

v1 sim 在主线程（`CityState` 直接被渲染器只读，零拷贝）。`SimHost` 接口把 `{ dispatch(cmd), tick(dt), drainEvents(), state }` 抽象出来；`[可选]` 开 COOP/COEP 后用 `SharedArrayBuffer` 承载各 `Uint8Array` 把 sim 移入 Worker，渲染器代码不变。

---

## 4. 渲染

### 4.1 选型：PixiJS v8 `[决定]`

数据估算（M 档 32×16，1600×900 画布）：可见地块 ≈ 3,000–5,000，每格 1–3 张精灵 → Canvas2D 每帧 ≈ 8,000 次 `drawImage`，桌面勉强 60 fps、移动端与调色板循环（需逐帧重着色）不可行。Pixi v8：64 个 16×16 分块 `cacheAsTexture` 后每帧 ≈ 64 次块绘制 + ≤ 600 个动态精灵，WebGL/WebGPU 批处理；仓库已用 `pixi.js ^8.6.0`。不做 Canvas2D 后备渲染器。

### 4.2 投影、海拔、旋转

- `sx = ox + (rx − ry)·S`，`sy = oy + (rx + ry)·S/2 − h·LEVEL`，`(rx, ry) = rotate(x, y, rotation)`，旋转 1 次 `(x,y)→(y,127−x)`（`ui-art.md` §3.1）。
- **数据永不旋转**：旋转只做坐标变换 + ID/坡面码置换；置换表唯一来源 = `sim/terrain/slope.ts` 的 `SLOPE_ROT_CCW` 与 `render/rotation.ts` 按 `ui-art.md` §3.3 由其派生的网络件环；`XBit.Flipped` 件用 `drawFlip = flipped XOR (rotation & 1)` 镜像。
- 拾取：按 `ui-art.md` §3.1 从 31 级向下逆投影 + 四边形点内测试，只按地面拾取。

### 4.3 缩放、分块、深度、多格建筑、地下

| 项 | 做法 |
|---|---|
| 缩放档 | 必做 S/M/L（16/32/64 px 格），XS/XL 整数倍派生；每档各自图集，懒生成；缩放瞬切（原版手感） |
| 分块 | 8×8 = 64 块，每块 16×16 地块一个 `Container`，内部按 `(rx+ry, rx)` 排序；静态内容 `cacheAsTexture(true)`；旋转 / 缩放切换触发全部块重建（64 × ≤ 2 ms，分帧 ≤ 8 块） |
| 深度 | 块间按 `(cx + cy)`；动态层（车流、角色、火、断电图标、预览）独立容器按 `(rx+ry)` 排序，每帧只重排变动者 |
| 多格建筑 | 挂在旋转后 `rx+ry` 最大的占地格所属块；画布向上越界由块纹理包围盒扩展处理；锚格查 `anchorOf` |
| 地下视图 | 第二套块容器 `undergroundLayer`（土色地表 + `xund` + 管桩），切换只显隐 |
| 脏矩形 | sim `changeLog`（格索引数组）→ 块集合 → 按帧配额重建；`layerChanged('xbit')` 只刷新断电图标 / 地下有水变体，不重建块 |

### 4.4 精灵管线

```
SpriteProvider(procedural | dat) ──bitmap(key, scale)──▶ IndexedBitmap(索引色, 0 = 透明)
   ──▶ AtlasPacker(2048², shelf) ──▶ 烘焙 RGBA（CPU LUT）──▶ Pixi TextureSource(nearest)
   循环色位图单独一页：每个 palette tick 只重烘焙这一页（≈ 30 张）
```

`[决定]` v1 用 CPU 烘焙 RGBA 而不是索引色着色器：实现简单、Pixi 默认批处理可用、与 DAT 来源同构；`[可选]` R8 + 256×1 调色板纹理的自定义着色器留作优化。回退链：DAT 原生 → DAT 整数倍放大 → procedural → 洋红占位（`ui-art.md` §3.4）。真实精灵接入点只有一个：`app/session.ts` 在素材导入完成后把 `DatSpriteProvider` 放在 `procedural` 之前，`SpriteAtlas.invalidate()`。

### 4.5 动画

`AnimationClock` 按 fps 分组（2/3/4/6/8/10），同组同相位；调色板循环独立于模拟速度（暂停时水面仍动）；角色（`things`）位置用 `(x,y,px,py)` 插值；灾害覆盖层读 `marker`。渲染器**只读** `CityState` 与 `derived`，永不写 `XBIT`。

---

## 5. UI

- **选型** `[决定]`：原生 DOM + CSS 变量复刻斜面窗口；一个 ≈ 60 行的 `h()` 构建器与 `Store<T>`（订阅 / 批量通知）；不引入框架（包可独立拆出、无构建魔法、Playwright 易定位）。
- **窗口系统**：`WindowManager` 管理非模态浮动窗口（拖动、z 序、同类单例、位置记忆于 `localStorage`）与 `ModalHost`（计数式 `modalPause`，与 `clock.modalPause` 对齐）。
- **工具栏 / 菜单 / 状态区**：按 `ui-art.md` §2.1–§2.4；工具与子工具来自 `data/tools.ts`（SSOT），可用性文本来自 `q.placement.availability(toolId)`。
- **查询**：`QueryWindow` 用 `anchorOf` 找整栋，字段来自各模块 `queries.*.queryStats(tile)`。
- **输入模型**：`ToolController` 状态机，十种操作模式（Click / Paint / Line / Rect / Place / Dispatch / Query / Sign / Center / Help，`ui-art.md` §2.8）；指针事件统一（鼠标 / 触控 / 笔），手势表与窄屏布局按 `ui-art.md` §3.11；键盘表按 §2.8（`Ctrl+S` `preventDefault`）。
- **消息流**：

```
DOM 事件 → ToolController / Menus → CommandBus.dispatch(Command) ─┐
                                                                  ▼
            UiStore ◀── drainEvents(SimEvent[]) ◀── SimHost.tick() ── sim（主线程或 Worker）
               │                                        │ changeLog / layerChanged
               ▼                                        ▼
         Windows / StatusBar / Toolbar           Renderer.markDirty(...)  ← ViewState（UiStore）
```

UI 从不直接读 `MISC` 或改图层；预览（费用、可放置性）调用 `q.placement.preview(cmd)`（纯函数、不消费 PRNG、不写状态）。

---

## 6. 美术

- 接口：`SpriteProvider { name, palette, nativeScales, has, bitmap, frameCount, fps }`（`ui-art.md` §3.4），两种来源同构输出 `IndexedBitmap`。
- 程序化生成器（`art/`）：`raster.ts` 原语（`fillPoly/strokePoly/fillDiamond/ditherFill/isoLine/blit/hashNoise`）+ `isoBox` 三面盒体 + 配方表 `BUILDING_RECIPES[id]`（`ui-art.md` §3.8），全部纯函数、`hashNoise(seed=id, …)` 确定性。
- **多样性保证**：同 (zone, level, tier) 的多个 ID 共享配方骨架，但 `seed = id` 驱动高度 ±10%、窗格亮灭、附属物位置、屋顶类型分支；tier 决定 ramp（Brick/WarmGray/Neutral）与附属物（泳池 / 车库 / 招牌）；level 决定占地与高度带。vitest 断言：同一 (zone, level, tier) 组内任意两 ID 的位图哈希不同，且与其他组的平均亮度差 ≥ 阈值（防"全长一样"）。
- 原创调色板：16 色带 × 8 阶 + 保留区 + 三个循环组（`ui-art.md` §3.5），由 `buildPalette()` 生成，不是数据文件；DAT 导入时调色板来自玩家文件，循环组由 `PAL_STTC` 推断。

---

## 7. 文件格式与本地导入

- 解析器接口：`readSc2(buf) → ReadResult<Sc2Document>`、`writeSc2(doc)`、`parseSpriteArchive / decodeSprite`、`readPaletteBmp / cycledIndex`、`readNewsData`（`file-formats.md` §3.2–§3.8）；`ByteReader/Writer` 显式 `be/le`。
- `importCity(doc) / exportCity(state)`：`io/sc2/mapping.ts` 持有模块 `SaveHooks` 注册表，按 `file-formats.md` §3.4.2 顺序调用；`rawMisc` 透传未知偏移。
- 浏览器导入（`io/import`）：三种来源（目录授权 / 多选 / 拖放）→ `identify()` 魔数校验 → Worker 解码 → IndexedDB `sc2k-assets`（`files / decoded / handles / saves / meta`，`file-formats.md` §3.9.5）；隐私红线：字节流不出页面，`io/import` 禁 import 网络模块（ESLint）。
- 启动序列：`prefs.useOriginalArt` → 取 `decoded` 缓存（key = 各文件 sha256 + `DECODER_VERSION`）→ 否则重解码 → `DatSpriteProvider`；无素材则 `ProceduralSpriteProvider`。

---

## 8. 测试策略

| 层 | 内容 | 位置 |
|---|---|---|
| 单元 | PRNG 测试向量；`tileIndex` 反转置；坡面置换 = 角点重命名；RLE 往返属性测试；精灵解码手工夹具；`DAY_PHASES/PHASE_IO` 不变量；预算 `splitMonthly` 之和 = 年额；电 / 水 BFS 的 T1–T9；24 偏移可达；需求 / 人口学公式；法令表与 zones 乘数一致；`FOOTPRINT` 集合 | 各 WP 自带 `*.test.ts` |
| 契约一致 | `catalogue` 造价表 vs `economy` 价格快照；`PHASE_OWNER` 覆盖全部 PhaseId；每个模块注册的 phase ⊆ 其 owner 集 | `sim/core/contracts.test.ts` |
| 确定性 | 同 seed + 同命令日志两次运行 `hashState` 逐年相同；Node 与 Playwright 浏览器各跑 5 年哈希一致 | `sim/core/determinism.test.ts`、`e2e/hash.spec.ts` |
| 存档往返 | 新城 / 跑 3 年 / 灾害中：`hash(import(export(S))) == hash(S)`（排除规格声明"读档归零"的私有态） | `io/sc2/roundtrip.test.ts` |
| 无头长跑 | `fixtures/ref-city.json`（煤电 + 电线 + R/C/I + 道路 + 水泵管线的命令脚本）跑 50 年（CI）/ 100 年（`SC2K_LONGRUN=1`）：不抛错、无 NaN、`normalPop` 在第 20 年落在 `[3,000, 60,000]` 且曲线无单月 > 50% 跳变、`funds > −10^6`、利用率 ≤ 100；空城 100 年人口恒 0、资金只因债券利息变化 | `sim/core/longrun.test.ts`、`tools/sim-run.ts` 输出 `{year, hash, pop, funds}[]` JSON |
| 浏览器冒烟 | Playwright（预装 Chromium）：标题页 → 新城 → 放电厂 / 电线 / 分区 / 道路 → 跑 12 个月 → 截图；断言 canvas 非空白、资金变化、无 console error；导入手工夹具 `.SC2` | `e2e/smoke.spec.ts` |
| 美术快照 | 全部生成函数的 FNV 哈希快照 + `art:preview` 拼图供人工检视 | `art/**/*.test.ts` |

---

## 9. 工作分解（WP）

### 9.1 总览

WP0（脚手架 + 契约，串行先做）之后，WP1–WP14 **完全并行**；每个 WP 只在"独占文件"内写代码与测试，只 import `contracts/` 与 `data/`（`data/` 由 WP9 产出，但其**类型与查表签名**在 WP0 契约里，其他 WP 可用 `contracts/testkit` 的最小桩表先行）。规模单位：预估源码 + 测试行数。

| WP | 目标 | 独占文件 / 目录 | 依赖契约 | 验收测试 | 规模 |
|---|---|---|---|---|---|
| **WP0** 脚手架 + 契约 | `package.json / tsconfig* / vite.config.ts / index.html`、`src/contracts/**`、`src/contracts/testkit.ts`（空城 `createTestContext()`、桩 `Queries/Actions`、最小建筑表）、根 eslint 追加规则、`src/main.ts` 空壳 | 上述 | — | `pnpm typecheck/lint/test` 全绿；`contracts.test.ts` 过 | 900 |
| **WP1** sim-core | 调度器（`advanceDay/resume/tick`）、`CommandQueue` + 日志、`TileWriter`（计数 / `anchorOf` / changeLog）、`hashState`、`replay`、`createSim(modules)`、无头入口 | `src/sim/core/**`、`tools/sim-run.ts`、`tools/sim-compare.ts` | clock / commands / events / state / module | `dayPhases.test`、`tileWriter.test`（计数与 `anchorOf` 一致）、`determinism.test`（桩模块）、`longrun` 骨架 | 1,400 |
| **WP2** terrain | 层 / 坡面表 / 旋转置换 / 角点场 / 工具 / 海平面 / 咸淡 / 生成器 / 导入修正 / 地形查询 | `src/sim/terrain/**` | state / queries.terrain / actions.setTerrain / prng | `terrain.md` §2.5.4 数据级用例、生成器快照（固定 seed）、工具费用与拒绝规则、`refloodAll` 幂等 | 1,600 |
| **WP3** utilities | 电 / 水两遍 BFS、电厂表与寿命、电线 / 管线选形与十字、年度更新、`dirty` 重扫 | `src/sim/utilities/**` | queries.utilities / actions.destroyStructure, requestRescan / tech 查询 | `power-water.md` §3.8 T1–T9、Energy Conservation 762 格、水塔二值蓄水 | 1,300 |
| **WP4** zones | 生长状态机（4×4 子步访问）、`LotState`、`findLot`、人口汇总 / 税基、RCI 需求、11 产业、邻城、国家经济、教堂 | `src/sim/zones/**` | queries.{utilities,transport,services} / actions.setXbld,setXzon / census 写 | `zones` §3.7 八项（首栋房子从电线旁长出、24 偏移、地价门槛、税基含 arco、确定性） | 1,800 |
| **WP5** transport | 片段选形 / 交叉件 / 高速块 / 匝道 / 隧道 / 桥 / 车站（2×2）/ 地铁 / 邻城连接 / 预算衰败 / 出行生成器 / 可达缓存 | `src/sim/transport/**` | queries.transport（`hasAccess/runTrip`）/ actions.addTraffic, allocMicrosim / terrain 查询 | 24 偏移测试、模式转移表逐行、回溯恢复步数、桥对话框长度阈值、`roadTileCounts` 增量 = 全量 | 2,200 |
| **WP6** services | 八张图层重算、公共建筑 / NIMBY / 微模拟（150 条）/ 年度更新、人口学、里程碑 / 军事基地 / Arcology、海港 / 机场生长、`XTRF` owner、支持率、诉求链 | `src/sim/services/**` | queries.services / actions.setXbld / economy 的 funding / zones 的 census | `Σ XVAL == landValueSum`、覆盖图案值表、`decayTraffic` 后 `Σ XTRF == trafficReport.total`、人口学月序、里程碑严格大于 | 2,400 |
| **WP7** economy | 月结 / 年结 / 税收 / 法令金额 / 债券与评级 / 预算视图模型 / 弹劾 / 图表推送 / 情景评估 | `src/sim/economy/**` | state.economy / census / counts / queries.economy / commands | `splitMonthly`、Hard 开局债券、50 张 25% 债券无溢出、法令向下取整、情景 0 = 不检查、读档重建 YTD | 1,500 |
| **WP8** disasters | 灾害状态机 / 毁损例程 / `marker` 与 `xtxtShadow` / 天气 / 科技时间线 / 报纸池 / 顾问 / 常驻物件（飞机船列车）/ 调度单位 | `src/sim/disasters/**` | actions.destroyStructure 的实现方 / queries.disasters, tech / 物件谓词查询 | 警局点火扑灭后标签不变、灾害中存档往返、空难按需起飞、列车三槽原子、天气权重和 = 100、发明槽位 | 2,600 |
| **WP9** catalogue + placement | `BUILDINGS[256]/TOOLS/FOOTPRINT/CATEGORY/TECH_BASE_YEAR`、`canPlace/place/demolish`、工具费用、可用性门控、`preview` | `src/data/**`、`src/sim/placement/**` | queries.placement / actions.charge, setXbld, allocMicrosim, requestRescan | `catalogue` §3.2 全部不变量、造价快照、`canPlace` 的 12 种拒绝原因、拆除整栋 `$1×size²` | 1,500 |
| **WP10** io-sc2 | `ByteReader/Writer`、IFF/RLE、`readSc2/writeSc2`、`MISC` 访问器与零区注册表、`importCity/exportCity` 编排、情景 chunk | `src/io/bytes.ts`、`src/io/sc2/**` | Sc2Document / SaveHooks 注册表 | RLE 属性测试、Mac 头 / Classic 识别、手工样例往返、`cohortOffset` 静态断言、未知偏移透传 | 1,100 |
| **WP11** io-assets | 精灵归档 / 解码 / ID 对齐、调色板 BMP 与循环、文本库、浏览器导入三来源、IndexedDB、解码 Worker、`DatSpriteProvider` | `src/io/sprites/**`、`src/io/palette/**`、`src/io/text/**`、`src/io/import/**` | SpriteProvider / IndexedBitmap / AssetStore | §3.5.4 手工夹具（含重复 ID 策略）、`cycledIndex` 方向、`identify` 魔数表、隐私 lint | 1,600 |
| **WP12** art | 原创调色板、光栅原语、地形 / 水 / 路网 / 树 / 建筑配方、覆盖物 / 角色 / UI 图标、`ProceduralSpriteProvider`、`art:preview` | `src/art/**`、`tools/art-preview.ts` | SpriteProvider / IndexedBitmap / FOOTPRINT | 位图哈希快照、菱形行宽规则、多样性断言（§6）、无缝不重叠 | 2,000 |
| **WP13** render | Pixi 应用、投影 / 拾取 / 旋转、分块缓存、图集与烘焙、动态层、地下视图、动画时钟、预览层、Map 窗口位图 | `src/render/**` | RenderSource / ViewState / SpriteProvider / changeLog | 像素快照（`ui-art.md` §3.3 旋转用例、§2.9.3 翻转用例）、拾取往返、脏块配额 | 1,800 |
| **WP14** ui + app | 外壳组件树、窗口 / 工具栏 / 菜单 / 状态区 / 对话框 / 查询 / 报纸视图、`ToolController`、触控、`app/{wire,loop,session}`、Playwright 冒烟 | `src/ui/**`、`src/app/**`、`src/styles/**`、`e2e/**` | Command / SimEvent / Queries / SimHost | 工具状态机单测（jsdom）、`e2e/smoke.spec.ts`（对桩 sim 也能跑） | 2,200 |

集成阶段（任务 #4）独占 `src/app/wire.ts` 的最终版与跨模块修补；任何契约变更需开 RFC 并同步所有 WP。

### 9.2 WP 内部文件约定

每个 `src/sim/<m>/` 含：`index.ts`（导出 `createXModule(): SimModule`）、`tuning.ts`（`XTuning` 类型 + `DEFAULT_X_TUNING`）、`queries.ts`、`phases.ts`、`commands.ts`、`save.ts`（`rebuild/exportTo`）、`*.test.ts`。调参按模块命名空间注入：`ctx.tuning` 是 `TuningBag = Record<ModuleId, unknown>`，模块用 `getTuning(ctx, 'zones', DEFAULT_ZONE_TUNING)` 取并合并，契约不依赖任何模块的 Tuning 类型。

### 9.3 共享契约代码（`src/contracts/`，WP0 落地后冻结）

```ts
// ===== grid.ts =====
export const MAP = 128, TILES = 16384, HALF_N = 4096, QUARTER_N = 1024, MAX_ALT = 31;
export const tileIndex = (x: number, y: number): number => x * 128 + y;     // x 主序（file-formats §2.2.1）
export const tileX = (i: number): number => i >> 7;
export const tileY = (i: number): number => i & 127;
export const halfIndex = (x: number, y: number): number => (x >> 1) * 64 + (y >> 1);
export const quarterIndex = (x: number, y: number): number => (x >> 2) * 32 + (y >> 2);
export const inMap = (x: number, y: number): boolean => x >= 0 && y >= 0 && x < 128 && y < 128;
export const enum Dir { T = 0, R = 1, B = 2, L = 3 }                         // T=−y R=+x B=+y L=−x
export const DX: readonly number[] = [0, 1, 0, -1];
export const DY: readonly number[] = [-1, 0, 1, 0];
export function neighbor(i: number, d: Dir): number {                       // 越界 −1
  const x = tileX(i) + DX[d]!, y = tileY(i) + DY[d]!;
  return inMap(x, y) ? tileIndex(x, y) : -1;
}
/** 电 / 水扫描的邻居顺序（power-water §1.1）：索引增量 −1, −128, +1, +128 */
export const SCAN_NEIGHBORS: ReadonlyArray<readonly [dx: number, dy: number]> = [[0, -1], [-1, 0], [0, 1], [1, 0]];

// ===== bits.ts =====
export const enum XBit { SaltWater = 0x01, Flipped = 0x02, Water = 0x04, Mark = 0x08, Watered = 0x10, Piped = 0x20, Powered = 0x40, Powerable = 0x80 }
export const enum XZonCorner { BL = 0x10, BR = 0x20, TL = 0x40, TR = 0x80, All = 0xF0 }
export const enum ZoneCode { None = 0, LightR, DenseR, LightC, DenseC, LightI, DenseI, Military, Airport, Seaport }
export const enum CityMode { TerrainEdit = 0, City = 1, Disaster = 2 }
export const DEVELOPED_FIRST = 0x70;
export const ANCHOR_BIT = XZonCorner.TL;                                     // 全仓库唯一锚点约定

// ===== prng.ts =====（economy §2.13 / §3.8：mulberry32 + FNV-1a；每个方法恰消费一次 next32）
export interface Prng {
  next32(): number; next15(): number; int(n: number): number; range(lo: number, hi: number): number;
  float(): number; bit(): boolean; pick<T>(a: readonly T[]): T; shuffle<T>(a: T[]): void;
  state(): number; seed(s: number): void;
}
export declare function createPrng(seed: number): Prng;
export declare function hash32(...parts: (number | string)[]): number;
export declare function fnv1aBytes(h: number, bytes: ArrayLike<number>): number;   // hashState 的累积器
export declare function hashNoise(seed: number, x: number, y: number): number;    // [0,1) 无状态，art 用

// ===== state.ts =====
export interface TileLayers {
  alt: Uint8Array; waterLevel: Uint8Array; tunnelLevels: Uint8Array;        // ALTM 拆位
  xter: Uint8Array; xbld: Uint8Array; xzon: Uint8Array; xund: Uint8Array; xtxt: Uint8Array; xbit: Uint8Array;
  xlab: Uint8Array; xmic: Uint8Array; xthg: Uint8Array;                     // 6400 / 1200 / 480
}
export interface DataMaps { xtrf: Uint8Array; xplt: Uint8Array; xval: Uint8Array; xcrm: Uint8Array; xplc: Uint8Array; xfir: Uint8Array; xpop: Uint8Array; xrog: Uint8Array }
export interface Counts { tile: Int32Array; zone: Int32Array; military: Int32Array }   // 256 / 8 / 16
export type Speed = 1 | 2 | 3 | 4 | 5;
export interface ClockState { age: number; foundedYear: number; speed: Speed; mode: CityMode; modalPause: number; phaseCursor: number; accumMs: number; disasterTicks: number }
export interface GameDate { year: number; month: number; day: number }
export declare function dateOf(c: ClockState): GameDate;
export interface TerrainMeta { seaLevel: number; coast: boolean; river: boolean; rotation: 0 | 1 | 2 | 3 }
export interface TaxRates { r: number; c: number; i: number }
export interface Bond { rateRaw: number; issuedYear: number; issuedMonth: number }
export interface EconomyState {                                              // economy §3.1 的跨模块可见部分
  funds: number; difficulty: 1 | 2 | 3; taxRate: TaxRates; industryTax: Int32Array /*11*/;
  funding: Uint8Array /*11, BudgetLine 序*/; ordinances: number /*20 位*/; bonds: Bond[]; fedRateRaw: number;
  autoBudget: boolean; counters: { advertising: number; fame: number }; impeached: boolean;
}
export const enum BudgetLine { Police = 0, Fire, Health, Schools, Colleges, Roads, Highways, Bridges, Rail, Subway, Tunnel }
export const enum OrdinanceId { SalesTax = 0, IncomeTax, LegalizedGambling, ParkingFines, ProReading, AntiDrug, CprTraining, NeighborhoodWatch, EnergyConservation, NuclearFreeZone, HomelessShelter, PollutionControls, VolunteerFire, SmokingBan, FreeClinics, JuniorSports, TouristAdvertising, BusinessAdvertising, CityBeautification, AnnualCarnival }
export interface CensusSnapshot {                                            // zones §3.1 ZonePopulation + economy §3.1 CensusSnapshot
  res: number; com: number; ind: number; arcoPop: number; normalPop: number; citySize: number;
  taxableRes: number; taxableCom: number; taxableInd: number;
  workforcePct: number; workforce: number; jobs: number; unemployedN: number; unemploymentPct: number;
  tiles: { res: number; com: number; ind: number; total: number };
}
export interface RciDemand { r: number; c: number; i: number }
export interface DemandCaps { r: number; c: number; i: number }
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
export interface ViewPersist { viewX: number; viewY: number; zoom: number }
export interface CityState {
  readonly formatVersion: 1; cityName: string; mayorName: string;
  layers: TileLayers; maps: DataMaps; counts: Counts; xgrp: Int32Array /*832*/; rawMisc: Int32Array /*1200*/;
  clock: ClockState; terrain: TerrainMeta; economy: EconomyState;
  census: CensusSnapshot; demand: RciDemand; caps: DemandCaps; industry: IndustryState; neighbors: NeighborCity[]; national: NationalEconomy;
  demographics: DemographicsState; rewards: RewardState; totals: DataMapTotals; traffic: TrafficReport;
  weather: WeatherState; disaster: DisasterCore; tech: TechState;
  utilities: { power: PowerReport; water: WaterReport };
  scenario: unknown | null;                                                  // economy 持有具体类型
  view: ViewPersist;
  /** 派生缓存：不入存档、不入 hashState；每个模块只动自己的槽 */
  derived: { anchorOf: Int32Array /*16384，−1 = 非建筑*/ } & Partial<Record<ModuleId, unknown>>;
}
export declare function createCityState(): CityState;                        // 全零 / 空表分配

// ===== module.ts =====
export type ModuleId = 'core' | 'terrain' | 'utilities' | 'zones' | 'transport' | 'services' | 'economy' | 'disasters' | 'placement';
export type TuningBag = Partial<Record<ModuleId, unknown>>;
export declare function getTuning<T extends object>(ctx: SimContext, id: ModuleId, defaults: T): T;   // 浅合并，结果缓存于 ctx
export type BulkLayer = 'xbit' | 'maps' | 'xtxt' | 'xthg' | 'xmic' | 'all';
export type TileChangeKind = 'terrain' | 'building' | 'zone' | 'underground' | 'bit';
export interface Diagnostic { level: 'info' | 'warn' | 'error'; code: string; message: string; at?: string }

export interface SimContext {
  readonly state: CityState; readonly tuning: TuningBag; readonly prng: Prng;
  readonly day: number;                        // 当日 0..24；灾害 tick 中为 −1
  readonly events: SimEvent[];                 // 当日事件缓冲，app 每天 drain
  readonly q: Queries; readonly act: Actions; readonly diag: Diagnostic[];
}
export type PhaseResult = 'done' | 'suspend';
export type PhaseRunner = (ctx: SimContext, day: number) => PhaseResult;
export type CommandHandler<C extends Command = Command> = (ctx: SimContext, cmd: C) => CommandResult;

/** 每个模块实现一个；app/wire.ts 把它们交给 core.createSim()。全部方法同步、无 I/O。 */
export interface SimModule {
  readonly id: ModuleId;
  /** 本模块拥有的阶段；必须 ⊆ PHASE_OWNER 中标为本模块的集合（core 在注册时断言） */
  readonly phases?: Partial<Record<PhaseId, PhaseRunner>>;
  /** 生长扫描每格回调（core 按 transport → zones → services 顺序调用） */
  growthVisit?(ctx: SimContext, x: number, y: number): void;
  /** 灾害模式 tick / 物件 tick（disasters 实现） */
  disasterTick?(ctx: SimContext): void; thingsTick?(ctx: SimContext): void;
  /** 命令处理：key 为 Command['type']，一个命令只能有一个处理者 */
  readonly commands?: { [K in Command['type']]?: CommandHandler<Extract<Command, { type: K }>> };
  /** 注入 ctx.q 的查询实现（只能填自己的键） */
  readonly queries?: Partial<Queries>;
  /** 由 core 调用的 Actions 实现（只能填自己 owner 的键，见 ACTION_OWNER） */
  readonly actions?: Partial<Actions>;
  init(ctx: SimContext, p: NewCityParams): void;                            // 新城
  rebuild(ctx: SimContext, doc: Sc2Document, diag: Diagnostic[]): void;      // 读档：从真源层重建派生缓存与结构体
  postLoad?(ctx: SimContext): void;                                          // 读档后钩子（电水重扫、cityCenter…），不消费 PRNG
  exportTo(ctx: SimContext, doc: Sc2Document): void;                         // 写档：回填 chunk / MISC
  onTilesChanged?(ctx: SimContext, tiles: ReadonlyArray<number>, kind: TileChangeKind): void;
  hashPrivate?(ctx: SimContext): number;                                     // 私有运行态（lot 计时器等）
}
export interface NewCityParams { name: string; difficulty: 1 | 2 | 3; startYear: 1900 | 1950 | 2000 | 2050; seed: number; terrain: { coast: boolean; river: boolean; hills: number; water: number; trees: number }; terrainSeed: number }

// ===== clock.ts =====（economy §2.3 / §3.2）
export type PhaseId =
  | 'settleMonth' | 'closeYear' | 'techCheck' | 'nationalAnnual.zones' | 'nationalAnnual.economy' | 'neighborsAnnual'
  | 'approvalSurvey' | 'facilityAnnual' | 'utilitiesAnnual' | 'budgetWindow' | 'beginMonth'
  | 'powerScan' | 'dataMaps' | 'growthScan' | 'trafficDecay' | 'waterScan'
  | 'census' | 'demand' | 'demographics' | 'graphs' | 'milestones' | 'scenario' | 'solvency' | 'uiRefresh'
  | 'weatherAndDisaster' | 'cityStatus' | 'news';
export declare const DAY_PHASES: Readonly<Record<number, readonly PhaseId[]>>;   // 0..24，economy §3.2 原表（nationalAnnual 拆二）
export declare const PHASE_OWNER: Readonly<Record<PhaseId, ModuleId>>;           // §3.2 表；growthScan/uiRefresh 归 core
export type LayerName = 'XBLD' | 'XZON' | 'XUND' | 'XBIT.POWERED' | 'XBIT.WATERED' | 'XTRF' | 'XPLT' | 'XVAL' | 'XCRM' | 'XPLC' | 'XFIR' | 'XPOP' | 'XROG' | 'XMIC';
export interface PhaseIo { reads: LayerName[]; bulk: LayerName[]; point: LayerName[]; usesPrng: boolean; canSuspend: boolean }
export declare const PHASE_IO: Readonly<Record<PhaseId, PhaseIo>>;
export declare const growthStep: (day: number) => number;                        // ⌊(day−3)/4⌋
export declare const growthSubstep: (day: number) => number;                     // (day+1) % 4
export declare const MS_PER_DAY: Readonly<Record<Speed, number>>;                // {1:∞, 2:480, 3:160, 4:40, 5:0}

// ===== queries.ts =====（跨模块只读；实现者 = owner 模块）
export interface TerrainQuery {
  alt(i: number): number; slope(i: number): number; xterClass(i: number): number; isWater(i: number): boolean; isSalt(i: number): boolean;
  isFlatDry(i: number): boolean; waterDepth(i: number): number; treeDensity(i: number): number; cornerHeights(i: number): [number, number, number, number];
  distanceToWater(i: number): number;
}
export interface UtilityQuery { poweredSelf(i: number): boolean; hasPower(i: number): boolean; watered(i: number): boolean; plantAt(i: number): { kind: string; ageYears: number; loadPct: number } | null }
export interface TripResult { ok: boolean; usedBus: boolean; usedRail: boolean; usedSubway: boolean; steps: number }
export interface TransportQuery {
  hasAccess(x: number, y: number): boolean; runTrip(i: number, zone: ZoneCode, popLevel: 0 | 1 | 2 | 3 | 4): TripResult;   // runTrip 写 XTRF（经 act.addTraffic）、消费 PRNG
  roadDistance(x: number, y: number): number; roadTileCounts(): { roadTiles: number; highwayTiles: number; bridgeTiles: number };
  connections(): { commerce: number; industry: number; total: number }; stationAt(i: number): { kind: number; id: number } | null;
  bridgeBlocksShips(i: number): boolean; railMask(i: number): number; subwayMask(i: number): number;
}
export interface ZonesQuery { lotAt(i: number): { anchor: number; size: 1 | 2 | 3; level: number; tier: number; phase: string } | null; recreation(): { smallPark: number; bigPark: number; marina: number; zoo: number; stadium: number } }
export interface ServicesQuery {
  structureCounts(): { police: number; prison: number; fire: number; hospital: number; school: number; college: number; busDepot: number };
  graphCurrent(s: 'pollution' | 'landValue' | 'crime'): number; cityCenter(): { x: number; y: number };
  microsimOf(i: number): { slot: number; tileId: number; stat0: number; stat1: number; stat2: number; stat3: number } | null;
  queryStats(i: number): ReadonlyArray<{ key: string; value: string | number }>;
  seaportCranes(): number; airportRunwayGroups(): number; airportTiles(): number;
}
export interface EconomyQuery { canAfford(cost: number): boolean; funding(line: BudgetLine): number; ordinance(id: OrdinanceId): boolean; year(): number; budgetView(): unknown; bondView(): unknown }
export interface TechQuery { invented(key: TechKey): boolean }
export interface DisasterQuery { marker(i: number): number; focusPoints(): ReadonlyArray<{ x: number; y: number }>; thingsAt(i: number): ReadonlyArray<ThingView>; dispatchAvailable(kind: 0 | 1 | 2): number }
export interface ThingView { slot: number; type: number; x: number; y: number; z: number; px: number; py: number; dir: number; variant: number }
export interface PlacementQuery {
  canPlace(id: number, x: number, y: number): { ok: boolean; reason?: string; cost: number };
  availability(toolId: string): { enabled: boolean; reason?: string };
  preview(cmd: Command): { ok: boolean; cost: number; tiles: number[]; badTiles: number[]; reason?: string };   // 纯函数，不消费 PRNG
}
export interface Queries { terrain: TerrainQuery; utilities: UtilityQuery; transport: TransportQuery; zones: ZonesQuery; services: ServicesQuery; economy: EconomyQuery; tech: TechQuery; disasters: DisasterQuery; placement: PlacementQuery }

// ===== actions.ts =====（跨模块写；每个键一个 owner，ACTION_OWNER 固定）
export type DestroyCause = number | 'PLANT_EOL' | 'BRIDGE' | 'DECAY' | 'LAUNCH' | 'BULLDOZE';
export interface Actions {
  // core（TileWriter）
  setXbld(i: number, id: number): void; setXzon(i: number, v: number): void; setXund(i: number, v: number): void;
  setXbit(i: number, mask: number, on: boolean): void; setTerrain(i: number, alt: number, xter: number, waterLevel: number): void;
  layerChanged(layer: BulkLayer): void; emit(ev: SimEvent): void;
  // economy
  charge(cost: number): boolean;
  // disasters
  destroyStructure(x: number, y: number, cause: DestroyCause): void; news(type: number, value: number): void;
  // services
  addTraffic(tile: number, weight: number): void; allocMicrosim(tileId: number): number /*slot 或 −1*/; freeMicrosim(slot: number): void;
  // utilities
  requestRescan(kind: 'power' | 'water'): void;
  // transport
  markAccessDirty(tiles: ReadonlyArray<number>): void;
}
export declare const ACTION_OWNER: Readonly<Record<keyof Actions, ModuleId>>;

// ===== commands.ts =====
export type NetKind = 'road' | 'rail' | 'power' | 'pipe' | 'subway' | 'highway';
export type Command =
  | { type: 'placeBuilding'; id: number; x: number; y: number; team?: number }          // 放置型（电厂 / 设施 / 车站 / 奖励 / 匝道 / 转换件）
  | { type: 'zoneRect'; zone: ZoneCode; x0: number; y0: number; x1: number; y1: number }
  | { type: 'dezone'; tiles: number[] } | { type: 'bulldoze'; tiles: number[] }
  | { type: 'terrainTool'; tool: 'raise' | 'lower' | 'level' | 'water' | 'trees' | 'forest' | 'stream' | 'stretch' | 'seaLevel'; path: number[]; arg?: number }
  | { type: 'network'; kind: NetKind; from: number; to: number; bridge?: number /*BridgeKind*/ }
  | { type: 'tunnel'; at: number } | { type: 'neighborConnection'; at: number; accept: boolean }
  | { type: 'setTax'; rates: TaxRates } | { type: 'setIndustryTax'; k: number; rate: number }
  | { type: 'setFunding'; line: BudgetLine; pct: number } | { type: 'setOrdinance'; id: OrdinanceId; on: boolean }
  | { type: 'issueBond' } | { type: 'repayBond' }
  | { type: 'setSpeed'; speed: Speed } | { type: 'setOption'; key: 'autoBudget' | 'autoGoto' | 'noDisasters' | 'sound' | 'music' | 'paperDelivery' | 'extraPaper'; value: boolean }
  | { type: 'requestDisaster'; kind: number; x?: number; y?: number } | { type: 'dispatch'; kind: 0 | 1 | 2; x: number; y: number }
  | { type: 'sign'; at: number; text: string | null } | { type: 'rename'; slot: number; text: string }
  | { type: 'cheat'; code: string } | { type: 'terrainDone' }                              // 地形编辑 → 城市模式
  | { type: 'modalAnswer'; dialog: string; answer: number };                                 // 军事基地 / 桥型 / 球队 / 情景 等模态回答
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

// ===== io.ts =====（file-formats §3.2 原文；此处只列签名）
export type ChunkId = 'CNAM' | 'MISC' | 'ALTM' | 'XTER' | 'XBLD' | 'XZON' | 'XUND' | 'XTXT' | 'XLAB' | 'XMIC' | 'XTHG' | 'XBIT' | 'XTRF' | 'XPLT' | 'XVAL' | 'XCRM' | 'XPLC' | 'XFIR' | 'XPOP' | 'XROG' | 'XGRP' | 'TEXT' | 'SCEN' | 'PICT' | 'TMPL';
export interface Sc2Document { cityName: string; misc: Int32Array; altm: Uint16Array; xter: Uint8Array; xbld: Uint8Array; xzon: Uint8Array; xund: Uint8Array; xtxt: Uint8Array; xbit: Uint8Array; xlab: Uint8Array; xmic: Uint8Array; xthg: Uint8Array; xtrf: Uint8Array; xplt: Uint8Array; xval: Uint8Array; xcrm: Uint8Array; xplc: Uint8Array; xfir: Uint8Array; xpop: Uint8Array; xrog: Uint8Array; xgrp: Int32Array; scenario?: { texts: { kind: number; text: string }[]; scen: Uint8Array; pict?: Uint8Array; tmpl?: Uint8Array }; unknownChunks: { id: string; data: Uint8Array }[] }
export declare const MISC: Readonly<Record<string, number>>;                 // file-formats §3.4.4 全表 + 零区注册（prngMarker 0x1054, prngState 0x1058, saveFormatVersion 0x105C, viewZoom 0x1060, xtxtShadow 0x10BC）
export declare const miscGet: (m: Int32Array, off: number) => number;
export declare const miscSet: (m: Int32Array, off: number, v: number) => void;
export declare const cohortOffset: (k: number, f: 'count' | 'eqSum' | 'leSum') => number;
export interface ReadResult<T> { value: T; diagnostics: Diagnostic[] }

// ===== catalogue.ts =====（building-catalogue §3.1 的类型；数据由 WP9 的 src/data 提供）
export type Footprint = 1 | 2 | 3 | 4;
export type TechKey = 'gas' | 'nuclear' | 'solar' | 'wind' | 'microwave' | 'fusion' | 'airport' | 'highways' | 'buses' | 'subways' | 'waterTreatment' | 'desalinization' | 'arcoPlymouth' | 'arcoForest' | 'arcoDarco' | 'arcoLaunch';
export type OrientMode = 'none' | 'byId' | 'flipBit' | 'byIdAndFlip';
export interface BuildingDef { id: number; key: string; name: string; category: string; size: Footprint; placeable: boolean; tool?: string; cost: number; upkeepPerYear: number; budgetLine?: string; tech?: TechKey; unlock?: { rewardBit: 0 | 1 | 2 | 3 | 4; popOver: number; once: boolean }; powerable: boolean; consumesPower: boolean; piped: boolean; consumesWater: boolean; pollutionPerTile: number; popWeight: number; residents: number; jobs: number; zone?: { type: 'R' | 'C' | 'I'; tier: 0 | 1 | 2; weight: number; level: 1 | 2 | 3 | 4 }; transition?: 'construction' | 'abandoned'; microsim?: { type: number; shared: boolean }; nimby: boolean; orient: OrientMode; lifetimeYears?: number; placement?: { terrain: 'flat' | 'waterfall' | 'slopeEntrance' | 'any'; waterCellsInFootprint?: [number, number]; needsAdjacent?: 'road' | 'rail' | 'highway+road' } }
export interface CatalogueApi { BUILDINGS: readonly BuildingDef[]; FOOTPRINT: Uint8Array; TOOLS: readonly ToolDef[]; TECH_BASE_YEAR: Readonly<Record<TechKey, number>> }
export interface ToolDef { id: string; group: string; label: string; placeMode: 'point' | 'line' | 'rect' | 'path'; cursor: Footprint | 'variable' | 'none'; cost: number; costUnit: 'tile' | 'segment2x2' | 'click' | 'building' | 'changedTile' | 'none'; buildingIds?: readonly number[]; zoneCode?: number; undergroundView?: boolean; tech?: TechKey; hotkey?: string; availableIn: 'city' | 'map' | 'both' }

// ===== render.ts =====
export type ZoomLevel = 0 | 1 | 2 | 3 | 4;                                   // XS S M L XL
export type ArtScale = 'XS' | 'S' | 'M' | 'L' | 'XL';
export interface ViewState { zoom: ZoomLevel; rotation: 0 | 1 | 2 | 3; centerX: number; centerY: number; underground: boolean; show: { buildings: boolean; signs: boolean; infrastructure: boolean; zones: boolean }; mapLayer: string | null }
export interface IndexedBitmap { w: number; h: number; data: Uint8Array; anchorX: number; anchorY: number; cycling: boolean }
export type SpriteKind = 'xbld' | 'terrain' | 'water' | 'xund' | 'overlay' | 'actor' | 'ui';
export interface SpriteKey { kind: SpriteKind; id: number; variant?: number; frame?: number }
export interface Palette { rgba: Uint8ClampedArray /*256×4*/; cycles: Array<{ start: number; length: number; periodMs: number; dir: 1 | -1 }> }
export interface SpriteProvider { readonly name: 'procedural' | 'dat'; readonly palette: Palette; readonly nativeScales: ReadonlySet<ArtScale>; has(key: SpriteKey, scale: ArtScale): boolean; bitmap(key: SpriteKey, scale: ArtScale): IndexedBitmap | null; frameCount(key: SpriteKey): number; fps(key: SpriteKey): number }
/** 渲染器输入：只读状态 + 变更通知；由 app 构造 */
export interface RenderSource {
  readonly state: Readonly<CityState>; readonly q: Pick<Queries, 'disasters' | 'transport' | 'zones'>;
  takeChanges(): { tiles: Int32Array; layers: BulkLayer[] };                 // 自上次调用以来的脏格与脏层（core.changeLog）
  readonly animTick: number;                                                 // 由 app 推进的动画节拍
}
export interface Renderer { mount(el: HTMLElement): void; setView(v: ViewState): void; frame(dtMs: number): void; pick(px: number, py: number): { x: number; y: number } | null; setPreview(p: { tiles: number[]; bad: number[] } | null): void; setProviders(p: SpriteProvider[]): void; destroy(): void }

// ===== host.ts =====（UI / app 唯一需要知道的 sim 外形）
export interface SimHost {
  readonly state: Readonly<CityState>; readonly q: Queries;
  dispatch(cmd: Command): CommandResult; tick(dtMs: number): void; resume(): void;
  drainEvents(): SimEvent[]; hash(): number; commandLog(): readonly LoggedCommand[];
  newCity(p: NewCityParams): void; load(doc: Sc2Document): Diagnostic[]; save(): Sc2Document;
}
```

契约的"不可协商"项（改动须 RFC）：`tileIndex` 主序、`ANCHOR_BIT = TL`、`DAY_PHASES/PHASE_OWNER/PHASE_IO`、`ACTION_OWNER`、`Command/SimEvent` 的 `type` 字面量、`Prng` 方法语义与 `mulberry32` 测试向量、`XBit` 掩码。

---

## 10. 风险与取舍

| # | 风险 / 取舍 | 应对 |
|---|---|---|
| 1 | **规格残留冲突**：`zones` §3.1 仍写 `i = y*128+x`、`transport` 的 `(y,x)` 升序遍历措辞 | 契约只暴露 `tileIndex/tileX/tileY`；lint 测试 grep `* 128`/`% 128` 字面量；电水 T2/T4–T7 反转置测试兜底 |
| 2 | **浮点确定性**：`terrain` 生成器的 `pow`、灾害的 `rng.float()` 概率比较 | 禁 `Math.pow/exp/log/sin/cos/sqrt`（ESLint）；`pow(n,1.15)` 用多项式近似；比较用 `float()` 本身跨引擎一致 |
| 3 | **生长扫描最坏性能**（全图密区 + 大路网 40 ms/月）| 表驱动 `step()`、预分配栈、`accessStart` 缓存；若仍超预算，把 `runTrip` 的四次尝试改为位扫描；长跑测试记录 p95 |
| 4 | **Pixi v8 API 漂移**（`cacheAsTexture`、`TextureSource`）| 渲染器只在 `render/pixi-adapter.ts` 触 Pixi；锁 `^8.6.0`；像素快照测试 |
| 5 | 车站 2×2 / 1×1 之争、`0x104C` 语义、`0x1018` 视图中心 vs 质心等**原版事实不确定** | 全部做成 Tuning 开关或零区字段，默认取各规格裁定；记录在 `docs/arch/open-questions.md` |
| 6 | **第三方存档导入**：角标不规范、微模拟标签被灾害标记覆盖、XTHG 字节含义未知 | `rebuild()` 一律"修复 + 诊断"而非拒绝；导入对话框展示诊断 |
| 7 | **与原版互通**：我们写进零区的字段（PRNG、侧表、版本号）原版是否忽略未验证 | "兼容导出"选项清零零区；默认保留（dfloer 观察这些区在原版样本中恒为 0 且不参与读取） |
| 8 | **主线程 sim** 在 African Swallow + 大城市下可能挤占帧预算 | `maxDaysPerFrame` 自适应（按上一帧耗时）；Worker 路径已预留（§3.7） |
| 9 | **程序化美术与"原汁原味"的落差** | 美术 bible 固定网格 / 锚点 / 光照，使 DAT 导入零改动替换；多样性断言防止千篇一律 |
| 10 | **契约冻结太早**导致 WP 发现缺口 | 契约含 `Partial<Record<ModuleId, unknown>>` 的派生槽与 `TuningBag` 逃生口；缺口走 RFC 批量合并，WP 内先用局部类型 |
| 11 | IndexedDB 配额 / Safari 无目录授权 / 无 OffscreenCanvas | 回退链（`file-formats.md` §3.9.6）；"仅本次会话"模式 |
| 12 | **不做**：撤销、联机、Canvas2D 后备、DOS 版素材、MIF（最低优先级）| 快照机制与命令日志让撤销 / 分支预演可后补 |

### 取舍小结

- 牺牲"一个 `System.step(ctx)` 的简洁"，换取按天阶段表 + 静态 I/O 声明的可验证调度。
- 牺牲 UI 框架带来的开发速度，换取零依赖、可拆仓、Playwright 友好的 DOM 外壳。
- 牺牲索引色着色器的"零成本调色板循环"，换取 v1 更少的渲染未知数（CPU 烘焙 ≈ 30 张小纹理 / tick）。
- 接受"读档后运行态归零"（与原版一致），换取存档格式 = `.SC2` 的单一性与第三方互通。
