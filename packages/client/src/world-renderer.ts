/**
 * 世界渲染器：把确定性 World 的状态画成等距画面。
 * 地形/矿石静态层 + 建筑层（变更时重建）+ 单位层（每帧插值）+ 特效层。
 * 与模拟解耦 —— 只读 World，不改它。
 */
import { Application, Container, Graphics, Sprite } from 'pixi.js';
import type { World, Side } from '@ra2web/game';
import { cornerX, cornerY, leptonToScreenX, leptonToScreenY, TILE_H, TILE_W } from './iso';
import { PLAYER_COLORS, appearanceOf, type ArtAssets } from './placeholder-art';
import type { RealArtProvider } from './real-art';

interface UnitView {
  body: Sprite;
  barrel: Sprite | null;
  prevX: number;
  prevY: number;
  prevFacing: number;
  /** 体素载具：每帧按朝向换贴图。 */
  voxel: { side: Side; typeId: string } | null;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  color: number;
  kind: 'spark' | 'smoke' | 'flash' | 'ring';
}

/**
 * 战斗特效（纯表现，不参与 sim/哈希）：渲染端逐帧比对 World 状态变化
 * 推导事件 —— 掉血溅火星、单位消失爆炸、弹丸命中烟尘、开火枪口闪光。
 */
export class WorldRenderer {
  readonly stage = new Container();
  private readonly terrainGfx = new Graphics();
  private readonly oreGfx = new Graphics();
  private readonly buildingLayer = new Container();
  private readonly unitLayer = new Container();
  private readonly fxGfx = new Graphics();
  private readonly particleGfx = new Graphics();
  private readonly views = new Map<number, UnitView>();
  private buildingKey = '';
  private oreTick = -1;

  // 特效推导用的上一帧快照
  private readonly particles: Particle[] = [];
  private readonly prevHp = new Map<number, number>();
  private readonly prevPos = new Map<number, { x: number; y: number; max: number; building: boolean }>();
  private readonly prevCooldown = new Map<number, number>();
  private readonly prevProj = new Map<number, { x: number; y: number }>();
  private lastFxTime = 0;
  /** 战斗事件回调（接音效）。kind: 开火/命中/爆炸/大爆炸。 */
  onEvent: ((kind: 'fire' | 'cannon' | 'hit' | 'explosion' | 'bigExplosion') => void) | null = null;

  // 战争迷雾（纯渲染，本地玩家视角；0=未探索 1=已探索 2=可见）
  private readonly fogGfx = new Graphics();
  private readonly vis: Uint8Array;
  private readonly fogEnabled: boolean;
  private fogTick = -1;

  constructor(
    private readonly app: Application,
    private readonly world: World,
    private readonly art: ArtAssets,
    /** 本地玩家 id；>0 时启用战争迷雾。 */
    private readonly localPlayerId = 0,
    /** 真实素材（TS）；就绪则建筑/步兵用真实贴图，否则回退占位。 */
    private readonly realArt: RealArtProvider | null = null,
  ) {
    this.unitLayer.sortableChildren = true;
    this.buildingLayer.sortableChildren = true;
    this.fogEnabled = localPlayerId > 0;
    this.vis = new Uint8Array(world.terrain.width * world.terrain.height);
    // 迷雾盖在地形/建筑/单位之上，但在血条/特效之下
    this.stage.addChild(this.terrainGfx, this.oreGfx, this.buildingLayer, this.unitLayer, this.fogGfx, this.fxGfx, this.particleGfx);
    this.drawTerrain();
  }

  /** 某格是否已探索过（已探索或可见）。供小地图判断是否显示。 */
  cellExplored(cx: number, cy: number): boolean {
    if (!this.fogEnabled) return true;
    if (cx < 0 || cy < 0 || cx >= this.world.terrain.width || cy >= this.world.terrain.height) return false;
    return this.vis[cy * this.world.terrain.width + cx] !== 0;
  }

  /** 某格当前是否对本地玩家可见（公开供小地图用）。 */
  isCellVisible(cx: number, cy: number): boolean {
    return this.cellVisible(cx, cy);
  }

