/**
 * 音频画廊与自检页(仅开发服务器)：
 * - 试听每个音效键 / 播报(己方、敌方变体) / UI 音 / 配乐轨与强度；
 * - 用假对局状态把每种 GameEvent 走一遍、模拟团战压力；
 * - 离线渲染自检：逐键峰值/响度/时长/频段/NaN/爆音，配乐 ≥30 秒电平稳定性，团战压限，结果挂到 window.__audioReport。
 * URL 参数：?auto=1 自动跑离线自检；?rt=1 自动跑实时冒烟测试(结果在 window.__audioRT)；?check=sfx,music,stress,limiter 只跑部分。
 */
import { createAudioWithDebug } from '../audio';
import type { MusicTrack, UiSound } from '../audio/api';
import { checkAllScores, checkAllSfx, checkLimiter, checkMix, checkMusic, checkStress, renderGame } from '../audio/offline';
import type { GameRow, LimiterRow, MixRow, MusicRow, ScoreRow, SfxRow, StressRow } from '../audio/offline';
import { SFX, SFX_KEYS } from '../audio/sfx';
import type { SfxCat } from '../audio/sfx';
import { HEROES, HERO_IDS } from '../core/data/heroes';
import { createMockState } from '../core/mock';
import { TICK_DT } from '../core/types';
import type { AbilitySlot, AnnounceKey, AreaVisual, FxKey, GameEvent, HeroId, ProjectileVisual, SkillSlot, Unit, Vec2 } from '../core/types';
import { createWorld } from '../core/world';

interface AudioReport {
  done: boolean;
  progress: string;
  summary: Record<string, number | string>;
  sfx: SfxRow[];
  music: Omit<MusicRow, 'spec'>[];
  stress: StressRow | null;
  limiter: LimiterRow | null;
  /** 配乐混音表(?check=mix 时才生成) */
  mix: MixRow[];
  /** 真实对局片段的离线混音(?check=match 时才生成) */
  match: (GameRow & { name: string; intensity: number[] })[];
  /** 主旋律自动听写：调度器奏出的音与乐谱是否一致 */
  score: ScoreRow[];
  trimTable: string;
}

interface RtReport {
  done: boolean;
  steps: { name: string; ok: boolean; info: string }[];
  errors: string[];
}

declare global {
  interface Window {
    __audioReport?: AudioReport;
    __audioRT?: RtReport;
  }
}

const engine = createAudioWithDebug();
const state = createMockState('chijin');
const params = new URLSearchParams(location.search);

// ───────────────────────── DOM 小工具 ─────────────────────────

function h<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Record<string, string> = {}, ...kids: (Node | string)[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const k in attrs) {
    if (k === 'class') el.className = attrs[k];
    else el.setAttribute(k, attrs[k]);
  }
  for (const c of kids) el.append(c);
  return el;
}

function section(title: string, note = '', cls = ''): HTMLElement {
  const s = h('section', { class: cls });
  s.append(h('h2', {}, title, h('small', {}, note)));
  return s;
}

function btn(label: string, onClick: () => void, cls = '', sub = ''): HTMLButtonElement {
  const b = h('button', { class: cls }, label);
  if (sub) b.append(h('small', {}, sub));
  b.addEventListener('click', () => {
    engine.unlock();
    onClick();
  });
  return b;
}

function slider(label: string, min: number, max: number, value: number, step: number, onInput: (v: number) => void, fmt: (v: number) => string = (v) => v.toFixed(2)): { row: HTMLElement; input: HTMLInputElement } {
  const input = h('input', { type: 'range', min: String(min), max: String(max), step: String(step), value: String(value) });
  const out = h('output', {}, fmt(value));
  input.addEventListener('input', () => {
    const v = Number(input.value);
    out.textContent = fmt(v);
    onInput(v);
  });
  return { row: h('div', { class: 'row' }, h('label', {}, label), input, out), input };
}

const app = document.getElementById('app') as HTMLElement;
const statEl = document.getElementById('stat') as HTMLElement;
const left = h('div', { style: 'display:grid;gap:14px;min-width:0' });
const side = h('div', { class: 'side' });
app.append(left, side);

// ───────────────────────── 右侧：混音 / 配乐 / 空间 ─────────────────────────

const vols = { master: 0.8, sfx: 0.9, music: 0.5 };
const spatial = { dist: 0, dir: 0 };

/** 与引擎里的距离衰减/声像公式一致，用于在画廊里试听「远处的声音」 */
function spatialOpts(): { gain: number; pan?: number; lp?: number } {
  const d = spatial.dist;
  if (d <= 0 && spatial.dir === 0) return { gain: 1 };
  const k = d <= 3 ? 1 : Math.max(0, 1 - (d - 3) / 23);
  return {
    gain: Math.pow(k, 1.6),
    pan: Math.max(-1, Math.min(1, (spatial.dir * Math.max(d, 6)) / 13)) * 0.85,
    lp: d > 8 ? 17000 * Math.pow(0.13, Math.min(1, (d - 8) / 18)) : 0,
  };
}

{
  const s = section('混音', '主 / 音效 / 配乐');
  const apply = (): void => engine.setVolumes(vols);
  s.append(
    slider('主音量', 0, 1, vols.master, 0.01, (v) => { vols.master = v; apply(); }).row,
    slider('音效', 0, 1, vols.sfx, 0.01, (v) => { vols.sfx = v; apply(); }).row,
    slider('配乐', 0, 1, vols.music, 0.01, (v) => { vols.music = v; apply(); }).row,
  );
  apply();
  side.append(s);
}

