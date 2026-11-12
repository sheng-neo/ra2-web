/**
 * 地形模块：严格按 createMap() 的数据生成整张「星陨高原」的静态场景。
 *
 *   field.ts    地图距离场(唯一事实来源) + splat 烘焙(含低画质的静态受光蒙版)
 *   ground.ts   地表着色(草/石板路/腐殖土/基地环形铺装/河床/营地主题)   textures.ts  地表贴图绘制
 *   water.ts    河道水面                 decals.ts   贴地纹样(塔座/水晶座/泉水池/营地法阵/光晕/AO 暗斑/涟漪/地洞)
 *   cliffs.ts   墙体 → 断崖石台(岩柱/壁龛)   border.ts   边界外装饰带(含基地城垣) + 瀑布
 *   grass.ts    草丛(可被单位拨开的高草)     bases.ts    基地立体装饰(门阙/垛口/扶壁/泉水池沿)   architecture.ts 建筑构件原型
 *   models.ts   点缀物原型                   scatter.ts  散布规则        lanes.ts   兵线路缘石
 *   props.ts    装饰构件(星灯柱/残碑/队旗/系石桩/守望像/地面嵌饰)        camps.ts   各营地的环境布景
 *   tint.ts     环境染色贴图的盖印           atmos.ts    体积光束与薄雾   motes.ts   环境粒子   sky.ts  天穹/云海/远山
 *
 * 所有静态几何都合并成按 32 米分块的少量网格；动画全部由共享 uniform(uTime/uWind) 在着色器里完成。
 * 相比第一版只多一个 draw call(氛围层)。
 */
import * as THREE from 'three';
import type { RenderContext, RenderModule, TerrainQuery } from '../engine/context';
import { disposeObject3D } from '../engine/dispose';
import { SUN_DIR, SUN_SHADOW_DIR, SUN_SHADOW_LENGTH } from '../engine/lighting';
import { PALETTE, createToonMaterial, getRockTexture, makeNoiseTexture } from '../materials';
import { type AtmosSpec, createAtmos } from './atmos';
import { decorateBases } from './bases';
import { buildBorder, createBorderInfo, createWaterfalls, scatterBorder } from './border';
import { decorateCamps } from './camps';
import { buildCliff, type CliffInfo } from './cliffs';
import { type DecalSpec, createDecals, mapDecals } from './decals';
import { MapField, WATER_LEVEL, bakeSplat, stampStaticShadows } from './field';
import { SceneryBatcher, centroid, rgb } from './geo';
import { MAX_PUSHERS, createBushes } from './grass';
import { createGround } from './ground';
import { buildLaneCurbs } from './lanes';
import { createPropLibrary } from './models';
import { type MoteSource, createMotes } from './motes';
import { createPropKit, pickNiches, placeProps } from './props';
import { GlowGrid, type ScatterResult, createScatterResult, scatterGround, scatterWallTops } from './scatter';
import { createSky } from './sky';
import { stampLightTint } from './tint';
import { createWater } from './water';

interface CulledCell {
  mesh: THREE.Mesh;
  box: THREE.Box3;
}

/** 最高的投影物(崖顶树冠)大约多高(米)：分块包围盒按它的影长朝背光方向外扩 */
const SHADOW_CASTER_HEIGHT = 10;
/** 崖顶贴图的第二尺度与色斑(材质侧的可选细节)。顶面的大块色斑已经烘在顶点色里，这里只决定要不要再叠材质那一层 */
const MAP_TOP_DETAIL = false;
/** 岩体法线的折痕角 */
const CREASE_DEG = 35;

const _frustum = new THREE.Frustum();
const _projView = new THREE.Matrix4();

/** 地形模块：在 RenderModule 之外附带各构建阶段的耗时(毫秒)与几何统计，供调试/加载进度参考 */
export interface TerrainModule extends RenderModule {
  readonly timings: Record<string, number>;
  /** 各类静态几何的三角形数(全图)与贴花、氛围实例的数量 */
  readonly counts: Record<string, number>;
}

