/**
 * 界面画廊（仅开发用）：/dev/menu.html?screen=…
 *
 *   title | select     从标题页 / 选英雄页开始走完整流程（菜单 → 加载 → 结算 → 循环）
 *   loading            加载页        &hero=xingli&difficulty=hard&p=0.6(固定进度；缺省为自动走完)
 *   result             结算页        &hero=chijin&win=1|0
 *   settings           设置对话框    &mode=menu|match
 *   howto              操作说明      &tab=keys|touch
 *   icons              全部图标网格
 *   components         设计系统组件一览
 *
 * 宿主用桩实现：头像/立绘/音频优先动态加载真实模块（../render、../audio），不存在或出错就用占位。
 */
import type { AudioEngine } from '../audio/api';
import { HEROES, HERO_IDS } from '../core/data/heroes';
import { ITEM_LIST } from '../core/data/items';
import { createMockState } from '../core/mock';
import type { BuffId, Difficulty, HeroId, HeroRole, PlayerTeam, RoleLane, SummonerSlot } from '../core/types';
import type { HeroPreview } from '../render/api';
import type { MatchChoice, MenuHost, Settings } from '../ui/api';
import {
  BUFF_META, LANE_NAMES, UI_ICON_NAMES, attachTooltip, bindUiSounds, buffIcon, createBackdrop, createBadge, createButton, createIconButton, createProgress, createSegmented, createSlider,
  createSlot, createTabs, createToggle, ensureTheme, h, icon, injectStyle, itemIcon, laneIcon, loadSettings, openDialog, openHowToDialog, openSettingsDialog, roleIcon,
  saveSettings, sfCss, showLoading, showMainMenu, showResult, skillIcon, summonerIcon, u, uiIcon,
} from '../ui/index';
import type { HeroIconSlot } from '../ui/index';

const app = document.getElementById('app') as HTMLElement;
const params = new URLSearchParams(location.search);
const screen = params.get('screen') ?? 'title';
const isHero = (v: string | null): v is HeroId => v !== null && v in HEROES;
const isDifficulty = (v: string | null): v is Difficulty => v === 'easy' || v === 'normal' || v === 'hard';

ensureTheme();

// ───────────────────────── 宿主桩 ─────────────────────────

interface RenderModule {
  createHeroPreview?: (canvas: HTMLCanvasElement, heroId: HeroId) => HeroPreview;
  getHeroPortrait?: (heroId: HeroId) => string;
}
interface AudioModule {
  createAudio?: () => AudioEngine;
}

/** 用 glob 而不是字面量 import()：目标文件不存在时得到空表，而不是让 Vite 报解析错误 */
async function tryLoad<T>(loaders: Record<string, () => Promise<unknown>>): Promise<T | null> {
  const load = Object.values(loaders)[0];
  if (!load || params.get('stub') === '1') return null;
  try {
    return (await load()) as T;
  } catch (err) {
    console.info('[menu-gallery] 模块加载失败，改用占位实现：', err);
    return null;
  }
}

function stubAudio(): AudioEngine {
  const log = params.get('log') === '1';
  const say = (...a: unknown[]): void => {
    if (log) console.info('[audio]', ...a);
  };
  return {
    unlock: () => say('unlock'),
    handleEvents: () => undefined,
    update: () => undefined,
    ui: (s) => say('ui', s),
    setMusic: (t) => say('music', t),
    setVolumes: (v) => say('volumes', v),
    dispose: () => undefined,
  };
}

