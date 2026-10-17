# 领域规格：灾害、科技时间线与事件（Disasters / Weather / Technology Timeline / Newspaper / Opinion）

> 适用对象：`packages/sc2k` 的 `sim/disasters`（灾害状态机、火/洪/暴乱/毒云的运行时标记层 `marker`、XTHG 灾害物件、紧急调度单位）、`sim/things`（常驻物件：飞机 / 直升机 / 货船 / 帆船 / 列车 / 推土机动画，§2.12）、`sim/scenario`（情景目标评估，§2.13）、`sim/weather`（天气）、`sim/tech`（发明年份）、`sim/news`（报纸故事池与版面）、`sim/opinion`（顾问建议、民意事件）实现者。
> 蓝本：SimCity 2000 Windows 95 Special Edition（下称 SC2K）。
> 置信度：**[高]** = dfloer/SC2k-docs 一手文档，或经 sc2kfix 公开符号表 / 钩子代码互证的事实；**[中]** = 单一逆向来源 / 原版帮助文本 / 社区共识；**[低]** = 为"可实现"给出的推测，必须做成 `DisasterTuning` / `WeatherTuning` / `NewsTuning` 中的可调参数。未标注的数值默认 **[低]**。
> 所有随机数走注入的种子 PRNG，按固定遍历顺序调用；灾害步进只依赖"灾害 tick"计数，不依赖真实时间。

---

## 1. 概述

本模块回答七个问题：

1. **什么时候、在哪儿、发生什么灾害**：每月第 24 天的天气/灾害判定（随机）、灾害菜单（手动）、情景文件 `SCEN`（脚本）、以及其他模块的"副作用灾害"（电厂到期爆炸、核电厂被毁 → 放射）。
2. **灾害怎样推进、怎样结束**：游戏进入"灾害模式"（`MISC 0x0004 = 2`）后日历冻结，按灾害 tick 推进火势蔓延 / 洪水涨退 / 龙卷风与怪兽路径 / 暴乱人群 / 毒云漂移；火被扑灭、水退、物件离场后回到城市模式并发报纸。灾害标记保存在独立的运行时 `marker` 层，**不覆盖** `XTXT`（§2.5.1）。
3. **玩家能做什么**：紧急调度（警察 / 消防 / 军队）单位的数量、放置、作用半径；推土机开防火带；"无灾害"选项的确切语义。
4. **时间线**：17 个发明槽位的基准年份 + 0..19 年随机延迟；年初检查并发"发明"报纸、刷新工具栏。
5. **城市怎么"说话"**：天气 → 报纸天气栏；事件 → 报纸故事池（67 种事件类型）；诉求 → 状态栏、顾问、支持率抽样；极端情况 → 暴乱。
6. **地图上常驻的民用物件怎么动**（§2.12）：飞机 / 直升机的起降与巡航、货船沿可航水面巡游、帆船与 Nessie、火车与地铁列车沿轨道行驶、推土机动画；它们与灾害物件、调度单位共享 `XTHG` 的 39 个槽位，并且是空难 / 直升机坠毁的前置条件。
7. **情景怎么判胜负**（§2.13）：`SCEN` 的时限与 9 个目标 / 上限、2 个建筑格数目标的比较源、评估时点、胜负事件与之后的沙盒继续。

模块边界（输入只读 / 输出独占写）：

| 方向 | 数据 | 说明 |
|---|---|---|
| 输入 | `XBLD` `XZON` `XTER` `ALTM` `XBIT`（`POWERED` `WATER` `SALT`）`XUND` | 地形 / 分区 / 电水模块维护；本模块通过 `destroyStructure()` 等回调请求修改 |
| 输入 | `XFIR`（消防力 32x32）`XPLC`（警力 32x32）`XCRM` `XPOP` `XPLT` | 服务规格每月第 2 天重算；本模块只读 |
| 输入 | `MISC`：`0x001C` 难度、`0x0E44` 海岸、`0x0E48` 河流、`0x0E40` 水位、`0x102C normalPop`、`0x0FA4` 失业、`0x0E4C` 军事基地类型、建筑格计数 `0x01F0..`、法令位 `0x0FA0`、预算资金 % | |
| 输入 | 日历（`cityDays`，1 月 = 25 天，1 年 = 300 天）、`startYear`、PRNG | |
| 输入 | 交通 / 地形 / 服务规格提供的**谓词与生成钩子**（§2.12）：`conn` 铁路掩码、`subway` 掩码、`station`、`bridgeBlocksShips(tile)`、`isWater / waterDepth`、`XBIT.ROTATED`、`XTRF`；生长扫描访问跑道 / 起重机 / 火车站时的回调 `things.trySpawn*` | 对方只给谓词与回调，运动归本模块 |
| 输入 | `SCEN`（`disaster/dx/dy/timeLimitMonths` + 9 个目标 + 2 个建筑目标，file-formats §2.5.2）、`MISC 0x0014 / 0x0028 / 0x002C / 0x0030 / 0x0034 / 0x0074 / 0x102C / 0x01F0..`、`census.comPop/indPop` | 情景评估只读（§2.13） |
| 输出 | 运行时标记层 `marker: Uint8Array(16384)`（火 / 洪 / 暴乱 / 毒云；**写档时才合成进 `XTXT`**，被覆盖的标签进侧表 `xtxtShadow`，§2.5.1）、`XTHG` 全部 39 个槽位（灾害物件 / 调度单位 / 常驻物件）与写档时合成的 `XTXT 0xC9..0xEF` 物件指针、`XBLD` 瓦砾 `0x01..0x04` 与放射 `0x05`（经毁损例程）、`ALTM/XTER`（仅火山，经地形模块 API） | 本模块独占写权；运行时**从不**直接写 `XTXT` |
| 输出 | `MISC`：`0x0004` 城市模式、`0x0060..0x006C` 热/风/湿/天气、`0x0070` 当前灾害、`0x1000` 无灾害、`0x1048` 灾害进行中、`0x0738..0x0778` 发明年份、`0x0E50..` 报纸记录、`0x1004/0x1008/0x100C` 报纸设置、`0x10BC..0x12BB` 侧表 `xtxtShadow`（§2.5.1）；`SCEN` 回写（剩余月数、已触发的灾害清零，§2.13.6） | |
| 输出 | 事件：`disasterStarted/Ended`、`structureDestroyed`、`explosion`、`radiationPlaced`、`weatherChanged`、`techInvented`、`newsStory(type, value)`、`advice(advisor, id)`、`thingSpawned/thingRemoved(slot, type)`、`helicopterReport(x, y, level)`、`scenarioEvaluated(month, met[])`、`scenarioWon`、`scenarioLost` | 报纸 / UI / 音效 / 其他模块 |

与兄弟规格的约定：电厂寿命到期（`power-water.md` §2.6）、桥梁大风坍塌（`transport-traffic.md` 预算检查）、状态栏诉求链与支持率抽样（`services-models.md` §2.10.3/§2.10.4）、砍树计数（`terrain.md`）、联邦利率故事（`zones-growth-demand.md`）都**由对方模块判定、调用本模块的毁损例程或 `newsStory()`**；本文只定义接口与故事类型。

---

## 2. 原版行为

### 2.1 灾害类型总表 [枚举 高 / 来源列 中]

`MISC 0x0070`（当前灾害）与 `SCEN 0x04`（情景灾害）共用同一枚举；sc2kfix 符号表与 dfloer 表一致。

| 值 | 标识 | 中文 | 灾害菜单 | 随机 | 情景 / 其他来源 | 标记 `marker`（写档合成为 `XTXT`） | 物件 `XTHG` | 报纸类型（§2.10） |
|---|---|---|---|---|---|---|---|---|
| 0x00 | `NONE` | 无 | – | – | – | – | – | – |
| 0x01 | `FIRE` | 火灾 | Fire | 是 | 几乎所有灾害的次生 | `0xFF` | – | `DISASTER_FIRE` |
| 0x02 | `FLOOD` | 洪水 | Flood | 是（需水体） | – | `0xFC` | – | `DISASTER_FLOOD` |
| 0x03 | `RIOT` | 暴乱 | Rioters | 是（条件见 §2.3.3） | – | `0xFD` | – | `DISASTER_RIOT` |
| 0x04 | `TOXICSPILL` | 化学泄漏 | – | 否 | 情景（Chicago） | `0xFB` 毒云 | – | `DISASTER_CHEMICALSPILL` |
| 0x05 | `AIRCRASH_LEGACY` | 空难（旧槽位，dfloer 标"buggy"） | – | 否 | 历史遗留，Win95 版菜单实际走 0x12 **[中]** | – | – | `DISASTER_PLANECRASH` |
| 0x06 | `EARTHQUAKE` | 地震 | Earthquake | 是 | 情景 | （次生火 `0xFF`） | – | `DISASTER_EARTHQUAKE` |
| 0x07 | `TORNADO` | 龙卷风 | Tornado | 是（天气 = Tornado） | – | – | `0x0F` | `DISASTER_TORNADO` |
| 0x08 | `MONSTER` | 怪兽 | Monster | 是 | 情景（Hollywood） | – | `0x05` | `DISASTER_MONSTER` |
| 0x09 | `MELTDOWN` | 核泄漏 | – | 是（需核电厂） | 隐藏调试菜单 | – | – | `DISASTER_MELTDOWN` |
| 0x0A | `MICROWAVE` | 微波失焦 | – | 是（需微波电厂） | 隐藏调试菜单 | – | – | `DISASTER_MICROWAVE` |
| 0x0B | `VOLCANO` | 火山 | – | 否 | 情景（Portland） | `0xFF` | – | `DISASTER_VOLCANO` |
| 0x0C | `FIRESTORM` | 火风暴 | – | 否 | 情景（Oakland） | `0xFF` | – | `DISASTER_FIRE` |
| 0x0D | `MASSRIOTS` | 大暴乱 | – | 否 | 情景（Washington DC） | `0xFE` | – | `DISASTER_RIOT` |
| 0x0E | `MASSFLOODS` | 大洪水 | – | 否 | 情景（Davenport） | `0xFC` | – | `DISASTER_FLOOD` |
| 0x0F | `POLLUTION` | 重大污染事故 | – | 否 | 情景 | `0xFB` | – | `DISASTER_POLLUTION` |
| 0x10 | `HURRICANE` | 飓风 | Hurricane | 是（天气 = Hurricane 且海岸图） | 情景（Charleston） | `0xFC`（海岸洪水） | 风暴眼（见 §2.6.9） | `DISASTER_HURRICANE` |
| 0x11 | `HELICOPTERCRASH` | 直升机坠毁 | – | 是（极低；需直升机在飞） | dfloer 标"buggy" | – | `0x06` 爆炸 | `DISASTER_HELICOPTERCRASH` |
| 0x12 | `PLANECRASH` | 飞机坠毁 | Air Crash | 是（需跑道 + 飞机在飞） | – | – | `0x06` 爆炸 | `DISASTER_PLANECRASH` |

补充事实：

- 灾害菜单共 8 项 + 分隔线 + "No Disasters" 勾选项 **[高：多方一致]**：Fire / Flood / Air Crash / Tornado / Earthquake / Monster / Hurricane / Rioters。
- 标题栏 / 状态栏的灾害名称字符串表只覆盖 `0x01..0x10`，`0x11/0x12` 没有名称（原版显示空串）**[高：sc2kfix `dwDisasterStringIndex` 用法]**。我们给所有类型配原创名称。
- 原版隐藏调试菜单可触发 Meltdown / Microwave / Volcano / Firestorm / Mass Riots / Mass Floods / Toxic Spill **[中：tcrf 摘要]**。我们在开发者面板里提供同样的 19 项触发（不进玩家菜单）。
- `XTXT 0xFB..0xFF` 是"该格上有灾害标记"的覆盖层，不是 XLAB 索引；`0xFE` 为大暴乱专用的人群变体 **[高：dfloer]**。同一字节在公共建筑格上是微模拟标签（`0x3D..0xC8`）、在标牌格上是标牌索引（`0x01..0x32`）、在物件格上是 `XTHG` 槽位指针（`0xC9..0xEF`），所以原版写标记等于**破坏性覆盖**。本项目运行时把标记放在独立的 `marker` 层，只在写档时合成（§2.5.1）；本文后续所有"`XTXT = 0xFF`"类表述一律指 `marker`。

### 2.2 游戏模式与灾害状态机

#### 2.2.1 三种模式 [高]

`MISC 0x0004`：0 = 地形编辑，1 = 城市，2 = 灾害。sc2kfix 对主循环的还原：

```
每个引擎 tick：
  if mode == CITY && speed != PAUSED:
      Simulation.processTick()          // 日历前进、预算、生长……（其他规格）
      if pendingDisaster != NONE: startDisaster()   // 消费"待触发"标志
      if !disasterActive: cleanupOrphanDeploys()    // 清理遗留调度单位 / 英雄
  else if mode == DISASTER && speed != PAUSED:
      disasterStep()                    // 同一个入口函数在灾害模式下充当"步进"
      idleCount += 1
  // 灾害模式下的视图刷新放在"非 off-cycle"帧，避免动画过快
```

推论 **[高]**：**灾害模式下日历不前进**（不调用 `processTick`），预算 / 生长 / 图层全部停摆；暂停（speed = 1）同样停住灾害。情景的时间限制按月计，所以长火灾不消耗情景时间。

#### 2.2.2 状态变量 [高：sc2kfix 符号名 / dfloer 偏移]

| 运行时名（sc2kfix） | 存档位置 | 含义 |
|---|---|---|
| `wCityMode` | `MISC 0x0004` | 0/1/2 |
| `wSetTriggerDisasterType` | （`MISC 0x1040` 推测）**[低]** | 待触发灾害类型；菜单 / 情景 / 随机判定只写这个标志，下一 tick 才真正开始 |
| `wCurrentDisasterType` | `MISC 0x0070` | 当前（或最近一次）灾害类型 |
| `dwDisasterActive` | `MISC 0x1048` | 1 = 进行中 |
| `disasterPoint` | `SCEN 0x06/0x07`（情景）；运行时 | 灾害原点（`autoGoto` 的目标） |
| `wDisasterObject` | 运行时 | 本灾害主物件在 `XTHG` 表中的槽位（龙卷风 / 怪兽 / 飞机 / 风暴眼） |
| `wDisasterFloodArea` | 运行时 | 洪水当前覆盖格数 |
| `wDisasterWindy` | 运行时 | 灾害期间的风力覆盖值（飓风 / 火风暴） |
| `wActiveTornadoes` `wMonsterSpawned` | 运行时（由 XTHG 扫描重算） | 物件计数 |
| `wFireAvailDispatch` `wPoliceAvailDispatch` `wMilitaryAvailDispatch` | 运行时 | 可用调度单位数 |
| `wFireUnitsDispatched` 等三个 | 运行时（由 XTHG 扫描重算） | 已放置单位数 |
| `bNoDisasters` | `MISC 0x1000` | "无灾害"勾选 |
| `bOptionsAutoGoto` | `MISC 0x0FF4` | 灾害开始时镜头跳到原点 |
| `wIdleCount` | 运行时 | 灾害 tick 计数（用于超时保护） |

`MISC 0x104C`（dfloer 名 "Go Disaster"）被 `services-models.md` 解释为"净水厂足量"标志——两处冲突，见 §5 Q1。本模块**不读写** `0x104C`。

#### 2.2.3 紧急模式 UI [高：原版帮助文本]

- 状态窗口的天气图标在灾害模式下变成"大红箭头"（goto）；点击在"正在侵袭城市的多个灾害"之间循环并居中镜头。实现：维护 `focusPoints[]`（每个活动物件 + 每个火 / 洪水 / 暴乱连通块的质心），每次点击前进一个。
- 工具栏 **Dispatch（调度）**按钮只在紧急模式可用：Police（镇压暴乱、抵御洪水）、Firefighters（灭火、抵御洪水和毒云）、Military（建基地后才有，"对多种灾害有效"）。
- 最小化时标题栏显示灾害名；灾害期间循环播放警笛音效（我们用原创音效）。

#### 2.2.4 状态机

```
IDLE ──(pending != NONE)──▶ STARTING ──▶ ACTIVE ──(所有终止条件满足)──▶ ENDING ──▶ IDLE
                                 │                                          │
                                 └──(前置条件不满足：如非海岸图触发飓风)──▶ IDLE（提示消息）
```

- `STARTING`：选定原点 / 生成物件 / 写 `0x0070`、`0x1048 = 1`、`mode = 2`；`autoGoto` 则居中；播放警笛；发 `disasterStarted`。
- `ACTIVE`：每 tick 执行 §3.3 的固定顺序。
- 终止条件（全部满足）：`marker` 层无 `Fire/Flood/Rioters/MassRioters/ToxicCloud` 标记、无龙卷风 / 怪兽 / 风暴眼 / 坠毁中的飞行物、无未消散的地震摇晃或火山生长、或 `idleCount ≥ maxDisasterTicks`（硬上限，强制清场）。常驻物件（§2.12）**不**阻止灾害结束。
- `ENDING`：删除所有调度单位与英雄（`cleanupOrphanDeploys`）、`0x1048 = 0`、`mode = 1`、停止警笛、统计损失并 `newsStory(DISASTER_x, deaths)`；若"Extra!!!"开启立即弹报。
- 灾害模式中**再次**触发（菜单连点）：`pending` 覆盖，下一 tick 叠加开始，不重置已有标记；`disasterPoint` 更新为新原点 **[中]**。

### 2.3 触发

#### 2.3.1 随机判定的时机与宽限期

- 每月第 24 天调用 `UpdateWeatherOrDisasterState()`：先更新天气（§2.4），再决定是否置 `pending` **[高：调度表]**。
- 开局宽限期（难度相关）——两个来源不一致：

