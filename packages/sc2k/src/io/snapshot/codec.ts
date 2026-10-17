// ===== io/snapshot/codec.ts =====
// 通用快照 .sc2kweb 的最小编解码器（ARCHITECTURE §4.1 / §4.2、CONTRACTS §O）。WP0 落地，WP1 之后只做加法：接口与字节序此后不改。
//
// 文件布局：
//   magic "SC2KWEBS"(8 B ASCII) | u16 LE version | u32 LE headerLen | header(UTF-8 JSON) | 连续 payload
//   header = { schema: SNAPSHOT_VERSION, entries: [{ path, kind, len, bytes }] }   // entries 顺序 = SNAPSHOT_SCHEMA 声明顺序；bytes = 该条 payload 字节数
// 条目 payload（全部小端）：
//   u8 / u16 / i32：TypedArray 逐元素；scalars：SCALAR_FIELDS 顺序逐项 i32（bool → 0/1）；strings：STRING_FIELDS 顺序 u16 长度 + UTF-8；
//   priv：按 SYSTEM_ORDER（去 core）逐系统 1 字节存在标记 + 规范化值编码（键名按 UTF-16 码元排序、undefined 键视为不存在、整数 i32、
//         TypedArray 带类型标签逐元素小端；Map/Set/函数/null/非有限数/非整数/类实例/浮点数组 → 抛错）。
// hash(s, scope) = FNV-1a 32 over 同一遍历器输出、按 hash 标注过滤后的 payload 字节（scalars 逐项按 SCALAR_FIELDS[i].hash 过滤）。
// 本目录在 tsconfig.sim.json 内（无 DOM lib），因此 UTF-8 自己实现，不用 TextEncoder。
import type { Diagnostic, SystemId } from '../../contracts/system';
import { SYSTEM_ORDER } from '../../contracts/clock';
import { FNV_OFFSET, fnv1aBytes } from '../../contracts/prng';
import type { HashScope, ScalarField, SnapshotCodec, SnapshotSchemaEntry } from '../../contracts/snapshot';
import {
  BOND_SLOTS, PRIV_BUDGET_BYTES, SCALAR_FIELDS, SNAPSHOT_MAGIC, SNAPSHOT_SCHEMA, SNAPSHOT_VERSION, STRING_FIELDS, inHashScope, parsePath, stringFieldHash,
} from '../../contracts/snapshot';
import type { CityState, PrivState, PrivValue } from '../../contracts/state';
import { createCityState } from '../../contracts/state';

// ---------- UTF-8 ----------
export function utf8Encode(s: string): Uint8Array {
  let n = 0;
  for (let k = 0; k < s.length; k++) {
    const c = s.codePointAt(k)!;
    if (c > 0xffff) k++;
    n += c < 0x80 ? 1 : c < 0x800 ? 2 : c < 0x10000 ? 3 : 4;
  }
  const out = new Uint8Array(n);
  let p = 0;
  for (let k = 0; k < s.length; k++) {
    const c = s.codePointAt(k)!;
    if (c > 0xffff) k++;
    if (c < 0x80) out[p++] = c;
    else if (c < 0x800) { out[p++] = 0xc0 | (c >> 6); out[p++] = 0x80 | (c & 0x3f); }
    else if (c < 0x10000) { out[p++] = 0xe0 | (c >> 12); out[p++] = 0x80 | ((c >> 6) & 0x3f); out[p++] = 0x80 | (c & 0x3f); }
    else { out[p++] = 0xf0 | (c >> 18); out[p++] = 0x80 | ((c >> 12) & 0x3f); out[p++] = 0x80 | ((c >> 6) & 0x3f); out[p++] = 0x80 | (c & 0x3f); }
  }
  return out;
}
export function utf8Decode(b: Uint8Array): string {
  const cps: number[] = [];
  for (let k = 0; k < b.length;) {
    const x = b[k]!;
    let c: number, extra: number;
    if (x < 0x80) { c = x; extra = 0; }
    else if ((x & 0xe0) === 0xc0) { c = x & 0x1f; extra = 1; }
    else if ((x & 0xf0) === 0xe0) { c = x & 0x0f; extra = 2; }
    else if ((x & 0xf8) === 0xf0) { c = x & 0x07; extra = 3; }
    else { c = 0xfffd; extra = 0; }
    k++;
    for (let e = 0; e < extra; e++, k++) { const y = b[k]; if (y === undefined || (y & 0xc0) !== 0x80) { c = 0xfffd; break; } c = (c << 6) | (y & 0x3f); }
    cps.push(c);
  }
  let s = '';
  for (let k = 0; k < cps.length; k += 4096) s += String.fromCodePoint(...cps.slice(k, k + 4096));
  return s;
}