  /** 某格当前是否对本地玩家可见（无迷雾时恒真）。 */
  private cellVisible(cx: number, cy: number): boolean {
    if (!this.fogEnabled) return true;
    if (cx < 0 || cy < 0 || cx >= this.world.terrain.width || cy >= this.world.terrain.height) return false;
    return this.vis[cy * this.world.terrain.width + cx] === 2;
  }

  /** 按本地玩家单位/建筑视野重算可见格 + 重绘迷雾。 */
  private updateFog(): void {
    if (!this.fogEnabled || this.world.tick === this.fogTick) return;
    this.fogTick = this.world.tick;
    const w = this.world.terrain.width;
    const h = this.world.terrain.height;
    // 可见(2) 退回已探索(1)
    for (let i = 0; i < this.vis.length; i++) if (this.vis[i] === 2) this.vis[i] = 1;
    for (const e of this.world.entities.values()) {
      if (e.owner !== this.localPlayerId) continue;
      const type = this.world.rules.units.get(e.typeId);
      if (!type) continue;
      const b = type.building;
      const ccx = b ? e.cellX + (b.footprintW - 1) / 2 : e.cellX;
      const ccy = b ? e.cellY + (b.footprintH - 1) / 2 : e.cellY;
      const r = type.sight + (b ? Math.max(b.footprintW, b.footprintH) / 2 : 0);
      const r2 = r * r;
      const minX = Math.max(0, Math.floor(ccx - r));
      const maxX = Math.min(w - 1, Math.ceil(ccx + r));
      const minY = Math.max(0, Math.floor(ccy - r));
      const maxY = Math.min(h - 1, Math.ceil(ccy + r));
      for (let y = minY; y <= maxY; y++) {
        for (let x = minX; x <= maxX; x++) {
          const dx = x - ccx;
          const dy = y - ccy;
          if (dx * dx + dy * dy <= r2) this.vis[y * w + x] = 2;
        }
      }
    }
    // 重绘迷雾盖板：未探索全黑，已探索半暗，可见不画
    const g = this.fogGfx;
    g.clear();
    for (let cy = 0; cy < h; cy++) {
      for (let cx = 0; cx < w; cx++) {
        const v = this.vis[cy * w + cx]!;
        if (v === 2) continue;
        const sx = cornerX(cx, cy);
        const sy = cornerY(cx, cy);
        g.poly([sx, sy, sx + TILE_W / 2, sy + TILE_H / 2, sx, sy + TILE_H, sx - TILE_W / 2, sy + TILE_H / 2]);
        g.fill({ color: 0x000000, alpha: v === 0 ? 1 : 0.5 });
      }
    }
  }

  private playerColor(owner: number): number {
    return PLAYER_COLORS[(owner - 1) % PLAYER_COLORS.length]!;
  }

  private drawTerrain(): void {
    const g = this.terrainGfx;
    const { width, height } = this.world.terrain;
    for (let cy = 0; cy < height; cy++) {
      for (let cx = 0; cx < width; cx++) {
        const x = cornerX(cx, cy);
        const y = cornerY(cx, cy);
        g.poly([x, y, x + TILE_W / 2, y + TILE_H / 2, x, y + TILE_H, x - TILE_W / 2, y + TILE_H / 2]);
        const passable = this.world.terrain.passable(cx, cy);
        const parity = (cx + cy) % 2 === 0;
        g.fill(passable ? (parity ? 0x24341f : 0x1d2b1a) : 0x2e2620);
        g.stroke({ color: 0x000000, alpha: 0.12, width: 1 });
      }
    }
  }

  private drawOre(): void {
    const g = this.oreGfx;
    g.clear();
    const { width, height } = this.world.terrain;
    for (let cy = 0; cy < height; cy++) {
      for (let cx = 0; cx < width; cx++) {
        const ore = this.world.oreAt(cx, cy);
        if (ore <= 0) continue;
        const x = cornerX(cx, cy);
        const y = cornerY(cx, cy);
        const intensity = Math.min(1, ore / 500);
        g.poly([x, y + 3, x + TILE_W / 2 - 3, y + TILE_H / 2, x, y + TILE_H - 3, x - TILE_W / 2 + 3, y + TILE_H / 2]);
        g.fill({ color: 0xf0c020, alpha: 0.25 + intensity * 0.5 });
      }
    }
  }