{
  const s = section('配乐', '切换时交叉淡变');
  const tracks: [MusicTrack, string][] = [['none', '停止'], ['menu', '菜单'], ['battle', '对局'], ['victory', '胜利'], ['defeat', '失败']];
  const row = h('div', { class: 'grid' });
  const buttons: HTMLButtonElement[] = [];
  tracks.forEach(([t, name]) => {
    const b = btn(name, () => {
      engine.setMusic(t);
      buttons.forEach((x) => x.classList.toggle('on', x === b));
    }, 'gold');
    buttons.push(b);
    row.append(b);
  });
  s.append(row);
  let auto = true;
  let I = 0;
  let T = 0;
  const sync = (): void => engine.debug.override(auto ? null : I, auto ? null : T);
  const autoBtn = btn('强度：自动(跟随战况)', () => {
    auto = !auto;
    autoBtn.textContent = auto ? '强度：自动(跟随战况)' : '强度：手动';
    autoBtn.classList.toggle('on', !auto);
    sync();
  });
  s.append(
    h('div', { class: 'row' }, autoBtn),
    slider('战斗强度', 0, 1, 0, 0.01, (v) => { I = v; auto = false; autoBtn.textContent = '强度：手动'; autoBtn.classList.add('on'); sync(); }).row,
    slider('紧张度', 0, 1, 0, 0.01, (v) => { T = v; auto = false; autoBtn.textContent = '强度：手动'; autoBtn.classList.add('on'); sync(); }).row,
  );
  side.append(s);
}

{
  const s = section('空间化试听', '作用于左侧按钮');
  s.append(
    slider('距离(米)', 0, 30, 0, 0.5, (v) => { spatial.dist = v; }, (v) => v.toFixed(1)).row,
    slider('方位', -1, 1, 0, 0.05, (v) => { spatial.dir = v; }, (v) => (v === 0 ? '中' : v < 0 ? `左${(-v).toFixed(2)}` : `右${v.toFixed(2)}`)).row,
  );
  side.append(s);
}

// ───────────────────────── 左侧：按分类的试听按钮 ─────────────────────────

const CATS: SfxCat[] = ['英雄普攻', '小兵与野怪', '防御塔', '通用命中', '技能施放', '技能特效', '技能弹道', '区域铺底', '状态与系统', '播报', '界面'];
for (const cat of CATS) {
  const keys = SFX_KEYS.filter((k) => SFX[k].cat === cat);
  const s = section(cat, `${keys.length} 个键`);
  const g = h('div', { class: 'grid' });
  for (const key of keys) {
    const def = SFX[key];
    const play = (v: number): void => engine.debug.play(key, { ...spatialOpts(), v });
    if (def.variants) {
      def.variants.forEach((x, i) => g.append(btn(`${def.label}`, () => play(x.v), i === 1 && cat === '播报' ? 'dark' : '', x.label)));
    } else {
      g.append(btn(def.label, () => play(0), '', key));
    }
  }
  s.append(g);
  left.append(s);
}

// ───────────────────────── 事件模拟 ─────────────────────────

const player = state.heroes[0];
const near = (r: number): Vec2 => {
  const a = Math.random() * Math.PI * 2;
  const d = Math.random() * r;
  return { x: player.pos.x + Math.cos(a) * d, y: player.pos.y + Math.sin(a) * d };
};
const FX_KEYS = SFX_KEYS.filter((k) => k.startsWith('fx_')).map((k) => k.slice(3) as FxKey);
const ANN_KEYS = SFX_KEYS.filter((k) => k.startsWith('ann_')).map((k) => k.slice(4) as AnnounceKey);
const PROJ: ProjectileVisual[] = ['xingli_basic', 'xingli_s1', 'fengling_basic', 'fengling_s1', 'yeque_s2', 'minion_ranged', 'minion_siege', 'tower_bolt', 'core_bolt', 'monster_spit'];
const AREAS: AreaVisual[] = ['telegraph', 'panyue_s2_aura', 'panyue_ult_fissure', 'chijin_ult_spin', 'xingli_s2_well', 'xingli_ult_storm', 'fengling_ult_rain', 'fountain_zone'];
const SLOTS: SkillSlot[] = ['s1', 's2', 'ult', 'recall', 'heal', 'flash'];
let nextId = 50000;

function unitsOf(kind: Unit['kind']): Unit[] {
  return state.units.filter((u) => u.kind === kind);
}

