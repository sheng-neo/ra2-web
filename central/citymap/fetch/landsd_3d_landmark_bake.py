"""一次性烘焙（R5 真实地标，负责人 D5，2026-11-27）：地政总署「可視化三維地圖（個別模型）」带照片纹理的六座地标原型
→ 我们自己的紧凑网格（近景 HIGH 每座一个、远景 LOW 六座合一个）+ 一张重新展开、去日照的照片图集
（GPU 压缩的 BC3 全 / 半分辨率与 ETC2 半分辨率，外加 WebP 半 / 四分之一分辨率作后备）。

用法（Python 3.11+；numpy、Pillow（带 WebP 编码）、scipy、fast-simplification 0.2.0（QEM 减面））：
    python -I central/citymap/fetch/landsd_3d_landmark_bake.py --src DIR              # 烘焙并写产物（覆盖旧产物）
    python -I central/citymap/fetch/landsd_3d_landmark_bake.py --src DIR --out D      # 写到别处（不碰仓库，调参用）
    python -I central/citymap/fetch/landsd_3d_landmark_bake.py --src DIR --debug D    # 另写调试图（图集、玻璃度、特征）
    python -I central/citymap/fetch/landsd_3d_landmark_bake.py --selftest             # 纯函数自测
    python -I central/citymap/fetch/landsd_3d_landmark_bake.py --quarter              # 只从仓库里的半分辨率图集派生四分之一分辨率
                                                                                       # 的两份（不需要 --src、不联网，R4 + R5 整合复审修正）
本轮实际运行环境：Python 3.13.x、numpy 2.5.5、Pillow 13.0.0、scipy 1.18.1、fast-simplification 0.2.0（另装在一个 venv 里，
管线与客户端都不需要 Python）。单线程，R5b 修正二后实测 412–416 s（约 7 分钟），峰值常驻内存约 2.15 GB（每 2 s 取样；主要是解码后的
源贴图 mip，按地标释放）。

输入（--src，自己的可信目录；不联网）：DIR/<地标 id>/<模型号>/<模型号>.gltf + .bin + 贴图（JPG / PNG），即从地政总署
「3D Visualisation Map (Individualised models)」逐幅 zip（11-SW-8B、11-SW-14A、11-SW-8D、11-SW-9C，与 R3 同一批下载、
sha256 与 data-raw/landsd/sources.json 里 R3 的 derivedFrom 记录一致）只解出这六座原型楼（与 neon-centre 原型的附楼）的 BUILDING 目录。
下载口的 key 每次从 CSDI 图幅索引读，从不写进任何文件；本脚本不联网、不读 key。解出的文件是不受信任的数据：
只按 glTF 规定读 JSON、.bin 与图片（文件名只许同目录的普通名字，图片解码设像素上限），不执行其中任何东西。
另读管线产物 client/public/city/central.json（地标轮廓、楼底、敏感区）与 terrain.bin（地形，按客户端 10 m 渲染网格同一规则插值）。

做法（全部确定性：同一输入逐字节同一输出）：
1. 读网格：只取不透明的三角形（BLEND 材质的玻璃顶棚、栏杆贴片不要）；glTF（Y 向上、Z = −北）→ HK1980 再减本地原点
   (834000, 816000) → 模拟坐标米（x 东、y 北、z = mPD）。模型照原样摆放（六座的平面偏差都 ≤ 0.75 m，不平移）。
2. 清理（按 1 cm 焊接后的连通块）：
   - 独立雕塑：近地（底 < 楼底 + 3 m）、平面外包 < 6 m、> 2000 个三角形的块（只命中 steel-frame 原型广场上的两只铜狮）——不复刻雕塑（PLAN §1）；
   - 碎件：外包对角线 < 1.5 m 的块（prism-tower 原型入口约 100 个 0.2–1.1 m 的小装饰等）；
   - 附属：块顶 < 楼底 + 40 m、质心在轮廓外 > 3 m 的块，以及同样位置的单个三角形（harbour-spire 裙楼的玻璃雨篷与屋檐、
     porthole-house 的行人天桥连接段与台阶）——城市里已有裙楼与天桥；高处伸出轮廓的结构（steel-frame 的桅杆、prism-tower 与 neon-centre 外挑的立面）照留；
   - 敏感区：任一顶点在敏感区里的三角形一律删掉（本轮六座都是 0 个，最近的 steel-frame 离政府区 27.5 m）；
   - 开敞广场（steel-frame，spec["plaza"]，见 open_plaza）：原型模型把两座服务塔之间的地面广场四边用墙封住了，删掉底腹以下的部分。
3. 近景 HIGH：fast-simplification 只按位置减面到每座的预算（见 LANDMARKS），再按楼底 + 30 m 横切一刀（街面带单独展开、密度更高）。
   远景 LOW：同一份清理后的网格减到很低的预算（六座合计约 1 万个三角形），也是 HIGH 档 450 m 外的远景与水面倒影里的地标；
   steel-frame 不减面而是按近景网格重建 2.5 维体块、桅杆画成长方体（lowMassing，见 massing_low；复审 R5b 修正二）。
   墙脚：离地 < 0.8 m 的顶点一律压到周围 3 m 内最低地面以下 0.6 m（不悬空、不露缝）。
4. 展开：HIGH 网格按「共面」分块（法线 ≤ 20°、离种子平面 ≤ 0.35 m、同一高度带，区域生长，种子按面积从大到小），
   墙块 u 水平、v 向上（楼层线就是图集里的横行），屋面块按东西向展开；块按密度（街面带 STREET_K 倍）
   放进 ATLAS × ATLAS 的图集（天际线装箱，PAD px 外延边；最小外接矩形能省 ≥ 15 % 时块先转过来）；放不下就整体降密度重来。
   先按 1 px/m 粗烘一遍看照片覆盖率：太小（< MIN_CHART_PX 个纹素或短边 < MIN_SIDE_PX）或覆盖率 < 0.3 的块不进图集，用顶点色。
5. 烘焙：每个块在自己的平面上按工作分辨率（图集密度 × 超采样）前向栅格化源三角形（朝向夹角 < 60°、离块平面 ±0.6 m，
   多层取最外面的一层），源贴图按足迹选 mip（JPEG 在 DCT 域缩小解码）双线性取样；再盒式缩回图集密度。
   后处理（照搬 R3 的做法并按地标调）：纯黑填充与地政总署没贴图的平灰当作无照片、小洞推拉填补、去日照（约 24 m 尺度的低频亮度
   向整座的中位数部分归一）、玻璃分类（R3 的 glass_mask + clean_glass）→ alpha 通道（0 实墙 … 255 玻璃）。
   prism-tower 塔身（墙与斜的三角锥面）：白色铝包结构件（又亮又不饱和、比周围亮，闭开运算后长度 ≥ 6 m）先找出来，再用 Hough 变换取直
   （玻璃度：中线 1.2 m 内的构件 0.4、其余一律玻璃 1）；中线线段换成三维的 LED 线（见第 6 步）；最终的线定下来以后，
   结构件块的玻璃度按线重画（线两侧 0.6 m 是铝包结构件，见 member_bands）。
   「curtain」规则：mirror-block 12 m 以上、harbour-spire 30 m 以上、steel-frame 南北立面 12 m 以上的墙一律算玻璃（照片里的反光太花）。
6. 夜景用的网格属性（客户端 render/landmarks/material.ts 按这些画夜景，不另存掩膜图）：
   - 楼层：整座的层高与楼层线相位（塔身墙块玻璃度的竖向剖面自相关，R3 detect_floors），写进清单；
   - 竖梃：每个墙块的竖梃间距（水平剖面自相关，默认 0.9–3.2 m，porthole-house 2.0–4.6 m；没有规律就用整座的中位数）与相位，
     顶点上存「相位对齐的 u」（cm）；楼层也逐块检测（加权中位数 + 圆均值相位），比整座一条剖面稳；
   - 特征号（每块一个，按 LANDMARKS 里的高度带 / 朝向 / 本地框规则）：冠顶泛光、白光 LED 构件、楼层灯带、冠顶阶梯、尖顶、竖梃节点灯、
     桁架、桅杆紫光环、泛光外墙、大堂、广场底腹、红光楼梯间……（见 FEATURE）；
   - LED 线（特征 line，见 line_quads / extra_lines）：prism-tower 的 Hough 中线（只留结构件该有的方向与长度）+ 三角锥外凸棱、
     steel-frame 桁架构件的长轴中线（宽 TRUSS_LINE_W）与几条红竖线（RED_VERTICAL_W）、neon-centre 冠顶阶梯的外凸水平棱；
     每段 4 个顶点写进 HIGH 网格，≥ LOW_LINE_MIN 的也写进 LOW；
   - 发光芯（harbour-spire 冠顶，crown_core）：特征 crown、网格第 4 分量 = 1。
7. 产物：client/public/city/landmarks/（文件名带内容哈希前 8 位）：lmh-<id>-*.bin（每座 HIGH）、lml-*.bin（六座 LOW）、
   图集（RGB = 去日照的反照率 sRGB、alpha = 玻璃度）：lmt-bc3-*.bin（CLTX，BC3 / DXT5，ATLAS² 带整条 mip，桌面 HIGH）、
   lmt-bc3h-*.bin（同上半分辨率）、lmt-etch-*.bin（ETC2 RGBA8 EAC 半分辨率，手机）、lmt-bc3q-*.bin / lmt-etcq-*.bin
   （BC3 / ETC2 四分之一分辨率，LOW 档：就是半分辨率文件去掉最大一级 mip，逐字节等于 cltx(fmt, chain[2:])）、lma-h-*.webp / lma-q-*.webp
   （半 / 四分之一分辨率 WebP，GPU 不支持压缩格式时的后备）；BC3 / ETC2 编码器是本文件里的 numpy 实现，与 GPU 解码逐位核对过；
   data-raw/landsd/landsd-3dvm-landmarks.json.gz：文件清单与 sha256、每座的模型号、图幅、三角形数、层高 / 相位、外包盒、航空障碍灯位置、
   清理统计；sources.json 里追加 / 更新这一条。管线（src/stages/landmark-meshes.ts）只校验 sha256 并把引用接到 LandmarkPlacement.mesh。
   不写入任何名称（清单只有地标 id 与地政总署模型号），也不写源网格原文或原始贴图：只有减过面、重新展开并重采样的派生数据。

二进制网格格式（小端，CLMK v1）：48 字节头（'CLMK'、版本 u16、标志 u16（bit0 = 32 位索引）、顶点数 u32、索引数 u32、
three 坐标的反量化偏移 f32×3 与跨度 f32×3、保留 8 字节），之后依次是：位置 u16×4（归一化；第 4 个为 0）、法线 i8×4（归一化）、
图集 uv u16×2、uv 夹取框 u16×4（u0, v0, u1, v1；全 0 = 不取图集、用顶点色）、顶点色 u8×4（sRGB 反照率 + 玻璃度）、
立面 i16×2（相位对齐的水平坐标 cm、第 2 分量平时为 0，steel-frame 红光楼梯间的块是条带坐标：离条带中线 / 半宽 × 1000）、网格 u8×4（竖梃间距 2 cm 单位、特征号、地标序号（按 id 排序，与 central.json 的 landmarks 同序）、保留），最后是索引（u16 / u32，补齐到 4 字节）。
LED 线顶点（特征 line）另作解释：法线 = 线方向、法线第 4 分量 = 左右（±127）；立面 = (沿线 cm, 线宽 mm)；网格第 4 分量 = 颜色号（LINE_COLOURS）。
冠顶发光芯顶点：网格第 4 分量 = 1。
three 坐标 = (x, z, −y)（与 client/src/coords.ts 相同）。
"""

import argparse
import gzip
import hashlib
import io
import json
import math
import pathlib
import posixpath
import struct
import sys
import time
import urllib.parse

import numpy as np
from PIL import Image

# 解码上限（解出的贴图是不受信任的数据）
Image.MAX_IMAGE_PIXELS = 16384 * 16384

ROOT = pathlib.Path(__file__).resolve().parent.parent
RAW = ROOT / "data-raw" / "landsd"
CITY_DIR = ROOT.parent / "client" / "public" / "city"
OUT_FILE = "landsd-3dvm-landmarks.json.gz"
OUT_DIR = "landmarks"
DATASET_ID = "landsd_rcd_1671676915450_88604"
PORTAL = "https://portal.csdi.gov.hk"
FACADES_FILE = "landsd-3dvm-facades.json.gz"
TERMS = "CSDI Portal Terms and Conditions of Use + 3D Spatial Data Portal terms (see TERMS.md sections 7, 8)"
ATTRIBUTION = ("Contains data from the Lands Department, HKSAR Government (3D Visualisation Map, Individualised models), "
               "obtained from the CSDI Portal; remeshed, re-textured and resampled for this game; the Government is not responsible "
               "for, and does not endorse, this game.")
ORIGIN_E, ORIGIN_N = 834000.0, 816000.0

ATLAS = 2048           # 图集布局（全分辨率边长）；半分辨率 = 1024、四分之一 = 512
PAD = 4                # 外延边（全分辨率 px；半分辨率 2、四分之一 1）
STREET_M = 30.0        # 街面带：楼底以上 30 m 内的块单独展开
STREET_K = 2.5         # 街面带的纹素密度倍数
WORK_PX_M = 8.0        # 烘焙工作分辨率下限（px/m），超采样倍数 = ceil(WORK_PX_M / 图集密度)，最多 4
MAX_SS = 4
DEPTH_M = 0.6          # 源三角形离块平面的窗口（m）
CHART_COS = math.cos(math.radians(20.0))
CHART_DIST = 0.35
MIN_CHART_PX = 64      # 小于这么多纹素（或短边 < MIN_SIDE_PX）的块不进图集，用顶点色
MIN_SIDE_PX = 4
ANALYSIS_PX_M = 10.0   # 楼层 / 竖梃检测的取样分辨率（px/m），每个大墙块只取一个窗口
ANALYSIS_WIN = (40.0, 60.0)
BASE_LIFT = 0.8        # 离地多少以内的顶点算墙脚
BASE_SINK = 0.6        # 墙脚压到最低地面以下多少
WEBP_Q = 86
LOW_UV_COS = math.cos(math.radians(25.0))
LOW_UV_DIST = 2.5

# 特征号（与 client/src/render/landmarks/material.ts 的 FEATURE 一致）
FEATURE = {
    "facade": 0,    # 照片立面 + 写字楼窗灯
    "plain": 1,     # 结构 / 机房 / 屋面设备：只有照片反照率，不亮窗
    "crown": 2,     # 冠顶泛光（白，自下而上渐弱）
    "led": 3,       # 白光 LED 结构线：实墙像素（1 − 玻璃度）发光
    "bands": 4,     # 每层一道蓝色 LED 灯带（玻璃立面）
    "spire": 5,     # 尖顶 / 桅杆：品红灯泡
    "dots": 6,      # 竖梃节点点阵白光
    "truss": 7,     # 桁架：实墙像素红光
    "mast": 8,      # 桅杆：实墙像素每层一圈紫光环
    "flood": 9,     # 泛光外墙（冷白，自下而上渐弱）+ 圆窗
    "lobby": 10,    # 大堂 / 街面玻璃：玻璃后面一间有天花筒灯的大堂（着色器里按视线算），或（steel-frame）亮着的扶梯玻璃
    "edge": 11,     # 屋顶边一道白光线
    "belly": 12,    # steel-frame 广场顶上的玻璃底腹：冷白透光，凹进去的扶梯口更亮
    "redcore": 13,  # steel-frame 西服务塔的北 / 南面：楼梯间的红光（窄条，见 LANDMARKS 的 redcore）
    "line": 14,     # LED 线（不是网格面，是线段：着色器把每段画成朝向相机、宽 ≥ 1 px 的细条，见 LINE_COLOURS）
    "ctier": 15,    # neon-centre 冠顶的阶梯与尖帽：比塔身亮的蓝紫光
}
# LED 线的颜色号（网格属性 grid.w，客户端 material.ts 的 LINE_COLOURS）与宽度（m）
LINE_COLOURS = {"white": 0, "red": 1, "violet": 2, "tier": 3}
LINE_W = 0.3
# steel-frame 的红线（复审 R5b 修正二）：2019 北立面照片里衣架桁架的构件整根亮成粗的深红光条（约占立面 4.6 %），桅杆内侧腿与吊杆的红竖线也粗；
# 0.3 m 的细线远看成了粉红的发丝线（约 1.2 %）
TRUSS_LINE_W = 0.9
RED_VERTICAL_W = 0.6
LINE_LIFT = 0.08   # 线段沿所在面的法线外移（m），免得与面共面闪烁
LOW_LINE_MIN = 8.0  # 远景网格只收这么长以上的 LED 线（m）
HOUGH_MAX_LINES = 40  # prism-tower 每个结构件块最多取几条 Hough 直线（试过 80：大块上多取到的多是倒影拼出的短斜线，结构件并没有多取到）

# 每座地标：模型号（只取主楼；neon-centre 原型的附楼与城市里的 4ee3099519 是同一座裙楼，不要）、图幅、HIGH / LOW 预算、
# 层高 / 竖梃的兜底值（检测不到时用）、特征规则（按高度 z（mPD）、离楼底高度 h、法线 n 判断，先中先得）。
LANDMARKS = [
    # harbour-spire 的 HIGH 预算 30000：QEM 停在 34,185（开放边多，再压会把鳍片压坏；总预算不受影响）
    {"id": "harbour-spire", "models": ["B344541627001063A0"], "sheet": "11-SW-8B", "high": 30000, "low": 2000,
     "floor": 4.2, "mull": 1.5, "curtain": 30.0, "crownCore": {"zmin": 396.0, "shrink": 1.5, "tris": 160}, "flattenBase": True,
     "rules": [("crown", {"zmin": 396.0}), ("lobby", {"hmax": 12.0})]},
    {"id": "prism-tower", "models": ["B346831557701063A0"], "sheet": "11-SW-14A", "high": 8000, "low": 1200,
     "floor": 4.0, "mull": 1.5, "members": {"creaseZmax": 316.0},
     "rules": [("led", {"zmin": 318.0}), ("facade", {"hmax": 22.0}), ("led", {})]},
    # neon-centre：平面是一个方形，每面偏一侧凸出一个直角三角形的凸窗（两个窄面，上下两端收成尖）；本地轴转 frame = 11.4°
    #   （凸窗的两个面正对本地轴，主方形的面与轴成 45°）。每层的蓝光带只在凸窗的面上（"axial"：法线的本地分量 ≥ 0.94）——
    #   2019 山顶、2022 干诺道中、2024 尖沙咀三张夜景照片里都是一条条分开的亮竖条、顶上收尖，中间隔着暗的主方形立面
    #   （复审 R5b 修正二：原来每层的灯带绕满整圈、连到冠顶，成了一个均匀条纹的蓝紫盒子）；主方形的面（与凸窗以上的肩部）
    #   是普通的暗玻璃幕墙（curtain）加零星亮窗；279.5 mPD 以上是阶梯冠顶与尖帽（ctier），阶梯的外凸水平棱另画 LED 线（tierLines）；
    #   楼底取德辅道中一侧的地面，皇后大道中一侧高出约 10 m，那边的玻璃大堂在楼底以上 10–22 m：大堂按「离块下方街面 12 m 内」
    #   （"street"）而不是离楼底量（复审 R5b：原来那一段落到「立面」规则，照片里白天的倒影成了灰白斑块；直接把 hmax 加到 22
    #   会把德辅道中一侧大堂上面的实体也画成亮大堂，不行）
    {"id": "neon-centre", "models": ["B339821618801063A0"], "sheet": "11-SW-8D", "high": 5300, "low": 1500,
     "floor": 4.0, "mull": 1.5, "tierLines": {"zmin": 279.5, "zmax": 307.0, "minLen": 2.0}, "flattenBase": True,
     "frame": 11.4, "curtain": 25.0,
     "rules": [("spire", {"zmin": 318.0}), ("ctier", {"zmin": 279.5}), ("lobby", {"hmax": 12.0, "street": True}),
               ("bands", {"hmin": 25.0, "axial": 0.94})]},
    {"id": "mirror-block", "models": ["B345831563001063A0"], "sheet": "11-SW-9C", "high": 1500, "low": 600,
     "floor": 4.0, "mull": 1.5, "curtain": 12.0,
     "rules": [("edge", {"zmin": 286.0, "zmax": 289.6, "wall": True, "minarea": 20.0}), ("plain", {"zmin": 285.0}), ("lobby", {"hmax": 10.0}),
               ("dots", {"hmin": 20.0})]},
    # steel-frame：本地坐标轴转 −16°（e 沿东西立面、n 沿南北立面，单位 m，模拟坐标投影）；
    # plaza：两座服务塔之间的地面广场，原型模型在广场四边各有一道从地面到底腹（12.9 mPD）的封闭墙（实物是开敞的公共广场），
    #        按「大块、竖直、轴向、填充率高」的平面组删掉 cut 以下的部分（桅杆、扶梯玻璃筒、服务塔墙不动）；
    # masts：两排各四根桅杆的中心（本地 e、n）与半边长，桅杆框里的竖向块（腿与每层的连接箱）是「桅杆」；广场一层的桅杆腿
    #        （离楼底 9 m 以下）也是「桅杆」（复审 R5b：原来落到「立面」规则，圆柱的每个小块按照片各自分玻璃 / 实墙、亮窗，成了锯齿状的明暗条）；
    # redcore：西服务塔的红光楼梯间（2019 北立面照片右缘那条红色格栅：照片右边是西，旁边是西邻的 186 m 高楼与皇后像广场西侧的酒店）：
    #          只在最外面的北立面（本地 n ≈ faces[0]）与最外面的南立面（faces[1]，推断）上、zmin–zmax 之间；块里只有本地 e 在
    #          strip 之间的一条发红光：网格立面第 2 分量写「离条带中线 / 半宽 × 1000」，着色器按它切出条带（复审 R5b：原来整个服务塔的
    #          南北向面都红，连凹进去的几道面一起，占北立面约 16 %，西侧还多出三四条）。条带位置按 2019 照片里与网格共有的三条红竖线
    #          （e 525.8 / 541.8 / 557.2）定标：格栅宽约 4.2 m（连外框约 5.5 m）、东沿离西桅杆内侧腿约 11 m（复审 R5b 修正二：
    #          原来 509.6–516.4 宽 6.8 m、东沿往东多出 2 m 贴到了西桅杆上）；
    # protect：广场一层（桅杆腿、扶梯、底腹）不与上面的楼一起减面（ratio 1 = 只焊接、不减）：一起压时细长的桅杆腿被压成锯齿状的
    #          碎片（复审 R5b，德辅道中电车上看得到；单独减到 0.6 也已经出锯齿）；本地框里 z 以下的源三角形切出来另算，上面部分从 z 切、
    #          下面部分切到 z + overlap，两部分在 overlap 一段重叠（上面减面后边界的小缝被下面那段盖住）；HIGH 预算 45000 → 49000
    #          （多出来的约 4,200 个三角形就是广场一层保留的源网格，上面的楼减面的程度与原来相同）；
    # redVerticals：南北立面上沿两排桅杆内侧腿与中间吊杆的红色竖线（本地 e；前后位置按网格量；从 zmin mPD 到自下第 upToBand+1 条
    #               桁架带的顶，2019 照片里红竖线只在最低两道桁架之间与其下）；
    # lowMassing：远景不减面，按近景网格重建体块、桅杆画成长方体（massing_low；复审 R5b 修正二：顶点聚类压出来的远景网格里
    #             桅杆是鼓起来的楔形、立面上有斜的大黑三角形，LOW 档与 HIGH 档 450 m 外都看得到）；
    # boxes.hanger：南北立面正中吊杆在底腹上方的下端（源网格里一截约 1 m 宽的方柱），按「桅杆」画成泛光的钢（复审 R5b 修正二：
    #             原来一半是立面、一半是大堂与无特征，从德辅道中电车上看是红竖线下端吊着的一块黑方块）；红竖线也往下伸到 13 m
    #             （2019 北立面照片里中间那条红线一直亮到底腹）
    {"id": "steel-frame", "models": ["B344751569101063A0"], "sheet": "11-SW-8D", "high": 49000, "lowMassing": True,
     "floor": 4.4, "mull": 1.6, "curtain": 12.0, "curtainNS": True, "frame": -16.0,
     "plaza": {"box": [518.8, 565.2, -167.0, -116.6], "cut": 12.9, "minArea": 25.0, "minFill": 0.4, "minZspan": 3.0},
     "masts": {"e": [522.0, 561.0], "n": [-119.5, -134.5, -150.3, -163.8], "half": 5.2},
     "redcore": {"emin": 506.0, "emax": 519.0, "zmin": 30.0, "zmax": 172.0, "faces": [-116.1, -168.6], "faceTol": 1.0, "strip": [510.5, 514.7]},
     "protect": {"box": [516.0, 567.0, -170.0, -113.5], "z": 14.5, "overlap": 0.4, "ratio": 1.0},
     "trussLines": True, "redVerticals": {"e": [525.8, 541.8, 557.2], "halfWidth": 0.8, "zmin": 13.0, "upToBand": 1},
     "boxes": {"hanger": [[540.3, 543.8, -119.5, -113.0], [540.3, 543.8, -171.5, -165.0]]},
     "rules": [("belly", {"down": True, "in": "plaza", "zmax": 16.0}), ("mast", {"in": "hanger", "zmax": 19.0, "maxw": 4.0}),
               ("lobby", {"hmax": 12.0, "glass": True}),
               ("mast", {"in": "masts", "maxw": 6.5, "hmax": 9.0}),
               ("redcore", {"in": "redcore", "nsface": True}),
               ("truss", {"bands": "truss", "maxw": 20.0, "maxh": 15.0, "outside": 0.5, "nsflat": True}),
               ("mast", {"in": "masts", "maxw": 6.5, "hmin": 9.0}), ("facade", {})]},
    {"id": "porthole-house", "models": ["B344451602401063A1"], "sheet": "11-SW-8D", "high": 2700, "low": 1100,
     "floor": 3.6, "mull": 2.2, "mullRange": (2.0, 4.6),
     "rules": [("lobby", {"hmax": 9.0}), ("facade", {"hmax": 16.0}), ("flood", {"zmax": 171.5})]},
]
# steel-frame 的桁架带（mPD）：南北立面外挑结构的五层「衣架」桁架（从网格里外挑构件的高度直方图量得，见 truss_bands）
TRUSS_HALF_M = 4.5


