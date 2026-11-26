import { describe, expect, it } from 'vitest';
import { SIGN_WORDS } from '../../signs/whitelist';
import { BUS_STOPS, JOINT_ROUTES, RED_MINIBUS_PLACES, ROUTES, STAR_FERRY_NAMES, TRAM_DESTINATIONS } from '../transit-data';
import { CITYBUS_BLOCK, DISPLAY, VehicleRenderer, citybusEdge, citybusZone, textAttr, vehicleLook, type VehiclePose } from '../vehicles';
import { simMetresToThree } from '../../../coords';
import { VehicleKind } from '../traffic';
import { AD_WORDS, ATLAS_W, BOAT_NAMES, BUS_DESTS, KMB_CLASSES, LAYOUT, ROUTE_NUMBERS, SUN_FERRY_LOGO, SUN_FERRY_NAME, atlasScale, atlasTexts, cellRect } from './atlas';
import { BUS_AD_SHARE, CITYBUS_SHARE, GMB_SHARE, KMB_GOLD_ROUTES, Scheme, busFleetNumber, busLook, kmbFleetCode, minibusLook, nearestBusStop, routesFor, taxiLook } from './fleet';

const N = 6000;
/** 红线词（游戏系列名等，与 citymap/src/redlines.ts 一样以 base64 存，不在仓库里写明文）。 */
const BANNED = ['R1RB', 'R3JhbmQgVGhlZnQ=', 'Um9ja3N0YXI='].map((s) => Buffer.from(s, 'base64').toString('utf8').toLowerCase());

describe('营运商图集（红线：只有真实地名 / 营运商字样 / 白名单广告字）', () => {
  it('各块都在图集里、互不重叠；总大小 ≤ 1024 × 1024（≈ 1.3 MB 含 mipmap）', () => {
    expect(LAYOUT.w).toBe(ATLAS_W);
    expect(LAYOUT.h).toBeLessThanOrEqual(1024);
    expect(LAYOUT.w * LAYOUT.h * (4 / 3)).toBeLessThan(2 * 1024 * 1024);
    const rects = Object.values(LAYOUT.blocks).map((b) => ({ x0: b.x, y0: b.y, x1: b.x + Math.min(b.n, b.cols) * b.cw, y1: b.y + Math.ceil(b.n / b.cols) * b.ch }));
    for (const r of rects) {
      expect(r.x0).toBeGreaterThanOrEqual(0);
      expect(r.y0).toBeGreaterThanOrEqual(0);
      expect(r.x1).toBeLessThanOrEqual(LAYOUT.w);
      expect(r.y1).toBeLessThanOrEqual(LAYOUT.h);
    }
    for (let i = 0; i < rects.length; i++)
      for (let j = i + 1; j < rects.length; j++) {
        const a = rects[i]!;
        const b = rects[j]!;
        expect(a.x1 <= b.x0 || b.x1 <= a.x0 || a.y1 <= b.y0 || b.y1 <= a.y0).toBe(true);
      }
    // 显存：HIGH ≤ 4 MB、LOW ≤ 2 MB（LOW 用半分辨率）
    for (const tier of ['high', 'low'] as const) {
      const k = atlasScale(tier);
      const bytes = Math.round(LAYOUT.w * k) * Math.round(LAYOUT.h * k) * (4 / 3);
      expect(bytes).toBeLessThan((tier === 'high' ? 4 : 2) * 1024 * 1024);
    }
    expect(atlasScale('low')).toBeLessThan(atlasScale('high'));
    const last = cellRect(LAYOUT.blocks.busDest, BUS_DESTS.length - 1);
    expect(last.y + last.h).toBeLessThanOrEqual(LAYOUT.blocks.route.y);
  });

  it('广告字全部来自招牌白名单；地名只来自 transit-data；没有红线词', () => {
    for (const w of AD_WORDS) expect(SIGN_WORDS as readonly string[]).toContain(w);
    const places = new Set<string>();
    for (const r of ROUTES) for (const d of [r.a, r.b, ...(r.via ? [r.via] : [])]) places.add(d.zh).add(d.en.toUpperCase());
    for (const p of RED_MINIBUS_PLACES) places.add(p.zh).add(p.en.toUpperCase());
    for (const d of TRAM_DESTINATIONS) places.add(d.zh).add(d.en);
    const routeSet = new Set(ROUTES.map((r) => r.route));
    const operator = new Set<string>(['城巴', 'Citybus', 'KMB', 'TAXI', '的士', 'PUBLIC LIGHT BUS 19 SEATS', '公共小型巴士十九座位', SUN_FERRY_LOGO, SUN_FERRY_NAME, ...KMB_CLASSES]);
    for (const t of atlasTexts()) {
      expect(BANNED.some((w) => t.text.toLowerCase().includes(w))).toBe(false);
      if (t.block === 'adWords') expect(AD_WORDS as readonly string[]).toContain(t.text);
      else if (t.block === 'tramDest') expect(places.has(t.text)).toBe(true);
      else if (t.block === 'busDest') for (const line of t.text.split('\n')) expect(places.has(line)).toBe(true);
      else if (t.block === 'route') expect(routeSet.has(t.text)).toBe(true);
      else if (t.block === 'digits') expect(t.text).toMatch(/^[0-9]$/);
      else if (t.block === 'boatNames') expect(BOAT_NAMES).toContain(t.text);
      else expect(operator.has(t.text)).toBe(true);
    }
    // 船名：天星小轮船名（中文名拆在英文两边）+ 新渡輪
    STAR_FERRY_NAMES.forEach((n, i) => {
      expect(BOAT_NAMES[i]).toContain(n.en.toUpperCase());
      for (const ch of n.zh) expect(BOAT_NAMES[i]).toContain(ch);
    });
    expect(ROUTE_NUMBERS.length).toBeLessThanOrEqual(LAYOUT.blocks.route.n);
  });
});

