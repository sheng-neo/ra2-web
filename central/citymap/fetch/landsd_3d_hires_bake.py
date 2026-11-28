"""一次性烘焙（R4 电车走廊）：地政总署「可視化三維地圖（個別模型）」带照片纹理的楼宇 → 电车沿线街墙的高清贴面页 + 雨篷。

与 R3（landsd_3d_tex_bake.py，4 px/m 全城贴面）并列、互不改动：R3 的产物照旧（可单独重跑、逐字节复现），本脚本只加
「高清街面层」（hi-res tier），复用 R3 的几何规则、glTF 读取与图幅缓存约定（import landsd_3d_tex_bake）。

用法（Python 3.11+、numpy、Pillow；不需要额外工具）：
    python central/citymap/fetch/landsd_3d_hires_bake.py --cache DIR              # 走廊图幅：下载 → 投影 → 缓存，再打包写产物
    python central/citymap/fetch/landsd_3d_hires_bake.py --cache DIR --corridor-only   # 只算走廊（不联网），写 DIR/corridor.json
    python central/citymap/fetch/landsd_3d_hires_bake.py --cache DIR --finalize-only   # 不联网：只从缓存打包
    开发用：--zip-dir D（D/<图幅>.zip 存在就直接用，不下载、不删）、--sheets A,B、--out D（不碰仓库）、--allow-missing
    python central/citymap/fetch/landsd_3d_hires_bake.py --selftest               # 纯函数自测
--cache 必须是自己的可信目录（逐幅缓存用 npz/json，不用 pickle）。

做法：
1. 走廊（corridor_faces）：电车轨道每 4 m 一个采样点；我们的墙面（每块棱柱每个环的每条边）里，离某个采样点 ≤ 60 m、
   法线与「墙 → 采样点」夹角 ≤ 70° 的，或 ≤ 35 m、夹角 ≤ 81°（街角、横街口看得见的侧墙）的，而且平面上视线不被别的楼挡住
   （墙上 3 个点 × 采样点的线段与全部楼的外环不相交）。敏感区里或离敏感区 3 m 内的楼、六座地标（已从楼表删除）不进走廊。
   高清带：每个走廊面从墙脚（墙底的地面）到地面以上 HI_TOP_M；分两段密度：街面段（0–STREET_TOP_M）D_STREET，
   上段（到 HI_TOP_M）D_UPPER（上段夜里主要是窗，不需要招牌那么细）。其余照旧 4 px/m（R3 页）。
2. 投影：与 R3 相同的「最外面的面」规则（离墙 −5…+3 m、法线夹角 < 53°），但只投走廊面的高清带，按输出密度的 1.5 倍超采样累积（ACC_STREET / ACC_UPPER），
   深度（离墙面的距离）一起留下（浮雕用）；逐幅、逐面裁剪后存 npz 缓存，zip 投完即删。
3. 夜景分类（night_classes，白天照片 → 夜景所需的逐纹素数据）：店面开口（街面段里暗的玻璃 / 门洞 / 室内）、招牌（饱和、高对比、
   有笔画的区域，D1：照片里真实的招牌要保留并发光）、上层玻璃（独立窗 / 幕墙，沿用 R3 码）、实墙；去日照（材质区内）、补树；
   脚手架 / 绿网 / 围板在高清下再查一遍（保守：整面退回 R3 页），列出楼号。
4. 浮雕：每纹素「墙面后退深度」0–2.5 m（投影时最外面的面到我们墙面的距离，按街面以上的平均墙面校正），客户端近处视差（HIGH）。
5. 雨篷（extract_canopies）：真模型里离地 2.5–8 m、伸出我们外墙 0.5–5 m 的近水平板（顶面朝上 / 底面朝下的三角形），
   按楼合并成简化多边形 + 高度 + 厚度 + 顶 / 底 / 檐口颜色，写进清单（管线接到 Building.canopies）。
6. 打包：每页 PAGE_HI × PAGE_HI 的颜色（RGB 有损 + alpha 无损 = R3 码），下方 PAGE_HI/2 行放半分辨率的辅助图
   （R = 后退深度、G = 店面开口、B = 招牌发光、A = 店铺种子，A 无损），合成一个 RGBA WebP（PAGE_HI × 1.5 PAGE_HI）。
   页按电车线上的位置（沿线里程）排序装箱，客户端按沿线预取。

下载口 key 每次从 CSDI 图幅索引读（R3 sheet_index），只在内存里，不写任何地方。条款见 data-raw/landsd/TERMS.md 第 7、8 节。
"""

import argparse
import gzip
import hashlib
import io
import json
import math
import pathlib
import sys
import time
import zipfile

import os

os.environ.setdefault("OPENBLAS_NUM_THREADS", "1")  # 打包时 fork 子进程：BLAS 线程池单线程，免得子进程继承到被占着的锁
os.environ.setdefault("OMP_NUM_THREADS", "1")
import numpy as np  # noqa: E402
from PIL import Image

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
import landsd_3d_tex_bake as R3  # noqa: E402

# ---------------------------------------------------------------- 参数
TRACK_STEP_M = 4.0     # 轨道采样间距
CORR_FAR_M = 60.0      # 正对轨道的墙：最远距离
CORR_FAR_DEG = 70.0    # 正对：法线与「墙 → 轨道」的夹角上限
CORR_NEAR_M = 35.0     # 街角 / 横街口：最远距离
CORR_NEAR_COS = 0.15   # 街角：夹角余弦下限（约 81°）
MIN_FACE_M = 1.5       # 短于此的边不进走廊
HI_TOP_M = 45.0        # 高清带上沿（地面以上）
STREET_TOP_M = 15.0    # 街面段上沿
D_STREET = 24.0        # 街面段输出密度（px/m；打包时可用 --d-street 改，不必重新投影）
D_UPPER = 12.0         # 上段输出密度（--d-upper）
ACC_STREET = 36.0      # 街面段投影累积密度（= 24 × 1.5 超采样；进投影指纹）
ACC_UPPER = 18.0       # 上段投影累积密度
PAGE_HI = 1024         # 页边长（颜色）
PAD_HI = 4
TILE_HI = PAGE_HI - 2 * PAD_HI
HI_VERSION = 1
# 人工复查（高清页联系表，逐页看）后整面不做高清的面（清单 excluded.faces 记原因），退回 R3 的 4 px/m 贴面。键 = 面名（楼号_棱柱_环_边）。
# - 竹棚 / 非绿色的棚网：竹竿搭的棚架常常没有绿网、灰网又不是绿的（R3 的绿网检测抓不到），高清下看得清——保守起见人工列出；
# - 像围板的大片平板（整面一色、没有窗）；临时横幅（节庆 / 赞助商标志）；
# - 源数据贴图错误：模型的竖墙用了航拍俯视图（屋顶、草地、路面），或贴图拉成斜条纹，高清下格外显眼。
BAMBOO = "bamboo scaffolding (manual review)"
NETTING = "scaffold netting, not green (manual review)"
HOARDING = "hoarding-like flat boards (manual review)"
BANNER = "temporary celebration banner with sponsors' logos (manual review)"
AERIAL = "source texture fault: aerial (top-down) image on wall (manual review)"
SMEAR = "source texture fault: smeared diagonal streaks (manual review)"
MANUAL_EXCLUDE_FACES: dict[str, str] = {
    "ac99557172_0_0_0": BAMBOO,
    "b077f24b07_0_0_5": BAMBOO,
    "d2ea65fb77_0_0_7": BAMBOO,
    "767b6fb93e_0_0_3": BAMBOO,
    "0c09fa2d3b_0_0_0": NETTING,
    "ea86c97cf2_0_0_0": HOARDING,
    "025fc69303_0_0_2": HOARDING,
    "68322e88cd_0_0_9": HOARDING,
    "c0ab03b820_0_0_0": AERIAL,
    "3891de5b97_0_0_12": AERIAL,
    "3891de5b97_0_0_13": AERIAL,
    "b83a68f097_0_0_3": AERIAL,
    "c21d432150_0_0_2": AERIAL,
    "c21d432150_0_0_3": AERIAL,
    "c21d432150_0_0_4": AERIAL,
    "c21d432150_0_0_5": AERIAL,
    "d87c893f13_0_0_1": SMEAR,
    "2d1664780c_0_0_2": SMEAR,
    "1a34cfc5e8_0_0_3": SMEAR,
    "1a09c8e84e_0_0_2": SMEAR,
    "8914a581fc_0_0_5": NETTING,
    # R4 复审修正：街面带是工地 / 空铺围板（白板 + 黄黑警示带、招租围板）
    "b83a68f097_0_0_2": HOARDING,
    "7e438cc093_0_0_4": HOARDING,
    "23d4f172df_0_0_1": NETTING,
}
# R4 复审修正：街面带（离地 0–4.6 m）是源数据错误的面——雨篷顶的航拍俯视图、拉花的竖条——只在街面带不用照片（客户端画暗的程序铺面），
# 楼上照旧。自动质量闸（gf_quality）抓不到的才列在这里。
MANUAL_GF_REJECT: dict[str, str] = {
    "233f7835c6_0_0_3": AERIAL,
}
LANDMARK_MARGIN_M = 3.0  # 离地标外环这么近的楼不做高清（红线：地标与旁边的楼不贴真实照片，旁边的楼的照片常常投进了地标真楼）
# 整栋不做高清（人工复查）：上环一栋公共建筑，墙上挂着节庆横幅、赞助商标志与徽章；一栋墙上贴的是工地的航拍俯视图——保守起见整栋退回 R3。
MANUAL_EXCLUDE_BUILDINGS: dict[str, str] = {
    "0382a24b56": BANNER + "; emblem",
    "f6bea8448f": AERIAL + "; construction site",
}
# R4 复审修正（H-P1-1）：R3 的绿网检测排除、但在走廊里的楼，按 24 / 12 px/m 的高清投影逐栋人工复查（联系表），没有竹棚 / 绿网 / 围板的放行做高清
# （R3 4 px/m 贴面照旧不用：R3 的排除名单不动）。键 = 楼号，值 = 复查结论。
_CLEAN = "manual review at 24 / 12 px/m (R4): no scaffold / netting / hoarding"
R3_RELEASE: dict[str, str] = {
    "1ae4039d22": _CLEAN,
    "1b65ad5797": _CLEAN,
    "23d4f172df": _CLEAN + "; face 0_0_1 excluded (green patches)",
    "35c8d1bba3": _CLEAN,
    "404c403e5f": _CLEAN,
    "7fe8140431": _CLEAN,
    "a464820d3b": _CLEAN,
    "c84f385e6f": _CLEAN,
    "dc783811c0": _CLEAN,
    "dd6484c053": _CLEAN,
    "eb83227699": _CLEAN,
    "f4adb65fba": _CLEAN,
}


# ---------------------------------------------------------------- 走廊

def track_samples(rails: list[dict], step: float = TRACK_STEP_M) -> np.ndarray:
    """电车轨道（kind = tram）等距采样（本地米，(n, 2)）。"""
    out = []
    for r in rails:
        if r.get("kind") != "tram":
            continue
        p = np.array(r["pts"], np.float64).reshape(-1, 2) / 10
        for a, b in zip(p[:-1], p[1:]):
            L = float(np.hypot(*(b - a)))
            n = max(1, int(math.ceil(L / step)))
            t = np.arange(n) / n
            out.append(a[None] + (b - a)[None] * t[:, None])
        out.append(p[-1:])
    return np.concatenate(out) if out else np.zeros((0, 2))


def ring_segments(rings: list[list[int]]) -> np.ndarray:
    """环（dm 平铺）→ 线段 (m, 4)，本地米。"""
    segs = []
    for r in rings:
        p = np.array(r, np.float64).reshape(-1, 2) / 10
        q = np.roll(p, -1, axis=0)
        segs.append(np.hstack([p, q]))
    return np.concatenate(segs) if segs else np.zeros((0, 4))


