# 契约变更 RFC（日内，加法式）

> 流程见 `CONTRACTS.md` §Z：在本文追加一行 → Lead 30 分钟内合并到 `src/contracts/**`、`src/app/stubs/**`、`src/testkit/**` → 群通知。等待期间 WP 在自己目录用局部类型先行，不得改契约文件。
> 只允许加法：新增可选字段、新增 `Command / SimEvent / RejectReason / ModalId / SoundId` 成员、新增 `Queries` 方法（三套桩同时给默认值）、新增 `PRIV_BUDGET_BYTES` 额度。禁止改名、改语义、删键、改顺序。

| # | 时间 | 提出者（WP） | 要什么（文件 / 键 / 签名） | 为什么 | 三套桩默认值（乐观 / 悲观 / 现实） | 状态 |
|---|---|---|---|---|---|---|
| 0a | WP0 Reconcile | Lead | `queries.ts` 新增 `QUERY_OWNER` | createSim / nullSystem 各自一份表，去重为单一真源 | 不涉及 | 已合并（冻结前） |
| 0b | WP0 Reconcile | Lead | `TechKey` 改名 `arcoPioneer / arcoCanopy / arcoDusk / arcoSkyward`；`NewsType.OpinionGuest / AdviceColumn`；`SimEvent 'arcoExodus'` | 裁定 7：代码内不得出现原版 Arcology / 专栏名 | 不涉及（数值与槽序不变） | 已合并（冻结前） |
| 0c | WP0 Reconcile | Lead | `snapshot.ts` 新增 `STRING_FIELD_HASH / stringFieldHash`（mayorName → 'full'） | `.SC2` 无市长名字段，往返会破坏 hash('sc2') 不变量 | 不涉及 | 已合并（冻结前） |
| 1 | | | | | | 待议 |
| WP7-1 | 第一波 | WP7 services | `contracts/actions.ts` `allocMicrosim(tileId)` 的返回约定补注释：`≥ 1` = 记录号（共享 1..9 / 独占 10..149）；`0` = 该建筑不需要微模拟记录（不是失败）；`−1` = 独占记录用尽（140 座）。放置者只对 `< 0` 判 `microsimFull` | 契约只写"slot 或 −1"，无记录建筑（小公园 / 水泵 / 电线）若返回 −1 会被误判为满 | 乐观 10 / 悲观 −1 / 现实 0（现为三套都 −1：桩下任何带记录的建筑都放不下） | 待议 |
| WP7-2 | 第一波 | WP7 services | 微模拟标签协议（spec:file-formats §2.2.7）：占地格 `XTXT = 0x33 + slot`；放置者可自己写，也可留 0 由 services 在 `onTilesChanged('building')` 补写（同一命令内 alloc + setXbld 即可）。请 WP6 车站 / WP3 建筑不要写裸 `slot`（spec:transport §3.4 伪代码写的是 `XTXT[t] = slot`，10..50 会与告示牌 0x01..0x32 冲突） | 读档 / 查询窗口 / rename 都按 `0x33 + r` 反查记录 | 不涉及 | 待议 |
| WP7-3 | 第一波 | WP7 services | `contracts/snapshot.ts` `SCALAR_FIELDS`：`traffic.total / graph / roadTiles / highwayTiles / bridgeTiles`、`totals.developedTiles / centerX / centerY`、`rewards.mayorApproval` 由 `'sc2'` 改 `'full'` | 这些是运行时缓存（spec:services §2.3.2 / §3.3 "不入存档"）：`.SC2` 无落点，读档后由 `Σ XTRF` / 路网格数 / `XBLD` 重建，与导出前的第 2 / 19 天快照值不等，`hash('sc2')` 往返必然不等。`traffic.total` 虽写 `MISC 0x0030`（第 19 天值），但导入后按规格以 `Σ XTRF` 重建，同样不等 | 不涉及 | 待议 |
