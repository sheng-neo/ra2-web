# 契约变更 RFC（日内，加法式）

> 流程见 `CONTRACTS.md` §Z：在本文追加一行 → Lead 30 分钟内合并到 `src/contracts/**`、`src/app/stubs/**`、`src/testkit/**` → 群通知。等待期间 WP 在自己目录用局部类型先行，不得改契约文件。
> 只允许加法：新增可选字段、新增 `Command / SimEvent / RejectReason / ModalId / SoundId` 成员、新增 `Queries` 方法（三套桩同时给默认值）、新增 `PRIV_BUDGET_BYTES` 额度。禁止改名、改语义、删键、改顺序。

| # | 时间 | 提出者（WP） | 要什么（文件 / 键 / 签名） | 为什么 | 三套桩默认值（乐观 / 悲观 / 现实） | 状态 |
|---|---|---|---|---|---|---|
| 0a | WP0 Reconcile | Lead | `queries.ts` 新增 `QUERY_OWNER` | createSim / nullSystem 各自一份表，去重为单一真源 | 不涉及 | 已合并（冻结前） |
| 0b | WP0 Reconcile | Lead | `TechKey` 改名 `arcoPioneer / arcoCanopy / arcoDusk / arcoSkyward`；`NewsType.OpinionGuest / AdviceColumn`；`SimEvent 'arcoExodus'` | 裁定 7：代码内不得出现原版 Arcology / 专栏名 | 不涉及（数值与槽序不变） | 已合并（冻结前） |
| 0c | WP0 Reconcile | Lead | `snapshot.ts` 新增 `STRING_FIELD_HASH / stringFieldHash`（mayorName → 'full'） | `.SC2` 无市长名字段，往返会破坏 hash('sc2') 不变量 | 不涉及 | 已合并（冻结前） |
| 1 | | | | | | 待议 |
| 2 | WP10 | WP10 render-scene | `render.ts`：`RenderSnapshot` 新增可选字段 `animTick?: number`（app / WP11 由 `RenderSource.animTick` 填入） | Marker / 车流覆盖物的 `frame` 要由动画节拍派生（WORKPLAN WP10 "frame 由 animTick 派生"），但 `RenderSnapshot` 没有节拍字段。WP10 先用本地扩展类型 `SceneSnapshot extends RenderSnapshot { animTick?: number }`（`src/render/scene/compiler.ts`），缺省 0 → 全部取第 0 帧；帧率表在 `render/scene/tuning.ts`（`animTickHz = 24`，fire 4f@8fps、flood 3f@3fps、toxic 3f@2fps、riot 2f@4fps、traffic 4f@6fps） | 不涉及桩 | 待议 |
| 3 | WP10 | WP10 render-scene | `render.ts` 注释补充：`SceneItem.x/y` 的唯一例外——多格建筑的 `OverlayId.NoPower` 项 `y = 锚格 c11'.y − (n−1)·tileH/2`（抬到占地中心线，否则 4×4 电厂的断电图标会画在前角） | 契约只写了"x/y = 锚格底顶点"；WP11 只读 `item.x/y`，不受影响；仅需文档对齐 | 不涉及桩 | 待议 |
