# 契约变更 RFC（日内，加法式）

> 流程见 `CONTRACTS.md` §Z：在本文追加一行 → Lead 30 分钟内合并到 `src/contracts/**`、`src/app/stubs/**`、`src/testkit/**` → 群通知。等待期间 WP 在自己目录用局部类型先行，不得改契约文件。
> 只允许加法：新增可选字段、新增 `Command / SimEvent / RejectReason / ModalId / SoundId` 成员、新增 `Queries` 方法（三套桩同时给默认值）、新增 `PRIV_BUDGET_BYTES` 额度。禁止改名、改语义、删键、改顺序。

| # | 时间 | 提出者（WP） | 要什么（文件 / 键 / 签名） | 为什么 | 三套桩默认值（乐观 / 悲观 / 现实） | 状态 |
|---|---|---|---|---|---|---|
| 0a | WP0 Reconcile | Lead | `queries.ts` 新增 `QUERY_OWNER` | createSim / nullSystem 各自一份表，去重为单一真源 | 不涉及 | 已合并（冻结前） |
| 0b | WP0 Reconcile | Lead | `TechKey` 改名 `arcoPioneer / arcoCanopy / arcoDusk / arcoSkyward`；`NewsType.OpinionGuest / AdviceColumn`；`SimEvent 'arcoExodus'` | 裁定 7：代码内不得出现原版 Arcology / 专栏名 | 不涉及（数值与槽序不变） | 已合并（冻结前） |
| 0c | WP0 Reconcile | Lead | `snapshot.ts` 新增 `STRING_FIELD_HASH / stringFieldHash`（mayorName → 'full'） | `.SC2` 无市长名字段，往返会破坏 hash('sc2') 不变量 | 不涉及 | 已合并（冻结前） |
| 1 | | | | | | 待议 |
| 12a-1 | WP12a | WP12a（外壳框架） | `ShellOptions / ShellHandle` 没有 EventBus / 每帧 tick / 文件动作的入口 | boot 需把 drain 的事件扇出给外壳、每帧节流刷新、把 session 的存读档挂到 File 菜单；契约冻结期间用 `ui/index.ts` 的 `shellControlsOf(handle)`（WeakMap 侧通道，同 `simContextOf`）暴露 `bus / tick / fileActions / version`；建议 v2 在 `ShellHandle` 加可选 `bus?: EventBus; tick?(dtMs): void` | 不涉及 | 待议（已用侧通道绕过） |
| 12a-2 | WP12a | WP12a | strings 新键：`ui.toolbar`（浮动工具栏标题）、`ui.saved`（存档完成提示）、`ui.help.bubble`（帮助气泡前缀）、`ui.autosave` | 外壳文案；当前用 `ui/theme.ts` 的 `tr(key, ...fallbacks)` 回退到 `menu.options.showToolbar` / `ui.save` / `ui.help` | 不涉及 | 待议 |
| 12a-3 | WP12a | WP12a | `setOption` 的 `paperDelivery / extraPaper` 在 `CityState` 无专属字段 | Newspaper 菜单的勾选状态只能读 `rawMisc[0x1004] / [0x1008]`（MISC paperDelivery / extraPaper 偏移）；请 events（WP13）的 `setOption` 落到这两个偏移，或契约在 state 加 `news: { delivery: boolean; extra: boolean }` | 乐观 / 悲观 / 现实：0（不订阅） | 待议 |
| 12a-4 | WP12a | WP12a → WP12b 内部约定 | 命令结果型模态的 `answer(n)` 语义：`bridgeType` = `payload.options` 下标（≥0），−1 = 取消（× 按钮）；`neighborConnect` 1 = 接受 / 0 = 拒绝；`teamPick` = 运动 0..4（经 `modalAnswer` 转发给 placement） | ModalHost 据此重发 `network+bridge` / `neighborConnection` / `modalAnswer`；工厂缺失时的通用对话框已按此实现（是 / 否、桥型按钮、五队按钮） | 不涉及 | 已在 ui/modalHost.ts 实现 |
| 12a-5 | WP12a | WP12a → WP12b 内部约定 | `WindowDeps.onTilePicked(fn)` 注册时若已有最近一次点选会**立即回调一次** | Query 工具先 `openWindow('query')` 再广播点选；窗口在工厂里注册监听即可拿到首个点选（不需要外壳再补发） | 不涉及 | 已实现 |
| 12a-6 | WP12a | WP12a | v1 显示档限制 S / M / L（`ui/tools/toolController.ts` 的 `ZOOM_MIN = 1 / ZOOM_MAX = 3`） | 桩 provider 与程序化 provider 原生只有 S / M / L，XS / XL 走回退链前画面为空；WP11 的派生档（×2 / ÷2）落地后把两个常量放开到 0 / 4 | 不涉及 | 待 WP11 |
| 12a-7 | WP12a | WP12a | XTHG 物件类型 → `ActorId` 映射表 `THING_ACTOR`（`app/loop.ts`，spec:file-formats §2.2.10：1 飞机 2 直升机 3 船 5 怪兽 6 爆炸 7/8/E 调度 9 帆船（variant≠0 湖怪）A/B 列车 C/D 地铁列车 F 龙卷风 10 英雄→直升机） | 每帧 `renderer.setActors(actorsOf(q.disasters.things()))` 需要它；WP13 / WP11 若另有口径请以契约 `render.ts` 收编为单一真源 | 不涉及 | 待议 |
| 12a-8 | WP12a | WP12a | `ToolDef.hotkey` 与 UI 全局键冲突时 UI 表优先（WP0 既成事实 7）：`1–4` 速度、`[ ]` 旋转、`P` 暂停、`W` 电力组、`A` 供水组、`F6–F9` 显示开关；工具组键见 `ui/tools/keymap.ts` | `data/tools.ts` 的 `hotkey` 列在 v1 不被外壳读取（避免 `1` 同时是住宅分区与速度档） | 不涉及 | 已实现（open-questions #15 裁定） |
