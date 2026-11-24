import { describe, expect, it } from 'vitest';
import { sha256Hex } from '../geo/hash';
import { verifySnapshot, type SourcesManifest } from './snapshot';

function manifest(files: Record<string, string>): SourcesManifest {
  return {
    dataset: 'test',
    release: 'r',
    attribution: [],
    files: Object.entries(files).map(([file, content]) => ({
      file,
      layer: file,
      s3: '',
      release: 'r',
      licenses: [],
      sha256: sha256Hex(content),
      bytes: content.length,
      rows: 0,
      fetched: '2026-11-24',
      bbox: { west: 0, south: 0, east: 1, north: 1, crs: 'EPSG:4326' },
    })),
  };
}

const enc = (s: string): Uint8Array => new TextEncoder().encode(s);

describe('verifySnapshot', () => {
  it('内容一致时给出与文件顺序无关的摘要', () => {
    const m = manifest({ 'a.parquet': 'AAA', 'b.parquet': 'BBB' });
    const files = new Map([['a.parquet', enc('AAA')], ['b.parquet', enc('BBB')]]);
    const d1 = verifySnapshot(m, files);
    const d2 = verifySnapshot({ ...m, files: [...m.files].reverse() }, files);
    expect(d1).toMatch(/^[0-9a-f]{64}$/);
    expect(d2).toBe(d1);
  });

  it('文件被改动或缺失时报错', () => {
    const m = manifest({ 'a.parquet': 'AAA' });
    expect(() => verifySnapshot(m, new Map([['a.parquet', enc('AAB')]]))).toThrow(/sha256/);
    expect(() => verifySnapshot(m, new Map())).toThrow(/缺少/);
  });
});
