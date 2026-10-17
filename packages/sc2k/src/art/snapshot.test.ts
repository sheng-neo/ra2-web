// ===== art/snapshot.test.ts =====（WORKPLAN WP9 验收：全部生成函数 FNV 哈希快照）
// 任何配方改动都会改变哈希：请同时更新快照（vitest -u）并用 `pnpm --filter sc2k art:sheet` 出图目测。
import { describe, expect, it } from 'vitest';
import { ActorId, OverlayId } from '../contracts/render';
import { Dir } from '../contracts/grid';
import { genAbandoned, genConstruction, genGround, genTrees } from './nature';
import { genBridge, genCrossover, genHighway2x2, genNetwork, genOnramp, genRailHalf, genSubRail, genTunnelPortal, genUndCrossover, genUndMisc, genUnderground } from './network';
import { genActor, genOverlay } from './overlays';
import { genEdgeWall, genTerrain, genTerrainUnderground } from './terrain';
import { genWater } from './water';
import { genIcon } from './icons';
import { genMinimapLut } from './minimap';
import { SCALES, bitmapHash } from './raster';
import { buildPalette } from './palette';
import type { IndexedBitmap } from '../contracts/render';
import { MAP_LAYER_MODES } from '../contracts/render';
import { generate } from './provider';
import { requiredKeys } from './keys';

const hex = (n: number): string => n.toString(16).padStart(8, '0');
const H = (b: IndexedBitmap | null): string => (b ? hex(bitmapHash(b)) : 'null');
function fnvBytes(bytes: ArrayLike<number>): string { let h = 0x811c9dc5; for (let k = 0; k < bytes.length; k++) h = Math.imul(h ^ (bytes[k]! & 0xff), 0x01000193) >>> 0; return hex(h); }

describe('art: 生成函数快照（FNV-1a）', () => {
  it('调色板与 Map 图层 LUT', () => {
    const snap: Record<string, string> = { palette: fnvBytes(buildPalette().rgba) };
    for (const m of MAP_LAYER_MODES) snap[`lut:${m}`] = fnvBytes(genMinimapLut(m));
    expect(snap).toMatchSnapshot();
  });
  it.each(['S', 'M', 'L'] as const)('%s 档：地形 / 水面 / 路网 / 树 / 地面 / 建筑 / 覆盖物 / 角色', (scale) => {
    const sp = SCALES[scale];
    const snap: Record<string, string> = {};
    for (let n = 0; n <= 13; n++) { snap[`terrain:${n}`] = H(genTerrain(n, 0, 0, sp)); snap[`terrain:${n}:alt2v3`] = H(genTerrain(n, 2, 3, sp)); snap[`terrainU:${n}`] = H(genTerrainUnderground(n, sp)); }
    for (const lv of [1, 7, 31]) { snap[`edgeL:${lv}`] = H(genEdgeWall(lv, 'L', sp)); snap[`edgeR:${lv}`] = H(genEdgeWall(lv, 'R', sp)); }
    for (let s = 0; s <= 20; s++) snap[`water:${s}`] = H(genWater(s, s % 3, sp));
    for (const kind of ['road', 'rail', 'power'] as const) for (let i = 0; i < 15; i++) snap[`${kind}:${i}`] = H(genNetwork(kind, i, sp));
    for (let i = 0; i < 15; i++) { snap[`subway:${i}`] = H(genUnderground('subway', i, false, sp)); snap[`pipe:${i}`] = H(genUnderground('pipe', i, true, sp)); }
    for (const id of [0x43, 0x45, 0x47, 0x4b, 0x4d, 0x4f]) snap[`cross:${id.toString(16)}`] = H(genCrossover(id, sp));
    snap['undX:1f'] = H(genUndCrossover(0x1f, false, sp)); snap['undMisc:21w'] = H(genUndMisc(0x21, true, sp)); snap['undMisc:22'] = H(genUndMisc(0x22, false, sp)); snap['undMisc:23'] = H(genUndMisc(0x23, false, sp));
    for (const d of [Dir.T, Dir.R, Dir.B, Dir.L]) { snap[`tunnel:${d}`] = H(genTunnelPortal(d, sp)); snap[`railHalf:${d}`] = H(genRailHalf(d, sp)); snap[`subRail:${d}`] = H(genSubRail(d, sp)); }
    for (const part of ['causewayPylon', 'deck', 'railPylon', 'railDeck', 'elevatedWire', 'suspCenter', 'raisingUp'] as const) snap[`bridge:${part}`] = H(genBridge(part, sp));
    snap['onramp:TL'] = H(genOnramp(Dir.T, Dir.L, sp)); snap['onramp:BR'] = H(genOnramp(Dir.B, Dir.R, sp));
    for (const id of [0x61, 0x65, 0x69, 0x6a]) snap[`hwy2:${id.toString(16)}`] = H(genHighway2x2(id, sp));
    for (let d = 1; d <= 7; d++) snap[`trees:${d}`] = H(genTrees(d, d & 3, sp));
    snap['rubble'] = H(genGround('rubble', 1, sp)); snap['radioactive'] = H(genGround('radioactive', 0, sp)); snap['park'] = H(genGround('park', 0, sp));
    for (const s of [1, 2, 3] as const) { snap[`construction:${s}`] = H(genConstruction(s, 0, sp)); snap[`abandoned:${s}`] = H(genAbandoned(s, 1, sp)); }
    for (let id = 0x70; id <= 0xff; id++) snap[`bld:${id.toString(16)}`] = H(generate({ kind: 'xbld', id }, scale));
    for (let id = 0; id < 24; id++) snap[`overlay:${id}`] = H(genOverlay(id, id >= OverlayId.EdgeWallL ? 3 : 0, sp));
    for (const id of [ActorId.Tornado, ActorId.Monster, ActorId.Explosion, ActorId.DeployPolice, ActorId.DeployFire, ActorId.DeployMilitary]) snap[`actor:${id}`] = H(genActor(id, sp));
    expect(snap).toMatchSnapshot();
  });
  it('UI 图标（档无关）', () => {
    const snap: Record<string, string> = {};
    for (const key of requiredKeys()) if (key.kind === 'ui') snap[`ui:${key.id}`] = H(genIcon(key.id));
    expect(snap).toMatchSnapshot();
  });
});