class SegGrid:
    """线段空间哈希（本地米）。"""

    def __init__(self, segs: np.ndarray, cell: float = 20.0):
        self.segs = segs
        self.cell = cell
        self.grid: dict[tuple[int, int], list[int]] = {}
        for i, (x0, y0, x1, y1) in enumerate(segs):
            for gi in range(int(min(x0, x1) // cell), int(max(x0, x1) // cell) + 1):
                for gj in range(int(min(y0, y1) // cell), int(max(y0, y1) // cell) + 1):
                    self.grid.setdefault((gi, gj), []).append(i)

    def near(self, x0: float, y0: float, x1: float, y1: float) -> np.ndarray:
        s: set[int] = set()
        c = self.cell
        for gi in range(int(x0 // c), int(x1 // c) + 1):
            for gj in range(int(y0 // c), int(y1 // c) + 1):
                s.update(self.grid.get((gi, gj), ()))
        return np.array(sorted(s), np.int64)


def blocked(P: np.ndarray, Q: np.ndarray, S: np.ndarray) -> np.ndarray:
    """线段 P[i]→Q[i] 是否与 S 里任一线段相交（严格相交，端点相接不算）。P、Q (k, 2)，S (m, 4)。返回 (k,) bool。"""
    if len(S) == 0 or len(P) == 0:
        return np.zeros(len(P), bool)
    ax, ay = P[:, 0:1], P[:, 1:2]
    bx, by = Q[:, 0:1], Q[:, 1:2]
    cx, cy, dx, dy = S[None, :, 0], S[None, :, 1], S[None, :, 2], S[None, :, 3]

    def orient(px, py, qx, qy, rx, ry):
        return (qx - px) * (ry - py) - (qy - py) * (rx - px)

    o1 = orient(ax, ay, bx, by, cx, cy)
    o2 = orient(ax, ay, bx, by, dx, dy)
    o3 = orient(cx, cy, dx, dy, ax, ay)
    o4 = orient(cx, cy, dx, dy, bx, by)
    hit = (o1 * o2 < 0) & (o3 * o4 < 0)
    return hit.any(1)


def corridor_faces(plans: list[dict], samples: np.ndarray, occluders: np.ndarray,
                   far_m: float = CORR_FAR_M, far_deg: float = CORR_FAR_DEG, near_m: float = CORR_NEAR_M,
                   near_cos: float = CORR_NEAR_COS, min_face: float = MIN_FACE_M) -> dict[str, list[tuple[int, int, int]]]:
    """走廊面：{楼号: [(棱柱序, 环序, 边序), ...]}（plans 里的棱柱顺序，见 R3 plan_city）。规则见文件头。确定性（按序遍历）。"""
    out: dict[str, list[tuple[int, int, int]]] = {}
    if len(samples) == 0:
        return out
    sg_cell = 30.0
    sgrid: dict[tuple[int, int], list[int]] = {}
    for i, (x, y) in enumerate(samples):
        sgrid.setdefault((int(x // sg_cell), int(y // sg_cell)), []).append(i)
    occ = SegGrid(occluders)
    far_cos = math.cos(math.radians(far_deg))
    fr = np.array([0.15, 0.5, 0.85])
    for bp in plans:
        faces = []
        for pi, pr in enumerate(bp["prisms"]):
            for ri, ring in enumerate(pr["rings"]):
                p = np.array(ring, np.float64).reshape(-1, 2) / 10
                n = len(p)
                for ei in range(n):
                    a, b = p[ei], p[(ei + 1) % n]
                    d = b - a
                    L = float(np.hypot(*d))
                    if L < min_face:
                        continue
                    t = d / L
                    nrm = np.array([t[1], -t[0]])
                    lo = np.minimum(a, b) - far_m
                    hi = np.maximum(a, b) + far_m
                    cand = []
                    for gi in range(int(lo[0] // sg_cell), int(hi[0] // sg_cell) + 1):
                        for gj in range(int(lo[1] // sg_cell), int(hi[1] // sg_cell) + 1):
                            cand.extend(sgrid.get((gi, gj), ()))
                    if not cand:
                        continue
                    S = samples[sorted(cand)]
                    # 线段到采样点的距离
                    rel = S - a
                    u = np.clip(rel @ t, 0, L)
                    dist = np.hypot(*(rel - u[:, None] * t[None]).T)
                    S = S[dist <= far_m]
                    if len(S) == 0:
                        continue
                    Q = a[None] + (fr[:, None] * L) * t[None] + 0.3 * nrm[None]
                    PP = np.repeat(S, len(Q), axis=0)
                    QQ = np.tile(Q, (len(S), 1))
                    v = PP - QQ
                    dd = np.hypot(v[:, 0], v[:, 1])
                    cs = (v @ nrm) / np.maximum(dd, 1e-9)
                    ok = ((dd <= far_m) & (cs >= far_cos)) | ((dd <= near_m) & (cs >= near_cos))
                    if not ok.any():
                        continue
                    PP, QQ = PP[ok], QQ[ok]
                    bx0 = min(PP[:, 0].min(), QQ[:, 0].min())
                    by0 = min(PP[:, 1].min(), QQ[:, 1].min())
                    bx1 = max(PP[:, 0].max(), QQ[:, 0].max())
                    by1 = max(PP[:, 1].max(), QQ[:, 1].max())
                    ids = occ.near(bx0, by0, bx1, by1)
                    vis = ~blocked(PP, QQ, occ.segs[ids]) if len(ids) else np.ones(len(PP), bool)
                    if vis.any():
                        faces.append((pi, ri, ei))
        if faces:
            out[bp["id"]] = faces
    return out


def occluder_segments(city: dict) -> np.ndarray:
    """遮挡用：全部楼（含敏感区）与地标的外环（本地米）。"""
    rings = [b["footprint"]["outer"] for b in city["buildings"]]
    rings += [lm["footprint"]["outer"] for lm in city.get("landmarks", [])]
    return ring_segments(rings)


def corridor_plan(city: dict, relief: "R3.Relief") -> tuple[list[dict], dict, list[str]]:
    """R3 plan_city 的楼里挑走廊楼（离敏感区 ≥ ZONE_MARGIN_M），返回 (走廊楼的 plan 列表, 走廊面, 排除的楼号)。"""
    plans, _sens = R3.plan_city(city, relief)
    samples = track_samples(city["rails"])
    faces = corridor_faces(plans, samples, occluder_segments(city))
    keep = []
    near_zone = []
    for bp in plans:
        if bp["id"] not in faces:
            continue
        if R3.zone_gap_m(bp) < R3.ZONE_MARGIN_M:
            near_zone.append(bp["id"])
            del faces[bp["id"]]
            continue
        keep.append(bp)
    return keep, faces, sorted(near_zone)


def landmark_near(plans: list[dict], city: dict, margin: float = LANDMARK_MARGIN_M) -> dict[str, str]:
    """走廊楼里外环离任一地标外环 ≤ margin 米（含相交）的：{楼号: 地标 id}。外环沿边每 0.5 m 取点到地标各边的距离。"""
    out: dict[str, str] = {}
    lms = [(lm.get("id", "landmark"), np.array(lm["footprint"]["outer"], np.float64).reshape(-1, 2) / 10) for lm in city.get("landmarks", [])]
    if not lms:
        return out

    def seg_pts(P: np.ndarray, step: float = 0.5) -> np.ndarray:
        pts = []
        for i in range(len(P)):
            a, b = P[i], P[(i + 1) % len(P)]
            n = max(1, int(math.ceil(np.hypot(*(b - a)) / step)))
            pts.append(a[None] + (b - a)[None] * (np.arange(n)[:, None] / n))
        return np.concatenate(pts)

    def dist_pts_ring(Q: np.ndarray, P: np.ndarray) -> float:
        A = P
        B = np.roll(P, -1, 0)
        AB = B - A
        L2 = np.maximum((AB ** 2).sum(1), 1e-12)
        t = np.clip(((Q[:, None, :] - A[None]) * AB[None]).sum(2) / L2[None], 0, 1)
        C = A[None] + t[..., None] * AB[None]
        return float(np.sqrt(((Q[:, None, :] - C) ** 2).sum(2)).min())

    def inside(q: np.ndarray, P: np.ndarray) -> bool:
        x, y = q
        c = False
        for i in range(len(P)):
            x1, y1 = P[i]
            x2, y2 = P[(i + 1) % len(P)]
            if (y1 > y) != (y2 > y) and x < (x2 - x1) * (y - y1) / (y2 - y1) + x1:
                c = not c
        return c
    for bp in plans:
        R = np.array(bp["prisms"][0]["rings"][0], np.float64).reshape(-1, 2) / 10
        lo, hi = R.min(0) - margin, R.max(0) + margin
        for lid, P in lms:
            if (P.max(0) < lo).any() or (P.min(0) > hi).any():
                continue
            Q = seg_pts(R)
            if dist_pts_ring(Q, P) <= margin or inside(Q[0], P) or inside(P[0], R):
                out[bp["id"]] = lid
                break
    return out


def corridor_stats(plans: list[dict], faces: dict, relief: "R3.Relief") -> dict:
    """走廊统计：楼数、面数、面总长、高清带面积（按两段密度的像素数）。"""
    n_faces = 0
    length = 0.0
    area_s = 0.0
    area_u = 0.0
    for bp in plans:
        for pi, ri, ei in faces.get(bp["id"], []):
            pr = bp["prisms"][pi]
            ring = pr["rings"][ri]
            n = len(ring) // 2
            ax, ay = ring[ei * 2] / 10, ring[ei * 2 + 1] / 10
            bx, by = ring[((ei + 1) % n) * 2] / 10, ring[((ei + 1) % n) * 2 + 1] / 10
            L = math.hypot(bx - ax, by - ay)
            g = min(relief(ring[ei * 2], ring[ei * 2 + 1]), relief(ring[((ei + 1) % n) * 2], ring[((ei + 1) % n) * 2 + 1])) / 10
            z0, z1 = pr["bottom"] / 10, pr["top"] / 10
            s = max(0.0, min(z1, g + STREET_TOP_M) - max(z0, g - 0.5))
            u = max(0.0, min(z1, g + HI_TOP_M) - max(z0, g + STREET_TOP_M))
            n_faces += 1
            length += L
            area_s += L * s
            area_u += L * u
    return {"buildings": len(plans), "faces": n_faces, "faceLengthM": round(length), "streetM2": round(area_s),
            "upperM2": round(area_u),
            "mpx": round((area_s * D_STREET ** 2 + area_u * D_UPPER ** 2) / 1e6, 1)}


# ---------------------------------------------------------------- 投影目标：走廊面的高清带

class Section:
    """一个走廊面的一段（街面段 / 上段）：行 = (z_top − z) × acc，列 = s × acc（s = 沿边米数，0..L）。
    颜色 uint8、深度 float32（离我们墙面的距离，外正；−inf = 空）。d = 输出密度，acc = 累积密度。"""
    __slots__ = ("kind", "z_top", "z_bot", "d", "acc", "W", "H", "col", "dep")

    def __init__(self, kind: str, z_top: float, z_bot: float, L: float, d: float, acc: float):
        self.kind = kind
        self.z_top, self.z_bot, self.d, self.acc = z_top, z_bot, d, acc
        self.W = int(math.ceil(L * acc)) + 1
        self.H = int(math.ceil((z_top - z_bot) * acc)) + 1
        self.col = None
        self.dep = None

    def alloc(self) -> None:
        if self.col is None:
            self.col = np.zeros((self.H, self.W, 3), np.uint8)
            self.dep = np.full((self.H, self.W), -np.inf, np.float32)


class Face:
    """一个走廊面（我们某块棱柱某个环的一条边）：A（HK1980 米）、单位方向 t、外法线 n、长度 L、环上起点 p0（米，与 R3 / 客户端一致）、
    墙脚地面 g（mPD 米）、段。"""
    __slots__ = ("bid", "key", "pi", "ri", "ei", "A", "t", "n", "L", "p0", "g", "secs")

    def __init__(self, bid, key, pi, ri, ei, A, t, L, p0, g):
        self.bid, self.key, self.pi, self.ri, self.ei = bid, key, pi, ri, ei
        self.A = A
        self.t = t
        self.n = np.array([t[1], -t[0]])
        self.L, self.p0, self.g = L, p0, g
        self.secs: list[Section] = []

    @property
    def name(self) -> str:
        return f"{self.bid}_{self.pi}_{self.ri}_{self.ei}"


def face_sections(z_bot: float, z_top: float, g: float, L: float, d_street: float, d_upper: float,
                  acc_street: float = ACC_STREET, acc_upper: float = ACC_UPPER) -> list[Section]:
    """一个面在棱柱 [z_bot, z_top] 里的高清段：街面段 [max(z_bot, g − 1), min(z_top, g + STREET_TOP_M)]、
    上段 [街面段顶, min(z_top, g + HI_TOP_M)]（不足 0.5 m 的段不要）。"""
    out = []
    s0 = max(z_bot, g - 1.0)
    s1 = min(z_top, g + STREET_TOP_M)
    if s1 - s0 >= 0.5:
        out.append(Section("s", s1, s0, L, d_street, acc_street))
    u0 = max(z_bot, g + STREET_TOP_M)
    u1 = min(z_top, g + HI_TOP_M)
    if u1 - u0 >= 0.5:
        out.append(Section("u", u1, u0, L, d_upper, acc_upper))
    return out


def ring_starts(ring: list[int]) -> list[float]:
    """环上每条边的起点 P（米）：与 R3 Targets / 客户端 extrude 一样按 dm 的 hypot 累计再 × 0.1（零长边不累计）。"""
    n = len(ring) // 2
    out = []
    p = 0.0
    for i in range(n):
        j = (i + 1) % n
        out.append(p)
        L = math.hypot(ring[j * 2] - ring[i * 2], ring[j * 2 + 1] - ring[i * 2 + 1]) * 0.1
        if L >= 1e-6:
            p += L
    return out


def build_faces(plans: list[dict], faces: dict, relief: "R3.Relief", origin: tuple[float, float],
                d_street: float = D_STREET, d_upper: float = D_UPPER) -> list[Face]:
    e0, n0 = origin
    out = []
    for bp in plans:
        for pi, ri, ei in faces.get(bp["id"], []):
            pr = bp["prisms"][pi]
            ring = pr["rings"][ri]
            n = len(ring) // 2
            j = (ei + 1) % n
            ax, ay = ring[ei * 2], ring[ei * 2 + 1]
            bx, by = ring[j * 2], ring[j * 2 + 1]
            L = math.hypot(bx - ax, by - ay) * 0.1
            t = np.array([(bx - ax) * 0.1 / L, (by - ay) * 0.1 / L])
            g = min(relief(ax, ay), relief(bx, by), relief((ax + bx) / 2, (ay + by) / 2)) / 10
            f = Face(bp["id"], bp["key"], pi, ri, ei, np.array([e0 + ax / 10, n0 + ay / 10]), t, L, ring_starts(ring)[ei], g)
            f.secs = face_sections(pr["bottom"] / 10, pr["top"] / 10, g, L, d_street, d_upper)
            if f.secs:
                out.append(f)
    return out


class FaceIndex:
    def __init__(self, faces: list[Face], cell: float = 16.0):
        self.faces = faces
        self.cell = cell
        self.grid: dict[tuple[int, int], list[int]] = {}
        for k, f in enumerate(faces):
            B = f.A + f.t * f.L
            lo = np.minimum(f.A, B) - R3.TOL_IN - 1
            hi = np.maximum(f.A, B) + R3.TOL_IN + 1
            for gi in range(int(lo[0] // cell), int(hi[0] // cell) + 1):
                for gj in range(int(lo[1] // cell), int(hi[1] // cell) + 1):
                    self.grid.setdefault((gi, gj), []).append(k)
        self.n = np.array([f.n for f in faces]) if faces else np.zeros((0, 2))
        allp = np.concatenate([[f.A, f.A + f.t * f.L] for f in faces]) if faces else np.zeros((0, 2))
        self.bbox = (allp[:, 0].min() - 30, allp[:, 1].min() - 30, allp[:, 0].max() + 30, allp[:, 1].max() + 30) if faces else None

    def near(self, x0: float, y0: float, x1: float, y1: float) -> list[int]:
        s: set[int] = set()
        c = self.cell
        for gi in range(int(x0 // c), int(x1 // c) + 1):
            for gj in range(int(y0 // c), int(y1 // c) + 1):
                s.update(self.grid.get((gi, gj), ()))
        return sorted(s)


# 雨篷候选：近水平（|nz| ≥ CAN_NZ）、离墙脚地面 CAN_Z0–CAN_Z1、在我们外墙外 CAN_O0–CAN_O1 的三角形
CAN_NZ = 0.85
CAN_Z0 = 2.2
CAN_Z1 = 9.0
CAN_O0 = 0.25
CAN_O1 = 6.0


def splat_faces(model: "R3.Model", fx: FaceIndex, stats: dict, canopy: dict | None = None) -> None:
    """真模型的墙三角形投到走廊面的高清段（R3 的「最外面」规则）；canopy 给了就顺便收集雨篷候选三角形
    （{楼号: [(三个顶点 E/N/mPD, 朝上?, 颜色)...]}）。"""
    T = model.tris
    if len(T) == 0:
        return
    e1 = T[:, 1] - T[:, 0]
    e2 = T[:, 2] - T[:, 0]
    n = np.cross(e1, e2)
    area2 = np.linalg.norm(n, axis=1)
    ok = area2 > 1e-8
    n[ok] /= area2[ok, None]
    vn = model.vnrm
    flip = (np.einsum("ij,ij->i", n, vn) < 0) & (np.linalg.norm(vn, axis=1) > 1e-6)
    n[flip] *= -1
    uv = model.uv
    for t in np.nonzero(ok)[0]:
        tri = T[t]
        nz = n[t, 2]
        x0, y0 = tri[:, 0].min(), tri[:, 1].min()
        x1, y1 = tri[:, 0].max(), tri[:, 1].max()
        if fx.bbox is None or x1 < fx.bbox[0] or x0 > fx.bbox[2] or y1 < fx.bbox[1] or y0 > fx.bbox[3]:
            continue
        if abs(nz) < R3.WALL_NZ:
            nh = n[t, :2]
            nhl = math.hypot(nh[0], nh[1])
            if nhl < 1e-6:
                continue
            nh = nh / nhl
            cand = fx.near(x0, y0, x1, y1)
            if not cand:
                continue
            ci = np.array(cand)
            dots = fx.n[ci] @ nh * nhl
            img = int(model.img[t])
            w, h = model.size(img)
            U = uv[t] * np.array([w, h])
            ua = abs((U[1, 0] - U[0, 0]) * (U[2, 1] - U[0, 1]) - (U[1, 1] - U[0, 1]) * (U[2, 0] - U[0, 0])) / 2
            wa = area2[t] / 2
            if ua < 1e-6:
                continue
            for k in ci[dots >= R3.WALL_COS]:
                f = fx.faces[k]
                rel = tri[:, :2] - f.A
                s = rel @ f.t
                o = rel @ f.n
                if o.max() < -R3.TOL_IN or o.min() > R3.TOL_OUT or s.max() < -0.5 or s.min() > f.L + 0.5:
                    continue
                for sec in f.secs:
                    if tri[:, 2].max() < sec.z_bot or tri[:, 2].min() > sec.z_top:
                        continue
                    sec.alloc()
                    P = np.stack([s * sec.acc, (sec.z_top - tri[:, 2]) * sec.acc], axis=1)
                    texels = math.sqrt(ua / max(wa * sec.acc * sec.acc, 1e-9))
                    stats["px"] += R3.raster(sec.col, sec.dep, P, o, uv[t], model, img, texels,
                                             -0.25 * sec.acc, (f.L + 0.25) * sec.acc, -R3.TOL_IN, R3.TOL_OUT)
        elif canopy is not None and abs(nz) >= CAN_NZ:
            cand = fx.near(x0 - CAN_O1, y0 - CAN_O1, x1 + CAN_O1, y1 + CAN_O1)
            if not cand:
                continue
            c = tri.mean(0)
            for k in cand:
                f = fx.faces[k]
                rel = c[:2] - f.A
                s = float(rel @ f.t)
                o = float(rel @ f.n)
                lift = c[2] - f.g
                if CAN_O0 <= o <= CAN_O1 and -1.0 <= s <= f.L + 1.0 and CAN_Z0 <= lift <= CAN_Z1:
                    img = int(model.img[t])
                    im = model.level(img, 4)
                    cu = uv[t].mean(0)
                    col = R3.bilinear(im, np.array([cu[0]]), np.array([cu[1]]))[0]
                    canopy.setdefault(f.bid, []).append((tri.copy(), bool(nz > 0), col.astype(np.float32)))
                    stats["canopyTris"] += 1
                    break


def save_faces(sd: pathlib.Path, faces: list[Face]) -> list[str]:
    """一幅的投影：每个有投影的段一个 npz（裁到有投影的外包框；深度 float16），返回文件名列表。"""
    fdir = sd / "f"
    fdir.mkdir(parents=True, exist_ok=True)
    names = []
    for f in faces:
        for sec in f.secs:
            if sec.col is None:
                continue
            fin = np.isfinite(sec.dep)
            rows = np.nonzero(fin.any(1))[0]
            if len(rows) == 0:
                continue
            cols = np.nonzero(fin.any(0))[0]
            r0, r1, c0, c1 = int(rows[0]), int(rows[-1]) + 1, int(cols[0]), int(cols[-1]) + 1
            nm = f"{f.name}_{sec.kind}.npz"
            tmp = fdir / (nm + ".tmp")
            with open(tmp, "wb") as fh:
                np.savez_compressed(fh, col=sec.col[r0:r1, c0:c1], dep=sec.dep[r0:r1, c0:c1].astype(np.float16),
                                    off=np.array([r0, c0, sec.H, sec.W], np.int32))
            tmp.replace(fdir / nm)
            names.append(nm)
    return names


def reset_faces(faces: list[Face]) -> None:
    for f in faces:
        for sec in f.secs:
            sec.col = None
            sec.dep = None


def project_zip(path: pathlib.Path, fx: FaceIndex, zones: list[dict], origin: tuple[float, float], stats: dict,
                canopy: dict) -> dict[str, int]:
    """一幅 zip 的楼投到走廊面（敏感区里的模型不用）；返回 {模型号: 三角形数}。"""
    models: dict[str, int] = {}
    bb = fx.bbox
    with zipfile.ZipFile(path) as zf:
        for mid, name in R3.building_entries(zf):
            model = R3.Model(zf, name)
            if len(model.tris) == 0:
                continue
            pts = model.tris.reshape(-1, 3)
            lo, hi = pts.min(0), pts.max(0)
            if bb is None or hi[0] < bb[0] or lo[0] > bb[2] or hi[1] < bb[1] or lo[1] > bb[3]:
                stats["outside"] += 1
                continue
            if R3.model_in_zone(model, zones, *origin):
                stats["sensitiveModels"] += 1
                continue
            models[mid] = len(model.tris)
            splat_faces(model, fx, stats, canopy)
            del model
    return models


# ---------------------------------------------------------------- 来源 2：R3 的逐幅投影缓存（6 px/m）
# 图幅 zip 拿不到时（例如下载口暂时不可用），走廊面退回 R3 已缓存的 6 px/m 投影：同样的夜景分类与浮雕，只是密度低。
# R3 缓存是 R3 脚本自己写的 pickle（landsd_3d_tex_bake.save_sheet），只读本机自己的缓存目录。

PCACHE_D = R3.ACC_PX_M


def pcache_load(bp: dict, sheet_dirs: list[pathlib.Path]) -> list[list]:
    """一栋楼在各幅 R3 缓存里的条目，按「深度大者胜」合并成 [棱柱][环 + 屋顶] 的 (col, dep) 全尺寸缓冲（只合墙带）。"""
    import pickle
    merged: list[list] = []
    for pi, pr in enumerate(bp["prisms"]):
        merged.append([None] * len(pr["rings"]))
    for sd in sheet_dirs:
        p = sd / "b" / f"{bp['key']}.pkl"
        if not p.exists():
            continue
        with open(p, "rb") as f:
            items = pickle.load(f)  # noqa: S301 —— R3 脚本自己写的缓存
        for pi, row in enumerate(items):
            if pi >= len(merged):
                break
            for ri, it in enumerate(row[:-1]):
                if it is None or ri >= len(merged[pi]):
                    continue
                r0, c0, col, dep = it
                cur = merged[pi][ri]
                if cur is None:
                    cur = merged[pi][ri] = {}
                cur.setdefault("items", []).append((r0, c0, col, dep))
    return merged


def pcache_section(items: list, prism_top: float, p0: float, L: float, sec: Section) -> None:
    """R3 墙带条目（6 px/m，行从棱柱顶起、列 = P × 6）→ 这个面这一段（d = acc = 6）：按整像素平移（误差 ≤ 半像素 ≈ 8 cm），深度大者胜。"""
    D = PCACHE_D
    dr = int(round((prism_top - sec.z_top) * D))
    dc = int(round(p0 * D))
    for r0, c0, col, dep in items:
        h, w = dep.shape
        # 条目在面段坐标里的位置
        rr0 = r0 - dr
        cc0 = c0 - dc
        a0, a1 = max(rr0, 0), min(rr0 + h, sec.H)
        b0, b1 = max(cc0, 0), min(cc0 + w, sec.W)
        if a1 <= a0 or b1 <= b0:
            continue
        sec.alloc()
        src_c = col[a0 - rr0:a1 - rr0, b0 - cc0:b1 - cc0]
        src_d = dep[a0 - rr0:a1 - rr0, b0 - cc0:b1 - cc0]
        cur = sec.dep[a0:a1, b0:b1]
        upd = src_d > cur
        sec.col[a0:a1, b0:b1][upd] = src_c[upd]
        cur[upd] = src_d[upd]


def r3_ref(merged: list[list]) -> float:
    """R3 bake_building 的去日照参考亮度：整栋墙带有效像素（每 7 个取 1）的线性亮度中位数。"""
    lum_w = np.array([0.2126, 0.7152, 0.0722])
    Ys = []
    for row in merged:
        for m in row:
            if not m:
                continue
            for _r0, _c0, col, dep in m["items"]:
                v = R3.strip_valid(col, dep)
                if v.any():
                    Ys.append(R3.srgb_to_linear(col[v][::7] / 255.0) @ lum_w)
    return float(np.median(np.concatenate(Ys))) if Ys else 0.1


# ---------------------------------------------------------------- 夜景分类（白天照片 → 逐纹素数据）

class density:
    """临时把 R3 的累积密度（R3 后处理函数里以像素计的半径都按它换算）换成 d。"""

    def __init__(self, d: float):
        self.d = d

    def __enter__(self):
        self.old = R3.ACC_PX_M
        R3.ACC_PX_M = self.d
        return self

    def __exit__(self, *a):
        R3.ACC_PX_M = self.old


SHOP_TOP_M = 5.2        # 店面开口的上沿（离地）
SHOP_MIN_H = 1.2        # 开口最矮
SHOP_MAX_FOOT = 1.4     # 开口底边离地不超过此值（开口要落到街面）
SHOP_MIN_W = 0.8
SHOP_SPLIT_M = 7.0      # 宽开口每这么宽换一个店铺种子
SIGN_MAX_H_STREET = 3.5  # 街面段的招牌最高（更高的彩色块多半是墙面材料）
SIGN_MAX_H_UPPER = 9.0
SIGN_MAX_AREA = 60.0
SIGN_MIN_AREA = 0.25
SIGN_MIN_D = 10.0       # 认招牌的最低密度（px/m）
RELIEF_MAX = 2.5


def _labels(mask: np.ndarray) -> tuple[np.ndarray, int]:
    """4 连通标号（按行的游程 + 并查集，确定性，只用 numpy）。返回 (标号 0 = 背景、1..n 按首次出现的行列序, n)。"""
    H, W = mask.shape
    lab = np.zeros((H, W), np.int64)
    if not mask.any():
        return lab, 0
    m = mask.astype(np.int8)
    dif = np.diff(np.pad(m, ((0, 0), (1, 1))), axis=1)
    parent: list[int] = [0]

    def find(a: int) -> int:
        while parent[a] != a:
            parent[a] = parent[parent[a]]
            a = parent[a]
        return a

    prev: list[tuple[int, int, int]] = []
    runs_all: list[tuple[int, int, int, int]] = []
    for y in range(H):
        starts = np.nonzero(dif[y] == 1)[0]
        ends = np.nonzero(dif[y] == -1)[0]
        cur = []
        j = 0
        for s, e in zip(starts.tolist(), ends.tolist()):
            lbl = 0
            while j < len(prev) and prev[j][1] <= s:
                j += 1
            k = j
            while k < len(prev) and prev[k][0] < e:
                pl = find(prev[k][2])
                if lbl == 0:
                    lbl = pl
                elif pl != lbl:
                    lo, hi = min(pl, lbl), max(pl, lbl)
                    parent[hi] = lo
                    lbl = lo
                k += 1
            if lbl == 0:
                lbl = len(parent)
                parent.append(lbl)
            cur.append((s, e, lbl))
            runs_all.append((y, s, e, lbl))
        prev = cur
    roots = [find(i) for i in range(len(parent))]
    remap: dict[int, int] = {}
    for y, s, e, l in runs_all:
        r = roots[l]
        if r not in remap:
            remap[r] = len(remap) + 1
        lab[y, s:e] = remap[r]
    return lab, len(remap)


def _morph(a: np.ndarray, r: int, op: str) -> np.ndarray:
    if r <= 0:
        return a
    b = R3.box_blur(a.astype(np.float64), r)
    return b > 1e-6 if op == "dil" else b > 1 - 1e-6


def sign_mask(srgb: np.ndarray, valid: np.ndarray, lift: np.ndarray, d: float, upper: bool) -> np.ndarray:
    """招牌（D1：照片里真实的招牌，夜里按自己的颜色发光）0–1：
    - 彩色：饱和（> 0.4）而且不暗（明度 > 0.3）；或白 / 浅色底（明度 > 0.72、饱和 < 0.18）上有密集笔画；
    - 有笔画（0.35 m 内的亮度梯度密度高：字、图案、灯管），整块招牌（闭运算补满字间）的平均笔画密度够高；
    - 块的大小：0.25–60 m²，高 ≤ 3.5 m（街面段）/ 9 m（上段），在离地 1.8 m 以上（店面的展示品、车不算）。
    大片均匀的彩色墙面（红砖、黄瓷砖、彩色玻璃）笔画不够 / 太高太大，不算。"""
    H, W = valid.shape
    if H < 3 or W < 3:
        return np.zeros((H, W), np.float32)
    mx = srgb.max(-1)
    mn = srgb.min(-1)
    sat = (mx - mn) / np.maximum(mx, 1e-6)
    lum = 0.2126 * srgb[..., 0] + 0.7152 * srgb[..., 1] + 0.0722 * srgb[..., 2]
    gx = np.zeros_like(lum)
    gy = np.zeros_like(lum)
    gx[:, 1:-1] = lum[:, 2:] - lum[:, :-2]
    gy[1:-1] = lum[2:] - lum[:-2]
    # 颜色梯度也算（同亮度的红底黄字）
    cg = np.zeros_like(lum)
    cg[:, 1:-1] = np.abs(srgb[:, 2:] - srgb[:, :-2]).sum(-1)
    cg[1:-1] += np.abs(srgb[2:] - srgb[:-2]).sum(-1)
    edge = (np.hypot(gx, gy) + 0.35 * cg) * valid
    r = max(1, int(round(0.35 * d / 2)))
    dens = R3.box_blur((edge > 0.12).astype(np.float64), r)
    colourful = (sat > 0.4) & (mx > 0.3)
    whitepanel = (mx > 0.72) & (sat < 0.18) & (dens > 0.22)
    cand = (colourful | whitepanel) & valid & (lift[:, None] > 1.8)
    cand = _morph(_morph(cand, max(1, int(round(0.12 * d))), "dil"), max(1, int(round(0.12 * d))), "ero")
    cand = _morph(_morph(cand, max(1, int(round(0.06 * d))), "ero"), max(1, int(round(0.06 * d))), "dil") & valid
    out = np.zeros((H, W), np.float32)
    if not cand.any():
        return out
    lab, n = _labels(cand)
    if n == 0:
        return out
    ys, xs = np.nonzero(lab)
    ls = lab[ys, xs]
    cnt = np.bincount(ls, minlength=n + 1)
    x0 = np.full(n + 1, W); x1 = np.zeros(n + 1, np.int64); y0 = np.full(n + 1, H); y1 = np.zeros(n + 1, np.int64)
    np.minimum.at(x0, ls, xs); np.maximum.at(x1, ls, xs); np.minimum.at(y0, ls, ys); np.maximum.at(y1, ls, ys)
    dsum = np.bincount(ls, dens[ys, xs], minlength=n + 1)
    max_h = SIGN_MAX_H_UPPER if upper else SIGN_MAX_H_STREET
    for k in range(1, n + 1):
        if cnt[k] == 0:
            continue
        blk = lab[y0[k]:y1[k] + 1, x0[k]:x1[k] + 1] == k
        ky0, ky1 = int(y0[k]), int(y1[k])
        bh = (ky1 - ky0 + 1) / d
        if bh > max_h:
            # R4 复审修正：招牌板常与下面的彩色门框、红柱、货品连成一块（惠康的红底招牌连着红色门面）→ 太高被整块丢掉。
            # 只留「行宽 ≥ 最宽行四成」的最长一段行（横向的板），再判一次
            rw = blk.sum(1)
            keep = _runs(rw >= 0.4 * rw.max(), gap=1, min_len=1)
            ra, rb = max(keep, key=lambda t: t[1] - t[0])
            blk = blk.copy()
            blk[:ra] = False
            blk[rb:] = False
            ky0, ky1 = ky0 + ra, ky0 + rb - 1
            blk = blk[ra:rb]
            bh = (ky1 - ky0 + 1) / d
        kc = int(blk.sum())
        cols = np.nonzero(blk.any(0))[0]
        if kc == 0 or len(cols) == 0:
            continue
        bw = (cols[-1] - cols[0] + 1) / d
        area = kc / (d * d)
        if area < SIGN_MIN_AREA or area > SIGN_MAX_AREA or bh > max_h or bh < 0.25 or bw < 0.3:
            continue
        dm = float(dens[ky0:ky1 + 1, x0[k]:x1[k] + 1][blk].mean())
        # 方正的大板（≥ 1.5 m 宽、占外包框七成以上）上的字只占一小部分：笔画密度门槛减半
        need = 0.08 if (bw >= 1.5 and blk.mean() > 0.7) else 0.16
        if dm < need:
            continue
        x0k = int(x0[k])
        y0[k], y1[k] = ky0, ky1
        # 招牌是矩形板：块占外包框过半就整框算（字间的底色也发光）
        if blk.mean() > 0.55:
            out[ky0:ky1 + 1, x0k:x1[k] + 1] = np.maximum(out[ky0:ky1 + 1, x0k:x1[k] + 1], 1.0)
        else:
            out[ky0:ky1 + 1, x0k:x1[k] + 1][blk] = 1.0
    out *= valid
    # 边缘软化（约 1 px）
    return np.clip(R3.box_blur(out, 1), 0, 1).astype(np.float32) * valid


def _lum(srgb: np.ndarray) -> np.ndarray:
    return 0.2126 * srgb[..., 0] + 0.7152 * srgb[..., 1] + 0.0722 * srgb[..., 2]


def _grad(lum: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    gx = np.zeros_like(lum)
    gy = np.zeros_like(lum)
    gx[:, 1:-1] = (lum[:, 2:] - lum[:, :-2]) * 0.5
    gy[1:-1] = (lum[2:] - lum[:-2]) * 0.5
    return gx, gy


def _tex(lum: np.ndarray, valid: np.ndarray, r: int) -> np.ndarray:
    """局部相对起伏（r px 窗口里亮度的标准差 / 均值）。"""
    m1, _ = R3.masked_blur(lum, valid, r)
    m2, _ = R3.masked_blur(lum * lum, valid, r)
    return np.sqrt(np.maximum(m2 - m1 * m1, 0)) / np.maximum(m1, 0.03)


def _runs(m: np.ndarray, gap: int = 0, min_len: int = 1) -> list[tuple[int, int]]:
    """一维布尔序列里的连续段 [a, b)；相隔 ≤ gap 的段合并，短于 min_len 的不要。"""
    out: list[list[int]] = []
    i, n = 0, len(m)
    while i < n:
        if not m[i]:
            i += 1
            continue
        j = i
        while j < n and m[j]:
            j += 1
        if out and i - out[-1][1] <= gap:
            out[-1][1] = j
        else:
            out.append([i, j])
        i = j
    return [(a, b) for a, b in out if b - a >= min_len]


def _box1d(v: np.ndarray, r: int) -> np.ndarray:
    if r <= 0 or len(v) == 0:
        return v.astype(np.float64)
    c = np.concatenate([[0.0], np.cumsum(v, dtype=np.float64)])
    i = np.arange(len(v))
    a = np.clip(i - r, 0, len(v))
    b = np.clip(i + r + 1, 0, len(v))
    return (c[b] - c[a]) / (b - a)


# R4 复审修正：街面铺位（原来的「暗 / 玻璃 / 凹进去就算开口，再按列补满」把整条街面带——招牌、花岗岩墙、车房门、瓷砖墙——都认成亮着的铺）
GF_TOP_M = 4.6          # 街面铺面带上沿（离地；与客户端 shopTop 一致）：铺位、质量闸只看这一带
HEAD_MIN_M = 2.3        # 铺面开口上沿（门楣 / 招牌底）的范围与缺省
HEAD_MAX_M = 3.8
CORE0_M, CORE1_M = 0.3, 2.2   # 判断开口用的核心行
BAY_MIN_W = 1.0         # 铺位最窄（m）
PIER_GAP_M = 0.25       # 窄于此的「柱」不算分隔（门框、竖梃）
DEBUG_BAYS: list | None = None  # 开发用：设成列表就收集每个铺位的分数


def shop_mask(srgb: np.ndarray, glass: np.ndarray, relief: np.ndarray, valid: np.ndarray, lift: np.ndarray, d: float,
              sign: np.ndarray, seed: int, head_cap: float | None = None) -> tuple[np.ndarray, np.ndarray]:
    """店面开口（夜里亮着的铺内）：按铺位（bay）找，不再逐像素。
    1. 核心行（离地 0.3–2.2 m）里「像开口」的像素：玻璃、或比这一带暗而且有内容（货品、灯、人）、或饱和而有内容；招牌不算；
    2. 按列求这种像素的比例，≥ 0.4 的连续列（窄于 0.25 m 的柱不断开、窄于 1 m 的不要）= 一个铺位；
    3. 铺位分类：均匀而不是玻璃（墙、石材、车房门）、横条为主而不饱和（卷闸）→ 不亮；
    4. 开口上沿（门楣）：从 2.2 m 往上，遇到招牌（≥ 三成宽）或「像开口」的像素少于两成（门楣墙）就停，2.3–3.8 m，雨篷底再封顶；
       开口 = 铺位宽 × 地面到门楣的矩形（真铺面是矩形，不跟照片噪点走），减去招牌；
    5. 很宽的铺位每约 SHOP_SPLIT_M 换一个店铺种子。返回 (开口 0–1, 店铺种子 0–255，0 = 不是开口)。"""
    H, W = valid.shape
    shop = np.zeros((H, W), np.float32)
    seeds = np.zeros((H, W), np.uint8)
    core = (lift > CORE0_M) & (lift < CORE1_M)
    band = (lift > -0.5) & (lift < GF_TOP_M)
    if core.sum() < 0.8 * d or W < BAY_MIN_W * d or not (valid & band[:, None]).any():
        return shop, seeds
    lum = _lum(srgb)
    vb = valid & band[:, None]
    ref = float(np.percentile(lum[vb], 65)) if vb.sum() > 20 else 0.4
    tex = _tex(lum, valid, max(1, int(round(0.15 * d))))
    mx = srgb.max(-1)
    sat = (mx - srgb.min(-1)) / np.maximum(mx, 1e-6)
    det = tex > 0.1
    dark = lum < 0.7 * max(ref, 0.06)
    colourful = (sat > 0.35) & (mx > 0.22)
    nosign = sign < 0.5
    open_px = ((glass > 0.6) | (dark & det) | (colourful & det) | (relief > 0.5)) & valid & nosign
    # 逐列特征（核心行，按 ±1 m 平滑）：开口像素比例、颜色起伏（货品）、亮点（铺内灯）、玻璃度、纹理、横纵梯度
    cv = valid[core]
    cnt = cv.sum(0).astype(np.float64)
    R = max(1, int(round(1.0 * d)))

    def colmean(x: np.ndarray) -> np.ndarray:
        return _box1d((x[core] * cv).sum(0), R) / np.maximum(_box1d(cnt, R), 1e-9)
    lm = colmean(lum)
    chroma = srgb - lum[..., None]
    csd = np.zeros(W)
    for ch in range(3):
        m1 = colmean(chroma[..., ch])
        m2 = colmean(chroma[..., ch] ** 2)
        csd += np.sqrt(np.maximum(m2 - m1 * m1, 0)) / 3
    medc = float(np.median(lum[core][cv])) if cv.any() else 0.2
    brf = colmean((lum > max(2.2 * medc, 0.25)).astype(np.float64))
    glc = colmean(glass)
    txc = colmean(tex)
    satc = colmean(sat)
    gx, gy = _grad(lum)
    exc = colmean(np.abs(gx))
    eyc = colmean(np.abs(gy))
    P = colmean(open_px.astype(np.float64))
    cover = _box1d(cnt, R) / max(core.sum(), 1)
    # 像铺：有货品的颜色起伏，或有铺内的亮灯点，或是有纹理、不太黑的玻璃面而且里面有亮点；横条为主而不饱和的是卷闸
    shopish = (csd >= 0.024) | ((brf >= 0.03) & (csd >= 0.014)) | ((glc >= 0.8) & (txc >= 0.15) & (lm >= 0.08) & (brf >= 0.01))
    shutter = (eyc > 2.2 * exc) & (satc < 0.12) & (glc < 0.5)
    colok = shopish & ~shutter & (P >= 0.35) & (cover > 0.5)
    bays = _runs(colok, gap=int(round(PIER_GAP_M * d)), min_len=int(round(BAY_MIN_W * d)))
    if DEBUG_BAYS is not None:
        for a0, b0 in _runs(np.ones(W, bool)):
            for c in range(a0, b0, max(1, int(d))):
                DEBUG_BAYS.append({"c": c, "csd": round(float(csd[c]), 3), "brf": round(float(brf[c]), 3), "gl": round(float(glc[c]), 2),
                                   "tx": round(float(txc[c]), 2), "lm": round(float(lm[c]), 3), "P": round(float(P[c]), 2),
                                   "sh": bool(shutter[c]), "ok": bool(colok[c])})
    up = np.nonzero((lift >= CORE1_M) & (lift <= HEAD_MAX_M))[0][::-1]  # 从低往高
    sgd = _morph(sign > 0.5, max(1, int(round(0.1 * d))), "dil")
    cap = HEAD_MAX_M if head_cap is None else max(HEAD_MIN_M, min(HEAD_MAX_M, head_cap))
    nb = 0
    for a, b in bays:
        head = cap
        low_run = 0
        for r in up:
            lr = float(lift[r])
            if lr > cap:
                break
            vr = valid[r, a:b]
            if vr.mean() < 0.3:
                continue
            if float((sign[r, a:b] > 0.5).mean()) > 0.3:
                head = lr
                break
            if float(open_px[r, a:b][vr].mean()) < 0.2:
                low_run += 1
                if low_run >= max(1, int(round(0.2 * d))):
                    head = lr + low_run / d
                    break
            else:
                low_run = 0
        head = max(HEAD_MIN_M, min(cap, head))
        rows = (lift > -0.6) & (lift < head)
        rect = np.zeros((H, W), bool)
        rect[rows, a:b] = True
        rect &= valid & ~sgd
        shop[rect] = 1.0
        bw = (b - a) / d
        nseg = max(1, int(round(bw / SHOP_SPLIT_M)))
        cols = np.arange(b - a)
        segi = np.minimum((cols * nseg) // max(b - a, 1), nseg - 1)
        sdv = np.array([1 + R3.ihash(seed, nb, j) % 255 for j in range(nseg)], np.uint8)[segi]
        ss = seeds[:, a:b]
        rr = rect[:, a:b]
        ss[rr] = np.broadcast_to(sdv[None, :], rr.shape)[rr]
        nb += 1
    shop *= valid
    seeds[~valid] = 0
    return shop, seeds


# 质量闸（R4 复审修正）：街面带里的照片有一部分不是铺面——雨篷顶的俯视图、拉长的竖条 / 斜条、空白一片、伸出墙外的东西
# （招牌侧面、帘子样的网格）。按 3 m 一窗（每 1 m 一步）打分，不合格的列在街面带里不用照片（客户端画暗的程序铺面）。
QG_WIN_M = 3.0
QG_STEP_M = 1.0


def gf_quality(srgb: np.ndarray, valid: np.ndarray, dep: np.ndarray, lift: np.ndarray, d: float) -> tuple[np.ndarray, list[dict]]:
    """返回 (坏列 bool (W,), 每窗的分数)。dep：离我们墙面的距离（外正，米，已按输出密度重采样）。
    - 空白：平均梯度 < 0.006 而且亮度标准差 < 0.02（平涂一片）；
    - 条纹：结构张量相干度（按梯度能量加权）> 0.62、强边像素 > 35 %、梯度以横向为主（竖条 / 斜条；横条是卷闸、百叶，不算）；
    - 伸出：离立面前沿外 1.2 m 以上的像素 > 45 %（招牌侧面、雨篷边垂下来的网格）。"""
    H, W = valid.shape
    bad = np.zeros(W, bool)
    info: list[dict] = []
    rows = (lift > 0.2) & (lift < GF_TOP_M - 0.2)
    if rows.sum() < d or W < 4:
        return bad, info
    lum = _lum(srgb)
    gx, gy = _grad(lum)
    r = max(1, int(round(0.2 * d)))
    jxx = R3.box_blur(gx * gx, r)
    jyy = R3.box_blur(gy * gy, r)
    jxy = R3.box_blur(gx * gy, r)
    tr = jxx + jyy
    coh = np.sqrt((jxx - jyy) ** 2 + 4 * jxy * jxy) / np.maximum(tr, 1e-9)
    gm = np.sqrt(gx * gx + gy * gy)
    vv = valid & rows[:, None]
    front = float(np.percentile(dep[valid], 60)) if valid.sum() > 20 else 0.0
    out_px = (dep > front + 1.2) & vv
    win = max(2, int(round(QG_WIN_M * d)))
    step = max(1, int(round(QG_STEP_M * d)))
    for c0 in range(0, max(1, W - win // 2), step):
        c1 = min(W, c0 + win)
        v = vv[:, c0:c1]
        n = int(v.sum())
        if n < 0.3 * (c1 - c0) * rows.sum():
            continue
        g = gm[:, c0:c1][v]
        e = float(g.mean())
        lsd = float(lum[:, c0:c1][v].std())
        t = tr[:, c0:c1][v]
        cw = float((coh[:, c0:c1][v] * t).sum() / max(t.sum(), 1e-9))
        fh = float(jxx[:, c0:c1][v].sum() / max(t.sum(), 1e-9))
        ed = float((g > 0.025).mean())
        po = float(out_px[:, c0:c1][v].mean())
        blank = e < 0.006 and lsd < 0.02
        streak = (cw > 0.68 and ed > 0.35 and fh > 0.35) or (cw > 0.82 and fh > 0.75 and e < 0.015)
        protr = po > 0.45
        info.append({"c0": c0, "c1": c1, "e": round(e, 4), "lsd": round(lsd, 3), "coh": round(cw, 3), "fh": round(fh, 3),
                     "ed": round(ed, 3), "po": round(po, 3), "bad": bool(blank or streak or protr)})
        if blank or streak or protr:
            bad[c0:c1] = True
    return bad, info


# 真窗格（R4 复审修正 H-P0-4）：连续玻璃原来按逐纹素的玻璃度亮灯，夜里成了一块块不规则的光斑与暗斑（迷彩）、
# 一扇窗的边是台阶。现在把连续玻璃（R3 独立窗以外的玻璃）按「玻璃行带 × 玻璃列段」切成矩形窗：行带太高的按层高切开、
# 列段太宽的按约 1.5 m 切成几扇（之间留 1 px 的暗框），每扇一个亮灯种子（同一行带里 2–6 扇共用一个种子 = 一个租户 / 一户）。
# 切不出矩形的零碎玻璃改成「暗玻璃」码（夜里只是暗玻璃，不亮灯）。
A_DARK_GLASS = 125      # alpha 码：暗玻璃（不亮灯）；见 R3 alpha 码（0 / 24 + k / 135–255），114–134 原来空着
WG_TILE_M = 12.0
WG_ROW_MIN_M = 0.5
WG_COL_MIN_M = 0.4
WG_PANE_M = 1.5


def window_grid(gl: np.ndarray, valid: np.ndarray, lift: np.ndarray, d: float, seed: int, f2f: float | None,
                win: np.ndarray, zmin: float) -> tuple[np.ndarray, np.ndarray]:
    """返回 (独立窗种子 int16（含原来的）, 暗玻璃 bool)。只处理离地 zmin 以上。"""
    H, W = valid.shape
    out = win.copy()
    dark = np.zeros((H, W), bool)
    g = (gl > 0.5) & valid & (win < 0) & (lift[:, None] > zmin)
    if g.sum() < d * d:
        return out, dark
    F = f2f if f2f and 2.6 <= f2f <= 6.0 else 3.4
    tile = max(int(round(WG_TILE_M * d)), 8)
    starts = list(range(0, W, tile))
    if len(starts) > 1 and W - starts[-1] < tile // 2:
        starts.pop()
    used = np.zeros((H, W), bool)
    for ti, c0 in enumerate(starts):
        c1 = W if ti == len(starts) - 1 else c0 + tile
        sub = g[:, c0:c1]
        vsub = valid[:, c0:c1]
        rf = sub.sum(1) / np.maximum(vsub.sum(1), 1)
        for ra, rb in _runs(rf > 0.35, gap=max(1, int(round(0.1 * d))), min_len=max(2, int(round(WG_ROW_MIN_M * d)))):
            hgt = (rb - ra) / d
            nfl = max(1, int(round(hgt / F))) if hgt > 1.25 * F else 1
            edges = [ra + int(round((rb - ra) * k / nfl)) for k in range(nfl + 1)]
            for fi in range(nfl):
                ya, yb = edges[fi], edges[fi + 1]
                if fi > 0:
                    ya += 1  # 楼板线：1 px 暗
                if yb - ya < 2:
                    continue
                cf = sub[ya:yb].mean(0)
                cruns = _runs(cf > 0.5, gap=max(1, int(round(0.12 * d))), min_len=max(2, int(round(WG_COL_MIN_M * d))))
                tenant = 2 + R3.ihash(seed, c0, ya, 7) % 5
                pane_i = 0
                for xa, xb in cruns:
                    w = (xb - xa) / d
                    npane = max(1, int(round(w / WG_PANE_M))) if w > 2.2 else 1
                    pe = [xa + int(round((xb - xa) * k / npane)) for k in range(npane + 1)]
                    for pk in range(npane):
                        pa, pb = pe[pk] + (1 if pk > 0 else 0), pe[pk + 1]
                        if pb - pa < 2:
                            continue
                        k = R3.ihash(seed, c0, ya, (pane_i // tenant) * 131 + 17) % R3.WIN_LEVELS
                        blk = out[ya:yb, c0 + pa:c0 + pb]
                        vb = vsub[ya:yb, pa:pb] & (blk < 0)
                        blk[vb] = k
                        used[ya:yb, c0 + pa:c0 + pb] |= vsub[ya:yb, pa:pb]
                        pane_i += 1
    dark = g & ~used & (out < 0)
    return out, dark


def vegetation_mask(srgb: np.ndarray, valid: np.ndarray, d: float) -> np.ndarray:
    """绿化（垂直绿化墙、补树没补掉的叶团）：绿多于红、蓝（相对亮度 > 0.04），饱和 > 0.15，周围 1 m 内一半以上也是这样的像素，
    再向外扩 0.3 m（叶缝里的暗斑）。均匀的绿漆、青绿玻璃饱和度低或偏青，不算。"""
    r, g, b = srgb[..., 0], srgb[..., 1], srgb[..., 2]
    mx = srgb.max(-1)
    mn = srgb.min(-1)
    sat = (mx - mn) / np.maximum(mx, 1e-6)
    lum = 0.2126 * r + 0.7152 * g + 0.0722 * b
    gd = (g - np.maximum(r, b)) / np.maximum(lum, 0.03)
    cand = (gd > 0.04) & (sat > 0.15) & valid
    if not cand.any():
        return cand
    near = R3.box_blur(cand.astype(np.float64), max(1, int(round(0.5 * d)))) > 0.5
    return (R3.box_blur(near.astype(np.float64), max(1, int(round(0.3 * d)))) > 0.05) & valid


def relief_map(dep: np.ndarray, valid: np.ndarray, d: float) -> np.ndarray:
    """墙面后退深度（m，0–2.5）：最外面的面到「立面前沿」的距离。前沿 = 每 4 m 宽一列的有效深度第 80 百分位（平滑）；
    凸出前沿的（雨篷檐口、招牌）为 0。"""
    H, W = dep.shape
    out = np.zeros((H, W), np.float32)
    if not valid.any():
        return out
    step = max(1, int(round(4 * d)))
    refs = []
    for c0 in range(0, W, step):
        v = valid[:, c0:c0 + step]
        dd = dep[:, c0:c0 + step][v]
        refs.append(float(np.percentile(dd, 80)) if dd.size > 10 else np.nan)
    refs = np.array(refs)
    if np.isnan(refs).all():
        return out
    refs = np.where(np.isnan(refs), np.nanmedian(refs), refs)
    xc = (np.arange(len(refs)) + 0.5) * step
    ref = np.interp(np.arange(W), xc, refs)
    rel = np.clip(ref[None] - dep, 0, RELIEF_MAX)
    return np.where(valid, rel, 0).astype(np.float32)


def align_canopies(cans: list[dict], dep: np.ndarray, valid: np.ndarray, lift: np.ndarray, acc: float) -> np.ndarray:
    """R4 复审修正：雨篷的高度对齐照片里「伸出墙外」的那几行（投影取最外面的面，檐口那几行墙面照片拍的就是檐口），
    客户端的檐口板正好盖住它们——檐口不再在雨篷上下各出现一次。返回要补的像素（雨篷范围里、檐口行以外 1.5 m 内仍伸出墙外的：
    雨篷顶的俯视图、招牌侧面），bool (H, W)。会改 cans 里的 zTopLift / zBotLift。"""
    H, W = valid.shape
    hole = np.zeros((H, W), bool)
    if not cans or valid.sum() < 20:
        return hole
    front = float(np.percentile(dep[valid], 60))
    pro = (dep > front + 0.5) & valid
    rows_ok = (lift > 2.2) & (lift < 8.0)
    for c in cans:
        a = max(0, int(c["s0"] * acc))
        b = min(W, int(math.ceil(c["s1"] * acc)))
        if b - a < 2:
            continue
        vc = valid[:, a:b].sum(1)
        rf = np.where(vc > 0, pro[:, a:b].sum(1) / np.maximum(vc, 1), 0.0)
        runs = _runs((rf > 0.4) & rows_ok, gap=max(1, int(round(0.1 * acc))), min_len=max(2, int(round(0.2 * acc))))
        if runs:
            zt0 = c["zTopLift"]
            # 离网格雨篷顶最近的一段（重叠优先）
            ra, rb = min(runs, key=lambda t: abs((lift[t[0]] + lift[t[1] - 1]) / 2 - (zt0 - 0.4)))
            top, bot = float(lift[ra]) + 0.5 / acc, float(lift[rb - 1]) - 0.5 / acc
            if abs(top - zt0) < 2.0:
                th = max(0.25, min(1.4, top - bot))
                c["zTopLift"] = top
                c["zBotLift"] = top - th
        zt, zb = c["zTopLift"], c["zBotLift"]
        band = ((lift > zt + 0.05) & (lift < zt + 1.5)) | ((lift < zb - 0.05) & (lift > zb - 1.0))
        hole[band, a:b] |= pro[band, a:b]
    return hole


def bake_section(col: np.ndarray, dep: np.ndarray, sec: Section, g: float, ref: float, max_h: float, seed: int,
                 stats: dict, cans: list[dict] | None = None, f2f: float | None = None, gf_reject: bool = False) -> dict | None:
    """一个面段（累积密度 acc 的颜色 + 深度）→ 输出密度 d 的颜色（R3 alpha 码）与半分辨率辅助图。
    cans：这个面的网格雨篷（街面段；就地对齐高度）。返回 {rgba (H,W,4) uint8, aux (H/2,W/2,4) uint8, canopy} / {excluded} / None。"""
    acc, d = sec.acc, sec.d
    valid = R3.strip_valid(col, dep)
    if valid.sum() < 50:
        return None
    H0, W0 = valid.shape
    z = sec.z_top - (np.arange(H0) + 0.5) / acc
    lift = z - g
    spans = [(0.0, W0 / acc)]
    depf = np.where(np.isfinite(dep), dep, -R3.TOL_IN).astype(np.float32)
    with density(acc):
        lin = R3.srgb_to_linear(col / 255.0)
        lin, vf = R3.fill_holes(lin, valid, int(R3.FILL_M * acc))
        srgb0 = R3.linear_to_srgb(R3.delight(lin, vf, ref, int(24 * acc)))
        net = R3.netting_faces(srgb0, vf, lift, spans)
        if net > R3.GREEN_MAX:
            return {"excluded": f"netting {net:.2f}"}
        leaf = R3.leafy_mask(R3.linear_to_srgb(lin), vf, lift)
        if leaf.any():
            stats["leafPx"] = stats.get("leafPx", 0) + int(leaf.sum())
            lin, vf = R3.inpaint_rows(lin, vf, leaf, spans)
        # 雨篷：网格雨篷对齐照片里的檐口行；檐口上下仍伸出墙外的（雨篷顶的俯视图、招牌侧面）按同一行的墙面补
        if sec.kind == "s" and cans:
            ch = align_canopies(cans, depf, valid, lift, acc)
            if ch.any():
                stats["canopyInpaintPx"] = stats.get("canopyInpaintPx", 0) + int(ch.sum())
                lin, vf = R3.inpaint_rows(lin, vf, ch, spans)
        lin = R3.delight(lin, vf, ref, int(24 * acc))
    rel = relief_map(depf, valid, acc)
    canopy = fascia_canopies(depf, valid, lift, acc, srgb0) if sec.kind == "s" else []
    # 重采样到输出密度
    W = int(math.ceil((W0 - 1) / acc * d)) + 1
    H = int(math.ceil((H0 - 1) / acc * d)) + 1
    r = acc / d
    if abs(r - 1) > 1e-6:
        res, cov = R3.resample(np.dstack([lin, rel, depf]), vf.astype(np.float64), W, H, W * r, H * r)
        valid = cov > 0.5
        lin = res[..., :3]
        rel = res[..., 3]
        dep_d = res[..., 4]
    else:
        valid = vf[:H, :W]
        lin = lin[:H, :W]
        rel = rel[:H, :W]
        dep_d = depf[:H, :W]
    lift_d = sec.z_top - (np.arange(H) + 0.5) / d - g
    with density(d):
        srgb = R3.linear_to_srgb(lin)
        gl = R3.clean_glass(R3.glass_mask(srgb, valid), srgb, valid, [(0.0, W / d)])
        # 绿化墙 / 补不掉的树叶：不是玻璃、不亮窗（叶缝的暗斑原来被认成一扇扇独立窗）
        veg = vegetation_mask(srgb, valid, d)
        gl = np.where(veg, 0.0, gl)
        stats["vegPx"] = stats.get("vegPx", 0) + int(veg.sum())
        upper = sec.kind == "u"
        # 招牌要看得出笔画：密度低于 SIGN_MIN_D（R3 的 6 px/m 退路）时不认招牌——糊成一片的彩色块整片发光反而不像
        sg = sign_mask(srgb, valid, lift_d, d, upper) if d >= SIGN_MIN_D else np.zeros((H, W), np.float32)
        bad = np.zeros(W, bool)
        if upper:
            shop = np.zeros((H, W), np.float32)
            seeds = np.zeros((H, W), np.uint8)
        else:
            cap = min((c["zBotLift"] for c in (cans or []) + canopy), default=None)
            shop, seeds = shop_mask(srgb, gl, rel, valid & ~veg, lift_d, d, sg, seed, None if cap is None else cap - 0.05)
            # 质量闸：街面带里不合格的列不用照片（客户端画暗的程序铺面）
            bad, qinfo = gf_quality(srgb, valid, dep_d, lift_d, d)
            if gf_reject:
                bad[:] = True
            if DEBUG_BAYS is not None:
                DEBUG_BAYS.extend({"q": q} for q in qinfo)
            if bad.any():
                gfrows = lift_d < GF_TOP_M + 0.05
                kill = np.zeros((H, W), bool)
                kill[gfrows] = bad[None, :]
                kill &= valid
                stats["gfRejectPx"] = stats.get("gfRejectPx", 0) + int(kill.sum())
                valid = valid & ~kill
                shop[kill] = 0
                seeds[kill] = 0
                sg = np.where(kill, 0.0, sg).astype(np.float32)
            stats["gfPx"] = stats.get("gfPx", 0) + int((valid & (lift_d[:, None] < GF_TOP_M)).sum())
        winok = valid & (lift_d[:, None] > GF_TOP_M + 0.3) & (sg < 0.5)
        win = R3.window_seeds(gl, winok, d, seed, max_h)
        # 连续玻璃 → 真窗格（矩形、≤ 一层、一扇一个种子）；切不出来的零碎玻璃 = 暗玻璃
        win, dglass = window_grid(gl, winok, lift_d, d, seed, f2f, win, GF_TOP_M + 0.3)
    # 店面开口按玻璃码（夜里的光由辅助图决定）
    alpha = R3.alpha_code(np.where(shop > 0.5, 1.0, gl), valid, win)
    alpha = np.where(dglass & valid, A_DARK_GLASS, alpha).astype(np.uint8)
    if not upper:
        # 街面带里不是店面开口的「玻璃」（黑花岗岩、暗玻璃墙、车房门也常被认成玻璃）夜里只是暗玻璃，不按写字楼楼层亮灯——
        # 街面的光只来自店面开口（辅助图）
        gfb = (lift_d[:, None] < GF_TOP_M + 0.3) & valid & (shop < 0.5) & (gl > 0.5) & (win < 0)
        alpha = np.where(gfb, A_DARK_GLASS, alpha).astype(np.uint8)
    rgba = R3.encode_rgba(lin, alpha)
    # 辅助图（半分辨率；R = 后退深度、G = 店面开口、B = 招牌、A = 店铺种子）
    He, We = H + (H & 1), W + (W & 1)

    def pad(a):
        return np.pad(a, ((0, He - H), (0, We - W)))

    def half(a):
        return a.reshape(He // 2, 2, We // 2, 2).mean((1, 3))
    vp = pad(valid.astype(np.float64))
    vh = half(vp)
    aux = np.zeros((He // 2, We // 2, 4), np.uint8)
    # 后退深度量化到 1/8 档（摄影测量的深度很噪：视差原来把噪声放大成「熔化」的墙）
    relq = np.round(np.clip(rel, 0, RELIEF_MAX) / RELIEF_MAX * 8) / 8 * RELIEF_MAX
    aux[..., 0] = np.clip(half(pad(relq) * vp) / np.maximum(vh, 1e-6) / RELIEF_MAX * 255 + 0.5, 0, 255)
    aux[..., 1] = np.clip(half(pad(shop)) * 255 + 0.5, 0, 255)
    aux[..., 2] = np.clip(half(pad(sg)) * 255 + 0.5, 0, 255)
    aux[..., 3] = pad(seeds).reshape(He // 2, 2, We // 2, 2).max((1, 3))
    stats["signPx"] = stats.get("signPx", 0) + int((sg > 0.5).sum())
    stats["shopPx"] = stats.get("shopPx", 0) + int((shop > 0.5).sum())
    stats["windowPx"] = stats.get("windowPx", 0) + int((win >= 0).sum())
    stats["darkGlassPx"] = stats.get("darkGlassPx", 0) + int((dglass & valid).sum())
    return {"rgba": rgba, "aux": aux, "canopy": canopy, "gfBad": float(bad.mean()) if W else 0.0}


# ---------------------------------------------------------------- 雨篷

CAN_MIN_DEPTH = 0.6      # 雨篷至少伸出这么多（m）
CAN_MIN_LEN = 1.5        # 至少这么长（m）
CAN_FASCIA_MIN = 0.6     # 深度法：檐口比立面前沿多伸出这么多
CAN_MAX_DEPTH = 4.0      # R4 复审修正：雨篷最深 4 m（原 5 m；更深的多半连到了行人天桥、骑楼顶）


def fascia_canopies(dep: np.ndarray, valid: np.ndarray, lift: np.ndarray, acc: float, srgb: np.ndarray) -> list[dict]:
    """深度法雨篷（任何来源都有）：离地 2.5–7 m 的行里，比立面前沿凸出 ≥ 0.6 m 的连续一段（≥ 1.5 m 长）= 雨篷檐口。
    返回 [{s0, s1（沿边米）, depth（伸出我们墙面的米数）, zTopLift, zBotLift（离墙脚地面）, fascia（sRGB 0–1）}]。"""
    H, W = dep.shape
    rows = np.nonzero((lift > 2.5) & (lift < 7.0))[0]
    if len(rows) < 2 or W < 4 or valid.sum() < 20:
        return []
    front = float(np.percentile(dep[valid], 60))
    sub = dep[rows]
    pro = (sub > front + CAN_FASCIA_MIN) & valid[rows]
    colhit = pro.sum(0) >= max(2, int(0.25 * acc))
    out = []
    c = 0
    while c < W:
        if not colhit[c]:
            c += 1
            continue
        c1 = c
        while c1 < W and (colhit[c1] or (c1 + 1 < W and colhit[c1 + 1])):
            c1 += 1
        if (c1 - c) / acc >= CAN_MIN_LEN:
            blk = pro[:, c:c1]
            rr = np.nonzero(blk.any(1))[0]
            depth = float(np.percentile(sub[:, c:c1][blk], 70))
            if depth >= CAN_MIN_DEPTH:
                r_top, r_bot = rows[rr[0]], rows[rr[-1]]
                fc = srgb[rows][:, c:c1][blk].mean(0)
                out.append({"s0": c / acc, "s1": c1 / acc, "depth": min(depth, R3.TOL_OUT), "zTopLift": float(lift[r_top]),
                            "zBotLift": float(lift[r_bot]), "fascia": [float(x) for x in fc]})
        c = c1 + 1
    return out


def mesh_canopies(tris: list, face: Face) -> list[dict]:
    """网格法雨篷（有图幅 zip 时）：分到这个面的近水平三角形（顶面朝上 / 底面朝下），沿边每 0.5 m 一格：
    伸出深度 = 覆盖这一格的三角形离墙最远处，高度 = 顶面最高；连续、深度相近（±0.75 m）、高度相近（±0.6 m）的格合成一块。"""
    if not tris:
        return []
    step = 0.5
    nb = max(1, int(math.ceil(face.L / step)))
    depth = np.zeros(nb)
    ztop = np.full(nb, np.nan)
    zbot = np.full(nb, np.nan)
    ctop = np.zeros((nb, 3))
    cbot = np.zeros((nb, 3))
    ntop = np.zeros(nb)
    nbot = np.zeros(nb)
    for tri, up, col in tris:
        rel = tri[:, :2] - face.A
        s = rel @ face.t
        o = rel @ face.n
        b0 = max(0, int(math.floor(s.min() / step)))
        b1 = min(nb, int(math.ceil(s.max() / step)))
        if b1 <= b0:
            continue
        zz = float(tri[:, 2].mean()) - face.g
        depth[b0:b1] = np.maximum(depth[b0:b1], float(o.max()))
        if up:
            ztop[b0:b1] = np.where(np.isnan(ztop[b0:b1]), zz, np.maximum(ztop[b0:b1], zz))
            ctop[b0:b1] += np.asarray(col) / 255.0
            ntop[b0:b1] += 1
        else:
            zbot[b0:b1] = np.where(np.isnan(zbot[b0:b1]), zz, np.minimum(zbot[b0:b1], zz))
            cbot[b0:b1] += np.asarray(col) / 255.0
            nbot[b0:b1] += 1
    z = np.where(np.isnan(ztop), zbot + 0.25, ztop)
    ok = (depth >= CAN_MIN_DEPTH) & np.isfinite(z)
    out = []
    i = 0
    while i < nb:
        if not ok[i]:
            i += 1
            continue
        j = i + 1
        while j < nb and ok[j] and abs(depth[j] - depth[i]) <= 0.75 and abs(z[j] - z[i]) <= 0.6:
            j += 1
        if (j - i) * step >= CAN_MIN_LEN:
            seg = slice(i, j)
            zt = float(np.nanmedian(z[seg]))
            zb = float(np.nanmin(zbot[seg])) if np.isfinite(zbot[seg]).any() else zt - 0.3
            ct = ctop[seg].sum(0) / max(ntop[seg].sum(), 1)
            cb = cbot[seg].sum(0) / nbot[seg].sum() if nbot[seg].sum() > 0 else ct * 0.7
            out.append({"s0": i * step, "s1": min(j * step, face.L), "depth": float(np.percentile(depth[seg], 70)),
                        "zTopLift": zt, "zBotLift": min(zb, zt - 0.12), "top": [float(x) for x in ct],
                        "under": [float(x) for x in cb]})
        i = j
    return out


def _rgb24(v) -> int:
    q = [min(255, max(0, int(round(float(x) * 255)))) for x in v]
    return (q[0] << 16) | (q[1] << 8) | q[2]


def canopy_record(face: Face, c: dict, origin: tuple[float, float]) -> list[int]:
    """雨篷记录（整数）：[x0, y0, x1, y1（模拟坐标 dm，贴墙的一边，沿外墙方向）, 伸出 dm, 顶面高程 dm（mPD）, 厚 cm,
    顶色, 底色, 檐口色（0xRRGGBB，sRGB）]。雨篷从这条边向外法线（边方向右手侧）伸出。"""
    e0, n0 = origin
    a = face.A + face.t * max(0.0, c["s0"])
    b = face.A + face.t * min(face.L, c["s1"])
    zt = face.g + c["zTopLift"]
    th = max(0.12, min(1.4, c["zTopLift"] - c["zBotLift"]))
    fascia = c.get("fascia") or [x * 0.85 for x in c.get("top", [0.45, 0.45, 0.45])]
    top = c.get("top") or fascia
    under = c.get("under") or [x * 0.6 for x in fascia]
    return [int(round((a[0] - e0) * 10)), int(round((a[1] - n0) * 10)), int(round((b[0] - e0) * 10)), int(round((b[1] - n0) * 10)),
            int(round(min(c["depth"], CAN_MAX_DEPTH) * 10)), int(round(zt * 10)), int(round(th * 100)), _rgb24(top), _rgb24(under), _rgb24(fascia)]


# ---------------------------------------------------------------- 装箱、写页

HI_Q = 80


AUX_MAX_MEAN_ERR = 12.0  # 辅助图 RGB 往返（编码 → 解码）的平均绝对误差上限（0–255），alpha = 0 处也算


def check_aux_roundtrip(img: np.ndarray, data: bytes) -> float:
    """自检（R4 复审修正）：解码刚编好的页，辅助图区（第 PAGE_HI 行以下）的 RGB 与编码前比，平均绝对误差超过 AUX_MAX_MEAN_ERR 就报错
    （原来没有 exact=True，alpha = 0 处的 RGB 被 libwebp 改写，约八成的辅助图纹素是垃圾）。返回误差。"""
    with Image.open(io.BytesIO(data)) as im:
        dec = np.asarray(im.convert("RGBA"))
    a = img[PAGE_HI:, :, :3].astype(np.int16)
    b = dec[PAGE_HI:, :, :3].astype(np.int16)
    err = float(np.abs(a - b).mean())
    if err > AUX_MAX_MEAN_ERR:
        raise SystemExit(f"辅助图往返误差 {err:.1f} > {AUX_MAX_MEAN_ERR}（WebP 编码改写了透明像素的 RGB？）")
    return err


class HiPages:
    """高清页：颜色 PAGE_HI²（RGB 有损 + alpha 无损 R3 码），下方 PAGE_HI/2 行左半是半分辨率辅助图（A 无损），合成一个 RGBA WebP
    （PAGE_HI × 1.5 PAGE_HI）。矩形（含 PAD_HI 外延）都是偶数尺寸、放在偶数坐标上，辅助图正好是颜色的一半。
    按调用顺序装箱（调用方按沿线里程排）；一页覆盖的楼群外包框对角线 ≤ diag_m（客户端按距离挑页才有效）。"""

    def __init__(self, out_dir: pathlib.Path | None, prefix: str, keep: int = 6, diag_m: float = 160.0):
        self.out = out_dir
        self.prefix = prefix
        self.keep = keep
        self.diag = diag_m
        self.sky: list = []
        self.bb: list[list[float]] = []
        self.buf: dict[int, np.ndarray] = {}
        self.files: list[dict] = []
        self.used = 0

    def place(self, rgba: np.ndarray, aux: np.ndarray, bb: list[float]) -> tuple[int, int, int]:
        h, w = rgba.shape[:2]
        W2 = w + (w & 1) + 2 * PAD_HI
        H2 = h + (h & 1) + 2 * PAD_HI
        self.flush(len(self.sky) - 1 - self.keep)
        placed = None
        best = None
        # 在还开着的页里挑「放得最靠上」的位置（最佳适配；同高取先开的页），页更满
        for pi in range(max(0, len(self.sky) - self.keep), len(self.sky)):
            b = self.bb[pi]
            if math.hypot(max(b[2], bb[2]) - min(b[0], bb[0]), max(b[3], bb[3]) - min(b[1], bb[1])) > self.diag:
                continue
            f = self.sky[pi].find(W2, H2)
            if f is not None and (best is None or f[1] < best[1]):
                best = (pi, f[1])
        if best is not None:
            xy = self.sky[best[0]].place(W2, H2)
            assert xy is not None
            placed = (best[0], *xy)
        if placed is None:
            self.sky.append(R3.Skyline(PAGE_HI))
            self.bb.append(list(bb))
            pg = np.zeros((PAGE_HI + PAGE_HI // 2, PAGE_HI, 4), np.uint8)
            pg[:PAGE_HI, :, :3] = 96
            self.buf[len(self.sky) - 1] = pg
            xy = self.sky[-1].place(W2, H2)
            assert xy is not None, (W2, H2)
            placed = (len(self.sky) - 1, *xy)
        pi, x, y = placed
        b = self.bb[pi]
        self.bb[pi] = [min(b[0], bb[0]), min(b[1], bb[1]), max(b[2], bb[2]), max(b[3], bb[3])]
        pg = self.buf[pi]
        c = np.pad(rgba, ((PAD_HI, PAD_HI + (h & 1)), (PAD_HI, PAD_HI + (w & 1)), (0, 0)), mode="edge")
        pg[y:y + c.shape[0], x:x + c.shape[1]] = c
        hp = PAD_HI // 2
        a = np.pad(aux, ((hp, hp), (hp, hp), (0, 0)), mode="edge")
        ay, ax = PAGE_HI + y // 2, x // 2
        pg[ay:ay + a.shape[0], ax:ax + a.shape[1]] = a
        self.used += W2 * H2
        return pi, x + PAD_HI, y + PAD_HI

    def flush(self, upto: int) -> None:
        for pi in sorted(k for k in self.buf if k <= upto):
            self.encode(pi, self.buf.pop(pi))

    def encode(self, pi: int, img: np.ndarray) -> None:
        bio = io.BytesIO()
        # exact=True（R4 复审修正）：libwebp 默认会改写 alpha = 0 像素的 RGB（还把整片透明的 8×8 块压成一个值）——
        # 辅助图的 alpha 是店铺种子，店面以外处处为 0，R / B（后退深度、招牌）原来大半被改成了别处的值
        Image.fromarray(img, "RGBA").save(bio, "WEBP", quality=HI_Q, method=6, alpha_quality=100, exact=True)
        data = bio.getvalue()
        check_aux_roundtrip(img, data)
        sha = hashlib.sha256(data).hexdigest()
        name = f"{self.prefix}{pi:03d}-{sha[:8]}.webp"
        if self.out is not None:
            (self.out / name).write_bytes(data)
        while len(self.files) <= pi:
            self.files.append({})
        self.files[pi] = {"file": name, "sha256": sha, "bytes": len(data)}

    def finish(self) -> list[dict]:
        self.flush(len(self.sky))
        return self.files


def selftest() -> None:
    # 走廊：轨道沿 x 轴；轨道北侧 20 m 一栋朝南的长楼（朝轨道）→ 南墙入选；它背后再一栋被整个挡住 → 不入选；
    # 背对轨道的北墙不入选；两端侧墙（轨道在侧前方 35 m 内）入选
    def box(x0, y0, x1, y1):
        return [x0 * 10, y0 * 10, x1 * 10, y0 * 10, x1 * 10, y1 * 10, x0 * 10, y1 * 10]
    b1 = box(-60, 20, 90, 40)
    b2 = box(0, 50, 30, 70)
    plans = [{"id": "A", "prisms": [{"rings": [b1]}]}, {"id": "B", "prisms": [{"rings": [b2]}]}]
    samples = np.stack([np.arange(-100, 200, 4.0), np.zeros(75)], 1)
    occ = ring_segments([b1, b2])
    f = corridor_faces(plans, samples, occ)
    assert f.get("A") is not None and (0, 0, 0) in f["A"], f
    assert (0, 0, 2) not in f["A"], f  # 北墙背对轨道
    assert "B" not in f, f  # 被 A 挡住（B 的南墙朝轨道但视线穿过 A）
    assert (0, 0, 1) in f["A"] and (0, 0, 3) in f["A"], f  # 东西两侧墙：轨道在侧前方 35 m 内
    # 远处（100 m 外）的楼不入选
    far = [{"id": "C", "prisms": [{"rings": [box(0, 120, 30, 140)]}]}]
    assert corridor_faces(far, samples, ring_segments([box(0, 120, 30, 140)])) == {}
    # 线段相交
    P = np.array([[0.0, 0.0], [0.0, 0.0]])
    Q = np.array([[10.0, 0.0], [0.0, 10.0]])
    assert list(blocked(P, Q, np.array([[5.0, -1.0, 5.0, 1.0]]))) == [True, False]
    # 连通块标号：4 连通、两块
    m = np.zeros((6, 8), bool)
    m[0, 0:3] = m[1, 2] = m[2, 0:6] = m[1, 5:8] = True
    m[4, 1] = True
    lab, n = _labels(m)
    assert n == 2 and lab[0, 0] == lab[1, 7] and lab[4, 1] != lab[0, 0], (lab, n)
    # 合成街面（24 px/m，宽 20 m、高 15 m，离地 0 起）：浅色石墙；两间铺（暗玻璃 0–3.5 m，宽 4 m）；
    # 铺上方一块红底白字招牌（3.8–4.6 m）；楼上一排窗（暗，1.2 × 1.5 m）
    d = 24.0
    H, W = int(15 * d), int(20 * d)
    lift = 15.0 - (np.arange(H) + 0.5) / d
    img = np.zeros((H, W, 3)) + [0.72, 0.68, 0.6]
    vv = np.ones((H, W), bool)
    L = lambda z: int((15.0 - z) * d)  # noqa: E731
    C = lambda s: int(s * d)  # noqa: E731
    goods = [[0.8, 0.2, 0.15], [0.9, 0.8, 0.2], [0.2, 0.6, 0.3], [0.9, 0.9, 0.85], [0.2, 0.3, 0.8]]
    for s0 in (2.0, 9.0):
        img[L(3.5):L(0.0), C(s0):C(s0 + 4)] = [0.1, 0.11, 0.13]
        # 铺内的货品（各色小块）：店面是「有内容」的开口
        for gi, zz in enumerate(np.arange(0.4, 2.2, 0.45)):
            for gj, ss in enumerate(np.arange(s0 + 0.3, s0 + 3.6, 0.6)):
                img[L(zz + 0.3):L(zz), C(ss):C(ss + 0.4)] = goods[(gi + gj) % len(goods)]
    img[L(4.6):L(3.8), C(2):C(13)] = [0.75, 0.08, 0.06]
    for k in range(10):  # 白色笔画（字）
        img[L(4.45):L(3.95), C(2.3 + k):C(2.3 + k) + 6] = [0.95, 0.95, 0.9]
    for s0 in np.arange(1.0, 19.0, 2.5):
        img[L(9.5):L(8.0), C(s0):C(s0 + 1.2)] = [0.15, 0.17, 0.2]
    sg = sign_mask(img, vv, lift, d, False)
    assert sg[L(4.2), C(7)] > 0.5 and sg[L(7.0), C(7)] < 0.5 and sg[L(1.0), C(4)] < 0.5, "招牌"
    gl = glass_like = (img.max(-1) < 0.3).astype(float)
    shop, seeds = shop_mask(img, gl, np.zeros((H, W)), vv, lift, d, sg, 5)
    assert shop[L(1.5), C(4)] > 0.5 and shop[L(1.5), C(11)] > 0.5, "两间铺都认出来"
    assert shop[L(8.5), C(1.5)] < 0.5 and shop[L(1.5), C(7.5)] < 0.5, "楼上的窗、铺之间的墙不是店面"
    assert seeds[L(1.5), C(4)] > 0 and seeds[L(1.5), C(4)] != seeds[L(1.5), C(11)], "每间铺一个种子"
    assert (shop_mask(img, gl, np.zeros((H, W)), vv, lift, d, sg, 5)[1] == seeds).all(), "确定性"
    del glass_like
    # 绿化：有明暗的绿是，均匀灰墙不是
    yy, xx = np.mgrid[0:120, 0:120]
    leaves = np.where((np.sin(xx * 0.9) * np.sin(yy * 0.7) > 0)[..., None], [0.25, 0.45, 0.15], [0.12, 0.22, 0.08])
    assert vegetation_mask(leaves, np.ones((120, 120), bool), 24).mean() > 0.9
    assert not vegetation_mask(np.zeros((120, 120, 3)) + 0.5, np.ones((120, 120), bool), 24).any()
    # 后退深度：立面前沿 0、凹进去 1.5 m 的铺 → 1.5；凸出的檐口 → 0
    dep = np.zeros((100, 200), np.float32)
    dep[60:, 40:120] = -1.5
    dep[50:55, :] = 2.0
    rel = relief_map(dep, np.ones((100, 200), bool), 10)
    assert abs(rel[80, 80] - 1.5) < 0.05 and rel[20, 80] < 0.05 and rel[52, 80] == 0.0, rel[80, 80]
    # 深度法雨篷：离地 3.5–4 m 一条凸出 2 m、长 8 m 的檐口
    acc = 10.0
    Hc, Wc = int(15 * acc), int(20 * acc)
    liftc = 15.0 - (np.arange(Hc) + 0.5) / acc
    depc = np.zeros((Hc, Wc), np.float32)
    depc[int((15 - 4.0) * acc):int((15 - 3.5) * acc), int(5 * acc):int(13 * acc)] = 2.0
    cans = fascia_canopies(depc, np.ones((Hc, Wc), bool), liftc, acc, np.zeros((Hc, Wc, 3)) + 0.5)
    assert len(cans) == 1 and abs(cans[0]["s0"] - 5) < 0.3 and abs(cans[0]["s1"] - 13) < 0.3 and abs(cans[0]["depth"] - 2) < 0.1, cans
    # 网格法雨篷：沿一面 10 m 长的墙，离地 4 m 一块伸出 2.5 m 的板（顶面朝上 + 底面朝下）
    face = Face("X", "k", 0, 0, 0, np.array([0.0, 0.0]), np.array([1.0, 0.0]), 10.0, 0.0, 0.0)
    slab = []
    for x0 in np.arange(1.0, 9.0, 1.0):
        top = np.array([[x0, 0.0, 4.0], [x0 + 1, 0.0, 4.0], [x0 + 1, -2.5, 4.0]])
        slab.append((top, True, np.array([120.0, 120.0, 120.0])))
        slab.append((top - [0, 0, 0.3], False, np.array([60.0, 60.0, 60.0])))
    mc = mesh_canopies(slab, face)
    assert len(mc) == 1 and abs(mc[0]["depth"] - 2.5) < 0.01 and abs(mc[0]["zTopLift"] - 4.0) < 0.01, mc
    rec = canopy_record(face, mc[0], (0.0, 0.0))
    assert rec[4] == 25 and rec[5] == 40 and rec[6] == 30 and len(rec) == 10, rec
    # 装箱：偶数对齐、不重叠、辅助图在颜色区下面
    pg = HiPages(None, "hs")
    rng = np.random.default_rng(3)
    occ = {}
    for _ in range(30):
        h, w = int(rng.integers(20, 300)), int(rng.integers(20, 500))
        rgba = np.full((h, w, 4), 200, np.uint8)
        aux = np.full(((h + 1) // 2, (w + 1) // 2, 4), 9, np.uint8)
        pi, x, y = pg.place(rgba, aux, [0.0, 0.0, 10.0, 10.0])
        assert x % 2 == 0 and y % 2 == 0 and x + w <= PAGE_HI and y + h <= PAGE_HI
        o = occ.setdefault(pi, np.zeros((PAGE_HI, PAGE_HI), np.int32))
        o[y:y + h, x:x + w] += 1
        assert pg.buf[pi][PAGE_HI + y // 2, x // 2, 0] == 9
    assert all(o.max() <= 1 for o in occ.values())
    # 辅助图往返：alpha = 0（不是店面）处的 R / B（后退深度、招牌）编码后不变（exact=True）
    pg2 = np.zeros((PAGE_HI + PAGE_HI // 2, PAGE_HI, 4), np.uint8)
    pg2[:PAGE_HI, :, :3] = 96
    pg2[:PAGE_HI, :, 3] = 255
    yy2, xx2 = np.mgrid[0:PAGE_HI // 2, 0:PAGE_HI // 2]
    pg2[PAGE_HI:, :PAGE_HI // 2, 0] = ((xx2 // 37) % 5) * 50
    pg2[PAGE_HI:, :PAGE_HI // 2, 2] = ((yy2 // 23) % 2) * 255
    bio2 = io.BytesIO()
    Image.fromarray(pg2, "RGBA").save(bio2, "WEBP", quality=HI_Q, method=6, alpha_quality=100, exact=True)
    assert check_aux_roundtrip(pg2, bio2.getvalue()) < AUX_MAX_MEAN_ERR
    bio3 = io.BytesIO()
    Image.fromarray(pg2, "RGBA").save(bio3, "WEBP", quality=HI_Q, method=6, alpha_quality=100)
    try:
        check_aux_roundtrip(pg2, bio3.getvalue())
        bad_ok = True
    except SystemExit:
        bad_ok = False
    assert not bad_ok, "没有 exact=True 时自检应该报错"
    # 裁边：偶数起点，tile 切片
    rg = np.zeros((40, 2500, 4), np.uint8)
    rg[5:30, 3:2400, 3] = 255
    tiles = crop_tiles(rg, np.zeros((20, 1250, 4), np.uint8), TILE_HI)
    assert [t[2] for t in tiles] == [2, 2 + TILE_HI, 2 + 2 * TILE_HI] and all(t[3] == 4 for t in tiles), [t[2:] for t in tiles]
    print("selftest ok")


# ---------------------------------------------------------------- 逐幅缓存与打包

OUT_FILE = "landsd-3dvm-hires.json.gz"
FETCHED_HI = "2026-11-27"
OUT_D = [D_STREET, D_UPPER]  # 实际输出密度（main 按 --d-street / --d-upper 设）


def hi_fingerprint(digest: str) -> str:
    """高清投影指纹：投影参数 + 走廊参数 + 城市输入指纹（走廊面变了缓存就作废）。"""
    p = [HI_VERSION, ACC_STREET, ACC_UPPER, STREET_TOP_M, HI_TOP_M, R3.TOL_OUT, R3.TOL_IN, R3.WALL_COS, R3.WALL_NZ,
         TRACK_STEP_M, CORR_FAR_M, CORR_FAR_DEG, CORR_NEAR_M, CORR_NEAR_COS, MIN_FACE_M, CAN_NZ, CAN_Z0, CAN_Z1, CAN_O0, CAN_O1, digest]
    return hashlib.sha256(json.dumps(p).encode()).hexdigest()[:8]


def hi_sheet_dir(cache: pathlib.Path, s: dict, fp: str) -> pathlib.Path:
    return cache / "hires" / f"{s['sheet']}_{s['revision']}_{fp}"


def project_sheet(path: pathlib.Path, sd: pathlib.Path, s: dict, fx: FaceIndex, faces: list[Face], zones: list[dict],
                  origin: tuple[float, float]) -> dict:
    """一幅 zip → 走廊面的高清投影缓存（每段一个 npz + canopy.json + done.json，done.json 最后原子写 = 完成标记）。"""
    sha, n = R3.file_sha256(path)
    t1 = time.time()
    st = {"px": 0, "outside": 0, "sensitiveModels": 0, "canopyTris": 0}
    canopy: dict = {}
    models = project_zip(path, fx, zones, origin, st, canopy)
    names = save_faces(sd, faces)
    can = {k: [[t.round(3).tolist(), up, [round(float(x), 1) for x in c]] for t, up, c in v] for k, v in sorted(canopy.items())}
    (sd / "canopy.json").write_text(json.dumps(can), encoding="utf-8")
    done = {"sheet": s["sheet"], "revision": s["revision"], "urlNoKey": s.get("urlNoKey", ""), "sha256": sha, "bytes": n,
            "stats": st, "models": models, "files": sorted(names), "projectS": round(time.time() - t1)}
    tmp = sd / "done.json.tmp"
    tmp.write_text(json.dumps(done, ensure_ascii=False), encoding="utf-8")
    tmp.replace(sd / "done.json")
    reset_faces(faces)
    R3.log(f"  {s['sheet']} 高清投影 {st}，{len(names)} 段，{time.time() - t1:.0f} s")
    return done


def load_hi_sections(face: Face, sheet_dirs: list[pathlib.Path]) -> None:
    """各幅高清缓存里这个面的段按「深度大者胜」合并（按图幅号顺序，平局取先者）。"""
    for sd in sheet_dirs:
        for sec in face.secs:
            p = sd / "f" / f"{face.name}_{sec.kind}.npz"
            if not p.exists():
                continue
            with np.load(p, allow_pickle=False) as z:
                col, dep, off = z["col"], z["dep"].astype(np.float32), z["off"]
            r0, c0 = int(off[0]), int(off[1])
            h, w = dep.shape
            sec.alloc()
            cur = sec.dep[r0:r0 + h, c0:c0 + w]
            upd = dep > cur
            sec.col[r0:r0 + h, c0:c0 + w][upd] = col[upd]
            cur[upd] = dep[upd]


def r3_sheets_of(pcache: pathlib.Path | None) -> dict[str, list[pathlib.Path]]:
    """R3 缓存：几何指纹 → 有这栋投影的各幅缓存目录（按图幅号）。"""
    out: dict[str, list[pathlib.Path]] = {}
    if pcache is None or not pcache.exists():
        return out
    for sd in sorted(pcache.iterdir()):
        dj = sd / "done.json"
        if not dj.exists():
            continue
        done = json.loads(dj.read_text(encoding="utf-8"))
        if done.get("fingerprint") != R3.proj_fingerprint():
            continue
        for k in done["keys"]:
            out.setdefault(k, []).append(sd)
    return out


def _bake_building(bp: dict, faces: list[Face], hi_dirs: dict[str, pathlib.Path], r3_dirs: list[pathlib.Path],
                   canopy_tris: dict, f2f: float | None, stats: dict) -> dict:
    """一栋走廊楼：选来源（这栋楼触到的图幅全有高清缓存 → 高清；否则 R3 的 6 px/m 缓存），烘焙各段，返回段结果与雨篷。"""
    merged = pcache_load(bp, r3_dirs) if r3_dirs else None
    ref = r3_ref(merged) if merged else 0.1
    r3_sheet_names = {sd.name.split("_")[0] for sd in r3_dirs}
    hi_ok = bool(r3_sheet_names) and all(sh in hi_dirs for sh in r3_sheet_names)
    max_h = min(R3.WIN_MAX_H, R3.WIN_MAX_H_F * f2f) if f2f else R3.WIN_MAX_H_NOFLOOR
    seed = int(bp["key"][:8], 16)
    out: dict = {"faces": [], "canopies": [], "excluded": [], "source": "hires" if hi_ok else "r3"}
    for f in faces:
        if f.name in MANUAL_EXCLUDE_FACES:
            out["excluded"].append({"face": f.name, "why": MANUAL_EXCLUDE_FACES[f.name]})
            continue
        if not hi_ok:
            # 退路：段按 R3 的 6 px/m 重建（密度 = 累积密度 = 6）
            pr = bp["prisms"][f.pi]
            f.secs = face_sections(pr["bottom"] / 10, pr["top"] / 10, f.g, f.L, PCACHE_D, PCACHE_D, PCACHE_D, PCACHE_D)
            for sec in f.secs:
                if merged and merged[f.pi][f.ri]:
                    pcache_section(merged[f.pi][f.ri]["items"], pr["top"] / 10, f.p0, f.L, sec)
        else:
            load_hi_sections(f, [hi_dirs[sh] for sh in sorted(r3_sheet_names)])
        res_secs = []
        can: list[dict] = []
        bad = False
        # 网格雨篷先算：街面段烘焙时把它们的高度对齐照片里的檐口行（并补掉檐口上下的雨篷顶 / 招牌侧面）
        mc = mesh_canopies(canopy_tris.get(f.bid, []), f) if hi_ok else []
        for sec in f.secs:
            if sec.col is None:
                continue
            r = bake_section(sec.col, sec.dep, sec, f.g, ref, max_h, R3.ihash(seed, f.pi, f.ri, f.ei, 1 if sec.kind == "u" else 0), stats,
                             mc if sec.kind == "s" else None, f2f, f.name in MANUAL_GF_REJECT)
            sec.col = None
            sec.dep = None
            if r is None:
                continue
            if "excluded" in r:
                out["excluded"].append({"face": f.name, "why": r["excluded"]})
                bad = True
                continue
            res_secs.append((sec, r))
            can += r["canopy"]
        if bad or not res_secs:
            continue
        out["faces"].append((f, res_secs))
        out["canopies"] += [(f, c) for c in (mc if mc else can)]
    return out


BAND_ROWS = 200  # R4 复审修正：片按行切成 ≤ 200 行的带（原来整段 360–385 行一片，一页只放得下两排、页平均只填满 60 %）


def crop_tiles(rgba: np.ndarray, aux: np.ndarray, tile: int, band: int = BAND_ROWS) -> list[tuple[np.ndarray, np.ndarray, int, int]]:
    """段的颜色裁到有效像素外包框（偶数对齐，辅助图同步），按行切成高 ≤ band 的带（偶数行界），每带再按 tile 宽切片：
    [(rgba, aux, c0, r0)]（c0、r0 为段内列 / 行）。"""
    valid = rgba[..., 3] > 0
    if valid.sum() < 50:
        return []
    rows = np.nonzero(valid.any(1))[0]
    cols = np.nonzero(valid.any(0))[0]
    r0 = int(rows[0]) & ~1
    c0 = int(cols[0]) & ~1
    r1 = int(rows[-1]) + 1
    c1 = int(cols[-1]) + 1
    nb = max(1, int(math.ceil((r1 - r0) / band)))
    edges = [r0 + (((r1 - r0) * k // nb) & ~1) for k in range(nb)] + [r1]
    out = []
    for bi in range(nb):
        ra, rb = edges[bi], edges[bi + 1]
        if rb <= ra:
            continue
        for a in range(c0, c1, tile):
            b = min(c1, a + tile)
            rg = rgba[ra:rb, a:b]
            if (rg[..., 3] > 0).sum() < 50:
                continue
            vr = np.nonzero((rg[..., 3] > 0).any(1))[0]
            vc = np.nonzero((rg[..., 3] > 0).any(0))[0]
            ya, yb = (int(vr[0]) & ~1), int(vr[-1]) + 1
            xa, xb = (int(vc[0]) & ~1), int(vc[-1]) + 1
            rg = rg[ya:yb, xa:xb]
            ax = aux[(ra + ya) // 2:(ra + yb + 1) // 2, (a + xa) // 2:(a + xb + 1) // 2]
            out.append((rg, ax, a + xa, ra + ya))
    return out


_FIN: dict = {}


def _fin_one(i: int) -> tuple[dict, dict]:
    """并行烘焙的工作函数（fork 出来的子进程继承 _FIN）：一栋楼 → 只含数组与小元组的结果（不回传 Face 对象），与这栋的统计增量。"""
    bp = _FIN["todo"][i]
    st: dict = {}
    faces = _FIN["by_b"][bp["id"]]
    res = _bake_building(bp, faces, _FIN["hi_dirs"], _FIN["r3_keys"].get(bp["key"], []), _FIN["canopy_tris"],
                         _FIN["f2fs"].get(bp["id"]), st)
    idx = {id(f): k for k, f in enumerate(faces)}
    out = {"faces": [(idx[id(f)], [((sec.kind, sec.d, sec.z_top, sec.z_bot), r) for sec, r in secs]) for f, secs in res["faces"]],
           "canopies": [(idx[id(f)], c) for f, c in res["canopies"]], "excluded": res["excluded"], "source": res["source"]}
    return out, st


def finalize(plans: list[dict], faces_all: list[Face], hi_dirs: dict[str, pathlib.Path], r3_keys: dict[str, list[pathlib.Path]],
             canopy_tris: dict, f2fs: dict, origin: tuple[float, float], out_dir: pathlib.Path | None, stats: dict,
             exclude: set[str], workers: int = 1, extra_exclude: dict[str, str] | None = None) -> dict:
    """全部走廊楼按沿线（x 坐标）顺序烘焙、装箱（街面段、上段分两套页），返回清单内容。
    workers > 1：逐栋烘焙分给 fork 出来的子进程（按原顺序取回），装箱仍在主进程按顺序做——产物与 workers 无关。"""
    by_b: dict[str, list[Face]] = {}
    for f in faces_all:
        by_b.setdefault(f.bid, []).append(f)
    order = sorted((bp for bp in plans if bp["id"] in by_b), key=lambda bp: (bp["cx"], bp["id"]))
    pages = {"s": HiPages(out_dir, "hs"), "u": HiPages(out_dir, "hu")}
    recs: dict[str, dict] = {}
    excluded: dict[str, str] = {}
    face_ex: list[dict] = []
    sources = {"hires": 0, "r3": 0}
    man_ex = {**MANUAL_EXCLUDE_BUILDINGS, **(extra_exclude or {})}
    for bp in order:
        if bp["id"] in man_ex:
            excluded[bp["id"]] = man_ex[bp["id"]]
        elif bp["id"] in exclude and bp["id"] not in R3_RELEASE:
            excluded[bp["id"]] = "R3 excluded (scaffold / netting / hoarding)"
    todo = [bp for bp in order if (bp["id"] not in exclude or bp["id"] in R3_RELEASE) and bp["id"] not in man_ex]
    _FIN.update({"todo": todo, "by_b": by_b, "hi_dirs": hi_dirs, "r3_keys": r3_keys, "canopy_tris": canopy_tris, "f2fs": f2fs})
    pool = None
    if workers > 1:
        import multiprocessing as mp
        pool = mp.get_context("fork").Pool(workers)
        results = pool.imap(_fin_one, range(len(todo)), chunksize=1)
    else:
        results = map(_fin_one, range(len(todo)))
    for n, (bp, (res, st)) in enumerate(zip(todo, results)):
        for k, v in st.items():
            stats[k] = stats.get(k, 0) + v
        face_ex += [{"id": bp["id"], **e} for e in res["excluded"]]
        frecs = []
        for fi, secs in res["faces"]:
            f = by_b[bp["id"]][fi]
            B = f.A + f.t * f.L
            bb = [float(min(f.A[0], B[0])), float(min(f.A[1], B[1])), float(max(f.A[0], B[0])), float(max(f.A[1], B[1]))]
            for (kind, d, z_top, z_bot), r in secs:
                pcs = []
                for rg, ax, c0, r0 in crop_tiles(r["rgba"], r["aux"], TILE_HI):
                    pg, x, y = pages[kind].place(rg, ax, bb)
                    pcs.append([pg, x, y, c0, r0, rg.shape[1], rg.shape[0], kind])
                if pcs:
                    frecs.append([bp["prisms"][f.pi]["index"], f.ri, f.ei, 0 if kind == "s" else 1, R3.quant(d),
                                  int(round(z_top * 10)), int(round(z_bot * 10)), pcs])
        if frecs:
            sources[res["source"]] += 1
            recs[bp["id"]] = {"k": bp["key"], "f": frecs, "src": res["source"],
                              "c": [canopy_record(by_b[bp["id"]][fi], c, origin) for fi, c in res["canopies"]]}
        if n % 20 == 0:
            R3.log(f"  高清 {n + 1}/{len(todo)} 栋，页 s {len(pages['s'].sky)} / u {len(pages['u'].sky)}")
    if pool is not None:
        pool.close()
        pool.join()
    fs = pages["s"].finish()
    fu = pages["u"].finish()
    ns = len(fs)
    out_b = {}
    for bid, r in sorted(recs.items()):
        fl = []
        for part, ri, ei, kind, dq, zt, zb, pcs in r["f"]:
            flat = [part, ri, ei, kind, dq, zt, zb, len(pcs)]
            for pg, x, y, c0, r0, w, h, sk in pcs:
                flat += [pg if sk == "s" else ns + pg, x, y, c0, r0, w, h]
            fl.append(flat)
        out_b[bid] = {"k": r["k"], "f": fl, **({"c": r["c"]} if r["c"] else {}), "src": r["src"]}
    stats.update({"sources": sources, "pagesStreet": ns, "pagesUpper": len(fu)})
    return {"pages": fs + fu, "streetPages": ns, "buildings": out_b, "excluded": excluded, "faceExcluded": face_ex}


def write_outputs(result: dict, sheets: list[dict], stats: dict, corridor: dict, raw_dir: pathlib.Path, update: bool) -> dict:
    doc = {
        "format": "central-3dvm-hires",
        "version": 1,
        "datasetId": R3.DATASET_ID,
        "params": {"page": PAGE_HI, "aux": PAGE_HI // 2, "pad": PAD_HI, "tile": TILE_HI, "densityQ": R3.DENSITY_Q,
                   "dStreet": OUT_D[0], "dUpper": OUT_D[1], "streetTopM": STREET_TOP_M, "hiTopM": HI_TOP_M, "webpQ": HI_Q,
                   "reliefMaxM": RELIEF_MAX,
                   "image": "RGBA WebP page x 1.5 page: rows [0, page) colour (sRGB, lossy) + alpha (lossless, R3 code: 0 = no photo, "
                            "255 - 120 * glass, 24 + k window seed); rows [page, 1.5 page) cols [0, page/2): half-resolution aux "
                            "(R = recess depth 0..reliefMaxM, G = lit shop opening 0..1, B = emissive sign 0..1, A = shop seed 1..255 "
                            "lossless, 0 = none)"},
        "record": "per building f: [part, ring, edge, kind (0 street, 1 upper), dq, zTop dm, zBot dm, n, n x (page, x, y, c0, r0, w, h)]; "
                  "density = dq / densityQ px/m; face-local col = s * d (s = metres along the edge from its start vertex), "
                  "row = (zTop - z) * d; photo for c0 <= col < c0 + w, r0 <= row < r0 + h at page texel (x + col - c0, y + row - r0); "
                  "c: canopies [x0, y0, x1, y1 (dm, wall side), depth dm, top z dm, thickness cm, top rgb, under rgb, fascia rgb]",
        "pages": result["pages"],
        "streetPages": result["streetPages"],
        "buildings": result["buildings"],
        "excluded": {"buildings": result["excluded"], "faces": result["faceExcluded"]},
        "corridor": corridor,
        "stats": stats,
    }
    text = json.dumps(doc, separators=(",", ":"), ensure_ascii=False)
    data = gzip.compress(text.encode("utf-8"), 9, mtime=0)
    raw_dir.mkdir(parents=True, exist_ok=True)
    (raw_dir / OUT_FILE).write_bytes(data)
    total = sum(p["bytes"] for p in result["pages"])
    print(f"{OUT_FILE} gzip {len(data)} B；{len(result['pages'])} 页（街面 {result['streetPages']}），共 {total} B；统计 {stats}")
    entry = {
        "file": OUT_FILE, "layer": "landsd/3dvm-individualised-hires", "datasetId": R3.DATASET_ID,
        "url": f"{R3.PORTAL}/geoportal/?datasetId={R3.DATASET_ID}", "query": R3.INDEX_QUERY,
        "release": max((s["revision"] for s in sheets), default=R3.FETCHED),
        "format": "gzip JSON (written by landsd_3d_hires_bake.py): tram-corridor street walls, per building face the hi-res facade "
                  "atlas references (photo, night classes, recess depth) and canopies; lists the derived WebP pages in "
                  "client/public/city/facades/ with sha256",
        "crs": "EPSG:2326 + mPD", "licenses": [R3.TERMS], "attribution": R3.ATTRIBUTION, "fetched": FETCHED_HI,
        "sha256": hashlib.sha256(data).hexdigest(), "bytes": len(data), "rows": len(result["buildings"]),
        "derivedFrom": [{k: s[k] for k in ("sheet", "revision", "urlNoKey", "sha256", "bytes", "source")} for s in sheets],
    }
    if update:
        path = raw_dir / "sources.json"
        manifest = json.loads(path.read_text(encoding="utf-8"))
        manifest["files"] = [f for f in manifest["files"] if f["file"] != entry["file"]] + [entry]
        path.write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    return entry


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--cache", default=None, help="高清投影缓存根目录（必需；不在仓库里）")
    ap.add_argument("--r3-cache", default=None, help="R3 的逐幅投影缓存（landsd_3d_tex_bake.py --cache 的目录；6 px/m 退路与去日照参考）")
    ap.add_argument("--zip-dir", default=None, help="目录里有 <图幅>.zip 或 <图幅>_<版本>.zip 就直接用（不下载、不删）")
    ap.add_argument("--download", action="store_true", help="缺的走廊图幅从下载口下载（一幅一幅、Range 续传，投影完删 zip）")
    ap.add_argument("--sheets", default=None, help="只投影这些图幅（逗号分隔）")
    ap.add_argument("--corridor-only", action="store_true")
    ap.add_argument("--project-only", action="store_true")
    ap.add_argument("--finalize-only", action="store_true")
    ap.add_argument("--out", default=None, help="开发用：输出根目录（写 DIR/facades/ 与 DIR/清单，不碰仓库）")
    ap.add_argument("--workers", type=int, default=3, help="打包时并行烘焙的子进程数（每个约 0.3–1 GB 常驻内存）")
    ap.add_argument("--d-street", type=float, default=D_STREET, help="街面段输出密度（px/m，≤ ACC_STREET；不必重新投影）")
    ap.add_argument("--d-upper", type=float, default=D_UPPER, help="上段输出密度（px/m，≤ ACC_UPPER）")
    ap.add_argument("--selftest", action="store_true")
    args = ap.parse_args()
    if args.selftest:
        selftest()
        return
    if not args.cache:
        raise SystemExit("需要 --cache DIR")
    if not (0 < args.d_street <= ACC_STREET and 0 < args.d_upper <= ACC_UPPER):
        raise SystemExit("输出密度须在 (0, 累积密度] 内")
    OUT_D[:] = [args.d_street, args.d_upper]
    cache = pathlib.Path(args.cache)
    cache.mkdir(parents=True, exist_ok=True)
    city = json.loads((R3.CITY_DIR / "central.json").read_text(encoding="utf-8"))
    relief = R3.Relief((R3.CITY_DIR / "terrain.bin").read_bytes())
    meta = city["meta"]
    origin = (meta["origin"]["e"], meta["origin"]["n"])
    zones = city["zones"]["sensitive"]
    t0 = time.time()
    plans, cfaces, near_zone = corridor_plan(city, relief)
    cst = corridor_stats(plans, cfaces, relief)
    R3.log(f"走廊 {cst}，离敏感区太近 {len(near_zone)} 栋，{time.time() - t0:.0f} s")
    (cache / "corridor.json").write_text(json.dumps({"stats": cst, "faces": {k: v for k, v in sorted(cfaces.items())},
                                                     "nearZone": near_zone}), encoding="utf-8")
    if args.corridor_only:
        return
    # 走廊面指纹（楼号、几何指纹、面列表）：城市产物别的部分变了（例如本清单本身进了输入快照）不让缓存作废
    fp = hi_fingerprint(hashlib.sha256(json.dumps([[bp["id"], bp["key"], cfaces[bp["id"]]] for bp in plans]).encode()).hexdigest()[:16])
    faces = build_faces(plans, cfaces, relief, origin, args.d_street, args.d_upper)
    fx = FaceIndex(faces)
    idx_path = cache / "index.json"
    if args.finalize_only and idx_path.exists():
        index = json.loads(idx_path.read_text(encoding="utf-8"))
    else:
        index = R3.sheet_index(R3.data_bbox(meta))
        idx_path.write_text(json.dumps([{k: v for k, v in s.items() if k != "url"} for s in index], indent=1), encoding="utf-8")
    # 走廊触到的图幅：图幅中心 ±(375 + 40, 300 + 40) m 的框与走廊面相交（1:1000 图幅 750 × 600 m）
    want = []
    for s in index:
        hit = any(abs(f.A[0] + f.t[0] * f.L / 2 - s["cx"]) < 375 + 40 + f.L / 2 and abs(f.A[1] + f.t[1] * f.L / 2 - s["cy"]) < 300 + 40 + f.L / 2
                  for f in faces)
        if hit:
            want.append(s)
    if args.sheets:
        sel = set(args.sheets.split(","))
        proj = [s for s in want if s["sheet"] in sel]
    else:
        proj = want
    R3.log(f"走廊图幅 {[s['sheet'] for s in want]}（投影指纹 {fp}）")
    if not args.finalize_only:
        # --zip-dir 可以给几个目录（逗号分隔），按顺序找
        zdirs = [pathlib.Path(z) for z in args.zip_dir.split(",")] if args.zip_dir else []
        for s in proj:
            sd = hi_sheet_dir(cache, s, fp)
            if (sd / "done.json").exists():
                R3.log(f"  {s['sheet']} 已有高清缓存，跳过")
                continue
            local = None
            for zdir in zdirs:
                for nm in (f"{s['sheet']}.zip", f"{s['sheet']}_{s['revision']}.zip"):
                    if local is None and (zdir / nm).exists():
                        local = zdir / nm
            if local is None and not args.download:
                R3.log(f"  {s['sheet']} 没有 zip（--download 才下载），跳过")
                continue
            sd.mkdir(parents=True, exist_ok=True)
            (cache / "zips").mkdir(exist_ok=True)
            path = local or R3.fetch_zip(s, cache / "zips", R3.log)
            project_sheet(path, sd, s, fx, faces, zones, origin)
            if local is None:
                path.unlink()
                time.sleep(R3.PAUSE_S)
        if args.project_only:
            return
    # ---- 打包
    hi_dirs: dict[str, pathlib.Path] = {}
    canopy_tris: dict = {}
    sheets_used = []
    for s in sorted(want, key=lambda s: s["sheet"]):
        sd = hi_sheet_dir(cache, s, fp)
        if (sd / "done.json").exists():
            done = json.loads((sd / "done.json").read_text(encoding="utf-8"))
            hi_dirs[s["sheet"]] = sd
            sheets_used.append({"sheet": done["sheet"], "revision": done["revision"], "sha256": done["sha256"], "bytes": done["bytes"],
                                "urlNoKey": s["urlNoKey"], "source": "zip"})
            for k, v in json.loads((sd / "canopy.json").read_text(encoding="utf-8")).items():
                canopy_tris.setdefault(k, []).extend((np.array(t), up, np.array(c)) for t, up, c in v)
    r3_keys = r3_sheets_of(pathlib.Path(args.r3_cache) if args.r3_cache else None)
    r3_dirs_all = sorted({d for v in r3_keys.values() for d in v})
    for s in sorted(want, key=lambda s: s["sheet"]):
        if s["sheet"] in hi_dirs:
            continue
        for sd in r3_dirs_all:
            if sd.name.startswith(s["sheet"] + "_"):
                done = json.loads((sd / "done.json").read_text(encoding="utf-8"))
                sheets_used.append({k: done[k] for k in ("sheet", "revision", "sha256", "bytes", "urlNoKey")} | {"source": "r3-cache"})
                break
    f2fs = {b["id"]: b["facade"]["f"][0] / 100 for b in city["buildings"] if b.get("facade", {}).get("f") and b["facade"]["f"][0] > 0}
    r3doc = json.loads(gzip.decompress((R3.RAW / R3.OUT_FILE).read_bytes()))
    exclude = {e["id"] for e in r3doc["excluded"]["scaffold"]} | set(R3.EXCLUDE_IDS)
    if args.out:
        root = pathlib.Path(args.out)
        fdir = root / R3.FACADE_DIR
        raw = root
    else:
        fdir = R3.CITY_DIR / R3.FACADE_DIR
        raw = R3.RAW
    fdir.mkdir(parents=True, exist_ok=True)
    for old in list(fdir.glob("hs*.webp")) + list(fdir.glob("hu*.webp")):
        old.unlink()
    stats: dict = {"nearZone": len(near_zone)}
    R3.log(f"打包：高清图幅 {sorted(hi_dirs)}，R3 缓存楼 {len(r3_keys)}")
    near_lm = landmark_near(plans, city)
    R3.log(f"离地标 {LANDMARK_MARGIN_M} m 内、不做高清的楼：{sorted(near_lm)}")
    result = finalize(plans, faces, hi_dirs, r3_keys, canopy_tris, f2fs, origin, fdir, stats, exclude, workers=args.workers,
                      extra_exclude={k: f"within {LANDMARK_MARGIN_M:g} m of landmark {v} (red line)" for k, v in near_lm.items()})
    # 清单里记下整条走廊（楼号 → [parts 序号, 环, 边]），包括没拿到照片的面
    pidx = {bp["id"]: [pr["index"] for pr in bp["prisms"]] for bp in plans}
    corridor = {**cst, "faces": {bid: [[pidx[bid][pi], ri, ei] for pi, ri, ei in fl] for bid, fl in sorted(cfaces.items())},
                "params": {"trackStepM": TRACK_STEP_M, "farM": CORR_FAR_M, "farDeg": CORR_FAR_DEG, "nearM": CORR_NEAR_M,
                           "nearCos": CORR_NEAR_COS, "minFaceM": MIN_FACE_M, "streetTopM": STREET_TOP_M, "hiTopM": HI_TOP_M}}
    write_outputs(result, sheets_used, stats, corridor, raw, update=not args.out)
    R3.log("完成")


if __name__ == "__main__":
    sys.exit(main())
