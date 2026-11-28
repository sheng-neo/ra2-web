/**
 * city.json / terrain.bin 数据契约 —— 离线管线（@central/citymap）写，客户端（@central/client）读。
 *
 * 坐标约定（全项目唯一真相，改动须同步管线、客户端与测试）：
 * - 投影：WGS84 → HK1980 Grid（EPSG:2326），再减去本地原点 CityMeta.origin。
 * - 单位：整数分米（dm）。x = 东，y = 北，z = 高程（香港主水平基准 mPD，单位同为 dm）。
 * - 平面坐标数组一律扁平：[x0, y0, x1, y1, ...]。
 * - 多边形外环逆时针（CCW，从上往下看），内环（洞）顺时针；首尾点不重复。
 * - three.js 侧的换算 (x, y, z)sim → (x, z, −y)three 只允许写在客户端一个函数里。
 */

export const CITY_FORMAT = 'central-city' as const;
export const CITY_FORMAT_VERSION = 1 as const;

/** 扁平平面坐标 [x0, y0, x1, y1, ...]，整数分米。 */
export type FlatXY = number[];

export interface Ring {
  /** 外环，CCW。 */
  outer: FlatXY;
  /** 洞，CW。省略表示无洞。 */
  holes?: FlatXY[];
}

export interface SourceRef {
  /** 数据集标识，如 'overture-2026-11-18.0/buildings'、'landsd-dtm-5m'。 */
  id: string;
  /** 许可，如 'ODbL-1.0'、'CC-BY-4.0'、'CSDI-Terms'。 */
  license: string;
  /** 署名文本（原样显示在鸣谢页）。 */
  attribution: string;
  url?: string;
}

export interface CityMeta {
  /** 本地原点：HK1980 Grid 东/北坐标（米），以及对应的 WGS84 经纬度。 */
  origin: { e: number; n: number; lon: number; lat: number };
  crs: 'EPSG:2326';
  unit: 'dm';
  /** 数据覆盖范围（渲染范围），本地 dm：[minX, minY, maxX, maxY]。 */
  bbox: [number, number, number, number];
  sources: SourceRef[];
  /** 管线版本与全部输入快照 sha256 的组合摘要，用于判断产物是否过期。 */
  build: { pipelineVersion: string; inputsDigest: string };
  /** 真实贴面的贴图集（R3 新增的可选字段）；没有贴面数据时省略。 */
  facades?: FacadeMeta;
  /** 电车走廊高清街面层的贴图集（R4 新增的可选字段，见 Building.hires）；没有时省略。 */
  hires?: HiresMeta;
  /** R5 地标真实网格与图集（可选字段）；没有烘焙产物时省略。 */
  landmarkMeshes?: LandmarkMeshMeta;
}

export type BuildingKind = 'tower' | 'podium' | 'house' | 'civic' | 'industrial' | 'other';

export type HeightSource = 'landsd' | 'tag' | 'levels' | 'landmark' | 'heuristic';

