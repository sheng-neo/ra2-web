/**
 * 集成测试：用仓库里的真实快照构建一次，检查产物不变量与红线。
 * 默认建筑图层是地政总署（LandsD）；Overture 建筑层另建一次，只验楼数。
 */
import { decodeTerrain, SOURCE_TREE_URL, type CityFile, type Road, type TerrainGrid } from '@central/data';
import { gzipSync } from 'node:zlib';
import { beforeAll, describe, expect, it } from 'vitest';
import { buildCity } from './build';
import { MVP_RECT } from './config';
import { groundOf, lowestGround } from './geo/ground';
import { inRect } from './geo/polyline';
import { pointInRing, ringCentroid, ringDistance, signedArea2 } from './geo/ring';
import { LANDMARKS } from './overrides/landmarks';
import { REF_EAST_ASIA_BUILDINGS, REF_OSM, REF_OVERTURE, REF_TOMTOM } from './sources/refs';
import { CITY_FILE, collectStrings, packCity, packOutputs, TERRAIN_FILE } from './stages/pack';
import { project, projectRectBounds } from './stages/project';
import { REF_CEDD_DTM, REF_LANDSD_BUILDINGS } from './stages/terrain-refs';

let city: CityFile;
let grid: TerrainGrid;
let files: Map<string, string>;
let outputs: Map<string, Uint8Array>;

beforeAll(async () => {
  const build = await buildCity();
  city = build.city;
  grid = build.terrain.grid;
  files = packCity(city);
  outputs = packOutputs(city, grid);
});

/** 原调研范围（PLAN §3.1 的 v2 抽取框）。 */
const RESEARCH = projectRectBounds({ west: 114.15, south: 22.277, east: 114.166, north: 22.2895 });
const inResearch = (c: CityFile) => c.buildings.filter((b) => inRect(...ringCentroid(b.footprint.outer), RESEARCH)).length;

const PEDESTRIAN = new Set(['pedestrian', 'footway', 'steps', 'path', 'cycleway']);

function drivable(en: string): Road[] {
  return city.roads.filter((r) => r.name?.en === en && !PEDESTRIAN.has(r.cls));
}

/** 按通行方向排好的折线。 */
function effective(r: Road): number[] {
  if (r.oneway !== -1) return r.pts;
  const out: number[] = [];
  for (let i = r.pts.length - 2; i >= 0; i -= 2) out.push(r.pts[i]!, r.pts[i + 1]!);
  return out;
}

/** 按通行方向逐边累计：[向西, 向东, 向北, 向南] 长度（dm）。 */
function headings(roads: readonly Road[]): { west: number; east: number; north: number; south: number } {
  const h = { west: 0, east: 0, north: 0, south: 0 };
  for (const r of roads) {
    const p = effective(r);
    for (let i = 2; i < p.length; i += 2) {
      const dx = p[i]! - p[i - 2]!;
      const dy = p[i + 1]! - p[i - 1]!;
      const l = Math.hypot(dx, dy);
      if (dx < 0) h.west += l;
      else h.east += l;
      if (dy > 0) h.north += l;
      else h.south += l;
    }
  }
  return h;
}

function touches(x: number, y: number, roads: readonly Road[]): boolean {
  return roads.some((r) => {
    for (let i = 0; i < r.pts.length; i += 2) if (Math.hypot(r.pts[i]! - x, r.pts[i + 1]! - y) <= 20) return true;
    return false;
  });
}

