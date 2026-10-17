# `packages/sc2k` 工作分解（WORKPLAN）

> 配套 `docs/ARCHITECTURE.md`（设计）与 `docs/CONTRACTS.md`（接口）。本文回答：谁、在哪些文件里、交付什么、怎么验收、何时合并。
> 原则：**独占文件清单互斥**（之外一个字节都不许写）；共享文件（桶文件、`package.json`、`pnpm-lock.yaml`、`wire.ts`、根 `eslint.config.js`、`docs/**`）归 WP0 / 集成者；需要别人的东西先用 `testkit` 桩，缺口走 §5 的 RFC。
> 规模单位 = 预估源码 + 测试行数（全量 / 其中 `[v1]` 切片）。`[v1]` = 日终 `v1-playable` 必达；`[v2]` = 次日起（§6 固化为带标签任务）。

---

## 0. 时间表与角色（T = 开工）

| 时刻 | 事件 | 产出 / 门禁 |
|---|---|---|
| T+0:00 | 全员读规格；Lead 做 WP0 | 其余成员先写各自的 `tuning.ts`、测试夹具、空测试（不依赖契约细节） |
| T+1:30 | **契约冻结 `contracts-v1`**；WP0 合并到 `sc2k/main` | `pnpm lint && pnpm typecheck && pnpm test` 全绿（桩应用）；`pnpm --filter sc2k e2e` 全绿或标记 best-effort（§7.4） |
| T+1:30–7:00 | 第一波 WP1–WP12 + WP13 `[v1]`（T+1:30 起）+ WP14 `[v1]`（≈ T+5 起）并行 | 每人一个 worktree / 分支，只碰独占文件（§2） |
| T+3:00 | WP1 切片 B 合并（完整调度 / 快照 / 哈希 / 重放 / `goldenMiniCity` / `headless`） | 其余 WP 从此可以用真 `SimHost` 跑验收 |
| T+4:00 | **合并列车 #1**（只验类型与测试，不验玩法） | Lead 合并全部分支到临时分支跑并集门禁；失败的 WP 当场修；Lead 按进度重分配（§4） |
| T+7:00 | **合并列车 #2 → v1 可玩检查** | 冒烟：新城 → 煤电 + 电线 → R/C/I 分区 + 道路 + 水泵 / 管线 + 火车站 / 医院 → Cheetah 24 个月 → 出现建筑、资金变化、Query 对火车站 / 医院各查一次有数据；Disasters 菜单触发 Fire → 扑灭 → `disasterEnded` + 号外；`noPower` 反例不长 |
| T+7:00–10:00 | v1 修补；先完工者领 WP13 / WP14 的 `[v2]` 切片 | 哈希基线在此之后建立 |
| T+10:00 | **合并列车 #3 → 打标 `v1-playable`** | 无头 50 年长跑 + 确定性双跑 + `SC2K_STRICT_WIRE=1`（`WIRE_STUB_ALLOWLIST = []`）+ 截图 / 缩略图入 CI；`exportCity` 已落地；导入合成 DAT 夹具后截图变化 |
| 次日起 | v2 切片（§6 清单） | 常驻物件、情景、报纸全量、DAT 导入全量（目录授权 / 面板 / 色循环）、Population / Industries / Scenario 窗口、动画与色循环、XS/XL |

角色：Lead = WP0 + WP1 + 三趟合并列车 + RFC（30 分钟 SLA）+ `app/patches/`；其余成员一人一个第一波 WP；**WP10 与 WP11 合并由一人（I）承担**，释放出的成员（J）承担 WP13 `[v1]`；WP14 `[v1]`（≈ 600 行）默认由 WP9 owner（H）在 art `[v1]` 切片合并后（≈ T+5）承担，T+4 列车按进度可改派最早完工者；WP13 / WP14 的 `[v2]` 切片由最早完工者认领。

---

## 1. WP0 脚手架 + 契约 + 桩 + 数据表（Lead，T+0:00–1:30，≈ 1,300 行，其中数据表由脚本生成）

### 1.1 任务清单（按顺序）

1. 包文件：`package.json`、`tsconfig.json`、`tsconfig.sim.json`、`vite.config.ts`、`index.html`、`README.md`（`ARCHITECTURE.md` §2.3）；`pnpm add -D @playwright/test` 并 `pnpm exec playwright install chromium`（失败则记录到 `README.md` 并设 CI `SC2K_E2E=skip`）。
2. 根 `eslint.config.js` 追加两段：确定性规则作用于 `packages/sc2k/src/{contracts,data,sim,art,io/sc2,io/snapshot,render/scene,render/cpu}/**/*.ts`（测试除外，追加 `Math.pow/exp/log`）；`no-restricted-imports` 按 `ARCHITECTURE.md` §2.2 的依赖方向逐目录配置。
3. `src/contracts/**`：把 `CONTRACTS.md` 全部代码块落地，补齐 `declare` 的实现体（`XBLD_ROT_CCW / XUND_ROT_CCW` 由环生成、`FOOTPRINT` 由区间生成、`NET_FLAGS`、`createPrng`、`hash32`、`fnv1aBytes`、`hashNoise`、`createCityState`、`rotateXbldFlip`、`getTuning`、`nullSystem`、`createDirtyTracker`、`SNAPSHOT_SCHEMA / SCALAR_FIELDS / HASH_EXCLUDE`；`entrypoints.ts` 只有类型；`COMMAND_OWNER / MODAL_OWNER / NOT_IMPLEMENTED_RESULT`、`END_OF_DAY_IO`、`OverlayId / ActorId / UiIconId / MAP_LAYER_MODES / zoneOverlayId / markerOverlayId / XUND_PIPE_STUB`、`DisasterKind / DISASTER_MENU / V1_DISASTERS`、`NewsType`、`mapOrigin` 为常量 / 纯函数）。附带 `src/contracts/*.test.ts`：PRNG 测试向量；`tileIndex` 反转置；置换表 = 角点重命名、周期 4、`SLOPE_ROT_CW` 为逆；`renderAnchor` 四旋转；`FOOTPRINT` 集合；`anchorOf` 在 x 边缘不绕列；`DAY_PHASES/PHASE_IO/PHASE_OWNER` 不变量；`ACTION_OWNER` 覆盖全部键；`COMMAND_OWNER` 覆盖全部 `Command['type']`、`MODAL_OWNER` 覆盖全部 `ModalId`、`END_OF_DAY_IO` 键 ⊆ `SystemId`；`mapOrigin` 使 (0,0)@31 的顶点 `y == 0`、(0,127) 的左顶点 `x == 0`（四个旋转）；`zoneOverlayId(1..9)` 单调、`markerOverlayId` 五个标记值。
4. `tools/gen-catalogue.ts`：解析 `docs/spec/building-catalogue.md` §2 的表格 → `src/data/buildings.generated.ts`（256 条，`refName` 只写进注释）；手写 `src/data/tools.ts`、`techBaseYears.ts`、`ordinances.ts`（转录 `spec:economy §3.2`）、`strings.zh.ts` / `strings.en.ts`（原创文案骨架：工具名、拒绝原因、模态标题、常用 UI 词）、`src/data/index.ts` 导出 `CATALOGUE: CatalogueApi`。`src/data/catalogue.test.ts`：`spec:building-catalogue §3.2` 全部不变量 + 造价表快照（与 `spec:economy §2.9` 逐项）。
5. `tools/strings-scan.ts`：关键词黑名单（原版店名 / 报名 / Arco 名 / `refName` 列）扫描 `src/**`，命中退出码 1；接入根 `pnpm lint`（通过 `package.json` 的 `lint` 脚本串联，或 CI 单独步骤）。
6. `src/sim/core/tileWriter.ts` + `src/sim/core/dirtyTracker.ts`（实现 `Actions.set*/layerChanged` 与 `DirtyTracker`，≈ 150 行，WP1 后续扩展不改签名）。
7. `src/app/stubs/**`：`null.ts`（`nullSystem`；`commands` 为空，因此对其命令 `dispatch` 返回 `NOT_IMPLEMENTED_RESULT`）、`stubQueries.ts`（三套，含 `news / bridgeOptions / bridgePieces` 默认值）、`stubActions.ts`、`stubRenderer.ts`（用 `CpuCompositor` 的 WP0 占位实现 + 洋红 provider 画到 `<canvas>`；WP10 落地后自动替换为真编译器——通过 `render/index.ts` 转发）、`stubShell.ts`（速度按钮 + 资金 / 日期 + 新城按钮，签名 `mountShell(ShellOptions): ShellHandle`）、`stubProvider.ts`（洋红）。
8. `src/testkit/{index,context,stubs,hash}.ts`：`createTestContext`（内部 `createSim({ …, snapshot: opts.snapshot ?? snapshotCodec })`，`snapshotCodec` 来自 `io/snapshot/index.ts`——testkit 可 import `io/**`，与 `wire.ts` 同一注入点）、`stubQueries/stubActions` 重导出、`hashOf = snapshotCodec.hash`、`BUILTIN_PROCEDURAL_STUB`（`goldenMiniCity`、`runDays`、`pngOf` 由 WP1 在 T+3 补齐——见 §4）。
9. 各目录转发桩 `index.ts`（导出名与签名按 `CONTRACTS.md §V`，每个文件以 `satisfies` 对账 `contracts/entrypoints.ts`）：`src/sim/core/index.ts`（`createCoreSystem / createSim / replay`）、`src/sim/{terrain,placement,utilities,zones,transport,services,economy,events}/index.ts`（`create<Id>System`）、`src/art/index.ts`（`createProceduralProvider`）、`src/render/index.ts`（`createRenderer / sceneCompiler / cpuCompositor`）、`src/ui/index.ts`（`mountShell`）、`src/audio/index.ts`（`createAudioSink`）、`src/io/snapshot/index.ts`（`snapshotCodec`）、`src/io/sc2/index.ts`（`sc2Codec`）、`src/io/assets/index.ts`（`createAssetStore / createAssetImporter`）、`src/data/index.ts`（`CATALOGUE / createStrings`）。
10. `src/app/wire.ts`（`createSim({ systems: [...9 个 create<Id>System()], catalogue: CATALOGUE, snapshot: snapshotCodec, stubAllowlist: WIRE_STUB_ALLOWLIST })`，`WIRE_STUB_ALLOWLIST = ['terrain','placement','utilities','zones','transport','services','economy','events']` 在冻结时为全集，随各 WP 合入收缩，打标前置为 `[]`）、`src/app/v1Tools.ts`（`ARCHITECTURE.md` §7.6 的 54 个工具 id 完整显式集合，无省略号）、`src/app/patches/README.md`、`src/main.ts`、`src/app/boot.ts` 最小版（装配 + DEV / `?debug` 下 `window.__sc2k`；WP12 接手重写）。
11. `src/app/wire.test.ts`（唯一的 WP0 冒烟）：用桩创建 `SimHost` → `newCity` → `runDays(25)` → `hash('full')` 两次相同 → `saveSnapshot/loadSnapshot` 往返哈希不变（经注入的 `snapshotCodec`，此时为 WP0 的最小实现：TypedArray 条目 + scalars + priv，WP1 接手补全）→ 对桩系统 `dispatch({ type:'placeBuilding', … })` 返回 `reason:'notImplemented'` 且 `commandLog()` 为空 → 各目录 `index.ts` 的 `import * as m` `satisfies` 对应 `*Entry` 类型（类型层断言）。
12. `e2e/playwright.config.ts` + `e2e/boot.spec.ts`（打开标题页、点"新城"、断言 `<canvas>` 存在且非单色；WP12 接手后改名入 `smoke.spec.ts`）。
13. `docs/contract-rfc.md`、`docs/open-questions.md` 空模板。

