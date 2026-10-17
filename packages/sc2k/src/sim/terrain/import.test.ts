// sim/terrain/import.test.ts —— .SC2 导入：XTER 优先于 ALTM.waterLevel、Water 位修正、未定义码、线性索引不转置、海平面推断；导出打包；主机级往返 hash('sc2') 不变。
import { describe, expect, it } from 'vitest';
import { XBit, XterClass, tileIndex, xterClassOf } from '../../contracts/grid';
import { MISC, miscGet, miscSet } from '../../contracts/io';
import { newDocument } from '../../io/sc2';
import { createTestContext } from '../../testkit';
import { createTerrainSystem } from './index';
import { terrainViolations, totalViolations } from './invariants';

const i = tileIndex;
const altm = (alt: number, wl: number, tun = 0): number => (alt & 0x1f) | ((wl & 0x1f) << 5) | ((tun & 0x3f) << 10);
const host = () => createTestContext({ systems: [createTerrainSystem()] });

describe('terrain import', () => {
  it('XTER 优先于 ALTM.waterLevel：干地水位 = 海拔、水下 / 岸边低水位 → 海平面、瀑布 alt+1、浅水 / 溪流零深度；Water 位按 XTER 修正并写回 doc.xbit；未定义码 → 0 告警；隧道位透传', () => {
    const t = host();
    const doc = newDocument();
    miscSet(doc.misc, MISC.seaLevel, 6); miscSet(doc.misc, MISC.terrainCoast, 1); miscSet(doc.misc, MISC.terrainRiver, 0);
    const A = i(3, 5), B = i(10, 10), C = i(11, 10), D = i(12, 10), E = i(13, 10), F = i(14, 10), G = i(5, 3);
    doc.xter[A] = 0x00; doc.altm[A] = altm(7, 9, 3); doc.xbit[A] = XBit.Water | XBit.SaltWater | XBit.Powered;   // 干地却带水位 / 水位 / 盐位
    doc.xter[B] = 0x10; doc.altm[B] = altm(2, 0); doc.xbit[B] = 0;                                              // 水下但无水位、无 Water 位
    doc.xter[C] = 0x21; doc.altm[C] = altm(5, 0); doc.xbit[C] = XBit.Water;                                     // 岸边，水位缺失 → 6 = alt+1
    doc.xter[D] = 0x3e; doc.altm[D] = altm(4, 0); doc.xbit[D] = XBit.Water;                                     // 瀑布 → alt+1
    doc.xter[E] = 0x0f; doc.altm[E] = altm(4, 4); doc.xbit[E] = 0;                                              // 未定义码
    doc.xter[F] = 0x40; doc.altm[F] = altm(3, 9); doc.xbit[F] = XBit.Water;                                     // 溪流 → 零深度
    doc.xter[G] = 0x00; doc.altm[G] = altm(1, 1);
    const diag = t.host.importSc2(doc);
    const L = t.state.layers;
    expect([L.alt[A], L.waterLevel[A], L.tunnelLevels[A]]).toEqual([7, 7, 3]);
    expect(L.xbit[A]! & XBit.Water).toBe(0); expect(L.xbit[A]! & XBit.SaltWater).toBe(0); expect(L.xbit[A]! & XBit.Powered).toBe(XBit.Powered);
    expect(doc.xbit[A]! & (XBit.Water | XBit.SaltWater)).toBe(0);
    expect([L.alt[B], L.waterLevel[B], L.xter[B]]).toEqual([2, 6, 0x10]); expect(L.xbit[B]! & XBit.Water).toBe(XBit.Water); expect(doc.xbit[B]! & XBit.Water).toBe(XBit.Water);
    expect([L.alt[C], L.waterLevel[C]]).toEqual([5, 6]);
    expect([L.alt[D], L.waterLevel[D], L.xter[D]]).toEqual([4, 5, 0x3e]);
    expect(L.xter[E]).toBe(0); expect(L.xbit[E]! & XBit.Water).toBe(0);
    expect([L.alt[F], L.waterLevel[F], L.xter[F]]).toEqual([3, 3, 0x40]);
    expect(L.alt[G]).toBe(1); expect(L.alt[i(3, 5)]).toBe(7);                                                 // 不转置
    expect(t.state.terrain).toMatchObject({ seaLevel: 6, coast: true, river: false });
    const codes = diag.map((d) => d.code);
    expect(codes).toContain('terrain.undefinedXter'); expect(codes).toContain('terrain.waterBitFixed'); expect(codes).toContain('terrain.waterLevelFixed');
    expect(t.host.q.terrain.isWater(B)).toBe(true); expect(t.host.q.terrain.waterDepth(B)).toBe(4);
    expect(t.host.q.terrain.isFlatDry(A)).toBe(true);
  });
  it('海平面缺失：由海相连水块水位众数推断；无水块时默认 4', () => {
    const a = host();
    const doc = newDocument();
    for (let k = 0; k < 5; k++) { doc.xter[i(20 + k, 20)] = 0x10; doc.altm[i(20 + k, 20)] = altm(2, 5); }
    doc.xter[i(30, 30)] = 0x10; doc.altm[i(30, 30)] = altm(2, 7);
    const diag = a.host.importSc2(doc);
    expect(a.state.terrain.seaLevel).toBe(5);
    expect(diag.some((d) => d.code === 'terrain.seaLevelInferred')).toBe(true);
    const b = host();
    b.host.importSc2(newDocument());
    expect(b.state.terrain.seaLevel).toBe(4);
  });
  it('角点不一致的第三方存档：以地块为准导入、记 cornerMismatch 诊断、后续工具仍可用', () => {
    const t = host();
    const doc = newDocument();
    for (let k = 0; k < doc.altm.length; k++) doc.altm[k] = altm(4, 4);
    doc.xter[i(10, 10)] = 0x01; doc.altm[i(10, 10)] = altm(4, 4);                  // T 边高，但邻居全平 → 角点不一致
    const diag = t.host.importSc2(doc);
    expect(diag.some((d) => d.code === 'terrain.cornerMismatch')).toBe(true);
    expect(t.state.layers.xter[i(10, 10)]).toBe(0x01);
    t.state.clock.mode = 0;
    expect(t.host.dispatch({ type: 'terrainTool', tool: 'raise', path: [i(10, 10)] }).ok).toBe(true);
    expect(totalViolations(terrainViolations(t.state))).toBe(0);
  });
  it('导出：ALTM = alt | waterLevel<<5 | tunnel<<10（无水格水位 = 海拔）、XTER 原样、MISC 三项', () => {
    const t = createTestContext({ systems: [createTerrainSystem()], flat: false, params: { terrainSeed: 2024, terrain: { coast: true, river: false, hills: 10, water: 8, trees: 5 } } });
    t.state.layers.tunnelLevels[i(64, 64)] = 2;
    const doc = t.host.exportSc2();
    const L = t.state.layers;
    let dry = -1, wet = -1;
    for (let k = 0; k < L.alt.length && (dry < 0 || wet < 0); k++) { if ((L.xbit[k]! & XBit.Water) === 0 && dry < 0) dry = k; if ((L.xbit[k]! & XBit.Water) !== 0 && wet < 0) wet = k; }
    expect(doc.altm[dry]).toBe(altm(L.alt[dry]!, L.alt[dry]!));
    expect(doc.altm[wet]).toBe(altm(L.alt[wet]!, L.waterLevel[wet]!));
    expect(doc.altm[i(64, 64)]! >> 10).toBe(2);
    expect(doc.xter).toEqual(L.xter);
    expect(miscGet(doc.misc, MISC.seaLevel)).toBe(t.state.terrain.seaLevel);
    expect(miscGet(doc.misc, MISC.terrainCoast)).toBe(1); expect(miscGet(doc.misc, MISC.terrainRiver)).toBe(0);
  });
  it('主机级往返：exportSc2 → importSc2 后 hash("sc2") 相同，地形层与元数据逐字节相同，无 warn 诊断', () => {
    const a = createTestContext({ systems: [createTerrainSystem()], flat: false, params: { terrainSeed: 77, terrain: { coast: true, river: true, hills: 14, water: 9, trees: 20 } } });
    a.state.clock.mode = 0;
    a.host.dispatch({ type: 'terrainTool', tool: 'water', path: [i(60, 60)] });
    a.host.dispatch({ type: 'terrainTool', tool: 'lower', path: [i(70, 70)] });
    const h = a.host.hash('sc2');
    const doc = a.host.exportSc2();
    const b = createTestContext({ systems: [createTerrainSystem()], flat: false, params: { terrainSeed: 1, terrain: { coast: false, river: false, hills: 3, water: 2, trees: 3 } } });
    const diag = b.host.importSc2(doc);
    expect(diag.filter((d) => d.level === 'warn')).toEqual([]);
    expect(b.host.hash('sc2')).toBe(h);
    for (const key of ['alt', 'waterLevel', 'tunnelLevels', 'xter', 'xbit', 'xbld'] as const) expect(b.state.layers[key]).toEqual(a.state.layers[key]);
    expect(b.state.terrain).toEqual(a.state.terrain);
    expect(xterClassOf(b.state.layers.xter[i(60, 60)]!)).toBe(XterClass.Surface);
    expect(totalViolations(terrainViolations(b.state))).toBe(0);
    // 导入后工具继续工作（角点场已重建）
    b.state.clock.mode = 0;
    expect(b.host.dispatch({ type: 'terrainTool', tool: 'raise', path: [i(80, 80)] }).ok).toBe(true);
    expect(totalViolations(terrainViolations(b.state))).toBe(0);
  });
});