export interface Building {
  /** 稳定 ID（源数据 ID 的短哈希），同一快照多次构建不变。 */
  id: string;
  /** 来源数据集，对应 CityMeta.sources[].id 的前缀，如 'ovt' | 'landsd'。 */
  src: string;
  footprint: Ring;
  /** 楼底高程（dm，mPD）。未知时为 0，客户端改用地形采样。 */
  base: number;
  /** 楼顶高程减楼底高程（dm），> 0。 */
  height: number;
  heightSource: HeightSource;
  kind: BuildingKind;
  /** 立面风格种子 0–255（窗格密度、色温、亮灯率等由客户端按种子决定）。 */
  style: number;
  /**
   * 地上层数（正整数；地政总署 Storeys，Overture 层建筑取 num_floors）。未知或 ≤ 0 时省略。
   * 写实化一轮新增的可选字段（不改 CITY_FORMAT_VERSION）：客户端用 height / storeys 估层高，区分写字楼（约 4 m）与住宅（约 2.9 m）。
   */
  storeys?: number;
  /**
   * LOD2 分层体块（细节一轮 R2 新增的可选字段，不改 CITY_FORMAT_VERSION）：由地政总署「可視化三維地圖（無紋理模型）」
   * 的屋面派生的「叠层棱柱」，表达退台、塔冠、天台机房、坡屋顶台阶。没有 3D 模型、只有一层屋面、在敏感区里、
   * 或与地标重叠的楼一律省略——客户端照旧画 footprint 从 base 挤到 base + height 的平顶体。
   *
   * 约定：
   * - 按 top 升序（同 top 按面积从大到小）。parts[0] 是底座：ring 省略，即 footprint（含洞），顶 = parts[0].top；
   * - 其余每块立在「比它低的最高一层」上：底 = 所有 top 小于本块 top 的块里最大的 top（逐层嵌套，
   *   上层轮廓落在下一层轮廓之内，误差在简化容差 0.5 m 左右）；
   * - height 仍是地政总署 2D 楼的主屋面高度（TopHeight − BaseHeight）：parts 可以高出它（塔冠、机房、桅杆），
   *   也可以低于它（退台）。层数、层高、类型等仍按 height / storeys 算；
   * - 每栋最多 12 块；每块面积 ≥ 4 m²、露出的墙面 ≥ 80 m²（桅杆类：高出下层 ≥ 6 m 的 ≥ 0.5 m²）；
   *   环都是简单多边形（不自交、无重复点，洞在外环内且不相碰）；简化后通常 ≤ 16 点，个别曲线 / 简化会自交的环用细简化或原像素边界环（可达约 200 点）。
   */
  parts?: BuildingPart[];
  /**
   * 真实贴面（R3 新增的可选字段，不改 CITY_FORMAT_VERSION）：地政总署「可視化三維地圖（個別模型）」的照片纹理，
   * 由 fetch/landsd_3d_tex_bake.py 离线投影到我们自己的墙与屋顶上、去日照、打包成贴图页（见 CityMeta.facades）。
   * 没有照片、在敏感区里、被判为有脚手架 / 绿网、或几何指纹与烘焙时不同的楼一律省略（客户端照旧画程序立面）。
   */
  facade?: BuildingFacade;
  /**
   * 电车走廊高清街面层（R4 新增的可选字段，不改 CITY_FORMAT_VERSION）：电车沿线街墙的高清照片（离地 0–45 m）、
   * 夜景分类（店面开口、招牌、玻璃 / 独立窗）、墙面后退深度与雨篷，由 fetch/landsd_3d_hires_bake.py 离线生成（见 CityMeta.hires）。
   * 不在走廊里、在敏感区里、六座地标、照片里有脚手架 / 绿网 / 围板、或几何指纹与烘焙时不同的楼一律省略（客户端照旧用 R3 贴面）。
   */
  hires?: BuildingHires;
}

/**
 * 一栋楼的高清街面层（见 Building.hires）。坐标约定（客户端 render/facades/hires-layout.ts 按此计算纹理坐标）：
 * - 一个「面」是某块棱柱（parts 序号；没有 parts 时 0）某个环（外环 0、洞 1..，归一后的顺序）的第 edge 条边（第 edge 个顶点到下一个顶点）；
 *   s = 从这条边起点沿边的米数（0..边长），z = 高程（dm，mPD）。
 * - 每个面分段（街面段 kind 0：离地 0–15 m；上段 kind 1：15–45 m），段内列 c = s × d、行 r = (zTop − z) × d，d = dq / densityQ px/m；
 *   每片 (页, x, y, c0, r0, w, h)：列 [c0, c0 + w)、行 [r0, r0 + h) 在页里 (x, y) 起，纹素 = (x + c − c0, y + r − r0)；片外没有照片。
 */
