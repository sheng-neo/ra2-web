# 领域规格：文件格式与本地导入（File Formats & Local Import）

> 适用范围：`packages/sc2k` 中的 `io/sc2`（`.SC2` 存档导入 / 导出）、`io/sprites`（Win95 精灵文件 `LARGE.DAT / SMALLMED.DAT / SPECIAL.DAT` 解码）、`io/palette`（`PAL_MSTR.BMP` 与调色板动画）、`io/text`（`DATA_USA / TEXT_USA` 可选导入）、`io/import`（浏览器端文件选择 / 拖放 / 目录授权 / IndexedDB 缓存）。
> 目标读者：并行实现各模块的工程师（含 AI agent）。本文给出可直接实现的字节布局、算法伪代码、TypeScript 接口与测试样例。
> 置信度标记：**[H]** 一手资料（dfloer 社区格式文档、同作者的解析器、逆向工程头文件、OpenSC2K 的单元测试断言）直接支持；**[M]** 多个二手来源或强推断；**[L]** 仅凭记忆或单一来源，实施时按本文建议值实现并列入 §5。
> 版权铁律：仓库只含原创代码与原创占位美术。本文描述的所有格式仅用于"玩家在自己浏览器里导入自己拥有的文件"；字节流不经服务器、不入库、不随应用分发。任何测试夹具必须是本文 §3.5.4 那样**手工构造**的最小样例，不得截取原版文件。

---

## 1. 概述

### 1.1 文件清单

| 文件 | 原版安装目录 | 作用 | 导入是否必需 | 本文章节 |
|---|---|---|---|---|
| `*.SC2` | `CITIES/`、`SCENARIO/`（情景为 `.SCN`，同格式加扩展 chunk） | 城市存档 / 情景 | 否（新城不需要） | §2.1–§2.5 |
| `LARGE.DAT` | `DATA/` | 最大缩放级（large）的全部地块 / 建筑 / 载具 / 特效精灵 | 否（无则用原创程序化美术） | §2.6 |
| `SMALLMED.DAT` | `DATA/` | small 与 medium 两级缩放的同一套精灵 | 否 | §2.6 |
| `SPECIAL.DAT` | `DATA/` | 补充的 small/medium 段精灵（与 `SMALLMED.DAT` 合并使用） | 否 | §2.6 |
| `PAL_MSTR.BMP` | `BITMAPS/` | 256 色主调色板（含色循环段） | 有精灵文件时必需 | §2.7 |
| `PAL_STTC.BMP` | `BITMAPS/` | 静态调色板：色循环索引处为黑色，可用来自动探测循环段 | 可选 | §2.7.4 |
| `PAL_MAC.BMP` | `BITMAPS/` | 情景图片（`PICT`）用的调色板 | 可选 | §2.5.3 |
| `DATA_USA.DAT/.IDX` | `DATA/` | 报纸词元库 | 可选（我们自写新闻） | §2.9 |
| `TEXT_USA.DAT/.IDX` | `DATA/` | 其它界面文本 | 可选 | §2.9.4 |
| `*.MIF` | `SCURKART/` | SCURK 导出的替换建筑精灵 | 可选 | §2.8 |

### 1.2 字节序与整数约定（全文适用）

| 范围 | 字节序 | 置信度 |
|---|---|---|
| `.SC2` 容器头、chunk 大小、`MISC` 的 32 位整数、`ALTM` 的 16 位整数、`XGRP` 的 32 位整数、`SCEN` 字段 | **大端（BE）** | H |
| `.SC2` 的 `PICT` 宽高（u16） | **小端（LE）**（原版的例外） | H（解析器显式用 LE） |
| `LARGE.DAT / SMALLMED.DAT / SPECIAL.DAT` 头部（计数、ID、偏移、宽高） | **大端（BE）** | H（同一套解析器的整数助手全部为 BE，且用于精灵头） |
| `PAL_*.BMP` | 标准 Windows BMP，**小端** | H |
| `DATA_USA.IDX / TEXT_USA.IDX` 记录 | **小端** | H（解析器显式 `<I`） |
| `DATA_USA.DAT` 内部的 Group Start / Group Count（u16）与 Token Pointer（u32） | **大端** | H |

`MISC` 的所有数值一律按**有符号** 32 位读写（资金可为负、需求为 ±2000）。

### 1.3 模块划分

```
io/
  bytes.ts        ByteReader / ByteWriter（BE/LE 显式方法，越界即抛 RangeError）
  sc2/
    iff.ts        parseIff / buildIff
    rle.ts        rleDecode / rleEncode
    sc2Read.ts    readSc2(buffer) → Sc2Document + 诊断
    sc2Write.ts   writeSc2(doc) → ArrayBuffer
    misc.ts       MISC 字段偏移常量与访问器
    mapping.ts    Sc2Document ⇄ 内部 CityState（调用各模块的 rebuild）
  sprites/
    archive.ts    parseSpriteArchive(buffer) → SpriteArchive（只建索引，不解码像素）
    decode.ts     decodeSprite(entry) → IndexedBitmap
    ids.ts        精灵 ID 方案（§2.6.3）与 resolveSpriteId()
    mif.ts        （可选）MIF 读取
  palette/
    bmp.ts        readPaletteBmp(buffer) → Palette
    cycle.ts      色循环表与 tick 推进
  text/           （可选）DATA_USA / TEXT_USA 读取
  import/
    sources.ts    File System Access / 拖放 / <input> 三种来源统一为 AssetSource
    identify.ts   按文件名 + 魔数识别与校验
    store.ts      IndexedDB 缓存
    worker.ts     解码在 Web Worker 中进行
```

依赖方向：`import → sprites/palette/sc2/text → bytes`。渲染模块只依赖 `SpriteProvider` 接口（§3.7），不直接读文件。

---

## 2. 原版行为（格式事实）

### 2.1 `.SC2` 容器

#### 2.1.1 文件头与 chunk 框架 [H]

```
偏移  长度  内容
0     4     "FORM"
4     4     u32 BE = 文件总长 − 8
8     4     "SCDH"
12    ...   chunk 序列：[id: 4 ASCII][size: u32 BE][data: size 字节]，无对齐填充
```

- chunk id 为 4 个 0x20–0x7F 的 ASCII 字符。`size` 是**文件内（压缩后）长度**。
- 与标准 IFF 不同，奇数长度 chunk **没有**填充字节 [H]。
- Mac 版文件前面多 128 字节的 MacBinary 头：若偏移 0 不是 `FORM` 而偏移 0x80 是，则丢弃前 128 字节，并用偏移 0x84 的长度 + 8 作为有效长度 [H]。Mac 文件可能没有 `CNAM`，城市名可从 MacBinary 头偏移 1 的 Pascal 字符串取 [M]。
- 若偏移 0 不是 `FORM`、且偏移 0x41 处为 ASCII `CITYMCRP`、前两字节 `00 0D`，这是 SimCity Classic 存档，直接报 `UNSUPPORTED_CLASSIC` [H]。

#### 2.1.2 chunk 一览 [H]

| chunk | 解压后长度 | 是否 RLE 压缩 | 内容 | 典型写出顺序 |
|---|---|---|---|---|
| `CNAM` | 32 | 否 | 城市名 | 1 |
| `MISC` | 4800 | 是 | 1200 个 i32：全局状态 | 2 |
| `ALTM` | 32768 | 否 | 每格 u16：海拔 / 水位 / 隧道 | 3 |
| `XTER` | 16384 | 是 | 每格 u8：坡面与水体类型 | 4 |
| `XBLD` | 16384 | 是 | 每格 u8：建筑 / 结构 ID | 5 |
| `XZON` | 16384 | 是 | 每格 u8：分区 + 建筑角标 | 6 |
| `XUND` | 16384 | 是 | 每格 u8：地下（地铁 / 水管） | 7 |
| `XTXT` | 16384 | 是 | 每格 u8：标签 / 微模拟 / 灾害标记指针 | 8 |
| `XLAB` | 6400 | 是 | 256 × 25 B 标签字符串 | 9 |
| `XMIC` | 1200 | 是 | 150 × 8 B 微模拟记录 | 10 |
| `XTHG` | 480 | 是 | 40 × 12 B 活动物件 | 11 |
| `XBIT` | 16384 | 是 | 每格 u8：8 个位标志 | 12 |
| `XTRF` | 4096 | 是 | 64×64 交通密度 | 13 |
| `XPLT` | 4096 | 是 | 64×64 污染 | 14 |
| `XVAL` | 4096 | 是 | 64×64 地价 | 15 |
| `XCRM` | 4096 | 是 | 64×64 犯罪 | 16 |
| `XPLC` | 1024 | 是 | 32×32 警力覆盖 | 17 |
| `XFIR` | 1024 | 是 | 32×32 消防覆盖 | 18 |
| `XPOP` | 1024 | 是 | 32×32 人口密度 | 19 |
| `XROG` | 1024 | 是 | 32×32 增长率 | 20 |
| `XGRP` | 3328 | 是 | 16 条统计曲线 × 52 × i32 | 21 |
| `TEXT` | 可变（出现 2 次） | 否 | 情景说明文字 | 22–23（仅情景） |
| `SCEN` | 56（或 52） | 否 | 情景目标 | 24（仅情景） |
| `PICT` | 可变 | 否 | 情景缩略图 | 25（仅情景） |
| `TMPL` | 338 | 否 | `SCEN` 的字段模板说明，仅原装 5 个情景有 | 26（仅情景） |

读取时**不要假设顺序**（按 id 分发），写出时按上表顺序。重复 id 以后者为准，`TEXT` 例外（累积为列表）。

#### 2.1.3 RLE 压缩 [H]

控制字节 c：

| c | 含义 |
|---|---|
| 0x01–0x7F | 字面量：后面紧跟 c 个原样字节 |
| 0x81–0xFF | 重复：后面 1 个字节重复 `c − 0x7F` 次（2–128 次） |
| 0x00、0x80 | 原版不产生。解码器遇到时**跳过并记录警告**（不中断） |

原版压缩器的可观察特征：几乎每个字节都被编码（大量 `01 xx`），长度 ≥ 2 的同值串用重复码。压缩后可能比原数据更长。

### 2.2 地块层（每格 1 项，共 16384 格）

#### 2.2.1 线性索引 [H]

```
i = x * 128 + y        // x 为主序，y 变化最快；与 terrain.md §2.1 一致
x = i >> 7;  y = i & 127
```

旋转值 `MISC[0x0008]` 不影响存储顺序；所有层都是未旋转的世界坐标。

#### 2.2.2 `ALTM`（u16 BE）[H]

| 掩码 | 字段 | 说明 |
|---|---|---|
| `0x001F` | `alt` | 地表海拔 0–31（水下格为海床） |
| `0x03E0` | `waterLevel` | 该格水面高度 0–31，**不可靠**，导入后以 `XTER` 重算（terrain.md §3.7） |
| `0x7C00` | `tunnel` | 与隧道层级相关，含义未全明；按原值透传 |
| `0x8000` | 未用 | 观察为 0 |

#### 2.2.3 `XTER`（u8）[H]

高 nibble 为类别，低 nibble 为坡面 / 形状码（14 种，`0x0–0xD`）：`0x0X` 干地、`0x1X` 水下、`0x2X` 岸边、`0x3X` 浅水、`0x3E` 瀑布、`0x40/0x41` 溪流 L–R / T–B、`0x42–0x45` 水湾（水触及 B / L / T / R 边）。其余值未定义，导入按 `0x00` 处理并告警。全表与坡面角语义见 `terrain.md` §2.4–§2.5，本文不重复。

#### 2.2.4 `XBLD` 全表（u8）[H]

命名为本项目标识符（原版 SCURK 名称已转述）。L/R/T/B = 左 / 右 / 上 / 下边；`H` 前缀 = 该端为坡顶；`X` = 交叉件。

