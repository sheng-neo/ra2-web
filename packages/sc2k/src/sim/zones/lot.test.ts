// ===== sim/zones/lot.test.ts =====（spec:zones §2.5.6 / §4：吞并整栋落入、部分重叠（拆迁 / 拒绝）、孤儿删除、瓦砾 1×1 角标、lotAt、候选回退）
import { describe, expect, it } from 'vitest';
import { Corner, XBit, ZoneCode, tileIndex } from '../../contracts/grid';
import { CATALOGUE } from '../../data';
import { createTestContext, runDays } from '../../testkit';
import { ABANDONED_IDS, CONSTRUCTION_IDS, candidatesFor, pickBuilding, zoneTableFor } from './buildings';
import { anchors, isConstructionId, isRubbleId, placeLot, zoneRect } from './fixtures';
import { findLot, startConstruction } from './growth';
import { createZonesSystem } from './index';
import { createRuntime, lotAtAnchor } from './lots';
import type { ZonesCtx } from './lots';
import type { ZonesPriv } from './priv';
import { DEFAULT_ZONES_TUNING } from './tuning';
import type { ZonesTuning } from './tuning';

const TBL = zoneTableFor(CATALOGUE);
const MONTH = 25;
const privOf = (s: { priv: { zones?: unknown } }): ZonesPriv => s.priv.zones as ZonesPriv;
const Zof = (state: { priv: { zones?: unknown } }, tuning: Partial<ZonesTuning> = {}): ZonesCtx => ({ T: { ...DEFAULT_ZONES_TUNING, ...tuning }, tbl: TBL, priv: privOf(state), rt: createRuntime() });
const corners = (xzon: Uint8Array, x: number, y: number): number => xzon[tileIndex(x, y)]! & 0xf0;

