# 领域规格：分区、生长与需求（RCI）

> 适用对象：`packages/sc2k` 的 `sim/zones`、`sim/demand`、`sim/industry`、`sim/neighbors` 实现者。
> 蓝本：SimCity 2000 Windows 95 Special Edition（下称 SC2K）。
> 置信度标注：**[高]** = 一手文档（dfloer/SC2k-docs）、游戏内可直接观察、或兄弟规格中标为 [H]/[高] 的逆向重实现口径；**[中]** = 多方社区共识 / 手册描述，细节数值为推断；**[低]** = 为了"可实现"而给出的合理推测；**[设计]** = 本项目自创、原版没有对应物的机制。**[低] 与 [设计] 项都必须做成 `ZoneTuning` / `DemandTuning` 的可调参数**，不要散落在代码中。所有未标注置信度的数值默认为 **[低]**。
>
> 修订说明（v2）：本版按评审意见把分区生长改为**原版口径**——道路可达委托 `transport-traffic.md` §2.11 的 24 偏移表、生长压力来自 `transport-traffic.md` §2.12 的出行结果 + 城市需求、密度与贫富档由 `services-models.md` §2.10.1 的地价门槛决定、供电采用 `power-water.md` §2.5 的"自身或 4 邻格"规则；删除了与 `services-models.md` 重复且冲突的 `XPOP/XROG/workforcePct` 产出；补上 Arcology 对税基与供需的作用。原自创评分模型降级为可选 `growthModel: 'score'`（§2.5.8）。

---

## 1. 概述

本模块回答五个问题：

1. **分区是什么**：住宅 R / 商业 C / 工业 I，各分轻（Light）/ 密（Dense）两档；编码存于 `XZON` 低 4 位。
2. **分区何时发展**：每月生长扫描访问到分区格时：道路可达（`hasAccess`）→ 供电（`hasPower`）→ 跑一次出行（`runTrip`）→ 出行成功时生长压力 = 城市需求 + 2000，失败为 0 → 掷骰决定生长 / 衰退 → 地价门槛决定能升到第几级密度、以及贫富档次。
3. **建筑如何演化**：空地 → 施工 → 密度级 1（1x1）→ 2（2x2 A 组）→ 3（2x2 B 组）→ 4（3x3）；顶层后原地换档；反向为衰退 → 废弃 → 瓦砾。
4. **人口与就业怎么来**：由建筑表逐栋求和；R 人口 = 居民，C/I 人口 = 岗位；加上 Arcology 人口的分摊份额得到税基 `taxed.*`；劳动力 = 税基住宅人口 × `workforcePct`（由 services 的年龄队列给出）；派生 City Size、失业率与 `MISC` 计数。
5. **需求怎么算**：R 由岗位驱动，C 由居民与外部市场驱动，I 由外部市场与国家经济驱动并随年份把份额让给 C；再叠加税率、法令、容量上限（cap）、邻城连接、国家经济周期与随机扰动；工业内部再细分为 11 个产业。

**模块边界**

| 方向 | 数据 | 提供方 / 消费方 |
|---|---|---|
| 输入 | `XBIT.POWERED`（经 `env.poweredSelf(i)` / `env.hasPower(i)`）、`XBIT.WATERED`（`env.watered(i)`） | `power-water.md` |
| 输入 | `TransportQuery.hasAccess(x,y)`、`runTrip(x,y,zone,popLevel)`、邻城连接计数、`seaportCranes` / `airportRunwayGroups` | `transport-traffic.md` §2.11/§2.12/§2.13、`services-models.md` §2.9 |
| 输入 | 地价 `XVAL`（半格值 0..255） | `services-models.md` §2.3.4 |
| 输入 | `workforcePct`（`MISC 0x0044`）、`arcoPop`（`MISC 0x1020`）、`workforceEQ`（`MISC 0x004C`） | `services-models.md` §2.7 / §2.8.3 |
| 输入 | `XPOP` `XROG` `XCRM` `XPLT` `XTRF` | `services-models.md` 独占写；本模块在默认 `'trip'` 模型下**不读**这些图层（它们已折进 `XVAL`），只有 legacy `'score'` 模型与查询面板读 |
| 输入 | 法令位、三类税率、11 产业税率、年份、难度、PRNG | `economy-budget.md` |
| 输出 | `XBLD/XZON` 变化（分区建筑 `0x70–0xC5`、瓦砾 `0x01–0x04`、教堂 `0xF7`、树木清除） | 渲染 / 其他模块只读 |
| 输出 | `census: ZonePopulation`（res/com/ind/arco/normal/citySize/`taxed.*`/workforce/jobs/失业） | `economy-budget.md` 税收、`services-models.md` 诉求与里程碑 |
| 输出 | `demand: RciDemand`、`caps`、产业状态（含 `MISC 0x1034 industrialPollutionBonus`）、邻城状态 | UI、`services-models.md` 污染扩散 |
| 输出 | `MISC` 计数：`0x0074` resPop、`0x102C` normalPop、`0x0FA4` 失业人数、`0x05F0..0x060C` 分区格数、`0x01F0..0x05EC` 每种 XBLD 格数、`0x0718/071C/0720` 需求、`0x016C..` 产业、`0x06D8..` 邻城、`0x1024` 连接格数 | 存档 |
| 输出 | `XGRP` 的 City Size / Residents / Commerce / Industry / Unemployment 序列；"市民诉求"事件 | 图表 / 报纸 / 顾问 |
| **不再输出** | `XPOP`、`XROG`、`MISC 0x0044 workforcePct`、`MISC 0x1020 arcoPop` | 由 `services-models.md` §2.3.5 / §2.7 / §2.8.3 独占产出，本模块只读 |

---

## 2. 原版行为

### 2.1 分区类型与编码 [高]

`XZON` 每格 1 字节：高 4 位是建筑角标，低 4 位是分区码。

| 分区码 | 名称 | 简称 | 可达到的密度级 / 尺寸 |
|---|---|---|---|
| 0 | 无分区 | – | – |
| 1 | Light Residential | R-light | 级 1（仅 1x1） |
| 2 | Dense Residential | R-dense | 级 1–4（1x1 / 2x2 / 2x2 / 3x3） |
| 3 | Light Commercial | C-light | 级 1 |
| 4 | Dense Commercial | C-dense | 级 1–4 |
| 5 | Light Industrial | I-light | 级 1 |
| 6 | Dense Industrial | I-dense | 级 1–4 |
| 7 | Military | – | 军事基地（`services-models.md` §2.8.2） |
| 8 | Airport | – | 机场（`services-models.md` §2.9；本模块只读其跑道组数） |
| 9 | Seaport | – | 海港（同上；本模块只读起重机数） |
| 10–15 | 未使用 | – | – |

角标位（高 4 位）：`1000`=TR，`0100`=TL，`0010`=BR，`0001`=BL。1x1 建筑四位全置（`1111`）；多格建筑每格只置自己所在的那个角，中间格（3x3 的 5 个非角格）角标为 `0000` 但 `XBLD` 与角格相同。**本模块统计与访问建筑时以 TL 位为锚点**：1x1 也含 TL 位，因此"TL 位置 1 的格子数 = 建筑栋数"。（`services-models.md` 的覆盖扫描用 TR 位作"原点格"，两者只是各自内部约定，互不影响。）

"轻区只长 1x1、密区可长到 3x3" **[高]**。轻区与密区的 1x1 建筑使用同一组 `XBLD` ID。

### 2.2 分区操作（玩家侧）

| 操作 | 费用/格 | 置信度 | 规则 |
|---|---|---|---|
| 划轻区（R/C/I） | $5 | 中 | 可划在无建筑的陆地上；树木保留，建筑发展时自动清除 |
| 划密区（R/C/I） | $10 | 中 | 同上 |
| 对已划区格改划同类另一密度 | 按新密度收费 | 中 | 已有建筑保留（若由密改轻且建筑密度级 > 1，建筑进入衰退队列） |
| 对已划区格改划异类 | 按新类型收费 | 中 | 已有建筑立即变瓦砾 |
| 取消分区（Dezone） | $1 | 中 | 建筑变瓦砾，分区码归 0 |
| 推土机推建筑 | $1 | 高 | 产生瓦砾 `0x01–0x04`，分区码**保留** |
| 推土机推瓦砾 | $1 | 高 | 变回空地 `0x00` |

分区无维护费 **[高]**。分区不可划在水面；斜坡上的多格建筑限制见 §2.4。

### 2.3 分区建筑表 [ID / 尺寸 / level 高；tier 中；pop 低]

列定义：

- `level` = **密度级 1..4**，就是 `services-models.md` §2.3.5 的 `POPWEIGHT`（`building-catalogue.md` 的 `popW` 列）：1x1 → 1；2x2 "A 组" → 2；2x2 "B 组" → 3；3x3 → 4。它同时是出行生成器的 `popLevel` 参数（`transport-traffic.md` §2.12.1）和生长阶梯的台阶（§2.5.5）。
- `tier` = 贫富档（0 低 / 1 中 / 2 高），由地价 `XVAL >> 6` 决定（§2.6）。
- `pop` = 人口单位：R 为居民数，C/I 为岗位数（即游戏显示的 Commerce/Industry population）。
- `w` = 同 (zone, level, tier) 内的随机抽取权重。
- **本表不再有 `poll` 列**：污染源强度由 `services-models.md` §2.3.1 独占定义（R/C 全部为 0，I 按尺寸 6/12/18/24 每格），`building-catalogue.md` 已采用该口径。分区模块不定义、不消费污染权重。

**住宅 R**