| | | | |
|---|---|---|---|
| 00 Clear | 01 Rubble1 | 02 Rubble2 | 03 Rubble3 |
| 04 Rubble4 | 05 Radioactive | 06 Trees1 | 07 Trees2 |
| 08 Trees3 | 09 Trees4 | 0A Trees5 | 0B Trees6 |
| 0C Trees7 | 0D SmallPark | 0E PowerLR | 0F PowerTB |
| 10 PowerHTB | 11 PowerLHR | 12 PowerTHB | 13 PowerHLR |
| 14 PowerBR | 15 PowerBL | 16 PowerTL | 17 PowerTR |
| 18 PowerRTB | 19 PowerLBR | 1A PowerTLB | 1B PowerLTR |
| 1C PowerLTBR | 1D RoadLR | 1E RoadTB | 1F RoadHTB |
| 20 RoadLHR | 21 RoadTHB | 22 RoadHLR | 23 RoadBR |
| 24 RoadBL | 25 RoadTL | 26 RoadTR | 27 RoadRTB |
| 28 RoadLBR | 29 RoadTLB | 2A RoadLTR | 2B RoadLTBR |
| 2C RailLR | 2D RailTB | 2E RailHTB | 2F RailLHR |
| 30 RailTHB | 31 RailHLR | 32 RailBR | 33 RailBL |
| 34 RailTL | 35 RailTR | 36 RailRTB | 37 RailLBR |
| 38 RailTLB | 39 RailLTR | 3A RailLTBR | 3B RailHalfHTB |
| 3C RailHalfLHR | 3D RailHalfTHB | 3E RailHalfHLR | 3F TunnelT |
| 40 TunnelR | 41 TunnelB | 42 TunnelL | 43 XPowerTB_RoadLR |
| 44 XPowerLR_RoadTB | 45 XRoadLR_RailTB | 46 XRoadTB_RailLR | 47 XPowerTB_RailLR |
| 48 XPowerLR_RailTB | 49 HwyLR | 4A HwyTB | 4B XHwyLR_RoadTB |
| 4C XHwyTB_RoadLR | 4D XHwyLR_RailTB | 4E XHwyTB_RailLR | 4F XHwyLR_PowerTB |
| 50 XHwyTB_PowerLR | 51 SuspBridgeStartB | 52 SuspBridgeMidB | 53 SuspBridgeCenter |
| 54 SuspBridgeMidT | 55 SuspBridgeEndT | 56 RaisingBridgeTower | 57 CausewayPylon |
| 58 RaisingBridgeLowered | 59 RaisingBridgeRaised | 5A RailBridgePylon | 5B RailBridge |
| 5C ElevatedPower | 5D OnrampHwyT_RoadL | 5E OnrampHwyT_RoadR | 5F OnrampHwyB_RoadL |
| 60 OnrampHwyB_RoadR | 61 HwyHTB | 62 HwyLHR | 63 HwyTHB |
| 64 HwyHLR | 65 HwyBR | 66 HwyBL | 67 HwyTL |
| 68 HwyTR | 69 HwyInterchange | 6A ReinfBridgePylon | 6B ReinfBridge |
| 6C SubRailT | 6D SubRailR | 6E SubRailB | 6F SubRailL |
| 70 LowRes1 | 71 LowRes2 | 72 LowRes3 | 73 LowRes4 |
| 74 MidRes1 | 75 MidRes2 | 76 MidRes3 | 77 MidRes4 |
| 78 HighRes1 | 79 HighRes2 | 7A HighRes3 | 7B HighRes4 |
| 7C GasStation1 | 7D BnBInn | 7E ConvenienceStore | 7F GasStation2 |
| 80 SmallOffice1 | 81 SmallOffice2 | 82 ComWarehouse | 83 ToyStore |
| 84 SmallIndWarehouse1 | 85 ChemicalStorage | 86 SmallIndWarehouse2 | 87 IndSubstation |
| 88 Construction7 | 89 Construction8 | 8A Abandoned1x1_1 | 8B Abandoned1x1_2 |
| 8C SmallApts1 | 8D SmallApts2 | 8E SmallApts3 | 8F MedApts1 |
| 90 MedApts2 | 91 MedCondo1 | 92 MedCondo2 | 93 MedCondo3 |
| 94 ShoppingCenter | 95 GroceryStore | 96 MedOffice1 | 97 ResortHotel |
| 98 MedOffice2 | 99 OfficeRetail | 9A MedOffice3 | 9B MedOffice4 |
| 9C MedOffice5 | 9D MedOffice6 | 9E MedWarehouse | 9F ChemProcessing2 |
| A0 SmallFactory1 | A1 SmallFactory2 | A2 SmallFactory3 | A3 SmallFactory4 |
| A4 SmallFactory5 | A5 SmallFactory6 | A6 Construction3 | A7 Construction4 |
| A8 Construction5 | A9 Construction6 | AA Abandoned2x2_1 | AB Abandoned2x2_2 |
| AC Abandoned2x2_3 | AD Abandoned2x2_4 | AE LargeApts1 | AF LargeApts2 |
| B0 LargeCondo1 | B1 LargeCondo2 | B2 OfficePark | B3 OfficeTower1 |
| B4 MiniMall | B5 TheaterSquare | B6 DriveIn | B7 OfficeTower2 |
| B8 OfficeTower3 | B9 ParkingLot | BA HistoricOffice | BB CorporateHQ |
| BC ChemProcessing1 | BD LargeFactory | BE IndThingamajig | BF MedFactory |
| C0 LargeWarehouse1 | C1 LargeWarehouse2 | C2 Construction1 | C3 Construction2 |
| C4 Abandoned3x3_1 | C5 Abandoned3x3_2 | C6 HydroPlant1 | C7 HydroPlant2 |
| C8 WindPlant | C9 GasPlant | CA OilPlant | CB NuclearPlant |
| CC SolarPlant | CD MicrowavePlant | CE FusionPlant | CF CoalPlant |
| D0 CityHall | D1 Hospital | D2 PoliceStation | D3 FireStation |
| D4 Museum | D5 BigPark | D6 School | D7 Stadium |
| D8 Prison | D9 College | DA Zoo | DB Statue |
| DC WaterPump | DD RunwayStraight | DE RunwayCross | DF Pier |
| E0 Crane | E1 CivilControlTower | E2 MilControlTower | E3 PortWarehouse |
| E4 PortBuilding1 | E5 PortBuilding2 | E6 Tarmac | E7 F15b |
| E8 Hangar1 | E9 SubwayStation | EA Radar | EB WaterTower |
| EC BusStation | ED RailStation | EE CivParkingLot | EF MilParkingLot |
| F0 LoadingBay | F1 TopSecret | F2 CargoYard | F3 MayorsHouse |
| F4 WaterTreatment | F5 Library | F6 Hangar2 | F7 Church |
| F8 Marina | F9 MissileSilo | FA Desalination | FB PlymouthArco |
| FC ForestArco | FD Darco | FE LaunchArco | FF LlamaDome |

分段语义：`0x00–0x0D` 地表覆盖；`0x0E–0x6F` 网络（电线 / 道路 / 铁路 / 隧道 / 交叉 / 高速 / 桥 / 匝道 / 地铁转换）；`0x70–0x8B` 1x1 建筑（含施工 / 废弃）；`0x8C–0xAD` 2x2；`0xAE–0xC5` 3x3；`0xC6–0xFF` 电厂 / 公共设施 / 港口与军事部件 / Arcology。多格建筑的**每一格**都写同一个 ID，锚点靠 `XZON` 角标区分。占地尺寸由 `zones-growth-demand.md` 与 `services-models.md` 的建筑表给出；导入精灵时还可用 `宽度 / 每格像素宽` 作为交叉校验（§2.6.4）。

#### 2.2.5 `XZON`（u8）[H]

| 位 | 含义 |
|---|---|
| `0x80` | 本格是建筑的 TR 角 |
| `0x40` | TL 角 |
| `0x20` | BR 角 |
| `0x10` | BL 角 |
| `0x0F` | 分区：0 无，1 轻住宅，2 密住宅，3 轻商业，4 密商业，5 轻工业，6 密工业，7 军事，8 机场，9 海港；10–15 未用 |

1x1 建筑四位全置（`0xF0 | zone`），多格建筑每格只置自己所在的角，内部格为 0。小公园为 `0xF0`。分区码 ≥ 10 导入时清 0 并告警。角标在第三方存档中可能不规范，导入后必须按 `XBLD` 连通块重建一次（zones 规格 §4）。

#### 2.2.6 `XUND`（u8）[H]

| 值 | 含义 |
|---|---|
| `0x00` | 无 |
| `0x01–0x0F` | 地铁 15 个片段，顺序同 `XBLD` 电线（LR, TB, HTB, LHR, THB, HLR, BR, BL, TL, TR, RTB, LBR, TLB, LTR, LTBR） |
| `0x10–0x1E` | 水管 15 个片段，同上顺序 |
| `0x1F` | 水管 TB × 地铁 LR |
| `0x20` | 水管 LR × 地铁 TB |
| `0x21` | 未知（1114 个城市中未出现） |
| `0x22` | 导弹井地下部分 |
| `0x23` | 地铁站 / 地铁–铁路转换件的地下部分 |
| `0x24–0xFF` | 未定义，导入清 0 并告警 |

#### 2.2.7 `XTXT`（u8）[H]

| 值 | 含义 | 指向 `XLAB`？ |
|---|---|---|
| `0x00` | 无 | – |
| `0x01–0x32` | 50 个玩家告示牌 | 是 |
| `0x33` | 未用 | – |
| `0x34–0x3C` | 共享微模拟标签：Bus、Rail、Subway、Wind、Hydro、Parks、Museum、Library、Marina | 是 |
| `0x3D–0xC8` | 139 个独立微模拟标签（每座警局 / 消防 / 医院 / 学校 / 电厂 / Arco…） | 是 |
| `0xC9–0xEF` | 39 个活动物件槽位，对应 `XTHG` 记录 1–39 | 否 |
| `0xF0–0xF9` | 未用 | – |
| `0xFA` | 邻城连接点（自动告示牌，不占 50 个配额） | 文本在 `XLAB[0xFA]` |
| `0xFB` | 毒云 | 否 |
| `0xFC` | 洪水 | 否 |
| `0xFD` | 暴乱者 | 否 |
| `0xFE` | 大暴乱人群 | 否 |
| `0xFF` | 火 | 否 |

#### 2.2.8 `XLAB`（256 × 25 B）[H]

每条：`[len: u8][text: ≤23 B ASCII][0x00][填充至 25 B]`。填充区可能是垃圾，读时只取 `len` 个字节并在首个 `0x00` 截断；写时填 0。索引含义：`0x00` 市长名；`0x01–0x32` 告示牌；`0x33` 未用；`0x34–0x3C` 共享微模拟默认名（"SimBus System"、"SimRail System"、"SimSubway"、风电、水电、"SimPark System"、"Museum"、"Library System"、"Marina"）；`0x3D–0xC8` 独立微模拟名；`0xC9–0xF9` 未用（可能有垃圾）；`0xFA` 最近一个邻城连接告示牌文本；`0xFB–0xFF` 球队名：Football、Baseball、Soccer、Cricket、Rugby。

#### 2.2.9 `XMIC`（150 × 8 B）[H]

```
[tileId: u8][stat0: u8][stat1: u16 BE][stat2: u16 BE][stat3: u16 BE]
```

记录 r（0–149）对应标签号 `0x33 + r`（r=1..9 为共享微模拟，r=10..149 为 `0x3D–0xC8` 的独立微模拟）。`tileId` 为 0 表示空槽。字段语义按建筑类型不同，由 `services-models.md` §2.6 定义；本层只做透传。

#### 2.2.10 `XTHG`（40 × 12 B）[M]

记录 0 为头部（观察到从地形模式进入城市模式时由 `0x0000` 变为 `0x0402`，最后字节恒 0），记录 1–39 对应 `XTXT 0xC9–0xEF`。

| 偏移 | 字段 | 说明 |
|---|---|---|
| 0 | `type` | 物件类型（下表） |
| 1 | `rotation` | 朝向；逆向头文件给出 8 向，0 = 北，顺时针 |
| 2 | `variant` | 修饰：`type=9` 时非 0 表示 Nessie |
| 3 | `x` | 格坐标 |
| 4 | `y` | 格坐标 |
| 5 | `z` | 离地高度（飞机 / 直升机） |
| 6–7 | `px`,`py` | 未知（像素内偏移？） |
| 8–9 | `dx`,`dy` | 未知（速度 / 目标增量？） |
| 10 | `label` | 未知 |
| 11 | `goal` | 未知 |

类型值（社区文档观察值；逆向头文件的枚举为 0–16，多出推土机与 Maxis Man，二者顺序不一定一致 [L]）：`1` 飞机、`2` 直升机、`3` 船、`4` 未知、`5` 怪兽、`6` 爆炸、`7` 警力出动、`8` 消防出动、`9` 帆船（`variant≠0` 为 Nessie）、`A` 火车头、`B` 车厢、`C/D` 地铁内列车、`E` 军事出动、`F` 龙卷风。导入时物件按原值透传并由灾害 / 交通模块各自决定是否复活（§3.4.2）。

#### 2.2.11 `XBIT`（u8）[H]

| 掩码 | 名称 | 含义 |
|---|---|---|
| `0x80` | `POWERABLE` | 可导电（有建筑 / 电线） |
| `0x40` | `POWERED` | 正在供电 |
| `0x20` | `PIPED` | 有水管可达 |
| `0x10` | `WATERED` | 正在供水 |
| `0x08` | `XVAL_MASK` | 旧版地价遮罩，忽略，写出时保留原值 |
| `0x04` | `WATER` | 被水覆盖 |
| `0x02` | `ROTATED` | 旋转 90°（码头、跑道、匝道、桥段） |
| `0x01` | `SALT` | 咸水 |

（社区文档按"bit 0 = 最高位"编号；本文一律用掩码值，与 `terrain.md`、逆向头文件一致。）

### 2.3 `MISC`（4800 B = 1200 × i32 BE）

偏移为**字节偏移**（相对 `MISC` 数据起点）。未列出的区间为 0 或未知，导入时原样保留在 `rawMisc` 中，导出时写回（§3.4.3）。

#### 2.3.1 标量字段 [H，除注明外]