### 1.2 WP0 独占文件

`packages/sc2k/{package.json,tsconfig.json,tsconfig.sim.json,vite.config.ts,index.html,README.md}`、`src/main.ts`、`src/contracts/**`、`src/data/**`、`src/testkit/{index,context,stubs,hash}.ts`、`src/sim/core/{tileWriter,dirtyTracker}.ts`、`src/app/{wire.ts,v1Tools.ts,wire.test.ts}`、`src/app/stubs/**`、`src/app/patches/README.md`、`tools/{gen-catalogue,strings-scan}.ts`、`e2e/{playwright.config.ts,boot.spec.ts}`、各目录转发 `index.ts`（冻结后移交给目录 owner）、根 `eslint.config.js`（追加段）、`pnpm-lock.yaml`、`docs/**`。

### 1.3 WP0 验收

`pnpm lint`（含 `strings:scan`）/ `typecheck`（两套 tsconfig）/ `test` 全绿；`registry.test` 骨架对桩通过；桩应用能新城并推进日历、画出首帧（CPU 合成器）；`e2e/boot.spec.ts` 通过或标记 best-effort。

---

## 2. 并行工作包

### 2.1 总览

| WP | 名称 | owner | 独占文件 / 目录 | 规模（全 / v1） |
|---|---|---|---|---|
| WP1 | sim-core + snapshot + saveload | Lead | `src/sim/core/**`（除 WP0 的两文件外全部，含它们的后续扩展）、`src/io/snapshot/**`、`src/testkit/{goldenMiniCity,replay,png}.ts`、`tools/{headless,hash-compare}.ts` | 1,600 / 1,200 |
| WP2 | terrain + `.SC2` codec | A | `src/sim/terrain/**`、`src/io/sc2/**` | 2,600 / 1,700 |
| WP3 | placement | B | `src/sim/placement/**` | 1,500 / 1,100 |
| WP4 | utilities（电 / 水） | C | `src/sim/utilities/**` | 1,400 / 1,000 |
| WP5 | zones + demand + 邻城 | D | `src/sim/zones/**` | 2,000 / 1,400 |
| WP6 | transport + traffic + 桥 v1 子集 | E | `src/sim/transport/**` | 2,600 / 1,500 |
| WP7 | services | F | `src/sim/services/**` | 2,800 / 1,400 |
| WP8 | economy + scenario | G | `src/sim/economy/**` | 1,900 / 1,100 |
| WP9 | art（程序化精灵） | H | `src/art/**`、`tools/art-sheet.ts` | 2,400 / 1,450 |
| WP10 | render-scene（编译 / 投影 / 拾取 / CPU 合成） | I | `src/render/scene/**`、`src/render/cpu/**` | 1,600 / 1,300 |
| WP11 | render-pixi（深度带后端） | I（与 WP10 同一人） | `src/render/pixi/**`、`src/render/index.ts` | 2,200 / 1,500 |
| WP12 | shell（ui + app + audio + e2e） | K | `src/ui/**`、`src/audio/**`、`src/app/{boot,loop,session,savesLite}.ts`、`e2e/{smoke,hash}.spec.ts` | 3,400 / 2,400 |
| WP13 | events（第一波 `[v1]` 切片 + 第二波） | J（WP10+WP11 合并释放） | `src/sim/events/**` | 2,900 / 1,100 |
| WP14 | assets（DAT 导入：`[v1]` 最小链 + 第二波） | H（T+5 起）或最早完工者 | `src/io/assets/**` | 1,800 / 600 |

### 2.2 WP 内部约定（每个 `src/sim/<id>/`）

`index.ts`（`export function create<Id>System(): System`，名字按 `CONTRACTS.md §V`，含 `privVersion`；`commands` 的键集合恰为 `COMMAND_OWNER` 归本系统者；需要日末钩子的系统实现 `endOfDay` 且其 `END_OF_DAY_IO[id]` 已声明）、`tuning.ts`（`XTuning` + `DEFAULT_X_TUNING`；所有 `[低]/[设计]` 数值在此）、`phases.ts`、`commands.ts`、`queries.ts`、`save.ts`（`importFrom / exportTo / postLoad`）、`priv.ts`（`priv` 的类型与 `PRIV_VERSION`、迁移 / 重建）、`*.test.ts`。私有运行缓存放系统对象闭包，`postLoad` 重建；私有持久态放 `ctx.state.priv[id]`（只放不可重建者，遵守 `PRIV_BUDGET_BYTES`）。验收测试用 `describe.each(['optimistic','pessimistic'] as const)` 在两套桩下各跑一次相关用例。

### 2.3 逐 WP 说明

#### WP1 sim-core + snapshot + saveload（Lead）

- 目标 `[v1]`：`advanceDay / modalOpened / modalClosed / advance(dt, now, budget)`（预算切片、余量带帧、硬顶）、**`endOfDay` 调度**（当日阶段全部完成后按 `SYSTEM_ORDER` 调用 `END_OF_DAY_IO` 的键；挂起日延后到 `modalClosed` 续跑完成后，每天恰一次）、`CommandQueue` + 日志（含 `phaseCursor`）、**`NOT_IMPLEMENTED_RESULT` 路径**（owner 缺席 / 桩 / 未实现 → 不写日志）、**core 系统 `createCoreSystem()` 的四条命令** `setSpeed / setView / terrainDone / modalAnswer`（后者按 `MODAL_OWNER[dialog]` 转发 `onModalAnswer`）、`EventBuffer`、`createSim`（`SYSTEM_ORDER` 排序、注册断言含 `COMMAND_OWNER` 越权检查、`stubAllowlist`、**必填 `snapshot: SnapshotCodec`**——core 不 import `io/**`）、`SimHost`、`saveload.ts`（`importCity / exportCity` 按 `IMPORT/POSTLOAD/EXPORT_ORDER`；`exportSc2({compat})`）、`io/snapshot`（schema 驱动编码 / 解码 / `hash(scope)` / `validatePriv`）、`replay`、`goldenMiniCity`（含 `noPower / noRoad` 反例）、`runDays`、`tools/headless.ts`（输出 `{year, hash, pop, funds, phaseMsP95, growthDayMsP95, runTrips}[]`）、`tools/hash-compare.ts`。`[v2]`：自动存档策略、快照 gzip、命令日志导出、性能面板数据。
- 依赖契约：实现 `Actions.set*/layerChanged/emit`、`SimHost`、`SnapshotCodec`、`DirtyTracker`；消费 `System`。
- 验收：`sim/core/dayPhases.test.ts`（表不变量，含 `END_OF_DAY_IO` 与当日 bulk 写者不冲突）、`tileWriter.test.ts`（计数恒等、`dirty` 去重）、`registry.test.ts`（契约一致全部条目，`ARCHITECTURE.md` §10.1：**`COMMAND_OWNER` 覆盖全部 `Command['type']`、每个真系统 `commands` 键集合 == 归自己的集合、`MODAL_OWNER` 全覆盖、`endOfDay` 只在 `END_OF_DAY_IO` 的键上出现**）、`io/snapshot/snapshot.test.ts`（往返两档哈希不变；`structuredClone` 哈希不变；`priv` 键乱序哈希不变；非白名单类型抛错；预算断言；`v=0` 旧 priv 不崩）、`sim/core/determinism.test.ts`（同 seed 双跑逐年相同；快照载入不改 `prng.state()` 且续跑哈希一致；重放 = 原跑，**含 `endOfDay` 与挂起日延后调用**）、`sim/core/saveload.test.ts`（`.SC2` 往返 `hash('sc2')` 相同、`priv` 重建非空、`compat` 零区为零、`phaseCursor>0` 导出抛错）、`sim/core/longrun.test.ts`（骨架 + 不变量，`ARCHITECTURE.md` §10.4）、`sim/core/advance.test.ts`（预算切片：注入 `now` 使每天耗 4 ms，`budget=6` 时每帧恰 2 天；余量下一帧补回；挂起即停；**挂起当日 `endOfDay` 未调用、`modalClosed` 后恰调用一次**）、`sim/core/commands.test.ts`（桩 owner → `notImplemented` 且日志为空；`modalAnswer` 按 `MODAL_OWNER` 转发；`setSpeed / setView` 不入哈希；`terrainDone` 切 `mode`）。

