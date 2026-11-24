# 中環急件 Central Rush（暂定名）· 开发计划

> 本文是调研 + 双草案 + 评审合并后的总计划。代码在 `central/`（与红警共用一个 monorepo、一个部署）。

## 已拍板（2026-11-24）

| 问题 | 决定 |
|---|---|
| 地形数据 | 由 agent 处理：云环境已放行 data.gov.hk / *.csdi.gov.hk，直接从地政总署官方渠道拉取 |
| 枪械 | **不要**。追逐为核心、非致命、喜剧化 |
| 平台 | **只做网页**（海外托管），手机横屏优先，兼顾桌面 |
| 真机 | **iPhone 17**（高档；性能预算仍按中档设计，留余量） |
| 仓库 | **沿用 ra2-web**：新游戏放 `central/`，构建产物挂在同一服务的 `/central/` |
| 暂定名 | 《中環急件》Central Rush（未做商标检索，可改） |

---


> 日期 2026-11-24。标注说明：
> - 【实测】：调研阶段在容器里实际跑过或读到的结果
> - 【复核】：本轮评审重新跑过的结果
> - 【摘要】：只看过搜索摘要，没打开原文
> - 【未核实】：凭记忆或推断
> - 【估】：设计估算
>
> ra2-web 仓库全程只读，没有改动。

---

## 0. 直接回答：应该怎么做

1. **定位**：做一个原创的**港产片式追逐驾驶喜剧**小开放世界。玩法和 GTA 同一类型（自由漫游、抢车、通缉、任务），但**不用枪、非致命**。名字、HUD、角色、地图结构全部原创，对外宣传不提 GTA。
2. **技术**：沿用 ra2-web 的工程骨架，即 pnpm monorepo、TS strict、Vite、Vitest、Playwright、Node ws、Fly.io 单容器。渲染从 PixiJS 换成 **three.js 0.187 WebGLRenderer**，物理用 **Rapier 0.21**，联机**不沿用 lockstep**。
3. **地图不手工建模**：路网和楼体来自真实数据（Overture/OSM 加地政总署地形），经离线管线生成。约 10 座地标用 TS 写成参数化的「致敬模型」，取虚构名。立面、窗灯、霓虹全部用 shader 和 canvas 程序生成。这条路线 AI agent 能写代码、跑测试、看截图自查。
4. **节奏是「快出好玩」加「早拆雷」**：
   - 第 2–3 次会话就能在中环的平地区开上车；
   - 设三道 go/no-go 关卡：①手感与物理；②数据与地形；③真机渲染预算；
   - 三道关都过了，再叠交通、抢车、风声和任务。
   - MVP 约需 11–15 次 agent 会话，加上你 15–25 小时的真机试玩和调参【估】。
5. **你要先做的三件事**：
   - 决定地形数据怎么拿（见 §3.3），M2 之前必须到位；
   - 准备 1 台 iPhone 加 1 台中端 Android，作为真机裁判；
   - 拍板 §9 的默认值。

---

## 1. 红线（M0 写进 CONTRIBUTING，也写进 agent 指令）

| 类别 | 规则 |
|---|---|
| 不像 GTA | 不出现「GTA」「Grand Theft」字样；不用左下圆形小地图加血条、右上星星、Pricedown 类字体；电台、角色、任务名都原创。风声 HUD 用「分段条 + 形状」双编码 |
| 地标 | 用虚构名（如「海港塔」「三稜塔」），不放 logo 和企业标识，造型做到神似、不按比例复刻；不复刻雕塑，例如汇丰的狮子。《版权条例》第 71 条是否覆盖 3D 游戏模型，没有判例【摘要】 |
| 品牌 | 管线里过滤掉真实店名和企业名，街道名、地名保留。巴士、电车、渡轮、港铁、2025 年起的新的士车队，以及车厂外形，一律不用。红的车身颜色是法规规定的，小巴车顶颜色也可以用【摘要】 |
| 敏感 | 军营、军用码头、政府总部、立法会、律政中心、终审法院、礼宾府只做背景，不可交互。不出现真实警徽、制服、旗帜、区徽；警队用虚构的名称和制服；不做示威题材；不做竹棚倒塌或火灾桥段（宏福苑大火一周年是 2026-11-26【摘要】） |
| 暴力 | 不用枪，不死人，不流血，不能攻击警察。警察只是阻力 |
| 素材 | 只收 CC0、CC-BY、OGA-BY。不用 Mixamo、Sketchfab Standard，不用 SA/GPL/NC 许可的素材，不用 Google Photorealistic 3D Tiles，不用 LandsD 带照片纹理的模型 |

