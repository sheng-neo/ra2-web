/**
 * 整场景验收页：真实对局(全 AI，createWorld + autoPlay) + 完整的 GameRenderer(地形/单位/特效/叠加层)，
 * 用来做端到端的画面验收、性能统计与稳健性检查。
 *
 * URL 参数：
 *   ?mock=1                 不跑模拟，用 createMockState 的静态假状态
 *   ?quality=low|medium|high   画质(缺省 high：自动化截图不要依赖 detectQuality，软件渲染下它会给 low)
 *   ?seed=7 &hero=chijin &difficulty=normal   对局配置(hero = 玩家英雄，排在 heroes[0])
 *   ?speed=4                模拟倍速(实时模式)
 *   ?t=180                  先不绘制地快进到指定模拟时间，再开始渲染
 *   ?follow=0..9            镜头与视角跟随指定英雄(下标同 state.heroes；缺省 0 = 玩家)。红方英雄 = 以红方视角观战
 *   ?x=&y=                  镜头固定看向某处(不跟随)
 *   ?manual=1               玩家英雄交给键鼠：WASD 移动，J/空格 普攻，Q/E/R 技能(朝鼠标)，F 闪现 G 恢复 B 回城，右键点地/点人
 *   ?seek=<事件>            定格模式：在整局事件索引里找到该事件，倒回去预滚一小段后停在事件之后 post 秒(见下)
 *      &nth=0 &after=秒 &team=0|1 &who=英雄id或下标 &pre=1.5 &post=0.12 &persp=unit|player
 *   ?hud=0 ?help=0          隐藏统计/帮助面板      ?bars=0 隐藏血条飘字
 *   ?top=1                  俯瞰全图(调试)
 *
 * seek 的事件写法(type[:key])：
 *   fx:<FxKey>   cast:<heroId>:<slot>   anim:<UnitAnim>   buff:<BuffId>   death:<UnitKind>   kill   tower   epic
 *   respawn   levelup   announce:<AnnounceKey>   spawn:<MonsterType>   over   fight(按参战英雄数排序的团战时刻)   time:<秒>
 *
 * 键盘：空格(非 manual)暂停，1/2/3 画质，[ ] 减/加速，Tab 切换跟随的英雄，O 血条开关，T 俯瞰，H 面板开关。
 *
 * 脚本接口 window.__scene：state / view / world / renderer、ready(Promise)、settled、
 *   index() 事件索引摘要、list(type, key?) 列出事件、seek(spec) 定格到事件、run(秒, draw?) 定格后继续确定性推进、
 *   goto(秒) 不绘制快进、snap(label, opts) 抓一格到拼图、sheet(cols) 取拼图 dataURL、stats() / mem()、
 *   follow(i)、quality(q)、pause(b)、cmd(i, 命令)、rebuild() 销毁并重建渲染器、loseContext() / restoreContext()。
 */
import { HEROES, HERO_IDS } from '../core/data/heroes';
import { createMockState } from '../core/mock';
import { type Difficulty, type GameEvent, type GameState, type HeroId, type PlayerCommand, type SkillSlot, TICK_DT, type Unit, type Vec2, type World } from '../core/types';
import { createWorld } from '../core/world';
import type { Quality } from '../render/api';
import { type FxModule, type GameRendererCore, type OverlayModule, type UnitsModule, DEFAULT_MODULES, createRendererCore } from '../render';