  private sideOf(owner: number): Side {
    return this.world.players.get(owner)?.side ?? 'allied';
  }

  private rebuildBuildings(): void {
    this.buildingLayer.removeChildren();
    for (const e of this.world.entities.values()) {
      const type = this.world.rules.units.get(e.typeId);
      if (!type?.building) continue;
      const fw = type.building.footprintW;
      const fh = type.building.footprintH;
      const real = this.realArt?.ready ? this.realArt.building(this.sideOf(e.owner), e.typeId) : null;
      const sp = new Sprite(real ? real.tex : this.art.buildingTextures.get(e.typeId)?.tex);
      sp.zIndex = cornerY(e.cellX + fw, e.cellY + fh);
      if (real) {
        // 真实贴图：底中心贴在足迹中心点，保留原色（不 tint）
        sp.anchor.set(real.anchorX / sp.texture.width, real.anchorY / sp.texture.height);
        const cx = (cornerX(e.cellX, e.cellY) + cornerX(e.cellX + fw, e.cellY + fh)) / 2;
        const cy = (cornerY(e.cellX, e.cellY) + cornerY(e.cellX + fw, e.cellY + fh)) / 2;
        sp.position.set(cx, cy + TILE_H / 2);
      } else {
        const art = this.art.buildingTextures.get(e.typeId);
        if (!art) continue;
        sp.position.set(cornerX(e.cellX, e.cellY) - art.anchorX, cornerY(e.cellX, e.cellY) - art.anchorY);
        sp.tint = this.playerColor(e.owner);
      }
      this.buildingLayer.addChild(sp);

      // 受损血条（置于足迹中心上方）
      if (e.hp < e.maxHp) {
        const bar = new Graphics();
        const w = fw * 10;
        bar.rect(-w / 2, 0, w, 3).fill(0x000000);
        bar.rect(-w / 2, 0, (w * e.hp) / e.maxHp, 3).fill(0x40e040);
        const cx = (cornerX(e.cellX, e.cellY) + cornerX(e.cellX + fw, e.cellY + fh)) / 2;
        const cy = (cornerY(e.cellX, e.cellY) + cornerY(e.cellX + fw, e.cellY + fh)) / 2;
        bar.position.set(cx, cy - TILE_H);
        bar.zIndex = sp.zIndex + 1;
        this.buildingLayer.addChild(bar);
      }
    }
  }

