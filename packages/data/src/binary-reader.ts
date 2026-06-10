/**
 * 小端二进制读取器 —— 所有红警2 文件格式解析的基础。
 * 浏览器与 Node 通用（只依赖 DataView/TextDecoder）。
 */
export class BinaryReader {
  private readonly view: DataView;
  private pos = 0;

  constructor(
    readonly buffer: ArrayBufferLike,
    byteOffset = 0,
    byteLength?: number,
  ) {
    this.view = new DataView(buffer, byteOffset, byteLength);
  }

  get offset(): number {
    return this.pos;
  }

  get length(): number {
    return this.view.byteLength;
  }

  get remaining(): number {
    return this.view.byteLength - this.pos;
  }

  seek(offset: number): void {
    if (offset < 0 || offset > this.view.byteLength) {
      throw new RangeError(`seek 越界: ${offset} / ${this.view.byteLength}`);
    }
    this.pos = offset;
  }

  skip(count: number): void {
    this.seek(this.pos + count);
  }

  u8(): number {
    const v = this.view.getUint8(this.pos);
    this.pos += 1;
    return v;
  }

  i8(): number {
    const v = this.view.getInt8(this.pos);
    this.pos += 1;
    return v;
  }

  u16(): number {
    const v = this.view.getUint16(this.pos, true);
    this.pos += 2;
    return v;
  }

  i16(): number {
    const v = this.view.getInt16(this.pos, true);
    this.pos += 2;
    return v;
  }

  u32(): number {
    const v = this.view.getUint32(this.pos, true);
    this.pos += 4;
    return v;
  }

  i32(): number {
    const v = this.view.getInt32(this.pos, true);
    this.pos += 4;
    return v;
  }

  f32(): number {
    const v = this.view.getFloat32(this.pos, true);
    this.pos += 4;
    return v;
  }

  /** 读取 count 字节，返回指向同一 buffer 的视图（不拷贝）。 */
  bytes(count: number): Uint8Array {
    if (count < 0 || this.pos + count > this.view.byteLength) {
      throw new RangeError(`bytes 越界: ${this.pos}+${count} / ${this.view.byteLength}`);
    }
    const out = new Uint8Array(this.buffer, this.view.byteOffset + this.pos, count);
    this.pos += count;
    return out;
  }

  /** 读取定长 ASCII 字符串，在第一个 \0 处截断。 */
  ascii(count: number): string {
    const raw = this.bytes(count);
    const nul = raw.indexOf(0);
    return new TextDecoder('ascii').decode(nul === -1 ? raw : raw.subarray(0, nul));
  }
}
