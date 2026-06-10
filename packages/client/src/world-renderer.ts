/**
 * 世界渲染器：把确定性 World 的状态画成等距画面。
 * 地形/矿石静态层 + 建筑层（变更时重建）+ 单位层（每帧插值）+ 特效层。
 * 与模拟解耦 —— 只读 World，不改它。
 */
import { Application, Container, Graphics, Sprite } from 'pixi.js';
import type { World } from '@ra2web/game';
import { cornerX, cornerY, leptonToScreenX, leptonToScreenY, TILE_H, TILE_W } from './iso';
import { PLAYER_COLORS, appearanceOf, type ArtAssets } from './placeholder-art';

interface UnitView {
  body: Sprite;
  barrel: Sprite | null;
  prevX: number;
  prevY: number;
  prevFacing: number;
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

  constructor(
    private readonly app: Application,
    private readonly world: World,
    private readonly art: ArtAssets,
  ) {
    this.unitLayer.sortableChildren = true;
    this.buildingLayer.sortableChildren = true;
    this.stage.addChild(this.terrainGfx, this.oreGfx, this.buildingLayer, this.unitLayer, this.fxGfx, this.particleGfx);
    this.drawTerrain();
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

  private rebuildBuildings(): void {
    this.buildingLayer.removeChildren();
    for (const e of this.world.entities.values()) {
      const type = this.world.rules.units.get(e.typeId);
      if (!type?.building) continue;
      const art = this.art.buildingTextures.get(e.typeId);
      if (!art) continue;
      const sp = new Sprite(art.tex);
      const baseX = cornerX(e.cellX, e.cellY);
      const baseY = cornerY(e.cellX, e.cellY);
      sp.position.set(baseX - art.anchorX, baseY - art.anchorY);
      sp.tint = this.playerColor(e.owner);
      sp.zIndex = cornerY(e.cellX + type.building.footprintW, e.cellY + type.building.footprintH);
      this.buildingLayer.addChild(sp);

      // 受损血条
      if (e.hp < e.maxHp) {
        const bar = new Graphics();
        const w = type.building.footprintW * 10;
        bar.rect(-w / 2, 0, w, 3).fill(0x000000);
        bar.rect(-w / 2, 0, (w * e.hp) / e.maxHp, 3).fill(0x40e040);
        bar.position.set(baseX + (type.building.footprintW - type.building.footprintH) * (TILE_W / 4), baseY + 4);
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

    // 单位层
    const seen = new Set<number>();
    for (const e of this.world.entities.values()) {
      const type = this.world.rules.units.get(e.typeId);
      if (!type || type.domain === 'building') continue;
      seen.add(e.id);
      let v = this.views.get(e.id);
      if (!v) {
        const body = new Sprite(type.domain === 'vehicle' ? this.art.vehicleBody : this.art.infantryBody);
        body.anchor.set(0.5);
        body.tint = this.playerColor(e.owner);
        const barrel = type.weapon && type.domain === 'vehicle' ? new Sprite(this.art.vehicleBarrel) : null;
        if (barrel) {
          barrel.anchor.set(0, 0.5);
          barrel.tint = 0x202020;
        }
        this.unitLayer.addChild(body);
        if (barrel) this.unitLayer.addChild(barrel);
        v = { body, barrel, prevX: e.x, prevY: e.y, prevFacing: e.facing };
        this.views.set(e.id, v);
      }
      const ix = v.prevX + (e.x - v.prevX) * alpha;
      const iy = v.prevY + (e.y - v.prevY) * alpha;
      const sx = leptonToScreenX(ix, iy);
      const sy = leptonToScreenY(ix, iy);
      v.body.position.set(sx, sy);
      v.body.zIndex = sy;
      v.body.scale.set(selected.has(e.id) ? 1.15 : 1);
      if (v.barrel) {
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
      if (!v) continue;
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
      }
      this.prevHp.set(e.id, e.hp);
      this.prevCooldown.set(e.id, e.cooldown);
      this.prevPos.set(e.id, { x: sx, y: sy, max: e.maxHp, building: isBuilding });
    }
    // 单位消失 → 爆炸
    for (const [id, pos] of this.prevPos) {
      if (seen.has(id)) continue;
      this.spawnExplosion(pos.x, pos.y, pos.building ? 2.2 : 1);
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