| 偏移 | 名称 | 说明 |
|---|---|---|
| `0x0000` | `header` | 恒 `0x00000122`（290），写出同值 |
| `0x0004` | `cityMode` | 0 地形编辑，1 城市，2 灾害 |
| `0x0008` | `rotation` | 0–3，逆时针旋转次数 |
| `0x000C` | `yearFounded` | 建城年 |
| `0x0010` | `cityAge` | 建城以来天数；1 年 = 300 天，1 月 = 25 天：`year = founded + ⌊age/300⌋`，`month = ⌊(age mod 300)/25⌋`（0 = 1 月），`day = age mod 25` |
| `0x0014` | `money` | 资金（可负） |
| `0x0018` | `bondCount` | 债券数（≤ 50） |
| `0x001C` | `difficulty` | 0 无（地图），1 Easy，2 Medium，3 Hard |
| `0x0020` | `cityStatus` | 已获最高奖励：0 无，1 市长官邸，2 市政厅，3 雕像，4 军事基地，5 Llama Dome，6 Arco |
| `0x0024` | `cityValue` | 城市总值（口径未明） |
| `0x0028` | `landValueSum` | `Σ XVAL` |
| `0x002C` | `crimeSum` | `Σ XCRM` |
| `0x0030` | `trafficCount` | 交通计数（**不是** `Σ XTRF`） |
| `0x0034` | `pollution` | 未明 |
| `0x0038` | `fame` | 未明 |
| `0x003C` | `advertising` | 未明 |
| `0x0040` | `garbage` | 未明 |
| `0x0044` | `workforcePct` | 劳动力比例 |
| `0x0048` | `lifeExpectancy` | 全市（劳动力加权）LE；由 `services-models.md` §2.7 每月写入 |
| `0x004C` | `educationQuotient` | 全市（劳动力加权）EQ；同上 |
| `0x0050` | `nationalPop` | 国家人口 |
| `0x0054` | `nationalValue` | |
| `0x0058` | `nationalTax` | |
| `0x005C` | `nationalTrend` | 影响利率 |
| `0x0060` | `heat` | 温度（°F；报纸显示值为该值 − 100）|
| `0x0064` | `wind` | 风速 mph |
| `0x0068` | `humidity` | 降雨量 mm |
| `0x006C` | `weather` | 0 Cold, 1 Clear, 2 Hot, 3 Foggy, 4 Chilly, 5 Overcast, 6 Snow, 7 Rain, 8 Windy, 9 Blizzard, 10 Hurricane, 11 Tornado |
| `0x0070` | `disaster` | 0 none, 1 fire, 2 flood, 3 riot, 4 toxic spill, 5 (air crash, 有缺陷), 6 quake, 7 tornado, 8 monster, 9 meltdown, 10 microwave, 11 volcano, 12 firestorm, 13 mass riots, 14 mass floods, 15 pollution accident, 16 hurricane, 17 (helicopter crash, 有缺陷), 18 plane crash |
| `0x0074` | `residentialPop` | 口径未明 |
| `0x0078` | `rewardsAvailable` | 低 5 位：bit0 官邸, bit1 市政厅, bit2 雕像, bit3 Llama Dome, bit4 Arco [M（位分配）] |
| `0x0E3C` | `yearEnd` | 未明 |
| `0x0E40` | `seaLevel` | 全局海平面 0–31 |
| `0x0E44` | `terrainCoast` | 生成时勾选 Coast |
| `0x0E48` | `terrainRiver` | 生成时勾选 River |
| `0x0E4C` | `militaryBase` | 0 未提供，1 提供但无址 / 拒绝，2 陆军，3 空军，4 海军，5 导弹井 |
| `0x0FA0` | `ordinances` | 低 20 位法令开关，bit0 = 金融组第一条（位序见 `economy-budget.md` §2.x） |
| `0x0FA4` | `unemployed` | 未明 |
| `0x0FE8` | `subwayCount` | 地铁格数 |
| `0x0FEC` | `speed` | 1 暂停，2 Turtle，3 Llama，4 Cheetah，5 African Swallow |
| `0x0FF0` | `autoBudget` | |
| `0x0FF4` | `autoGoto` | |
| `0x0FF8` | `sound` | |
| `0x0FFC` | `music` | |
| `0x1000` | `noDisasters` | |
| `0x1004` | `paperDelivery` | |
| `0x1008` | `extraPaper` | |
| `0x100C` | `paperChoice` | |
| `0x1010` | 未知 | 常见 0x80 |
| `0x1014` | `zoom` | 与视图缩放 / 位置相关 |
| `0x1018` | `viewX` | 视图中心 |
| `0x101C` | `viewY` | |
| `0x1020` | `arcoPop` | Arco 人口 |
| `0x1024` | `connectionTiles` | 邻城连接格数 |
| `0x1028` | `sportsTeams` | 球队数 |
| `0x102C` | `normalPop` | 非 Arco 人口 |
| `0x1030` | `industryBonus` | 未明 |
| `0x1034` | `pollutionBonus` | 未明 |
| `0x1038` | `oldArrests` | Σ 警局微模拟逮捕数 |
| `0x103C` | `policeBonus` | 未明 |
| `0x1040` | `disasterUnknown` | 未明 |
| `0x1048` | `disasterActive` | 1 = 灾害进行中 |
| `0x104C` | `goDisaster` | 未明 |
| `0x1050` | `sewerBonus` | 未明（游戏无下水道，疑为水管） |
| `0x10B8` | 未知 | 偶见小负数 / 小正数 |

#### 2.3.2 数组字段 [H]

| 偏移区间 | 名称 | 布局 |
|---|---|---|
| `0x007C–0x016B` | `cohorts` | 240 B = **20 个 5 岁年龄队列 × 3 × i32**，布局见 §2.3.4。**不是**时间序列：dfloer 表里 "Population/Health/Education Graph Data, 20 values each, interleaved" 这一命名有误导性（"graph" 指 Population 窗口的三张按年龄分组的条形图，不是按年份的历史曲线）。本项目弃用旧名 `popGraph`；所有权归 `services-models.md` §2.7，本层只透传 |
| `0x016C–0x01EF` | `industryGraph` | 33 × i32：产业窗口三张图（比例 / 税率 / 需求，各 11 个产业）；顺序待确认（zones 规格 Q8） |
| `0x01F0–0x05EF` | `tileCounts` | 256 × i32，按 `XBLD` 值计数的格数 |
| `0x05F0–0x060F` | `zoneTileCounts` | 8 × i32：已占用格总数、?、住宅格、?、商业格、?、工业格、?（偶数项为计数，奇数项含义未明） |
| `0x0610–0x06D7` | `bonds` | 50 × i32 债券面额（原版有溢出名场面） |
| `0x06D8–0x0717` | `neighbors` | 4 × 16 B：`[index, population, value, fame]`，顺序约为左下、左上、右上、右下 [M] |
| `0x0718–0x0723` | `rciDemand` | 3 × i32：R、C、I 需求，范围 −2000..+2000 |
| `0x0724–0x0737` | 未知 | 5 × i32 |
| `0x0738–0x0778` | `techYears` | 17 × i32 发明年份：Gas、Nuclear、Solar、Wind、Microwave、Fusion、Airport、Highways、Buses、Subways、WaterTreatment、Desalination、PlymouthArco、ForestArco、Darco、LaunchArco、Highways(重复项)。存档保存时已发明的科技可能记 0 |
| `0x077C–0x08BF` | `taxBlocks` | 3 块 × 27 × i32：住宅（`0x077C`）、商业（`0x07E8`）、工业（`0x0854`），块布局见 §2.3.3 |
| `0x08C0–0x092F` | `ordinanceBlock` | 28 × i32，预算窗口法令行，内部布局未明 |
| `0x0930–0x0997` | `bondBlock` | 26 × i32：当前债券数、平均利率、利率和，然后 12 个月的（数量, 平均利率）；利率以 ×10000 存（4% → 40000） |
| `0x0998–0x0E3B` | `serviceBlocks` | 11 块 × 27 × i32（§2.3.3）：Police `0x0998`、Fire `0x0A04`、Health `0x0A70`、Schools `0x0ADC`、Colleges `0x0B48`、Roads `0x0BB4`、Highways `0x0C20`、Bridges `0x0C8C`、Rail `0x0CF8`、Subway `0x0D64`、Tunnel `0x0DD0` |
| `0x0E50–0x0EC7` | `paperList` | 30 × i32，报纸列表（6 × 5） |
| `0x0EC8–0x0F9F` | `newsList` | 54 × i32，新闻列表（9 × 6） |
| `0x0FA8–0x0FE7` | `militaryCounts` | 16 × i32：总数、直跑道 `DD`、十字跑道 `DE`、军停车场 `EF`、货场 `F2`、雷达 `EA`、仓库 `E3`、楼 1 `E4`、楼 2 `E5`、Top Secret `F1`、起重机 `E0`、军塔台 `E2`、F-15 `E7`、小机库 `E8`、大机库 `F6`、导弹井 `F9` |
| `0x1054–0x10B7` | 零 | |
| `0x10BC–0x12BF` | 零 | |

#### 2.3.3 27 × i32 预算块布局 [H]

| 下标 | 税率块 | 服务块 |
|---|---|---|
| 0 | 当前被征税人口 | 当前该类建筑数 |
| 1 | 当前税率 0–20 | 当前经费 % 0–100 |
| 2 | 未明 | 未明 |
| 3,5,…,25 | 1–12 月人口 | 1–12 月建筑数 |
| 4,6,…,26 | 1–12 月税率 | 1–12 月经费 % |

公交站没有经费设置，因此没有块。

#### 2.3.4 年龄队列块 `0x007C–0x016B`（20 × 12 B）[H（区间长度、队列语义）/ M（三元组内字段顺序）]

| 偏移 | 字段 | 说明 |
|---|---|---|
| `0x007C + 12k + 0` | `count_k` | 队列 k 的人数 `N_k` |
| `0x007C + 12k + 4` | `eqSum_k` | 队列 k 的教育点数总和（显示值 `EQ_k = eqSum_k / count_k`） |
| `0x007C + 12k + 8` | `leSum_k` | 队列 k 的预期寿命总和（显示值 `LE_k = leSum_k / count_k`） |

- `k = 0..19`，队列 k 覆盖年龄 `5k .. 5k+4`（0–4、5–9、…、95–99）。`20 × 12 = 240 B`，与区间长度 `0x016C − 0x007C = 0xF0` 恰好吻合，这也是"不是 60 点时间序列"的旁证之一（另两条：原版 Population 窗口横轴是年龄分组；按年份的历史曲线全部在 `XGRP`，其中 City Size / Health / Education 三条已经是"人口 / LE / EQ 随时间"）。
- 三个字段都是非负整数；`services-models.md` 写作 u32，本文按 §1.2 统一以 i32 读写（值 < 2^31 时二者等价，溢出由 services 的 `popCap` 保证不会发生）。
- **更新者只有一个**：`services-models.md` §2.7 `runDemographics`（每月第 21 天）。导入时本层把 60 个 i32 整块拷贝为 `DemographicsState.cohorts[20] = { count, eqSum, leSum }`；导出时由 services 回填。经济模块（`economy-budget.md`）不读写该区间，也不存在"每年 1 月推入"的逻辑。
- Population 窗口（`ui-art.md` §2.5）的三张条形图即按队列显示 `count_k`、`LE_k`、`EQ_k`（`count_k = 0` 时后两者显示 0）。
- **字段顺序置信度 [M]**：dfloer 的标签顺序是 Population → Health → Education，若按字面"交错"应为 `[count, leSum, eqSum]`；本项目采用 `services-models.md` §2.7（对原版的还原）的 `[count, eqSum, leSum]`。两种顺序只在 `+4 / +8` 两列互换，读写代码必须通过 §3.4.4 的 `cohortOffset()` 访问而不要散写字面偏移，以便核对后一处改定。核对方法见 §5.14。

### 2.4 低分辨率图层与 `XGRP`

#### 2.4.1 64×64 与 32×32 图层 [H]

```
idx64 = (x >> 1) * 64 + (y >> 1)      // XTRF XPLT XVAL XCRM：每格覆盖 2×2 地块
idx32 = (x >> 2) * 32 + (y >> 2)      // XPLC XFIR XPOP XROG：每格覆盖 4×4 地块
```

`XROG` 以 `0x7F` 为"无变化"，`> 0x82` 增长（绿），`< 0x7D` 衰退（红）。`XVAL` 显示时按 1 起始。

#### 2.4.2 `XGRP`（16 × 52 × i32）[H]

每条曲线 208 B：12 个月值（1 年）、20 个半年值（10 年）、20 个五年值（100 年）。顺序：City Size、Residents、Commerce、Industry、Traffic、Pollution、Value、Crime、Power %、Water %、Health、Education、Unemployment、GNP（千）、National Pop（千）、Fed Rate。

### 2.5 情景扩展 chunk（概述）[H]

#### 2.5.1 `TEXT`
`[kind: u32 BE][text…]`，`kind = 0x80000000` 为选择画面简介，`0x81000000` 为开局长说明；行尾为 CR（`0x0D`），导入时转换为 `\n`。长度上限未知。

#### 2.5.2 `SCEN`（56 B，有时 52 B）
`[0x80000000][disaster: u16][dx: u8][dy: u8][timeLimitMonths: u16]` 之后 9 个 i32 目标 / 上限：citySize、resPop、comPop、indPop、cash、landValue、pollutionMax、crimeMax、trafficMax；再 `[bld1: u8][bld2: u8][bld1Tiles: u16][bld2Tiles: u16]`，可选 4 B 零填充。目标语义见 `disasters-events.md`。

#### 2.5.3 `PICT`
`[0x80000000][w: u16 LE][h: u16 LE]`，随后 h 行、每行 `w + 1` 字节（末字节 `0xFF` 行终止，新文件为 0）。观察到的图为 65×65 含 1 px 边框。像素值 v 到调色板索引：`v = 0 → 黑`，`v = 254 → (127,127,127)`，其余 `index = (v + 16) & 0xFF`，用 `PAL_MAC.BMP`（或 `PAL_MSTR.BMP`）查色 [M]。

#### 2.5.4 `TMPL`（338 B）
Pascal 字符串 + 4 字符类型码的列表，描述 `SCEN` 字段；无游戏功能，导入忽略，导出不写。

### 2.6 Win95 精灵文件

#### 2.6.1 文件结构 [H]

```
偏移  长度   内容
0     2      u16 BE  count   索引条目数
2     10×n   索引条目：
              [id: u16 BE][offset: u32 BE 绝对偏移][height: u16 BE][width: u16 BE]
...   ...    精灵数据（按索引 offset 定位；条目 i 的数据长度 = offset[i+1] − offset[i]，末条到文件尾）
```

