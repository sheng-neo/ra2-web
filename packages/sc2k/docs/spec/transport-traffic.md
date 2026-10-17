# 领域规格：交通与路网（Transport & Traffic）

> 适用范围：`packages/sc2k` 中的 `sim/transport`（道路 / 铁路 / 高速 / 匝道 / 隧道 / 桥梁 / 车站 / 地铁 / 邻城连接 / 交通预算衰败）与 `sim/traffic`（出行生成器、对 `XTRF` 交通密度图的累加、车站乘客计数；`XTRF` 衰减与 `MISC 0x0030` 交通总量归 services），以及这些层在存档（`XBLD / XUND / XBIT / XTXT / XTRF / MISC`）中的编码。
> 目标读者：并行实现各模块的工程师（含 AI agent）。本文给出可直接实现的数据结构、位掩码、数值表与伪代码。
> 蓝本：SimCity 2000 Windows 95 Special Edition（下称 SC2K）。
> 置信度标记：**[H]** 一手资料直接支持（社区存档格式文档；对原版引擎逆向重实现的阅读理解；游戏内帮助文本）；**[M]** 多个二手来源一致或强推断；**[L]** 仅凭记忆 / 单一二手来源 / 为"可实现"而给出的建议值——必须做成 `TransportTuning` / `TrafficTuning` 的可调参数并列入 §5。
> 版权铁律：本文只描述规则与数值，不含任何 Maxis/EA 素材；参考仓库（sc2kfix 等）仅用于理解机制，本文的接口、伪代码与数据结构均为原创组织，不是对其代码的转写。
> 与兄弟规格的边界：坡面合法性、桥梁几何 / 对话框、隧道几何与地形改动归 `terrain.md` §2.11；分区生长、需求上限（cap）、邻城人口增长归 `zones-growth-demand.md`；车辆 / 船 / 飞机等 `XTHG` 物件的运动归"物件与灾害"规格；**`XTRF` 本体的衰减、`MISC 0x0030` 交通总量与 `trafficGraph` 归 `services-models.md` §2.4 / §3.3**（本模块只经 `addTraffic` 累加、只读 `XTRF`）；建筑占地尺寸以 `building-catalogue.md` 为准。本文在这些交界处只给出接口与一致性要求。
> 修订说明（v2，评审回应）：(1) 公交站 `0xEC` / 火车站 `0xED` 由 1×1 改为 **2×2**（采纳 `building-catalogue.md` §2.7 / §4.1 对逆向占地分类函数 `GetTileCoverage` 的读法），新增 §2.9.1 "车站占地"，并同步修订 §1 / §2.2 / §2.3 / §2.4 / §2.9 / §2.10 / §2.11 / §2.12.3 / §2.12.4 / §2.12.5 / §3.1 / §3.2 / §3.4 / §3.5 / §3.6 / §4 / §5；(2) `XTRF` 月度衰减与 `MISC 0x0030` 的写权**全部交给 `services-models.md`**，本模块只保留 `addTraffic` 调用与 `roadTileCounts()` 统计，§2.12.6 / §2.12.7 / §3.7 / §3.8 相应改写，旧稿的 `hightraffic 120 / 160`（`trafficCount` 口径）阈值废弃，统一改用 `trafficGraph` 口径。

---

## 1. 概述

SC2K 的交通系统由三层网络和一个出行模型组成：

| 层 | 内容 | 存档位置 | 本文章节 |
|---|---|---|---|
| 地表网络 | 道路（15 片段）、铁路（15 片段 + 4 半高件）、高速公路（2×2 块）、匝道、隧道口、桥段、三种网络与电线的交叉件、三类车站、地铁↔铁路转换件 | `XBLD`（每格 1 字节），朝向位 `XBIT.bit6`，建筑角标 `XZON` 高 4 位 | §2.1–§2.10 |
| 地下网络 | 地铁（15 片段）、地铁与水管交叉件、地铁入口（车站 / 转换件的地下部分） | `XUND`（每格 1 字节） | §2.9 |
| 邻城连接 | 到达地图边缘的道路 / 铁路 / 高速 | `XTXT = 0xFA` 标记格 + `MISC 0x1024` 连接格数 + `MISC 0x06D8..` 邻城数据 | §2.13 |
| 出行模型 | 每个分区格周期性生成一次"上班 / 购物"出行，在网络上做带回溯的随机深度优先搜索；成功出行把路径上的道路段写入 64×64 的交通密度图 | `XTRF`（4096 字节；本模块只经 `services.addTraffic` 累加，月度衰减与 `MISC 0x0030` 交通总量由 `services-models.md` 写）、三种车站的乘客计数（微模拟） | §2.11–§2.12 |

核心事实（实现者必须先接受的四条）：

1. **分区的"道路可达"不是圆形半径，而是一张固定的 24 个偏移的查找表**（§2.11）：沿轴向最远 3 格，斜向只到 (±1,±1)、(±2,±1)、(±1,±2)。车站占地的任一格（公交站 / 火车站为 **2×2**，地铁站 1×1，§2.9.1）与道路同样提供可达；**纯铁路、高速、地铁不提供**。**[H]**
2. **出行是"步数预算"模型，不是欧氏距离**：预算 100 步；道路每格 3 步、公交下车后步行每格 2 步、高速 / 铁路 / 地铁每格 1 步、换乘（踏入车站占地）4 步、车站占地内部移动 0 步（§2.9.1，可调）。因此纯道路约 33 格，高速 / 轨道约 100 格，公交后约 50 格。**[H]**
3. **只有汽车模式（道路 / 高速 / 公路桥）的路径段会累加交通密度**；隧道、步行（公交之后）、铁路、地铁都不产生交通。公交站的作用正是把后续路程变成"步行"：更省步数，且不计交通。**[H]**
4. **交通预算 < 100% 时基础设施按概率物理损毁**（道路 / 铁路 / 高速变废墟，桥梁在大风天坍塌并上报纸），而不是"效率下降"。**[H]**

模块输入（只读）：地形（`alt / XTER / water / tunnelLevels`）、分区 `XZON`、建筑 `XBLD`（非交通部分）、供电位 `XBIT.powered`、年份 / 发明状态、预算资金率、PRNG、天气风速、`XTRF` 的只读视图（services 持有）。
模块输出：交通层各数组、对 `XTRF` 的 `services.addTraffic(tile, popLevel)` 调用（`XTRF` 本体、月度衰减、`MISC 0x0030` 交通总量与 `trafficGraph` 归 services）、`roadTileCounts()`（道路 / 高速 / 桥格数，`trafficGraph` 的分母）、三种车站乘客数、邻城连接计数、交通维护费、"设施损毁 / 桥梁坍塌 / 需要连接"事件（"交通拥堵"报纸 / 抱怨由 services / disasters 按 `trafficGraph` 触发，§2.12.7），以及给分区模块的 `hasAccess(i)` 与 `runTrip(...)` 两个查询。

---

## 2. 原版行为

### 2.1 坐标、方向与 15 种连接片段

方向命名沿用 `terrain.md`：**T = −y，R = +x，B = +y，L = −x**。本文的连接掩码固定为 `bit0 = T, bit1 = R, bit2 = B, bit3 = L`（与原版出行搜索的方向遍历顺序一致 **[H]**，便于复刻随机性）。

道路、电线、铁路、地铁、水管五个网络族共享同一套 **15 个片段的相对编号**（`id = base + idx`）**[H]**：

| idx | 名称 | 连接掩码（L B R T） | 坡面 | 说明 |
|---|---|---|---|---|
| 0 | L-R | 1010 | 平 | 直线 |
| 1 | T-B | 0101 | 平 | 直线 |
| 2 | HT-B | 0101 | T 端高 | 直线爬坡，对应 `XTER 0x01` |
| 3 | L-HR | 1010 | R 端高 | 直线爬坡，对应 `XTER 0x02` |
| 4 | T-HB | 0101 | B 端高 | 直线爬坡，对应 `XTER 0x03` |
| 5 | HL-R | 1010 | L 端高 | 直线爬坡，对应 `XTER 0x04` |
| 6 | BR | 0110 | 平 | 转弯 |
| 7 | BL | 1100 | 平 | 转弯 |
| 8 | TL | 1001 | 平 | 转弯 |
| 9 | TR | 0011 | 平 | 转弯 |
| 10 | RTB | 0111 | 平 | 三叉（缺 L） |
| 11 | LBR | 1110 | 平 | 三叉（缺 T） |
| 12 | TLB | 1101 | 平 | 三叉（缺 R） |
| 13 | LTR | 1011 | 平 | 三叉（缺 B） |
| 14 | LTBR | 1111 | 平 | 十字 |

族基址：电线 `0x0E`、道路 `0x1D`、铁路 `0x2C`、地铁（`XUND`）`0x01`、水管（`XUND`）`0x10` **[H]**。

**拼接规则（自动选片）[H，行为观察]**：

- 放置或邻接变化时，片段只由"四邻中哪些是可连接的同族格"决定，玩家无法手动选择朝向。
- 掩码 → idx：掩码为直线 / 转弯 / 三叉 / 十字时查上表；**掩码只有一个方向**（线路末端）时视为沿该轴的直线（T 或 B → idx 1，L 或 R → idx 0）；**掩码为 0**（孤立格）时用 idx 0（L-R）**[M]**——原版没有"断头路"专用片段。
- 坡面格上只允许直线片段，且必须沿坡向（`XTER 0x01..0x04` 分别对应 idx 2..5）；转弯 / 三叉 / 十字 / 一切交叉件只在平地存在（`terrain.md` §2.11.3）。
- "可连接的同族格"包括：同族 15 片段、含该族的交叉件（§2.2 的 0x43–0x50）、隧道口（道路族，仅沿隧道轴）、桥段（仅沿桥轴）、匝道（道路侧连道路，高速侧连高速）、地铁↔铁路转换件（铁路族，仅沿其朝向）。车站是建筑，不参与片段选择，但出行模型把"邻接"当作连通（§2.12）；2×2 车站以占地**任一格**与网络格正交相邻即算邻接（§2.9.1）。
- 电线连接建筑（给建筑供电）但不改变道路片段；电线与道路 / 铁路只能以直角交叉（帮助文本 **[H]**）。

铁路额外的 4 个"半高"件 `0x3B–0x3E`（HT-B / L-HR / T-HB / HL-R 顺序同 idx 2..5）：铁路用两格完成一级爬坡——坡面格放 `0x2E–0x31`，坡脚的平地格改为对应半高件，不允许连续坡面（`terrain.md` §2.11.3 **[M]**）。

### 2.2 本域全部瓦片编码

下表是本域要读写的全部 `XBLD / XUND / XTXT` 值。"出行分类"列给出 §2.12 的瓦片类别名。

