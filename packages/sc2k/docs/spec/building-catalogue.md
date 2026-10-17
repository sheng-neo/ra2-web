# 领域规格：统一建筑 / 工具数据表（Building & Tool Catalogue）

> 适用对象：`packages/sc2k` 的 `data/buildings.ts`、`data/tools.ts`、`sim/placement`、`ui/toolbar`、`render/sprites` 实现者，以及所有需要"按 XBLD 查属性"的模块。
> 蓝本：SimCity 2000 Windows 95 Special Edition（下称 SC2K）。
> 置信度：**[高]** = 一手文档（dfloer/SC2k-docs）或逆向头文件（sc2kfix `sc2k_1996.h` 的枚举 / `GetTileCoverage`）直接支持；**[中]** = 多个二手来源一致或兄弟规格已采用；**[低]** = 为"可实现"给出的推测值，必须进可调常量表。未标注者默认 **[低]**。
> 与兄弟规格的关系：本文是**汇总表**，单价 / 产量 / 覆盖 / 人口的"所有者"仍是各领域规格（`power-water.md`、`services-models.md`、`transport-traffic.md`、`zones-growth-demand.md`、`economy-budget.md`、`terrain.md`）。本文与它们冲突处在 §4.1 明示，并给出本文采用值；最终以本文生成的数据文件为单一事实源（SSOT），兄弟规格的实现者从 `data/buildings.ts` 读数，不各自复制。
> 版权铁律：表中"参考名"只是**识别用**的社区描述名；数据文件里玩家可见的 `name` 必须用本文给出的原创中文名或自行另拟，不得导入原版文本资源。

---

## 1. 概述

### 1.1 本文回答的问题

1. **256 个 `XBLD` 值各是什么**：名称、类别、占地、是否玩家可放置、朝向编码方式、精灵对应。
2. **可放置建筑的经济与功能参数**：造价、维护费与预算线、科技 / 人口解锁、用电 / 用水、发电 / 供水产量、污染、人口 / 岗位、覆盖参数、微模拟类型、NIMBY。
3. **玩家工具表**：工具栏分组、子工具、作用、单位费用、拖拽模式、光标尺寸、快捷键。
4. **可直接转成 TS 的数据结构**：`BuildingDef` / `ToolDef` 与派生查表（`FOOTPRINT[256]`、`CATEGORY[256]`）、校验不变量、放置与扣费伪代码。

### 1.2 几个贯穿全文的约定

| 约定 | 内容 | 置信度 |
|---|---|---|
| 多格建筑编码 | n×n 建筑的**每一格** `XBLD` 都写同一 ID；角标在 `XZON` 高 4 位（TR=0x80, TL=0x40, BR=0x20, BL=0x10），1x1 写 `0xF0`；3x3 的中心格与边中格角标为 0 | 高 |
| 占地尺寸来源 | 逆向头文件 `GetTileCoverage` 的四个 case（1x1 默认 / 2x2 / 3x3 / 4x4），本文 §2.2–§2.8 的"尺寸"列全部按它填写 | 高 |
| 精灵对应 | 相对号 `n == XBLD`；文件内 ID：small = n，medium = 500 + n，large = 1000 + n；`0x00` 无精灵（见 `file-formats.md` §2.6.3） | 高 |
| 旋转位 | `XBIT.bit6`（`0x02`，`FLIPPED`）置位 = 该瓦片旋转 90°；渲染用**水平镜像**同一张精灵实现（等轴 2:1 下 L-R 件的镜像正是 T-B 件） | 高（语义）/ 中（镜像实现） |
| 费用单位 | 全部为整数美元；造价一次性扣除，维护费为**年费**，预算按月累计 1/12（`economy-budget.md` §2.7） | 高 |
| 科技年份 | 表中为**基准年**，实际发明年 = 基准年 + `rng % 20`（`simulation_spec`），存 `MISC 0x0738..0x0774`，已发明后存 0 | 高 |
| 人口门槛 | 奖励建筑用 `normalPop`（不含 Arcology）且**严格大于**阈值（`services-models.md` §2.8） | 中 |
| 供电 / 供水消费口径 | 一切 `XBLD >= 0x70` 的格子每格消耗 1 个"服务格"的电；供水同口径但水设施自身（`0xDC/0xEB/0xF4/0xFA`）不计入消费者；雕像与两种公园不受电（`power-water.md` §2.1） | 高 |

---

## 2. 原版行为：数据表

### 2.1 类别枚举（`BuildingCategory`）

| 类别 | 含义 | ID 范围 |
|---|---|---|
| `ground` | 空地 | 0x00 |
| `rubble` | 瓦砾（4 变体） | 0x01–0x04 |
| `radioactive` | 放射性废料 | 0x05 |
| `tree` | 树木（7 档密度） | 0x06–0x0C |
| `park` | 小公园 / 大公园 | 0x0D, 0xD5 |
| `powerLine` | 电线 15 片段 + 高架电线 | 0x0E–0x1C, 0x5C |
| `road` | 道路 15 片段 | 0x1D–0x2B |
| `rail` | 铁路 15 片段 + 4 半高件 | 0x2C–0x3E |
| `tunnel` | 隧道口 4 朝向 | 0x3F–0x42 |
| `crossover` | 电 × 路 / 路 × 铁 / 电 × 铁 交叉件 | 0x43–0x48 |
| `highway` | 高速直线段 / 坡面 / 转弯 / 立交 | 0x49–0x4A, 0x61–0x69 |
| `highwayCrossover` | 高速 × 路 / 铁 / 电 | 0x4B–0x50 |
| `bridge` | 公路桥 / 铁路桥 / 加固高速桥 | 0x51–0x5B, 0x6A–0x6B |
| `onramp` | 高速匝道 | 0x5D–0x60 |
| `subRail` | 地铁 ↔ 铁路转换件 | 0x6C–0x6F |
| `zoneR` / `zoneC` / `zoneI` | 分区生长建筑（1x1 / 2x2 / 3x3，各三档） | 0x70–0x87, 0x8C–0xA5, 0xAE–0xC1 |
| `construction` | 施工中（三种尺寸） | 0x88–0x89, 0xA6–0xA9, 0xC2–0xC3 |
| `abandoned` | 废弃（三种尺寸） | 0x8A–0x8B, 0xAA–0xAD, 0xC4–0xC5 |
| `powerPlant` | 电厂 | 0xC6–0xCF |
| `civic` | 警 / 消 / 医 / 教 / 文化 / 监狱 | 0xD1–0xD4, 0xD6, 0xD8–0xD9, 0xF5 |
| `recreation` | 体育场 / 动物园 / 码头（大小公园归 `park`） | 0xD7, 0xDA, 0xF8 |
| `reward` | 市长官邸 / 市政厅 / 雕像 / Llama Dome | 0xF3, 0xD0, 0xDB, 0xFF |
| `waterFacility` | 水泵 / 水塔 / 净水厂 / 淡化厂 | 0xDC, 0xEB, 0xF4, 0xFA |
| `transitStation` | 地铁站 / 公交站 / 火车站 | 0xE9, 0xEC, 0xED |
| `airportPart` | 机场分区自动生长部件 | 0xDD, 0xDE, 0xE1, 0xE4, 0xE5, 0xE6, 0xEA, 0xEE, 0xF6 |
| `seaportPart` | 海港分区自动生长部件 | 0xDF, 0xE0, 0xE3, 0xF0, 0xF2 |
| `militaryPart` | 军事基地专用部件（空军 / 海军基地还复用机场 / 海港部件） | 0xE2, 0xE7, 0xE8, 0xEF, 0xF1, 0xF9 |
| `church` | 教堂（自动替换 R 2x2） | 0xF7 |
| `arcology` | 四种 Arcology | 0xFB–0xFE |

### 2.2 地表覆盖 0x00–0x0D [高]

精灵 n = ID。"可放置"指玩家工具能直接产生该 ID。

| ID | key | 参考名 | 中文显示名（原创） | 类别 | 尺寸 | 可放置 | 产生方式 / 备注 |
|---|---|---|---|---|---|---|---|
| 0x00 | `clear` | Clear Ground | 空地 | ground | 1x1 | 推土产生 | 无精灵，直接画地形 |
| 0x01 | `rubble1` | Rubble 1 | 瓦砾 A | rubble | 1x1 | 否 | 拆除 / 衰败 / 灾害随机选 1–4 |
| 0x02 | `rubble2` | Rubble 2 | 瓦砾 B | rubble | 1x1 | 否 | 同上 |
| 0x03 | `rubble3` | Rubble 3 | 瓦砾 C | rubble | 1x1 | 否 | 同上 |
| 0x04 | `rubble4` | Rubble 4 | 瓦砾 D | rubble | 1x1 | 否 | 同上 |
| 0x05 | `radioactive` | Radioactivity | 放射性废料 | radioactive | 1x1 | 否 | 核泄漏产生；污染源 200/格；推土机不可清除 **[中]** |
| 0x06 | `trees1` | Tree | 孤树 | tree | 1x1 | 树木工具 | 密度 1 |
| 0x07 | `trees2` | Couple O Trees | 几棵树 | tree | 1x1 | 树木工具 | 密度 2 |
| 0x08 | `trees3` | More Trees | 小树丛 | tree | 1x1 | 树木工具 | 密度 3 |
| 0x09 | `trees4` | Morer Trees | 树丛 | tree | 1x1 | 树木工具 | 密度 4 |
| 0x0A | `trees5` | Even More Trees | 密林 | tree | 1x1 | 树木工具 | 密度 5 |
| 0x0B | `trees6` | Tons O Trees | 茂密森林 | tree | 1x1 | 树木工具 | 密度 6 |
| 0x0C | `trees7` | Veritable Jungle | 原始丛林 | tree | 1x1 | 树木工具 | 密度 7（上限） |
| 0x0D | `smallPark` | Small park | 小公园 | park | 1x1 | Parks › Small Park $20 | `XZON = 0xF0`（四角全置、无分区）；导水不导电；地价 +20 |

树木工具每次点击把密度 +1（`0x00 → 0x06 → … → 0x0C`），满密度再点仍收费 $3 **[中]**；推土 $1 清到 `0x00`。地价模块对 `0x06–0x0D` 一视同仁加 +20（`services-models.md` §2.3.3）。

### 2.3 网络件 0x0E–0x6F [高]

形状码顺序（五个族共用，`k = 0..14`）：

| k | 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 形状 | L-R | T-B | HT-B | L-HR | T-HB | HL-R | BR | BL | TL | TR | RTB | LBR | TLB | LTR | LTBR |
| 语义 | 直线 | 直线 | 坡（T 高） | 坡（R 高） | 坡（B 高） | 坡（L 高） | 转弯 | 转弯 | 转弯 | 转弯 | 三叉 | 三叉 | 三叉 | 三叉 | 十字 |

