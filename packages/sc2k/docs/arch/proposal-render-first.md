# 架构提案（视角：render-first）——网页版 SimCity 2000 复刻 `packages/sc2k`

> 立场：画面即产品。等距像素、四向旋转、五档缩放、海拔与地下视图、60 fps、程序化精灵与玩家本地 DAT 的热切换，这些决定了渲染层与 UI 的骨架，模拟层则被设计成"喂给渲染器的纯数据 + 严格日程"。
> 依据：`docs/spec/*.md` 十份领域规格（数值与公式以它们为准，本文不重复），仓库约定 `CONTRIBUTING.md` / `tsconfig.base.json` / `eslint.config.js`。
> 读者：之后并行实现各工作包（WP）的工程师 / agent。§9 的契约代码是各 WP 之间唯一的接口。

## 0. 五条设计原则

1. **数据永不旋转、永不缩放**：`CityState` 的类型化数组与 `.SC2` 逐字节同布局（x 主序 `i = x*128 + y`）；旋转/缩放只发生在"场景编译"阶段。
2. **渲染 = 纯函数布局 + 提交后端**：`SceneCompiler`（无 DOM、可 vitest）把地块变成 `SceneItem[]`；`PixiBackend` 把它们变成精灵，`CpuCompositor` 把它们变成像素快照。两套后端共享同一布局，像素级验收不需要 GPU。
3. **不烘焙、靠批处理**：不用 RenderTexture 分块缓存（内存与遮挡伪影都不可控），而是 16 条**深度带** RenderGroup 承载 ≈3.5 万个静态精灵，GPU 一帧画完；改一格只重建一条带的指令集。
4. **地块动画零结构变化**：水面、火、断电闪烁、车流、调色板循环全部通过"稳定 `Texture` 句柄 + 原地上传"实现，精灵树不增删不换纹理。
5. **模拟是可重放的纯 TS**：单一种子 PRNG、`DAY_PHASES` 唯一日程、命令日志；状态哈希相等是集成的验收标准。

---

## 1. 包布局

```
packages/sc2k/
├─ package.json            name "sc2k"，private；不 import 任何 @ra2web/*，可整体拆出成独立仓库
├─ index.html              单页：<div id="app"> + <canvas> 由 render 层挂载；viewport meta user-scalable=no
├─ vite.config.ts          base './'、target es2022、server.port 5174、worker { format:'es' }、无代理插件
├─ tsconfig.json           extends ../../tsconfig.base.json；lib ES2022+DOM；include src scripts test
├─ tsconfig.sim.json       同上但 lib 仅 ES2022、include src/contracts src/data src/sim src/art src/io/sc2 src/io/sprites src/io/palette
│                          ——"纯 TS 无 DOM"用编译器强制，而不是靠约定
├─ src/
│  ├─ contracts/           §9 的共享契约：类型、常量、纯函数（tiles / rotation / prng 接口 / events / commands / render / env）。只读，改动需全员同意
│  ├─ data/                256 项 BuildingDef、ToolDef、COST_TABLE、TECH_BASE_YEAR、ORDINANCES、PIECE 表（来自 building-catalogue.md）
│  ├─ sim/                 纯 TS、无 DOM、无 Math.random / Date
│  │  ├─ core/             clock、dayPhases 调度器、prng 实现、CityState 工厂、hashCity、DirtyTracker、CommandRouter
│  │  ├─ terrain/  utilities/  transport/  zones/  services/  economy/  disasters/（含 weather/tech/news/things/scenario）
│  ├─ io/                  sc2/（IFF、RLE、读写、MISC 访问器、mapping）sprites/ palette/ text/ import/（DOM：文件选择、IndexedDB、Worker）
│  ├─ art/                 palette.ts、raster.ts、recipes/、gen*.ts、ProceduralProvider
│  ├─ render/              projection、scene（编译器）、atlas（页管理 + animPage）、bands（Pixi 深度带）、camera、picking、animation、cpu（软件合成器）、minimap
│  ├─ ui/                  dom.ts（h()）、theme.css、windows/、toolbar/、menus/、dialogs/、status/、query/、tools/（ToolController）、input/（鼠标 / 键盘 / 触控）
│  ├─ app/                 bootstrap、GameSession（装配 sim+render+ui）、save/load、title screen、settings
│  └─ main.ts
├─ test/                   集成测试：determinism、longrun、roundtrip、scene-snapshot
├─ scripts/                art-preview.ts（contact sheet）、smoke.mjs（Playwright）
└─ docs/                   spec/ arch/ art-preview/（gitignore）
```

`package.json` 脚本（根 `pnpm -r` 会递归调用 dev/build/typecheck；测试由根 `vitest run` 统一收集 `packages/*/src/**/*.test.ts`，所以本包测试放 `src/**/*.test.ts`，集成测试文件也放在 `src/__integration__/`）：

```json
{ "name": "sc2k", "private": true, "type": "module",
  "scripts": { "dev": "vite --port 5174", "build": "vite build", "preview": "vite preview --port 5174",
               "typecheck": "tsc --noEmit -p tsconfig.json && tsc --noEmit -p tsconfig.sim.json",
               "art:preview": "tsx scripts/art-preview.ts", "smoke": "node scripts/smoke.mjs" },
  "dependencies": { "pixi.js": "^8.6.0" },
  "devDependencies": { "vite": "^7.0.0", "@types/node": "^22.10.0", "playwright": "^1.48.0" } }
```

Vite 要点：`build.target: 'es2022'`；`worker.format: 'es'`（解码 Worker 用 `new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' })`）；不开启 COOP/COEP（不依赖 SharedArrayBuffer）；`optimizeDeps.include: ['pixi.js']`；**不使用路径别名**——规格里写的 `@sc2k/contracts` 一律指 `src/contracts`，用相对路径 import（避免改根 vitest 配置）。

需要在仓库根做的唯一改动（WP0 负责，一处）：`eslint.config.js` 追加一段与 `packages/game` 相同的确定性规则，`files: ['packages/sc2k/src/{sim,contracts,data,art,io/sc2}/**/*.ts']`。

---

## 2. 核心数据模型

### 2.1 `CityState`：与存档同构的层 + 各模块公开状态

| 层 | 类型 | 尺寸 | 索引 | 写者 |
|---|---|---|---|---|
| `alt / waterLevel / tunnel` | `Uint8Array` | 16384 | `tileIndex(x,y) = x*128+y` | terrain（由 `ALTM` 拆位） |
| `xter xbld xzon xund xtxt xbit` | `Uint8Array` | 16384 | 同上 | 按 `XBIT` 位 / `XBLD` 区段分工（见各规格） |
| `xtrf xplt xval xcrm` | `Uint8Array` | 4096 | `halfIndex(x,y) = (x>>1)*64 + (y>>1)` | services（`xtrf` 经 `addTraffic` 累加） |
| `xplc xfir xpop xrog` | `Uint8Array` | 1024 | `quarterIndex(x,y) = (x>>2)*32 + (y>>2)` | services |
| `xlab xmic xthg xgrp` | `Uint8Array ×3`, `Int32Array` | 6400 / 1200 / 480 / 832 | 记录序 | services / disasters / economy |
| `marker` | `Uint8Array` | 16384 | tile | disasters（运行时，写档合成进 `XTXT`） |
| `rawMisc` | `Int32Array` | 1200 | 字节偏移 >> 2 | io（导入底稿，只读；导出时未知偏移原值写回） |

模块公开状态（`CityState.terrain / utilities / transport / zones / services / economy / disasters / weather / tech / news / scenario / clock`）的字段以各规格 §3.1 为准，契约只固定"渲染与 UI 要读的"子集（§9.2）。派生索引不入存档、读档后 `rebuild()`：

- **建筑实例**：`anchorOf: Int32Array(16384)`（tile → 世界锚格 = 占地最小 x、最小 y 的格，由 `XZON` TL 位 `0x40` + `FOOTPRINT[id]` 推出；非建筑格为 −1）。渲染器只依赖这一张表 + `FOOTPRINT`，不依赖任何模块的 lot/station/plant 表。
- 分区 lot 计时器、车站 / 桥 / 隧道 / 电厂实例、`stationOf / hwyBlockOf / bridgeOf`、`navRegion`、`cityCenter`、`trafficReport`：各模块私有，读档重建（各规格已定义）。
- 低分辨率图层：直接就是 64²/32² 数组，渲染层的热力图按 `halfIndex/quarterIndex` 取值着色，不另做副本。
- 经济与统计：`EconomyState`（funds、税率、经费率、法令位、债券、12 月环形历史）与 `XGRP` 16 条序列。

### 2.2 `DirtyTracker`：模拟 → 渲染的唯一通道

```ts
tiles: Uint8Array(16384) 位图 + list: Int32Array(16384) 去重列表（O(1) 追加）
bulk: { powered, watered, dataMaps, markers, things, view }   // 整层重建标志
```

