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

/** 代码建模的地标摆放参数。地标一律用虚构名，不出现真实楼名和 logo。 */
export interface LandmarkPlacement {
  /** 客户端 builder 的键，如 'harbour-spire'。 */
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
