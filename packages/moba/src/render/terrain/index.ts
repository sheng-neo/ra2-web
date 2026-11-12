/**
 * 地形模块：严格按 createMap() 的数据生成整张「星陨高原」的静态场景。
 *
 *   field.ts    地图距离场(唯一事实来源) + splat 烘焙
 *   ground.ts   地表着色(草/石板路/泥土/方砖/河床)      textures.ts  地表贴图绘制
 *   water.ts    河道水面                                 decals.ts    贴地纹样(塔座/水晶座/泉水/营地法阵/光晕)
 *   cliffs.ts   墙体 → 断崖石台                          border.ts    边界外装饰带 + 瀑布
 *   grass.ts    草丛(可被单位拨开的高草)                 bases.ts     基地/营地立体装饰
 *   models.ts   点缀物原型      scatter.ts  散布规则     motes.ts     环境粒子      sky.ts  天穹/云海/远山
 *
 * 所有静态几何都合并成按 32 米分块的少量网格；动画全部由共享 uniform(uTime/uWind) 在着色器里完成。
 */
import * as THREE from 'three';
import type { RenderContext, RenderModule, TerrainQuery } from '../engine/context';
import { disposeObject3D } from '../engine/dispose';
import { createToonMaterial, getRockTexture, makeNoiseTexture } from '../materials';
import { decorateBases } from './bases';
import { buildBorder, createBorderInfo, createWaterfalls, scatterBorder } from './border';
import { buildCliff, type CliffInfo } from './cliffs';
import { type DecalSpec, createDecals, mapDecals } from './decals';
import { MapField, WATER_LEVEL, bakeSplat } from './field';
import { SceneryBatcher, centroid, rgb } from './geo';
import { MAX_PUSHERS, createBushes } from './grass';
import { createGround } from './ground';
import { createPropLibrary } from './models';
import { type MoteSource, createMotes } from './motes';
import { type ScatterResult, scatterGround, scatterWallTops } from './scatter';
import { createSky } from './sky';
import { createWater } from './water';

