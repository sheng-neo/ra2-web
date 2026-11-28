# data-raw：原始数据快照（不属于 MIT）

仓库根目录的 MIT 许可**只覆盖代码**。本目录和管线产物 `central/client/public/city/` 里的数据各有自己的许可，
不能当作 MIT 使用，也不另加任何许可：

| 位置 | 内容 | 许可 |
|---|---|---|
| `overture-2026-11-18.0/` | Overture Maps 快照（GeoParquet） | ODbL-1.0（OpenStreetMap；`segment.parquet` 里有 23 段来自 TomTom，同为 ODbL-1.0） |
| `overture-2026-11-18.0/building.parquet` 中 `sources[].license = CC-BY-4.0` 的 264 行 | 东亚建筑轮廓（Shi, Q. et al. 2024, doi:10.5281/zenodo.8174931） | CC-BY-4.0，需署名 |
| `landsd/` | 地政总署建筑与行人网络、土木工程拓展署 LiDAR DTM（经 CSDI 取得）；地政总署可視化三維地圖（無紋理模型）派生的分层屋面轮廓（经 CSDI 索引与 3d.map.gov.hk 下载接口取得） | CSDI 与可視化三維地圖网站使用条款（见 [`landsd/TERMS.md`](landsd/TERMS.md)），不是开放许可，不可再许可 |
| `../../client/public/city/central.json` | 管线产物：道路、电车轨、海面、区域、道具点 | ODbL-1.0（衍生数据库，见同目录 `LICENSE-ODbL.txt`） |
| 同上：建筑与地标数组、`terrain.bin` | 管线产物：港府数据 | CSDI 使用条款（见同目录 `ATTRIBUTION.txt`） |

每个快照目录的 `sources.json` 列出了每个文件的来源、许可、抓取日期和 sha256；管线读文件时逐个校验。

## `landsd/landsd-3dvm-parts.json.gz`（细节一轮 R2）

由 `fetch/landsd_3d_fetch.py` 生成（Python 3.11+ 与 numpy；说明见脚本文件头）。它一幅一幅下载渲染范围内的 16 幅
1:1000 图幅 zip（无纹理 glTF，每幅约 30–60 MB），只读 `BUILDING/*` 的网格，在内存里派生，然后删掉 zip。仓库里**只有派生结果**：
没有网格、贴图、名称，也没有 `TERRAIN(TB)` 里的正射影像（从不打开）。每个 zip 的下载地址（去掉 key）、版本日期与 sha256
记在 `sources.json` 该文件条目的 `derivedFrom` 里。

表达方式（「叠层棱柱」）——为什么不是真网格：样本图幅 11-SW-9C（皇后像广场）78 个对象 27 万三角形，面积里水平面占 56 %、
竖直面 42 %、斜面只有 2 %；52 栋有 ≥ 2 层屋面、32 栋 ≥ 6 层。也就是说中环的楼几乎全是「竖墙 + 平顶」叠起来的，
退台、塔冠、天台机房、坡屋顶（切成台阶）都能用「每层一个轮廓 + 顶高」表达，比真网格小两个数量级，
又能沿用现有的程序立面（楼层线、窗格、亮灯）。快照里每栋 3D 楼存：

- `id`：地政总署模型编号（与 2D Building 的 GeoRefNo 同源的位置编码，不是名称）；`sheet`：图幅号；
- `base`：模型最低点（dm，mPD）；
- `levels`：按 `top`（dm，mPD）升序；第 k 层的 `polys` = 高度 ≥ 第 k 层的全部屋面投影的并集（[外环, 洞...]，
  HK1980 Grid 米，0.25 m 的整数倍；外环逆时针、洞顺时针）。

派生步骤：朝上（含坡面，|法线 z| ≥ 0.2）的三角形按 0.25 m 格栅化成「最高屋面高度图」→ 屋面高度按 0.5 m 容差聚层
（单层跨度 ≤ 1 m，代表高度取面积加权中位数）→ 逐层累积掩膜（自动是并集、逐层嵌套）→ 3×3 开运算去掉 ≤ 0.5 m 宽的
女儿墙、栏杆、竖鳍 → 去掉 < 0.75 m² 的碎块 → 沿格边追踪轮廓 → Douglas–Peucker 0.25 m。
更粗的合层（< 1.5 m 的台阶并掉、坡面切成 2–3 m 台阶、窄于 1 m 的边条并到上层、露出墙面 < 80 m² 的小块并掉、每栋 ≤ 12 块）、
与 2D 楼的匹配（覆盖 + 楼底 + 主屋面高度三者一致）、
敏感区与地标遮罩都在管线 `src/stages/building-parts.ts` 里做（调参不用重新下载）。

## `landsd/landsd-3dvm-facades.json.gz` 与 `client/public/city/facades/*.webp`（真实贴面一轮 R3）

由 `fetch/landsd_3d_tex_bake.py` 生成（Python 3.11+、numpy、Pillow 自带的 libwebp；不需要任何额外工具；说明见脚本文件头，
条款见 `landsd/TERMS.md` 第 8 节）。数据集是地政总署「可視化三維地圖（個別模型）」**带照片纹理**的 glTF（同一网站、同一条款）。
脚本一幅一幅下载 16 幅图幅 zip（每幅 0.04–2.7 GB，共约 15.5 GB），只读 `BUILDING/*`，把每个模型的照片三角形**投影到我们自己的墙面与屋面**
（墙：每个环展开成「周长 × 高度」的墙带；屋顶：每块棱柱外环外包框上的俯视图），逐幅把投影结果缓存到仓库外的目录（可随时中断续跑），
然后删 zip。打包时再按楼去日照、分玻璃 / 实墙 / 独立窗、按 4 px/m（墙）/ 3 px/m（屋顶）重新取样、按 Hilbert 序装进 1024² 的页。
仓库里**只有派生结果**：每页一个 RGBA WebP（颜色有损；alpha 无损，是「无照片 / 连续玻璃度 / 独立窗种子」码），一张远景图集（每页缩成 128²）
与它的半分辨率版（LOW 档），文件名带内容哈希；没有网格、原始贴图、名称或 zip。清单 `landsd-3dvm-facades.json.gz` 记：

