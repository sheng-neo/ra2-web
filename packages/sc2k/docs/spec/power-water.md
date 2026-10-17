# 领域规格：电力与供水网络（Power & Water）

> 适用对象：`packages/sc2k` 的 `sim/power`、`sim/water`、`sim/utilities`（电厂寿命）、以及需要读取供电/供水状态的所有模块。科技解锁**不**属于本模块（见 §2.3.1）。
> 蓝本：SimCity 2000 Windows 95 Special Edition（下称 SC2K）。
> 置信度标注：**[高]** = 一手文档（dfloer/SC2k-docs）或两个独立逆向来源互证；**[中]** = 单一来源 / 社区共识 / 手册描述；**[低]** = 为"可实现"给出的合理推测，必须做成 `UtilityTuning` 里的可调参数。
> 所有未标注的数值默认为 **[低]**。所有表格数值都应放进 `UtilityTuning` / `POWER_PLANT_DEFS` / `WATER_FACILITY_DEFS` 数据对象，不要散落在代码里。
> 坐标约定（全仓库唯一真源是 `file-formats.md` §2.2.1，本文只引用）：地图 128x128，**`i = x * 128 + y`**（x 为主序，y 变化最快；`x = i >> 7`，`y = i & 127`），与 `.SC2` 存档逐字节一致。本模块一律通过契约包的 `tileIndex(x, y)` / `tileX(i)` / `tileY(i)` 访问，**禁止自算**。锚点为建筑左上格（最小 x、最小 y）。详见 §1.1。
>
> 修订记录：2026-10 评审后统一索引约定为 x 主序（原稿误写为 `y*128+x`），并把科技时间线所有权移交 `sim/tech`（`disasters-events.md` §2.9）。

---

## 1. 概述

本模块回答四个问题：

1. **电从哪来、能供多少**：9 种电厂，每个**占地格**各自产出固定（或随天气/海拔随机）的"服务格数"；一座 4x4 煤电厂 = 16 格 × 44 = 704 格。
2. **电怎么传**：通过"可导电（`POWERABLE`）"的格子做 4 邻域洪水填充。电线、所有已建建筑（含电厂、公共建筑、arco）导电；道路、铁路、树木、瓦砾、**空分区地**不导电。
3. **电不够时谁先停**：没有比例降额。按填充顺序逐格供电，预算用尽后余下格子全部断电（brownout）。断电的已建建筑闪"闪电"图标，不生长、不计人口、公共设施失效。
4. **水同理但有三点不同**：传导介质是地下管线层（`XUND`）+ 建筑自带的隐式管线；水源产量取决于水位、降雨与相邻水面；水塔把本月富余存起来、下月放出。

与其他模块的边界（本模块**只写** `XBIT` 的 4 个位和若干统计值；其余只读）：

| 方向 | 数据 | 说明 |
|---|---|---|
| 输入 | `XBLD`、`XZON`、`XUND`、`XTER`、`ALTM` | 建筑/分区/地下/地形/海拔 |
| 输入 | `MISC`：Water level `0x0E40`、Humid(rain) `0x0068`、Wind `0x0064`、Ordinances `0x0FA0`、No Disasters `0x1000`、Money `0x0014`、Normal population `0x102C` | 天气、法令、资金 |
| 输入 | `XBIT` 的 `WATER` / `SALTWATER` 位 | 由地形模块维护 |
| 输出 | `XBIT` 的 `POWERABLE` / `POWERED` / `PIPED` / `WATERED` 位 | 本模块独占写权 |
| 输出 | `MISC 0x104C` 净水厂充足标志、`XGRP` Power % / Water % 序列、`XMIC` 电厂微模拟记录 | 统计 |
| 输出 | 事件：`brownout`、`waterShortage`、`needPower`、`needWater`、`plantAging`、`plantExpired`、`plantAutoRebuilt` | 给报纸 / 顾问 / 音效 |
| 输入（查询）| `env.invented(tech)`、`env.year()`、`env.ordinance(id)`、`env.settings.noDisasters` | 科技发明由 `sim/tech` 独占（`disasters-events.md` §2.9），本模块只读查询，不发 `techInvented` |

### 1.1 坐标与线性索引（引用，不重述）

本模块与地形、分区、交通、服务等模块**直接共享同一批** `Uint8Array(16384)`（`XBLD/XZON/XUND/XTER/XBIT`），所以索引约定必须全仓库一致。真源是 `file-formats.md` §2.2.1：

```
i = x * 128 + y          // x 主序：同一 x 的 128 个 y 连续存放
x = i >> 7               // 不是 i % 128！
y = i & 127
```

对本模块的直接推论（实现者必须记住的三件事）：

| 事实 | 含义 |
|---|---|
| "索引升序遍历" = **x 外层、y 内层** | `for i in 0..16383` 天然就是这个顺序；不要再写 `for y { for x }` 的双重循环，更不要描述为"y 外层" |
| 4 邻居 `(dx, dy)` 与索引增量 | `(0,-1) → i-1`、`(-1,0) → i-128`、`(0,+1) → i+1`、`(+1,0) → i+128`。越界判定：`y-1 < 0 ⇔ (i & 127) == 0`，`y+1 > 127 ⇔ (i & 127) == 127`，`x-1 < 0 ⇔ i < 128`，`x+1 > 127 ⇔ i >= 128*127` |
| 多格建筑的格集合 | 锚点 `a = tileIndex(x0, y0)`，第 `(dx, dy)` 格为 `a + dx*128 + dy`；`count3x3(i)` 要先 `tileX/tileY` 再偏移，不能用 `i ± 1 ± 128` 直接加（会在 x 边缘绕到相邻列）|

一切 `(x, y) ↔ i` 的换算只能经由契约包导出的 `tileIndex(x, y)` / `tileX(i)` / `tileY(i)`（`terrain.md` §3 的 `TerrainReadApi.tileIndex` 即同一函数）；本文伪代码中的 `neighbor(i, dx, dy)` 也用它们实现（§3.3）。反转置测试见 §3.8。

---

## 2. 原版行为

### 2.1 `XBIT` 标志位的真实掩码 [高]

dfloer 文档把"bit 0"写成最高位；两个逆向项目给出的掩码一致，实现时**一律按掩码**，不要按位序号。

| 掩码 | 名称 | 含义 | 谁写 |
|---|---|---|---|
| `0x80` | `POWERABLE` | 可导电 / 可受电 | 本模块（放置时）|
| `0x40` | `POWERED` | 本月实际受电 | 本模块（电力扫描）|
| `0x20` | `PIPED` | 可导水 / 可受水（有管线或有建筑）| 本模块（放置时）|
| `0x10` | `WATERED` | 本月实际受水；水塔格上表示"已蓄水" | 本模块（供水扫描）|
| `0x08` | `MARK` | 扫描用临时访问标记（dfloer 称 "XVAL mask"，是原版泄漏进存档的脏位）| 扫描内部，**存档前清零** |
| `0x04` | `WATER` | 格子被水覆盖 | 地形模块 |
| `0x02` | `FLIPPED` | 瓦片旋转 90°（码头/跑道/桥等）| 建筑模块 |
| `0x01` | `SALTWATER` | 该格水为咸水 | 地形模块 |

`zones-growth-demand.md` 中的 "`XBIT.bit1` 为 1" 即 `POWERED (0x40)`，"`XBIT.bit3`" 即 `WATERED (0x10)`。

### 2.2 哪些格子可导电 / 可导水 [高（来源：逆向重实现的放置逻辑）]

| 格子类型 | `XBLD` 范围 | `POWERABLE` | `PIPED` | 备注 |
|---|---|---|---|---|
| 空地 / 瓦砾 / 放射性废料 | `0x00–0x05` | 否 | 否（除非下方有管线）| |
| 树木 | `0x06–0x0C` | 否 | 否（同上）| 树木阻断电力 |
| 小公园 | `0x0D` | 否 | **是** | 公园导水不导电 |
| 电线 | `0x0E–0x1C` | **是** | 否（同上）| |
| 道路 / 铁路 / 高速 / 隧道口 / 桥 | `0x1D–0x42, 0x45, 0x46, 0x49–0x4E, 0x51–0x5B, 0x5D–0x6F` | 否 | 否（同上）| 道路**不**导电 |
| 电线十字口（电×路、电×铁、电×高速）| `0x43, 0x44, 0x47, 0x48, 0x4F, 0x50` | **是** | 否（同上）| 只能直角交叉 |
| 架空电线（跨水）| `0x5C` | **是** | 否 | |
| 一切已建建筑（分区建筑、施工、废弃、公共设施、电厂、水设施、arco、Llama Dome）| `0x70–0xFF` | **是** | **是** | 放置/生长时一次性置 `PIPED|POWERED|POWERABLE`（`POWERED` 是乐观预置，下次扫描修正）|
| 雕像 | `0xDB` | **否**（放置后清掉）| 是 | 原版特例 |
| 大公园 SimPark | `0xD5` | **否** | 是 | 与小公园一致 |
| **空分区地（已划区无建筑）** | `0x00` + `XZON` 低 4 位≠0 | **否** | 否 | 见 §2.5 生长规则 |

