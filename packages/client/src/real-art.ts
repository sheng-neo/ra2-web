/**
 * 真实素材提供器：从泰伯利亚之日（EA 免费）的 mix 加载真实 SHP，
 * 用真实调色板解码成纹理供游戏渲染。盟军→GDI 美术、苏军→Nod 美术，
 * 天然区分双方。无游戏文件时整体不可用，渲染回退到原创占位美术
 * （公网部署无 game-data → 自动用占位，互不影响）。
 *
 * 车辆是体素(VXL)，待 M6 解析；此处只供建筑与步兵。
 */
import { Application, Texture } from 'pixi.js';
import { Palette, parseShp, parseTmp, parseVxl } from '@ra2web/data';
import type { Side } from '@ra2web/game';
import { ResourceFS } from './vfs';
import { bakeVoxelFacing } from './voxel-baker';
import { PLAYER_COLORS } from './placeholder-art';
import { idbGetFile } from './game-files';

/** 用作铺地的 TS 温带清地块（草地），多个变体增加变化。 */
const TERRAIN_TILES = ['clear01.tem', 'clat01.tem', 'clat02.tem', 'clat03.tem', 'clat04.tem'];

/** typeId → TS 建筑 SHP 基名（NewTheater 温带：第2字符 T，扩展 .shp）。 */
const BUILDING_ART: Record<Side, Record<string, string>> = {
  allied: {
    conyard: 'gtcnst.shp',
    powerplant: 'gtpowr.shp',
    refinery: 'ntrefn.shp',
    barracks: 'gtpile.shp',
    warfactory: 'gtweap.shp',
    pillbox: 'gtctwr.shp',
    tesla: 'gtctwr.shp',
    battlelab: 'gtech.shp', // TS 科技中心；本地无 Temperat.mix 未能验证文件名，缺失则优雅回退占位
  },
  soviet: {
    conyard: 'gtcnst.shp',
    powerplant: 'ntpowr.shp',
    refinery: 'ntrefn.shp',
    barracks: 'nthand.shp',
    warfactory: 'ntweap.shp',
    pillbox: 'ntlasr.shp',
    tesla: 'ntobel.shp',
    battlelab: 'ntech.shp', // 同上，Nod 科技中心
  },
};

/** typeId → 步兵 SHP（两阵营共用 TS 步兵美术）。 */
const INFANTRY_ART: Record<string, string> = {
  gi: 'e1.shp',
  conscript: 'e2.shp',
  engineer: 'e3.shp',
  sovengineer: 'e3.shp',
  // 反装甲步兵（火箭兵/磁能兵）→ TS 改造人，重甲科技感，与基础步枪兵区分。
  rocketsoldier: 'cyc2.shp',
  tankbuster: 'cyc2.shp',
  // 军犬：TS 无动物精灵，留空 → 回退原创占位（程序绘制的犬形）。
};

/** typeId → 载具 VXL（TS 体素）。 */
const VEHICLE_ART: Record<string, string> = {
  harvester: 'harv.vxl',
  grizzly: 'ttnk.vxl',
  rhino: '4tnk.vxl',
  flaktrak: 'hvr.vxl',
  arty: 'art2.vxl',
  v3: 'art2.vxl',
  // 二级单位：TS 无对应原型，取免费库里最接近的体素做替身（真·RA2 文件导入后另说）。
  prism: 'lpst.vxl', // 传感/科技外形，区别于主战坦克
  apocalypse: 'apc.vxl', // 重甲装甲外形
};

/** 载具烘焙朝向数（与 RA2 一致）。 */
const VEHICLE_FACINGS = 32;
/** 阵营代表色（用于体素变色）。 */
const SIDE_COLOR: Record<Side, number> = { allied: PLAYER_COLORS[1]!, soviet: PLAYER_COLORS[3]! };

export interface RealSprite {
  tex: Texture;
  anchorX: number;
  anchorY: number;
}

