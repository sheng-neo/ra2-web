# 领域规格：经济、预算、时钟调度与游戏流程（Economy, Budget, Clock & Game Flow）

> 适用范围：`packages/sc2k` 中的 `sim/economy`（资金、税收、法令金额、债券、部门资金率、维护费、造价与扣费 API、预算窗口模型）、`sim/clock`（日/月/年时钟、速度档位、**全局唯一的 25 天日历调度表 `DAY_PHASES`**、**模拟 PRNG 契约 `Prng`**）、`sim/scenario`（情景目标评估、简报、胜负）以及这些状态在存档 `MISC / XGRP / SCEN` 中的编码。
> **不再**属于本文：奖励建筑与城市等级、市民诉求、市长支持率、LE/EQ 人口学、法令的非金钱模型效果——这些的唯一所有者是 `services-models.md`（§2.12 列出本文与它的接口）。
> 目标读者：并行实现各模块的工程师（含 AI agent）。本文给出可直接实现的数据结构、公式、数值表与伪代码。
> 蓝本：SimCity 2000 Windows 95 Special Edition（下称 SC2K）。
> 置信度标记：**[高]** 一手资料直接支持（dfloer/SC2k-docs 的存档格式与模拟机制文档、文本数据文档；或 `services-models.md` 已标 [高] 的逆向还原）；**[中]** 多个二手来源一致或强推断；**[低]** 仅凭记忆 / 单一二手来源 / 为"可实现"而给出的建议值——必须做成 `EconomyTuning` 的可调参数并列入 §5；**[设计]** 本项目自行决定、原版不存在或无从考证的工程约定。
> 版权铁律：本文只描述规则与数值，不含任何 Maxis/EA 的文本、图像或数据文件；窗口标题、按钮文字、法令名称、情景简介在实现时一律使用本项目自己撰写的字符串（本文中的英文名仅作术语标识）。参考仓库仅用于理解机制，本文的接口与伪代码均为原创组织。
> 与兄弟规格的边界：人口统计、RCI 需求（含税率/法令对需求的修正表）、11 种产业归 `zones-growth-demand.md`；交通六条预算线的**计数口径、单价与衰败规则**归 `transport-traffic.md` §2.4/§2.15，本文只负责把它们算成钱并扣款；电厂寿命与供电/供水利用率归 `power-water.md`；地形工具费用归 `terrain.md` §2.9；顾问文案的选取规则归 `disasters-events.md` §2.11；SCEN/TEXT/PICT 的字节布局归 `file-formats.md` §2.5。本文在交界处只给接口与一致性要求。

---

## 1. 概述

SC2K 的经济是一张**按月结算、按年汇报**的现金流表。所有钱都是整数美元（原版为有符号 32 位整数），每月第 0 天一次性结清上个月，每年 1 月第 0 天弹出预算窗口回顾上一年并设定新一年参数。

| 现金流 | 方向 | 月度公式（概要） | 本文章节 |
|---|---|---|---|
| 财产税 | 收入 | `Σ_z floor(rate_z × taxablePop_z / 75)`，工业按 11 种产业加权 | §2.4 |
| 法令 | 收入 / 支出 | 各法令为某类税收的固定百分比（极小的数） | §2.5 |
| 债券利息 | 支出 | 每张 $10,000 债券按各自利率付息，只付息不还本 | §2.6 |
| 部门经费 | 支出 | `floor(数量 × 单价 × 资金率% / 12)`，警 / 消 / 医 / 教（校、学院）/ 交通 6 线 | §2.7–§2.8 |
| 固定支出 | 支出 | 无滑块的项目（公交站） | §2.8 |
| 建造 / 工具 | 一次性支出 | 放置瞬间扣款，资金不足则拒绝 | §2.9, §3.6 |
| 债券发行 / 偿还 | 一次性 | +$10,000 / −$10,000，最多 50 张 | §2.6 |

核心事实（实现者必须先接受的八条）：

1. **税收按月计、按人头计、与地价无关**：`税率 × 被征税人口 / 75` 是每月收入 **[高]**。地价本意要参与税收但原版没有实现 **[高]**。被征税人口包含 Arcology 人口的一个份额（住宅 1/6、商业与工业各 1/12，§2.4.1）**[中]**。
2. **部门经费是"数量 × 单价 × 资金率"**，预算窗口和存档都按"当前数量 + 当前资金率 + 12 个月历史"保存 **[高（结构）]**。资金率 < 100% 不是"效率打折"这么简单：交通线路会物理损毁、监狱会放人、学校会退步并上报纸 **[高（交通）/ 中（其他）]**——这些效果由交通与服务规格定义，本文只提供资金率。
3. **债券是永续付息贷款**：固定面额 $10,000，利率在发行时锁定，每月付息，只有玩家点击"偿还"才一次性还本，且必须**先还最早的** **[高]**。利率以"百分比 × 10,000"的整数存储，窗口显示向下取整，计算用真实值 **[高]**。
4. **法令的钱极小**：收入型法令只是某类税收的 1%–2%，成本型法令是某类税收的 1/6%–1% **[高（表）/ 中（解释）]**。新城里几乎全部显示为 $0，这是原版观感。法令的**非金钱效果不在本文定义**（§2.5）。
5. **1 年 = 12 月 × 25 天 = 300 天** **[高]**；速度档只改变真实时间与天的换算，不改变任何规则。**每个月的 25 天各有固定的阶段表 `DAY_PHASES`（§2.3），它是全仓库唯一的模拟调度表**；任何模块都不得自带"月末一次性结算"的日程。
6. **资金可以为负**（状态栏红字），负债过深会被赶下台 **[中]**；但任何花费 > 当前资金的操作都被拒绝 **[中]**。
7. **只有一条模拟随机流**：`Prng`（§2.13）按 `DAY_PHASES` 的阶段顺序与玩家命令顺序消费，状态随存档持久化；地形生成、森林刷子、程序化美术、UI 抖动各用自己的独立流，不得触碰模拟流。
8. **情景（Scenario）是普通城市 + 一组目标 + 一个时限 + 一场开场灾害**（§2.16）；目标在每月第 22 天评估，时限到期一次性判定胜负，之后可继续沙盒游玩。

模块输入（只读）：分区模块的人口统计 `census`（R/C/I 人口、arco 人口、可征税人口、产业比例）、服务模块维护的公共建筑计数 `structureCounts`、交通模块的六线计数、地价总和（信用评级用）、国家经济（`natTrend`）、`Prng`。
模块输出：`funds`、每月 / 每年现金流报表、资金率（供警/消/医/教/交通模块读取）、生效法令位掩码（供需求 / 电力 / 服务模块读取）、债券列表与信用评级、`XGRP` 图表历史（经济相关序列）、日历与阶段调度事件、情景评估结果、报纸需要的经济事件。

---

## 2. 原版行为

### 2.1 新城初始化：起始年份、难度、起始资金

新城对话框的选项：城市名、难度（Easy / Medium / Hard）、起始年份（1900 / 1950 / 2000 / 2050）、地形参数（见 `terrain.md` §2.7）。

| 项 | Easy (1) | Medium (2) | Hard (3) | 置信度 |
|---|---|---|---|---|
| 起始资金 `funds` | $20,000 | $10,000 | $10,000 | 高 |
| 起始债券 | 无 | 无 | 1 张 $10,000，利率 3%（`rateRaw = 30000`） | 高 |
| `MISC 0x001C` Game Level | 1 | 2 | 3 | 高 |
| `natTrend`（`MISC 0x005C`） | 0 | 1 | 2 | 高（取值）/ 低（语义） |
| 市民对税率的敏感度 | 低 | 中 | 高（倍率见 `zones-growth-demand.md` §2.8.3） | 中 |
| 工业需求修正 | 略正 | 0 | 略负 | 低 |
| 开局随机灾害宽限 | 见 `disasters-events.md` §2.3.1 | | | — |

> Hard 难度的 $10,000 是**借来的**：开局即有 1 张债券，每年付 $300 利息，必须还 $10,000 才能清债。这就是三档难度的全部资金差异。

起始年份决定国家人口（`natPop`，单位千人）：

| 起始年份 | `natPop` | `natValue = 3 × natPop / 10` | `natTax` | 置信度 |
|---|---|---|---|---|
| 1900 | 10,000 | 3,000 | 1 | 高 |
| 1950 | 25,000 | 7,500 | 1 | 高 |
| 2000 | 60,000 | 18,000 | 1 | 高 |
| 2050 | 150,000 | 45,000 | 1 | 高 |

科技发明年份（17 个 `MISC 0x0738..0x0778` 槽位、`base + rng.int(20)`、已发明写 0）的**唯一所有者是 `sim/tech`**（`disasters-events.md` §2.9，基准年常量在 `building-catalogue.md` 的 `TECH_BASE_YEAR`）；本文只在 §2.9 造价表的"可用条件"列引用它，并在 §2.3 的年初序列里安排它的调用点。

其他开局值：三类财产税率与 11 种产业税率全部 = 7；所有部门资金率 = 100；法令全部未生效；`autoBudget = false`；速度 = Llama（3）**[低]**；城龄 0 天，日期为起始年 1 月第 0 天；模拟 PRNG 用新城对话框的 `seed`（或 `Date.now()` 派生）初始化并立刻写入 `ClockState.prng`；城市等级 / 奖励位 / 军事基地 / 里程碑由 `services-models.md` §2.8 初始化为 0；邻城与国家经济按 `zones-growth-demand.md` §2.10 / §2.8.5 初始化。

### 2.2 游戏时钟与速度档位

| 量 | 规则 | 置信度 |
|---|---|---|
| 年 | 12 个月，内部 `month ∈ 0..11`（0 = 1 月） | 高 |
| 月 | 25 天，内部 `day ∈ 0..24` | 高 |
| 城龄 `MISC 0x0010` | 自建城起的天数 `age = (year − founded) × 300 + month × 25 + day`；反推 `year = founded + ⌊age/300⌋`、`month = ⌊(age mod 300)/25⌋`、`day = age mod 25` | 高 |
| 绝对月序号 | `monthIndex = ⌊age / 25⌋`（情景时限、半年序列用） | 高（推导） |
| 日期显示 | "月份 年份"（本项目自己的月份名），年份无上限 | 高 |
| 速度档 `MISC 0x0FEC` | 1 = Paused, 2 = Turtle, 3 = Llama, 4 = Cheetah, 5 = African Swallow | 高 |
| 模态暂停 | 年度预算窗口、军事基地提案、灾害确认框、情景胜负框、游戏结束框弹出时时钟停止（`modalPause > 0`）；关闭后恢复原速度，并**从被挂起的阶段继续**（§3.7） | 中 |
| 灾害模式 | `cityMode = 2` 时不推进日历（`disasters-events.md` §2.2），因此预算、生长、情景计时全部停摆 | 高 |

速度与真实时间的换算原版未知，本文建议值 **[低]**（`EconomyTuning.msPerDay`）：

| 档 | 每天毫秒 | 每月约 | 说明 |
|---|---|---|---|
| Paused | ∞ | — | 允许建造，不推进 |
| Turtle | 480 | 12 s | |
| Llama | 160 | 4 s | 默认 |
| Cheetah | 40 | 1 s | |
| African Swallow | 0 | 尽可能快 | 每帧推进尽可能多天，单帧上限 `maxDaysPerFrame = 10`，覆盖层重绘降频 |

**一个模拟 tick = 一天**：`advanceDay()` 依次执行 `DAY_PHASES[day]` 的全部阶段，然后 `age += 1`（§3.7）。天是最小模拟单位；**所有金钱只在第 0 天变动**（建造扣费、债券操作、电厂自动重建等玩家 / 事件驱动的一次性扣费除外）。

### 2.3 日历总调度表（`DAY_PHASES`）—— 全仓库唯一的模拟日程

本节取代旧稿的"月末 1–9 步 `endOfMonth`"。日程来自 `services-models.md` §2.1 所述的原版调度还原 **[高（天数与顺序）]**，本文把它提升为**所有模块共同遵守的唯一调度表**：每一天调用哪个模块的哪个入口、读哪一版数据、写什么、是否消费模拟 PRNG。兄弟规格中与此表不一致的描述（zones §3.4 的 `i % 25` 切片、power-water §3.4 的"同一函数内先电后水"、旧版 economy 的月末列表）均以本表为准。

#### 2.3.1 逐日阶段表

`m` 为本月（0..11），`prev` 为上个月。"读（版本）"中的 `@dN` 表示该数据由本月第 N 天的阶段产出，`@prev` 表示上月产出。

| day | 阶段 id | 所有者 / 入口 | 读（版本） | 写 | 用 sim PRNG | 可挂起 |
|---|---|---|---|---|---|---|
| 0 | `settleMonth` | 本文 §3.3 `economy.settleMonth(prev)`（`age == 0` 时跳过） | `census.final@prev d21`、`structureCounts`、交通六线计数、`bonds`、`funding`、`taxRate`、`industryTax`、`ordinances` | `funds`、`history[prev]`、`ytd`、`counters.advertising`、`MISC` 税线/经费线/债券块 | 否 | 否 |
| 0 | `closeYear` *(仅 1 月且 `age > 0`)* | 本文 §3.4 | `ytd`、`funds` | `lastYear`、`yearOpeningFunds`、弹劾判定 → `impeached` 事件 | 否 | 是（游戏结束框） |
| 0 | `techCheck` *(仅 1 月)* | `disasters-events.md` §2.9 `tech.checkInventions(year)` | `year`、`techYears` | `techYears`（已发明写 0）、`INVENTION/INNOVATION` 新闻 | 否 | 否 |
| 0 | `nationalAnnual` *(仅 1 月)* | `zones-growth-demand.md` §2.8.5（`natPop/natValue/natTrend`）+ 本文 §3.4 `nationalAnnual`（`fedRateRaw`） | `national`、`fedRateRaw` | `national`、`fedRateRaw`、`fedRate` 事件 | **是** | 否 |
| 0 | `neighborsAnnual` *(仅 1 月)* | `zones-growth-demand.md` §3.5 | `neighbors`、连接数 | `neighbors` | **是** | 否 |
| 0 | `approvalSurvey` *(仅 1 月)* | `services-models.md` §2.10.3 `surveyApproval` | 四张图表当前值、失业率、`taxRate.r`、`workforceEQ/LE`、`normalPop` | `mayorApproval`、抱怨排序 | **是**（100 次抽样） | 否 |
| 0 | `facilityAnnual` *(仅 1 月)* | `services-models.md` §2.6.2 / §2.8.3 `annualFacilityUpdate` | `XMIC`、`funding`、`tileCounts`、`cohorts`、`mayorApproval@同日` | `XMIC`、`MISC 0x1020/0x1038/0x103C`、`fundeducation/fundprison` 事件、Launch 升空（点写 `XBLD`，+$ 入 `funds`） | **是** | 否 |
| 0 | `utilitiesAnnual` *(仅 1 月)* | `power-water.md` §3.4 `annualUtilityUpdate` | `plants`、`lastPower.usagePct`、`noDisasters`、`funds` | `plants.ageYears/lastLoadPct`、到期 → `destroyStructure`（点写 `XBLD`，置 `dirty.power`）或自动重建（扣 `funds`） | **是**（负载抖动） | 否 |
| 0 | `budgetWindow` *(仅 1 月且 `age > 0`)* | 本文 §3.4 | `lastYear`、当前滑块 | `budgetWindow` 事件（`!autoBudget` 时打开模态窗）；`yearClosed` 事件始终发出 | 否 | **是** |
| 0 | `beginMonth` | `zones-growth-demand.md`（人口累加器清零）；本文清本月事件去重表 | — | `census.acc = 0`、`monthEvents = {}` | 否 | 否 |
| 1 | `powerScan` | `power-water.md` §2.4 / §3.3 `runPowerScan` | `XBLD`、`XBIT.POWERABLE`、`XUND`（地铁/管线不导电）、`weather.wind/humid`、`ordinances` bit 8 | `XBIT.POWERED`（整体重建）、`lastPower`（`usagePct`、`supplied`、`consumers`） | **是**（风 / 太阳能逐电厂格抽样） | 否 |
| 2 | `dataMaps` | `services-models.md` §2.3 `runDataMaps` | `XBLD`、`XZON`、`XBIT.POWERED@d1`、`XTRF`（上月衰减后）、旧 `XPLT/XCRM/XPOP/XROG`、`ordinances` bit 2/7/11/12、`MISC 0x1034/0x104C` | `XPLT`、`XVAL`、`XPLC`、`XFIR`、`XPOP`、`XROG`、`XCRM`（整体替换）、`MISC 0x0028/0x002C/0x0034/0x1018/0x101C` | 否 | 否 |
| 3–18 | `growthScan(step, substep)` | 复合阶段，主循环归 `zones-growth-demand.md` §3.4；每格回调顺序见 §2.3.3 | `XVAL/XCRM/XPLT@d2`、`XBIT.POWERED@d1`、`XBIT.WATERED@prev d20`、`demand@prev d21`、`roadDistance`、`funding`（交通六线）、`weather.wind` | `XBLD`、`XZON`（点写）、`XTRF`（累加）、`census.acc`、lot 状态、Arcology `XMIC.stat0`、港口 / 机场 / 军事区生长、交通衰败（点写） | **是**（每格固定顺序） | 否 |
| 19 | `trafficDecay` | `transport-traffic.md` §3.7 / `services-models.md` §3.3 `decayTraffic` | `XTRF` | `XTRF -= XTRF >> 2`、`MISC 0x0030` | 否 | 否 |
| 20 | `waterScan` | `power-water.md` §2.9 `runWaterScan` | `XUND`、`XBIT.PIPED`、`XBIT.POWERED@d1`、`weather.humid` | `XBIT.WATERED`（整体重建）、`lastWater`、`MISC 0x104C` | 否 | 否 |
| 21 | `census` | `zones-growth-demand.md` §3.3 `finalizeCensus` | `census.acc`、arco 记录 | `census.final`（含 `taxable*`，§2.4.1）、`MISC 0x0074/0x102C/0x1020/0x0FA4/0x05F0..0x060C` | 否 | 否 |
| 21 | `demand` | `zones-growth-demand.md` §3.2 `computeDemand`；§3.5 产业月更新 | `census.final@d21`、`taxRate`、`industryTax`、`ordinances`、caps 输入、`national`、`prevDemand` | `demand`（`MISC 0x0718`）、`industry`、`MISC 0x016C` | **是**（噪声） | 否 |
| 21 | `demographics` | `services-models.md` §2.7 `runDemographics` | `census.final@d21`、`funding`、`ordinances`、`pollutionTotal@d2`、`cohorts` | `cohorts`（`MISC 0x007C..0x0168`）、`MISC 0x0044/0x0048/0x004C` | **是** | 否 |
| 21 | `graphs` | 本文 §2.14 `stats.pushMonthly` | 以上全部"当前值" | `XGRP` 月序列；6 月 / 12 月推半年序列；`year % 5 == 0` 的 12 月推 5 年序列 | 否 | 否 |
| 22 | `milestones` | `services-models.md` §2.8.1 `checkMilestones` | `normalPop@d21` | `progression`、`MISC 0x0020/0x0078`、`reward` / `militaryOffer` 事件 | 否 | **是**（军事基地提案） |
| 22 | `scenario` | 本文 §2.16 `scenario.evaluate` | `census.final`、`funds`、`MISC 0x0028/0x002C/0x0030/0x0034`、`tileCounts` | `scenario.result`、`scenario` 事件 | 否 | **是**（胜负框） |
| 22 | `solvency` | 本文 §2.11（默认 `impeachCheck = 'yearEnd'` 时此处空转；`'monthly'` 时在此判定） | `funds` | `impeached` 事件 | 否 | 是 |
| 23 | `uiRefresh` | app（统计窗口、小地图刷新；不改模拟状态） | — | — | 否 | 否 |
| 24 | `weatherAndDisaster` | `disasters-events.md` §3.3 `monthlyCheck`（天气生成 → 月检新闻 → 随机灾害判定） | `weather`、四张图表、`cityDays`、难度 | `weather`（`MISC 0x0060..0x006C`）、`pending` 灾害、新闻候选 | **是** | 否 |
| 24 | `cityStatus` | `services-models.md` §2.10.4 `cityStatus` | `weather`、`usagePct`、`normalPop`、各类建筑数、连接数、caps | 状态栏诉求、`citizenDemand` 事件 | **是**（休闲四选一） | 否 |
| 24 | `news` | `disasters-events.md` §2.10 `news.monthly` | 本月全部事件池 | 报纸选稿 / 投递 | **是** | 否 |

