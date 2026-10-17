# 领域规格：公共服务与城市模型（地价 / 犯罪 / 污染 / 教育 / 健康）

> 适用对象：`packages/sc2k` 的 `sim/datamaps`（八张低分辨率图层）、`sim/services`（公共建筑、微模拟、资金）、`sim/demographics`（年龄队列、EQ/LE）、`sim/rewards`（里程碑奖励、军事基地、Arcology）、`sim/ports`（海港/机场自动生长）实现者。
> 蓝本：SimCity 2000 Windows 95 Special Edition（下称 SC2K）。
> 置信度：**[高]** = dfloer/SC2k-docs 一手文档，或两个独立逆向来源（sc2kfix 头文件/钩子、OpenSC2K 原生模拟）互证；**[中]** = 单一逆向来源 / 原版帮助文本 / 社区共识；**[低]** = 为"可实现"给出的推测，必须做成 `ServicesTuning` 里的可调参数。未标注的数值默认 **[低]**。
> 所有数值表都应放进 `FACILITY_TABLE` / `ServicesTuning` 常量对象，不要散落在代码里。所有随机数走注入的种子 PRNG，并按固定遍历顺序调用。
> 修订说明（v2，评审回应）：(1) **城市中心不再写 `MISC 0x1018/0x101C`**——这对字段按 dfloer 为"视图中心"，归 `ui-art.md` §2.7（写）/ `file-formats.md` §2.3.1（编解码）；本模块的 `cityCenter` 改为运行时值，读档后与每月第 2 天由 `XBLD` 重算，任何代码不读写该字段对（§1、§2.3.2、§3.1、§3.2、§3.5、§3.6、§4 第 21 条、Q2）。(2) **`XTRF` 的单一 owner 明确为本模块**（与 `transport-traffic.md` v2 §2.12.6 / §3.2 / §3.7 / §3.8 的裁定一致）：transport 只经 `addTraffic` 累加并提供 `roadTileCounts()`；衰减只在第 19 天 `decayTraffic`，`MISC 0x0030 = 衰减后 Σ XTRF`，`trafficGraph = total / (1 + 道路格 + 高速格 + 桥格)`；新增导出 `TrafficReport { total, graph, roadTiles, highwayTiles, bridgeTiles }` 供污染源、支持率抽样、报纸、顾问与情景上限读取（§1、§2.1、§2.4、§3.1、§3.3、§3.5、§3.6、§4 第 20 条、Q4）。评审建议的另一方向（transport 为 owner、services 只读）及其切换成本记录在 §2.4 开头。

---

## 1. 概述

本模块回答六个问题：

1. **公共建筑是什么**：警局 / 消防局 / 医院 / 学校 / 大学 / 图书馆 / 博物馆 / 小公园 / 大公园 / 动物园 / 体育场 / 码头 / 监狱，以及奖励建筑（市长官邸 / 市政厅 / 雕像 / 军事基地 / Llama Dome / 四种 Arcology）和两种特殊分区（海港 / 机场）。它们的尺寸、价格、年维护费、解锁条件、放置限制（NIMBY、临水）。
2. **八张图层怎么算**：`XTRF`（交通）/ `XPLT`（污染）/ `XVAL`（地价）/ `XCRM`（犯罪）是 64x64 的"半格"图（每格对应 2x2 瓦片）；`XPLC`（警力）/ `XFIR`（消防力）/ `XPOP`（人口密度）/ `XROG`（增长率）是 32x32 的"四分格"图（每格 4x4 瓦片）。每月第 2 天按固定顺序重算一遍（§2.3）；`XTRF` 例外：生长日由 transport 的出行经本模块 `addTraffic` 逐日累加，第 19 天由本模块 `decayTraffic` 衰减一次并产出 `TrafficReport`（§2.4）。
3. **资金（funding）怎么起作用**：警/消资金线性决定站点的覆盖强度（不改变覆盖形状）；医疗/教育资金决定每年"受保护的新生儿数"和"受教育的升学人数"，再经年龄队列折算成全市 EQ / LE。
4. **微模拟（XMIC）是什么**：每座公共建筑一条 8 字节记录，查询窗口显示"警员 / 逮捕 / 病人 / 学生 / 评分"等，每年 1 月预算结算时更新；少数字段（Arcology 状况）每月更新。
5. **EQ / LE 怎么算**：20 个 5 岁年龄队列，每月做死亡 → 老化（升学）→ 出生 → 迁入/迁出，再对 20–54 岁劳动力求平均得到 `workforceEQ` / `workforceLE`。
6. **这些量如何反作用**：地价门槛决定分区能长到第几档密度与贫富档次；交通行程失败导致衰退；犯罪/污染/交通/EQ/LE 进入市长支持率抽样、报纸、顾问诉求、情景目标；EQ 影响高科技产业需求；Arcology 的入住速度取决于其脚下的地价/犯罪/污染与税率。

模块边界（输入只读 / 输出独占写）：

| 方向 | 数据 | 说明 |
|---|---|---|
| 输入 | `XBLD` `XZON` `XTER` `XBIT`（`POWERED` `WATERED` `WATER`）`XUND` | 地形 / 分区 / 电水模块维护 |
| 输入 | `MISC`：法令位 `0x0FA0`、预算记录 `0x077C..`（税率、资金%）、`NORMAL_POPULATION 0x102C`、`ARCOLOGY_POPULATION 0x1020`、`INDUSTRIAL_POLLUTION_BONUS 0x1034`、`TREATMENT_SUFFICIENT 0x104C`、`ZONE_POPULATIONS 0x05F0..`、建筑格计数 `0x01F0..` | 预算 / 分区 / 产业 / 水模块维护 |
| 输入 | 出行结果：`transport-traffic.md` §3.6 `runTrip` 成功时对路径上的道路类格调用本模块 `addTraffic(tile, popLevel)`（§2.4）；`transport.roadTileCounts()`（`trafficGraph` 分母，只读查询） | transport 只经 `addTraffic` 累加：不自持 `XTRF` 缓冲、不衰减、不写 `MISC 0x0030`（transport v2 §2.12.6 / §3.8 已确认） |
| 输出 | `XTRF` `XPLT` `XVAL` `XCRM` `XPLC` `XFIR` `XPOP` `XROG` | 本模块独占写权；`XTRF` 全游戏唯一的衰减点是第 19 天 `decayTraffic`（§2.4 / §3.3） |
| 输出 | `TrafficReport { total, graph, roadTiles, highwayTiles, bridgeTiles }`（§3.3）、`cityCenter()`（§2.3.2；运行时值，不入存档） | 污染源 / 支持率抽样 / 报纸 / 顾问 / 情景上限 / 怪兽目标 / `Home` 键 |
| 输出 | `MISC`：`0x0024` 城市价值、`0x0028` 地价总和、`0x002C` 犯罪总和、`0x0030` 交通总量（第 19 天衰减后 `Σ XTRF`）、`0x0034` 污染总和、`0x0044/0x0048/0x004C` 劳动力 % / LE / EQ、`0x007C..0x0168` 年龄队列表、`0x0020` 里程碑进度、`0x0078` 奖励可用位、`0x0E4C` 军事基地类型、`0x1028` 球队位、`0x1038` 逮捕总数、`0x103C` 监狱加成 | **不读不写** `0x1018/0x101C`（视图中心，归 `ui-art.md` §2.7 / `file-formats.md` §2.3.1；Q2） |
| 输出 | `XMIC`（150 条）、`XLAB` 默认名、`XTXT` 微模拟标签 | 放置与年度更新 |
| 输出 | 事件：`needpolice/needfire/needhospital/needschool/needseaport/needairport/needpark...`、`fundeducation`、`fundprison`（监狱超员）、`highcrime/lowcrime/highpollution/lowpollution/hightraffic/lowtraffic/loweducation/higheducation`、奖励解锁、军事基地提案、Arcology 升空 | 报纸 / 顾问 / UI |

---

## 2. 原版行为

### 2.1 月历与更新周期 [高]

1 月 = 25 天（`month_day` 0..24）。与本模块相关的日程（OpenSC2K 对原版调度的还原，sc2kfix 的 `SimulationGrowthTick(iStep, iSubStep)` 签名与之吻合）：

| month_day | 动作 | 本模块职责 |
|---|---|---|
| 0 | 预算（1 月时先做年度结算 → **年度微模拟更新** §2.6 → 市长支持率 §2.10.3）、月初清零分区人口 | `annualFacilityUpdate` |
| 1 | 电力扫描 | 读 `POWERED` |
| 2 | **图层重算**：污染 → 城市中心 → 地形宜居度 → 地价 → 警/消覆盖 + 人口密度 → 增长率 → 犯罪 | `runDataMaps` |
| 3–18 | 生长扫描：16 天各扫 4x4 块中的一个格（`step = (d-3)/4 % 4`, `substep = (d+1) % 4`） | 行程写 `XTRF`；访问到 Arcology 右上角格时更新其"状况" §2.8.3；海港/机场/军事区自动生长 §2.9 |
| 19 | 交通衰减 `XTRF -= XTRF >> 2`，求和写 `MISC 0x0030`，生成 `TrafficReport` | `decayTraffic`（全游戏唯一的 `XTRF` 衰减点；transport 不做月度衰减） |
| 20 | 供水扫描 | 读 `WATERED` |
| 21 | RCI 需求 → **人口学（EQ/LE）§2.7** → 图表历史 | `runDemographics` |
| 22 | **里程碑 §2.8.1** → 情景目标 → 破产 | `checkMilestones` |
| 23 | 刷新统计窗口 | |
| 24 | 刷新地图 / SimNation / 天气与灾害；状态栏"市民诉求" §2.10.4 | `cityStatus` |

推论：八张图层每月只重算一次；`XPLC/XFIR/XPOP` 每月从零重建（无记忆），`XPLT/XROG/XTRF` 有记忆（扩散/平滑/衰减），`XVAL` 用上月的 `XCRM/XPOP` 和本月的 `XPLT`，`XCRM` 用本月的 `XPOP/XVAL/XPLC`。

### 2.2 公共建筑总表

ID 为 `XBLD`。`年费` 为 100% 资金时每座每年的维护费（按月累计 1/12，资金 % 线性缩放）[高（帮助文本 + 逆向）]。`污染/格` 与 `人口权重/格` 见 §2.3.1/§2.3.4。`微模拟` 为 XMIC 类型号（§2.6）。"共享"表示全城同类建筑共用一条固定记录。

