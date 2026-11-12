/**
 * 加载页：蓝方 5 人 vs 红方 5 人的对阵卡 + 进度条 + 轮播小贴士。
 * 对阵卡写全称：卡片窄，拆成两行——职业(图标 + 文字，职业色)在上，名字在下；称号只在够高的横屏里显示。
 */
import { HEROES, heroFullName } from '../../core/data/heroes';
import type { HeroId, PlayerTeam } from '../../core/types';
import type { LoadingScreen, MatchChoice, MenuHost } from '../api';
import { LANE_NAMES, laneIcon, roleIcon, uiIcon } from '../icons';
import { createBadge, createProgress, ensureTheme, h, icon, injectStyle, sfCss } from '../theme';
import { createBackdrop } from './backdrop';
import { DIFFICULTY_META, HERO_ORDER, ROLE_COLOR, createPortrait } from './shared';

const TIPS: string[] = [
  '摧毁敌方水晶才算胜利——别只顾着击杀，记得带兵线推塔。',
  '防御塔会优先攻击小兵：等己方兵线进塔，再去攻击塔下的敌人。',
  '每条路要按 一塔 → 二塔 → 高地塔 的顺序拆，前面的没破，后面的塔和水晶打不动。',
  '补到最后一击可获得全额金币，只是站在附近只能拿到三成多。',
  '草丛可以隐藏身形，但在草里出手会暴露 1.5 秒。',
  '金币够了会自动购买推荐装备；想自己挑，随时打开商店。',
  '打掉蓝buff：技能冷却更短、回蓝更快；打掉红buff：普攻附带灼烧和减速。',
  '河道巨龙给全队金币和经验；远古巨灵让全队变强、小兵也更猛。',
  '残血别硬撑：回城引导 5 秒返回泉水，移动、攻击或受伤都会打断。',
  '被防御塔连续命中，伤害会越打越高——及时退出攻击范围。',
  '轻点技能键是智能施法；按住拖动可以手动瞄准，拖到取消区松手则取消。',
  '连杀会抬高你的赏金，被终结时对手将获得额外金币。',
  // 五位英雄各一条：告诉玩家对面(或队友)最要紧的一个特点
  '樊哙的大盾最扛打：让他先冲，其他人跟上。',
  '程咬金放完技能后的下一下普攻会回血，换血别光放技能。',
  '王昭君的技能打中同一个人三次会眩晕，被她连中两下就该躲了。',
  '李广站着不动连续射击会越射越快，优先打断他。',
  '荆轲专挑残血下手：血量低于四成时离他远一点。',
];