describe('巴士车队（L-B1–L-B4）', () => {
  it('城巴 55–65 %、九巴其余；每辆车挂的路线都在 ROUTES 或联营表里，显示的是该线一端的真实目的地', () => {
    let cb = 0;
    const joint = new Set(JOINT_ROUTES);
    for (let i = 0; i < N; i++) {
      const b = busLook(i);
      if (b.operator === 'citybus') cb++;
      const r = ROUTES.find((x) => x.route === b.route)!;
      expect(r).toBeDefined();
      expect(r.op === b.operator || joint.has(r.route)).toBe(true);
      const shown = BUS_DESTS[b.dest]!.zh;
      expect([r.a.zh, r.b.zh]).toContain(shown);
      expect(ROUTE_NUMBERS[b.routeCell]).toBe(b.route);
      if (b.via >= 0) expect(BUS_DESTS[b.via]!.zh).toBe(r.via!.zh);
      else expect(r.via).toBeUndefined();
      expect(busLook(i)).toEqual(b);
    }
    expect(cb / N).toBeGreaterThan(CITYBUS_SHARE - 0.05);
    expect(cb / N).toBeLessThan(CITYBUS_SHARE + 0.05);
  });

  it('九巴香槟金只在 101 / 104 / 111，约占九巴的 15–35 %；其余红色', () => {
    let kmb = 0;
    let gold = 0;
    for (let i = 0; i < N; i++) {
      const b = busLook(i);
      if (b.operator !== 'kmb') continue;
      kmb++;
      if (b.scheme === Scheme.KmbGold) {
        gold++;
        expect(KMB_GOLD_ROUTES).toContain(b.route);
      } else expect(b.scheme).toBe(Scheme.KmbRed);
    }
    expect(gold / kmb).toBeGreaterThan(0.15);
    expect(gold / kmb).toBeLessThan(0.35);
  });

  it('九巴车队编号是「车型前缀 + 号码」（ATENU 4 位、V6X / E6X 3 位），车辆下标 < 900（HIGH 车辆上限）内每车唯一', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 900; i++) {
      const c = kmbFleetCode(i);
      expect(c.text).toMatch(/^(ATENU\d{4}|V6X\d{3}|E6X\d{3})$/);
      expect(seen.has(c.text)).toBe(false);
      seen.add(c.text);
    }
    for (let i = 0; i < 500; i++) {
      const b = busLook(i);
      if (b.operator === 'kmb') expect(b.fleetClass).toBeGreaterThanOrEqual(0);
      else expect(b.fleetClass).toBe(-1);
    }
  });

  it('车队编号每车唯一（城巴 5 位、九巴 4 位）', () => {
    for (const op of ['citybus', 'kmb'] as const) {
      const seen = new Set<number>();
      for (let i = 0; i < 3000; i++) {
        const n = busFleetNumber(i, op);
        expect(seen.has(n)).toBe(false);
        seen.add(n);
        expect(String(n)).toHaveLength(op === 'citybus' ? 5 : 4);
      }
    }
  });

  it('约 35 % 车身侧面是虚构广告；广告字只来自白名单', () => {
    let ads = 0;
    for (let i = 0; i < N; i++) {
      const b = busLook(i);
      if (b.ad > 0) ads++;
      else expect(b.word).toBe(-1);
      if (b.word >= 0) expect(SIGN_WORDS as readonly string[]).toContain(AD_WORDS[b.word]);
    }
    expect(Math.abs(ads / N - BUS_AD_SHARE)).toBeLessThan(0.04);
  });

  it('开场停站的巴士挂该站真实停靠的路线（长江集团中心站，站名在数据里已换成虚构地标名「方鏡大廈」：6 / 6X / 681）', () => {
    const ck = BUS_STOPS.find((s) => s.en === 'Mirror Block')!;
    expect(nearestBusStop(ck.x + 3, ck.y - 4)).toBe(ck);
    for (let i = 0; i < 200; i++) {
      const b = busLook(i, { op: ck.op, routes: ck.routes });
      expect(ck.routes).toContain(b.route);
      expect(b.operator).toBe('citybus');
    }
    // 站上的路线都不在表里：照常按比例分配
    expect(busLook(3, { op: 'citybus', routes: ['N8X'] }).route).toBe(busLook(3).route);
  });

  it('联营路线两家都能挂；城巴不会挂只有九巴的路线（反之亦然）', () => {
    const cb = routesFor('citybus');
    const kmb = routesFor('kmb');
    for (const r of cb.joint) expect(JOINT_ROUTES).toContain(r.route);
    for (const r of kmb.joint) expect(JOINT_ROUTES).toContain(r.route);
    expect(cb.own.every((r) => r.op === 'citybus')).toBe(true);
    expect(kmb.own.every((r) => r.op === 'kmb')).toBe(true);
  });
});

