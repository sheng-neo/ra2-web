/**
 * @ra2web/game —— 确定性模拟内核（客户端与服务器共享）。
 * 约定：全整数运算、查表三角、种子 PRNG、禁真实时间（ESLint 强制）。
 */
export { LEPTONS_PER_CELL, SIM_TICKS_PER_SECOND, cellToLepton, leptonToCell } from './coords';
export { FP_ONE, fpSin, fpCos, isqrt, dist, dirToBangle, turnToward, velocity } from './fixed';
export { Prng } from './prng';
export { StateHash } from './hash';
export { findPath, type PathGrid } from './pathfind';
export { World, type Entity, type Command, type TerrainInfo, type UnitSpec } from './world';
export { runScript, gridTerrain, type ScriptedCommand, type ReplayResult } from './replay';
