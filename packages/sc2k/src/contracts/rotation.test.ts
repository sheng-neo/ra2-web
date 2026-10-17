import { describe, expect, it } from 'vitest';
import { Dir, XBit, tileIndex, tileX, tileY } from './grid';
import { PIECE_MASK } from './net';
import {
  CORNERS_TO_SLOPE, DIR_MIRROR, DIR_ROT_CCW, FLIP_FAMILY, ONRAMP_ORIENT, SLOPE_CORNERS, SLOPE_ROT_CCW, SLOPE_ROT_CW,
  XBLD_ROT_CCW, XTER_STREAM_ROT_CCW, XUND_ROT_CCW, drawFlip, onrampWorldOrient, renderAnchor, rotateCorner, rotateDir,
  rotateTile, rotateXbld, rotateXbldFlip, rotateXter, rotateXund, unrotateTile, type Rotation,
} from './rotation';

const ROTS: readonly Rotation[] = [0, 1, 2, 3];
const DIRS: readonly Dir[] = [Dir.T, Dir.R, Dir.B, Dir.L];

/** 对 256 项置换表：周期 4 且为双射。 */
function expectPermutationPeriod4(t: Uint8Array): void {
  expect(t.length).toBe(256);
  expect([...t].sort((a, b) => a - b)).toEqual([...Array(256).keys()]);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 4; k++) c = t[c]!;
    expect(c).toBe(i);
  }
}

describe('rotation: 坐标', () => {
  it('rotateTile 1 次 = (x,y)→(y,127−x)，4 次恒等，unrotateTile 为逆', () => {
    expect(rotateTile(3, 10, 1)).toEqual([10, 124]);
    for (let x = 0; x < 128; x += 9) for (let y = 0; y < 128; y += 11) {
      expect(rotateTile(x, y, 0)).toEqual([x, y]);
      for (const r of ROTS) {
        const [rx, ry] = rotateTile(x, y, r);
        expect(unrotateTile(rx, ry, r)).toEqual([x, y]);
      }
      let p: [number, number] = [x, y];
      for (let k = 0; k < 4; k++) p = rotateTile(p[0], p[1], 1);
      expect(p).toEqual([x, y]);
    }
  });
  it('rotateCorner 4 次恒等且与 rotateTile 兼容（c00 的旋转 = 旋转后 tile 的 c01）', () => {
    for (let cx = 0; cx <= 128; cx += 16) for (let cy = 0; cy <= 128; cy += 16) {
      let p: [number, number] = [cx, cy];
      for (let k = 0; k < 4; k++) p = rotateCorner(p[0], p[1], 1);
      expect(p).toEqual([cx, cy]);
    }
    const [rx, ry] = rotateTile(5, 7, 1);
    expect(rotateCorner(5, 7, 1)).toEqual([rx, ry + 1]);
  });
  it('rotateDir：T→L→B→R→T，周期 4，且与 rotateTile 的位移一致', () => {
    expect(DIR_ROT_CCW).toEqual([Dir.L, Dir.T, Dir.R, Dir.B]);
    for (const d of DIRS) {
      expect(rotateDir(rotateDir(rotateDir(rotateDir(d, 1), 1), 1), 1)).toBe(d);
      const [ax, ay] = rotateTile(50, 50, 1);
      const [bx, by] = rotateTile(50 + [0, 1, 0, -1][d]!, 50 + [-1, 0, 1, 0][d]!, 1);
      const rd = rotateDir(d, 1);
      expect([bx - ax, by - ay]).toEqual([[0, 1, 0, -1][rd], [-1, 0, 1, 0][rd]]);
    }
  });
  it('DIR_MIRROR（x↔y 交换）为对合：T↔L、R↔B', () => {
    expect(DIR_MIRROR).toEqual([Dir.L, Dir.B, Dir.R, Dir.T]);
    for (const d of DIRS) expect(DIR_MIRROR[DIR_MIRROR[d]!]).toBe(d);
  });
});