| ID | 建筑 | 占地 | 价格 | 年费（预算类别） | 微模拟 | 污染/格 | 人口权重/格 | 需电 | 解锁 | 备注 |
|---|---|---|---|---|---|---|---|---|---|---|
| 0xD2 | Police Station 警局 | 3x3 | $500 | $100（police） | 4 | 0 | 2 | 是（断电强度减半） | 始终 | 覆盖 §2.3.5；提供灾害调度单位（灾害规格） |
| 0xD3 | Fire Station 消防局 | 3x3 | $500 | $100（fire） | 5 | 0 | 2 | 是（同上） | 始终 | 覆盖 §2.3.5；灭火概率由灾害规格读 `XFIR` |
| 0xD1 | Hospital 医院 | 3x3 | $500 | $50（health） | 3 | 0 | 2 | 是 | 始终 | 新生儿保护容量 25/座 §2.7 |
| 0xD6 | School 学校 | 3x3 | $250 | $25（school） | 6 | 0 | 2 | 是 | 始终 | 升学容量 15/座 |
| 0xD9 | College 大学 | 4x4 | $1,000 | $100（college） | 9 | 0 | 2 | 是 | 始终 | 升学容量 50/座 |
| 0xF5 | Library 图书馆 | 2x2 | $500 | 0 | 24（共享） | 0 | 2 | 是 | 始终 | 评分用学校资金；无直接 EQ 公式（见 Q3） |
| 0xD4 | Museum 博物馆 | 3x3 | $1,000 | 0 | 23（共享） | 0 | 2 | 是 | 始终 | 统计用大学资金 |
| 0x0D | Small Park 小公园 | 1x1 | $20 | 0 | 无（计入公园系统面积） | 0 | 0（不是建筑） | 否 | 始终 | 地价 +20/格 §2.3.3；R 需求 cap +1,000 |
| 0xD5 | Big Park 大公园 | 3x3 | $150 | 0 | 22（共享） | 0 | 2 | 否（但耗水） | 始终 | 地价 +40/格；R cap +3,000 |
| 0xDA | Zoo 动物园 | 4x4 | $3,000 | 0 | 10 | 0 | 2 | 是 | 始终 | R cap +16,000；统计全随机 |
| 0xD7 | Stadium 体育场 | 4x4 | $5,000 | 0 | 7 | 4 | 2 | 是 | 始终 | 放置时弹出选队对话框，球队位写 `MISC 0x1028`；R cap +16,000 |
| 0xF8 | Marina 码头 | 3x3 | $1,000 | 0 | 25（共享） | 0 | 2 | 是 | 始终 | 占地内水格数必须在 1..8（全陆/全水均拒绝）[高]；通电时随机生成帆船；R cap +9,000 |
| 0xD8 | Prison 监狱 | 4x4 | $3,000 | 0 | 8 | 10 | 2 | 是 | 始终 | NIMBY §2.5；监狱加成 §2.6.2 |
| 0xF3 | Mayor's House 市长官邸 | 2x2 | $0 | 0 | 12 | 0 | 2 | 是 | 人口 > 2,000 | 显示支持率 |
| 0xD0 | City Hall 市政厅 | 3x3 | $0 | 0 | 2 | 0 | 2 | 是 | 人口 > 10,000 | |
| 0xDB | Statue 雕像 | 1x1 | $0 | 0 | 11 | 0 | 2 | 否（放置后清 `POWERABLE`）[高] | 人口 > 30,000 | 仍 `PIPED` |
| （分区 7） | Military Base 军事基地 | 由游戏选址划区 | $0 | 0 | 无 | 跑道/停机坪/战机 10 | 2 | 否（军事区生长不查电）[高] | 人口 > 60,000 时提案一次 | §2.8.2 |
| 0xFF | Braun Llama Dome | 4x4 | $0 | 0 | 16 | 0 | 2 | 是 | 人口 > 90,000 | 纯观赏 + 微模拟趣味数据 |
| 0xFB | Plymouth Arcology | 4x4 | $100,000 | 0 | 15 | 25 | 12 | 是 | 人口 > 120,000 且已发明 | 容量 55,000 |
| 0xFC | Forest Arcology | 4x4 | $120,000 | 0 | 15 | 10 | 12 | 是 | 同上 | 容量 30,000 |
| 0xFD | Darco | 4x4 | $150,000 | 0 | 15 | 12 | 12 | 是 | 同上 | 容量 45,000 |
| 0xFE | Launch Arcology | 4x4 | $200,000 | 0 | 15 | 15 | 12 | 是 | 同上 | 容量 65,000；升空事件 §2.8.3 |
| （分区 9） | Seaport 海港 | 任意矩形，$150/格 [中] | | 0 | 无 | 码头/货场 10、起重机/仓库 5、装卸位 2 | 2 | 是 | 始终 | 自动长出 0xDF/0xE0/0xE3/0xF0/0xF2 §2.9 |
| （分区 8） | Airport 机场 | 任意矩形，$250/格 [中] | | 0 | 无 | 跑道/停机坪 10、航站楼/机库 5、停车场 2 | 2 | 是 | 科技 Airport（`MISC 0x0750`，基准年 1927 [低]） | 自动长出 0xDD/0xDE/0xE1/0xE4/0xE5/0xE6/0xEA/0xEE/0xF6 §2.9 |

价格/占地置信度：警/消/医/校/大学/图书馆/博物馆/公园/动物园/体育场/码头/监狱/Arcology 为 **[高]**（OpenSC2K 城市价值表 + 工具目录互证；大学 4x4、图书馆 2x2、监狱/动物园/体育场 4x4 由"格计数 ÷ 16/4/9"推得）。解锁人口阈值 **[高]**（逆向常量表 + 原版帮助文本"2,000 / 10,000"）。Arcology 发明基准年 2000 / 2050 / 2100 / 2150（+0..19 随机年）**[中]**。

**放置通用规则**（与地形规格一致）：占地内每格 `XTER == 0x00` 且非水（码头例外）、无任何结构物（`XBLD < 0x0E`，树木自动清除）、不越界（`AREA_4x4` 的锚点范围比 1x1 更窄）；资金不足拒绝；放置成功即扣款、把该预算类别的"当前数量"+1、分配微模拟记录（§2.6.1）、置 `PIPED|POWERED|POWERABLE`（电水规格），并立即触发一次电/水扫描。

### 2.3 图层重算（每月第 2 天）[高：OpenSC2K 对原版 `PollutionPhase` 的逐步还原；sc2kfix 常量互证]

坐标约定：瓦片 `(x, y)`，半格 `h = (x >> 1, y >> 1)`（64x64），四分格 `q = (x >> 2, y >> 2)`（32x32）。图层数组的主次序与 `XBLD` 相同（地形规格决定），导入/导出只做降采样索引换算。下文 `old*` 指上月保存的图层。

#### 2.3.1 污染 `XPLT`

每格污染源表（原版可执行文件内的 256 项表，非零项如下）**[高]**：

| XBLD | 建筑 | 污染/格 |
|---|---|---|
| 0x84–0x87 | 工业 1x1 四种 | 6 |
| 0x9E–0xA1 | 工业 2x2：Medium Warehouse、Chemical Processing 2、Small Factory 1–2 | 12 |
| 0xA2–0xA5 | 工业 2x2：Small Factory 3–6 | 18 |
| 0xBC–0xC1 | 工业 3x3 六种 | 24 |
| 0xC9 / 0xCA / 0xCB / 0xCE / 0xCF | 燃气 10 / 石油 25 / 核能 2 / 聚变 2 / 煤 50 | 见左 |
| 0xC6–0xC8, 0xCC, 0xCD | 水电 / 风电 / 太阳能 / 微波 | 0 |
| 0xD7 | 体育场 | 4 |
| 0xD8 | 监狱 | 10 |
| 0xDC | 水泵 | 2 |
| 0xDD / 0xDE / 0xDF | 跑道 / 跑道十字 / 码头栈桥 | 10 |
| 0xE0 / 0xE3 / 0xE4 / 0xE5 | 起重机 / 港口仓库 / 航站楼 1 / 航站楼 2 | 5 |
| 0xE6 / 0xE7 | 停机坪 / F-15 | 10 |
| 0xE9 / 0xEC / 0xED | 地铁站 5 / 公交站 3 / 火车站 4 | 见左 |
| 0xEE / 0xEF / 0xF0 / 0xF1 | 民用停车场 / 军用停车场 / 装卸位 / Top Secret | 2 |
| 0xF2 / 0xF4 | 货场 / 净水厂 | 10 |
| 0xF6 | 机库 2 | 5（机库 1 `0xE8` 为 0） |
| 0xFB / 0xFC / 0xFD / 0xFE | Plymouth 25 / Forest 10 / Darco 12 / Launch 15 | 见左 |
| 0x05 | 放射性废料（不在表内，单独加） | 200 |
| 其余（住宅、商业、教堂、雷达、塔台、淡化厂、施工、废弃…） | | 0 |

注意：**商业建筑不污染**，交通是商业区污染的唯一来源；`zones-growth-demand.md` 建筑表里商业的 `poll` 权重与此冲突，以本表为准（见 §5 Q1）。

```
// 1) 源项（半格）
for h in 64x64:
  src[h] = oldXTRF[h] / 5 + oldXPLT[h]
         + Σ_{t ∈ 4 tiles of h} (XBLD[t] >= 0x70 ? POLL[XBLD[t]] : 0)
         + 200 * count(XBLD[t] == 0x05)
// 2) 扩散：中心权 2，四邻权 1，分母 = D + 邻居数
D = max(1, 4 + treatmentSufficient − indPollBonus + (PollutionControls ? 1 : 0))
   // treatmentSufficient ∈ {0,1}（水模块，MISC 0x104C）
   // indPollBonus（产业模块，MISC 0x1034）：重污染产业份额 < 20% 时为 −1（存档里是 0xFFFF 低字，需按 16 位有符号读）
   //   否则 (share − 20) / 30 ∈ 0..2。即重工业比重越大，分母越小，污染越难散掉
for h: XPLT[h] = min(255, (2*src[h] + Σ_{4 邻半格 n 在界内} src[n]) / (D + 界内邻居数))
pollutionTotal = Σ XPLT  → MISC 0x0034
```

稳态直觉：D=5、四邻时分母 9，`XPLT ≈ (2·src + 4·src_nbr)/9 ≈ 0.67·src`，而 `src` 又含上月 `XPLT`，所以一座煤电厂（16 格 × 50 = 800/4 格 → 每半格 200）周围形成稳定的深色污染斑，净水厂/污染法令各把分母 +1，约减 10–15%。

#### 2.3.2 城市中心（运行时值，不写存档）[高（公式）/ 中（与 `MISC 0x1018/0x101C` 的关系，Q2）]

```
n = 0; sx = sy = 0
for t: if XBLD[t] >= 0x70: sx += x; sy += y; n++
cx = sx / (2*(n+1)); cy = sy / (2*(n+1))      // 半格坐标，整数截断；n=0 时为 (0,0)；除以 n+1 而非 n 是原版偏差，保留
cityCenter = { hx: cx, hy: cy, x: 2*cx, y: 2*cy }   // 只存内存（state.cityCenter），不写任何 MISC 字段
```

- **何时算**：(a) 每月第 2 天 `runDataMaps` 的第二步（§2.1），供同月地价 `dist` 项使用；(b) **读档 / 新城生成完成后立即**调用一次 `computeCityCenter(XBLD)`（O(16384)，可忽略），保证第一个第 2 天之前怪兽目标、`Home` 键等消费者已有值。不随单格放置增量更新（原版也是月更）。
- **存档：不写**。`MISC 0x1018/0x101C` 在 dfloer 文档中是"视图中心 View X/Y"，`file-formats.md` §2.3.1（`viewX/viewY`）与 `ui-art.md` §2.7（视口持久化）均按此读写。旧稿让本模块每月把质心×2 写进同一对字段，会与视口写入互相覆盖：读档时镜头跳到质心，或怪兽目标 / 地价 `dist` 被玩家滚动位置污染。裁定：**这对字段的唯一 owner 是 ui-art（写）/ file-formats（编解码）**；本模块的 `cityCenter` 只在内存中，读档后由 `XBLD` 重算——它本来就是 `XBLD` 的纯函数，持久化没有信息增益，也不需要从存档读回。
- **若实机验证（Q2）证明原版在这对字段里存的是质心×2**（OpenSC2K 的读法），改动也不在本模块：file-formats 的导出器在 `misc1018Semantics = 'center'` 下调用 `services.cityCenter()` 写 `x, y`，ui-art 把视口位置改存本项目扩展字段 / 本地存储。无论验证结果如何，本模块都不读这对字段。
- **消费者**：§2.3.4 地价 `dist`；`disasters-events.md` 怪兽目标（`cityCenter().x / .y`，瓦片坐标）；`ui-art.md` 的 `Home` 键"居中城市中心"（建议用本值而非地图几何中心）。

#### 2.3.3 地形宜居度（四分格累加器 `R[q]`、`I[q]`）

对每个瓦片累加到其四分格（因此一个四分格最多由 16 个瓦片贡献）：

| 条件（按顺序只取第一条命中的建筑项） | R | I |
|---|---|---|
| `XBLD == 0x00` 且 `XBIT.WATER` | +12 | +12 |
| `XBLD == 0x00` 且非水 | +4 | 0 |
| `XBLD == 0xD5` 大公园 | +40 | 0 |
| `0x06 <= XBLD <= 0x0D` 树木 / 小公园 | +20 | 0 |
| `0x01 <= XBLD <= 0x05` 瓦砾 / 放射性 | −20 | 0 |
| 其他建筑 / 道路 / 电线 | 0 | 0 |
| 另加：`XBIT.WATERED` | +4 | +4 |
| 另加：`XTER ∈ 0x01..0x0F`（干地坡面） | +12 | 0 |