describe('吞并', () => {
  it('四栋 1x1 被整栋落入的 2x2 吞并：施工瓦片 + 四角角标 + 分区码保留，旧 lot 的列清零、新锚点 pendingId 为 R 级 2', () => {
    const { ctx, host, state } = createTestContext({ profile: 'optimistic', systems: [createZonesSystem()], tuning: { zones: { fixedDemand: { r: 2000, c: 2000, i: 2000 }, growOffset: 0 } } });
    state.demand.r = 2000;
    zoneRect(ctx, ZoneCode.DenseR, 10, 10, 11, 11);
    const olds = [placeLot(ctx, 0x70, 10, 10), placeLot(ctx, 0x71, 11, 10), placeLot(ctx, 0x72, 10, 11), placeLot(ctx, 0x73, 11, 11)];
    const p = privOf(state);
    for (const a of olds) { p.phaseDays[a] = 7; p.tripFailMonths[a] = 2; }
    runDays(host, MONTH);
    const { xbld, xzon } = state.layers;
    const a = tileIndex(10, 10);
    expect(isConstructionId(xbld[a]!)).toBe(true); expect(CONSTRUCTION_IDS[1]).toContain(xbld[a]);
    for (const o of olds) expect(xbld[o]).toBe(xbld[a]);
    expect(corners(xzon, 10, 10)).toBe(Corner.TL); expect(corners(xzon, 11, 10)).toBe(Corner.TR); expect(corners(xzon, 10, 11)).toBe(Corner.BL); expect(corners(xzon, 11, 11)).toBe(Corner.BR);
    for (const o of olds) expect(xzon[o]! & 0x0f).toBe(ZoneCode.DenseR);
    expect(TBL.level[p.pendingId[a]!]).toBe(2); expect(TBL.zoneIdx[p.pendingId[a]!]).toBe(0);
    for (const o of olds.slice(1)) { expect(p.phaseDays[o]).toBe(0); expect(p.tripFailMonths[o]).toBe(0); expect(p.pendingId[o]).toBe(0); }
    expect(p.tripFailMonths[a]).toBe(0); expect(p.phaseDays[a]).toBeLessThan(MONTH);
    expect(anchors(state)).toEqual([a]);
  });
  it('部分重叠：严格模式拒绝；absorbPartial 时整栋拆除，地块外的格变瓦砾、不留孤儿', () => {
    const { ctx, state } = createTestContext({ profile: 'optimistic', systems: [createZonesSystem()] });
    zoneRect(ctx, ZoneCode.DenseR, 10, 10, 13, 13);
    const old = placeLot(ctx, 0x8c, 12, 12);                                       // 2x2 级 2 占 12..13 × 12..13
    const i = tileIndex(11, 10);                                                    // 任何含 (11,10) 的 3x3 都只盖住它一半
    expect(findLot(ctx, Zof(state, { absorbPartial: false }), i, 3, ZoneCode.DenseR, 4)).toBeNull();
    const Z = Zof(state);
    const pick = findLot(ctx, Z, i, 3, ZoneCode.DenseR, 4);
    expect(pick).not.toBeNull();
    expect(pick!.partial.map((l) => l.anchor)).toEqual([old]);
    const before = ctx.prng.state();
    expect(startConstruction(ctx, Z, pick!.anchor, 3, 0, 4, 1, pick!.partial)).toBe(true);
    expect(ctx.prng.state()).not.toBe(before);
    const { xbld, xzon, xbit } = state.layers;
    const ax = pick!.anchor >> 7, ay = pick!.anchor & 127;
    for (let dx = 0; dx < 3; dx++) for (let dy = 0; dy < 3; dy++) expect(CONSTRUCTION_IDS[3]).toContain(xbld[tileIndex(ax + dx, ay + dy)]);
    let rubble = 0;
    for (let x = 12; x <= 13; x++) for (let y = 12; y <= 13; y++) {
      const j = tileIndex(x, y);
      const inside = x >= ax && x < ax + 3 && y >= ay && y < ay + 3;
      if (inside) continue;
      rubble++;
      expect(isRubbleId(xbld[j]!)).toBe(true); expect(xzon[j]! & 0xf0).toBe(Corner.All); expect(xzon[j]! & 0x0f).toBe(ZoneCode.DenseR); expect(xbit[j]! & XBit.Powerable).toBe(0);
    }
    expect(rubble).toBeGreaterThan(0);
    expect(lotAtAnchor(state.layers, TBL, privOf(state), old)).toBeNull();
    expect(anchors(state)).toEqual([pick!.anchor]);
  });
  it('整栋落入的 2x2 可被 3x3 吞并（对照）', () => {
    const { ctx, state } = createTestContext({ profile: 'optimistic', systems: [createZonesSystem()] });
    zoneRect(ctx, ZoneCode.DenseR, 10, 10, 13, 13);
    placeLot(ctx, 0x90, 11, 11);
    const pick = findLot(ctx, Zof(state, { absorbPartial: false }), tileIndex(11, 10), 3, ZoneCode.DenseR, 4);
    expect(pick).not.toBeNull(); expect(pick!.partial).toEqual([]);
    expect(pick!.anchor === tileIndex(10, 10) || pick!.anchor === tileIndex(11, 10)).toBe(true);
  });
  it('跨分区码 / 非分区建筑 / 施工瓦片 / 更高级建筑都不能拼进地块', () => {
    const { ctx, state } = createTestContext({ profile: 'optimistic', systems: [createZonesSystem()] });
    zoneRect(ctx, ZoneCode.DenseR, 10, 10, 11, 11);
    const Z = Zof(state);
    zoneRect(ctx, ZoneCode.LightR, 11, 11, 11, 11);                                 // 密 R + 轻 R 不能拼
    expect(findLot(ctx, Z, tileIndex(10, 10), 2, ZoneCode.DenseR, 2)).toBeNull();
    zoneRect(ctx, ZoneCode.DenseR, 11, 11, 11, 11);
    expect(findLot(ctx, Z, tileIndex(10, 10), 2, ZoneCode.DenseR, 2)).not.toBeNull();
    ctx.act.setXbld(tileIndex(11, 11), 0xf7);                                        // 教堂
    expect(findLot(ctx, Z, tileIndex(10, 10), 2, ZoneCode.DenseR, 2)).toBeNull();
    placeLot(ctx, 0x88, 11, 11);                                                     // 施工中
    expect(findLot(ctx, Z, tileIndex(10, 10), 2, ZoneCode.DenseR, 2)).toBeNull();
    placeLot(ctx, 0x8c, 10, 10);                                                     // 已是级 2：不能被级 2 吞并，可被级 3 原地（size 相同走 tryGrow 分支）、级 4 吞并
    expect(findLot(ctx, Z, tileIndex(10, 10), 2, ZoneCode.DenseR, 2)).toBeNull();
    zoneRect(ctx, ZoneCode.DenseR, 10, 10, 12, 12);
    expect(findLot(ctx, Z, tileIndex(10, 10), 3, ZoneCode.DenseR, 4)).not.toBeNull();
  });
});

