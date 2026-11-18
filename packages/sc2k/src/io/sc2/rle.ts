// ===== io/sc2/rle.ts =====（spec:file-formats §2.1.3 / §3.3.2）
// .SC2 的 RLE：控制字节 0x01–0x7F = 字面量 c 个；0x81–0xFF = 后一字节重复 c−0x7F 次（2–128）；0x00 / 0x80 原版不产生，解码时跳过并告警。
import type { Diagnostic } from '../../contracts/system';

export const RLE_MAX_LITERAL = 127, RLE_MAX_RUN = 128;

/** 同一 chunk 内逐条记录的非法控制字节告警上限；其余并入一条计数告警（防恶意文件刷爆诊断表）。 */
export const RLE_BAD_CONTROL_DIAG_MAX = 8;

/**
 * 解码。expected 给出时输出恰为 expected 字节（多截断、少补零并告警），且**只分配 expected 字节**：超出部分只计数不写入
 * （恶意 / 损坏的 chunk 每 2 字节可展开 128 字节，按需扩容会被放大 64 倍）。diag / at 用于记录警告（不中断）。
 */
export function rleDecode(src: Uint8Array, expected?: number, diag?: Diagnostic[], at?: string): Uint8Array {
  const bounded = expected !== undefined;
  let out = new Uint8Array(expected ?? Math.max(16, src.length * 2));
  let n = 0;                                                       // 逻辑解压长度（bounded 时可超过 out.length，只计数）
  const grow = (need: number): void => {
    if (bounded || n + need <= out.length) return;
    let cap = out.length * 2;
    while (cap < n + need) cap *= 2;
    const nb = new Uint8Array(cap); nb.set(out.subarray(0, n)); out = nb;
  };
  /** 本段可写入 out 的字节数（bounded 时截到 expected）。 */
  const room = (len: number): number => (bounded ? Math.max(0, Math.min(len, out.length - n)) : len);
  const warn = (code: string, message: string): void => { diag?.push({ level: 'warn', code, message, ...(at !== undefined ? { at } : {}) }); };
  let badControls = 0;
  let i = 0;
  while (i < src.length) {
    const c = src[i++]!;
    if (c >= 1 && c <= RLE_MAX_LITERAL) {
      let len = c;
      if (i + len > src.length) { warn('sc2.truncatedRun', `RLE 字面量越过 chunk 末尾（需要 ${len}，剩余 ${src.length - i}）`); len = src.length - i; }
      grow(len);
      const w = room(len);
      if (w > 0) out.set(src.subarray(i, i + w), n);
      n += len; i += len;
    } else if (c >= 0x81) {
      if (i >= src.length) { warn('sc2.truncatedRun', 'RLE 重复码后缺少数据字节'); break; }
      const b = src[i++]!, len = c - 0x7f;
      grow(len);
      const w = room(len);
      if (w > 0) out.fill(b, n, n + w);
      n += len;
    } else {
      if (++badControls <= RLE_BAD_CONTROL_DIAG_MAX) warn('sc2.badRleControl', `RLE 控制字节 0x${c.toString(16).padStart(2, '0')} 非法，已跳过`);
    }
  }
  if (badControls > RLE_BAD_CONTROL_DIAG_MAX) warn('sc2.badRleControl', `另有 ${badControls - RLE_BAD_CONTROL_DIAG_MAX} 个非法 RLE 控制字节（0x00 / 0x80）已跳过`);
  if (bounded) {
    if (n !== expected) warn('sc2.rleLength', `RLE 解压长度 ${n} ≠ 期望 ${expected}（已${n > expected ? '截断' : '补零'}）`);
    return out;                                                    // 新分配的数组：n < expected 时尾部天然为 0
  }
  return out.slice(0, n);
}

/** 编码：≥2 的同值串用重复码（≤128 一段），其余字面量（≤127 一段）；永不产生 0x00 / 0x80。 */
export function rleEncode(src: Uint8Array): Uint8Array {
  const out: number[] = [];
  let litStart = 0, litLen = 0;
  const flushLit = (): void => {
    let p = litStart;
    while (litLen > 0) {
      const k = Math.min(RLE_MAX_LITERAL, litLen);
      out.push(k);
      for (let j = 0; j < k; j++) out.push(src[p + j]!);
      p += k; litLen -= k;
    }
  };
  let i = 0;
  while (i < src.length) {
    let j = i + 1;
    while (j < src.length && src[j] === src[i] && j - i < RLE_MAX_RUN) j++;
    const run = j - i;
    if (run >= 2) { flushLit(); out.push(0x7f + run, src[i]!); i = j; litStart = i; }
    else { if (litLen === 0) litStart = i; litLen++; i++; }
  }
  flushLit();
  return Uint8Array.from(out);
}