| 值 | 层 | 名称 | 占地 | 出行分类 | 备注 |
|---|---|---|---|---|---|
| `0x1D–0x2B` | XBLD | 道路 15 片段 | 1×1 | ROAD | 坡面件 `0x1F–0x22` |
| `0x2C–0x3A` | XBLD | 铁路 15 片段 | 1×1 | RAIL | 坡面件 `0x2E–0x31` |
| `0x3B–0x3E` | XBLD | 铁路半高件 | 1×1 | RAIL | 平地格上承载 |
| `0x3F / 0x40 / 0x41 / 0x42` | XBLD | 隧道口 朝 T / R / B / L | 1×1 | ROAD + PORTAL | 放在两端边坡格；隧道内部格地表照常可用 |
| `0x43 / 0x44` | XBLD | 电线 TB × 道路 LR / 电线 LR × 道路 TB | 1×1 | ROAD | 平地直角交叉 |
| `0x45 / 0x46` | XBLD | 道路 LR × 铁路 TB / 道路 TB × 铁路 LR | 1×1 | ROAD 且 RAIL | 铁路道口 |
| `0x47 / 0x48` | XBLD | 电线 TB × 铁路 LR / 电线 LR × 铁路 TB | 1×1 | RAIL | 不是道路 |
| `0x49 / 0x4A` | XBLD | 高速直线 LR / TB | 1×1 段（4 段组成 2×2 块） | HIGHWAY | 角标 `XZON` 高 4 位全置 **[H]**；落在水块上即"低架高速桥" |
| `0x4B / 0x4C` | XBLD | 高速 LR × 道路 TB / 高速 TB × 道路 LR | 1×1 段 | ROAD 且 HIGHWAY | 道路从高速下穿过，两个网络互不连通 |
| `0x4D / 0x4E` | XBLD | 高速 LR × 铁路 TB / 高速 TB × 铁路 LR | 1×1 段 | RAIL 且 HIGHWAY | |
| `0x4F / 0x50` | XBLD | 高速 LR × 电线 TB / 高速 TB × 电线 LR | 1×1 段 | HIGHWAY | |
| `0x51 / 0x52 / 0x53 / 0x54 / 0x55` | XBLD | 吊桥：起始 B / 中段 B / 中央塔 / 中段 T / 末端 T | 1×1 | BRIDGE | 朝向由 `XBIT.bit6` 翻转 |
| `0x56` | XBLD | 开启桥塔 | 1×1 | BRIDGE | |
| `0x57` | XBLD | 堤道桥墩段 | 1×1 | BRIDGE | |
| `0x58 / 0x59` | XBLD | 开启桥中段（放下 / 升起） | 1×1 | BRIDGE | `0x58` 同时用作堤道的普通桥面 |
| `0x5A / 0x5B` | XBLD | 铁路桥 桥墩段 / 桥面段 | 1×1 | BRIDGE（铁路） | 出行时视为铁路 **[M]** |
| `0x5C` | XBLD | 高架电线（电线跨水） | 1×1 | — | 电力规格 |
| `0x5D / 0x5E / 0x5F / 0x60` | XBLD | 匝道：高速 T × 道路 L / 高速 T × 道路 R / 高速 B × 道路 L / 高速 B × 道路 R | 1×1 | ONRAMP | `XBIT.bit6` 置位时整体旋转 90° |
| `0x61 / 0x62 / 0x63 / 0x64` | XBLD | 高速坡面 HT-B / L-HR / T-HB / HL-R | 2×2 物件 | HIGHWAY | 角标按建筑方式标四角 |
| `0x65 / 0x66 / 0x67 / 0x68` | XBLD | 高速转弯 BR / BL / TL / TR | 2×2 物件 | HIGHWAY | |
| `0x69` | XBLD | 高速立交 LTBR | 2×2 物件 | HIGHWAY | 两条高速相交自动生成；高速没有三叉 |
| `0x6A / 0x6B` | XBLD | 加固高速桥 桥墩段 / 无墩段 | 2×2 物件 | HIGHWAY 且 BRIDGE | 允许通航 |
| `0x6C / 0x6D / 0x6E / 0x6F` | XBLD | 地铁↔铁路转换件 朝 T / R / B / L | 1×1 | RAIL | 地下对应 `XUND 0x23` |
| `0xE9` | XBLD | 地铁站 | 1×1 **[H]** | STATION(Subway) | 地下 `XUND 0x23`；占地依据见 §2.9.1 |
| `0xEC` | XBLD | 公交站 | **2×2 [H]**（`stationFootprint.bus`，可调为 1） | STATION(Bus) | 四格同 ID，`XZON` 角标按 2×2 写（§2.9.1）；无预算项 |
| `0xED` | XBLD | 火车站 | **2×2 [H]**（`stationFootprint.rail`，可调为 1） | STATION(Rail) | 四格同 ID，`XZON` 角标按 2×2 写（§2.9.1） |
| `XUND 0x01–0x0F` | XUND | 地铁 15 片段 | 1×1 | SUBWAY | 与地表坡面无关 |
| `XUND 0x1F / 0x20` | XUND | 水管 TB × 地铁 LR / 水管 LR × 地铁 TB | 1×1 | SUBWAY | |
| `XUND 0x22` | XUND | 导弹井地下部分 | — | SUBWAY（原版怪癖） | 出行模型把它当地铁可通行 **[H]**；实现保留为可选开关 |
| `XUND 0x23` | XUND | 地铁入口 | 1×1 | SUBWAY | 地铁站 / 转换件下方 |
| `XTXT 0xFA` | XTXT | 邻城连接格 | — | — | 自动路牌，不占 50 个用户标牌 |

`MISC` 中与本域相关的字段：`0x0030` 交通总量（**本模块只读**；写者是 `services-models.md` §2.4，口径见 §2.12.6）、`0x0BB4 / 0x0C20 / 0x0C8C / 0x0CF8 / 0x0D64 / 0x0DD0` 六条交通预算（道路 / 高速 / 桥梁 / 铁路 / 地铁 / 隧道，各 27×4B）、`0x0FE8` 地铁格数、`0x1024` 连接格数、`0x01F0..` 各瓦片计数、`0x0754 / 0x0758 / 0x075C` 高速 / 公交 / 地铁发明年份 **[H]**。

### 2.3 瓦片类别谓词

出行模型与预算衰败都以下列集合为准（全部 **[H]**，来自对原版判定范围的阅读）：

| 集合 | 成员 |
|---|---|
| `ROAD_SET`（汽车可行驶） | `0x1D–0x2B`，`0x3F–0x46`（隧道口、电线×道路、道路×铁路），`0x4B`，`0x4C`，`0x5D–0x60`（匝道） |
| `ROAD_SURFACE_SET`（带人行道的普通路面） | `ROAD_SET` 去掉匝道 |
| `RAIL_SET` | `0x2C–0x3E`，`0x45–0x48`，`0x4D`，`0x4E`，`0x6C–0x6F` |
| `HIGHWAY_SET` | `0x49–0x50`，`0x61–0x6B` |
| `BRIDGE_SET`（公路桥） | `0x51–0x5C`，`0x6A`，`0x6B`（注意 `0x5A/0x5B` 铁路桥与 `0x5C` 高架电线落在该连续区间内，原版汽车模式对它们一视同仁——是原版怪癖，见 §4） |
| `PORTAL_SET` | `0x3F–0x42` |
| `STATION_SET` | `0xE9`（1×1），`0xEC`，`0xED`（各 2×2 占地，四格同 ID）。谓词按**格**判断（任一占地格都 ∈ `STATION_SET`）；"是否同一座"另用 `stationOf[t]`（§2.9.1 / §3.2）判断 |
| `SUBWAY_UND_SET`（`XUND`） | `0x01–0x0F`，`0x1F`，`0x20`，`0x22`，`0x23` |
| `TERMINAL_SET`（无条件目的地） | `XBLD > 0xFA`：四种 Arco 与 Llama Dome |

### 2.4 工具、费用与维护费

建造费（建造时一次扣除）与维护费（年率，预算月结按 1/12）**[M，除注明外]**：

| 工具 | 子菜单 | 占地 | 建造费 | 年维护费 | 预算条目 | 发明年份（基准，另加 0–19 年随机）|
|---|---|---|---|---|---|---|
| 道路 Road | Roads | 1×1 / 格 | $10 / 格 | $0.10 / 格 | Roads | 始终可用 |
| 高速 Highway | Roads | 2×2 / 段 | $100 / 段 | $0.80 / 段 | Highways | 1930 **[L]** |
| 隧道 Tunnel | Roads | 1×1 / 格 | $150 / 格 | $0.20 / 格 | Tunnel | 始终可用 |
| 匝道 Onramp | Roads | 1×1 | $25 | 计入 Highways（按 1 格）**[L]** | Highways | 随高速 |
| 公交站 Bus Depot | Roads | **2×2**（§2.9.1） | $250 / 座 | $25 / 座 **[M]** | 无（固定支出）**[H]** | 1920 **[L]** |
| 铁路 Rail | Rail | 1×1 / 格 | $25 / 格 | $0.40 / 格 | Rail | 始终可用 |
| 地铁 Subway | Rail | 1×1 / 格（地下） | $100 / 格 | $0.40 / 格 | Subway | 1910 **[L]** |
| 火车站 Rail Depot | Rail | **2×2**（§2.9.1） | $500 / 座 | $1.50 / 座 **[L]** | Rail | 始终可用 |
| 地铁站 Sub Station | Rail | 1×1 | $250 | $0.80 / 座 | Subway | 随地铁 |
| 地铁↔铁路 Sub↔Rail | Rail | 1×1 | $250 | $0.80 / 座 | Subway | 随地铁 |
| 堤道 Causeway | （桥对话框） | 1×1 / 格 | $25 / 格 | $0.25 / 格 + $0.10 / 端 | Bridges | — |
| 开启桥 Raising | （桥对话框） | 1×1 / 格 | $50 / 格 | $0.25 / 格 + $0.10 / 端 | Bridges | — |
| 吊桥 Suspension | （桥对话框） | 1×1 / 格 | $75 / 格 | $0.25 / 格 + $0.10 / 端 | Bridges | — |
| 铁路桥 | （自动） | 1×1 / 格 | $75 / 格 **[M]** | $0.25 / 格 | Bridges | — |
| 低架高速桥（高速直接跨水） | （桥对话框） | 2×2 / 段 | $100 / 段 **[L]** | $1.80 / 段 + $0.80 / 端 | Bridges | — |
| 加固高速桥 Reinforced | （桥对话框） | 2×2 / 段 | $200 / 段 **[M]** | $1.80 / 段 + $0.80 / 端 | Bridges | — |
| 邻城连接 | （到边缘时的确认框） | — | $1,000 / 条 **[M]** | 无 | — | — |
| 海港分区 Seaport | Ports | 按格 | $150 / 格 **[L]** | 无 | — | 始终可用 |
| 机场分区 Airport | Ports | 按格 | $250 / 格 **[L]** | 无 | — | 1930 **[L]** |

桥梁费用 = **水面格数 × 单价**，对话框按可用桥型逐个显示总价，资金不足时价格红字显示但仍可选择（原版对话框行为 **[H]**）。拆除任何交通瓦片 $1 / 格（推土机）；拆除 2×2 车站走共享的 `destroyStructure`，整座一起拆、费用 `$1 × 4`（`economy-budget.md` Q9 的 `demolishWholeStructure`）。在已有同类瓦片上重复拖动不收费；道路覆盖电线 / 铁路生成交叉件按道路价收费 **[M]**。

### 2.5 坡道规则（摘要，细则见 `terrain.md` §2.11.3）

| 网络 | 允许的坡面 | 片段 | 置信度 |
|---|---|---|---|
| 道路、电线 | 沿轴单级坡（`XTER 0x01..0x04`），可连续多格阶梯式爬坡 | idx 2..5 | H / M |
| 铁路 | 沿轴单级坡，坡脚必须是平地并改为半高件；不允许连续坡面 | `0x2E–0x31` + `0x3B–0x3E` | M |
| 高速 | 2×2 块内两列（或两行）坡面码相同且沿高速轴，整块用 `0x61–0x64`；每两格升一级 | 2×2 物件 | M |
| 匝道、转弯、三叉、十字、所有交叉件、车站（2×2 车站四格全平）、桥头 | 仅平地 | — | H |
| 隧道口 | 必须是沿隧道轴上升的边坡格 | `0x3F–0x42` | H |
| 地铁、水管 | 与地表坡面无关 | — | H |

不合规坡面的处理（原版会改动地形 / 本项目的 `autoTerraformForNetwork`）由 `terrain.md` 定义；本模块只在校验通过后写瓦片并计费。

### 2.6 桥梁

触发：拖动道路 / 铁路 / 高速 / 电线进入水块并在另一侧回到陆地。拖动必须直线；桥面全部在水块上；两端岸格的地形改动与拆桥恢复见 `terrain.md` §2.11.4。

原版桥梁枚举共 7 种（对话框按位掩码决定显示哪些）**[H]**：高架电线、铁路桥、堤道、开启桥、吊桥、低架高速桥、加固高速桥。道路工具显示堤道 / 开启桥 / 吊桥中可用者；高速工具显示低架 / 加固两种；铁路与电线只有一种（可直接确认）。

| 桥型 | 片段序列（沿行进方向，n = 水面格数） | 长度条件 | 通航 | 出行模式 |
|---|---|---|---|---|
| 堤道 | `0x58, 0x57, 0x58, 0x57, …` 桥面 / 墩段交替 | 任意 n ≥ 1 | 否 | ROADBRIDGE |
| 开启桥 | `0x58 ×a, 0x56, 0x59 ×b, 0x56, 0x58 ×a'`；两塔之间为升起段，n = 5 时为 `0x58 0x56 0x59 0x56 0x58` | 5 ≤ n ≤ 12 **[M]** | 是 | ROADBRIDGE |
| 吊桥 | `0x51, 0x52 ×k, 0x53, 0x54 ×k', 0x55`；n = 7 时 k = k' = 2 | n ≥ 7 **[M]** | 是 | ROADBRIDGE |
| 铁路桥 | `0x5B, 0x5A, 0x5B, 0x5A, …` 交替 | 任意 | 是（高架）**[M]** | RAIL |
| 低架高速桥 | 普通 `0x49/0x4A` 段直接落在水块上 | 任意 | 否 | HIGHWAY |
| 加固高速桥 | `0x6A`（墩）与 `0x6B`（无墩）2×2 块交替 | 任意 | 是 | HIGHWAY（出行上也归 BRIDGE_SET） |
| 高架电线 | `0x5C` | 任意 | 是 | — |

对话框长度阈值（`terrain.md` 的口径，本文沿用）：n < 5 只有堤道；5–6 堤道 + 开启桥；7–12 三种皆可；n > 12 堤道 + 吊桥 **[M]**。开启桥 `0x58/0x59` 的"升起 / 放下"在原版是船只经过时的动画状态；存档中两者都可能出现，导入时都视为桥面。

通航约束是海港 / 船只模块的输入：堤道与低架高速桥切断航道；吊桥、开启桥、铁路桥、加固高速桥、高架电线不切断（`terrain.md` §2.9 的水深规则同时适用）。

