import { describe, expect, it } from 'vitest';
import { Corner, TILES, tileIndex } from './grid';
import { FOOTPRINT, FOOTPRINT_RANGES, anchorOf, cornerBits, forEachLotTile, isAnchorTile, lotIsUniform, type AnchorLayers } from './footprint';

/** 与 CONTRACTS §C 注释独立转录的区间（不复用 FOOTPRINT_RANGES）。 */
const DOC_RANGES: ReadonlyArray<readonly [size: number, lo: number, hi: number]> = [
  [2, 0x61, 0x6b], [2, 0x8c, 0xad], [2, 0xeb, 0xf7],
  [3, 0xae, 0xc5], [3, 0xd0, 0xd6], [3, 0xf8, 0xfa],
  [4, 0xc9, 0xcf], [4, 0xd7, 0xda], [4, 0xfb, 0xff]];
const idsOfSize = (s: number): number[] => { const out: number[] = []; for (let id = 0; id < 256; id++) if (FOOTPRINT[id] === s) out.push(id); return out; };
const docIdsOfSize = (s: number): number[] => { const out: number[] = []; for (const [sz, lo, hi] of DOC_RANGES) if (sz === s) for (let id = lo; id <= hi; id++) out.push(id); return out.sort((a, b) => a - b); };

function layers(): AnchorLayers { return { xbld: new Uint8Array(TILES), xzon: new Uint8Array(TILES) }; }
function placeLot(l: AnchorLayers, ax: number, ay: number, id: number): number {
  const n = FOOTPRINT[id]!;
  const anchor = tileIndex(ax, ay);
  forEachLotTile(anchor, n, (i, dx, dy) => { l.xbld[i] = id; l.xzon[i] = cornerBits(n, dx, dy); });
  return anchor;
}

describe('footprint: FOOTPRINT 表', () => {
  it('256 项，值 ∈ {1,2,3,4}，集合与文档区间一致', () => {
    expect(FOOTPRINT.length).toBe(256);
    for (let id = 0; id < 256; id++) expect([1, 2, 3, 4]).toContain(FOOTPRINT[id]);
    for (const s of [2, 3, 4]) expect(idsOfSize(s)).toEqual(docIdsOfSize(s));
    expect(idsOfSize(2).length).toBe(11 + 34 + 13);
    expect(idsOfSize(3).length).toBe(24 + 7 + 3);
    expect(idsOfSize(4).length).toBe(7 + 4 + 5);
    expect(idsOfSize(1).length).toBe(256 - 58 - 34 - 16);
  });
  it('FOOTPRINT_RANGES 与表一致；高速直线 0x49/0x4A 按 1 计', () => {
    for (const s of [2, 3, 4] as const) for (const [lo, hi] of FOOTPRINT_RANGES[s]) for (let id = lo; id <= hi; id++) expect(FOOTPRINT[id]).toBe(s);
    expect(FOOTPRINT[0x49]).toBe(1); expect(FOOTPRINT[0x4a]).toBe(1);
    expect(FOOTPRINT[0x61]).toBe(2); expect(FOOTPRINT[0xff]).toBe(4); expect(FOOTPRINT[0x70]).toBe(1);
  });
});

describe('footprint: cornerBits / forEachLotTile / isAnchorTile', () => {
  it('1×1 → All；多格只置角；内部与边中格 0', () => {
    expect(cornerBits(1, 0, 0)).toBe(Corner.All);
    expect(cornerBits(2, 0, 0)).toBe(Corner.TL); expect(cornerBits(2, 1, 0)).toBe(Corner.TR);
    expect(cornerBits(2, 0, 1)).toBe(Corner.BL); expect(cornerBits(2, 1, 1)).toBe(Corner.BR);
    expect(cornerBits(3, 1, 1)).toBe(0); expect(cornerBits(3, 1, 0)).toBe(0); expect(cornerBits(4, 3, 3)).toBe(Corner.BR);
  });
  it('forEachLotTile 按 x 主序遍历 n² 格并给出偏移', () => {
    const seen: Array<[number, number, number]> = [];
    forEachLotTile(tileIndex(4, 5), 3, (i, dx, dy) => seen.push([i, dx, dy]));
    expect(seen.length).toBe(9);
    expect(seen[0]).toEqual([tileIndex(4, 5), 0, 0]);
    expect(seen[1]).toEqual([tileIndex(4, 6), 0, 1]);
    expect(seen[8]).toEqual([tileIndex(6, 7), 2, 2]);
  });
  it('isAnchorTile 要求 xbld ≥ 0x0E 且含 TL 位', () => {
    const l = layers();
    const a = placeLot(l, 10, 10, 0x8c);
    expect(isAnchorTile(l, a)).toBe(true);
    expect(isAnchorTile(l, tileIndex(11, 10))).toBe(false);
    l.xbld[tileIndex(20, 20)] = 0x05; l.xzon[tileIndex(20, 20)] = Corner.All;
    expect(isAnchorTile(l, tileIndex(20, 20))).toBe(false);
  });
});