---

## 2. 技术选型

| 层 | 选型 | 依据 |
|---|---|---|
| 工程 | 新开**公开**仓库，代号如 `central-mini`，结构照搬 ra2-web：`packages/{data,game,client,server}`、`tools/`、CI 四步、Dockerfile、新的 Fly app（sin 区） | ra2-web 结构、MIT 许可、fly.toml 里 primary_region="sin"【复核】 |
| 构建 | Vite 8.3.8 + vite-plugin-wasm 3.6.0 + Vitest 5.1.1 + Playwright | 这个组合构建 Rapier 已实测通过【实测】；peer 依赖范围已用 npm view 复核【复核】。如果照抄 ra2-web 配置时卡住，可退回 Vite 7.3.5 / Vitest 3.2.6 |
| 渲染 | three 0.187 **WebGLRenderer**，命令式 loop，不用 R3F；只写 4 个自定义材质（建筑、路面、霓虹、载具）；渲染层封装在 `CityRenderer` 后面 | 最小场景 gzip 130 KB【实测】；WebGPURenderer 官方仍标 experimental【实测：GitHub 版手册】 |
| 物理 | **Rapier 0.21**，懒加载，封装在 `PhysicsWorld` / `VehicleModel` 后面；步行用 `KinematicCharacterController` | API 和基准已实测：5000 个静态体加 160 个动态体，每步约 1.05 ms（服务器 CPU）【实测】；wasm 约 1.19 MB gz【实测】 |
| 模拟 | `packages/game` 是纯 TS，不引 three、不碰 DOM。60 Hz 固定步长 + accumulator（每帧最多 3 个子步）+ 渲染插值。车流和行人用 SoA typed array；交通用车道图 + IDM + 定时信号灯；用浮点数 | 沿用 RA2 验证过的分层【估】 |
| 数据 | `tools/citymap/` 下的 tsx 分阶段脚本；用 hyparquet 读 Overture GeoParquet，proj4 投影，earcut 三角化 | hyparquet 读入 1,635 行约 22 ms；proj4 基准误差 0.1 m 以内【实测】 |
| 坐标 | 投影到 HK1980 Grid（EPSG:2326）再减本地原点；sim 里 x 东、y 北、z 上；three 里 (x, z, −y)，这个换算只写在一个函数里 | 基准点 (114.1594, 22.2810) → (834467.1, 815791.9)【实测】 |
| 网络 | MVP 不做联机；v1.5 做异步挑战；v2 做「各自权威 + 服务器转发 + 插值」的好友房 | ra2-web 的 `INPUT_DELAY = 6`（room.ts 第 27 行，约 400 ms）【复核】，开车无法接受 |
| 音频 | Web Audio 程序合成，照搬 ra2-web `audio-bus.ts` 的「合成兜底 + 采样替换 + 节流」模式 | 离线合成的 WAV 各段 RMS 都不为零【实测】 |
| 文字 | Noto Sans HK 等 OFL 字体，构建期子集化成 woff2；场景内一律繁体；UI 可切繁/简/英，用 opencc-js 转换，加人工覆盖表 | 138 字 + ASCII 子集为 45 KB；完整字体 7.09 MB【实测】 |

### 两份草案的分歧与裁决

| 分歧 | 裁决 | 原因 |
|---|---|---|
| 物理用 Rapier 还是自写 2.5D | **Rapier**。M1 做 A/B：A 是射线载具，B 是刚体加自写街机力，两者共用 Rapier 碰撞，用 `?car=a\|b` 切换，你在真机上选。零 wasm 的自写方案只作最后退路 | 切片稿「切片 A 是平地」的前提不成立（§3.1）。v1 还有坡、石阶、天桥，自写碰撞最容易出隐蔽 bug |
| 首个可玩区 | M1 用**平地区 F** 开车；MVP 用**收窄后的 v0**；渲染和数据从 M0 起就覆盖 v2 | 既能最快开上车，又能尽早验证扩图不用重写 |
| 地形什么时候做 | **M2 就做**，列为关键路径上的关卡；不等到 M5 | MVP 区南半部的楼基底 p50 是 25 m，最高 83 m【复核】 |
| 建筑数据源 | 先**整层**用 Overture；M2 决定是否**整层**换成 LandsD；绝不逐栋混合 | 隔离 ODbL 和港府条款；LandsD 的高度覆盖率 100% |
| 路口模型 | 默认用「节点 + Bezier 转向线 + 圆盘路面」；路口多边形放到 v1 以后 | 路口多边形是难题，不能挡在 MVP 前面 |
| 数据格式 | MVP 用单个 `city.json`（整数分米，可 diff）加独立的 `terrain.bin`；扩到 v1 时再切成 256 m 二进制块 | 先让 agent 看得懂，后优化体积 |
| 镜头 | 默认**中位追尾**（距离 9–12 m，俯角 20–30°），另有 55° 高空档；性能预算按追尾这个最坏情况定 | 天际线是中环的第一辨识点 |
| 时段 | MVP 固定「入夜」，v1 再加昼夜和雨 | 一套光照只需调一次，夜景还能遮住低模 |

