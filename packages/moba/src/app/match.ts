/**
 * 一局对局的会话：加载(建世界 → 建场景 → 预热着色器 → 建 HUD) → 主循环 → 结束 / 中途退出 → 释放。
 *
 * DOM 结构(都在 #app 里)：
 *   .app-match               本文件创建，自成一个层叠上下文(HUD 内部的 z-index 不会盖到加载页 / 结算页上面)
 *     .app-stage             渲染容器(WebGL canvas + 渲染层自己的血条 / 飘字叠加层)。不挂任何指针监听——输入全在 HUD
 *     .sf-root.sf-hud        HUD(createHud 追加)
 *   加载页 / 结算页           界面层各自追加在 .app-match 之后，天然盖在对局上面
 */
import type { AudioEngine } from '../audio/api';
import type { GameEvent, GameState, MatchConfig, World } from '../core/types';
import { TICK_DT } from '../core/types';
import { createWorld } from '../core/world';
import type { GameRenderer, Quality } from '../render/api';
import { createGameRenderer } from '../render/index';
import type { HudHost, LoadingScreen, MatchChoice, MenuHost, Settings } from '../ui/api';
import { createHud, showLoading } from '../ui/index';
import type { HudHandle } from '../ui/index';
import { GameLoop, type LoopFrame } from './loop';
import type { PerfMeter } from './perf';
import { injectAppStyle, showLayer, type Layer } from './shell';

/** 对局结束后等多久再出结算页：留给胜负横幅与镜头演出 */
const RESULT_DELAY_MS = 2600;
/** 加载页最短停留：机器再快也让玩家看清对阵 */
const MIN_LOADING_MS = 1200;
/** 阵亡去色的渐变时长(秒) */
const GRAY_FADE = 0.6;
/** 正常速度下单帧最多补的模拟步数 */
const NORMAL_MAX_STEPS = 6;
/** 单帧步数超过它(只可能发生在加速调试时)就精简交给渲染 / 音频的事件 */
const THIN_STEPS = NORMAL_MAX_STEPS + 2;

/** 一次性的表现类事件：过期的可以直接丢。其余(出生 / 消失 / 死亡 / 播报…)关系到视图的生命周期，必须全量送达 */
const COSMETIC: ReadonlySet<GameEvent['type']> = new Set<GameEvent['type']>(['attack', 'damage', 'heal', 'fx', 'skillCast', 'projectileHit', 'gold', 'itemBought', 'reject']);

/** 加速调试用：只保留最后一步的表现类事件 + 全部生命周期事件，免得一帧里迸出几百步的特效与音效 */
function thinEvents(batch: GameEvent[], tailStart: number): GameEvent[] {
  const out: GameEvent[] = [];
  for (let i = 0; i < batch.length; i++) {
    const ev = batch[i];
    if (i >= tailStart || !COSMETIC.has(ev.type)) out.push(ev);
  }
  return out;
}

/** finished：对局分出胜负。endTime 是水晶被毁那一 tick 的模拟时间(之后为了播结束演出，state.time 还会继续走) */
export type MatchOutcome = { kind: 'finished'; state: GameState; endTime: number } | { kind: 'quit' };

/** 应用层提供给对局会话的环境 */
export interface MatchEnv {
  app: HTMLElement;
  audio: AudioEngine;
  menuHost: MenuHost;
  perf: PerfMeter;
  getSettings(): Settings;
  updateSettings(patch: Partial<Settings>): void;
  /** 订阅设置变化，返回退订函数 */
  onSettings(fn: (patch: Partial<Settings>) => void): () => void;
  portrait(heroId: MatchChoice['heroId']): string;
  /** 主循环里抛出的错误(循环已停止) */
  onLoopError(err: unknown): void;
  /** 进入加载 / 对局阶段时通知(调试钩子的 phase) */
  setPhase(phase: 'loading' | 'match'): void;
}

export interface MatchOptions {
  seed: number;
  autoPlay: boolean;
  speed: number;
  /** 跳过加载页的最短停留(直接开局的调试模式) */
  fastLoad: boolean;
}