// ---------- 字节汇 ----------
interface Sink { u8(v: number): void; u16(v: number): void; i32(v: number): void; u32(v: number): void; bytes(b: Uint8Array): void }

class ByteWriter implements Sink {
  private buf: Uint8Array;
  private view: DataView;
  pos = 0;
  constructor(initial = 1 << 18) { this.buf = new Uint8Array(initial); this.view = new DataView(this.buf.buffer); }
  private ensure(n: number): void {
    if (this.pos + n <= this.buf.length) return;
    let size = this.buf.length * 2;
    while (size < this.pos + n) size *= 2;
    const next = new Uint8Array(size); next.set(this.buf.subarray(0, this.pos));
    this.buf = next; this.view = new DataView(next.buffer);
  }
  u8(v: number): void { this.ensure(1); this.buf[this.pos++] = v & 0xff; }
  u16(v: number): void { this.ensure(2); this.view.setUint16(this.pos, v & 0xffff, true); this.pos += 2; }
  i32(v: number): void { this.ensure(4); this.view.setInt32(this.pos, v | 0, true); this.pos += 4; }
  u32(v: number): void { this.ensure(4); this.view.setUint32(this.pos, v >>> 0, true); this.pos += 4; }
  bytes(b: Uint8Array): void { this.ensure(b.length); this.buf.set(b, this.pos); this.pos += b.length; }
  toBytes(): Uint8Array { return this.buf.slice(0, this.pos); }
}

class HashSink implements Sink {
  h = FNV_OFFSET;
  private readonly scratch = new Uint8Array(4);
  private readonly view = new DataView(this.scratch.buffer);
  u8(v: number): void { this.scratch[0] = v & 0xff; this.h = fnv1aBytes(this.h, this.scratch.subarray(0, 1)); }
  u16(v: number): void { this.view.setUint16(0, v & 0xffff, true); this.h = fnv1aBytes(this.h, this.scratch.subarray(0, 2)); }
  i32(v: number): void { this.view.setInt32(0, v | 0, true); this.h = fnv1aBytes(this.h, this.scratch); }
  u32(v: number): void { this.view.setUint32(0, v >>> 0, true); this.h = fnv1aBytes(this.h, this.scratch); }
  bytes(b: Uint8Array): void { this.h = fnv1aBytes(this.h, b); }
}

class ByteReader {
  pos = 0;
  private readonly view: DataView;
  constructor(private readonly buf: Uint8Array) { this.view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength); }
  get length(): number { return this.buf.length; }
  private need(n: number): void { if (this.pos + n > this.buf.length) throw new Error(`snapshot: 数据截断（需要 ${n} B，剩余 ${this.buf.length - this.pos} B）`); }
  u8(): number { this.need(1); return this.buf[this.pos++]!; }
  u16(): number { this.need(2); const v = this.view.getUint16(this.pos, true); this.pos += 2; return v; }
  i32(): number { this.need(4); const v = this.view.getInt32(this.pos, true); this.pos += 4; return v; }
  u32(): number { this.need(4); const v = this.view.getUint32(this.pos, true); this.pos += 4; return v; }
  bytes(n: number): Uint8Array { this.need(n); const v = this.buf.subarray(this.pos, this.pos + n); this.pos += n; return v; }
  sub(offset: number, length: number): ByteReader { return new ByteReader(this.buf.subarray(offset, offset + length)); }
}

