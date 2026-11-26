import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { decodeTerrain, type CityFile } from '@central/data';
import { simMetresToThree } from '../../../coords';
import { reliefGrid, reliefHeight } from '../../../data/terrain';
import { renderedTerrain } from '../../road-corridor';
import { planRoads } from '../../roads';
import { streetLamps } from '../lamps';
import { RenderedSurface, dropZoneLamps, inZones, outsideZones } from '../surface';
import { TramSystem, tramStopIslands } from '../trams';
import { destAtlasLayout } from './atlas';
import { POLE_LEN_M, POLE_PIVOT, SKIRT_Y_M, TRAM_LEN_M, TRAM_W_M, CORNICE_Y_M, ROOF_TOP_M, bodyLoop, tramGeometry } from './body';
import { ALLOWED_PLACE_NAMES, DESTINATIONS, HERITAGE_SHARE, LiveryKind, WRAP_PALETTES, carLivery, evokesOperatorLivery, hexHsl } from './livery';
import { simplify3 } from './overhead';
import { ROUTE_STEP_M, chainTracks, projectOnRoute, resampleEven, routePose, sampleAt, spreadOffsets, tramDirection, wireHeights } from './route';
import { BELL_LEAD_S, bellBetween, carState, carTimetable, motionAt, speedProfile, type CarState } from './schedule';
import { ISLAND_EDGE_M, ISLAND_W_M, STOP_ANCHORS, islandSamples } from './stops';
import { poleAim } from './pole';

describe('行车方向与拼线（合成数据）', () => {
  it('对向轨道在左 → 逆 pts；在右 → 沿 pts', () => {
    expect(tramDirection([0, 0, 1000, 0, 2000, 0], [0, 30, 2000, 30])).toBe(-1);
    expect(tramDirection([0, 0, 1000, 0, 2000, 0], [0, -30, 2000, -30])).toBe(1);
  });

  it('两条主线各接上首尾相连的延伸段，不接到对方的线上', () => {
    const mk = (id: string, pts: number[]) => ({ id, kind: 'tram' as const, pts: pts.map((v) => v * 10) });
    // 南线（西行）自东向西 0..1200 m，北线（东行）在 y = 3 m；西端南线接一段 200 m 直线
    const rails = [mk('a', [1200, 0, 600, 0, 0, 0]), mk('b', [0, 3, 600, 3, 1200, 3]), mk('ext', [0, 0, -200, 0])];
    const c = chainTracks(rails);
    expect(c).toHaveLength(2);
    expect(c[0]!.westbound).toBe(true);
    expect(c[0]!.pts[c[0]!.pts.length - 1]![0]).toBeCloseTo(-200);
    expect(c[1]!.pts[0]![0]).toBeCloseTo(0);
  });

  it('并行段拉开到 ≥ 3.1 m', () => {
    const a = resampleEven([[0, 0], [100, 0]], 2);
    const b = resampleEven([[0, 2.6], [100, 2.6]], 2);
    const [oa, ob] = spreadOffsets(a, b);
    const mid = 25;
    expect(b[mid]![1] + ob[mid]![1] - (a[mid]![1] + oa[mid]![1])).toBeGreaterThan(3.05);
  });

  it('接触线在桥下压低，坡度 ≤ 6 %', () => {
    const pts = resampleEven([[0, 0], [200, 0]], ROUTE_STEP_M);
    const z = new Float64Array(pts.length).fill(4);
    const w = wireHeights(pts, z, (x) => (x > 95 && x < 105 ? 9.4 : null));
    expect(Math.min(...w)).toBeCloseTo(9.4 - 4 - 0.35, 5);
    for (let i = 1; i < w.length; i++) expect(Math.abs(w[i]! - w[i - 1]!)).toBeLessThanOrEqual(0.06 * ROUTE_STEP_M + 1e-9);
    expect(w[0]).toBeCloseTo(5.8);
  });

  it('Douglas–Peucker 简化保留拐点', () => {
    const out = simplify3([[0, 0, 0], [1, 0, 0], [2, 0, 0], [2, 1, 0], [2, 2, 0]], 0.01);
    expect(out).toEqual([[0, 0, 0], [2, 0, 0], [2, 2, 0]]);
  });
});