同一遍标记"已开发半格"：若 `XBLD[t] >= 0x1D`（道路及以上；**电线不算**）或 `XZON[t] & 0x0F != 0`，则 `developedHalf[h] = 1`，并计数 `developedTiles++`（图表分母用）。

#### 2.3.4 地价 `XVAL`

只对 `developedHalf[h] == 1` 的半格计算，其余为 0（地图上透明）。

```
zone = XZON[TL tile of h] & 0x0F;  if zone == 0: zone = XZON[BR tile of h] & 0x0F
q = (hx >> 1, hy >> 1)
avgR = mean5(R, q)   // 四分格 q 与其界内四邻的整数平均（分母 = 1 + 界内邻居数）
avgI = mean5(I, q)
dist = 64 − |cx − hx| − |cy − hy|                       // 半格曼哈顿距离
P = XPLT[h] (本月)   C = oldXCRM[h]   POP = oldXPOP[q]
switch zone:
  3,4 (商业): v = avgR + max(0, dist)       − P/4  − C/3 + POP/3
  5,6 (工业): v = avgI + (zone==6 ? 21 : 0) + max(0, dist/4) − P/16 − C/4
  其他 (住宅 1,2 与无分区的已开发格): v = avgR + (POP < 64 ? 21 : 0) + max(0, dist/2) − P/5 − C/3
v += LAND_VALUE_BASE                                     // 默认 32，见下
if XBLD[TL tile] ∈ 废弃建筑 {0x8A,0x8B,0xAA..0xAD,0xC4,0xC5}: v −= v/2
XVAL[h] = clamp(v, 0, 255); landValueTotal += XVAL[h]  → MISC 0x0028
```

`LAND_VALUE_BASE` **[中]**：原版复用了一块未清零的临时缓冲区，使每个地价多出约 +0..45 的"垃圾偏移"（取决于地图左上角的污染残留），游戏平衡是在这个偏移下调出来的（贫富档阈值 64/128）。OpenSC2K 用常量 32 替代后与原版存档的档次吻合率 85%。我们同样用常量，做成 `landValueBase` 参数。

直觉：纯住宅 1x1 街区（建筑格本身贡献 0，受水 +4/格 ⇒ 64）在市中心附近 ≈ 64 + 21 + 32 + 32 ≈ 150 → 中高档；靠树林/公园/水边再 +20..40/格，很快封顶 255；工业区基线 ≈ 64 + 21 + 32 + 16 ≈ 133。

#### 2.3.5 警力 `XPLC`、消防力 `XFIR`、人口密度 `XPOP`、增长率 `XROG`

**站点强度** [高]：

```
policeStrength = (5 + prisonBonus) * policeFunding / 2      // 100% 资金：250；有监狱加成：300
fireStrength   = fireFunding * 5 / 2                        // 100% 资金：250
断电站点强度减半（整数除法）
```

**覆盖图案**（四分格偏移；每次叠加都 `clamp(0,255)`，越界跳过）[高]：

| 偏移 | 值 | S=250 时 | 对应瓦片距离 |
|---|---|---|---|
| (0,0) | S | 250 | 0–3 |
| (±1,0),(0,±1) | A = 4S/5 | 200 | 4–7 |
| (±1,±1) | B = 3A/4 | 150 | 对角 4–7 |
| (±2, −1..1),(−1..1, ±2)（12 格） | Cv = 2B/3 | 100 | 8–11 |
| (±3, −1..1),(−1..1, ±3)（12 格）与 (±2,±2)（4 格） | Dv = Cv/2 | 50 | 12–15 |

即一座满资金警局在半径约 3 个四分格（12–15 瓦片）内有效，形状是十字加肩的菱形，覆盖面积约 28x28 瓦片；资金只改变高度不改变半径。两座站点重叠处饱和在 255。

**扫描**（注意只遍历 `x, y ∈ 1..126`，地图最外圈瓦片既不计人口也不算站点 **[高，原版怪癖]**）：

```
popW[q] = 0 (32x32)
for x in 1..126, y in 1..126:
  b = XBLD[t]; q = (x>>2, y>>2)
  if 0x70 <= b < 0xC6:                                   // 分区建筑（含施工，废弃权重为 0）
    popW[q] += POPWEIGHT[b]
    if NeighborhoodWatch && XPLC[q] < 254: XPLC[q] += 2
    if VolunteerFireDept && XFIR[q] < 254: XFIR[q] += 2
  else if b >= 0xC6:                                     // 其他一切建筑
    popW[q] += (0xFB <= b <= 0xFE) ? 12 : 2
    if (XZON[t] & 0x80) == 0: continue                   // 只在建筑"原点格"（TR 角位）处理一次
    if b == 0xD2: addPattern(XPLC, q, POWERED ? policeStrength : policeStrength/2)
    if b == 0xD3: addPattern(XFIR, q, POWERED ? fireStrength : fireStrength/2)
```

`POPWEIGHT`（每格）[高]：1x1 分区建筑与 1x1 施工 `0x70–0x89` → 1；2x2 低档 `0x8C–0x8F`、`0x94–0x98`、`0x9E–0xA1`、施工 `0xA6,0xA7` → 2；2x2 高档 `0x90–0x93`、`0x99–0x9D`、`0xA2–0xA5`、施工 `0xA8,0xA9` → 3；3x3 全部与 3x3 施工 `0xAE–0xC3` → 4；废弃 `0x8A,0x8B,0xAA–0xAD,0xC4,0xC5` → 0。

```
for q: XPOP[q] = min(255, 4 * popW[q])
       XROG[q] = clamp((7*oldXROG[q] + 8*(XPOP[q] − oldXPOP[q]) + 128) / 8, 0, 255)
```

`XROG` 稳态为 128（0x80）；dfloer 观察到新城默认 0x7F、`>0x82` 画绿、`<0x7D` 画红，显示阈值沿用 dfloer。一个全是 3x3 密区的四分格 `popW = 16×4 = 64 → XPOP = 255`；一座 Arcology 单独就是 `16×12 = 192 → 255`。

#### 2.3.6 犯罪 `XCRM`

```
for h: c[h] = developedHalf[h]
         ? XPOP[q(h)] − XVAL[h]/4 − XPLC[q(h)]/2 + (LegalizedGambling ? 16 : 0)
         : 0
for h: XCRM[h] = clamp(mean5(c, h), 0, 255)   // 半格五点平均，分母 = 1 + 界内邻居数
crimeTotal = Σ XCRM → MISC 0x002C
```

直觉：密区四分格 `XPOP = 144..255`，警局中心 `XPLC/2 = 125`，地价 200 时 `−50`，所以密区核心即使在警局旁也剩 0..80 的犯罪；轻区（`XPOP ≈ 64`）一座警局就能压到 0。犯罪反过来压地价（−C/3），形成贫民区正反馈，这是原版行为。

### 2.4 交通 `XTRF` 与交通总量 [高（累加、衰减）/ 低（`MISC 0x0030` 口径，Q4）]

**所有权裁定（评审意见 2）**：`XTRF` 缓冲区、月度衰减、`MISC 0x0030` 与 `trafficGraph` 的**唯一 owner 是本模块**。`transport-traffic.md` v2（§2.12.6 / §3.2 / §3.7 / §3.8）已把这些写权全部交来，自己只保留 (a) `runTrip` 成功时对本模块 `addTraffic` 的调用、(b) 分母用的 `roadTileCounts()` 只读查询，并废弃了旧稿的 `monthlyTraffic` 衰减、`trafficCountScale`、`trafficDecayShift` 与"道路块均值×scale"口径。评审建议的另一方向（transport 为 owner、services 只读 `XTRF`）在依赖方向上更干净（单向 transport → services），但与 transport v2 的现状相反；为避免两份规格互指对方而无人持有，本文**保持 services 为 owner**，并把全部交通接口收敛到 §3.3 的一个 `TrafficOwner` 对象。若架构师最终选 transport 为 owner，切换成本是：把 §3.3 整节搬到 transport §3.7，本文 §1 的 `XTRF` 行改为只读输入、`DataMaps.xtrf` 改为 `Readonly` 引用，公式与数值一字不变。全系统不变量（两种归属下都成立）：**每月恰好一次衰减（第 19 天）、恰好一处写 `MISC 0x0030`、恰好一个 `trafficGraph` 公式、恰好一份 `XTRF` 缓冲**。

- **累加 `addTraffic(tile, weight)`**（调用方：transport `runTrip`；每个分区格每月至多一次，由 `zones-growth-demand.md` §4 第 8 条保证）：出行成功后，沿最终路径对进入模式 ∈ {ROAD, HIGHWAY, ROADBRIDGE} 的格 `XTRF[h] = min(255, XTRF[h] + weight)`，`h = (x >> 1) + 64·(y >> 1)`。`weight = popLevel`（已建建筑的密度级 1..4，与 §2.3.5 的 `POPWEIGHT` 同值；空地 / 施工为 0 时 transport 不调用）。铁路 / 地铁 / 隧道 / 步行 / 公交 / 车站占地内部帧不累加，只记乘客（transport 微模拟）。起点与目的地规则（3 格内找道路或车站起步、100 步上限、1x1 建筑减 1/4、R → C/I/军事/机场/海港，C → R/I，I → R/C、邻城连接格 `XTXT 0xFA` 与 Arcology / Llama Dome 视为到达）全部由 transport §2.12 定义，本模块不关心路径怎么来的。
- **衰减 `decayTraffic()`**（每月第 19 天，日程 §2.1；全游戏唯一衰减点）：

```
for h in 0..4095: XTRF[h] -= XTRF[h] >> trafficDecayShift      // 默认 2 ⇒ −25%，整数截断；值 1..3 衰减为 0
counts = transport.roadTileCounts()                            // { roadTiles, highwayTiles, bridgeTiles }，只读快照
total  = Σ XTRF[h]（衰减后）                                    → MISC 0x0030
graph  = total / (1 + roadTiles + highwayTiles + bridgeTiles)  // 整数截断
trafficReport = { total, graph, ...counts }                    // 缓存到下一个第 19 天；期间任何消费者读到的都是这份
```

dfloer 指出 `0x0030`"不是 XTRF 之和"；我们按"统计时点不同"解释（第 19 天衰减后的和，之后 16 个生长日再累加，所以读档时看起来对不上），置信度 **[低]**，见 Q4。

- **消费者**（都只读 `TrafficReport` 或 `XTRF`，没有第二份计算）：

| 消费者 | 读什么 | 规格 |
|---|---|---|
| 污染源项 | `oldXTRF[h] / 5`（第 2 天；此时 `XTRF` 是上月第 19 天衰减后、本月尚未累加的值） | §2.3.1 |
| 支持率抽样 | `w[0] = trafficReport.graph` | §2.10.3 |
| 报纸 `hightraffic` / `lowtraffic` | `rng(0..127) < graph` / `graph < rng(0..15)`（第 24 天月检） | §2.10.4、`disasters-events.md` 故事表 |
| 顾问 Transit | `graph > 60 && funds < 10,000` | `disasters-events.md` 顾问表 |
| 情景 Traffic Limit | `total ≤ trafficMax`（第 22 天读 `MISC 0x0030`，即最近一次第 19 天的 `total`） | `economy-budget.md` §2.16 |
| 图表 Traffic | 月序列推 `total`（原值），显示缩放归图表规格 | `economy-budget.md` §2.14 |
| 直升机交通播报 / 道路轻重交通叠加精灵 | 直接读半格 `XTRF[h]`（阈值在各自规格） | `disasters-events.md`、transport §2.12.7 |
| 查询窗口 / 交通图 | 该半格 `XTRF[h]`；地图按 2x2 块着色（dfloer） | `ui-art.md` |

地价公式不直接含交通，只经污染间接影响（§2.3.4）。

