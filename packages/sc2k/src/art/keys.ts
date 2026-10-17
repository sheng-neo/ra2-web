// ===== art/keys.ts =====（WORKPLAN WP9 验收：v1 必备 key 集合；provider.test / worker 预生成 / art-sheet 共用）
// 全部 key 只用 OverlayId / ActorId / UiIconId / XUND_PIPE_STUB 等契约编号，不自造。
import type { SpriteKey } from '../contracts/render';
import { ACTOR_COUNT, ActorId, OVERLAY_COUNT, OverlayId } from '../contracts/render';
import { allIconIds } from './icons';

/** 地形 variant：altBand*4 + noise（0..11）与地下 0x80。 */
export const TERRAIN_VARIANTS: readonly number[] = [...Array.from({ length: 12 }, (_, k) => k), 0x80];
/** v1 角色静帧。 */
export const V1_ACTORS: readonly number[] = [ActorId.Tornado, ActorId.Monster, ActorId.Explosion, ActorId.DeployPolice, ActorId.DeployFire, ActorId.DeployMilitary];
export const XUND_MAX = 0x23;

export interface KeyGroup { readonly name: string; readonly keys: readonly SpriteKey[] }
/** 按类别分组的必备 key。 */
export function requiredKeyGroups(): KeyGroup[] {
  const groups: KeyGroup[] = [];
  const overlay: SpriteKey[] = [];
  for (let id = 0; id < OVERLAY_COUNT; id++) {
    if (id === OverlayId.EdgeWallL || id === OverlayId.EdgeWallR) { for (let lv = 1; lv <= 31; lv++) overlay.push({ kind: 'overlay', id, variant: lv }); }
    else overlay.push({ kind: 'overlay', id });
  }
  groups.push({ name: 'overlay', keys: overlay });
  groups.push({ name: 'actor', keys: V1_ACTORS.map((id) => ({ kind: 'actor', id, variant: 0 })) });
  const xund: SpriteKey[] = [];
  for (let id = 0; id <= XUND_MAX; id++) { xund.push({ kind: 'xund', id }); if ((id >= 0x10 && id <= 0x21)) xund.push({ kind: 'xund', id, variant: 1 }); }
  groups.push({ name: 'xund', keys: xund });
  groups.push({ name: 'xbld', keys: Array.from({ length: 255 }, (_, k) => ({ kind: 'xbld', id: k + 1 })) });
  const terrain: SpriteKey[] = [];
  for (let id = 0; id <= 13; id++) for (const v of TERRAIN_VARIANTS) terrain.push({ kind: 'terrain', id, variant: v });
  groups.push({ name: 'terrain', keys: terrain });
  const water: SpriteKey[] = [];
  for (let id = 0; id <= 20; id++) for (let d = 0; d <= 2; d++) water.push({ kind: 'water', id, variant: d });
  groups.push({ name: 'water', keys: water });
  groups.push({ name: 'ui', keys: allIconIds().map((id) => ({ kind: 'ui', id })) });
  return groups;
}
/** 扁平列表。 */
export const requiredKeys = (): SpriteKey[] => requiredKeyGroups().flatMap((g) => g.keys);
export { ACTOR_COUNT };
