// ===== render/pixi/actors.ts =====（ARCHITECTURE §6.5 / §6.10 最简 setActors：静帧、无插值）
// 地面角色（air=false）按其格的 depth 插进地面带（SceneLayer.Actor，按深度被建筑遮挡）；空中角色（air=true）进 airLayer。
// 每次 setActors 只改 x/y；深度键跨带（或带内次序被破坏）才重排；ActorSprite.key 原样交给图集 / provider。
// 位置模型（spec:disasters-events §2.12.1）：格 (x,y) + 格内偏移 (px,py)/16 + 离地高度 z（ALTM 单位）。
import { Container } from 'pixi.js';
import type { ActorSprite, RenderSnapshot, SceneCompiler } from '../../contracts/render';
import { SceneLayer, ZOOM_TABLE, bandOf, spriteKeyHash, zKeyOf } from '../../contracts/render';
import { tileIndex } from '../../contracts/grid';
import { rotateTile } from '../../contracts/rotation';
import type { Atlas } from './atlas';
import type { BandSet, SpriteHandle } from './bands';
import { scaleIndexOf } from './resolve';

export interface ActorPlacement { x: number; y: number; depth: number; rx: number }
export interface ActorEntry { slot: number; air: boolean; handle: SpriteHandle }
export interface ActorLayer {
  readonly airLayer: Container; readonly count: number;
  set(actors: readonly ActorSprite[], snap: RenderSnapshot, compiler: SceneCompiler, atlas: Atlas, bands: BandSet): void;
  of(slot: number): ActorEntry | undefined;
  /** 地面树整批重建前调用：地面角色句柄标记为"不在带内"（精灵将被带的 removeChildren 摘下），下次 set 重新插入。 */
  detachGround(): void;
  clear(bands: BandSet): void;
  destroy(): void;
}

const clampTile = (v: number): number => Math.max(0, Math.min(127, Math.floor(v)));

/** 角色锚点（地图像素，c11' 系）：整格顶点 + 格内偏移旋转到屏幕；高度 = max(alt, waterLevel) + z。 */
export function actorPlacement(snap: RenderSnapshot, compiler: SceneCompiler, a: ActorSprite): ActorPlacement {
  const xi = clampTile(a.x), yi = clampTile(a.y), i = tileIndex(xi, yi);
  const ground = Math.max(snap.layers.alt[i]!, snap.layers.waterLevel[i]!);
  const [sx0, sy0] = compiler.worldToScreen(snap, xi, yi, ground + a.z);
  const z = ZOOM_TABLE[snap.view.zoom];
  const S = z.tileW / 2;
  let dx = ((a.px | 0) & 15) / 16, dy = ((a.py | 0) & 15) / 16;
  for (let r = 0; r < snap.view.rotation; r++) { const t = dx; dx = dy; dy = -t; }
  const [rx, ry] = rotateTile(xi, yi, snap.view.rotation);
  return { x: Math.round(sx0 + (dx - dy) * S), y: Math.round(sy0 + ((dx + dy) * S) / 2 + z.tileH), depth: rx + ry, rx };
}

export function createActorLayer(): ActorLayer {
  const airLayer = new Container({ label: 'air' });
  const entries = new Map<number, ActorEntry>();
  const seen = new Set<number>();
  const drop = (e: ActorEntry, bands: BandSet): void => {
    if (e.air) e.handle.sprite.removeFromParent();
    bands.release(e.handle);
    entries.delete(e.slot);
  };
  return {
    airLayer,
    get count() { return entries.size; },
    set(actors, snap, compiler, atlas, bands) {
      seen.clear();
      const sIdx = scaleIndexOf(snap.artScale);
      for (const a of actors) {
        if (seen.has(a.slot)) continue;
        seen.add(a.slot);
        let e = entries.get(a.slot);
        if (e && e.air !== a.air) { drop(e, bands); e = undefined; }
        if (!e) {
          e = { slot: a.slot, air: a.air, handle: bands.acquire() };
          entries.set(a.slot, e);
          if (a.air) airLayer.addChild(e.handle.sprite);
        }
        const h = e.handle;
        const hash = spriteKeyHash(a.key);
        if (h.entry === null || h.keyHash !== hash || h.scaleIdx !== sIdx || !atlas.isValid(h.entry)) {
          const en = atlas.get(a.key, snap.artScale);
          h.entry = en; h.keyHash = hash; h.scaleIdx = sIdx;
          h.sprite.texture = en.texture;
          const ax = en.w > 0 ? en.anchorX / en.w : 0, ay = en.h > 0 ? en.anchorY / en.h : 0;
          if (ax !== h.ax || ay !== h.ay) { h.ax = ax; h.ay = ay; h.sprite.anchor.set(ax, ay); }
        }
        const p = actorPlacement(snap, compiler, a);
        if (h.x !== p.x || h.y !== p.y) { h.x = p.x; h.y = p.y; h.sprite.position.set(p.x, p.y); }
        h.layer = SceneLayer.Actor; h.tile = tileIndex(clampTile(a.x), clampTile(a.y));
        if (!a.air) {
          const band = bandOf(p.depth), zKey = zKeyOf(p.depth, p.rx, SceneLayer.Actor);
          if (!h.inBand) bands.insert(h, band, zKey);
          else if (h.band !== band || h.zKey !== zKey) bands.move(h, band, zKey);
        }
      }
      for (const e of entries.values()) if (!seen.has(e.slot)) drop(e, bands);
    },
    of: (slot) => entries.get(slot),
    detachGround() { for (const e of entries.values()) if (!e.air) e.handle.inBand = false; },
    clear(bands) { for (const e of entries.values()) drop(e, bands); },
    destroy() { airLayer.destroy({ children: true }); entries.clear(); },
  };
}
