/**
 * 盖在战场上的轻量提示层：阵亡面板(去色 + 复活倒计时 + 击杀者)、命令被拒的轻提示、回城引导条、
 * 残血红边、帧率、开局操作提示条、点地落点波纹。全部不拦截操作（除了提示条的关闭按钮）。
 */
import { MONSTERS } from '../../core/data/units';
import type { GameEvent, HeroUnit } from '../../core/types';
import { uiIcon } from '../icons';
import { h, icon, injectStyle, sfCss } from '../theme';
import { classSlot, clamp01, numSlot, textSlot, varSlot, type HudCtx, type HudPart, type InputMode, type ToastTone } from './common';
import { glyphFace, heroFace, teamCls } from './face';
import { REJECT_TEXT } from './text';

const STYLE = sfCss(`
/* ── 阵亡：去色层 + 面板 ── */
/* 宿主没给去色目标时的兜底：用 backdrop-filter 把身后的战场去色（只在阵亡期间存在） */
.sf-hud__gray { position: absolute; inset: 0; z-index: 0; pointer-events: none; opacity: 0; transition: opacity 0.6s linear; background: rgba(8, 12, 24, 0.28);
  -webkit-backdrop-filter: grayscale(0.92) brightness(0.82); backdrop-filter: grayscale(0.92) brightness(0.82); display: none; }
.sf-hud.is-dead .sf-hud__gray { display: block; opacity: 1; }
.sf-hud__gray.is-tint { -webkit-backdrop-filter: none; backdrop-filter: none; background: radial-gradient(ellipse at center, rgba(8, 12, 24, 0.12), rgba(8, 12, 24, 0.5)); }
/* 给宿主的渲染容器用的去色类（createHud 的 dimTarget） */
.sf-hud-dim { transition: filter 0.6s linear; }
.sf-hud-dim.is-on { filter: grayscale(0.92) brightness(0.8); }

/* 位置让开上方的播报横幅区 */
.sf-hud__death { position: absolute; left: 0; right: 0; top: max(19%, calc(var(--hud-t) + 152u)); z-index: 4; isolation: isolate; display: none; flex-direction: column; align-items: center; gap: 6u; pointer-events: none; }
/* 高屏：标题 → 倒计时环 → 「秒后复活」→ 击杀者，纵向一列；矮屏改成环在左、文字在右的一行 */
.sf-hud__death-main { display: contents; }
.sf-hud__death-title { order: 1; }
.sf-hud__death-count { order: 2; }
.sf-hud__death-label { order: 3; }
.sf-hud__death-killer { order: 4; }
.sf-hud__death-tip { order: 5; }
.sf-hud.is-dead .sf-hud__death { display: flex; animation: sf-hud-death-in 0.6s var(--sf-ease-out) both; }
/* 面板背后垫一团柔和的暗影：去色后的战场是中灰色，文字需要更深的底才立得住 */
.sf-hud__death::before { content: ''; position: absolute; left: 50%; top: 50%; z-index: -1; width: max(360px, 560u); height: 150%; transform: translate(-50%, -50%); background: radial-gradient(ellipse closest-side, rgba(4, 7, 18, 0.72), rgba(4, 7, 18, 0.4) 55%, rgba(4, 7, 18, 0)); pointer-events: none; }
.sf-hud__death-title { margin: 0; font-size: max(24px, 38u); font-weight: 900; letter-spacing: 0.4em; margin-right: -0.4em; line-height: 1.2;
  background-image: linear-gradient(180deg, #ffffff 0%, #d5def2 34%, #8e9bbb 54%, #5a6788 61%, #d47f8b 82%, #ffc9cd 100%); filter: drop-shadow(0 1u 0 #0a1020) drop-shadow(0 0 2px rgba(4, 7, 18, 0.9)) drop-shadow(0 3u 12u rgba(0, 0, 0, 0.8)); }
.sf-hud__death-count { --p: 1; position: relative; display: grid; place-items: center; width: max(64px, 84u); height: max(64px, 84u); margin-top: 2u; border-radius: 50%;
  background: radial-gradient(circle, rgba(8, 13, 31, 0.92) 58%, rgba(8, 13, 31, 0) 60%), conic-gradient(#ffe7ad calc(var(--p) * 360deg), rgba(150, 178, 235, 0.22) 0); box-shadow: 0 0 0 1px rgba(8, 13, 31, 0.9), 0 6u 18u rgba(0, 0, 0, 0.5); }
.sf-hud__death-count::before { content: ''; position: absolute; inset: 9%; border-radius: 50%; background: radial-gradient(circle at 50% 35%, #16254f, #070c1e); box-shadow: inset 0 0 0 1px rgba(232, 199, 122, 0.4); }
.sf-hud__death-count > b { position: relative; font-size: max(26px, 36u); font-weight: 800; line-height: 1; color: #fff; text-shadow: 0 2px 4px rgba(0, 0, 0, 0.8); }
.sf-hud__death-label { font-size: var(--sf-fs-sm); font-weight: 700; letter-spacing: 0.2em; color: var(--sf-c-text-2); text-shadow: var(--hud-shadow-text); }
.sf-hud__death-killer { display: flex; align-items: center; gap: 8u; margin-top: 4u; padding: 5u 14u 5u 8u; border-radius: 99px; background: rgba(8, 13, 31, 0.82); box-shadow: inset 0 0 0 1px rgba(255, 93, 93, 0.45); font-size: var(--sf-fs-sm); font-weight: 700; color: var(--sf-c-text); white-space: nowrap; }
.sf-hud__death-killer:empty { display: none; }
.sf-hud__death-killer .sf-hud__face { --sz: 30u; }
.sf-hud__death-killer .is-dim { color: var(--sf-c-text-3); font-weight: 600; }
.sf-hud__death-killer .is-red { color: #ff9c9c; }
.sf-hud__death-assists { display: flex; align-items: center; margin-left: 4u; }
.sf-hud__death-assists .sf-hud__face { --sz: 20u; margin-left: -4u; }
.sf-hud__death-tip { font-size: var(--sf-fs-xs); color: var(--sf-c-text-2); text-shadow: var(--hud-shadow-text); }
@keyframes sf-hud-death-in { from { opacity: 0; transform: translateY(-16u) scale(1.06); } to { opacity: 1; transform: none; } }

/* ── 残血红边 ── */
.sf-hud__lowhp { position: absolute; inset: 0; z-index: 0; pointer-events: none; opacity: 0; transition: opacity 0.3s linear;
  background: radial-gradient(ellipse 64% 62% at center, rgba(210, 24, 34, 0) 56%, rgba(210, 24, 34, 0.26) 80%, rgba(210, 24, 34, 0.5) 100%); }
.sf-hud__lowhp.is-on { opacity: 1; animation: sf-hud-lowhp 1.1s ease-in-out infinite; }
@keyframes sf-hud-lowhp { 0%, 100% { opacity: 0.55; } 50% { opacity: 1; } }

/* ── 轻提示 ── */
.sf-hud__toasts { position: absolute; left: 0; right: 0; bottom: calc(var(--hud-b) + var(--hud-lift) + max(118px, 150u)); z-index: 5; display: flex; flex-direction: column-reverse; align-items: center; gap: 5u; pointer-events: none; }
.sf-hud__toast { display: inline-flex; align-items: center; gap: 6u; height: max(26px, 30u); padding: 0 14u 0 10u; border-radius: 99px; font-size: var(--sf-fs-sm); font-weight: 700; letter-spacing: 0.06em; line-height: 1; white-space: nowrap;
  color: #ffd9d9; background: linear-gradient(180deg, rgba(74, 18, 28, 0.94), rgba(30, 8, 16, 0.94)); box-shadow: inset 0 0 0 1px rgba(255, 120, 120, 0.6), 0 4u 12u rgba(0, 0, 0, 0.45); animation: sf-hud-toast-in 0.2s var(--sf-ease-spring) both; }
.sf-hud__toast.is-info { color: var(--sf-c-cyan-200); background: linear-gradient(180deg, rgba(16, 44, 70, 0.94), rgba(7, 16, 30, 0.94)); box-shadow: inset 0 0 0 1px rgba(92, 214, 247, 0.55), 0 4u 12u rgba(0, 0, 0, 0.45); }
.sf-hud__toast.is-good { color: var(--sf-c-gold-100); background: linear-gradient(180deg, rgba(64, 48, 14, 0.94), rgba(22, 16, 6, 0.94)); box-shadow: inset 0 0 0 1px rgba(243, 207, 133, 0.7), 0 4u 12u rgba(0, 0, 0, 0.45); }
.sf-hud__toast .sf-i { width: 1.15em; height: 1.15em; vertical-align: 0; }
.sf-hud__toast.is-out { animation: sf-hud-toast-out 0.25s linear both; }
.sf-hud__toast.is-again { animation: sf-hud-toast-again 0.25s var(--sf-ease-out); }
@keyframes sf-hud-toast-in { from { opacity: 0; transform: translateY(8u) scale(0.9); } to { opacity: 1; transform: none; } }
@keyframes sf-hud-toast-out { to { opacity: 0; transform: translateY(-6u); } }
@keyframes sf-hud-toast-again { 0% { transform: scale(1.12); filter: brightness(1.5); } 100% { transform: none; filter: none; } }

/* ── 回城引导条 ── */
.sf-hud__channel { --p: 0; position: absolute; left: 50%; bottom: calc(var(--hud-b) + var(--hud-lift) + max(92px, 112u)); z-index: 4; width: max(200px, 250u); transform: translateX(-50%); display: none; flex-direction: column; align-items: center; gap: 4u; pointer-events: none; }
.sf-hud__channel.is-on { display: flex; animation: sf-hud-toast-in 0.2s var(--sf-ease-out) both; }
.sf-hud__channel-label { display: flex; align-items: baseline; gap: 8u; font-size: var(--sf-fs-sm); font-weight: 800; letter-spacing: 0.12em; color: var(--sf-c-cyan-200); text-shadow: var(--hud-shadow-text); }
.sf-hud__channel-label small { font-size: var(--sf-fs-xs); font-weight: 600; letter-spacing: 0.02em; color: var(--sf-c-text-2); }
.sf-hud__channel-bar { position: relative; width: 100%; height: max(7px, 9u); border-radius: 99px; overflow: hidden; background: rgba(3, 6, 16, 0.82); box-shadow: inset 0 0 0 1px rgba(143, 233, 255, 0.5), 0 0 12u rgba(92, 214, 247, 0.35); }
.sf-hud__channel-bar > i { position: absolute; inset: 0; transform-origin: left center; transform: scaleX(var(--p)); background: linear-gradient(90deg, #1c84b0, #5cd6f7 70%, #fff); }

/* ── 帧率 ── */
.sf-hud__fps { position: absolute; left: calc(var(--hud-l) + var(--hud-mini) + 10u); top: var(--hud-t); z-index: 3; display: none; font-family: var(--sf-font-num); font-size: max(11px, 12u); font-weight: 700; line-height: 1.4; color: var(--sf-c-green); text-shadow: var(--hud-shadow-text); pointer-events: none; }
.sf-hud__fps.is-on { display: block; }
.sf-hud__fps.is-mid { color: var(--sf-c-amber); }
.sf-hud__fps.is-low { color: var(--sf-c-red); }

/* ── 开局操作提示条 ── */
.sf-hud__tips { position: absolute; left: 50%; bottom: calc(var(--hud-b) + var(--hud-lift) + max(96px, 116u)); z-index: 5; transform: translateX(-50%); display: none; align-items: center; gap: 4u; max-width: min(94vw, 880u); padding: 6u 4u 6u 14u; border-radius: 10u; pointer-events: auto;
  background: var(--hud-plate); box-shadow: inset 0 0 0 1px rgba(232, 199, 122, 0.45), 0 6u 18u rgba(2, 4, 12, 0.55); }
.sf-hud__tips.is-on { display: flex; animation: sf-hud-tips-in 0.4s var(--sf-ease-out) both; }
.sf-hud__tips.is-out { animation: sf-hud-tips-out 0.35s var(--sf-ease-in) both; }
.sf-hud__tips-list { display: flex; flex-wrap: wrap; align-items: center; justify-content: center; gap: 5u 14u; font-size: var(--sf-fs-xs); color: var(--sf-c-text-2); line-height: 1.2; }
.sf-hud__tips-list > span { display: inline-flex; align-items: center; gap: 4u; white-space: nowrap; }
.sf-hud__tips-list .sf-kbd { min-width: max(19px, 20u); height: max(19px, 20u); padding: 0 4u; font-size: max(10px, 10.5u); }
.sf-hud__tips-list .sf-i { color: var(--sf-c-gold-300); }
.sf-hud__tips-list b { color: var(--sf-c-gold-200); font-weight: 700; }
.sf-hud__tips .sf-iconbtn { width: max(30px, 32u); height: max(30px, 32u); flex: none; }
@keyframes sf-hud-tips-in { from { opacity: 0; transform: translateX(-50%) translateY(14u); } to { opacity: 1; transform: translateX(-50%); } }
@keyframes sf-hud-tips-out { to { opacity: 0; transform: translateX(-50%) translateY(10u); } }

/* ── 点地落点波纹 ── */
.sf-hud__ripple { position: absolute; z-index: 2; width: 0; height: 0; pointer-events: none; }
.sf-hud__ripple::before, .sf-hud__ripple::after { content: ''; position: absolute; left: -15u; top: -9u; width: 30u; height: 18u; border-radius: 50%; border: max(1.5px, 2u) solid var(--col, #b7f36b); animation: sf-hud-ripple 0.5s ease-out both; }
.sf-hud__ripple::after { animation-delay: 0.1s; }
.sf-hud__ripple.is-atk { --col: #ff7a7a; }
@keyframes sf-hud-ripple { from { opacity: 1; transform: scale(1.5); } to { opacity: 0; transform: scale(0.25); } }

/* 窄横屏：帧率挪到商店按钮下方，不和比分牌抢位置 */
@media (orientation: landscape) and (max-width: 700px) {
  .sf-hud__fps { left: var(--hud-l); top: calc(var(--hud-t) + var(--hud-mini) + max(60px, 66u)); }
}
@media (orientation: landscape) and (max-height: 520px) {
  .sf-hud__death { flex-direction: row; justify-content: center; gap: 14u; top: calc(var(--hud-t) + 150u); }
  .sf-hud__death-main { display: flex; flex-direction: column; align-items: flex-start; gap: 3u; }
  .sf-hud__death-title { font-size: max(20px, 28u); letter-spacing: 0.3em; }
  .sf-hud__death-count { order: 0; width: max(60px, 76u); height: max(60px, 76u); margin: 0; }
  .sf-hud__death-main { order: 1; }
  .sf-hud__death-killer { margin-top: 2u; }
  .sf-hud__death-tip { display: none; }
}
@media (orientation: portrait) {
  .sf-hud__death { top: calc(var(--hud-t) + var(--hud-mini) + 150u); }
  .sf-hud__fps { left: var(--hud-l); top: calc(var(--hud-t) + var(--hud-mini) + max(60px, 66u)); }
  .sf-hud__toasts { bottom: calc(var(--hud-ch) + var(--hud-lift) + 40u); }
  .sf-hud__channel { bottom: calc(var(--hud-ch) + var(--hud-lift) + 6u); }
  .sf-hud__tips { bottom: calc(var(--hud-ch) + var(--hud-lift) + 10u); padding-left: 10u; }
}
`);

