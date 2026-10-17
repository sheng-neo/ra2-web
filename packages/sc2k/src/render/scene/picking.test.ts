// WP10 验收：picking —— 以地块中心（平地 = worldToScreen(t) + [0, tileH/2]，坡面按中线两角均值）为输入 pick == t 全图往返
// （四旋转 × 三档；平地 / 丘陵），高楼上半部不命中（只按地面），越界 null，前格盖后格（深湖 / bedrock 悬崖）按画家序取前格。
import { describe, expect, it } from 'vitest';
import { TILES, XBit, tileIndex, tileX, tileY } from '../../contracts/grid';
import type { Rotation } from '../../contracts/rotation';
import { ZOOM_TABLE } from '../../contracts/render';
import { pick, pickSurface, tileCenter } from './picking';
import { worldToScreen } from './projection';
import { addLake, addPlateau, flatState, hillyState, placeLot, snapshotOf } from './testFixtures';

const ROTS: readonly Rotation[] = [0, 1, 2, 3];

/** 批量往返：收集失败项后只做一次断言（避免百万次 expect 的开销）。 */
function roundTrip(sArgs: Parameters<typeof snapshotOf>, stride: number, only?: (t: number) => boolean): void {
  const snap = snapshotOf(...sArgs);
  const tileH = ZOOM_TABLE[snap.view.zoom].tileH;
  const bad: string[] = [];
  let n = 0;
  for (let t = 0; t < TILES; t += stride) {
    if (only && !only(t)) continue;
    n++;
    const [cx, cy] = tileCenter(snap, t);
    const got = pick(snap, cx, cy);
    if (got !== t) bad.push(`${t}→${got}`);
    if (snap.layers.xter[t] === 0) {   // 平地格：契约口径 worldToScreen + [0, tileH/2] 与 tileCenter 相同
      const [sx, sy] = worldToScreen(snap, tileX(t), tileY(t), pickSurface(snap, t).base);
      if (cx !== sx || cy !== sy + tileH / 2) bad.push(`center ${t}`);
    }
  }
  expect(n).toBeGreaterThan(0);
  expect(bad.slice(0, 10)).toEqual([]);
}

describe('picking: 地块中心全图往返', () => {
  it('平地：M 档四旋转逐格；S / L 档抽样', () => {
    const s = flatState();
    for (const rotation of ROTS) roundTrip([s, { zoom: 2, rotation }], 1);
    for (const rotation of ROTS) for (const zoom of [1, 3] as const) roundTrip([s, { zoom, rotation }], 7);
  });
  it('丘陵（含边坡 / 单角 / 三角高坡）：M 档四旋转逐格；S / L 档抽样', () => {
    const s = hillyState();
    const codes = new Set<number>();
    for (let i = 0; i < TILES; i++) codes.add(s.layers.xter[i]! & 0x0f);
    expect(codes.size).toBeGreaterThanOrEqual(4);
    for (const rotation of ROTS) roundTrip([s, { zoom: 2, rotation }], 1);
    for (const rotation of ROTS) for (const zoom of [1, 3] as const) roundTrip([s, { zoom, rotation }], 5);
  });
  it('每种坡面码（1..13）的表面中心都能往返（四旋转 × L 档）；bedrock 为 alt+1 平台', () => {
    const s = flatState(10);
    for (let code = 1; code <= 13; code++) s.layers.xter[tileIndex(2 * code, 20)] = code;
    for (const rotation of ROTS) {
      const snap = snapshotOf(s, { rotation, zoom: 3 });
      for (let code = 1; code <= 13; code++) {
        const t = tileIndex(2 * code, 20);
        const [cx, cy] = tileCenter(snap, t);
        expect(pick(snap, cx, cy)).toBe(t);
      }
      expect(pickSurface(snap, tileIndex(26, 20))).toEqual({ base: 11, bits: 0 });
    }
  });
  it('湖：水下格按水面（waterLevel）拾取；湖面格与远处陆地往返', () => {
    const s = flatState();
    addLake(s, 30, 30, 10, 6, 2);
    const far = (t: number): boolean => { const x = tileX(t), y = tileY(t); return (x >= 30 && x < 40 && y >= 30 && y < 36) || x < 26 || x > 43 || y < 26 || y > 39; };
    for (const rotation of ROTS) roundTrip([s, { zoom: 2, rotation }], 1, far);
    const snap = snapshotOf(s);
    expect(pickSurface(snap, tileIndex(32, 32))).toEqual({ base: 6, bits: 0 });
    expect(pickSurface(snap, tileIndex(10, 10))).toEqual({ base: 4, bits: 0 });
  });
});

