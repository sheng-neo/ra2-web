/**
 * 地块美术提供器：地图渲染器只认这个接口。
 * - SyntheticTileArt：无游戏文件时的程序绘制菱形（M2 演示/开发）
 * - RealTileArt：真实管线 战区ini → TMP → 调色板（有 game-data 即生效）
 */
import { Application, Graphics, Texture } from 'pixi.js';
import {
  Palette,
  TheaterTileTable,
  parseTmp,
  type RA2Map,
  type TmpFile,
} from '@ra2web/data';
import type { ResourceFS } from './vfs';

/** 红警2 屏幕格尺寸。 */
export const TILE_W = 60;
export const TILE_H = 30;
/** 每级地形高度的屏幕偏移。 */
export const LEVEL_H = 15;

export interface TileSprite {
  texture: Texture;
  /** 模板内块偏移（多块模板用）。 */
  dx: number;
  dy: number;
  /** 小地图色。 */
  minimapColor: number;
}

export interface TileArt {
  /** 返回 null 表示暂无（异步加载中或缺失）。 */
  get(tileIndex: number, subTile: number): TileSprite | null;
  /** 真实管线预载入口；合成管线为空操作。 */
  prepare(map: RA2Map): Promise<void>;
}

/** 程序绘制：按 tileIndex 染色的菱形。 */
export class SyntheticTileArt implements TileArt {
  private readonly cache = new Map<number, TileSprite>();
  private readonly base: Texture;
  /** 抬高地块的侧壁贴面（白色，渲染时缩放+染色）。 */
  readonly side: Texture;

  constructor(private readonly app: Application) {
    const g = new Graphics();
    g.poly([TILE_W / 2, 0, TILE_W, TILE_H / 2, TILE_W / 2, TILE_H, 0, TILE_H / 2]);
    g.fill(0xffffff);
    g.stroke({ color: 0x000000, alpha: 0.18, width: 1 });
    this.base = this.app.renderer.generateTexture({ target: g, resolution: 2 });
    g.destroy();

    const s = new Graphics();
    // 菱形下半轮廓向下挤出 1 个单位高度的侧壁
    s.poly([0, 0, TILE_W / 2, TILE_H / 2, TILE_W, 0, TILE_W, LEVEL_H, TILE_W / 2, TILE_H / 2 + LEVEL_H, 0, LEVEL_H]);
    s.fill(0xffffff);
    this.side = this.app.renderer.generateTexture({ target: s, resolution: 2 });
    s.destroy();
  }

  private colorOf(tileIndex: number): number {
    // 简单稳定的伪随机绿色系；水(负值约定)为蓝
    if (tileIndex < 0) return 0x2a5a8a;
    const h = (tileIndex * 2654435761) >>> 0;
    const g = 0x55 + (h % 0x28);
    const r = 0x28 + ((h >> 8) % 0x18);
    const b = 0x20 + ((h >> 16) % 0x12);
    return (r << 16) | (g << 8) | b;
  }

  get(tileIndex: number, _subTile: number): TileSprite {
    let s = this.cache.get(tileIndex);
    if (!s) {
      s = { texture: this.base, dx: 0, dy: 0, minimapColor: this.colorOf(tileIndex) };
      this.cache.set(tileIndex, s);
    }
    return s;
  }

  prepare(): Promise<void> {
    return Promise.resolve();
  }

  /** 渲染端用 tint 表达颜色。 */
  tintOf(tileIndex: number, level: number): number {
    const c = this.colorOf(tileIndex);
    const lift = Math.min(level * 10, 60);
    const r = Math.min(0xff, ((c >> 16) & 0xff) + lift);
    const g = Math.min(0xff, ((c >> 8) & 0xff) + lift);
    const b = Math.min(0xff, (c & 0xff) + lift);
    return (r << 16) | (g << 8) | b;
  }
}

/** 真实管线：tileIndex → 战区表 → TMP 块 → 调色板着色纹理。 */
export class RealTileArt implements TileArt {
  private readonly tmpCache = new Map<string, TmpFile | null>();
  private readonly spriteCache = new Map<string, TileSprite | null>();

  constructor(
    private readonly fs: ResourceFS,
    private readonly table: TheaterTileTable,
    private readonly palette: Palette,
  ) {}

  /** 预载地图用到的全部 TMP 文件并烘焙纹理。 */
  async prepare(map: RA2Map): Promise<void> {
    const needed = new Set<number>();
    for (const t of map.tiles) needed.add(t.tileIndex);
    for (const tileIndex of needed) {
      const resolved = this.table.resolve(tileIndex);
      if (!resolved) continue;
      let tmp = this.tmpCache.get(resolved.fileName);
      if (tmp === undefined) {
        try {
          tmp = parseTmp(await this.fs.readFile(resolved.fileName));
        } catch {
          tmp = null;
        }
        this.tmpCache.set(resolved.fileName, tmp);
      }
    }
  }

  get(tileIndex: number, subTile: number): TileSprite | null {
    const key = `${tileIndex}:${subTile}`;
    const hit = this.spriteCache.get(key);
    if (hit !== undefined) return hit;

    const resolved = this.table.resolve(tileIndex);
    const tmp = resolved ? this.tmpCache.get(resolved.fileName) : null;
    const block = tmp?.blocks[subTile] ?? tmp?.blocks[0] ?? null;
    if (!tmp || !block) {
      this.spriteCache.set(key, null);
      return null;
    }

    const { blockWidth: w, blockHeight: h } = tmp;
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d')!;
    const img = ctx.createImageData(w, h);
    for (let i = 0; i < block.pixels.length; i++) {
      const idx = block.pixels[i]!;
      if (idx === 0) continue;
      img.data[i * 4] = this.palette.rgba[idx * 4]!;
      img.data[i * 4 + 1] = this.palette.rgba[idx * 4 + 1]!;
      img.data[i * 4 + 2] = this.palette.rgba[idx * 4 + 2]!;
      img.data[i * 4 + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);

    const [rl, gl, bl] = block.radarLeft;
    const sprite: TileSprite = {
      texture: Texture.from(canvas),
      dx: block.x,
      dy: block.y,
      minimapColor: ((rl << 2) << 16) | ((gl << 2) << 8) | (bl << 2),
    };
    this.spriteCache.set(key, sprite);
    return sprite;
  }
}
