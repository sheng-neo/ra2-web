/**
 * 结算页：胜利/失败大标题、对局概况、双方 10 人战绩表(英雄写全称「名字 · 职业」，职业小字)、MVP、再来一局/返回主菜单。
 */
import { ITEMS } from '../../core/data/items';
import type { GameState, HeroUnit, PlayerTeam } from '../../core/types';
import type { MenuHost } from '../api';
import { itemIcon, uiIcon } from '../icons';
import { attachTooltip, bindUiSounds, createBadge, createButton, createSlot, dismissTooltip, ensureTheme, h, hasOpenDialog, icon, injectStyle, isButtonKeyFocused, sfCss } from '../theme';
import { createBackdrop } from './backdrop';
import { itemTooltipHtml } from './select';
import { createPortrait, fmtClock, fmtK, heroNameNode } from './shared';

// ───────────────────────── 评分 ─────────────────────────

export interface HeroScore {
  /** 综合评分的原始分(内部刻度约 3~16，越高越好；MVP 判定用它)。界面上显示的是 displayScore() 换算出的 10 分制 */
  score: number;
  /** 参团率 0..1 */
  participation: number;
}

/**
 * 综合评分公式（每位英雄相对自己队伍计算占比）：
 *   3 基础分
 * + min(4, KDA × 0.8)             KDA = (击杀 + 0.6×助攻) / max(1, 阵亡)
 * + 参团率 × 2.5                   (击杀+助攻) / 队伍总击杀
 * + 对英雄伤害占比 × 6
 * + 承伤占比 × 3                   让前排的贡献被看见
 * + 推塔伤害占比 × 2.5
 * + min(1, 补兵 / (分钟×6))        发育
 * + 获胜方 1 分
 * MVP = 胜方评分最高者；败方评分最高者标「败方最佳」。
 */
const SCORE_MIN = 3;
const SCORE_MAX = 16;

/** 界面显示用的 10 分制评分(一位小数)：把原始分的 3~16 线性换算到 0~10。只改显示刻度，判定仍用原始分 */
export function displayScore(score: number): string {
  const v = ((score - SCORE_MIN) / (SCORE_MAX - SCORE_MIN)) * 10;
  return Math.max(0, Math.min(10, v)).toFixed(1);
}

export function computeScores(state: GameState): Map<number, HeroScore> {
  const out = new Map<number, HeroScore>();
  // 对局时长按分出胜负那一刻算(state.endTime)：之后为播结束演出，state.time 还会多走几秒
  const minutes = Math.max(1, (state.endTime ?? state.time) / 60);
  for (const team of [0, 1] as PlayerTeam[]) {
    const members = state.heroes.filter((x) => x.team === team);
    const sum = (f: (x: HeroUnit) => number): number => Math.max(1, members.reduce((acc, x) => acc + f(x), 0));
    const kills = sum((x) => x.kills);
    const dealt = sum((x) => x.dmgDealt);
    const taken = sum((x) => x.dmgTaken);
    const tower = sum((x) => x.dmgTower);
    for (const x of members) {
      const kda = (x.kills + x.assists * 0.6) / Math.max(1, x.deaths);
      const participation = Math.min(1, (x.kills + x.assists) / kills);
      const score =
        3 +
        Math.min(4, kda * 0.8) +
        participation * 2.5 +
        (x.dmgDealt / dealt) * 6 +
        (x.dmgTaken / taken) * 3 +
        (x.dmgTower / tower) * 2.5 +
        Math.min(1, x.cs / (minutes * 6)) +
        (state.winner === team ? 1 : 0);
      out.set(x.id, { score: Math.max(0, Math.min(SCORE_MAX, score)), participation });
    }
  }
  return out;
}

// ───────────────────────── 样式 ─────────────────────────

