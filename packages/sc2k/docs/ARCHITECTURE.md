# `packages/sc2k` 最终架构（ARCHITECTURE）

> 本文是 `packages/sc2k`（网页版 SimCity 2000 复刻，以 Win95 Special Edition 为蓝本）的**最终架构**。骨架取自胜出提案 `docs/arch/proposal-delivery-first.md`（交付机制：全桩应用先行、零重叠目录、冻结接线文件、两层存档），并按评审要求嫁接 `proposal-render-first.md` 的渲染设计（`SceneCompiler` + 深度带 + `CpuCompositor` + 预算切片）与 `proposal-sim-first.md` 的内核纪律（固定字段序哈希、`nationalAnnual` 拆分、契约一致测试、兼容导出）。三份提案中与本文冲突之处一律以本文为准。
> 配套文档：`docs/CONTRACTS.md`（可直接落地的 TypeScript 契约，T+1:30 冻结）、`docs/WORKPLAN.md`（WP0 + 14 个并行 WP、独占文件、验收、集成顺序）。规格数值一律引用 `docs/spec/*.md`，本文不重述。
> 标记：`[决定]` 本文拍板；`[v1]` 日终 `v1-playable` 必达；`[v2]` 次日起；`§x.y` 不带文件名指本文；`spec:terrain §2.5.4` 指规格文件章节。

---

## 0. 阅读顺序与三份文档的关系

| 读者 | 先读 | 再读 |
|---|---|---|
| Lead / WP0 | 本文 §1–§5、§10、§12 | `CONTRACTS.md` 全文 → `WORKPLAN.md` §1–§2 |
| 模拟 WP（WP2–WP8、WP13） | 本文 §3–§5、§10 | `CONTRACTS.md` 的 `state/clock/system/queries/actions/commands/events/io/snapshot` → 自己规格 |
| 渲染 / 美术 WP（WP9–WP11） | 本文 §6、§8、§11 | `CONTRACTS.md` 的 `render/rotation/footprint/dirty` → `spec:ui-art` |
| 外壳 WP（WP12、WP14） | 本文 §7、§9 | `CONTRACTS.md` 的 `host/commands/events/render/assets/audio` → `spec:ui-art`、`spec:file-formats` |

三份文档的分工：本文回答"为什么这样切、运行时怎么协作、预算与风险"；`CONTRACTS.md` 是唯一的接口真源（代码落地后以 `src/contracts/**` 为准，文档只解释）；`WORKPLAN.md` 回答"谁、在哪些文件里、交付什么、怎么验收"。

---

## 1. 决策总览

### 1.1 一句话

**WP0 先交付一个"全是桩"的、能跑能测能看的完整应用**（空城、速度按钮、`SceneCompiler + CpuCompositor` 画出的首帧、9 个空系统），之后每个工程师只在自己独占的目录里把桩换成实物；`src/app/wire.ts` 从冻结起到 `v1-playable` 打标**只改一处常量**（`stubAllowlist`，§5.9）；合并 = 分支并集，CI 对并集跑 `lint + typecheck + test + headless + e2e`。

### 1.2 从三份提案各取什么（嫁接清单 → 落点）

| # | 嫁接项 | 来源 | 落点（本文章节 / 契约文件） |
|---|---|---|---|
| 1 | `SceneCompiler.compileTile(snap,i,out) → SceneItem[]`，`zKey = depth·2^12 + rx·2^4 + layer`，`CpuCompositor` 像素验收；渲染 WP 拆成 scene（无 DOM）与 pixi（后端） | render-first §4.3/§4.9 | §6.2–§6.4、§6.8；`contracts/render.ts`；WP10 / WP11 |
| 2 | 16 条深度带 `Container({ isRenderGroup: true })`，带内按 `zKey` 二分插入；取代 64 块 `cacheAsTexture` | render-first §4.4 | §6.5；退路见 §12 R1 |
| 3 | 派生档 `worldRoot.scale = k`；地块动画 = 稳定 `Texture` 句柄 + `animPage` 原地上传（256²/512² 子页按脏上传） | render-first §4.5–§4.7 | §6.6–§6.7 |
| 4 | `sim.advance(dt, budgetMs = 6)` 预算切片，`maxDaysPerFrame = 10` 仅作硬顶；灾害 / 物件 tick 同预算 | render-first §3 | §5.2；`contracts/host.ts` |
| 5 | 旋转置换表与 `renderAnchor/drawFlip` 全部进 `contracts/rotation.ts`，删除 render→sim 的 lint 白名单 | render-first §9.2 | §6.3；`contracts/rotation.ts` |
| 6 | Pixi 初始化参数、`stage.eventMode = 'none'`、整数 `backingScale`、DOM 标牌层、`RendererApi.stats()` 性能门禁 | render-first §4.1/§4.8/§9.5 | §6.9；WP11 验收 |
| 7 | `hashState` 不经 JSON：标量按 schema 固定字段序进 `Int32Array`，键名排序，`hash(s, scope: 'full' \| 'sc2')` 两档与显式排除表 | sim-first §2.6 + 评审 | §4.2–§4.3；`contracts/snapshot.ts` |
| 8 | 类型化 `RejectReason`、`ModalId`、`CommandResult.modal`、`SimEvent` 的 `goto/sound/actor/toolbar/modal` 变体 | render-first §9.4 | §7.3；`contracts/commands.ts`、`events.ts` |
| 9 | `tools/headless.ts` 输出每阶段 ms 的 p95 与 `renderer.stats()`；长跑记录不断言精确值 | sim-first §3.5 / render-first §8 | §10.5、§11 |
| 10 | 多样性断言改为 (ramp, silhouette) 组合两两不同 + tier 明度阶单调；文案集中 `src/data/strings.*.ts` + CI 关键词黑名单 | render-first §6 / §10 #14 | §8.3、§10.7 |
| 11 | `PhaseId` 拆成 `'nationalAnnual.zones' \| 'nationalAnnual.economy'` | sim-first §3.2 | §5.3；`contracts/clock.ts` |
| 12 | 契约一致测试：`PHASE_OWNER` 覆盖全部 `PhaseId`、造价表 vs economy 价格快照、法令表 vs zones 乘数 | sim-first §8 | §10.2；`sim/core/registry.test.ts` |
| 13 | `DirtyTracker`（位图 + 去重列表 + 整层标志）取代 `changeLog` 数组 | render-first §2.2 | §3.5；`contracts/dirty.ts` |
| 14 | 无头长跑不变量（角标 / `Σ XVAL` / `XBIT & 0x08` / `XTXT` 悬空 / 利用率区间） | render-first §8 | §10.4 |
| 15 | `RendererApi.stats/setHeatLayer/thumbnail/goto/screenOf/setActors`；Map 窗口用 2D canvas 写 `ImageData` | render-first §9.5 / §5 | §6.9、§7.4；`contracts/render.ts` |
| 16 | 拆分 W3：placement 与 utilities 各自成 WP；`src/data/**` 归 WP0 | sim-first §9.1 / 评审 | `WORKPLAN.md` WP3 / WP4 / WP0 |
| 17 | `exportSc2({ compat: true })` 清零零区 | sim-first §2.5 / §10 #7 | §4.4 |
| 18 | `priv`（持久、入快照、入哈希）与运行缓存（闭包）分离，`priv` 仅整数 / TypedArray / 普通对象并带 `v` 版本与字节预算 | sim-first §2.2 + 评审 | §3.3 |
| 19 | art Worker 生成 + `transfer`，首帧 < 150 ms | render-first §9.1 | §8.4 |
| 20 | `BuildingDef/ToolDef` 去掉 `phase`，改为 `app/v1Tools.ts` 白名单 | 评审 | §7.6 |
| 21 | Lead 独占 `app/patches/` 适配层作为跨模块修补逃生口 | 评审 | §5.9、`WORKPLAN.md` §4 |
| 22 | `createSim` 按 `SYSTEM_ORDER` 固定序注册，与传入顺序无关 | 评审 | §5.4 |
| 23 | `postLoad(ctx, source: 'snapshot' \| 'sc2')`；快照载入不消费 PRNG | 评审 | §4.5 |
| 24 | `writeSc2` 进 WP2 `[v1]`、`exportCity` 在合并列车 #3 前落地、`saves` 默认 `kind = 'sc2'` | 评审 | §4.4、§9.3 |
| 25 | testkit 同时提供乐观 / 悲观 / 现实三套桩；每个 WP 验收在乐观 + 悲观下都跑；哈希基线只在合并列车 #2 后建立 | 评审 | §10.3 |
| 26 | `LoggedCommand` 加 `phaseCursor`；快照允许在挂起态保存并编码 `phaseCursor`，`.SC2` 要求 `phaseCursor == 0` | 评审 | §5.6 |
| 27 | `CreateSimOptions.snapshot: SnapshotCodec` 必填注入（core 不 import `io/**`；`wire.ts` / `testkit` / `replay` 调用方同一注入点） | 终审 #1 | §2.2、§5.4；`contracts/system.ts` |
| 28 | `contracts/entrypoints.ts`：各目录 `index.ts` 的导出名与签名、`ShellOptions / ShellHandle / WindowId`、`window.__sc2k` 调试句柄 | 终审 #2 | §2.1；`CONTRACTS.md` §V |
| 29 | `COMMAND_OWNER / MODAL_OWNER / NOT_IMPLEMENTED_RESULT`、`System.onModalAnswer`；`registry.test` 查命令覆盖 | 终审 #3 | §5.5、§10.1 |
| 30 | `OverlayId / ActorId / UiIconId` 整数枚举与 EdgeWall / ZoneTint / Marker 的 `SpriteKey` 约定；`DisasterKind / NewsType` | 终审 #4 | §6.2；`contracts/render.ts`、`grid.ts`、`events.ts` |
| 31 | `mapOrigin` 与"顶点 c00' / 底顶点 c11' / 地块中心"像素约定 | 终审 #5 | §6.3 |
| 32 | `System.endOfDay` + `END_OF_DAY_IO`（utilities 日末 flush、zones 逐日 lot 计时器） | 终审 #6 | §5.1、§5.3、§5.8 |
| 33 | 唯一 owner：`economy.industryTax`（删 `industry.tax`）、`census.workforcePctUsed`（`demographics.workforcePct` 的只读副本） | 终审 #7 | §3.1 |
| 34 | 灾害 / 报纸 / 科技、DAT 最小导入、地下视图、Graphs / Ordinances / Bonds / Neighbors / Newspaper 窗口、邻城、完整工具白名单、桥（堤道 / 铁路桥 / 高架电线）、触控子集全部进 `[v1]`；`WIRE_STUB_ALLOWLIST` 打标时为空 | 终审 #8–#18 | §5.9、§6.10、§7.2–§7.6、§9.3、§13；`WORKPLAN.md` |

### 1.3 不可协商项（改动须走 RFC，见 `WORKPLAN.md` §5）

`tileIndex = x*128 + y` 主序；`ANCHOR_BIT = XZON.TL (0x40)`；`DAY_PHASES / PHASE_OWNER / PHASE_IO / END_OF_DAY_IO / SYSTEM_ORDER / GROWTH_VISIT_ORDER / IMPORT_ORDER`；`ACTION_OWNER / COMMAND_OWNER / MODAL_OWNER`；`System.endOfDay` 的调用时点；`CreateSimOptions.snapshot` 为唯一快照编解码注入点；`Command / SimEvent` 的 `type` 字面量；`Prng` 语义与 mulberry32 测试向量；`XBit` 掩码；`FOOTPRINT`；`SLOPE_ROT_CCW` 及其同源置换；`zKey` 公式与 `SceneLayer` 枚举；`OverlayId / ActorId / UiIconId / DisasterKind / NewsType` 数值；`mapOrigin` 与像素锚点约定；`CONTRACTS.md §V` 的入口名；`priv` 的类型白名单与版本字段；快照 schema 的字段序。

---

## 2. 包布局与依赖方向

### 2.1 目录（★ = WP0 创建；每行末尾为 owner，详见 `WORKPLAN.md` §2）