#### WP2 terrain + `.SC2` codec

- 目标 `[v1]`：`io/sc2`（`ByteReader/Writer`、IFF、RLE、`readSc2`、`writeSc2`、`misc.ts` 访问器、Mac 头 / Classic 识别）**作为第一切片 T+3 前合并**；terrain：层 / 坡面表（re-export `contracts/rotation`）/ 角点场 / `recomputeTerrainTile` / 生成器（fBm 多项式近似，`terrain` 流）/ `terrainTool` 命令处理者（`COMMAND_OWNER`）：Raise / Lower / Level / Trees / **Water（`nature.water`：平地 → 浅水、坡面 → 瀑布，`$100/格`）** / 推土地表 / 水体重算 / 咸淡 / `TerrainQuery` / `importFrom`（ALTM 拆位 + `XTER` 修正）/ `exportTo`。桥在 v1 **不改地形**：桥头岸格的合格判定由 WP3 用现有 `TerrainQuery`（`isWater / isFlatDry / slope / alt / waterDepth`）完成。`[v2]`：溪流、海平面、Stretch / Forest、桥 / 隧道的自动改地形 `autoTerraformForNetwork`、情景 chunk（`SCEN/TEXT/PICT` 编解码函数供 WP8 调用）。
- 依赖契约：实现 `Queries.terrain`、`Sc2Codec`；消费 `Actions.setTerrain/setXbld`、`rotation.ts`。
- 验收：`io/sc2/rle.test.ts`（属性测试往返，三类输入）、`io/sc2/iff.test.ts`（Mac 头 / Classic / 无填充 / 截断容错）、`io/sc2/roundtrip.test.ts`（手工构造样例 `readSc2(writeSc2(doc))` 深比较；`cohortOffset(19,'leSum')+4 == MISC.industryGraph`；偏移表无重叠且 4 字节对齐）、`sim/terrain/slope.test.ts`（`spec:terrain §2.5.4` 数据级四条）、`generate.test.ts`（固定 seed 快照；约束 ≤ 1 级；水体与 `seaLevel` 一致）、`tools.test.ts`（费用与拒绝原因；`refloodAll` 幂等；city 模式有结构物拒绝）、`import.test.ts`（`XTER` 优先于 `ALTM.waterLevel`；T2 反转置）。

#### WP3 placement

- 目标 `[v1]`：`canPlace`（全部 `RejectReason`，顺序按 `spec:building-catalogue §3.4`）、`place / demolish`（含整栋拆 `$1×size²`、`POWERABLE|POWERED|PIPED` 预置、雕像清 `POWERABLE`、水泵自动管线（`XUND 0x10 / 0x1F / 0x20`）、`XUND 0x22/0x23`、微模拟分配调用、预算计数由 services 维护故经 `allocMicrosim` 协议）、`zoneRect / dezone / bulldoze` 命令、`network` 命令编排（调用 `q.transport.pieceFor` 选形；管线族含与直线地铁的 `0x1F/0x20` 交叉、对 `0x22/0x23` 与水下的拒绝；高速 2×2 块步进；**遇水**：`n` = 连续水面格数，`options = q.transport.bridgeOptions(family, n)`——非空且未给 `bridge` → `{ ok:false, reason:'needsBridge', modal:{ id:'bridgeType', payload:{ from, to, length:n, options } } }`，UI 带 `bridge` 重发 → `q.transport.bridgePieces(bridge, family, n)` 整段原子写入（翻转族按行进轴置 `XBit.Flipped`）、按 `n × 基价` 计费、两端岸格最小检查（陆地、`isFlatDry` 或坡面沿桥向、`alt ≥ 水面格 waterLevel`；不合格 → `reason:'terrain'`，v1 不自动改地形）；`options` 为空（v1 的 `highway`）→ `reason:'water'`，**绝不弹出无法完成的模态**；边缘 → 正常放置并返回 `modal neighborConnect`）、**`neighborConnection` 命令**（accept → `layers.xtxt[at] = 0xFA` + `act.layerChanged('xtxt')` + `act.charge(1000)`（不足 → `reason:'funds'` 并回滚该边缘格）→ `at` 列入 `changed`，transport 在 `onTilesChanged` 里重算 `connections()`（以 `XTXT 0xFA` 为准）；reject → `act.setXbld(at, 0)` 回滚该边缘格并退还其铺设费）、`placeBuilding` 的 `teamPick` 模态 + `onModalAnswer(teamPick)` 写 `rewards.stadiumTeams`、`availability`（`notImplemented → notInvented → ordinance → locked → funds`，读 `V1_TOOL_IDS` 54 项完整集合，由 app 注入到 tuning）、`preview`、费用门控经 `act.charge`。`[v2]`：NIMBY 掷骰（消费 PRNG）、`tunnel` 命令、机场 / 海港分区费用与最小尺寸提示、桥的自动改地形。
- 依赖契约：实现 `Queries.placement` 与 `COMMAND_OWNER` 归 placement 的全部命令、`onModalAnswer(teamPick)`；消费 `charge / allocMicrosim / setXbld / setXzon / setXund / setXbit / layerChanged / pieceFor / bridgeOptions / bridgePieces / requestRescan / markAccessDirty / canAfford / invented / ordinance`、`q.terrain`。
- 验收：`sim/placement/canPlace.test.ts`（每种 `RejectReason` 一例，含 4×4 锚点 ≤ 124、码头水格 1..8、瀑布水电）、`place.test.ts`（整栋角标、`counts.tile` 增量、位预置）、`network.test.ts`（直线轴向切换、重复铺设免费、整段拒绝、高速偶数吸附、`needsBridge` 结果形状与 `options`、带 `bridge:Causeway` 重发后序列交替且整段计费、岸格不合格 → `terrain`、`highway` 遇水 → `water` 而非模态、管线与地铁交叉写 `0x1F/0x20`）、`neighbor.test.ts`（accept 写 `0xFA` 并扣 $1,000；资金不足回滚；reject 回滚并退费）、`availability.test.ts`（悲观桩下全部 `notInvented`；`V1_TOOL_IDS` 之外 `notImplemented`；54 项在乐观桩下全部 `enabled`）。

#### WP4 utilities（电 / 水）

- 目标 `[v1]`：电厂表（`POWER_PLANT_DEFS`，从 `CATALOGUE` 读造价 / 尺寸，只保留产量语义；10 种电厂的产量 / 风 / 太阳能 / 水电语义全部 v1，工具可用性由 `availability` 门控）、`powerScan` 两遍 BFS（`SCAN_NEIGHBORS` 顺序、Energy Conservation `+1/12`、风 / 太阳能逐格抽样）、**`waterScan` 两遍 BFS（v1 必达）**：水泵 / 淡化厂产量、管线连通（`XUND 0x10..0x1E`，`0x1F/0x20` 交叉视为管线直通）、`PIPED` 建筑格消费、`WATERED` 位整层重建、`WaterReport`；`UtilityQuery`、`Actions.requestRescan`（只置脏标志）+ **`System.endOfDay`（v1 必达）**：脏则立即重扫电 / 水并 `layerChanged('xbit')`（消费 PRNG；`END_OF_DAY_IO.utilities` 已声明），无脏标志时零 PRNG 消费——否则烧毁 / 拆除的电线当月不断电；`onTilesChanged` 置脏（电线 / 电厂 / 建筑格变化 → power；管线 / 水设施 → water）；`postLoad('sc2')` 不消费 PRNG 的重扫；水设施表（水泵 / 水塔 / 净水厂 / 淡化厂的产量语义）。电线 / 管线选形不在本 WP：`pieceFor` 全族由 WP6 实现，WP4 只实现 `POWERABLE` 规则与 BFS。`[v2]`：电厂寿命与年度更新（`utilitiesAnnual`，到期 → `destroyStructure(PLANT_EOL)` / 自动重建）、`plantAt` 微模拟记录、水塔二值蓄水、净水厂充足标志、`unwateredBuildingTiles` 诊断（这四项是 T+4 落后时**唯一**允许推迟的内容，§4 第 4 条）。
- 依赖契约：实现 `Queries.utilities`、`Actions.requestRescan`、阶段 `powerScan / waterScan / utilitiesAnnual`、`endOfDay`；消费 `XBit`、`counts.tile`、`q.economy.ordinance`、`q.tech.invented`、`act.destroyStructure / charge / layerChanged / setXbit`。
- 验收：`sim/utilities/power.test.ts`（`spec:power-water §3.8` T1–T9：反转置、同字节、断电方向沿 x / 沿 y、邻居顺序、科技只读）、`water.test.ts`（水源顺序 T7、`0x1F/0x20` 交叉连通、水泵自动管线、幽灵水泵口径；水塔二值与净水厂容量在 v2 补）、`flush.test.ts`（命令拆电线 → 同日 `endOfDay` 后 `POWERED` 位已更新且 `dirty.bulk.xbit`；无脏标志时 `endOfDay` 前后 `prng.state()` 相同；挂起日延后到 `modalClosed` 后）、`conservation.test.ts`（704 → 762）、`priv.test.ts`（`priv` 只含 `plants` 不可重建部分；`postLoad('sc2')` 从 `XMIC` 重建）。

