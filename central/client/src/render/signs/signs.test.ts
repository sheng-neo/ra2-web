import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { CityFile } from '@central/data';
import { flatGround } from '../../data/terrain';
import { chunksFromPlans, frontageOf, planBuildings } from '../buildings';
import { INT_OFFSET, hash3 } from '../windows';
import { SIGN_STYLES, atlasLayout, cellUv, hexLuminance, styleGain, type SignStyle } from './atlas';
import {
  RoadIndex,
  SIGN_BOTTOM_M,
  facesStreet,
  placeSigns,
  shopUnitKind,
  shopUnitWidth,
  signDensity,
  wantsVerticalSigns,
  type FrontageSpan,
  type SignQuad,
} from './placement';
import { SIGN_WORDS, isGenericTradeWord, isWhitelisted } from './whitelist';

const city = JSON.parse(readFileSync(new URL('../../../public/city/central.json', import.meta.url)).toString('utf8')) as CityFile;

/** 规格 B7 列出的 20 个词（白名单必须包含全部）。 */
const SPEC_WORDS = '藥房 茶餐廳 找換 珠寶 眼鏡 時裝 地產 酒樓 涼茶 押 士多 五金 鐘錶 冰室 麵家 粥店 洗衣 診所 牙科 補習'.split(' ');

/** 用真实数据的平地楼面跑一遍摆放（不画网格）。 */
function allSigns(): { quads: SignQuad[]; spans: FrontageSpan[] } {
  const { plans, cutsOf } = planBuildings(city.buildings, flatGround, city.zones.sensitive);
  const roads = new RoadIndex(city.roads);
  const quads: SignQuad[] = [];
  const spans: FrontageSpan[] = [];
  chunksFromPlans(plans, cutsOf, {
    rooftops: false,
    onSpan: (pl, s) => {
      const f = frontageOf(pl, s);
      if (f && facesStreet(f, roads)) {
        spans.push(f);
        quads.push(...placeSigns(f));
      }
    },
  });
  return { quads, spans };
}

const sub = (a: readonly number[], b: readonly number[]) => [a[0]! - b[0]!, a[1]! - b[1]!, a[2]! - b[2]!];
const dot = (a: readonly number[], b: readonly number[]) => a[0]! * b[0]! + a[1]! * b[1]! + a[2]! * b[2]!;
const cross = (a: readonly number[], b: readonly number[]) => [a[1]! * b[2]! - a[2]! * b[1]!, a[2]! * b[0]! - a[0]! * b[2]!, a[0]! * b[1]! - a[1]! * b[0]!];

describe('白名单（红线：只用行业通称）', () => {
  it('含规格列出的全部 20 个词；每个词都是 1–3 个汉字，没有数字、拉丁字母', () => {
    for (const w of SPEC_WORDS) expect(isWhitelisted(w)).toBe(true);
    for (const w of SIGN_WORDS) expect(isGenericTradeWord(w)).toBe(true);
    expect(new Set(SIGN_WORDS).size).toBe(SIGN_WORDS.length);
    expect(isWhitelisted('某某大廈')).toBe(false);
  });

  it('图集里每个格子的字都在白名单里', () => {
    const cells = atlasLayout();
    expect(cells.length).toBe(64);
    for (const c of cells) expect(isWhitelisted(c.word)).toBe(true);
  });

  it('实际摆出来的每块招牌所用的字都在白名单里', () => {
    const cells = atlasLayout();
    const { quads } = allSigns();
    expect(quads.length).toBeGreaterThan(1000);
    for (const q of quads) expect(isWhitelisted(cells[q.cell]!.word)).toBe(true);
  });
});

describe('图集', () => {
  it('格子互不重叠、都在 1024 × 1024 内；横格 4:1、直格 1:4', () => {
    const cells = atlasLayout();
    for (const c of cells) {
      expect(c.x + c.w).toBeLessThanOrEqual(1024);
      expect(c.y + c.h).toBeLessThanOrEqual(1024);
      expect(c.vertical ? c.h / c.w : c.w / c.h).toBe(4);
      const [u0, v0, du, dv] = cellUv(c);
      expect(u0).toBeGreaterThanOrEqual(0);
      expect(v0).toBeGreaterThanOrEqual(0);
      expect(u0 + du).toBeLessThanOrEqual(1);
      expect(v0 + dv).toBeLessThanOrEqual(1);
    }
    for (let i = 0; i < cells.length; i++) {
      for (let j = i + 1; j < cells.length; j++) {
        const a = cells[i]!;
        const b = cells[j]!;
        const overlap = a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
        expect(overlap).toBe(false);
      }
    }
  });

  it('样式增益：主色亮度 × 增益落在契约范围（灯箱 1.5–2.5，霓虹 / LED 2.5–4）', () => {
    for (const s of Object.keys(SIGN_STYLES) as SignStyle[]) {
      const y = hexLuminance(SIGN_STYLES[s].main) * styleGain(s);
      expect(y).toBeGreaterThanOrEqual(1.5);
      expect(y).toBeLessThanOrEqual(4);
    }
    expect(hexLuminance('#ffffff')).toBeCloseTo(1);
    expect(hexLuminance('#000000')).toBe(0);
  });
});

