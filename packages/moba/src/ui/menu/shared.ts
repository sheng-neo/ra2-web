/**
 * 菜单各界面共用的数据与小组件：英雄能力评分、难度说明、头像、星级、数字格式化；
 * 以及 HUD 与选英雄页共用的「名字 · 职业」写法和技能类型标签(胶囊)。
 */
import { HEROES, HERO_IDS, heroFullName } from '../../core/data/heroes';
import type { Difficulty, HeroId, HeroRole, SkillTag } from '../../core/types';
import { SKILL_TAG_META } from '../hud/text';
import { roleIcon, uiIcon } from '../icons';
import { h, icon, injectStyle, sfCss } from '../theme';

/** 展示顺序：樊哙 → 程咬金 → 王昭君 → 李广 → 荆轲(坦克 / 战士 / 法师 / 射手 / 刺客，与数据里的 HERO_IDS 同序) */
export const HERO_ORDER: HeroId[] = HERO_IDS;

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

/** 职业一句大白话(选英雄页详情的第一行)：没玩过这类游戏的人看了就知道这个职业是干什么的 */
export const ROLE_BRIEF: Record<HeroRole, string> = {
  tank: '皮厚能扛，冲在最前面替队友挡伤害',
  fighter: '能打也能扛，贴上去近身缠斗',
  mage: '站在后排放法术，伤害高、身板脆',
  marksman: '远远地普攻输出，越到后期越厉害',
  assassin: '专挑残血和脆皮下手，来去都快',
};

/**
 * 五维评分(1~10)，依据 data/heroes.ts 的数值给出(第二阶段换了人物身份，机制与数值没动，评分按新技能逐项复核过，不变)：
 * - 生存：8 级时的等效生命(生命 × (1+护甲/600))，并计入护盾/减伤/回血技能；
 * - 输出：技能倍率与普攻成长（射手持续输出、法师/刺客爆发最高）；
 * - 控制：击飞/眩晕/牵引/减速的数量与时长；
 * - 机动：位移技能数量、移速、冷却刷新；
 * - 上手：由 difficulty(1~3) 反推，越高越容易上手。
 */
export const HERO_RATINGS: Record<HeroId, Record<RatingKey, number>> = {
  // 樊哙：两段击飞 + 两个减速，自带护盾；位移只有一段冲撞和一次跃击
  panyue: { survive: 9.6, damage: 4.6, control: 9.4, mobility: 5.4, ease: 9 },
  // 程咬金：被动回血、大招减伤；只有一斧带减速；一段突进
  chijin: { survive: 7.2, damage: 7.6, control: 4.4, mobility: 7.4, ease: 7 },
  // 王昭君：余音三层眩晕 + 拉拽 + 大招减速；没有任何位移
  xingli: { survive: 4.2, damage: 9, control: 8, mobility: 2.6, ease: 6.2 },
  // 李广：连射越打越快；重箭与箭雨都带减速；一段翻跃
  fengling: { survive: 3.8, damage: 9.6, control: 5, mobility: 6.8, ease: 6.6 },
  // 荆轲：突刺 + 大招贴身 + 击杀刷新；控制只有掷匕的减速
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
    img.alt = heroFullName(def);
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

// ───────────────────────── 「名字 · 职业」 ─────────────────────────

/**
 * 英雄全称的节点：「樊哙 · 坦克」，职业部分小一号、用职业色(样式类 .sf-heroname，随 ensureTagStyle 注入)。
 * 只要名字的地方(头顶、击杀播报)直接用 HeroDef.name，不走这里。
 */
export function heroNameNode(heroId: HeroId, cls?: string): HTMLSpanElement {
  ensureTagStyle();
  const def = HEROES[heroId];
  const role = h('small', 'sf-heroname__role', ` · ${def.roleName}`);
  const el = h('span', `sf-heroname${cls ? ` ${cls}` : ''}`, def.name, role);
  el.style.setProperty('--role', ROLE_COLOR[def.role]);
  return el;
}

// ───────────────────────── 技能类型标签 ─────────────────────────

/** 带「大招」「被动」这两个自动标签的槽位 */
export type TagSlot = 'passive' | 's1' | 's2' | 'ult';

const TAG_CSS = sfCss(`
.sf-heroname { white-space: nowrap; }
.sf-heroname__role { font-size: 0.72em; font-weight: 600; letter-spacing: 0.04em; color: var(--role, var(--sf-c-text-2)); -webkit-text-fill-color: var(--role, var(--sf-c-text-2)); }
/* 技能类型标签：胶囊形，文字用标签色，底色为标签色 14% 不透明度，1px 同色 45% 描边。颜色只是辅助，文字永远在 */
.sf-stags { display: inline-flex; flex-wrap: wrap; align-items: center; gap: 4u 5u; vertical-align: middle; }
.sf-stag {
  --tag: 243, 207, 133;
  display: inline-flex; align-items: center; flex: none; height: 1.7em; padding: 0 0.62em; border-radius: 99px; font-size: var(--sf-fs-xs); font-weight: 700; line-height: 1; letter-spacing: 0.06em; white-space: nowrap;
  color: rgb(var(--tag)); background: rgba(var(--tag), 0.14); box-shadow: inset 0 0 0 1px rgba(var(--tag), 0.45);
}
/* 「大招」：金色实底、深色字；「被动」：青色描边、不铺底 */
.sf-stag.is-ult { color: #2b1a04; background: var(--sf-grad-gold); box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.6); }
.sf-stag.is-passive { --tag: 143, 233, 255; background: none; }
`);

/** 注入标签与全称的样式(HUD 与菜单各自调用，重复调用无副作用) */
export function ensureTagStyle(): void {
  injectStyle('sf-skill-tags', TAG_CSS);
}

/** '#5cd6f7' → '92, 214, 247'(给 rgb() / rgba() 用) */
export function hexRgb(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  return `${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}`;
}

/**
 * 一排技能标签(HTML 字符串)：槽位自动标签(大招 / 被动)在前，其后是数据里的 1~2 个类型标签。
 * 没有任何标签时返回空串。用之前先 ensureTagStyle()。
 */
export function skillTagsHtml(slot: TagSlot, tags: readonly SkillTag[] | undefined): string {
  let out = slot === 'ult' ? '<span class="sf-stag is-ult">大招</span>' : slot === 'passive' ? '<span class="sf-stag is-passive">被动</span>' : '';
  for (const t of tags ?? []) {
    const m = SKILL_TAG_META[t];
    out += `<span class="sf-stag" style="--tag:${hexRgb(m.color)}">${m.name}</span>`;
  }
  return out ? `<span class="sf-stags">${out}</span>` : '';
}

/**
 * 一个槽位「最要紧的那个标签」的两字写法与颜色：大招 → 大招(金)，被动 → 被动(青)，其余取 tags[0]。
 * 技能键角标、选英雄页技能图标下的小字用。没有标签返回 null。
 */
export function skillKeyTag(slot: TagSlot, tags: readonly SkillTag[] | undefined): { text: string; color: string } | null {
  if (slot === 'ult') return { text: '大招', color: '#ffe7ad' };
  if (slot === 'passive') return { text: '被动', color: '#8fe9ff' };
  const t = tags?.[0];
  return t ? { text: SKILL_TAG_META[t].short, color: SKILL_TAG_META[t].color } : null;
}