| XBLD | 尺寸 | 名称（SCURK 名） | level | tier | pop | w |
|---|---|---|---|---|---|---|
| 0x70 | 1x1 | Lower Class Homes 1 | 1 | 0 | 24 | 10 |
| 0x71 | 1x1 | Lower Class Homes 2 | 1 | 0 | 24 | 10 |
| 0x72 | 1x1 | Lower Class Homes 3 | 1 | 0 | 24 | 10 |
| 0x73 | 1x1 | Lower Class Homes 4 | 1 | 0 | 24 | 10 |
| 0x74 | 1x1 | Middle Class Homes 1 | 1 | 1 | 24 | 10 |
| 0x75 | 1x1 | Middle Class Homes 2 | 1 | 1 | 24 | 10 |
| 0x76 | 1x1 | Middle Class Homes 3 | 1 | 1 | 24 | 10 |
| 0x77 | 1x1 | Middle Class Homes 4 | 1 | 1 | 24 | 10 |
| 0x78 | 1x1 | Upper Class Homes 1 | 1 | 2 | 24 | 10 |
| 0x79 | 1x1 | Upper Class Homes 2 | 1 | 2 | 24 | 10 |
| 0x7A | 1x1 | Upper Class Homes 3 | 1 | 2 | 24 | 10 |
| 0x7B | 1x1 | Upper Class Homes 4 | 1 | 2 | 24 | 10 |
| 0x8C | 2x2 | Small Apartments 1（Cheap apartments） | 2 | 0 | 200 | 10 |
| 0x8D | 2x2 | Small Apartments 2 | 2 | 0 | 200 | 10 |
| 0x8E | 2x2 | Small Apartments 3 | 2 | 0 | 200 | 10 |
| 0x8F | 2x2 | Medium Apartments 1（Nice apartments） | 2 | 1 | 200 | 10 |
| 0x90 | 2x2 | Medium Apartments 2 | 3 | 1 | 200 | 10 |
| 0x91 | 2x2 | Medium Condominiums 1 | 3 | 2 | 200 | 10 |
| 0x92 | 2x2 | Medium Condominiums 2 | 3 | 2 | 200 | 10 |
| 0x93 | 2x2 | Medium Condominiums 3 | 3 | 2 | 200 | 10 |
| 0xAE | 3x3 | Large Apartments 1 | 4 | 0 | 900 | 10 |
| 0xAF | 3x3 | Large Apartments 2 | 4 | 1 | 900 | 10 |
| 0xB0 | 3x3 | Large Condominiums 1 | 4 | 2 | 900 | 10 |
| 0xB1 | 3x3 | Large Condominiums 2 | 4 | 2 | 900 | 10 |

**商业 C**

| XBLD | 尺寸 | 名称 | level | tier | pop | w |
|---|---|---|---|---|---|---|
| 0x7C | 1x1 | Gas Station 1 | 1 | 0 | 16 | 10 |
| 0x7D | 1x1 | Bed & Breakfast Inn | 1 | 1 | 16 | 10 |
| 0x7E | 1x1 | Convenience Store | 1 | 0 | 16 | 10 |
| 0x7F | 1x1 | Gas Station 2 | 1 | 0 | 16 | 10 |
| 0x80 | 1x1 | Small Office Building 1 | 1 | 1 | 16 | 10 |
| 0x81 | 1x1 | Small Office Building 2 | 1 | 2 | 16 | 10 |
| 0x82 | 1x1 | Warehouse（商业仓库） | 1 | 0 | 16 | 10 |
| 0x83 | 1x1 | Toy Store（社区文档含店名，勿用作显示名） | 1 | 1 | 16 | 1 |
| 0x94 | 2x2 | Shopping Center | 2 | 1 | 150 | 10 |
| 0x95 | 2x2 | Grocery Store | 2 | 0 | 150 | 10 |
| 0x96 | 2x2 | Medium Office Building 1 | 2 | 1 | 150 | 10 |
| 0x97 | 2x2 | Resort Hotel | 2 | 2 | 150 | 10 |
| 0x98 | 2x2 | Medium Office Building 2 | 2 | 1 | 150 | 10 |
| 0x99 | 2x2 | Office/Retail | 3 | 0 | 150 | 10 |
| 0x9A | 2x2 | Medium Office Building 3 | 3 | 1 | 150 | 10 |
| 0x9B | 2x2 | Medium Office Building 4 | 3 | 2 | 150 | 10 |
| 0x9C | 2x2 | Medium Office Building 5 | 3 | 2 | 150 | 10 |
| 0x9D | 2x2 | Medium Office Building 6 | 3 | 2 | 150 | 10 |
| 0xB2 | 3x3 | Office Park | 4 | 1 | 700 | 10 |
| 0xB3 | 3x3 | Office Tower 1 | 4 | 1 | 700 | 10 |
| 0xB4 | 3x3 | Mini Mall | 4 | 0 | 700 | 10 |
| 0xB5 | 3x3 | Theatre（Theater square） | 4 | 1 | 700 | 10 |
| 0xB6 | 3x3 | Drive In（Drive-in theater） | 4 | 0 | 700 | 10 |
| 0xB7 | 3x3 | Office Tower 2 | 4 | 2 | 700 | 10 |
| 0xB8 | 3x3 | Office Tower 3 | 4 | 2 | 700 | 10 |
| 0xB9 | 3x3 | Parking Lot | 4 | 0 | 700 | 6 |
| 0xBA | 3x3 | Historic Office | 4 | 2 | 700 | 6 |
| 0xBB | 3x3 | Corporate Headquarters | 4 | 2 | 700 | 6 |

**工业 I**

| XBLD | 尺寸 | 名称 | level | tier | pop | w |
|---|---|---|---|---|---|---|
| 0x84 | 1x1 | Small Warehouse 1 | 1 | 0 | 16 | 10 |
| 0x85 | 1x1 | Chemical Storage | 1 | 0 | 16 | 10 |
| 0x86 | 1x1 | Small Warehouse（第二变体） | 1 | 1 | 16 | 10 |
| 0x87 | 1x1 | Industrial Substation | 1 | 1 | 16 | 10 |
| 0x9E | 2x2 | Medium Warehouse | 2 | 0 | 160 | 10 |
| 0x9F | 2x2 | Chemical Processing 2 | 2 | 0 | 160 | 10 |
| 0xA0 | 2x2 | Small Factory 1 | 2 | 0 | 160 | 10 |
| 0xA1 | 2x2 | Small Factory 2 | 2 | 0 | 160 | 10 |
| 0xA2 | 2x2 | Small Factory 3 | 3 | 1 | 160 | 10 |
| 0xA3 | 2x2 | Small Factory 4 | 3 | 1 | 160 | 10 |
| 0xA4 | 2x2 | Small Factory 5 | 3 | 2 | 160 | 10 |
| 0xA5 | 2x2 | Small Factory 6 | 3 | 2 | 160 | 10 |
| 0xBC | 3x3 | Chemical Processing 1 | 4 | 0 | 640 | 10 |
| 0xBD | 3x3 | Large Factory | 4 | 1 | 640 | 10 |
| 0xBE | 3x3 | Industrial Thingamajig | 4 | 2 | 640 | 10 |
| 0xBF | 3x3 | Medium Factory | 4 | 1 | 640 | 10 |
| 0xC0 | 3x3 | Large Warehouse 1 | 4 | 0 | 640 | 10 |
| 0xC1 | 3x3 | Large Warehouse 2 | 4 | 0 | 640 | 10 |

**过渡态建筑（三类共用）[ID 高 / level 高]**

| 状态 | level 1（1x1） | level 2（2x2） | level 3（2x2） | level 4（3x3） | pop | popLevel 给出行 |
|---|---|---|---|---|---|---|
| 施工 Construction | 0x88, 0x89 | 0xA6, 0xA7 | 0xA8, 0xA9 | 0xC2, 0xC3 | 0 | 不访问 |
| 废弃 Abandoned | 0x8A, 0x8B | 0xAA, 0xAB | 0xAC, 0xAD | 0xC4, 0xC5 | 0 | 不访问 |
| 瓦砾 Rubble（逐格 1x1） | 0x01–0x04 | – | – | – | 0 | 0（按空地处理） |

施工瓦片按目标 level 选组（2x2 的 A/B 组各有两个施工 ID，与 `POPWEIGHT` 2/3 对应）**[高（ID 分组）/ 低（按 level 选组）]**。

**候选缺口与回退**：并非每个 (zone, level, tier) 组合都有建筑（例如 R level 2 没有 tier 2，R/I level 3 没有 tier 0）。`pickBuilding(zone, level, tier)`：先取 tier 完全匹配的候选；没有则取 `|tier − t|` 最小者，并列取较低 tier（R level 2 tier 2 → 0x8F；R level 3 tier 0 → 0x90；I level 2 任意 tier → 0x9E–0xA1；I level 3 tier 0 → 0xA2/0xA3）**[设计]**。

人口数值的校验依据（全部为 **[低]** 推断，但保持内部一致）：每格密度 R 24/50/100、C 16/37/78、I 16/40/71；128x128 地图全密区 3x3 时非 arco 总人口约 150 万，与"原版非 arco 城市上限约百万量级"的社区经验相符；早期城市 ~400 栋 1x1 住宅 ≈ 10,000 居民，恰好触发"1 万人后出现休闲诉求"的门槛。

### 2.4 分区发展的前置条件

下表是**一次生长扫描访问**（§2.5.1）对分区格的检查顺序；任何一步失败都直接结束本次访问。

| 顺序 | 条件 | 规则 | 置信度 |
|---|---|---|---|
| 1 | 不是过渡态 | 施工 / 废弃瓦片不参与访问（由 lot 计时器驱动）；多格建筑只在 TL 锚点格处理 | 高 |
| 2 | 道路可达（仅空分区格 / 瓦砾格） | `env.hasAccess(i)` = `TransportQuery.hasAccess(x, y)`：`transport-traffic.md` §2.11 的**固定 24 偏移表**（四邻、轴向 2 与 3 格、四斜角、(±2,±1)、(±1,±2)），偏移格 ∈ 道路集合或公交站 / 火车站 / 地铁站格即可达；(±2,±2)、(±3,±1)、(±1,±3) **不**可达；纯铁路 / 高速 / 地铁不可达。经典"两路之间留 6 格"布局全部可达。已有建筑的格**不单独判可达**：出行生成器的第一步就是同一张表的起点搜索，找不到起点 ⇒ 出行失败 | 高 [H] |
| 3 | 供电 | `env.hasPower(i)` = `POWERED(i) \|\| 任一 4 邻格 POWERED`（`power-water.md` §2.5）。**空分区地不是 `POWERABLE`，永远不会自身 `POWERED`**，所以第一栋房子只能从电线 / 已供电建筑旁"蔓延"出来。为假：不跑出行、不生长；已建建筑的断电宽限另用自身 `POWERED` 的日计数（§2.5.7） | 高 |
| 4 | 出行 | `env.runTrip(i, zoneCode, level)`（`transport-traffic.md` §2.12，`level` = 已建建筑的密度级，空地为 0）。成功 ⇒ `pressure = clamp(demand[z] + 2000, 0, 4000)`；失败 ⇒ `pressure = 0`（只可能衰退） | 高 [H] |
| 5 | 需求 | 经 `pressure` 进入掷骰（§2.5.3）。`demand[z] ≤ 0` 时生长概率为 0，`demand[z] ≥ 0` 时衰退概率为 0（出行失败除外） | 高（方向）/ 低（掷骰公式） |
| 6 | 地价（密度门槛） | R 与 C 升到密度级 2 / 3 / 4 分别要求 `XVAL > 31 / 95 / 191`；**工业不受地价限制**；轻区永远停在级 1（`services-models.md` §2.10.1） | 高 |
| 7 | 地价（贫富档） | `tier = min(2, XVAL >> 6)`：0–63 低档、64–127 中档、≥128 高档（§2.6） | 高 |
| 8 | 地块 | 能找到合法 s×s 地块（§2.5.6）：同分区码、每格可被覆盖、地形条件 | 中 |

