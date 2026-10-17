// ===== sim/transport/piece.test.ts =====（WORKPLAN WP6 验收：15 片段、末端直线、孤立管线十字、交叉件生成、坡面非法、半高件、翻转族邻接）
import { describe, expect, it } from 'vitest';
import { XBit, tileIndex } from '../../contracts/grid';
import { NET_BASE, PIECE_MASK } from '../../contracts/net';
import type { NetFamily } from '../../contracts/net';
import { createTestContext } from '../../testkit';
import { flush, lay, layUnd, setWater, setXter, station2x2 } from './fixtures';
import { createTransportSystem } from './index';

const C = { x: 40, y: 40 };
const ci = tileIndex(C.x, C.y);
const DXY: ReadonlyArray<readonly [number, number]> = [[0, -1], [1, 0], [0, 1], [-1, 0]];   // T R B L

function mk() {
  const t = createTestContext({ systems: [createTransportSystem()] });
  return { ...t, T: t.ctx.q.transport };
}
/** 按掩码在四邻放同族"直线"元素（任意朝向都算可连通）。 */
function surround(ctx: ReturnType<typeof mk>['ctx'], family: NetFamily, mask: number): void {
  for (let d = 0; d < 4; d++) {
    const [dx, dy] = DXY[d]!;
    const on = (mask & (1 << d)) !== 0;
    if (family === 'subway' || family === 'pipe') layUnd(ctx, C.x + dx, C.y + dy, on ? NET_BASE[family] : 0);
    else lay(ctx, C.x + dx, C.y + dy, on ? NET_BASE[family] : 0);
  }
}

describe('pieceFor：15 片段与末端 / 孤立规则', () => {
  it.each(['power', 'road', 'rail', 'subway', 'pipe'] as const)('%s：平地 11 种非坡掩码 → 对应 idx', (family) => {
    const { ctx, host, T } = mk();
    for (let idx = 0; idx < 15; idx++) {
      if (idx >= 2 && idx <= 5) continue;                                  // 坡面件由坡面码决定
      surround(ctx, family, PIECE_MASK[idx]!); flush(host);
      expect(T.pieceFor(family, ci), `idx ${idx}`).toBe(NET_BASE[family] + idx);
    }
  });
  it('单方向末端按该轴直线；孤立道路 L-R、孤立管线十字、孤立地铁 L-R', () => {
    const { ctx, host, T } = mk();
    surround(ctx, 'road', 0b0001); flush(host); expect(T.pieceFor('road', ci)).toBe(NET_BASE.road + 1);
    surround(ctx, 'road', 0b0100); flush(host); expect(T.pieceFor('road', ci)).toBe(NET_BASE.road + 1);
    surround(ctx, 'road', 0b1000); flush(host); expect(T.pieceFor('road', ci)).toBe(NET_BASE.road + 0);
    surround(ctx, 'road', 0); flush(host); expect(T.pieceFor('road', ci)).toBe(NET_BASE.road + 0);
    expect(T.pieceFor('pipe', ci)).toBe(NET_BASE.pipe + 14);
    expect(T.pieceFor('subway', ci)).toBe(NET_BASE.subway + 0);
    expect(T.pieceFor('power', ci)).toBe(NET_BASE.power + 0);
    expect(T.pieceFor('road', -1)).toBe(-1);
  });
  it('车站不参与选片：铁路末端紧邻火车站 → 直线而非转弯；建筑格 / 水面 → −1', () => {
    const { ctx, host, T, state } = mk();
    surround(ctx, 'rail', 0b1000); station2x2(ctx, 0xed, C.x, C.y - 2); flush(host);   // 车站占 (40..41, 38..39)，正上方是车站格
    expect(T.pieceFor('rail', ci)).toBe(NET_BASE.rail + 0);
    expect(T.pieceFor('road', tileIndex(C.x, C.y - 1))).toBe(-1);         // 车站格上放路 → 非法
    lay(ctx, C.x, C.y, 0x06); flush(host);                                  // 树木：视为空地
    expect(T.pieceFor('rail', ci)).toBe(NET_BASE.rail + 0);
    setWater(state, C.x, C.y, true);
    expect(T.pieceFor('rail', ci)).toBe(-1);
    setWater(state, C.x, C.y, false);
    lay(ctx, C.x, C.y, 0x0d); flush(host);                                  // 小公园（< 0x0E）视为空地
    expect(T.pieceFor('road', ci)).toBe(NET_BASE.road + 0);
  });
});