| 难度 | dfloer（标注"可能不对"） | sc2kfix 新城对话框提示 | 本规格默认（天） |
|---|---|---|---|
| Easy（1） | 3 个月 | 8 年、随机灾害概率降低 | `graceDays = 2400` |
| Medium（2） | 2 个月 | 5 年、中等概率 | `1500` |
| Hard（3） | 1 个月 | 2.5 年、概率提高 | `750` |

采用 sc2kfix 数值 **[中]**，做成 `DisasterTuning.graceDays[difficulty]`。宽限期只约束**随机**灾害；菜单、情景、副作用灾害不受影响。

- 月概率（原版未知，**[低]**）：`monthlyChance = { easy: 1/96, medium: 1/60, hard: 1/36 }`（期望间隔 8 / 5 / 3 年）。命中后在"当前满足前置条件"的类型中按权重抽一个（§2.3.3）。
- "无灾害"（`bNoDisasters`）**[高：多方一致]**：只禁止随机判定；菜单仍可触发；情景灾害仍触发。副作用：电厂到期时若资金够则自动原地重建而不爆炸（`power-water.md` §2.6）。StrategyWiki 称空难不受此选项约束 **[低，可能是 SimCity 经典版的说法]**：做成 `planeCrashIgnoresNoDisasters = false`。

#### 2.3.2 手动与情景触发 [高]

- 菜单项：写 `pending = kind`，原点由游戏自动选择（Win95 版不要求点击位置）；飓风在非海岸图上不可用（菜单项灰掉；若强制则弹消息）。
- 情景：加载 `SCEN` 时若 `SCEN.disaster ≠ 0` 则 `pending = SCEN.disaster`、`disasterPoint = (SCEN.dx, SCEN.dy)`；第一次引擎 tick 就开始，无视宽限期与"无灾害"；触发后置 `scenario.disasterFired = true`，写档时该字段清零以免重载再触发（§2.13.6）。
- 情景的胜负判定（时限、目标、评估时点）在 §2.13；"Survive the disaster"类情景在文件里就是用现金 / 人口目标表达的，没有单独的"存活"语义 **[中]**。

#### 2.3.3 前置条件与抽样权重

| 类型 | 前置条件（dfloer **[高]** 除标注外） | 随机权重 `weight`（**[低]**） | 原点选择 |
|---|---|---|---|
| FIRE | 存在 ≥ 1 个可燃格（§2.6.1） | 30 | 按 `XPOP` 加权随机的已开发格 |
| FLOOD | 地图有水体，且存在"与水相邻的陆地格" **[中]** | 12 | 随机岸边格（优先淡水河岸） |
| RIOT | `unemployment ≥ 10`（%）且 `heat > 170`（即 > 70°F）且 `normalPop > 30,000` | 8 | `XCRM` 加权的住宅 / 商业格，且 `XPLC < 128` |
| EARTHQUAKE | 无 | 8 | 全图（震中随机，仅用于 goto） |
| TORNADO | `weather == 0x0B` | 10 | 随机地图边缘格 |
| MONSTER | 无（建议 `normalPop ≥ 1,000`）**[低]** | 5 | 随机地图边缘格，目标城市中心 |
| PLANECRASH | 存在跑道格（`0xDD/0xDE`）**[高：dfloer 唯一前置]**；不要求此刻有飞机在飞——若无在飞飞机则按 §2.12.2 "按需起飞"一架（`planeCrashSpawnsIfNone = true`） | 8 | 在飞飞机的当前格（按需起飞时为 `crashDelayTicks` 后的位置） |
| HELICOPTERCRASH | 有直升机在飞（§2.12.2 `phase ∈ {CLIMB, PATROL, HOVER, RETURN}`）**[低：原版标"buggy"，无文档前置]** | 2 | 直升机位置 |
| HURRICANE | `weather == 0x0A` 且 `MISC 0x0E44`（海岸图）= 1 | 8 | 海侧地图边缘 |
| MELTDOWN | 存在核电厂（`0xCB`） | 3 | 随机一座核电厂 |
| MICROWAVE | 存在微波电厂（`0xCD`） | 3 | 随机一座微波电厂 |
| TOXICSPILL / POLLUTION / VOLCANO / FIRESTORM / MASSRIOTS / MASSFLOODS | 不参与随机 | 0 | 情景给定 `disasterPoint`；无则随机 |

抽样：`eligible = kinds.filter(cond)`；`r = rng.int(Σweight)`；累加落点。若 `eligible` 为空则本月无灾害。

### 2.4 天气

#### 2.4.1 字段 [高]

| 字段 | 存档 | 范围 / 单位 | 说明 |
|---|---|---|---|
| `heat` | `MISC 0x0060` | 0..255；报纸显示 `heat − 100` °F | 170 ⇒ 70°F；暴乱阈值用原始值 |
| `wind` | `MISC 0x0064` | 0..255，名义 mph | 桥梁坍塌公式 `wind + rng(0..49) ≥ funding%`（交通规格）；风电产量加成 |
| `humid` | `MISC 0x0068` | mm 降水 | 水泵产量项 `humid / 2`；太阳能 `rng % (100 − humid) / 10 + 5` |
| `weatherTrend` | `MISC 0x006C` | 0..11 | 见下表 |
| `season` | 运行时 `wCityCurrentSeason` | 0 冬 1 春 2 夏 3 秋 | 月初由日期推出 **[中]**：12–2 冬、3–5 春、6–8 夏、9–11 秋 |

#### 2.4.2 12 种天气类型及效果 [枚举 高 / 效果 中]

| 值 | 名称 | 状态栏图标 | 模拟效果 |
|---|---|---|---|
| 0x00 | Cold 寒冷 | 温度计低 | 无直接效果 |
| 0x01 | Clear 晴 | 太阳 | 无 |
| 0x02 | Hot 炎热 | 温度计高 | `heat` 高 → 满足暴乱条件之一 |
| 0x03 | Foggy 雾 | 雾 | 无 |
| 0x04 | Chilly 微寒 | 雪花小 | 无 |
| 0x05 | Overcast 阴 | 云 | 少量降水 |
| 0x06 | Snow 雪 | 雪 | 降水、低温 |
| 0x07 | Rain 雨 | 雨 | 降水高 → 水泵产量 ↑、太阳能 ↓ |
| 0x08 | Windy 大风 | 风 | `wind` 高 → 桥梁坍塌风险、风电 ↑、火势蔓延 ↑（本规格） |
| 0x09 | Blizzard 暴风雪 | 暴雪 | 状态栏天气警告（`weather ≥ 9`，服务规格诉求链第一条） |
| 0x0A | Hurricane 飓风天 | 飓风 | 海岸图上可触发飓风灾害；状态栏警告 |
| 0x0B | Tornado 龙卷天 | 龙卷 | 可触发龙卷风灾害；状态栏警告 |

#### 2.4.3 生成算法（原版内部未知，**[低]**，全部进 `WeatherTuning`）

每月第 24 天：

1. `season` 由下月月份决定。
2. 从季节权重表抽 `trend`（每行合计 100；非海岸图把 Hurricane 的权重并入 Windy）：

| 季节 | Cold | Clear | Hot | Foggy | Chilly | Overcast | Snow | Rain | Windy | Blizzard | Hurricane | Tornado |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 冬 | 24 | 14 | 0 | 8 | 16 | 12 | 14 | 4 | 4 | 4 | 0 | 0 |
| 春 | 3 | 24 | 3 | 8 | 10 | 12 | 1 | 20 | 10 | 0 | 1 | 8 |
| 夏 | 0 | 30 | 24 | 3 | 0 | 8 | 0 | 12 | 6 | 0 | 7 | 10 |
| 秋 | 6 | 22 | 4 | 12 | 14 | 14 | 2 | 14 | 8 | 0 | 3 | 1 |

3. 基础气温（°F）按月：`[32, 36, 46, 56, 66, 76, 84, 82, 72, 60, 46, 36]`，加 `rng(−8..8)`，再加类型修正 `{Cold −12, Hot +12, Chilly −6, Snow −10, Blizzard −16, Hurricane +2, 其他 0}`，夹在 0..120 后 `heat = 100 + °F`。
4. `wind`：类型基值 ± 抖动 `{Clear 5±5, Windy 25±10, Blizzard 35±10, Hurricane 80±20, Tornado 40±15, 其他 10±8}`，夹 0..255。
5. `humid`：`{Rain 20±10, Overcast 6±4, Snow 8±4, Blizzard 15±5, Hurricane 40±15, Foggy 3±2, 其他 rng(0..4)}`。
6. 发 `weatherChanged`；状态栏图标刷新；报纸天气栏读取这四个值。

### 2.5 共用毁损例程 [高：行为 / 中：细节]

所有灾害通过同一个 `destroyStructure(x, y, cause)`：

1. 若该格属于多格建筑（由 `XZON` 角位 + 尺寸表反推锚点），**整个占地**一起处理；否则只处理本格。
2. 树（`0x06..0x0C`）与小公园 `0x0D` → 清地 `0x00`；其他建筑 / 道路 / 铁路 / 电线 / 高速 / 桥 → 瓦砾 `rng.pick(0x01..0x04)`；地下 `XUND` 的管线与地铁**保留**（地震除外，见 §2.6.5）。
3. 保留 `XZON` 的分区 nibble，清除角位（瓦砾是 1x1）；瓦砾格不参与生长，必须推土（$1/格）后才会重建 **[中]**。
4. 电厂（`0xC6..0xCF`）被毁：产生爆炸物件（`XTHG 0x06`，3 帧，纯视觉，不存档），并通知电力模块重算；**核电厂**被毁（任何原因）：整个 4x4 → 放射 `0x05` **[中]**。
5. Arcology 被毁：其微模拟居民从 `arcoPop` 扣除；Launch Arco 不触发升空奖励。
6. 发 `structureDestroyed(x, y, oldId, cause)`，并累计 `deaths += isZoneBuilding ? rng(0..3) : 0`（报纸 `<x` 死亡人数 token 用）**[低]**。

放射格 `0x05`：不可推土、不可建、阻断生长；每年每格以 `radioactiveDecayPerYear = 0.01` 概率变清地（社区记载 2010 年泄漏到 2300 年代基本清除）**[低]**。

#### 2.5.1 灾害标记层 `marker`（运行时不写 `XTXT`）[设计决定；存档合成 中]

**问题**：原版把火 / 洪水 / 暴乱 / 毒云直接写进 `XTXT`，而同一字节在公共建筑格上是微模拟标签、在标牌格上是标牌索引、在物件格上是 `XTHG` 指针。若照搬：火被扑灭而建筑未毁时标签已被覆盖，查询窗口 / `XMIC` 绑定丢失且无法从存档恢复；洪水退去后标牌消失。

**规则**：

1. 运行时标记只存在于 `marker: Uint8Array(16384)`，取值为 `TileMarker` 枚举（沿用 `XTXT` 的字节值 `0xFB..0xFF`，`0` = 无），`XTXT` 在灾害期间**一个字节都不改**。所有查询（燃烧格集合、洪水面积、人群、毒云、渲染覆盖层、终止条件）都以 `marker` 为准；运行时侧表 `fuel / cloudLife / cloudDir / riotLife` 同样以 `marker[i] ≠ 0` 的格索引为键，`marker` 清零时一并清零。
2. 同样地，`XTXT 0xC9..0xEF` 的物件指针运行时也不维护：物件位置以 `things[]` 为准，指针只在写档时合成（§2.12.6）。
3. **写档合成**（在 file-formats 的 `writeToSave` 之前由本模块产出 `xtxtOut`）：

```
xtxtOut = xtxt.slice()                                   // 标签 / 标牌 / 0xFA 原样
for slot in 1..39: t = things[slot]; if t && t.saved && xtxtOut[t.tile] == 0: xtxtOut[t.tile] = 0xC8 + slot
shadow = []
for i in 0..16383: if marker[i]:
    L = xtxtOut[i]
    if (0x01 <= L <= 0x32) || (0x3D <= L <= 0xC8): shadow.push({ tile: i, label: L })   // 需要侧表才能恢复的
    // 0x34..0x3C（共享标签）、0xFA（邻城连接）、0xC9..0xEF（物件指针）可按类型 / 几何 / XTHG 重建，不入表
    xtxtOut[i] = marker[i]
shadow.sort(微模拟标签 0x3D..0xC8 在前，其后标牌；同类按 tile 升序)
写 xtxtShadow := MISC[0x10BC..0x12BB]（512 B，dfloer 在全部样本城市中观察为全零 [高]，原版读入后不使用 [中]）：
    'X''S''H''D'（4 B 魔数）, ver = 1 (u8), flags (u8, bit0 = 被截断), count (u16 BE), 然后 count × 3 B：tile (u16 BE), label (u8)
    容量 floor((512 − 8) / 3) = 168 条；超出部分丢弃并置 flags.bit0、记诊断 `xtxtShadowTruncated`
```

4. **读档恢复**（本模块的 `rebuild()`，在 file-formats §3.4 的第 8 步、services 绑定 `XMIC` 之前运行）：

```
for i: v = xtxt[i]
    if v >= 0xFB: marker[i] = v; xtxt[i] = 0
    else if 0xC9 <= v <= 0xEF: xtxt[i] = 0                  // 指针由 XTHG 重建
if MISC[0x10BC..0x10BF] == 'XSHD' && ver == 1:
    for e in entries: if marker[e.tile] && xtxt[e.tile] == 0: xtxt[e.tile] = e.label
    清零该区（运行时不保留；下次写档重新生成）
fillFootprintLabels():   // 部分格被覆盖的多格建筑：同一占地内已有标签 L 的格 ≥ 1 ⇒ 其余 marker≠0 且 xtxt==0 的格补 L
restoreSharedLabels():   // 0x34..0x3C 按建筑类型补全（公交 / 火车 / 地铁站、风电、水电、公园、博物馆、图书馆、码头；services §2.6.1 的 sharedRecord 表）
restoreByXmic():         // 第三方存档 / 侧表截断的兜底
    for r in 10..149 with xmic[r].tileId != 0 and no tile has xtxt == 0x33 + r:
        cands = 以 TL 角位扫描、XBLD == tileId、占地内全部 xtxt == 0 且至少一格 marker != 0 的建筑，按 (y, x) 升序
        if cands.length == 1: 绑定（占地全格写 0x33 + r）
        elif cands.length > 1: 取第一个未被占用的候选绑定；记诊断 `xtxtRestoreAmbiguous(r)`（名字可能错配）
        else: 记诊断 `xmicOrphan(r)`；记录保留，由 services 决定是否回收
标牌 0x01..0x32 若侧表缺失则无法恢复：文本仍在 XLAB，记诊断 `signLost(label)`
0xFA 由 transport 的 recountConnections() 重建（地图边缘的路 / 轨 / 高速格）
```

5. 第三方存档（原版或 sc2kfix 写出的灾害中存档）天然无侧表：恢复率 = `fillFootprintLabels + restoreSharedLabels + restoreByXmic` 能覆盖的部分；诊断列表交给导入对话框显示，不阻止导入。
6. 单元测试要求：(a) 在警局上点火 → 扑灭 → 查询窗口仍显示名字且 `XMIC` 绑定不变；(b) 灾害中存档 → 读档 → `xtxt` 与存档前逐字节相等、`marker` 与存档前相等；(c) 构造 200 个被淹的带标签格 → 侧表截断 → 读档后微模拟标签全部恢复（标牌允许丢失并有诊断）。

### 2.6 各灾害规则

下列所有概率均为"每灾害 tick"的概率，灾害 tick 节奏见 §3.2。

#### 2.6.1 火灾 FIRE [机制 中 / 数值 低]

可燃性表 `flammability(XBLD)`：

| 类别 | 可燃 | 燃料 `fuelTicks` | 说明 |
|---|---|---|---|
| 清地 `0x00`、放射 `0x05`、水面格 | 否 | – | |
| 瓦砾 `0x01..0x04` | 是 | 6 | 社区记载瓦砾可继续烧 |
| 树 `0x06..0x0C`、小公园 `0x0D` | 是 | 8 | 烧完变清地 |
| 电线 `0x0E..0x1C`、道路 `0x1D..0x2B`、铁路 `0x2C..0x3E`、隧道口、交叉 `0x43..0x48`、高速 `0x49..0x50 / 0x61..0x69`、桥 `0x51..0x5C / 0x6A..0x6B`、地铁口 `0x6C..0x6F` | 否 | – | 火不沿道路 / 桥传播，道路天然是防火带 |
| 1x1 建筑 `0x70..0x8B`、水泵 `0xDC`、雕像、水塔、跑道、停机坪等 1x1 设施 | 是 | 10 | |
| 2x2 建筑 `0x8C..0xAD`、`0xF3` 官邸、`0xF5` 图书馆 | 是 | 12 | |
| 3x3 建筑 `0xAE..0xC5`、警局 / 消防局 / 医院 / 学校 / 大公园 / 博物馆 / 码头 / 市政厅 / 水电 / 风电 / 净水 / 淡化 | 是 | 16 | |
| 4x4 及以上（电厂、监狱、体育场、动物园、大学、Arcology、Llama Dome） | 是 | 20 | 电厂烧毁触发爆炸 |

规则：

- 起火：随机灾害选 `XPOP` 加权的可燃格点燃 1 处（情景 / 火风暴见 §2.6.11）。
- 标记：`marker[tile] = Fire`（`0xFF`，不写 `XTXT`，§2.5.1）；运行时 `fuel[tile] = fuelTicks`；建筑在烧时**仍显示原精灵 + 火焰覆盖层**，燃尽才毁 **[中]**。
- 蔓延：每个燃烧格每 tick 对 4 个正交邻格（对角邻格概率 ×0.5）尝试点燃，条件：可燃、未燃烧、无调度单位保护：