管线：`XUND ∈ 0x10–0x20`（管线与管线×地铁十字口）的格子置 `PIPED`；地铁站入口（`XUND 0x23`）清 `PIPED`；水泵放置时自动在自身格下铺一段管线。推土后：若地下仍有管线则保留 `PIPED`，否则清掉。

### 2.3 电厂总表

**基础数据** [成本/占地：高；每格产量：高（dfloer 实测与逆向常量互证）；寿命：中]

| XBLD | 电厂 | 科技键 `tech`（基准年见 §2.3.1 所指真源）| 价格 | 占地 | 标称 MW | 每格产量（服务格）| 整厂产量（服务格）| 每格污染 | 寿命 | 微模拟类型 |
|---|---|---|---|---|---|---|---|---|---|---|
| `0xCF` | Coal 煤电 | `null`（开局可用）| $4,000 | 4x4 | 200 | 44 | 704 | 50 | 50 年 | 1 |
| `0xC6` / `0xC7` | Hydro 水电（两个朝向）| `null` | $400 | 1x1 | 20 | 40 | 40 | 0 | **不到期** | 21 |
| `0xCA` | Oil 油电 | `null` | $6,600 | 4x4 | 220 | 48 | 768 | 25 | 50 年 | 1 |
| `0xC9` | Gas 燃气 | `'gas'` | $2,000 | 4x4 | 50 | 11 | 176 | 10 | 50 年 | 1 |
| `0xCB` | Nuclear 核电 | `'nuclear'` | $15,000 | 4x4 | 500 | 111 | 1,776 | 2 | 50 年 | 1 |
| `0xC8` | Wind 风电 | `'wind'` | $100 | 1x1 | 4（标称）| 见 §2.3.2 | 0–18 | 0 | **不到期** | 20 |
| `0xCC` | Solar 太阳能 | `'solar'` | $1,300 | 4x4 | 50 | 见 §2.3.3 | 80–224 | 0 | 50 年 | 1 |
| `0xCD` | Microwave 微波 | `'microwave'` | $28,000 | 4x4 | 1,600 | 355 | 5,680 | 0 | 50 年 | 1 |
| `0xCE` | Fusion 聚变 | `'fusion'` | $40,000 | 4x4 | 2,500 | 555 | 8,880 | 2 | 50 年 | 1 |

补充规则：

| 规则 | 说明 | 置信度 |
|---|---|---|
| 服务格 ↔ MW 换算 | 游戏内部只用"服务格"。显示用 `TILES_PER_MW = 3.55`（704/200 = 3.52，8880/2500 = 3.55，取中间值），`displayMW = round(tiles / TILES_PER_MW)`；电厂按钮上的容量标签直接用标称 MW | 中 |
| 电厂自身耗电 | 电厂每格也是 1 个耗电格（它在填充序列最前，所以永远先供自己）。因此煤电厂净可供外部 704 − 16 = 688 格 | 高 |
| 无月维护费 | 预算窗口没有电力/供水条目 | 高 |
| 水电选址 | 只能建在瀑布格：`XTER == 0x3E`（原版还把海岸变体 `0x2E` 当瀑布）；且该格无建筑。朝向由"哪些邻格更高"决定，两张精灵 `0xC6`/`0xC7` | 高 |
| 风电选址 | 任意陆地格；产量随海拔（`ALTM` 陆地高度 0–31）上升 | 高 |
| 核电法令 | 法令 Nuclear Free Zone 生效时不能新建核电；已有核电默认保留（见待确认 Q3）| 中 |
| NIMBY | 煤、油、气、核四种电厂有邻避效应（地价模块负责）| 高（名单）|
| 灾害钩子 | 地图上存在核电格 → 允许抽到 Meltdown；存在微波格 → 允许抽到 Microwave 失焦。两者都是"从扫描顺序上的第一座该类电厂"起爆 | 高 |

#### 2.3.1 科技解锁：本模块只查询，不拥有

科技时间线的**唯一所有者是 `sim/tech`**（规格见 `disasters-events.md` §2.9 与 §3.6：17 个 `MISC 0x0738..0x0778` 槽位、`base + rng.int(20)`、"已公告写 0"、2050 开局规则、`INVENTION/INNOVATION` 报纸）。基准年数值的唯一真源是 `building-catalogue.md` 的 `TECH_BASE_YEAR` 常量（按 `TechKey` 索引）。本文**不再**维护 `TechState`、`TECH_BASE_YEAR`、`techInvented` 事件或任何基准年表——旧稿的这些内容已删除，避免三处公告、三份年表。

本模块需要知道的只有：

| 事项 | 规则 |
|---|---|
| 能否放置某电厂 / 水设施 | 放置校验（`building-catalogue.md` §3 的 `canPlace`）调用 `env.invented(def.tech)`；`def.tech === null` 恒可用。本模块的 `POWER_PLANT_DEFS` / `WATER_FACILITY_DEFS` 只携带 `tech` 键 |
| 本模块用到的键 | `'gas' | 'nuclear' | 'solar' | 'wind' | 'microwave' | 'fusion' | 'waterTreatment' | 'desalinization'`（`TechKey` 全集 16 项，类型从契约包导入，见 §3.1）|
| 开局即有 | 煤、水、油电与水泵、水塔、管线、电线不受年份限制 **[高]**，表中 `tech: null` |
| 年初顺序 | `sim/tech.onNewYear(year)` 在 1 月第 0 天、预算之前运行并刷新工具栏；本模块的 `annualUtilityUpdate` 在其后（economy 的 `endOfYear` 第 3 步）。电厂到期自动重建**不**查科技（原地重建同类电厂，即使该科技"尚未发明"也成立——因为它已经建在那里了）|
| 读档 | 本模块不读写 `MISC 0x0738..0x0778`；工具栏初始可用性由 `sim/tech` 按 `invented == 0 || year >= invented` 判断 |
| 既有建筑 | 科技只影响放置；已存在的电厂 / 水设施无论年份都正常运转与计入扫描 |

#### 2.3.2 风电产量 [高]

每座风车每月重算一次（每格 1 座）：

```
alt   = ALTM 陆地高度(0..31)
wind  = MISC.Wind & 0xFF            // mph
r     = rngInt(0, floor(wind / 8))  // 风越大上限越高
tiles = floor((alt + r) / 2)
```

与 dfloer 的实测表（`alt // 2 + [0,3]`）在 wind ∈ 48–55 时完全一致：海拔 0 → 0–3 格，海拔 31 → 15–18 格。风电没有标称容量显示问题：UI 显示 `tiles / TILES_PER_MW`，四舍五入后多数时候是 1–5 MW。

#### 2.3.3 太阳能产量 [中]

每格每月独立抽样：

```
rain  = MISC.Humid & 0xFF           // mm
range = max(1, floor((100 - rain) / 10))
tilesPerCell = rngInt(0, range - 1) + 5
plantTiles   = Σ 16 格
```

无雨时每格 5–14（均值 9.5，整厂均值 152，范围 80–224）；降雨 ≥ 90 时每格恒为 5（整厂 80）。dfloer 观测到的均值 136 / 最大 190 与此略有出入，故标 **[中]**；把 `SOLAR_BASE = 5`、`SOLAR_RANGE_DIV = 10` 做成参数。

### 2.4 电力求解：两遍洪水填充 [高]

原版每月做一次全图电力扫描，逻辑如下（用我们的话复述；队列实现见 §3.3）：