#### WP5 zones + demand

- 目标 `[v1]`：`growthVisit`（`spec:zones §2.5.2` 流程）、`LotState`（`priv`，TypedArray 列式存储：`anchor/size/level/tier/phase/phaseDays/unpoweredDays/tripFailMonths/tierMismatchMonths/pendingTier/pendingId`）、`findLot`（含吞并）、施工 / 衰退 / 废弃 / 瓦砾状态机、**`dailyTimers` 走 `System.endOfDay`**（`spec:zones §3.4` 原样按天：`phaseDays++`、`unpoweredDays` 按 `q.utilities.poweredSelf` 清零或 +1、`constructDays[size]` 到期 `finishConstruction`、`unpoweredDays > unpoweredGraceDays(60)` 衰退一级、`abandonToRubbleDays` 到期 `toRubble`；`END_OF_DAY_IO.zones.usesPrng = false`，因此 `startConstruction` 时就 `pickBuilding` 把终态 id 存入 `pendingId`（PRNG 在 `growthVisit` 阶段消费），瓦砾 `0x01..0x04` 与废弃精灵用 `hash32(age, anchor)` 派生；`endOfDay` 不得触碰 `ctx.prng`）、人口汇总 / 税基（`census`，`taxable*` 含 arco 份额；**`census.workforcePctUsed` = `state.demographics.workforcePct || 50` 的只读拷贝**）、RCI 需求（主干 + 税率 + cap + 噪声；**产业税率读 `state.economy.industryTax`**，`IndustryState` 无 `tax`；**邻城市场项** `spec:zones §2.10`：`marketC = Σ_n (roadConn_n > 0 ? pop_n × 0.02 : 0)`、`marketI = Σ_n ((railConn_n + hwyConn_n) > 0 ? pop_n × 0.04 : 0)`）、`demand`（每月先重算 `neighbors[n].connections`：扫 4 条边 512 格，`xtxt == 0xFA` 且 `isRoad / isRail / isHighway`，边 → 邻城按 `NeighborCity.edge`）、`beginMonth`、**邻城 `init`**（4 条：`pop0 = round(rngFloat(5000, 60000) × natPop(year) / 10000)`、`value = pop × int(5..15)`、`fame = int(0..100)`、原创名单抽取；`natPop(year)` 表落 `tuning`）、**`neighborsAnnual`**（`pop *= 1 + float(0, 0.04) + 0.02 × connectedTypes_n`，`connectedTypes_n ∈ 0..3`）；`[v2]`：11 产业（`industry.ratio / demand`）、国家经济（`nationalAnnual.zones`）、教堂、贫富档迟滞、legacy `score` 模型。
- 依赖契约：实现 `Queries.zones`、阶段 `census / demand / beginMonth / nationalAnnual.zones / neighborsAnnual`、`growthVisit`、`endOfDay`；消费 `q.utilities.hasPower/poweredSelf/watered`、`q.transport.hasAccess/runTrip`、`q.services.landValue/seaportCranes/airportTiles`、`q.economy.ordinance/year`、`state.economy.industryTax`、`state.demographics.workforcePct`、`NET_FLAGS`、`act.setXbld/setXzon/allocMicrosim`。
- 验收：`sim/zones/growth.test.ts`（`spec:zones §3.7` 八项；在悲观桩下 24 个月零施工）、`timers.test.ts`（1×1 施工恰 `constructDays[0]` 天后完工、3×3 按其表；断电第 61 天衰退一级；`endOfDay` 前后 `prng.state()` 相同；挂起日延后不重复计数）、`demand.test.ts`（空城特例、税率表插值、cap 惩罚、`demand=0` 静止、产业税率改 `economy.industryTax` 后需求变化、`marketC` 只计公路 / `marketI` 只计铁路与高速）、`neighbors.test.ts`（初始化按 `natPop(year)` 缩放；有公路连接的邻城增长更快；`connections` 重算之和 == `q.transport.connections().total`）、`census.test.ts`（税基含 arco、断电按 0、`workforcePctUsed` 取自 demographics 或 50）、`lot.test.ts`（吞并整栋落入、孤儿删除、瓦砾 1×1 角标）、`priv.test.ts`（预算 ≤ 128 KB；`postLoad('sc2')` 由 `XBLD` 推断、计时器归 0）。

#### WP6 transport + traffic

- 目标 `[v1]`：`pieceFor`（五族 15 片段 + 交叉件 + 坡面件，供 WP3 调用）、`net/conn/station/stationOf` 闭包缓存与 `postLoad` 重建、`hasAccess`（24 偏移 + 脏缓存，`markAccessDirty`）、`runTrip`（表驱动转移、回溯恢复、512 栈、`visited` 掩码；成功经 `act.addTraffic`）、`roadTileCounts`、`recountConnections`（`XTXT 0xFA`）、`connections()`、`stationAt`、车站放置校验供 WP3（`placeStation` 的规则以 `q.transport.pieceFor`/`canPlaceStation` 形式暴露？——**裁定**：车站是建筑，放置由 WP3 的 `canPlace` 按 `BuildingDef.placement.needsAdjacent` 检查 `ring ∩ ROAD_SET/RAIL_SET`，WP6 只在 `onTilesChanged` 登记车站与 `stationOf`）、`growthVisit` 的预算衰败掷骰（`funding==100` 不掷）、**桥 v1 子集** `bridgeOptions / bridgePieces`：堤道（`0x58, 0x57, 0x58, …` 桥面 / 墩交替，任意 n ≥ 1）、铁路桥（`0x5B, 0x5A, …` 交替）、高架电线（`0x5C × n`）；`spec:transport §2.6` 的道路长度条件表（n<5 仅堤道；5–6 +开启桥；7–12 三种；>12 堤道+吊桥）整表落 `tuning` 并以"已实现集合"过滤，v1 过滤后 `road → [Causeway]`、`rail → [Rail]`、`power → [Wire]`、`highway → []`；桥格（`NetFlag.Bridge`）的出行按直行（`runTrip` 的 ROADBRIDGE / RAIL 模式，电线桥不通行）。`[v2]`：开启桥 / 吊桥 / 低架与加固高速桥的片段序列与 `bridgeBlocksShips`、高速块 / 匝道 / 隧道、2×2 车站内部移动、地铁与转换件换乘、`subwayDecays`、装饰列车谓词、`railMask/subwayMask`。
- 依赖契约：实现 `Queries.transport`、`Actions.markAccessDirty`、`growthVisit`（`GROWTH_VISIT_ORDER` 第一位）；消费 `act.addTraffic / allocMicrosim / destroyStructure / setXbld`、`q.terrain`、`q.economy.funding`、`state.weather.wind`。
- 验收：`sim/transport/access.test.ts`（(2,2)/(3,1) 不可达，(3,0)/(2,1) 可达；2×2 车站 36 格影响区）、`trip.test.ts`（转移表逐行；回溯恢复步数；桥上直行；入地铁四向；`popLevel==1` 预算 75；失败不写交通；`addTraffic` 调用计数）、`piece.test.ts`（15 片段、末端直线、孤立管线十字、交叉件生成、坡面非法）、`counts.test.ts`（`roadTileCounts` 增量 = 全量）、`connections.test.ts`（边缘直线才算、高速两格一条、读档重算、`XTXT 0xFA` 写入后 `onTilesChanged` 重算）、`bridge.test.ts`（n = 1..12 堤道序列以 `0x58` 起严格交替；铁路桥序列；`0x5C`；v1 `bridgeOptions` 四族返回值；`bridgePieces(Raising, …) == null`；两函数不改 `prng.state()`）。

#### WP7 services

- 目标 `[v1]`：`dataMaps`（污染 → 中心 → 宜居 → 地价 → 覆盖 + 密度 → 增长 → 犯罪，整体替换）、`cityCenter`（闭包，读档重算）、`TrafficOwner`（`addTraffic / decayTraffic(trafficDecay) / trafficReport`，`MISC 0x0030`）、警 / 消 / 医 / 校 / 公园放置效果（`structureCounts` 由 `onTilesChanged` 维护）、微模拟记录分配（`allocMicrosim / freeMicrosim`、初值表）、`milestones`、`cityStatus` 诉求链（命中项经 `act.news(NewsType.Demand*)` 转发给报纸池）、`landValue/pollution/crime` 查询、`queryStats`、**`sign / rename` 命令处理者**（`COMMAND_OWNER`：`sign` 写 `XTXT 0x01..0x32` + `XLAB` 槽并 `layerChanged('xtxt')`，> 50 个 → `limit`，`text: null` 删除；`rename` 写微模拟建筑的 `XLAB`）、`demographics.workforcePct` 月更（v1 可为 50 + 教育简化项；zones 的 `census` 只读它）。`[v2]`：`demographics` 全量、`facilityAnnual` 全表与监狱加成、`approvalSurvey`、军事基地、Arcology 入住 / 升空、海港 / 机场 / 军事生长（`growthVisit`）、NIMBY 窗口数据。
- 依赖契约：实现 `Queries.services`、`Actions.addTraffic/allocMicrosim/freeMicrosim`、阶段 `dataMaps / trafficDecay / demographics / approvalSurvey / facilityAnnual / milestones / cityStatus`、`growthVisit`；消费 `q.economy.funding/ordinance`、`q.utilities`、`q.transport.roadTileCounts/connections`、`state.census`、`counts.tile`。
- 验收：`sim/services/dataMaps.test.ts`（`Σ XVAL == totals.landValue`；覆盖图案值表；主次序 = `halfIndex`；`XROG` 稳态 128）、`traffic.test.ts`（衰减后 `Σ XTRF == MISC 0x0030`；之后 `addTraffic(w)` 恰增 `w`；分母为 0 时 `graph == total`）、`microsim.test.ts`（140 槽上限；共享记录不占槽；拆除释放）、`milestones.test.ts`（严格大于、每月一级、`normalPop` 不含 arco）、`status.test.ts`（诉求链顺序）。

