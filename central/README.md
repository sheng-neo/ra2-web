# 中環急件 Central Rush（暂定名）

一款**原创**的网页开放世界追逐驾驶喜剧，舞台是香港中环。以追逐为核心，**不用枪、不死人**；
只做网页（海外托管），手机横屏优先，竖屏和桌面也能玩。真机裁判是 iPhone 17。

代码和红警重制版共用这个 monorepo（`packages/*` 是红警，和这里互不依赖），构建产物挂在同一服务的 `/central/` 下。
总计划、里程碑与预算见 [`docs/PLAN.md`](docs/PLAN.md)。

## 当前进度：M0（地基 + 白模上手机）+ R1（夜景写实化）

已完成：

- 离线管线 `pnpm citymap`：Overture 快照 → 道路、电车轨、海面、区域、道具点；地政总署建筑（整层）；
  CEDD LiDAR 地形 → `terrain.bin`。输出逐字节可复现，CI 用 `pnpm citymap --check` 检查产物没过期。
- 客户端：夜色白模中环，覆盖整个渲染范围（约 2.5 × 1.9 km）。包括程序窗灯 shader、6 座虚构名地标、
  贴地形的路面和电车轨、维港海面倒影、对岸剪影、雾，环绕相机支持鼠标、触屏和键盘，3 个机位，
  常驻地图署名、鸣谢页和性能面板。
- 敏感区（军营、军用码头、政府总部、律政中心、终审法院、礼宾府）只做灰色无窗的背景体，不可交互。
  其中礼宾府（约 60%）、律政中心（约 89%）和终审法院（全部）落在 MVP 矩形里：M1 起刷车点、任务点、
  车道终点一律取「可玩区 − 敏感区」（`build.test.ts` 记着这三处重叠）。敏感区内不出任何道具点：
  管线不输出数据里的道具点，客户端自己生成的路灯、交通灯、山上灯点、树也一律过滤，区内的路不装路灯、
  车道不刷车也不接进去（`client/src/render/streets/surface.test.ts` 用真实数据断言）。

写实化一轮（R1，夜景）：按真实夜景照片重做光照与材质，三个包合并后整合——

- 共享光照契约 `client/src/render/materials/lighting.ts`：线性 HDR、固定曝光、CustomToneMapping（暗部恒等，
  灯芯过曝成白）+ ≤ ±5 % 相机白平衡、指数高度雾（一套参数，天空地平线 = 雾色）、共享 uTime / uClock、
  亮度标尺（窗 < 1，灯、招牌、车灯 > 1 才进 bloom）、`GlowBatch` 光点批、贴图内存账本。
- 大气（ATMOSPHERE）：画质档（HIGH：半浮点场景目标 + MSAA 2 + 半分辨率 bloom + 一个输出 pass；LOW：直出画布），
  中性无星夜空、新海面（HIGH 平面反射 / LOW 方位角光条，波纹、船尾浪）、港岛山体两翼与九龙远景、船。
- 建筑（BUILDINGS）：按类型（写字楼 / 住宅 / 唐楼 / 裙楼 / 公共 / 敏感区）出立面，按楼层与租户成片亮灯、
  铺面与白名单行业字招牌、屋顶机房水箱、航空障碍灯、静态冠顶与边缘 LED；数据加了可选的 `storeys`（层数）。
- 街道（STREETS）：路灯光斑、路缘与人行道、过路处、横向水平路面与挡土墙、地形材质（树冠 / 护坡）、
  路灯与山路灯链、交通灯、车流（左上右落、红的士、双层巴士）、电车、行人天桥、树。
