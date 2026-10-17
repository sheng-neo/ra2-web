// WP14 验收：spec:file-formats §3.5.4 三个手工夹具（默认先出现者 / 'last' / allowUnpaddedOddRuns）+ 索引与行编码的边界（§4.11–§4.14）。
// 夹具全部由代码构造（§3.5.4 的字节序列是规格里手工写出的示例，合成夹具来自 __fixtures__/synth.ts），不含任何原版文件内容。
import { describe, expect, it } from 'vitest';
import { LARGE_FLAT_ID, decodeAll, decodeSprite, parseSpriteArchive } from './archive';
import { AssetFormatError } from './bytes';
import { TRANSPARENT, buildArchiveBytes, compareGrid, encodeSpriteRows, entryOf, gridOf, synthSpriteSet, tileDiamond } from './__fixtures__/synth';

// §3.5.4 目标精灵：ID 1001，4×3；A=0x21 B=0x22 C=0x23
const SPEC_ROWS = [
  0x06, 0x01, 0x01, 0x03, 0x02, 0x04, 0x21, 0x21,                               // 行0：跳 1，画 2
  0x0a, 0x01, 0x01, 0x04, 0x22, 0x00, 0x02, 0x03, 0x01, 0x04, 0x23, 0x00,       // 行1：画 1（填充）跳 2 画 1（填充）
  0x00, 0x01,                                                                   // 行2：空行
  0x00, 0x02,                                                                   // 结束
];
const SPEC_FILE = new Uint8Array([0x00, 0x01, 0x03, 0xe9, 0x00, 0x00, 0x00, 0x0c, 0x00, 0x03, 0x00, 0x04, ...SPEC_ROWS]);
const SPEC_OPAQUE = [0, 1, 1, 0, 1, 0, 0, 1, 0, 0, 0, 0];
const SPEC_INDEX = [0, 0x21, 0x21, 0, 0x22, 0, 0, 0x23, 0, 0, 0, 0];
/** 第二份 1001：2×1 全不透明、字节不同。 */
const SECOND_2X1 = new Uint8Array([0x04, 0x01, 0x02, 0x04, 0x31, 0x32, 0x00, 0x02]);

describe('parseSpriteArchive / decodeSprite（§3.5.4 手工夹具）', () => {
  it('夹具 1：36 字节文件解出 4×3 的 index / opaque', () => {
    expect(SPEC_FILE.length).toBe(36);
    const r = parseSpriteArchive(SPEC_FILE.buffer, 'SMALLMED');
    expect(r.diagnostics).toEqual([]);
    const e = r.value.entries.get(1001)!;
    expect(e).toMatchObject({ id: 1001, offset: 12, width: 4, height: 3, length: 24, order: 0 });
    const d = decodeSprite(r.value, e);
    expect(d.diagnostics).toEqual([]);
    expect(Array.from(d.value.opaque)).toEqual(SPEC_OPAQUE);
    expect(Array.from(d.value.index)).toEqual(SPEC_INDEX);
  });

  it('夹具 2：同 ID 两次，默认取先出现者；duplicates 记 identical=false；policy last 取后者', () => {
    const buf = buildArchiveBytes([{ id: 1001, w: 4, h: 3, data: new Uint8Array(SPEC_ROWS) }, { id: 1001, w: 2, h: 1, data: SECOND_2X1 }]);
    const first = parseSpriteArchive(buf, 'SMALLMED');
    expect(first.value.entries.size).toBe(1);
    expect(first.value.duplicates).toHaveLength(1);
    expect(first.value.duplicates[0]!.identical).toBe(false);
    expect(first.value.duplicates[0]!.kept.order).toBe(0);
    expect(first.diagnostics.map((d) => [d.code, d.level])).toEqual([['DUPLICATE_SPRITE_ID', 'warn']]);
    const d1 = decodeSprite(first.value, first.value.entries.get(1001)!).value;
    expect([d1.w, d1.h]).toEqual([4, 3]);
    expect(Array.from(d1.opaque)).toEqual(SPEC_OPAQUE);

    const last = parseSpriteArchive(buf, 'SMALLMED', { duplicatePolicy: 'last' });
    const d2 = decodeSprite(last.value, last.value.entries.get(1001)!).value;
    expect([d2.w, d2.h]).toEqual([2, 1]);
    expect(Array.from(d2.index)).toEqual([0x31, 0x32]);
    expect(Array.from(d2.opaque)).toEqual([1, 1]);
    expect(last.value.duplicates[0]!.kept.order).toBe(1);
  });

  it('夹具 2b：字节完全相同的重复条目 identical=true、诊断为 info', () => {
    const rows = new Uint8Array(SPEC_ROWS);
    const buf = buildArchiveBytes([{ id: 1001, w: 4, h: 3, data: rows }, { id: 1001, w: 4, h: 3, data: rows }]);
    const r = parseSpriteArchive(buf, 'SMALLMED');
    expect(r.value.duplicates[0]!.identical).toBe(true);
    expect(r.diagnostics.map((d) => [d.code, d.level])).toEqual([['DUPLICATE_SPRITE_ID', 'info']]);
  });

  it('夹具 3：无填充的奇数 mode 4（MIF 路径）需要 allowUnpaddedOddRuns', () => {
    const g = gridOf(4, 1, (x) => (x === 0 ? 0x22 : x === 3 ? 0x23 : TRANSPARENT));
    const data = encodeSpriteRows(g, { unpadded: true });
    expect(Array.from(data)).toEqual([0x08, 0x01, 0x01, 0x04, 0x22, 0x02, 0x03, 0x01, 0x04, 0x23, 0x00, 0x02]);
    const buf = buildArchiveBytes([{ id: 7, w: 4, h: 1, data }]);
    const a = parseSpriteArchive(buf, 'SMALLMED').value;
    const ok = decodeSprite(a, a.entries.get(7)!, { allowUnpaddedOddRuns: true });
    expect(compareGrid(g, ok.value.index, ok.value.opaque)).toBeNull();
    const bad = decodeSprite(a, a.entries.get(7)!);
    expect(compareGrid(g, bad.value.index, bad.value.opaque)).not.toBeNull();
  });
});

