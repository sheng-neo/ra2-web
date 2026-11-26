"""一次性抓取地政总署「可視化三維地圖（無紋理模型）」的建筑，只把派生的分层轮廓写进 data-raw/landsd/。

用法（Python 3.11+，只需 numpy）：
    python central/citymap/fetch/landsd_3d_fetch.py            # 下载渲染范围内的全部图幅，写快照
    python central/citymap/fetch/landsd_3d_fetch.py --zip A.zip [--zip B.zip] --out DIR
                                                              # 开发用：处理本地已有的 zip，写到 DIR，不碰 data-raw
网络：urllib 走 HTTPS_PROXY；CA 用 /root/.ccr/ca-bundle.crt（云会话的代理），本机没有就用系统信任链。
用到的主机：portal.csdi.gov.hk（图幅索引 FeatureServer）、download.map.gov.hk（图幅 zip）。

数据集：3D Visualisation Map (Non-textured models)，CSDI landsd_rcd_1742809441342_98380，
每幅 1:1000 图幅一个 zip（glTF 2.0，FME 导出；HK1980 Grid 绝对坐标，Y 向上 = mPD，Z = −北）。
只用 GLTF0（无纹理）路径；不带 0 的 GLTF/ 是带照片纹理的版本，PLAN §1 红线不用。
下载口的 key 每次从 CSDI 图幅索引读（索引里的 Format_glTF 链接），不写死在这里。

处理（全部在内存 / 临时目录里，一幅一幅来，约 46 MB 一幅）：
1. 渲染范围：读 central/client/public/city/central.json 的 meta.origin + meta.bbox（米），
   用 CSDI FeatureServer 的 envelope 查询（inSR/outSR = 2326）选出相交的图幅；
2. 每幅：下载到临时目录 → 只读 BUILDING/<id>/<id>.gltf + .bin（不读 INFRASTRUCTURE、TERRAIN(TB)，
   TERRAIN 里的正射影像 JPG 从不打开、不解压、不保存）→ 算完删 zip；
3. 每栋楼（一个 glTF）：朝上的面（|nz| ≥ 0.2，含坡屋顶）按 0.25 m 格栅化成「最高屋面高度图」→
   屋面高度按 0.5 m 容差聚成若干层（单层跨度 ≤ 1 m，坡屋顶因此变成约 1 m 的台阶）→
   第 k 层轮廓 = 高度 ≥ 第 k 层的全部格（即所有更高屋面投影的并集，逐层嵌套）→
   3×3 开运算去掉 ≤ 0.5 m 宽的女儿墙、栏杆、竖鳍 → 去掉 < 0.75 m² 的碎块 → 沿格边追踪轮廓（外环逆时针、洞顺时针）→
   Douglas–Peucker 0.25 m 简化。更粗的合层（≥ 1.5 m 才算一层、2–3 m 台阶、每栋 ≤ 12 块）、与地政总署 2D 楼的匹配、
   敏感区 / 地标遮罩都在管线（central/citymap/src/stages/building-parts.ts）里做，可以不重新下载就调；
4. 跨图幅重复的楼（同一 ID）只留一份；楼的外包框与渲染范围（外扩 20 m）不相交的丢掉。

产物：
    landsd-3dvm-parts.json.gz —— 每栋 3D 楼的 ID（地政总署模型编号，不是名称）、所在图幅、最低点高程（dm）、
                                 各层 {top: dm mPD, polys: [[外环, 洞...], ...]}，坐标为 HK1980 Grid 米（0.25 m 的整数倍）；
                                 键序固定、gzip mtime=0，同一输入重跑逐字节一致
    sources.json               —— 更新（保留其他文件的条目）：本文件的条目，derivedFrom 列出每幅 zip 的
                                 下载地址（去掉 key）、版本日期、sha256、字节数
不写入任何网格原文、名称、贴图或 zip。
"""

import argparse
import gzip
import hashlib
import json
import os
import pathlib
import posixpath
import ssl
import sys
import tempfile
import time
import urllib.parse
import urllib.request
import zipfile

import numpy as np