### 2.7 隧道

- Win95 SE 有独立的 **Tunnel 工具**（Roads 子菜单）**[H]**：点击一处边坡格，隧道沿该坡的上坡方向直线掘进，到第一处"沿同方向下降回到入口海拔"的边坡格出洞。两端写隧道口 `0x3F–0x42`（朝向 = 洞口面向的方向），内部格 `ALTM.tunnelLevels = 地表海拔 − 隧道海拔`，内部格地表不变、可分区可建楼（帮助文本 **[H]**）。
- 费用 `$150 × 总格数`（含两端洞口）**[M]**。
- 只有道路能走隧道；铁路 / 高速不能 **[M]**。隧道必须直线，不得与其他隧道相交（即使高度不同）**[M]**；是否允许地铁在隧道下方穿过见 §5。
- 建议最大长度 64 格（`terrain.md`），原版未知 **[L]**。
- 出行：进入洞口切换为 TUNNEL 模式，每格 3 步，内部格以 `tunnelLevels ≠ 0` 识别，出洞必须踩到 `ROAD_SET` 格；**隧道段不累加交通** **[H]**。
- 预算 < 100% 时"隧道变得不稳定"（帮助文本 **[H]**），具体损毁规则原版未知，本文建议与桥梁同式（§2.15）。

### 2.8 高速公路与匝道

- 高速宽 2 格、高架（下方可穿道路 / 铁路 / 电线）。**2×2 块锚定在偶数坐标**（`x0, y0` 均为偶数）**[H]**（原版预算衰败逻辑只在偶数坐标处理整块，由此推断工具按 2×2 网格吸附）。
- 直线段用 4 个 1×1 段瓦片（`0x49` 或 `0x4A`，角标全置）；坡面、转弯、立交、加固桥是真正的 2×2 物件（四格同 ID，角标 TL/TR/BL/BR 各占其位，加固桥用 `XBIT.bit6` 区分轴向）**[H]**。
- 高速之间只有十字立交 `0x69`（两条高速相交时自动生成），**没有三叉**；两段同轴相接直接延长；转向通过转弯块 `0x65–0x68` **[H]**。
- 高速与道路相交生成 `0x4B/0x4C`（道路穿过，二者不连通），与铁路 `0x4D/0x4E`，与电线 `0x4F/0x50`；每个交叉格仍是高速的 1×1 段。
- **匝道是道路进出高速的唯一途径**（帮助文本 **[H]**）。匝道为 1×1，放在高速直线段的侧边：一侧正交邻格是高速段（决定 `Highway-T/B`，经 `XBIT.bit6` 旋转覆盖 L/R 高速），另一侧正交邻格是道路（决定 `Road-L/R`）。一个路口要双向通行需要 4 个匝道（社区指南 **[M]**），但出行模型本身没有车道方向，一个匝道即可让双向出行通过。
- 出行：道路 → 匝道 2 步并切换 HIGHWAY；高速每格 1 步；高速 → 匝道 1 步并切回 ROAD；**在高速上不检查目的地**，必须经匝道下来 **[H]**。
- 预算 < 100% 时整块 2×2 一起变废墟（水块上的段直接清空）**[H]**。

### 2.9 铁路、车站与地铁

- 铁路片段见 §2.1；与道路交叉 `0x45/0x46`（道口对两个网络都连通），与电线 `0x47/0x48`，与高速 `0x4D/0x4E`。
- **火车站 `0xED`**：**2×2**（§2.9.1）**[H]**；"必须谨慎放置，否则铁路无人使用"（帮助文本 **[H]**）。出行模型要求：乘客从道路 / 步行踏入占地的**任一格**（4 步换乘），在占地内走到与铁路相邻的那一格（0 步，§2.9.1），再踏到占地外沿环内的 `RAIL_SET` 格——所以**占地至少有一格正交紧邻铁路**，并且占地任一格正交紧邻道路、或落在某个分区格的 24 偏移范围内，才有人来。
- **地铁站 `0xE9`**：1×1 地表建筑 + 地下 `XUND 0x23`。地铁线路直接连到该地下格。
- **地铁↔铁路 `0x6C–0x6F`**："必须紧邻已有铁路放置"（帮助文本 **[H]**）：朝向 = 指向相邻铁路格的方向，地下写 `XUND 0x23`。
- **地铁 `XUND 0x01–0x0F`**：拖动方式同铁路，$100 / 格，与水管以直角交叉生成 `0x1F/0x20`；不受地表坡面约束；不能穿过 `0x22` 导弹井以外的其他地下物件（即只能与水管交叉）**[M]**；是否允许在水面下方铺设见 §5。
- 出行：铁路 / 地铁每格 1 步；进出站各 4 步；出站后**回到汽车模式（ROAD，3 步 / 格，计交通）**而不是步行 **[H]**。铁路邻接 Arco（`XBLD > 0xFA`）直接算到达 **[H]**。
- 乘客计数（微模拟）：成功出行若用过公交 / 铁路 / 地铁，相应城市计数器各加该出行的 `popLevel`；`XMIC` 中车站条目显示这些值 **[H]**。
- 装饰性火车（`XTHG 0x0A` 车头 + 2×`0x0B` 车厢）：每次生长扫描经过一个**已供电**的火车站格时，以 1/4 概率尝试生成一列，前提是当前活动列车数 < 火车站计数 ÷ 4 **[H]**；列车进入转换件后改为地铁列车类型 `0x0C/0x0D`。每节车厢占用一个 `XTXT 0xC9–0xF0` 物件槽（共 39 个），列车过多会挤占警消出动槽位（存档文档 **[H]**）。2×2 车站下"每格掷骰"与"火车站计数按格"的口径见 §2.9.1 末段。

### 2.9.1 车站占地（公交站 / 火车站 2×2，地铁站 1×1）

本节回应评审意见，采用与 `building-catalogue.md` §2.7 / §4.1 相同的裁定：

| 车站 | 占地 | 置信度 | 依据 |
|---|---|---|---|
| 公交站 `0xEC` | **2×2** | [H] | 逆向头文件的占地分类函数把公交站列在 2×2 一档（catalogue §2.7 的读法） |
| 火车站 `0xED` | **2×2** | [H] | 同上 |
| 地铁站 `0xE9` | 1×1 | [H] | 同函数的默认 1×1 档 |
| 地铁↔铁路 `0x6C–0x6F` | 1×1 | [H] | 网络件，不是建筑 |

社区记忆普遍是"车站 1×1"，为便于对照，占地边长做成可调参数 `TransportTuning.stationFootprint = { bus: 2, rail: 2, subway: 1, subRail: 1 }`；下文全部规则以 `n = stationFootprint[kind]` 书写，`n = 1` 时自动退化为旧口径，不需要分支代码。

**术语**

- 锚格 `(x0, y0)`：占地中 x、y 都最小的格（T-L 角；T = −y、L = −x，沿用 `terrain.md`）。占地 `fp = { (x0 + i, y0 + j) | 0 ≤ i, j < n }`，格在占地内的序号 `idx = i + n·j`（2×2：T-L 0、T-R 1、B-L 2、B-R 3）。"指针格 → 锚格"的换算归 `ui-art.md` §3.2.4，本模块的 API 只收锚格。
- 外沿环 `ring(fp)`：与 fp 中某格正交相邻、但本身不在 fp 内的格集合（n = 2 时 8 格，n = 1 时 4 格）。2×2 的四格都是外沿格，没有内部格。
- 同一座：`stationOf[t]`（§3.2）给出格 t 所属车站的 id（0 = 不是车站格）；两格 id 相等即同一座。两座车站贴着放时 `XBLD` 相同、id 不同。

**存档编码**（写到占地的每一格）

- `XBLD`：n² 格同写 `0xEC` / `0xED`（多格建筑通例，`file-formats.md` §2.2.4）。
- `XZON` 高 4 位角标按格写：锚格 T-L = `0x40`，`(x0+1, y0)` T-R = `0x80`，`(x0, y0+1)` B-L = `0x10`，`(x0+1, y0+1)` B-R = `0x20`（位值出自存档文档的 `XZON` 定义，`file-formats.md` §2.2.5；"T/L 对应 −y/−x"是本项目轴向约定 **[M]**，必须与 `zones-growth-demand.md` §4 的角标重建用同一张表）。低 4 位分区码清 0：车站不是分区，放在分区地上即去分区 **[M]**。`n = 1` 时四位全置（`0xF0`）。
- `XTXT`：n² 格都写同一个微模拟标签号（`services-models.md` §2.6.1"建筑每个格"）；每座一条独占 `XMIC` 记录，不是每格一条。
- `XBIT`：n² 格置 `POWERABLE`（电水规格）；"车站已供电"按任一格 `POWERED`。
- 地下：地铁站 / 转换件（1×1）在本格写 `XUND 0x23`；2×2 车站没有地下部分。
- 计数口径：`MISC 0x01F0..` 瓦片计数按**格**（一座 2×2 车站 +4，与 catalogue"建筑目标按格数"一致）；预算维护费按**座**（§2.4 的 "$/座"，`stations.filter(kind).length`）；`XMIC` 乘客数按座。

**放置校验**（`placeStation`，伪代码见 §3.4）

1. fp 全在图内；每格 `XTER == 0`（平地）、非水、`XBLD < 0x0E`（树木自动清除、瓦砾允许）——与 `services-models.md` §2.6 的建筑放置通用规则相同。
2. 邻接要求（`TransportTuning.requireStationAdjacency = true` 时生效 **[M]**）：公交站 `ring(fp) ∩ ROAD_SET ≠ ∅`；火车站 `ring(fp) ∩ RAIL_SET ≠ ∅`；地铁站无要求；转换件要求 `ring` 中恰有一条铁路末端 / 直线。原版是否硬性校验未知（帮助文本只说"必须谨慎放置"），关掉开关时允许放置，但该车站会无人使用。
3. 费用按座一次扣除；拆除走共享 `destroyStructure`（整座一起拆）。

**可达与出行的改动点**（细则在 §2.11 / §2.12）

- 24 偏移可达：偏移格落在车站**任一占地格**即命中。一座 1×1 车站的"可达影响区"是 24 格；2×2 车站是四格各自 24 偏移的并集，去掉占地后共 **36 格**——这是 2×2 与 1×1 的第一处可见差异，测试应覆盖。
- 出行起点落在车站格：初始模式按车站种类（BUS / RAIL_ENTER / SUBWAY_ENTER），并把该格记入"本次到访已踏格"掩码 `visited`（§3.6 的 `Frame.visited`）。
- **进站**：从非本座的格踏入占地任一格，扣 `stepTransfer = 4`。
- **占地内部移动**：从本座的格踏到本座**尚未踏过**的格，扣 `TrafficTuning.stationInteriorStep`（默认 **0** **[L]**），不累加交通（这些节点的模式是 BUS / RAIL_ENTER / EXIT，本来就不属于汽车模式）；已踏过的格不可再入——这是防止 0 步绕圈撑爆 512 栈的必要条件。一次到访最多踏 n² 格、最多 n² − 1 次内部移动；离开占地后掩码清零，下次再进算新的到访（再扣 4 步）。内部移动的剩余方向掩码按普通规则（四向去掉来路）。
- **出站**：从占地任一格踏到 `ring` 内的网络格：BUS → `ROAD_SET` 2 步转 WALK；EXIT → `ROAD_SET` 3 步转 ROAD；RAIL_ENTER → `RAIL_SET` 1 步转 RAIL。所以"车站紧邻铁路"只需占地任一格与铁路正交相邻，乘客会在站内走到那格再上车。
- `stationInteriorStep` 的取舍：逆向重实现的转移表对"车站格 → 车站格"一律扣 4 步、不区分是否同一座（§2.12.4 旧行 `RAIL_ENTER | 火车站 | 4`）。若原版确是 2×2，站内踏两格就要 8 步，站内走到对角格要 12 步。本文按评审建议默认 0，并把 `stationInteriorStep = 4` 作为"字面复刻"对照预设列入 §5 Q17；两种取值都要保留 `visited` 掩码。

**装饰列车**（§2.9 末条的 2×2 口径）：生长扫描按格访问，一座 2×2 火车站每轮被访问 4 次；按原版读法每次访问都掷 1/4 骰（`TransportTuning.trainRollEveryTile = true` **[M]**），`false` 时只在锚格掷。上限 "活动列车数 < 火车站计数 ÷ 4" 中的"火车站计数"按原版读法是瓦片计数 `tileCounts[0xED]`——2×2 时恰好等于"每座火车站一列" **[M，推断；但与 2×2 裁定自洽，可作为旁证]**；`n = 1` 时退化为"每四座一列"。

### 2.10 公交站

