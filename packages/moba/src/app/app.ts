/**
 * 应用流程：启动 → 主菜单 → 加载 → 对局 → 结算 → (再来一局 / 返回主菜单)。
 *
 * 分层接线都在这里和 match.ts：
 *   core(模拟)  createWorld / step / command / drainEvents
 *   render      createGameRenderer / createHeroPreview / getHeroPortrait / detectQuality
 *   ui          showMainMenu / showLoading / createHud / showResult / loadSettings / saveSettings
 *   audio       createAudio
 *
 * 宿主兼容(页面可能嵌在受限的沙箱 iframe 里)：不发任何网络请求；localStorage 只经界面层带 try/catch 的封装访问；
 * 不用 alert / confirm / prompt——所有提示走 shell.ts 的界面内提示层；不请求全屏与指针锁；声音在首次手势后才出。
 */
import { createAudio } from '../audio/index';
import type { AudioEngine } from '../audio/api';
import type { HeroId } from '../core/types';
import { createHeroPreview, detectQuality, getHeroPortrait } from '../render/index';
import type { MatchChoice, MenuHost, Settings } from '../ui/api';
import { closeAllDialogs, dismissTooltip, ensureTheme, loadSettings, saveSettings, showMainMenu, showResult } from '../ui/index';
import { startMatch, type CancelToken, type MatchEnv, type MatchSession } from './match';
import { parseDebugParams, type DebugParams } from './params';
import { PerfMeter } from './perf';
import { createSettingsStore } from './settings-store';
import { describeError, hideBootSplash, injectAppStyle, showLayer, supportsWebGL2, type Layer } from './shell';

export type AppPhase = 'boot' | 'menu' | 'loading' | 'match' | 'result' | 'unsupported';

/** 结算页淡入多久之后停掉底下的对局(此时已盖严) */
const RESULT_COVER_MS = 650;
/** 停机之后再过多久才释放渲染器：让新界面(结算页的战绩行 / 标题页的 Logo)先把入场动画播完 */
const RELEASE_DELAY_MS = 1100;

/** 调试 / 测试钩子：window.__moba */
export interface MobaDebug {
  /** 当前阶段 */
  readonly phase: AppPhase;
  /** 当前对局的各层对象；不在对局中为 null */
  readonly world: MatchSession['world'] | null;
  readonly state: MatchSession['state'] | null;
  readonly renderer: MatchSession['renderer'] | null;
  readonly hud: MatchSession['hud'] | null;
  readonly loop: MatchSession['loop'] | null;
  readonly config: MatchSession['config'] | null;
  readonly session: MatchSession | null;
  audio: AudioEngine;
  /** 帧耗时滑动统计(每局开始时清零)：perf.snapshot() 给出 sim / render / hud / audio 各阶段毫秒数与帧率 */
  perf: PerfMeter;
  settings: Settings;
  params: DebugParams;
  /** 已开始的对局数 */
  readonly matches: number;
  /** 界面内提示层显示过的错误 */
  errors: string[];
  /** 丢弃当前流程回到标题页(等同错误提示层上的「重新开始」) */
  restart(): void;
}

declare global {
  interface Window {
    __moba?: MobaDebug;
  }
}

/** window.__moba.errors 最多保留的条数 */
const MAX_ERRORS = 50;

/** 浏览器自己冒出来、与游戏逻辑无关的报错，不打扰玩家 */
const BENIGN_ERROR = /ResizeObserver loop/i;

function randomSeed(): number {
  // 种子只在这里取一次真随机；模拟层内部全部走种子 PRNG
  return ((Date.now() & 0xffffff) * 257 + Math.floor(Math.random() * 0x7fffffff)) >>> 0;
}

