/**
 * 屏幕上方中央的大播报横幅：首杀、连杀、终结、团灭、推塔、史诗野怪、兵线……
 * 排队播放、互不重叠；强度(1~4)越高横幅越大、光效越多，队列挤的时候低强度的先让位。
 *
 * 一次击杀在同一批事件里会先来 heroKill、再来(可能的) announce：两者合并成一条横幅，
 * 所以这里先把一批事件收齐，afterEvents 时再统一生成。
 */
import { MONSTERS } from '../../core/data/units';
import type { GameEvent, HeroUnit, MonsterType, Vec2 } from '../../core/types';
import { uiIcon } from '../icons';
import { h, icon, injectStyle, sfCss, type Child } from '../theme';
import type { HudCtx, HudPart } from './common';
import { glyphFace, heroFace, teamCls } from './face';
import { ANNOUNCE_TIER, KILL_TITLES, epicSlainText, riverSide, towerName } from './text';

type KillEvent = Extract<GameEvent, { type: 'heroKill' }>;
type AnnounceEvent = Extract<GameEvent, { type: 'announce' }>;
type TowerEvent = Extract<GameEvent, { type: 'towerDestroyed' }>;
type Tone = 'ally' | 'foe' | 'neutral';
type Tier = 1 | 2 | 3 | 4;