describe('速度曲线与停站（纯函数）', () => {
  const prof = speedProfile(1000, [300, 700], () => 7);
  it('巡航 ≤ 7 m/s、站上速度 0、加减速度不超限', () => {
    for (let i = 1; i < prof.n; i++) {
      expect(prof.v[i]!).toBeLessThanOrEqual(7 + 1e-9);
      const a = (prof.v[i]! ** 2 - prof.v[i - 1]! ** 2) / 2;
      expect(a).toBeLessThanOrEqual(1.0 + 1e-9);
      expect(a).toBeGreaterThanOrEqual(-1.2 - 1e-9);
    }
    expect(prof.v[300]).toBe(0);
    expect(prof.v[700]).toBe(0);
  });
  it('位置随时间连续、单调；停站 18–25 s，停在站 ±1 m', () => {
    const tt = carTimetable(prof, [20, 22], 5, 0);
    const st: CarState = { s: 0, v: 0, atStop: -1, tau: 0 };
    let prev = -1;
    for (let t = 0; t < tt.period - 0.1; t += 0.1) {
      carState(prof, tt, t, st);
      expect(st.s).toBeGreaterThanOrEqual(prev - 1e-6);
      if (prev >= 0) expect(st.s - prev).toBeLessThan(0.75);
      prev = st.s;
    }
    for (let j = 0; j < 2; j++) {
      const dwell = tt.depart[j]! - tt.arrive[j]!;
      expect(dwell).toBeGreaterThanOrEqual(18);
      expect(dwell).toBeLessThanOrEqual(25);
      carState(prof, tt, (tt.arrive[j]! + tt.depart[j]!) / 2, st);
      expect(Math.abs(st.s - [300, 700][j]!)).toBeLessThanOrEqual(1);
      expect(st.atStop).toBe(j);
    }
  });
  it('离站前 1 s 打一次铃（两帧之间检测），在走时不打', () => {
    const tt = carTimetable(prof, [20, 22], 5, 0);
    const st: CarState = { s: 0, v: 0, atStop: -1, tau: 0 };
    let rings = 0;
    for (let t = 0.05; t < tt.period; t += 0.05) {
      carState(prof, tt, t, st);
      if (bellBetween(tt, t - 0.05, t, st) >= 0) {
        rings++;
        expect(tt.depart[st.atStop]! - st.tau).toBeCloseTo(BELL_LEAD_S, 1);
      }
    }
    expect(rings).toBe(2);
  });
  it('运动段按匀加速解析插值', () => {
    const o = { s: 0, v: 0 };
    motionAt(prof, prof.t[100]!, o);
    expect(o.s).toBeCloseTo(100, 4);
  });
});