// ---------- 路径访问 ----------
type Rec = Record<string | number, unknown>;
const INT32_MIN = -2147483648, INT32_MAX = 2147483647;
const isI32 = (v: number): boolean => Number.isInteger(v) && v >= INT32_MIN && v <= INT32_MAX;

function resolve(root: unknown, path: string): unknown {
  let cur: unknown = root;
  for (const seg of parsePath(path)) {
    if (cur === null || typeof cur !== 'object') return undefined;
    cur = (cur as Rec)[seg];
  }
  return cur;
}
/** 取父对象与末段键（写入用）；中间缺失 → undefined。 */
function resolveParent(root: unknown, path: string): { parent: Rec; key: string | number } | undefined {
  const segs = parsePath(path);
  let cur: unknown = root;
  for (let k = 0; k < segs.length - 1; k++) {
    if (cur === null || typeof cur !== 'object') return undefined;
    cur = (cur as Rec)[segs[k]!];
  }
  if (cur === null || typeof cur !== 'object') return undefined;
  return { parent: cur as Rec, key: segs[segs.length - 1]! };
}
const BOND_RE = /^economy\.bonds\[(\d+)\]\.(rateRaw|issuedYear|issuedMonth)$/;

/** 读一条标量为 i32（bool → 0/1；虚拟 bondCount；越界债券槽 → 0；非整数 / 超 i32 抛错）。 */
function readScalar(s: CityState, f: ScalarField): number {
  if (f.path === 'economy.bondCount') return s.economy.bonds.length;
  const m = BOND_RE.exec(f.path);
  if (m) {
    const bond = s.economy.bonds[Number(m[1])];
    return bond ? bond[m[2] as 'rateRaw' | 'issuedYear' | 'issuedMonth'] : 0;
  }
  const v = resolve(s, f.path);
  if (f.bool) {
    if (typeof v !== 'boolean') throw new Error(`snapshot: ${f.path} 应为 boolean，实际 ${typeof v}`);
    return v ? 1 : 0;
  }
  if (typeof v !== 'number' || !isI32(v)) throw new Error(`snapshot: ${f.path} 应为 i32 整数，实际 ${String(v)}`);
  return v;
}
/** 写一条标量（bondCount 先截断 / 补齐 bonds；k ≥ bondCount 的债券项忽略）。 */
function writeScalar(s: CityState, f: ScalarField, v: number): void {
  if (f.path === 'economy.bondCount') {
    const n = Math.max(0, Math.min(BOND_SLOTS, v | 0));
    const bonds = s.economy.bonds;
    bonds.length = Math.min(bonds.length, n);
    while (bonds.length < n) bonds.push({ rateRaw: 0, issuedYear: 0, issuedMonth: 0 });
    return;
  }
  const m = BOND_RE.exec(f.path);
  if (m) {
    const bond = s.economy.bonds[Number(m[1])];
    if (bond) bond[m[2] as 'rateRaw' | 'issuedYear' | 'issuedMonth'] = v;
    return;
  }
  const r = resolveParent(s, f.path);
  if (!r) throw new Error(`snapshot: 路径不存在 ${f.path}`);
  r.parent[r.key] = f.bool ? v !== 0 : v;
}

// ---------- priv 规范化编码 ----------
const T_INT = 0x01, T_STR = 0x02, T_BOOL = 0x03, T_ARR = 0x04, T_OBJ = 0x05;
const TYPED: ReadonlyArray<readonly [tag: number, ctor: new (n: number) => ArrayLike<number> & { [k: number]: number }, bytes: number, signed: boolean]> = [
  [0x10, Uint8Array, 1, false], [0x11, Int8Array, 1, true], [0x12, Uint16Array, 2, false], [0x13, Int16Array, 2, true], [0x14, Uint32Array, 4, false], [0x15, Int32Array, 4, true]];