const CSS = sfCss(`
.sf-result { display: grid; grid-template-rows: auto minmax(0, 1fr) auto; gap: 10u; padding: max(10u, var(--sf-safe-t)) max(28u, var(--sf-safe-r)) max(14u, var(--sf-safe-b)) max(28u, var(--sf-safe-l)); background: rgba(3, 6, 16, 0.35); --tone: var(--sf-c-gold-200); --tone-rgb: 255, 214, 130; }
.sf-result--lose { --tone: #9fb0d0; --tone-rgb: 150, 170, 215; }

/* ── 标题横幅 ── */
.sf-result__banner { position: relative; display: flex; flex-direction: column; align-items: center; gap: 2u; padding-top: 2u; isolation: isolate; }
.sf-result__rays { --r: max(190px, 380u); position: absolute; left: calc(50% - var(--r)); top: calc(46% - var(--r)); width: calc(var(--r) * 2); height: calc(var(--r) * 2); z-index: -1; border-radius: 50%; pointer-events: none;
  background: repeating-conic-gradient(from 0deg, rgba(var(--tone-rgb), 0.2) 0deg 5deg, rgba(var(--tone-rgb), 0) 5deg 15deg);
  -webkit-mask-image: radial-gradient(circle, #000 0, rgba(0, 0, 0, 0.5) 22%, transparent 62%); mask-image: radial-gradient(circle, #000 0, rgba(0, 0, 0, 0.5) 22%, transparent 62%);
  animation: sf-spin 60s linear infinite; }
.sf-result--lose .sf-result__rays { display: none; }
.sf-result__titlewrap { position: relative; }
.sf-result__title { position: relative; margin: 0; font-weight: 900; font-size: max(44px, 84u); line-height: 1.08; letter-spacing: 0.34em; margin-right: -0.34em; white-space: nowrap; }
.sf-result--win .sf-result__title { filter: drop-shadow(0 max(1px, 2u) 0 #6b4614) drop-shadow(0 max(2px, 5u) 0 rgba(24, 12, 0, 0.75)) drop-shadow(0 0 34u rgba(255, 200, 110, 0.6)); animation: sf-result-win 0.9s var(--sf-ease-out) both; }
.sf-result--lose .sf-result__title { background-image: linear-gradient(180deg, #e3ebfb 0%, #9fb0d0 38%, #56648a 56%, #3a4566 62%, #8a6470 84%, #c98a92 100%); filter: drop-shadow(0 max(1px, 2u) 0 #10162c) drop-shadow(0 max(2px, 5u) 0 rgba(0, 0, 0, 0.7)) drop-shadow(0 0 26u rgba(182, 60, 70, 0.35)); animation: sf-result-lose 1.1s var(--sf-ease-out) both; }
@keyframes sf-result-win { 0% { opacity: 0; transform: scale(2.4); filter: brightness(3); } 55% { opacity: 1; transform: scale(0.96); } 100% { opacity: 1; transform: none; } }
@keyframes sf-result-lose { 0% { opacity: 0; transform: translateY(-40u) rotate(-2deg); } 55% { opacity: 1; transform: translateY(4u) rotate(0.6deg); } 100% { opacity: 1; transform: none; } }
.sf-result__wing { position: absolute; top: 50%; width: max(60px, 190u); height: 2px; background: linear-gradient(90deg, rgba(var(--tone-rgb), 0), var(--tone)); animation: sf-fade-in 0.8s 0.5s linear both; }
.sf-result__wing::after { content: ''; position: absolute; right: -4u; top: 50%; width: 8u; height: 8u; margin-top: -4u; transform: rotate(45deg); background: var(--tone); box-shadow: 0 0 10u var(--tone); }
.sf-result__wing--l { right: calc(100% + 26u); }
.sf-result__wing--r { left: calc(100% + 26u - 0.34em); transform: scaleX(-1); }
.sf-result__sub { display: none; margin: 0; font-size: var(--sf-fs-sm); letter-spacing: 0.4em; margin-right: -0.4em; color: var(--sf-c-text-2); text-shadow: 0 1px 4px rgba(0, 0, 0, 0.9); animation: sf-rise-in 0.6s 0.45s var(--sf-ease-out) both; }
.sf-result__summary { display: flex; align-items: center; gap: 18u; margin-top: 2u; animation: sf-rise-in 0.6s 0.55s var(--sf-ease-out) both; }
.sf-result__vs { display: flex; align-items: center; gap: 12u; font-size: max(20px, 30u); font-weight: 800; line-height: 1; }
.sf-result__vs b { font-family: var(--sf-font-num); }
.sf-result__vs .is-blue { color: var(--sf-c-blue); text-shadow: 0 0 12u rgba(77, 163, 255, 0.6); }
.sf-result__vs .is-red { color: var(--sf-c-red); text-shadow: 0 0 12u rgba(255, 93, 93, 0.6); }
.sf-result__vs .sf-i { width: 0.8em; height: 0.8em; color: var(--sf-c-text-3); }
.sf-result__vs small { font-weight: 600; font-size: var(--sf-fs-xs); letter-spacing: 0.14em; color: var(--sf-c-text-3); }
.sf-result__chip { display: inline-flex; align-items: center; gap: 6u; font-size: var(--sf-fs-sm); letter-spacing: 0.08em; color: var(--sf-c-text-2); white-space: nowrap; }
.sf-result__chip .sf-i { color: var(--sf-c-gold-300); }
.sf-result__chip b { font-family: var(--sf-font-num); font-size: var(--sf-fs-md); color: var(--sf-c-text); }

/* ── 战绩表 ── */
.sf-result__board { display: flex; flex-direction: column; min-height: 0; animation: sf-rise-in 0.6s 0.65s var(--sf-ease-out) both; }
.sf-result__scroll { flex: 1; min-height: 0; padding: 6u 12u 8u; }
.sf-rt { --cols: minmax(0, 1.7fr) 100u 52u 74u minmax(0, 1.05fr) minmax(0, 0.9fr) 70u auto 62u; display: flex; flex-direction: column; gap: 3u; min-width: 0; }
.sf-rt__head, .sf-rt__row { display: grid; grid-template-columns: var(--cols); align-items: center; column-gap: 10u; padding: 0 10u; }
.sf-rt__head { position: sticky; top: 0; z-index: 2; height: max(22px, 24u); font-size: var(--sf-fs-xs); letter-spacing: 0.12em; color: var(--sf-c-text-3); background: linear-gradient(180deg, #0d1736 70%, rgba(13, 23, 54, 0)); }
.sf-rt__head > span { white-space: nowrap; }
.sf-rt__c { text-align: center; }
.sf-rt__items-h { width: calc(max(24px, 29u) * 6 + max(3px, 4u) * 5); text-align: center; }
.sf-rt__h-short { display: none; }
.sf-rt__team { display: flex; align-items: center; gap: 14u; height: max(22px, 26u); padding: 0 10u; margin-top: 4u; border-radius: 5u; font-size: var(--sf-fs-xs); letter-spacing: 0.1em; color: var(--sf-c-text-2); background: linear-gradient(90deg, rgba(var(--team-rgb), 0.3), rgba(var(--team-rgb), 0.04) 70%); box-shadow: inset max(3px, 3u) 0 0 rgb(var(--team-rgb)); }
.sf-rt__team:first-of-type { margin-top: 0; }
.sf-rt__team b { font-weight: 800; font-size: var(--sf-fs-sm); letter-spacing: 0.2em; color: rgb(var(--team-rgb)); }
.sf-rt__team span { display: inline-flex; align-items: center; gap: 4u; white-space: nowrap; }
.sf-rt__team .sf-num { font-size: var(--sf-fs-sm); color: var(--sf-c-text); }
.sf-rt__team .sf-badge { margin-left: auto; }
.sf-rt__row { position: relative; min-height: max(34px, 37u); border-radius: 6u; background: rgba(20, 34, 72, 0.4); box-shadow: inset 0 0 0 1px rgba(150, 178, 235, 0.08); font-size: var(--sf-fs-sm); animation: sf-rise-in 0.4s var(--sf-ease-out) both; }
.sf-rt__row.is-me { background: linear-gradient(90deg, rgba(183, 243, 107, 0.2), rgba(183, 243, 107, 0.05) 60%, rgba(20, 34, 72, 0.4)); box-shadow: inset 0 0 0 1px rgba(183, 243, 107, 0.5), inset max(3px, 3u) 0 0 var(--sf-c-me); }
.sf-rt__row.is-mvp:not(.is-me) { background: linear-gradient(90deg, rgba(255, 214, 130, 0.16), rgba(20, 34, 72, 0.4) 55%); box-shadow: inset 0 0 0 1px rgba(255, 214, 130, 0.38); }
.sf-rt__hero { display: flex; align-items: center; gap: 9u; min-width: 0; }
.sf-rt__pic-wrap { position: relative; flex: none; }
.sf-rt__pic { width: max(28px, 31u); height: max(28px, 31u); border-radius: 6u; box-shadow: 0 0 0 1px rgba(8, 13, 31, 0.9), 0 0 0 max(1.5px, 2u) rgba(var(--team-rgb), 0.8); }
.sf-rt__lv { position: absolute; right: -5u; bottom: -4u; min-width: max(15px, 17u); height: max(15px, 17u); padding: 0 3u; display: grid; place-items: center; border-radius: 99px; font-family: var(--sf-font-num); font-weight: 700; font-size: max(10px, 11u); line-height: 1; color: var(--sf-c-gold-100); background: #0a1128; box-shadow: 0 0 0 1px var(--sf-c-gold-500); }
.sf-rt__name { flex: none; font-weight: 700; font-size: var(--sf-fs-md); letter-spacing: 0.08em; color: var(--sf-c-text); white-space: nowrap; }
.sf-rt__badges { display: flex; align-items: center; gap: 4u; min-width: 0; overflow: hidden; }
.sf-rt__cell { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 2u; min-width: 0; text-align: center; }
.sf-rt__lab { display: none; font-size: var(--sf-fs-xs); color: var(--sf-c-text-3); letter-spacing: 0.06em; }
.sf-rt__val { font-family: var(--sf-font-num); font-variant-numeric: tabular-nums; font-size: var(--sf-fs-md); color: var(--sf-c-text); white-space: nowrap; }
.sf-rt__kda { letter-spacing: 0.04em; }
.sf-rt__kda i { font-style: normal; color: var(--sf-c-text-4); margin: 0 0.18em; }
.sf-rt__kda .is-d { color: #ff9a9a; }
.sf-rt__kda .is-a { color: var(--sf-c-text-2); }
.sf-rt__gold { color: var(--sf-c-gold-200); }
.sf-rt__bar { width: 100%; max-width: 110u; height: max(3px, 4u); border-radius: 99px; background: rgba(4, 8, 22, 0.7); overflow: hidden; }
.sf-rt__bar i { display: block; height: 100%; width: calc(var(--v) * 100%); border-radius: inherit; background: rgb(var(--team-rgb)); transform-origin: 0 50%; animation: sf-bar-grow 0.9s 0.9s var(--sf-ease-out) both; }
.sf-rt__bar--taken i { background: #9fb0d0; }
@keyframes sf-bar-grow { from { transform: scaleX(0); } to { transform: none; } }
.sf-rt__items { display: flex; gap: max(3px, 4u); }
.sf-rt__items .sf-slot { --sf-slot: max(24px, 29u); border-radius: 5u; box-shadow: 0 0 0 1px rgba(150, 178, 235, 0.3); }
.sf-rt__items .sf-slot--empty { box-shadow: inset 0 0 0 1px rgba(150, 178, 235, 0.16); }
.sf-rt__score .sf-rt__val { font-weight: 700; font-size: var(--sf-fs-lg); color: var(--sf-c-text); }
.sf-rt__row.is-mvp .sf-rt__score .sf-rt__val { color: var(--sf-c-gold-200); text-shadow: 0 0 10u rgba(255, 214, 130, 0.6); }

.sf-result__actions { display: flex; justify-content: center; gap: 16u; animation: sf-rise-in 0.6s 0.8s var(--sf-ease-out) both; }
.sf-result__actions .sf-btn { min-width: max(150px, 220u); }
.sf-result-root.is-closing { animation: sf-fade-out 0.35s linear both; pointer-events: none; }

/* ── 矮屏（横屏手机）：横幅压成一行 ── */
@media (max-height: 520px) and (orientation: landscape) {
  .sf-result { gap: 6u; padding-top: max(4u, var(--sf-safe-t)); padding-bottom: max(8u, var(--sf-safe-b)); }
  .sf-result__banner { flex-direction: row; justify-content: center; gap: 22u; }
  .sf-result__title { font-size: max(34px, 52u); }
  .sf-result__wing { display: none; }
  .sf-rt__h-full { display: none; }
  .sf-rt__h-short { display: inline; }
  .sf-result__summary { margin-top: 0; }
  .sf-result__rays { top: calc(50% - var(--r)); }
  .sf-rt { --cols: minmax(0, 1.5fr) 92u 46u 66u minmax(0, 1fr) minmax(0, 0.85fr) 62u auto 54u; }
  .sf-rt__head, .sf-rt__row { column-gap: 7u; padding: 0 8u; }
  .sf-result__actions .sf-btn { --sf-btn-h: max(40px, 46u); }
  /* 英雄列窄：只留名字(职业看头像)，把地方让给「你 / MVP」徽标 */
  .sf-rt__name .sf-heroname__role { display: none; }
}

/* ── 小横屏（如 667×375）：去掉补兵与推塔两列，保持一行一人 ── */
@media (orientation: landscape) and (max-width: 780px) {
  .sf-rt { --cols: minmax(0, 1.5fr) 84u minmax(0, 0.8fr) minmax(0, 1fr) minmax(0, 0.9fr) auto 50u; }
  .sf-rt__cell[data-c='cs'], .sf-rt__cell[data-c='tower'], .sf-rt__head > [data-c='cs'], .sf-rt__head > [data-c='tower'] { display: none; }
  .sf-rt__items { gap: 2px; }
  .sf-rt__items .sf-slot { --sf-slot: 22px; }
  .sf-rt__items-h { width: 142px; }
  .sf-rt__badges .sf-badge { padding: 0 4u; }
  .sf-result__chip:last-child { display: none; }
}

/* ── 竖屏：每位英雄一张卡片 ── */
@media (orientation: portrait) {
  .sf-result { padding-left: max(10u, var(--sf-safe-l)); padding-right: max(10u, var(--sf-safe-r)); }
  .sf-result__sub { display: block; }
  .sf-result__summary { flex-wrap: wrap; justify-content: center; gap: 6u 16u; margin-top: 6u; }
  .sf-result__wing { display: none; }
  .sf-result__scroll { padding: 8u; }
  .sf-rt { gap: 6u; }
  .sf-rt__head { display: none; }
  .sf-rt__row { grid-template-columns: repeat(3, minmax(0, 1fr)); grid-template-areas: 'hero hero score' 'kda cs gold' 'dmg taken tower' 'items items items'; row-gap: 7u; padding: 9u 10u; }
  .sf-rt__hero { grid-area: hero; }
  .sf-rt__score { grid-area: score; align-items: flex-end; }
  .sf-rt__cell[data-c='kda'] { grid-area: kda; }
  .sf-rt__cell[data-c='cs'] { grid-area: cs; }
  .sf-rt__cell[data-c='gold'] { grid-area: gold; }
  .sf-rt__cell[data-c='dmg'] { grid-area: dmg; }
  .sf-rt__cell[data-c='taken'] { grid-area: taken; }
  .sf-rt__cell[data-c='tower'] { grid-area: tower; }
  .sf-rt__items { grid-area: items; justify-content: flex-start; }
  .sf-rt__items .sf-slot { --sf-slot: max(30px, 36u); }
  .sf-rt__lab { display: block; }
  .sf-rt__cell { flex-direction: row; justify-content: flex-start; gap: 6u; flex-wrap: wrap; }
  .sf-rt__score { flex-direction: row; justify-content: flex-end; }
  .sf-rt__bar { flex-basis: 100%; max-width: none; }
  .sf-result__actions { gap: 10u; }
  .sf-result__actions .sf-btn { flex: 1; min-width: 0; padding: 0 10u; }
}
`);

