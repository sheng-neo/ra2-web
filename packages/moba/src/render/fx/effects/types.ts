/**
 * 一次性特效处理函数的公共类型与取位置的小工具。
 */
import type { GameEvent, GameState, PlayerTeam } from '../../../core/types';
import type { FxKit } from '../kit';

export type FxEvent = Extract<GameEvent, { type: 'fx' }>;

export interface FxEnv {
  state: GameState;
  playerId: number;
  playerTeam: PlayerTeam;
}

export type FxHandler = (k: FxKit, e: FxEvent, env: FxEnv) => void;

/** 单位身上某个高度比例处的世界高度(单位不存在时用 fallback) */
export function unitY(k: FxKit, id: number | undefined, frac = 0.5, fallback = 1): number {
  return k.anchor(id) ? k.a.y + k.a.height * frac : fallback;
}

/** 事件是否与玩家直接相关(决定震屏/闪光是否给足) */
export function involvesPlayer(e: FxEvent, env: FxEnv): boolean {
  return e.unitId === env.playerId || e.targetId === env.playerId;
}
