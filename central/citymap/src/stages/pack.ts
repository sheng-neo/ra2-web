/**
 * 11-pack：CityFile → central.json（确定性字节）+ ATTRIBUTION.txt + LICENSE-ODbL.txt，
 * 地形网格 → terrain.bin（@central/data 的 encodeTerrain）。
 *
 * 确定性：键序按下面的 schema 表重排（与对象构造顺序无关），多余键直接报错；
 * 除经纬度原点与地标旋转角外，所有数字必须是整数。
 * 版式：顶层与第二层逐行展开，每个要素一行，方便 diff。
 */
import { encodeTerrain, SOURCE_TREE_URL, type CityFile, type TerrainGrid } from '@central/data';
import { OVERTURE_RELEASE } from '../config';
import { blacklistHit } from '../redlines';
import { REF_TOMTOM } from '../sources/refs';
import { CSDI_LICENSE } from './terrain-refs';

export const CITY_FILE = 'central.json';
export const TERRAIN_FILE = 'terrain.bin';

type Shape =
  | 'city' | 'meta' | 'origin' | 'source' | 'build' | 'building' | 'ring' | 'road' | 'name'
  | 'rail' | 'zones' | 'zone' | 'props' | 'landmark';

const ORDER: Record<Shape, readonly string[]> = {
  city: ['format', 'version', 'meta', 'buildings', 'roads', 'rails', 'water', 'zones', 'props', 'landmarks'],
  meta: ['origin', 'crs', 'unit', 'bbox', 'sources', 'build'],
  origin: ['e', 'n', 'lon', 'lat'],
  source: ['id', 'license', 'attribution', 'url'],
  build: ['pipelineVersion', 'inputsDigest'],
  building: ['id', 'src', 'footprint', 'base', 'height', 'heightSource', 'kind', 'style', 'storeys'],
  ring: ['outer', 'holes'],
  road: ['id', 'cls', 'pts', 'oneway', 'lanes', 'bridge', 'tunnel', 'level', 'speedKmh', 'name'],
  name: ['zh', 'en'],
  rail: ['id', 'kind', 'pts'],
  zones: ['playable', 'sensitive'],
  zone: ['id', 'kind', 'area'],
  props: ['signals', 'crossings', 'busStops', 'streetLamps', 'trees'],
  landmark: ['id', 'name', 'x', 'y', 'rot', 'base', 'height', 'footprint', 'replaces'],
};

const CHILD: Partial<Record<Shape, Record<string, Shape>>> = {
  city: {
    meta: 'meta', buildings: 'building', roads: 'road', rails: 'rail', water: 'ring',
    zones: 'zones', props: 'props', landmarks: 'landmark',
  },
  meta: { origin: 'origin', sources: 'source', build: 'build' },
  building: { footprint: 'ring' },
  road: { name: 'name' },
  zones: { playable: 'ring', sensitive: 'zone' },
  zone: { area: 'ring' },
  landmark: { name: 'name', footprint: 'ring' },
};

/** 允许非整数的字段。 */
const FLOAT_KEYS = new Set(['origin.lon', 'origin.lat', 'landmark.rot']);

function canon(v: unknown, shape: Shape | undefined, where: string, allowFloat = false): unknown {
  if (Array.isArray(v)) return v.map((e, i) => canon(e, shape, `${where}[${i}]`, allowFloat));
  if (typeof v === 'number') {
    if (!Number.isFinite(v)) throw new Error(`${where}: 非有限数字`);
    if (!allowFloat && !Number.isInteger(v)) throw new Error(`${where}: 应为整数，得到 ${v}`);
    return v;
  }
  if (v === null || typeof v !== 'object') return v;
  if (!shape) throw new Error(`${where}: 未声明的对象`);
  const obj = v as Record<string, unknown>;
  const order = ORDER[shape];
  for (const k of Object.keys(obj)) if (!order.includes(k)) throw new Error(`${where}: ${shape} 不该有键 ${k}`);
  const out: Record<string, unknown> = {};
  for (const k of order) {
    const x = obj[k];
    if (x === undefined) continue;
    out[k] = canon(x, CHILD[shape]?.[k], `${where}.${k}`, FLOAT_KEYS.has(`${shape}.${k}`));
  }
  return out;
}

