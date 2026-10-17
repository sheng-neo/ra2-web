# 契约变更 RFC（日内，加法式）

> 流程见 `CONTRACTS.md` §Z：在本文追加一行 → Lead 30 分钟内合并到 `src/contracts/**`、`src/app/stubs/**`、`src/testkit/**` → 群通知。等待期间 WP 在自己目录用局部类型先行，不得改契约文件。
> 只允许加法：新增可选字段、新增 `Command / SimEvent / RejectReason / ModalId / SoundId` 成员、新增 `Queries` 方法（三套桩同时给默认值）、新增 `PRIV_BUDGET_BYTES` 额度。禁止改名、改语义、删键、改顺序。

| # | 时间 | 提出者（WP） | 要什么（文件 / 键 / 签名） | 为什么 | 三套桩默认值（乐观 / 悲观 / 现实） | 状态 |
|---|---|---|---|---|---|---|
| 0a | WP0 Reconcile | Lead | `queries.ts` 新增 `QUERY_OWNER` | createSim / nullSystem 各自一份表，去重为单一真源 | 不涉及 | 已合并（冻结前） |
| 0b | WP0 Reconcile | Lead | `TechKey` 改名 `arcoPioneer / arcoCanopy / arcoDusk / arcoSkyward`；`NewsType.OpinionGuest / AdviceColumn`；`SimEvent 'arcoExodus'` | 裁定 7：代码内不得出现原版 Arcology / 专栏名 | 不涉及（数值与槽序不变） | 已合并（冻结前） |
| 0c | WP0 Reconcile | Lead | `snapshot.ts` 新增 `STRING_FIELD_HASH / stringFieldHash`（mayorName → 'full'） | `.SC2` 无市长名字段，往返会破坏 hash('sc2') 不变量 | 不涉及 | 已合并（冻结前） |
| 1 | | | | | | 待议 |
| WP6-1 | 第一波 | WP6 transport | `app/stubs/stubQueries.ts` 的 `economy.funding(line)`：乐观 / 现实桩在 `state.economy.funding` 全零（economy 缺席 / 桩、无人写开局 100%）时返回 100 | spec:transport §2.15 的衰败判定是 `funding != 100 && rand(0..99) >= funding`，桩返回 0 等于"交通预算 0%"，任何 economy 为桩的装配里道路 / 铁路一个月内全部变废墟。transport 侧已加 `tuning.transport.budgetDecay=false` 兜底开关，但默认装配仍会踩到 | 乐观 100 / 悲观 0（维持"全部失败"语义）/ 现实：数组全零 → 100，否则原值 | 待议 |
| WP6-2 | 第一波 | WP6 transport | `net.ts` 注释补充（不改值）：`RAIL_SET`（`isRail`）不含铁路桥 0x5A/0x5B，出行 RAIL 模式按 spec §2.2"出行时视为铁路"另行并入（transport 内部 `isRailTile`）；渲染 / 其他消费者若需要"铁路族含桥段"请自行并集 | 口径提醒，避免两处不一致 | 不涉及 | 备忘 |
