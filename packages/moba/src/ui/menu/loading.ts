/**
 * 加载页：蓝方 5 人 vs 红方 5 人的对阵卡 + 进度条 + 轮播小贴士。
 */
import { HEROES } from '../../core/data/heroes';
import type { HeroId, PlayerTeam } from '../../core/types';
import type { LoadingScreen, MatchChoice, MenuHost } from '../api';
import { LANE_NAMES, laneIcon, roleIcon, uiIcon } from '../icons';
import { createBadge, createProgress, ensureTheme, h, icon, injectStyle, sfCss } from '../theme';
import { createBackdrop } from './backdrop';
import { DIFFICULTY_META, HERO_ORDER, ROLE_COLOR, createPortrait } from './shared';

const TIPS: string[] = [
  '摧毁敌方水晶才算胜利——别只顾着击杀，记得带兵线推塔。',
  '防御塔会优先攻击小兵：等己方兵线进塔，再去攻击塔下的敌人。',
  '每条路的防御塔必须由外向内依次摧毁，外塔未破时内塔与水晶无敌。',
  '补到最后一击可获得全额金币，只是站在附近只能拿到三成多。',
  '草丛可以隐藏身形，但在草里出手会暴露 1.5 秒。',
  '装备随时随地都能购买，金币足够时点一下快捷购买气泡即可。',
  '击杀霜晶魔像获得冷却缩减与回蓝，击杀炽焰魔像让普攻附带灼烧与减速。',
  '深渊鳞兽为全队提供金币与经验；星陨巨灵赐予全队「星陨祝福」。',
  '残血别硬撑：回城引导 5 秒返回泉水，移动、攻击或受伤都会打断。',
  '被防御塔连续命中，伤害会越打越高——及时退出攻击范围。',
  '轻点技能键是智能施法；按住拖动可以手动瞄准，拖到取消区松手则取消。',
  '连杀会抬高你的赏金，被终结时对手将获得额外金币。',
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
.sf-lcard__role { display: grid; place-items: center; width: max(20px, 26u); height: max(20px, 26u); margin-bottom: 2u; border-radius: 50%; color: #08101f; background: var(--role); box-shadow: 0 0 0 max(1.5px, 2u) #0a1128, 0 0 10u color-mix(in srgb, var(--role) 60%, transparent); }
.sf-lcard__role .sf-i { width: 62%; height: 62%; }
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
}
`);

function card(host: MenuHost, heroId: HeroId, team: PlayerTeam, me: boolean, index: number): HTMLElement {
  const def = HEROES[heroId];
  const role = h('span', 'sf-lcard__role', icon(roleIcon(def.role)));
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
      h('p', 'sf-loading__mode', '5v5 对战', h('i'), `你的英雄：${HEROES[choice.heroId].name}`, h('i'), `对手难度：${DIFFICULTY_META[choice.difficulty].label}`),
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
