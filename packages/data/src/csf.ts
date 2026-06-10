/**
 * CSF 字符串表（ra2.csf —— 单位名、UI 文案）。
 * 头 0x18：" FSC" 魔数, version, numLabels, numStrings, unused, language。
 * 标签：" LBL", 值对数, 名长, ASCII 名。
 * 值：" RTS"（或 "WRTS" 带附加 ASCII 串）, 字符数, UTF-16LE 数据（逐字节取反）。
 * 标签大小写不敏感，重复以后者为准；多值只取第一个。
 */
import { BinaryReader } from './binary-reader';

export interface CsfFile {
  language: number;
  /** label（小写）→ 文本。 */
  strings: Map<string, string>;
}

export function parseCsf(bytes: Uint8Array): CsfFile {
  const r = new BinaryReader(bytes.slice().buffer);
  if (r.ascii(4) !== ' FSC') throw new Error('不是 CSF 文件（魔数不符）');
  r.u32(); // version
  const numLabels = r.u32();
  r.u32(); // numStrings
  r.u32(); // unused
  const language = r.u32();

  const strings = new Map<string, string>();
  for (let i = 0; i < numLabels; i++) {
    const magic = r.ascii(4);
    if (magic !== ' LBL') throw new Error(`标签魔数不符: "${magic}" @${r.offset - 4}`);
    const pairCount = r.u32();
    const nameLen = r.u32();
    const name = r.ascii(nameLen);

    let text = '';
    for (let p = 0; p < pairCount; p++) {
      const valueMagic = r.ascii(4);
      const hasExtra = valueMagic === 'WRTS';
      if (!hasExtra && valueMagic !== ' RTS') {
        throw new Error(`值魔数不符: "${valueMagic}" @${r.offset - 4}`);
      }
      const charCount = r.u32();
      const raw = r.bytes(charCount * 2);
      if (hasExtra) {
        const extraLen = r.u32();
        r.skip(extraLen);
      }
      if (p === 0) {
        const decoded = new Uint8Array(raw.length);
        for (let b = 0; b < raw.length; b++) decoded[b] = ~raw[b]! & 0xff;
        text = new TextDecoder('utf-16le').decode(decoded);
      }
    }
    strings.set(name.toLowerCase(), text);
  }

  return { language, strings };
}
