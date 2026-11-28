"""一次性烘焙：地政总署「可視化三維地圖（個別模型）」带照片纹理的楼宇 → 我们自己的墙面 / 屋面贴图集（R3 真实贴面）。

用法（Python 3.11+，只需 numpy 与 Pillow（带 WebP 编码，Pillow 10+ 自带）；不需要任何额外工具）：
    python central/citymap/fetch/landsd_3d_tex_bake.py --cache DIR       # 下载渲染范围内全部 16 幅、逐幅投影并缓存，再打包写产物
    python central/citymap/fetch/landsd_3d_tex_bake.py --cache DIR --project-only     # 只下载 + 投影（可随时中断、重跑续上）
    python central/citymap/fetch/landsd_3d_tex_bake.py --cache DIR --finalize-only    # 不联网：只从缓存打包（调后处理用）
    开发用：--zip-dir D（D/<图幅>.zip 存在就不下载）、--sheets A,B（只做这些幅）、--allow-missing、--out D（不碰仓库）
    python central/citymap/fetch/landsd_3d_tex_bake.py --selftest        # 纯函数自测（打包、分类、楼层检测）
--cache 必须是自己的可信目录：逐栋缓存用 pickle 存取（只读本脚本自己写的文件，不要指向别人给的目录）。
可续跑：每幅投影完立即写 DIR/<图幅>_<版本>_<投影指纹>/（每栋一个 pkl + 最后写 done.json，记 zip 的 sha256 与字节数），
已有 done.json 的幅跳过；zip 下载到 DIR/zips/<图幅>_<版本>.zip.part（HTTP Range 断点续传），这一幅缓存写完就删。
内存有界：投影时只放一幅触到的墙带 / 屋顶缓冲（写完缓存即清空），贴图按要用的 mip 级在 DCT 域缩小解码；
打包时按 Hilbert 序一栋一栋从各幅缓存合并（深度大者胜、按图幅号顺序，产物与处理顺序无关），烘焙完即释放。
本轮实际运行：全部 16 幅峰值常驻内存见 README；后台线程顺序下载（同一时刻一条连接，幅间停 3 s），主线程同时投影上一幅。
本轮实际运行环境：Python 3.13.x、numpy 2.5.3、Pillow 13.0.0（libwebp 随 Pillow 发行）。没有 pip / apt 额外安装。
网络：urllib 走 HTTPS_PROXY；CA 用 /root/.ccr/ca-bundle.crt（云会话的代理），本机没有就用系统信任链。
用到的主机：portal.csdi.gov.hk（图幅索引 FeatureServer）、download.map.gov.hk（图幅 zip）。

数据集：3D Visualisation Map (Individualised models) 可視化三維地圖（個別模型），CSDI landsd_rcd_1671676915450_88604，
每幅 1:1000 图幅一个 zip（glTF 2.0，FME 导出；HK1980 Grid 绝对坐标，Y 向上 = mPD，Z = −北；每栋楼一个 glTF + 若干 JPG / PNG）。
只用 BUILDING/<id>/ 下的楼（INFRASTRUCTURE、GENERIC、VEGETATION、WATERBODY、TERRAIN(TB) 一概不开，正射影像从不解压）。
下载口的 key 每次从 CSDI 图幅索引读（索引里的 Format_glTF 链接），不写进仓库。条款见 data-raw/landsd/TERMS.md 第 7、8 节。
一幅 0.04–2.7 GB（16 幅共约 15.5 GB）：一幅一幅来，先查磁盘余量，zip 只放在缓存目录里，这一幅的投影缓存写完立即删除；幅间停 3 s（下载口合理使用条款）。

做法（「保留我们的几何，把真模型的照片投到我们的墙和屋顶上」）：
1. 几何：读管线产物 client/public/city/central.json（含 LoD2 parts）与 terrain.bin，按客户端完全相同的规则
   （render/buildings.ts prepareBuildings、building-parts.ts prepareParts、walls.ts lowestAlongRings、data/terrain.ts reliefHeight）
   得到每栋楼的每块棱柱：环（外环逆时针、洞顺时针）、墙底、顶。每个环展开成一条「周长 × 高度」的墙带（P 沿环累计，
   行从棱柱顶往下数），转角处连续；每块棱柱的屋顶是外环外包框上的一张俯视图。敏感区里的楼（质心在区内或任一顶点在区内）一律不烘焙，
   敏感区内的真模型也不当作别的楼的贴图来源。
2. 投影（前向栅格化，按 6 px/m 累积）：真模型里接近竖直的三角形，投到朝向一致（法线夹角 < 53°）、离墙面 −5…+3 m 的我们的墙上，
   多个面相叠时取「最外面」的（从街上看见的那层）；朝上的三角形投到屋顶，取最高的（−6…+8 m）。纹理按足迹选 mip 级（盒式缩小）再双线性取样。
3. 后处理（全部确定性）：小洞（≤ 1.5 m）推拉填补；去日照：低频亮度（约 24 m 尺度）向整栋中位数部分归一（指数 0.6，倍率限 0.5–2），
   去掉大块阴影与曝光差，保留材质颜色与图案；玻璃分类（偏蓝 / 比周围暗 / 整体很暗、且不是暖色）→ 0–1 掩膜；
   层高检测（玻璃掩膜与亮度的竖向剖面自相关，2.6–5.2 m）→ 层高与楼层线相位，客户端的亮窗按真楼层排；
   脚手架 / 绿网检测（任一面离地 15 m 以上色相 85–175°、饱和度 > 0.35 的平整像素超过 NET_HI，见 netting_faces）→ 整栋不用照片，
   楼号列在清单的 excluded 里；另有人工排除表 EXCLUDE_IDS（逐张看过联系表后列入），敏感区 3 m 内的楼也不用照片。
   复审修正（R3 fix）：地政总署没贴图的面（完全中性、几乎没有起伏的平灰）当作无照片；离地 25 m 内照片里挡在墙前的树冠
   换成同一面同一行的墙色（楼层带）；玻璃掩膜开闭去噪、幕墙面里低饱和的白天倒影也算玻璃；独立窗限宽 3 m、限高 1.15 层、限面积 12 m²。
4. 打包：输出密度 4 px/m（0.25 m/px；高 > 254 m 的墙带按页高收窄），屋顶 3 px/m；墙带按 1016 px 宽切片，
   连同屋顶矩形用天际线装箱放进 1024 × 1024 的页（4 px 外延边，按 Hilbert 序逐栋放，同一栋尽量同页；
   一页覆盖的楼群外包框对角线不超过 PAGE_DIAG_M，客户端按距离挑近景页时页才「紧凑」）。
   每页一个 RGBA WebP（颜色 sRGB 有损；alpha 无损 = 0 无照片 / 135–255 连续玻璃度 / 24 + k 独立窗种子，见 alpha_code），
   另有一张远景图集（每页缩成 128 × 128，16 列网格）与 LOW 档的半分辨率版，开场后流式加载。
5. 产物：client/public/city/facades/*.webp（文件名带内容哈希前 8 位）+ data-raw/landsd/landsd-3dvm-facades.json.gz
   （每栋：几何指纹、层高 / 相位、每块棱柱的密度与各切片所在页和位置；页文件清单与 sha256；排除清单与统计）+ sources.json 条目。
   管线（src/stages/facades.ts）校验 sha256、按几何指纹把引用接到 Building.facade；几何变了的楼自动退回程序立面。
不写入任何网格原文、名称或原始贴图；仓库里只有按我们的墙面重新取样、去日照、缩小后的派生贴图。
"""

import argparse
import gzip
import hashlib
import io
import json
import math
import os
import pathlib
import posixpath
import shutil
import ssl
import struct
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
import zipfile

import numpy as np
from PIL import Image

# 解码上限（下载的 zip 是不受信任的数据）：超过的贴图不解码，按黑色（= 无照片）处理并计数，见 Model.level
Image.MAX_IMAGE_PIXELS = 16384 * 16384
TEX_SKIPPED = [0]

FETCHED = "2026-11-26"
DATASET_ID = "landsd_rcd_1671676915450_88604"
PORTAL = "https://portal.csdi.gov.hk"
INDEX_QUERY = f"{PORTAL}/server/rest/services/common/{DATASET_ID}/FeatureServer/0/query"
CA = "/root/.ccr/ca-bundle.crt"
UA = "central-citymap-fetch/1.0"
PAUSE_S = 3.0
MIN_FREE_BYTES = 3_000_000_000

ROOT = pathlib.Path(__file__).resolve().parent.parent
RAW = ROOT / "data-raw" / "landsd"
CITY_DIR = ROOT.parent / "client" / "public" / "city"
OUT_FILE = "landsd-3dvm-facades.json.gz"
FACADE_DIR = "facades"
TERMS = "CSDI Portal Terms and Conditions of Use; 3D Visualisation Map Terms and Conditions of Use (see TERMS.md)"
# 与 TERMS.md 第 8 节、src/stages/terrain-refs.ts 的 REF_LANDSD_3DVM_TEX 逐字一致
ATTRIBUTION = [
    "Contains 3D building data and photo textures from the Lands Department, HKSAR Government (3D Visualisation Map, "
    "Individualised models), obtained from the 3D Visualisation Map website (3d.map.gov.hk) through the Common Spatial Data "
    "Infrastructure (CSDI) Portal (portal.csdi.gov.hk). Intellectual property rights in the data are owned by the Government "
    "of the Hong Kong Special Administrative Region. The photo textures have been processed (projected onto simplified "
    "building walls and roofs, resampled, re-lit for night and reduced) for this game; the Government is not responsible "
    "for, and does not endorse, this game.",
    "部分資料來源：香港特別行政區政府地政總署「可視化三維地圖（個別模型）」的三維建築及照片紋理，經可視化三維地圖網站"
    "（3d.map.gov.hk）及空間數據共享平台（CSDI，portal.csdi.gov.hk）取得；資料的知識產權屬香港特別行政區政府所有。"
    "照片紋理已為本遊戲處理（投影到簡化的建築牆面及屋頂、重新取樣、按夜景重新打光及縮小），政府不對本遊戲負責，亦不代表政府認可。",
]
DATASET_NOTE = "LandsD 3D Visualisation Map (Individualised models)"

# ---------------------------------------------------------------- 参数
ACC_PX_M = 6.0        # 投影累积密度（px/m）
WALL_PX_M = 4.0       # 输出墙面密度（px/m，0.25 m/px）
ROOF_PX_M = 3.0       # 输出屋面密度
PAGE = 1024           # 页边长（px）
PAD = 4               # 每个矩形四周外延边
TILE = PAGE - 2 * PAD  # 墙带切片宽 / 最大内容高（1016 px）
FAR_CELL = 128        # 远景图集里每页缩成的边长
FAR_COLS = 16
DENSITY_Q = 16        # 密度量化：px/m × 16 取整（JSON 里精确，客户端 = q / 16）
TOL_OUT = 3.0         # 真模型面在我们墙外侧最多多远（m）
TOL_IN = 5.0          # 在墙内侧最多多远
WALL_COS = 0.6        # 法线夹角余弦下限
WALL_NZ = 0.6         # |法线 z| < 此值的三角形算「墙」
ROOF_NZ = 0.45        # 法线 z > 此值算「屋面」
ROOF_BELOW = 6.0
ROOF_ABOVE = 8.0
GRID_M = 16.0         # 边 / 屋顶的空间哈希格
FILL_M = 1.5          # 小洞填补半径
MIN_VALID = 0.04      # 屋顶有效像素占比低于此值就不出（客户端退回程序屋顶）
SINK_DM = 5           # 与 render/buildings.ts 一致
MIN_HEIGHT_DM = 25
RELIEF_STEP = 2       # 与 data/terrain.ts 一致
APRON_DM = 8000
WEBP_Q = 82
FAR_Q = 80
GREEN_MAX = 1.0       # 绿网怀疑度（netting_faces，已按下面两个比例归一）超过此值：疑似绿网 / 脚手架，整栋不用照片
NET_HI = 0.012        # 任一面离地 15 m 以上平整的饱和绿 / 青绿像素占比上限（高处一条网带就算）
NET_LO = 0.025        # 任一面离地 4 m 以上的占比上限
KEEP_OPEN = 6         # 装箱时同时打开的页数（越多越省页，但同一栋楼的切片可能分散到更多页）
PAGE_DIAG_M = 250.0   # 一页覆盖的楼群外包框对角线上限（m）：页在空间上紧凑，近景池按距离挑页才有效（复审：原来有的页横跨 1 km 以上）
ZONE_MARGIN_M = 3.0   # 敏感区外这么近的楼也不用照片（复审：政府建筑群边上的门楼）
LEAF_LIFT_M = 60.0    # 这个高度以内照片里的树冠换成墙色（天井里的树也会被投到内墙上）
FLAT_SIGMA = 1.5      # 地政总署没贴图的面：完全中性（|R−G|、|G−B| ≤ 2）且 7×7 内亮度标准差 < 此值（0–255）
GLASS_FACE = 0.6      # 一个面里玻璃占比超过此值按幕墙处理：低饱和、不偏暖的「实墙」像素多半是白天的倒影，也算玻璃
KEEP_EXCLUDED = "整合时自动检测排除（绿网度 > 1），复审修正后统计略变、没有逐栋复查，保守照旧排除"
# 人工排除（逐张看过烘焙结果后列入：照片里有明显的脚手架 / 工地围板 / 绿网）：楼号 → 理由
EXCLUDE_IDS: dict[str, str] = {
    "6e41613602": "绿网带（约六成楼高处几层，自动检测漏了）",
    "3b2efea9ae": "疑似绿网带（缩略图里可见，保守排除）",
    # R3 整合复查（suspect 联系表 + 横向网带扫描，见 README「整合」）：
    "bf1b304292": "约半楼高处一条横贯两面的绿色网带（吊船 / 安全网）",
    "704c77dba7": "一面整面细格架（疑似竹棚 + 网），保守排除",
    "fab21207e2": "青绿色网状覆盖、斜向条纹，疑似施工网，保守排除",
    "7c077f39cb": "整面印着楼宇效果图的围板 / 广告画（类似工地围板），保守排除",
    # R3 复审修正：
    "ed649f5fdf": "裙楼一面约 8 × 10 m 的半透明深绿网 + 脚手架管与斜撑（自动检测漏了：网暗、饱和度 0.25–0.35）",
    "3c9096bc0c": "低处一块鲜绿色布 / 帆布（疑似施工遮盖），保守排除",
    "0cdb7ba50f": "整面均匀的深青绿板（12–15 m 矮楼，疑似施工围板），保守排除",
    "ee76e97ff9": "整面均匀的深青绿板（同上，相邻），保守排除",
    "4cf2d36d39": "约六成墙面均匀深青绿板（同上，相邻），保守排除",
    # 整合时被自动绿网检测排除、复审修正后（平灰面不再计入有效像素）统计略变、刚好落到阈值下的楼：没有逐栋复查，照旧排除
    "06e38fa18f": KEEP_EXCLUDED,
    "29141fe634": KEEP_EXCLUDED,
    "2e7079881b": KEEP_EXCLUDED,
    "3e616b3a0d": KEEP_EXCLUDED,
    "4838904a52": KEEP_EXCLUDED,
    "4aafcab46a": KEEP_EXCLUDED,
    "5a7d88d03c": KEEP_EXCLUDED,
    "60c27d20a4": KEEP_EXCLUDED,
    "757b76d860": KEEP_EXCLUDED,
    "7cc2b3201e": KEEP_EXCLUDED,
    "817d10e2dc": KEEP_EXCLUDED,
    "957c298893": KEEP_EXCLUDED,
    "acf42d4a1e": KEEP_EXCLUDED,
    "b2bb247c88": KEEP_EXCLUDED,
    "c59fcba490": KEEP_EXCLUDED,
    "c8eba4b8a2": KEEP_EXCLUDED,
    "ce816bdc0e": KEEP_EXCLUDED,
    "d304731fb0": KEEP_EXCLUDED,
    "dc783811c0": KEEP_EXCLUDED,
    "f35d08984a": KEEP_EXCLUDED,
    "f4e6781ee4": KEEP_EXCLUDED,
    "f51b96f88c": KEEP_EXCLUDED,
    "feb1413e29": KEEP_EXCLUDED,
}
# 自动绿网检测的误报（逐张按原分辨率看过原始投影颜色：住宅塔楼的青绿色露台玻璃、楼脚的棕榈树，没有网、没有竹棚）：照样用照片
ALLOW_IDS: dict[str, str] = {
    "395e1659f6": "122 m 住宅塔楼，青绿色露台玻璃（复审：半山 ml-S1 三栋相邻塔楼之一）",
    "b2c92d60c2": "住宅塔楼，青绿色露台玻璃（同上）",
    "7245a09e9c": "住宅塔楼，青绿色露台玻璃（同上）",
    "91c4552bdc": "154 m 住宅塔楼，深色玻璃与灰墙",
}

