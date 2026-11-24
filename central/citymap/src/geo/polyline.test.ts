import { describe, expect, it } from 'vitest';
import { clipPolyline, samplePolyline, slicePolyline } from './polyline';

describe('polyline', () => {
  it('按长度比例截取，插值点取整', () => {
    expect(slicePolyline([0, 0, 100, 0, 100, 100], 0.25, 0.75)).toEqual([50, 0, 100, 0, 100, 50]);
  });

  it('裁剪到矩形：穿出再穿入时断成两段', () => {
    const pieces = clipPolyline([-50, 10, 50, 10, 150, 10, 150, 90, 50, 90], [0, 0, 100, 100]);
    expect(pieces).toEqual([[0, 10, 50, 10, 100, 10], [100, 90, 50, 90]]);
  });

  it('完全在外的折线没有输出', () => {
    expect(clipPolyline([200, 200, 300, 300], [0, 0, 100, 100])).toEqual([]);
  });

  it('等距采样含起点，跨顶点连续计距', () => {
    expect(samplePolyline([0, 0, 30, 0, 30, 30], 20)).toEqual([0, 0, 20, 0, 30, 10, 30, 30]);
  });
});
