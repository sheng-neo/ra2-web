import { describe, expect, it } from 'vitest';
import { createWorldFromConfig } from '@ra2web/game';
import { SimpleAI } from './ai';
import { localSkirmishConfig } from './match-setup';

/**
 * AI vs AI 全流程：两个 AI 各自建基地、采矿、造兵、交战，
 * 验证整局能在预算内分出胜负且全程不抛异常——这是「真正可玩」的端到端兜底。
 * （纯 sim + AI，不依赖 PixiJS。）
 */
describe('AI 对战全流程', () => {
  it('困难 AI 互殴能分出胜负，不报错', () => {
    const cfg = localSkirmishConfig(5000);
    const world = createWorldFromConfig(cfg);
    const ai1 = new SimpleAI(1, 'hard');
    const ai2 = new SimpleAI(2, 'hard');

    let winner = 0;
    let lastTick = 0;
    for (let t = 0; t < 40000 && winner === 0; t++) {
      if (t % 15 === 0) {
        world.applyCommands(ai1.emit(world));
        world.applyCommands(ai2.emit(world));
      }
      world.step();
      lastTick = t;
      const p1 = world.players.get(1)!;
      const p2 = world.players.get(2)!;
      if (p1.defeated || p2.defeated) winner = p1.defeated ? 2 : 1;
    }
    expect(winner, `应分出胜负（跑到 tick ${lastTick}）`).toBeGreaterThan(0);
    // 双方都曾建过基地（确认 AI 真的发展了，而非开局即负）
    expect(world.players.get(1)!.everBuilt).toBe(true);
    expect(world.players.get(2)!.everBuilt).toBe(true);
  });

  it('各打法人格都能在预算内分出胜负（无僵局）', () => {
    // 不同种子 → player1 抽到不同人格，逐一对阵，验证都能收敛（防某人格组合拉锯）
    for (const s of [0, 1, 2, 3]) {
      const world = createWorldFromConfig(localSkirmishConfig(5000));
      const a = new SimpleAI(1, 'hard', s);
      const b = new SimpleAI(2, 'hard', 0);
      let winner = 0;
      for (let t = 0; t < 24000 && winner === 0; t++) {
        if (t % 15 === 0) {
          world.applyCommands(a.emit(world));
          world.applyCommands(b.emit(world));
        }
        world.step();
        const p1 = world.players.get(1)!;
        const p2 = world.players.get(2)!;
        if (p1.defeated || p2.defeated) winner = p1.defeated ? 2 : 1;
      }
      expect(winner, `人格 ${a.personality} vs ${b.personality}(seed=${s}) 应分胜负`).toBeGreaterThan(0);
    }
  });

  it('打法人格由种子决定：同种子复现、不同种子可抽到不同人格', () => {
    const persona = (seed: number): string => new SimpleAI(2, 'normal', seed).personality;
    expect(persona(7)).toBe(persona(7)); // 同种子 → 同人格（可复现）
    const set = new Set([persona(0), persona(1), persona(2), persona(3)]);
    expect(set.size).toBeGreaterThan(1); // 不同种子 → 能抽到不同打法
  });

  it('两次同种子运行结果一致（AI 决策确定性）', () => {
    const run = (): number => {
      const world = createWorldFromConfig(localSkirmishConfig(5000));
      const a = new SimpleAI(1, 'normal');
      const b = new SimpleAI(2, 'normal');
      for (let t = 0; t < 1500; t++) {
        if (t % 15 === 0) {
          world.applyCommands(a.emit(world));
          world.applyCommands(b.emit(world));
        }
        world.step();
      }
      return world.hash();
    };
    expect(run()).toBe(run());
  });
});