const PRIV_IDS: readonly Exclude<SystemId, 'core'>[] = SYSTEM_ORDER.filter((id): id is Exclude<SystemId, 'core'> => id !== 'core');
const isPlainObject = (v: unknown): v is Rec => {
  if (v === null || typeof v !== 'object' || Array.isArray(v) || ArrayBuffer.isView(v)) return false;
  const proto: unknown = Object.getPrototypeOf(v);
  return proto === Object.prototype || proto === null;
};

function writeStr(sink: Sink, s: string): void { const b = utf8Encode(s); sink.u32(b.length); sink.bytes(b); }
function readStr(r: ByteReader): string { const n = r.u32(); return utf8Decode(r.bytes(n)); }

export function encodePrivValue(v: unknown, sink: Sink, path: string): void {
  switch (typeof v) {
    case 'number':
      if (!isI32(v)) throw new Error(`snapshot: priv 值必须是 i32 整数（${path} = ${String(v)}）`);
      sink.u8(T_INT); sink.i32(v); return;
    case 'string': sink.u8(T_STR); writeStr(sink, v); return;
    case 'boolean': sink.u8(T_BOOL); sink.u8(v ? 1 : 0); return;
    case 'object': break;
    default: throw new Error(`snapshot: priv 不允许 ${typeof v}（${path}）`);
  }
  if (v === null) throw new Error(`snapshot: priv 不允许 null（${path}）`);
  if (ArrayBuffer.isView(v)) {
    for (const [tag, ctor, nbytes, signed] of TYPED) {
      if (!(v instanceof ctor)) continue;
      const arr = v as unknown as ArrayLike<number>;
      sink.u8(tag); sink.u32(arr.length);
      if (nbytes === 1) { if (signed) for (let k = 0; k < arr.length; k++) sink.u8(arr[k]! & 0xff); else sink.bytes(v as Uint8Array); }
      else if (nbytes === 2) for (let k = 0; k < arr.length; k++) sink.u16(arr[k]!);
      else for (let k = 0; k < arr.length; k++) { if (signed) sink.i32(arr[k]!); else sink.u32(arr[k]!); }
      return;
    }
    throw new Error(`snapshot: priv 不允许该 TypedArray 类型（${path}: ${(v as object).constructor.name}）`);
  }
  if (Array.isArray(v)) {
    sink.u8(T_ARR); sink.u32(v.length);
    for (let k = 0; k < v.length; k++) encodePrivValue(v[k], sink, `${path}[${k}]`);
    return;
  }
  if (!isPlainObject(v)) throw new Error(`snapshot: priv 不允许类实例 / Map / Set（${path}: ${(v as object).constructor?.name ?? 'object'}）`);
  const keys = Object.keys(v).filter((k) => v[k] !== undefined).sort();
  sink.u8(T_OBJ); sink.u32(keys.length);
  for (const k of keys) { writeStr(sink, k); encodePrivValue(v[k], sink, `${path}.${k}`); }
}

export function decodePrivValue(r: ByteReader, path: string): PrivValue {
  const tag = r.u8();
  switch (tag) {
    case T_INT: return r.i32();
    case T_STR: return readStr(r);
    case T_BOOL: return r.u8() !== 0;
    case T_ARR: { const n = r.u32(); const out: PrivValue[] = new Array<PrivValue>(n); for (let k = 0; k < n; k++) out[k] = decodePrivValue(r, `${path}[${k}]`); return out; }
    case T_OBJ: { const n = r.u32(); const out: Record<string, PrivValue> = {}; for (let k = 0; k < n; k++) { const key = readStr(r); out[key] = decodePrivValue(r, `${path}.${key}`); } return out; }
    default: {
      const spec = TYPED.find((t) => t[0] === tag);
      if (!spec) throw new Error(`snapshot: priv 未知类型标签 0x${tag.toString(16)}（${path}）`);
      const [, ctor, nbytes, signed] = spec;
      const n = r.u32();
      const arr = new ctor(n);
      if (nbytes === 1) { const b = r.bytes(n); for (let k = 0; k < n; k++) arr[k] = signed ? (b[k]! << 24) >> 24 : b[k]!; }
      else if (nbytes === 2) for (let k = 0; k < n; k++) { const u = r.u16(); arr[k] = signed ? (u << 16) >> 16 : u; }
      else for (let k = 0; k < n; k++) arr[k] = signed ? r.i32() : r.u32();
      return arr as unknown as PrivValue;
    }
  }
}

