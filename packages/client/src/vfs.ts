/**
 * 资源虚拟文件系统：按挂载顺序在多个 MIX 中级联查找（仿原版搜索顺序，
 * 先挂载者优先，便于补丁/扩展 mix 覆盖）。
 */
import { BufferSource, MixFile, UrlSource, mixIdRA2, type MixEntry } from '@ra2web/data';

export interface MountedMix {
  /** 展示用路径，如 "ra2.mix/local.mix"。 */
  path: string;
  mix: MixFile;
}

export class ResourceFS {
  readonly mounts: MountedMix[] = [];

  async mountUrl(url: string, path: string): Promise<MixFile> {
    const mix = await MixFile.open(await UrlSource.open(url));
    this.mounts.push({ path, mix });
    return mix;
  }

  /** 从内存字节挂载（本机导入/下载的 mix）。 */
  async mountBytes(bytes: Uint8Array, path: string): Promise<MixFile> {
    const mix = await MixFile.open(new BufferSource(bytes));
    this.mounts.push({ path, mix });
    return mix;
  }

  /** 将某个已挂载 mix 的子 mix 也挂载进来。 */
  async mountChild(parent: MountedMix, childName: string): Promise<MixFile | undefined> {
    if (!parent.mix.hasFile(childName)) return undefined;
    const mix = await parent.mix.openMix(childName);
    this.mounts.push({ path: `${parent.path}/${childName}`, mix });
    return mix;
  }

  resolve(name: string): { mount: MountedMix; entry: MixEntry } | undefined {
    const id = mixIdRA2(name);
    for (const mount of this.mounts) {
      const entry = mount.mix.entries.get(id);
      if (entry) return { mount, entry };
    }
    return undefined;
  }

  has(name: string): boolean {
    return this.resolve(name) !== undefined;
  }

  async readFile(name: string): Promise<Uint8Array> {
    const hit = this.resolve(name);
    if (!hit) throw new Error(`VFS 中找不到 ${name}`);
    return hit.mount.mix.readFile(name);
  }
}
