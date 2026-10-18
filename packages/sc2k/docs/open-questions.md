# 开放问题（汇总）

> 来源：`ARCHITECTURE.md` §14、各 `docs/spec/*.md` 的"待确认问题"、实现期发现。每条给出：当前裁定（代码里的默认值 / 开关位置）、影响面、验证手段。打标 `v1-playable` 时逐条复核。

| # | 问题 | 当前裁定（默认值 / 开关） | 影响面 | 验证手段 / 来源 | 状态 |
|---|---|---|---|---|---|
| 1 | 车站占地 2×2 还是 1×1 | `stationFootprint` 可调，默认 2×2（spec:transport §2.9.1） | transport / placement / UI | 原版存档实测 | 开放 |
| 2 | `MISC 0x104C / 0x1018 / 0x1040` 语义 | 透传 `rawMisc`，不解释 | io / events | 原版存档对照 | 开放 |
| 3 | DAT 重叠行位置（`DAT_OVERLAP_ROW`） | 常量可调 | io/assets | 导入实测 | 开放 |
| 4 | 色循环节拍 | `fastTick = 125 ms`，慢速每 8 个快 tick | render / art | 目测 | 开放 |
| 5 | Raise / Lower 费用口径（每格 / 每次） | 每改变格计费（`costUnit: 'changedTile'`） | terrain / economy | 原版实测 | 开放 |
| 6 | `destMask` 口径 | 按 spec:transport §2.12 | transport | — | 开放 |
| 7 | 交通总量口径 | 按 spec:transport §2.15 | services / economy | — | 开放 |
| 8 | 年龄队列三元组字段序 | `cohortOffset` 单点改（contracts/io.ts） | services / io | 原版存档对照 | 开放 |
| 9 | Pixi RenderGroup 静态成本实测 | WP11 第一天基准 | render | `stats().frameMs` | 开放 |
| 10 | WebGL 不可用时的降级 | v2 决定；WP0 的 `stubRenderer`（CpuCompositor → `<canvas>`）可作只读退路 | render / app | — | 开放 |

## WP0 遗留问题（Reconcile 阶段汇总）

> 下列各项在 WP0 收敛时未改代码（或只做了最小处理），由对应 WP 在接手时裁定；涉及契约的走 `contract-rfc.md`。