describe('孤儿与瓦砾', () => {
  it('其他系统拆掉建筑后（onTilesChanged）原锚点的 lot 列被清零', () => {
    const { ctx, host, state } = createTestContext({ profile: 'realistic', systems: [createZonesSystem()], tuning: { zones: { fixedDemand: { r: 0, c: 0, i: 0 } } } });
    zoneRect(ctx, ZoneCode.DenseR, 10, 10, 12, 12);
    const a = placeLot(ctx, 0x70, 10, 10);
    runDays(host, 3);
    const p = privOf(state);
    expect(p.phaseDays[a]).toBe(3);
    p.tripFailMonths[a] = 2;
    ctx.act.setXbld(a, 0);                                                          // 模拟推土（经 TileWriter，下次阶段末扇出）
    runDays(host, 1);
    expect(p.phaseDays[a]).toBe(0); expect(p.tripFailMonths[a]).toBe(0);
  });
  it('3x3 废弃楼到期变 9 个独立 1x1 瓦砾：角标 0xF0、分区码保留、Powerable/Piped 清除、锚点消失', () => {
    const sys = createZonesSystem();
    const { ctx, state } = createTestContext({ profile: 'realistic', systems: [sys] });
    zoneRect(ctx, ZoneCode.DenseI, 20, 20, 22, 22);
    const a = placeLot(ctx, 0xc5, 20, 20);
    privOf(state).phaseDays[a] = DEFAULT_ZONES_TUNING.abandonToRubbleDays - 1;
    sys.endOfDay!(ctx);
    const { xbld, xzon, xbit } = state.layers;
    const variants = new Set<number>();
    for (let dx = 0; dx < 3; dx++) for (let dy = 0; dy < 3; dy++) {
      const j = tileIndex(20 + dx, 20 + dy);
      expect(isRubbleId(xbld[j]!)).toBe(true); variants.add(xbld[j]!);
      expect(xzon[j]! & 0xf0).toBe(Corner.All); expect(xzon[j]! & 0x0f).toBe(ZoneCode.DenseI);
      expect(xbit[j]! & (XBit.Powerable | XBit.Piped)).toBe(0);
    }
    expect(variants.size).toBeGreaterThan(1);
    expect(anchors(state)).toEqual([]);
    expect(ctx.q.zones.lotAt(a)).toBeNull();
  });
});

describe('lotAt 与建筑表', () => {
  it('lotAt：占地内任意格 → TL 锚点；施工 tier 取 pendingId；瓦砾 / 空地 null；绑定前 null', () => {
    const fresh = createZonesSystem();
    expect(fresh.queries!.zones!.lotAt(5)).toBeNull();
    expect(fresh.queries!.zones!.recreation()).toEqual({ smallPark: 0, bigPark: 0, marina: 0, zoo: 0, stadium: 0 });
    const { ctx, state } = createTestContext({ profile: 'realistic', systems: [createZonesSystem()] });
    zoneRect(ctx, ZoneCode.DenseR, 10, 10, 20, 20);
    const a = placeLot(ctx, 0xb0, 14, 14);
    expect(ctx.q.zones.lotAt(tileIndex(15, 16))).toEqual({ anchor: a, size: 3, level: 4, tier: 2, phase: 'built' });
    const c = placeLot(ctx, 0xa8, 10, 10);
    privOf(state).pendingId[c] = 0x92;
    expect(ctx.q.zones.lotAt(tileIndex(11, 11))).toEqual({ anchor: c, size: 2, level: 3, tier: 2, phase: 'construct' });
    const ab = placeLot(ctx, 0x8a, 18, 18);
    expect(ctx.q.zones.lotAt(ab)).toEqual({ anchor: ab, size: 1, level: 1, tier: 0, phase: 'abandoned' });
    ctx.act.setXbld(tileIndex(19, 19), 0x02);
    expect(ctx.q.zones.lotAt(tileIndex(19, 19))).toBeNull(); expect(ctx.q.zones.lotAt(tileIndex(5, 5))).toBeNull();
    for (let k = 0; k < 3; k++) ctx.act.setXbld(tileIndex(40 + k, 40), 0x0d);
    expect(ctx.q.zones.recreation().smallPark).toBe(3);
  });
  it('过渡态 ID 组与 CATALOGUE 一致；候选回退：R2 tier2 → 0x8F，R3 tier0 → 0x90，I2 任意 → 0x9E–0xA1，I3 tier0 → 0xA2/0xA3；权重抽取', () => {
    CONSTRUCTION_IDS.forEach((ids, k) => ids.forEach((id) => { const d = CATALOGUE.BUILDINGS[id]!; expect(d.transition).toBe('construction'); expect(d.size).toBe([1, 2, 2, 3][k]); }));
    ABANDONED_IDS.forEach((ids, k) => ids.forEach((id) => { const d = CATALOGUE.BUILDINGS[id]!; expect(d.transition).toBe('abandoned'); expect(d.size).toBe([1, 2, 2, 3][k]); }));
    const ids = (z: number, lv: number, t: number): number[] => candidatesFor(TBL, z, lv, t).map((c) => c.id);
    expect(ids(0, 2, 2)).toEqual([0x8f]); expect(ids(0, 3, 0)).toEqual([0x90]);
    expect(ids(2, 2, 2)).toEqual([0x9e, 0x9f, 0xa0, 0xa1]); expect(ids(2, 3, 0)).toEqual([0xa2, 0xa3]);
    expect(ids(0, 1, 1)).toEqual([0x74, 0x75, 0x76, 0x77]);
    // C 级 1 tier 1：0x7D / 0x80 权重 10、0x83 权重 1 → 抽样 21 次恰覆盖
    const picks = new Map<number, number>();
    for (let r = 0; r < 21; r++) { const id = pickBuilding(TBL, 1, 1, 1, () => r); picks.set(id, (picks.get(id) ?? 0) + 1); }
    expect(picks.get(0x7d)).toBe(10); expect(picks.get(0x80)).toBe(10); expect(picks.get(0x83)).toBe(1);
    expect(pickBuilding(TBL, 0, 1, 0, (n) => n - 1)).toBe(0x73);
  });
});