---

## 3. 地图范围与数据

### 3.1 范围分区（本轮用 Overture 和 LandsD 数据复核）

| 区 | 范围（WGS84） | 尺寸 | 复核数据 | 用途 |
|---|---|---|---|---|
| **F 平地区** | 核心 114.1570–114.1612 × 22.2800–22.2868；加西条 114.1545–114.1570 × 22.2838–22.2868 | 433×752 m，加约 260×330 m | 核心：Overture 楼 99 栋、可驾驶路段 253 段/15.0 km、红绿灯 58 个、电车轨 1.09 km；LandsD 楼基底 p50 3.7 m，高于 15 m 的约 10%。西条：基底 p50 3.7 m【复核】 | M1 开车沙盒；地形数据拿不到时，它就是 MVP 的保底范围 |
| **MVP 区** | v0（22.2785–22.2875 × 114.1550–114.1640），东界收到约 **114.1612**（花园道一线） | 约 0.8 km²【估】 | v0 南部楼基底 p50 25 m、最高 83 m，必须有地形【复核】 | MVP 可玩 |
| v1 | 22.2770–22.2885 × 114.1500–114.1665，东界同样不越过花园道 | 约 2.0 km²【估】 | — | v1 可玩：上环、文武庙、坚道台地 |
| 渲染和数据范围 | v2：22.2755–22.2895 × 114.1490–114.1690 | 3.2 km² | 已抽取的 Overture 范围内有楼 1,612 栋【实测】 | 从 M0 起渲染背景天际线 |

**敏感区【复核】**：Overture 的 land_use 里，military 类有「中環軍營」，最西点在 114.16246；还有「中區軍用碼頭」，最西点在 114.16323。两者都**在 geo 研究给的 v0 范围以内**。另外，「律政中心」和「中區政府碼頭」也在 v0 内。处理方式：
- 管线 `10-zones` 自动导入 class=military 和政府机构多边形，生成 `zones/sensitive`；
- 测试断言：可玩区离军事多边形至少 100 m（东界 114.1612 处约 130 m）；敏感区内没有刷车点、任务点、AI 车道终点、可破坏道具；进入敏感区不加风声；
- 中银只做背景地标；中环湾仔绕道隧道口封闭。

### 3.2 图层与来源（每层只用一个来源）

| 图层 | MVP 来源 | 以后 | 备注 |
|---|---|---|---|
| 道路、电车、道具点 | Overture 2026-11-18.0 的 segment、connector、infrastructure（OSM 派生，ODbL）【实测】 | 可选运输署 Road Network v2（要 GDAL，字段只见过摘要） | 没有 lanes 字段，用 `overrides/lanes.ts` 加按道路等级的默认值 |
| 建筑 | Overture building（1,612 栋；其中 121 栋是 CC-BY-4.0）。高度按优先级取：地标覆盖表 → height → 层数×3.2 m → 启发式 | M2 决定是否**整层**换成 LandsD Building（高度 100% 覆盖）【实测：二手副本】 | 只有 40% 带高度或层数【实测】；地标高度用已核实表：IFC2 412 m、中银 367.4 m、中环中心 346 m、长江 282.8 m、汇丰 178.8 m、怡和 178.5 m |
| 地形 | **LandsD 5 m DTM**（或 CEDD LiDAR），重采样到 2 m，放在**独立的 terrain.bin**，运行时采样，不写进 ODbL 记录 | — | 不用 AWS Terrarium：海旁有 50 m 假高程，还有 −2892 m 的坏值【实测】。Overture 没有基底高程，所以没有 LandsD 就没有地形 |
| 行人网络、天桥、扶梯 | MVP 只做人行道带 | v1 用 LandsD 3D Pedestrian Network（天桥 347 条、扶梯 111 条）【实测：二手副本】 | demo 文件里没有 Z 值，要拿到原件再核实 |

