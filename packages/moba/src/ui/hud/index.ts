/**
 * 对局 HUD 入口：把各组件与输入模块组装到一个 .sf-root.sf-hud 容器里。
 *
 *   const hud = createHud(app, host, world.state, { dimTarget: renderContainer });
 *   每帧：hud.handleEvents(events, state); hud.update(state, dtReal);
 *   结束：hud.dispose();
 *
 * 层级（HUD 内部，自下而上）：阵亡去色层/残血红边 → 输入层(战场点击、摇杆热区) → 摇杆 →
 * 常驻部件(小地图、比分、状态栏、技能区、击杀流) → 横幅/提示 → 战况面板 → 商店 → 设置对话框 → 提示浮层。
 * HUD 根节点自身不拦截指针，只有控件与输入层接收事件。
 */
import { ITEMS } from '../../core/data/items';
import type { AnnounceKey, GameEvent, GameState, HeroUnit, ItemId, TeamId, Unit } from '../../core/types';
import type { Hud, HudHost } from '../api';
import { initialInputMode, createInput } from '../input/index';
import { openSettingsDialog } from '../settings';
import { bindUiSounds, dismissTooltip, ensureTheme, h, injectStyle, sfCss, type Dialog } from '../theme';
import { createBanner } from './banner';
import { injectHudBase } from './base';
import { createCoach, type CoachDebug } from './coach';
import type { HudActions, HudCtx, HudPart, InputMode } from './common';
import { createKillFeed } from './feed';
import { createMinimap } from './minimap';
import { createChannelBar, createDeathOverlay, createFps, createTips, createToasts, injectOverlayStyles } from './overlays';
import { BLOCK_TEXT, checkBuy, sellValue } from './rules';
import { createScoreboard } from './scoreboard';
import { createShop } from './shop';
import { createSkillBar } from './skills';
import { createStatusBar } from './status';
import { createTopBar } from './topbar';

export interface HudOptions {
  /** 输入布局：'auto'(缺省) 自动识别并随设备切换；'touch' / 'kbm' 强制（画廊与测试用） */
  input?: 'auto' | InputMode;
  /**
   * 玩家阵亡时要去色的元素（通常是渲染容器）：HUD 会给它加 `sf-hud-dim`，阵亡期间再加 `is-on`(CSS filter 去色)。
   * 不传则由 HUD 自己铺一层 backdrop-filter 去色，宿主什么都不用做。
   */
  dimTarget?: HTMLElement | null;
  /** 玩家阵亡 / 复活时回调（宿主想自己处理画面效果时用） */
  onDeathChange?: (dead: boolean) => void;
  /** 页面切到后台时自动打开暂停面板，缺省 true */
  autoPause?: boolean;
  /**
   * 建好后是否立刻接受输入，缺省 true。宿主在加载页还没关时传 false，开打那一刻再 setInputEnabled(true)：
   * 否则加载期间按下的键会变成对局命令(放技能、开商店、弹暂停面板)。
   */
  inputEnabled?: boolean;
  /**
   * 开局操作提示条显示多少秒后自动收起，缺省 8（一行七八个键位，3 秒读不完）；0 = 不显示。
   * 玩家点 × 关掉过一次后会记住(localStorage)，之后的对局不再显示。
   * 新手引导开着(Settings.tutorial 且不是托管演示)时由引导卡取代它，这个值不起作用。
   */
  tipsSeconds?: number;
}

