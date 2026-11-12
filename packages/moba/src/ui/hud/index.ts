/**
 * 对局 HUD 入口：把各组件与输入模块组装到一个 .sf-root.sf-hud 容器里。
 *
 *   const hud = createHud(app, host, world.state, { dimTarget: renderContainer });
 *   每帧：hud.handleEvents(events, state); hud.update(state, dtReal);
 *   结束：hud.dispose();
 *
 * 层级（HUD 内部，自下而上）：阵亡去色层/残血红边 → 输入层(战场点击、摇杆热区) → 摇杆 →
 * 常驻部件(小地图、比分、状态栏、技能区、击杀流) → 横幅/提示 → 记分板 → 商店 → 设置对话框 → 提示浮层。
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
   * 开局操作提示条显示多少秒后自动收起，缺省 8（一行七八个键位，3 秒读不完）；0 = 不显示。
   * 玩家点 × 关掉过一次后会记住(localStorage)，之后的对局不再显示。
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
}

const CSS = sfCss(`
/* 对局结束：收起操作类部件，把画面留给终局演出与结算页 */
.sf-hud__skills, .sf-hud__joy, .sf-hud__shopbar, .sf-hud__status { transition: opacity 0.5s linear; }
.sf-hud.is-over .sf-hud__skills, .sf-hud.is-over .sf-hud__joy, .sf-hud.is-over .sf-hud__shopbar, .sf-hud.is-over .sf-hud__status { opacity: 0; pointer-events: none; }
.sf-hud.is-over .sf-hud__skills *, .sf-hud.is-over .sf-hud__shopbar *, .sf-hud.is-over .sf-hud__status * { pointer-events: none; }
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
    now: performance.now() / 1000,
    toast: (text, tone) => toasts.show(text, tone),
    inputBlocked: () => !ctx.me.alive || ctx.paused || ctx.state.over,
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
  const tips = createTips(ctx, opts.tipsSeconds ?? 8);

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
      if (settings || disposed) return;
      dismissTooltip();
      input.reset();
      ctx.paused = true;
      host.setPaused(true);
      settings = openSettingsDialog(el, {
        mode: 'match',
        get: () => host.getSettings(),
        update: (patch) => host.updateSettings(patch),
        audio: host.audio,
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
  el.append(...death.els.slice(0, 2), field, input.joystick, minimap.el, ...shop.els.slice(0, 1), ...top.els, feed.el, fps.el, status.el, skills.el, banner.el, channel.el, tips.el, toasts.el, death.els[2], scoreboard.el, shop.els[1]);

  const parts: HudPart[] = [minimap, top, feed, banner, status, skills, shop, scoreboard, death, toasts, channel, fps, tips, input];
  const updaters = parts.filter((p) => p.update);
  const listeners = parts.filter((p) => p.handleEvent);
  const batchers = parts.filter((p) => p.afterEvents);

  setMode(ctx.mode);
  root.appendChild(el);
  const unbindSounds = bindUiSounds(el, host.audio);

  const onVisibility = (): void => {
    if (document.hidden && opts.autoPause !== false && !ctx.state.over) actions.openSettings();
  };
  document.addEventListener('visibilitychange', onVisibility);

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
      for (let i = 0; i < updaters.length; i++) (updaters[i].update as NonNullable<HudPart['update']>)(ctx, dtReal);
    },
    handleEvents(events: GameEvent[], st) {
      if (disposed || events.length === 0) return;
      sync(st);
      ctx.now = performance.now() / 1000;
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
      el.remove();
    },
    setShopOpen: (open) => actions.setShop(open),
    setScoreboardOpen: (open) => actions.setScoreboard(open, true),
    openSettings: () => actions.openSettings(),
    announce(key, team, unitId, victimId) {
      banner.demo({ type: 'announce', key, team, unitId, victimId }, ctx);
    },
    getInputMode: () => ctx.mode,
  };
}
