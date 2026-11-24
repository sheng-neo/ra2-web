import { describe, expect, it } from 'vitest';
import { BLOOM_THRESHOLD, EMISSIVE, GLSL_TONEMAP_BODY, LIGHT_HEX, WHITE_BALANCE, lightColour, readParam, registerTextureBytes, streetWarmth, textureBytes, urlTier } from './lighting';

const loc = (search: string, hash: string) => ({ search, hash });

describe('realism contract v1', () => {
  it('readParam 同时认 ?query 与 #hash 令牌', () => {
    expect(readParam('q', loc('?q=low', ''))).toBe('low');
    expect(readParam('q', loc('', '#q-low'))).toBe('low');
    expect(readParam('perf', loc('', '#q-low&perf'))).toBe('1');
    expect(readParam('view', loc('', '#view-statue,t-21.5'))).toBe('statue');
    expect(readParam('t', loc('', '#view-statue,t-21.5'))).toBe('21.5');
    expect(readParam('perf', loc('?perf=1', ''))).toBe('1');
    expect(readParam('perf', loc('', '#q-low'))).toBeNull();
    expect(urlTier(loc('', '#q-high'))).toBe('high');
    expect(urlTier(loc('?q=medium', ''))).toBeNull();
  });

  it('readParam：hash 里坏的 % 转义不抛错（照原样读）', () => {
    expect(() => readParam('q', loc('', '#q-low&50%'))).not.toThrow();
    expect(readParam('q', loc('', '#q-low&50%'))).toBe('low');
    expect(readParam('x', loc('', '#x-%E0%A4%A'))).toBe('%E0%A4%A');
  });

  it('贴图内存登记：同名覆盖、0 删除', () => {
    const base = textureBytes();
    registerTextureBytes('test:a', 1000);
    registerTextureBytes('test:a', 2000);
    registerTextureBytes('test:b', 500);
    expect(textureBytes() - base).toBe(2500);
    registerTextureBytes('test:a', 0);
    registerTextureBytes('test:b', 0);
    expect(textureBytes()).toBe(base);
  });

  it('streetWarmth：核心偏白光、半山与上环偏钠灯、范围 0–0.9', () => {
    const core = streetWarmth(450, 0, 5);
    const harbour = streetWarmth(400, 450, 3);
    const midLevels = streetWarmth(-400, -360, 115);
    const sheungWan = streetWarmth(-450, 300, 5);
    expect(harbour).toBeLessThan(core);
    expect(core).toBeLessThan(0.4);
    expect(midLevels).toBeGreaterThan(0.7);
    expect(sheungWan).toBeGreaterThan(core);
    for (const v of [core, harbour, midLevels, sheungWan]) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(0.9);
    }
  });

  it('光源色亮度归一', () => {
    for (const name of Object.keys(LIGHT_HEX)) {
      const c = lightColour(name);
      expect(0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b).toBeCloseTo(1, 5);
    }
  });

  it('亮度标尺：区间有序；整窗平均与路面低于 bloom 阈值，点光源高于阈值', () => {
    for (const [lo, hi] of Object.values(EMISSIVE)) expect(lo).toBeLessThan(hi);
    expect(EMISSIVE.windowOffice[1]).toBeLessThan(BLOOM_THRESHOLD);
    expect(EMISSIVE.windowResidential[1]).toBeLessThan(BLOOM_THRESHOLD);
    expect(EMISSIVE.roadUnderLamp[1]).toBeLessThan(BLOOM_THRESHOLD);
    expect(EMISSIVE.sky[1]).toBeLessThan(0.1);
    expect(EMISSIVE.roof[1]).toBeLessThan(EMISSIVE.roadUnderLamp[0]);
    for (const k of ['lampHead', 'headlight', 'aviation', 'signNeon'] as const) expect(EMISSIVE[k][0]).toBeGreaterThan(BLOOM_THRESHOLD);
  });

  it('白平衡是 ≤ ±5 % 的全局调色，并已写进 tone mapping 函数体', () => {
    for (const v of WHITE_BALANCE) expect(Math.abs(v - 1)).toBeLessThanOrEqual(0.05);
    expect(GLSL_TONEMAP_BODY).toContain(`vec3(${WHITE_BALANCE.map((v) => v.toFixed(3)).join(', ')})`);
  });
});