所有写地块的 API（`placeTiles / destroyStructure / recomputeTerrainTile / setZone / addTraffic`…）在写完后 `dirty.mark(i)`；整体重建型阶段（powerScan、waterScan、dataMaps、trafficDecay）置 `bulk.*`。渲染器每帧消费一次并清空。

### 2.3 序列化

- **唯一存档格式就是 `.SC2`**（`file-formats.md`），本项目扩展只用原版恒为零的区间：`MISC 0x1054/0x1058` PRNG 标志与状态、`0x10BC..0x12BB` `xtxtShadow` 侧表。因此"自有存档"与"导出给原版"是同一字节流；不做第二格式。
- 视图状态（缩放、旋转、中心、显示开关、速度）写 `MISC 0x0008/0x1014/0x1018/0x101C/0x0FEC`；窗口布局等纯 UI 偏好走 `localStorage`。
- IndexedDB `saves` 库附带缩略图（§4.9 的 CPU 合成器生成 256×128 PNG）与元数据。
- 导入顺序固定为 `file-formats.md` §3.4.2 的 10 步；导出前 `disasters.composeXtxt()`、`things.writeRecords()`、`economy` 回填预算块、`io.exportCity()` 重算派生计数。
- `hashCity(state)`：FNV-1a 依次吞入全部层（含 `marker`）、`rawMisc` 以外的模块公开标量（按固定键序）、`prng.state()`；是确定性测试与联机对账（将来）的凭据。

---

## 3. 模拟调度

- **tick = 1 天**；1 月 25 天、1 年 300 天；日程 = `economy-budget.md` §2.3 的 `DAY_PHASES`（本文 §9.3 原样收录为契约常量）。各系统只声明"我参与哪些阶段"，调度器按表内行序调用；同日多阶段可被模态框挂起（`phaseCursor`）。
- **频率一览**（每月）：电力 1 次（d1）、八张图层 1 次（d2）、生长 / 交通出行 / 港口机场军事生长 / 交通衰败 16 次子步（d3–18，每格恰一次）、交通衰减 1 次（d19）、供水 1 次（d20）、人口 / 需求 / 人口学 / 图表 1 次（d21）、里程碑 / 情景 / 破产 1 次（d22）、天气 + 灾害判定 + 诉求 + 报纸 1 次（d24）、结算与年初序列（d0）。灾害模式下日历停摆，`disasterTick()` 按独立的灾害 tick 节奏推进；常驻物件 `things.step()` 两种模式都跑。
- **主线程、预算切片**：`GameLoop.frame(dt)`：① `sim.advance(dt, budgetMs = 6)`（按速度档把真实时间换算成待推进天数，逐天 `advanceDay()`，超过 6 ms 或遇挂起即停，余量带到下一帧）；② 渲染消费 `dirty`；③ UI 节流刷新。African Swallow 的上限由预算而非固定天数决定（`maxDaysPerFrame = 10` 仍作硬顶）。放到 Worker 的升级路径保留（sim 已无 DOM；SharedArrayBuffer 需 COOP/COEP，v1 不做）。
- **PRNG 约定**（`economy-budget.md` §2.13）：`createPrng(seed)` mulberry32；`sim` 流唯一且随存档持久化；地形生成 `terrain` 流、刷子 `brush` 流（`hash32(sim.state(), age, x, y, stroke)` 派生，不推进 sim）、程序化美术 `hashNoise`、UI 装饰 `ui` 流互不触碰。预览类计算（费用、NIMBY 提示、债券利率预览）禁止消费 `sim`。每个阶段 / 命令内部遍历顺序固定并写在其规格里。
- **性能预算（128×128，每月）**：
  - `powerScan` / `waterScan`：两遍 BFS，O(16384)，预分配队列，≈0.3–0.8 ms。
  - `dataMaps`：污染源 + 扩散 + 地价 + 覆盖图案 + 犯罪，约 6 遍 64²/32² 与 1 遍 128²，≈1–2 ms。
  - `growthScan` 单日：1024 格访问 × （24 偏移可达 + 出行 ≤100 步 × ≤4 试 + 掷骰），≈0.5–1.5 ms；16 天合计 ≈ 15 ms。
  - `census/demand/demographics/graphs`：O(16384) + 常数，<1 ms。
  - 一个游戏月 CPU 总计 ≈ 20–30 ms；Llama（4 s/月）占用 <1%，Swallow 由 6 ms/帧预算封顶，每帧约 4–8 天。
  - 灾害 tick：火场 ≤ 2000 格 × 8 邻 ≈ 0.2 ms；物件 ≤ 39。
- **事件**：系统把 `SimEvent` 推进 `ctx.events`（§9.4），调度器在每个 `advanceDay()` 末尾一次性派发；UI 对 `monthTick` 之外的高频事件（`funds`）节流到每帧一次。

---

## 4. 渲染

### 4.1 技术选型：PixiJS v8（WebGL2，WebGPU 自动），不选 Canvas2D

可见地块数（1920×1080 逻辑像素，地块屏幕面积 = `tileW×tileH/2`）：XS 16 px² → 全图 16384；S 64 px² → 全图；M 256 px² → ≈8,100；L 1,024 px² → ≈2,025；XL 4,096 px² → ≈506。全图静态精灵估算：地形 16,384 + 边缘岩壁 254 + 水面（海岸图约 25%）≈4,000 + 地面物（树 / 路网 / 建筑 / 分区底色）≈12,000 + 覆盖物 ≈1,000 → **≈3.4 万，峰值 4 万**。

| 方案 | 每帧成本（M 档、半图可见） | 结论 |
|---|---|---|
| Canvas2D 直绘 | ≈8,100 格 × 2.5 次 `drawImage` ≈ 2 万次 × 1–3 µs = 20–60 ms | 60 fps 不可能；要想可用必须自建分块缓存 + 脏矩形，等于手写渲染器 |
| Pixi + RenderTexture 分块缓存 | 64 块各一张 RT：M 档 ≈ 64 × 512×400 ≈ 13 MP（52 MB），L 档 ×4 ≈ 210 MB，XL 不可行；多格建筑跨块时与同深度相邻块存在画家序伪影（分析见 §4.4） | 内存与正确性都不可控 |
| **Pixi 深度带 RenderGroup（本文）** | 16 个 `Container({ isRenderGroup: true })`，静态时指令集不重建、CPU ≈ 0；GPU 画 4 万四边形（16 万顶点）≈ 1 ms；图集 ≤ 6 张源纹理 ⇒ 每带 1–2 个批 ⇒ 全帧 ≤ 40 次 draw call | 60 fps 有 10× 余量，桌面与移动皆可 |

Pixi 已在仓库 `client` 中使用（`^8.6.0`），复用版本；初始化：`await app.init({ preference: 'webgl', antialias: false, resolution: 1, roundPixels: true, backgroundAlpha: 1, powerPreference: 'high-performance' })`；所有 `TextureSource.scaleMode = 'nearest'`；HiDPI 用整数 `backingScale = max(1, floor(devicePixelRatio))` 作舞台缩放并把 canvas 背板放大同倍（像素风由整数最近邻保证，不用 `resolution` 小数）；`stage.eventMode = 'none'`（拾取自己算，不让 Pixi 对 4 万精灵做命中测试）。

### 4.2 投影、海拔、旋转

- 常量取 `ui-art.md` §3.1 `ZOOM_TABLE`（XS 8×4/3、S 16×8/6、M 32×16/12、L 64×32/24、XL 128×64/48）。`S = tileW/2`；旋转后坐标 `(rx, ry)`；`sx = ox + (rx − ry)·S`，`sy = oy + (rx + ry)·S/2 − h·LEVEL`。
- 旋转 = `rotateTile(x, y, r)`（逆时针 1 次 `(x,y)→(y,127−x)`）+ 瓦片码置换：`SLOPE_ROT_CCW`、`XTER_STREAM_ROT_CCW`、网络四向环（基址 0x0E/0x1D/0x2C 的 `+2→+5→+4→+3`、`+6→+9→+8→+7`、`+10→+13→+12→+11`、直线 `+0↔+1`）、铁路半高、隧道口、交叉件、高速、地铁↔铁路、水电 `0xC6↔0xC7`、`XUND`；`drawFlip = (xbit & Flipped) ≠ 0 XOR (rotation & 1)` 只给翻转族。这些常量**只存在于 `src/contracts/rotation.ts` 一份**（terrain 模块 re-export），`ui-art.md` §3.3 是其文档。
- 角点重命名 `c10→c00', c11→c10', c01→c11', c00→c01'`；地块精灵锚点 = 以最低角海拔为基准的菱形底顶点（程序化）或 `(w/2, h−1)`（DAT，含 1 行重叠行）。
- 地图朝向观者的两边（旋转后 `rx==127` 或 `ry==127`）加 `EdgeWall` 项，高度 `alt·LEVEL`。
- 水面高度：水下 `0x1X` 的整块水面画在 `h = waterLevel`；岸边 `0x2X` / 浅水 `0x3X` / 溪流 / 瀑布画在地块基准 `alt`（形状精灵自身包含抬高角的留白）。导入 DAT 后用 1256/1270 实机校正，常量 `WATER_SURFACE_AT_LEVEL` 可切换。