1. 全图清 `POWERED` 与 `MARK`。
2. 按**线性索引升序**（`i = x*128 + y`，即 x 外层、y 内层，§1.1）遍历所有**电厂格**。若该格已 `POWERED`（说明属于前面处理过的网络），跳过。
3. **第一遍**：从该电厂格起做 4 邻域 BFS，只走 `POWERABLE` 且未 `MARK` 的格子，沿途 `MARK`。累加：
   - `capacity += plantTileOutput(tile)`（每个电厂格按 §2.3 的每格产量；风/太阳能在此刻抽样）
   - `consumers += 1`，条件：`XBLD >= 0x70` 且不是电厂格（统计口径）
   - 记录访问顺序 `order[]`
4. 法令 Energy Conservation 生效：`capacity += floor(capacity / 12)`（原版是"抬高容量 1/12"，等价于需求 ×12/13，不是 ×11/12）。
5. **第二遍**：按 `order[]` 重放：若 `budget != 0`，置 `POWERED`；若该格 `XBLD >= 0x70`（**含电厂格、水泵、一切建筑**）则 `budget -= 1`；电线格（`< 0x70`）受电但不扣预算。清 `MARK`。
6. 统计：`supplied += min(capacity, consumers)`，`generation += capacity`，`totalConsumers += consumers`。
7. 全部网络处理完：`usagePct = generation > 0 ? min(100, floor(supplied * 100 / generation)) : 100`。

推论（都是 **[高]**）：

- 同一连通网络中的多座电厂**合并容量**；不连通的网络互不借电。
- **Brownout 的空间模式**：断电的是 BFS 序中靠后的格子，即离"第一座被遍历到的电厂"（索引最小、也就是 x 最小、同 x 下 y 最小的电厂格）最远的那一片；不是随机，也不是按比例。原版邻居顺序按 `(dx, dy)` 写是 `(0,-1)`、`(-1,0)`、`(0,+1)`、`(+1,0)`，按索引增量写是 `i-1`、`i-128`、`i+1`、`i+128`（§1.1），我们沿用以便对照存档。这个顺序与扫描起点共同决定断电图样，任何一处写反都会让断电区与原版镜像 / 转置。
- 帮助文本声称"电线有轻微传输损耗"，算法里**不存在**任何距离衰减。
- 原版 BFS 用 512 项环形队列，队满时丢弃最旧项，因而极宽的网络会漏掉一些格子（反映在存档里就是零星无电的孤格）。我们默认不复现（队列容量 = 16384），提供 `legacyTraceQueue: 512 | 0` 开关用于存档对照测试。

### 2.5 断电的表现 [高，除特别标注]

| 现象 | 规则 |
|---|---|
| 闪电图标 | 绘制在 `XBLD >= 0x70` 且 `POWERABLE && !POWERED` 的格子上（闪烁）。空分区地**不**显示（它不是 `POWERABLE`）|
| 分区生长 | 生长候选格需 `hasPower(x,y)`：**自身或任一 4 邻格** `POWERED`。因为空分区地不导电，发展会从电线/已供电建筑旁边一格一格"蔓延"出去——这就是原版沿电线先长房子的观感。（原版此处有 `x > 1 && y > 1` 的边界小 bug，我们用 `> 0`）|
| 已建建筑 | 人口按 0、不缴税（`zones-growth-demand.md` §2.4）；连续断电超过宽限期衰退 |
| 公共设施 | 警/消覆盖为 0、学校医院无效、火车站不发车、码头不出帆船、机场不起飞 **[中]**；arco 评分减半 |
| 水设施 | 水泵/海水淡化产量 0；水塔不能蓄水（但已蓄的水仍可放出一次）；净水厂不计入"充足" |
| 顾问 / 报纸 | `usagePct >= 98` → `needPower`（每年最多一次）；`supplied < totalConsumers` → `brownout` 新闻 |
| 月度城市状态 | 原版的月度状态消息索引会读 power/water 利用率；由报纸模块消费 `usagePct` |

### 2.6 电厂寿命、老化与到期 [高（来源：年度微模拟逻辑）]

只有微模拟类型 1 的电厂（煤/油/气/核/太阳能/微波/聚变）会老化；水电（类型 21）与风电（类型 20）**永不到期**（与社区 FAQ 一致）。

每座电厂一条 `XMIC` 记录（8 字节）：

| 偏移 | 内容 |
|---|---|
| +0 | `XBLD` 类型 |
| +1 | **年龄（年）**，每年 1 月 +1，字节回绕 |
| +2..3 | 未使用（写 0）|
| +4..5 | 负载显示值 = 本年电力 `usagePct + rngInt(0,7)`（查询窗口显示的"% of capacity"）|
| +6..7 | 未使用 |

年度更新（每年 1 月，遍历电厂记录）：

```
age += 1
if age > 48: emit plantAging(plant)           // 报纸 "old power plant"（连续两年提醒）
if age > 50:
  cost = buildCost(plant.kind)
  if settings.noDisasters && funds >= cost:
      funds -= cost; age = 0; emit plantAutoRebuilt(plant)   // 禁用灾害时自动原地重建并扣费
  else:
      destroyStructure(plant)                                  // 爆炸：整厂格变瓦砾并起火（走灾害模块的毁损例程）
      emit plantExpired(plant); autoGoto(plant) if settings.autoGoto
```

即有效寿命 50 个完整年，第 51 次年度更新时处理。新建电厂 `age = 0`；读档时从 `XMIC` 恢复。

### 2.7 电线放置规则

| 规则 | 说明 | 置信度 |
|---|---|---|
| 价格 | 陆地 $2/格；跨水自动变为架空电线 `0x5C`，$10/格 | 中 |
| 形状 | 15 种（`0x0E–0x1C`），由 4 邻接自动选形（§3.5 表）；斜坡用 H 变体 | 高 |
| 交叉 | 与路/铁/高速只能**直角**交叉，生成 `0x43/0x44/0x47/0x48/0x4F/0x50`；不能在交叉格上拐弯或分叉 | 高 |
| 覆盖分区 | 电线可放在空分区地上且**保留**分区码（道路则会清掉分区类型）| 中 |
| 不可放置 | 有建筑的格子、水面（会变架空线）、另一网络瓦片的非直角处 | 高 |
| 拆除 | 推土 $1，清 `POWERABLE`；道路/铁路自然衰朽成瓦砾时也会清 `POWERABLE` | 高 |

### 2.8 供水设施总表 [价格/占地：高；年份：见 §2.3.1；产量：高]

| XBLD / XUND | 设施 | 价格 | 占地 | 需供电 | 作用 | 每格污染 | 微模拟 |
|---|---|---|---|---|---|---|---|
| `XUND 0x10–0x1E`（+ 十字口 `0x1F/0x20`）| Pipes 管线 | $3/格 | 1x1 地下 | 否 | 导水 | 0 | 无 |
| `0xDC` | Water Pump 水泵 | $100 | 1x1 | **是** | 产水（§2.8.1）；放置时自动在下方铺一格管线 | 2 | 无 |
| `0xEB` | Water Tower 水塔 | $250 | 2x2 | **是**（蓄水时）| 每格蓄 100 单位，整座 400（§2.8.3）| 0 | 无 |
| `0xF4` | Water Treatment 净水厂 | $500 | 2x2 | **是** | 每座覆盖 2,000 个受水建筑格；充足时全城污染除数 +1（§2.8.4）| 10 | 13 |
| `0xFA` | Desalinization 海水淡化 | $1,000 | 3x3 | **是** | 产水（§2.8.2），只对咸水有效 | 0 | 14 |

显示单位：游戏显示加仑/月，`gallons = tiles * 720` **[高]**（dfloer 例：67 格 → 48,240）。水塔容量在原版显示为 40,000 加仑（= 400 × 100）**[低]**，说明水塔用了另一换算；实现用 `TOWER_GALLONS_PER_UNIT = 100` 单独配置。

#### 2.8.1 水泵产量 [高]

```
base   = floor((MISC.Humid & 0xFF) / 2) + MISC.WaterLevel * 5     // 全城统一，每月重算
fresh  = 3x3 邻域内 (WATER && !SALTWATER) 的格数，0..8
tiles  = powered ? base + 10 * fresh : 0
```

dfloer 例：水位 4、4 格淡水、14 mm 雨 → 20 + 40 + 7 = 67。远离水体的水泵只有 `base`，在干旱月份可能很低。

#### 2.8.2 海水淡化产量 [高]

逐格计算再求和（9 格各自看自己的 3x3 邻域）：

