# 领域规格：地形与地图（Terrain & Map）

> 适用范围：`packages/sc2k` 中的地形层（高度、坡面、水体、树木）、地形生成器、地形编辑/城市模式的地形工具，以及"坡度/水体对建造的约束"。
> 目标读者：并行实现各模块的工程师（含 AI agent）。本文给出可直接实现的数据结构、公式、数值表与伪代码。
> 置信度标记：**[H]** 一手资料（社区格式文档 / 逆向工程头文件）直接支持；**[M]** 多个二手来源或强推断；**[L]** 仅凭记忆或单一二手来源，实施时按本文建议值实现并列入待确认。
> 版权铁律：本文只描述规则与数值，不含任何 Maxis/EA 素材。精灵 ID 仅用于"玩家本地导入自有 `LARGE.DAT`"时的查表；无文件时使用原创程序化像素美术。

---

## 1. 概述

SimCity 2000（Win95 Special Edition，下称 SC2K）的地图是 **128×128** 个等距（isometric）菱形地块。每个地块由三类信息共同描述：

| 信息 | 存档段 | 本文的角色 |
|---|---|---|
| 基准海拔 / 该地块水位 / 隧道深度 | `ALTM`（每地块 16 bit） | 高度场的"整数部分" |
| 坡面形状（哪几个角抬高）+ 水体类型（干地 / 水下 / 岸边 / 浅水 / 瀑布 / 溪流） | `XTER`（每地块 8 bit） | 高度场的"形状"与水体分类 |
| 有水 / 咸水 / 旋转 等位标志 | `XBIT`（每地块 8 bit，仅 3 个位与地形相关） | 水体判定与朝向 |
| 树木（7 档密度）、废墟 | `XBLD` 0x01–0x0C | 地表覆盖物，属于地形层管理 |

核心不变量（原版地形的几何约束）：**一个地块的 4 个角高度之差不超过 1 级**；相邻地块共享角点，因此全图是一张"每格最多 1 级落差"的整数高度场（32 级，0–31）。所有地形工具的本质都是"改一个角点高度，然后把 ≤1 级落差的约束向外传播"。唯一例外是 **bedrock/瀑布地块**（`XTER=0x0D/0x3E`），它表现为一个带垂直侧面的"1 级高台"，不参与连续性约束（见 §2.6.5、§4）。

本文结构：§2 原版行为（规则 / 公式 / 数值表）→ §3 数据结构与算法建议 → §4 边界条件与易错点 → §5 待确认问题 → §6 参考来源。

---

## 2. 原版行为

### 2.1 地图尺寸、坐标系与存储顺序

| 项目 | 值 | 置信度 |
|---|---|---|
| 地图尺寸 | 128 × 128 地块，共 16384 格 | H |
| 角点网格 | 129 × 129 个角点（派生数据，存档不直接存储） | H（推论） |
| 存档内线性索引 | `i = x * 128 + y`（**x 为主序，y 变化最快**；原版内存为 `map[x][y]`，OpenSC2K 的导入器同样按 `x = floor(i/128)`, `y = i % 128` 展开） | H |
| 默认旋转下的屏幕投影 | `(0,0)` 在屏幕最上方的顶角；`+x` 朝屏幕右下，`+y` 朝屏幕左下。屏幕坐标：`sx = ox + (x - y) * S`，`sy = oy + (x + y) * S/2 - alt * LEVEL_PX`（S 为当前缩放级的半块宽，详见渲染规格） | H（投影形式来自逆向头文件；像素常量见 §4） |
| 旋转 | `MISC[0x0008]`（"compass"）= 0..3，表示逆时针旋转次数。**存档中的 `XTER/ALTM` 永远是未旋转的世界坐标**，旋转只在渲染/拾取时做坐标与坡面码置换（§2.5.4） | H |
| 城市模式 | `MISC[0x0004]`：0 = 地形编辑模式，1 = 城市模式，2 = 灾害模式 | H |
| 方向命名 | 本文采用网格空间命名：**T = −y 边，B = +y 边，L = −x 边，R = +x 边**。这与 `XBLD` 中道路/电线的 `L-R`、`T-B`、`HT-B` 等命名一致 | H |

地块的 4 个角点命名（网格空间）：

```
        c00 (x,   y)   ──T 边──  c10 (x+1, y)
            │                        │
          L 边                     R 边
            │                        │
        c01 (x,   y+1) ──B 边──  c11 (x+1, y+1)
```

社区文档用字母 `a b / x y` 表示同一组角：`a=c00, b=c10, x=c01, y=c11`。

### 2.2 海拔层级与单位

| 项目 | 值 | 置信度 |
|---|---|---|
| 海拔级数 | 32 级，`alt ∈ [0, 31]` | H |
| 每级高度 | 100 ft | H（"升/降海平面"每次 100 ft；风电表每级 +100 ft） |
| 查询工具显示值 | `feet = alt * 100 + 50`（0 级显示 50 ft，31 级显示 3150 ft） | M（来自风电产量表的"Altitude (feet)"列） |
| 全局海平面（water table） | `MISC[0x0E40]`，取值 0..31；新地图默认 **4**（社区解析器把缺省值设为 4，供水泵示例城市海平面为 4） | M |
| 生成时记录 | `MISC[0x0E44]` = 是否勾选 Coast；`MISC[0x0E48]` = 是否勾选 River | H |

### 2.3 `ALTM` 位布局（每地块 16 bit，存档内大端）

两份一手资料对位编号的"方向"不同，但指向同一布局。以**大端读入为 `u16` 后、bit0 = 最低位**为准：

| 位 | 掩码 | 含义 | 置信度 |
|---|---|---|---|
| 0–4 | `0x001F` | **land altitude**：地块基准海拔（= 4 个角中的最低高度；水下地块为海床高度） | H |
| 5–9 | `0x03E0` | **water level**：该地块的水面高度。逆向注释明确写着"不总是准确，应以 `XTER` 判定水体" | H（存在性）/ M（可靠性低） |
| 10–15 | `0xFC00` | **tunnel levels**：隧道在地表以下多少级（用于地下视图画灰色隧道块）。逆向头文件把它当 6 bit 字段；OpenSC2K 观察到其中最低 2 bit（bit 8–9 按其编号）在水电站及其周围浅水地块为 1 | M |

> 社区格式文档写的是"bits 0–5 隧道、6–10 水位、11–15 海拔"，那是从最高位开始编号。两者等价，实现时按上表掩码即可。

### 2.4 角点模型与 14 种坡面

`XTER` 低 4 bit（下称 **slope nibble**，取值 0x0–0xD）描述 4 个角里哪些比 `alt` 高 1 级。**注意 nibble 不是位掩码**，必须查表：

| nibble | 角位 `a b x y`（1=抬高） | 抬高的角 | 几何类型 | 逆向工程命名（sprite 256+n） | 说明 |
|---|---|---|---|---|---|
| 0x0 | 0000 | 无 | 平地 | `TERRAIN` | 全部角 = alt |
| 0x1 | 1100 | c00, c10 | 边坡，T 边高 | `TERRAIN_HTB` | 沿 y 方向下坡（T→B） |
| 0x2 | 0101 | c10, c11 | 边坡，R 边高 | `TERRAIN_HRL` | 沿 x 方向下坡（R→L） |
| 0x3 | 0011 | c01, c11 | 边坡，B 边高 | `TERRAIN_THB` | 沿 y 方向上坡（T→B） |
| 0x4 | 1010 | c00, c01 | 边坡，L 边高 | `TERRAIN_RHL` | 沿 x 方向上坡（L→R） |
| 0x5 | 1101 | c00, c10, c11（c01 低） | 三角高（凹角），T、R 边整体高 | `TERRAIN_HTHRBL` | 低角在 L/B 交汇处 |
| 0x6 | 0111 | c10, c01, c11（c00 低） | 三角高，R、B 边整体高 | `TERRAIN_THRHBL` | 低角在 T/L 交汇处 |
| 0x7 | 1011 | c00, c01, c11（c10 低） | 三角高，B、L 边整体高 | `TERRAIN_TRHBHL` | 低角在 T/R 交汇处 |
| 0x8 | 1110 | c00, c10, c01（c11 低） | 三角高，T、L 边整体高 | `TERRAIN_HTRBHL` | 低角在 R/B 交汇处 |
| 0x9 | 0100 | c10 | 单角高（凸角），T/R 交汇角 | `TERRAINSLOPE_HTHRBL` | |
| 0xA | 0001 | c11 | 单角高，R/B 交汇角 | `TERRAINSLOPE_THRHBL` | |
| 0xB | 0010 | c01 | 单角高，B/L 交汇角 | `TERRAINSLOPE_TRHBHL` | |
| 0xC | 1000 | c00 | 单角高，L/T 交汇角 | `TERRAINSLOPE_HTRBHL` | |
| 0xD | 1111 | 全部 4 角 | **bedrock / 垂直高台**：表面在 alt+1，四周为垂直岩壁 | `BEDROCK` | 仅出现在瀑布下方（0x3E）或"海平面故障"遗留；不参与 ≤1 级连续性约束 |
| 0xE, 0xF | — | — | 未定义 | — | 游戏素材中不存在对应精灵；导入时视为 0x0 并记录告警 |