const CSS = sfCss(`
.sf-loading { display: grid; grid-template-rows: auto minmax(0, 1fr) auto; gap: 10u; padding: max(18u, var(--sf-safe-t)) max(36u, var(--sf-safe-r)) max(22u, var(--sf-safe-b)) max(36u, var(--sf-safe-l)); background: rgba(3, 6, 16, 0.5); }
.sf-loading__head { display: flex; flex-direction: column; align-items: center; gap: 3u; animation: sf-drop-in 0.6s var(--sf-ease-out) both; }
.sf-loading__head .sf-title { font-size: max(20px, 32u); letter-spacing: 0.4em; margin-right: -0.4em; }
.sf-loading__mode { display: flex; align-items: center; gap: 10u; font-size: var(--sf-fs-sm); letter-spacing: 0.24em; color: var(--sf-c-text-2); }
.sf-loading__mode i { width: 4px; height: 4px; transform: rotate(45deg); background: var(--sf-c-gold-300); }

.sf-loading__versus { display: grid; grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr); align-items: center; gap: 14u; min-height: 0; }
.sf-loading__team { display: flex; flex-direction: column; gap: 10u; min-width: 0; --team: var(--sf-c-blue); }
.sf-loading__team--red { --team: var(--sf-c-red); }
.sf-loading__team-name { display: flex; align-items: center; gap: 10u; margin: 0; font-weight: 800; font-size: var(--sf-fs-lg); letter-spacing: 0.24em; color: var(--team); text-shadow: 0 0 12u color-mix(in srgb, var(--team) 60%, transparent); }
.sf-loading__team-name small { font-weight: 500; font-size: var(--sf-fs-xs); letter-spacing: 0.12em; color: var(--sf-c-text-2); text-shadow: none; }
.sf-loading__team-name::after { content: ''; flex: 1; height: 1px; background: linear-gradient(90deg, var(--team), transparent); opacity: 0.7; }
.sf-loading__team--red .sf-loading__team-name { flex-direction: row-reverse; }
.sf-loading__team--red .sf-loading__team-name::after { background: linear-gradient(270deg, var(--team), transparent); }
.sf-loading__cards { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: max(5px, 10u); }

.sf-lcard {
  --hero: #8fe9ff;
  position: relative; aspect-ratio: 10 / 27; min-width: 0; border-radius: 7u; overflow: hidden; isolation: isolate;
  background: #0a1128; box-shadow: 0 0 0 1px rgba(8, 13, 31, 0.9), 0 0 0 max(1.5px, 2u) color-mix(in srgb, var(--team) 55%, #1c2f60), var(--sf-shadow-1);
  animation: sf-left-in 0.6s var(--sf-ease-out) both;
}
.sf-loading__team--red .sf-lcard { animation-name: sf-right-in; }
.sf-lcard__pic { position: absolute; inset: 0 0 24% 0; }
.sf-lcard__pic.sf-portrait > img { object-position: 50% 20%; }
.sf-lcard::before { content: ''; position: absolute; inset: 0; z-index: 1; background: linear-gradient(180deg, color-mix(in srgb, var(--team) 34%, transparent) 0, transparent 22%, transparent 46%, rgba(8, 13, 31, 0.94) 72%, #080d1f 100%); pointer-events: none; }
.sf-lcard::after { content: ''; position: absolute; left: 0; right: 0; top: 0; height: max(2px, 3u); z-index: 2; background: var(--team); box-shadow: 0 0 10u var(--team); }
.sf-lcard__tag { position: absolute; left: 50%; top: 7u; z-index: 3; transform: translateX(-50%); }
.sf-lcard__info { position: absolute; left: 0; right: 0; bottom: 0; z-index: 3; display: flex; flex-direction: column; align-items: center; gap: 2u; padding: 0 3u 9u; text-align: center; }
.sf-lcard__role { display: inline-flex; align-items: center; gap: 3u; height: max(18px, 22u); margin-bottom: 2u; padding: 0 7u 0 3u; border-radius: 99px; font-size: var(--sf-fs-xs); font-weight: 800; line-height: 1; letter-spacing: 0.08em; white-space: nowrap; color: #08101f; background: var(--role); box-shadow: 0 0 0 max(1.5px, 2u) #0a1128, 0 0 10u color-mix(in srgb, var(--role) 60%, transparent); }
.sf-lcard__role .sf-i { width: max(13px, 15u); height: max(13px, 15u); vertical-align: 0; }
.sf-lcard__name { font-weight: 800; font-size: max(13px, 19u); line-height: 1.2; letter-spacing: 0.12em; margin-right: -0.12em; color: var(--sf-c-text); white-space: nowrap; }
.sf-lcard__title { font-size: var(--sf-fs-xs); line-height: 1.3; color: var(--sf-c-text-3); white-space: nowrap; }
.sf-lcard__lane { display: inline-flex; align-items: center; gap: 3u; font-size: var(--sf-fs-xs); line-height: 1.3; color: var(--sf-c-text-2); white-space: nowrap; }
.sf-lcard__lane .sf-i { width: 1.15em; height: 1.15em; }
.sf-lcard.is-me { transform: translateY(-8u); box-shadow: 0 0 0 1px rgba(8, 13, 31, 0.9), 0 0 0 max(2px, 2.5u) var(--sf-c-gold-200), 0 0 26u rgba(255, 214, 130, 0.5), var(--sf-shadow-2); animation-name: sf-lcard-me; }
.sf-lcard.is-me::after { background: var(--sf-c-gold-200); box-shadow: 0 0 12u var(--sf-c-gold-200); }
.sf-lcard.is-me .sf-lcard__name { color: var(--sf-c-gold-100); }
@keyframes sf-lcard-me { from { opacity: 0; transform: translate(-28u, 0); } to { opacity: 1; transform: translateY(-8u); } }

.sf-loading__vs { position: relative; display: grid; place-items: center; width: max(64px, 108u); align-self: stretch; animation: sf-vs-in 0.7s 0.35s var(--sf-ease-spring) both; }
.sf-loading__vs::before, .sf-loading__vs::after { content: ''; position: absolute; left: 50%; width: 1px; height: 30%; background: linear-gradient(180deg, transparent, var(--sf-c-gold-300)); }
.sf-loading__vs::before { top: 6%; }
.sf-loading__vs::after { bottom: 6%; transform: scaleY(-1); }
.sf-loading__vs b { position: relative; font-family: var(--sf-font-num); font-weight: 900; font-style: italic; font-size: max(34px, 64u); line-height: 1; letter-spacing: 0.02em; padding: 0 0.12em; }
.sf-loading__vs span { position: absolute; width: max(70px, 128u); height: max(70px, 128u); border-radius: 50%; background: radial-gradient(circle, rgba(255, 214, 130, 0.38), rgba(255, 214, 130, 0) 68%); animation: sf-vs-pulse 2.4s ease-in-out infinite; }
@keyframes sf-vs-in { from { opacity: 0; transform: scale(2.2); } to { opacity: 1; transform: none; } }
@keyframes sf-vs-pulse { 0%, 100% { transform: scale(0.9); opacity: 0.7; } 50% { transform: scale(1.15); opacity: 1; } }

.sf-loading__foot { display: flex; flex-direction: column; align-items: center; gap: 10u; animation: sf-rise-in 0.6s 0.3s var(--sf-ease-out) both; }
.sf-loading__tip { display: block; min-height: 3em; margin: 0; max-width: 760u; font-size: var(--sf-fs-md); line-height: 1.5; color: var(--sf-c-text); text-align: center; text-shadow: 0 1px 4px rgba(0, 0, 0, 0.9); }
.sf-loading__tip .sf-i { margin-right: 0.4em; color: var(--sf-c-gold-300); }
.sf-loading__tip span { transition: opacity 0.35s linear; }
.sf-loading__tip.is-out span { opacity: 0; }
.sf-loading__bar { width: min(100%, 900u); display: grid; grid-template-columns: 1fr auto; gap: 6u 12u; align-items: baseline; }
.sf-loading__bar .sf-progress { grid-column: 1 / -1; }
/* 进度条不走缓动：加载的每一步都是同步的重活，两步之间主线程只让出一帧，缓动根本来不及播——百分比到了 100%，条还停在开头 */
.sf-loading__bar .sf-progress__fill, .sf-loading__bar .sf-progress__spark { transition: none; }
.sf-loading__label { font-size: var(--sf-fs-sm); letter-spacing: 0.1em; color: var(--sf-c-text-2); }
.sf-loading__pct { font-size: var(--sf-fs-lg); color: var(--sf-c-gold-200); }
.sf-loading-root.is-closing { animation: sf-fade-out 0.4s linear both; pointer-events: none; }

@media (max-height: 520px) and (orientation: landscape) {
  .sf-loading { gap: 6u; padding-top: max(8u, var(--sf-safe-t)); padding-bottom: max(10u, var(--sf-safe-b)); }
  .sf-loading__head { flex-direction: row; justify-content: center; gap: 18u; }
  .sf-loading__team { gap: 6u; }
  .sf-lcard { aspect-ratio: 10 / 19.5; }
  .sf-lcard__title { display: none; }
  .sf-lcard__info { padding-bottom: 6u; }
  .sf-loading__foot { gap: 5u; }
  .sf-loading__tip { min-height: 1.5em; font-size: var(--sf-fs-sm); }
}
@media (max-height: 520px) and (orientation: landscape) and (max-width: 780px) {
  .sf-loading { padding-left: max(16u, var(--sf-safe-l)); padding-right: max(16u, var(--sf-safe-r)); }
  .sf-loading__mode { letter-spacing: 0.08em; }
  .sf-loading__vs { width: 56px; }
  .sf-lcard { aspect-ratio: 10 / 18; }
  .sf-lcard__lane { display: none; }
  .sf-lcard__tag { top: 3px; }
  .sf-lcard__tag .sf-badge { height: 15px; padding: 0 4px; font-size: 10px; }
  .sf-lcard__role { height: 16px; padding: 0 5px 0 2px; font-size: 10px; letter-spacing: 0.02em; }
  .sf-lcard__role .sf-i { width: 12px; height: 12px; }
  .sf-lcard__name { font-size: 12px; letter-spacing: 0.04em; margin-right: 0; }
}
@media (orientation: portrait) {
  .sf-loading { padding-left: max(12u, var(--sf-safe-l)); padding-right: max(12u, var(--sf-safe-r)); }
  .sf-loading__versus { grid-template-columns: minmax(0, 1fr); grid-template-rows: auto auto auto; align-content: center; gap: 6u; }
  .sf-loading__vs { width: auto; height: max(52px, 76u); }
  .sf-loading__vs::before, .sf-loading__vs::after { left: auto; top: 50%; bottom: auto; width: 34%; height: 1px; }
  .sf-loading__vs::before { left: 4%; background: linear-gradient(90deg, transparent, var(--sf-c-gold-300)); }
  .sf-loading__vs::after { right: 4%; transform: none; background: linear-gradient(270deg, transparent, var(--sf-c-gold-300)); }
  .sf-lcard { aspect-ratio: 10 / 24; }
  .sf-lcard__title { display: none; }
  .sf-loading__team--red .sf-loading__team-name { flex-direction: row; }
  .sf-loading__team--red .sf-loading__team-name::after { background: linear-gradient(90deg, var(--team), transparent); }
  /* 顶部那行字窄屏放不下：收紧字距，整段整段地换行 */
  .sf-loading__mode { flex-wrap: wrap; justify-content: center; gap: 2u 8u; letter-spacing: 0.08em; white-space: nowrap; }
}
`);