/** createHud 的返回值：在契约 Hud 之上多几个直达入口（画廊、测试、宿主快捷方式用） */
export interface HudHandle extends Hud {
  readonly el: HTMLElement;
  setShopOpen(open: boolean): void;
  setScoreboardOpen(open: boolean): void;
  openSettings(): void;
  /** 直接弹一条播报横幅 */
  announce(key: AnnounceKey, team: TeamId, unitId?: number, victimId?: number): void;
  getInputMode(): InputMode;
  /**
   * 开 / 关玩家输入(见 HudOptions.inputEnabled)。关闭时按住中的摇杆、方向键、瞄准全部作废；
   * 只管玩家的操作，页面切后台时的自动暂停不受影响。
   */
  setInputEnabled(enabled: boolean): void;
  /** 打开后统计各部件 update / handleEvents 的耗时(定位偶发尖峰用)；关闭时零开销 */
  setProfiling(on: boolean): void;
  /** 各部件耗时统计(毫秒)：按 update 最大值从高到低排；未开启统计时为空数组 */
  getProfile(): HudPartProfile[];
  /** 顶部指引位(新手引导 + 当前目标)：restartGuide 从第 1 步重看引导；debug 给调试 / 端到端测试看当前状态与目标切换日志 */
  readonly coach: { restartGuide(): void; debug(): CoachDebug };
}

/** 单个部件的耗时统计(毫秒) */
export interface HudPartProfile {
  part: string;
  /** update：调用次数 / 平均 / 最大 / 超过 2ms 的次数 */
  calls: number;
  avg: number;
  max: number;
  slow: number;
  /** handleEvents(含 afterEvents)：批数 / 平均 / 最大 */
  evBatches: number;
  evAvg: number;
  evMax: number;
}

/** 统计里「慢」的门槛(毫秒)：一帧 16.7ms，单个部件占掉 2ms 就值得看一眼 */
const SLOW_MS = 2;

const CSS = sfCss(`
/* 对局结束：收起操作类部件，把画面留给终局演出与结算页 */
.sf-hud__skills, .sf-hud__joy, .sf-hud__shopbar, .sf-hud__status { transition: opacity 0.5s linear; }
.sf-hud.is-over .sf-hud__skills, .sf-hud.is-over .sf-hud__joy, .sf-hud.is-over .sf-hud__shopbar, .sf-hud.is-over .sf-hud__status { opacity: 0; pointer-events: none; }
.sf-hud.is-over .sf-hud__skills *, .sf-hud.is-over .sf-hud__shopbar *, .sf-hud.is-over .sf-hud__status * { pointer-events: none; }
/* 宿主关闭了输入(加载页还盖着 / 提示层开着)：控件与战场都不接指针，暂停对话框除外 */
.sf-hud.is-locked .sf-hud__field, .sf-hud.is-locked button, .sf-hud.is-locked [data-hud-hit] { pointer-events: none; }
.sf-hud.is-locked .sf-dialog-scrim, .sf-hud.is-locked .sf-dialog-scrim button { pointer-events: auto; }
`);

function findPlayer(state: GameState): HeroUnit {
  for (const hero of state.heroes) if (hero.id === state.playerId) return hero;
  return state.heroes[0];
}