命名规则解读（便于对照精灵）：`H` 前缀表示"该边整体抬高"，`TERRAINSLOPE_*` 表示只有两边交汇处的**单角**抬高。置信度 **[H]**：逆向头文件的精灵序号与社区文档的角位表逐项吻合。

**连续性约束**：相邻地块共享的角点高度必须一致，且同一地块 4 角 `max − min ≤ 1`。因此高度场可以等价地存成 129×129 的角点数组（§3.2）。

### 2.5 `XTER` 全表

#### 2.5.1 分类（高 4 bit）

| 高 nibble | 范围 | 类别 | 低 nibble 含义 | 地表精灵 | 水面精灵 | `XBIT` 水位 | 置信度 |
|---|---|---|---|---|---|---|---|
| 0x0 | 0x00–0x0D | **干地（dry land）** | 坡面码（§2.4） | 256 + n | 无 | 0 | H |
| 0x1 | 0x10–0x1D | **水下（submerged）**：整块在水面以下 | 海床坡面码 | 256 + n（仅地下视图/排水后可见） | 270（整块水面） | 1 | H |
| 0x2 | 0x20–0x2D | **岸边（shoreline）**：坡面地块，抬高的角露出水面，低角没入水中 | 坡面码；1 = 露出的陆地角 | 256 + n | 270 + n | 1 | H |
| 0x3 | 0x30–0x3D | **浅水（surface water）**：平地上零深度的水（水工具放置的池塘 / 湖面边缘） | **不是高度**，而是"哪些角被陆地包围"的形状码（§2.6.3） | 256 | 270 + n | 1 | H（映射）/ M（形状码语义） |
| 0x3E | — | **瀑布（waterfall）** | 固定 | 269（bedrock） | 284 | 1 | H |
| 0x4 | 0x40–0x45 | **溪流 / 水湾** | 见下表 | 256 | 285 + (code − 0x40) | 1 | H |
| 其他 | 0x0E,0x0F,0x1E,0x1F,0x2E,0x2F,0x3F,0x46–0xFF | 未定义 | — | — | — | — | 导入时按 0x00 处理并告警 |

#### 2.5.2 溪流与水湾（0x40–0x45）

| 码 | 含义 | 水面精灵（逆向命名） | 旋转组 |
|---|---|---|---|
| 0x40 | 溪流，L–R 走向（水在中线，T/B 两侧是陆地） | 285 `WATER_RL_TERRAIN_TB` | 与 0x41 互换 |
| 0x41 | 溪流，T–B 走向 | 286 `WATER_TB_TERRAIN_RL` | 与 0x40 互换 |
| 0x42 | 水湾，水只触及 B 边（溪流端头/汇入口） | 287 `WATER_B_TERRAIN_TRL` | 逆时针 1 次：0x42→0x45→0x44→0x43→0x42（§2.5.4） |
| 0x43 | 水湾，水只触及 L 边 | 288 `WATER_L_TERRAIN_TRB` | |
| 0x44 | 水湾，水只触及 T 边 | 289 `WATER_T_TERRAIN_RBL` | |
| 0x45 | 水湾，水只触及 R 边 | 290 `WATER_R_TERRAIN_TBL` | |

溪流只存在于**平地**上（地表精灵固定 256）；溪流遇到坡面时，该坡面地块变成瀑布 0x3E。原版没有"转弯"溪流精灵，转弯处用一个 L–R 与一个 T–B 相邻实现，视觉上允许断开 **[M]**。

#### 2.5.3 水面精灵形状（270–283）的角语义

`270 + n` 的形状与坡面码 n 的"陆地角"一一对应（1 = 陆地/高，0 = 水/低）：

| n | 水面精灵（逆向命名） | 形状 |
|---|---|---|
| 0 | 270 `WATER_TRBL` | 整块水面 |
| 1–4 | 271–274 `WATER_RBL_TERRAIN_T` / `_TBL_TERRAIN_R` / `_TRL_TERRAIN_B` / `_TRB_TERRAIN_L` | 一条边是陆地（直岸） |
| 5–8 | 275–278 `WATER_BL_TERRAIN_TR` / `_TL_TERRAIN_RB` / `_TR_TERRAIN_BL` / `_RB_TERRAIN_TL` | 两条相邻边是陆地（外凸岸角） |
| 9–12 | 279–282 `WATER_TRB` / `_RBL` / `_TBL` / `_TRL` | 三条边是水，只有一个角是陆地（内凹岸角） |
| 13 | 283 `ISOLATEDWATER_TERRAIN_TRBL` | 四面皆陆地的孤立水块（单格池塘） |

#### 2.5.4 旋转置换

**规范来源**：旋转置换表的唯一真源是 `ui-art.md` §3.3（渲染器置换表）；本节只引用它，并补上推导过程与验收用例。两处的表必须逐项相同。代码层面只允许存在**一份**常量（本模块 `terrain/slope.ts` 导出的 `SLOPE_ROT_CCW` / `SLOPE_ROT_CW` / `XTER_STREAM_ROT_CCW`，见 §3.1），渲染、拾取、路网、工具预览一律 `import`，不得各自再抄一张表。

**坐标变换**（逆时针 1 次，与 ui-art §3.1 相同）：地块 `(x, y) → (x', y') = (y, 127 − x)`；角点 `(cx, cy) → (cy, 128 − cx)`；逆变换 `(x, y) = (127 − y', x')`。旋转 r 次 = 连续应用 r 次。

**方向映射（由坐标变换严格推出，置信度 H）**：方向向量 `(dx, dy)` 在该变换下变为 `(dy, −dx)`：

| 网格方向 | 向量 | 变换后向量 | 新方向 |
|---|---|---|---|
| T（−y） | (0, −1) | (−1, 0) | **L** |
| R（+x） | (1, 0) | (0, −1) | **T** |
| B（+y） | (0, 1) | (1, 0) | **R** |
| L（−x） | (−1, 0) | (0, 1) | **B** |

即 `T→L→B→R→T`。对应的角点重命名：原 `c10 → c00'`，`c11 → c10'`，`c01 → c11'`，`c00 → c01'`（把 (x,y) 的 4 个角代入角点变换即可验证：`c00 = (x, y) → (y, 128 − x)`，而新地块 `(y, 127 − x)` 的 `c01'` 正是 `(y, 128 − x)`）。

**低 nibble 置换**（每旋转 1 次应用一遍；适用于 `0x0X` 干地、`0x1X` 水下、`0x2X` 岸边，以及同为角位编码的 `0x3X` 浅水形状码）：

```
1 → 4 → 3 → 2 → 1          （T 高 → L 高 → B 高 → R 高）
5 → 8 → 7 → 6 → 5          （T+R 高 → L+T 高 → B+L 高 → R+B 高）
9 → 12 → 11 → 10 → 9       （T/R 角 → L/T 角 → B/L 角 → R/B 角）
0, 13 不变
0x40 ↔ 0x41                （溪流 L–R ↔ T–B）
0x42(B) → 0x45(R) → 0x44(T) → 0x43(L) → 0x42
0x3E 不变（瀑布方向由相邻坡面决定）
```

逐项验证示例：nibble 1 的角位为 `a b x y = 1 1 0 0`（c00、c10 高）。旋转后 c00→c01'、c10→c00'，新角位 `a' b' x' y' = 1 0 1 0` = nibble 4（L 高）。再如 0x42（水只触及 B 边）：B→R，故变为 0x45。

数组形式（下标 = 旧码，值 = 新码）：

```
SLOPE_ROT_CCW = [0, 4, 1, 2, 3, 8, 5, 6, 7, 12, 9, 10, 11, 13]
SLOPE_ROT_CW  = [0, 2, 3, 4, 1, 6, 7, 8, 5, 10, 11, 12, 9, 13]   // 逆置换：顺时针 1 次，或"从旋转空间反推世界码"
```

> 修订说明：本文早先版本写的是 `1→2→3→4`、`0x42→0x43→0x44→0x45`，那是 OpenSC2K `rotate` 数组的遍历方向，它配合的是另一套坐标/旋转约定；与本文和 ui-art 固定采用的 `(x,y)→(y,127−x)` 搭配时，所有坡面、道路/电线/高速坡件、隧道口和水湾都会被镜像。现已按坐标变换重新推导，与 ui-art §3.3 逐项一致。旧环恰好等于 `SLOPE_ROT_CW`，若将来有人把坐标变换改成顺时针，应改用它而不是改表。

**验收（vitest，必须通过；不再依赖"目视校验"）**：