规则：

- 同一天内各阶段**严格按表中行序**执行；同一阶段内部的遍历顺序由其所有者规格定义（例如 `powerScan` 的线性索引升序、`growthScan` 的 4×4 子步、`demographics` 的"死亡升序 → 老化降序 → 出生 → 迁移"）。
- 表中所有 `*(仅 1 月 …)` 阶段在其他月份直接跳过，不消费 PRNG。
- "可挂起"= 该阶段可能弹出模态框并返回 `'suspend'`；时钟停在该阶段之后，关闭对话框后从下一阶段继续（§3.7），**不重跑已执行的阶段**。
- 玩家改动触发的即时电 / 水重扫（`power-water.md` §3.4 的 `dirty.*`）、放置建筑时的 NIMBY 掷骰、体育场选队、桥梁对话框等**不是阶段**，它们在触发它们的命令处理（或当日所有阶段结束后的 `flushDirtyRescans`）中执行，同样消费模拟 PRNG（§2.13.3）。
- 城市价值 `MISC 0x0024`（`services-models.md` §2.10.2）是派生值：在改动地块的命令末尾增量重算，不占阶段。
- 读档后：先执行 `rebuild()`（`file-formats.md` §3.4.2），然后按 `power-water.md` 的约定跑一次电 / 水重扫（阶段外，**不消费 PRNG**——风 / 太阳能用存档里的 `lastPower` 值），再从 `age % 25` 对应的那一天开始推进。

#### 2.3.2 年初序列（1 月第 0 天）

把旧稿的 `endOfYear`（原写在 12 月之后）并入新年 1 月第 0 天，顺序即 §2.3.1 第 0 天的行序：

```
day0(January, age > 0):
  settleMonth(December)       // 12 月的税收 / 经费 / 利息 → funds；history[11]
  closeYear()                 // 生成 YearReport；弹劾判定（§2.11）；若被弹劾 → 挂起，游戏结束
  techCheck(year)             // 发明公告（disasters §2.9）
  nationalAnnual()            // natTrend 随机游走、natPop(year)、fedRate 更新（zones §2.8.5 + 本文 §2.6）
  neighborsAnnual()           // 邻城人口增长（zones §3.5）
  approvalSurvey()            // 100 次抽样（services §2.10.3）
  facilityAnnual()            // 微模拟年度更新（services §2.6.2）、Arcology 入住 / 升空（§2.8.3）
  utilitiesAnnual()           // 电厂老化 / 到期（power-water §3.4）
  budgetWindow()              // yearClosed 事件；!autoBudget → 打开窗口并挂起
  beginMonth()
```

顺序的依据与取舍 **[中]**：`settleMonth` 必须在 `closeYear` 之前，否则年报少一个月；`techCheck` 在预算之前（`disasters-events.md` §2.9 原话"1 月第 0 天预算之前"）；`approvalSurvey` 在 `facilityAnnual` 之前，因为市长官邸记录的 `stat2` 在年度更新时复制支持率（`services-models.md` §3.5 的顺序；该规格 §2.1 的措辞与此相反，以 §3.5 为准，已在跨文件同步清单中标注）；`facilityAnnual` 与 `utilitiesAnnual` 在 `budgetWindow` 之前，使窗口打开时查询窗口的评分、顾问评语、电厂到期事件都已是新年状态。`popGraph`（`MISC 0x007C..0x0168`）**不是** 20 年历史而是 20 个年龄队列（`services-models.md` §2.7），本文不再对它做任何"每年推入"。

#### 2.3.3 生长扫描（第 3–18 天）的 4×4 子步与每格回调顺序

```
d ∈ 3..18:  step = ⌊(d − 3) / 4⌋ ∈ 0..3,  substep = (d + 1) mod 4 ∈ 0..3
visitOrder(step, substep):
  for x = step; x < 128; x += 4:            // x 外层、y 内层，与线性索引 i = x*128 + y 一致（file-formats §2.2.1）
    for y = substep; y < 128; y += 4:
      visit(x, y)
```

每个格子每月恰好被访问一次，16 天覆盖全图 **[高（4×4 子步）/ 中（step↔x、substep↔y 的对应是本项目约定）]**。`visit(x, y)` 内部的回调顺序 **[中]**（它决定 PRNG 消费顺序，任何模块不得自行调整）：

1. `transport.budgetTick(x, y)`：交通衰败掷骰（`transport-traffic.md` §2.15 / §3.7；`funding == 100` 时不掷骰）。
2. `zones.growthVisit(x, y)`：分区评分、出行 `runTrip`（写 `XTRF`）、生长 / 衰退 / 废弃、人口累加 `census.acc`（`zones-growth-demand.md` §3.4，需改为本子步遍历）。
3. `services.onGrowthVisit(x, y)`：Arcology 状况（`XZON & 0x80` 的角位格）、海港 / 机场 / 军事区自动生长（`services-models.md` §3.5）。

#### 2.3.4 阶段 → 读 / 写矩阵与测试

下表只列**图层级数组**（`XBLD XZON XUND XBIT.POWERED XBIT.WATERED XTRF XPLT XVAL XCRM XPLC XFIR XPOP XROG XMIC`）。写法分两类：`bulk` = 整体重建 / 替换；`point` = 通过共享的地块变更 API（`placeTiles / destroyStructure / addTraffic`）逐格写。

| 阶段 | 读 | bulk 写 | point 写 |
|---|---|---|---|
| `settleMonth` `closeYear` `techCheck` `nationalAnnual` `neighborsAnnual` `approvalSurvey` `budgetWindow` `beginMonth` `graphs` `milestones` `scenario` `solvency` `uiRefresh` `cityStatus` `news` | （标量 / 事件） | — | — |
| `facilityAnnual` | `XMIC` `XBLD` | `XMIC` | `XBLD`（Launch 升空） |
| `utilitiesAnnual` | `XBLD` | — | `XBLD`（电厂到期） |
| `powerScan` | `XBLD` `XBIT` `XUND` | `XBIT.POWERED` | — |
| `dataMaps` | `XBLD` `XZON` `XBIT.POWERED` `XTRF` `XPLT` `XCRM` `XPOP` `XROG` | `XPLT` `XVAL` `XPLC` `XFIR` `XPOP` `XROG` `XCRM` | — |
| `growthScan` | `XBLD` `XZON` `XBIT` `XVAL` `XCRM` `XPLT` `XUND` | — | `XBLD` `XZON` `XTRF` `XMIC` |
| `trafficDecay` | `XTRF` | `XTRF` | — |
| `waterScan` | `XUND` `XBIT` | `XBIT.WATERED` | — |
| `census` `demand` `demographics` | `XBLD` `XZON` `XMIC` | — | — |
| `weatherAndDisaster` | （标量） | — | — （灾害启动在下一 tick 的灾害模式里改地块） |

vitest 断言（放在 `sim/clock/dayPhases.test.ts`）：

1. `DAY_PHASES` 覆盖 0..24 每一天，阶段 id 全局唯一，且与 `PHASE_IO` 的键集合相等。
2. 任一天内不存在两个阶段对同一数组都声明 `bulk` 写。
3. 任一数组每月至多一个 `bulk` 写者（`XBIT.POWERED` 与 `XBIT.WATERED` 视为两个数组）。
4. 声明 `reads` 含 `@d1 POWERED` 的阶段其天数 ≥ 1，含 `@d2` 图层的阶段天数 ≥ 2（简单的"读在写后"检查）。
5. 用固定种子跑 24 个月两次，`funds / census / XGRP / 八张图层 / prng.state()` 逐字节相同（可重放性）。

### 2.4 财产税

#### 2.4.1 收入公式 [高（公式）/ 中（"每月"的判定、arco 份额）]

```
taxableRes = census.res + ⌊arcoPop / 6⌋
taxableCom = census.com + ⌊arcoPop / 12⌋
taxableInd = census.ind + ⌊arcoPop / 12⌋
monthlyTax.R = floor(taxRate.r × taxableRes / 75)
monthlyTax.C = floor(taxRate.c × taxableCom / 75)
monthlyTax.I = floor(taxableInd × Σ_k (ratio_k × tax_k) / 100 / 75)     // 11 种产业加权，见 §2.4.3
monthlyTax.total = R + C + I
```

- `census.res/com/ind` 是分区模块给出的"已建、供电、有人口"的建筑人口（施工中、废弃、断电、教堂不计，见 `zones-growth-demand.md` §2.4/§2.7）。
- **Arcology 份额 [中]**：`services-models.md` §2.8.3 指出需求模块把 `arcoPop/6` 计入住宅税基、`/12` 计入商业与工业税基。本文采用这一口径，`taxable*` 三个字段**由 `census` 提供**（zones §2.7 / §3.3 需补齐这三个字段），本模块不自己算。写入 `MISC 0x077C/0x07E8/0x0854` 首字（"当前被征税人口"）的就是 `taxable*`，`services-models.md` 的 `taxedResidentialPop()` 读的也是它（Free Clinics 容量用）。
- 来源文档只给了 `税率 × 人口 / 75`，未注明周期。判定为**每月**的依据：存档为每条税线保存 12 个月的（人口，税率）对，年报表 = 12 个月之和；且若按年计，5 万人口城市一年只有 $4,667，连十座警局都养不起，与原版明显不符。按月计：1 万人口 7% ≈ $933/月 ≈ $11,200/年；一个 2,000 人的新城约 $2,240/年——这与原版早期"收入是涓涓细流"的观感一致。
- 税率范围 0..20 的整数 **[高]**，默认 7 **[高]**。预算窗口主滑块一次设置 R、C、I 三个税率并把 11 种产业税率同步为同一值；产业窗口可再单独调整各产业 **[中（三值分存是存档事实）/ 低（UI 行为）]**。
- 结算时机：每月第 0 天用**上月第 21 天**定稿的 `census.final`（§2.3.1）。

#### 2.4.2 税率对需求与报纸的影响

对需求的修正表（`taxMod[t]`，单位需求点，并乘难度敏感系数）由 `zones-growth-demand.md` §2.8.3 定义；对市长支持率的影响（`3 × taxRate.r` 进入抱怨权重）由 `services-models.md` §2.10.3 定义。本模块只提供 `taxRate` 与 `ordinances`，并发出一个报纸用事件 **[低，本项目设计]**：

| 条件 | 效果 |
|---|---|
| 任一税率 ≥ 10 | 发 `taxGripe` 事件（每年至多一次），报纸可选 `taxes` 牢骚 |
| 任一税率 ≥ 15 | `taxGripe.severe = true`；年度预算顾问文本改为强烈警告（文案选取见 `disasters-events.md` §2.11 `PROPTAX_LOWER`） |
| 任一税率 = 0 | 该类税收为 0；法令收入也随之为 0（§2.5） |
| 税率变化 | 立即影响下一次 `demand` 阶段；不做"滞后记忆" |

#### 2.4.3 11 种产业税率 [名单 高 / 效果 低]

产业窗口（原版 Ctrl+I）三个视图：Ratios（占工业的百分比）、Tax Rates（每种 0..20）、Demand。本模块只消费 `tax_k` 与 `ratio_k` 计算工业税收（§2.4.1），其曲线与需求效应见 `zones-growth-demand.md` §2.9。`MISC 0x0854` 保存的"工业税率"写入 `round(Σ ratio_k × tax_k / 100)`（加权平均），读档时若 11 个产业税率缺失则全部取该值。

| k | 产业 | k | 产业 | k | 产业 |
|---|---|---|---|---|---|
| 0 | Steel / Mining | 4 | Construction | 8 | Media |
| 1 | Textiles | 5 | Automotive | 9 | Electronics |
| 2 | Petrochemical | 6 | Aerospace | 10 | Tourism |
| 3 | Food | 7 | Finance | | |

### 2.5 法令（Ordinances）：金额、位序与效果所有者

20 条法令，生效状态存 `MISC 0x0FA0` 的低 20 位，**位 0 对应金融组第一条** **[高]**，位序按下表 `bit` 列 **[中（组内顺序为文档表顺序，推断）]**。原版法令窗口按组分栏显示每条的年内累计（YTD）与年末估计 **[中]**。

**本文只拥有法令的三件事：位序、金额、可用年份。** 需求乘数的所有者是 `zones-growth-demand.md` §2.8.4（本表转录一列便于对照，vitest 断言两表一致）；其余一切模型效果的所有者在"非金钱效果所有者"列给出，**本模块不定义、不存储、不推送这些效果**——消费模块只读 `EconomyState.ordinances` 位掩码，按各自规格实现。

金额单位：`pct` 为该类**月税收**的百分比，可为分数（1/6% 即 `monthlyTax × 1 / 600`）。"All" 指 R+C+I 总税收。全部金额按月结算、向下取整（因此新城多为 $0）。

