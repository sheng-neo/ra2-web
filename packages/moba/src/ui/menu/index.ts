/**
 * 主菜单流程：标题页 ↔ 选英雄页，共用一张动态背景；点「开始对战」后 resolve。
 */
import { HEROES } from '../../core/data/heroes';
import type { Difficulty, HeroId } from '../../core/types';
import type { MatchChoice, MenuHost } from '../api';
import { bindUiSounds, dismissTooltip, ensureTheme, h } from '../theme';
import { createBackdrop } from './backdrop';
import { createSelectScreen } from './select';
import { createTitleScreen } from './title';
import type { MenuScreen } from './title';

const CHOICE_KEY = 'starfall.lastChoice.v1';
const DEFAULT_CHOICE: MatchChoice = { heroId: 'chijin', difficulty: 'normal' };

/** 记住上次选的英雄与难度（沙箱里读写失败就算了） */
function loadChoice(): MatchChoice {
  try {
    const raw = localStorage.getItem(CHOICE_KEY);
    if (raw) {
      const o = JSON.parse(raw) as { heroId?: unknown; difficulty?: unknown } | null;
      const heroId = o && typeof o.heroId === 'string' && o.heroId in HEROES ? (o.heroId as HeroId) : DEFAULT_CHOICE.heroId;
      const d = o?.difficulty;
      const difficulty: Difficulty = d === 'easy' || d === 'normal' || d === 'hard' ? d : DEFAULT_CHOICE.difficulty;
      return { heroId, difficulty };
    }
  } catch {
    // 用默认值
  }
  return { ...DEFAULT_CHOICE };
}

function saveChoice(c: MatchChoice): void {
  try {
    localStorage.setItem(CHOICE_KEY, JSON.stringify(c));
  } catch {
    // 忽略
  }
}

export interface MainMenuOptions {
  /** 直接从选英雄页开始（「再来一局」后想换英雄时可用） */
  start?: 'title' | 'select';
}

/**
 * 显示主菜单。标题页 → 选英雄(含对手难度) → 点「开始对战」后 resolve(MatchChoice)。
 * resolve 前已彻底清理自己创建的 DOM、事件、动画帧与 3D 预览。
 */
export function showMainMenu(root: HTMLElement, host: MenuHost, opts: MainMenuOptions = {}): Promise<MatchChoice> {
  ensureTheme();
  return new Promise((resolve) => {
    const shell = h('div', 'sf-root sf-menu-root');
    const backdrop = createBackdrop(shell, 'menu');
    const unbindSounds = bindUiSounds(shell, host.audio);
    root.appendChild(shell);

    let choice = loadChoice();
    let current: MenuScreen | null = null;
    let finished = false;
    const leaving = new Map<number, MenuScreen>();

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

    const showTitle = (): void => swap(createTitleScreen({ host, root: shell, onStart: showSelect }));

    const showSelect = (): void =>
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
      window.setTimeout(() => {
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
        resolve(c);
      }, 360);
    };

    // 浏览器要求先有用户手势才能出声：bindUiSounds 在首次按下时 unlock，这里先把曲目排上
    host.audio.setMusic('menu');
    if (opts.start === 'select') showSelect();
    else showTitle();
  });
}