describe('建筑（LandsD 整层）', () => {
  it('全部来自 LandsD，署名只列 LandsD，不再有 Overture 楼', () => {
    expect(city.buildings.every((b) => b.src === 'landsd')).toBe(true);
    const ids = city.meta.sources.map((s) => s.id);
    expect(ids).toContain(REF_LANDSD_BUILDINGS.id);
    expect(ids).not.toContain(REF_EAST_ASIA_BUILDINGS.id);
  });

  it('质心落在原调研范围内的楼数 = 1970 ± 20', () => {
    // 快照里质心在此范围的 LandsD 块 2107 个：去掉有盖构筑物 109 个、地标替换 7 个、< 4 m² 碎片与质心移出者 → 1970
    expect(Math.abs(inResearch(city) - 1970)).toBeLessThanOrEqual(20);
  });

  it('高度：塔楼、裙楼几乎全部取 LandsD 楼顶 − 楼底（快照里只有 1 座塔楼缺高程）；其余用启发式', () => {
    const main = city.buildings.filter((b) => b.kind !== 'other');
    expect(main.filter((b) => b.heightSource !== 'landsd').length).toBeLessThanOrEqual(1);
    expect(new Set(city.buildings.map((b) => b.heightSource))).toEqual(new Set(['landsd', 'heuristic']));
  });

  it('层数：取自 LandsD Storeys 的正整数，塔楼大多有；层高（高 ÷ 层数）中位数落在 3–4.5 m', () => {
    const towers = city.buildings.filter((b) => b.kind === 'tower');
    const withStoreys = towers.filter((b) => b.storeys !== undefined);
    expect(withStoreys.length / towers.length).toBeGreaterThan(0.6);
    for (const b of city.buildings) {
      if (b.storeys === undefined) continue;
      expect(Number.isInteger(b.storeys)).toBe(true);
      expect(b.storeys).toBeGreaterThan(0);
    }
    const f2f = withStoreys.map((b) => b.height / 10 / b.storeys!).sort((a, b) => a - b);
    const mid = f2f[f2f.length >> 1]!;
    expect(mid).toBeGreaterThan(3);
    expect(mid).toBeLessThan(4.5);
  });

  it('楼底：中位数贴地（±1 m），≥ 95% 不埋进地面 3 m 以下；缺高程的楼取轮廓最低顶点的地形', () => {
    const ground = groundOf(grid);
    const d = city.buildings.map((b) => b.base - lowestGround(b.footprint.outer, ground)).sort((a, b) => a - b);
    expect(Math.abs(d[d.length >> 1]!)).toBeLessThan(10);
    expect(d.filter((v) => v >= -30).length / d.length).toBeGreaterThan(0.95);
    for (const b of city.buildings) {
      expect(b.base).toBeGreaterThan(-50);
      expect(b.base).toBeLessThan(6000);
      if (b.heightSource === 'heuristic') expect(b.base).toBe(lowestGround(b.footprint.outer, ground));
    }
  });

  it('外环 CCW、洞 CW、首尾不重复、坐标为整数', () => {
    for (const b of city.buildings) {
      const o = b.footprint.outer;
      expect(o.length).toBeGreaterThanOrEqual(6);
      expect(signedArea2(o)).toBeGreaterThan(0);
      expect(o[0] === o[o.length - 2] && o[1] === o[o.length - 1]).toBe(false);
      for (const h of b.footprint.holes ?? []) expect(signedArea2(h)).toBeLessThan(0);
      expect(o.every(Number.isInteger)).toBe(true);
      expect(b.height).toBeGreaterThan(0);
    }
  });

  it('各数组 ID 唯一且按 ID 排序', () => {
    for (const arr of [city.buildings, city.roads, city.rails, city.zones.sensitive, city.landmarks]) {
      const ids = arr.map((x) => x.id);
      expect(ids).toEqual([...ids].sort());
      expect(new Set(ids).size).toBe(ids.length);
    }
  });
});

describe('Overture 建筑层（--buildings=overture，对照用）', () => {
  it('质心落在原调研范围内的楼数 = 1612 ± 20', async () => {
    const { city: ovt } = await buildCity({ buildings: 'overture' });
    expect(ovt.buildings.every((b) => b.src === 'ovt')).toBe(true);
    expect(Math.abs(inResearch(ovt) - 1612)).toBeLessThanOrEqual(20);
    // 没有源楼底时取轮廓最低顶点的地形
    const ground = groundOf(grid);
    for (const b of ovt.buildings.slice(0, 200)) expect(b.base).toBe(lowestGround(b.footprint.outer, ground));
  });
});

describe('地标', () => {
  it('楼底取轮廓最低顶点处的地形（海旁地标 0–15 mPD）', () => {
    const ground = groundOf(grid);
    for (const l of city.landmarks) {
      expect(l.base).toBe(lowestGround(l.footprint.outer, ground));
      expect(l.base).toBeGreaterThan(0);
      expect(l.base).toBeLessThan(150);
    }
  });

  it('六座虚构地标，高度取核实表，原轮廓已从 buildings 删除', () => {
    expect(city.landmarks.map((l) => l.id).sort()).toEqual(LANDMARKS.map((l) => l.id).sort());
    const ids = new Set(city.buildings.map((b) => b.id));
    for (const l of city.landmarks) {
      const spec = LANDMARKS.find((s) => s.id === l.id)!;
      expect(l.height).toBe(Math.round(spec.heightM * 10));
      expect(l.name).toEqual(spec.name);
      expect(l.replaces.length).toBeGreaterThan(0);
      for (const r of l.replaces) expect(ids.has(r)).toBe(false);
      expect(pointInRing(l.x, l.y, l.footprint.outer)).toBe(true);
      const [ax, ay] = project(spec.at[0], spec.at[1]);
      // at 取自 Overture 轮廓质心；LandsD 同一座楼的轮廓质心离它不到 5 m
      expect(Math.hypot(l.x - ax, l.y - ay)).toBeLessThan(50);
    }
  });
});