| bit | 组 | 法令（术语） | 可用年份 | 收入(+)/成本(−) | 需求乘数（zones §2.8.4） | 非金钱效果所有者 → 章节 | 置信度（钱） |
|---|---|---|---|---|---|---|---|
| 0 | Finance | 1% Sales Tax | 始终 | +1% × tax.C | C ×0.99 | 无 | 高 |
| 1 | Finance | 1% Income Tax | 始终 | +1% × tax.R | R ×0.99 | 无 | 高 |
| 2 | Finance | Legalized Gambling | 始终 | +2% × tax.C | — | `services-models.md` §2.3.6 / §2.10.5：每个已开发半格犯罪源 +16 | 高 |
| 3 | Finance | Parking Fines | 始终 | +0.5% × tax.R | — | `transport-traffic.md`（未定义任何效果 → 无效；来源文档亦称"可能无效"） | 高 |
| 4 | Education & Safety | Pro-Reading Campaign | 始终 | −1/6% × tax.R | — | `services-models.md` §2.7：老化时 EQ 不衰减 | 高 |
| 5 | Education & Safety | Anti-Drug Campaign | 始终 | −1/5% × tax.R | — | `services-models.md` §2.7：新生儿 LE +5 | 高 |
| 6 | Education & Safety | CPR Training | 始终 | −1/6% × tax.R | — | `services-models.md` §2.7：新生儿 LE +5 | 高 |
| 7 | Education & Safety | Neighborhood Watch | 始终 | −1/3% × tax.R | — | `services-models.md` §2.3.5 / §2.10.5：每个分区建筑格给所在四分格 `XPLC +2` | 高 |
| 8 | Environment | Energy Conservation | 始终 | −1/2% × tax.All | — | `power-water.md` §2.4：网络容量 `capacity += ⌊capacity / 12⌋`（**不是**用电 ×11/12） | 高 |
| 9 | Environment | Nuclear Free Zone | 始终（核电未发明前无实际作用） | 0 | — | 本文 §3.6 / `building-catalogue.md` §3.4：工具层禁止放置核电厂（已有的不拆） | 高 |
| 10 | Environment | Homeless Shelter | 始终 | −1/2% × tax.R | C ×1.01 | 无（`services-models.md` §2.10.5：帮助文本所称地价效果在模型中不存在，不实现） | 高 |
| 11 | Environment | Pollution Controls | 始终 | −1% × tax.I | I ×0.99 | `services-models.md` §2.3.1：污染扩散分母 +1（约 −10%） | 高 |
| 12 | Health & Safety | Volunteer Fire Dept. | 始终 | −1/3% × tax.R | — | `services-models.md` §2.3.5 / §2.10.5：每个分区建筑格给所在四分格 `XFIR +2` | 高 |
| 13 | Health & Safety | Public Smoking Ban | 始终 | −1/6% × tax.R | — | `services-models.md` §2.7：新生儿 LE +5 | 高 |
| 14 | Health & Safety | Free Clinics | 始终 | −1/2% × tax.R | — | `services-models.md` §2.7：`healthCap += taxableRes / 400` | 高 |
| 15 | Health & Safety | Junior Sports | 始终 | −1/4% × tax.R | — | `services-models.md` §2.10.5：未发现模型效果（`juniorSportsLEBonus = 0`） | 高 |
| 16 | Promotional | Tourist Advertising | 始终 | −1% × tax.C | C ×1.01 | `zones-growth-demand.md` §2.9：Tourism 产业权重 ×1.25；本文 `counters.advertising` +1/月 | 高 |
| 17 | Promotional | Business Advertising | 始终 | −1% × tax.I | I ×1.01 | 本文 `counters.advertising` +1/月 | 高 |
| 18 | Promotional | City Beautification | 始终 | −1/4% × tax.R | R ×1.01 | 无（地价效果在 `services-models.md` 中不存在） | 高 |
| 19 | Promotional | Annual Carnival | 始终 | −1/3% × tax.C | C ×1.01 | 无 | 高 |

关于"百分比"的解释 **[中]**：二手来源称 1% Income Tax 每 1,000 居民每年约 $13、Legalized Gambling 每 1,000 商业人口每年约 $27。按本文公式在 7%–8% 税率下分别为 $11–13 与 $22–26，吻合；若解释为"税率 +1 个百分点"则为 $160/千人，相差一个数量级，故排除。

年份门控 **[低]**：原版是否把部分法令（CPR Training、Public Smoking Ban、Anti-Drug、Energy Conservation、Pollution Controls）按年代灰显未能证实，本文默认全部可用，`OrdinanceDef.availableYear` 字段留作开关（见 §5 Q4）。

启用 / 停用即时生效，无一次性费用 **[中]**；每次启用触发报纸 `gennewordinancestory`（文本数据中存在 `ordinance`、`ordinanceopinion`、`ordinanceheadline` 词组）**[高（故事类型存在）]**。

> 旧稿曾为法令自定义 `crimeMul / fireCoverageBonus / powerMul / leBonus / eqBonus / landValueBonus / pollutionIndMul` 等数值与 `ordinanceEffects` 调参块。它们与所有者规格矛盾且会导致双重生效，**已全部删除**；`OrdinanceDef` 不再有 `effects` 字段（§3.1）。

### 2.6 债券（Bonds）

| 项 | 规则 | 置信度 |
|---|---|---|
| 面额 | 固定 $10,000，发行时 `funds += 10,000` | 高 |
| 最大张数 | 50（`MISC 0x0610..0x06D7` 为 50 个 int） | 高 |
| 利率存储 | `rateRaw = 百分比 × 10,000`（4% → 40,000），每张独立 | 高 |
| 年利息 | `annualInterest = floor(10,000 × rateRaw / 1,000,000) = floor(rateRaw / 100)` | 高（真实利率计息） |
| 付息 | 每月扣 `splitMonthly(annualInterest, m)`（§3.3），12 个月之和恰为年息 | 中（按月） |
| 还本 | 玩家点击"偿还"：`funds −= 10,000`，**只能还最早一张**；`funds < 10,000` 时拒绝 | 高（顺序）/ 中（资金不足拒绝） |
| 窗口显示 | 列出每张债券（发行年、利率、年息），当前债券数、平均利率、利率之和、下一张的利率、信用评级 AAA..F、城市价值 | 高（字段存在）/ 中（布局） |
| 城市价值 | 显示 `MISC 0x0024`（`services-models.md` §2.10.2 的基建 + 建筑造价和；来源文档的另一说法 `landValueSum / 2 × 1000` 作为 `cityValueMode = 'landValue'` 开关保留） | 中 |
| 评级 | 由债券利率之和与城市价值共同决定 | 中（文档推测）/ 低（公式） |
| 利率显示 | 向下取整到整数百分比显示，计算用真实值 | 高 |
| 开局 | Hard 难度自带 1 张 3% 债券 | 高 |
| 作弊 | `fund` 作弊码发行 1 张 25% 债券 | 高 |

下一张债券利率与评级的**建议公式 [低]**（原版未知，全部进 `EconomyTuning.bonds`）：

```
fedRateRaw: 国家基准利率。开局 = 30,000 + 10,000 × natTrend（3% / 4% / 5%）
  每年 1 月第 0 天 nationalAnnual：fedRateRaw += pick([−5000, −2500, 0, +2500, +5000], [0.15, 0.2, 0.3, 0.2, 0.15])
             + (natTrend == 2 ? +2500 : natTrend == 0 ? −2500 : 0)
             clamp 到 [10,000, 150,000]；变动 ≠ 0 时触发 fedrateup / fedratedown 新闻

debt            = 10,000 × bonds.length
debtService     = Σ annualInterest
annualTaxEst    = monthlyTax.total × 12（若有完整上一年则用上一年实际）
dsr             = debtService / max(annualTaxEst, 1)
collateralRatio = debt / max(cityValueDollars, 1)
rating = worse(tierByDsr(dsr), tierByCollateral(collateralRatio))

tierByDsr:        AAA <0.02 | AA <0.04 | A <0.07 | BBB <0.10 | BB <0.15 | B <0.20 | CCC <0.30 | CC <0.40 | C <0.50 | D <0.75 | F ≥0.75
tierByCollateral: AAA <0.05 | AA <0.10 | A <0.20 | BBB <0.30 | BB <0.40 | B <0.50 | CCC <0.60 | CC <0.70 | C <0.80 | D <1.00 | F ≥1.00
spreadRaw = { AAA:0, AA:2500, A:5000, BBB:10000, BB:15000, B:20000, CCC:30000, CC:40000, C:50000, D:70000, F:∞ }

nextBondRateRaw = clamp(fedRateRaw + 2,500 × bonds.length + spreadRaw[rating] + prng.int(10000), 10,000, 250,000)
可发行条件：bonds.length < 50 && rating != 'F'
```

`prng.int(10000)` 来自模拟流（玩家命令"发行债券"是可重放命令，§2.13.3）；窗口里显示的"下一张利率"预览**不得**消费 PRNG——预览时用 `jitter = 0` 计算，真正发行时才抽样 **[设计]**。

原版的"负 FUND 技巧"（反复发 25% 债券直到利率之和溢出、利息变成收入）是有符号整数溢出的产物 **[高（现象）]**。本实现**不复现溢出**：所有金额与利率用安全整数并夹在 int32 范围内写档。

### 2.7 各部门资金滑块：本模块提供什么、效果归谁

预算中有资金率的 11 条线与存档一一对应（每条 27 × 4B：当前数量、当前资金率、未知、12 × (月数量, 月资金率)）**[高]**：

| 预算线 | `MISC` 偏移 | 计数对象（XBLD） | 年单价（100% 时） | 资金率的效果（所有者） | 置信度（单价） |
|---|---|---|---|---|---|
| Police | `0x0998` | 警察局 `0xD2`（监狱 `0xD8` 并入本线） | $100 / 局，$100 / 监狱 | 警力强度、警员数、监狱容量与越狱、`fundprison`：`services-models.md` §2.3.5 / §2.6.2 | 中 |
| Fire | `0x0A04` | 消防局 `0xD3` | $100 / 局 | 消防力强度：`services-models.md` §2.3.5；灭火概率：`disasters-events.md` §2.6.1 | 中 |
| Health | `0x0A70` | 医院 `0xD1` | $50 / 座 | 受保护新生儿容量 → LE：`services-models.md` §2.7；评分：§2.6.2 | 低 |
| Education – Schools | `0x0ADC` | 学校 `0xD6` | $25 / 校 | 升学容量 → EQ、`fundeducation`：`services-models.md` §2.7 / §2.6.2 | 低 |
| Education – Colleges | `0x0B48` | 学院 `0xD9` | $100 / 院 | 同上 | 低 |
| Transit – Roads | `0x0BB4` | 见 `transport-traffic.md` §2.4 | 见该表 | 生长扫描访问时 `rand(0..99) >= funding` 则该格变废墟：`transport-traffic.md` §2.15 | 中 |
| Transit – Highways | `0x0C20` | 同上 | 同上 | 整块 2×2 变废墟 | 中 |
| Transit – Bridges | `0x0C8C` | 同上 | 同上 | `wind + rand(0..49) >= funding` 则桥格坍塌并上报纸 | 中 |
| Transit – Rail | `0x0CF8` | 同上 | 同上 | 同 Roads | 中 |
| Transit – Subway | `0x0D64` | 同上 | 同上 | 地铁段塌陷（可开关） | 中 |
| Transit – Tunnel | `0x0DD0` | 同上 | 同上 | 隧道不稳定 | 中 |

`funding ∈ 0..100` 整数（滑块步进 1）。`funding = 0` 时建筑仍在、人口仍计，但该部门效果为 0。图书馆 `0xF5`、博物馆 `0xD4`、公园、动物园、体育场、码头**没有经费线，也没有维护费** **[中]**；它们的微模拟用学校 / 学院资金率做显示（`services-models.md` §2.6.2），不影响本模块。电厂与供水设施没有预算条目 **[高]**。

`structureCounts`（各线"当前数量"）由服务模块在放置 / 拆除时维护（`services-models.md` §3.4 `budget[def.budget].count±1`），本模块只读；写档时同时与 `tileCounts[id] / size²` 对账（§4.13）。

本模块发出的经费事件 **[低（阈值）]**：某线 `funding < underfundedThreshold`(80) 且该线计数 > 0 → `underfunded` 事件，每年每线至多一次。文本数据只有 `fundprison / fundeducation / fundtransit` 三类故事 **[高]**：`fundprison / fundeducation` 由服务模块的年度微模拟按真实超员 / 评分触发（更准确），本模块的 `underfunded` 事件只用于 `fundtransit`（六条交通线）与顾问评语；报纸模块对同类故事去重。

### 2.8 维护费（交通与固定支出）

交通六线的**计数口径与单价**以 `transport-traffic.md` §2.4 为准（下表仅转录，便于预算实现一次拿齐；单价换算成"分 / 单位 / 年"以保持整数运算）：

| 预算线 | 单位 | 年单价（分） | 备注 |
|---|---|---|---|
| Roads | 道路格（含道口、电线交叉、隧道口） | 10 | |
| Highways | 2×2 段（匝道按 1 格计入） | 80 | |
| Tunnel | 格 | 20 | |
| Rail | 铁路格 | 40 | 火车站 `0xED` 每座 150 |
| Subway | 地铁格 | 40 | 地铁站 `0xE9` / 地铁↔铁路 `0x6C–0x6F` 每座 80 |
| Bridges | 公路桥格 | 25（+10 / 端） | 铁路桥格 25；高速桥段 180（+80 / 端） |
| 固定：Bus depot | 公交站 `0xEC` | 2,500 | 无滑块 **[高]**，金额 **[中]**；预算窗口并入 Transit 行显示 **[低]** |

```
annualLineCost(line) = floor(Σ_items count × unitCents × funding / 100 / 100)   // 美元
```

> 校准提示 **[低]**：按上表，2,000 格道路一年只需 $200，交通预算几乎无感；原版玩家对"削减交通预算省钱→道路崩坏"有强烈记忆，暗示真实单价可能更高（×10 量级）。`EconomyTuning.transitCostScale`（默认 1）用于整体缩放，列入 §5 Q2。

### 2.9 造价总表（工具与建筑）

一次性费用，放置瞬间扣除；`cost > funds` 时拒绝（§3.6）。尺寸 / 年份 / 单价来源：兄弟规格（标 ★）或本文记忆 **[中]**；标 **[低]** 者进 `COST_TABLE` 可调。`building-catalogue.md` 用快照测试锁定本表与它的数据表逐项一致；两处冲突时以 `building-catalogue.md` §4.1 的裁定为准。

