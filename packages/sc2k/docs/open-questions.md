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
| 11 | `hash:'sc2'` 标注的若干标量在 MISC 表中无明确落点（`clock.disasterTicks`、`rewards.mayorApproval`、`utilities.power.* / water.*`、`traffic.*`、`totals.*`、`weather.trend / season`、`disaster.windOverride / pointX / pointY`、`census.taxable* / tiles.*`、`economy.counters.*`、`national.*` 部分） | 仍按「其余 'sc2'」标注；桩下为 0 故往返测试通过。各 WP 写入这些字段后，若不写进 `.SC2`，必须把对应项翻成 `'full'`（`contracts/snapshot.ts` `SCALAR_FIELDS` 每项一处） | WP2 io/sc2、WP8 economy、WP4/5/6 | `sim/core/createSim.test` 的 `.SC2` 往返用例 + WP2 的 `roundtrip.test` | 开放 |
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
| 24 | `SC2K_STRICT_WIRE`（打标前 `WIRE_STUB_ALLOWLIST` 必须为空）未实现：Vite 只透传 `VITE_*` 环境变量 | 留给 CI / `tools/headless.ts` 断言 `WIRE_STUB_ALLOWLIST.length === 0` | WP1 / WP12 | headless 退出码 | 开放 |
| 25 | `createTestContext` 在改动夹具后调用一次 `postLoad(ctx, 'snapshot')` 让 `nullSystem` 重绑定；若桩改为注册时即可用，这一行可删 | 保留 | WP1 | `createSim.test` | 备忘 |
| 26 | `economy.funds` 桩下为 0（无人发起始资金），冒烟观感「资金: 0」 | 属 WP8，不是缺陷 | WP8 | e2e 截图 | 备忘 |
| 27 | `counts.zone` 由 `setXbld` 维护（已建 R/C/I 建筑格，spec:zones Q9 口径），不是 `setXzon` | core 口径；zones 的 census 全量重算须用同一口径 | WP4 zones | `tileWriter.test` 计数恒等 | 待认可 |
| 28 | 翻转族桥件（0x51–0x5C）"未翻转"精灵的轴向 | `PlacementTuning.bridgeSpriteAxis = 'TB'`：沿 L–R 铺桥时置 `XBit.Flipped`（键名 suspStartB/EndT 暗示默认竖向） | WP3 placement、WP9 art、WP10 render | art 出图后对照 | 待认可 |
| 29 | 水电 0xC6 / 0xC7 哪个对应 T–B 流向 | `resolveHydroId`：T/B 邻格更高 → 0xC6（hydroA），否则 0xC7 | WP3、WP9 | 精灵朝向对照 | 开放 |
| 30 | 网络件（0x0E–0x6F）的 XZON 高 nibble | placement 一律写 0xF0 并清分区码（与 spec:transport §2.8"高速段角标全置"一致；地下族不动 XZON） | WP3、WP5 角标重建、WP2 导入 | 原版存档对照 | 待认可 |
| 31 | `rewards.stadiumTeams` 的编码 | 位掩码：`teamPick` 答案 k → `stadiumTeams \|= 1 << k` | WP3、WP7 services、WP12b | — | 待认可 |
| 32 | 微模拟槽位满时是否拒绝放置 | `PlacementTuning.microsimFullRejects` 默认 false（桩恒 −1）；services 合入后 app 翻 true 即原版"140 座"限制 | WP3、WP7 | — | 待接线 |
| 33 | 推土机拆建筑是否留瓦砾 | 留（spec:terrain §2.11.1 / spec:zones §2.2 表）：平地 → 0x01..0x04（每格 1×1 角标 0xF0、分区码保留），坡面 / 水面 → 空地；再推一次 $1 清空。开关 `rubbleOnDemolish` | WP3、WP5 | 原版实测 | 待认可 |
| 34 | 桥头岸格"alt ≥ 水面"的读法 | 岸格最高点 ≥ 水面：`alt + (坡面 ? 1 : 0) ≥ waterLevel(相邻水格)`，坡面须沿桥向；v1 不自动改地形 | WP3、WP2 | 生成地图上实际能否架桥 | 待认可 |
| 35 | 在已划区格上改划异类 | 允许，按新类型价计费，格上分区建筑整栋变瓦砾（spec:zones §2.2 表）；同码免费跳过 | WP3、WP5 | — | 待认可 |
| 36 | `src/app/wire.test.ts` 断言"非 core 全为桩"与"placeBuilding → notImplemented" | 任一真系统合入即失效（WP3 分支上该文件 2 例失败，未改动 app/**）；建议 Lead 改为"`stub` 的系统 ⊆ `WIRE_STUB_ALLOWLIST`"并换用仍为桩的命令（如 `requestDisaster`） | Lead | 合并列车 | 待 Lead 处理 |
