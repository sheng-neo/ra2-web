/**
 * Westwood 调色板：256 色 × RGB，每分量 6 位（0–63），引擎左移 2 位使用。
 * 索引 16–31 为玩家变色区（remap）。
 */
export const REMAP_START = 16;
export const REMAP_END = 31;

export class Palette {
  /** RGBA，256×4 字节，alpha 恒 255（透明由渲染层按索引 0 处理）。 */
  readonly rgba: Uint8Array;

  constructor(rgba: Uint8Array) {
    if (rgba.length !== 1024) throw new Error(`调色板应为 1024 字节 RGBA: ${rgba.length}`);
    this.rgba = rgba;
  }

  static parse(bytes: Uint8Array): Palette {
    if (bytes.length < 768) throw new Error(`PAL 文件过短: ${bytes.length}`);
    const rgba = new Uint8Array(1024);
    for (let i = 0; i < 256; i++) {
      rgba[i * 4] = (bytes[i * 3]! & 0x3f) << 2;
      rgba[i * 4 + 1] = (bytes[i * 3 + 1]! & 0x3f) << 2;
      rgba[i * 4 + 2] = (bytes[i * 3 + 2]! & 0x3f) << 2;
      rgba[i * 4 + 3] = 255;
    }
    return new Palette(rgba);
  }

  color(index: number): [number, number, number] {
    return [this.rgba[index * 4]!, this.rgba[index * 4 + 1]!, this.rgba[index * 4 + 2]!];
  }
}