- `0xEC`，**2×2**（§2.9.1）**[H]**，$250 / 座，无预算滑块（存档里也没有其资金条目 **[H]**）。
- 建议放置约束：占地外沿环 `ring(fp)` 含 `ROAD_SET` 格（否则出行模型根本无法从它走出去）**[M]**，由 `requireStationAdjacency` 控制；是否要求供电 / 供水见 §5——原版出行判定不检查公交站供电 **[H]**。
- 效果：出行踏入公交站后进入 BUS 模式，随后在道路上以 **2 步 / 格** 行进，并且**这段路程不累加交通**（§2.12）。帮助文本称"放置得当时最多一半通勤者会使用"——这是对该机制的定性描述，不是单独的参数 **[H]**。
- 社区指南称公交站是唯一能"降低污染"的道路工具：这是"少开车 = 少交通污染"的间接结果，不要单独实现 **[M]**。

### 2.11 "道路可达"判定（分区生长的前置条件）

原版对一个分区格 `(x, y)` 按固定顺序检查 24 个偏移，**第一个**命中即停止 **[H]**：

```
顺序 1–4 : ( 0,+1) (+1, 0) ( 0,-1) (-1, 0)      // 四邻
顺序 5–8 : ( 0,+2) (+2, 0) ( 0,-2) (-2, 0)      // 轴向 2 格
顺序 9–12: ( 0,+3) (+3, 0) ( 0,-3) (-3, 0)      // 轴向 3 格
顺序13–16: (+1,+1) (-1,+1) (+1,-1) (-1,-1)      // 四个斜角
顺序17–20: (+2,+1) (-2,+1) (+2,-1) (-2,-1)
顺序21–24: (+1,+2) (-1,+2) (+1,-2) (-1,-2)
```

命中条件：偏移格 ∈ `ROAD_SET`，或 ∈ `STATION_SET`（即落在任一车站占地的**任一格**上，2×2 车站四格都算，§2.9.1）。越界偏移跳过。

含义与后果：

- 该模式覆盖的格数是 24，**不是** Chebyshev 半径 3 的 48 格：(±2,±2)、(±3,±1)、(±1,±3) 等都不算可达。经典"两条平行道路之间留 6 格"布局仍然全部可达（最远格距路 3 格且在轴向上）。
- 空分区格（尚无建筑）必须可达才会被生长扫描考虑；已有建筑的格每次扫描直接跑出行生成器，其第一步就是同一张表的搜索，找不到起点 ⇒ 出行失败 ⇒ 不生长（并按 `zones-growth-demand.md` 的宽限期衰退）**[H]**。
- `zones-growth-demand.md` §2.3 当前写的是"Chebyshev ≤ 3"：**以本节为准**，分区模块应调用 `TransportQuery.hasAccess(i)`，`roadDistance` 仅用于查询面板显示。
- 纯铁路 / 高速 / 地铁格不提供可达，车站提供 **[H]**；因此"沿铁路发展的工业区"只有在铁路旁放了火车站时才会长。2×2 车站的四格各自是一个命中点，一座车站的可达影响区是 36 格（§2.9.1）。

### 2.12 交通模型（出行生成器）

#### 2.12.1 调用时机与参数

- 生长扫描把地图按 4×4 子步遍历，每个分区格（R / C / I 六种分区码）在每轮扫描中被访问 1 次；若该格是建筑锚格（或可达的空分区格）且**已供电**，就运行 **1 次**出行 **[H]**。未供电不跑出行，视为失败。
- 参数：起点 `(x, y)`、分区码 `z ∈ 1..6`、建筑密度等级 `popLevel ∈ 0..4`（0 = 空地，1 = 1×1 低档，2 / 3 / 4 递增；按建筑表查，见分区规格）、步数预算 `maxSteps = 100`；**当 `popLevel == 1` 时预算减四分之一为 75** **[H]**。
- 返回成功 / 失败。分区模块用法 **[H]**：成功 ⇒ 本格可用需求 = `cityDemand[zoneClass] + 2000`，剩余需求 = `4000 − 可用需求`；失败 ⇒ 可用需求 0、剩余需求 4000（只会衰退不会生长）。

#### 2.12.2 目的地

- 目的地判定看**下一格的分区码**：`(1 << XZON.zone) & destMask[z]` 非零即到达。原版的 `destMask` 表（按起点分区码索引的 16 位掩码）具体取值未能读出 **[L]**，本文建议：

| 起点分区 | 目的地分区码集合（建议默认） | 备注 |
|---|---|---|
| R-light (1) / R-dense (2) | {3, 4, 5, 6, 8, 9} = `0x0378` | 去商业 / 工业上班、购物；机场 / 海港也算就业地 |
| C-light (3) / C-dense (4) | {1, 2, 5, 6} = `0x0066` | 商业需要顾客（R）与货源（I） |
| I-light (5) / I-dense (6) | {1, 2, 3, 4, 9} = `0x021E` | 工业需要劳动力（R）、销路（C）与海港 |

- 无条件目的地 **[H]**：下一格 `XBLD > 0xFA`（Arco、Llama Dome）；在 RAIL 模式下铁路紧邻 Arco 同样成立。
- 出界 **[H]**：下一步越出地图且**当前格** `XTXT == 0xFA`（邻城连接格）⇒ 到达（"去邻城上班"）。这是邻城连接吸收通勤的机制。
- 在 HIGHWAY / TUNNEL / ROADBRIDGE / RAIL_ENTER / SUBWAY_ENTER / RAIL / SUBWAY 模式下**不检查**分区目的地 **[H]**。

#### 2.12.3 搜索过程

带回溯的随机深度优先搜索 **[H]**：

1. 起点：按 §2.11 的 24 偏移找第一个可用起点格，并据其类型设初始模式：`ROAD_SET` → ROAD；公交站格 → BUS；火车站格 → RAIL_ENTER；地铁站格 → SUBWAY_ENTER。起点是车站格时，起始帧的 `visited = 1 << idx(起点)`（§2.9.1）。找不到 ⇒ 失败。
2. 每次出行开始时随机决定旋转方向（顺时针或逆时针，各 1/2）。每到一个节点：随机选起始方向 `d0 = rand & 3`，之后每次尝试按旋转方向转 90°；**每个节点最多尝试 4 次**；已尝试过的方向从该节点的"剩余方向掩码"中清除；掩码里没有的方向直接跳过（计 1 次尝试）。
3. 对候选下一格按 §2.12.4 的表判定：若"到达"则成功结束；若"可走"则扣步数、切换模式、把下一格压栈，并为下一节点设置剩余方向掩码：普通模式（含车站占地内部移动）= 四向去掉来路（禁止掉头）；ROADBRIDGE 与步行过桥模式 = **只允许直行**（桥上不能拐弯）；SUBWAY_ENTER（刚进地下）= 四向全开。压栈时同时更新 `visited`：下一格不是车站格 ⇒ 0；是另一座车站 ⇒ `1 << idx(next)`；是本座 ⇒ `cur.visited | 1 << idx(next)`。
4. 若 4 次尝试都失败：弹栈回退到上一节点，**恢复该节点当时的步数与剩余掩码**（回退不额外扣步数），继续尝试其剩余方向；若一路回退到栈空 ⇒ 失败。
5. 外层循环条件：`steps < maxSteps`；超出预算 ⇒ 失败。
6. 栈容量 512 节点（原版常量 **[H]**），超出按失败处理。

#### 2.12.4 模式转移表

"类别"按 §2.3 集合判断；检查顺序自上而下，先命中者生效。"步"为扣除的步数。

| 当前模式 | 下一格 | 步 | 新模式 / 结果 |
|---|---|---|---|
| ROAD | 分区 ∈ destMask | 0 | **到达** |
| ROAD | ∈ PORTAL_SET | 3 | TUNNEL |
| ROAD | ∈ BRIDGE_SET | 3 | ROADBRIDGE |
| ROAD | 匝道 `0x5D–0x60` | 2 | HIGHWAY |
| ROAD | ∈ ROAD_SURFACE_SET | 3 | ROAD |
| ROAD | 车站占地格（公交 / 火车 / 地铁站） | 4 | BUS / RAIL_ENTER / SUBWAY_ENTER |
| ROAD | ∈ TERMINAL_SET | 0 | **到达** |
| ROAD | 其他 | — | 不可走 |
| HIGHWAY | ∈ HIGHWAY_SET | 1 | HIGHWAY |
| HIGHWAY | 匝道 | 1 | ROAD |
| HIGHWAY | 其他 | — | 不可走 |
| TUNNEL | `tunnelLevels ≠ 0` | 3 | TUNNEL |
| TUNNEL | ∈ ROAD_SET | 3 | ROAD |
| TUNNEL | 其他 | — | 不可走 |
| ROADBRIDGE | ∈ BRIDGE_SET | 3 | ROADBRIDGE（只许直行） |
| ROADBRIDGE | ∈ ROAD_SET | 3 | ROAD |
| ROADBRIDGE | 其他 | — | 不可走 |
| WALK（公交下车后） | 分区 ∈ destMask | 0 | **到达** |
| WALK | ∈ PORTAL_SET | 2 | WALK_TUNNEL |
| WALK | ∈ BRIDGE_SET 或交叉件 `0x43–0x50` | 2 | WALK_BRIDGE（只许直行） |
| WALK | 匝道 | 2 | WALK_HIGHWAY |
| WALK | ∈ ROAD_SURFACE_SET | 2 | WALK |
| WALK | 车站占地格（公交 / 火车 / 地铁站） | 4 | BUS / RAIL_ENTER / SUBWAY_ENTER |
| WALK | ∈ TERMINAL_SET | 0 | **到达** |
| WALK_HIGHWAY | ∈ HIGHWAY_SET | 1 | WALK_HIGHWAY |
| WALK_HIGHWAY | 匝道 | 1 | WALK |
| WALK_TUNNEL | `tunnelLevels ≠ 0` | 2 | WALK_TUNNEL |
| WALK_TUNNEL | ∈ ROAD_SET | 2 | WALK |
| WALK_BRIDGE | ∈ BRIDGE_SET | 2 | WALK_BRIDGE |
| WALK_BRIDGE | ∈ ROAD_SET | 2 | WALK |
| BUS | 分区 ∈ destMask | 0 | **到达** |
| BUS | 本座未踏过的占地格 | `stationInteriorStep`（0） | BUS |
| BUS | 另一座公交站的占地格 | 4 | BUS |
| BUS | ∈ ROAD_SET（占地外） | 2 | WALK |
| EXIT（刚出站） | 分区 ∈ destMask | 0 | **到达** |
| EXIT | 本座未踏过的占地格 | `stationInteriorStep`（0） | EXIT |
| EXIT | 另一座公交站 / 火车站的占地格 | 4 | EXIT |
| EXIT | ∈ ROAD_SET（占地外） | 3 | ROAD |
| RAIL_ENTER | 本座未踏过的占地格 | `stationInteriorStep`（0） | RAIL_ENTER |
| RAIL_ENTER | 另一座火车站的占地格 | 4 | RAIL_ENTER |
| RAIL_ENTER | ∈ RAIL_SET（占地外） | 1 | RAIL |
| SUBWAY_ENTER | `XUND` ∈ SUBWAY_UND_SET | 1 | SUBWAY（下一节点四向全开） |
| RAIL | 火车站占地格（任一格） | 4 | EXIT |
| RAIL | ∈ RAIL_SET | 1 | RAIL |
| RAIL | ∈ TERMINAL_SET | 0 | **到达** |
| SUBWAY | 地表为地铁站 `0xE9`（1×1） | 4 | EXIT |
| SUBWAY | `XUND` ∈ SUBWAY_UND_SET | 1 | SUBWAY |
| 任意 | 越界且当前格 `XTXT == 0xFA` | 0 | **到达** |

表中未列出的组合一律"不可走"。车站相关的三个谓词（§2.9.1）：**本座** = `stationOf[next] == stationOf[cur] != 0`；**未踏过** = `(cur.visited >> idx(next)) & 1 == 0`（本座已踏过的格 ⇒ 不可走）；**另一座** = `stationOf[next] != 0 && stationOf[next] != stationOf[cur]`。ROAD / WALK 模式下当前格不会是车站格，所以其"车站占地格"行天然都是"另一座"。`n = 1` 时"本座未踏过"的行永不命中，整张表退化为旧口径。WALK 系模式在原版实现里对交叉件 / 高速段的归类较粗（步行者踩到 `0x43–0x50` 任一格都按"过桥直行"处理）**[H，但原版实现者自己标注存疑]**；本文把它写成上表并允许用 `TrafficTuning.walkCrossoverAsBridge = true` 复刻、`false` 时按 ROAD 的细分规则处理。

**地铁↔铁路转换件**：按上表，RAIL 模式只看地表（转换件 ∈ RAIL_SET，下一格若是纯地铁则地表为空 ⇒ 不可走），SUBWAY 模式只看地下（转换件下方 `0x23` 可走，下一格若是纯铁路则 `XUND = 0` ⇒ 不可走）。即**按逆向重实现的读法，乘客无法经转换件在铁路与地铁之间换乘，只有装饰列车能穿过** **[M]**。考虑到手册明确说转换件"用于连接地上铁路与地下地铁"，本文建议参数 `allowSubRailTransfer` 默认 `true`：RAIL 踏上转换件后，下一步允许进入其朝向上的地铁格并切换 SUBWAY（1 步）；反向同理。列入 §5 待确认。