describe('单行（只信数据，已对照实地）', () => {
  it("皇后大道中：全段单行向西", () => {
    const roads = drivable("Queen's Road Central");
    expect(roads.length).toBeGreaterThan(5);
    expect(roads.every((r) => r.oneway !== 0)).toBe(true);
    const h = headings(roads);
    expect(h.east).toBe(0);
  });

  it('荷李活道：全段单行向东', () => {
    const roads = drivable('Hollywood Road');
    expect(roads.length).toBeGreaterThan(5);
    expect(roads.every((r) => r.oneway !== 0)).toBe(true);
    expect(headings(roads).west).toBe(0);
  });

  it('雲咸街：单行下坡，从荷李活道驶入、在皇后大道中驶出', () => {
    const wyndham = drivable('Wyndham Street');
    const hollywood = drivable('Hollywood Road');
    const qrc = drivable("Queen's Road Central");
    expect(wyndham.every((r) => r.oneway !== 0)).toBe(true);
    const ends = wyndham.map((r) => {
      const p = effective(r);
      return { s: [p[0]!, p[1]!] as const, e: [p[p.length - 2]!, p[p.length - 1]!] as const };
    });
    const fromHollywood = ends.filter(({ s, e }) => touches(...s, hollywood) || touches(...e, hollywood));
    const toQrc = ends.filter(({ s, e }) => touches(...s, qrc) || touches(...e, qrc));
    expect(fromHollywood.length).toBeGreaterThan(0);
    expect(toQrc.length).toBeGreaterThan(0);
    for (const { s, e } of fromHollywood) {
      expect(touches(...s, hollywood)).toBe(true);
      expect(touches(...e, hollywood)).toBe(false);
    }
    for (const { s, e } of toQrc) {
      expect(touches(...e, qrc)).toBe(true);
      expect(touches(...s, qrc)).toBe(false);
    }
  });

  it('花園道：全段单行；可玩区（东界外扩 50 m）内全部下坡（向北），全范围 ≥70% 向北', () => {
    const roads = drivable('Garden Road');
    expect(roads.every((r) => r.oneway !== 0)).toBe(true);
    const all = headings(roads);
    expect(all.north / (all.north + all.south)).toBeGreaterThanOrEqual(0.7);
    const [x0, y0] = project(MVP_RECT.west, MVP_RECT.south);
    const [x1, y1] = project(MVP_RECT.east, MVP_RECT.north);
    const band = [x0, y0, x1 + 500, y1] as const;
    const inMvp = roads.filter((r) => r.pts.every((v, i) => i % 2 === 1 || inRect(v, r.pts[i + 1]!, band)));
    expect(inMvp.length).toBeGreaterThan(0);
    expect(headings(inMvp).south).toBe(0);
  });
});

