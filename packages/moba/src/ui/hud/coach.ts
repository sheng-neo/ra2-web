/**
 * 指引位：顶部中央「现在该做什么」的那一个位置，新手引导卡与「当前目标」行共用、互斥显示。
 *
 *   - 引导卡显示时不显示目标行；引导在等触发的空档里(没有卡)，目标行顶上。
 *   - 播报横幅正在显示时整个指引位淡出让位，横幅走完再淡入。
 *   - 玩家阵亡、对局结束时都不显示。
 * 这里把几样东西接在一起：引导脚本 → 提示卡 / 控件光圈 / 场景箭头 / 小地图脉冲圈；目标规则 → 目标行 / 小地图脉冲 3 秒。
 *
 * 开关(读宿主设置，逐帧看一眼，改了立即生效)：
 *   Settings.tutorial        新手引导。对局内由关变开 = 从第 1 步重看；由开变关 = 立即收起。
 *                            引导走完第 6 步或玩家点「跳过引导」时写回 false。托管演示(config.autoPlay)不启动引导。
 *   Settings.objectiveHints  当前目标提示。关掉后整行不渲染(引导卡与小贴士不受影响)。
 */
import type { GameEvent, Vec2 } from '../../core/types';
import { h, injectStyle, sfCss } from '../theme';
import { createSceneArrow } from './arrows';
import { assistOn, setAssist } from './assist';
import type { HudCtx, HudPart } from './common';
import { createControlGlow, createGuideCard } from './guide';
import { GuideScript, type GuideInput } from './guide-script';
import { createObjectiveRow } from './objective';
import { OBJECTIVE_DEBOUNCE, ObjectiveTracker, createObjectiveMemory, pickObjective, type Objective } from './objective-rules';

const CSS = sfCss(`
.sf-hud__coach {
  position: absolute; left: 50%; top: calc(var(--hud-t) + 58u); z-index: 4; width: min(520u, 60vw); transform: translateX(-50%);
  display: flex; flex-direction: column; align-items: center; pointer-events: none; transition: opacity 0.2s linear;
}
/* 横幅出现：让位 */
.sf-hud__coach.is-yield { opacity: 0; }
.sf-hud__coach.is-yield button { pointer-events: none; }
.sf-hud.is-over .sf-hud__coach { display: none; }
/* 手机横屏(屏高不足 460px)：两侧让开小地图与右上角 */
@media (orientation: landscape) and (max-height: 460px) {
  .sf-hud__coach { width: min(440px, calc(100vw - 2 * (var(--hud-mini) + 40u))); }
}
/* 竖屏：放在商店按钮那一行的正下方，左右各留 8px */
@media (orientation: portrait) {
  .sf-hud__coach { top: calc(var(--hud-t) + var(--hud-mini) + max(58px, 66u)); width: calc(100vw - 16px); }
}
`);

/** 目标带位置时，切入后小地图脉冲多久(秒，墙钟) */
const OBJECTIVE_PULSE = 3;
/** 调试日志最多留多少条 */
const LOG_MAX = 400;

export interface CoachDeps {
  /** 播报横幅：显示中时指引位让位 */
  banner: { isShowing(): boolean };
  /** 小地图的引导 / 目标指示 */
  minimap: { setGuide(pos: Vec2 | null): void };
}

/** 调试 / 端到端测试用的快照 */
export interface CoachDebug {
  /** 引导是否在进行(脚本存在且没结束) */
  guideOn: boolean;
  guide: ReturnType<GuideScript['debug']> | null;
  /** 当前显示的引导卡 */
  card: { id: string; kind: string; done: boolean; title: string; text: string } | null;
  highlight: string | null;
  arrow: { x: number; y: number; label: string; mode: 'screen' | 'edge' | null } | null;
  minimap: { x: number; y: number } | null;
  /** 防抖后的当前目标(不管此刻是否被引导卡 / 横幅挡住) */
  objective: Objective | null;
  /** 目标行此刻是否真的显示在屏幕上 */
  objectiveVisible: boolean;
  /** 指引位是否正在给横幅让位 */
  yielding: boolean;
  /** 防抖后的目标切换日志(模拟时间) */
  log: { t: number; id: string; key: string; tone: string; text: string }[];
}