export function startApp(): void {
  injectAppStyle();
  const params = parseDebugParams(location.search, location.hash);

  let app = document.getElementById('app');
  if (!app) {
    app = document.createElement('div');
    app.id = 'app';
    document.body.appendChild(app);
  }
  const root: HTMLElement = app;

  const perf = new PerfMeter(240);
  const errors: string[] = [];
  let phase: AppPhase = 'boot';
  let session: MatchSession | null = null;
  let token: CancelToken = { cancelled: false };
  /** 每次(重新)进入流程自增；旧流程醒来后发现代数不符就自行退出 */
  let generation = 0;
  let errorLayer: Layer | null = null;
  let matches = 0;
  /** 设置 / 音频等基础设施是否已就绪(之后才谈得上软重启) */
  let ready = false;
  /** 当前流程的取消信号：软重启时 abort，主菜单 / 结算页据此立即自行释放 */
  let flowAbort = new AbortController();

  // ───────────── 送走一局 ─────────────

  /** 已停机、等着释放渲染器的旧对局(同一时刻最多一个) */
  let retired: (() => void) | null = null;
  const flushRetired = (): void => {
    const fn = retired;
    retired = null;
    fn?.();
  };
  /**
   * 送走一局：立刻停机(主循环、监听、HUD、对局容器)，渲染器挪到稍后的空闲时刻再释放。
   * 释放是同步的 GL 调用，要等显卡把积压的帧画完(软件渲染下实测能卡十几秒)；紧跟在停机后面做，
   * 刚出现的结算页 / 标题页就会僵住。先停止出帧、让出几帧、等入场动画播完，再释放就只是一次很短的活。
   */
  const retire = (s: MatchSession): void => {
    flushRetired();
    s.halt();
    let done = false;
    const run = (): void => {
      if (done) return;
      done = true;
      if (retired === run) retired = null;
      try {
        s.dispose();
      } catch (err) {
        console.error(err);
      }
    };
    retired = run;
    const whenIdle = (): void => {
      if (typeof window.requestIdleCallback === 'function') window.requestIdleCallback(run, { timeout: 1500 });
      else window.setTimeout(run, 0);
    };
    // 页面在后台时 raf 不触发：那就留到下一局开始前(flushRetired)或回到前台再做
    window.setTimeout(() => requestAnimationFrame(() => requestAnimationFrame(whenIdle)), RELEASE_DELAY_MS);
  };

  // ───────────── 错误提示(界面内) ─────────────

  const restart = (): void => {
    if (!ready) {
      // 基础设施还没起来就出错了：没有可回的标题页，只能整页重载
      try {
        location.reload();
      } catch {
        // 宿主禁止重载时无能为力
      }
      return;
    }
    generation++;
    token.cancelled = true;
    errorLayer?.close();
    errorLayer = null;
    try {
      session?.dispose();
    } catch (err) {
      console.error(err);
    }
    session = null;
    try {
      flushRetired();
      // 主菜单 / 结算页：通知它们自行释放(背景动画、window 上的按键监听、3D 预览)
      flowAbort.abort();
      // 还开着的对话框(设置、操作说明)连同它们的全局监听一起收掉，否则「有对话框打开」的状态会卡住全部快捷键
      closeAllDialogs();
      dismissTooltip();
    } catch (err) {
      console.error(err);
    }
    // 加载页由对局的取消令牌负责收尾；这里把容器清空兜底，残留的回调会因代数不符而被忽略
    root.replaceChildren();
    runGuarded('title');
  };

  const reportError = (err: unknown, fatal: boolean): void => {
    const text = describeError(err);
    if (BENIGN_ERROR.test(text)) return;
    // 只留最近的若干条，免得错误风暴把内存吃光
    if (errors.length >= MAX_ERRORS) errors.shift();
    errors.push(text);
    hideBootSplash();
    if (errorLayer) {
      errorLayer.addDetail(text);
      return;
    }
    session?.setPause('error', true);
    const buttons = [{ label: '重新开始', primary: true, onClick: restart }];
    // 主循环还活着(或压根不在对局里)的话，允许玩家关掉提示继续：多数界面回调里的错误并不致命
    if (!fatal && (!session || session.loop.running)) {
      buttons.push({
        label: session ? '继续游戏' : '继续',
        primary: false,
        onClick() {
          errorLayer = null;
          session?.setPause('error', false);
        },
      });
    }
    errorLayer = showLayer(root, {
      title: '出了点状况',
      tone: 'error',
      lines: [fatal ? '游戏遇到无法继续的错误。点击「重新开始」回到标题页。' : '游戏运行时出现了一个错误。可以尝试继续，或重新开始。'],
      detail: text,
      buttons,
    });
  };

  window.addEventListener('error', (ev) => {
    // 资源加载失败之类没有 error 对象也没有 message 的事件不归这里管
    if (!ev.error && !ev.message) return;
    reportError(ev.error ?? ev.message, false);
  });
  window.addEventListener('unhandledrejection', (ev) => reportError(ev.reason, false));

  // ───────────── 设置与音频 ─────────────

  let store: ReturnType<typeof createSettingsStore<Settings>>;
  let audio: AudioEngine;
  try {
    ensureTheme();
    // URL 调试参数(quality / fps)只影响本次会话：放在覆盖层里，不随玩家改别的设置一起写进存档
    const overrides: Partial<Settings> = {};
    if (params.quality) overrides.quality = params.quality;
    if (params.showFps) overrides.showFps = true;
    store = createSettingsStore<Settings>(loadSettings({ quality: detectQuality() }), overrides, saveSettings);
    audio = createAudio();
  } catch (err) {
    // 连基础设施都起不来：软重启无从谈起，只能请玩家重新载入
    console.error(err);
    errors.push(describeError(err));
    hideBootSplash();
    showLayer(root, {
      title: '启动失败',
      tone: 'error',
      page: true,
      lines: ['游戏初始化时出错，无法继续。请重新载入页面；若问题依旧，换用新版浏览器再试。'],
      detail: describeError(err),
      buttons: [
        {
          label: '重新载入',
          primary: true,
          onClick() {
            try {
              location.reload();
            } catch {
              // 宿主禁止重载时无能为力
            }
          },
        },
      ],
    });
    return;
  }
  ready = true;
  /** 生效中的设置(活对象：玩家存档叠上调试覆盖) */
  const settings: Settings = store.current;
  const applyVolumes = (): void => audio.setVolumes({ master: settings.masterVolume, sfx: settings.sfxVolume, music: settings.musicVolume });
  applyVolumes();

  const settingsListeners = new Set<(patch: Partial<Settings>) => void>();
  const getSettings = (): Settings => settings;
  const updateSettings = (patch: Partial<Settings>): void => {
    store.update(patch);
    applyVolumes();
    for (const fn of settingsListeners) fn(patch);
  };

  const portraits = new Map<HeroId, string>();
  const portrait = (heroId: HeroId): string => {
    let url = portraits.get(heroId);
    if (url === undefined) {
      try {
        url = getHeroPortrait(heroId);
      } catch (err) {
        // 头像画不出来不影响游戏，界面层对空串有兜底
        console.warn(err);
        url = '';
      }
      portraits.set(heroId, url);
    }
    return url;
  };

  const menuHost: MenuHost = { getSettings, updateSettings, audio, portrait, createHeroPreview };

  // ───────────── 调试钩子 ─────────────

  const debug: MobaDebug = {
    get phase() {
      return phase;
    },
    get world() {
      return session?.world ?? null;
    },
    get state() {
      return session?.state ?? null;
    },
    get renderer() {
      return session?.renderer ?? null;
    },
    get hud() {
      return session?.hud ?? null;
    },
    get loop() {
      return session?.loop ?? null;
    },
    get config() {
      return session?.config ?? null;
    },
    get session() {
      return session;
    },
    audio,
    perf,
    settings,
    params,
    get matches() {
      return matches;
    },
    errors,
    restart,
  };
  window.__moba = debug;

  // ───────────── 流程 ─────────────

  const matchEnv: MatchEnv = {
    app: root,
    audio,
    menuHost,
    perf,
    getSettings,
    updateSettings,
    onSettings(fn) {
      settingsListeners.add(fn);
      return () => settingsListeners.delete(fn);
    },
    portrait,
    onLoopError: (err) => {
      console.error(err);
      reportError(err, true);
    },
    setPhase(p) {
      phase = p;
    },
  };

  const sleep = (ms: number): Promise<void> => new Promise((resolve) => window.setTimeout(resolve, ms));

  async function run(start: 'title' | 'select' | 'direct'): Promise<void> {
    const gen = ++generation;
    token = { cancelled: false };
    const myToken = token;
    flowAbort = new AbortController();
    const signal = flowAbort.signal;
    let next: 'title' | 'select' | 'direct' = start;

    for (;;) {
      let choice: MatchChoice;
      if (next === 'direct') {
        // 调试直达(skipmenu)：只在启动时用一次，之后回到正常流程。hero / difficulty 参数也只在这里生效——
        // 走菜单时以玩家在选英雄页的选择为准
        choice = { heroId: params.hero ?? 'chijin', difficulty: params.difficulty ?? 'normal' };
      } else {
        phase = 'menu';
        choice = await showMainMenu(root, menuHost, { start: next, signal });
        if (gen !== generation) return;
      }

      // 上一局的渲染器若还没来得及释放，开新局之前必须先放掉(显存与 WebGL 上下文数量都有限)
      flushRetired();
      matches++;
      const created = await startMatch(
        matchEnv,
        choice,
        { seed: params.seed ?? randomSeed(), autoPlay: params.auto, speed: params.speed, fastLoad: next === 'direct' },
        myToken,
      );
      if (gen !== generation) {
        created?.dispose();
        return;
      }
      if (!created) return;
      session = created;

      const outcome = await created.finished;
      if (gen !== generation) return;

      if (outcome.kind === 'quit') {
        retire(created);
        session = null;
        next = 'title';
        continue;
      }

      // 结算页盖在对局画面上淡入；HUD 立刻收起(免得两边同时响应按键)，画面等盖严了再停
      phase = 'result';
      created.disposeHud();
      // 结算页的「时长」按分出胜负的那一刻算，不含之后播结束演出的几秒
      const resultDone = showResult(root, { ...outcome.state, time: outcome.endTime }, menuHost, { signal });
      await sleep(RESULT_COVER_MS);
      if (gen !== generation) return;
      retire(created);
      session = null;
      const picked = await resultDone;
      if (gen !== generation) return;
      next = picked === 'again' ? 'select' : 'title';
    }
  }

  function runGuarded(start: 'title' | 'select' | 'direct'): void {
    run(start).catch((err: unknown) => {
      console.error(err);
      reportError(err, true);
    });
  }

  // ───────────── 启动 ─────────────

  const boot = (): void => {
    if (!supportsWebGL2()) {
      phase = 'unsupported';
      hideBootSplash();
      showLayer(root, {
        title: '无法启动星陨战纪',
        page: true,
        lines: ['游戏需要 WebGL2 图形加速，但当前浏览器或设备没有提供。'],
        list: ['把浏览器更新到最新版本(Chrome、Edge、Safari 15 以上、Firefox 均可)', '在浏览器设置里开启「硬件加速」后重启浏览器', '关闭省电模式，或换一台设备再试'],
        buttons: [{ label: '重新检测', primary: true, onClick: boot }],
      });
      return;
    }
    runGuarded(params.skipMenu ? 'direct' : 'title');
    // 第一个界面已经同步挂上，启动占位可以退场了
    hideBootSplash();
    // 头像要离屏渲染五位英雄(一次性的重活)：趁标题页空闲先做掉，免得卡在「进入选英雄页」那一下
    if (!params.skipMenu) {
      const warm = (): void => void portrait('chijin');
      if (typeof window.requestIdleCallback === 'function') window.requestIdleCallback(warm, { timeout: 3000 });
      else window.setTimeout(warm, 1200);
    }
  };
  boot();
}
