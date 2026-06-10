/**
 * Westwood MIX 归档（RA2 世代）。
 * 三种头部形态：
 *  - 旧式（首 u16 即文件数，无 flags）
 *  - 新式明文（首 u16 为 0，u32 flags 无加密位）
 *  - 新式加密（flags 含 0x20000：80 字节 key source + Blowfish-ECB 加密的头与索引）
 * 条目按 文件名 CRC（mixIdRA2）索引，offset 相对数据区起点。
 */
import { Blowfish } from './blowfish';
import { mixIdRA2 } from './crc32';
import { decryptKeySource } from './mix-crypto';
import { BinaryReader } from './binary-reader';
import { SliceSource, type RandomAccessSource } from './source';

export const FLAG_CHECKSUM = 0x00010000;
export const FLAG_ENCRYPTED = 0x00020000;

export interface MixEntry {
  /** 文件名 CRC（无符号）。 */
  id: number;
  /** 相对数据区起点的偏移。 */
  offset: number;
  size: number;
}

export class MixFile {
  private constructor(
    private readonly source: RandomAccessSource,
    private readonly dataStart: number,
    readonly entries: ReadonlyMap<number, MixEntry>,
    readonly flags: number,
  ) {}

  static async open(source: RandomAccessSource): Promise<MixFile> {
    const head = new BinaryReader((await source.read(0, Math.min(10, source.size))).slice().buffer);
    const first = head.u16();

    let flags = 0;
    let headerStart = 0; // 文件数/数据区大小 所在偏移
    if (first === 0) {
      head.seek(0);
      flags = head.u32();
      headerStart = 4;
    }

    if (flags & FLAG_ENCRYPTED) {
      return MixFile.openEncrypted(source, flags);
    }

    const plainHead = new BinaryReader(
      (await source.read(headerStart, 6)).slice().buffer,
    );
    const count = plainHead.u16();
    plainHead.u32(); // dataSize，未用
    const tableOffset = headerStart + 6;
    const table = new BinaryReader((await source.read(tableOffset, count * 12)).slice().buffer);
    const entries = MixFile.readEntries(table, count);
    return new MixFile(source, tableOffset + count * 12, entries, flags);
  }

  private static async openEncrypted(source: RandomAccessSource, flags: number): Promise<MixFile> {
    const keySource = await source.read(4, 80);
    const blowfishKey = decryptKeySource(keySource);
    const cipher = new Blowfish(blowfishKey);

    // 先解第一个 8 字节块拿到文件数，再算出整个索引还需要多少块
    const firstBlock = cipher.decryptECB(await source.read(84, 8));
    const count = new BinaryReader(firstBlock.slice().buffer).u16();
    const headerBytes = 6 + count * 12;
    const encryptedLen = Math.ceil(headerBytes / 8) * 8;

    const full = cipher.decryptECB((await source.read(84, encryptedLen)).slice());
    const r = new BinaryReader(full.buffer, 0, full.byteLength);
    r.u16(); // count（已读过）
    r.u32(); // dataSize
    const entries = MixFile.readEntries(r, count);
    return new MixFile(source, 84 + encryptedLen, entries, flags);
  }

  private static readEntries(r: BinaryReader, count: number): Map<number, MixEntry> {
    const entries = new Map<number, MixEntry>();
    for (let i = 0; i < count; i++) {
      const id = r.u32();
      const offset = r.u32();
      const size = r.u32();
      entries.set(id, { id, offset, size });
    }
    return entries;
  }

  get fileCount(): number {
    return this.entries.size;
  }

  hasFile(name: string): boolean {
    return this.entries.has(mixIdRA2(name));
  }

  entry(nameOrId: string | number): MixEntry | undefined {
    return this.entries.get(typeof nameOrId === 'number' ? nameOrId >>> 0 : mixIdRA2(nameOrId));
  }

  /** 取文件的零拷贝窗口（适合嵌套 mix / 流式读取）。 */
  fileSource(nameOrId: string | number): SliceSource {
    const e = this.entry(nameOrId);
    if (!e) throw new Error(`MIX 中不存在: ${String(nameOrId)}`);
    return new SliceSource(this.source, this.dataStart + e.offset, e.size);
  }

  /** 读出整个文件内容。 */
  async readFile(nameOrId: string | number): Promise<Uint8Array> {
    const e = this.entry(nameOrId);
    if (!e) throw new Error(`MIX 中不存在: ${String(nameOrId)}`);
    return this.source.read(this.dataStart + e.offset, e.size);
  }

  /** 打开嵌套的子 mix。 */
  async openMix(nameOrId: string | number): Promise<MixFile> {
    return MixFile.open(this.fileSource(nameOrId));
  }
}
