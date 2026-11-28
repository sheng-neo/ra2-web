/**
 * 开发用合成城市（?fixture=1）：管线产物还没到位时也能调渲染。
 * 最高的四栋矩形楼带 LOD2 分层体块（Building.parts）：两栋四面退台 + 桅杆，两栋单边退台（三面共面）+ 塔冠机房。
 * 结构照抄真实数据的契约：北面是海港、几条东西向干道、电车轨、一段高架、
 * 一块敏感区、六座地标摆放。几何全部是虚构的，不对应真实楼宇；六座地标的名字照真实数据用建筑的真名（负责人 D6，
 * 与 citymap/src/redlines.ts 的 LANDMARK_REAL_NAMES 逐字相同；冒烟脚本按这个文件里的次数豁免它们）。
 */
import {
  CITY_FORMAT,
  CITY_FORMAT_VERSION,
  type Building,
  type BuildingKind,
  type CityFile,
  type FlatXY,
  type LandmarkPlacement,
  type Rail,
  type Road,
  type RoadClass,
} from '@central/data';
import { reverseRing } from '../geom/ring';

/** mulberry32：确定性伪随机。 */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 以 (cx, cy) 为中心、宽 w 高 h、绕 z 转 rot 的矩形，逆时针，dm。 */
function rect(cx: number, cy: number, w: number, h: number, rot = 0): FlatXY {
  const c = Math.cos(rot);
  const s = Math.sin(rot);
  const out: FlatXY = [];
  for (const [lx, ly] of [
    [-w / 2, -h / 2],
    [w / 2, -h / 2],
    [w / 2, h / 2],
    [-w / 2, h / 2],
  ] as const) {
    out.push(Math.round(cx + lx * c - ly * s), Math.round(cy + lx * s + ly * c));
  }
  return out;
}

const EXTENT: [number, number, number, number] = [-8110, -9830, 16630, 8990];
const PLAYABLE = rect((140 + 6530) / 2, (-4850 + 5120) / 2, 6530 - 140, 5120 + 4850);