```
packages/sc2k/
  package.json  tsconfig.json  tsconfig.sim.json  vite.config.ts  index.html  README.md   ★ WP0
  docs/  spec/  arch/  ARCHITECTURE.md  CONTRACTS.md  WORKPLAN.md  contract-rfc.md  open-questions.md
  tools/
    gen-catalogue.ts   ★ WP0   // 解析 spec:building-catalogue 的表格 → src/data/buildings.generated.ts
    strings-scan.ts    ★ WP0   // 关键词黑名单扫描（§10.7）
    headless.ts  hash-compare.ts        WP1   // 无头长跑 / 双跑哈希比对，输出 JSON + p95
    art-sheet.ts                        WP9   // contact sheet → docs/art-preview/（gitignore）
  e2e/
    playwright.config.ts ★ WP0   smoke.spec.ts  hash.spec.ts   WP12
  src/
    main.ts                       ★ WP0   // 仅 `import './app/boot'`
    contracts/                    ★ WP0   // 类型 + 微量运行时（grid/rotation/footprint/net/prng/clock 常量/snapshot schema）；T+1:30 冻结
    data/                         ★ WP0   // buildings.generated.ts tools.ts techBaseYears.ts ordinances.ts strings.zh.ts strings.en.ts（SSOT）
    testkit/                      ★ WP0+WP1 // createTestContext、三套桩、golden-mini-city、hashOf、pngOf；仅测试与 tools import
    sim/
      core/                       WP1    // 调度器、命令队列、TileWriter+DirtyTracker、事件缓冲、hash、重放、saveload 编排、SimHost
      terrain/                    WP2
      placement/                  WP3
      utilities/                  WP4
      zones/                      WP5
      transport/                  WP6
      services/                   WP7
      economy/                    WP8    // 含 scenario
      events/                     WP13   // [v1] 天气 / 五种灾害 / 状态机 / marker / 调度 / 科技 / 最小报纸（第一波）；[v2] 物件 / 情景灾害 / XTHG / 报纸全量
    io/
      snapshot/                   WP1    // .sc2kweb 编解码（schema 驱动）；导出 snapshotCodec，由 wire.ts / testkit 注入 createSim
      sc2/                        WP2    // bytes iff rle read write misc（纯编解码，不认识 CityState）
      assets/                     WP14   // [v1] sprites palette identify store worker + DatSpriteProvider + 最小文件输入入口；[v2] 目录授权 / 拖放 / 完整面板 / 色循环 / text
    art/                          WP9    // palette raster recipes provider worker
    render/
      scene/  projection.ts  compiler.ts  picking.ts  camera.ts  minimap.ts    WP10   // 纯函数，无 DOM
      cpu/    compositor.ts  png.ts                                             WP10
      pixi/   backend.ts  atlas.ts  bands.ts  animPage.ts  labels.ts  actors.ts WP11
      index.ts                    ★ WP0 转发桩 → WP11 接手
    ui/                           WP12   // DOM 外壳
    audio/                        WP12   // AudioSink：v1 静默实现 + 事件映射；v2 WebAudio 原创合成音
    app/
      wire.ts                     ★ WP0   // 唯一接线文件；import 各目录 index.ts；只改 stubAllowlist 常量
      v1Tools.ts                  ★ WP0   // V1_TOOL_IDS 白名单（§7.6）
      stubs/                      ★ WP0   // nullSystem、stubQueries（三套）、stubActions、stubRenderer(CpuCompositor→<canvas>)、stubShell、stubProvider（洋红）
      patches/                    Lead    // 集成期逃生口（§5.9），日内默认为空目录 + README
      boot.ts loop.ts session.ts  WP12
```

每个 `src/sim/<id>/index.ts`、`src/art/index.ts`、`src/render/index.ts`、`src/ui/index.ts`、`src/io/{sc2,snapshot,assets}/index.ts`、`src/audio/index.ts`、`src/data/index.ts` 由 WP0 写成**一行转发桩**（例如 `export { createNullTerrain as createTerrainSystem } from '../../app/stubs/null'`），对应 WP 接手后整目录重写；`wire.ts` 只 import 这些 `index.ts`。**导出名与签名由 `CONTRACTS.md §V`（`contracts/entrypoints.ts`）逐目录固定**：`sim/<id>/index.ts` 的 `create<Id>System()`、`render/index.ts` 的 `createRenderer / sceneCompiler / cpuCompositor`、`art/index.ts` 的 `createProceduralProvider`、`io/sc2` 的 `sc2Codec`、`io/snapshot` 的 `snapshotCodec`、`io/assets` 的 `createAssetStore / createAssetImporter`、`audio` 的 `createAudioSink`、`ui` 的 `mountShell(ShellOptions): ShellHandle`、`data` 的 `CATALOGUE / createStrings`；`app/boot.ts` 在 DEV 或 `?debug` 下挂 `window.__sc2k = { host, renderer, shell, version }` 供 e2e 读取。桩、真实现与 `wire.ts / boot.ts` 三方都以 `satisfies` 对账该文件，合并列车 #1 不再会在接线处出现三套名字。

### 2.2 依赖方向（ESLint `no-restricted-imports` 按目录强制，WP0 在根 `eslint.config.js` 追加）

```
contracts ← data ← sim/core ← sim/<x> ← io/snapshot, io/sc2 ← art ← render/scene, render/cpu ← render/pixi ← ui, audio ← app
```

- `sim/<a>` 禁止 import `sim/<b>`（只能经 `ctx.q` / `ctx.act`）；`sim/**` 禁止 import `io/**`、`art/**`、`render/**`、`ui/**`。因此 `sim/core` 的 `saveSnapshot / loadSnapshot / hash / replay` 用的是 `CreateSimOptions.snapshot`（`io/snapshot/index.ts` 的 `snapshotCodec`，由 `app/wire.ts` 与 `src/testkit`（可 import `io/**`）注入），core 自身没有第二套编码器。
- `art/render/ui/audio` 禁止 import `sim/**`（只读 `CityState` 类型与 `Queries`）。**没有白名单**：旋转置换表在 `contracts/rotation.ts`。
- `render/scene`、`render/cpu` 禁止 import `pixi.js` 与任何 DOM 类型（受 `tsconfig.sim.json` 约束）。
- `io/assets/import` 禁止 import `fetch/XMLHttpRequest/WebSocket/navigator.sendBeacon` 相关模块（隐私红线，§9.4）。
- 新包不 import `@ra2web/*`；源码一律相对路径（根 `vitest.config.ts` 的 glob `packages/*/src/**/*.test.ts` 自动纳入，零改动）。
- 确定性规则：把根 `eslint.config.js` 中 `packages/game` 的 `no-restricted-properties/globals` 块复制一份作用于 `packages/sc2k/src/{contracts,data,sim,art,io/sc2,io/snapshot,render/scene,render/cpu}/**/*.ts`（测试文件除外），并追加 `Math.pow/exp/log`（§5.8）。

### 2.3 `package.json` / tsconfig / Vite

```json
{ "name": "sc2k", "version": "0.0.1", "private": true, "type": "module",
  "scripts": {
    "dev": "vite --port 5174", "build": "vite build", "preview": "vite preview --port 5174",
    "typecheck": "tsc -p tsconfig.json --noEmit && tsc -p tsconfig.sim.json --noEmit",
    "gen:catalogue": "tsx tools/gen-catalogue.ts", "strings:scan": "tsx tools/strings-scan.ts",
    "headless": "tsx tools/headless.ts", "hash:compare": "tsx tools/hash-compare.ts",
    "art:sheet": "tsx tools/art-sheet.ts", "e2e": "playwright test -c e2e/playwright.config.ts" },
  "dependencies": { "pixi.js": "^8.6.0" },
  "devDependencies": { "@playwright/test": "^1.48.0", "@types/node": "^22.10.0", "vite": "^7.0.0" } }
```

- `tsconfig.json`：extends `../../tsconfig.base.json`；`lib: ["ES2022","DOM","DOM.Iterable"]`；`types: ["vite/client"]`；`include: ["src","tools","e2e","vite.config.ts"]`。
- `tsconfig.sim.json`：extends base；`lib: ["ES2022"]`；`types: []`；`include: ["src/contracts","src/data","src/sim","src/art","src/io/sc2","src/io/snapshot","src/io/assets/sprites","src/io/assets/palette","src/io/assets/text","src/render/scene","src/render/cpu"]`；`exclude: ["**/*.test.ts"]`。任何 `document / window / performance / Worker` 在这些目录里是**编译错误**。
- `vite.config.ts`：`base: './'`、`build.target: 'es2022'`、`worker.format: 'es'`、`optimizeDeps.include: ['pixi.js']`、`server: { port: 5174, host: true }`、无中间件、不开 COOP/COEP。`index.html`：`<meta name="viewport" content="width=device-width, initial-scale=1, user-scalable=no">`、`<div id="app">`、`<script type="module" src="/src/main.ts">`、CSS 变量（斜面窗口四色）与 `html,body{margin:0;height:100%;overflow:hidden}`。
- `@playwright/test` 不在 `pnpm-lock.yaml`，本机无 Chromium 缓存：WP0 负责 `pnpm add -D` 与 `playwright install chromium`；若网络受限失败，`e2e` 在 v1 期间降级为"尽力而为"（CI 以 `SC2K_E2E=skip` 跳过），**像素验收不依赖它**（§6.8、§10.6）。

---

## 3. 核心数据模型

### 3.1 真源：`CityState`（与 `.SC2` 同编码的图层 + 有存档映射的标量 + 各系统 `priv`）

| 组 | 字段 | 类型 | 索引 / 存档 | 写者 |
|---|---|---|---|---|
| 地块层 | `layers.{xter,xbld,xzon,xund,xtxt,xbit}` | `Uint8Array(16384)` | `i = x*128 + y`；同名 chunk | 经 `TileWriter`（§3.5） |
| 地形 | `layers.{alt,waterLevel,tunnelLevels}` | `Uint8Array(16384)` | `ALTM` 拆位 | terrain |
| 标签 / 微模拟 / 物件 | `layers.{xlab(6400),xmic(1200),xthg(480)}` | `Uint8Array` | 同名 chunk | services / events |
| 低分辨率图 | `maps.{xtrf,xplt,xval,xcrm}(4096)`、`maps.{xplc,xfir,xpop,xrog}(1024)` | `Uint8Array` | `halfIndex / quarterIndex` | services（`xtrf` 由 transport 经 `act.addTraffic` 累加） |
| 计数 | `counts.{tile(256),zone(8),military(16)}` | `Int32Array` | `MISC 0x01F0/0x05F0/0x0FA8` | core（`TileWriter` 增量） |
| 图表 | `xgrp` | `Int32Array(832)` | `XGRP` | economy |
| 时钟 | `clock` | 标量（含 `prngState`） | `MISC 0x0010/0x000C/0x0FEC/0x0004/0x1058` | core |
| 经济 | `economy` | 标量 + `Int32Array(11)` + `Uint8Array(11)` + `bonds[]` | `MISC` 税线 / 经费线 / 债券 / 法令 | economy |
| 人口 / 需求 | `census demand caps industry neighbors national` | 标量 / `Int32Array` | `MISC 0x0074…0x0720`（产业税率 `0x016C+44..` 除外，归 economy） | zones（`industry` 无 `tax`：产业税率唯一真源是 `economy.industryTax`；`census.workforcePctUsed` 只是 `demographics.workforcePct` 的只读副本，`hash:'none'`） |
| 人口学 / 奖励 | `demographics rewards` | `Int32Array(60)` / 标量 | `MISC 0x007C…、0x0020/0x0078/0x0E4C…` | services |
| 天气 / 灾害 / 科技 | `weather disaster tech` | 标量 / `Int32Array(17)` | `MISC 0x0060…0x0070、0x0738…、0x1000…0x1048` | events |
| 报告 | `utilities.{power,water}`、`traffic`、`totals` | 标量 | `MISC 0x0030/0x104C`、`XGRP` | utilities / services |
| 元数据 | `cityName mayorName terrain{seaLevel,coast,river,rotation} view{x,y,zoom}` | | `CNAM`、`MISC 0x0E40…/0x0008/0x1014…` | core / ui |
| 底稿 | `rawMisc: Int32Array(1200)` | | 不理解的偏移原值写回 | io 编排 |
| **私有持久态** | `priv[systemId]` | `PrivState`（§3.3） | 只进快照，不进 `.SC2` | 各系统 |

`[决定]` `prng` 的 32 位状态是 `clock.prngState`，core 的 `Prng` 实现直接以该字段为后备存储（`createPrng(seed, cell)`），因此快照 / 哈希天然包含它，不需要"存档前同步"。

### 3.2 建筑实例：没有实例表 `[决定]`

