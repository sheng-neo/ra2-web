// ===== sim/utilities/priv.ts =====（ARCHITECTURE §3.3；spec:power-water §2.6 / §3.7）
// 持久私有态：只放不可由真源层重建的东西——
//  - 到期型（4×4）电厂的年龄与负载显示值（XBLD 推不出年龄；.SC2 侧落在 XMIC 记录 +1 / +4，由 save.ts 读写）；
//  - requestRescan 置的脏标志（若只放闭包，快照在"命令之后、日末之前"保存再载入会丢掉重扫，续跑哈希与不中断不一致）。
// 风 / 水电永不到期、无年龄，不进表；plantAt 对它们返回年龄 0。列式 TypedArray，1024 座上限时编码后 ≈ 6 KB（预算 16 KB）。
import { ANCHOR_BIT, TILES, tileX, tileY } from '../../contracts/grid';
import { FOOTPRINT, lotIsUniform } from '../../contracts/footprint';
import type { PrivState } from '../../contracts/state';
import { PLANT_EXPIRES } from './defs';

export const PRIV_VERSION = 1;

export interface UtilitiesPriv extends PrivState {
  v: number;
  dirtyPower: boolean;
  dirtyWater: boolean;
  plantAnchors: Int32Array;     // 锚点（TL 格）索引升序
  plantAges: Uint8Array;        // 年龄（年）
  plantLoads: Uint8Array;       // 上次年度更新的负载显示值（usagePct + 抖动）
}
export interface PlantRec { anchor: number; age: number; load: number }

export function freshPriv(): UtilitiesPriv {
  return { v: PRIV_VERSION, dirtyPower: false, dirtyWater: false, plantAnchors: new Int32Array(0), plantAges: new Uint8Array(0), plantLoads: new Uint8Array(0) };
}

/** 形状校验：缺键 / 类型不符 / 版本不符 → false（调用方丢弃并从真源重建）。 */
export function isUtilitiesPriv(p: PrivState | undefined): p is UtilitiesPriv {
  if (!p || p.v !== PRIV_VERSION) return false;
  if (typeof p.dirtyPower !== 'boolean' || typeof p.dirtyWater !== 'boolean') return false;
  const a = p.plantAnchors, g = p.plantAges, l = p.plantLoads;
  return a instanceof Int32Array && g instanceof Uint8Array && l instanceof Uint8Array && a.length === g.length && a.length === l.length;
}

export function readPlants(p: UtilitiesPriv): PlantRec[] {
  const out: PlantRec[] = new Array<PlantRec>(p.plantAnchors.length);
  for (let k = 0; k < out.length; k++) out[k] = { anchor: p.plantAnchors[k]!, age: p.plantAges[k]!, load: p.plantLoads[k]! };
  return out;
}
export function writePlants(p: UtilitiesPriv, recs: readonly PlantRec[]): void {
  const n = recs.length;
  const anchors = new Int32Array(n), ages = new Uint8Array(n), loads = new Uint8Array(n);
  for (let k = 0; k < n; k++) { anchors[k] = recs[k]!.anchor; ages[k] = recs[k]!.age; loads[k] = recs[k]!.load; }
  p.plantAnchors = anchors; p.plantAges = ages; p.plantLoads = loads;
}

/** 扫描 XBLD：到期型电厂的 TL 锚点（角标 TL 位 + 占地内 ID 一致），索引升序。 */
export function scanPlantAnchors(layers: { xbld: Uint8Array; xzon: Uint8Array }): number[] {
  const out: number[] = [];
  const { xbld, xzon } = layers;
  for (let i = 0; i < TILES; i++) {
    const id = xbld[i]!;
    if (PLANT_EXPIRES[id] === 0 || (xzon[i]! & ANCHOR_BIT) === 0) continue;
    const s = FOOTPRINT[id]!, x = tileX(i), y = tileY(i);
    if (x + s > 128 || y + s > 128 || !lotIsUniform(layers, x, y, s, id)) continue;
    out.push(i);
  }
  return out;
}

/** 把现有记录与真源锚点合并：仍存在的保留 age / load，新出现的 age = load = 0，消失的删除；超过上限的忽略。返回是否有变化。 */
export function mergePlants(old: readonly PlantRec[], anchors: readonly number[], max: number): { recs: PlantRec[]; changed: boolean } {
  const byAnchor = new Map<number, PlantRec>();
  for (const r of old) byAnchor.set(r.anchor, r);
  const recs: PlantRec[] = [];
  let changed = old.length !== Math.min(anchors.length, max);
  for (const a of anchors) {
    if (recs.length >= max) break;
    const hit = byAnchor.get(a);
    if (hit) recs.push(hit); else { recs.push({ anchor: a, age: 0, load: 0 }); changed = true; }
  }
  if (!changed) for (let k = 0; k < recs.length; k++) if (recs[k]!.anchor !== old[k]!.anchor) { changed = true; break; }
  return { recs, changed };
}