export interface Coach extends HudPart {
  els: HTMLElement[];
  /** 开局时引导是否开着：开着就由它取代开局键位提示条 */
  readonly replacesTips: boolean;
  /** 从第 1 步重新开始引导(设置里的「重看」) */
  restartGuide(): void;
  debug(): CoachDebug;
}

export function createCoach(ctx: HudCtx, deps: CoachDeps): Coach {
  injectStyle('sf-hud-coach', CSS);
  const { host } = ctx;
  const demo = ctx.state.config.autoPlay === true;

  // 贴边箭头躲开顶部指引位(slot 在下面才建，用取值函数延后读)
  const arrow = createSceneArrow(ctx, () => slot);
  const glow = createControlGlow(ctx);
  const row = createObjectiveRow();
  const card = createGuideCard(() => {
    if (!script) return;
    script.skip();
    stopGuide();
    setAssist(host, 'tutorial', false);
    ctx.toast('已关闭新手引导，可在设置里重新打开', 'info');
  });
  const slot = h('div', 'sf-hud__coach', card.el, row.el);

  // ── 引导 ──
  /**
   * 上一帧从宿主读到的「新手引导」开关。只对它的跳变作反应：自己写回 false(走完 / 跳过)之后不改这个值——
   * 宿主照办了，下一帧自然读到 false；宿主没存住(读回来还是 true)也不会被当成「又打开了」而重新开始。
   */
  let tutorialSeen = assistOn(host.getSettings(), 'tutorial');
  let script: GuideScript | null = tutorialSeen && !demo ? new GuideScript(ctx.state, ctx.me) : null;
  const replacesTips = script !== null;
  const guideInput: GuideInput = { state: ctx.state, me: ctx.me, mode: ctx.mode, shopOpen: false, objectiveHints: true };
  let guideMinimap: Vec2 | null = null;
  let lastArrow: { pos: Vec2; label: string } | null = null;

  // ── 当前目标 ──
  const mem = createObjectiveMemory();
  const tracker = new ObjectiveTracker();
  let lastEval = -Infinity;
  let pulsePos: Vec2 | null = null;
  let pulseUntil = 0;
  const log: CoachDebug['log'] = [];

  let yielding = false;
  let hasCoach = false;
  /** 此刻小地图上实际在指的点(调试用) */
  let shownOnMinimap: Vec2 | null = null;

  function startGuide(): void {
    script = new GuideScript(ctx.state, ctx.me);
  }

  function stopGuide(): void {
    script = null;
    card.render({ card: null, lesson: 1, lessonsDone: [], highlight: null, arrow: null, minimap: null, finished: true });
    glow.set(null);
    arrow.set(null);
    lastArrow = null;
    guideMinimap = null;
  }

  return {
    els: [arrow.el, slot],
    replacesTips,
    restartGuide() {
      if (demo) return;
      stopGuide();
      startGuide();
    },
    debug() {
      const v = script ? script.debug() : null;
      const el = card.el;
      return {
        guideOn: script !== null,
        guide: v,
        card: card.visible() ? { id: el.dataset.step ?? '', kind: el.dataset.kind ?? '', done: el.dataset.done === '1', title: el.querySelector('.sf-hud__gcard-title')?.textContent ?? '', text: el.getAttribute('aria-label') ?? '' } : null,
        highlight: glow.current(),
        arrow: lastArrow ? { x: lastArrow.pos.x, y: lastArrow.pos.y, label: lastArrow.label, mode: arrow.mode() } : null,
        minimap: shownOnMinimap ? { x: shownOnMinimap.x, y: shownOnMinimap.y } : null,
        objective: tracker.current,
        objectiveVisible: row.visible() && !yielding,
        yielding,
        log: log.slice(),
      };
    },
    handleEvent(ev: GameEvent, c) {
      if (script) script.onEvent(ev, c.state);
    },
    onMode(mode) {
      guideInput.mode = mode;
    },
    update(c) {
      const st = c.state;
      const me = c.me;
      const settings = host.getSettings();

      // ── 引导开关 ──
      const tutorialOn = assistOn(settings, 'tutorial');
      if (tutorialOn !== tutorialSeen) {
        tutorialSeen = tutorialOn;
        if (!tutorialOn) stopGuide();
        else if (!demo && !st.over) startGuide();
      }

      // ── 引导脚本 → 卡片 / 光圈 / 箭头 ──
      let cardShown = false;
      if (script) {
        guideInput.state = st;
        guideInput.me = me;
        guideInput.mode = c.mode;
        guideInput.shopOpen = c.actions.isShopOpen();
        guideInput.objectiveHints = assistOn(settings, 'objectiveHints');
        const view = script.update(guideInput);
        if (view.finished) {
          // 走完了第 6 步：以后默认不再出现
          stopGuide();
          setAssist(host, 'tutorial', false);
        } else {
          if (card.render(view)) host.audio.ui('confirm');
          cardShown = view.card !== null;
          glow.set(view.highlight);
          arrow.set(view.arrow);
          lastArrow = view.arrow ? { pos: view.arrow.pos, label: view.arrow.label } : null;
          guideMinimap = view.minimap;
        }
      }
      arrow.update?.(c, 0);

      // ── 当前目标：每 0.5 秒(模拟时间)评估一次 ──
      if (st.time - lastEval >= OBJECTIVE_DEBOUNCE.interval || st.time < lastEval) {
        lastEval = st.time;
        const cand = pickObjective(st, me, c.mode, mem);
        if (tracker.feed(cand, st.time)) {
          const cur = tracker.current;
          if (cur) {
            if (log.length >= LOG_MAX) log.shift();
            log.push({ t: Math.round(st.time * 10) / 10, id: cur.id, key: cur.key, tone: cur.tone, text: cur.text });
            // 带位置的目标：切入时小地图脉冲几秒(不常驻，免得小地图一直在闪)
            if (cur.pos) {
              pulsePos = { x: cur.pos.x, y: cur.pos.y };
              pulseUntil = c.now + OBJECTIVE_PULSE;
            } else pulsePos = null;
          } else pulsePos = null;
        }
      }
      const hintsOn = assistOn(settings, 'objectiveHints');
      const showRow = hintsOn && !cardShown && me.alive && !st.over;
      row.render(showRow ? tracker.current : null);

      // ── 横幅出现时让位 ──
      const y = deps.banner.isShowing();
      if (y !== yielding) {
        yielding = y;
        slot.classList.toggle('is-yield', y);
      }

      // ── 小地图：引导的目标优先；否则是目标行切入后的 3 秒脉冲 ──
      // 目标行正被横幅挡着时先不闪：等它露出来再从头闪 3 秒，玩家才能把文字和小地图上的圈对上
      if (pulsePos && yielding) pulseUntil = c.now + OBJECTIVE_PULSE;
      if (guideMinimap && me.alive && !st.over) shownOnMinimap = guideMinimap;
      else if (pulsePos && showRow && !yielding && c.now < pulseUntil) shownOnMinimap = pulsePos;
      else shownOnMinimap = null;
      deps.minimap.setGuide(shownOnMinimap);
      // 指引位里有东西时给根节点打个标记：竖屏下帧率读数、击杀流据此让一让
      const has = cardShown || row.visible();
      if (has !== hasCoach) {
        hasCoach = has;
        c.root.classList.toggle('is-coach', has);
      }
    },
    dispose() {
      glow.dispose();
      arrow.dispose?.();
      deps.minimap.setGuide(null);
      ctx.root.classList.remove('is-coach');
      script = null;
    },
  };
}