| 工具组 | 工具 / 建筑 | XBLD | 占地 | 造价 | 维护线 | 可用条件 | 置信度 |
|---|---|---|---|---|---|---|---|
| Bulldozer | Demolish / Clear | — | 1 格 | $1 / 格 | — | 始终 | 高 ★ |
| Bulldozer | Level Terrain | — | 1 格 | $25 / 改变格 | — | 始终 | 中 ★ |
| Bulldozer | Raise Terrain | — | 1 格 | $25 / 改变格 | — | 始终 | 中 ★ |
| Bulldozer | Lower Terrain | — | 1 格 | $25 / 改变格 | — | 始终 | 中 ★ |
| Bulldozer | De-zone | — | 1 格 | $1 / 格 | — | 始终 | 中 ★ |
| Landscape | Trees | `0x06–0x0C` | 1 格 | $3 / 次点击 | — | 始终 | 中 ★ |
| Landscape | Water | — | 1 格 | $100 / 格 | — | 始终 | 中 ★ |
| Emergency | 调派警 / 消 / 军 | — | — | $0 | — | 有对应设施 | 高 |
| Roads | Road | `0x1D–0x2B` | 1 格 | $10 / 格 | Roads | 始终 | 中 ★ |
| Roads | Highway | `0x49–0x50, 0x61–0x69` | 2×2 段 | $100 / 段 | Highways | Highways 科技 | 中 ★ |
| Roads | Onramp | `0x5D–0x60` | 1 格 | $25 | Highways | 随高速 | 中 ★ |
| Roads | Tunnel | `0x3F–0x42` | 1 格 | $150 / 格 | Tunnel | 始终 | 中 ★ |
| Roads | Bus Depot | `0xEC` | 2×2 | $250 | 固定 | Buses 科技 | 中 ★ |
| Rail | Rail | `0x2C–0x3E` | 1 格 | $25 / 格 | Rail | 始终 | 中 ★ |
| Rail | Rail Depot | `0xED` | 2×2 | $500 | Rail | 始终 | 中 ★ |
| Rail | Subway | `XUND 0x01–0x0F` | 1 格 | $100 / 格 | Subway | Subways 科技 | 中 ★ |
| Rail | Subway Station | `0xE9` | 1×1 | $250 | Subway | 随地铁 | 中 ★ |
| Rail | Sub↔Rail | `0x6C–0x6F` | 1×1 | $250 | Subway | 随地铁 | 中 ★ |
| (桥对话框) | Causeway | `0x57/0x58` | 1 格 | $25 / 格 | Bridges | 任意长度 | 中 ★ |
| (桥对话框) | Raising Bridge | `0x56/0x58/0x59` | 1 格 | $50 / 格 | Bridges | 5–12 格 | 中 ★ |
| (桥对话框) | Suspension Bridge | `0x51–0x55` | 1 格 | $75 / 格 | Bridges | ≥ 7 格 | 中 ★ |
| (自动) | Rail Bridge | `0x5A/0x5B` | 1 格 | $75 / 格 | Bridges | — | 中 ★ |
| (桥对话框) | Highway Bridge | `0x49/0x4A` 跨水 | 2×2 段 | $100 / 段 | Bridges | — | 低 ★ |
| (桥对话框) | Reinforced Highway Bridge | `0x6A/0x6B` | 2×2 段 | $200 / 段 | Bridges | — | 中 ★ |
| (边缘确认框) | 邻城连接 | `XTXT 0xFA` | — | $1,000 / 条 | — | 网络到达地图边缘 | 中 ★ |
| Ports | Seaport zone | `XZON 9` | 按格 | $150 / 格 | — | 始终 | 低 ★ |
| Ports | Airport zone | `XZON 8` | 按格 | $250 / 格 | — | Airport 科技 | 低 ★ |
| Power | Power Line | `0x0E–0x1C` | 1 格 | $2 / 格（跨水高架 `0x5C` $10 / 格） | — | 始终 | 中 ★ |
| Power | Coal | `0xCF` | 4×4 | $4,000 | — | 始终 | 高 ★ |
| Power | Hydro | `0xC6/0xC7` | 1×1 | $400 | — | 始终（需瀑布格） | 高 ★ |
| Power | Oil | `0xCA` | 4×4 | $6,600 | — | 始终 | 高 ★ |
| Power | Gas | `0xC9` | 4×4 | $2,000 | — | Gas 科技 | 高 ★ |
| Power | Nuclear | `0xCB` | 4×4 | $15,000 | — | Nuclear 科技且无 Nuclear Free Zone | 高 ★ |
| Power | Wind | `0xC8` | 1×1 | $100 | — | Wind 科技 | 高 ★ |
| Power | Solar | `0xCC` | 4×4 | $1,300 | — | Solar 科技 | 高 ★ |
| Power | Microwave | `0xCD` | 4×4 | $28,000 | — | Microwave 科技 | 高 ★ |
| Power | Fusion | `0xCE` | 4×4 | $40,000 | — | Fusion 科技 | 高 ★ |
| Water | Pipes | `XUND 0x10–0x1E` | 1 格 | $3 / 格 | — | 始终 | 中 ★ |
| Water | Water Pump | `0xDC` | 1×1 | $100 | — | 始终 | 高 ★ |
| Water | Water Tower | `0xEB` | 2×2 | $250 | — | 始终 | 高 ★ |
| Water | Water Treatment | `0xF4` | 2×2 | $500 | — | Water treatment 科技 | 高 ★ |
| Water | Desalinization | `0xFA` | 3×3 | $1,000 | — | Desalinization 科技 | 高 ★ |
| Zones | Light R / C / I | `XZON 1/3/5` | 按格 | $5 / 格 | — | 始终 | 中 ★ |
| Zones | Dense R / C / I | `XZON 2/4/6` | 按格 | $10 / 格 | — | 始终 | 中 ★ |
| Education | School | `0xD6` | 3×3 | $250 | Schools | 始终 | 中 |
| Education | College | `0xD9` | 4×4 | $1,000 | Colleges | 始终 | 中 |
| Education | Library | `0xF5` | 2×2 | $500 | — | 始终 | 中 |
| Education | Museum | `0xD4` | 3×3 | $1,000 | — | 始终 | 中 |
| Services | Police Station | `0xD2` | 3×3 | $500 | Police | 始终 | 中 |
| Services | Fire Station | `0xD3` | 3×3 | $500 | Fire | 始终 | 中 |
| Services | Hospital | `0xD1` | 3×3 | $500 | Health | 始终 | 中 |
| Services | Prison | `0xD8` | 4×4 | $3,000 | Police | 始终 | 中 |
| Recreation | Small Park | `0x0D` | 1×1 | $20 | — | 始终 | 中 |
| Recreation | Big Park | `0xD5` | 3×3 | $150 | — | 始终 | 中 |
| Recreation | Zoo | `0xDA` | 4×4 | $3,000 | — | 始终 | 中 |
| Recreation | Stadium | `0xD7` | 4×4 | $5,000 | — | 始终 | 中 |
| Recreation | Marina | `0xF8` | 3×3 | $1,000 | — | 始终（需临水） | 中 |
| Rewards | Mayor's House | `0xF3` | 2×2 | $0 | — | `normalPop > 2,000`（`services-models.md` §2.8.1 授予位 bit0），一座 | 高 ★ |
| Rewards | City Hall | `0xD0` | 3×3 | $0 | — | `normalPop > 10,000`（bit1），一座 | 高 ★ |
| Rewards | Statue | `0xDB` | 1×1 | $0 | — | `normalPop > 30,000`（bit2），一座 | 高 ★ |
| Rewards | Military Base | 军事区 `XZON 7` | 由游戏放置 | $0 | — | `normalPop > 60,000` 时的一次性提议（`services-models.md` §2.8.2） | 高 ★ |
| Rewards | Llama Dome | `0xFF` | 4×4 | $0 | — | `normalPop > 90,000`（bit3），一座 | 高 ★ |
| Rewards | Plymouth Arcology | `0xFB` | 4×4 | $100,000 | — | `normalPop > 120,000`（bit4）且 Plymouth 已发明，可重复 | 高 ★（门槛）/ 中（价） |
| Rewards | Forest Arcology | `0xFC` | 4×4 | $120,000 | — | 同上且 Forest 已发明 | 高 ★ / 中 |
| Rewards | Darco | `0xFD` | 4×4 | $150,000 | — | 同上且 Darco 已发明 | 高 ★ / 中 |
| Rewards | Launch Arcology | `0xFE` | 4×4 | $200,000 | — | 同上且 Launch 已发明 | 高 ★ / 低 |
| Signs | 标牌 | `XTXT 0x01–0x32` | — | $0 | — | 最多 50 个 | 高 |
| Query | 查询 | — | — | $0 | — | 始终 | 高 |

奖励门槛统一为 **`normalPop`（不含 Arcology）严格大于阈值、每月第 22 天判定、每月最多升一级**（`services-models.md` §2.8.1，`building-catalogue.md` §1.2 同）；旧稿"`citySize ≥`"的口径已废弃。公交站 / 火车站占地按 `building-catalogue.md` §4.1 裁定为 2×2。

多格建筑的拆除按被推土的格数收 $1 / 格（推一格即整栋拆除，收 `$1 × size²`）**[低]**；兄弟规格写"$1 / 格"，本文按整栋计，列入 §5 Q9。

### 2.10 年度预算窗口与子窗口字段

主窗口（每年 1 月第 0 天自动弹出，除非 `autoBudget`；也可随时打开）**[中（字段）/ 低（布局细节）]**：

| 行 | 控件 | 列：上一年实际 / 本年至今（YTD） | 列：本年估计 | 说明 |
|---|---|---|---|---|
| 财产税 Property Taxes | 税率滑块 0–20%（显示 `%`）+ 明细按钮 | `Σ 已结月份 monthlyTax.total` | `ytd + monthlyTax.total × 剩余月数` | 滑块一次改 R/C/I 三值与 11 产业 |
| 法令 Ordinances | 明细按钮（打开法令窗口） | `Σ 已结月份 ordinanceNet` | 同式 | 正为净收入、负为净成本 |
| 债券 Bond Payments | 明细按钮（打开债券窗口） | `Σ 已结月份 bondInterest` | 同式 | 显示为负数 |
| 警察 Police Dept | 资金率滑块 0–100% + 明细 | `Σ 已结月份 lineCost` | 同式 | 明细：警局数、监狱数、年单价、顾问评语 |
| 消防 Fire Dept | 同上 | 同上 | 同上 | 明细：消防局数 |
| 医疗 Health & Welfare | 同上 | 同上 | 同上 | 明细：医院数 |
| 教育 Education | 两个滑块（Schools / Colleges）+ 明细 | 两线之和 | 同式 | 明细：学校数、学院数 |
| 交通 Transportation | 六个滑块（Roads / Highways / Bridges / Rail / Subway / Tunnel）+ 明细 | 六线 + 公交站固定支出 | 同式 | 明细：各线数量、单价 |
| 现金流 Cash Flow | 只读 | 收入合计 − 支出合计 | 同式 | |
| 期初资金 / 当前资金 | 只读 | 年初 `funds` | 当前 `funds` | |
| 年末资金估计 | 只读 | — | `funds + 估计现金流剩余部分` | |
| 自动预算 Auto-Budget | 复选框（`MISC 0x0FF0`） | | | 勾选后 1 月不弹窗 |
| 确认按钮 | 关闭窗口并恢复时钟（从被挂起的阶段继续） | | | 取消 = 恢复打开时的滑块值 |

明细（"账本"）窗口通用结构：12 个月的（数量，资金率 / 税率）柱状或表格 + 当前值，对应存档 27 × 4B 块 **[高（数据）]**。法令窗口：20 个复选框分 5 组，每条右侧显示 YTD 与年末估计，底部合计 **[中]**。债券窗口：债券列表、当前数、平均利率、利率之和、下一张利率、评级、城市价值、"发行" / "偿还" 按钮 **[高（字段）]**。

**顾问评语**：8 位顾问（Taxes / Ordinances / Bonds / Police / Fire / Health / Education / Transit）的建议条目与选取条件由 `disasters-events.md` §2.11 定义（本项目自撰文案）。本模块只向其提供 `BudgetAdvisorContext`（§3.1：资金、税率、法令位、债券数与平均利率、`fedRateRaw`、各线资金率与计数、年收支），其余输入（`crimeGraph`、`normalPop`、EQ/LE、诉求链）由服务模块提供。

### 2.11 资金不足、赤字与破产 / 游戏结束

| 情形 | 行为 | 置信度 |
|---|---|---|
| 单次操作 `cost > funds` | 拒绝整次操作（拖动类工具拒绝超出部分之前的整段，不做部分应用），状态栏资金闪烁 + 提示音 | 中 |
| `funds < 0` | 允许（月结可把资金扣成负数）；状态栏红字；此时任何 `cost > 0` 的操作都被拒绝 | 中 |
| 年末 `funds < 0` | 预算窗口弹出并带警告评语；报纸 `moneyevent` 类故事 | 中 |
| `closeYear` 时 `funds < impeachFundsThreshold`（默认 −$50,000）| 游戏结束：弹出"被赶下台"对话框 → 返回主菜单或以观察模式继续（本项目提供两种选择） | 中（存在"负债过深被赶下台"）/ 低（阈值） |
| 连续 `impeachYears`（默认关闭 = 0）年 `closeYear` 时 `funds < 0` | 可选的第二条弹劾规则 | 低 |
| `impeachCheck = 'monthly'` **[低，默认关闭]** | 判定改在每月第 22 天 `solvency` 阶段（`services-models.md` §2.1 的"破产"槽位） | 低 |
| 情景时限到期 / 目标达成 | 见 §2.16 | — |

原版没有"自然结局"：年份无限增长，不存在到期胜利。原版也**没有**自动借款：负债不会自动变成债券 **[中]**。被弹劾后若选择"观察模式"，时钟继续、工具禁用、不再做弹劾判定 **[设计]**；情景进行中被弹劾 = 情景失败（§2.16）。

### 2.12 奖励、市民诉求、支持率、LE/EQ：所有权在 `services-models.md`

旧稿的 §2.12（奖励与城市等级）与 §2.13（诉求阈值、八项加权 `approval`、`leBase/eqBase` 收敛模型）与 `services-models.md` 的 [高] 置信度模型重复且取值不同，会产生两个支持率、两套 LE/EQ、两处诉求去重表。**本文已整体删除这些内容**，口径如下：

| 主题 | 唯一所有者 | 本模块提供的输入 | 本模块消费的输出 |
|---|---|---|---|
| 里程碑 / 奖励位 / 军事基地提案（`MISC 0x0020 / 0x0078 / 0x0E4C`） | `services-models.md` §2.8（`normalPop >` 阈值、每月第 22 天、每月升一级、10 级） | 无 | `reward` / `militaryOffer` 事件 → 工具栏奖励按钮点亮由 UI 处理；本模块无动作 |
| 市民诉求（`need*`）、状态栏优先级链 | `services-models.md` §2.10.4（第 24 天；`u = normalPop / 20,000`、`u ≥ 警局数 + 监狱数` 等） | `funds`（无）、`usagePct` 由电水模块提供 | `citizenDemand` 事件 → 仅用于预算窗口的"建议加建"评语上下文；报纸去重由报纸模块负责 |
| 市长支持率 | `services-models.md` §2.10.3（每年 1 月 100 次抽样，写市长官邸 `stat2`） | `taxRate.r` | `mayorApproval` → 预算顾问上下文 |
| LE / EQ（`MISC 0x0048 / 0x004C`）与 `popGraph`（`0x007C..0x0168`） | `services-models.md` §2.7（20 个年龄队列） | `funding`（健康 / 学校 / 学院）、`ordinances`、`taxableRes` | `workforceLE / workforceEQ` → `XGRP` Health / Education 序列（§2.14） |
| 法令的非金钱效果 | 见 §2.5 表 | `ordinances` 位掩码 | 无 |
| 体育队位 `MISC 0x1028`、逮捕 `0x1038`、监狱加成 `0x103C` | `services-models.md` §2.6 | 无 | 无 |

本模块仍自行判定并发出的只有两类事件：`taxGripe`（§2.4.2）与 `underfunded`（§2.7）。旧稿的 `CivicsState`、`REWARD_THRESHOLDS`、`demands / approvalWeights / rewards` 调参块、`civicsMonthly` 伪代码全部移除；`EconomyEvent` 中不再包含 `citizenDemand / reward / militaryOffer`（§3.1）。

### 2.13 模拟随机数契约 `Prng`（sim-core）

七份规格都要求"注入的种子 PRNG、固定调用顺序、可重放"，但此前没有统一定义。**本节是全仓库 `Prng` 的唯一契约**；各规格中的 `rng()`、`rngInt(a,b)`、`rngFloat`、`rnd(mask)`、`rng % N`、`rng.int(0,199)`、`rng.bit()`、`rng.float()`、`rng.pick()` 一律按 §2.13.4 的对照表改写为本接口的方法名。**[设计]**

#### 2.13.1 接口

```ts
export interface Prng {
  next32(): number;                       // u32，0..2^32−1（基础发生器输出）
  next15(): number;                       // 0..32767，= next32() >>> 17；等价 C rand()，供 `rnd(mask)` 风格的掩码用法
  int(n: number): number;                 // 半开区间 [0, n)；n ≤ 0 时返回 0；实现为 next32() % n
  range(lo: number, hi: number): number;  // 闭区间 [lo, hi]；= lo + int(hi − lo + 1)
  float(): number;                        // [0, 1)；= next32() / 4294967296
  bit(): boolean;                         // = (next32() >>> 31) === 1
  pick<T>(a: readonly T[]): T;            // = a[int(a.length)]；空数组抛错
  shuffle<T>(a: T[]): void;               // Fisher–Yates，从末尾向前，j = int(i + 1)
  state(): number;                        // 当前 32 位状态（u32），用于存档 / 快照
  seed(s: number): void;                  // 重置状态为 s >>> 0
}
export function createPrng(seed: number): Prng;
export function hash32(...parts: (number | string)[]): number;   // FNV-1a 32 位，用于派生子种子
```

每个方法**恰好消费一次 `next32()`**（`shuffle` 消费 `a.length − 1` 次），这样任何规格里"消费一次随机数"的描述都对应固定的状态推进量。

#### 2.13.2 算法：mulberry32 [设计]

```
state = (state + 0x6D2B79F5) | 0
t = imul(state ^ (state >>> 15), 1 | state)
t = (t + imul(t ^ (t >>> 7), 61 | t)) ^ t
return (t ^ (t >>> 14)) >>> 0
```

选择理由：32 位状态可直接写进一个 `MISC` 字段；无 BigInt；JS 中单步 < 10 ns；`terrain.md` 已采用它。**原版的 LCG 未知，也无需匹配**——存档对照测试比较的是状态结构，不是随机序列。

测试向量（`sim/clock/prng.test.ts` 固化）：

| seed | 前 5 个 `next32()` | 之后 `state()` |
|---|---|---|
| 0 | `0x4434b462 0x00159c37 0x39285b08 0x256d8104 0x77a2cbd4` | `0x21d961c9` |
| 1 | `0xa087eaf3 0x00b349c9 0x8706c4eb 0xfb2627fd 0xf7e79d2b` | `0x21d961ca` |
| 12345 | `0xfacf78c5 0x4e875100 0x7bf4e2f2 0xd1642650 0x8269e5ca` | `0x21d99202` |

seed = 1 时对应的派生值：`next15()` = 20547, 89, 17283, 32147, 31731；`int(100)` = 67, 33, 87, 21, 3；`float()` ≈ 0.627074, 0.002736, 0.527447, 0.981051, 0.968378。

#### 2.13.3 随机流的划分与消费纪律

| 流 | 创建 | 谁可以消费 | 持久化 |
|---|---|---|---|
| `sim`（唯一模拟流） | 新城：`createPrng(seed)`；读档：`MISC 0x1058`（§2.13.5） | （a）`DAY_PHASES` 各阶段，按 §2.3.1 的行序与各阶段内部的固定遍历序；（b）**可重放的玩家命令**的处理函数：放置建筑（NIMBY 掷骰、体育场选队、微模拟初值 `rng%30+10` 等）、发行债券（利率抖动）、推土后 / 放置后的即时电 / 水重扫（风 / 太阳能抽样）、作弊码 | 是 |
| `terrain` | New City 对话框的地形 `seed`（`terrain.md` §3.6 `generate(p, seed)`） | 仅地形生成器与"重新生成"按钮 | 否（生成完即弃；可把 `seed` 记在新城元数据里便于"再来一张"） |
| `brush` | 每次森林 / 水体刷子落笔时 `createPrng(hash32(sim.state(), age, x, y, strokeIndex))`——**读取** `sim.state()` 不推进它 | 仅该次笔画 | 否 |
| `art` | 无状态 `hashNoise(x, y, salt)`（`ui-art.md`），不是 `Prng` | 程序化美术 | 否 |
| `ui` | `createPrng(Date.now())` 或 `Math.random` | 帆船 / 飞机 / 火车等纯装饰物件的闲逛、窗口抖动、音效变体、报纸版式随机 | 否 |

