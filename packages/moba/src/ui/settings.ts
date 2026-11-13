/**
 * 设置：持久化(localStorage，带内存兜底) + 可复用的设置面板组件。
 * 面板通过回调与宿主交互，主菜单与对局内 HUD 共用同一份实现。
 */
import type { AudioEngine } from '../audio/api';
import type { Quality } from '../render/api';
import { DEFAULT_SETTINGS } from './api';
import type { Settings } from './api';
import { uiIcon } from './icons';
import { storageGetJson, storageSet } from './storage';
import { createButton, createSegmented, createSlider, createToggle, ensureTheme, h, icon, injectStyle, openDialog, sfCss, u } from './theme';
import type { Dialog, Segmented, Slider, Toggle } from './theme';

const STORAGE_KEY = 'starfall.settings.v1';

const clamp01 = (v: unknown, fallback: number): number => (typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : fallback);
const isQuality = (v: unknown): v is Quality => v === 'low' || v === 'medium' || v === 'high';

/**
 * 读取设置：DEFAULT_SETTINGS ← defaults(宿主给的设备默认值，如 detectQuality()) ← 已存的值。
 * 页面可能在沙箱 iframe 里，localStorage 不可用时退回本次会话的内存副本(见 storage.ts)，再没有就用默认值。
 */
export function loadSettings(defaults?: Partial<Settings>): Settings {
  const out: Settings = { ...DEFAULT_SETTINGS, ...defaults };
  const o = storageGetJson(STORAGE_KEY) as Partial<Record<keyof Settings, unknown>> | null;
  if (o && typeof o === 'object') {
    if (isQuality(o.quality)) out.quality = o.quality;
    out.masterVolume = clamp01(o.masterVolume, out.masterVolume);
    out.sfxVolume = clamp01(o.sfxVolume, out.sfxVolume);
    out.musicVolume = clamp01(o.musicVolume, out.musicVolume);
    if (typeof o.showFps === 'boolean') out.showFps = o.showFps;
    if (typeof o.cameraShake === 'boolean') out.cameraShake = o.cameraShake;
    // 第二阶段新增的三项：老存档里没有，缺了就保持默认值(都是开)
    if (typeof o.autoBuy === 'boolean') out.autoBuy = o.autoBuy;
    if (typeof o.tutorial === 'boolean') out.tutorial = o.tutorial;
    if (typeof o.objectiveHints === 'boolean') out.objectiveHints = o.objectiveHints;
  }
  return out;
}

export function saveSettings(s: Settings): void {
  storageSet(STORAGE_KEY, JSON.stringify(s));
}

// ───────────────────────── 设置面板 ─────────────────────────

export interface SettingsPanelOptions {
  /** 读取当前设置（通常是 host.getSettings） */
  get(): Settings;
  /** 应用并持久化改动（通常是 host.updateSettings） */
  update(patch: Partial<Settings>): void;
  /** 'menu' 主菜单内；'match' 对局内（多出「继续游戏」「返回主菜单」） */
  mode?: 'menu' | 'match';
  /** 拖完音量滑块时播放一声试听 */
  audio?: Pick<AudioEngine, 'ui'>;
  /** 点「继续游戏」/「完成」 */
  onResume?(): void;
  /** 对局内确认「返回主菜单」 */
  onQuit?(): void;
  /**
   * 对局内点了新手引导那一行的「重看」(此时 tutorial 已经是开)：让引导从第一步重新开始。
   * 不给这个回调时，面板退而把 tutorial 开关「先关、0.7 秒后再开」一次——只认开关跳变的界面同样会重来。
   */
  onReplayTutorial?(): void;
  /**
   * 对局内「自动出装」那一行的临时说明：返回非空字符串时用它(警告色)替换平时的说明小字。
   * 用于「卖了推荐装、本局已关闭」——此时开关显示的是本局实际状态(关)，要告诉玩家为什么关着、怎么打开。
   */
  autoBuyNote?(): string | null;
}

export interface SettingsPanel {
  /** 表单主体 */
  el: HTMLElement;
  /** 底部按钮行（恢复默认 / 完成 / 返回主菜单…），由调用方决定放哪 */
  footer: HTMLElement;
  /** 外部改了设置后调用，刷新控件显示 */
  refresh(): void;
  dispose(): void;
}

