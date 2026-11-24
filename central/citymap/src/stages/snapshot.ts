/**
 * 00-snapshot：按 sources.json 读入原始快照文件，逐个校验 sha256，算出 inputsDigest。
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { sha256Hex } from '../geo/hash';

/** sources.json 里的一个文件（由 fetch/overture_fetch.py 写）。 */
export interface SnapshotFileEntry {
  file: string;
  layer: string;
  s3: string;
  release: string;
  licenses: string[];
  sha256: string;
  bytes: number;
  rows: number;
  /** 抓取日期 YYYY-MM-DD。 */
  fetched: string;
  bbox: { west: number; south: number; east: number; north: number; crs: string };
}

export interface SourcesManifest {
  dataset: string;
  release: string;
  attribution: string[];
  files: SnapshotFileEntry[];
}

export interface Snapshot {
  manifest: SourcesManifest;
  /** 文件名 → 已校验的内容。 */
  files: Map<string, Uint8Array>;
  /** 全部输入文件（名 + sha256，按名排序）的组合 sha256。 */
  inputsDigest: string;
}

/** 纯函数：校验文件内容与清单一致，返回组合摘要。不一致时抛错。 */
export function verifySnapshot(manifest: SourcesManifest, files: ReadonlyMap<string, Uint8Array>): string {
  const lines: string[] = [];
  for (const entry of manifest.files) {
    const bytes = files.get(entry.file);
    if (!bytes) throw new Error(`快照缺少文件 ${entry.file}`);
    const actual = sha256Hex(bytes);
    if (actual !== entry.sha256) {
      throw new Error(`快照文件 ${entry.file} sha256 不符：期望 ${entry.sha256}，实际 ${actual}`);
    }
    lines.push(`${entry.file} ${entry.sha256}`);
  }
  lines.sort();
  return sha256Hex(lines.join('\n'));
}

/** 读 dir/sources.json 及其列出的全部文件并校验。 */
export function loadSnapshot(dir: string): Snapshot {
  const manifest = JSON.parse(readFileSync(path.join(dir, 'sources.json'), 'utf8')) as SourcesManifest;
  const files = new Map<string, Uint8Array>();
  for (const entry of manifest.files) files.set(entry.file, readFileSync(path.join(dir, entry.file)));
  return { manifest, files, inputsDigest: verifySnapshot(manifest, files) };
}