1. 数据级（本模块 `terrain/slope.spec.ts`，不需要渲染器）：
   - **置换表 = 角点重命名**：对每个 `code ∈ 0..13`，取 `bits = SLOPE_CORNERS[code]` 的 4 位 `a,b,x,y`，令 `rot = (b<<3) | (y<<2) | (a<<1) | x`，断言 `CORNERS_TO_SLOPE[rot] === SLOPE_ROT_CCW[code]`。这一步把表与坐标变换绑死：表抄错任何一项即失败。
   - **周期与逆**：连续应用 4 次得到恒等；`SLOPE_ROT_CW[SLOPE_ROT_CCW[c]] === c`。
   - **溪流 / 水湾**：以方向映射 `DIR_ROT_CCW = {T:L, R:T, B:R, L:B}` 和表 `BAY_DIR = {0x42:B, 0x43:L, 0x44:T, 0x45:R}` 计算 `BAY_CODE[DIR_ROT_CCW[BAY_DIR[c]]]`，断言与 `XTER_STREAM_ROT_CCW[c]` 相同；`0x40/0x41` 互换。
   - **与路网坡件一致**：§2.11.3 的对应 `{1:0x1F, 2:0x20, 3:0x21, 4:0x22}` 在旋转后保持，即 `ROAD_SLOPE_FOR_NIBBLE[SLOPE_ROT_CCW[n]] === ROAD_ROT_CCW[ROAD_SLOPE_FOR_NIBBLE[n]]`，其中 `ROAD_ROT_CCW` 取 ui-art §3.3 的"坡 `+2→+5→+4→+3→+2`"（基址 0x1D）。电线（基址 0x0E）、铁路（0x2C）、高速坡 `0x61→0x64→0x63→0x62` 同理各做一次。
2. 像素级（ui-art §3.3 的快照用例，terrain 以其为最终验收）：在 `(10,10)` 放 `XTER = 0x01`（T 边高）、`(12,10)` 放道路 `0x1F`（HT-B）；旋转 0 / 1 / 2 次时两者的抬高边必须分别出现在屏幕**右上 / 左上 / 左下**，且道路坡件与地面贴合（无悬空、无穿模）。

#### 2.5.5 全码一览（0x00–0x45）

| 码 | 名称 | 地表精灵 | 水面精灵 | | 码 | 名称 | 地表精灵 | 水面精灵 |
|---|---|---|---|---|---|---|---|---|
| 00 | TERRAIN_00 | 256 | – | | 20 | COAST_00 | 256 | 270 |
| 01 | TERRAIN_01 | 257 | – | | 21 | COAST_01 | 257 | 271 |
| 02 | TERRAIN_02 | 258 | – | | 22 | COAST_02 | 258 | 272 |
| 03 | TERRAIN_03 | 259 | – | | 23 | COAST_03 | 259 | 273 |
| 04 | TERRAIN_04 | 260 | – | | 24 | COAST_04 | 260 | 274 |
| 05 | TERRAIN_05 | 261 | – | | 25 | COAST_05 | 261 | 275 |
| 06 | TERRAIN_06 | 262 | – | | 26 | COAST_06 | 262 | 276 |
| 07 | TERRAIN_07 | 263 | – | | 27 | COAST_07 | 263 | 277 |
| 08 | TERRAIN_08 | 264 | – | | 28 | COAST_08 | 264 | 278 |
| 09 | TERRAIN_09 | 265 | – | | 29 | COAST_09 | 265 | 279 |
| 0A | TERRAIN_10 | 266 | – | | 2A | COAST_10 | 266 | 280 |
| 0B | TERRAIN_11 | 267 | – | | 2B | COAST_11 | 267 | 281 |
| 0C | TERRAIN_12 | 268 | – | | 2C | COAST_12 | 268 | 282 |
| 0D | TERRAIN_13 (bedrock) | 269 | – | | 2D | COAST_13 | 269 | 283 |
| 10 | SUBMERGED_00 | 256 | 270 | | 30 | SURFACE_WATER_00 | 256 | 270 |
| 11 | SUBMERGED_01 | 257 | 270 | | 31 | SURFACE_WATER_01 | 256 | 271 |
| 12 | SUBMERGED_02 | 258 | 270 | | 32 | SURFACE_WATER_02 | 256 | 272 |
| 13 | SUBMERGED_03 | 259 | 270 | | 33 | SURFACE_WATER_03 | 256 | 273 |
| 14 | SUBMERGED_04 | 260 | 270 | | 34 | SURFACE_WATER_04 | 256 | 274 |
| 15 | SUBMERGED_05 | 261 | 270 | | 35 | SURFACE_WATER_05 | 256 | 275 |
| 16 | SUBMERGED_06 | 262 | 270 | | 36 | SURFACE_WATER_06 | 256 | 276 |
| 17 | SUBMERGED_07 | 263 | 270 | | 37 | SURFACE_WATER_07 | 256 | 277 |
| 18 | SUBMERGED_08 | 264 | 270 | | 38 | SURFACE_WATER_08 | 256 | 278 |
| 19 | SUBMERGED_09 | 265 | 270 | | 39 | SURFACE_WATER_09 | 256 | 279 |
| 1A | SUBMERGED_10 | 266 | 270 | | 3A | SURFACE_WATER_10 | 256 | 280 |
| 1B | SUBMERGED_11 | 267 | 270 | | 3B | SURFACE_WATER_11 | 256 | 281 |
| 1C | SUBMERGED_12 | 268 | 270 | | 3C | SURFACE_WATER_12 | 256 | 282 |
| 1D | SUBMERGED_13 | 269 | 270 | | 3D | SURFACE_WATER_13 | 256 | 283 |
| 3E | WATERFALL | 269 | 284 | | 40 | STREAM_LR | 256 | 285 |
| 41 | STREAM_TB | 256 | 286 | | 42 | BAY_B | 256 | 287 |
| 43 | BAY_L | 256 | 288 | | 44 | BAY_T | 256 | 289 |
| 45 | BAY_R | 256 | 290 | | | | | |

精灵 ID 仅对玩家本地导入的 `LARGE.DAT` 有意义；`SMALLMED.DAT` 中另有 small/medium 两套同序号段，渲染模块按文件头里的 ID 查表即可，不要硬编码偏移。

### 2.6 水体

#### 2.6.1 `XBIT` 中与地形相关的位（掩码值，bit0 = 最低位）

| 掩码 | 名称 | 含义 | 置信度 |
|---|---|---|---|
| `0x01` | salt water | 该水块为咸水（海水）。只有勾选 Coast 生成的地图才会有咸水 | H |
| `0x02` | flipped / rotate 90° | 码头、跑道、匝道、桥段等 1 轴对称物件的朝向位；地形本身不用 | H |
| `0x04` | water | **该地块被水覆盖**（submerged / shore / surface / waterfall / stream 都为 1） | H |
| `0x08` | mark | XVAL 掩码/内部标记，地形不使用 | H |
| `0x10`/`0x20`/`0x40`/`0x80` | watered / piped / powered / powerable | 供水与供电，见其他规格 | H |

> 社区文档把 bit 编号反过来（"bit 5 = water"），指的同样是 `0x04`。

#### 2.6.2 水体深度与 `XTER` 类别的判定

设地块基准海拔 `A = alt`，坡面码 `s`，水面 `W`（该地块水位；海/湖为全局海平面，池塘为自身海拔）。原版的分类与下列规则一致 **[M]**（推断自精灵组合与"码头需要水深 ≥2"等逆向证据）：

| 条件 | 类别 | `XTER` |
|---|---|---|
| `XBIT.water == 0` | 干地 | `0x00 | s` |
| 水且 `s == 0` 且 `W == A` | 浅水（零深度，池塘/湖面边缘） | `0x30 | shape`（shape 见 §2.6.3） |
| 水且 `s == 0` 且 `W ≥ A + 1` | 水下 | `0x10` |
| 水且 `s ∈ 1..12` 且 `W == A + 1` | 岸边（高角正好在水面） | `0x20 | s` |
| 水且 `s ∈ 1..12` 且 `W ≥ A + 2` | 水下坡面 | `0x10 | s` |
| 水且 `s == 13`（bedrock）且有水流过 | 瀑布 | `0x3E` |
| 水且 `s ∈ 1..12` 且 `W == A`（水只碰到最低角） | 视为干地（不成立的组合，工具应避免产生） | `0x00 | s` |

水深 `depth = W − A`。**船只航道要求 depth ≥ 2**：海港起重机的码头末端地块必须满足 `waterLevel ≥ landAlt + 2` **[H]**（逆向的放置检查）；水工具放置的零深度池塘不能通航 **[H]**。

#### 2.6.3 浅水形状码（0x31–0x3D）的计算

浅水地块是平地，低 nibble 表示**哪些角被陆地包围**，用与坡面码相同的角位编码（1 = 陆地角）。规则 **[M]**：

```
cornerIsLand(c) = 与角点 c 相邻的 4 个地块中，存在任一地块不是水（或越界视为水）
shape = encodeNibble(cornerIsLand(c00), cornerIsLand(c10), cornerIsLand(c01), cornerIsLand(c11))
```

于是：池塘内部 → 0x30；直岸 → 0x31–0x34；外凸角 → 0x35–0x38；内凹角 → 0x39–0x3C；孤立单格 → 0x3D。

#### 2.6.4 淡水 / 咸水

- 勾选 Coast 时，从接触地图边缘的海洋水块开始，对 4 邻接的水块做泛洪，标记 `salt`；河流、湖泊、池塘、溪流为淡水 **[M]**。
- 咸水/淡水影响供水（水泵只算相邻淡水块；海水淡化厂只算相邻咸水块），见供水规格。
- 降低地形使其没入海平面时，新水块继承"与之 4 邻接的水块"的咸淡属性；与任何咸水块相邻则为咸水 **[M]**。

#### 2.6.5 瀑布与 bedrock

