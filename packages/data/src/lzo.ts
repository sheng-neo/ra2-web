/**
 * LZO1X 解压（清室实现，依据公开格式文档；以官方 lzop 产物交叉验证）。
 * 地图 IsoMapPack5 的分块数据用它压缩。
 * 另含「纯字面量」编码器：产出合法 LZO1X 流但不压缩，
 * 用于测试夹具与将来写出地图。
 */

export function lzo1xDecompress(src: Uint8Array, dstLen: number): Uint8Array {
  const dst = new Uint8Array(dstLen);
  let ip = 0;
  let op = 0;
  /** 上一指令尾随字面量数：0 / 1–3 / 4(长字面量串) —— 决定低位指令含义 */
  let state = 0;

  const copyLiterals = (len: number): void => {
    if (op + len > dstLen) throw new Error(`LZO 输出越界: ${op}+${len} > ${dstLen}`);
    dst.set(src.subarray(ip, ip + len), op);
    ip += len;
    op += len;
  };
  const copyMatch = (dist: number, len: number): void => {
    let mp = op - dist;
    if (mp < 0) throw new Error(`LZO 匹配越界: dist=${dist} @${op}`);
    if (op + len > dstLen) throw new Error(`LZO 输出越界: ${op}+${len} > ${dstLen}`);
    while (len-- > 0) dst[op++] = dst[mp++]!;
  };
  const readExtendedLen = (base: number): number => {
    let len = 0;
    while (src[ip] === 0) {
      len += 255;
      ip++;
    }
    return len + base + src[ip++]!;
  };

  // 首字节特例：>17 表示开头有 (b-17) 个字面量
  if (src[0]! > 17) {
    const t = src[ip++]! - 17;
    copyLiterals(t);
    state = t < 4 ? t : 4;
  }

  for (;;) {
    let t = src[ip++]!;
    if (t < 16) {
      if (state === 0) {
        // 字面量串
        const len = t === 0 ? readExtendedLen(15) : t;
        copyLiterals(len + 3);
        state = 4;
        continue;
      }
      if (state < 4) {
        // 尾随 1–3 字面量之后：2 字节短匹配
        const dist = (t >> 2) + (src[ip++]! << 2) + 1;
        copyMatch(dist, 2);
      } else {
        // 长字面量串之后：3 字节远匹配
        const dist = (t >> 2) + (src[ip++]! << 2) + 2049;
        copyMatch(dist, 3);
      }
      state = t & 3;
      copyLiterals(state);
      continue;
    }

    let len: number;
    let dist: number;
    if (t >= 64) {
      // M2：长度 3–8
      len = (t >> 5) + 1;
      dist = ((t >> 2) & 7) + (src[ip++]! << 3) + 1;
    } else if (t >= 32) {
      // M3
      len = (t & 31) === 0 ? readExtendedLen(31) : t & 31;
      len += 2;
      const word = src[ip]! | (src[ip + 1]! << 8);
      ip += 2;
      dist = (word >> 2) + 1;
      t = word;
    } else {
      // M4（含结束标记）
      len = (t & 7) === 0 ? readExtendedLen(7) : t & 7;
      len += 2;
      const word = src[ip]! | (src[ip + 1]! << 8);
      ip += 2;
      dist = 16384 + ((t & 8) << 11) + (word >> 2);
      if (dist === 16384) break; // EOF
      t = word;
    }
    copyMatch(dist, len);
    state = t & 3;
    copyLiterals(state);
  }

  if (op !== dstLen) throw new Error(`LZO 解压长度不符: 得 ${op}, 期望 ${dstLen}`);
  return dst;
}

/** 产出合法 LZO1X 流（单个超长字面量串 + EOF），不做压缩。 */
export function lzo1xCompressLiteral(data: Uint8Array): Uint8Array {
  const out: number[] = [];
  const n = data.length;
  if (n > 0 && n <= 238) {
    out.push(n + 17);
  } else if (n > 238) {
    // t==0 扩展字面量串: len = 3 + 15 + 255*k + b, b ∈ [1,255]
    const extra = n - 18;
    let k = Math.floor(extra / 255);
    let b = extra - k * 255;
    if (b === 0) {
      k -= 1;
      b = 255;
    }
    out.push(0);
    for (let i = 0; i < k; i++) out.push(0);
    out.push(b);
  }
  const head = Uint8Array.from(out);
  const result = new Uint8Array(head.length + n + 3);
  result.set(head, 0);
  result.set(data, head.length);
  result.set([17, 0, 0], head.length + n); // EOF: M4 dist=16384
  return result;
}