// ───────────────────────── 阵亡面板 ─────────────────────────

export interface DeathOverlay extends HudPart {
  els: HTMLElement[];
}

export interface DeathOptions {
  /** 阵亡时去色的宿主元素（渲染容器）；不给则 HUD 自己用 backdrop-filter 去色 */
  dimTarget?: HTMLElement | null;
  onDeathChange?: (dead: boolean) => void;
}

export function createDeathOverlay(ctx: HudCtx, opts: DeathOptions): DeathOverlay {
  const gray = h('div', 'sf-hud__gray');
  const css = typeof window.CSS !== 'undefined' ? window.CSS : null;
  const backdropOk = !!css && (css.supports('backdrop-filter', 'grayscale(1)') || css.supports('-webkit-backdrop-filter', 'grayscale(1)'));
  // 宿主接管了去色，或浏览器不支持 backdrop-filter：这层只留一圈压暗
  if (opts.dimTarget || !backdropOk) gray.classList.add('is-tint');
  if (opts.dimTarget) opts.dimTarget.classList.add('sf-hud-dim');
  const lowhp = h('div', 'sf-hud__lowhp');

  const countN = h('b', 'sf-num', '0');
  const count = h('div', 'sf-hud__death-count', countN);
  const killer = h('div', 'sf-hud__death-killer');
  const panel = h('div', 'sf-hud__death', count, h('div', 'sf-hud__death-main', h('h2', 'sf-hud__death-title sf-metal', '你已阵亡'), h('div', 'sf-hud__death-label', '秒后复活'), killer, h('div', 'sf-hud__death-tip', '阵亡期间仍可打开商店购买装备')));

  const setCount = numSlot(countN);
  const setP = varSlot(count, '--p', 1 / 180);
  const setLow = classSlot(lowhp, 'is-on');
  let dead = false;
  let total = 1;

  function setDead(v: boolean, me: HeroUnit): void {
    dead = v;
    ctx.root.classList.toggle('is-dead', v);
    opts.dimTarget?.classList.toggle('is-on', v);
    if (v) total = Math.max(1, me.respawnIn);
    else killer.textContent = '';
    opts.onDeathChange?.(v);
  }

  return {
    els: [gray, lowhp, panel],
    update(c) {
      const me = c.me;
      if (!me.alive !== dead) setDead(!me.alive, me);
      if (dead) {
        if (me.respawnIn > total) total = me.respawnIn;
        setCount(Math.ceil(me.respawnIn));
        setP(clamp01(me.respawnIn / total));
      }
      setLow(me.alive && me.hp > 0 && me.hp / Math.max(1, me.stats.maxHp) < 0.25);
    },
    handleEvent(ev: GameEvent, c) {
      if (ev.type !== 'heroKill' || ev.victimId !== c.state.playerId) return;
      killer.textContent = '';
      const by = c.hero(ev.killerId);
      killer.appendChild(h('span', 'is-dim', '击杀者'));
      if (by) killer.append(heroFace(c.host, by, c.team), h('span', 'is-red', `敌方 ${by.name}`), h('span', 'is-dim sf-num', `Lv.${by.level}`));
      else {
        const src = c.unit(ev.killerId);
        const foe = c.team === 0 ? 1 : 0;
        const kind = src?.kind;
        const name = kind === 'tower' ? '敌方防御塔' : kind === 'core' ? '敌方星核' : src && src.kind === 'monster' ? MONSTERS[src.monsterType].name : kind === 'minion' ? '敌方小兵' : '战场';
        killer.append(glyphFace(kind === 'tower' || kind === 'core' ? uiIcon('tower') : kind === 'monster' ? uiIcon('monster') : uiIcon('cs'), teamCls(foe, c.team)), h('span', 'is-red', name));
      }
      const assists = ev.assistIds.map((id) => c.hero(id)).filter((x): x is HeroUnit => !!x);
      if (assists.length > 0) {
        const box = h('span', 'sf-hud__death-assists');
        for (const a of assists.slice(0, 4)) box.appendChild(heroFace(c.host, a, c.team));
        killer.append(h('span', 'is-dim', '助攻'), box);
      }
    },
    dispose() {
      ctx.root.classList.remove('is-dead');
      opts.dimTarget?.classList.remove('sf-hud-dim', 'is-on');
    },
  };
}