FETCHED = "2026-11-25"
DATASET_ID = "landsd_rcd_1742809441342_98380"
PORTAL = "https://portal.csdi.gov.hk"
INDEX_QUERY = f"{PORTAL}/server/rest/services/common/{DATASET_ID}/FeatureServer/0/query"
CA = "/root/.ccr/ca-bundle.crt"
UA = "central-citymap-fetch/1.0"
# 下载口条款：不得在短时间内大量请求；图幅之间停一下
PAUSE_S = 3.0

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / "data-raw" / "landsd"
CITY = ROOT.parent / "client" / "public" / "city" / "central.json"
OUT_FILE = "landsd-3dvm-parts.json.gz"
TERMS = "CSDI Portal Terms and Conditions of Use; 3D Visualisation Map Terms and Conditions of Use (see TERMS.md)"
# 与 TERMS.md 第 7 节、src/stages/terrain-refs.ts 的 REF_LANDSD_3DVM 逐字一致
ATTRIBUTION = [
    "Contains 3D building data from the Lands Department, HKSAR Government (3D Visualisation Map, Non-textured models), "
    "obtained from the 3D Visualisation Map website (3d.map.gov.hk) through the Common Spatial Data Infrastructure (CSDI) "
    "Portal (portal.csdi.gov.hk). Intellectual property rights in the data are owned by the Government of the Hong Kong "
    "Special Administrative Region. The data have been processed (roof surfaces of the 3D models converted to simplified "
    "stacked outlines and fitted to the 2D building footprints; no meshes or textures kept) for this game; the Government "
    "is not responsible for, and does not endorse, this game.",
    "部分資料來源：香港特別行政區政府地政總署「可視化三維地圖（無紋理模型）」，經可視化三維地圖網站（3d.map.gov.hk）"
    "及空間數據共享平台（CSDI，portal.csdi.gov.hk）取得；資料的知識產權屬香港特別行政區政府所有。資料已為本遊戲轉換"
    "（三維模型的屋面簡化為分層輪廓並套合二維建築輪廓，不保留網格及紋理），政府不對本遊戲負責，亦不代表政府認可。",
]
DATASET_NOTE = "LandsD 3D Visualisation Map (Non-textured models)"

CELL = 0.25          # 栅格边长（米）
MIN_NZ = 0.2         # 朝上面的法线 z 下限（约 78° 以内的坡面都算屋面）
JOIN_M = 0.5         # 屋面高度聚类：相邻高度差 ≤ 0.5 m 归一层
SPAN_M = 1.0         # 单层高度跨度上限（坡屋顶切成约 1 m 的台阶）
MIN_PIECE_M2 = 0.75  # 每层轮廓里小于此面积的碎块丢掉
SIMPLIFY_M = 0.25    # Douglas–Peucker 容差
MAX_LEVELS = 32      # 每栋楼最多保留的层数（超出时合并「墙面积」最小的层）
BBOX_PAD_M = 20.0

CT = {5120: np.int8, 5121: np.uint8, 5122: np.int16, 5123: np.uint16, 5125: np.uint32, 5126: np.float32}
NC = {"SCALAR": 1, "VEC2": 2, "VEC3": 3, "VEC4": 4, "MAT4": 16}


def ssl_context() -> ssl.SSLContext:
    return ssl.create_default_context(cafile=CA) if os.path.exists(CA) else ssl.create_default_context()


CTX = ssl_context()


def get(url: str, params: dict | None = None) -> bytes:
    if params:
        url = url + "?" + urllib.parse.urlencode(params)
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, context=CTX, timeout=600) as r:
        return r.read()


def download(url: str, dest: pathlib.Path) -> tuple[str, int]:
    """流式下载到 dest，返回 (sha256, 字节数)。"""
    h = hashlib.sha256()
    n = 0
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, context=CTX, timeout=900) as r, open(dest, "wb") as f:
        while True:
            chunk = r.read(1 << 20)
            if not chunk:
                break
            f.write(chunk)
            h.update(chunk)
            n += len(chunk)
    return h.hexdigest(), n


# ---------------------------------------------------------------- 范围与图幅索引

def data_bbox() -> tuple[float, float, float, float]:
    """渲染范围（HK1980 Grid 米）：central.json 的 meta.origin + meta.bbox（dm）。"""
    meta = json.loads(CITY.read_text(encoding="utf-8"))["meta"]
    e, n = meta["origin"]["e"], meta["origin"]["n"]
    x0, y0, x1, y1 = meta["bbox"]
    return e + x0 / 10, n + y0 / 10, e + x1 / 10, n + y1 / 10


