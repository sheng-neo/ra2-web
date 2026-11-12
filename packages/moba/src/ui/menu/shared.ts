/**
 * 菜单各界面共用的数据与小组件：英雄能力评分、难度说明、头像、星级、数字格式化。
 */
import { HEROES } from '../../core/data/heroes';
import type { Difficulty, HeroId, HeroRole } from '../../core/types';
import { roleIcon, uiIcon } from '../icons';
import { h, icon } from '../theme';

/** 展示顺序：按分路（上路 → 打野 → 中路 → 下路射手 → 下路坦克），与小地图阅读顺序一致 */
export const HERO_ORDER: HeroId[] = ['chijin', 'yeque', 'xingli', 'fengling', 'panyue'];

export const ROLE_COLOR: Record<HeroRole, string> = {
  tank: '#8fb8e8',
  fighter: '#ff9466',
  mage: '#9aa8ff',
  marksman: '#7fe6b6',
  assassin: '#c3a0ff',
};

export type RatingKey = 'survive' | 'damage' | 'control' | 'mobility' | 'ease';
export const RATING_LABELS: Record<RatingKey, string> = { survive: '生存', damage: '输出', control: '控制', mobility: '机动', ease: '上手' };
export const RATING_KEYS: RatingKey[] = ['survive', 'damage', 'control', 'mobility', 'ease'];

/**
 * 五维评分(1~10)，依据 data/heroes.ts 的数值给出：
 * - 生存：8 级时的等效生命(生命 × (1+护甲/600))，并计入护盾/减伤/回血技能；
 * - 输出：技能倍率与普攻成长（射手持续输出、法师/刺客爆发最高）；
 * - 控制：击飞/眩晕/牵引/减速的数量与时长；
 * - 机动：位移技能数量、移速、冷却刷新；
 * - 上手：由 difficulty(1~3) 反推，越高越容易上手。
 */
export const HERO_RATINGS: Record<HeroId, Record<RatingKey, number>> = {
  panyue: { survive: 9.6, damage: 4.6, control: 9.4, mobility: 5.4, ease: 9 },
  chijin: { survive: 7.2, damage: 7.6, control: 4.4, mobility: 7.4, ease: 7 },
  xingli: { survive: 4.2, damage: 9, control: 8, mobility: 2.6, ease: 6.2 },
  fengling: { survive: 3.8, damage: 9.6, control: 5, mobility: 6.8, ease: 6.6 },
  yeque: { survive: 5.4, damage: 9.2, control: 3.4, mobility: 9.6, ease: 3.6 },
};

export const DIFFICULTY_META: Record<Difficulty, { label: string; desc: string }> = {
  easy: { label: '简单', desc: 'AI 反应慢、技能不准、很少越线，适合熟悉英雄。' },
  normal: { label: '普通', desc: 'AI 会补刀换血、游走抱团，接近普通玩家。' },
  hard: { label: '困难', desc: 'AI 反应快，会集火、反蹲与连招收割。' },
};
export const DIFFICULTIES: Difficulty[] = ['easy', 'normal', 'hard'];

/** 能提供英雄头像的宿主（MenuHost / HudHost 都满足） */
export interface PortraitSource {
  portrait(heroId: HeroId): string;
}

/** 已经解码过的头像地址：再建头像元素时直接同步显示成品，不再走「兜底色块 → 淡入」 */
const decodedSrc = new Set<string>();

/**
 * 英雄头像：宿主给的 data URL 铺满；图还没到或失败时，露出英雄主题色底 + 定位徽标，
 * 所以渲染层没就绪时界面也不会出现破图。
 */
export function createPortrait(host: PortraitSource, heroId: HeroId, cls?: string): HTMLSpanElement {
  const def = HEROES[heroId];
  const el = h('span', `sf-portrait${cls ? ` ${cls}` : ''}`, icon(roleIcon(def.role), 'sf-portrait__fallback'));
  el.style.setProperty('--sf-hero-a', def.palette.primary);
  el.style.setProperty('--sf-hero-b', def.palette.secondary);
  el.style.setProperty('--sf-hero-c', def.palette.glow);
  let src = '';
  try {
    src = host.portrait(heroId);
  } catch {
    src = '';
  }
  if (src) {
    const img = document.createElement('img');
    img.alt = def.name;
    img.draggable = false;
    const ready = decodedSrc.has(src);
    // 解码过的图：同步解码(命中缓存，几乎不花时间)并直接标记为已载入，第一帧就是成品
    img.decoding = ready ? 'sync' : 'async';
    if (ready) el.classList.add('is-loaded');
    img.addEventListener('load', () => {
      decodedSrc.add(src);
      el.classList.add('is-loaded');
    });
    img.addEventListener('error', () => {
      el.classList.remove('is-loaded');
      img.remove();
    });
    img.src = src;
    el.appendChild(img);
  }
  return el;
}

/**
 * 预先把头像图片解码好(加载页期间调用)：之后 createPortrait 建出来的头像第一帧就是成品图。
 * 永不 reject：某张图解不出来就跳过，界面对它仍走兜底样式。
 */
export function preloadPortraits(host: PortraitSource, heroIds: readonly HeroId[]): Promise<void> {
  const jobs: Promise<void>[] = [];
  const seen = new Set<string>();
  for (const id of heroIds) {
    let src = '';
    try {
      src = host.portrait(id);
    } catch {
      src = '';
    }
    if (!src || seen.has(src) || decodedSrc.has(src)) continue;
    seen.add(src);
    jobs.push(
      new Promise<void>((resolve) => {
        const img = new Image();
        const ok = (): void => {
          decodedSrc.add(src);
          resolve();
        };
        img.src = src;
        if (typeof img.decode === 'function') {
          img.decode().then(ok, () => resolve());
        } else {
          img.addEventListener('load', ok);
          img.addEventListener('error', () => resolve());
        }
      }),
    );
  }
  return Promise.all(jobs).then(() => undefined);
}

/** 上手难度星级（1~3 颗实心星） */
export function createStars(n: number, max = 3): HTMLSpanElement {
  const el = h('span', 'sf-stars');
  el.setAttribute('aria-label', `上手难度 ${n} / ${max}`);
  for (let i = 0; i < max; i++) el.appendChild(icon(uiIcon(i < n ? 'star' : 'star_empty'), i < n ? 'is-on' : ''));
  return el;
}

/** 秒 → mm:ss */
export function fmtClock(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

/** 大数字缩写：12345 → 12.3k */
export function fmtK(n: number): string {
  const v = Math.round(n);
  return v >= 10000 ? `${(v / 1000).toFixed(1)}k` : String(v);
}

export function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