族基址：电线 `0x0E`、道路 `0x1D`、铁路 `0x2C`；地下族（`XUND`）地铁 `0x01`、管线 `0x10`。坡面件 k=2..5 分别对应 `XTER 0x01..0x04`。朝向全部由 ID 编码（`orient = byId`），不用翻转位。

**2.3.1 逐 ID 表**

| ID | key | 中文显示名 | 类别 | 尺寸 | 可放置 | 朝向 / 备注 |
|---|---|---|---|---|---|---|
| 0x0E–0x1C | `powerLine[k]` | 电线（15 形） | powerLine | 1x1 | Power › Wires $2/格 | k = ID − 0x0E；导电不导水；树木阻断 |
| 0x1D–0x2B | `road[k]` | 道路（15 形） | road | 1x1 | Roads › Road $10/格 | k = ID − 0x1D |
| 0x2C–0x3A | `rail[k]` | 铁路（15 形） | rail | 1x1 | Rail › Rail $25/格 | k = ID − 0x2C |
| 0x3B | `railHalfHTB` | 铁路半高（T 高） | rail | 1x1 | 自动 | 坡脚平地格；与 0x2E 配对 |
| 0x3C | `railHalfLHR` | 铁路半高（R 高） | rail | 1x1 | 自动 | 与 0x2F 配对 |
| 0x3D | `railHalfTHB` | 铁路半高（B 高） | rail | 1x1 | 自动 | 与 0x30 配对 |
| 0x3E | `railHalfHLR` | 铁路半高（L 高） | rail | 1x1 | 自动 | 与 0x31 配对 |
| 0x3F | `tunnelT` | 隧道口（朝上） | tunnel | 1x1 | Roads › Tunnel $150/格 | 洞口面向 T |
| 0x40 | `tunnelR` | 隧道口（朝右） | tunnel | 1x1 | 同上 | |
| 0x41 | `tunnelB` | 隧道口（朝下） | tunnel | 1x1 | 同上 | |
| 0x42 | `tunnelL` | 隧道口（朝左） | tunnel | 1x1 | 同上 | |
| 0x43 | `xPowerTB_RoadLR` | 电线 TB × 道路 LR | crossover | 1x1 | 自动 | 导电 + 道路 |
| 0x44 | `xPowerLR_RoadTB` | 电线 LR × 道路 TB | crossover | 1x1 | 自动 | |
| 0x45 | `xRoadLR_RailTB` | 道路 LR × 铁路 TB | crossover | 1x1 | 自动 | 道口：两网皆连通 |
| 0x46 | `xRoadTB_RailLR` | 道路 TB × 铁路 LR | crossover | 1x1 | 自动 | |
| 0x47 | `xPowerTB_RailLR` | 电线 TB × 铁路 LR | crossover | 1x1 | 自动 | 导电 + 铁路 |
| 0x48 | `xPowerLR_RailTB` | 电线 LR × 铁路 TB | crossover | 1x1 | 自动 | |
| 0x49 | `highwayLR` | 高速直线 LR | highway | 1x1 段 | Roads › Highway $100/2x2 段 | 四段组成一个 2x2 块，角标全置 |
| 0x4A | `highwayTB` | 高速直线 TB | highway | 1x1 段 | 同上 | |
| 0x4B | `xHwyLR_RoadTB` | 高速 LR × 道路 TB | highwayCrossover | 1x1 段 | 自动 | 道路下穿，两网不连通 |
| 0x4C | `xHwyTB_RoadLR` | 高速 TB × 道路 LR | highwayCrossover | 1x1 段 | 自动 | |
| 0x4D | `xHwyLR_RailTB` | 高速 LR × 铁路 TB | highwayCrossover | 1x1 段 | 自动 | |
| 0x4E | `xHwyTB_RailLR` | 高速 TB × 铁路 LR | highwayCrossover | 1x1 段 | 自动 | |
| 0x4F | `xHwyLR_PowerTB` | 高速 LR × 电线 TB | highwayCrossover | 1x1 段 | 自动 | 导电 |
| 0x50 | `xHwyTB_PowerLR` | 高速 TB × 电线 LR | highwayCrossover | 1x1 段 | 自动 | 导电 |
| 0x51 | `suspStartB` | 吊桥起始段（B） | bridge | 1x1 | 桥对话框 Suspension $75/格 | `flipBit` 翻转轴向 |
| 0x52 | `suspMidB` | 吊桥中段（B 侧） | bridge | 1x1 | 同上 | flipBit |
| 0x53 | `suspCenter` | 吊桥中央塔 | bridge | 1x1 | 同上 | flipBit |
| 0x54 | `suspMidT` | 吊桥中段（T 侧） | bridge | 1x1 | 同上 | flipBit |
| 0x55 | `suspEndT` | 吊桥末端段（T） | bridge | 1x1 | 同上 | flipBit |
| 0x56 | `raisingTower` | 开启桥塔 | bridge | 1x1 | 桥对话框 Raising $50/格 | flipBit |
| 0x57 | `causewayPylon` | 堤道桥墩段 | bridge | 1x1 | 桥对话框 Causeway $25/格 | flipBit |
| 0x58 | `raisingMidDown` | 开启桥中段（放下）/ 堤道桥面 | bridge | 1x1 | Causeway / Raising | flipBit；两种桥共用 |
| 0x59 | `raisingMidUp` | 开启桥中段（升起） | bridge | 1x1 | 自动（船过时动画态） | flipBit |
| 0x5A | `railBridgePylon` | 铁路桥墩段 | bridge | 1x1 | 铁路跨水自动 $75/格 | flipBit |
| 0x5B | `railBridge` | 铁路桥面段 | bridge | 1x1 | 同上 | flipBit |
| 0x5C | `powerLineElevated` | 高架电线 | powerLine | 1x1 | 电线跨水自动 $10/格 | flipBit；导电 |
| 0x5D | `onrampHwyT_RoadL` | 匝道（高速 T，道路 L） | onramp | 1x1 | Roads › Onramp $25 | flipBit 置位 = 整体旋转 90° |
| 0x5E | `onrampHwyT_RoadR` | 匝道（高速 T，道路 R） | onramp | 1x1 | 同上 | flipBit |
| 0x5F | `onrampHwyB_RoadL` | 匝道（高速 B，道路 L） | onramp | 1x1 | 同上 | flipBit |
| 0x60 | `onrampHwyB_RoadR` | 匝道（高速 B，道路 R） | onramp | 1x1 | 同上 | flipBit |
| 0x61 | `highwaySlopeHTB` | 高速坡面（T 高） | highway | **2x2** | Highway 工具自动 | `GetTileCoverage` 归 2x2 |
| 0x62 | `highwaySlopeLHR` | 高速坡面（R 高） | highway | 2x2 | 同上 | |
| 0x63 | `highwaySlopeTHB` | 高速坡面（B 高） | highway | 2x2 | 同上 | |
| 0x64 | `highwaySlopeHLR` | 高速坡面（L 高） | highway | 2x2 | 同上 | |
| 0x65 | `highwayCurveBR` | 高速转弯 BR | highway | 2x2 | 同上 | |
| 0x66 | `highwayCurveBL` | 高速转弯 BL | highway | 2x2 | 同上 | |
| 0x67 | `highwayCurveTL` | 高速转弯 TL | highway | 2x2 | 同上 | |
| 0x68 | `highwayCurveTR` | 高速转弯 TR | highway | 2x2 | 同上 | |
| 0x69 | `highwayInterchange` | 高速立交（十字） | highway | 2x2 | 两条高速相交自动 | 无三叉 |
| 0x6A | `reinforcedBridgePylon` | 加固高速桥（有墩） | bridge | 2x2 | 桥对话框 Reinforced $200/段 | flipBit 区分轴向 |
| 0x6B | `reinforcedBridge` | 加固高速桥（无墩） | bridge | 2x2 | 同上 | flipBit |
| 0x6C | `subRailT` | 地铁↔铁路转换（朝上） | subRail | 1x1 | Rail › Sub↔Rail $250 | 地下写 `XUND 0x23` |
| 0x6D | `subRailR` | 地铁↔铁路转换（朝右） | subRail | 1x1 | 同上 | |
| 0x6E | `subRailB` | 地铁↔铁路转换（朝下） | subRail | 1x1 | 同上 | |
| 0x6F | `subRailL` | 地铁↔铁路转换（朝左） | subRail | 1x1 | 同上 | |

**2.3.2 网络族费用与维护** [中，除注明外]（来源：`transport-traffic.md` §2.4、`power-water.md` §2.9、`terrain.md` §2.9）

| 族 | 造价 | 年维护 | 预算线 | 科技（基准年） | 导电 | 载车 |
|---|---|---|---|---|---|---|
| 电线 0x0E–0x1C | $2/格 | 0 | 无 | — | 是 | 否 |
| 高架电线 0x5C | $10/格 | 0 | 无 | — | 是 | 否 |
| 道路 0x1D–0x2B | $10/格 | $0.10/格 | Roads | — | 否 | 是 |
| 隧道 0x3F–0x42（含内部格） | $150/格 | $0.20/格 | Tunnel | — | 否 | 是 |
| 铁路 0x2C–0x3E | $25/格 | $0.40/格 | Rail | — | 否 | 列车 |
| 高速 0x49–0x50, 0x61–0x69 | $100/2x2 段 | $0.80/段 | Highways | Highways 1930 **[低]** | 0x4F/0x50 是 | 是 |
| 匝道 0x5D–0x60 | $25 | 计入 Highways | Highways | 随高速 | 否 | 是 |
| 堤道 0x57/0x58 | $25/格 | $0.25/格 + $0.10/端 | Bridges | — | 否 | 是 |
| 开启桥 0x56/0x58/0x59 | $50/格 | 同上 | Bridges | — | 否 | 是 |
| 吊桥 0x51–0x55 | $75/格 | 同上 | Bridges | — | 否 | 是 |
| 铁路桥 0x5A/0x5B | $75/格 | $0.25/格 | Bridges | — | 否 | 列车 |
| 加固高速桥 0x6A/0x6B | $200/段 | $1.80/段 + $0.80/端 | Bridges | 随高速 | 否 | 是 |
| 地铁↔铁路 0x6C–0x6F | $250 | $0.80/座 | Subway | Subways 1910 **[低]** | 否 | 列车 |
| 地铁 `XUND 0x01–0x0F` | $100/格 | $0.40/格 | Subway | Subways 1910 | 否 | 列车 |
| 管线 `XUND 0x10–0x1E` | $3/格 | 0 | 无 | — | 否 | 否 |