- 瀑布地块 `0x3E`：地表为 bedrock（表面 alt+1，四周垂直壁），水面精灵 284；水从高侧流向低侧。
- 产生方式：① 水工具（城市模式"Water"/编辑器"Water"）点击**任意坡面地块** → 该地块变为瀑布 **[H]**；② 溪流工具/生成器的溪流经过坡面 **[M]**；③ 原版注释提到"水坝下方"也会出现瀑布。
- 水电站（`XBLD 0xC6/0xC7`，1×1，两种朝向）**只能放在瀑布地块上** **[H]**。
- 瀑布被推平/排水后原版会留下 `0x0D` bedrock（即"没有坡面的 1 级高台"——社区所述的"洞穴"故障）**[M]**。本实现建议：移除瀑布时调用 §3.4 的 `recomputeTerrainTile()` 从邻居角点重新推导坡面码，消除该故障（这是有意偏离原版的修正，需在 UI 设置里可关闭以保留"原汁原味"的故障复刻？——列入 §5）。

### 2.7 地形生成器

#### 2.7.1 参数（New City 对话框 / 编辑器工具栏）

| 参数 | 范围 | 默认 | 语义 | 置信度 |
|---|---|---|---|---|
| Coast | 0/1 | 0 | 一侧（或多侧）地图边缘为海洋；**启用咸水** | H |
| River | 0/1 | 0 | 一条贯穿地图的河流（淡水） | H |
| Hills（Mountain 滑块） | 0–47 | 12 | 地形起伏程度 | H |
| Water 滑块 | 0–47 | 5 | **同时**控制海平面高度与溪流/湖泊数量；为 0 且未勾选 Coast/River 时全图无水 | H |
| Trees 滑块 | 0–47 | 15 | 树木数量 | H |

编辑器工具栏上有同名滑块与 Coast/River 开关，以及 **Make**（按当前参数重新生成）和 **Done**（进入城市模式，不可返回）按钮 **[H]**。

#### 2.7.2 生成结果需满足的约束

1. 角点高度场满足 ≤1 级连续性；全图海拔落在 [0, 31]。
2. `W = 全局海平面`，水块判定：`minCorner(tile) < W` → 水；`XTER` 由 §2.6.2 规则推导。
3. Coast：海洋与地图边缘相连，边缘处海床最深（建议 W−3），岸线有噪声起伏；咸水标记。
4. River：从一条边到对面边的连续水道，宽 2–4 格，床深 W−1..W−2；淡水。
5. Water>0 且无 Coast/River：若干内陆湖（局部洼地低于 W）+ 溪流；Water=0：地表最低角 ≥ W（无水）。
6. 溪流：自高处沿最陡下降路径流到水体/地图边缘/洼地，平地用 0x40/0x41，坡面用瀑布 0x3E，末端用 0x42–0x45 水湾。
7. 树木：`XBLD 0x06–0x0C`（密度 1–7），成簇分布，不在水面/瀑布上；坡面上允许。
8. 生成后 `MISC[0x0E40]=W`，`[0x0E44]=coast`，`[0x0E48]=river`，`XBIT.water/salt` 已设，`ALTM.waterLevel = W`（水块）。

可实现的算法见 §3.6。

### 2.8 地形编辑模式（Map mode）工具栏

逆向头文件枚举的按钮集合 **[H]**，语义为原版帮助文本的转述 **[H]**：

| 工具 | 操作 | 语义 | 费用 |
|---|---|---|---|
| Bulldozer | 点击/拖动 | 清除树木、浅水、废墟 | 免费（编辑器内全部免费） |
| Raise Terrain | 点击 | 被点地块抬高 1 级，周围按 ≤1 级约束跟随（形成小丘） | 免费 |
| Lower Terrain | 点击 | 被点地块降低 1 级，周围跟随（形成洼地） | 免费 |
| Stretch Terrain | 按住并上下拖动 | 被点地块随鼠标垂直位移连续升降（每 N 像素 1 级），周围跟随 | 免费 |
| Level Terrain | 按住并拖动 | 以**首个**点击地块的海拔为基准，把拖过的地块全部推平到该海拔；同时清除树木 | 免费 |
| Raise Sea Level | 点击按钮 | 全图海平面 +1 级；新没入的地块变水，其上的树木与池塘被清除 | 免费 |
| Lower Sea Level | 点击按钮 | 全图海平面 −1 级；露出的地块变干地 | 免费 |
| Water | 点击 | 平地 → 零深度池塘（0x3X）；坡面 → 瀑布 | 免费 |
| Stream | 点击 | 从点击处开始沿下坡方向生成溪流直到水体/边缘/洼地 | 免费 |
| Trees | 点击/拖动 | 每次密度 +1（上限 7）；**Shift** 为移除 | 免费 |
| Forest | 拖动 | 大面积随机密度植树（刷子半径建议 3 格）；**Shift** 为移除 | 免费 |
| Centering / Zoom / Rotate / Help | — | 视图控制 | — |
| Hills / Water / Trees 滑块，Coast / River 开关，Make，Done | — | §2.7 | — |

社区指南提到 PC 版编辑器的 Raise/Lower 存在"故障" **[L]**，细节不明，不复刻。

### 2.9 城市模式地形工具与费用

城市模式下地形工具分布在两个工具组 **[H]**（帮助文本枚举）；费用 **[M]**（多份社区指南一致，原版费用表 `costFromSubTool` 未能直接读取）：

| 工具组 | 子工具 | 费用 | 备注 |
|---|---|---|---|
| Bulldozer | Demolish/Clear | $1 / 格 | 清除建筑、道路、树木、**浅水池塘**、废墟；不移除海/湖/河等有深度的水 |
| Bulldozer | Level Terrain | $25 / 实际改变的格 | 同编辑器语义；同时拆除被改变地块上的树木、道路、电线、建筑 |
| Bulldozer | Raise Terrain | $25 / 实际改变的格（本文建议口径，见 §5） | 被改变地块上有建筑/道路时拒绝 |
| Bulldozer | Lower Terrain | $25 / 实际改变的格 | 同上；低于海平面即成水 |
| Bulldozer | De-zone | $1 / 格 | 非地形，略 |
| Landscape | Trees | $3 / 次点击 | 每次密度 +1；满密度再点仍收费 |
| Landscape | Water | $100 / 格 | 平地 → 池塘；坡面 → 瀑布（供水电站） |

相关联的建造费用（便于交通/电力模块对齐，详见各自规格）：

| 项目 | 费用 | 置信度 |
|---|---|---|
| 道路 | $10 / 格 | M |
| 铁路 | $25 / 格 | M |
| 高速公路 | $100 / 段（2×2） | M |
| 高速匝道 | $25 | M |
| 电线（陆上） | $2 / 格 | M |
| 电线（跨水，高架 `0x5C`） | $10 / 格 | M |
| 公路桥：Causeway / Raising / Suspension | $25 / $50 / $75 每格 | M |
| 铁路桥 `0x5A/0x5B` | $75 / 格 | M |
| 高速公路加固桥 `0x6A/0x6B` | $200 / 段 | M |
| 隧道（公路/铁路） | $150 / 格 | M |
| 水电站 | $400 | M |

### 2.10 地形工具操作语义（精确定义）

以下定义以**角点高度场** `h[c]`（129×129）为操作对象，操作结束后写回 `alt/xter`（§3.3）。记 `prop(c, newH, dir)` 为"把角点 c 设为 newH，并沿 Chebyshev 距离 d 把所有角点 c' 约束到 `h[c'] ≥ newH − d`（抬高）或 `h[c'] ≤ newH + d`（降低）"。

| 工具 | 受影响角点 | 规则 |
|---|---|---|
| Raise(x,y) | 地块 4 角 | `target = alt(x,y) + 1`（若地块是坡面，则 target = 最高角 + 1，即先补平再抬）；对 4 角执行 `prop(c, target, up)`；超过 31 则拒绝 |
| Lower(x,y) | 地块 4 角 | `target = alt(x,y) − 1`（坡面则 target = 最低角 − 1 … 即先削平到最低角再降）；对 4 角执行 `prop(c, target, down)`；低于 0 则拒绝 |
| Stretch(x,y,dyPx) | 地块 4 角 | `levels = round(dyPx / PX_PER_LEVEL)`（建议 PX_PER_LEVEL = 当前缩放的 LEVEL_PX）；按符号重复 Raise/Lower，但只对同一地块，期间持续重绘 |
| Level(x0,y0 → 拖过的 (x,y)) | 每个拖过地块的 4 角 | `ref = alt(x0,y0)`（首格基准海拔）；对每个拖过地块：4 角 `prop(c, ref, up)` 与 `prop(c, ref, down)`（即强制等于 ref 并双向传播） |
| RaiseSeaLevel / LowerSeaLevel | 无（只改 W） | `W ± 1`，然后对全图 `refloodAll()`（§3.5） |
| Water(x,y) | 无 | 干平地：`water=1, waterLevel=alt, salt=继承相邻`，重算 XTER（得到 0x3X）；干坡面（1..12）：`xter=0x3E, water=1`；已有水/建筑：拒绝；有树：移除树 |
| Stream(x,y) | 无 | §3.6.5 的 `carveStream` |
| Trees(x,y) | 无 | `XBLD ∈ {0, 0x06..0x0B}` → `+1 档`（0 → 0x06）；`0x0C` 不变但仍收费；水面/瀑布/建筑：拒绝；Shift：`−1 档`（0x06 → 0） |
| Forest(x,y) | 无 | 对半径 r 内每格以概率 `p = 1 − d/(r+1)` 调用 Trees，密度 `1 + floor(rand*4)` |
| Bulldoze(x,y) | 无 | 树/废墟 → 0；浅水 0x3X/溪流 0x4X/瀑布 0x3E → `water=0` 并 `recomputeTerrainTile`；水下/岸边水块：不处理（不是"装饰水"） |