describe('picking: 边界与遮挡', () => {
  it('越界 / 画布外 → null；地图四角的中心命中', () => {
    const s = flatState();
    for (const rotation of ROTS) {
      const snap = snapshotOf(s, { rotation });
      expect(pick(snap, -1e5, -1e5)).toBeNull();
      expect(pick(snap, 1e5, 1e5)).toBeNull();
      expect(pick(snap, 0, 0)).toBeNull();                        // (0,0)@31 顶点处无地面（平地 4 级）
      for (const [x, y] of [[0, 0], [127, 0], [0, 127], [127, 127]] as const) {
        const [sx, sy] = worldToScreen(snap, x, y, 4);
        expect(pick(snap, sx, sy + 8)).toBe(tileIndex(x, y));
      }
    }
  });
  it('高楼上半部不命中：4×4 建筑前方点击其后方地块仍选中后方地块', () => {
    const s = flatState();
    placeLot(s, 0xcf, 60, 60, XBit.Powerable | XBit.Powered);
    for (const rotation of ROTS) {
      const snap = snapshotOf(s, { rotation });
      // 旋转 0 时 (58,58) 在建筑后方（深度更小）；其它旋转取对应的"后方"格
      const behind: [number, number] = rotation === 0 ? [58, 58] : rotation === 1 ? [69, 58] : rotation === 2 ? [69, 69] : [58, 69];
      const [sx, sy] = worldToScreen(snap, behind[0], behind[1], 4);
      expect(pick(snap, sx, sy + 8)).toBe(tileIndex(behind[0], behind[1]));
    }
  });
  it('深湖（深 3）：水面盖住后方陆地格时，拾取返回水面格（与画家序一致）', () => {
    const s = flatState();
    addLake(s, 30, 30, 10, 6, 3);
    const snap = snapshotOf(s);
    const [cx, cy] = tileCenter(snap, tileIndex(28, 28));
    expect(pick(snap, cx, cy)).toBe(tileIndex(30, 30));
    const [lx, ly] = tileCenter(snap, tileIndex(32, 32));
    expect(pick(snap, lx, ly)).toBe(tileIndex(32, 32));
  });
  it('bedrock 悬崖：平台（alt+1）盖住其后方格的下半部时取平台格；平台之外仍取后方格', () => {
    const s = flatState(10);
    addPlateau(s, 10, 6, 4, 4);
    const snap = snapshotOf(s, { zoom: 3 });
    const front = tileIndex(10, 6), back = tileIndex(9, 5);
    const [sx, sy] = worldToScreen(snap, 10, 6, 10);   // 平台格在 10 级的顶点；其平台四边形上移 24 px → x = sx 处覆盖 [sy−24, sy+8]
    // 后方格 (9,5) 平地 10 级：底顶点在 (sx, sy)，x = sx 处覆盖 [sy−32, sy]
    expect(pick(snap, sx, sy - 12)).toBe(front);
    expect(pick(snap, sx, sy + 4)).toBe(front);
    expect(pick(snap, sx, sy - 28)).toBe(back);
    const [cx, cy] = tileCenter(snap, front);
    expect(pick(snap, cx, cy)).toBe(front);
    expect(pickSurface(snap, front)).toEqual({ base: 11, bits: 0 });
  });
});