  /** 每帧调用：alpha 为 tick 间插值系数 [0,1)。 */
  render(alpha: number, selected: ReadonlySet<number>): void {
    // 建筑层：集合变化或受损变化时重建（开销低、频率低）
    let key = '';
    for (const e of this.world.entities.values()) {
      if (this.world.rules.units.get(e.typeId)?.building) key += `${e.id},${e.hp};`;
    }
    if (key !== this.buildingKey) {
      this.buildingKey = key;
      this.rebuildBuildings();
    }

    if (this.world.tick !== this.oreTick && this.world.tick % 6 === 0) {
      this.oreTick = this.world.tick;
      this.drawOre();
    }

    this.updateFog();

    // 单位层
    const seen = new Set<number>();
    for (const e of this.world.entities.values()) {
      const type = this.world.rules.units.get(e.typeId);
      if (!type || type.domain === 'building') continue;
      seen.add(e.id);
      let v = this.views.get(e.id);
      if (!v) {
        const side = this.sideOf(e.owner);
        // 载具优先用真实体素（按朝向），步兵用真实 SHP，否则占位
        const realVeh =
          type.domain === 'vehicle' && this.realArt?.ready ? this.realArt.vehicleOf(side, e.typeId, e.facing) : null;
        const realInf =
          type.domain === 'infantry' && this.realArt?.ready ? this.realArt.infantryOf(e.typeId) : null;
        const real = realVeh ?? realInf;
        const body = new Sprite(
          real ? real.tex : type.domain === 'vehicle' ? this.art.vehicleBody : this.art.infantryBody,
        );
        if (real) {
          body.anchor.set(real.anchorX / body.texture.width, real.anchorY / body.texture.height);
        } else {
          body.anchor.set(0.5);
          body.tint = this.playerColor(e.owner);
        }
        // 真实体素载具自带炮塔，无需占位炮管
        const barrel =
          !realVeh && type.weapon && type.domain === 'vehicle' ? new Sprite(this.art.vehicleBarrel) : null;
        if (barrel) {
          barrel.anchor.set(0.25, 0.5);
          barrel.tint = 0x3a4048;
        }
        this.unitLayer.addChild(body);
        if (barrel) this.unitLayer.addChild(barrel);
        v = {
          body,
          barrel,
          prevX: e.x,
          prevY: e.y,
          prevFacing: e.facing,
          voxel: realVeh ? { side, typeId: e.typeId } : null,
        };
        this.views.set(e.id, v);
      }
      // 体素载具：按当前朝向换贴图与锚点
      if (v.voxel && this.realArt) {
        const vs = this.realArt.vehicleOf(v.voxel.side, v.voxel.typeId, e.facing);
        if (vs) {
          v.body.texture = vs.tex;
          v.body.anchor.set(vs.anchorX / vs.tex.width, vs.anchorY / vs.tex.height);
        }
      }
      const ix = v.prevX + (e.x - v.prevX) * alpha;
      const iy = v.prevY + (e.y - v.prevY) * alpha;
      const sx = leptonToScreenX(ix, iy);
      const sy = leptonToScreenY(ix, iy);
      v.body.position.set(sx, sy);
      v.body.zIndex = sy;
      v.body.scale.set(selected.has(e.id) ? 1.15 : 1);
      // 敌方单位仅在可见格显示（迷雾隐藏）
      const visible = e.owner === this.localPlayerId || this.cellVisible(e.cellX, e.cellY);
      v.body.visible = visible;
      if (v.barrel) {
        v.barrel.visible = visible;
        v.barrel.position.set(sx, sy);
        v.barrel.zIndex = sy + 0.1;
        const rad = (e.facing / 256) * Math.PI * 2;
        const dx = Math.cos(rad);
        const dy = Math.sin(rad);
        v.barrel.rotation = Math.atan2(((dx + dy) * TILE_H) / 2, ((dx - dy) * TILE_W) / 2);
      }
    }
    // 回收消失单位
    for (const [id, v] of this.views) {
      if (!seen.has(id)) {
        v.body.destroy();
        v.barrel?.destroy();
        this.views.delete(id);
      }
    }

    // 特效层：选中环 + 血条 + 弹丸
    const fx = this.fxGfx;
    fx.clear();
    for (const e of this.world.entities.values()) {
      const type = this.world.rules.units.get(e.typeId);
      if (!type || type.domain === 'building') continue;
      const v = this.views.get(e.id);
      if (!v || !v.body.visible) continue; // 迷雾中的敌方单位不画血条/选中环
      const sx = v.body.position.x;
      const sy = v.body.position.y;
      if (selected.has(e.id)) {
        fx.ellipse(sx, sy + 4, 16, 9).stroke({ color: 0x88ee88, width: 1.5 });
      }
      if (e.hp < e.maxHp) {
        fx.rect(sx - 12, sy - 16, 24, 3).fill(0x000000);
        fx.rect(sx - 12, sy - 16, (24 * e.hp) / e.maxHp, 3).fill(0x40e040);
      }
    }
    for (const p of this.world.projectiles) {
      const sx = leptonToScreenX(p.x, p.y);
      const sy = leptonToScreenY(p.x, p.y);
      fx.circle(sx, sy, 2.5).fill(0xffe060);
    }

    this.updateEffects();
  }