**不是前置条件的项**：

| 项 | 说明 | 置信度 |
|---|---|---|
| 供水 | 原版无"无水不能长大"的硬规则，供水只经地价 +4/格 间接影响（`services-models.md` §2.10.1、`power-water.md` §2.10）。本项目保留可选硬上限 `denseUnwateredMaxLevel`（默认 4 = 不限制；设为 3 即"无水最多 2x2"） | 高（原版）/ 设计（开关） |
| 犯罪 / 污染 / 交通 | 不直接参与生长判定；它们已经折进 `XVAL`（`services-models.md` §2.3.4） | 高 |
| 容量上限 | 该类型人口超过 cap 时需求被压制（§2.8.6），不是硬禁止 | 中 |
| 地形 | 1x1 可建在任何非水、非陡坡格（`XTER ∈ 0x00–0x0D`）；2x2/3x3 要求所有格 `XTER == 0x00` 且海拔相同 | 中 |

### 2.5 生长、衰退与废弃

#### 2.5.1 调度：4x4 子步扫描 [高（节奏）/ 低（轴向分配）]

生长扫描占每月第 3–18 天共 16 天（`services-models.md` §2.1 的月历，与 `transport-traffic.md` §2.12.1 "4×4 子步"一致）。第 `d` 天（`d ∈ 3..18`）：

```
step = ((d − 3) >> 2) & 3
sub  = (d + 1) & 3
访问所有满足 (x & 3) == step && (y & 3) == sub 的格（scanAxis = 'xStep'；设为 'yStep' 则交换）
```

每个格每月恰好被访问一次，空间上打散，所以"逐步长出"的观感是自然产物。访问到的格若是分区格（分区码 1–6）走 §2.5.2；军事 / 机场 / 海港分区与 Arcology 格由 `services-models.md` §2.8–§2.9 处理（同一次遍历，不同回调）。

#### 2.5.2 单格访问流程

```
visitZoneTile(i):
  z = xzon[i] & 0x0F; zt = zoneTypeOf(z); if !zt: return
  b = xbld[i]
  if isTransition(b) || b == 0x05 || isNonZoneBuilding(b): return     // 施工/废弃/放射性/教堂等
  lot = lotAt(i)
  if lot && lot.anchor != i: return                                    // 只在 TL 锚点处理
  if !lot && !env.hasAccess(i): return                                 // 空地/瓦砾必须可达
  if !env.hasPower(i): return                                          // 自身或 4 邻格供电
  level = lot ? lot.level : 0
  trip = env.runTrip(i, z, level)                                      // 交通模块写 XTRF
  if lot: lot.tripFailMonths = trip.ok ? 0 : lot.tripFailMonths + 1
  pressure = trip.ok ? clamp(demand[zt] + 2000, 0, 4000) : 0
  roll = rng.int(4000)
  if roll < pressure − T.growOffset:            tryGrow(i, z, lot)      // §2.5.4
  else if roll >= pressure + T.declineOffset:   tryDecline(lot, trip.ok) // §2.5.7
  else if lot:                                  checkTierDrift(lot)     // §2.6
```

#### 2.5.3 掷骰 [低，进 ZoneTuning]

`growOffset = declineOffset = 2000`（默认）给出的每次访问概率：

| 情形 | pressure | P(生长尝试) | P(衰退尝试) |
|---|---|---|---|
| 出行成功，`demand = +2000` | 4000 | 50% | 0 |
| 出行成功，`demand = +800` | 2800 | 20% | 0 |
| 出行成功，`demand = 0` | 2000 | 0 | 0 |
| 出行成功，`demand = −1000` | 1000 | 0 | 25% |
| 出行成功，`demand = −2000` | 0 | 0 | 50% |
| 出行失败（任何需求） | 0 | 0 | 50%（受宽限期约束，§2.5.7） |

即 `P_grow = max(0, demand)/4000`、`P_decline = max(0, −demand)/4000`，需求为 0 时城市静止。原版把 `demand + 2000` 叫"可用需求"、`4000 − 可用需求` 叫"剩余需求"（`transport-traffic.md` §2.12.1 [H]），但对这两个量怎样掷骰未能读出，上式是满足其语义的最简实现（见 Q13）。`growOffset` 调小可让需求为 0 时仍有缓慢更替。

#### 2.5.4 生长尝试

```
tryGrow(i, z, lot):
  if growsToday >= T.maxGrowsPerDay: return false                       // [设计] 每生长日配额
  zt = zoneTypeOf(z); dense = isDense(z)
  lv = env.landValue(i); tier = wealthTier(lv, lot?.tier)              // §2.6
  level = lot ? lot.level : 0; next = level + 1
  maxLevel = dense ? (env.watered(i) ? 4 : T.denseUnwateredMaxLevel) : 1
  gated = (next >= 2) && T.densityGateZones.includes(zt)                // 默认 ['R','C']，I 不受限
  if next <= maxLevel && (!gated || lv > T.densityLandValue[next − 2]):  // [31, 95, 191]
    size = SIZE_OF_LEVEL[next]                                           // [_, 1, 2, 2, 3]
    anchor = (lot && size == lot.size) ? lot.anchor : findLot(i, size, z, next)   // 2→3 原地重建
    if anchor != null: return startConstruction(anchor, size, zt, next, tier)
    // 找不到地块：落到下面的原地换档
  if lot && lot.phase == 'built' && tier > lot.tier:                     // 顶层/受阻时原地升档
    return startConstruction(lot.anchor, lot.size, zt, lot.level, tier)
  return false
```

要点：

- **一次只升一级**。1x1 → 2x2 A 组 → 2x2 B 组 → 3x3，每级都经过施工期，所以密区从空地长到 3x3 至少需要 4 次成功生长。
- 级 2 → 3 占地不变（都是 2x2）：原地推倒重建为 B 组建筑（`0x90–0x93` / `0x99–0x9D` / `0xA2–0xA5`），施工瓦片用 `0xA8/0xA9`。这是把 `POPWEIGHT` 2/3 两组 2x2 解释为两个密度级的直接后果 **[中]**（Q14）。
- 级 1 → 2 与级 3 → 4 需要扩大占地，走 `findLot` 吞并邻格（§2.5.6）。
- 工业不看地价门槛，但同样一次一级、同样要找得到地块。
- `wealthTier` 在新建时直接按当前 `XVAL`；已建建筑的升档也在这里完成（受同一次掷骰成功的约束），降档走 §2.6 的 `checkTierDrift`。

#### 2.5.5 密度阶梯一览

| level | 尺寸 | 施工 ID | R/C 升入门槛 | I 升入门槛 | 轻区 |
|---|---|---|---|---|---|
| 0 | 空地 / 瓦砾 | – | – | – | – |
| 1 | 1x1 | 0x88/0x89 | 无（需 `hasAccess`、`hasPower`、出行成功） | 同左 | 允许 |
| 2 | 2x2 A 组 | 0xA6/0xA7 | `XVAL > 31` | 无 | 不允许 |
| 3 | 2x2 B 组 | 0xA8/0xA9 | `XVAL > 95` | 无 | 不允许 |
| 4 | 3x3 | 0xC2/0xC3 | `XVAL > 191` | 无 | 不允许 |

门槛常量 `densityLandValue = [31, 95, 191]` 与 `services-models.md` 的 `ServicesTuning.densityLandValue` 是同一组值（sc2kfix 32/96/192、OpenSC2K 0x1F/0x5F/0xBF 互证）**[高]**，建议共享同一常量模块。

#### 2.5.6 地块（lot）合法性与吞并

`findLot(i, size, z, nextLevel)`：候选锚点为"使 s×s 地块包含格 `i`"的全部 `s²` 个偏移，按随机顺序尝试，第一个合法者胜出。地块合法 ⇔ 所有 s×s 格满足：

1. 分区码**完全相同**（密 R 与轻 R 不能拼成一个 2x2）。
2. 每格可被覆盖：空地 `0x00`、树木 `0x06–0x0C`、瓦砾 `0x01–0x04`、废弃建筑瓦片，或**同类型分区建筑且 `level < nextLevel`、且该建筑的整个占地都落在新地块内**（`allowAbsorb = true`，**[设计]**：这就是"密区里小房子被拆掉盖公寓"的观感；原版是否以同样方式吞并未知）。
3. 非分区建筑（道路、电线、管线口、公共建筑、教堂 `0xF7`、放射性 `0x05`）一律拒绝。
4. `size > 1` 时每格 `isFlat` 且海拔与锚点相同（Q12）。

不再要求"至少一格可达"与"锚点供电"：这两项已在访问格 `i` 上检查过（§2.5.2），而 `i` 必在新地块内。

**放置**：全部格 `XBLD = 施工 id`，角标按位置写入 `XZON` 高 4 位（1x1 写 `1111`），树木被清除；被吞并的旧建筑 `LotState` 立即删除，其人口在下次汇总时自然消失。

#### 2.5.7 施工、衰退、废弃与瓦砾（状态机）

```
             grow(roll)              finish(CONSTRUCT_DAYS)
 Empty/Rubble ────────▶ Construct(level L) ────────────▶ Built(level L, tier t)
      ▲                                                     │ grow(roll) → Construct(L+1 或同 L 换档)
      │ ABANDON_TO_RUBBLE_DAYS                               │ decline(roll, 宽限) / 断电 > 60 天 / 分区不兼容
      └────────────── Abandoned(同尺寸) ◀────────────────────┘
```