| # | 问题 | 当前裁定（默认值 / 位置） | 归属 | 验证手段 | 状态 |
|---|---|---|---|---|---|
| 11 | `hash:'sc2'` 标注的若干标量在 MISC 表中无明确落点（`clock.disasterTicks`、`rewards.mayorApproval`、`utilities.power.* / water.*`、`traffic.*`、`totals.*`、`weather.trend / season`、`disaster.windOverride / pointX / pointY`、`census.taxable* / tiles.*`、`economy.counters.*`、`national.*` 部分） | 仍按「其余 'sc2'」标注；桩下为 0 故往返测试通过。各 WP 写入这些字段后，若不写进 `.SC2`，必须把对应项翻成 `'full'`（`contracts/snapshot.ts` `SCALAR_FIELDS` 每项一处） | WP2 io/sc2、WP8 economy、WP4/5/6 | `sim/core/createSim.test` 的 `.SC2` 往返用例 + WP2 的 `roundtrip.test` | 部分处理（提交 1f032e2：clock.disasterTicks / totals.developedTiles / centerX / centerY / traffic.* / rewards.mayorApproval / disaster.pointX/Y / bonds[].issued* 翻 'full'；utilities.power/water、weather.trend/season、census.*、economy.counters.*、national.* 经金城 3 年 + 火灾 + 发债往返实测相等，仍标 'sc2'） |
| 12 | `core.init` 不写 `economy.difficulty`（归 economy），桩下新城 difficulty 恒为默认 1 | economy 的 `init` 须写 `p.difficulty` | WP8 | economy 测试 | 开放 |
| 13 | 匝道 `Flipped` 语义：`contracts/rotation.ts` 按「同一精灵水平镜像」实现（`DIR_MIRROR` / `onrampWorldOrient`），文档写「整体再转 90°」 | 镜像口径；若改为字面转 90°，只需改 `onrampWorldOrient` 的 Flipped 分支并更新 `rotation.test` 期望 | WP5 transport、WP10 render | `rotation.test` 8 组 (id, flip) 对应关系 | 待认可 |
| 14 | `hashNoise` 契约签名为三参数 `(seed, x, y)`，ARCHITECTURE §5.8 / spec:ui-art 有两参数写法 | art 侧统一传第三参数（例如 `hashNoise(variant, k, 0)`） | WP9 art | — | 开放 |
| 15 | 快捷键：`data/tools.ts` 按 spec:building-catalogue §2.11（`P` = 电线、`[ ]` = 升降地形），与 spec:ui-art §2.8（`P` = 暂停、`[ ]` = 旋转、`W` = 供水组）冲突；分组菜单键 `Shift+P/G/E/S/K` 未进 `ToolDef` | 以 `ToolDef.shortcut` 为工具键，全局键（暂停 / 旋转）由 UI 层另表定义，冲突时 UI 表优先 | WP13 ui | UI 快捷键测试 | 待裁定 |
| 16 | 车站微模拟类型号 17/18/19（公交 / 铁路 / 地铁）为推断（spec 只写「独占」） | `tools/gen-catalogue.ts` `STATION_MICROSIM` 单点改 | WP6 services | 原版存档对照 | 开放 |
| 17 | `complaint.*`、`query.*`、`news.<NewsType>.headline/.body` 的 strings 键名是 WP0 提出的约定（契约未定义具体键） | 以 `data/strings.zh.ts` 现有键为准；新增走 RFC | WP6 / WP12 / WP13 | `catalogue.test` 的键集合对账 | 开放 |
| 18 | `TransportQuery.bridgeOptions` 文档为「道路 5–6 + Raising、7–12 三种」，v1 只实现 Causeway，桩返回 `[Causeway]` | UI 按返回值渲染，不写死 | WP5 / WP13 | — | 开放 |
| 19 | 地图编辑模式工具（Stretch / 海平面 ± / Stream / Forest，spec:terrain §2.8）未列入 `data/tools.ts`（spec 未给 tool id） | 需要时在 RFC 中定 id 后加入（`availableIn: 'map'`） | WP3 terrain、WP13 ui | — | 开放 |
| 20 | 桥梁每端附加维护费（$0.10 / 端、$0.80 / 端）`BuildingDef` 无字段承载 | 只写每格基价；端费由 economy 自行按桥段统计 | WP8 | 维护费测试 | 开放 |
| 21 | `ctx.diag` 只在 `newCity` 清空，长跑时 `core.modalAnswerIgnored` 等 info 会累积 | 未封顶 | WP1 | 无头长跑内存曲线 | 开放 |
| 22 | `SnapshotEntryKind` 保留 `'u16'` 但当前无条目使用（ALTM 已拆三张 u8 层） | 保留 | WP1 | — | 备忘 |
| 23 | 根 `pnpm lint` 只跑 `eslint .`；黑名单扫描与产物漂移检查在 `pnpm --filter sc2k lint` | CI 需单独一步调用；或由 Lead 在根 `package.json` 串联 | Lead / CI | CI 配置 | 开放 |
| 24 | `SC2K_STRICT_WIRE`（打标前 `WIRE_STUB_ALLOWLIST` 必须为空）未实现：Vite 只透传 `VITE_*` 环境变量 | 留给 CI / `tools/headless.ts` 断言 `WIRE_STUB_ALLOWLIST.length === 0` | WP1 / WP12 | headless 退出码 | 已处理（`tools/headless.ts --strict-wire` / `SC2K_STRICT_WIRE=1` 断言 `WIRE_STUB_ALLOWLIST` 为空；现为 `[]`） |
| 25 | `createTestContext` 在改动夹具后调用一次 `postLoad(ctx, 'snapshot')` 让 `nullSystem` 重绑定；若桩改为注册时即可用，这一行可删 | 保留 | WP1 | `createSim.test` | 备忘 |
| 26 | `economy.funds` 桩下为 0（无人发起始资金），冒烟观感「资金: 0」 | 属 WP8，不是缺陷 | WP8 | e2e 截图 | 备忘 |
| 27 | `counts.zone` 由 `setXbld` 维护（已建 R/C/I 建筑格，spec:zones Q9 口径），不是 `setXzon` | core 口径；zones 的 census 全量重算须用同一口径 | WP4 zones | `tileWriter.test` 计数恒等 | 待认可 |
| 28 | 重放 / 哈希基线与物件 tick：`thingsTick / disasterTick` 按真实时间（`DISASTER_TICK_MS`）节奏跑，命令日志不含时间信息，`replayInto` / `runDays` / `headless` 一律 dt=0（不跑 tick）。v1 的 `thingsTick` 只消费 `disaster.pending` 启动灾害，所以"玩家在浏览器里触发灾害 → 重放"不可复现 | 重放与 headless 不跑 tick；events 若要可重放，把 `disaster.pending` 的消费挪到日边界（例如 `weatherAndDisaster` 阶段或 `endOfDay`），或由 core 把 tick 计数写进日志（v2） | WP13 events、WP1 | `determinism.test`（当前只覆盖无 tick 路径） | 部分处理（提交 184984c：replay / runDays / headless 按日边界约定跑 tick（pending → 一次物件 tick；灾害模式逐 tick 到结束），随机灾害与菜单灾害可重放且双跑一致；灾害进行中派发的命令时序仍不进日志 → v2） |
| 29 | 挂起态快照载入后的模态重开：`loadSnapshot` 把 `phaseCursor > 0` 的快照归一为 `modalPause = 1` 并记 `snapshot.suspended` 诊断，但原模态的 `id / payload` 不在快照里 | UI（session.ts）载入后若 `state.clock.phaseCursor > 0`：直接 `host.modalClosed()` 续跑，或按 `DAY_PHASES[age % 25][phaseCursor − 1]` 推断模态类型重开（budget / newspaper …） | WP12a session | `determinism.test` 挂起态快照用例 | 开放 |
| 30 | `advance` 的积压封顶：`planDays` 把折算后剩余的 `accumMs` 封顶为 `maxDaysPerFrame × MS_PER_DAY[speed]`（ARCHITECTURE §5.2 伪码只对"没跑完的天数"封顶），后台标签页回到前台最多补一帧硬顶而不是追几千天 | 已实现（`sim/core/advance.ts`），`accumMs` 不入哈希故不影响确定性 | WP1 | `advance.test` 硬顶用例 | 已裁定 |
| 31 | `ctx.diag` / `ctx.events` 封顶（#21 的落实）：`DEFAULT_CORE_TUNING.diagCap = 512`、`eventCap = 8192`，超出丢弃最旧并记一次 `core.eventOverflow`；可经 `CreateSimOptions.tuning.core` 覆盖 | 已实现（`sim/core/tuning.ts`） | WP1 | `longrun.test` 空城用例 | 已裁定 |
| 32 | 金城脚本（`testkit.goldenMiniCity`）的布局假设全平地、放置规则按 spec 最小集（水泵不邻水、车站邻铁路、医院靠 24 偏移可达）。真 placement / utilities / zones 合入后若某条命令被拒绝（`ok:false` 不入日志），集成烟测需按实际 `RejectReason` 调整坐标 | 坐标集中在 `GOLDEN_LAYOUT`，单点可改 | WP1 / 集成者 | `longrun.test`、`headless --script golden-mini-city` 的 `commandsDispatched` 应等于脚本条数 | 已处理（提交 184984c：分区带改为夹在电线与主路之间的 3 行、无头工具 newCity 后 flattenTerrain；`commandsDispatched` = 20 = 脚本条数） |
| 28 | 交通衰减：`XTRF -= XTRF >> 2` 对 1..3 永不衰减，与 spec:services §2.4 文字"值 1..3 衰减为 0"矛盾 | `trafficDecayMin = 1`（非零值至少减 1，3 → 2 → 1 → 0；设 0 即纯移位） | services / 道路轻重交通叠加 | 原版存档中是否残留小值 | 开放 |
| 29 | `XROG` 整数截断下 127 与 128 都是不动点：新城 0x7F 的格若人口从未变化永远停在 127（dfloer 的"新城默认 0x7F"），变化过的格收敛到 128 | 新城写 `xrogInitial = 0x7F`；显示阈值 `>0x82` 绿 / `<0x7D` 红不受影响 | services / 地图增长图 | — | 备忘 |
| 30 | `ServicesQuery.airportTiles` 语义契约未写明 | = 机场分区格数（`XZON & 0x0F == 8`），`onTilesChanged('zone')` 失效重数；`airportRunwayGroups = (跑道 + 跑道十字) / 5` | zones 需求 cap | — | 待认可 |
| 31 | 无水体时的海港诉求映射到哪种报纸类型（spec:disasters 表 #59 `needseaport(sic)` "无水体时的海港诉求" vs #60 `needconnections`） | `NewsType.DemandIndustrialConnection`（#59）+ 状态栏键 `complaint.connection` | services / events | — | 待认可 |
| 32 | 里程碑进度 4 的军事基地提案模态：v1 UI 窗口清单无 `militaryOffer` | `militaryOfferModal = false`：只 `emit militaryOffer`、不挂起、`MISC 0x0E4C` 保持 0（v2 实现选址后把默认改为 true） | services / ui | — | 开放 |
| 33 | 状态栏"恶劣天气"诉求（`complaint.weather`，weather ≥ 9）需要天气类型，契约 `WeatherState` 无该字段 | v1 不产出 `complaint.weather`；若 events 把天气类型放进 `WeatherState`（RFC）再接 | services / events | — | 开放 |
| 34 | `phaseApplies('facilityAnnual')` 为 `m === 0`，新城 age 0 当天也跑一次年度微模拟（写入逮捕 / 监狱加成等） | 按契约保留；测试里先推进 1 天再放设施 | services / core | — | 备忘 |
| 28 | Query 窗口的"车站 / 电厂 / 地块"附加面板依赖 `q.transport.stationAt / q.utilities.plantAt / q.zones.lotAt`，桩下恒 null；`q.services.queryStats` 桩下为空 | UI 只在非空时渲染；`e2e/smoke.spec` 的"Query 有数据"断言在 `SC2K_E2E_STRICT=1` 之外仅记 annotation | WP4 / WP5 / WP6 / WP7 | `e2e/smoke.spec` annotations | 开放 |
| 29 | `e2e/hash.spec` 的 Node 侧在 Playwright 进程内直接 import `src/sim/**`（不经 app/wire，避免拉入渲染 / UI）；基线 `SC2K_HASH_BASELINE` 未建立 | 先比较浏览器与 Node 两端相等；基线由集成列车 #2 后建立并写入 CI 环境变量 | WP12b / Lead | `e2e/output/hash.json` | 开放 |
| 30 | 存档窗口的 `.SC2` 路径经 `io/sc2` 入口直取（`WindowDeps` 无 `sc2`，RFC #3）；WP0 桩 codec 抛 `notImplemented` 时窗口显示拒绝文案 | 保持；WP2 合入后自动可用 | WP12b / WP2 | `ui/windows/windows.test.ts` ".sc2 优雅失败" | 开放 |
| 28 | `AssetStore.clearAll` 语义：WP0 内存桩连 saves 一起清；WP14 实现只清 files / decoded / handles / meta（"清除本地缓存"是隐私入口，存档是玩家自己的数据），另给 `clearSaves()` | 以 WP14 实现为准；UI 的"清除本地缓存"按钮只调 `clearAll` | WP14 / WP12 | `import/store.test`（clearAll 不碰 saves） | 待认可 |
| 29 | DAT 相对号 291+ 为名义表（spec:file-formats §2.6.3 M 级）：分区底色 291–299 → `overlay.Zone*`、着色 300 / 303 → `PreviewOk / PreviewBad`、断电 386、火 396、爆炸 387、飞机 359、水怪 379、帆船 380、调度图标 382–384；导入时按"条目存在 + 32×17 尺寸启发式"逐段校验，失败整段回退程序化（`ID_LAYOUT_UNRESOLVED` 诊断只含 id/w/h） | `sprites/ids.ts` `nominalSegments()` 单点改 | WP14 | 玩家真机文件的诊断反馈 | 开放 |
| 30 | 导入面板把 `.SC2` 写入 saves 时的元数据：`year = yearFounded + ⌊cityAge/300⌋`，`population = MISC.normalPop + arcoPop`（为 0 时回退 `residentialPop`），`thumbnail = null`（面板拿不到 renderer） | 以此为准；Save-Load 窗口可在首次打开后补缩略图 | WP14 / WP12 | `import/panel.test` | 开放 |
| 31 | DAT 多帧键（火 4 帧 396–399、爆炸 3 帧 387–389）v1 的 DatSpriteProvider 报 `frameCount 1`（静态）；`sprites/ids.ts` 的 `NOMINAL_FRAMES` 表留给 v2 动画 | v1 静态 | WP14 [v2] | — | 备忘 |
| 32 | `AssetImporter.onProviderReady(fn)`：订阅时若当前已有生效的 dat provider 会**立即**回调一次（UI 晚于启动序列挂载也能拿到），切回程序化时回调 `null` | 以 WP14 实现为准 | WP14 / WP12 | `import/panel.test`（迟到订阅） | 待认可 |
| 33 | 面板在导入精灵文件后即解码（即使"使用原版美术"未勾选），以便显示"已启用 / 部分启用（缺 X）"；解码结果缓存进 IndexedDB `decoded`，开关只决定是否 `setProvider` | 接受一次性解码成本（Worker 内） | WP14 | — | 备忘 |