// ---------- 条目编解码（唯一遍历器） ----------
function typedOf(s: CityState, e: SnapshotSchemaEntry): Uint8Array | Uint16Array | Int32Array {
  const arr = resolve(s, e.path);
  const ctor = e.kind === 'u8' ? Uint8Array : e.kind === 'u16' ? Uint16Array : Int32Array;
  if (!(arr instanceof ctor)) throw new Error(`snapshot: ${e.path} 应为 ${ctor.name}`);
  if (e.len !== undefined && arr.length !== e.len) throw new Error(`snapshot: ${e.path} 长度 ${arr.length} ≠ schema ${e.len}`);
  return arr as Uint8Array | Uint16Array | Int32Array;
}

/** 把一条 schema 项的 payload 写入 sink；scope 给出时为哈希遍历（对 scalars / strings 逐项过滤；其它条目由调用方整体过滤）。 */
function encodeEntry(s: CityState, e: SnapshotSchemaEntry, sink: Sink, scope?: HashScope): void {
  switch (e.kind) {
    case 'u8': sink.bytes(typedOf(s, e) as Uint8Array); return;
    case 'u16': { const a = typedOf(s, e); for (let k = 0; k < a.length; k++) sink.u16(a[k]!); return; }
    case 'i32': { const a = typedOf(s, e); for (let k = 0; k < a.length; k++) sink.i32(a[k]!); return; }
    case 'scalars':
      for (const f of SCALAR_FIELDS) { if (scope !== undefined && !inHashScope(f.hash, scope)) continue; sink.i32(readScalar(s, f)); }
      return;
    case 'strings':
      for (const p of STRING_FIELDS) {
        if (scope !== undefined && !inHashScope(stringFieldHash(p), scope)) continue;
        const v = resolve(s, p);
        if (typeof v !== 'string') throw new Error(`snapshot: ${p} 应为 string`);
        const b = utf8Encode(v);
        if (b.length > 0xffff) throw new Error(`snapshot: ${p} 超过 65535 字节`);
        sink.u16(b.length); sink.bytes(b);
      }
      return;
    case 'priv':
      for (const id of PRIV_IDS) {
        const p = s.priv[id];
        if (p === undefined) { sink.u8(0); continue; }
        if (!isPlainObject(p)) throw new Error(`snapshot: priv.${id} 必须是普通对象（PrivState）`);
        sink.u8(1); encodePrivValue(p, sink, `priv.${id}`);
      }
      return;
  }
}

/** 从 reader 解码一条 schema 项写回 into；fileLen = header 记录的 len（与 schema 不符 → 抛错，由调用方降级为默认）。 */
function decodeEntry(into: CityState, e: SnapshotSchemaEntry, r: ByteReader, fileLen: number | undefined): void {
  switch (e.kind) {
    case 'u8': { const a = typedOf(into, e); if (fileLen !== a.length) throw new Error('len'); a.set(r.bytes(a.length)); return; }
    case 'u16': { const a = typedOf(into, e); if (fileLen !== a.length) throw new Error('len'); for (let k = 0; k < a.length; k++) a[k] = r.u16(); return; }
    case 'i32': { const a = typedOf(into, e); if (fileLen !== a.length) throw new Error('len'); for (let k = 0; k < a.length; k++) a[k] = r.i32(); return; }
    case 'scalars':
      if (fileLen !== SCALAR_FIELDS.length) throw new Error('len');
      for (const f of SCALAR_FIELDS) writeScalar(into, f, r.i32());
      return;
    case 'strings':
      if (fileLen !== STRING_FIELDS.length) throw new Error('len');
      for (const p of STRING_FIELDS) {
        const n = r.u16(); const v = utf8Decode(r.bytes(n));
        const t = resolveParent(into, p); if (t) t.parent[t.key] = v;
      }
      return;
    case 'priv': {
      for (const k of Object.keys(into.priv)) delete (into.priv as Rec)[k];
      for (const id of PRIV_IDS) {
        if (r.u8() === 0) continue;
        const v = decodePrivValue(r, `priv.${id}`);
        if (!isPlainObject(v)) throw new Error(`snapshot: priv.${id} 不是对象`);
        into.priv[id] = v as unknown as PrivState;
      }
      return;
    }
  }
}