- 整合时删掉旧海面着色（0 mPD 平面只剩陆地底色）、FogExp2 与逐图层雾系数、旧紫色调色板与 Hill 立面模式。
- 复审修正（对照真实夜景照片）：
  - 写字楼不再是「条形码」：整层通亮只剩 4–8 %，租户段 3–14 个窗距，亮段里约 15 % 的窗距熄灯，租户亮度近似对数正态，
    暗楼层有室内溢光；结构柱竖带；商场玻璃（裙楼）改成大块中庭式的暖光，不再是一层层木纹。
  - 雾中光幕：bloom 链的 alpha 顺带模糊「不过阈值的亮度」，输出 pass 给亮楼群加一层淡紫灰散射光（不加 pass）；
    天际线上方另加一层光害穹（约 12° 内）。
  - 海面：反射按亮度软阈值（发光体照单全收、暗墙只反三成）、长波减弱 + 0.22 m 细碎浪、光柱竖向拉长、底色更暗；
    LOW 档发光条的天光项压到四成。
  - 天台空白灯箱（白 / 黄 / 红 / 青蓝 / 绿，不写字）、两片静态 LED 幕墙、四座裙楼蓝 / 白灯带，都进倒影。
  - 航空障碍灯只留全城最高的 15 栋与 250 m 以上地标（300 m 以下一栋一盏），亮度 1.8–2.5；光点光晕封顶约 3.4 % 画面高，LOW 档倍率 1.1。
  - 树：4 团扰动二十面体树冠（近处约 88 个三角形，150 m 外 24 个），大小、高矮、朝向随机，相机 6 m 内不画。
  - 车：车轮、底裙、倒角车身、玻璃车舱、尾灯带与日行灯带（约 64 个三角形）；车身只画相机 700 m 内；
    车流加密（核心区主路每车道 18–20 m 一辆）、主路一成巴士、电车约 130 m 一辆；红灯时车在停车线前排队。
  - 街面：沥青三级颗粒、修补块、车道油渍、灯下骨料反光；平地广场 / 行人区花岗岩铺地；核心区主路多换白光 LED。
  - 墙面：环境光底数降到约三分之一、街面反光按 e^(−h/10 m) 衰减；住宅窗加 10 cm 窗洞暗边、加粗窗框、逐窗玻璃与室内（窗帘、半拉帘）变化。
  - 挡土墙墙顶前后取最大、沿路坡度 ≤ 0.3、封顶 6 m、短于 8 m 的不画（不再有三角形尖顶）。
  - 招牌高低、大小、离墙远近各家不同，相邻三间不重字，字高约占八成；铺内货架是一格格彩色货品与人影。
  - 远景：九龙楼身更暗、亮窗更少更亮、海旁一条连续亮带、步道灯间距与亮度不一并留空档；山路灯链减半、断续；
    山顶一带的树冠有团块与路灯照出的暖色斑。
  - 交通灯杆与树立在看得见的地面上（水平路面 / 路廊压低后的地形）；CPU 端车船用单调时钟（不随 uTime 每小时跳一次）；
    HIGH 档 1440p / 4K 桌面降 DPR 到 1 以下守住 64 MB 显存（画布也计入账本）；自适应 DPR 指数退避；
    hash 里坏的 % 转义不再让应用起不来；过路处贴片加深度偏移；截图脚本隐藏 HUD。

还没做（按 PLAN §6 排在后面）：开车与物理（M1）、步行与抢车（M4）、风声与警察（M5）、任务（M6）。

## 怎么跑

在仓库根目录：

```bash
pnpm install                   # 一次
pnpm dev:central               # 客户端开发服务器（http://localhost:5174/）
pnpm citymap                   # 重新生成 central/client/public/city/（约 1 s，离线）
pnpm citymap --check           # 只比较、不写盘；产物过期时退出码 1（CI 用）
pnpm --filter @central/client build    # 生产构建 → central/client/dist/
node central/client/scripts/shoot.mjs  # 冒烟 + 截图（仿生产服务器，见下）
```

管线的其他参数：

- `--debug[=DIR]`：输出一张北在上的俯视 SVG，用来自查。
- `--buildings=overture --out=DIR`：把建筑图层整层换回 Overture，写到别处做对比。
  仓库里提交的产物一律用地政总署建筑。

`shoot.mjs` 用一个与红警 `packages/server/src/static.ts` 行为相同的服务器托管构建产物：挂在 `/central/` 下、
不压缩、不做目录 301、未知路径回退成别的页面。它断言零 console error、每个机位 draw call ≤ 150、
三角形 HIGH ≤ 60 万 / LOW ≤ 30 万（LOW 另跑一轮，且不得开 bloom 与平面反射）、全分辨率后处理 pass ≤ 2、
手机 DPR 2 时贴图 + 渲染目标 ≤ 64 MB、地图数据实际下载 ≤ 1 MB，并单独打开一次不带结尾斜杠的 `/central`。

客户端 URL 参数：既可写成查询（`?view=statue`），也可写成 hash 令牌（`#view-statue`，用 `&`、`,`、`;` 分隔）——
artifact 链接只透传 hash。`view=harbour|statue|aerial` 选初始机位，`perf` 打开性能面板，`q=low|high` 指定画质档
（默认按能力自动），`t=<18–26>` 设钟点（默认 20 点），`haze=humid|clear` 换雾，`fixture` 换用合成小城（不下载数据），
`terrain=0|1` 强制不加载或加载 `terrain.bin`，`photo` 照片模式（只留地图署名，方便与实拍照片对照）；调试用 `post-0`、`bloom-0`、`zones`（画敏感区虚线框）、`adaptive`。

测试：根目录 `pnpm test`（Vitest，含红警），或只跑这里 `pnpm exec vitest run central`。

