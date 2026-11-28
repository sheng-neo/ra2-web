import { describe, expect, it } from 'vitest';
import { canopyArrays } from './canopies';

// 沿 y = 0 的南墙（x 0 → 100 dm），伸出 20 dm（外法线 = 右手侧 = −y），顶面 90 dm、厚 30 cm
const REC = [0, 0, 100, 0, 20, 90, 30, 0x808080, 0x404040, 0xc0c0c0];

describe('canopyArrays', () => {
  it('薄板 + 檐口板（复审修正）：9 个面 = 36 顶点、54 个索引；檐口顶 9 m、雨篷底 8.7 m、薄板顶 8.9 m，伸到 y = −2 m（檐口板厚 8 cm）', () => {
    const a = canopyArrays([REC]);
    expect(a.position.length / 3).toBe(36);
    expect(a.index.length).toBe(54);
    const ys = new Set<number>();
    const zs = new Set<number>();
    for (let i = 0; i < a.position.length; i += 3) {
      ys.add(Math.round(a.position[i + 1]! * 100) / 100);
      zs.add(Math.round(a.position[i + 2]! * 100) / 100); // three z = −sim y
    }
    expect([...ys].sort()).toEqual([8.7, 8.9, 9]);
    expect([...zs].sort((p, q) => p - q)).toEqual([0, 1.92, 2]);
    // 没有檐口照片：aHires 页号全是 −1
    for (let i = 2; i < a.hires.length; i += 4) expect(a.hires[i]).toBe(-1);
  });
  it('檐口四角带 aHires（只有檐口那 4 个顶点）；长度 < 0.1 m 或不伸出的记录跳过', () => {
    const f = [
      [0.1, 0.5, 3, 24],
      [0.2, 0.5, 3, 24],
      [0.2, 0.4, 3, 24],
      [0.1, 0.4, 3, 24],
    ] as const;
    const a = canopyArrays([{ rec: REC, fascia: f }]);
    const pages = [];
    for (let i = 2; i < a.hires.length; i += 4) pages.push(a.hires[i]);
    expect(pages.filter((p) => p === 3).length).toBe(4);
    expect(canopyArrays([[0, 0, 0, 0, 20, 90, 30, 0, 0, 0], [0, 0, 100, 0, 0, 90, 30, 0, 0, 0]]).index.length).toBe(0);
  });
});
