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

  const toggleRow = (label: string, iconSvg: string, key: 'showFps' | 'cameraShake'): { row: HTMLElement; toggle: Toggle } => {
    const toggle = createToggle({ value: o.get()[key], label, onChange: (v) => o.update({ [key]: v }) });
    const row = h('div', 'sf-field sf-settings__row', h('span', 'sf-field__label', icon(iconSvg), label), h('span', 'sf-field__ctl', toggle.el));
    // 整行都是点击热区（开关本身偏小）
    row.dataset.sfSnd = 'click';
    row.addEventListener('click', () => toggle.flip());
    return { row, toggle };
  };
  const fps = toggleRow('显示帧率', uiIcon('fps'), 'showFps');
  const shake = toggleRow('镜头震动', uiIcon('shake'), 'cameraShake');

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
    // 画质是按设备探测出来的，不随「恢复默认」改动
    const { quality: _keep, ...rest } = DEFAULT_SETTINGS;
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
