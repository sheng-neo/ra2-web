"""一次性抓取港府官方高程与建筑数据（全部经 CSDI 空间数据共享平台），写进 data-raw/landsd/。

用法（Python 3.11+，需要 numpy）：
    python central/citymap/fetch/landsd_fetch.py [瓦片缓存目录]
网络：urllib 走 HTTPS_PROXY；CA 用 /root/.ccr/ca-bundle.crt（云会话的代理），本机没有就用系统信任链。
用到的主机：portal.csdi.gov.hk（元数据、瓦片索引、FeatureServer 查询）、bulkdata.csdi.gov.hk（LiDAR 瓦片）。
瓦片 zip（约 70 MB）缓存在仓库外，默认 ~/.cache/central-citymap/cedd-lidar-2020/。

数据源与取舍：
- 地形：CEDD 2020 机载 LiDAR DTM（0.5 m、裸地、HK1980 Grid、mPD）。地政总署 5 m DTM 不用：
  data.gov.hk 的文件在 www.landsd.gov.hk（本环境未放行），CSDI 的下载口有 WAF/reCAPTCHA；
  而且它含高架路和植被顶，LiDAR 裸地模型更合适。
- 建筑：地政总署 Building（BaseHeight/TopHeight，mPD）。
- 行人网络：地政总署 3D Pedestrian Network（PedestrianRoute 线，带 Z）。
两个矢量图层都不取名称字段（楼名、别名里有真实企业名，红线不碰）。

产物：
    cedd-dtm-2020-1m.json      —— 地形网格头（原点、间距、尺寸、无数据值、来源瓦片）
    cedd-dtm-2020-1m.i16.gz    —— int16 小端，高程 dm（mPD），行优先、南→北、行内西→东；
                                  每个整米节点取周围 2×2 个 0.5 m 原始像元的均值（跳过无数据），海面为无数据
    landsd-buildings.geojson.gz         —— FeatureServer 原样 GeoJSON（EPSG:2326），分页合并，float64 无损
    landsd-pedestrian-routes.geojson.gz —— 同上，坐标带 Z（mPD）
    sources.json               —— 每个文件的数据集 ID、URL、格式、CRS、条款、sha256、抓取日期、范围
gzip 固定 mtime=0，同一输入多次运行字节一致。管线（TS）只读这些文件，不需要 Python。
"""

import gzip
import hashlib
import io
import json
import os
import pathlib
import re
import ssl
import struct
import sys
import urllib.parse
import urllib.request
import zipfile

import numpy as np

FETCHED = "2026-11-24"
# 渲染/数据范围（v2 + 余量），WGS84；选 LiDAR 瓦片时再外扩约 50 m
W, S, E, N = 114.1470, 22.2740, 114.1710, 22.2910
TILE_PAD_DEG = 0.0005
# 快照范围（HK1980 Grid，米，整米节点含两端）：渲染范围投影外包 E 833189–835663、N 815017–816900 再留 ≥25 m
GE0, GN0, GE1, GN1 = 833150, 814970, 835700, 816950
GRID_BBOX = {"west": GE0, "south": GN0, "east": GE1, "north": GN1, "crs": "EPSG:2326"}
NODATA_I16 = -32768
CA = "/root/.ccr/ca-bundle.crt"
UA = "central-citymap-fetch/1.0"

OUT = pathlib.Path(__file__).resolve().parent.parent / "data-raw" / "landsd"
PORTAL = "https://portal.csdi.gov.hk"

CEDD_ID = "cedd_rcd_1629267205233_87895"
BUILDING_ID = "landsd_rcd_1637211194312_35158"
PED_ID = "landsd_rcd_1637222018065_52265"

BUILDING_FIELDS = ["OBJECTID", "BuildingID", "BuildingCSUID", "GeoRefNo", "BuildingBlockType", "Status",
                   "BaseHeight", "TopHeight", "Storeys", "StoreysInBasement", "DateStamp"]
PED_FIELDS = ["OBJECTID", "PedestrianRouteID", "Location", "FeatureType", "CrossingFeature", "WeatherProof",
              "Gradient", "Direction", "FloorID", "BuildingID_1", "BuildingID_2", "Enabled", "LevelSource"]