  /** 推导战斗事件 + 推进/绘制粒子（纯表现）。 */
  private updateEffects(): void {
    const now = performance.now();
    const dt = this.lastFxTime === 0 ? 16 : Math.min(64, now - this.lastFxTime);
    this.lastFxTime = now;

    const seen = new Set<number>();
    for (const e of this.world.entities.values()) {
      seen.add(e.id);
      const sx = leptonToScreenX(e.x, e.y);
      const sy = leptonToScreenY(e.x, e.y);
      const isBuilding = !!this.world.rules.units.get(e.typeId)?.building;
      // 掉血 → 火星
      const ph = this.prevHp.get(e.id);
      if (ph !== undefined && e.hp < ph) {
        const n = isBuilding ? 4 : 2;
        for (let i = 0; i < n; i++) this.spawnSpark(sx, sy - 4);
      }
      // 开火（冷却被重置抬升）→ 枪口闪光
      const pc = this.prevCooldown.get(e.id) ?? 0;
      if (e.cooldown > pc + 1 && e.targetId !== null) {
        this.particles.push({ x: sx, y: sy - 4, vx: 0, vy: 0, life: 90, maxLife: 90, size: isBuilding ? 7 : 4, color: 0xfff2a0, kind: 'flash' });
        const weapon = this.world.rules.units.get(e.typeId)?.weapon;
        this.onEvent?.(weapon && weapon.projectileSpeed > 0 ? 'cannon' : 'fire');
      }
      this.prevHp.set(e.id, e.hp);
      this.prevCooldown.set(e.id, e.cooldown);
      this.prevPos.set(e.id, { x: sx, y: sy, max: e.maxHp, building: isBuilding });
    }
    // 单位消失 → 爆炸
    for (const [id, pos] of this.prevPos) {
      if (seen.has(id)) continue;
      this.spawnExplosion(pos.x, pos.y, pos.building ? 2.2 : 1);
      this.onEvent?.(pos.building ? 'bigExplosion' : 'explosion');
      this.prevPos.delete(id);
      this.prevHp.delete(id);
      this.prevCooldown.delete(id);
    }
    // 弹丸命中（消失）→ 烟尘
    const projSeen = new Set<number>();
    for (const p of this.world.projectiles) {
      projSeen.add(p.id);
      this.prevProj.set(p.id, { x: leptonToScreenX(p.x, p.y), y: leptonToScreenY(p.x, p.y) });
    }
    for (const [id, pos] of this.prevProj) {
      if (projSeen.has(id)) continue;
      this.spawnExplosion(pos.x, pos.y, 0.7);
      this.prevProj.delete(id);
    }

    // 推进 + 绘制
    const g = this.particleGfx;
    g.clear();
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i]!;
      p.life -= dt;
      if (p.life <= 0) {
        this.particles.splice(i, 1);
        continue;
      }
      p.x += (p.vx * dt) / 1000;
      p.y += (p.vy * dt) / 1000;
      p.vy += (dt * 60) / 1000; // 轻微重力
      const a = p.life / p.maxLife;
      if (p.kind === 'ring') {
        g.circle(p.x, p.y, p.size * (1.4 - a)).stroke({ color: p.color, width: 2, alpha: a });
      } else {
        g.circle(p.x, p.y, p.size * (p.kind === 'smoke' ? 1.4 - a : a)).fill({ color: p.color, alpha: a });
      }
    }
  }

  private spawnSpark(x: number, y: number): void {
    const ang = (this.particles.length * 2.4) % (Math.PI * 2);
    this.particles.push({ x, y, vx: Math.cos(ang) * 40, vy: -20 - (this.particles.length % 30), life: 280, maxLife: 280, size: 2, color: 0xffd060, kind: 'spark' });
  }

  private spawnExplosion(x: number, y: number, scale: number): void {
    this.particles.push({ x, y, vx: 0, vy: 0, life: 320, maxLife: 320, size: 10 * scale, color: 0xffa030, kind: 'ring' });
    const n = Math.round(6 * scale);
    for (let i = 0; i < n; i++) {
      const ang = (i / n) * Math.PI * 2;
      const spd = 30 + (i % 3) * 18;
      this.particles.push({ x, y, vx: Math.cos(ang) * spd, vy: Math.sin(ang) * spd - 15, life: 360, maxLife: 360, size: 3 + (i % 2) + scale, color: i % 2 ? 0xff8020 : 0x555555, kind: 'smoke' });
    }
  }

  /** 在每次 sim step 之前调用：把当前位置存为插值起点。 */
  commitInterpolation(): void {
    for (const e of this.world.entities.values()) {
      const v = this.views.get(e.id);
      if (v) {
        v.prevX = e.x;
        v.prevY = e.y;
        v.prevFacing = e.facing;
      }
    }
  }

  /** 世界格 → stage 局部坐标（放置预览用）。 */
  cellTopScreen(cellX: number, cellY: number): { x: number; y: number } {
    void this.app;
    return { x: cornerX(cellX, cellY), y: cornerY(cellX, cellY) };
  }
}

export { TILE_W, TILE_H, appearanceOf };