/** 把每一种事件(每个 FxKey / 弹道 / 区域 / 播报…)都发一遍，分成若干批依次送入引擎 */
function walkthrough(): GameEvent[][] {
  const out: GameEvent[][] = [];
  const pid = state.playerId;
  const foe = state.heroes[5];
  for (const hero of state.heroes) {
    const tgt = hero.team === 0 ? foe : player;
    out.push([{ type: 'attack', unitId: hero.id, targetId: tgt.id }]);
    out.push([
      { type: 'damage', targetId: tgt.id, sourceId: hero.id, amount: 180, dtype: 'physical', crit: false, pos: tgt.pos, skill: false },
      { type: 'fx', key: 'hit_physical', pos: tgt.pos, team: hero.team, unitId: hero.id, targetId: tgt.id },
    ]);
  }
  for (const u of [...unitsOf('minion').slice(0, 8), ...unitsOf('monster').slice(0, 4), ...unitsOf('tower').slice(0, 2), ...unitsOf('core')]) {
    out.push([{ type: 'attack', unitId: u.id, targetId: pid }, { type: 'damage', targetId: pid, sourceId: u.id, amount: 60, dtype: 'physical', crit: false, pos: player.pos, skill: false }]);
  }
  for (const visual of PROJ) {
    const id = nextId++;
    const pos = near(6);
    out.push([{ type: 'projectileSpawn', id, visual, pos, ownerId: pid }]);
    out.push([{ type: 'projectileHit', id, visual, pos: near(4), targetId: foe.id }, { type: 'projectileEnd', id, visual, pos }]);
    const id2 = nextId++;
    out.push([{ type: 'projectileSpawn', id: id2, visual, pos, ownerId: foe.id }, { type: 'projectileHit', id: id2, visual, pos: player.pos, targetId: pid }]);
    out.push([{ type: 'projectileEnd', id: nextId++, visual, pos: near(5) }]);
  }
  for (const heroId of HERO_IDS) {
    for (const slot of SLOTS) {
      out.push([{ type: 'skillCast', unitId: pid, heroId, slot, pos: player.pos, dir: { x: 1, y: 0 }, targetPos: near(5), targetId: -1 }]);
    }
  }
  for (const key of FX_KEYS) {
    // 巨龙吐息的两个键带扇形字段，下面单独走一遍
    if (key === 'drake_breath_warn' || key === 'drake_breath') continue;
    out.push([{ type: 'fx', key, pos: near(8), team: Math.random() < 0.5 ? 0 : 1, radius: 3, value: 40 }]);
  }
  // 河道巨龙吐息：预警(盯着玩家) → 喷吐；再来一轮预警后巨龙被打死(预警声应被收掉)
  const drake = unitsOf('monster').find((u) => u.kind === 'monster' && u.monsterType === 'abyss_drake');
  const dpos = { x: player.pos.x - 5, y: player.pos.y };
  const breath = { pos: dpos, team: 2 as const, unitId: drake?.id, dir: { x: 1, y: 0 }, radius: 7.5, angle: Math.PI / 3 };
  out.push([{ type: 'fx', key: 'drake_breath_warn', ...breath, targetId: pid, value: 0.9 }]);
  out.push([], [], [], [{ type: 'fx', key: 'drake_breath', ...breath, value: 0.8 }]);
  out.push([], [], [], [], [{ type: 'fx', key: 'drake_breath_warn', ...breath, targetId: foe.id, value: 0.9 }]);
  if (drake) out.push([{ type: 'death', unitId: drake.id, kind: 'monster', team: 2, killerId: pid, pos: dpos }, { type: 'epicSlain', monsterType: 'abyss_drake', team: 0, pos: dpos }]);
  for (const visual of AREAS) {
    const id = nextId++;
    const pos = near(6);
    state.areas.push({ id, visual, team: Math.random() < 0.5 ? 0 : 1, ownerId: pid, pos, radius: 4, age: 0, duration: 2, followUnitId: -1 });
    out.push([{ type: 'areaSpawn', id, visual, pos, radius: 4, duration: 2 }]);
    out.push([{ type: 'areaEnd', id, visual, pos }]);
  }
  const minion = unitsOf('minion')[0];
  const monster = unitsOf('monster')[0];
  const tower = unitsOf('tower')[0];
  const core = unitsOf('core')[1];
  out.push([{ type: 'death', unitId: minion.id, kind: 'minion', team: 1, killerId: pid, pos: near(4) }, { type: 'gold', unitId: pid, amount: 42, pos: near(3), reason: 'lasthit' }, { type: 'fx', key: 'gold_gain', pos: near(3), team: 0, value: 42 }]);
  out.push([{ type: 'death', unitId: monster.id, kind: 'monster', team: 2, killerId: pid, pos: near(4) }, { type: 'gold', unitId: pid, amount: 70, pos: near(3), reason: 'monster' }]);
  // 每种普通野怪各刷新、倒下一次(各有各的变体音色)
  for (const type of ['mossback', 'glimwing', 'frost_golem', 'ember_golem'] as const) {
    const mo = unitsOf('monster').find((u) => u.kind === 'monster' && u.monsterType === type);
    out.push([{ type: 'monsterSpawn', campId: 1, monsterType: type, pos: near(5) }]);
    if (mo) out.push([{ type: 'attack', unitId: mo.id, targetId: pid }], [{ type: 'death', unitId: mo.id, kind: 'monster', team: 2, killerId: pid, pos: near(4) }]);
  }
  out.push([{ type: 'death', unitId: foe.id, kind: 'hero', team: 1, killerId: pid, pos: near(4) }, { type: 'heroKill', victimId: foe.id, killerId: pid, assistIds: [], multiKill: 1, streak: 1, firstBlood: false, shutdown: false, bounty: 220 }, { type: 'gold', unitId: pid, amount: 220, pos: player.pos, reason: 'kill' }]);
  out.push([{ type: 'death', unitId: state.heroes[1].id, kind: 'hero', team: 0, killerId: foe.id, pos: near(6) }, { type: 'heroKill', victimId: state.heroes[1].id, killerId: foe.id, assistIds: [], multiKill: 1, streak: 1, firstBlood: false, shutdown: false, bounty: 220 }]);
  out.push([{ type: 'heroKill', victimId: state.heroes[6].id, killerId: state.heroes[2].id, assistIds: [pid], multiKill: 1, streak: 1, firstBlood: false, shutdown: false, bounty: 220 }, { type: 'gold', unitId: pid, amount: 110, pos: player.pos, reason: 'assist' }]);
  out.push([{ type: 'death', unitId: tower.id, kind: 'tower', team: 1, killerId: pid, pos: near(8) }, { type: 'towerDestroyed', unitId: tower.id, team: 1, lane: 'mid', tier: 1, pos: near(8) }, { type: 'fx', key: 'tower_destroyed', pos: near(8), team: 1 }, { type: 'gold', unitId: pid, amount: 120, pos: player.pos, reason: 'tower' }]);
  out.push([{ type: 'levelUp', unitId: pid, level: 6 }, { type: 'fx', key: 'level_up', pos: player.pos, team: 0, unitId: pid }]);
  out.push([{ type: 'respawn', unitId: pid, pos: player.pos }, { type: 'fx', key: 'respawn', pos: player.pos, team: 0, unitId: pid }]);
  out.push([{ type: 'itemBought', unitId: pid, itemId: 'boots' }]);
  // 自动出装买入：同一个提示音放轻
  out.push([], [], [{ type: 'itemBought', unitId: pid, itemId: 'boots_fury', auto: true }]);
  out.push([{ type: 'heal', targetId: pid, amount: 400, pos: player.pos }]);
  out.push([{ type: 'reject', unitId: pid, reason: 'mana' }]);
  out.push([{ type: 'waveSpawn', wave: 3 }]);
  out.push([{ type: 'monsterSpawn', campId: 12, monsterType: 'abyss_drake', pos: { x: -24, y: -24 } }]);
  out.push([{ type: 'monsterSpawn', campId: 13, monsterType: 'star_colossus', pos: { x: 24, y: 24 } }]);
  out.push([{ type: 'epicSlain', monsterType: 'abyss_drake', team: 0, pos: { x: -24, y: -24 } }]);
  out.push([{ type: 'epicSlain', monsterType: 'star_colossus', team: 1, pos: { x: 24, y: 24 } }]);
  for (const key of ANN_KEYS) {
    out.push([{ type: 'announce', key, team: 0 }]);
    out.push([{ type: 'announce', key, team: 1 }]);
  }
  out.push([{ type: 'damage', targetId: pid, sourceId: foe.id, amount: 900, dtype: 'magic', crit: false, pos: player.pos, skill: true }]);
  out.push([{ type: 'damage', targetId: foe.id, sourceId: pid, amount: 500, dtype: 'magic', crit: false, pos: foe.pos, skill: true }]);
  out.push([{ type: 'death', unitId: pid, kind: 'hero', team: 0, killerId: foe.id, pos: player.pos }]);
  out.push([{ type: 'death', unitId: core.id, kind: 'core', team: 1, killerId: pid, pos: core.pos }, { type: 'fx', key: 'core_destroyed', pos: core.pos, team: 1 }, { type: 'announce', key: 'victory', team: 0 }, { type: 'gameOver', winner: 0 }]);
  return out;
}