const CSS = sfCss(`
.sf-hud__banner-wrap { position: absolute; left: 0; right: 0; top: calc(var(--hud-t) + max(54px, 64u)); z-index: 4; display: flex; justify-content: center; pointer-events: none; }
.sf-hud__banner {
  --tone: 92, 214, 247; --fs: max(14px, 17u); --face: 0px;
  position: relative; isolation: isolate; display: flex; align-items: center; justify-content: center; gap: 12u; min-width: min(300u, 80vw); max-width: 96vw; padding: 5u 64u 6u;
  animation: sf-hud-bn-in 0.4s var(--sf-ease-out) both;
}
.sf-hud__banner.is-ally { --tone: 77, 163, 255; }
.sf-hud__banner.is-foe { --tone: 255, 93, 93; }
.sf-hud__banner.is-out { animation: sf-hud-bn-out 0.22s var(--sf-ease-in) both; }
/* 底带：中间实、两端渐隐；上沿一道亮的星轨线，下沿一道淡的。
   底色留两成通透：镜头拉近后，英雄以北十来米的敌人正好在横幅后面，不能被盖死 */
.sf-hud__banner::before {
  content: ''; position: absolute; inset: 0; z-index: -1;
  background:
    linear-gradient(90deg, rgba(255, 231, 173, 0), rgba(255, 231, 173, 0.95) 28%, #fff4d6 50%, rgba(255, 231, 173, 0.95) 72%, rgba(255, 231, 173, 0)) left top / 100% 1.5px no-repeat,
    linear-gradient(90deg, rgba(255, 231, 173, 0), rgba(255, 231, 173, 0.6) 30%, rgba(255, 231, 173, 0.6) 70%, rgba(255, 231, 173, 0)) left bottom / 100% 1px no-repeat,
    linear-gradient(90deg, rgba(var(--tone), 0), rgba(var(--tone), 0.36) 20%, rgba(8, 13, 31, 0.8) 40%, rgba(8, 13, 31, 0.8) 60%, rgba(var(--tone), 0.36) 80%, rgba(var(--tone), 0));
}
/* 上沿正中的菱形星 */
.sf-hud__banner::after {
  content: ''; position: absolute; left: 50%; top: 0; width: 9u; height: 9u; margin: -4.5u 0 0 -4.5u; transform: rotate(45deg);
  background: linear-gradient(135deg, #fff4d6, #e0b160); box-shadow: 0 0 10u rgba(255, 214, 130, 0.9);
}
.sf-hud__banner-text { display: flex; flex-direction: column; align-items: center; min-width: 0; }
.sf-hud__banner-title {
  margin: 0; font-weight: 900; font-size: var(--fs); line-height: 1.22; letter-spacing: 0.22em; margin-right: -0.22em; white-space: nowrap;
  animation: sf-hud-bn-slam 0.5s var(--sf-ease-out) both;
}
/* 中立播报(开战/兵线/野怪现身)：青白色的星辉金属字 */
.sf-hud__banner.is-neutral .sf-hud__banner-title {
  background-image: linear-gradient(180deg, #ffffff 0%, #d9f8ff 30%, #7fdcf5 54%, #2b8fb8 62%, #a5ebff 82%, #f0fdff 100%);
  filter: drop-shadow(0 1u 0 rgba(6, 30, 48, 0.9)) drop-shadow(0 3u 8u rgba(0, 0, 0, 0.55));
}
.sf-hud__banner.is-foe .sf-hud__banner-title {
  background-image: linear-gradient(180deg, #fff3ee 0%, #ffc2b3 28%, #f25b50 54%, #9c1f2b 62%, #ff8d7a 82%, #ffe6dd 100%);
  filter: drop-shadow(0 1u 0 rgba(60, 6, 12, 0.9)) drop-shadow(0 3u 8u rgba(0, 0, 0, 0.55));
}
.sf-hud__banner-sub { display: flex; flex-wrap: wrap; align-items: center; justify-content: center; gap: 0 5u; margin-top: 1u; font-size: var(--sf-fs-sm); font-weight: 600; line-height: 1.35; color: var(--sf-c-text); text-align: center; text-shadow: var(--hud-shadow-text); }
/* 每一段自己不折行，放不下时整段换到下一行 */
.sf-hud__banner-sub > * { white-space: nowrap; }
.sf-hud__banner-sub .is-dim { color: var(--sf-c-text-2); font-weight: 600; }
.sf-hud__banner-sub .is-blue { color: #9ccfff; font-weight: 800; }
.sf-hud__banner-sub .is-red { color: #ff9c9c; font-weight: 800; }
.sf-hud__banner-sub .is-me { color: var(--sf-c-me); font-weight: 800; }
.sf-hud__banner-sub .is-gold { display: inline-flex; align-items: center; gap: 2u; color: var(--sf-c-gold-200); font-weight: 800; }
.sf-hud__banner-sub .sf-i { width: 1.1em; height: 1.1em; vertical-align: 0; }
.sf-hud__banner-face { position: absolute; top: 50%; display: grid; place-items: center; width: var(--face); height: var(--face); margin-top: calc(var(--face) / -2); }
.sf-hud__banner-face.is-l { left: 6u; animation: sf-hud-bn-face-l 0.45s var(--sf-ease-spring) both; }
.sf-hud__banner-face.is-r { right: 6u; animation: sf-hud-bn-face-r 0.45s var(--sf-ease-spring) 0.08s both; }
.sf-hud__banner-face .sf-hud__face { --sz: var(--face); box-shadow: 0 0 0 max(2px, 2.5u) var(--ring), 0 0 0 max(3px, 4u) rgba(8, 13, 31, 0.9), 0 0 14u rgba(var(--tone), 0.8); }
/* 被杀者头像上划一道 */
.sf-hud__banner-face.is-r.is-slain::after { content: ''; position: absolute; left: -8%; right: -8%; top: 50%; height: max(2px, 3u); margin-top: -1.5u; border-radius: 2u; transform: rotate(-38deg); background: linear-gradient(90deg, rgba(255, 255, 255, 0), #fff 30%, #ff8d8d 70%, rgba(255, 93, 93, 0)); box-shadow: 0 0 8u rgba(255, 93, 93, 0.9); }

/* ── 强度分级 ── */
.sf-hud__banner.is-t2 { --fs: min(max(17px, 23u), 6vw); --face: max(34px, 42u); padding: 6u 70u 7u; }
.sf-hud__banner.is-t3 { --fs: min(max(22px, 32u), 7.4vw); --face: max(42px, 54u); padding: 7u 84u 8u; min-width: min(380u, 90vw); }
.sf-hud__banner.is-t4 { --fs: min(max(27px, 42u), 7.6vw); --face: max(48px, 64u); padding: 8u 96u 10u; min-width: min(460u, 94vw); }
.sf-hud__banner.is-t4 .sf-hud__banner-title { letter-spacing: 0.3em; margin-right: -0.3em; }
.sf-hud__banner.is-noface { padding-left: 44u; padding-right: 44u; }
/* 3 级起：标题后面一轮放射光；4 级再加闪烁星点与标题扫光 */
.sf-hud__banner-rays {
  --r: max(110px, 190u); position: absolute; left: 50%; top: 50%; z-index: -2; width: calc(var(--r) * 2); height: calc(var(--r) * 2); margin: calc(var(--r) * -1) 0 0 calc(var(--r) * -1); border-radius: 50%; display: none;
  background: repeating-conic-gradient(from 0deg, rgba(255, 226, 160, 0.34) 0deg 4deg, rgba(255, 226, 160, 0) 4deg 12deg);
  -webkit-mask-image: radial-gradient(ellipse 100% 46% at center, #000 0, rgba(0, 0, 0, 0.55) 30%, transparent 70%); mask-image: radial-gradient(ellipse 100% 46% at center, #000 0, rgba(0, 0, 0, 0.55) 30%, transparent 70%);
  animation: sf-spin 40s linear infinite;
}
.sf-hud__banner.is-foe .sf-hud__banner-rays { background: repeating-conic-gradient(from 0deg, rgba(255, 130, 120, 0.3) 0deg 4deg, rgba(255, 130, 120, 0) 4deg 12deg); }
.sf-hud__banner.is-t3 .sf-hud__banner-rays, .sf-hud__banner.is-t4 .sf-hud__banner-rays { display: block; }
.sf-hud__banner.is-t4 .sf-hud__banner-rays { --r: max(150px, 260u); }
.sf-hud__banner-spark { position: absolute; z-index: -1; width: 16u; height: 16u; display: none; background: radial-gradient(circle, #fff 0, rgba(255, 244, 214, 0.9) 18%, rgba(255, 214, 130, 0) 62%); clip-path: polygon(50% 0, 58% 42%, 100% 50%, 58% 58%, 50% 100%, 42% 58%, 0 50%, 42% 42%); animation: sf-hud-bn-spark 1.1s ease-in-out infinite; }
.sf-hud__banner.is-t4 .sf-hud__banner-spark { display: block; }
.sf-hud__banner-spark:nth-child(2) { left: 20%; top: -12u; }
.sf-hud__banner-spark:nth-child(3) { right: 18%; top: -6u; animation-delay: 0.35s; width: 22u; height: 22u; }
.sf-hud__banner-spark:nth-child(4) { left: 30%; bottom: -10u; animation-delay: 0.6s; width: 12u; height: 12u; }
.sf-hud__banner-spark:nth-child(5) { right: 28%; bottom: -12u; animation-delay: 0.15s; }
.sf-hud__banner.is-t4::before { animation: sf-hud-bn-flash 0.6s ease-out both; }

@keyframes sf-hud-bn-in { from { opacity: 0; transform: scaleX(0.35); } to { opacity: 1; transform: none; } }
@keyframes sf-hud-bn-out { to { opacity: 0; transform: translateY(-10u) scale(0.97); } }
@keyframes sf-hud-bn-slam { 0% { opacity: 0; transform: scale(2.3); filter: brightness(3); } 60% { opacity: 1; transform: scale(0.96); } 100% { transform: none; } }
@keyframes sf-hud-bn-face-l { from { opacity: 0; transform: translateX(-40u) scale(0.6); } to { opacity: 1; transform: none; } }
@keyframes sf-hud-bn-face-r { from { opacity: 0; transform: translateX(40u) scale(0.6); } to { opacity: 1; transform: none; } }
@keyframes sf-hud-bn-spark { 0%, 100% { opacity: 0.2; transform: scale(0.5) rotate(0deg); } 50% { opacity: 1; transform: scale(1.15) rotate(45deg); } }
@keyframes sf-hud-bn-flash { 0% { filter: brightness(3.5); } 100% { filter: none; } }

@media (orientation: portrait) {
  .sf-hud__banner-wrap { top: calc(var(--hud-t) + var(--hud-mini) + max(58px, 68u)); }
  .sf-hud__banner.is-t2 { padding-left: 58u; padding-right: 58u; }
  .sf-hud__banner.is-t3 { padding-left: 70u; padding-right: 70u; }
  .sf-hud__banner.is-t4 { padding-left: 78u; padding-right: 78u; --fs: min(max(24px, 34u), 6.6vw); }
  .sf-hud__banner.is-t4 .sf-hud__banner-title { letter-spacing: 0.14em; margin-right: -0.14em; }
}
/* 横屏手机(屏高不足 480px)：横幅正下方紧挨着玩家英雄头顶的血条(英雄脚在屏高约 46% 处)。各档压矮一号并上提，别盖到自己头上 */
@media (orientation: landscape) and (max-height: 480px) {
  .sf-hud__banner-wrap { top: calc(var(--hud-t) + 46px); }
  .sf-hud__banner.is-t2 { --fs: 15px; --face: 30px; padding-top: 3px; padding-bottom: 4px; }
  .sf-hud__banner.is-t3 { --fs: 18px; --face: 34px; padding-top: 3px; padding-bottom: 4px; }
  .sf-hud__banner.is-t4 { --fs: 21px; --face: 38px; padding-top: 4px; padding-bottom: 5px; }
}
`);

