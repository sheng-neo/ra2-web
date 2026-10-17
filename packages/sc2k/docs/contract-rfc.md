# 契约变更 RFC（日内，加法式）

> 流程见 `CONTRACTS.md` §Z：在本文追加一行 → Lead 30 分钟内合并到 `src/contracts/**`、`src/app/stubs/**`、`src/testkit/**` → 群通知。等待期间 WP 在自己目录用局部类型先行，不得改契约文件。
> 只允许加法：新增可选字段、新增 `Command / SimEvent / RejectReason / ModalId / SoundId` 成员、新增 `Queries` 方法（三套桩同时给默认值）、新增 `PRIV_BUDGET_BYTES` 额度。禁止改名、改语义、删键、改顺序。

| # | 时间 | 提出者（WP） | 要什么（文件 / 键 / 签名） | 为什么 | 三套桩默认值（乐观 / 悲观 / 现实） | 状态 |
|---|---|---|---|---|---|---|
| 0a | WP0 Reconcile | Lead | `queries.ts` 新增 `QUERY_OWNER` | createSim / nullSystem 各自一份表，去重为单一真源 | 不涉及 | 已合并（冻结前） |
| 0b | WP0 Reconcile | Lead | `TechKey` 改名 `arcoPioneer / arcoCanopy / arcoDusk / arcoSkyward`；`NewsType.OpinionGuest / AdviceColumn`；`SimEvent 'arcoExodus'` | 裁定 7：代码内不得出现原版 Arcology / 专栏名 | 不涉及（数值与槽序不变） | 已合并（冻结前） |
| 0c | WP0 Reconcile | Lead | `snapshot.ts` 新增 `STRING_FIELD_HASH / stringFieldHash`（mayorName → 'full'） | `.SC2` 无市长名字段，往返会破坏 hash('sc2') 不变量 | 不涉及 | 已合并（冻结前） |
| 1 | | | | | | 待议 |
| 2 | 第一波 | WP13 events | strings 键追加：`news.1.headline/.body`（Junk 填充，空池头条）、`news.19/20/21.*`（PoorEducation / PoorHealth / PoorEmployment）、`news.47/48/49.*`（DemandTransit / DemandPolice / DemandFire）、`message.disasterUnavailable`（args.name = `disaster.<kind>` 键；菜单灾害前置条件不满足时的提示） | WORKPLAN v1 必含的 20 类里 WP0 只预置了 14 条文案；6 类月检会把 19–21 推成头条；前置不满足（空城点 Fire、无水点 Flood）需要提示 | 不涉及桩；UI 对缺键按 `strings.t(key)` 回退为键名 | 待议 |
| 3 | 第一波 | WP13 events | 报纸选项真源：请 economy 的 `setOption('paperDelivery' \| 'extraPaper')` 写 `miscSet(state.rawMisc, MISC.paperDelivery / MISC.extraPaper, on ? 1 : 0)`；events 的 `init` 把两者置 1（默认开），`news` 阶段 / `disasterEnded` 以"非零 = 开"读取。长期建议 `CityState` 增 `news: { paperDelivery: boolean; extraPaper: boolean; paperChoice: number }`（SCALAR_FIELDS 标 'sc2'，MISC 0x1004 / 0x1008 / 0x100C） | 契约里 `setOption` 的这两个键没有任何 CityState 字段可写；`rawMisc` 在快照与 `.SC2` 都往返且不入哈希，是现成的落点 | 不涉及桩 | 待议 |
| 4 | 第一波 | WP13 events | `SCALAR_FIELDS` 的 `disaster.pointX / pointY` 翻为 'full'，或在 MISC 零区注册 `disasterPointX = 0x1064 / disasterPointY = 0x1068`（各 4 B） | 灾害原点无 `.SC2` 落点。events 已在灾害结束时把原点复位为 (64,64)，非灾害期往返 hash('sc2') 不变（`shadow.test` 覆盖）；灾害进行中导出再导入时 pointX/Y 变为标记质心 → hash('sc2') 不同 | 不涉及桩 | 待议 |
| 5 | 第一波 | WP13 events | 约定（不改契约）：来自 tick 的模态 `disasterAlert`（灾害开始）/ `extraPaper`（灾害结束号外）由 events 在 emit `modal` 后自行 `state.clock.modalPause++`（阶段之外 core 不会做），UI 关闭时照常 `host.modalClosed()`；`disasterAlert` 的 `answer = 1` → events emit `goto` 原点；订阅版 `newspaper` 仍走 `news` 阶段的 `'suspend'` | 契约只定义了阶段挂起型模态的 modalPause 语义，而灾害开始 / 结束发生在 tick 内 | `testkit.runDays` / `replay` 已对 modalPause>0 调 modalClosed，无需改动 | 待议 |
| 6 | 第一波 | WP13 events → WP1 | `SimHost.advance` / `testkit.runDays`：(a) `advance` 在 thingsTick 把模式切到 Disaster 后仍会跑完本帧的 `advanceDay` 循环（建议 ticks 之后重查 `mode`）；(b) `runDays` 以 `advance(0, …)` 推进，灾害模式下 `disasterAccum` 永不累积 → 随机灾害一旦发生长跑即 stall（建议灾害模式下传 `DISASTER_TICK_MS[speed]` 或 `budgetMs: Infinity` 下按 tick 推进） | 真 events 合入后 WP1 的 50 年长跑 / replay 会在首次随机灾害处停滞（Easy 宽限 8 年后期望 8 年一次） | 归 WP1（sim/core、testkit）；events 测试自带 `fixtures.runTicks` 绕过 | 待议 |