/** 一帧里的随机团战事件(平均每帧 perFrame 个) */
function fightBatch(perFrame: number): GameEvent[] {
  const ev: GameEvent[] = [];
  const pid = state.playerId;
  let n = Math.floor(perFrame + Math.random());
  while (n-- > 0) {
    const r = Math.random();
    const a = state.heroes[Math.floor(Math.random() * 10)];
    const b = state.heroes[Math.floor(Math.random() * 10)];
    if (r < 0.2) ev.push({ type: 'attack', unitId: a.id, targetId: b.id });
    else if (r < 0.45) {
      ev.push({ type: 'damage', targetId: b.id, sourceId: a.id, amount: 80 + Math.random() * 300, dtype: 'physical', crit: Math.random() < 0.15, pos: b.pos, skill: Math.random() < 0.3 });
      ev.push({ type: 'fx', key: Math.random() < 0.15 ? 'hit_crit' : Math.random() < 0.5 ? 'hit_physical' : 'hit_magic', pos: b.pos, team: a.team });
    } else if (r < 0.65) ev.push({ type: 'fx', key: FX_KEYS[Math.floor(Math.random() * FX_KEYS.length)], pos: near(10), team: a.team, unitId: a.id });
    else if (r < 0.75) {
      const slot: AbilitySlot = Math.random() < 0.4 ? 's1' : Math.random() < 0.6 ? 's2' : 'ult';
      ev.push({ type: 'skillCast', unitId: a.id, heroId: a.heroId, slot, pos: a.pos, dir: { x: 1, y: 0 }, targetPos: b.pos, targetId: b.id });
    } else if (r < 0.9) {
      const visual = PROJ[Math.floor(Math.random() * PROJ.length)];
      const id = nextId++;
      ev.push({ type: 'projectileSpawn', id, visual, pos: a.pos, ownerId: a.id });
      ev.push({ type: 'projectileHit', id, visual, pos: b.pos, targetId: b.id });
      ev.push({ type: 'projectileEnd', id, visual, pos: b.pos });
    } else {
      const ms = unitsOf('minion');
      const mn = ms[Math.floor(Math.random() * ms.length)];
      ev.push({ type: 'attack', unitId: mn.id, targetId: pid });
      ev.push({ type: 'damage', targetId: pid, sourceId: mn.id, amount: 40, dtype: 'physical', crit: false, pos: player.pos, skill: false });
    }
  }
  return ev;
}

let simTimer = 0;
function runBatches(batches: GameEvent[][], gapMs: number, onDone?: () => void): void {
  window.clearInterval(simTimer);
  let i = 0;
  simTimer = window.setInterval(() => {
    if (i >= batches.length) {
      window.clearInterval(simTimer);
      onDone?.();
      return;
    }
    engine.handleEvents(batches[i++], state);
  }, gapMs);
}

function runFight(seconds: number, perFrame: number, onDone?: () => void): void {
  window.clearInterval(simTimer);
  const end = performance.now() + seconds * 1000;
  simTimer = window.setInterval(() => {
    if (performance.now() >= end) {
      window.clearInterval(simTimer);
      onDone?.();
      return;
    }
    engine.handleEvents(fightBatch(perFrame), state);
  }, 16);
}

{
  const s = section('事件模拟', '假对局状态 → handleEvents / update');
  s.append(h('div', { class: 'grid' },
    btn('逐个事件走一遍', () => runBatches(walkthrough(), 220), 'gold'),
    btn('模拟团战 6 秒', () => runFight(6, 1), 'gold', '≈60 事件/秒'),
    btn('高压团战 6 秒', () => runFight(6, 3), 'gold', '≈180 事件/秒'),
    btn('停止', () => window.clearInterval(simTimer)),
  ));
  side.append(s);
}