/** 占位头像：英雄主题色背景 + 概括的半身剪影 */
const portraitCache = new Map<HeroId, string>();
function placeholderPortrait(heroId: HeroId): string {
  const cached = portraitCache.get(heroId);
  if (cached) return cached;
  const p = HEROES[heroId].palette;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  if (!g) return '';
  const bg = g.createRadialGradient(64, 40, 6, 64, 64, 96);
  bg.addColorStop(0, p.glow);
  bg.addColorStop(0.35, p.primary);
  bg.addColorStop(1, p.secondary === '#f1ecff' || p.secondary === '#f3f0e2' ? '#1a2440' : p.secondary);
  g.fillStyle = bg;
  g.fillRect(0, 0, 128, 128);
  // 肩
  g.fillStyle = 'rgba(8, 12, 26, 0.82)';
  g.beginPath();
  g.ellipse(64, 132, 56, 46, 0, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = p.accent;
  g.lineWidth = 3;
  g.beginPath();
  g.ellipse(64, 132, 56, 46, 0, Math.PI * 1.12, Math.PI * 1.88);
  g.stroke();
  // 头
  g.fillStyle = 'rgba(8, 12, 26, 0.9)';
  g.beginPath();
  g.ellipse(64, 60, 25, 29, 0, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = p.glow;
  g.lineWidth = 2.5;
  g.beginPath();
  g.ellipse(64, 60, 25, 29, 0, Math.PI * 1.05, Math.PI * 1.75);
  g.stroke();
  // 眼
  g.fillStyle = p.glow;
  g.shadowColor = p.glow;
  g.shadowBlur = 8;
  g.fillRect(50, 58, 10, 3.5);
  g.fillRect(68, 58, 10, 3.5);
  const url = c.toDataURL('image/png');
  portraitCache.set(heroId, url);
  return url;
}

/** 占位立绘：在 2D 画布上画展台与剪影，响应 setHero/play，便于检查布局与交互 */
function placeholderPreview(canvas: HTMLCanvasElement, initial: HeroId): HeroPreview {
  const g = canvas.getContext('2d');
  let heroId = initial;
  let anim = '';
  let animT = 0;
  let raf = 0;
  let t0 = performance.now();
  const resize = (): void => {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.max(2, Math.round(canvas.clientWidth * dpr));
    canvas.height = Math.max(2, Math.round(canvas.clientHeight * dpr));
  };
  const frame = (now: number): void => {
    raf = requestAnimationFrame(frame);
    if (!g) return;
    const dt = (now - t0) / 1000;
    t0 = now;
    animT = Math.max(0, animT - dt);
    const W = canvas.width;
    const H = canvas.height;
    const p = HEROES[heroId].palette;
    g.clearRect(0, 0, W, H);
    const cx = W / 2;
    const base = H * 0.78;
    const s = Math.min(W, H) / 400;
    const bob = Math.sin(now / 600) * 4 * s;
    const kick = animT > 0 ? Math.sin(animT * 12) * 10 * s : 0;
    // 展台
    g.fillStyle = 'rgba(8, 12, 26, 0.85)';
    g.beginPath();
    g.ellipse(cx, base, 120 * s, 30 * s, 0, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = p.glow;
    g.lineWidth = 2 * s;
    g.beginPath();
    g.ellipse(cx, base, 120 * s, 30 * s, 0, 0, Math.PI * 2);
    g.stroke();
    // 剪影
    const grad = g.createLinearGradient(0, base - 250 * s, 0, base);
    grad.addColorStop(0, p.primary);
    grad.addColorStop(1, p.secondary);
    g.fillStyle = grad;
    g.beginPath();
    g.ellipse(cx + kick, base - 205 * s + bob, 26 * s, 30 * s, 0, 0, Math.PI * 2);
    g.fill();
    g.beginPath();
    g.moveTo(cx - 62 * s + kick, base - 160 * s + bob);
    g.quadraticCurveTo(cx + kick, base - 190 * s + bob, cx + 62 * s + kick, base - 160 * s + bob);
    g.lineTo(cx + 40 * s, base - 4 * s);
    g.lineTo(cx - 40 * s, base - 4 * s);
    g.closePath();
    g.fill();
    g.strokeStyle = p.accent;
    g.lineWidth = 3 * s;
    g.stroke();
    if (animT > 0) {
      g.strokeStyle = p.glow;
      g.globalAlpha = animT;
      g.lineWidth = 5 * s;
      g.beginPath();
      g.ellipse(cx, base, (130 + (1 - animT) * 80) * s, (34 + (1 - animT) * 22) * s, 0, 0, Math.PI * 2);
      g.stroke();
      g.globalAlpha = 1;
    }
    g.fillStyle = 'rgba(179, 193, 224, 0.75)';
    g.font = `${Math.round(13 * Math.max(1, s * 1.4))}px sans-serif`;
    g.textAlign = 'center';
    g.fillText(`立绘占位 · ${HEROES[heroId].name}${animT > 0 ? ` · ${anim}` : ''}`, cx, base + 52 * s);
  };
  resize();
  raf = requestAnimationFrame(frame);
  return {
    setHero: (id) => {
      heroId = id;
    },
    play: (a) => {
      anim = a;
      animT = 1;
    },
    resize,
    dispose: () => cancelAnimationFrame(raf),
  };
}

async function createHost(): Promise<MenuHost> {
  const [renderMod, audioMod] = await Promise.all([
    tryLoad<RenderModule>(import.meta.glob('../render/index.ts')),
    tryLoad<AudioModule>(import.meta.glob('../audio/index.ts')),
  ]);
  let audio: AudioEngine;
  try {
    audio = audioMod?.createAudio ? audioMod.createAudio() : stubAudio();
  } catch {
    audio = stubAudio();
  }
  const settings: Settings = loadSettings();
  const applyVolumes = (): void => audio.setVolumes({ master: settings.masterVolume, sfx: settings.sfxVolume, music: settings.musicVolume });
  applyVolumes();
  return {
    getSettings: () => settings,
    updateSettings: (patch) => {
      Object.assign(settings, patch);
      saveSettings(settings);
      applyVolumes();
    },
    audio,
    portrait: (id) => {
      try {
        const real = renderMod?.getHeroPortrait?.(id);
        if (real) return real;
      } catch {
        // 用占位
      }
      return placeholderPortrait(id);
    },
    createHeroPreview: (canvas, id) => {
      if (renderMod?.createHeroPreview) {
        try {
          return renderMod.createHeroPreview(canvas, id);
        } catch (err) {
          console.info('[menu-gallery] 真实立绘创建失败，改用占位：', err);
        }
      }
      return placeholderPreview(canvas, id);
    },
  };
}

// ───────────────────────── 流程屏 ─────────────────────────

async function runFlow(host: MenuHost, start: 'title' | 'select'): Promise<void> {
  let from: 'title' | 'select' = start;
  for (;;) {
    const choice = await showMainMenu(app, host, { start: from });
    const loading = showLoading(app, choice, host);
    const steps = ['生成地形与植被…', '构建英雄模型…', '编译着色器…', '布置兵线与野怪…', '即将开战'];
    for (let i = 0; i <= 20; i++) {
      loading.setProgress(i / 20, steps[Math.min(steps.length - 1, Math.floor(i / 4.2))]);
      await new Promise((r) => setTimeout(r, 160));
    }
    loading.close();
    const state = createMockState(choice.heroId);
    state.over = true;
    state.winner = Math.random() > 0.4 ? 0 : 1;
    fillResultData(state, choice.heroId);
    const next = await showResult(app, state, host);
    from = next === 'again' ? 'select' : 'title';
  }
}

/** 把假状态补成「打完一局」的样子：满装备、像样的战绩与时长 */
function fillResultData(state: ReturnType<typeof createMockState>, _hero: HeroId): void {
  state.time = 754;
  let seed = 11;
  const rnd = (): number => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };
  const kills: [number, number] = [0, 0];
  state.heroes.forEach((x, i) => {
    const def = HEROES[x.heroId];
    const carry = def.role === 'marksman' || def.role === 'assassin' || def.role === 'mage';
    x.level = 12 + Math.floor(rnd() * 4);
    x.kills = Math.floor(rnd() * (carry ? 11 : 5)) + (x.isPlayer ? 4 : 0);
    x.deaths = Math.floor(rnd() * 7);
    x.assists = Math.floor(rnd() * 12) + (def.role === 'tank' ? 6 : 0);
    x.cs = 60 + Math.floor(rnd() * 120);
    x.goldEarned = 7200 + Math.floor(rnd() * 6400);
    x.dmgDealt = (carry ? 16000 : 8000) + Math.floor(rnd() * 14000);
    x.dmgTaken = (def.role === 'tank' ? 26000 : def.role === 'fighter' ? 17000 : 8000) + Math.floor(rnd() * 9000);
    x.dmgTower = Math.floor(rnd() * 5200);
    const n = 3 + Math.floor(rnd() * 4);
    const build = def.build.filter((id) => id !== 'boots');
    x.items = [0, 1, 2, 3, 4, 5].map((k) => (k < Math.min(n, build.length) ? build[k] : null));
    kills[x.team] += x.kills;
    if (i === 0) x.isPlayer = true;
  });
  state.teams[0].kills = kills[0];
  state.teams[1].kills = kills[1];
  const w = state.winner ?? 0;
  state.teams[w].towersDestroyed = 7;
  state.teams[w === 0 ? 1 : 0].towersDestroyed = 3;
  for (const t of [0, 1] as PlayerTeam[]) state.teams[t].gold = state.heroes.filter((x) => x.team === t).reduce((a, x) => a + x.goldEarned, 0);
}

async function showLoadingOnly(host: MenuHost): Promise<void> {
  const hero = params.get('hero');
  const diff = params.get('difficulty');
  const choice: MatchChoice = { heroId: isHero(hero) ? hero : 'xingli', difficulty: isDifficulty(diff) ? diff : 'normal' };
  const loading = showLoading(app, choice, host);
  const fixed = params.get('p');
  if (fixed !== null) {
    loading.setProgress(Number(fixed), '构建英雄模型…');
    return;
  }
  for (let i = 0; i <= 50; i++) {
    loading.setProgress(i / 50, i < 15 ? '生成地形与植被…' : i < 32 ? '构建英雄模型…' : i < 46 ? '编译着色器…' : '即将开战');
    await new Promise((r) => setTimeout(r, 200));
  }
}

async function showResultOnly(host: MenuHost): Promise<void> {
  const hero = params.get('hero');
  const heroId: HeroId = isHero(hero) ? hero : 'chijin';
  const state = createMockState(heroId);
  state.over = true;
  state.winner = params.get('win') === '0' ? 1 : 0;
  fillResultData(state, heroId);
  const r = await showResult(app, state, host);
  app.appendChild(h('div', 'sf-root dv-page', h('p', null, `showResult → ${r}`)));
}

function showDialogOnly(host: MenuHost, which: 'settings' | 'howto'): void {
  const shell = h('div', 'sf-root');
  createBackdrop(shell);
  bindUiSounds(shell, host.audio);
  app.appendChild(shell);
  if (which === 'settings') {
    const mode = params.get('mode') === 'match' ? 'match' : 'menu';
    openSettingsDialog(shell, { get: host.getSettings, update: host.updateSettings, audio: host.audio, mode, onQuit: () => console.info('quit'), onResume: () => console.info('resume') });
  } else {
    const d = openHowToDialog(shell);
    if (params.get('tab') === 'touch') (d.el.querySelectorAll('.sf-tab')[1] as HTMLElement | undefined)?.click();
    if (params.get('tab') === 'keys') (d.el.querySelectorAll('.sf-tab')[0] as HTMLElement | undefined)?.click();
  }
}

// ───────────────────────── 图标 / 组件 ─────────────────────────

injectStyle(
  'sf-dev-gallery',
  sfCss(`
.dv-page { position: absolute; inset: 0; padding: 20u 24u 40u; background: radial-gradient(ellipse at 50% 0%, #142248, #070a14 70%); }
.dv-h { margin: 18u 0 10u; }
.dv-grid { display: flex; flex-wrap: wrap; gap: 14px 12px; }
.dv-cell { display: flex; flex-direction: column; align-items: center; gap: 5px; width: 104px; text-align: center; font-size: 12px; color: var(--sf-c-text-2); line-height: 1.3; }
.dv-cell small { color: var(--sf-c-text-4); font-size: 10px; }
.dv-pair { display: flex; align-items: flex-end; gap: 8px; }
.dv-glyph { display: grid; place-items: center; width: 44px; height: 44px; border-radius: 8px; background: var(--sf-bg-inset); box-shadow: inset 0 0 0 1px var(--sf-c-line); color: var(--sf-c-gold-200); }
.dv-glyph .sf-i { width: 26px; height: 26px; }
.dv-glyph--sm { width: 26px; height: 26px; color: var(--sf-c-text); }
.dv-glyph--sm .sf-i { width: 16px; height: 16px; }
.dv-row { display: flex; flex-wrap: wrap; align-items: center; gap: 12u 14u; margin-bottom: 12u; }
.dv-panels { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 320u), 1fr)); gap: 22u; }
.dv-panel { padding: 18u 20u; display: flex; flex-direction: column; gap: 12u; }
`),
);

const SLOT_NAMES: Record<HeroIconSlot, string> = { passive: '被动', s1: '一技能', s2: '二技能', ult: '大招' };
const ROLE_NAMES: Record<HeroRole, string> = { tank: '坦克', fighter: '战士', mage: '法师', marksman: '射手', assassin: '刺客' };

function slotPx(svg: string, px: number, round = false): HTMLElement {
  return createSlot(svg, { size: `${px}px`, round });
}

/** 徽章图标：96px 方 + 40px 方 + 40px 圆，三种呈现一起看 */
function badgeCell(svg: () => string, name: string, sub: string): HTMLElement {
  return h('div', 'dv-cell', h('div', 'dv-pair', slotPx(svg(), 96)), h('div', 'dv-pair', slotPx(svg(), 40), slotPx(svg(), 40, true)), name, h('small', null, sub));
}

function glyphCell(svg: string, name: string): HTMLElement {
  return h('div', 'dv-cell', h('div', 'dv-pair', h('span', 'dv-glyph', icon(svg)), h('span', 'dv-glyph dv-glyph--sm', icon(svg))), name);
}

function showIcons(): void {
  const page = h('div', 'sf-root dv-page sf-scroll');
  const section = (title: string, cells: HTMLElement[]): void => {
    page.append(h('h3', 'sf-heading dv-h', title), h('div', 'dv-grid', ...cells));
  };
  for (const id of HERO_IDS) {
    const def = HEROES[id];
    section(
      `${def.name} · ${def.title}`,
      (['passive', 's1', 's2', 'ult'] as HeroIconSlot[]).map((s) => badgeCell(() => skillIcon(id, s), s === 'passive' ? def.passive.name : def.skills[s].name, SLOT_NAMES[s])),
    );
  }
  const SUMMONER_NAMES: Record<SummonerSlot, string> = { recall: '回城', heal: '恢复', flash: '闪现' };
  section('召唤师技能', (['recall', 'heal', 'flash'] as SummonerSlot[]).map((s) => badgeCell(() => summonerIcon(s), SUMMONER_NAMES[s], s)));
  section('装备', ITEM_LIST.map((it) => badgeCell(() => itemIcon(it.id), it.name, it.id)));
  section('状态', (Object.keys(BUFF_META) as BuffId[]).map((b) => badgeCell(() => buffIcon(b), BUFF_META[b].name, `${b} · ${BUFF_META[b].kind}`)));
  section('通用图标', UI_ICON_NAMES.map((n) => glyphCell(uiIcon(n), n)));
  section('定位', (Object.keys(ROLE_NAMES) as HeroRole[]).map((r) => glyphCell(roleIcon(r), ROLE_NAMES[r])));
  section('分路', (Object.keys(LANE_NAMES) as RoleLane[]).map((l) => glyphCell(laneIcon(l), LANE_NAMES[l])));
  app.appendChild(page);
}

function showComponents(host: MenuHost): void {
  const page = h('div', 'sf-root dv-page sf-scroll');
  bindUiSounds(page, host.audio);
  const row = (...c: (HTMLElement | string)[]): HTMLElement => h('div', 'dv-row', ...c);
  const panel = (title: string, ...c: HTMLElement[]): HTMLElement => h('div', 'sf-panel dv-panel', h('h3', 'sf-heading', title), ...c);

  const disabled = createButton({ label: '禁用', variant: 'primary' });
  disabled.disabled = true;
  const progress = createProgress();
  progress.set(0.62);
  const tipTarget = createBadge('悬停 / 点按看提示', 'cyan', uiIcon('info'));
  tipTarget.tabIndex = 0;
  attachTooltip(tipTarget, () => '<div class="sf-tip__title"><span>提示浮层</span><span class="sf-tip__meta">tooltip</span></div><div>鼠标悬停、键盘聚焦或触控点按时出现，自动避开屏幕边缘。</div>');
  const sliderVal = h('span', 'sf-field__val sf-num', '60');

  page.append(
    h('h1', 'sf-title sf-metal', '设计系统'),
    h('p', 'sf-dim', '深海军蓝半透明面板 · 细金色星轨描边 · 青色高光'),
    h('div', 'dv-h'),
    h(
      'div',
      'dv-panels',
      panel(
        '按钮',
        row(createButton({ label: '开始对战', variant: 'primary', size: 'lg', pulse: true })),
        row(createButton({ label: '主要', variant: 'primary' }), createButton({ label: '次要', icon: uiIcon('settings') }), createButton({ label: '幽灵', variant: 'ghost' })),
        row(createButton({ label: '危险', variant: 'danger', icon: uiIcon('home') }), disabled, createButton({ label: '小号', size: 'sm' })),
        row(
          createIconButton({ icon: uiIcon('back'), label: '返回' }),
          createIconButton({ icon: uiIcon('settings'), label: '设置' }),
          createIconButton({ icon: uiIcon('shop'), label: '商店' }),
          createIconButton({ icon: uiIcon('close'), label: '关闭', quiet: true }),
        ),
      ),
      panel(
        '选择控件',
        row(createSegmented({ options: [{ value: 'a', label: '简单' }, { value: 'b', label: '普通' }, { value: 'c', label: '困难' }], value: 'b', onChange: () => undefined }).el),
        row(createTabs({ tabs: [{ id: 'a', label: '键盘鼠标', icon: uiIcon('keyboard') }, { id: 'b', label: '触控', icon: uiIcon('touch') }], value: 'a', onChange: () => undefined }).el),
        h(
          'div',
          'sf-field',
          h('span', 'sf-field__label', icon(uiIcon('volume')), '主音量'),
          h('span', 'sf-field__ctl', createSlider({ value: 0.6, onInput: (v) => (sliderVal.textContent = String(Math.round(v * 100))) }).el, sliderVal),
        ),
        h('div', 'sf-field', h('span', 'sf-field__label', icon(uiIcon('fps')), '显示帧率'), h('span', 'sf-field__ctl', createToggle({ value: true, onChange: () => undefined }).el, createToggle({ value: false, onChange: () => undefined }).el)),
      ),
      panel(
        '徽标 / 进度 / 键帽',
        row(createBadge('金色'), createBadge('青色', 'cyan'), createBadge('蓝方', 'blue'), createBadge('红方', 'red'), createBadge('成功', 'green'), createBadge('紫色', 'violet'), createBadge('弱化', 'mute')),
        row(createBadge('MVP', 'solid', uiIcon('crown')), createBadge('你', 'me'), tipTarget),
        progress.el,
        row(h('span', 'sf-kbd', 'Q'), h('span', 'sf-kbd', 'E'), h('span', 'sf-kbd', 'R'), h('span', 'sf-kbd', 'Space'), h('span', 'sf-kbd', 'Esc')),
      ),
      panel(
        '图标槽 / 标题字',
        row(
          createSlot(skillIcon('xingli', 's1'), { size: u(56) }),
          createSlot(skillIcon('chijin', 'ult'), { size: u(56), round: true }),
          createSlot(itemIcon('starfall_blade'), { size: u(48) }),
          createSlot(skillIcon('yeque', 's2'), { size: u(48), cls: 'is-active' }),
          createSlot(null, { size: u(48) }),
        ),
        h('h2', 'sf-title sf-metal', '金属渐变标题'),
        h('h2', 'sf-subtitle sf-metal sf-metal--steel', '冷钢渐变副标题'),
        row(
          createButton({
            label: '打开对话框',
            onClick: () =>
              openDialog(page, {
                title: '对话框',
                content: h('p', null, '面板 + 遮罩；点遮罩、按 Esc 或点右上角关闭。'),
                footer: [createButton({ label: '取消', variant: 'ghost' }), createButton({ label: '确定', variant: 'primary' })],
              }),
          }),
        ),
      ),
    ),
  );
  app.appendChild(page);
}

// ───────────────────────── 入口 ─────────────────────────

async function main(): Promise<void> {
  if (screen === 'icons') {
    showIcons();
    return;
  }
  const host = await createHost();
  switch (screen) {
    case 'components':
      showComponents(host);
      break;
    case 'loading':
      await showLoadingOnly(host);
      break;
    case 'result':
      await showResultOnly(host);
      break;
    case 'settings':
    case 'howto':
      showDialogOnly(host, screen);
      break;
    case 'select':
      await runFlow(host, 'select');
      break;
    default:
      await runFlow(host, 'title');
  }
}

void main();