// ───────────────────────── 轻提示 ─────────────────────────

export interface Toasts extends HudPart {
  el: HTMLElement;
  show(text: string, tone?: ToastTone): void;
}

const TOAST_LIFE = 1.7;
const TOAST_ICON: Record<ToastTone, string> = { warn: uiIcon('cancel'), info: uiIcon('info'), good: uiIcon('check') };

export function createToasts(ctx: HudCtx): Toasts {
  const el = h('div', 'sf-hud__toasts');
  el.setAttribute('aria-live', 'assertive');
  const items: { el: HTMLElement; text: string; until: number; leaving: boolean }[] = [];

  function show(text: string, tone: ToastTone = 'warn'): void {
    // 同一句话连着来(狂按冷却中的技能)：不叠新条，只让旧的抖一下并续命
    for (const it of items) {
      if (it.text === text && !it.leaving) {
        it.until = ctx.now + TOAST_LIFE;
        it.el.classList.remove('is-again');
        void it.el.offsetWidth;
        it.el.classList.add('is-again');
        return;
      }
    }
    const t = h('div', `sf-hud__toast${tone === 'warn' ? '' : ` is-${tone}`}`, icon(TOAST_ICON[tone]), text);
    el.appendChild(t);
    items.push({ el: t, text, until: ctx.now + TOAST_LIFE, leaving: false });
    while (items.length > 3) items.shift()?.el.remove();
  }

  return {
    el,
    show,
    update(c) {
      for (let i = items.length - 1; i >= 0; i--) {
        const it = items[i];
        if (!it.leaving && c.now >= it.until) {
          it.leaving = true;
          it.el.classList.add('is-out');
        } else if (it.leaving && c.now >= it.until + 0.26) {
          it.el.remove();
          items.splice(i, 1);
        }
      }
    },
    handleEvent(ev: GameEvent, c) {
      if (ev.type === 'reject' && ev.unitId === c.state.playerId) show(REJECT_TEXT[ev.reason], 'warn');
    },
  };
}