#### 2.12.5 距离上限换算

| 行进方式 | 每格步数 | 100 步可达格数 | 75 步（1×1 低档起点）可达格数 |
|---|---|---|---|
| 道路 / 公路桥 / 隧道 | 3 | 33 | 25 |
| 公交下车后步行 | 2 | 50 | 37 |
| 高速 / 铁路 / 地铁 | 1 | 100 | 75 |
| 换乘（踏入车站 / 公交站占地） | 4 / 次 | — | — |
| 车站占地内部移动（2×2，§2.9.1） | `stationInteriorStep` = 0（对照预设 4） | — | — |
| 上匝道 / 下匝道 | 2 / 1 | — | — |

1994 年杂志攻略流传的"市民走 10 格，铁路 / 高速翻倍"是经验之谈，与上表不符，不要采用 **[M]**。

#### 2.12.6 交通密度 `XTRF`：累加（本模块）、衰减与总量（services）

- `XTRF` 为 64×64，每元素覆盖 2×2 地块（`h = (x >> 1) + 64 · (y >> 1)`，主次序与 `XBLD` 一致，见 `services-models.md` §4），取值 0–255 **[H]**。这就是交通图以 2×2 块显示的原因。
- **累加（本模块唯一的写入途径）**：出行**成功**且 `popLevel > 0` 时，沿最终路径（栈中节点，从终点往回）逐格处理：节点进入时的模式 ∈ {ROAD, HIGHWAY, ROADBRIDGE} ⇒ 调 `services.addTraffic(tile, popLevel)`，即 `XTRF[h] = min(255, XTRF[h] + popLevel)` **[H]**。TUNNEL、所有 WALK 系、BUS、EXIT、RAIL_ENTER、RAIL、SUBWAY 节点（含车站占地内部移动）不累加。
- 失败出行不写任何交通 **[H]**。
- **写权裁定（评审意见 2）**：`XTRF` 的月度衰减、`MISC 0x0030` 交通总量、图表 / 报纸 / 抱怨用的 `trafficGraph`，**唯一 owner 是 `services-models.md`**（§1 的写权表、§2.4、§3.3 的 `decayTraffic()` / `trafficGraph()`）。本模块**不再**在月末写 `MISC 0x0030`；旧稿"含道路的 64×64 块的 `XTRF` 平均值 × `trafficCountScale`"口径与 `trafficDecayShift` / `trafficCountScale` 两个参数**废弃**。本模块只提供两样东西：每条成功出行的 `addTraffic` 调用，以及 `trafficGraph` 分母所需的 `roadTileCounts()`（§3.7）。
- 采用的公式（与 services 一致；置信度 **[L]**——存档文档只说明 `0x0030`"不是 Σ XTRF"，图表帮助文本称其为"所有道路、高速、桥梁上每分钟平均车辆数" **[H]**。三种候选里 services 的口径最简单、能同时满足情景 `trafficMax` 与图表；"衰减后求和"也解释了为什么它看起来"不是 Σ XTRF"——统计时点不同）：

```
第 19 天（services.decayTraffic，本模块不参与）：
  for h in 0..4095: XTRF[h] -= XTRF[h] >> 2                       // −25%，整数截断
  trafficCount = Σ XTRF[h]（衰减后）                               // → MISC 0x0030、图表 Traffic 序列（原值）
图表 / 报纸 / 抱怨 / 顾问使用的归一值（services.trafficGraph）：
  trafficGraph = trafficCount / (1 + roadTiles + highwayTiles + bridgeTiles)   // 整数截断
  roadTiles    = |{ t : XBLD[t] ∈ ROAD_SET ∖ HIGHWAY_SET }|        // 含道口、电线交叉、隧道口、匝道
  highwayTiles = |{ t : XBLD[t] ∈ HIGHWAY_SET }|                     // 按格，不按 2×2 段
  bridgeTiles  = |{ t : XBLD[t] ∈ BRIDGE_SET }|
  // 三个计数由本模块 roadTileCounts() 增量维护（放置 / 拆除 / 衰败），读档全量重算
```

- 量纲说明（给调阈值的人）：`trafficCount` 对 4096 个半格求和，分母却是**瓦片**数；一条孤立直路每 2 格共用 1 个半格，所以 `trafficGraph` 大致等于"道路所在半格的平均 `XTRF` × (路网半格数 / 路网格数)"，密路网时接近平均值，稀疏单线时约为平均值的一半。全城道路半格都饱和（255）时 `trafficGraph` 的量级是 120–250，正常运行的城市在 10–60。`trafficCount` 随城市规模线性增长，**不能**直接当阈值——这是旧稿 120 / 160 阈值被废弃的原因。

#### 2.12.7 交通对其他系统的影响（口径以各 owner 规格为准）

本模块对下游只提供 `trafficAt(x, y)`（只读 `XTRF`）与 `roadTileCounts()`。下表汇总各 owner 规格已定的公式，便于交叉核对；本文不再给出自己的系数（旧稿的 `XTRF >> 2` 污染项、`−min(XTRF >> 3, 16)` 地价项与 `hightraffic 120 / 160` 阈值**全部废弃**）：

| 影响 | 公式（owner 规格原文口径） | owner |
|---|---|---|
| 污染 `XPLT` | 污染源项 `+ oldXTRF[h] / 5`（整数截断，上月衰减后的值） | `services-models.md` §2.3 / §2.4 |
| 地价 `XVAL` | 不直接含交通，只经污染间接压低 | `services-models.md` §2.3 |
| 分区发展意愿 | 原版口径模型不用交通；可选 `growthModel: 'score'` 里才有 `−0.10 × traffic/255` | `zones-growth-demand.md` §2.5.8 |
| 报纸 `hightraffic`（`0x11`） | 每月第 24 天月检：`rng(0..127) < trafficGraph` | `disasters-events.md` 故事表 #17 |
| 报纸 `lowtraffic` | `trafficGraph < rng(0..15)` | `disasters-events.md` 故事表 #62 |
| 抱怨 `traffic`（复杂 Token `0x5C`） | 支持率抽样的 7 类抱怨权重之一：`w[0] = trafficGraph` | `services-models.md` §2.10.3 |
| 顾问 Transit | `trafficGraph > 60 && funds < 10,000` ⇒ "发债扩交通" | `disasters-events.md` 顾问表 |
| 情景 Traffic Limit（`SCEN 0x2A`） | `trafficCount ≤ max.traffic`（`MISC 0x0030`，第 19 天衰减后的和） | `economy-budget.md` §2.16 |
| 直升机交通播报 | 目标 = `XTRF[h] ≥ trafficReportThreshold (96)` 的半格 | `disasters-events.md` 物件 |
| 法令 Parking Fines | 无交通效果（存档文档注明"可能并不影响交通"），只加 0.5% 住宅税收 | `economy-budget.md` |
| 显示（本模块） | 道路 / 高速 / 堤道段按所在半格的 `XTRF` 选叠加精灵：`≥ lightLevel`（默认 48）画轻交通，`≥ heavyLevel`（默认 160）画重交通 **[L]** | 本文 Q5；原版有轻 / 重两级叠加精灵，阈值表未读出 |

重新标定说明：`hightraffic` 与 `traffic` 抱怨都以 `trafficGraph`（0 起、按瓦片归一）为自变量，与 disasters 的 `rng(0..127) < trafficGraph` 处于同一量纲——`trafficGraph = 64` 时每月约 50% 概率出 `hightraffic` 故事；`trafficGraph ≥ 128` 时必出。若将来原版 `0x0030` 的真实公式被确认，只需改 services 的 `trafficGraph()`，本表各阈值不必再动。

### 2.13 邻城连接

- 定义 **[H/M]**：道路（直线片段，轴向垂直于地图边）、铁路（同）、高速（直线段）位于边缘格（`x == 0 || x == 127 || y == 0 || y == 127`）即构成一条连接；高速两格宽算一条；并排的多条道路各算一条。电线、地铁、水管到边缘不构成连接。
- 建立 **[M]**：首次把网络铺到边缘格时弹出确认框，花费 $1,000 建立连接；拒绝则该格保持普通瓦片不计连接。连接格写 `XTXT = 0xFA`，并自动生成"通往 ＜邻城名＞"路牌（文本不占 50 个用户标牌；最后一条连接的文字存 `XLAB 0xFA`）**[H]**。
- 计数 **[H]**：`MISC 0x1024` = 连接格总数；内部另有"商业连接数"（道路）与"工业连接数"（铁路 + 高速）两个计数器，供需求上限使用（`zones-growth-demand.md` §2.8：C 上限 +2,000 / 道路连接，I 上限 +10,000 / 铁路或高速连接）。
- 四个邻城与四条边的对应（默认旋转下）：`y == 0` 边 → 右上邻城，`x == 0` 边 → 左上，`y == 127` 边 → 左下，`x == 127` 边 → 右下 **[M]**；`MISC 0x06D8..` 的存储顺序见 §5。
- 出行 **[H]**：从连接格走出地图即到达，因此边缘连接相当于容量无限的就业 / 消费地。
- 存档怪癖 **[H]**：原版读档后铁路 / 高速连接失效（只有道路连接被正确恢复），社区补丁已修。本项目**读档时统一按 `XTXT 0xFA` + 瓦片类型重算**全部连接。

### 2.14 海港与机场的交通意义

- 两者都是分区（`XZON 9 / 8`），按分区生长规则长出码头 / 起重机 / 跑道 / 停机坪等瓦片（港口规格）。本域相关事实：
  - 海港起重机数每个使工业需求上限 +10,000；铁路 / 高速连接各 +10,000；道路连接使商业上限 +2,000；机场按跑道十字格或分区格数提高商业上限（存档文档 **[H]**；二选一口径见分区规格）。
  - 帮助文本：海港在约 10,000 人前不需要，机场在约 15,000 人前不需要 **[H]**；存档文档则按商业 / 工业人口每 10,000 产生一次诉求 **[H]**——两者不矛盾（一个是何时值得建，一个是何时市民开口要）。
  - 起重机要求前方 5 格直线无物件水域且末端水深 ≥ 2（`terrain.md` §2.9）；货船（`XTHG 0x03`）从起重机出发沿可通航水面巡游，被堤道 / 低架高速桥阻断的水域不会有船 **[M]**；机场跑道存在时才会有飞机（`XTHG 0x01`）与空难灾害 **[H]**。
  - 本文建议把机场 / 海港分区码纳入出行目的地掩码（§2.12.2），使它们成为就业地 **[L]**。

### 2.15 预算：交通维护与衰败

- 预算面板"Transportation"有六个滑块：Roads / Highways / Bridges / Rail / Subway / Tunnel（存档各 27×4B：当前数量、资金率、12 个月历史）**[H]**。年支出 = Σ（数量 × 单价 × 资金率）；单价见 §2.4；公交站固定支出无滑块。
- 资金率 < 100% 时，生长扫描每访问一个相应瓦片就掷一次骰子 **[H]**：

| 条目 | 计数口径 | 损毁判定（每次扫描访问） | 结果 |
|---|---|---|---|
| Roads | `ROAD_SET` 中非高速、非桥、非匝道的格（含道口、电线交叉、隧道口） | `rand(0..99) >= funding` | 该格变废墟，清除 `powerable` 位 |
| Rail | `RAIL_SET` 中非高速交叉的格（含道口、转换件） | 同上 | 同上 |
| Highways | 高速 2×2 块（在偶数锚点判定一次） | 同上 | 整块 4 格变废墟；水块上的段清空 |
| Bridges | `BRIDGE_SET` 各格 | `wind + rand(0..49) >= funding`（`wind` 为当前风速 0–255） | 拆除该桥格（连锁拆整桥由拆除逻辑处理）、镜头居中、报纸"桥梁坍塌" |
| Subway | `XUND` 地铁格 | 建议同 Roads **[M]** | 该格 `XUND` 清零（"地铁段塌陷"） |
| Tunnel | 隧道口 + 内部格 | 建议同 Bridges 但不含风速项 **[L]** | 两端洞口变废墟、内部 `tunnelLevels` 清零 |

社区指南称"削减交通预算不影响地铁"，与帮助文本"地铁段会塌陷"矛盾；本文按帮助文本实现并提供 `subwayDecays` 开关（默认 `true`）。

---

## 3. 数据结构与算法建议

### 3.1 常量与枚举