| 项 | 规则 | 参数 / 置信度 |
|---|---|---|
| 施工时长 | 1x1 15 天 / 2x2 30 天 / 3x3 45 天；期间显示施工瓦片、人口 0、不缴税、不被访问 | `constructDays = [15, 30, 45]` [设计] |
| 衰退一级 | Built → 同尺寸 Abandoned（随机变体）；Abandoned → Rubble；Rubble 不再衰退。衰退不改变尺寸 | 高（观感） |
| 出行失败的宽限 | `tryDecline(lot, tripOk)`：`tripOk == false` 时仅当 `lot.tripFailMonths > tripFailGraceMonths` 才真正衰退（默认 3 ⇒ 连续 4 次月访问失败后开始受 50%/月 的衰退掷骰）；`tripOk == true` 且需求为负的衰退无宽限 | `tripFailGraceMonths = 3` [设计]（取代旧 `NO_ROAD_GRACE_DAYS = 90`，"没有路"也只是出行失败的一种） |
| 断电宽限 | 已建建筑每天检查自身 `XBIT.POWERED`（建筑是 `POWERABLE`，这里**不用** 4 邻格规则）；连续 `> unpoweredGraceDays` 天 → 强制衰退一级。断电期间人口按 0 计、不缴税 | `unpoweredGraceDays = 60` [中] |
| 分区不兼容 | 密改轻后 level > 1 的建筑、改划异类、取消分区：见 §2.2 | 中 |
| 废弃→瓦砾 | 废弃持续 `abandonToRubbleDays` 天后逐格变瓦砾（随机 `0x01–0x04`，每格独立 1x1 角标 `0xF0`） | `abandonToRubbleDays = 150` [设计] |
| 瓦砾→重建 | 瓦砾格仍属分区，按空地参与访问（`level = 0`），满足条件即被新建筑覆盖，无需玩家清理 | 中 |
| 每日配额 | 每个生长日最多 `maxGrowsPerDay` 次 `startConstruction`、`maxDeclinesPerDay` 次衰退（128x128） | 48 / 48 [设计]，按地图面积缩放 |

#### 2.5.8 可选：legacy 评分模型（`growthModel: 'score'`，默认关）

本项目 v1 的自创模型保留为对照 / 调试用，不是原版行为 **[设计]**。启用时 §2.5.2 的"出行 + 掷骰"替换为：

```
score = clamp(demand[z]/2000, −1, 1)
      + 0.35·(lv/255·2 − 1) − 0.25·crime/255 − 0.25·poll/255 − 0.10·traffic/255 + (watered ? 0.05 : 0)
grow if score > 0 && rng() < score·GROW_RATE(0.5);  decline if score < 0 && rng() < −score·DECLINE_RATE(0.25)
可达用 env.hasAccess(i)（不再是 Chebyshev）；尺寸仍走 §2.5.4 的阶梯与地价门槛（不再用 demand 400/1200）
```

它需要 `GrowthEnv` 的可选方法 `crime/pollution/traffic`。交通、公交、铁路对发展**无效**是它的已知缺陷。

### 2.6 档次、顶层建筑、再开发与教堂

**贫富档由地价决定 [高]**：取建筑锚点所在半格的 `XVAL` 值 `lv ∈ 0..255`：

```
wealthTier(lv, currentTier?):
  base = min(2, lv >> T.wealthShift)                 // wealthShift = 6 ⇒ 0–63 / 64–127 / ≥128
  if T.tierHysteresis == 0 || currentTier == null: return base
  // 可选迟滞（默认关）：以 64/128 为中心，升档需 lv ≥ 边界 + h，降档需 lv < 边界 − h
  h = T.tierHysteresis
  if base > currentTier && lv < (currentTier + 1) * 64 + h: return currentTier
  if base < currentTier && lv >= currentTier * 64 − h:       return currentTier
  return base
```

新建时直接按当前 `lv` 选 tier，再在同 (zone, level, tier) 候选中按权重 `w` 随机选 ID（候选缺口按 §2.3 回退）。旧版的 85/170 阈值已废弃；`services-models.md` §2.3.4 的 `landValueBase = 32` 是按 64/128 校准的，两者必须一起用。`XVAL >> 6` 对住宅为 [高]（sc2kfix 常量 + OpenSC2K 互证），对商业 / 工业同样套用 **[中]**（Q17）——工业的 tier 只影响外观变体，不影响机制。

**顶层建筑**：轻区的 level 1、密区的 level 4、以及被地价门槛 / 地块卡住的建筑，其成功的生长掷骰变为**原地升档**（§2.5.4 末尾）：进入施工 → 同 level 更高 tier 变体（例：Large Apartments → Large Condominiums）。

**原地降档** `checkTierDrift(lot)`：每次访问若 `wealthTier(lv) < lot.tier` 则 `tierMismatchMonths++`，否则清零；连续 `tierDowngradeMonths = 6` 次后原地重建为低档变体（不经废弃）**[设计]**。

**再开发（吞并）[设计]**：§2.5.6 的 `allowAbsorb`。没有额外的需求阈值（旧 `MERGE_DEMAND_MIN` 删除）——掷骰本身已要求 `demand > 0`。

**教堂替换 [高（规则）/ 中（阈值）]**：每 `churchPerResidents` 名居民（非 arco）自动出现 1 座教堂 `0xF7`，且**只替换现有的 2x2 住宅建筑**。来源文档同一份里一处写"每 5,000 人"、另一处写"每 2,500 人"，本项目默认 `churchPerResidents = 2500`，做成参数 **[中]**。实现：月结算时若 `floor(resPop / churchPerResidents) > churchCount`，随机挑一座 R 2x2（level 2 或 3）建筑原地替换为教堂（2x2，人口 0，不计税，不参与生长，不可被吞并；地价模块可给小幅加成）。没有 R 2x2 则跳过，下月再试。

### 2.7 人口、税基与就业

每月汇总一次（也在加载存档后立即算一次；调度点由总调度决定——`economy-budget.md` §2.3 把它放在月末第 3 步，`services-models.md` §2.1 放在第 21 天，二者需对齐，见返回说明）：

```
for each tile with XZON.TL bit set and XBLD ∈ zoneBuildingTable (phase == built):
    tileCount[def.zone] += size*size
    if (!env.poweredSelf(tile) && !T.countUnpowered) continue      // 断电按 0 计
    pop[def.zone] += def.pop
resPop = pop.R; comPop = pop.C; indPop = pop.I                       // → MISC 0x0074 (res)
arcoPop   = services.arcoPop()        // MISC 0x1020：由 services §2.8.3 的年度微模拟逐年入住到容量 55k/30k/45k/65k；
                                      // 本模块不再按"每座满容量"硬算 [高]
normalPop = resPop + comPop + indPop                                  // → MISC 0x102C  [中] 见 Q1
citySize  = normalPop + arcoPop                                       // 状态栏人口

// Arcology 分摊到三类税基 / 供需（arcoShare，[中]：转述自 services §2.8.3 的逆向口径）
taxed.res = resPop + floor(arcoPop * T.arcoShare.res)                 // 默认 1/6
taxed.com = comPop + floor(arcoPop * T.arcoShare.com)                 // 默认 1/12
taxed.ind = indPop + floor(arcoPop * T.arcoShare.ind)                 // 默认 1/12

pct = services.workforcePct() ?? T.workforcePctFallback               // MISC 0x0044，由年龄队列 20–54 岁得出；首月/空城回退 50
workforce    = floor(taxed.res * pct / 100)
jobs         = taxed.com + taxed.ind
employed     = min(workforce, jobs)
unemployedN  = workforce − employed                                   // → MISC 0x0FA4
unemployment = workforce > 0 ? round(100 * unemployedN / workforce) : 0   // 百分比；骚乱触发用 ≥ 10 [高]
```

说明：

- **本模块不再计算 `XPOP`、`XROG`、`workforcePct`**。`XPOP = min(255, 4·ΣPOPWEIGHT)`、`XROG` 的月度平滑、`workforcePct = 100·W/(normalPop+1)` 全部由 `services-models.md` §2.3.5 / §2.7 独占产出；本模块只消费 `workforcePct`。
- `workforcePct` 在 services 中以 `normalPop` 为分母，本模块把它当"劳动年龄人口占比"乘在住宅税基上 **[低]**（Q15）。若 Q1 裁定 City Size 只含 R，两者自然一致。
- `taxed.*` 是 **economy 的税收输入**：`monthlyTax.z = floor(taxRate.z × taxed.z / 75)` **[高（公式）]**，即 arco 居民按 1/6 缴住宅税、1/12 缴商业税、1/12 缴工业税（`economy-budget.md` §2.4.1 需改为引用 `census.taxed.*`，并删去"arco 不缴税"）。
- cap、诉求阈值、里程碑、教堂一律用**非 arco** 的 `resPop/comPop/indPop/normalPop`（来源文档明示）。
- `MISC` 计数：`0x05F0` 已建分区格总数、`0x05F8/0600/0608` R/C/I 已建格数（只计 phase == built 的建筑格，Q9）、`0x01F0..` 每种 XBLD 的格数（全部 256 种，含非分区建筑；本模块维护，services/economy 只读）。
- `XGRP`：City Size / Residents / Commerce / Industry / Unemployment 的月、半年、5 年三档序列由本模块推送。

### 2.8 RCI 需求模型

需求值 `demand = {r, c, i}`，各为 **−2000..+2000 的有符号整数 [高]**（`MISC 0x0718/071C/0720`），每月重算、再对上月做 1/4 平滑。下式中所有"修正项"单位都是需求点。模型形状为本项目 **[低]** 设计，但它的输出语义（范围、正负方向、指示器）与消费方式（§2.5.3 的 `demand + 2000`）是原版口径。

#### 2.8.1 主干：供需比

```
share_C = commerceShare(year);  share_I = 1 − share_C                // §2.8.2
pct     = workforcePct/100（同 §2.7）

targetR = jobs / pct                                                 // 填满岗位需要的住宅人口（含 arco 份额）
targetC = workforce * share_C + marketC                              // 本地消费 + 外部市场
targetI = workforce * share_I + marketI

ratioR = targetR / max(taxed.res, 1)                                 // >1 需要更多住宅
ratioC = targetC / max(taxed.com, 1)
ratioI = targetI / max(taxed.ind, 1)

base[z] = clamp((ratio[z] − 1) * RATIO_GAIN, −2000, 2000)            // RATIO_GAIN = 1500
```

空城特例：`taxed.res == taxed.com == taxed.ind == 0` 时取 `base = {r: 800, c: 300, i: 500}`（原版新城 R/I 为正、C 略正 **[中]**）。只有居民没有岗位时 `ratioC/ratioI` 为 `target/1`，会饱和到 +2000，符合原版"先划住宅后 C/I 需求暴涨"的观感。Arcology 经 `taxed.*` 进入供需：一座满员 Plymouth（55,000 人）相当于 9,166 居民 + 4,583 商业岗位 + 4,583 工业岗位，净效果略推高 R 需求。