describe('索引解析边界（§2.6.1 / §4.12）', () => {
  it('头部截断抛 SPRITE_HEADER_TRUNCATED；越界条目记 BAD_ENTRY 并跳过', () => {
    const tooShort = new Uint8Array([0x00, 0x05, 0, 0, 0, 0]);
    expect(() => parseSpriteArchive(tooShort.buffer, 'LARGE')).toThrowError(AssetFormatError);
    try { parseSpriteArchive(tooShort.buffer, 'LARGE'); } catch (e) { expect((e as AssetFormatError).code).toBe('SPRITE_HEADER_TRUNCATED'); }
    // 两条索引：一条 offset 超出文件、一条 width 0；再加一条合法
    const good = { id: 1001, w: 4, h: 3, data: new Uint8Array(SPEC_ROWS) };
    const buf = buildArchiveBytes([good]);
    const bytes = new Uint8Array(buf);
    const w = new Uint8Array(2 + 10 * 3 + SPEC_ROWS.length);
    w[0] = 0; w[1] = 3;
    w.set(bytes.subarray(2, 12), 2);                                   // 合法条目（offset 需要修正为新头长 32）
    const dv = new DataView(w.buffer);
    dv.setUint32(4, 32, false);
    dv.setUint16(12, 1002, false); dv.setUint32(14, 9999, false); dv.setUint16(18, 3, false); dv.setUint16(20, 4, false);   // offset 越界
    dv.setUint16(22, 1003, false); dv.setUint32(24, 32, false); dv.setUint16(28, 3, false); dv.setUint16(30, 0, false);     // width 0
    w.set(new Uint8Array(SPEC_ROWS), 32);
    const r = parseSpriteArchive(w.buffer, 'SMALLMED');
    expect(r.value.badEntries).toBe(2);
    expect(r.diagnostics.filter((d) => d.code === 'BAD_ENTRY')).toHaveLength(2);
    expect([...r.value.entries.keys()]).toEqual([1001]);
    const d = decodeSprite(r.value, r.value.entries.get(1001)!).value;
    expect(Array.from(d.opaque)).toEqual(SPEC_OPAQUE);
  });

  it('索引顺序与偏移顺序无关、条目间有填充：长度按"下一偏移 − 本偏移"计算', () => {
    const grids = [gridOf(5, 4, (x, y) => ((x + y) & 1 ? 9 : TRANSPARENT)), tileDiamond('medium', 50, 51, 3), gridOf(3, 3, () => 200)];
    const entries = grids.map((g, k) => entryOf(10 + k, g, { trailingJunk: k }));
    const buf = buildArchiveBytes(entries, { indexOrder: 'reverse', gap: 7 });
    const a = parseSpriteArchive(buf, 'SMALLMED').value;
    const sortedByOffset = [...a.entries.values()].sort((p, q) => p.offset - q.offset).map((e) => e.id);
    expect(sortedByOffset).toEqual([10, 11, 12]);
    for (let k = 0; k < 3; k++) {
      const e = a.entries.get(10 + k)!;
      expect(e.length).toBe(entries[k]!.data.length + 7);
      const d = decodeSprite(a, e);
      expect(d.diagnostics).toEqual([]);
      expect(compareGrid(grids[k]!, d.value.index, d.value.opaque)).toBeNull();
    }
  });

  it('LARGE 缺 1256 记 LARGE_SANITY；合成 LARGE 不记', () => {
    const noFlat = parseSpriteArchive(buildArchiveBytes([entryOf(1001, tileDiamond('large', 1, 2))]), 'LARGE');
    expect(noFlat.diagnostics.map((d) => d.code)).toContain('LARGE_SANITY');
    const synth = synthSpriteSet();
    const r = parseSpriteArchive(synth.large, 'LARGE');
    expect(r.diagnostics.map((d) => d.code)).not.toContain('LARGE_SANITY');
    expect(r.value.entries.get(LARGE_FLAT_ID)).toMatchObject({ width: 32, height: 17 });
  });
});