export function createHud(root: HTMLElement, host: HudHost, state: GameState, opts: HudOptions = {}): HudHandle {
  ensureTheme();
  injectHudBase();
  injectOverlayStyles();
  injectStyle('sf-hud-index', CSS);

  const forced: InputMode | null = opts.input === 'touch' || opts.input === 'kbm' ? opts.input : null;
  const el = h('div', 'sf-root sf-hud');
  let settings: Dialog | null = null;
  let disposed = false;

  const ctx: HudCtx = {
    root: el,
    host,
    state,
    me: findPlayer(state),
    team: findPlayer(state).team,
    mode: initialInputMode(forced),
    paused: false,
    enabled: opts.inputEnabled !== false,
    now: performance.now() / 1000,
    toast: (text, tone) => toasts.show(text, tone),
    inputBlocked: () => !ctx.enabled || !ctx.me.alive || ctx.paused || ctx.state.over,
    hero(id) {
      for (const hero of ctx.state.heroes) if (hero.id === id) return hero;
      return undefined;
    },
    unit(id): Unit | undefined {
      if (id < 0) return undefined;
      for (const u of ctx.state.units) if (u.id === id) return u;
      return undefined;
    },
    actions: null as unknown as HudActions,
  };

  // ── 组件 ──
  const field = h('div', 'sf-hud__field');
  const minimap = createMinimap(ctx);
  const top = createTopBar(ctx);
  const feed = createKillFeed(ctx);
  const banner = createBanner();
  const status = createStatusBar(ctx);
  const skills = createSkillBar(ctx);
  const shop = createShop(ctx);
  const scoreboard = createScoreboard(ctx);
  const death = createDeathOverlay(ctx, { dimTarget: opts.dimTarget ?? null, onDeathChange: opts.onDeathChange });
  const toasts = createToasts(ctx);
  const channel = createChannelBar();
  const fps = createFps(ctx);
  // 顶部中央的指引位：新手引导卡 + 当前目标行(共用一个位置)，外加场景箭头
  const coach = createCoach(ctx, { banner, minimap });
  // 引导开着时由它教操作，不再弹开局键位提示条
  const tips = createTips(ctx, coach.replacesTips ? 0 : opts.tipsSeconds ?? 8);

  function setMode(mode: InputMode): void {
    if (mode === ctx.mode && el.classList.contains(`sf-hud--${mode}`)) return;
    ctx.mode = mode;
    el.classList.toggle('sf-hud--touch', mode === 'touch');
    el.classList.toggle('sf-hud--kbm', mode === 'kbm');
    for (const p of parts) p.onMode?.(mode);
  }

  const actions: HudActions = {
    setShop(open) {
      if (open === shop.isOpen()) return;
      if (open && ctx.state.over) return;
      dismissTooltip();
      if (open) {
        scoreboard.setOpen(false, false);
        // 商店不暂停对局：移动照常(可以边走边买)，只把正在瞄准的技能作废
        input.cancelAim();
      }
      shop.setOpen(open);
    },
    toggleShop: () => actions.setShop(!shop.isOpen()),
    isShopOpen: () => shop.isOpen(),
    setScoreboard(open, pinned) {
      if (open && pinned) shop.setOpen(false);
      scoreboard.setOpen(open, pinned);
    },
    toggleScoreboard: () => actions.setScoreboard(!scoreboard.isPinned(), true),
    isScoreboardPinned: () => scoreboard.isPinned(),
    openSettings() {
      // 胜负已分：不再弹暂停面板(模拟已经停了，面板只会盖住终局演出)
      if (settings || disposed || ctx.state.over) return;
      dismissTooltip();
      input.reset();
      ctx.paused = true;
      host.setPaused(true);
      settings = openSettingsDialog(el, {
        mode: 'match',
        // 「自动出装」那一行显示本局的实际状态(卖了推荐装会让本局关闭，但玩家的偏好没变)，与商店顶部的开关一致
        get: () => ({ ...host.getSettings(), autoBuy: ctx.me.autoBuy === true }),
        update: (patch) => {
          // 本局被「卖关」时偏好本来就是开：宿主未必会把一次没变化的设置转成命令，这里直接下
          if (patch.autoBuy !== undefined && !ctx.state.over) host.command({ type: 'autoBuy', enabled: patch.autoBuy });
          host.updateSettings(patch);
        },
        autoBuyNote: () => (host.getSettings().autoBuy && ctx.me.autoBuy !== true && !ctx.state.over ? '卖了推荐装，本局已关闭。点一下重新打开。' : null),
        audio: host.audio,
        // 暂停面板里「新手引导」行的「重看」：引导已经开着时从第 1 步重来
        onReplayTutorial: () => coach.restartGuide(),
        onQuit: () => host.quit(),
        onClose: () => {
          settings = null;
          ctx.paused = false;
          if (!disposed) host.setPaused(false);
        },
      });
    },
    buy(itemId: ItemId) {
      if (ctx.state.over) return false;
      const chk = checkBuy(ctx.me, itemId);
      if (!chk.ok) {
        host.audio.ui('error');
        ctx.toast(BLOCK_TEXT[chk.block as Exclude<typeof chk.block, 'ok'>], 'warn');
        return false;
      }
      host.command({ type: 'buy', itemId });
      host.audio.ui('buy');
      ctx.toast(`已购买 ${ITEMS[itemId].name}`, 'good');
      return true;
    },
    sell(index) {
      const id = ctx.me.items[index];
      if (!id || ctx.state.over) return;
      host.command({ type: 'sell', index });
      host.audio.ui('confirm');
      ctx.toast(`已出售 ${ITEMS[id].name}，返还 ${sellValue(id)} 金币`, 'info');
    },
  };
  ctx.actions = actions;

  const input = createInput(ctx, { field, skills, forced, setMode });

  // DOM 顺序即叠放顺序（各部件自带 z-index 分层，同层内后者在上）
  el.append(...death.els.slice(0, 2), field, input.joystick, minimap.el, ...shop.els.slice(0, 1), ...top.els, feed.el, fps.el, status.el, skills.el, banner.el, ...coach.els, channel.el, tips.el, toasts.el, death.els[2], scoreboard.el, shop.els[1]);

  const named: [string, HudPart][] = [
    ['minimap', minimap], ['topbar', top], ['feed', feed], ['banner', banner], ['coach', coach], ['status', status], ['skills', skills], ['shop', shop],
    ['scoreboard', scoreboard], ['death', death], ['toasts', toasts], ['channel', channel], ['fps', fps], ['tips', tips], ['input', input],
  ];
  const parts: HudPart[] = named.map((n) => n[1]);
  const updaters = parts.filter((p) => p.update);
  const listeners = parts.filter((p) => p.handleEvent);
  const batchers = parts.filter((p) => p.afterEvents);

  // ── 耗时统计(调试用，默认关闭) ──
  interface Prof {
    calls: number;
    total: number;
    max: number;
    slow: number;
    evBatches: number;
    evTotal: number;
    evMax: number;
    /** 当前这批事件里累计的耗时 */
    evCur: number;
  }
  let profiling = false;
  const prof = new Map<HudPart, Prof>();
  const profOf = (p: HudPart): Prof => {
    let r = prof.get(p);
    if (!r) prof.set(p, (r = { calls: 0, total: 0, max: 0, slow: 0, evBatches: 0, evTotal: 0, evMax: 0, evCur: 0 }));
    return r;
  };
  function profiledUpdate(dtReal: number): void {
    for (let i = 0; i < updaters.length; i++) {
      const p = updaters[i];
      const t0 = performance.now();
      (p.update as NonNullable<HudPart['update']>)(ctx, dtReal);
      const ms = performance.now() - t0;
      const r = profOf(p);
      r.calls++;
      r.total += ms;
      if (ms > r.max) r.max = ms;
      if (ms > SLOW_MS) r.slow++;
    }
  }
  function profiledEvents(events: GameEvent[]): void {
    for (let j = 0; j < listeners.length; j++) {
      const p = listeners[j];
      const t0 = performance.now();
      for (let i = 0; i < events.length; i++) (p.handleEvent as NonNullable<HudPart['handleEvent']>)(events[i], ctx);
      profOf(p).evCur += performance.now() - t0;
    }
    for (let j = 0; j < batchers.length; j++) {
      const p = batchers[j];
      const t0 = performance.now();
      (p.afterEvents as NonNullable<HudPart['afterEvents']>)(ctx);
      profOf(p).evCur += performance.now() - t0;
    }
    for (const r of prof.values()) {
      if (r.evCur <= 0) continue;
      r.evBatches++;
      r.evTotal += r.evCur;
      if (r.evCur > r.evMax) r.evMax = r.evCur;
      r.evCur = 0;
    }
  }

  setMode(ctx.mode);
  el.classList.toggle('is-locked', !ctx.enabled);
  root.appendChild(el);
  const unbindSounds = bindUiSounds(el, host.audio);

  const onVisibility = (): void => {
    if (document.hidden && opts.autoPause !== false && !ctx.state.over) actions.openSettings();
  };
  document.addEventListener('visibilitychange', onVisibility);

  // ── 顶部界面占用的矩形：告诉宿主(渲染层据此把出屏的血条 / 名牌放到界面下面，而不是被盖住) ──
  const AVOID_EVERY = 0.4;
  let avoidAt = -Infinity;
  let avoidKey = '';
  function reportAvoid(now: number): void {
    if (!host.setOverlayAvoid || now - avoidAt < AVOID_EVERY) return;
    avoidAt = now;
    const rects: { left: number; top: number; right: number; bottom: number }[] = [];
    const add = (node: Element | null | undefined): void => {
      if (!node) return;
      const r = node.getBoundingClientRect();
      if (r.width < 2 || r.height < 2) return;
      rects.push({ left: Math.round(r.left), top: Math.round(r.top), right: Math.round(r.right), bottom: Math.round(r.bottom) });
    };
    for (const part of top.els) add(part);
    add(minimap.el);
    // 指引位里实际显示着的那一块(引导卡或目标行)；横幅正在播时指引位让位，占位置的是横幅
    if (banner.isShowing()) add(banner.el.firstElementChild);
    else for (const child of Array.from(coach.els[coach.els.length - 1].children)) add(child);
    let key = '';
    for (const r of rects) key += `${r.left},${r.top},${r.right},${r.bottom};`;
    if (key === avoidKey) return;
    avoidKey = key;
    host.setOverlayAvoid(rects);
  }

  let over = false;

  function sync(st: GameState): void {
    ctx.state = st;
    ctx.me = findPlayer(st);
  }

  return {
    el,
    update(st, dtReal) {
      if (disposed) return;
      sync(st);
      ctx.now = performance.now() / 1000;
      if (st.over !== over) {
        over = st.over;
        el.classList.toggle('is-over', over);
        if (over) {
          shop.setOpen(false);
          scoreboard.setOpen(false, false);
          input.reset();
        }
      }
      if (profiling) profiledUpdate(dtReal);
      else for (let i = 0; i < updaters.length; i++) (updaters[i].update as NonNullable<HudPart['update']>)(ctx, dtReal);
      reportAvoid(ctx.now);
    },
    handleEvents(events: GameEvent[], st) {
      if (disposed || events.length === 0) return;
      sync(st);
      ctx.now = performance.now() / 1000;
      if (profiling) {
        profiledEvents(events);
        return;
      }
      for (let i = 0; i < events.length; i++) {
        const ev = events[i];
        for (let j = 0; j < listeners.length; j++) (listeners[j].handleEvent as NonNullable<HudPart['handleEvent']>)(ev, ctx);
      }
      for (let j = 0; j < batchers.length; j++) (batchers[j].afterEvents as NonNullable<HudPart['afterEvents']>)(ctx);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      document.removeEventListener('visibilitychange', onVisibility);
      settings?.close();
      for (const p of parts) p.dispose?.();
      unbindSounds();
      dismissTooltip();
      host.setAim(null);
      host.setCameraPeek(null);
      host.setOverlayAvoid?.(null);
      el.remove();
    },
    setShopOpen: (open) => actions.setShop(open),
    setScoreboardOpen: (open) => actions.setScoreboard(open, true),
    openSettings: () => actions.openSettings(),
    announce(key, team, unitId, victimId) {
      banner.demo({ type: 'announce', key, team, unitId, victimId }, ctx);
    },
    getInputMode: () => ctx.mode,
    setInputEnabled(enabled) {
      if (enabled === ctx.enabled || disposed) return;
      ctx.enabled = enabled;
      el.classList.toggle('is-locked', !enabled);
      if (!enabled) {
        dismissTooltip();
        input.reset();
      }
    },
    setProfiling(on) {
      profiling = on;
      if (on) prof.clear();
    },
    coach: { restartGuide: () => coach.restartGuide(), debug: () => coach.debug() },
    getProfile() {
      const out: HudPartProfile[] = [];
      for (const [name, p] of named) {
        const r = prof.get(p);
        if (!r) continue;
        out.push({
          part: name,
          calls: r.calls,
          avg: r.calls > 0 ? r.total / r.calls : 0,
          max: r.max,
          slow: r.slow,
          evBatches: r.evBatches,
          evAvg: r.evBatches > 0 ? r.evTotal / r.evBatches : 0,
          evMax: r.evMax,
        });
      }
      return out.sort((a, b) => b.max - a.max);
    },
  };
}