```
p = spreadBase(0.06) × (1 + wind / 255) × fuelFactor × (1 − min(XFIR[q], 255) / 320)
fuelFactor = { 树 1.4, 瓦砾 0.6, 1x1 1.0, 2x2 1.1, 3x3 1.2, 4x4+ 1.2 }
p = max(p, 0.004)              // 满覆盖也不能完全免疫
```

- 扑灭：每个燃烧格每 tick `pExt = XFIR[q] / 255 × 0.08 + (有消防 / 军队单位在 3x3 内 ? 0.5 : 0)`；扑灭 → 清标记，建筑保留（若已部分燃尽仍保留）。
- 燃尽：`fuel == 0` → `destroyStructure(cause = FIRE)`，火焰在瓦砾上再烧 `fuelTicks(瓦砾)` 后熄灭（即瓦砾阶段自然过渡，不再二次毁损）。
- 玩家对策：推土（每格 $1）清出防火带；放置消防单位（§2.7）；消防局资金 / Volunteer Fire Dept. 已体现在 `XFIR`。
- 断电消防局：`XFIR` 由服务规格减半，这里不再处理。

#### 2.6.2 洪水 FLOOD / 大洪水 MASSFLOODS [机制 中 / 数值 低]

- 原点：随机一个"与水面格 4 邻接的陆地格"，优先淡水；`floodAlt = 该格海拔`。大洪水原点取河 / 海岸线上 `k` 个起点（`massFloodSeeds = 6`）。
- 阶段：`GROW`（`floodGrowTicks = 40`）→ `HOLD`（`20`）→ `RECEDE`（`40`）。
- GROW：每 tick 每个前沿洪水格对 4 邻格以 `pFloodSpread = 0.5` 扩散，条件：陆地、`alt ≤ floodAlt + 1`、未被调度单位（警 / 消 / 军 3x3）保护、`floodArea < floodMaxTiles`；`floodMaxTiles = rng(48..96)`，大洪水 `rng(200..300)`，飓风 150。
- 淹没效果：`marker = Flood`（`0xFC`）；建筑（`XBLD ≥ 0x70`）与电线立即 `destroyStructure(FLOOD)`；树、道路、铁路、桥、地下设施保留 **[低]**（`floodDestroysInfrastructure = false`）；被淹的铁路格上若有列车 → 整列删除（§2.12.5）。
- RECEDE：每 tick 把距原点最远的 `ceil(area / 40)` 个标记移除；全部退去后灾害结束。
- 玩家对策：抬高岸边地形当堤坝（地形模块）；调度单位阻止扩散并在 RECEDE 阶段使其 3x3 内标记优先消失。
- `wDisasterFloodArea` 随时等于标记数（供 UI / 报纸"淹没 %x 英亩"）。

#### 2.6.3 暴乱 RIOT / 大暴乱 MASSRIOTS [触发 高 / 机制 中 / 数值 低]

- 触发条件 **[高]**：`unemployment ≥ 10` 且 `heat > 170` 且 `normalPop > 30,000`（不含 Arcology）。菜单"Rioters"无条件。
- 人群 = `marker` 标记（`Rioters 0xFD`；大暴乱 `MassRioters 0xFE`），不占 `XTHG`。初始 1 群（大暴乱 `massRiotGroups = 8`）。每群运行时数据：`riotLife[tile] = rng(40..80)`。
- 每 tick 每群：
  1. 若 `XPLC[q] ≥ 160`：以 `XPLC[q] / 255 × 0.5` 概率解散；若 3x3 内有警察 / 军队单位：立即解散。
  2. 以 `riotDamageChance = 1/6` 把脚下建筑 `destroyStructure(RIOT)`；以 `riotArsonChance = 1/8` 点燃脚下或邻格（走火灾规则）。
  3. 以 `riotSpawnChance = 1/16` 在邻格复制一群（上限 `maxRiotGroups = 12`；大暴乱 24）。
  4. 移动到随机 4 邻格（必须是已开发格或道路；不下水、不进放射）。
  5. `life -= 1`，归零解散。
- 消防单位对人群无效，但能灭他们放的火。社区经验"警局覆盖内不发生暴乱"在本规格里体现为：原点抽样排除 `XPLC ≥ 128` 的格 **[低]**。

#### 2.6.4 龙卷风 TORNADO [中]

- 需要天气 `0x0B`（随机）；菜单无条件。物件 `XTHG` 类型 `0x0F`，一次一只（`wActiveTornadoes`）。
- 生成于随机地图边缘格，初始朝向指向地图内部的 8 方向之一；`life = rng(60..120)` tick。
- 每 tick：以 1/3 概率把方向 ±1（45°）抖动；前进 1 格；脚下格：建筑 `pTornadoDestroyBuilding = 0.75`、基础设施 `0.5`、树 `0.5` → `destroyStructure(TORNADO)`；**不点火** **[中]**。与它同格的飞机 / 直升机 → 坠毁（§2.6.8）。
- 出界或 `life == 0` → 删除物件。精灵 3 帧循环。

#### 2.6.5 地震 EARTHQUAKE [中]

- 无前置。`magnitude = 5.0 + rng(0..39) / 10`（报纸用）；`shakeTicks = 12`（视图抖动、音效）。
- 第 1 tick 一次性结算：对每个非清地格 `pQuake = 0.02 × (magnitude − 4.5)`（5.0 → 1%，8.9 → 8.8%）；基础设施 ×0.5；桥格 ×1.5；命中 → `destroyStructure(QUAKE)`；被毁格以 `quakeFireChance = 0.4` 起火；被毁格下方 `XUND` 的管线 / 地铁以 0.5 概率清除（"地铁塌方"）**[低]**。
- 地形不改变 **[中]**。之后进入普通火灾流程直到火灭。

#### 2.6.6 怪兽 MONSTER [中]

- 物件 `XTHG 0x05`，一次一只。生成于随机边缘格，`life = rng(120..240)`，目标 = 城市中心（服务规格每月算出的 `cityCenter`）。
- 每 tick：以 0.6 概率朝目标走一步（8 方向），否则随机走；到达中心后改为纯随机游走。脚下格 `pMonsterCrush = 0.5` 毁坏、`pMonsterIgnite = 0.3` 点燃；3x3 内其他格 `0.1` 点燃（"射线"）。
- 驱离：半径 2 内每个军队单位每 tick 使 `life −= 10` 并把下一步方向设为背离该单位（社区经验"把军队放在怪兽正下方"）。
- 英雄 Maxis Man（`XTHG 0x10`）**[低]**：若无军队单位，每 tick 以 `heroChance = 1/400` 出现于地图边缘，直线飞向怪兽，相邻时怪兽 `life = min(life, 10)`；也能驱散毒云（半径 1 内 `life −= 20`）。
- 出界或 `life == 0` → 删除。

#### 2.6.7 核泄漏 MELTDOWN [中]

- 需核电厂。选随机一座：爆炸物件；4x4 占地 → 放射 `0x05`；占地外环 `r ≤ 3` 的格以 0.6 概率变放射（先 `destroyStructure`），`r = 4..5` 的可燃格以 0.3 概率起火；电力重算。Nuclear Free Zone 法令禁止新建核电厂，从而根绝该灾害。

#### 2.6.8 飞机 / 直升机坠毁 PLANECRASH / HELICOPTERCRASH [中]

- 飞机 / 直升机的起飞、巡航、返航与消失由本规格 §2.12.2 定义（生成概率引用 services §2.9：生长扫描访问已供电跑道格时 1/30 起飞，40% 为直升机）。
- 随机 / 菜单 PLANECRASH：从在飞飞机中随机选一架（PRNG）；**若没有在飞飞机**且存在已供电跑道格，立即"按需起飞"一架（`phase = CLIMB`，`z = zCruise / 2`，朝地图内部），`crashDelayTicks = 20` 后坠毁（`planeCrashSpawnsIfNone = true`，保证菜单 Air Crash 与随机空难在只有跑道没有飞机的时刻也能发生）**[低：实现补丁]**。坠毁：物件转为"坠落"状态（每 tick `z −= 4`，`z ≤ 0` 时）在当前格生成爆炸；3x3 内 `destroyStructure`（中心 1.0、邻格 0.6）并以 0.5 点燃；删除飞机槽位。直升机：中心 1.0、邻格 0.3。
- 龙卷风 / 怪兽与飞行物同格（§2.12.2 的 `(x, y)` 相同，不看 `z`）→ 同样坠毁（直升机坠毁的主要来源，`helicopterCrashOnCollision = true`）；此时 `current` 不变（仍是龙卷风 / 怪兽），报纸只报主灾害。
- 坠毁本身是瞬时事件；灾害模式持续到火灭。

#### 2.6.9 飓风 HURRICANE [中]

- 需 `weather == 0x0A` 且海岸图；菜单在海岸图上无条件。
- 风暴眼：运行时物件（用 `XTHG 0x0F` 槽位 + 状态位区分，或独立运行时结构；存档时写成龙卷风类型 **[低]**），从海侧边缘进入，朝内陆方向 ± 抖动，每 2 tick 走 1 格；`radius = 4`；`life = 200`。
- 期间 `wind = 200`（覆盖 `MISC 0x0064`，结束后恢复）→ 桥梁坍塌公式大概率命中、风电满产。
- 每 tick：半径内每格 `pHurricaneDestroy = 0.25 × (1 − d / 5)`（建筑），基础设施 ×0.4，树 ×0.4。
- 海岸洪水：风暴眼 12 格以内、海拔 `≤ waterLevel + 1`、距咸水 ≤ 6 格的陆地按洪水规则淹没（`floodMaxTiles = 150`）；风暴眼离开 12 格后进入 RECEDE。
- 出界或 `life == 0` → 删除；洪水退完才结束。

#### 2.6.10 微波失焦 MICROWAVE [中]

- 需微波电厂。选随机一座：在其 `r ≤ 8` 范围内随机选一个非电厂格为落点；落点 `destroyStructure`，其 3x3 以 1.0（中心）/ 0.7（环）点燃；`ZAP` 音效。

#### 2.6.11 火风暴 FIRESTORM [中]

- 在 `XPOP` 加权的已开发格上同时点燃 `firestormSeeds = rng(12..24)` 处；期间 `spreadBase ×1.5`、`wind = 200`。其余同火灾。

#### 2.6.12 化学泄漏 TOXICSPILL / 重大污染事故 POLLUTION [中]

- 毒云 = `marker = ToxicCloud`（`0xFB`）+ 运行时 `cloudLife[tile] / cloudDir[tile]`；在化工类工业格（`0x85` 化学仓、`0x9F / 0xBC` 化工厂）优先、否则任意工业格生成 `clouds = 2`（POLLUTION：6）朵，`life = rng(80..160)`。
- 每 tick：每 8 tick 随机换方向；每 2 tick 移动 1 格；脚下建筑若是分区建筑 → 改为**废弃**变体（1x1 → `0x8A/0x8B`，2x2 → `0xAA..0xAD`，3x3 → `0xC4/0xC5`，更大 → 瓦砾）；`XPLT[h] += 32`（夹 255）。
- 消散：消防 / 军队单位或英雄在半径 1 内 → `life −= 20`；归零消失。

#### 2.6.13 火山 VOLCANO [中]

- 中心 = `disasterPoint`（无则随机海拔 ≥ 8 的陆地格）。`volcanoRadius R = 6`，`growTicks = 24`。
- 生长：第 t tick 的半径 `r(t) = ceil(t × R / growTicks)`；对 `d ≤ r(t)` 的格：`destroyStructure(VOLCANO)` 后清为 `0x00`，并经地形模块 `setAltitude(x, y, max(alt, peakAlt − 2·d))`（`peakAlt = min(31, centerAlt + 12)`），水面格填为陆地。
- 岩浆：生长结束后在 `d ∈ [R, R+1]` 的可燃格点燃 `rng(8..12)` 处，`spreadBase ×1.5` 持续到火灭。山体永久保留。

#### 2.6.14 其他模块引发的灾害事件（接口）

| 来源 | 调用 | 本模块行为 |
|---|---|---|
| 电厂寿命 > 50 年（电力规格） | `destroyStructure(plant, cause = PLANT_EOL)` | 爆炸 + 瓦砾 + 起火（核电 → 放射）；进入灾害模式直到火灭；`newsStory(POWER_PLANT_EOL)` 由电力规格先行发出 |
| 交通预算 < 100% 且大风（交通规格） | `destroyStructure(bridgeTile, BRIDGE)` | 不进入灾害模式；`newsStory(BRIDGE_COLLAPSE)` |
| 道路 / 铁路预算衰败（交通规格） | `destroyStructure(tile, DECAY)` | 不进入灾害模式 |
| Launch Arcology 升空（服务规格） | `destroyStructure(arco, LAUNCH)` | 爆炸特效，不起火 |

### 2.7 紧急调度单位 [存在与用途 高 / 数量与半径 低]

| 单位 | `XTHG` 类型 | 可用数量 `avail` | 对火 | 对洪水 | 对暴乱 | 对毒云 | 对怪兽 |
|---|---|---|---|---|---|---|---|
| Police 警察 | `0x07` | 警局数（`0xD2` 建筑数） | – | 阻挡扩散 / 加速退水 | 立即解散 3x3 内人群 | – | – |
| Fire 消防 | `0x08` | 消防局数（`0xD3`） | 3x3 内 `pExt += 0.5`，阻止点燃 | 同上 | – | `life −= 20` | – |
| Military 军队 | `0x0E` | 基地类型 `MISC 0x0E4C`：陆军 4、空军 3、海军 3、导弹井 2、无 / 拒绝 0 | 同消防 | 同上 | 同警察 | 同消防 | 半径 2 驱离 |

- 只在紧急模式可放置；放置点必须是陆地；占用 `XTHG` 39 个槽位之一（与飞机 / 火车 / 船共享）。槽满时按 §2.12.6 的优先级**驱逐最老的常驻物件**（列车整列驱逐）；仍无槽（即其余槽全是调度单位 / 灾害物件）才失败并计数（`dwPlace*ThingFail`），UI 提示。
- 已放满时再点击 → 把该类最早放置的单位移到新位置 **[中]**。
- 灾害结束自动删除全部单位与英雄。
- 单位本身不会被灾害伤害。

### 2.8 灾害结束与善后 [中]

1. 统计：`destroyedTiles`、`deaths`、`floodArea`、`magnitude`（地震）等作为报纸参数。
2. `newsStory(DISASTER_<kind>, min(deaths, 255))`；若 `extraNewspaper` 开启 → 立即弹"Extra!!!"；否则进入故事池等待订阅版。
3. 其他城市的灾害（`gendisasterstory`）由报纸填充逻辑随机产生，与本城无关。
4. 存档：灾害模式下存档 → `MISC 0x0004 = 2`、`0x1048 = 1`；`marker` 按 §2.5.1 合成进 `XTXT`（被覆盖的标签进 `xtxtShadow`），`XTHG` 物件按 §2.12.6 写出；运行时计时器（燃料、人群寿命、云寿命、风暴眼参数）不存档，读档时按类型默认值重建（sc2kfix 也以"灾害模式读档"方式恢复）。

### 2.9 科技发明时间线 [规则 高 / 基准年 中，个别 低]

- 新城创建时对 17 个槽位：`invented[i] = base[i] + rng.int(20)`（0..19 年）；若 `< startYear` 则写 0（开局即有）**[高：dfloer + sc2kfix 还原]**。
- 判定：每年 1 月第 0 天（预算之前）遍历：`year ≥ invented[i]` 且未公告 → 公告 `newsStory(INVENTION | INNOVATION, i)`、刷新工具菜单、置"已公告"位（存档中把该槽位写 0 **[高：dfloer 观察"发明后为 0"]**）。
- 调试"Add All Inventions"= 全部写 0。
- 煤 / 油 / 水电、水泵、水塔、管线、电线、道路、铁路、海港、全部公共服务、全部 20 条法令、奖励建筑（按人口）**不受年份限制** **[中]**。
- Arcology 额外要求里程碑进度 ≥ 6（normalPop > 120,000，服务规格）。Nuclear Free Zone 法令隐藏核电厂。

| 槽位 | `MISC` 偏移 | 科技 | 基准年 | 置信度 | 报纸组 |
|---|---|---|---|---|---|
| 0 | `0x0738` | Gas power 燃气电厂 | 1950 | 中 | `INVENTION` |
| 1 | `0x073C` | Nuclear power 核电厂 | 1955 | 中 | `INVENTION` |
| 2 | `0x0740` | Solar power 太阳能 | 1990 | 中 | `INVENTION` |
| 3 | `0x0744` | Wind power 风电 | 1980 | 中 | `INVENTION` |
| 4 | `0x0748` | Microwave power 微波电厂 | 2020 | 中 | `INVENTION` |
| 5 | `0x074C` | Fusion power 聚变电厂 | 2050 | 中 | `INVENTION` |
| 6 | `0x0750` | Airport 机场（分区） | 1930 | 低 | `INVENTION` |
| 7 | `0x0754` | Highways 高速公路（含匝道、高架） | 1930 | 中 | `INVENTION` |
| 8 | `0x0758` | Buses 公交车站 | 1920 | 中 | `INVENTION` |
| 9 | `0x075C` | Subways 地铁（含地铁站、地铁-铁路口） | 1910 | 中 | `INVENTION` |
| 10 | `0x0760` | Water treatment 净水厂 | 1935 | 低 | `INVENTION` |
| 11 | `0x0764` | Desalinization 海水淡化 | 1990 | 中 | `INVENTION` |
| 12 | `0x0768` | Plymouth Arcology | 2000 | 中 | `INNOVATION` |
| 13 | `0x076C` | Forest Arcology | 2050 | 中 | `INNOVATION` |
| 14 | `0x0770` | Darco | 2100 | 中 | `INNOVATION` |
| 15 | `0x0774` | Launch Arcology | 2150 | 中 | `INNOVATION` |
| 16 | `0x0778` | （镜像 / 未用；dfloer 在少数存档中看到 Highways 值） | 不使用 | 高（存在）/ 低（含义） | – |

