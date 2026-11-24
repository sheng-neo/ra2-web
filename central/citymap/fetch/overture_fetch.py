"""一次性抓取 Overture Maps 快照（渲染范围 v2 + 余量），写进 data-raw/overture-<release>/。

用法（任何带 pyarrow + shapely 的 Python 3.11+ 环境）：
    python central/citymap/fetch/overture_fetch.py
网络：pyarrow S3FileSystem 走 HTTPS_PROXY，CA 用 /root/.ccr/ca-bundle.crt（云会话的代理）。
本机运行时若没有该 CA 文件就用系统默认信任链。

产物（全部 snappy 压缩，hyparquet 无需额外解压器即可读）：
    <layer>.parquet  —— 按 bbox 交叠过滤后的原始行，按 id 排序；保留 GeoParquet 'geo' 元数据
    sources.json     —— 每个文件的图层、S3 路径、版本、许可、sha256、抓取日期、bbox
水体、土地利用、陆地图层里的大多边形（海、港岛本身）会裁剪到范围内，否则单个海面多边形就有数 MB。
裁剪过的行在 sources.json 的 clipped 里计数。管线（TS）只读这些文件，不需要 Python。
"""

import hashlib
import json
import os
import pathlib
import sys
import time

import pyarrow as pa
import pyarrow.compute as pc
import pyarrow.dataset as ds
import pyarrow.fs as pafs
import pyarrow.parquet as pq
import shapely
from shapely import wkb

RELEASE = "2026-11-18.0"
FETCHED = "2026-11-24"
# 渲染/数据范围（v2 + 余量），WGS84
W, S, E, N = 114.1470, 22.2740, 114.1710, 22.2910
BBOX = {"west": W, "south": S, "east": E, "north": N, "crs": "EPSG:4326"}
CA = "/root/.ccr/ca-bundle.crt"

OUT = pathlib.Path(__file__).resolve().parent.parent / "data-raw" / f"overture-{RELEASE}"

# (输出文件名, theme, type, 是否裁剪多边形, 行过滤)
LAYERS = [
    ("building", "buildings", "building", False, None),
    ("segment", "transportation", "segment", False, None),
    ("connector", "transportation", "connector", False, None),
    ("infrastructure", "base", "infrastructure", True, None),
    ("land_use", "base", "land_use", True, None),
    ("water", "base", "water", True, None),
    # base/land 里 subtype=tree 是单棵树（点）和行道树（线）；其余是山林、海岛等大面，不需要
    ("land", "base", "land", True, pc.field("subtype") == "tree"),
]

CC_BY_BUILDINGS = ("CC-BY-4.0 (rows with sources[].dataset = doi:10.5281/zenodo.8174931, East Asian building "
                   "footprints: Shi, Q. et al. 2024, Journal of Remote Sensing)")
# building.parquet 原样转发了这些 CC-BY 行，快照的总署名也要写上（CC-BY 4.0 第 3(a) 节）
CC_BY_ATTRIBUTION = ("building.parquet only: building footprints from Shi, Q. et al. (2024), Journal of Remote "
                     "Sensing, doi:10.5281/zenodo.8174931, CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/)")
LICENSES = {
    "building": ["ODbL-1.0 (OpenStreetMap)", CC_BY_BUILDINGS],
    "segment": ["ODbL-1.0 (OpenStreetMap; TomTom-contributed rows are also ODbL-1.0 per sources[].license)"],
    "connector": ["ODbL-1.0 (OpenStreetMap)"],
    "infrastructure": ["ODbL-1.0 (OpenStreetMap)"],
    "land_use": ["ODbL-1.0 (OpenStreetMap)"],
    "water": ["ODbL-1.0 (OpenStreetMap)"],
    "land": ["ODbL-1.0 (OpenStreetMap)"],
}


def filesystem() -> pafs.S3FileSystem:
    proxy = os.environ.get("HTTPS_PROXY") or os.environ.get("https_proxy")
    kw = {}
    if os.path.exists(CA):
        kw["tls_ca_file_path"] = CA
    return pafs.S3FileSystem(anonymous=True, region="us-west-2", proxy_options=proxy,
                             connect_timeout=30, request_timeout=180, **kw)