### 4.3 场景编译器（纯函数，渲染的真源）

```
compileTile(snap, i, out):                      // 每格 ≤ 5 项；全图 ≈ 3.5 万项
  (x,y) = tileXY(i); (rx,ry) = rotate(x,y,rot); depth = rx+ry; base = alt[i]
  emit Terrain  { key: snap.underground ? terrainUnderground(slopeRot) : terrain(slopeRot, altBand, variant=hash(x,y)&3), h: base }
  if rx==127 || ry==127: emit EdgeWall(side, levels = base)
  if !underground && isWater(i): emit Water { key: water(shapeRot, depthBand), h: per §4.2, anim: 'water' }
  if underground: emit Ground { key: xund(pipe/subway rotated, watered variant) } ; building 格画短管桩; return
  if show.zones && xzon.zone && xbld < 0x70: emit ZoneTint(zone)
  id = xbld[i]
  if 0x01 <= id < 0x70 || (0x70 <= id && FOOTPRINT[id] == 1 && show.buildings): emit Ground { key: xbld(rotateId(id, rot)), flip: drawFlip }
  else if id >= 0x70 && FOOTPRINT[id] > 1 && show.buildings && renderAnchor(anchorOf[i], FOOTPRINT[id], rot) == i:
       emit Structure { key: xbld(id), footprintBottom: screenOf(i).bottomVertex, depth, flip }
  if id >= 0x70 && (xbit & Powerable) && !(xbit & Powered): emit Overlay(noPower, anim 'blink')
  if road/highway/causeway && xtrf[half] >= lightLevel: emit Overlay(traffic light|heavy, anim 'traffic')
  if marker[i]: emit Marker(fire|flood|riot|toxic, anim)
  if show.signs && xtxt ∈ 0x01..0x32 ∪ {0xFA}: emit Overlay(sign) 并登记 DOM 标签
```

`renderAnchor(origin, s, rot)` = 旋转后 `rx+ry` 最大的占地格：rot0 `(x0+s−1, y0+s−1)`、rot1 `(x0, y0+s−1)`、rot2 `(x0, y0)`、rot3 `(x0+s−1, y0)`。每项带排序键 `zKey = depth·2^12 + rx·2^4 + layer`（layer：Terrain 0 < EdgeWall 1 < Water 2 < ZoneTint 3 < Ground 4 < Structure 5 < Overlay 6 < Marker 7 < Actor 8）。地块编译只读本格（+ `anchorOf`），所以脏更新按格局部重算，不需要邻居传播（邻居相关的 `xter` 形状由模拟层维护）。

### 4.4 深度带（bands）与绘制顺序

- 旋转后深度 `d = rx + ry ∈ [0, 254]`，带 `b = d >> 4`（16 条）。每条带是一个 `Container({ isRenderGroup: true })`，子精灵按 `zKey` **二分插入**（不用 `sortableChildren` 每帧排序）。带之间严格前后有序、没有"同深度的相邻块"，因此画家序与原版逐行绘制**完全相同**。
- 为什么不是 16×16 菱形块：块按 `(cx+cy)` 排序时同深度的两块谁先谁后都会出错——跨块的 3×3/4×4 建筑的上半身会被后画的相邻块里"位于建筑后方"的地形盖住；1×1 物件没有这个问题，但多格建筑必然出现在块边界。带把排序维度压成一维，问题消失。
- 带的屏幕 y 范围已知（`[16b, 16b+15]·S/2` 减去最大海拔偏移与最大精灵高度），每帧只做 16 次区间判断设 `visible`；水平方向交给 GPU（4 万四边形不值得逐个裁剪）。
- 多格建筑精灵挂在其渲染锚格所在带，高出带的部分自然向上伸出（没有 RT 就没有裁剪）。
- 地下视图是**第二套 16 条带**（首次切换时懒构建，之后 `visible` 切换，瞬时）。
- 分层根节点顺序：`groundRoot(16 bands)` → `undergroundRoot(16 bands)` → `heatOverlay`（可选，16384 个带 `tint` 的菱形精灵，一个 RenderGroup，默认不可见）→ `previewLayer`（工具预览菱形 + 光标）→ `airLayer`（飞机 / 直升机 / 龙卷风顶部：永远在最上）→ DOM 标牌层。货船 / 列车 / 怪兽 / 调度单位 / 爆炸等地面物件**插进带里**按深度参与遮挡：每帧只改 `x/y`（不触发指令重建），深度键跨过邻居时才重排（结构变化，≈0.5 ms/带，每秒几次）。

### 4.5 脏更新、旋转、缩放、显示开关

| 变化 | 做法 | 成本 |
|---|---|---|
| 单格 / 少量格（放置、生长、推土、灾害标记） | 消费 `dirty.list`：重编译该格，diff 旧项（每格持有 `SpriteHandle[]`），复用精灵对象改 `texture/x/y/zKey`，必要时在带内移动 | 每格 ≈ 5 µs；一次 Rect 分区 1,000 格 ≈ 5 ms + ≤16 带指令重建 |
| `bulk.powered / watered / markers / dataMaps` | 只扫受影响项：断电图标遍历建筑格；通水变体遍历地下项；热力图改 `tint` | 16384 次比较，<1 ms |
| 旋转 | 全量重编译 3.5 万项 + 重新分带 + 重排 | ≈35–50 ms，一次掉帧，原版亦为瞬切；按带分 2 帧提交可消除 |
| 缩放到**有原生美术**的档（procedural S/M/L，DAT XS/S/M） | 同旋转（纹理与位置都变） | 同上 |
| 缩放到**派生档**（DAT 的 L/XL、procedural 的 XL） | 不重建：`worldRoot.scale = k ∈ {2,4}`，最近邻采样，与逐精灵整数放大结果逐像素相同 | 0 |
| 地下切换 / 显示开关 | `visible` 切换；开关 Zones/Signs/Buildings 需重编译受影响项（Buildings 影响 ≈1.2 万项 ≈ 15 ms） | ≤ 15 ms |
| 相机平移 | 改根容器位置（整数像素） | 0 |

### 4.6 纹理管线：索引色 → 图集页 → 稳定句柄

```
SpriteProvider (procedural | dat) ──bitmap(key, scale)──▶ IndexedBitmap(8bit 索引, anchor, cycling)
   └─ resolve 回退序：DAT 原生 → DAT 整数放大 → procedural 原生 → procedural 派生 → 洋红占位（ui-art §3.4）
AtlasManager
   ├─ staticPages: 2048² RGBA（当前调色板 LUT 烘焙），按 (scale) 分组，首次可见时打包上传，不可变
   ├─ animPage: 1024² RGBA，容纳所有"地块绑定动画"的当前帧：水面 21 形 × 深度档、瀑布、车流 2 档、火 / 洪 / 毒云 / 暴民、断电闪电、循环色灯光；
   │            每个动画 tick 把目标帧（或重算 LUT 后的同一帧）blit 进 CPU 侧缓冲，再 source.update() 整页上传（1 MB，≤ 8 次/s）
   ├─ Texture 句柄对 (key, scale) 稳定：精灵永不换 texture；换帧 = 改页内容
   └─ 调色板循环：procedural 走 Palette.cycles（160–191 三组）；DAT 走 FAST_GROUPS/SLOW_PAIRS（file-formats §2.7），每 fastTick 重算 animPage 内含循环索引的位图；含循环索引的 DAT 建筑最多登记 64 张，超出则该建筑按静态显示并记诊断
```

- 每条带内可能出现的源纹理 ≤ 6（≤ 4 张静态页 + animPage + 占位），低于 Pixi 批处理的 16 张上限 ⇒ 一条带一个批。
- 内存：procedural L 全集 ≈ 9 MP → 3 页；M、S 各 1 页；DAT M ≈ 1 页。VRAM 峰值 ≈ 64 MB，按需生成后常态 ≈ 25 MB。
- 热切换美术来源：`AtlasManager.setProvider(chain)` 释放页、清句柄缓存、触发全量重建（≈50 ms）。导入 DAT 后 procedural 回退项也取 M 再 ×2/×4（`mixedDensity=false`），保证同屏像素密度一致。

### 4.7 动画时钟

独立于模拟速度的 `AnimationClock`：fps 组 2/3/4/6/8/10 各自相位（同类同步，原版观感）；调色板 `fastTick = 125 ms`、慢速每 8 个快 tick；暂停时水面与灯光继续、车流与物件停止；XS/S 档关闭颜色循环与高光（不可辨）。Auto-Goto / Centering 为 400 ms ease-out 平移，缩放旋转无过渡。