- **量纲**：`total` 对 4096 个半格求和，随城市规模线性增长，只能用作情景 / 图表的绝对量；`graph` 按路网**瓦片**数归一（正常运行的城市约 10–60，全路网饱和 120–250），所有阈值一律用 `graph`，不要拿 `total` 当阈值。
- **读档**：`XTRF` 来自存档；`trafficReport` 不存档，读档后用 `Σ XTRF（存档值）` 与 `transport.roadTileCounts()` 立即重建一次，并把内存中的 `MISC 0x0030` 同步为该 `total`（原版存档里 `0x0030` 的口径未知，不沿用；file-formats 宜把此字段标为"读档后重算"）。断言 `Σ XTRF == MISC 0x0030` 只在第 19 天衰减后到下一次 `addTraffic` 之前成立，其他时刻不等是正常的。

### 2.5 NIMBY（邻避）[高]

放置 **净水厂 0xF4、煤 0xCF、油 0xCA、燃气 0xC9、核 0xCB、监狱 0xD8** 时：

```
n = count of tiles with (XZON & 0x0F) ∈ {1,2} in rectangle
    x ∈ [x0−8, x0+size+8), y ∈ [y0−8, y0+size+8)  (裁边)
if rngInt(0,199) < n: 播放嘘声、提示"请重新考虑选址"，放置失败，不扣款
```

即周围 ≥ 200 个住宅分区格时必定被拒；100 格时一半概率。失败不消耗微模拟槽位。

### 2.6 微模拟（XMIC）与年度更新

#### 2.6.1 记录结构与槽位 [高]

`XMIC` 150 条 × 8 字节：`[tileId:u8][stat0:u8][stat1:u16 BE][stat2:u16 BE][stat3:u16 BE]`。记录 r 对应 `XTXT/XLAB` 标签号 `0x33 + r`：

| 记录 | 标签 | 用途 |
|---|---|---|
| 0 | – | 未用 |
| 1–9 | 0x34–0x3C | 共享系统：公交 / 铁路 / 地铁 / 风电 / 水电 / 公园 / 博物馆 / 图书馆 / 码头（`XLAB` 默认名 "SimBus System"… 我们用原创名） |
| 10–149 | 0x3D–0xC8 | 独占记录：电厂、市政厅、医院、警局、消防局、学校、体育场、监狱、大学、动物园、雕像、市长官邸、净水厂、淡化厂、Arcology、Llama Dome、公交站/火车站/地铁站（这三种每座一条但统计全城） |

分配：类型为共享的建筑直接用固定记录（不占槽位）；独占类型从 10 起找第一条 `tileId == 0` 的记录；满了（140 座）则放置失败（原版行为，dfloer 的"139"差一之谜见 Q5）。Arcology 优先复用 `tileId < 0xFB` 的空槽。记录的 `tileId` 写建筑 ID，并在建筑**每个格**的 `XTXT` 写标签号；拆除时清记录与标签。`XLAB` 该槽写默认名（可被玩家改名）。

**放置时初值**（未列字段为 0）[高]：

| 建筑 | stat0 | stat1 | stat2 | stat3 |
|---|---|---|---|---|
| 医院 / 学校 / 大学 | 6（初始评分 C+） | | | |
| 警局 | | `popCap(2×policeFund, 90)` | | |
| 消防局 | | `popCap(fireFund/2, 70)` | 4 | |
| 市政厅 | | `popCap(200, 900)` | 建成年 | |
| 博物馆（共享） | 100 | | | |
| 大公园（共享） | | | +9（面积） | |
| 雕像 | | 建成年 | | |
| 市长官邸 | | 建成年 | `rng%30+10` | `rng%60`（倒计时） |
| Arcology | 5 | 容量（千人）55/30/45/65 | | 建成年 |
| Llama Dome | | | | `rng & 0x3F` |
| 公交/火车/地铁站 | | +1 | | |

辅助函数 `popCap(max, divisor) = min(int16(max), (arcoPop + normalPop + adj) / divisor)`，`adj = arcoCount ≥ 141 ? arcoCount×20000 − 2,800,000 : 0`——把各项统计按城市规模封顶。`int16()` 表示按 16 位有符号截断（原版溢出行为，保留以兼容存档数值，`legacyInt16Wrap` 可关）。

#### 2.6.2 年度更新（每年 1 月预算结算时，按记录序遍历）[高]

通用：`fund(cat)` 为该预算类别资金 % (0..100)；`N(id)` 为 `MISC 0x01F0 + id*4` 的建筑格计数；`pop = normalPop`；`rnd(mask)` 为 15 位随机数与掩码按位与；`score(num, den, slope, best, zero)`：`ratio = num / max(1, den)`，`ratio < best → 12`，`ratio < zero → (zero − 1 − ratio) / slope`，否则 0。评分 0..12 → 等级 `F, D-, D, D+, C-, C, C+, B-, B, B+, A-, A, A+`。

| 建筑 | 查询窗口（原创措辞）与公式 |
|---|---|
| 警局 | `stat0 = fund(police)`（年费显示 $stat0）；`stat1 警员 = popCap(2·fund, 90)`（→200）；`stat2 报案 = crimeTotal / 警局数`；`stat3 逮捕 = rnd(0x0F) + stat2 / max(1, 5 − prisonBonus)`；全城 `oldArrests = min(65535, Σ stat3)` → `MISC 0x1038` |
| 消防局 | `stat0 = fund(fire)`；`stat1 消防员 = popCap(fund/2, 70)`（→50）；`stat2 消防车 = stat1>>4 + 1`（→4）；`stat3 响应分钟 = rng%20 + 2` |
| 医院 | `stat3 = fund(health)/2`（年费 $50）；`病人 = pop / max(1, 医院数×25) + rnd(0x0F)`，若 > 1000 则 `1000 + rnd(0x7F)`；`stat1 = popCap(病人, 30)`；`医生 = popCap(max(0, fund + rnd(7) + 2·stat0 − 24), 120)` → `stat2`；`stat0 = score(10·stat1, stat2, 5, 50, 111)`；床位恒显 1000 |
| 学校 | `stat3 = fund(school)/4`（年费 $25）；`stat3 < 20` → 事件 `fundeducation`；`学生 = (cohort[1] + cohort[2]) / max(1, 学校数) + rnd(0x0F)`，> 1500 则 `1500 + rnd(0xFF)`；`stat1 = popCap(学生, 20)`；`教师 = popCap(max(0, rnd(7) + 6·fund/10 + stat0 − 12), 100)` → `stat2`；`stat0 = score(stat1, stat2, 3, 15, 52)`；任一学校评分 < 4 → 事件 `fundeducation`；容量恒显 1500 |
| 大学 | `stat3 = fund(college)`（年费 $100）；`学生 = cohort[3] / max(1, 大学数) + rnd(0x1F)`，> 5000 则 `5000 + rnd(0x1FF)`；`stat1 = popCap(学生, 30)`；`教师 = popCap(max(0, rnd(0x0F) + 2·fund + 4·stat0 − 48), 100)` → `stat2`；`stat0 = score(4·stat1, stat2, 5, 50, 111)`；容量恒显 5000 |
| 监狱 | `囚犯 = stat1 − stat1/4 + oldArrests / max(1, 监狱数)`，> 10000 则 `10000 + rnd(0x3FF)`；`stat1 = popCap(囚犯, 20)`；`stat2 狱警 = popCap(3·fund(police), 120)`；`stat3 = 囚犯/100`（"容量 %"）；`stat3 > 105` → 事件 `fundprison`（超员）；`stat0 越狱 = stat3 < 91 ? 0 : rng % (stat3 − 90 + (100 − fund(police))/10)`；容量恒显 10000 |
| 监狱加成 | 遍历完所有记录后：`prisonBonus = (监狱数 ≥ 1 && Σstat3/监狱数 ≤ 79) ? 1 : 0` → `MISC 0x103C`（dfloer 称 "Police Bonus"）。作用：警力强度 `(5+1)/2` 倍（+20%）、逮捕除数 5→4 |
| 体育场 | `观众 = (pop + arcoPop + adj) / max(1, 体育场数)`，> 25000 则 `25000 − rnd(0xFF)`；`stat1 = popCap(观众, 5) + rnd(0xFF)`；`stat0 胜场 = rnd(0x1F) + 9`（赛季 40 场，显示 `胜-负`）；`stat2` 球队索引（放置时选，0..4 足球/棒球/英式足球/板球/橄榄球），`stat3` 队名标签；球队位掩码存 `MISC 0x1028`；容量恒显 25000 |
| 动物园 | 四项全随机 `rng%100`（纯趣味） |
| 雕像 | `stat2 鸽子 = rng % 42` |
| 市政厅 | `stat1 雇员 = popCap(200, 900)` |
| 市长官邸 | `stat2 = 支持率 %`（§2.10.3）；若 `stat3 > 0`：`stat3--`，`stat0++`（趣味计数） |
| 博物馆（共享） | `stat1 = popCap(4·博物馆格数·fund(college), 20)`；`stat2 = (fund(college)/10)·博物馆格数` |
| 图书馆（共享） | `stat1 = popCap(4·图书馆格数·fund(school), 18)`；`藏书 stat2 += (fund(school) − 50)·格数`（仅当结果在 1..31999）；`stat0 = min(12, 300·格数·fund(school) / max(1,pop))` |
| 公园（共享） | `stat1 游客 = min(412·stat2_old, 65000, pop/6)`；`stat2 面积 = 小公园格 + 大公园格`；`stat3 = popCap(格数/9, 120)` |
| 码头（共享） | `stat1 船只 = popCap(rng%20 + 8·码头格数, 150)` |
| Llama Dome | `stat0 = rnd(0xFF)`；`stat1 = pop/8 + rnd(0x3FF)`；`stat2 = rnd(0x7F) + stat1/8`；`stat3 = rnd(0x3F) + stat1/16` |
| Arcology | 见 §2.8.3 |
| 净水厂 / 淡化厂 | `stat0 = 用水率% + rnd(7)`；`stat1 = rng%100`；`stat2 = min(rnd(0x1F) + 135, pop/50)` |
| 电厂 / 风电 / 水电 / 公交 / 铁路 / 地铁 | 归电水 / 交通规格（年龄 +1、负载 %、站数与乘客） |

### 2.7 人口学：年龄队列、EQ 与 LE（每月第 21 天）[高：OpenSC2K 对原版的还原；帮助文本语义互证]

状态：20 个队列 `k = 0..19`（年龄 5k..5k+4），每队列三个整数 `N_k`（人数）、`EQ_k`（教育点数总和）、`LE_k`（预期寿命总和），存 `MISC 0x007C + 12k`（dfloer："Population/Health/Education Graph Data 20 values each, interleaved"）。人口窗口的三张图就是这三列（EQ/LE 显示为 `EQ_k/N_k`、`LE_k/N_k`）。

