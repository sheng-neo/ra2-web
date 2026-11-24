import { describe, expect, it } from 'vitest';
import { FacadeMode, NO_BLDG, RND_STEPS, facadeKey, facadeVertex, newFacadeArrays, styleCode } from './facade';

describe('styleCode / facadeKey', () => {
  it('逐栋随机数量化成 1/4096：float32 精确可表示，shader 读到的值与 TS 相同', () => {
    for (const mode of [FacadeMode.Windows, FacadeMode.Office, FacadeMode.Plant]) {
      for (let k = 0; k < RND_STEPS; k += 37) {
        const s = styleCode(255, mode, (k + 0.5) / RND_STEPS);
        expect(Math.fround(s)).toBe(s);
        expect(Math.floor(s / 256)).toBe(mode);
        expect(Math.floor(s) % 256).toBe(255);
      }
    }
  });

  it('楼键 = seed × 4099 + floor(rnd × 4093)，在 float32 下逐位相同、互不相同', () => {
    const keys = new Set<number>();
    for (let k = 0; k < RND_STEPS; k++) {
      const s = styleCode(17, FacadeMode.Office, k / RND_STEPS);
      const rnd = s - Math.floor(s);
      // GLSL：int(rnd * 4093.0)，rnd 与乘积在 float32 下都精确
      expect(Math.fround(rnd * 4093)).toBe(rnd * 4093);
      const key = facadeKey(s);
      expect(key).toBe(17 * 4099 + Math.floor(rnd * 4093));
      keys.add(key);
    }
    expect(keys.size).toBeGreaterThan(4000);
  });
});

describe('facadeVertex', () => {
  it('aBldg 缺省为全 0（旧调用方兼容），给了就照写', () => {
    const m = newFacadeArrays();
    facadeVertex(m, 0, 0, 0, 0, 0, 1, 1, 2, 3, styleCode(0, FacadeMode.Windows, 0));
    facadeVertex(m, 0, 0, 0, 0, 0, 1, 1, 2, 3, 0, [4, 0.5, 12, 8]);
    expect(m.layout.map((a) => a.name)).toEqual(['position', 'normal', 'aFacade', 'aBldg']);
    expect(m.data[3]!.slice(0, 4)).toEqual([...NO_BLDG]);
    expect(m.data[3]!.slice(4, 8)).toEqual([4, 0.5, 12, 8]);
  });
});
