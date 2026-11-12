/**
 * 调试 / 测试用的启动参数。正式流程不依赖它们(嵌入宿主后查询串会被丢掉，只有纯 hash 可能保留)。
 *
 *   ?skipmenu=1                            跳过菜单直接开局
 *   ?hero=xingli&difficulty=hard           直接开局时的英雄 / 对手难度(走菜单时以选英雄页为准)
 *   ?seed=42                               随机种子(同种子同操作完全可复现)
 *   ?auto=1                                玩家英雄也交给 Bot(MatchConfig.autoPlay)
 *   ?speed=8                               时间倍率(每帧多步，加速跑完整局)
 *   ?quality=low|medium|high               本次会话的画质(不写入存档)
 *   ?fps=1                                 显示帧率
 *
 * 同样的键也可以写在 hash 里：#skipmenu=1&auto=1；单个词的 hash 当作开关：#auto、#fps、#skipmenu，
 * #demo 等于 skipmenu + auto(观战演示)。
 */
import { HERO_IDS } from '../core/data/heroes';
import type { Difficulty, HeroId } from '../core/types';
import type { Quality } from '../render/api';

export interface DebugParams {
  hero: HeroId | null;
  difficulty: Difficulty | null;
  /** 32 位无符号整数种子；未指定为 null(由宿主随机) */
  seed: number | null;
  skipMenu: boolean;
  auto: boolean;
  /** 时间倍率，1..64 */
  speed: number;
  quality: Quality | null;
  showFps: boolean;
}

export const MAX_SPEED = 64;

const truthy = (v: string | null): boolean => v !== null && v !== '0' && v !== 'false' && v !== 'off';

function parseHash(hash: string): URLSearchParams {
  const raw = hash.replace(/^#/, '');
  if (raw === '') return new URLSearchParams();
  if (raw.includes('=') || raw.includes('&')) return new URLSearchParams(raw);
  // 纯单词 hash：当作一个开关
  const out = new URLSearchParams();
  if (raw === 'demo') {
    out.set('skipmenu', '1');
    out.set('auto', '1');
  } else out.set(raw, '1');
  return out;
}

export function parseDebugParams(search: string, hash = ''): DebugParams {
  const query = new URLSearchParams(search);
  const fromHash = parseHash(hash);
  // 查询串优先，hash 兜底
  const get = (key: string): string | null => query.get(key) ?? fromHash.get(key);

  const hero = get('hero');
  const difficulty = get('difficulty');
  const quality = get('quality');

  let seed: number | null = null;
  const seedRaw = get('seed');
  if (seedRaw !== null && seedRaw.trim() !== '') {
    const n = Number(seedRaw);
    if (Number.isFinite(n)) seed = Math.floor(Math.abs(n)) >>> 0;
  }

  let speed = 1;
  const speedRaw = get('speed');
  if (speedRaw !== null) {
    const n = Number(speedRaw);
    if (Number.isFinite(n) && n > 0) speed = Math.min(MAX_SPEED, Math.max(0.1, n));
  }

  return {
    hero: hero !== null && (HERO_IDS as string[]).includes(hero) ? (hero as HeroId) : null,
    difficulty: difficulty === 'easy' || difficulty === 'normal' || difficulty === 'hard' ? difficulty : null,
    seed,
    skipMenu: truthy(get('skipmenu')),
    auto: truthy(get('auto')),
    speed,
    quality: quality === 'low' || quality === 'medium' || quality === 'high' ? quality : null,
    showFps: truthy(get('fps')),
  };
}