describe('城巴 2023 涂装几何（照片 04）', () => {
  it('蓝块前缘：裙脚 36 %、两层之间约 26 %、车顶 22 %；向后倾约 24°；红条 0.15–0.2 m', () => {
    expect(citybusEdge(0)).toBeCloseTo(0.36, 6);
    expect(citybusEdge(1)).toBeCloseTo(0.22, 6);
    // 两层之间带中部（0.52–0.745 → 0.63）
    expect(Math.abs(citybusEdge(0.63) - 0.26)).toBeLessThan(0.015);
    const rake = (Math.atan(((CITYBUS_BLOCK.skirt - CITYBUS_BLOCK.roof) * 12.4) / 4.05) * 180) / Math.PI;
    expect(rake).toBeGreaterThan(21);
    expect(rake).toBeLessThan(27);
    expect(CITYBUS_BLOCK.stripeM).toBeGreaterThanOrEqual(0.15);
    expect(CITYBUS_BLOCK.stripeM).toBeLessThanOrEqual(0.2);
    expect(citybusZone(0.1, 0.5)).toBe('blue');
    expect(citybusZone(citybusEdge(0.5) + 0.005, 0.5)).toBe('red');
    expect(citybusZone(0.6, 0.5)).toBe('yellow');
    // 顶部前缘在底部前缘之后（「\」：车头朝右时）
    expect(citybusEdge(0.9)).toBeLessThan(citybusEdge(0.1));
  });
  it('双层巴士色带高度按照片 04：下层板 0–0.26、下层窗 0.26–0.52、两层之间 0.52–0.745、上层窗 0.745–0.97；显示屏在两层之间', () => {
    const [y0, y1, y2, y3, y4, y5] = DISPLAY.deckerY;
    const H = y5 - y0;
    const f = (y: number) => (y - y0) / H;
    expect(f(y1)).toBeCloseTo(0.26, 2);
    expect(f(y2)).toBeCloseTo(0.52, 2);
    expect(f(y3)).toBeCloseTo(0.745, 2);
    expect(f(y4)).toBeCloseTo(0.97, 2);
    const s = DISPLAY.decker;
    expect(s.y - s.h / 2).toBeGreaterThanOrEqual(y2);
    expect(s.y + s.h / 2).toBeLessThanOrEqual(y3);
    expect(DISPLAY.minibus.w).toBeLessThanOrEqual(2.1);
  });
});

