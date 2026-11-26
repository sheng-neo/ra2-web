import { describe, expect, it } from 'vitest';
import { blacklistHit } from '../../../../citymap/src/redlines';
import type { SensitiveZone } from '@central/data';
import { BUS_STOPS, ROUTES, TRAM_STOPS } from '../streets/transit-data';
import { STOP_ANCHORS } from '../streets/tram/stops';
import { crossingCode } from '../ribbon';
import { AD_WORDS, FIXED_SIZES, ShelfPacker, StationsAtlas } from './atlas';
import { isWhitelisted } from '../signs/whitelist';
import { CENTRAL_EXIT_CODES, MTR_EXITS } from './mtr-exits';
import {
  FLAG_MAX_ROUTES,
  busStopInfoNear,
  clearOfZones,
  flagKind,
  flagSpec,
  lookSide,
  sortRoutes,
  stopDisplayName,
  studdedCrossing,
  tramStopFor,
  zoneDistance,
} from './rules';

describe('站名查找', () => {
  it('巴士站：15 m 内最近的站名，合并同名站的路线；远处没有', () => {
    const s = BUS_STOPS.find((b) => b.zh === '方鏡大廈')!;
    expect(s).toBeTruthy();
    const info = busStopInfoNear(s.x + 3, s.y - 2)!;
    expect(info.zh).toBe('方鏡大廈');
    expect(info.en).toBe('Mirror Block');
    for (const r of s.routes) expect(info.routes).toContain(r);
    expect(busStopInfoNear(5000, 5000)).toBeNull();
  });

  it('站牌：以地标原型楼命名的站是虚构地标名，以企业 / 楼宇 / 敏感地点命名的站换成街名（复审修正）', () => {
    const ck = BUS_STOPS.find((b) => b.zh === '方鏡大廈')!;
    expect(flagSpec(busStopInfoNear(ck.x, ck.y))).toMatchObject({ zh: '方鏡大廈', en: 'Mirror Block' });
    expect(stopDisplayName('上亞厘畢道', 'Upper Albert Road')).toEqual({ zh: '上亞厘畢道', en: 'Upper Albert Road' });
    // 复审修正（红线）：数据里任何一个站名、路线目的地都不命中红线词表（真实企业 / 楼宇名），也不写敏感地点名
    const sens = /禮賓府|Government House|政府總部|Central Government Offices|律政中心|Justice Place|立法會|Legislative Council|終審法院|Court of Final Appeal/i;
    for (const b of BUS_STOPS) {
      const f = flagSpec(b);
      expect(blacklistHit(f.zh) ?? blacklistHit(f.en) ?? null, `${f.zh} ${f.en}`).toBeNull();
      expect(sens.test(f.zh) || sens.test(f.en)).toBe(false);
    }
    for (const r of ROUTES) for (const d of [r.a, r.b, r.via]) if (d) expect(blacklistHit(d.zh) ?? blacklistHit(d.en) ?? null).toBeNull();
  });

  it('站牌：路线排序、最多 8 条、款式按营运商', () => {
    expect(sortRoutes(['681', '6X', '12', '6', 'N8', '6A'])).toEqual(['6', '6A', '6X', '12', '681', 'N8']);
    const many = { x: 0, y: 0, zh: 'X', en: 'X', op: 'citybus' as const, routes: Array.from({ length: 12 }, (_, i) => String(i + 1)) };
    expect(flagSpec(many).routes).toHaveLength(FLAG_MAX_ROUTES);
    expect(flagKind({ op: 'gmb', routes: [] })).toBe('gmb');
    expect(flagKind({ op: '', routes: ['22', '22S'] })).toBe('gmb');
    expect(flagKind({ op: 'kmb', routes: ['101'] })).toBe('kmb');
    expect(flagKind(null)).toBe('citybus');
  });

  it('电车站岛：同方向最近的站（W1 → 砵典乍街 72W、W2 → 畢打街 70W、E1 → 畢打街 27E、E2 → 雪廠街 29E）', () => {
    const want: Record<string, string> = { W1: '72W', W2: '70W', E1: '27E', E2: '29E' };
    for (const a of STOP_ANCHORS) {
      const s = tramStopFor(a.x, a.y, a.westbound)!;
      expect(s.ref).toBe(want[a.name]);
      expect(s.ref.endsWith(a.westbound ? 'W' : 'E')).toBe(true);
    }
    expect(tramStopFor(238.5, -17.8, true)!.zh).toBe('砵典乍街');
    expect(TRAM_STOPS.length).toBeGreaterThan(0);
  });
});

describe('过路处', () => {
  it('望右 / 望左：双向路两侧都望右；单行路来车在行人左边的一侧望左', () => {
    expect(lookSide(0, 1)).toBe('right');
    expect(lookSide(0, -1)).toBe('right');
    // 单行沿 +t：+n 路缘的人右手是 −t，车从 −t 来 → 望右；−n 路缘右手是 +t，车从左边来 → 望左
    expect(lookSide(1, 1)).toBe('right');
    expect(lookSide(1, -1)).toBe('left');
    expect(lookSide(-1, 1)).toBe('left');
    expect(lookSide(-1, -1)).toBe('right');
  });

  it('灯控判定：20 m 内有交通灯才画路钉（dm 坐标）', () => {
    const signals = [1000, 1000];
    expect(studdedCrossing(1150, 1000, signals)).toBe(true);
    expect(studdedCrossing(1199, 1000, signals)).toBe(true);
    expect(studdedCrossing(1201, 1000, signals)).toBe(false);
    expect(studdedCrossing(0, 0, [])).toBe(false);
  });

  it('贴片代码可逆（着色器解码规则）', () => {
    for (const ow of [-1, 0, 1] as const)
      for (const l of [false, true])
        for (const r of [false, true]) {
          const k = crossingCode(ow, l, r);
          expect(k % 3 - 1).toBe(ow);
          expect(Math.floor(k / 3) % 2).toBe(l ? 1 : 0);
          expect(Math.floor(k / 6)).toBe(r ? 1 : 0);
        }
  });
});

