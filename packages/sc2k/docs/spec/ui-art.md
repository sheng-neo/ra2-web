# 领域规格：UI 结构与原创美术规范（UI & Art Bible）

> 适用范围：`packages/sc2k` 的外壳 UI（菜单栏、工具栏、状态区、各窗口与对话框）、城市视图（投影、缩放、旋转、地下视图、拾取）、输入（鼠标 / 键盘 / 触控）、精灵提供者抽象（程序化原创美术 ↔ 玩家本地导入的真实 DAT），以及"原创像素美术规范"（网格、尺寸、锚点、着色、调色板、生成配方、动画）。
> 目标读者：并行实现 `ui-shell`、`renderer`、`art-procedural`、`art-dat-import`、`input` 等工作包的工程师（含 AI agent）。
> 置信度标记：**[H]** 一手资料（社区格式文档 / 逆向重实现的数据表）直接支持；**[M]** 多个二手来源或强推断；**[L]** 仅凭记忆或单一来源；**[设计]** 本项目自定义，无需与原版一致。
> 版权铁律：本文不含任何 Maxis/EA 素材（无原版像素、无原版调色板数值、无原版文案）。原版精灵 ID 只用于玩家本地导入自有 `LARGE.DAT` 时的查表。所有默认美术由本文 §3.6–§3.9 的配方程序化生成。

---

## 1. 概述

SC2K（Win95 Special Edition）的交互面由三层组成：

| 层 | 内容 | 本项目的实现载体 |
|---|---|---|
| 外壳（chrome） | 菜单栏、浮动工具栏、状态区、十余个信息窗口与模态对话框 | DOM（原生 TS + 极小 `h()` 构建器，或架构文档指定的 UI 库）；样式用 CSS 变量实现"90 年代斜面窗口"风格 |
| 城市视图（viewport） | 128×128 等距地图，5 个显示缩放档（XS/S/M/L/XL；原生美术只有 3 档，其余整数倍派生，§3.4）、四向旋转、地下视图、图层显示开关、工具预览 | PixiJS v8 单 `Application`，分块容器 + 纹理图集 |
| 美术来源（art source） | 程序化原创像素精灵（默认）或玩家本地导入的 `LARGE.DAT / SMALLMED.DAT / SPECIAL.DAT + PAL_MSTR.BMP` | 统一 `SpriteProvider` 接口；两者都产出 **8 bit 索引色位图**，渲染前经调色板 LUT 转 RGBA |

核心设计决定（后文展开）：

1. **数据永不旋转**。旋转只做坐标置换 + 瓦片 ID / 坡面码置换（§2.9.3、§3.3）。原版亦如此：建筑只有一套精灵，路网 / 地形 / 水面靠"每个朝向一个 ID"实现旋转 **[H]**。因此我们的生成器**不需要为建筑出 4 套精灵**。
2. **基础格 32×16 px（缩放档 M）= 原版 large 美术的原生格**：`LARGE.DAT` 的 1×1 平地精灵是 32×17（含 1 行重叠行），每级海拔 12 px（`file-formats.md` §2.6.3 **[H]**）。显示档共 5 个：XS 8×4（原版 small 8×5 / 3 px）、S 16×8（原版 medium 16×9 / 6 px）、M 32×16、L 64×32（24 px / 级）、XL 128×64（48 px / 级）。**L / XL 没有原版原生美术**——Win95 的最近两档就是像素加倍 **[M]**；DAT 来源在 L / XL 用 M 位图最近邻 ×2 / ×4，程序化来源在 S / M / L 原生生成、XS = S ÷2、XL = L ×2（§3.4）。§3.6–§3.9 的配方尺寸以 L 档（64 px 格）书写，那只是程序化美术的"母版"分辨率，**不是**原版文件尺寸（OpenSC2K 的 64×32 / 24 也只是它的 2× 渲染常量）。
3. **索引色管线**：生成器写 `Uint8Array` 调色板索引（0 = 透明），与 DAT 导入路径同构，颜色循环动画（水 / 灯）通过"含循环索引的位图每帧重建 LUT"实现。
4. **工具是状态机**：`Click / Paint / Line / Rect / Place / Dispatch / Query / Sign / Center / Help` 十种操作模式覆盖原版全部工具（§2.8）。
5. **触控一等公民**：单指 = 工具，双指 = 平移 / 捏合缩放 / 旋转；窄屏时工具栏变底部抽屉（§3.11）。

本文结构：§2 原版行为 → §3 数据结构、算法与 Art Bible → §4 边界条件 → §5 待确认 → §6 参考。

---

## 2. 原版行为

### 2.1 屏幕布局（Win95 SE）

| 区域 | 原版表现 | 置信度 |
|---|---|---|
| 菜单栏 | 顶部一行：`File / Speed / Options / Disasters / Windows / Newspaper / Help` | H（前 6 项由任务与存档 MISC 标志位印证）/ M（Help） |
| 城市视图 | 主窗口的客户区（Win95 为 MDI 子窗口，带滚动条）；标题栏显示城市名 | M |
| 城市工具栏 | 独立的浮动工具条（可拖动），**两列**按钮，上部为建造工具，中部为视图控制，下部为窗口按钮与显示开关 | M（两列布局与分组）/ L（精确行序） |
| 子工具弹出条 | 点击带子工具的按钮，在其右侧弹出一条横向图标列表；悬停 / 选中时在条内（Win95）或状态区显示"名称 $价格"；按钮记住最后一次选择的子工具 | M |
| 状态区 | 两行：第一行左端 **天气图标**（灾害模式下变为红色 goto 箭头，点击在多处灾害间循环并居中，`disasters-events.md` §2.2.3）、消息区（当前工具名与价格、拒绝原因、事件提示）、右侧 **日期（月 年）** 与 **资金（$）**；第二行 **市民诉求**（`services-models.md` §2.10.4 诉求链第一条）；资金不足时资金数字闪烁 | H（天气图标 / goto 箭头 / 诉求行存在）/ M（排布） |
| 地形编辑模式 | 新城 / 载入地形时，工具栏被替换为地形编辑工具栏（见 `terrain.md` §2.8），菜单仍在 | H |
| 灾害模式 | `MISC[0x0004] = 2` 时，建造类工具禁用，仅保留 Bulldozer / Emergency / Query / Signs / 视图控制 | H（模式存在）/ M（禁用集合） |

### 2.2 菜单栏

每个菜单项对应的持久化字段来自 `MISC`（`sc2_file_spec`），存在性 **[H]**，菜单归属 **[M]**：

| 菜单 | 项 | 行为 | 持久化 / 说明 |
|---|---|---|---|
| File | New City… | 打开新城对话框（§2.6.11） | — |
| File | Load City… | 文件选择（浏览器 `<input type=file accept=.sc2>` / 拖放） | — |
| File | Load Scenario… | 同上，`.scn`（含 SCEN/TEXT/PICT 段） | — |
| File | Save City / Save City As… | 导出 `.sc2`（浏览器下载 / OPFS） | — |
| File | Import Game Assets… **[设计]** | 导入 `LARGE.DAT / SMALLMED.DAT / SPECIAL.DAT / PAL_MSTR.BMP`，仅存 IndexedDB，不上传 | — |
| File | Exit | 返回标题页 | — |
| Speed | Pause / Turtle / Llama / Cheetah / African Swallow | 单选 | `MISC[0x0FEC]` 1–5 [H] |
| Options | Auto-Budget | 勾选后 1 月不弹预算窗 | `MISC[0x0FF0]` [H] |
| Options | Auto-Goto | 灾害 / 重大事件时视图自动居中 | `MISC[0x0FF4]` [H] |
| Options | Sound Effects / Music | 开关 | `MISC[0x0FF8] / [0x0FFC]` [H] |
| Options | Show Toolbar / Reset Toolbar Position **[设计]** | 浮动工具栏显隐与复位 | 本地 `localStorage` |
| Disasters | Fire / Flood / Air Crash / Tornado / Earthquake / Monster / Hurricane | 立即触发（灾害规格） | Hurricane 仅 Win95 版可手动触发 [M] |
| Disasters | No Disasters | 勾选后不随机发生灾害，手动触发仍可 | `MISC[0x1000]` [H] |
| Windows | Budget / Map / Graphs / Population / Industries / Neighbors / Ordinances / Newspaper | 打开或前置对应窗口 | Ordinances 原版从 Budget 进入，Windows 菜单直达为 **[设计]** |
| Newspaper | Subscribe to 〈报名 A / B / C〉 / No Paper | 选择送达的报纸（报名为本项目自撰） | `MISC[0x100C]`、`[0x1004]` [H] |
| Newspaper | Extra!!! | 开关重大事件号外弹窗 | `MISC[0x1008]` [H] |
| Help | Help Tool / About | — | — |

### 2.3 工具栏：按钮与子工具

按钮集合与子工具内容 **[H]**（与兄弟规格的造价表逐项对应）；两列排列 **[M]**；行序为本项目固定值 **[设计]**。价格见 `economy-budget.md` §2.9，此处只列 UI 相关字段。

| 行 | 左列按钮 | 左列子工具（弹出顺序） | 右列按钮 | 右列子工具（弹出顺序） |
|---|---|---|---|---|
| 1 | Bulldozer | Demolish/Clear, Level Terrain, Raise Terrain, Lower Terrain, De-zone | Landscape | Trees, Water |
| 2 | Emergency | Police Dispatch, Fire Dispatch, Military Dispatch（无军事基地时灰显） | Roads | Road, Highway, Onramp, Tunnel, Bus Depot |
| 3 | Power | Power Lines, Coal, Hydro, Oil, Gas, Nuclear, Wind, Solar, Microwave, Fusion | Water | Pipes, Water Pump, Water Tower, Water Treatment, Desalinization |
| 4 | Rails | Rail, Subway, Rail Depot, Subway Station, Sub↔Rail | Ports | Seaport, Airport |
| 5 | Residential | Light, Dense | Commercial | Light, Dense |
| 6 | Industrial | Light, Dense | Education | School, College, Library, Museum |
| 7 | City Services | Police Station, Fire Station, Hospital, Prison | Recreation | Small Park, Big Park, Zoo, Stadium, Marina |
| 8 | Signs | （无子工具） | Query | （无子工具） |
| 9 | Rewards | Mayor's House, City Hall, Statue, Military Base, Llama Dome, Plymouth / Forest / Darco / Launch Arcology（未解锁项灰显；全部灰显时按钮本身灰显） | （空） | — |
| 10 | Rotate CCW | — | Rotate CW | — |
| 11 | Zoom Out | — | Zoom In | — |
| 12 | Centering | — | Help | — |
| 13 | Map window | — | Graphs window | — |
| 14 | Population window | — | Industries window | — |
| 15 | Neighbors window | — | Budget window | — |
| 16 | 显示开关 5 枚（横排）：Show Buildings, Show Signs, Show Infrastructure, Show Zones, Show Underground | | | |
| 17 | **RCI 需求指示器**（非按钮，横跨两列；原版工具栏自带，`building-catalogue.md` §2.11 **[H]**）：R / C / I 三根 ± 柱，柱高 = `|demand[z]| / 2000 × 半幅`，正向上、负向下（`zones-growth-demand.md` §2.8.7 **[H]**），R 绿 / C 蓝 / I 黄（调色板索引 5 / 6 / 7）；每月 `monthTick` 刷新；悬停显示三值；点击打开 Industries 窗口 Demand 页 **[设计]** | | | |

子工具条规则 **[M]**：

- 子工具条宽度 = `n × 36 + 8` px（L 档图标 24×24 + 内边距），出现在按钮右侧，超出屏幕时翻到左侧。
- 未解锁（科技年份未到、Nuclear Free Zone、人口门槛未到）的子工具灰显但可悬停查看原因。
- 选中子工具后按钮高亮并把该子工具图标叠加到按钮右下角（本项目用小角标表示）**[设计]**。
- 点击"无子工具"按钮直接进入该工具模式。

### 2.4 状态区字段

| 字段 | 内容 | 刷新时机 |
|---|---|---|
| 消息区 | 优先级：拒绝原因（2 s 后消失）> 事件横幅（灾害 / 诉求 / 发明，5 s）> 当前工具提示 `〈子工具名〉 $〈单价〉` | 工具变更 / 事件 |
| 日期 | `〈月份名〉 〈年份〉`，月份名由本项目自定（如 `Jan`）；暂停时前缀 `‖` | 每月 |
| 资金 | `$` + 千分位；`funds < 0` 红色；拒绝扣费时闪烁 3 次（每次 150 ms） | 每月 / 每次扣费 |
| 速度指示 **[设计]** | 5 格小图标 | 速度变更 |
| 天气 / 灾害图标 | 24×24 图标，12 种天气各一枚（`disasters-events.md` §2.4.2 图标列：温度计低 / 太阳 / 温度计高 / 雾 / 小雪花 / 云 / 雪 / 雨 / 风 / 暴雪 / 飓风 / 龙卷），悬停显示天气名与温度；**灾害模式**（`MISC[0x0004] = 2`）下整枚替换为**红色 goto 箭头**，点击取 `disasters.focusPoints()` 的下一项并居中视图（多灾害循环；`disasters-events.md` §2.2.3 **[H]**） | 每月第 24 天 `weatherChanged`；灾害开始 / 结束；点击 |
| 诉求行（第二行） | `services-models.md` §2.10.4 诉求链的**第一条**未满足项文案（天气警告 → 电 → 路 → 警 → 消 → 水 → 医院 → 学校 → 海港 / 连接 → 机场 → 休闲）；无诉求时留空；文案来自 `cityStatus`，UI 不自行判定 | 每月第 24 天（`cityStatus`） |

布局：第一行 `[天气图标] [消息区 ……] [日期] [资金] [速度]`，第二行 `[诉求文字]`；窄屏时第二行并入消息区轮播（§3.11）。

### 2.5 信息窗口

所有窗口为非模态浮动窗口（可拖动、可关闭、同类只开一个），年度预算窗口例外（模态并暂停，见 `economy-budget.md` §2.2）。字段来源以存档段为准 **[H]**，布局细节 **[M]**。