交叉件没有自己的价格：谁后铺谁付自己的族价 **[中]**。拆除任何网络格 $1/格（推土机）。

### 2.4 分区生长建筑 0x70–0xC5 [ID / 尺寸 高；tier / 污染 中；pop 低]

玩家不能直接放置，由分区生长产生（`zones-growth-demand.md` §2.5）。所有行：`placeable = false`、`orient = none`、`consumesPower = consumesWater = true`、造价 / 维护 0、精灵 n = ID。`tier` 0 低 / 1 中 / 2 高由地价决定；`pop` 为居民（R）或岗位（C/I）；`poll` 为每格污染源强度（`services-models.md` §2.3.1 口径：R/C 为 0）；`popW` 为 `XPOP` 人口权重。

**住宅 R**

| ID | key | 参考名 | 中文显示名 | 尺寸 | tier | pop | poll | popW |
|---|---|---|---|---|---|---|---|---|
| 0x70 | `r1Low1` | Lower Class Homes 1 | 低档住宅 A | 1x1 | 0 | 24 | 0 | 1 |
| 0x71 | `r1Low2` | Lower Class Homes 2 | 低档住宅 B | 1x1 | 0 | 24 | 0 | 1 |
| 0x72 | `r1Low3` | Lower Class Homes 3 | 低档住宅 C | 1x1 | 0 | 24 | 0 | 1 |
| 0x73 | `r1Low4` | Lower Class Homes 4 | 低档住宅 D | 1x1 | 0 | 24 | 0 | 1 |
| 0x74 | `r1Mid1` | Middle Class Homes 1 | 中档住宅 A | 1x1 | 1 | 24 | 0 | 1 |
| 0x75 | `r1Mid2` | Middle Class Homes 2 | 中档住宅 B | 1x1 | 1 | 24 | 0 | 1 |
| 0x76 | `r1Mid3` | Middle Class Homes 3 | 中档住宅 C | 1x1 | 1 | 24 | 0 | 1 |
| 0x77 | `r1Mid4` | Middle Class Homes 4 | 中档住宅 D | 1x1 | 1 | 24 | 0 | 1 |
| 0x78 | `r1High1` | Upper Class Homes 1 | 高档住宅 A | 1x1 | 2 | 24 | 0 | 1 |
| 0x79 | `r1High2` | Upper Class Homes 2 | 高档住宅 B | 1x1 | 2 | 24 | 0 | 1 |
| 0x7A | `r1High3` | Upper Class Homes 3 | 高档住宅 C | 1x1 | 2 | 24 | 0 | 1 |
| 0x7B | `r1High4` | Upper Class Homes 4 | 高档住宅 D | 1x1 | 2 | 24 | 0 | 1 |
| 0x8C | `r2Low1` | Small Apartments 1 | 廉价公寓 A | 2x2 | 0 | 200 | 0 | 2 |
| 0x8D | `r2Low2` | Small Apartments 2 | 廉价公寓 B | 2x2 | 0 | 200 | 0 | 2 |
| 0x8E | `r2Low3` | Small Apartments 3 | 廉价公寓 C | 2x2 | 0 | 200 | 0 | 2 |
| 0x8F | `r2Mid1` | Medium Apartments 1 | 中档公寓 A | 2x2 | 1 | 200 | 0 | 2 |
| 0x90 | `r2Mid2` | Medium Apartments 2 | 中档公寓 B | 2x2 | 1 | 200 | 0 | 3 |
| 0x91 | `r2High1` | Medium Condominiums 1 | 中型共管公寓 A | 2x2 | 2 | 200 | 0 | 3 |
| 0x92 | `r2High2` | Medium Condominiums 2 | 中型共管公寓 B | 2x2 | 2 | 200 | 0 | 3 |
| 0x93 | `r2High3` | Medium Condominiums 3 | 中型共管公寓 C | 2x2 | 2 | 200 | 0 | 3 |
| 0xAE | `r3Low1` | Large Apartments 1 | 大型公寓 A | 3x3 | 0 | 900 | 0 | 4 |
| 0xAF | `r3Mid1` | Large Apartments 2 | 大型公寓 B | 3x3 | 1 | 900 | 0 | 4 |
| 0xB0 | `r3High1` | Large Condominiums 1 | 大型共管公寓 A | 3x3 | 2 | 900 | 0 | 4 |
| 0xB1 | `r3High2` | Large Condominiums 2 | 大型共管公寓 B | 3x3 | 2 | 900 | 0 | 4 |

**商业 C**

| ID | key | 参考名 | 中文显示名 | 尺寸 | tier | pop | poll | popW |
|---|---|---|---|---|---|---|---|---|
| 0x7C | `c1Gas1` | Gas Station 1 | 加油站 A | 1x1 | 0 | 16 | 0 | 1 |
| 0x7D | `c1Inn` | Bed and Breakfast Inn | 民宿旅馆 | 1x1 | 1 | 16 | 0 | 1 |
| 0x7E | `c1Convenience` | Convenience Store | 便利店 | 1x1 | 0 | 16 | 0 | 1 |
| 0x7F | `c1Gas2` | Gas Station 2 | 加油站 B | 1x1 | 0 | 16 | 0 | 1 |
| 0x80 | `c1Office1` | Small Office Building 1 | 小型写字楼 A | 1x1 | 1 | 16 | 0 | 1 |
| 0x81 | `c1Office2` | Small Office Building 2 | 小型写字楼 B | 1x1 | 2 | 16 | 0 | 1 |
| 0x82 | `c1Warehouse` | Warehouse (commercial) | 商用仓库 | 1x1 | 0 | 16 | 0 | 1 |
| 0x83 | `c1ToyStore` | Toy Store（社区文档含店名，勿用） | 玩具店 | 1x1 | 1 | 16 | 0 | 1 |
| 0x94 | `c2ShoppingCenter` | Shopping Center | 购物中心 | 2x2 | 1 | 150 | 0 | 2 |
| 0x95 | `c2Grocery` | Grocery Store | 杂货超市 | 2x2 | 0 | 150 | 0 | 2 |
| 0x96 | `c2Office1` | Medium Office Building 1 | 中型写字楼 A | 2x2 | 1 | 150 | 0 | 2 |
| 0x97 | `c2Resort` | Resort Hotel | 度假酒店 | 2x2 | 2 | 150 | 0 | 2 |
| 0x98 | `c2Office2` | Medium Office Building 2 | 中型写字楼 B | 2x2 | 1 | 150 | 0 | 2 |
| 0x99 | `c2OfficeRetail` | Office/Retail | 商住综合楼 | 2x2 | 0 | 150 | 0 | 3 |
| 0x9A | `c2Office3` | Medium Office Building 3 | 中型写字楼 C | 2x2 | 1 | 150 | 0 | 3 |
| 0x9B | `c2Office4` | Medium Office Building 4 | 中型写字楼 D | 2x2 | 2 | 150 | 0 | 3 |
| 0x9C | `c2Office5` | Medium Office Building 5 | 中型写字楼 E | 2x2 | 2 | 150 | 0 | 3 |
| 0x9D | `c2Office6` | Medium Office Building 6 | 中型写字楼 F | 2x2 | 2 | 150 | 0 | 3 |
| 0xB2 | `c3OfficePark` | Office Park | 办公园区 | 3x3 | 1 | 700 | 0 | 4 |
| 0xB3 | `c3Tower1` | Office Tower 1 | 办公塔楼 A | 3x3 | 1 | 700 | 0 | 4 |
| 0xB4 | `c3MiniMall` | Mini Mall | 小型商场 | 3x3 | 0 | 700 | 0 | 4 |
| 0xB5 | `c3Theatre` | Theatre | 剧院广场 | 3x3 | 1 | 700 | 0 | 4 |
| 0xB6 | `c3DriveIn` | Drive In | 汽车影院 | 3x3 | 0 | 700 | 0 | 4 |
| 0xB7 | `c3Tower2` | Office Tower 2 | 办公塔楼 B | 3x3 | 2 | 700 | 0 | 4 |
| 0xB8 | `c3Tower3` | Office Tower 3 | 办公塔楼 C | 3x3 | 2 | 700 | 0 | 4 |
| 0xB9 | `c3ParkingLot` | Parking Lot | 商业停车场 | 3x3 | 0 | 700 | 0 | 4 |
| 0xBA | `c3HistoricOffice` | Historic Office | 历史办公楼 | 3x3 | 2 | 700 | 0 | 4 |
| 0xBB | `c3CorporateHQ` | Corporate Headquarters | 企业总部 | 3x3 | 2 | 700 | 0 | 4 |

**工业 I**

| ID | key | 参考名 | 中文显示名 | 尺寸 | tier | pop | poll | popW |
|---|---|---|---|---|---|---|---|---|
| 0x84 | `i1Warehouse1` | Small Warehouse 1 | 小仓库 A | 1x1 | 0 | 16 | 6 | 1 |
| 0x85 | `i1ChemStorage` | Chemical Storage | 化学品储存 | 1x1 | 0 | 16 | 6 | 1 |
| 0x86 | `i1Warehouse2` | Small Warehouse (第二变体) | 小仓库 B | 1x1 | 1 | 16 | 6 | 1 |
| 0x87 | `i1Substation` | Industrial Substation | 工业变电站 | 1x1 | 1 | 16 | 6 | 1 |
| 0x9E | `i2Warehouse` | Medium Warehouse | 中型仓库 | 2x2 | 0 | 160 | 12 | 2 |
| 0x9F | `i2ChemProc` | Chemical Processing 2 | 化工厂 B | 2x2 | 0 | 160 | 12 | 2 |
| 0xA0 | `i2Factory1` | Small Factory 1 | 小型工厂 A | 2x2 | 0 | 160 | 12 | 2 |
| 0xA1 | `i2Factory2` | Small Factory 2 | 小型工厂 B | 2x2 | 0 | 160 | 12 | 2 |
| 0xA2 | `i2Factory3` | Small Factory 3 | 小型工厂 C | 2x2 | 1 | 160 | 18 | 3 |
| 0xA3 | `i2Factory4` | Small Factory 4 | 小型工厂 D | 2x2 | 1 | 160 | 18 | 3 |
| 0xA4 | `i2Factory5` | Small Factory 5 | 小型工厂 E | 2x2 | 2 | 160 | 18 | 3 |
| 0xA5 | `i2Factory6` | Small Factory 6 | 小型工厂 F | 2x2 | 2 | 160 | 18 | 3 |
| 0xBC | `i3ChemProc` | Chemical Processing 1 | 化工厂 A | 3x3 | 0 | 640 | 24 | 4 |
| 0xBD | `i3LargeFactory` | Large Factory | 大型工厂 | 3x3 | 1 | 640 | 24 | 4 |
| 0xBE | `i3Thingamajig` | Industrial Thingamajig | 工业综合体 | 3x3 | 2 | 640 | 24 | 4 |
| 0xBF | `i3MediumFactory` | Medium Factory | 中型工厂 | 3x3 | 1 | 640 | 24 | 4 |
| 0xC0 | `i3Warehouse1` | Large Warehouse 1 | 大型仓库 A | 3x3 | 0 | 640 | 24 | 4 |
| 0xC1 | `i3Warehouse2` | Large Warehouse 2 | 大型仓库 B | 3x3 | 0 | 640 | 24 | 4 |