def sheet_index(bbox: tuple[float, float, float, float]) -> list[dict]:
    """与范围相交的图幅：[{sheet, revision (YYYY-MM-DD), url (含 key), urlNoKey}]，按图幅号排序。"""
    q = {"where": "1=1",
         "geometry": json.dumps({"xmin": bbox[0], "ymin": bbox[1], "xmax": bbox[2], "ymax": bbox[3]}, separators=(",", ":")),
         "geometryType": "esriGeometryEnvelope", "inSR": "2326", "outSR": "2326",
         "spatialRel": "esriSpatialRelIntersects",
         "outFields": "SHEETNO,REVISIONDATE,Format_glTF", "returnGeometry": "false",
         "orderByFields": "SHEETNO", "f": "json"}
    d = json.loads(get(INDEX_QUERY, q))
    out = []
    for f in d["features"]:
        a = f["attributes"]
        url = a["Format_glTF"]
        u = urllib.parse.urlsplit(url)
        # 只许无纹理版本（路径 /api/3d-zip/GLTF0/<sheet>.zip）
        if u.scheme != "https" or u.netloc != "download.map.gov.hk" or not u.path.startswith("/api/3d-zip/GLTF0/"):
            raise SystemExit(f"{a['SHEETNO']}: 意外的下载地址（只用 GLTF0 无纹理模型）")
        rev = time.strftime("%Y-%m-%d", time.gmtime(a["REVISIONDATE"] / 1000))
        out.append({"sheet": a["SHEETNO"], "revision": rev, "url": url,
                    "urlNoKey": urllib.parse.urlunsplit((u.scheme, u.netloc, u.path, "", ""))})
    out.sort(key=lambda s: s["sheet"])
    return out


# ---------------------------------------------------------------- glTF

def accessor(doc: dict, bufs: list[bytes], k: int) -> np.ndarray:
    a = doc["accessors"][k]
    bv = doc["bufferViews"][a["bufferView"]]
    dt = np.dtype(CT[a["componentType"]]).newbyteorder("<")
    n = NC[a["type"]]
    off = bv.get("byteOffset", 0) + a.get("byteOffset", 0)
    stride = bv.get("byteStride", 0) or dt.itemsize * n
    arr = np.ndarray((a["count"], n), dt, bufs[bv["buffer"]], off, (stride, dt.itemsize))
    return np.array(arr, dtype=np.float64)


def node_matrix(node: dict) -> np.ndarray:
    if "matrix" in node:
        return np.array(node["matrix"], np.float64).reshape(4, 4).T
    t = np.array(node.get("translation", [0, 0, 0]), np.float64)
    x, y, z, w = node.get("rotation", [0, 0, 0, 1])
    s = np.array(node.get("scale", [1, 1, 1]), np.float64)
    r = np.array([[1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)],
                  [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)],
                  [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)]])
    m = np.eye(4)
    m[:3, :3] = r * s
    m[:3, 3] = t
    return m


def building_entries(zf: zipfile.ZipFile) -> list[tuple[str, str]]:
    """(模型 ID, gltf 路径)：只取 BUILDING/<id>/<id>.gltf。"""
    out = []
    for name in zf.namelist():
        parts = name.split("/")
        if len(parts) == 3 and parts[0] == "BUILDING" and parts[2] == f"{parts[1]}.gltf":
            out.append((parts[1], name))
    out.sort()
    return out


def building_triangles(zf: zipfile.ZipFile, name: str) -> np.ndarray:
    """一栋楼的三角形 (n, 3, 3)，列为 E、N、mPD。"""
    doc = json.loads(zf.read(name))
    if doc.get("extensionsRequired"):
        raise ValueError("不支持的 glTF 扩展")
    base = posixpath.dirname(name)
    bufs = []
    for b in doc.get("buffers", []):
        uri = urllib.parse.unquote(b["uri"])
        # 只许同目录下的 .bin（不解 data: URI、不跟相对路径）
        if "/" in uri or "\\" in uri or uri.startswith(".") or not uri.endswith(".bin"):
            raise ValueError("意外的 buffer uri")
        bufs.append(zf.read(posixpath.join(base, uri)))
    nodes = doc.get("nodes", [])
    stack = [(i, np.eye(4)) for i in doc["scenes"][doc.get("scene", 0)]["nodes"]]
    tris = []
    while stack:
        ni, parent = stack.pop()
        node = nodes[ni]
        m = parent @ node_matrix(node)
        if "mesh" in node:
            for p in doc["meshes"][node["mesh"]]["primitives"]:
                if p.get("mode", 4) != 4:
                    continue
                pos = accessor(doc, bufs, p["attributes"]["POSITION"])
                pos = (np.c_[pos, np.ones(len(pos))] @ m.T)[:, :3]
                idx = accessor(doc, bufs, p["indices"]).ravel().astype(np.int64) if "indices" in p else np.arange(len(pos))
                tris.append(pos[idx.reshape(-1, 3)])
        stack.extend((c, m) for c in node.get("children", []))
    if not tris:
        return np.zeros((0, 3, 3))
    t = np.concatenate(tris)
    return np.stack([t[:, :, 0], -t[:, :, 2], t[:, :, 1]], axis=2)