2050 开局：槽位 0–3、7–11 必为 0；聚变 / Forest 可能开局即有或最晚 2069。

### 2.10 报纸系统

#### 2.10.1 投递与版面 [节奏 高 / 版面 中]

- 设置：`MISC 0x1004` 订阅（paper delivery）、`0x1008` Extra!!!、`0x100C` 订阅哪一份。
- **订阅版**：每年 **4 月 1 日和 8 月 1 日**（月索引 3、7 的第 0 天）弹出模态报纸 **[高：sc2kfix 还原]**；社区"每 6 个月一份"与之吻合。
- **Extra!!!**：事件驱动，立即弹出：建城、里程碑（growth）、发明 / 创新、电厂到期、灾害结束 **[中]**。
- 可选报纸数随人口增长 1 → 6 **[中]**：`papers = 1 + min(5, progression)`（里程碑等级，服务规格）**[低]**。每份有名称 / 风格（`paper_t {name, style, tag, survey, weather}` 5 字节 × 6 = `MISC 0x0E50..`）。
- 版面（原创模板）：头条（故事池最高分）、2–3 条次要故事、天气栏（当前 `heat−100` °F / `wind` mph / `humid` mm / 趋势 + 预报）、Miss Sim 问答、体育（有球队位时）、国内 / 国际简讯（填充）、社论 / 读者来信（民意）、广告位（原创幽默）。
- 文本规则（文本规格）：头条标题化并加" -"后缀；`-` 起段；数字 `%N` 取 1..N（修正 Win95 的越界 bug）；`<N` 只用于死亡人数；`*` 每次独立随机、`[`/`^`/`@` 全文一致。

#### 2.10.2 事件类型总表（67 种，`newsStory(type, value)`）

`power` = 入池初始分，`decay` = 每月扣分（≤ 0 出池），`cooldown` = 同类型最短间隔（月），"Extra" = 是否触发号外。触发条件给出实现建议；带 ★ 的由其他规格判定后调用。

| # | 标识 | 文本组（text spec） | 触发条件 | `value` | power / decay / cooldown | Extra |
|---|---|---|---|---|---|---|
| 0 | `WEATHER` | `genweatherstory` 0x00 | 每份报纸必含 | trend | – | – |
| 1 | `JUNK` | 0x01/0x06..0x0F 填充 | 版面不足时随机 | – | 10 / 10 / 0 | – |
| 2 | `FOUNDING` | `foundingstory` 0x02 | 新城创建 | 0 | 100 / 20 / ∞ | 是 |
| 3 | `GROWTH` | `genpopulationstory` 0x03 | ★ 里程碑升级 | 旧进度 | 90 / 15 / 0 | 是 |
| 4 | `INVENTION` | `inventionstory` 0x05 | 槽位 0–11 发明 | 槽位 | 80 / 15 / 0 | 是 |
| 5 | `INNOVATION` | `invention2story` 0x04 | 槽位 12–15 发明 | 槽位 | 80 / 15 / 0 | 是 |
| 6 | `WAR` | `warstory` 0x06 | 填充，月概率 1/24 | – | 20 / 10 / 12 | – |
| 7 | `MARKET` | `businessstory` 0x07 | 填充 1/12 | – | 20 / 10 / 6 | – |
| 8 | `SPORTS` | `sportsstory` 0x08 | 有球队位（`MISC 0x1028`）时 1/4 | 球队 | 25 / 10 / 2 | – |
| 9 | `FED_RATE_UP` | 0x09 | ★ `natTrend` 走向衰退 | 新利率 | 40 / 10 / 12 | – |
| 10 | `FED_RATE_DOWN` | 0x0A | ★ 走向景气 | 新利率 | 40 / 10 / 12 | – |
| 11 | `POLITICS` | `nationalpolitical` 0x0B | 填充 1/12 | – | 20 / 10 / 6 | – |
| 12 | `DIPLOMACY` | `internationalstory` 0x0C | 填充 1/12 | – | 20 / 10 / 6 | – |
| 13 | `DISASTER` | `gendisasterstory` 0x0D | 填充：外地灾害 1/18 | 外地类型 | 25 / 10 / 6 | – |
| 14 | `MEDICAL` | `healthstory` 0x0E | 填充 1/12 | – | 20 / 10 / 6 | – |
| 15 | `UPBEAT` | `localpoliticalstory` 0x0F / `sciencestory` 0x01 | 填充 1/8 | – | 15 / 10 / 3 | – |
| 16 | `HIGH_CRIME` | `highcrime` 0x10 | 月检 `rng(0..127) < crimeGraph` | crimeGraph | 50 / 10 / 12 | – |
| 17 | `HIGH_TRAFFIC` | `hightraffic` 0x11 | `rng(0..127) < trafficGraph` | – | 45 / 10 / 12 | – |
| 18 | `HIGH_POLLUTION` | `highpollution` 0x12 | `rng(0..127) < pollutionGraph` | – | 45 / 10 / 12 | – |
| 19 | `POOR_EDUCATION` | `loweducation` 0x13 | `workforceEQ < 80 && rng(0..127) < 100 − EQ` | EQ | 40 / 10 / 12 | – |
| 20 | `POOR_HEALTH` | `lowhealthcare` 0x14 | `workforceLE < 60 && rng(0..127) < 80 − LE` | LE | 40 / 10 / 12 | – |
| 21 | `POOR_EMPLOYMENT` | `highunemployment` 0x15 | `unemployment% > rng(0..31) + 5` | % | 45 / 10 / 12 | – |
| 22 | `DISASTER_FIRE` | `disasterfire` 0x16 | 火灾 / 火风暴 / 电厂爆炸结束 | deaths | 95 / 15 / 0 | 是 |
| 23 | `DISASTER_FLOOD` | `disasterflood` 0x17 | 洪水 / 大洪水结束 | deaths | 95 / 15 / 0 | 是 |
| 24 | `DISASTER_PLANECRASH` | `disasterplane` 0x18 | 飞机坠毁结束 | deaths | 95 / 15 / 0 | 是 |
| 25 | `DISASTER_HELICOPTERCRASH` | `disasterhelicopter` 0x19 | 直升机坠毁结束 | deaths | 90 / 15 / 0 | 是 |
| 26 | `DISASTER_TORNADO` | `disastertornado` 0x1A | 龙卷风结束 | deaths | 95 / 15 / 0 | 是 |
| 27 | `DISASTER_EARTHQUAKE` | `disastereqarthquake` 0x1B | 地震结束 | 震级×10 | 100 / 15 / 0 | 是 |
| 28 | `DISASTER_MONSTER` | `disastermonster` 0x1C | 怪兽结束 | deaths | 100 / 15 / 0 | 是 |
| 29 | `DISASTER_MELTDOWN` | `disastermeltdown` 0x1D | 核泄漏结束 | deaths | 100 / 15 / 0 | 是 |
| 30 | `DISASTER_MICROWAVE` | `disastermicrowave` 0x1E | 微波失焦结束 | deaths | 90 / 15 / 0 | 是 |
| 31 | `DISASTER_VOLCANO` | `disastervolcano` 0x1F | 火山结束 | deaths | 100 / 15 / 0 | 是 |
| 32 | `DISASTER_POLLUTION` | `disastermajorspill` 0x21 | 重大污染事故结束 | 云数 | 95 / 15 / 0 | 是 |
| 33 | `DISASTER_CHEMICALSPILL` | `disasterspill` 0x20 | 化学泄漏结束 | 云数 | 90 / 15 / 0 | 是 |
| 34 | `DISASTER_HURRICANE` | `disasterhurricane` 0x22 | 飓风结束 | deaths | 100 / 15 / 0 | 是 |
| 35 | `DISASTER_RIOT` | `disasterriot` 0x23 | 暴乱 / 大暴乱结束 | deaths | 95 / 15 / 0 | 是 |
| 36 | `POWER_PLANT_EOL` | `oldpowerplant` 0x24 | ★ 电厂年龄 > 48 | 电厂类型 | 70 / 15 / 12 | 是 |
| 37 | `OVERCROWDED_PRISONS` | `fundprison` 0x25 | ★ 囚犯 > 监狱容量 | – | 40 / 10 / 12 | – |
| 38 | `ANGRY_TEACHERS` | `fundeducation` 0x26 | ★ 学校资金 < 75% 连续 ≥ 3 月 | 资金% | 40 / 10 / 12 | – |
| 39 | `BRIDGE_COLLAPSE` | `fundtransit` 0x27 | ★ 桥格大风坍塌 | – | 60 / 10 / 0 | – |
| 40 | `ANGRY_BULLDOZER` | `treeremoval` 0x28 | ★ 过去 12 月砍树 ≥ 50 格 | 格数 | 35 / 10 / 24 | – |
| 41 | `ORDINANCE` | `gennewordinancestory` 0x29 + `ordinanceopinion` | 法令被启用 / 废止 | 法令索引（+32 表示废止） | 50 / 10 / 0 | – |
| 42 | `OPINION_FRED` | `genrichopoinionstory` 0x2A | 每年 1 月支持率抽样后：排名第 1 的抱怨 | 抱怨类 0..6 | 40 / 10 / 12 | – |
| 43 | `OPINION_EDITOR` | `genopiniongripe` 0x2C | 排名第 2 的抱怨 | 抱怨类 | 35 / 10 / 12 | – |
| 44 | `SURVEY` | `genrichgripestory` 0x2B | 支持率抽样结果 | 支持率% | 45 / 10 / 12 | – |
| 45 | `MISSIM` | `missimquestion` 0x2D + `missimanswer` | 每份报纸 1 条 | – | – | – |
| 46 | `DEMAND_POWER` | `needpower` 0x2E | ★ 诉求链命中 | – | 55 / 10 / 12 | – |
| 47 | `DEMAND_TRANSIT` | `needroad` 0x2F | ★ | – | 50 / 10 / 12 | – |
| 48 | `DEMAND_POLICE` | `needpolice` 0x30 | ★ | – | 50 / 10 / 12 | – |
| 49 | `DEMAND_FIRE` | `needfire` 0x31 | ★ | – | 50 / 10 / 12 | – |
| 50 | `DEMAND_WATER` | `needwater` 0x32 | ★ | – | 55 / 10 / 12 | – |
| 51 | `DEMAND_HOSPITAL` | `needhospital` 0x33 | ★ | – | 50 / 10 / 12 | – |
| 52 | `DEMAND_SCHOOL` | `needschool` 0x34 | ★ | – | 50 / 10 / 12 | – |
| 53 | `DEMAND_SEAPORT` | `needseaport` 0x35 | ★ | – | 45 / 10 / 12 | – |
| 54 | `DEMAND_AIRPORT` | `needairport` 0x36 | ★ | – | 45 / 10 / 12 | – |
| 55 | `DEMAND_ZOO` | `needzoo` 0x37 | ★ 休闲 cap | – | 35 / 10 / 24 | – |
| 56 | `DEMAND_STADIUM` | `needstadium` 0x38 | ★ | – | 35 / 10 / 24 | – |
| 57 | `DEMAND_MARINA` | `needmarina` 0x39 | ★ | – | 35 / 10 / 24 | – |
| 58 | `DEMAND_PARK` | `needpark` 0x3A | ★ | – | 35 / 10 / 24 | – |
| 59 | `DEMAND_INDUSTRIAL_CONNECTION` | `needseapoer`(sic) 0x3B | ★ 无水体时的海港诉求 | – | 45 / 10 / 12 | – |
| 60 | `DEMAND_COMMERCIAL_CONNECTION` | `needconnections` 0x3C | ★ | – | 45 / 10 / 12 | – |
| 61 | `LOW_CRIME` | `lowcrime` 0x3D | `crimeGraph < rng(0..15)` | – | 30 / 10 / 24 | – |
| 62 | `LOW_TRAFFIC` | `highrating` 0x3E | `trafficGraph < rng(0..15)` | – | 30 / 10 / 24 | – |
| 63 | `LOW_POLLUTION` | `lowpollution` 0x3F | `pollutionGraph < rng(0..15)` | – | 30 / 10 / 24 | – |
| 64 | `GOOD_EDUCATION` | `higheducation` 0x40 | `EQ ≥ 120 && rng(0..7) == 0` | EQ | 30 / 10 / 24 | – |
| 65 | `GOOD_HEALTH` | `highhealth` 0x41 | `LE ≥ 75 && rng(0..7) == 0` | LE | 30 / 10 / 24 | – |
| 66 | `GOOD_EMPLOYMENT` | `lowunemployment` 0x42 | `unemployment% < rng(0..3) + 1` | % | 30 / 10 / 24 | – |

月检类型（16–21、61–66）在每月第 24 天（天气判定之后）评估一次；`*Graph` 口径见服务规格 §2.10.3。

#### 2.10.3 原创模板需要的 Token 类别 [高：类别清单来自文本规格]

简单 Token（100 组）与复杂 Token（40 组）清单直接采用文本规格的分组名（`destroyverb`、`fireverb`、`disaster`、`bignumber`、`locals`、`localgov`、`landmark`、`othercity`、`country`、`criminal`、`crimetype`、`expert`、`emotion`、`malename`、`femalename`、`lname`、`llama`、`illness`、`importantperson`、`moneything`、`job`、`powertype`、`sport`、`teamname`、`weathercondition` 等）；`CITYNAME` / `MAYORNAME` / `TEAMNAME` 从城市数据填；`traffic / pollution / crime / taxes / employment / education / health` 七个复杂组与支持率的 7 类抱怨一一对应。文本内容全部原创。

### 2.11 市民诉求与民意来源

| 渠道 | 来源 | 规格 |
|---|---|---|
| 状态栏第二行 | 诉求链第一条未满足项（天气警告 → 电 → 路 → 警 → 消 → 水 → 医院 → 学校 → 海港 / 连接 → 机场 → 休闲） | `services-models.md` §2.10.4 |
| 报纸 `DEMAND_*` / `HIGH_*` / `LOW_*` / `POOR_*` / `GOOD_*` | 同上 + 月检 | §2.10.2 |
| 支持率（市长官邸查询、Population 窗口） | 每年 1 月 100 次抽样，7 类抱怨：交通、污染、犯罪、失业、住宅税、教育（`100 − EQ`）、健康（`70 − LE`） | `services-models.md` §2.10.3 |
| 报纸 `SURVEY` / `OPINION_FRED` / `OPINION_EDITOR` | 抽样结果与前两名抱怨 | §2.10.2 |
| 8 位顾问（预算窗口 Advisor） | Taxes / Ordinances / Bonds / Police / Fire / Health / Education / Transit，33 条建议 | 下表 |
| 暴乱 | 失业 + 高温 + 人口（§2.6.3） | 本文 |
| 砍树抗议 | `ANGRY_BULLDOZER` | 地形规格计数 |

顾问建议表（标识来自公开符号表 **[高]**；触发条件为本规格建议 **[低]**；每位顾问每次打开预算窗口只给**第一条**命中的建议，按表内顺序）：

| 顾问 | 标识 | 条件 |
|---|---|---|
| Bonds | `BOND_OUTSTANDINGKILLING` | 平均债券利率 > 联邦利率 + 3 |
| Bonds | `BOND_CUTBACK` | 债券数 ≥ 10 |
| Bonds | `BOND_FLOATGOODRATES` | 联邦利率 ≤ 4 且资金 < 5,000 |
| Bonds | `BOND_FLOATCITYEXPAND` | 资金 < 2,000 且债券数 < 3 |
| Police | `POLICE_OUTOFCONTROL` | crimeGraph > 60 |
| Police | `POLICE_DO_NEIGHBORWATCH` | crimeGraph > 40 且未启用 Neighborhood Watch |
| Police | `POLICE_NATAVERAGE` | 20 ≤ crimeGraph ≤ 60 |
| Police | `POLICE_CRIMELOW` | 其他 |
| Fire | `FIRE_COVERAGENEEDMORE` | 消防局数 < normalPop / 20,000 |
| Fire | `FIRE_COVERAGEADEQUATE` | 消防局数 < normalPop / 15,000 + 1 |
| Fire | `FIRE_COVERAGEEXCELLENT` | 其他 |
| Taxes | `PROPTAX_CUTBACK` | 年支出 > 年收入 且 资金 < 0 |
| Taxes | `PROPTAX_RAISE` | 任一税率 < 5 且 资金 < 0 |
| Taxes | `PROPTAX_LOWER` | 任一税率 > 9 |
| Ordinances | `ORDIN_DO_POLLUTIONCTRLS` | pollutionGraph > 50 且未启用 |
| Ordinances | `ORDIN_DO_ENERGYCONSERVE` | 电力使用率 > 90% 且未启用 |
| Ordinances | `ORDIN_DO_ANTIDRUGCAMPGN` | crimeGraph > 40 且未启用 |
| Ordinances | `ORDIN_DROP_LEGALGAMBLING` | crimeGraph > 60 且已启用 |
| Ordinances | `ORDIN_DROP_INCOMETAX` | R 需求 < −500 且已启用 |
| Ordinances | `ORDIN_DROP_SALESTAX` | C 需求 < −500 且已启用 |
| Health | `HEALTH_NEEDMORE` | 医院数 < normalPop / 25,000 或 LE < 60 |
| Health | `HEALTH_DO_FREECLINICS` / `DO_CPRTRAINING` / `DO_SMOKINGBAN` | LE < 70 且对应法令未启用（依次） |
| Health | `HEALTH_ADEQUATE` | LE < 75 |
| Health | `HEALTH_EXCELLENT` | 其他 |
| Education | `EDUCATION_NEEDMORESCHOOLS` | 学校数 < normalPop / 20,000 |
| Education | `EDUCATION_NEEDMORECOLLEGES` | 大学数 < normalPop / 50,000 |
| Education | `EDUCATION_ADEQUATE` | 其他 |
| Transit | `TRANSIT_TOOMANYROADS` | 道路格数 > 已开发格数 / 2 |
| Transit | `TRANSIT_INADEQUATEFLOATBOND` | trafficGraph > 60 且资金 < 10,000 |
| Transit | `TRANSIT_YESWECAN` | 其他 |