export function createTerrainModule(ctx: RenderContext): RenderModule {
  const map = ctx.map;
  const field = new MapField(map);
  const maxAniso = ctx.renderer.capabilities.getMaxAnisotropy();
  const splat = bakeSplat(field, 1024);
  const noise = makeNoiseTexture(256, 7);
  const root = ctx.layers.terrain;
  const q = ctx.settings;

  // ── 地表与水面 ──
  const ground = createGround(field, splat, noise, q, maxAniso);
  root.add(ground.mesh);
  root.add(createWater(field, splat, noise));

  // ── 材质：岩体(按面着色 + 三向投影岩石肌理) / 实体景物 / 贴地小物 ──
  const rockTex = getRockTexture();
  const cliffMat = createToonMaterial({ vertexColors: true, flat: true, steps: 2, softness: 0.14, map: rockTex, triplanar: 0.3, mapGain: 1.75, rim: 0.08, shadeTint: 0xd0d8f4 });
  const sceneryMat = createToonMaterial({ vertexColors: true, steps: 2, softness: 0.2, rim: 0.16, rimPower: 2.6, wind: 0.42, glowBoost: 1.7 });
  const clutterMat = createToonMaterial({ vertexColors: true, steps: 1, rim: 0, wind: 0.3, glowBoost: 1.5, side: THREE.DoubleSide });

  // ── 墙体断崖(按 32 米分块合并) ──
  const cliffBatch = new SceneryBatcher(32);
  const cliffs: CliffInfo[] = map.walls.map((poly, i) => {
    const c = centroid(poly);
    return buildCliff(cliffBatch.at(c.x, c.y, true), poly, 100 + i * 7);
  });
  const cliffRoot = new THREE.Group();
  cliffRoot.name = 'cliffs';
  root.add(cliffRoot);
  cliffBatch.build(cliffMat, cliffMat, cliffRoot, 'cliff', true);

  // ── 边界外装饰带 ──
  const border = createBorderInfo(field);
  const borderRoot = new THREE.Group();
  borderRoot.name = 'border';
  root.add(borderRoot);
  buildBorder(field, border, borderRoot, cliffMat);

  // ── 点缀物 ──
  const lib = createPropLibrary();
  const batch = new SceneryBatcher(32);
  const scatter: ScatterResult = { glows: [] };
  const moteSources: MoteSource[] = [];
  scatterWallTops(batch, lib, field, cliffs, scatter);
  scatterGround(batch, lib, field, 1, scatter);
  scatterBorder(batch, lib, field, border, scatter);
  decorateBases(batch, lib, field, border, cliffs, scatter, moteSources);
  const sceneryRoot = new THREE.Group();
  sceneryRoot.name = 'scenery';
  root.add(sceneryRoot);
  batch.build(sceneryMat, clutterMat, sceneryRoot, 'scenery');
  lib.dispose();
  root.add(createWaterfalls(field, border, noise, scatter));

  // ── 贴地纹样：固定纹样 + 发光体脚下的光晕 ──
  const decals: DecalSpec[] = mapDecals(field);
  for (const g of scatter.glows) decals.push({ type: 6, x: g.x, y: g.y, z: g.z, radius: g.r, colorA: g.color, colorB: [0, 0, 0], seed: (g.x * 7.3 + g.z * 3.1) % 1, w: 0.55 });
  root.add(createDecals(decals, map.bound));

  // ── 草丛 ──
  const bushes = createBushes(field, q);
  root.add(bushes.group);

  // ── 环境粒子 ──
  for (const g of scatter.glows) {
    if (g.r < 1.2) continue;
    moteSources.push({ x: g.x, y: g.y + 0.3, z: g.z, radius: Math.min(2.2, g.r * 0.6), color: g.color, count: g.r > 3 ? 5 : 2, mode: 0, range: 1.6, size: 0.75 });
  }
  const pollen = rgb(0xfff2b0);
  for (const b of map.bushes) {
    const c = centroid(b);
    moteSources.push({ x: c.x, y: 0.9, z: c.y, radius: 2.6, color: pollen, count: 6, mode: 0, range: 1.2, size: 0.6 });
  }
  const rl = field.riverLine;
  const star = rgb(0xbff4ff);
  for (let s = 0; s < rl.length - 1; s++) {
    const a = rl[s];
    const b = rl[s + 1];
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    for (let d = 0; d < len; d += 3.2) {
      const x = a.x + ((b.x - a.x) * d) / len;
      const z = a.y + ((b.y - a.y) * d) / len;
      if (field.boundDist(x, z) < 1) continue;
      moteSources.push({ x, y: WATER_LEVEL + 0.05, z, radius: map.riverWidth * 0.42, color: star, count: 3, mode: 1, range: 1.3, size: 0.6 });
    }
  }
  const motes = createMotes(moteSources, q);
  root.add(motes.points);

  // ── 远景 ──
  root.add(createSky(cliffMat));

  const query: TerrainQuery = {
    heightAt: (x, y) => field.heightAt(x, y),
    waterLevel: WATER_LEVEL,
    inWater: (x, y) => field.inWater(x, y),
  };
  ctx.terrain = query;

  const pushers = new Float32Array(MAX_PUSHERS * 4);
  const pos = new THREE.Vector3();
  const syncViewport = (): void => motes.resize(ctx.viewport.height * ctx.viewport.dpr, ctx.camera.fov);
  syncViewport();

  return {
    name: 'terrain',
    update(frame) {
      // 草丛里的可见单位把草拨开；玩家自己所在的草丛再额外变通透
      const st = frame.state;
      let n = 0;
      let revealed = false;
      for (const u of st.units) {
        if (u.bushId < 0 || !u.alive) continue;
        if (u.team !== frame.playerTeam && !u.visible[frame.playerTeam]) continue;
        if (!ctx.unitQuery.getPosition(u.id, pos)) continue;
        if (u.id === st.playerId) {
          bushes.setReveal(pos.x, pos.z, 3.4, 1);
          revealed = true;
        }
        if (n < MAX_PUSHERS) {
          pushers[n * 4] = pos.x;
          pushers[n * 4 + 1] = pos.z;
          pushers[n * 4 + 2] = u.radius + 0.95;
          pushers[n * 4 + 3] = 1;
          n++;
        }
      }
      bushes.setPushers(pushers, n);
      if (!revealed) bushes.setReveal(0, 0, 1, 0);
    },
    setQuality(s) {
      ground.setQuality(s);
      bushes.setQuality(s);
      motes.setQuality(s);
    },
    resize: syncViewport,
    dispose() {
      disposeObject3D(root);
      root.clear();
      splat.a.dispose();
      splat.b.dispose();
      noise.dispose();
    },
  };
}
