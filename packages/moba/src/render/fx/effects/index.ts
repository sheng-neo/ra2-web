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

/** 占位：还没有实现的键先不画。写在展开之前——特效包在 GENERIC 里补上同名键后，这里会报「重复指定」，届时删掉即可 */
const FX_TODO: FxHandler = () => undefined;

export const FX_HANDLERS: Record<FxKey, FxHandler> = {
  // 河道巨龙吐息(C1 占位，待 D 特效包实现：扇形预警贴花 / 喷吐锥体，字段见 core/types.ts 的 FxKey 注释)
  drake_breath_warn: FX_TODO,
  drake_breath: FX_TODO,
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
