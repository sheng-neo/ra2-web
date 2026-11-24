import { gzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { gunzipIfNeeded } from './load-city';

describe('gunzipIfNeeded', () => {
  const text = new TextEncoder().encode('{"format":"central-city"}');

  it('gzip 字节（1f 8b 开头）解压回原文', async () => {
    const gz = new Uint8Array(gzipSync(text));
    expect([...(await gunzipIfNeeded(gz))]).toEqual([...text]);
  });

  it('未压缩（或宿主已按 Content-Encoding 解过压）的原样返回', async () => {
    expect(await gunzipIfNeeded(text)).toBe(text);
  });
});