- 多格建筑 = 占地每格 `xbld` 同 ID + `xzon` 高 4 位角标；**锚点 = TL 位（`0x40`）**；1×1 四位全置也含 TL，故"TL 置位格数 = 栋数"。
- 需要"整栋"的地方（渲染、查询、拆除、微模拟）用契约纯函数 `anchorOf(layers, i)`（`FOOTPRINT[id]` 探测 ≤ 16 次）与 `forEachLotTile(anchor, n, fn)`。**两者一律经 `tileX/tileY` 偏移**，不用 `i ± 1 ± 128`（x 边缘会绕列，`spec:power-water §1.1`）。
- 第三方存档角标不规范时，`anchorOf` 的歧义只在 `IMPORT_ORDER` 的 zones 步（角标重建，`spec:file-formats §3.4.2` 第 4 步）之后消失——所以导入顺序锁定在契约 `IMPORT_ORDER` 中（§4.5）。
- 各模块若要对象表（utilities 的 `plants[]`、transport 的 `stations[]`、zones 的 `lots`），放 `priv` 并自己维护；别人不读。services 的覆盖图案以 TR 位为原点是其内部口径，由 TL 锚点 + `FOOTPRINT` 换算。

### 3.3 `priv` 规则与运行缓存分离 `[决定]`

| 规则 | 内容 | 兜底 |
|---|---|---|
| 形状 | `priv[id]: { v: number; ...fields }`，`v` 为该系统私有 schema 版本（整数，从 1 起）；字段值只允许：安全整数、字符串、布尔、`Uint8Array/Int8Array/Uint16Array/Int16Array/Int32Array/Uint32Array`、以上的数组与普通对象 | 快照编码器遇到 `Map/Set/function/undefined/非有限数/非整数 number/类实例` **抛错**（`snapshot.test`） |
| 内容 | 只放**不可由真源层重建**的运行态：lot 计时器与 `pendingTier`、电厂燃料 / 寿命微调、物件寿命、`ytd` 账目、灾害 `marker/fuel/cloudLife/riotLife`、`stationOf` 之类**可重建**的表**不得**放入 | `registry.test` 断言 `PRIV_BUDGET_BYTES[id]`（§CONTRACTS `snapshot.ts`）不被超出 |
| 版本 | `v` 不等于系统当前 `PRIV_VERSION` 时，系统在 `postLoad(ctx,'snapshot')` 里要么迁移、要么丢弃并从真源重建（二选一，不得崩溃） | `snapshot.test` 用 `v = 0` 的旧 priv 载入，断言不抛错 |
| 运行缓存 | `anchor` 缓存、`net/conn/stationOf`、`navRegion`、`scratch` 队列、`cityCenter`、`trafficReport` 等派生物放在系统对象的**闭包字段**，读档（任一来源）后在 `postLoad` 重建 | 声明了 `priv` 的系统必须实现 `postLoad()`（`registry.test`） |
| 哈希 | `priv` 全部进 `hash('full')`，不进 `hash('sc2')`（§4.3） | |

### 3.4 地下层与低分辨率图

地下 = `xund`（地铁 / 管线 / 十字 / 入口 / 导弹井）+ `tunnelLevels`；没有第二套表。八张低分辨率图是真源（存档即它们），每月第 2 天由 services 整体替换；`xtrf` 只有两条写路径：transport 经 `act.addTraffic` 累加、services 第 19 天 `decayTraffic`。

### 3.5 写入纪律：`TileWriter` + `DirtyTracker`（core 实现 `Actions` 的 `set*`）

| 操作 | 入口 | 副作用 |
|---|---|---|
| 单格改 `xbld / xzon / xund / xter / alt / waterLevel / tunnelLevels` | `act.setXbld(i,id)`、`act.setXzon`、`act.setXund`、`act.setTerrain(i, alt, xter, waterLevel)` | 增量更新 `counts.*`；`dirty.mark(i)`（O(1) 去重）；`onTilesChanged` 扇出（阶段末批量） |
| 单格位 | `act.setXbit(i, mask, on)` | `dirty.mark(i)` |
| 整层重建（`POWERED/WATERED`、八张图、`xtxt` 合成、`xthg`、`xmic`） | 直接写数组，阶段末 `act.layerChanged(layer)` | `dirty.markBulk(layer)`，渲染按层刷新 |

`DirtyTracker = { bits: Uint8Array(16384); list: Int32Array(16384); count; bulk: Record<BulkLayer, boolean> }`：`mark(i)` 若 `bits[i]==0` 则置位并 `list[count++] = i`——一次 1,000 格 Rect 分区即使每格 `setXbld + setXzon` 两次追加也只产生 1,000 项。渲染每帧 `takeChanges()` 取走并清空。`MISC 0x01F0` 的 256 项格计数因此恒与 `xbld` 一致；导出前再做一次全量对账断言。

---

## 4. 序列化：两层 `[决定]`

### 4.1 通用快照 `.sc2kweb`（WP1，T+3 可用）：schema 驱动，不自动遍历

```
magic "SC2KWEBS" | u16 version = 2 | u32 headerLen | header JSON | 连续原始字节
header = { schema: 2, entries: [{ path, kind, len }...] }   // entries 的顺序 = SNAPSHOT_SCHEMA 的声明顺序
```

- `SNAPSHOT_SCHEMA`（`contracts/snapshot.ts`）是一张**静态有序表**：每条 `{ path, kind: 'u8'|'i32'|'scalars'|'strings'|'priv', hash: 'full'|'sc2'|'none' }`。TypedArray 条目直接拷贝字节；**全部顶层标量**（`clock.* economy.* census.* demand.* … view.*`）由 `serializeScalars(state): Int32Array` 按 `SCALAR_FIELDS`（固定路径序）打平，`bonds[]` 固定 50×3、`neighbors[]` 固定 4 条；字符串（`cityName mayorName neighbors[].name`）按固定顺序写入 `strings` 条目（u16 长度 + UTF-8）。
- `priv` 条目：按 `SYSTEM_ORDER` 逐系统编码，每个系统的对象做**规范化遍历**：键名按 UTF-16 码元排序、`undefined` 键视为不存在、TypedArray 作为附加二进制块按遍历序追加、整数以 i32 写入（超出 i32 范围抛错）。对象构造顺序、可选字段是否出现、数组构造路径都不影响字节。
- 读取：按 `path` 回填；缺失条目取 `createCityState()` 默认值；`version` 不同只做"缺失补默认 + priv 交给各系统按 `v` 处理"，不做跨版本迁移（日内不需要）。
- `[v2]` 经 `CompressionStream('gzip')`（≈ 250 KB → 30 KB）。

### 4.2 状态哈希 `hashState(s, scope)`

`hash = fnv1a32(concat(entries.filter(e => inScope(e, scope)).bytes))`——与快照编码共用同一遍历器，**零每模块代码**。

| scope | 包含 | 排除（显式表 `HASH_EXCLUDE`） | 用途 |
|---|---|---|---|
| `'full'` | `layers/maps/counts/xgrp`、全部 `scalars`、`strings`、`priv`、`clock.prngState` | `clock.accumMs`、`clock.speed`、`clock.modalPause`、`view.*`、`rawMisc` | 确定性双跑、Node vs 浏览器、快照往返 |
| `'sc2'` | 以上去掉 `priv`，且去掉"`spec` 声明不入 `.SC2` 的标量"（`economy.ytd/lastYear`、`rewards.mayorApproval` 等见 schema 的 `hash: 'full'` 标注） | 同上 | `.SC2` 往返、原版互通测试 |

测试：`hash(structuredClone(S)) == hash(S)`；把 `priv` 中对象的键打乱重建后哈希不变；`load(save(S))` 哈希不变（两档都断言）。

### 4.3 `.SC2` 互通（WP2 `io/sc2` 纯编解码 + WP1 `sim/core/saveload.ts` 编排 + 各系统 `importFrom/exportTo/postLoad`）

- `readSc2(buf) → ReadResult<Sc2Document>`、`writeSc2(doc) → ArrayBuffer`：**`[v1]` 两者都在 WP2 的第一切片**（e2e 的手工夹具 `.SC2` 由 `writeSc2` 生成，否则"载入手工夹具"是鸡生蛋）。
- `importCity(doc)`：按契约 `IMPORT_ORDER` 调用各系统 `importFrom(ctx, doc, diag)`，再按 `POSTLOAD_ORDER` 调用 `postLoad(ctx, 'sc2')`（§4.5）。`exportCity → writeSc2`：按 `EXPORT_ORDER` 调用 `exportTo(ctx, doc)`，`rawMisc` 透传未知偏移。诊断只记录、不拒绝。
- 零区注册表（`contracts/io.ts` 的 `MISC`，防碰撞）：`0x1054/0x1058` PRNG 标志 / 状态、`0x105C` `saveFormatVersion`、`0x1060` `viewZoom`、`0x10BC–0x12BB` `xtxtShadow`。
- `exportSc2({ compat: true })`：清零 `0x1054–0x10B7` 与 `0x10BC–0x12BB`、不写 PRNG 标志、`XTHG` 只透传原版类型（本就如此）——给想把存档拿回原版的玩家一条退路；默认 `compat = false`。
- 两种格式不漂移：`.SC2` 的内容是 `.sc2kweb` 的真子集（`hash('sc2')` 恰好描述这个子集）；`saves` store 两种记录并存，`kind` 字段区分，**默认 `kind = 'sc2'`**（§9.3）。
- `.SC2` 在 `phaseCursor > 0` 时拒绝导出（规格要求）；快照允许在**挂起态**（`modalPause > 0`）保存并编码 `phaseCursor`，载入后处于同一挂起态等待 `modalClosed()`（§5.6）。

### 4.4 `priv` 与 `.SC2` 往返的测试约束

- `importSc2(exportSc2(S)).priv` 经 `postLoad(ctx,'sc2')` 后，与 `S.priv` 在"规格声明读档归零"的字段（lot 计时器、物件寿命、燃料）之外**相等**；并断言重建后的 `priv` 非空（防止模块只写 `priv` 不写重建逻辑，导入第三方存档时空转）。
- 声明了 `priv` 的系统必须实现 `postLoad()`（`registry.test`）。

### 4.5 两条读档路径的语义差异 `[决定]`

`postLoad(ctx, source)`：
- `source = 'sc2'`：各系统从真源层重建缓存；utilities 跑一次**不消费 PRNG** 的电 / 水重扫（风 / 太阳能用 `state.utilities.power` 的旧值）；services 重算 `cityCenter` 与 `trafficReport`；transport 重算连接与 `stationOf`；zones 由 `XBLD` 推断 `LotState`（计时器归 0）；events 剥离标记、消费侧表、复活物件。
- `source = 'snapshot'`：`XBIT.POWERED/WATERED`、`priv` 已完整，只重建闭包缓存，**不得重扫、不得消费 PRNG**。`determinism.test` 断言快照载入前后 `prng.state()` 相同、载入后继续跑 N 天的哈希与不中断相同。

顺序常量（契约）：`IMPORT_ORDER = ['terrain','core','zones','events','transport','services','utilities','economy','placement']`（对应 `spec:file-formats §3.4.2` 第 2–9b 步：地形拆位与水体修正 → 清洗 → 角标重建 → `XTXT` 标记剥离 / 侧表 / 天气 / 科技 / 灾害 → 网络与 `0xFA` 与车站 → 微模拟绑定 / 年龄队列 / 奖励 → 电厂表 → 经济块与 `XGRP`）；`POSTLOAD_ORDER = ['utilities','services','transport','zones','events','economy','placement','terrain','core']`；`EXPORT_ORDER = ['core','terrain','zones','transport','services','utilities','economy','events']`（events 最后合成 `XTXT` 与写 `XTHG`）。

---

## 5. 模拟调度

### 5.1 tick、月、年

**1 tick = 1 天**；1 月 = 25 天；1 年 = 300 天；`clock.age` 唯一真源，`dateOf(age)` 派生（`spec:economy §2.2`）。`advanceDay()` 顺序执行 `DAY_PHASES[age % 25]`；任一阶段返回 `'suspend'` 则 core 执行 `modalPause++` 并停在 `clock.phaseCursor`，UI 关闭模态后 `host.modalClosed()` 使 `modalPause--`，归零且 `phaseCursor > 0` 时从下一阶段续跑，**不重跑**；当日全部阶段完成（`phaseCursor` 归零）后，core 按 `SYSTEM_ORDER` 调用在 `END_OF_DAY_IO` 中声明了的系统的 `System.endOfDay(ctx)`——utilities 在此 flush `requestRescan` 置的脏标志（电 / 水即时重扫，消费 PRNG），zones 在此逐日推进 lot 计时器（不消费 PRNG）——再 `age++`。挂起的当日不调用 `endOfDay`，`modalClosed()` 续跑完剩余阶段后再调用，每天恰一次；`determinism.test` 把它纳入重放。