describe('区域', () => {
  it('可玩区离每个军事多边形 ≥ 100 m', () => {
    const military = city.zones.sensitive.filter((z) => z.kind === 'military');
    expect(military.length).toBeGreaterThanOrEqual(3);
    for (const p of city.zones.playable) {
      for (const z of military) expect(ringDistance(p.outer, z.area.outer)).toBeGreaterThanOrEqual(1000);
    }
  });

  it('政府设施敏感区：添马院落、律政中心、终审法院、礼宾府', () => {
    const gov = city.zones.sensitive.filter((z) => z.kind === 'government');
    expect(gov).toHaveLength(4);
    const hit = (lon: number, lat: number): boolean =>
      gov.some((z) => pointInRing(...project(lon, lat), z.area.outer));
    expect(hit(114.16571, 22.28115)).toBe(true); // 添马院落
    expect(hit(114.15868, 22.27919)).toBe(true); // 律政中心
    expect(hit(114.16036, 22.28091)).toBe(true); // 终审法院
    expect(hit(114.15749, 22.27859)).toBe(true); // 礼宾府
  });

  it('与 MVP 矩形重叠的敏感区只有礼宾府、律政中心、终审法院（玩法一律取 可玩区 − 敏感区）', () => {
    const [rect] = city.zones.playable;
    const inside = (r: readonly number[], x: number, y: number): boolean => pointInRing(x, y, r);
    const overlapping = city.zones.sensitive.filter((z) => {
      const o = z.area.outer;
      for (let i = 0; i < o.length; i += 2) if (inside(rect!.outer, o[i]!, o[i + 1]!)) return true;
      for (let i = 0; i < rect!.outer.length; i += 2) if (inside(o, rect!.outer[i]!, rect!.outer[i + 1]!)) return true;
      return false;
    });
    expect(overlapping.every((z) => z.kind === 'government')).toBe(true);
    const at = (lon: number, lat: number) => overlapping.filter((z) => pointInRing(...project(lon, lat), z.area.outer));
    expect(at(114.15749, 22.27859)).toHaveLength(1); // 礼宾府（约 60% 在矩形内）
    expect(at(114.15868, 22.27919)).toHaveLength(1); // 律政中心
    expect(at(114.16036, 22.28091)).toHaveLength(1); // 终审法院
    expect(overlapping).toHaveLength(3);
  });

  it('敏感区内没有任何道具点（红绿灯、过路处、巴士站、路灯、树）', () => {
    for (const [kind, pts] of Object.entries(city.props)) {
      for (let i = 0; i < pts.length; i += 2) {
        const hit = city.zones.sensitive.find((z) => pointInRing(pts[i]!, pts[i + 1]!, z.area.outer));
        expect(hit, `${kind} (${pts[i]}, ${pts[i + 1]}) 在敏感区 ${hit?.id}`).toBeUndefined();
      }
    }
  });

  it('海面在北面且 ≥ 1 km²，坐标都在 bbox 内', () => {
    const [minX, minY, maxX, maxY] = city.meta.bbox;
    let area = 0;
    let cy = 0;
    for (const w of city.water) {
      const a = signedArea2(w.outer) / 2;
      area += a;
      cy += ringCentroid(w.outer)[1] * a;
      for (let i = 0; i < w.outer.length; i += 2) {
        expect(inRect(w.outer[i]!, w.outer[i + 1]!, [minX, minY, maxX, maxY])).toBe(true);
      }
    }
    expect(area / 100).toBeGreaterThan(1e6);
    expect(cy / area).toBeGreaterThan((minY + maxY) / 2);
  });

  it('道路、电车轨、道具点都在 bbox 内，道具各类都有', () => {
    const bbox = city.meta.bbox;
    for (const r of [...city.roads, ...city.rails]) {
      for (let i = 0; i < r.pts.length; i += 2) expect(inRect(r.pts[i]!, r.pts[i + 1]!, bbox)).toBe(true);
    }
    expect(city.rails.some((r) => r.kind === 'tram')).toBe(true);
    expect(city.rails.some((r) => r.kind === 'funicular')).toBe(true);
    for (const pts of Object.values(city.props)) expect(pts.length).toBeGreaterThan(20);
  });
});

describe('红线与字符串', () => {
  // 游戏系列名同样不以明文写进仓库
  const GENRE = ['R1RB', 'R3JhbmQgVGhlZnQ='].map((s) => Buffer.from(s, 'base64').toString('utf8'));
  const BLACKLIST = [
    'HSBC', '匯豐', '滙豐', 'Bank of China', '中銀', '中國銀行', 'IFC', 'International Finance', '國際金融',
    'Jardine', '怡和', 'Cheung Kong', '長江', 'The Center', '中環中心', ...GENRE,
  ];

  it('产物（含署名文件）不含任何红线词', () => {
    for (const [name, text] of files) {
      const lower = text.toLowerCase();
      for (const w of BLACKLIST) expect(lower.includes(w.toLowerCase()), `${name} 含有 ${w}`).toBe(false);
    }
  });

  it('自由文本只有路名、地标虚构名和署名；其余字符串都是 ID 或枚举', () => {
    const REFS = [REF_OSM, REF_OVERTURE, REF_TOMTOM, REF_EAST_ASIA_BUILDINGS, REF_LANDSD_BUILDINGS, REF_CEDD_DTM];
    const ENUM = new Set([
      'central-city', 'EPSG:2326', 'dm', 'ovt',
      'tower', 'podium', 'house', 'civic', 'industrial', 'other',
      'landsd', 'tag', 'levels', 'landmark', 'heuristic',
      'motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'residential', 'unclassified', 'living_street',
      'service', 'pedestrian', 'footway', 'steps', 'path', 'cycleway', 'unknown',
      'tram', 'funicular', 'military', 'government',
    ]);
    const landmarkIds = new Set(LANDMARKS.map((l) => l.id));
    for (const [where, s] of collectStrings(city)) {
      if (/^roads\[\d+\]\.name\.(zh|en)$/.test(where) || /^landmarks\[\d+\]\.name\.(zh|en)$/.test(where)) continue;
      if (/^meta\.sources\[\d+\]\./.test(where)) {
        const key = where.split('.').pop() as 'id' | 'license' | 'attribution' | 'url';
        expect(REFS.some((r) => r[key] === s), where).toBe(true);
      } else if (/^meta\.build\./.test(where)) {
        expect(s).toMatch(/^[0-9a-f.]+$/);
      } else if (/^landmarks\[\d+\]\.id$/.test(where)) {
        expect(landmarkIds.has(s)).toBe(true);
      } else if (/\.id$|\.replaces\[\d+\]$/.test(where)) {
        expect(s, where).toMatch(/^[0-9a-f]{10}$/);
      } else {
        expect(ENUM.has(s), `${where} = ${s}`).toBe(true);
      }
    }
  });

  it('路名只出现在道路上，地标名都是覆盖表里的虚构名', () => {
    const names = new Set(LANDMARKS.flatMap((l) => [l.name.zh, l.name.en]));
    for (const l of city.landmarks) expect(names.has(l.name.zh) && names.has(l.name.en)).toBe(true);
    expect(city.roads.filter((r) => r.name).length).toBeGreaterThan(1000);
  });
});