- 参数（页边长、切片宽、密度量化、alpha 码的含义）、每个页文件与远景图集的 sha256 与字节数；
- 每栋楼：几何指纹（轮廓、楼底、楼高、分层体块的 sha256 前 12 位，管线按它把引用接回 `Building.facade`，几何变了的楼自动退回程序立面）、
  检测到的层高与楼层线相位、每块棱柱的密度与每片墙 / 屋顶在页里的位置与外包框；
- `excluded`：敏感区里的楼、照片里有脚手架 / 绿网 / 工地围板的楼（自动检测 + 人工复查）；`stats`：模型数、三角形、投影像素、页数等。

`pnpm citymap` 只读清单、校验每个页文件的 sha256 与字节数、把引用接到楼上（`src/stages/facades.ts`），不碰图像、不需要 Python。
这些 WebP 存在 Git LFS 里（`.gitattributes`；负责人 2026-11-26，D4）：克隆前 `git lfs install`，或克隆后补跑 `git lfs install && git lfs pull`；
否则文件只是约 130 字节的指针，这里的 sha256 校验会失败（见 `central/README.md`「怎么跑」）。

## `landsd/landsd-3dvm-hires.json.gz` 与 `client/public/city/facades/h*.webp`（电车走廊高清街面层 R4）

由 `fetch/landsd_3d_hires_bake.py` 生成（Python 3.11+、numpy、Pillow；不需要额外工具；条款见 `landsd/TERMS.md` 第 8.1 节）。
同一数据集（带照片纹理的个别模型），只做电车沿线的街墙：先按轨道、楼外环与平面视线挑「走廊面」（307 栋、1012 个面、约 13.8 km），
只下载走廊触到的图幅（一幅一幅、Range 续传），把照片投影到这些面离地 0–45 m 的「高清带」（街面段 0–15 m 按 36 px/m 累积、输出 24 px/m；
上段 15–45 m 累积 18、输出 12 px/m），逐幅缓存到仓库外，投影完删 zip。某幅还没有高清缓存时，碰到这幅的走廊楼退回 R3 已缓存的
6 px/m 投影（同样的分类与浮雕）。竹棚、灰色棚网、围板样平板、临时横幅与源数据贴图错误按人工复查清单整面 / 整栋排除（脚本里的
`MANUAL_EXCLUDE_FACES` / `MANUAL_EXCLUDE_BUILDINGS`）。
打包时逐段：去日照（与 R3 同一参考亮度）、补树、绿网复查、玻璃 / 独立窗（R3 码）、**店面开口**（街面段里暗的 / 玻璃 / 凹进去的、落到街面的块，
逐铺种子）、**招牌**（饱和、有笔画的板，按自己的颜色发光）、绿化墙（不亮窗）、**墙面后退深度**（最外面的面到立面前沿，0–2.5 m，视差用）、
**雨篷**（模型里伸出外墙的近水平板；没有模型时按深度图里凸出的檐口）。页是 1024 × 1536 的 RGBA WebP：上 1024 行颜色 + R3 alpha 码，
下 512 行左半是半分辨率辅助图（R 后退深度、G 店面、B 招牌、A 店铺种子，A 无损）；街面段与上段分两套页（`hs*` / `hu*`），按沿线顺序装箱。
清单记每个面每段的密度、高程范围与切片位置、每栋的雨篷、页文件 sha256、排除的楼 / 面与统计；`pnpm citymap`（`src/stages/hires.ts`）
只校验 sha256 并按几何指纹接到 `Building.hires`，`meta.hires` 给出页表。页文件同样在 Git LFS 里（`.gitattributes` 已覆盖 `facades/*.webp`）。

`landsd/landsd-3dvm-hires-bays.json.gz`（R4 整合，路面铺面溢光的数据）：由 `fetch/landsd_3d_hires_bays.py` 从**已打包的**街面页
（`hs*.webp` 的辅助图 G 店面开口 / A 店铺种子）读出每间铺在墙上的位置、种子与开口高度（不联网、不需要烘焙缓存，Python + numpy + Pillow；
gzip mtime 0，逐字节可复现，`--check` 只比较）。清单记全部页的摘要 `pagesDigest`，`stages/hires.ts` 只在摘要与高清清单一致时把铺位接到
`Building.hires.b`，否则报错。**重新烘焙高清页（`--finalize-only`）之后必须重跑这个脚本**，再 `pnpm citymap`。

## 哪些文件 M0 用到了

- 用到：`segment`、`infrastructure`、`land_use`、`water`、`land`（Overture）；`landsd-buildings`、`cedd-dtm-2020-1m`、
  `landsd-3dvm-parts`（R2 起，港府）、`landsd-3dvm-facades`（R3 起，港府）。
- 暂未用到，留给后续里程碑：`connector.parquet`（M3 车道图）、`landsd-pedestrian-routes`（v1 天桥与扶梯）、
  `building.parquet`（只在 `pnpm citymap --buildings=overture` 对照时用；产物的建筑层来自地政总署）。
  是否先从仓库里删掉这些文件，由项目负责人决定（共约 2.1 MB）。