#### WP8 economy + scenario

- 目标 `[v1]`：`settleMonth`（税收 / 法令 / 经费 / 利息 / 历史块 / `ytd` 入 `priv`）、`charge / canAfford`、债券发行 / 偿还（评级简化：fed + 张数 + 评级表）、`budgetView / bondView`（纯函数）、`closeYear`、`budgetWindow`（`modal budget` + `suspend`）、`graphs`（`XGRP` 推送三档节奏）、Hard 开局债券、`nationalAnnual.economy`（fed rate 随机游走）、`setTax / setIndustryTax / setFunding / setOrdinance / issueBond / repayBond / setOption / cheat` 命令（`setSpeed` 归 core；`cheat` 的起火副作用只写 `state.disaster.pending = DisasterKind.Fire`）、`costOf`、**`economy.industryTax` 唯一 owner**（`setIndustryTax` 写；`exportTo` 写 `MISC 0x016C+44..` 的 11 项税率、`importFrom` 读回；zones 的产业曲线直接读它，`IndustryState` 已无 `tax`）、`onModalAnswer(budget)`。`[v2]`：法令金额全表位序校验、信用评级全式、弹劾与观察模式、情景加载 / 评估 / 写回（`scenario` 阶段、`ScenarioState` 入 `priv`）、`taxGripe / underfunded`、`solvency` 月检开关。
- 依赖契约：实现 `Queries.economy`、`Actions.charge`、阶段 `settleMonth / closeYear / nationalAnnual.economy / budgetWindow / graphs / scenario / solvency`；消费 `state.census`、`q.services.structureCounts/graphCurrent`、`q.transport.roadTileCounts`、`counts`。
- 验收：`sim/economy/settle.test.ts`（`splitMonthly` 之和 = 年额；Hard 开局债券；法令向下取整；税基用 `census.taxable*`）、`bonds.test.ts`（50 张 25% 无溢出；偿还最早；预览不消费 PRNG）、`budgetWindow.test.ts`（`autoBudget` 不挂起但发 `yearClosed`；挂起后 `modalClosed` 续跑且不重跑）、`graphs.test.ts`（半年 / 五年对齐点）、`registry` 子测试：`ORDINANCES[].demand` 与 zones 乘数一致（放 `sim/core/registry.test.ts`，WP8 提供表）。

#### WP9 art（程序化精灵）

- 目标 `[v1]`：`buildPalette()`、光栅原语、`isoBox`、地形 14 坡面 × 3 海拔带 × 4 变体、边缘岩壁、水面 21 形（静帧）、路网 / 铁路 / 电线 / 管线 15 片段 + 交叉件 + 隧道口、树 7 档、瓦砾 / 放射 / 小公园 / 分区底色 / 施工 / 废弃、参数化建筑骨架覆盖全部 ≥ 0x70、覆盖物 `OverlayId.NoPower / NoWater / PreviewOk / PreviewBad / CursorTile / Sign / Connection / TrafficLight / TrafficHeavy`、**灾害覆盖物静帧 `OverlayId.Fire / Flood / Toxic / Riot`**（各 1 帧，v2 补帧）、**角色静帧 `ActorId.Tornado / Monster / Explosion / DeployPolice / DeployFire`**（8 朝向可共用一张）、`EdgeWallL/R × levels 1..31`、**桥件 v1 子集** `0x57/0x58`（堤道墩 / 面）、`0x5A/0x5B`（铁路桥）、`0x5C`（高架电线，翻转族按 `drawFlip` 镜像）、**地下视图** `genTerrainUnderground` 土色地表（`terrain` variant 0x80）与建筑格短管桩 `xund XUND_PIPE_STUB`（有水 / 无水两张）、UI 图标 24×24（`UiIconId` 全部固定项 + 54 个 v1 子工具项 + 15 个 Map 图层 + 12 天气 + 5 速度）、`genMinimapLut`、`ProceduralSpriteProvider`（`nativeScales = {S,M,L}`；所有 key 用 `OverlayId / ActorId / UiIconId / XUND_PIPE_STUB`，不自造编号）、`art/worker.ts`（生成 + transfer；`createProceduralProviderAsync(WorkerLike)`）。`[v2]`：逐 ID 配方表精修、其余桥件（开启桥 / 吊桥 / 高速桥）/ 匝道 / 高速、其余角色（飞机 / 直升机 / 船 / 帆船 / Nessie / 列车 / 军队）与多帧动画、循环色位图（水面高光、灯光、瀑布）、`art:sheet`。
- 依赖契约：实现 `SpriteProvider`；消费 `FOOTPRINT`、`IndexedBitmap`、`Palette`、`hashNoise`。
- 验收：`art/raster.test.ts`（菱形行宽规则 `2,6,…,W−2`；上-左边规则无缝）、`art/palette.test.ts`（256 项、循环组区间、分区 5/6/7 纯色）、`art/buildings.test.ts`（同 (zone, level) 候选 ID 的 (ramp, silhouette) 组合两两不同；tier 0/1/2 的 `i0` 单调递增；组间亮度差 ≥ 阈值；画布尺寸 = `§3.2.3` 表；锚点 = `(W/2, H)`）、`art/snapshot.test.ts`（全部生成函数 FNV 哈希快照）、`art/provider.test.ts`（`has` 只回答原生档；`frameCount ≥ 1`；**表驱动：v1 必备 key 集合——`OverlayId` 全部 24 项、`ActorId` 五种静帧、`xund 0x00..0x23`、`xbld 0x01..0xFF`、`terrain` 0..13 × 3 带 × 4 变体 + 地下变体、`water` 0..20——在 S/M/L 全部 `has == true`**）。

#### WP10 render-scene

- 目标 `[v1]`：`projection.ts`（`mapOrigin`；`worldToScreen` 返回旋转后顶点 c00'；`SceneItem.x/y` = 锚格底顶点 c11' = 顶点 + `[0, tileH]`；`ZOOM_TABLE` 应用）、`compiler.ts`（`compileTile / compileAll`，`zKeyOf`，`renderAnchor`，边缘岩壁 `{ overlay, EdgeWallL|R, variant: levels }`，`show` 开关，**`Marker` 项真实现**（`snap.markers[i]` → `markerOverlayId`，`frame` 由 `animTick` 派生），车流阈值 → `TrafficLight | TrafficHeavy`，ZoneTint → `zoneOverlayId`，标牌 `Sign / Connection` 登记回调，**地下分支**：土色地表（`terrain` variant 0x80）+ `xund` 项 + `PIPED` 建筑格短管桩 `xund XUND_PIPE_STUB`、不出 `Structure`）、`picking.ts`（31→0 级逆投影 + 四边形测试）、`camera.ts`（中心 ↔ 原点换算、可见带区间）、`minimap.ts`（`MAP_LAYER_MODES` 15 种图层 LUT → `Uint8ClampedArray`）、`cpu/compositor.ts`（`render / toRgba`，`rect` 在地图像素系）、`cpu/png.ts`（无依赖 PNG 编码器，zlib store 或静态 Huffman）、`thumbnail` 的纯函数部分（XS 全图 + 盒式降采样）。`[v2]`：热力叠加项、`Actor` 项从 `things()` 直接编译（v1 角色走 `RendererApi.setActors`）、短管桩朝向变体。
- 依赖契约：`rotation / footprint / net / render / dirty`；消费 `SpriteProvider`（测试用 `BUILTIN_PROCEDURAL_STUB` 与 WP9 的 provider——WP9 未就绪时用桩，像素快照以桩 provider 的几何为准）。
- 验收：`render/scene/compiler.test.ts`（每格 ≤ 5 项；`zKey` 单调随 depth；多格建筑只在 `renderAnchor` 格出项且四个旋转各自正确；1×1 走 `Ground`；边缘岩壁只在旋转后 `rx==127||ry==127` 且 `variant == alt`；`markers[i] = Fire` 出且只出一个 `OverlayId.Fire` 项、无标记不出项；`underground` 时建筑格只出短管桩；所有项 `y == worldToScreen(锚格).y + tileH`；局部性：改一格只产生该格与锚格 diff）、`projection.test.ts`（`mapOrigin` 使 (0,0)@31 顶点 `y == 0`、(0,127) 左顶点 `x == 0`，四个旋转 × 五档）、`picking.test.ts`（以地块中心 `worldToScreen(t) + [0, tileH/2]` 为输入 `pick == t` 全图往返，四个旋转 × 三档；顶点 / 共享边不作断言；高楼上半部不命中）、`cpu/compositor.test.ts`（`spec:ui-art §3.3` 旋转用例三帧快照；`§2.9.3 (a)(b)(c)` 翻转用例；相邻平地无 1 px 缝；多格锚点；边缘岩壁）、`cpu/png.test.ts`（解码器往返：用 Node `zlib.inflateSync` 校验）、`minimap.test.ts`（每种模式非全零、尺寸 128²）。

#### WP11 render-pixi

