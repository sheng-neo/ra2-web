// ===== sim/services/xlab.ts =====
// XLAB 标签编解码（spec:file-formats §2.2.8：256 × 25 B，`[len][text ≤ 23 B][0x00][填充]`）。
// 文本按 UTF-8 存放（原版为 ASCII，本项目允许本地化文本）；截断不切开码点。手写编解码：tsconfig.sim.json 无 DOM / Node 类型，不能用 TextEncoder。
import { XLAB_SLOTS, XLAB_STRIDE, XLAB_TEXT_MAX } from './tables';

/** UTF-8 编码，总字节数不超过 max（在码点边界截断）。 */
export function utf8Encode(text: string, max: number): number[] {
  const out: number[] = [];
  for (const ch of text) {
    const cp = ch.codePointAt(0)!;
    const bytes = cp < 0x80 ? [cp]
      : cp < 0x800 ? [0xc0 | (cp >> 6), 0x80 | (cp & 0x3f)]
      : cp < 0x10000 ? [0xe0 | (cp >> 12), 0x80 | ((cp >> 6) & 0x3f), 0x80 | (cp & 0x3f)]
      : [0xf0 | (cp >> 18), 0x80 | ((cp >> 12) & 0x3f), 0x80 | ((cp >> 6) & 0x3f), 0x80 | (cp & 0x3f)];
    if (out.length + bytes.length > max) break;
    for (const b of bytes) out.push(b);
  }
  return out;
}

/** UTF-8 解码 bytes[start, start+len)；非法序列以 U+FFFD 替代。 */
export function utf8Decode(bytes: Uint8Array, start: number, len: number): string {
  let s = '';
  const end = start + len;
  let i = start;
  while (i < end) {
    const b0 = bytes[i]!;
    let cp: number, n: number;
    if (b0 < 0x80) { cp = b0; n = 1; }
    else if ((b0 & 0xe0) === 0xc0) { cp = b0 & 0x1f; n = 2; }
    else if ((b0 & 0xf0) === 0xe0) { cp = b0 & 0x0f; n = 3; }
    else if ((b0 & 0xf8) === 0xf0) { cp = b0 & 0x07; n = 4; }
    else { s += '�'; i++; continue; }
    if (i + n > end) { s += '�'; break; }
    let ok = true;
    for (let k = 1; k < n; k++) {
      const b = bytes[i + k]!;
      if ((b & 0xc0) !== 0x80) { ok = false; break; }
      cp = (cp << 6) | (b & 0x3f);
    }
    if (!ok || cp > 0x10ffff) { s += '�'; i++; continue; }
    s += String.fromCodePoint(cp);
    i += n;
  }
  return s;
}

/** 读标签 slot（0..255）：按 len 取并在首个 0x00 截断（填充区可能是垃圾）。 */
export function readLabel(xlab: Uint8Array, slot: number): string {
  if (slot < 0 || slot >= XLAB_SLOTS) return '';
  const base = slot * XLAB_STRIDE;
  let len = Math.min(xlab[base]!, XLAB_STRIDE - 1);
  for (let k = 0; k < len; k++) if (xlab[base + 1 + k] === 0) { len = k; break; }
  return len === 0 ? '' : utf8Decode(xlab, base + 1, len);
}

/** 写标签 slot：整条 25 B 先清零，再写 len + 文本（≤ 23 B）。空文本 = 清空。 */
export function writeLabel(xlab: Uint8Array, slot: number, text: string): void {
  if (slot < 0 || slot >= XLAB_SLOTS) return;
  const base = slot * XLAB_STRIDE;
  xlab.fill(0, base, base + XLAB_STRIDE);
  const bytes = utf8Encode(text, XLAB_TEXT_MAX);
  xlab[base] = bytes.length;
  for (let k = 0; k < bytes.length; k++) xlab[base + 1 + k] = bytes[k]!;
}
