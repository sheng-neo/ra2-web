/**
 * Westwood AUD 音频解码（C&C 系列音效/语音格式）。
 * 头 12B：u16 采样率, u32 压缩数据大小, u32 解压后大小, u8 标志(bit0 立体声/
 * bit1 16bit), u8 压缩类型(1=WS-ADPCM, 99=IMA-ADPCM)。其后为若干分块，
 * 每块头 8B：u16 压缩大小, u16 解压大小, u32 magic(0x0000DEAF)，随后压缩数据。
 * TS/RA2 音效均为 IMA-ADPCM(99)、16bit 单声道——此处实现 IMA 解码；
 * IMA 解码状态(预测值/步进索引)在整条流内连续，不随分块重置。
 */

/** IMA-ADPCM 步进表（89 项）。 */
const STEP_TABLE = [
  7, 8, 9, 10, 11, 12, 13, 14, 16, 17, 19, 21, 23, 25, 28, 31, 34, 37, 41, 45, 50, 55, 60, 66, 73, 80, 88, 97, 107,
  118, 130, 143, 157, 173, 190, 209, 230, 253, 279, 307, 337, 371, 408, 449, 494, 544, 598, 658, 724, 796, 876, 963,
  1060, 1166, 1282, 1411, 1552, 1707, 1878, 2066, 2272, 2499, 2749, 3024, 3327, 3660, 4026, 4428, 4871, 5358, 5894,
  6484, 7132, 7845, 8630, 9493, 10442, 11487, 12635, 13899, 15289, 16818, 18500, 20350, 22385, 24623, 27086, 29794,
  32767,
];
/** 步进索引调整表（按 4bit 取值）。 */
const INDEX_TABLE = [-1, -1, -1, -1, 2, 4, 6, 8, -1, -1, -1, -1, 2, 4, 6, 8];

const CHUNK_MAGIC = 0x0000deaf;
/** 解压上限，防畸形头导致 OOM（约 64MB PCM）。 */
const MAX_OUT_BYTES = 64 * 1024 * 1024;

export interface AudFile {
  sampleRate: number;
  channels: number;
  bitsPerSample: number;
  /** 解码后的 16bit PCM 采样（单声道）。 */
  samples: Int16Array;
}

/** 解码一个 4bit nibble，推进 IMA 状态，返回新采样值。 */
function decodeNibble(nibble: number, state: { index: number; sample: number }): number {
  const step = STEP_TABLE[state.index]!;
  let delta = step >> 3;
  if (nibble & 4) delta += step;
  if (nibble & 2) delta += step >> 1;
  if (nibble & 1) delta += step >> 2;
  state.sample += nibble & 8 ? -delta : delta;
  if (state.sample > 32767) state.sample = 32767;
  else if (state.sample < -32768) state.sample = -32768;
  state.index += INDEX_TABLE[nibble]!;
  if (state.index < 0) state.index = 0;
  else if (state.index > 88) state.index = 88;
  return state.sample;
}

export function parseAud(bytes: Uint8Array): AudFile {
  if (bytes.length < 12) throw new Error('AUD 文件过短');
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const sampleRate = dv.getUint16(0, true);
  const dataSize = dv.getUint32(2, true);
  const outSize = dv.getUint32(6, true);
  const flags = dv.getUint8(10);
  const compression = dv.getUint8(11);
  const channels = flags & 1 ? 2 : 1;
  const bitsPerSample = flags & 2 ? 16 : 8;

  if (compression !== 99) throw new Error(`AUD 压缩类型 ${compression} 暂不支持（仅 IMA-ADPCM 99）`);
  if (outSize > MAX_OUT_BYTES) throw new Error(`AUD 解压大小异常: ${outSize}`);

  const samples = new Int16Array(outSize >> 1);
  const state = { index: 0, sample: 0 };
  let s = 0; // 采样写入位置
  let off = 12;
  const end = Math.min(bytes.length, 12 + dataSize);
  while (off + 8 <= end) {
    const compSize = dv.getUint16(off, true);
    const magic = dv.getUint32(off + 4, true);
    off += 8;
    if (magic !== CHUNK_MAGIC) break; // 非法块头：停止（容错）
    const chunkEnd = Math.min(off + compSize, bytes.length);
    for (let i = off; i < chunkEnd && s + 2 <= samples.length; i++) {
      const b = bytes[i]!;
      samples[s++] = decodeNibble(b & 0x0f, state);
      samples[s++] = decodeNibble(b >> 4, state);
    }
    off = chunkEnd;
  }

  return { sampleRate, channels, bitsPerSample, samples: s === samples.length ? samples : samples.subarray(0, s) };
}