### 3.3 数据获取（M0 决定，M2 前必须到位）

- **B（推荐）**：你在本机浏览器里从 CSDI 和 data.gov.hk 下载 LandsD DTM、Building、3D Pedestrian Network，提交到 `data-raw/landsd/`。可重复构建，也不需要改环境。
- **A**：在环境网络设置里放行 portal、api、static、bulkdata.csdi.gov.hk，以及 data.gov.hk 及其文件主机（具体主机名未核实）。
- **保底**：可玩区只保留平地区 F；或者人工标注约 50 个路口的高程控制点【估，精度差】。
- 不论选哪条，CSDI 和 data.gov.hk 的条款原文都要**由你本人打开核对**，并记下版本日期。本轮这些页面都被代理拦截，只看到摘要。
- 不要直接用 shadewalk 仓库里的二手 LandsD 副本做游戏，它只用于本轮的核实。

### 3.4 管线（`tools/citymap/`，每个阶段都输出俯视 SVG 和 stats.json，供 agent 看图自查）

```
fetch/overture.py   一次性运行：pyarrow S3FileSystem，proxy 走 HTTPS_PROXY，CA 用 /root/.ccr/ca-bundle.crt；release 锁定；约 50 s【实测】
data-raw/           快照 + sources.json（ID、URL、许可、日期、条款版本、sha256）
00-snapshot   校验 sha256
01-project    WGS84 → EPSG:2326 → 减原点 → 整数分米
02-buildings  修复绕向和自交，删掉 <4 m² 的碎片，按 0.3 m 简化，补高度，删除名称，生成风格 seed
03-terrain    DTM → 2 m 高度场；路面按纵坡约束平滑；桥梁掩膜；海面 0 mPD（M2）
04-roads      有向边、oneway、禁止转向、LANE_W × ROAD_WIDTH_SCALE（默认 1.3）；放宽优先占人行道；地标不裁剪
05-lanes      左行偏移（前进车道在中心线左侧）、Bezier 转向、剪掉 U-turn 和禁止转向；
              剪到最大强连通分量，边界做出入口门户，套用 overrides/roads.ts
06-signals    信号灯按 30 m 聚类，按进口方位角分两个相位
08-props      巴士站、过路处、路灯、树、电车轨和电车站
09-landmarks  匹配并删掉原轮廓，输出摆放参数；高度强制用已核实表
10-zones      可玩区、敏感区（自动导入 military 多边形）、刷车点、任务锚点
11-pack       city.json、terrain.bin、ATTRIBUTION.txt、LICENSE-ODbL.txt；v1 起改为 256 m 分块
```

**路网连通性【复核】**：把 Overture 可驾驶路段直接建成有向图，最大强连通分量只占有向路长的 66.8%（不含 service）或 73.5%（含 service）。脚本已经处理了段内的中间 connector，但跳过了 83 条 between 分段限制和 10 段 class=unknown 道路，所以这个数只看量级。验收指标改成两条：
- **AI 车道图按构造就是 100% 强连通**；
- **可玩区内有名字的主干道（干诺道中、德辅道中、皇后大道中、毕打街、雪厂街、遮打道）至少 95% 的长度在 AI 车道图里**。玩家可以开进被剪掉的死路。

单行方向只信数据，不信记忆：geo 研究凭记忆写的花园道、荷李活道方向都写反了。

### 3.5 许可合规（M0 就做）

1. 加载页和鸣谢页写「© OpenStreetMap contributors · Overture Maps Foundation」，单独署名 CC-BY 数据；用了港府数据后，再加「Contains data from Lands Department, HKSAR Government (CSDI/DATA.GOV.HK)」。
2. ODbL 4.6：只要公开发布了由衍生数据库产出的作品，就要提供衍生数据库本身或它的生成方法【摘要：OSM 社区讨论】。做法是仓库公开 raw 快照、构建脚本和输出文件，附 `LICENSE-ODbL.txt`，不加 DRM。
3. 港府数据单独成层，不改授权、不转售、不暗示政府认可。
4. 上线前到 esearch.ipd.gov.hk 做名称检索，本轮没做。以上都不是法律意见；如果要商业化，先问香港律师。

---

## 4. 玩法范围

### 4.1 MVP 的两分钟循环