### 4.8 拾取、预览、标牌

- `pick(px, py)` 按 `ui-art.md` §3.1：从高海拔到低逐级反解 `(rx, ry)`，用四个带海拔的屏幕顶点做点内测试；只按地面拾取（高楼上半部点到后面的格，原版行为）。O(32) 次常数运算，可每次 pointermove 调用。
- `previewLayer`：`setPreview(items)` 接收 ToolController 算好的 `{tile, ok}` 列表，画 `previewOk/previewBad` 菱形（绿 / 红 50% 抖动）与多格建筑的半透明剪影（`alpha=0.6` 的目标精灵）。
- 标牌文字用绝对定位 DOM 元素，相机变化时按 `worldToScreen` 批量重排（≤ 50 + 连接牌）。

### 4.9 CPU 合成器与像素验收

`CpuCompositor.render(items, provider, scale, rect) → IndexedBitmap`：按 `zKey` 排序后以"索引 0 透明"blit，输出索引色位图；`toRgba(palette)` 得 PNG。用途：(a) vitest 像素快照——`ui-art.md` §3.3 的旋转用例（`(10,10) XTER=0x01` 与 `(12,10)` 道路 `0x1F` 旋转 0/1/2 次抬高边分别在右上 / 左上 / 左下）、§2.9.3 的翻转位用例、多格建筑锚点用例，都在 Node 里跑，不需要 WebGL；(b) 存档缩略图与分享图；(c) 新建城市时的首帧占位。它与 Pixi 后端消费同一 `SceneItem[]`，差异只在 blit 实现，因此 Pixi 侧的回归可由 CPU 侧快照兜底。

---

## 5. UI

- **技术**：原生 DOM + CSS，零框架。`ui/dom.ts` 提供 `h(tag, props, ...children)` 与 `bind(store, selector, render)`；`theme.css` 用 CSS 变量复刻 90 年代斜面窗口（`--face/--light/--dark/--shadow` 四色 2 px 斜面、标题栏渐变、位图感系统字体栈）；全部文案与图标原创（图标由 `art/genIcon` 生成为 data-URL，24×24）。
- **UiStore**：单一可观察对象 `{ tool, subTool, openWindows[], view: ViewState, speed, messages[], complaint, weather, funds, date, demand, flags }`；组件只订阅、不写模拟。
- **窗口系统** `ui/windows/WindowManager`：非模态浮动窗（拖动、z 序、同类单例、位置记忆到 `localStorage`、窄屏全屏化）；`ModalHost` 栈（预算 / 军事提案 / 灾害提示 / 情景 / 游戏结束 / 号外 / 桥型 / 球队 / 邻城连接 / 导入素材），模态期间 `clock.modalPause++`，关闭时 `commands.dispatch({kind:'modalClosed', id, answer})` 让调度器 `resume()`。
- **工具栏 / 菜单 / 状态区**：按 `ui-art.md` §2.2–§2.4 的布局与字段；子工具弹条、禁用原因来自 `availability(toolId)` 查询；RCI 指示器与诉求行只读 `zones.demand` 与 `services.cityStatus`。
- **ToolController**（`ui/tools/`）：十种操作模式的状态机（Click / Paint / Line / Rect / Place / Query / Sign / Center / Help / Dispatch）。指针事件 → `renderer.pick` → 模式状态机 → 预览（调用 `previewCommand(cmd)`，纯计算、显示费用与可放性）→ 提交 `commands.dispatch(cmd)` → 结果写消息区（拒绝原因 2 s、事件横幅 5 s、工具提示常驻）。`Esc` 语义栈：取消拖动 → 收子工具条 → 关顶层窗口。
- **输入模型**：鼠标（右键 / 中键拖 = 平移，滚轮 = 以光标为锚缩放，右键单击 = Query）、键盘表（`ui-art.md` §2.8，含 `Ctrl+S` 拦截）、触控（`touch-action:none`；单指 = 工具或平移、长按 = Query、双指 = 平移 / 捏合缩放（1.5 / 0.67 阈值带滞回）/ 旋转 ≥40°、双击放大、三指 = 地下）。窄屏（<768 px）切换为底部抽屉工具栏与全屏窗口。
- **消息流**：

```
PointerEvent ─▶ InputRouter ─▶ ToolController ─▶ CommandBus.dispatch(Command) ─▶ sim.CommandRouter ─▶ CommandResult
                                     │ preview                                        │ events
                                     ▼                                                ▼
                               renderer.setPreview                        EventBus ─▶ UiStore（窗口/状态区/音效）
                                                                                   └▶ Renderer（dirty / bulk / goto / actors）
```

UI 读模拟只经 `QueryHub` 的只读接口（`q.economy.budgetView()`、`q.services.queryTile(i)`…），每月 `monthTick` 后刷新一次数据窗口；Graphs / Map 窗口只在可见且数据变化时重画（Map 窗口是 2D canvas，按图层 LUT 直接写 `ImageData`）。

---

## 6. 美术：程序化精灵生成器

- **接口**（`ui-art.md` §3.9.3 全部函数）统一为纯函数 `(params, scale) → IndexedBitmap | IndexedBitmap[]`，只依赖 `art/raster.ts` 的 8 个原语（`fillPoly / strokePoly / fillDiamond / ditherFill / isoLine / blit / hashNoise / isoBox`）。`ProceduralProvider` 实现 `SpriteProvider`：`nativeScales = {S, M, L}`，L 为母版分辨率，首帧生成地形 / 水 / 路网 / 树 ≈200 张（<150 ms，`art/worker.ts` 中生成并 transfer）。
- **R/C/I 多样性**：256 项 `BUILDING_RECIPES[id]`（`ui-art.md` §3.8）是单一事实源；每个 id 的外观由 `seed = id` 决定（窗格亮灭、附属物位置、高度 ±10%），同一 id 全图一致（原版亦如此）。差异来自四个正交维度：**轮廓族**（盒 / L 形 / 阶梯 / 锯齿 / 穹顶 / 塔楼）、**色带**（Brick / WarmGray / Neutral / Glass / Rust / Teal / Violet…）、**屋顶**（坡 / 平 + HVAC / 女儿墙 / 穹顶 / 花园）、**附属物**（烟囱 / 招牌 / 泳池 / 停车场 / 植被）。契约测试：同一 (zone, level) 的候选 id 两两之间 `|hash(bitmap_a) − hash(bitmap_b)|` 不要求数值距离，而是断言它们的 (ramp, silhouette) 组合互不相同；tier 0/1/2 之间 ramp 的明度阶 `i0` 单调递增。
- **调色板**：`buildPalette()` 按 `ui-art.md` §3.5 生成 16 色带 × 8 阶 + 保留区（0 透明、1–7 纯色、8–15 热力、144–159 火 / 烟、160–191 三组循环、192–255 空）。不含任何原版数值；DAT 导入时使用玩家的 `PAL_MSTR.BMP`，两套 `Palette.cycles` 定义不同，由 Provider 携带。
- **快照与预览**：所有生成器输出用 FNV-1a 哈希做 vitest 快照；`pnpm --filter sc2k art:preview` 输出 contact sheet 到 `docs/art-preview/`（gitignore）供人工检视。

---

## 7. 文件格式与本地导入

- 解析器接口照 `file-formats.md` §3：`ByteReader/ByteWriter`（显式 `u16be/u16le`）、`parseIff/buildIff`、`rleDecode/rleEncode`（属性测试往返）、`readSc2/writeSc2 ↔ Sc2Document`、`MISC` 访问器与 `cohortOffset()`、`parseSpriteArchive/decodeSprite`（`duplicatePolicy` 默认 `'first'`）、`readPaletteBmp`、`cycledIndex`、`IdLayout` 自动对齐（0–290 固定，291+ 按顺序累加 + 尺寸启发校验）。
- `io/sc2/mapping.ts`：`importCity(doc) → CityState`（固定 10 步，调用各模块 `rebuild()`），`exportCity(state) → Sc2Document`（重算派生计数、合成 `XTXT`、回填预算块、`rawMisc` 兜底）。
- `DatSpriteProvider`：`nativeScales = {XS, S, M}`，位图锚点 `(w/2, h−1)`（`DAT_OVERLAP_ROW` 可切），`cycling` 由位图是否含 171–239 索引判定；`SPECIAL` 跨文件覆盖 `SMALLMED`；1256 必须是 32×17 否则 `LARGE_SANITY`。
- **浏览器导入**：目录授权（`showDirectoryPicker`，句柄存 IndexedDB 免重选）/ 多选 / 拖放三种来源 → 主线程按文件名 + 魔数识别 → Worker 解码 → `AssetStore`（IndexedDB `sc2k-assets`：`files / decoded / handles / saves / meta`，`decoded` 键含 `sha256 + DECODER_VERSION`）。缓存的是**索引图集 + 元数据**，与调色板无关；启动时命中缓存则 <200 ms 进入 DAT 画面。
- **隐私红线**：字节只在内存、Worker、IndexedDB；`io/import` 目录 ESLint 禁止 import 任何网络模块；诊断只含 `id/w/h/size/sha256`；提供一键清除。

