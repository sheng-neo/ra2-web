# 契约变更 RFC（日内，加法式）

> 流程见 `CONTRACTS.md` §Z：在本文追加一行 → Lead 30 分钟内合并到 `src/contracts/**`、`src/app/stubs/**`、`src/testkit/**` → 群通知。等待期间 WP 在自己目录用局部类型先行，不得改契约文件。
> 只允许加法：新增可选字段、新增 `Command / SimEvent / RejectReason / ModalId / SoundId` 成员、新增 `Queries` 方法（三套桩同时给默认值）、新增 `PRIV_BUDGET_BYTES` 额度。禁止改名、改语义、删键、改顺序。

| # | 时间 | 提出者（WP） | 要什么（文件 / 键 / 签名） | 为什么 | 三套桩默认值（乐观 / 悲观 / 现实） | 状态 |
|---|---|---|---|---|---|---|
| 0a | WP0 Reconcile | Lead | `queries.ts` 新增 `QUERY_OWNER` | createSim / nullSystem 各自一份表，去重为单一真源 | 不涉及 | 已合并（冻结前） |
| 0b | WP0 Reconcile | Lead | `TechKey` 改名 `arcoPioneer / arcoCanopy / arcoDusk / arcoSkyward`；`NewsType.OpinionGuest / AdviceColumn`；`SimEvent 'arcoExodus'` | 裁定 7：代码内不得出现原版 Arcology / 专栏名 | 不涉及（数值与槽序不变） | 已合并（冻结前） |
| 0c | WP0 Reconcile | Lead | `snapshot.ts` 新增 `STRING_FIELD_HASH / stringFieldHash`（mayorName → 'full'） | `.SC2` 无市长名字段，往返会破坏 hash('sc2') 不变量 | 不涉及 | 已合并（冻结前） |
| 1 | | | | | | 待议 |
| 2 | WP5 | D（zones） | `contracts/io.ts` `MISC` / `MISC_BYTES` 登记零区条目 `zonesExt: 0x1064`（21 × i32 = 84 B，至 0x10B7；首字魔数 `0x5A4E5331`） | zones 的 `hash:'sc2'` 派生标量在 MISC 表无落点（`census.com/ind/citySize/taxable*/workforce/jobs/unemploymentPct/tiles.*`、`caps.*`、`neighbors[k].connections`），为保 `.SC2` 往返 `hash('sc2')` 不变，`sim/zones/save.ts` 已把它们写入该区段（compat 导出清零；无该块时 `postLoad('sc2')` 从图层重算）。登记以防其他系统碰撞；若 Lead 更愿把这些字段翻成 `'full'`，删掉 save.ts 的 ext 块即可 | 不涉及 | 待议 |
| 3 | WP5 | D（zones） | `census.arcoPop` 的写权说明（或新增 `ServicesQuery.arcoPop(): number`） | spec:zones §2.7 `arcoPop = services.arcoPop()`（MISC 0x1020 由 services 微模拟产出），但契约没有查询；zones 现把 `state.census.arcoPop` 当作 services 写入的只读输入（census 阶段不覆盖，只据此算 `taxable*` / `citySize`），`exportTo` 也把它写到 MISC 0x1020。请 services（WP7）在 demographics / facilityAnnual 阶段写 `state.census.arcoPop` | 若加查询：0 / 0 / 0 | 待议 |
| 4 | WP5 | D（zones） | strings 新键 `neighbor.name.0..15`（原创邻城名单，当前名单在 `sim/zones/tuning.ts` `neighborNames`） | 邻城名是玩家可见文案；现直接以英文原创名存入 `state.neighbors[k].name`（`.SC2` 只存 `index`，导入时按名单还原）。若 UI 要本地化，应改为 strings 键并由 UI 翻译 `index` | 不涉及 | 待议 |
| 5 | WP5 | D（zones） | `app/wire.test.ts` 第一条用例「非 core 全为桩」与 `WIRE_STUB_ALLOWLIST` | 任一真系统合入后 `expect(s.stub).toBe(true)` 必失败（WP5 分支上即如此，其余全绿）。建议改为「桩必须在 allowlist 内」（`if (s.stub) expect(WIRE_STUB_ALLOWLIST).toContain(s.id)`），并在合入 WP5 时从 allowlist 删去 `'zones'` | 不涉及 | 待议 |