describe('rotation: 坡面码置换', () => {
  it('SLOPE_CORNERS 无重复，CORNERS_TO_SLOPE 为其逆', () => {
    expect(new Set(SLOPE_CORNERS).size).toBe(14);
    SLOPE_CORNERS.forEach((bits, code) => expect(CORNERS_TO_SLOPE[bits]).toBe(code));
  });
  it('SLOPE_ROT_CCW = 角点重命名 c10→c00′, c11→c10′, c01→c11′, c00→c01′ 推导', () => {
    SLOPE_CORNERS.forEach((bits, code) => {
      const a = (bits >> 3) & 1, b = (bits >> 2) & 1, x = (bits >> 1) & 1, y = bits & 1;   // a=c00 b=c10 x=c01 y=c11
      const next = (b << 3) | (y << 2) | (a << 1) | x;                                      // a′=b b′=y x′=a y′=x
      expect(SLOPE_ROT_CCW[code]).toBe(CORNERS_TO_SLOPE[next]);
    });
  });
  it('周期 4；SLOPE_ROT_CW 为 SLOPE_ROT_CCW 的逆', () => {
    for (let c = 0; c < 14; c++) {
      let v = c;
      for (let k = 0; k < 4; k++) v = SLOPE_ROT_CCW[v]!;
      expect(v).toBe(c);
      expect(SLOPE_ROT_CW[SLOPE_ROT_CCW[c]!]).toBe(c);
      expect(SLOPE_ROT_CCW[SLOPE_ROT_CW[c]!]).toBe(c);
    }
  });
  it('rotateXter：坡面 / 浅水按角位置换、溪流按环、瀑布不变，周期 4', () => {
    for (let code = 0; code <= 0x45; code++) {
      const lo = code & 0x0f;
      if (code < 0x40 && lo > 13) continue;                 // 无效低 nibble 不在定义域
      let v = code;
      for (let k = 0; k < 4; k++) v = rotateXter(v, 1);
      expect(v).toBe(code);
      expect(rotateXter(code, 2)).toBe(rotateXter(rotateXter(code, 1), 1));
    }
    for (const hi of [0x00, 0x10, 0x20, 0x30]) for (let s = 0; s < 14; s++) expect(rotateXter(hi | s, 1)).toBe(hi | SLOPE_ROT_CCW[s]!);
    expect(rotateXter(0x3e, 1)).toBe(0x3e);
    expect(rotateXter(0x42, 1)).toBe(XTER_STREAM_ROT_CCW[0x42]);
    expect(rotateXter(0x40, 1)).toBe(0x41);
  });
});