### 5.2 主线程、预算切片 `[决定]`

```
host.advance(dtMs, now, budgetMs = 6):                 // app/loop 每帧调用；now 由 app 注入（sim 内禁用 performance）
  if modalPause > 0 || speed == Paused: return
  t0 = now()
  if mode == Disaster:
    disasterAccum += dtMs
    while disasterAccum >= DISASTER_TICK_MS[speed] && now() - t0 < budgetMs:
      disasterAccum -= DISASTER_TICK_MS[speed]; events.disasterTick(); events.thingsTick()
    return
  // 城市模式：物件 tick 与日历并行推进（物件按 DISASTER_TICK_MS 节奏）
  thingsAccum += dtMs; while thingsAccum >= DISASTER_TICK_MS[speed]: thingsAccum -= ...; events.thingsTick()
  if MS_PER_DAY[speed] == 0: pending = maxDaysPerFrame                       // African Swallow
  else: accumMs += dtMs; pending = min(maxDaysPerFrame, floor(accumMs / MS_PER_DAY[speed])); accumMs -= pending * MS_PER_DAY[speed]
  while pending > 0:
    r = advanceDay(); pending--
    if r == 'suspended': return
    if now() - t0 >= budgetMs: break
  if pending > 0 && MS_PER_DAY[speed] > 0: accumMs = min(accumMs + pending * MS_PER_DAY[speed], maxDaysPerFrame * MS_PER_DAY[speed])   // 余量带到下一帧，封顶防螺旋
```

要点：天数序列与状态不依赖切片方式（`accumMs` 不入哈希）；大城市最重生长日 ≈ 3 ms，Swallow 下每帧 2–3 天而不是固定 10 天吃掉 30 ms；灾害 tick 与物件 tick 计入同一预算。`maxDaysPerFrame = 10` 只是硬顶。

### 5.3 阶段表（全仓库唯一真源 = `contracts/clock.ts`；原文 `spec:economy §2.3`）

| day | 阶段（行序 = 执行序） | owner |
|---|---|---|
| 0 | `settleMonth → closeYear¹ → techCheck¹ → nationalAnnual.zones¹ → nationalAnnual.economy¹ → neighborsAnnual¹ → approvalSurvey¹ → facilityAnnual¹ → utilitiesAnnual¹ → budgetWindow¹ → beginMonth` | economy / economy / events / zones / economy / zones / services / services / utilities / economy / zones |
| 1 | `powerScan` | utilities |
| 2 | `dataMaps` | services |
| 3–18 | `growthScan(step, substep)`：core 按 `x = step; x += 4` 外层、`y = substep; y += 4` 内层遍历，每格依 `GROWTH_VISIT_ORDER = ['transport','zones','services']` 调用 `growthVisit` | core |
| 19 | `trafficDecay` | services |
| 20 | `waterScan` | utilities |
| 21 | `census → demand → demographics → graphs` | zones / zones / services / economy |
| 22 | `milestones → scenario → solvency` | services / economy / economy |
| 23 | `uiRefresh`（只发事件） | core |
| 24 | `weatherAndDisaster → cityStatus → news` | events / services / events |
| 日末 | `endOfDay`：utilities（flush 电 / 水重扫，`usesPrng`）→ zones（lot 计时器，无 PRNG），按 `SYSTEM_ORDER`，只调 `END_OF_DAY_IO` 的键 | utilities / zones |

¹ 仅 1 月且 `age > 0`（`techCheck…utilitiesAnnual` 仅 1 月）。`PHASE_IO`（读 / bulk 写 / point 写 / 用 PRNG / 可挂起）随表落在契约；`sim/core/dayPhases.test.ts` 静态断言：同日无两个阶段 bulk 写同一层、每层每月至多一个 bulk 写者、读 `@dN` 的阶段天数 ≥ N、`PHASE_OWNER` 覆盖全部 `PhaseId` 且键集合 == `PHASE_IO` 键集合。缺席 / 桩系统的阶段直接跳过（不消费 PRNG）。

### 5.4 系统注册：顺序由契约决定，与传入顺序无关 `[决定]`

`createSim({ systems, catalogue, snapshot, tuning, stubAllowlist })` 把传入的 `System[]` 按 `SYSTEM_ORDER = ['core','terrain','placement','utilities','transport','zones','services','economy','events']` 排序后注册；同一阶段只有一个 owner（表驱动），同一命令只有一个处理者且必须是 `COMMAND_OWNER[type]`（注册时断言；`registry.test` 另断言每个真系统实现了归自己的全部命令），`queries` 只能填自己的键，`actions` 只能填 `ACTION_OWNER` 归自己的键，`endOfDay` 只对 `END_OF_DAY_IO` 的键生效。`snapshot: SnapshotCodec` 是必填项：`wire.ts` 从 `io/snapshot/index.ts` 注入，`testkit.createTestContext` 与 `hashOf` 走同一入口，`replay(opts, …)` 复用 `opts.snapshot`。`registry.test` 以任意洗牌顺序传入，断言注册结果与哈希一致。`SimHost.catalogue` 与 `SimContext.catalogue` 是**同一个对象**（只在 `createSim` 注入一次）。

### 5.5 命令

- UI 的一切改动都是 `Command`（`CONTRACTS.md` `commands.ts`）；`host.dispatch(cmd)` 只在 `phaseCursor == 0`（两天之间）或挂起期间执行，同步返回 `CommandResult { ok, cost, reason?: RejectReason, changed, modal? }`，并追加 `commandLog[{ age, phaseCursor, seq, cmd }]`。
- 需要玩家二次选择的流程**不在 sim 里保存挂起状态**：桥型 → `network` 命令遇水返回 `{ ok: false, reason: 'needsBridge', modal: { id: 'bridgeType', payload } }`，UI 弹窗后带 `bridge` 重新派发；邻城连接 → 命令成功放置并返回 `modal: { id: 'neighborConnect' }`，UI 派发 `neighborConnection { at, accept }`；体育场选队 → `placeBuilding` 成功并返回 `modal: { id: 'teamPick' }`，UI 派发 `modalAnswer`。
- 阶段挂起型模态（`budget / militaryOffer / scenarioResult / gameOver / newspaper / extraPaper / disasterAlert / rewardOffer`）由阶段 `emit({ type: 'modal', id, payload })` 并返回 `'suspend'`；UI 关闭时先 `dispatch({ type: 'modalAnswer' })`（若有答案）再 `host.modalClosed()`。
- 命令归属表 `COMMAND_OWNER`（`CONTRACTS.md §K`）：core = `setSpeed / setView / terrainDone / modalAnswer`；terrain = `terrainTool`；placement = `placeBuilding / zoneRect / dezone / bulldoze / network / tunnel / neighborConnection`；services = `sign / rename`；economy = `setTax / setIndustryTax / setFunding / setOrdinance / issueBond / repayBond / setOption / cheat`；events = `requestDisaster / dispatch`。owner 缺席、为桩或未实现该命令 → `host.dispatch` 返回 `NOT_IMPLEMENTED_RESULT = { ok:false, cost:0, reason:'notImplemented', changed:[] }`，不写日志、不消费 PRNG；UI 用 `reject.notImplemented` 文案。`modalAnswer` 由 core 按 `MODAL_OWNER[dialog]` 转发到 `systems[owner].onModalAnswer?.(ctx, dialog, answer)`（budget → economy；teamPick → placement；militaryOffer / rewardOffer → services；disasterAlert / newspaper / extraPaper → events），一个命令 type 仍只有一个处理者。`cheat` 的灾害副作用不跨系统调用：economy 只写 `state.disaster.pending`，events 的状态机（与 `requestDisaster`、月随机判定同一入口）在下一 `thingsTick` 启动。

### 5.6 命令日志与重放

`replay(seed, params, commands)`：逐天推进；每进入一个阶段游标前，派发所有 `(age, phaseCursor)` 相同的日志命令；若原始运行在该游标挂起过（日志中出现 `phaseCursor > 0` 的命令），重放驱动在派发后自动 `modalClosed()`。因此预算窗口期间的改动、桥型回答、体育场选队都能复现 PRNG 与账目。快照在挂起态编码 `phaseCursor`，`.SC2` 不允许（§4.3）。

### 5.7 事件

阶段 / 命令把 `SimEvent` push 进 `ctx.events`；`host.drainEvents()` 每帧由 app 取走并经 `EventBus.on(type, fn)` 扇出到 UI / 渲染 / 音效。sim 内没有订阅者。渲染与 UI 需要的 `goto / sound / actor / toolbar / modal / message` 变体已在契约中（§7.3）。

### 5.8 PRNG 与确定性红线

单一 `sim` 流（mulberry32，`spec:economy §2.13`，测试向量固化）；消费者只有阶段 runner、命令处理函数、灾害 / 物件 tick、`System.endOfDay`（当前只有 utilities 在 `END_OF_DAY_IO` 声明 `usesPrng`；zones 的日末计时器不得触碰 `ctx.prng`）。`terrain` 流用新城 `terrainSeed`；`brush` 流 `hash32(prng.state(), age, x, y, stroke)`（只读 `state()`）；`art` 用无状态 `hashNoise`；UI 装饰用 `Math.random`。预览（费用、可放置性、债券利率）不得消费 `sim` 流。`sim/**` 只用整数与 `+ − × ÷ floor trunc round min max`；禁 `Math.random/pow/exp/log/sin/cos/sqrt`（ESLint）；`spec:terrain §3.6` 的 `pow(n,1.15)` 改为 `n*(0.85+0.15*n)`；`float()` 跨引擎一致。

### 5.9 `wire.ts` 与桩的生命周期 `[决定]`

- `wire.ts` 从 WP0 起 import 全部 9 个系统目录的 `index.ts`、`render/index.ts`、`ui/index.ts`、`art/index.ts`、`io/{sc2,snapshot,assets}/index.ts`、`audio/index.ts`、`data/index.ts`（名字见 `CONTRACTS.md §V`），调用 `createSim({ systems, catalogue: CATALOGUE, snapshot: snapshotCodec, stubAllowlist: WIRE_STUB_ALLOWLIST })`。
- 桩系统带 `stub: true`；`createSim` 在 `stubAllowlist` 之外发现桩即抛错。冻结时 `WIRE_STUB_ALLOWLIST` 为 8 个非 core 系统全集，随各 WP 合入逐个收缩；打标 `v1-playable` 时为**空数组**（events 的 `[v1]` 切片在第一波交付），CI 以 `SC2K_STRICT_WIRE=1` 断言没有任何桩残留。这是 `wire.ts` 在日内唯一允许的改动。
- 跨模块修补：优先在对方 WP 的分支上提 patch；若对方不在线，Lead 可在 `src/app/patches/<systemId>.ts` 写**适配层**（包装对方 `create<Id>System()` 返回值，覆盖个别 `queries/commands`，不得改动 `COMMAND_OWNER` 归属），`wire.ts` 不变、对方目录不变；每个 patch 文件头部写明到期删除条件。

---

## 6. 渲染

### 6.1 选型：PixiJS v8 `[决定]`，深度带，不分块缓存

可见地块数（1920×1080 逻辑像素）：XS / S 全图 16,384；M ≈ 8,100；L ≈ 2,025；XL ≈ 506。全图静态精灵估算 ≈ 3.4 万、峰值 4 万。

| 方案 | 代价 | 结论 |
|---|---|---|
| Canvas2D 直绘 | M 档半图 ≈ 2 万次 `drawImage` ≈ 20–60 ms/帧 | 否（只用于 Map 窗口 `ImageData` 与 `CpuCompositor` 的输出显示） |
| Pixi + 64 块 `cacheAsTexture` | M 档 ≈ 52 MB、L 档 ≈ 210 MB RT；同 `(cx+cy)` 的相邻块按块序绘制时，后画块里的 3×3/4×4 建筑会盖住前一块中位于其左下墙前方的 1×1 高物 | 否（几何上必然出错） |
| **Pixi 深度带 RenderGroup（本文）** | 16 个 `Container({ isRenderGroup: true })`，静态时指令集不重建；GPU 画 4 万四边形 ≈ 1 ms；每带 ≤ 3 个批 → 全帧 ≤ 48 次 draw call | 采用；退路见 §12 R1 |