**合法性（城市模式）**：Raise/Lower/Level 在"任何角点高度会被改变的地块"上若存在 `XBLD ≥ 0x0E`（任何结构物）或该地块是桥/隧道/水块（Raise 作用于水块允许：抬高海床直至露出水面）则拒绝整次操作并提示；树木会被清除；分区（`XZON`）保留。Level 例外：按原版语义它会连带拆除结构物（费用含在 $25 内）**[M]**。

**费用结算**：`cost = unitCost × |改变了至少一个角点高度的地块集合|`（Raise/Lower/Level 为 $25）**[M，见 §5]**；资金不足则整次拒绝，不做部分应用。

### 2.11 坡度与水体对建造的限制

#### 2.11.1 放置型建筑（警察局、电厂、公园等 1×1–4×4）

- 占地内每格必须 `XTER == 0x00`（平地、无水）且 `XBIT.water == 0` **[H]**（逆向的放置检查对非码头建筑逐格要求地表码为 0 且非水）。平地相邻即共享角点，故自动同海拔。
- 原版**不会**替你自动推平（放置失败即拒绝，玩家需先用 Level/Raise/Lower）**[M]**。
- 例外：
  - 码头（Marina，3×3）：占地必须跨越岸线，含 ≥1 个水块，其余格要求同上 **[H]**。
  - 海港起重机（Crane）：前方沿直线需有 5 个连续、无物件的水块，末端水深 ≥ 2；起点坐标奇偶受限（沿 y 伸出时 x 为偶数，沿 x 伸出时 y 为偶数）**[H]**。
  - 水电站：只能放在 `0x3E` **[H]**。
  - 跑道、军事基地：逐格要求地表码为 0 **[H]**。
- 拆除：原版只在平地（码 0）上留下废墟 `0x01–0x04`，坡面上直接变空地 **[H]**。

#### 2.11.2 分区（Zone）与自然生长

- 分区可以画在任何**干地**上，包括坡面 1..12 **[M]**；不可画在水面、瀑布、bedrock 上。
- 生长规则建议 **[M/L]**：1×1 建筑可在坡面格上生长；2×2 / 3×3 需要整个占地全部为 `0x00`（一个"台地"）。这解释了原版山地只长小房子的现象，并与"坡地抬升地价"的策略相容。
- 地价：海拔越高、越靠近水和树，地价越高 **[M]**——公式归地价规格，地形层需提供 `alt`、`distanceToWater`、`treeDensity` 查询。

#### 2.11.3 道路 / 铁路 / 电线 / 高速的坡面规则

网络类 1×1 物件只有 **沿坡方向的边坡** 变体（`HT-B`、`L-HR`、`T-HB`、`HL-R`），因此：

| 网络 | 地块坡面码允许集合 | 说明 | 置信度 |
|---|---|---|---|
| 道路直线 T–B | {0, 1, 3} | 1 = T 高（`HT-B` `0x1F`），3 = B 高（`T-HB` `0x21`） | H |
| 道路直线 L–R | {0, 2, 4} | 2 = R 高（`L-HR` `0x20`），4 = L 高（`HL-R` `0x22`） | H |
| 道路转弯 / 三叉 / 十字 / 所有交叉（路–轨、路–电） | {0} | 逆向注释指出 1×1 交叉件不存在于非平地 | H |
| 电线直线 | 同道路：T–B {0,1,3}，L–R {0,2,4}（`0x10–0x13`） | 分叉/交叉仅平地 | H |
| 铁路直线 | 同道路，但**坡面格之前的那一格必须是平地并承载"半高"件** `0x3B–0x3E`，坡面格承载 `0x2E–0x31`；不允许连续两格坡面 | 原版铁路爬坡用 2 格完成 1 级 | M |
| 高速（2×2） | 两列（或两行）地块坡面码相同且 ∈ 对应方向集合（`0x61–0x64`）；匝道、转弯、交叉仅平地 | | M |
| 地铁 / 管线 | 与地表坡面无关 | | H |

连续坡面：道路与电线允许连续多格同向坡面（楼梯式爬坡）**[M]**；铁路不允许 **[M]**。

**不满足时的处理（原版行为推断 + 本文建议）**：原版在铺设高速公路/电线等经过不合规坡面时会**改动地形**（逆向注释：拆除斜坡上的高速段后地形被永久改变；存在"检查并调整地形后放电线"的函数）**[M]**。建议实现 `autoTerraformForNetwork`（§3.4.4）：对拖动路径上每个不合规地块，取"使其合规的最小角点改动"（优先推平到路径当前高度，其次改为沿路边坡），执行传播；若传播触及任何含结构物的地块或水块则整段拒绝；地形改动按 Raise/Lower 费率另计。是否逐项复刻原版的具体选择见 §5。

#### 2.11.4 桥梁（跨水）

- 触发：道路/铁路/高速/电线拖动路径进入水块（`XBIT.water`），且沿直线在另一侧回到陆地。拖动必须为直线；桥面全部在水块上方。
- 桥长 `n` = 路径上水块数量；费用 = `n × 单价`（原版"选择桥梁"对话框即按 `格数 × 基价` 显示 **[H]**）。
- 两端：入口/出口落在岸边坡面格上；建桥时该格 `alt += 1`、`water = 0`（变成与桥面齐平的陆地）；拆桥时逆向恢复（`alt −= 1`、`water = 1`、重算 XTER）**[H]**（逆向的拆除逻辑）。
- 类型与可用性 **[M]**：

| 桥 | `XBLD` 构件 | 单价 | 可用长度 | 通航 |
|---|---|---|---|---|
| Causeway（公路） | `0x57` 墩、`0x58` 桥段交替 | $25 / 格 | 任意 | 否（阻断航道） |
| Raising（公路，开启桥） | `0x56` 塔、`0x58/0x59` 中段 | $50 / 格 | 5 ≤ n ≤ 12 | 是 |
| Suspension（公路） | `0x51–0x55` | $75 / 格 | n ≥ 7，无上限 | 是 |
| 铁路桥 | `0x5A` 墩、`0x5B` 段 | $75 / 格 | 任意 | 是（高架） |
| 高速加固桥 | `0x6A` 墩、`0x6B` 段（2×2） | $200 / 段 | 任意 | 是 |
| 高架电线 | `0x5C` | $10 / 格 | 任意 | 是 |

对话框只对公路出现；`n < 5` 时只有 Causeway，5–6 为 Causeway+Raising，7–12 三种皆可，`> 12` 为 Causeway+Suspension **[M]**。

#### 2.11.5 隧道（穿山）

- 构件：`XBLD 0x3F–0x42` 隧道口（朝 T/R/B/L），放在两端的边坡格上；中间地块地表不变，可在其上分区/建造 **[H]**；`ALTM.tunnelLevels = 地表基准海拔 − 隧道海拔`，用于地下视图。
- 触发规则建议 **[M/L]**：道路/铁路从海拔 A 的平地沿方向 d 拖入一个"沿 d 上升"的边坡格 Q，且 Q 之后的地块基准海拔 ≥ A+1（山体继续）→ 询问是否建隧道。"是"：沿 d 直线搜索第一个"沿 d 下降回到 A"的边坡格 E，要求中间每格基准海拔 ≥ A+1、无其他隧道/地铁交叉，长度 ≤ 64；找到则在 Q、E 放隧道口，中间格写 `tunnelLevels`，费用 `$150 × (E − Q + 1)`；找不到则拒绝。"否"：按 §2.11.3 正常爬坡。
- 必须直线；隧道之间不能交叉；高速公路无隧道 **[M]**。
- 拆除：两端口变废墟，中间格 `tunnelLevels = 0` **[H]**。

### 2.12 树木与建设

| 规则 | 说明 | 置信度 |
|---|---|---|
| 存储 | `XBLD 0x06–0x0C` = 密度 1–7（"Tree"→"Veritable Jungle"） | H |
| 允许位置 | 干地（含坡面 1..12）；不允许水面、瀑布、bedrock | M |
| 与分区 | 分区覆盖在树上不清除树（`XZON` 设置，`XBLD` 保留）；建筑生长时替换树 | M/L |
| 与放置型建筑/网络 | 放置时自动清除占地内树木，不额外收费 | M |
| 与推土 | $1/格清除 | H |
| 与地形工具 | Raise/Lower/Level 改变高度的地块上树木被清除；海平面上升淹没的地块树木被清除 | H（Level、海平面）/ M（Raise/Lower） |
| 对模拟的影响 | 提升周边地价、吸收少量污染（归地价/污染规格）；大量砍树会触发报纸抱怨故事（文本数据中存在 `treeremoval` 故事类型），因此地形层需维护 `treesRemovedThisPeriod` 计数器 | H（故事类型存在）/ M（具体阈值未知） |
| 生成器 | Trees 滑块 0–47 控制数量，默认 15 | H |