interface Block {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

function road(id: string, cls: RoadClass, pts: FlatXY, lanes: number, extra: Partial<Road> = {}): Road {
  return { id, cls, pts, oneway: 0, lanes, ...extra };
}

export function makeFixtureCity(): CityFile {
  const rand = rng(20261124);
  const roads: Road[] = [
    road('r-cn', 'primary', [-8000, 4300, 16000, 4300], 6, { name: { zh: '干諾道中', en: 'Connaught Road Central' } }),
    road('r-dv', 'secondary', [-8000, 2500, 16000, 2500], 4, { name: { zh: '德輔道中', en: 'Des Voeux Road Central' } }),
    road('r-qr', 'secondary', [-8000, 500, 9000, 500], 3, { oneway: 1, name: { zh: '皇后大道中', en: "Queen's Road Central" } }),
    road('r-s1', 'tertiary', [-8000, -2500, 9000, -2500], 2),
    road('r-fly', 'trunk', [1000, 4300, 2500, 3950, 5500, 3950, 7000, 4300], 2, { oneway: 1, bridge: true, level: 1 }),
  ];
  for (const [i, x] of [-2000, 1000, 4000, 7000].entries()) {
    roads.push(road(`r-n${i}`, 'tertiary', [x, -6000, x, 2500], 2));
    roads.push(road(`r-m${i}`, 'tertiary', [x, 2500, x, 4300], 2));
  }
  roads.push(road('r-ped', 'pedestrian', [-2000, -1200, 1000, -1200], 0));

  const rails: Rail[] = [
    { id: 't-e', kind: 'tram', pts: [-8000, 2465, 16000, 2465] },
    { id: 't-w', kind: 'tram', pts: [16000, 2535, -8000, 2535] },
  ];

  const landmarks: LandmarkPlacement[] = [
    lm('harbour-spire', '國際金融中心二期', 'Two International Finance Centre', 2500, 3350, 0, 560, 560, 4120),
    lm('neon-centre', '中環中心', 'The Center', -500, 1500, 0, 480, 480, 3460),
    lm('porthole-house', '怡和大廈', 'Jardine House', 5500, 1500, 0, 440, 440, 1785),
    lm('steel-frame', '滙豐總行大廈', 'HSBC Main Building', 2500, -1000, 0, 700, 550, 1788),
    lm('mirror-block', '長江集團中心', 'Cheung Kong Center', 5500, -1000, 0.1, 560, 560, 2830),
    lm('prism-tower', '中銀大廈', 'Bank of China Tower', 2500, -4300, 0.35, 520, 520, 3674),
  ];

  const blocks: Block[] = [];
  const xs = [-8000, -2000, 1000, 4000, 7000, 9000];
  const ys = [-6000, -2500, 500, 2500, 4300];
  for (let i = 0; i + 1 < xs.length; i++) {
    for (let j = 0; j + 1 < ys.length; j++) {
      blocks.push({ x0: xs[i]! + 120, y0: ys[j]! + 120, x1: xs[i + 1]! - 120, y1: ys[j + 1]! - 120 });
    }
  }
  const buildings: Building[] = [];
  const hitsLandmark = (x0: number, y0: number, x1: number, y1: number) =>
    landmarks.some((l) => x1 > l.x - 420 && x0 < l.x + 420 && y1 > l.y - 420 && y0 < l.y + 420);
  for (const b of blocks) {
    // 北侧那一排要给高架让出空间
    const yTop = b.y1 > 4000 ? Math.min(b.y1, 3750) : b.y1;
    for (let x = b.x0; x + 200 < b.x1; ) {
      const w = 220 + Math.floor(rand() * 260);
      for (let y = b.y0; y + 200 < yTop; ) {
        const d = 220 + Math.floor(rand() * 260);
        const x1 = Math.min(x + w, b.x1);
        const y1 = Math.min(y + d, yTop);
        if (!hitsLandmark(x, y, x1, y1)) {
          const north = (y + 6000) / 10300;
          const h = Math.round((120 + rand() * rand() * 1700) * (0.5 + north));
          const kinds: BuildingKind[] = ['tower', 'podium', 'house', 'other'];
          const outer = rect((x + x1) / 2, (y + y1) / 2, x1 - x - 40, y1 - y - 40);
          buildings.push({
            id: `fx-${buildings.length}`,
            src: 'fixture',
            footprint: rand() < 0.08 ? { outer, holes: [reverseRing(rect((x + x1) / 2, (y + y1) / 2, (x1 - x) / 3, (y1 - y) / 3))] } : { outer },
            base: 0,
            height: Math.max(80, h),
            heightSource: 'heuristic',
            kind: kinds[Math.floor(rand() * kinds.length)]!,
            style: Math.floor(rand() * 256),
          });
        }
        y += d + 60 + Math.floor(rand() * 60);
      }
      x += w + 60 + Math.floor(rand() * 60);
    }
  }
  addParts(buildings);

  // 敏感区内的楼（应渲染成无窗灰体）
  const sensitiveArea = rect(11000, 3300, 3000, 2600);
  for (const [i, [cx, cy, w, d, h]] of [
    [10300, 2600, 600, 300, 180],
    [11600, 3000, 500, 500, 1000],
    [10800, 4000, 900, 260, 120],
  ].entries()) {
    buildings.push({
      id: `fx-mil-${i}`,
      src: 'fixture',
      footprint: { outer: rect(cx!, cy!, w!, d!) },
      base: 0,
      height: h!,
      heightSource: 'heuristic',
      kind: 'civic',
      style: 0,
    });
  }

  // 海岸线：北面 y≈4650 起是海港，岸线略带锯齿；外加一个小水池
  const coast: FlatXY = [EXTENT[0], 4650];
  for (let x = -7000; x < 16000; x += 1000) coast.push(x, 4650 + Math.round(Math.sin(x * 0.0011) * 150));
  coast.push(EXTENT[2], 4650, EXTENT[2], EXTENT[3], EXTENT[0], EXTENT[3]);

  return {
    format: CITY_FORMAT,
    version: CITY_FORMAT_VERSION,
    meta: {
      origin: { e: 834000, n: 816000, lon: 114.15486, lat: 22.28288 },
      crs: 'EPSG:2326',
      unit: 'dm',
      bbox: EXTENT,
      sources: [
        {
          id: 'fixture',
          license: 'CC0-1.0',
          attribution: '合成測試數據（程序生成，非真實地圖）',
        },
      ],
      build: { pipelineVersion: 'fixture', inputsDigest: 'fixture' },
    },
    buildings,
    roads,
    rails,
    water: [{ outer: coast }, { outer: rect(-4500, -4000, 300, 200) }],
    zones: {
      playable: [{ outer: PLAYABLE }],
      sensitive: [{ id: 'fx-mil', kind: 'military', area: { outer: sensitiveArea } }],
    },
    props: { signals: [], crossings: [], busStops: [], streetLamps: [], trees: [] },
    landmarks,
  };
}

function lm(
  id: string,
  zh: string,
  en: string,
  x: number,
  y: number,
  rot: number,
  w: number,
  d: number,
  height: number,
): LandmarkPlacement {
  return { id, name: { zh, en }, x, y, rot, base: 0, height, footprint: { outer: rect(x, y, w, d, rot) }, replaces: [] };
}

/**
 * 给最高的四栋无洞矩形楼加分层体块（覆盖 Building.parts 的渲染路径）。
 * 偶数号：45 % 高处四面退台、80 % 再退、顶上 1 m × 1 m 桅杆高 12 m；奇数号：北侧 35 % 在 60 % 高处退台（其余三面共面），
 * 顶上中间一块 6 m 高的机房。part.top 是绝对高程（fixture 楼底 0）。
 */
function addParts(buildings: Building[]): void {
  const tall = buildings
    .filter((b) => !b.footprint.holes && b.height >= 700)
    .sort((a, b) => b.height - a.height || (a.id < b.id ? -1 : 1))
    .slice(0, 4);
  tall.forEach((b, i) => {
    const o = b.footprint.outer;
    const xs = o.filter((_, k) => k % 2 === 0);
    const ys = o.filter((_, k) => k % 2 === 1);
    const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
    const cx = (x0 + x1) / 2;
    const cy = (y0 + y1) / 2;
    const inset = (f: number) => rect(cx, cy, (x1 - x0) * f, (y1 - y0) * f);
    const h = b.height;
    b.parts =
      i % 2 === 0
        ? [{ top: Math.round(h * 0.45) }, { ring: inset(0.78), top: Math.round(h * 0.8) }, { ring: inset(0.55), top: h }, { ring: rect(cx, cy, 10, 10), top: h + 120 }]
        : [
            { top: Math.round(h * 0.6) },
            { ring: [x0, y0, x1, y0, x1, Math.round(y1 - (y1 - y0) * 0.35), x0, Math.round(y1 - (y1 - y0) * 0.35)], top: h },
            { ring: rect(cx, cy - (y1 - y0) * 0.2, (x1 - x0) * 0.3, (y1 - y0) * 0.2), top: h + 60 },
          ];
  });
}
