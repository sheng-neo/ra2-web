import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { blacklistHit, SERIES_NAMES } from '../../../../citymap/src/redlines';
import type { SensitiveZone } from '@central/data';
import {
  BUS_STOPS,
  JOINT_ROUTES,
  PIER_POINTS,
  PIER_SERVICES,
  RED_MINIBUS_PLACES,
  ROUTES,
  STAR_FERRY_NAMES,
  TRAM_DESTINATIONS,
  TRAM_STOPS,
} from '../streets/transit-data';
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
    const s = BUS_STOPS.find((b) => b.zh === '長江集團中心')!;
    expect(s).toBeTruthy();
    const info = busStopInfoNear(s.x + 3, s.y - 2)!;
    expect(info.zh).toBe('長江集團中心');
    expect(info.en).toBe('Cheung Kong Center');
    for (const r of s.routes) expect(info.routes).toContain(r);
    expect(busStopInfoNear(5000, 5000)).toBeNull();
  });

  it('站牌：真实站名照登，不做替换（负责人拍板 D2，2026-11-26：以楼宇 / 企业 / 政府地点命名的站与目的地也用数据原名）', () => {
    // 交易廣場的站：站牌上是「中環（交易廣場）/ Central (Exchange Square)」
    const ex = BUS_STOPS.filter((b) => b.en === 'Central (Exchange Square)');
    expect(ex.length).toBe(17);
    for (const b of ex) expect(flagSpec(busStopInfoNear(b.x, b.y))).toMatchObject({ zh: '中環（交易廣場）', en: 'Central (Exchange Square)' });
    // 以政府地点命名的站也照登
    expect(flagSpec(busStopInfoNear(159.1, -450.6))).toMatchObject({ zh: '香港禮賓府', en: 'Government House' });
    expect(BUS_STOPS.some((b) => b.zh === '律政中心' && b.en === 'Justice Place')).toBe(true);
    for (const [zh, en] of [
      ['置地廣場', 'The Landmark'],
      ['滙豐總行大廈', 'HSBC Main Building'],
      ['怡和大廈', 'Jardine House'],
      ['長江集團中心', 'Cheung Kong Center'],
    ])
      expect(BUS_STOPS.some((b) => b.zh === zh && b.en === en), `${zh} ${en}`).toBe(true);
    // 站牌上的站名与数据逐个相同（stopDisplayName 是恒等映射）
    expect(stopDisplayName('置地廣場', 'The Landmark')).toEqual({ zh: '置地廣場', en: 'The Landmark' });
    for (const b of BUS_STOPS) {
      const f = flagSpec(b);
      expect([f.zh, f.en]).toEqual([b.zh, b.en]);
    }
    // 路线目的地也是数据原名：城巴 6 / 70 / 260 与绿色小巴 1 往「中環(交易廣場)」
    for (const [op, route] of [
      ['citybus', '6'],
      ['citybus', '70'],
      ['citybus', '260'],
      ['gmb', '1'],
    ] as const)
      expect(ROUTES.find((r) => r.op === op && r.route === route)!.b, `${op} ${route}`).toEqual({ zh: '中環(交易廣場)', en: 'Central (Exchange Square)' });
    // 放开的只是交通文字：红线词表本身不变（central.json 的楼宇 / 地标名仍按它处理）
    expect(blacklistHit('中環（交易廣場）')).toBe('交易廣場');
  });

  it('站名数据整体钉住（D2）：数据行与导演规格附录 A 逐字节相同，真名一个都没被换掉', () => {
    // 文件头注释（第一个 */ 之前）可以改；之后的数据行按 sha256 钉住，值取自附录 A 原件
    const src = readFileSync(new URL('../streets/transit-data.ts', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
    const data = src.slice(src.indexOf('*/') + 2);
    expect(createHash('sha256').update(data).digest('hex')).toBe('ceb655dadd61879db593cce72c2d7f9347552389a5d8aa3eeb4dd2958dd2e786');
    // 可读的计数（哈希变了时帮着看是哪类站名被换了）：389 个站里 69 个以真实企业 / 楼宇命名、5 个以政府地点命名，4 条路线往交易廣場
    const sens = /禮賓府|Government House|政府總部|Central Government Offices|律政中心|Justice Place|立法會|Legislative Council|終審法院|Court of Final Appeal/i;
    expect(BUS_STOPS.length).toBe(389);
    expect(BUS_STOPS.filter((b) => blacklistHit(b.zh) ?? blacklistHit(b.en)).length).toBe(69);
    expect(BUS_STOPS.filter((b) => sens.test(b.zh) || sens.test(b.en)).length).toBe(5);
    expect(ROUTES.filter((r) => [r.a, r.b, r.via].some((d) => d && (blacklistHit(d.zh) ?? blacklistHit(d.en)))).length).toBe(4);
  });

  it('D2 不放开游戏系列名：交通数据的任何文字（站名、目的地、电车、码头、船名）都不含它们（不分大小写）', () => {
    expect(SERIES_NAMES.length).toBeGreaterThan(0);
    for (const g of SERIES_NAMES) expect(blacklistHit(g)).toBe(g);
    const texts: string[] = [];
    const walk = (v: unknown): void => {
      if (typeof v === 'string') texts.push(v);
      else if (v && typeof v === 'object') for (const x of Object.values(v)) walk(x);
    };
    walk([BUS_STOPS, ROUTES, TRAM_STOPS, TRAM_DESTINATIONS, RED_MINIBUS_PLACES, PIER_POINTS, PIER_SERVICES, STAR_FERRY_NAMES, JOINT_ROUTES]);
    expect(texts.length).toBeGreaterThan(3000);
    const lower = SERIES_NAMES.map((g) => g.toLowerCase());
    expect(texts.filter((t) => lower.some((g) => t.toLowerCase().includes(g)))).toEqual([]);
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