// ───────────────────────── 回城引导条 ─────────────────────────

export function createChannelBar(): HudPart & { el: HTMLElement } {
  const secN = h('span', 'sf-num');
  const el = h('div', 'sf-hud__channel', h('div', 'sf-hud__channel-label', '回城中', secN, h('small', null, '移动、攻击或受击会打断')), h('div', 'sf-hud__channel-bar', h('i')));
  const setOn = classSlot(el, 'is-on');
  const setP = varSlot(el, '--p', 1 / 200);
  const setSec = textSlot(secN);
  return {
    el,
    update(c) {
      let left = -1;
      let dur = 1;
      for (const b of c.me.buffs) {
        if (b.id === 'recall') {
          left = b.timeLeft;
          dur = b.duration > 0 ? b.duration : 1;
        }
      }
      const on = left >= 0 && c.me.alive;
      setOn(on);
      if (on) {
        setP(clamp01(1 - left / dur));
        setSec(left.toFixed(1));
      }
    },
  };
}

// ───────────────────────── 帧率 ─────────────────────────

export function createFps(ctx: HudCtx): HudPart & { el: HTMLElement } {
  const el = h('div', 'sf-hud__fps');
  const setOn = classSlot(el, 'is-on');
  const setMid = classSlot(el, 'is-mid');
  const setLow = classSlot(el, 'is-low');
  const setText = textSlot(el);
  let last = -1;
  return {
    el,
    update(c) {
      const on = ctx.host.getSettings().showFps;
      setOn(on);
      if (!on || c.now - last < 0.5) return;
      last = c.now;
      const fps = Math.round(ctx.host.getFps());
      setText(`${fps} FPS`);
      setLow(fps < 28);
      setMid(fps >= 28 && fps < 50);
    },
  };
}