- 同一 ID 可能出现两次。唯一的一手描述（dfloer sprite spec）是"第二个条目是伪条目（spurious），可忽略"，即**以先出现者为准**；本项目默认采用这一策略，后续重复条目不覆盖、只记入 `duplicates` 诊断 [M]（单一来源；原版可执行文件与社区解析器实际取哪一份本文**未核实**，此前写的"后者为准 [H]"没有依据，已撤回）。解析器提供 `duplicatePolicy: 'first' | 'last'`（默认 `'first'`），并在诊断里给出两份条目是否字节相同，核对方法见 §5.15。
- 索引通常按偏移递增排列，但解码器不得依赖：按 offset 排序后再算长度。
- 宽或高 > 4096、offset 超出文件、`2 + 10n > 文件长` 都视为文件损坏（§3.9.4 错误码）。

#### 2.6.2 像素行编码 [H]

精灵数据是**行**的序列。每行：

```
[rowLen: u8][0x01]  后接 rowLen 字节的块序列
块 = [n: u8][mode: u8] (+ 载荷)
```

| mode | 含义 | 载荷 |
|---|---|---|
| 0 | 空块，忽略 | 无（整块 2 B） |
| 1 | 行头（只出现在行首，`n` = 本行剩余字节数） | – |
| 2 | 精灵结束 | 无 |
| 3 | 从当前列起**跳过** n 个透明像素 | 无 |
| 4 | n 个像素的调色板索引 | n 字节，**n 为奇数时再跟 1 个填充字节 `0x00`** |

规则：
- 每行像素游标从 0 开始；mode 3/4 推进游标；行末剩余列全透明。
- `rowLen = 0` 表示空白行（整行透明），仍占 2 字节。
- 行头位置若 mode 为 2（`xx 02`），精灵结束。MIF 中结束标志写成一整行 `02 01 02 02`（行头 len=2，内容为一个 mode 2 块）；.DAT 中两种写法都要能识别 [H]。
- 行数达到 `height` 或数据用尽也视为结束（容错）。
- **透明不是调色板索引**，`0x00` 是合法像素（黑）。透明只来自 mode 3 跳过与行尾 / 空行。
- `.DAT` 中 mode 4 奇数长度一定有填充；SCURK 生成的 MIF 偶尔缺填充（§2.8），解码器用 `allowUnpaddedOddRuns` 开关处理。

#### 2.6.3 精灵 ID 方案 [H（0–290 与缩放基址）/ M（291 以后）]

三级缩放共用一套"相对号" n，文件内 ID = 基址 + n：

| 缩放级 | 基址 | 所在文件 | 1x1 地块精灵宽 × 高 | 每海拔级像素 |
|---|---|---|---|---|
| small | 0 | `SMALLMED.DAT`（+ `SPECIAL.DAT`） | 8 × 5 | 3 |
| medium | 500 | `SMALLMED.DAT`（+ `SPECIAL.DAT`） | 16 × 9 | 6 |
| large | 1000 | `LARGE.DAT` | 32 × 17 | 12 |

（OpenSC2K 的单元测试断言 large 平地精灵 1256 为 32×17；旧版 JS OpenSC2K 以 2× 放大渲染，所以其常量是 64×32 / 每级 24 px——`terrain.md` §6 引用的正是那套 2× 数值，渲染模块换算时注意。）

相对号 n 的分配（由逆向头文件的枚举顺序推出；0–290 段另有 OpenSC2K 测试 `1256 / 1270 / 1290` 与 `1045 / 1072` 直接佐证）：

| n | 内容 | 数量 |
|---|---|---|
| 0–255 | **与 `XBLD` 同号**的地表 / 网络 / 建筑精灵（n=0 Clear 无精灵，LARGE 实际 ID 从 1001 起） | 256 |
| 256–269 | 干地坡面 14 种（`XTER` 低 nibble 0–13；269 = bedrock） | 14 |
| 270–283 | 水面形状 14 种（对应岸边 / 浅水形状码 0–13；283 为孤立水块） | 14 |
| 284 | 瀑布 | 1 |
| 285–290 | 溪流 L–R、T–B，水湾 B、L、T、R | 6 |
| 291–299 | 9 种分区底色（轻/密 R、C、I，军事，机场，海港） | 9 |
| 300–304 | 地块着色（绿、蓝、黄、红、灰） | 5 |
| 305–318 | 地下视图地形（基底 + 8 变体 + 4 坡 + bedrock 轮廓） | 14 |
| 319–333 | 地铁轨道 15 段 | 15 |
| 334–348 | 水管 15 段 | 15 |
| 349–350 | 地铁 × 水管交叉 2 种 | 2 |
| 351–353 | 建筑下水管、导弹井地下、地铁入口 | 3 |
| 354–358 | 轮廓（绿、蓝、棕、红、灰） | 5 |
| 359–378 | 载具各 5 向：飞机 359–363、直升机 364–368、货船 369–373、火车 374–378 | 20 |
| 379 | Nessie | 1 |
| 380–381 | 帆船 2 向 | 2 |
| 382–384 | 出动图标：警、消、军 | 3 |
| 385–386 | 怪兽射线、断电图标 | 2 |
| 387–389 | 爆炸 3 帧 | 3 |
| 390–391 | 推土机 2 向 | 2 |
| 392–395 | 尘云 4 帧 | 4 |
| 396–399 | 火 4 帧 | 4 |
| 400–? | 交通叠加层（道路 / 高速 / 堤道 / 匝道 / 立交，各轻 / 重两档） | 约 40–50 |
| 随后依次 | 通水水管与组合 18、密度叠加 8、绿加号 / 红减号 2、怪兽部件 14、洪水 1、暴乱者 2、Maxis Man 1、通用尘云 1、龙卷风 3 | 50 |
| ≤ 499 | 块上限（medium 从 500 开始） | |

> 291 以后的号段只有顺序与数量有把握，**实现必须以玩家文件的实际索引为准**：`ids.ts` 只硬编码 0–290，其余通过"按顺序扫描 ID 空洞 + 期望尺寸校验"在导入时自动对齐，并把对齐结果写进缓存清单（§3.7.2）。

#### 2.6.4 尺寸约定与锚点 [M]

- n×n 占地建筑在 large 级宽度为 `32n`（SCURK 观察到 8/16/24/32/48/64/96/128 px 等宽度，对应三级缩放下 1x1–4x4）。因此 `footprint = width / tileWidth(zoom)` 可用于校验建筑表。
- 高度不定（高楼可达数百 px）。精灵左边缘对齐占地菱形的最左顶点，底边对齐最下顶点所在行（含 1 px 重叠行）；精确锚点由渲染规格验收，本文只要求解码器保留原始 `width/height`，不做裁切。

#### 2.6.5 `SPECIAL.DAT` [L]

ID 全部 < 1000，与 `SMALLMED.DAT` 同一号段，是额外 / 替换的小中号精灵。导入时三个文件合并进同一张 `Map<id, SpriteEntry>`：先 `SMALLMED`，后 `SPECIAL`，**跨文件**同号由 `SPECIAL` 覆盖并记入诊断。这是显式的文件分层策略，与 §2.6.1 **文件内**重复条目的 `duplicatePolicy`（默认取第一个）是两回事，不要共用一个开关。

### 2.7 调色板 `PAL_MSTR.BMP` 与色循环

#### 2.7.1 BMP 读取 [H]

标准 8 bpp Windows BMP：

| 偏移 | 字段 | 期望 |
|---|---|---|
| 0 | `"BM"` | 必须 |
| 2 | u32 LE 文件长 | 与实际一致（容错：只警告） |
| 10 | u32 LE `bfOffBits` | 像素数据偏移 |
| 14 | u32 LE `biSize` | 40 |
| 18 / 22 | i32 LE 宽 / 高 | 16 / 16 |
| 28 | u16 LE `biBitCount` | **8** |
| 30 | u32 LE `biCompression` | 0 |
| 46 | u32 LE `biClrUsed` | 0 或 256 |
| 54 | 颜色表 | 256 × `[B, G, R, 0]` = 1024 B |

我们只用颜色表；像素区（16×16，自下而上）应为恒等索引，不依赖。`palette[i] = (R, G, B)`，精灵像素值 i 直接查表（社区文档的"高 nibble 行、低 nibble 列"即 `i = row*16 + col`）。

#### 2.7.2 索引分段 [H]

| 索引 | 用途 |
|---|---|
| 0–15 | Windows 系统色 / 保留，精灵不用 |
| 16–170 | 静态颜色 |
| 171–219（`0xAB–0xDB`） | **快速循环段**，49 个条目，分 8 组（下表） |
| 220–223 | 静态 / 未用 |
| 224–239（`0xE0–0xEF`） | **慢速循环段**，16 个条目 = 8 对闪烁色 |
| 240–255 | 系统色 / 保留 |

#### 2.7.3 快速循环的分组与方向 [H（分组、方向：来自 OpenSC2K 的 49 项置换表与测试）]

每一步（tick）后，索引 i 显示的颜色变为"上一步时索引 `next(i)` 的颜色"：

| 组 | 索引 | 条目数 | 方向 | `next(i)` | 用途（观察）|
|---|---|---|---|---|---|
| A | `0xAB–0xB2` | 8 | 正向 | `i+1`，末项回首 | 灰蓝短循环（水面闪光） |
| B | `0xB3–0xBA` | 8 | 正向 | 同上 | 灰黑（烟 / 传送带） |
| C | `0xBB–0xC2` | 8 | 正向 | 同上 | 灰蓝长循环（水） |
| D | `0xC3–0xC6` | 4 | 正向 | 同上 | 棕红黄黑（火 / 熔炉） |
| – | `0xC7` | 1 | 静止 | `i` | |
| E | `0xC8–0xCF` | 8 | **反向** | `i−1`，首项回末 | 蓝（水流） |
| F | `0xD0–0xD3` | 4 | 反向 | 同上 | 蓝 |
| G | `0xD4–0xDB` | 8 | 反向 | 同上 | 灰棕（跑道灯 / 车流） |

慢速段 `0xE0–0xEF`：按对 `(E0,E1) (E2,E3) … (EE,EF)` 交换，即红 / 黄 / 绿 / 蓝等闪烁灯 [M]。OpenSC2K 的测试还记录了原版可执行文件在该表末项上的一个怪癖（`0xEF` 第二步映到 `0xE1`），本项目不复刻。

#### 2.7.4 节拍 [L]

原版用一个定时器：快速段每 tick 推进 1 步，慢速段每 8 tick 交换一次（OpenSC2K 测试的 tick 关系）。tick 的实际时长无一手数据；SCURK 的预览用 55 ms 定时器、每 5 次推进快速段、每 30 次推进慢速段（≈ 0.275 s / 1.65 s）。本项目默认 `FAST_STEP_MS = 125`、`SLOW_EVERY_FAST_STEPS = 8`（即 1 s 闪烁一次），放在常量表，待实机比对后调整。

`PAL_STTC.BMP` 在所有循环索引处为黑色：若玩家同时导入了它，可用 `PAL_STTC[i] == (0,0,0) && PAL_MSTR[i] != (0,0,0)` 自动核对循环集合，与上表不符时写诊断。

### 2.8 MIF（SCURK 导出）简述 [M]

IFF 容器：`"MIFF"[len u32 BE]"SC2K"`，随后 chunk：

- `INFO`：RLE 压缩，解压后 `0x72` 字节，含来源路径 / SCURK 版本等，忽略。
- `TILE`：**未压缩**。`[len: u32][count: u16]` 后是 `NAME` / `SHAP` 子记录：
  - `NAME`：`[len u32][? u8][xbldId u8][? u8][nameLen u8][ASCII ≤ 22]`，改建筑显示名。
  - `SHAP`：`[len u32][? u8][xbldId u8][width u8][height u8][pixelLen u32]` + 像素数据，编码同 §2.6.2，结束行为 `02 01 02 02`；mode 4 奇数长度**可能无填充**。

导入 MIF 只覆盖 `n = xbldId` 的 large 精灵（SCURK 只画 large）；三级缩放中的 small/medium 由我们按 1/2、1/4 最近邻缩小生成 [L]。MIF 是可选功能，优先级最低。

### 2.9 文本 / 报纸数据（概述，可选导入）

#### 2.9.1 `DATA_USA.IDX` 与 `DATA_USA.DAT` [H]

`IDX` 为 6 条 8 B 记录 `[id: u32 LE][offset: u32 LE]`，`offset` 是 `DAT` 内的段起点；段 k 的范围是 `[offset_k, offset_{k+1})`，末段到文件尾。

| id | 段 | 长度 | 内容 |
|---|---|---|---|
| `0x3E8` | Group Start | 500 | u16 BE × 250：每组首词元序号（**1 起始**） |
| `0x3E9` | Group Count | 500 | u16 BE × 250：每组词元数；(0,0) 对为空组 |
| `0x3EA` | Token Pointer | 10000 | u32 BE × 2500：词元在 Token Data 内的偏移；0 为空 |
| `0x3EB` | Token Data | 149227 | 词元字节流，每个以 `0x00` 结束 |
| `0x3EC` | Story Power | 160 | 未明 |
| `0x3ED` | Story Decay | 160 | 未明 |

#### 2.9.2 词元解压（字节 → 文本）[H]

`0x20–0x7D` 为 ASCII 本身，例外：`0x3D` = `{CITYNAME}`、`0x3E` = `{TEAMNAME}`、`0x7E` = `{MAYORNAME}`、`0x7F` = `wi`。其余非空映射：

