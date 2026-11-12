/** 全部音效的注册表。键集合由 SfxKey 的模板字面量类型约束：契约里的 FxKey/AnnounceKey/UiSound 缺一个都无法通过编译。 */
import { ANNOUNCE } from './announce';
import { COMBAT } from './combat';
import type { SfxDef, SfxKey } from './defs';
import { HEROES_SFX } from './heroes';
import { TRIM } from './levels';
import { SYSTEM } from './system';
import { UI_SFX } from './ui';

export type { SfxCat, SfxDef, SfxKey } from './defs';

export const SFX: Record<SfxKey, SfxDef> = { ...COMBAT, ...HEROES_SFX, ...SYSTEM, ...ANNOUNCE, ...UI_SFX };

export const SFX_KEYS = Object.keys(SFX) as SfxKey[];

/** 某键的配平增益(目标响度 ÷ 实测响度) */
export function trimOf(key: SfxKey): number {
  return TRIM[key] ?? 1;
}