---

## 8. 测试策略

| 层 | 内容 | 位置 / 工具 |
|---|---|---|
| 单元 | 契约函数（`tileIndex/halfIndex` 反转置、旋转置换表 = 角点重命名、周期与逆）；IFF/RLE 往返与属性测试；精灵解码手工夹具（`file-formats.md` §3.5.4）；电 / 水 BFS 方向用例 T1–T9；24 偏移可达；出行转移表逐行；预算 `splitMonthly`、法令取整、债券；地形工具传播；灾害 `XTXT` 合成 / 恢复；人口学队列守恒 | `src/**/*.test.ts`，vitest（根配置已收集） |
| 确定性 | 同种子 + 同命令日志跑 24 个月两次，`hashCity` 逐字节相同；中途 `exportCity → importCity` 再续跑与不中断结果相同；跨 Node 版本（CI 矩阵）相同 | `src/__integration__/determinism.test.ts` |
| 无头长跑 | 固定种子新城 + 脚本化市长（按诉求链放电厂 / 划区 / 修路的简单策略）模拟 50 与 100 年：无异常、`funds` 有限、人口曲线单调段 ≥ 60%、峰值 ∈ [5k, 500k]、电 / 水利用率 ∈ [0,100]、`XZON` 角标与 `XBLD` 占地一致、`Σ XVAL == MISC 0x0028`、`XBIT & 0x08 == 0`、`XTXT` 无悬空指针；运行时间 < 60 s | `src/__integration__/longrun.test.ts`（`SC2K_LONGRUN=1` 时启用） |
| 像素 | CPU 合成器快照：旋转 / 翻转 / 多格锚点 / 边缘岩壁 / 坡面接缝（相邻平地格无 1 px 缝）；程序化精灵哈希快照 | `src/render/cpu/*.test.ts`、`src/art/*.test.ts` |
| 浏览器冒烟 | `scripts/smoke.mjs`：`vite preview` → Playwright Chromium → 新城（固定种子）→ 等首帧 → 截图 → 断言无 console error、canvas 非单色、按 `]` 旋转与 `+` 缩放后截图哈希变化、`U` 地下视图、打开预算窗口并关闭后时钟恢复；输出到 `docs/art-preview/smoke-*.png` | 手动 / CI 可选 |
| 性能 | `renderer.stats()`：精灵数、draw call、带重建次数、帧时间 p95；长跑脚本记录每月 sim 毫秒 | smoke 脚本尾部打印 |

---

## 9. 工作分解与共享契约

### 9.1 工作包（WP0 串行先行，WP1–WP13 完全并行；文件独占，不得越界写）

| WP | 目标 | 独占文件 / 目录 | 依赖的契约 | 验收测试 | 规模 |
|---|---|---|---|---|---|
| **WP0 脚手架**（串行） | 包骨架、`src/contracts/**` 落地（§9.2–9.5 原样 + 规格 §3.1 的模块状态类型）、`src/data/**` 256 项建筑表 / 工具表 / 造价 / 科技年 / 法令、空壳 App（标题页 + 空白 Pixi 画布）、根 eslint 追加一段、冒烟脚本骨架 | `package.json index.html vite.config.ts tsconfig*.json src/contracts/** src/data/** src/main.ts src/app/bootstrap.ts`（WP0 串行完成后 `src/app/**` 的所有权移交 WP13） | — | `typecheck` 两套 tsconfig 全绿；`catalogue.test.ts` 的 §3.2 不变量；契约数学测试（索引反转置、旋转表） | 2–3 k 行 |
| WP1 地形 | 高度场 / 坡面 / 水体分类、生成器、编辑器与城市模式地形工具、桥隧的地形改动、树木、`TerrainReadApi/TerrainToolApi` | `src/sim/terrain/**` | tiles、rotation、prng、CityLayers、events、TerrainReadApi/TerrainToolApi | 置换表数据级用例、`recomputeTerrainTile` 不变量（4 角落差 ≤1）、生成器快照（同种子同 `xter/alt` 哈希）、工具费用与拒绝用例 | 2.5 k |
| WP2 电与水 | 两遍 BFS、电厂表与产量、水设施、水塔蓄水、净水厂、年度老化、自动选形、`UtilityQuery` | `src/sim/utilities/**` | tiles、XBit、prng、System、QueryHub(env.invented / ordinance)、events | `power-water.md` §3.8 T1–T9；Energy Conservation +1/12；读档后立即扫描 | 1.8 k |
| WP3 交通 | 片段选择、交叉件、桥 / 隧 / 高速 / 匝道 / 车站放置、24 偏移可达、出行生成器与 `addTraffic`、连接计数、预算衰败、`TransportQuery` | `src/sim/transport/**` | tiles、rotation、prng、System、TrafficOwner（services 提供）、TerrainReadApi、events | 可达偏移用例、转移表逐行、回溯恢复步数、2×2 车站 36 格影响区、桥对话框长度阈值、连接重算 | 3 k |
| WP4 分区与需求 | 生长扫描访问、lot 状态机、吞并、教堂、人口 / 税基、RCI 需求、11 产业、邻城、国家经济、`ZonesQuery` | `src/sim/zones/**` | tiles、prng、System、GrowthEnv（由 WP2/WP3/WP5 的查询接口组合）、BuildingDef、events | `zones-growth-demand.md` §3.7 八项；需求 0 时静止；确定性 | 2.5 k |
| WP5 服务与模型 | 八张图层、城市中心、警消覆盖、人口学、微模拟 XMIC、里程碑 / 奖励 / 军事 / Arcology、港口机场生长、支持率、诉求链、`TrafficOwner`、`ServicesQuery` | `src/sim/services/**` | tiles(half/quarter)、prng、System、UtilityQuery、TransportQuery.roadTileCounts、events | 图层主次序 `Σ XVAL == 0x0028`、覆盖图案值表、队列人数守恒、`decayTraffic` 后 `Σ XTRF == 0x0030`、NIMBY 不扣款 | 3 k |
| WP6 经济与时钟 | `DAY_PHASES` 调度器、`ClockState`、速度与预算切片、月结 / 年结、税 / 法令 / 债券 / 经费、预算窗口视图模型、扣费 API、破产、情景评估、`EconomyQuery` | `src/sim/economy/**`、`src/sim/core/clock*.ts`、`src/sim/core/scheduler.ts` | System、PhaseId、Prng（实现放 `src/sim/core/prng.ts`，归本 WP）、CensusSnapshot、events、commands(经济类) | §2.3.4 五条调度断言；`splitMonthly` 年和精确；PRNG 测试向量；挂起 / 恢复不重跑阶段；24 月重放哈希一致 | 2.2 k |
| WP7 灾害与事件 | 灾害状态机与 `marker`、天气、紧急调度、`XTHG` 常驻物件、`XTXT` 合成 / 恢复、科技年表、报纸故事池与版面模板、顾问 | `src/sim/disasters/**`（含 `weather/ tech/ news/ things/` 子目录） | tiles、prng、System、events、DisasterApi/ThingsApi/TechQuery/NewsApi、destroyStructure 回调（WP13 装配） | 火 → 灭 → 标签不丢；灾害中存档往返；侧表截断恢复；列车三槽原子；发明年落在 `[base, base+19]`；报纸冷却 | 3.5 k |
| WP8 文件与导入 | `io/**` 全部：.SC2 读写、MISC 访问器、mapping、DAT/BMP/MIF/TEXT 解码、识别、Worker、IndexedDB、`DatSpriteProvider` | `src/io/**` | CityLayers、SpriteProvider/IndexedBitmap、Diagnostic、模块 `rebuild()` 钩子签名 | 手工夹具往返、RLE 属性测试、`cohortOffset(19,'leSum')+4 == industryGraph`、重复 ID 策略、1256 尺寸检查、IndexedDB 伪实现下的缓存命中 | 2.5 k |
| WP9 程序化美术 | 调色板、光栅原语、全部生成函数、`ProceduralProvider`、UI 图标、minimap LUT、art Worker、contact sheet | `src/art/**`、`scripts/art-preview.ts` | IndexedBitmap/SpriteKey/SpriteProvider/Palette、BUILDING_RECIPES 表（本 WP 内）、FOOTPRINT | 每个生成器哈希快照；菱形行宽规则；配方表与 `FOOTPRINT` 一致；多样性组合断言 | 3 k |
| WP10 渲染核心 | 投影 / 旋转应用、`SceneCompiler`、`zKey`、`renderAnchor`、拾取、相机数学、`CpuCompositor`、像素快照用例 | `src/render/scene/**`、`src/render/projection.ts`、`src/render/picking.ts`、`src/render/camera.ts`、`src/render/cpu/**` | rotation、ZOOM_TABLE、ViewState、SceneItem/RenderSnapshot、SpriteProvider | 旋转 / 翻转 / 锚点像素快照；`pick(worldToScreen(t)) == t` 全图往返；编译局部性（改一格只产生该格 diff） | 1.8 k |
| WP11 渲染后端 | `AtlasManager`（页 / animPage / 稳定句柄 / 回退链）、深度带与 `SpriteHandle` 池、脏更新、派生档舞台缩放、地下带、预览层、air 层、物件插带、`AnimationClock`、调色板循环、DOM 标牌定位、`RendererApi` | `src/render/pixi/**`、`src/render/atlas/**`、`src/render/animation.ts`、`src/render/index.ts`、`scripts/smoke.mjs` | SceneItem/SceneCompiler（WP10 的接口，实现用 stub 可先行）、RendererApi、SpriteProvider | 无 WebGL 环境下用 Pixi 的 mock 渲染器测页打包与句柄稳定；smoke 截图；`stats()` 指标：静态场景 draw call ≤ 48、全量重建 ≤ 60 ms（开发机） | 2.5 k |
| WP12 UI 外壳 | `h()`、主题、窗口管理、模态栈、菜单栏、工具栏 / 子工具 / RCI、状态区、全部信息窗口与对话框、Query、ToolController、输入与触控、键盘表、窄屏布局 | `src/ui/**` | UiStore 形状（本 WP 定义）、Command/CommandResult、SimEvent、QueryHub 只读接口、RendererApi（pick/setPreview/goto）、ToolDef | DOM 测试（happy-dom）：工具状态机转换、Esc 栈、Line 轴向切换、费用预览；快照 HTML 结构 | 3.5 k |
| WP13 应用装配与命令 | `GameSession`：构造 `CityState`、注册系统到调度器、`QueryHub` 接线、`CommandRouter`（放置校验 §3.4 catalogue、桥 / 连接 / 球队对话框回合、NIMBY、拆除、即时电水重扫）、新城 / 载入 / 保存 / 导入流程、标题页、设置、美术来源热切换、`hashCity`、`DirtyTracker` 实现 | `src/app/**`、`src/sim/core/{state,dirty,hash,commands}.ts` | 全部契约 | 确定性与长跑集成测试（本 WP 拥有 `src/__integration__/**`）、命令重放、保存 / 载入等价 | 2 k |