**过渡态（三类分区共用）**

| ID | key | 中文显示名 | 类别 | 尺寸 | pop | popW | 备注 |
|---|---|---|---|---|---|---|---|
| 0x88 | `construction1x1a` | 工地 A | construction | 1x1 | 0 | 1 | SCURK "Construction 7" |
| 0x89 | `construction1x1b` | 工地 B | construction | 1x1 | 0 | 1 | "Construction 8" |
| 0x8A | `abandoned1x1a` | 废弃屋 A | abandoned | 1x1 | 0 | 0 | 地价 −50% |
| 0x8B | `abandoned1x1b` | 废弃屋 B | abandoned | 1x1 | 0 | 0 | |
| 0xA6 | `construction2x2a` | 工地 C | construction | 2x2 | 0 | 2 | "Construction 3" |
| 0xA7 | `construction2x2b` | 工地 D | construction | 2x2 | 0 | 2 | "Construction 4" |
| 0xA8 | `construction2x2c` | 工地 E | construction | 2x2 | 0 | 3 | "Construction 5" |
| 0xA9 | `construction2x2d` | 工地 F | construction | 2x2 | 0 | 3 | "Construction 6" |
| 0xAA | `abandoned2x2a` | 废弃楼 A | abandoned | 2x2 | 0 | 0 | 社区文档四条同名 |
| 0xAB | `abandoned2x2b` | 废弃楼 B | abandoned | 2x2 | 0 | 0 | |
| 0xAC | `abandoned2x2c` | 废弃楼 C | abandoned | 2x2 | 0 | 0 | |
| 0xAD | `abandoned2x2d` | 废弃楼 D | abandoned | 2x2 | 0 | 0 | |
| 0xC2 | `construction3x3a` | 工地 G | construction | 3x3 | 0 | 4 | "Construction 1" |
| 0xC3 | `construction3x3b` | 工地 H | construction | 3x3 | 0 | 4 | "Construction 2" |
| 0xC4 | `abandoned3x3a` | 废弃楼 E | abandoned | 3x3 | 0 | 0 | |
| 0xC5 | `abandoned3x3b` | 废弃楼 F | abandoned | 3x3 | 0 | 0 | |

### 2.5 电厂 0xC6–0xCF [价格 / 产量 高；污染 中]

通用：`consumesPower = true`（电厂自身格也扣服务格）、`consumesWater = true`、无维护费、无预算线、寿命 50 年后报废（水电 / 风电不到期）、微模拟类型 1（风电 20、水电 21）。产量单位为"服务格"（= 可供电的建筑格数）。

| ID | key | 中文显示名 | 尺寸 | 造价 | 科技（基准年） | 整厂产量（格） | 标称 MW | 污染/格 | NIMBY | 朝向 | 放置限制 |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 0xC6 | `hydroA` | 水电站（朝向 A） | 1x1 | $400 | — | 40 | 20 | 0 | 否 | byId（两 ID 为两朝向） | 只能建在瀑布格 `XTER 0x3E`；朝向由较高邻格方向决定 |
| 0xC7 | `hydroB` | 水电站（朝向 B） | 1x1 | （同一工具） | — | 40 | 20 | 0 | 否 | byId | 同上 |
| 0xC8 | `windTurbine` | 风力发电机 | 1x1 | $100 | Wind 1980 | `floor((alt + rng(0..3)) / 2)`，0–18 | 4（标称） | 0 | 否 | none | 越高越好 |
| 0xC9 | `gasPlant` | 燃气电厂 | 4x4 | $2,000 | Gas 1950 | 176 | 50 | 10 | 是 | none | 平地 |
| 0xCA | `oilPlant` | 燃油电厂 | 4x4 | $6,600 | — | 768 | 220 | 25 | 是 | none | 平地 |
| 0xCB | `nuclearPlant` | 核电站 | 4x4 | $15,000 | Nuclear 1955 | 1,776 | 500 | 2 | 是 | none | 平地；Nuclear Free Zone 法令生效时禁建；可触发熔毁 |
| 0xCC | `solarPlant` | 太阳能电厂 | 4x4 | $1,300 | Solar 1990 | 16 × (`rng % floor((100−rain)/10)` + 5)，均值≈136 | 50 | 0 | 否 | none | 平地 |
| 0xCD | `microwavePlant` | 微波电厂 | 4x4 | $28,000 | Microwave 2020 | 5,680 | 1,600 | 0 | 否 | none | 平地；可触发微波失准灾害 |
| 0xCE | `fusionPlant` | 聚变电厂 | 4x4 | $40,000 | Fusion 2050 | 8,880 | 2,500 | 2 | 否 | none | 平地 |
| 0xCF | `coalPlant` | 燃煤电厂 | 4x4 | $4,000 | — | 704 | 200 | 50 | 是 | none | 平地 |

### 2.6 公共服务 / 休闲 / 奖励 0xD0–0xDB, 0xF3, 0xF5, 0xF7, 0xF8, 0xFF [尺寸 高；价格 中；覆盖 高]

通用：`consumesPower = consumesWater = true`（雕像、大公园例外见备注）、岗位 0（原版不把公共建筑计入就业；微模拟里的"警员 / 教师"只是显示值）、`orient = none`、污染 0 除注明外。年费为 100% 资金时每座每年；月结 1/12。

| ID | key | 中文显示名 | 类别 | 尺寸 | 造价 | 年费 / 预算线 | 解锁 | 污染/格 | 微模拟 | 功能参数（所有者规格） |
|---|---|---|---|---|---|---|---|---|---|---|
| 0xD0 | `cityHall` | 市政厅 | reward | 3x3 | $0 | 0 | `normalPop > 10,000`，一次 | 0 | 2 | 纯地标；stat1 = popCap(200, 900) |
| 0xD1 | `hospital` | 医院 | civic | 3x3 | $500 | $50 / Health | 始终 | 0 | 3 | 新生儿保护容量 25/座（LE） |
| 0xD2 | `policeStation` | 警察局 | civic | 3x3 | $500 | $100 / Police | 始终 | 0 | 4 | 覆盖 `XPLC`：中心强度 `S = fund × 5/2`（250），断电减半；菱形图案半径 3 四分格（§2.9） |
| 0xD3 | `fireStation` | 消防局 | civic | 3x3 | $500 | $100 / Fire | 始终 | 0 | 5 | 覆盖 `XFIR`，图案同警局 |
| 0xD4 | `museum` | 博物馆 | civic | 3x3 | $1,000 | 0 | 始终 | 0 | 23（共享） | EQ 加成（统计用大学资金） |
| 0xD5 | `bigPark` | 大公园 | park | 3x3 | $150 | 0 | 始终 | 0 | 22（共享） | **不受电**（`POWERABLE` 否），受水；地价 +40/格；R 需求 cap +3,000 |
| 0xD6 | `school` | 学校 | civic | 3x3 | $250 | $25 / Education-Schools | 始终 | 0 | 6 | 升学容量 15/座（EQ） |
| 0xD7 | `stadium` | 体育场 | recreation | 4x4 | $5,000 | 0 | 始终 | 4 | 7 | 放置时选球队（位掩码 `MISC 0x1028`）；R cap +16,000 |
| 0xD8 | `prison` | 监狱 | civic | 4x4 | $3,000 | $100 / Police | 始终 | 10 | 8 | NIMBY；监狱加成 `MISC 0x103C` |
| 0xD9 | `college` | 大学 | civic | 4x4 | $1,000 | $100 / Education-Colleges | 始终 | 0 | 9 | 升学容量 50/座 |
| 0xDA | `zoo` | 动物园 | recreation | 4x4 | $3,000 | 0 | 始终 | 0 | 10 | R cap +16,000 |
| 0xDB | `statue` | 雕像 | reward | 1x1 | $0 | 0 | `normalPop > 30,000`，一次 | 0 | 11 | 放置后清 `POWERABLE`，仍 `PIPED` |
| 0xF3 | `mayorsHouse` | 市长官邸 | reward | 2x2 | $0 | 0 | `normalPop > 2,000`，一次 | 0 | 12 | 显示支持率 |
| 0xF5 | `library` | 图书馆 | civic | 2x2 | $500 | 0 | 始终 | 0 | 24（共享） | EQ 加成（统计用学校资金） |
| 0xF7 | `church` | 教堂 | church | 2x2 | — | 0 | **不可放置**：每 2,500 居民自动替换一座 R 2x2 | 0 | 无 | 人口 0、不计税、不参与生长、不可被吞并 |
| 0xF8 | `marina` | 码头 | recreation | 3x3 | $1,000 | 0 | 始终 | 0 | 25（共享） | 占地内水格数必须 1..8；通电时生成帆船；R cap +9,000 |
| 0xFF | `greatDome` | 大穹顶（参考名 Braun Llama Dome，勿用） | reward | 4x4 | $0 | 0 | `normalPop > 90,000`，一次 | 0 | 16 | 纯观赏 |

### 2.7 水设施、车站 [尺寸 高；价格 高 / 中]