| 窗口 | 内容 | 数据源 |
|---|---|---|
| Budget | 见 `economy-budget.md` §2.10（税率滑块、各部门资金滑块、法令 / 债券明细按钮、现金流、Auto-Budget 复选框） | 经济模块 |
| Map | 128×128 俯视小地图（1 格 = 2×2 px，共 256×256，可整数放大）+ 当前视口矩形 + 左侧图层按钮列；点击小地图把视图居中到该格 | §2.5.1 |
| Graphs | 16 条序列复选框（颜色图例）+ `1 yr / 10 yr / 100 yr` 三选一 + 折线区（12 / 20 / 20 个点） | `XGRP`（`economy-budget.md` §2.14） |
| Population | 三块条形图：人口 / 健康（LE）/ 教育（EQ），各 20 个年度值 | `MISC[0x007C..0x0168]` |
| Industries | 三页：Ratios（11 产业占比）、Tax Rates（11 条 0–20% 滑块）、Demand（11 条 ±柱） | `MISC[0x016C..0x01EC]`、产业税率 |
| Neighbors | 中央本城（名 + 人口），四角四个邻城（名 + 人口），边上的连接数 | `MISC[0x06D8..0x0718]`、`MISC[0x1024]` |
| Ordinances | 20 个复选框按组分列，每条右侧显示 YTD 与年末估计，底部合计 | `MISC[0x0FA0]` 位 0–19 |
| Newspaper | 报头（本项目自撰报名）、日期、头条 + 2–4 条正文、天气栏、广告块；`Extra!!!` 为同一组件的模态版 | 文本模块 |
| Query | 见 §2.5.2 | 各层 |

#### 2.5.1 Map 窗口图层模式

| 模式 | 数据 | 分辨率 | 着色规则 **[设计，色值见 §3.7]** |
|---|---|---|---|
| Structures | `XBLD/XZON/XTER` | 128² | 水蓝、陆地按海拔 4 阶绿→褐、树深绿、建筑按类别（R 绿 / C 蓝 / I 黄 / 公共灰 / 电厂棕）、路网深灰 |
| Zones | `XZON` 低 4 bit | 128² | R 绿 / C 蓝 / I 黄，轻区浅、密区深；机场 / 海港 / 军事各一色 |
| Transportation | `XBLD` 0x1D–0x6F（道路 / 铁路 / 高速 / 桥 / 隧道） | 128² | 道路灰、铁路褐、高速橙 |
| Power | `XBIT` Powerable/Powered + 电线 | 128² | 供电黄、断电红、电线细线 |
| Water | `XBIT` Piped/Watered + `XUND` 管线 | 128² | 有水蓝、缺水红 |
| Population Density | `XPOP` | 32² | 16 阶单色渐变 |
| Rate of Growth | `XROG` | 32² | `>0x82` 绿、`<0x7D` 红、其余中性，强度按偏离 0x7F |
| Traffic Density | `XTRF` | 64² | 16 阶 |
| Pollution | `XPLT` | 64² | 16 阶 |
| Crime Rate | `XCRM` | 64² | 16 阶 |
| Land Value | `XVAL` | 64² | 16 阶 |
| City Services → Police / Fire | `XPLC / XFIR` | 32² | 16 阶 |
| City Services → Health / Education **[M]** | 医院 / 学校覆盖（服务模块提供 32² 图） | 32² | 16 阶 |

#### 2.5.2 Query 对话框

点击地块弹出（非模态，跟随再次点击更新）。字段 **[M]**，离散化阈值 **[设计]**：

| 字段 | 取值 |
|---|---|
| 名称 | 建筑名（`XBLD` 名表）；有微模拟记录的建筑可编辑（写入 `XLAB`） |
| 地形 | `Land / Water / Shore / Submerged / Waterfall / Stream`，海拔 `alt*100+50 ft` |
| 分区 | `None / Light|Dense Residential|Commercial|Industrial / Military / Airport / Seaport` |
| 地价 / 犯罪 / 污染 / 交通 | 对应 64² 图取值 v（0–255）：`None (0) / Low (1–63) / Medium (64–127) / High (128–191) / Very High (192–255)` |
| 电 / 水 | `Powered / No Power / N/A`、`Watered / No Water / N/A`（按 `XBIT` Powerable/Piped 决定 N/A） |
| 微模拟面板 | 电厂：MW、负载 %、年龄 / 到期；泵 / 淡化：本月加仑；水塔：蓄水；警局：逮捕数；体育场：球队与战绩；Arco：人口；Llama Dome：趣味统计（各模块提供 `QueryStats[]` 键值对） |

### 2.6 对话框（模态）

| 对话框 | 字段 / 按钮 | 置信度 |
|---|---|---|
| New City | 城市名（≤ 23 字符，`CNAM`）、难度 Easy / Medium / Hard、起始年 1900 / 1950 / 2000 / 2050、地形：Coast / River 开关 + Hills / Water / Trees 三滑块 0–47（默认 12 / 5 / 15）、`Make`（重新生成）、`Done` | H |
| Bridge Type | 列出可用桥型与总价（资金不足红字仍可选）、`Cancel` | H |
| Neighbor Connection | "连接到邻城？$1,000" 确认 | M |
| Stadium Team | 五种运动 + 队名 | M |
| Yearly Budget | 见经济规格 | H |
| Disaster Alert | 灾害名 + `Go To` / `OK`（Auto-Goto 开启时跳过） | M |
| Extra!!! | 报纸号外 | H |
| Game Over | "被赶下台" + `Main Menu` / `Continue Watching` | M |
| Reward Offer | 奖励建筑可用提示（工具栏 Rewards 同时点亮） | M |
| Import Assets **[设计]** | 拖放区 + 文件清单 + 校验结果（精灵数、调色板 OK）+ `Use procedural art` 开关 | — |

### 2.7 视图：缩放、旋转、地下、显示开关

| 项目 | 原版 | 本项目 | 置信度 |
|---|---|---|---|
| 美术缩放档 | 三级原生美术：small 8 / medium 16 / large 32 px 宽（`file-formats.md` §2.6.3）；Win95 在此之上的更近显示档是 large 美术的像素加倍（"最近两档共用美术"） | 显示档 XS / S / M / L / XL = 8×4 / 16×8 / 32×16 / 64×32 / 128×64；**必做** S / M / L。原生美术：DAT 提供 XS / S / M（= small / medium / large），procedural 提供 S / M / L；其余整数倍派生（§3.4） | H（三级与文件宽度）/ M（Win95 加倍档的数目） |
| 每级海拔 | large 12 px（medium 6 / small 3） | XS 3 / S 6 / M 12 / L 24 / XL 48 | H（large）/ M（其余） |
| 旋转 | 4 向，`MISC[0x0008]` = 逆时针次数 0..3；存档数据不旋转 | 同 | H |
| 旋转时的建筑 | 建筑精灵不变（无 4 套精灵）；地形 / 路网 / 水面按 ID 置换；码头 / 跑道 / 匝道 / 桥件等定向件用 `XBIT` 翻转位 `XBit.Flipped`（`0x02`，§2.9.3） | 同（§3.3） | H |
| 地下视图 | 地表替换为土色，显示管线（`XUND` 0x10–0x1E）、地铁（0x01–0x0F）、地铁站 / 导弹井地下部分；地面建筑隐藏 | 同；`PIPED` 建筑格画短管桩（`power-water.md` §3.6） | H（存在）/ M（细节） |
| 显示开关 | Buildings / Signs / Infrastructure / Zones / Underground 五个独立开关 | 同；关闭 Buildings 时分区格显示为分区色菱形 | M |
| Centering | 选中后点击地图，视图以该格居中 | 同；另加 `Home` 键居中城市几何中心 | M |
| Auto-Goto | 灾害 / 重大事件时视图平滑移动到事件格 | 平滑 400 ms | H（开关）/ 设计（动画） |
| 视口持久化 | `MISC[0x1018/0x101C]` 视图中心格；`[0x1014]` 疑似缩放 | 读写中心格；缩放按本项目字段另存 | M |

### 2.8 输入：鼠标操作模式与键盘

工具操作模式（每个子工具恰好属于一种）**[M，各工具归类按原版手感；Rect 与 Line 的区分为 H]**：

| 模式 | 子工具 | 交互 | 预览 | 提交 |
|---|---|---|---|---|
| Click | Raise, Lower, Water（地形）, Small Park（1×1）, Water Pump, Wind, Hydro, Statue, Subway Station, Sub↔Rail, Onramp（以上皆 `FOOTPRINT[id] == 1`） | 单击 | 1×1 菱形高亮（绿 / 红） | 松开时 |
| Paint | Demolish, Level, De-zone, Trees, Police/Fire Dispatch（原版 Click，本项目允许拖） | 按下即生效，拖动沿途每格各生效一次（同格不重复） | 当前格高亮 | 逐格即时 |
| Line | Road, Rail, Power Lines, Pipes, Subway, Highway, Tunnel（由 Road/Rail 进坡触发） | 按下定起点，拖动时端点取**位移大的轴**约束成一条直线（随鼠标实时切换轴向），松开提交 | 整条线逐格高亮 + 总价 | 松开时整段原子提交；任一格失败则整段拒绝（`economy-budget.md` §2.11） |
| Rect | Light/Dense R/C/I, Seaport, Airport | 拖出矩形 | 矩形内每格染分区色 + 总价 | 松开时 |
| Place | 其余 2×2 / 3×3 / 4×4 建筑（含 **Bus Depot 0xEC、Rail Depot 0xED 两座 2×2 车站**、Water Tower、Water Treatment 等；占地一律取 `building-catalogue.md` 的 `FOOTPRINT[id]`）、桥（Line 到水面时转对话框） | 指针格为占地的"锚格"（§3.2.4），移动时整块预览 | 占地菱形：全绿可放 / 任一格红不可放 + 原因 | 单击 |
| Query | Query | 单击 | 格高亮 | 弹窗 |
| Sign | Signs | 单击弹出文本框（≤ 23 字符） | — | 确认 |
| Center | Centering | 单击 | — | 视图动画 |
| Help | Help | 单击任意 UI 元素 / 地图物 | 元素描边 | 弹帮助气泡 |
| Dispatch | Military Dispatch | 单击 | — | 调度（灾害规格） |

附加鼠标约定 **[设计]**：右键拖 / 中键拖 = 平移；滚轮 = 以光标为锚缩放一档；右键单击 = Query；`Esc` 取消进行中的拖动；窗口边缘 24 px 悬停不自动滚动（原版 DOS 有边缘滚动，Win95 用滚动条；本项目用键盘 / 拖动代替）。

键盘表（原版 Win95 已知仅 `Ctrl+1` = Turtle **[M]**；其余为本项目绑定 **[设计]**，避开浏览器保留组合）：

| 功能 | 键 | 功能 | 键 |
|---|---|---|---|
| Pause / 恢复 | `Space` 或 `P` | Turtle / Llama / Cheetah / Swallow | `1 / 2 / 3 / 4`（也接受 `Ctrl+1..4`） |
| Zoom In / Out | `+` `=` / `-`（也 `PageUp / PageDown`） | Rotate CCW / CW | `[` / `]` |
| 平移 | 方向键（1 格；`Shift` ×8） | 居中城市中心 | `Home` |
| 地下视图 | `U` | 显示开关 Buildings / Signs / Infrastructure / Zones | `F6 / F7 / F8 / F9` |
| Bulldozer / Landscape / Emergency | `B / T / E` | Roads / Rails / Power / Water / Ports | `R / L / W / A / H` |
| Residential / Commercial / Industrial | `Z / C / I` | Education / Services / Recreation | `D / S / K` |
| Signs / Query / Rewards | `N / Q / M` | 子工具循环 | `Tab`（同按钮内下一子工具） |
| Budget / Map / Graphs / Population | `Shift+B / Shift+M / Shift+G / Shift+P` | Industries / Neighbors / Ordinances / Newspaper | `Shift+I / Shift+N / Shift+O / Shift+W` |
| 关闭顶层窗口 / 取消 | `Esc` | 保存 / 载入 | `Ctrl+S` 拦截为保存 **[需 `preventDefault`]** / `Ctrl+O` 不拦截（用菜单） |

### 2.9 原版渲染事实（供美术与渲染模块对齐）

#### 2.9.1 精灵文件与尺寸

本节以 `file-formats.md` §1.2 / §2.6 为准；此处只列渲染与美术模块要用到的结论。

| 事实 | 值 | 置信度 |
|---|---|---|
| 文件 ↔ 缩放级 | `LARGE.DAT` = 原版 **large**（本项目 **M 档**）；`SMALLMED.DAT` = 原版 **medium**（本项目 **S 档**）+ **small**（本项目 **XS 档**）；`SPECIAL.DAT` 与 `SMALLMED.DAT` 同号段，是补充 / 覆盖的中小号精灵（`file-formats.md` §2.6.5） | H（文件）/ L（SPECIAL 作用） |
| 头部 | `u16 count` + 每项 10 B（`u16 id, u32 offset, u16 height, u16 width`），**全部大端**（与 `.SC2` 主体一致，`file-formats.md` §1.2）；同一 ID 出现两次时**以后出现者为准**（`file-formats.md` §2.6.1） | H |
| 像素编码 | 行块：`count, mode`；mode 1 = 新行（count = 到下一行的字节数），2 = 精灵结束，3 = 跳过 count 个透明像素，4 = count 个调色板索引（奇数时补 1 字节 0），0 = 填充忽略 | H |
| 调色板 | `PAL_MSTR.BMP` 等为 16×16 色块位图，1024 B `BGRX`；索引高 4 bit = 行、低 4 bit = 列；`PAL_STTC.BMP` 把循环色置黑，说明索引 ≥ 170 为**颜色循环区** | H |
| 1×1 地块精灵尺寸 | large **32×17**、medium **16×9**、small **8×5**（宽 = 本项目 M / S / XS 格宽；高 = 本项目菱形高 + 1 行重叠行，§3.2.6）；N×N 建筑宽 `32N / 16N / 8N`，高度不定 | H（large：OpenSC2K 测试断言 1256 = 32×17）/ M（medium / small 按比例） |
| 每级海拔 | large **12 px**、medium 6、small 3（本项目 M / S / XS 同值；L 24、XL 48 是放大结果） | H（large）/ M（其余） |
| MIF（SCURK）观测宽度 | 8, 16, 24, 32, 48, 64, 96, 128 = 三级 × 1–4 格（128 = large 4×4；若 large 为 64 / 格则应出现 256，故 large 必为 32 / 格） | H |
| 坡面地块高度 | large 1 级坡 17 + 12 = 29 行（本项目 M 档画布 16 + 12 = 28 行 + 重叠行） | M（由 12 px / 级推得） |
| 本项目 L / XL 档 | 原版文件里**没有** 64 / 128 px 美术；Win95 最近两档是像素加倍 **[M]**。OpenSC2K 的 `64×32 / 24` 常量是其 2× 渲染值，不是文件尺寸 | M |