function card(host: MenuHost, heroId: HeroId, team: PlayerTeam, me: boolean, index: number): HTMLElement {
  const def = HEROES[heroId];
  const role = h('span', 'sf-lcard__role', icon(roleIcon(def.role)), def.roleName);
  const el = h(
    'div',
    `sf-lcard${me ? ' is-me' : ''}`,
    createPortrait(host, heroId, 'sf-lcard__pic'),
    h('span', 'sf-lcard__tag', me ? createBadge('你', 'me') : createBadge('AI', 'mute')),
    h(
      'span',
      'sf-lcard__info',
      role,
      h('span', 'sf-lcard__name', def.name),
      h('span', 'sf-lcard__title', def.title),
      h('span', 'sf-lcard__lane', icon(laneIcon(def.lane)), LANE_NAMES[def.lane]),
    ),
  );
  el.setAttribute('aria-label', `${heroFullName(def)}，${def.title}`);
  el.style.setProperty('--hero', def.palette.glow);
  el.style.setProperty('--role', ROLE_COLOR[def.role]);
  // 蓝方自外向内、红方自内向外依次入场
  el.style.animationDelay = `${0.1 + (team === 0 ? index : 4 - index) * 0.07}s`;
  return el;
}

/** 显示加载页。返回的对象用于更新进度与关闭 */
export function showLoading(root: HTMLElement, choice: MatchChoice, host: MenuHost): LoadingScreen {
  ensureTheme();
  injectStyle('sf-menu-loading', CSS);

  const team = (t: PlayerTeam): HTMLElement =>
    h(
      'section',
      `sf-loading__team sf-loading__team--${t === 0 ? 'blue' : 'red'}`,
      h('h3', 'sf-loading__team-name', t === 0 ? '蓝色方' : '红色方', h('small', null, t === 0 ? '我方' : `敌方 · AI ${DIFFICULTY_META[choice.difficulty].label}`)),
      h('div', 'sf-loading__cards', ...HERO_ORDER.map((id, i) => card(host, id, t, t === 0 && id === choice.heroId, i))),
    );

  const tipText = h('span');
  const tip = h('p', 'sf-loading__tip', icon(uiIcon('info')), tipText);
  const label = h('span', 'sf-loading__label', '正在准备战场…');
  const pct = h('span', 'sf-loading__pct sf-num', '0%');
  const progress = createProgress();

  const screen = h(
    'div',
    'sf-screen sf-loading',
    h(
      'header',
      'sf-loading__head',
      h('h2', 'sf-title sf-metal', '星陨高原'),
      h('p', 'sf-loading__mode', '5v5 对战', h('i'), `你的英雄：${heroFullName(choice.heroId)}`, h('i'), `对手难度：${DIFFICULTY_META[choice.difficulty].label}`),
    ),
    h('div', 'sf-loading__versus', team(0), h('div', 'sf-loading__vs', h('span'), h('b', 'sf-metal', 'VS')), team(1)),
    h('footer', 'sf-loading__foot', tip, h('div', 'sf-loading__bar', label, pct, progress.el)),
  );
  const shell = h('div', 'sf-root sf-loading-root', screen);
  const backdrop = createBackdrop(shell, 'menu');
  root.appendChild(shell);

  // 小贴士轮播：从与英雄相关的随机位置开始，避免每次都看到同一条
  let tipIndex = (HERO_ORDER.indexOf(choice.heroId) * 5 + Math.floor(Math.random() * TIPS.length)) % TIPS.length;
  tipText.textContent = TIPS[tipIndex];
  let swapTimer = 0;
  const tipTimer = window.setInterval(() => {
    tip.classList.add('is-out');
    swapTimer = window.setTimeout(() => {
      tipIndex = (tipIndex + 1) % TIPS.length;
      tipText.textContent = TIPS[tipIndex];
      tip.classList.remove('is-out');
    }, 360);
  }, 4200);

  let closed = false;
  let shown = 0;
  return {
    setProgress(p, text) {
      if (closed) return;
      // 进度只增不减，避免各阶段回报的进度互相打架时进度条回退
      shown = Math.max(shown, Math.max(0, Math.min(1, p)));
      progress.set(shown);
      pct.textContent = `${Math.round(shown * 100)}%`;
      if (text) label.textContent = text;
    },
    close() {
      if (closed) return;
      closed = true;
      window.clearInterval(tipTimer);
      window.clearTimeout(swapTimer);
      shell.classList.add('is-closing');
      window.setTimeout(() => {
        backdrop.dispose();
        shell.remove();
      }, 400);
    },
  };
}