describe('footprint: anchorOf', () => {
  it('xbld < 0x0E → −1；1×1 → 自身', () => {
    const l = layers();
    expect(anchorOf(l, tileIndex(3, 3))).toBe(-1);
    l.xbld[tileIndex(3, 3)] = 0x70; l.xzon[tileIndex(3, 3)] = Corner.All;
    expect(anchorOf(l, tileIndex(3, 3))).toBe(tileIndex(3, 3));
    l.xbld[tileIndex(4, 4)] = 0x1d;                                 // 道路也算 1×1
    expect(anchorOf(l, tileIndex(4, 4))).toBe(tileIndex(4, 4));
  });
  it('2×2 / 3×3 / 4×4 占地内每格都回到锚格（含地图角落）', () => {
    const l = layers();
    const cases: Array<[number, number, number]> = [[10, 20, 0x8c], [50, 60, 0xae], [100, 5, 0xc9], [126, 126, 0x8c], [125, 125, 0xae], [124, 124, 0xc9], [0, 0, 0xc9], [0, 125, 0xae]];
    for (const [ax, ay, id] of cases) {
      const a = placeLot(l, ax, ay, id);
      forEachLotTile(a, FOOTPRINT[id]!, (i) => expect(anchorOf(l, i)).toBe(a));
      expect(lotIsUniform(l, ax, ay, FOOTPRINT[id]!, id)).toBe(true);
    }
  });
  it('在 x 边缘不绕列：y=127 / y=0 两侧的同 ID 散格互不认作同一占地', () => {
    const l = layers();
    // 占地 (5..6, 126..127)；散格 (7, 0) 的线性索引 = 该占地 (6,127) 的索引 + 1
    const a1 = placeLot(l, 5, 126, 0x8c);
    l.xbld[tileIndex(7, 0)] = 0x8c;
    expect(anchorOf(l, tileIndex(7, 0))).toBe(-1);
    expect(anchorOf(l, tileIndex(6, 127))).toBe(a1);
    // 占地 (40..41, 0..1)；散格 (39, 127) 的线性索引 = 锚格索引 − 1
    const a2 = placeLot(l, 40, 0, 0x8c);
    l.xbld[tileIndex(39, 127)] = 0x8c;
    expect(anchorOf(l, tileIndex(39, 127))).toBe(-1);
    expect(anchorOf(l, tileIndex(40, 0))).toBe(a2);
    expect(anchorOf(l, tileIndex(41, 1))).toBe(a2);
    // 3×3 版本：占地 (70..72, 125..127)，散格 (73, 0)
    const a3 = placeLot(l, 70, 125, 0xae);
    l.xbld[tileIndex(73, 0)] = 0xae; l.xbld[tileIndex(73, 1)] = 0xae;
    expect(anchorOf(l, tileIndex(73, 0))).toBe(-1);
    expect(anchorOf(l, tileIndex(72, 127))).toBe(a3);
  });
  it('损坏占地（无 TL 位或占地不一致）→ −1', () => {
    const l = layers();
    const a = placeLot(l, 30, 30, 0xae);
    l.xzon[a] = 0;                                                  // 丢失 TL 位
    expect(anchorOf(l, tileIndex(31, 31))).toBe(-1);
    l.xzon[a] = Corner.TL; l.xbld[tileIndex(32, 32)] = 0x70;         // 占地被别的建筑覆盖
    expect(anchorOf(l, tileIndex(31, 31))).toBe(-1);
    expect(anchorOf(l, tileIndex(32, 32))).toBe(tileIndex(32, 32)); // 覆盖者 0x70 自身是 1×1
  });
});