```
tiles = powered ? Σ_{9 格} 20 * count3x3(WATER && SALTWATER) : 0
```

四面环海的 3x3 厂：4 角格各 5 咸水 + 4 边格各 3 咸水 + 中心 0 = 32 → 640 格；一条电线占掉一侧中点时 = 29 → 580 格。淡水湖旁为 0。

#### 2.8.3 水塔 [高（机制）]

- 每个水塔格贡献 `towerCapacity += 100`。
- 水塔格的 `WATERED` 位表示"已蓄水"，扫描开始时**不清**（其他格都清）。
- 第一遍遇到已蓄水的水塔格：`supply += 100`，然后清掉它的 `WATERED`（本月放水）。
- 第二遍：`towersToFill = floor((min(supply − served, towerCapacity) + 50) / 100)`；按序给**有电**的水塔格置 `WATERED` 并 `towersToFill -= 1`。
- 因此蓄水是**每格二值**、只保存一个月的富余：富余 ≥ 50 才填第一格，≥ 150 填第二格……下月每个已蓄格放出 100。
- 水塔不是水源：孤立在没有水泵的管网上的水塔永远不会被遍历，既不蓄也不放。

#### 2.8.4 净水厂 [高（机制）/ 效果幅度 中]

- 不产水、不耗水；有电时自身格置 `WATERED`（显示用）。
- `treatmentCapacity = floor(treatmentTiles / 4) * 2000`（`treatmentTiles` 取 `MISC 0x01F0 + 0xF4*4` 的建筑格计数）。
- `treatmentSufficient = (wateredConsumers <= treatmentCapacity)`，写入 `MISC 0x104C`（逆向重实现把该偏移解读为此标志；dfloer 标为 "Go Disaster"，见 Q5）。
- 污染模块用它：`pollutionDivisor = max(1, 4 + treatmentSufficient − industrialPollutionBonus + (PollutionControls ? 1 : 0))`，即充足时全城污染额外除以 (d+1)/d。
- 净水厂本身每格污染 10，且在 NIMBY 名单上。

### 2.9 供水求解：两遍洪水填充 [高]

在电力扫描**之后**执行（水泵需要本月的 `POWERED`）。

1. 全图清 `WATERED` 与 `MARK`，但**水塔格保留 `WATERED`**。
2. 按**线性索引升序**（同电力：`i = x*128 + y`，x 外层、y 内层）遍历所有**水泵格与海水淡化格**（水源）。若已 `WATERED`（属于已处理网络）或未 `POWERED`，跳过。邻居顺序与电力扫描完全相同（`i-1, i-128, i+1, i+128`）。
3. **第一遍**：从水源格起 4 邻域 BFS，只走 `PIPED` 且未 `MARK` 的格子。对每个访问格按 `XBLD` 分类：
   - `< 0x70`（纯管线 / 管线下的道路电线等）：不计
   - 水泵：`supply += pumpOutput`
   - 水塔：`towerCapacity += 100`；若已蓄水 `supply += 100`；清其 `WATERED`
   - 海水淡化：`supply += desalOutput`
   - 净水厂：不计
   - 其他一切 `>= 0x70`（含电厂、公共建筑、arco、大公园、施工/废弃）：`consumers += 1`
4. `served = min(supply, consumers)`；`towersToFill` 见 §2.8.3。
5. **第二遍**按同一顺序重放：
   - `< 0x70`：若 `served != 0` 置 `WATERED`（管线显示"有水流动"的变体）
   - 水泵 / 净水厂 / 海水淡化：有电则置 `WATERED`
   - 水塔：有电且 `towersToFill > 0` → 置 `WATERED`，`towersToFill -= 1`
   - 其他建筑：若 `served != 0` → 置 `WATERED`，`served -= 1`
6. 统计：`totalSupply += supply`、`totalConsumers += consumers`、`wateredConsumers += min(supply, consumers)`；`usagePct = totalSupply > 0 ? floor(wateredConsumers * 100 / totalSupply) : 100`。

推论：

- 缺水时与电一样按 BFS 序切断尾部。
- **"幽灵水泵"**：利用率只统计"被某个水源网络遍历到的建筑"。一个通电但不连任何建筑的水泵会让 `usagePct = 0`、顾问不再喊缺水——但没接管线的区仍然无水。我们保留原版统计口径以兼容显示，另算 `unwateredBuildingTiles = count(XBLD >= 0x70 && !WATERED)` 供顾问使用（§3.6）。
- 建筑自带 `PIPED`，所以只需把干管铺到建筑群边缘，水会穿过相邻建筑继续传；空分区地与道路不导水，隔一条没铺管的路就断。

### 2.10 无水的后果 [高/中]

| 影响 | 规则 | 置信度 |
|---|---|---|
| 生长 | **不是**发展前提 | 高 |
| 地价 | 受水格对住宅地价基值 +4、对工业地价基值 +4（粗/细两种地价图都如此）| 高 |
| arco | 评分减半（与断电叠乘）| 高 |
| 密度 | 原版未见"无水不能长 3x3"的硬规则；`zones-growth-demand.md` 的 `DENSE_UNWATERED_MAX_SIZE = 2` 是本项目设计选择，保留为可调参数 | 低 |
| 顾问 / 报纸 | `usagePct >= 98` → `needWater`；`wateredConsumers < totalConsumers` → `waterShortage` | 高（阈值来源 dfloer）|
| 图表 | `XGRP` Water % = `usagePct`；Power % 同理 | 高 |

### 2.11 地下层 `XUND` 编码与管线放置 [高]

| XUND | 含义 |
|---|---|
| `0x00` | 无 |
| `0x01–0x0F` | 地铁，15 种形状，顺序同电线表 |
| `0x10–0x1E` | 管线，15 种形状，顺序同电线表（见 §3.5）|
| `0x1F` | 十字口：管线 T-B × 地铁 L-R |
| `0x20` | 十字口：管线 L-R × 地铁 T-B |
| `0x22` | 导弹发射井地下部分 |
| `0x23` | 地铁站 / 地铁-铁路转换的地下部分 |

放置规则：

| 规则 | 说明 | 置信度 |
|---|---|---|
| 可铺位置 | 任何陆地格之下，包括建筑、道路、电线、分区之下；不能铺在水面之下 | 中（水下禁铺为推测）|
| 与地铁共格 | 仅当地铁是直线且与管线垂直：空→`0x10/0x11`；地铁 LR(`0x01`)+管线 → `0x1F`；地铁 TB(`0x02`)+管线 → `0x20`；地铁其他形状 → 拒绝 | 高 |
| 与 `0x22/0x23` 共格 | 拒绝 | 高 |
| 自动选形 | 由 4 邻接的"可连接管线"决定；**无任何邻接时取 4 向十字 `0x1E`**（原版孤立管线显示为十字）| 高 |
| 斜坡 | 单边斜坡（`XTER 0x01–0x04`）上的直管用 H 变体 `0x12–0x15` | 高 |
| 拆除 | 地下视图推土 $1；若同格有地铁十字口则退化为纯地铁 `0x01/0x02` | 中 |
| 水泵自动管线 | 放置水泵时若其下为空 → `0x10`；为地铁 LR → `0x1F`；为地铁 TB → `0x20` | 高 |

---

## 3. 数据结构与算法建议

### 3.1 TypeScript 接口