## 目录

```
central/
├─ data/      @central/data：city.json / terrain.bin 的数据契约（schema.ts，已冻结；R1 只加了可选字段 `storeys`）、terrain 编解码、源码仓库地址（repo.ts）
├─ citymap/   @central/citymap：离线管线（tsx）
│  ├─ fetch/       一次性抓取脚本（Python，只在更新快照时用，管线本身不需要 Python）
│  ├─ data-raw/    原始快照 + sources.json（每个文件的来源、许可、sha256）；landsd/TERMS.md 记港府条款原文
│  └─ src/         cli → build → stages/*（snapshot、project、buildings、terrain、roads、rails、water、
│                  zones、props、landmarks、pack），sources/*（Overture、LandsD 建筑来源），overrides/*
├─ client/    @central/client：Vite 7 + three.js 0.187（WebGLRenderer）
│  ├─ public/city/ 管线产物：central.json、terrain.bin、ATTRIBUTION.txt、LICENSE-ODbL.txt
│  ├─ scripts/     shoot.mjs（Playwright 冒烟与截图）
│  └─ src/         coords（唯一的坐标换算点）、data、render（CityRenderer、分块、材质、地标）、camera、ui
└─ docs/PLAN.md
```

## 坐标约定

- 投影：WGS84 → HK1980 Grid（EPSG:2326），再减本地原点 **E 834000, N 816000**。
- 单位：**整数分米（dm）**。x 向东，y 向北，z 是高程（香港主水平基准 mPD，同为 dm）。
- 多边形外环逆时针、洞顺时针，首尾点不重复；平面坐标一律是扁平数组 `[x0, y0, x1, y1, …]`。
- proj4 定义见 `citymap/src/stages/project.ts`。基准点 (114.1594, 22.2810) 投影到 (834467.1, 815791.9)，
  误差约 0.04 m（单元测试）；七参数的旋转项用 EPSG 原始符号，不需要翻转。
- three.js 里换算成 (x, z, −y)，单位米。这个换算只写在 `client/src/coords.ts` 一处。
- `terrain.bin`：小端，24 字节头（`CTER`、版本、西南角 x0/y0、间距、nx、ny），后接 int16 高程（dm），
  行优先、由南向北。海面和无数据处写 0。当前为 5 m 网格，497 × 378 个点。
  数据里列了地形来源时，客户端必须拿到 `terrain.bin` 才启动（楼底是绝对 mPD，没有地形山上的楼会变柱子）；
  `?terrain=0` 可强制平地。
- 楼底 `Building.base` 是 mPD。地政总署塔楼的楼底常是裙楼顶，客户端把墙一直延伸到整圈墙脚下最低的地面
  （沿每条边每 0.5 m 采样，不只看顶点），所以楼不会悬空。塔楼与裙楼共用外边时，两面墙共面重合，
  客户端只画楼顶较高的那面（`client/src/render/walls.ts`），避免闪烁条纹。地标的总高从地面算起，楼底取轮廓最低顶点处的地形。
- 道路的 `level` 是 Overture/OSM 的叠放次序，不是高度：客户端只把 level 1–2（及标了 bridge 的更高层）画成高架，
  最多 2 层 × 6 m；level ≥ 3 又不是桥的（裙楼、停车场顶层的楼层号误标）按地面画。

## 数据来源、许可与署名

每个图层只用一个来源，绝不逐栋混合。

| 图层 | 来源 | 许可 |
|---|---|---|
| 道路、电车轨、海面、区域、道具点（`central.json`） | Overture Maps 2026-11-18.0（OpenStreetMap 派生；23 段道路来自 TomTom） | ODbL-1.0 |
| 建筑、地标的轮廓与高度（`central.json`） | 地政总署 Building（v2026-10-20），经 CSDI 取得 | CSDI 使用条款 |
| 地形（`terrain.bin`） | 土木工程拓展署 2020 机载 LiDAR DTM，经 CSDI 取得 | CSDI 使用条款 |

- **仓库根目录的 MIT 只覆盖代码**。`citymap/data-raw/` 与 `client/public/city/` 里的数据各按自己的许可
  （ODbL-1.0、CC-BY-4.0、CSDI 条款），见 [`citymap/data-raw/README.md`](citymap/data-raw/README.md)。
  根目录 README 的「许可」一节还没写这条例外，需要负责人补一句（那个文件不在 central/ 里）。