// ---------- 文件级 ----------
interface HeaderEntry { path: string; kind: string; len?: number; bytes: number }
interface Header { schema: number; entries: HeaderEntry[] }
const MAGIC_BYTES = utf8Encode(SNAPSHOT_MAGIC);

export function encodeSnapshot(s: CityState): Uint8Array {
  const payload = new ByteWriter();
  const entries: HeaderEntry[] = [];
  for (const e of SNAPSHOT_SCHEMA) {
    const start = payload.pos;
    encodeEntry(s, e, payload);
    const he: HeaderEntry = { path: e.path, kind: e.kind, bytes: payload.pos - start };
    if (e.len !== undefined) he.len = e.len;
    entries.push(he);
  }
  const header = utf8Encode(JSON.stringify({ schema: SNAPSHOT_VERSION, entries } satisfies Header));
  const out = new ByteWriter(MAGIC_BYTES.length + 6 + header.length + payload.pos);
  out.bytes(MAGIC_BYTES); out.u16(SNAPSHOT_VERSION); out.u32(header.length); out.bytes(header); out.bytes(payload.toBytes());
  return out.toBytes();
}

interface Parsed { header: Header; payloadOffset: number; reader: ByteReader; offsets: Map<string, { entry: HeaderEntry; offset: number }> }
function parseFile(bytes: Uint8Array): { parsed: Parsed; version: number } {
  const r = new ByteReader(bytes);
  const magic = r.bytes(MAGIC_BYTES.length);
  for (let k = 0; k < MAGIC_BYTES.length; k++) if (magic[k] !== MAGIC_BYTES[k]) throw new Error('snapshot: 魔数不匹配，不是 .sc2kweb 快照');
  const version = r.u16();
  const headerLen = r.u32();
  const header = JSON.parse(utf8Decode(r.bytes(headerLen))) as Header;
  if (!header || !Array.isArray(header.entries)) throw new Error('snapshot: 头部损坏');
  const payloadOffset = r.pos;
  const offsets = new Map<string, { entry: HeaderEntry; offset: number }>();
  let off = payloadOffset;
  for (const he of header.entries) {
    if (typeof he.path !== 'string' || typeof he.bytes !== 'number' || he.bytes < 0) throw new Error('snapshot: 头部条目损坏');
    offsets.set(he.path, { entry: he, offset: off });
    off += he.bytes;
  }
  if (off > bytes.length) throw new Error(`snapshot: payload 截断（期望 ≥ ${off} B，实际 ${bytes.length} B）`);
  return { parsed: { header, payloadOffset, reader: r, offsets }, version };
}

let defaultsCache: { bytes: Uint8Array; parsed: Parsed } | null = null;
/** 默认值流：缺失 / 损坏的条目从它解码（与 createCityState() 等价，且复用同一解码路径）。 */
function defaults(): { bytes: Uint8Array; parsed: Parsed } {
  if (!defaultsCache) { const bytes = encodeSnapshot(createCityState()); defaultsCache = { bytes, parsed: parseFile(bytes).parsed }; }
  return defaultsCache;
}