export interface BuildingHires {
  /** 每段一项：[part, ring, edge, kind, dq, zTop dm, zBot dm, n, n × (页, x, y, c0, r0, w, h)]。 */
  f: number[][];
  /**
   * 雨篷（照片模型里伸出外墙的近水平板；没有时省略）：每块 [x0, y0, x1, y1, 伸出 dm, 顶面高程 dm, 厚 cm, 顶色, 底色, 檐口色]，
   * (x0, y0)–(x1, y1) 是贴外墙的一边（模拟坐标 dm），雨篷向这条边的右手侧（外法线）伸出；颜色为 0xRRGGBB（sRGB）。
   */
  c?: number[][];
  /**
   * 铺位（R4 整合，可选；接口 I-1 路面铺面溢光的数据）：街面段照片里每间铺的开口，由 fetch/landsd_3d_hires_bays.py 从已打包的页读出。
   * 每项 [part, ring, edge, s0 cm, s1 cm, 店铺种子, 开口顶高程 dm, 开口底高程 dm, 覆盖率 %]：面键与 f 相同，s 为沿这条边的厘米数；
   * 种子与页辅助图 A 通道相同（着色器按「楼 key × 种子」的哈希决定这间铺亮不亮、什么色温，客户端 render/facades/frontage.ts 同一公式）。
   */
  b?: number[][];
  /**
   * 不贴照片的面（R4 整合，可选；红线）：高清烘焙人工 / 自动排除的面（竹棚、棚网、围板样平板、源数据贴图错误），每项 [part, ring, edge]
   * （面键与 f 相同）。客户端这些墙连 R3 贴面也不贴（画程序立面）。只有这一项、没有 f 的楼（f 为空数组）没有高清层。
   */
  x?: number[][];
}

/** 高清街面层的贴图集（见 Building.hires）。 */
export interface HiresMeta {
  /** 贴图文件目录（相对 city/，与 R3 贴面同一目录）。 */
  dir: string;
  /** 颜色页边长、辅助图边长（= page / 2）、切片宽（px）、密度量化。 */
  page: number;
  aux: number;
  tile: number;
  densityQ: number;
  /**
   * 页文件名（下标即页号）。每个文件是 page × 1.5 page 的 RGBA WebP：上面 page 行是颜色（sRGB，有损）+ alpha 码（无损，同 R3：
   * 0 无照片、135–255 连续玻璃度、24 + k 独立窗种子）；下面 page / 2 行的左半是半分辨率辅助图：R = 墙面后退深度（0–reliefMaxM 米），
   * G = 店面开口（夜里亮的铺内，0–1），B = 招牌（按自己的颜色发光，0–1），A = 店铺种子（无损，1–255，0 = 不是店面）。
   */
  pages: string[];
  /** 前 streetPages 页是街面段的页，其余是上段的页（手机可以只取近处的上段页）。 */
  streetPages: number;
  /** 墙面后退深度的满量程（米）。 */
  reliefMaxM: number;
  /** 全部页文件的字节数。 */
  bytes: number;
}

/**
 * 一栋楼的贴面引用（见 Building.facade）。坐标约定（客户端 render/facades/layout.ts 按此计算纹理坐标）：
 * - 每块棱柱的每个环展开成一条墙带：列 c = P × d（P 为沿环从第 0 个顶点起累计的米数，环按外环逆时针、洞顺时针归一后），
 *   行 r = (棱柱顶 − z) × d（米）；墙带按 tile 宽切片，第 k 片的片内列 cl = c − k × tile。
 *   每片只存有照片的外包框：片内列 [c0, c0 + w)、行 [r0, r0 + h) 放在页里 (x, y) 起，纹素 = (x + cl − c0, y + r − r0)；框外没有照片。
 * - 屋顶：外环外包框上的俯视图（不裁边），纹素 = (x + (X − minX) × dr, y + (maxY − Y) × dr)（米）。
 * - 密度 d = dq / densityQ、dr = drq / densityQ（px/m，见 FacadeMeta）。
 */
export interface BuildingFacade {
  /** 检测到的层高与楼层线相位：[层高 cm, 相位 cm]（楼层线 = 楼底 + 相位 + k × 层高，在窗间墙 / 楼板中线）。检测不到时省略。 */
  f?: [number, number];
  /**
   * 每块棱柱一项：有 parts（且客户端能按 parts 分块）时与 parts 的序号对齐，否则只有一项（整栋）。
   * 每项 [dq, drq, 屋顶页, 屋顶 x, 屋顶 y, 环 0 的切片数 n, n × (页, x, y, c0, r0, w, h), 环 1 的切片数, ...]；
   * 页 = −1 表示该片 / 屋顶没有照片；空数组表示这块没有照片。
   */
  p: number[][];
}