分工边界补充：`src/sim/core/prng.ts` 与调度器归 WP6；`src/sim/core/{state,dirty,hash,commands}.ts` 归 WP13；`TrafficOwner` 实现在 WP5、调用在 WP3；`destroyStructure` 实现在 WP7、被 WP2/WP3/WP5 经 `DisasterApi` 调用。每个 WP 用 `__mocks__/` 自建其他模块查询接口的假实现，不得 import 其他 WP 目录（ESLint `no-restricted-imports` 按目录配置，WP0 落地）。

### 9.2 契约：坐标、位标志、旋转（`src/contracts/tiles.ts`、`rotation.ts`）

```ts
export const MAP_SIZE = 128, TILE_COUNT = 16384, CORNER_SIZE = 129, HALF_SIZE = 64, QUARTER_SIZE = 32, MAX_ALT = 31;
export const tileIndex = (x: number, y: number): number => x * 128 + y;           // x 主序（file-formats §2.2.1，全仓库唯一真源）
export const tileX = (i: number): number => i >> 7;
export const tileY = (i: number): number => i & 127;
export const halfIndex = (x: number, y: number): number => (x >> 1) * 64 + (y >> 1);      // XTRF XPLT XVAL XCRM
export const quarterIndex = (x: number, y: number): number => (x >> 2) * 32 + (y >> 2);   // XPLC XFIR XPOP XROG
export const inBounds = (x: number, y: number): boolean => x >= 0 && y >= 0 && x < 128 && y < 128;
export const enum Dir { T = 0, R = 1, B = 2, L = 3 }                                    // T=−y R=+x B=+y L=−x
export const DX: readonly number[] = [0, 1, 0, -1], DY: readonly number[] = [-1, 0, 1, 0];
export const neighbor = (i: number, d: Dir): number => {                                // 越界 −1；禁止 i±1 直接加减
  const x = tileX(i) + DX[d]!, y = tileY(i) + DY[d]!; return inBounds(x, y) ? tileIndex(x, y) : -1; };

export const enum XBit { SaltWater = 0x01, Flipped = 0x02, Water = 0x04, Mark = 0x08, Watered = 0x10, Piped = 0x20, Powered = 0x40, Powerable = 0x80 }
export const enum XZonCorner { BL = 0x10, BR = 0x20, TL = 0x40, TR = 0x80 }           // 低 4 位 = ZoneCode；1×1 写 0xF0
export const enum ZoneCode { None = 0, LightR = 1, DenseR = 2, LightC = 3, DenseC = 4, LightI = 5, DenseI = 6, Military = 7, Airport = 8, Seaport = 9 }
export const enum XterClass { Dry = 0x00, Submerged = 0x10, Shore = 0x20, Surface = 0x30, Waterfall = 0x3e, Stream = 0x40 }
export const enum CityMode { TerrainEdit = 0, City = 1, Disaster = 2 }
export const DEVELOPED_FIRST = 0x70;

export type Rotation = 0 | 1 | 2 | 3;                                                     // 逆时针次数 = MISC 0x0008
export function rotateTile(x: number, y: number, r: Rotation): [number, number] {         // 1 次 = (x,y)→(y,127−x)
  let rx = x, ry = y; for (let k = 0; k < r; k++) { const t = rx; rx = ry; ry = 127 - t; } return [rx, ry]; }
export function unrotateTile(rx: number, ry: number, r: Rotation): [number, number] {
  let x = rx, y = ry; for (let k = 0; k < r; k++) { const t = x; x = 127 - y; y = t; } return [x, y]; }
export const SLOPE_CORNERS: readonly number[] = [0b0000,0b1100,0b0101,0b0011,0b1010,0b1101,0b0111,0b1011,0b1110,0b0100,0b0001,0b0010,0b1000,0b1111];
export const SLOPE_ROT_CCW: readonly number[] = [0, 4, 1, 2, 3, 8, 5, 6, 7, 12, 9, 10, 11, 13];
export const SLOPE_ROT_CW:  readonly number[] = [0, 2, 3, 4, 1, 6, 7, 8, 5, 10, 11, 12, 9, 13];
export const XTER_STREAM_ROT_CCW: Readonly<Record<number, number>> = { 0x40: 0x41, 0x41: 0x40, 0x42: 0x45, 0x45: 0x44, 0x44: 0x43, 0x43: 0x42 };
export function rotateXter(code: number, r: Rotation): number;        // ui-art §3.3 / terrain §2.5.4
export function rotateXbld(id: number, r: Rotation): number;          // 网络族四向环、隧道口、交叉件、高速、地铁↔铁路、0xC6↔0xC7；建筑不变
export function rotateXund(code: number, r: Rotation): number;
export function drawFlip(xbit: number, id: number, r: Rotation): boolean;   // 翻转族：((xbit & Flipped) != 0) !== ((r & 1) == 1)
export function renderAnchor(originTile: number, size: 1 | 2 | 3 | 4, r: Rotation): number;  // §4.3
```

### 9.3 契约：状态、系统、调度（`src/contracts/state.ts`、`systems.ts`）

