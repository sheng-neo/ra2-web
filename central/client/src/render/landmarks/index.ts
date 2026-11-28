/**
 * 地标图层（R5 起：真实外观，负责人 D5）。真实网格与图集在首帧之后流式加载（real.ts）；到之前、或下载失败时，
 * 画一个最简单的轮廓白模（原轮廓从地面挤到总高，与楼群同一建筑材质的写字楼立面），一个 draw call。
 * 旧的参数化「致敬模型」（harbour-spire 的切角收分、prism-tower 的斜撑……）已删除。名字是覆盖表里的建筑真名（负责人 D6），
 * 只在 central.json 的数据里，客户端不画名字。
 */
import { Mesh, type Material } from 'three';
import type { LandmarkPlacement, SensitiveZone } from '@central/data';
import type { HeightFn } from '../../data/terrain';
import { normalizeRing } from '../../geom/ring';
import { inSensitive } from '../buildings';
import { extrudePrism } from '../extrude';
import { FacadeMode, hash01, newFacadeArrays, styleCode, styleSeed } from '../facade';
import { streetWarmth } from '../materials/lighting';
import { mergeArrays } from '../mesh-arrays';
import { lowestAlongRings } from '../walls';

export { RealLandmarks, type LandmarkDebug } from './real';

/** 轮廓白模（一个网格，名字以 landmarks 开头：进水面倒影）。没有地标时返回 null。 */
export function buildLandmarkFallback(
  list: readonly LandmarkPlacement[],
  ground: HeightFn,
  zones: readonly SensitiveZone[],
  facade: Material,
): Mesh | null {
  const arrays = newFacadeArrays();
  for (const l of list) {
    const ring = normalizeRing(l.footprint);
    if (!ring) continue;
    const base = l.base !== 0 ? l.base : ground(l.x, l.y);
    const bottom = Math.min(base, lowestAlongRings([ring.outer], ground)) - 5;
    const sensitive = inSensitive(zones, l.x, l.y);
    const rnd = hash01(l.id + l.x);
    extrudePrism(arrays, {
      ...ring,
      bottom,
      base,
      top: base + l.height,
      style: styleCode(styleSeed(3, 2, 0, 1), sensitive ? FacadeMode.Plain : FacadeMode.Office, rnd),
      uOffset: rnd * 50,
      bldg: [4.2, streetWarmth(l.x / 10, l.y / 10, base / 10), bottom / 10 + 0.5, 0],
    });
  }
  if (arrays.index.length === 0) return null;
  const m = new Mesh(mergeArrays([arrays]).geometry, facade);
  m.name = 'landmarks-fallback';
  m.matrixAutoUpdate = false;
  return m;
}