纪律：

1. `sim/**` 目录禁止 `Math.random`（ESLint `no-restricted-properties`），只能从注入的 `Prng` 取数。
2. **UI 预览不得消费 `sim` 流**：债券"下一张利率"预览、NIMBY 的"不满度"提示、拖动工具的费用预览都用确定性计算（抖动项取 0）。
3. 装饰性物件（`XTHG` 的帆船 / 飞机 / 火车 / 直升机）的生成**时机**由模拟决定（它们由生长扫描 / 机场规则触发，消费 `sim`），但其**逐帧路径抖动**走 `ui` 流。灾害物件（龙卷风、怪兽、风暴眼）属于模拟，走 `sim`。
4. 可重放性定义：`replay(seed, commands[])` 中每条命令带 `age`、`phaseCursor`（命令总在阶段之间执行，所以实际为"第几天开始前"）与参数；相同输入在任何机器上给出逐字节相同的 `CityState`。vitest 的无头长跑用它做金丝雀测试。
5. 灾害模式（`cityMode = 2`）的 `disasterTick()` 也消费 `sim`（`disasters-events.md` §3.3 的固定顺序），它在日历停摆期间发生，tick 计数作为命令日志中的时间戳。

#### 2.13.4 兄弟规格记法 → `Prng` 方法对照

| 规格中的写法 | 含义 | 改写为 |
|---|---|---|
| `rng()`（terrain、zones） | [0,1) 浮点 | `prng.float()` |
| `rngInt(a, b)`、`rng.int(a, b)`、`rng(a..b)`、`rng(a, b)`（zones、power-water、disasters） | 闭区间整数 | `prng.range(a, b)` |
| `rng.int(n)`（transport、disasters、power-water 的 `rng.int(20)`） | [0, n) | `prng.int(n)` |
| `rng % N`（services） | [0, N) | `prng.int(N)` |
| `rnd(mask)`、`rng & 0x3F`（services） | 15 位随机数按位与 | `prng.next15() & mask` |
| `rng.int(0,199) < n` NIMBY（services） | | `prng.int(200) < n` |
| `rand(0..99) >= funding`（transport） | | `prng.int(100) >= funding` |
| `rngFloat(lo, hi)`（zones 邻城） | 连续均匀 | `lo + prng.float() × (hi − lo)` |
| `rng.bit()`、`rng.float()`、`rng.pick()`（transport、disasters） | 同名 | 不变 |
| `mulberry32(seed)`（terrain） | 独立流 | `createPrng(seed)`（`terrain` 流） |
| `weightedPick(row, rng)`、`pickWeighted(...)` | 按权重抽样 | 实现为 `r = prng.int(Σw)` 后累加落点（整数权重）；浮点权重先乘 1000 取整 |

`power-water.md` §4.17 提出的"`rngInt` 上界含义要统一"由此解决：**凡写成两个端点的都是闭区间 `range`，凡写成一个参数的都是半开 `int`。**

#### 2.13.5 持久化 [设计]

| 字段 | `MISC` 偏移 | 内容 |
|---|---|---|
| `prngMarker` | `0x1054` | `1` = 本存档含模拟 PRNG 状态（该区间在原版存档中恒为 0，`file-formats.md` §2.3.2 列为"零"区） |
| `prngState` | `0x1058` | `sim.state()`，u32 按 i32 位模式写入 |

读档：`prngMarker == 1` → `sim.seed(prngState >>> 0)`；否则（第三方 / 原版存档）`sim.seed(hash32(cityName, cityAge, funds, landValueSum))`——确定性，使同一个外部存档每次导入得到同样的后续演化。`file-formats.md` 的 `MISC` 访问器需加入这两个键（跨文件同步项）。写档：无条件写入两字段。

### 2.14 统计量：图表与报纸输入

图表窗口 16 条序列，各 52 个 int（12 个月、20 个半年、20 个 5 年）**[高]**，缩放规则：

| 序列 | 值 | 缩放 / 单位 | 来源 |
|---|---|---|---|
| City Size | `citySize = normalPop + arcoPop` | 人 | 分区 §2.7 |
| Residents / Commerce / Industry | `resPop / comPop / indPop` | 人 | 分区 |
| Traffic | `trafficCount`（`MISC 0x0030`） | 原值 | 交通（第 19 天） |
| Pollution | `Σ XPLT`（`MISC 0x0034`） | 原值 | 服务（第 2 天） |
| Value | `landValueSum`（`MISC 0x0028`） | 1 点 = 3,200（向上取整） | 服务 |
| Crime | `crimeSum`（`MISC 0x002C`） | 1 点 = 3,750（向上取整） | 服务 |
| Power % / Water % | 利用率 | 百分比 | 电（第 1 天）/ 水（第 20 天） |
| Health / Education | `workforceLE / workforceEQ`（`MISC 0x0048 / 0x004C`） | 原值 | `services-models.md` §2.7（第 21 天） |
| Unemployment | `unemploymentPct` | 百分比 | 分区 |
| GNP | `natValue` | 千 | 国家经济 |
| Nat'n Pop. | `natPop` | 千 | 国家经济 |
| Fed Rate | `fedRateRaw / 10000` | 百分比 | 本模块 §2.6 |

推送时机统一在第 21 天 `graphs` 阶段（§2.3.1）：月序列每月；半年序列在 `month ∈ {5, 11}`；5 年序列在 `month == 11 && year % 5 == 0` **[高（三档节奏）/ 中（对齐点）]**。`MISC 0x007C..0x0168` 是年龄队列（服务模块所有），**不是**本模块的历史序列。

报纸（`disasters-events.md` §2.10）需要本模块提供的量：`funds`、年度现金流、各线资金率与 `underfunded` 事件、税率与 `taxGripe`、法令启用事件、债券发行 / 偿还、fed rate 变动方向、游戏结束事件、情景胜负事件。

### 2.15 作弊码中的经济项 [高]

| 作弊码（Win95） | 效果 | 实现 |
|---|---|---|
| `fund` | 发行 1 张 $10,000、25% 的债券（不受评级限制，仍受 50 张上限） | `issueBond({ rateRaw: 250000, bypassRating: true })` |
| `cass` | +$250，小概率引发一场火灾 | `funds += 250; if prng.float() < 0.1 disasters.requestDisaster('fire')` |

其余作弊码（灾害、军事基地、调试菜单）不属本文。作弊码是可重放命令（§2.13.3）。

### 2.16 情景模式（Scenario）

一个情景 = 一个普通城市存档 + `TEXT ×2`（简介）+ `SCEN`（开场灾害、时限、目标）+ `PICT`（缩略图）（字节布局见 `file-formats.md` §2.5）。本仓库**不附带任何原版情景文件、文本或图片**；玩家可本地导入自己拥有的 `.SCN`，本项目也可附带若干**原创**情景（自建城市 + 自撰文本 + 自绘缩略图，用同一数据结构）。开场灾害的触发由 `disasters-events.md` §2.3.2 负责（读 `SCEN 0x04..0x07`，第一个 tick 触发，无视宽限期与"无灾害"）；**目标语义、评估、简报与胜负流程由本节负责**（`file-formats.md` §2.5.2 中"目标语义见 disasters-events.md"应改指本节）。

#### 2.16.1 运行时状态

```ts
export type ScenarioGoalKey =
  | 'citySize' | 'resPop' | 'comPop' | 'indPop' | 'cash' | 'landValue'      // "≥ 目标"
  | 'pollutionMax' | 'crimeMax' | 'trafficMax'                               // "≤ 上限"
  | 'bld1' | 'bld2';                                                         // "tileCounts[id] ≥ n"

export interface ScenarioGoal { key: ScenarioGoalKey; cmp: 'gte' | 'lte'; target: number; buildingId?: number }

export interface ScenarioState {
  startMonthIndex: number;        // 读入情景时的 ⌊cityAge / 25⌋
  finalMonthIndex: number;        // startMonthIndex + timeLimitMonths − 1：在这个月的第 22 天做最终判定
  goals: ScenarioGoal[];          // 只含非零目标（见 §2.16.2 的"0 = 无要求"）
  briefing: { short: string; long: string; pict: { w: number; h: number; rgba: Uint8ClampedArray } | null };
  result: 'pending' | 'won' | 'lost';
  resultAge: number | null;
}
```

`monthIndex(age) = ⌊age / 25⌋`；`remainingMonths = finalMonthIndex − monthIndex(age) + 1`（进行中时 ≥ 1）。时限**从读入情景的那个月起算**而不是绝对年份：`SCEN` 的 `timeLimitMonths` 是相对值（原装情景的城龄各不相同）**[高（字段）/ 中（相对起算）]**。

#### 2.16.2 目标评估表

| `SCEN` 偏移 | key | 运行时量（产出阶段） | 存档对应 | 比较 | 0 的含义 |
|---|---|---|---|---|---|
| `0x0A` City Size | `citySize` | `census.final.normalPop`（第 21 天） | `MISC 0x102C`（**不含 arco**，来源文档明示） | `≥` | 无要求 |
| `0x0E` | `resPop` | `census.final.res` | `MISC 0x0074` | `≥` | 无要求 |
| `0x12` | `comPop` | `census.final.com` | `MISC 0x05F8` 区的商业人口（分区规格） | `≥` | 无要求 |
| `0x16` | `indPop` | `census.final.ind` | 同上工业 | `≥` | 无要求 |
| `0x1A` Cash Goal | `cash` | `funds`（不扣债券本金） | `MISC 0x0014` | `≥` | 无要求 |
| `0x1E` Land Value Goal | `landValue` | `landValueSum`（第 2 天） | `MISC 0x0028` | `≥` | 无要求 |
| `0x22` Pollution Limit | `pollutionMax` | `pollutionTotal`（第 2 天） | `MISC 0x0034` | `≤` | **无要求**（否则不可能满足） |
| `0x26` Crime Limit | `crimeMax` | `crimeSum`（第 2 天） | `MISC 0x002C` | `≤` | 无要求 |
| `0x2A` Traffic Limit | `trafficMax` | `trafficCount`（第 19 天） | `MISC 0x0030` | `≤` | 无要求 |
| `0x2E/0x30` | `bld1` | `tileCounts[bld1]`（随放置增量维护） | `MISC 0x01F0 + 4·id` | `≥ bld1Tiles` | `id == 0` 或 `tiles == 0` → 无要求 |
| `0x2F/0x32` | `bld2` | `tileCounts[bld2]` | 同上 | `≥ bld2Tiles` | 同上 |

比较用 `≥ / ≤`（含等号）**[中]**：来源文档的措辞是 "above / below"，但目标值多为整数千位，含不含等号对原装情景几乎无影响；`EconomyTuning.scenario.strict = true` 时改为 `> / <`。建筑目标按**格数**：一座 4×4 建筑记 16 格（来源文档"未测试但应如此"）**[中]**。`trafficMax` 的口径依赖 `MISC 0x0030` 的真实含义（`services-models.md` Q4），按第 19 天衰减后的和。

#### 2.16.3 评估时机与胜负流程 [中]

```
phase 'scenario' (day 22, 在 milestones 之后):
  if !scenario || scenario.result != 'pending': return
  allMet = scenario.goals.every(g => meets(g))
  mi = monthIndex(age)
  if mi >= scenario.finalMonthIndex:                 // 时限月：一次性判定
    finish(allMet ? 'won' : 'lost')
  else if tune.scenario.winEarly && allMet:          // 可选：提前达成即胜（默认 false）
    finish('won')

finish(result):
  scenario.result = result; scenario.resultAge = age
  out.push({ type: 'scenario', result })             // UI：模态胜负对话框（挂起本阶段之后的阶段）；报纸 extra
  // 对话框按钮：「继续游玩」→ 关闭、恢复时钟，城市变为普通沙盒；「主菜单」
```

- 时限按**日历月**计；灾害模式期间日历停摆（§2.2），所以一场拖得很久的开场灾害不消耗情景时间 **[高（日历停摆）]**。
- 情景进行中被弹劾（§2.11）→ `finish('lost')` 后再走游戏结束流程。
- 来源文档没有"幸存灾害"字段；`disasters-events.md` §2.3.2 所说的 "Survive the disaster" 在数据上就是"时限到期时目标全部满足且未被弹劾"，无需额外状态。
- 胜利后继续游玩不再评估；读档时 `result != 'pending'` 的情景按普通城市处理。

#### 2.16.4 简报、目标进度与存档

| 界面 | 内容 | 时机 |
|---|---|---|
| Scenario Picker（选择列表） | 文件名 / 城市名、`TEXT 0x80` 短介绍、`PICT` 缩略图（`file-formats.md` §2.5.3 解码） | 主菜单 → 载入情景 |
| Scenario Briefing（简报，模态） | `TEXT 0x81` 长说明、缩略图、目标清单（§2.16.2 转成自然语言行）、时限（月数 / 到期年月）、「开始」按钮 | 读入后、第一个 tick 之前（`modalPause++`；关闭后开场灾害在第一个 tick 触发） |
| Scenario Goals（目标进度，非模态） | 每条目标：描述、目标值、当前值、是否达成；剩余月数；开场灾害名 | 任意时刻可从菜单打开；第 22 天评估后刷新 |
| Scenario Result（胜负，模态） | 胜 / 负标题、目标逐条勾叉、「继续游玩」/「主菜单」 | `finish()` |

这些窗口的布局与文案归 `ui-art.md` §2.6（需补 "Scenario Briefing / Goals / Result" 三项，跨文件同步）；本模块提供视图模型 `scenarioViewModel()`（§3.9）。

存档 **[设计]**：情景进行中写档时写回 `SCEN`，其中 `timeLimitMonths := remainingMonths`（其余字段原样），`TEXT / PICT` 原样透传，使"保存—读档"后的到期月不变；`result != 'pending'` 时不写 `SCEN / TEXT / PICT`（城市退化为普通存档）。读档：有 `SCEN` 且可解析 → 构造 `ScenarioState`（`startMonthIndex` 取当前城龄）并显示简报；`SCEN` 全零目标且 `disaster == 0` 视为无情景。

---

## 3. 数据结构与算法建议

### 3.1 TypeScript 接口