| 字节 | 双字母 | 字节 | 双字母 | 字节 | 双字母 | 字节 | 双字母 |
|---|---|---|---|---|---|---|---|
| 01 th | 02 in | 03 re | 04 to | 05 an | 06 at | 07 er | 08 st |
| 09 en | 0A on | 0B of | 0C te | 0D ed | 0E ar | 0F is | 10 ng |
| 11 me | 12 co | 13 ou | 14 al | 15 ti | 16 es | 17 ll | 18 he |
| 19 ha | 1A it | 1B ca | 1C ve | 1D fo | 1E de | 1F be | 9E le |
| 9F or | A9 ma | AA li | AB we | AC ne | AE se | AF nt | B0 wa |
| B1 wh | B2 pr | B3 si | B4 as | B8 nd | B9 po | BA la | BB no |
| BC ce | BD fi | BE yo | BF do | C0 di | C1 mo | C2 bu | C3 ho |
| C4 ea | C5 un | C8 io | C9 pa | CA ra | CB ke | CC lo | CD ly |
| CE ri | CF sh | D9 pe | DA ch | DB tr | DC ci | DD hi | DF so |
| EE su | EF rt | F0 ta | F1 ge | F2 rs | F3 ow | F4 us | F5 ss |
| F6 sp | F7 ac | F8 il | F9 ic | FA pl | FB fe | FC wo | FD da |
| FE ai | FF ur | | | | | | |

未列出的 `0x80–0xFF` 为空串；`0x00` 为终止。

转义（紧跟 1 字节参数 = 词组号）：`[` 从该词组随机取一个并在整篇内保持一致；`^` 同 `[` 但作为第二个独立实例（如两国名）；`@` 同 `[`（外国姓）；`*` 每次出现独立随机；`%N` 生成 1..N 的随机数（可叠加、可含千位分隔符，Win95 版有越界 bug）；`<N` 同 `%`，用于伤亡人数；`$%` 由联邦利率填入；字面 `x%` 不替换。

排版：首个 `+` 之前为标题（Title Case，末尾加 ` -`）；单个 `-` 为段落起点；`.` 后首字母大写；`--` 在 Miss Sim 问答中为两个换行，正文中原样。

#### 2.9.3 词组表 [H]

故事组 `0x00–0x42`（66 组）：

| 值 组 | 值 组 | 值 组 |
|---|---|---|
| 00 genweatherstory | 17 disasterflood | 2E needpower |
| 01 sciencestory | 18 disasterplane | 2F needroad |
| 02 foundingstory | 19 disasterhelicopter | 30 needpolice |
| 03 genpopulationstory | 1A disastertornado | 31 needfire |
| 04 invention2story | 1B disasterearthquake | 32 needwater |
| 05 inventionstory | 1C disastermonster | 33 needhospital |
| 06 warstory | 1D disastermeltdown | 34 needschool |
| 07 businessstory | 1E disastermicrowave | 35 needseaport |
| 08 sportsstory | 1F disastervolcano | 36 needairport |
| 09 fedrateupstory | 20 disasterspill | 37 needzoo |
| 0A fedratedownstory | 21 disastermajorspill | 38 needstadium |
| 0B nationalpolitical | 22 disasterhurricane | 39 needmarina |
| 0C internationalstory | 23 disasterriot | 3A needpark |
| 0D gendisasterstory | 24 oldpowerplant | 3B needseaport2 |
| 0E healthstory | 25 fundprison | 3C needconnections |
| 0F localpoliticalstory | 26 fundeducation | 3D lowcrime |
| 10 highcrime | 27 fundtransit | 3E highrating |
| 11 hightraffic | 28 treeremoval | 3F lowpollution |
| 12 highpollution | 29 gennewordinancestory | 40 higheducation |
| 13 loweducation | 2A genrichopinionstory | 41 highhealth |
| 14 lowhealthcare | 2B genrichgripestory | 42 lowunemployment |
| 15 highunemployment | 2C genopiniongripe | |
| 16 disasterfire | 2D missimquestion | |

复合词组 `0x43–0x6A`（40 组，顺序）：ordinance, ordinanceopinion, otherfire, otherflood, otherrailcrash, othertornado, otherearthquake, othermonster, foundingreaction, populationstory, reaction, missimanswer, gripeclosing, weatherreport, weatherprediction, richopinion, richgripe, opiniongripe, gripe1–gripe7, traffic, pollution, crime, taxes, employment, education, health, articlepointers, ordinanceheadline, weatherheadline, populationheadline, gripeheadline1–3, disasterheadline。

简单词组 `0x6B–0xCD`（99 组，顺序）：destroyverb, creationverb, pastcreationverb, fireverb, increase, verb1, verb2, futureverb, makeverb, pastmakeverb, makenoun, response, utterance, feeling, scareverb, violentverb, pastviolentverb, observedverb, angerverb, presentverb1, want, pastwant, negativeverb, pastverb, thingdescriptor, adjective, adverb1, adverb2, time, negativefeeling, animal, negativeadjective, bodypart, disaster, bignumber, locals, localgov, landmark, othercity, localcity, response3, shortsaying, action1, action2, country, criminal, crimetype, infrastructure, direction, illness2, exclamation, expert, emotion, compete, malename, femalename, foreignfirstname, foreignlastname, 2xforeignname, name, ngo, room, numericposition, invention, invention2, politicalissue, product, size, title, lname, legalthing, llama, illness, amount, importantperson, moneything, moneyevent, money, month, positive, numberword, noun, job, territory, powertype, relative, smalladjective, sport, injury, sportscore, teamname, business, location, research, badthing, waterbody, group, governmentthing, weathercondition。

#### 2.9.4 `TEXT_USA.IDX/.DAT` [H]
`IDX` 为 N 条 `[id: u32 LE][offset: u32 LE]`，按出现顺序切分 `DAT`（末段到文件尾），内容为 ASCII（偶有 >127 字节，丢弃）。`id 128` 为制作人员名单。我们不依赖它。

---

## 3. 数据结构与算法建议

### 3.1 二进制工具

```ts
export class ByteReader {
  constructor(public readonly view: DataView, public pos = 0) {}
  u8(): number; u16be(): number; u16le(): number; u32be(): number; u32le(): number; i32be(): number;
  ascii(n: number): string;            // 不做 UTF-8 解码
  bytes(n: number): Uint8Array;        // subarray，不拷贝
  get remaining(): number;
}
export class ByteWriter { /* 对称；自动增长；toArrayBuffer() */ }
```

越界读取一律抛 `RangeError`，由上层转为 `ImportError`（§3.9.4）。

### 3.2 `.SC2` 读写接口

```ts
export type ChunkId = 'CNAM'|'MISC'|'ALTM'|'XTER'|'XBLD'|'XZON'|'XUND'|'XTXT'|'XLAB'|'XMIC'|'XTHG'|'XBIT'
  |'XTRF'|'XPLT'|'XVAL'|'XCRM'|'XPLC'|'XFIR'|'XPOP'|'XROG'|'XGRP'|'TEXT'|'SCEN'|'PICT'|'TMPL';

export const CHUNK_SIZES: Readonly<Record<Exclude<ChunkId,'TEXT'|'SCEN'|'PICT'|'TMPL'>, number>> = {
  CNAM: 32, MISC: 4800, ALTM: 32768, XTER: 16384, XBLD: 16384, XZON: 16384, XUND: 16384, XTXT: 16384,
  XLAB: 6400, XMIC: 1200, XTHG: 480, XBIT: 16384, XTRF: 4096, XPLT: 4096, XVAL: 4096, XCRM: 4096,
  XPLC: 1024, XFIR: 1024, XPOP: 1024, XROG: 1024, XGRP: 3328,
};
export const UNCOMPRESSED: ReadonlySet<ChunkId> = new Set(['CNAM','ALTM','TEXT','SCEN','PICT','TMPL']);
export const WRITE_ORDER: readonly ChunkId[] = ['CNAM','MISC','ALTM','XTER','XBLD','XZON','XUND','XTXT','XLAB',
  'XMIC','XTHG','XBIT','XTRF','XPLT','XVAL','XCRM','XPLC','XFIR','XPOP','XROG','XGRP','TEXT','SCEN','PICT','TMPL'];

/** 解压后的原始 chunk 集合：导入 / 导出的中间表示，与内部状态解耦 */
export interface Sc2Document {
  cityName: string;                         // ≤ 31 ASCII
  misc: Int32Array;                         // 1200
  altm: Uint16Array;                        // 16384
  xter: Uint8Array; xbld: Uint8Array; xzon: Uint8Array; xund: Uint8Array; xtxt: Uint8Array; xbit: Uint8Array;
  xlab: Uint8Array;                         // 6400，访问器 getLabel(i)/setLabel(i,s)
  xmic: Uint8Array;                         // 1200
  xthg: Uint8Array;                         // 480
  xtrf: Uint8Array; xplt: Uint8Array; xval: Uint8Array; xcrm: Uint8Array;   // 4096
  xplc: Uint8Array; xfir: Uint8Array; xpop: Uint8Array; xrog: Uint8Array;   // 1024
  xgrp: Int32Array;                         // 832
  scenario?: { texts: { kind: number; text: string }[]; scen: Uint8Array; pict?: Uint8Array; tmpl?: Uint8Array };
  unknownChunks: { id: string; data: Uint8Array }[];   // 原样保留并在导出时追加（可选）
}

export interface Diagnostic { level: 'info'|'warn'|'error'; code: string; message: string; at?: string }
export interface ReadResult<T> { value: T; diagnostics: Diagnostic[] }

export function readSc2(buf: ArrayBuffer, fileName?: string): ReadResult<Sc2Document>;
export function writeSc2(doc: Sc2Document): ArrayBuffer;
```

### 3.3 伪代码

#### 3.3.1 容器

```
parseIff(buf):
  r = ByteReader(buf)
  if ascii(0,4) != "FORM":
     if ascii(0x80,4) == "FORM": buf = buf.slice(0x80); (Mac) 重试
     elif bytes[0..2] == 00 0D and ascii(0x41,8) == "CITYMCRP": throw UNSUPPORTED_CLASSIC
     else throw NOT_SC2
  declared = u32be(4) + 8
  if declared != buf.byteLength: warn SIZE_MISMATCH（继续，以实际长度为准，取 min）
  if ascii(8,4) != "SCDH": throw NOT_SC2
  pos = 12; chunks = []
  while pos + 8 <= end:
     id = ascii(pos,4); size = u32be(pos+4); pos += 8
     if 任一字符 ∉ [0x20,0x7F]: throw BAD_CHUNK_ID(pos)
     if pos + size > end: warn TRUNCATED_CHUNK; size = end - pos
     chunks.push({id, data: bytes(pos,size)}); pos += size
  return chunks
```

#### 3.3.2 RLE

```
rleDecode(src, expected?):
  out = Uint8Array(expected ?? src.length*2) (可增长); n = 0; i = 0
  while i < src.length:
     c = src[i++]
     if 1 <= c <= 127:
        if i + c > src.length: warn TRUNCATED_RUN; c = src.length - i
        copy src[i..i+c) → out[n..); n += c; i += c
     elif c >= 129:
        if i >= src.length: warn TRUNCATED_RUN; break
        b = src[i++]; fill out[n..n+(c-127)) = b; n += c-127
     else: warn BAD_RLE_CONTROL(c)      // 0x00 / 0x80
  if expected != null and n != expected:
     warn RLE_LENGTH(id, n, expected); 截断或补 0 至 expected
  return out[0..expected ?? n)

rleEncode(src):
  out = []; lit = []
  flushLit(): while lit 非空: k = min(127, lit.length); out.push(k, ...lit.splice(0,k))
  i = 0
  while i < src.length:
     j = i; while j < src.length and src[j] == src[i] and j - i < 128: j++
     run = j - i
     if run >= 2: flushLit(); out.push(127 + run, src[i]); i = j
     else: lit.push(src[i]); i++
  flushLit()
  return Uint8Array(out)
```

编码器永不产生 `0x00/0x80`；重复串超过 128 自动切段；可用性质 `rleDecode(rleEncode(x)) == x` 做属性测试（随机 / 全同 / 交替三类输入）。

#### 3.3.3 `readSc2`

```
readSc2(buf, fileName):
  chunks = parseIff(buf); diag = []
  doc = 全部字段按 CHUNK_SIZES 预分配并清零
  for ch in chunks:
     data = UNCOMPRESSED.has(ch.id) ? ch.data : rleDecode(ch.data, CHUNK_SIZES[ch.id])
     switch ch.id:
       CNAM: doc.cityName = readCName(data)         // 跳过首字节，到首个 0 为止，≤31
       MISC: doc.misc = Int32Array 1200, 逐个 i32be
       ALTM: Uint16Array 16384, 逐个 u16be
       XGRP: Int32Array 832, 逐个 i32be
       TEXT: scenario.texts.push({kind: u32be(0), text: ascii(4..).replace(/\r/g,'\n')})
       SCEN/PICT/TMPL: 原样存
       其它 X***: 直接 Uint8Array
       未知: unknownChunks.push
  if 缺少 MISC / ALTM / XTER / XBLD: throw MISSING_CHUNK
  if doc.cityName == '': doc.cityName = basename(fileName).toUpperCase().slice(0,31)
  if misc[0] != 0x122: warn MISC_HEADER
  校验: Σ xval == misc[0x28/4] 否则 info CHECKSUM_XVAL; Σ xcrm == misc[0x2C/4] 同理
  return {value: doc, diagnostics}
```

#### 3.3.4 `writeSc2`

```
writeSc2(doc):
  w = ByteWriter(); w.ascii("FORM"); w.u32be(0 /*占位*/); w.ascii("SCDH")
  for id in WRITE_ORDER:
     raw = serializeChunk(doc, id)       // 无则跳过（情景 chunk 仅在 scenario 存在时）
     if raw == null: continue
     body = UNCOMPRESSED.has(id) ? raw : rleEncode(raw)
     w.ascii(id); w.u32be(body.length); w.bytes(body)
  patch u32be at 4 = w.length - 8
  return w.toArrayBuffer()
```