### 6.2 场景编译器（纯函数，渲染的真源）`[v1]`

```
compileTile(snap, i, out):                       // 每格 ≤ 5 项；全图 ≈ 3.5 万项
  (x,y) = tileXY(i); (rx,ry) = rotateTile(x,y,rot); depth = rx+ry; base = alt[i]
  emit Terrain  { key: underground ? terrainUnderground(slopeRot) : terrain(slopeRot, altBand, variant = hashNoise(x,y)&3), h: base }
  if rx == 127 || ry == 127: emit EdgeWall { key: { kind:'overlay', id: side=='L' ? OverlayId.EdgeWallL : OverlayId.EdgeWallR, variant: base } }
  if !underground && isWater(i): emit Water { key: water(shapeRot, depthBand), h: 按 §6.3 }
  if underground: emit Ground { key: xund(rotateXund(code), wateredVariant) }; 建筑格 (xbld ≥ 0x70 && xbit & Piped) 画短管桩 { kind:'xund', id: XUND_PIPE_STUB, variant: watered }; return
  if show.zones && zone(i) && xbld < 0x70: emit ZoneTint { key: { kind:'overlay', id: zoneOverlayId(zone) } }
  id = xbld[i]
  if 0x01 <= id < 0x70 || (id >= 0x70 && FOOTPRINT[id] == 1 && show.buildings): emit Ground { key: xbld(rotateXbld(id, rot)), flip: drawFlip(xbit, id, rot) }
  else if id >= 0x70 && FOOTPRINT[id] > 1 && show.buildings && renderAnchor(anchorOf(layers, i), FOOTPRINT[id], rot) == i:
       emit Structure { key: xbld(id), depth, flip }      // 锚点 = 该格菱形底顶点 c11'
  if id >= 0x70 && (xbit & Powerable) && !(xbit & Powered): emit Overlay { key: { kind:'overlay', id: OverlayId.NoPower }, anim 'blink' }
  if road/highway/causeway && xtrf[half] >= lightLevel: emit Overlay { key: { kind:'overlay', id: xtrf >= heavy ? OverlayId.TrafficHeavy : OverlayId.TrafficLight }, anim 'traffic' }
  if marker[i]: emit Marker { key: { kind:'overlay', id: markerOverlayId(marker[i]), frame }, anim fire|flood|toxic|riot }     // [v1] 必须真实现
  if show.signs && xtxt ∈ 0x01..0x32 ∪ {0xFA}: emit Overlay { key: { kind:'overlay', id: xtxt == 0xFA ? OverlayId.Connection : OverlayId.Sign } } 并登记 DOM 标签
  // 所有项的 x/y = 该项锚格在基准海拔处的底顶点 c11'（§6.3）；多格建筑的锚格 = renderAnchor(...)
```

- `zKey = depth * 4096 + rx * 16 + layer`（`SceneLayer`：Terrain 0 < EdgeWall 1 < Water 2 < ZoneTint 3 < Ground 4 < Structure 5 < Overlay 6 < Marker 7 < Actor 8 < Preview 9）。`depth ≤ 254`、`rx ≤ 127`、`layer ≤ 15` → `zKey < 2^21`。
- **多格建筑的深度键取旋转后 `rx+ry` 最大的占地格**（`renderAnchor` 四旋转表：rot0 `(x0+s−1, y0+s−1)`、rot1 `(x0, y0+s−1)`、rot2 `(x0, y0)`、rot3 `(x0+s−1, y0)`），不是 TL 格；只在该格触发绘制。
- 地块编译只读本格（+ `anchorOf` 探测），脏更新按格局部重算；邻居相关形状（浅水、路网片段）由模拟层维护在层里。
- `compileAll` 输出的 `SceneItem[]` 同时喂 Pixi 后端、`CpuCompositor`、`thumbnail()`。

### 6.3 投影、海拔、旋转、拾取（`spec:ui-art §3.1/§3.3`）

- `ZOOM_TABLE`（契约）：XS 8×4/3、S 16×8/6、M 32×16/12、L 64×32/24、XL 128×64/48。`S = tileW/2`；`(ox, oy) = mapOrigin(zoom) = (128·S, MAX_ALT·LEVEL)`（契约 `render.ts`）：旋转后 (0,0)@31 级的顶点落在 `y = 0`，旋转后 (0,127) 的左顶点落在 `x = 0`，地图像素画布 = `128·tileW × (MAX_ALT·LEVEL + 128·tileH)`。
- 像素锚点约定 `[决定]`：`SceneCompiler.worldToScreen(x,y,h)` 返回旋转后地块的**顶点 c00'** `= [ox + (rx − ry)·S, oy + (rx + ry)·S/2 − h·LEVEL]`；`SceneItem.x/y` = 该项锚格在基准海拔处的**底顶点 c11'** `= worldToScreen + [0, tileH]`，位图的 `(anchorX, anchorY)` 贴到此点（procedural 锚点 `(W/2, H)`，DAT 锚点 `(w/2, h−1)` 由 provider 自行给出）；`RendererApi.screenOf` = 地图像素 + 相机偏移（`worldRoot` 整数位置），`pick` 先减同一偏移。`CpuCompositor.render(items, …, rect)` 的 `rect` 与 DOM 标牌、`thumbnail` 都在这一地图像素系里。
- **数据永不旋转**：`rotateTile(x,y) = (y, 127−x)`；坡面 `SLOPE_ROT_CCW`、溪流 `XTER_STREAM_ROT_CCW`、网络环 / 隧道口 / 交叉件 / 高速 / 地铁↔铁路 / `0xC6↔0xC7` 的 `rotateXbld`、`rotateXund`、匝道的朝向元组反查、`drawFlip = ((xbit & Flipped) != 0) XOR (rotation & 1)`——**全部只存在于 `contracts/rotation.ts`**，terrain 模块 re-export，渲染 / 拾取 / 路网 / 预览一律 import。
- 水面高度：水下 `0x1X` 画在 `h = waterLevel`；岸边 / 浅水 / 溪流 / 瀑布画在 `alt`（常量 `WATER_SURFACE_AT_LEVEL` 可切）。
- 拾取：从 31 级向 0 级逆投影 + 四边形点内测试，只按地面；`pick` 是 `SceneCompiler` 的纯函数，Pixi 不做命中测试。`picking.test` 的往返用例以**地块中心** `worldToScreen(t) + [0, tileH/2]` 为输入断言 `pick == t`（顶点与共享边上的点不作断言）。
- 边缘岩壁：旋转后 `rx == 127 || ry == 127`。

### 6.4 像素验收与 `CpuCompositor` `[v1]`

`CpuCompositor.render(items, provider, scale, rect) → IndexedBitmap`：按 `zKey` 排序后以"索引 0 透明"blit；`toRgba(palette)`；`encodePng()` 在 Node 与浏览器都可用。用途：(a) vitest 像素快照——`spec:ui-art §3.3` 旋转用例（`(10,10) XTER=0x01` 与 `(12,10)` 道路 `0x1F` 旋转 0/1/2 次抬高边在右上 / 左上 / 左下）、`§2.9.3 (a)(b)(c)` 翻转用例、多格锚点用例、边缘岩壁、相邻平地无 1 px 缝；(b) `saves.thumbnail`（XS 全图 → 盒式降采样到 256×128 → PNG `Blob`）；(c) 新城首帧占位与 WP0 的调试渲染器（`stubRenderer` 把它画到 `<canvas>`）。像素验收**不依赖 Playwright / WebGL**。

### 6.5 深度带与绘制顺序 `[v1]`

- `d = rx + ry ∈ [0,254]`，带 `b = d >> 4`（16 条）。每条带一个 `Container({ isRenderGroup: true })`，子精灵按 `zKey` **二分插入**（不用 `sortableChildren`）。带之间严格前后有序，画家序与原版逐行绘制一致。
- 每帧只做 16 次区间判断设 `visible`（带的屏幕 y 范围已知：`[16b, 16b+15]·S/2` 减去最大海拔偏移与最大精灵高度）；水平方向交给 GPU。
- 多格建筑精灵挂在其渲染锚格所在带，向上伸出不裁剪。
- 分层根节点：`groundRoot(16 bands)` → `undergroundRoot(16 bands，首次切换懒构建)` → `heatOverlay`（16384 个带 `tint` 的菱形，单 RenderGroup，默认不可见）→ `previewLayer` → `airLayer`（飞机 / 直升机 / 龙卷风顶部）→ DOM 标牌层。地面物件（船 / 列车 / 怪兽 / 调度单位 / 爆炸）插进带里按深度遮挡：每帧只改 `x/y`，深度键跨过邻居时才重排。
- 相机平移 = 改根容器整数位置，**不触发任何重分配**；只有可见格集合变化（缩放 / 旋转 / 显示开关 / 换档）才重编译。

### 6.6 脏更新、旋转、缩放、显示开关

| 变化 | 做法 | 成本 |
|---|---|---|
| 单格 / 少量格 | 消费 `dirty.list`：重编译该格与其锚格，diff 旧项（每格持有 `SpriteHandle[]`），复用精灵改 `texture/x/y/zKey`，必要时带内移动 | 每格 ≈ 5 µs；1,000 格 Rect ≈ 5 ms + ≤ 16 带重建 |
| `bulk.xbit / maps / xtxt / xthg` | 只扫受影响项：断电图标遍历建筑格；通水变体遍历地下项；热力改 `tint`；标牌重登记 | < 1 ms |
| 旋转 / 缩放到原生档 | 全量重编译 3.5 万项 + 重分带 | ≈ 35–50 ms，一次掉帧（原版亦瞬切）；可按带分 2 帧提交 |
| 缩放到派生档（DAT 的 L/XL、procedural 的 XL） | **不重建**：`worldRoot.scale = k ∈ {2,4}`，最近邻采样，与逐精灵整数放大逐像素相同 | 0 |
| 地下切换 / 显示开关 | `visible` 切换；Zones/Signs/Buildings 开关需重编译受影响项 | ≤ 15 ms |
| 相机平移 | 根容器位置 | 0 |

### 6.7 纹理管线：索引色 → 图集页 → 稳定句柄 `[v1 静态页] [v2 animPage]`

```
SpriteProvider (dat? | procedural) ──bitmap(key, scale)──▶ IndexedBitmap(8bit 索引, anchor, cycling, opaque?)
   └─ resolve 回退序：DAT 原生(XS/S/M) → DAT 整数放大 → procedural 原生(S/M/L) → procedural 派生 → 洋红占位
AtlasManager
   ├─ staticPages: 2048² RGBA（当前调色板 LUT 烘焙），按 scale 分组，首次可见时打包上传，不可变；≤ 6 页驻留
   ├─ animPage [v2]: 1024² RGBA（4 MB）按 256² 子页管理；容纳所有"地块绑定动画"的当前帧（水面 21 形 × 深度档、瀑布、车流 2 档、火 / 洪 / 毒云 / 暴民、断电闪电、循环色灯光）；
   │                 每个动画 tick 把目标帧 blit 进 CPU 侧缓冲，只对脏子页 `source.update()`（≤ 8 次/s，每次 ≤ 1 MB）
   ├─ Texture 句柄对 (key, scale) 稳定：精灵永不换 texture；换帧 = 改页内容；精灵树零增删
   └─ 调色板循环 [v2]：procedural 走 Palette.cycles；DAT 走 FAST_GROUPS/SLOW_PAIRS（spec:file-formats §2.7）；含循环索引的 DAT 建筑最多登记 64 张，超出按静态显示并记诊断
```

真实精灵只有一个接入点：`renderer.setProvider(primary, fallback)` 后释放页、清句柄缓存、触发全量重建（≈ 50 ms）；渲染器不知道文件格式。DAT 导入后 procedural 回退项取 M 再 ×2/×4（`mixedDensity = false`），同屏像素密度一致。

### 6.8 动画时钟 `[v2]`

独立于模拟速度的 `AnimationClock`：fps 组 2/3/4/6/8/10 各自相位（同类同步）；调色板 `fastTick = 125 ms`、慢速每 8 个快 tick；暂停时水面与灯光继续、车流与物件停止；XS/S 档关闭循环与高光。Auto-Goto / Centering 为 400 ms ease-out 平移；缩放旋转无过渡。`[v1]` 无动画（水面静帧，断电图标 1 fps 闪烁用 `visible` 切换）。