```ts
export type Difficulty = 1 | 2 | 3;                       // Easy / Medium / Hard（存 MISC 0x001C）
export type StartYear = 1900 | 1950 | 2000 | 2050;
export type Speed = 1 | 2 | 3 | 4 | 5;                    // Paused / Turtle / Llama / Cheetah / African Swallow

export interface GameDate { year: number; month: number /* 0..11 */; day: number /* 0..24 */ }

export type PhaseId =
  | 'settleMonth' | 'closeYear' | 'techCheck' | 'nationalAnnual' | 'neighborsAnnual' | 'approvalSurvey'
  | 'facilityAnnual' | 'utilitiesAnnual' | 'budgetWindow' | 'beginMonth'
  | 'powerScan' | 'dataMaps' | 'growthScan' | 'trafficDecay' | 'waterScan'
  | 'census' | 'demand' | 'demographics' | 'graphs'
  | 'milestones' | 'scenario' | 'solvency' | 'uiRefresh'
  | 'weatherAndDisaster' | 'cityStatus' | 'news';

export type PhaseResult = 'done' | 'suspend';
export interface PhaseRunner { run(id: PhaseId, sim: Sim, day: number): PhaseResult }   // 各模块注册

export interface ClockState {
  age: number;                     // MISC 0x0010（唯一真源；date 由它派生）
  foundedYear: number;             // MISC 0x000C
  speed: Speed;                    // MISC 0x0FEC
  modalPause: number;              // >0 时不推进（预算窗口、提案、胜负框、对话框计数）
  phaseCursor: number;             // 当日已完成的阶段数；0 = 该日尚未开始。写档时必须为 0（模态打开时禁止存档）
  accumMs: number;                 // 真实时间累积
  prng: Prng;                      // 模拟流（§2.13）
}
export const dateOf = (c: ClockState): GameDate => ({
  year: c.foundedYear + Math.floor(c.age / 300), month: Math.floor((c.age % 300) / 25), day: c.age % 25 });
export const monthIndex = (age: number) => Math.floor(age / 25);

export interface TaxRates { r: number; c: number; i: number }   // 0..20 整数；i 为显示/存档用的加权值

export const enum BudgetLine {
  Police = 0, Fire, Health, Schools, Colleges,
  Roads, Highways, Bridges, Rail, Subway, Tunnel,            // 与 MISC 0x0998.. 的顺序一致
}
export const BUDGET_LINE_COUNT = 11;

export interface LineMonth { count: number; funding: number }   // 月历史条目（数量，资金率）
export interface TaxMonth  { pop: number; rate: number }
export interface BondMonth { count: number; avgRateRaw: number }

export interface Bond {
  rateRaw: number;                 // 百分比 × 10000
  issuedYear: number;              // 显示用，不入存档
  issuedMonth: number;
}
export type CreditRating = 'AAA'|'AA'|'A'|'BBB'|'BB'|'B'|'CCC'|'CC'|'C'|'D'|'F';

export const enum OrdinanceId {
  SalesTax = 0, IncomeTax, LegalizedGambling, ParkingFines,
  ProReading, AntiDrug, CprTraining, NeighborhoodWatch,
  EnergyConservation, NuclearFreeZone, HomelessShelter, PollutionControls,
  VolunteerFire, SmokingBan, FreeClinics, JuniorSports,
  TouristAdvertising, BusinessAdvertising, CityBeautification, AnnualCarnival,
}
export type OrdinanceGroup = 'finance' | 'educationSafety' | 'environment' | 'healthSafety' | 'promotional';
export interface Ratio { num: number; den: number }             // 百分比的分数表示：1/6% = {1,6}
export interface OrdinanceDef {
  id: OrdinanceId; group: OrdinanceGroup; key: string;          // key 用于本项目文案表
  availableYear: number;                                        // 0 = 始终
  money: { base: 'R' | 'C' | 'I' | 'All'; pct: Ratio; sign: 1 | -1 } | null;
  demand: Partial<Record<'r'|'c'|'i', number>>;                 // 乘数转录自 zones §2.8.4（所有者在那里）
  forbidNuclear?: true;                                         // 工具层：禁止放核电厂（§3.6）
  advertising?: true;                                           // 本模块 counters.advertising 计数
  // 没有 effects 字段：非金钱效果由 services / power-water / zones 规格按位掩码自行实现（§2.5）
}

export interface MonthlyFlow {                                  // 一个月的现金流（美元，整数）
  tax: { r: number; c: number; i: number; total: number };
  ordinances: Int32Array;                                       // 20，正收入负成本
  ordinanceNet: number;
  bondInterest: number;                                         // 正数，支出
  lines: Int32Array;                                            // 11 条线支出
  fixed: number;                                                // 公交站等
  income: number; expense: number; net: number;
}

export interface YearReport {
  year: number;
  months: MonthlyFlow[];                                        // 已结月份
  openingFunds: number; closingFunds: number;
  totals: MonthlyFlow;                                          // 逐项求和
  bondsIssued: number; bondsRepaid: number;
}

export interface BudgetHistory {                                // 12 个月环形历史（与存档 27×4B 块一一对应）
  tax: { r: TaxMonth[]; c: TaxMonth[]; i: TaxMonth[] };         // 各 12
  lines: LineMonth[][];                                         // 11 × 12
  bonds: BondMonth[];                                           // 12
  ordinances: { count: number; net: number }[];                 // 12（本项目约定，见 §3.10）
}

export interface EconomyState {
  funds: number;                                                // MISC 0x0014，夹在 int32
  taxRate: TaxRates;
  industryTax: Int32Array;                                      // 11，0..20
  funding: Uint8Array;                                          // 11，0..100
  ordinances: number;                                           // 20 位掩码（MISC 0x0FA0）
  bonds: Bond[];                                                // ≤ 50
  fedRateRaw: number;
  autoBudget: boolean;                                          // MISC 0x0FF0
  history: BudgetHistory;
  ytd: MonthlyFlow[];                                           // 本年已结月份
  lastYear: YearReport | null;
  yearOpeningFunds: number;
  bondsIssuedThisYear: number; bondsRepaidThisYear: number; negativeYears: number;
  counters: { advertising: number; fame: number };              // MISC 0x003C / 0x0038
  reportedThisYear: { underfunded: Set<BudgetLine>; taxGripe: boolean };   // 事件去重，不存档
  impeached: boolean;                                           // 观察模式标志，不存档
}

/** 分区模块在第 21 天定稿、本模块在下月第 0 天消费的人口快照（zones §3.1 的 ZonePopulation 需含 taxable*） */
export interface CensusSnapshot {
  res: number; com: number; ind: number;                        // 已建、供电、有人口
  arcoPop: number; normalPop: number; citySize: number;
  taxableRes: number; taxableCom: number; taxableInd: number;   // res + ⌊arco/6⌋、com + ⌊arco/12⌋、ind + ⌊arco/12⌋（§2.4.1）
  workforce: number; jobs: number; unemploymentPct: number;
}

/** 其他模块向本模块提供的只读输入（settleMonth / 预算窗口 / 债券用） */
export interface EconomyInputs {
  census: CensusSnapshot;
  industryRatio: Int32Array;                                    // 11，Σ=100
  structureCounts: { police: number; prison: number; fire: number; hospital: number; school: number;
                     college: number; busDepot: number };       // services 维护（§2.7）
  transit: Record<'roads'|'highways'|'bridges'|'rail'|'subway'|'tunnel', { items: { count: number; unitCents: number }[] }>;
  cityValueDollars: number;                                     // MISC 0x0024（services §2.10.2）
  landValueSum: number;                                         // MISC 0x0028（cityValueMode = 'landValue' 时用）
  national: { pop: number; value: number; tax: number; trend: 0 | 1 | 2 };
}

/** 交给顾问选取逻辑（disasters-events §2.11）的经济侧上下文 */
export interface BudgetAdvisorContext {
  funds: number; taxRate: TaxRates; ordinances: number; bonds: { count: number; avgRateRaw: number }; fedRateRaw: number;
  funding: Uint8Array; structureCounts: EconomyInputs['structureCounts']; lastYear: YearReport | null; estimate: MonthlyFlow;
}

export type EconomyEvent =
  | { type: 'monthSettled'; flow: MonthlyFlow; funds: number }
  | { type: 'yearClosed'; report: YearReport }
  | { type: 'budgetWindow'; report: YearReport | null }         // 需要 UI 打开窗口并暂停（阶段挂起）
  | { type: 'insufficientFunds'; cost: number; funds: number }
  | { type: 'bondIssued'; bond: Bond } | { type: 'bondRepaid'; bond: Bond }
  | { type: 'bondRefused'; reason: 'max' | 'rating' }
  | { type: 'fedRate'; direction: 'up' | 'down'; rateRaw: number }
  | { type: 'ordinance'; id: OrdinanceId; enacted: boolean }
  | { type: 'underfunded'; line: BudgetLine }                   // → fundtransit / 顾问
  | { type: 'taxGripe'; rate: number; severe: boolean }
  | { type: 'impeached'; funds: number }
  | { type: 'scenario'; result: 'won' | 'lost'; goals: { goal: ScenarioGoal; current: number; met: boolean }[] };

export interface EconomyTuning {
  taxDivisor: 75;
  startFunds: Record<Difficulty, number>;                       // {1: 20000, 2: 10000, 3: 10000}
  hardStartBondRateRaw: 30000;
  msPerDay: Record<Speed, number>;                              // {1: Infinity, 2: 480, 3: 160, 4: 40, 5: 0}
  maxDaysPerFrame: 10;
  defaultSpeed: Speed;                                          // 3
  lineUnitCents: Record<'police'|'prison'|'fire'|'hospital'|'school'|'college'|'busDepot', number>;
  transitCostScale: number;                                     // 1
  underfundedThreshold: 80;
  bonds: {
    face: 10000; max: 50; perBondSpreadRaw: 2500; jitterRaw: 10000; minRaw: 10000; maxRaw: 250000;
    fedInitialRaw: 30000; fedPerTrendRaw: 10000; fedSteps: number[]; fedStepProb: number[]; fedMinRaw: 10000; fedMaxRaw: 150000;
    dsrTiers: number[]; collateralTiers: number[]; spreadRaw: Record<CreditRating, number>;
    cityValueMode: 'misc0x0024' | 'landValue';                  // 默认 'misc0x0024'
  };
  impeachFundsThreshold: number;                                // -50000
  impeachYears: number;                                         // 0 = 关闭
  impeachCheck: 'yearEnd' | 'monthly';                          // 'yearEnd'
  scenario: { winEarly: boolean; strict: boolean };             // { false, false }
  advertisingCounterMax: 100;
  demolishWholeStructure: boolean;                              // true：$1 × size²
}
```

### 3.2 常量表（直接落代码）

```ts
export const LINE_UNIT_CENTS = { police: 10000, prison: 10000, fire: 10000, hospital: 5000, school: 2500, college: 10000, busDepot: 2500 };

export const ORDINANCES: readonly OrdinanceDef[] = [
  { id: 0,  group: 'finance',         key: 'salesTax',        availableYear: 0, money: { base: 'C',   pct: {num:1, den:1}, sign: +1 }, demand: { c: 0.99 } },
  { id: 1,  group: 'finance',         key: 'incomeTax',       availableYear: 0, money: { base: 'R',   pct: {num:1, den:1}, sign: +1 }, demand: { r: 0.99 } },
  { id: 2,  group: 'finance',         key: 'gambling',        availableYear: 0, money: { base: 'C',   pct: {num:2, den:1}, sign: +1 }, demand: {} },
  { id: 3,  group: 'finance',         key: 'parkingFines',    availableYear: 0, money: { base: 'R',   pct: {num:1, den:2}, sign: +1 }, demand: {} },
  { id: 4,  group: 'educationSafety', key: 'proReading',      availableYear: 0, money: { base: 'R',   pct: {num:1, den:6}, sign: -1 }, demand: {} },
  { id: 5,  group: 'educationSafety', key: 'antiDrug',        availableYear: 0, money: { base: 'R',   pct: {num:1, den:5}, sign: -1 }, demand: {} },
  { id: 6,  group: 'educationSafety', key: 'cprTraining',     availableYear: 0, money: { base: 'R',   pct: {num:1, den:6}, sign: -1 }, demand: {} },
  { id: 7,  group: 'educationSafety', key: 'nbhdWatch',       availableYear: 0, money: { base: 'R',   pct: {num:1, den:3}, sign: -1 }, demand: {} },
  { id: 8,  group: 'environment',     key: 'energyCons',      availableYear: 0, money: { base: 'All', pct: {num:1, den:2}, sign: -1 }, demand: {} },
  { id: 9,  group: 'environment',     key: 'nuclearFree',     availableYear: 0, money: null,                                         demand: {}, forbidNuclear: true },
  { id: 10, group: 'environment',     key: 'homelessShelter', availableYear: 0, money: { base: 'R',   pct: {num:1, den:2}, sign: -1 }, demand: { c: 1.01 } },
  { id: 11, group: 'environment',     key: 'pollutionCtrl',   availableYear: 0, money: { base: 'I',   pct: {num:1, den:1}, sign: -1 }, demand: { i: 0.99 } },
  { id: 12, group: 'healthSafety',    key: 'volunteerFire',   availableYear: 0, money: { base: 'R',   pct: {num:1, den:3}, sign: -1 }, demand: {} },
  { id: 13, group: 'healthSafety',    key: 'smokingBan',      availableYear: 0, money: { base: 'R',   pct: {num:1, den:6}, sign: -1 }, demand: {} },
  { id: 14, group: 'healthSafety',    key: 'freeClinics',     availableYear: 0, money: { base: 'R',   pct: {num:1, den:2}, sign: -1 }, demand: {} },
  { id: 15, group: 'healthSafety',    key: 'juniorSports',    availableYear: 0, money: { base: 'R',   pct: {num:1, den:4}, sign: -1 }, demand: {} },
  { id: 16, group: 'promotional',     key: 'touristAd',       availableYear: 0, money: { base: 'C',   pct: {num:1, den:1}, sign: -1 }, demand: { c: 1.01 }, advertising: true },
  { id: 17, group: 'promotional',     key: 'businessAd',      availableYear: 0, money: { base: 'I',   pct: {num:1, den:1}, sign: -1 }, demand: { i: 1.01 }, advertising: true },
  { id: 18, group: 'promotional',     key: 'beautification',  availableYear: 0, money: { base: 'R',   pct: {num:1, den:4}, sign: -1 }, demand: { r: 1.01 } },
  { id: 19, group: 'promotional',     key: 'carnival',        availableYear: 0, money: { base: 'C',   pct: {num:1, den:3}, sign: -1 }, demand: { c: 1.01 } },
];
// vitest：ORDINANCES[i].demand 与 zones-growth-demand §2.8.4 的表逐项相等（所有者在 zones）。

export const CREDIT_RATINGS: CreditRating[] = ['AAA','AA','A','BBB','BB','B','CCC','CC','C','D','F'];
export const DSR_TIERS        = [0.02, 0.04, 0.07, 0.10, 0.15, 0.20, 0.30, 0.40, 0.50, 0.75];
export const COLLATERAL_TIERS = [0.05, 0.10, 0.20, 0.30, 0.40, 0.50, 0.60, 0.70, 0.80, 1.00];
export const RATING_SPREAD_RAW: Record<CreditRating, number> = { AAA:0, AA:2500, A:5000, BBB:10000, BB:15000, B:20000, CCC:30000, CC:40000, C:50000, D:70000, F: Number.POSITIVE_INFINITY };
export const INT32_MAX = 2147483647, INT32_MIN = -2147483648;

/** §2.3.1 的调度表。'growthScan' 在 3..18 每天出现一次，参数由 day 推出（§2.3.3）。 */
export const DAY_PHASES: Readonly<Record<number, readonly PhaseId[]>> = {
  0:  ['settleMonth', 'closeYear', 'techCheck', 'nationalAnnual', 'neighborsAnnual', 'approvalSurvey',
       'facilityAnnual', 'utilitiesAnnual', 'budgetWindow', 'beginMonth'],       // 带 (仅 1 月) 条件的阶段自行判断 month == 0
  1:  ['powerScan'],
  2:  ['dataMaps'],
  3:  ['growthScan'], 4: ['growthScan'], 5: ['growthScan'], 6: ['growthScan'],
  7:  ['growthScan'], 8: ['growthScan'], 9: ['growthScan'], 10: ['growthScan'],
  11: ['growthScan'], 12: ['growthScan'], 13: ['growthScan'], 14: ['growthScan'],
  15: ['growthScan'], 16: ['growthScan'], 17: ['growthScan'], 18: ['growthScan'],
  19: ['trafficDecay'],
  20: ['waterScan'],
  21: ['census', 'demand', 'demographics', 'graphs'],
  22: ['milestones', 'scenario', 'solvency'],
  23: ['uiRefresh'],
  24: ['weatherAndDisaster', 'cityStatus', 'news'],
};
export const growthStep    = (day: number) => Math.floor((day - 3) / 4);   // 0..3
export const growthSubstep = (day: number) => (day + 1) % 4;               // 0..3

export type LayerName = 'XBLD'|'XZON'|'XUND'|'XBIT.POWERED'|'XBIT.WATERED'|'XTRF'|'XPLT'|'XVAL'|'XCRM'|'XPLC'|'XFIR'|'XPOP'|'XROG'|'XMIC';
export interface PhaseIo { reads: LayerName[]; bulk: LayerName[]; point: LayerName[]; usesPrng: boolean; canSuspend: boolean }
export const PHASE_IO: Readonly<Record<PhaseId, PhaseIo>> = {
  settleMonth:    { reads: [], bulk: [], point: [], usesPrng: false, canSuspend: false },
  closeYear:      { reads: [], bulk: [], point: [], usesPrng: false, canSuspend: true },
  techCheck:      { reads: [], bulk: [], point: [], usesPrng: false, canSuspend: false },
  nationalAnnual: { reads: [], bulk: [], point: [], usesPrng: true,  canSuspend: false },
  neighborsAnnual:{ reads: [], bulk: [], point: [], usesPrng: true,  canSuspend: false },
  approvalSurvey: { reads: [], bulk: [], point: [], usesPrng: true,  canSuspend: false },
  facilityAnnual: { reads: ['XMIC','XBLD'], bulk: ['XMIC'], point: ['XBLD'], usesPrng: true, canSuspend: false },
  utilitiesAnnual:{ reads: ['XBLD'], bulk: [], point: ['XBLD'], usesPrng: true, canSuspend: false },
  budgetWindow:   { reads: [], bulk: [], point: [], usesPrng: false, canSuspend: true },
  beginMonth:     { reads: [], bulk: [], point: [], usesPrng: false, canSuspend: false },
  powerScan:      { reads: ['XBLD','XUND','XBIT.POWERED'], bulk: ['XBIT.POWERED'], point: [], usesPrng: true, canSuspend: false },
  dataMaps:       { reads: ['XBLD','XZON','XBIT.POWERED','XTRF','XPLT','XCRM','XPOP','XROG'], bulk: ['XPLT','XVAL','XPLC','XFIR','XPOP','XROG','XCRM'], point: [], usesPrng: false, canSuspend: false },
  growthScan:     { reads: ['XBLD','XZON','XUND','XBIT.POWERED','XBIT.WATERED','XVAL','XCRM','XPLT'], bulk: [], point: ['XBLD','XZON','XTRF','XMIC'], usesPrng: true, canSuspend: false },
  trafficDecay:   { reads: ['XTRF'], bulk: ['XTRF'], point: [], usesPrng: false, canSuspend: false },
  waterScan:      { reads: ['XUND','XBIT.POWERED','XBIT.WATERED'], bulk: ['XBIT.WATERED'], point: [], usesPrng: false, canSuspend: false },
  census:         { reads: ['XBLD','XZON','XMIC'], bulk: [], point: [], usesPrng: false, canSuspend: false },
  demand:         { reads: [], bulk: [], point: [], usesPrng: true,  canSuspend: false },
  demographics:   { reads: [], bulk: [], point: [], usesPrng: true,  canSuspend: false },
  graphs:         { reads: [], bulk: [], point: [], usesPrng: false, canSuspend: false },
  milestones:     { reads: [], bulk: [], point: [], usesPrng: false, canSuspend: true },
  scenario:       { reads: [], bulk: [], point: [], usesPrng: false, canSuspend: true },
  solvency:       { reads: [], bulk: [], point: [], usesPrng: false, canSuspend: true },
  uiRefresh:      { reads: [], bulk: [], point: [], usesPrng: false, canSuspend: false },
  weatherAndDisaster: { reads: [], bulk: [], point: [], usesPrng: true, canSuspend: false },
  cityStatus:     { reads: [], bulk: [], point: [], usesPrng: true,  canSuspend: false },
  news:           { reads: [], bulk: [], point: [], usesPrng: true,  canSuspend: false },
};
```