export class RealArtProvider {
  private readonly fs = new ResourceFS();
  private unitPal: Palette | null = null;
  private readonly buildings = new Map<string, RealSprite>();
  private readonly infantry = new Map<string, RealSprite>();
  /** key `${side}:${typeId}` → 各朝向精灵。 */
  private readonly vehicles = new Map<string, RealSprite[]>();
  /** 草地地块纹理（多变体）。 */
  readonly terrainTiles: Texture[] = [];
  ready = false;

  constructor(private readonly app: Application) {}

  /** 尝试挂载 TS mix + 调色板；成功才标记可用。
   *  优先本机 IndexedDB（下载/导入的素材，手机/公网通用），
   *  回退开发期 /game-data。 */
  async tryInit(): Promise<boolean> {
    try {
      // 核心 4 包（建筑/步兵/地形/调色板）缺一不可。
      for (const m of ['Conquer.mix', 'Cache.mix', 'Temperat.mix', 'IsoTemp.mix']) {
        const bytes = await this.loadMix(m);
        if (!bytes) return ((this.ready = false), false);
        await this.fs.mountBytes(bytes, m);
      }
      // Local.mix 含全部载具体素（harv/ttnk/4tnk/hvr/art2…）：有则挂，
      // 无则建筑/地形照常真实、仅车辆回退占位（优雅降级，不拖垮整体）。
      const localMix = await this.loadMix('Local.mix');
      if (localMix) await this.fs.mountBytes(localMix, 'Local.mix');
      this.unitPal = Palette.parse(await this.fs.readFile('unittem.pal'));
      await this.loadTerrain();
      this.ready = true;
      return true;
    } catch {
      this.ready = false;
      return false;
    }
  }

  /** 取 mix 字节：先本机 IndexedDB，后开发期 /game-data。
   *  公网无 game-data 时 SPA 兜底会返回 index.html（200/text/html），
   *  须排除，否则把 HTML 当 mix 解析徒增报错。 */
  private async loadMix(name: string): Promise<Uint8Array | null> {
    const local = await idbGetFile(name);
    if (local) return local;
    try {
      const res = await fetch(`/game-data/${name}`);
      if (!res.ok) return null;
      if ((res.headers.get('content-type') ?? '').includes('text/html')) return null;
      return new Uint8Array(await res.arrayBuffer());
    } catch {
      /* 公网无 game-data，属正常 */
    }
    return null;
  }

  /** 解码草地块 + 金矿覆盖物 → 纹理（用等距地形调色板 isotem.pal）。 */
  private async loadTerrain(): Promise<void> {
    let isoPal: Palette;
    try {
      isoPal = Palette.parse(await this.fs.readFile('isotem.pal'));
    } catch {
      return;
    }
    for (const name of TERRAIN_TILES) {
      const tex = await this.decodeIsoTile(name, isoPal);
      if (tex) this.terrainTiles.push(tex);
    }
  }

  /** 解码一个 TMP 等距块（首个非空块）→ 纹理；缺失/空返回 null。 */
  private async decodeIsoTile(name: string, isoPal: Palette): Promise<Texture | null> {
    try {
      const tmp = parseTmp(await this.fs.readFile(name));
      const block = tmp.blocks.find((b) => b);
      if (!block || block.pixels.length === 0) return null;
      const w = tmp.blockWidth;
      const h = tmp.blockHeight;
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d')!;
      const img = ctx.createImageData(w, h);
      for (let p = 0; p < block.pixels.length; p++) {
        const idx = block.pixels[p]!;
        if (idx === 0) continue;
        img.data[p * 4] = isoPal.rgba[idx * 4]!;
        img.data[p * 4 + 1] = isoPal.rgba[idx * 4 + 1]!;
        img.data[p * 4 + 2] = isoPal.rgba[idx * 4 + 2]!;
        img.data[p * 4 + 3] = 255;
      }
      ctx.putImageData(img, 0, 0);
      return Texture.from(canvas);
    } catch {
      return null;
    }
  }