describe('地形', () => {
  it('terrain.bin 解码后与网格一致，覆盖 meta.bbox；meta.sources 列出 DTM（客户端据此下载）', () => {
    const back = decodeTerrain(outputs.get(TERRAIN_FILE)!);
    expect([back.x0, back.y0, back.cell, back.nx, back.ny]).toEqual([grid.x0, grid.y0, grid.cell, grid.nx, grid.ny]);
    const [minX, minY, maxX, maxY] = city.meta.bbox;
    expect(back.x0).toBeLessThanOrEqual(minX);
    expect(back.y0).toBeLessThanOrEqual(minY);
    expect(back.x0 + (back.nx - 1) * back.cell).toBeGreaterThanOrEqual(maxX);
    expect(back.y0 + (back.ny - 1) * back.cell).toBeGreaterThanOrEqual(maxY);
    expect(city.meta.sources.some((s) => s.id === REF_CEDD_DTM.id && /dtm|terrain|dem/i.test(s.id))).toBe(true);
  });

  it('港岸在北：数据范围北缘一排全是海（0），南缘一排全是陆地且高于 50 mPD', () => {
    const ground = groundOf(grid);
    const [minX, minY, maxX, maxY] = city.meta.bbox;
    for (let x = minX; x <= maxX; x += 500) {
      expect(ground(x, maxY)).toBe(0);
      expect(ground(x, minY)).toBeGreaterThan(500);
    }
  });
});

describe('打包', () => {
  it('确定性：再构建一次逐字节相同（含 terrain.bin）', async () => {
    const again = await buildCity();
    const bytes = packOutputs(again.city, again.terrain.grid);
    for (const [name, b] of outputs) expect(Buffer.from(bytes.get(name)!).equals(b), name).toBe(true);
  });

  it('central.json + terrain.bin gzip ≤ 1 MB（PLAN §7.1 MVP 预算）', () => {
    const gz = [CITY_FILE, TERRAIN_FILE].reduce((n, f) => n + gzipSync(outputs.get(f)!, { level: 9 }).length, 0);
    expect(gz).toBeLessThanOrEqual(1024 * 1024);
  });

  it('署名文件写明 ODbL 链接、衍生数据库生成方法、ODbL 范围与港府数据署名（英、繁）', () => {
    const odbl = files.get('LICENSE-ODbL.txt')!;
    expect(odbl).toContain('https://opendatacommons.org/licenses/odbl/1-0/');
    expect(odbl).toContain('central/citymap/');
    expect(odbl).toContain(SOURCE_TREE_URL);
    expect(odbl).toContain('TomTom');
    expect(odbl).toMatch(/Not ODbL: the buildings and landmarks arrays/);
    const attr = files.get('ATTRIBUTION.txt')!;
    expect(attr).toContain('© OpenStreetMap contributors');
    expect(attr).toContain('Overture Maps Foundation');
    expect(attr).toContain('Contains data from the Lands Department, HKSAR Government');
    expect(attr).toContain('Contains data from the Civil Engineering and Development Department, HKSAR Government');
    expect(attr).toContain('香港特別行政區政府地政總署');
    expect(attr).toContain('香港特別行政區政府土木工程拓展署');
    expect(attr).not.toContain('CC-BY-4.0');
    // 少量路段来自 TomTom（同为 ODbL），署名如实列出
    expect(city.meta.sources.map((s) => s.id)).toContain(REF_TOMTOM.id);
    expect(attr).toContain('TomTom');
  });
});