### 2.12 常驻物件（Ambient Things）[存在与类型 高 / 生成概率 高（引用）/ 运动与寿命 低]

原版地图上除灾害物件与调度单位外，常驻着一批民用 `XTHG` 物件：飞机 `0x01`、直升机 `0x02`、货船 `0x03`、帆船 `0x09`（`variant ≠ 0` 为 Nessie）、火车 `0x0A/0x0B`、地铁列车 `0x0C/0x0D`，以及不存档的推土机动画（逆向枚举 `0x04`）与 Maxis Man（`0x10`，§2.6.6）。transport §2.9 / §2.14 与 services §2.9 只给出**生成概率**并把运动交给本规格；本节补齐运动、寿命、槽位与存档规则。原版的运动算法未公开，下列数值全部进入 `THINGS_TUNING`（§3.2）。

#### 2.12.1 总则

- **时钟**：物件按"物件 tick"推进，与灾害 tick 同节奏（`tickIntervalMs[speed]`），**城市模式与灾害模式下都运行**，暂停时停住 **[中：原版灾害期间飞机 / 列车仍在动]**。一个 tick 内按槽位升序步进，保证 PRNG 顺序可复现。
- **位置模型**：格坐标 `(x, y)` + 格内偏移 `(px, py) ∈ 0..15`（1/16 格）+ 每 tick 速度 `(dx, dy)`（1/16 格，int8）+ 离地高度 `z`（0..31，`ALTM` 单位，仅飞行物）；朝向 `dir ∈ 0..7`（0 = 北，顺时针）由速度符号推出并写回记录。"进入新格"= `px/py` 溢出 0..15 时 `x/y` 进位。
- **运行时字段**（不存档）：`cls`（槽位类别，§2.12.6）、`phase`、`life`（剩余 tick）、`spawnTick`（驱逐排序）、`home`（出发的跑道 / 栈桥末端 / 码头锚点 / 车站的格索引）、`target`、`chain`（列车）。
- **空间索引**：`thingAt: Map<tileIndex, slot[]>` 每 tick 重建（≤ 39 项），供龙卷风 / 怪兽撞机、渲染拾取与查询窗口使用。
- **出界**：常驻物件**永不出界**——到达边缘则转向地图内部（飞行物）或掉头（船 / 列车）；只有灾害物件出界即删。
- **与灾害的关系**：常驻物件不会被火 / 洪水 / 地震"杀死"，只有两种被动删除：(a) 所在格失去承载条件（轨道被毁、水面被填、码头 / 起重机被毁，见各小节）；(b) 被龙卷风 / 怪兽撞上的飞行物坠毁（§2.6.8）。常驻物件不影响灾害终止条件。

| 类型 | `XTHG` | 生成条件（引用） | 速度（1/16 格 / tick） | 寿命 `life`（tick） | 消失条件 | 占槽 | 存档 |
|---|---|---|---|---|---|---|---|
| 飞机 | `0x01` | services §2.9：生长扫描访问**已供电**跑道格 `0xDD/0xDE` 时 1/30 起飞，其中 60% 为飞机；`airplanes < maxAirplanes (3)` | 8 | `rng(300..600)` | 返航落地；撞龙卷风 / 怪兽 | 1 | 是 |
| 直升机 | `0x02` | 同上，40% 为直升机；`helicopters < maxHelicopters (2)` | 4 | `rng(200..400)` | 返航落地；撞击 | 1 | 是 |
| 货船 | `0x03` | services §2.9：生长扫描访问起重机格 `0xE0` 时 1/4 派出；该起重机有栈桥且末端 `depth ≥ 2`、可航区 ≥ `minNavigableTiles (30)`、该起重机无在航船、`ships < maxShips (4)` | 2 | `rng(400..800)` | 回港；所在格不可航 | 1 | 是 |
| 帆船 | `0x09` | services §2.2 码头：每月第 24 天，每座**已供电**码头 `0xF8` 以 1/4 生成，`perMarina ≤ 2`、`sailboats ≤ 6` | 1 | `rng(1500..3000)` | 码头被毁 / 断电满月；寿命尽 | 1 | 是 |
| Nessie | `0x09`, `variant = 1` | 生成帆船时所在可航区 ≥ `nessieMinWater (400)` 格 → 1/64 改为 Nessie；全局 ≤ 1 | 2 | `rng(120..240)` | 寿命尽（"下潜"） | 1 | 是 |
| 火车 | `0x0A` + 2 × `0x0B` | transport §2.9：生长扫描访问**已供电**火车站 `0xED` 时 1/4，`activeTrains < depots ÷ 4`（整数除法）**[高]**，车站正交相邻有 `RAIL_SET` 格，且有 3 个可用槽 | 每 `trainStepTicks (3)` tick 走 1 格 | `rng(400..800)` 步 | 寿命尽后下次停站；轨道被毁 | 3 | 是 |
| 地铁列车 | `0x0C` + 2 × `0x0D` | 火车经转换件入地后的同一列车 | 同上 | 同上 | 同上 | 3 | 是 |
| 推土机 | `0x04` | 玩家推土 / 开防火带 | – | `bulldozerTicks (6)` | 动画结束 | **0** | 否 |
| Maxis Man | `0x10` | §2.6.6 | 8 | 灾害结束 | 灾害结束 | 1 | 否（存档前删除） |
| 爆炸 | `0x06` | §2.5 第 4 条 | – | 3 帧 | 动画结束 | **0** | 否 |

#### 2.12.2 飞机与直升机

生成时记录：`(x, y)` = 被访问的跑道格；`z = 0`；`dir` = 跑道轴向（`XBIT.ROTATED` 决定东西 / 南北），正反随机；`home = 该格`；`phase = CLIMB`。

飞机状态机：

- `CLIMB`：沿 `dir` 直线前进；每 tick `z += 1`，到 `zCruise = 12` 转 `CRUISE`。
- `CRUISE`：`life` 倒数；每 `turnEvery = 24` tick 以 1/2 概率 `dir ± 1`（45°）；若距任一地图边缘 `< edgeMargin = 4` 格，把 `dir` 改为 8 向中最接近"指向地图中心"的方向（不随机）；`life == 0` → `RETURN`。
- `RETURN`：`target` = 任一已供电跑道格（优先 `home`，`home` 已不是跑道则随机一个）；每 tick 朝 `target` 取 8 向贪心方向；距离 `≤ descendRadius = 8` 时每 tick `z −= 2`（下限 0）；进入 `target` 格且 `z == 0` → 删除（落地）。全图已无跑道 → 改为 `LEAVE`：朝最近边缘飞，进入边缘格即删除（唯一允许"出界"消失的常驻物件）。
- 碰撞：与龙卷风 / 怪兽 `(x, y)` 相同 → §2.6.8 坠毁（`phase = CRASHING`，每 tick `z −= 4`，`z ≤ 0` 时爆炸并删除）。

直升机：

- `CLIMB` 同飞机，`zCruise = 6`。
- `PATROL`：`target` = 交通最重处——取 `XTRF` 半格值 `≥ trafficReportThreshold = 96` 的格集合中随机一格（PRNG；集合为空则随机已开发格）；朝 `target` 8 向贪心；到达 → `HOVER`。
- `HOVER`：原地 `hoverTicks = 40`（`px/py` 每 tick ±1 抖动，模拟悬停），进入时发 `helicopterReport(x, y, level = XTRF 半格值)`；UI 在状态栏第二行显示一条原创"交通播报"（`reportCooldownTicks = 300` 内不重复发）；结束后回到 `PATROL` 选下一个目标。`life == 0` → `RETURN`（目标：已供电跑道格或停机坪 `0xE6`）。
- 碰撞同飞机（直升机坠毁的主要来源）。

空难的"按需起飞"（§2.6.8）：PLANECRASH 开始时若 `airplanes.filter(inFlight).length == 0`，在随机已供电跑道格生成一架 `phase = CLIMB, z = zCruise / 2`，并在 `crashDelayTicks = 20` 后强制 `CRASHING`。直升机坠毁没有此规则。

存档字段：`type / dir / variant = 0 / x / y / z / px / py / dx / dy / label = phase / goal = min(255, life >> 2)`。读档：本项目存档按 `label` 恢复 `phase`、`life = goal << 2`；第三方存档的 `label/goal` 不可信（dfloer 标 unknown）→ `z == 0 ? CLIMB : CRUISE`，`life` 取默认区间随机。

#### 2.12.3 货船

- **可航谓词**（transport §2.6 / §3.8 与 terrain §2.9 提供）：

```
navigable(t) = isWater(t) && waterDepth(t) >= 1
            && XBLD[t] < 0x0E                                 // 水面上无结构（栈桥 0xDF、水电站等都不可穿）
            || (isWater(t) && waterDepth(t) >= 1 && bridgeOf[t] && !bridgeBlocksShips(bridgeOf[t]))
bridgeBlocksShips(b) = b.kind in { Causeway, LowHighway }      // 堤道、低架高速切断航道；吊桥 / 开启桥 / 铁路桥 / 加固高速 / 高架电线可穿
```

- **可航区** = 从栈桥末端水格出发、4 邻接 `navigable` 的连通分量（`navRegion: Uint16Array(16384)`，0 = 不可航，否则区号）。水层 / 桥 / 港口部件 / 填海任一变化置 `navRegionDirty`，下一物件 tick 重算（O(16384) BFS，可接受）。
- **生成**：`home` = 栈桥末端水格；初始 `dir` = 栈桥延伸方向；`phase = CRUISE`。
- **运动**：直行；每次进入新格时，若前方格 `!navigable` 或区号 ≠ 自己的区号，或以 `turnChance = 1/6` → 在 8 向中选"下一格可航且同区"的方向（PRNG，排除掉头；仅剩掉头时掉头）。进入边缘格 → 掉头。
- **开启桥**：船与某座开启桥（transport §2.6）任一桥格的切比雪夫距离 `≤ 2` 时该桥 `raised = true`（渲染 `0x59` 升起段），否则放下 **[中：原版有升桥动画]**。
- **寿命**：`life == 0` → `RETURN`：朝 `home` 8 向贪心（只走可航同区格；被挡则按 CRUISE 规则绕行）；进入 `home` → 删除。`life < −returnGrace (200)` 仍未到 → 原地删除。
- **被动删除**：所在格变为 `!navigable`（填海、修堤道）→ 立即删除；起重机被毁 → `life = min(life, 0)`（提前回港，`home` 仍可航则到港消失，否则按宽限删除）。
- 存档：`label = 出发起重机的格索引 >> 8`（低精度，仅用于重建 `home` 的粗定位；无效 = 0xFF）、`goal = life >> 2`。读档：`home` = 距记录位置最近的栈桥末端；所在格 `!navigable` → 丢弃。

#### 2.12.4 帆船与 Nessie

- **生成**：每月第 24 天（天气判定之后、灾害判定之前）遍历码头 `0xF8`（TL 锚点）：已供电、`anchored(marina) < sailboatsPerMarina = 2`、`sailboats < maxSailboats = 6` → 1/4 概率在"码头 3x3 占地内的水格 ∪ 占地 4 邻水格"（任意深度）中随机一格生成；集合为空则跳过。`home` = 码头锚点。
- **运动**：在 `chebyshev(tile, home) ≤ sailRadius = 3` 且 `isWater` 的格集合内 8 向漫游：直行，前方不在集合内或以 1/4 概率换向；每 `tackEvery = 16` tick 翻转帆的 2 帧精灵。
- **消失**：码头被毁 → 其全部帆船立即删除；码头连续一个月断电（月第 24 天检查时 `!POWERED`）→ 删除；`life == 0` → 删除（允许重生）。
- **Nessie**：生成帆船时若 `home` 附近水格所在的可航区面积 `≥ nessieMinWater = 400` → 以 `nessieChance = 1/64` 把这艘改成 Nessie：`variant = 1`，按货船的 CRUISE 规则在该可航区漫游（不受 `sailRadius` 约束、不受码头断电影响），`life = rng(120..240)`，归零"下潜"删除；全局 ≤ 1；纯彩蛋，不进报纸、不进查询。
- 存档：`variant`（0 / 1）、`goal = life >> 4`、`label = 0`。读档：帆船重新锚定到 4 格内最近的码头，没有则丢弃；Nessie 只要求所在格 `navigable`。

#### 2.12.5 火车与地铁列车

- **结构**：一列 = 3 条 `XTHG` 记录：车头 `0x0A`（`label = 0`）+ 车厢 `0x0B` × 2（`label = 1, 2`）；槽位优先连续分配但不要求连续。运行时 `TrainChain { slots: [h, c1, c2]; history: tile[8]（车头最近经过的格，含当前）; life; dwell; lastStation; underground: boolean }`。
- **生成**：车头放在与被访问车站正交相邻的 `RAIL_SET` 格（多个则 PRNG 选一），`dir` = 该格铁路掩码中任一出口；车厢放在车头**反向**沿轨道 1、2 格处（轨道不足 2 格时与车头同格，随后自然分开）；`history` 用这三格初始化。
- **轨道掩码**：地面用 `conn[t] >> 4`（T R B L 四位，transport §3.2）；地下用 `subway[t] & 0x0F`；地铁站下方 `XUND 0x23` 当作普通通过格。
- **前进**（每 `trainStepTicks = 3` tick 一步；步与步之间 `px/py` 线性插值供渲染，不改 `x/y`）：

```
exits = mask(t) & ~bit(back(dir))
if exits == 0: nextDir = back(dir)                     // 端头折返
elif popcount(exits) == 1: nextDir = theBit
else: nextDir = rng.pick(exits)                       // 道岔随机
if dwell > 0: dwell--; return                         // 停站中
advance: push t' = step(t, nextDir) to history; cars take history[1], history[2]
```

- **地铁 ↔ 铁路转换件** `0x6C–0x6F`：车头在转换件格且 `nextDir` = 转换件朝向的**反向**（朝地下一侧）→ 下一格查 `subway` 掩码（地下），`underground = true`，车头类型改 `0x0C`；每节车厢**各自**在经过转换件格时改 `0x0D`。地下行驶到转换件格下方（`subway` 的 bit7 = 该格有 `0x23`）且 `nextDir` = 转换件朝向 → 回到地面并改回 `0x0A/0x0B`。地下列车只在地下视图渲染；地面视图不显示但仍占槽。`XUND 0x23` 的地铁站格不是转换件，不触发出入地。
- **停站**：车头进入与火车站 `0xED`（地面）或地铁站 `0xE9`（地下，经 `station`）正交相邻的轨道格且该车站 ≠ `lastStation` → `dwell = stationDwellTicks = 12`，`lastStation = 该站`。
- **寿命**：`life` 每步 −1；`life ≤ 0` 后在**下一次停站**时整列删除（"终到"）；`life < −trainOverrun (400)` → 任意处删除。
- **被动删除**：任一节所在格不再属于 `RAIL_SET`（地面）/ 无地铁掩码（地下）——被拆、被龙卷风 / 地震 / 预算衰败毁坏、被洪水淹没 → 整列立即删除（"脱轨"：无灾害、无报纸、无损失，仅 `thingRemoved`）。
- **槽位原子性**：生成需要同时拿到 3 个槽，拿不到就不生成；驱逐（§2.12.6）也按整列进行。
- 存档：每节 `type / dir / x / y / z = 0 / px / py / dx / dy / label = 节序号 / goal = life >> 2`。读档：以 `label == 0`（或第三方存档中第一条 `0x0A/0x0C`）为车头，其后最近的两条 `0x0B/0x0D` 为车厢；重建 `history = [head, c1, c2, ...]`；任一节不在轨道上（含地面 / 地下错位）→ 整列丢弃。

#### 2.12.6 槽位、优先级与写档

- 槽位 `1..39`（记录 0 是头部，file-formats §2.2.10）。槽位类别 `cls`：`0 DisasterPrimary`（龙卷风 / 怪兽 / 风暴眼 / 坠毁中的飞行物）、`1 Dispatch`、`2 Hero`（Maxis Man）、`3 Ambient`（本节全部类型）。爆炸、推土机是**无槽**的运行时动画（`actors[]`），不占 39 个槽位 **[决定：dfloer 称爆炸"可能出现但不一定存档"]**。
- **预留**：槽 39 只给 `DisasterPrimary`（`reservedDisasterSlots = 1`），保证龙卷风 / 怪兽总能生成。
- **上限**：`Ambient` 合计占用 `≤ ambientSlotCap = 24`，为调度单位至少留 14 个槽（dfloer 观察"33 个警消军"是上限而非常态 **[中]**）。
- **驱逐**：需要槽位的请求按 `cls` 升序享有驱逐权：`Dispatch` / `Hero` / `DisasterPrimary` 在槽满时驱逐 `spawnTick` 最小的 `Ambient`（列车整列，释放 3 槽，取其中 1 个）；`Ambient` 永不驱逐任何物件（满则本次不生成，静默）；任何类别都不驱逐 `Dispatch` 与 `DisasterPrimary`。驱逐发 `thingRemoved(slot, type, reason = 'evicted')`。
- **写档**：`XTHG` 记录 1..39 按槽位写；`Hero` 与无槽动画在写档前删除（§3.10）；`XTXT` 物件指针按 §2.5.1 第 3 步合成（标签优先于指针 **[低：原版次序未知]**）。写出的 `type` 只允许 `{1,2,3,5,7,8,9,A,B,C,D,E,F}`；其他运行时类型（`0x04/0x06/0x10`）不透传（file-formats §4.22）。
- **读档**：`XTHG` 逐条读入，按 §2.12.2–§2.12.5 的"读档"规则校验并复活；校验失败的记录丢弃并记诊断 `thingDropped(slot, type, reason)`；`0x04/0x06/0x10` 与未知类型直接丢弃；灾害类型（`0x05/0x0F`）按 §2.6 / §4.8 规则复活。