// 每帧 update：推进配乐强度并回收节点，同时刷新顶部状态
let lastT = performance.now();
function frame(): void {
  const now = performance.now();
  engine.update(state, (now - lastT) / 1000);
  lastT = now;
  const st = engine.debug.stats();
  statEl.innerHTML = `上下文 <b>${st.state}</b> · 时间 <b>${st.time.toFixed(1)}</b>s · 发声 <b>${st.voices}</b>(峰值 ${st.peakVoices}) · 配乐音符 <b>${st.notes}</b> · 已播 <b>${st.played}</b> / 限流 ${st.throttled} / 超限 ${st.capped} / 让位 ${st.stolen} · 配乐 <b>${st.track}</b> 强度 <b>${st.intensity.toFixed(2)}</b> 紧张 <b>${st.tension.toFixed(2)}</b>`;
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// ───────────────────────── 离线自检报告 ─────────────────────────

const reportSec = section('离线渲染自检', 'OfflineAudioContext 逐键渲染 → 峰值 / 响度 / 时长 / 频段 / NaN / 爆音', 'full');
const reportBody = h('div');
const progressEl = h('span', { class: 'pill' }, '未运行');
reportSec.append(
  h('div', { class: 'summary' },
    btn('运行离线自检', () => void runCheck(), 'gold'),
    progressEl,
  ),
  reportBody,
);
app.append(reportSec);

function spark(env: number[], w = 144, hgt = 20, color = '#6fe3ff'): HTMLCanvasElement {
  const c = h('canvas', { width: String(w), height: String(hgt) });
  const g = c.getContext('2d');
  if (!g) return c;
  g.fillStyle = '#0a1124';
  g.fillRect(0, 0, w, hgt);
  g.fillStyle = color;
  const bw = w / env.length;
  for (let i = 0; i < env.length; i++) {
    // 开方刻度：小幅度的尾音也看得见
    const v = Math.sqrt(Math.min(1, env[i])) * hgt;
    g.fillRect(i * bw, (hgt - v) / 2, Math.max(1, bw - 0.5), Math.max(0.5, v));
  }
  return c;
}

function bands(low: number, mid: number, high: number): HTMLElement {
  const b = h('span', { class: 'bar', title: `低 ${(low * 100).toFixed(0)}% / 中 ${(mid * 100).toFixed(0)}% / 高 ${(high * 100).toFixed(0)}%` });
  const seg = (v: number, color: string): HTMLElement => h('i', { style: `width:${(v * 100).toFixed(1)}%;background:${color}` });
  b.append(seg(low, '#c9a961'), seg(mid, '#6fe3a0'), seg(high, '#6fe3ff'));
  return b;
}

function specCanvas(m: MusicRow, w = 700, hgt = 200): HTMLCanvasElement {
  const c = h('canvas', { width: String(w), height: String(hgt) });
  const g = c.getContext('2d');
  if (!g) return c;
  const frames = m.spec.length;
  const nb = m.spec[0]?.length ?? 1;
  const img = g.createImageData(w, hgt);
  for (let x = 0; x < w; x++) {
    const row = m.spec[Math.min(frames - 1, Math.floor((x / w) * frames))];
    for (let y = 0; y < hgt; y++) {
      const v = row ? row[Math.min(nb - 1, Math.floor(((hgt - 1 - y) / hgt) * nb))] : 0;
      const o = (y * w + x) * 4;
      // 深蓝 → 青 → 金 的色带
      img.data[o] = Math.round(255 * Math.max(0, v * 1.6 - 0.6));
      img.data[o + 1] = Math.round(255 * Math.min(1, v * 1.25));
      img.data[o + 2] = Math.round(255 * Math.min(1, 0.15 + v * 0.9) * (1 - Math.max(0, v - 0.75) * 2));
      img.data[o + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  // 每秒 RMS 折线(-50dB ~ 0dB)
  g.strokeStyle = '#ffffff';
  g.lineWidth = 1;
  g.beginPath();
  m.secDb.forEach((d, i) => {
    const x = ((i + 0.5) / m.secDb.length) * w;
    const y = hgt - Math.max(0, Math.min(1, (d + 50) / 50)) * hgt;
    if (i === 0) g.moveTo(x, y);
    else g.lineTo(x, y);
  });
  g.stroke();
  return c;
}

function renderReport(r: AudioReport, music: MusicRow[]): void {
  reportBody.replaceChildren();
  const sum = h('div', { class: 'summary' });
  const pill = (text: string, cls = ''): void => {
    sum.append(h('span', { class: `pill ${cls}` }, text));
  };
  const bad = r.sfx.filter((x) => x.issues.length > 0);
  if (r.sfx.length) pill(`音效 ${r.sfx.length} 项 · 异常 ${bad.length}`, bad.length ? 'bad' : 'ok');
  const mbad = music.filter((x) => x.issues.length > 0);
  if (music.length) pill(`配乐 ${music.length} 段 · 异常 ${mbad.length}`, mbad.length ? 'bad' : 'ok');
  if (r.stress) pill(`团战压限 峰值 ${r.stress.peak.toFixed(3)} · 异常 ${r.stress.issues.length}`, r.stress.issues.length ? 'bad' : 'ok');
  if (r.limiter) pill(`总线小信号增益 ${r.limiter.smallGain.toFixed(3)} · 最大输出 ${r.limiter.maxOut.toFixed(3)}`, r.limiter.maxOut <= 1 ? 'ok' : 'bad');
  reportBody.append(sum);

  if (music.length || r.stress || r.limiter || r.match.length) {
    const cards = h('div', { class: 'cards' });
    for (const m of music) {
      const card = h('div', { class: 'card' });
      card.append(
        h('h3', {}, m.name, h('span', { style: `color:${m.issues.length ? '#ff6b6b' : '#6fe3a0'}` }, m.issues.length ? m.issues.join('，') : '通过')),
        specCanvas(m),
        h('p', {}, '峰值 ', h('b', {}, m.peak.toFixed(3)), ' · RMS ', h('b', {}, `${m.rmsDb.toFixed(1)} dB`), ' · 每秒 RMS ', h('b', {}, `${m.minSecDb.toFixed(1)} ~ ${m.maxSecDb.toFixed(1)} dB`)),
        h('p', {}, '最长静音 ', h('b', {}, `${m.silence.toFixed(2)} s`), ' · 最大采样差 ', h('b', {}, m.maxStep.toFixed(3)), ' · 左右差 ', h('b', {}, `${m.balance.toFixed(1)} dB`), ' · 单声道合并 ', h('b', {}, `${m.monoDb.toFixed(1)} dB`), ' · 频段 ', bands(m.low, m.mid, m.high)),
      );
      cards.append(card);
    }
    for (const g of r.match) {
      const card = h('div', { class: 'card' });
      card.append(
        h('h3', {}, `真实对局 · ${g.name}`, h('span', { style: `color:${g.issues.length ? '#ff6b6b' : '#6fe3a0'}` }, g.issues.length ? g.issues.join('，') : '通过')),
        spark(g.env, 700, 80, '#6fe3a0'),
        h('p', {}, '峰值 ', h('b', {}, g.peak.toFixed(3)), ' · RMS ', h('b', {}, `${g.rmsDb.toFixed(1)} dB`), ' · 频段 ', bands(g.low, g.mid, g.high), ' · 发声 ', h('b', {}, String(g.played)), ' · 限流 ', h('b', {}, String(g.throttled)), ' · 超限 ', h('b', {}, String(g.capped)), ' · 让位 ', h('b', {}, String(g.stolen)), ' · 同时发声峰值 ', h('b', {}, String(g.peakVoices))),
        spark(g.intensity, 700, 24, '#e6c988'),
        h('p', {}, '↑ 配乐强度(每秒采样) · 最常播放：', g.byKey.slice(0, 12).map(([k, n]) => `${SFX[k as keyof typeof SFX]?.label ?? k}×${n}`).join('，')),
      );
      cards.append(card);
    }
    if (r.score.length) {
      const card = h('div', { class: 'card' });
      const bad = r.score.some((x) => x.matched < x.notes);
      card.append(h('h3', {}, '主旋律自动听写(单独渲染旋律通道 → 逐音检测音高 → 对照乐谱)', h('span', { style: `color:${bad ? '#ff6b6b' : '#6fe3a0'}` }, bad ? '有出入' : '全部一致')));
      for (const x of r.score) {
        card.append(h('p', {}, `${x.name}：`, h('b', {}, `${x.matched}/${x.notes}`), x.misses.length ? ` · 不一致(步/期望/实测)：${x.misses.map((m) => m.join('/')).join('，')}` : ''));
      }
      cards.append(card);
    }
    if (r.stress) {
      const st = r.stress;
      const card = h('div', { class: 'card' });
      card.append(
        h('h3', {}, `模拟团战 ${st.seconds}s(${st.events} 事件 + 满强度配乐)`, h('span', { style: `color:${st.issues.length ? '#ff6b6b' : '#6fe3a0'}` }, st.issues.length ? st.issues.join('，') : '通过')),
        spark(st.env, 700, 80, '#e6c988'),
        h('p', {}, '压限后峰值 ', h('b', {}, st.peak.toFixed(3)), ' · RMS ', h('b', {}, `${st.rmsDb.toFixed(1)} dB`)),
        h('p', {}, '发声 ', h('b', {}, String(st.played)), ' · 限流 ', h('b', {}, String(st.throttled)), ' · 超限丢弃 ', h('b', {}, String(st.capped)), ' · 让位 ', h('b', {}, String(st.stolen)), ' · 同时发声峰值 ', h('b', {}, String(st.peakVoices)), ' · 存活节点组峰值 ', h('b', {}, String(st.maxLive)), ' · 结束残留 ', h('b', {}, String(st.endLive)), ' · 渲染耗时 ', h('b', {}, `${(st.renderMs / 1000).toFixed(2)}s / ${(st.seconds + 2.5).toFixed(1)}s 音频`)),
      );
      cards.append(card);
    }
    if (r.limiter) {
      const card = h('div', { class: 'card' });
      card.append(h('h3', {}, '总线传输特性(压限 + 软削波)', h('span', {}, '')));
      const t = h('table');
      t.append(h('tr', {}, h('th', {}, '输入幅度'), h('th', {}, '稳态输出'), h('th', {}, '瞬态峰值')));
      for (const p of r.limiter.points) t.append(h('tr', {}, h('td', {}, p.input.toFixed(2)), h('td', {}, p.steady.toFixed(3)), h('td', {}, p.transient.toFixed(3))));
      card.append(t);
      cards.append(card);
    }
    reportBody.append(cards);
  }

  if (r.sfx.length) {
    const t = h('table', { style: 'margin-top:10px' });
    t.append(h('tr', {}, ...['键', '名称', '波形', '峰值', '响度dBA', '目标', '未计权dB', '时长s', '低/中/高', '质心Hz', '配平', '结论'].map((x) => h('th', {}, x))));
    for (const x of r.sfx) {
      const tr = h('tr', { class: x.issues.length ? 'bad' : '' });
      tr.append(
        h('td', {}, x.key),
        h('td', {}, x.variant ? `${x.label}(${x.variant})` : x.label),
        h('td', {}, spark(x.env)),
        h('td', {}, x.peak.toFixed(3)),
        h('td', {}, x.loudA.toFixed(1)),
        h('td', {}, String(x.target)),
        h('td', {}, x.loudDb.toFixed(1)),
        h('td', {}, x.dur.toFixed(2)),
        h('td', {}, bands(x.low, x.mid, x.high)),
        h('td', {}, x.centroid.toFixed(0)),
        h('td', {}, x.trim.toFixed(2)),
        h('td', { class: x.issues.length ? '' : 'ok' }, x.issues.length ? x.issues.join('，') : '通过'),
      );
      t.append(tr);
    }
    reportBody.append(t);
    reportBody.append(h('h2', { style: 'margin-top:12px' }, '配平表', h('small', {}, '按目标响度从实测值推导；粘贴到 src/audio/sfx/levels.ts')), h('pre', {}, r.trimTable));
  }
}

async function runCheck(): Promise<AudioReport> {
  const which = new Set((params.get('check') ?? 'sfx,music,stress,limiter').split(','));
  const report: AudioReport = { done: false, progress: '开始', summary: {}, sfx: [], music: [], stress: null, limiter: null, mix: [], match: [], score: [], trimTable: '' };
  window.__audioReport = report;
  const music: MusicRow[] = [];
  let breathNote = '';
  const say = (s: string): void => {
    report.progress = s;
    progressEl.textContent = s;
  };
  try {
    if (which.has('limiter')) {
      say('测量总线传输特性…');
      report.limiter = await checkLimiter();
    }
    if (which.has('sfx')) {
      report.sfx = await checkAllSfx((row, done, total) => say(`音效 ${done}/${total}：${row.key}`));
      // 有变体的键取各变体建议值的最小者：任何变体都不超目标、不削波
      const best = new Map<string, number>();
      for (const x of report.sfx) best.set(x.key, Math.min(best.get(x.key) ?? Infinity, x.suggest));
      const lines = [...best].map(([k, v]) => `  ${k}: ${v.toFixed(3)},`);
      report.trimTable = `export const TRIM: Partial<Record<SfxKey, number>> = {\n${lines.join('\n')}\n};`;
    }
    if (which.has('music')) {
      const jobs: [string, MusicTrack, number, number, number][] = [
        ['菜单 menu', 'menu', 62, 0, 0],
        ['对局·探索层 (强度 0)', 'battle', 40, 0, 0],
        ['对局·过渡 (强度 0.5)', 'battle', 40, 0.5, 0],
        ['对局·战斗层 (强度 1)', 'battle', 40, 1, 0],
        ['对局·告急 (强度 1 紧张 1)', 'battle', 36, 1, 1],
        ['胜利 victory', 'victory', 30, 0, 0],
        ['失败 defeat', 'defeat', 30, 0, 0],
      ];
      for (const j of jobs) {
        say(`配乐：${j[0]}`);
        music.push(await checkMusic(j[0], j[1], j[2], j[3], j[4]));
      }
      report.music = music.map((m) => {
        const { spec: _spec, ...rest } = m;
        return rest;
      });
      say('配乐：主旋律自动听写');
      report.score = await checkAllScores();
    }
    if (which.has('mix')) {
      const jobs: [MusicTrack, number, number, number][] = [['menu', 60, 0, 0], ['battle', 38, 0, 0], ['battle', 38, 1, 0.5], ['victory', 14, 0, 0], ['defeat', 14, 0, 0]];
      for (const j of jobs) {
        say(`混音表：${j[0]} 强度 ${j[2]}`);
        const rows = await checkMix(j[0], j[1], j[2], j[3]);
        for (const r of rows) report.mix.push({ ...r, chan: `${r.chan}${j[2] ? ' @战斗' : ''}` });
      }
    }
    if (which.has('match')) {
      // 真实模拟内核跑全 AI 对局，把事件流按默认音量原样渲染：验证事件映射、限流与整体电平
      const jobs: [string, HeroId, number, number][] = [
        ['开局对线 0:05~1:05 (程咬金)', 'chijin', 5, 60],
        ['中期 4:30~5:30 (王昭君)', 'xingli', 270, 60],
        ['中期 7:00~8:00 (樊哙)', 'panyue', 420, 60],
        ['中期 5:30~6:15 (李广)', 'fengling', 330, 45],
        ['中期 6:15~7:00 (荆轲)', 'yeque', 375, 45],
      ];
      for (const j of jobs) {
        say(`真实对局：${j[0]}`);
        report.match.push({ name: j[0], ...(await checkMatch(j[1], j[2], j[3])) });
        renderReport(report, music);
      }
      // 打龙：先空跑找到玩家在场的一次吐息预警，再从它之前 4 秒起渲染 24 秒
      say('真实对局：寻找玩家在场的巨龙吐息…');
      const found = findBreath();
      if (found) {
        const name = `打龙 ${fmtClock(found.at - 4)} 起 24 秒 (${HEROES[found.hero].name}，种子 ${found.seed})`;
        say(`真实对局：${name}`);
        report.match.push({ name, ...(await checkMatch(found.hero, found.at - 4, 24, found.seed)) });
        renderReport(report, music);
      } else {
        breathNote = '没有找到玩家在场的巨龙吐息';
      }
    }
    if (which.has('stress')) {
      say('模拟团战…');
      report.stress = await checkStress(8, 60);
    }
    const sfxBad = report.sfx.filter((x) => x.issues.length > 0).length;
    const musicBad = music.filter((x) => x.issues.length > 0).length;
    report.summary = {
      sfxTotal: report.sfx.length,
      sfxBad,
      sfxMaxPeak: Math.max(0, ...report.sfx.map((x) => x.peak)),
      sfxMinPeak: Math.min(9, ...report.sfx.map((x) => x.peak)),
      musicTotal: music.length,
      musicBad,
      musicMaxPeak: Math.max(0, ...music.map((x) => x.peak)),
      scoreNotes: report.score.reduce((a, x) => a + x.notes, 0),
      scoreMatched: report.score.reduce((a, x) => a + x.matched, 0),
      stressPeak: report.stress?.peak ?? 0,
      stressIssues: report.stress?.issues.join(',') ?? '',
      limiterSmallGain: report.limiter?.smallGain ?? 0,
      limiterMaxOut: report.limiter?.maxOut ?? 0,
      breathNote,
    };
    say(`完成：音效异常 ${sfxBad}，配乐异常 ${musicBad}`);
    progressEl.className = `pill ${sfxBad + musicBad + (report.stress?.issues.length ?? 0) ? 'bad' : 'ok'}`;
  } catch (err) {
    say(`自检出错：${String(err)}`);
    progressEl.className = 'pill bad';
    report.summary = { error: String(err) };
  }
  renderReport(report, music);
  report.done = true;
  return report;
}

const MATCH_SEED = 20261112;
const fmtClock = (t: number): string => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;

/**
 * 空跑几局全 AI 对局(不出声)，找第一次「玩家英雄活着、看得见巨龙、离它 16 米内」的吐息预警。
 * 模拟是确定性的：之后用同一个种子重跑到那个时刻之前，就能把这段打龙原样渲染出来。
 */
function findBreath(): { hero: HeroId; seed: number; at: number } | null {
  for (let k = 0; k < 3; k++) {
    for (const hero of HERO_IDS) {
      const seed = MATCH_SEED + k;
      const world = createWorld({ seed, playerHero: hero, difficulty: 'normal', autoPlay: true });
      while (world.state.time < 600 && !world.state.over) {
        world.step();
        for (const e of world.drainEvents()) {
          if (e.type !== 'fx' || e.key !== 'drake_breath_warn') continue;
          const me = world.state.heroes.find((x) => x.id === world.state.playerId);
          const dragon = world.state.units.find((u) => u.id === e.unitId);
          if (me && me.alive && dragon && dragon.visible[0] && Math.hypot(me.pos.x - e.pos.x, me.pos.y - e.pos.y) < 16) return { hero, seed, at: world.state.time };
        }
      }
    }
  }
  return null;
}

/** 用真实模拟内核跑一局全 AI 对局：快进到 startAt，再把随后 seconds 秒的事件流离线渲染成混音 */
async function checkMatch(hero: HeroId, startAt: number, seconds: number, seed = MATCH_SEED): Promise<GameRow & { intensity: number[] }> {
  const world = createWorld({ seed, playerHero: hero, difficulty: 'normal', autoPlay: true });
  while (world.state.time < startAt && !world.state.over) {
    world.step();
    world.drainEvents();
  }
  const eng = createAudioWithDebug();
  eng.setMusic('battle');
  // 每秒采样一次配乐强度：用来核对「打起来变强、打完慢慢回落」
  const intensity: number[] = [];
  let n = 0;
  try {
    const row = await renderGame(
      seconds,
      TICK_DT,
      (ctx, clock) => eng.attachOffline(ctx, clock),
      () => {
        world.step();
        eng.handleEvents(world.drainEvents(), world.state);
        eng.update(world.state, TICK_DT);
        if (n++ % 30 === 0) intensity.push(Math.round(eng.debug.stats().intensity * 100) / 100);
      },
    );
    return { ...row, intensity };
  } finally {
    eng.dispose();
  }
}

// ───────────────────────── 实时冒烟测试 ─────────────────────────

const sleep = (ms: number): Promise<void> => new Promise((r) => window.setTimeout(r, ms));

async function runRealtime(): Promise<void> {
  const rt: RtReport = { done: false, steps: [], errors: [] };
  window.__audioRT = rt;
  window.addEventListener('error', (e) => rt.errors.push(String(e.message)));
  window.addEventListener('unhandledrejection', (e) => rt.errors.push(String(e.reason)));
  const step = async (name: string, fn: () => Promise<string> | string): Promise<void> => {
    try {
      rt.steps.push({ name, ok: true, info: await fn() });
    } catch (err) {
      rt.steps.push({ name, ok: false, info: String(err) });
    }
  };
  const stat = (): string => {
    const s = engine.debug.stats();
    return `state=${s.state} t=${s.time.toFixed(2)} voices=${s.voices} notes=${s.notes} played=${s.played} throttled=${s.throttled} capped=${s.capped} stolen=${s.stolen} peak=${s.peakVoices} I=${s.intensity.toFixed(2)} track=${s.track}`;
  };
  await step('未解锁时调用全部接口(应静默)', () => {
    const fresh = createAudioWithDebug();
    fresh.ui('click');
    fresh.setVolumes({ master: 1, sfx: 1, music: 1 });
    fresh.setMusic('menu');
    fresh.handleEvents(walkthrough().flat(), state);
    fresh.update(state, 0.016);
    fresh.update(null, 0.016);
    const s = fresh.debug.stats().state;
    fresh.dispose();
    fresh.ui('click');
    fresh.unlock();
    return `state=${s}`;
  });
  await step('unlock(重复调用)', async () => {
    engine.unlock();
    engine.unlock();
    await sleep(400);
    engine.unlock();
    return stat();
  });
  await step('菜单配乐 2s', async () => {
    engine.setMusic('menu');
    await sleep(2000);
    return stat();
  });
  await step('UI 音全部', async () => {
    const all: UiSound[] = ['click', 'hover', 'confirm', 'back', 'select', 'buy', 'error', 'ready', 'countdown'];
    for (const u of all) {
      engine.ui(u);
      await sleep(60);
    }
    return stat();
  });
  await step('切到对局配乐 + 逐个事件走一遍', async () => {
    engine.setMusic('battle');
    const batches = walkthrough();
    await new Promise<void>((res) => runBatches(batches, 30, res));
    await sleep(500);
    return `${batches.length} 批 · ${stat()}`;
  });
  await step('模拟团战 6s (≈60 事件/秒)', async () => {
    engine.setMusic('battle');
    await new Promise<void>((res) => runFight(6, 1, res));
    return stat();
  });
  await step('高压团战 4s (≈180 事件/秒)', async () => {
    await new Promise<void>((res) => runFight(4, 3, res));
    return stat();
  });
  await step('团战结束 5s 后节点应回收', async () => {
    await sleep(5000);
    const s = engine.debug.stats();
    if (s.voices > 2) throw new Error(`仍有 ${s.voices} 个音效发声未回收`);
    return stat();
  });
  await step('满强度战斗配乐 + 持续事件长跑 24s：节点数应稳定不增长', async () => {
    engine.debug.override(1, 0.6);
    runFight(24, 0.5);
    const voices: number[] = [];
    const notes: number[] = [];
    for (let i = 0; i < 24; i++) {
      await sleep(1000);
      const s = engine.debug.stats();
      voices.push(s.voices);
      notes.push(s.notes);
    }
    engine.debug.override(null, null);
    const avg = (a: number[]): number => a.reduce((x, y) => x + y, 0) / a.length;
    const n1 = avg(notes.slice(0, 12));
    const n2 = avg(notes.slice(12));
    const v1 = avg(voices.slice(0, 12));
    const v2 = avg(voices.slice(12));
    if (n2 > n1 * 1.5 + 10 || v2 > v1 * 1.5 + 6) throw new Error(`节点数在增长：音符 ${n1.toFixed(1)} → ${n2.toFixed(1)}，发声 ${v1.toFixed(1)} → ${v2.toFixed(1)}`);
    return `音符 前半均 ${n1.toFixed(1)} / 后半均 ${n2.toFixed(1)} / 最大 ${Math.max(...notes)} · 发声 前半均 ${v1.toFixed(1)} / 后半均 ${v2.toFixed(1)} / 最大 ${Math.max(...voices)}`;
  });
  await step('页面隐藏 → 挂起，恢复 → 继续', async () => {
    const setHidden = (v: boolean): void => {
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => v });
      document.dispatchEvent(new Event('visibilitychange'));
    };
    setHidden(true);
    await sleep(400);
    const s1 = engine.debug.stats();
    const t1 = s1.time;
    await sleep(400);
    const t2 = engine.debug.stats().time;
    setHidden(false);
    await sleep(500);
    const s3 = engine.debug.stats();
    if (s1.state !== 'suspended') throw new Error(`隐藏后状态为 ${s1.state}`);
    if (t2 - t1 > 0.05) throw new Error('挂起期间时间仍在走');
    if (s3.state !== 'running') throw new Error(`恢复后状态为 ${s3.state}`);
    return `隐藏时 ${s1.state}，恢复后 ${s3.state}，时间 ${t1.toFixed(2)} → ${s3.time.toFixed(2)}`;
  });
  await step('胜利 / 失败 / 停止', async () => {
    engine.setMusic('victory');
    await sleep(1200);
    engine.setMusic('defeat');
    await sleep(1200);
    engine.setMusic('none');
    await sleep(600);
    return stat();
  });
  await step('setVolumes 边界值', () => {
    engine.setVolumes({ master: 0, sfx: 0, music: 0 });
    engine.setVolumes({ master: 2, sfx: -1, music: 1 });
    engine.setVolumes(vols);
    return 'ok';
  });
  rt.done = true;
}

if (params.get('auto') === '1') void runCheck();
if (params.get('rt') === '1') void runRealtime();