| ID | key | 中文显示名 | 类别 | 尺寸 | 造价 | 年费 / 预算线 | 科技（基准年） | 需电 | 产 / 蓄水 | 污染/格 | 微模拟 | 备注 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 0xDC | `waterPump` | 水泵 | waterFacility | 1x1 | $100 | 0 | — | 是 | `waterLevel×5 + 淡水邻格×10 + rain/2` 格/月（× 720 = 加仑） | 2 | 无 | 放置时自动在下方铺一格管线 |
| 0xEB | `waterTower` | 水塔 | waterFacility | **2x2** | $250 | 0 | — | 是（蓄水时） | 蓄 100 格/建筑格，整座 400 | 0 | 无 | 只蓄盈余 |
| 0xF4 | `waterTreatment` | 净水厂 | waterFacility | **2x2** | $500 | 0 | Water treatment 1935 **[低]** | 是 | 每座覆盖 2,000 受水建筑格 | 10 | 13 | NIMBY；不计入耗水 |
| 0xFA | `desalination` | 海水淡化厂 | waterFacility | 3x3 | $1,000 | 0 | Desalinization 1990 **[低]** | 是 | 每格 `20 × 3x3 内咸水格` | 0 | 14 | 只对咸水有效；全包围 640 格 |
| 0xE9 | `subwayStation` | 地铁站 | transitStation | 1x1 | $250 | $0.80 / Subway | Subways 1910 **[低]** | 是 | — | 5 | 独占（见 services §2.6） | 地下写 `XUND 0x23` |
| 0xEC | `busDepot` | 公交站 | transitStation | **2x2** | $250 | $25 固定支出，无滑块 | Buses 1920 **[低]** | 是 | — | 3 | 独占 | 四邻需有道路 |
| 0xED | `railDepot` | 火车站 | transitStation | **2x2** | $500 | $1.50 / Rail **[低]** | — | 是 | — | 4 | 独占 | 必须正交紧邻铁路 |

> 公交站与火车站为 **2x2** 来自逆向头文件 `GetTileCoverage`（`BUSDEPOT`、`RAILSTATION` 列在 2x2 case），兄弟规格 `transport-traffic.md` 的"1x1 [M]"应以本文为准（§4.1）。

### 2.8 港口 / 机场 / 军事自动部件 0xDD–0xF2, 0xF6, 0xF9 [ID / 尺寸 高；污染 中]

全部 `placeable = false`：由海港 / 机场 / 军事分区的生长扫描按配比放置（`services-models.md` §2.9、§2.8.2）。造价 / 维护 0（玩家只为划区付费：海港 $150/格、机场 $250/格 **[低]**）；`consumesPower = consumesWater = true`；岗位 0（机场 / 海港作为出行目的地由分区码而非建筑决定）。"军用"列表示军事基地生长也会使用该 ID（`GetMilitaryFromNormalTile` 映射）。

| ID | key | 参考名 | 中文显示名 | 类别 | 尺寸 | 朝向 | 军用 | 污染/格 | 生长配比 / 备注 |
|---|---|---|---|---|---|---|---|---|---|
| 0xDD | `runway` | Runway (straight) | 跑道 | airportPart | 1x1 | flipBit（LR↔TB） | 是 | 10 | 每次铺 5 格直线；有跑道才有飞机与空难 |
| 0xDE | `runwayCross` | Runway intersection | 跑道交叉 | airportPart | 1x1 | none | 是 | 10 | 两条跑道相交处 |
| 0xDF | `pier` | Pier | 栈桥 | seaportPart | 1x1 | flipBit | 否 | 10 | 从起重机向水面延伸 1–4 格，水深 ≥ 2 |
| 0xE0 | `crane` | Crane | 起重机 | seaportPart | 1x1 | flipBit **[中]** | 是 | 5 | 唯一计入工业需求 cap 的港口部件 |
| 0xE1 | `controlTowerCiv` | Civilian Control Tower | 民用塔台 | airportPart | 1x1 | none | 否 | 0 | 每 2 跑道组 1 座 |
| 0xE2 | `controlTowerMil` | Military Control Tower | 军用塔台 | militaryPart | 1x1 | none | 是 | 0 | 空军基地 |
| 0xE3 | `portWarehouse` | Warehouse (port) | 港口仓库 | seaportPart | 1x1 | none | 是 | 5 | 每台起重机 3 座；海军基地复用 |
| 0xE4 | `terminal1` | Building 1 | 航站楼 A | airportPart | 1x1 | none | 是 | 5 | |
| 0xE5 | `terminal2` | Building 2 | 航站楼 B | airportPart | 1x1 | none | 是 | 5 | |
| 0xE6 | `tarmac` | Tarmac | 停机坪 | airportPart | 1x1 | none | 是 | 10 | |
| 0xE7 | `fighterJet` | F-15b | 战斗机 | militaryPart | 1x1 | none | 是 | 10 | 空军基地 |
| 0xE8 | `hangarMil` | Hangar 1 | 机库 A（军） | militaryPart | 1x1 | none | 是 | 0 | 陆军 / 空军基地 |
| 0xEA | `radar` | Radar | 雷达站 | airportPart | 1x1 | none | 是 | 0 | SCURK 误名 "Tarmac" |
| 0xEE | `parkingCiv` | Civilian Parking Lot | 停车场（民用） | airportPart | **2x2** | none | 否 | 2 | 机场配比的"填充件" |
| 0xEF | `parkingMil` | Military Parking Lot | 停车场（军用） | militaryPart | **2x2** | none | 是 | 2 | 陆军基地主体 |
| 0xF0 | `loadingBay` | Loading Bay | 装卸区 | seaportPart | **2x2** | none | 否 | 2 | 每台起重机 4 座 |
| 0xF1 | `topSecret` | Top Secret | 机密设施 | militaryPart | **2x2** | none | 是 | 2 | 海军基地 |
| 0xF2 | `cargoYard` | Cargo Yard | 货场 | seaportPart | **2x2** | none | 是 | 10 | 每台起重机 4 座 |
| 0xF6 | `hangarCiv` | Hangar 2 | 机库 B（民） | airportPart | **2x2** | none | 是 | 5 | 每 4 跑道组 1 座 |
| 0xF9 | `missileSilo` | Missile Silo | 导弹发射井 | militaryPart | **3x3** | none | 是 | 0 | 地下写 `XUND 0x22`；军事格计数 `MISC 0x0FA8..` |

### 2.9 Arcology 0xFB–0xFE [价格 中；容量 高；门槛 低]

| ID | key | 参考名（勿作显示名） | 中文显示名 | 尺寸 | 造价 | 科技（基准年） | 人口门槛 | 容量 | 污染/格 | popW | 微模拟 |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 0xFB | `arcoPlymouth` | Plymouth Arcology | 拱城·先驱 | 4x4 | $100,000 | 2000 | `normalPop > 120,000` 且已发明（另说 100,000） | 55,000 | 25 | 12 | 15 |
| 0xFC | `arcoForest` | Forest Arcology | 拱城·森林 | 4x4 | $120,000 | 2050 | 同上 | 30,000 | 10 | 12 | 15 |
| 0xFD | `arcoDarco` | Darco Arcology | 拱城·暗穹 | 4x4 | $150,000 | 2100 | 同上 | 45,000 | 12 | 12 | 15 |
| 0xFE | `arcoLaunch` | Launch Arcology | 拱城·发射 | 4x4 | $200,000 | 2150 | 同上 | 65,000 | 15 | 12 | 15 |

Arcology 可重复放置；人口按微模拟逐年入住到容量（`services-models.md` §2.8.3）；Launch Arcology 数 > 300 且 arcoPop > 6,000,000 时触发升空事件。出行模型把 `XBLD > 0xFA` 当作无条件目的地。

### 2.10 覆盖图案（警 / 消）[高]

只有 0xD2 / 0xD3 有覆盖图层。以建筑**原点格**（`XZON & 0x80`，TR 角位）所在四分格 `q` 为中心，强度 `S`：

| 四分格偏移 | 值 | S = 250 时 |
|---|---|---|
| (0,0) | S | 250 |
| (±1,0), (0,±1) | A = 4S/5 | 200 |
| (±1,±1) | B = 3A/4 | 150 |
| (±2, −1..1), (−1..1, ±2) | C = 2B/3 | 100 |
| (±3, −1..1), (−1..1, ±3), (±2,±2) | D = C/2 | 50 |

每次叠加 `clamp(0,255)`。`S = fund × 5 / 2`（100% 资金 = 250），断电站点 `S/2`。监狱加成使警力 ×1.2。

### 2.11 玩家工具表 [分组结构 高；费用 中；拖拽模式 中/低；快捷键 见注]

工具栏分组与子工具顺序来自逆向头文件的 `CITYTOOL_GROUP_* / *_SUBTOOL` 枚举 **[高]**。`拖拽` 取值：`point`（单击，光标为建筑尺寸）、`line`（轴锁定直线拖动，逐格计费）、`rect`（矩形拖动）、`path`（自由拖动，经过的每格各算一次）。

**原版快捷键** **[中]**：Win95 SE 的工具**没有字母热键**；只有 `Shift+点击工具 = 该工具帮助`、`F1 = 总帮助`、`Alt+拖动（居中工具）= 平滑滚动`、`Shift+树木工具（地图编辑器）= 移除树木`、`Alt+拖动产业税率条 = 同时调整全部产业`。下表"快捷键"列是**本项目的原创建议键位**，必须可配置，默认开启。

