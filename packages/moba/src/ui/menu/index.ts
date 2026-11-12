/**
 * 主菜单流程：标题页 ↔ 选英雄页，共用一张动态背景；点「开始对战」后 resolve。
 */
import { HEROES } from '../../core/data/heroes';
import type { Difficulty, HeroId } from '../../core/types';
import type { MatchChoice, MenuHost } from '../api';
import { storageGetJson, storageSet } from '../storage';
import { bindUiSounds, closeAllDialogs, dismissTooltip, ensureTheme, h } from '../theme';
import { createBackdrop } from './backdrop';
import { createSelectScreen } from './select';
import { createTitleScreen } from './title';
import type { MenuScreen } from './title';

const CHOICE_KEY = 'starfall.lastChoice.v1';
// 第一次玩(没有历史选择)：默认选中上手简单的程咬金，对手难度默认「简单」；玩家选过一次之后就以他的选择为准
const DEFAULT_CHOICE: MatchChoice = { heroId: 'chijin', difficulty: 'easy' };

/** 记住上次选的英雄与难度(本地存储不可用时只在本次会话里记住，见 storage.ts) */
function loadChoice(): MatchChoice {
  const o = storageGetJson(CHOICE_KEY) as { heroId?: unknown; difficulty?: unknown } | null;
  if (!o || typeof o !== 'object') return { ...DEFAULT_CHOICE };
  const heroId = typeof o.heroId === 'string' && o.heroId in HEROES ? (o.heroId as HeroId) : DEFAULT_CHOICE.heroId;
  const d = o.difficulty;
  const difficulty: Difficulty = d === 'easy' || d === 'normal' || d === 'hard' ? d : DEFAULT_CHOICE.difficulty;
  return { heroId, difficulty };
}

function saveChoice(c: MatchChoice): void {
  storageSet(CHOICE_KEY, JSON.stringify({ heroId: c.heroId, difficulty: c.difficulty }));
}

export interface MainMenuOptions {
  /** 直接从选英雄页开始（「再来一局」后想换英雄时可用） */
  start?: 'title' | 'select';
  /**
   * 取消信号：宿主要丢弃整个流程(错误恢复时的软重启)时 abort。菜单立即释放自己的 DOM、监听、动画帧、
   * 3D 预览和打开着的对话框；返回的 Promise 此后不再 resolve。
   */
  signal?: AbortSignal;
}

/**
 * 显示主菜单。标题页 → 选英雄(含对手难度) → 点「开始对战」后 resolve(MatchChoice)。
 * resolve 前已彻底清理自己创建的 DOM、事件、动画帧与 3D 预览。
 */
export function showMainMenu(root: HTMLElement, host: MenuHost, opts: MainMenuOptions = {}): Promise<MatchChoice> {
  ensureTheme();
  return new Promise((resolve) => {
    if (opts.signal?.aborted) return;
    const shell = h('div', 'sf-root sf-menu-root');
    const backdrop = createBackdrop(shell, 'menu');
    const unbindSounds = bindUiSounds(shell, host.audio);
    root.appendChild(shell);

    let choice = loadChoice();
    let current: MenuScreen | null = null;
    let finished = false;
    let released = false;
    let finishTimer = 0;
    const leaving = new Map<number, MenuScreen>();

    /** 释放菜单占用的一切。正常结束与中途取消共用 */
    const release = (): void => {
      if (released) return;
      released = true;
      opts.signal?.removeEventListener('abort', onAbort);
      window.clearTimeout(finishTimer);
      for (const [t, scr] of leaving) {
        window.clearTimeout(t);
        scr.dispose();
      }
      leaving.clear();
      current?.dispose();
      current = null;
      unbindSounds();
      backdrop.dispose();
      shell.remove();
    };
    const onAbort = (): void => {
      finished = true;
      dismissTooltip();
      // 标题页 / 选英雄页打开的设置、操作说明对话框都挂在 shell 里
      closeAllDialogs(shell);
      release();
    };
    opts.signal?.addEventListener('abort', onAbort);

    const swap = (next: MenuScreen): void => {
      dismissTooltip();
      const prev = current;
      current = next;
      if (prev) {
        // 先停掉旧界面的输入，播完退场动画再真正释放（3D 预览在淡出期间仍可见）
        prev.freeze();
        prev.el.classList.add('is-leaving');
        const t = window.setTimeout(() => {
          leaving.delete(t);
          prev.dispose();
          prev.el.remove();
        }, 260);
        leaving.set(t, prev);
      }
      shell.appendChild(next.el);
    };

    const showTitle = (): void => {
      if (finished) return;
      swap(createTitleScreen({ host, root: shell, onStart: showSelect }));
    };

    const showSelect = (): void => {
      if (finished) return;
      swap(
        createSelectScreen({
          host,
          root: shell,
          initial: choice,
          onBack: showTitle,
          onChange: (c) => {
            choice = c;
            saveChoice(c);
          },
          onConfirm: finish,
        }),
      );
    };

    const finish = (c: MatchChoice): void => {
      if (finished) return;
      finished = true;
      choice = c;
      saveChoice(c);
      dismissTooltip();
      current?.freeze();
      shell.style.transition = 'opacity 0.35s linear';
      shell.style.opacity = '0';
      shell.style.pointerEvents = 'none';
      finishTimer = window.setTimeout(() => {
        release();
        resolve(c);
      }, 360);
    };

    // 浏览器要求先有用户手势才能出声：bindUiSounds 在首次按下时 unlock，这里先把曲目排上
    host.audio.setMusic('menu');
    if (opts.start === 'select') showSelect();
    else showTitle();
  });
}