- 目标 `[v1]`：`backend.ts`（`PIXI_INIT_OPTIONS`、`stage.eventMode='none'`、整数 `backingScale`、`RendererApi` 全部方法）、`atlas.ts`（2048² 页、shelf 打包、调色板 LUT 烘焙——procedural 与 `PAL_MSTR` 同一路径、回退链、句柄缓存、`vramBytes` 统计）、`bands.ts`（16 条 `isRenderGroup` 带、`zKey` 二分插入、`SpriteHandle` 池、带可见区间、`bandRebuilds` 统计）、脏更新（`takeChanges` → 重编译格 → diff）、**`undergroundRoot`**（与 `groundRoot` 共用 `bands / atlas / 脏更新` 代码，只是 `compileTile` 走 underground 分支；`ViewState.underground` 切换两组根的 `visible`，首次切换懒构建）、`previewLayer`、断电图标 `visible` 闪烁（1 fps）、S/M/L 三档切换（全量重编译）、**`setProvider(primary, fallback)` 热切换**（= 释放图集页 + 清句柄缓存 + 复用换档的全量重建路径，≈ 50 ms）、**最简 `setActors`**（静帧、无插值：`air=false` 的角色按 `depth` 插带、`air=true` 进 `airLayer`；每帧只改 `x/y`，深度键跨带才重排；`ActorSprite.key` 直接给 provider）、`labels.ts`（DOM 标牌层按 `worldToScreen + [0, tileH]` + 相机偏移重排）、`minimap()`、`thumbnail()`（调 WP10 纯函数）、`stats()`、`render/index.ts`（`createRenderer / sceneCompiler / cpuCompositor`，按 `CONTRACTS.md §V`）。`[v2]`：`heatOverlay`、`animPage.ts`（子页脏上传、稳定句柄、循环色）、`AnimationClock`、角色插值与 `actor` 事件驱动的生命周期、XS/XL 派生档（`worldRoot.scale`）、`goto` 平滑。
- 依赖契约：实现 `RendererApi`；消费 `SceneCompiler / CpuCompositor`（WP10；未就绪时 `render/index.ts` 的转发桩先返回 WP0 的最小编译器）、`RenderSource`、`SpriteProvider`、`ViewState`。
- 验收：`render/pixi/atlas.test.ts`（在 Pixi 的无 WebGL 环境 / mock `TextureSource` 下：页打包不重叠、句柄对 (key, scale) 稳定、回退链顺序）、`render/pixi/bands.test.ts`（二分插入保持 `zKey` 有序；`bandOf` 分带；单格更新只触碰 ≤ 2 带；平移不触发重分配；地下根与地面根 `visible` 互斥；`setActors` 的地面角色落在 `bandOf(depth)` 带、空中角色在 `airLayer`）、`render/pixi/provider.test.ts`（`setProvider` 后旧句柄全部失效、`vramBytes` 先回落再上升、`has` 为 false 的 key 走回退链到 procedural）、`e2e/smoke.spec.ts` 的渲染断言（由 WP12 编写、WP11 负责通过）：静态场景 `stats().drawCalls ≤ 48`、全量重建 ≤ 60 ms、`vramBytes ≤ 128 MB`、按 `]` 旋转与 `+` 缩放后截图哈希变化、无 console error；WP11 第一天的 4 万精灵基准结果写入 `docs/open-questions.md`（R1 退路决策依据）。

#### WP12 shell（ui + app + audio + e2e）

- 目标 `[v1]`：`ui/dom.ts`（`h()` / `Store`）、`theme.css`（CSS 变量斜面窗口）、`MenuBar`（File / Speed / Options / **Disasters（`DISASTER_MENU` 8 项 + No Disasters；`V1_DISASTERS` 之外灰掉）** / Windows / Newspaper / Help）、浮动 `Toolbar` + 子工具条（按 `V1_TOOL_IDS` 显示，`availability` 置灰）+ RCI 指示器（读 `state.demand`）、`StatusBar`（天气图标 / **灾害模式红色 goto 箭头**（点击循环 `q.disasters.focusPoints()` 并 `renderer.goto`）、消息、日期、资金、诉求行）、`WindowManager / ModalHost`（两条模态路径；`budget / gameOver / disasterAlert / newspaper / extraPaper / teamPick / bridgeType / neighborConnect`）、`ToolController` 十模式 + 统一 PointerEvent + 键盘表 + **触控子集**（多指追踪 ≈ 150 行：Click / Place / Query 工具下单指拖动 = 平移、双指平移、捏合累计比例跨 1.5 进一档 / 0.67 退一档（10% 滞回）并在松手后吸附整数档、长按 500 ms = Query、双击放大一档并居中）+ **选中 `water.pipes`（`ToolDef.undergroundView`）时 `ViewState.underground = true`、切换到其他工具时退出**、窗口（`WindowId`）：NewCity / Budget（简版：税率 + 11 滑块 + 现金流 + 自动预算 + **"法令""债券"两个明细按钮**）/ **Ordinances**（20 个复选框按 5 组排列，勾选派发 `setOrdinance`；YTD / 年末估计列 v2）/ **Bonds**（列表 + 当前数 / 平均利率 / 下一张利率 / 评级 + 发行 / 偿还按钮；数据 `q.economy.bondView()`，按钮派发 `issueBond / repayBond`；两窗合计 ≈ 200 行）/ Map（2D canvas `ImageData`）/ **Graphs**（16 条序列复选框 + 颜色图例、`1 yr / 10 yr / 100 yr` 三选一、2D canvas 折线 12 / 20 / 20 点；直接读 `state.xgrp`，≈ 150 行）/ **Neighbors**（只读：中央本城名 + 人口，四角四个 `state.neighbors` 的名 + 人口，各边 `connections` 计数；≈ 80 行）/ **Newspaper**（报头 / 日期 / 头条 / 2 条正文 / 天气栏；数据 `q.news.currentPaper()`，文案 `news.<NewsType>.headline / .body`；`newspaper / extraPaper` 两个模态与 Windows 菜单复用同一组件）/ Query（`anchorOf` 整栋 + `queryStats / plantAt / stationAt`）/ Save-Load / GameOver、`ui/index.ts`（`mountShell(ShellOptions): ShellHandle`）、`app/boot.ts`（标题页、`wire` 装配、`mountShell`、`RenderSource` 构造、`EventBus` 扇出：`goto → renderer.goto`、`sound → AudioSink`、`modal → ModalHost`、`toolbar / techInvented → 可用性刷新`、`paper → Newspaper`、`disasterStarted → 状态栏箭头 + autoGoto`、每帧 `renderer.setActors(q.disasters.things() 映射为 ActorSprite)`；DEV 或 `?debug` 下 `window.__sc2k = { host, renderer, shell, version }`）、`app/loop.ts`（RAF：`host.advance(dt, performance.now, { budgetMs: 6 })` → `renderer.frame` → UI 节流刷新）、`app/session.ts`（新城 / 读档 / 存档 / 导出 `.SC2` / 自动存档 `.sc2kweb`；接入 WP14 的 `createAssetStore / createAssetImporter`，`onProviderReady → renderer.setProvider(dat, procedural)`）、`app/savesLite.ts`（IndexedDB `saves` 最小实现，`SaveStore`，默认 `kind='sc2'`，缩略图经 `renderer.thumbnail`；WP14 合入后由其 `AssetStore` 接管）、`audio/`（`AudioSink` 静默实现 + 事件映射）、`e2e/smoke.spec.ts`、`e2e/hash.spec.ts`。`[v2]`：Population / Industries / Scenario ×3 窗口、Ordinances 的 YTD / 估计列、Newspaper 全版面（广告 / 问答 / 多份报纸）、双指旋转 / 三指切地下 / 窄屏布局、键盘全表、WebAudio 合成音与音乐、开发者面板（phase p95 / `stats()` / 19 项灾害触发）。
- 依赖契约：消费 `SimHost`、`Command / CommandResult / SimEvent`、`Queries`（含 `news / disasters`）、`RendererApi`、`CatalogueApi`、`Strings`、`AudioSink`、`SaveStore`、`AssetImporter`、`V1_TOOL_IDS`、`DISASTER_MENU / V1_DISASTERS`、`ShellOptions / ShellHandle / WindowId / Sc2kDebugHandle`。
- 验收：`ui/tools/toolController.test.ts`（happy-dom：十模式转移、Line 轴向实时切换、Rect 预览、`Esc` 语义栈、费用预览不消费 PRNG——以 `prng.state()` 前后相等断言；**双指捏合累计 1.6 → 升一档且松手吸附整数档、单指拖动在 Place 工具下平移而非放置、长按 500 ms 触发 Query、选中管线工具自动 `underground` 且切回道路工具退出**）、`ui/windows/modalHost.test.ts`（两条路径的 `modalOpened/Closed` 计数；挂起型模态关闭后时钟恢复）、`ui/windows/windows.test.ts`（happy-dom：Graphs 对 `xgrp` 画 12 / 20 / 20 点；Ordinances 勾选派发 `setOrdinance`；Bonds 发行派发 `issueBond`；Newspaper 渲染 `currentPaper()`；Neighbors 四角与连接数）、`app/loop.test.ts`（预算参数传递；暂停不推进）、`e2e/smoke.spec.ts`（标题页 → 新城 → 放电厂 / 电线 / 分区 / 道路 / 水泵 / 管线 / 火车站 / 医院 → Cheetah 24 个月 → Query 火车站与医院各一次有数据 → Disasters → Fire → 等待 `disasterEnded` 与号外 → 截图；canvas 非单色；资金变化；无 console error；载入 `writeSc2` 生成的夹具；`stats()` 门禁）、`e2e/hash.spec.ts`（浏览器经 `window.__sc2k.host` 跑 5 年 `hash('full')` 与 Node `headless` 一致——基线在列车 #2 后建立）。

#### WP13 events（第一波 `[v1]` 切片 + 第二波 `[v2]`）

