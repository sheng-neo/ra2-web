# data-raw：原始数据快照（不属于 MIT）

仓库根目录的 MIT 许可**只覆盖代码**。本目录和管线产物 `central/client/public/city/` 里的数据各有自己的许可，
不能当作 MIT 使用，也不另加任何许可：

| 位置 | 内容 | 许可 |
|---|---|---|
| `overture-2026-11-18.0/` | Overture Maps 快照（GeoParquet） | ODbL-1.0（OpenStreetMap；`segment.parquet` 里有 23 段来自 TomTom，同为 ODbL-1.0） |
| `overture-2026-11-18.0/building.parquet` 中 `sources[].license = CC-BY-4.0` 的 264 行 | 东亚建筑轮廓（Shi, Q. et al. 2024, doi:10.5281/zenodo.8174931） | CC-BY-4.0，需署名 |
| `landsd/` | 地政总署建筑与行人网络、土木工程拓展署 LiDAR DTM（经 CSDI 取得） | CSDI 使用条款（见 [`landsd/TERMS.md`](landsd/TERMS.md)），不是开放许可，不可再许可 |
| `../../client/public/city/central.json` | 管线产物：道路、电车轨、海面、区域、道具点 | ODbL-1.0（衍生数据库，见同目录 `LICENSE-ODbL.txt`） |
| 同上：建筑与地标数组、`terrain.bin` | 管线产物：港府数据 | CSDI 使用条款（见同目录 `ATTRIBUTION.txt`） |

每个快照目录的 `sources.json` 列出了每个文件的来源、许可、抓取日期和 sha256；管线读文件时逐个校验。

## 哪些文件 M0 用到了

- 用到：`segment`、`infrastructure`、`land_use`、`water`、`land`（Overture）；`landsd-buildings`、`cedd-dtm-2020-1m`（港府）。
- 暂未用到，留给后续里程碑：`connector.parquet`（M3 车道图）、`landsd-pedestrian-routes`（v1 天桥与扶梯）、
  `building.parquet`（只在 `pnpm citymap --buildings=overture` 对照时用；产物的建筑层来自地政总署）。
  是否先从仓库里删掉这些文件，由项目负责人决定（共约 2.1 MB）。