#### 2.9.2 精灵 ID 方案（导入路径查表用）

文件内 ID = `ZOOM_BASE[zoom] + n`，`ZOOM_BASE = { small: 0, medium: 500, large: 1000 }`（`file-formats.md` §2.6.3 / §3.7.1 **[H]**）：`LARGE.DAT` 的 ID 落在 `[1000, 1500)`，`SMALLMED.DAT / SPECIAL.DAT` 的 ID `< 1000`（small = `n`，medium = `500 + n`）。渲染器只持相对号 n（组成 `SpriteKey`），由 `file-formats` 的 `relativeId(key, layout)` 加基址换成文件 ID，**不自行加基址**。

| n | 内容 | 本文 `SpriteKey` | 置信度 |
|---|---|---|---|
| 1–255 | 与 `XBLD` 同号（n = 0 Clear 无精灵） | `xbld` | H |
| 256–269 | 地表 14 种坡面（0 平地 … 13 bedrock） | `terrain` 0..13 | H |
| 270–283 | 水面形状 0..13（270 整块、271–282 岸形、283 孤立水） | `water` 0..13 | H |
| 284 | 瀑布 | `water` 14 | H |
| 285–290 | 溪流 L–R / T–B、水湾 B / L / T / R | `water` 15..20 | H |
| 291–299 | 分区底色 9 种（轻 / 密 R C I、军事、机场、海港） | `overlay.zone*` | M |
| 300–304 | 地块着色 5 种（绿 蓝 黄 红 灰） | 工具预览 / 热力叠加 | M |
| 305–318 | 地下视图地形 14 种 | `terrain`（`variant: 'underground'`） | M |
| 319–333 / 334–348 / 349–350 / 351–353 | 地铁 15 段 / 水管 15 段 / 地铁 × 水管交叉 2 / 建筑下水管、导弹井地下、地铁入口 | `xund` | M |
| 354–358 | 轮廓 5 种 | 选中描边 | M |
| 359–378 | 飞机 / 直升机 / 货船 / 火车各 5 向 | `actor` | M |
| 379–399 | Nessie、帆船 2 向、调度图标 3、怪兽射线、断电图标（386）、爆炸 3 帧、推土机 2 向、尘云 4 帧、火 4 帧 | `actor` / `overlay` | M |
| 400–499 | 交通叠加（道路 / 高速 / 堤道 / 匝道 / 立交 × 轻 / 重，帧率 6）、通水管线、密度叠加、± 号、怪兽部件、洪水、暴民、龙卷风 | `overlay` / `actor` | M（顺序）/ L（具体号） |

291 以后的具体号由 `file-formats.md` §3.7.2 的 `IdLayout` 在导入时按"顺序累加 + 尺寸校验"自动对齐；对齐失败的段回退到程序化美术（§3.4）。

#### 2.9.3 旋转的原版做法

- 建筑（0x70–0xFF，含电厂 / 公共建筑 / Arco）：**一套精灵**，旋转后仍画同一张，只是占地位置变换 **[H]**。
- 地形 / 水面 / 电线 / 道路 / 铁路 / 高速 / 隧道 / 桥 / 地铁坡面 / 交通覆盖：每个朝向是**另一个 ID**，旋转 = 查"四向环" **[H]**。
- **翻转位 = `XBit.Flipped`（`XBIT & 0x02`）**：代码直接引用 `power-water.md` §2.1 的常量，不重抄数值；`file-formats.md` §2.2.11（`ROTATED`）、`terrain.md` §2.6.1、`building-catalogue.md` §1.2 四处一致 **[H]**。置位 = 该瓦片在**数据里**就是转了 90° 的变体。使用者：码头 0xDF、跑道 0xDD、起重机 0xE0 **[M]**、匝道 0x5D–0x60、桥件 0x51–0x5B、高架电线 0x5C、加固高速桥 0x6A / 0x6B（`building-catalogue.md` §2.3 / §2.8）**[H]**。**`0x40` 是 `Powered`，与朝向无关**。
- 水电站 0xC6 / 0xC7 **不用**翻转位：两个 ID 就是两个朝向（`building-catalogue.md` §2.5 `orient = byId`）；视图旋转时按 §3.3 做 ID 置换 `0xC6 ↔ 0xC7`。
- 翻转件的画法：同一张精灵**水平镜像**（`building-catalogue.md` §1.2 **[M]**）——2:1 等轴下 L–R 件的镜像就是 T–B 件。程序化来源可直接生成两向（§3.9.3 `genOnramp` 等）；DAT 来源镜像位图，镜像后锚点 x 不变。
- 渲染器**只读** `XBIT`，永不改写：视图旋转产生的"显示用翻转"（§3.3 `drawFlip`）只存在于渲染器；`Flipped` 位本身由建筑 / 交通模块在放置时写入。
- 校验用例（vitest 像素快照，比较地面精灵层，不含 overlay 层）：(a) 同一座码头 0xDF 在 `Powered` 置位与清零两种 `XBIT` 下渲染结果**逐像素相同**；(b) `Flipped` 0 → 1 得到水平镜像；(c) 旋转 1 次、`Flipped = 0` 的码头与旋转 0 次、`Flipped = 1` 的码头渲染相同。
- 四向环的方向必须与坐标变换配对，见 §3.3 的推导与校验用例。

#### 2.9.4 动画

| 对象 | 原版做法 | 置信度 |
|---|---|---|
| 水面 / 瀑布 | 2–3 帧精灵序列 + 调色板颜色循环 | H |
| 车流覆盖 | 多帧，约 6 fps | M |
| 部分建筑（烟囱烟、旋转雷达、风车） | 多帧，约 4 fps | M |
| 断电 | 建筑上叠加闪烁的闪电图标 | H |
| 火灾 / 洪水 / 龙卷风 / 怪兽 | `XTXT 0xFB–0xFF` 标记 + `XTHG` 角色记录，逐帧精灵 | H（数据）/ M（帧数） |
| 飞机 / 直升机 / 火车 / 船 / 帆船 | `XTHG` 角色（≤ 39 个），沿路网 / 空域移动 | H |

#### 2.9.5 绘制顺序

原版按屏幕行（`x + y` 递增）画地块，再在每格上叠加地表物；多格建筑在其**最靠近观者的一格**（锚格）处整张绘制 **[M]**。相邻高楼的遮挡偶有错误，原版亦存在，可接受。

---

## 3. 数据结构与算法建议

### 3.1 视图状态与投影

```ts
export type ZoomLevel = 0 | 1 | 2 | 3 | 4;              // XS S M L XL；必做 1..3
export type ArtScale = 'XS' | 'S' | 'M' | 'L' | 'XL';     // 与显示档同名；每个来源只原生提供其中一部分（§3.4）
export const ZOOM_TABLE = [
  { scale: 'XS', tileW: 8,   tileH: 4,  levelPx: 3,  dat: 'small'  },  // 原版 small（8×5）
  { scale: 'S',  tileW: 16,  tileH: 8,  levelPx: 6,  dat: 'medium' },  // 原版 medium（16×9）
  { scale: 'M',  tileW: 32,  tileH: 16, levelPx: 12, dat: 'large'  },  // 原版 large（32×17）= 基础格
  { scale: 'L',  tileW: 64,  tileH: 32, levelPx: 24, dat: null     },  // 无原版美术：DAT 用 M ×2
  { scale: 'XL', tileW: 128, tileH: 64, levelPx: 48, dat: null     },  // DAT 用 M ×4；procedural 用 L ×2
] as const;   // dat 列 = file-formats.md §3.7.1 的 Zoom；其 ZOOM_BASE / TILE_W / ALT_STEP 与此表逐行对应

export interface ViewState {
  zoom: ZoomLevel;
  rotation: 0 | 1 | 2 | 3;          // 逆时针次数，= MISC[0x0008]
  centerX: number; centerY: number; // 视口中心的世界地块坐标（浮点，未旋转）
  underground: boolean;
  show: { buildings: boolean; signs: boolean; infrastructure: boolean; zones: boolean };
  mapLayer: MapLayerMode | null;    // 主视图上叠加 Map 窗口同款热力层（设计项，可为 null）
}
```

**旋转坐标变换**（逆时针 1 次，与 `terrain.md` §2.5.4 一致）：地块 `(x, y) → (y, 127 − x)`；角点 `(cx, cy) → (cy, 128 − cx)`；逆变换 `(x, y) ← (127 − ry, rx)`。应用 `rotation` 次。

**世界 → 屏幕**（`S = tileW / 2`，`LEVEL = levelPx`；角点高度 `h`）：

```
(rx, ry) = rotate(x, y, rotation)            // 地块或角点坐标
sx = ox + (rx − ry) * S
sy = oy + (rx + ry) * S / 2 − h * LEVEL
```

`(ox, oy)` 使 `centerX/centerY` 落在画布中心。地块 `(x,y)` 的 4 个角按旋转后的位置重新命名（§3.3），菱形顶点 = 旋转后 `c00'`，右 = `c10'`，底 = `c11'`，左 = `c01'`。

**拾取（屏幕 → 地块）**：海拔让高处地块"前移"，因此不能只做平面逆变换。算法：

```
pick(px, py):
  for lvl = 31 downto 0:                          // 高处优先
    wy = py + lvl * LEVEL
    rx = floor(((px − ox) / S + (wy − oy) / (S/2)) / 2)
    ry = floor(((wy − oy) / (S/2) − (px − ox) / S) / 2)
    (x, y) = unrotate(rx, ry); if 越界 continue
    [h00,h10,h01,h11] = 旋转后角高
    if min(h) ≤ lvl ≤ max(h):
      // 精确命中：用 4 个屏幕顶点（含各自海拔）构成四边形做点内测试
      if insideQuad(px, py, screenQuad(x, y)): return (x, y)
  return null
```

建筑精灵高出地面的部分不参与拾取（原版点建筑上半部会选中后面的格，本项目同样只按地面拾取 **[设计]**）。

### 3.2 Art Bible：网格、尺寸与锚点

#### 3.2.1 菱形像素规则

（本节是程序化美术的规则；DAT 位图的 17 / 9 / 5 行菱形与重叠行见 §3.2.6。）

L 档地块 64×32，顶点：上 `(32,0)`、右 `(64,16)`、下 `(32,32)`、左 `(0,16)`。像素 `(px,py)` 属于地块当且仅当

```
|2px + 1 − W| + 2·|2py + 1 − H| ≤ W − 1        （W = 2H）
```

由此 L 档各行宽度为 `2, 6, 10, …, 62, 62, …, 6, 2`（32 行），M 档 `2, 6, …, 30, 30, …, 2`，S 档 `2, 6, 10, 14, 14, 10, 6, 2`。该规则保证相邻地块像素**无缝不重叠**（上下相邻行宽度之和恒等于 W）。所有多边形（坡面、盒体面）用"像素中心采样 + 上-左边规则"的扫描线光栅化，使共享边只被一侧填充。

#### 3.2.2 海拔与坡面

- 每级抬升 `LEVEL` px（L 24）。坡面地块精灵画布为 `W × (H + LEVEL)`，**锚点 = 以最低角海拔为基准的菱形底顶点**，抬高的角向上画。
- 1 级落差在 L 档为 24 px，视觉上是"陡坡"，这是原版风格的一部分，不要调平。
- 地图朝向观者的两条边（旋转后 `rx == 127` 与 `ry == 127` 的地块）画垂直岩壁到 0 级：高度 `alt × LEVEL`，用土色 ramp，每 `LEVEL/3` 画一条更暗的地层线。

#### 3.2.3 精灵画布与高度上限（本项目规范 [设计]）

| 占地 | 画布宽（L / M / S） | 地面菱形高 | 结构高度上限 | 画布总高上限（L） | 锚点（相对画布左上） |
|---|---|---|---|---|---|
| 1×1 地形 | 64 / 32 / 16 | 32 | +LEVEL（坡面） | 56 | `(32, 56)` |
| 1×1 建筑 / 树 / 路网 | 64 / 32 / 16 | 32 | 64 | 96 | `(32, 96)` |
| 2×2 | 128 / 64 / 32 | 64 | 96 | 160 | `(64, 160)` |
| 3×3 | 192 / 96 / 48 | 96 | 144 | 240 | `(96, 240)` |
| 4×4 | 256 / 128 / 64 | 128 | 192 | 320 | `(128, 320)` |
| 角色（飞机等） | 64 | — | — | 64 | `(32, 48)` + 海拔偏移 `z × LEVEL` |

锚点定义：画布中该点对齐到屏幕上"占地底顶点"（旋转后占地内 `rx+ry` 最大的地块的 `c11'`）。M / S 档所有数字按 ½ / ¼ 缩放（向下取整，最小 1 px）。本表只约束程序化美术；DAT 位图在 M 档原生宽 `32N`（`N = FOOTPRINT[id]`），高度不受上限约束，锚点按 §3.2.6。

#### 3.2.4 多格建筑的锚格与放置指针

- 存储：`XZON` 角标（`zones-growth-demand.md` §2.1）。渲染锚格 = 旋转后占地内 `rx + ry` 最大者（即屏幕最下方的格）。
- 放置预览时指针格 = 占地中心：N 为奇数取正中；N 为偶数取 `(x0 + N/2 − 1, y0 + N/2 − 1)`（中心四格中靠 `−x,−y` 的那格）**[设计]**。指针在地图边缘时占地整体内缩（clamp）而非拒绝。

#### 3.2.5 绘制顺序（PixiJS）