- owner：`[v1]` 由 WP10+WP11 合并为一人后释放出的成员（J）承担，T+1:30 起与第一波并行；`[v2]` 由最早完工者接续。
- 目标 `[v1]`（≈ 1,100 行）：`weatherAndDisaster`（天气生成 `spec:disasters §2.4.3`、宽限期 `graceDays[difficulty]`、月概率随机判定、前置条件与权重抽样 `§2.3.3`；`emit weatherChanged`）、灾害模式 tick（`disasterTick`）与 IDLE / STARTING / ACTIVE / ENDING 状态机（`§3.3`；进入 / 退出 `CityMode.Disaster`，`emit modeChanged / disasterStarted / disasterEnded / goto`；**`state.disaster.pending` 的唯一消费入口**——`requestDisaster`、月随机判定、economy 的 `cheat` 都只写 `pending`，`thingsTick` 在两种模式下轮询它）、`marker` 层（`priv`：`marker / fuel / riotLife / floodFront`）与 `marker(i) / markers() / focusPoints()` 查询、`Actions.destroyStructure` 真实现（整栋 → 瓦砾 `0x01..0x04` + 角标清 + 分区保留 + `freeMicrosim` + 电厂爆炸 + 次生火；核电放射 v2）、**五种灾害**：Fire（点燃 / 蔓延 / 扑灭 / 燃尽，`§2.6.1`）、Flood（GROW / HOLD / RECEDE，`§2.6.2`）、Tornado（边缘生成 / 路径抖动 / 毁坏，位置经 `things()` 以单个 `ThingView` 暴露，`§2.6.4`）、Earthquake（一次性结算 + 次生火，`§2.6.5`）、Monster（寻路 / 踩踏 / 点火；军队驱离 v2，`§2.6.6`）、`requestDisaster` 命令（`V1_DISASTERS` 五种；Air Crash / Hurricane / Rioters 返回 `notImplemented`）+ `disasterAlert` 模态（`suspend`）+ `onModalAnswer`、警 / 消 `dispatch` 命令与 `dispatchAvailable`（军队 v2；单位 = `priv` 中 `{kind,x,y,life}` 列表，经 `things()` 以 `ActorId.DeployPolice / DeployFire` 暴露，3×3 保护区）、**`techCheck`**（新城 `init` 的 `rollInventions`：`invented[i] = base + int(20)`、`< startYear` 写 0；每年 1 月遍历 `year ≥ invented[i]` 且未公告 → `emit techInvented` + `emit toolbar{reason:'tech'}` + `act.news(Invention | Innovation, i)`；`TechQuery.invented`）、**报纸最小版**：事件池 `news(type, value)` 入池 / 每月衰减 / 冷却（`§2.10.2` 的 power / decay / cooldown 表整表落 `tuning`），v1 必含 ≈ 20 类——`Founding / Growth / Invention / Innovation / DisasterFire / DisasterFlood / DisasterTornado / DisasterEarthquake / DisasterMonster / HighCrime / HighTraffic / HighPollution / PoorEducation / PoorHealth / PoorEmployment / DemandPower / DemandTransit / DemandPolice / DemandFire / DemandWater`（`Demand*` 由 services 的诉求链经 `act.news` 转发；6 类月检在 `news` 阶段评估）；订阅版：`news` 阶段在 `month ∈ {2, 6}`（4 月 / 8 月第 0 天之前的最后一个阶段，等价于 4/1、8/1 送达）组版 → `emit paper{extra:false}` + `modal newspaper` + `suspend`；号外：`disasterEnded` 时组版 → `emit paper{extra:true}` + `modal extraPaper`；`paperDelivery / extraPaper` 选项关闭时只发事件不挂起；`NewsQuery.currentPaper / stories`；`exportTo / importFrom`：`XTXT` 标记合成 / 剥离 + `xtxtShadow` 侧表（否则灾害中导出会丢微模拟标签）；`postLoad('sc2')` 由 `MISC 0x0070 / 0x1040 / 0x1048` 恢复状态机。文本：≤ 20 条原创骨架模板由 WP0 预置在 `strings.*.ts`（键 `news.<NewsType>.headline / .body`），WP13 经 RFC 追加。`[v2]`：常驻物件系统全量（`thingsTick` 的飞机 / 直升机 / 船 / 帆船 / Nessie / 列车、`XTHG` 读写、槽位驱逐）、Air Crash / Hurricane / Rioters 菜单项、情景灾害（火山 / 火风暴 / 毒云 / 大暴乱 / 大洪水 / 污染）、Meltdown / Microwave 与放射、Maxis Man、军队调度、报纸全部 67 类与多份报纸、顾问选取、`approvalSurvey` 联动的 `Opinion*`。
- 依赖契约：实现 `Actions.destroyStructure / news`、`Queries.tech / disasters / news`、阶段 `techCheck / weatherAndDisaster / news`、`disasterTick / thingsTick`、命令 `requestDisaster / dispatch`、`onModalAnswer(disasterAlert | newspaper | extraPaper)`；消费 `q.services.cityCenter / structureCounts / graphCurrent`、`q.terrain`、`q.transport.stationAt`、`act.setXbld / setXzon / layerChanged / emit / freeMicrosim`、`state.census / demographics / totals / weather`、`DisasterKind / NewsType / TileMarker`。
- 验收 `[v1]`：`sim/events/fire.test.ts`（警局点火 → 蔓延受 `XFIR` 抑制 → 扑灭 → 标签与 `XMIC` 绑定不变；燃尽 → 瓦砾 + 角标清 + 分区保留）、`flood.test.ts`（GROW 不越过 `floodAlt+1`；RECEDE 后标记清零；被淹建筑毁、道路留）、`quake.test.ts`（`magnitude` 范围；一次性结算后进入火灾流程）、`tornado.test.ts` / `monster.test.ts`（出界或 `life==0` 结束；`things()` 恰 1 项）、`stateMachine.test.ts`（`requestDisaster` → `modeChanged(Disaster)` → `disasterEnded` → `modeChanged(City)`；`noDisasters` 只禁随机；宽限期内无随机灾害；`cheat` 写 `pending` 后下一 `thingsTick` 启动；`requestDisaster(Hurricane)` → `notImplemented`）、`dispatch.test.ts`（无警局 → `noTarget`；3×3 保护区内火不蔓延）、`weather.test.ts`（权重行和 = 100、非海岸图无 Hurricane）、`tech.test.ts`（发明年 ∈ [base, base+19]、2050 开局槽位 0、公告写 0、`toolbar` 事件恰一次）、`news.test.ts`（冷却、衰减、`month ∈ {2,6}` 订阅版挂起、灾害号外、`extraPaper` 选项关闭不挂起、`currentPaper` 头条 = 最高 power）、`shadow.test.ts`（灾害中快照与 `.SC2` 往返 `xtxt / marker` 逐字节相等；200 个带标签格侧表截断后微模拟标签全恢复）。`[v2]`：`things.test.ts`（列车三槽原子、驱逐优先级、槽 39 预留、空难按需起飞）。

#### WP14 assets（DAT 导入：第一波 `[v1]` 最小链 + 第二波 `[v2]`）

- owner：`[v1]` 默认由 WP9 owner（H）在 art `[v1]` 切片合并后（≈ T+5）承担——`DatSpriteProvider` 与 procedural provider 共用 `SpriteKey / IndexedBitmap / 锚点` 约定，是同一类知识；T+4 列车按进度可改派最早完工者。`[v2]` 由最早完工者接续。
- 目标 `[v1]`（≈ 600 行）：`sprites/`（`parseSpriteArchive / decodeSprite`，`duplicatePolicy` 默认 `'first'`；`IdLayout`：键 `${kind}:${id}` → DAT 精灵号，`xbld` 直接按号、`terrain` 256+nibble、`water` 270+shape、`overlay / actor` 按 `OverlayId / ActorId` 查表，缺项即 `has → false` 走回退链）、`palette/readPaletteBmp`（`PAL_MSTR.BMP` → `Palette.rgba`；`cycles` v1 为空）、`import/identify.ts`（魔数表；名字不符按魔数）、`DatSpriteProvider`（静态、无色循环、`nativeScales = {XS,S,M}`、锚点 `(w/2, h−1)`、`opaque` 掩码、`frameCount → 1`）、最小导入入口 `createAssetImporter(store, sc2).mount(el)`：`<input type="file" multiple>` + 识别结果 / 诊断列表 + "使用原版美术"开关（挂在 Title 页与 File 菜单，经 `ShellOptions.importer`；`onProviderReady → renderer.setProvider(dat, procedural)`）、IndexedDB `AssetStore`（`files / decoded / saves / meta`；接管 WP12 `savesLite` 的 `SaveStore`，接口不变）、`worker.ts` 解码（`transfer`）、`DECODER_VERSION` 失效、`io/assets/index.ts`（`createAssetStore / createAssetImporter`）。`[v2]`：目录授权（File System Access，`handles`）/ 拖放 / 自带完整面板 / 色循环 `cycledIndex` 与 `cycling` 判定 / `SPECIAL` 覆盖 `SMALLMED` / 文本库 `readNewsData` / `MIF` / `estimate` 与配额提示。
- 依赖契约：实现 `SpriteProvider`（dat）、`AssetStore`、`AssetImporter`；消费 `IndexedBitmap`、`Palette`、`Sc2Codec`（打开 `.SC2`）、`OverlayId / ActorId`、`WorkerLike`。
- 验收 `[v1]`：`io/assets/sprites/decode.test.ts`（`spec:file-formats §3.5.4` 三个手工夹具：默认取先出现者、`'last'` 策略、`allowUnpaddedOddRuns`）、`sprites/provider.test.ts`（锚点 `(w/2, h−1)`；`has` 只回答 XS/S/M；缺 key 回 null；`idLayout` 对 `overlay:${OverlayId.Fire}` 等有映射；合成夹具 DAT——由 `tools/` 用本项目格式写出的原创样本，非原版文件——解码后 `bitmap` 非空）、`import/identify.test.ts`（魔数表；名字不符按魔数）、`import/store.test.ts`（fake-indexeddb：缓存命中、`DECODER_VERSION` 失效、`clearAll`）、`import/privacy.test.ts`（ESLint 规则存在且目录内无网络 API 引用的 grep 断言）。`[v2]`：`palette/cycle.test.ts`（E/F/G 反向、慢速对交换）。