describe('涂装与目的地牌（红线）', () => {
  it('目的地全部在允许地名名单里；西行只去堅尼地城 / 西營盤', () => {
    for (const d of DESTINATIONS) {
      expect(ALLOWED_PLACE_NAMES.has(d.zh)).toBe(true);
      expect(ALLOWED_PLACE_NAMES.has(d.en)).toBe(true);
    }
    for (const c of destAtlasLayout()) {
      expect(ALLOWED_PLACE_NAMES.has(c.zh)).toBe(true);
      expect(ALLOWED_PLACE_NAMES.has(c.en)).toBe(true);
    }
    for (let k = 0; k < 200; k++) {
      const w = carLivery(k, true);
      expect(['堅尼地城', '西營盤']).toContain(DESTINATIONS[w.dest]!.zh);
      const e = carLivery(k, false);
      expect(['筲箕灣', '北角', '銅鑼灣', '跑馬地']).toContain(DESTINATIONS[e.dest]!.zh);
    }
  });
  it('涂装比例：广告车身 ≥ 70 %，传统深绿按 HERITAGE_SHARE；确定性', () => {
    const n = 2000;
    let wrap = 0;
    let heritage = 0;
    for (let k = 0; k < n; k++) {
      const l = carLivery(k, k % 2 === 0);
      if (l.kind === LiveryKind.Wrap) wrap++;
      if (l.kind === LiveryKind.Heritage) heritage++;
      expect(carLivery(k, k % 2 === 0)).toEqual(l);
    }
    expect(wrap / n).toBeGreaterThan(0.7);
    expect(Math.abs(heritage / n - HERITAGE_SHARE)).toBeLessThan(0.03);
    expect(carLivery(3, true, 0).kind).not.toBe(LiveryKind.Heritage);
  });
  it('不出现营运商式「绿 / 青 + 米白」上下两色：生成的车里没有上层绿、下层浅（或反过来）的分色车', () => {
    expect(evokesOperatorLivery(LiveryKind.Wrap, 2, ['#127a80', '#f6ead2', '#202020'])).toBe(true);
    expect(evokesOperatorLivery(LiveryKind.Wrap, 2, ['#d8326e', '#f6ead2', '#202020'])).toBe(false);
    let checked = 0;
    for (let k = 0; k < 3000; k++) {
      const l = carLivery(k, k % 2 === 0);
      if (l.kind === LiveryKind.Heritage) continue;
      expect(evokesOperatorLivery(l.kind, l.pattern, l.colours), `车 ${k} ${l.colours.join(',')} 图案 ${l.pattern}`).toBe(false);
      checked++;
    }
    expect(checked).toBeGreaterThan(2500);
    // 配色表里不再有深绿
    for (const p of WRAP_PALETTES) for (const c of p) expect(!(hexHsl(c)[0] > 100 && hexHsl(c)[0] < 160 && hexHsl(c)[2] < 0.3)).toBe(true);
  });
  it('配色表只有颜色（12 组、合法十六进制）', () => {
    expect(WRAP_PALETTES).toHaveLength(12);
    for (const p of WRAP_PALETTES) for (const c of p) expect(c).toMatch(/^#[0-9a-f]{6}$/);
  });
});

describe('车身几何', () => {
  it('比例：长 8.7 m、宽 2.35 m、檐口 4.4 m、拱顶 ≤ 4.6 m，长高比 1.9–2.1', () => {
    expect(TRAM_LEN_M).toBeCloseTo(8.7, 5);
    expect(TRAM_W_M).toBeCloseTo(2.35, 5);
    expect(CORNICE_Y_M).toBeCloseTo(4.4, 5);
    expect(ROOF_TOP_M).toBeLessThanOrEqual(4.6);
    expect(TRAM_LEN_M / CORNICE_Y_M).toBeGreaterThan(1.9);
    expect(TRAM_LEN_M / CORNICE_Y_M).toBeLessThan(2.1);
    expect(SKIRT_Y_M).toBeCloseTo(0.35);
  });
  it('轮廓外法线朝外、近处一级 ≤ 1500 三角形、远处一级 ≤ 120', () => {
    for (const p of bodyLoop()) expect(p.x * p.nx + p.z * p.nz).toBeGreaterThan(0);
    const near = tramGeometry({ lod: 0 }).index!.count / 3;
    const far = tramGeometry({ lod: 1 }).index!.count / 3;
    expect(near).toBeLessThanOrEqual(1500);
    expect(far).toBeLessThanOrEqual(120);
  });
  it('集电杆对准接触线：杆头落在目标点（杆长 4 m）', () => {
    for (const [dx, dy, dz] of [
      [-3.8, 1.1, 0],
      [-3.7, 1.2, 0.6],
      [-3.9, 0.4, -0.3],
    ] as const) {
      const a = poleAim(dx, dy, dz);
      const tip = [-Math.cos(a.pitch) * Math.cos(a.yaw) * POLE_LEN_M, Math.sin(a.pitch) * POLE_LEN_M, Math.cos(a.pitch) * Math.sin(a.yaw) * POLE_LEN_M];
      const l = Math.hypot(dx, dy, dz);
      expect(tip[0]! / POLE_LEN_M).toBeCloseTo(dx / l, 5);
      expect(tip[1]! / POLE_LEN_M).toBeCloseTo(dy / l, 5);
      expect(tip[2]! / POLE_LEN_M).toBeCloseTo(dz / l, 5);
    }
    expect(POLE_PIVOT[0]).toBeGreaterThan(0);
  });
});

describe('真实数据上的电车', () => {
  const read = (n: string) => readFileSync(new URL(`../../../../public/city/${n}`, import.meta.url));
  const city = JSON.parse(read('central.json').toString('utf8')) as CityFile;
  const relief = reliefGrid(decodeTerrain(read('terrain.bin')));
  const ground = reliefHeight(relief);
  const plans = planRoads(city.roads, ground, city.props);
  const zones = city.zones.sensitive;
  dropZoneLamps(plans, zones);
  const surface = new RenderedSurface(plans, renderedTerrain(relief, plans, city.buildings).fn);
  const lamps = outsideZones(streetLamps(plans), zones, (l) => l.pole, (l) => l.head);
  const sys = new TramSystem({ city, plans, ground, surface: (x, y) => surface.heightAt(x, y), lamps, high: true });
  const surfM = (x: number, y: number) => surface.heightAt(x * 10, y * 10) / 10;

  it('两条行车线：一西一东，各约 3 km，接到数据范围边缘', () => {
    expect(sys.routes).toHaveLength(2);
    const p = { x: 0, y: 0, z: 0, hx: 0, hy: 0 };
    routePose(sys.routes[0]!, sys.routes[0]!.len / 2, p);
    expect(p.hx).toBeLessThan(0);
    routePose(sys.routes[1]!, sys.routes[1]!.len / 2, p);
    expect(p.hx).toBeGreaterThan(0);
    for (const r of sys.routes) expect(r.len).toBeGreaterThan(2500);
  });

  it('T2：钢轨铺在看得见的路面上（不埋、不浮），车身底离路面 0.30–0.45 m（两条线各 100 个采样点）', () => {
    const p = { x: 0, y: 0, z: 0, hx: 1, hy: 0 };
    for (const r of sys.routes) {
      for (let k = 0; k < 100; k++) {
        // 取采样点上（两点之间是线性过渡：路面本身在路口有 0.2–0.3 m 的台阶）
        const s = Math.round((((k + 0.5) / 100) * r.len) / ROUTE_STEP_M) * ROUTE_STEP_M;
        routePose(r, s, p, 1);
        // 两根钢轨下的路面（电车专用带常常夹在两条车行道之间、本身没有路面：取钢轨处路面）
        const ground = Math.max(surfM(p.x, p.y), surfM(p.x - p.hy * 0.6, p.y + p.hx * 0.6), surfM(p.x + p.hy * 0.6, p.y - p.hx * 0.6));
        const rail = p.z - ground;
        expect(rail, `${r.id} s ${s.toFixed(0)}`).toBeGreaterThanOrEqual(0.02);
        expect(rail, `${r.id} s ${s.toFixed(0)}`).toBeLessThanOrEqual(0.1);
        const gap = p.z + SKIRT_Y_M - ground;
        expect(gap).toBeGreaterThanOrEqual(0.3);
        expect(gap).toBeLessThanOrEqual(0.45);
      }
    }
  });

  it('T8：四个锚点站都在（±5 m），站岛不压轨道、不进敏感区与楼', () => {
    const islands = tramStopIslands();
    for (const a of STOP_ANCHORS) {
      const st = islands.find((s) => s.id === a.name);
      expect(st, a.name).toBeDefined();
      expect(Math.hypot(st!.centre[0] - a.x, st!.centre[1] - a.y)).toBeLessThan(5);
    }
    expect(islands.length).toBeGreaterThanOrEqual(8);
    for (const s of islands) {
      for (const [x, y] of islandSamples(s.centre, s.axis)) {
        expect(inZones(zones, x * 10, y * 10)).toBe(false);
        for (const r of sys.routes) expect(projectOnRoute(r, x, y).d).toBeGreaterThanOrEqual(1.4);
      }
    }
    expect(ISLAND_EDGE_M + ISLAND_W_M / 2).toBeCloseTo(2.45);
  });

  it('T8：每辆车在每个站停 18–25 s、停在站岛中心 ±1 m；同一路线两车相距 ≥ 40 m（t ∈ [0, 3600]）', { timeout: 60000 }, () => {
    let minGap = Infinity;
    for (let t = 0; t <= 3600; t += 0.5) {
      const cars = sys.carPositions(t);
      for (const track of [0, 1]) {
        const ss = cars.filter((c) => c.track === track).map((c) => c.s).sort((a, b) => a - b);
        for (let i = 1; i < ss.length; i++) minGap = Math.min(minGap, ss[i]! - ss[i - 1]!);
      }
    }
    expect(minGap).toBeGreaterThanOrEqual(40);
    // 停站：抽 2 辆车逐 0.1 s 看
    const islands = tramStopIslands();
    let stops = 0;
    for (const which of [0, 7]) {
      let since = -1;
      let at: string | null = null;
      for (let t = 0; t < 1400; t += 0.1) {
        const c = sys.debugCars(t)[which]!;
        if (c.atStop === at && (at === null) === true && t % 1 > 0.11) continue;
        if (c.atStop !== at) {
          if (at !== null && since >= 0) {
            const dur = t - since;
            expect(dur).toBeGreaterThanOrEqual(17.9);
            expect(dur).toBeLessThanOrEqual(25.1);
            stops++;
          }
          at = c.atStop;
          since = at !== null && t > 0.05 ? t : -1;
          if (at !== null) {
            const isl = islands.find((s) => s.id === at)!;
            // 车身中心在站岛旁（横向 2.45 m、纵向 ±1 m）
            const along = (c.x - isl.centre[0]) * isl.axis[0] + (c.y - isl.centre[1]) * isl.axis[1];
            expect(Math.abs(along)).toBeLessThan(1.5);
          }
        }
      }
    }
    expect(stops).toBeGreaterThan(4);
  });

  it('T6：杆头落在接触线上（随机 500 个车 × 时刻，竖向、横向 ≤ 0.2 m）', () => {
    const wires = sys.overhead.contact;
    let seed = 7;
    const rnd = () => ((seed = (Math.imul(seed, 1103515245) + 12345) >>> 0) / 4294967296);
    for (let k = 0; k < 500; k++) {
      const t = rnd() * 3600;
      const cars = sys.debugCars(t);
      const ci = Math.floor(rnd() * cars.length);
      const car = cars[ci]!;
      // 路线起点 10 m 内（数据范围边缘、刚出场）杆头还没有线可搭，不算
      if (sys.carPositions(t)[ci]!.s < 10) continue;
      const tip = sys.poleTip(ci, t);
      // 离杆头最近的接触线点
      let best = { d: Infinity, dz: 0 };
      for (const w of wires) {
        for (let i = 1; i < w.length; i++) {
          const a = w[i - 1]!;
          const b = w[i]!;
          const dx = b[0] - a[0];
          const dy = b[1] - a[1];
          const l2 = dx * dx + dy * dy;
          const u = l2 > 0 ? Math.min(Math.max(((tip[0] - a[0]) * dx + (tip[1] - a[1]) * dy) / l2, 0), 1) : 0;
          const d = Math.hypot(a[0] + u * dx - tip[0], a[1] + u * dy - tip[1]);
          if (d < best.d) best = { d, dz: a[2] + u * (b[2] - a[2]) - tip[2] };
        }
      }
      expect(best.d, `car ${ci} t ${t.toFixed(1)} track ${car.track}`).toBeLessThanOrEqual(0.2);
      expect(Math.abs(best.dz), `car ${ci} t ${t.toFixed(1)}`).toBeLessThanOrEqual(0.2);
    }
  });

  it('线杆、楼面锚不进敏感区；接触线 5.8 m（桥下 ≥ 4.8 m）', () => {
    for (const s of sys.overhead.supports) expect(inZones(zones, s.x * 10, s.y * 10)).toBe(false);
    expect(sys.overhead.supports.filter((s) => s.kind === 'pole').length).toBeGreaterThan(30);
    for (const r of sys.routes) {
      for (let s = 0; s < r.len; s += 10) {
        const w = sampleAt(r.wire, s);
        expect(w).toBeGreaterThanOrEqual(4.8 - 1e-9);
        expect(w).toBeLessThanOrEqual(5.8 + 1e-9);
      }
    }
  });

  it('确定性：同一时刻两次结果相同', () => {
    expect(sys.debugCars(123.4)).toEqual(sys.debugCars(123.4));
  });

  it('「街景」机位（德辅道中）开场 10 s 内前方 60–250 m 有电车；「電車」机位开场 15 s 内 W1 有车', () => {
    const eye = simMetresToThree(160, 103, 5);
    const target = simMetresToThree(300, -88, 25.9);
    const fx = target[0] - eye[0];
    const fz = target[2] - eye[2];
    const fl = Math.hypot(fx, fz);
    for (let t = 0; t <= 10; t += 0.5) {
      let seen = false;
      for (const c of sys.debugCars(t)) {
        const p = simMetresToThree(c.x, c.y, c.z);
        const dx = p[0] - eye[0];
        const dz = p[2] - eye[2];
        const d = Math.hypot(dx, dz);
        const cos = (dx * fx + dz * fz) / (d * fl);
        if (d >= 60 && d <= 250 && cos > Math.cos((25 * Math.PI) / 180)) seen = true;
      }
      expect(seen, `t = ${t}`).toBe(true);
    }
    let w1 = false;
    for (let t = 0; t <= 15; t += 0.5) if (sys.debugCars(t).some((c) => c.atStop === 'W1')) w1 = true;
    expect(w1).toBe(true);
  });
});