```ts
export interface CityLayers {
  alt: Uint8Array; waterLevel: Uint8Array; tunnel: Uint8Array;
  xter: Uint8Array; xbld: Uint8Array; xzon: Uint8Array; xund: Uint8Array; xtxt: Uint8Array; xbit: Uint8Array;
  xtrf: Uint8Array; xplt: Uint8Array; xval: Uint8Array; xcrm: Uint8Array;
  xplc: Uint8Array; xfir: Uint8Array; xpop: Uint8Array; xrog: Uint8Array;
  xlab: Uint8Array; xmic: Uint8Array; xthg: Uint8Array; xgrp: Int32Array;
  marker: Uint8Array;                      // 运行时灾害标记
  anchorOf: Int32Array;                    // 派生：tile → 世界锚格（最小 x,y），非建筑 −1；由 CommandRouter / zones / services 写地块时维护，rebuild() 重建
}
export interface DirtyTracker { mark(i: number): void; markBulk(k: 'powered'|'watered'|'dataMaps'|'markers'|'things'|'all'): void;
  readonly list: Int32Array; readonly count: number; readonly bulk: Readonly<Record<string, boolean>>; clear(): void; }
export interface Prng { next32(): number; next15(): number; int(n: number): number; range(lo: number, hi: number): number; float(): number;
  bit(): boolean; pick<T>(a: readonly T[]): T; shuffle<T>(a: T[]): void; state(): number; seed(s: number): void; }
export type Speed = 1 | 2 | 3 | 4 | 5;     // Paused Turtle Llama Cheetah Swallow
export interface ClockState { age: number; foundedYear: number; speed: Speed; modalPause: number; phaseCursor: number; accumMs: number; prng: Prng }
export const dateOf = (c: ClockState) => ({ year: c.foundedYear + Math.floor(c.age / 300), month: Math.floor((c.age % 300) / 25), day: c.age % 25 });

export interface CityState {
  cityName: string; mode: CityMode; difficulty: 1 | 2 | 3;
  layers: CityLayers; rawMisc: Int32Array; clock: ClockState; dirty: DirtyTracker;
  terrain: TerrainState; utilities: UtilityState; transport: TransportState; zones: ZonesState; services: ServicesState;
  economy: EconomyState; disasters: DisasterState; weather: WeatherState; tech: TechState; news: NewsState; scenario: ScenarioState | null;
  view: ViewState;                          // 存档中的视图字段（渲染层只读；UI 写）
}
// 各 *State 的公开字段以对应规格 §3.1 为准（terrain.md / power-water.md / transport-traffic.md / zones-growth-demand.md /
// services-models.md / economy-budget.md / disasters-events.md）；WP0 把它们誊入 src/contracts/modules/*.ts，WP 只能追加私有字段。

export type PhaseId = 'settleMonth'|'closeYear'|'techCheck'|'nationalAnnual'|'neighborsAnnual'|'approvalSurvey'|'facilityAnnual'|'utilitiesAnnual'
  |'budgetWindow'|'beginMonth'|'powerScan'|'dataMaps'|'growthScan'|'trafficDecay'|'waterScan'|'census'|'demand'|'demographics'|'graphs'
  |'milestones'|'scenario'|'solvency'|'uiRefresh'|'weatherAndDisaster'|'cityStatus'|'news';
export const DAY_PHASES: Readonly<Record<number, readonly PhaseId[]>> = {       // economy-budget §2.3.1，唯一日程
  0: ['settleMonth','closeYear','techCheck','nationalAnnual','neighborsAnnual','approvalSurvey','facilityAnnual','utilitiesAnnual','budgetWindow','beginMonth'],
  1: ['powerScan'], 2: ['dataMaps'], 3: ['growthScan'], 4: ['growthScan'], 5: ['growthScan'], 6: ['growthScan'], 7: ['growthScan'], 8: ['growthScan'],
  9: ['growthScan'], 10: ['growthScan'], 11: ['growthScan'], 12: ['growthScan'], 13: ['growthScan'], 14: ['growthScan'], 15: ['growthScan'],
  16: ['growthScan'], 17: ['growthScan'], 18: ['growthScan'], 19: ['trafficDecay'], 20: ['waterScan'], 21: ['census','demand','demographics','graphs'],
  22: ['milestones','scenario','solvency'], 23: ['uiRefresh'], 24: ['weatherAndDisaster','cityStatus','news'] };
export const growthStep = (day: number) => Math.floor((day - 3) / 4), growthSubstep = (day: number) => (day + 1) % 4;

export type PhaseResult = 'done' | 'suspend';
export interface SimContext { state: CityState; prng: Prng; events: EventSink; q: QueryHub; tuning: TuningRoot; day: number; month: number; year: number }
export interface System {
  readonly name: string; readonly phases: readonly PhaseId[];
  init(ctx: SimContext, mode: 'newCity' | 'load'): void;     // 新城初始化或读档后 rebuild()
  run(ctx: SimContext, phase: PhaseId, day: number): PhaseResult;
  growthVisit?(ctx: SimContext, x: number, y: number): void; // 仅 transport / zones / services：由调度器按 budgetTick → growthVisit → onGrowthVisit 顺序调用
  disasterTick?(ctx: SimContext): void;                      // disasters / things
  onCommand?(ctx: SimContext, cmd: Command): CommandResult | undefined;   // 处理自己领域的命令，不处理返回 undefined
  queries(): Partial<QueryHub>;                              // 注册只读查询面
}
export interface QueryHub {                                 // 各接口签名见对应规格 §3；此处只列名字与归属
  terrain: TerrainReadApi & TerrainToolApi;                 // WP1
  utilities: UtilityQuery;                                  // WP2：powered(i) watered(i) hasPower(i) lastPower lastWater requestRescan()
  transport: TransportQuery;                                // WP3：hasAccess runTrip stationAt trafficAt roadDistance roadTileCounts connections
  zones: ZonesQuery;                                        // WP4：census demand caps industry neighbors national lotAt availability
  services: ServicesQuery & TrafficOwner;                   // WP5：cityCenter trafficReport queryTile(i) cityStatus rewards facilityAt allocMicrosim freeMicrosim addTraffic
  economy: EconomyQuery;                                    // WP6：funds canAfford charge budgetView bondView ordinances funding taxRate costOf
  disasters: DisasterApi & ThingsApi & TechQuery & NewsApi; // WP7：requestDisaster destroyStructure placeDispatch focusPoints invented(tech) stories
}
```

### 9.4 契约：事件、命令、工具（`src/contracts/events.ts`、`commands.ts`、`tools.ts`）

```ts
export type SimEvent =
  | { type: 'dayTick'; age: number } | { type: 'monthTick'; year: number; month: number } | { type: 'yearTick'; year: number }
  | { type: 'funds'; funds: number } | { type: 'message'; key: string; params?: Record<string, number | string>; level: 'info' | 'reject' | 'alert' }
  | { type: 'modal'; id: ModalId; payload: unknown }                     // 调度器已挂起；UI 关闭后 dispatch modalClosed
  | { type: 'goto'; x: number; y: number; smooth: boolean }
  | { type: 'disaster'; phase: 'start' | 'end'; kind: number; x: number; y: number }
  | { type: 'weather'; trend: number; heat: number; wind: number; humid: number }
  | { type: 'news'; storyType: number; value: number; extra: boolean } | { type: 'complaint'; key: string | null }
  | { type: 'toolbar'; reason: 'tech' | 'reward' | 'ordinance' | 'funds' }
  | { type: 'actor'; op: 'spawn' | 'move' | 'remove'; slot: number }     // 渲染层据此从 things 读位置
  | { type: 'sound'; id: string };
export type ModalId = 'budget' | 'militaryOffer' | 'disasterAlert' | 'scenarioBrief' | 'scenarioResult' | 'gameOver' | 'extraPaper' | 'bridgeType' | 'teamPick' | 'neighborConnect' | 'rewardOffer';
export interface EventSink { emit(e: SimEvent): void }
export interface EventBus extends EventSink { on<T extends SimEvent['type']>(t: T, h: (e: Extract<SimEvent, { type: T }>) => void): () => void; flush(): void }

export type ToolId = string;                                             // building-catalogue §2.11 的 id，如 'roads.road'、'zone.rDense'、'power.coal'
export type Command =
  | { kind: 'click';  tool: ToolId; x: number; y: number }                // Raise/Lower/Water/Trees/Dispatch/1×1 放置
  | { kind: 'place';  tool: ToolId; x0: number; y0: number }              // 多格建筑，(x0,y0) = 占地最小坐标
  | { kind: 'line';   tool: ToolId; from: [number, number]; to: [number, number]; bridge?: number }  // 路/轨/线/管/地铁/高速；bridge = 对话框选择
  | { kind: 'rect';   tool: ToolId; x0: number; y0: number; x1: number; y1: number }               // 分区 / 港口 / 机场 / 去分区
  | { kind: 'paint';  tool: ToolId; tiles: readonly number[] }           // 推土 / 推平 / 树（沿途每格一次）
  | { kind: 'tunnel'; x: number; y: number } | { kind: 'sign'; x: number; y: number; text: string } | { kind: 'rename'; label: number; text: string }
  | { kind: 'setSpeed'; speed: Speed } | { kind: 'setView'; view: Partial<ViewState> }
  | { kind: 'setTax'; r?: number; c?: number; i?: number; industry?: Record<number, number> } | { kind: 'setFunding'; line: number; pct: number }
  | { kind: 'ordinance'; id: number; on: boolean } | { kind: 'issueBond' } | { kind: 'repayBond' } | { kind: 'setOption'; key: 'autoBudget' | 'autoGoto' | 'noDisasters' | 'sound' | 'music' | 'paper' | 'extraPaper'; value: number }
  | { kind: 'disaster'; disasterKind: number } | { kind: 'cheat'; code: string }
  | { kind: 'modalClosed'; id: ModalId; answer: unknown } | { kind: 'terrainEditor'; op: 'make' | 'done' | 'seaLevel' | 'stretch' | 'stream' | 'forest'; args: Record<string, number | boolean> };
export type RejectReason = 'funds' | 'occupied' | 'slope' | 'water' | 'needWaterfall' | 'outOfBounds' | 'zoned' | 'notInvented' | 'locked' | 'ordinance'
  | 'adjacency' | 'nimby' | 'microsimFull' | 'waterCells' | 'terrain' | 'obstructed' | 'mode' | 'limit' | 'noTarget';
export interface CommandResult { ok: boolean; cost: number; reason?: RejectReason; changed: readonly number[]; modal?: { id: ModalId; payload: unknown } }
export interface CommandPreview { cost: number; tiles: ReadonlyArray<{ i: number; ok: boolean; reason?: RejectReason }>; footprint?: { x0: number; y0: number; size: number } }
export interface CommandRouter { dispatch(cmd: Command): CommandResult; preview(cmd: Command): CommandPreview; availability(tool: ToolId): { enabled: boolean; reason?: RejectReason } }
export type ToolMode = 'Click' | 'Paint' | 'Line' | 'Rect' | 'Place' | 'Query' | 'Sign' | 'Center' | 'Help' | 'Dispatch';
// ToolDef / BuildingDef / FOOTPRINT / CATEGORY 见 building-catalogue §3.1–§3.2，由 src/data 提供。
```