```ts
export const enum XBit {
  SaltWater = 0x01, Flipped = 0x02, Water = 0x04, Mark = 0x08,
  Watered = 0x10, Piped = 0x20, Powered = 0x40, Powerable = 0x80,
}
export const DEVELOPED_FIRST = 0x70;          // XBLD >= 0x70 即"建筑格"

export type PowerPlantKind =
  | 'coal' | 'hydro' | 'oil' | 'gas' | 'nuclear' | 'wind' | 'solar' | 'microwave' | 'fusion';

export interface PowerPlantDef {
  kind: PowerPlantKind;
  xbld: readonly number[];        // hydro 有两个 ID
  size: 1 | 4;                    // 边长
  cost: number;
  nominalMW: number;
  /** 每格产量；'formula' 表示用 windOutput / solarOutput */
  tilesPerCell: number | 'wind' | 'solar';
  pollutionPerCell: number;       // 0..50，污染模块乘以系数
  expires: boolean;               // 50 年寿命
  microsimType: number;           // 1 / 20 / 21
  tech: TechKey | null;           // null = 开局可用；非 null 时放置前查 env.invented(tech)
  nimby: boolean;
  disaster: 'meltdown' | 'microwave' | null;
}

// TechKey 由契约包导出（定义见 building-catalogue.md §3，16 项全集）；本模块只用其中 8 项。
// 不在本模块定义 TechState / TECH_BASE_YEAR：所有者是 sim/tech（disasters-events.md §2.9）。
import type { TechKey } from '@sc2k/contracts';

/** 本模块对外部状态的只读查询面；由宿主注入，便于单测 */
export interface UtilityEnv {
  tileIndex(x: number, y: number): number;   // 契约包同名函数；x*128+y
  tileX(i: number): number;                  // i >> 7
  tileY(i: number): number;                  // i & 127
  year(): number;
  invented(tech: TechKey): boolean;          // sim/tech：invented == 0 || year >= invented
  ordinance(id: OrdinanceId): boolean;       // 本模块只用 EnergyConservation
  settings: { noDisasters: boolean; autoGoto: boolean };
}

export type WaterFacilityKind = 'pump' | 'tower' | 'treatment' | 'desalinization';
export interface WaterFacilityDef {
  kind: WaterFacilityKind; xbld: number; size: 1 | 2 | 3; cost: number;
  needsPower: boolean; pollutionPerCell: number; tech: TechKey | null; nimby: boolean;
}

export interface UtilityTuning {
  tilesPerMW: number;                 // 3.55
  gallonsPerTile: number;             // 720
  towerGallonsPerUnit: number;        // 100
  towerUnitsPerCell: number;          // 100
  towerRoundHalf: number;             // 50
  treatmentTilesPerPlant: number;     // 2000
  pumpFreshBonus: number;             // 10
  pumpRainDiv: number;                // 2
  pumpWaterLevelMul: number;          // 5
  desalSaltBonus: number;             // 20
  solarBase: number;                  // 5
  solarRangeDiv: number;              // 10
  windGustDiv: number;                // 8
  energyConservationDiv: number;      // 12
  plantAgingWarnAfter: number;        // 48
  plantLifeYears: number;             // 50
  needThresholdPct: number;           // 98
  powerLineCost: number;              // 2
  elevatedLineCost: number;           // 10
  pipeCost: number;                   // 3
  legacyTraceQueue: 0 | 512;          // 0 = 不复现原版队列丢弃
  /** 4 邻居顺序，元素为 (dx, dy)；默认 [[0,-1],[-1,0],[0,1],[1,0]]，
   *  在 i = x*128+y 下对应索引增量 [-1, -128, +1, +128]。只允许重排，不允许增删。 */
  neighborOrder: readonly (readonly [dx: number, dy: number])[];
}

export interface PowerPlantInstance {
  anchor: number;                 // tileIndex(x0, y0) = x0*128 + y0，左上格（最小 x、最小 y）
  kind: PowerPlantKind; builtYear: number; ageYears: number;
  microsimIndex: number;          // XMIC 槽位
  lastLoadPct: number;            // usagePct + jitter，查询窗口显示
}

export interface PowerNetwork {
  id: number; plantAnchors: number[]; capacity: number; consumers: number;
  supplied: number; tiles: number;          // 调试 / 查询窗口用
}
export interface PowerReport {
  generation: number; consumers: number; supplied: number; usagePct: number;
  networks: PowerNetwork[]; unpoweredBuildingTiles: number;
}
export interface WaterReport {
  supply: number; consumers: number; watered: number; usagePct: number;
  towerCapacity: number; towerCharged: number;
  treatmentCapacity: number; treatmentSufficient: boolean; unwateredBuildingTiles: number;
}

export interface UtilityState {
  xbit: Uint8Array;               // 16384，与存档 XBIT 同布局（i = x*128+y），与地形模块共享同一实例
  plants: PowerPlantInstance[];
  lastPower: PowerReport; lastWater: WaterReport;
  dirty: { power: boolean; water: boolean };
  // 临时区，不进存档
  scratchMark: Uint8Array; queue: Int32Array; order: Int32Array;
}

export type UtilityEvent =
  | { type: 'brownout'; unpowered: number }
  | { type: 'waterShortage'; unwatered: number }
  | { type: 'needPower' } | { type: 'needWater' }
  | { type: 'plantAging'; plant: PowerPlantInstance }
  | { type: 'plantExpired'; plant: PowerPlantInstance }
  | { type: 'plantAutoRebuilt'; plant: PowerPlantInstance; cost: number };
// 没有 techInvented：发明公告由 sim/tech 的 newsStory(INVENTION | INNOVATION, slot) 独家发出
```

### 3.2 电厂 / 水设施定义表（直接落代码）

```ts
export const POWER_PLANT_DEFS: Record<PowerPlantKind, PowerPlantDef> = {
  coal:      { kind:'coal',      xbld:[0xCF],      size:4, cost:4000,  nominalMW:200,  tilesPerCell:44,      pollutionPerCell:50, expires:true,  microsimType:1,  tech:null,        nimby:true,  disaster:null },
  hydro:     { kind:'hydro',     xbld:[0xC6,0xC7], size:1, cost:400,   nominalMW:20,   tilesPerCell:40,      pollutionPerCell:0,  expires:false, microsimType:21, tech:null,        nimby:false, disaster:null },
  oil:       { kind:'oil',       xbld:[0xCA],      size:4, cost:6600,  nominalMW:220,  tilesPerCell:48,      pollutionPerCell:25, expires:true,  microsimType:1,  tech:null,        nimby:true,  disaster:null },
  gas:       { kind:'gas',       xbld:[0xC9],      size:4, cost:2000,  nominalMW:50,   tilesPerCell:11,      pollutionPerCell:10, expires:true,  microsimType:1,  tech:'gas',       nimby:true,  disaster:null },
  nuclear:   { kind:'nuclear',   xbld:[0xCB],      size:4, cost:15000, nominalMW:500,  tilesPerCell:111,     pollutionPerCell:2,  expires:true,  microsimType:1,  tech:'nuclear',   nimby:true,  disaster:'meltdown' },
  wind:      { kind:'wind',      xbld:[0xC8],      size:1, cost:100,   nominalMW:4,    tilesPerCell:'wind',  pollutionPerCell:0,  expires:false, microsimType:20, tech:'wind',      nimby:false, disaster:null },
  solar:     { kind:'solar',     xbld:[0xCC],      size:4, cost:1300,  nominalMW:50,   tilesPerCell:'solar', pollutionPerCell:0,  expires:true,  microsimType:1,  tech:'solar',     nimby:false, disaster:null },
  microwave: { kind:'microwave', xbld:[0xCD],      size:4, cost:28000, nominalMW:1600, tilesPerCell:355,     pollutionPerCell:0,  expires:true,  microsimType:1,  tech:'microwave', nimby:false, disaster:'microwave' },
  fusion:    { kind:'fusion',    xbld:[0xCE],      size:4, cost:40000, nominalMW:2500, tilesPerCell:555,     pollutionPerCell:2,  expires:true,  microsimType:1,  tech:'fusion',    nimby:false, disaster:null },
};

export const WATER_FACILITY_DEFS: Record<WaterFacilityKind, WaterFacilityDef> = {
  pump:           { kind:'pump',           xbld:0xDC, size:1, cost:100,  needsPower:true, pollutionPerCell:2,  tech:null,             nimby:false },
  tower:          { kind:'tower',          xbld:0xEB, size:2, cost:250,  needsPower:true, pollutionPerCell:0,  tech:null,             nimby:false },
  treatment:      { kind:'treatment',      xbld:0xF4, size:2, cost:500,  needsPower:true, pollutionPerCell:10, tech:'waterTreatment', nimby:true  },
  desalinization: { kind:'desalinization', xbld:0xFA, size:3, cost:1000, needsPower:true, pollutionPerCell:0,  tech:'desalinization', nimby:false },
};

// 基准年常量 TECH_BASE_YEAR 不在此定义：真源是 building-catalogue.md（按 TechKey 索引，
// 覆盖全部 16 键）；sim/tech 的 rollInventions 读它，本模块只读 env.invented()。
```

### 3.3 网络求解：选 BFS 两遍，不选并查集

