/**
 * Westwood Format80（LCW）解压 —— 地图 OverlayPack/OverlayDataPack 用。
 * 指令：
 *   0x80            结束
 *   0xxxyyyy + b    相对复制：长度 (x)+3，距离 ((y<<8)|b)
 *   10cccccc        字面量 c 个
 *   11cccccc + w    绝对复制：长度 c+3，源 = 输出区 w 处
 *   0xFE + n(u16) + v   填充 n 个字节 v
 *   0xFF + n(u16) + w   绝对复制 n 个
 */
export function format80Decompress(src: Uint8Array, dstLen: number): Uint8Array {
  const dst = new Uint8Array(dstLen);
  let ip = 0;
  let op = 0;
  const u16 = (): number => {
    const v = src[ip]! | (src[ip + 1]! << 8);
    ip += 2;
    return v;
  };

  const ensure = (count: number): void => {
    if (op + count > dstLen) {
      throw new Error(`Format80 输出越界: ${op}+${count} > ${dstLen}`);
    }
  };

  while (ip < src.length) {
    const cmd = src[ip++]!;
    if (cmd === 0x80) break;

    if ((cmd & 0x80) === 0) {
      // 相对复制
      const count = (cmd >> 4) + 3;
      const rel = ((cmd & 0x0f) << 8) | src[ip++]!;
      ensure(count);
      let mp = op - rel;
      for (let i = 0; i < count; i++) dst[op++] = dst[mp++]!;
    } else if ((cmd & 0x40) === 0) {
      // 字面量
      const count = cmd & 0x3f;
      ensure(count);
      dst.set(src.subarray(ip, ip + count), op);
      ip += count;
      op += count;
    } else if (cmd === 0xfe) {
      const count = u16();
      const v = src[ip++]!;
      ensure(count);
      dst.fill(v, op, op + count);
      op += count;
    } else if (cmd === 0xff) {
      const count = u16();
      let mp = u16();
      ensure(count);
      for (let i = 0; i < count; i++) dst[op++] = dst[mp++]!;
    } else {
      const count = (cmd & 0x3f) + 3;
      let mp = u16();
      ensure(count);
      for (let i = 0; i < count; i++) dst[op++] = dst[mp++]!;
    }
  }
  if (op !== dstLen) throw new Error(`Format80 解压长度不符: 得 ${op}, 期望 ${dstLen}`);
  return dst;
}

/** 纯字面量 Format80 编码（合法但不压缩；夹具与写出用）。 */
export function format80CompressLiteral(data: Uint8Array): Uint8Array {
  const chunks = Math.ceil(data.length / 63);
  const out = new Uint8Array(data.length + chunks + 1);
  let ip = 0;
  let op = 0;
  while (ip < data.length) {
    const n = Math.min(63, data.length - ip);
    out[op++] = 0x80 | n;
    out.set(data.subarray(ip, ip + n), op);
    ip += n;
    op += n;
  }
  out[op++] = 0x80;
  return out.subarray(0, op);
}