#### 2.8.2 工业→商业的年代转移 [中（现象）/ 数值 低]

`commerceShare(year)` 分段线性插值，年份超出两端取端值：

| 年份 | 1900 | 1925 | 1950 | 1975 | 2000 | 2025 | 2050+ |
|---|---|---|---|---|---|---|---|
| share_C | 0.30 | 0.35 | 0.42 | 0.50 | 0.58 | 0.64 | 0.68 |

效果：1900 年开局工业需求压倒商业；2000 年后商业成为主导。年份取**游戏当前年份**（不是建城年份）。

#### 2.8.3 税率修正 [中（形状）/ 数值 低]

对每类分区套用其税率 `t ∈ 0..20`（整数）：

| t | 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 |
|---|---|---|---|---|---|---|---|---|---|---|---|
| taxMod | +400 | +300 | +240 | +180 | +120 | +80 | +40 | 0 | −40 | −100 | −180 |

| t | 11 | 12 | 13 | 14 | 15 | 16 | 17 | 18 | 19 | 20 |
|---|---|---|---|---|---|---|---|---|---|---|
| taxMod | −260 | −360 | −460 | −560 | −680 | −800 | −940 | −1100 | −1300 | −1500 |

乘以难度敏感系数 `TAX_SENS = {easy: 0.75, medium: 1.0, hard: 1.25}`（文档："难度改变市民对税的敏感度" **[中]**）。工业使用按产业比例加权的平均税率（§2.9）。

#### 2.8.4 法令修正 [高（来源文档）/ 施加方式 中]

文档给出的"需求效应"以百分比表示，解释为**乘在 target 上**：

| 法令 | 效应 |
|---|---|
| 1% Sales Tax | `targetC *= 0.99` |
| 1% Income Tax | `targetR *= 0.99` |
| Homeless Shelter | `targetC *= 1.01` |
| Pollution Controls | `targetI *= 0.99` |
| Tourist Advertising | `targetC *= 1.01`；并给 Tourism 产业权重 ×1.25 |
| Business Advertising | `targetI *= 1.01` |
| City Beautification | `targetR *= 1.01` |
| Annual Carnival | `targetC *= 1.01` |
| 其余 12 条法令 | 对需求无直接效应 |

#### 2.8.5 国家经济、难度与随机 [中/低]

```
natPop(year)   : 分段线性 1900→10,000  1950→25,000  2000→60,000  2050→150,000（单位：千人）[高]
natValue       = 3 * natPop / 10                                                       [高]
natTax         = 1（开局）                                                              [高]
natTrend       = difficulty − 1（开局：easy 0 / medium 1 / hard 2）                    [高（取值）/ 语义 低]
```

每年 1 月：`natTrend` 以 `[0.25, 0.5, 0.25]` 概率 −1/0/+1 随机游走并夹在 `0..2`。语义假定 0 = 景气、1 = 平稳、2 = 衰退：`econMod = {0: +150, 1: 0, 2: −150}`，三类同加；衰退时报纸触发 `fedrateupstory`，景气触发 `fedratedownstory`（报纸模块）。
难度对工业的额外修正 `diffIndMod = {easy: +50, medium: 0, hard: −50}` **[低]**（文档仅称"少量影响"）。
每月随机噪声 `noise[z] = rngInt(−60, +60)`，三类独立。

#### 2.8.6 容量上限（cap）与市民诉求 [高（阈值来源文档）/ 组合方式 中]

人口单位均为"该类型人口"，不含 arco。

| 类型 | cap 公式 |
|---|---|
| R | `10,000 + Σ 休闲建筑贡献`：小公园(1x1) 1,000；大公园(3x3) 3,000；码头 Marina 9,000；动物园 16,000；体育场 16,000 |
| C | `10,000 + 2,000 × 道路连接数 + 500 × 机场分区格数`（文档替代解释：每个跑道组 10,000；二选一做配置 `airportCapMode`；`services-models.md` Q14 另记录 OpenSC2K 读出的 `((runwayTiles/5)·4 + 4)·375` 形状，可作第三选项） |
| I | `10,000 + 10,000 × 海港起重机数 + 10,000 × 铁路连接数 + 10,000 × 高速连接数`（OpenSC2K 形状 `(cranes + 1 + conn)·1500` 同上备选） |

```
over[z]   = max(0, pop[z] − cap[z]) / cap[z]
capMod[z] = −min(1, over[z]) * CAP_PENALTY_MAX      // CAP_PENALTY_MAX = 800
```

同一数据驱动"市民诉求"事件（给报纸/顾问；每种每年最多提示一次；`economy-budget.md` §2.13 与 `services-models.md` §2.10.4 消费）：

| 诉求 | 触发 |
|---|---|
| needpark / needzoo / needstadium / needmarina | `resPop ≥ 10,000 && resPop > cap.R`（四种随机择一） |
| needairport | `comPop > cap.C` |
| needseaport | `indPop > cap.I && 起重机数 == 0` |
| needconnections | `comPop > cap.C \|\| indPop > cap.I`，且连接总数 == 0 |
| needschool | `floor(normalPop / 20,000) > schoolCount` |
| needfire | `floor(normalPop / 20,000) > fireStationCount` |
| needhospital | `floor(normalPop / 25,000) > hospitalCount` |
| needroad | 已划区但 `!hasAccess` 的格数 ≥ 20 **[低]**（与 `economy-budget.md` §2.13 同口径，用 24 偏移表统计） |
| needpower / needwater | 利用率 ≥ 98%（由电/水模块提供） |

#### 2.8.7 合成

```
raw[z]    = base[z] + taxMod[z] + econMod + capMod[z] + noise[z] + (z=='I' ? diffIndMod : 0)
demand[z] = clamp(round(prev[z] + (raw[z] − prev[z]) * 0.25), −2000, 2000)
```

显示：RCI 指示器三根柱，高度 = `|demand|/2000`，正向上、负向下 **[高]**。

### 2.9 11 种产业 [名单 高 / 曲线 低]

工业人口按 11 个产业划分。`MISC 0x016C..0x01EC` 存 33 个 int：`ratio[11]`、`tax[11]`、`demand[11]` 三组 **[高（布局）]**。窗口（Ctrl+I）三视图：Ratios / Tax Rates / Demand。

| k | 产业 | w1900 | w1950 | w2000 | w2050 | poll | tech | 说明 |
|---|---|---|---|---|---|---|---|---|
| 0 | Steel/Mining | 10 | 6 | 3 | 2 | 5 | 低 | 早期支柱，持续衰落 |
| 1 | Textiles | 9 | 5 | 2 | 1 | 3 | 低 | 早期支柱，持续衰落 |
| 2 | Petrochemical | 4 | 8 | 6 | 3 | 5 | 中 | 中期峰值 |
| 3 | Food | 6 | 6 | 5 | 5 | 2 | 低 | 平稳 |
| 4 | Construction | 5 | 6 | 6 | 6 | 3 | 低 | 平稳，另随城市增长率 +0..2 |
| 5 | Automotive | 1 | 8 | 7 | 4 | 4 | 中 | 1920 后崛起，晚期回落 |
| 6 | Aerospace | 0 | 3 | 6 | 7 | 3 | 高 | 1940 后出现 |
| 7 | Finance | 1 | 3 | 7 | 9 | 0 | 高 | 持续上升 |
| 8 | Media | 1 | 3 | 6 | 8 | 0 | 高 | 持续上升 |
| 9 | Electronics | 0 | 1 | 8 | 10 | 1 | 高 | 1970 后爆发 |
| 10 | Tourism | 1 | 2 | 5 | 7 | 0 | 低 | 受 Tourist Advertising、休闲建筑加成 |

`poll` 列在这里只用于产业结构 → 污染扩散的耦合（下文 `industrialPollutionBonus`），**不是**建筑级污染源（那在 `services-models.md` §2.3.1）。`tech` 列 **[低]** 用于 EQ 耦合。

```
w_k(year)    = 分段线性插值上表（1900 前取 w1900，2050 后取 w2050）
taxF_k       = 1 + (7 − tax_k) * 0.06                       // 0% → ×1.42, 20% → ×0.22，夹到 [0.2, 1.5]
ordF_k       = (k==10 && TouristAdvertising) ? 1.25 : 1
recF_k       = (k==10) ? 1 + min(0.5, recreationTiles/200) : 1
eqF_k        = tech_k=='高' ? (EQ > 130 ? 1.2 : EQ < 60 ? 0.8 : 1) : tech_k=='中' ? (EQ > 100 ? 1.1 : 1) : 1
               // EQ = services.workforceEQ（MISC 0x004C）；services §2.7 已声明这组系数 [低]
weight_k     = w_k(year) * taxF_k * ordF_k * recF_k * eqF_k
ratioTarget_k= 100 * weight_k / Σ weight                     // 百分比，Σ=100
ratio_k      = ratio_k + round((ratioTarget_k − ratio_k) * 0.1)   // 每月向目标收敛；修正舍入使 Σ=100
indDemand_k  = clamp(round((ratioTarget_k − ratio_k) * 100 + (demand.i * weight_k / max weight) ), −2000, 2000)
```

与总体工业、预算、污染的耦合：

```
avgIndTax     = Σ ratio_k * tax_k / 100                      // §2.8.3 的工业税率修正与预算的工业收入（economy §2.4.1）
heavyShare    = Σ_{k ∈ heavyPollutionIndustries} ratio_k     // 默认 {0 Steel/Mining, 2 Petrochemical, 5 Automotive}（poll_k ≥ 4）[低]
industrialPollutionBonus = heavyShare < 20 ? −1 : clamp(floor((heavyShare − 20) / 30), 0, 2)
                                                             // → MISC 0x1034（16 位有符号；services §2.3.1 用它调节扩散分母 D）[高（消费方式）/ 低（份额定义）]
MISC 0x1030 IndustryBonus = round(Σ ratio_k * taxF_k) − 100  // 诊断用
```

旧版的 `indPollMul`（乘在工业建筑 poll 上）已删除：建筑级污染由 services 的 256 项表决定，产业结构只经 `industrialPollutionBonus` 影响扩散。

税率默认：新城三组 `tax_k` 全部 = 7，之后与预算窗口的工业税独立调整；`tax_k ∈ 0..20` 整数 **[高（范围）]**。开局 `ratio` 直接等于 `ratioTarget(年份)`。