CT = {5120: np.int8, 5121: np.uint8, 5122: np.int16, 5123: np.uint16, 5125: np.uint32, 5126: np.float32}
NC = {"SCALAR": 1, "VEC2": 2, "VEC3": 3, "VEC4": 4, "MAT4": 16}


def ssl_context() -> ssl.SSLContext:
    return ssl.create_default_context(cafile=CA) if os.path.exists(CA) else ssl.create_default_context()


def get(url: str, params: dict | None = None) -> bytes:
    if params:
        url = url + "?" + urllib.parse.urlencode(params)
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, context=ssl_context(), timeout=600) as r:
        return r.read()


def download(url: str, dest: pathlib.Path) -> tuple[str, int]:
    h = hashlib.sha256()
    n = 0
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, context=ssl_context(), timeout=1800) as r, open(dest, "wb") as f:
        while True:
            chunk = r.read(1 << 20)
            if not chunk:
                break
            f.write(chunk)
            h.update(chunk)
            n += len(chunk)
    return h.hexdigest(), n


# ---------------------------------------------------------------- 城市几何（与客户端逐条对应）

def clean_ring(pts: list[int]) -> list[int]:
    """geom/ring.ts cleanRing：去相邻重复点与首尾重复点。"""
    out: list[int] = []
    for i in range(0, len(pts) - 1, 2):
        x, y = pts[i], pts[i + 1]
        if len(out) >= 2 and out[-2] == x and out[-1] == y:
            continue
        out += [x, y]
    while len(out) >= 4 and out[0] == out[-2] and out[1] == out[-1]:
        del out[-2:]
    return out


def signed_area(pts: list[float]) -> float:
    n = len(pts) // 2
    a = 0.0
    j = n - 1
    for i in range(n):
        a += pts[j * 2] * pts[i * 2 + 1] - pts[i * 2] * pts[j * 2 + 1]
        j = i
    return a / 2


def reverse_ring(pts: list[int]) -> list[int]:
    n = len(pts) // 2
    out: list[int] = []
    for i in range(n - 1, -1, -1):
        out += [pts[i * 2], pts[i * 2 + 1]]
    return out


def normalize_ring(outer: list[int], holes: list[list[int]] | None) -> tuple[list[int], list[list[int]]] | None:
    """geom/ring.ts normalizeRing：外环逆时针、洞顺时针，不足 3 点的环丢弃。"""
    o = clean_ring(outer)
    if len(o) < 6:
        return None
    if signed_area(o) < 0:
        o = reverse_ring(o)
    hs = []
    for h in holes or []:
        hh = clean_ring(h)
        if len(hh) < 6:
            continue
        if signed_area(hh) > 0:
            hh = reverse_ring(hh)
        hs.append(hh)
    return o, hs


def ring_centroid(pts: list[int]) -> tuple[float, float]:
    """geom/ring.ts ringCentroid（面积加权；退化时顶点平均）。"""
    n = len(pts) // 2
    a = cx = cy = 0.0
    j = n - 1
    for i in range(n):
        x0, y0, x1, y1 = pts[j * 2], pts[j * 2 + 1], pts[i * 2], pts[i * 2 + 1]
        f = x0 * y1 - x1 * y0
        a += f
        cx += (x0 + x1) * f
        cy += (y0 + y1) * f
        j = i
    if abs(a) < 1e-9:
        return (sum(pts[0::2]) / n, sum(pts[1::2]) / n) if n else (0.0, 0.0)
    return cx / (3 * a), cy / (3 * a)


def point_in_flat(pts: list[int], x: float, y: float) -> bool:
    n = len(pts) // 2
    inside = False
    j = n - 1
    for i in range(n):
        xi, yi, xj, yj = pts[i * 2], pts[i * 2 + 1], pts[j * 2], pts[j * 2 + 1]
        if (yi > y) != (yj > y) and x < (xj - xi) * (y - yi) / (yj - yi) + xi:
            inside = not inside
        j = i
    return inside


def point_in_ring(ring: dict, x: float, y: float) -> bool:
    if not point_in_flat(ring["outer"], x, y):
        return False
    return not any(point_in_flat(h, x, y) for h in ring.get("holes", []))


class Relief:
    """data/terrain.ts：reliefGrid(step 2) + reliefHeight（三角形插值、网格外裙坡衰减）。高度 dm。"""

    def __init__(self, data: bytes):
        magic, ver, _r, x0, y0, cell, nx, ny, _r2 = struct.unpack_from("<4sHHiiHHHH", data, 0)
        if magic != b"CTER" or ver != 1:
            raise SystemExit("terrain.bin 格式不符")
        h = np.frombuffer(data, "<i2", nx * ny, 24).reshape(ny, nx)
        rnx = math.ceil((nx - 1) / RELIEF_STEP) + 1
        rny = math.ceil((ny - 1) / RELIEF_STEP) + 1
        sj = np.minimum(np.arange(rny) * RELIEF_STEP, ny - 1)
        si = np.minimum(np.arange(rnx) * RELIEF_STEP, nx - 1)
        self.h = h[sj][:, si].astype(np.float64)
        self.x0, self.y0, self.cell, self.nx, self.ny = x0, y0, cell * RELIEF_STEP, rnx, rny
        self.x1 = x0 + (rnx - 1) * self.cell
        self.y1 = y0 + (rny - 1) * self.cell

    def _inside(self, x: float, y: float) -> float:
        fx = (x - self.x0) / self.cell
        fy = (y - self.y0) / self.cell
        i = min(math.floor(fx), self.nx - 2)
        j = min(math.floor(fy), self.ny - 2)
        u, v = fx - i, fy - j
        h = self.h
        h00, h11 = h[j, i], h[j + 1, i + 1]
        if u >= v:
            return h00 + u * (h[j, i + 1] - h00) + v * (h11 - h[j, i + 1])
        return h00 + v * (h[j + 1, i] - h00) + u * (h11 - h[j + 1, i])

    def __call__(self, x: float, y: float) -> float:
        cx = min(max(x, self.x0), self.x1)
        cy = min(max(y, self.y0), self.y1)
        if cx == x and cy == y:
            return self._inside(x, y)
        t = min(math.hypot(x - cx, y - cy) / APRON_DM, 1.0)
        return self._inside(cx, cy) * (1 - t * t * (3 - 2 * t))


def lowest_along(rings: list[list[int]], ground) -> float:
    """walls.ts lowestAlongRings：每条边每 0.5 m 采样。"""
    low = math.inf
    for r in rings:
        n = len(r) // 2
        for i in range(n):
            j = (i + 1) % n
            x0, y0 = r[i * 2], r[i * 2 + 1]
            dx, dy = r[j * 2] - x0, r[j * 2 + 1] - y0
            steps = max(1, math.ceil(math.hypot(dx, dy) / 5))
            for k in range(steps):
                low = min(low, ground(x0 + dx * k / steps, y0 + dy * k / steps))
    return low


def geometry_key(b: dict) -> str:
    """几何指纹：轮廓、楼底、楼高、分层体块（整数逐个拼成文本再 sha256，取前 12 位）。与 src/stages/facades.ts geometryKey 一致。"""
    parts = [b["id"], "f", *map(str, b["footprint"]["outer"])]
    for h in b["footprint"].get("holes", []):
        parts += ["h", *map(str, h)]
    parts += ["b", str(b["base"]), "t", str(b["height"])]
    for p in b.get("parts", []):
        parts += ["p", str(p["top"])]
        if "ring" in p:
            parts += ["r", *map(str, p["ring"])]
        for h in p.get("holes", []):
            parts += ["h", *map(str, h)]
    return hashlib.sha256(",".join(parts).encode()).hexdigest()[:12]


def plan_city(city: dict, relief: Relief) -> tuple[list[dict], list[str]]:
    """每栋（非敏感区）楼 → {id, key, cx, cy, prisms:[{index, rings(dm), bottom, top(dm)}]}；返回 (楼列表, 敏感区排除的楼号)。"""
    zones = city["zones"]["sensitive"]
    out = []
    sens = []
    for b in city["buildings"]:
        nr = normalize_ring(b["footprint"]["outer"], b["footprint"].get("holes"))
        if not nr:
            continue
        outer, holes = nr
        cx, cy = ring_centroid(outer)
        if any(point_in_ring(z["area"], cx, cy) for z in zones) or any(
            point_in_ring(z["area"], outer[i], outer[i + 1]) for z in zones for i in range(0, len(outer), 2)
        ):
            sens.append(b["id"])
            continue
        rings = [outer, *holes]
        base = b["base"]
        low = lowest_along(rings, relief)
        bottom = min(base, low) - SINK_DM
        top = base + max(b["height"], MIN_HEIGHT_DM)
        prisms = None
        parts = b.get("parts")
        if parts and len(parts) >= 2:
            tops = sorted({max(p["top"], base + MIN_HEIGHT_DM) for p in parts})
            pr = []
            for index, pt in enumerate(parts):
                if index == 0:
                    ring = (outer, holes)
                else:
                    ring = normalize_ring(pt["ring"], pt.get("holes")) if "ring" in pt else None
                if not ring:
                    continue
                t = max(pt["top"], base + MIN_HEIGHT_DM)
                below = [x for x in tops if x < t]
                b0 = bottom if index == 0 else (below[-1] if below else bottom)
                if t <= b0:
                    continue
                pr.append({"index": index, "rings": [ring[0], *ring[1]], "bottom": b0, "top": t})
            if len(pr) >= 2 and pr[0]["index"] == 0:
                prisms = pr
        if prisms is None:
            prisms = [{"index": 0, "rings": rings, "bottom": bottom, "top": top}]
        out.append({"id": b["id"], "key": geometry_key(b), "cx": cx, "cy": cy, "base": base, "prisms": prisms,
                    "zones": zones})
    return out, sens


# ---------------------------------------------------------------- 累积缓冲（墙带 / 屋顶）

class Strip:
    """一个环的墙带：列 = P（沿环米数）× ACC_PX_M，行 = (top − z) × ACC_PX_M。颜色 uint8、深度 float32（−inf = 空）。"""
    __slots__ = ("L", "H", "W", "rows", "col", "dep", "edges", "spans")

    def __init__(self, L: float, hm: float):
        self.L = L
        self.H = hm
        self.W = int(math.ceil(L * ACC_PX_M)) + 1
        self.rows = int(math.ceil(hm * ACC_PX_M)) + 1
        self.col = None
        self.dep = None
        self.edges = []
        self.spans: list[tuple[float, float]] = []  # 每个面（环的一条边）：(起点 P, 长度)，米

    def alloc(self) -> None:
        if self.col is None:
            self.col = np.zeros((self.rows, self.W, 3), np.uint8)
            self.dep = np.full((self.rows, self.W), -np.inf, np.float32)


class Roof:
    __slots__ = ("x0", "y0", "x1", "y1", "top", "W", "rows", "col", "dep")

    def __init__(self, x0: float, y0: float, x1: float, y1: float, top: float):
        self.x0, self.y0, self.x1, self.y1, self.top = x0, y0, x1, y1, top
        self.W = int(math.ceil((x1 - x0) * ACC_PX_M)) + 1
        self.rows = int(math.ceil((y1 - y0) * ACC_PX_M)) + 1
        self.col = None
        self.dep = None

    def alloc(self) -> None:
        if self.col is None:
            self.col = np.zeros((self.rows, self.W, 3), np.uint8)
            self.dep = np.full((self.rows, self.W), -np.inf, np.float32)