def clip_table(tbl: pa.Table) -> tuple[pa.Table, int]:
    """把超出范围的多边形/线裁到范围内（点不动），同步更新 bbox 列。返回 (新表, 裁剪行数)。"""
    rect = shapely.box(W, S, E, N)
    geoms = [wkb.loads(b) for b in tbl.column("geometry").to_pylist()]
    out_geoms, keep, clipped = [], [], 0
    for g in geoms:
        if g.geom_type != "Point" and not rect.contains(g):
            g = shapely.set_precision(shapely.intersection(g, rect), 1e-7)
            clipped += 1
            if g.is_empty:
                keep.append(False)
                out_geoms.append(None)
                continue
        keep.append(True)
        out_geoms.append(g)
    mask = pa.array(keep)
    meta = tbl.schema.metadata
    tbl = tbl.filter(mask)
    out_geoms = [g for g in out_geoms if g is not None]
    geom_col = pa.array([wkb.dumps(g) for g in out_geoms], type=pa.binary())
    bounds = [g.bounds for g in out_geoms]
    bbox_type = tbl.schema.field("bbox").type
    bbox_col = pa.array(
        [{"xmin": b[0], "xmax": b[2], "ymin": b[1], "ymax": b[3]} for b in bounds], type=bbox_type)
    tbl = tbl.set_column(tbl.schema.get_field_index("geometry"), "geometry", geom_col)
    tbl = tbl.set_column(tbl.schema.get_field_index("bbox"), "bbox", bbox_col)
    return tbl.replace_schema_metadata(meta), clipped


def sha256(path: pathlib.Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main() -> int:
    OUT.mkdir(parents=True, exist_ok=True)
    fs = filesystem()
    files = []
    for name, theme, typ, clip, row_filter in LAYERS:
        t0 = time.time()
        s3 = f"overturemaps-us-west-2/release/{RELEASE}/theme={theme}/type={typ}/"
        dataset = ds.dataset(s3, filesystem=fs, format="parquet")
        flt = ((pc.field("bbox", "xmin") < E) & (pc.field("bbox", "xmax") > W) &
               (pc.field("bbox", "ymin") < N) & (pc.field("bbox", "ymax") > S))
        if row_filter is not None:
            flt = flt & row_filter
        tbl = dataset.to_table(filter=flt)
        meta = tbl.schema.metadata
        tbl = tbl.sort_by("id").replace_schema_metadata(meta)
        clipped = 0
        if clip:
            tbl, clipped = clip_table(tbl)
        path = OUT / f"{name}.parquet"
        pq.write_table(tbl, path, compression="snappy", row_group_size=1 << 20)
        files.append({
            "file": path.name,
            "layer": f"{theme}/{typ}",
            "s3": f"s3://{s3}",
            "release": RELEASE,
            "licenses": LICENSES[name],
            "sha256": sha256(path),
            "bytes": path.stat().st_size,
            "rows": tbl.num_rows,
            "clipped": clipped,
            "filter": "bbox overlap" + (" & subtype == 'tree'" if row_filter is not None else ""),
            "fetched": FETCHED,
            "bbox": BBOX,
        })
        print(f"{name}: rows={tbl.num_rows} clipped={clipped} bytes={path.stat().st_size} "
              f"{time.time() - t0:.1f}s", flush=True)
    sources = {
        "dataset": "Overture Maps Foundation",
        "release": RELEASE,
        "attribution": ["© OpenStreetMap contributors", "Overture Maps Foundation", "TomTom (some road segments, ODbL-1.0)",
                        CC_BY_ATTRIBUTION],
        "notes": ("Rows whose bbox overlaps the extent, sorted by id. Non-point geometries in "
                  "infrastructure/land_use/water/land are clipped to the extent (bbox column updated); "
                  "buildings/segments/connectors are untouched. base/land keeps subtype=tree only."),
        "files": files,
    }
    (OUT / "sources.json").write_text(json.dumps(sources, ensure_ascii=False, indent=2) + "\n")
    return 0


if __name__ == "__main__":
    sys.exit(main())