### 2.10 邻城（Neighbors）与边缘连接

`MISC 0x06D8..0x0718`：4 个邻城 × (index, population, value, fame) **[高]**。四个邻城对应地图四条边（等轴视图下为左下、左上、右上、右下 **[高]**）。`MISC 0x1024` = 连接格数；连接格在 `XTXT` 标 `0xFA` 并带自动路牌 **[高]**。

**连接判定**（由 `transport-traffic.md` §2.13 的 `recountConnections()` 执行，本模块只读结果）：道路 / 铁路 / 高速瓦片位于地图边缘格且朝向边外即构成一条连接；高速双车道算一条。电线、地铁、水管到边缘**不**构成连接 **[中]**。连接格同时是出行的"去邻城上班"出口（`transport-traffic.md` §2.12.2）。

**邻城初始化（新城）[低]**：`pop0 = round(rngFloat(5,000, 60,000) * natPop(year) / 10,000)`；`value = pop * rngInt(5,15)`；`fame = rngInt(0,100)`；名字从本项目原创名单抽取（index 为名单下标）。

**邻城年更新**：`pop *= 1 + (rngFloat(0.00, 0.04) + 0.02 * connectedTypes_n)`，其中 `connectedTypes_n ∈ 0..3`（道路/铁路/高速各计 1）。即与我们相连的邻城长得更快。

**对需求的作用**：

```
marketC = Σ_n (roadConn_n > 0 ? neighborPop_n * 0.02 : 0)                           // 商业靠公路
marketI = Σ_n ((railConn_n + hwyConn_n) > 0 ? neighborPop_n * 0.04 : 0)              // 工业靠铁路/高速
```

再加上 §2.8.6 的 cap 增量。对 R 无直接作用（待确认 Q6）。

### 2.11 时间基准 [高]

1 年 = 12 月 = 300 天，1 月 = 25 天（`MISC 0x0010` 城龄以天计）。速度档只改变真实时间/天的比率，不改变任何按天/月/年定义的规则。生长扫描占第 3–18 天（§2.5.1）；人口汇总与需求重算每月一次（§2.7）。

---

## 3. 数据结构与算法建议

### 3.1 TypeScript 接口

```ts
export type ZoneType = 'R' | 'C' | 'I';
export type DensityLevel = 1 | 2 | 3 | 4;

export const enum ZoneCode {
  None = 0, LightR = 1, DenseR = 2, LightC = 3, DenseC = 4,
  LightI = 5, DenseI = 6, Military = 7, Airport = 8, Seaport = 9,
}
export const zoneTypeOf = (z: ZoneCode): ZoneType | null =>
  z === 1 || z === 2 ? 'R' : z === 3 || z === 4 ? 'C' : z === 5 || z === 6 ? 'I' : null;
export const isDense = (z: ZoneCode) => z === 2 || z === 4 || z === 6;
export const SIZE_OF_LEVEL: readonly (1 | 2 | 3)[] = [1, 1, 2, 2, 3];   // 下标 = level（0 占位）

export interface ZoneBuildingDef {
  id: number;              // XBLD
  zone: ZoneType;
  size: 1 | 2 | 3;
  level: DensityLevel;     // = services POPWEIGHT = catalogue popW；也是出行的 popLevel
  tier: 0 | 1 | 2;
  pop: number;             // 人口单位（R 居民 / C,I 岗位）
  weight: number;          // 随机抽取权重
  name: string;            // 原创显示名（不得使用原版文本资源）
}

export interface TransitionDefs {
  construction: Record<DensityLevel, readonly number[]>;   // 1:[0x88,0x89] 2:[0xA6,0xA7] 3:[0xA8,0xA9] 4:[0xC2,0xC3]
  abandoned: Record<DensityLevel, readonly number[]>;      // 1:[0x8A,0x8B] 2:[0xAA,0xAB] 3:[0xAC,0xAD] 4:[0xC4,0xC5]
  rubble: readonly number[];                               // 0x01..0x04
}

/** 每个建筑实例的运行态；按 TL 锚点格索引，存档时丢弃并由 XBLD/XZON 重建 */
export interface LotState {
  anchor: number;          // y*128+x
  size: 1 | 2 | 3;
  level: DensityLevel;     // 已建：def.level；施工中：pendingLevel
  tier: 0 | 1 | 2;
  zone: ZoneType;
  phase: 'construct' | 'built' | 'abandoned';
  phaseDays: number;       // 进入当前 phase 的天数
  unpoweredDays: number;   // 自身 POWERED 为假的连续天数（仅 built）
  tripFailMonths: number;  // 连续出行失败的月访问次数
  tierMismatchMonths: number;
  pendingTier?: 0 | 1 | 2; // 施工目标
}

export interface RciDemand { r: number; c: number; i: number }       // -2000..2000

export interface ZonePopulation {
  res: number; com: number; ind: number;      // 已建且自身供电的建筑之和（非 arco）
  arco: number;                               // 来自 services（MISC 0x1020）
  normal: number;                             // res+com+ind
  citySize: number;                           // normal+arco
  taxed: { res: number; com: number; ind: number };   // 含 arco 分摊份额；economy 税收用这组
  workforcePct: number;                       // 实际采用的百分比（services 值或 fallback）
  workforce: number; jobs: number; unemployedN: number; unemploymentPct: number;
  tiles: { res: number; com: number; ind: number; total: number };
}

export interface DemandCaps { r: number; c: number; i: number }

export interface IndustryState {
  ratio: Int32Array;    // 11, 百分比, Σ=100
  tax: Int32Array;      // 11, 0..20
  demand: Int32Array;   // 11, -2000..2000
  pollutionBonus: -1 | 0 | 1 | 2;   // MISC 0x1034
}

export interface NeighborCity {
  index: number; name: string;
  population: number; value: number; fame: number;
  edge: 'W' | 'N' | 'E' | 'S';
  connections: { road: number; rail: number; highway: number };
}

export interface NationalEconomy {
  population: number;   // 千人
  value: number;
  tax: number;
  trend: 0 | 1 | 2;
}

/** transport-traffic.md §3.6 的返回值 */
export interface TripResult { ok: boolean; usedBus: boolean; usedRail: boolean; usedSubway: boolean; steps: number }

/** 其他模块提供的只读环境（索引 i = y*128+x；对 (x,y) 接口的换算由适配层完成） */
export interface GrowthEnv {
  width: 128; height: 128;
  xbld: Uint8Array; xzon: Uint8Array; xter: Uint8Array; altitude: Uint8Array;
  poweredSelf(i: number): boolean;      // XBIT.POWERED(i)，建筑断电计时用
  hasPower(i: number): boolean;         // POWERED(i) || 任一 4 邻格 POWERED（power-water §2.5），生长判定用
  watered(i: number): boolean;          // XBIT.WATERED(i)
  hasAccess(i: number): boolean;        // TransportQuery.hasAccess(x,y)，24 偏移表（transport §2.11）
  runTrip(i: number, zoneCode: ZoneCode, popLevel: 0 | DensityLevel): TripResult;   // transport §3.6；内部写 XTRF
  landValue(i: number): number;         // XVAL 半格值 0..255
  isFlat(i: number): boolean;
  // 以下仅 legacy 'score' 模型与查询面板使用，默认模型不调用
  roadDistance?(i: number): number;     // TransportQuery.roadDistance：Chebyshev，>3 返回 4，仅 UI
  crime?(i: number): number; pollution?(i: number): number; traffic?(i: number): number;
}

/** services 提供的人口学 / Arcology 输入 */
export interface CensusInputs {
  arcoPop: number;                      // MISC 0x1020
  workforcePct: number | null;          // MISC 0x0044；services 尚未产出（空城/首月）时为 null
  workforceEQ: number;                  // MISC 0x004C，产业 EQ 耦合
}

export interface DemandInputs {
  year: number; difficulty: 1 | 2 | 3;
  taxRate: { r: number; c: number; i: number };
  ordinances: ReadonlySet<OrdinanceId>;
  recreation: { smallPark: number; bigPark: number; marina: number; zoo: number; stadium: number };
  airportTiles: number; airportRunwayGroups: number; seaportCranes: number;
  neighbors: readonly NeighborCity[];
  national: NationalEconomy;
  population: ZonePopulation;
  industry: IndustryState;
  prev: RciDemand;
  rng: Prng;
}

export interface ZoneTuning {
  growthModel: 'trip' | 'score';                 // 默认 'trip'
  growOffset: 2000; declineOffset: 2000;         // §2.5.3 [低]
  densityLandValue: readonly [31, 95, 191];      // 与 ServicesTuning.densityLandValue 共享 [高]
  densityGateZones: readonly ZoneType[];         // 默认 ['R','C'] [高]
  wealthShift: 6;                                // tier = min(2, XVAL >> 6) [高]
  tierHysteresis: 0;                             // 0 = 关；>0 为围绕 64/128 的迟滞半宽 [设计]
  tierDowngradeMonths: 6;                        // [设计]
  denseUnwateredMaxLevel: 4;                     // 4 = 无硬上限（原版）；3 = 无水最多 2x2 [设计]
  constructDays: readonly [15, 30, 45];          // 按 size 索引 [设计]
  abandonToRubbleDays: 150;                      // [设计]
  unpoweredGraceDays: 60;                        // [中]
  tripFailGraceMonths: 3;                        // [设计]
  maxGrowsPerDay: 48; maxDeclinesPerDay: 48;     // 128x128 基准，按面积缩放 [设计]
  allowAbsorb: true;                             // 吞并小建筑 [设计]
  churchPerResidents: 2500;                      // [中]（文档另有 5000）
  countUnpowered: false;
  scanAxis: 'xStep' | 'yStep';                   // §2.5.1 [低]
  legacyScore: { growRate: 0.5; declineRate: 0.25 };
}

export interface DemandTuning {
  workforcePctFallback: 50;
  arcoShare: { res: number; com: number; ind: number };   // 默认 1/6, 1/12, 1/12 [中]
  ratioGain: 1500; smoothing: 0.25;
  taxMod: readonly number[]; taxSens: Record<1 | 2 | 3, number>;
  econMod: readonly [number, number, number]; diffIndMod: Record<1 | 2 | 3, number>;
  noise: 60; capPenaltyMax: 800;
  capBase: DemandCaps; roadConnC: 2000; airportTileC: 500; airportGroupC: 10000;
  airportCapMode: 'tiles' | 'groups' | 'opensc2k'; craneI: 10000; railConnI: 10000; hwyConnI: 10000;
  marketC: 0.02; marketI: 0.04;
  commerceShare: ReadonlyArray<readonly [year: number, share: number]>;
  heavyPollutionIndustries: readonly number[];   // 默认 [0, 2, 5]
}
```