export function createTerrainModule(ctx: RenderContext): TerrainModule {
  const timings: Record<string, number> = {};
  const counts: Record<string, number> = {};
  let mark = performance.now();
  const lap = (name: string): void => {
    const now = performance.now();
    timings[name] = Math.round(now - mark);
    mark = now;
  };
  const map = ctx.map;
  const field = new MapField(map);
  const maxAniso = ctx.renderer.capabilities.getMaxAnisotropy();
  const splat = bakeSplat(field, 768, SUN_DIR);
  lap('splat');
  const noise = makeNoiseTexture(256, 7);
  lap('noise');
  const root = ctx.layers.terrain;
  const q = ctx.settings;

  // ── 地表与水面 ──
  const ground = createGround(field, splat, noise, q, maxAniso);
  root.add(ground.mesh);
  const water = createWater(field, splat, noise, q);
  root.add(water.mesh);
  lap('ground');

  // ── 材质：岩体(平滑法线 + 折痕、三阶明暗、三向投影岩石肌理、顶面铺草贴图) / 实体景物 / 贴地小物 ──
  const rockTex = getRockTexture();
  const cliffMat = createToonMaterial({
    vertexColors: true,
    ramp: [0.05, 0.42, 0.55],
    softness: 0.1,
    map: rockTex,
    triplanar: 0.3,
    mapGain: 1.75,
    mapMask: true,
    rim: 0.08,
    kicker: 0.1,
    shadeTint: PALETTE.env.shadeRock,
    mapTop: ground.grassTexture,
    mapTopScale: 0.1,
    mapTopNoise: noise,
    mapTopDetail: MAP_TOP_DETAIL && q.groundDetail > 0,
  });
  // 实体景物(树、石、构件、建筑件)：三阶明暗但边界放软——树冠读成柔和的体块，石件仍有亮/灰/暗三个面
  const sceneryMat = createToonMaterial({ vertexColors: true, ramp: [0.02, 0.42, 0.56], softness: 0.2, rim: 0.12, rimPower: 2.6, kicker: 0.12, wind: 0.42, glowBoost: 1.7, shadeTint: PALETTE.env.shadeRock });
  const clutterMat = createToonMaterial({ vertexColors: true, steps: 1, rim: 0, wind: 0.3, glowBoost: 1.5, side: THREE.DoubleSide });

  // ── 墙体断崖(按 32 米分块合并)。先选好壁龛的位置，石台在那里加宽一级 ──
  const nicheSpots = pickNiches(field);
  const cliffBatch = new SceneryBatcher(32);
  const cliffs: CliffInfo[] = map.walls.map((poly, i) => {
    const c = centroid(poly);
    return buildCliff(cliffBatch.at(c.x, c.y, true), poly, 100 + i * 7, { niches: nicheSpots[i] });
  });
  counts.cliffs = cliffBatch.triangleCount;
  const cliffRoot = new THREE.Group();
  cliffRoot.name = 'cliffs';
  root.add(cliffRoot);
  const cells: CulledCell[] = [];
  const track = (meshes: THREE.Mesh[]): void => {
    for (const mesh of meshes) {
      mesh.frustumCulled = false;
      const box = (mesh.geometry.boundingBox as THREE.Box3).clone();
      if (mesh.castShadow) {
        // 影子落向背光一侧：把包围盒朝投影方向外扩，保证画面外的投影者仍在阴影通道里
        const reach = SHADOW_CASTER_HEIGHT * SUN_SHADOW_LENGTH;
        const sx = SUN_SHADOW_DIR.x * reach;
        const sz = SUN_SHADOW_DIR.y * reach;
        if (sx > 0) box.max.x += sx;
        else box.min.x += sx;
        if (sz > 0) box.max.z += sz;
        else box.min.z += sz;
      }
      box.expandByScalar(0.8);
      cells.push({ mesh, box });
    }
  };
  track(cliffBatch.build(cliffMat, cliffMat, cliffRoot, 'cliff', CREASE_DEG));
  lap('cliffs');

  // ── 边界外装饰带 ──
  const border = createBorderInfo(field);
  const borderRoot = new THREE.Group();
  borderRoot.name = 'border';
  root.add(borderRoot);
  track(buildBorder(field, border, borderRoot, cliffMat));
  lap('border');

  // ── 点缀物、路缘石、装饰构件、营地布景、基地建筑：全部并进同一组分块网格 ──
  const lib = createPropLibrary();
  const kit = createPropKit();
  lap('props');
  const batch = new SceneryBatcher(32);
  const scatter: ScatterResult = createScatterResult();
  const glow = new GlowGrid(8);
  const moteSources: MoteSource[] = [];
  const atmosSpecs: AtmosSpec[] = [];
  const decals: DecalSpec[] = mapDecals(field);
  // 营地与基地的主题发光件先占位，散件让它们
  decorateCamps(batch, lib, field, cliffs, scatter, glow, moteSources, atmosSpecs);
  decorateBases(batch, lib, kit, field, border, cliffs, scatter, glow, moteSources, atmosSpecs);
  counts.campsBases = batch.triangleCount;
  placeProps(batch, kit, field, cliffs, scatter, glow, moteSources);
  counts.props = batch.triangleCount - counts.campsBases;
  counts.curbs = buildLaneCurbs(batch, field);
  const beforeScatter = batch.triangleCount;
  scatterWallTops(batch, lib, field, cliffs, scatter, glow);
  scatterGround(batch, lib, field, 1, scatter, glow);
  scatterBorder(batch, lib, field, border, scatter);
  counts.scatter = batch.triangleCount - beforeScatter;
  lap('scatter');
  const sceneryRoot = new THREE.Group();
  sceneryRoot.name = 'scenery';
  root.add(sceneryRoot);
  track(batch.build(sceneryMat, clutterMat, sceneryRoot, 'scenery'));
  lib.dispose();
  kit.dispose();
  root.add(createWaterfalls(field, border, noise, scatter));
  lap('merge');

  // ── 低画质的静态投影：树冠等高物的影子盖进受光蒙版 ──
  stampStaticShadows(splat, scatter.casters, SUN_DIR);

  // ── 贴地纹样：固定纹样 + 发光体脚下的光晕 + 涟漪圈 + AO 暗斑(最后画，压在铺装上面) ──
  for (const g of scatter.glows) decals.push({ type: 6, x: g.x, y: g.y, z: g.z, radius: g.r * 1.3, colorA: g.color, colorB: [0, 0, 0], seed: Math.abs(g.x * 7.3 + g.z * 3.1) % 1, w: 0.38 });
  const rippleCol = rgb(0xdff6ff);
  for (const r of scatter.ripples) decals.push({ type: 8, x: r.x, y: WATER_LEVEL + 0.02, z: r.z, radius: r.r * 1.6, colorA: rippleCol, colorB: [0, 0, 0], seed: Math.abs(r.x * 0.731 + r.z * 0.377) % 1 });
  for (const t of map.towers) scatter.aoBlobs.push({ x: t.pos.x, y: 0.04, z: t.pos.y, r: 2.6, strength: 0.42 });
  for (const b of map.bases) scatter.aoBlobs.push({ x: b.core.x, y: 0.04, z: b.core.y, r: 4.2, strength: 0.42 });
  for (const a of scatter.aoBlobs) decals.push({ type: 7, x: a.x, y: a.y, z: a.z, radius: a.r, colorA: [0, 0, 0], colorB: [0, 0, 0], w: a.strength });
  const decalLayer = createDecals(decals, map.bound);
  root.add(decalLayer.mesh);
  counts.decals = decals.length;
  counts.aoBlobs = scatter.aoBlobs.length;
  counts.glows = scatter.glows.length;

  // ── 草丛 ──
  const bushes = createBushes(field, q);
  root.add(bushes.group);
  lap('bushes');

  // ── 环境染色贴图：基地/泉水/塔/河道/营地/发光体的色斑 + 树冠下的天光遮蔽 ──
  stampLightTint(ctx.lightTint, field, scatter);

  // ── 环境粒子 ──
  for (const g of scatter.glows) {
    if (g.r < 1.2) continue;
    moteSources.push({ x: g.x, y: g.y + 0.3, z: g.z, radius: Math.min(2.2, g.r * 0.6), color: g.color, count: g.r > 3 ? 4 : 2, mode: 0, range: 1.6, size: 0.75 });
  }
  const pollen = rgb(0xfff2b0);
  for (const b of map.bushes) {
    const c = centroid(b);
    moteSources.push({ x: c.x, y: 0.9, z: c.y, radius: 2.6, color: pollen, count: 5, mode: 0, range: 1.2, size: 0.6 });
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
      moteSources.push({ x, y: WATER_LEVEL + 0.05, z, radius: map.riverWidth * 0.42, color: star, count: 2, mode: 1, range: 1.3, size: 0.6 });
    }
  }
  const motes = createMotes(moteSources, q);
  root.add(motes.points);

  // ── 体积光束与薄雾 ──
  const atmos = createAtmos(field, cliffs, atmosSpecs, noise, q);
  root.add(atmos.mesh);
  counts.atmos = atmos.count;

  // ── 远景 ──
  root.add(createSky());
  lap('misc');

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
  // 泉水警示：敌方英雄踏进泉水时水面转红(缓动)
  const alert = [0, 0];
  const fountains = map.bases.map((b) => ({ team: b.team, x: b.fountain.x, y: b.fountain.y, r2: b.fountainRadius * b.fountainRadius }));

  return {
    name: 'terrain',
    timings,
    counts,
    update(frame) {
      // 分块网格用包围盒(而非包围球)做视锥剔除：更紧，阴影通道也跟着省
      _projView.multiplyMatrices(ctx.camera.projectionMatrix, ctx.camera.matrixWorldInverse);
      _frustum.setFromProjectionMatrix(_projView);
      for (const c of cells) c.mesh.visible = _frustum.intersectsBox(c.box);

      // 草丛里的可见单位把草拨开；玩家自己所在的草丛再额外伏低
      const st = frame.state;
      let n = 0;
      let revealed = false;
      let intrude0 = 0;
      let intrude1 = 0;
      for (const u of st.units) {
        if (!u.alive) continue;
        const seen = u.team === frame.playerTeam || u.visible[frame.playerTeam];
        if (!seen) continue;
        // 泉水里的敌方英雄
        if (u.kind === 'hero') {
          for (const f of fountains) {
            if (u.team === f.team) continue;
            const dx = u.pos.x - f.x;
            const dy = u.pos.y - f.y;
            if (dx * dx + dy * dy < f.r2) {
              if (f.team === 0) intrude0 = 1;
              else intrude1 = 1;
            }
          }
        }
        if (u.bushId < 0) continue;
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
      const k = Math.min(1, frame.dt * 4);
      alert[0] += (intrude0 - alert[0]) * k;
      alert[1] += (intrude1 - alert[1]) * k;
      decalLayer.setFountainAlert(0, alert[0]);
      decalLayer.setFountainAlert(1, alert[1]);
    },
    setQuality(s) {
      ground.setQuality(s);
      water.setQuality(s);
      cliffMat.setMapTopDetail(MAP_TOP_DETAIL && s.groundDetail > 0);
      bushes.setQuality(s);
      motes.setQuality(s);
      atmos.setQuality(s);
    },
    resize: syncViewport,
    dispose() {
      disposeObject3D(root);
      root.clear();
      splat.a.dispose();
      splat.b.dispose();
      noise.dispose();
      ctx.lightTint.clear();
    },
  };
}