`CNAM` 序列化：`[0x1F][name ASCII ≤31][0 填充至 32]`。`TEXT` 写两次（kind 0x80000000、0x81000000），文本内 `\n` 转回 `\r`。

### 3.4 与内部状态的映射

#### 3.4.1 原则
内部 `CityState` 的地块层**直接使用与存档同编码的类型化数组**（`xter/xbld/xzon/xund/xtxt/xbit: Uint8Array(16384)`，`alt/waterLevel/tunnel` 由 `ALTM` 拆出的三个 `Uint8Array`），派生结构（建筑实例表、电网 / 水网 / 路网图、微模拟对象、灾害状态机）在导入后 `rebuild()`。这样导入是 O(1) 拷贝、导出是 O(1) 拼装，各模块规格也都是按这些层写的。

#### 3.4.2 导入步骤（顺序敏感）

| 步 | 动作 | 负责模块 / 规格 |
|---|---|---|
| 1 | `readSc2` → `Sc2Document` | 本文 |
| 2 | 地形：`ALTM` 拆位；以 `XTER` 修正 `waterLevel/XBIT.WATER`；未定义 `XTER` 码 → 0 | `terrain.md` §3.7 |
| 3 | 清洗：`XZON` 低 nibble ≥ 10 → 0；`XUND ≥ 0x24` → 0；`XBIT.XVAL_MASK` 保留 | 本文 |
| 4 | 角标重建：按 `XBLD` 连通块重写 `XZON` 高 nibble | `zones-growth-demand.md` §4 |
| 5 | 建筑实例 / 微模拟：扫描 TL 锚点，绑定 `XTXT → XMIC/XLAB` | `services-models.md` §3.4 |
| 6 | 网络重建：电 / 水 / 路 / 轨 / 高速 / 地铁 / 桥 / 邻城连接（`XTXT 0xFA`） | `power-water.md`、`transport-traffic.md` |
| 7 | 经济：`MISC` 的资金 / 债券 / 税率块 / 服务块 / 法令位 / 科技年份 / 邻城 → `EconomyState` | `economy-budget.md` §3 |
| 8 | 灾害：`MISC[0x70] / [0x1048]`、`XTXT 0xFB–0xFF`、`XTHG` → 灾害状态机；未识别物件丢弃 | `disasters-events.md` |
| 9 | 低分辨率层直接拷贝；`cohorts`（`0x007C`，§2.3.4）+ `0x0044/0x0048/0x004C` → `DemographicsState` | `services-models.md` §2.7 |
| 9b | `XGRP` → 16 条历史曲线 | `economy-budget.md` §2.14 |
| 10 | 视图：`rotation / zoom / viewX / viewY / speed / 自动预算等` → UI 状态 | app |

#### 3.4.3 导出步骤

1. 由 `CityState` 回填 `Sc2Document`：地块层直接引用；`ALTM = alt | waterLevel<<5 | tunnel<<10`（无水格 `waterLevel = alt`）。
2. 重新计算 `MISC` 的派生计数：`tileCounts[256]`、`zoneTileCounts`、`Σ XVAL`、`Σ XCRM`、`subwayCount`、`militaryCounts`、`arcoPop/normalPop`、`connectionTiles`、`sportsTeams`；年龄队列块 `0x007C–0x016B` 由 `DemographicsState.cohorts` 按 §2.3.4 布局回填（services 所有）；其余字段从 `EconomyState` 等写回。
3. 导入时保留的 `rawMisc`（`Int32Array` 副本）作为底稿：所有**我们不理解的偏移**原值写回，保证"导入→导出"对第三方存档尽量无损。
4. `XTHG` 只写我们能表示的物件，其余槽位清 0，并同步清掉 `XTXT 0xC9–0xEF` 中失效的指针。
5. 单元测试：对任一手工构造的样例城市做 `readSc2(writeSc2(doc))` 深比较；对 `rleEncode` 做属性测试；对 `MISC` 做"偏移常量表无重叠且全部 4 字节对齐"的静态测试。

#### 3.4.4 `MISC` 访问器

```ts
export const MISC = {
  header: 0x0000, cityMode: 0x0004, rotation: 0x0008, yearFounded: 0x000C, cityAge: 0x0010, money: 0x0014,
  bondCount: 0x0018, difficulty: 0x001C, cityStatus: 0x0020, cityValue: 0x0024, landValueSum: 0x0028,
  crimeSum: 0x002C, trafficCount: 0x0030, pollution: 0x0034, fame: 0x0038, advertising: 0x003C, garbage: 0x0040,
  workforcePct: 0x0044, lifeExpectancy: 0x0048, educationQuotient: 0x004C, nationalPop: 0x0050,
  nationalValue: 0x0054, nationalTax: 0x0058, nationalTrend: 0x005C, heat: 0x0060, wind: 0x0064,
  humidity: 0x0068, weather: 0x006C, disaster: 0x0070, residentialPop: 0x0074, rewardsAvailable: 0x0078,
  cohorts: 0x007C, industryGraph: 0x016C, tileCounts: 0x01F0, zoneTileCounts: 0x05F0, bonds: 0x0610,
  neighbors: 0x06D8, rciDemand: 0x0718, techYears: 0x0738, taxRes: 0x077C, taxCom: 0x07E8, taxInd: 0x0854,
  ordinanceBlock: 0x08C0, bondBlock: 0x0930, svcPolice: 0x0998, svcFire: 0x0A04, svcHealth: 0x0A70,
  svcSchools: 0x0ADC, svcColleges: 0x0B48, svcRoads: 0x0BB4, svcHighways: 0x0C20, svcBridges: 0x0C8C,
  svcRail: 0x0CF8, svcSubway: 0x0D64, svcTunnel: 0x0DD0, yearEnd: 0x0E3C, seaLevel: 0x0E40,
  terrainCoast: 0x0E44, terrainRiver: 0x0E48, militaryBase: 0x0E4C, paperList: 0x0E50, newsList: 0x0EC8,
  ordinances: 0x0FA0, unemployed: 0x0FA4, militaryCounts: 0x0FA8, subwayCount: 0x0FE8, speed: 0x0FEC,
  autoBudget: 0x0FF0, autoGoto: 0x0FF4, sound: 0x0FF8, music: 0x0FFC, noDisasters: 0x1000,
  paperDelivery: 0x1004, extraPaper: 0x1008, paperChoice: 0x100C, zoom: 0x1014, viewX: 0x1018, viewY: 0x101C,
  arcoPop: 0x1020, connectionTiles: 0x1024, sportsTeams: 0x1028, normalPop: 0x102C, industryBonus: 0x1030,
  pollutionBonus: 0x1034, oldArrests: 0x1038, policeBonus: 0x103C, disasterActive: 0x1048, goDisaster: 0x104C,
  sewerBonus: 0x1050,
} as const;
export const miscGet = (m: Int32Array, off: number) => m[off >> 2];
export const miscSet = (m: Int32Array, off: number, v: number) => { m[off >> 2] = v | 0; };

/** 年龄队列块（§2.3.4）。字段顺序是唯一允许改动的地方（§5.14），其它代码一律经此函数取偏移 */
export const COHORT_COUNT = 20, COHORT_STRIDE = 12;
export type CohortField = 'count' | 'eqSum' | 'leSum';
const COHORT_FIELD_SLOT: Record<CohortField, number> = { count: 0, eqSum: 1, leSum: 2 };
export const cohortOffset = (k: number, f: CohortField) => MISC.cohorts + k * COHORT_STRIDE + COHORT_FIELD_SLOT[f] * 4;
export const readCohorts = (m: Int32Array) => Array.from({ length: COHORT_COUNT }, (_, k) => ({
  count: miscGet(m, cohortOffset(k, 'count')), eqSum: miscGet(m, cohortOffset(k, 'eqSum')), leSum: miscGet(m, cohortOffset(k, 'leSum')),
}));
```

静态测试：`cohortOffset(19, 'leSum') + 4 === MISC.industryGraph`（块恰好填满 `0x007C–0x016B`）。

### 3.5 精灵文件解码

#### 3.5.1 接口

```ts
export interface SpriteEntry { id: number; offset: number; width: number; height: number; length: number; order: number /* 索引表中的序号 */ }
export interface DuplicateEntry { id: number; kept: SpriteEntry; dropped: SpriteEntry; identical: boolean /* 宽高长度与字节全同 */ }
export interface SpriteArchive {
  file: 'LARGE'|'SMALLMED'|'SPECIAL';
  entries: Map<number, SpriteEntry>;     // 去重后；默认先出现者优先（§2.6.1）
  duplicates: DuplicateEntry[];          // 被丢弃的重复条目，写 info 级诊断 DUPLICATE_SPRITE_ID
  bytes: Uint8Array;                     // 原始文件（仅在 Worker 内持有）
}
export interface ParseSpriteOptions { duplicatePolicy?: 'first' | 'last' }   // 默认 'first'
/** 8 位索引位图；alpha 用独立位图表示，索引 0 是合法颜色 */
export interface IndexedBitmap { width: number; height: number; index: Uint8Array; opaque: Uint8Array }

export function parseSpriteArchive(buf: ArrayBuffer, file: SpriteArchive['file'], opts?: ParseSpriteOptions): ReadResult<SpriteArchive>;
export function decodeSprite(a: SpriteArchive, e: SpriteEntry, opts?: { allowUnpaddedOddRuns?: boolean }): ReadResult<IndexedBitmap>;
```

#### 3.5.2 索引解析

```
parseSpriteArchive(buf, file, opts):
  policy = opts?.duplicatePolicy ?? 'first'
  r = ByteReader(buf); count = r.u16be()
  if 2 + 10*count > buf.byteLength: throw SPRITE_HEADER_TRUNCATED
  raw = []
  for k in 0..count-1:
     id = u16be; offset = u32be; height = u16be; width = u16be
     if offset >= buf.byteLength or width == 0 or height == 0 or width > 4096 or height > 4096: warn BAD_ENTRY(id); continue
     raw.push({id, offset, width, height, order: k})
  sorted = raw 按 offset 升序（稳定）
  for k: sorted[k].length = (k+1 < sorted.length ? sorted[k+1].offset : buf.byteLength) - sorted[k].offset
  entries = Map; duplicates = []
  for e in raw（按文件顺序）:
     prev = entries.get(e.id)
     if prev == null: entries.set(e.id, e); continue
     kept, dropped = policy == 'first' ? (prev, e) : (e, prev)
     identical = prev.width == e.width and prev.height == e.height and prev.length == e.length
                 and bytes[prev.offset .. +length) 与 bytes[e.offset .. +length) 逐字节相等
     duplicates.push({id: e.id, kept, dropped, identical}); entries.set(e.id, kept)
     info DUPLICATE_SPRITE_ID(file, e.id, identical)        // 不是错误；identical == false 时提升为 warn
  if file == 'LARGE' and 缺少 1256 或 entries.get(1256) 尺寸 != 32×17: warn LARGE_SANITY
  return {entries, duplicates, ...}
```

#### 3.5.3 像素解码

```
decodeSprite(a, e, opts):
  index = Uint8Array(w*h); opaque = Uint8Array(w*h)
  p = e.offset; end = e.offset + e.length; y = 0
  while p + 2 <= end and y < h:
     len = bytes[p]; flag = bytes[p+1]; p += 2
     if flag == 2: break                                      // 行头位置的结束标志
     if flag != 1: warn BAD_ROW_FLAG(e.id, y); // 容错：仍按行处理
     rowEnd = min(p + len, end); x = 0; finished = false
     while p + 2 <= rowEnd:
        n = bytes[p]; mode = bytes[p+1]; p += 2
        switch mode:
          0: continue
          2: finished = true; break
          3: x += n
          4: take = min(n, max(0, w - x)); copy bytes[p..p+take) → index[y*w + x ..]; set opaque; 
             if n > w - x: warn ROW_OVERFLOW(e.id, y)
             p += n; if n odd and (!opts.allowUnpaddedOddRuns or bytes[p] == 0): p += 1
             x += n
          default: warn BAD_MODE(e.id, y, mode); p = rowEnd   // 跳过本行其余
        if finished: break
     p = rowEnd; y += 1
     if finished: break
  // 剩余行保持透明
  return {width: w, height: h, index, opaque}
```

性能：三个文件约 2–3 千个精灵，解码在 Worker 中一次完成（毫秒级到百毫秒级），结果按 §3.6.3 打包。

#### 3.5.4 手工构造最小测试样例（禁止使用原版字节）

目标精灵：ID 1001，宽 4，高 3，图案（`.` 透明，字母为调色板索引）：

```
y=0:  . A A .      → 跳 1，画 2（偶数，无填充），行末 1 列透明
y=1:  B . . C      → 画 1（奇数，需填充），跳 2，画 1（奇数，需填充）
y=2:  . . . .      → 空行
```

取 `A=0x21, B=0x22, C=0x23`。行字节：

```
行0: 06 01 | 01 03 | 02 04 21 21          （rowLen = 2 + 4 = 6）
行1: 0A 01 | 01 04 22 00 | 02 03 | 01 04 23 00   （rowLen = 4 + 2 + 4 = 10）
行2: 00 01                                  （空行）
结束: 00 02
```

文件：`00 01`（count=1） + 索引 `03 E9 | 00 00 00 0C | 00 03 | 00 04`（id 1001，offset 12，h 3，w 4）+ 上述 24 字节（8 + 12 + 2 + 2），文件总长 36 字节。期望 `index/opaque`：