// ───────────────────────── 构建 ─────────────────────────

function headCell(label: string, col: string): HTMLElement {
  const el = h('span', 'sf-rt__c', label);
  el.dataset.c = col;
  return el;
}

function statCell(col: string, label: string, value: string, extra?: HTMLElement | null, valCls?: string): HTMLElement {
  const cell = h('span', 'sf-rt__cell', h('span', 'sf-rt__lab', label), h('span', `sf-rt__val${valCls ? ` ${valCls}` : ''}`, value), extra);
  cell.dataset.c = col;
  return cell;
}

export interface ResultOptions {
  /** 取消信号：宿主丢弃整个流程(软重启)时 abort。结算页立即释放 DOM 与监听，返回的 Promise 不再 resolve */
  signal?: AbortSignal;
}

/** 显示结算页。玩家点「再来一局」resolve('again')，点「返回主菜单」resolve('menu') */
export function showResult(root: HTMLElement, state: GameState, host: MenuHost, opts: ResultOptions = {}): Promise<'again' | 'menu'> {
  // 还没显示就已被取消：什么都不建
  if (opts.signal?.aborted) return new Promise<'again' | 'menu'>(() => {});
  ensureTheme();
  injectStyle('sf-menu-result', CSS);

  const player = state.heroes.find((x) => x.isPlayer) ?? state.heroes[0];
  const myTeam: PlayerTeam = player ? player.team : 0;
  const winner: PlayerTeam = state.winner ?? (state.teams[0].kills >= state.teams[1].kills ? 0 : 1);
  const win = winner === myTeam;
  const scores = computeScores({ ...state, winner });
  const tipDisposers: (() => void)[] = [];

  const best = (team: PlayerTeam): number => {
    let id = -1;
    let top = -1;
    for (const x of state.heroes) {
      const sc = scores.get(x.id)?.score ?? 0;
      if (x.team === team && sc > top) {
        top = sc;
        id = x.id;
      }
    }
    return id;
  };
  const mvpId = best(winner);
  const svpId = best(winner === 0 ? 1 : 0);
  const maxDealt = Math.max(1, ...state.heroes.map((x) => x.dmgDealt));
  const maxTaken = Math.max(1, ...state.heroes.map((x) => x.dmgTaken));

  // ── 横幅 ──
  const title = h('h1', `sf-result__title sf-metal`, win ? '胜利' : '失败');
  const titleWrap = h('div', 'sf-result__titlewrap', h('i', 'sf-result__wing sf-result__wing--l'), title, h('i', 'sf-result__wing sf-result__wing--r'));
  const blue = state.teams[0];
  const red = state.teams[1];
  const banner = h(
    'header',
    'sf-result__banner',
    h('div', 'sf-result__rays'),
    titleWrap,
    h('p', 'sf-result__sub', win ? '敌方水晶已被摧毁' : '我方水晶被摧毁'),
    h(
      'div',
      'sf-result__summary',
      h('span', 'sf-result__vs', h('small', null, '蓝方'), h('b', 'is-blue', String(blue.kills)), icon(uiIcon('kill')), h('b', 'is-red', String(red.kills)), h('small', null, '红方')),
      h('span', 'sf-result__chip', icon(uiIcon('clock')), '时长', h('b', null, fmtClock(state.endTime ?? state.time))),
      h('span', 'sf-result__chip', icon(uiIcon('tower')), '推塔', h('b', null, `${blue.towersDestroyed} : ${red.towersDestroyed}`)),
    ),
  );

  // ── 战绩表 ──
  const table = h(
    'div',
    'sf-rt',
    h(
      'div',
      'sf-rt__head',
      h('span', null, '英雄'),
      h('span', 'sf-rt__c', h('span', 'sf-rt__h-full', '击杀 / 阵亡 / 助攻'), h('span', 'sf-rt__h-short', '战绩')),
      headCell('补兵', 'cs'),
      h('span', 'sf-rt__c', '经济'),
      h('span', 'sf-rt__c', '对英雄伤害'),
      h('span', 'sf-rt__c', '承受伤害'),
      headCell('推塔伤害', 'tower'),
      h('span', 'sf-rt__items-h', '装备'),
      h('span', 'sf-rt__c', '评分'),
    ),
  );
  let rowIndex = 0;
  for (const team of [myTeam, myTeam === 0 ? 1 : 0] as PlayerTeam[]) {
    const ts = state.teams[team];
    const members = state.heroes.filter((x) => x.team === team);
    const teamRgb = team === 0 ? '77, 163, 255' : '255, 93, 93';
    const teamGold = ts.gold > 0 ? ts.gold : members.reduce((a, x) => a + x.goldEarned, 0);
    const header = h(
      'div',
      'sf-rt__team',
      h('b', null, team === 0 ? '蓝色方' : '红色方'),
      h('span', null, team === myTeam ? '我方' : '敌方'),
      h('span', null, icon(uiIcon('kill')), h('span', 'sf-num', String(ts.kills))),
      h('span', null, icon(uiIcon('tower')), h('span', 'sf-num', String(ts.towersDestroyed))),
      h('span', null, icon(uiIcon('gold')), h('span', 'sf-num', fmtK(teamGold))),
      createBadge(team === winner ? '胜利' : '失败', team === winner ? 'solid' : 'mute'),
    );
    header.style.setProperty('--team-rgb', teamRgb);
    table.appendChild(header);

    for (const x of members) {
      const sc = scores.get(x.id)?.score ?? 0;
      const isMvp = x.id === mvpId;
      const isSvp = x.id === svpId;
      const badges = h('span', 'sf-rt__badges', x.isPlayer ? createBadge('你', 'me') : null, isMvp ? createBadge('MVP', 'solid', uiIcon('crown')) : null, isSvp ? createBadge('败方最佳', 'mute') : null);
      const hero = h(
        'span',
        'sf-rt__hero',
        h('span', 'sf-rt__pic-wrap', createPortrait(host, x.heroId, 'sf-rt__pic'), h('span', 'sf-rt__lv', String(x.level))),
        heroNameNode(x.heroId, 'sf-rt__name'),
        badges,
      );
      const kda = statCell('kda', '战绩', '');
      (kda.querySelector('.sf-rt__val') as HTMLElement).innerHTML = `<span class="sf-rt__kda">${x.kills}<i>/</i><span class="is-d">${x.deaths}</span><i>/</i><span class="is-a">${x.assists}</span></span>`;
      const bar = (v: number, cls: string): HTMLElement => {
        const b = h('span', `sf-rt__bar ${cls}`, h('i'));
        b.style.setProperty('--v', String(Math.max(0.02, Math.min(1, v))));
        return b;
      };
      const items = h('span', 'sf-rt__items');
      for (let i = 0; i < 6; i++) {
        const id = x.items[i] ?? null;
        const slot = createSlot(id ? itemIcon(id) : null, id ? { label: ITEMS[id].name } : {});
        if (id) {
          const item = ITEMS[id];
          slot.tabIndex = 0;
          tipDisposers.push(attachTooltip(slot, () => itemTooltipHtml(item)));
        }
        items.appendChild(slot);
      }
      const scoreCell = statCell('score', '评分', displayScore(sc));
      scoreCell.classList.add('sf-rt__score');
      const row = h(
        'div',
        `sf-rt__row${x.isPlayer ? ' is-me' : ''}${isMvp ? ' is-mvp' : ''}`,
        hero,
        kda,
        statCell('cs', '补兵', String(x.cs)),
        statCell('gold', '经济', fmtK(x.goldEarned), null, 'sf-rt__gold'),
        statCell('dmg', '伤害', fmtK(x.dmgDealt), bar(x.dmgDealt / maxDealt, 'sf-rt__bar--dealt')),
        statCell('taken', '承伤', fmtK(x.dmgTaken), bar(x.dmgTaken / maxTaken, 'sf-rt__bar--taken')),
        statCell('tower', '推塔', fmtK(x.dmgTower)),
        items,
        scoreCell,
      );
      row.style.setProperty('--team-rgb', teamRgb);
      row.style.animationDelay = `${0.7 + rowIndex * 0.04}s`;
      rowIndex++;
      table.appendChild(row);
    }
  }
  const board = h('section', 'sf-result__board sf-panel', h('div', 'sf-result__scroll sf-scroll', table));

  // ── 按钮 ──
  const screen = h('div', `sf-screen sf-result sf-result--${win ? 'win' : 'lose'}`, banner, board);
  const shell = h('div', 'sf-root sf-result-root', screen);
  const backdrop = createBackdrop(shell, win ? 'victory' : 'defeat');
  const unbindSounds = bindUiSounds(shell, host.audio);

  return new Promise((resolve) => {
    let done = false;
    let closeTimer = 0;
    /** 摘掉监听、提示浮层与节点。正常关闭(退场动画播完后)与中途取消共用 */
    const release = (): void => {
      opts.signal?.removeEventListener('abort', onAbort);
      window.clearTimeout(closeTimer);
      window.removeEventListener('keydown', onKey);
      for (const d of tipDisposers.splice(0)) d();
      unbindSounds();
      backdrop.dispose();
      shell.remove();
    };
    const onAbort = (): void => {
      done = true;
      dismissTooltip();
      release();
    };
    opts.signal?.addEventListener('abort', onAbort);
    const finish = (r: 'again' | 'menu'): void => {
      if (done) return;
      done = true;
      window.removeEventListener('keydown', onKey);
      dismissTooltip();
      for (const d of tipDisposers.splice(0)) d();
      shell.classList.add('is-closing');
      closeTimer = window.setTimeout(() => {
        release();
        resolve(r);
      }, 350);
    };
    const onKey = (ev: KeyboardEvent): void => {
      if (hasOpenDialog() || ev.repeat) return;
      if (ev.key === 'Enter' && isButtonKeyFocused(shell)) return;
      if (ev.key === 'Enter') {
        ev.preventDefault();
        host.audio.ui('confirm');
        finish('again');
      } else if (ev.key === 'Escape') {
        ev.preventDefault();
        host.audio.ui('back');
        finish('menu');
      }
    };
    screen.appendChild(
      h(
        'footer',
        'sf-result__actions',
        createButton({ label: '返回主菜单', icon: uiIcon('home'), sound: 'back', onClick: () => finish('menu') }),
        createButton({ label: '再来一局', icon: uiIcon('again'), variant: 'primary', pulse: true, sound: 'confirm', onClick: () => finish('again') }),
      ),
    );
    window.addEventListener('keydown', onKey);
    root.appendChild(shell);
    host.audio.setMusic(win ? 'victory' : 'defeat');
  });
}