describe('摆放', () => {
  const { quads, spans } = allSigns();

  it('每块招牌：正面朝期望方向、字从左到右（不镜像）、字头朝上', () => {
    for (const q of quads) {
      const [bl, br, , tl] = q.corners;
      const right = sub(br, bl);
      const up = sub(tl, bl);
      const n = cross(right, up);
      // 三角形 (BL, BR, TR) 从正面看逆时针：几何法线 = 期望朝向
      expect(dot(n, q.facing)).toBeGreaterThan(0);
      // 读字方向 = Z × 法线（站在正面看的右手方向）；uv 的 u 沿它增大
      const readDir = cross([0, 0, 1], q.facing);
      expect(dot(right, readDir)).toBeGreaterThan(0);
      expect(q.uv[1]![0]).toBeGreaterThan(q.uv[0]![0]);
      // 字头朝上：t 沿 +Z 增大
      expect(up[2]!).toBeGreaterThan(0);
      expect(q.uv[3]![1]).toBeGreaterThan(q.uv[0]![1]);
    }
  });

  it('直招牌正反两片：朝向相反、都不镜像，与墙垂直', () => {
    const cells = atlasLayout();
    const vertical = quads.filter((q) => cells[q.cell]!.vertical);
    expect(vertical.length).toBeGreaterThan(200);
    expect(vertical.length % 2).toBe(0);
    for (let i = 0; i < vertical.length; i += 2) {
      const a = vertical[i]!;
      const b = vertical[i + 1]!;
      expect(dot(a.facing, b.facing)).toBeCloseTo(-1);
      expect(a.cell).toBe(b.cell);
      // 高 2–6 m、宽 0.8–1.2 m、离街 4.6 m 以上
      const h = a.corners[3][2] - a.corners[0][2];
      const w = Math.hypot(a.corners[1][0] - a.corners[0][0], a.corners[1][1] - a.corners[0][1]);
      expect(h).toBeGreaterThanOrEqual(2 - 1e-9);
      expect(h).toBeLessThanOrEqual(6 + 1e-9);
      expect(w).toBeGreaterThanOrEqual(0.8 - 1e-9);
      expect(w).toBeLessThanOrEqual(1.2 + 1e-9);
    }
  });

  it('平贴招牌挂在铺面上方约 3.5–4.4 m 起（高低、大小各家不同），只挂在营业的商铺单元上；相邻三间不重字', () => {
    let n = 0;
    const heights = new Set<string>();
    for (const s of spans) {
      const words: string[] = [];
      for (const q of placeSigns(s)) {
        if (q.facing[0] !== s.nx || q.facing[1] !== s.ny) continue;
        n++;
        expect(q.corners[0][2]).toBeGreaterThanOrEqual(s.groundM + SIGN_BOTTOM_M - 0.3 - 1e-6);
        expect(q.corners[0][2]).toBeLessThanOrEqual(s.groundM + SIGN_BOTTOM_M + 0.6 + 1e-6);
        heights.add((q.corners[3][2] - q.corners[0][2]).toFixed(2));
        const w = atlasLayout()[q.cell]!.word;
        expect(words.slice(-2)).not.toContain(w);
        words.push(w);
        // 招牌中点所在单元
        const mid = (q.corners[0][0] + q.corners[1][0]) / 2;
        const midY = (q.corners[0][1] + q.corners[1][1]) / 2;
        const along = Math.hypot(mid - s.x0, midY - s.y0);
        const unit = Math.floor((s.u0 + along) / shopUnitWidth(s.key));
        expect(shopUnitKind(s.key, unit, s.typology)).toBe('shop');
      }
    }
    expect(n).toBeGreaterThan(1000);
    expect(heights.size).toBeGreaterThan(20);
  });

  it('密度：上环 / 中环西段远高于核心区；直招牌只在平地唐楼与上环', () => {
    expect(signDensity(-200, 'tenement')).toBeGreaterThan(0.6);
    expect(signDensity(700, 'office')).toBeLessThan(0.25);
    expect(wantsVerticalSigns({ typology: 'tenement', groundM: 5, x0: 400 })).toBe(true);
    expect(wantsVerticalSigns({ typology: 'office', groundM: 5, x0: -300 })).toBe(false);
    expect(wantsVerticalSigns({ typology: 'residential', groundM: 120, x0: -300 })).toBe(false);
  });

  it('确定性：同一墙面两次摆放结果相同', () => {
    for (const s of spans.slice(0, 200)) expect(placeSigns(s)).toEqual(placeSigns(s));
  });

  it('shopUnitKind 与 shader 用同一哈希（单元号加 INT_OFFSET）', () => {
    const key = 12345;
    for (let u = 0; u < 50; u++) {
      const r = hash3(key, u + INT_OFFSET, 53);
      expect(shopUnitKind(key, u, 'tenement')).toBe(r < 0.2 ? 'shutter' : r < 0.27 ? 'dark' : 'shop');
    }
  });
});

describe('RoadIndex', () => {
  it('点到道路中线的距离；远处为 Infinity', () => {
    const idx = new RoadIndex([{ cls: 'primary', pts: [0, 0, 1000, 0] }]);
    expect(idx.distance(50, 10, 20)).toBeCloseTo(10);
    expect(idx.distance(150, 0, 20)).toBe(Infinity);
    expect(idx.distance(120, 5, 30)).toBeCloseTo(Math.hypot(20, 5));
  });
});