1. 在平地区出生 → 走到一辆停着或等红灯的红的**右侧**（右舵），按「上車」，把司机拉下来；司机倒地后爬起来骂人（「痴線！」）。
2. 沿德辅道中开：2–4 辆电车按轨道走、不会让路；AI 车流靠左行驶，遵守红绿灯和真实的单行路。
3. 闯红灯、撞车、撞人（倒地 1 秒后爬起，不流血）都会加风声：
   - 1 级：1 辆警车尾随；
   - 2 级：2–3 辆警车尝试包夹；
   - 3 级：前方路口设路障。
4. **脱身**：断开视线（2D 射线对建筑轮廓判断），并在搜索圈外坚持 8/12/18 秒。**落网**：4 m 内有警车，且车速低于 1.5 m/s，持续 3 秒；结果是扣钱、任务失败、淡出后重生。
5. **红的载客**：MVP 唯一的任务类型。计时，按表收费（起表价参考 HK$29【摘要，2024-07】），撞车扣小费，一单 1–3 分钟。车辆损坏到 0 时「死火冒白烟」，不做爆炸。

### 4.2 版本范围

| 系统 | MVP | v1 | v2 |
|---|---|---|---|
| 地图 | MVP 区 + 背景天际线 | v1 范围、半山一层台地、扶梯（06–10 时下行，10–24 时上行【摘要：运输署】）、天桥主干、石板街只能步行 | v2 范围 |
| 时段 | 固定入夜 | 压缩昼夜、雨、台风信号 1→3→8 | 季节活动 |
| 载具 | 轿车 + 红的皮肤 + 警车 + 电车（障碍） | 红/绿小巴（「有落」）、电单车、双层巴士、可搭电车 | 改装 |
| 交通/行人 | 模拟 60–80 辆，渲染 ≤30；行人模拟 100，渲染 ≤60 | 时段人流、巴士站 | — |
| 风声 | 1–3 级 | 1–5 级、直升机探照灯 | 警匪模式 |
| 任务 | 红的载客 | 8–10 类活动、7 章轻剧情、双主角、「人气 vs 风声」 | 每日挑战 |
| 存档/社交 | localStorage（包 try/catch）、「今晚战绩」卡片 | IndexedDB + 存档码；v1.5 异步挑战（`?c=`，因为微信会丢掉 `#` 片段【实测：commit 7e705df】） | 实时 2–4 人好友房 |

**砍掉清单**：枪械、近战、杀警、血；爆炸和火灾；驾驶飞机、船，游泳；大面积室内；拟真损坏和变速箱；授权流行曲和真实电台；全程配音；账号体系；公开 PvP。MVP 阶段另外不做：昼夜、天气、第二种任务、跑酷、天桥行走、双主角。

---

## 5. 代码架构

```
central-mini/
├─ data-raw/{overture-2026-11-18.0, landsd}/  + sources.json
├─ tools/citymap/{fetch,stages,overrides}/   tools/shots/（截图、预算、autopilot）  tools/check-licenses.ts
├─ packages/data/    city.json 和 .bin 的 schema 与 codec（管线和客户端共用，带 round-trip 测试）；店名词库、字串表
├─ packages/game/    config(DRIVE_SIDE='left', LANE_W, ROAD_WIDTH_SCALE, SIM_HZ=60)
│                    physics/{PhysicsWorld, RapierWorld, vehicleA-raycast, vehicleB-arcade}
│                    road/LaneGraph, traffic/{idm,signals,spawner,tram}, peds, player, heat, police, missions, save, rng
├─ packages/client/  loop, render/{ChunkManager, materials×4, builders/*}, camera, input/{touch,keyboard,gamepad}→InputFrame,
│                    hud（节流更新，吸取 ra2-web commit 8481a86 的教训）, audio, debug/{tune-panel, perf-hud, perf-beacon}
└─ packages/server/  静态托管 + /health；v1.5 起存挑战数据；v2 起做 relay
```

- **接口边界**：`RoadSource`、`PhysicsWorld`/`VehicleModel`、`CityRenderer`、`InputFrame`（触屏、键鼠、手柄、autopilot、鬼影回放共用）。实体状态从第一天起就要能序列化。
- **驻留**：渲染块 128 m，按块合并，每块建筑 1 个 mesh、路面 1 个 mesh；雾距 350 m；地标低模常驻；九龙对岸用 impostor 环带。物理块 64 m，只在玩家周围 150–200 m 内驻留。交通气泡 250 m。实测合并后 3000 栋楼只需 2 个 draw call，不合并是 1052 个【实测：桌面 headless】。
- **调参**：`?tune=1` 打开热调面板，可以导出 JSON 贴回给 agent 写进代码；`?perf=1` 打开性能 HUD；perf-beacon 是可选（opt-in）的匿名上报，只报 fps p50/p95、GPU 字符串和分辨率档位，用来收集试玩朋友的机型数据。