# ---------------------------------------------------------------- 栅格化

def rasterize_roofs(tris: np.ndarray, x0: float, y0: float, nx: int, ny: int) -> np.ndarray:
    """朝上（或朝下，绕向不可靠）且不陡于 MIN_NZ 的三角形在每个格心处的最高高度；没覆盖的格为 −inf。g[j, i]，j 向北。"""
    g = np.full((ny, nx), -np.inf)
    a, b, c = tris[:, 0], tris[:, 1], tris[:, 2]
    n = np.cross(b - a, c - a)
    ln = np.linalg.norm(n, axis=1)
    keep = ln > 1e-9
    keep[keep] = np.abs(n[keep, 2] / ln[keep]) >= MIN_NZ
    for t in tris[keep]:
        xs, ys = t[:, 0], t[:, 1]
        i0 = max(int(np.ceil((xs.min() - x0) / CELL - 0.5)), 0)
        i1 = min(int(np.floor((xs.max() - x0) / CELL - 0.5)), nx - 1)
        j0 = max(int(np.ceil((ys.min() - y0) / CELL - 0.5)), 0)
        j1 = min(int(np.floor((ys.max() - y0) / CELL - 0.5)), ny - 1)
        if i1 < i0 or j1 < j0:
            continue
        px = x0 + (np.arange(i0, i1 + 1) + 0.5) * CELL
        py = y0 + (np.arange(j0, j1 + 1) + 0.5) * CELL
        (ax, ay, az), (bx, by, bz), (cx, cy, cz) = t
        d = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy)
        if abs(d) < 1e-12:
            continue
        PX = px[None, :]
        PY = py[:, None]
        l1 = ((by - cy) * (PX - cx) + (cx - bx) * (PY - cy)) / d
        l2 = ((cy - ay) * (PX - cx) + (ax - cx) * (PY - cy)) / d
        l3 = 1.0 - l1 - l2
        inside = (l1 >= -1e-9) & (l2 >= -1e-9) & (l3 >= -1e-9)
        if not inside.any():
            continue
        z = l1 * az + l2 * bz + l3 * cz
        sub = g[j0:j1 + 1, i0:i1 + 1]
        np.maximum(sub, np.where(inside, z, -np.inf), out=sub)
    return g


def erode(m: np.ndarray) -> np.ndarray:
    p = np.pad(m, 1, constant_values=False)
    out = np.ones_like(m)
    for dj in (0, 1, 2):
        for di in (0, 1, 2):
            out &= p[dj:dj + m.shape[0], di:di + m.shape[1]]
    return out


def dilate(m: np.ndarray) -> np.ndarray:
    p = np.pad(m, 1, constant_values=False)
    out = np.zeros_like(m)
    for dj in (0, 1, 2):
        for di in (0, 1, 2):
            out |= p[dj:dj + m.shape[0], di:di + m.shape[1]]
    return out