`COST_TABLE`（§2.9）按 `{ tool, xbld, size, cost, perTile, line, requires }` 落为一张常量表，各模块通过 `economy.charge(costOf(tool, tiles))` 扣费，不各自复制价格。

### 3.3 月结算伪代码（第 0 天 `settleMonth`）

```
function splitMonthly(annual: int, m: int /* 0..11 */): int
  return floor(annual × (m + 1) / 12) − floor(annual × m / 12)     // 12 份之和恰等于 annual，无状态

function settleMonth(st: EconomyState, in: EconomyInputs, tune, out: EconomyEvent[]): MonthlyFlow | null
  if clock.age == 0: return null                                     // 新城第一天没有"上个月"
  m = (dateOf(clock).month + 11) % 12                                 // 被结算的是上个月；1 月第 0 天结算去年 12 月
  // 1. 税收（census 为上月第 21 天定稿的快照，含 arco 份额）
  tax.r = floor(st.taxRate.r × in.census.taxableRes / 75)
  tax.c = floor(st.taxRate.c × in.census.taxableCom / 75)
  weighted = Σ_k in.industryRatio[k] × st.industryTax[k]            // 0..2000
  tax.i = floor(in.census.taxableInd × weighted / 100 / 75)
  tax.total = tax.r + tax.c + tax.i
  st.taxRate.i = round(weighted / 100)                                // 存档/显示用的加权工业税率

  // 2. 法令（基于本月税收，逐条向下取整）
  for def in ORDINANCES: ord[def.id] = 0
    if !(st.ordinances >> def.id & 1) or def.money == null: continue
    base = def.money.base == 'All' ? tax.total : tax[def.money.base]
    ord[def.id] = def.money.sign × floor(base × def.money.pct.num / (def.money.pct.den × 100))
  ordinanceNet = Σ ord
  anyAd = ORDINANCES.some(d => d.advertising and st.ordinances >> d.id & 1)
  st.counters.advertising = clamp(st.counters.advertising + (anyAd ? 1 : −1), 0, tune.advertisingCounterMax)

  // 3. 部门经费（数量 × 单价 × 资金率，按月份切分）
  for line in 0..10:
    annual = annualLineCost(line, in, st.funding[line], tune)        // §2.7/§2.8，整数美元
    lines[line] = splitMonthly(annual, m)
  fixed = splitMonthly(floor(in.structureCounts.busDepot × tune.lineUnitCents.busDepot / 100), m)

  // 4. 债券利息
  bondInterest = Σ_b splitMonthly(floor(b.rateRaw / 100), m)

  // 5. 记账
  income = tax.total + max(ordinanceNet, 0)
  expense = Σ lines + fixed + bondInterest + max(−ordinanceNet, 0)
  net = income − expense
  st.funds = clampInt32(st.funds + net)

  // 6. 历史（环形，索引 m）
  st.history.tax.r[m] = { pop: in.census.taxableRes, rate: st.taxRate.r }；c、i 同理（i 用 taxRate.i 与 taxableInd）
  for line: st.history.lines[line][m] = { count: lineCount(line, in), funding: st.funding[line] }
  st.history.bonds[m] = { count: st.bonds.length, avgRateRaw: st.bonds.length ? floor(Σ rateRaw / st.bonds.length) : 0 }
  st.history.ordinances[m] = { count: popcount(st.ordinances), net: ordinanceNet }
  flow = { tax, ordinances: ord, ordinanceNet, bondInterest, lines, fixed, income, expense, net }
  st.ytd.push(flow)

  // 7. 事件（只有两类是本模块自判的）
  for line in [Roads..Tunnel]:                                       // fundtransit；警/校/狱由 services 的年度微模拟触发
    if st.funding[line] < tune.underfundedThreshold and lineCount(line) > 0 and !st.reportedThisYear.underfunded.has(line):
      st.reportedThisYear.underfunded.add(line); out.push({ type: 'underfunded', line })
  r = max(st.taxRate.r, st.taxRate.c, st.taxRate.i)
  if r >= 10 and !st.reportedThisYear.taxGripe:
      st.reportedThisYear.taxGripe = true; out.push({ type: 'taxGripe', rate: r, severe: r >= 15 })
  out.push({ type: 'monthSettled', flow, funds: st.funds })
  return flow

function annualLineCost(line, in, funding, tune): int
  switch line:
    Police:   cents = in.structureCounts.police × U.police + in.structureCounts.prison × U.prison
    Fire:     cents = in.structureCounts.fire × U.fire
    Health:   cents = in.structureCounts.hospital × U.hospital
    Schools:  cents = in.structureCounts.school × U.school
    Colleges: cents = in.structureCounts.college × U.college
    Roads..Tunnel: cents = Σ_items count × unitCents × tune.transitCostScale     // transport-traffic.md §2.4
  return floor(cents × funding / 100 / 100)
```

### 3.4 年结算、国家经济与预算窗口伪代码（1 月第 0 天）

```
function closeYear(st, tune, out): PhaseResult                     // 阶段 'closeYear'；仅 month == 0 && age > 0
  report = { year: year − 1, months: st.ytd, openingFunds: st.yearOpeningFunds, closingFunds: st.funds,
             totals: sum(st.ytd), bondsIssued: st.bondsIssuedThisYear, bondsRepaid: st.bondsRepaidThisYear }
  st.lastYear = report; st.ytd = []; st.yearOpeningFunds = st.funds
  st.bondsIssuedThisYear = st.bondsRepaidThisYear = 0
  st.reportedThisYear = { underfunded: new Set(), taxGripe: false }
  if tune.impeachCheck == 'yearEnd' and !st.impeached:
    if st.funds < tune.impeachFundsThreshold: return impeach(st, out)
    if tune.impeachYears > 0:
      st.negativeYears = st.funds < 0 ? st.negativeYears + 1 : 0
      if st.negativeYears >= tune.impeachYears: return impeach(st, out)
  return 'done'

function impeach(st, out): PhaseResult
  if scenario and scenario.result == 'pending': scenarioFinish('lost')
  st.impeached = true; out.push({ type: 'impeached', funds: st.funds }); return 'suspend'   // 游戏结束框

function nationalAnnual(st, nat, prng, out)                        // 阶段 'nationalAnnual'（zones 的 natTrend/natPop 更新在同一阶段先行）
  step = pickWeighted(tune.bonds.fedSteps, tune.bonds.fedStepProb, prng) + (nat.trend == 2 ? 2500 : nat.trend == 0 ? −2500 : 0)
  next = clamp(st.fedRateRaw + step, tune.bonds.fedMinRaw, tune.bonds.fedMaxRaw)
  if next != st.fedRateRaw: out.push({ type: 'fedRate', direction: next > st.fedRateRaw ? 'up' : 'down', rateRaw: next })
  st.fedRateRaw = next

function budgetWindowPhase(st, out): PhaseResult                   // 阶段 'budgetWindow'；仅 month == 0 && age > 0
  out.push({ type: 'yearClosed', report: st.lastYear })             // 自动预算时也发（报纸需要）
  if st.autoBudget: return 'done'
  out.push({ type: 'budgetWindow', report: st.lastYear })           // UI：modalPause++，打开窗口
  return 'suspend'                                                  // 关闭窗口 → clock.resume()（§3.7）

function budgetWindowModel(st, in, clock): BudgetView               // 任意时刻可调用
  elapsed = st.ytd.length; remaining = 12 − elapsed
  current = previewMonth(st, in)                                    // 用当前滑块值算"本月若结算"的 flow（不写状态、不消费 PRNG）
  for each row: ytd = Σ st.ytd[row]; estimate = ytd + current[row] × remaining
  cashFlowEstimate = Σ 收入估计 − Σ 支出估计
  endOfYearFunds = st.funds + (cashFlowEstimate − Σ st.ytd.net)
  ctx: BudgetAdvisorContext = { funds, taxRate, ordinances, bonds, fedRateRaw, funding, structureCounts, lastYear, estimate: current }
  return { rows, taxRate: st.taxRate.r, funding: st.funding, autoBudget: st.autoBudget, lastYear: st.lastYear,
           funds: st.funds, openingFunds: st.yearOpeningFunds, endOfYearFunds, advisors: advisors.select(ctx, servicesCtx) }   // disasters §2.11
```

滑块改动立即写回 `st`（并重算估计列）；"取消"恢复打开时的快照。主税率滑块：`setPropertyTax(v) { taxRate = {r:v, c:v, i:v}; industryTax.fill(v) }`。

### 3.5 债券操作伪代码

```
function cityValueDollars(in, tune): int
  return tune.bonds.cityValueMode == 'landValue' ? floor(in.landValueSum / 2) × 1000 : in.cityValueDollars

function creditRating(st, in): CreditRating
  debt = 10000 × st.bonds.length
  debtService = Σ floor(b.rateRaw / 100)
  annualTax = st.lastYear ? st.lastYear.totals.tax.total : previewMonth(st, in).tax.total × 12
  i1 = tierIndex(DSR_TIERS, debtService / max(annualTax, 1))
  i2 = tierIndex(COLLATERAL_TIERS, debt / max(cityValueDollars(in, tune), 1))
  return CREDIT_RATINGS[max(i1, i2)]

function nextBondRateRaw(st, in, jitter: int): int | null          // 预览：jitter = 0；发行：jitter = prng.int(10000)
  r = creditRating(st, in); if r == 'F': return null
  return clamp(st.fedRateRaw + 2500 × st.bonds.length + RATING_SPREAD_RAW[r] + jitter, 10000, 250000)

function issueBond(st, in, prng, out, opt?: { rateRaw?: int; bypassRating?: boolean }): boolean     // 可重放命令
  if st.bonds.length >= 50: out.push({ type: 'bondRefused', reason: 'max' }); return false
  raw = opt?.rateRaw ?? nextBondRateRaw(st, in, prng.int(10000))
  if raw == null and !opt?.bypassRating: out.push({ type: 'bondRefused', reason: 'rating' }); return false
  bond = { rateRaw: raw ?? 250000, issuedYear: year, issuedMonth: month }
  st.bonds.push(bond); st.funds = clampInt32(st.funds + 10000); st.bondsIssuedThisYear++
  out.push({ type: 'bondIssued', bond }); return true

function repayBond(st, out): boolean
  if st.bonds.length == 0 or st.funds < 10000: return false
  bond = st.bonds.shift()                                   // 最早一张
  st.funds −= 10000; st.bondsRepaidThisYear++
  out.push({ type: 'bondRepaid', bond }); return true

bondWindowModel(st, in): { bonds: [{ issuedYear, ratePctFloor: floor(rateRaw/10000), annual: floor(rateRaw/100) }],
  count, avgRatePctFloor, sumRatePctFloor, nextRatePctFloor: nextBondRateRaw(st, in, 0) | null, rating, cityValueDollars, canIssue, canRepay }
```

### 3.6 扣费 API 与工具费用

```
function canAfford(st, cost): boolean   return cost <= 0 || st.funds >= cost
function charge(st, cost, out): boolean
  if st.impeached: return false
  if !canAfford(st, cost): out.push({ type: 'insufficientFunds', cost, funds: st.funds }); return false
  st.funds = clampInt32(st.funds − cost); return true

// 工具层调用约定（所有放置型模块遵守）
costOf(tool, tiles | size):
  perTile 工具（道路、电线、管线、分区、推土、港口分区等）：unit × tiles（拖动预览时显示累计价）
  放置型建筑：COST_TABLE[tool].cost
  桥梁：水面格数 × 桥型单价（对话框逐型显示，不够钱的红字但可选，确认时再 charge）
  拆除：tune.demolishWholeStructure ? 1 × size² : 1
拖动类工具：先算整段费用，再一次 charge；失败则整段不放（不做部分应用）
可用性门控（工具变灰的原因，按序）：科技未发明（sim/tech）→ Nuclear Free Zone 且工具为核电厂 → 奖励位未授予（services）→ 资金不足
```

### 3.7 时钟推进与阶段调度伪代码

```
function tick(sim, dtMs)                                          // 每帧
  c = sim.clock
  if c.modalPause > 0 or c.speed == 1 or sim.disasters.mode == Disaster: return
  if tune.msPerDay[c.speed] == 0: n = tune.maxDaysPerFrame
  else: c.accumMs += dtMs; n = floor(c.accumMs / tune.msPerDay[c.speed]); c.accumMs −= n × tune.msPerDay[c.speed]
  for i in 1..n: if advanceDay(sim) == 'suspended': return

function advanceDay(sim): 'advanced' | 'suspended'               // 一个模拟 tick = 一天；可被模态框挂起后 resume
  c = sim.clock; day = c.age % 25; phases = DAY_PHASES[day]
  while c.phaseCursor < phases.length:
    id = phases[c.phaseCursor]
    if !phaseApplies(id, c): c.phaseCursor++; continue           // (仅 1 月) 的年初阶段、age == 0 的 settleMonth 等
    r = runners[id].run(id, sim, day)
    c.phaseCursor++
    if r == 'suspend': return 'suspended'                         // UI 打开了模态框；modalPause 已 ++
  c.phaseCursor = 0
  sim.utilities.flushDirtyRescans()                               // 阶段外：当日命令 / 电厂到期留下的 dirty.power / dirty.water
  c.age++
  return 'advanced'

function resume(sim)                                              // 模态框关闭时由 UI 调用
  sim.clock.modalPause--
  if sim.clock.modalPause == 0 and sim.clock.phaseCursor > 0: advanceDay(sim)   // 把当天剩余阶段跑完

phaseApplies(id, c):
  m = dateOf(c).month
  switch id:
    'settleMonth': return c.age > 0
    'closeYear' | 'budgetWindow': return m == 0 and c.age > 0
    'techCheck' | 'nationalAnnual' | 'neighborsAnnual' | 'approvalSurvey' | 'facilityAnnual' | 'utilitiesAnnual': return m == 0
    'solvency': return tune.impeachCheck == 'monthly'
    default: return true

function runGrowthScan(sim, day)                                  // runners.growthScan
  step = growthStep(day); sub = growthSubstep(day)
  for x = step; x < 128; x += 4:
    for y = sub; y < 128; y += 4:
      sim.transport.budgetTick(x, y)
      sim.zones.growthVisit(x, y)
      sim.services.onGrowthVisit(x, y)
  return 'done'

function statsMonthly(sim)                                        // runners.graphs（第 21 天）
  for s in SERIES: xgrp.pushMonth(s, current(s))
  { month, year } = dateOf(sim.clock)
  if month == 5 or month == 11: for s: xgrp.pushHalfYear(s, current(s))
  if month == 11 and year % 5 == 0: for s: xgrp.pushFiveYear(s, current(s))
```

玩家命令（放置 / 推土 / 法令 / 债券 / 滑块 / 作弊）只在**两个 `advanceDay` 之间**或在挂起期间执行；命令日志记录 `(age, phaseCursor, command)` 以支持重放。存档在 `phaseCursor > 0` 时被菜单禁用。

### 3.8 `Prng` 参考实现

```ts
export function createPrng(seed: number): Prng {
  let a = seed >>> 0;
  const next32 = () => {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return (t ^ (t >>> 14)) >>> 0;
  };
  return {
    next32,
    next15: () => next32() >>> 17,
    int: (n) => (n <= 0 ? 0 : next32() % n),
    range: (lo, hi) => lo + (hi < lo ? 0 : next32() % (hi - lo + 1)),
    float: () => next32() / 4294967296,
    bit: () => (next32() >>> 31) === 1,
    pick: (arr) => { if (arr.length === 0) throw new Error('pick: empty'); return arr[next32() % arr.length]; },
    shuffle: (arr) => { for (let i = arr.length - 1; i > 0; i--) { const j = next32() % (i + 1); [arr[i], arr[j]] = [arr[j], arr[i]]; } },
    state: () => a >>> 0,
    seed: (s) => { a = s >>> 0; },
  };
}
export function hash32(...parts: (number | string)[]): number {     // FNV-1a
  let h = 0x811c9dc5;
  for (const p of parts) for (const ch of String(p)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 0x01000193); }
  return h >>> 0;
}
```

### 3.9 情景评估与视图模型伪代码