/** 「重看」新手引导时，开关先关掉多久再打开(毫秒)：要长过界面轮询设置的间隔，引导才看得到这次「关 → 开」 */
const REPLAY_PULSE_MS = 700;

const QUALITY_HINT: Record<Quality, string> = {
  low: '关闭阴影与后期特效，帧率最高，适合低端设备或省电。',
  medium: '中等精度阴影与轻量泛光，画面与流畅度均衡。',
  high: '高精度阴影、泛光、调色与抗锯齿，画面最佳。',
};

const CSS = sfCss(`
.sf-settings { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, max(250px, 300u)), 1fr)); gap: 16u 36u; }
.sf-settings__group { display: flex; flex-direction: column; gap: 2u; min-width: 0; }
.sf-settings__group > .sf-heading { margin-bottom: 6u; }
.sf-settings .sf-field { grid-template-columns: minmax(max(92px, 104u), max-content) 1fr; }
.sf-settings__row { cursor: pointer; border-radius: 6u; }
.sf-settings__quality { margin-top: 2u; }
/* 带说明小字的开关行：说明紧贴在行下面 */
.sf-settings__row.has-hint { min-height: max(34px, 38u); }
.sf-settings__row.has-hint + .sf-field__hint { margin: -1u 0 8u; }
.sf-settings .sf-field__hint.is-warn { color: var(--sf-c-amber); }
/* 「重看」：做成带描边的小按钮(原来是贴在开关左边的一行灰色小字，像说明文字，手机上也不好点) */
.sf-settings__replay {
  flex: none; display: inline-grid; place-items: center; min-width: max(44px, 48u); min-height: max(32px, 34u); padding: 0 11u; border-radius: 99px;
  font-size: var(--sf-fs-sm); font-weight: 700; line-height: 1; color: var(--sf-c-text); white-space: nowrap; text-decoration: none;
  background: rgba(150, 178, 235, 0.12); box-shadow: inset 0 0 0 1px rgba(150, 178, 235, 0.55);
}
@media (hover: hover) { .sf-settings__replay:hover { color: var(--sf-c-text); background: rgba(150, 178, 235, 0.24); } }
.sf-settings__replay:active { transform: scale(0.95); }
.sf-settings__foot { display: flex; align-items: center; gap: 12u; width: 100%; }
.sf-settings__foot > .sf-link { margin-right: auto; }
.sf-dialog--settings .sf-dialog__foot { padding-top: 12u; padding-bottom: 14u; }
@media (orientation: portrait) {
  .sf-settings__foot { flex-wrap: wrap; justify-content: flex-end; }
  .sf-settings__foot > .sf-link { flex-basis: 100%; justify-content: flex-start; }
}
`);