describe('rotation: XBLD / XUND 置换表', () => {
  it('XBLD_ROT_CCW 为双射且周期 4', () => expectPermutationPeriod4(XBLD_ROT_CCW));
  it('XUND_ROT_CCW 为双射且周期 4', () => expectPermutationPeriod4(XUND_ROT_CCW));
  it('rotateXbld 周期 4', () => {
    for (let id = 0; id < 256; id++) {
      expect(rotateXbld(id, 0)).toBe(id);
      expect(rotateXbld(rotateXbld(id, 1), 3)).toBe(id);
      expect(rotateXbld(id, 2)).toBe(rotateXbld(rotateXbld(id, 1), 1));
    }
  });
  it('建筑 0x70–0xFF 除 0xC6↔0xC7 外不变；0x00–0x0D、匝道与翻转族不变', () => {
    for (let id = 0x70; id < 256; id++) {
      if (id === 0xc6) expect(XBLD_ROT_CCW[id]).toBe(0xc7);
      else if (id === 0xc7) expect(XBLD_ROT_CCW[id]).toBe(0xc6);
      else expect(XBLD_ROT_CCW[id]).toBe(id);
    }
    for (let id = 0; id < 0x0e; id++) expect(XBLD_ROT_CCW[id]).toBe(id);
    for (let id = 0x5d; id <= 0x60; id++) expect(XBLD_ROT_CCW[id]).toBe(id);
    for (const id of FLIP_FAMILY) expect(XBLD_ROT_CCW[id]).toBe(id);
    expect(XBLD_ROT_CCW[0x69]).toBe(0x69);
  });
  it('网络族环与 PIECE_MASK 的掩码旋转一致（非坡面片段）', () => {
    const rotMask = (m: number): number => { let o = 0; for (const d of DIRS) if (m & (1 << d)) o |= 1 << rotateDir(d, 1); return o; };
    for (const base of [0x0e, 0x1d, 0x2c]) for (let k = 0; k < 15; k++) {
      if (k >= 2 && k <= 5) continue;
      const nk = XBLD_ROT_CCW[base + k]! - base;
      expect(nk).toBeGreaterThanOrEqual(0); expect(nk).toBeLessThan(15);
      expect(PIECE_MASK[nk]).toBe(rotMask(PIECE_MASK[k]!));
    }
    // 坡面片段 2..5 ↔ XTER 坡 1..4 的置换一致
    for (let s = 1; s <= 4; s++) expect(XBLD_ROT_CCW[0x1d + s + 1]! - 0x1d - 1).toBe(SLOPE_ROT_CCW[s]);
  });
  it('文档列举的环逐项', () => {
    expect(XBLD_ROT_CCW[0x0e]).toBe(0x0f); expect(XBLD_ROT_CCW[0x0f]).toBe(0x0e);
    expect(XBLD_ROT_CCW[0x1d + 14]).toBe(0x1d + 14);
    expect([0x3b, 0x3e, 0x3d, 0x3c].map((v) => XBLD_ROT_CCW[v])).toEqual([0x3e, 0x3d, 0x3c, 0x3b]);
    expect([0x3f, 0x42, 0x41, 0x40].map((v) => XBLD_ROT_CCW[v])).toEqual([0x42, 0x41, 0x40, 0x3f]);
    expect([0x6c, 0x6f, 0x6e, 0x6d].map((v) => XBLD_ROT_CCW[v])).toEqual([0x6f, 0x6e, 0x6d, 0x6c]);
    for (const [a, b] of [[0x43, 0x44], [0x45, 0x46], [0x47, 0x48], [0x4b, 0x4c], [0x4d, 0x4e], [0x4f, 0x50], [0x49, 0x4a]] as const) {
      expect(XBLD_ROT_CCW[a]).toBe(b); expect(XBLD_ROT_CCW[b]).toBe(a);
    }
    expect([0x61, 0x64, 0x63, 0x62].map((v) => XBLD_ROT_CCW[v])).toEqual([0x64, 0x63, 0x62, 0x61]);
    expect([0x65, 0x68, 0x67, 0x66].map((v) => XBLD_ROT_CCW[v])).toEqual([0x68, 0x67, 0x66, 0x65]);
  });
  it('XUND：地铁 0x01+k / 管线 0x10+k 同电线环；0x1F↔0x20；0x22 0x23 不变', () => {
    for (let k = 0; k < 15; k++) {
      expect(XUND_ROT_CCW[0x01 + k]! - 0x01).toBe(XBLD_ROT_CCW[0x0e + k]! - 0x0e);
      expect(XUND_ROT_CCW[0x10 + k]! - 0x10).toBe(XBLD_ROT_CCW[0x0e + k]! - 0x0e);
    }
    expect(XUND_ROT_CCW[0x1f]).toBe(0x20); expect(XUND_ROT_CCW[0x20]).toBe(0x1f);
    expect(XUND_ROT_CCW[0x00]).toBe(0x00); expect(XUND_ROT_CCW[0x21]).toBe(0x21);
    expect(XUND_ROT_CCW[0x22]).toBe(0x22); expect(XUND_ROT_CCW[0x23]).toBe(0x23);
    expect(rotateXund(0x01, 2)).toBe(0x01);
  });
});