// ───────────────────────── 开局操作提示条 ─────────────────────────

const TIPS_SEEN_KEY = 'starfall.hud.tips.v1';

/** 玩家是否点掉过提示条（点掉 = 已经会玩了，以后的对局不再弹） */
function tipsDismissedBefore(): boolean {
  try {
    return localStorage.getItem(TIPS_SEEN_KEY) === '1';
  } catch {
    return false;
  }
}

export interface Tips extends HudPart {
  el: HTMLElement;
  dismiss(): void;
}

/** seconds：自动收起前显示多久；0 = 不显示 */
export function createTips(ctx: HudCtx, seconds: number): Tips {
  const list = h('div', 'sf-hud__tips-list');
  const close = h('button', 'sf-iconbtn sf-iconbtn--quiet', icon(uiIcon('close')));
  close.type = 'button';
  close.tabIndex = -1;
  close.setAttribute('aria-label', '关闭操作提示');
  close.dataset.sfSnd = 'back';
  const el = h('div', 'sf-hud__tips', list, close);
  let shownAt = -1;
  let gone = seconds <= 0 || tipsDismissedBefore();
  let removeAt = 0;

  const kbd = (...keys: string[]): HTMLElement[] => keys.map((k) => h('span', 'sf-kbd', k));
  function fill(mode: InputMode): void {
    list.textContent = '';
    if (mode === 'kbm') {
      list.append(
        h('span', null, ...kbd('W', 'A', 'S', 'D'), '移动'),
        h('span', null, ...kbd('右键'), '点地移动 / 攻击'),
        h('span', null, ...kbd('空格'), '普攻'),
        h('span', null, ...kbd('Q', 'E', 'R'), '技能：按住瞄准，松开施放'),
        h('span', null, ...kbd('F', 'G', 'B'), '闪现 / 恢复 / 回城'),
        h('span', null, ...kbd('P'), '商店'),
        h('span', null, ...kbd('Tab'), '战况'),
      );
    } else {
      list.append(
        h('span', null, icon(uiIcon('joystick')), h('b', null, '左下拖动'), '移动'),
        h('span', null, icon(uiIcon('touch')), h('b', null, '轻点技能'), '自动瞄准'),
        h('span', null, icon(uiIcon('target')), h('b', null, '按住拖动'), '手动瞄准，松手施放'),
        h('span', null, icon(uiIcon('cancel')), '拖到', h('b', null, '取消'), '松手放弃'),
      );
    }
  }
  fill(ctx.mode);

  function dismiss(): void {
    if (gone) return;
    gone = true;
    el.classList.add('is-out');
    removeAt = ctx.now + 0.36;
  }
  close.addEventListener('click', () => {
    dismiss();
    try {
      localStorage.setItem(TIPS_SEEN_KEY, '1');
    } catch {
      // 存不了就下局再提示一次，无妨
    }
  });

  return {
    el,
    dismiss,
    onMode(mode) {
      if (!gone) fill(mode);
    },
    update(c) {
      if (gone) {
        if (removeAt > 0 && c.now >= removeAt) {
          removeAt = 0;
          el.classList.remove('is-on');
        }
        return;
      }
      if (shownAt < 0) {
        shownAt = c.now;
        el.classList.add('is-on');
      } else if (c.now - shownAt > seconds) dismiss();
    },
  };
}

// ───────────────────────── 点地落点波纹 ─────────────────────────

/** 在屏幕坐标处放一圈收拢的波纹：右键点地/点敌人的即时反馈（世界里的落点标记归渲染层） */
export function spawnRipple(root: HTMLElement, clientX: number, clientY: number, attack: boolean): void {
  const rect = root.getBoundingClientRect();
  const el = h('i', `sf-hud__ripple${attack ? ' is-atk' : ''}`);
  el.style.left = `${clientX - rect.left}px`;
  el.style.top = `${clientY - rect.top}px`;
  root.appendChild(el);
  window.setTimeout(() => el.remove(), 700);
}

export function injectOverlayStyles(): void {
  injectStyle('sf-hud-overlays', STYLE);
}