```
function loadScenario(doc: Sc2Document, clock): ScenarioState | null        // file-formats §2.5 已解析字节
  s = doc.scenario; if !s: return null
  g = parseScen(s.scen)                                                     // {disaster, x, y, timeLimitMonths, goals: int[9], bld1, bld2, bld1Tiles, bld2Tiles}
  goals = []
  for (key, idx) in [citySize 0, resPop 1, comPop 2, indPop 3, cash 4, landValue 5]: if g.goals[idx] > 0: goals.push({ key, cmp: 'gte', target: g.goals[idx] })
  for (key, idx) in [pollutionMax 6, crimeMax 7, trafficMax 8]:             if g.goals[idx] > 0: goals.push({ key, cmp: 'lte', target: g.goals[idx] })
  if g.bld1 and g.bld1Tiles: goals.push({ key: 'bld1', cmp: 'gte', target: g.bld1Tiles, buildingId: g.bld1 })
  if g.bld2 and g.bld2Tiles: goals.push({ key: 'bld2', cmp: 'gte', target: g.bld2Tiles, buildingId: g.bld2 })
  if goals.length == 0 and g.disaster == 0: return null
  start = monthIndex(clock.age)
  disasters.requestDisaster(g.disaster, { x: g.x, y: g.y })                 // disasters §2.3.2
  return { startMonthIndex: start, finalMonthIndex: start + max(1, g.timeLimitMonths) − 1, goals,
           briefing: { short: text(0x80), long: text(0x81), pict: decodePict(s.pict) }, result: 'pending', resultAge: null }

function currentValue(goal, sim): int
  switch goal.key:
    citySize → sim.census.final.normalPop;  resPop/comPop/indPop → census.final.res/com/ind
    cash → economy.funds;  landValue → MISC 0x0028;  pollutionMax → MISC 0x0034;  crimeMax → MISC 0x002C;  trafficMax → MISC 0x0030
    bld1/bld2 → tileCounts[goal.buildingId]
function meets(goal, sim, strict): boolean
  v = currentValue(goal, sim)
  return goal.cmp == 'gte' ? (strict ? v > goal.target : v >= goal.target) : (strict ? v < goal.target : v <= goal.target)

function scenarioPhase(sim, out): PhaseResult                              // 第 22 天，§2.16.3
  sc = sim.scenario; if !sc or sc.result != 'pending': return 'done'
  rows = sc.goals.map(g => ({ goal: g, current: currentValue(g, sim), met: meets(g, sim, tune.scenario.strict) }))
  allMet = rows.every(r => r.met)
  if monthIndex(sim.clock.age) >= sc.finalMonthIndex: return finish(allMet ? 'won' : 'lost')
  if tune.scenario.winEarly and allMet: return finish('won')
  return 'done'
  finish(result): sc.result = result; sc.resultAge = age; out.push({ type: 'scenario', result, goals: rows }); return 'suspend'

scenarioViewModel(sim): { title, longText, pict, disasterName, remainingMonths: sc.finalMonthIndex − monthIndex(age) + 1,
                          deadline: dateOf(age at finalMonthIndex), rows: [{ key, buildingId?, targetText, currentText, met }], result }

writeScenario(doc, sim):                                                   // 写档（file-formats §3.4.3 调用）
  sc = sim.scenario
  if !sc or sc.result != 'pending': delete doc.scenario; return
  doc.scenario.scen = patchScen(originalScen, { timeLimitMonths: remainingMonths })   // 其余字段原样
```

### 3.10 存档映射

| 本模块状态 | 存档位置 | 写法 |
|---|---|---|
| `funds` | `MISC 0x0014` | 有符号 int32，夹到范围 |
| `bonds.length` | `MISC 0x0018` | |
| `bonds[i].rateRaw` | `MISC 0x0610 + 4i`（i < 50） | 其余补 0 |
| 难度 | `MISC 0x001C` | |
| 建城年 / 城龄 | `MISC 0x000C` / `0x0010`；当前日期由二者推出（§2.2） | `phaseCursor` 不存（写档时恒 0） |
| 税线 R / C / I | `MISC 0x077C / 0x07E8 / 0x0854`，各 27 int：`[curTaxablePop, curRate, 0, (popJan, rateJan) … (popDec, rateDec)]` | 未结月份保留去年值 |
| 法令窗口块 | `MISC 0x08C0`，27 int：`[enactedCount, curNet, 0, (count, net) × 12]`（本项目约定，原版含义未知） | |
| 债券窗口块 | `MISC 0x0930`，27 int：`[count, avgRateRaw, sumRateRaw, (count, avgRateRaw) × 12]` | |
| 11 条经费线 | `MISC 0x0998 + 0x6C × line`，各 27 int：`[count, funding, 0, (count, funding) × 12]` | 顺序见 `BudgetLine`；`count` 与 services 的计数对账 |
| 法令位 | `MISC 0x0FA0` 低 20 位 | |
| 速度 / 自动预算 | `MISC 0x0FEC / 0x0FF0` | 载入时速度若为 1 保持暂停 |
| 模拟 PRNG | `MISC 0x1054`（标志 = 1）/ `0x1058`（状态） | §2.13.5；缺失时按确定性哈希重播种 |
| 国家经济 | `MISC 0x0050..0x005C`（分区规格拥有）；`fedRateRaw` **不单独存档**：从 `XGRP` Fed Rate 序列最近值 × 10000 重建，缺失则按 §2.6 初始化 | |
| 广告 / 名望 | `MISC 0x003C / 0x0038` | |
| 图表历史 | `XGRP` 16 × 52 int | 本模块推送全部 16 条（值由各所有者提供） |
| 产业税率 | `MISC 0x016C..` 的 tax[11]（分区规格拥有布局） | |
| 情景 | `SCEN`（`timeLimitMonths` 改写为剩余月数）、`TEXT ×2`、`PICT` 透传 | §2.16.4；胜负已定则不写 |
| `ytd`、`lastYear`、去重表、`impeached`、`issuedYear` | **不存档**；读档后 `ytd` 由税线 / 经费线 / 债券块的已结月份重建（`net` 需重算，法令块给出 net） | |
| 城市等级 / 奖励位 / 军事基地 / LE / EQ / 年龄队列 / 体育队 / 逮捕 / 监狱加成 / 城市价值 | `MISC 0x0020 / 0x0078 / 0x0E4C / 0x0048 / 0x004C / 0x007C.. / 0x1028 / 0x1038 / 0x103C / 0x0024` | **`services-models.md` 拥有**，本模块不读写 |

读档重建 `ytd`：对 `m < 当前月 − 1` 的每个月，用历史块里的（人口，税率）和（数量，资金率）按 §3.3 公式重算一份 `MonthlyFlow`；利息用当前债券表近似（该年内发行 / 偿还的历史不可知）。这保证预算窗口的 YTD 列在读档后立即可用。

---

## 4. 边界条件与易错点

1. **整数与溢出**：全部金额用整数美元；`funds` 每次变动后 `clampInt32`。原版的债券溢出 bug 不复现；测试用例应覆盖 50 张 25% 债券（年息 $125,000）不产生负利息。
2. **月份切分**：`splitMonthly` 无状态、确定性，且 12 份之和精确等于年额；不要用 `annual / 12` 四舍五入再累加（年末会差几美元，预算窗口对不上账）。数量或资金率在年中变化时各月按当时值切分，这是预期行为。
3. **税基三件事**：不乘地价、不含断电建筑、**含 Arcology 份额（1/6、1/12、1/12）**——用 `census.taxable*`，不要自己数 `XBLD`，也不要再额外加 arco。
4. **法令向下取整**：每条独立 `floor`，不要先求和再取整；新城所有法令显示 $0 是对的，不是 bug。
5. **法令位序**：bit0 = Sales Tax，金融组在最低位；读第三方存档时若整体法令效果与窗口勾选对不上，首先怀疑位序。**本模块不实现任何法令的模型效果**；若发现犯罪 / 用电 / LE 对法令"没反应"，去查所有者规格的实现，而不是在这里加倍率。
6. **债券偿还顺序**：永远 `shift()` 最早一张；UI 不提供选择。资金不足 $10,000 时按钮禁用。利率预览不消费 PRNG。
7. **利率显示 vs 计算**：窗口显示 `floor(rateRaw / 10000)`，利息按 `rateRaw` 算。平均利率与利率之和也先用 raw 值算再取整显示。
8. **Hard 难度开局债券**必须在 `funds` 初始化之后立即创建，否则读档重建会丢（存档只有 `rateRaw`，`issuedYear` 以建城年填充）。
9. **年初顺序**：`settleMonth(12 月)` → `closeYear` → … → `budgetWindow` 全部在 1 月第 0 天、任何建造之前（§2.3.2）；预算窗口打开时 `modalPause++`，关闭 `resume()`；自动预算时也要发 `yearClosed`（报纸需要）。12 月第 24 天之后**没有**任何经济动作。
10. **被挂起的一天**：`advanceDay` 可能在任一可挂起阶段返回；恢复后从 `phaseCursor` 继续，**不得**重跑已完成阶段（否则 PRNG 与账目都会重复）。同一天可能连续挂起多次（预算窗 → 军事基地提案不会同日，但弹劾 + 情景失败会）。
11. **速度切换**：切换档位不重置 `accumMs` 之外的任何状态；African Swallow 必须保证每帧 ≤ `maxDaysPerFrame` 天，且一帧内遇到挂起立即停止推进。
12. **负资金下的操作**：`canAfford` 对 `cost ≤ 0` 永远为真（查询、标牌、奖励建筑、拆除费 0 的情形），对 `cost > 0` 要求 `funds ≥ cost`；因此负资金时推土也被拒绝——与原版观感一致，若产品决定放宽，只改 `canAfford`。
13. **经费线计数的双账**：`structureCounts` 由 services 增减，`tileCounts[id] / size²` 由地块层推出；写档前断言两者相等，不等时以 `tileCounts` 为准并记日志（第三方存档常见）。
14. **工业税的双轨**：预算主滑块同时写三个税率与 11 个产业税率；产业窗口只写产业税率并反推 `taxRate.i`。不要让两处互相覆盖导致"滑块跳回"。
15. **资金率为 0**：计数仍写入历史块；效果模块必须能处理 `f = 0`（覆盖全无，而不是除零）。
16. **PRNG 的三条红线**：`sim/**` 不用 `Math.random`；预览不消费 `sim` 流；每个阶段 / 命令内部的遍历顺序固定并写进其规格。违反任一条，"同种子两次长跑逐字节相同"的金丝雀测试会失败。
17. **估计列**：`estimate = ytd + current × remaining` 中 `current` 用**当前滑块值**算，所以拖动滑块时估计列实时变化而 YTD 列不变。
18. **读档重建的 YTD** 只是近似（利息、法令按当前状态）；写档时同样只写历史块，不要试图把 `ytd` 另存。
19. **`fedRateRaw` 与 XGRP 的往返**：XGRP 里是整数百分比，重建后小数部分丢失；可接受，但不要据此判断"fed rate 变了"而触发新闻。
20. **情景目标**：`cash` 比较的是 `funds`（不扣债务）；`citySize` 比较的是非 arco 人口 `MISC 0x102C` **[高]**；上限项为 0 表示无要求（否则不可能达成）；判定在第 22 天 `milestones` 之后；时限按日历月，灾害模式不计时；写档时把剩余月数写回 `SCEN`。
21. **第 0 天结算用的是上月快照**：`census.final` 在第 21 天定稿、第 0 天消费；不要在第 0 天重新 tally（那时人口累加器刚被清零）。
22. **`popGraph` 不是历史**：`MISC 0x007C..0x0168` 是年龄队列，归 services；本模块任何"每年推入人口 / LE / EQ"的代码都是错的。

---

## 5. 待确认问题

| # | 问题 | 当前取值 | 影响 |
|---|---|---|---|
| Q1 | `税率 × 人口 / 75` 的周期是否确为每月 | 每月 | 全部收入标度（×12） |
| Q2 | 交通六线与警 / 消 / 医 / 教的年单价（尤其道路 $0.10/格 是否偏低一个量级） | 见 §2.7 / §2.8，`transitCostScale = 1` | 预算张力、"削减交通预算"的动机 |
| Q3 | 法令金额是"该类税收的百分比"还是"税率加 1 个百分点"；监狱是否计入警察线 | 百分比；计入 | 法令收入 ×14；警察支出 |
| Q4 | 原版是否按年代灰显部分法令 | 全部可用 | 1900 开局的法令窗口 |
| Q5 | 下一张债券利率与信用评级的真实公式；评级是否限制发行；城市价值用 `MISC 0x0024` 还是 `地价/2 ×1000` | §2.6 建议式；F 拒发；`0x0024` | 借贷策略 |
| Q6 | 被赶下台的真实阈值与是否存在；在年末还是每月第 22 天判定 | 年末 `funds < −$50,000` | 游戏结束频率 |
| Q7 | Arcology 份额计入税基（1/6、1/12、1/12）是否准确 | 采用（services §2.8.3） | 大型 arco 城市年税收数万美元 |
| Q8 | 速度档的真实时间比例、默认档 | §2.2 建议值；Llama | 手感 |
| Q9 | 拆除多格建筑收 $1 还是 $1 × 格数 | `$1 × size²`（可开关） | 微小 |
| Q10 | 预算主滑块是否真的同时设置三个税率；原版是否有单独的 R/C/I 税率 UI | 同时设置；无单独 UI | 存档中三值的来源 |
| Q11 | 医院 / 学校 / 学院 / 公交站的年单价（$50 / $25 / $100 / $25） | 如表 | 预算张力 |
| Q12 | 法令窗口块 `MISC 0x08C0` 与各块索引 2 的真实含义 | 写本项目约定 / 0 | 与原版存档互通时窗口显示 |
| Q13 | `fundtransit` 新闻与顾问抱怨的资金率阈值 | 80% / 50% | 报纸噪声 |
| Q14 | `natTrend` 对 fed rate 的真实耦合；fed rate 的范围 | §2.6 随机游走 1%–15% | 债券成本周期 |
| Q15 | 休闲 / 图书馆 / 博物馆是否真的零维护；动物园是否有门票收入 | 零维护、零收入 | 微小 |
| Q16 | 年初第 0 天里"支持率抽样"与"年度微模拟"的先后（services §2.1 与 §3.5 互相矛盾） | 支持率在前 | 市长官邸显示的是哪一年的支持率 |
| Q17 | 情景目标是否可提前达成即胜；比较是否含等号 | 到期判定；含等号 | 情景体验 |
| Q18 | 生长扫描 4×4 子步中 `step`/`substep` 分别对应 x 还是 y | `x ≡ step`、`y ≡ substep` | 只影响与原版逐格对照，不影响玩法 |
| Q19 | 第 24 天 `news` 的确切位置（原版报纸投递时机） | 第 24 天最后 | 报纸出现在月内的时间 |

---

## 6. 参考来源

- dfloer/SC2k-docs（CC BY-SA 4.0）本地副本：
  - `sc2_file_spec.md`：`MISC` 全表（资金、债券数组、难度、税线 / 经费线 / 债券块的 27×4B 结构与偏移、法令位、速度与自动预算、`0x102C` 非 arco 人口、零区 `0x1054..`）、`XGRP` 16 条序列、`SCEN` 情景字段表（时限月数、9 个目标 / 上限、两个建筑目标与格数、"City Size 与非 arco 人口比较"、"Cash 不扣债务"）、`TEXT 0x80/0x81`、`PICT`。
  - `simulation_spec.md`：起始资金与难度、国家人口 / 国家值 / `natTrend`、税收公式、"难度改变税敏感度"、法令全表（金额）、债券利率显示规则与评级推测、图表缩放（3,750 / 3,200）、作弊码。
  - `text_data_spec.md`：报纸故事组（`fundprison / fundeducation / fundtransit`、`fedrateup / fedratedown`、`ordinance*`、`taxes`、`moneyevent`）——用于确定哪些经济事件需要上报纸。
- 兄弟规格（本仓库）：`services-models.md`（§2.1 的 25 天日程——本文 §2.3 的来源；§2.6–§2.8、§2.10 的奖励 / 诉求 / 支持率 / 人口学 / 法令效果，本文已移交所有权；§2.8.3 的 arco 税基份额）、`zones-growth-demand.md`（人口口径、税率需求曲线、法令需求乘数、产业税率、国家经济）、`transport-traffic.md`（交通六线计数与单价、衰败规则、公交站固定支出、4×4 子步出行）、`power-water.md`（电厂 / 水设施造价、无预算条目、Energy Conservation 的容量 +1/12、年度老化、`rngInt` 上界问题）、`terrain.md`（地形工具费用、`mulberry32`）、`disasters-events.md`（科技时间线所有权、第 24 天天气 / 灾害、顾问建议表、情景灾害触发）、`file-formats.md`（`MISC` 访问器、`SCEN/TEXT/PICT` 字节布局）、`building-catalogue.md`（造价快照、奖励门槛口径、公交站 / 火车站 2×2 裁定）。
- 网络检索摘要（站点本身在本环境不可访问，仅得到搜索摘要，均为二手）：社区指南称警局 / 消防局年费 $100、1% Income Tax 约 $13 / 千居民 / 年、Legalized Gambling 约 $27 / 千商业人口 / 年、债券窗口含评级 AAA–F / 城市价值作抵押 / 须按发行顺序偿还、"赤字过深会被赶下台"、法令窗口显示 YTD 与年末估计。
- mulberry32：公有领域的 32 位 PRNG（Tommy Ettinger），本文 §3.8 为按算法描述自行书写的实现。
- 作者对 SC2K 的记忆（用于造价表、预算窗口字段、arco 价格、作弊码效果、情景流程），均标为 **[中]** 或 **[低]**。
