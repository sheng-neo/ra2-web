/**
 * 模型注册表：按键懒构建并缓存(几何与骨架在主渲染器、英雄展示、头像渲染之间共享)。
 * 键：hero:<id> / minion:<type> / tower:<tier>:<team> / core:<team> / monster:<type>
 */
import type { HeroId, MinionType, MonsterType } from '../../core/types';
import { createChijin } from './heroes/chijin';
import { createFengling } from './heroes/fengling';
import { createPanyue } from './heroes/panyue';
import { createXingli } from './heroes/xingli';
import { createYeque } from './heroes/yeque';
import { createMeleeMinion, createRangedMinion, createSiegeMinion, createSuperMinion } from './minions';
import { createMossBadger } from './monsters/badger';
import { createAbyssDrake } from './monsters/drake';
import { createGlimMoth } from './monsters/moth';
import { createEmberBear } from './monsters/bear';
import { createStarColossus } from './monsters/colossus';
import { createFrostStag } from './monsters/stag';
import { structureFactories } from './structures';
import type { ModelDef } from './types';

export type { AnimInput, AnimOutput, AttachName, ModelDef } from './types';
export { Puppet } from './puppet';
export { RigBatch, createInstanceLook, type InstanceLook } from './shading';

const factories: Record<string, () => ModelDef> = {
  'hero:panyue': createPanyue,
  'hero:chijin': createChijin,
  'hero:xingli': createXingli,
  'hero:fengling': createFengling,
  'hero:yeque': createYeque,
  'minion:melee': createMeleeMinion,
  'minion:ranged': createRangedMinion,
  'minion:siege': createSiegeMinion,
  'minion:super': createSuperMinion,
  ...structureFactories,
  'monster:mossback': createMossBadger,
  'monster:glimwing': createGlimMoth,
  'monster:frost_golem': createFrostStag,
  'monster:ember_golem': createEmberBear,
  'monster:abyss_drake': createAbyssDrake,
  'monster:star_colossus': createStarColossus,
};

const cache = new Map<string, ModelDef>();

export function hasModel(key: string): boolean {
  return key in factories;
}

export function getModel(key: string): ModelDef {
  let m = cache.get(key);
  if (!m) {
    const f = factories[key];
    if (!f) throw new Error(`未知模型：${key}`);
    m = f();
    cache.set(key, m);
  }
  return m;
}

export const heroKey = (id: HeroId): string => `hero:${id}`;
export const minionKey = (t: MinionType): string => `minion:${t}`;
export const towerKey = (tier: 1 | 2 | 3, team: 0 | 1): string => `tower:${tier}:${team}`;
export const coreKey = (team: 0 | 1): string => `core:${team}`;
export const ruinKey = (team: 0 | 1): string => `ruin:${team}`;
export const monsterKey = (t: MonsterType): string => `monster:${t}`;

export function allModelKeys(): string[] {
  return Object.keys(factories);
}