- 地图分成 8×8 = 64 个 **16×16 地块的块（chunk）**。每块一个 `Container`，内部按 `rx + ry` 递增、再按 `rx` 递增排序子精灵；块之间按块的 `(cx + cy)` 排序。
- 静态内容（地形、水面静帧、路网、建筑）进块容器并 `cacheAsTexture`（Pixi v8 `container.cacheAsTexture(true)`），地块变更时只重建所在块（边界精灵跨块时重建两块）。
- 动态内容（水面动画帧、车流、角色、火焰、断电图标、工具预览）放独立 `dynamicLayer`，自行按 `rx + ry` 排序，每帧只重排变动者。
- 多格建筑挂在锚格所属块；若其画布向上越过块的上边界也没关系（块纹理按内容包围盒扩展）。
- 地下视图是另一套块容器（`undergroundLayer`），切换时整体显隐，不重建。

#### 3.2.6 DAT 位图与本项目网格的对齐（导入路径）

原版位图的菱形比本项目同档菱形**高 1 行**：large 1×1 平地 32×17 对本项目 M 档 32×16，medium 16×9 对 S 档 16×8，small 8×5 对 XS 档 8×4（§2.9.1）。多出的一行是向下的**重叠行**：它落在屏幕下一格 `(rx+1, ry+1)` 的顶行位置，被后画（更靠近观者）的那格覆盖，与原版绘制顺序一致；其他边上若也有 1 px 重叠，同样由后画者覆盖。

| 规则 | 值 |
|---|---|
| DAT 位图锚点 | `anchorX = w / 2`，`anchorY = h − 1`（锚点是像素行边界：第 `h−2` 行是菱形底顶点行，第 `h−1` 行悬在锚点之下作为重叠行）**[M：§5 Q4 实机验证]** |
| 坡面 / 建筑 | 同一规则：坡面 large 为 `32 × (17 + 12k)`，建筑 `32N × 任意高`，底部都是地面菱形 + 重叠行 |
| 整数倍放大 ×k 后 | `anchor = (w·k / 2, (h − 1)·k)`，重叠行变为 k 行 |
| 可调常量 | `DAT_OVERLAP_ROW: 'bottom' \| 'top'`（默认 `'bottom'`）；若实机验证发现重叠行在顶行，改为 `'top'`，锚点变为 `(w/2, h)`，其余不动 |
| 导入诊断 | 用 1256（large 平地）检查：第 0 行与第 `h−1` 行都是居中 2 px 的顶点行、`h == 17`、`w == 32`；不满足记 `DAT_ALIGN_SUSPECT`，仍按默认锚点显示 |

与 §3.2.1 的关系：§3.2.1 的"无缝不重叠"只约束程序化美术；DAT 位图允许这 1 行重叠。两种来源在同一屏混排（回退）时，因锚点都对齐到"占地底顶点所在的行边界"，不会出现半格错位。

### 3.3 旋转置换表（渲染器唯一真源）

**方向映射**（视图逆时针转 1 次，各方向在屏幕上逆时针移动一格）：`T→L, L→B, B→R, R→T`。由此得到：

| 对象 | 逆时针 1 次的置换 |
|---|---|
| 坡面 nibble | `1→4→3→2→1`，`5→8→7→6→5`，`9→12→11→10→9`，`0, 13` 不变 |
| 溪流 / 水湾 | `0x40↔0x41`；`0x42(B)→0x45(R)→0x44(T)→0x43(L)→0x42` |
| 电线 / 道路 / 铁路（基址 0x0E / 0x1D / 0x2C，偏移同） | 直线 `+0↔+1`；坡 `+2→+5→+4→+3→+2`；弯 `+6→+9→+8→+7→+6`；三岔 `+10→+13→+12→+11→+10`；十字 `+14` 不变 |
| 铁路附加坡 0x3B–0x3E | `0x3B→0x3E→0x3D→0x3C→0x3B` |
| 隧道口 0x3F–0x42 | `0x3F(T)→0x42(L)→0x41(B)→0x40(R)→0x3F` |
| 交叉件 | `0x43↔0x44`，`0x45↔0x46`，`0x47↔0x48`，`0x4B↔0x4C`，`0x4D↔0x4E`，`0x4F↔0x50` |
| 高速 | `0x49↔0x4A`；坡 `0x61→0x64→0x63→0x62→0x61`；弯 `0x65→0x68→0x67→0x66→0x65`；`0x69` 不变 |
| 地铁↔铁路 0x6C–0x6F | `0x6C(T)→0x6F(L)→0x6E(B)→0x6D(R)→0x6C` |
| 匝道 0x5D–0x60 + `XBit.Flipped` | 用"朝向元组"法：`ORIENT[id] = {hwy: T|B, road: L|R}`，`xbit & XBit.Flipped` 置 1 表示整体再转 90°；渲染时把元组按方向映射后在 8 种组合里反查 `(id, flip)`，结果只用于选精灵 / 镜像，**不写回 `XBIT`** |
| 桥件 0x51–0x5B、高架电线 0x5C、加固桥 0x6A/0x6B、码头 0xDF、跑道 0xDD、起重机 0xE0 [M] | 显示翻转 `drawFlip = ((xbit & XBit.Flipped) != 0) XOR (rotation & 1)`：每转 1 次取反（LR↔TB）。`XBit.Flipped = 0x02`（`power-water.md` §2.1），与 `Powered 0x40` 无关 |
| 水电站 0xC6 ↔ 0xC7 | byId（无翻转位）：旋转 1 次互换，与溪流 `0x40↔0x41` 同类 |
| 建筑 0x70–0xFF 其余 | 不变 |
| `XUND` 地铁 / 管线 | 与电线同偏移置换；`0x1F↔0x20` |

> 注意：`terrain.md` §2.5.4 的 `SLOPE_ROT_CCW = [0,4,1,2,3,8,5,6,7,12,9,10,11,13]` 与上表同源（都由坐标变换 `(x,y)→(y,127−x)` 推出），渲染器直接 import 该常量而不重抄；若改坐标变换方向，**两处必须同时改**。校验用例（vitest + 像素快照）：在 `(10,10)` 放 `XTER=0x01`（T 边高）、`(12,10)` 放道路 `0x1F`（HT-B），旋转 0 时两者抬高边都在屏幕右上侧；旋转 1 次后都在左上侧；旋转 2 次后在左下侧。

旋转后的角点重命名：原 `c10 → c00'`，`c11 → c10'`，`c01 → c11'`，`c00 → c01'`。

### 3.4 精灵提供者接口

```ts
/** 8 bit 索引色位图；0 = 透明。两种美术来源的共同产物。 */
export interface IndexedBitmap { w: number; h: number; data: Uint8Array; anchorX: number; anchorY: number;
  /** 位图里是否出现颜色循环索引（决定它要不要进"每帧重建"的队列） */ cycling: boolean }

export type SpriteKind = 'xbld' | 'terrain' | 'water' | 'xund' | 'overlay' | 'actor' | 'ui';
export interface SpriteKey { kind: SpriteKind; id: number; variant?: number; frame?: number }
/** id 语义：xbld = XBLD 号；terrain = 坡面码 0..13（含 'edgeWall' variant）；water = 0..20（§2.9.2 的 270+n）；
 *  xund = XUND 号；overlay/actor/ui = 本文 §3.9 的枚举 */

export interface SpriteSheetEntry { texture: Texture; anchorX: number; anchorY: number; w: number; h: number; frames: number; fps: number }

export interface SpriteProvider {
  readonly name: 'procedural' | 'dat';
  readonly palette: Palette;                                   // 256 × RGBA + 循环组定义
  readonly nativeScales: ReadonlySet<ArtScale>;                // procedural = {S, M, L}；dat = {XS, S, M}（§2.9.1）
  has(key: SpriteKey, scale: ArtScale): boolean;               // 只回答原生档
  bitmap(key: SpriteKey, scale: ArtScale): IndexedBitmap | null; // 同步；只产出原生档，其余返回 null
  frameCount(key: SpriteKey): number;                          // ≥ 1
  fps(key: SpriteKey): number;                                 // 0 = 静态
}

/** 渲染器持有：provider → 整数倍派生 → 图集 → Texture 缓存；DAT 缺失项自动回退到 procedural。 */
export interface SpriteAtlas {
  get(key: SpriteKey, scale: ArtScale): SpriteSheetEntry;      // 见下方 resolve 伪代码；最终仍未命中 → 洋红占位块
  onPaletteCycle(tick: number): void;                          // 重建含循环索引的纹理（见 §3.10）
}

export interface Palette {
  rgba: Uint8ClampedArray;         // 256 × 4
  cycles: Array<{ start: number; length: number; periodMs: number }>; // 循环组（环移）
}
```

回退顺序：**`DAT（原生 XS / S / M）→ DAT 整数倍放大（L = M ×2，XL = M ×4）→ procedural（原生 S / M / L；XS = S ÷2 取样，XL = L ×2）→ 洋红占位`**。

```
resolve(key, z):
  for provider in [dat (若已导入), procedural]:
    if provider.has(key, z): return provider.bitmap(key, z)
    src = provider.nativeScales 中 tileW ≤ tileW[z] 的最大者            // 优先放大
    if src: return nearestUpscale(provider.bitmap(key, src), k = tileW[z] / tileW[src])
    src = provider.nativeScales 中 tileW ≥ tileW[z] 的最小者            // 其次缩小（只会发生在 procedural 的 XS ← S）
    if src: return sampleDownscale(provider.bitmap(key, src), k = tileW[src] / tileW[z])
  return placeholder(z)
```

- `nearestUpscale`：每个索引像素复制成 k×k 块，`anchor ×= k`，`cycling` 不变；`sampleDownscale`：取每个 k×k 块左上角像素，`anchor = floor(anchor / k)`。两者都不插值（索引色）。
- DAT 已导入时，回退到 procedural 的精灵也先取 **M 档再 ×2 / ×4**（而不是 procedural 原生 L），使同一屏像素密度一致 **[设计]**；`atlas.options.mixedDensity = true` 可关闭。
- 这就是"Win95 最近两档共用美术"在本项目的实现：L / XL 从不要求任何来源提供 64 / 128 px 原生位图。

### 3.5 原创调色板（[设计]，不含原版数值）

结构：256 项 = 16 个"色带"（ramp）× 8 阶明度 + 保留区。生成函数而非数据文件：

```
rampColor(h, s, i) = hslToRgb(h, s, L_i)，L_i = [0.12, 0.22, 0.32, 0.42, 0.52, 0.63, 0.75, 0.88][i]
index(ramp, i) = 16 + ramp * 8 + i      // ramp 0..15, i 0..7（0 最暗，7 最亮）
```

| ramp | 名称 | 色相 h | 饱和 s | 用途 |
|---|---|---|---|---|
| 0 | Neutral | 0 | 0.00 | 混凝土、窗框、UI 中性 |
| 1 | WarmGray | 30 | 0.06 | 办公楼外墙、停车场 |
| 2 | Asphalt | 210 | 0.04 | 道路、高速路面、跑道 |
| 3 | Earth | 28 | 0.45 | 地形岩壁、地下视图地面、瓦砾 |
| 4 | Sand | 42 | 0.40 | 海岸、路肩、工业空地 |
| 5 | Grass | 95 | 0.38 | 平地地表（按海拔用 i=3..5） |
| 6 | Forest | 130 | 0.42 | 树冠、大公园 |
| 7 | Water | 205 | 0.55 | 水面（深 i=1..3，浅 i=4..5，高光 i=6..7） |
| 8 | Glass | 195 | 0.30 | 玻璃幕墙、太阳能板 |
| 9 | Brick | 12 | 0.50 | 住宅砖墙、消防局 |
| 10 | Rust | 22 | 0.62 | 工厂、铁路轨枕、桥梁钢架 |
| 11 | Amber | 45 | 0.85 | 亮窗、路灯、警示 |
| 12 | Signal | 2 | 0.80 | 红色警示、火焰、拒绝高亮 |
| 13 | Teal | 170 | 0.45 | 工业管道、净水厂 |
| 14 | Violet | 275 | 0.40 | 商业霓虹、Arco 装饰 |
| 15 | Olive | 70 | 0.35 | 军事、机场建筑 |

保留区：

| 索引 | 用途 |
|---|---|
| 0 | 透明 |
| 1–7 | 纯色：黑、白、UI 高光、UI 阴影、分区 R 绿 `(60,170,70)`、C 蓝 `(70,110,210)`、I 黄 `(210,180,60)` |
| 8–15 | 热力图 8 阶（Map 窗口 16 阶由 8 阶 × 两档亮度得到） |
| 144–159 | 火焰 / 爆炸 8 阶橙红 + 烟 8 阶灰（含 alpha 通过抖动实现，不用半透明） |
| 160–175 | **循环组 A：水面高光 16 项**（Water ramp i=4..7 交错，周期 1,200 ms，环移） |
| 176–183 | **循环组 B：夜景 / 信号灯 8 项**（Amber ↔ Signal，周期 800 ms） |
| 184–191 | **循环组 C：瀑布 / 溪流 8 项**（周期 600 ms） |
| 192–255 | 留空（DAT 导入时不使用我方调色板，故无冲突） |

风格基调：低饱和、略偏暖的绿褐地表，冷灰路面，建筑三面着色对比明显，轮廓用 ramp 的 i=0 而非纯黑；避免纯黑描边（纯黑只用于文字与阴影抖动）。

### 3.6 绘制原语与着色规则

所有生成器只依赖下列原语（`art-procedural/raster.ts`），输入输出均为 `IndexedBitmap`，坐标为画布像素，`scale` 决定 `W/H/LEVEL` 与线宽 `lw = max(1, round(W/64))`：

```ts
fillPoly(bmp, pts: [x,y][], idx: number)                     // 像素中心采样 + 上-左规则
strokePoly(bmp, pts, idx, lw)                                 // Bresenham，闭合
fillDiamond(bmp, cx, cy, W, H, idx)                           // §3.2.1 的整数规则
ditherFill(bmp, pts, idxA, idxB, pattern: 'checker'|'rows')   // 50% 抖动，用于烟/玻璃/水深过渡
isoLine(bmp, p0, p1, idx, lw)                                  // 走 2:1 步长的像素线（路边、窗列）
blit(dst, src, dx, dy)                                         // 索引 0 透明
hashNoise(seed, x, y) → 0..1                                   // 确定性，禁止 Math.random
```