/** 贴面贴图集（见 Building.facade）：页文件、远景图集与参数。 */
export interface FacadeMeta {
  /** 贴图文件目录（相对 city/）。 */
  dir: string;
  /** 页边长（px）、墙带切片宽（px）、密度量化（d = q / densityQ px/m）。 */
  page: number;
  tile: number;
  densityQ: number;
  /**
   * 页文件名（下标即页号）。每个文件是 page × page 的 RGBA WebP：RGB = sRGB 颜色（去过日照的反照率），
   * alpha 码 = 0 无照片；135–255 有照片、连续玻璃度 g（255 − 120 g，实墙 255）；24 + k（k = 0..89）照片里认出的独立窗（亮灯种子 k）。
   */
  pages: string[];
  /** 远景图集：每页缩成 cell × cell，cols 列 rows 行；同样 RGBA（alpha 只有连续玻璃度）。low 为 LOW 档用的半分辨率版。 */
  far: { file: string; low: string; cols: number; rows: number; cell: number };
  /** 全部贴图文件的字节数。 */
  bytes: number;
  /** 照片里有明显脚手架 / 绿网 / 工地围板、整栋不用照片的楼号（照旧画程序立面）；没有时省略。 */
  excluded?: string[];
}

/** 一块分层体块（见 Building.parts）。 */
export interface BuildingPart {
  /** 外环（CCW，dm）。parts[0] 省略，表示用 footprint。 */
  ring?: FlatXY;
  /** 洞（CW，dm），≥ 4 m²。省略表示无洞。 */
  holes?: FlatXY[];
  /** 本块顶面高程（dm，mPD）。 */
  top: number;
}

export type RoadClass =
  | 'motorway'
  | 'trunk'
  | 'primary'
  | 'secondary'
  | 'tertiary'
  | 'residential'
  | 'unclassified'
  | 'living_street'
  | 'service'
  | 'pedestrian'
  | 'footway'
  | 'steps'
  | 'path'
  | 'cycleway'
  | 'unknown';

export interface Road {
  id: string;
  cls: RoadClass;
  /** 中心线折线。 */
  pts: FlatXY;
  /** 0 = 双向；1 = 只能沿 pts 方向；-1 = 只能逆 pts 方向。 */
  oneway: 0 | 1 | -1;
  /** 车道总数（源数据没有时按道路等级给默认值）。行人类道路为 0。 */
  lanes: number;
  bridge?: true;
  tunnel?: true;
  /** OSM layer / Overture level，默认 0。 */
  level?: number;
  /** 限速 km/h（有数据时）。 */
  speedKmh?: number;
  /** 街道名是事实信息，可保留；商铺/企业名不得出现在任何字段里。 */
  name?: { zh?: string; en?: string };
}

export interface Rail {
  id: string;
  kind: 'tram' | 'funicular';
  pts: FlatXY;
}

export type SensitiveKind = 'military' | 'government';

export interface SensitiveZone {
  id: string;
  kind: SensitiveKind;
  area: Ring;
}

export interface Zones {
  /** 可玩区（MVP）。玩家、刷车点、任务点只能出现在这里面。 */
  playable: Ring[];
  /** 敏感区：只做背景，不可进入、不可交互、不触发风声。 */
  sensitive: SensitiveZone[];
}

export interface Props {
  signals: FlatXY;
  crossings: FlatXY;
  busStops: FlatXY;
  streetLamps: FlatXY;
  trees: FlatXY;
}

/** 地标摆放参数。名字是建筑的真名（负责人 D6，2026-11-27；只限六座地标的名字这一处），不放 logo。 */
export interface LandmarkPlacement {
  /** 地标 id（客户端的键、资源文件名的一部分），如 'harbour-spire'。 */
  id: string;
  name: { zh: string; en: string };
  /** 地标中心（dm）。 */
  x: number;
  y: number;
  /** 绕 z 轴旋转（弧度，从东向北为正）。 */
  rot: number;
  /** 楼底高程（dm，mPD）。 */
  base: number;
  /** 总高（dm）。 */
  height: number;
  /** 地标原轮廓（用于碰撞和白模兜底）。 */
  footprint: Ring;
  /** 被这座地标替换掉的建筑 ID（已从 buildings 中删除）。 */
  replaces: string[];
  /**
   * R5 真实外观（可选字段，不改 CITY_FORMAT_VERSION；负责人 D5）：地政总署「可視化三維地圖（個別模型）」带照片纹理的原型楼，
   * 由 fetch/landsd_3d_landmark_bake.py 离线减面、重新展开、去日照烘焙（见 CityMeta.landmarkMeshes）。网格与图集文件里没有名字。
   * 没有烘焙产物时省略，客户端画轮廓白模。碰撞照旧按 footprint。
   */
  mesh?: LandmarkMesh;
}