def small_pieces(m: np.ndarray, min_cells: float) -> np.ndarray:
    """m 里格数 < min_cells 的 4 连通分量（按行游程做并查集，不逐格递归）。"""
    runs = []  # (行, 起列, 止列含)
    row_runs = []
    for j in range(m.shape[0]):
        r = m[j]
        if not r.any():
            row_runs.append([])
            continue
        d = np.diff(np.concatenate([[0], r.view(np.int8), [0]]))
        starts, ends = np.nonzero(d == 1)[0], np.nonzero(d == -1)[0] - 1
        ids = []
        for s, e in zip(starts, ends):
            ids.append(len(runs))
            runs.append((j, int(s), int(e)))
        row_runs.append(ids)
    parent = list(range(len(runs)))

    def find(a: int) -> int:
        while parent[a] != a:
            parent[a] = parent[parent[a]]
            a = parent[a]
        return a

    for j in range(1, m.shape[0]):
        prev, cur = row_runs[j - 1], row_runs[j]
        p = 0
        for c in cur:
            _, cs, ce = runs[c]
            while p < len(prev) and runs[prev[p]][2] < cs:
                p += 1
            q = p
            while q < len(prev) and runs[prev[q]][1] <= ce:
                ra, rb = find(c), find(prev[q])
                if ra != rb:
                    parent[max(ra, rb)] = min(ra, rb)
                q += 1
    size: dict[int, int] = {}
    for k, (_, s, e) in enumerate(runs):
        r = find(k)
        size[r] = size.get(r, 0) + e - s + 1
    out = np.zeros(m.shape, bool)
    for k, (j, s, e) in enumerate(runs):
        if size[find(k)] < min_cells:
            out[j, s:e + 1] = True
    return out


# ---------------------------------------------------------------- 轮廓追踪与简化

# 方向：0 东、1 北、2 西、3 南
STEP = ((1, 0), (0, 1), (-1, 0), (0, -1))


def trace(mask: np.ndarray) -> list[list[tuple[int, int]]]:
    """沿格边追踪 mask 的边界环（只留拐点，格角整数坐标 (i, j)），实体在行进方向左侧：外环逆时针、洞顺时针。
    鞍点（对角相接）一律左转，令对角相接的格各成一环（与分量的 4 连通一致）。环从最南、再最西的格角起。"""
    p = np.pad(mask, 1, constant_values=False)
    inside = p[1:-1, 1:-1]
    outs: dict[tuple[int, int], list[int]] = {}
    # 南边：格 (i,j) 在内、南邻在外 → (i,j)→(i+1,j) 向东
    for j, i in zip(*np.nonzero(inside & ~p[:-2, 1:-1])):
        outs.setdefault((int(i), int(j)), []).append(0)
    # 北边：北邻在外 → (i+1,j+1)→(i,j+1) 向西
    for j, i in zip(*np.nonzero(inside & ~p[2:, 1:-1])):
        outs.setdefault((int(i) + 1, int(j) + 1), []).append(2)
    # 西边：西邻在外 → (i,j+1)→(i,j) 向南
    for j, i in zip(*np.nonzero(inside & ~p[1:-1, :-2])):
        outs.setdefault((int(i), int(j) + 1), []).append(3)
    # 东边：东邻在外 → (i+1,j)→(i+1,j+1) 向北
    for j, i in zip(*np.nonzero(inside & ~p[1:-1, 2:])):
        outs.setdefault((int(i) + 1, int(j)), []).append(1)
    used: set[tuple[int, int, int]] = set()
    loops = []
    for start in sorted(outs, key=lambda c: (c[1], c[0])):
        for d0 in sorted(outs[start]):
            if (start[0], start[1], d0) in used:
                continue
            pts = []
            cur, d = start, d0
            while True:
                used.add((cur[0], cur[1], d))
                pts.append((cur, d))
                cur = (cur[0] + STEP[d][0], cur[1] + STEP[d][1])
                opts = outs[cur]
                # 左转 > 直行 > 右转（鞍点只有左右两个出口）
                nd = next(x for x in ((d + 1) % 4, d, (d + 3) % 4) if x in opts)
                if (cur[0], cur[1], nd) == (start[0], start[1], d0):
                    break
                d = nd
            # 只留拐点（入向 ≠ 出向）
            n = len(pts)
            loop = [pts[k][0] for k in range(n) if pts[k][1] != pts[k - 1][1]]
            if len(loop) >= 4:
                k0 = min(range(len(loop)), key=lambda k: (loop[k][1], loop[k][0]))
                loops.append(loop[k0:] + loop[:k0])
    return loops


def area2(r: list[tuple[float, float]]) -> float:
    s = 0.0
    for k in range(len(r)):
        x0, y0 = r[k]
        x1, y1 = r[(k + 1) % len(r)]
        s += x0 * y1 - x1 * y0
    return s