```
if normalPop == 0: 全部清零; workforce* = 0; return

// 1) 容量与法令
healthCap  = (医院数 · fund(health) · 25) / 100            // 每座满资金 25 名受保护新生儿/月
schoolCap  = (学校数 · fund(school) · 15) / 100            // 每座 15 名升学者/月
collegeCap = (大学数 · fund(college) · 50) / 100           // 每座 50 名
newbornLE  = 85 + 5 · count(AntiDrug, CPRTraining, PublicSmokingBan 中已生效者)
if FreeClinics: healthCap += taxedResidentialPop / 400     // MISC 0x077C 首字

// 2) 死亡（k ≥ 1）
for k in 1..19 with N_k > 0:
  avgLE = LE_k / N_k;  survival = 100 · avgLE / (5k)
  if survival < 100:
    scaled = (100 − survival) · N_k / 24          // 单位 1/100 人
    deaths = scaled / 100 + (rng%100 < scaled%100 ? 1 : 0); deaths = min(deaths, N_k)
    EQ_k −= EQ_k·deaths/N_k; LE_k −= LE_k·deaths/N_k; N_k −= deaths

// 3) 老化与升学（从老到幼，避免同月连跳）
pollutionPenalty = min(3, pollutionTotal / (normalPop + 10·abandonedPop + 1))
for target in 19 down to 1:
  src = target − 1; if N_src == 0: continue
  moved = N_src/60 + (rng%60 < N_src%60 ? 1 : 0); moved = min(moved, N_src)   // 每月 1/60 ⇒ 5 年升一级
  eqMoved = EQ_src · moved / N_src; EQ_src −= eqMoved
  if target < 3:   eqMoved += min(moved, schoolCap) · 35         // 5–14 岁两次各 +35（学校）
  if target == 3:  eqMoved += (min(moved, collegeCap) · eqMoved / moved) / 2   // 15–19 岁：受高教者 EQ ×1.5
  if !ProReading:  eqMoved = max(0, eqMoved − moved)              // 不读书每升一级每人 −1
  EQ_target += eqMoved
  leMoved = LE_src · moved / N_src; LE_src −= leMoved
  LE_target += leMoved − pollutionPenalty
  N_src −= moved; N_target += moved

// 4) 出生（20–44 岁）
fertile = Σ N_4..N_8
births = fertile/300 + (rng%300 < fertile − 300·pollutionPenalty ? 1 : 0)
if births > 0:
  protected = min(births, healthCap)
  LE_0 += (newbornLE − 35)·protected + 35·births          // 没有医院容量的新生儿寿命基数只有 35
  EQ_0 += births · workforceEQ / 5
  N_0  += births

// 5) 迁入/迁出，使 Σ N_k == normalPop
if ΣN < normalPop: 迁入 diff 人：portion = diff/16 + 1，轮询队列 4..7，再 0..11，每次加 min(portion, 剩余)：
     LE_k += (65 − k)·n；EQ_k += (k < 3 ? 17 + 35k : 90 − k)·n
else if ΣN > normalPop: 迁出 diff 人：按各队列人数比例扣减（含比例的 EQ/LE），余数随机补 1，循环直到够数

// 6) 劳动力（20–54 岁）
W = Σ N_4..N_10
workforcePct = W > 0 ? 100·W / (normalPop + 1) : 0      → MISC 0x0044
workforceEQ  = W > 0 ? Σ EQ_4..10 / W : 0               → MISC 0x004C（图表 Education）
workforceLE  = W > 0 ? Σ LE_4..10 / W : 0               → MISC 0x0048（图表 Health）
```

量级校准：迁入者 EQ ≈ 85、LE ≈ 60；本地出生并读完 K-12 的孩子 EQ = 父辈/5 + 70，再上大学 ×1.5，之后每 5 年 −1；因此 EQ 长期在 80–150 之间，`> 130` 为"高教育"。LE 由"出生时是否有医院容量"主导：10 万人口城市每月约 115 名新生儿，需要 ≥ 5 座满资金医院才能全部保护，这与社区实测"每 15,000–25,000 人一座医院"一致。污染惩罚每次转移最多 −3，是弱项。

EQ/LE 的消费者：报纸 `loweducation`（EQ < 80 且 `EQ < rng%80`）/ `higheducation`、`lowhealthcare` / `highhealth`（LE 阈值 70，Q6）；市长抱怨权重 `max(0, 100 − EQ)`、`max(0, 70 − LE)`；产业需求：`EQ > 130` 高科技产业（航天/金融/传媒/电子）×1.2，`> 100` 中科技 ×1.1，`< 60` 高科技 ×0.8（产业规格）；新生儿 EQ 继承 `workforceEQ/5`。

### 2.8 奖励、军事基地与 Arcology

#### 2.8.1 里程碑（每月第 22 天）[高]

`progression`（`MISC 0x0020`，dfloer "City Status"）从 0 开始；阈值表 `[2,000; 10,000; 30,000; 60,000; 90,000; 120,000; 500,000; 1,000,000; 5,000,000; 10,000,000]`，比较对象是 **`normalPop`（不含 Arcology）**，且必须 **严格大于**。每月最多前进一级：

| 进度 p | 触发人口 | 奖励 | `MISC 0x0078` 位 |
|---|---|---|---|
| 1 | > 2,000 | 市长官邸可放置 | bit0 |
| 2 | > 10,000 | 市政厅可放置 | bit1 |
| 3 | > 30,000 | 雕像可放置 | bit2 |
| 4 | > 60,000 | **军事基地提案**对话框（模态，接受/拒绝） | – |
| 5 | > 90,000 | Llama Dome 可放置 | bit3 |
| 6 | > 120,000 | Arcology 子菜单可用（还需至少一种 Arcology 已发明） | bit4（每次重建位掩码时按条件置位） |
| 7–10 | > 50 万 / 100 万 / 500 万 / 1000 万 | 仅报纸成长故事 | – |

每级触发一条 `genpopulationstory`（参数 = 旧进度）。奖励建筑每种只允许存在一座；被毁后可再次放置 **[中]**。阈值只看 `normalPop`，所以靠 Arcology 堆人口不能解锁后续奖励。

#### 2.8.2 军事基地 [中（选址细节）/ 高（类型枚举与生长规则）]

- 提案只出现一次。拒绝 → `MISC 0x0E4C = 1`，永不再提。接受 → 游戏自动找一块空地划为军事分区（`XZON = 7`），类型写 `0x0E4C`：2 陆军 / 3 空军 / 4 海军 / 5 导弹井；找不到合适位置也记 1。选址启发式 **[低]**：优先靠海岸且有 ≥2 深水的矩形 → 海军；大片平地（≥ 12x12）→ 空军；丘陵 → 导弹井；否则陆军；面积建议 12x12（空军 16x16）。
- 生长（生长扫描访问到军事区格时，不查供电，每次 1/4 概率尝试）：陆军：`机库1(0xE8)格数/12 < 军用停车场(0xEF)格数/4 ? 机库 : 停车场`；空军：机场规则（§2.9）但用军用停车场 / 军用塔台 0xE2 / F-15 0xE7 / 机库 1；海军：海港规则但第二件为 Top Secret 0xF1、仓库 0xE3；导弹井：每格放 0xF9（地下 `XUND 0x22`）。军事格计数单独存 `MISC 0x0FA8..`（dfloer 表）。
- 效果：陆/空/海军提供"军事调度"单位（灾害规格）；基地不交税、不计分区人口；跑道/停机坪/战机各污染 10/格；占地格人口权重 2。原版关于"基地带来犯罪"的说法未在模型中找到依据，不实现。

#### 2.8.3 Arcology [高]

- **解锁**：`progression ≥ 6` 且 `MISC 0x0768..0x0774` 中至少一项 `== 0`（已发明）。发明年份 = 基准年 + `rng%20`（基准 2000/2050/2100/2150 **[中]**）。
- **每月状况（stat0，0..12 → 等级）**：生长扫描访问到 Arcology 的 TR 角位格（`XZON & 0x80`）时：

```
cond = (XVAL[h] >> 5) − (XCRM[h] >> 5) − (XPLT[h] >> 5) + 12
if !POWERED: cond /= 2;  if !WATERED: cond /= 2
stat0 = clamp(cond, 0, 12)
```

- **每年入住（stat2 居民）**：

```
cap1000 = stat1 (55/30/45/65)
room    = popCap(int16(cap1000·100), 20·arcoCount)            // 年增上限：≤ 5,500 且 ≤ 总人口/(20·座数)
taxEff  = (60 − taxR − taxC − taxI) / 6 + stat0               // 三类税率各 7% 时 ≈ 6 + 状况
growth  = min((5·taxEff − 50)·40, room)                       // taxEff < 10 时为负：高税 + 差环境 → 流失
stat2   = min(stat2 + stat2/50 + growth, cap1000·1000) + int16(rng & 0x3F)
arcoPop += stat2 (& 0xFFFF)                                   → MISC 0x1020
```

- **升空**：年度更新末尾若 `Launch Arcology 数 > 300` 且 `arcoPop > 6,000,000` → 所有 Launch Arcology 变瓦砾（爆炸音效/特效），每座 +$100,000，前后各一条公告。社区记载"2051 年以后"，逆向未见年份条件（Q7）。
- **对其他系统**：`XPOP` 权重 12/格、污染 10–25/格，所以 Arcology 周围犯罪与污染都重；`citySize = normalPop + arcoPop`；需求模块把 `arcoPop/6` 计入住宅税基、`/12` 计入商业与工业（分区规格）；里程碑不计 arcoPop。

### 2.9 海港与机场的自动生长 [高]

两者都是分区（`XZON` 9 / 8），玩家只划区付费，建筑由生长扫描逐月长出；锚点格必须供电（`has_power`）。每次访问 3/4 概率什么都不建（海港：若该格是起重机则 1/4 概率派出货轮；机场：若该格是跑道且供电，1/30 概率起飞，其中 40% 为直升机），1/4 概率按"配比"选一件：

**海港**（`N()` 只数本分区类型，军事另算）：

```
if N(货场 0xF2)/4 >= N(起重机 0xE0): 建 起重机 + 栈桥（栈桥 0xDF 从起重机朝水面延伸 1..4 格，水深 ≥ 2；放不下则失败）
elif N(装卸位 0xF0)/4 < N(起重机): 建 装卸位
elif N(仓库 0xE3)/3   < N(起重机): 建 仓库
else: 建 货场
失败则回退建 仓库
```

即稳态配比：每台起重机 ≈ 4 货场 + 4 装卸位 + 3 仓库 + 1 栈桥。**只有起重机数**进入工业需求 cap 与"需要海港"判定（dfloer），所以海港必须临水（否则永远长不出起重机）。

**机场**：

```
G = (N(跑道 0xDD) + N(跑道十字 0xDE)) / 5           // "跑道组"
if N(停车场 0xEE)/4 >= G: 建 跑道（一次铺一条 5 格直跑道；与既有跑道交叉处改为十字）
elif N(塔台 0xE1)·2 < G: 建 塔台
elif N(雷达 0xEA)·2 < G: 建 雷达
elif N(停机坪 0xE6)  < G: 建 停机坪
elif N(航站楼1 0xE4)/2 < G: 建 航站楼 1
elif N(航站楼2 0xE5)/2 < G: 建 航站楼 2
elif N(机库 0xF6)/4 < G: 建 机库
else: 建 停车场
```

跑道按 5 格一组，所以机场矩形的一边至少 5 格；建议 UI 提示最小 5x6。`G`（跑道组数）进入商业需求 cap 与"需要机场"判定；坠机灾害需要存在跑道格。

### 2.10 这些量如何反作用

#### 2.10.1 对分区生长 [高]

- **密度门槛**（R 与 C；工业不受地价限制）：建筑从密度级 1→2 需 `XVAL > 31`，2→3 需 `> 95`，3→4 需 `> 191`（sc2kfix 常量 32/96/192 与 OpenSC2K 的 0x1F/0x5F/0xBF 互证）。轻区永远停在级 1。
- **贫富档**：新 1x1 住宅按 `XVAL >> 6` 选档：0–63 低档、64–127 中档、≥128 豪宅。分区规格的 85/170 阈值应改为 64/128（见 Q1）。
- **废弃建筑**使所在半格地价减半 → 加速周边衰退。
- 行程失败（找不到目的地）→ 生长压力 0 → 只会衰退；成功 → 压力 = 需求 + 2000。
- 供水只经地价 +4/格 影响生长（电水规格）。

#### 2.10.2 对税收与财政 [高（税收不看地价）/ 中（城市价值）]

- 税收 = `税率 × 人口 / 75`，与地价无关（dfloer）。
- **城市价值**（`MISC 0x0024`，债券窗口"City Value"与信用评级用）= 地铁格数 × $100 + 电线 $2/格 + 道路 $10/格 + 铁路 $25/格 + 隧道 $15/格 + 桥/高速 $100/格 + 地铁入口 $250/格 + Σ（各公共建筑/电厂/Arcology 的 `格计数 / 每座格数 × 造价`，造价即 §2.2 价格表；水塔/公交站/净水厂/图书馆 ÷4，3x3 ÷9，4x4 ÷16）。原版每天重算（sc2kfix 修正后）；原版把煤电按 $40,000、动物园与体育场互换等若干 bug，我们按正确表计算。
- 预算年费：`月费(cat) = Σ_座 年费 × fund% / 100 / 12`，按月累加到"年度至今"（预算规格）。