def log(msg: str) -> None:
    print(msg, flush=True)


# ------------------------------------------------------------------------------------------------ 读 glTF（不受信任）

CT = {5120: np.int8, 5121: np.uint8, 5122: np.int16, 5123: np.uint16, 5125: np.uint32, 5126: np.float32}
NC = {"SCALAR": 1, "VEC2": 2, "VEC3": 3, "VEC4": 4, "MAT4": 16}


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


def safe_member(base: pathlib.Path, uri: str, exts: tuple[str, ...]) -> pathlib.Path:
    """只许同目录下的普通文件名（不解 data: URI、不跟相对路径）。"""
    u = urllib.parse.unquote(uri)
    if "/" in u or "\\" in u or u.startswith(".") or ":" in u or not u.lower().endswith(exts):
        raise ValueError(f"意外的 uri {uri!r}")
    p = base / u
    if not p.is_file():
        raise FileNotFoundError(p)
    return p


class Model:
    """一个带纹理的模型：tris (n,3,3) 模拟坐标米，uv (n,3,2)，img (n,) 图片序号；图片按 (序号, mip 级) 惰性解码。"""

    def __init__(self, d: pathlib.Path):
        gl = sorted(d.glob("*.gltf"))
        if len(gl) != 1:
            raise ValueError(f"{d}: 应有且只有一个 .gltf")
        doc = json.loads(gl[0].read_text(encoding="utf-8"))
        if doc.get("extensionsRequired"):
            raise ValueError("不支持的 glTF 扩展")
        self.name = gl[0].stem
        bufs = [safe_member(d, b["uri"], (".bin",)).read_bytes() for b in doc.get("buffers", [])]
        self.images = [safe_member(d, im["uri"], (".jpg", ".jpeg", ".png")) for im in doc.get("images", [])]
        tex_img = [t.get("source") for t in doc.get("textures", [])]
        nodes = doc.get("nodes", [])
        stack = [(i, np.eye(4)) for i in doc["scenes"][doc.get("scene", 0)]["nodes"]]
        T, U, I = [], [], []
        self.skipped_blend = 0
        while stack:
            ni, parent = stack.pop()
            node = nodes[ni]
            m = parent @ node_matrix(node)
            if "mesh" in node:
                for p in doc["meshes"][node["mesh"]]["primitives"]:
                    if p.get("mode", 4) != 4:
                        continue
                    mat = doc["materials"][p["material"]] if "material" in p else {}
                    idx = accessor(doc, bufs, p["indices"]).ravel().astype(np.int64) if "indices" in p else None
                    pos = accessor(doc, bufs, p["attributes"]["POSITION"])
                    if idx is None:
                        idx = np.arange(len(pos))
                    t = idx.reshape(-1, 3)
                    if mat.get("alphaMode") == "BLEND":
                        self.skipped_blend += len(t)
                        continue
                    bct = mat.get("pbrMetallicRoughness", {}).get("baseColorTexture")
                    img = -1
                    if bct and bct.get("texCoord", 0) == 0 and "TEXCOORD_0" in p["attributes"]:
                        img = tex_img[bct["index"]] if tex_img[bct["index"]] is not None else -1
                    pos = (np.c_[pos, np.ones(len(pos))] @ m.T)[:, :3]
                    uv = accessor(doc, bufs, p["attributes"]["TEXCOORD_0"])[:, :2] if img >= 0 else np.zeros((len(pos), 2))
                    T.append(pos[t])
                    U.append(uv[t])
                    I.append(np.full(len(t), img, np.int32))
            stack.extend((c, m) for c in node.get("children", []))
        t = np.concatenate(T) if T else np.zeros((0, 3, 3))
        # glTF Y 向上、Z = −北 → (E, N, mPD) → 模拟坐标米
        self.tris = np.stack([t[:, :, 0] - ORIGIN_E, -t[:, :, 2] - ORIGIN_N, t[:, :, 1]], axis=2)
        self.uv = np.concatenate(U) if U else np.zeros((0, 3, 2))
        self.img = np.concatenate(I) if I else np.zeros(0, np.int32)
        self._pyr: dict[tuple[int, int], np.ndarray] = {}
        self._size: dict[int, tuple[int, int]] = {}

    def size(self, k: int) -> tuple[int, int]:
        sz = self._size.get(k)
        if sz is None:
            with Image.open(self.images[k]) as im:
                sz = im.size
            self._size[k] = sz
        return sz

    def level(self, k: int, L: int) -> np.ndarray:
        """第 L 级 mip（边长 1/2^L，uint8 RGB）。JPEG 在 DCT 域按 1/2、1/4、1/8 解码，再不够小就盒式缩小。"""
        key = (k, L)
        im = self._pyr.get(key)
        if im is not None:
            return im
        with Image.open(self.images[k]) as src:
            w, h = src.size
            dl = min(L, 3)
            if dl and src.format == "JPEG":
                src.draft("RGB", (max(1, w >> dl), max(1, h >> dl)))
            img = src.convert("RGB")
        while img.size[0] > max(1, w >> L) * 1.5 and img.size[0] >= 2 and img.size[1] >= 2:
            img = img.reduce(2)
        im = np.asarray(img)
        self._pyr[key] = im
        return im

    def free(self) -> None:
        self._pyr.clear()


# ------------------------------------------------------------------------------------------------ 地形（客户端同一规则）

class Ground:
    """terrain.bin → 客户端渲染网格（每 2 个节点取 1 个，10 m）上的三角形线性插值（client/src/data/terrain.ts reliefHeight）。"""

    def __init__(self, path: pathlib.Path):
        b = path.read_bytes()
        if b[:4] != b"CTER":
            raise ValueError("terrain.bin 魔数不对")
        x0, y0 = struct.unpack_from("<ii", b, 8)
        cell, nx, ny = struct.unpack_from("<HHH", b, 16)
        h = np.frombuffer(b, "<i2", nx * ny, 24).reshape(ny, nx).astype(np.float64)
        step = 2
        rnx = math.ceil((nx - 1) / step) + 1
        rny = math.ceil((ny - 1) / step) + 1
        ii = np.minimum(np.arange(rnx) * step, nx - 1)
        jj = np.minimum(np.arange(rny) * step, ny - 1)
        self.h = h[jj][:, ii] / 10.0
        self.x0, self.y0, self.cell = x0 / 10.0, y0 / 10.0, cell * step / 10.0
        self.nx, self.ny = rnx, rny

    def __call__(self, x: np.ndarray, y: np.ndarray) -> np.ndarray:
        x = np.asarray(x, np.float64)
        y = np.asarray(y, np.float64)
        x1 = self.x0 + (self.nx - 1) * self.cell
        y1 = self.y0 + (self.ny - 1) * self.cell
        cx = np.clip(x, self.x0, x1)
        cy = np.clip(y, self.y0, y1)
        fx = (cx - self.x0) / self.cell
        fy = (cy - self.y0) / self.cell
        i = np.minimum(np.floor(fx).astype(np.int64), self.nx - 2)
        j = np.minimum(np.floor(fy).astype(np.int64), self.ny - 2)
        u = fx - i
        v = fy - j
        h00 = self.h[j, i]
        h10 = self.h[j, i + 1]
        h01 = self.h[j + 1, i]
        h11 = self.h[j + 1, i + 1]
        return np.where(u >= v, h00 + u * (h10 - h00) + v * (h11 - h10), h00 + v * (h01 - h00) + u * (h11 - h01))

    def low3(self, x: np.ndarray, y: np.ndarray, r: float = 3.0) -> np.ndarray:
        """周围 r m 内（9 点）的最低地面。"""
        out = self(x, y)
        for dx in (-r, 0.0, r):
            for dy in (-r, 0.0, r):
                if dx or dy:
                    out = np.minimum(out, self(x + dx, y + dy))
        return out


# ------------------------------------------------------------------------------------------------ 平面几何小工具

def ring_xy(flat: list[int]) -> np.ndarray:
    return np.asarray(flat, np.float64).reshape(-1, 2) / 10.0


def point_in(pts: np.ndarray, ring: np.ndarray) -> np.ndarray:
    """pts (N,2) 是否在环里（奇偶规则）。"""
    x, y = pts[:, 0], pts[:, 1]
    ins = np.zeros(len(pts), bool)
    for (xa, ya), (xb, yb) in zip(ring, np.roll(ring, -1, 0)):
        c = ((ya > y) != (yb > y)) & (x < (xb - xa) * (y - ya) / np.where(yb == ya, 1e-12, yb - ya) + xa)
        ins ^= c
    return ins


def ring_dist(pts: np.ndarray, ring: np.ndarray) -> np.ndarray:
    best = np.full(len(pts), np.inf)
    for a, b in zip(ring, np.roll(ring, -1, 0)):
        ab = b - a
        L = max(1e-12, float(ab @ ab))
        t = np.clip(((pts - a) @ ab) / L, 0, 1)
        best = np.minimum(best, np.linalg.norm(pts - (a + t[:, None] * ab), axis=1))
    return best


def outside_dist(pts: np.ndarray, ring: np.ndarray) -> np.ndarray:
    """到轮廓的距离，轮廓里为 0。"""
    d = ring_dist(pts, ring)
    return np.where(point_in(pts, ring), 0.0, d)


def frame_xy(spec: dict, xy: np.ndarray) -> np.ndarray:
    """模拟坐标 (…, 2) → 地标本地坐标 (e, n)：按 spec["frame"]（度）转过的东 / 北轴（没有就是原坐标）。"""
    a = math.radians(spec.get("frame", 0.0))
    E = np.array([math.cos(a), math.sin(a)])
    N = np.array([-math.sin(a), math.cos(a)])
    return np.stack([xy @ E, xy @ N], -1)


def clip_above(P: np.ndarray, UV: np.ndarray, z: float) -> list[tuple[np.ndarray, np.ndarray]]:
    """三角形 P (3,3)、uv (3,2) 在高程 z 以上的部分：0–2 个三角形（新顶点与 uv 按边线性插值）。"""
    above = P[:, 2] >= z
    if above.all():
        return [(P, UV)]
    if not above.any():
        return []
    poly = []
    for i in range(3):
        j = (i + 1) % 3
        if above[i]:
            poly.append((P[i], UV[i]))
        if above[i] != above[j]:
            t = (z - P[i, 2]) / (P[j, 2] - P[i, 2])
            poly.append((P[i] + (P[j] - P[i]) * t, UV[i] + (UV[j] - UV[i]) * t))
    return [(np.array([poly[0][0], poly[k][0], poly[k + 1][0]]), np.array([poly[0][1], poly[k][1], poly[k + 1][1]]))
            for k in range(1, len(poly) - 1)]


def open_plaza(src: dict, spec: dict) -> tuple[dict, dict | None]:
    """steel-frame：删掉原型模型里封住地面广场的墙（spec["plaza"]，见 LANDMARKS）。
    候选：本地框里、竖直（|nz| < 0.3）、朝向沿本地轴（|n·轴| > 0.9）、有一部分低于 cut 的三角形；按朝向轴与平面位置
    （排序后间隔 > 0.4 m 断开）分组；组里 cut 以下的面积 ≥ minArea、填充率（面积 /（水平长 × 高））≥ minFill、高 ≥ minZspan 的
    整组切掉 cut 以下的部分（以上的部分——底腹边缘的封檐——保留）。桅杆腿、扶梯玻璃筒是细长或斜向的，不会成组命中。"""
    pz = spec.get("plaza")
    if not pz:
        return src, None
    P = src["tris"]
    n, area = tri_normals(P)
    loc = frame_xy(spec, P.mean(1)[:, :2])
    nl = frame_xy(spec, n[:, :2])
    e0, e1, n0, n1 = pz["box"]
    cut = float(pz["cut"])
    cand = ((loc[:, 0] > e0) & (loc[:, 0] < e1) & (loc[:, 1] > n0) & (loc[:, 1] < n1) & (np.abs(n[:, 2]) < 0.3) &
            (P[:, :, 2].min(1) < cut - 0.05) & (np.abs(nl).max(1) > 0.9))
    drop: list[int] = []
    groups = 0
    for ax in (0, 1):
        ks = np.nonzero(cand & (np.abs(nl[:, ax]) > 0.9))[0]
        if not len(ks):
            continue
        off = loc[ks, ax]
        o = np.argsort(off, kind="stable")
        ks, off = ks[o], off[o]
        starts = np.r_[0, np.nonzero(np.diff(off) > 0.4)[0] + 1, len(ks)]
        for a, b in zip(starts[:-1], starts[1:]):
            g = ks[a:b]
            pl = frame_xy(spec, P[g][:, :, :2].reshape(-1, 2))[:, 1 - ax]
            zlo = float(P[g][:, :, 2].min())
            zspan = min(float(P[g][:, :, 2].max()), cut) - zlo
            below = 0.0
            for k in g:
                kept = sum(tri_normals(q[None])[1][0] for q, _ in clip_above(P[k], src["uv"][k], cut))
                below += float(area[k]) - kept
            length = float(pl.max() - pl.min())
            fill = below / max(length * max(zspan, 1e-3), 1e-3)
            if below >= pz["minArea"] and fill >= pz["minFill"] and zspan >= pz["minZspan"]:
                drop.extend(int(k) for k in g)
                groups += 1
    if not drop:
        return src, {"groups": 0, "tris": 0, "areaM2": 0.0}
    dset = np.zeros(len(P), bool)
    dset[drop] = True
    T, U, I, M = [src["tris"][~dset]], [src["uv"][~dset]], [src["img"][~dset]], [src["model"][~dset]]
    removed = 0.0
    for k in sorted(drop):
        parts = clip_above(P[k], src["uv"][k], cut)
        removed += float(area[k]) - sum(tri_normals(q[None])[1][0] for q, _ in parts)
        for q, uv in parts:
            T.append(q[None])
            U.append(uv[None])
            I.append(src["img"][k:k + 1])
            M.append(src["model"][k:k + 1])
    out = {"tris": np.concatenate(T), "uv": np.concatenate(U), "img": np.concatenate(I), "model": np.concatenate(M),
           "models": src["models"], "blend": src.get("blend", 0)}
    return out, {"groups": groups, "tris": len(drop), "areaM2": round(removed, 1)}


def weld(P: np.ndarray, q: float = 0.01) -> tuple[np.ndarray, np.ndarray]:
    """(n,3,3) 三角形 → (顶点, 面)；按 q m 量化焊接，丢掉退化面。顶点顺序 = 量化键的字典序（确定性）。"""
    key = np.round(P.reshape(-1, 3) / q).astype(np.int64)
    uk, inv = np.unique(key, axis=0, return_inverse=True)
    F = inv.reshape(-1, 3)
    V = uk.astype(np.float64) * q
    return V, F


def components(F: np.ndarray, nv: int) -> np.ndarray:
    """面 → 连通块号（按顶点相连）。"""
    import scipy.sparse
    import scipy.sparse.csgraph
    rows = np.concatenate([F[:, 0], F[:, 1], F[:, 2]])
    cols = np.concatenate([F[:, 1], F[:, 2], F[:, 0]])
    g = scipy.sparse.coo_matrix((np.ones(len(rows), np.int8), (rows, cols)), shape=(nv, nv))
    _, lab = scipy.sparse.csgraph.connected_components(g, directed=False)
    return lab[F[:, 0]]