function layout(v: unknown, depth: number): string {
  if (depth >= 2 || v === null || typeof v !== 'object') return JSON.stringify(v);
  if (Array.isArray(v)) {
    if (v.length === 0 || typeof v[0] !== 'object') return JSON.stringify(v);
    return `[\n${v.map((e) => JSON.stringify(e)).join(',\n')}\n]`;
  }
  const body = Object.entries(v).map(([k, x]) => `${JSON.stringify(k)}:${layout(x, depth + 1)}`);
  return `{\n${body.join(',\n')}\n}`;
}

/** 遍历产物里的每个字符串（含路径），给红线检查和测试用。 */
export function collectStrings(v: unknown, where = '', out: [string, string][] = []): [string, string][] {
  if (typeof v === 'string') out.push([where, v]);
  else if (Array.isArray(v)) v.forEach((e, i) => collectStrings(e, `${where}[${i}]`, out));
  else if (v && typeof v === 'object') {
    for (const [k, x] of Object.entries(v)) collectStrings(x, where ? `${where}.${k}` : k, out);
  }
  return out;
}

export function serializeCity(city: CityFile): string {
  for (const [where, s] of collectStrings(city)) {
    const hit = blacklistHit(s);
    if (hit) throw new Error(`红线：${where} 含有「${hit}」`);
  }
  return `${layout(canon(city, 'city', 'city'), 0)}\n`;
}

/** 署名条目：多行署名（英文 + 繁中）的续行缩进对齐。 */
function sourceLines(city: CityFile): string[] {
  return city.meta.sources.map((s) => {
    const text = s.attribution.split('\n').join('\n  ');
    return `* ${text}\n  License: ${s.license}${s.url ? `\n  ${s.url}` : ''}`;
  });
}

/** 建筑图层是否来自港府数据（整层，见 build.ts）。 */
const govBuildings = (city: CityFile): boolean => city.buildings.some((b) => b.src === 'landsd');

/** ODbL 图层的来源描述：OSM 为主，用到 TomTom 路段时如实写上。 */
function odblOrigin(city: CityFile): string {
  const tomtom = city.meta.sources.some((s) => s.id === REF_TOMTOM.id);
  return tomtom
    ? 'OpenStreetMap data (© OpenStreetMap contributors) and some TomTom road segments, both ODbL-1.0,'
    : 'OpenStreetMap data (© OpenStreetMap contributors),';
}

function attributionText(city: CityFile): string {
  const gov = govBuildings(city);
  const lines = [
    '中環急件 Central Rush — 地圖數據鳴謝 / Map data attribution',
    '',
    `${CITY_FILE} and ${TERRAIN_FILE} are generated from the following sources:`,
    '',
    ...sourceLines(city),
    '',
    'Which layer comes from which source (one source per layer, never mixed feature by feature):',
    `* ${CITY_FILE} roads, rails, water, zones, props: ${odblOrigin(city)} distributed by Overture Maps Foundation.`,
    gov
      ? `* ${CITY_FILE} buildings and landmarks (footprints, base and top heights, storey counts): Lands Department Building data ` +
        `via the CSDI Portal (${CSDI_LICENSE}; not part of the ODbL database).`
      : `* ${CITY_FILE} buildings and landmarks: OpenStreetMap / Overture building footprints (ODbL-1.0; ` +
        'some footprints CC-BY-4.0 as listed above).',
    `* ${TERRAIN_FILE} (ground elevation): Civil Engineering and Development Department 2020 LiDAR DTM via the ` +
      `CSDI Portal (${CSDI_LICENSE}; not part of the ODbL database).`,
    '',
    'Changes made: features re-projected to HK1980 Grid (EPSG:2326) in local decimetres; footprints simplified',
    '(0.3 m) and slivers under 4 m² removed; missing building heights estimated; all building and business',
    `names removed;${gov ? ' open-sided structures omitted;' : ''} ${city.landmarks.length} buildings replaced by ` +
      'fictional landmark placements;',
    'props inside sensitive (military / government) zones removed; terrain resampled to a 5 m grid, outliers',
    'and small gaps repaired, with the sea set to 0 mPD.',
    '',
    'The OpenStreetMap-derived database is licensed under ODbL-1.0; see LICENSE-ODbL.txt.',
    `Data marked ${CSDI_LICENSE} is used under the CSDI Portal Terms and Conditions of Use`,
    '(https://portal.csdi.gov.hk/csdi-webpage/doc/TNC); it is not relicensed.',
    '',
  ];
  return lines.join('\n');
}