/** 一座地标的真实网格引用（见 LandmarkPlacement.mesh）。 */
export interface LandmarkMesh {
  /** 近景网格文件名（CLMK v1，相对 city/<CityMeta.landmarkMeshes.dir>/）。 */
  high: string;
  /** 三角形数：[近景网格, 在六座合一的远景网格里的份额]。 */
  tris: [number, number];
  /** 层高与楼层线相位（cm；楼层线 = 相位 + k × 层高，mPD）。 */
  floors: [number, number];
  /** 网格外包盒（dm）：[minX, minY, minZ, maxX, maxY, maxZ]。 */
  bbox: [number, number, number, number, number, number];
  /** 航空障碍灯位置（dm，扁平 [x, y, z, …]，在网格最高处）；没有时省略。 */
  aviation?: number[];
  /**
   * 网格在行人高度（离地 0.3–2.0 m）的实心范围（dm 外环，逆时针；R4 + R5 整合复审）。客户端的行人走线、街上设施、路灯杆
   * 与楼宇轮廓一起避开它（网格在街面高度可能伸出 footprint）。没有时省略。
   */
  street?: FlatXY[];
}

/** 地标真实网格的文件（见 LandmarkPlacement.mesh）。 */
export interface LandmarkMeshMeta {
  /** 文件目录（相对 city/）。 */
  dir: string;
  /** 六座合一的远景网格（CLMK v1）。 */
  low: string;
  /** 照片图集（同一布局；RGB = 去日照的反照率 sRGB，alpha = 玻璃度）。 */
  atlas: LandmarkAtlas;
  /** 全部文件的字节数。 */
  bytes: number;
}

/** 地标照片图集的几种编码（同一布局，客户端按 GPU 能力与画质档挑一份）。 */
export interface LandmarkAtlas {
  /** 全分辨率边长（px）。 */
  size: number;
  /** GPU 压缩（CLTX v1，含 mip）：BC3 / DXT5 全分辨率与半分辨率、ETC2 RGBA8 EAC 半分辨率。 */
  bc3: string;
  bc3Half: string;
  etc2Half: string;
  /** 四分之一分辨率的 BC3 / ETC2（LOW 档；半分辨率文件去掉最大一级 mip，R4 + R5 整合复审）。 */
  bc3Quarter: string;
  etc2Quarter: string;
  /** 不支持这两种压缩时的 RGBA WebP：半分辨率与四分之一分辨率。 */
  webpHalf: string;
  webpQuarter: string;
}

export interface CityFile {
  format: typeof CITY_FORMAT;
  version: typeof CITY_FORMAT_VERSION;
  meta: CityMeta;
  buildings: Building[];
  roads: Road[];
  rails: Rail[];
  /** 海面/水体多边形（海面高程 0 mPD）。 */
  water: Ring[];
  zones: Zones;
  props: Props;
  landmarks: LandmarkPlacement[];
}

/**
 * terrain.bin（小端）：
 *   0  char[4]  magic 'CTER'
 *   4  uint16   version = 1
 *   6  uint16   reserved = 0
 *   8  int32    x0  —— 网格左下角（西南）本地 x，dm
 *  12  int32    y0  —— 网格左下角本地 y，dm
 *  16  uint16   cell —— 网格间距，dm
 *  18  uint16   nx   —— 东向采样数
 *  20  uint16   ny   —— 北向采样数
 *  22  uint16   reserved = 0
 *  24  int16[nx*ny] 高程 dm（mPD），行优先：先 x 后 y（index = j*nx + i）
 * 海面及无数据处写 0。
 */
export const TERRAIN_MAGIC = 'CTER' as const;
export const TERRAIN_VERSION = 1 as const;
export const TERRAIN_HEADER_BYTES = 24 as const;

export interface TerrainGrid {
  x0: number;
  y0: number;
  cell: number;
  nx: number;
  ny: number;
  /** 高程 dm，长度 nx*ny。 */
  heights: Int16Array;
}