describe('rotation: 翻转族与匝道', () => {
  it('drawFlip：只对翻转族有意义，每转 1 次取反', () => {
    expect(drawFlip(0, 0x51, 0)).toBe(false);
    expect(drawFlip(XBit.Flipped, 0x51, 0)).toBe(true);
    expect(drawFlip(0, 0x51, 1)).toBe(true);
    expect(drawFlip(XBit.Flipped, 0x51, 1)).toBe(false);
    expect(drawFlip(0, 0x51, 2)).toBe(false);
    expect(drawFlip(XBit.Flipped | XBit.Powered, 0x51, 3)).toBe(false);
    expect(drawFlip(XBit.Powered, 0x51, 0)).toBe(false);         // 0x40 是 Powered，与朝向无关
    expect(drawFlip(XBit.Flipped, 0x1d, 1)).toBe(false);         // 非翻转族恒 false
  });
  it('rotateXbldFlip：r=0 恒等；翻转族走 drawFlip；其余走 rotateXbld', () => {
    for (let id = 0; id < 256; id++) for (const xbit of [0, XBit.Flipped]) {
      const res0 = rotateXbldFlip(id, xbit, 0);
      expect(res0.id).toBe(id);
      expect(res0.flip).toBe((xbit & XBit.Flipped) !== 0 && (FLIP_FAMILY.has(id) || ONRAMP_ORIENT[id] !== undefined));
      for (const r of ROTS) {
        const res = rotateXbldFlip(id, xbit, r);
        if (FLIP_FAMILY.has(id)) expect(res).toEqual({ id, flip: drawFlip(xbit, id, r) });
        else if (!ONRAMP_ORIENT[id]) expect(res).toEqual({ id: rotateXbld(id, r), flip: false });
      }
    }
    expect(rotateXbldFlip(0x1d, 0, 1)).toEqual({ id: 0x1e, flip: false });
    expect(rotateXbldFlip(0x51, 0, 1)).toEqual({ id: 0x51, flip: true });
  });
  it('匝道：8 种 (id, flip) 组合在每个旋转下一一对应，且世界朝向 = 原朝向旋转 r 次', () => {
    const onramps = [0x5d, 0x5e, 0x5f, 0x60];
    for (const r of ROTS) {
      const seen = new Set<string>();
      for (const id of onramps) for (const xbit of [0, XBit.Flipped]) {
        const res = rotateXbldFlip(id, xbit, r);
        expect(onramps).toContain(res.id);
        seen.add(`${res.id}:${res.flip}`);
        const before = onrampWorldOrient(id, xbit)!;
        const after = onrampWorldOrient(res.id, res.flip ? XBit.Flipped : 0)!;
        expect(after).toEqual({ hwy: rotateDir(before.hwy, r), road: rotateDir(before.road, r) });
      }
      expect(seen.size).toBe(8);
    }
    expect(onrampWorldOrient(0x5d, 0)).toEqual({ hwy: Dir.T, road: Dir.L });
    expect(onrampWorldOrient(0x5d, XBit.Flipped)).toEqual({ hwy: Dir.L, road: Dir.T });
    expect(onrampWorldOrient(0x1d, XBit.Flipped)).toBeNull();
  });
});

describe('rotation: renderAnchor', () => {
  it('四个旋转的锚格按公式', () => {
    const o = tileIndex(10, 20);
    for (const size of [1, 2, 3, 4] as const) {
      const s = size - 1;
      expect(renderAnchor(o, size, 0)).toBe(tileIndex(10 + s, 20 + s));
      expect(renderAnchor(o, size, 1)).toBe(tileIndex(10, 20 + s));
      expect(renderAnchor(o, size, 2)).toBe(tileIndex(10, 20));
      expect(renderAnchor(o, size, 3)).toBe(tileIndex(10 + s, 20));
    }
    expect(renderAnchor(tileIndex(0, 0), 1, 2)).toBe(0);
  });
  it('锚格 = 占地内旋转后 rx+ry 最大的格（屏幕最下方）', () => {
    for (const size of [1, 2, 3, 4] as const) for (const r of ROTS) {
      const o = tileIndex(100, 3);
      const a = renderAnchor(o, size, r);
      const [arx, ary] = rotateTile(tileX(a), tileY(a), r);
      for (let dx = 0; dx < size; dx++) for (let dy = 0; dy < size; dy++) {
        const [rx, ry] = rotateTile(100 + dx, 3 + dy, r);
        expect(rx + ry).toBeLessThanOrEqual(arx + ary);
      }
    }
  });
});