describe('pieceFor：交叉件', () => {
  it('道路 × 电线 / 铁路 / 高速，铁路 × 电线 / 高速，电线 × 高速；平行与路口 → −1；重复拖过交叉件保留', () => {
    const { ctx, host, T } = mk();
    const over = (other: number, family: NetFamily, mask: number): number => {
      surround(ctx, family, mask);
      if (family === 'subway' || family === 'pipe') layUnd(ctx, C.x, C.y, other); else lay(ctx, C.x, C.y, other);
      flush(host);
      return T.pieceFor(family, ci);
    };
    expect(over(NET_BASE.power + 1, 'road', 0b1010)).toBe(0x43);          // 电线 TB × 道路 LR
    expect(over(NET_BASE.power + 0, 'road', 0b0101)).toBe(0x44);
    expect(over(NET_BASE.rail + 1, 'road', 0b1010)).toBe(0x45);
    expect(over(NET_BASE.rail + 0, 'road', 0b0101)).toBe(0x46);
    expect(over(NET_BASE.rail + 0, 'power', 0b0101)).toBe(0x47);          // 电线 TB × 铁路 LR
    expect(over(NET_BASE.rail + 1, 'power', 0b1010)).toBe(0x48);
    expect(over(NET_BASE.road + 1, 'rail', 0b1010)).toBe(0x46);           // 反向：铁路 LR 盖在道路 TB 上
    expect(over(NET_BASE.road + 0, 'rail', 0b0101)).toBe(0x45);
    expect(over(NET_BASE.road + 1, 'power', 0b1010)).toBe(0x44);          // 电线 LR × 道路 TB
    expect(over(0x49, 'road', 0b0101)).toBe(0x4b);                        // 高速 LR × 道路 TB
    expect(over(0x4a, 'road', 0b1010)).toBe(0x4c);
    expect(over(0x49, 'rail', 0b0101)).toBe(0x4d);
    expect(over(0x4a, 'rail', 0b1010)).toBe(0x4e);
    expect(over(0x49, 'power', 0b0101)).toBe(0x4f);
    expect(over(0x4a, 'power', 0b1010)).toBe(0x50);
    expect(over(NET_BASE.pipe + 1, 'subway', 0b1010)).toBe(0x1f);         // 水管 TB × 地铁 LR
    expect(over(NET_BASE.pipe + 0, 'subway', 0b0101)).toBe(0x20);
    expect(over(NET_BASE.subway + 1, 'pipe', 0b1010)).toBe(0x20);         // 水管 LR × 地铁 TB
    expect(over(NET_BASE.subway + 0, 'pipe', 0b0101)).toBe(0x1f);
    // 平行 / 路口 / 另一族的坡面件或弯 / 高速块物件 → −1
    expect(over(NET_BASE.power + 0, 'road', 0b1010)).toBe(-1);
    expect(over(NET_BASE.power + 1, 'road', 0b1110)).toBe(-1);
    expect(over(NET_BASE.power + 6, 'road', 0b1010)).toBe(-1);
    expect(over(NET_BASE.power + 2, 'road', 0b0101)).toBe(-1);
    expect(over(0x65, 'road', 0b0101)).toBe(-1);
    expect(over(0x22, 'subway', 0b1010)).toBe(-1);                        // 导弹井
    expect(over(0x23, 'pipe', 0b1010)).toBe(-1);                          // 地铁入口下不能走水管
    // 重复拖过自家交叉件：相容 → 原值；要求路口 → −1
    expect(over(0x43, 'road', 0b1010)).toBe(0x43);
    expect(over(0x43, 'power', 0b0101)).toBe(0x43);
    expect(over(0x43, 'road', 0)).toBe(0x43);
    expect(over(0x43, 'road', 0b1011)).toBe(-1);
    expect(over(0x43, 'rail', 0b1010)).toBe(-1);                          // 第三族叠加
    expect(over(0x1f, 'subway', 0b1010)).toBe(0x1f);
    expect(over(0x23, 'subway', 0b0101)).toBe(0x23);                      // 地铁线路直接连到入口格
  });
  it('交叉件对两族都是可连通邻格；高速段 / 另一族直线不算邻格', () => {
    const { ctx, host, T } = mk();
    lay(ctx, C.x, C.y - 1, 0x43); flush(host);                              // 上方：电线 TB × 道路 LR
    expect(T.pieceFor('power', ci)).toBe(NET_BASE.power + 1);              // 电线沿 TB 连过来
    expect(T.pieceFor('road', ci)).toBe(NET_BASE.road + 0);                // 道路轴 LR 不朝向本格 → 孤立 L-R
    lay(ctx, C.x, C.y - 1, 0x44); flush(host);
    expect(T.pieceFor('road', ci)).toBe(NET_BASE.road + 1);
    expect(T.pieceFor('power', ci)).toBe(NET_BASE.power + 0);
    lay(ctx, C.x, C.y - 1, 0x4a); flush(host);                              // 高速 TB 段：对道路族不是邻格
    expect(T.pieceFor('road', ci)).toBe(NET_BASE.road + 0);
    lay(ctx, C.x, C.y - 1, NET_BASE.rail + 1); flush(host);
    expect(T.pieceFor('road', ci)).toBe(NET_BASE.road + 0);
    expect(T.railMask(ci)).toBe(0b0001);
    expect(T.railMask(-1)).toBe(0);
  });
  it('匝道 / 桥段 / 隧道口 / 转换件只沿固定轴（Flipped 经 onrampWorldOrient / 行进轴）', () => {
    const { ctx, host, T, state } = mk();
    const below = tileIndex(C.x, C.y + 1);
    lay(ctx, C.x, C.y + 1, 0x5d); flush(host);                              // 匝道 高速 T × 道路 L：道路侧朝 L，不朝本格
    expect(T.pieceFor('road', ci)).toBe(NET_BASE.road + 0);
    state.layers.xbit[below] = state.layers.xbit[below]! | XBit.Flipped;    // 镜像后道路侧朝 T = 本格
    expect(T.pieceFor('road', ci)).toBe(NET_BASE.road + 1);
    state.layers.xbit[below] = state.layers.xbit[below]! & ~XBit.Flipped;
    lay(ctx, C.x, C.y + 1, 0x58); flush(host);                              // 堤道桥面：未翻转 = T–B 轴
    expect(T.pieceFor('road', ci)).toBe(NET_BASE.road + 1);
    state.layers.xbit[below] = state.layers.xbit[below]! | XBit.Flipped;
    expect(T.pieceFor('road', ci)).toBe(NET_BASE.road + 0);
    state.layers.xbit[below] = state.layers.xbit[below]! & ~XBit.Flipped;
    lay(ctx, C.x, C.y + 1, 0x5b); flush(host);                              // 铁路桥：铁路族
    expect(T.pieceFor('rail', ci)).toBe(NET_BASE.rail + 1);
    expect(T.pieceFor('road', ci)).toBe(NET_BASE.road + 0);
    lay(ctx, C.x, C.y + 1, 0x3f); flush(host);                              // 隧道口朝 T：轴 TB
    expect(T.pieceFor('road', ci)).toBe(NET_BASE.road + 1);
    lay(ctx, C.x, C.y + 1, 0x40); flush(host);                              // 朝 R：轴 LR
    expect(T.pieceFor('road', ci)).toBe(NET_BASE.road + 0);
    lay(ctx, C.x, C.y + 1, 0x6c); flush(host);                              // 转换件朝 T → 本格
    expect(T.pieceFor('rail', ci)).toBe(NET_BASE.rail + 1);
    lay(ctx, C.x, C.y + 1, 0x6e); flush(host);                              // 朝 B
    expect(T.pieceFor('rail', ci)).toBe(NET_BASE.rail + 0);
    layUnd(ctx, C.x, C.y + 1, 0x23); flush(host);                           // 地铁入口：地铁四向可连
    expect(T.pieceFor('subway', ci)).toBe(NET_BASE.subway + 1);
    expect(T.subwayMask(ci)).toBe(0b0100);
    expect(T.pieceFor('pipe', ci)).toBe(NET_BASE.pipe + 14);               // 对水管不是邻格 → 孤立十字
  });
});