```
opaque = [0,1,1,0, 1,0,0,1, 0,0,0,0]
index  = [_,0x21,0x21,_, 0x22,_,_,0x23, _,_,_,_]
```

再构造第二个样例：同一 ID 出现两次（第二份 2×1 全不透明、字节不同），断言默认 `duplicatePolicy='first'` 时解码结果仍是上面的 4×3 图、`duplicates` 含一条 `identical=false` 记录；`'last'` 时取 2×1；再加一份字节完全相同的重复条目断言 `identical=true`。第三个样例把 `01 04 22`（无填充）配合 `allowUnpaddedOddRuns=true` 验证 MIF 路径。这些夹具放在 `io/sprites/__fixtures__/*.ts` 里用代码生成，不提交二进制。

### 3.6 调色板与色循环

#### 3.6.1 接口

```ts
export interface Palette { rgb: Uint8Array /* 256*3 */; source: 'PAL_MSTR'|'placeholder' }
export function readPaletteBmp(buf: ArrayBuffer): ReadResult<Palette>;

export interface CycleGroup { start: number; count: number; dir: 1 | -1 }           // 快速段
export const FAST_GROUPS: readonly CycleGroup[] = [
  { start: 0xAB, count: 8, dir: 1 }, { start: 0xB3, count: 8, dir: 1 }, { start: 0xBB, count: 8, dir: 1 },
  { start: 0xC3, count: 4, dir: 1 }, { start: 0xC8, count: 8, dir: -1 }, { start: 0xD0, count: 4, dir: -1 },
  { start: 0xD4, count: 8, dir: -1 },
];
export const SLOW_PAIRS_START = 0xE0, SLOW_PAIRS = 8;
export const FAST_STEP_MS = 125, SLOW_EVERY_FAST_STEPS = 8;   // [L] 待实机比对

/** 返回"tick 时索引 i 应显示的原始索引" */
export function cycledIndex(i: number, fastTick: number): number;
export function buildPaletteTexture(p: Palette, fastTick: number, out: Uint8Array /* 256*4 RGBA */): void;
```

```
cycledIndex(i, t):
  for g in FAST_GROUPS:
     if g.start <= i < g.start + g.count:
        k = i - g.start; return g.start + ((k + g.dir * t) mod g.count + g.count) mod g.count
  if SLOW_PAIRS_START <= i < SLOW_PAIRS_START + 2*SLOW_PAIRS:
     slowStep = floor(t / SLOW_EVERY_FAST_STEPS); return (slowStep odd) ? (i ^ 1) : i
  return i
```

#### 3.6.2 渲染建议（PixiJS v8）
精灵以**索引位图**上传为单通道（`R8`）纹理图集，`opaque` 合并进第二通道或用 `0xFF` 以外的哨兵（推荐双通道 `RG8`：R = 索引，G = 不透明度）；调色板为 256×1 RGBA 纹理。片元着色器查表：`color = texture(palette, vec2((idx + 0.5)/256.0, 0.5))`。色循环只需每个 fast tick 重写这张 256×1 纹理，不动图集，成本近似为零。无 WebGL2 时退化为 CPU 预烘焙 24 帧（LCM(8,4,2×8) = 16 个快 tick 即可覆盖全部状态，取 16 帧）。

#### 3.6.3 解码产物
Worker 输出 `{ atlasPages: ImageBitmap | Uint8Array[], frames: Map<spriteId, {page, x, y, w, h}> }`，图集按 2048² 装箱（载具 / 动画帧与地块分开页，便于局部更新）。缓存到 IndexedDB 的是**索引图集**（小、与调色板无关），不是 RGBA。

### 3.7 精灵 ID 解析与回退

#### 3.7.1 接口

```ts
export type Zoom = 'small' | 'medium' | 'large';
export const ZOOM_BASE: Record<Zoom, number> = { small: 0, medium: 500, large: 1000 };
export const TILE_W: Record<Zoom, number> = { small: 8, medium: 16, large: 32 };
export const ALT_STEP: Record<Zoom, number> = { small: 3, medium: 6, large: 12 };

export type SpriteKey =
  | { kind: 'xbld'; id: number }                         // n = id (1..255)
  | { kind: 'terrain'; slope: number }                   // n = 256 + slope (0..13)
  | { kind: 'water'; shape: number }                     // n = 270 + shape (0..13)
  | { kind: 'waterfall' } | { kind: 'stream'; code: number /* 0x40..0x45 → 285.. */ }
  | { kind: 'zoneTint'; zone: number } | { kind: 'underground'; n: number }
  | { kind: 'vehicle'; type: 'plane'|'copter'|'ship'|'train'; dir: 0|1|2|3|4 }
  | { kind: 'anim'; name: 'explosion'|'dust'|'fire'|'monster'|'tornado'|'rioters'; frame: number }
  | { kind: 'misc'; name: 'nessie'|'sailboat0'|'sailboat1'|'dispatchPolice'|'dispatchFire'|'dispatchMilitary'
      |'monsterRay'|'noPower'|'bulldozer0'|'bulldozer1'|'flood'|'maxisMan'|'plus'|'minus' };

export interface SpriteProvider {
  readonly hasOriginalArt: boolean;
  resolve(key: SpriteKey, zoom: Zoom): SpriteRef;        // 永远返回：原版缺失时给占位美术
  readonly palette: Palette;
}
export function relativeId(key: SpriteKey, layout: IdLayout): number | undefined;
```

#### 3.7.2 `IdLayout` 自动对齐
`0–290` 固定；`291+` 的起点用 §2.6.3 的顺序表从 291 起"按数量累加"得到候选号，然后对每段用尺寸启发式校验（例如 large 的分区底色 / 着色 / 轮廓段应为 32×17；载具 5 连号尺寸相近；火 4 帧同尺寸；龙卷风 3 帧高大）。若校验失败，把该段标记 `unresolved` 并回退占位美术，同时把 `LARGE.DAT` 的索引摘要（仅 `id,w,h`，不含像素）写入诊断，便于玩家 / 开发者反馈后更新表。对齐结果与文件 `sha256` 一起缓存。

### 3.8 文本导入（可选）

```ts
export interface NewsTokenDb { groups: string[][] /* 索引 = 词组号 0x00..0xCD */; }
export function readNewsData(idx: ArrayBuffer, dat: ArrayBuffer): ReadResult<NewsTokenDb>;
export function expandTemplate(tpl: string, db: NewsTokenDb, ctx: { cityName: string; mayor: string; team: string }, rng: Rng): string;
```

`readNewsData`：按 §2.9.1 切段 → 读 250 组 (start,count) → 读 2500 指针 → 切词元（去掉末尾 `0x00`）→ 按 §2.9.2 解压成带 `{...}` 占位的模板字符串；词组号 = 组序号。我们自己的新闻系统默认使用原创模板；当 `NewsTokenDb` 存在时，可按组名把原版词组作为同名池的补充来源。

### 3.9 浏览器本地导入流程

#### 3.9.1 用户流程

1. 入口：标题画面"导入原版文件（可选）"与"打开存档"两个按钮；画布全局接受拖放。
2. 三种来源（能力探测后择优）：
   - **目录授权**：`window.showDirectoryPicker({ id: 'sc2k', mode: 'read' })`，递归扫描（深度 ≤ 3），按不区分大小写的文件名收集 `DATA/LARGE.DAT`、`DATA/SMALLMED.DAT`、`DATA/SPECIAL.DAT`、`BITMAPS/PAL_MSTR.BMP`、`BITMAPS/PAL_STTC.BMP`、`BITMAPS/PAL_MAC.BMP`、`DATA/DATA_USA.*`、`DATA/TEXT_USA.*`、`CITIES/*.SC2`、`SCENARIO/*.SCN`。`FileSystemDirectoryHandle` 可存入 IndexedDB，下次启动用 `queryPermission/requestPermission` 免重选。
   - **多选文件**：`showOpenFilePicker({ multiple: true })` 或 `<input type="file" multiple>`（Firefox / Safari 回退；`webkitdirectory` 作为目录回退）。
   - **拖放**：`DataTransferItem.getAsFileSystemHandle()`（Chromium）或 `webkitGetAsEntry()` 遍历目录；只有 `File` 时按文件名识别。
3. 识别与校验（§3.9.3）在主线程做"名字 + 魔数"快速判断；完整解析在 Worker。
4. 进度 UI：每个文件一行（识别 → 校验 → 解码 → 缓存），失败项显示错误码与建议，不阻塞其它文件。
5. 完成后：显示"原版美术：已启用 / 部分启用（缺 X）/ 未启用"，提供"清除本地缓存"按钮。

#### 3.9.2 隐私与安全约束（必须）

- 字节流只存在于页面内存、Worker 与本机 IndexedDB；**禁止**任何 `fetch/XHR/WebSocket/sendBeacon` 携带这些数据；禁止写入日志 / 错误上报（诊断只含 `id,w,h,size,sha256` 一类元数据）。
- 构建期 CSP 建议 `connect-src 'self'`；`io/import` 目录不允许 import 网络模块（eslint `no-restricted-imports`）。
- 不把原版文件内容塞进 URL、`localStorage`、剪贴板或分享链接；导出的 `.SC2` 是玩家自己的数据，可下载。
- 缓存只在该浏览器 origin 内，`navigator.storage.persist()` 请求持久化；提供一键删除。

#### 3.9.3 识别与校验

```ts
export type AssetKind = 'LARGE'|'SMALLMED'|'SPECIAL'|'PAL_MSTR'|'PAL_STTC'|'PAL_MAC'|'DATA_USA_DAT'|'DATA_USA_IDX'
  |'TEXT_USA_DAT'|'TEXT_USA_IDX'|'SC2'|'SCN'|'MIF'|'UNKNOWN';
export interface IdentifiedFile { kind: AssetKind; name: string; size: number; lastModified: number; file: File }
export function identify(file: File, head: Uint8Array /* 前 64 B */): AssetKind;
```

| kind | 文件名（不分大小写） | 魔数 / 快速校验 |
|---|---|---|
| `LARGE` | `LARGE.DAT` | `count = u16be(0)`，`2 + 10·count ≤ size`，首条 `offset ≥ 2 + 10·count`，ID 多数 ∈ [1000,1500) |
| `SMALLMED` / `SPECIAL` | `SMALLMED.DAT` / `SPECIAL.DAT` | 同上，ID < 1000 |
| `PAL_*` | `PAL_MSTR.BMP` 等 | `"BM"`，`biBitCount == 8`，`biClrUsed ∈ {0,256}`，宽高 16×16 |
| `SC2` / `SCN` | 扩展名 | `"FORM"…"SCDH"`（或 0x80 处） |
| `DATA_USA_IDX` | `DATA_USA.IDX` | 大小 48，6 条递增偏移 |
| `MIF` | `*.MIF` | `"MIFF"…"SC2K"` |

文件名不匹配但魔数匹配时按魔数采信并提示；文件名匹配但魔数失败 → `BAD_MAGIC`。

#### 3.9.4 错误码

| code | 触发 | 用户提示（中文）|
|---|---|---|
| `NOT_SC2` | 无 FORM/SCDH | 这不是 SimCity 2000 存档 |
| `UNSUPPORTED_CLASSIC` | SimCity Classic 存档 | 暂不支持 SimCity Classic 存档 |
| `MISSING_CHUNK` | 缺 MISC/ALTM/XTER/XBLD | 存档不完整 |
| `RLE_LENGTH` / `BAD_RLE_CONTROL` / `TRUNCATED_CHUNK` | 解压异常（已容错） | 存档可能损坏，已尽量读取 |
| `SPRITE_HEADER_TRUNCATED` / `BAD_ENTRY` | 索引越界 | 精灵文件损坏 |
| `DUPLICATE_SPRITE_ID` | 同一文件内同 ID 出现两次（info；两份字节不同时 warn） | 不提示用户；仅写入诊断供 §5.15 核对 |
| `LARGE_SANITY` | 1256 缺失或尺寸异常 | 这似乎不是 Win95 版的 LARGE.DAT（DOS 版不支持） |
| `PALETTE_FORMAT` | 非 8 bpp / 非 256 色 | 调色板文件格式不对 |
| `PALETTE_MISSING` | 有精灵无调色板 | 需要 BITMAPS/PAL_MSTR.BMP 才能显示原版画面 |
| `QUOTA` | IndexedDB 写入失败 | 浏览器存储空间不足，可改为"仅本次会话" |
| `PERMISSION` | 目录权限被拒 | 需要读取权限；可改用文件多选 |

#### 3.9.5 IndexedDB 布局

数据库 `sc2k-assets`，版本 1：

| store | key | value | 备注 |
|---|---|---|---|
| `files` | `kind`（`AssetKind`） | `{ kind, name, size, lastModified, sha256, bytes: ArrayBuffer, importedAt }` | 原始字节，用于重新解码 |
| `decoded` | `${sha256}:${DECODER_VERSION}` | `{ atlasPages: Blob[] (索引图集 PNG 或 raw), frames, idLayout, diagnostics }` | 解码器升级时自动失效 |
| `handles` | `'root'` | `FileSystemDirectoryHandle` | 仅 Chromium；用于免重选 |
| `saves` | 自增 id | `{ name, bytes, thumbnail: Blob, savedAt, cityName, year, population }` | 玩家存档（我们自己的 `.SC2` 导出） |
| `meta` | `'prefs'` | `{ useOriginalArt: boolean, persistGranted: boolean }` | |

