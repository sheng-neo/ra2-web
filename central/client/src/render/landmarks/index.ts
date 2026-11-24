/**
 * 地标图层：按 placement.id 选参数化 builder；未知 id 用原轮廓挤出白模兜底。
 * 全部地标共用四个缓冲（立面 / 纯色构件 / 霓虹 / 线框），各自合成一个对象，最多 4 个 draw call。
 */
import { BufferAttribute, BufferGeometry, LineBasicMaterial, LineSegments, Mesh, type Material, type Object3D } from 'three';
import type { LandmarkPlacement, SensitiveZone } from '@central/data';
import type { HeightFn } from '../../data/terrain';
import { normalizeRing } from '../../geom/ring';
import { extrudePrism } from '../extrude';
import { FacadeMode, newFacadeArrays } from '../facade';
import { mergeArrays, type MeshArrays } from '../mesh-arrays';
import { newNeonArrays } from '../materials/neon';
import { newSolidArrays } from '../materials/solid';
import { harbourSpire } from './harbour-spire';
import { Placement, type LandmarkSink } from './kit';
import { mirrorBlock } from './mirror-block';
import { neonCentre } from './neon-centre';
import { portholeHouse } from './porthole-house';
import { prismTower } from './prism-tower';
import { steelFrame } from './steel-frame';

type Builder = (p: Placement, sink: LandmarkSink) => void;

export const LANDMARK_BUILDERS: Readonly<Record<string, Builder>> = {
  'harbour-spire': harbourSpire,
  'prism-tower': prismTower,
  'neon-centre': neonCentre,
  'mirror-block': mirrorBlock,
  'steel-frame': steelFrame,
  'porthole-house': portholeHouse,
};

function fallback(p: Placement, sink: LandmarkSink): void {
  const ring = normalizeRing(p.p.footprint);
  if (!ring) return;
  extrudePrism(sink.facade, {
    ...ring,
    bottom: p.base - p.footing * 10,
    base: p.base,
    top: p.base + p.p.height,
    style: p.style(0, FacadeMode.Windows),
    uOffset: p.rnd * 50,
  });
}

export interface LandmarkMaterials {
  facade: Material;
  solid: Material;
  neon: Material;
}

export function buildLandmarks(
  list: readonly LandmarkPlacement[],
  ground: HeightFn,
  zones: readonly SensitiveZone[],
  mats: LandmarkMaterials,
): Object3D[] {
  const sink: LandmarkSink = { facade: newFacadeArrays(), solid: newSolidArrays(), neon: newNeonArrays(), lines: [] };
  for (const l of list) {
    const p = new Placement(l, ground, zones);
    (LANDMARK_BUILDERS[l.id] ?? fallback)(p, sink);
  }
  const out: Object3D[] = [];
  const mesh = (name: string, arrays: MeshArrays, material: Material) => {
    if (arrays.index.length === 0) return;
    const m = new Mesh(mergeArrays([arrays]).geometry, material);
    m.name = name;
    m.matrixAutoUpdate = false;
    out.push(m);
  };
  mesh('landmarks-facade', sink.facade, mats.facade);
  mesh('landmarks-solid', sink.solid, mats.solid);
  mesh('landmarks-neon', sink.neon, mats.neon);
  if (sink.lines.length > 0) {
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(new Float32Array(sink.lines), 3));
    g.computeBoundingSphere();
    const lines = new LineSegments(g, new LineBasicMaterial({ color: 0xe8ecff, fog: true }));
    lines.name = 'landmarks-lines';
    lines.matrixAutoUpdate = false;
    out.push(lines);
  }
  return out;
}