| # | 组（group） | 子工具（tool id） | 作用 | 单位费用 | 拖拽 | 光标 | 可用条件 | 建议键 |
|---|---|---|---|---|---|---|---|---|
| 0.0 | Bulldozer | `bulldozer.demolish` | 拆除建筑 / 网络 / 树 / 浅水 / 瓦砾 → 瓦砾或空地 | $1/格（多格建筑整栋 `$1 × size²`） | path | 1x1 | 始终 | `B` |
| 0.1 | Bulldozer | `bulldozer.level` | 把经过地块拉平到起点高度，连带拆除 | $25/改变格 | path | 1x1 | 始终 | `Shift+B` |
| 0.2 | Bulldozer | `bulldozer.raise` | 抬高一个角点 | $25/改变格 | point | 1x1 | 始终 | `]` |
| 0.3 | Bulldozer | `bulldozer.lower` | 降低一个角点 | $25/改变格 | point | 1x1 | 始终 | `[` |
| 0.4 | Bulldozer | `bulldozer.dezone` | 取消分区（建筑变瓦砾） | $1/格 | rect **[低]** | 1x1 | 始终 | `X` |
| 1.0 | Nature | `nature.trees` | 密度 +1 | $3/次点击 | path | 1x1 | 始终 | `T` |
| 1.1 | Nature | `nature.water` | 平地 → 浅水；坡面 → 瀑布 | $100/格 | point | 1x1 | 始终 | `Shift+T` |
| 2.0 | Dispatch | `dispatch.police` | 派出警队到点 | $0 | point | 1x1 | 有警局 | `F5` |
| 2.1 | Dispatch | `dispatch.fire` | 派出消防队 | $0 | point | 1x1 | 有消防局 | `F6` |
| 2.2 | Dispatch | `dispatch.military` | 派出军队 | $0 | point | 1x1 | 有军事基地 | `F7` |
| 3.0 | Power | `power.wires` | 电线 | $2/格（跨水 $10） | line | 1x1 | 始终 | `P` |
| 3.1 | Power | `power.coal` | 燃煤电厂 0xCF | $4,000 | point | 4x4 | 始终 | `Shift+P` 打开电厂菜单 |
| 3.2 | Power | `power.hydro` | 水电 0xC6/0xC7 | $400 | point | 1x1 | 瀑布格 | 同上 |
| 3.3 | Power | `power.oil` | 燃油 0xCA | $6,600 | point | 4x4 | 始终 | 同上 |
| 3.4 | Power | `power.gas` | 燃气 0xC9 | $2,000 | point | 4x4 | Gas 已发明 | 同上 |
| 3.5 | Power | `power.nuclear` | 核电 0xCB | $15,000 | point | 4x4 | Nuclear 已发明且无核禁区法令 | 同上 |
| 3.6 | Power | `power.wind` | 风电 0xC8 | $100 | point | 1x1 | Wind 已发明 | 同上 |
| 3.7 | Power | `power.solar` | 太阳能 0xCC | $1,300 | point | 4x4 | Solar 已发明 | 同上 |
| 3.8 | Power | `power.microwave` | 微波 0xCD | $28,000 | point | 4x4 | Microwave 已发明 | 同上 |
| 3.9 | Power | `power.fusion` | 聚变 0xCE | $40,000 | point | 4x4 | Fusion 已发明 | 同上 |
| 4.0 | Water | `water.pipes` | 管线（自动切地下视图） | $3/格 | line | 1x1 | 始终 | `W` |
| 4.1 | Water | `water.pump` | 水泵 0xDC | $100 | point | 1x1 | 始终 | `Shift+W` 打开菜单 |
| 4.2 | Water | `water.tower` | 水塔 0xEB | $250 | point | 2x2 | 始终 | 同上 |
| 4.3 | Water | `water.treatment` | 净水厂 0xF4 | $500 | point | 2x2 | Water treatment 已发明 | 同上 |
| 4.4 | Water | `water.desalination` | 淡化厂 0xFA | $1,000 | point | 3x3 | Desalinization 已发明 | 同上 |
| 5.0 | Rewards | `rewards.mayorsHouse` | 0xF3 | $0 | point | 2x2 | 奖励位 bit0 且未放置 | `G` 打开奖励菜单 |
| 5.1 | Rewards | `rewards.cityHall` | 0xD0 | $0 | point | 3x3 | bit1 | 同上 |
| 5.2 | Rewards | `rewards.statue` | 0xDB | $0 | point | 1x1 | bit2 | 同上 |
| 5.3 | Rewards | `rewards.greatDome` | 0xFF | $0 | point | 4x4 | bit4 | 同上 |
| 5.4 | Rewards | `rewards.arcoPlymouth` | 0xFB | $100,000 | point | 4x4 | bit4（arco 位）且已发明 | 同上 |
| 5.5 | Rewards | `rewards.arcoForest` | 0xFC | $120,000 | point | 4x4 | 同上 | 同上 |
| 5.6 | Rewards | `rewards.arcoDarco` | 0xFD | $150,000 | point | 4x4 | 同上 | 同上 |
| 5.7 | Rewards | `rewards.arcoLaunch` | 0xFE | $200,000 | point | 4x4 | 同上 | 同上 |
| 6.0 | Roads | `roads.road` | 道路 | $10/格 | line | 1x1 | 始终 | `R` |
| 6.1 | Roads | `roads.highway` | 高速 | $100/2x2 段 | line（按 2x2 块步进） | 2x2 | Highways 已发明 | `H` |
| 6.2 | Roads | `roads.tunnel` | 点击上坡边坡格，直线掘进到对面 | $150/格 | point | 1x1 | 始终 | `Shift+R` |
| 6.3 | Roads | `roads.onramp` | 匝道 | $25 | point | 1x1 | 随高速 | `Shift+H` |
| 6.4 | Roads | `roads.busDepot` | 公交站 0xEC | $250 | point | 2x2 | Buses 已发明 | `U` |
| 7.0 | Rail | `rail.rail` | 铁路 | $25/格 | line | 1x1 | 始终 | `L` |
| 7.1 | Rail | `rail.subway` | 地铁（自动切地下视图） | $100/格 | line | 1x1 | Subways 已发明 | `Shift+L` |
| 7.2 | Rail | `rail.depot` | 火车站 0xED | $500 | point | 2x2 | 始终 | `D` |
| 7.3 | Rail | `rail.subStation` | 地铁站 0xE9 | $250 | point | 1x1 | 随地铁 | `Shift+D` |
| 7.4 | Rail | `rail.subToRail` | 转换件 0x6C–0x6F | $250 | point | 1x1 | 随地铁；需紧邻铁路 | `Ctrl+D` |
| 8.0 | Ports | `ports.seaport` | 海港分区 `XZON 9` | $150/格 | rect | 可变 | 始终 | `O` |
| 8.1 | Ports | `ports.airport` | 机场分区 `XZON 8` | $250/格 | rect | 可变（建议 ≥ 5x6） | Airport 已发明（基准 1927） | `Shift+O` |
| 9.0 | Residential | `zone.rLight` | `XZON 1` | $5/格 | rect | 可变 | 始终 | `1` |
| 9.1 | Residential | `zone.rDense` | `XZON 2` | $10/格 | rect | 可变 | 始终 | `Shift+1` |
| 10.0 | Commercial | `zone.cLight` | `XZON 3` | $5/格 | rect | 可变 | 始终 | `2` |
| 10.1 | Commercial | `zone.cDense` | `XZON 4` | $10/格 | rect | 可变 | 始终 | `Shift+2` |
| 11.0 | Industrial | `zone.iLight` | `XZON 5` | $5/格 | rect | 可变 | 始终 | `3` |
| 11.1 | Industrial | `zone.iDense` | `XZON 6` | $10/格 | rect | 可变 | 始终 | `Shift+3` |
| 12.0 | Education | `education.school` | 0xD6 | $250 | point | 3x3 | 始终 | `E` 打开菜单 |
| 12.1 | Education | `education.college` | 0xD9 | $1,000 | point | 4x4 | 始终 | 同上 |
| 12.2 | Education | `education.library` | 0xF5 | $500 | point | 2x2 | 始终 | 同上 |
| 12.3 | Education | `education.museum` | 0xD4 | $1,000 | point | 3x3 | 始终 | 同上 |
| 13.0 | Services | `services.police` | 0xD2 | $500 | point | 3x3 | 始终 | `S` 打开菜单 |
| 13.1 | Services | `services.fire` | 0xD3 | $500 | point | 3x3 | 始终 | 同上 |
| 13.2 | Services | `services.hospital` | 0xD1 | $500 | point | 3x3 | 始终 | 同上 |
| 13.3 | Services | `services.prison` | 0xD8 | $3,000 | point | 4x4 | 始终 | 同上 |
| 14.0 | Parks | `parks.small` | 0x0D | $20/格 | point（拖动 = 连续点放 **[低]**） | 1x1 | 始终 | `K` 打开菜单 |
| 14.1 | Parks | `parks.big` | 0xD5 | $150 | point | 3x3 | 始终 | 同上 |
| 14.2 | Parks | `parks.zoo` | 0xDA | $3,000 | point | 4x4 | 始终 | 同上 |
| 14.3 | Parks | `parks.stadium` | 0xD7 | $5,000 | point | 4x4 | 始终 | 同上 |
| 14.4 | Parks | `parks.marina` | 0xF8 | $1,000 | point | 3x3 | 临水 | 同上 |
| 15 | Signs | `signs.place` | 放置 / 编辑标牌 `XTXT 0x01–0x32` | $0 | point | 1x1 | ≤ 50 个 | `N` |
| 16 | Query | `query` | 查询格 / 建筑 / 微模拟 | $0 | point | 1x1 | 始终 | `Q`（按住 `Shift` 临时查询） |
| 17 | Centering | `center` | 居中 / 平滑滚动 | $0 | point / drag | — | 始终 | `C` |

非工具按钮（同一工具栏）：逆时针 / 顺时针旋转（`,` / `.`）、缩小 / 放大（`-` / `=`）、城市地图、人口、邻城、图表、产业、预算、显示开关（建筑 / 标牌 / 基础设施 / 分区 / 地下视图，建议 `F2`–`F4` 与 `Tab` 切地下）、帮助、RCI 指示器。地图编辑模式工具（Raise / Lower / Stretch / Level / 水位 ± / Water / Stream / Trees / Forest / Make / Done）全部免费，见 `terrain.md` §2.8。

桥梁不是工具：道路 / 铁路 / 高速拖到水面时弹出"选择桥型"对话框，按 `水面格数 × 基价` 报价（§2.3.2）。邻城连接也不是工具：网络到达地图边缘时弹确认框，$1,000/条 **[中]**。

---

## 3. 数据结构与算法建议

### 3.1 TypeScript 类型