#### 3.6.1 三面盒体 `isoBox`

占地 N×N（或 a×b）、高 `hPx`、顶面 ramp `R`、起始阶 `i0`（默认 4）：

| 面 | 顶点（以地面菱形 上/右/下/左 = U/Rt/D/Lf，`−h` 表示上移 hPx） | 阶 |
|---|---|---|
| 顶面 | `U−h, Rt−h, D−h, Lf−h` | `i0 + 2`（最亮） |
| 左面（世界 +y 侧，朝屏幕左下） | `Lf, D, D−h, Lf−h` | `i0` |
| 右面（世界 +x 侧，朝屏幕右下） | `D, Rt, Rt−h, D−h` | `i0 − 2`（最暗） |
| 轮廓 | 顶面上两条边 + 两侧外缘 | `i0 − 3`（≥ 0） |

光源约定：来自屏幕左上。所有面向 −x（屏幕左上）与 −y（屏幕右上）的面被看作背面，不画。

#### 3.6.2 坡面着色表（地形与路面共用）

地形平地色 = `Grass[i]`，`i = 3 + floor(alt / 11)`（0–10 级 i=3，11–21 级 i=4，22–31 级 i=5）。坡面按三角形法线所朝的**屏幕方向**取倍率，再四舍五入到最近的阶：

| 三角形朝向（旋转后） | 倍率 | 对应阶偏移 |
|---|---|---|
| 平 | 1.00 | 0 |
| 朝 −x（屏幕左上） | 1.12 | +1 |
| 朝 −y（屏幕右上） | 1.06 | +1（S 档为 0） |
| 朝 +y（屏幕左下） | 0.92 | −1 |
| 朝 +x（屏幕右下） | 0.78 | −2 |
| 朝 (−x,−y) 对角 | 1.09 | +1 |
| 朝 (−x,+y) 对角 | 1.02 | 0 |
| 朝 (+x,−y) 对角 | 0.92 | −1 |
| 朝 (+x,+y) 对角 | 0.85 | −2 |

三角剖分规则（nibble 已旋转）：

- 1–4（边坡）：沿任一对角线剖分，两三角同法线。
- 5–8（三角高）：沿连接两个"等高且抬高"角的对角线剖分；含低角的三角形为坡（朝向 = 低角所在的对角方向），另一三角形平（在 `alt+1`）。
- 9–12（单角高）：沿连接两个未抬高角的对角线剖分；含高角的三角形为坡（朝向 = 高角的**反**方向），另一三角形平（在 `alt`）。
- 13（bedrock）：顶面平（`alt+1`）+ 两侧垂直岩壁 `Earth[2]/Earth[1]` 各 `LEVEL` 高。

地块边线：原版地块间无描边；本项目在坡面与平地交界处画 1 px `Grass[i−1]`，纯平地区域不画，避免网格感。

#### 3.6.3 窗格、屋顶、附属物

| 元素 | 规则（L 档像素；M/S 按比例，小于 1 px 的元素省略） |
|---|---|
| 窗格 | 沿面的 2:1 方向排列，单元 4×3 px（宽×高，含 1 px 框），行距 5 px，列距 6 px；亮窗 `Amber[6]`、暗窗 `Glass[2]`，亮窗比例 `p = 0.35 + 0.3·hashNoise(seed, col, row)` 四舍五入；首行距面顶 4 px，末行距地 3 px |
| 平屋顶 | 顶面内缩 2 px 的 `WarmGray[i0+1]` 女儿墙 + 1–3 个 6×4×3 px 的设备箱（HVAC）随机放在顶面网格点 |
| 坡屋顶（住宅） | 沿占地长轴起脊：脊线高出檐口 `0.35 × W/2`，两坡面分别 `Brick[i0+1]`（朝左上）/ `Brick[i0−1]`（朝右下） |
| 穹顶 | 半椭圆（宽 = 顶面宽 0.6，高 = 宽 0.45），四阶横向带状着色 |
| 烟囱 | 2×2 格以上工业建筑 1–3 根：圆柱宽 6 px，高 `0.5 × hPx`，顶端 `Signal[4]` 一环；烟为 3 帧（§3.10） |
| 天线 / 尖塔 | 1 px 竖线 + 顶端 `Signal[6]` 1 px 点（信号灯循环组 B） |
| 招牌 | 商业 1×1/2×2：面上一块 10×4 px `Violet[5]` 或 `Amber[5]` 色块 |
| 车位 / 地面 | 停车场：`Asphalt[3]` 地面 + `Neutral[7]` 1 px 车位线每 6 px |
| 植被 | 住宅 / 公园：1–3 棵 `tree(size=1)` 落在占地空余角 |
| 阴影 | 不画投影（原版无）；只靠面着色 |

### 3.7 地形、水面、路网、树木配方

#### 3.7.1 地形 `genTerrain(nibble 0..13, alt, scale, variant)`

1. 按 §3.6.2 剖分并填色；`variant` 0–3 控制 2–4 个 `Grass[i±1]` 的 1 px 噪点位置（`hashNoise`），让大片平地不"塑料"。
2. 坡面上沿坡向加 2–3 条间距 6 px 的 1 px 暗线（`Grass[i−1]`），表示等高纹理。
3. 边缘岩壁 `genEdgeWall(alt, side: 'L'|'R', scale)`：竖直四边形，`Earth[2]`（左侧）/`Earth[1]`（右侧），每 8 px 一条 `Earth[0]` 地层线，最底一行 `Earth[0]`。
4. 地下视图版本 `genTerrainUnderground(nibble)`：同几何，用 `Earth[3]/Earth[2]`，坡面着色表倍率减半。

#### 3.7.2 水面 `genWater(shape 0..20, depth, frame 0..2, scale)`

- 形状 0（整块）：`Water[1 + min(depth,2)]` 填菱形；`depth==0`（池塘 / 溪流）用 `Water[4]`。
- 形状 1–12（岸形）：地块按 §2.5.3 的"陆地角"划分：陆地角对应的三角形 / 梯形用地形色（取 `genTerrain(0)` 的平地色），其余用水色；交界线 1 px `Sand[5]`。
- 形状 13（孤立水）：内缩 3 px 的菱形水面 + `Sand[5]` 环。
- 14（瀑布）：竖直面 `Water[5]` 底色，叠加 4 条 2 px 宽的竖向 `cycleC` 索引条纹，帧间下移 2 px。
- 15–20（溪流 / 水湾）：地块中线（连接对边中点）一条宽 `W/4` 的 `Water[4]` 带，两侧 1 px `Sand[5]`；水湾只画到地块中心并以半圆收口。
- 高光：每帧用 `hashNoise(frame, x, y) > 0.93` 的像素写循环组 A 索引 `160 + ((x + 2·frame) & 15)`，3 帧循环；S 档省略高光。

#### 3.7.3 道路 / 铁路 / 电线 / 管线 `genNetwork(kind, mask TLBR, slopeDir, scale)`

通用：`mask` 4 bit 表示哪些边有连接；只生成 15 种拓扑（0 不用，1–15），旋转由 §3.3 置换解决。路面绘制在"地面多边形"上：若 `slopeDir ≠ none`，先把菱形对应边的两个顶点上移 `LEVEL`，所有带子随之投影（用顶点线性插值，不另做透视）。

| kind | 带宽（L） | 底色 | 细节 |
|---|---|---|---|
| road | 40 px（= W·0.625） | `Asphalt[3]` | 两侧 2 px `Neutral[6]` 路缘；带子从地块中心伸向每个有连接的边中点；无连接的一端用方头封口；三岔 / 十字在中心填满；弯道用两段带子相交（不做圆角） |
| highway | 整格 2×2 段共用，单格 60 px | `Asphalt[4]` | 高架：先画 `WarmGray[3]` 桥面厚度 6 px + 两根 4 px 桥墩到地面；中央 2 px `Amber[6]` 虚线（间隔 6 px）；两侧 2 px `Neutral[5]` 护栏 |
| rail | 轨距 12 px | — | 每 6 px 一根 `Rust[2]` 枕木（长 18 px，宽 2 px），两条 1 px `Neutral[6]` 钢轨；弯道枕木沿弧均匀放射 |
| power | — | — | 地块中心一根 `Rust[1]` 立杆（宽 2 px、高 22 px）+ 横担 8 px；从杆顶到每个连接边中点画 1 px `Neutral[1]` 导线，中点下垂 2 px（二次贝塞尔取样）|
| pipe（地下） | 10 px | `Teal[3]` | 两侧 1 px `Teal[1]`；有水变体中心 2 px `Water[6]`；管接头：连接数 ≥ 3 时中心画 14 px 方块 |
| subway（地下） | 轨距 12 px | `Earth[1]` 隧道槽 20 px | 其上同 rail 的轨枕 / 钢轨，颜色降 2 阶 |
| crossover | — | — | 先画低优先者再画高优先者：power < rail < road < highway |

隧道口 `genTunnelPortal(dir)`：地块朝 `dir` 边的半边画 `Earth[2]` 山体 + 拱门（`Asphalt[1]` 半椭圆 24×20 px）+ 路面接入。桥件：`genBridge(kind: 'causeway'|'raising'|'suspension'|'rail'|'highway'|'reinforced', part, scale)`：桥面 = road/rail 带子抬高 `LEVEL`，桥墩 `WarmGray[2]` 4 px 到水面；吊桥塔 48 px 高 `Rust[3]`，主缆 1 px 抛物线；开启桥"raised"件桥面竖起 60°。

#### 3.7.4 树木 `genTrees(density 1..7, variant 0..3, scale)`

- 树 = 树干（`Earth[1]`，2×4 px）+ 树冠（2 层椭圆：下层 `Forest[2]` 12×8，上层 `Forest[4]` 10×7，上层左上偏移 1 px，高光 2 px `Forest[6]`）。
- 树的数量 `n = density + floor(density/3)`（1,2,3,5,6,7,9 棵），位置由 `hashNoise(variant, k)` 在菱形内缩 4 px 的区域取样，按 `y` 排序后依次 blit（后者遮前者）。
- 坡面上的树：整张树精灵 blit 时按树根落点的插值高度上移。

#### 3.7.5 分区地面、瓦砾、放射性、小公园

| 对象 | 配方 |
|---|---|
| 空分区格（显示 Zones 时） | 地形之上叠加分区色（索引 5/6/7）的菱形描边 2 px + 内部 `rows` 抖动 25%；密区描边 3 px |
| 瓦砾 0x01–0x04 | `Earth[3]` 地面 + 6–10 块 `WarmGray[2..4]` 2×2 / 3×2 碎块，4 个变体 |
| 放射性 0x05 | `Olive[3]` 地面 + 中心 8 px 三叶标志 `Amber[6]/Neutral[0]` |
| 小公园 0x0D | `Grass[5]` + 十字 `Sand[6]` 小径 2 px + 2 棵 `tree(size=1)` + 1 条 `Rust[2]` 长椅 4×2 |
| 施工 0x88/0x89、0xA6–0xA9、0xC2/0xC3 | `Earth[4]` 地面 + 占地 60% 的 `Rust[3]` 钢架线框盒（高 = 目标高度 × 0.5）+ `Amber[6]` 吊车臂 |
| 废弃 0x8A/0x8B、0xAA–0xAD、0xC4/0xC5 | 对应档次住宅 / 商业盒体 ramp 换成 `WarmGray`，窗全部 `Neutral[1]`，顶面随机 3 处 `Earth[2]` 破损块 |

### 3.8 建筑配方表（`XBLD` 0x70–0xFF 全覆盖）

每行一个生成配方：`isoBox` 参数 + 附属物。`高` 为 L 档结构高度（px），`ramp` 为主体色带，`i0` 为起始阶。`占地` 一律等于 `building-catalogue.md` 的 `FOOTPRINT[id]`（唯一来源；本表只是抄录，vitest 用 `FOOTPRINT` 校验本表），画布宽高按 §3.2.3。同一行内的多个 ID 用 `seed = id` 产生变体（窗格亮灭、附属物位置、高度 ±10%）。所有建筑画在平地；占地 ≥ 2×2 的建筑在地面层先铺 `Asphalt[4]`（商业 / 工业 / 公共）或 `Grass[5]`（住宅 / 公园）的占地菱形。