#### 2.10.3 市长支持率（市民满意度）[高]

每年 1 月（预算结算、年度微模拟之前）做 100 次抽样调查：

```
w = [ trafficGraph, pollutionGraph, crimeGraph, unemploymentPct, 3·resTaxRate,
      max(0, 100 − workforceEQ), max(0, 70 − workforceLE) ]          // 7 类抱怨
total = landValueGraph + 50 + Σ w
if total == 0 || normalPop < 100: 支持率不变
else: approve = 0; for 100 次: r = rng % total; 依次减去 w[i]，落在哪类就记一次抱怨；减不完（落在 landValue+50 的余量）则 approve++
approval = approve (%)  → 市长官邸 stat2；排序后的抱怨类别给顾问/报纸 "genrichgripestory"
上升跨过 80% → 游行公告 + 音效
```

其中 `*Graph` 为图表当前值：`pollutionGraph = pollutionTotal / (developedTiles/4 + 1)`，`crimeGraph`、`landValueGraph` 同式，`trafficGraph = trafficReport().graph`（§2.4，最近一次第 19 天的值）。于是提高地价、压低犯罪/污染/交通/失业/住宅税、提高 EQ/LE 都直接抬升支持率。

#### 2.10.4 诉求、状态栏与报纸 [高（判定序）/ 中（机场与休闲项）]

状态栏每月显示**第一条**未满足诉求（顺序即优先级）：

```
weather ≥ 9（暴雪/飓风/龙卷）→ 天气提示
powerUsage ≥ 99% → needpower
normalPop/100 ≥ 地铁站数 + 火车站数 + 道路格数 → needroad（交通容量）
normalPop < 1,000 → 无
u = normalPop / 20,000
u ≥ 警局数 + 监狱数 → needpolice            // 1,000..19,999 人就需要第 1 座
u ≥ 消防局数 → needfire
waterUsage ≥ 99% → needwater
normalPop < 3,000 → 无
normalPop/25,000 ≥ 医院数 → needhospital
u ≥ 学校数 → needschool
normalPop < 8,000 → 无
起重机数 + 工业连接数 < 工业人口/10,000 → 有水体则 needseaport，否则 needconnections
跑道组数 + 商业连接数 < 商业人口/10,000 → needairport                      [中]
normalPop ≥ 10,000 且 R 人口被休闲 cap 压制 → 随机 needpark/needzoo/needstadium/needmarina  [中]
```

注意"≥"：人口 20,000–39,999 需要 ≥ 2 座警局；监狱可顶替警局计数。报纸同名故事由同一判定驱动（每种每年至多一次，报纸规格）。另外每月随机：`rng&0x7F < crimeGraph` → `highcrime`，`crimeGraph < rng&0x0F` → `lowcrime`，污染/交通同式；`loweducation` 见 §2.7。灾害"骚乱"由失业 ≥10%、热度 >170、人口 >30,000 触发（dfloer），警局调度单位用于镇压。

#### 2.10.5 法令在本模块内的效果汇总 [高]

| 法令 | 效果 |
|---|---|
| Neighborhood Watch | 每个分区建筑格给所在四分格 `XPLC +2`（上限 254；一个满 4x4 块 +32） |
| Volunteer Fire Dept. | 同上作用于 `XFIR` |
| Legalized Gambling | 每个已开发半格犯罪源 +16 |
| Pollution Controls | 污染分母 +1（约 −10%） |
| Pro-Reading Campaign | 老化时 EQ 不衰减 |
| Anti-Drug / CPR Training / Public Smoking Ban | 新生儿 LE 各 +5 |
| Free Clinics | 医疗容量 + 住宅税基/400 |
| Junior Sports | 未发现模型效果（参数 `juniorSportsLEBonus` 默认 0） |
| Homeless Shelter | 帮助文本称"略升市中心地价"，模型中未见；不实现 |

---

## 3. 数据结构与算法建议

### 3.1 TypeScript 接口

```ts
export const enum XbldId {
  SmallPark = 0x0D, CityHall = 0xD0, Hospital = 0xD1, Police = 0xD2, Fire = 0xD3, Museum = 0xD4,
  BigPark = 0xD5, School = 0xD6, Stadium = 0xD7, Prison = 0xD8, College = 0xD9, Zoo = 0xDA, Statue = 0xDB,
  Runway = 0xDD, RunwayCross = 0xDE, Pier = 0xDF, Crane = 0xE0, CivTower = 0xE1, MilTower = 0xE2,
  PortWarehouse = 0xE3, Terminal1 = 0xE4, Terminal2 = 0xE5, Tarmac = 0xE6, Fighter = 0xE7, Hangar1 = 0xE8,
  Radar = 0xEA, CivParking = 0xEE, MilParking = 0xEF, LoadingBay = 0xF0, TopSecret = 0xF1, CargoYard = 0xF2,
  MayorHouse = 0xF3, Library = 0xF5, Hangar2 = 0xF6, Church = 0xF7, Marina = 0xF8, MissileSilo = 0xF9,
  Plymouth = 0xFB, Forest = 0xFC, Darco = 0xFD, Launch = 0xFE, LlamaDome = 0xFF,
}

export type BudgetCategory = 'police' | 'fire' | 'health' | 'school' | 'college';
export type RewardKey = 'mayorHouse' | 'cityHall' | 'statue' | 'llamaDome' | 'arcologies';
export type ArcoKey = 'plymouth' | 'forest' | 'darco' | 'launch';

export interface FacilityDef {
  id: XbldId;
  key: string;                       // 'police' | 'fire' | ... 原创显示名由 i18n 表提供
  size: 1 | 2 | 3 | 4;
  cost: number;                      // 放置价格
  annualCost: number;                // 100% 资金时每座每年
  budget: BudgetCategory | null;
  microsimType: number;              // 0 = 无记录
  sharedRecord: number | null;       // 1..9 共享记录号；null = 独占
  pollutionPerTile: number;
  nimby: boolean;
  needsPower: boolean;
  reward: RewardKey | null;
  tech: 'airport' | ArcoKey | null;
  waterTilesRange: [number, number] | null;   // 码头 [1, 8]
}

/** 八张图层，长度固定；索引 = 与 XBLD 相同的主次序在低分辨率下的换算 */
export interface DataMaps {
  xtrf: Uint8Array; xplt: Uint8Array; xval: Uint8Array; xcrm: Uint8Array;   // 4096 = 64x64
  xplc: Uint8Array; xfir: Uint8Array; xpop: Uint8Array; xrog: Uint8Array;   // 1024 = 32x32
}

/** 城市中心：半格坐标与瓦片坐标（x = 2·hx）。运行时值，不入存档，不写 MISC（§2.3.2） */
export interface CityCenter { hx: number; hy: number; x: number; y: number }

/** 交通报告：第 19 天 decayTraffic 生成并缓存；读档后由 Σ XTRF 与 roadTileCounts 重建（§2.4 / §3.3） */
export interface TrafficReport {
  total: number;                           // 衰减后 Σ XTRF → MISC 0x0030（情景 trafficMax、图表 Traffic 原值）
  graph: number;                           // trunc(total / (1 + roadTiles + highwayTiles + bridgeTiles))：支持率 w[0]、hightraffic/lowtraffic、顾问
  roadTiles: number; highwayTiles: number; bridgeTiles: number;   // transport.roadTileCounts() 在第 19 天的快照
}

export interface DataMapTotals {
  pollution: number; landValue: number; crime: number;
  traffic: TrafficReport;                  // runDataMaps 不改交通，原样回传上月第 19 天的报告
  developedTiles: number;                  // 图表分母 developedTiles/4 + 1
  center: CityCenter;                      // 本月重算的城市中心（不写 MISC）
}

export interface MicrosimRecord { tileId: number; stat0: number; stat1: number; stat2: number; stat3: number }
export interface MicrosimStore { records: MicrosimRecord[]; /* 150 */ }   // 序列化为 XMIC

export interface DemographicCohort { count: number; eqSum: number; leSum: number }
export interface DemographicsState {
  cohorts: DemographicCohort[];            // 20
  workforcePct: number; workforceEQ: number; workforceLE: number;
}

export interface RewardState {
  progression: number;                     // MISC 0x0020
  grantedMask: number;                     // MISC 0x0078 bit0..4
  militaryBase: 0 | 1 | 2 | 3 | 4 | 5;     // MISC 0x0E4C
  prisonBonus: 0 | 1;                      // MISC 0x103C
  oldArrests: number;                      // MISC 0x1038
  stadiumTeams: number;                    // MISC 0x1028 位掩码
  mayorApproval: number;                   // 0..100
}

/** 只读环境（其他模块提供） */
export interface ServicesEnv {
  width: 128; height: 128;
  xbld: Uint8Array; xzon: Uint8Array; xter: Uint8Array; xbit: Uint8Array; xtxt: Uint8Array;
  tileCount(id: number): number;                       // MISC 0x01F0 表
  funding(cat: BudgetCategory): number;                // 0..100
  taxRate(z: 'r' | 'c' | 'i'): number;                 // 0..20
  taxedResidentialPop(): number;                       // MISC 0x077C 首字
  ordinances: ReadonlySet<OrdinanceId>;
  normalPop(): number; arcoPop(): number; abandonedPop(): number;
  cohortCount(k: number): number;                      // 人口学内部也用
  treatmentSufficient(): 0 | 1;                        // 水模块
  industrialPollutionBonus(): number;                  // 产业模块，已做 16 位符号扩展
  powerUsagePct(): number; waterUsagePct(): number;
  zonePop(z: 'r' | 'c' | 'i'): number;
  connections(): { commerce: number; industry: number };
  roadTileCounts(): { roadTiles: number; highwayTiles: number; bridgeTiles: number };   // transport §3.7 只读查询；trafficGraph 分母
  graphCurrent(series: 'pollution' | 'landValue' | 'crime'): number;   // 交通不在此：用本模块 trafficReport().graph（§2.4）
  unemploymentPct(): number;
  year(): number; invented(tech: FacilityDef['tech']): boolean;
  rng: Prng;
}

export interface ServicesTuning {
  landValueBase: 32;
  pollutionBaseDivisor: 4; radioactivePollution: 200; trafficPollutionDivisor: 5;
  trafficDecayShift: 2;                    // 第 19 天 XTRF -= XTRF >> shift；全系统唯一的交通衰减参数（transport 的同名参数已废弃）
  policeStrengthBase: 5; policeStrengthPrisonBonus: 1; strengthFundingDivisor: 2; fireStrengthMul: 5;
  patternRatios: { cardinal: [4, 5]; diagonal: [3, 4]; ring2: [2, 3]; ring3: [1, 2] };
  ordinanceCoverageStep: 2; gamblingCrime: 16;
  coverageScanSkipsBorder: true;           // 原版只扫 1..126
  serviceOriginCorner: 'TR' | 'TL' | 'center';   // 默认 'TR'
  densityLandValue: [31, 95, 191]; wealthShift: 6; // XVAL>>6
  milestones: readonly number[];           // 10 项
  arcoCapacity: Record<ArcoKey, number>;   // 55/30/45/65（千人）
  arcoBaseYear: Record<ArcoKey, number>;   // 2000/2050/2100/2150
  airportBaseYear: 1927;
  launchArcoThreshold: { count: 300; population: 6_000_000; bonus: 100_000 };
  nimby: { radius: 8; rollRange: 200 };
  demographics: { healthPerHospital: 25; schoolPerSchool: 15; collegePerCollege: 50; newbornLE: 85; ordinanceLE: 5;
                  agingDivisor: 60; birthDivisor: 300; mortalityDivisor: 24; schoolEQ: 35; maxPollutionPenalty: 3;
                  unprotectedNewbornLE: 35; immigrantLEBase: 65; immigrantEQBase: 90 };
  legacyInt16Wrap: boolean;                // popCap 的 16 位截断
  legacyMarkBitExport: boolean;            // 导出时是否把 developedHalf 写进 XBIT 0x08
  recomputeOnLoad: boolean;                // 读档后是否立即重跑 runDataMaps（默认 false）；cityCenter / trafficReport 的重建不受此开关影响（§3.5 onLoad）
  juniorSportsLEBonus: 0;
}
```