#### 2.12.7 推土机动画

玩家使用推土机工具（含灾害模式下开防火带、拆瓦砾）在每个被拆的格上生成一个 `Bulldozer` 动画（4 帧、`bulldozerTicks = 6`），纯视觉：不占槽、不存档、不影响模拟；拖动连拆时每格一个，同时存在上限 `maxBulldozers = 16`（多余的不播）。导入第三方存档时 `XTHG` 中的 `type = 4` 直接丢弃。

### 2.13 情景目标评估（Scenario Goals）[字段 高 / 比较源 中 / 时点与胜负流程 低]

file-formats §2.5.2 给出 `SCEN` 的字段；本节定义其语义。情景文件 `.SCN` 读入后城市与普通城市无异，只是多了一个 `ScenarioState`。

#### 2.13.1 数据结构

```ts
export interface ScenarioGoals {
  timeLimitMonths: number;                                   // SCEN 0x08；0 = 无时限（只会赢不会输）[低]
  min: { citySize: number; resPop: number; comPop: number; indPop: number; cash: number; landValue: number };  // 0 = 不检查
  max: { pollution: number; crime: number; traffic: number }; // 0 = 不检查
  buildings: ReadonlyArray<{ xbld: number; tiles: number }>; // 最多 2 项；xbld == 0 || tiles == 0 ⇒ 不检查
}
export interface ScenarioState {
  goals: ScenarioGoals;
  disaster: DisasterKind; dx: number; dy: number;            // SCEN 0x04..0x07
  startDay: number;                                          // 读入时 cityDays − cityDays % 25（对齐到当月月初）
  disasterFired: boolean;
  result: 'none' | 'won' | 'lost';
  lastEval: { month: number; met: boolean[]; allMet: boolean } | null;   // 情景目标窗口显示
}
```

`parseScen(bytes)` / `writeScen(state)` 按 file-formats §2.5.2 的大端布局实现，由本模块提供给 file-formats 调用。

#### 2.13.2 每项的比较源与方向

"目标"（`min.*`、建筑）为 `value ≥ goal`，"上限"（`max.*`）为 `value ≤ limit`；`strictCompare = false`（改为 `>` / `<` 的开关，dfloer 原文用 "above / below"，差一无实质影响）**[低]**。**0 = 不检查**（dfloer 的目标字段在未用时为 0，原装情景也只填部分字段）**[中]**。

| 项 | 比较源（运行时值 = 写入 `MISC` 的同一个数） | 方向 | 说明 |
|---|---|---|---|
| `min.citySize` | `normalPop`（`MISC 0x102C`，**不含 Arcology**） | ≥ | dfloer："against the normal city population without arcos" **[高]**；与状态栏 `citySize`（含 arco）**不同** |
| `min.resPop` | `resPop`（`MISC 0x0074`） | ≥ | |
| `min.comPop` / `min.indPop` | `census.comPop / indPop`（zones §3.1；`MISC` 无独立字段） | ≥ | 第三方存档读入后首次评估前需经过一次第 21 天人口统计，之前按 0 处理 |
| `min.cash` | `funds`（`MISC 0x0014`，**不扣债券**） | ≥ | economy §4.20 **[高]** |
| `min.landValue` | `landValueSum = Σ XVAL`（`MISC 0x0028`） | ≥ | 原值，不做图表的 3,200 缩放 |
| `max.pollution` | `Σ XPLT`（`MISC 0x0034`） | ≤ | economy §2.14 的 "Pollution" 序列同源 |
| `max.crime` | `crimeCount = Σ XCRM`（`MISC 0x002C`） | ≤ | 原值 |
| `max.traffic` | `trafficCount`（`MISC 0x0030`，第 19 天衰减后的和） | ≤ | services Q4 的口径 |
| `buildings[k]` | `tileCounts[xbld]`（`MISC 0x01F0 + 4·xbld`，**按格数**） | ≥ | dfloer："a single 4x4 building would require 16 tiles"；因此目标 "1 座体育场" 在文件里写 `tiles = 16` |

#### 2.13.3 评估时点

- 每月第 22 天，在 services 的里程碑检查之后、economy 的破产检查之前（services §2.1 日程表："22 | 里程碑 → 情景目标 → 破产"）。此时第 2 天的图层和（地价 / 污染 / 犯罪）、第 19 天的交通和、第 21 天的人口统计都已是本月值；`funds` 为月结前的值。
- `month = floor((cityDays − startDay) / 25)`（0 = 读入当月）。灾害模式冻结日历，因此灾害期间不消耗情景月数（§2.2.1）。
- `deadline = timeLimitMonths − 1`（最后一次有效评估的月序号）；`timeLimitMonths == 0` ⇒ 无 deadline。
- `result ≠ 'none'` 后不再评估（窗口仍可查看 `lastEval`）。

#### 2.13.4 胜负

```
evaluate():
  met = [...]  // 按 §2.13.2 逐项；不检查的项记 true
  allMet = met.every()
  lastEval = { month, met, allMet }; emit scenarioEvaluated(month, met)
  if allMet: result = 'won'; emit scenarioWon; ui.modal('scenario-won')            // 一次性
  elif deadline != null && month >= deadline: result = 'lost'; emit scenarioLost; ui.modal('scenario-lost')
```

- 胜 / 负都只触发一次；之后城市**继续沙盒游玩**（economy §2.11 同口径），不回主菜单、不锁操作。
- 报纸：胜 → `newsStory(GROWTH, progression)` 风格的号外由 UI 用原创"情景完成"模板直接弹出（不入故事池）；负 → 同理"情景失败"。两者都不占 §2.10.2 的类型号。
- 原版在胜利后仍继续计时 / 不会再判负 **[中]**；本规格同。

#### 2.13.5 情景灾害

`SCEN.disaster / dx / dy` 的触发在 §2.3.2：读入后第一个引擎 tick `startDisaster(disaster)`，原点 `(dx, dy)`；无视宽限期与"无灾害"；`disasterFired = true`。情景灾害结束后的所有后续灾害走普通随机 / 菜单规则。

#### 2.13.6 存档往返

- `result == 'none'` 时写 `SCEN`：`disaster = disasterFired ? 0 : disaster`，`timeLimitMonths = timeLimitMonths == 0 ? 0 : timeLimitMonths − month`（≥ 1 恒成立：判负发生在 `month == deadline` 的第 22 天，之后 `result` 已非 none），其余字段原样；`TEXT / PICT` 原样透传。读入时 `startDay` 重新对齐到当月月初，所以"剩余 N 个月"的语义在往返后不变。
- `result != 'none'` 时**不写**情景 chunk（城市已是沙盒）；`.SC2` 扩展名由 UI 决定。
- `ScenarioState` 的其余运行时字段不存档。

---

## 3. 数据结构与算法建议

### 3.1 TypeScript 接口

```ts
export const enum DisasterKind {
  None = 0, Fire = 1, Flood = 2, Riot = 3, ToxicSpill = 4, AirCrashLegacy = 5,
  Earthquake = 6, Tornado = 7, Monster = 8, Meltdown = 9, Microwave = 10,
  Volcano = 11, Firestorm = 12, MassRiots = 13, MassFloods = 14, Pollution = 15,
  Hurricane = 16, HelicopterCrash = 17, PlaneCrash = 18,
}
export const enum WeatherTrend {
  Cold = 0, Clear, Hot, Foggy, Chilly, Overcast, Snow, Rain, Windy, Blizzard, Hurricane, Tornado,
}
export const enum Season { Winter = 0, Spring, Summer, Autumn }
export const enum CityMode { TerrainEdit = 0, City = 1, Disaster = 2 }
export const enum TileMarker { None = 0, ToxicCloud = 0xfb, Flood = 0xfc, Rioters = 0xfd, MassRioters = 0xfe, Fire = 0xff }
export const enum ThingType {
  None = 0, Airplane, Helicopter, CargoShip, Bulldozer, Monster, Explosion, DeployPolice,
  DeployFire, Sailboat, TrainEngine, TrainCar, SubwayEngine, SubwayCar, DeployMilitary,
  Tornado, MaxisMan,
}
export const enum DispatchKind { Police = 0, Fire = 1, Military = 2 }

export interface WeatherState { heat: number; wind: number; humid: number; trend: WeatherTrend; season: Season }

/** XTHG 12 字节记录（存档布局），记录 0 为头部（file-formats §2.2.10），槽位 1..39 可用 */
export interface ThingRecord {
  type: ThingType; dir: number /*0..7*/; variant: number; x: number; y: number; z: number;
  px: number; py: number /*0..15，1/16 格*/; dx: number; dy: number /*int8，1/16 格 / tick*/; label: number; goal: number;
}
export const enum ThingClass { DisasterPrimary = 0, Dispatch = 1, Hero = 2, Ambient = 3 }
export const enum ThingPhase { Climb = 0, Cruise, Patrol, Hover, Return, Leave, Crashing }
/** 有槽物件的运行时扩展（不存档）；灾害主物件 / 调度 / 英雄 / 常驻物件共用 */
export interface ThingRuntime {
  slot: number; cls: ThingClass; rec: ThingRecord;
  phase: ThingPhase; life: number; spawnTick: number;
  home: number /*tile*/; target: number /*tile*/; region: number /*可航区号，船*/;
  chain: TrainChain | null; kind: DisasterKind /*DisasterPrimary 用*/; radius: number;
}
export interface TrainChain { slots: [number, number, number]; history: number[] /*≤ 8 格*/; dwell: number; lastStation: number; underground: boolean }
/** 无槽动画（爆炸、推土机） */
export interface FxActor { type: ThingType.Explosion | ThingType.Bulldozer; tile: number; frames: number }

export interface ThingsApi {
  step(): void;                                                         // 每个物件 tick（城市 / 灾害模式都调）
  trySpawnAircraft(runwayTile: number): void;                           // services 生长扫描访问跑道格时调用（已含 1/30 判定）
  trySpawnShip(craneTile: number): void;                                // 访问起重机格时（已含 1/4 判定）
  trySpawnTrain(depotTile: number): void;                               // 访问火车站时（已含 1/4 与 depots÷4 判定）
  monthlySailboats(): void;                                             // 每月第 24 天
  acquireSlot(cls: ThingClass, count?: number): number[] | null;        // 含驱逐规则 §2.12.6
  release(slot: number, reason: 'landed' | 'docked' | 'expired' | 'derailed' | 'evicted' | 'crashed' | 'unsupported'): void;
  aircraftInFlight(): ThingRuntime[]; helicoptersInFlight(): ThingRuntime[];
  thingsAt(tile: number): ReadonlyArray<ThingRuntime>;
  onTerrainChanged(tile: number): void;                                 // 置 navRegionDirty；检查承载条件
  writeRecords(): Uint8Array /*480*/; composeXtxtPointers(xtxtOut: Uint8Array): void;
  rebuild(xthg: Uint8Array, diag: Diagnostic[]): void;
}

export interface ScenarioApi {
  load(scen: Uint8Array, cityDays: number): ScenarioState;              // parseScen + startDay 对齐
  evaluate(inputs: ScenarioInputs): void;                               // 每月第 22 天
  write(): Uint8Array | null;                                           // §2.13.6；result != none 时返回 null
}
export interface ScenarioInputs { normalPop: number; resPop: number; comPop: number; indPop: number; funds: number; landValueSum: number; pollutionSum: number; crimeCount: number; trafficCount: number; tileCounts: Uint32Array /*256*/ }

export interface DisasterSettings { noDisasters: boolean; autoGoto: boolean; extraNewspaper: boolean; subscription: boolean; paperChoice: number }

export interface DisasterState {
  mode: CityMode;
  pending: DisasterKind;            // wSetTriggerDisasterType
  current: DisasterKind;            // MISC 0x0070
  active: boolean;                  // MISC 0x1048
  point: { x: number; y: number };  // disasterPoint
  idleTicks: number;
  flood: { area: number; alt: number; phase: 'none' | 'grow' | 'hold' | 'recede'; phaseTicks: number; seeds: number[] };
  quake: { shakeTicks: number; magnitude: number };
  volcano: { tick: number; cx: number; cy: number } | null;
  windOverride: number | null;      // wDisasterWindy
  deaths: number; destroyedTiles: number;
  marker: Uint8Array;               // 16384，TileMarker；运行时唯一的灾害标记来源，写档时合成进 XTXT（§2.5.1）
  fuel: Uint8Array;                 // 16384，marker[i]==Fire 时有效
  cloudLife: Uint8Array; cloudDir: Uint8Array;   // marker[i]==ToxicCloud
  riotLife: Uint8Array;             // marker[i]==Rioters/MassRioters
  things: (ThingRuntime | null)[];  // 40，索引 = 槽位；[0] 恒 null
  fx: FxActor[];                    // 无槽动画
  dispatched: Record<DispatchKind, number[]>;    // 槽位列表，按放置顺序
  scenario: ScenarioState | null;
}
export interface XtxtShadowEntry { tile: number; label: number }       // 侧表条目，MISC 0x10BC..0x12BB，≤ 168 条

export interface TechState { invented: Int16Array /*17*/; announced: Uint8Array /*17*/ }

export interface NewsStory { type: NewsType; value: number; score: number; createdDay: number }
export interface NewsState { pool: NewsStory[]; lastIssued: Int32Array /*67，上次入池日*/; papers: PaperDef[]; paperChoice: number }

export interface DisasterApi {
  requestDisaster(kind: DisasterKind, point?: { x: number; y: number }): void;   // 菜单 / 情景 / 调试
  tick(): void;                                                                    // 每个灾害 tick
  monthlyCheck(): void;                                                            // 每月第 24 天
  placeDispatch(kind: DispatchKind, x: number, y: number): boolean;
  destroyStructure(x: number, y: number, cause: DisasterKind | 'PLANT_EOL' | 'BRIDGE' | 'DECAY' | 'LAUNCH'): void;
  focusPoints(): ReadonlyArray<{ x: number; y: number }>;                         // 红箭头循环
}
```

### 3.2 参数表（直接落代码的默认值）

```ts
export const DISASTER_TUNING = {
  tickIntervalMs: { 1: Infinity, 2: 200, 3: 100, 4: 50, 5: 25 } as Record<number, number>, // 按 MISC 0x0FEC 速度档
  maxDisasterTicks: 2000,
  graceDays: { 1: 2400, 2: 1500, 3: 750 }, monthlyChance: { 1: 1 / 96, 2: 1 / 60, 3: 1 / 36 },
  weights: { Fire: 30, Flood: 12, Riot: 8, Earthquake: 8, Tornado: 10, Monster: 5, PlaneCrash: 8, HelicopterCrash: 2, Hurricane: 8, Meltdown: 3, Microwave: 3 },
  planeCrashIgnoresNoDisasters: false, helicopterCrashOnCollision: true,
  fire: { spreadBase: 0.06, minSpread: 0.004, coverageDivisor: 320, extinguishPerCoverage: 0.08, dispatchExtinguish: 0.5, diagonalFactor: 0.5,
          fuel: { rubble: 6, trees: 8, s1: 10, s2: 12, s3: 16, s4: 20 }, fuelFactor: { trees: 1.4, rubble: 0.6, s1: 1.0, s2: 1.1, s3: 1.2, s4: 1.2 } },
  flood: { growTicks: 40, holdTicks: 20, recedeTicks: 40, spread: 0.5, maxTiles: [48, 96], massMaxTiles: [200, 300], massSeeds: 6, hurricaneMaxTiles: 150, destroysInfrastructure: false },
  riot: { life: [40, 80], damage: 1 / 6, arson: 1 / 8, spawn: 1 / 16, maxGroups: 12, massGroups: 8, massMaxGroups: 24, policeDisperseThreshold: 160, spawnExcludeCoverage: 128 },
  tornado: { life: [60, 120], jitter: 1 / 3, destroyBuilding: 0.75, destroyInfra: 0.5, destroyTrees: 0.5 },
  quake: { shakeTicks: 12, perMagnitude: 0.02, magnitudeBase: 4.5, fireChance: 0.4, undergroundChance: 0.5, bridgeFactor: 1.5, infraFactor: 0.5 },
  monster: { life: [120, 240], seekChance: 0.6, crush: 0.5, ignite: 0.3, rayIgnite: 0.1, militaryRadius: 2, militaryDrain: 10, heroChance: 1 / 400 },
  meltdown: { ringRadius: 3, ringChance: 0.6, fireRadius: 5, fireChance: 0.3 },
  crash: { planeRing: 0.6, heliRing: 0.3, ignite: 0.5 },
  hurricane: { radius: 4, life: 200, stepEvery: 2, destroy: 0.25, infraFactor: 0.4, windOverride: 200, floodReach: 12, coastDistance: 6 },
  microwave: { radius: 8, ringIgnite: 0.7 },
  firestorm: { seeds: [12, 24], spreadFactor: 1.5, windOverride: 200 },
  toxic: { clouds: 2, pollutionClouds: 6, life: [80, 160], turnEvery: 8, stepEvery: 2, pollutionAdd: 32, dissipate: 20 },
  volcano: { radius: 6, growTicks: 24, peakRaise: 12, lavaSeeds: [8, 12], spreadFactor: 1.5 },
  dispatch: { radius: 1, military: { 0: 0, 1: 0, 2: 4, 3: 3, 4: 3, 5: 2 } },
  radioactiveDecayPerYear: 0.01, deathsPerZoneTile: [0, 3],
  planeCrashSpawnsIfNone: true, crashDelayTicks: 20, crashFallPerTick: 4,
} as const;

export const THINGS_TUNING = {
  slots: { reservedDisasterSlots: 1, ambientSlotCap: 24 },
  aircraft: { maxAirplanes: 3, maxHelicopters: 2, speed: { airplane: 8, helicopter: 4 }, zCruise: { airplane: 12, helicopter: 6 },
              life: { airplane: [300, 600], helicopter: [200, 400] }, turnEvery: 24, turnChance: 0.5, edgeMargin: 4, descendRadius: 8,
              trafficReportThreshold: 96, hoverTicks: 40, reportCooldownTicks: 300 },
  ship:     { maxShips: 4, speed: 2, life: [400, 800], turnChance: 1 / 6, minNavigableTiles: 30, returnGrace: 200, drawbridgeRadius: 2 },
  sailboat: { perMarina: 2, maxSailboats: 6, spawnChance: 0.25, speed: 1, life: [1500, 3000], sailRadius: 3, tackEvery: 16, turnChance: 0.25,
              nessieChance: 1 / 64, nessieMinWater: 400, nessieSpeed: 2, nessieLife: [120, 240] },
  train:    { stepTicks: 3, life: [400, 800], stationDwellTicks: 12, overrun: 400, historyLen: 8 },
  fx:       { bulldozerTicks: 6, maxBulldozers: 16, explosionFrames: 3 },
} as const;

export const SCENARIO_TUNING = { strictCompare: false, evaluateDay: 22 } as const;
```