```ts
// data/buildings.ts —— 由本文表格生成，是全仓库唯一的建筑属性来源
export type Footprint = 1 | 2 | 3 | 4;
export type ZoneType = 'R' | 'C' | 'I';
export type OrientMode =
  | 'none'      // 无朝向变体
  | 'byId'      // 朝向编码在不同 XBLD 中（道路 / 电线 / 铁路 / 隧道 / 匝道 / 转换件 / 水电）
  | 'flipBit'   // 单 ID，XBIT.FLIPPED 置位时旋转 90°（渲染水平镜像）
  | 'byIdAndFlip'; // 匝道：ID 选四种组合，再由 flipBit 整体转 90°

export type BuildingCategory =
  | 'ground' | 'rubble' | 'radioactive' | 'tree' | 'park'
  | 'powerLine' | 'road' | 'rail' | 'tunnel' | 'crossover'
  | 'highway' | 'highwayCrossover' | 'bridge' | 'onramp' | 'subRail'
  | 'zoneR' | 'zoneC' | 'zoneI' | 'construction' | 'abandoned'
  | 'powerPlant' | 'civic' | 'recreation' | 'reward' | 'waterFacility'
  | 'transitStation' | 'airportPart' | 'seaportPart' | 'militaryPart'
  | 'church' | 'arcology';

export type TechKey =
  | 'gas' | 'nuclear' | 'solar' | 'wind' | 'microwave' | 'fusion'
  | 'airport' | 'highways' | 'buses' | 'subways'
  | 'waterTreatment' | 'desalinization'
  | 'arcoPlymouth' | 'arcoForest' | 'arcoDarco' | 'arcoLaunch';

export type BudgetLine =
  | 'police' | 'fire' | 'health' | 'schools' | 'colleges'
  | 'roads' | 'highways' | 'bridges' | 'rail' | 'subway' | 'tunnel'
  | 'busFixed';            // 公交站：固定支出，无滑块

/** 奖励解锁：MISC 0x0078 的位 + 严格大于的人口阈值 */
export interface RewardUnlock { rewardBit: 0 | 1 | 2 | 3 | 4; popOver: number; once: boolean }

export interface CoverageDef {
  layer: 'XPLC' | 'XFIR';
  strengthAt100: 250;                 // S = fund * 5 / 2
  pattern: 'servicesDiamond';         // §2.10 的五环图案
  halveWhenUnpowered: true;
}

export interface BuildingDef {
  id: number;                         // XBLD 0x00..0xFF
  key: string;                        // 稳定标识符（表中 key 列）
  name: string;                       // 原创显示名（中文）；可本地化
  refName?: string;                   // 社区文档识别名，仅注释用途，不进 UI
  category: BuildingCategory;
  size: Footprint;                    // 来自 GetTileCoverage 四类
  placeable: boolean;                 // 玩家工具能否直接产生
  tool?: string;                      // 对应 ToolDef.id
  cost: number;                       // 一次性造价（不可放置者为 0）
  upkeepPerYear: number;              // 100% 资金时每座年费；月结 /12
  budgetLine?: BudgetLine;
  tech?: TechKey;                     // 需已发明
  unlock?: RewardUnlock;
  powerable: boolean;                 // 放置后置 POWERABLE（雕像 / 公园为 false）
  consumesPower: boolean;             // 每格扣 1 服务格（所有 XBLD >= 0x70，含电厂）
  piped: boolean;                     // 放置后置 PIPED
  consumesWater: boolean;             // 水设施自身为 false
  powerOutput?: { kind: 'fixed'; tiles: number } | { kind: 'wind' } | { kind: 'solar' } | { kind: 'hydro' };
  waterOutput?: { kind: 'pump' } | { kind: 'desal' } | { kind: 'tower'; unitsPerCell: 100 } | { kind: 'treatment'; tilesPerPlant: 2000 };
  pollutionPerTile: number;           // XPLT 源强度（services §2.3.1）
  popWeight: number;                  // XPOP 权重（分区建筑 1..4；其它建筑 2；arco 12）
  residents: number;                  // R 居民；arco 为容量
  jobs: number;                       // C / I 岗位；公共建筑 0
  zone?: { type: ZoneType; tier: 0 | 1 | 2; weight: number };
  transition?: 'construction' | 'abandoned';
  coverage?: CoverageDef;
  microsim?: { type: number; shared: boolean };
  nimby: boolean;
  orient: OrientMode;
  sprite: { n: number; mirrorOnFlip: boolean };   // n == id；large = 1000+n, medium = 500+n, small = n
  lifetimeYears?: number;             // 电厂 50；水电 / 风电 undefined
  placement?: {
    terrain: 'flat' | 'waterfall' | 'slopeEntrance' | 'any';
    waterCellsInFootprint?: [min: number, max: number];   // 码头 [1,8]
    needsAdjacent?: 'road' | 'rail' | 'highway+road';
  };
}

// data/tools.ts
export type PlaceMode = 'point' | 'line' | 'rect' | 'path';
export type CostUnit = 'tile' | 'segment2x2' | 'click' | 'building' | 'changedTile' | 'none';

export interface ToolDef {
  id: string;                         // 'roads.road'
  group: 'bulldozer' | 'nature' | 'dispatch' | 'power' | 'water' | 'rewards' | 'roads' | 'rail'
       | 'ports' | 'residential' | 'commercial' | 'industrial' | 'education' | 'services'
       | 'parks' | 'signs' | 'query' | 'center';
  label: string;                      // 原创文案
  placeMode: PlaceMode;
  cursor: Footprint | 'variable' | 'none';
  cost: number;
  costUnit: CostUnit;
  buildingIds?: readonly number[];    // 该工具可产生的 XBLD（电厂 / 设施 / 网络族）
  zoneCode?: number;                  // 分区工具：XZON 低 4 位
  undergroundView?: boolean;          // 管线 / 地铁：激活时切地下视图
  tech?: TechKey;
  unlock?: RewardUnlock;
  requires?: 'policeStation' | 'fireStation' | 'militaryBase';
  hotkey?: string;                    // 原创默认键位，可配置
  availableIn: 'city' | 'map' | 'both';
}
```

### 3.2 派生查表与不变量

```ts
export const BUILDINGS: readonly BuildingDef[] = [...];       // 恰好 256 条，按 id 升序
export const FOOTPRINT = new Uint8Array(256);                  // FOOTPRINT[id] = size
export const CATEGORY: readonly BuildingCategory[] = ...;      // CATEGORY[id]
export const DEVELOPED_FIRST = 0x70;                           // >= 即"建筑格"
export const isZoneBuilding = (id: number) => id >= 0x70 && id <= 0xC5 && !!BUILDINGS[id].zone;
export const isTerminal     = (id: number) => id > 0xFA;       // arco + 大穹顶

// vitest 不变量（catalogue.test.ts）
assert(BUILDINGS.length === 256 && BUILDINGS.every((b, i) => b.id === i));
assert(new Set(BUILDINGS.map(b => b.key)).size === 256);
assert(FOOTPRINT 的 2x2 集合 == { 0x61..0x6B, 0x8C..0xAD, 0xEB, 0xEC, 0xED, 0xEE, 0xEF, 0xF0, 0xF1, 0xF2, 0xF3, 0xF4, 0xF5, 0xF6, 0xF7 });
assert(FOOTPRINT 的 3x3 集合 == { 0xAE..0xC5, 0xD0..0xD6, 0xF8, 0xF9, 0xFA });
assert(FOOTPRINT 的 4x4 集合 == { 0xC9..0xCF, 0xD7, 0xD8, 0xD9, 0xDA, 0xFB..0xFF });
assert(每个 placeable 建筑都有 tool，且 TOOLS[tool].buildingIds 含该 id);
assert(每个 id >= 0x70 的 consumesPower === true);
assert(consumesWater === false 的集合 == { 0xDC, 0xEB, 0xF4, 0xFA } ∪ { id < 0x70 });
assert(powerable === false 的 id >= 0x70 集合 == { 0xD5, 0xDB });
assert(Σ cost 与 economy-budget.md §2.9 表逐项一致);   // 用快照测试锁定
// 有玩家精灵文件时的交叉校验（可选，导入诊断）：
//   large 精灵 width == 32 * FOOTPRINT[id]（0x49/0x4A 高速直线段按 1x1 计）
```

### 3.3 占地锚点与枚举建筑

```
// 以 TL 角位 (XZON & 0x40) 为锚点：1x1 写 0xF0 也含 TL 位，因此"TL 置位格数 = 建筑栋数"
anchorsOf(city):
  for i in 0..16383:
    if city.xbld[i] >= 0x0E && (city.xzon[i] & 0x40): yield { anchor: i, id: city.xbld[i], size: FOOTPRINT[id] }

// 从任意格找到所属建筑的锚点（查询 / 拆除 / 微模拟用）
lotOf(city, x, y):
  id = xbld[x,y]; s = FOOTPRINT[id]
  if s == 1: return (x, y, 1)
  for dx in 0..s-1, dy in 0..s-1:                 // 最多 16 次
    ax = x - dx; ay = y - dy
    if inBounds(ax, ay) && xbld[ax,ay] == id && (xzon[ax,ay] & 0x40)
       && 占地 (ax..ax+s-1, ay..ay+s-1) 全为 id: return (ax, ay, s)
  return (x, y, 1)                               // 损坏存档：按 1x1 处理并记诊断

// 注意：services-models 的覆盖扫描用 TR 角位 (0x80) 作为"原点格"，两者都是合法锚点；
// 新代码一律用 TL，读旧逻辑时注意换算。
```

### 3.4 放置检查与扣费

```
canPlace(def, x, y, city, funds) -> { ok, reason?, cost }:
  s = def.size
  if x + s > 128 || y + s > 128: return fail('outOfBounds')    // 4x4 锚点 x,y <= 124
  if def.tech && !tech.invented(def.tech): return fail('notInvented')
  if def.unlock && !(rewards.granted(def.unlock.rewardBit)): return fail('locked')
  if def.id == 0xCB && ordinances.nuclearFreeZone: return fail('ordinance')
  waterCells = 0
  for each (tx, ty) in footprint:
    t = index(tx, ty)
    if def.placement.terrain == 'flat'      && (xter[t] & 0x0F) != 0: return fail('slope')
    if def.placement.terrain == 'waterfall' && xter[t] != 0x3E:       return fail('needWaterfall')
    if xbit[t] & WATER: waterCells++
    if xbld[t] >= 0x0E: return fail('occupied')                      // 树木 / 瓦砾 / 空地可覆盖
    if (xzon[t] & 0x0F) != 0 && !def.zone: return fail('zoned')      // 原版：公共建筑不能压分区
  if def.placement.waterCellsInFootprint:
    [lo, hi] = ...; if waterCells < lo || waterCells > hi: return fail('waterCells')
  else if waterCells > 0 && def.placement.terrain != 'waterfall': return fail('water')
  if def.placement.needsAdjacent && !hasAdjacent(def, x, y): return fail('adjacency')
  if def.microsim && !def.microsim.shared && microsims.free() == 0: return fail('microsimFull')
  if def.cost > funds: return fail('funds')
  return { ok: true, cost: def.cost }

place(def, x, y):
  economy.charge(def.cost)
  for each t in footprint: xbld[t] = def.id; xzon[t] = (xzon[t] & 0x0F) | cornerBits(t, x, y, s)
  flags = (def.powerable ? POWERABLE|POWERED : 0) | (def.piped ? PIPED : 0)     // POWERED 为乐观预置
  for each t: xbit[t] = (xbit[t] & ~(POWERABLE|POWERED|PIPED)) | flags
  if def.id == 0xDC: pipes.ensureUnder(x, y)                 // 水泵自动管线
  if def.id in {0xE9, 0x6C..0x6F}: xund[t] = 0x23
  if def.id == 0xF9: xund 全占地 = 0x22
  if def.nimby: nimby.roll(def, x, y)                        // services §2.5
  if def.microsim: microsims.allocate(def, anchor)
  budget.count(def.budgetLine)++ ; misc.tileCount[def.id] += s*s
  if def.id == 0xD7: ui.openTeamDialog()
  power.rescan(); water.rescan()

// 工具计费：拖动类先算整段再一次扣；资金不足整段拒绝（economy §3.6）
costOfDrag(tool, tiles):
  switch tool.costUnit:
    'tile':        return tool.cost * count(tiles where 需要新铺)        // 重复铺同族免费
    'segment2x2':  return tool.cost * blocks(tiles)
    'changedTile': return tool.cost * count(tiles where 高度实际改变)
    'click':       return tool.cost
    'building':    return tool.cost
```