describe('小巴与的士（L-M1、L-X1）', () => {
  it('绿色小巴约 65 %（路线号 + 目的地都在 ROUTES 的 gmb 路线里），红色小巴只显示地名', () => {
    let gmb = 0;
    for (let i = 0; i < N; i++) {
      const m = minibusLook(i);
      if (m.scheme === Scheme.Gmb) {
        gmb++;
        const r = ROUTES.find((x) => x.op === 'gmb' && x.route === m.route)!;
        expect(r).toBeDefined();
        expect([r.a.zh, r.b.zh]).toContain(BUS_DESTS[m.dest]!.zh);
        expect(ROUTE_NUMBERS[m.routeCell]).toBe(m.route);
      } else {
        expect(m.scheme).toBe(Scheme.Rmb);
        expect(m.routeCell).toBe(-1);
        expect(RED_MINIBUS_PLACES.map((p) => p.zh)).toContain(BUS_DESTS[m.dest]!.zh);
      }
    }
    expect(Math.abs(gmb / N - GMB_SHARE)).toBeLessThan(0.04);
  });

  it('的士：红车身、MPV 高车身变形目标、顶灯亮；私家车不挂任何营运商', () => {
    const t = vehicleLook(VehicleKind.Taxi, 7);
    expect(t.fleet).toEqual(taxiLook());
    expect(t.variant).toBe(1);
    expect(t.emit).toBe(1);
    for (let i = 0; i < 200; i++) {
      const c = vehicleLook(VehicleKind.Car, i);
      expect(c.fleet.scheme).toBe(Scheme.Car);
      expect(c.fleet.operator).toBeUndefined();
      expect(textAttr(c.fleet)[3]).toBe(Scheme.Car);
    }
  });

  it('着色器 iTxt 打包：目的地 + 64 ×（經 + 1）、路线号格、车队编号、方案 + 16 ×（广告字 + 1）', () => {
    const b = busLook(11);
    const [x, y, z, w] = textAttr(b);
    expect(x % 64).toBe(b.dest);
    expect(Math.floor(x / 64) - 1).toBe(b.via);
    expect(y).toBe(b.routeCell);
    expect(z).toBe(b.fleet);
    expect(w % 16).toBe(b.scheme);
    expect((Math.floor(w / 16) % 16) - 1).toBe(b.word);
    expect(Math.floor(w / 256) - 1).toBe(b.fleetClass);
    expect(BUS_DESTS.length).toBeLessThan(64);
  });
});

describe('调试钩子 __central.vehicles()（C-2）', () => {
  it('车型名、营运商、路线、模拟坐标（米）、朝向与速度', () => {
    const r = new VehicleRenderer(4, 4);
    const [x, y, z] = simMetresToThree(100, -50, 4.5);
    const poses: VehiclePose[] = [
      { x, y, z, hx: 1, hz: 0, kind: VehicleKind.Bus, brake: false, seed: 3 },
      { x, y, z, hx: 0, hz: -1, kind: VehicleKind.Taxi, brake: false, seed: 4 },
      { x, y, z, hx: 1, hz: 0, kind: VehicleKind.Car, brake: false, seed: 5 },
      { x, y, z, hx: 1, hz: 0, kind: VehicleKind.Minibus, brake: false, seed: 6 },
    ];
    const d = r.debug(poses, [0.1, 5, 7, 0]);
    expect(d[0]).toMatchObject({ kind: 'bus', operator: busLook(3).operator, route: busLook(3).route, speed: 0.1 });
    expect(d[0]!.x).toBeCloseTo(100, 6);
    expect(d[0]!.y).toBeCloseTo(-50, 6);
    expect(d[0]!.z).toBeCloseTo(4.5, 6);
    expect(d[0]!.heading).toBeCloseTo(0, 6);
    // three 的 −z = 模拟坐标的北：朝向 90°
    expect(d[1]).toMatchObject({ kind: 'taxi', operator: 'urban-taxi' });
    expect(d[1]!.heading).toBeCloseTo(Math.PI / 2, 6);
    expect(d[2]!.kind).toBe('car');
    expect(d[2]!.operator).toBeUndefined();
    expect(['gmb', 'rmb']).toContain(d[3]!.operator);
  });
});