class Targets:
    """全部墙带、屋顶与它们的空间索引（坐标：HK1980 Grid 米 = 本地 dm / 10 + 原点，即 project.gridToLocal 的反运算）。"""

    def __init__(self, plans: list[dict], origin: tuple[float, float]):
        e0, n0 = origin
        self.edges = []      # (strip, A(2), dir(2), n(2), p0, len, zbot, ztop)
        self.roofs = []      # Roof
        self.grid_e: dict[tuple[int, int], list[int]] = {}
        self.grid_r: dict[tuple[int, int], list[int]] = {}
        for bp in plans:
            for pr in bp["prisms"]:
                pr["strips"] = []
                top = pr["top"] / 10
                bot = pr["bottom"] / 10
                for ring in pr["rings"]:
                    pts = [(e0 + ring[i] / 10, n0 + ring[i + 1] / 10) for i in range(0, len(ring), 2)]
                    # 周长与边起点 P：与客户端 extrude 一样按 dm 的 hypot 累计再 × 0.1
                    n = len(pts)
                    lens = []
                    for i in range(n):
                        j = (i + 1) % n
                        lens.append(math.hypot(ring[j * 2] - ring[i * 2], ring[j * 2 + 1] - ring[i * 2 + 1]) * 0.1)
                    st = Strip(sum(lens), top - bot)
                    p = 0.0
                    for i in range(n):
                        j = (i + 1) % n
                        L = lens[i]
                        if L < 1e-6:
                            continue
                        ax, ay = pts[i]
                        bx, by = pts[j]
                        dx, dy = (bx - ax) / L, (by - ay) / L
                        k = len(self.edges)
                        self.edges.append((st, np.array([ax, ay]), np.array([dx, dy]), np.array([dy, -dx]), p, L, bot, top))
                        st.edges.append(k)
                        st.spans.append((p, L))
                        lo_x = min(ax, bx) - TOL_IN - 1
                        hi_x = max(ax, bx) + TOL_IN + 1
                        lo_y = min(ay, by) - TOL_IN - 1
                        hi_y = max(ay, by) + TOL_IN + 1
                        for gi in range(int(lo_x // GRID_M), int(hi_x // GRID_M) + 1):
                            for gj in range(int(lo_y // GRID_M), int(hi_y // GRID_M) + 1):
                                self.grid_e.setdefault((gi, gj), []).append(k)
                        p += L
                    pr["strips"].append(st)
                o = pr["rings"][0]
                xs = [e0 + o[i] / 10 for i in range(0, len(o), 2)]
                ys = [n0 + o[i + 1] / 10 for i in range(0, len(o), 2)]
                rf = Roof(min(xs), min(ys), max(xs), max(ys), top)
                pr["roof"] = rf
                k = len(self.roofs)
                self.roofs.append(rf)
                for gi in range(int(rf.x0 // GRID_M), int(rf.x1 // GRID_M) + 1):
                    for gj in range(int(rf.y0 // GRID_M), int(rf.y1 // GRID_M) + 1):
                        self.grid_r.setdefault((gi, gj), []).append(k)
        self.edge_A = np.array([e[1] for e in self.edges])
        self.edge_d = np.array([e[2] for e in self.edges])
        self.edge_n = np.array([e[3] for e in self.edges])
        self.edge_L = np.array([e[5] for e in self.edges])
        self.edge_zb = np.array([e[6] for e in self.edges])
        self.edge_zt = np.array([e[7] for e in self.edges])

    def edges_near(self, x0: float, y0: float, x1: float, y1: float) -> list[int]:
        s: set[int] = set()
        for gi in range(int(x0 // GRID_M), int(x1 // GRID_M) + 1):
            for gj in range(int(y0 // GRID_M), int(y1 // GRID_M) + 1):
                s.update(self.grid_e.get((gi, gj), ()))
        return sorted(s)

    def roofs_near(self, x0: float, y0: float, x1: float, y1: float) -> list[int]:
        s: set[int] = set()
        for gi in range(int(x0 // GRID_M), int(x1 // GRID_M) + 1):
            for gj in range(int(y0 // GRID_M), int(y1 // GRID_M) + 1):
                s.update(self.grid_r.get((gi, gj), ()))
        return sorted(s)


# ---------------------------------------------------------------- glTF 读取

def accessor(doc: dict, bufs: list[bytes], k: int) -> np.ndarray:
    a = doc["accessors"][k]
    bv = doc["bufferViews"][a["bufferView"]]
    ct = CT[a["componentType"]]
    dt = np.dtype(ct).newbyteorder("<")
    n = NC[a["type"]]
    off = bv.get("byteOffset", 0) + a.get("byteOffset", 0)
    stride = bv.get("byteStride", 0) or dt.itemsize * n
    arr = np.ndarray((a["count"], n), dt, bufs[bv["buffer"]], off, (stride, dt.itemsize))
    out = np.array(arr, dtype=np.float64)
    if a.get("normalized") and ct is not np.float32:
        out /= float(np.iinfo(ct).max)
    return out


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


def safe_member(base: str, uri: str, exts: tuple[str, ...]) -> str:
    """只许同目录下的普通文件名（不解 data: URI、不跟相对路径）。"""
    u = urllib.parse.unquote(uri)
    if "/" in u or "\\" in u or u.startswith(".") or ":" in u or not u.lower().endswith(exts):
        raise ValueError(f"意外的 uri {uri!r}")
    return posixpath.join(base, u)


class Model:
    """一栋带纹理的楼：tris (n,3,3) E/N/mPD，uv (n,3,2)，nrm (n,3) 由顶点法线给的朝向（单位），img (n,) 图片序号；图片按需解码。"""

    def __init__(self, zf: zipfile.ZipFile, name: str):
        self.zf = zf
        doc = json.loads(zf.read(name))
        if doc.get("extensionsRequired"):
            raise ValueError("不支持的 glTF 扩展")
        self.base = posixpath.dirname(name)
        bufs = [zf.read(safe_member(self.base, b["uri"], (".bin",))) for b in doc.get("buffers", [])]
        self.images = [safe_member(self.base, im["uri"], (".jpg", ".jpeg", ".png")) for im in doc.get("images", [])]
        tex_img = [t.get("source") for t in doc.get("textures", [])]
        nodes = doc.get("nodes", [])
        stack = [(i, np.eye(4)) for i in doc["scenes"][doc.get("scene", 0)]["nodes"]]
        T, U, N, I = [], [], [], []
        while stack:
            ni, parent = stack.pop()
            node = nodes[ni]
            m = parent @ node_matrix(node)
            if "mesh" in node:
                for p in doc["meshes"][node["mesh"]]["primitives"]:
                    if p.get("mode", 4) != 4 or "TEXCOORD_0" not in p["attributes"]:
                        continue
                    mat = doc["materials"][p["material"]] if "material" in p else {}
                    if mat.get("alphaMode") == "BLEND":
                        continue  # 半透明贴片（栏杆、玻璃顶棚）不要
                    bct = mat.get("pbrMetallicRoughness", {}).get("baseColorTexture")
                    if not bct or bct.get("texCoord", 0) != 0:
                        continue
                    img = tex_img[bct["index"]]
                    if img is None:
                        continue
                    pos = accessor(doc, bufs, p["attributes"]["POSITION"])
                    pos = (np.c_[pos, np.ones(len(pos))] @ m.T)[:, :3]
                    uv = accessor(doc, bufs, p["attributes"]["TEXCOORD_0"])[:, :2]
                    nrm = accessor(doc, bufs, p["attributes"]["NORMAL"]) @ np.linalg.inv(m[:3, :3]) if "NORMAL" in p["attributes"] else None
                    idx = accessor(doc, bufs, p["indices"]).ravel().astype(np.int64) if "indices" in p else np.arange(len(pos))
                    t = idx.reshape(-1, 3)
                    T.append(pos[t])
                    U.append(uv[t])
                    N.append(nrm[t].sum(1) if nrm is not None else np.zeros((len(t), 3)))
                    I.append(np.full(len(t), img, np.int32))
            stack.extend((c, m) for c in node.get("children", []))
        if T:
            t = np.concatenate(T)
            # glTF Y 向上、Z = −北 → (E, N, mPD)
            self.tris = np.stack([t[:, :, 0], -t[:, :, 2], t[:, :, 1]], axis=2)
            nn = np.concatenate(N)
            self.vnrm = np.stack([nn[:, 0], -nn[:, 2], nn[:, 1]], axis=1)
            self.uv = np.concatenate(U)
            self.img = np.concatenate(I)
        else:
            self.tris = np.zeros((0, 3, 3))
            self.vnrm = np.zeros((0, 3))
            self.uv = np.zeros((0, 3, 2))
            self.img = np.zeros(0, np.int32)
        self._pyr: dict[tuple[int, int], np.ndarray] = {}
        self._size: dict[int, tuple[int, int]] = {}

    def size(self, k: int) -> tuple[int, int]:
        """图片尺寸 (w, h)：只读文件头，不解码。"""
        sz = self._size.get(k)
        if sz is None:
            sz = Image.open(io.BytesIO(self.zf.read(self.images[k]))).size
            self._size[k] = sz
        return sz

    def level(self, k: int, L: int) -> np.ndarray:
        """第 L 级 mip（边长 1/2^L）。JPEG 直接在 DCT 域按 1/2、1/4、1/8 解码（快、省内存：只解要用的那一级，
        4096² 的原图不必整张展开），再不够小就盒式缩小。同一模型里按 (图, 级) 缓存，模型处理完一起释放。"""
        key = (k, L)
        im = self._pyr.get(key)
        if im is not None:
            return im
        src = Image.open(io.BytesIO(self.zf.read(self.images[k])))
        w, h = src.size
        if w * h > Image.MAX_IMAGE_PIXELS:
            # 超大贴图（不受信任的输入）不解码：按黑色处理（strip_valid 当作无照片），计数
            TEX_SKIPPED[0] += 1
            im = np.zeros((1, 1, 3), np.uint8)
            self._pyr[key] = im
            return im
        dl = min(L, 3)
        if dl and src.format == "JPEG":
            src.draft("RGB", (max(1, w >> dl), max(1, h >> dl)))
        src = src.convert("RGB")
        while src.size[0] > max(1, w >> L) * 1.5 and src.size[0] >= 2 and src.size[1] >= 2:
            src = src.reduce(2)
        im = np.asarray(src)
        self._pyr[key] = im
        return im


def bilinear(img: np.ndarray, u: np.ndarray, v: np.ndarray) -> np.ndarray:
    """双线性取样，REPEAT 环绕；u、v 为 glTF 纹理坐标（左上为原点）。返回 float32 (n, 3)。"""
    h, w = img.shape[:2]
    x = u * w - 0.5
    y = v * h - 0.5
    x0 = np.floor(x)
    y0 = np.floor(y)
    fx = (x - x0)[:, None].astype(np.float32)
    fy = (y - y0)[:, None].astype(np.float32)
    x0 = x0.astype(np.int64) % w
    y0 = y0.astype(np.int64) % h
    x1 = (x0 + 1) % w
    y1 = (y0 + 1) % h
    a = img[y0, x0].astype(np.float32)
    b = img[y0, x1].astype(np.float32)
    c = img[y1, x0].astype(np.float32)
    d = img[y1, x1].astype(np.float32)
    return (a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + d * fx) * fy


def raster(col: np.ndarray, dep: np.ndarray, P: np.ndarray, depth: np.ndarray, uv: np.ndarray, model: Model, img: int,
           texels: float, c_lo: float, c_hi: float, d_lo: float, d_hi: float) -> int:
    """把一个三角形（目标像素坐标 P (3,2) = 列、行；每顶点深度、纹理坐标）写进 col / dep：深度大者胜，深度须在 [d_lo, d_hi]。
    texels：每个目标像素覆盖的源纹素（边长），决定取哪级 mip。返回写入的像素数。"""
    rows, W = dep.shape
    c0 = max(int(math.floor(P[:, 0].min())), int(math.floor(c_lo)), 0)
    c1 = min(int(math.ceil(P[:, 0].max())), int(math.ceil(c_hi)), W)
    r0 = max(int(math.floor(P[:, 1].min())), 0)
    r1 = min(int(math.ceil(P[:, 1].max())), rows)
    if c1 <= c0 or r1 <= r0:
        return 0
    (ax, ay), (bx, by), (cx, cy) = P
    det = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy)
    if abs(det) < 1e-9:
        return 0
    px = np.arange(c0, c1, dtype=np.float64)[None, :] + 0.5
    py = np.arange(r0, r1, dtype=np.float64)[:, None] + 0.5
    l1 = ((by - cy) * (px - cx) + (cx - bx) * (py - cy)) / det
    l2 = ((cy - ay) * (px - cx) + (ax - cx) * (py - cy)) / det
    l3 = 1.0 - l1 - l2
    eps = 1e-6
    inside = (l1 >= -eps) & (l2 >= -eps) & (l3 >= -eps)
    if not inside.any():
        return 0
    d = l1 * depth[0] + l2 * depth[1] + l3 * depth[2]
    cur = dep[r0:r1, c0:c1]
    upd = inside & (d > cur) & (d >= d_lo) & (d <= d_hi)
    if not upd.any():
        return 0
    L = 0 if texels <= 1.5 else min(int(math.floor(math.log2(texels / 1.5))) + 1, 8)
    im = model.level(img, L)
    u = (l1 * uv[0, 0] + l2 * uv[1, 0] + l3 * uv[2, 0])[upd]
    v = (l1 * uv[0, 1] + l2 * uv[1, 1] + l3 * uv[2, 1])[upd]
    c = bilinear(im, u, v)
    sub = col[r0:r1, c0:c1]
    sub[upd] = np.clip(c + 0.5, 0, 255).astype(np.uint8)
    cur[upd] = d[upd].astype(np.float32)
    return int(upd.sum())


def splat_model(model: Model, tg: Targets, stats: dict) -> None:
    """真模型的三角形投到我们的墙带与屋顶上。"""
    T = model.tris
    if len(T) == 0:
        return
    e1 = T[:, 1] - T[:, 0]
    e2 = T[:, 2] - T[:, 0]
    n = np.cross(e1, e2)
    area2 = np.linalg.norm(n, axis=1)
    ok = area2 > 1e-8
    n[ok] /= area2[ok, None]
    # 朝向：顶点法线给的方向（绕向不可靠时以它为准）；没有顶点法线时用几何法线
    vn = model.vnrm
    flip = (np.einsum("ij,ij->i", n, vn) < 0) & (np.linalg.norm(vn, axis=1) > 1e-6)
    n[flip] *= -1
    uv = model.uv
    for t in np.nonzero(ok)[0]:
        tri = T[t]
        nz = n[t, 2]
        img = int(model.img[t])
        # 源纹理上的三角形面积（第 0 级像素²）
        w, h = model.size(img)
        U = uv[t] * np.array([w, h])
        ua = abs((U[1, 0] - U[0, 0]) * (U[2, 1] - U[0, 1]) - (U[1, 1] - U[0, 1]) * (U[2, 0] - U[0, 0])) / 2
        wa = area2[t] / 2
        if ua < 1e-6:
            continue
        x0, y0 = tri[:, 0].min(), tri[:, 1].min()
        x1, y1 = tri[:, 0].max(), tri[:, 1].max()
        if abs(nz) < WALL_NZ:
            nh = n[t, :2]
            nhl = math.hypot(nh[0], nh[1])
            if nhl < 1e-6:
                continue
            nh = nh / nhl
            cand = tg.edges_near(x0, y0, x1, y1)
            if not cand:
                continue
            ci = np.array(cand)
            dots = tg.edge_n[ci] @ nh * nhl
            for k in ci[dots >= WALL_COS]:
                st, A, dvec, nvec, p0, L, zb, zt = tg.edges[k]
                rel = tri[:, :2] - A
                s = rel @ dvec
                o = rel @ nvec
                if o.max() < -TOL_IN or o.min() > TOL_OUT or s.max() < -0.5 or s.min() > L + 0.5:
                    continue
                if tri[:, 2].max() < zb or tri[:, 2].min() > zt:
                    continue
                st.alloc()
                P = np.stack([(p0 + s) * ACC_PX_M, (zt - tri[:, 2]) * ACC_PX_M], axis=1)
                texels = math.sqrt(ua / max(wa * ACC_PX_M * ACC_PX_M, 1e-9))
                stats["wallPx"] += raster(st.col, st.dep, P, o, uv[t], model, img, texels,
                                          (p0 - 0.25) * ACC_PX_M, (p0 + L + 0.25) * ACC_PX_M, -TOL_IN, TOL_OUT)
        elif nz > ROOF_NZ:
            for k in tg.roofs_near(x0, y0, x1, y1):
                rf = tg.roofs[k]
                if x1 < rf.x0 or x0 > rf.x1 or y1 < rf.y0 or y0 > rf.y1:
                    continue
                if tri[:, 2].max() < rf.top - ROOF_BELOW or tri[:, 2].min() > rf.top + ROOF_ABOVE:
                    continue
                rf.alloc()
                P = np.stack([(tri[:, 0] - rf.x0) * ACC_PX_M, (rf.y1 - tri[:, 1]) * ACC_PX_M], axis=1)
                texels = math.sqrt(ua / max(wa * nz * ACC_PX_M * ACC_PX_M, 1e-9))
                stats["roofPx"] += raster(rf.col, rf.dep, P, tri[:, 2], uv[t], model, img, texels, 0, rf.W,
                                          rf.top - ROOF_BELOW, rf.top + ROOF_ABOVE)


def building_entries(zf: zipfile.ZipFile) -> list[tuple[str, str]]:
    out = []
    for name in zf.namelist():
        parts = name.split("/")
        if len(parts) == 3 and parts[0] == "BUILDING" and parts[2] == f"{parts[1]}.gltf":
            out.append((parts[1], name))
    out.sort()
    return out


def model_in_zone(model: Model, zones: list[dict], e0: float, n0: float) -> bool:
    """模型外包框中心或任一角在敏感区内（本地 dm）。"""
    pts = model.tris.reshape(-1, 3)
    lo, hi = pts.min(0), pts.max(0)
    probe = [((lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2), (lo[0], lo[1]), (hi[0], lo[1]), (lo[0], hi[1]), (hi[0], hi[1])]
    for x, y in probe:
        lx, ly = (x - e0) * 10, (y - n0) * 10
        if any(point_in_ring(z["area"], lx, ly) for z in zones):
            return True
    return False


def process_zip(path: pathlib.Path, tg: Targets, bbox: tuple[float, float, float, float], zones: list[dict],
                origin: tuple[float, float], stats: dict) -> dict[str, int]:
    """一幅 zip 里的楼投到缓冲上；返回投了的模型 {模型号: 三角形数}（跨幅重复的模型各幅都投，打包时按深度合并，结果一样）。"""
    models: dict[str, int] = {}
    with zipfile.ZipFile(path) as zf:
        for mid, name in building_entries(zf):
            model = Model(zf, name)
            if len(model.tris) == 0:
                continue
            pts = model.tris.reshape(-1, 3)
            lo, hi = pts.min(0), pts.max(0)
            if hi[0] < bbox[0] - 20 or lo[0] > bbox[2] + 20 or hi[1] < bbox[1] - 20 or lo[1] > bbox[3] + 20:
                stats["outside"] += 1
                continue
            if model_in_zone(model, zones, *origin):
                stats["sensitiveModels"] += 1
                continue
            models[mid] = len(model.tris)
            splat_model(model, tg, stats)
            del model
    return models


# ---------------------------------------------------------------- 后处理（全部在累积分辨率 ACC_PX_M 上）

def srgb_to_linear(c: np.ndarray) -> np.ndarray:
    return np.where(c <= 0.04045, c / 12.92, ((np.maximum(c, 0) + 0.055) / 1.055) ** 2.4)


def linear_to_srgb(c: np.ndarray) -> np.ndarray:
    c = np.clip(c, 0, 1)
    return np.where(c <= 0.0031308, c * 12.92, 1.055 * np.power(c, 1 / 2.4) - 0.055)


def smoothstep(e0: float, e1: float, x: np.ndarray) -> np.ndarray:
    with np.errstate(over="ignore", invalid="ignore"):
        t = np.clip((x - e0) / (e1 - e0), 0.0, 1.0)
    return t * t * (3 - 2 * t)


def box_blur(a: np.ndarray, r: int) -> np.ndarray:
    """(2r+1)² 盒式模糊（积分图，边界按实际覆盖数归一）。a: (h, w) 或 (h, w, c)。"""
    if r <= 0:
        return a.astype(np.float64)
    sq = a.ndim == 2
    x = a[:, :, None] if sq else a
    h, w = x.shape[:2]
    S = np.zeros((h + 1, w + 1, x.shape[2]), np.float64)
    S[1:, 1:] = np.cumsum(np.cumsum(x, 0, dtype=np.float64), 1)
    y0 = np.clip(np.arange(h) - r, 0, h)
    y1 = np.clip(np.arange(h) + r + 1, 0, h)
    x0 = np.clip(np.arange(w) - r, 0, w)
    x1 = np.clip(np.arange(w) + r + 1, 0, w)
    out = S[y1][:, x1] - S[y0][:, x1] - S[y1][:, x0] + S[y0][:, x0]
    n = ((y1 - y0)[:, None] * (x1 - x0)[None, :])[:, :, None]
    out = out / n
    return out[:, :, 0] if sq else out


def masked_blur(a: np.ndarray, w: np.ndarray, r: int) -> tuple[np.ndarray, np.ndarray]:
    """权重盒式模糊：返回 (Σwa / Σw, 窗口里权重的平均)。"""
    wf = w.astype(np.float64)
    num = box_blur(a * (wf[:, :, None] if a.ndim == 3 else wf), r)
    den = box_blur(wf, r)
    dd = den[:, :, None] if a.ndim == 3 else den
    with np.errstate(invalid="ignore", divide="ignore"):
        out = np.where(dd > 1e-9, num / np.where(dd > 1e-9, dd, 1.0), 0.0)
    return out, den


def fill_holes(col: np.ndarray, valid: np.ndarray, steps: int) -> tuple[np.ndarray, np.ndarray]:
    """逐圈膨胀填补：每圈用 3×3 邻域里有效像素的平均填一圈，最多 steps 圈（≈ 半径 steps px）。col float (h,w,3)。"""
    col = col.copy()
    v = valid.copy()
    for _ in range(steps):
        if v.all() or not v.any():
            break
        s, cnt = masked_blur(col, v, 1)
        grow = (~v) & (cnt > 1e-9)
        if not grow.any():
            break
        col[grow] = s[grow]
        v = v | grow
    return col, v


def delight(lin: np.ndarray, valid: np.ndarray, ref: float, block: int) -> np.ndarray:
    """去日照：低频亮度（block px 一块的加权均值，双线性放回）向整栋参考亮度 ref 部分归一（指数 0.6，倍率 0.5–2）。"""
    h, w = valid.shape
    Y = lin @ np.array([0.2126, 0.7152, 0.0722])
    bh, bw = max(1, math.ceil(h / block)), max(1, math.ceil(w / block))
    ph, pw = bh * block, bw * block
    Yp = np.zeros((ph, pw))
    Vp = np.zeros((ph, pw))
    Yp[:h, :w] = Y * valid
    Vp[:h, :w] = valid
    sy = Yp.reshape(bh, block, bw, block).sum((1, 3))
    sv = Vp.reshape(bh, block, bw, block).sum((1, 3))
    good = sv > block * block * 0.05
    if not good.any():
        return lin
    low = np.where(good, sy / np.maximum(sv, 1e-9), float((sy[good] / sv[good]).mean()))
    ratio = np.clip((ref / np.maximum(low, 1e-4)) ** 0.6, 0.5, 2.0).astype(np.float32)
    if bh == 1 and bw == 1:
        return lin * float(ratio[0, 0])
    # 块心对齐的双线性放大
    big = np.asarray(Image.fromarray(ratio, "F").resize((pw, ph), Image.BILINEAR))[:h, :w]
    return lin * big[:, :, None]


def glass_mask(srgb: np.ndarray, valid: np.ndarray) -> np.ndarray:
    """玻璃度 0–1（白天照片，srgb: (h,w,3) 0–1）：
    - 比周围 3 m 暗的（墙上的窗洞）、整体很暗的（有色玻璃、开口）算玻璃；暖色（石材、砖、米色瓷砖）压低；
    - 偏蓝 / 青的反射面算玻璃，但要有纹理（1.5 m 内的亮度起伏：倒影、竖梃），而且不能又亮又比周围亮——
      均匀的浅蓝 / 浅灰油漆、瓷砖、背阴的白墙不算（它们夜里是实墙，要看得出颜色）；
    - 幕墙里的白天反射（倒映的树、楼、天空亮斑）：周围 4 m 过半是玻璃时也算玻璃。"""
    r, b = srgb[..., 0], srgb[..., 2]
    lum = 0.2126 * r + 0.7152 * srgb[..., 1] + 0.0722 * b
    sat = srgb.max(-1) - srgb.min(-1)
    rad = int(round(1.5 * ACC_PX_M))
    local, _ = masked_blur(lum, valid, rad)
    local2, _ = masked_blur(lum * lum, valid, rad)
    contrast = np.sqrt(np.maximum(local2 - local * local, 0)) / np.maximum(local, 0.03)
    rel = lum / np.maximum(local, 1e-3)
    s_blue = smoothstep(0.06, 0.2, (b - r) / np.maximum(lum, 0.08)) * smoothstep(0.03, 0.09, sat)
    s_white = smoothstep(0.5, 0.7, lum) * smoothstep(0.16, 0.08, sat)
    s_rel = smoothstep(0.85, 0.6, rel)
    s_dark = smoothstep(0.26, 0.09, lum)
    s_warm = smoothstep(0.03, 0.11, r - b)
    s_tex = smoothstep(0.05, 0.12, contrast)
    s_notbright = 1 - smoothstep(0.45, 0.6, lum) * smoothstep(1.0, 1.15, rel)  # 又亮又比周围亮：窗间的浅色墙
    blue = s_blue * (1 - s_warm) * (1 - s_white) * np.maximum(s_tex, s_dark) * s_notbright
    gl = np.maximum.reduce([blue, s_rel, s_dark * (1 - 0.5 * s_warm)])
    near, _ = masked_blur(gl, valid, int(4 * ACC_PX_M))
    gl = np.maximum(gl, 0.9 * smoothstep(0.5, 0.75, near))
    return np.clip(gl, 0, 1) * valid


def leafy_mask(srgb: np.ndarray, valid: np.ndarray, lift: np.ndarray) -> np.ndarray:
    """照片里挡在墙前的树冠（离地 LEAF_LIFT_M 内）：绿比红、蓝都多（相对亮度 > 0.08）、饱和（> 0.15）、有明暗斑
    （1.5 m 内亮度起伏 > 0.12：叶团；均匀的绿漆墙、青绿玻璃不算），再向外扩一圈（树冠边缘的过渡色）。"""
    r, g, b = srgb[..., 0], srgb[..., 1], srgb[..., 2]
    mx = srgb.max(-1)
    mn = srgb.min(-1)
    lum = 0.2126 * r + 0.7152 * g + 0.0722 * b
    sat = (mx - mn) / np.maximum(mx, 1e-6)
    gd = (g - np.maximum(r, b)) / np.maximum(lum, 0.03)
    low = (lift[:, None] < LEAF_LIFT_M) & valid
    cand = low & (gd > 0.06) & (sat > 0.12)
    if not cand.any():
        return cand
    rad = max(1, int(round(0.75 * ACC_PX_M)))
    m1, _ = masked_blur(lum, valid, rad)
    m2, _ = masked_blur(lum * lum, valid, rad)
    tex = np.sqrt(np.maximum(m2 - m1 * m1, 0)) / np.maximum(m1, 0.03)
    leaf = cand & (tex > 0.12)
    if not leaf.any():
        return leaf
    # 向外扩约 0.6 m（叶团边缘、阴影里偏暗偏灰的叶子），再并上扩张范围里仍略偏绿的像素
    grow = box_blur(leaf.astype(np.float64), int(round(0.6 * ACC_PX_M))) > 0.05
    return (grow & ((gd > 0.0) | (box_blur(leaf.astype(np.float64), 2) > 0.2))) & low


def inpaint_rows(lin: np.ndarray, valid: np.ndarray, hole: np.ndarray, spans: list[tuple[float, float]]) -> tuple[np.ndarray, np.ndarray]:
    """把 hole 像素换成同一面、同一行里其余有效像素的平均（「重复这一层的楼层带」：窗带暗、窗间墙亮，横向一致）；
    这一面这一行可用像素不到两成时用整条墙带这一行，再没有就用整条墙带的平均。竖向再轻轻平滑 ±2 行。
    返回 (颜色, 有效)：实在没有可用像素的洞改成无效（客户端画程序立面）。"""
    # 可用像素：有效、不在洞里、也不偏绿（漏网的暗叶子不混进楼层带的平均色）
    gsr = linear_to_srgb(lin)
    good = valid & ~hole & ~((gsr[..., 1] - np.maximum(gsr[..., 0], gsr[..., 2])) > 0.02)
    out = lin.copy()
    vout = valid.copy()
    if not hole.any():
        return out, vout
    H, W = valid.shape
    gsum = (lin * good[..., None]).sum(1)
    gcnt = good.sum(1).astype(np.float64)
    allmean = (lin[good].mean(0) if good.any() else None)
    k = np.ones(5)

    def smooth_rows(s3: np.ndarray, n: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
        ss = np.stack([np.convolve(s3[:, c], k, "same") for c in range(3)], 1)
        nn = np.convolve(n, k, "same")
        return ss, nn

    srow, nrow = smooth_rows(gsum, gcnt)
    spans_px = [(int(p0 * ACC_PX_M), min(W, int(math.ceil((p0 + L) * ACC_PX_M)))) for p0, L in spans] or [(0, W)]
    for c0, c1 in spans_px:
        if c1 <= c0:
            continue
        hv = hole[:, c0:c1]
        if not hv.any():
            continue
        gg = good[:, c0:c1]
        fs, fn = smooth_rows((lin[:, c0:c1] * gg[..., None]).sum(1), gg.sum(1).astype(np.float64))
        enough = fn >= 0.2 * (c1 - c0) * 5
        row = np.where(enough[:, None], fs / np.maximum(fn, 1e-9)[:, None], srow / np.maximum(nrow, 1e-9)[:, None])
        rowok = enough | (nrow >= 10)
        if allmean is not None:
            row = np.where(rowok[:, None], row, allmean[None, :])
            rowok = np.ones(H, bool)
        blk = out[:, c0:c1]
        rr = np.broadcast_to(row[:, None, :], blk.shape)
        blk[hv] = rr[hv]
        vb = vout[:, c0:c1]
        vb[hv & ~rowok[:, None]] = False
    return out, vout


def clean_glass(gl: np.ndarray, srgb: np.ndarray, valid: np.ndarray, spans: list[tuple[float, float]]) -> np.ndarray:
    """玻璃掩膜去噪（复审修正：亮窗原来跟着照片里的倒影、阴影、JPEG 噪点成斑驳的光斑）：
    - 二值化（> 0.5）后先开（去掉约 0.35 m 以下的斑点）再闭（补上同样大小的缝），软值向结果收（玻璃 ≥ 0.75、实墙 ≤ 0.25）；
    - 幕墙面（一个面里玻璃 ≥ GLASS_FACE）：低饱和（< 0.15）、不偏暖的「实墙」像素是白天的倒影（邻楼、天空），也算玻璃 0.8。"""
    m = (gl > 0.5) & valid

    def dil(a: np.ndarray, r: int) -> np.ndarray:
        return box_blur(a.astype(np.float64), r) > 1e-6

    def ero(a: np.ndarray, r: int) -> np.ndarray:
        return box_blur(a.astype(np.float64), r) > 1 - 1e-6

    m = dil(ero(m, 1), 1)
    m = ero(dil(m, 1), 1) & valid
    out = np.where(m, np.maximum(gl, 0.75), np.minimum(gl, 0.25))
    mx = srgb.max(-1)
    mn = srgb.min(-1)
    sat = (mx - mn) / np.maximum(mx, 1e-6)
    notwarm = srgb[..., 2] >= srgb[..., 0] - 0.02
    W = valid.shape[1]
    for p0, L in spans:
        c0, c1 = int(p0 * ACC_PX_M), min(W, int(math.ceil((p0 + L) * ACC_PX_M)))
        v = valid[:, c0:c1]
        n = int(v.sum())
        if c1 <= c0 or n < 12 * ACC_PX_M * ACC_PX_M:
            continue
        if float(m[:, c0:c1][v].mean()) < GLASS_FACE:
            continue
        refl = v & (~m[:, c0:c1]) & (sat[:, c0:c1] < 0.15) & notwarm[:, c0:c1]
        blk = out[:, c0:c1]
        blk[refl] = np.maximum(blk[refl], 0.8)
    return np.clip(out, 0, 1) * valid


def netting_faces(srgb: np.ndarray, valid: np.ndarray, lift: np.ndarray, spans: list[tuple[float, float]]) -> float:
    """绿网 / 工地围网怀疑度：每个面（环的一条边，≥ 12 m² 有效像素）里色相 85–175°（绿到青绿）、饱和度 > 0.35、明度 > 0.25
    （网是白天里鲜亮的布；偏蓝的有色玻璃、灰绿瓷砖更暗、更灰、色相 > 175°），
    而且平整（0.75 m 内亮度起伏小：网是一整片布，树冠有明暗斑）的像素占比——离地 15 m 以上的按 NET_HI、4 m 以上的按 NET_LO 归一；
    返回所有面的最大值（> 1 整栋不用照片。宁可错杀：被树挡住的矮楼也会退回程序立面）。"""
    mx = srgb.max(-1)
    mn = srgb.min(-1)
    sat = (mx - mn) / np.maximum(mx, 1e-6)
    r, g, b = srgb[..., 0], srgb[..., 1], srgb[..., 2]
    d = np.maximum(mx - mn, 1e-6)
    hue = np.where(mx == r, ((g - b) / d) % 6, np.where(mx == g, (b - r) / d + 2, (r - g) / d + 4)) * 60
    green = (hue >= 85) & (hue <= 175) & (sat > 0.35) & (mx > 0.25) & valid
    if not green.any():
        return 0.0
    lum = 0.2126 * r + 0.7152 * g + 0.0722 * b
    rad = max(1, int(round(0.75 * ACC_PX_M)))
    m1, _ = masked_blur(lum, valid, rad)
    m2, _ = masked_blur(lum * lum, valid, rad)
    smooth = np.sqrt(np.maximum(m2 - m1 * m1, 0)) / np.maximum(m1, 0.03) < 0.12
    net = green & smooth
    worst = 0.0
    for h0, lim in ((15.0, NET_HI), (4.0, NET_LO)):
        hi = (lift[:, None] > h0) & valid
        for p0, L in spans:
            c0, c1 = int(p0 * ACC_PX_M), int(math.ceil((p0 + L) * ACC_PX_M))
            n = int(hi[:, c0:c1].sum())
            if n < 12 * ACC_PX_M * ACC_PX_M:
                continue
            worst = max(worst, float(net[:, c0:c1][hi[:, c0:c1]].mean()) / lim)
    return worst


def detect_floors(profiles: list[tuple[np.ndarray, np.ndarray, float]]) -> tuple[float, float, float] | None:
    """层高检测。profiles：[(玻璃度按行均值, 行权重, 第 0 行的绝对高程 m（行向下每行降 1/ACC_PX_M m）)]。
    合到同一条绝对高程轴，减 6 m 滑动平均去趋势，求 2.6–5.2 m 的归一化自相关峰（< 0.2 视为没有规律）。
    返回 (层高 m, 楼层线相位 m（绝对高程 mod 层高；楼层线 = 玻璃最少处，即窗间墙 / 楼板中线）, 自相关值) 或 None。"""
    if not profiles:
        return None
    step = 1.0 / ACC_PX_M
    zmax = max(z0 for _, _, z0 in profiles)
    zmin = min(z0 - len(p) * step for p, _, z0 in profiles)
    n = int(math.ceil((zmax - zmin) / step)) + 1
    acc = np.zeros(n)
    wsum = np.zeros(n)
    for p, w, z0 in profiles:
        k0 = int(round((zmax - z0) / step))
        acc[k0:k0 + len(p)] += p * w
        wsum[k0:k0 + len(p)] += w
    ok = wsum > 1e-6
    if ok.sum() < 3 * 5.2 * ACC_PX_M:
        return None
    prof = np.where(ok, acc / np.maximum(wsum, 1e-9), 0.0)
    k = int(6 * ACC_PX_M)
    ker = np.ones(2 * k + 1)
    mean = np.convolve(prof * ok, ker, "same") / np.maximum(np.convolve(ok.astype(float), ker, "same"), 1e-9)
    x = np.where(ok, prof - mean, 0.0)
    if (x * x).sum() < 1e-9:
        return None
    lags = range(int(2.6 * ACC_PX_M), int(5.2 * ACC_PX_M) + 1)
    scores = []
    for lag in lags:
        a, bb = x[:-lag], x[lag:]
        m = ok[:-lag] & ok[lag:]
        den = math.sqrt(float((a[m] ** 2).sum() * (bb[m] ** 2).sum())) or 1.0
        scores.append(float((a[m] * bb[m]).sum() / den))
    i = int(np.argmax(scores))
    best = scores[i]
    if best < 0.2:
        return None
    lag = float(lags.start + i)
    if 0 < i < len(scores) - 1:
        y0, y1, y2 = scores[i - 1], scores[i], scores[i + 1]
        den = y0 - 2 * y1 + y2
        if abs(den) > 1e-9:
            lag += 0.5 * (y0 - y2) / den
    F = lag * step
    z = zmax - np.arange(n) * step
    ph = np.mod(z, F)
    nb = max(6, int(F * ACC_PX_M))
    bins = np.minimum((ph / F * nb).astype(int), nb - 1)
    fold = np.bincount(bins[ok], x[ok], nb) / np.maximum(np.bincount(bins[ok], None, nb), 1)
    fold = (np.roll(fold, 1) + fold + np.roll(fold, -1)) / 3
    phase = (int(np.argmin(fold)) + 0.5) / nb * F
    return F, phase, best


def resample(a: np.ndarray, w: np.ndarray, out_w: int, out_h: int, src_w: float, src_h: float) -> tuple[np.ndarray, np.ndarray]:
    """加权盒式重采样：a (h,w,c)、权重 w (h,w) → (out_h, out_w, c) 与覆盖权重（源里 src_w × src_h 的小数矩形映射到整幅输出）。"""
    h0, w0 = w.shape
    need_h, need_w = int(math.ceil(src_h)) + 1, int(math.ceil(src_w)) + 1
    if need_h > h0 or need_w > w0:
        a = np.pad(a, ((0, max(0, need_h - h0)), (0, max(0, need_w - w0)), (0, 0)))
        w = np.pad(w, ((0, max(0, need_h - h0)), (0, max(0, need_w - w0))))
    box = (0.0, 0.0, src_w, src_h)
    W = np.asarray(Image.fromarray(w.astype(np.float32), "F").resize((out_w, out_h), Image.BOX, box=box), np.float64)
    chans = []
    for c in range(a.shape[2]):
        ci = Image.fromarray((a[:, :, c] * w).astype(np.float32), "F").resize((out_w, out_h), Image.BOX, box=box)
        chans.append(np.asarray(ci, np.float64))
    out = np.stack(chans, axis=2)
    with np.errstate(invalid="ignore", divide="ignore"):
        out = np.nan_to_num(out / W[:, :, None])
    return out, W


# ---------------------------------------------------------------- 装箱

class Skyline:
    """一页的天际线装箱：先取最靠上（行号小）、再取最靠左的位置。"""

    def __init__(self, size: int):
        self.size = size
        self.sky = [(0, 0, size)]  # (x, y, 宽)

    def find(self, w: int, h: int) -> tuple[int, int] | None:
        best = None
        for i, (x, _, _) in enumerate(self.sky):
            if x + w > self.size:
                break
            y = 0
            j = i
            while j < len(self.sky) and self.sky[j][0] < x + w:
                y = max(y, self.sky[j][1])
                j += 1
            if y + h > self.size:
                continue
            if best is None or (y, x) < (best[1], best[0]):
                best = (x, y)
        return best

    def place(self, w: int, h: int) -> tuple[int, int] | None:
        f = self.find(w, h)
        if f is None:
            return None
        x, y = f
        new = []
        for sx, sy, sw in self.sky:
            ex = sx + sw
            if ex <= x or sx >= x + w:
                new.append((sx, sy, sw))
                continue
            if sx < x:
                new.append((sx, sy, x - sx))
            if ex > x + w:
                new.append((x + w, sy, ex - x - w))
        new.append((x, y + h, w))
        new.sort()
        merged: list[tuple[int, int, int]] = []
        for s in new:
            if merged and merged[-1][1] == s[1] and merged[-1][0] + merged[-1][2] == s[0]:
                merged[-1] = (merged[-1][0], s[1], merged[-1][2] + s[2])
            else:
                merged.append(s)
        self.sky = merged
        return x, y


def hilbert(n: int, x: int, y: int) -> int:
    """n × n 网格（n 为 2 的幂）上 (x, y) 的 Hilbert 序号。"""
    d = 0
    s = n // 2
    while s > 0:
        rx = 1 if (x & s) > 0 else 0
        ry = 1 if (y & s) > 0 else 0
        d += s * s * ((3 * rx) ^ ry)
        if ry == 0:
            if rx == 1:
                x, y = s - 1 - x, s - 1 - y
            x, y = y, x
        s //= 2
    return d


def pack(groups: list[list[tuple[int, int]]], size: int = PAGE, keep_open: int = 4) -> list[list[tuple[int, int, int]]]:
    """groups：按空间顺序的楼，每栋一组 (w, h)（已含外延边）。返回每组每个矩形的 (页, x, y)。
    每栋的矩形按高、再按宽降序放，放进最近打开的 keep_open 页里最早放得下的那页，都放不下就开新页。确定性。"""
    pages: list[Skyline] = []
    out = []
    for g in groups:
        order = sorted(range(len(g)), key=lambda i: (-g[i][1], -g[i][0], i))
        res: list[tuple[int, int, int]] = [(0, 0, 0)] * len(g)
        for i in order:
            w, h = g[i]
            if w > size or h > size:
                raise ValueError(f"矩形 {w}×{h} 超过页 {size}")
            placed = None
            for pi in range(max(0, len(pages) - keep_open), len(pages)):
                xy = pages[pi].place(w, h)
                if xy:
                    placed = (pi, xy[0], xy[1])
                    break
            if placed is None:
                pages.append(Skyline(size))
                xy = pages[-1].place(w, h)
                assert xy is not None
                placed = (len(pages) - 1, xy[0], xy[1])
            res[i] = placed
        out.append(res)
    return out


# 掩膜编码：页与远景图集都是 RGBA WebP（颜色有损、alpha 无损），alpha 是「照片 / 玻璃 / 独立窗」码（GPU 上一张 SRGB8_ALPHA8）：
#   0 = 没有照片；135–255 = 有照片，连续玻璃度 g（A = 255 − 120 g；实墙 255）；
#   24 + k（k = 0..89）= 独立的窗（玻璃度 1，k 是这扇窗的亮灯种子；客户端按最近纹素取码，整扇窗一起亮或灭）。
# 实墙 alpha 最大：即便某些浏览器把 ImageBitmap 预乘 alpha，实墙颜色也不受影响；mipmap 把窗与墙平均后仍单调（越小越像玻璃）。
A_SOLID = 255
A_GLASS_SPAN = 120
A_WIN0 = 24
A_WIN_STEP = 1
WIN_LEVELS = 90
WIN_MIN_M = 0.4       # 独立窗（连通的玻璃块）的外包框范围（m）：更大的连片玻璃（幕墙、带形窗）按连续玻璃处理，客户端按程序租户格亮灯
WIN_MAX_M = 3.0       # 复审修正：原来 4.5 m 宽、4.2 m 高的整片玻璃也当一扇窗，夜里整块发亮像广告牌
WIN_MAX_H = 4.2
WIN_MAX_H_F = 1.15    # 检测到楼层时窗高不超过 1.15 层
WIN_MAX_H_NOFLOOR = 3.4
WIN_MAX_AREA = 12.0   # 外包框面积上限（m²）
WIN_ITERS = 40        # 连通块标号传播的轮数（块的直径超过此像素数就当作大块）
MIN_PIECE_PX = 200    # 切片裁到有效像素外包框后，有效像素少于此数就不出（约 12 m²）


def alpha_code(glass: np.ndarray, valid: np.ndarray, win: np.ndarray | None = None) -> np.ndarray:
    """alpha 码（uint8）：见上（0 / 135–255 / 24 + k）。win：独立窗的种子 0..89，−1 = 不是独立窗。"""
    a = np.where(valid, np.round(A_SOLID - A_GLASS_SPAN * np.clip(glass, 0, 1)), 0)
    if win is not None:
        a = np.where(valid & (win >= 0), A_WIN0 + A_WIN_STEP * np.maximum(win, 0), a)
    return a.astype(np.uint8)


def alpha_glass(a: np.ndarray) -> np.ndarray:
    """alpha 码 → 玻璃度 0–1（独立窗算 1）；与客户端着色器的解码一致。"""
    return np.clip((A_SOLID - a.astype(np.float64)) / A_GLASS_SPAN, 0, 1)


def ihash(*xs: int) -> int:
    """确定性整数哈希（32 位，与顺序有关）。"""
    h = 0x811C9DC5
    for x in xs:
        h ^= x & 0xFFFFFFFF
        h = (h * 0x01000193) & 0xFFFFFFFF
        h ^= h >> 15
        h = (h * 0x2C1B3C6D) & 0xFFFFFFFF
        h ^= h >> 12
    return h


def window_seeds(glass: np.ndarray, valid: np.ndarray, d: float, seed: int, max_h: float = WIN_MAX_H) -> np.ndarray:
    """独立窗的亮灯种子（int16，−1 = 不是独立窗）：玻璃度 > 0.5 的 4 连通块，外包框宽 0.4–3 m、高 0.4–max_h m、面积 ≤ 12 m²、
    块占外包框一半以上的（窗洞、一组窗），每块一个 0..89 的种子，并整块画成外包矩形。更大的连片玻璃（幕墙、带形窗）不给种子。
    连通块用「邻域最大标号」反复传播（WIN_ITERS 轮），没收敛的块必然很大，一并排除。"""
    H, W = glass.shape
    out = np.full((H, W), -1, np.int16)
    g = (glass > 0.5) & valid
    if H == 0 or W == 0 or not g.any():
        return out
    lab = np.where(g, np.arange(1, H * W + 1, dtype=np.int64).reshape(H, W), 0)
    prev = None
    for _ in range(WIN_ITERS):
        m = lab.copy()
        m[1:] = np.maximum(m[1:], lab[:-1])
        m[:-1] = np.maximum(m[:-1], lab[1:])
        m[:, 1:] = np.maximum(m[:, 1:], lab[:, :-1])
        m[:, :-1] = np.maximum(m[:, :-1], lab[:, 1:])
        m = np.where(g, m, 0)
        prev, lab = lab, m
        if np.array_equal(prev, lab):
            break
    # 再传一轮还在变的像素属于没收敛（很大）的块
    m = lab.copy()
    m[1:] = np.maximum(m[1:], lab[:-1])
    m[:-1] = np.maximum(m[:-1], lab[1:])
    m[:, 1:] = np.maximum(m[:, 1:], lab[:, :-1])
    m[:, :-1] = np.maximum(m[:, :-1], lab[:, 1:])
    unstable = g & (np.where(g, m, 0) != lab)
    ys, xs = np.nonzero(g)
    ls = lab[ys, xs]
    uniq, inv = np.unique(ls, return_inverse=True)
    n = len(uniq)
    x0 = np.full(n, W); x1 = np.zeros(n, np.int64); y0 = np.full(n, H); y1 = np.zeros(n, np.int64)
    np.minimum.at(x0, inv, xs); np.maximum.at(x1, inv, xs); np.minimum.at(y0, inv, ys); np.maximum.at(y1, inv, ys)
    cnt = np.bincount(inv, minlength=n)
    bad = np.zeros(n, bool)
    bad[np.unique(inv[unstable[ys, xs]])] = True
    bw = (x1 - x0 + 1) / d
    bh = (y1 - y0 + 1) / d
    ok = (~bad) & (bw >= WIN_MIN_M) & (bw <= WIN_MAX_M) & (bh >= WIN_MIN_M) & (bh <= max_h) & (bw * bh <= WIN_MAX_AREA) & \
         (cnt >= 0.5 * (x1 - x0 + 1) * (y1 - y0 + 1))
    # 每扇窗画成它的外包矩形（照片里的窗边缘是糊的、锯齿的；真窗是矩形），矩形里的有效像素都算这扇窗
    for i in np.nonzero(ok)[0]:
        k = ihash(seed, int(uniq[i])) % WIN_LEVELS
        blk = out[y0[i]:y1[i] + 1, x0[i]:x1[i] + 1]
        blk[valid[y0[i]:y1[i] + 1, x0[i]:x1[i] + 1] & (blk < 0)] = k
    return out


def dilate_fill(col: np.ndarray, valid: np.ndarray, steps: int) -> np.ndarray:
    """无效像素用邻近有效颜色填满（避免 mip 把黑边混进来）；填不到的用有效像素平均色。col uint8 (h,w,3)。"""
    if valid.all():
        return col
    if not valid.any():
        return np.full_like(col, 96)
    f, v = fill_holes(col.astype(np.float64), valid, steps)
    mean = col[valid].mean(0)
    f[~v] = mean
    return np.clip(f + 0.5, 0, 255).astype(np.uint8)


def blit(page: np.ndarray, x: int, y: int, rgba: np.ndarray) -> None:
    """把内容（h,w,4）写到页里 (x+PAD, y+PAD)，四周外延 PAD px（边缘复制）。"""
    c = np.pad(rgba, ((PAD, PAD), (PAD, PAD), (0, 0)), mode="edge")
    h, w = c.shape[:2]
    page[y:y + h, x:x + w] = c


def strip_valid(col: np.ndarray, dep: np.ndarray) -> np.ndarray:
    """有投影、而且不是源贴图里的纯黑填充（看不见的面 FME 填黑），也不是地政总署没贴图的面
    （完全中性的平灰：|R−G|、|G−B| ≤ 2 且 7×7 内亮度标准差 < FLAT_SIGMA——真照片总有颗粒与渐变）。
    复审修正：这些面原来当实墙照片画成无窗的灰板，还挡住了程序立面。"""
    ok = np.isfinite(dep) & (col.max(-1) >= 8)
    c = col.astype(np.int16)
    neutral = ok & (np.abs(c[..., 0] - c[..., 1]) <= 2) & (np.abs(c[..., 1] - c[..., 2]) <= 2)
    if not neutral.any():
        return ok
    y = c.sum(-1).astype(np.float64) / 3.0
    m1, den = masked_blur(y, ok, 3)
    m2, _ = masked_blur(y * y, ok, 3)
    sd = np.sqrt(np.maximum(m2 - m1 * m1, 0.0))
    flat = neutral & (sd < FLAT_SIGMA) & (den > 0.5)
    return ok & ~flat


def quant(d: float) -> int:
    return max(1, int(math.floor(d * DENSITY_Q)))


def encode_rgba(lin: np.ndarray, alpha: np.ndarray) -> np.ndarray:
    valid = alpha > 0
    srgb = np.clip(linear_to_srgb(lin) * 255 + 0.5, 0, 255).astype(np.uint8)
    return np.dstack([dilate_fill(srgb, valid, 12), alpha])


def crop_piece(lin: np.ndarray, alpha: np.ndarray) -> tuple[np.ndarray, int, int] | None:
    """切片裁到有效像素的外包框：返回 (RGBA, 列偏移 c0, 行偏移 r0)；有效像素太少返回 None。"""
    valid = alpha > 0
    if valid.sum() < MIN_PIECE_PX:
        return None
    rows = np.nonzero(valid.any(1))[0]
    cols = np.nonzero(valid.any(0))[0]
    r0, r1, c0, c1 = int(rows[0]), int(rows[-1]) + 1, int(cols[0]), int(cols[-1]) + 1
    return encode_rgba(lin[r0:r1, c0:c1], alpha[r0:r1, c0:c1]), c0, r0


def bake_building(bp: dict, stats: dict) -> dict | None:
    """一栋楼：去日照、玻璃掩膜、层高、绿网检测、按输出密度重采样、独立窗种子、切片并裁边。
    返回 {prisms:[{index, dq, drq, rings:[[(RGBA, c0, r0) | None, ...]], roof: RGBA | None}], floors, green} 或 None。"""
    base_m = bp["base"] / 10
    lum_w = np.array([0.2126, 0.7152, 0.0722])
    Ys, Yr = [], []
    vcache: dict[int, np.ndarray] = {}
    for pr in bp["prisms"]:
        for st in pr["strips"]:
            if st.col is not None:
                v = vcache[id(st)] = strip_valid(st.col, st.dep)
                if v.any():
                    Ys.append(srgb_to_linear(st.col[v][::7] / 255.0) @ lum_w)
        rf = pr["roof"]
        if rf.col is not None:
            v = vcache[id(rf)] = strip_valid(rf.col, rf.dep)
            if v.any():
                Yr.append(srgb_to_linear(rf.col[v][::7] / 255.0) @ lum_w)
    if not Ys and not Yr:
        return None
    ref = float(np.median(np.concatenate(Ys))) if Ys else 0.1
    roof_ref = float(np.median(np.concatenate(Yr))) if Yr else 0.1
    profiles = []
    green = 0.0
    block = int(24 * ACC_PX_M)
    # 第一遍：每条墙带去日照、分类、重采样到输出密度（窗种子要等整栋的层高出来）
    work = []
    for pr in bp["prisms"]:
        top_m = pr["top"] / 10
        hm = top_m - pr["bottom"] / 10
        dq = quant(min(WALL_PX_M, (TILE - 1) / hm))
        d = dq / DENSITY_Q
        rings = []
        for st in pr["strips"]:
            W = int(math.ceil(st.L * d))
            H = int(math.ceil(hm * d))
            item = None
            if st.col is not None:
                valid = vcache[id(st)]
                if valid.sum() >= 50:
                    lin = srgb_to_linear(st.col / 255.0)
                    lin, vf = fill_holes(lin, valid, int(FILL_M * ACC_PX_M))
                    z = top_m - (np.arange(st.rows) + 0.5) / ACC_PX_M
                    lift = z - base_m
                    # 绿网检测用补树之前的颜色（与 R3 整合时人工复查过的排除名单同一个输入：补树不能把网也「补」掉）
                    srgb0 = linear_to_srgb(delight(lin, vf, ref, block))
                    green = max(green, netting_faces(srgb0, vf, lift, st.spans))
                    leaf = leafy_mask(linear_to_srgb(lin), vf, lift)
                    if leaf.any():
                        stats["leafPx"] = stats.get("leafPx", 0) + int(leaf.sum())
                        lin, vf = inpaint_rows(lin, vf, leaf, st.spans)
                    lin = delight(lin, vf, ref, block)
                    srgb = linear_to_srgb(lin)
                    gl = clean_glass(glass_mask(srgb, vf), srgb, vf, st.spans)
                    cnt = vf.sum(1)
                    wr = cnt / max(st.W, 1)
                    wr[(lift < 6.0) | (z > top_m - 1.5)] = 0
                    profiles.append((gl.sum(1) / np.maximum(cnt, 1), wr, float(z[0])))
                    r = ACC_PX_M / d
                    res, cov = resample(np.dstack([lin, gl]), vf.astype(np.float64), W, H, W * r, H * r)
                    item = (res, cov > 0.5)
            rings.append((W, item))
        roof = None
        rf = pr["roof"]
        bw, bh = rf.x1 - rf.x0, rf.y1 - rf.y0
        drq = quant(min(ROOF_PX_M, (TILE - 1) / max(bw, bh, 1e-3)))
        if rf.col is not None:
            valid = vcache[id(rf)]
            if valid.sum() >= 50:
                dr = drq / DENSITY_Q
                lin = srgb_to_linear(rf.col / 255.0)
                lin, vf = fill_holes(lin, valid, int(FILL_M * ACC_PX_M))
                lin = delight(lin, vf, roof_ref, block)
                W = max(1, int(math.ceil(bw * dr)))
                H = max(1, int(math.ceil(bh * dr)))
                r = ACC_PX_M / dr
                res, cov = resample(lin, vf.astype(np.float64), W, H, W * r, H * r)
                vr = cov > 0.5
                if vr.mean() >= MIN_VALID:
                    roof = encode_rgba(res, alpha_code(np.zeros(vr.shape), vr))
        work.append((pr, top_m, d, dq, drq, rings, roof))
    fl = detect_floors(profiles)
    # 独立窗限高：检测到楼层时不超过 1.15 层（原来有横跨两层的「光板」），没检测到时按 3.4 m
    max_h = min(WIN_MAX_H, WIN_MAX_H_F * fl[0]) if fl is not None else WIN_MAX_H_NOFLOOR
    seed = int(bp["key"][:8], 16)
    prisms = []
    for pi, (pr, top_m, d, dq, drq, rings, roof) in enumerate(work):
        out_rings = []
        for ri, (W, item) in enumerate(rings):
            n = max(1, math.ceil(W / TILE))
            if item is None:
                out_rings.append([None] * n)
                continue
            res, valid = item
            win = window_seeds(res[:, :, 3], valid, d, ihash(seed, pi, ri), max_h)
            alpha = alpha_code(res[:, :, 3], valid, win)
            stats["windowPx"] = stats.get("windowPx", 0) + int((win >= 0).sum())
            pieces = []
            for c0 in range(0, W, TILE):
                c1 = min(W, c0 + TILE)
                pieces.append(crop_piece(res[:, c0:c1, :3], alpha[:, c0:c1]))
            out_rings.append(pieces)
        prisms.append({"index": pr["index"], "dq": dq, "drq": drq, "rings": out_rings, "roof": roof})
    return {"prisms": prisms, "floors": fl, "green": green}


class Pages:
    """增量装箱 + 页缓冲；滑出「打开窗口」的页立即编码成 WebP 并释放。"""

    def __init__(self, out_dir: pathlib.Path | None, keep_open: int = KEEP_OPEN, diag_m: float = PAGE_DIAG_M):
        self.sky: list[Skyline] = []
        self.bb: list[list[float]] = []   # 每页楼群的外包框（m）
        self.diag = diag_m
        self.buf: dict[int, np.ndarray] = {}
        self.files: list[dict] = []
        self.far: list[np.ndarray] = []
        self.keep = keep_open
        self.out = out_dir
        self.used = 0

    def fits(self, pi: int, bb: list[float]) -> bool:
        """这栋楼放进第 pi 页后，页的楼群外包框对角线是否仍 ≤ diag。"""
        b = self.bb[pi]
        return math.hypot(max(b[2], bb[2]) - min(b[0], bb[0]), max(b[3], bb[3]) - min(b[1], bb[1])) <= self.diag

    def place(self, rects: list[tuple[int, int]], bb: list[float] | None = None) -> list[tuple[int, int, int]]:
        """一栋楼的矩形装进打开的页：只考虑最近 keep 页里放进这栋后仍紧凑（外包框对角线 ≤ diag）的页，都放不下就开新页。
        bb：这栋楼的外包框 [x0, y0, x1, y1]（m）；None 时不限。"""
        # 滑出打开窗口的页在这里才编码写出（上一栋楼的切片此时都已贴进页缓冲；放这一栋时开新页也不会冲掉它已占的页）
        self.flush(len(self.sky) - 1 - self.keep)
        order = sorted(range(len(rects)), key=lambda i: (-rects[i][1], -rects[i][0], i))
        res: list[tuple[int, int, int]] = [(0, 0, 0)] * len(rects)
        cand = [pi for pi in range(max(0, len(self.sky) - self.keep), len(self.sky)) if bb is None or self.fits(pi, bb)]
        for i in order:
            w, h = rects[i]
            self.used += w * h
            placed = None
            for pi in cand:
                xy = self.sky[pi].place(w, h)
                if xy:
                    placed = (pi, xy[0], xy[1])
                    break
            if placed is None:
                self.sky.append(Skyline(PAGE))
                self.bb.append(list(bb) if bb is not None else [0.0, 0.0, 0.0, 0.0])
                cand.append(len(self.sky) - 1)
                pg = np.zeros((PAGE, PAGE, 4), np.uint8)
                pg[:, :, :3] = 96
                self.buf[len(self.sky) - 1] = pg
                xy = self.sky[-1].place(w, h)
                assert xy is not None
                placed = (len(self.sky) - 1, xy[0], xy[1])
            res[i] = placed
            if bb is not None:
                b = self.bb[placed[0]]
                self.bb[placed[0]] = [min(b[0], bb[0]), min(b[1], bb[1]), max(b[2], bb[2]), max(b[3], bb[3])]
        return res

    def flush(self, upto: int) -> None:
        for pi in sorted(k for k in self.buf if k <= upto):
            self.encode(pi, self.buf.pop(pi))

    def encode(self, pi: int, rgba: np.ndarray) -> None:
        bio = io.BytesIO()
        Image.fromarray(rgba, "RGBA").save(bio, "WEBP", quality=WEBP_Q, method=6)
        data = bio.getvalue()
        sha = hashlib.sha256(data).hexdigest()
        name = f"p{pi:03d}-{sha[:8]}.webp"
        if self.out is not None:
            (self.out / name).write_bytes(data)
        while len(self.files) <= pi:
            self.files.append({})
        self.files[pi] = {"file": name, "sha256": sha, "bytes": len(data)}
        # 远景格：有效像素加权缩小颜色；alpha = 玻璃度的面积平均（独立窗算 1）
        a = rgba[:, :, 3]
        valid = (a > 0).astype(np.float64)
        lin = srgb_to_linear(rgba[:, :, :3] / 255.0)
        small, w = resample(np.dstack([lin, alpha_glass(a)]), valid, FAR_CELL, FAR_CELL, PAGE, PAGE)
        vs = w > 0.3
        sc = encode_rgba(small[:, :, :3], alpha_code(small[:, :, 3], vs))
        while len(self.far) <= pi:
            self.far.append(np.zeros((FAR_CELL, FAR_CELL, 4), np.uint8))
        self.far[pi] = sc

    def finish(self) -> dict:
        self.flush(len(self.sky))
        rows = max(1, math.ceil(len(self.far) / FAR_COLS))
        atlas = np.zeros((rows * FAR_CELL, FAR_COLS * FAR_CELL, 4), np.uint8)
        atlas[:, :, :3] = 96
        for pi, c in enumerate(self.far):
            y, x = (pi // FAR_COLS) * FAR_CELL, (pi % FAR_COLS) * FAR_CELL
            atlas[y:y + FAR_CELL, x:x + FAR_CELL] = c
        out = {"cols": FAR_COLS, "rows": rows, "cell": FAR_CELL}
        # 全分辨率（HIGH）与半分辨率（LOW 档）两份；半分辨率逐格缩小（颜色按有效像素加权，alpha 按玻璃度平均）
        half = np.zeros((rows * FAR_CELL // 2, FAR_COLS * FAR_CELL // 2, 4), np.uint8)
        a = atlas[:, :, 3]
        lin = srgb_to_linear(atlas[:, :, :3] / 255.0)
        small, w = resample(np.dstack([lin, alpha_glass(a)]), (a > 0).astype(np.float64), half.shape[1], half.shape[0],
                            atlas.shape[1], atlas.shape[0])
        half[:] = encode_rgba(small[:, :, :3], alpha_code(small[:, :, 3], w > 0.3))
        for key, img in (("", atlas), ("low", half)):
            bio = io.BytesIO()
            Image.fromarray(img, "RGBA").save(bio, "WEBP", quality=FAR_Q, method=6)
            data = bio.getvalue()
            sha = hashlib.sha256(data).hexdigest()
            name = f"far{'-' + key if key else ''}-{sha[:8]}.webp"
            if self.out is not None:
                (self.out / name).write_bytes(data)
            out[key or "full"] = {"file": name, "sha256": sha, "bytes": len(data)}
        return out


_PAR: dict = {}


class Review:
    """人工复查用的联系表：每栋一格（最大的一片墙照片 + 楼号、绿网度），每张 8 × 6 = 48 栋，写到 DIR/contact-NNN.png。"""
    CW, CH, COLS, ROWS = 300, 200, 8, 6

    def __init__(self, out: pathlib.Path | None, prefix: str = "contact"):
        self.out = out
        self.prefix = prefix
        self.cells: list[Image.Image] = []
        self.n = 0
        if out is not None:
            out.mkdir(parents=True, exist_ok=True)

    def add(self, bid: str, res: dict, note: str) -> None:
        if self.out is None:
            return
        from PIL import ImageDraw
        pcs = [pc[0] for pr in res["prisms"] for ring in pr["rings"] for pc in ring if pc is not None]
        pcs.sort(key=lambda im: -int((im[:, :, 3] > 0).sum()))
        cell = Image.new("RGB", (self.CW, self.CH), (30, 0, 30))
        x = 0
        for im in pcs[:1]:
            h, w = im.shape[:2]
            k = min((self.CW - 2) / w, (self.CH - 14) / h)
            t = Image.fromarray(im[:, :, :3]).resize((max(1, int(w * k)), max(1, int(h * k))))
            cell.paste(t, (x, 14))
            x += t.width + 2
        ImageDraw.Draw(cell).text((2, 1), f"{bid} {note}", fill=(255, 255, 0))
        self.cells.append(cell)
        if len(self.cells) == self.COLS * self.ROWS:
            self.flush()

    def flush(self) -> None:
        if self.out is None or not self.cells:
            return
        sheet = Image.new("RGB", (self.CW * self.COLS, self.CH * self.ROWS), (0, 0, 0))
        for i, c in enumerate(self.cells):
            sheet.paste(c, ((i % self.COLS) * self.CW, (i // self.COLS) * self.CH))
        sheet.save(self.out / f"{self.prefix}-{self.n:03d}.png")
        self.n += 1
        self.cells = []


def _seg_gap(ax: np.ndarray, ay: np.ndarray, ring: list[int]) -> float:
    """点集 (ax, ay) 到闭合环 ring（dm 平铺）各边的最短距离（dm）。"""
    bx = np.array(ring[0::2], np.float64)
    by = np.array(ring[1::2], np.float64)
    cx, cy = np.roll(bx, -1), np.roll(by, -1)
    dx, dy = cx - bx, cy - by
    L2 = np.maximum(dx * dx + dy * dy, 1e-9)
    t = np.clip(((ax[:, None] - bx[None]) * dx[None] + (ay[:, None] - by[None]) * dy[None]) / L2[None], 0, 1)
    px = bx[None] + t * dx[None] - ax[:, None]
    py = by[None] + t * dy[None] - ay[:, None]
    return float(np.sqrt(px * px + py * py).min())


def zone_gap_m(bp: dict) -> float:
    """楼的外环到最近敏感区的距离（m；相交或包含为 0）。"""
    outer = bp["prisms"][0]["rings"][0]
    ax = np.array(outer[0::2], np.float64)
    ay = np.array(outer[1::2], np.float64)
    m = ZONE_MARGIN_M * 10 + 1
    best = math.inf
    for z in bp["zones"]:
        zo = z["area"]["outer"]
        zx, zy = zo[0::2], zo[1::2]
        if ax.min() > max(zx) + m or ax.max() < min(zx) - m or ay.min() > max(zy) + m or ay.max() < min(zy) - m:
            continue
        if any(point_in_ring(z["area"], float(x), float(y)) for x, y in zip(ax, ay)) or point_in_flat(outer, zx[0], zy[0]):
            return 0.0
        best = min(best, _seg_gap(ax, ay, zo), _seg_gap(np.array(zx, np.float64), np.array(zy, np.float64), outer))
    return best / 10


def _bake_one(i: int) -> tuple[dict | None, dict]:
    """并行烘焙的工作函数（fork 出来的子进程继承 _PAR）：读缓存 → 烘焙 → 释放，返回结果与这一栋的统计增量。"""
    bp = _PAR["items"][i]
    st: dict = {}
    if _PAR["load"]:
        _PAR["load"](bp)
    res = bake_building(bp, st)
    if _PAR["free"]:
        _PAR["free"](bp)
    return res, st


def finalize(plans: list[dict], bbox_dm: list[int], out_dir: pathlib.Path | None, stats: dict, load=None, free=None,
             workers: int = 1, review: pathlib.Path | None = None) -> dict:
    """全部楼：按 Hilbert 序烘焙、装箱、写页文件；返回清单（不含 sources）。load / free：烘焙一栋前后调（按需读入缓存、用完释放，内存只放一栋）。
    workers > 1 时逐栋烘焙分给 fork 出来的子进程（结果按原顺序取回，装箱仍在主进程按 Hilbert 序做：产物与 workers 无关）。"""
    x0, y0, x1, y1 = bbox_dm
    n = 1024
    keyed = []
    for bp in plans:
        hx = int(min(n - 1, max(0, (bp["cx"] - x0) / (x1 - x0) * n)))
        hy = int(min(n - 1, max(0, (bp["cy"] - y0) / (y1 - y0) * n)))
        keyed.append((hilbert(n, hx, hy), bp["id"], bp))
    keyed.sort(key=lambda t: (t[0], t[1]))
    pages = Pages(out_dir)
    buildings: dict[str, dict] = {}
    scaffold = []
    t0 = time.time()
    items = [bp for _, _, bp in keyed]
    rv = Review(review)
    rs = Review(review, "suspect")  # 有一点饱和绿、但没超阈值的楼：人工复查时先看这些
    _PAR.update(items=items, load=load, free=free)
    pool = None
    if workers > 1:
        import multiprocessing
        pool = multiprocessing.get_context("fork").Pool(workers)
        results = pool.imap(_bake_one, range(len(items)), chunksize=2)
    else:
        results = map(_bake_one, range(len(items)))
    for k, ((_, bid, bp), (res, st)) in enumerate(zip(keyed, results)):
        if k % 200 == 0:
            log(f"  烘焙 {k}/{len(keyed)}（{time.time() - t0:.0f} s，{len(pages.sky)} 页）")
        for sk, sv in st.items():
            stats[sk] = stats.get(sk, 0) + sv
        if res is None:
            continue
        flagged = res["green"] > GREEN_MAX and bid not in ALLOW_IDS
        note = f"g{res['green']:.2f}" + (" NET" if flagged else "") + (" MANUAL" if bid in EXCLUDE_IDS else "") + (" ALLOW" if bid in ALLOW_IDS else "")
        rv.add(bid, res, note)
        if 0.3 < res["green"] <= GREEN_MAX:
            rs.add(bid, res, note)
        if flagged:
            scaffold.append({"id": bid, "green": round(res["green"], 3)})
            continue
        if bid in EXCLUDE_IDS:
            scaffold.append({"id": bid, "green": round(res["green"], 3), "manual": EXCLUDE_IDS[bid]})
            continue
        if zone_gap_m(bp) < ZONE_MARGIN_M:
            scaffold.append({"id": bid, "green": round(res["green"], 3), "manual": f"敏感区 {ZONE_MARGIN_M:g} m 内"})
            continue
        rects = []
        refs = []
        for pi, pr in enumerate(res["prisms"]):
            if pr["roof"] is not None:
                h, w = pr["roof"].shape[:2]
                rects.append((w + 2 * PAD, h + 2 * PAD))
                refs.append((pi, -1, -1, pr["roof"]))
            for ri, ring in enumerate(pr["rings"]):
                for ki, pc in enumerate(ring):
                    if pc is not None:
                        h, w = pc[0].shape[:2]
                        rects.append((w + 2 * PAD, h + 2 * PAD))
                        refs.append((pi, ri, ki, pc[0]))
        if not rects:
            continue
        outer = bp["prisms"][0]["rings"][0]
        bbm = [min(outer[0::2]) / 10, min(outer[1::2]) / 10, max(outer[0::2]) / 10, max(outer[1::2]) / 10]
        place = pages.place(rects, bbm)
        slot: dict[tuple[int, int, int], tuple[int, int, int]] = {}
        for (pi, ri, ki, img), (pg, px, py) in zip(refs, place):
            blit(pages.buf[pg], px, py, img)
            slot[(pi, ri, ki)] = (pg, px + PAD, py + PAD)
        # 记录：与 Building.parts 序号对齐（没有分层时一项）
        nrec = max(pr["index"] for pr in res["prisms"]) + 1
        recs: list[list[int]] = [[] for _ in range(nrec)]
        for pi, pr in enumerate(res["prisms"]):
            rp = slot.get((pi, -1, -1), (-1, 0, 0))
            rec = [pr["dq"], pr["drq"], *rp]
            for ri, ring in enumerate(pr["rings"]):
                rec.append(len(ring))
                for ki, pc in enumerate(ring):
                    s = slot.get((pi, ri, ki))
                    if s is None or pc is None:
                        rec += [-1, 0, 0, 0, 0, 0, 0]
                    else:
                        img, c0, r0 = pc
                        rec += [*s, c0, r0, img.shape[1], img.shape[0]]
            recs[pr["index"]] = rec
        entry: dict = {"k": bp["key"], "p": recs}
        fl = res["floors"]
        if fl is not None:
            F, phase, conf = fl
            entry["f"] = [int(round(F * 100)), int(round(((phase - bp["base"] / 10) % F) * 100)) % int(round(F * 100))]
            stats["floorsDetected"] += 1
        buildings[bid] = entry
        stats["buildingsTextured"] += 1
    if pool is not None:
        pool.close()
        pool.join()
    _PAR.clear()
    rv.flush()
    rs.flush()
    far = pages.finish()
    stats["pages"] = len(pages.files)
    stats["pageDiagMaxM"] = round(max((math.hypot(b[2] - b[0], b[3] - b[1]) for b in pages.bb), default=0.0), 1)
    stats["pageFill"] = round(pages.used / max(1, len(pages.files) * PAGE * PAGE), 3)
    return {"pages": pages.files, "far": far, "buildings": buildings, "scaffold": scaffold}


# ---------------------------------------------------------------- 图幅索引、缓存、主流程

def data_bbox(meta: dict) -> tuple[float, float, float, float]:
    e, n = meta["origin"]["e"], meta["origin"]["n"]
    x0, y0, x1, y1 = meta["bbox"]
    return e + x0 / 10, n + y0 / 10, e + x1 / 10, n + y1 / 10


def sheet_index(bbox: tuple[float, float, float, float]) -> list[dict]:
    """与范围相交的图幅：[{sheet, revision, url（含 key，只在内存里）, urlNoKey}]，按图幅号排序。"""
    q = {"where": "1=1",
         "geometry": json.dumps({"xmin": bbox[0], "ymin": bbox[1], "xmax": bbox[2], "ymax": bbox[3]}, separators=(",", ":")),
         "geometryType": "esriGeometryEnvelope", "inSR": "2326", "outSR": "2326",
         "spatialRel": "esriSpatialRelIntersects",
         "outFields": "SHEETNO,REVISIONDATE,Format_glTF", "returnGeometry": "true",
         "orderByFields": "SHEETNO", "f": "json"}
    d = json.loads(get(INDEX_QUERY, q))
    out = []
    for f in d["features"]:
        a = f["attributes"]
        u = urllib.parse.urlsplit(a["Format_glTF"])
        # 只许带纹理的个别模型（路径 /api/3d-zip/GLTF/<sheet>.zip）
        if u.scheme != "https" or u.netloc != "download.map.gov.hk" or not u.path.startswith("/api/3d-zip/GLTF/"):
            raise SystemExit(f"{a['SHEETNO']}: 意外的下载地址")
        rev = time.strftime("%Y-%m-%d", time.gmtime(a["REVISIONDATE"] / 1000))
        ring = f.get("geometry", {}).get("rings", [[[0, 0]]])[0]
        out.append({"sheet": a["SHEETNO"], "revision": rev, "url": a["Format_glTF"],
                    "urlNoKey": urllib.parse.urlunsplit((u.scheme, u.netloc, u.path, "", "")),
                    "cx": sum(p[0] for p in ring) / len(ring), "cy": sum(p[1] for p in ring) / len(ring)})
    out.sort(key=lambda s: s["sheet"])
    return out


# ---------------------------------------------------------------- 逐幅缓存（可续跑：每幅投影完立即落盘，崩溃最多丢一幅）

PROJ_VERSION = 2  # 投影算法版本；改了投影规则（不是后处理）就加一，旧缓存自动作废


def proj_fingerprint() -> str:
    """投影参数指纹：缓存目录名的一部分。后处理参数（去日照、玻璃分类、打包）不在里面，改它们不用重新投影。"""
    p = [PROJ_VERSION, ACC_PX_M, TOL_OUT, TOL_IN, WALL_COS, WALL_NZ, ROOF_NZ, ROOF_BELOW, ROOF_ABOVE, SINK_DM, MIN_HEIGHT_DM]
    return hashlib.sha256(json.dumps(p).encode()).hexdigest()[:8]


def sheet_dir(cache: pathlib.Path, s: dict) -> pathlib.Path:
    return cache / f"{s['sheet']}_{s['revision']}_{proj_fingerprint()}"


def targets_of(bp: dict) -> list[list]:
    """一栋楼的全部累积缓冲，按 [棱柱][墙带..., 屋顶] 排（与缓存条目一一对应）。"""
    return [[*pr["strips"], pr["roof"]] for pr in bp["prisms"]]


def crop_item(t) -> tuple | None:
    """一个缓冲里有投影的最小矩形：(r0, c0, 颜色 uint8, 深度 float32)；没有投影返回 None。"""
    if t.col is None:
        return None
    fin = np.isfinite(t.dep)
    rows = np.nonzero(fin.any(1))[0]
    if len(rows) == 0:
        return None
    cols = np.nonzero(fin.any(0))[0]
    r0, r1, c0, c1 = int(rows[0]), int(rows[-1]) + 1, int(cols[0]), int(cols[-1]) + 1
    return r0, c0, t.col[r0:r1, c0:c1].copy(), t.dep[r0:r1, c0:c1].copy()


def save_sheet(sd: pathlib.Path, plans: list[dict], done: dict) -> None:
    """一幅的投影结果：每栋（有投影的）一个 b/<几何指纹>.pkl，最后写 done.json（原子改名 = 这一幅完成的标记）。"""
    import pickle
    bdir = sd / "b"
    bdir.mkdir(parents=True, exist_ok=True)
    keys = []
    for bp in plans:
        items = [[crop_item(t) for t in row] for row in targets_of(bp)]
        if not any(x is not None for row in items for x in row):
            continue
        tmp = bdir / f"{bp['key']}.pkl.tmp"
        with open(tmp, "wb") as f:
            pickle.dump(items, f, protocol=5)
        tmp.replace(bdir / f"{bp['key']}.pkl")
        keys.append(bp["key"])
    done = {**done, "keys": sorted(keys), "fingerprint": proj_fingerprint()}
    tmp = sd / "done.json.tmp"
    tmp.write_text(json.dumps(done, ensure_ascii=False, indent=1), encoding="utf-8")
    tmp.replace(sd / "done.json")


def reset_targets(plans: list[dict]) -> None:
    for bp in plans:
        for row in targets_of(bp):
            for t in row:
                t.col = None
                t.dep = None


def merge_building(bp: dict, sheet_dirs: list[pathlib.Path]) -> None:
    """把各幅缓存里这栋楼的投影按「深度大者胜」合进它的缓冲（按图幅号顺序，平局取先者：与处理顺序无关、确定性）。"""
    import pickle
    rows = targets_of(bp)
    for sd in sheet_dirs:
        with open(sd / "b" / f"{bp['key']}.pkl", "rb") as f:
            items = pickle.load(f)  # noqa: S301 —— 自己写的缓存，不读别人的
        for row, its in zip(rows, items):
            for t, it in zip(row, its):
                if it is None:
                    continue
                r0, c0, col, dep = it
                t.alloc()
                h, w = dep.shape
                cur = t.dep[r0:r0 + h, c0:c0 + w]
                upd = dep > cur
                t.col[r0:r0 + h, c0:c0 + w][upd] = col[upd]
                cur[upd] = dep[upd]


def free_building(bp: dict) -> None:
    for row in targets_of(bp):
        for t in row:
            t.col = None
            t.dep = None


def fetch_zip(s: dict, zdir: pathlib.Path, log) -> pathlib.Path:
    """下载一幅 zip 到 zdir（.part 断点续传，HTTP Range；完成后改名 .zip）。已有完整 .zip 直接用。"""
    final = zdir / f"{s['sheet']}_{s['revision']}.zip"
    if final.exists():
        return final
    part = final.with_suffix(".zip.part")
    for attempt in range(8):
        have = part.stat().st_size if part.exists() else 0
        headers = {"User-Agent": UA}
        if have:
            headers["Range"] = f"bytes={have}-"
        try:
            req = urllib.request.Request(s["url"], headers=headers)
            with urllib.request.urlopen(req, context=ssl_context(), timeout=600) as r:
                if r.status == 206:
                    total = int(r.headers["Content-Range"].rsplit("/", 1)[1])
                    mode = "ab"
                else:
                    total = int(r.headers.get("Content-Length") or 0)
                    have = 0
                    mode = "wb"
                free = shutil.disk_usage(zdir).free
                if free < total - have + MIN_FREE_BYTES:
                    raise SystemExit(f"磁盘余量不足（{free} B，还要 {total - have} B）")
                with open(part, mode) as f:
                    while True:
                        chunk = r.read(1 << 20)
                        if not chunk:
                            break
                        f.write(chunk)
            size = part.stat().st_size
            if total and size != total:
                raise OSError(f"长度不符 {size} / {total}")
            part.replace(final)
            return final
        except (OSError, urllib.error.URLError) as e:  # 断线：退避后从已下载处续传
            log(f"  {s['sheet']} 下载中断（第 {attempt + 1} 次）：{e}；{30 * (attempt + 1)} s 后续传")
            time.sleep(30 * (attempt + 1))
    raise SystemExit(f"{s['sheet']}：多次续传失败")


def file_sha256(path: pathlib.Path) -> tuple[str, int]:
    h = hashlib.sha256()
    n = 0
    with open(path, "rb") as f:
        while True:
            b = f.read(1 << 22)
            if not b:
                break
            h.update(b)
            n += len(b)
    return h.hexdigest(), n


def rss_mb() -> float:
    """本进程当前常驻内存（MB，读 /proc；没有就用峰值）。"""
    try:
        for line in pathlib.Path("/proc/self/status").read_text().splitlines():
            if line.startswith("VmRSS:"):
                return int(line.split()[1]) / 1024
    except OSError:
        pass
    import resource
    return resource.getrusage(resource.RUSAGE_SELF).ru_maxrss / 1024

def write_outputs(result: dict, sheets: list[dict], stats: dict, sens: list[str], raw_dir: pathlib.Path, update: bool) -> dict:
    doc = {
        "format": "central-3dvm-facades",
        "version": 2,
        "datasetId": DATASET_ID,
        "params": {"page": PAGE, "pad": PAD, "tile": TILE, "densityQ": DENSITY_Q, "wallPxM": WALL_PX_M, "roofPxM": ROOF_PX_M,
                   "accPxM": ACC_PX_M, "farCell": FAR_CELL, "farCols": FAR_COLS, "webpQ": WEBP_Q, "farQ": FAR_Q,
                   "alpha": "RGBA WebP; alpha 0 = no photo; 255 - 120 * glass (continuous glass 0..1, solid 255); "
                            "24 + k (k = 0..89) = individual window with lighting seed k (glass 1)"},
        "record": "per prism (aligned to Building.parts; one item without parts): [dq, drq, roofPage, roofX, roofY, "
                  "then per ring: n, n x (page, x, y, c0, r0, w, h)]; density = q / densityQ px/m; page -1 = no photo; "
                  "wall tile-local col = P * d - k * tile, row = (top - z) * d; photo only for c0 <= col < c0 + w and "
                  "r0 <= row < r0 + h, at page texel (x + col - c0, y + row - r0); roof texel (x + (X - minX) * dr, y + (maxY - Y) * dr)",
        "pages": result["pages"],
        "far": result["far"],
        "buildings": dict(sorted(result["buildings"].items())),
        "excluded": {"scaffold": result["scaffold"], "sensitive": sorted(sens)},
        "stats": stats,
    }
    text = json.dumps(doc, separators=(",", ":"), ensure_ascii=False)
    data = gzip.compress(text.encode("utf-8"), 9, mtime=0)
    raw_dir.mkdir(parents=True, exist_ok=True)
    (raw_dir / OUT_FILE).write_bytes(data)
    total = sum(p["bytes"] for p in result["pages"]) + result["far"]["full"]["bytes"] + result["far"]["low"]["bytes"]
    print(f"{OUT_FILE} gzip {len(data)} B；{len(result['pages'])} 页 + 远景图集，共 {total} B；统计 {stats}")
    entry = {
        "file": OUT_FILE, "layer": "landsd/3dvm-individualised-facades", "datasetId": DATASET_ID,
        "url": f"{PORTAL}/geoportal/?datasetId={DATASET_ID}", "query": INDEX_QUERY,
        "release": max((s["revision"] for s in sheets), default=FETCHED),
        "format": "gzip JSON (written by landsd_3d_tex_bake.py): per building, facade/roof atlas references and detected floor "
                  "height; lists the derived WebP atlas pages in client/public/city/facades/ with sha256",
        "crs": "EPSG:2326 + mPD", "licenses": [TERMS], "attribution": ATTRIBUTION, "fetched": FETCHED,
        "sha256": hashlib.sha256(data).hexdigest(), "bytes": len(data), "rows": len(result["buildings"]),
        "derivedFrom": [{k: s[k] for k in ("sheet", "revision", "urlNoKey", "sha256", "bytes")} for s in sheets],
    }
    if update:
        path = raw_dir / "sources.json"
        manifest = json.loads(path.read_text(encoding="utf-8"))
        manifest["files"] = [f for f in manifest["files"] if f["file"] != entry["file"]] + [entry]
        if DATASET_NOTE not in manifest["dataset"]:
            ds = manifest["dataset"]
            manifest["dataset"] = (ds[:-1] + f"; {DATASET_NOTE})") if ds.endswith(")") else f"{ds} ({DATASET_NOTE})"
        path.write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    return entry


def selftest() -> None:
    """纯函数自测：装箱、Hilbert、玻璃分类、层高检测、掩膜编码。"""
    rng = np.random.default_rng(7)
    # 装箱：不重叠、不出页、确定性
    groups = [[(int(rng.integers(8, 600)), int(rng.integers(8, 600))) for _ in range(int(rng.integers(1, 6)))] for _ in range(60)]
    a = pack(groups)
    b = pack(groups)
    assert a == b
    occ: dict[int, np.ndarray] = {}
    for g, res in zip(groups, a):
        for (w, h), (p, x, y) in zip(g, res):
            o = occ.setdefault(p, np.zeros((PAGE, PAGE), np.int32))
            assert 0 <= x and x + w <= PAGE and 0 <= y and y + h <= PAGE
            o[y:y + h, x:x + w] += 1
    assert all(o.max() <= 1 for o in occ.values()), "装箱重叠"
    # Hilbert：相邻格序号相邻
    assert sorted(hilbert(8, x, y) for x in range(8) for y in range(8)) == list(range(64))
    # 玻璃分类：蓝玻璃 → 高；白瓷砖 → 低；浅墙上的暗窗 → 窗高墙低
    v = np.ones((60, 60), bool)
    blue = np.zeros((60, 60, 3)) + [0.35, 0.45, 0.55]
    blue[:, ::9] = [0.12, 0.14, 0.16]  # 竖梃 / 倒影的起伏
    assert glass_mask(blue, v).mean() > 0.8, glass_mask(blue, v).mean()
    paint = np.zeros((60, 60, 3)) + [0.62, 0.72, 0.82]  # 均匀的浅蓝油漆墙：不是玻璃
    assert glass_mask(paint, v).mean() < 0.1, glass_mask(paint, v).mean()
    tile = np.zeros((60, 60, 3)) + [0.85, 0.82, 0.76]
    assert glass_mask(tile, v).mean() < 0.1
    shade = np.zeros((60, 60, 3)) + [0.74, 0.77, 0.82]
    assert glass_mask(shade, v).mean() < 0.2, glass_mask(shade, v).mean()
    wall = tile.copy()
    wall[20:32, 20:30] = [0.25, 0.26, 0.28]
    gm = glass_mask(wall, v)
    assert gm[26, 25] > 0.8 and gm[5, 5] < 0.1
    # 层高：F = 3.9 m、楼层线相位 1.2 m 的合成剖面
    z0 = 130.0
    z = z0 - (np.arange(int(100 * ACC_PX_M)) + 0.5) / ACC_PX_M
    prof = np.where(np.mod(z - 1.2 + 0.5, 3.9) < 1.0, 0.1, 0.9) + rng.normal(0, 0.05, len(z))
    fl = detect_floors([(prof, np.ones(len(z)), float(z[0]))])
    assert fl is not None and abs(fl[0] - 3.9) < 0.08, fl
    dphi = (fl[1] - 1.2 + fl[0] / 2) % fl[0] - fl[0] / 2
    assert abs(dphi) < 0.25, fl
    assert detect_floors([(rng.normal(0, 1, len(z)), np.ones(len(z)), float(z[0]))]) is None
    # alpha 码：无照片 0、实墙 255、玻璃 135、独立窗 24 + k；解码回玻璃度
    mc = alpha_code(np.array([0.0, 1.0, 0.5, 1.0]), np.array([True, True, False, True]), np.array([-1, -1, -1, 3]))
    assert list(mc) == [255, 135, 0, 27], list(mc)
    assert np.allclose(alpha_glass(mc), [0.0, 1.0, 1.0, 1.0])
    # 独立窗种子：1.5 m 宽的窗洞 → 每扇一个种子（整扇同一个）；整面玻璃（幕墙）→ 没有
    d = 4.0
    H, W = int(30 * d), int(20 * d)
    gl = np.zeros((H, W))
    for y0 in range(4, H - 8, 12):
        for x0 in (8, 32, 56):
            gl[y0:y0 + 6, x0:x0 + 6] = 1.0
    vv = np.ones((H, W), bool)
    ws = window_seeds(gl, vv, d, 11)
    assert (ws[gl > 0.5] >= 0).all() and (ws[gl < 0.5] < 0).all()
    gl2 = gl.copy()
    gl2[4, 8] = 0.0  # 缺角的窗也画成整矩形
    assert window_seeds(gl2, vv, d, 11)[4, 8] == ws[5, 9]
    assert all(len(np.unique(ws[y0:y0 + 6, 8:14])) == 1 for y0 in range(4, H - 8, 12))
    assert len(np.unique(ws[ws >= 0])) >= 10, np.unique(ws)
    assert (window_seeds(np.ones((H, W)), vv, d, 11) < 0).all()
    assert (ws == window_seeds(gl, vv, d, 11)).all()
    mc2 = alpha_code(np.ones(3), np.ones(3, bool), np.array([0, 89, -1]))
    assert list(mc2) == [24, 113, 135], list(mc2)
    # 绿网：一个面 20 % 饱和绿 → 超标；绿色玻璃（饱和度低）、15 m 以下的树不算
    hh, ww = int(40 * ACC_PX_M), int(20 * ACC_PX_M)
    lift = 40.0 - (np.arange(hh) + 0.5) / ACC_PX_M
    wall = np.zeros((hh, ww, 3)) + [0.7, 0.68, 0.62]
    vvv = np.ones((hh, ww), bool)
    netc = wall.copy()
    netc[: hh // 5] = [0.15, 0.55, 0.25]
    assert netting_faces(netc, vvv, lift, [(0.0, 20.0)]) > GREEN_MAX
    glassg = wall.copy()
    glassg[: hh // 2] = [0.35, 0.45, 0.42]
    assert netting_faces(glassg, vvv, lift, [(0.0, 20.0)]) < GREEN_MAX
    tree = wall.copy()
    tree[lift < 3] = [0.15, 0.55, 0.25]
    assert netting_faces(tree, vvv, lift, [(0.0, 20.0)]) < GREEN_MAX
    canopy = wall.copy()  # 有明暗斑的树冠：不算网
    yy, xx = np.mgrid[0:hh, 0:ww]
    leaf = (np.sin(xx * 1.7) * np.sin(yy * 1.3) > 0)[..., None]
    canopy[: hh // 2] = np.where(leaf[: hh // 2], [0.10, 0.35, 0.12], [0.25, 0.65, 0.30])
    assert netting_faces(canopy, vvv, lift, [(0.0, 20.0)]) < GREEN_MAX
    teal = wall.copy()  # 青绿色的网
    teal[hh // 4: hh // 2] = [0.15, 0.60, 0.45]
    assert netting_faces(teal, vvv, lift, [(0.0, 20.0)]) > GREEN_MAX
    # 复审修正：没贴图的平灰面不算照片；有颗粒的灰墙算
    flatc = np.full((30, 30, 3), 95, np.uint8)
    dep0 = np.zeros((30, 30), np.float32)
    assert not strip_valid(flatc, dep0).any()
    noisy = np.clip(flatc.astype(int) + rng.integers(-6, 7, (30, 30, 1)), 0, 255).astype(np.uint8)
    assert strip_valid(noisy, dep0).mean() > 0.9
    # 树冠：低处有明暗斑的绿 → 是；高处、均匀绿漆 → 不是；补成同一行的墙色
    hh2, ww2 = int(30 * ACC_PX_M), int(12 * ACC_PX_M)
    lift2 = 30.0 - (np.arange(hh2) + 0.5) / ACC_PX_M
    yy2, xx2 = np.mgrid[0:hh2, 0:ww2]
    facade = np.where((np.mod(yy2, int(3 * ACC_PX_M)) < int(1.2 * ACC_PX_M))[..., None], [0.2, 0.22, 0.25], [0.7, 0.68, 0.62])
    leafc = facade.copy()
    blob = (lift2[:, None] < 12) & (xx2 < ww2 // 2)
    leafc[blob] = np.where((np.sin(xx2 * 1.9) * np.sin(yy2 * 1.4) > 0)[blob][:, None], [0.12, 0.32, 0.1], [0.3, 0.6, 0.25])
    vv2 = np.ones((hh2, ww2), bool)
    lm = leafy_mask(leafc, vv2, lift2)
    assert lm[blob].mean() > 0.8 and lm[lift2 > 20].sum() == 0, lm[blob].mean()
    paintg = facade.copy()
    paintg[blob] = [0.3, 0.6, 0.25]
    inner = blob & (xx2 < ww2 // 2 - int(1.5 * ACC_PX_M)) & (lift2[:, None] < 10.5)
    assert leafy_mask(paintg, vv2, lift2)[inner].mean() < 0.05
    fixed, vfix = inpaint_rows(leafc, vv2, lm, [(0.0, 12.0)])
    assert vfix.all() and np.abs(fixed[blob] - facade[blob]).mean() < 0.08, np.abs(fixed[blob] - facade[blob]).mean()
    # 玻璃去噪：孤立的玻璃斑点去掉、窗里的小缝补上；幕墙面里低饱和的「倒影」算玻璃
    gn = np.zeros((60, 60))
    gn[30, 30] = 1.0
    gn[10:20, 10:20] = 1.0
    gn[15, 15] = 0.0
    cg = clean_glass(gn, np.zeros((60, 60, 3)) + 0.6, v, [(0.0, 10.0)])
    assert cg[30, 30] < 0.3 and cg[15, 15] > 0.7 and cg[12, 12] > 0.7
    cw = np.ones((120, 120)) * 0.9
    cw[40:70, 40:70] = 0.1
    rgbw = np.zeros((120, 120, 3)) + [0.55, 0.58, 0.62]
    assert clean_glass(cw, rgbw, np.ones((120, 120), bool), [(0.0, 20.0)])[55, 55] >= 0.8
    # 紧凑装箱：相距 1 km 的两栋不进同一页
    pg2 = Pages(None)
    r1 = pg2.place([(100, 100)], [0.0, 0.0, 20.0, 20.0])
    r2 = pg2.place([(100, 100)], [1000.0, 0.0, 1020.0, 20.0])
    r3 = pg2.place([(100, 100)], [30.0, 30.0, 50.0, 50.0])
    assert r1[0][0] != r2[0][0] and r3[0][0] == r1[0][0], (r1, r2, r3)
    # 裁边：外包框与偏移
    al = np.zeros((40, 50), np.uint8)
    al[10:30, 5:45] = 255
    cp = crop_piece(np.zeros((40, 50, 3)), al)
    assert cp is not None and cp[1:] == (5, 10) and cp[0].shape == (20, 40, 4)
    assert crop_piece(np.zeros((40, 50, 3)), np.zeros((40, 50), np.uint8)) is None
    print("selftest ok")


def log(msg: str) -> None:
    import resource
    peak = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss / 1024
    print(f"[{time.strftime('%H:%M:%S')}] {msg}（RSS {rss_mb():.0f} MB，峰值 {peak:.0f} MB）", flush=True)


def project_all(order: list[dict], cache: pathlib.Path, zip_dir: pathlib.Path | None, plans: list[dict], tg: Targets,
                bbox: tuple[float, float, float, float], zones: list[dict], origin: tuple[float, float]) -> None:
    """逐幅：（后台线程顺序下载，同一时刻只有一条连接）→ 投影 → 立即写这一幅的缓存 → 删 zip → 清空缓冲。
    已有 done.json 的幅跳过；中断后重跑从断点继续（下载按 Range 续传）。"""
    import queue
    import threading
    todo = [s for s in order if not (sheet_dir(cache, s) / "done.json").exists()]
    for s in order:
        if s not in todo:
            log(f"  {s['sheet']}（{s['revision']}）已有缓存，跳过")
    local = {s["sheet"]: zip_dir / f"{s['sheet']}.zip" for s in todo
             if zip_dir is not None and (zip_dir / f"{s['sheet']}.zip").exists()}
    remote = [s for s in todo if s["sheet"] not in local]
    zdir = cache / "zips"
    zdir.mkdir(parents=True, exist_ok=True)
    q: "queue.Queue" = queue.Queue(maxsize=1)

    def worker() -> None:
        try:
            for k, s in enumerate(remote):
                if k:
                    time.sleep(PAUSE_S)  # 下载口合理使用：幅间停顿
                t0 = time.time()
                path = fetch_zip(s, zdir, log)
                q.put((s, path, time.time() - t0, True))
        except BaseException as e:  # noqa: BLE001 —— 交给主线程抛出
            q.put(e)
            return
        q.put(None)

    def run(s: dict, path: pathlib.Path, dl_s: float, delete: bool) -> None:
        sha, n = file_sha256(path)
        t1 = time.time()
        st = {"outside": 0, "sensitiveModels": 0, "wallPx": 0, "roofPx": 0}
        models = process_zip(path, tg, bbox, zones, origin, st)
        sd = sheet_dir(cache, s)
        save_sheet(sd, plans, {"sheet": s["sheet"], "revision": s["revision"], "urlNoKey": s["urlNoKey"], "sha256": sha,
                               "bytes": n, "stats": st, "models": models,
                               "downloadS": round(dl_s), "projectS": round(time.time() - t1)})
        log(f"  {s['sheet']}（{s['revision']}）{n} B sha256 {sha[:12]} 下载 {dl_s:.0f} s、投影 {time.time() - t1:.0f} s；"
            f"{len(models)} 模型 {st}")
        reset_targets(plans)
        if delete:
            path.unlink()

    th = threading.Thread(target=worker, daemon=True) if remote else None
    if th:
        th.start()
    for s in todo:
        if s["sheet"] in local:
            run(s, local[s["sheet"]], 0.0, False)
    while th:
        item = q.get()
        if item is None:
            break
        if isinstance(item, BaseException):
            raise item
        run(*item)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--cache", default=None, help="逐幅缓存根目录（必需；不在仓库里）")
    ap.add_argument("--zip-dir", default=None, help="开发用：目录里有 <图幅>.zip 就直接用（不下载、不删除）")
    ap.add_argument("--sheets", default=None, help="开发用：只处理这些图幅（逗号分隔）")
    ap.add_argument("--project-only", action="store_true", help="只下载 + 投影，不打包")
    ap.add_argument("--finalize-only", action="store_true", help="不联网：只用缓存里已投影的图幅打包")
    ap.add_argument("--allow-missing", action="store_true", help="开发用：有图幅还没投影也照样打包")
    ap.add_argument("--out", default=None, help="开发用：输出根目录（写 DIR/facades/ 与 DIR/landsd-3dvm-facades.json.gz，不碰仓库）")
    ap.add_argument("--workers", type=int, default=3, help="打包时并行烘焙的子进程数（每个约 0.5–1.5 GB 常驻内存）")
    ap.add_argument("--review", default=None, help="把人工复查用的联系表（每张 48 栋）写到此目录（不在仓库里）")
    ap.add_argument("--selftest", action="store_true")
    args = ap.parse_args()
    if args.selftest:
        selftest()
        return
    if not args.cache:
        raise SystemExit("需要 --cache DIR")
    cache = pathlib.Path(args.cache)
    cache.mkdir(parents=True, exist_ok=True)
    city = json.loads((CITY_DIR / "central.json").read_text(encoding="utf-8"))
    relief = Relief((CITY_DIR / "terrain.bin").read_bytes())
    meta = city["meta"]
    origin = (meta["origin"]["e"], meta["origin"]["n"])
    bbox = data_bbox(meta)
    zones = city["zones"]["sensitive"]
    plans, sens = plan_city(city, relief)
    tg = Targets(plans, origin)
    idx_path = cache / "index.json"
    if args.finalize_only:
        index = json.loads(idx_path.read_text(encoding="utf-8"))
    else:
        index = sheet_index(bbox)
        log(f"范围 E {bbox[0]:.0f}–{bbox[2]:.0f} N {bbox[1]:.0f}–{bbox[3]:.0f}：{len(index)} 幅（投影指纹 {proj_fingerprint()}）")
        idx_path.write_text(json.dumps([{k: v for k, v in s.items() if k != "url"} for s in index], indent=1), encoding="utf-8")
    if args.sheets:
        want = set(args.sheets.split(","))
        index = [s for s in index if s["sheet"] in want]
    if not args.finalize_only:
        # 先做离数据范围中心近的幅（中途就能看到核心区的效果）；产物与处理顺序无关
        mx, my = (bbox[0] + bbox[2]) / 2, (bbox[1] + bbox[3]) / 2
        order = sorted(index, key=lambda s: (math.hypot(s["cx"] - mx, s["cy"] - my), s["sheet"]))
        project_all(order, cache, pathlib.Path(args.zip_dir) if args.zip_dir else None, plans, tg, bbox, zones, origin)
        if args.project_only:
            return
    # ---- 打包：按图幅号顺序读各幅 done.json；每栋楼只在烘焙它时才把各幅缓存合进来，用完即放
    sheets: list[dict] = []
    key_dirs: dict[str, list[pathlib.Path]] = {}
    model_tris: dict[str, int] = {}
    stats = {"models": 0, "triangles": 0, "outside": 0, "duplicate": 0, "sensitiveModels": 0, "wallPx": 0, "roofPx": 0}
    missing = []
    for s in sorted(index, key=lambda s: s["sheet"]):
        sd = sheet_dir(cache, s)
        if not (sd / "done.json").exists():
            missing.append(s["sheet"])
            continue
        done = json.loads((sd / "done.json").read_text(encoding="utf-8"))
        if done.get("fingerprint") != proj_fingerprint():
            raise SystemExit(f"{s['sheet']}：缓存指纹不符")
        sheets.append({k: done[k] for k in ("sheet", "revision", "urlNoKey", "sha256", "bytes")})
        for k in done["keys"]:
            key_dirs.setdefault(k, []).append(sd)
        for mid, nt in done["models"].items():
            if mid in model_tris:
                stats["duplicate"] += 1
            else:
                model_tris[mid] = nt
        for k in ("outside", "sensitiveModels", "wallPx", "roofPx"):
            stats[k] += done["stats"][k]
    if missing and not args.allow_missing:
        raise SystemExit(f"这些图幅还没投影：{missing}（--allow-missing 可强行打包）")
    stats["models"] = len(model_tris)
    stats["triangles"] = sum(model_tris.values())
    if missing:
        stats["missingSheets"] = missing
    stats.update({"buildingsTextured": 0, "floorsDetected": 0, "buildings": len(plans), "sensitiveBuildings": len(sens)})
    if args.out:
        root = pathlib.Path(args.out)
        fdir = root / FACADE_DIR
        raw = root
    else:
        fdir = CITY_DIR / FACADE_DIR
        raw = RAW
    fdir.mkdir(parents=True, exist_ok=True)
    # 只删本脚本自己的页（p*.webp、far*.webp）：同目录还有 R4 高清街面层的 h*.webp（landsd_3d_hires_bake.py）
    for old in [*fdir.glob("p*.webp"), *fdir.glob("far*.webp")]:
        old.unlink()
    log(f"打包：{len(sheets)} 幅、{len(key_dirs)} 栋有投影")
    result = finalize(plans, meta["bbox"], fdir, stats,
                      load=lambda bp: merge_building(bp, key_dirs.get(bp["key"], [])), free=free_building, workers=args.workers,
                      review=pathlib.Path(args.review) if args.review else None)
    write_outputs(result, sheets, stats, sens, raw, update=not args.out)
    log("完成")

if __name__ == "__main__":
    sys.exit(main())