def dp(pts: list[tuple[float, float]], tol: float) -> list[tuple[float, float]]:
    """开折线的 Douglas–Peucker（保留两端）。"""
    if len(pts) <= 2:
        return pts
    keep = [False] * len(pts)
    keep[0] = keep[-1] = True
    stack = [(0, len(pts) - 1)]
    while stack:
        a, b = stack.pop()
        ax, ay = pts[a]
        bx, by = pts[b]
        dx, dy = bx - ax, by - ay
        L = (dx * dx + dy * dy) ** 0.5
        best, bi = -1.0, -1
        for k in range(a + 1, b):
            px, py = pts[k]
            d = abs(dx * (py - ay) - dy * (px - ax)) / L if L > 0 else ((px - ax) ** 2 + (py - ay) ** 2) ** 0.5
            if d > best:
                best, bi = d, k
        if best > tol:
            keep[bi] = True
            stack.append((a, bi))
            stack.append((bi, b))
    return [p for p, k in zip(pts, keep) if k]


def simplify_ring(r: list[tuple[float, float]], tol: float) -> list[tuple[float, float]]:
    """闭环 DP：以首点与离它最远的点切成两段分别简化。首点由追踪顺序决定（最南、再最西的格角），确定性。"""
    if len(r) <= 4:
        return r
    x0, y0 = r[0]
    far = max(range(len(r)), key=lambda k: ((r[k][0] - x0) ** 2 + (r[k][1] - y0) ** 2, -k))
    a = dp(r[:far + 1], tol)
    b = dp(r[far:] + [r[0]], tol)
    return a[:-1] + b[:-1]


def polygons(mask: np.ndarray, x0: float, y0: float) -> list[list[list[float]]]:
    """mask → [[外环, 洞...], ...]，扁平 [e0, n0, e1, n1, ...]（米），外环逆时针、洞顺时针。"""
    rings = []
    for loop in trace(mask):
        pts = [(x0 + i * CELL, y0 + j * CELL) for i, j in loop]
        s = simplify_ring(pts, SIMPLIFY_M)
        if len(s) < 3:
            continue
        a = area2(s) / 2
        if abs(a) < MIN_PIECE_M2:
            continue
        rings.append((a, s))
    outers = [(a, s) for a, s in rings if a > 0]
    holes = [(a, s) for a, s in rings if a < 0]
    outers.sort(key=lambda t: (-t[0], t[1][0][1], t[1][0][0]))
    polys = [[s] for _, s in outers]
    for _, h in holes:
        # 洞内一点：首边中点向右（洞环顺时针，右侧是洞内）偏移一点；归给包含它的最小外环
        (ax, ay), (bx, by) = h[0], h[1]
        L = ((bx - ax) ** 2 + (by - ay) ** 2) ** 0.5 or 1.0
        px, py = (ax + bx) / 2 + (by - ay) / L * 0.01, (ay + by) / 2 - (bx - ax) / L * 0.01
        for poly in reversed(polys):
            if point_in(px, py, poly[0]):
                poly.append(h)
                break
    return [[[round(c, 2) for xy in ring for c in xy] for ring in poly] for poly in polys]


def point_in(x: float, y: float, r: list[tuple[float, float]]) -> bool:
    inside = False
    n = len(r)
    for k in range(n):
        x1, y1 = r[k]
        x2, y2 = r[(k + 1) % n]
        if (y1 > y) != (y2 > y) and x < x1 + (y - y1) * (x2 - x1) / (y2 - y1):
            inside = not inside
    return inside


# ---------------------------------------------------------------- 分层

def cluster_levels(h: np.ndarray, w: np.ndarray) -> list[tuple[float, float, float]]:
    """屋面高度（0.1 m 取整）与面积权重 → [(下界, 上界, 代表高度)]，代表高度取面积加权中位数。"""
    order = np.argsort(h, kind="stable")
    h, w = h[order], w[order]
    out = []
    s = 0
    for k in range(1, len(h) + 1):
        if k == len(h) or h[k] - h[k - 1] > JOIN_M or h[k] - h[s] > SPAN_M:
            hh, ww = h[s:k], w[s:k]
            c = np.cumsum(ww)
            med = hh[int(np.searchsorted(c, c[-1] / 2))]
            out.append((float(hh[0]), float(hh[-1]), float(med)))
            s = k
    return out