---

## 3. 数据结构与算法建议

### 3.1 层与接口（TypeScript）

```ts
export const MAP_SIZE = 128;
export const CORNER_SIZE = MAP_SIZE + 1;      // 129
export const TILE_COUNT = MAP_SIZE * MAP_SIZE;
export const MAX_ALT = 31;

/** 与 .SC2 存档一一对应的地形相关层。索引 i = x * 128 + y。 */
export interface TerrainLayers {
  /** ALTM 低 5 bit：基准海拔 0..31 */
  alt: Uint8Array;            // TILE_COUNT
  /** ALTM bit5..9：该地块水位 0..31（无水时 = 0 或 = alt，导出时统一写 alt） */
  waterLevel: Uint8Array;     // TILE_COUNT
  /** ALTM bit10..15：隧道在地表下的级数，0 = 无隧道 */
  tunnelLevels: Uint8Array;   // TILE_COUNT
  /** XTER 原始字节 */
  xter: Uint8Array;           // TILE_COUNT
  /** XBIT 原始字节（本层只读写 0x01 salt / 0x04 water；其余位由电力/供水层维护） */
  xbit: Uint8Array;           // TILE_COUNT
  /** XBLD 中 0x00–0x0C 的地表覆盖（树/废墟/辐射）由本层维护；≥0x0E 由建筑层维护，本层只读 */
  xbld: Uint8Array;           // TILE_COUNT（与建筑层共享同一数组）
  /** 全局海平面 MISC[0x0E40] */
  seaLevel: number;
  /** MISC[0x0E44] / [0x0E48] */
  generatedWithCoast: boolean;
  generatedWithRiver: boolean;
}

export const enum XterClass { Dry = 0x00, Submerged = 0x10, Shore = 0x20, Surface = 0x30, Waterfall = 0x3e, Stream = 0x40 }
export const XBIT_SALT = 0x01, XBIT_FLIP = 0x02, XBIT_WATER = 0x04;

/** 坡面码 → 角位 (a=c00,b=c10,x=c01,y=c11)，bit3..bit0 */
export const SLOPE_CORNERS: readonly number[] = [
  0b0000, 0b1100, 0b0101, 0b0011, 0b1010,      // 0..4
  0b1101, 0b0111, 0b1011, 0b1110,              // 5..8
  0b0100, 0b0001, 0b0010, 0b1000,              // 9..12
  0b1111,                                      // 13 bedrock
];
/** 角位 → 坡面码（16 项，无效角位返回 -1） */
export const CORNERS_TO_SLOPE: readonly number[] = (() => {
  const t = new Array<number>(16).fill(-1);
  SLOPE_CORNERS.forEach((bits, code) => { t[bits] = code; });
  return t;
})();
/**
 * 逆时针旋转 1 次（坐标 (x,y)→(y,127−x)）的坡面码置换：下标 = 旧码，值 = 新码。
 * 由角点重命名 c10→c00', c11→c10', c01→c11', c00→c01' 推出（§2.5.4），与 ui-art.md §3.3 逐项相同。
 * 这是全仓库唯一的一份；渲染 / 拾取 / 路网 / 工具预览必须 import，不得另抄。
 */
export const SLOPE_ROT_CCW: readonly number[] = [0, 4, 1, 2, 3, 8, 5, 6, 7, 12, 9, 10, 11, 13];
/** 逆置换：顺时针 1 次，或把旋转空间里的坡面码反推回世界码 */
export const SLOPE_ROT_CW: readonly number[] = [0, 2, 3, 4, 1, 6, 7, 8, 5, 10, 11, 12, 9, 13];
/** 溪流 / 水湾（0x40–0x45）的逆时针置换；0x3E 不在表中（不变） */
export const XTER_STREAM_ROT_CCW: Readonly<Record<number, number>> = {
  0x40: 0x41, 0x41: 0x40,
  0x42: 0x45, 0x45: 0x44, 0x44: 0x43, 0x43: 0x42,
};
/** 整个 XTER 字节逆时针旋转 times 次（times 取模 4）。0xE/0xF 未定义 nibble 原样返回。 */
export function rotateXterCcw(code: number, times = 1): number {
  let c = code;
  for (let k = 0; k < (times & 3); k++) {
    if (c === XterClass.Waterfall) continue;
    if (c >= 0x40 && c <= 0x45) { c = XTER_STREAM_ROT_CCW[c]; continue; }
    const hi = c & 0xf0, lo = c & 0x0f;          // 0x0X/0x1X/0x2X 坡面码与 0x3X 浅水形状码同为角位编码
    if (lo <= 13) c = hi | SLOPE_ROT_CCW[lo];
  }
  return c;
}

export interface TerrainReadApi {
  tileIndex(x: number, y: number): number;
  alt(x: number, y: number): number;
  slope(x: number, y: number): number;                 // xter & 0x0F（对 0x3E 返回 13，0x4X 返回 0）
  xterClass(x: number, y: number): XterClass;
  isWater(x: number, y: number): boolean;              // xbit & XBIT_WATER
  isSalt(x: number, y: number): boolean;
  isFlatDry(x: number, y: number): boolean;            // xter === 0x00 && !isWater
  cornerHeights(x: number, y: number): [number, number, number, number]; // c00,c10,c01,c11
  waterDepth(x: number, y: number): number;            // waterLevel - alt（无水为 0）
  treeDensity(x: number, y: number): number;           // 0..7
  altitudeFeet(x: number, y: number): number;          // alt*100+50
}

export interface TerrainToolResult { ok: boolean; cost: number; changedTiles: number[]; reason?: string }

export interface TerrainToolApi {
  raise(x: number, y: number, mode: 'editor' | 'city'): TerrainToolResult;
  lower(x: number, y: number, mode: 'editor' | 'city'): TerrainToolResult;
  level(path: ReadonlyArray<[number, number]>, mode: 'editor' | 'city'): TerrainToolResult;
  stretch(x: number, y: number, levels: number): TerrainToolResult;           // editor only
  placeWater(x: number, y: number, mode: 'editor' | 'city'): TerrainToolResult;
  carveStream(x: number, y: number): TerrainToolResult;                       // editor only
  plantTree(x: number, y: number, delta: 1 | -1, mode: 'editor' | 'city'): TerrainToolResult;
  forest(x: number, y: number, radius: number, remove: boolean): TerrainToolResult; // editor only
  bulldozeGroundCover(x: number, y: number): TerrainToolResult;               // 树/废墟/装饰水
  setSeaLevel(newLevel: number): TerrainToolResult;                           // editor only
  generate(params: TerrainGenParams, seed: number): void;
}

export interface TerrainGenParams { coast: boolean; river: boolean; hills: number; water: number; trees: number } // 0..47
```

工作副本：工具运行时使用 `Uint8Array(CORNER_SIZE * CORNER_SIZE)` 的角点高度场 `h`，索引 `ci = cx * CORNER_SIZE + cy`（与地块同为 x 主序）。地块 `(x,y)` 的 4 角索引：`c00 = ci(x,y)`, `c10 = ci(x+1,y)`, `c01 = ci(x,y+1)`, `c11 = ci(x+1,y+1)`。

### 3.2 地块 ⇄ 角点编解码

```ts
function cornersOfTile(L: TerrainLayers, x: number, y: number): [number, number, number, number] {
  const i = x * MAP_SIZE + y;
  const a = L.alt[i];
  const code = slopeCodeOf(L.xter[i]);        // 0..13；0x3E→13；0x4X→0
  const bits = SLOPE_CORNERS[code];
  return [a + ((bits >> 3) & 1), a + ((bits >> 2) & 1), a + ((bits >> 1) & 1), a + (bits & 1)];
}

/** 从角点场写回一个地块的 alt + 坡面 nibble（不改高 nibble 之外的水体类别，水体由 recomputeWater 处理） */
function tileFromCorners(h: Uint8Array, x: number, y: number): { alt: number; slope: number } | null {
  const c = [h[ci(x, y)], h[ci(x + 1, y)], h[ci(x, y + 1)], h[ci(x + 1, y + 1)]];
  const lo = Math.min(...c), hi = Math.max(...c);
  if (hi - lo > 1) return null;                              // 违反不变量
  const bits = ((c[0] - lo) << 3) | ((c[1] - lo) << 2) | ((c[2] - lo) << 1) | (c[3] - lo);
  const slope = bits === 0b1111 ? 0 /* 全高 ⇒ 平地 alt+1 */ : CORNERS_TO_SLOPE[bits];
  return { alt: bits === 0b1111 ? lo + 1 : lo, slope };
}
```

导入时用 `cornersOfTile` 构建 `h`；由于共享角点可能不一致（瀑布/bedrock/故障存档），采用 **"地块数据为准、角点场为派生缓存"**：`h[c] = 该角点周围 4 个地块给出的高度中的最大值`，并记录不一致计数供诊断。瀑布/bedrock 地块（码 13）在构建 `h` 时**不贡献**角点高度（按 `alt` 视作平地处理），以免把"高台"误传播给邻居。