| ID | 名称 | 占地 | 高 | ramp / i0 | 屋顶 | 附属物 |
|---|---|---|---|---|---|---|
| 0x70–0x73 | Lower-class Homes 1–4 | 1×1 | 14 | Brick / 3 | 坡顶 | 单窗 1 列，门 `Earth[1]` 3×5，无植被 |
| 0x74–0x77 | Middle-class Homes 1–4 | 1×1 | 18 | Brick / 4 或 WarmGray / 4（偶数 ID） | 坡顶 + 烟囱 2×6 | 2 列窗，车库门 `Neutral[5]` 8×6，1 棵树 |
| 0x78–0x7B | Luxury Homes 1–4 | 1×1 | 22 | Neutral / 5 | 坡顶（L 形：主体 + 侧翼 60% 高） | 3 列窗，`Water[5]` 泳池 8×4，2 棵树，`Sand[6]` 车道 |
| 0x7C, 0x7F | Gas Station 1–2 | 1×1 | 10（雨棚 14） | WarmGray / 4 | 平 | 雨棚：4 根 1 px 柱 + 悬空 `Signal[5]` 薄顶；2 个 `Amber[6]` 油泵 2×4 |
| 0x7D | Bed & Breakfast | 1×1 | 20 | Brick / 4 | 坡顶 + 门廊 | 2 列窗，招牌，1 棵树 |
| 0x7E | Convenience Store | 1×1 | 12 | WarmGray / 5 | 平 | 全宽玻璃面 `Glass[4]`，招牌 `Violet[5]` |
| 0x80 | Small Office 1 | 1×1 | 28 | Glass / 3 | 平 + HVAC | 4 行 × 3 列窗 |
| 0x81 | Small Office 2 | 1×1 | 34 | WarmGray / 4 | 平 + 天线 | 5 行 × 3 列窗 |
| 0x82 | Warehouse（商） | 1×1 | 16 | Sand / 4 | 平（拱形：3 阶横带） | 卷帘门 `Neutral[4]` 10×8 |
| 0x83 | Toy Store | 1×1 | 16 | Violet / 4 | 平 | 大招牌 `Amber[6]` 14×5，橱窗 `Glass[5]` |
| 0x84, 0x86 | Small Warehouse 1 | 1×1 | 16 | Rust / 3 | 拱形 | 卷帘门，侧面 `Teal[3]` 管 1 px |
| 0x85 | Chemical Storage | 1×1 | 18 | Teal / 4 | 平 | 2 个圆柱罐（直径 14、高 16）替代盒体，顶部 `Neutral[6]` 环 |
| 0x87 | Industrial Substation | 1×1 | 10 | Neutral / 3 | 无 | 围栏 1 px `Neutral[5]` + 2 个变压器盒 6×6×8 + 顶部 `Neutral[1]` 导线 |
| 0x8C–0x8E | Small Apartments 1–3 | 2×2 | 40 | Brick / 3 | 平 + 女儿墙 | 4 行 × 6 列窗，阳台 1 px 横线每行 |
| 0x8F, 0x90 | Medium Apartments 1–2 | 2×2 | 56 | WarmGray / 4 | 平 + HVAC ×2 | 6 行窗，底层门廊 `Neutral[6]` |
| 0x91–0x93 | Medium Condominiums 1–3 | 2×2 | 64 | Neutral / 5 | 平 + 屋顶花园（`Forest[4]` 色块） | 7 行窗，阳台玻璃 `Glass[5]`，1 棵树 |
| 0x94 | Shopping Center | 2×2 | 20 | WarmGray / 5 | 平 | 一半占地为停车场，正面连续橱窗，3 块招牌 |
| 0x95 | Grocery Store | 2×2 | 18 | Sand / 5 | 平 | 停车场 40%，大招牌 `Signal[5]` |
| 0x96, 0x98 | Medium Office 1–2 | 2×2 | 72 | Glass / 3 | 平 + 天线 | 8 行 × 6 列窗 |
| 0x97 | Resort Hotel | 2×2 | 60 | Neutral / 6 | 平 | 泳池 16×8 `Water[5]`，3 棵树，正面 `Amber[5]` 遮阳带 |
| 0x99 | Office/Retail | 2×2 | 48 | WarmGray / 4 | 平 | 底 2 层橱窗 `Glass[5]`，上部 5 行窗 |
| 0x9A–0x9D | Medium Office 3–6 | 2×2 | 80–96（按 ID 递增 +5） | Glass / 2（9A,9C）/ Neutral / 4（9B,9D） | 平 + HVAC + 天线 | 9–11 行窗；9D 顶部 `Violet[4]` 冠带 |
| 0x9E | Medium Warehouse | 2×2 | 22 | Sand / 4 | 拱形 ×2（双跨） | 3 个卷帘门 |
| 0x9F | Chemical Processing 2 | 2×2 | 30 | Teal / 3 | 平 | 2 罐 + 1 烟囱 + `Teal[4]` 管架 1 px 连接 |
| 0xA0–0xA5 | Small Factory 1–6 | 2×2 | 26 | Rust / 3（偶）/ WarmGray / 3（奇） | 锯齿顶（4 段三角，朝左上面 `Glass[5]`） | 1–2 烟囱（3 帧烟） |
| 0xAE, 0xAF | Large Apartments 1–2 | 3×3 | 96 | Brick / 3 | 平 | 10 行 × 9 列窗，底层 `Neutral[5]` 基座 |
| 0xB0, 0xB1 | Large Condominiums 1–2 | 3×3 | 120 | Neutral / 5 | 平 + 屋顶花园 | 12 行窗，阳台玻璃，塔身中段 `Glass[4]` 竖带 |
| 0xB2 | Office Park | 3×3 | 30 | Glass / 4 | 平 ×3 | 三个 1×1 低层盒体呈 L 形 + 中庭树 3 棵 + 停车场 |
| 0xB3 | Office Tower 1 | 3×3 | 140 | Glass / 3 | 平 + 天线 | 14 行 × 9 列窗，顶部 2 层缩进 |
| 0xB4 | Mini Mall | 3×3 | 20 | WarmGray / 5 | 平 | 占地 50% 停车场，U 形店面，4 块招牌 |
| 0xB5 | Theater | 3×3 | 36 | Violet / 3 | 平 | 正面大招牌 `Amber[6]` 24×8（循环组 B 边框），无窗 |
| 0xB6 | Drive-in | 3×3 | 8（银幕 40） | Asphalt / 3 | 无 | 停车场地面 + 一面 `Neutral[7]` 竖直银幕 40×30 在 −x 侧 |
| 0xB7 | Office Tower 2 | 3×3 | 144 | Neutral / 4 | 阶梯式（三段，每段缩进 8 px） | 15 行窗 |
| 0xB8 | Office Tower 3 | 3×3 | 136 | Glass / 2 | 穹顶 | 14 行窗，`Violet[5]` 冠带 |
| 0xB9 | Parking Lot | 3×3 | 0 | Asphalt / 3 | 无 | 车位线 + 6 辆 4×2 px 杂色小车 |
| 0xBA | Historic Office | 3×3 | 60 | Sand / 5 | 坡顶（四坡）+ 钟塔 10×10×24 | 拱窗（窗顶加 1 px 半圆） |
| 0xBB | Corporate HQ | 3×3 | 150 | Glass / 4 | 平 + 直升机坪（`Neutral[6]` 圆 + H） | 15 行窗，底部 2 层 `Neutral[6]` 裙楼 |
| 0xBC | Chemical Processing 1 | 3×3 | 36 | Teal / 3 | 平 | 4 罐 + 2 烟囱 + 管架 |
| 0xBD | Large Factory | 3×3 | 40 | Rust / 3 | 锯齿顶 6 段 | 3 烟囱，侧面装卸门 ×2 |
| 0xBE | Industrial Thingamajig | 3×3 | 48 | Neutral / 3 | 无 | 球形罐（直径 30）+ 高塔 10×10×48 + 管道网 1 px `Teal[4]` |
| 0xBF | Medium Factory | 3×3 | 32 | WarmGray / 3 | 锯齿顶 4 段 | 2 烟囱 |
| 0xC0, 0xC1 | Large Warehouse 1–2 | 3×3 | 28 | Sand / 4 | 拱形 ×3 | 6 个卷帘门，装卸平台 `Asphalt[4]` |
| 0xC6, 0xC7 | Hydro 1–2 | 1×1 | 20 | WarmGray / 4 | 平 | 画在瀑布格：坝体横跨水流方向（C6 沿 L-R，C7 沿 T-B），下游 2 个 `Water[7]` 泄水口 |
| 0xC8 | Wind | 1×1 | 36 | Neutral / 6 | 无 | 塔杆 2 px + 3 叶片（4 帧旋转，每帧 90°/3） |
| 0xC9 | Gas | 4×4 | 36 | WarmGray / 4 | 平 | 1 个球罐 + 2 根 `Teal[4]` 烟囱（不冒烟）+ 配电场围栏 |
| 0xCA | Oil | 4×4 | 44 | Rust / 3 | 平 | 3 个圆柱油罐（直径 36）+ 2 烟囱（3 帧黑烟 `Neutral[1..2]`） |
| 0xCB | Nuclear | 4×4 | 48 | Neutral / 5 | 穹顶 ×1（反应堆，直径 60） | 2 个冷却塔（上细下粗梯形 40→28 宽，高 70，白汽 3 帧） |
| 0xCC | Solar | 4×4 | 6 | Glass / 4 | 无 | 6 行 × 4 列倾斜面板（每块 20×8 平行四边形，朝 −y 面 `Glass[6]`）+ 角落 1×1 机房 |
| 0xCD | Microwave | 4×4 | 40 | Neutral / 4 | 无 | 中央接收碟（椭圆 60×24 `Glass[5]`，向上倾斜）+ 四角立柱 + 机房 |
| 0xCE | Fusion | 4×4 | 56 | Violet / 3 | 穹顶 | 环形主体（外径 90、内径 50 的圆环盒）+ 顶部 `cycleB` 发光环 |
| 0xCF | Coal | 4×4 | 40 | WarmGray / 2 | 平 | 4 烟囱（高 70，3 帧灰烟）+ 煤堆 `Neutral[1]` 半椭圆 + 输送带斜线 |
| 0xD0 | City Hall | 3×3 | 48 | Neutral / 6 | 穹顶 + 正面 6 根柱（2 px `Neutral[7]`） | 台阶 3 级 `Neutral[5]`，2 棵树 |
| 0xD1 | Hospital | 3×3 | 56 | Neutral / 6 | 平 + 直升机坪 | 正面 `Signal[5]` 十字 8×8，救护车位 |
| 0xD2 | Police Station | 3×3 | 36 | Glass / 3（上层）/ WarmGray / 4（基座） | 平 + 天线 | 正面 `Water[5]` 条带 1 行，停车场 30% |
| 0xD3 | Fire Station | 3×3 | 30 | Brick / 4 | 平 + 训练塔 8×8×40 | 3 个 `Signal[4]` 车库门 10×10 |
| 0xD4 | Museum | 3×3 | 44 | Sand / 6 | 坡顶（四坡）+ 山花 | 8 根柱，台阶，雕塑 1 个 `Neutral[6]` 4×8 |
| 0xD5 | Big Park | 3×3 | 0 | Grass / 5 | 无 | 环形 `Sand[6]` 小径（内径 40 椭圆）+ 中心 `Water[5]` 池 20×10 + 7 棵树 + 2 长椅 |
| 0xD6 | School | 3×3 | 24 | Brick / 4 | 平 | L 形主体 + 操场（`Sand[5]` 菱形 + 1 px 白线跑道椭圆） |
| 0xD7 | Stadium | 4×4 | 60 | Neutral / 5 | 无 | 椭圆看台（外 120×60，内 80×40，内缘低 20 px 的阶梯 4 级）+ `Grass[5]` 场地 + 4 座灯塔 2×2×80 顶端 `cycleB` |
| 0xD8 | Prison | 4×4 | 28 | WarmGray / 3 | 平 | 双重围墙 1 px `Neutral[5]`（内缩 2、6 px）+ 4 角岗楼 6×6×36 + 2 栋 H 形牢房 |
| 0xD9 | College | 4×4 | 40 | Brick / 5 | 坡顶 + 钟塔 12×12×60 | 3 栋围合中庭，中庭 `Grass[5]` + 4 棵树 + 十字小径 |
| 0xDA | Zoo | 4×4 | 12 | Sand / 5 | 无 | 6 个围栏区（1 px `Rust[2]` 不规则多边形）各含 1 个 3×2 px 动物色块、1 条 `Water[5]` 水池、入口拱门 |
| 0xDB | Statue | 1×1 | 40 | Neutral / 6 | 无 | 基座 16×16×10 + 立像剪影（`Neutral[3]`，10 px 宽，手持物件 `Amber[6]` 2 px） |
| 0xDC | Water Pump | 1×1 | 14 | Water / 4 | 平 | 泵房 + 进水管 `Teal[3]` 伸向邻水边 |
| 0xDD | Runway | 1×1 | 0 | Asphalt / 2 | — | 跑道带 56 px 宽，中线 `Neutral[7]` 虚线；轴向由 `XBit.Flipped` 决定（§2.9.3） |
| 0xDE | Runway Cross | 1×1 | 0 | Asphalt / 2 | — | 两向跑道叠加 |
| 0xDF | Pier | 1×1 | 4 | Rust / 4 | — | 木栈桥 20 px 宽伸入水中，桩 1 px 每 8 px；轴向由 `XBit.Flipped` 决定 |
| 0xE0 | Crane | 1×1 | 50 | Amber / 5 | — | 龙门架（2 腿 + 横梁 60×4）+ 吊臂 1 px，`Neutral[1]` 集装箱 3 个 |
| 0xE1 | Civilian Control Tower | 1×1 | 48 | Neutral / 5 | 无 | 细塔 8 px + 顶部八角 `Glass[5]` 舱 20×10 + 天线 |
| 0xE2 | Military Control Tower | 1×1 | 40 | Olive / 4 | 无 | 同上，`Olive` 色，顶部雷达 2 帧 |
| 0xE3 | Warehouse（港/军） | 1×1 | 18 | Olive / 4 | 拱形 | 卷帘门 |
| 0xE4, 0xE5 | Airport Building 1–2 | 1×1 | 24 / 32 | Glass / 4 | 平 | 连续玻璃带，E5 加 `Amber[5]` 廊桥 |
| 0xE6 | Tarmac | 1×1 | 0 | Asphalt / 3 | — | 停机位 `Neutral[7]` T 形线 |
| 0xE7 | F-15b | 1×1 | 6 | Olive / 5 | — | 停机坪 + 三角翼飞机剪影 24×16 |
| 0xE8, 0xF6 | Hangar 1–2 | 1×1 / 2×2 | 24 / 32 | Neutral / 4 | 拱形 | 正面全宽大门 `Neutral[2]` |
| 0xE9 | Subway Station | 1×1 | 10 | WarmGray / 5 | 平 | 入口棚 + 下行台阶 `Neutral[2]` 8×6 + `Water[5]` 标志牌 |
| 0xEA | Radar | 1×1 | 20 | Olive / 4 | 无 | 机房 + 雷达盘 20×8 椭圆，4 帧旋转 |
| 0xEB | Water Tower | 2×2 | 56 | Water / 5 | 无 | 4 腿 1 px + 圆柱罐 36×24 `Neutral[6]`，侧面 `Water[6]` 水位带 |
| 0xEC | Bus Depot | 2×2 | 20 | Amber / 4 | 平 | 车库盒体占占地一半（沿长向），另一半 `Asphalt[3]` 停车场；3 辆 `Amber[6]` 12×4 巴士斜列，`Neutral[5]` 车道通到占地边中点 |
| 0xED | Rail Depot | 2×2 | 22 | Brick / 4 | 坡顶（长向） | 站房占一半，另一半 `Neutral[6]` 站台 + 一段 rail 带子（§3.7.3）；雨棚 4 根 1 px 柱 + `WarmGray[5]` 薄顶 |
| 0xEE, 0xEF | Parking Lot（民 / 军） | 2×2 | 0 | Asphalt / 3 | — | 车位线每 6 px + 8 辆 4×2 px 杂色小车 / 军车 `Olive[4]`；军用版周边 1 px `Neutral[5]` 围栏 |
| 0xF0 | Loading Bay | 2×2 | 14 | Rust / 4 | 平 | 低矮库房占 60% 占地 + 4 个装卸门 `Neutral[2]` 8×6 + 3 辆卡车 8×4 |
| 0xF1 | Top Secret | 2×2 | 24 | Olive / 3 | 平 | 无窗盒体 + 双层围栏 1 px（内缩 2 / 6 px）+ 2 盏 `Signal[5]` 警示灯（循环 B）+ 屋顶小雷达盘 |
| 0xF2 | Cargo Yard | 2×2 | 10 | Asphalt / 3 | — | 24 个 6×4 px 杂色集装箱堆 2–3 层 + 1 台 `Amber[5]` 跨运车剪影 |
| 0xF3 | Mayor's House | 2×2 | 30 | Neutral / 6 | 坡顶 + 门廊 4 柱 | 大草坪 `Grass[6]`、环形车道 `Sand[6]`、泳池、4 棵树 |
| 0xF4 | Water Treatment | 2×2 | 14 | Teal / 4 | 无 | 4 个圆形沉淀池（直径 28，`Water[4]` 水面 + 1 px 刮臂）+ 机房 |
| 0xF5 | Library | 2×2 | 28 | Sand / 6 | 坡顶（四坡）| 正面 4 柱，台阶，2 棵树 |
| 0xF7 | Church | 2×2 | 30（塔 56） | Neutral / 7 | 坡顶（陡，脊高 0.6）| 钟塔 10×10×56 + 尖顶 + 拱窗 |
| 0xF8 | Marina | 3×3 | 6 | Rust / 4 | — | 水格画 T 形栈桥 + 6 艘 6×3 `Neutral[7]` 小船；陆格画 `Sand[5]` + 俱乐部小屋 1×1 |
| 0xF9 | Missile Silo | 3×3 | 6 | Olive / 3 | — | `Olive[3]` 占地地面 + 中央圆形井盖（直径 80，两半开启线 `Neutral[1]`）+ 四角 1×1 掩体小盒（高 10）+ 围栏 + 4 盏警示灯（循环 B）；地下视图另画 `XUND 0x22` 井体（`Teal` 圆筒） |
| 0xFA | Desalinization | 3×3 | 24 | Teal / 4 | 平 | 3 个卧式圆柱罐 + 取水管伸向咸水边 + `Water[7]` 出水口 |
| 0xFB | Plymouth Arco | 4×4 | 180 | WarmGray / 4 | 平 | 阶梯金字塔 4 段（每段缩进 16 px、高 45），每段 3 行窗，顶 `cycleB` 信标 |
| 0xFC | Forest Arco | 4×4 | 150 | Glass / 4 | 穹顶 | 玻璃穹顶 150 直径的半球（6 阶带状）内透 `Forest[4]` 色块，基座 `Neutral[5]` 高 20 |
| 0xFD | Darco | 4×4 | 190 | Violet / 2 | 无 | 不规则有机塔：3 个错位圆柱（直径 50/40/30，高 110/150/190）+ 表面 `Violet[4]` 1 px 脉络 |
| 0xFE | Launch Arco | 4×4 | 192 | Neutral / 5 | 无 | 中央火箭形主塔（直径 48，顶部圆锥 30 高）+ 4 个助推柱（直径 20，高 120）+ 发射架 1 px `Rust[3]` |
| 0xFF | Llama Dome | 4×4 | 100 | Amber / 5 | 穹顶（直径 120，`Amber[6]/Amber[4]` 条纹 12 等分） | 入口拱门 + 4 面旗帜 1 px 杆 + `Signal[5]` 2×3 旗 |