export function createSettingsPanel(o: SettingsPanelOptions): SettingsPanel {
  ensureTheme();
  injectStyle('sf-settings', CSS);
  const mode = o.mode ?? 'menu';
  const pct = (v: number): string => `${Math.round(v * 100)}`;

  // ── 画面 ──
  const qualityHint = h('p', 'sf-field__hint');
  const quality: Segmented<Quality> = createSegmented<Quality>({
    options: [
      { value: 'low', label: '低' },
      { value: 'medium', label: '中' },
      { value: 'high', label: '高' },
    ],
    value: o.get().quality,
    label: '画质',
    onChange: (v) => {
      o.update({ quality: v });
      qualityHint.textContent = QUALITY_HINT[v];
    },
  });

  // 「重看」新手引导：引导开着时也能从第一步重来。宿主给了 onReplayTutorial 就直接调它；
  // 没给的话只能靠 tutorial 这个开关传话，做成「先关、稍后再开」的一次脉冲
  let replayTimer = 0;
  const cancelReplay = (): void => {
    window.clearTimeout(replayTimer);
    replayTimer = 0;
  };

  type ToggleKey = 'showFps' | 'cameraShake' | 'autoBuy' | 'objectiveHints' | 'tutorial';
  interface ToggleRow {
    row: HTMLElement;
    toggle: Toggle;
    /** 行下面的说明小字 */
    hint: HTMLElement | null;
  }
  const toggleRow = (label: string, iconSvg: string, key: ToggleKey, hint?: string, extra?: HTMLElement | null): ToggleRow => {
    const toggle = createToggle({
      value: o.get()[key],
      label,
      onChange: (v) => {
        // 玩家亲手拨了引导开关：以这次为准，还没完成的「重看」脉冲作废
        if (key === 'tutorial') cancelReplay();
        o.update({ [key]: v });
        if (key === 'autoBuy') syncAutoBuyNote();
      },
    });
    const row = h('div', `sf-field sf-settings__row${hint ? ' has-hint' : ''}`, h('span', 'sf-field__label', icon(iconSvg), label), h('span', 'sf-field__ctl', extra, toggle.el));
    // 整行都是点击热区（开关本身偏小）
    row.dataset.sfSnd = 'click';
    row.addEventListener('click', () => toggle.flip());
    return { row, toggle, hint: hint ? h('p', 'sf-field__hint', hint) : null };
  };
  const fps = toggleRow('显示帧率', uiIcon('fps'), 'showFps');
  const shake = toggleRow('镜头震动', uiIcon('shake'), 'cameraShake');

  // ── 对战辅助 ──
  const replay = mode === 'match' ? h('button', 'sf-link sf-settings__replay', '重看') : null;
  const AUTO_BUY_HINT = '金币够了自动购买推荐出装的下一件，阵亡时也会买。';
  const autoBuy = toggleRow('自动出装', uiIcon('shop'), 'autoBuy', AUTO_BUY_HINT);
  function syncAutoBuyNote(): void {
    if (!autoBuy.hint) return;
    const note = o.autoBuyNote?.() ?? null;
    autoBuy.hint.textContent = note ?? AUTO_BUY_HINT;
    autoBuy.hint.classList.toggle('is-warn', note !== null);
  }
  const hints = toggleRow('当前目标提示', uiIcon('target'), 'objectiveHints', '在屏幕上方提示现在该做什么。');
  const tutorial = toggleRow('新手引导', uiIcon('info'), 'tutorial', '开局一步步教操作；打完一局后自动关闭。', replay);
  if (replay) {
    replay.type = 'button';
    replay.dataset.sfSnd = 'confirm';
    replay.setAttribute('aria-label', '从第一步重看新手引导');
    replay.addEventListener('click', (ev) => {
      // 别让这次点击冒到整行上把开关翻掉
      ev.stopPropagation();
      cancelReplay();
      const finish = (): void => {
        replayTimer = 0;
        o.update({ tutorial: true });
      };
      if (!o.get().tutorial) finish(); // 引导关着：打开就是从头开始
      else if (o.onReplayTutorial) o.onReplayTutorial();
      else {
        o.update({ tutorial: false });
        // 面板关了也要把开关打回去，所以这个定时器不随 dispose 取消
        replayTimer = window.setTimeout(finish, REPLAY_PULSE_MS);
      }
      tutorial.toggle.set(true);
      replay.textContent = '已从头开始';
      window.setTimeout(() => {
        replay.textContent = '重看';
      }, 1600);
    });
  }

  // ── 声音 ──
  const sliderRow = (label: string, iconSvg: string, key: 'masterVolume' | 'sfxVolume' | 'musicVolume'): { row: HTMLElement; slider: Slider; val: HTMLElement } => {
    const val = h('span', 'sf-field__val sf-num', pct(o.get()[key]));
    const slider = createSlider({
      value: o.get()[key],
      label,
      onInput: (v) => {
        val.textContent = pct(v);
        o.update({ [key]: v });
      },
      onCommit: () => {
        if (key !== 'musicVolume') o.audio?.ui('select');
      },
    });
    const row = h('div', 'sf-field', h('span', 'sf-field__label', icon(iconSvg), label), h('span', 'sf-field__ctl', slider.el, val));
    return { row, slider, val };
  };
  const master = sliderRow('主音量', uiIcon('volume'), 'masterVolume');
  const sfx = sliderRow('音效', uiIcon('sfx'), 'sfxVolume');
  const music = sliderRow('音乐', uiIcon('music'), 'musicVolume');

  const el = h(
    'div',
    'sf-settings',
    h('section', 'sf-settings__group sf-settings__group--assist', h('h3', 'sf-heading', '对战辅助'), autoBuy.row, autoBuy.hint, hints.row, hints.hint, tutorial.row, tutorial.hint),
    h(
      'section',
      'sf-settings__group',
      h('h3', 'sf-heading', '画面'),
      h('div', 'sf-field', h('span', 'sf-field__label', icon(uiIcon('quality')), '画质'), h('span', 'sf-field__ctl sf-settings__quality', quality.el)),
      qualityHint,
      fps.row,
      shake.row,
    ),
    h('section', 'sf-settings__group', h('h3', 'sf-heading', '声音'), master.row, sfx.row, music.row),
  );

  const refresh = (): void => {
    const s = o.get();
    quality.set(s.quality);
    qualityHint.textContent = QUALITY_HINT[s.quality];
    fps.toggle.set(s.showFps);
    shake.toggle.set(s.cameraShake);
    autoBuy.toggle.set(s.autoBuy);
    syncAutoBuyNote();
    hints.toggle.set(s.objectiveHints);
    // 「重看」的脉冲进行中(开关被临时关着)：界面上保持「开」
    tutorial.toggle.set(s.tutorial || replayTimer !== 0);
    master.slider.set(s.masterVolume);
    master.val.textContent = pct(s.masterVolume);
    sfx.slider.set(s.sfxVolume);
    sfx.val.textContent = pct(s.sfxVolume);
    music.slider.set(s.musicVolume);
    music.val.textContent = pct(s.musicVolume);
  };
  refresh();

  // ── 底部按钮 ──
  const reset = h('button', 'sf-link', icon(uiIcon('again')), '恢复默认');
  reset.type = 'button';
  reset.dataset.sfSnd = 'click';
  reset.addEventListener('click', () => {
    // 画质是按设备探测出来的，不随「恢复默认」改动；新手引导也不动——老玩家点一下恢复默认不该又被教一遍
    const { quality: _keepQuality, tutorial: _keepTutorial, ...rest } = DEFAULT_SETTINGS;
    o.update(rest);
    refresh();
  });

  const footer = h('div', 'sf-settings__foot', reset);
  let quitTimer = 0;
  if (mode === 'match') {
    const quit = createButton({ label: '返回主菜单', icon: uiIcon('home'), variant: 'ghost', sound: 'back' });
    const quitLabel = quit.querySelector('.sf-btn__label') as HTMLElement;
    let armed = false;
    // 两段式确认：第一次点只是「上膛」，3 秒内再点才真正退出，避免误触放弃对局
    quit.addEventListener('click', () => {
      if (armed) {
        window.clearTimeout(quitTimer);
        o.onQuit?.();
        return;
      }
      armed = true;
      quit.classList.remove('sf-btn--ghost');
      quit.classList.add('sf-btn--danger');
      quitLabel.textContent = '再点一次确认退出';
      quitTimer = window.setTimeout(() => {
        armed = false;
        quit.classList.add('sf-btn--ghost');
        quit.classList.remove('sf-btn--danger');
        quitLabel.textContent = '返回主菜单';
      }, 3000);
    });
    footer.append(quit, createButton({ label: '继续游戏', icon: uiIcon('play'), variant: 'primary', sound: 'confirm', onClick: () => o.onResume?.() }));
  } else {
    footer.append(createButton({ label: '完成', variant: 'primary', sound: 'confirm', onClick: () => o.onResume?.() }));
  }

  return {
    el,
    footer,
    refresh,
    dispose: () => window.clearTimeout(quitTimer),
  };
}