```ts
// packages/sc2k/src/sim/transport/model.ts
export const MAP = 128;
export const enum Dir { T = 0, R = 1, B = 2, L = 3 }
export const DX = [0, 1, 0, -1] as const;
export const DY = [-1, 0, 1, 0] as const;
export const opposite = (d: Dir): Dir => ((d + 2) & 3) as Dir;
export const dirBit = (d: Dir): number => 1 << d;            // T=1 R=2 B=4 L=8

/** 15 片段：idx -> 连接掩码（§2.1） */
export const PIECE_MASK: readonly number[] = [
  0b1010, 0b0101, 0b0101, 0b1010, 0b0101, 0b1010,          // 0-5 直线（含 4 个坡面件）
  0b0110, 0b1100, 0b1001, 0b0011,                          // 6-9 转弯 BR BL TL TR
  0b0111, 0b1110, 0b1101, 0b1011, 0b1111,                  // 10-14 三叉 + 十字
];
/** 坡面件：XTER 0x01..0x04 -> idx 2..5 */
export const SLOPE_PIECE: Readonly<Record<number, number>> = { 0x01: 2, 0x02: 3, 0x03: 4, 0x04: 5 };
export const BASE = { power: 0x0E, road: 0x1D, rail: 0x2C, subway: 0x01, pipe: 0x10 } as const;

export const enum NetFlag {
  Road = 1 << 0, Rail = 1 << 1, Highway = 1 << 2, Power = 1 << 3,
  Bridge = 1 << 4, Portal = 1 << 5, Onramp = 1 << 6, Station = 1 << 7,
}
export const enum StationKind { None = 0, Bus = 1, Rail = 2, Subway = 3, SubRail = 4 }
/** 车站占地边长（§2.9.1）：公交站 / 火车站 2×2 [H]，地铁站 / 转换件 1×1；可调为 1 以对照社区"1×1 车站"记忆 */
export const STATION_FOOTPRINT: Readonly<Record<Exclude<StationKind, StationKind.None>, 1 | 2>> =
  { [StationKind.Bus]: 2, [StationKind.Rail]: 2, [StationKind.Subway]: 1, [StationKind.SubRail]: 1 };
/** XZON 高 4 位角标（file-formats §2.2.5）：T-R=0x80, T-L=0x40, B-R=0x20, B-L=0x10；1×1 四位全置 0xF0 */
export const CORNER_BITS_2x2 = [0x40, 0x80, 0x10, 0x20] as const;   // 按 idx = i + 2j：T-L, T-R, B-L, B-R
export const cornerBits = (n: 1 | 2, idx: number): number => (n === 1 ? 0xF0 : CORNER_BITS_2x2[idx]);
export const enum HwyKind {
  StraightLR, StraightTB, SlopeHTB, SlopeLHR, SlopeTHB, SlopeHLR,
  CurveBR, CurveBL, CurveTL, CurveTR, Interchange, ReinforcedBridge,
}
export const enum BridgeKind { Causeway, Raising, Suspension, Rail, HighwayLow, HighwayReinforced, Wire }
```

### 3.2 图层与索引

```ts
export interface TransportLayers {
  /** NetFlag 位集，由 XBLD/XUND 派生；导入时全量重建，之后增量维护 */
  net: Uint8Array;               // 16384
  /** 低 4 位：道路连接掩码；高 4 位：铁路连接掩码（T R B L） */
  conn: Uint8Array;              // 16384
  /** 低 4 位：地铁连接掩码；bit7：该格下方有地铁入口(XUND 0x23) */
  subway: Uint8Array;            // 16384
  /** 车站种类（StationKind），0 = 无；2×2 车站的四格都写 */
  station: Uint8Array;           // 16384
  /** 车站归属：tile -> stationId + 1（0 = 不是车站格）；出行模型用它判断"同一座"（§2.9.1） */
  stationOf: Uint16Array;        // 16384
  stations: Station[];
  /** 2x2 高速块：tile -> blockId + 1（0 = 不属于任何块） */
  hwyBlockOf: Uint16Array;       // 16384
  hwyBlocks: HighwayBlock[];
  /** 桥：tile -> bridgeId + 1 */
  bridgeOf: Uint16Array;         // 16384
  bridges: Bridge[];
  /** 隧道：portal 对 */
  tunnels: Tunnel[];
  /** XTRF 64x64：services 持有的缓冲区的只读引用（§2.12.6）。本模块不复制、不直接写；累加经 services.addTraffic */
  traffic: Readonly<Uint8Array>; // 4096
  /** trafficGraph 分母用的三个格计数（§2.12.6 / §3.7），增量维护 */
  roadTileCounts: { roadTiles: number; highwayTiles: number; bridgeTiles: number };
  /** 邻城连接 */
  connections: Connection[];
}
/** 一座车站：锚格 = 占地最小坐标角，n = 占地边长（§2.9.1） */
export interface Station { id: number; kind: StationKind; x0: number; y0: number; n: 1 | 2; microsimSlot: number }
export const fpIndex = (s: Station, x: number, y: number): number => (x - s.x0) + s.n * (y - s.y0);   // 0..n²-1
export interface HighwayBlock { x0: number; y0: number; kind: HwyKind; flip: boolean; onWater: boolean }
export interface Bridge { kind: BridgeKind; x: number; y: number; dir: Dir; length: number }
export interface Tunnel { x: number; y: number; dir: Dir; length: number }
export interface Connection { edge: 0 | 1 | 2 | 3; kind: 'road' | 'rail' | 'highway'; x: number; y: number; tiles: number }

export interface TransportTuning {
  cost: { road: 10; rail: 25; highwaySegment: 100; onramp: 25; tunnelTile: 150; busDepot: 250;
          railDepot: 500; subwayTile: 100; subwayStation: 250; subRail: 250;
          bridge: Record<BridgeKind, number>;  // {Causeway:25, Raising:50, Suspension:75, Rail:75, HighwayLow:100, HighwayReinforced:200, Wire:?}
          neighborConnection: 1000; seaportTile: 150; airportTile: 250 };
  upkeepPerYear: { road: 0.10; rail: 0.40; highwaySegment: 0.80; tunnelTile: 0.20; busDepot: 25;
                   railDepot: 1.50; subwayTile: 0.40; subwayStation: 0.80; subRail: 0.80;
                   bridgeTile: 0.25; bridgeEnd: 0.10; highwayBridgeSegment: 1.80; highwayBridgeEnd: 0.80 };
  raisingBridgeLen: { min: 5; max: 12 }; suspensionMinLen: 7; tunnelMaxLen: 64;
  subwayDecays: true; tunnelDecayUsesWind: false;
  /** §2.9.1：车站占地边长；默认取 STATION_FOOTPRINT（公交 / 火车 2，地铁 / 转换件 1） */
  stationFootprint: { bus: 1 | 2; rail: 1 | 2; subway: 1; subRail: 1 };       // 默认 { bus: 2, rail: 2, subway: 1, subRail: 1 }
  /** §2.9.1：放置时是否要求占地外沿环含道路（公交）/ 铁路（火车站） */
  requireStationAdjacency: true;
  /** §2.9.1：装饰列车的 1/4 掷骰是在火车站每个占地格访问时掷（原版读法）还是只在锚格掷 */
  trainRollEveryTile: true;
}
```

读档 → 图层重建（`rebuildFromSave`）：

```
for i in 0..16383:
  id = XBLD[i]; net[i] = 0; conn[i] = 0; station[i] = 0
  if id in ROAD_SET: net |= Road
  if id in RAIL_SET: net |= Rail
  if id in HIGHWAY_SET: net |= Highway
  if id in BRIDGE_SET: net |= Bridge
  if id in PORTAL_SET: net |= Portal
  if 0x5D <= id <= 0x60: net |= Onramp
  if id in STATION_SET: net |= Station; station[i] = kindOf(id)       // stationOf 在下面按连通块组装
  if 0x6C <= id <= 0x6F: station[i] = SubRail
  if 0x0E <= id <= 0x1C or id in {0x43,0x44,0x47,0x48,0x4F,0x50,0x5C}: net |= Power
  u = XUND[i]; if u in SUBWAY_UND_SET: subway[i] = subwayMaskOf(u) | (u == 0x23 ? 0x80 : 0)
然后：conn[i] = roadMaskOf(id) | railMaskOf(id) << 4   // 由片段表与交叉件表直接给出，不重新推断
      扫描偶数锚点组装 hwyBlocks；沿轴扫描 BRIDGE_SET 组装 bridges；按 portal 配对 tunnels；recountConnections()
      组装 stations（§2.9.1）：按 (x, y) 升序扫描 station[i] != 0 且 stationOf[i] == 0 的格 t：
        n = stationFootprint[kind]；若 t 右 / 下 / 右下三格同 ID 且 XZON 角标分别为 T-R / B-L / B-R（或角标缺失但 ID 相同）⇒ 一座 n=2 车站，四格 stationOf = id+1
        否则（第三方 / 旧存档中的 1×1 车站，角标 0xF0）⇒ 建为 n=1 的车站并记导入告警，不改写 XBLD；
        每座 Station.microsimSlot 由 XTXT[t] 读回（services §2.6.1）
      roadTileCounts 全量重算（§2.12.6 的三个集合）
```

写档时反向：`XBLD = pieceId(net, conn, slope, crossover...)`，高速块按 §2.8 写段 / 物件与角标，`XBIT.bit6` 按匝道 / 桥 / 加固桥朝向写，`XTXT 0xFA` 按 `connections` 写。

### 3.3 片段选择与交叉件

```
function roadPieceFor(x, y): XBLD
  m = neighborMask(x, y, 'road')                    // 四邻中可向本格连通的道路族格
  if m 只有 1 位: m |= dirBit(opposite(单一方向))   // 末端按直线处理
  if m == 0: m = 0b1010
  s = XTER[x,y] & 0x0F
  if s in SLOPE_PIECE: 要求 m 为对应轴向直线，否则放置非法；return BASE.road + SLOPE_PIECE[s]
  if s != 0: 非法（只有 0x01..0x04 可承载直线）
  other = XBLD[x,y]
  if other 是电线直线且与 m 垂直直线: return m 为 LR ? 0x43 : 0x44
  if other 是铁路直线且与 m 垂直直线: return m 为 LR ? 0x45 : 0x46
  if other 是高速直线段且与 m 垂直: return 高速为 LR ? 0x4B : 0x4C
  return BASE.road + PIECE_MASK.indexOf(m)
```

铁路同理（`0x45/0x46/0x47/0x48/0x4D/0x4E`），电线同理（`0x43/0x44/0x47/0x48/0x4F/0x50`）。任何"非直线对非直线"的重叠非法。放置后对本格与四邻重新选片（`refreshPieces(tiles)`），交叉件的两条网络各自参与邻格的掩码计算。

### 3.4 放置工具伪代码

```
placeLine(kind: 'road'|'rail', from, to):
  path = 沿主轴（|dx|>=|dy| 取 x 轴）的直线格序列
  plan = []; cost = 0
  i = 0
  while i < path.length:
    t = path[i]
    if water(t):
      run = 从 i 起连续水块; 若 run 之后不是陆地 => 整段拒绝("桥必须两端着陆")
      kinds = kind=='road' ? availableRoadBridges(run.length) : [BridgeKind.Rail]
      choice = kind=='road' ? await bridgeDialog(kinds, run.length) : kinds[0]; if 取消 => 整段拒绝
      plan.push(bridgePlan(run, choice)); cost += run.length * tuning.cost.bridge[choice]; i += run.length; continue
    if XBLD[t] 已是同族可连通格: i++; continue                  // 重复铺设免费
    if 有建筑/车站/匝道/桥/隧道口/另一族的非直线: 跳过该格（原版：跳过并继续）[M]
    if 坡面非法: 调 terrain.autoTerraformForNetwork(t, 轴) 失败则跳过
    plan.push(tilePlan(t)); cost += kind=='road' ? 10 : 25; i++
  if funds < cost: 拒绝并提示
  apply(plan); charge(cost); refreshPieces(touched ∪ neighbors(touched))
  if touched 含边缘格: await maybeOfferNeighborConnection(touched)
```