- 必须显示的署名都生成在 `client/public/city/ATTRIBUTION.txt`，内容来自 `central.json` 的 `meta.sources`。
  加载页显示一行简短署名；进入游戏后屏幕底部常驻一行地图署名（点一下打开鸣谢页）；
  「鳴謝 / Credits」页显示完整署名，港府数据的署名有英文和繁体中文两版，措辞见 `data-raw/landsd/TERMS.md` 第 4 节
  （括号里的处理方式按各图层实际做过的处理改写）：
  - © OpenStreetMap contributors · Overture Maps Foundation
  - Contains data from the Lands Department / the Civil Engineering and Development Department, HKSAR Government,
    obtained from the Common Spatial Data Infrastructure (CSDI) Portal (portal.csdi.gov.hk). Intellectual property rights
    in the data are owned by the Government of the Hong Kong Special Administrative Region. …
- ODbL 4.6：衍生数据库（`central.json` 的 ODbL 部分）、原始快照和生成脚本都在本仓库公开，说明见 `LICENSE-ODbL.txt`。
  鸣谢页链接到 `city/central.json`、源码仓库的 `central/` 目录和仓库里的 `LICENSE-ODbL.txt` / `ATTRIBUTION.txt`；
  仓库地址只写在 `data/src/repo.ts` 一处（改名或迁移时改这里再跑 `pnpm citymap`）。
  红警的静态服务器 MIME 表里没有 `.txt`，生产环境直接打开 `city/*.txt` 会变成下载，所以鸣谢页链接的是仓库里的版本。
- 港府数据单独成层，只按 CSDI 条款使用，**不另加许可**（不能当作 ODbL 或 CC-BY 发布），也不暗示政府认可。
  条款没有明文写「修改」和「再许可」，`TERMS.md` 第 5、6 节记下了这两处不确定和未能核对的部门条款。
  以上都不是法律意见：上线前，项目负责人要亲自打开条款原文核对一次；如果商业化，先问香港律师。
- 更新快照：Overture 用 `citymap/fetch/overture_fetch.py`（pyarrow + shapely），港府数据用 `citymap/fetch/landsd_fetch.py`（numpy）。
  两个脚本都把 sha256 写进各自的 `sources.json`；管线读文件时会校验，内容不符就直接报错。

## 红线（PLAN §1 摘要）

- **原创**：名字、HUD、角色、地图结构都原创，不仿任何既有游戏系列的标志性界面元素；文档、代码、产物里都不提这类系列名。
- **地标**：一律用虚构名（海港塔、三稜塔、霓虹中心……），造型只求神似，不按比例复刻，没有 logo 和企业标识。
- **品牌**：产物里没有真实店名、企业名或楼名（构建时按黑名单检查，命中即报错）；街道名、地名保留。
- **敏感区**：军营、军用码头、政府总部、立法会、律政中心、终审法院、礼宾府只做背景，不可交互；
  可玩区离军事用地至少 100 m（有测试）。不出现真实警徽、制服、旗帜；不做示威题材，也不做竹棚倒塌或火灾桥段。
- **暴力**：不用枪，不死人，不流血，不能攻击警察。
- **素材**：只收 CC0、CC-BY、OGA-BY，不用带照片纹理的政府模型和 Google 3D Tiles。

## 预算（SwiftShader 无头浏览器实测）

- R1（复审修正后）：7 个标准机位 × 桌面 / 手机，HIGH draw call 76–102、三角形 32–52 万（含平面反射 pass 约 21 call / 12 万）；
  LOW draw call 53–88、三角形 20–28.5 万。冒烟脚本按机位断言 `calls ≤ 150`、`三角形 ≤ 60 万（LOW ≤ 30 万）`；
  显存账本含画布：手机 DPR 2 约 43 MB，2560×1440 桌面（DPR 降到 0.75）约 61 MB，LOW 桌面约 42 MB（画布 4× MSAA）。
- M0：默认机位 draw call 34–46，默认机位约 19–21 万个三角形（其中地形网格约 7.6 万）。
- 下载：生产服务器（红警的 `packages/server`）**不做压缩，也不发缓存头**。所以构建时另出
  `city/central.json.gz` 与 `city/terrain.bin.gz`，客户端直接下载 .gz 再用 `DecompressionStream` 解压，
  地图数据实际下载 558 KB（MVP 预算 1 MB，测试与冒烟脚本都断言）。JS 232 KB gzip（R1；M0 为 158.6 KB，预算 400 KB），
  但服务器不压缩时实际传约 770 KB，首访合计约 1.31 MB（M0 为 1.15 MB）。
  要再省 JS 那 0.5 MB 并让二次访问走缓存，需要在 `packages/server/src/static.ts` 加 gzip/br 和
  `Cache-Control`（`assets/*` 文件名带哈希，可设 `immutable`），那是红警的代码，由负责人决定。
- 帧率要在真机（iPhone 17）上用 `?perf=1` 看，SwiftShader 的帧率没有参考意义。