- 全图 16,384 格，一次两遍 BFS 是 O(N)、无分配（预先分配 `queue/order: Int32Array(16384)` 与 `scratchMark: Uint8Array(16384)`），在 JS 中 < 1 ms。每月跑一次 + 玩家改动后跑一次，完全够用。
- 并查集只能回答"连不连通"，无法给出**有序的**供电顺序，而缺电时的断电模式依赖顺序；所以并查集不作为主算法。若将来要做增量（例如每帧高亮鼠标所在网络），可在 BFS 结束后顺手写一张 `networkId: Int16Array`，查询 O(1)。
- `scratchMark` 代替 `XBIT.MARK`：避免把脏位写进存档；读档时无条件把 `XBIT & ~0x08`。

**电力扫描伪代码**

```
function runPowerScan(city, st, tune, rng): PowerReport
  xbit = st.xbit
  for i in 0..N-1: xbit[i] &= ~(Powered)        // 不动 Powerable/Piped/Watered
  st.scratchMark.fill(0)
  report = { generation:0, consumers:0, supplied:0, networks:[] }

  for each start in plantTileIndices(city)      // 线性索引升序 = x 外层、y 内层（i = x*128+y，§1.1）
    if xbit[start] & Powered: continue
    // 第一遍
    head = tail = 0; order[tail++] = start; mark[start] = 1
    capacity = 0; consumers = 0
    while head < tail:
      i = order[head++]
      b = city.xbld[i]
      if isPlantTile(b): capacity += plantCellOutput(city, b, i, rng)
      else if b >= DEVELOPED_FIRST: consumers += 1
      for (dx,dy) in tune.neighborOrder:
        j = neighbor(i, dx, dy); if j < 0: continue
        if !mark[j] && (xbit[j] & Powerable): mark[j] = 1; order[tail++] = j
    if ordinance(EnergyConservation): capacity += floor(capacity / tune.energyConservationDiv)
    // 第二遍
    budget = capacity
    for k in 0..tail-1:
      i = order[k]
      if budget != 0:
        xbit[i] |= Powered
        if city.xbld[i] >= DEVELOPED_FIRST: budget -= 1
      mark[i] = 0
    report.generation += capacity; report.consumers += consumers
    report.supplied += min(capacity, consumers)
    report.networks.push({ capacity, consumers, supplied: min(capacity, consumers), tiles: tail, ... })

  report.usagePct = report.generation > 0 ? min(100, floor(report.supplied*100/report.generation)) : 100
  report.unpoweredBuildingTiles = count(i: xbld[i] >= 0x70 && (xbit[i] & Powerable) && !(xbit[i] & Powered))
  return report
```

`plantCellOutput(city, b, i, rng)`：

```
switch kindOf(b):
  hydro: 40;  coal: 44;  oil: 48;  gas: 11;  nuclear: 111;  microwave: 355;  fusion: 555
  wind:  floor((altitude(i) + rngInt(0, floor((misc.wind & 0xFF) / tune.windGustDiv))) / 2)
  solar: rngInt(0, max(1, floor((100 - (misc.humid & 0xFF)) / tune.solarRangeDiv)) - 1) + tune.solarBase
```

注意：原版在第一遍**遇到电厂格时**抽样，所以 4x4 太阳能的 16 格各抽一次；风车只有 1 格。`rng` 必须是模拟主 PRNG（可重放）。

**供水扫描伪代码**

```
function runWaterScan(city, st, tune): WaterReport
  xbit = st.xbit
  for i in 0..N-1:
    if city.xbld[i] != 0xEB: xbit[i] &= ~Watered          // 水塔格保留蓄水位
  mark.fill(0)
  base = floor((misc.humid & 0xFF) / tune.pumpRainDiv) + misc.waterLevel * tune.pumpWaterLevelMul
  report = { supply:0, consumers:0, watered:0, towerCapacity:0, towerCharged:0 }

  for each start in sourceTileIndices(city)        // 0xDC 与 0xFA 的格，线性索引升序（同电力）
    if (xbit[start] & Watered) || !(xbit[start] & Powered): continue
    head = tail = 0; order[tail++] = start; mark[start] = 1
    supply = 0; consumers = 0; towerCap = 0
    while head < tail:
      i = order[head++]; b = city.xbld[i]
      if b >= DEVELOPED_FIRST:
        if b == 0xDC:      supply += (xbit[i] & Powered) ? base + tune.pumpFreshBonus * count3x3(i, Water, /*salt*/false) : 0
        elif b == 0xEB:    towerCap += tune.towerUnitsPerCell
                           if xbit[i] & Watered: supply += tune.towerUnitsPerCell
                           xbit[i] &= ~Watered
        elif b == 0xFA:    supply += (xbit[i] & Powered) ? tune.desalSaltBonus * count3x3(i, Water, /*salt*/true) : 0
        elif b != 0xF4:    consumers += 1
      for (dx,dy) in tune.neighborOrder:
        j = neighbor(i, dx, dy); if j < 0: continue
        if !mark[j] && (xbit[j] & Piped): mark[j] = 1; order[tail++] = j
    served = min(supply, consumers)
    towersToFill = floor((min(supply - served, towerCap) + tune.towerRoundHalf) / tune.towerUnitsPerCell)
    for k in 0..tail-1:
      i = order[k]; b = city.xbld[i]
      if b < DEVELOPED_FIRST:                 if served != 0: xbit[i] |= Watered
      elif b in (0xDC, 0xF4, 0xFA):           if xbit[i] & Powered: xbit[i] |= Watered
      elif b == 0xEB:                         if (xbit[i] & Powered) && towersToFill > 0: xbit[i] |= Watered; towersToFill -= 1; report.towerCharged += 1
      else:                                   if served != 0: xbit[i] |= Watered; served -= 1
      mark[i] = 0
    report.supply += supply; report.consumers += consumers; report.watered += min(supply, consumers)
    report.towerCapacity += towerCap

  report.usagePct = report.supply > 0 ? floor(report.watered * 100 / report.supply) : 100
  report.treatmentCapacity = floor(tileCount(0xF4) / 4) * tune.treatmentTilesPerPlant
  report.treatmentSufficient = report.watered <= report.treatmentCapacity
  misc[0x104C] = report.treatmentSufficient ? 1 : 0
  report.unwateredBuildingTiles = count(i: xbld[i] >= 0x70 && !(xbit[i] & Watered))
  return report
```

`count3x3(i, Water, salt)`：以 `i` 为中心的 3x3（越界跳过）中满足 `(xbit & (Water|SaltWater)) == (salt ? Water|SaltWater : Water)` 的格数。

**索引辅助函数（两段扫描共用，必须经由契约包的 `tileIndex/tileX/tileY`）**

```
function neighbor(i, dx, dy): int            // 越界返回 -1
  x = env.tileX(i) + dx; y = env.tileY(i) + dy
  if x < 0 || x > 127 || y < 0 || y > 127: return -1
  return env.tileIndex(x, y)                  // == i + dx*128 + dy

function count3x3(i, salt): int
  cx = env.tileX(i); cy = env.tileY(i); n = 0
  for dx in -1..1: for dy in -1..1:
    x = cx + dx; y = cy + dy
    if x < 0 || x > 127 || y < 0 || y > 127: continue
    v = xbit[env.tileIndex(x, y)] & (Water | SaltWater)
    if v == (salt ? Water | SaltWater : Water): n += 1
  return n

plantTileIndices(city) / sourceTileIndices(city):
  for i in 0..16383: if 命中: yield i          // 这就是"索引升序"，不要另写 (y, x) 双重循环
```

`neighbor()` 不能用 `i - 1` 直接减：当 `y == 0` 时 `i - 1` 会落到 `(x-1, 127)`，是另一列的末格。`count3x3` 同理。

### 3.4 每月结算与年度结算