/** 取消令牌：应用层「重新开始」时置位，加载流程在每个让出点检查 */
export interface CancelToken {
  cancelled: boolean;
}

export interface MatchSession {
  readonly config: MatchConfig;
  readonly world: World;
  readonly state: GameState;
  /** 图形上下文丢失后重建时会换成新的实例 */
  readonly renderer: GameRenderer;
  readonly hud: HudHandle;
  readonly loop: GameLoop<GameEvent>;
  readonly stage: HTMLElement;
  /** 对局结束(含结束演出)或玩家中途退出时 resolve；只 resolve 一次 */
  readonly finished: Promise<MatchOutcome>;
  /** 外部暂停(提示层打开期间等)：按原因叠加 */
  setPause(reason: string, paused: boolean): void;
  /** 只收起 HUD(结算页出现时)，画面继续渲染 */
  disposeHud(): void;
  /** 完整释放：HUD、渲染器、主循环、监听。可重复调用 */
  dispose(): void;
}

/** 渲染层在契约之外可能提供的扩展(按特性探测，没有就退化) */
interface RendererExtras {
  setCameraShake?(enabled: boolean): void;
  snapCamera?(): void;
  engine?: {
    postEnabled?: boolean;
    grade?: { desaturate: number; dim: number };
  };
}

const extrasOf = (r: GameRenderer): RendererExtras => r as GameRenderer & RendererExtras;

const now = (): number => performance.now();

/** 让出一帧：等浏览器把刚才的界面改动画出来。页面在后台时 raf 不触发，用定时器兜底 */
function nextPaint(): Promise<void> {
  return new Promise((resolve) => {
    let done = false;
    const finish = (): void => {
      if (done) return;
      done = true;
      resolve();
    };
    requestAnimationFrame(() => window.setTimeout(finish, 0));
    window.setTimeout(finish, 160);
  });
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => window.setTimeout(resolve, ms));

/**
 * 开一局。显示加载页并分阶段构建，全部就绪后启动主循环。
 * 加载期间被取消(token.cancelled)时返回 null，且已清理干净。构建失败会抛出(同样已清理)。
 */