### 3.2 图层重算伪代码

```
function runDataMaps(env, maps, t: ServicesTuning): DataMapTotals
  W = 128; H2 = 64; Q = 32
  // --- 污染
  src = Int32Array(H2*H2)
  for hx, hy: src = maps.xtrf[h]/5 + maps.xplt[h] + Σ POLL/radioactive over 4 tiles      (§2.3.1)
  D = max(1, t.pollutionBaseDivisor + env.treatmentSufficient() − env.industrialPollutionBonus() + (PollutionControls?1:0))
  newPlt = Uint8Array(4096); pollutionTotal = 0
  for h: (num, den) = (2*src[h], D); for n in inBoundsNeighbors4(h): num += src[n]; den++
         newPlt[h] = min(255, floor(num/den)); pollutionTotal += newPlt[h]
  // --- 中心（运行时值，不写 MISC）
  center = computeCityCenter(env.xbld); state.cityCenter = center; (cx, cy) = (center.hx, center.hy)   (§2.3.2)
  // --- 宜居度与开发标记
  R = Int32Array(Q*Q); I = Int32Array(Q*Q); developedHalf = Uint8Array(4096); developedTiles = 0
  for each tile: accumulate per §2.3.3 table; mark developedHalf
  // --- 地价
  newVal = Uint8Array(4096); landTotal = 0
  for h where developedHalf[h]: v = formula(§2.3.4) using newPlt, maps.xcrm (old), maps.xpop (old)
         newVal[h] = clamp(v,0,255); landTotal += newVal[h]
  // --- 覆盖与人口源
  popW = Int32Array(Q*Q); plc = Uint8Array(1024); fir = Uint8Array(1024)
  (sP, sF) = strengths(env, t)
  for x in 1..126, y in 1..126: per §2.3.5 (ordinance +2, POPWEIGHT, station patterns at origin corner)
  // --- 密度 / 增长
  newPop, newRog per §2.3.5 using maps.xpop, maps.xrog (old)
  // --- 犯罪
  c = Int32Array(4096)
  for h: c[h] = developedHalf[h] ? newPop[q(h)] − newVal[h]/4 − plc[q(h)]/2 + (Gambling?16:0) : 0
  newCrm = mean5clamp(c); crimeTotal = Σ newCrm
  // --- 提交（整体替换，保证读档/重放一致）
  maps.xplt = newPlt; maps.xval = newVal; maps.xplc = plc; maps.xfir = fir; maps.xpop = newPop; maps.xrog = newRog; maps.xcrm = newCrm
  return { pollution: pollutionTotal, landValue: landTotal, crime: crimeTotal, traffic: state.trafficReport /* 上月第 19 天，不变 */, developedTiles, center }

function addPattern(grid: Uint8Array, qx, qy, S)
  put(qx, qy, S)
  A = floor(S*4/5); for (dx,dy) in cardinal4: put(qx+dx, qy+dy, A)
  B = floor(A*3/4); for (dx,dy) in diagonal4: put(qx+dx, qy+dy, B)
  C = floor(B*2/3); for m in [-2,2], k in [-1,0,1]: put(qx+m, qy+k, C); put(qx+k, qy+m, C)
  Dv = floor(C/2); for m in [-3,3], k in [-1,0,1]: put(qx+m, qy+k, Dv); put(qx+k, qy+m, Dv)
                   for dx in [-2,2], dy in [-2,2]: put(qx+dx, qy+dy, Dv)
  where put(x,y,v): if 0<=x<32 && 0<=y<32: grid[i] = clamp(grid[i]+v, 0, 255)

function mean5clamp(a: Int32Array /*64x64*/): Uint8Array
  for h: num = a[h]; den = 1; for n in inBoundsNeighbors4(h): num += a[n]; den++
         out[h] = clamp(floor(num/den), 0, 255)
```

复杂度：O(16384) 若干遍，每月一次，可忽略；若要每日 UI 预览可缓存上次结果。所有除法为向零截断的整数除法（TS 用 `Math.trunc` 或 `| 0`；注意负数：`v -= v/2` 对负 v 也应向零截断）。

### 3.3 交通接口（本模块是 `XTRF` 的唯一 owner；transport 只调用 `addTraffic`、只读其余）

```ts
export interface TrafficOwner {
  /** transport.runTrip 成功时，对路径上进入模式为 ROAD/HIGHWAY/ROADBRIDGE 的格各调用一次；weight = popLevel 1..4 */
  addTraffic(tileIndex: number, weight: number): void;     // h = halfIndex(tileIndex); xtrf[h] = min(255, xtrf[h] + weight)
  /** 第 19 天由日程调用恰好一次；衰减、写 MISC 0x0030、返回并缓存 TrafficReport */
  decayTraffic(): TrafficReport;
  /** 最近一次 decayTraffic（或读档重建）的结果；任何时刻可读，不触发计算 */
  trafficReport(): TrafficReport;
  /** 只读半格值（查询窗口、道路叠加精灵、直升机播报） */
  trafficAt(x: number, y: number): number;                 // xtrf[(x >> 1) + 64 * (y >> 1)]
  /** 只读视图：交给 transport.TransportLayers.traffic 与渲染层，不复制 */
  readonly xtrf: Readonly<Uint8Array>;                     // 4096
}
```

```
decayTraffic():
  for h in 0..4095: xtrf[h] -= xtrf[h] >> t.trafficDecayShift            // 默认 2
  c = env.roadTileCounts()                                                 // transport 只读查询
  total = Σ xtrf[h]
  misc.set(0x0030, total)
  state.trafficReport = { total, graph: trunc(total / (1 + c.roadTiles + c.highwayTiles + c.bridgeTiles)), ...c }
  return state.trafficReport

rebuildTrafficReportOnLoad():                       // 读档 / 新城后立即，不受 recomputeOnLoad 影响
  c = env.roadTileCounts(); total = Σ xtrf[h]; misc.set(0x0030, total)
  state.trafficReport = { total, graph: trunc(total / (1 + c.roadTiles + c.highwayTiles + c.bridgeTiles)), ...c }
```

不存在第二份 `XTRF` 缓冲、第二个衰减步骤或第二个总量公式：transport v2 §3.2 持有的是 `services.xtrf` 的只读引用，§3.7 的 `monthlyTraffic` / `trafficCountScale` / `trafficDecayShift` 已废弃；`economy-budget.md` 日程表第 19 天的 `trafficDecay` 条目应只指向本节。单元测试：(1) 第 19 天 `decayTraffic` 返回后立即 `Σ XTRF == MISC 0x0030`，之后每次 `addTraffic(_, w)` 使 `Σ XTRF − MISC 0x0030` 恰增 `w`（饱和除外）；(2) 移除 transport 的所有日程挂钩后，`XTRF` 的月际变化仅来自 `addTraffic` 与 `decayTraffic`；(3) `roadTileCounts()` 全为 0 时 `graph == total`（分母 1）。

### 3.4 放置与微模拟分配

```
function placeFacility(env, def, x0, y0): PlaceResult
  if def.reward && !(rewards.grantedMask & bit(def.reward)): return 'locked'
  if def.tech && !env.invented(def.tech): return 'locked'
  if def.reward && existsOnMap(def.id) && def.reward != 'arcologies': return 'alreadyBuilt'
  if funds < def.cost: return 'noFunds'
  if !footprintValid(def, x0, y0): return 'badTerrain'          // 地形规格；码头检查水格数 ∈ [1,8]
  if def.nimby && rng.int(0, 199) < residentialTilesAround(x0, y0, def.size, 8): return 'nimbyRefused'
  if def.microsimType && !def.sharedRecord && !freeRecord(): return 'noMicrosimSlot'
  pay(def.cost); writeTiles(def, x0, y0)                        // XBLD、XZON 角标、XBIT 预置位
  if def.id == Statue: clearPowerable(x0, y0)
  if def.budget: budget[def.budget].count++
  if def.id == Stadium: team = pickTeamDialog(); rewards.stadiumTeams |= 1 << team
  r = def.sharedRecord ?? allocateRecord(def.id)                // Arcology 优先复用 tileId < 0xFB 的空槽
  initRecord(r, def, env)                                       // §2.6.1 表
  for each tile in footprint: xtxt[tile] = 0x33 + r; if !def.sharedRecord: xlab[0x33+r] = defaultName(def)
  requestPowerScan(); requestWaterScan()
  return 'ok'
```

拆除：`xtxt` 清 0；独占记录 `tileId = 0`（其余字段清零）；预算计数 −1；共享记录保留。

### 3.5 年度更新与人口学

```
onYearSettled(env):               // 1 月预算结算后，预算扣款之前
  mayorApproval = surveyApproval(env, rng)                        (§2.10.3)
  for r in 1..149 in order: switch records[r].tileId → 公式表 §2.6.2（随机调用顺序 = 记录顺序）
  rewards.oldArrests = Σ 警局 stat3 (cap 65535)
  rewards.prisonBonus = prisons ≥ 1 && Σ 监狱 stat3 / prisons ≤ 79 ? 1 : 0
  arcoPop = Σ Arcology stat2;  if launchCount > 300 && arcoPop > 6e6: launchAll()
  emit fundeducation / fundprison / oldpowerplant events

onDay19(env): state.trafficReport = decayTraffic(env)              (§3.3；全游戏唯一的 XTRF 衰减点，写 MISC 0x0030)
onDay21(env): runDemographics(env, state, rng)                    (§2.7 伪代码照搬)
onDay22(env): checkMilestones(env)                                (§2.8.1)
onDay24(env): status = cityStatus(env)                            (§2.10.4)
onGrowthVisit(tile): if isArco(xbld[tile]) && (xzon[tile] & 0x80): updateArcoConditions(tile)   (§2.8.3)
                     else if zone ∈ {7,8,9}: specialZoneGrowth(tile)                               (§2.9)
onLoad(env):  state.cityCenter = computeCityCenter(env.xbld)      (§2.3.2；不读 MISC 0x1018/0x101C)
              state.trafficReport = rebuildTrafficReportOnLoad(env)   (§3.3)
              if t.recomputeOnLoad: runDataMaps(env, maps, t)     (§3.6；默认 false)
```

### 3.6 存档映射

| 本模块状态 | 存档位置 |
|---|---|
| 八张图层 | `XTRF` `XPLT` `XVAL` `XCRM`（4096B）、`XPLC` `XFIR` `XPOP` `XROG`（1024B），RLE 压缩 |
| 总量 | `MISC 0x0028 / 0x002C / 0x0034`（第 2 天写）；`0x0030`（第 19 天写 = 衰减后 `Σ XTRF`；读档后由 `Σ XTRF` 重建覆盖，§2.4） |
| 城市中心 | **不存档**。运行时由 `XBLD` 重算（读档后立即、每月第 2 天）。`MISC 0x1018 / 0x101C` 本模块既不读也不写——按 dfloer 为视图中心，归 `ui-art.md` §2.7 / `file-formats.md` §2.3.1（Q2） |
| `TrafficReport` | 不存档；读档后由 `Σ XTRF` 与 `transport.roadTileCounts()` 重建（§3.3） |
| 城市价值 | `MISC 0x0024` |
| 年龄队列 | `MISC 0x007C + 12k`（count, eqSum, leSum 各 u32） |
| 劳动力 | `MISC 0x0044 / 0x0048 / 0x004C` |
| 里程碑 / 奖励位 / 军事基地 | `MISC 0x0020 / 0x0078 / 0x0E4C` |
| Arcology 人口 / 球队 / 逮捕 / 监狱加成 | `MISC 0x1020 / 0x1028 / 0x1038 / 0x103C` |
| 微模拟 | `XMIC`（150×8，u16 大端）；标签 `XTXT`、名字 `XLAB`（25 字节 Pascal 串） |
| 预算计数与资金 % | `MISC 0x0998..0x0DD0`（预算规格写，本模块读 `+4` 的资金%） |
| `developedHalf` | 不存档（每月重建）；`legacyMarkBitExport` 打开时写进 `XBIT` 的 `0x08` 位以便与原版存档逐位对照 |
| 市长支持率 | 市长官邸记录 `stat2`；无官邸时不持久化（读档取 50） |