def tri_normals(P: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    n = np.cross(P[:, 1] - P[:, 0], P[:, 2] - P[:, 0])
    a = np.linalg.norm(n, axis=1)
    return n / np.maximum(a, 1e-12)[:, None], 0.5 * a


# ------------------------------------------------------------------------------------------------ 1–2. 读入与清理

def load_landmark(src: pathlib.Path, spec: dict) -> dict:
    tris, uv, img, mi = [], [], [], []
    models = []
    blend = 0
    for k, mid in enumerate(spec["models"]):
        m = Model(src / spec["id"] / mid)
        models.append(m)
        blend += m.skipped_blend
        tris.append(m.tris)
        uv.append(m.uv)
        img.append(m.img)
        mi.append(np.full(len(m.tris), k, np.int32))
    return {"tris": np.concatenate(tris), "uv": np.concatenate(uv), "img": np.concatenate(img), "model": np.concatenate(mi),
            "models": models, "blend": blend}


def clean(src: dict, base: float, ring: np.ndarray, zones: list[np.ndarray]) -> tuple[dict, dict]:
    """去掉雕塑、碎件、轮廓外的低处附属、敏感区里的三角形。返回 (保留的源, 统计)。"""
    P = src["tris"]
    n0 = len(P)
    V, F = weld(P)
    comp = components(F, len(V))
    keep = np.ones(n0, bool)
    st = {"input": int(n0), "blendSkipped": int(src["blend"]), "sculptures": [], "fragments": 0, "fragmentTris": 0,
          "appendages": 0, "appendageTris": 0, "outsideTris": 0, "sensitiveTris": 0}
    order = np.argsort(comp, kind="stable")
    cs = comp[order]
    starts = np.r_[0, np.nonzero(np.diff(cs))[0] + 1, len(cs)]
    for a, b in zip(starts[:-1], starts[1:]):
        sel = order[a:b]
        p = P[sel].reshape(-1, 3)
        lo, hi = p.min(0), p.max(0)
        ext = hi - lo
        if lo[2] < base + 3 and max(ext[0], ext[1]) < 6 and len(sel) > 2000:
            keep[sel] = False
            st["sculptures"].append({"tris": int(len(sel)), "size": [round(float(v), 1) for v in ext],
                                     "at": [round(float(v), 1) for v in (lo + hi) / 2]})
            continue
        if float(np.linalg.norm(ext)) < 1.5:
            keep[sel] = False
            st["fragments"] += 1
            st["fragmentTris"] += int(len(sel))
            continue
        c = p.mean(0)
        if hi[2] < base + 40 and outside_dist(c[None, :2], ring)[0] > 3.0:
            keep[sel] = False
            st["appendages"] += 1
            st["appendageTris"] += int(len(sel))
    cen = P.mean(1)
    lowout = keep & (cen[:, 2] < base + 40) & (outside_dist(cen[:, :2], ring) > 3.0)
    st["outsideTris"] = int(lowout.sum())
    keep &= ~lowout
    sens = np.zeros(n0, bool)
    for z in zones:
        sens |= point_in(P.reshape(-1, 3)[:, :2], z).reshape(-1, 3).any(1)
    st["sensitiveTris"] = int((sens & keep).sum())
    keep &= ~sens
    _, area = tri_normals(P)
    keep &= area > 1e-6
    st["kept"] = int(keep.sum())
    out = {k: src[k][keep] for k in ("tris", "uv", "img", "model")}
    out["models"] = src["models"]
    return out, st


# ------------------------------------------------------------------------------------------------ 3. 减面、墙脚、横切

def decimate(P: np.ndarray, target: int) -> tuple[np.ndarray, np.ndarray]:
    import fast_simplification
    V, F = weld(P)
    F = F[(F[:, 0] != F[:, 1]) & (F[:, 1] != F[:, 2]) & (F[:, 0] != F[:, 2])]
    if len(F) > target:
        V, F = fast_simplification.simplify(V, F.astype(np.int64), target_count=int(target), agg=7.0)
        V = np.asarray(V, np.float64)
        F = np.asarray(F, np.int64)
    # 退化面与未用顶点
    P2 = V[F]
    _, a = tri_normals(P2)
    F = F[a > 1e-5]
    used = np.unique(F)
    remap = np.full(len(V), -1, np.int64)
    remap[used] = np.arange(len(used))
    return V[used], remap[F]


def decimate_low(P: np.ndarray, target: int) -> tuple[np.ndarray, np.ndarray, float]:
    """远景：先直接 QEM；碎块多、开放边多的模型（harbour-spire、steel-frame）QEM 卡在一两万个三角形，改用顶点聚类（顶点吸到格心）再 QEM，
    格从 1 m 起逐级放大到达标为止。返回 (顶点, 面, 聚类格 m；0 = 没有聚类)。"""
    import fast_simplification
    V, F = decimate(P, target)
    if len(F) <= target * 1.15:
        return V, F, 0.0
    for cell in (1.0, 1.5, 2.0, 2.5, 3.0, 4.0):
        key = np.floor(P.reshape(-1, 3) / cell).astype(np.int64)
        uk, inv = np.unique(key, axis=0, return_inverse=True)
        Vc = (uk.astype(np.float64) + 0.5) * cell   # 格心（取格内平均时 QEM 会卡住）
        Fc = inv.reshape(-1, 3)
        Fc = Fc[(Fc[:, 0] != Fc[:, 1]) & (Fc[:, 1] != Fc[:, 2]) & (Fc[:, 0] != Fc[:, 2])]
        srt = np.sort(Fc, 1)
        _, ui = np.unique(srt, axis=0, return_index=True)
        Fc = Fc[np.sort(ui)]
        _, a = tri_normals(Vc[Fc])
        Fc = Fc[a > 1e-4]
        V2, F2 = fast_simplification.simplify(Vc, Fc.astype(np.int64), target_count=int(target), agg=7.0)
        V2 = np.asarray(V2, np.float64)
        F2 = np.asarray(F2, np.int64)
        _, a = tri_normals(V2[F2])
        F2 = F2[a > 1e-5]
        if len(F2) <= target * 1.15:
            used = np.unique(F2)
            remap = np.full(len(V2), -1, np.int64)
            remap[used] = np.arange(len(used))
            return V2[used], remap[F2], cell
    return V, F, -1.0


def _rects(mask: np.ndarray) -> list[tuple[int, int, int, int]]:
    """二维布尔格 → 贪心的轴向长方形（行优先扫描、先横向再向下扩展）：[(j0, i0, j1, i1)]（含两端）。"""
    used = np.zeros_like(mask, bool)
    out = []
    H, W = mask.shape
    for j in range(H):
        i = 0
        while i < W:
            if not mask[j, i] or used[j, i]:
                i += 1
                continue
            i1 = i
            while i1 + 1 < W and mask[j, i1 + 1] and not used[j, i1 + 1]:
                i1 += 1
            j1 = j
            while j1 + 1 < H and mask[j1 + 1, i:i1 + 1].all() and not used[j1 + 1, i:i1 + 1].any():
                j1 += 1
            used[j:j1 + 1, i:i1 + 1] = True
            out.append((j, i, j1, i1))
            i = i1 + 1
    return out


def _quad(p0: np.ndarray, p1: np.ndarray, p2: np.ndarray, p3: np.ndarray, nrm: np.ndarray) -> np.ndarray:
    """四边形（按周长顺序的四个角）→ 两个三角形 (2,3,3)，绕向使叉积朝 nrm（three 的正面，材质里 gl_FrontFacing 要用）。"""
    T = np.array([[p0, p1, p2], [p0, p2, p3]], np.float64)
    if float(np.cross(T[0, 1] - T[0, 0], T[0, 2] - T[0, 0]) @ nrm) < 0:
        T = T[:, [0, 2, 1]]
    return T


def massing_low(V: np.ndarray, F: np.ndarray, drop: np.ndarray, spec: dict, ring: np.ndarray, zbot: float,
                cuts: list[float], boxes: list[tuple[float, float, float, float, float]], cell: float = 1.0,
                merge: float = 3.0, width: float = 15.0) -> list[dict]:
    """远景体块（spec["lowMassing"]，steel-frame；复审 R5b 修正二）：不再把源网格压到两三千个三角形（QEM 卡住后的顶点聚类
    把桅杆压成鼓起来的楔形、把立面的凹进处连成斜的大三角形，LOW 档与 HIGH 档 450 m 外都看得到），而是按近景网格的「楼体」
    重建一个 2.5 维体块：本地轴（spec["frame"]）上 cell m 的格，每格一个屋面高（朝上的面向下投影取最高）与一个底（广场框里取
    底腹朝下面的最低处，其余为 zbot）；drop 的面（桅杆、桁架、轮廓外 1 m 以上的外挑件）不算；轮廓里没投到的格按邻格补；
    屋面高按 0.5 m 取整、3×3 开闭运算去掉 1 m 以下的小件，相差 ≤ 1.5 m 的屋面高并成一级。
    输出：同一级屋面 / 底面的格贪心并成长方形（各 2 个三角形）；相邻格高低不同处出竖直墙（同一行、同一高度段的并成一长条），
    墙按 cuts（高程）与 ≤ 12 m 的宽度切片（每片单独配近景块取特征与颜色）；boxes 里每根桅杆一个长方体
    （本地 e0, e1, n0, n1, 顶 mPD；从 zbot 起）。返回片的列表：{"T": (k,3,3), "n": 法线, "kind": "wall" | "roof" | "under" | "mast"}。"""
    import scipy.ndimage
    a = math.radians(spec.get("frame", 0.0))
    E = np.array([math.cos(a), math.sin(a), 0.0])
    N = np.array([-math.sin(a), math.cos(a), 0.0])
    Z = np.array([0.0, 0.0, 1.0])
    P = V[F]
    n, _ = tri_normals(P)
    L = frame_xy(spec, P.reshape(-1, 3)[:, :2]).reshape(-1, 3, 2)
    rl = frame_xy(spec, ring)
    lo = np.floor((rl.min(0) - 4.0) / cell) * cell
    hi = np.ceil((rl.max(0) + 4.0) / cell) * cell
    W, H = int(round((hi[0] - lo[0]) / cell)), int(round((hi[1] - lo[1]) / cell))
    ce = lo[0] + (np.arange(W) + 0.5) * cell
    cn = lo[1] + (np.arange(H) + 0.5) * cell

    def raster(sel: np.ndarray, out: np.ndarray, take_max: bool) -> None:
        for k in np.nonzero(sel)[0]:
            q = L[k]
            z = P[k, :, 2]
            i0 = max(0, int(math.floor((q[:, 0].min() - lo[0]) / cell - 0.5)))
            i1 = min(W - 1, int(math.ceil((q[:, 0].max() - lo[0]) / cell - 0.5)))
            j0 = max(0, int(math.floor((q[:, 1].min() - lo[1]) / cell - 0.5)))
            j1 = min(H - 1, int(math.ceil((q[:, 1].max() - lo[1]) / cell - 0.5)))
            if i1 < i0 or j1 < j0:
                continue
            v0, v1 = q[1] - q[0], q[2] - q[0]
            d = v0[0] * v1[1] - v0[1] * v1[0]
            if abs(d) < 1e-9:
                continue
            px = ce[i0:i1 + 1][None, :] - q[0, 0]
            py = cn[j0:j1 + 1][:, None] - q[0, 1]
            b1 = (px * v1[1] - py * v1[0]) / d
            b2 = (v0[0] * py - v0[1] * px) / d
            b0 = 1.0 - b1 - b2
            ins = (b0 >= -1e-6) & (b1 >= -1e-6) & (b2 >= -1e-6)
            if not ins.any():
                continue
            zz = b0 * z[0] + b1 * z[1] + b2 * z[2]
            blk = out[j0:j1 + 1, i0:i1 + 1]
            blk[ins] = np.maximum(blk[ins], zz[ins]) if take_max else np.minimum(blk[ins], zz[ins])

    top = np.full((H, W), -np.inf)
    raster(~drop & (n[:, 2] > 0.5), top, True)
    EE, NN = np.meshgrid(ce, cn)
    xy = EE[..., None] * E[None, None, :2] + NN[..., None] * N[None, None, :2]
    flat = xy.reshape(-1, 2)
    inring = point_in(flat, ring).reshape(H, W)
    near = (outside_dist(flat, ring) <= 1.0).reshape(H, W)
    top[~near] = -np.inf
    # 轮廓里没投到的格（桅杆底下、减面的细缝）：按四邻的最高补
    for _ in range(400):
        hole = inring & ~np.isfinite(top)
        if not hole.any():
            break
        pad = np.pad(top, 1, constant_values=-np.inf)
        nb = np.maximum.reduce([pad[:-2, 1:-1], pad[2:, 1:-1], pad[1:-1, :-2], pad[1:-1, 2:]])
        fill = hole & np.isfinite(nb)
        if not fill.any():
            break
        top[fill] = nb[fill]
    have = np.isfinite(top)
    t = np.where(have, np.round(top / 0.5) * 0.5, zbot)
    t = scipy.ndimage.grey_closing(scipy.ndimage.grey_opening(t, size=(3, 3)), size=(3, 3))
    have &= t > zbot + 1.0
    # 屋面高并级：按格数从多到少，离已有一级 ≤ 1.5 m 的并过去（确定性：同数按高度）
    vals, cnt = np.unique(t[have], return_counts=True)
    levels: list[float] = []
    remap = {}
    for v, _c in sorted(zip(vals.tolist(), cnt.tolist()), key=lambda p: (-p[1], p[0])):
        best = min(levels, key=lambda l_: (abs(l_ - v), l_)) if levels else None
        if best is not None and abs(best - v) <= merge:
            remap[v] = best
        else:
            levels.append(v)
            remap[v] = v
    for v, r in remap.items():
        if r != v:
            t[have & (t == v)] = r
    t[~have] = zbot
    # 底：广场框里取底腹（朝下、离 zbot 3 m 以上的面）的最低处，框里没投到的格按邻格补
    bot = np.full((H, W), zbot)
    pz = spec.get("plaza")
    if pz:
        # 广场框沿本地 n 两头各放宽 2 m（框边到南北立面之间那一两排格也是开敞的，不然立面脚下会多出一道从地面到底腹的墙）
        e0, e1, n0, n1 = pz["box"]
        inbox = (EE > e0) & (EE < e1) & (NN > n0 - 2.0) & (NN < n1 + 2.0) & have
        under = np.full((H, W), np.inf)
        cz = P[:, :, 2].mean(1)
        raster(~drop & (n[:, 2] < -0.5) & (cz > zbot + 3.0) & (cz < float(pz["cut"]) + 6.0), under, False)
        under[~inbox] = np.inf
        for _ in range(200):
            hole = inbox & ~np.isfinite(under)
            if not hole.any():
                break
            pad = np.pad(under, 1, constant_values=np.inf)
            nb = np.minimum.reduce([pad[:-2, 1:-1], pad[2:, 1:-1], pad[1:-1, :-2], pad[1:-1, 2:]])
            fill = hole & np.isfinite(nb)
            if not fill.any():
                break
            under[fill] = nb[fill]
        ok = inbox & np.isfinite(under)
        if ok.any():
            # 底腹按格的中位数取一个平面高（远景里底腹是一整块平顶）
            bot[ok] = float(np.round(np.median(under[ok]) / 0.5) * 0.5)
    pieces: list[dict] = []

    def wall(e_or_n: str, line: float, s0: float, s1: float, z0: float, z1: float, nrm: np.ndarray) -> None:
        zs = [z0] + [c for c in cuts if z0 + 0.5 < c < z1 - 0.5] + [z1]
        k = max(1, int(math.ceil((s1 - s0) / width)))
        ss = np.linspace(s0, s1, k + 1)
        for za, zb in zip(zs[:-1], zs[1:]):
            for sa, sb in zip(ss[:-1], ss[1:]):
                if e_or_n == "e":     # 墙在 e = line 上，沿 n 展开
                    A, B = line * E + sa * N, line * E + sb * N
                else:                 # 墙在 n = line 上，沿 e 展开
                    A, B = sa * E + line * N, sb * E + line * N
                pieces.append({"T": _quad(A + za * Z, B + za * Z, B + zb * Z, A + zb * Z, nrm), "n": nrm.copy(), "kind": "wall"})

    # 墙：逐个方向比较相邻格的竖直区间 [底, 顶]，A 比邻格 B 多出来的部分朝 B 露出
    for axis, sgn in ((0, 1), (0, -1), (1, 1), (1, -1)):
        nb_t = np.full((H, W), -np.inf)
        nb_b = np.full((H, W), np.inf)
        nb_h = np.zeros((H, W), bool)
        if axis == 0:
            src = slice(1, None) if sgn > 0 else slice(None, -1)
            dst = slice(None, -1) if sgn > 0 else slice(1, None)
            nb_t[:, dst], nb_b[:, dst], nb_h[:, dst] = t[:, src], bot[:, src], have[:, src]
        else:
            src = slice(1, None) if sgn > 0 else slice(None, -1)
            dst = slice(None, -1) if sgn > 0 else slice(1, None)
            nb_t[dst, :], nb_b[dst, :], nb_h[dst, :] = t[src, :], bot[src, :], have[src, :]
        nrm = (E if axis == 0 else N) * sgn
        for layer in (0, 1):
            # layer 0：A 的上段（邻格顶以上 / 邻格空时整段）；layer 1：A 的下段（邻格是广场、底比 A 高时露出的那段）
            if layer == 0:
                z0 = np.where(nb_h, np.maximum(nb_t, bot), bot)
                z1 = t
            else:
                z0 = bot
                z1 = np.where(nb_h, np.minimum(nb_b, t), bot)
            ex = have & (z1 - z0 > 0.05)
            # 沿墙的方向把相邻、区间相同的格并成一条
            if axis == 0:
                for i in range(W):
                    j = 0
                    while j < H:
                        if not ex[j, i]:
                            j += 1
                            continue
                        j1 = j
                        while j1 + 1 < H and ex[j1 + 1, i] and z0[j1 + 1, i] == z0[j, i] and z1[j1 + 1, i] == z1[j, i]:
                            j1 += 1
                        line = lo[0] + (i + (1 if sgn > 0 else 0)) * cell
                        wall("e", line, lo[1] + j * cell, lo[1] + (j1 + 1) * cell, float(z0[j, i]), float(z1[j, i]), nrm)
                        j = j1 + 1
            else:
                for j in range(H):
                    i = 0
                    while i < W:
                        if not ex[j, i]:
                            i += 1
                            continue
                        i1 = i
                        while i1 + 1 < W and ex[j, i1 + 1] and z0[j, i1 + 1] == z0[j, i] and z1[j, i1 + 1] == z1[j, i]:
                            i1 += 1
                        line = lo[1] + (j + (1 if sgn > 0 else 0)) * cell
                        wall("n", line, lo[0] + i * cell, lo[0] + (i1 + 1) * cell, float(z0[j, i]), float(z1[j, i]), nrm)
                        i = i1 + 1
    # 屋面与底面：同一级的格并成长方形
    for kind, val, zs, nrm in (("roof", t, levels, Z), ("under", bot, sorted(set(bot[have & (bot > zbot + 0.5)].tolist())), -Z)):
        for zv in zs:
            m = have & (val == zv) if kind == "roof" else have & (bot == zv)
            for j0, i0, j1, i1 in _rects(m):
                ea, eb = lo[0] + i0 * cell, lo[0] + (i1 + 1) * cell
                na, nb_ = lo[1] + j0 * cell, lo[1] + (j1 + 1) * cell
                c4 = [ea * E + na * N, eb * E + na * N, eb * E + nb_ * N, ea * E + nb_ * N]
                pieces.append({"T": _quad(*(p + zv * Z for p in c4), nrm), "n": nrm.copy(), "kind": kind})
    # 桅杆：长方体（四面 + 顶）
    for e0, e1, n0, n1, zt in boxes:
        c4 = [e0 * E + n0 * N, e1 * E + n0 * N, e1 * E + n1 * N, e0 * E + n1 * N]
        for (pa, pb), nrm in zip(zip(c4, c4[1:] + c4[:1]), (-N, E, N, -E)):
            pieces.append({"T": _quad(pa + zbot * Z, pb + zbot * Z, pb + zt * Z, pa + zt * Z, nrm), "n": nrm.copy(), "kind": "mast"})
        pieces.append({"T": _quad(*(p + zt * Z for p in c4), Z), "n": Z.copy(), "kind": "mast"})
    return pieces


def sink_base(V: np.ndarray, ground: Ground) -> int:
    g = ground(V[:, 0], V[:, 1])
    foot = V[:, 2] < g + BASE_LIFT
    low = ground.low3(V[foot, 0], V[foot, 1]) - BASE_SINK
    V[foot, 2] = np.minimum(V[foot, 2], low)
    return int(foot.sum())


def split_z(V: np.ndarray, F: np.ndarray, z: float) -> tuple[np.ndarray, np.ndarray]:
    """横切：跨过 z 的三角形切成 3 个（新顶点按边插值，同一条边只插一个点）。"""
    s = V[:, 2] - z
    side = s >= 0
    fs = side[F]
    cross = ~(fs.all(1) | (~fs).all(1))
    if not cross.any():
        return V, F
    newV = [V]
    edge_pt: dict[tuple[int, int], int] = {}
    nv = len(V)
    out = [F[~cross]]
    extra = []

    def cut(a: int, b: int) -> int:
        nonlocal nv
        k = (min(a, b), max(a, b))
        if k in edge_pt:
            return edge_pt[k]
        t = s[a] / (s[a] - s[b])
        newV.append((V[a] + (V[b] - V[a]) * t)[None])
        edge_pt[k] = nv
        nv += 1
        return nv - 1

    for f in F[cross]:
        a, b, c = (int(x) for x in f)
        sa, sb, sc = side[a], side[b], side[c]
        # 让 a 是「孤立」的那个顶点
        if sa == sb:
            a, b, c = c, a, b
        elif sa == sc:
            a, b, c = b, c, a
        ab = cut(a, b)
        ac = cut(a, c)
        extra.append([a, ab, ac])
        extra.append([ab, b, c])
        extra.append([ab, c, ac])
    V2 = np.concatenate(newV)
    F2 = np.concatenate([out[0], np.asarray(extra, np.int64)])
    P2 = V2[F2]
    _, area = tri_normals(P2)
    return V2, F2[area > 1e-7]


# ------------------------------------------------------------------------------------------------ 4. 分块与装箱

def edge_adjacency(F: np.ndarray) -> list[np.ndarray]:
    """每个面经共享边相邻的面（数组列表）。"""
    nf = len(F)
    e = np.concatenate([F[:, [0, 1]], F[:, [1, 2]], F[:, [2, 0]]])
    e = np.sort(e, 1)
    fid = np.tile(np.arange(nf), 3)
    key = e[:, 0] * (int(F.max()) + 1) + e[:, 1]
    order = np.argsort(key, kind="stable")
    ks = key[order]
    fs = fid[order]
    nb: list[list[int]] = [[] for _ in range(nf)]
    starts = np.r_[0, np.nonzero(np.diff(ks))[0] + 1, len(ks)]
    for a, b in zip(starts[:-1], starts[1:]):
        if b - a < 2:
            continue
        grp = fs[a:b].tolist()
        for i in grp:
            for j in grp:
                if i != j:
                    nb[i].append(j)
    return [np.asarray(sorted(set(x)), np.int64) for x in nb]


def make_charts(V: np.ndarray, F: np.ndarray, band: np.ndarray) -> np.ndarray:
    """区域生长分块：返回每个面的块号。种子按面积从大到小（同面积按序号），块平面固定为种子的平面。"""
    P = V[F]
    n, area = tri_normals(P)
    nb = edge_adjacency(F)
    chart = np.full(len(F), -1, np.int64)
    order = np.lexsort((np.arange(len(F)), -area))
    cid = 0
    for s in order:
        if chart[s] >= 0:
            continue
        ns = n[s]
        d0 = float(ns @ P[s, 0])
        chart[s] = cid
        stack = [int(s)]
        while stack:
            f = stack.pop()
            for g in nb[f]:
                if chart[g] >= 0 or band[g] != band[s]:
                    continue
                if float(n[g] @ ns) < CHART_COS:
                    continue
                if float(np.abs(P[g] @ ns - d0).max()) > CHART_DIST:
                    continue
                chart[g] = cid
                stack.append(int(g))
        cid += 1
    return chart


def chart_basis(nrm: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """块平面的 (t, b)：墙 t 水平（从外面看向右）、b ≈ 向上；屋面 t 向东投影。"""
    if abs(nrm[2]) < 0.6:
        t = np.array([-nrm[1], nrm[0], 0.0])
        t /= np.linalg.norm(t)
    else:
        t = np.array([1.0, 0.0, 0.0]) - nrm * nrm[0]
        t /= np.linalg.norm(t)
    b = np.cross(nrm, t)
    return t, b


class Skyline:
    """天际线装箱（左下优先）。"""

    def __init__(self, w: int, h: int):
        self.w, self.h = w, h
        self.segs = [[0, w, 0]]  # x, 宽, 高

    def fit(self, rw: int, rh: int) -> tuple[int, int] | None:
        best = None
        for i in range(len(self.segs)):
            x = self.segs[i][0]
            if x + rw > self.w:
                break
            y = 0
            wl = rw
            j = i
            while wl > 0:
                y = max(y, self.segs[j][2])
                wl -= self.segs[j][1]
                j += 1
                if j >= len(self.segs) and wl > 0:
                    y = None
                    break
            if y is None or y + rh > self.h:
                continue
            if best is None or (y, x) < (best[1], best[0]):
                best = (x, y, i)
        if best is None:
            return None
        x, y, i = best
        # 更新天际线
        new = [x, rw, y + rh]
        segs = []
        for s in self.segs:
            s0, s1 = s[0], s[0] + s[1]
            if s1 <= x or s0 >= x + rw:
                segs.append(s)
                continue
            if s0 < x:
                segs.append([s0, x - s0, s[2]])
            if s1 > x + rw:
                segs.append([x + rw, s1 - x - rw, s[2]])
        segs.append(new)
        segs.sort(key=lambda s: s[0])
        merged = []
        for s in segs:
            if merged and merged[-1][2] == s[2] and merged[-1][0] + merged[-1][1] == s[0]:
                merged[-1][1] += s[1]
            else:
                merged.append(list(s))
        self.segs = merged
        return x, y


def pack(rects: list[tuple[int, int]], size: int) -> list[tuple[int, int]] | None:
    """rects (宽, 高) → 位置；按高、宽从大到小放，放不下返回 None。"""
    order = sorted(range(len(rects)), key=lambda i: (-rects[i][1], -rects[i][0], i))
    sky = Skyline(size, size)
    pos: list[tuple[int, int] | None] = [None] * len(rects)
    for i in order:
        p = sky.fit(*rects[i])
        if p is None:
            return None
        pos[i] = p
    return pos  # type: ignore[return-value]


# ------------------------------------------------------------------------------------------------ 5. 烘焙（前向栅格化 + 后处理）

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
    """(2r+1)² 盒式模糊（积分图，边界按实际覆盖数归一）。"""
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
    wf = w.astype(np.float64)
    num = box_blur(a * (wf[:, :, None] if a.ndim == 3 else wf), r)
    den = box_blur(wf, r)
    dd = den[:, :, None] if a.ndim == 3 else den
    with np.errstate(invalid="ignore", divide="ignore"):
        out = np.where(dd > 1e-9, num / np.where(dd > 1e-9, dd, 1.0), 0.0)
    return out, den


def fill_holes(col: np.ndarray, valid: np.ndarray, steps: int) -> tuple[np.ndarray, np.ndarray]:
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


def bilinear(img: np.ndarray, u: np.ndarray, v: np.ndarray) -> np.ndarray:
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


class Chart:
    __slots__ = ("id", "faces", "n", "t", "b", "th", "d0", "u0", "w0", "u1", "w1", "band", "zlo", "zhi", "area", "dens", "ss", "rect",
                 "col", "glass", "valid", "textured", "feature", "mull", "phase", "cover", "work_col", "work_glass", "work_valid")


def bake_chart(ch: Chart, src: dict, models: list, prep: dict, win: tuple[float, float, float, float] | None = None) -> tuple[np.ndarray, np.ndarray]:
    """把源三角形前向栅格化到块平面：win 为 None 时按工作分辨率覆盖整块，否则按 ANALYSIS_PX_M 只取窗口 (u0, u1, w0, w1)。
    返回 (线性颜色 (H, W, 3), 有效 (H, W))。"""
    d = ch.dens * ch.ss if win is None else ANALYSIS_PX_M
    u0, u1, w0, w1 = (ch.u0, ch.u1, ch.w0, ch.w1) if win is None else win
    W = max(1, int(math.ceil((u1 - u0) * d)))
    H = max(1, int(math.ceil((w1 - w0) * d)))
    col = np.zeros((H, W, 3), np.float32)
    dep = np.full((H, W), -np.inf, np.float32)
    # 候选源三角形：外包盒相交、朝向一致、离平面在窗口里
    lo3, hi3 = prep["lo"], prep["hi"]
    box_lo = prep["chart_lo"][ch.id] - DEPTH_M - 0.05
    box_hi = prep["chart_hi"][ch.id] + DEPTH_M + 0.05
    cand = np.nonzero(((hi3 >= box_lo) & (lo3 <= box_hi)).all(1))[0]
    if len(cand):
        dots = np.abs(prep["n"][cand] @ ch.n)
        cand = cand[dots > 0.5]
    if len(cand):
        Pc = src["tris"][cand]
        sd = Pc @ ch.n - ch.d0
        ok = (sd.max(1) >= -DEPTH_M) & (sd.min(1) <= DEPTH_M)
        cand = cand[ok]
    for k in cand.tolist():
        img = int(src["img"][k])
        if img < 0:
            continue
        m = models[int(src["model"][k])]
        P = src["tris"][k]
        pu = (P @ ch.t - u0) * d - 0.5
        pw = (w1 - P @ ch.b) * d - 0.5   # 行从上往下
        pd = P @ ch.n - ch.d0
        c0 = max(int(math.floor(pu.min())), 0)
        c1 = min(int(math.ceil(pu.max())) + 1, W)
        r0 = max(int(math.floor(pw.min())), 0)
        r1 = min(int(math.ceil(pw.max())) + 1, H)
        if c1 <= c0 or r1 <= r0:
            continue
        x0, y0 = pu[0], pw[0]
        e1x, e1y = pu[1] - x0, pw[1] - y0
        e2x, e2y = pu[2] - x0, pw[2] - y0
        den = e1x * e2y - e2x * e1y
        if abs(den) < 1e-9:
            continue
        xs = np.arange(c0, c1, dtype=np.float64)
        ys = np.arange(r0, r1, dtype=np.float64)
        X, Y = np.meshgrid(xs - x0, ys - y0)
        l1 = (X * e2y - e2x * Y) / den
        l2 = (e1x * Y - X * e1y) / den
        l0 = 1 - l1 - l2
        eps = 1e-6
        inside = (l0 >= -eps) & (l1 >= -eps) & (l2 >= -eps)
        if not inside.any():
            continue
        z = l0 * pd[0] + l1 * pd[1] + l2 * pd[2]
        inside &= (z >= -DEPTH_M) & (z <= DEPTH_M)
        rr, cc = np.nonzero(inside)
        if len(rr) == 0:
            continue
        zz = z[rr, cc].astype(np.float32)
        gr, gc = rr + r0, cc + c0
        better = zz > dep[gr, gc]
        if not better.any():
            continue
        gr, gc, zz = gr[better], gc[better], zz[better]
        L0, L1, L2 = l0[rr, cc][better], l1[rr, cc][better], l2[rr, cc][better]
        UV = src["uv"][k]
        u = L0 * UV[0, 0] + L1 * UV[1, 0] + L2 * UV[2, 0]
        v = L0 * UV[0, 1] + L1 * UV[1, 1] + L2 * UV[2, 1]
        tw, th = m.size(img)
        texpx = prep["texpx"][k]  # 源纹素 / m
        lev = int(np.clip(math.floor(math.log2(max(texpx / d, 1e-6))), 0, 6))
        while lev > 0 and min(tw, th) >> lev < 8:
            lev -= 1
        rgb = bilinear(m.level(img, lev), u, v)
        col[gr, gc] = rgb
        dep[gr, gc] = zz
    valid = np.isfinite(dep) & (col.max(-1) >= 8)
    # 地政总署没贴图的面：完全中性、几乎没有起伏的平灰
    c = col.astype(np.int16)
    neutral = valid & (np.abs(c[..., 0] - c[..., 1]) <= 2) & (np.abs(c[..., 1] - c[..., 2]) <= 2)
    if neutral.any():
        y = col.sum(-1).astype(np.float64) / 3.0
        m1, den_ = masked_blur(y, valid, 3)
        m2, _ = masked_blur(y * y, valid, 3)
        sd = np.sqrt(np.maximum(m2 - m1 * m1, 0.0))
        valid &= ~(neutral & (sd < 1.2) & (den_ > 0.5))
    return srgb_to_linear(col.astype(np.float64) / 255.0), valid


def glass_mask(srgb: np.ndarray, valid: np.ndarray, pxm: float) -> np.ndarray:
    """R3 glass_mask（landsd_3d_tex_bake.py，按工作分辨率 pxm 换算半径）。"""
    r, b = srgb[..., 0], srgb[..., 2]
    lum = 0.2126 * r + 0.7152 * srgb[..., 1] + 0.0722 * b
    sat = srgb.max(-1) - srgb.min(-1)
    rad = max(1, int(round(1.5 * pxm)))
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
    s_notbright = 1 - smoothstep(0.45, 0.6, lum) * smoothstep(1.0, 1.15, rel)
    blue = s_blue * (1 - s_warm) * (1 - s_white) * np.maximum(s_tex, s_dark) * s_notbright
    gl = np.maximum.reduce([blue, s_rel, s_dark * (1 - 0.5 * s_warm)])
    near, _ = masked_blur(gl, valid, max(1, int(4 * pxm)))
    gl = np.maximum(gl, 0.9 * smoothstep(0.5, 0.75, near))
    return np.clip(gl, 0, 1) * valid


def clean_glass(gl: np.ndarray, srgb: np.ndarray, valid: np.ndarray, face_glassy: bool) -> np.ndarray:
    """R3 clean_glass：二值化后先开后闭；幕墙面里低饱和、不偏暖的「实墙」像素是白天倒影，也算玻璃。"""
    m = (gl > 0.5) & valid

    def dil(a: np.ndarray, r: int) -> np.ndarray:
        return box_blur(a.astype(np.float64), r) > 1e-6

    def ero(a: np.ndarray, r: int) -> np.ndarray:
        return box_blur(a.astype(np.float64), r) > 1 - 1e-6

    m = dil(ero(m, 1), 1)
    m = ero(dil(m, 1), 1) & valid
    out = np.where(m, np.maximum(gl, 0.75), np.minimum(gl, 0.25))
    if face_glassy:
        mx = srgb.max(-1)
        mn = srgb.min(-1)
        sat = (mx - mn) / np.maximum(mx, 1e-6)
        notwarm = srgb[..., 2] >= srgb[..., 0] - 0.02
        refl = valid & (~m) & (sat < 0.15) & notwarm
        out[refl] = np.maximum(out[refl], 0.8)
    return np.clip(out, 0, 1) * valid


def members_mask(srgb: np.ndarray, valid: np.ndarray, pxm: float) -> np.ndarray:
    """prism-tower 塔身的白色铝包结构件：又亮、又不饱和、比 4 m 内的平均亮，且成细长条（不是一整片）。"""
    lum = 0.2126 * srgb[..., 0] + 0.7152 * srgb[..., 1] + 0.0722 * srgb[..., 2]
    sat = (srgb.max(-1) - srgb.min(-1)) / np.maximum(srgb.max(-1), 1e-6)
    local, _ = masked_blur(lum, valid, max(1, int(round(4 * pxm))))
    m = valid & (lum > 0.38) & (sat < 0.22) & (lum > local * 1.06)
    # 闭运算补上被倒影打断的缝（约 0.6 m），再开运算去掉零星亮点（< 约 0.4 m）
    rc = max(1, int(round(0.3 * pxm)))
    m = box_blur((box_blur(m.astype(np.float64), rc) > 1e-6).astype(np.float64), rc) > 1 - 1e-6
    r = max(1, int(round(0.2 * pxm)))
    er = box_blur(m.astype(np.float64), r) > 1 - 1e-6
    m = (box_blur(er.astype(np.float64), r) > 1e-6) & valid
    # 结构件是长条：连通块外包对角线 < 6 m 的（玻璃里倒映的白云、邻楼亮面）不算
    import scipy.ndimage
    lab, n = scipy.ndimage.label(m)
    if n == 0:
        return m
    sl = scipy.ndimage.find_objects(lab)
    keep = np.zeros(n + 1, bool)
    for i, ss in enumerate(sl, 1):
        if ss is not None and math.hypot(ss[0].stop - ss[0].start, ss[1].stop - ss[1].start) / pxm >= 6.0:
            keep[i] = True
    return keep[lab]


def member_lines(mem: np.ndarray, pxm: float) -> tuple[np.ndarray, list[tuple[float, float, float, float]]]:
    """白色结构件的中线（prism-tower 的 LED 沿 X 斜撑、棱边、模块横梁）：对结构件掩膜做 Hough 变换，取票数够长的直线，
    线位取票数平台的中点（结构件宽 1.5–3 m，平台内任何一条平行线票数都一样多），再按掩膜在线上的覆盖切成线段（缺口 > 3 m 断开、
    短于 12 m 的不要），最后画成约 0.7 m 宽的抗锯齿直线。返回 (0–1 线覆盖率, 线段 [(x0, y0, x1, y1)]（像素坐标）)。
    线覆盖率只用来挑「中线附近的结构件」；发光的 LED 线是线段本身（写进网格的 LED 线几何，见 line_quads），不从图集里读：
    照片里的结构件边缘被倒影、阴影切得参差不齐，拿掩膜或图集发光会是一条条毛边的粗带。"""
    H, W = mem.shape
    out = np.zeros((H, W))
    segs: list[tuple[float, float, float, float]] = []
    ys, xs = np.nonzero(mem)
    if len(xs) < 20 * pxm:
        return out, segs
    thetas = np.deg2rad(np.arange(0.0, 180.0, 0.5))
    diag = int(math.ceil(math.hypot(H, W)))
    nr = 2 * diag + 1
    acc = np.zeros((len(thetas), nr), np.int32)
    for k0 in range(0, len(thetas), 24):
        th = thetas[k0:k0 + 24]
        r = np.round(xs[:, None] * np.cos(th)[None] + ys[:, None] * np.sin(th)[None]).astype(np.int64) + diag
        for j in range(len(th)):
            acc[k0 + j] = np.bincount(r[:, j], minlength=nr)[:nr]
    lines = []
    work = acc.astype(np.float64)
    min_votes = 8.0 * pxm
    half = max(2, int(round(1.6 * pxm)))   # 抑制窗：ρ ± 1.6 m、θ ± 4°
    for _ in range(HOUGH_MAX_LINES):
        k, ri = np.unravel_index(int(np.argmax(work)), work.shape)
        peak = work[k, ri]
        if peak < min_votes:
            break
        lo, hi = max(0, ri - half), min(nr, ri + half + 1)
        row = acc[k, lo:hi].astype(np.float64)
        plateau = row >= 0.85 * peak
        rho = float((np.arange(lo, hi)[plateau]).mean()) - diag
        lines.append((float(thetas[k]), rho))
        dk = 8
        for kk in range(k - dk, k + dk + 1):
            work[kk % len(thetas), lo:hi] = 0.0
    if not lines:
        return out, segs
    yy, xx = np.mgrid[0:H, 0:W]
    hw = 0.35 * pxm
    for th, rho in lines:
        c, s_ = math.cos(th), math.sin(th)
        d = xs * c + ys * s_ - rho
        near = np.abs(d) <= 0.8 * pxm
        if near.sum() < min_votes:
            continue
        t = np.sort(-xs[near] * s_ + ys[near] * c)
        gaps = np.nonzero(np.diff(t) > 3.0 * pxm)[0]
        starts = np.r_[t[0], t[gaps + 1]]
        ends = np.r_[t[gaps], t[-1]]
        for a, b in zip(starts, ends):
            if b - a < 12.0 * pxm:
                continue
            dist = np.abs(xx * c + yy * s_ - rho)
            along = -xx * s_ + yy * c
            seg = np.clip(hw + 0.5 - dist, 0.0, 1.0) * ((along >= a) & (along <= b))
            np.maximum(out, seg, out=out)
            segs.append((rho * c - a * s_, rho * s_ + a * c, rho * c - b * s_, rho * s_ + b * c))
    return out, segs


# ------------------------------------------------------------------------------------------------ LED 线几何与发光芯

def region_flags(spec: dict, cxy: np.ndarray, z: float) -> dict:
    """块中心（模拟坐标）落在 spec 的哪些本地框里：plaza（广场框）、masts（任一桅杆框）、redcore（西服务塔的高度段）、
    boxes 里的具名框组（每个名字一组本地框 [e0, e1, n0, n1]，落在任一个里就算）。"""
    out: dict = {}
    if not any(k in spec for k in ("plaza", "masts", "redcore", "boxes")):
        return out
    e, n = frame_xy(spec, np.asarray(cxy, np.float64)[None])[0]
    for name, bxs in spec.get("boxes", {}).items():
        out[name] = any(e0 < e < e1 and n0 < n < n1 for e0, e1, n0, n1 in bxs)
    if "plaza" in spec:
        e0, e1, n0, n1 = spec["plaza"]["box"]
        out["plaza"] = bool(e0 < e < e1 and n0 < n < n1)
    if "masts" in spec:
        m = spec["masts"]
        out["masts"] = any(abs(e - me) <= m["half"] and abs(n - mn) <= m["half"] for me in m["e"] for mn in m["n"])
    if "redcore" in spec:
        r = spec["redcore"]
        out["redcore"] = bool(r.get("emin", -1e9) <= e <= r.get("emax", 1e9) and r["zmin"] <= z <= r["zmax"] and
                              ("faces" not in r or any(abs(n - f) <= r.get("faceTol", 1.0) for f in r["faces"])))
    return out


def strip_coord(spec: dict, P: np.ndarray) -> np.ndarray:
    """steel-frame 红光楼梯间：点 (…, 3) 的本地 e 离 spec["redcore"]["strip"] 中线的距离 / 半宽 × 1000（|值| ≤ 1000 在条带里）。"""
    a, b = spec["redcore"]["strip"]
    e = frame_xy(spec, np.asarray(P, np.float64)[:, :2])[:, 0]
    return np.clip(np.round((e - 0.5 * (a + b)) / (0.5 * (b - a)) * 1000.0), -32767, 32767)


def split_protected(P: np.ndarray, spec: dict) -> tuple[np.ndarray, np.ndarray]:
    """spec["protect"]：本地框里、低于 z 的源三角形（只要位置）切出来 → (其余, 受保护)；其余部分从 z 往上，受保护部分到 z + overlap。"""
    pr = spec.get("protect")
    if not pr:
        return P, np.zeros((0, 3, 3))
    e0, e1, n0, n1 = pr["box"]
    z, ov = float(pr["z"]), float(pr["overlap"])
    loc = frame_xy(spec, P.mean(1)[:, :2])
    inbox = (loc[:, 0] > e0) & (loc[:, 0] < e1) & (loc[:, 1] > n0) & (loc[:, 1] < n1) & (P[:, :, 2].min(1) < z + ov)
    rest = [P[~inbox]]
    prot = []
    zuv = np.zeros((3, 2))
    for T in P[inbox]:
        rest.extend(q[None] for q, _ in clip_above(T, zuv, z))
        flip = T * np.array([1.0, 1.0, -1.0])
        prot.extend((q * np.array([1.0, 1.0, -1.0]))[None] for q, _ in clip_above(flip, zuv, -(z + ov)))
    return np.concatenate(rest), (np.concatenate(prot) if prot else np.zeros((0, 3, 3)))


def chart_point(c: "Chart", u: np.ndarray, w: np.ndarray) -> np.ndarray:
    """块平面坐标 (u, w)（块的 t / b 基）→ 模拟坐标三维点。"""
    return np.outer(u, c.t) + np.outer(w, c.b) + c.n * c.d0


def merge_lines(lines: list[tuple], tol: float = 0.6, ang_deg: float = 5.0, gap: float = 0.8) -> list[tuple]:
    """线段去重 / 接续：同色、夹角 < ang_deg、两端离已有线 < tol、沿线方向重叠或间隔 < gap 的并成一条（取并集）。
    按长度从长到短处理（同长按坐标，确定性）。线段 = (A, B, 颜色号, 宽 m, 所在面法线)。"""
    cosmax = math.cos(math.radians(ang_deg))
    items = sorted(lines, key=lambda L: (-round(float(np.linalg.norm(L[1] - L[0])), 4), tuple(np.round(L[0], 3)), tuple(np.round(L[1], 3))))
    kept: list[list] = []
    for A, B, col, w, nrm in items:
        d = B - A
        Ld = float(np.linalg.norm(d))
        if Ld < 1e-6:
            continue
        d = d / Ld
        done = False
        for k in kept:
            if k[2] != col:
                continue
            kd = k[1] - k[0]
            kl = float(np.linalg.norm(kd))
            kd = kd / kl
            if abs(float(d @ kd)) < cosmax:
                continue
            va, vb = A - k[0], B - k[0]
            if float(np.linalg.norm(va - (va @ kd) * kd)) > tol or float(np.linalg.norm(vb - (vb @ kd) * kd)) > tol:
                continue
            ta, tb = sorted((float(va @ kd), float(vb @ kd)))
            if ta > kl + gap or tb < -gap:
                continue
            k0 = k[0].copy()
            k[0], k[1] = k0 + kd * min(0.0, ta), k0 + kd * max(kl, tb)
            done = True
            break
        if not done:
            kept.append([np.array(A, np.float64), np.array(B, np.float64), col, w, nrm])
    return [tuple(k) for k in kept]


def convex_edges(V: np.ndarray, F: np.ndarray, zmin: float, zmax: float, min_len: float, min_deg: float = 30.0,
                 colour: int = LINE_COLOURS["tier"], horizontal: bool = True) -> list[tuple]:
    """网格的外凸棱（两面法线夹角 ≥ min_deg、另一面在这一面后面）里两端都在 [zmin, zmax] 的（horizontal 时只要近水平的，
    |dz| < 0.15 × 长），接续后长 ≥ min_len 的：neon-centre 冠顶阶梯的外沿、prism-tower 各三角锥的棱。返回 LED 线段列表。"""
    P = V[F]
    n, _ = tri_normals(P)
    e = np.concatenate([F[:, [0, 1]], F[:, [1, 2]], F[:, [2, 0]]])
    fid = np.tile(np.arange(len(F)), 3)
    key = np.sort(e, 1)
    k1 = key[:, 0] * (len(V) + 1) + key[:, 1]
    order = np.argsort(k1, kind="stable")
    ks = k1[order]
    starts = np.r_[0, np.nonzero(np.diff(ks))[0] + 1, len(ks)]
    raw = []
    cmax = math.cos(math.radians(min_deg))
    for a, b in zip(starts[:-1], starts[1:]):
        if b - a != 2:
            continue
        f1, f2 = int(fid[order[a]]), int(fid[order[a + 1]])
        va, vb = key[order[a]]
        A, B = V[va], V[vb]
        L = float(np.linalg.norm(B - A))
        if L < 0.3 or (horizontal and abs(B[2] - A[2]) >= 0.15 * L) or min(A[2], B[2]) < zmin or max(A[2], B[2]) > zmax:
            continue
        if float(n[f1] @ n[f2]) >= cmax:
            continue
        if float(n[f1] @ (P[f2].mean(0) - P[f1].mean(0))) >= 0:   # 另一面在前面：内凹的棱不要
            continue
        nn = n[f1] + n[f2]
        raw.append((A, B, colour, LINE_W, nn / max(float(np.linalg.norm(nn)), 1e-9)))
    lines = merge_lines(raw, tol=0.25, ang_deg=4.0, gap=0.3)
    return [L for L in lines if float(np.linalg.norm(L[1] - L[0])) >= min_len]


def _clip_params(p0: np.ndarray, d: np.ndarray, edges: list) -> list[float]:
    """二维直线 p0 + t·d 与线段集合的交点参数 t（升序）。"""
    ts = []
    for a, b in edges:
        e = b - a
        den = d[0] * e[1] - d[1] * e[0]
        if abs(den) < 1e-9:
            continue
        w = a - p0
        t = (w[0] * e[1] - w[1] * e[0]) / den
        s = (w[0] * d[1] - w[1] * d[0]) / den
        if -1e-6 <= s <= 1 + 1e-6:
            ts.append(float(t))
    return sorted(ts)


def structural_lines(lm: "LM") -> list[tuple]:
    """prism-tower：把照片 Hough 出的结构件线段（lm.members：每个结构件块的掩膜与线段）整理成干净的结构线（复审 R5b 修正：
    原来每块各自 Hough、只按 0.6–1.4 m 并线，同一根构件常出两三条错开一两米、角度差几度的线，街面带附近一团乱，还有停在玻璃中间的半截线）。
    按「同一平面」（法线 ≤ 3°、平面距 ≤ 1.5 m）把各块合在一起，在平面坐标（u 水平、v 沿面向上）里：
    1. 面的外轮廓（网格边界边，共线的并成段）是结构边：贴着某条轮廓边（≤ 8°、中点离边 ≤ 4.5 m、七成以上长度在边上）的 Hough 线段
       不当独立的线，只算这条边的「照片支持」；有支持的轮廓边原样（网格的边）发光——外凸的棱另由 convex_edges 补；
    2. 其余线段按方向分：竖 / 横（≤ 6°）是「框线」，先延长到轮廓、端点吸到 6 m 内的轮廓角点；斜撑（25–65°）延长到轮廓或框线，
       端点吸到 6 m 内的角点（轮廓角点、框线端点、框线交点）；
    3. 照片支持：线上每 0.5 m 取样，落在结构件掩膜（外扩 0.8 m）里的比例 ≥ 0.85 才留；同方向（≤ 5°）、两端离得 ≤ 3.5 m、
       大半重叠的算同一根构件，只留支持高（同分取 Hough 段长）的那条；
    4. 支持 < 0.95 的斜撑两端都要「落脚」（在角点上，或与另一条斜撑的端点相距 ≤ 4 m）——玻璃里倒影拼出来的斜线落不了脚，去掉；
       相会的端点取平均（V 形、X 形的交点严丝合缝）。
    返回 LED 线段列表（白色，所在面法线）。"""
    import scipy.ndimage
    up = np.array([0.0, 0.0, 1.0])
    V, F = lm.V, lm.F
    planes: list[dict] = []
    for item in lm.members:
        c = item[0]
        for pl in planes:
            if float(pl["n"] @ c.n) > math.cos(math.radians(3.0)) and abs(pl["d0"] - c.d0) < 1.5:
                pl["items"].append(item)
                break
        else:
            planes.append({"n": c.n.copy(), "d0": c.d0, "items": [item]})
    EDGE_TOL, EDGE_ANG, CORNER, MEET, SUP = 4.5, 8.0, 6.0, 4.0, 0.85
    out: list[tuple] = []
    for pl in planes:
        n = pl["n"]
        h = np.cross(up, n)
        h = h / float(np.linalg.norm(h)) if float(np.linalg.norm(h)) > 1e-3 else np.array([1.0, 0.0, 0.0])
        vax = np.cross(n, h)

        def to2(P: np.ndarray, h=h, vax=vax) -> np.ndarray:
            return np.array([float(P @ h), float(P @ vax)])

        def to3(q: np.ndarray, h=h, vax=vax, n=n, d0=pl["d0"]) -> np.ndarray:
            return q[0] * h + q[1] * vax + n * d0

        faces = np.concatenate([it[0].faces for it in pl["items"]])
        e = np.sort(np.concatenate([F[faces][:, [0, 1]], F[faces][:, [1, 2]], F[faces][:, [2, 0]]]), 1)
        uk, cnt = np.unique(e, axis=0, return_counts=True)
        bnd = uk[cnt == 1]
        edges2 = [(to2(V[a]), to2(V[b])) for a, b in bnd]
        outline = [L for L in merge_lines([(V[a], V[b], 0, LINE_W, n) for a, b in bnd], tol=0.2, ang_deg=2.0, gap=0.4)
                   if float(np.linalg.norm(L[1] - L[0])) >= 4.0]
        ol2 = [(to2(A), to2(B)) for A, B, *_ in outline]
        verts: list[np.ndarray] = []
        for a, b in ol2:
            for q in (a, b):
                if all(float(np.linalg.norm(q - v)) > 1.0 for v in verts):
                    verts.append(q)
        masks = [(it[0], scipy.ndimage.binary_dilation(it[1], iterations=max(1, int(round(0.8 * it[2])))), it[2]) for it in pl["items"]]

        def support(A: np.ndarray, B: np.ndarray, masks=masks) -> float:
            k = max(2, int(float(np.linalg.norm(B - A)) / 0.5))
            hit = tot = 0
            for t in np.linspace(0.0, 1.0, k):
                P = A + (B - A) * t
                got = None
                for c, m, pxm in masks:
                    x = (float(P @ c.t) - c.u0) * pxm
                    y = (c.w1 - float(P @ c.b)) * pxm
                    if 0 <= x < m.shape[1] and 0 <= y < m.shape[0] and abs(float(P @ c.n) - c.d0) < 1.5:
                        got = bool(m[int(y), int(x)]) or bool(got)
                if got is not None:
                    tot += 1
                    hit += int(got)
            return hit / max(tot, 1)

        segs = []
        for it in pl["items"]:
            for S0, S1 in it[3]:
                a, b = to2(S0), to2(S1)
                L = float(np.linalg.norm(b - a))
                if L > 1e-6:
                    segs.append((a, b, (b - a) / L, L))
        cov = np.zeros(len(ol2))
        cand = []
        for a, b, d, L in segs:
            hug = False
            for k, (oa, ob) in enumerate(ol2):
                od = ob - oa
                OL = float(np.linalg.norm(od))
                od = od / OL
                if abs(float(d @ od)) < math.cos(math.radians(EDGE_ANG)):
                    continue
                if abs(float((0.5 * (a + b) - oa) @ np.array([-od[1], od[0]]))) > EDGE_TOL:
                    continue
                ta, tb = sorted((float((a - oa) @ od), float((b - oa) @ od)))
                ov = max(0.0, min(tb, OL) - max(ta, 0.0))
                if ov > 0.7 * L:
                    cov[k] += ov
                    hug = True
            if not hug:
                cand.append((a, b, d, L))
        emitted = []
        for k, (oa, ob) in enumerate(ol2):
            OL = float(np.linalg.norm(ob - oa))
            if cov[k] >= 0.5 * OL or (cov[k] > 0 and support(to3(oa), to3(ob)) >= 0.8):
                emitted.append((oa, ob))

        def extend(a: np.ndarray, d: np.ndarray, L: float, bounds: list) -> tuple[float, float] | None:
            ts = _clip_params(a, d, bounds)
            lo = max([t for t in ts if t <= 2.0], default=None)
            hi = min([t for t in ts if t >= L - 2.0], default=None)
            return None if lo is None or hi is None else (lo, hi)

        def snap(ln: list, pts: list) -> None:
            for i in (0, 1):
                dv = [float(np.linalg.norm(ln[i] - v)) for v in pts]
                if dv and min(dv) < CORNER:
                    ln[i] = pts[int(np.argmin(dv))].copy()

        def same(ln: list, k0: np.ndarray, k1: np.ndarray) -> bool:
            d1, d2 = ln[1] - ln[0], k1 - k0
            l1, l2 = float(np.linalg.norm(d1)), float(np.linalg.norm(d2))
            if l1 < 1e-6 or l2 < 1e-6 or abs(float(d1 @ d2)) / (l1 * l2) < math.cos(math.radians(5.0)):
                return False
            u = d2 / l2
            nn = np.array([-u[1], u[0]])
            if abs(float((ln[0] - k0) @ nn)) > 3.5 or abs(float((ln[1] - k0) @ nn)) > 3.5:
                return False
            ta, tb = sorted((float((ln[0] - k0) @ u), float((ln[1] - k0) @ u)))
            return min(tb, l2) - max(ta, 0.0) > 0.6 * min(l1, l2)

        def dedupe(lines: list, refs: list) -> list:
            lines = sorted(lines, key=lambda x: (-round(x[3], 2), -x[2], round(float(x[0][0]), 3), round(float(x[0][1]), 3)))
            kept: list = []
            for ln in lines:
                if any(same(ln, k[0], k[1]) for k in kept) or any(same(ln, oa, ob) for oa, ob in refs):
                    continue
                kept.append(ln)
            return kept

        frames, diags = [], []
        for a, b, d, L in cand:
            ang = math.degrees(math.acos(min(1.0, abs(float(d[0])))))
            if (ang <= 6.0 and L >= 15.0) or (ang >= 84.0 and L >= 20.0):
                frames.append((a, b, d, L))
            elif 25.0 <= ang <= 65.0 and L >= 18.0:
                diags.append((a, b, d, L))
        fl = []
        for a, b, d, L in frames:
            ex = extend(a, d, L, edges2)
            if ex is not None and L >= 0.35 * (ex[1] - ex[0]):
                fl.append([a + d * ex[0], a + d * ex[1], L])
        for ln in fl:
            snap(ln, verts)
        fl = [ln + [support(to3(ln[0]), to3(ln[1]))] for ln in fl]
        fl = dedupe([ln for ln in fl if ln[3] >= SUP], [])
        fedges = [(ln[0], ln[1]) for ln in fl]
        corners = list(verts) + [ln[k] for ln in fl for k in (0, 1)]
        for i, (a1, b1) in enumerate(fedges):
            for a2, b2 in fedges[i + 1:]:
                d1, d2 = b1 - a1, b2 - a2
                den = d1[0] * d2[1] - d1[1] * d2[0]
                if abs(den) < 1e-9:
                    continue
                w = a2 - a1
                t = (w[0] * d2[1] - w[1] * d2[0]) / den
                s_ = (w[0] * d1[1] - w[1] * d1[0]) / den
                if -0.05 <= t <= 1.05 and -0.05 <= s_ <= 1.05:
                    corners.append(a1 + d1 * t)
        dl = []
        for a, b, d, L in diags:
            ex = extend(a, d, L, edges2 + fedges)
            if ex is not None and ex[1] - ex[0] >= 10.0 and L >= 0.3 * (ex[1] - ex[0]):
                dl.append([a + d * ex[0], a + d * ex[1], L])
        for ln in dl:
            snap(ln, corners)
        dl = [ln + [support(to3(ln[0]), to3(ln[1]))] for ln in dl]
        dl = dedupe([ln for ln in dl if ln[3] >= SUP], emitted + fedges)
        changed = True
        while changed:
            changed = False
            keep = []
            for i, ln in enumerate(dl):
                ok = ln[3] >= 0.95 or all(any(float(np.linalg.norm(q - v)) < 0.5 for v in corners) or
                                          any(float(np.linalg.norm(q - o[k])) < MEET for j, o in enumerate(dl) if j != i for k in (0, 1))
                                          for q in (ln[0], ln[1]))
                if ok:
                    keep.append(ln)
                else:
                    changed = True
            dl = keep
        ends = [(o[0].copy(), o[1].copy()) for o in dl]
        for ln in dl:
            for k in (0, 1):
                if any(float(np.linalg.norm(ln[k] - v)) < 0.5 for v in corners):
                    continue
                grp = [q for e2 in ends for q in e2 if float(np.linalg.norm(q - ln[k])) < MEET]
                ln[k] = np.mean(grp, 0)
        for a, b in emitted:
            out.append((to3(a), to3(b), LINE_COLOURS["white"], LINE_W, n.copy()))
        for ln in fl + dl:
            if float(np.linalg.norm(ln[1] - ln[0])) > 1.0:
                out.append((to3(ln[0]), to3(ln[1]), LINE_COLOURS["white"], LINE_W, n.copy()))
    return out


def crown_core(V: np.ndarray, zmin: float, shrink: float, tris: int) -> tuple[np.ndarray, np.ndarray]:
    """harbour-spire 冠顶的「发光芯」：冠顶（z ≥ zmin）顶点水平往冠顶中轴收 shrink m 后的凸包（朝下的面不要），减到约 tris 个三角形。
    冠顶的鳍片之间是空的，从街上往上看鳍片只是细条；实物鳍片里面整个被照亮，远看是一个发光的穹顶（2026 照片）。"""
    import scipy.spatial
    import fast_simplification
    pts = V[V[:, 2] >= zmin]
    if len(pts) < 8:
        return np.zeros((0, 3)), np.zeros((0, 3), np.int64)
    cxy = 0.5 * (pts[:, :2].min(0) + pts[:, :2].max(0))
    d = pts[:, :2] - cxy
    r = np.linalg.norm(d, axis=1)
    k = np.maximum(r - shrink, 0.0) / np.maximum(r, 1e-6)
    q = np.unique(np.round(np.c_[cxy + d * k[:, None], pts[:, 2]], 2), axis=0)
    hull = scipy.spatial.ConvexHull(q)
    Fh = hull.simplices.astype(np.int64)
    cen = q.mean(0)
    nn = np.cross(q[Fh[:, 1]] - q[Fh[:, 0]], q[Fh[:, 2]] - q[Fh[:, 0]])
    flip = (nn * (q[Fh].mean(1) - cen)).sum(1) < 0
    Fh[flip] = Fh[flip][:, [0, 2, 1]]
    if len(Fh) > tris:
        Vs, Fs = fast_simplification.simplify(q, Fh, target_count=int(tris))
        q, Fh = np.asarray(Vs, np.float64), np.asarray(Fs, np.int64)
    n, a = tri_normals(q[Fh])
    Fh = Fh[(n[:, 2] > -0.7) & (a > 1e-4)]
    used = np.unique(Fh)
    remap = np.full(len(q), -1, np.int64)
    remap[used] = np.arange(len(used))
    return q[used], remap[Fh]


def line_quads(lines: list[tuple], index: int) -> list[np.ndarray]:
    """LED 线段 → 网格属性（与 encode_mesh 同序：位置、法线、uv、夹取框、顶点色、立面、网格）+ 左右号 + 索引；每段 4 个顶点 2 个三角形。
    位置 = 线端点（沿所在面法线外移 LINE_LIFT）；法线 = 线方向（单位向量）、法线第 4 分量 = 左右（−1 / +1）；
    uv、夹取框 = 0；顶点色 = 白；立面 = (沿线 cm, 宽 mm)；网格 = (0, 特征 line, 地标序号, 颜色号)。"""
    pos, nrm, side, fac, grid = [], [], [], [], []
    for A, B, col, w, fn in lines:
        d = B - A
        L = float(np.linalg.norm(d))
        d = d / max(L, 1e-9)
        lift = np.asarray(fn, np.float64) * LINE_LIFT
        for P, t in ((A, 0.0), (B, L)):
            for sgn in (-1.0, 1.0):
                pos.append(P + lift)
                nrm.append(d)
                side.append(sgn)
                fac.append((round(t * 100), round(w * 1000)))
                grid.append((0, FEATURE["line"], index, col))
    n = len(pos)
    if n == 0:
        return [np.zeros((0, 3)), np.zeros((0, 3)), np.zeros((0, 2)), np.zeros((0, 4)), np.zeros((0, 4)), np.zeros((0, 2)),
                np.zeros((0, 4)), np.zeros(0), np.zeros(0, np.int64)]
    q = np.arange(0, n, 4)
    idx = np.stack([q, q + 1, q + 2, q + 2, q + 1, q + 3], 1).ravel()
    return [np.asarray(pos), np.asarray(nrm), np.zeros((n, 2)), np.zeros((n, 4)), np.full((n, 4), 255.0), np.asarray(fac, np.float64),
            np.asarray(grid, np.float64), np.asarray(side), idx]


def delight(lin: np.ndarray, valid: np.ndarray, ref: float, block: int) -> np.ndarray:
    """R3 delight：低频亮度（block px 一块）向参考亮度部分归一（指数 0.6，倍率 0.5–2）。"""
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
    big = np.asarray(Image.fromarray(ratio, "F").resize((pw, ph), Image.BILINEAR))[:h, :w]
    return lin * big[:, :, None]


def detect_period(prof: np.ndarray, ok: np.ndarray, pxm: float, lo_m: float, hi_m: float, detrend_m: float) -> tuple[float, float, float] | None:
    """一维剖面的周期（m）、相位（m，剖面最小处，即窗间墙 / 竖梃中线）与自相关值；R3 detect_floors 的一维版。"""
    n = len(prof)
    if ok.sum() < 3 * hi_m * pxm:
        return None
    k = max(1, int(detrend_m * pxm))
    ker = np.ones(2 * k + 1)
    mean = np.convolve(prof * ok, ker, "same") / np.maximum(np.convolve(ok.astype(float), ker, "same"), 1e-9)
    x = np.where(ok, prof - mean, 0.0)
    if (x * x).sum() < 1e-9:
        return None
    lags = range(max(2, int(lo_m * pxm)), min(n - 1, int(hi_m * pxm) + 1))
    if len(lags) < 3:
        return None
    scores = []
    for lag in lags:
        a, bb = x[:-lag], x[lag:]
        mm = ok[:-lag] & ok[lag:]
        den = math.sqrt(float((a[mm] ** 2).sum() * (bb[mm] ** 2).sum())) or 1.0
        scores.append(float((a[mm] * bb[mm]).sum() / den))
    i = int(np.argmax(scores))
    best = scores[i]
    if best < 0.2:
        return None
    lag = float(lags.start + i)
    if 0 < i < len(scores) - 1:
        y0, y1, y2 = scores[i - 1], scores[i], scores[i + 1]
        dd = y0 - 2 * y1 + y2
        if abs(dd) > 1e-9:
            lag += 0.5 * (y0 - y2) / dd
    period = lag / pxm
    pos = np.arange(n) / pxm
    nb = max(6, int(period * pxm))
    ph = np.mod(pos, period)
    bins = np.minimum((ph / period * nb).astype(int), nb - 1)
    fold = np.bincount(bins[ok], x[ok], nb) / np.maximum(np.bincount(bins[ok], None, nb), 1)
    fold = (np.roll(fold, 1) + fold + np.roll(fold, -1)) / 3
    phase = (int(np.argmin(fold)) + 0.5) / nb * period
    return period, phase, best


# ------------------------------------------------------------------------------------------------ 6. 特征规则

def truss_bands(V: np.ndarray, F: np.ndarray, ring: np.ndarray, base: float) -> list[tuple[float, float]]:
    """steel-frame：外挑结构（面心在轮廓外 > 1 m）里「斜」的面（法线不水平也不竖直）按高度聚成带：衣架桁架的层位。"""
    P = V[F]
    n, a = tri_normals(P)
    c = P.mean(1)
    out = outside_dist(c[:, :2], ring) > 1.0
    diag = out & (np.abs(n[:, 2]) > 0.25) & (np.abs(n[:, 2]) < 0.9) & (c[:, 2] > base + 20)
    if not diag.any():
        return []
    hist, edges = np.histogram(c[diag, 2], bins=np.arange(base, c[:, 2].max() + 2, 2.0), weights=a[diag])
    thr = max(hist.max() * 0.25, 1.0)
    bands = []
    i = 0
    while i < len(hist):
        if hist[i] >= thr:
            j = i
            while j + 1 < len(hist) and hist[j + 1] >= thr * 0.5:
                j += 1
            zc = float((edges[i] + edges[j + 1]) / 2)
            band = (round(zc - TRUSS_HALF_M, 1), round(zc + TRUSS_HALF_M, 1))
            if bands and band[0] <= bands[-1][1]:
                # 一道桁架的直方图被一格空档断成两段时（减面结果稍有不同就会），两段带子重叠：并成一道
                band = (bands[-1][0], band[1])
                bands.pop()
            bands.append(band)
            i = j + 1
        else:
            i += 1
    return bands


def feature_of(rules: list, z0: float, z1: float, h0: float, nrm: np.ndarray, glassy: float, bands: list[tuple[float, float]],
               width: float = 1e9, area: float = 1e9, outside: float = 0.0, where: dict | None = None,
               nloc: np.ndarray | None = None, ground: float | None = None) -> int:
    """块的特征号：按 LANDMARKS 的规则（高度用块的中线；width = 水平宽、area = 面积）先中先得；
    where：块中心落在哪些本地框里（plaza / masts / redcore，见 region_flags）；nloc：法线在本地坐标的水平分量 (e, n)；
    ground：块中心处的街面高程（规则带 "street" 时 hmin / hmax 从这里量，而不是从楼底量：坡地上的楼两侧街面差十来米）；
    屋面（法线朝上）与底面只认 edge / plain / crown / led / spire / truss / belly / ctier，其余一律 plain。"""
    zc = 0.5 * (z0 + z1)
    hc = zc - h0
    wall = abs(nrm[2]) < 0.6
    where = where or {}
    for name, r in rules:
        if r.get("down") and nrm[2] > -0.7:
            continue
        if "in" in r and not where.get(r["in"]):
            continue
        if r.get("nsface") and not (wall and nloc is not None and abs(nloc[1]) > 0.7):
            continue
        if "axial" in r and not (wall and nloc is not None and float(np.abs(nloc).max()) >= r["axial"]):
            continue
        if "zmin" in r and zc < r["zmin"]:
            continue
        if "zmax" in r and zc > r["zmax"]:
            continue
        hr = zc - ground if (r.get("street") and ground is not None) else hc
        if "hmin" in r and hr < r["hmin"]:
            continue
        if "hmax" in r and hr > r["hmax"]:
            continue
        if r.get("wall") and not wall:
            continue
        if r.get("glass") and glassy < 0.4:
            continue
        if r.get("ns") and not (wall and abs(nrm[1]) > 0.7):
            continue
        if r.get("nsflat") and wall and abs(nrm[1]) <= 0.7:
            continue
        if r.get("bands") == "truss" and not any(a <= zc <= b for a, b in bands):
            continue
        if "maxw" in r and width > r["maxw"]:
            continue
        if "minh" in r and (z1 - z0) < r["minh"]:
            continue
        if "maxh" in r and (z1 - z0) > r["maxh"]:
            continue
        if "minarea" in r and area < r["minarea"]:
            continue
        if "outside" in r and outside < r["outside"]:
            continue
        if not wall and name not in ("edge", "plain", "crown", "led", "spire", "truss", "belly", "ctier"):
            return FEATURE["plain"]
        return FEATURE[name]
    return FEATURE["facade"] if wall else FEATURE["plain"]


# ------------------------------------------------------------------------------------------------ 输出编码

def q16(x: np.ndarray, lo: np.ndarray, span: np.ndarray) -> np.ndarray:
    return np.clip(np.round((x - lo) / np.maximum(span, 1e-9) * 65535), 0, 65535).astype(np.uint16)


def encode_mesh(pos: np.ndarray, nrm: np.ndarray, uv: np.ndarray, rect: np.ndarray, col: np.ndarray, fac: np.ndarray,
                grid: np.ndarray, idx: np.ndarray, nw: np.ndarray | None = None) -> bytes:
    """pos：模拟坐标米 (n,3)；nw：法线的第 4 分量（−1…1，LED 线顶点的左右号；默认 0）；其余见文件头。返回 CLMK v1 字节。"""
    three = np.stack([pos[:, 0], pos[:, 2], -pos[:, 1]], 1)
    lo = three.min(0)
    span = np.maximum(three.max(0) - lo, 1e-3)
    p = np.zeros((len(pos), 4), np.uint16)
    p[:, :3] = q16(three, lo, span)
    n3 = np.stack([nrm[:, 0], nrm[:, 2], -nrm[:, 1]], 1)
    nn = np.zeros((len(pos), 4), np.int8)
    nn[:, :3] = np.clip(np.round(n3 * 127), -127, 127).astype(np.int8)
    if nw is not None:
        nn[:, 3] = np.clip(np.round(np.asarray(nw, np.float64) * 127), -127, 127).astype(np.int8)
    uvq = np.clip(np.round(uv * 65535), 0, 65535).astype(np.uint16)
    rq = np.clip(np.round(rect * 65535), 0, 65535).astype(np.uint16)
    big = len(pos) > 65535
    flags = 1 if big else 0
    head = b"CLMK" + struct.pack("<HHII", 1, flags, len(pos), len(idx)) + struct.pack("<3f", *lo.astype(np.float32)) + \
        struct.pack("<3f", *span.astype(np.float32)) + b"\0" * 8
    ib = idx.astype("<u4" if big else "<u2").tobytes()
    ib += b"\0" * ((-len(ib)) % 4)
    return b"".join([head, p.astype("<u2").tobytes(), nn.tobytes(), uvq.astype("<u2").tobytes(), rq.astype("<u2").tobytes(),
                     col.astype(np.uint8).tobytes(), fac.astype("<i2").tobytes(), grid.astype(np.uint8).tobytes(), ib])


def decode_mesh(b: bytes) -> dict:
    """encode_mesh 的逆（自测与调试用）。"""
    if b[:4] != b"CLMK":
        raise ValueError("magic")
    ver, flags, nv, ni = struct.unpack_from("<HHII", b, 4)
    lo = np.array(struct.unpack_from("<3f", b, 16))
    span = np.array(struct.unpack_from("<3f", b, 28))
    o = 48
    out = {"version": ver, "nv": nv, "ni": ni}
    for name, dt, k in (("pos", "<u2", 4), ("nrm", "i1", 4), ("uv", "<u2", 2), ("rect", "<u2", 4), ("col", "u1", 4), ("fac", "<i2", 2),
                        ("grid", "u1", 4)):
        a = np.frombuffer(b, dt, nv * k, o).reshape(nv, k)
        o += a.nbytes
        out[name] = a
    out["idx"] = np.frombuffer(b, "<u4" if flags & 1 else "<u2", ni, o)
    out["three"] = out["pos"][:, :3] / 65535.0 * span + lo
    return out


def webp_bytes(rgba: np.ndarray, q: int) -> bytes:
    bio = io.BytesIO()
    Image.fromarray(rgba, "RGBA").save(bio, "WEBP", quality=q, method=6, exact=True)
    return bio.getvalue()


def sha8(b: bytes) -> tuple[str, str]:
    h = hashlib.sha256(b).hexdigest()
    return h, h[:8]


# ------------------------------------------------------------------------------------------------ GPU 压缩贴图（BC3 / ETC2-EAC）

def blocks_of(img: np.ndarray) -> np.ndarray:
    """(H, W, C) → (N, 16, C)：块按行优先、块内像素按行优先（i = y × 4 + x）。H、W 须是 4 的倍数。"""
    H, W, C = img.shape
    return img.reshape(H // 4, 4, W // 4, 4, C).transpose(0, 2, 1, 3, 4).reshape(-1, 16, C)


def unblocks(b: np.ndarray, H: int, W: int) -> np.ndarray:
    return b.reshape(H // 4, W // 4, 4, 4, b.shape[-1]).transpose(0, 2, 1, 3, 4).reshape(H, W, b.shape[-1])


def _exp565(q: np.ndarray) -> np.ndarray:
    r = (q >> 11) & 31
    g = (q >> 5) & 63
    b = q & 31
    return np.stack([(r << 3) | (r >> 2), (g << 2) | (g >> 4), (b << 3) | (b >> 2)], -1).astype(np.float64)


def _to565(c: np.ndarray) -> np.ndarray:
    c = np.clip(c, 0, 255)
    return (np.round(c[..., 0] * 31 / 255).astype(np.int64) << 11) | (np.round(c[..., 1] * 63 / 255).astype(np.int64) << 5) | \
        np.round(c[..., 2] * 31 / 255).astype(np.int64)


def bc1_color(px: np.ndarray) -> np.ndarray:
    """px (N, 16, 3) → (N, 8) uint8 颜色块：4 色模式（c0 > c1），端点取主轴上的范围，索引取最近色。"""
    N = len(px)
    mean = px.mean(1)
    d = px - mean[:, None]
    cov = np.einsum("npi,npj->nij", d, d)
    axis = np.tile(np.array([0.577, 0.577, 0.577]), (N, 1))
    for _ in range(6):
        a = np.einsum("nij,nj->ni", cov, axis)
        nrm = np.linalg.norm(a, axis=1, keepdims=True)
        axis = np.where(nrm > 1e-9, a / np.maximum(nrm, 1e-12), axis)
    t = np.einsum("npi,ni->np", d, axis)
    q0 = _to565(mean + t.max(1)[:, None] * axis)
    q1 = _to565(mean + t.min(1)[:, None] * axis)
    q0, q1 = np.where(q0 < q1, q1, q0), np.where(q0 < q1, q0, q1)
    c0, c1 = _exp565(q0), _exp565(q1)
    pal = np.stack([c0, c1, (2 * c0 + c1) / 3, (c0 + 2 * c1) / 3], 1)
    idx = ((px[:, :, None, :] - pal[:, None, :, :]) ** 2).sum(-1).argmin(-1)
    idx[q0 == q1] = 0
    bits = (idx.astype(np.uint64) << (2 * np.arange(16, dtype=np.uint64))).sum(1)
    out = np.zeros((N, 8), np.uint8)
    out[:, 0], out[:, 1], out[:, 2], out[:, 3] = q0 & 255, q0 >> 8, q1 & 255, q1 >> 8
    for k in range(4):
        out[:, 4 + k] = (bits >> np.uint64(8 * k)) & np.uint64(255)
    return out


def bc3_alpha(a: np.ndarray) -> np.ndarray:
    """a (N, 16) → (N, 8) uint8：8 值模式（a0 = 最大 > a1 = 最小）。"""
    N = len(a)
    a0 = np.round(a.max(1)).astype(np.int64)
    a1 = np.round(a.min(1)).astype(np.int64)
    vals = np.zeros((N, 8))
    vals[:, 0], vals[:, 1] = a0, a1
    for i in range(2, 8):
        vals[:, i] = ((8 - i) * a0 + (i - 1) * a1) // 7
    idx = np.abs(a[:, :, None] - vals[:, None, :]).argmin(-1)
    idx[a0 == a1] = 0
    bits = (idx.astype(np.uint64) << (3 * np.arange(16, dtype=np.uint64))).sum(1)
    out = np.zeros((N, 8), np.uint8)
    out[:, 0], out[:, 1] = a0, a1
    for k in range(6):
        out[:, 2 + k] = (bits >> np.uint64(8 * k)) & np.uint64(255)
    return out


def bc3_encode(img: np.ndarray) -> bytes:
    """RGBA uint8 (H, W, 4) → BC3 / DXT5 块（每块 16 字节：alpha 8 + 颜色 8，小端）。"""
    b = blocks_of(img.astype(np.float64))
    out = np.zeros((len(b), 16), np.uint8)
    for s in range(0, len(b), 32768):
        out[s:s + 32768, :8] = bc3_alpha(b[s:s + 32768, :, 3])
        out[s:s + 32768, 8:] = bc1_color(b[s:s + 32768, :, :3])
    return out.tobytes()


def bc3_decode(data: bytes, H: int, W: int) -> np.ndarray:
    blk = np.frombuffer(data, np.uint8).reshape(-1, 16).astype(np.int64)
    N = len(blk)
    a0, a1 = blk[:, 0], blk[:, 1]
    abits = sum(blk[:, 2 + k].astype(np.uint64) << np.uint64(8 * k) for k in range(6))
    aidx = ((abits[:, None] >> (3 * np.arange(16, dtype=np.uint64))) & np.uint64(7)).astype(np.int64)
    big = a0 > a1
    vals = np.zeros((N, 8), np.int64)
    vals[:, 0], vals[:, 1] = a0, a1
    for i in range(2, 8):
        vals[:, i] = np.where(big, ((8 - i) * a0 + (i - 1) * a1) // 7, ((6 - i) * a0 + (i - 1) * a1) // 5 if i < 6 else (0 if i == 6 else 255))
    alpha = np.take_along_axis(vals, aidx, 1)
    q0 = blk[:, 8] | (blk[:, 9] << 8)
    q1 = blk[:, 10] | (blk[:, 11] << 8)
    c0, c1 = _exp565(q0), _exp565(q1)
    pal = np.stack([c0, c1, (2 * c0 + c1) // 3, (c0 + 2 * c1) // 3], 1)
    cbits = sum(blk[:, 12 + k].astype(np.uint64) << np.uint64(8 * k) for k in range(4))
    cidx = ((cbits[:, None] >> (2 * np.arange(16, dtype=np.uint64))) & np.uint64(3)).astype(np.int64)
    rgb = np.take_along_axis(pal, cidx[:, :, None].repeat(3, 2), 1)
    return unblocks(np.concatenate([rgb, alpha[:, :, None]], -1), H, W).astype(np.uint8)


ETC1_TABLES = np.array([[2, 8], [5, 17], [9, 29], [13, 42], [18, 60], [24, 80], [33, 106], [47, 183]], np.int64)
EAC_TABLES = np.array([
    [-3, -6, -9, -15, 2, 5, 8, 14], [-3, -7, -10, -13, 2, 6, 9, 12], [-2, -5, -8, -13, 1, 4, 7, 12],
    [-2, -4, -6, -13, 1, 3, 5, 12], [-3, -6, -8, -12, 2, 5, 7, 11], [-3, -7, -9, -11, 2, 6, 8, 10],
    [-4, -7, -8, -11, 3, 6, 7, 10], [-3, -5, -8, -11, 2, 4, 7, 10], [-2, -6, -8, -10, 1, 5, 7, 9],
    [-2, -5, -8, -10, 1, 4, 7, 9], [-2, -4, -8, -10, 1, 3, 7, 9], [-2, -5, -7, -10, 1, 4, 6, 9],
    [-3, -4, -7, -10, 2, 3, 6, 9], [-1, -2, -3, -10, 0, 1, 2, 9], [-4, -6, -8, -9, 3, 5, 7, 8],
    [-3, -5, -7, -9, 2, 4, 6, 8]], np.int64)
# ETC 块内像素按列优先编号（p = x × 4 + y）；COLMAJ[i] = 行优先像素 i 的列优先编号
COLMAJ = np.array([x * 4 + y for y in range(4) for x in range(4)])


def eac_alpha(a: np.ndarray) -> np.ndarray:
    """a (N, 16) → (N,) uint64 EAC 块（按大端写出）：16 张表 × 估计倍数 ±1 × 两种基值，取误差最小。"""
    N = len(a)
    lo, hi = a.min(1), a.max(1)
    best_err = np.full(N, np.inf)
    best = np.zeros((N, 3), np.int64)
    best_idx = np.zeros((N, 16), np.int64)
    for t in range(16):
        T = EAC_TABLES[t]
        tmin, tmax = T.min(), T.max()
        m0 = np.clip(np.round((hi - lo) / max(tmax - tmin, 1)), 1, 15)
        for dm in (-1, 0, 1):
            m = np.clip(m0 + dm, 1, 15)
            for bmode in range(2):
                base = np.round(lo - tmin * m) if bmode == 0 else np.round((hi + lo) / 2 - (tmax + tmin) / 2 * m)
                base = np.clip(base, 0, 255)
                vals = np.clip(base[:, None] + T[None, :] * m[:, None], 0, 255)
                d = (a[:, :, None] - vals[:, None, :]) ** 2
                idx = d.argmin(-1)
                err = np.take_along_axis(d, idx[:, :, None], -1)[..., 0].sum(1)
                upd = err < best_err
                best_err = np.where(upd, err, best_err)
                best[upd] = np.stack([base[upd], m[upd], np.full(int(upd.sum()), t)], 1).astype(np.int64)
                best_idx[upd] = idx[upd]
    word = (best[:, 0].astype(np.uint64) << np.uint64(56)) | (best[:, 1].astype(np.uint64) << np.uint64(52)) | \
        (best[:, 2].astype(np.uint64) << np.uint64(48))
    for i in range(16):
        word |= best_idx[:, i].astype(np.uint64) << np.uint64(45 - 3 * int(COLMAJ[i]))
    return word


def _etc_sub(px: np.ndarray, base: np.ndarray) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """子块 px (N, 8, 3)、基色 (N, 3) → (误差, 表号, 每像素索引值：0 = +a、1 = +b、2 = −a、3 = −b)。"""
    N = len(px)
    best_err = np.full(N, np.inf)
    best_t = np.zeros(N, np.int64)
    best_i = np.zeros((N, 8), np.int64)
    for t in range(8):
        a, b = ETC1_TABLES[t]
        cand = np.clip(base[:, None, :] + np.array([a, b, -a, -b])[None, :, None], 0, 255)
        d = ((px[:, :, None, :] - cand[:, None, :, :]) ** 2).sum(-1)
        idx = d.argmin(-1)
        err = np.take_along_axis(d, idx[:, :, None], -1)[..., 0].sum(1)
        upd = err < best_err
        best_err = np.where(upd, err, best_err)
        best_t[upd] = t
        best_i[upd] = idx[upd]
    return best_err, best_t, best_i


def etc1_rgb(px: np.ndarray) -> np.ndarray:
    """px (N, 16, 3) → (N,) uint64 ETC1 块：独立（444）/ 差分（555 + 333，只在不溢出时用，ETC2 解码器按 ETC1 解）× 两种分块。"""
    N = len(px)
    ys, xs = np.arange(16) // 4, np.arange(16) % 4
    best_err = np.full(N, np.inf)
    best_word = np.zeros(N, np.uint64)
    for flip in (0, 1):
        s1 = (xs < 2) if flip == 0 else (ys < 2)
        i1, i2 = np.nonzero(s1)[0], np.nonzero(~s1)[0]
        p1, p2 = px[:, i1], px[:, i2]
        avg1, avg2 = p1.mean(1), p2.mean(1)
        q1 = np.clip(np.round(avg1 * 15 / 255), 0, 15).astype(np.int64)
        q2 = np.clip(np.round(avg2 * 15 / 255), 0, 15).astype(np.int64)
        e1, t1, k1 = _etc_sub(p1, (q1 * 17).astype(np.float64))
        e2, t2, k2 = _etc_sub(p2, (q2 * 17).astype(np.float64))
        r1 = np.clip(np.round(avg1 * 31 / 255), 0, 31).astype(np.int64)
        r2 = np.clip(np.round(avg2 * 31 / 255), 0, 31).astype(np.int64)
        dd = r2 - r1
        okd = (dd >= -4).all(1) & (dd <= 3).all(1)
        r2c = r1 + np.clip(dd, -4, 3)
        f1, u1, l1 = _etc_sub(p1, ((r1 << 3) | (r1 >> 2)).astype(np.float64))
        f2, u2, l2 = _etc_sub(p2, ((r2c << 3) | (r2c >> 2)).astype(np.float64))
        err_d = np.where(okd, f1 + f2, np.inf)
        use_d = err_d < e1 + e2
        err = np.minimum(e1 + e2, err_d)
        w_i = np.zeros(N, np.uint64)
        w_d = np.zeros(N, np.uint64)
        dq = np.clip(dd, -4, 3) & 7
        for c in range(3):
            w_i |= (q1[:, c].astype(np.uint64) << np.uint64(60 - 8 * c)) | (q2[:, c].astype(np.uint64) << np.uint64(56 - 8 * c))
            w_d |= (r1[:, c].astype(np.uint64) << np.uint64(59 - 8 * c)) | (dq[:, c].astype(np.uint64) << np.uint64(56 - 8 * c))
        w_i |= (t1.astype(np.uint64) << np.uint64(37)) | (t2.astype(np.uint64) << np.uint64(34))
        w_d |= (u1.astype(np.uint64) << np.uint64(37)) | (u2.astype(np.uint64) << np.uint64(34)) | (np.uint64(1) << np.uint64(33))
        word = np.where(use_d, w_d, w_i) | (np.uint64(flip) << np.uint64(32))
        ki = np.zeros((N, 16), np.int64)
        ki[:, i1] = np.where(use_d[:, None], l1, k1)
        ki[:, i2] = np.where(use_d[:, None], l2, k2)
        for i in range(16):
            p = int(COLMAJ[i])
            v = ki[:, i]
            word |= ((v & 1).astype(np.uint64) << np.uint64(p)) | (((v >> 1) & 1).astype(np.uint64) << np.uint64(16 + p))
        upd = err < best_err
        best_err = np.where(upd, err, best_err)
        best_word = np.where(upd, word, best_word)
    return best_word


def etc2_encode(img: np.ndarray) -> bytes:
    """RGBA uint8 (H, W, 4) → ETC2 RGBA8 EAC 块（每块 16 字节：EAC alpha 8 + ETC 颜色 8，各为大端 64 位）。"""
    b = blocks_of(img.astype(np.float64))
    out = np.zeros((len(b), 2), np.uint64)
    for s in range(0, len(b), 16384):
        out[s:s + 16384, 0] = eac_alpha(b[s:s + 16384, :, 3])
        out[s:s + 16384, 1] = etc1_rgb(b[s:s + 16384, :, :3])
    return out.astype(">u8").tobytes()


def etc2_decode(data: bytes, H: int, W: int) -> np.ndarray:
    w = np.frombuffer(data, ">u8").reshape(-1, 2).astype(np.uint64)
    N = len(w)
    aw, cw = w[:, 0], w[:, 1]
    base = ((aw >> np.uint64(56)) & np.uint64(255)).astype(np.int64)
    mult = ((aw >> np.uint64(52)) & np.uint64(15)).astype(np.int64)
    tab = ((aw >> np.uint64(48)) & np.uint64(15)).astype(np.int64)
    alpha = np.zeros((N, 16), np.int64)
    diff = ((cw >> np.uint64(33)) & np.uint64(1)).astype(bool)
    flip = ((cw >> np.uint64(32)) & np.uint64(1)).astype(bool)
    t1 = ((cw >> np.uint64(37)) & np.uint64(7)).astype(np.int64)
    t2 = ((cw >> np.uint64(34)) & np.uint64(7)).astype(np.int64)
    b1 = np.zeros((N, 3), np.int64)
    b2 = np.zeros((N, 3), np.int64)
    for c in range(3):
        r5 = ((cw >> np.uint64(59 - 8 * c)) & np.uint64(31)).astype(np.int64)
        d3 = ((cw >> np.uint64(56 - 8 * c)) & np.uint64(7)).astype(np.int64)
        d3 = np.where(d3 >= 4, d3 - 8, d3)
        r52 = r5 + d3
        b1[:, c] = np.where(diff, (r5 << 3) | (r5 >> 2), ((cw >> np.uint64(60 - 8 * c)) & np.uint64(15)).astype(np.int64) * 17)
        b2[:, c] = np.where(diff, (r52 << 3) | (r52 >> 2), ((cw >> np.uint64(56 - 8 * c)) & np.uint64(15)).astype(np.int64) * 17)
    rgb = np.zeros((N, 16, 3), np.int64)
    for i in range(16):
        p = int(COLMAJ[i])
        alpha[:, i] = np.clip(base + EAC_TABLES[tab, ((aw >> np.uint64(45 - 3 * p)) & np.uint64(7)).astype(np.int64)] * mult, 0, 255)
        v = ((cw >> np.uint64(16 + p)) & np.uint64(1)).astype(np.int64) * 2 + ((cw >> np.uint64(p)) & np.uint64(1)).astype(np.int64)
        second = np.where(flip, i // 4 >= 2, i % 4 >= 2)
        t = np.where(second, t2, t1)
        mod = np.select([v == 0, v == 1, v == 2], [ETC1_TABLES[t, 0], ETC1_TABLES[t, 1], -ETC1_TABLES[t, 0]], -ETC1_TABLES[t, 1])
        rgb[:, i] = np.clip(np.where(second[:, None], b2, b1) + mod[:, None], 0, 255)
    return unblocks(np.concatenate([rgb, alpha[:, :, None]], -1), H, W).astype(np.uint8)


CLTX_BC3 = 1
CLTX_ETC2 = 2


def cltx(fmt: int, levels: list[np.ndarray]) -> bytes:
    """GPU 压缩贴图容器 CLTX v1（小端）：'CLTX'、版本 u16、格式 u16（1 = BC3 / DXT5 sRGB、2 = ETC2 RGBA8 EAC sRGB）、
    宽 u32、高 u32、级数 u32、各级字节数 u32 × 级数，之后逐级的块数据。levels：RGBA uint8，从大到小，边长是 4 的倍数。"""
    enc = bc3_encode if fmt == CLTX_BC3 else etc2_encode
    datas = [enc(l) for l in levels]
    head = b"CLTX" + struct.pack("<HHIII", 1, fmt, levels[0].shape[1], levels[0].shape[0], len(levels))
    head += b"".join(struct.pack("<I", len(d)) for d in datas)
    return head + b"".join(datas)


def cltx_drop_top(data: bytes, k: int = 1) -> bytes:
    """CLTX 去掉最大的 k 级 mip（各级独立编码，所以结果逐字节等于 cltx(fmt, levels[k:])）。"""
    if data[:4] != b"CLTX":
        raise ValueError("不是 CLTX")
    ver, fmt, w, h, n = struct.unpack_from("<HHIII", data, 4)
    if ver != 1 or not 0 < k < n:
        raise ValueError(f"CLTX 版本 {ver} / 级数 {n} 不能去掉 {k} 级")
    lens = list(struct.unpack_from(f"<{n}I", data, 20))
    off = 20 + 4 * n + sum(lens[:k])
    rest = lens[k:]
    head = b"CLTX" + struct.pack("<HHIII", 1, fmt, max(1, w >> k), max(1, h >> k), len(rest))
    head += b"".join(struct.pack("<I", x) for x in rest)
    body = data[off:off + sum(rest)]
    if len(body) != sum(rest):
        raise ValueError("CLTX 数据不足")
    return head + body


def mip_chain(lin: np.ndarray, glass: np.ndarray, top: int, smallest: int = 4) -> list[np.ndarray]:
    """线性颜色 + 玻璃度（L0 浮点）→ 从边长 top 起、逐级 2×2 平均到 smallest 的 RGBA uint8（颜色转 sRGB）。"""
    out = []
    c = lin
    g = glass
    while c.shape[0] > top:
        c = c.reshape(c.shape[0] // 2, 2, c.shape[1] // 2, 2, 3).mean((1, 3))
        g = g.reshape(g.shape[0] // 2, 2, g.shape[1] // 2, 2).mean((1, 3))
    while True:
        rgb = np.clip(linear_to_srgb(c) * 255 + 0.5, 0, 255).astype(np.uint8)
        out.append(np.dstack([rgb, np.clip(g * 255 + 0.5, 0, 255).astype(np.uint8)]))
        if min(c.shape[:2]) <= smallest:
            break
        c = c.reshape(c.shape[0] // 2, 2, c.shape[1] // 2, 2, 3).mean((1, 3))
        g = g.reshape(g.shape[0] // 2, 2, g.shape[1] // 2, 2).mean((1, 3))
    return out


# ------------------------------------------------------------------------------------------------ 主流程

def aviation_points(V: np.ndarray) -> list[int]:
    """航空障碍灯：网格最高 1 m 内的顶点按平面 6 m 聚类，每簇最高点上方 0.3 m 一盏（最多 4 盏）。返回扁平 dm 整数。"""
    zmax = float(V[:, 2].max())
    top = V[V[:, 2] > zmax - 1.0]
    top = top[np.lexsort((top[:, 1], top[:, 0], -top[:, 2]))]
    out: list[np.ndarray] = []
    for p in top:
        if all(math.hypot(p[0] - q[0], p[1] - q[1]) > 6.0 for q in out):
            out.append(p)
        if len(out) >= 4:
            break
    return [int(round(v)) for p in out for v in (p[0] * 10, p[1] * 10, (p[2] + 0.3) * 10)]


class LM:
    """一座地标的中间结果。"""

    def __init__(self, spec: dict, pl: dict, index: int):
        self.spec = spec
        self.id = spec["id"]
        self.index = index
        self.pl = pl
        self.ring = ring_xy(pl["footprint"]["outer"])
        self.base = pl["base"] / 10.0
        self.charts: list[Chart] = []
        self.lines: list[tuple] = []
        # prism-tower：结构件块 (块, 结构件掩膜, px/m, Hough 线段 [(A, B)]（模拟坐标）)，见 structural_lines
        self.members: list[tuple] = []
        self.core: tuple[np.ndarray, np.ndarray] = (np.zeros((0, 3)), np.zeros((0, 3), np.int64))


def extra_lines(lm: LM) -> None:
    """按网格几何补的 LED 线（照片里没法 Hough 出来的）与 harbour-spire 的冠顶发光芯：
    - trussLines（steel-frame）：每个桁架块（细长、填充率高）沿长轴中线一条红线；同一根构件的几个面在 merge_lines 里并成一条；
    - redVerticals（steel-frame）：南北立面上几条红色竖线（位置见 LANDMARKS），前后贴在该处最外面的网格上，上下从最低到最高的桁架带；
    - tierLines（neon-centre）：冠顶阶梯的外凸水平棱；
    - crownCore（harbour-spire）：见 crown_core。"""
    spec = lm.spec
    if spec.get("trussLines"):
        raw = []
        for c in lm.charts:
            if c.feature != FEATURE["truss"]:
                continue
            Lu, Lw = c.u1 - c.u0, c.w1 - c.w0
            long_, short_ = max(Lu, Lw), min(Lu, Lw)
            if long_ < 3.0 or long_ < 2.5 * short_ or c.area < 0.45 * Lu * Lw:
                continue
            if Lu >= Lw:
                AB = chart_point(c, np.array([c.u0, c.u1]), np.full(2, 0.5 * (c.w0 + c.w1)))
            else:
                AB = chart_point(c, np.full(2, 0.5 * (c.u0 + c.u1)), np.array([c.w0, c.w1]))
            raw.append((AB[0], AB[1], LINE_COLOURS["red"], TRUSS_LINE_W, c.n.copy()))
        lm.lines.extend(merge_lines(raw, tol=1.2, ang_deg=6.0, gap=2.0))
    rv = spec.get("redVerticals")
    if rv and lm.bands:
        bands = sorted(lm.bands)
        zlo = float(rv["zmin"])
        zhi = bands[min(int(rv["upToBand"]), len(bands) - 1)][1]
        loc = frame_xy(spec, lm.V[:, :2])
        a = math.radians(spec.get("frame", 0.0))
        E = np.array([math.cos(a), math.sin(a)])
        N = np.array([-math.sin(a), math.cos(a)])
        for e in rv["e"]:
            sel = (np.abs(loc[:, 0] - e) < rv["halfWidth"]) & (lm.V[:, 2] > zlo) & (lm.V[:, 2] < zhi)
            if not sel.any():
                continue
            for front, sgn in ((float(loc[sel, 1].max()), 1.0), (float(loc[sel, 1].min()), -1.0)):
                xy = e * E + front * N
                A = np.array([xy[0], xy[1], zlo])
                B = np.array([xy[0], xy[1], zhi])
                lm.lines.append((A, B, LINE_COLOURS["red"], RED_VERTICAL_W, np.array([N[0] * sgn, N[1] * sgn, 0.0])))
    if spec.get("members"):
        # prism-tower：照片 Hough 出来的结构件线段按面整理、吸到网格的轮廓与角点上（structural_lines），
        # 各三角锥的棱（网格的外凸折线）另外补上；两者共线的部分在 run() 最后的 merge_lines 里并成一条
        lm.lines = structural_lines(lm)
        lm.lines.extend(convex_edges(lm.V, lm.F, lm.base + 22.0, spec["members"].get("creaseZmax", 1e9), 6.0, min_deg=25.0,
                                     colour=LINE_COLOURS["white"], horizontal=False))
        # 同一根构件的轮廓边与外凸棱（不同的面各出一条）可能相距不到 1 m：并成一条
        lm.lines = merge_lines(lm.lines, tol=1.0, ang_deg=5.0, gap=0.8)
    tl = spec.get("tierLines")
    if tl:
        lm.lines.extend(convex_edges(lm.V, lm.F, tl["zmin"], tl["zmax"], tl["minLen"]))
    cc = spec.get("crownCore")
    if cc:
        lm.core = crown_core(lm.V, cc["zmin"], cc["shrink"], cc["tris"])


def build_charts(lm: LM, V: np.ndarray, F: np.ndarray) -> None:
    zc = V[F].mean(1)[:, 2]
    band = (zc >= lm.base + STREET_M).astype(np.int64)
    chart = make_charts(V, F, band)
    P = V[F]
    n, area = tri_normals(P)
    order = np.argsort(chart, kind="stable")
    cs = chart[order]
    starts = np.r_[0, np.nonzero(np.diff(cs))[0] + 1, len(cs)]
    lm.V, lm.F = V, F
    for a, b in zip(starts[:-1], starts[1:]):
        faces = order[a:b]
        c = Chart()
        c.id = len(lm.charts)
        c.faces = faces
        nn = (n[faces] * area[faces, None]).sum(0)
        c.n = nn / max(float(np.linalg.norm(nn)), 1e-12)
        s = faces[np.argmax(area[faces])]
        if float(c.n @ n[s]) < 0.5:
            c.n = n[s]
        c.t, c.b = chart_basis(c.n)
        c.th = c.t.copy()
        pts = P[faces].reshape(-1, 3)
        c.d0 = float(np.median(pts @ c.n))
        uu, ww = pts @ c.t, pts @ c.b
        # 斜的、三角形的块：图集里按最小外接矩形的方向摆（省图集）；立面的水平坐标（竖梃、租户段）仍用 th
        ang = min_rect_angle(np.stack([uu, ww], 1))
        if ang is not None:
            ca, sa = math.cos(ang), math.sin(ang)
            c.t, c.b = ca * c.t + sa * c.b, -sa * c.t + ca * c.b
            uu, ww = pts @ c.t, pts @ c.b
        c.u0, c.u1, c.w0, c.w1 = float(uu.min()), float(uu.max()), float(ww.min()), float(ww.max())
        c.band = int(band[faces[0]])
        c.zlo, c.zhi = float(pts[:, 2].min()), float(pts[:, 2].max())
        c.area = float(area[faces].sum())
        c.textured = False
        c.rect = None
        c.cover = 1.0
        c.feature = 0
        c.mull = lm.spec["mull"]
        c.phase = 0.0
        c.ss = 1
        c.dens = 1.0
        lm.charts.append(c)


def min_rect_angle(p: np.ndarray) -> float | None:
    """二维点集的最小面积外接矩形：返回把它转正的角度（弧度）；比轴向外接框省不到 15 % 时返回 None（保持 u 水平）。"""
    pts = np.unique(np.round(p, 3), axis=0)
    if len(pts) < 3:
        return None
    pts = pts[np.lexsort((pts[:, 1], pts[:, 0]))]

    def half(q: np.ndarray) -> list:
        h: list = []
        for x in q:
            while len(h) >= 2 and (h[-1][0] - h[-2][0]) * (x[1] - h[-2][1]) - (h[-1][1] - h[-2][1]) * (x[0] - h[-2][0]) <= 0:
                h.pop()
            h.append(x)
        return h

    hull = np.array(half(pts)[:-1] + half(pts[::-1])[:-1])
    if len(hull) < 3:
        return None
    ext = hull.max(0) - hull.min(0)
    base = float(ext[0] * ext[1])
    best, best_a = base, None
    for a, b in zip(hull, np.roll(hull, -1, 0)):
        e = b - a
        L = float(np.hypot(e[0], e[1]))
        if L < 1e-6:
            continue
        ang = math.atan2(e[1], e[0])
        ca, sa = math.cos(ang), math.sin(ang)
        r = hull @ np.array([[ca, -sa], [sa, ca]])
        ex = r.max(0) - r.min(0)
        ar = float(ex[0] * ex[1])
        if ar < best - 1e-9:
            best, best_a = ar, ang
    return best_a if best_a is not None and best < 0.85 * base else None


def allocate(lms: list[LM]) -> float:
    """按面积定密度并装箱（街面带 STREET_K 倍）：太小的块用顶点色；放不下就整体降 3 % 重来。返回上部密度（px/m）。"""
    all_ch = [c for lm in lms for c in lm.charts]

    def size(c: Chart, d: float) -> tuple[int, int]:
        dc = d * (STREET_K if c.band == 0 else 1.0)
        return int(math.ceil((c.u1 - c.u0) * dc)), int(math.ceil((c.w1 - c.w0) * dc))

    d = 4.0
    for _ in range(120):
        rects, idx = [], []
        for c in all_ch:
            w, h = size(c, d)
            c.dens = d * (STREET_K if c.band == 0 else 1.0)
            c.textured = w * h >= MIN_CHART_PX and min(w, h) >= MIN_SIDE_PX and c.cover >= 0.3
            if c.textured:
                rects.append((w + 2 * PAD, h + 2 * PAD))
                idx.append(c)
        pos = pack(rects, ATLAS)
        if pos is not None:
            for c, (x, y), (w, h) in zip(idx, pos, rects):
                c.rect = (x, y, w, h)
            for c in all_ch:
                if not c.textured:
                    c.rect = None
            return d
        d *= 0.97
    raise RuntimeError("图集装不下")


def analyse_grid(lm: LM) -> None:
    """层高 / 楼层相位（整座）与每个大墙块的竖梃间距、相位：只在 ANALYSIS_PX_M 的窗口里取样（不进图集）。
    逐块检测（玻璃度与亮度的竖向剖面自相关，取分高的那个），整座的层高 = 分数加权中位数，相位 = 层高相近的块的圆周平均；
    合成一条剖面再检测会被各块窗口的接缝搅乱（steel-frame 原型的遮阳百叶尤其如此），逐块更稳。"""
    models = lm.src["models"]
    pxm = ANALYSIS_PX_M
    big = [c for c in lm.charts if abs(c.n[2]) < 0.3 and c.area >= 150 and c.zhi > lm.base + 25 and (c.u1 - c.u0) >= 6]
    fl: list[tuple[float, float, float]] = []   # (层高, 楼层线绝对高程, 分数)
    Ms = []
    mlo, mhi = lm.spec.get("mullRange", (0.9, 3.2))
    for c in sorted(big, key=lambda c: -c.area)[:40]:
        wv = abs(c.b[2])
        if wv < 0.8 or not np.allclose(c.t, c.th) or c.b[2] <= 0:
            continue
        # 窗口：块的水平中段 ≤ 40 m、离楼底 25 m 以上的竖向 ≤ 60 m（b ≈ 竖直）
        uc = 0.5 * (c.u0 + c.u1)
        uw = min(ANALYSIS_WIN[0], c.u1 - c.u0)
        wlo = max(c.w0, c.w0 + (lm.base + 25 - c.zlo) / wv)
        whi = min(c.w1, wlo + ANALYSIS_WIN[1])
        if whi - wlo < 12:
            continue
        col, valid = bake_chart(c, lm.src, models, lm.prep, (uc - uw / 2, uc + uw / 2, wlo, whi))
        if valid.mean() < 0.5:
            continue
        srgb = linear_to_srgb(col)
        g = glass_mask(srgb, valid, pxm)
        lum = srgb @ np.array([0.2126, 0.7152, 0.0722])
        okr = valid.sum(1) > 0.3 * valid.shape[1]
        best = None
        for prof in ((g * valid).sum(1) / np.maximum(valid.sum(1), 1), (lum * valid).sum(1) / np.maximum(valid.sum(1), 1)):
            r = detect_period(prof, okr, pxm, 2.8, 5.2, 6.0)
            if r and (best is None or r[2] > best[2]):
                best = r
        if best and best[2] >= 0.3:
            # 剖面下标 0 是窗口最高的一行：楼层线高程 = 块上 b 坐标 whi − 相位，换成绝对高程
            zline = c.zlo + (whi - best[1] - c.w0) * wv
            fl.append((best[0], zline, best[2]))
        # 竖梃：亮度的列剖面（相位取亮度极大处：铝竖梃 / 外墙比玻璃亮）
        prof = (lum * valid).sum(0) / np.maximum(valid.sum(0), 1)
        okc = valid.sum(0) > 0.5 * valid.shape[0]
        r = detect_period(prof, okc, pxm, mlo, mhi, 3.0)
        if r and r[2] > 0.3:
            nb = max(6, int(r[0] * pxm))
            pos = np.arange(len(prof)) / pxm
            bins = np.minimum((np.mod(pos, r[0]) / r[0] * nb).astype(int), nb - 1)
            x = np.where(okc, prof - prof[okc].mean(), 0.0)
            fold = np.bincount(bins[okc], x[okc], nb) / np.maximum(np.bincount(bins[okc], None, nb), 1)
            c.mull = r[0]
            c.phase = (uc - uw / 2) + (int(np.argmax(fold)) + 0.5) / nb * r[0]
            Ms.append(r[0])
    for m in models:
        m.free()
    if fl:
        arr = np.array(fl)
        o = np.argsort(arr[:, 0])
        cw = np.cumsum(arr[o, 2])
        F_m = float(arr[o][np.searchsorted(cw, cw[-1] / 2), 0])
        near = np.abs(arr[:, 0] - F_m) < 0.03 * F_m
        ang = 2 * math.pi * np.mod(arr[near, 1], F_m) / F_m
        w = arr[near, 2]
        ph = (math.atan2(float((w * np.sin(ang)).sum()), float((w * np.cos(ang)).sum())) / (2 * math.pi)) % 1.0 * F_m
        lm.floors = (F_m, ph, float(w.mean()))
    else:
        F_m = lm.spec["floor"]
        lm.floors = (F_m, lm.base % F_m, 0.0)
    lm.mull = float(np.median(Ms)) if Ms else lm.spec["mull"]
    for c in lm.charts:
        if c.phase == 0.0:
            c.mull = lm.mull


def member_bands(lm: LM, atlas_g: np.ndarray, half: float = 0.6) -> None:
    """prism-tower（复审 R5b 修正二）：结构件块在图集里的玻璃度按最终的 LED 线重画——线两侧 half m 内是铝包结构件（0.4），
    其余一律玻璃（1）。原来铝包带取自 1.9 px/m 照片的结构件掩膜（Hough 中线 1.2 m 内），近看边缘毛糙、常偏在 LED 线一侧。
    线段只取在本块平面上的（两端离平面 ≤ 1 m）；块平面坐标与 chart_uv 相同（x 沿 t 从 u0 起、y 沿 b 从 w1 往下）。"""
    for c, _mem, _pxm, _ab in lm.members:
        if not c.textured or c.rect is None:
            continue
        x, y, w, h = c.rect
        iw, ih = w - 2 * PAD, h - 2 * PAD
        U, Wv = np.meshgrid(c.u0 + (np.arange(iw) + 0.5) / c.dens, c.w1 - (np.arange(ih) + 0.5) / c.dens)
        dmin = np.full(U.shape, np.inf)
        for A, B, _col, _wid, _nrm in lm.lines:
            if abs(float(A @ c.n) - c.d0) > 1.0 or abs(float(B @ c.n) - c.d0) > 1.0:
                continue
            a2 = np.array([float(A @ c.t), float(A @ c.b)])
            d2 = np.array([float(B @ c.t), float(B @ c.b)]) - a2
            L2 = max(float(d2 @ d2), 1e-9)
            tt = np.clip(((U - a2[0]) * d2[0] + (Wv - a2[1]) * d2[1]) / L2, 0.0, 1.0)
            np.minimum(dmin, np.hypot(U - a2[0] - tt * d2[0], Wv - a2[1] - tt * d2[1]), out=dmin)
        g = np.where(dmin <= half, 0.4, 1.0)
        atlas_g[y:y + h, x:x + w] = np.pad(g, ((PAD, PAD), (PAD, PAD)), mode="edge")


def low_massing(lm: LM) -> list[dict]:
    """steel-frame 的远景体块（massing_low）：近景网格里桅杆、桁架与轮廓外 1 m 以上的面不算楼体；桅杆长方体按每根桅杆框里
    「桅杆」块的顶点（本地 e / n 取 2–98 % 分位、顶取最高）；底 = 近景网格最低点（墙脚已压到地面以下）；
    横切高程：大堂顶（楼底 + 12 m）、街面带（楼底 + STREET_M）、红光楼梯间的上下限、此外每 25 m。"""
    spec = lm.spec
    fid = np.zeros(len(lm.F), np.int64)
    for c in lm.charts:
        fid[c.faces] = c.feature
    cen = lm.V[lm.F].mean(1)
    drop = np.isin(fid, [FEATURE["mast"], FEATURE["truss"]]) | (outside_dist(cen[:, :2], lm.ring) > 1.0)
    boxes = []
    m = spec.get("masts")
    if m:
        loc = frame_xy(spec, cen[:, :2])
        for me in m["e"]:
            for mn in m["n"]:
                sel = (fid == FEATURE["mast"]) & (np.abs(loc[:, 0] - me) <= m["half"]) & (np.abs(loc[:, 1] - mn) <= m["half"])
                if not sel.any():
                    continue
                pts = lm.V[np.unique(lm.F[sel])]
                lp = frame_xy(spec, pts[:, :2])
                boxes.append((float(np.percentile(lp[:, 0], 2)), float(np.percentile(lp[:, 0], 98)),
                              float(np.percentile(lp[:, 1], 2)), float(np.percentile(lp[:, 1], 98)), float(pts[:, 2].max())))
    cuts = {lm.base + 12.0, lm.base + STREET_M} | {lm.base + 25.0 * k for k in range(2, 40)}
    if "redcore" in spec:
        cuts |= {float(spec["redcore"]["zmin"]), float(spec["redcore"]["zmax"])}
    return massing_low(lm.V, lm.F, drop, spec, lm.ring, float(lm.V[:, 2].min()), sorted(cuts), boxes)


def run(src: pathlib.Path, out_city: pathlib.Path, raw_dir: pathlib.Path, debug: pathlib.Path | None, update: bool) -> dict:
    t0 = time.time()
    city = json.loads((CITY_DIR / "central.json").read_text(encoding="utf-8"))
    ground = Ground(CITY_DIR / "terrain.bin")
    zones = [ring_xy(z["area"]["outer"]) for z in city["zones"]["sensitive"]]
    pls = {l["id"]: l for l in city["landmarks"]}
    lms: list[LM] = []
    # 地标序号（网格里的「地标序号」、客户端的 uniform 数组下标）= 按 id 排序的序号，与 central.json 的 landmarks 数组同序
    order = sorted(spec["id"] for spec in LANDMARKS)
    for spec in LANDMARKS:
        lm = LM(spec, pls[spec["id"]], order.index(spec["id"]))
        s = load_landmark(src, spec)
        s, st = clean(s, lm.base, lm.ring, zones)
        s, pz = open_plaza(s, spec)
        if pz is not None:
            st["plaza"] = pz
        lm.src, lm.clean = s, st
        P = s["tris"]
        n, area = tri_normals(P)
        uvA = 0.5 * np.abs((s["uv"][:, 1, 0] - s["uv"][:, 0, 0]) * (s["uv"][:, 2, 1] - s["uv"][:, 0, 1]) -
                           (s["uv"][:, 2, 0] - s["uv"][:, 0, 0]) * (s["uv"][:, 1, 1] - s["uv"][:, 0, 1]))
        texpx = np.zeros(len(P))
        for k in np.unique(s["img"]):
            if k < 0:
                continue
            sel = s["img"] == k
            w, h = s["models"][int(s["model"][sel][0])].size(int(k))
            texpx[sel] = np.sqrt(uvA[sel] * w * h / np.maximum(area[sel], 1e-9))
        lm.prep = {"lo": P.min(1), "hi": P.max(1), "n": n, "texpx": texpx}
        Pr, Pp = split_protected(P, spec)
        if len(Pp):
            Vp, Fp = decimate(Pp, int(len(Pp) * spec["protect"]["ratio"]))
            Vr, Fr = decimate(Pr, spec["high"] - len(Fp))
            V, F = np.concatenate([Vr, Vp]), np.concatenate([Fr, Fp + len(Vr)])
            log(f"{lm.id}: 广场一层单独减面 {len(Pp)} → {len(Fp)} 个三角形")
        else:
            V, F = decimate(P, spec["high"])
        sunk = sink_base(V, ground)
        V, F = split_z(V, F, lm.base + STREET_M)
        build_charts(lm, V, F)
        lo3, hi3 = [], []
        for c in lm.charts:
            pts = lm.V[lm.F[c.faces]].reshape(-1, 3)
            lo3.append(pts.min(0))
            hi3.append(pts.max(0))
        lm.prep["chart_lo"], lm.prep["chart_hi"] = np.asarray(lo3), np.asarray(hi3)
        if spec.get("lowMassing"):
            # 远景体块在块的特征定下来之后才建（桅杆、桁架不算进楼体），见 run() 后面的 massing_low
            lm.VL, lm.FL, lm.low_cell = None, None, 0.0
        else:
            VL, FL, cell = decimate_low(P, spec["low"])
            sink_base(VL, ground)
            VL, FL = split_z(VL, FL, lm.base + STREET_M)
            lm.VL, lm.FL, lm.low_cell = VL, FL, cell
        lm.aviation = aviation_points(V)
        lm.bands = truss_bands(V, F, lm.ring, lm.base) if any(r[1].get("bands") for r in spec["rules"]) else []
        analyse_grid(lm)
        low_note = "体块（输出时建）" if lm.FL is None else f"{len(lm.FL)}（聚类 {lm.low_cell} m）"
        log(f"{lm.id}: 源 {st['input']} → 清理后 {st['kept']}（雕塑 {len(st['sculptures'])}、碎件 {st['fragmentTris']}、附属 "
            f"{st['appendageTris'] + st['outsideTris']}、敏感区 {st['sensitiveTris']}）；HIGH {len(F)}、LOW {low_note}、"
            f"块 {len(lm.charts)}、墙脚顶点 {sunk}、桁架带 {lm.bands}；层高 {lm.floors[0]:.2f} m（相位 {lm.floors[1]:.2f}、"
            f"自相关 {lm.floors[2]:.2f}）、竖梃 {lm.mull:.2f} m（{time.time() - t0:.0f} s）")
        lms.append(lm)
    # 预扫：每个块按 1 px/m 投一遍，几乎取不到照片的块（内面、被挡住的面）不进图集
    for lm in lms:
        for c in lm.charts:
            if c.area < 4.0:
                c.cover = 0.0
                continue
            c.dens, c.ss = 1.0, 1
            _, valid = bake_chart(c, lm.src, lm.src["models"], lm.prep)
            c.cover = float(valid.mean()) if valid.size else 0.0
        for m in lm.src["models"]:
            m.free()
    log(f"预扫完（{time.time() - t0:.0f} s）")
    d_up = allocate(lms)
    ntex = sum(1 for lm in lms for c in lm.charts if c.textured)
    log(f"图集 {ATLAS}²：上部 {d_up:.2f} px/m、街面 {d_up * STREET_K:.2f} px/m；{ntex} 个块进图集（{time.time() - t0:.0f} s）")

    atlas_lin = np.full((ATLAS, ATLAS, 3), 0.1)
    atlas_g = np.zeros((ATLAS, ATLAS))
    summary = {}
    for lm in lms:
        models = lm.src["models"]
        Ys = []
        for c in lm.charts:
            if c.textured:
                c.ss = int(min(MAX_SS, max(1, math.ceil(WORK_PX_M / c.dens))))
            else:
                # 顶点色：按约 2 px/m 取样求平均
                c.ss, c.dens = 1, max(2.0, 4.0 / max(min(c.u1 - c.u0, c.w1 - c.w0), 0.25))
            col, valid = bake_chart(c, lm.src, models, lm.prep)
            pxm = c.dens * c.ss
            col, valid = fill_holes(col, valid, max(1, int(1.0 * pxm)))
            c.work_col, c.work_valid = col, valid
            if valid.any():
                Ys.append(col[valid] @ np.array([0.2126, 0.7152, 0.0722]))
        for m in models:
            m.free()
        ref = float(np.median(np.concatenate(Ys))) if Ys else 0.2
        for c in lm.charts:
            pxm = c.dens * c.ss
            vv = c.work_valid
            if vv.any() and c.textured:
                c.work_col = delight(c.work_col, vv, ref, max(4, int(24 * pxm)))
            srgb = linear_to_srgb(c.work_col)
            gl = glass_mask(srgb, vv, pxm)
            frac = float(((gl > 0.5) & vv).sum()) / max(1, int(vv.sum()))
            gl = clean_glass(gl, srgb, vv, frac > 0.6)
            zc = 0.5 * (c.zlo + c.zhi)
            gfrac = float(gl[vv].mean()) if vv.any() else 0.5
            cpts = lm.V[np.unique(lm.F[c.faces])]
            cxy = cpts[:, :2].mean(0)
            c.feature = feature_of(lm.spec["rules"], c.zlo, c.zhi, lm.base, c.n, gfrac, lm.bands,
                                   float(np.ptp(cpts @ c.th)), c.area, float(outside_dist(cxy[None], lm.ring)[0]),
                                   where=region_flags(lm.spec, cxy, zc), nloc=frame_xy(lm.spec, c.n[None, :2])[0],
                                   ground=float(ground(cxy[None, 0], cxy[None, 1])[0]))
            if lm.spec.get("members") and zc >= lm.base + 22.0 and -0.5 < c.n[2] < 0.9 and c.textured:
                # 塔身（墙与斜的三角锥面）：玻璃度两档——Hough 中线 1.2 m 内的白色结构件 0.4（实墙：看得到铝包、不亮窗）、其余一律玻璃 1
                # （照片里离中线远的「结构件」、玻璃里的白天倒影都不要）；LED 光是中线线段本身，写成 LED 线几何（line_quads）
                mem = members_mask(srgb, vv, pxm)
                core, segs = member_lines(mem, pxm)
                near = box_blur((core > 0.5).astype(np.float64), max(1, int(round(1.2 * pxm)))) > 1e-6
                gl = np.where(vv, np.where(mem & near, 0.4, 1.0), 0.0)
                ab = []
                for x0_, y0_, x1_, y1_ in segs:
                    AB = chart_point(c, np.array([c.u0 + (x0_ + 0.5) / pxm, c.u0 + (x1_ + 0.5) / pxm]),
                                     np.array([c.w1 - (y0_ + 0.5) / pxm, c.w1 - (y1_ + 0.5) / pxm]))
                    ab.append((AB[0], AB[1]))
                lm.members.append((c, mem, pxm, ab))
            elif ("curtain" in lm.spec and zc >= lm.base + lm.spec["curtain"] and abs(c.n[2]) < 0.3
                  and c.feature in (FEATURE["facade"], FEATURE["dots"], FEATURE["bands"])
                  and (not lm.spec.get("curtainNS") or abs(c.n[1]) > 0.7)):
                # 整面幕墙（照片里是白天的倒影与遮阳百叶，玻璃 / 实墙分不出来）：一律玻璃，竖梃与楼层横档在着色器里按检测到的间距画
                gl = np.where(vv, 1.0, 0.0)
            if lm.spec.get("flattenBase") and c.textured and c.band == 0 and vv.any():
                # 街面带的白天残影（树影、阴影、倒影的大块斑）：低频亮度向本块中位数收（玻璃留 25 %、实墙留 40 % 的起伏），细节不动
                Yl = c.work_col @ np.array([0.2126, 0.7152, 0.0722])
                med = float(np.median(Yl[vv]))
                low, _ = masked_blur(Yl, vv, max(1, int(round(2.0 * pxm))))
                keep = np.where(gl > 0.6, 0.25, 0.4)
                ratio = (med + keep * (low - med)) / np.maximum(low, 1e-4)
                c.work_col = c.work_col * np.where(vv, np.clip(ratio, 0.4, 2.5), 1.0)[..., None]
            gfrac = float(gl[vv].mean()) if vv.any() else 0.5
            c.col = c.work_col[vv].mean(0) if vv.any() else np.array([0.12, 0.12, 0.12])
            c.glass = gfrac
            if c.textured and (vv.mean() if vv.size else 0) < 0.25:
                c.textured = False   # 投影几乎没取到照片（内面、被挡住的面）：用顶点色
            if c.textured:
                x, y, w, h = c.rect
                iw, ih = w - 2 * PAD, h - 2 * PAD
                ss = c.ss
                Hs, Ws = c.work_col.shape[:2]
                ph_, pw_ = ih * ss, iw * ss
                colp = np.zeros((ph_, pw_, 3))
                gp = np.zeros((ph_, pw_))
                vp = np.zeros((ph_, pw_))
                hh, ww_ = min(Hs, ph_), min(Ws, pw_)
                colp[:hh, :ww_] = c.work_col[:hh, :ww_]
                gp[:hh, :ww_] = gl[:hh, :ww_]
                vp[:hh, :ww_] = vv[:hh, :ww_]
                wsum_ = vp.reshape(ih, ss, iw, ss).sum((1, 3))
                cs_ = (colp * vp[..., None]).reshape(ih, ss, iw, ss, 3).sum((1, 3)) / np.maximum(wsum_, 1e-9)[..., None]
                gs_ = (gp * vp).reshape(ih, ss, iw, ss).sum((1, 3)) / np.maximum(wsum_, 1e-9)
                ok_ = wsum_ > 0
                cs_[~ok_] = c.col
                gs_[~ok_] = c.glass
                atlas_lin[y:y + h, x:x + w] = np.pad(cs_, ((PAD, PAD), (PAD, PAD), (0, 0)), mode="edge")
                atlas_g[y:y + h, x:x + w] = np.pad(gs_, ((PAD, PAD), (PAD, PAD)), mode="edge")
            c.work_col = c.work_valid = None
        lm.src["models"] = None
        extra_lines(lm)
        lm.lines = merge_lines(lm.lines, tol=0.6, ang_deg=5.0, gap=0.8)
        if lm.members:
            member_bands(lm, atlas_g)
        summary[lm.id] = {"charts": len(lm.charts), "textured": sum(1 for c in lm.charts if c.textured),
                          "features": {k: sum(1 for c in lm.charts if c.feature == v) for k, v in FEATURE.items()
                                       if any(c.feature == v for c in lm.charts)}}
        log(f"{lm.id}: 烘焙完，进图集 {summary[lm.id]['textured']} / {len(lm.charts)} 块、特征 {summary[lm.id]['features']}"
            f"（{time.time() - t0:.0f} s）")

    files: dict[str, bytes] = {}

    def put(prefix: str, data: bytes, ext: str) -> dict:
        h, s8 = sha8(data)
        name = f"{prefix}-{s8}.{ext}"
        files[name] = data
        return {"file": name, "sha256": h, "bytes": len(data)}

    ent: dict[str, dict] = {}
    chain = mip_chain(atlas_lin, atlas_g, ATLAS)
    ent["bc3"] = put("lmt-bc3", cltx(CLTX_BC3, chain), "bin")
    ent["bc3Half"] = put("lmt-bc3h", cltx(CLTX_BC3, chain[1:]), "bin")
    ent["etc2Half"] = put("lmt-etch", cltx(CLTX_ETC2, chain[1:]), "bin")
    # LOW 档（R4 + R5 整合复审）：四分之一分辨率（512² 起的 mip 链，0.33 MiB），原来 LOW 下载半分辨率再丢掉最大一级
    ent["bc3Quarter"] = put("lmt-bc3q", cltx_drop_top(files[ent["bc3Half"]["file"]]), "bin")
    ent["etc2Quarter"] = put("lmt-etcq", cltx_drop_top(files[ent["etc2Half"]["file"]]), "bin")
    ent["webpHalf"] = put("lma-h", webp_bytes(chain[1], WEBP_Q), "webp")
    ent["webpQuarter"] = put("lma-q", webp_bytes(chain[2], WEBP_Q), "webp")
    log(f"图集编码完（{time.time() - t0:.0f} s）")

    def chart_uv(c: Chart, P: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
        if not c.textured:
            return np.zeros((len(P), 2)), np.zeros((len(P), 4))
        x, y, w, h = c.rect
        uu = (x + PAD + (P @ c.t - c.u0) * c.dens) / ATLAS
        vv = (y + PAD + (c.w1 - P @ c.b) * c.dens) / ATLAS
        r = np.array([(x + PAD) / ATLAS, (y + PAD) / ATLAS, (x + w - PAD) / ATLAS, (y + h - PAD) / ATLAS])
        return np.stack([uu, vv], 1), np.repeat(r[None], len(P), 0)

    def col_of(c_col: np.ndarray, glass: float, n: int) -> np.ndarray:
        cs = np.clip(linear_to_srgb(c_col) * 255 + 0.5, 0, 255)
        return np.repeat(np.array([cs[0], cs[1], cs[2], glass * 255 + 0.5])[None], n, 0)

    def fac_of(P: np.ndarray, t: np.ndarray, phase: float, mull: float, u0: float, strip: dict | None = None) -> np.ndarray:
        """立面 (相位对齐的 u cm, 第 2 分量)：第 2 分量平时为 0，steel-frame 红光楼梯间的块写条带坐标（strip_coord）。"""
        shift = phase + mull * round((u0 - phase) / max(mull, 1e-3))
        return np.stack([np.round((P @ t - shift) * 100), strip_coord(strip, P) if strip else np.zeros(len(P))], 1)

    def extras(lm: LM, min_len: float = 0.0) -> list[np.ndarray]:
        """冠顶发光芯（每个三角形 3 个独立顶点、平面法线、特征 crown、网格第 4 分量 = 1）+ 长 ≥ min_len 的 LED 线（line_quads）：
        与 line_quads 同样的 9 个数组（7 个属性 + 法线第 4 分量 + 索引）。远景网格只要长 ≥ LOW_LINE_MIN 的线（短的远看不到 1 px，
        LOW 档的场景三角形又没有余量）。"""
        Vc, Fc = lm.core
        Pc = Vc[Fc].reshape(-1, 3) if len(Fc) else np.zeros((0, 3))
        nc = np.repeat(tri_normals(Vc[Fc])[0], 3, 0) if len(Fc) else np.zeros((0, 3))
        m = len(Pc)
        core = [Pc, nc, np.zeros((m, 2)), np.zeros((m, 4)), np.full((m, 4), 255.0), np.zeros((m, 2)),
                np.repeat(np.array([[round(lm.mull / 0.02), FEATURE["crown"], lm.index, 1]], np.float64), m, 0), np.zeros(m),
                np.arange(m)]
        ln = line_quads([L for L in lm.lines if float(np.linalg.norm(L[1] - L[0])) >= min_len], lm.index)
        return [np.concatenate([core[i], ln[i]]) for i in range(8)] + [np.concatenate([core[8], ln[8] + m]).astype(np.int64)]

    low_parts = []
    per = {}
    for lm in lms:
        pos, nrm, uv, rect, col, fac, grid, idx = [], [], [], [], [], [], [], []
        nw = []
        nv = 0
        for c in lm.charts:
            used, inv = np.unique(lm.F[c.faces], return_inverse=True)
            P = lm.V[used]
            pos.append(P)
            nrm.append(np.repeat(c.n[None], len(P), 0))
            a_, b_ = chart_uv(c, P)
            uv.append(a_)
            rect.append(b_)
            col.append(col_of(c.col, c.glass, len(P)))
            fac.append(fac_of(P, c.th, c.phase, c.mull, float((P @ c.th).min()), lm.spec if c.feature == FEATURE["redcore"] else None))
            grid.append(np.repeat(np.array([[round(c.mull / 0.02), c.feature, lm.index, 0]]), len(P), 0))
            idx.append(inv.reshape(-1, 3) + nv)
            nw.append(np.zeros(len(P)))
            nv += len(P)
        ex = extras(lm)
        for lst, v in zip((pos, nrm, uv, rect, col, fac, grid, nw), ex[:8]):
            lst.append(v)
        idx.append(ex[8].reshape(-1, 3) + nv)
        nv += len(ex[0])
        n_extra = len(ex[8]) // 3
        data = encode_mesh(np.concatenate(pos), np.concatenate(nrm), np.concatenate(uv), np.concatenate(rect),
                           np.clip(np.concatenate(col), 0, 255), np.clip(np.concatenate(fac), -32767, 32767),
                           np.clip(np.concatenate(grid), 0, 255), np.concatenate(idx).ravel(), np.concatenate(nw))
        e = put(f"lmh-{lm.id}", data, "bin")
        # LOW：逐个三角形配到 HIGH 的块（同朝向、离平面 ≤ LOW_UV_DIST、平面坐标在块外包框 ± 3 m、同一高度带，取离平面最近的）；
        # 远景体块（lowMassing）逐片配（一片的两个三角形取同一块），桅杆长方体一律是「桅杆」
        pieces = low_massing(lm) if lm.spec.get("lowMassing") else None
        if pieces is not None:
            PL = np.concatenate([pc["T"] for pc in pieces])
            nL = np.concatenate([np.repeat(pc["n"][None], len(pc["T"]), 0) for pc in pieces])
            pid = np.concatenate([np.full(len(pc["T"]), i) for i, pc in enumerate(pieces)])
            pcen = [pc["T"].reshape(-1, 3).mean(0) for pc in pieces]
        else:
            PL = lm.VL[lm.FL]
            nL, _ = tri_normals(PL)
            pid = np.arange(len(PL))
        cL = PL.mean(1)
        cn = np.array([c.n for c in lm.charts])
        cd = np.array([c.d0 for c in lm.charts])
        ct = np.array([c.t for c in lm.charts])
        cb = np.array([c.b for c in lm.charts])
        cu = np.array([[c.u0, c.u1, c.w0, c.w1] for c in lm.charts])
        cband = np.array([c.band for c in lm.charts])
        ctex = np.array([c.textured for c in lm.charts], float)
        carea = np.array([c.area for c in lm.charts])
        czc = np.array([(c.zlo + c.zhi) / 2 for c in lm.charts])
        cfeat = np.array([c.feature for c in lm.charts])
        parts = [[] for _ in range(8)]
        matched = 0
        memo: dict[int, tuple] = {}
        for k in range(len(PL)):
            P3 = PL[k]
            key = int(pid[k])
            if key not in memo:
                if pieces is not None:
                    Pp = pieces[key]["T"].reshape(-1, 3)
                    cc = pcen[key]
                else:
                    Pp, cc = P3, cL[k]
                nk = nL[k]
                mast = pieces is not None and pieces[key]["kind"] == "mast"
                dots = cn @ nk
                dist = np.abs(cn @ cc - cd)
                u = ct @ cc
                w = cb @ cc
                band = 1 if cc[2] >= lm.base + STREET_M else 0
                ok = (dots > LOW_UV_COS) & (dist < LOW_UV_DIST) & (u > cu[:, 0] - 3) & (u < cu[:, 1] + 3) & (w > cu[:, 2] - 3) & \
                     (w < cu[:, 3] + 3) & (cband == band)
                if mast:
                    ok &= cfeat == FEATURE["mast"]
                elif pieces is not None:
                    # 体块的墙 / 屋面不配桅杆、桁架块（它们贴在立面前 1–2 m，会把整片墙配成没有窗的钢）
                    ok &= (cfeat != FEATURE["mast"]) & (cfeat != FEATURE["truss"])
                if ok.any():
                    cand = np.nonzero(ok)[0]
                    j = int(cand[np.argmin(dist[cand] - 0.5 * ctex[cand] - 1e-6 * carea[cand])])
                    c = lm.charts[j]
                    memo[key] = (c, c.th, c.mull, c.phase, c.feature, float((lm.V[np.unique(lm.F[c.faces])] @ c.th).min()), c.col, c.glass)
                else:
                    t_, _ = chart_basis(nk)
                    zc_ = 0.5 * (float(Pp[:, 2].min()) + float(Pp[:, 2].max()))
                    feat = FEATURE["mast"] if mast else feature_of(
                        lm.spec["rules"], float(Pp[:, 2].min()), float(Pp[:, 2].max()), lm.base, nk, 0.5, lm.bands,
                        float(np.ptp(Pp @ t_)), outside=float(outside_dist(cc[None, :2], lm.ring)[0]),
                        where=region_flags(lm.spec, cc[:2], zc_), nloc=frame_xy(lm.spec, nk[None, :2])[0],
                        ground=float(ground(cc[None, 0], cc[None, 1])[0]))
                    if pieces is not None and not mast and feat in (FEATURE["mast"], FEATURE["truss"]):
                        feat = FEATURE["facade"] if abs(float(nk[2])) < 0.6 else FEATURE["plain"]
                    same = cfeat == feat
                    pool = np.nonzero(same)[0] if same.any() else np.arange(len(lm.charts))
                    j = int(pool[np.argmin(np.abs(czc[pool] - cc[2]) - 1e-6 * carea[pool])])
                    memo[key] = (None, t_, lm.mull, 0.0, feat, float((Pp @ t_).min()), lm.charts[j].col, lm.charts[j].glass)
            c, t_, mull, phase, feat, u0, colc, gl = memo[key]
            if c is not None:
                matched += 1
                a_, b_ = chart_uv(c, P3)
            else:
                a_, b_ = np.zeros((3, 2)), np.zeros((3, 4))
            for lst, v in zip(parts, (P3, np.repeat(nL[k][None], 3, 0), a_, b_, col_of(colc, gl, 3),
                                      fac_of(P3, t_, phase, mull, u0, lm.spec if feat == FEATURE["redcore"] else None),
                                      np.repeat(np.array([[round(mull / 0.02), feat, lm.index, 0]]), 3, 0), np.zeros(3))):
                lst.append(v)
        # 发光芯与 LED 线也进远景（远景网格是三角形汤：按索引展开）
        exl = extras(lm, LOW_LINE_MIN)
        n_extra_low = len(exl[8]) // 3
        for lst, v in zip(parts, exl[:8]):
            lst.append(v[exl[8]])
        low_parts.append([np.concatenate(p) for p in parts])
        V = np.concatenate([lm.V, ex[0]]) if len(ex[0]) else lm.V   # 外包盒含发光芯与 LED 线端点
        bb = [int(math.floor(V[:, 0].min() * 10)), int(math.floor(V[:, 1].min() * 10)), int(math.floor(V[:, 2].min() * 10)),
              int(math.ceil(V[:, 0].max() * 10)), int(math.ceil(V[:, 1].max() * 10)), int(math.ceil(V[:, 2].max() * 10))]
        F_m, ph_abs, sc = lm.floors
        per[lm.id] = {"models": lm.spec["models"], "sheet": lm.spec["sheet"], "high": e,
                      "tris": [int(len(lm.F)) + n_extra, int(len(PL)) + n_extra_low], "lines": len(lm.lines), "coreTris": int(len(lm.core[1])),
                      "floors": [int(round(F_m * 100)), int(round(ph_abs * 100))], "floorScore": round(sc, 3),
                      "mull": int(round(lm.mull * 100)), "bbox": bb, "aviation": lm.aviation, "lowCellM": lm.low_cell,
                      **({"lowMassing": True} if pieces is not None else {}),
                      "lowMatched": round(matched / max(1, len(PL)), 3), "clean": lm.clean, "trussBands": lm.bands, **summary[lm.id]}
        log(f"{lm.id}: HIGH {len(lm.F)} + {n_extra}（发光芯 {len(lm.core[1])}、LED 线 {len(lm.lines)} 段）三角形 / {nv} 顶点 → "
            f"{e['file']} {e['bytes']} B；LOW {len(PL)} + {n_extra_low}（配到块 {matched}）")
    cat = [np.concatenate([p[i] for p in low_parts]) for i in range(8)]
    nlow = len(cat[0])
    low_b = encode_mesh(cat[0], cat[1], cat[2], cat[3], np.clip(cat[4], 0, 255), np.clip(cat[5], -32767, 32767), np.clip(cat[6], 0, 255),
                        np.arange(nlow), cat[7])
    ent["low"] = put("lml", low_b, "bin")

    if debug:
        debug.mkdir(parents=True, exist_ok=True)
        Image.fromarray(chain[0][..., :3]).save(debug / "atlas-rgb.png")
        Image.fromarray(chain[0][..., 3]).save(debug / "atlas-glass.png")
        fe = np.zeros((ATLAS, ATLAS, 3), np.uint8)
        pal = np.array([[90, 90, 90], [40, 40, 40], [255, 255, 255], [200, 230, 255], [60, 80, 255], [255, 60, 220], [255, 255, 160],
                        [255, 40, 40], [160, 80, 255], [200, 220, 240], [255, 190, 90], [120, 255, 120], [220, 240, 255], [255, 90, 60],
                        [255, 255, 255], [150, 120, 255]], np.uint8)
        for lm in lms:
            for c in lm.charts:
                if c.textured:
                    x, y, w, h = c.rect
                    fe[y:y + h, x:x + w] = pal[c.feature]
        Image.fromarray(fe).save(debug / "atlas-feature.png")

    total = sum(len(b) for b in files.values())
    doc = {
        "format": "central-3dvm-landmarks",
        "version": 1,
        "datasetId": DATASET_ID,
        "params": {"atlas": ATLAS, "pad": PAD, "streetM": STREET_M, "streetK": STREET_K, "densityPxM": round(d_up, 4),
                   "webpQ": WEBP_Q, "depthM": DEPTH_M, "mesh": "CLMK v1", "texture": "CLTX v1 (1 = BC3/DXT5 sRGB, 2 = ETC2 RGBA8 EAC sRGB)",
                   "atlasAlpha": "RGB = de-lit albedo (sRGB), alpha = glass 0..255 (0 solid, 255 glass)"},
        "files": ent,
        "landmarks": per,
        "stats": {"files": len(files), "bytes": total, "highTris": sum(v["tris"][0] for v in per.values()),
                  "lowTris": sum(v["tris"][1] for v in per.values())},
    }
    text = json.dumps(doc, separators=(",", ":"), ensure_ascii=False, sort_keys=True)
    gz = gzip.compress(text.encode("utf-8"), 9, mtime=0)
    out_dir = out_city / OUT_DIR
    out_dir.mkdir(parents=True, exist_ok=True)
    for old in sorted(out_dir.glob("lm*")):
        if old.name not in files:
            old.unlink()
    for name, data in sorted(files.items()):
        (out_dir / name).write_bytes(data)
    raw_dir.mkdir(parents=True, exist_ok=True)
    (raw_dir / OUT_FILE).write_bytes(gz)
    if update:
        write_sources(raw_dir, gz, per)
    log(f"写出 {len(files)} 个文件共 {total} B → {out_dir}；清单 {OUT_FILE} gzip {len(gz)} B；HIGH {doc['stats']['highTris']}、"
        f"LOW {doc['stats']['lowTris']} 三角形；用时 {time.time() - t0:.0f} s")
    return doc


def derive_quarter(out_city: pathlib.Path, raw_dir: pathlib.Path, update: bool) -> dict:
    """不重新烘焙（不需要源模型）：从现有清单的 BC3 / ETC2 半分辨率图集（先校验 sha256）派生四分之一分辨率的两份，
    写进清单的 files 与 stats，结果与完整烘焙（run）逐字节相同。"""
    doc = json.loads(gzip.decompress((raw_dir / OUT_FILE).read_bytes()).decode("utf-8"))
    out_dir = out_city / OUT_DIR
    for key, src_key, prefix in (("bc3Quarter", "bc3Half", "lmt-bc3q"), ("etc2Quarter", "etc2Half", "lmt-etcq")):
        src = doc["files"][src_key]
        data = (out_dir / src["file"]).read_bytes()
        if hashlib.sha256(data).hexdigest() != src["sha256"] or len(data) != src["bytes"]:
            raise RuntimeError(f"{src['file']} 与清单不符（sha256 / 字节数），先 git lfs pull")
        old = doc["files"].get(key)
        if old and (out_dir / old["file"]).exists():
            (out_dir / old["file"]).unlink()
        q = cltx_drop_top(data)
        h, s8 = sha8(q)
        name = f"{prefix}-{s8}.bin"
        (out_dir / name).write_bytes(q)
        doc["files"][key] = {"file": name, "sha256": h, "bytes": len(q)}
        log(f"{key}: {src['file']} 去掉最大一级 mip → {name} {len(q)} B")
    names = [v["file"] for v in doc["files"].values()] + [v["high"]["file"] for v in doc["landmarks"].values()]
    doc["stats"]["files"] = len(names)
    doc["stats"]["bytes"] = sum((out_dir / n).stat().st_size for n in names)
    text = json.dumps(doc, separators=(",", ":"), ensure_ascii=False, sort_keys=True)
    gz = gzip.compress(text.encode("utf-8"), 9, mtime=0)
    (raw_dir / OUT_FILE).write_bytes(gz)
    if update:
        write_sources(raw_dir, gz, doc["landmarks"])
    log(f"清单 {OUT_FILE} gzip {len(gz)} B：{doc['stats']['files']} 个文件共 {doc['stats']['bytes']} B")
    return doc


def write_sources(raw_dir: pathlib.Path, gz: bytes, per: dict) -> None:
    """sources.json 里追加 / 更新本清单的条目；图幅的 sha256 与版本取 R3 贴面条目的 derivedFrom（同一批下载）。"""
    path = raw_dir / "sources.json"
    manifest = json.loads(path.read_text(encoding="utf-8"))
    sheets = {}
    for f in manifest["files"]:
        if f.get("file") == FACADES_FILE:
            for s in f.get("derivedFrom", []):
                sheets[s["sheet"]] = s
    derived = []
    for s in sorted({v["sheet"] for v in per.values()}):
        if s not in sheets:
            raise RuntimeError(f"图幅 {s} 不在 R3 贴面条目的 derivedFrom 里")
        derived.append({k: sheets[s][k] for k in ("sheet", "revision", "urlNoKey", "sha256", "bytes")})
    entry = {
        "file": OUT_FILE, "layer": "landsd/3dvm-individualised-landmarks", "datasetId": DATASET_ID,
        "url": f"{PORTAL}/geoportal/?datasetId={DATASET_ID}",
        "release": max((d["revision"] for d in derived), default=""),
        "format": "gzip JSON (written by landsd_3d_landmark_bake.py): per landmark, LandsD model ids, triangle counts, floor height, "
                  "aviation lights; lists the derived meshes and texture atlases in client/public/city/landmarks/ with sha256",
        "crs": "EPSG:2326 + mPD", "licenses": [TERMS], "attribution": ATTRIBUTION, "fetched": "2026-11-27",
        "sha256": hashlib.sha256(gz).hexdigest(), "bytes": len(gz), "rows": len(per), "derivedFrom": derived,
    }
    files = manifest["files"]
    for i, f in enumerate(files):
        if f.get("file") == OUT_FILE:
            files[i] = entry
            break
    else:
        files.append(entry)
    path.write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


# ------------------------------------------------------------------------------------------------ 自测

def selftest() -> None:
    # 横切：一个跨 z = 0.5 的三角形 → 3 个，面积守恒
    V = np.array([[0, 0, 0], [1, 0, 0], [0, 0, 1.0]])
    F = np.array([[0, 1, 2]])
    V2, F2 = split_z(V, F, 0.5)
    assert len(F2) == 3
    _, a1 = tri_normals(V[F])
    _, a2 = tri_normals(V2[F2])
    assert abs(a1.sum() - a2.sum()) < 1e-9
    assert all(((V2[f][:, 2] >= 0.5 - 1e-9).all() or (V2[f][:, 2] <= 0.5 + 1e-9).all()) for f in F2)
    # 装箱：全部放得下且互不重叠
    rects = [(10 + (i * 7) % 50, 5 + (i * 13) % 40) for i in range(60)]
    pos = pack(rects, 256)
    assert pos is not None
    occ = np.zeros((256, 256), np.int32)
    for (x, y), (w, h) in zip(pos, rects):
        occ[y:y + h, x:x + w] += 1
    assert occ.max() == 1
    # 分块：立方体 6 个面 → 6 块（每面 2 个三角形）
    cube_v = np.array([[x, y, z] for x in (0, 1) for y in (0, 1) for z in (0, 1)], float)
    cube_f = np.array([[0, 2, 3], [0, 3, 1], [4, 5, 7], [4, 7, 6], [0, 1, 5], [0, 5, 4], [2, 6, 7], [2, 7, 3], [0, 4, 6], [0, 6, 2],
                       [1, 3, 7], [1, 7, 5]])
    ch = make_charts(cube_v, cube_f, np.zeros(12, np.int64))
    assert len(np.unique(ch)) == 6
    # 网格编码往返
    rng = np.random.default_rng(1)
    pos = rng.uniform(-50, 50, (30, 3))
    nrm = rng.normal(size=(30, 3))
    nrm /= np.linalg.norm(nrm, axis=1, keepdims=True)
    b = encode_mesh(pos, nrm, rng.uniform(0, 1, (30, 2)), rng.uniform(0, 1, (30, 4)), rng.integers(0, 255, (30, 4)),
                    rng.integers(-3000, 3000, (30, 2)), rng.integers(0, 255, (30, 4)), np.arange(30))
    d = decode_mesh(b)
    three = np.stack([pos[:, 0], pos[:, 2], -pos[:, 1]], 1)
    assert np.abs(d["three"] - three).max() < 0.01
    assert len(b) % 4 == 0
    # GPU 压缩：BC3 / ETC2 往返（解码器与 SwiftShader 的 GPU 解码逐位一致，见 R5 记录）
    img = np.dstack([rng.integers(0, 255, (16, 16, 3)), np.where(rng.uniform(size=(16, 16)) > 0.5, 255, 0)]).astype(np.uint8)
    img[:8, :8] = 90
    for enc, dec in ((bc3_encode, bc3_decode), (etc2_encode, etc2_decode)):
        out = dec(enc(img), 16, 16)
        assert out.shape == img.shape
        assert np.abs(out[:8, :8].astype(int) - img[:8, :8]).max() <= 8
    ch = mip_chain(np.full((16, 16, 3), 0.2), np.ones((16, 16)), 16)
    assert [c.shape[0] for c in ch] == [16, 8, 4]
    # 去掉最大一级 mip 与直接编码后几级逐字节相同（LOW 的四分之一分辨率图集）
    ch2 = mip_chain(rng.uniform(0, 1, (32, 32, 3)), rng.uniform(0, 1, (32, 32)), 32)
    for fmt in (CLTX_BC3, CLTX_ETC2):
        assert cltx_drop_top(cltx(fmt, ch2)) == cltx(fmt, ch2[1:])
        assert cltx_drop_top(cltx(fmt, ch2), 2) == cltx(fmt, ch2[2:])
    # 周期检测：4 m 一层的方波剖面
    z = np.arange(800) / 8.0
    prof = (np.mod(z - 1.0, 4.0) > 1.0).astype(float)
    r = detect_period(prof, np.ones(800, bool), 8.0, 2.6, 5.2, 6.0)
    assert r and abs(r[0] - 4.0) < 0.05, r
    # 按高程切三角形：z = 1 以上的部分（面积 = 原面积 × (1 − 1/2)²，uv 线性插值）
    tri = np.array([[0, 0, 0], [2, 0, 0], [0, 0, 2.0]])
    parts = clip_above(tri, np.array([[0, 0], [1, 0], [0, 1.0]]), 1.0)
    assert len(parts) == 1 and abs(tri_normals(parts[0][0][None])[1][0] - 0.5) < 1e-9
    assert np.allclose(parts[0][1][parts[0][0][:, 2].argmax()], [0, 1])
    assert len(clip_above(tri, np.zeros((3, 2)), 3.0)) == 0 and len(clip_above(tri, np.zeros((3, 2)), -1.0)) == 1
    two = clip_above(np.array([[0, 0, 2.0], [2, 0, 2.0], [0, 0, 0]]), np.zeros((3, 2)), 1.0)
    assert len(two) == 2 and abs(sum(tri_normals(q[None])[1][0] for q, _ in two) - 1.5) < 1e-9
    # LED 线：共线重叠的两段并成一条、平行但离得远的不并；线段 → 4 个顶点 2 个三角形，左右号存在法线第 4 分量
    up = np.array([0, 0, 1.0])
    L = merge_lines([(np.array([0, 0, 0.0]), np.array([10, 0, 0.0]), 0, 0.3, up), (np.array([8, 0.1, 0]), np.array([15, 0.1, 0]), 0, 0.3, up),
                     (np.array([0, 3, 0.0]), np.array([10, 3, 0.0]), 0, 0.3, up), (np.array([0, 0, 0.0]), np.array([10, 0, 0.0]), 1, 0.3, up)])
    assert len(L) == 3 and any(abs(float(np.linalg.norm(x[1] - x[0])) - 15.0) < 0.2 for x in L)
    q = line_quads([(np.array([0, 0, 0.0]), np.array([0, 0, 10.0]), 1, 0.3, np.array([0, -1.0, 0]))], 5)
    assert len(q[0]) == 4 and list(q[8]) == [0, 1, 2, 2, 1, 3] and q[6][0][1] == FEATURE["line"] and q[6][0][3] == 1
    d = decode_mesh(encode_mesh(q[0], q[1], q[2], q[3], q[4], q[5], q[6], q[8], q[7]))
    assert list(d["nrm"][:, 3]) == [-127, 127, -127, 127] and list(d["nrm"][0, :3]) == [0, 127, 0]
    # 受保护区（广场一层）：框里的三角形切成「z 以上」与「z + overlap 以下」两份，重叠 overlap；框外不动
    spec_t = {"frame": 0.0, "protect": {"box": [-1.0, 3.0, -1.0, 3.0], "z": 1.0, "overlap": 0.5, "ratio": 0.5},
              "redcore": {"strip": [0.0, 2.0]}}
    tall = np.array([[[0, 0, 0], [2, 0, 0], [0, 0, 2.0]], [[10, 0, 0], [12, 0, 0], [10, 0, 2.0]]])
    rest, prot = split_protected(tall, spec_t)
    a_r = tri_normals(rest)[1].sum()
    a_p = tri_normals(prot)[1].sum()
    assert abs(a_r - (2.0 + 0.5)) < 1e-9 and abs(a_p - (2.0 - 0.5 * 0.5 ** 2)) < 1e-9, (a_r, a_p)
    assert prot[:, :, 2].max() <= 1.5 + 1e-9 and rest[len(rest) - 1][:, 2].min() >= 1.0 - 1e-9
    assert list(strip_coord(spec_t, np.array([[0.0, 5, 0], [1.0, 5, 0], [2.0, 5, 0], [3.0, 5, 0]]))) == [-1000, 0, 1000, 2000]
    # 远景体块：两个叠放的长方体（10×8 m 高 20 m，上面西半边再高 10 m）+ 一根桅杆 → 墙竖直、屋面水平、绕向与法线一致，三角形很少
    def box(x0, x1, y0, y1, z0, z1):
        c = [(x0, y0), (x1, y0), (x1, y1), (x0, y1)]
        out = [_quad(np.array([*c[0], z1]), np.array([*c[1], z1]), np.array([*c[2], z1]), np.array([*c[3], z1]), np.array([0, 0, 1.0]))]
        for (a, b), nn in zip(zip(c, c[1:] + c[:1]), ([0, -1, 0], [1, 0, 0], [0, 1, 0], [-1, 0, 0])):
            out.append(_quad(np.array([*a, z0]), np.array([*b, z0]), np.array([*b, z1]), np.array([*a, z1]), np.array(nn, float)))
        return np.concatenate(out)
    T = np.concatenate([box(0, 10, 0, 8, 0, 20), box(0, 5, 0, 8, 20, 30)])
    Vb, Fb = weld(T)
    ringb = np.array([[0, 0], [10, 0], [10, 8], [0, 8.0]])
    pcs = massing_low(Vb, Fb, np.zeros(len(Fb), bool), {"frame": 0.0}, ringb, 0.0, [12.0], [(11.0, 12.0, 1.0, 2.0, 25.0)])
    Tm = np.concatenate([p_["T"] for p_ in pcs])
    nm = np.concatenate([np.repeat(p_["n"][None], len(p_["T"]), 0) for p_ in pcs])
    tn, ta = tri_normals(Tm)
    assert np.allclose(tn, nm, atol=1e-9) and ta.min() > 0.1, "绕向与法线一致、没有退化三角形"
    assert all(abs(float(p_["n"][2])) in (0.0, 1.0) for p_ in pcs)
    roofs = sorted({round(float(p_["T"][0, 0, 2]), 1) for p_ in pcs if p_["kind"] == "roof"})
    assert roofs == [20.0, 30.0], roofs
    assert sum(1 for p_ in pcs if p_["kind"] == "mast") == 5 and len(Tm) <= 60, len(Tm)
    print("selftest ok")


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--src", type=pathlib.Path, help="解出的原型模型目录：<地标 id>/<模型号>/")
    ap.add_argument("--out", type=pathlib.Path, help="产物写到这里（默认仓库：client/public/city 与 data-raw/landsd）")
    ap.add_argument("--debug", type=pathlib.Path, help="另写调试图")
    ap.add_argument("--selftest", action="store_true")
    ap.add_argument("--quarter", action="store_true", help="只派生四分之一分辨率图集（不需要 --src）")
    a = ap.parse_args()
    if a.selftest:
        selftest()
        return
    if a.quarter:
        if a.out:
            ap.error("--quarter 只写仓库")
        derive_quarter(CITY_DIR, RAW, update=True)
        return
    if not a.src:
        ap.error("--src 必填")
    if a.out:
        run(a.src, a.out / "city", a.out / "landsd", a.debug, update=False)
    else:
        run(a.src, CITY_DIR, RAW, a.debug, update=True)


if __name__ == "__main__":
    main()
