// ===== sim/terrain/save.ts =====（spec:terrain §3.7；spec:file-formats §3.4.2 第 2 步 / §3.4.3）
// importFrom：ALTM 拆位 + 以 XTER 为准修正 waterLevel / XBIT.WATER（同时写回 doc.xbit，因为 IMPORT_ORDER 中 core 随后整层拷贝 doc.xbit）；
// 未定义 XTER 码 → 0 并告警；海平面 / Coast / River 来自 MISC（海平面缺失时由水块水位推断，否则默认 4）。exportTo：ALTM 打包（无水格 waterLevel = alt）+ XTER + MISC 三项。
import { MAX_ALT, TILES, XBit, XterClass, xterClassOf } from '../../contracts/grid';
import { MISC, miscGet, miscSet } from '../../contracts/io';
import type { Sc2Document } from '../../contracts/io';
import type { Diagnostic, SimContext } from '../../contracts/system';
import type { TerrainField } from './field';
import { isUndefinedXter } from './slope';
import type { TerrainTuning } from './tuning';

const ALT_MASK = 0x1f, WL_SHIFT = 5, WL_MASK = 0x1f, TUN_SHIFT = 10, TUN_MASK = 0x3f;

/** 海平面缺失时的推断：海相连水块（0x1X / 0x2X 且 waterLevel ≥ alt+1）水位的众数；没有则默认值。 */
function inferSeaLevel(doc: Sc2Document, fallback: number): number {
  const hist = new Int32Array(32);
  for (let i = 0; i < TILES; i++) {
    const c = xterClassOf(doc.xter[i]!);
    if (c !== XterClass.Submerged && c !== XterClass.Shore) continue;
    const v = doc.altm[i]!, alt = v & ALT_MASK, wl = (v >> WL_SHIFT) & WL_MASK;
    if (wl >= alt + 1) hist[wl] = hist[wl]! + 1;
  }
  let best = -1, bestN = 0;
  for (let w = 0; w < 32; w++) if (hist[w]! > bestN) { bestN = hist[w]!; best = w; }
  return best >= 0 ? best : fallback;
}

export function importTerrain(ctx: SimContext, doc: Sc2Document, diag: Diagnostic[], field: TerrainField, T: TerrainTuning): void {
  const s = ctx.state, L = s.layers;
  let W = miscGet(doc.misc, MISC.seaLevel) | 0;
  if (W < 0 || W > MAX_ALT) W = 0;
  if (W === 0) { W = inferSeaLevel(doc, T.defaultSeaLevel); diag.push({ level: 'info', code: 'terrain.seaLevelInferred', message: `MISC 海平面缺失，推断为 ${W}` }); }
  let undefinedXter = 0, waterBitFixed = 0, waterLevelFixed = 0;
  for (let i = 0; i < TILES; i++) {
    const v = doc.altm[i]!;
    const alt = v & ALT_MASK, tun = (v >> TUN_SHIFT) & TUN_MASK;
    let wl = (v >> WL_SHIFT) & WL_MASK;
    let xter = doc.xter[i]!;
    if (isUndefinedXter(xter)) { xter = 0; undefinedXter++; }
    const cls = xterClassOf(xter);
    const water = cls !== XterClass.Dry;
    let fixedWl: number;
    if (!water) fixedWl = alt;
    else if (cls === XterClass.Submerged || cls === XterClass.Shore) fixedWl = wl >= alt + 1 ? wl : Math.max(W, alt + 1);
    else if (cls === XterClass.Waterfall) fixedWl = Math.max(wl, alt + 1);
    else fixedWl = alt;                                          // 浅水 / 溪流：零深度
    if (fixedWl !== wl) { waterLevelFixed++; wl = fixedWl; }
    let xbit = doc.xbit[i]!;
    if (water !== ((xbit & XBit.Water) !== 0)) { xbit = water ? xbit | XBit.Water : xbit & ~XBit.Water; waterBitFixed++; }
    if (!water && (xbit & XBit.SaltWater) !== 0) xbit &= ~XBit.SaltWater;
    doc.xbit[i] = xbit;                                          // core 的整层拷贝会带上修正后的位
    L.alt[i] = alt; L.waterLevel[i] = wl; L.tunnelLevels[i] = tun; L.xter[i] = xter; L.xbit[i] = xbit;
  }
  s.terrain.seaLevel = W;
  s.terrain.coast = miscGet(doc.misc, MISC.terrainCoast) !== 0;
  s.terrain.river = miscGet(doc.misc, MISC.terrainRiver) !== 0;
  field.rebuild(L);
  if (undefinedXter > 0) diag.push({ level: 'warn', code: 'terrain.undefinedXter', message: `${undefinedXter} 个未定义 XTER 码已按 0x00 处理` });
  if (waterBitFixed > 0) diag.push({ level: 'info', code: 'terrain.waterBitFixed', message: `${waterBitFixed} 个 XBIT.WATER 位按 XTER 修正` });
  if (waterLevelFixed > 0) diag.push({ level: 'info', code: 'terrain.waterLevelFixed', message: `${waterLevelFixed} 个 ALTM.waterLevel 按 XTER / 海平面修正` });
  if (field.inconsistent > 0) diag.push({ level: 'info', code: 'terrain.cornerMismatch', message: `${field.inconsistent} 个地块的角点与邻居不一致（以地块为准，角点场取最大值）` });
}

export function exportTerrain(ctx: SimContext, doc: Sc2Document): void {
  const s = ctx.state, L = s.layers;
  doc.xter.set(L.xter);
  for (let i = 0; i < TILES; i++) {
    const alt = L.alt[i]!;
    const wl = (L.xbit[i]! & XBit.Water) !== 0 ? L.waterLevel[i]! : alt;
    doc.altm[i] = ((alt & ALT_MASK) | ((wl & WL_MASK) << WL_SHIFT) | ((L.tunnelLevels[i]! & TUN_MASK) << TUN_SHIFT)) & 0xffff;
  }
  miscSet(doc.misc, MISC.seaLevel, s.terrain.seaLevel);
  miscSet(doc.misc, MISC.terrainCoast, s.terrain.coast ? 1 : 0);
  miscSet(doc.misc, MISC.terrainRiver, s.terrain.river ? 1 : 0);
}