export async function startMatch(env: MatchEnv, choice: MatchChoice, opts: MatchOptions, token: CancelToken): Promise<MatchSession | null> {
  injectAppStyle();
  const { app, audio, perf } = env;
  env.setPhase('loading');

  const loading: LoadingScreen = showLoading(app, choice, env.menuHost);
  const shownAt = now();

  const matchEl = document.createElement('div');
  matchEl.className = 'app-match';
  const stage = document.createElement('div');
  stage.className = 'app-stage';
  matchEl.appendChild(stage);

  let renderer: GameRenderer | null = null;
  let builtHud: HudHandle | null = null;
  let hudDisposed = false;
  let disposed = false;

  // 加载中途取消或失败时的清理；会话建成后换成「释放整个会话」
  let cleanup = (): void => {
    disposed = true;
    try {
      builtHud?.dispose();
      renderer?.dispose();
    } catch (err) {
      console.error(err);
    }
    renderer = null;
    matchEl.remove();
    loading.close();
  };
  const cancelled = (): boolean => {
    if (!token.cancelled) return false;
    cleanup();
    return true;
  };

  try {
    // ── 1. 建世界 ──
    loading.setProgress(0.05, '集结双方英雄…');
    await nextPaint();
    if (cancelled()) return null;
    const config: MatchConfig = { seed: opts.seed, playerHero: choice.heroId, difficulty: choice.difficulty, autoPlay: opts.autoPlay };
    const world = createWorld(config);
    const state = world.state;

    // ── 2. 建场景 ──(同步的重活：先让进度条画出来)
    loading.setProgress(0.2, '铺展星陨高原…');
    await nextPaint();
    if (cancelled()) return null;
    // 对局容器要先进文档，渲染器才量得到尺寸；放在最前面，加载页继续盖在上面
    app.insertBefore(matchEl, app.firstChild);
    const quality: Quality = env.getSettings().quality;
    renderer = createGameRenderer(stage, state, { quality });
    extrasOf(renderer).setCameraShake?.(env.getSettings().cameraShake);

    // ── 3. 预热着色器 ──(头两帧会编译全部用到的着色器并上传贴图，放在加载页后面做)
    loading.setProgress(0.62, '点亮星辉与光影…');
    await nextPaint();
    if (cancelled()) return null;
    renderer.resize();
    renderer.render(state, 1, 0);
    loading.setProgress(0.82, '点亮星辉与光影…');
    await nextPaint();
    if (cancelled()) return null;
    renderer.render(state, 1, 1 / 60);
    extrasOf(renderer).snapCamera?.();

    // ── 4. 建 HUD ──
    loading.setProgress(0.92, '布置战斗界面…');
    await nextPaint();
    if (cancelled()) return null;

    // ───────────── 会话状态 ─────────────
    let resolveFinished: (o: MatchOutcome) => void = () => {};
    let settled = false;
    const finished = new Promise<MatchOutcome>((resolve) => {
      resolveFinished = resolve;
    });
    const finish = (o: MatchOutcome): void => {
      if (settled) return;
      settled = true;
      resolveFinished(o);
    };

    const pauseReasons = new Set<string>();
    const setPause = (reason: string, paused: boolean): void => {
      if (paused) pauseReasons.add(reason);
      else pauseReasons.delete(reason);
      loop.setPaused(pauseReasons.size > 0);
    };

    // 阵亡去色：渲染层开着后期就用它的调色，否则退回给渲染容器加 CSS 滤镜。
    // 交给 HUD 的 dimTarget 是个不进文档的替身——只为告诉 HUD「去色由宿主负责」，别再铺 backdrop-filter。
    let playerDead = false;
    let gray = 0;
    let grayWritten = 0;
    let hadGrade = false;
    let cssGray = false;
    const dimProxy = document.createElement('div');
    const updateDeathTint = (dt: number): void => {
      // 胜负已分就不再压灰：结束演出要看得清
      const target = playerDead && !state.over ? 1 : 0;
      if (gray !== target) {
        const stepV = dt / GRAY_FADE;
        gray = gray < target ? Math.min(target, gray + stepV) : Math.max(target, gray - stepV);
      }
      const engine = renderer ? extrasOf(renderer).engine : undefined;
      const grade = engine?.postEnabled === true ? engine.grade : undefined;
      // 只在数值变化(或后期刚被打开)时写调色参数：平时不去碰它，免得盖掉渲染层自己对这两个参数的使用
      if (grade && (gray !== grayWritten || !hadGrade)) {
        grade.desaturate = gray * 0.9;
        grade.dim = gray * 0.16;
        grayWritten = gray;
      }
      hadGrade = !!grade;
      const wantCss = !grade && target === 1;
      if (wantCss !== cssGray) {
        cssGray = wantCss;
        stage.classList.toggle('is-gray', wantCss);
      }
    };

    const hudHost: HudHost = {
      command: (cmd) => world.command(state.playerId, cmd),
      setAim: (aim) => renderer?.setAim(aim),
      screenToGround: (x, y) => (renderer ? renderer.screenToGround(x, y) : null),
      worldToScreen: (pos, height) => (renderer ? renderer.worldToScreen(pos, height) : { x: 0, y: 0, visible: false }),
      pickUnit: (x, y) => (renderer ? renderer.pickUnit(x, y, state) : -1),
      setCameraPeek: (pos) => renderer?.setCameraPeek(pos),
      setPaused: (paused) => setPause('hud', paused),
      quit: () => finish({ kind: 'quit' }),
      getSettings: env.getSettings,
      updateSettings: env.updateSettings,
      getFps: () => perf.fps,
      audio,
      portrait: env.portrait,
    };

    const hud: HudHandle = createHud(matchEl, hudHost, state, {
      dimTarget: dimProxy,
      onDeathChange: (dead) => {
        playerDead = dead;
      },
    });
    builtHud = hud;

    // ───────────── 主循环 ─────────────
    let renderEvMs = 0;
    let hudEvMs = 0;
    let audioEvMs = 0;
    let lastFrameAt = -1;
    let overAt = -1;
    let endTime = -1;
    let resizePending = false;

    const turbo = opts.speed > 1;
    const loop = new GameLoop<GameEvent>(
      {
        step() {
          world.step();
          if (state.over && endTime < 0) endTime = state.time;
        },
        drain: () => world.drainEvents(),
        events(batch, steps, tailStart) {
          // 同一批事件依次交给三层：渲染(特效 / 飘字 / 震屏) → 界面(播报 / 击杀流) → 音频。
          // 加速调试时一帧攒了几百步的事件：界面仍拿全量(战报不能丢)，渲染与音频只拿精简后的
          const light = steps > THIN_STEPS ? thinEvents(batch, tailStart) : batch;
          const t0 = now();
          renderer?.handleEvents(light, state);
          const t1 = now();
          if (!hudDisposed) hud.handleEvents(batch, state);
          const t2 = now();
          audio.handleEvents(light, state);
          renderEvMs = t1 - t0;
          hudEvMs = t2 - t1;
          audioEvMs = now() - t2;
        },
        frame(f: LoopFrame) {
          const t0 = now();
          if (resizePending) {
            resizePending = false;
            renderer?.resize();
          }
          updateDeathTint(f.dt);
          renderer?.render(state, f.alpha, f.dt);
          const t1 = now();
          if (!hudDisposed) hud.update(state, f.dt);
          const t2 = now();
          // 暂停时音频只是不再跟进战况(配乐照常)
          if (!f.paused) audio.update(state, f.dt);
          const t3 = now();

          const interval = lastFrameAt >= 0 && f.dt > 0 ? f.now - lastFrameAt : 0;
          lastFrameAt = f.now;
          perf.frame(f.simMs, renderEvMs + (t1 - t0), hudEvMs + (t2 - t1), audioEvMs + (t3 - t2), t3 - f.now, interval, f.steps);
          renderEvMs = hudEvMs = audioEvMs = 0;

          if (state.over) {
            if (overAt < 0) {
              overAt = f.now;
              // 结束演出按真实速度播放
              loop.speed = 1;
            } else if (f.now - overAt >= RESULT_DELAY_MS) finish({ kind: 'finished', state, endTime: endTime >= 0 ? endTime : state.time });
          }
        },
        error(err) {
          env.onLoopError(err);
        },
      },
      { now, raf: (cb) => requestAnimationFrame(cb), caf: (id) => cancelAnimationFrame(id) },
      // 加速调试：放宽单帧的时间 / 步数 / 耗时上限，并关掉「长间隔 = 挂起」的兜底(无头软件渲染下一帧可能就要几秒)
      {
        stepDt: TICK_DT,
        maxFrameDt: turbo ? 1 : 0.25,
        maxSteps: turbo ? 30 : NORMAL_MAX_STEPS,
        speed: opts.speed,
        simBudgetMs: turbo ? 240 : 80,
        gapResetSec: turbo ? Infinity : 5,
      },
    );

    // ───────────── 监听 ─────────────
    const requestResize = (): void => {
      resizePending = true;
    };
    const resizeObserver = typeof ResizeObserver === 'function' ? new ResizeObserver(requestResize) : null;
    resizeObserver?.observe(stage);
    window.addEventListener('resize', requestResize);
    window.addEventListener('orientationchange', requestResize);

    // 切后台 / 回前台：后台期间 raf 不触发，回来时不能把这段时间当成一帧补上
    const onVisibility = (): void => loop.resetClock();
    document.addEventListener('visibilitychange', onVisibility);

    const unsubscribeSettings = env.onSettings((patch) => {
      if (!renderer) return;
      if (patch.quality !== undefined) renderer.setQuality(patch.quality);
      if (patch.cameraShake !== undefined) extrasOf(renderer).setCameraShake?.(patch.cameraShake);
    });

    // 图形上下文丢失(系统回收显存、驱动重置)：暂停并给出可恢复的提示。
    // 事件不冒泡，在渲染容器上用捕获阶段接；渲染器重建后新 canvas 也在这个容器里。
    let contextLayer: Layer | null = null;
    const rebuildRenderer = (): void => {
      const old = renderer;
      renderer = null;
      try {
        old?.dispose();
      } catch (err) {
        console.error(err);
      }
      stage.replaceChildren();
      renderer = createGameRenderer(stage, state, { quality: env.getSettings().quality });
      extrasOf(renderer).setCameraShake?.(env.getSettings().cameraShake);
      renderer.resize();
      renderer.render(state, 1, 0);
      // 新渲染器的调色参数是初始值：让阵亡去色在下一帧重新写入
      hadGrade = false;
    };
    const onContextLost = (ev: Event): void => {
      if (disposed || !renderer || contextLayer) return;
      // 阻止默认行为，浏览器才会在条件允许时派发 restored
      ev.preventDefault();
      setPause('context', true);
      contextLayer = showLayer(matchEl, {
        title: '画面已中断',
        lines: ['图形设备被系统收回(常见于切到后台过久或显存不足)。', '对局已暂停，战况完好无损。'],
        buttons: [
          {
            label: '恢复画面',
            primary: true,
            onClick() {
              contextLayer = null;
              if (disposed) return;
              try {
                rebuildRenderer();
                setPause('context', false);
              } catch (err) {
                env.onLoopError(err);
              }
            },
          },
          {
            label: '返回主菜单',
            onClick() {
              contextLayer = null;
              finish({ kind: 'quit' });
            },
          },
        ],
      });
    };
    const onContextRestored = (): void => {
      if (disposed || !contextLayer) return;
      contextLayer.close();
      contextLayer = null;
      resizePending = true;
      setPause('context', false);
    };
    stage.addEventListener('webglcontextlost', onContextLost, true);
    stage.addEventListener('webglcontextrestored', onContextRestored, true);

    const disposeHud = (): void => {
      if (hudDisposed) return;
      hudDisposed = true;
      try {
        hud.dispose();
      } catch (err) {
        console.error(err);
      }
    };

    const session: MatchSession = {
      config,
      world,
      state,
      get renderer(): GameRenderer {
        return renderer as GameRenderer;
      },
      hud,
      loop,
      stage,
      finished,
      setPause,
      disposeHud,
      dispose() {
        if (disposed) return;
        disposed = true;
        loop.stop();
        finish({ kind: 'quit' });
        resizeObserver?.disconnect();
        window.removeEventListener('resize', requestResize);
        window.removeEventListener('orientationchange', requestResize);
        document.removeEventListener('visibilitychange', onVisibility);
        stage.removeEventListener('webglcontextlost', onContextLost, true);
        stage.removeEventListener('webglcontextrestored', onContextRestored, true);
        unsubscribeSettings();
        contextLayer?.close();
        contextLayer = null;
        // 先 HUD 后渲染器：HUD 释放时还会调 setAim(null) / setCameraPeek(null)
        disposeHud();
        try {
          renderer?.dispose();
        } catch (err) {
          console.error(err);
        }
        renderer = null;
        matchEl.remove();
      },
    };

    cleanup = (): void => {
      session.dispose();
      loading.close();
    };

    // HUD 先按初始状态刷一遍，免得加载页淡出时露出空白部件
    hud.update(state, 0);
    loading.setProgress(1, '进入战场');
    const remain = opts.fastLoad ? 0 : MIN_LOADING_MS - (now() - shownAt);
    if (remain > 0) await sleep(remain);
    await nextPaint();
    if (cancelled()) return null;

    perf.reset();
    audio.setMusic('battle');
    loading.close();
    env.setPhase('match');
    loop.start();
    return session;
  } catch (err) {
    cleanup();
    throw err;
  }
}