```
placeHighway(from, to):
  对齐: x0 = from.x & ~1, y0 = from.y & ~1; 沿主轴每 2 格一块
  for each block:
    if 块与既有高速垂直相交: 置 Interchange(0x69)
    if 块内有道路直线且垂直: 两格改 0x4B/0x4C；铁路 -> 0x4D/0x4E；电线 -> 0x4F/0x50
    if 块全在水上: choice = await bridgeDialog([HighwayLow, HighwayReinforced], nBlocks)
    if 块内坡面: 要求两列同码且沿轴，用 SlopeXXX，否则 autoTerraform 或跳过
    cost += 100（低架桥按 100，加固按 200）
  连续两次拖动方向改变时，把拐点块替换为 Curve 块
placeOnramp(x, y):
  要求平地、XBLD ∈ {0x00, 树木, 道路直线}；恰有一正交邻格 h 是高速直线段，另有一正交邻格 r 是 ROAD_SET 且 r 与 h 不同向
  id 与 flip 由 (dir(h), dir(r)) 查表：高速在 T/B 且道路在 L/R -> 0x5D..0x60, flip=0；高速在 L/R -> 同表旋转 90°, flip=1
  cost 25
placeTunnel(x, y):
  要求 XTER[x,y] 为沿某轴上升的边坡；d = 上坡方向；A = 入口基准海拔
  沿 d 前进：每格要求 alt >= A+1、无隧道/桥；直到遇到"沿 d 下降回到 A"的边坡格 E；长度 <= tunnelMaxLen
  写入口 portal(朝 opposite(d))、出口 portal(朝 d)；内部 tunnelLevels = alt - A；cost = 150 * (len)
placeStation(kind, x0, y0):                                   // (x0, y0) = 锚格（占地最小坐标角，§2.9.1）
  n = tuning.stationFootprint[kind]                            // Bus 2 / Rail 2 / Subway 1 / SubRail 1
  fp = [(x0+i, y0+j) for j in 0..n-1 for i in 0..n-1]         // idx = i + n*j
  if fp 任一格越界: 拒绝("越界")
  for t in fp: 要求 XTER[t] == 0 && !water(t) && XBLD[t] < 0x0E   // 平地、非水、空地 / 树木 / 瓦砾（树木自动清除）
               否则拒绝("占地被占用 / 不平")
  ring = { r : r 正交邻接 fp 中某格 且 r ∉ fp 且 r 在图内 }        // n=2 时 8 格，n=1 时 4 格
  if tuning.requireStationAdjacency:
    Bus:  要求 ring ∩ ROAD_SET ≠ ∅        否则拒绝("公交站须紧邻道路")
    Rail: 要求 ring ∩ RAIL_SET ≠ ∅        否则拒绝("火车站须紧邻铁路")
  SubRail: 要求 ring 中恰有一条铁路末端或直线 r；dir = 指向 r 的方向
  if funds < cost[kind]: 拒绝("资金不足")
  slot = services.allocMicrosim(tileId(kind))                  // 独占记录，满则拒绝（services §2.6.1）
  s = { id: stations.length, kind, x0, y0, n, microsimSlot: slot }; stations.push(s)
  for t in fp:
    XBLD[t] = kind == SubRail ? 0x6C + dir : tileId(kind)       // 0xEC / 0xED / 0xE9
    XZON[t] = cornerBits(n, idx(t))                               // 低 4 位分区码清 0
    XTXT[t] = slot;  XBIT[t] |= POWERABLE;  station[t] = kind;  stationOf[t] = s.id + 1;  net[t] |= Station
  if kind in {Subway, SubRail}: XUND[x0, y0] = 0x23              // 仅 1×1
  charge(cost[kind]); upkeepCount[kind] += 1（按座）; tileCounts[tileId] += n*n（按格）
  markAccessDirty(fp)                                            // §3.5：fp 每格的 24 个反向偏移
removeStation(s):                                                // 由共享 destroyStructure 调用，整座一起拆
  for t in fp(s): XBLD = 0x00; XZON 高 4 位清 0; XTXT = 0; station = 0; stationOf = 0; net &= ~Station
  if s.n == 1 && kind in {Subway, SubRail}: XUND[x0,y0] = 0x00
  services.freeMicrosim(s.microsimSlot); upkeepCount[kind] -= 1; tileCounts[tileId] -= n*n; markAccessDirty(fp)
placeSubway(from, to):
  同 placeLine 但写 XUND；与水管垂直直线相交 -> 0x1F/0x20；遇 0x22 导弹井或其他地下物件 -> 跳过；水面下方按 tuning.subwayUnderWater（默认 false）
```

### 3.5 可达查询

```ts
export const ACCESS_OFFSETS: ReadonlyArray<readonly [number, number]> = [
  [0,1],[1,0],[0,-1],[-1,0], [0,2],[2,0],[0,-2],[-2,0], [0,3],[3,0],[0,-3],[-3,0],
  [1,1],[-1,1],[1,-1],[-1,-1], [2,1],[-2,1],[2,-1],[-2,-1], [1,2],[-1,2],[1,-2],[-1,-2],
];
export interface TransportQuery {
  hasAccess(x: number, y: number): boolean;        // §2.11，24 偏移，道路或车站占地任一格
  accessStart(x: number, y: number): { x: number; y: number; mode: Mode } | null;   // 命中车站格时 mode 按车站种类
  stationAt(x: number, y: number): Station | null; // stationOf 查表；出行模型与 UI 查询面板共用
  trafficAt(x: number, y: number): number;         // 只读 services 的 XTRF：traffic[(x>>1) + 64*(y>>1)]
  roadDistance(x: number, y: number): number;      // 仅供 UI：Chebyshev 距最近 ROAD_SET 格，>3 返回 4
  roadTileCounts(): { roadTiles: number; highwayTiles: number; bridgeTiles: number };   // §2.12.6 分母，services.trafficGraph 调用
}
```

`hasAccess` 的增量缓存：对任何 `net` 变化格 `t`，把 `t` 的 24 个反向偏移格标脏即可（偏移集合关于原点对称）；放置 / 拆除一座 2×2 车站就是 4 个变化格，各自标脏（并集 36 格 + 占地本身）。

### 3.6 出行生成器

```ts
export const enum Mode {
  Road, Highway, Tunnel, RoadBridge, Walk, WalkHighway, WalkTunnel, WalkBridge,
  Bus, Exit, RailEnter, SubwayEnter, Rail, Subway,
}
export interface TrafficTuning {
  maxSteps: 100; lowDensityNumerator: 3; lowDensityDenominator: 4;   // popLevel==1 时 100*3/4
  stepRoad: 3; stepWalk: 2; stepRapid: 1; stepTransfer: 4; stepOnrampIn: 2; stepOnrampOut: 1;
  triesPerNode: 4; stackLimit: 512;
  /** §2.9.1：同一座车站占地内部移动的步数；0 = 评审建议值，4 = 逆向转移表的字面值（对照预设） */
  stationInteriorStep: 0;
  destMask: Record<1|2|3|4|5|6, number>;             // §2.12.2 默认值
  allowSubRailTransfer: true; walkCrossoverAsBridge: true; missileSiloIsSubway: true;
  lightLevel: 48; heavyLevel: 160;                   // 仅显示阈值；衰减 / 总量参数已移交 services（§2.12.6）
}
export interface TripResult { ok: boolean; usedBus: boolean; usedRail: boolean; usedSubway: boolean; steps: number }
/** 搜索栈帧；visited 仅在当前格是车站格时有意义（本次到访已踏过的占地格位集，bit = fpIndex） */
interface Frame { x: number; y: number; mode: Mode; steps: number; dirs: number; visited: number }
```

```
runTrip(x, y, zone, popLevel, rng): TripResult
  start = accessStart(x, y); if !start: return fail
  budget = maxSteps; if popLevel == 1: budget -= budget >> 2
  turn = rng.bit() ? 1 : 3                                   // 顺/逆时针，一次出行固定
  s0 = stationAt(start.x, start.y)
  frames: Frame[] = [{ x: start.x, y: start.y, mode: start.mode, steps: 0, dirs: 0b1111,
                       visited: s0 ? 1 << fpIndex(s0, start.x, start.y) : 0 }]
  cur = frames[0]; done = false
  while !done and cur.steps < budget:
    d = rng.int(4); moved = false
    for try in 1..triesPerNode:
      d = (d + turn) & 3
      if (cur.dirs & dirBit(d)) == 0: continue
      cur.dirs &= ~dirBit(d)
      nx = cur.x + DX[d]; ny = cur.y + DY[d]
      if outOfMap(nx, ny):
        if XTXT[cur] == 0xFA: done = true; break        // 去邻城
        continue
      r = step(cur, nx, ny, zone)                        // 查 §2.12.4 表 -> {kind:'arrive'|'move'|'blocked', cost, mode}
                                                         // step() 读 cur.mode、cur.visited 与 stationOf 判断"本座未踏过 / 另一座"
      if r.kind == 'arrive': done = true; break
      if r.kind == 'blocked': continue
      nextDirs = (r.mode == RoadBridge or r.mode == WalkBridge) ? dirBit(d)
               : (r.mode == SubwayEnter) ? 0b1111
               : 0b1111 & ~dirBit(opposite(d))
      sn = stationAt(nx, ny)
      nextVisited = !sn ? 0
                  : (stationOf[nx,ny] == stationOf[cur.x,cur.y]) ? cur.visited | (1 << fpIndex(sn, nx, ny))   // 本座内部移动
                  : 1 << fpIndex(sn, nx, ny)                                                                   // 新到访一座车站
      if frames.length >= stackLimit: return fail
      frames.push({ x: nx, y: ny, mode: r.mode, steps: cur.steps + r.cost, dirs: nextDirs, visited: nextVisited })
      cur = frames.top(); moved = true; break
    if done: break
    if !moved:                                            // 回溯
      do { frames.pop(); if frames.empty(): return fail; cur = frames.top() } while cur.dirs == 0
  if !done: return fail
  // 成功：写交通与乘客
  if popLevel > 0:
    for f in frames: if f.mode in {Road, Highway, RoadBridge}: services.addTraffic(tileIndex(f.x, f.y), popLevel)   // §2.12.6；车站内部帧的模式不在其中
  used = { bus: frames.some(m==Bus), rail: frames.some(m==RailEnter), subway: frames.some(m==SubwayEnter) }
  passengers.bus += used.bus ? popLevel : 0 ; 同理 rail / subway
  return ok
```

`step()` 用两张查表实现：`classify(cur, nx, ny) -> TileClass`（按 §2.3 集合与 `XUND`、`tunnelLevels`、`XZON`；车站格再按 `stationOf` 与 `cur.visited` 细分为 `StationSameUnvisited` / `StationSameVisited`（恒不可走）/ `StationOther`，并带上车站种类）与 `TRANSITION[mode][class]`（§2.12.4 表）。保持表驱动，便于用单元测试逐行覆盖；`stationFootprint = 1` 时 `StationSame*` 两类永不出现。

随机源：使用模拟 PRNG（与存档一致的 LCG 由模拟循环规格定义），不要用 `Math.random`。

### 3.7 月度更新、连接计数、预算

```
// 月度衰减与 MISC 0x0030 不在本模块（评审裁定，§2.12.6）：第 19 天由 services.decayTraffic() 完成，
// 日程表里原指向本节的 trafficDecay 条目应只指向 services-models.md §3.3。本模块只维护分母：
roadTileCounts():                                 // §2.12.6
  return { roadTiles, highwayTiles, bridgeTiles }  // 放置 / 拆除 / 衰败（budgetTick 的 rubble*）时增量 ±1，读档全量重算
                                                  // roadTiles = ROAD_SET ∖ HIGHWAY_SET（含匝道、道口、隧道口）；highwayTiles 按格；bridgeTiles = BRIDGE_SET
recountConnections():                             // §2.13
  connections = []
  for each edge e in [T(y=0), L(x=0), B(y=127), R(x=127)]:
    沿边扫描格 t：k = 'road' if roadStraightPerpendicular(t) else 'rail' if railStraightPerpendicular(t)
                  else 'highway' if hwyStraight(t) else null
    连续同为 'highway' 的 2 格合并为 1 条；其余每格 1 条
    对每条：XTXT[t] = 0xFA；connections.push(...)
  清除不再是连接的旧 0xFA
  commerceConnect = count(kind=='road'); industryConnect = count(kind in ['rail','highway'])
  MISC[0x1024] = Σ tiles
budgetTick(x, y):                                  // 随生长扫描对每格调用，§2.15
  if net has Highway and 非桥: if even(x)&&even(y) and roll(Highways): rubbleBlock(x,y)
  else if net has Bridge: if wind + rng.int(50) >= funding(Bridges): demolishBridgeTile(x,y); news('bridgecollapse')
  else if net has Road: if roll(Roads): rubble(x,y)
  else if net has Rail: if roll(Rail): rubble(x,y)
  if subway[x,y] and subwayDecays and roll(Subway): clearSubway(x,y)
  if tunnelInteriorOrPortal(x,y) and roll(Tunnel): collapseTunnel(x,y)
  roll(k) := funding(k) != 100 and rng.int(100) >= funding(k)
yearlyUpkeep(): Σ 各条目数量 × 单价 × funding%，按月 1/12 扣款（预算规格负责结算）
```

### 3.8 与其他模块的接口

| 调用方 | 接口 | 说明 |
|---|---|---|
| 分区生长 | `hasAccess(x,y)`、`runTrip(x,y,zone,popLevel)` | 每格每轮 1 次 |
| 需求 | `connections` 计数、`seaportCranes`、`airportTiles` | 由本模块 / 港口模块提供 |
| services（数据图层） | 本模块调用 `services.addTraffic(tile, popLevel)`；services 调用本模块 `roadTileCounts()` 算 `trafficGraph` 分母；`XTRF` 衰减与 `MISC 0x0030` 由 services 写（§2.12.6） | 双向，但 `XTRF` 的写权只在 services |
| services（微模拟） | `allocMicrosim / freeMicrosim`（车站每座一条独占记录，`XTXT` 标签写全部占地格，§2.9.1） | 放置 / 拆除时 |
| 污染 / 地价 | `trafficAt(x,y)` | 只读 `XTRF` |
| 渲染 | `net / conn / hwyBlocks / bridges`、`traffic` 阈值、地下视图的 `subway` | 精灵 ID 映射在渲染规格 |
| 物件 | 火车生成条件（§2.9）、船只航道（§2.6）、飞机（机场） | 本模块只给谓词 |
| 预算 | 六条目的数量与单价 | 本模块维护计数 |
| 存档 | `rebuildFromSave` / `writeToSave` | §3.2 |