export interface SettingsDialogOptions extends SettingsPanelOptions {
  /** 对话框标题；缺省：对局内「游戏暂停」，菜单内「设置」 */
  title?: string;
  /** 对话框以任何方式关闭后调用（对局内可在此恢复游戏） */
  onClose?(): void;
}

/**
 * 以对话框形式打开设置。root 应为 .sf-root 容器。
 * 「完成/继续游戏」会关闭对话框；对局内的「返回主菜单」确认后先关闭再回调 onQuit。
 */
export function openSettingsDialog(root: HTMLElement, o: SettingsDialogOptions): Dialog {
  const holder: { dialog: Dialog | null } = { dialog: null };
  const panel = createSettingsPanel({
    ...o,
    onResume: () => {
      holder.dialog?.close();
      o.onResume?.();
    },
    onQuit: () => {
      holder.dialog?.close();
      o.onQuit?.();
    },
  });
  const dialog = openDialog(root, {
    title: o.title ?? (o.mode === 'match' ? '游戏暂停' : '设置'),
    content: panel.el,
    footer: panel.footer,
    width: u(780),
    cls: 'sf-dialog--settings',
    onClose: () => {
      panel.dispose();
      o.onClose?.();
    },
  });
  holder.dialog = dialog;
  return dialog;
}