### 3.2 需求计算伪代码

```
function computeDemand(in: DemandInputs, t: DemandTuning): { demand, caps, requests[] }
  P = in.population; pct = P.workforcePct / 100
  shareC = lerpTable(t.commerceShare, in.year)
  marketC = Σ nb (nb.connections.road>0 ? nb.population*t.marketC : 0)
  marketI = Σ nb (nb.connections.rail+nb.connections.highway>0 ? nb.population*t.marketI : 0)

  if P.taxed.res==0 && P.taxed.com==0 && P.taxed.ind==0: base = {r:800,c:300,i:500}
  else
    targetR = P.jobs / pct
    targetC = P.workforce*shareC     + marketC
    targetI = P.workforce*(1-shareC) + marketI
    applyOrdinanceMultipliers(targetR,targetC,targetI, in.ordinances)      // §2.8.4
    base.r = clamp((targetR/max(P.taxed.res,1)-1)*t.ratioGain, -2000, 2000)
    base.c = clamp((targetC/max(P.taxed.com,1)-1)*t.ratioGain, -2000, 2000)
    base.i = clamp((targetI/max(P.taxed.ind,1)-1)*t.ratioGain, -2000, 2000)

  avgIndTax = Σ_k in.industry.ratio[k]*in.industry.tax[k]/100
  taxMod.r = t.taxMod[in.taxRate.r] * t.taxSens[in.difficulty]
  taxMod.c = t.taxMod[in.taxRate.c] * t.taxSens[in.difficulty]
  taxMod.i = lerp(t.taxMod, avgIndTax) * t.taxSens[in.difficulty]        // avgIndTax 可为小数，线性插值

  caps = computeCaps(in, t)                                               // §2.8.6，用非 arco 人口
  for z in [r,c,i]:
    over = max(0, P[z]-caps[z]) / caps[z]                                 // P[z] = res/com/ind（非 arco）
    capMod[z] = -min(1, over) * t.capPenaltyMax
    raw = base[z] + taxMod[z] + t.econMod[in.national.trend] + capMod[z]
        + in.rng.int(-t.noise, t.noise) + (z=='i' ? t.diffIndMod[in.difficulty] : 0)
    demand[z] = clamp(round(in.prev[z] + (raw - in.prev[z]) * t.smoothing), -2000, 2000)

  requests = citizenRequests(P, caps, in)                                 // §2.8.6 事件表
  return { demand, caps, requests }
```

### 3.3 人口汇总伪代码

```
function tallyPopulation(env, defs, ci: CensusInputs, t): ZonePopulation
  zero all
  for i in 0..16383:
    if (env.xzon[i] & 0x40) == 0: continue                // TL 位
    def = defs.byId[env.xbld[i]]; if !def: continue       // 施工/废弃/瓦砾/教堂不在表内
    tiles[def.zone] += def.size*def.size
    if !env.poweredSelf(i) && !t.countUnpowered: continue
    pop[def.zone] += def.pop
  arco = ci.arcoPop
  taxed = { res: res + floor(arco*t.arcoShare.res), com: com + floor(arco*t.arcoShare.com), ind: ind + floor(arco*t.arcoShare.ind) }
  pct = ci.workforcePct ?? t.workforcePctFallback
  ...derive workforce/jobs/unemployment as §2.7
```

复杂度 O(16384)/月，可忽略。若需要每日更新 UI，可维护增量：放置/移除建筑时 ±`def.pop`。

### 3.4 逐格生长调度

```
// 生长日 d ∈ 3..18（services §2.1）
function growthDay(d):
  growsToday = declinesToday = 0
  step = ((d − 3) >> 2) & 3; sub = (d + 1) & 3
  for y in 0..127: for x in 0..127:
    if ((x & 3) != step) || ((y & 3) != sub): continue   // scanAxis='yStep' 时交换 x/y
    visitZoneTile(y*128 + x)                               // §2.5.2

// 每个模拟日（含非生长日）推进所有 LotState 的计时器
function dailyTimers():
  for lot in lots:
    lot.phaseDays++
    if lot.phase == 'built': lot.unpoweredDays = env.poweredSelf(lot.anchor) ? 0 : lot.unpoweredDays + 1
    if lot.phase == 'construct' && lot.phaseDays >= T.constructDays[lot.size − 1]: finishConstruction(lot)
    else if lot.phase == 'built' && lot.unpoweredDays > T.unpoweredGraceDays: declineOneStep(lot)
    else if lot.phase == 'abandoned' && lot.phaseDays >= T.abandonToRubbleDays: toRubble(lot)
```

```
function visitZoneTile(i): 见 §2.5.2
function tryGrow(i, z, lot): 见 §2.5.4

function tryDecline(lot, tripOk):
  if !lot || lot.phase != 'built': return
  if !tripOk && lot.tripFailMonths <= T.tripFailGraceMonths: return   // 宽限
  if declinesToday >= T.maxDeclinesPerDay: return
  declinesToday++; declineOneStep(lot)

function checkTierDrift(lot):
  t = wealthTier(env.landValue(lot.anchor), lot.tier)
  lot.tierMismatchMonths = t < lot.tier ? lot.tierMismatchMonths + 1 : 0
  if lot.tierMismatchMonths >= T.tierDowngradeMonths:
    lot.tierMismatchMonths = 0; startConstruction(lot.anchor, lot.size, lot.zone, lot.level, t)   // 原地降档

function findLot(i, size, z, nextLevel): anchor | null
  zt = zoneTypeOf(z)
  offsets = shuffle(all (dx,dy) in [0,size) × [0,size))
  for (dx,dy) in offsets:
    ax = x(i)−dx; ay = y(i)−dy
    if out of bounds for ax..ax+size−1, ay..ay+size−1: continue
    anchor = ay*128+ax; ok = true
    for each tile j in lot:
      if (xzon[j] & 0x0F) != z: ok=false; break
      b = xbld[j]
      coverable = b==0x00 || isTree(b) || isRubble(b) || isAbandoned(b)
               || (T.allowAbsorb && defs.byId[b]?.zone==zt && defs.byId[b].level < nextLevel
                   && lotContaining(j) 完全位于 [ax,ax+size) × [ay,ay+size) 内)
      if !coverable: ok=false; break
      if size>1 && (!env.isFlat(j) || altitude[j]!=altitude[anchor]): ok=false; break
    if ok: return anchor
  return null

function startConstruction(anchor, size, zt, level, tier):
  removeLotsOverlapping(anchor, size)                     // 被吞并/被重建的建筑
  id = rng.pick(transition.construction[level]); write lot tiles (xbld=id, xzon corner bits, 清树)
  lots.set(anchor, { phase:'construct', size, level, zone:zt, pendingTier:tier, tier, phaseDays:0, ... })
  growsToday++; return true

function finishConstruction(lot):
  def = pickBuilding(lot.zone, lot.level, lot.pendingTier)   // §2.3 回退规则 + 权重 w
  write lot tiles (xbld=def.id); lot.phase='built'; lot.tier=def.tier; lot.level=def.level; lot.phaseDays=0

function declineOneStep(lot):
  if lot.phase=='built':     write rng.pick(transition.abandoned[lot.level]); lot.phase='abandoned'; lot.phaseDays=0
  else if lot.phase=='abandoned': toRubble(lot)
function toRubble(lot): each tile xbld = rng.pick(0x01..0x04); xzon corner bits = 0b1111 (每格独立 1x1 瓦砾); lots.delete(lot.anchor)
```

写入 `XZON` 角标：锚点 (0,0) → TL `0x40`；(size−1,0) → TR `0x80`；(0,size−1) → BL `0x10`；(size−1,size−1) → BR `0x20`；其余 0；1x1 → `0xF0`。低 4 位分区码保持不变。

### 3.5 产业与邻城更新

```
monthly: industry.ratio ← converge to ratioTarget(year, tax, ordinances, recreation, workforceEQ) (§2.9)
         industry.demand ← formula; industry.pollutionBonus ← heavyShare 公式 → MISC 0x1034
yearly (1 月): national.population = natPop(year); value = 3*pop/10; trend = randomWalk(trend)
               for nb in neighbors: nb.population = round(nb.population * (1 + rng(0,0.04) + 0.02*connectedTypes(nb)))
on transport.recountConnections(): 读取 neighbors[*].connections 与 MISC 0x1024（transport 负责 XTXT 0xFA 标记）
```

### 3.6 存档映射

| 本模块状态 | 存档位置 |
|---|---|
| 分区码/角标 | `XZON` |
| 建筑 ID | `XBLD` |
| 需求 r/c/i | `MISC 0x0718, 0x071C, 0x0720` |
| 产业 ratio/tax/demand | `MISC 0x016C..0x01EC`（顺序 ratio[11], tax[11], demand[11]，待确认 Q8） |
| 产业污染加成 | `MISC 0x1034`（16 位有符号写入低字） |
| 邻城 | `MISC 0x06D8..0x0718`（4 × 4 int） |
| 连接格数 | `MISC 0x1024`（transport 计数，本模块透传） |
| 国家经济 | `MISC 0x0050..0x005C` |
| 人口计数 | `MISC 0x0074, 0x0FA4, 0x102C, 0x05F0..0x060C, 0x01F0..0x05EC` |
| **不由本模块写** | `XPOP`、`XROG`、`MISC 0x0044`（workforcePct）、`MISC 0x1020`（arcoPop）——services 独占 |
| LotState 计时器 | **不存档**；加载时 `phase/level/tier/size` 由 XBLD 查表推断，所有计时器归 0 |

### 3.7 必备单元测试（与评审对应）