未在表中的 ID（0x00–0x6F 地表 / 路网、0x88–0x8B 与 0xA6–0xAD、0xC2–0xC5 施工 / 废弃）由 §3.7 覆盖。

### 3.9 覆盖物、角色、UI 图标与生成函数清单

#### 3.9.1 覆盖物与角色（`overlay` / `actor` 枚举）

| 枚举值 | 内容 | 帧 / fps | 配方 |
|---|---|---|---|
| `overlay.cursorTile` | 地块光标 | 1 | 菱形 2 px 描边 `Neutral[7]`，内部空 |
| `overlay.previewOk / previewBad` | 放置预览 | 1 | 菱形 50% 抖动填充 索引 5（绿）/ `Signal[5]`（红）+ 2 px 描边 |
| `overlay.zoneR/C/I light/dense` | 分区地面 | 1 | §3.7.5 |
| `overlay.noPower` | 断电图标 | 2 / 2 fps | 16×24 闪电 `Amber[7]`，第 2 帧空（闪烁） |
| `overlay.noWater` **[设计]** | 缺水图标（仅 Query / 地下视图提示） | 1 | 12×16 水滴 `Water[6]` + 斜杠 |
| `overlay.fire` | 火焰 | 4 / 8 fps | 3 簇火舌（索引 144–151 随机抖动），占地块上半，`XTXT 0xFF` |
| `overlay.flood` | 洪水 | 3 / 3 fps | 浅水 `Water[4]` 菱形 + 高光循环 A，`XTXT 0xFC` |
| `overlay.toxic` | 毒云 | 3 / 2 fps | `Olive[5]/Olive[6]` 抖动椭圆 48×20，`XTXT 0xFB` |
| `overlay.riot` | 暴民 | 2 / 4 fps | 6–8 个 2×4 px 人形 `Signal[4]/Neutral[2]`，`XTXT 0xFD/0xFE` |
| `overlay.sign` | 标牌 | 1 | 1 px 杆 + 白底 `Neutral[7]` 牌，文字由 DOM 覆盖层渲染（不烧进精灵） |
| `overlay.connection` | 邻城连接标牌 | 1 | 同 sign，`Amber[6]` 底 |
| `overlay.traffic` light/heavy | 车流 | 4 / 6 fps | 沿道路带子每帧位移 4 px 的 4×2 px 杂色小车，light 2 辆 / heavy 6 辆（`XTRF` 阈值 64 / 160）|
| `actor.plane` | 飞机 | 2 / 4 fps | 32×12 机身 `Neutral[7]` + 机翼，影子菱形另画在地面 |
| `actor.helicopter` | 直升机 | 2 / 8 fps | 20×10 机身 + 旋翼 1 px 两帧交错 |
| `actor.ship` | 货船 | 1 | 40×14 船体 `Rust[3]` + 上层 `Neutral[6]` + 2 烟囱 |
| `actor.sailboat` | 帆船 | 2 / 2 fps | 12×6 船体 + 三角帆 `Neutral[7]` 左右摆 |
| `actor.nessie` | 水怪 | 2 / 2 fps | 3 段 `Forest[3]` 弧背 + 头 |
| `actor.trainHead / trainCar` | 火车 | 1 | 24×10 车头 `Signal[3]` / 车厢 `Rust[4]`，按轨道方向 4 朝向各 1 张（8 张） |
| `actor.monster` | 怪兽 | 4 / 4 fps | 48×64 双足剪影 `Forest[2]`，`Signal[6]` 眼，脚下尘土 |
| `actor.tornado` | 龙卷风 | 4 / 8 fps | 倒锥 24→64 宽、96 高，`Neutral[4..6]` 抖动，每帧旋转纹理 |
| `actor.explosion` | 爆炸 | 6 / 10 fps | 同心圆 索引 144–151 由内向外 |
| `actor.deployPolice / deployFire / deployMilitary` | 调度单位 | 1 | 24×24 徽记圆盘：`Water[5]` 盾 / `Signal[5]` 消防帽 / `Olive[5]` 星 |
| `actor.maxisMan` 等彩蛋 | — | — | 不实现 |

#### 3.9.2 UI 图标（`ui` 枚举，24×24 px，2 色 + 高光，[设计]）

工具栏 25 个按钮图标：`bulldozer, landscape, emergency, roads, power, water, rails, ports, residential, commercial, industrial, education, services, recreation, signs, query, rewards, rotateCcw, rotateCw, zoomOut, zoomIn, centering, help, mapWin, graphsWin, populationWin, industriesWin, neighborsWin, budgetWin`；显示开关 5 个：`showBuildings, showSigns, showInfra, showZones, showUnderground`；子工具 64 个与 §2.3 子工具名一一对应（`sub.<camelCase>`）；Map 图层 14 个（§2.5.1）；速度 5 个；天气 12 个 `weather.<name>`（§2.4，顺序同 `disasters-events.md` §2.4.2）+ 红色 `gotoArrow`；RCI 指示器底座 `rciBase`（三根柱由 DOM / Canvas 按需求值实时画，不做精灵）；窗口按钮 `close, minimize, pin`。图标规则：1 px `Neutral[1]` 轮廓、主体一种 ramp 的 i=5、左上 1 px i=7 高光；禁用态整体换 `Neutral[4]`。

#### 3.9.3 生成函数清单（`art-procedural/index.ts` 导出）

| 函数 | 输入 | 输出 | 覆盖 |
|---|---|---|---|
| `genTerrain(nibble, altBand, variant, scale)` | 0..13, 0..2, 0..3 | 1 帧 | 地表 256–269 等价物 |
| `genTerrainUnderground(nibble, scale)` | 0..13 | 1 帧 | 地下视图地表 |
| `genEdgeWall(levels, side, scale)` | 1..31, L/R | 1 帧 | 地图边岩壁 |
| `genWater(shape, depthBand, scale)` | 0..20, 0..2 | 3 帧 | 水面 270–290 等价物 |
| `genNetwork(kind, mask, slopeDir, scale)` | road/rail/power/highway/pipe/subway, 1..15, none/T/R/B/L | 1 帧 | 0x0E–0x3E, 0x49–0x4A, 0x61–0x69, XUND |
| `genCrossover(kindA, kindB, axisA, scale)` | — | 1 帧 | 0x43–0x48, 0x4B–0x50, XUND 0x1F/0x20 |
| `genTunnelPortal(dir, kind, scale)` | T/R/B/L, road/rail | 1 帧 | 0x3F–0x42 |
| `genBridge(kind, part, scale)` | 6 种 × part | 1 帧（raising 2 态） | 0x51–0x5C, 0x6A, 0x6B |
| `genOnramp(hwySide, roadSide, scale)` | T/B × L/R | 1 帧 | 0x5D–0x60 |
| `genSubRail(dir, scale)` | T/R/B/L | 1 帧 | 0x6C–0x6F |
| `genTrees(density, variant, scale)` | 1..7, 0..3 | 1 帧 | 0x06–0x0C |
| `genGround(kind, variant, scale)` | rubble/radioactive/park/zone×6 | 1 帧 | 0x01–0x05, 0x0D, 分区地面 |
| `genConstruction(size, variant, scale)` / `genAbandoned(size, variant, scale)` | 1..3 | 1 帧 | 0x88–0x8B, 0xA6–0xAD, 0xC2–0xC5 |
| `genBuilding(id, scale)` | 0x70–0xFF（查 §3.8 配方表 `BUILDING_RECIPES[id]`） | 1–4 帧 | 全部建筑 |
| `genOverlay(name, scale)` / `genActor(name, dir, scale)` | §3.9.1 | 按表 | 覆盖物 / 角色 |
| `genIcon(name)` | §3.9.2 | 1 帧 24×24 | UI |
| `genMinimapLut(mode)` | §2.5.1 | 256 × RGBA | Map 窗口 |
| `buildPalette()` | — | `Palette` | §3.5 |

所有函数纯函数、确定性（同输入同输出），vitest 用 `IndexedBitmap` 的 FNV-1a 哈希做快照；任何配方改动须更新快照并附 PNG 预览（`pnpm --filter sc2k art:preview` 把全部精灵拼成一张 contact sheet 到 `docs/art-preview/`，仅供人工检视，不入 git）。

### 3.10 动画实现

| 机制 | 做法 |
|---|---|
| 帧动画 | `SpriteSheetEntry.frames > 1` 的精灵放 `dynamicLayer`，全局 `AnimationClock` 按 `fps` 分组（2 / 3 / 4 / 6 / 8 / 10），同组同相位（原版同类精灵同步）。 |
| 颜色循环 | `Palette.cycles` 每 `periodMs / length` 环移一次；`SpriteAtlas` 维护 `cyclingBitmaps` 列表，循环步进时只重上传这些纹理（水面约 20 张、灯光约 10 张）。XS/S 档关闭循环（视觉不可辨）。 |
| 速度相关 | 动画时钟独立于模拟速度：Paused 时水面与灯光继续动，车流 / 角色停止（原版手感 **[M]**）。African Swallow 下角色移动跳帧。 |
| 工具预览 | 光标菱形每 500 ms 在 `Neutral[7]`/`Neutral[5]` 间切换；拒绝时抖动 2 px × 3 次 |
| 视图过渡 | 缩放 / 旋转无过渡（原版瞬切）；Auto-Goto 与 Centering 400 ms ease-out 平移 |

### 3.11 UI 组件树与触控

