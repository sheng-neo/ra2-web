/**
 * 开发用合成城市（?fixture=1）：管线产物还没到位时也能调渲染。
 * 结构照抄真实数据的契约：北面是海港、几条东西向干道、电车轨、一段高架、
 * 一块敏感区、六座地标摆放。内容全部是虚构的，不对应真实楼宇。
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
    lm('harbour-spire', '海港塔', 'Harbour Spire', 2500, 3350, 0, 560, 560, 4120),
    lm('neon-centre', '霓虹中心', 'Neon Centre', -500, 1500, 0, 480, 480, 3460),
    lm('porthole-house', '圓窗大廈', 'Porthole House', 5500, 1500, 0, 440, 440, 1785),
    lm('steel-frame', '鋼架大樓', 'Steel Frame', 2500, -1000, 0, 700, 550, 1788),
    lm('mirror-block', '鏡面大廈', 'Mirror Block', 5500, -1000, 0.1, 560, 560, 2830),
    lm('prism-tower', '三稜塔', 'Prism Tower', 2500, -4300, 0.35, 520, 520, 3674),
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