---

## 6. 里程碑与关卡

「会话」指你开一次 Claude Code、跟进 2–4 小时。所有估算都是【估】。

| 里程碑 | 交付 | 手机上能看到或做到 | 自动验收 | 估算 |
|---|---|---|---|---|
| **M0 地基 + 白模上手机** | 新仓库骨架；Overture 快照和 PoC 拷进仓库；stage 00–02、04 原始路网、10-zones、11-pack；客户端挤出 v2 范围的白模，加窗灯 shader、雾、环绕相机；署名页；部署到 Fly | 打开链接，5 秒内看到夜里的中环白模天际线；敏感区是灰色封闭体 | 投影基准 ±0.5 m；Overture 楼数 1,612±20；确定性 hash；敏感区缓冲测试；CI 绿 | 1 次会话；你：开始拿 LandsD 数据 |
| **M1 平地开车 + GATE C（手感/物理）** | Rapier 懒加载；车 A/B；平地区 F 的左行路面和标线；触屏（◀▶ 转向 + 油门/刹车/手刹 + 自动油门）、键盘、手柄；追尾镜头、高空镜头、防穿墙；热调面板和性能 HUD | 开红的绕「德辅道中 → 毕打街 → 干诺道中 → 雪厂街」一圈，不穿墙，撞墙弹开、不急停；比较 A 和 B | §7.3 手感指标；autopilot 开 60 s 不卡住、不出界；白模全城 `calls ≤150` | 1–2 次会话；你：真机调参 ≤3 轮 |
| **M2 地形 + 夜景 + GATE A（数据）+ GATE B（渲染）** | stage 03 地形；路面贴合地形；楼基底改为采样地形；决定建筑是否整层换 LandsD；招牌生成器（含文字朝向测试）；3–4 座地标 builder（IFC2、中银、中环中心、汇丰）；LOD；动态分辨率；30/60 fps 档；可玩区扩到 MVP 区 | 一条 60 s 的演示路线（干诺道中 → 皇后像广场 → 中银 → 雲咸街坡）；两种镜头都能切；车能爬坡、不翻车 | 95% 楼基底与地形差 <3 m；车道上每 2 m 相邻采样高差 ≤0.3 m；golden 截图 3 张；15 个机位的预算断言 | 2–3 次会话；你：2 轮真机测试 |
| **M3 交通 + 电车** | stage 05–06；LaneGraph、IDM、信号灯、交通气泡；被撞的车从 kinematic 转 dynamic；德辅道中电车 | 在靠左行驶、会等红灯的车流里穿行；电车叮叮驶过 | §3.4 的两个连通指标；80 辆车无头跑 10 分钟，没有永久堵死、没有车辆重叠；5 个指定路口的 SVG 由你目视确认 | 2–3 次会话 |
| **M4 步行、抢车、行人** | 角色控制器；积木人（v1 再换 CC0 骨骼动画）；右门上下车；抢车；行人闪避和倒地；约 10 句粤语字幕 | 下车走路，把司机拉出来，抢走红的 | 能上 0.35 m 台阶和 30° 坡，上不了 0.6 m 墙；行人 ≤3 个 draw call | 2 次会话 |
| **M5 风声与警察** | 风声状态机；尾随、包夹、路障；视线判断；落网和脱身；敏感区规则 | 闯红灯引来警车，然后甩掉或被围停 | 状态机覆盖升级、衰减、脱身、落网；警车 A* ≤1 ms | 1–2 次会话 |
| **M6 = MVP** | 红的任务（DSL 里的第一个任务）；原创 HUD；手机菜单和示意风格小地图；程序音频；存档；PWA；鸣谢和 ODbL 页；繁简切换 | 4G 下点开 ≤15 s 就在开车；一局约 10 分钟 | 一单 ≤3 分钟能完成；风声 1–3 级都能触发、都能甩掉 | 2 次会话 + 1 周外部试玩 |