---

## 4. 边界条件与易错点

1. **可达不是半径**：实现 `hasAccess` 必须用 24 偏移表，并写测试：(2,2)、(3,1) 处的道路不提供可达，(3,0)、(2,1) 提供。
2. **出行的"下一格"检查目的地，不是"当前格"**：到达判定发生在候选格上，而步数扣在踏上可走格时；到达不扣步。
3. **回溯恢复步数**：实现若在回溯时不恢复 `steps`，可达距离会被死胡同严重吃掉，与原版明显不同。
4. **桥上只许直行**、**刚入地铁四向全开**、**其他模式禁止掉头**——三条掩码规则缺一会改变随机游走的统计特性。
5. **高速不检查目的地**：紧贴高速的分区不会因高速而"可达"或"到达"，必须经匝道。
6. **匝道是双重身份**：属于 `ROAD_SET`（可从道路踏入、可作为分区可达起点）又属于高速的出入口；但不属于 `ROAD_SURFACE_SET`，因此 ROAD 模式踏上匝道一定切换到 HIGHWAY，不能把匝道当普通路面"路过"。
7. **`BRIDGE_SET` 的区间怪癖**：`0x51–0x5C` 连续区间里包含铁路桥与高架电线，原版汽车模式把它们也当公路桥通行（意味着汽车可以沿铁路桥过河）。复刻时保留（`faithfulBridgeSet = true`），否则需把 `0x5A/0x5B/0x5C` 剔除。
8. **`XUND 0x22` 导弹井被当作地铁可通行**：原版怪癖，默认保留但可关。
9. **地铁↔铁路换乘**：见 §2.12.4；默认开放换乘但要在 §5 里追踪原版真相。
10. **高速块锚点为偶数**：导入外部存档时若发现奇数锚点的 2×2 高速物件，按角标重建块而不是按偶数网格硬切；预算衰败只在块锚点掷骰。
11. **交叉件属于两个网络**：`0x45` 既在 `ROAD_SET` 又在 `RAIL_SET`，重算连接掩码时两族都要把它当作可连通邻格；拆除交叉件时两条线都断。
12. **车站不参与片段选择**：铁路末端紧邻火车站时，铁路片段按"末端直线"处理，不要把车站当作铁路邻格而生成转弯 / 三叉。
13. **邻城连接只认直线片段**：边缘格上的转弯 / 三叉不构成连接；道路在边缘格沿边平行铺设也不构成连接。
14. **`popLevel == 0` 的空地出行**：成功与否影响生长，但不写交通，也不计乘客。
15. **`XTRF` 饱和**：加法必须钳位到 255；衰减用移位保持整数。
16. **风速单位**：桥梁坍塌判定里风速是 0–255 的原始值，不是换算后的 mph 显示值；风速 ≥ 100 时即使资金率 99% 也必然坍塌——这是原版的"大风毁桥"。
17. **交通预算 = 100% 时不得掷骰**（判定先比较 `!= 100`），否则会出现永不损毁但 `rng` 序列偏移的问题。
18. **拆除整桥**：`demolishBridgeTile` 应委托 `terrain.md` 的拆桥逻辑（恢复岸格地形），不要只清一格。
19. **读档重算连接**：不要信任存档里的 `XTXT 0xFA`——先清后按瓦片重建，避免复刻原版"铁路 / 高速连接读档后失效"的 bug。
20. **隧道内部格可建楼**：隧道内部格的 `XBLD` 可能是住宅；出行模型靠 `tunnelLevels` 而不是 `XBLD` 判断"还在隧道里"。
21. **一座 2×2 车站不是四座 1×1**：`XBLD` 四格同为 `0xEC/0xED`，"同一座"只能靠 `stationOf` 判断。不建 `stationOf` 会把两座并排的公交站当成一座（内部 0 步互通），也会把乘客数 / 维护费按格算成 4 倍。
22. **占地内部 0 步必须配 `visited` 掩码**：否则随机游走会在 2×2 里以 0 步绕圈直到 512 栈满而失败；`stationInteriorStep = 4` 的对照预设同样要保留掩码，否则步数统计与 0 步版本不可比。
23. **按座与按格的四种计数**：预算维护费与 `XMIC` 乘客按座；`MISC 0x01F0..` 瓦片计数与装饰列车上限的"火车站计数"按格（§2.9.1）；情景建筑目标按格（catalogue）。写测试时分别断言。
24. **导入 1×1 车站要容忍**：第三方 / 旧存档可能出现角标 `0xF0` 的单格车站；按 `n = 1` 建站并告警，不要试图扩成 2×2（会吞掉邻格建筑）。
25. **`MISC 0x0030` 本模块不写**：`Σ XTRF == MISC 0x0030` 的断言只在第 19 天衰减后、下一次生长扫描之前成立（services 口径）；其他时刻两者不等是正常的，不要据此"修正"。
26. **车站邻接与 `ring`**：2×2 车站的邻接判定用 8 格外沿环，不是锚格的四邻；斜角 4 格不算。火车站只要任一外沿格邻接铁路即可，乘客在站内（0 步）走到那一格。

---

## 5. 待确认问题

| # | 问题 | 本文采用值 | 影响 |
|---|---|---|---|
| Q1 | `destMask` 原版取值（内存表，按分区码索引的 16 位掩码） | §2.12.2 建议表 | C / I 出行目的地、机场 / 海港是否算就业地 |
| Q2 | 地铁↔铁路转换件是否真的允许乘客换乘 | `allowSubRailTransfer = true` | 轨道网效用 |
| Q3 | ~~`XTRF` 月度衰减方式与 `MISC 0x0030` 交通计数公式~~ → **已移交**：owner 为 `services-models.md`（其 Q4），本文采用其口径"第 19 天 `−= >> 2` 后求和"，图表 / 报纸用 `trafficGraph = 和 / (1 + 道路格 + 高速格 + 桥格)` **[L]** | §2.12.6 | 只影响 services 的一处函数；本文阈值全部以 `trafficGraph` 表述 |
| Q4 | 交通对污染 / 地价的精确系数 | §2.12.7 | 平衡性 |
| Q5 | 轻 / 重交通叠加精灵的两个阈值 | 48 / 160 | 显示 |
| Q6 | 邻城连接是否收费、是否弹确认框、金额 | 收 $1,000，弹框 | 早期经济 |
| Q7 | `MISC 0x06D8..` 四个邻城的存储顺序与四条边的对应 | §2.13 映射 | 邻城窗口、路牌文字 |
| Q8 | ~~公交站 / 火车站 / 地铁站占地是否都是 1×1~~ → **已关闭**：公交站 / 火车站 **2×2**、地铁站 1×1（`building-catalogue.md` §2.7 对逆向占地分类函数的读法 **[H]**，§2.9.1）；公交站是否需要供电供水仍开放 | `stationFootprint = {2, 2, 1, 1}`；出行不检查供电 | 布局、可达影响区 36 格 |
| Q17 | 2×2 车站占地内部移动的步数：逆向转移表字面为 4 / 格（不区分同一座），评审建议 0 | `stationInteriorStep = 0`；对照预设 4 | 车站有效半径（0 时站内免费，4 时最多多扣 12 步） |
| Q18 | 装饰列车：1/4 掷骰按占地每格还是每座；上限"火车站计数 ÷ 4"按格还是按座 | 每格掷；按格计数（2×2 ⇒ 每座一列） | 列车密度与 `XTXT` 物件槽占用 |
| Q9 | 年维护单价全表（§2.4）与桥 / 加固桥 / 高架电线的建造单价 | §2.4 | 预算 |
| Q10 | 隧道最大长度、是否允许铁路隧道、地铁能否从隧道下方穿过 | 64；否；允许 | 地形利用 |
| Q11 | 地铁能否铺在水面下方 | 否 | 跨河地铁 |
| Q12 | 地铁 / 隧道在预算不足时的损毁规则 | §2.15 建议 | 预算惩罚 |
| Q13 | 高速 / 公交 / 地铁 / 机场的发明基准年份 | 1930 / 1920 / 1910 / 1930 | 时间线规格应给出权威表 |
| Q14 | 道路拖动遇到障碍是"跳过继续"还是"整段拒绝" | 跳过继续 | 工具手感 |
| Q15 | 吊桥长度是否要求奇数（中央塔居中） | 不要求，偏长的一侧多放一个中段 | 桥梁几何 |
| Q16 | 火车站是否必须供电才能让出行使用（原版出行判定不检查，但装饰列车要求供电） | 不检查 | 轨道效用 |

---

## 6. 参考来源

- dfloer/SC2k-docs（CC BY-SA 4.0，本地副本）：`sc2_file_spec.md`（`XBLD` 全表、`XUND`、`XBIT` 位、`XTXT 0xFA`、`XTRF` 64×64、`MISC` 交通计数 / 连接格数 / 地铁格数 / 六条交通预算的偏移与 27×4B 布局、发明年份槽位、`XTHG` 列车类型、`XMIC` 公交示例）；`simulation_spec.md`（道路 / 铁路 / 高速连接对商业 / 工业诉求的满足量、海港 / 机场诉求、Parking Fines 备注、交通计数"非 XTRF 之和"）；`text_data_spec.md`（`hightraffic`、`traffic`、`needconnections`、`otherrailcrash` 等故事类型）。本文全部 **[H]** 标注的存档事实出自这两份文档。
- araxestroy / sc2kfix（MIT；**只读以理解机制，未复制代码**）：`include/sc2k/sc2k_1996.h` 中的瓦片 / 精灵枚举命名（半高铁路件、匝道、交叉件、轻 / 重交通叠加精灵、`TRANSIT_TYPE_*`、`BUDGET_*`、高速放置类型 "1x1 段 / 2x2 物件" 注释、`XBIT` 位定义、乘客与连接计数器名）；`hooks/hook_tilegrowthorplacement.cpp` 中对原版出行生成器与生长扫描的重实现（24 偏移起点表、100 步预算、`popLevel==1` 减四分之一、各模式步数、换乘 4 步、禁止掉头 / 桥上直行 / 入地铁四向、每节点 4 次尝试、回溯恢复、仅汽车模式累加 `XTRF`、乘客计数、出界 + `0xFA` 到达、`XBLD > 0xFA` 到达、交通预算衰败的各条件与桥梁风速判定、火车站生成列车条件）；`hooks/hook_bridgedialog.cpp`（7 种桥型枚举、费用 = 格数 × 基价、资金不足红字、各桥型预览片段序列）；`hooks/hook_terrainhandling.cpp`（拆桥 / 拆隧道时的连锁与 `tunnelLevels` 清零）；`modules/sc2k_help.cpp`（工具与预算帮助文本：匝道只能放在高速 / 道路交汇处、公交"最多一半通勤者"、转换件须紧邻铁路、海港 10,000 / 机场 15,000、交通六类预算与"道路铁路高速变废墟 / 地铁塌陷 / 桥隧不稳定"、交通图表定义）。
- 社区指南（站点不可直接访问，通过搜索摘要获得；均为 **[M]/[L]**）：ludo.guide 的 SC2K 条目（建造与年维护费表、桥型长度建议、隧道直线且不相交、邻城连接 $1,000、公交站描述、机场最小 2×6、海港需通航水域）；Inside Mac Games 1994 年 2 月号攻略（公交 / 地铁每座 $25 / 年；"10 格 / 翻倍"经验说法，本文未采用）；Wikibooks / StrategyWiki "SimCity 2000 Concepts"（隧道跨水技巧、高速与道路同平面相接技巧）。
- 经典 SimCity 的交通随机游走设计（公开的逆向图解）：用于理解 SC2K 模型的血统（随机转向、步数上限、路径回写密度图），具体数值以 SC2K 的为准。
- 兄弟规格：`terrain.md`（坡面合法性、桥梁几何与地形改动、隧道几何、海港水深）、`zones-growth-demand.md`（生长状态机、需求上限、邻城人口）、`building-catalogue.md`（§2.7 / §4.1 车站 2×2 裁定与占地分类来源）、`services-models.md`（§2.4 / §3.3 `addTraffic` / `decayTraffic` / `trafficGraph`、§2.6.1 微模拟槽位、§2.10.3 抱怨权重）、`disasters-events.md`（`hightraffic` / `lowtraffic` 月检与顾问阈值）、`economy-budget.md`（日程第 19 天、情景 `trafficMax`、`demolishWholeStructure`）、`file-formats.md`（§2.2.5 `XZON` 角标位值）。