describe('pieceFor：坡面', () => {
  it('道路 / 电线 / 铁路沿坡向直线 → 坡面件；侧向连接、垂直直线、多角坡、瀑布 → −1；孤立坡面取坡向', () => {
    const { ctx, host, T, state } = mk();
    const fams = ['road', 'power', 'rail'] as const;
    for (const f of fams) {
      surround(ctx, f, 0b0101); flush(host);
      setXter(state, C.x, C.y, 1); expect(T.pieceFor(f, ci), `${f} s1`).toBe(NET_BASE[f] + 2);
      setXter(state, C.x, C.y, 3); expect(T.pieceFor(f, ci), `${f} s3`).toBe(NET_BASE[f] + 4);
      setXter(state, C.x, C.y, 2); expect(T.pieceFor(f, ci), `${f} s2⊥`).toBe(-1);
      surround(ctx, f, 0b1010); flush(host);
      setXter(state, C.x, C.y, 2); expect(T.pieceFor(f, ci), `${f} s2`).toBe(NET_BASE[f] + 3);
      setXter(state, C.x, C.y, 4); expect(T.pieceFor(f, ci), `${f} s4`).toBe(NET_BASE[f] + 5);
      surround(ctx, f, 0b1011); flush(host);
      expect(T.pieceFor(f, ci), `${f} 三岔`).toBe(-1);
      surround(ctx, f, 0b0001); flush(host);                                 // 末端沿坡向
      setXter(state, C.x, C.y, 1); expect(T.pieceFor(f, ci)).toBe(NET_BASE[f] + 2);
      surround(ctx, f, 0); flush(host);                                      // 孤立：取坡向直线
      expect(T.pieceFor(f, ci)).toBe(NET_BASE[f] + 2);
      setXter(state, C.x, C.y, 5); expect(T.pieceFor(f, ci)).toBe(-1);      // 两角坡
      setXter(state, C.x, C.y, 0x3e); expect(T.pieceFor(f, ci)).toBe(-1);   // 瀑布 → 13
      setXter(state, C.x, C.y, 0);
    }
    // 地下族与坡面无关
    setXter(state, C.x, C.y, 7);
    expect(T.pieceFor('subway', ci)).toBe(NET_BASE.subway + 0);
    expect(T.pieceFor('pipe', ci)).toBe(NET_BASE.pipe + 14);
    setXter(state, C.x, C.y, 0);
    // 坡面上不能放交叉件
    lay(ctx, C.x, C.y, NET_BASE.power + 1); surround(ctx, 'road', 0b1010); flush(host);
    setXter(state, C.x, C.y, 2);
    expect(T.pieceFor('road', ci)).toBe(-1);
  });
  it('铁路坡脚半高件：低端朝向本格的坡面件 → 0x3B..0x3E；两侧都爬 / 坡脚路口 / 连续坡面 → −1', () => {
    const { ctx, host, T, state } = mk();
    // 上方 (40,39) 为 HT-B 坡（T 高，低端 B 朝向本格），本格向 B 延伸直线
    lay(ctx, C.x, C.y - 1, NET_BASE.rail + 2); lay(ctx, C.x, C.y + 1, NET_BASE.rail + 1); flush(host);
    expect(T.pieceFor('rail', ci)).toBe(0x3b);
    lay(ctx, C.x, C.y - 1, NET_BASE.rail + 4); flush(host);                 // T-HB：高端朝向本格 → 普通直线
    expect(T.pieceFor('rail', ci)).toBe(NET_BASE.rail + 1);
    lay(ctx, C.x, C.y - 1, 0); lay(ctx, C.x, C.y + 1, 0);
    lay(ctx, C.x + 1, C.y, NET_BASE.rail + 3); lay(ctx, C.x - 1, C.y, NET_BASE.rail); flush(host);   // 右侧 L-HR（R 高，低端 L 朝本格）
    expect(T.pieceFor('rail', ci)).toBe(0x3c);
    lay(ctx, C.x - 1, C.y, NET_BASE.rail + 5); flush(host);                 // 左侧 HL-R（低端 R 朝本格）：两侧都要爬 → −1
    expect(T.pieceFor('rail', ci)).toBe(-1);
    lay(ctx, C.x - 1, C.y, 0); lay(ctx, C.x, C.y + 1, NET_BASE.rail); flush(host);   // 坡脚成了路口（R + B）
    expect(T.pieceFor('rail', ci)).toBe(-1);
    lay(ctx, C.x, C.y + 1, 0); flush(host);
    setXter(state, C.x, C.y, 2);                                            // 本格也是坡面且相邻坡面 → 连续坡面非法
    expect(T.pieceFor('rail', ci)).toBe(-1);
    setXter(state, C.x, C.y, 0);
    lay(ctx, C.x + 1, C.y, 0); flush(host);
    // 道路允许连续坡面
    lay(ctx, C.x, C.y - 1, NET_BASE.road + 2); setXter(state, C.x, C.y, 1); flush(host);
    expect(T.pieceFor('road', ci)).toBe(NET_BASE.road + 2);
  });
});