### 3.3 `recomputeTerrainTile(x,y)`（原版 `SetTerrainTile` 的对应物）

```
recomputeTerrainTile(x, y):
  t = tileFromCorners(h, x, y); assert t != null
  alt[i] = t.alt
  if xter[i] == 0x3E and isWater(i) and t.slope != 0: keep 0x3E; return   // 瀑布保留
  slope = t.slope
  if !isWater(i): xter[i] = slope; waterLevel[i] = alt[i]; return
  W = waterLevel[i]
  if slope == 0:
    if W <= alt[i]: xter[i] = 0x30 | surfaceShape(x, y); waterLevel[i] = alt[i]
    else:           xter[i] = 0x10
  else if W == alt[i] + 1: xter[i] = 0x20 | slope
  else if W >= alt[i] + 2: xter[i] = 0x10 | slope
  else: xbit[i] &= ~XBIT_WATER; xter[i] = slope                      // 水只碰到最低角 ⇒ 排干
  // 溪流 0x40–0x45 只由 carveStream/生成器写入；任何几何变化都把它们重算为上面的类别
```

`surfaceShape(x,y)` 按 §2.6.3。凡是改变了某地块角点的操作，必须对**该地块及其 8 邻居**调用 `recomputeTerrainTile`（浅水形状依赖邻居）。

### 3.4 地形工具伪代码

#### 3.4.1 约束传播

```
propagate(h, cornerIdx, newH, dir /* +1 抬高, -1 降低 */, touched: Set<cornerIdx>):
  // BFS 环向外扩散；Chebyshev 距离 d 处允许的极值为 newH ∓ d
  queue = [(cornerIdx, newH)]
  while queue:
    (c, target) = pop
    cur = h[c]
    if (dir > 0 && cur >= target) || (dir < 0 && cur <= target): continue
    h[c] = target; touched.add(c)
    for n in 8 邻接角点(c) 且在 0..128 内:
      push (n, target - dir)       // 抬高时邻居至少 target-1；降低时邻居至多 target+1
```

收敛性：高度单调且有界 [0,31]，每个角点最多改 31 次。

#### 3.4.2 Raise / Lower / Level

```
raise(x, y, mode):
  corners = 4 角索引; top = max(h[corners])
  if top + 1 > MAX_ALT: return fail("too high")
  snapshot = h.clone(); touched = {}
  for c in corners: propagate(h, c, top + 1, +1, touched)
  tiles = tilesTouchedByCorners(touched)            // 每个角点影响最多 4 个地块
  if mode == 'city' and any(tile in tiles has structure or isBridgeOrTunnel(tile)): h = snapshot; return fail("obstructed")
  for t in tiles: clearTrees(t)
  for t in tiles ∪ neighbors8(tiles): recomputeTerrainTile(t)   // 含水体重分类：海床抬出水面 ⇒ 排干
  cost = (mode == 'city') ? 25 * |tiles| : 0
  if mode == 'city' and funds < cost: h = snapshot; return fail("funds")
  return ok(cost, tiles)

lower(x, y, mode): 对称，bottom = min(h[corners])，target = bottom - 1，dir = -1；
  新低于 seaLevel 的地块：xbit |= WATER, waterLevel = seaLevel, salt = 继承相邻水块（任一咸水 ⇒ 咸）

level(path, mode):
  ref = alt(path[0])
  for (x,y) in path:
    for c in corners(x,y): propagate(h, c, ref, +1, touched); propagate(h, c, ref, -1, touched)
  其余同 raise；city 模式下 Level 允许拆除触及地块上的结构物（计入 $25），而 Raise/Lower 不允许
```

#### 3.4.3 海平面

```
setSeaLevel(newW):
  seaLevel = newW
  for each tile i:
    if isSeaConnectedWater(i) or !isWater(i):      // 池塘/溪流/瀑布保留自己的水位
      shouldBeWater = minCorner(i) < newW
      if shouldBeWater: xbit |= WATER; waterLevel = newW; clearTrees(i); if xter is Surface: xter 由 recompute 处理
      else if isWater(i) and waterLevel == oldW: xbit &= ~WATER
      recomputeTerrainTile(i)
  recomputeSalt()                                  // 泛洪
```

"海相连水块"的判定：`waterLevel == 旧 W` 且非 0x3X/0x4X/0x3E。

#### 3.4.4 网络自动整地（建议实现，可开关）

```
autoTerraformForNetwork(path, kind):
  snapshot = h.clone(); extraCost = 0
  for k, (x,y) in path:
    dir = 路径在该格的轴向 (TB | LR)
    allowed = (kind 需要平地 ? {0} : dir == TB ? {0,1,3} : {0,2,4})
    if slope(x,y) in allowed: continue
    // 候选 1：推平到"路径进入该格时的高度" (prev tile 在共享边上的角高)
    // 候选 2：改为沿 dir 的边坡，方向取使共享边与前一格匹配者
    for candidate in [flat(hEntry), slopeAlong(dir, hEntry)]:
      trial = h.clone(); applyCornerTargets(trial, candidate, touched)
      if touchedTiles 不含结构物/水/桥/隧道 且 trial 在路径之外的改动仅限空地: h = trial; extraCost += 25*|touchedTiles|; break
    else: h = snapshot; return fail("terrain")
  recompute 受影响地块
  return ok(extraCost)
```

### 3.5 水体重算

```
refloodAll():  对全部地块执行 setSeaLevel(seaLevel) 的内循环
recomputeSalt():
  clear all XBIT_SALT
  if !generatedWithCoast: return
  seeds = 边缘(x==0||x==127||y==0||y==127) 且 isWater 且 waterLevel==seaLevel 的地块
  BFS over 4 邻接 isWater 且 waterLevel==seaLevel ⇒ set SALT
```

### 3.6 地形生成器（建议算法）

所有随机数来自 `mulberry32(seed)`，保证可复现；参数名与 §2.7.1 对齐。

```
generate(p, seed):
  rng = mulberry32(seed)
  // ---- 1. 基础噪声（角点网格 129×129）
  n1 = fbm2D(129, 129, {octaves: 5, baseFreq: 1/48, gain: 0.5, lacunarity: 2}, rng)  // ∈[0,1]
  n1 = smoothstep 重映射使中值≈0.5
  // ---- 2. 海平面与幅度
  W     = clamp(2 + floor(p.water / 2), 1, 14)            // water=5 ⇒ 4（默认海平面 4）
  range = 2 + floor(p.hills * 26 / 47)                     // hills 0⇒2, 12⇒8, 47⇒28
  lakeBias = (p.water > 0) ? 1 + floor(p.water * 3 / 47) : 0  // 让部分低洼落到 W 之下形成湖
  base  = (p.water == 0 && !p.coast && !p.river) ? W : W - lakeBias
  for c: h[c] = clamp(base + round(pow(n1[c], 1.15) * range), 0, 31)
  // ---- 3. 海岸
  if p.coast:
    side = rng.pick([T, R, B, L]) ; 可选第二侧概率 0.25
    for c: dist = 到该边的格距; shore = 10 + 8*noise1D(c 沿边坐标) ; if dist < shore:
      depthT = (shore - dist)/shore                 // 0 岸 → 1 边缘
      h[c] = min(h[c], W - 1 - floor(depthT * 2))   // 边缘最深 W-3
  // ---- 4. 河流
  if p.river:
    起点在随机边中点附近，终点在对面边；中线用 3 段正弦叠加噪声 meander（振幅 8–20 格）
    width = 2 + floor(rng()*3)
    for c 距中线 <= width/2: h[c] = min(h[c], W - 1 - (距中线 < 1 ? 1 : 0))
  // ---- 5. 约束松弛（≤1 级）
  repeat until no change (最多 64 轮):
    正向扫描 + 反向扫描: for c: for n in 8邻: h[c] = min(h[c], h[n] + 1)
  // ---- 6. 写回地块 + 水体
  for tile: {alt, slope} = tileFromCorners(h); xter = slope; water = (minCorner < W)
            if water: waterLevel = W; xbit |= WATER
  recomputeAll(); recomputeSalt()
  // ---- 7. 溪流
  streamCount = floor((p.water + 3) / 4)                    // 5⇒2, 47⇒12
  for k in 1..streamCount: start = 随机选一个 alt ≥ W+3 的干平地; carveStream(start)
  // ---- 8. 树
  n2 = fbm2D(128,128,{octaves:4, baseFreq:1/24}, rng)
  pTree = p.trees / 47
  for tile 干地且非 bedrock: v = n2 * 0.7 + rng()*0.3; if v < pTree * 1.1:
      density = clamp(1 + floor((v / max(pTree,0.01)) * 7 * 0.9), 1, 7) ; xbld = 0x05 + density
  // ---- 9. 元数据
  seaLevel = W; generatedWithCoast = p.coast; generatedWithRiver = p.river
```

#### 3.6.5 `carveStream(x,y)`

