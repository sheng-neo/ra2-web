import { describe, expect, it } from 'vitest';
import { Prng } from './prng';
import { StateHash } from './hash';
import { World, type UnitSpec } from './world';
import { gridTerrain, runScript, type ScriptedCommand } from './replay';

const TANK: UnitSpec = { speed: 64, rot: 8 };
const DOG: UnitSpec = { speed: 120, rot: 24 };

function buildScript(): ScriptedCommand[] {
  return [
    { tick: 0, command: { kind: 'spawn', owner: 1, cellX: 2, cellY: 2, spec: TANK } },
    { tick: 0, command: { kind: 'spawn', owner: 1, cellX: 3, cellY: 2, spec: DOG } },
    { tick: 0, command: { kind: 'spawn', owner: 2, cellX: 20, cellY: 20, spec: TANK } },
    { tick: 5, command: { kind: 'move', entityIds: [1, 2], cellX: 18, cellY: 6 } },
    { tick: 40, command: { kind: 'move', entityIds: [3], cellX: 4, cellY: 18 } },
    { tick: 90, command: { kind: 'move', entityIds: [2], cellX: 1, cellY: 1 } },
  ];
}

function blockedSet(): Set<number> {
  const blocked = new Set<number>();
  for (let y = 4; y <= 14; y++) blocked.add(y * 24 + 10); // 一道墙
  return blocked;
}

describe('确定性（锁步命脉）', () => {
  it('同一脚本两次运行 → 哈希序列完全一致', () => {
    const run = () =>
      runScript(new World(gridTerrain(24, 24, blockedSet()), 1234), buildScript(), 300, 5);
    const a = run();
    const b = run();
    expect(a.finalHash).toBe(b.finalHash);
    expect(a.samples).toEqual(b.samples);
    expect(a.samples.length).toBe(60);
  });

  it('不同种子 → 哈希不同（PRNG 进指纹）', () => {
    const a = runScript(new World(gridTerrain(24, 24), 1), buildScript(), 50);
    const b = runScript(new World(gridTerrain(24, 24), 2), buildScript(), 50);
    expect(a.finalHash).not.toBe(b.finalHash);
  });

  it('命令时序敏感：差一个 tick，哈希时间线即分叉', () => {
    // 注意：静止后的最终状态可以合法收敛一致，
    // desync 检测靠的是逐 tick 时间线，比较 samples 而非 finalHash
    const early = buildScript();
    const late = buildScript().map((s, i) => (i === 3 ? { ...s, tick: s.tick + 1 } : s));
    const a = runScript(new World(gridTerrain(24, 24), 7), early, 200, 1);
    const b = runScript(new World(gridTerrain(24, 24), 7), late, 200, 1);
    expect(a.samples).not.toEqual(b.samples);
    // 移动完成、世界静止后两线收敛属预期
    expect(a.finalHash).toBe(b.finalHash);
  });

  it('单位实际抵达目的地', () => {
    const world = new World(gridTerrain(24, 24, blockedSet()), 42);
    runScript(world, buildScript(), 600);
    const dog = world.entities.get(2)!;
    // 终点 (1,1) 的 lepton 中心
    expect(Math.abs(dog.x - (1 * 256 + 128))).toBeLessThanOrEqual(2);
    expect(Math.abs(dog.y - (1 * 256 + 128))).toBeLessThanOrEqual(2);
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