TERMS = "CSDI Portal Terms and Conditions of Use (see TERMS.md)"


def ssl_context() -> ssl.SSLContext:
    return ssl.create_default_context(cafile=CA) if os.path.exists(CA) else ssl.create_default_context()


CTX = ssl_context()


def get(url: str, params: dict | None = None) -> bytes:
    if params:
        url = url + "?" + urllib.parse.urlencode(params)
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, context=CTX, timeout=600) as r:
        return r.read()


def sha256(b: bytes) -> str:
    return hashlib.sha256(b).hexdigest()


def metadata_layer_name(dataset_id: str, layer: str) -> str:
    """从 ISO 元数据里找 file-api 资源名，如 Building_Outline_Public_v20261020_Building_converted.geojson。"""
    xml = get(f"{PORTAL}/geoportal/rest/metadata/item/{dataset_id}/xml").decode("utf-8")
    m = re.search(r"<gco:CharacterString>([^<]*_" + re.escape(layer) + r"_converted\.geojson)</gco:CharacterString>", xml)
    if not m:
        raise SystemExit(f"{dataset_id}: 元数据里找不到图层 {layer} 的资源名")
    return m.group(1)


# ---------------------------------------------------------------- GeoTIFF（未压缩 float32，够读 CEDD 瓦片）

TIFF_TYPES = {1: "B", 2: "s", 3: "H", 4: "I", 6: "b", 8: "h", 9: "i", 11: "f", 12: "d", 16: "Q"}
TIFF_SIZES = {"B": 1, "s": 1, "H": 2, "I": 4, "b": 1, "h": 2, "i": 4, "f": 4, "d": 8, "Q": 8}


def tiff_tags(b: bytes) -> tuple[str, dict]:
    bo = "<" if b[:2] == b"II" else ">"
    if struct.unpack(bo + "H", b[2:4])[0] != 42:
        raise ValueError("不是经典 TIFF")
    off = struct.unpack(bo + "I", b[4:8])[0]
    n = struct.unpack(bo + "H", b[off:off + 2])[0]
    tags = {}
    for i in range(n):
        e = b[off + 2 + 12 * i: off + 14 + 12 * i]
        tag, typ, cnt = struct.unpack(bo + "HHI", e[:8])
        fmt = TIFF_TYPES[typ]
        size = TIFF_SIZES[fmt] * cnt
        data = e[8:12] if size <= 4 else b[struct.unpack(bo + "I", e[8:12])[0]:][:size]
        tags[tag] = data[:cnt].rstrip(b"\0").decode("latin1") if fmt == "s" else struct.unpack(bo + fmt * cnt, data[:size])
    return bo, tags


def read_geotiff(b: bytes) -> tuple[np.ndarray, float, float, float, float]:
    """返回 (高程数组[行=北→南], 左上角 E, 左上角 N, 像元大小, 无数据值)。"""
    bo, t = tiff_tags(b)
    w, h = t[256][0], t[257][0]
    if t[258][0] != 32 or t.get(339, (1,))[0] != 3 or t.get(259, (1,))[0] != 1 or t.get(277, (1,))[0] != 1:
        raise ValueError("只支持单波段、未压缩 float32")
    if "Hong_Kong_1980_Grid" not in t.get(34737, ""):
        raise ValueError("坐标系不是 HK1980 Grid")
    sx, sy = t[33550][0], t[33550][1]
    if sx != sy:
        raise ValueError("像元不是正方形")
    ox, oy = t[33922][3], t[33922][4]
    nodata = float(t[42113]) if 42113 in t else float("nan")
    dt = np.dtype(bo + "f4")
    a = np.empty((h, w), np.float32)
    if 322 in t:
        tw, th = t[322][0], t[323][0]
        across = (w + tw - 1) // tw
        for k, o in enumerate(t[324]):
            r, c = divmod(k, across)
            tile = np.frombuffer(b, dt, tw * th, o).reshape(th, tw)
            rh, cw = min(th, h - r * th), min(tw, w - c * tw)
            a[r * th:r * th + rh, c * tw:c * tw + cw] = tile[:rh, :cw]
    else:
        rps = t.get(278, (h,))[0]
        for k, o in enumerate(t[273]):
            rows = min(rps, h - k * rps)
            a[k * rps:k * rps + rows] = np.frombuffer(b, dt, rows * w, o).reshape(rows, w)
    return a, ox, oy, sx, nodata