### 3.3 主状态机伪代码

```
monthlyCheck():                                   // 每月第 24 天，日历仍在城市模式
  weather = generateWeather(nextMonth)            // §2.4.3
  emit weatherChanged
  evaluateMonthlyNewsChecks()                     // §2.10.2 的 16–21、61–66
  if settings.noDisasters || active: return
  if cityDays < graceDays[difficulty]: return
  if rng.float() >= monthlyChance[difficulty]: return
  kind = sampleKind(eligibleKinds())              // §2.3.3
  if kind != None: pending = kind

requestDisaster(kind, point?):                    // 菜单 / 情景 / 调试
  if kind == Hurricane && !hasOcean: emit message; return
  pending = kind; if point: this.point = point

engineTick():
  if mode == City && !paused:
      sim.processTick()                           // 日历日程里：第 22 天 services.checkMilestones() → scenario.evaluate() → economy 破产检查
      things.step()                               // §3.7 常驻物件在城市模式也运动
      if pending: startDisaster(pending)
      else if !active: cleanupDeploys()
  else if mode == Disaster && !paused:
      if pending: startDisaster(pending)          // 叠加
      things.step()
      disasterTick()

startDisaster(kind):
  pending = None; current = kind; active = true; mode = Disaster; idleTicks = 0
  choose point if not given (§2.3.3 原点列)
  switch kind:  Fire → ignite(point) | Flood → seedFlood([point]) | MassFloods → seedFlood(k seeds)
    Riot → spawnRiot(point, 1) | MassRiots → spawnRiot(k points, mass) | Tornado → spawnActor(Tornado, edge)
    Monster → spawnActor(Monster, edge, target = cityCenter) | Earthquake → quakeOnce()
    PlaneCrash → a = rng.pick(things.aircraftInFlight()) ?? (planeCrashSpawnsIfNone ? spawnOnDemand(randomPoweredRunway()) : null)
                 if !a: active = false; mode = City; emit message('no-airport'); return
                 a.cls = DisasterPrimary; a.phase = Crashing after crashDelayTicks (0 if already in flight)
    HelicopterCrash → h = rng.pick(things.helicoptersInFlight()); if !h: 同上失败退出; h.phase = Crashing
    Hurricane → spawnActor(Storm, seaEdge); windOverride = 200
    Meltdown → meltdown(plant) | Microwave → beamMiss(plant) | Firestorm → ignite(seeds); windOverride = 200
    ToxicSpill/Pollution → spawnClouds(n) | Volcano → volcano = {tick: 0, ...}
  if settings.autoGoto: view.center(point)
  audio.loopSiren(); emit disasterStarted(kind, point)

disasterTick():                                    // 固定顺序，保证 PRNG 可复现
  idleTicks++
  1. stepActors()        // 龙卷风、怪兽、风暴眼、英雄、爆炸帧递减
  2. stepClouds()
  3. stepRiots()
  4. stepFire()          // 先扑灭判定，再蔓延，再燃尽
  5. stepFlood()
  6. stepVolcano(); stepQuakeShake()
  7. if idleTicks >= maxDisasterTicks: forceClear()
  8. if nothingActive(): endDisaster()

endDisaster():
  cleanupDeploys(); active = false; mode = City; windOverride = null; audio.stopSiren()
  news.push(disasterNewsType(current), min(deaths, 255)); if settings.extraNewspaper: ui.openPaper(extra = true)
  deaths = 0; destroyedTiles = 0; emit disasterEnded(current)
```

### 3.4 火、洪水、物件步进伪代码

```
stepFire():
  burning = tilesWithMarker(Fire)                  // 按 (y, x) 升序遍历
  for t in burning:
      q = quarterCell(t)
      pExt = XFIR[q] / 255 * extinguishPerCoverage + (dispatchWithin(t, Fire|Military, radius) ? dispatchExtinguish : 0)
      if rng.float() < pExt: clearMarker(t); continue
  for t in tilesWithMarker(Fire):                  // 蔓延用本 tick 开始时的集合
      for n in neighbors8(t):
          if !flammable(n) || marker(n) == Fire || protectedByDispatch(n): continue
          p = spreadBase * fireFactor * (1 + wind / 255) * fuelFactor(n) * (1 - XFIR[quarterCell(n)] / coverageDivisor)
          if diagonal: p *= diagonalFactor
          if rng.float() < max(p, minSpread): ignite(n)
  for t in tilesWithMarker(Fire):
      if --fuel[t] == 0:
          if XBLD[t] is rubble: clearMarker(t)
          else: destroyStructure(t, Fire); fuel[t] = fuel.rubble   // 瓦砾继续烧

ignite(t): setMarker(t, Fire); fuel[t] = fuelFor(XBLD[t])

stepFlood():
  switch flood.phase:
    grow:   frontier = floodTiles with a dry 4-neighbor
            for t in frontier: for n in neighbors4(t):
                if isLand(n) && alt(n) <= flood.alt + 1 && !protectedByDispatch(n) && flood.area < flood.max && rng.float() < spread:
                    setMarker(n, Flood); flood.area++
                    if XBLD[n] >= 0x70 || isPowerLine(n): destroyStructure(n, Flood)
            if ++phaseTicks >= growTicks: phase = hold
    hold:   if ++phaseTicks >= growTicks + holdTicks: phase = recede
    recede: remove ceil(area / 40) farthest markers (dispatch 3x3 内的优先); if area == 0: phase = none

stepActors():
  for a in actors:
    switch a.kind:
      Tornado:  if rng.float() < jitter: dir = (dir + rng.pick(-1, +1)) & 7
                move 1; damageUnder(tornado probs); crashAircraftAt(a.x, a.y); if offMap || --life <= 0: remove
      Monster:  dir = (rng.float() < seekChance && !reachedCenter) ? toward(target) : rng.int(8)
                if militaryWithin(a, militaryRadius): life -= militaryDrain * count; dir = awayFrom(nearestUnit)
                move 1; crush/ignite under; ray ignite 3x3; if offMap || --life <= 0: remove
      Storm:    every stepEvery ticks move 1 toward inland dir ± jitter
                for tiles within radius: p = destroy * (1 - d / (radius + 1)) * classFactor; destroyStructure if hit
                floodCoast(within floodReach); if offMap || --life <= 0: remove; flood.phase = recede
      Hero:     move toward monster; if adjacent: monster.life = min(monster.life, 10)
      Explosion: if --life <= 0: remove                      // 3 帧
  // 龙卷风 / 怪兽移动后：for a in things.thingsAt(tile): if a.type in {Airplane, Helicopter} && a.phase != Crashing: a.cls = DisasterPrimary; a.phase = Crashing
```

### 3.5 天气生成伪代码

```
generateWeather(month):
  season = SEASON_OF_MONTH[month]                       // [冬,冬,春,春,春,夏,夏,夏,秋,秋,秋,冬]
  row = WEIGHTS[season].clone(); if !hasOcean: row[Windy] += row[Hurricane], row[Hurricane] = 0
  trend = weightedPick(row, rng)
  f = BASE_F[month] + rng.int(-8, 8) + TREND_DELTA[trend]; heat = 100 + clamp(f, 0, 120)
  wind = clamp(WIND_BASE[trend] + rng.int(-WIND_JIT[trend], WIND_JIT[trend]), 0, 255)
  humid = clamp(RAIN_BASE[trend] + rng.int(-RAIN_JIT[trend], RAIN_JIT[trend]), 0, 255)
  return { heat, wind, humid, trend, season }
```

### 3.6 科技与报纸伪代码

```
rollInventions(startYear):  for i in 0..16: y = BASE_YEAR[i] + rng.int(20); invented[i] = y < startYear ? 0 : y; announced[i] = invented[i] == 0

onNewYear(year):            for i in 0..15: if !announced[i] && year >= invented[i]:
                                announced[i] = 1; news.push(i <= 11 ? INVENTION : INNOVATION, i); toolbar.refresh()

news.push(type, value):
  if cityDays - lastIssued[type] < cooldown[type] * 25 && cooldown[type] > 0: return
  lastIssued[type] = cityDays; pool.push({ type, value, score: power[type], createdDay: cityDays })
  if settings.extraNewspaper && EXTRA_TYPES.has(type): ui.openPaper(compose(paperChoice, headline = thisStory))

news.monthly():             for s in pool: s.score -= decay[s.type]; pool = pool.filter(s => s.score > 0)

onMonthStart(month):        if settings.subscription && (month == 3 || month == 7): ui.openPaper(compose(paperChoice))

compose(paper):             sort pool by score desc; headline = pool[0] ?? JUNK; body = next 2..3 stories (不同类型)
                            + WEATHER + MISSIM + (teams ? SPORTS) + fillers until 5 条; 填充 token（文本规格规则）
                            消费掉已刊出的故事（从池中移除）
```

### 3.7 常驻物件伪代码（§2.12）

```
things.step():                                     // 槽位升序；每个物件一步
  if navRegionDirty: rebuildNavRegions()
  thingAt.clear()
  for slot in 1..39: t = things[slot]; if !t || t.cls != Ambient: continue
    switch t.rec.type:
      Airplane, Helicopter: stepAircraft(t)
      CargoShip:            stepShip(t)
      Sailboat:             t.rec.variant ? stepShip(t, nessie = true) : stepSailboat(t)
      TrainEngine, SubwayEngine: stepTrain(t.chain)          // 车厢由车头带动，自己不步进
    if things[slot]: thingAt.add(t.rec.tile, slot)
  for f in fx: if --f.frames <= 0: remove f

moveSub(t, speed):                                 // 以 1/16 格为单位沿 dir 前进，返回是否进入了新格
  (ux, uy) = DIR8[t.rec.dir]; t.rec.px += ux * speed; t.rec.py += uy * speed
  entered = false
  while t.rec.px > 15: t.rec.px -= 16; t.rec.x++; entered = true      // 同理 < 0 / py
  clamp to map: if x out of 0..127: x = clamp; px = 0; return 'edge'
  t.rec.dx = ux * speed; t.rec.dy = uy * speed
  return entered

stepAircraft(t):
  A = THINGS_TUNING.aircraft; heli = t.rec.type == Helicopter
  switch t.phase:
    Climb:    if moveSub(t, speed) == 'edge': t.rec.dir = towardCenter(t)
              if ++t.rec.z >= zCruise: t.phase = heli ? Patrol : Cruise
    Cruise:   if --t.life <= 0: t.phase = Return; t.target = pickRunway(t.home) ?? -1; if t.target < 0: t.phase = Leave
              if nearEdge(t, edgeMargin) || moveSub(t, speed) == 'edge': t.rec.dir = towardCenter(t)
              elif tick % turnEvery == 0 && rng.float() < turnChance: t.rec.dir = (t.rec.dir + rng.pick(-1, 1)) & 7
    Patrol:   if --t.life <= 0: t.phase = Return; t.target = pickRunwayOrTarmac(t.home) ?? -1; ...
              t.rec.dir = greedy8(t, t.target); moveSub(t, speed)
              if t.rec.tile == t.target: t.phase = Hover; t.hover = hoverTicks; maybeEmitReport(t)
    Hover:    jitter px/py ±1; if --t.hover <= 0: t.phase = Patrol; t.target = pickTrafficTarget()
    Return:   t.rec.dir = greedy8(t, t.target); moveSub(t, speed)
              if cheb(t, t.target) <= descendRadius: t.rec.z = max(0, t.rec.z - 2)
              if t.rec.tile == t.target && t.rec.z == 0: release(t.slot, 'landed')
    Leave:    if moveSub(t, speed) == 'edge': release(t.slot, 'landed')
    Crashing: t.rec.z -= crashFallPerTick; if t.rec.z <= 0: crashAt(t.rec.tile, heli); release(t.slot, 'crashed')

stepShip(t, nessie = false):
  S = THINGS_TUNING.ship; speed = nessie ? sailboat.nessieSpeed : S.speed
  if !nessie && --t.life <= 0 && t.phase != Return: t.phase = Return
  if nessie && --t.life <= 0: release(t.slot, 'expired'); return
  if t.phase == Return && t.rec.tile == t.home: release(t.slot, 'docked'); return
  if t.phase == Return && t.life < -S.returnGrace: release(t.slot, 'expired'); return
  r = moveSub(t, speed)
  if r == 'edge' || r == true:
      if !navigable(t.rec.tile) || navRegion[t.rec.tile] != t.region: release(t.slot, 'unsupported'); return
      ahead = step(t.rec.tile, t.rec.dir)
      want = t.phase == Return ? greedy8(t, t.home) : t.rec.dir
      if r == 'edge' || !ok(ahead) || rng.float() < S.turnChance || want != t.rec.dir:
          cands = [d for d in 0..7 if ok(step(t.rec.tile, d)) && d != back(t.rec.dir)]
          if t.phase == Return && ok(step(t.rec.tile, want)): t.rec.dir = want
          else t.rec.dir = cands.length ? rng.pick(cands) : back(t.rec.dir)
  updateDrawbridges(t)                               // 距离 ≤ drawbridgeRadius 的开启桥 raised = true
  where ok(q) = inMap(q) && navigable(q) && navRegion[q] == t.region

stepSailboat(t):
  B = THINGS_TUNING.sailboat
  if --t.life <= 0: release(t.slot, 'expired'); return
  r = moveSub(t, B.speed)
  if r != false:
      ahead = step(t.rec.tile, t.rec.dir)
      if r == 'edge' || !inSail(ahead) || rng.float() < B.turnChance:
          cands = [d for d in 0..7 if inSail(step(t.rec.tile, d))]; t.rec.dir = cands.length ? rng.pick(cands) : back(t.rec.dir)
  where inSail(q) = inMap(q) && isWater(q) && cheb(q, t.home) <= B.sailRadius

stepTrain(ch):
  head = things[ch.slots[0]]
  if ++head.stepAcc < train.stepTicks: interpolate px/py; return
  head.stepAcc = 0
  if ch.dwell > 0: ch.dwell--; return
  if head.life <= -train.overrun: releaseChain(ch, 'expired'); return
  t = head.rec.tile; m = ch.underground ? subway[t] & 0x0F : conn[t] >> 4
  exits = m & ~bit(back(head.rec.dir))
  nextDir = exits == 0 ? back(head.rec.dir) : popcount(exits) == 1 ? only(exits) : rng.pick(bits(exits))
  // 转换件
  if !ch.underground && isSubRail(XBLD[t]) && nextDir == back(facing(XBLD[t])): ch.underground = true; retype(ch, Subway)
  if ch.underground && (subway[t] & 0x80) && nextDir == facing(XBLD[t]): ch.underground = false; retype(ch, Rail)
  t2 = step(t, nextDir)
  if !supports(t2, ch.underground): releaseChain(ch, 'derailed'); return
  ch.history.unshift(t2); ch.history.length = min(ch.history.length, train.historyLen)
  head.rec.tile = t2; head.rec.dir = nextDir; head.life--
  for k in 1..2: car = things[ch.slots[k]]; car.rec.tile = ch.history[k] ?? t2; car.rec.dir = dirBetween(ch.history[k + 1], ch.history[k])
      if !supports(car.rec.tile, ch.underground): releaseChain(ch, 'derailed'); return
  st = adjacentStation(t2, ch.underground)
  if st >= 0 && st != ch.lastStation: ch.lastStation = st; ch.dwell = train.stationDwellTicks
      if head.life <= 0: releaseChain(ch, 'expired')          // "终到"
  where supports(q, ug) = ug ? (subway[q] & 0x0F) != 0 : (net[q] & Rail) != 0

acquireSlot(cls, count = 1):
  free = freeSlots(excluding slot 39 unless cls == DisasterPrimary)
  if cls == Ambient && ambientCount + count > ambientSlotCap: return null
  while free.length < count && cls < Ambient:
      victim = oldest Ambient (by spawnTick; train → whole chain); if !victim: break
      release(victim, 'evicted'); free = freeSlots(...)
  return free.length >= count ? free.slice(0, count) : null
```