function odblNotice(city: CityFile): string {
  const gov = govBuildings(city);
  return [
    `${CITY_FILE} — Open Database License (ODbL) v1.0 notice`,
    '',
    `The ODbL part of ${CITY_FILE} is a Derivative Database of ${odblOrigin(city)}`,
    `obtained through the Overture Maps Foundation release ${OVERTURE_RELEASE}. It is made available`,
    'under the Open Database License v1.0:',
    '  https://opendatacommons.org/licenses/odbl/1-0/',
    'Any rights in individual contents of the database are licensed under the Database Contents',
    'License v1.0: https://opendatacommons.org/licenses/dbcl/1-0/',
    '',
    'Scope:',
    `* ODbL: the roads, rails, water, zones and props arrays of ${CITY_FILE}` +
      (gov ? '.' : ', and its buildings and landmarks arrays.'),
    ...(gov
      ? [
          `* Not ODbL: the buildings and landmarks arrays of ${CITY_FILE} (Lands Department data) and ${TERRAIN_FILE}`,
          `  (CEDD LiDAR DTM) are independent HKSAR Government data used under the CSDI terms (see ATTRIBUTION.txt).`,
          '  They are kept as separate whole layers, combined with the ODbL layers only as a collective work.',
        ]
      : [
          `* Not ODbL: ${TERRAIN_FILE} (CEDD LiDAR DTM) is independent HKSAR Government data used under the CSDI`,
          '  terms (see ATTRIBUTION.txt).',
        ]),
    '',
    'Derived database and how it is produced (ODbL section 4.6):',
    `* The derived database is ${CITY_FILE} in this directory (central/client/public/city/${CITY_FILE}`,
    '  in the source repository).',
    `* Source repository: ${SOURCE_TREE_URL}`,
    '* Its generation method is the open-source pipeline in central/citymap/ of the same repository',
    '  (run `pnpm citymap`), applied to the raw snapshots committed under',
    `  central/citymap/data-raw/overture-${OVERTURE_RELEASE}/ and central/citymap/data-raw/landsd/`,
    '  (each sources.json lists every file with its sha256). The pipeline reproduces the files byte for byte.',
    '',
    ...(gov
      ? []
      : ['Some building footprints come from a CC-BY-4.0 dataset (see ATTRIBUTION.txt); those contents',
        'remain under CC-BY-4.0.']),
    'No technical restrictions (DRM) are applied to this data.',
    '',
  ].join('\n');
}

/** 文本产物：文件名 → 内容。 */
export function packCity(city: CityFile): Map<string, string> {
  return new Map([
    [CITY_FILE, serializeCity(city)],
    ['ATTRIBUTION.txt', attributionText(city)],
    ['LICENSE-ODbL.txt', odblNotice(city)],
  ]);
}

/** 全部产物（含二进制 terrain.bin）：文件名 → 字节。 */
export function packOutputs(city: CityFile, terrain: TerrainGrid): Map<string, Uint8Array> {
  const out = new Map<string, Uint8Array>();
  for (const [name, text] of packCity(city)) out.set(name, new TextEncoder().encode(text));
  out.set(TERRAIN_FILE, encodeTerrain(terrain));
  return out;
}
