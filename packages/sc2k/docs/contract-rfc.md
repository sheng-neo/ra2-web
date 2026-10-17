# 契约变更 RFC（日内，加法式）

> 流程见 `CONTRACTS.md` §Z：在本文追加一行 → Lead 30 分钟内合并到 `src/contracts/**`、`src/app/stubs/**`、`src/testkit/**` → 群通知。等待期间 WP 在自己目录用局部类型先行，不得改契约文件。
> 只允许加法：新增可选字段、新增 `Command / SimEvent / RejectReason / ModalId / SoundId` 成员、新增 `Queries` 方法（三套桩同时给默认值）、新增 `PRIV_BUDGET_BYTES` 额度。禁止改名、改语义、删键、改顺序。

| # | 时间 | 提出者（WP） | 要什么（文件 / 键 / 签名） | 为什么 | 三套桩默认值（乐观 / 悲观 / 现实） | 状态 |
|---|---|---|---|---|---|---|
| 0a | WP0 Reconcile | Lead | `queries.ts` 新增 `QUERY_OWNER` | createSim / nullSystem 各自一份表，去重为单一真源 | 不涉及 | 已合并（冻结前） |
| 0b | WP0 Reconcile | Lead | `TechKey` 改名 `arcoPioneer / arcoCanopy / arcoDusk / arcoSkyward`；`NewsType.OpinionGuest / AdviceColumn`；`SimEvent 'arcoExodus'` | 裁定 7：代码内不得出现原版 Arcology / 专栏名 | 不涉及（数值与槽序不变） | 已合并（冻结前） |
| 0c | WP0 Reconcile | Lead | `snapshot.ts` 新增 `STRING_FIELD_HASH / stringFieldHash`（mayorName → 'full'） | `.SC2` 无市长名字段，往返会破坏 hash('sc2') 不变量 | 不涉及 | 已合并（冻结前） |
| 1 | | | | | | 待议 |
| 2 | WP3 | placement | `Actions` 新增 `refund(amount: number): void`（或明确 `charge(cost < 0)` = 退款并写账） | `neighborConnection` 拒绝 / 资金不足回滚边缘格时要退还铺设费（WORKPLAN WP3"回滚并退费"）；现契约 `charge(cost ≤ 0)` 恒 true 且桩不改资金，placement 暂时直接 `state.economy.funds += fee`（`sim/placement/commands.ts` rollbackEdgeTile 处有注释） | 三套桩：`funds += amount`（不 emit） | 待议 |
| 3 | WP3 | placement | app/wire：`createWiredHost({ tuning: { placement: { v1Tools: V1_TOOL_IDS } } })`；services 合入后再加 `microsimFullRejects: true` | `availability` 的 notImplemented 只认 tuning 注入的白名单（null = 全部可用）；`microsimFull` 依赖 `allocMicrosim` 返回 −1 的语义（桩恒 −1，故默认不拒绝） | 不涉及契约 | 待 Lead 接线 |
| 4 | WP3 | placement | 命令结果型模态 payload 形状（供 WP12b）：`bridgeType → { from, to, length, options: BridgeKind[] }`；`neighborConnect → { at, kind: NetFamily\|'highway', cost }`；`teamPick → { at }`（`modalAnswer.answer` = 球队索引 0..30，写 `rewards.stadiumTeams` 位掩码） | 契约只写了 bridgeType 的 payload，另外两个由实现约定 | 不涉及契约 | 备忘 |
