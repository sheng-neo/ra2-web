/**
 * 音效注册表的类型。键用模板字面量类型从契约的 FxKey / AnnounceKey / UiSound 派生，
 * 这样契约里每加一个键，注册表缺配方就会在编译期报错。
 */
import type { AbilitySlot, AnnounceKey, FxKey, HeroId, SummonerSlot } from '../../core/types';
import type { UiSound } from '../api';
import type { Patch } from '../synth';

export type ExtraKey =
  // 英雄普攻：挥击/蓄力/出手/命中
  | 'atk_panyue_swing' | 'atk_panyue_hit'
  | 'atk_chijin_swing' | 'atk_chijin_hit'
  | 'atk_xingli_charge' | 'atk_xingli_launch' | 'atk_xingli_hit'
  | 'atk_fengling_draw' | 'atk_fengling_launch' | 'atk_fengling_hit'
  | 'atk_yeque_swing' | 'atk_yeque_hit'
  // 小兵 / 野怪
  | 'minion_swing' | 'minion_melee_hit' | 'minion_ranged_launch' | 'minion_ranged_hit'
  | 'minion_siege_launch' | 'minion_siege_hit' | 'super_hit'
  | 'monster_swing' | 'monster_hit' | 'monster_spit_launch' | 'monster_spit_hit' | 'epic_hit' | 'monster_spawn'
  // 防御塔 / 水晶
  | 'tower_charge' | 'tower_launch' | 'tower_hit' | 'tower_hit_player'
  // 技能弹道
  | 'xingli_s1_fly' | 'xingli_s1_hit' | 'fengling_s1_fly' | 'fengling_s1_hit' | 'yeque_s2_fly' | 'yeque_s2_hit' | 'proj_fizzle'
  // 区域铺底(时长跟随区域)
  | 'area_telegraph' | 'area_telegraph_enemy' | 'area_panyue_aura' | 'area_panyue_fissure'
  | 'area_chijin_spin' | 'area_xingli_well' | 'area_xingli_storm' | 'area_fengling_rain'
  // 状态与系统
  | 'player_hurt' | 'player_hurt_heavy' | 'skill_hit' | 'heartbeat' | 'yeque_refresh'
  | 'death_hero_ally' | 'death_hero_enemy' | 'death_player' | 'death_minion' | 'death_minion_big' | 'death_monster'
  | 'epic_roar' | 'epic_fall' | 'kill_player' | 'kill_ally' | 'kill_enemy'
  | 'levelup_player' | 'respawn_player' | 'coin' | 'coin_big' | 'buy' | 'reject' | 'recall_channel';

export type SfxKey =
  | `fx_${FxKey}`
  | `cast_${HeroId}_${AbilitySlot}`
  | `cast_${SummonerSlot}`
  | `ann_${AnnounceKey}`
  | `ui_${UiSound}`
  | ExtraKey;

export type SfxCat = '英雄普攻' | '小兵与野怪' | '防御塔' | '通用命中' | '技能施放' | '技能特效' | '技能弹道' | '区域铺底' | '状态与系统' | '播报' | '界面';

export interface SfxDef {
  /** 配方：v 为可选的变体/强度参数(含义因键而异) */
  fn: (p: Patch, v: number) => void;
  /** 画廊页显示的中文名 */
  label: string;
  cat: SfxCat;
  bus: 'sfx' | 'ui';
  /** 目标响度(dBFS，100ms 窗最大 RMS)。levels.ts 的配平增益据此从离线实测值推导 */
  loud: number;
  /** 混响送入量 */
  rev: number;
  /** 同键(或同 group)最小间隔(秒)：限流防团战爆音 */
  gap: number;
  /** 同键同时发声数上限 */
  poly: number;
  /** 优先级 0..3：发声数到顶时低优先级让位 */
  prio: number;
  /** 每次播放的随机音高偏移幅度(±) */
  jitter: number;
  /** 名义时长(秒)：离线渲染长度 / 持续类音效的默认时长 */
  len: number;
  /** 共享限流的分组(不同键互斥，如 UI 购买音与模拟层购买事件) */
  group?: string;
  /** 可听距离(米) */
  range: number;
  /** 画廊/自检要额外列出的变体 */
  variants?: { label: string; v: number }[];
}

export function def(cat: SfxCat, label: string, fn: SfxDef['fn'], o: Partial<Omit<SfxDef, 'fn' | 'label' | 'cat'>> = {}): SfxDef {
  return { fn, label, cat, bus: 'sfx', loud: -20, rev: 0.12, gap: 0.045, poly: 3, prio: 1, jitter: 0.03, len: 0.6, range: 26, ...o };
}

// 几组不成谐波的泛音比，决定「铃振」像什么材质
export const METAL = [1, 2.31, 3.87, 5.2] as const;
export const BLADE = [1, 1.48, 2.36, 3.2] as const;
export const DAGGER = [1, 1.34, 1.87, 2.6] as const;
export const CRYSTAL = [1, 1.5, 2.5, 3.76] as const;
export const COIN = [1, 2.01, 3.03, 4.2] as const;
