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

## 哪些文件 M0 用到了

- 用到：`segment`、`infrastructure`、`land_use`、`water`、`land`（Overture）；`landsd-buildings`、`cedd-dtm-2020-1m`、
  `landsd-3dvm-parts`（R2 起，港府）。
- 暂未用到，留给后续里程碑：`connector.parquet`（M3 车道图）、`landsd-pedestrian-routes`（v1 天桥与扶梯）、
  `building.parquet`（只在 `pnpm citymap --buildings=overture` 对照时用；产物的建筑层来自地政总署）。
  是否先从仓库里删掉这些文件，由项目负责人决定（共约 2.1 MB）。