## WP4 utilities 实现期裁定

| # | 问题 | 当前裁定（默认值 / 位置） | 归属 | 验证手段 | 状态 |
|---|---|---|---|---|---|
| 28 | `utilities.power.* / water.*`（hash:'sc2'）在 MISC 无落点（#11） | 不写 MISC；`postLoad('sc2')` 用不消费 PRNG 的重扫重算（`sim/utilities/save.ts`）。往返 `hash('sc2')` 不变的前提：电厂为固定产量（风 / 太阳能在无 PRNG 模式取分布中值，与导出前的随机抽样可能不同）、`weather.humid/wind` 与 `terrain.seaLevel` 由 events / terrain 经 MISC 往返。若集成后 WP1 的 saveload 往返用例含风 / 太阳能，请把这 14 个标量翻成 `'full'` | WP4 / WP1 | `sim/utilities/priv.test.ts` T8（煤电 + 水泵城往返 `hash('sc2')` 相同） | 已验证（提交 1f032e2 `saveload.test` 真系统用例：煤电 + 水泵金城 3 年 + 火灾往返 hash('sc2') 相同；电厂年龄 / 负载现同步写进活状态 XMIC；风 / 太阳能仍未覆盖） |
| 29 | `MISC 0x104C`（spec:power-water §2.8.4 要求写净水厂充足标志；dfloer 标 "Go Disaster"，Q5 未定） | 按 #2 透传 `rawMisc`，`exportTo` **不写**该偏移（避免原版把 1 解读为触发灾害）；充足标志只在 `state.utilities.water.treatmentSufficient` | WP4 | 原版存档对照 | 开放 |
| 30 | 电力扫描"已 POWERED 则跳过"的原版语义会在容量不足、电厂格未受电时把同一网络再遍历一次（重复计数 generation / consumers，风 / 太阳能重新抽样） | `scan.ts` 用整次扫描内不清零的访问标记代替（每张网络恰处理一次）；断电图样与原版一致，只有重复计数的退化情形不同 | WP4 | `power.test.ts` 多厂合并 / T4–T6 | 已裁定 |
| 31 | `wire.test.ts` 第一条用例断言"非 core 全为桩"，任何真系统合入都会失败 | WP4 已把断言改为"非 core 的桩都在 allowlist 内"（`src/app/wire.test.ts` 一行，越界最小改动，见 WP4 返回报告） | Lead | `pnpm vitest run packages/sc2k` | 已处理（`wire.test` 现为"非 core 的桩都在 allowlist 内"） |
| 32 | priv 中的电厂表只跟踪到期型（4×4）电厂，上限 `maxTrackedPlants = 1024`；风 / 水电不进表（永不到期，`plantAt` 年龄恒 0、负载取当前利用率） | `sim/utilities/priv.ts`；两个脏标志也进 priv（命令后、日末前保存的快照载入后仍会重扫，保证续跑哈希一致） | WP4 | `priv.test.ts` 预算 / 脏标志用例 | 已裁定 |
| 33 | `utilitiesAnnual` 在 `phaseApplies` 下 age 0 也生效；建城当天不应老化 | `annualUpdate` 在 `age === 0` 直接返回（零 PRNG） | WP4 / WP1 | `priv.test.ts` 年度更新用例 | 已裁定 |
| 28 | （WP12a 对 #15 的裁定）快捷键冲突：UI 全局键表（`ui/tools/keymap.ts`）优先于 `ToolDef.hotkey`；`1–4` = 速度、`[ ]` = 旋转、`Space / P` = 暂停、`W` = 电力组、`A` = 供水组、`Tab` = 同组下一子工具、`Shift+字母` = 窗口、`Ctrl+S` = 保存（preventDefault） | `ToolDef.hotkey` 在 v1 不被外壳读取；v2 做可配置键位时再合并两表 | WP12a | `toolController.test` 键盘用例 | 已裁定 |
| 29 | 桩经济下 `funds = 0`（#26）会让 `availability` 对全部付费工具返回 `funds`，工具栏整体置灰（这是正确行为，不是外壳缺陷）；自检 / e2e 在 economy 合入前需经 `window.__sc2k.host.state.economy.funds` 注入资金 | 等 WP8 `init` 写起始资金后自然消失 | WP8 / WP12b e2e | e2e/smoke.spec | 备忘 |
| 30 | 触控"单指点按"立即执行工具动作，双击缩放在第二次点按时追加（第一次点按的放置不撤销）；若要"延迟 300 ms 以区分双击"需接受所有点按的延迟 | 立即执行（spec:ui-art §3.11 未规定） | WP12a | — | 开放 |