```
function monthlyUtilitySettlement(city, st, tune, rng, out: UtilityEvent[])
  // 顺序固定：先电后水（水泵依赖本月 Powered）；在分区生长、地价/污染扫描之前运行
  p = runPowerScan(city, st, tune, rng)
  w = runWaterScan(city, st, tune)
  st.lastPower = p; st.lastWater = w; st.dirty = { power:false, water:false }

  // 统计 / 图表
  xgrp.push('power%', p.usagePct); xgrp.push('water%', w.usagePct)

  // 事件（报纸/顾问去重：needPower/needWater 每年至多一次，由报纸模块节流）
  if p.supplied < p.consumers:        out.push({ type:'brownout', unpowered: p.unpoweredBuildingTiles })
  if p.generation > 0 ? p.usagePct >= tune.needThresholdPct : p.consumers > 0:
                                      out.push({ type:'needPower' })
  if w.watered < w.consumers:         out.push({ type:'waterShortage', unwatered: w.unwateredBuildingTiles })
  if w.supply > 0 ? w.usagePct >= tune.needThresholdPct : w.consumers > 0:
                                      out.push({ type:'needWater' })

function annualUtilityUpdate(city, st, tune, rng, out)      // 每年 1 月；由 economy endOfYear 第 3 步调用，
                                                             // 在 sim/tech.onNewYear(year)（第 2 步）之后。本函数不碰科技。
  for plant in st.plants:
    def = POWER_PLANT_DEFS[plant.kind]
    plant.lastLoadPct = st.lastPower.usagePct + rngInt(0, 7)
    if !def.expires: continue
    plant.ageYears += 1
    if plant.ageYears > tune.plantAgingWarnAfter: out.push({ type:'plantAging', plant })
    if plant.ageYears > tune.plantLifeYears:
      if settings.noDisasters && city.funds >= def.cost:
        city.funds -= def.cost; plant.ageYears = 0; out.push({ type:'plantAutoRebuilt', plant, cost: def.cost })
      else:
        disasters.destroyStructure(plant.anchor, { explode:true, fire:true })   // 格变瓦砾 + 起火
        removePlantRecord(plant); st.dirty.power = true; out.push({ type:'plantExpired', plant })
  // 每月 1 日 ageYears 不变；年龄只在此处 +1
```

玩家改动（放电线/管线/建筑/推土/电厂到期）→ 置 `st.dirty.*`，在同一模拟 tick 末尾立即重扫（原版在小城市也是放置后立刻重扫）。新放置的建筑格先乐观置 `Powered`（不置 `Watered`），避免闪一帧闪电。

### 3.5 电线 / 管线 / 地铁的自动选形表 [高]

形状偏移（电线 = `0x0E + k`，管线 = `0x10 + k`，地铁 = `0x01 + k`）：

| k | 形状 | 邻接集合 {T,B,L,R} 触发 |
|---|---|---|
| 0 | L-R | {L,R}、{L}、{R}、{}（电线/地铁默认）|
| 1 | T-B | {T,B}、{T}、{B} |
| 2 | HT-B（上高）| 斜坡 `XTER 0x01` 上的 T-B |
| 3 | L-HR（右高）| 斜坡 `XTER 0x02` 上的 L-R |
| 4 | T-HB（下高）| 斜坡 `XTER 0x03` 上的 T-B |
| 5 | HL-R（左高）| 斜坡 `XTER 0x04` 上的 L-R |
| 6 | BR | {B,R} |
| 7 | BL | {B,L} |
| 8 | TL | {T,L} |
| 9 | TR | {T,R} |
| 10 | RTB | {R,T,B} |
| 11 | LBR | {L,B,R} |
| 12 | TLB | {T,L,B} |
| 13 | LTR | {L,T,R} |
| 14 | LTBR | {T,B,L,R}；**管线在 {} 时也用此形** |

"邻接"的判定：电线看邻格是否 `POWERABLE`（这样电线会主动接到建筑、电厂、十字口上）；管线看邻格 `XUND` 是否为管线/管线十字口（建筑的隐式管线**不**改变管线外观）。放置/拆除后要对自身与 4 邻格重新选形。

电线十字口生成：在 `0x1D`(路 LR) 上放南北线 → `0x43`；`0x1E`(路 TB) 上放东西线 → `0x44`；铁路 LR/TB → `0x47/0x48`；高速 LR/TB → `0x4F/0x50`。反向（在电线上铺路）由道路模块生成同样的 ID。

### 3.6 查询窗口与渲染钩子

| 场景 | 数据来源 |
|---|---|
| 电厂查询 | 名称、标称 MW、`lastLoadPct`、年龄 / 剩余年限（`expires` 时）、所在网络的 `capacity/consumers` |
| 水泵 / 淡化查询 | 本月产量 `tiles` 与 `tiles * gallonsPerTile` 加仑 |
| 水塔查询 | 已蓄格数 × `towerUnitsPerCell`，显示 `× towerGallonsPerUnit` 加仑 |
| 断电图标 | `xbld >= 0x70 && (xbit & Powerable) && !(xbit & Powered)` → 叠加闪烁"闪电"精灵（原创占位；导入 LARGE.DAT 时用其 brownout 精灵）|
| 地下视图 | `PIPED && WATERED` 的管线用"有水"变体；建筑格若 `PIPED` 画一截短管桩，`WATERED` 时用有水变体；地表格按 `WATERED` 着色 |
| 小地图 Water | `WATERED` 格着色 |

### 3.7 存档映射

| 我方状态 | 存档位置 |
|---|---|
| `xbit` | `XBIT` 原样（存前 `& ~0x08`）|
| 水塔蓄水 | 水塔格的 `XBIT.WATERED` |
| 管线 | `XUND` |
| `plants[].ageYears` / `lastLoadPct` | `XMIC` 记录 +1 / +4（记录槽位由 `XTXT` 的微模拟标签索引指向，见文件规格）|
| （科技年份）| **不由本模块读写**：`MISC 0x0738..0x0778` 属于 `sim/tech`（`disasters-events.md` §2.9）|
| `treatmentSufficient` | `MISC 0x104C` |
| 利用率历史 | `XGRP` Power % / Water % |
| 建筑格计数 | `MISC 0x01F0 + xbld*4`（净水厂容量从这里读）|

读档后立即跑一次 `runPowerScan` + `runWaterScan`（原版载入时也会先扫电再扫水），否则 UI 在首月没有利用率。

### 3.8 测试建议（vitest）

索引转置是编译期发现不了的整体性错误，必须靠测试兜底。至少写下面这些（`fixtures/` 下的 `.SC2` 用文件规格的写入器手工构造，不含任何原版数据）：

| 测试 | 构造 | 断言 |
|---|---|---|
| T1 契约一致 | 对全部 `(x, y)` | `tileIndex(x,y) === x*128+y`，`tileX(tileIndex(x,y)) === x`，`tileY(...) === y`；本模块源码中不出现 `* 128` / `% 128` 字面量（lint 规则或 grep 测试）|
| T2 反转置（与地形模块同读）| 手工 `.SC2`：仅 `x == 0` 一列为水（`XBIT[0..127] |= WATER`），其余为干地 | 导入后 `terrain.isWater(0, y)` 对全部 y 为真，`isWater(x, 0)` 仅 x=0 为真；本模块 `count3x3(tileIndex(1, 5), false) === 3`，`count3x3(tileIndex(5, 1), false) === 0` |
| T3 同字节 | 随机 200 个 `(x, y)` | `terrain.xbitAt(x,y) === utilities.xbit[tileIndex(x,y)]`（同一 `Uint8Array` 实例、同一偏移）|
| T4 断电方向（沿 y）| 煤电厂锚点 `(0,0)`；从 `(0,4)` 起沿 +y 铺电线到 `(0,60)`，每隔一格放一座 1x1 建筑，建筑数 > 688 不现实，改用一座 0 产出风车（海拔 0、无风）+ 手工 `capacity` 注入 | 受电建筑是 y 最小的前 `capacity` 座；断电的全在大 y 一侧 |
| T5 断电方向（沿 x）| 同 T4 但电线沿 +x（索引步长 128）| 断电的全在大 x 一侧；T4/T5 任一失败即邻居增量写反 |
| T6 邻居顺序 | 电厂格 `i` 四周各一座 1x1 建筑，`capacity` 注入为 2（含电厂自身 1）| 唯一受电的建筑在 `(x, y-1)`（索引 `i-1`），不是 `(x-1, y)` |
| T7 水源顺序 | 两座互不连通的水泵网络，水泵 A 在 `(3, 100)`、B 在 `(4, 2)` | 第一遍先处理 A（`3*128+100 = 484 < 4*128+2 = 514`）；若实现误用 y 主序会先处理 B。用 `report.networks[0]` 的锚点断言 |
| T8 存档往返 | 任意城市：扫描 → 写 `.SC2` → 读回 → 再扫描 | `XBIT` 逐字节相等且 `MARK` 位全 0 |
| T9 科技只读 | 注入 `env.invented = () => false` | 既有燃气电厂仍计入 `capacity`；`canPlace(gas)` 返回 `notInvented`；本模块不发出任何 `techInvented` |

---