### 6.9 Pixi 初始化、拾取、标牌、性能门禁（WP11 `[v1]` 验收）

- `await app.init({ preference: 'webgl', antialias: false, resolution: 1, roundPixels: true, backgroundAlpha: 1, powerPreference: 'high-performance' })`；所有 `TextureSource.scaleMode = 'nearest'`。
- `stage.eventMode = 'none'`（不让 Pixi 对万级精灵做命中测试；拾取走 `SceneCompiler.pick`）。
- HiDPI：整数 `backingScale = max(1, floor(devicePixelRatio))` 作舞台缩放并把 canvas 背板放大同倍，不用小数 `resolution`。
- 标牌文字 = 绝对定位 DOM 元素，相机变化时按 `worldToScreen` 批量重排（≤ 50 + 连接牌）。
- `RendererApi.stats() → { sprites, drawCalls, bandRebuilds, frameMs, vramBytes }`：smoke 脚本门禁——静态场景 draw call ≤ 48、全量重建 ≤ 60 ms（开发机）、`vramBytes ≤ 128 MB`。
- `RendererApi.minimap(mode, out)`：Map 窗口按图层 LUT 直接写 `ImageData`（2D canvas），不走 Pixi。

### 6.10 v1 / v2 切片

| 项 | `[v1]` WP10 + WP11 | `[v2]` |
|---|---|---|
| 场景 | `SceneCompiler` 全部项类型——**`Marker` 项必须真实现**（`markers[i]` → `markerOverlayId`），地下分支（土色地表 + `xund` + 短管桩 `XUND_PIPE_STUB`）、`zKey`、`renderAnchor`、`pick`（地块中心往返）、`mapOrigin`、`CpuCompositor`、PNG；Actor 不经编译器，走 `setActors` | 热力叠加项、`Actor` 项从 `things()` 直接编译 |
| 后端 | 16 条深度带 + 二分插入、静态图集 + 调色板 LUT 烘焙（procedural 与 `PAL_MSTR` 同一路径）、脏更新、预览层、断电图标 `visible` 闪烁、S/M/L 三档、DOM 标牌、`stats()`、`minimap()`、**`undergroundRoot`**（与 `groundRoot` 共用带 / 图集 / 脏更新；`ViewState.underground` 切 `visible`）、**`setProvider` 热切换**（释放页 + 清句柄 + 复用换档的全量重建）、**最简 `setActors`**（静帧、无插值：地面角色按 `depth` 插带，空中角色进 `airLayer`） | `heatOverlay`、`animPage` 动画与色循环、`AnimationClock`、角色插值与事件驱动生命周期、XS/XL 派生档、`goto` 平滑 |
| 退路 | — | XS/S 全图可见档若 RenderGroup 静态成本超预算，改为每带一张 RenderTexture（小图，伪影不可见） |

---

## 7. UI 与应用壳

### 7.1 选型 `[决定]`

原生 DOM + CSS 变量复刻斜面窗口；≈ 60 行 `h()` 构建器 + `Store<T>`（`get/set/subscribe`，批量通知）；无框架（Playwright 选择器稳定、与 canvas 完全分离——WP11 与 WP12 不可能冲突）。

### 7.2 窗口系统与输入

`WindowManager`（非模态浮动窗：拖动、z 序、同类单例、位置记 `localStorage`）+ `ModalHost`（栈；打开时若是阶段挂起型模态不再额外计数——core 已 `modalPause++`；命令结果型模态由 `ModalHost` 调 `host.modalOpened()/modalClosed()`）。`ToolController` 状态机十模式（Click / Paint / Line / Rect / Place / Dispatch / Query / Sign / Center / Help，`spec:ui-art §2.8`）；统一 PointerEvent 多指追踪、`touch-action: none`；`[v1]` 收入 `spec:ui-art §3.11` 的最小手势子集：Click / Place / Query 工具下单指拖动 = 平移，双指平移，捏合累计比例跨 1.5 进一档 / 0.67 退一档（10% 滞回）并在松手后吸附整数档，长按 500 ms = Query（任何工具下），双击放大一档并居中；`[v2]` 双指旋转、三指切地下、窄屏布局。选中 `water.pipes`（`ToolDef.undergroundView`）时自动 `ViewState.underground = true`，切换到其他工具时退出。键盘按 `§2.8`（`Ctrl+S` `preventDefault`；`Esc` 语义栈）。

### 7.3 消息流

```
DOM 事件 → ToolController / Menus ──Command──▶ SimHost.dispatch ──CommandResult──▶ 状态区（cost / RejectReason 文案）/ ModalHost（result.modal）
                 ▲                                   │ advance(dt, now, 6) 每帧
            UiStore ◀── EventBus.on(type) ◀── host.drainEvents()   ── goto → renderer.goto；sound → AudioSink；actor → renderer.setActors；toolbar → 刷新可用性；modal → ModalHost
                 │ ViewState                          │ DirtyTracker
                 ▼                                    ▼
            Windows / Toolbar / StatusBar      RendererApi.frame(dt) ← RenderSource.takeChanges()
```

UI 从不读 `MISC`、不写图层；拖动预览调用 `q.placement.preview(cmd)`（纯函数、不消费 PRNG、不写状态）；禁用原因文案由 `RejectReason → strings` 表映射，UI 不自行判断。

### 7.4 窗口清单

`[v1]` NewCity、Budget（简版：税率 + 11 滑块 + 现金流 + 自动预算 + "法令""债券"两个明细按钮）、**Ordinances**（20 个复选框按 5 组排列，勾选派发 `setOrdinance`；YTD / 年末估计列 v2）、**Bonds**（列表 + 当前数 / 平均利率 / 下一张利率 / 评级 + 发行 / 偿还按钮；`q.economy.bondView()` 纯函数）、Map（Structures / Zones / Power / Water / 四张 64² 热力，2D canvas `ImageData`）、**Graphs**（`spec:ui-art §2.5`：16 条序列复选框 + 颜色图例、`1 yr / 10 yr / 100 yr` 三选一、2D canvas 折线 12 / 20 / 20 点，直接读 `state.xgrp`，无 sim 侧改动）、**Neighbors**（只读：中央本城 + 四角邻城的名 / 人口 + 各边连接数）、**Newspaper**（报头 / 日期 / 头条 / 2 条正文 / 天气栏，数据 `q.news.currentPaper()`；`newspaper`（4 月 / 8 月订阅版）与 `extraPaper`（号外）两个模态复用同一组件）、Query（`anchorOf` 找整栋，字段来自 `q.services.queryStats(i)`、`q.utilities.plantAt(i)`、`q.transport.stationAt(i)` 与图层离散化）、Save/Load（IndexedDB `saves` + 文件下载 / 打开）、Game Over、**DisasterAlert** 模态与 **Disasters 菜单**（`DISASTER_MENU` 8 项 + No Disasters，v1 未实现项灰掉）、**Import Assets 最小入口**（Title 页 / File 菜单的文件输入，WP14 `createAssetImporter(...).mount(el)` 经 `ShellOptions.importer` 挂入）。`[v2]` Population、Industries、Ordinances 的 YTD / 估计列、Newspaper 全版面与多份报纸、Scenario ×3（Picker / Briefing / Goals / Result）、Import Assets 完整面板（目录授权 / 拖放）。

### 7.5 音效 `[决定]`

`src/audio/`（WP12）实现契约 `AudioSink`：`[v1]` 静默实现 + 事件映射表（`SimEvent 'sound'` 与 UI 动作 → `SoundId`），`setOption.sound/music` 命令已连通；`[v2]` WebAudio **原创合成**（短促合成音、警笛循环、简单序列音乐），不含任何原版音频。

### 7.6 v1 工具白名单 `[决定]`

`BuildingDef/ToolDef` 不含交付排期字段。`src/app/v1Tools.ts` 导出 `V1_TOOL_IDS: ReadonlySet<ToolId>`，**完整显式集合如下（无省略号）**——sim 侧全部是通用 `placeBuilding / zoneRect / network` + catalogue，零增量；科技 / 法令 / 奖励门控交给 `availability`（工具 id 为 `spec:building-catalogue §2.11`）：

| 组 | v1 工具 id |
|---|---|
| Bulldozer（推土五子） | `bulldozer.demolish` `bulldozer.level` `bulldozer.raise` `bulldozer.lower` `bulldozer.dezone` |
| Nature | `nature.trees` `nature.water` |
| Dispatch | `dispatch.police` `dispatch.fire` |
| Power（全部 10 种电厂） | `power.wires` `power.coal` `power.hydro` `power.oil` `power.gas` `power.nuclear` `power.wind` `power.solar` `power.microwave` `power.fusion` |
| Water | `water.pipes` `water.pump` `water.tower` `water.treatment` `water.desalination` |
| Rewards | `rewards.mayorsHouse` `rewards.cityHall` `rewards.statue` `rewards.greatDome` |
| Roads | `roads.road` `roads.busDepot` |
| Rail | `rail.rail` `rail.depot` |
| Zones（六分区） | `zone.rLight` `zone.rDense` `zone.cLight` `zone.cDense` `zone.iLight` `zone.iDense` |
| Education | `education.school` `education.college` `education.library` `education.museum` |
| Services | `services.police` `services.fire` `services.hospital` `services.prison` |
| Parks | `parks.small` `parks.big` `parks.zoo` `parks.stadium` `parks.marina` |
| Other | `signs.place` `query` `center` |

共 54 个。`[v2]` 仅余：`roads.highway` `roads.tunnel` `roads.onramp`、`rail.subway` `rail.subStation` `rail.subToRail`、`ports.seaport` `ports.airport`、`rewards.arcoPioneer / arcoCanopy / arcoDusk / arcoSkyward`、`dispatch.military`（需军事基地）。工具栏对不在集合中的工具隐藏；`PlacementQuery.availability(toolId)` 对未实现工具返回 `{ enabled: false, reason: 'notImplemented' }`；`e2e/smoke.spec` 的"Query 有数据"用例对火车站（`rail.depot`）与医院（`services.hospital`）各查一次。v2 删除白名单（或置为全集）。

---

## 8. 美术

### 8.1 接口与管线

`SpriteProvider { name, palette, nativeScales, has, bitmap, frameCount, fps }`（`contracts/render.ts`）；两种来源都产出 `IndexedBitmap { w, h, data, anchorX, anchorY, cycling, opaque? }`（DAT 的索引 0 是合法黑色，用 `opaque` 掩码；procedural 以 0 为透明）。

### 8.2 生成器分层（WP9）

`raster.ts` 原语（`fillPoly / strokePoly / fillDiamond / ditherFill / isoLine / blit / hashNoise`）→ `isoBox` 三面盒体（光源左上，顶面 `i0+2`、左面 `i0`、右面 `i0−2`）→ 配方（`spec:ui-art §3.7–§3.9`）。`buildPalette()` 生成 16 色带 × 8 阶 + 保留区 + 三个循环组，不是数据文件。

### 8.3 多样性保证 `[决定]`

`genBuilding(id)` = `skeleton(zone, level)` × `tier ramp` × `jitter(seed = id)`：

- 骨架按 (zone, level) 共 12 种；tier 决定 ramp（R：Brick / WarmGray / Neutral；C：WarmGray / Glass / Neutral；I：Rust / WarmGray / Teal）与附属物集合；`seed = id` 驱动高度 ±10%、窗格亮灭、附属物落点、屋顶分支。
- vitest 断言：同 (zone, level) 的候选 ID 两两之间 **(ramp, silhouette) 组合互不相同**；tier 0/1/2 的 ramp 明度阶 `i0` **单调递增**；组间平均亮度差 ≥ 阈值。不再用"位图哈希不同"（哈希不同不排除肉眼近乎相同）。
- `[v1]` 参数化骨架覆盖全部 0x70–0xC5 与公共建筑"类别盒体"；`[v2]` 按 `§3.8` 逐 ID 配方精修（同签名替换内部）。

### 8.4 首帧与 Worker

`art/worker.ts` 在 Worker 中生成地形 / 水 / 路网 / 树 ≈ 200 张并 `transfer` `Uint8Array`，首帧 < 150 ms；建筑首次可见时懒生成。`art:sheet` 拼 contact sheet 到 `docs/art-preview/`（gitignore）。

---