```
carveStream(x0, y0):
  (x,y) = (x0,y0); visited = {}; steps = 0
  while steps++ < 96:
    if isWater(x,y) or 越界: 把上一格改成朝向 (x,y) 的水湾 0x42–0x45; return
    s = slope(x,y)
    if s == 0:
      next = 4 邻中 minCorner 最低且 < 或 == 当前 alt 的格（优先更低；平的允许但不许回头/重访）
      if none: xter = 0x3D 风格孤立池塘（water=1, waterLevel=alt）; return      // 洼地终点
      xter = (next 在 ±y 方向) ? 0x41 : 0x40 ; water=1 ; waterLevel=alt
    else if s in 1..12:
      // 坡面 ⇒ 瀑布；要求流向与下坡方向一致，否则改走别的邻居
      xter = 0x3E; water=1; waterLevel=alt+1
      next = 该坡面的低边方向上的邻格
    else return
    clearTrees(x,y); visited.add; (x,y) = next
```

### 3.7 导入 / 导出要点（与存档模块的接口）

- 导入：`ALTM` 大端 `u16` → `alt = v & 0x1F`, `waterLevel = (v >> 5) & 0x1F`, `tunnelLevels = (v >> 10) & 0x3F`。随后 **以 `XTER` 为准修正 `waterLevel` 与 `XBIT.water`**：`XTER` 高 nibble 为 1/2/3/4 或 0x3E 时视为有水；0x1X/0x2X 且 `waterLevel < alt+1` 时把 `waterLevel` 设为 `seaLevel`（存档字段可能不准 **[H]**）。
- 导出：写回 `alt | waterLevel << 5 | tunnelLevels << 10`；无水地块 `waterLevel = alt`（与原版观察的常见取值一致 **[L]**）。`XTER` 未定义码永不写出。
- `XTER/ALTM/XBIT` 的线性顺序一律 `x * 128 + y`，存档旋转值不影响数据顺序。

---

## 4. 边界条件与易错点

1. **坡面 nibble 不是位掩码**：`0x5 ≠ 0b0101`。所有角位运算必须经 `SLOPE_CORNERS` 查表。
2. **位编号方向**：两份资料对 `ALTM/XBIT` 的 bit 编号方向相反。以掩码值为准：`alt = v & 0x1F`，水位 `0x04`，咸水 `0x01`。
3. **存档水位字段不可靠**：逆向注释与 OpenSC2K 都选择忽略 `ALTM.waterLevel`，以 `XTER` 判定水体。导入必须做修正（§3.7）。
4. **bedrock/瀑布不参与连续性**：`0x0D/0x3E` 表面在 `alt+1`，但其邻居的共享角点仍可能是 `alt`。构建角点场时把它们按平地 `alt` 处理，渲染时单独画垂直面；拆除瀑布后重算坡面码以避免"洞穴"遗留。
5. **浅水形状依赖邻居**：任一地块水体变化后要重算 8 邻居，否则池塘边缘形状过时。
6. **零深度水不可通航**：`0x3X` 池塘、`0x4X` 溪流 `depth == 0`；海港/码头/船只路径只认 `depth ≥ 2`（起重机）或 `depth ≥ 1`（航线，见海港规格）。
7. **地图边缘**：角点场 129×129，边缘外视为同高；浅水形状计算时越界邻居视为"水"；渲染在 `x==0||y==0||x==127||y==127` 画侧壁到 0 级。
8. **旋转**：数据永不旋转；旋转只置换坐标与坡面码。置换表不是"目视校准"出来的，而是由坐标变换 `(x,y)→(y,127−x)` 推出的方向映射 `T→L→B→R`（§2.5.4，`SLOPE_ROT_CCW = [0,4,1,2,3,8,5,6,7,12,9,10,11,13]`）。任何模块都只能 import 本模块的常量，并由 §2.5.4 的数据级 vitest 与 ui-art §3.3 的像素快照共同锁定；若改动坐标变换方向，必须同时换用 `SLOPE_ROT_CW` 并更新 ui-art。
9. **坡面上无废墟**：拆除后只有 `xter == 0x00` 的格放废墟 `0x01–0x04`。
10. **桥两端修改地形**：建桥把岸边格 `alt+1` 并清水位，拆桥逆向恢复；若中途修改了海平面，拆桥的"恢复"可能把陆地变成水——原版亦如此，保留。
11. **高速公路在斜坡上留下永久地形改动**（原版行为）：实现 `autoTerraform` 时，拆除不回滚地形。
12. **Raise/Lower 的费用口径**不确定（每次点击 $25 还是每改变格 $25），先按"每改变格"实现并放在常量表里便于切换。
13. **铁路 2 格爬坡**：坡面格前一格必须是平地且要被改成"半高"件；若那一格已有其他物件则整段拒绝。
14. **树与分区并存**：`XZON` 有分区而 `XBLD` 仍是树，不要把"有树"误判为"空地可生长"之外的状态——生长逻辑应把 `0x06–0x0C` 与 `0x00` 一视同仁为可建。
15. **海平面工具只在编辑器**：城市模式没有 Raise/Lower Sea Level。
16. **溪流转弯无专用精灵**：原版允许视觉断开；占位美术可把溪流绘到四边中点以缓解。
17. **伪随机可复现**：生成器与森林刷子必须只从传入的 PRNG 取数，便于 vitest 快照测试。

---

## 5. 待确认问题（建议用原版实机/社区求证，当前按文中建议值实现）

1. 默认海平面是否恒为 4，Water 滑块 → 海平面的具体映射（本文：`2 + floor(water/2)`，上限 14）。
2. Hills 滑块 → 起伏幅度/频率的真实映射；原版生成器是否含侵蚀/河流走向逻辑（本文用 fBm + 松弛近似）。
3. Raise/Lower 的费用：每次点击固定 $25，还是每个被改变地块 $25；Level 的费用与其拆除行为是否收取拆除费。
4. Raise/Lower 在"任何受影响地块有结构物"时是拒绝还是自动拆除。
5. 树工具每次点击增加 1 档还是随机 1–2 档；Forest 刷子半径与密度分布。
6. 分区是否允许画在坡面上；1×1 建筑能否在坡面生长；2×2/3×3 是否严格要求整块平地。
7. 道路/电线/高速在不合规坡面上的真实处理（拒绝、还是像本文建议那样自动整地并收费）；电线的"检查并调整地形"函数的具体规则。
8. 铁路"半高"件的精确布置规则与是否允许连续坡面。
9. 隧道触发条件（本文：进入上升边坡且后方继续更高）、最大长度、入口是否要求同一海拔出口。
10. 桥梁对话框的长度阈值（本文：Causeway 任意，Raising 5–12，Suspension ≥7）；极短跨度是否跳过对话框。
11. `ALTM` bit 10–15 中最低两位在水电站附近为 1 的真实含义（是否与隧道深度共用）。
12. 是否复刻"瀑布移除后遗留 bedrock（洞穴）"与"海平面工具导致树长在水上"等原版故障，还是提供开关。
13. 溪流在原版生成器中的真实走向/数量与 Water 滑块的关系。
14. 查询工具的海拔显示是否为 `alt*100+50 ft`（风电表暗示如此）。

---

## 6. 参考来源

- dfloer / SC2k-docs（CC BY-SA 4.0）：`sc2 file spec.md`（ALTM、XTER、XBLD、XBIT、MISC 字段表）、`simulation spec.md`（地形生成参数表、风电海拔表、水泵公式）、`text data spec.md`（`treeremoval` 故事类型）、`sprite data spec.md`（精灵文件头含显式 ID）。本地副本见任务说明中的 `refdocs/` 目录。
- araxestroy / sc2kfix（MIT；**仅阅读以理解机制，未复制代码**）：`include/sc2k/sc2k_1996.h` 中的 `XTER` 枚举与精灵序号注释、`ALTM/XBIT` 位域结构、地形编辑器工具枚举；`hooks/hook_terrainhandling.cpp`（拆除桥/隧道/坡面建筑时的地形恢复逻辑）；`hooks/hook_tilegrowthorplacement.cpp`（建筑放置要求地表码为 0、码头水深 ≥2、起重机码头规则）；`hooks/hook_bridgedialog.cpp`（桥费用 = 格数 × 基价）；`modules/sc2k_help.cpp` 中工具帮助文本（本文已转述，未照抄）。
- nicholas-ochoa / OpenSC2K（**仅阅读**）：`src/import/segmentHandlers/XTER.js`（XTER → 地表/水面精灵映射）、`ALTM.js`（位掩码）、`src/import/sc2.js`（线性索引 → `x = floor(i/128)`, `y = i % 128`）、`src/import/tiles.js`（坡面精灵的四向旋转环——注意其遍历方向对应与本文相反的旋转约定，本文已按 §2.5.4 的坐标变换重新推导，未沿用其方向）、`src/constants.js`（64×32 地块、每级 24 px、默认水位 4）。
- 社区指南（通过搜索摘要获得，站点本身不可直接访问）：ludo.guide 的 SC2K 条目（Water $100/格、坡面点水成瀑布、Trees $3/次、Raise/Lower/Level $25、海平面每步 100 ft、桥型与长度建议、隧道 $150、各类桥价）；oocities 的 SC2K 指南（$25/格/级、低于海平面成水）；Wikibooks/StrategyWiki "SimCity 2000 Concepts"（海平面工具故障、瀑布遗留高台）。
- 其余未标注来源的规则为作者对原版的记忆与推断，均已标注 [M]/[L] 并列入 §5。
