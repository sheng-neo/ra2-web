import { describe, expect, it } from 'vitest';
import type { Rail } from '@central/data';
import { isCorridorWall, nearestTrack, trackIndex } from './corridor';

// 轨道沿 x 轴（dm）：(-1000, 0) → (2000, 0) 米
const rails: Rail[] = [
  { id: 't', kind: 'tram', pts: [-10000, 0, 20000, 0] },
  { id: 'f', kind: 'funicular', pts: [0, 500, 0, 900] },
];

describe('电车走廊墙', () => {
  const ix = trackIndex(rails);
  it('只收电车轨道', () => {
    expect(ix.segs.length).toBe(4);
  });
  it('最近距离与方向', () => {
    const n = nearestTrack(ix, 50, 12, 30)!;
    expect(n.d).toBeCloseTo(12);
    expect(n.dy).toBeCloseTo(-1);
    expect(nearestTrack(ix, 50, 45, 30)).toBeNull();
  });
  it('面向轨道、30 m 内的墙才算', () => {
    // 轨道北侧 12 m 一面朝南的墙（外法线 (0, -1)）
    expect(isCorridorWall(ix, 40, 12, 60, 12, 0, -1)).toBe(true);
    // 同一位置朝北（背对轨道）
    expect(isCorridorWall(ix, 40, 12, 60, 12, 0, 1)).toBe(false);
    // 40 m 外
    expect(isCorridorWall(ix, 40, 40, 60, 40, 0, -1)).toBe(false);
    // 侧墙（外法线朝东，轨道在南）：夹角 90°，不算
    expect(isCorridorWall(ix, 50, 10, 50, 20, 1, 0)).toBe(false);
  });
});
