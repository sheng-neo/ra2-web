/**
 * 随机访问数据源抽象 —— .mix 动辄上百 MB，不能整包载入手机内存。
 * 浏览器经 HTTP Range 按需取片段；测试/小文件用内存源。
 */
export interface RandomAccessSource {
  readonly size: number;
  read(offset: number, length: number): Promise<Uint8Array>;
}

/** 整块内存数据源（小文件 / 测试）。 */
export class BufferSource implements RandomAccessSource {
  constructor(private readonly data: Uint8Array) {}

  get size(): number {
    return this.data.length;
  }

  read(offset: number, length: number): Promise<Uint8Array> {
    if (offset < 0 || offset + length > this.data.length) {
      return Promise.reject(new RangeError(`读取越界: ${offset}+${length}/${this.data.length}`));
    }
    return Promise.resolve(this.data.subarray(offset, offset + length));
  }
}

/** 另一数据源的窗口视图（嵌套 mix、mix 内文件）。 */
export class SliceSource implements RandomAccessSource {
  constructor(
    private readonly parent: RandomAccessSource,
    private readonly offset: number,
    readonly size: number,
  ) {
    if (offset < 0 || offset + size > parent.size) {
      throw new RangeError(`切片越界: ${offset}+${size}/${parent.size}`);
    }
  }

  read(offset: number, length: number): Promise<Uint8Array> {
    if (offset < 0 || offset + length > this.size) {
      return Promise.reject(new RangeError(`读取越界: ${offset}+${length}/${this.size}`));
    }
    return this.parent.read(this.offset + offset, length);
  }
}

/** HTTP Range 数据源（开发服务器 /game-data 或静态托管均可）。 */
export class UrlSource implements RandomAccessSource {
  private constructor(
    private readonly url: string,
    readonly size: number,
  ) {}

  static async open(url: string): Promise<UrlSource> {
    const res = await fetch(url, { method: 'HEAD' });
    if (!res.ok) throw new Error(`无法访问 ${url}: HTTP ${res.status}`);
    const len = Number(res.headers.get('content-length'));
    if (!Number.isFinite(len) || len <= 0) throw new Error(`${url} 缺少 Content-Length`);
    return new UrlSource(url, len);
  }

  async read(offset: number, length: number): Promise<Uint8Array> {
    if (length === 0) return new Uint8Array(0);
    const res = await fetch(this.url, {
      headers: { Range: `bytes=${offset}-${offset + length - 1}` },
    });
    if (!res.ok && res.status !== 206) {
      throw new Error(`Range 请求失败 ${this.url}: HTTP ${res.status}`);
    }
    const buf = new Uint8Array(await res.arrayBuffer());
    if (buf.length !== length) {
      // 服务器忽略 Range 时退化为全量返回，截取所需窗口
      if (res.status === 200 && buf.length >= offset + length) {
        return buf.subarray(offset, offset + length);
      }
      throw new Error(`Range 返回长度不符: 期望 ${length} 实得 ${buf.length}`);
    }
    return buf;
  }
}