---

## 3. 共享文件归属

| 文件 | owner | 说明 |
|---|---|---|
| `package.json`、`pnpm-lock.yaml`、`tsconfig*.json`、`vite.config.ts`、`index.html` | WP0 / Lead | 日内禁止新增依赖；需要则 RFC |
| 根 `eslint.config.js` | WP0 / Lead | 只追加 `packages/sc2k` 段 |
| `src/app/wire.ts` | Lead | 只改 `WIRE_STUB_ALLOWLIST` |
| 各目录 `index.ts` | WP0 创建 → 冻结后归目录 owner | owner 重写为真实出口；导出名与签名 = `CONTRACTS.md §V`（`contracts/entrypoints.ts`），不得增删改名 |
| `src/contracts/**`、`src/data/**` | 冻结；Lead 经 RFC 加法修改 | |
| `src/testkit/**` | WP0（前四文件）/ WP1（其余） | 其他 WP 需要新桩默认值走 RFC |
| `src/app/patches/**` | Lead | 集成期逃生口，每个文件写到期条件 |
| `docs/**` | Lead | WP 在 `docs/open-questions.md` 追加问题（append-only） |

---

## 4. Lead 减负阀与掉线预案

1. `src/data/**` 由 `tools/gen-catalogue.ts` 机械生成（≈ 30 分钟），不手抄。
2. `goldenMiniCity / runDays / pngOf / headless` 在 T+3 而非 T+1:30 交付；T+1:30 的 `wire.test` 只用 25 天桩推进。
3. T+4 列车若 Lead 落后：`io/snapshot` 的 gzip 与 `hash-compare.ts` 交最早完工者；`tools/headless.ts` 可交 WP10（最小 WP）。
4. WP4 若 T+4 落后，**只允许**推迟水塔二值蓄水、净水厂充足标志、淡化厂与 `unwateredBuildingTiles` 诊断；`waterScan` 两遍 BFS、水泵、管线放置（含 `XUND 0x1F/0x20` 交叉与水泵自动管线）为 v1 必达——供水网络、`watered` 查询、地价 +4、Map 水层、`needWater` 诉求都依赖它——落后时由 Lead 接盘 WP4 的 v1 切片而非降级（`ARCHITECTURE.md` §12 R5）。
5. 任一 WP 掉线：其桩保持 `realistic` 档继续在 `stubAllowlist`，不阻塞他人；Lead 在 T+7 决定是否接盘其 v1 切片。
6. 跨模块修补：先在对方分支提 patch；对方不在线则 `app/patches/<id>.ts` 适配层，次日移回。

---

## 5. 契约变更协议（日内）

只允许加法；流程与命名见 `CONTRACTS.md` §Z。Lead 30 分钟 SLA；等待期间 WP 用局部类型先行。已知最可能的 RFC：`SoundId` 扩展、`ModalId` 新增、`news.<NewsType>` 文案键追加、`PRIV_BUDGET_BYTES.events` 调整。（`System.endOfDay` + `END_OF_DAY_IO` 已在冻结前进入契约：zones 的逐日计时器与 utilities 的日末即时重扫都走它，不再需要 `dailyTick` / `flush()` RFC。）

---

## 6. 集成顺序、合并列车与 v2 清单

### 6.1 合并顺序（每趟列车）

WP0 → WP1 → WP2（codec 先）→ WP4 → WP6 → WP3 → WP7 → WP8 → WP5 → WP13 `[v1]` → WP9 → WP10 → WP11 → WP14 `[v1]` → WP12 →（第二波）WP13 / WP14 `[v2]`。理由：core 与 codec 是所有往返测试的前提；utilities / transport 是 zones 验收的真查询；placement 依赖 `pieceFor / bridgePieces`；services 的 `allocMicrosim` 被 placement 调用；economy 的 `charge` 被所有放置调用；events 依赖 services 的 `cityCenter` 与 zones 的 `census`，故在 WP5 之后；渲染在 sim 之后；assets 依赖 WP11 的 `setProvider`；shell 最后把一切接起来。每合入一个真系统，`WIRE_STUB_ALLOWLIST` 删去一项。

### 6.2 列车检查项

| 列车 | 检查 |
|---|---|
| #1（T+4） | 并集 `lint / typecheck / test` 全绿；`registry.test` 全部真系统通过；每个已合并 WP 的双桩验收通过 |
| #2（T+7） | 以上 + `golden-mini-city` 真命令脚本 24 个月出建筑、资金变化、Query 火车站 / 医院各一次有数据；`noPower` 反例不长；Disasters → Fire 触发并 `disasterEnded`（含号外）；`smoke.spec` 或 `headless --thumbnail` 出图；建立哈希基线（`determinism` 与 `hash.spec` 的期望值） |
| #3（T+10） | 以上 + 50 年长跑不变量 + Node/浏览器 5 年哈希一致 + `SC2K_STRICT_WIRE=1`（`WIRE_STUB_ALLOWLIST = []`）+ `exportCity` 往返 + `stats()` 门禁 + `strings:scan` + 导入合成 DAT 夹具后 `setProvider` 截图哈希变化 + 截图入 CI artifact → 打标 `v1-playable` |

### 6.3 v2 清单（打标时由 Lead 建 issue，标签 `[v2:<wp>]`）

`[v2:WP1]` 自动存档策略、快照 gzip、命令日志导出 · `[v2:WP2]` 溪流 / 海平面 / Stretch·Forest / 桥隧自动改地形 / 情景 chunk · `[v2:WP3]` NIMBY / 隧道 / 港口分区 / 桥自动改地形 · `[v2:WP4]` 电厂寿命与年度更新 / `plantAt` / 水塔二值 / 净水充足 / 淡化 / `unwateredBuildingTiles` · `[v2:WP5]` 11 产业 / 国家经济 / 教堂 / 迟滞 · `[v2:WP6]` 开启桥 / 吊桥 / 高速桥 / `bridgeBlocksShips` / 高速 / 匝道 / 隧道 / 2×2 车站 / 地铁换乘 / 衰败开关 / 列车谓词 · `[v2:WP7]` 人口学全量 / 年度微模拟 / 支持率 / 军事基地 / Arcology / 港口机场生长 · `[v2:WP8]` 法令全表 / 评级 / 弹劾 / 情景 · `[v2:WP9]` 逐 ID 配方 / 其余桥件与角色 / 多帧 / 循环位图 · `[v2:WP10]` Actor 项 / 热力项 · `[v2:WP11]` 热力叠加 / `animPage` 与色循环 / `AnimationClock` / 角色插值 / XS·XL / `goto` 平滑 · `[v2:WP12]` Population / Industries / 情景窗口 / Ordinances YTD 列 / 报纸全版面 / 双指旋转·三指·窄屏 / 键盘全表 / WebAudio / 开发者面板 · `[v2:WP13]` 常驻物件 / Air Crash·Hurricane·Rioters / 情景灾害 / 放射 / 军队 / 报纸 67 类 / 顾问 · `[v2:WP14]` 目录授权 / 拖放 / 完整面板 / 色循环 / `SPECIAL` 覆盖 / 文本库。

---

## 7. 集成后验证清单（合并列车 #3 / 每次合入 `sc2k/main`）

1. `pnpm lint`（含 `strings:scan`、依赖方向、确定性规则）。
2. `pnpm typecheck`（`tsconfig.json` + `tsconfig.sim.json`，两套都绿）。
3. `pnpm test`（根 vitest；含契约一致、确定性、往返、像素快照、双桩验收）。
4. `pnpm --filter sc2k headless -- --years 50 --script golden-mini-city --out ci/longrun.json`：不变量全通过；`phaseMsP95` 与 `ARCHITECTURE.md` §11 对照（记录，不断言精确值）；`--variant noPower` 24 个月零施工。
5. `pnpm --filter sc2k hash:compare -- --years 50 --seed 12345`：双跑逐年哈希一致。
6. `pnpm --filter sc2k e2e`（或 `SC2K_E2E=skip` 时的 `headless --thumbnail` 替代）：smoke 截图、`stats()` 门禁（draw call ≤ 48、重建 ≤ 60 ms、VRAM ≤ 128 MB）、`hash.spec` Node vs 浏览器一致、载入 `writeSc2` 夹具。
7. `SC2K_STRICT_WIRE=1 pnpm --filter sc2k test -- wire`：`WIRE_STUB_ALLOWLIST = []`，没有任何桩残留；各目录 `index.ts` `satisfies` `entrypoints.ts`。
8. `exportCity` 往返：`golden-mini-city` 跑 3 年 → `exportSc2()` → `importSc2()` → `hash('sc2')` 相同；`exportSc2({compat:true})` 零区为零。
9. 人工：Playwright 截图 / 缩略图目视（建筑有多样性、旋转四向、断电图标、地下视图管线、Map 窗口四图层、一次火灾与号外、Graphs / Ordinances / Bonds / Neighbors 窗口、导入合成 DAT 后画面切换、触屏单指平移与捏合）；`docs/open-questions.md` 更新；v2 issue 建立。
