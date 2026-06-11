import { describe, expect, it } from 'vitest';
import { Prng } from './prng';
import { StateHash } from './hash';
import { World } from './world';
import { gridTerrain, runScript, type ScriptedCommand } from './replay';

function newWorld(blocked?: Set<number>): World {
  const w = new World(gridTerrain(28, 28, blocked), 20260610);
  w.addPlayer(1, 'allied', 5000);
  w.addPlayer(2, 'soviet', 5000);
  return w;
}

function buildScript(): ScriptedCommand[] {
  return [
    { tick: 0, command: { kind: 'spawn', owner: 1, typeId: 'grizzly', cellX: 2, cellY: 2 } },
    { tick: 0, command: { kind: 'spawn', owner: 1, typeId: 'gi', cellX: 3, cellY: 2 } },
    { tick: 0, command: { kind: 'spawn', owner: 2, typeId: 'rhino', cellX: 24, cellY: 24 } },
    { tick: 5, command: { kind: 'move', entityIds: [1, 2], cellX: 22, cellY: 6 } },
    { tick: 40, command: { kind: 'move', entityIds: [3], cellX: 4, cellY: 22 } },
    { tick: 90, command: { kind: 'move', entityIds: [2], cellX: 1, cellY: 1 } },
  ];
}

function wall(): Set<number> {
  const blocked = new Set<number>();
  for (let y = 4; y <= 16; y++) blocked.add(y * 28 + 12);
  return blocked;
}

describe('确定性（锁步命脉）', () => {
  it('同一脚本两次运行 → 哈希序列完全一致', () => {
    const run = () => runScript(newWorld(wall()), buildScript(), 300, 5);
    const a = run();
    const b = run();
    expect(a.finalHash).toBe(b.finalHash);
    expect(a.samples).toEqual(b.samples);
    expect(a.samples.length).toBe(60);
  });

  it('新命令(攻击移动/巡逻/姿态/采矿)两次运行哈希一致（锁步/回放安全）', () => {
    const build = (): World => {
      const w = newWorld();
      for (let y = 10; y < 13; y++) for (let x = 10; x < 13; x++) w.setOre(x, y, 500);
      return w;
    };
    const script: ScriptedCommand[] = [
      { tick: 0, command: { kind: 'spawn', owner: 1, typeId: 'grizzly', cellX: 2, cellY: 2 } },
      { tick: 0, command: { kind: 'spawn', owner: 1, typeId: 'harvester', cellX: 4, cellY: 2 } },
      { tick: 0, command: { kind: 'spawn', owner: 2, typeId: 'conscript', cellX: 14, cellY: 14 } },
      { tick: 2, command: { kind: 'stance', entityIds: [1], stance: 'aggressive' } },
      { tick: 4, command: { kind: 'attackMove', entityIds: [1], cellX: 20, cellY: 20 } },
      { tick: 6, command: { kind: 'harvest', entityIds: [2], cellX: 11, cellY: 11 } },
      { tick: 60, command: { kind: 'patrol', entityIds: [1], cellX: 4, cellY: 22 } },
      { tick: 120, command: { kind: 'stance', entityIds: [1], stance: 'holdground' } },
    ];
    const a = runScript(build(), script, 400, 10);
    const b = runScript(build(), script, 400, 10);
    expect(a.finalHash).toBe(b.finalHash);
    expect(a.samples).toEqual(b.samples);
  });

  it('不同种子 → 哈希不同', () => {
    const wa = new World(gridTerrain(28, 28), 1);
    wa.addPlayer(1, 'allied', 5000);
    wa.addPlayer(2, 'soviet', 5000);
    const wb = new World(gridTerrain(28, 28), 2);
    wb.addPlayer(1, 'allied', 5000);
    wb.addPlayer(2, 'soviet', 5000);
    const a = runScript(wa, buildScript(), 50);
    const b = runScript(wb, buildScript(), 50);
    expect(a.finalHash).not.toBe(b.finalHash);
  });

  it('命令时序敏感：差一个 tick，哈希时间线即分叉', () => {
    const early = buildScript();
    const late = buildScript().map((s, i) => (i === 3 ? { ...s, tick: s.tick + 1 } : s));
    const a = runScript(newWorld(wall()), early, 200, 1);
    const b = runScript(newWorld(wall()), late, 200, 1);
    expect(a.samples).not.toEqual(b.samples);
  });

  it('单位实际抵达目的地', () => {
    const world = newWorld(wall());
    runScript(world, buildScript(), 600);
    const gi = world.entities.get(2)!;
    expect(Math.abs(gi.x - (1 * 256 + 128))).toBeLessThanOrEqual(4);
    expect(Math.abs(gi.y - (1 * 256 + 128))).toBeLessThanOrEqual(4);
  });
});

describe('PRNG / StateHash 基础确定性', () => {
  it('同种子同序列', () => {
    const a = new Prng(99);
    const b = new Prng(99);
    const seqA = Array.from({ length: 10 }, () => a.nextU32());
    const seqB = Array.from({ length: 10 }, () => b.nextU32());
    expect(seqA).toEqual(seqB);
    expect(new Set(seqA).size).toBe(10);
  });

  it('nextInt 边界', () => {
    const r = new Prng(7);
    for (let i = 0; i < 100; i++) {
      const v = r.nextInt(13);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(13);
    }
  });

  it('StateHash 已知向量（FNV-1a "abc"）', () => {
    const h = new StateHash().addBytes(new TextEncoder().encode('abc'));
    expect(h.value).toBe(0x1a47e90b);
  });
});