def derive(tris: np.ndarray) -> dict | None:
    """一栋 3D 楼 → {base, levels:[{top, polys}]}；没有屋面时返回 None。"""
    pts = tris.reshape(-1, 3)
    lo, hi = pts.min(0), pts.max(0)
    # 格网原点对齐整米（格角坐标是 0.25 m 的整数倍，JSON 里精确可表示）
    x0, y0 = np.floor(lo[0]) - 1.0, np.floor(lo[1]) - 1.0
    nx = int(np.ceil((hi[0] + 1.0 - x0) / CELL))
    ny = int(np.ceil((hi[1] + 1.0 - y0) / CELL))
    g = rasterize_roofs(tris, x0, y0, nx, ny)
    cov = np.isfinite(g)
    if not cov.any():
        return None
    hq = np.round(g[cov] * 10) / 10
    u, cnt = np.unique(hq, return_counts=True)
    levels = cluster_levels(u, cnt.astype(np.float64))
    # 每格的层号
    idx = np.full(g.shape, -1, np.int32)
    lev_of_u = np.zeros(len(u), np.int32)
    for k, (a, b, _) in enumerate(levels):
        lev_of_u[(u >= a) & (u <= b)] = k
    idx[cov] = lev_of_u[np.searchsorted(u, hq)]
    tops = [lv[2] for lv in levels]
    # 逐层累积掩膜做开运算（单调，开运算后仍逐层嵌套），再求每格新层号
    new = np.full(g.shape, -1, np.int32)
    for k in range(len(tops)):
        m = idx >= k
        m = dilate(erode(m))
        new[m] = k
    idx = new
    # 去碎块：每层累积掩膜里 < MIN_PIECE_M2 的分量降到下一层（从高到低处理）
    min_cells = MIN_PIECE_M2 / (CELL * CELL)
    for k in range(len(tops) - 1, -1, -1):
        sel = small_pieces(idx >= k, min_cells)
        if sel.any():
            idx[sel] = k - 1
    # 去空层，层数上限
    used = [int(v) for v in np.unique(idx) if v >= 0]
    lut = np.full(len(tops) + 1, -1, np.int32)
    for n, k in enumerate(used):
        lut[k] = n
    tops = [tops[k] for k in used]
    idx = np.where(idx >= 0, lut[np.maximum(idx, 0)], -1)
    while len(tops) > MAX_LEVELS:
        # 合并「墙面积」（周长 × 抬升）最小的层到下一层
        best, bk = None, -1
        for k in range(1, len(tops)):
            m = idx >= k
            per = (m[:, 1:] != m[:, :-1]).sum() + (m[1:, :] != m[:-1, :]).sum()
            score = per * CELL * (tops[k] - tops[k - 1])
            if best is None or score < best:
                best, bk = score, k
        idx[idx == bk] = bk - 1
        idx[idx > bk] -= 1
        tops.pop(bk)
    out_levels = []
    for k, top in enumerate(tops):
        polys = polygons(idx >= k, x0, y0)
        if polys:
            out_levels.append({"top": int(round(top * 10)), "polys": polys})
    if not out_levels:
        return None
    return {"base": int(round(lo[2] * 10)), "levels": out_levels}


# ---------------------------------------------------------------- 主流程

def process_zip(path: pathlib.Path, sheet: str, bbox: tuple[float, float, float, float], models: dict, stats: dict) -> None:
    with zipfile.ZipFile(path) as zf:
        for mid, name in building_entries(zf):
            tris = building_triangles(zf, name)
            if len(tris) == 0:
                continue
            pts = tris.reshape(-1, 3)
            lo, hi = pts.min(0), pts.max(0)
            if hi[0] < bbox[0] - BBOX_PAD_M or lo[0] > bbox[2] + BBOX_PAD_M or \
               hi[1] < bbox[1] - BBOX_PAD_M or lo[1] > bbox[3] + BBOX_PAD_M:
                stats["outside"] += 1
                continue
            digest = hashlib.sha256(np.ascontiguousarray(np.round(tris, 3)).tobytes()).hexdigest()
            if mid in models:
                stats["duplicate"] += 1
                if models[mid]["_digest"] != digest:
                    stats["duplicateDiffers"] += 1
                continue
            d = derive(tris)
            stats["triangles"] += len(tris)
            if d is None:
                stats["noRoof"] += 1
                continue
            models[mid] = {"id": mid, "sheet": sheet, **d, "_digest": digest}


