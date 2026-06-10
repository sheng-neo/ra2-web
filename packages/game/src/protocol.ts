/**
 * 联机消息协议（客户端 ↔ 服务器，共享类型）。
 * 大厅用 JSON；对局命令包 MVP 也用 JSON（命令是简单对象），
 * 后续可在不改语义的前提下替换为紧凑二进制。
 */
import type { Command } from './world';
import type { Side } from './content';

export const PROTOCOL_VERSION = 2;

export interface LobbyPlayer {
  playerId: number;
  name: string;
  side: Side;
  ready: boolean;
}

export interface MatchConfig {
  seed: number;
  mapWidth: number;
  mapHeight: number;
  /** 出生点（格），按 playerId 顺序。 */
  spawns: { playerId: number; cellX: number; cellY: number; side: Side }[];
  /** 矿田中心（格）。 */
  orePatches: { cellX: number; cellY: number }[];
  inputDelay: number;
  /** 每位玩家起始资金（默认 5000）。 */
  startingCredits?: number;
}

/** 客户端 → 服务器。 */
export type ClientMessage =
  | { t: 'join'; room: string; name: string; protocol: number }
  | { t: 'setSide'; side: Side }
  | { t: 'ready'; ready: boolean }
  | { t: 'cmd'; tick: number; commands: Command[] }
  | { t: 'hash'; tick: number; hash: number }
  | { t: 'chat'; text: string };

/** 服务器 → 客户端。 */
export type ServerMessage =
  | { t: 'joined'; playerId: number; room: string }
  | { t: 'lobby'; players: LobbyPlayer[]; hostId: number }
  | { t: 'start'; config: MatchConfig; players: LobbyPlayer[] }
  | { t: 'tick'; tick: number; commandsByPlayer: Record<number, Command[]> }
  | { t: 'chat'; playerId: number; name: string; text: string }
  | { t: 'playerLeft'; playerId: number }
  | { t: 'defeat'; playerId: number }
  | { t: 'desync'; tick: number; hashes: Record<number, number> }
  | { t: 'error'; message: string };

export function encodeMessage(msg: ClientMessage | ServerMessage): string {
  return JSON.stringify(msg);
}

export function decodeMessage<T = ClientMessage | ServerMessage>(data: string): T {
  return JSON.parse(data) as T;
}