describe('敏感区距离', () => {
  const zone: SensitiveZone = { id: 'z', kind: 'government', area: { outer: [0, 0, 100, 0, 100, 100, 0, 100] } };
  it('区内 0、区外按到边的距离（米）', () => {
    expect(zoneDistance([zone], 5, 5)).toBe(0);
    expect(zoneDistance([zone], 12, 5)).toBeCloseTo(2, 5);
    expect(clearOfZones([zone], 12, 5)).toBe(false);
    expect(clearOfZones([zone], 13.5, 5)).toBe(true);
    expect(zoneDistance([], 0, 0)).toBe(Infinity);
  });
});

describe('车站图集', () => {
  it('天际线装箱：放得下的不重叠、矮格子填进高格子旁的空位，放不下返回 null', () => {
    const p = new ShelfPacker(100, 50);
    const a = p.place(60, 30)!;
    const b = p.place(40, 10)!;
    const c = p.place(40, 10)!;
    expect(a).toEqual({ x: 0, y: 0 });
    expect(b).toEqual({ x: 60, y: 0 });
    expect(c).toEqual({ x: 60, y: 10 });
    expect(p.place(60, 20)).toEqual({ x: 0, y: 30 });
    expect(p.place(60, 20)).toBeNull();
    expect(p.place(200, 1)).toBeNull();
    expect(p.used).toBe(50);
  });

  it('无 DOM 时只做布局：固定格子都有、互不重叠；灯箱广告字全部来自白名单', () => {
    const at = new StationsAtlas(1);
    expect(at.texture).toBeNull();
    const keys = ['look-right', 'look-left', 'mtr-band', ...AD_WORDS.map((_, i) => `ad-${i}`)];
    const rects = keys.map((k) => at.rect(k)!);
    for (const r of rects) {
      expect(r.u1).toBeGreaterThan(r.u0);
      expect(r.v1).toBeGreaterThan(r.v0);
    }
    for (let i = 0; i < rects.length; i++)
      for (let j = i + 1; j < rects.length; j++) {
        const a = rects[i]!;
        const b = rects[j]!;
        const overlap = a.u0 < b.u1 && b.u0 < a.u1 && a.v0 < b.v1 && b.v0 < a.v1;
        expect(overlap).toBe(false);
      }
    expect(AD_WORDS.length).toBeGreaterThan(0);
    for (const w of AD_WORDS) expect(isWhitelisted(w)).toBe(true);
    expect(FIXED_SIZES.flag[0] / FIXED_SIZES.flag[1]).toBeCloseTo(0.6 / 0.45, 1);
  });

  it('同内容的站牌共用一格；60 种站牌 + 12 块电车站名牌 + 出口字块 + 码头牌放得下', () => {
    const at = new StationsAtlas(1);
    const a = at.flag(flagSpec(BUS_STOPS[100]!));
    const b = at.flag(flagSpec(BUS_STOPS[100]!));
    expect(a).toBe(b);
    const keys = new Set<string>();
    for (const s of BUS_STOPS) {
      const f = flagSpec(s);
      const k = `${f.kind}${f.zh}${f.routes.join()}`;
      if (keys.size >= 60 || keys.has(k)) continue;
      keys.add(k);
      at.flag(f);
    }
    for (const t of TRAM_STOPS.slice(0, 12)) at.tramPlate(t.zh, t.en, t.ref);
    for (const e of MTR_EXITS) at.exitTile(e.code);
    for (const n of [3, 4, 5, 6, 7]) {
      at.pierNumber(n);
      at.pierBoard(String(n), '天星小輪 · 尖沙咀', 'Star Ferry · Tsim Sha Tsui');
    }
    at.sunFascia();
    expect(at.overflow).toBe(0);
  });
});

describe('港铁出口表', () => {
  it('出口字母来自正式出口表、不重复；J3 有照片佐证', () => {
    const codes = MTR_EXITS.map((e) => e.code);
    expect(new Set(codes).size).toBe(codes.length);
    for (const c of codes) expect(CENTRAL_EXIT_CODES).toContain(c);
    const j3 = MTR_EXITS.find((e) => e.code === 'J3')!;
    expect(j3.id).toBe('8f1d3baf7b');
    expect(j3.verified).toBe(true);
    // J3 洞口朝东（mtr-exit 机位从东边看过来）
    expect(j3.normal[0]).toBeGreaterThan(0.8);
    expect(MTR_EXITS.length).toBeGreaterThanOrEqual(3);
    // 紧贴终审法院敏感区的结构不在表里
    expect(MTR_EXITS.some((e) => e.id === '72401c4078')).toBe(false);
  });
});
