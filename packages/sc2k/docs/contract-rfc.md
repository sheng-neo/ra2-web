# 契约变更 RFC（日内，加法式）

> 流程见 `CONTRACTS.md` §Z：在本文追加一行 → Lead 30 分钟内合并到 `src/contracts/**`、`src/app/stubs/**`、`src/testkit/**` → 群通知。等待期间 WP 在自己目录用局部类型先行，不得改契约文件。
> 只允许加法：新增可选字段、新增 `Command / SimEvent / RejectReason / ModalId / SoundId` 成员、新增 `Queries` 方法（三套桩同时给默认值）、新增 `PRIV_BUDGET_BYTES` 额度。禁止改名、改语义、删键、改顺序。

| # | 时间 | 提出者（WP） | 要什么（文件 / 键 / 签名） | 为什么 | 三套桩默认值（乐观 / 悲观 / 现实） | 状态 |
|---|---|---|---|---|---|---|
| 0a | WP0 Reconcile | Lead | `queries.ts` 新增 `QUERY_OWNER` | createSim / nullSystem 各自一份表，去重为单一真源 | 不涉及 | 已合并（冻结前） |
| 0b | WP0 Reconcile | Lead | `TechKey` 改名 `arcoPioneer / arcoCanopy / arcoDusk / arcoSkyward`；`NewsType.OpinionGuest / AdviceColumn`；`SimEvent 'arcoExodus'` | 裁定 7：代码内不得出现原版 Arcology / 专栏名 | 不涉及（数值与槽序不变） | 已合并（冻结前） |
| 0c | WP0 Reconcile | Lead | `snapshot.ts` 新增 `STRING_FIELD_HASH / stringFieldHash`（mayorName → 'full'） | `.SC2` 无市长名字段，往返会破坏 hash('sc2') 不变量 | 不涉及 | 已合并（冻结前） |
| 1 | | | | | | 待议 |
| 2 | WP14 | WP14 assets | `data/strings.{zh,en}.ts` 新增 `assets.*` 文案键（全表与回退文案见 `src/io/assets/import/labels.ts` 的 `ASSET_LABELS_ZH / ASSET_LABELS_EN`：`assets.title / hint / pick / useOriginal / art.enabled / art.partial / art.disabled / busy / clear / cleared / files / rows / diagnostics / none / status.{stored,saved,rejected} / privacy / err.<错误码>`） | 导入面板文案须走 strings 表；合入前面板用本地回退表（有 Strings 时缺键回退） | 不涉及桩 | 待议 |
| 3 | WP14 | WP14 assets | `AssetsEntry.createAssetImporter(store, sc2, opts?: { strings?: Strings; spawnWorker?: () => WorkerLike 或 null; now?: () => number })` 第三个可选参数 | 面板需要 Strings 才能用玩家语言显示；测试需要注入假 Worker / 时钟。当前实现已接受该参数（可选，不破坏签名），建议 `app/session.ts` 装配时传入 `strings` | 不涉及桩 | 待议 |
| 4 | WP14 | WP14 assets | `AssetStore` 新增可选 `clearSaves(): Promise<void>`（WP14 的 `AssetStoreExt` 已实现） | `clearAll` 只清缓存（files / decoded / handles / meta），玩家存档需单独删除入口 | 内存桩：清空 saves Map | 待议 |