interface Item {
  tier: Tier;
  tone: Tone;
  title: string;
  sub: Child[] | null;
  left: HTMLElement | null;
  right: HTMLElement | null;
  slain: boolean;
  /** 这一条至少亮多久(秒)：带一句话说明的要给够阅读时间。缺省按强度取 DURATION */
  hold?: number;
}

// 横幅盖着屏幕上沿的战场(英雄以北约 11~14 米)：停留时间从紧
const DURATION: Record<Tier, number> = { 1: 1.6, 2: 2.0, 3: 2.4, 4: 3.0 };
/** 后面有人排队时，当前横幅至少也要亮这么久 */
const MIN_SHOW: Record<Tier, number> = { 1: 1.0, 2: 1.25, 3: 1.6, 4: 2.1 };
const MAX_QUEUE = 4;
/** 带一句话说明的横幅(开局、出兵、史诗野怪刷新)多亮一会儿，读得完 */
const HOLD_INFO = 2.4;
const HOLD_EPIC = 3.4;

export interface Banner extends HudPart {
  el: HTMLElement;
  /** 直接按播报键弹一条（画廊/调试用） */
  demo(ev: AnnounceEvent, c: HudCtx): void;
  /** 正在显示横幅，或还有排队没播的：顶部中央的指引位(引导卡 / 当前目标)据此让位 */
  isShowing(): boolean;
}

