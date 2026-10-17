// ===== sim/core/stateOps.ts =====
// CityState 的就地操作：newCity / 导入前的就地重置（保持 state 及其全部嵌套对象 / TypedArray 的引用不变，
// 因为 prng 的 cell = state.clock、桩 Queries 与渲染都可能缓存了子对象引用）、从层重算 counts、空白 Sc2Document。
import type { CityState } from '../../contracts/state';
import { createCityState, LAYER_LENGTHS } from '../../contracts/state';
import type { CatalogueApi } from '../../contracts/catalogue';
import type { Sc2Document } from '../../contracts/io';
import { CHUNK_SIZES } from '../../contracts/io';

type Rec = Record<string, unknown>;
const isTypedArray = (v: unknown): v is ArrayBufferView & { length: number; set(a: ArrayLike<number>): void } => ArrayBuffer.isView(v) && !(v instanceof DataView);
const isPlainObject = (v: unknown): v is Rec => v !== null && typeof v === 'object' && !Array.isArray(v) && !ArrayBuffer.isView(v);

/**
 * 把 source 的内容就地写入 target：TypedArray 用 set（长度不同则替换引用）、数组清空后逐项 push、普通对象递归（target 多出的键删除，
 * 这正是 priv 需要的语义）、基元直接赋值。只用于 CityState 这类"全是数据"的对象。
 */
export function assignInPlace(target: Rec, source: Rec): void {
  for (const key of Object.keys(target)) if (!(key in source)) delete target[key];
  for (const key of Object.keys(source)) {
    const s = source[key], t = target[key];
    if (isTypedArray(s)) {
      if (isTypedArray(t) && t.length === s.length && t.constructor === s.constructor) t.set(s as unknown as ArrayLike<number>);
      else target[key] = s;
    } else if (Array.isArray(s)) {
      if (Array.isArray(t)) { t.length = 0; for (const e of s) t.push(e); } else target[key] = s;
    } else if (isPlainObject(s)) {
      if (isPlainObject(t)) assignInPlace(t, s); else target[key] = s;
    } else target[key] = s;
  }
}

/** 就地重置为 createCityState() 的全零默认（引用不变）。 */
export function resetCityStateInPlace(state: CityState): void {
  assignInPlace(state as unknown as Rec, createCityState() as unknown as Rec);
}

/** 从 layers 全量重算 counts.tile（256）与 counts.zone（已建 R/C/I 建筑格：slot 0 总数、2/4/6 = R/C/I；与 tileWriter 同口径）。 */
export function recountFromLayers(state: CityState, catalogue: CatalogueApi): void {
  const tile = state.counts.tile; tile.fill(0);
  const zone = state.counts.zone; zone.fill(0);
  const xbld = state.layers.xbld;
  for (let i = 0; i < xbld.length; i++) tile[xbld[i]!] = tile[xbld[i]!]! + 1;
  for (let id = 0; id < 256; id++) {
    const def = catalogue.BUILDINGS[id];
    if (!def || !def.zone || def.transition !== undefined) continue;
    const n = tile[id]!;
    if (n === 0) continue;
    const slot = def.zone.type === 'R' ? 2 : def.zone.type === 'C' ? 4 : 6;
    zone[0] = zone[0]! + n;
    zone[slot] = zone[slot]! + n;
  }
}

/** 全零 Sc2Document（exportSc2 的起点；sim/core 不能 import io/sc2 的 newDocument，所以自建）。 */
export function blankSc2Document(): Sc2Document {
  const u8 = (n: number): Uint8Array => new Uint8Array(n);
  const C = CHUNK_SIZES, L = LAYER_LENGTHS;
  return {
    cityName: '', misc: new Int32Array(C.MISC / 4), altm: new Uint16Array(C.ALTM / 2),
    xter: u8(L.tile), xbld: u8(L.tile), xzon: u8(L.tile), xund: u8(L.tile), xtxt: u8(L.tile), xbit: u8(L.tile),
    xlab: u8(L.xlab), xmic: u8(L.xmic), xthg: u8(L.xthg),
    xtrf: u8(L.half), xplt: u8(L.half), xval: u8(L.half), xcrm: u8(L.half), xplc: u8(L.quarter), xfir: u8(L.quarter), xpop: u8(L.quarter), xrog: u8(L.quarter),
    xgrp: new Int32Array(L.xgrp),
    unknownChunks: [],
  };
}