describe('像素行编码边界（§2.6.2 / §4.12–§4.14）', () => {
  const g = gridOf(6, 5, (x, y) => (y === 0 || y === 1 ? (x < 3 ? 0 : TRANSPARENT) : TRANSPARENT));   // 前两行左 3 px 为索引 0（合法黑）
  it('索引 0 是合法像素、MIF 风格结束行 02 01 02 02、height 之前提前结束、结束块后的垃圾', () => {
    for (const opts of [{}, { mifEnd: true }, { noEnd: true }, { trailingJunk: 9 }, { mifEnd: true, trailingJunk: 3 }]) {
      const buf = buildArchiveBytes([entryOf(1, g, opts)]);
      const a = parseSpriteArchive(buf, 'SMALLMED').value;
      const d = decodeSprite(a, a.entries.get(1)!);
      expect(d.diagnostics, JSON.stringify(opts)).toEqual([]);
      expect(compareGrid(g, d.value.index, d.value.opaque), JSON.stringify(opts)).toBeNull();
    }
    // 只有两行就结束（height 5）：其余行透明
    const twoRows = new Uint8Array([0x06, 0x01, 0x03, 0x04, 0x00, 0x00, 0x00, 0x00, 0x06, 0x01, 0x03, 0x04, 0x00, 0x00, 0x00, 0x00, 0x00, 0x02]);
    const a = parseSpriteArchive(buildArchiveBytes([{ id: 1, w: 6, h: 5, data: twoRows }]), 'SMALLMED').value;
    const d = decodeSprite(a, a.entries.get(1)!);
    expect(compareGrid(g, d.value.index, d.value.opaque)).toBeNull();
  });

  it('mode 4 超出宽度记 ROW_OVERFLOW 并裁剪；mode 0 空块被忽略；未知 mode 记 BAD_MODE', () => {
    const overflow = new Uint8Array([0x08, 0x01, 0x06, 0x04, 1, 2, 3, 4, 5, 6, 0x00, 0x02]);
    const a = parseSpriteArchive(buildArchiveBytes([{ id: 1, w: 4, h: 1, data: overflow }]), 'SMALLMED').value;
    const d = decodeSprite(a, a.entries.get(1)!);
    expect(d.diagnostics.map((x) => x.code)).toEqual(['ROW_OVERFLOW']);
    expect(Array.from(d.value.index)).toEqual([1, 2, 3, 4]);
    const withEmpty = new Uint8Array([0x08, 0x01, 0x00, 0x00, 0x01, 0x03, 0x02, 0x04, 7, 8, 0x00, 0x02]);
    const b = parseSpriteArchive(buildArchiveBytes([{ id: 1, w: 4, h: 1, data: withEmpty }]), 'SMALLMED').value;
    const e = decodeSprite(b, b.entries.get(1)!);
    expect(e.diagnostics).toEqual([]);
    expect(Array.from(e.value.index)).toEqual([0, 7, 8, 0]);
    expect(Array.from(e.value.opaque)).toEqual([0, 1, 1, 0]);
    const badMode = new Uint8Array([0x06, 0x01, 0x01, 0x09, 0x02, 0x04, 7, 8, 0x04, 0x01, 0x02, 0x04, 5, 6, 0x00, 0x02]);
    const c = parseSpriteArchive(buildArchiveBytes([{ id: 1, w: 4, h: 2, data: badMode }]), 'SMALLMED').value;
    const f = decodeSprite(c, c.entries.get(1)!);
    expect(f.diagnostics.map((x) => x.code)).toEqual(['BAD_MODE']);
    expect(Array.from(f.value.index.subarray(4, 6))).toEqual([5, 6]);   // 第二行不受第一行坏块影响
  });
});

describe('合成三档精灵集往返', () => {
  it('SMALLMED / LARGE / SPECIAL 每个精灵解码后与原始网格逐像素一致', () => {
    const s = synthSpriteSet();
    let checked = 0;
    for (const [buf, kind, grids] of [[s.smallmed, 'SMALLMED', s.fileGrids.smallmed], [s.large, 'LARGE', s.fileGrids.large], [s.special, 'SPECIAL', s.fileGrids.special]] as const) {
      const a = parseSpriteArchive(buf, kind);
      expect(a.diagnostics.filter((d) => d.level !== 'info')).toEqual([]);
      const all = decodeAll(a.value);
      expect(all.diagnostics).toEqual([]);
      expect(all.value.size).toBe(grids.size);
      for (const [id, d] of all.value) {
        const g = grids.get(id)!;
        expect(g, `${kind}:${id}`).toBeDefined();
        expect(compareGrid(g, d.index, d.opaque), `${kind}:${id}`).toBeNull();
        checked++;
      }
    }
    expect(checked).toBe(74 * 3 + 2);
  });
});