## WP6 transport 实现期裁定（第一波）

| # | 问题 | 当前裁定（默认值 / 位置） | 归属 | 验证手段 | 状态 |
|---|---|---|---|---|---|
| WP6-1 | 翻转族桥件（0x51–0x5B、0x5C、0x6A/0x6B）`XBit.Flipped` 清零时的行进轴 | **未翻转 = T–B，置位 = L–R**（`sim/transport/model.ts` `BRIDGE_UNFLIPPED_AXIS`；与吊桥"起始段 B / 末端段 T"命名及匝道"高速 T/B 为基准"一致）。placement 按行进轴写该位、transport 据此判邻接、art / render 的基准精灵画 T–B 向 | WP3 placement / WP6 / WP9 art / WP10 render | `piece.test`"匝道 / 桥段 … 固定轴" | 待认可 |
| WP6-2 | `connections()` 三个计数的口径 | `commerce` = 道路连接条数；`industry` = 铁路条数 + 高速条数（沿边相邻两格高速合并为一条）；`total` = Σ tiles（高速一条算 2 格，= `MISC 0x1024` 连接格数）。zones 按"边缘格 0xFA 且 isRoad/isRail/isHighway"逐格求和应与 `total` 相等 | WP5 zones / WP6 | `connections.test` | 待认可 |
| WP6-3 | 0xFA 的写权与陈旧标记 | transport 不写 0xFA（placement 的 `neighborConnection` 写）；只在边缘格不再是任何网络格时清掉旧 0xFA（`onTilesChanged` + `importFrom`）；边缘格变成转弯 / 三岔时保留标记但不计数 | WP3 / WP6 | `connections.test` | 待认可 |
| WP6-4 | 步行者粗分类区间 0x43–0x50 字面含高速直线段 0x49/0x4A（spec §2.12.4 原文，原版实现者自注存疑） | 字面复刻：WALK 踩到 0x49/0x4A 也按"过桥直行"2 步；`tuning.transport.walkCrossoverAsBridge=false` 改为细分规则 | WP6 | `trip.test` WALK 行 | 开放 |
| WP6-5 | 汽车可走铁路桥 / 高架电线的原版怪癖（spec §4.7）vs WORKPLAN"电线桥不通行" | 拆成两个开关：`carsCrossRailBridge=true`（复刻）、`carsCrossWireBridge=false`（按 WORKPLAN）；两者都 true 即字面复刻 | WP6 | `trip.test` ROAD 行 | 待认可 |
| WP6-6 | economy 为桩时 `funding` 恒 0 → 交通一个月内全部衰败 | 见 `contract-rfc.md` WP6-1；临时兜底 `tuning.transport.budgetDecay=false`；真 economy 的 `init` 写开局资金率 100 后自然消失 | WP8 / Lead | `decay.test` | 已处理（真 economy `init` 写 defaultFunding；三套桩 `init` 写 100，提交 330d139） |
| WP6-7 | `app/wire.test.ts` 第一条用例断言"非 core 全为桩"（`expect(s.stub).toBe(true)`） | 任何真系统合入后必然失败；该文件归 WP0/Lead，WP6 未改。建议改为 `if (s.stub) expect(WIRE_STUB_ALLOWLIST).toContain(s.id)`，并在合入 WP6 时把 `'transport'` 移出 `WIRE_STUB_ALLOWLIST` | Lead | `wire.test` | 已处理（同 WP4 #31） |
| WP6-8 | 隧道预算衰败（spec §2.15 Tunnel 行）与高速块 / 匝道 / 隧道放置 | v1 未做隧道衰败（`tunnelLevels` 没有写入 action；隧道本身 v2）；高速块（偶数锚点整块）与匝道（按 Highways 单格）的衰败已实现以兼容导入存档 | WP6 v2 | — | 备忘 |
| 28 | `pick` 的候选顺序：规格写"31→0 级逆投影"（高处优先），WP10 实现为"深度从前到后、同深度 rx 大者优先 + 带海拔四边形测试"（与画家序一致）。合法地形（相邻角差 ≤ 1）下两者结果相同；bedrock 平台 / 深水面盖住后方格时，WP10 口径返回实际画在最上面的格 | `src/render/scene/picking.ts` `pickP`；水下格按 waterLevel 平面、bedrock 按 alt+1 平台拾取（`pickSurfaceOf`） | render / UI | `picking.test.ts`（深湖 / 悬崖用例） | 待认可 |
| 29 | 边缘岩壁位图的锚点约定（给 WP9）：EdgeWall 项锚点 = 本格 c11'@alt；建议 R 壁位图 anchor = (0, S/2)（画布 S × (S/2 + levels·LEVEL)），L 壁 anchor = (S, S/2)，壁顶沿 c10'–c11' / c01'–c11' 边、向下 levels·LEVEL | `compiler.ts` 第 2 步；`compositor.test.ts` 的几何 provider 按此约定自测 | art / render | 合并 WP9 后目视 | 开放 |
| 30 | 车流覆盖物 `TrafficLight / TrafficHeavy` 没有路形 variant（契约 key 只有 id + frame），WP9 只能画通用车流；v2 可加 `variant = 旋转后道路片段偏移 0..14` | `compiler.ts` 第 7 步 | art / render | — | v2 |
| 31 | 高速 2×2 块（0x61–0x6B，FOOTPRINT 2）按多格件处理：只有 `anchorOf` 能找到 TL 角标时才在 `renderAnchor` 格画一次（Structure），否则退化为每格各画一次（Ground）。需要 transport / placement 写高速块时置 XZON 角标 | `compiler.ts` 第 6 步 | transport / placement / render | 合并后目视 | 开放 |
| 32 | 小地图 Health / Education 图层（spec:ui-art §2.5.1 [M]：由服务模块提供 32² 图）v1 由建筑位置派生：医院 0xD1 / 教育 0xD4 0xD6 0xD9 0xF5 按 Chebyshev 半径（12 / 10 格）线性衰减 | `minimap.ts` `coverageField`、`tuning.ts minimapHealthRadius / minimapEducationRadius` | services / render | services 提供真图后替换 | 开放 |
| 28 | 真 events 下 `runDays` / `replay` 以 `advance(0)` 推进，灾害模式零 tick → 随机灾害一出现长跑即 stall；且 `advance` 在同帧 thingsTick 切到灾害模式后仍推进日历 | events 测试自带 `sim/events/fixtures.runTicks`（传 `DISASTER_TICK_MS`）；core / testkit 待改（contract-rfc #6） | WP1 | `longrun.test` 50 年 | 已处理（提交 184984c，见 contract-rfc WP13-6；`longrun.test` 50 年与 headless 三 seed 50 年跑通） |
| 29 | 报纸选项（订阅 / 号外）与灾害原点的存档落点；`XTHG`（调度单位 / 龙卷风 / 怪兽）v1 不写档，灾害中导出 `.SC2` 再导入物件丢失（标记 / 状态机保留） | 选项暂存 `rawMisc` 0x1004 / 0x1008（contract-rfc #3）；原点灾害结束复位 (64,64)（#4）；XTHG 读写归 WP13 [v2] | WP13 / WP8 / Lead | `shadow.test` 的 sc2 往返 | 部分处理（pointX/Y 翻 'full'，提交 1f032e2；XTHG 读写仍 v2） |
| 30 | 报纸文案键 `news.<NewsType>` 只预置 14 / 20 类；号外头条 = 触发故事（spec §3.6 `headline = thisStory`），订阅版头条 = 池中最高分 | 缺键 UI 回退显示键名（contract-rfc #2） | WP13 / Lead | `news.test` | 开放 |
| 28 | `nationalAnnual.economy` 在建城日（age 0）也生效（契约 `phaseApplies` 只看 `month === 0`），联邦利率开局即随机游走一次并消费 1 次 PRNG；spec:economy §2.3.2 的年初序列只写了 `age > 0` | 按契约实现（economy 不自行加 `age > 0` 条件，避免与 zones 的 `nationalAnnual.zones` 口径不一致） | WP1 / WP5 / WP8 | `settle.test` 以 age 1 为 PRNG 基线 | 待裁定 |
| 29 | 信用评级分母下限：`EconomyTuning.bonds.ratingTaxFloor = 10000`、`ratingValueFloor = 100000`（[设计]）；不加下限时新城（税收 / 价值为 0）第一张债券即 F，Hard 开局永远无法借款 | 下限为可调参数；评级公式本身即 spec Q5 的 [低] 建议式 | WP8 | `bonds.test` | 开放 |
| 30 | 经费线"数量"以 `counts.tile ÷ 占地²` 推出为准（spec:economy §4.13"不等时以 tileCounts 为准"），`q.services.structureCounts()` 只在 `exportTo` 对账并记 `economy.structureCountMismatch` 诊断 | economy 不依赖 services 的计数真伪 | WP7 / WP8 | `settle.test`（经费）、`save.test` | 开放 |
| 31 | `fedRateRaw`、`impeached` 没有原版 `MISC` 落点：借用税线 R / C 块的索引 2（"未明"槽，spec:economy Q12）；导入原版存档时该槽若非法（超出 `fedMin..fedMax` / 非魔数）则回退 XGRP / 初值 | 自洽往返；若要完全不碰原版未明槽，需把两字段翻成 `hash:'full'` | WP8 / WP2 | `save.test` | 开放 |
| 32 | 预算模态：`autoBudget` 默认 false，真 economy 合入后每年 1 月第 0 天发 `modal budget` 并挂起，UI 必须 `dispatch(modalAnswer)` + `host.modalClosed()` 才能续跑；`gameOver` 同理 | 测试 / `runDays` 自动关模态；app 壳由 WP12 处理 | WP12 | `budgetWindow.test`、e2e 冒烟 24 个月 | 开放 |
| 28 | 翻转族桥件（0x51–0x5C）"未翻转"精灵的轴向 | `PlacementTuning.bridgeSpriteAxis = 'TB'`：沿 L–R 铺桥时置 `XBit.Flipped`（键名 suspStartB/EndT 暗示默认竖向） | WP3 placement、WP9 art、WP10 render | art 出图后对照 | 待认可 |
| 29 | 水电 0xC6 / 0xC7 哪个对应 T–B 流向 | `resolveHydroId`：T/B 邻格更高 → 0xC6（hydroA），否则 0xC7 | WP3、WP9 | 精灵朝向对照 | 开放 |
| 30 | 网络件（0x0E–0x6F）的 XZON 高 nibble | placement 一律写 0xF0 并清分区码（与 spec:transport §2.8"高速段角标全置"一致；地下族不动 XZON） | WP3、WP5 角标重建、WP2 导入 | 原版存档对照 | 待认可 |
| 31 | `rewards.stadiumTeams` 的编码 | 位掩码：`teamPick` 答案 k → `stadiumTeams \|= 1 << k` | WP3、WP7 services、WP12b | — | 待认可 |
| 32 | 微模拟槽位满时是否拒绝放置 | `PlacementTuning.microsimFullRejects` 默认 false（桩恒 −1）；services 合入后 app 翻 true 即原版"140 座"限制 | WP3、WP7 | — | 待接线 |
| 33 | 推土机拆建筑是否留瓦砾 | 留（spec:terrain §2.11.1 / spec:zones §2.2 表）：平地 → 0x01..0x04（每格 1×1 角标 0xF0、分区码保留），坡面 / 水面 → 空地；再推一次 $1 清空。开关 `rubbleOnDemolish` | WP3、WP5 | 原版实测 | 待认可 |
| 34 | 桥头岸格"alt ≥ 水面"的读法 | 岸格最高点 ≥ 水面：`alt + (坡面 ? 1 : 0) ≥ waterLevel(相邻水格)`，坡面须沿桥向；v1 不自动改地形 | WP3、WP2 | 生成地图上实际能否架桥 | 待认可 |
| 35 | 在已划区格上改划异类 | 允许，按新类型价计费，格上分区建筑整栋变瓦砾（spec:zones §2.2 表）；同码免费跳过 | WP3、WP5 | — | 待认可 |
| 36 | `src/app/wire.test.ts` 断言"非 core 全为桩"与"placeBuilding → notImplemented" | 任一真系统合入即失效（WP3 分支上该文件 2 例失败，未改动 app/**）；建议 Lead 改为"`stub` 的系统 ⊆ `WIRE_STUB_ALLOWLIST`"并换用仍为桩的命令（如 `requestDisaster`） | Lead | 合并列车 | 已处理（`wire.test` 现为"桩 ⊆ allowlist"，allowlist 为空） |
| 28 | 部分重叠的吞并：spec:zones §2.5.6 条件 2 要求被吞并建筑「整栋落入」新地块，但 2x2 铺满密区后任何 3x3 候选都只能盖住邻栋一半，级 4（3x3）永远无法出现（实测 18 个月 I 密区 6×6 全是 2x2） | `ZonesTuning.absorbPartial = true`（[设计]）：被部分覆盖的更低密度级 / 废弃建筑整栋拆除，地块外的格变瓦砾（hash32 变体），不留半栋孤儿；设为 false 即严格 spec 口径 | zones 手感（密区能否长到 3x3） | `sim/zones/growth.test.ts` §3.7-3、`lot.test.ts` 部分重叠用例 | 待认可 |
| 29 | `LotState` 的 priv 布局：WORKPLAN 列出 anchor/size/level/tier/phase 等列，但全部可由 XBLD/XZON 推断；按锚点存全部列在 16384 栋 1x1 的极端情形下约 213 KB，超 128 KB 预算 | priv 只存不可重建的 5 列（phaseDays u16、unpoweredDays / tripFailMonths / tierMismatchMonths / pendingId u8），按锚点格索引、定长 16384，编码后 ≈ 98 KB；size / level / tier / phase / zone 运行时由 XBLD 查表（`sim/zones/lots.ts`） | 快照大小、存档兼容 | `priv.test.ts` 预算用例 | 已采用 |
| 30 | `NeighborCity.edge` 0..3 与地图四边的对应 | `ZonesTuning.neighborEdgeSides = ['S','W','N','E']`：edge 0 = y==127（左下）、1 = x==0（左上）、2 = y==0（右上）、3 = x==127（右下）（spec:zones §2.10 存储顺序 + spec:transport §2.13 边 → 邻城映射）；角格归 N/S 边 | transport 的 `connections()` 口径、邻城窗口、路牌 | `neighbors.test.ts` 连接重算用例 | 待 WP6 认可 |
| 31 | 邻城连接的计数口径：`MISC 0x1024` 是连接格数，而高速双车道算一条连接 | `recountConnections` 返回连接格数（给 0x1024），`neighbors[k].connections.highway = ceil(高速格数 / 2)`；`Σ connections` 应等于 `q.transport.connections().total`（transport 若按格计总数需对齐） | demand cap / 邻城增长 | 同上 | 待 WP6 认可 |
| 28 | 问题 9 的实测（WP11 第一天 4 万精灵基准；环境：Chromium 1194 headless + SwiftShader WebGL、Vite dev 未压缩、4 核共享容器并行跑多个 WP）：40,989 精灵挂 16 条 `isRenderGroup` 带，静态帧 `stats().frameMs` 中位 0.4–0.5 ms / p95 ≤ 4 ms，平移帧同级（只改 `worldRoot` 位置，`bandRebuilds` 不增）；draw call 14–16（门禁 ≤ 48）；`vramBytes` 16–32 MB（门禁 ≤ 128 MB）；热池全量重建（S↔M 换档）场景构建 min 107 / 中位 141 ms，含 Pixi 指令重建的整帧 min 140 / 中位 177 ms；应用页 16,384 精灵换向整帧 42–76 ms；1,000 脏格 18–34 ms（Node 下 8–11 ms） | **RenderGroup 静态零成本成立 → 不启用 R1 退路（每带 RenderTexture）**。全量重建在 4 万精灵时超 60 ms 预算（主要是 4 万次 Pixi `addChild` / ObservablePoint 赋值 + `compileAll` 分配），v2 按 §6.6 把重建按带分 2 帧提交或分块 `compileAll`；开发机（非 SwiftShader、无并行负载）预计约为上述一半 | WP11 render | `scratchpad/render/bench.json`（截图同目录）、`src/render/pixi/{atlas,bands,provider}.test.ts` | 已裁定（v1） |
| 29 | `e2e/boot.spec.ts`（WP0）用 `canvas.getContext('2d')` 读像素判"非单色"；WP11 的画布是 WebGL（Pixi），`getContext('2d')` 返回 null → 该断言在真渲染器下必失败 | 由 WP12 并入 `smoke.spec.ts` 时改为 `page.screenshot` 像素统计（或 `preserveDrawingBuffer` + `readPixels`）；`e2e/boot.spec.ts` 不在 WP11 独占清单内，未改 | WP12 e2e | `pnpm --filter sc2k e2e` | 待处理 |
| 28 | 相邻的两个单格池塘按 spec:terrain §2.6.3 角位规则（角点周围任一地块是陆地即「陆地角」）都显示为孤立池塘 0x3D，2×2 才出现内凹码 | 按规格实现（`sim/terrain/field.ts` `surfaceShape` 一处）；若美术觉得两格水洼之间的"地埂"怪，可改为「角点周围任一水块即水」 | WP2 / WP9 | 目测 | 开放 |
| 29 | 城市模式 Lower / Level 触及深水格是否整次拒绝（spec:terrain §2.10 字面「桥 / 隧道 / 水块则拒绝」） | 放宽为允许（`DEFAULT_TERRAIN_TUNING.cityRejectsWaterForLowerLevel = false`），便于在岸边挖港；Raise 作用于水块恒允许 | WP2 | 原版实测 | 开放 |
| 30 | 城市模式 Level 是否连带拆除结构物并计入 $25（spec [M]） | v1 不拆（`levelDemolishes = false`），触及任何 XBLD ≥ 0x0E 或隧道格即 `obstructed` | WP2 / WP3 | 原版实测 | 开放 |
| 31 | 溪流在等高平地上的走向：原版 [M] 允许转弯视觉断开；本实现同高时优先延续上一方向，连续平地 > 12 步以池塘收尾（`streamPlateauMax`） | 设计值 | WP2 | 目测 | 备忘 |
| 32 | `app/wire.test.ts`「非 core 全为桩」断言在任一真系统合入后必然失败（WP2 合入即如此），同时 `WIRE_STUB_ALLOWLIST` 需删去该 id | 集成者在合并列车上改为「若 `s.stub` 则必须在 allowlist 内」并收缩 allowlist；WP 不得改 `src/app/**` | Lead | `wire.test` | 已处理（同上） |
| 28 | 程序化美术：桥件 / 高架电线 / 跑道 / 栈桥 / 起重机等翻转族"未翻转"轴向取 L–R（沿世界 +x），T–B 由渲染器 `drawFlip` 水平镜像得到 | `art/network.ts genBridge` 与 `buildings.ts` 0xDD/0xDF/0xE0 只画 L–R 向 | WP9 art、WP10 render、WP6 transport（写 Flipped 位时的口径） | 与原版存档对照栈桥朝向 | 开放 |
| 29 | 水面岸形 1–12 的"陆地角"部分画成透明（露出其下地形 / 坡面），而非 spec:ui-art §3.7.2 写的地形色；岸线为 1 px Sand[5] + 水侧浪线 | `art/water.ts shoreWaterPolygon` | WP9、WP10（Water 层叠在 Terrain 层之上即可） | 目测 | 备忘 |
| 30 | 调色板 192–255 规格留空，WP9 用作 4×4×4 杂色立方（车辆 / 集装箱 / 旗帜）；DAT 导入时不用我方调色板，无冲突 | `art/palette.ts IDX.MiscBase / misc()` | WP9、WP14 | — | 备忘 |
| 31 | 边缘岩壁位图锚点：EdgeWallL 画布宽 W/2、锚点 (W/2, H/2)（落在地块底顶点 c11）；EdgeWallR 锚点 (0, H/2)。渲染器把 EdgeWall 项像其它项一样贴到 c11 即可 | `art/terrain.ts genEdgeWall` | WP10 | compiler / compositor 像素用例 | 待认可 |
| 32 | v1 全部精灵静帧（frameCount 1 / fps 0）；水面 / 洪水 / 瀑布在 M、L 档含循环组索引（`cycling = true`），S 档不含；建筑不含循环索引，避免进入 animPage | `art/provider.ts`、`art/water.ts` | WP11 | — | 备忘 |
| 33 | （INT-C 美术打磨）岸边 0x2X 的水面若按 spec:ui-art §3.7.2 / ARCHITECTURE §6.3 画在 `alt`，会比相邻水下格（画在 `waterLevel = alt + 1`）低一级，整条岸线出现台阶；坡面着色表的 +x 面 −2 阶加等高线 / 脊线在真实地图上像等高线图 | 岸边改画在 `waterLevel`（`render/scene/tuning.ts shoreAtWaterLevel = true`，false 回到原字面）；`art/terrain.ts SLOPE_SHADE` 收敛为 ±1 / ±1½（半阶用棋盘抖动），不再画等高线与脊线（bedrock 岩壁线保留）；树冠改为比草地暗的 Forest[1..3] 并带阴影，分区底色改 1 px 线 + 点阵 | WP9 art、WP10 render | 真渲染截图（`scratchpad/int-c/before|after`）、`e2e/output/smoke.png` | 已实现（spec 字面待 Lead 同步） |

## INT-A（模拟层集成验证）裁定与备忘

| # | 问题 | 当前裁定（默认值 / 位置） | 归属 | 验证手段 | 状态 |
|---|---|---|---|---|---|
| INT-A-1 | 无头 50 年金城（seed 12345 / 777 / 2024）在第 11–30 年左右被一次随机地震（每格 `pQuake` 对 4×4 煤电的 16 格累加 ≈ 50% 命中）摧毁唯一电厂后全城失电 → 废弃 → 瓦砾，人口归 0 且无人重建 | 按 spec:disasters §2.6.5 的逐格概率实现，属"无玩家"下的预期结果，不改规则；曲线评估看首次灾害前的平台（约 2.1k–3.1k 人、资金 +2.5k/年） | events / 集成者 | `tools/headless.ts --years 50 --seed S`（INT-A 报告附三 seed 摘要） | 已裁定 |
| INT-A-2 | `.SC2` 导入后约一个月内 `totals.developedTiles` 为 0（services 要到下个 `dataMaps` 才重算），图表 `graphCurrent` 的分母短暂偏小；zones 的 lot 计时器等 priv 也按规格归零——导入后续跑与导出方不逐位相同（快照路径无此问题） | 接受（`.SC2` 本就是有损格式）；若 UI 觉得图表跳变明显，可在 `postLoadServices('sc2')` 用 xbld / xzon 重数 developedTiles | services / UI | `saveload.test` 真系统用例只断言导入时 hash('sc2') 相同与续跑不变量 | 备忘 |
| INT-A-3 | 金城无消防局：从住宅区起火会整片烧光（`saveload.test` 的火灾因此放在火车站）；`checkPopulation` 的第 20 年区间断言在随机灾害后不再成立 | `longrun.test` 的 50 年人口区间断言仅在 `SC2K_LONGRUN=1` 下启用，集成者评估长跑时以首次灾害前的平台为准，或用 `tuning.events.monthlyChance` 关闭随机灾害 | 集成者 | `SC2K_LONGRUN=1 pnpm vitest run packages/sc2k/src/sim/core/longrun.test.ts` | 备忘 |
| INT-A-4 | 浏览器主循环下随机灾害的启动时点现与测试驱动器一致（pending 置位日之后、下一日之前），但灾害进行中玩家派发的命令（调度 / 推土）在日志里只有 (age, 0) 游标，重放时会在灾害开始前派发 | v2：core 把 tick 计数写进日志条目（见 #28） | WP1 / WP13 [v2] | `disasterRun.test` 只覆盖无命令的灾害 | 开放 |

## INT-B（浏览器玩测 + 外壳打磨）发现

> 环境：Chromium 1194 headless + SwiftShader WebGL（`--disable-gpu`）、vite preview 构建、4 核共享容器。玩测脚本经 Playwright 真鼠标 / 键盘 / CDP 触控事件驱动，`?debug` 句柄只用于读状态与断言。

| # | 问题 | 处理 / 当前裁定 | 归属 | 验证手段 | 状态 |
|---|---|---|---|---|---|
| B1 | 视图元素不在页面 (0,0)（菜单栏下方 24 px）时，所有"按下 / 抬起"路径的落格偏移 1–2 格：`toolController` 把已是局部坐标的 `Ptr.x/y`、`lx/ly` 再交给 `tileAt(clientX, clientY)` 减了一次 rect（Line / Rect 起点、Paint 首格、点按放置、右键 / 长按查询、双击都受影响；只有悬停预览正确，所以肉眼看是"预览在这儿、建在那儿"） | 改为 `tileAtLocal`；新增回归用例（`toolController.test` "视图元素不在页面 (0,0)"，旧实现下必失败） | ui（INT-B 已修） | 单测 + 玩测：电厂 / 电线 / 分区 / 道路 / 铁路 / 车站落格与指针格一致 | 已修 |
| B2 | 工具栏子工具条每 100 ms 的节流 `refresh()` 调 `renderPopup()` 整体 `replaceChildren`，行节点不断被替换：真点击经常落在已脱离 DOM 的节点上（Playwright 要等 30 s 才能点到，玩家也会遇到点击无效 / 悬停高亮闪烁） | 行只在打开时创建一次，`updatePopup()` 原地改类 / title / 费用 | ui（INT-B 已修） | 玩测：子工具行点击 1 次即选中 | 已修 |
| B3 | 预算模态 / 账目 / 顾问 / 图表 / 存档 / 邻城等窗口显示裸键名（`budget.taxes`、`advice.*`、`advisor.*`、`graph.*`、`ui.saves.*` …），`message.disasterUnavailable` 的 `{name}` 会代入 `disaster.fire` 这样的键 | 219 个新键并入 `strings.zh/en`（见 contract-rfc 各行状态）；`ui/windows/text.ts` 回退表删除；外壳对 `message` 事件 args 中的 strings 键先本地化 | data / ui（INT-B 已修） | `catalogue.test` 键集合一致；e2e `smoke.spec` 对每个窗口扫描裸键名 | 已修 |
| B4 | 命令结果型模态（选桥型 / 邻城连接）按 Esc 时外壳 `closeTop(0)`：对 bridgeType 等于"选第一种桥并付费" | `closeTop()` 缺省答案按路径：结果型 −1（取消）、其余 0 | ui（INT-B 已修） | `modalHost.test` | 已修 |
| B5 | gameOver 模态的"主菜单"（answer 1）只关闭模态，不回标题页 | `openFromEvent` 接受 `onAnswer`，外壳对 gameOver 的 1 调 `showTitle()` | ui（INT-B 已修） | 代码审查 | 已修 |
| B6 | 工具栏 / 子工具条 / 状态栏 / Map 图层按钮用字形占位 | 改用 WP9 `UiIconId` 24×24 位图（`ui/icons.ts`：provider.bitmap → canvas → data URL，模块级缓存；无 2D 上下文 / 无位图时回退字形）；开关行 12 px（整数缩半）、天气 / goto 24 px（状态栏首行加高到 26 px） | ui（INT-B 已做） | 截图 | 已做；开关行 5 个 12 px 按钮仍偏挤（v2 可改两行） |
| B7 | 软件渲染下主循环只有 ~5 fps：28k 精灵 / 15 drawCalls，`renderer.stats().frameMs` 仅 0.3 ms、`host.advance` 每帧 ~1 ms，时间都在 WebGL 提交 / 合成（空白 WebGL 页同环境 60 fps）。真 GPU 上未测 | 记录；e2e 把 `smoke.spec` 超时放宽到 600 s、每次真点击约 2–5 s | render（WP11） | `requestAnimationFrame` 间隔 ~180 ms；PerformanceObserver longtask ~100 ms/帧 | 开放 |
| B8 | 公交站（`roads.busDepot`）在 1900 年开局不可用 | 科技 `buses` 基准年 1920，为预期行为（子工具条灰显并给出 `reject.notInvented`） | — | 玩测 | 非问题 |
| B9 | 工具组按钮的可访问名是角标数字（img alt 为空、title 不计入） | 加 `aria-label` | ui（INT-B 已修） | Playwright 快照 | 已修 |
| B11 | 菜单栏同样的问题：打开的菜单每 100 ms 被 `refresh()` 整体重建，菜单项点击经常落空（Playwright 记录 "element was detached from the DOM" 32 次） | `render()` 按项签名（kind / label / checked / disabled / hint）判断，只有变化时才重建；新增 `menubar.test` | ui（INT-B 已修） | 单测 + e2e Windows 菜单真点击 | 已修 |
| B12 | 跑年后 `census.citySize` / `normalPop` 为 0 而分区建筑已生长（smoke 26 个月） | 记为 e2e `needs-real-sim` annotation；归 zones / services 的人口口径 | sim | e2e annotation | 待 sim 确认 |
| B10 | `.SC2` 导出 → 导入后 `hash('sc2')` 是否保持 | 由 contract-rfc WP7-3 / WP8-5 / WP13-4 的 `'sc2'` 标注字段决定；`smoke.spec` 以 `needs-real-sim` annotation 记录而不硬断言 | sim | e2e annotation | 待 sim 收口 |