### 3.5 精灵解析

```
spriteFor(id, zoom, flipped) -> { fileId, mirror }:
  base = { small: 0, medium: 500, large: 1000 }[zoom]
  if id == 0x00: return null                                  // 画地形
  def = BUILDINGS[id]
  return { fileId: base + id, mirror: flipped && def.sprite.mirrorOnFlip }

// 视图旋转（MISC 0x0008 compass）不改存档：渲染时把 byId 族的 ID 按旋转映射
// （LR↔TB、BR→BL→TL→TR 循环、坡面与隧道口朝向循环），flipBit 族按 (flipped XOR compass&1) 镜像。
// 无玩家精灵文件时，占位美术按 category + size + tier 程序化生成，颜色按 category 分组。
```

### 3.6 数据文件生成

建议把 §2 的表格作为 `docs/spec/building-catalogue.md` 的 SSOT，用一个 `scripts/gen-catalogue.ts` 解析 Markdown 表生成 `src/data/buildings.generated.ts`，并在 CI 里比对生成结果与提交文件（防手改漂移）。若不想解析 Markdown，则手写 `buildings.ts`，由 §3.2 的 vitest 不变量守护。

---

## 4. 边界条件与易错点

### 4.1 与兄弟规格的冲突及本文采用值

| 项 | 兄弟规格 | 本文采用 | 依据 |
|---|---|---|---|
| 公交站 0xEC、火车站 0xED 尺寸 | `transport-traffic.md` 1x1 [M]、`economy-budget.md` 1x1 | **2x2** | 逆向 `GetTileCoverage` 2x2 case 明列两者 **[高]** |
| 导弹发射井 0xF9 | `services-models.md` "每格放 0xF9" | **3x3 建筑**，占地全写 0xF9 + `XUND 0x22` | 同上 3x3 case **[高]**；生长逻辑应改为"放一座 3x3" |
| 机场科技基准年 | `services` 1927 [低] / `transport` 1930 [低] | 1927 | 两者皆低置信；取所有者规格值，进 `TECH_BASE_YEAR` 常量 |
| 商业建筑污染 | `zones` 加油站 / 停车场权重 1 | 0 | 污染模块所有者 `services` §2.3.1 未列商业源；`zones` 的 0–5 权重仅用于期望度 |
| 拆除多格建筑 | `transport` $1/格 vs `economy` `$1 × size²` | `$1 × size²`（开关 `demolishWholeStructure`） | 经济规格 Q9 |

### 4.2 ID 层面的陷阱

1. **同名不同物**：0x82（商业仓库）、0x84 / 0x86（工业小仓库，社区文档两条同名）、0x9E、0xC0 / 0xC1、0xE3（港口仓库）都叫 Warehouse；0xE8（军用机库）与 0xF6（民用机库，2x2）都叫 Hangar；0xB9（商业 3x3 停车场）与 0xEE / 0xEF（2x2 停车场）都叫 Parking lot；0xE6 Tarmac 与 0xEA Radar 在 SCURK 里互相混名。**一律按 ID 建表，不按名字。**
2. **0x5C 高架电线落在桥区间内**：原版汽车模式把 `0x51–0x5C` 一并当桥，本文类别仍归 `powerLine`；交通模块需要原版怪癖时自己用 `BRIDGE_SET` 范围判断（`transport-traffic.md` §2.3）。
3. **高速直线段 0x49/0x4A 是 1x1**，坡面 / 转弯 / 立交 / 加固桥 0x61–0x6B 才是 2x2 物件；放置时都按 2x2 块步进，但 `FOOTPRINT[0x49] == 1`，角标四格全置。
4. **水电两个 ID**：工具一个，放置时按"哪侧邻格更高"选 0xC6 / 0xC7；精灵分别存在，不用镜像。
5. **翻转位的归属**：`XBIT 0x02` 只对 `orient ∈ {flipBit, byIdAndFlip}` 有意义；对其它 ID 读到置位应忽略并在导入诊断里记一笔，导出时清零。
6. **雕像与大公园不受电**但仍 `PIPED`；小公园 `< 0x70` 既不是电也不是水的消费者，却导水。断电图标只画 `XBLD >= 0x70 && POWERABLE && !POWERED`。
7. **教堂不可放置、不可被吞并、不计人口**；它占着 R 2x2 的地，分区码仍是 R，拆除后地块恢复普通分区地。
8. **施工 / 废弃是独立 ID**，不是状态位：切换尺寸时必须换 ID 段（1x1 ↔ 0x88/0x89、2x2 ↔ 0xA6–0xA9、3x3 ↔ 0xC2/0xC3）。
9. **`MISC 0x01F0` 的 256 项建筑格计数以 XBLD 为索引**，统计的是格数不是栋数；栋数 = 格数 / size²（`GetTileArea` 语义）。
10. **4x4 锚点范围**：`x, y ∈ 0..124`；覆盖扫描又忽略最外圈 `x, y ∈ {0, 127}`，所以贴边放置的 4x4 建筑可能在统计里"少一圈"，这是原版行为。
11. **科技年份有随机偏移**，不要在 UI 写死"1950 年可用"；用 `tech.invented(key)`，发明当年报纸会播报。
12. **Arcology 的双重门槛**：奖励位 bit4 与各自发明年份都要满足；bit4 置位后不随人口下降清除。
13. **名称版权**：`refName` 仅存在于规格与源码注释，不得进入 `name`、UI、存档 `XLAB` 默认名。玩具店、大穹顶、四种 Arcology 的显示名必须用原创文本（表中已给）。
14. **军事部件复用**：`GetMilitaryFromNormalTile` 把 0xDD / 0xDE / 0xE0 / 0xE3 / 0xE4 / 0xE5 / 0xF2 / 0xF6 也算军事瓦片——统计 `MISC 0x0FA8..` 时按**所在分区码 7** 判断，不按 ID。
15. **半高铁路件 0x3B–0x3E 在平地格上**，`XTER == 0`，不要把它们当坡面件处理；拆除坡面件时要连带把配对的半高件退化为普通直线。

---

## 5. 待确认问题

| # | 问题 | 本文默认 | 影响 |
|---|---|---|---|
| Q1 | 公交站 / 火车站 2x2（逆向）与社区记忆 1x1 的矛盾——是否存在版本差异（DOS vs Win95） | 2x2 | 车站放置 UI、出行模型"邻接"判断 |
| Q2 | 原版 `costFromSubTool`（0x4DC140）与 `dwBridgeBaseCost` 的真实数值未读到，整张造价表为社区共识 | §2 表 | 经济平衡；用快照测试锁定，待实测校正 |
| Q3 | Dezone 与小公园的拖拽模式（矩形 / 单点 / 路径） | Dezone rect、小公园 point+连续 | 手感 |
| Q4 | 树木工具每次 +1 档还是随机 +1..2 档 | +1 | 美观 |
| Q5 | 起重机 0xE0 是否用翻转位、栈桥方向是否完全由起重机决定 | 两者 flipBit，栈桥跟随起重机 | 海港渲染 |
| Q6 | 放射性废料能否被推土机清除、是否随时间衰减 | 不可清除、不衰减 | 核泄漏后果 |
| Q7 | 翻转位的渲染是否就是水平镜像（原版 LARGE.DAT 是否另有旋转精灵） | 镜像 | 渲染 |
| Q8 | 分区建筑 pop（24 / 200 / 900 等）与 C 污染 0 的取值 | 沿用 `zones` / `services` | 人口量级、需求 |
| Q9 | 军事导弹井按 3x3 建筑放置后，`MISC 0x0FA8` 军事计数口径（格还是栋） | 格 | 存档兼容 |
| Q10 | 机场基准年 1927 vs 1930；Buses 1920、Subways 1910、Water treatment 1935 全部为记忆值 | 如表 | 早期可用工具 |
| Q11 | 海港 / 机场分区单价（$150 / $250 每格）与是否需要最小尺寸 | 如表，机场建议 ≥ 5x6 | 经济 |
| Q12 | 原版是否真的没有任何工具字母热键（仅 Shift+点击帮助 / F1） | 无；本项目提供原创键位 | 输入层 |
| Q13 | 高速直线段跨水（低架桥）的费用（$100/段）与是否单独预算线 | $100/段，Bridges 线 | 经济 |

---

## 6. 参考来源

- dfloer/SC2k-docs（CC BY-SA 4.0，本地副本）：`sc2_file_spec.md`（XBLD 全表与 SCURK 名、XZON 角标、XBIT 翻转位语义、MISC 科技年份与建筑格计数、XUND、XTXT/XLAB/XMIC）、`simulation_spec.md`（电厂产量表、水泵 / 淡化公式、水塔、净水厂、NIMBY 列表、市民诉求与休闲 cap）、`sprite_data_spec.md`（精灵 ID 与 XBLD 同号、MIF 中的建筑宽度 8–128 px）。本文全部为转述与重排。
- araxestroy/sc2kfix（MIT；**仅阅读以理解机制，未复制代码**）：`include/sc2k/sc2k_1996.h` 的 `TILE_*` 枚举顺序、`GetTileCoverage` 四类占地、`GetMilitaryFromNormalTile` 映射、`CITYTOOL_GROUP_* / *_SUBTOOL / MAPTOOL_*` 工具栏枚举、`AREA_1x1..4x4` 与 `GetTileArea`、`costFromSubTool` / `dwBridgeBaseCost` 的存在；`modules/sc2k_help.cpp` 中关于 Shift+点击 / F1 / Alt 拖动的交互事实与警 / 消 / 医 / 校 / 院年费（$100 / $100 / $50 / $25 / $100）。
- 本仓库兄弟规格：`power-water.md`（电厂 / 水设施价格、产量、消费口径、POWERABLE/PIPED 规则）、`services-models.md`（公共建筑价格 / 年费 / 微模拟类型 / 覆盖图案 / 污染源表 / 人口权重 / 奖励门槛 / 海港机场配比）、`transport-traffic.md`（网络族价格与维护、桥型、车站规则）、`zones-growth-demand.md`（分区建筑 tier / pop / 过渡态）、`economy-budget.md`（造价总表、扣费 API、维护月结）、`terrain.md`（地形工具费用、桥梁对话框）、`file-formats.md`（精灵 ID 基址与号段）。
- 作者对 SC2K 的记忆（科技基准年、Arcology 价格、工具栏行为细节），均标 **[中]** 或 **[低]**。