### 3.8 情景评估伪代码（§2.13）

```
scenario.load(bytes, cityDays):
  s = parseScen(bytes); startDay = cityDays - cityDays % 25; disasterFired = false; result = 'none'
  if s.disaster != 0: disasters.requestDisaster(s.disaster, { x: s.dx, y: s.dy }); disasterFired = true   // 第一个 tick 触发

scenario.evaluate(in):                                // 每月第 22 天，里程碑之后
  if result != 'none': return
  month = floor((cityDays - startDay) / 25)
  ge = (v, g) => g == 0 || (strict ? v > g : v >= g); le = (v, l) => l == 0 || (strict ? v < l : v <= l)
  met = [ ge(in.normalPop, min.citySize), ge(in.resPop, min.resPop), ge(in.comPop, min.comPop), ge(in.indPop, min.indPop),
          ge(in.funds, min.cash), ge(in.landValueSum, min.landValue),
          le(in.pollutionSum, max.pollution), le(in.crimeCount, max.crime), le(in.trafficCount, max.traffic),
          ...buildings.map(b => b.xbld == 0 || b.tiles == 0 || in.tileCounts[b.xbld] >= b.tiles) ]
  allMet = met.every(x => x); lastEval = { month, met, allMet }; emit scenarioEvaluated(month, met)
  if allMet: result = 'won'; emit scenarioWon
  elif timeLimitMonths > 0 && month >= timeLimitMonths - 1: result = 'lost'; emit scenarioLost

scenario.write():
  if result != 'none': return null
  out = clone(goals); out.disaster = disasterFired ? 0 : disaster
  out.timeLimitMonths = timeLimitMonths == 0 ? 0 : timeLimitMonths - floor((cityDays - startDay) / 25)
  return serializeScen(out)
```

### 3.9 `XTXT` 合成与恢复伪代码

见 §2.5.1 第 3、4 条（写档 `composeXtxt()` 与读档 `restoreXtxt()`）；调用顺序：读档 = file-formats 解包 → `disasters.rebuild()`（标记剥离 + 侧表 + 占地补全 + 共享标签）→ `transport.rebuildFromSave()`（`0xFA`）→ `services.rebuild()`（`XMIC` 绑定；本模块的 `restoreByXmic()` 在其之前作为兜底跑一次）→ `things.rebuild()`；写档 = `things.writeRecords()` → `composeXtxt()`（含物件指针与标记）→ `writeShadow()` → `scenario.write()` → file-formats 打包。

### 3.10 存档映射

| 数据 | 位置 | 读 / 写 |
|---|---|---|
| 城市模式 | `MISC 0x0004` | 读档为 2 时直接进入灾害模式并重建运行时计时器 |
| 当前灾害 / 进行中 | `MISC 0x0070` / `0x1048` | 原样 |
| 待触发 | `MISC 0x1040` **[低]** | 写 `pending`；读档时若非 0 则下一 tick 触发 |
| 无灾害 / 自动跳转 | `MISC 0x1000` / `0x0FF4` | 原样 |
| 天气四元组 | `MISC 0x0060..0x006C` | 原样（飓风期间写被覆盖前的 `wind`） |
| 发明年份 | `MISC 0x0738..0x0778`（17 × int32） | 已公告槽位写 0 |
| 报纸设置 / 记录 | `MISC 0x1004 / 0x1008 / 0x100C`；`0x0E50..0x0EC4`（6 × 5B 报纸定义）；`0x0EC8..0x0EFC`（9 × 6B 故事记录，含义未完全确认） | 读档容错：无法解析则重置故事池 |
| 瓦片标记 | 运行时 `marker`；存档 `XTXT 0xFB..0xFF` | **写**：`xtxtOut[i] = marker[i] || xtxt[i]`，被覆盖的微模拟标签 / 标牌进侧表；**读**：`XTXT ≥ 0xFB` → `marker`，`XTXT` 置 0 后按侧表 → 占地补全 → 共享标签按类型 → `XMIC` 反查的顺序恢复（§2.5.1）；运行时计时器按类型默认值重建 |
| 标签侧表 `xtxtShadow` | `MISC 0x10BC..0x12BB`（512 B：`'XSHD'`, ver, flags, count, 3 B × ≤ 168） | 写档生成、读档消费后清零；缺失 / 魔数不符视为无侧表（第三方存档） |
| 物件 | `XTHG` 40 × 12B（槽 0 头部）；`XTXT 0xC9..0xEF` 指针 | **写**：槽 1..39 按 `things[]` 写，英雄 / 爆炸 / 推土机不写，类型只透传 `{1,2,3,5,7,8,9,A,B,C,D,E,F}`；指针写档时合成（标签优先）。**读**：按 §2.12.2–§2.12.5 校验复活，失败丢弃并记诊断；`XTXT` 指针清 0 |
| 常驻物件运行时字段 | `XTHG` 的 `label / goal / px / py / dx / dy` | 本项目写 `label = phase / 节序号`、`goal = life >> 2`（帆船 `>> 4`）；读第三方存档时这些字节不可信，按类型默认值重建 |
| 瓦砾 / 放射 | `XBLD 0x01..0x05` | 原样 |
| 情景灾害与目标 | `SCEN 0x04..0x07`、`0x08..0x33` | 读入 `pending` / `point` 与 `ScenarioGoals`；写档按 §2.13.6（已触发的灾害清零、时限改为剩余月数；胜负已定则不写情景 chunk） |

---

## 4. 边界条件与易错点

1. **日历冻结**：灾害模式不调用模拟 tick，因此预算、生长、图层、情景月计时全部停止；UI 的日期显示不动是正确行为。暂停也冻结灾害动画。
2. **多格建筑**：任何一格被点燃 / 淹没 / 压毁，燃尽或命中时整座建筑一起变瓦砾；`XZON` 角位要清，分区 nibble 保留；`XMIC` 记录释放；`arcoPop`、球队位（体育场）、奖励唯一性（市政厅等被毁后可重建）同步更新。
3. **热度口径**：`heat` 含 +100 偏移；暴乱阈值 `> 170` 是原始值；报纸显示 `heat − 100`。
4. **人口口径**：暴乱 / 里程碑 / 诉求用 `normalPop`（不含 Arcology）。
5. **"无灾害"≠"无火"**：电厂到期、情景、菜单、龙卷风 / 怪兽撞机都仍可能产生火；只有随机判定被关闭。
6. **天气与灾害解耦**：Tornado / Hurricane 天气类型照常生成（状态栏警告、桥梁风险），灾害是否发生另行判定；非海岸图不生成 Hurricane 天气。
7. **XTHG 容量**：39 个槽位共享；槽 39 永久预留给灾害主物件，常驻物件合计 ≤ 24；调度 / 英雄 / 灾害主物件可驱逐最老的常驻物件（列车整列），常驻物件从不驱逐别人（§2.12.6）；调度失败要给 UI 提示而非静默。
8. **风暴眼存档**：原版无独立类型，存档时写成龙卷风类型；读档如发现类型 `0x0F` 且 `current == Hurricane`，按风暴眼重建。
9. **放射格**：不可推土、不生长、是污染源（服务规格），年衰减概率极低；核电厂被**任何**原因摧毁都留放射 4x4。
10. **洪水海拔**：只淹 `alt ≤ floodAlt + 1`；玩家抬地可挡；水面格本身不打标记；桥上不淹。
11. **火不过路**：道路 / 铁路 / 桥 / 电线不可燃，也不能被点燃，但会被龙卷风 / 地震 / 飓风毁坏；对角蔓延减半。
12. **PRNG 顺序**：所有步进按 `(y, x)` 升序、物件按槽位升序，蔓延用 tick 开始时的快照集合，避免同 tick 连锁。
13. **报纸数字**：`%N` 必须给 1..N，修正原版 Win95 越界；`<N` 用死亡人数，上限 255。
14. **冷却**：诉求类故事每年至多一次（`cooldown = 12`），避免刷屏；灾害类无冷却。
15. **Extra!!! 与订阅同时触发**（4 月 1 日恰逢灾害结束）：先弹号外，再弹订阅版；两份都消费故事池。
16. **发明槽 16**：读写时保留原值，不参与判定；2050 开局槽位多为 0，工具栏初始化必须按 `invented == 0 || year ≥ invented` 判断。
17. **飓风风力覆盖**：结束后恢复 `wind`，否则桥梁坍塌公式会持续命中到月底。
18. **怪兽 / 龙卷风出界**：出界即删除，不回弹；若在出界前灾害已超时则强制删除。
19. **调度单位不是建筑**：不占 `XBLD`，不被毁，不计人口；结束时全部删除（含英雄）。
20. **sc2kfix 与 dfloer 冲突项**（宽限期、`0x104C` 含义）：用参数 + 开放问题处理，不要写死两套。
21. **运行时绝不写 `XTXT`**：任何 `xtxt[i] = 0xFB..0xFF` 或 `0xC9..0xEF` 的赋值都是 bug；标记查 `marker`，物件查 `things[] / thingAt`。写档时才合成，且合成结果不得回写到运行时 `xtxt`（§2.5.1）。
22. **侧表只存"不可重建"的标签**（微模拟 `0x3D..0xC8`、标牌 `0x01..0x32`）；共享标签、`0xFA`、物件指针靠类型 / 几何 / `XTHG` 重建。侧表容量 168 条，超出先丢标牌再丢微模拟标签，并置 `flags.bit0`。
23. **第三方灾害中存档**：`XTXT ≥ 0xFB` 剥离后，`XMIC` 反查可能把两座同类建筑的名字错配——只记诊断，不要拒绝导入；标牌丢失也只记诊断。
24. **空难前置只有跑道**：`PLANECRASH` 的 [高] 前置是"存在跑道格"；"飞机在飞"由按需起飞补足。菜单 Air Crash 在无跑道时必须给消息并**不进入**灾害模式（`active` 不置位）。
25. **列车的三槽原子性**：生成、驱逐、脱轨、读档校验都以整列为单位；任何只删一节的路径都是 bug。车厢位置来自 `history`，不要让车厢自己寻路。
26. **可航区按分量**：船的每一步都检查 `navRegion[q] == t.region`；堤道把一片水一分为二时，处于被切断一侧的船下一步会判 `unsupported` 并删除（原版"被堤道阻断的水域不会有船"的运行时对应）。
27. **常驻物件在灾害模式也动**：`things.step()` 在两种模式下都调用；否则灾害期间的飞机会悬停在空中、空难按需起飞的飞机永远到不了坠毁点。
28. **情景 0 = 不检查**：`min.* == 0`、`max.* == 0`、`xbld == 0 || tiles == 0` 一律视为满足；`timeLimitMonths == 0` 表示无时限（只会赢）。不要把"0 上限"解释成"必须为 0"。
29. **情景月数只在城市模式流逝**：灾害模式冻结日历；评估点是第 22 天，所以读入当月若已过第 22 天则本月不评估，`deadline` 相对于 `startDay`（当月月初）计算。
30. **情景写档**：时限写"剩余月数"、已触发的灾害写 0；胜负已定则不写 `SCEN/TEXT/PICT`，否则重载会再评一次 / 再触发一次灾害。

---

## 5. 待确认问题

| # | 问题 | 当前取值 | 影响 |
|---|---|---|---|
| Q1 | `MISC 0x104C` 是 "Go Disaster"（dfloer）还是净水厂足量标志（服务规格推断）？`0x1040` 是否即 `pending` | 本模块不读写 `0x104C`；`0x1040` 存 `pending` | 存档兼容 |
| Q2 | 开局宽限期：3/2/1 月（dfloer）还是 8/5/2.5 年（sc2kfix 提示） | 8/5/2.5 年 | 早期游戏体验 |
| Q3 | 随机灾害的月概率与类型权重 | §3.2 | 灾害频率 |
| Q4 | 机场、净水厂的基准发明年份；槽位 16 的含义 | 1930 / 1935 / 不使用 | 1900 开局可用性 |
| Q5 | 火势蔓延与 `XFIR` 的真实关系；燃烧时建筑是否立刻变瓦砾 | §2.6.1 | 火灾手感 |
| Q6 | 洪水是否摧毁道路 / 铁路；退水节奏 | 不摧毁；40/20/40 tick | 洪水损失 |
| Q7 | 暴乱人群是否占 `XTHG` 槽位（原版 `0xFD` 标记说明不占） | 标记实现 | 容量 |
| Q8 | 军队单位数量与基地类型的关系；Maxis Man 出现条件 | 4/3/3/2；1/400 | 对抗怪兽 |
| Q9 | 空难是否受"无灾害"约束；`0x05` 与 `0x12` 的实际使用 | 受约束；菜单用 `0x12` | 兼容 |
| Q10 | 报纸故事记录 `0x0EC8..0x0EFC`（9 × 6B）的字段含义；报纸数与人口的阈值 | 容错读取；`1 + min(5, progression)` | 报纸选择 |
| Q11 | 月检故事的阈值常数（`rng & 0x7F` / `rng & 0x0F` 为服务规格给出，其余为本文推测） | §2.10.2 | 报纸内容 |
| Q12 | 顾问建议触发条件 | §2.11 | 预算窗口文案 |
| Q13 | `XTHG` 记录 6–11 字节（`px/py/dx/dy/label/goal`）在原版的含义；本项目的自定义写法（§2.12.2–§2.12.5）会不会让原版读到异常物件 | 读第三方存档时忽略这 6 字节；写档时按本规格写 | 存档兼容 |
| Q14 | 常驻物件的原版速度 / 寿命 / 转向规律；直升机"交通播报"的原版触发条件与文案 | `THINGS_TUNING` 的全部数值 | 画面手感 |
| Q15 | `MISC 0x10BC..0x12BB` 被原版读入后是否真的被忽略（dfloer 只观察到全零）；若不能用，备选为 `XLAB 0xC9..0xF9`（49 × 25 B 未用区） | 用 `MISC` 区，魔数校验 | 灾害中存档的标签恢复 |
| Q16 | 情景目标比较的严格性（`≥` 还是 `>`）、评估日（第 22 天 vs economy §4.20 所述"月结末尾"）、胜利后是否还会判负 | `≥`/`≤`；第 22 天；不会 | 情景可玩性 |
| Q17 | 爆炸 / 推土机是否占 `XTHG` 槽位（dfloer："爆炸可能出现但不一定存档"）；列车能否经转换件入地（transport Q 列）| 不占槽；能 | 容量 / 画面 |

---

## 6. 参考来源

- dfloer/SC2k-docs（CC BY-SA 4.0，本地副本）：`sc2_file_spec.md`（`MISC` 偏移：`0x0004` 城市模式、`0x0060..0x0070` 天气与灾害、`0x0738..0x0778` 发明年份、`0x0E50/0x0EC8` 报纸记录、`0x0FF4/0x1000..0x100C` 设置、`0x1040..0x104C`；天气类型表；灾害类型表；`XTXT 0xFB..0xFF`；`XTHG` 结构与物件类型；`SCEN` 灾害字段）；`simulation_spec.md`（难度与宽限期、飓风 / 龙卷风 / 暴乱 / 核 / 微波 / 空难前置条件、天气四变量口径、发明年份 0..19 随机）；`text_data_spec.md`（故事组 0x00..0x42、复杂 / 简单 token 分组、数字与排版规则）。
- sc2kfix（GPL，公开仓库，仅阅读其符号表与钩子以理解机制，未复制代码）：灾害 / 天气 / 报纸类型 / 物件 / 调度 / 顾问 / 法令枚举；主循环中城市模式与灾害模式的分支；新城对话框难度提示；发明年份初始化；订阅报纸 4 月 1 日 / 8 月 1 日；状态栏红箭头与调度工具的原版帮助文本。
- 兄弟规格：`services-models.md` §2.1（日程第 22 / 24 天）、§2.2（码头与帆船）、§2.9（跑道起飞 1/30、起重机派船 1/4）、§2.10.3（支持率抽样）、§2.10.4（诉求链与月检）、§2.8（里程碑）、§2.6.1（`XMIC` 记录与标签分配）；`power-water.md` §2.3.1（发明规则）、§2.6（电厂到期）；`transport-traffic.md` §2.6（桥型与通航）、§2.9（列车生成条件、转换件）、§2.14（货船 / 飞机存在条件）、§3.2（`conn/subway/station` 掩码）；`terrain.md` §2.9（水深与航道）、砍树计数、海拔 API；`zones-growth-demand.md` §3.1（`census`）、联邦利率故事；`economy-budget.md` §2.11 / §4.20（情景胜负流程、Cash Goal 口径）；`file-formats.md` §2.2.7 / §2.2.9 / §2.2.10 / §2.5.2（`XTXT` 三种语义、`XMIC`、`XTHG`、`SCEN` 布局）。
- dfloer `sc2_file_spec.md` 的 `XTHG` 笔记（记录结构、15 种观察类型、`variant` 使 `0x09` 变 Nessie、"39 槽共享、33 个警消军上限"、飞机 / 直升机消失现象）、`XTXT` 的三段语义、`SCEN` 字段表（City Size 比 normalPop、Cash Goal 不扣债、建筑按格数）、`MISC 0x1054..0x10B4 / 0x10BC..0x12BC` 全零观察；sc2kfix 头文件中 `XTHG` 类型 0–16（含推土机、Maxis Man）与 8 向枚举。
- 社区资料（搜索摘要，置信度中 / 低）：灾害菜单 8 项 + No Disasters；No Disasters 不阻止手动触发；情景与隐藏灾害的对应（Portland 火山、Oakland 火风暴、Washington DC 大暴乱、Davenport 大洪水、Chicago 化学泄漏）；军队单位驱离怪兽、英雄偶现；放射数百年衰减。
- 作者对 SC2K 的游玩记忆：各灾害表现、发明年份、报纸版面（已逐项标注置信度）。