export function decodeSnapshot(bytes: Uint8Array, into: CityState): Diagnostic[] {
  const diag: Diagnostic[] = [];
  const { parsed, version } = parseFile(bytes);
  if (version !== SNAPSHOT_VERSION) diag.push({ level: 'warn', code: 'snapshot.version', message: `快照版本 ${version} ≠ 当前 ${SNAPSHOT_VERSION}：缺失条目补默认，priv 交给各系统 postLoad 处理` });
  const schemaPaths = new Set(SNAPSHOT_SCHEMA.map((e) => e.path));
  for (const he of parsed.header.entries) if (!schemaPaths.has(he.path)) diag.push({ level: 'info', code: 'snapshot.unknownEntry', message: `忽略未知条目 ${he.path}`, at: he.path });
  const fromDefault = (e: SnapshotSchemaEntry): void => {
    const d = defaults();
    const hit = d.parsed.offsets.get(e.path)!;
    decodeEntry(into, e, d.parsed.reader.sub(hit.offset, hit.entry.bytes), hit.entry.len);
  };
  for (const e of SNAPSHOT_SCHEMA) {
    const hit = parsed.offsets.get(e.path);
    if (!hit || hit.entry.kind !== e.kind) {
      diag.push({ level: 'info', code: 'snapshot.missingEntry', message: `条目 ${e.path} 缺失或类型不同，已补默认`, at: e.path });
      fromDefault(e);
      continue;
    }
    try {
      decodeEntry(into, e, parsed.reader.sub(hit.offset, hit.entry.bytes), hit.entry.len);
    } catch (err) {
      diag.push({ level: 'warn', code: 'snapshot.badEntry', message: `条目 ${e.path} 解码失败（${err instanceof Error ? err.message : String(err)}），已补默认`, at: e.path });
      fromDefault(e);
    }
  }
  return diag;
}

export function hashSnapshot(s: CityState, scope: HashScope): number {
  const sink = new HashSink();
  for (const e of SNAPSHOT_SCHEMA) {
    if (e.kind === 'scalars' || e.kind === 'strings') { encodeEntry(s, e, sink, scope); continue; }
    if (!inHashScope(e.hash, scope)) continue;
    encodeEntry(s, e, sink);
  }
  return sink.h >>> 0;
}

/** 编码后的 priv 字节数（每系统）；类型违规抛错。 */
export function privEncodedSize(p: PrivState, id: string): number {
  const w = new ByteWriter(4096);
  encodePrivValue(p, w, `priv.${id}`);
  return w.pos;
}

export function validatePriv(s: CityState): Diagnostic[] {
  const diag: Diagnostic[] = [];
  const known = new Set<string>(PRIV_IDS);
  for (const key of Object.keys(s.priv)) {
    if (!known.has(key)) { diag.push({ level: 'warn', code: 'priv.unknownSystem', message: `priv 含未知系统键 ${key}（不会被编码）`, at: `priv.${key}` }); continue; }
    const id = key as Exclude<SystemId, 'core'>;
    const p = s.priv[id];
    if (p === undefined) continue;
    if (!isPlainObject(p)) { diag.push({ level: 'error', code: 'priv.type', message: `priv.${id} 不是普通对象`, at: `priv.${id}` }); continue; }
    if (!Number.isInteger(p.v) || (p.v as number) < 1) diag.push({ level: 'warn', code: 'priv.version', message: `priv.${id}.v 应为 ≥ 1 的整数（实际 ${String(p.v)}）`, at: `priv.${id}.v` });
    try {
      const size = privEncodedSize(p as PrivState, id);
      const budget = PRIV_BUDGET_BYTES[id];
      if (size > budget) diag.push({ level: 'error', code: 'priv.budget', message: `priv.${id} 编码后 ${size} B 超过预算 ${budget} B`, at: `priv.${id}` });
    } catch (err) {
      diag.push({ level: 'error', code: 'priv.type', message: err instanceof Error ? err.message : String(err), at: `priv.${id}` });
    }
  }
  return diag;
}

export const snapshotCodec: SnapshotCodec = { encode: encodeSnapshot, decode: decodeSnapshot, hash: hashSnapshot, validatePriv };
