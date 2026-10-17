# 契约变更 RFC（日内，加法式）

> 流程见 `CONTRACTS.md` §Z：在本文追加一行 → Lead 30 分钟内合并到 `src/contracts/**`、`src/app/stubs/**`、`src/testkit/**` → 群通知。等待期间 WP 在自己目录用局部类型先行，不得改契约文件。
> 只允许加法：新增可选字段、新增 `Command / SimEvent / RejectReason / ModalId / SoundId` 成员、新增 `Queries` 方法（三套桩同时给默认值）、新增 `PRIV_BUDGET_BYTES` 额度。禁止改名、改语义、删键、改顺序。

| # | 时间 | 提出者（WP） | 要什么（文件 / 键 / 签名） | 为什么 | 三套桩默认值（乐观 / 悲观 / 现实） | 状态 |
|---|---|---|---|---|---|---|
| 0a | WP0 Reconcile | Lead | `queries.ts` 新增 `QUERY_OWNER` | createSim / nullSystem 各自一份表，去重为单一真源 | 不涉及 | 已合并（冻结前） |
| 0b | WP0 Reconcile | Lead | `TechKey` 改名 `arcoPioneer / arcoCanopy / arcoDusk / arcoSkyward`；`NewsType.OpinionGuest / AdviceColumn`；`SimEvent 'arcoExodus'` | 裁定 7：代码内不得出现原版 Arcology / 专栏名 | 不涉及（数值与槽序不变） | 已合并（冻结前） |
| 0c | WP0 Reconcile | Lead | `snapshot.ts` 新增 `STRING_FIELD_HASH / stringFieldHash`（mayorName → 'full'） | `.SC2` 无市长名字段，往返会破坏 hash('sc2') 不变量 | 不涉及 | 已合并（冻结前） |
| 1 | | | | | | 待议 |
| 2 | WP2 terrain | WP2 | `queries.ts` `TerrainQuery.slope(i)` 注释「xter & 0x0F」对 0x3X 浅水不成立（低 nibble 是形状码）：真实现对 0x3X / 0x4X 返回 0，0x3E / 0x0D 返回 13 | 池塘是平地，形状码被当坡度会让 placement 误判「有坡」 | 建议 `stubQueries.slopeOf` 同步：0x3X → 0（三套桩同一函数） | 待议（不改签名，只改注释 + 桩） |
| 3 | WP2 terrain | WP2 | `Command.terrainTool.arg` 的约定（供 UI / WP12，不改类型）：`trees` arg<0 = 移除；`forest` abs(arg) = 半径（默认 3），<0 = 移除；`stretch` arg = ±级数；`seaLevel` arg = ±增量（默认 +1）；`raise / lower / stretch / stream` 只取 `path[0]`；`level / water / trees / forest` 用整条 `path`，不合格格跳过、按实际应用格计费 | 契约只给了 `arg?: number`，各工具语义需要一处写明 | 不涉及 | 文档化（已按此实现） |
| 4 | WP2 terrain | WP2 | placement 的 `bulldoze` 清除池塘 / 溪流 / 瀑布（「装饰水」）时没有 Actions 键可调用。现约定：placement 直接 `act.setXbit(i, XBit.Water, false)` + `act.setTerrain(i, alt, slopeCode, alt)`（slopeCode 对 0x3X / 0x4X 为 0），terrain 的 `onTilesChanged(…, 'terrain')` 会收编角点并修正 8 邻浅水形状。若希望更干净，可加 `Actions.clearGroundWater(i): boolean`（owner terrain） | 推土「装饰水」是 bulldozer.demolish 的 $1 语义之一 | 乐观 / 悲观 / 现实：空操作返回 false | 待议 |
| 5 | WP2 terrain | WP2 | `IMPORT_ORDER` 中 terrain 先于 core，而 core.importFrom 整层拷贝 `doc.xbit`：terrain 按 XTER 修正的 WATER / SALT 位因此**写回 `doc.xbit`**（导入期允许改 doc）。建议在 `clock.ts` 的 IMPORT_ORDER 注释里写明「terrain 可修正 doc.xbit」 | 否则修正会被 core 覆盖 | 不涉及 | 文档化（已按此实现） |
| 6 | WP2 terrain | WP2 | `SCALAR_FIELDS` 标 'sc2' 的 `terrain.seaLevel / coast / river` 已由 terrain.exportTo / importFrom 落到 MISC 0x0E40 / 0x0E44 / 0x0E48；无需翻 'full' | 开放问题 #11 对账 | 不涉及 | 已落地 |