**关卡和退路**：
- **GATE C（M1）**：你在 ≤3 轮调参内选出 A 或 B，并认为好玩。不过关就依次尝试：Rapier 只管碰撞、车辆运动学自写 → 零 wasm 的自写街机车。
- **GATE A（M2）**：拿到 LandsD DTM，并且读过条款原文。不过关就把 MVP 可玩区留在平地区 F。
- **GATE B（M2）**：真机 iPhone 加中端 Android，30 fps 档下帧时间 p95 ≤40 ms，draw call ≤150，连续跑 10 分钟不重载。不过关就依次：雾距 350 m 降到 250 m → 近景细节半径从 150 m 缩到 100 m → 默认改用高空镜头 → 退到俯视 2.5D（数据层和模拟层不动，只换 `CityRenderer`）。
- **试玩门槛（M6）**：5 位朋友里每人都主动玩 3 单以上。不达标就回 M1–M5 调手感，不扩图。

**v1**（每项约 2–4 次会话）：M7 扩到 v1 范围（只改 playable 多边形，正好检验底座能不能直接扩图）+ 扶梯和天桥 → M8 昼夜、雨、风球 → M9 车型和风声 4–5 级 → M10 活动、剧情、人气 → M11 异步挑战。**v2**：实时好友房，评估 WebGPU。

**合计【估】**：MVP 11–15 次会话，加上你 15–25 小时，按晚上推进约 4–6 周；第 2–3 次会话就能开上车。

---

## 7. 预算与测试

### 7.1 下载预算（gzip）

| 项 | 预算 | 依据 |
|---|---|---|
| three + 游戏 JS | ≤400 KB | three 最小场景 130 KB【实测】，其余【估】 |
| Rapier wasm + 胶水 | 约 1.24 MB（懒加载，先显示城市） | 1,187.63 + 51.98 kB【实测】 |
| city.json + terrain.bin | MVP ≤1 MB；v1 ≤2 MB | 建筑 51–109 KB、路网 60 KB【实测】；2 m 高度场原始约 1.1 MB，压缩后体积【未测】 |
| 字体 + 音频 + 少量 glb | ≤1 MB | 【估】 |
| **合计** | **≤4 MB，4G 下点开 ≤15 s 就在开车** | PWA 缓存 |

### 7.2 运行预算（来自经验值，M1/M2 用真机校准）

| 档 | 代表机型 | DPR | fps | calls | 可见三角形 | 纹理 | 阴影 |
|---|---|---|---|---|---|---|---|
| 低 | iPhone 11、2021 年中低端 Android | 1.0，动态 0.6–1.0 | 30 | ≤100 | ≤150k | ≤64 MB | 只用 blob |
| 中 | iPhone 12–14、骁龙 7 系 | ≤1.5 | 30（可选 60） | ≤150 | ≤300k | ≤128 MB | blob |
| 高 | 2023 年以后的旗舰、桌面 | 2 | 60 | ≤300 | ≤800k | ≤256 MB | 2048 跟随 shadow map |

- 总内存（JS heap + wasm + GPU）≤300 MB；iOS 有 canvas 256 MB 和 384 MB 上限的报告，以及 WebKit bug 300782【摘要】。
- 动态分辨率：连续 2 s 帧时间超过 36 ms 就降一档；连续 5 s 低于 28 ms 再升回。
- 低档和中档不开 bloom（PoC 调好的参数是强度 0.55、阈值 0.88）。

### 7.3 手感初始指标（统一两份草案；可调的初始区间，不是定稿）

- 0→100 km/h 用时 5–8 s；最高速 ≤30 m/s；100→0 km/h 刹停 ≤35 m；低速最小转弯半径 ≤6 m。
- 以 40 m/s 撞楼不穿透；翻车后 3 s 内自动扶正；M2 起，在 15% 坡上能起步、不翻车。

### 7.4 测试金字塔

1. **Vitest：管线**。不变量、黄金统计、确定性 hash、连通指标、敏感区断言、codec round-trip。
2. **Vitest：模拟**。LaneGraph、IDM、信号灯、风声、任务 DSL、存档、左行偏移的符号（北行车道的 x 小于中心线）。
3. **Vitest + Rapier（Node）**：手感指标，防止 AI 改参数时把手感悄悄改坏。
4. **Playwright + SwiftShader**：固定机位 golden 截图、builder 转台图、招牌朝向、`renderer.info` 预算断言、资源不增长（查泄漏）、console 出现 error 即判失败。
5. **autopilot**：开车 60 s、步行 30 s，不掉出世界、卡住不超过 3 s。
6. **真机**：perf HUD 加可选上报。SwiftShader 是 CPU 光栅化，它的 fps 不能当结论【实测】。