## 4. 边界条件与易错点

1. **位序陷阱**：dfloer 的 "bit 0 = Powerable" 是最高位 `0x80`。所有读写都用 §2.1 掩码常量；单元测试里放一条"`0x40` 是 POWERED"的断言。
2. **空分区不导电也不导水**：别为 `XZON != 0` 的空地置 `POWERABLE/PIPED`。生长判定用"自身或 4 邻格 `POWERED`"，而不是只看自身。
3. **电厂先吃电**：`budget` 对电厂格也扣 1。一座输出 0 的风车（海拔 0、无风、抽到 0）什么都供不了，连自己也不亮。
4. **多厂合并**：同一网络容量相加；两座相邻但只靠一条**道路**隔开的分区是两张网。
5. **顺序决定断电区**：扫描顺序（线性索引升序 = x 外层、y 内层）、邻居顺序（`(0,-1),(-1,0),(0,+1),(+1,0)` = `i-1, i-128, i+1, i+128`）和 PRNG 调用顺序必须稳定，否则读档/重放会出现不同的断电图样。风/太阳能在第一遍中按遍历顺序抽样，别提前批量抽。
5a. **索引约定只有一个**：`i = x*128 + y`（`file-formats.md` §2.2.1）。本模块早期草稿写成 `y*128 + x`，已废弃；若你在任何规格或代码里看到 `y*128+x`，那是错的，按 SSOT 改。`x = i >> 7`，**不是** `i % 128`。违反会把电/水网络相对地形、分区、交通层转置 90°，而且编译期查不出来——§3.8 的 T2/T4–T7 就是为此而设。
6. **Energy Conservation 是 +1/12 容量**，整除，不是需求 ×11/12（704 → 762，不是 768）。
7. **水塔只蓄一个月**：蓄水位是布尔，不累积；富余 < 50 单位时一格都不蓄；无电的水塔不蓄但会放一次；没有水泵的管网里的水塔永远是摆设。
8. **水泵/淡化先要有电**：供水扫描必须在电力扫描之后；`Powered` 为 0 的水源连网络都不会启动，其上的建筑也不会被统计为"缺水"（幽灵水泵效应）。顾问用 `unwateredBuildingTiles` 兜底。
9. **净水厂不是耗水户也不是水源**；它的"充足"比较对象是 `watered`（实际受水建筑格），不是全城建筑格。0 座净水厂且 `watered == 0` 时视为"充足"，这是原版行为。
10. **公园**：小/大公园只 `PIPED` 不 `POWERABLE`，它们能传水、会挡电；大公园（`0xD5 >= 0x70`）还要**耗水**。
11. **雕像**不导电（放置后清 `POWERABLE`），但 `PIPED`。
12. **推土与隐式管线**：建筑推掉后若地下没有显式管线，`PIPED` 一并清除——玩家会看到管网"断了"，这是原版行为；水泵下自动铺的管线在水泵被拆后仍留在 `XUND` 中 **[中]**。
13. **地铁站入口**（`XUND 0x23`）不可与管线共格，管线必须绕行；管线×地铁只能直线十字。
14. **电线斜坡/跨水**：跨水自动替换为 `0x5C` 并按 `elevatedLineCost` 收费；斜坡用 H 变体，否则渲染会悬空。
15. **到期处理在年度更新**，不在月结算；禁用灾害 + 资金足够 → 自动重建并扣款（玩家可能抱怨"钱莫名少了"，报纸要给 `plantAutoRebuilt`）。资金不足即使禁用灾害也会爆。
16. **除零**：没有任何电厂/水源时利用率定义为 100%；`needPower/needWater` 在 `generation == 0` 时改用 `consumers > 0` 判定，避免空城刷提示。
17. **整数运算**：全部用 `Math.floor` / `| 0`；`rngInt` 的上界含义（闭区间）要在 PRNG 模块统一。
18. **512 队列兼容开关**只在对照原版存档的测试里打开；默认关闭，否则大城市会莫名出现孤立无电格。
19. **净水厂/水塔占地 2x2、淡化 3x3**：网上资料有 4x4 的说法，是错的（建筑格计数 ÷4 / 逐格 9 格实测互证）。
20. **科技年份不归本模块**：`+0..19` 的随机偏移意味着 1900 开局时燃气可能迟至 1969，所以 UI 不能写死年份；但本模块既不抽、不存、不公告，只调用 `env.invented(def.tech)`。不要在本模块重新实现 `TechState`——三处各发一次"发明"新闻就是这么来的。

---

## 5. 待确认问题

| # | 问题 | 当前默认 | 需要的验证 |
|---|---|---|---|
| Q1 | 架空电线（跨水）的单价是否为 $10/格 | $10（`elevatedLineCost`）| 原版建一段跨水线看扣款 |
| Q2 | 净水厂 1935、淡化 1990 的基准年 | **已移交** `sim/tech` 所有者（`disasters-events.md` §2.9 槽位 10/11）与 `building-catalogue.md` 的 `TECH_BASE_YEAR`；本模块不持有该值 | 查原版手册 / 多个新城存档的 `MISC 0x0760/0x0764` 分布（由所有者跟进）|
| Q3 | Nuclear Free Zone 对**已有**核电的处理（保留 vs 拆除）| 保留 | 原版开法令观察 |
| Q4 | 未供电的警局/消防/学校/医院是否完全失效 | 失效（覆盖 0）| 对照原版 police/fire 覆盖图 |
| Q5 | `MISC 0x104C` 的语义（"Go Disaster" vs 净水厂充足标志）与 `0x1050` "Sewer Bonus" 的关系 | 写入充足标志到 `0x104C`，不碰 `0x1050` | 用有/无净水厂的存档对比两个字段 |
| Q6 | 太阳能均值 136 vs 公式均值 152 的差异来源（天气分布？还是公式不同）| 公式 | 固定湿度下多月采样原版 |
| Q7 | 管线能否铺在水面之下 | 不能 | 原版地下视图尝试 |
| Q8 | 水塔 "40,000 加仑" 的显示换算 | `towerGallonsPerUnit = 100` | 原版查询窗口 |
| Q9 | 无水是否限制密区建筑尺寸（手册暗示"发展较慢/密度较低"，逆向只见地价 +4）| 沿用 zones 规格的 `DENSE_UNWATERED_MAX_SIZE = 2`，可调 | 原版对比有/无水的密区发展 |
| Q10 | 电厂查询窗口显示的是标称 MW 还是实时服务格换算 | 标称 MW + 负载 % | 原版截图 |
| Q11 | 原版供水扫描的水源遍历顺序随地图旋转（compass）变化；我们固定为未旋转的线性索引升序（`i = x*128+y`，存档原生顺序）| 固定 | 仅影响与原版存档逐位对照 |

---

## 6. 参考来源

- dfloer/SC2k-docs（CC BY-SA 4.0）：`simulation spec.md`（电厂服务格、风/太阳能、水泵/淡化/水塔/净水厂、法令、诉求阈值）、`sc2 file spec.md`（`XBLD/XUND/XBIT/XMIC/MISC` 布局、科技偏移）、`text data spec.md`（`needpower/needwater/oldpowerplant` 等故事名）。本地副本见 scratchpad `refdocs/`。
- sc2kfix（MIT，仅阅读理解）：`XBIT_*` 掩码常量、电厂数量/类型枚举、建筑格计数 ÷16/÷4/÷9 推得占地、新城科技年份 `rand()%20 + base`、禁用灾害下的处理线索。未复制任何代码。
- OpenSC2K 原生模拟（仅阅读理解）：两遍 BFS 的电/水扫描语义（邻居顺序、512 环形队列、消费者口径、水塔蓄放、净水厂容量与充足标志、`has_power` 的 4 邻格规则、放置时的 `PIPED|POWERED|POWERABLE`、雕像/公园特例、电厂年度老化与自动重建、每格污染表、受水地价 +4、Meltdown/Microwave 触发条件）。本文所有伪代码均为重新设计与重写。
- 网络检索摘要（ludo.guide、simcity.fandom、patcoston、acornarcade FAQ 等；大多数站点在本环境不可直接访问，仅通过搜索摘要获取）：电厂价格/标称 MW/年份表、电线 $2/$10、管线 $3、水塔 $250、净水厂 $500、淡化 $1,000、"水电与风电不到期"。
- 作者对 SC2K 的游戏经验：用于填补置信度 **[低]** 的项。