def write_snapshot(out_dir: pathlib.Path, models: dict, sheets: list[dict], bbox, stats: dict) -> dict:
    rows = [{k: m[k] for k in ("id", "sheet", "base", "levels")} for _, m in sorted(models.items())]
    doc = {
        "format": "central-3dvm-parts",
        "version": 1,
        "datasetId": DATASET_ID,
        "crs": "EPSG:2326 + mPD",
        "unit": "rings in metres (multiples of 0.25 m); base/top in dm (mPD)",
        "method": f"roof heightfield {CELL} m (faces |nz| >= {MIN_NZ}), height clusters (join {JOIN_M} m, span <= {SPAN_M} m, "
                  f"area-weighted median), cumulative level masks opened 3x3, pieces < {MIN_PIECE_M2} m2 dropped, "
                  f"cell-edge contours simplified (Douglas-Peucker {SIMPLIFY_M} m), <= {MAX_LEVELS} levels",
        "models": rows,
    }
    text = json.dumps(doc, separators=(",", ":"), ensure_ascii=False)
    data = gzip.compress(text.encode("utf-8"), 9, mtime=0)
    out_dir.mkdir(parents=True, exist_ok=True)
    (out_dir / OUT_FILE).write_bytes(data)
    nlev = sum(len(r["levels"]) for r in rows)
    print(f"{len(rows)} 栋 3D 楼、{nlev} 层，{OUT_FILE} gzip {len(data)} B（原文 {len(text)} B）；统计 {stats}")
    return {
        "file": OUT_FILE, "layer": "landsd/3dvm-nontextured-buildings", "datasetId": DATASET_ID,
        "url": f"{PORTAL}/geoportal/?datasetId={DATASET_ID}", "query": INDEX_QUERY,
        "release": max((s["revision"] for s in sheets), default=FETCHED),
        "format": "gzip JSON (written by landsd_3d_fetch.py): per 3D building, stacked roof-level outlines derived from "
                  "the BUILDING glTF meshes (no meshes, textures or names stored)",
        "crs": "EPSG:2326 + mPD", "licenses": [TERMS], "attribution": ATTRIBUTION, "fetched": FETCHED,
        "bbox": {"west": bbox[0], "south": bbox[1], "east": bbox[2], "north": bbox[3], "crs": "EPSG:2326"},
        "sha256": hashlib.sha256(data).hexdigest(), "bytes": len(data), "rows": len(rows),
        "derivedFrom": [{k: s[k] for k in ("sheet", "revision", "urlNoKey", "sha256", "bytes")} for s in sheets],
    }


def update_sources(entry: dict) -> None:
    path = OUT / "sources.json"
    manifest = json.loads(path.read_text(encoding="utf-8"))
    files = [f for f in manifest["files"] if f["file"] != entry["file"]]
    files.append(entry)
    manifest["files"] = files
    if DATASET_NOTE not in manifest["dataset"]:
        manifest["dataset"] = manifest["dataset"].rstrip(")") + f"; {DATASET_NOTE})"
    path.write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--zip", action="append", default=[], help="开发用：处理本地 zip（图幅号取文件名）")
    ap.add_argument("--out", default=None, help="开发用：输出目录（默认 data-raw/landsd，并更新 sources.json）")
    args = ap.parse_args()
    bbox = data_bbox()
    models: dict = {}
    stats = {"triangles": 0, "outside": 0, "duplicate": 0, "duplicateDiffers": 0, "noRoof": 0}
    sheets: list[dict] = []
    if args.zip:
        for z in args.zip:
            p = pathlib.Path(z)
            process_zip(p, p.stem, bbox, models, stats)
        write_snapshot(pathlib.Path(args.out or tempfile.gettempdir()), models, sheets, bbox, stats)
        return
    index = sheet_index(bbox)
    print(f"范围 E {bbox[0]:.0f}–{bbox[2]:.0f} N {bbox[1]:.0f}–{bbox[3]:.0f}：{len(index)} 幅")
    with tempfile.TemporaryDirectory(prefix="central-3dvm-") as tmp:
        for k, s in enumerate(index):
            if k:
                time.sleep(PAUSE_S)
            dest = pathlib.Path(tmp) / f"{s['sheet']}.zip"
            sha, n = download(s["url"], dest)
            before = len(models)
            process_zip(dest, s["sheet"], bbox, models, stats)
            dest.unlink()
            sheets.append({**s, "sha256": sha, "bytes": n})
            print(f"  {s['sheet']}（{s['revision']}）{n} B，新增 {len(models) - before} 栋", flush=True)
    out = pathlib.Path(args.out) if args.out else OUT
    entry = write_snapshot(out, models, sheets, bbox, stats)
    if not args.out:
        update_sources(entry)


if __name__ == "__main__":
    sys.exit(main())