  /** 预解码本局用到的建筑/步兵 SHP + 载具 VXL（init 时 await，渲染期零等待）。
   *  onProgress 供加载遮罩显示进度；烘焙间让出主线程（手机上不再像卡死）。 */
  async preload(side: Side, typeIds: Iterable<string>, onProgress?: (done: number, total: number) => void): Promise<void> {
    if (!this.ready) return;
    const ids = [...typeIds];
    let done = 0;
    for (const id of ids) {
      const bName = BUILDING_ART[side][id];
      if (bName) await this.loadInto(this.buildings, `${side}:${id}`, bName, 0, true);
      const iName = INFANTRY_ART[id];
      if (iName) await this.loadInto(this.infantry, id, iName, 0, false);
      const vName = VEHICLE_ART[id];
      if (vName) await this.bakeVehicle(side, id, vName);
      onProgress?.(++done, ids.length);
    }
  }

  /** 让出主线程一帧：长任务（体素烘焙）期间浏览器仍可绘制/响应。 */
  private yieldToUi(): Promise<void> {
    return new Promise((r) => setTimeout(r, 0));
  }

  private async bakeVehicle(side: Side, typeId: string, vxlName: string): Promise<void> {
    const key = `${side}:${typeId}`;
    if (this.vehicles.has(key)) return;
    try {
      const vxl = parseVxl(await this.fs.readFile(vxlName));
      const c = SIDE_COLOR[side];
      const remap: [number, number, number] = [(c >> 16) & 0xff, (c >> 8) & 0xff, c & 0xff];
      const facings: RealSprite[] = [];
      for (let i = 0; i < VEHICLE_FACINGS; i++) {
        const bangle = Math.round((i * 256) / VEHICLE_FACINGS);
        const { canvas, anchorX, anchorY } = bakeVoxelFacing(vxl, bangle, remap, this.unitPal?.rgba);
        facings.push({ tex: Texture.from(canvas), anchorX, anchorY });
        if (i % 8 === 7) await this.yieldToUi(); // 每 8 个朝向歇一口气
      }
      this.vehicles.set(key, facings);
    } catch {
      /* 缺这辆就回退占位 */
    }
  }

  private async loadInto(
    cache: Map<string, RealSprite>,
    key: string,
    shpName: string,
    frame: number,
    isBuilding: boolean,
  ): Promise<void> {
    if (cache.has(key) || !this.unitPal) return;
    try {
      const shp = parseShp(await this.fs.readFile(shpName));
      const f = shp.frames[frame] ?? shp.frames[0];
      if (!f || f.pixels.length === 0 || f.width <= 0 || f.height <= 0) return;
      const canvas = document.createElement('canvas');
      canvas.width = f.width;
      canvas.height = f.height;
      const ctx = canvas.getContext('2d')!;
      const img = ctx.createImageData(f.width, f.height);
      for (let p = 0; p < f.pixels.length; p++) {
        const idx = f.pixels[p]!;
        if (idx === 0) continue;
        img.data[p * 4] = this.unitPal.rgba[idx * 4]!;
        img.data[p * 4 + 1] = this.unitPal.rgba[idx * 4 + 1]!;
        img.data[p * 4 + 2] = this.unitPal.rgba[idx * 4 + 2]!;
        img.data[p * 4 + 3] = 255;
      }
      ctx.putImageData(img, 0, 0);
      const tex = Texture.from(canvas);
      // 建筑：锚点取底部中心（贴地）；步兵：底部中心
      cache.set(key, {
        tex,
        anchorX: f.width / 2,
        anchorY: isBuilding ? f.height * 0.82 : f.height * 0.85,
      });
      void this.app;
    } catch {
      /* 缺这张就回退占位 */
    }
  }

  building(side: Side, typeId: string): RealSprite | null {
    return this.buildings.get(`${side}:${typeId}`) ?? null;
  }

  infantryOf(typeId: string): RealSprite | null {
    return this.infantry.get(typeId) ?? null;
  }

  /** 按朝向取载具精灵。bangle 0–255。 */
  vehicleOf(side: Side, typeId: string, bangle: number): RealSprite | null {
    const facings = this.vehicles.get(`${side}:${typeId}`);
    if (!facings) return null;
    const idx = (Math.round((bangle / 256) * VEHICLE_FACINGS) % VEHICLE_FACINGS + VEHICLE_FACINGS) % VEHICLE_FACINGS;
    return facings[idx] ?? null;
  }
}