```
<App>
├─ <TitleScreen>（新城 / 载入 / 导入素材 / 关于）
└─ <GameShell>
   ├─ <MenuBar menus=[File,Speed,Options,Disasters,Windows,Newspaper,Help]>
   │    └─ <Menu> → <MenuItem check|radio|action|separator>
   ├─ <Workspace>
   │    ├─ <CityView>                     // Pixi canvas；props: ViewState, SpriteAtlas；emits: pointer events in tile space
   │    │    ├─ terrainChunks[64] / undergroundChunks[64] / dynamicLayer / previewLayer / signLabels(DOM 覆盖)
   │    │    └─ <MapOverlayHeat>          // 可选热力叠加
   │    ├─ <Toolbar floating draggable collapsible>
   │    │    ├─ <ToolButton tool=… active disabled badge>  ×25
   │    │    ├─ <SubToolPopup items=[{id,icon,label,cost,enabled,reason}]>
   │    │    ├─ <ViewToggles buildings signs infra zones underground>
   │    │    └─ <RciIndicator demand={r,c,i}>   // zones §2.8.7：柱高 |demand|/2000，正上负下；monthTick 刷新
   │    └─ <WindowLayer>
   │         └─ <FloatingWindow title draggable resizable? zIndex>
   │              ├─ <BudgetWindow> / <LedgerWindow kind=tax|police|…> / <BondsWindow> / <OrdinancesWindow>
   │              ├─ <MapWindow layer=…> / <GraphsWindow> / <PopulationWindow> / <IndustriesWindow tab=…> / <NeighborsWindow>
   │              ├─ <NewspaperWindow paper=…> / <QueryWindow tile=…> / <HelpBubble>
   │              └─ <TerrainEditorToolbar>（城市模式 0 时替代 Toolbar）
   ├─ <StatusBar message date funds speed weather complaint>   // 两行：第一行状态，第二行诉求（services §2.10.4）
   │    └─ <StatusWeatherGoto weather disasterMode onCycleFocus>   // 天气图标；灾害模式 = 红色 goto 箭头（disasters §2.2.3）
   └─ <ModalHost>  // NewCityDialog, BridgeDialog, ConnectionDialog, StadiumDialog, YearlyBudget, DisasterAlert, ExtraNewspaper, GameOver, RewardOffer, ImportAssetsDialog, FilePicker
```

状态流：`UiStore`（工具 / 子工具 / 打开的窗口 / 视图状态 / 消息队列）→ 组件只读订阅；工具操作经 `ToolController`（§2.8 的模式状态机）调用各模块 API，结果（`cost`、`reason`）回写消息区。窗口数据通过各模块的 `*ReadApi` 拉取，每月结算后广播 `monthTick` 触发刷新；Graphs / Map 窗口每帧不重画，仅在数据变化或可见时重画。

触控（指针事件统一处理；`touch-action: none`）**[设计]**：

| 手势 | 行为 |
|---|---|
| 单指点按（< 300 ms，位移 < 8 px） | 当前工具的 Click / Place / Query |
| 单指拖动 | Paint / Line / Rect 工具正常拖；Click / Place / Query 工具下 = 平移 |
| 长按 500 ms | Query（任何工具下） |
| 双指平移 | 平移 |
| 捏合 | 连续缩放比例 `k` 累积，跨过 `1.5` 进一档、`0.67` 退一档（带 10% 滞回），松手后吸附到整数档 |
| 双指旋转 ≥ 40° | 旋转一档（方向同手势），每次手势最多一档 |
| 双击 | 放大一档并居中 |
| 三指点按 | 切换地下视图 |

窄屏（宽 < 768 px 或高 < 520 px）布局：菜单栏折叠为左上 ☰；工具栏变为底部横向滚动条（按钮 48×48，子工具条向上展开）；窗口全屏呈现并带返回键；状态栏置顶一行（天气 / goto | 日期 | 资金 | 速度），诉求文字与消息区在同一行轮播；RCI 指示器缩成工具栏抽屉里的 3 根细柱。

### 3.12 性能与资源预算

| 项 | 预算 |
|---|---|
| 图集 | L 档全部精灵 ≈ 1,100 张（含帧与变体），估算像素 ≈ 9 M → 3 页 2048²；M + S 再各 1 页；按需生成（首帧只生成当前档 + 地形 / 水 / 路网，建筑首次可见时生成并上传）。DAT 来源：M 原生约同量，L / XL 为 ×2 / ×4 放大纹理，只放大视口内用到的精灵 |
| 纹理设置 | `scaleMode: 'nearest'`，`roundPixels: true`，`antialias: false`，`resolution = 1`（像素风格由整数倍最近邻放大保证（§3.4），高 DPI 下整体 CSS 放大 2× 而非提高分辨率）|
| 首帧 | 生成地形 / 水 / 路网 / 树 ≈ 200 张 < 150 ms（Worker 中生成，`transfer` `Uint8Array`） |
| 块重建 | 单块 16×16 重建 ≤ 2 ms；一次 Rect 分区最多触及 64 块，分帧（每帧 ≤ 8 块） |
| 帧预算 | 60 fps：动态层 ≤ 600 个精灵；车流覆盖按视口裁剪；角色 ≤ 39 |
| 内存 | 索引色位图缓存 ≤ 24 MB；DAT 导入后原始文件不驻留内存，只留解码后的位图 |

---

## 4. 边界条件与易错点

1. **旋转的两个置换必须同源**：坐标 `(x,y)→(y,127−x)` 配方向映射 `T→L→B→R→T`（§3.3）。只改其一会得到镜像坡面；`terrain.md` §2.5.4 的 `SLOPE_ROT_CCW` 与本文同源，渲染器 import 它而不重抄，并用 §3.3 的像素快照用例锁定。
2. **坡面 nibble 不是位掩码**，置换与剖分都要查表（`SLOPE_CORNERS`），不要对 nibble 做位运算。
3. **菱形像素规则**：顶行 2 px、每行 +4 px、最宽 `W−2`；若误用"顶行 4 px"会在每条地块边产生 1 px 重叠条纹。
4. **锚点以最低角为基准**：坡面地块与建筑都以"占地底顶点在基准海拔"对齐；抬高的角只向上画。若以画布中心对齐会出现随缩放漂移的半像素缝。
5. **缩放只做整数倍最近邻**：索引色不能插值。DAT 来源 L / XL 由 M 位图 ×2 / ×4；procedural 的 XS 由 S 取样 ÷2、XL 由 L ×2（§3.4）。不要再出现"由 L 缩小得到 M / S"的路径——DAT 根本没有 L 位图。
6. **颜色循环只影响索引 ≥ 160 的像素**：DAT 导入时索引语义来自玩家的调色板文件，循环区按 `PAL_STTC` 为黑的索引推断（§2.9.1），我方 `Palette.cycles` 在两种来源下定义不同。
7. **拾取用地面而非精灵包围盒**：高楼上半部分点击应落到其后方地块（原版行为）；若实现成包围盒拾取，Place 预览会在高楼前"跳格"。
8. **Line 工具轴向实时切换**：拖动中不要锁定首个轴向；松开时才按当前轴向提交；总价随长度刷新。
9. **Rect 分区跨越水面 / 坡面**：预览里把不可划的格标红但不阻止提交，提交时只划合格格并按实际格数计费（原版手感 **[M]**）；Place 则是"任一格不合格即整体拒绝"。
10. **多格建筑跨块**：锚格所属块缓存纹理需扩展到精灵包围盒；块重建时同时重建"向上越界覆盖到的"块不必要（它们在前面被画），但**锚格所在块之后**的块必须在它之后绘制——用块序 `(cx+cy)` 保证。
11. **地图边缘岩壁**：旋转后 `rx==127` 或 `ry==127` 才画；判断用旋转后坐标，否则旋转时岩壁出现在背面。
12. **断电图标只给可供电建筑**（`Powerable && !Powered`），树木 / 公园 / 雕像不显示。
13. **标牌文字用 DOM 覆盖层**，随视口变换重新定位；不要把文字烧进精灵（字体与本地化会变）。
14. **Esc 的语义栈**：拖动中 → 取消拖动；有弹出子工具条 → 收起；有窗口 → 关闭最上层；否则无动作。
15. **浏览器快捷键冲突**：`Ctrl+S` 需 `preventDefault`；`F5/F11/F12` 不绑定；移动端禁用双击缩放（`touch-action: none` + `user-scalable=no`）。
16. **`hashNoise` 替代 `Math.random`**：生成器必须确定性，否则快照测试与两档美术间的"同一栋楼不同样子"问题都会出现。
17. **禁用态与解锁原因**：子工具灰显要给出原因文本（科技年份 / 人口 / 法令 / 资金），原因来源于各模块的 `availability(toolId)`，UI 不自行判断。
18. **Query 对多格建筑**：任意一格查询都显示整栋信息（用 `XZON` 角标找锚格）。
19. **导入素材的隐私**：DAT / BMP / SC2 只在 `File` 对象与 IndexedDB 中流转；任何网络请求（含错误上报）不得携带其内容或哈希。
20. **翻转位是 `0x02`（`XBit.Flipped`），不是 `0x40`（`Powered`）**：渲染朝向只读 `xbit & XBit.Flipped`。按 `0x40` 实现，所有通电的码头 / 跑道 / 匝道 / 桥件都会随供电状态转 90°，断电扫描还会"改写朝向"。渲染器永不写 `XBIT`；像素快照用例见 §2.9.3。
21. **DAT 缩放级对应本项目 M / S / XS，不是 L / M / S**：`LARGE.DAT` 的 1×1 是 32 px 宽；把它当 L 档会让全部原版位图缩成一半、建筑脚部错位，并与程序化来源尺寸不兼容。
22. **DAT 位图有 1 行重叠行**：高 17 / 9 / 5 对应本项目 16 / 8 / 4 行菱形，锚点 `(w/2, h−1)`（§3.2.6）。用 `(w/2, h)` 会让地面整体上移 1 px、建筑与地面之间露 1 px 缝。
23. **ID 基址**：LARGE 文件内 ID = `1000 + n`，SMALLMED / SPECIAL：small = `n`、medium = `500 + n`；渲染器只持相对号 n，由 `relativeId()` 加基址。直接用 n 查 LARGE 会全部落空。
24. **占地只认 `FOOTPRINT[id]`**：0xEC / 0xED / 0xEE / 0xEF / 0xF0 / 0xF1 / 0xF2 为 2×2，0xF9 为 3×3（`building-catalogue.md` §2.7 / §2.8 / §3.2）。画布宽、Place 光标、Query 的锚格查找都从它推导；UI / 美术代码不得另写尺寸表。
25. **RCI 指示器与诉求行不是装饰**：两者是玩家决定划区与建设的主要信息源；指示器数据只来自 `zones` 的 `demand[]`（±2000），诉求文案只来自 `services` 的 `cityStatus`，天气 / goto 图标状态只来自 `disasters`，UI 不自行计算。

---

## 5. 待确认问题

1. Win95 SE 的显示缩放档数与本项目五档的对应（本文：XS / S / M ← small / medium / large 原生；L / XL = large ×2 / ×4，依据"最近两档共用美术"的二手说法 **[M]**）需实机截图比对；`SPECIAL.DAT` 的具体内容。
2. 原版工具栏两列的精确行序，以及 Rewards 按钮的位置与禁用表现。
3. 原版 Win95 快捷键全表（目前仅 `Ctrl+1` = Turtle 可信）；旋转 / 缩放是否有键盘绑定。
4. DAT 位图重叠行的位置（本文：最后一行，锚点 `(w/2, h−1)`，§3.2.6）与 17 / 9 / 5 行菱形的逐行宽度，需用玩家导入的 1256（large 平地）与一座 2×2 建筑在真机上验证：相邻平地格间不得出现 1 px 缝，建筑脚部不得与地面错 1 px；若反了改 `DAT_OVERLAP_ROW = 'top'`。
5. 原版 Map 窗口的 City Services 子项（本文：Police / Fire / Health / Education）。
6. Query 对话框的字段与离散化阈值（本文为设计值）。
7. 原版是否在 Paused 时继续播放水面 / 灯光动画（本文：是）。
8. 放置型工具的指针锚格（本文：奇数取正中，偶数取靠 −x,−y 的中心格）。
9. Rect 分区遇到不合格格的行为（本文：跳过并按实际计费）。
10. 坡面光照方向与倍率（本文：屏幕左上光源；表 §3.6.2）是否与原版观感一致，需用导入的真实精灵做并排对比。
11. 交通覆盖的阈值（light / heavy = 64 / 160）与帧率 6 fps。
12. 原版 Win95 状态区的确切位置与排布（本文：底部两行，天气图标 | 消息 | 日期 | 资金 / 诉求行）；RCI 指示器在工具栏中的确切位置（本文：最底行）。
13. `MISC[0x1014]` 是否为缩放档，若是则读写它而非自定义字段。
14. 灾害模式下可用工具集合（本文：Bulldozer / Emergency / Query / Signs / 视图）。

---

## 6. 参考来源

- dfloer / SC2k-docs（CC BY-SA 4.0，本地副本）：`sprite_data_spec.md`（DAT 头部与行块编码、调色板位图、MIF 宽度、颜色循环索引）、`sc2_file_spec.md`（`MISC` 的速度 / 选项 / 报纸 / 视图字段、`XBLD`/`XTER`/`XZON`/`XBIT`/`XUND`/`XTXT`/`XTHG` 编码、小地图分辨率、`XGRP` 结构）、`simulation_spec.md`（新城对话框参数、法令表）、`text_data_spec.md`（报纸结构）。
- nicholas-ochoa / OpenSC2K（**仅阅读**）：`src/constants.js`（`TILE_WIDTH 64 / TILE_HEIGHT 32 / LAYER_OFFSET 24` —— 这是该项目的 **2× 渲染常量**，原生 large 为 32×17 / 12 px，见 `file-formats.md` §2.6.3；图层深度序）；`src/import/tiles.js`（每瓦片的四向 `rotate` 数组与 `flip` 标志：建筑无旋转数组、路网 / 地形 / 水面有；水面 2–3 帧、车流帧率 6、建筑帧率 4）。
- 本仓库兄弟规格：`file-formats.md`（精灵文件字节序、尺寸、`ZOOM_BASE`、`IdLayout` —— 导入路径的唯一依据）、`building-catalogue.md`（占地 `FOOTPRINT`、翻转位使用者、RCI 指示器在工具栏）、`terrain.md`（坐标系、坡面码、`SLOPE_ROT_CCW`、编辑器工具栏）、`economy-budget.md`（速度档、预算窗口字段、造价总表、图表序列）、`zones-growth-demand.md`（分区编码与锚格、RCI 指示器显示规则）、`services-models.md`（公共建筑表、诉求链）、`power-water.md`（`XBIT` 掩码常量 `XBit.*`、查询窗口字段）、`transport-traffic.md`（路网工具与桥梁对话框）、`disasters-events.md`（天气图标、灾害模式 goto 箭头）。
- 作者对 SC2K Win95 / DOS 版的记忆（工具栏分组、子工具内容、菜单、Map 图层、缩放档、状态栏），均已按置信度标注。
- 公开搜索仅确认 Win95 `Ctrl+1` = Turtle 及"Windows 版最近两档缩放共用美术"两条（ludo.guide 摘要，页面本身不可达）。