读档后（顺序固定）：电/水扫描 → `computeCityCenter(XBLD)` → `rebuildTrafficReportOnLoad()` → （可选）`runDataMaps`。原版载入时图层来自存档可直接显示，所以 `runDataMaps` 由 `recomputeOnLoad` 开关控制（默认 false）；前两项不受该开关影响，**必须**执行（§4 第 21 条）。

---

## 4. 边界条件与易错点

1. **整数语义**：全部用 32 位整数与向零截断除法。`v -= v/2`、`(num/den)`、`XTRF/5`、`XVAL/4` 都是截断；负数出现于地价中间值与 Arcology `growth`。不要用 `Math.floor`（对负数结果不同）。
2. **16 位截断**：`popCap` 的 `max` 参数与 Arcology 的 `cap1000·100` 在原版是 16 位有符号；`legacyInt16Wrap` 默认开（存档数值兼容），关掉只影响 >32767 的夸张城市。
3. **产业污染加成的符号**：`MISC 0x1034` 低字 `0xFFFF` 表示 −1；读时做符号扩展，否则分母变成 65540 → 全城污染归零。
4. **图层主次序**：八张图层的索引必须与 `XBLD` 采用同一主次序再降采样；导入存档时若 `XTRF` 显示错位 90°，就是这里反了。单元测试：导入任一存档后 `Σ XVAL == MISC 0x0028`、`Σ XCRM == MISC 0x002C`。
5. **边界瓦片**：覆盖/人口扫描只跑 `1..126`，站点贴边放置不产生覆盖（原版如此）；地价与污染扫描含边界；四邻/五点平均对越界邻居只减分母，不补零。
6. **原点格**：站点图案以 `XZON & 0x80`（TR 角位）所在格的四分格为中心；1x1 建筑四位全置，无歧义。导入的存档若角标不规范，先按分区规格修复角标再算。
7. **废弃建筑**：人口权重 0、地价减半、`abandonedPop` 进污染惩罚分母；施工中的建筑权重按尺寸算（原版）。
8. **XPOP 的 ×4 与 255 饱和**使密区与 Arcology 犯罪源封顶在 255；不要"修复"这个饱和，否则犯罪模型失衡。
9. **犯罪平均包含未开发格的 0**：边缘小区犯罪天然偏低，这是原版行为。
10. **LAND_VALUE_BASE** 不是魔法数，是替代原版 bug 的校准值；改了会整体移动贫富档。
11. **月历顺序**：地价用上月犯罪，犯罪用本月地价；若把两步合并成一次"同时更新"会改变收敛行为。按 §2.1 顺序逐步替换数组，所有步骤读 `old` 用上月快照、读 `new` 用本月已算出的数组。
12. **断电站点**：强度减半而不是归零（dfloer 的 Q4 疑问由逆向解决）；断电 Arcology 状况减半、断水再减半。
13. **人口学的随机调用顺序**：死亡（按队列升序）→ 老化（按队列降序）→ 出生 → 迁出。顺序决定回放一致性。
14. **`healthCap/schoolCap` 是每月配额**而不是年配额；学校容量 15/座/月意味着一座学校每 5 年只能"教育" 900 人，这就是原版学校必须很多的原因。
15. **里程碑严格大于**且每月最多升一级；读档时若 `progression` 已 ≥ 阈值数组长度直接跳过。军事基地提案是模态交互：当天剩余阶段挂起，等待玩家答复后继续（引擎需支持"阶段挂起"）。
16. **NIMBY 在扣款前判定**，失败不扣款、不占槽位；判定用的是分区码而不是建筑。
17. **码头水格数**：全陆（0）与全水（9）都拒绝；栈桥由海港规则生成，码头本身不生成栈桥。
18. **微模拟槽位用尽**是真实的游戏限制（140 座独占建筑）；UI 要给出明确提示，而不是静默失败。
19. **共享记录的格计数**（图书馆/博物馆/公园/码头）用 `MISC 0x01F0` 的瓦片数（不是座数）；公式里的 `/9`、`/16` 由本模块统一处理。
20. **`XTRF` 单一 owner**：累加只经 `addTraffic`，衰减只在第 19 天 `decayTraffic`，`MISC 0x0030` 只在此处（以及读档重建）写入，`trafficGraph` 只有 §3.3 一个公式。任何在 transport / zones 里出现的"顺便衰减一下"或自算交通计数都是错误（旧稿 transport §3.7 `monthlyTraffic` 已废弃）。原版 `0x0030` 的真实口径未知（Q4），不要用它反推图层，也不要对原版存档断言 `Σ XTRF == 0x0030`。
21. **城市中心与交通报告不入存档**：读档后 `runDataMaps` 默认不重跑（`recomputeOnLoad = false`），但 `computeCityCenter` 与 `rebuildTrafficReportOnLoad` **必须**跑，否则第一个第 2 天之前怪兽目标为 (0,0)、`trafficReport` 为空。本模块任何代码不得读写 `MISC 0x1018/0x101C`（视图中心，ui-art / file-formats 所有）。

---

## 5. 待确认问题

| # | 问题 | 当前取值 | 影响 |
|---|---|---|---|
| Q1 | 与 `zones-growth-demand.md` 的三处冲突：商业建筑 `poll` 权重（原版为 0）、贫富档阈值（原版 64/128 而非 85/170）、密度门槛（原版按 XVAL 31/95/191 而非需求 400/1200） | 以本文为准，建议分区规格修订 | 城市面貌、密度分布 |
| Q2 | `MISC 0x1018/0x101C` 是"视图中心"（dfloer；file-formats / ui-art 采用）还是"城市中心×2"（OpenSC2K 读法）**[中，待实机验证]** | 本模块**不读不写**这对字段；`cityCenter` 为运行时值，读档后与每月第 2 天由 `XBLD` 重算（§2.3.2）。字段归 ui-art / file-formats 作视图中心。验证法：在原版把镜头滚到地图一角后存档，看字段值等于滚动位置还是质心×2。若为质心×2：改 file-formats 导出器（`misc1018Semantics = 'center'`，取 `services.cityCenter()`）与 ui-art 的视口存储；本模块不变 | 存档互通、读档镜头位置；对本模块的模拟无影响 |
| Q3 | 图书馆/博物馆是否对 EQ 有直接作用（帮助文本说有，逆向的人口学里没有） | 无直接作用；参数 `libraryEQPerTile = 0` | 教育城市策略 |
| Q4 | `MISC 0x0030` 交通总量的口径（dfloer："不是 XTRF 之和"）**[低]** | 本模块（唯一 owner）定义为第 19 天衰减后 `Σ XTRF`；`graph = total / (1 + 道路格 + 高速格 + 桥格)`；transport v2 §2.12.6 已采用同一口径，读档后由 `Σ XTRF` 重建 | 仅图表与情景目标标度；若原版公式被确认，只改 §3.3 `decayTraffic` 一处，各消费者阈值（以 `graph` 表述）不动 |
| Q5 | 微模拟独占槽位 140 vs dfloer 的 139 | 140（记录 10..149） | 极端城市最后一座建筑能否放 |
| Q6 | `lowhealthcare/highhealth` 的 LE 阈值 | 70（与市长抱怨阈值一致） | 报纸频率 |
| Q7 | Launch Arcology 升空是否还要求年份 ≥ 2051 | 不要求 | 极晚期彩蛋 |
| Q8 | 军事基地选址算法与占地尺寸 | §2.8.2 的启发式 | 基地观感 |
| Q9 | 机场/海港分区单价（$250/$150 每格） | 如表 | 预算 |
| Q10 | Airport 科技基准年 | 1927 | 早期开局能否建机场 |
| Q11 | 奖励建筑被毁后能否重建、是否可重复放置 | 可重建，不可重复 | 玩家策略 |
| Q12 | 图书馆/博物馆/公园/码头共享记录的 `XLAB` 名字是否随第一座放置而写入 | 放置时若为空则写默认名 | 查询窗口显示 |
| Q13 | `XROG` 新城默认 0x7F（dfloer）与稳态 0x80 的差异来源 | 新城初始化写 0x7F | 增长图首月着色 |
| Q14 | 海港/机场 cap 公式：分区规格用"每起重机 10,000 / 每跑道十字 10,000"，OpenSC2K 读出 `(cranes+1+conn)×1500`、`((runways/5)×4+4)×375` | 由分区规格裁定；本模块只提供计数 | 港口城市的需求上限 |

---

## 6. 参考来源

- dfloer/SC2k-docs（CC BY-SA 4.0，本地副本 `refdocs/`）：`sc2_file_spec.md`（八张图层的尺寸与显示方式、`XBIT` bit4 "XVAL mask"、`XMIC` 结构与示例、`XTXT/XLAB` 标签区间、`MISC` 字段表、`XROG` 显示阈值、军事格计数、城市状态/奖励位）、`simulation_spec.md`（犯罪/地价/交通总量的存放、法令效果表、市民诉求阈值、NIMBY 建筑名单、骚乱触发、税收公式）、`text_data_spec.md`（`need*/fund*/high*/low*` 故事名）。
- araxestroy/sc2kfix（MIT，**仅阅读理解，未复制代码**）：`include/sc2k/sc2k_1996.h`（`XVALPOPLEVEL_LOW/MEDIUM/HIGH = 32/96/192`、`TILEPOPLEVEL_*`、`REWARDS_*`、`BUDGET_*`、`ADVICE_*`、城市统计全局变量名与注释、`microsim_t`、`MAX_MICROSIM_COUNT`）；`hooks/hook_tilegrowthorplacement.cpp`（Arcology 状况公式、地价门槛判定、NIMBY 判定窗口与 1/200 掷骰、雕像清 `POWERABLE`、预算计数自增、码头水格检查、海港/机场/军事区生长配比、行程生成器把建筑人口级写入 `XTRF` 半格）；`modules/sc2k_help.cpp`（原版帮助文本中的年费、2,000/10,000 奖励人口、服务语义——本文已转述）。
- nicholas-ochoa/OpenSC2K 原生模拟（**仅阅读理解，未复制代码**）：`sim/data_maps/coarse.rs` 与 `mod.rs`（污染源表与扩散分母、城市中心、宜居度表、三类地价公式、`LAND_VALUE_BASE` 的由来、覆盖图案与站点强度、人口权重、`XROG` 混合、犯罪源与平滑）、`sim/civic/education.rs`（年龄队列、容量、死亡/老化/出生/迁移、劳动力 EQ/LE）、`sim/civic/milestones.rs`（阈值表与奖励位）、`sim/civic/annual.rs`（全部微模拟年度公式、监狱加成、Arcology 入住与升空）、`sim/civic/mayor.rs`（支持率抽样）、`sim/disasters/weather.rs`（状态栏诉求顺序）、`sim/growth/special.rs`（海港/机场/军事配比）、`sim/growth/inputs.rs`（密度地价门槛）、`sim/growth/development.rs`（贫富档 `XVAL >> 6`）、`sim/infrastructure/traffic.rs`（月衰减）、`sim/reports/graphs.rs`（图表标度）、`sim/economy/city_value.rs`（城市价值表与造价/占地）、`sim/tools/catalog.rs`（工具价格与光标尺寸）、`sim/tools/commands/building/facilities.rs`（微模拟类型映射、初值、`popCap`）、`sim/tools/query/strings.rs`（微模拟字段语义与等级名）。本文所有伪代码与接口均为重新设计与重写。
- 网络检索摘要（patcoston.com、ludo.guide 在本环境无法直接访问，仅通过搜索摘要获取）：警局"200 名警员、年费 $100、约 20 街区"；医院 A 级约每 15,000 人一座；Arcology 容量 55k/30k/45k/60–65k 与 120,000 人口解锁；图书馆/博物馆"延缓 EQ 衰退"的社区说法（与 Q3 相关）。
- 作者的 SC2K 游戏经验：用于 Arcology/机场的基准年、军事基地选址等 **[中]/[低]** 项。