1. **首栋房子从电线旁长出**：128x128 空图，一条通电电线旁划一块 R 密区，旁边一条道路通向一块 C 分区；运行一个月（含第 3–18 天）后至少有一处施工瓦片；移除电线（或令所有格 `POWERED = 0`）再跑一个月，无新施工。
2. **24 偏移可达**：道路格 (10,10)，分区格 (12,12)（偏移 (+2,+2)）与 (13,11)（(+3,+1)）永不生长；(13,10)（(+3,0)）与 (12,11)（(+2,+1)）可生长。
3. **地价门槛**：把 `landValue` 固定为 20，R 密区永远停在 level 1；固定为 100 可到 level 3 不到 4；工业在 20 也能到 level 4。
4. **贫富档**：`landValue` 40/90/200 分别产出 tier 0/1/2 的 1x1 住宅。
5. **出行失败只衰退**：R 分区有路、有电，但道路不通向任何 C/I/邻城出口；`demand.r = +2000` 下仍无生长；已有建筑在第 4 次失败访问后开始废弃。
6. **需求为 0 时静止**：三类需求固定 0，运行 12 个月，建筑数不变。
7. **税基含 arco**：`arcoPop = 60,000`、`resPop = 0` 时 `taxed.res = 10,000`、`taxed.com = taxed.ind = 5,000`；`normalPop = 0`、`citySize = 60,000`。
8. **确定性**：同一种子、同一输入，两次运行的 `XBLD/XZON` 与 `demand` 序列逐字节一致。

---

## 4. 边界条件与易错点

1. **锚点与角标**：3x3 的中间 5 格角标为 0，但 `XBLD` 相同；遍历时若用 "XBLD 属于建筑表" 判断会把一栋 3x3 数 9 次。必须用 TL 位。导入的第三方存档可能角标不规范（例如 DOS 版转换件），加载时应做一次"按 XBLD 连通块重建角标"的修复。
2. **跨区地块**：`findLot` 必须要求每格分区码**完全相同**（密 R 与轻 R 不能拼成一个 2x2）。
3. **部分重叠的吞并**：3x3 候选地块若只盖住某个 2x2 的一半，必须拒绝（§2.5.6 条件 2 的"整个占地落在新地块内"），否则会留下半栋孤儿建筑与错误角标。
4. **吞并后的孤儿状态**：吞并时要同时删除旧 `LotState`，否则计时器会对已不存在的建筑触发衰退并写坏新建筑的瓦片。
5. **瓦砾是 1x1**：3x3 废弃楼变瓦砾后是 9 个独立的 1x1 瓦砾格（角标各自 `0xF0`），不要保留 3x3 角标。
6. **两种"供电"**：生长判定用 `hasPower`（含 4 邻格），断电计时用 `poweredSelf`。把两者弄反会导致要么城市永不发展（空分区地永远不是 `POWERED`），要么电线旁的建筑永远不会因断电而废弃。
7. **不要自己判可达**：已建建筑不调用 `hasAccess`，直接跑 `runTrip`；它的起点搜索就是同一张 24 偏移表。两处分别实现会在边界格上出现不一致。
8. **出行的副作用**：`runTrip` 成功时由交通模块写 `XTRF`，本模块绝不能为了"只查一下"而重复调用它，否则交通翻倍。每格每月恰好一次。
9. **地图边界**：地块裁边；`hasAccess` 的越界偏移由交通模块跳过；`services` 的覆盖扫描不计最外圈，与本模块无关。
10. **旋转无关**：存档 `MISC 0x0008` 的 compass 只影响渲染，本模块所有坐标使用未旋转的存储坐标。
11. **整数与确定性**：需求、人口、ratio 全部用整数；所有随机都走注入的种子 PRNG，并按固定遍历顺序调用（扫描顺序 → 掷骰 → `findLot` 的洗牌 → 建筑抽取），保证同一种子重放一致。`runTrip` 内部也消耗同一 PRNG，调用次序必须稳定。
12. **饱和与除零**：`ratio = target/max(pop,1)` 在 pop=0 时直接饱和为 +2000，这是预期行为；`cap[z]` 恒 ≥ 10,000 所以 `over` 不会除零；`workforcePct` 为 null 时用 fallback，不要用 0（否则 `targetR = jobs/0`）。
13. **税率数组越界**：税率输入必须夹到 0..20；`avgIndTax` 为小数时对 `taxMod` 表做线性插值而不是取整索引。
14. **未供电的建筑**：人口按 0 计意味着断电会让需求瞬间飙升；平滑系数 0.25 与 60 天宽限期一起缓冲这个效应，不要去掉平滑。
15. **轻区改密区**：已有 1x1 保留，下月起可被吞并；密区改轻区时 level > 1 不再合法，走强制衰退而不是瞬间消失。
16. **教堂**：教堂不在建筑表中，但占据 R 分区格；`findLot` 与 `visitZoneTile` 都必须把它当作"非分区建筑"拒绝。
17. **arco**：arco 人口只经 `taxed.*` 进入税收与供需，经 `citySize` 进入状态栏；不进任何 cap、诉求阈值、里程碑、教堂计数。`arcoPop` 是 services 微模拟的逐年入住值，新放的 Arcology 当年人口接近 0。
18. **需求指示器的"抖动"**：噪声 ±60 是刻意的，原版指示器会轻微抖动；但噪声不应累积（每月重新抽取，不做随机游走）。
19. **配额按面积缩放**：`maxGrowsPerDay` 要按地图面积缩放（若将来支持更大地图），否则大图长得慢。
20. **施工瓦片的人口**：施工与废弃建筑人口 0、不计税，但仍占用"分区格数"统计；`MISC 0x05F0/05F8…` 只数 built 建筑格（Q9）。施工瓦片的 `POPWEIGHT` 非 0 是 services 的事，与本模块人口无关。
21. **level 与 size 不是一一对应**：2x2 有两个 level。从存档恢复 `LotState` 时 level 取 `def.level`，不要用尺寸推。

---

## 5. 待确认问题

| # | 问题 | 当前取值 | 影响 |
|---|---|---|---|
| Q1 | City Size 是否 = R+C+I 人口之和（还是只有 R）？ | 取和 | 状态栏人口、情景目标、每 2 万人学校等阈值、`workforcePct` 的分母语义 |
| Q2 | ~~arco 居民是否参与 R/岗位供需~~ → **已裁定**：按 `arcoShare = {res 1/6, com 1/12, ind 1/12}` 进入税基与供需 [中] | 如 §2.7 | 大量 arco 城市的 C/I 需求与税收 |
| Q3 | ~~道路可达的度量~~ → **已关闭**：采用 `transport-traffic.md` §2.11 的 24 偏移表 [H]，车站格算、纯铁路/高速/地铁不算 | – | – |
| Q4 | 未供水的密区是否有硬上限 | **无**（原版只经地价 +4/格；`denseUnwateredMaxLevel = 4`），可选设为 3 | 无水城市的最大密度 |
| Q5 | 单栋建筑的人口数值（原版查询窗口不直接显示） | 表 §2.3 | 一切阈值的标度 |
| Q6 | 邻城/连接是否也提高 R 的 cap 或需求？ | 否 | 大城市 R 需求天花板 |
| Q7 | `natTrend` 的语义与 0..2 之外的取值；Fed rate 如何由它派生 | 0 景气 / 1 平稳 / 2 衰退 | 经济周期强度、债券利率（预算规格） |
| Q8 | `MISC 0x016C` 33 个 int 的真实顺序（ratio/tax/demand 还是按产业交错）与单位 | ratio[11],tax[11],demand[11] | 存档互通；只影响导入/导出层 |
| Q9 | `MISC 0x05F4/05FC/0604/060C` 四个"另一半计数"的含义 | 写 0 | 存档互通 |
| Q10 | 机场 cap 贡献按格数、按跑道组、还是 OpenSC2K 读出的 `((runwayTiles/5)·4+4)·375` | 按格数 500/格（`airportCapMode = 'tiles'`） | 商业城市需要多少机场 |
| Q11 | 分区费用（轻 $5 / 密 $10）与机场/海港费用 | 如 §2.2 | 预算 |
| Q12 | 多格建筑是否允许坐落在缓坡上 | 不允许 | 丘陵地图的密度 |
| Q13 | 原版对"可用需求 / 剩余需求"（`demand+2000` / `4000−…`）的掷骰方式 | §2.5.3 的 `growOffset/declineOffset = 2000` | 生长速度手感；需求为 0 时是否仍有更替 |
| Q14 | 2x2 的 A/B 两组（`POPWEIGHT` 2/3）是否真是两个密度级（即存在 2x2 → 2x2 的原地重建） | 是 | 密区从 1x1 到 3x3 的步数、建筑混合比例 |
| Q15 | `workforcePct` 应乘在 `taxed.res` 还是 `normalPop` 上 | `taxed.res` | 失业率与 R 需求标度 |
| Q16 | 出行起点取 TL 锚点还是原版的访问格 / TR 角 | TL | 3x3 建筑边缘可达性（差 ≤ 2 格） |
| Q17 | 商业 / 工业的 tier 是否也按 `XVAL >> 6` | 是 | C/I 建筑外观分布 |

---

## 6. 参考来源

- dfloer/SC2k-docs（CC BY-SA 4.0）——本地副本：`sc2_file_spec.md`（XZON/XBLD/MISC/XPOP/XROG 布局、需求范围 −2000..2000、邻城与产业字段、税率表布局）、`simulation_spec.md`（起始国家人口、国家值公式、法令需求效应表、市民诉求阈值、教堂规则（5,000 与 2,500 两说）、税收公式、难度与税敏感度）。本文所有未另注来源的 **[高]** 标注均出自这两份文档。
- 兄弟规格（本仓库）：`transport-traffic.md` §2.11（24 偏移可达表）、§2.12（出行生成器、`popLevel`、"可用需求 = 需求 + 2000"）、§3.5–3.6（`TransportQuery`、`runTrip`）；`services-models.md` §2.3.1（污染源表，商业为 0）、§2.3.5（`POPWEIGHT`、`XPOP/XROG`）、§2.7（`workforcePct`）、§2.8.3（Arcology 入住与 1/6、1/12 分摊）、§2.10.1（密度门槛 31/95/191、贫富档 `XVAL>>6`）；`power-water.md` §2.2/§2.5（空分区地不是 `POWERABLE`，`hasPower` 含 4 邻格）；`building-catalogue.md` §2.4（`popW`/tier 列）；`economy-budget.md` §2.3/§2.4.1（结算顺序、税收公式）。这些规格中标为 [H]/[高] 的逆向重实现口径在本文沿用为 [高]。
- SimCity 2000 手册与游戏内可观察行为（作者记忆，用于轻/密区尺寸规则、11 产业名单、RCI 指示器、Ctrl+I 产业窗口三视图）。
- 本文中的掷骰偏移、年代曲线、税率修正表、人口表、cap 惩罚形状、施工/废弃天数、吞并规则为本项目原创参数，**不是**从任何第三方代码复制；参考仓库 OpenSC2K / sc2kfix 仅用于确认文件格式与常量，未复用其代码或数据。