### 9.5 契约：渲染输入（`src/contracts/render.ts`）

```ts
export type ZoomLevel = 0 | 1 | 2 | 3 | 4; export type ArtScale = 'XS' | 'S' | 'M' | 'L' | 'XL';
export const ZOOM_TABLE = [ { scale: 'XS', tileW: 8, tileH: 4, levelPx: 3, dat: 'small' }, { scale: 'S', tileW: 16, tileH: 8, levelPx: 6, dat: 'medium' },
  { scale: 'M', tileW: 32, tileH: 16, levelPx: 12, dat: 'large' }, { scale: 'L', tileW: 64, tileH: 32, levelPx: 24, dat: null }, { scale: 'XL', tileW: 128, tileH: 64, levelPx: 48, dat: null } ] as const;
export interface ViewState { zoom: ZoomLevel; rotation: Rotation; centerX: number; centerY: number; underground: boolean;
  show: { buildings: boolean; signs: boolean; infrastructure: boolean; zones: boolean }; mapLayer: string | null }

export type SpriteKind = 'xbld' | 'terrain' | 'water' | 'xund' | 'overlay' | 'actor' | 'ui';
export interface SpriteKey { kind: SpriteKind; id: number; variant?: number }                       // 语义见 ui-art §3.4
export interface IndexedBitmap { w: number; h: number; data: Uint8Array; anchorX: number; anchorY: number; cycling: boolean }   // 0 = 透明
export interface Palette { rgba: Uint8ClampedArray; cycles: ReadonlyArray<{ start: number; length: number; periodMs: number; dir: 1 | -1 }> }
export interface SpriteProvider { readonly name: 'procedural' | 'dat'; readonly palette: Palette; readonly nativeScales: ReadonlySet<ArtScale>;
  has(key: SpriteKey, scale: ArtScale): boolean; bitmap(key: SpriteKey, scale: ArtScale): IndexedBitmap | null; frameCount(key: SpriteKey): number; fps(key: SpriteKey): number }

export const enum SceneLayer { Terrain = 0, EdgeWall = 1, Water = 2, ZoneTint = 3, Ground = 4, Structure = 5, Overlay = 6, Marker = 7, Actor = 8 }
export type AnimGroup = 'none' | 'water' | 'blink' | 'traffic' | 'fire' | 'flood' | 'toxic' | 'riot' | 'cycleOnly';
export interface SceneItem { tile: number; layer: SceneLayer; key: SpriteKey; x: number; y: number;   // 锚点屏幕坐标（原生档像素，相对地图原点，未含相机）
  depth: number; zKey: number; flip: boolean; anim: AnimGroup; tint?: number; alpha?: number }
export interface RenderSnapshot { readonly layers: Readonly<CityLayers>; readonly view: Readonly<ViewState>; readonly seaLevel: number; readonly artScale: ArtScale }
export interface SceneCompiler { compileTile(snap: RenderSnapshot, i: number, out: SceneItem[]): void; compileAll(snap: RenderSnapshot): SceneItem[];
  worldToScreen(snap: RenderSnapshot, x: number, y: number, h: number): [number, number]; pick(snap: RenderSnapshot, px: number, py: number): number | null }
export interface ActorSprite { slot: number; key: SpriteKey; x: number; y: number; z: number; px: number; py: number; dir: number; air: boolean }
export interface RendererApi {
  attach(host: HTMLElement): Promise<void>; destroy(): void; resize(): void;
  setState(state: CityState): void;                       // 读档 / 新城：全量重建
  setProvider(primary: SpriteProvider, fallback: SpriteProvider): void;   // 热切换 DAT ↔ procedural
  setView(v: ViewState): void; getView(): ViewState; goto(x: number, y: number, smooth: boolean): void;
  frame(dtMs: number): void;                               // 消费 dirty、推进动画时钟、提交渲染；由 GameLoop 调用
  setPreview(p: CommandPreview | null): void; setActors(a: readonly ActorSprite[]): void; setHeatLayer(layer: string | null): void;
  pick(px: number, py: number): { x: number; y: number } | null; screenOf(x: number, y: number): [number, number];
  thumbnail(w: number, h: number): Promise<Blob>;          // 走 CpuCompositor
  stats(): { sprites: number; drawCalls: number; bandRebuilds: number; frameMs: number; vramBytes: number };
}
```

---

## 10. 风险与取舍

| # | 风险 / 取舍 | 应对 |
|---|---|---|
| 1 | **Pixi RenderGroup 的"静态零成本"是假设**：若某版本在无变化时仍遍历子树，4 万精灵每帧 ≈ 4–8 ms CPU | WP11 第一周做 4 万精灵基准；退路：把 XS/S 档（全图可见）改为每带一张 RenderTexture 缓存（小图、伪影不可见），M+ 保持精灵树 |
| 2 | 移动端 GPU 填充率：XL 档精灵 ×4 放大导致过度绘制 | 像素风不需要 MSAA；`backgroundAlpha:1`、按带 `visible` 裁剪；必要时 XL 用 RT 缓存可见带 |
| 3 | 旋转 / 原生档缩放一次重建 35–50 ms | 分 2 帧提交；预览层先切换；原版本来就是瞬切 |
| 4 | `animPage` 整页上传 8 次/s（1 MB）在低端设备可能抖动 | 页按内容分成 256² 子页，只上传脏子页（Pixi `BufferImageSource` 可替换为 `CanvasSource` + `texSubImage2D` 自定义上传器） |
| 5 | 模拟在主线程：Swallow 档与大灾害 tick 挤占帧预算 | 6 ms 预算切片 + 物件 / 灾害 tick 也计入预算；sim 已无 DOM，Worker + SAB 是纯部署问题 |
| 6 | 索引约定被写反（规格中 `services/transport` 的 `h = (x>>1)+64·(y>>1)` 与 SSOT 相反） | 契约 `halfIndex/quarterIndex` 为唯一入口；ESLint 禁止 `* 64`、`% 128` 字面量于 sim；T2 反转置测试 |
| 7 | 多格建筑锚点双约定（zones 用 TL、services 覆盖扫描用 TR、渲染用"旋转后最前格"） | `anchorOf` 一律存世界 TL；`renderAnchor()` 与 `tilesOfLot()` 为唯一换算；测试覆盖四个旋转 |
| 8 | DAT 位图重叠行位置与锚点（`(w/2, h−1)`）未实机验证 | 常量 `DAT_OVERLAP_ROW`；导入诊断 `DAT_ALIGN_SUSPECT`；像素快照以 procedural 为准 |
| 9 | 置信度 [低] 的数值（生长掷骰、出行 destMask、灾害概率、交通单价）会影响"原汁原味"的手感 | 全部进 `*Tuning` 对象并可在开发者面板热调；长跑测试只断言区间不断言精确值 |
| 10 | 单格编译只读本格，依赖模拟层把邻居相关形状（浅水形状、路网片段）写进层 | 规格已如此要求（terrain §3.3、transport §3.3）；集成测试随机改地形后比对全量编译与增量编译结果 |
| 11 | `.SC2` 作为唯一格式：原版区间被我们扩展（PRNG、侧表）可能被其他工具覆盖 | 读档缺失时确定性重播种 / 侧表缺失时按类型恢复；不阻塞 |
| 12 | 契约先行但模块状态字段繁多，WP0 誊写出错会级联 | WP0 用 `catalogue.test.ts` 与各规格 §3 的接口片段做 `tsc` 级对照；契约改动走单独 PR，所有 WP rebase |
| 13 | 画家序对"向上延伸"的精灵正确，但原版某些精灵（码头、栈桥、桥面）向下 / 侧向超出占地 | 这些精灵归 `Ground` 层且为 1×1，水平不越格；桥面高出水面 1 级仍在格内；若发现越格以 DAT 实机用例修 `SceneLayer` 子序 |
| 14 | 报纸 / 文案 / 建筑名全部原创，工作量大且易夹带原版文本 | 文案集中在 `src/data/strings.*.ts`，CI 用关键词黑名单扫描（原版店名、报名、Arco 名） |