def fetch_dtm(cache: pathlib.Path) -> tuple[list[dict], dict]:
    index_name = metadata_layer_name(CEDD_ID, "DTM_2020")
    index = json.loads(get(f"{PORTAL}/csdi-webpage/file-api",
                           {"dataset_id": CEDD_ID, "format": "geojson", "layer_name": "DTM_2020"}))
    w, s, e, n = W - TILE_PAD_DEG, S - TILE_PAD_DEG, E + TILE_PAD_DEG, N + TILE_PAD_DEG
    tiles = []
    for f in index["features"]:
        xs = [c[0] for c in f["geometry"]["coordinates"][0]]
        ys = [c[1] for c in f["geometry"]["coordinates"][0]]
        if max(xs) > w and min(xs) < e and max(ys) > s and min(ys) < n:
            tiles.append(f["properties"])
    tiles.sort(key=lambda p: p["TILE_NAME"])
    print(f"LiDAR DTM 2020：{len(tiles)} 块瓦片（索引 {index_name}）")

    res = 0.5
    # 0.5 m 拼接画布：覆盖每个整米节点左右各 0.5 m
    mw, mh = int((GE1 - GE0 + 1) / res), int((GN1 - GN0 + 1) / res)
    left, top = GE0 - 0.5, GN1 + 0.5
    mosaic = np.full((mh, mw), np.nan, np.float32)
    cache.mkdir(parents=True, exist_ok=True)
    used = []
    for p in tiles:
        z = cache / p["Filename"]
        if not z.exists():
            z.write_bytes(get(urllib.parse.quote(p["URL"], safe=":/")))
        zb = z.read_bytes()
        with zipfile.ZipFile(io.BytesIO(zb)) as zf:
            (name,) = [m for m in zf.namelist() if m.lower().endswith(".tif")]
            a, ox, oy, px, nodata = read_geotiff(zf.read(name))
        if px != res:
            raise SystemExit(f"{name}: 像元 {px} m，期望 {res} m")
        a = np.where(a == nodata, np.nan, a) if not np.isnan(nodata) else a
        c0, r0 = int(round((ox - left) / res)), int(round((top - oy) / res))
        rs, cs = max(r0, 0), max(c0, 0)
        re_, ce = min(r0 + a.shape[0], mh), min(c0 + a.shape[1], mw)
        if rs < re_ and cs < ce:
            sub = a[rs - r0:re_ - r0, cs - c0:ce - c0]
            np.copyto(mosaic[rs:re_, cs:ce], sub, where=~np.isnan(sub))
        used.append({"tile": p["TILE_NAME"], "file": p["Filename"], "url": p["URL"],
                     "sha256": sha256(zb), "bytes": len(zb)})

    # 2×2 均值 → 整米节点（北→南），再翻成南→北
    blocks = mosaic.reshape(mh // 2, 2, mw // 2, 2)
    valid = ~np.isnan(blocks)
    cnt = valid.sum(axis=(1, 3))
    tot = np.where(valid, blocks, 0).sum(axis=(1, 3), dtype=np.float64)
    mean = np.divide(tot, cnt, out=np.zeros_like(tot), where=cnt > 0)
    dm = np.clip(np.round(mean * 10), -32767, 32767).astype("<i2")
    dm[cnt == 0] = NODATA_I16
    grid = np.ascontiguousarray(dm[::-1])
    ny, nx = grid.shape
    assert (nx, ny) == (GE1 - GE0 + 1, GN1 - GN0 + 1)
    data = gzip.compress(grid.tobytes(), 9, mtime=0)
    land = grid[grid != NODATA_I16]
    print(f"  网格 {nx}×{ny}，陆地 {land.size / grid.size:.1%}，"
          f"高程 {land.min() / 10:.1f}–{land.max() / 10:.1f} mPD，gzip {len(data)} B")

    header = {
        "format": "central-dtm-raw",
        "version": 1,
        "source": "CEDD LiDAR DTM 2020 (0.5 m, bare earth)",
        "datasetId": CEDD_ID,
        "crs": "EPSG:2326",
        "verticalDatum": "Hong Kong Principal Datum (mPD)",
        "e0": GE0,
        "n0": GN0,
        "cell": 1,
        "nx": nx,
        "ny": ny,
        "unit": "dm",
        "nodata": NODATA_I16,
        "data": "cedd-dtm-2020-1m.i16.gz",
        "layout": "int16 little-endian, gzip; index = j*nx + i; sample (i, j) at E = e0 + i*cell, N = n0 + j*cell "
                  "(metres, HK1980 Grid); rows south to north, west to east within a row",
        "resample": "mean of the valid native 0.5 m pixels inside the 1 m cell centred on each integer-metre node, "
                    "rounded to decimetres; sea and no-data = nodata",
        "tiles": used,
    }
    hb = (json.dumps(header, indent=2, ensure_ascii=False) + "\n").encode()
    (OUT / "cedd-dtm-2020-1m.json").write_bytes(hb)
    (OUT / "cedd-dtm-2020-1m.i16.gz").write_bytes(data)
    common = {"layer": "cedd/lidar-dtm-2020", "datasetId": CEDD_ID,
              "url": f"{PORTAL}/geoportal/?datasetId={CEDD_ID}", "release": "2020 (flown 2019-12-20 to 2020-02-02)",
              "crs": "EPSG:2326 + mPD", "licenses": [TERMS], "fetched": FETCHED, "bbox": GRID_BBOX,
              "tileIndex": f"{PORTAL}/csdi-webpage/file-api?dataset_id={CEDD_ID}&format=geojson&layer_name=DTM_2020",
              "tileIndexName": index_name}
    entries = [
        {"file": "cedd-dtm-2020-1m.json", **common, "format": "JSON grid header (written by landsd_fetch.py)",
         "sha256": sha256(hb), "bytes": len(hb), "rows": 1},
        {"file": "cedd-dtm-2020-1m.i16.gz", **common,
         "format": "gzip int16 LE dm grid, 1 m, resampled from GeoTIFF float32 0.5 m tiles",
         "sha256": sha256(data), "bytes": len(data), "rows": int(nx * ny),
         "derivedFrom": [{k: u[k] for k in ("tile", "url", "sha256", "bytes")} for u in used]},
    ]
    return entries, header


# ---------------------------------------------------------------- FeatureServer 分页查询

def fetch_features(dataset_id: str, layer: str, fields: list[str], out_name: str, z: bool) -> dict:
    base = f"{PORTAL}/server/rest/services/common/{dataset_id}/FeatureServer/0/query"
    q = {"where": "1=1",
         "geometry": json.dumps({"xmin": GE0, "ymin": GN0, "xmax": GE1, "ymax": GN1}, separators=(",", ":")),
         "geometryType": "esriGeometryEnvelope", "inSR": "2326", "outSR": "2326",
         "spatialRel": "esriSpatialRelIntersects"}
    count = json.loads(get(base, {**q, "returnCountOnly": "true", "f": "json"}))["count"]
    feats, off, page = [], 0, 2000
    while off < count:
        d = json.loads(get(base, {**q, "outFields": ",".join(fields), "returnZ": str(z).lower(),
                                  "orderByFields": "OBJECTID", "resultOffset": off, "resultRecordCount": page,
                                  "f": "geojson"}))
        feats += d["features"]
        off += page
    ids = [f["properties"]["OBJECTID"] for f in feats]
    if len(feats) != count or len(set(ids)) != count:
        raise SystemExit(f"{dataset_id}: 期望 {count} 个要素，实际 {len(feats)}（去重 {len(set(ids))}）")
    feats.sort(key=lambda f: f["properties"]["OBJECTID"])
    fc = {"type": "FeatureCollection", "crs": {"type": "name", "properties": {"name": "EPSG:2326"}}, "features": feats}
    # json 的 float repr 可往返，合并分页不损失精度
    data = gzip.compress(json.dumps(fc, separators=(",", ":"), ensure_ascii=False).encode(), 9, mtime=0)
    (OUT / out_name).write_bytes(data)
    name = metadata_layer_name(dataset_id, layer)
    m = re.search(r"_v?(\d{8})_", name)
    release = f"{m.group(1)[:4]}-{m.group(1)[4:6]}-{m.group(1)[6:]}" if m else name
    print(f"{dataset_id}/{layer}：{count} 个要素，gzip {len(data)} B（版本 {release}）")
    return {"file": out_name, "layer": f"landsd/{layer}", "datasetId": dataset_id,
            "url": f"{PORTAL}/geoportal/?datasetId={dataset_id}", "query": base, "release": release,
            "releaseName": name, "format": f"gzip GeoJSON from ArcGIS FeatureServer (f=geojson{', returnZ' if z else ''})",
            "crs": "EPSG:2326" + (" + mPD (Z)" if z else "; BaseHeight/TopHeight in mPD"),
            "fields": fields, "licenses": [TERMS], "fetched": FETCHED, "bbox": GRID_BBOX,
            "sha256": sha256(data), "bytes": len(data), "rows": count}


def main() -> None:
    cache = pathlib.Path(sys.argv[1]) if len(sys.argv) > 1 else \
        pathlib.Path(os.environ.get("XDG_CACHE_HOME", pathlib.Path.home() / ".cache")) / "central-citymap" / "cedd-lidar-2020"
    OUT.mkdir(parents=True, exist_ok=True)
    files, _ = fetch_dtm(cache)
    files.append(fetch_features(BUILDING_ID, "Building", BUILDING_FIELDS, "landsd-buildings.geojson.gz", False))
    files.append(fetch_features(PED_ID, "PedestrianRoute", PED_FIELDS, "landsd-pedestrian-routes.geojson.gz", True))
    manifest = {
        "dataset": "HKSAR Government open data via the CSDI Portal (CEDD LiDAR DTM 2020; LandsD Building; "
                   "LandsD 3D Pedestrian Network)",
        "release": FETCHED,
        # 与 TERMS.md 第 4 节逐字一致
        "attribution": [
            "Contains data from the Lands Department and the Civil Engineering and Development Department, "
            "HKSAR Government, obtained from the Common Spatial Data Infrastructure (CSDI) Portal "
            "(portal.csdi.gov.hk). Intellectual property rights in the data are owned by the Government of the "
            "Hong Kong Special Administrative Region. The data have been processed (resampled/converted) for this "
            "game; the Government is not responsible for, and does not endorse, this game.",
            "部分資料來源：香港特別行政區政府地政總署及土木工程拓展署，經空間數據共享平台（CSDI，portal.csdi.gov.hk）取得；"
            "資料的知識產權屬香港特別行政區政府所有。資料已為本遊戲重新取樣及轉換，政府不對本遊戲負責，亦不代表政府認可。",
        ],
        "terms": "TERMS.md",
        "notes": "All queries/clips use the HK1980 Grid bbox in 'bbox'. Vector layers keep the FeatureServer GeoJSON "
                 "as returned (pages merged, float64-exact) minus name fields. The DTM is resampled from 0.5 m to "
                 "1 m (see cedd-dtm-2020-1m.json); the original tile zips are listed with their sha256 in derivedFrom.",
        "files": files,
    }
    # 保留别的抓取脚本写的条目（landsd_3d_fetch.py 的 landsd-3dvm-parts.json.gz）
    old = OUT / "sources.json"
    if old.exists():
        mine = {f["file"] for f in files}
        manifest["files"] += [f for f in json.loads(old.read_text(encoding="utf-8"))["files"] if f["file"] not in mine]
    (OUT / "sources.json").write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    total = sum(f["bytes"] for f in files)
    print(f"写入 {OUT}，共 {total} B")


if __name__ == "__main__":
    main()