const params = new URLSearchParams(location.search);
const num = (k: string): number | null => {
  const v = params.get(k);
  if (v === null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

const app = document.getElementById('app') as HTMLElement;
const hud = document.getElementById('hud') as HTMLElement;
const help = document.getElementById('help') as HTMLElement;

const qp = params.get('quality');
let quality: Quality = qp === 'low' || qp === 'medium' || qp === 'high' ? qp : 'high';
const heroParam = params.get('hero');
const playerHero: HeroId = HERO_IDS.includes(heroParam as HeroId) ? (heroParam as HeroId) : 'chijin';
const dp = params.get('difficulty');
const difficulty: Difficulty = dp === 'easy' || dp === 'hard' ? dp : 'normal';
const seed = num('seed') ?? 7;
const mock = params.get('mock') === '1';
const manual = params.get('manual') === '1' && !mock;
let speed = Math.max(0, num('speed') ?? 1);

// ───────────────────────── 世界 ─────────────────────────

const makeWorld = (): World => createWorld({ seed, playerHero, difficulty, autoPlay: !manual });

let world: World | null = mock ? null : makeWorld();
let state: GameState = world ? world.state : createMockState(playerHero);
/** 交给渲染器的状态：原状态的一层「视角替身」(只覆盖 playerId)，用来以任意英雄的视角观战而不动模拟层 */
let view: GameState = state;
let followIndex = 0;
let fixedLook: Vec2 | null = null;

function applyFollow(i: number): void {
  followIndex = ((i % state.heroes.length) + state.heroes.length) % state.heroes.length;
  const h = state.heroes[followIndex];
  if (!h || h.id === state.playerId) view = state;
  else {
    view = Object.create(state) as GameState;
    Object.defineProperty(view, 'playerId', { value: h.id, enumerable: true });
  }
}

/** 不绘制地把模拟推进到指定 tick(事件直接丢弃) */
function simTo(tick: number): void {
  if (!world) return;
  if (state.tick > tick) {
    world = makeWorld();
    state = world.state;
  }
  while (state.tick < tick && !state.over) {
    world.step();
    world.drainEvents();
  }
  world.drainEvents();
  applyFollow(followIndex);
}

// ───────────────────────── 事件索引 ─────────────────────────

interface IndexEntry {
  tick: number;
  type: string;
  key: string;
  unitId: number;
  team: number;
  x: number;
  y: number;
  /** 团战条目的参战人数 */
  score: number;
}

let eventIndex: IndexEntry[] | null = null;
let indexEnd = 0;

/** 另起一局同配置的对局跑到结束(或上限)，把关心的事件记成时间索引。同种子同输入完全可复现，所以索引对主世界同样成立 */
function buildIndex(): IndexEntry[] {
  if (eventIndex) return eventIndex;
  const out: IndexEntry[] = [];
  if (mock) return (eventIndex = out);
  const w = makeWorld();
  const st = w.state;
  const limit = Math.round((num('limit') ?? 1500) / TICK_DT);
  const push = (type: string, key: string, unitId: number, team: number, x: number, y: number, score = 0): void => {
    out.push({ tick: st.tick, type, key, unitId, team, x, y, score });
  };
  const lastAnim = new Map<number, string>();
  const lastBuffs = new Map<number, Set<string>>();
  const unitPos = (id: number, fallback: Vec2): Vec2 => w.getUnit(id)?.pos ?? fallback;
  while (st.tick < limit && !st.over) {
    w.step();
    for (const e of w.drainEvents()) {
      switch (e.type) {
        case 'fx':
          push('fx', e.key, e.unitId ?? -1, e.team, e.pos.x, e.pos.y);
          break;
        case 'skillCast':
          push('cast', `${e.heroId}:${e.slot}`, e.unitId, w.getUnit(e.unitId)?.team ?? 2, e.pos.x, e.pos.y);
          break;
        case 'death':
          push('death', e.kind, e.unitId, e.team, e.pos.x, e.pos.y);
          break;
        case 'heroKill': {
          const p = unitPos(e.victimId, { x: 0, y: 0 });
          push('kill', String(e.multiKill), e.victimId, w.getUnit(e.victimId)?.team ?? 2, p.x, p.y);
          break;
        }
        case 'towerDestroyed':
          push('tower', String(e.tier), e.unitId, e.team, e.pos.x, e.pos.y);
          break;
        case 'epicSlain':
          push('epic', e.monsterType, -1, e.team, e.pos.x, e.pos.y);
          break;
        case 'respawn':
          push('respawn', '', e.unitId, w.getUnit(e.unitId)?.team ?? 2, e.pos.x, e.pos.y);
          break;
        case 'levelUp': {
          const u = w.getUnit(e.unitId);
          if (u) push('levelup', String(e.level), e.unitId, u.team, u.pos.x, u.pos.y);
          break;
        }
        case 'monsterSpawn':
          push('spawn', e.monsterType, -1, 2, e.pos.x, e.pos.y);
          break;
        case 'announce': {
          const u = e.unitId !== undefined ? w.getUnit(e.unitId) : undefined;
          push('announce', e.key, e.unitId ?? -1, e.team, u?.pos.x ?? 0, u?.pos.y ?? 0);
          break;
        }
        case 'gameOver':
          push('over', String(e.winner), -1, e.winner, st.map.bases[e.winner === 0 ? 1 : 0].core.x, st.map.bases[e.winner === 0 ? 1 : 0].core.y);
          break;
        default:
          break;
      }
    }
    // 英雄的动作与 buff 上升沿
    for (const h of st.heroes) {
      if (lastAnim.get(h.id) !== h.anim) {
        lastAnim.set(h.id, h.anim);
        push('anim', h.anim, h.id, h.team, h.pos.x, h.pos.y);
      }
      let had = lastBuffs.get(h.id);
      if (!had) lastBuffs.set(h.id, (had = new Set()));
      for (const b of h.buffs) if (!had.has(b.id)) push('buff', b.id, h.id, h.team, h.pos.x, h.pos.y);
      had.clear();
      for (const b of h.buffs) had.add(b.id);
    }
    // 团战采样(每秒)：以某个交战中的英雄为圆心 10 米内的交战英雄数
    if (st.tick % 30 === 0) {
      let best = 0;
      let bh: Unit | null = null;
      for (const h of st.heroes) {
        if (!h.alive || !h.inCombat) continue;
        let n = 0;
        for (const o of st.heroes) if (o.alive && o.inCombat && Math.hypot(o.pos.x - h.pos.x, o.pos.y - h.pos.y) < 10) n++;
        if (n > best) {
          best = n;
          bh = h;
        }
      }
      if (bh && best >= 4) push('fight', String(best), bh.id, bh.team, bh.pos.x, bh.pos.y, best);
    }
  }
  indexEnd = st.time;
  return (eventIndex = out);
}

interface SeekSpec {
  /** 事件：'fx:panyue_ult_land' / 'cast:xingli:ult' / 'fight' / 'time:120' … */
  ev: string;
  nth?: number;
  /** 只找这个模拟时间之后的 */
  after?: number;
  team?: number;
  /** 限定事件所属英雄：英雄 id 或 heroes 下标 */
  who?: string | number;
  /** 事件前预滚(绘制前的模块推进)秒数 / 事件后停在多久 */
  pre?: number;
  post?: number;
  /** 视角：unit = 事件所属英雄(蓝方英雄成为「玩家」，红方英雄则镜头盯住它)；player = 保持当前跟随，只把镜头移过去 */
  persp?: 'unit' | 'player';
}

interface SeekResult {
  ok: boolean;
  reason?: string;
  time?: number;
  tick?: number;
  x?: number;
  y?: number;
  unitId?: number;
  key?: string;
  matches?: number;
}

function heroIndexOf(unitId: number): number {
  return state.heroes.findIndex((h) => h.id === unitId);
}

function findEntries(spec: SeekSpec): IndexEntry[] {
  const idx = buildIndex();
  const [type, ...rest] = spec.ev.split(':');
  const key = rest.join(':');
  const after = Math.round((spec.after ?? 0) / TICK_DT);
  let whoId = -2;
  if (spec.who !== undefined && spec.who !== '') {
    const n = Number(spec.who);
    // 英雄 id 在同配置的对局里是固定的，直接拿主世界的来比
    const h = Number.isFinite(n) ? state.heroes[n] : state.heroes.find((x) => x.heroId === spec.who && (spec.team === undefined || x.team === spec.team));
    whoId = h ? h.id : -3;
  }
  let list = idx.filter((e) => e.type === type && (key === '' || e.key === key) && e.tick >= after && (spec.team === undefined || e.team === spec.team) && (whoId === -2 || e.unitId === whoId));
  if (type === 'fight') {
    // 团战：人数多的优先，同一场(20 秒内)只留峰值
    const sorted = [...list].sort((a, b) => b.score - a.score || a.tick - b.tick);
    const picked: IndexEntry[] = [];
    for (const e of sorted) if (!picked.some((p) => Math.abs(p.tick - e.tick) < 600)) picked.push(e);
    list = picked;
  }
  return list;
}

// ───────────────────────── 渲染器 ─────────────────────────

let renderer: GameRendererCore = createRendererCore(app, view, { quality }, DEFAULT_MODULES);
const applyRendererSetup = (): void => {
  // 验收页不经应用层：阵亡去色由特效模块自己负责
  renderer.context.getModule<FxModule>('fx')?.setDeathGrade(true);
  if (params.get('bars') === '0') {
    const ov = renderer.context.getModule<OverlayModule>('overlay');
    ov?.setVisible('bars', false);
    ov?.setVisible('floaters', false);
  }
  if (params.get('top') === '1') renderer.engine.rig.setTopView(true, state.map.half + 14);
};
applyRendererSetup();

applyFollow(num('follow') ?? 0);
const lx = num('x');
const ly = num('y');
if (lx !== null || ly !== null) fixedLook = { x: lx ?? 0, y: ly ?? 0 };

let paused = false;
/** 定格：seek 之后停止实时循环与重绘，画面保持在最后一帧 */
let frozen = false;
let bars = true;
/** 盯住某个单位(红方英雄/事件位置)时的镜头目标；null = 跟随视角英雄 */
let peekUnit = -1;

function updatePeek(): void {
  if (fixedLook) {
    renderer.setCameraPeek(fixedLook);
    return;
  }
  if (peekUnit >= 0) {
    const u = state.units.find((x) => x.id === peekUnit);
    if (u) {
      // 与跟随时一致：注视点略偏北，英雄落在画面中心偏下
      renderer.setCameraPeek({ x: u.pos.x, y: u.pos.y - 2.2 });
      return;
    }
  }
  renderer.setCameraPeek(null);
}

const pending: GameEvent[] = [];

/** 确定性推进 n 个 tick(每帧一个 tick，dt 固定)；只有最后一帧提交绘制 */
function stepTicks(n: number, draw: boolean): void {
  for (let i = 0; i < n; i++) {
    if (world) {
      world.step();
      const evs = world.drainEvents();
      if (evs.length > 0) renderer.handleEvents(evs, view);
    }
    updatePeek();
    if (draw && i === n - 1) renderer.render(view, 1, TICK_DT);
    else renderer.advance(view, 1, TICK_DT);
  }
}

function redraw(): void {
  updatePeek();
  renderer.render(view, 1, 0);
}

function seek(spec: SeekSpec): SeekResult {
  if (!world) return { ok: false, reason: 'mock 模式没有事件' };
  let tick: number;
  let entry: IndexEntry | null = null;
  let matches = 1;
  if (spec.ev.startsWith('time:')) tick = Math.round(Number(spec.ev.slice(5)) / TICK_DT);
  else {
    const list = findEntries(spec);
    matches = list.length;
    entry = list[spec.nth ?? 0] ?? null;
    if (!entry) return { ok: false, reason: `没有匹配的事件(共 ${list.length} 个，索引到 ${indexEnd.toFixed(0)}s)`, matches };
    tick = entry.tick;
  }
  const pre = Math.max(0, Math.round((spec.pre ?? 1.5) / TICK_DT));
  const post = Math.max(0, Math.round((spec.post ?? 0.12) / TICK_DT));
  simTo(Math.max(0, tick - pre));
  // 视角
  peekUnit = -1;
  fixedLook = null;
  if (entry) {
    const hi = heroIndexOf(entry.unitId);
    if ((spec.persp ?? 'unit') === 'unit' && hi >= 0 && state.heroes[hi].team === 0) applyFollow(hi);
    else {
      applyFollow(spec.persp === 'player' ? followIndex : 0);
      if (hi >= 0) peekUnit = entry.unitId;
      else fixedLook = { x: entry.x, y: entry.y - 2.2 };
    }
  } else applyFollow(followIndex);
  renderer.reset();
  updatePeek();
  renderer.advance(view, 1, 0);
  renderer.snapCamera();
  stepTicks(pre + post, true);
  frozen = true;
  api.settled = true;
  const r: SeekResult = { ok: true, time: state.time, tick: state.tick, matches };
  if (entry) {
    r.x = entry.x;
    r.y = entry.y;
    r.unitId = entry.unitId;
    r.key = entry.key;
  }
  return r;
}

// ───────────────────────── 拼图抓取 ─────────────────────────

interface Tile {
  canvas: HTMLCanvasElement;
}
const tiles: Tile[] = [];

interface SnapOpts {
  /** 裁切尺寸(CSS 像素)。缺省 640×360；0 = 整屏 */
  w?: number;
  h?: number;
  /** 裁切中心(屏幕 CSS 像素)。缺省 = 视角英雄/盯住的单位在屏幕上的位置 */
  cx?: number;
  cy?: number;
  /** 输出缩放 */
  scale?: number;
}

/** 重画一帧并立刻把 WebGL 画布 + 叠加层画布裁一块存成一格(必须同步完成：绘图缓冲在让出后会被清掉) */
function snap(label: string, opts: SnapOpts = {}): void {
  redraw();
  const gl = renderer.engine.canvas;
  const vw = renderer.engine.viewport.width;
  const vh = renderer.engine.viewport.height;
  const w = opts.w === 0 ? vw : Math.min(vw, opts.w ?? 640);
  const h = opts.h === 0 ? vh : Math.min(vh, opts.h ?? 360);
  let cx = opts.cx;
  let cy = opts.cy;
  if (cx === undefined || cy === undefined) {
    const u = peekUnit >= 0 ? state.units.find((x) => x.id === peekUnit) : state.heroes[followIndex];
    const p = fixedLook ? renderer.worldToScreen({ x: fixedLook.x, y: fixedLook.y + 2.2 }, 1) : u ? renderer.worldToScreen(u.pos, 1.2) : { x: vw / 2, y: vh / 2 };
    cx = cx ?? p.x;
    cy = cy ?? p.y;
  }
  const sx = Math.max(0, Math.min(vw - w, Math.round(cx - w / 2)));
  const sy = Math.max(0, Math.min(vh - h, Math.round(cy - h / 2)));
  const scale = opts.scale ?? 1;
  const c = document.createElement('canvas');
  c.width = Math.round(w * scale);
  c.height = Math.round(h * scale);
  const g = c.getContext('2d');
  if (!g) return;
  const kx = gl.width / vw;
  const ky = gl.height / vh;
  g.drawImage(gl, sx * kx, sy * ky, w * kx, h * ky, 0, 0, c.width, c.height);
  const ov = renderer.context.overlayRoot.querySelector('canvas');
  if (ov) g.drawImage(ov, (sx * ov.width) / vw, (sy * ov.height) / vh, (w * ov.width) / vw, (h * ov.height) / vh, 0, 0, c.width, c.height);
  if (label) {
    g.font = '600 13px ui-monospace, Menlo, Consolas, monospace';
    const tw = g.measureText(label).width;
    g.fillStyle = 'rgba(6,10,22,0.78)';
    g.fillRect(0, 0, tw + 12, 20);
    g.fillStyle = '#ffe9a8';
    g.fillText(label, 6, 14);
  }
  tiles.push({ canvas: c });
}

/** 把抓到的格子拼成一张图返回 dataURL，并清空 */
function sheet(cols = 3, type = 'image/jpeg'): string {
  if (tiles.length === 0) return '';
  const tw = tiles[0].canvas.width;
  const th = tiles[0].canvas.height;
  const rows = Math.ceil(tiles.length / cols);
  const c = document.createElement('canvas');
  c.width = tw * Math.min(cols, tiles.length) + (Math.min(cols, tiles.length) - 1) * 2;
  c.height = th * rows + (rows - 1) * 2;
  const g = c.getContext('2d');
  if (!g) return '';
  g.fillStyle = '#05070f';
  g.fillRect(0, 0, c.width, c.height);
  tiles.forEach((t, i) => g.drawImage(t.canvas, (i % cols) * (tw + 2), Math.floor(i / cols) * (th + 2)));
  tiles.length = 0;
  return c.toDataURL(type, 0.9);
}

// ───────────────────────── 统计 ─────────────────────────

function stats(): Record<string, unknown> {
  const s = renderer.getStats();
  const fx = renderer.context.getModule<FxModule>('fx')?.getStats();
  const um = renderer.context.getModule<UnitsModule>('units');
  const vp = renderer.engine.viewport;
  return {
    quality: renderer.engine.quality,
    size: `${vp.width}x${vp.height}@${vp.dpr.toFixed(2)}`,
    fps: s.fps,
    drawCalls: s.drawCalls,
    triangles: s.triangles,
    time: state.time,
    units: state.units.length,
    instances: um ? um.instanceCount : 0,
    fx: fx ? { ...fx } : null,
  };
}

function mem(): { geometries: number; textures: number; programs: number } {
  const info = renderer.engine.renderer.info;
  return { geometries: info.memory.geometries, textures: info.memory.textures, programs: info.programs?.length ?? 0 };
}

function rebuild(q: Quality = quality): void {
  renderer.dispose();
  quality = q;
  renderer = createRendererCore(app, view, { quality }, DEFAULT_MODULES);
  applyRendererSetup();
  api.renderer = renderer;
}

// ───────────────────────── 键鼠(manual) 与调试按键 ─────────────────────────

const keys = new Set<string>();
const mouse = { x: innerWidth / 2, y: innerHeight / 2 };
const send = (cmd: PlayerCommand): void => world?.command(state.playerId, cmd);

function castAtMouse(slot: SkillSlot): void {
  const me = state.heroes.find((h) => h.id === state.playerId);
  if (!me) return;
  const g = renderer.screenToGround(mouse.x, mouse.y);
  if (!g) {
    send({ type: 'cast', slot });
    return;
  }
  const dx = g.x - me.pos.x;
  const dy = g.y - me.pos.y;
  const len = Math.hypot(dx, dy) || 1;
  const picked = renderer.pickUnit(mouse.x, mouse.y, view);
  const cmd: PlayerCommand = { type: 'cast', slot, dir: { x: dx / len, y: dy / len }, pos: g };
  if (picked >= 0) cmd.targetId = picked;
  send(cmd);
}

let lastMove = '';
function updateManualMove(): void {
  if (!manual) return;
  const x = (keys.has('KeyD') ? 1 : 0) - (keys.has('KeyA') ? 1 : 0);
  const y = (keys.has('KeyS') ? 1 : 0) - (keys.has('KeyW') ? 1 : 0);
  const k = `${x},${y}`;
  if (k === lastMove) return;
  lastMove = k;
  const len = Math.hypot(x, y);
  send(len > 0 ? { type: 'move', dir: { x: x / len, y: y / len } } : { type: 'stop' });
}

addEventListener('keydown', (e) => {
  if (e.repeat) return;
  keys.add(e.code);
  switch (e.code) {
    case 'Digit1':
    case 'Digit2':
    case 'Digit3':
      quality = e.code === 'Digit1' ? 'low' : e.code === 'Digit2' ? 'medium' : 'high';
      renderer.setQuality(quality);
      break;
    case 'BracketLeft':
      speed = Math.max(0.25, speed / 2);
      break;
    case 'BracketRight':
      speed = Math.min(32, speed * 2);
      break;
    case 'Tab':
      e.preventDefault();
      peekUnit = -1;
      fixedLook = null;
      applyFollow(followIndex + (e.shiftKey ? -1 : 1));
      renderer.snapCamera();
      break;
    case 'KeyO': {
      bars = !bars;
      const ov = renderer.context.getModule<OverlayModule>('overlay');
      ov?.setVisible('bars', bars);
      ov?.setVisible('floaters', bars);
      break;
    }
    case 'KeyT':
      renderer.engine.rig.setTopView(!renderer.engine.rig.isTopView, state.map.half + 14);
      break;
    case 'KeyH':
      hud.style.display = hud.style.display === 'none' ? '' : 'none';
      break;
    case 'Space':
      if (manual) send({ type: 'attack' });
      else paused = !paused;
      e.preventDefault();
      break;
    default:
      break;
  }
  if (!manual) return;
  switch (e.code) {
    case 'KeyJ':
      send({ type: 'attack' });
      break;
    case 'KeyQ':
      castAtMouse('s1');
      break;
    case 'KeyE':
      castAtMouse('s2');
      break;
    case 'KeyR':
      castAtMouse('ult');
      break;
    case 'KeyF':
      castAtMouse('flash');
      break;
    case 'KeyG':
      send({ type: 'cast', slot: 'heal' });
      break;
    case 'KeyB':
      send({ type: 'cast', slot: 'recall' });
      break;
    default:
      break;
  }
});
addEventListener('keyup', (e) => keys.delete(e.code));
addEventListener('pointermove', (e) => {
  mouse.x = e.clientX;
  mouse.y = e.clientY;
});
app.addEventListener('contextmenu', (e) => e.preventDefault());
app.addEventListener('pointerdown', (e) => {
  if (!manual) return;
  const id = renderer.pickUnit(e.clientX, e.clientY, view);
  const u = id >= 0 ? state.units.find((x) => x.id === id) : undefined;
  if (u && u.team !== 0) send({ type: 'attack', targetId: id });
  else if (e.button === 2) {
    const g = renderer.screenToGround(e.clientX, e.clientY);
    if (g) send({ type: 'moveTo', pos: g });
  }
});
addEventListener('resize', () => {
  renderer.resize();
  if (frozen) redraw();
});

// ───────────────────────── 主循环(实时模式) ─────────────────────────

if (params.get('hud') === '0') hud.style.display = 'none';
if (params.get('help') === '0' || params.get('hud') === '0') help.style.display = 'none';
help.textContent = manual
  ? 'WASD 移动 · J/空格 普攻 · Q/E/R 技能(朝鼠标) · F 闪现 G 恢复 B 回城 · 右键点地/点人\n1/2/3 画质 · [ ] 变速 · Tab 换跟随 · O 血条 · T 俯瞰 · H 面板'
  : '空格 暂停 · 1/2/3 画质 · [ ] 变速 · Tab 换跟随 · O 血条 · T 俯瞰 · H 面板\n?speed= ?t= ?follow= ?seek= ?manual=1 ?mock=1';

const startT = num('t');
if (startT !== null && world) simTo(Math.round(startT / TICK_DT));

let last = performance.now();
let acc = 0;
let hudTimer = 0;
let frameMs = 0;
function frame(now: number): void {
  requestAnimationFrame(frame);
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  if (frozen) return;
  let alpha = 1;
  if (world && !paused) {
    updateManualMove();
    acc += dt * speed;
    // 单帧步数上限：软件渲染下一帧可能要几百毫秒，别让模拟把这一帧拖得更久
    const maxSteps = Math.max(6, Math.ceil(speed * 3));
    let n = 0;
    while (acc >= TICK_DT && n < maxSteps) {
      world.step();
      acc -= TICK_DT;
      n++;
      for (const e of world.drainEvents()) pending.push(e);
    }
    if (n === maxSteps) acc = 0;
    alpha = Math.min(1, acc / TICK_DT);
  }
  if (pending.length > 0) {
    renderer.handleEvents(pending, view);
    pending.length = 0;
  }
  updatePeek();
  const t0 = performance.now();
  renderer.render(view, alpha, paused ? 0 : dt);
  frameMs += (performance.now() - t0 - frameMs) * 0.1;
  hudTimer -= dt;
  if (hudTimer <= 0 && hud.style.display !== 'none') {
    hudTimer = 0.25;
    const s = renderer.getStats();
    const vp = renderer.engine.viewport;
    const fx = renderer.context.getModule<FxModule>('fx')?.getStats();
    const um = renderer.context.getModule<UnitsModule>('units');
    const m = mem();
    const h = state.heroes[followIndex];
    hud.textContent =
      `画质 ${renderer.engine.quality}  ${vp.width}×${vp.height} @${vp.dpr.toFixed(2)}x  FPS ${s.fps}  帧耗时 ${frameMs.toFixed(1)}ms\n` +
      `draw calls ${s.drawCalls}   三角形 ${s.triangles.toLocaleString()}\n` +
      `模拟 ${world ? `${state.time.toFixed(1)}s ×${speed}${paused ? ' (暂停)' : ''}` : '假状态'}   单位 ${state.units.length}   模型实例 ${um ? um.instanceCount : 0}\n` +
      (fx ? `特效：网格 ${fx.drawCalls}  贴花 ${fx.decals}  投射物 ${fx.projectiles}  区域 ${fx.areas}  状态 ${fx.statuses}  粒子累计 ${fx.particlesSpawned}/${fx.particleCapacity}\n` : '') +
      `显存对象：几何 ${m.geometries}  贴图 ${m.textures}  着色器 ${m.programs}\n` +
      (h ? `跟随 [${followIndex}] ${HEROES[h.heroId].name}(${h.team === 0 ? '蓝' : '红'}) Lv${h.level} ${Math.round(h.hp)}/${Math.round(h.stats.maxHp)} ${h.anim}` : '');
  }
}

// ───────────────────────── 脚本接口 ─────────────────────────

const api = {
  get state(): GameState {
    return state;
  },
  get view(): GameState {
    return view;
  },
  get world(): World | null {
    return world;
  },
  renderer,
  settled: false,
  ready: Promise.resolve(),
  /** 事件索引摘要：每种事件的次数与首次出现时间 */
  index(): Record<string, { n: number; first: number }> {
    const out: Record<string, { n: number; first: number }> = {};
    for (const e of buildIndex()) {
      const k = e.key ? `${e.type}:${e.key}` : e.type;
      const o = (out[k] ??= { n: 0, first: Math.round(e.tick * TICK_DT * 10) / 10 });
      o.n++;
    }
    out.__end = { n: 1, first: Math.round(indexEnd) };
    return out;
  },
  list(ev: string, opts: Partial<SeekSpec> = {}): { t: number; key: string; unit: number; hero: string; team: number; x: number; y: number; score: number }[] {
    return findEntries({ ...opts, ev }).map((e) => {
      const hi = heroIndexOf(e.unitId);
      return { t: Math.round(e.tick * TICK_DT * 100) / 100, key: e.key, unit: e.unitId, hero: hi >= 0 ? `${hi}:${state.heroes[hi].heroId}` : '', team: e.team, x: Math.round(e.x * 10) / 10, y: Math.round(e.y * 10) / 10, score: e.score };
    });
  },
  seek,
  /** 定格状态下继续确定性推进若干秒(每 tick 一帧)；draw=false 时最后一帧也不画 */
  run(seconds: number, draw = true): number {
    stepTicks(Math.max(1, Math.round(seconds / TICK_DT)), draw);
    return state.time;
  },
  /** 不绘制、不喂事件地快进到某个模拟时间，并重置视图 */
  goto(seconds: number): number {
    simTo(Math.round(seconds / TICK_DT));
    renderer.reset();
    redraw();
    return state.time;
  },
  redraw,
  snap,
  sheet,
  tiles: (): number => tiles.length,
  stats,
  mem,
  follow(i: number): void {
    peekUnit = -1;
    fixedLook = null;
    applyFollow(i);
    renderer.snapCamera();
    if (frozen) redraw();
  },
  look(x: number, y: number): void {
    fixedLook = { x, y };
    peekUnit = -1;
    updatePeek();
    renderer.snapCamera();
    if (frozen) redraw();
  },
  quality(q: Quality): void {
    quality = q;
    renderer.setQuality(q);
    if (frozen) redraw();
  },
  pause(b: boolean): void {
    paused = b;
  },
  freeze(b: boolean): void {
    frozen = b;
    last = performance.now();
  },
  cmd(i: number, cmd: PlayerCommand): void {
    const h = state.heroes[i];
    if (h) world?.command(h.id, cmd);
  },
  rebuild,
  loseContext(): void {
    renderer.engine.renderer.getContext().getExtension('WEBGL_lose_context')?.loseContext();
  },
  restoreContext(): void {
    renderer.engine.renderer.getContext().getExtension('WEBGL_lose_context')?.restoreContext();
  },
};

declare global {
  interface Window {
    __scene: typeof api;
  }
}
window.__scene = api;

const seekParam = params.get('seek');
if (seekParam && world) {
  const r = seek({
    ev: seekParam,
    nth: num('nth') ?? undefined,
    after: num('after') ?? undefined,
    team: num('team') ?? undefined,
    who: params.get('who') ?? undefined,
    pre: num('pre') ?? undefined,
    post: num('post') ?? undefined,
    persp: params.get('persp') === 'player' ? 'player' : 'unit',
  });
  if (!r.ok) console.warn(`seek 失败：${r.reason ?? ''}`);
  hud.textContent = `定格 ${seekParam} → ${r.ok ? `t=${(r.time ?? 0).toFixed(2)}s (匹配 ${r.matches})` : r.reason}`;
} else {
  // 先画一帧(编译着色器)再标记就绪
  renderer.render(view, 1, 0);
  api.settled = true;
}
requestAnimationFrame(frame);