## 9. 文件格式与本地导入

### 9.1 解析器接口（`spec:file-formats §3`）

`ByteReader/Writer`（显式 `u16be/u16le…`）、`readSc2 / writeSc2`、`parseSpriteArchive / decodeSprite`（`duplicatePolicy` 默认 `'first'`）、`readPaletteBmp / cycledIndex`、`readNewsData`、`identify(file, head64)`；错误码表原样采用。

### 9.2 导入编排

`sim/core/saveload.ts`（WP1）持有 `importCity / exportCity`，按 `IMPORT_ORDER / POSTLOAD_ORDER / EXPORT_ORDER` 调用各系统 `SaveHooks`；诊断只记录、不拒绝。

### 9.3 浏览器导入与 `saves`（WP14：`[v1]` 最小导入链在第一波；`saves` store 本身 `[v1]` 由 WP12 用最小实现承担，WP14 合入后由其 `AssetStore` 接管）

`[v1]`：Title 页 / File 菜单的 `<input type="file" multiple>`（经 `ShellOptions.importer`）→ `identify` → Worker 解码 `LARGE / SMALLMED / SPECIAL.DAT` + `PAL_MSTR.BMP` → IndexedDB `sc2k-assets`（`files / decoded / saves / meta`）→ `DatSpriteProvider`（静态、无色循环、`nativeScales = {XS,S,M}`、锚点 `(w/2, h−1)`、`opaque` 掩码）→ `renderer.setProvider(dat, procedural)`（WP11 `[v1]`）。这是项目铁律里"导入自己的文件得到真实画面"的 v1 路径。`[v2]`：目录授权（`handles`）/ 拖放 / 自带完整面板 / 色循环 / `SPECIAL` 覆盖 `SMALLMED` / 文本库。`saves` 记录 `{ kind: 'sc2' | 'sc2kweb', name, bytes, thumbnail: Blob | null, savedAt, cityName, year, population }`，默认 `kind = 'sc2'`；自动存档（每游戏年）写 `.sc2kweb`（无损），玩家"保存"默认 `.SC2`（可选"同时保存无损副本"）。`thumbnail` 由 `RendererApi.thumbnail()` 产出（§6.4）。

### 9.4 隐私红线

字节流只在页面内存、Worker、IndexedDB；`io/assets/import` 目录 ESLint 禁 import 网络模块；诊断只含 `id/w/h/size/sha256`；提供一键清除。

---

## 10. 测试策略

### 10.1 分层

| 层 | 内容 | 门禁 |
|---|---|---|
| 单元（各 WP） | PRNG 测试向量；`tileIndex` 反转置；坡面置换 = 角点重命名；RLE 往返属性测试；精灵解码手工夹具；`DAY_PHASES/PHASE_IO/PHASE_OWNER` 不变量；`splitMonthly`；电 / 水 BFS T1–T9；24 偏移可达；模式转移表逐行；需求 / 人口学公式；`FOOTPRINT` 集合；`canPlace` 全部拒绝原因 | 每次 push：根 `pnpm test` |
| 契约一致 | `phases ⊆ PHASE_OWNER[id]`、`actions ⊆ ACTION_OWNER[id]`、`commands` 键集合 == `COMMAND_OWNER` 归该系统的集合（真系统缺一即失败；`COMMAND_OWNER` 覆盖全部 `Command['type']`、`MODAL_OWNER` 覆盖全部 `ModalId`）、`endOfDay` 只在 `END_OF_DAY_IO` 的键上出现、`queries` 只填自己的键、`PHASE_OWNER` 覆盖全部 `PhaseId`、造价表 vs `spec:economy §2.9` 快照、`ORDINANCES[].demand` vs zones 乘数、`SYSTEM_ORDER` 排序与传入无关、声明 `priv` 者必有 `postLoad`、`PRIV_BUDGET_BYTES`、各目录 `index.ts` `satisfies` `entrypoints.ts` | `sim/core/registry.test.ts` + `app/wire.test.ts`，WP0 起即有效（对桩也跑） |
| 确定性 | 同 seed + 同命令日志两次 `hash('full')` 逐年相同；Node 与 Playwright 浏览器各跑 5 年哈希一致；快照 `load(save(S))` 两档哈希不变；`hash(structuredClone(S)) == hash(S)`；打乱 `priv` 键序哈希不变；快照载入不改 `prng.state()` | `sim/core/determinism.test.ts`、`io/snapshot/snapshot.test.ts`、`e2e/hash.spec.ts` |
| 存档往返 | `.SC2`：新城 / 3 年 / 灾害中 `hash('sc2')` 往返相同；`priv` 重建后非空且与规格归零字段之外相等；`compat` 导出零区全零 | `io/sc2/roundtrip.test.ts`、`sim/core/saveload.test.ts` |
| 无头长跑 | §10.4 | `sim/core/longrun.test.ts`、`tools/headless.ts` |
| 像素 | `CpuCompositor` 快照（§6.4 五个用例）；程序化精灵 (ramp, silhouette) 组合断言 | `render/cpu/*.test.ts`、`art/**/*.test.ts` |
| 浏览器冒烟 | Playwright：标题页 → 新城 → 煤电 / 电线 / 分区 / 道路 / 火车站 / 医院 → Cheetah 24 个月 → Query 火车站与医院各一次有数据 → Disasters → Fire → 等待 `disasterEnded` → 截图；断言 canvas 非单色、资金变化、无 console error、`renderer.stats()` 门禁；载入 `writeSc2` 生成的夹具；经 `window.__sc2k` 读 `host / renderer` | `e2e/smoke.spec.ts`（对桩应用也能跑） |
| 合并列车 | 并集分支上跑以上全部 | T+4 / T+7 / T+10 |

### 10.2 契约一致测试细则

见上表"契约一致"行；全部放 `sim/core/registry.test.ts`（WP1 维护，WP0 先写骨架），对桩即可运行。

### 10.3 桩矩阵 `[决定]`

testkit 提供三套 `Queries/Actions` 桩：
- `optimistic`：`hasPower → true`、`hasAccess → true`、`runTrip → ok`、`invented → true`、`landValue → 128`、天气恒 Clear——让"只有 zones + core"的城市也能长房子（T+4 玩法冒烟的前提）。
- `pessimistic`：`hasPower → false`、`hasAccess → false`、`runTrip → fail`、`invented → false`、`canAfford → false`、`landValue → 0`。
- `realistic`（app 的 `nullSystem` 默认）：`invented(key) = year >= TECH_BASE_YEAR[key] + 10`；`hasAccess` 按 `ACCESS_OFFSETS` 检查 `ROAD_SET`；`hasPower` 查 `XBIT.POWERED` 自身或 4 邻；`runTrip` = `hasAccess`；天气恒 Clear；`pieceFor` 由 `pieceIndexFor(mask)` 的简单选形。

每个 WP 的验收测试在 `optimistic` 与 `pessimistic` 两套桩下**各跑一次**（`describe.each`），证明模块确实依赖查询结果（例如 zones 在悲观桩下 24 个月无施工）。`golden-mini-city` 含"无电则不长"的反例段。确定性 / 哈希基线只在合并列车 #2 之后建立（桩与真模块 PRNG 消费量不同）。

### 10.4 无头长跑不变量（`longrun.test`，每年末检查）

不抛错、无 NaN；`XZON` 角标与 `XBLD` 占地一致（`anchorOf` 对全部建筑格非 −1 且占地内 ID 相同）；`Σ XVAL == MISC 0x0028`、`Σ XCRM == MISC 0x002C`；`XBIT & 0x08 == 0`；`XTXT` 无悬空指针（`0x3D..0xC8` 指向 `tileId != 0` 的记录、`0xC9..0xEF` 指向存在的物件）；电 / 水利用率 ∈ [0,100]；`counts.tile` 与 `xbld` 全量重数一致；第 20 年 `normalPop ∈ [3,000, 60,000]`、无单月 > 50% 跳变、`funds > −10^6`；空城 100 年人口恒 0。`tools/headless.ts` 输出 `{ year, hash, pop, funds, phaseMsP95: Record<PhaseId, number>, growthDayMsP95, runTrips }[]`，只记录不断言精确值。

### 10.5 性能记录

`headless` 的 p95 与 smoke 的 `renderer.stats()` 一起写入 CI artifact（JSON），合并列车 #3 对照 §11 预算人工审阅。

### 10.6 e2e 降级

若 WP0 无法安装 Chromium：`e2e` 标记 best-effort，`smoke` 的"玩法"部分由 `tools/headless.ts --script golden-mini-city --thumbnail` 替代（CpuCompositor 出图 + 断言非单色），`hash.spec` 的浏览器侧改由 `vite build` 后在 Node 以 jsdom 加载 bundle 运行 `hash('full')` 比对。

### 10.7 文案黑名单

全部玩家可见文案集中在 `src/data/strings.zh.ts`（默认）与 `strings.en.ts`；`tools/strings-scan.ts` 用关键词黑名单（原版店名 / 报名 / Arco 名 / 建筑 `refName` 列）扫描 `src/**`（除 `docs/spec`），命中即 CI 失败；`BuildingDef.refName` 只存在于生成文件注释，不得进入 `name/UI/XLAB` 默认名。

---

## 11. 性能与资源预算（128×128）

| 项 | 预算 | 依据 |
|---|---|---|
| `powerScan + waterScan` | 0.3–1 ms/月 | 两遍 BFS ≤ 16,384 格，预分配队列 |
| `dataMaps` | 1–2 ms/月 | ≈ 10 遍 16,384 + 3×4,096 + 2×1,024 |
| `growthScan` | 典型 3–8 ms/月，最坏 ≈ 40 ms/月；单日 ≤ 3 ms | 30% 划区 ≈ 5,000 次 `runTrip` × ≤ 100 步 |
| 每月合计 | 典型 6–15 ms，最坏 ≈ 50 ms | 100 年无头 ≈ 10–20 s；CI 2×50 年 < 60 s |
| 帧内 sim 预算 | 6 ms（可调），硬顶 10 天/帧 | §5.2 |
| 静态精灵 | 全图 ≈ 3.4 万，峰值 4 万；draw call ≤ 48 | §6.5 |
| 全量重建 | ≤ 60 ms（开发机），可分 2 帧 | §6.6 |
| 单格脏更新 | ≈ 5 µs；1,000 格 ≤ 5 ms | §6.6 |
| 图集 | 静态页 ≤ 6 × 16 MB 驻留（典型 2–3 页）；`animPage` 4 MB，每次子页上传 ≤ 1 MB、≤ 8 次/s | §6.7 |
| VRAM 上限 | 128 MB（`stats().vramBytes` 门禁） | |
| 首帧 | < 150 ms（Worker 生成 ≈ 200 张） | §8.4 |
| 内存 | 真源 ≈ 200 KB；`priv` 总预算 ≤ 512 KB（`PRIV_BUDGET_BYTES` 之和）；快照 ≈ 300 KB；索引位图缓存 ≤ 24 MB | §3.3 |
| 动态 | 动态精灵 ≤ 600、角色 ≤ 39、DOM 标牌 ≤ 50 + 连接牌 | |

---

## 12. 风险、取舍与评审担忧的化解

### 12.1 风险表

