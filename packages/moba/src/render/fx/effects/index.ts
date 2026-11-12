/**
 * 一次性特效注册表：FxKey → 处理函数。用 Record<FxKey, …> 约束，漏掉任何一个键都会在类型检查时报错。
 */
import type { FxKey } from '../../../core/types';
import { CHIJIN } from './chijin';
import { FENGLING } from './fengling';
import { GENERIC } from './generic';
import { PANYUE } from './panyue';
import type { FxHandler } from './types';
import { XINGLI } from './xingli';
import { YEQUE } from './yeque';

export const FX_HANDLERS: Record<FxKey, FxHandler> = {
  ...GENERIC,
  ...PANYUE,
  ...CHIJIN,
  ...XINGLI,
  ...FENGLING,
  ...YEQUE,
};

export const FX_KEYS = Object.keys(FX_HANDLERS) as FxKey[];

export type { FxEnv, FxEvent, FxHandler } from './types';
export { epicSlainFx, heroDeathFx, meleeSwingFx, minionDeathFx, monsterSpawnFx } from './generic';