截图自检确实能抓到 bug：本轮复核 PoC 的 `desktop-street.png`，发现直排招牌「鴻福金行」左右镜像了【复核】。

---

## 8. 风险与对策

| 风险 | 对策 |
|---|---|
| 地形数据拿不到，或条款不清 | M0 就决定获取路线（默认由你本机下载）；GATE A 不过就退回平地区 F |
| 可玩区挨着军营、军用码头 | 自动导入 military 多边形，可玩区留 ≥100 m 缓冲；东界定在约 114.1612 |
| 路网不连通（朴素导入只有 67–74%） | 剪到最大强连通分量、边界门户、override 表，并用新的两条指标验收 |
| 手感不好玩 | A/B 两种车 + 热调面板 + 数值测试 + 试玩门槛 |
| 手机性能、iOS 内存 | 合批、雾、30 fps、动态分辨率、关 bloom；10 分钟长跑测试；GATE B 的退路链 |
| iOS 限制：不能锁横屏，iPhone 不能全屏【摘要】 | 竖屏时提示旋转；AudioContext 在第一次触摸后 resume |
| GTA 商标和观感、地标、品牌 | §1 红线；构建期名称黑名单；上线前做商标检索 |
| 敏感题材和时机 | §1 红线；宣传避开 11-26 前后和竹棚、火灾意象 |
| ODbL 和港府条款冲突 | 每层只用一个来源；高程单独成层；按 ODbL 4.6 公开衍生数据和生成方法 |
| 素材许可变化（据报 Quaternius 已改用 QAL【摘要】） | `assets/LICENSES.json` + CI 校验，只收 CC0/CC-BY |
| scratchpad 被清理 | 现在就把快照和 PoC 拷到持久位置；最坏情况重新抽取，约 50 s |
| 范围失控 | MVP 硬上限：1 种车、1 种任务、只有入夜、约 0.8 km²；新想法一律记进 v1 待办 |
| 内地分发：版号，小地图可能需要审图号【未核实】 | 只做网页、海外托管，小地图做成示意风格 |

---

## 9. 需要你拍板的事（详见 decisions 列表）

1. 地形和建筑数据怎么拿（最急，M2 前必须到位）
2. 平台和地区
3. 暴力尺度
4. 镜头默认（M2 在真机上定）
5. 物理 A/B（M1 在真机上选）
6. 地标命名
7. 商业化
8. 仓库公开与否
9. 最低机型和你手上的真机
10. 时代设定
11. 粤语配音
12. 联机节奏
13. 要不要现在就把调研产物拷到持久位置

---

## 附：调研产物（都在 scratchpad 里，可能被清理）

- Overture 快照：`/tmp/claude-0/-home-user-ra2-web/f2349f81-850c-5ad8-b687-d0941aeafa41/scratchpad/research/osm/`
- 抽取脚本：`/tmp/claude-0/-home-user-ra2-web/f2349f81-850c-5ad8-b687-d0941aeafa41/scratchpad/research/scripts/overture_fetch.py`
- 美术 PoC：`/tmp/claude-0/-home-user-ra2-web/f2349f81-850c-5ad8-b687-d0941aeafa41/scratchpad/research/poc/scene.js`
- 截图：`/tmp/claude-0/-home-user-ra2-web/f2349f81-850c-5ad8-b687-d0941aeafa41/scratchpad/research/shots/`
- Rapier 基准：`/tmp/claude-0/-home-user-ra2-web/f2349f81-850c-5ad8-b687-d0941aeafa41/scratchpad/research/webgl-test/rapier-bench.cjs`
- 强连通分析脚本：`/tmp/claude-0/-home-user-ra2-web/f2349f81-850c-5ad8-b687-d0941aeafa41/scratchpad/research/plan-check/scc.mjs`
- 本轮复核脚本（地形分布、军事用地定位）：`/tmp/claude-0/-home-user-ra2-web/f2349f81-850c-5ad8-b687-d0941aeafa41/scratchpad/research/judge/terrain.py`、`/tmp/claude-0/-home-user-ra2-web/f2349f81-850c-5ad8-b687-d0941aeafa41/scratchpad/research/judge/terrain2.py`、`/tmp/claude-0/-home-user-ra2-web/f2349f81-850c-5ad8-b687-d0941aeafa41/scratchpad/research/judge/mil.py`