| # | 风险 / 取舍 | 应对 |
|---|---|---|
| R1 | Pixi RenderGroup "静态零成本"是假设；XS/S 全图可见时 4 万精灵若每帧仍被遍历 ≈ 4–8 ms | WP11 第一天做 4 万精灵基准（`stats().frameMs`）；退路：仅 XS/S 档改为每带一张 RenderTexture（小图、伪影不可见），M+ 保持精灵树 |
| R2 | 契约冻结太早、T+4 才发现缺口 | 本文已并入 render-first §9.4/§9.5 与 sim-first §8 的全部已知缺口（`xterClass`、`RejectReason`、`ModalId`、`goto/actor/sound/toolbar`、`stats/thumbnail/setHeatLayer`、`landValue`、`pieceFor` 桩语义、高速 2×2 步进语义、`phaseCursor`、`nationalAnnual` 拆分）；剩余走加法式 RFC（`WORKPLAN.md` §5） |
| R3 | 乐观桩掩盖集成 bug、制造虚假"可玩" | 三套桩 + 每 WP 双桩验收 + `golden-mini-city` 反例 + `stubAllowlist` 严格模式 + 哈希基线延后（§10.3） |
| R4 | `priv` 成为无 schema 逃生口 | 类型白名单、`v` 版本、字节预算、`postLoad` 强制、往返非空断言（§3.3、§4.4） |
| R5 | W3 过重压在冒烟关键路径 | 拆成 WP3 placement 与 WP4 utilities；`src/data/**` 由 `gen-catalogue.ts` 机械生成归 WP0；`waterScan` 两遍 BFS + 水泵 + 管线放置（含 `XUND 0x1F/0x20` 交叉与水泵自动管线）为 **v1 必达**（供水网络、`watered` 查询、地价 +4、Map 水层、`needWater` 诉求都依赖它），T+4 落后时由 Lead 接盘 WP4 的 v1 切片而非降级；唯一允许推迟的是水塔二值蓄水、净水厂充足标志、淡化厂与 `unwateredBuildingTiles` 诊断 |
| R6 | W2 把 terrain 与 `.SC2` 绑在一起 | `io/sc2` 是纯编解码（不认识 `CityState`），`readSc2/writeSc2` 是 WP2 的第一切片（T+3）；编排在 WP1；terrain v1 只要生成器 + 工具 + 查询 |
| R7 | 规格残留冲突（`y*128+x`、`(y,x)` 升序措辞、TR 原点） | 契约只暴露 `tileIndex/tileX/tileY`；lint 测试 grep `* 128 / % 128 / * 64` 字面量；电水 T2/T4–T7 反转置测试 |
| R8 | 浮点确定性 | ESLint 禁用表；`pow` 多项式近似；真源与 `priv` 只放整数（编码器强制） |
| R9 | 生长扫描最坏 40 ms/月 | 表驱动 `step()`、预分配栈、`hasAccess` 脏缓存；`headless` 记 p95；超预算把四次尝试改为位扫描 |
| R10 | Pixi v8 API 漂移（`isRenderGroup`、`TextureSource.update`） | Pixi 只在 `render/pixi/*.ts`；锁 `^8.6.0`；像素快照在 CPU 侧兜底 |
| R11 | 原版事实不确定（车站 2×2、`0x104C`、`0x1018` 语义、费用口径） | 全部进 `tuning.ts` 开关或零区字段，默认取规格裁定；`docs/open-questions.md` 汇总 |
| R12 | 第三方存档导入 | `importFrom` 一律"修复 + 诊断"；导入对话框展示诊断 |
| R13 | 主线程 sim 挤占帧预算 | 预算切片（§5.2）；`SimHost` 已抽象，`SharedArrayBuffer` + Worker 作 v3 选项 |
| R14 | 程序化美术"不原汁原味" | 美术 bible 固定网格 / 锚点 / 光照使 DAT 零改动替换；多样性组合断言；v2 逐 ID 配方同签名 |
| R15 | 十人中有人掉线 / Lead 单点瓶颈 | 每 WP v1 切片 ≤ 1,500 行；桩保证掉线 WP 不阻塞别人；Lead 的 W1 预留 30%；`WORKPLAN.md` §4 的 Lead 减负阀（testkit 后半段、`tools/headless.ts` 可交最早完工者） |
| R16 | Playwright 装不上 | §10.6 降级；像素验收不依赖浏览器 |
| R17 | 文案夹带原版文本 | `strings-scan.ts` 黑名单进 CI（§10.7） |
| R18 | `animPage` 整页上传抖动 | 子页脏上传（≤ 1 MB/次） |
| R19 | 画家序对向下 / 侧向越格的精灵（码头、栈桥、桥面） | 归 `Ground` 层且 1×1，水平不越格；若发现越格以 DAT 实机用例调整 `SceneLayer` 子序 |
| R20 | **不做**：撤销、联机、Canvas2D 后备、DOS 素材、MIF、XS/XL（v1） | 命令日志 + 快照为撤销 / 分支预演留门 |

### 12.2 评审担忧 → 化解对照

| 担忧 | 化解（章节） |
|---|---|
| v1 渲染是一次性代码（`sortableChildren` 全排序、缺 rx 次键、多格深度键取 TL、v2 分块缓存伪影 / RT 内存） | v1 直接采用 `SceneCompiler + zKey(depth, rx, layer) + 16 深度带`，多格深度键取 `renderAnchor`；v2 只是加能力（§6.2–§6.6、§6.10） |
| 乐观桩让每个 WP 的绿灯对集成无证明力；滑到 v2 的 WP 静默带进"永远有电" | 三套桩、双桩验收、反例、`stubAllowlist` 严格模式、科技桩按基准年 + 10、`hasAccess` 桩查 24 偏移（§5.9、§10.3） |
| `hashState` 依赖 JSON 插入序 / 可选字段 / 构造路径 | schema 驱动、固定字段序 `Int32Array`、键名排序、两档作用域、显式排除表、克隆 / 乱序 / 往返三重断言（§4.1–§4.2） |
| `priv` 无版本、无预算、可塞派生缓存 | `v` 字段、`PRIV_BUDGET_BYTES`、类型白名单、`postLoad` 强制、缓存放闭包（§3.3） |
| W3 单点关键路径；W2 把 terrain 与 codec 绑定 | WP3/WP4 拆分、`data/**` 归 WP0 并脚本生成、`io/sc2` 纯编解码先行、`waterScan` v1 必达而落后由 Lead 接盘（R5、R6） |
| 契约可预见缺口（`xterClass`、`goto/screenOf/stats/thumbnail/setActors/setHeatLayer`、`ModalId/RejectReason`、`landValue`、`pieceFor` 桩、高速 2×2 语义、两处 catalogue 注入、`nationalAnnual` 命名、lint 白名单、`priv` 与 `tuning` 键同名） | 全部并入 `CONTRACTS.md`；高速 `network` 命令语义写进 `commands.ts` 注释；catalogue 单点注入（§5.4）；lint 白名单删除（§2.2）；`TuningBag` 为只读输入、`priv` 为持久态（契约注释） |
| 固定每帧 ≤ 10 天没有帧时间预算；灾害 / 物件 tick 不计预算 | §5.2 预算切片，三类 tick 同预算 |
| `anchorOf/forEachLotTile` 必须用 `tileX/tileY`；需要 `renderAnchor`；importFrom 顺序锁定 | §3.2、§4.5；契约实现体给出 |
| render→sim 的 lint 白名单先例 | 删除；置换表在 `contracts/rotation.ts`（§6.3） |
| `postLoad()` 两条路径语义不同 | `postLoad(ctx, source)`；快照路径不消费 PRNG，由 `determinism.test` 覆盖（§4.5） |
| `.sc2kweb` 成为主路径、`writeSc2` 排在 v2 | `writeSc2` 进 WP2 `[v1]`；`exportCity` 列车 #3 前；`saves` 默认 `kind = 'sc2'`；`hash('sc2')`（§4.3、§9.3） |
| `LoggedCommand` 缺 `phaseCursor`；快照是否允许"半天" | §5.6 |
| 连续平移被当作视图变化 | 相机 = 容器偏移，仅可见格集合变化时重编译（§6.5） |
| 工具前提未验证（Playwright 不在 lockfile） | WP0 任务 + 降级路径（§2.3、§10.6） |
| `BuildingDef.phase` 把排期混进 SSOT | `app/v1Tools.ts` 白名单（§7.6） |
| 没有 `derived` 槽导致缓存入 `priv` | 规则 + 编码器抛错 + 预算（§3.3） |
| `wire.ts` 不改 vs 集成要改；注册顺序是隐式确定性依赖 | 只改 `stubAllowlist`；`SYSTEM_ORDER` 固定序；`app/patches/` 逃生口（§5.4、§5.9） |
| `priv` 诱使模块不写重建逻辑 | 往返非空断言 + `postLoad` 强制（§4.4） |
| 横切项无人认领（音效、XS/XL、报纸、情景窗口、导入面板） | §13 owner 表 |
| 推迟到 v2 的原汁原味欠账可能永远不来 | §13 v2 清单带标签固化进 `WORKPLAN.md` |
| Lead 负荷 | `WORKPLAN.md` §4 减负阀 |

---

## 13. 横切项 owner 表与 v2 清单

| 横切项 | owner | 分期 | 目录 |
|---|---|---|---|
| 音效 / 音乐（`AudioSink`、`setOption.sound/music`） | WP12 | v1 静默 + 映射；v2 WebAudio 合成 | `src/audio/` |
| XS / XL 两档 | WP11 | v2（派生档，`worldRoot.scale`） | `src/render/pixi/` |
| 灾害（天气 / 状态机 / 五种灾害 / `marker` / 调度 / `destroyStructure`） | WP13 | **v1**：Fire / Flood / Tornado / Earthquake / Monster、Disasters 菜单、`disasterAlert`、状态栏 goto 箭头、警 / 消调度；v2：物件系统、Air Crash / Hurricane / Rioters、情景灾害、军队 | `src/sim/events/` |
| 科技时间线（`techCheck`、`rollInventions`、`techInvented / toolbar` 事件） | WP13 | **v1** | `src/sim/events/tech/` |
| 报纸（故事池 / 版面数据 / 视图） | WP13；视图 WP12 | **v1** 最小版：≈ 20 类、4 月 / 8 月订阅版、灾害号外、NewspaperWindow；v2 全部 67 类、多份报纸、全版面 | `src/sim/events/news/`、`src/ui/windows/newspaper/` |
| 情景（`SCEN/TEXT/PICT` 解析与目标评估） | WP8（评估）/ WP2（chunk 编解码）/ WP12（三窗口） | v2 | `src/sim/economy/scenario/`、`src/io/sc2/`、`src/ui/windows/scenario/` |
| DAT 导入（解码 / 调色板 / `DatSpriteProvider` / 入口 / 缓存 / Worker） | WP14（v1 默认 WP9 owner 在 T+5 后承担）；`setProvider` WP11 | **v1** 最小链（文件输入 + 静态精灵 + IndexedDB 缓存）；v2 目录授权 / 拖放 / 完整面板 / 色循环 / `SPECIAL` 覆盖 | `src/io/assets/` |
| 地下视图 | WP11（`undergroundRoot`）+ WP10（编译项）+ WP9（土色地表 / 短管桩）+ WP12（管线工具自动切换） | **v1** | |
| 水面动画 / 色循环 | WP11（`animPage`）+ WP9（循环位图） | v2 | |
| 灾害与角色渲染（`marker` 层、`setActors` 静帧） | WP13 产出 / WP9 位图 / WP10 Marker 项 / WP11 `setActors` + `airLayer` | **v1** 静帧无插值；v2 多帧 / 插值 / 物件全量 | |
| 邻城（`init` / `neighborsAnnual` / `marketC·I` / `neighborConnection` / Neighbors 窗口） | WP5 / WP3 / WP12 | **v1** | |
| Graphs / Ordinances / Bonds 窗口 | WP12（数据 WP8 已有） | **v1**（Ordinances 的 YTD / 估计列 v2） | `src/ui/windows/` |
| 桥（堤道 / 铁路桥 / 高架电线片段序列、长度表、岸格检查） | WP6 / WP3 / WP9 位图 | **v1**；开启桥 / 吊桥 / 高速桥 / `bridgeBlocksShips` / 自动改地形 v2 | |
| Query 细项 / 完整预算明细 | WP12 + WP8 / WP7 | v2 | |
| 触控手势 / 窄屏布局 / 键盘全表 | WP12 | **v1** 最小手势子集（单指平移 / 双指平移 / 捏合 / 长按 / 双击）；v2 双指旋转 / 三指 / 窄屏 / 键盘全表 | |
| 快照 gzip、自动存档策略 | WP1 | v2 | |

v2 清单在 `WORKPLAN.md` §6 以带标签 `[v2:<wp>]` 的任务固化，合并列车 #3 时由 Lead 建 issue，不允许"v1 发布、v2 永远不来"。

---

## 14. 开放问题（汇总到 `docs/open-questions.md`）

车站 2×2 vs 1×1（`stationFootprint` 可调）；`MISC 0x104C / 0x1018 / 0x1040` 语义；DAT 重叠行位置（`DAT_OVERLAP_ROW`）；色循环节拍；费用口径（Raise/Lower 每格 / 每次）；`destMask`；交通总量口径；年龄队列三元组字段序（`cohortOffset` 单点改）；Pixi RenderGroup 静态成本实测；WebGL 不可用时的降级（`preference: 'webgl'` 失败 → `CpuCompositor` 直出 `<canvas>` 的只读模式，v2 决定是否做）。