export function createBanner(): Banner {
  injectStyle('sf-hud-banner', CSS);
  const wrap = h('div', 'sf-hud__banner-wrap');
  wrap.setAttribute('aria-live', 'polite');
  const queue: Item[] = [];
  let cur: { el: HTMLElement; tier: Tier; shownAt: number; hideAt: number; removeAt: number } | null = null;

  // 本批事件的暂存
  const batch: (KillEvent | AnnounceEvent)[] = [];
  let lastEpic: MonsterType | null = null;
  let lastEpicPos: Vec2 | null = null;
  let lastTower: TowerEvent | null = null;
  /**
   * 播报事件入批时那一刻的「最近一只史诗野怪 / 最近一座塔」：同一批里可能先后有两只史诗野怪、两座塔的事件
   * (比如巨龙被打死的同一 tick 巨灵刷新)，到 flush 时再读 lastEpic 会张冠李戴，所以入批时就记下来。
   */
  interface AnnounceCtx { epic: MonsterType | null; epicPos: Vec2 | null; tower: TowerEvent | null }
  const ctxOf = new Map<AnnounceEvent, AnnounceCtx>();
  const pushBatch = (ev: KillEvent | AnnounceEvent): void => {
    if (ev.type === 'announce') ctxOf.set(ev, { epic: lastEpic, epicPos: lastEpicPos, tower: lastTower });
    batch.push(ev);
  };
  /** 已经播过「刷新」横幅的史诗野怪：第一次多说一句它在小地图的哪儿 */
  const epicSeen = new Set<MonsterType>();

  function enqueue(item: Item): void {
    queue.push(item);
    while (queue.length > MAX_QUEUE) {
      // 挤掉强度最低、排得最久的那条（击杀流里仍然看得到，不算丢信息）
      let drop = 0;
      for (let i = 1; i < queue.length; i++) if (queue[i].tier < queue[drop].tier) drop = i;
      queue.splice(drop, 1);
    }
  }

  function show(item: Item, now: number): void {
    const titleCls = 'sf-hud__banner-title sf-metal';
    const el = h(
      'div',
      `sf-hud__banner is-t${item.tier} is-${item.tone}${item.left || item.right ? '' : ' is-noface'}`,
      h('i', 'sf-hud__banner-rays'),
      h('i', 'sf-hud__banner-spark'),
      h('i', 'sf-hud__banner-spark'),
      h('i', 'sf-hud__banner-spark'),
      h('i', 'sf-hud__banner-spark'),
      item.left ? h('span', 'sf-hud__banner-face is-l', item.left) : null,
      h('div', 'sf-hud__banner-text', h('div', titleCls, item.title), item.sub ? h('div', 'sf-hud__banner-sub', ...item.sub) : null),
      item.right ? h('span', `sf-hud__banner-face is-r${item.slain ? ' is-slain' : ''}`, item.right) : null,
    );
    wrap.appendChild(el);
    cur = { el, tier: item.tier, shownAt: now, hideAt: now + Math.max(DURATION[item.tier], item.hold ?? 0), removeAt: 0 };
  }

  const who = (hero: HeroUnit, c: HudCtx): HTMLElement =>
    hero.isPlayer ? h('span', 'is-me', '你') : h('span', teamCls(hero.team, c.team), `${hero.team === c.team ? '我方' : '敌方'}${hero.name}`);

  function killItem(k: KillEvent, a: AnnounceEvent | null, c: HudCtx): Item | null {
    const victim = c.hero(k.victimId);
    if (!victim) return null;
    const killer = c.hero(k.killerId);
    const mePart = victim.isPlayer || !!killer?.isPlayer || k.assistIds.indexOf(c.state.playerId) >= 0;
    // 没有称号的普通击杀：只有玩家击杀/助攻才上横幅，其余交给右侧击杀流；
    // 玩家自己阵亡有专门的阵亡面板(带击杀者)，不再重复播一条
    if (!a && (!mePart || victim.isPlayer)) return null;
    const right = heroFace(c.host, victim, c.team, 'is-dead');
    if (!killer) {
      // 被塔/小兵/野怪打死的敌人：只有玩家有助攻才值得一条横幅（上面已筛过）
      const src = c.unit(k.killerId);
      const kind = src?.kind;
      const by = kind === 'tower' || kind === 'core' ? '防御塔' : kind === 'monster' ? '野怪' : kind === 'minion' ? '小兵' : '战场';
      const glyph = kind === 'tower' || kind === 'core' ? uiIcon('tower') : kind === 'monster' ? uiIcon('monster') : uiIcon('cs');
      const foeTeam = victim.team === 0 ? 1 : 0;
      return { tier: 2, tone: victim.team === c.team ? 'foe' : 'ally', title: '助攻', sub: [who(victim, c), `被${by}击杀`], left: glyphFace(glyph, teamCls(foeTeam, c.team)), right, slain: true };
    }
    const tone: Tone = killer.team === c.team ? 'ally' : 'foe';
    const key = a?.key ?? null;
    let title = key ? KILL_TITLES[key] ?? '击杀' : killer.isPlayer ? '击杀' : '助攻';
    let tier: Tier = key ? ANNOUNCE_TIER[key] : 2;
    let sub: Child[];
    if (key === 'shutdown') sub = [who(killer, c), '终结了', who(victim, c), '的连杀'];
    else if (key === 'killing_spree' || key === 'unstoppable' || key === 'legendary') sub = [who(killer, c), `已连续击杀 ${k.streak} 人`];
    else sub = [who(killer, c), '击杀了', who(victim, c)];
    if (key === 'legendary' && k.streak > 7) title = `${title}·${k.streak}连杀`;
    // 玩家自己的高光再提一级
    if (killer.isPlayer && tier < 4 && key) tier = (tier + 1) as Tier;
    if (killer.isPlayer && k.bounty > 0) sub.push(h('span', 'is-gold', icon(uiIcon('gold')), `+${Math.round(k.bounty)}`));
    return { tier, tone, title, sub, left: heroFace(c.host, killer, c.team), right, slain: true };
  }

  function announceItem(a: AnnounceEvent, c: HudCtx): Item | null {
    const mine = a.team === c.team;
    const tone: Tone = a.team === 2 ? 'neutral' : mine ? 'ally' : 'foe';
    const tier = ANNOUNCE_TIER[a.key];
    const actor = a.unitId !== undefined ? c.hero(a.unitId) : undefined;
    const base = { tier, tone, left: null, right: null, slain: false } as const;
    const snap = ctxOf.get(a);
    const epic = snap ? snap.epic : lastEpic;
    const epicPos = snap ? snap.epicPos : lastEpicPos;
    const tower = snap ? snap.tower : lastTower;
    switch (a.key) {
      case 'match_start':
        return { ...base, title: '对战开始', sub: ['摧毁敌方水晶就赢'], hold: HOLD_INFO };
      case 'minions_spawn':
        return { ...base, title: '小兵出发', sub: ['跟着小兵去打架更安全'], hold: HOLD_INFO };
      case 'super_minions':
        return { ...base, title: mine ? '我方超级兵出击' : '敌方超级兵出击', sub: [mine ? '敌方高地塔已破，这一路的兵更强了' : '我方高地塔被破，注意回防'], hold: HOLD_INFO };
      case 'epic_spawn': {
        const name = epic ? MONSTERS[epic].name : '史诗野怪';
        // 一句话说明击杀奖励(数值取自 MONSTER_RULES)；每种第一次刷新时再说一句它在小地图的哪儿
        const sub: Child[] = [(epic && MONSTERS[epic].reward) || '打掉它，全队都有奖励'];
        if (epic && epicPos && !epicSeen.has(epic)) sub.push(h('span', 'is-dim', `(小地图${riverSide(epicPos)})`));
        if (epic) epicSeen.add(epic);
        return { ...base, title: `${name}已刷新`, sub, left: glyphFace(uiIcon('monster')), hold: HOLD_EPIC };
      }
      case 'epic_slain': {
        const name = epic ? MONSTERS[epic].name : '史诗野怪';
        const reward = epic ? epicSlainText(epic, mine) : mine ? '全队获得奖励' : '敌方获得奖励';
        const sub: Child[] = mine && actor ? [who(actor, c), '拿下', '·', reward] : [reward];
        return { ...base, title: mine ? `我方击败${name}` : `敌方夺得${name}`, sub, left: actor ? heroFace(c.host, actor, c.team) : null, right: glyphFace(uiIcon('monster'), 'is-dead'), slain: true, hold: HOLD_EPIC };
      }
      case 'tower_destroyed': {
        const where = tower ? towerName(tower.lane, tower.tier) : '防御塔';
        const sub: Child[] = mine ? (actor ? [who(actor, c), `拆除了敌方${where}`] : [`我方兵线拆除了敌方${where}`]) : [`我方${where}失守`];
        return { ...base, title: mine ? '摧毁敌方防御塔' : '我方防御塔被摧毁', sub, left: actor ? heroFace(c.host, actor, c.team) : null, right: glyphFace(uiIcon('tower'), `${teamCls(mine ? (c.team === 0 ? 1 : 0) : c.team, c.team)} is-dead`), slain: true };
      }
      case 'ace':
        return { ...base, title: '团灭', sub: [mine ? '敌方全员阵亡，趁现在推塔！' : '我方全员阵亡，守住水晶！'] };
      case 'victory':
      case 'defeat':
        // team 是获胜方：以玩家视角决定措辞
        return { ...base, title: mine ? '敌方水晶已摧毁' : '我方水晶被摧毁', sub: [mine ? '我方获胜' : '敌方获胜'] };
      default: {
        // 击杀称号类却没有配对的 heroKill（理论上不会发生）：按称号单独播
        const title = KILL_TITLES[a.key];
        if (!title) return null;
        const victim = a.victimId !== undefined ? c.hero(a.victimId) : undefined;
        return { ...base, title, sub: actor && victim ? [who(actor, c), '击杀了', who(victim, c)] : null, left: actor ? heroFace(c.host, actor, c.team) : null, right: victim ? heroFace(c.host, victim, c.team, 'is-dead') : null, slain: !!victim };
      }
    }
  }

  function flush(c: HudCtx): void {
    if (batch.length === 0) return;
    const used = new Set<AnnounceEvent>();
    for (let i = 0; i < batch.length; i++) {
      const ev = batch[i];
      if (ev.type === 'heroKill') {
        let match: AnnounceEvent | null = null;
        for (let j = i + 1; j < batch.length; j++) {
          const o = batch[j];
          if (o.type === 'announce' && !used.has(o) && o.key in KILL_TITLES && o.unitId === ev.killerId && o.victimId === ev.victimId) {
            match = o;
            break;
          }
        }
        if (match) used.add(match);
        const item = killItem(ev, match, c);
        if (item) enqueue(item);
      } else if (!used.has(ev)) {
        const item = announceItem(ev, c);
        if (item) enqueue(item);
      }
    }
    batch.length = 0;
    ctxOf.clear();
  }

  return {
    el: wrap,
    handleEvent(ev) {
      if (ev.type === 'heroKill' || ev.type === 'announce') pushBatch(ev);
      else if (ev.type === 'monsterSpawn') {
        if (MONSTERS[ev.monsterType].epic) {
          lastEpic = ev.monsterType;
          lastEpicPos = ev.pos;
        }
      } else if (ev.type === 'epicSlain') lastEpic = ev.monsterType;
      else if (ev.type === 'towerDestroyed') lastTower = ev;
    },
    afterEvents(c) {
      flush(c);
    },
    demo(ev, c) {
      pushBatch(ev);
      flush(c);
    },
    isShowing: () => cur !== null || queue.length > 0,
    update(c) {
      const now = c.now;
      if (cur) {
        if (cur.removeAt === 0) {
          const due = now >= cur.hideAt || (queue.length > 0 && now >= cur.shownAt + MIN_SHOW[cur.tier]);
          if (due) {
            cur.el.classList.add('is-out');
            cur.removeAt = now + 0.24;
          }
        } else if (now >= cur.removeAt) {
          cur.el.remove();
          cur = null;
        }
      }
      if (!cur && queue.length > 0) show(queue.shift() as Item, now);
    },
    dispose() {
      queue.length = 0;
      batch.length = 0;
      ctxOf.clear();
    },
  };
}