```ts
export interface AssetStore {
  putFile(f: IdentifiedFile, bytes: ArrayBuffer): Promise<void>;
  getFile(kind: AssetKind): Promise<{ bytes: ArrayBuffer; sha256: string } | undefined>;
  putDecoded(key: string, v: DecodedAssets): Promise<void>;
  getDecoded(key: string): Promise<DecodedAssets | undefined>;
  listSaves(): Promise<SaveMeta[]>; putSave(s: SaveRecord): Promise<number>; getSave(id: number): Promise<SaveRecord>;
  clearAll(): Promise<void>;
  estimate(): Promise<{ usage: number; quota: number }>;
}
```

`sha256` 用 `crypto.subtle.digest('SHA-256', bytes)`；仅用作缓存键与"同一文件"判断，不与任何外部已知哈希比对、不上传。

#### 3.9.6 启动序列

```
boot():
  prefs = store.get('prefs')
  if prefs.useOriginalArt:
     cached = store.getDecoded(key(LARGE.sha256, SMALLMED.sha256, SPECIAL.sha256, PAL_MSTR.sha256, DECODER_VERSION))
     if cached: provider = OriginalSpriteProvider(cached); return
     files = 从 store.files 取；若缺失且有 handles.root 且权限 granted → 重新读取；否则 provider = PlaceholderSpriteProvider 并提示
     worker.decode(files) → store.putDecoded → provider = Original...
  else provider = PlaceholderSpriteProvider
```

存档打开：`File → ArrayBuffer → readSc2`（Worker 或主线程皆可，< 10 ms）→ `importCity()`；保存：`writeSc2()` → `Blob` → `showSaveFilePicker` 或 `<a download>`，同时写入 `saves` store。

---

## 4. 边界条件与易错点

1. **字节序混用**：`.SC2` 与精灵头是大端，BMP / IDX 是小端，`PICT` 宽高是小端。`ByteReader` 不提供"默认字节序"方法，强制写 `u16be/u16le`。
2. **IFF 无填充**：按 `size` 连续读，不要套用标准 IFF 的偶数对齐；写出也不要加。
3. **RLE 控制字节 0x00 / 0x80**：不存在于正常文件；遇到就跳过并告警，不要把 0x80 当作 1 次重复或 128 字节字面量。
4. **解压长度不等于期望**：第三方工具写出的存档偶有差 1 字节；读时截断 / 补零，写时严格。
5. **`CNAM` 尾部垃圾**：只取到首个 `0x00`，不要信任首字节 0x1F 为长度；空名用大写文件名。
6. **`ALTM.waterLevel` 不可靠**，以 `XTER` 为准（地形规格）。
7. **位编号方向**：社区文档的 "bit 0" 是最高位。本文全部换算成掩码；code review 时见到 `1 << 0` 对应 Powerable 即为错。
8. **`XZON` 角标不可信**：第三方 / DOS 转换存档可能缺角标或多角标，导入后按 `XBLD` 连通块重建；1x1 建筑必须四位全置否则建筑计数会漏。
9. **`XTXT` 的三种语义**：`≤0xC8` 指向 `XLAB`；`0xC9–0xEF` 指向 `XTHG`；`≥0xFA` 是标记。清理物件时要同步清对应的 `XTXT`，否则残留指针会把灾害标记误判成告示牌。
10. **`XLAB` 填充垃圾**：按 `len` 取且在 `0x00` 截断；写出时清零，长度 > 23 截断。
11. **精灵同 ID 重复**：文件内重复默认取**先出现者**（dfloer：第二份为伪条目），`duplicatePolicy` 可切换；跨文件 `SPECIAL` 覆盖 `SMALLMED` 是另一条独立策略。两者都要写诊断，不要静默。
12. **精灵数据长度**：用"下一个偏移 − 本偏移"而不是解码到 `height` 行就停：有的精灵在 `height` 行前就有结束块，有的结束块后还有填充；两种都要吃掉而不越界。
13. **mode 4 奇数填充**：`.DAT` 必有、MIF 可能没有。误判会导致后续整行错位；MIF 路径下用 `bytes[p] == 0` 启发式。
14. **索引 0 不是透明**：透明来自跳过与行尾；把 0 当透明会在桥缆、阴影、文字处漏洞。
15. **调色板保留区**：0–15 与 240–255 在原版显示时由系统色占据，`PAL_MSTR` 中的值未必是游戏实际显示色；精灵不应引用这些索引，若引用则按文件值显示并记诊断。
16. **色循环方向**：E/F/G 三组反向。若把全部组做正向，水流会"倒流"，灯带方向相反。
17. **大小写与路径分隔符**：Windows 安装目录文件名可能全大写或混合；目录扫描用 `toUpperCase()` 比较，并同时接受 `DATA/` 与根目录直接放置。
18. **Mac / DOS 文件**：DOS 版精灵（`LARGE.DAT` + `LARGE.HED`）格式完全不同，识别到同目录有 `.HED` 时报 `LARGE_SANITY` 并提示"需要 Windows 95 Special Edition 的文件"。Mac 存档可读（去 128 B 头）。
19. **大文件与内存**：三个精灵文件合计数 MB，解码后索引图集约 10–20 MB；全部放 Worker，主线程只收 `ImageBitmap`/图集元数据；不要把 `Uint8Array` 转成普通数组。
20. **Safari / Firefox 能力差异**：无 `showDirectoryPicker` 时退回 `<input webkitdirectory>`；`FileSystemHandle` 不能存入 IndexedDB 时跳过 `handles` store；`OffscreenCanvas` 缺失时在主线程建纹理。
21. **缓存失效**：`DECODER_VERSION` 变更、调色板文件变化、`idLayout` 校验失败三者任一都要重解码；不要只看文件名。
22. **导出无损性**：对我们不理解的 `MISC` 偏移原值写回；`XTHG` 不透传未知类型（避免原版读到坏物件崩溃）。
23. **`TEXT` 行尾**：原版为 CR；写出时若留 `\n` 原版显示为方块。
24. **数值溢出**：`money` 与债券为 i32，内部用 `number` 时写回前 `| 0`，并在 UI 层限制 ±2^31。

---

## 5. 待确认问题

1. 精灵相对号 291–499 的精确边界（尤其交通叠加层的条目数），需用玩家文件的索引摘要校正 §2.6.3 的表。
2. 色循环 tick 的真实时长（本文默认 125 ms / 慢速 ×8）；慢速段是否严格按对交换，以及末项怪癖是否影响可见效果。
3. `SPECIAL.DAT` 的确切内容与它和 `SMALLMED.DAT` 的优先级。
4. `MISC` 未明字段：`0x0024 cityValue`、`0x0034–0x0040`、`0x05F4/0x05FC/0x0604/0x060C`、`0x0724–0x0734`、`0x08C0` 法令块布局、`0x0E50/0x0EC8` 报纸列表结构、`0x1010/0x1014`、`0x1030–0x104C`、`0x10B8`。
5. `industryGraph`（33 × i32）的顺序与单位（zones 规格 Q8）。
6. `neighbors` 四条记录的方位顺序与 `index/value/fame` 的语义。
7. `XTHG` 记录 6–11 字节的含义，以及类型表到底是社区观察的 15 种还是逆向枚举的 17 种（含推土机 / Maxis Man）。
8. `ALTM 0x7C00` 隧道位的精确含义与写出规则。
9. `rewardsAvailable` 的位分配。
10. `PICT` 调色板映射（+16 偏移、254 灰、0 黑）在 `PAL_MAC.BMP` 与 `PAL_MSTR.BMP` 下的差异。
11. `DATA_USA.DAT` 的 Story Power / Decay 段用途（影响故事选取权重，可能对"原汁原味"的报纸有用）。
12. MIF 的 `INFO` 内容与 `SHAP` 头的两个未知字节；MIF 是否也可包含非 large 精灵。
13. 建筑精灵锚点的像素级规则（左顶点 / 底顶点 / 1 px 重叠）由渲染规格实机验收。
14. 年龄队列三元组的字段顺序（§2.3.4）：`[count, eqSum, leSum]`（services）还是 `[count, leSum, eqSum]`（dfloer 标签字面顺序）。核对方法：用玩家自己的成熟城市存档读出 20 组三元组，对 `+4` 与 `+8` 两列分别算 `sum/count`；随 k 单调上升、且在高龄队列（k ≥ 14）恒 ≥ 5k 的那一列是 LE（存活者的预期寿命不会低于当前年龄），另一列（与 k 关系平缓、量级接近 `MISC 0x004C`）是 EQ。确认后只改 `COHORT_FIELD_SLOT`，并通知 services / ui-art。
15. 精灵文件内重复 ID（§2.6.1）：用玩家文件统计 `duplicates`，核对 (a) 重复条目是否字节相同（相同则策略无关紧要）；(b) 若不同，对比两份解码图与原版 / SCURK 显示的画面，确定原版实际取哪一份，再决定 `duplicatePolicy` 的默认值是否维持 `'first'`。

---

## 6. 参考来源

- dfloer / SC2k-docs（CC BY-SA 4.0；本地副本 `refdocs/`）：`sc2_file_spec.md`（IFF、RLE、全部 chunk、`XBLD`/`XZON`/`XUND`/`XTXT`/`XLAB`/`XMIC`/`XTHG`/`XBIT`、`MISC` 表、小地图、`XGRP`、情景 chunk）、`sprite_data_spec.md`（Win95 精灵头与行编码、调色板 BMP、MIF、DOS 格式对比）、`text_data_spec.md`（`DATA_USA`/`TEXT_USA` 结构、双字母表、转义、词组表、排版规则）、`simulation_spec.md`（`MISC` 中各统计字段与模拟的关系）。本文所有 **[H]** 事实的主要来源；内容已用本项目的术语重写。
- OpenCity2k / OpenCity2k（dfloer 的解析器；**仅阅读以理解格式，未复制代码**）：`sc2_iff_parse.py`（Mac 头、Classic 识别、RLE 的 0x00/0x80 行为、无填充、压缩器的 127/128 分段）、`sc2_parse.py`（`MISC` 字段名与数组范围、小地图索引、`XTHG` 字段、`PICT` 小端宽高、`SCEN` 字段序）、`image_parse.py`（精灵索引 10 B 记录、行 / 块解码、奇数填充、`-1` 透明、调色板 BGRX、色循环分组；其对重复 ID 的处理本文未核实，§2.6.1 不再引用它作依据）、`data_usa_parse.py` / `text_usa_parse.py`（IDX 8 B 小端记录、段切分、内部表大端）、`utils.py`（全部整数助手为大端，据此确定精灵头字节序）。
- OpenSC2K / OpenSC2K（Godot / Rust 重制；**仅阅读**）：`native/core/assets/src/palette.rs`（`FAST_CYCLE_START 0xAB`、49 项置换表、`SLOW_CYCLE 0xE0` 16 项）、`game/src/assets/sc2_palette.gd`（SCURK 55 ms 定时器）、`game/tests/suites/core/rendering/palette_minimap_tests.gd`（循环方向断言、三级缩放的 8/16/32 px 与 3/6/12 px 海拔步、精灵基址 0/500/1000）、`sprite_archives_tests.gd` 与 `static_image_tests.gd`（1256 为 32×17；`XTER 0x00→1256`、`0x10→1270`、`0x45→1290`；1045 / 1072 为轨道与交叉件）、`docs/media-pack-format.md`（安装目录文件清单、ID 区间 <500 / 500–999 / ≥1000、静态 16–170、快速 171–219、慢速 224–239、WAV / MIDI 资源号）、`native/core/assets/src/import/graphics/mod.rs`（BMP 54 B 最小头、8 bpp、1024 B 颜色表、4096 px 尺寸上限、LARGE 期望区间 1001–1499）。
- sc2kfix / sc2kfix（MIT；**仅阅读**）：`include/sc2k/sc2k_1996.h`（精灵枚举的分段顺序与数量、`ALTM` 掩码 `0x1F/0x3E0/0x7C00`、`XBIT` 掩码、`XZON` 角标掩码、`XUND` 计数 36、`XTHG` 类型 0–16 与 8 向、`XTER` 与 256–290 的对应）。
- 本项目姊妹规格：`terrain.md`（`ALTM/XTER/XBIT` 的地形语义与导入修正）、`zones-growth-demand.md`（角标重建）、`services-models.md`（`XMIC` 语义、小地图层主次序、`MISC 0x007C` 年龄队列的唯一写方）、`ui-art.md`（Population 窗口按年龄队列显示；精灵重复 ID 策略引用本文 §2.6.1）、`transport-traffic.md`（`XUND`/网络重建）、`economy-budget.md`（`MISC` 预算块与法令位序）、`disasters-events.md`（`XTXT` 灾害标记、`XTHG` 灾害物件、`SCEN` 目标）。
- 其余未标注来源的内容为作者对 SC2K 的记忆与推断，均已标注 [M]/[L] 并列入 §5。

---

## 7. 修订记录

| 日期 | 变更 | 影响的姊妹规格 |
|---|---|---|
| 2026-10-17 | §2.3.2 `0x007C–0x016B` 由"人口 / LE / EQ 三条 20 点曲线"改为 **20 个 5 岁年龄队列 × `[count, eqSum, leSum]`**，新增 §2.3.4 与 `cohortOffset()` 访问器；旧名 `popGraph` 弃用；所有权归 services | `economy-budget.md`（已无"每年推入"逻辑，核对 §2.14 / §3.8 无残留）、`ui-art.md` §2.5 Population 窗口需改为按年龄队列的条形图 |
| 2026-10-17 | §2.6.1 精灵文件内重复 ID 由"后者为准 [H]"改为 **默认取第一个 [M]**（依据 dfloer "第二个为伪条目"），新增 `duplicatePolicy`、`DuplicateEntry.identical`、`DUPLICATE_SPRITE_ID` 诊断与 §5.15 核对项 | `ui-art.md` §2.9.1 头部一行应改为引用本文 §2.6.1，不再自述策略 |
