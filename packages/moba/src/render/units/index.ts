/**
 * 单位视图管理器(渲染模块 'units')：每帧把 state.units 同步成屏幕上的模型。
 *
 * - 新单位创建视图；离场的小兵/野怪/建筑先播完死亡演出再销毁(塔留下废墟)；英雄阵亡倒地后淡出，复活时重现。
 * - 位置按 lerp(prevPos, pos, alpha) 插值(瞬移时 prevPos = pos，自然不插值)，朝向平滑转向，按 unit.anim 驱动程序动画。
 * - 对玩家队伍不可见的敌方单位淡出隐藏；草丛内、不可选中的单位半透明；受击闪白(lastHitTime)。
 * - 脚下：接触阴影 + 队伍色光环(玩家自己金绿色)。
 * - 同一种模型的所有实例一次 draw call(骨骼贴图实例化，见 models/shading.ts)；镜头外的单位不解算也不提交。
 * - 对外提供单位的渲染位置 / 头顶高度 / 包围半径 / 挂点查询(特效、血条、拾取都从这里取)，并接管 ctx.unitQuery。
 */
import * as THREE from 'three';
import { HEROES } from '../../core/data/heroes';
import { type GameState, type HeroId, TICK_DT, type Unit, type UnitAnim, type UnitKind } from '../../core/types';
import type { FrameInfo, RenderContext, RenderModule } from '../engine/context';
import type { QualitySettings } from '../engine/quality';
import { PALETTE } from '../materials';
import { type AttachName, type InstanceLook, type ModelDef, Puppet, RigBatch, allModelKeys, coreKey, createInstanceLook, getModel, hasModel, heroKey, minionKey, monsterKey, ruinKey, towerKey } from '../models';
import { getFallbackModel } from '../models/fallback';
import { RING_BLOB, RING_HERO, RING_MINION, RING_PLAYER, RingBatch } from './rings';

/** 单位的渲染信息快照 */
export interface UnitViewInfo {
  id: number;
  kind: UnitKind;
  /** 渲染位置(世界坐标)。y 为脚底高度(含河道下沉、腾空/击飞的抬升) */
  x: number;
  y: number;
  z: number;
  /** 头顶高度(相对脚底，米) */
  height: number;
  /** 包围半径(米) */
  radius: number;
  /** 当前显示的不透明度 0..1(0 = 不可见) */
  opacity: number;
  /** 平滑后的朝向(弧度，atan2(y, x)) */
  facing: number;
  /** false = 已离场，正在播放死亡演出 */
  alive: boolean;
}

export interface UnitsModule extends RenderModule {
  /** 取单位的渲染信息；不存在返回 false */
  getInfo(id: number, out: UnitViewInfo): boolean;
  /**
   * 模型挂点的世界坐标：'head' 头 / 'chest' 胸口 / 'handR' 'handL' 手 / 'weapon' 武器尖端 / 'muzzle' 弹道出口 / 'core' 塔与水晶的能量核心。
   * 模型没有该挂点时退回胸口高度并返回 true；单位不存在返回 false。
   */
  getAttach(id: number, name: AttachName, out: THREE.Vector3): boolean;
  /** 给单位叠加整体染色(冰冻/石化等)，amount 0..1；0 = 取消 */
  setTint(id: number, color: THREE.ColorRepresentation, amount: number): void;
  /** 本帧实际提交绘制的模型实例数 */
  readonly instanceCount: number;
}

interface View {
  id: number;
  kind: UnitKind;
  team: 0 | 1 | 2;
  def: ModelDef;
  puppet: Puppet;
  batch: RigBatch;
  look: InstanceLook;
  seen: boolean;
  isPlayer: boolean;
  alive: boolean;
  x: number;
  y: number;
  z: number;
  lift: number;
  yaw: number;
  hasYaw: boolean;
  opacity: number;
  targetOpacity: number;
  flash: number;
  /** 上一次用于累计步幅的位置 */
  sx: number;
  sz: number;
  stride: number;
  speed: number;
  variant: number;
  lastStart: number;
  lastAnim: UnitAnim;
  /** 离场后的演出时间；在场为 -1 */
  dying: number;
  deathDur: number;
  /** 显示缩放(见 VIEW_SCALE) */
  scale: number;
  culled: boolean;
  fresh: boolean;
  /** 刚创建：不透明度直接取目标值(不从 0 淡入) */
  pop: boolean;
  radius: number;
  height: number;
  hp: number;
  ring: number;
  tintAmount: number;
  windup: number;
  /** 本次普攻是强化的一击(出手时锁定) */
  special: boolean;
}

interface Ruin {
  puppet: Puppet;
  batch: RigBatch;
  look: InstanceLook;
  x: number;
  z: number;
  age: number;
}

const STATIC_KINDS: Record<UnitKind, boolean> = { hero: false, minion: false, monster: false, tower: true, core: true };

/**
 * 显示缩放：对局镜头要装下技能射程(16:9 下左右各约 14 米)，按真实尺寸画的话英雄偏小、看不清模型细节。
 * 所以会动的单位按种类放大显示(品类惯例：模型比碰撞体大一圈)，配合镜头(见 engine/camera.ts)让英雄在 720p 下站立约 110 像素高；
 * 建筑本来就高，不放大。只影响画面：碰撞、射程、拾取以外的判定仍然用模拟层的半径。
 */
const VIEW_SCALE: Record<UnitKind, number> = { hero: 1.32, minion: 1.28, monster: 1.17, tower: 1, core: 1 };
/** 个别英雄再微调：磐岳的模型本来就比别人高一头，按统一倍率会超出「720p 下 105~125 像素」的上限 */
const HERO_VIEW_TRIM: Partial<Record<HeroId, number>> = { panyue: 0.94 };
/** 点选敌方单位时在模型轮廓之外再放宽的像素数 */
const PICK_SLOP = 20;

function modelKeyOf(u: Unit): string {
  switch (u.kind) {
    case 'hero':
      return heroKey(u.heroId);
    case 'minion':
      return minionKey(u.minionType);
    case 'tower':
      return towerKey(u.tier, u.team);
    case 'core':
      return coreKey(u.team);
    case 'monster':
      return monsterKey(u.monsterType);
  }
}

function fallbackFor(u: Unit): ModelDef {
  switch (u.kind) {
    case 'hero':
      return getFallbackModel(u.radius, 2.2);
    case 'minion':
      return getFallbackModel(u.radius, u.minionType === 'super' ? 2.0 : 1.2);
    case 'tower':
      return getFallbackModel(u.radius, 8);
    case 'core':
      return getFallbackModel(u.radius, 6);
    case 'monster':
      return getFallbackModel(u.radius, 1 + u.radius * 1.4);
  }
}

function deathDuration(u: View): number {
  switch (u.kind) {
    case 'minion':
      return 1.0;
    case 'monster':
      return u.radius >= 1.8 ? 2.8 : 1.5;
    case 'tower':
      return 2.4;
    case 'core':
      return Infinity;
    default:
      return 0;
  }
}

function capacityFor(key: string): number {
  if (key.startsWith('hero:')) return 2;
  if (key === 'minion:melee') return 24;
  if (key.startsWith('minion:')) return 12;
  if (key.startsWith('tower:')) return 3;
  if (key.startsWith('monster:glimwing') || key.startsWith('monster:mossback')) return 4;
  return 2;
}

const _corner = new THREE.Vector3();
const _origin = new THREE.Vector3();
const _tmp = { x: 0, y: 0, z: 0 };
const _scr = { x: 0, y: 0, visible: false };
const _scr2 = { x: 0, y: 0, visible: false };
const NDC: [number, number][] = [[-1, -1], [1, -1], [1, 1], [-1, 1]];

export function createUnitsModule(ctx: RenderContext): UnitsModule {
  const root = new THREE.Group();
  root.name = 'unit-views';
  ctx.layers.units.add(root);

  const views = new Map<number, View>();
  /** 本帧状态里的单位(拾取时查无敌等状态) */
  const unitById = new Map<number, Unit>();
  const list: View[] = [];
  const batches = new Map<string, RigBatch>();
  const batchList: RigBatch[] = [];
  const ruins: Ruin[] = [];
  const rings = new RingBatch(200);
  root.add(rings.mesh);

  let outlines = ctx.settings.name !== 'low';
  let shadows = ctx.settings.shadows;
  let time = 0;
  let instanceCount = 0;
  let lastStateTime = -1;
  let booted = false;
  /** 视图被清空后，下一帧要按新状态重新摆废墟 */
  let needRuins = false;
  /** 预热帧：给本帧没有实例的批各塞一个替身(见 prewarm) */
  let warming = false;
  const warmLook = createInstanceLook();
  const _focus = new THREE.Vector3();
  // 可见地面范围(裁剪用)
  let cMinX = -Infinity;
  let cMaxX = Infinity;
  let cMinZ = -Infinity;
  let cMaxZ = Infinity;

  const colors = {
    blue: new THREE.Color(PALETTE.blue.main),
    red: new THREE.Color(PALETTE.red.main),
    neutral: new THREE.Color(PALETTE.neutral.main),
    player: new THREE.Color(PALETTE.player.main),
    shadow: new THREE.Color(0x0a1020),
    deadTint: new THREE.Color(0x8890a0),
    // 透视剪影色(与血条的敌我配色一致)
    xSelf: new THREE.Color(0x9dff5a),
    xAlly: new THREE.Color(0x58aaff),
    xEnemy: new THREE.Color(0xff5a48),
    xNeutral: new THREE.Color(0xf2c860),
  };
  let playerTeam: 0 | 1 = ctx.frame.playerTeam;
  const teamColor = (t: 0 | 1 | 2): THREE.Color => (t === 0 ? colors.blue : t === 1 ? colors.red : colors.neutral);

  const batchFor = (def: ModelDef): RigBatch => {
    let b = batches.get(def.key);
    if (!b) {
      // 会动的单位(英雄/小兵/野怪)被地形挡住时画透视剪影；建筑够高，不需要
      const xray = def.key.startsWith('hero:') || def.key.startsWith('minion:') || def.key.startsWith('monster:');
      b = new RigBatch(def.geometry, def.rig.count, capacityFor(def.key), { outline: 1.5, xray }, def.key);
      b.setShadows(shadows);
      b.setOutlineVisible(outlines);
      b.addTo(root);
      batches.set(def.key, b);
      batchList.push(b);
    }
    return b;
  };

  const createView = (u: Unit, st: GameState): View => {
    const key = modelKeyOf(u);
    const def = hasModel(key) ? getModel(key) : fallbackFor(u);
    // 每个单位一个固定的随机相位：id 的黄金分割散列
    const seed = (u.id * 0.618034) % 1;
    const look = createInstanceLook();
    look.team.copy(teamColor(u.team));
    const scale = VIEW_SCALE[u.kind] * (u.kind === 'hero' ? (HERO_VIEW_TRIM[u.heroId] ?? 1) : 1);
    const v: View = {
      id: u.id,
      kind: u.kind,
      team: u.team,
      def,
      puppet: new Puppet(def, seed),
      batch: batchFor(def),
      look,
      seen: true,
      isPlayer: u.id === st.playerId,
      alive: true,
      x: u.pos.x,
      y: 0,
      z: u.pos.y,
      lift: 0,
      yaw: 0,
      hasYaw: false,
      opacity: 0,
      targetOpacity: 1,
      flash: 0,
      sx: u.pos.x,
      sz: u.pos.y,
      stride: seed,
      speed: 0,
      variant: 0,
      lastStart: u.animStart,
      lastAnim: u.anim,
      dying: -1,
      deathDur: 0,
      scale,
      culled: false,
      fresh: true,
      // 开局已在场的单位直接出现；对局中新刷出来的(小兵/野怪)淡入
      pop: !booted,
      radius: Math.max(u.radius, def.radius * def.scale * scale),
      height: def.height * def.scale * scale,
      hp: 1,
      ring: u.kind === 'hero' ? (u.id === st.playerId ? RING_PLAYER : RING_HERO) : u.kind === 'minion' ? RING_MINION : -1,
      tintAmount: 0,
      special: false,
      windup: u.kind === 'hero' ? HEROES[u.heroId].basicAttack.windup : STATIC_KINDS[u.kind] ? 0.3 : 0.35,
    };
    v.deathDur = deathDuration(v);
    return v;
  };

  const addRuin = (x: number, z: number, team: 0 | 1, age: number): void => {
    const key = ruinKey(team);
    if (!hasModel(key)) return;
    const def = getModel(key);
    const puppet = new Puppet(def, ((x * 12.9898 + z * 78.233) % 1 + 1) % 1);
    const look = createInstanceLook();
    look.team.copy(teamColor(team));
    ruins.push({ puppet, batch: batchFor(def), look, x, z, age });
  };

  /** 状态里已经不在场的塔(读档/演示/时间轴跳变)：直接摆废墟 */
  const seedRuins = (st: GameState): void => {
    for (const spot of st.map.towers) {
      let found = false;
      for (const u of st.units) {
        if (u.kind === 'tower' && Math.abs(u.pos.x - spot.pos.x) < 0.5 && Math.abs(u.pos.y - spot.pos.y) < 0.5) {
          found = true;
          break;
        }
      }
      if (!found) addRuin(spot.pos.x, spot.pos.y, spot.team, 10);
    }
  };
  seedRuins(ctx.frame.state);

  /** 丢掉全部视图(下一帧按当时的状态重建，直接出现、不播淡入/死亡演出) */
  const clearViews = (): void => {
    views.clear();
    list.length = 0;
    ruins.length = 0;
    booted = false;
    needRuins = true;
  };

  const updateCullRect = (): void => {
    const cam = ctx.camera;
    _origin.setFromMatrixPosition(cam.matrixWorld);
    let minX = Infinity;
    let maxX = -Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;
    for (const [nx, ny] of NDC) {
      _corner.set(nx, ny, 0.5).unproject(cam).sub(_origin);
      // 与地面求交；看向地平线以上的角(调试视角)退化为不裁剪
      if (_corner.y > -1e-4) {
        cMinX = cMinZ = -Infinity;
        cMaxX = cMaxZ = Infinity;
        return;
      }
      const t = -_origin.y / _corner.y;
      const gx = _origin.x + _corner.x * t;
      const gz = _origin.z + _corner.z * t;
      if (gx < minX) minX = gx;
      if (gx > maxX) maxX = gx;
      if (gz < minZ) minZ = gz;
      if (gz > maxZ) maxZ = gz;
    }
    cMinX = minX;
    cMaxX = maxX;
    cMinZ = minZ;
    cMaxZ = maxZ;
  };

  /** 视野内(含模型自身高度与投影的外扩)？ */
  const inView = (x: number, z: number, radius: number, height: number): boolean => {
    // 模型向上的部分在屏幕上朝北(−z)延伸；影子朝东北方向落，所以西、南两侧也要留余量
    const m = radius + 1.5;
    return x > cMinX - m - height * 0.9 && x < cMaxX + m && z > cMinZ - m && z < cMaxZ + m + height * 1.3;
  };

  const sync = (v: View, u: Unit, frame: FrameInfo): void => {
    const st = frame.state;
    const a = frame.alpha;
    v.seen = true;
    v.isPlayer = u.id === st.playerId;
    const x = u.prevPos.x + (u.pos.x - u.prevPos.x) * a;
    const z = u.prevPos.y + (u.pos.y - u.prevPos.y) * a;
    const wasAlive = v.alive;
    v.alive = u.alive;
    v.x = x;
    v.z = z;
    v.y = STATIC_KINDS[u.kind] ? 0 : ctx.terrain.heightAt(x, z) * 0.6;
    v.hp = u.stats.maxHp > 0 ? u.hp / u.stats.maxHp : 1;
    if (u.alive && !wasAlive) {
      // 复活：直接出现在泉水，不从尸体位置过渡
      v.fresh = true;
      v.opacity = 0;
    }

    // 朝向：建筑固定朝南(正对镜头)
    const targetYaw = STATIC_KINDS[u.kind] ? 0 : Math.PI / 2 - u.facing;
    if (!v.hasYaw || v.fresh) {
      v.yaw = targetYaw;
      v.hasYaw = true;
    } else {
      let d = targetYaw - v.yaw;
      d -= Math.round(d / (Math.PI * 2)) * Math.PI * 2;
      const rate = u.kind === 'hero' ? 18 : u.kind === 'minion' ? 12 : 9;
      v.yaw += d * (1 - Math.exp(-rate * frame.dt));
    }

    // 可见性与不透明度
    const friendly = u.team === frame.playerTeam;
    const shown = friendly || STATIC_KINDS[u.kind] || u.kind === 'monster' || u.visible[frame.playerTeam];
    let target = shown ? 1 : 0;
    if (shown) {
      if (u.bushId >= 0) target = 0.62;
      for (let i = 0; i < u.buffs.length; i++) {
        if (u.buffs[i].id === 'untargetable') {
          target = Math.min(target, 0.42);
          break;
        }
      }
    }
    const tRender = st.time - (1 - a) * TICK_DT;
    if (u.kind === 'hero' && !u.alive) {
      // 倒地 2.2 秒后淡出，复活前不再显示
      const dt = tRender - u.animStart;
      target = Math.min(target, dt < 2.2 ? 1 : 0);
    }
    v.targetOpacity = target;

    // 受击闪白。镜头拉近后模型在屏幕上大了一圈：闪得太白会在对线时(一秒挨好几下)把模型细节反复盖掉，峰值压低一些
    const since = tRender - u.lastHitTime;
    v.flash = since >= 0 && since < 0.16 && u.alive ? (1 - since / 0.16) ** 2 * (STATIC_KINDS[u.kind] ? 0.3 : 0.42) : 0;

    // 动画输入
    const inp = v.puppet.input;
    const newSwing = u.anim === 'attack' && (u.animStart !== v.lastStart || v.lastAnim !== 'attack');
    if (newSwing) {
      v.variant++;
      v.special = false;
    }
    v.lastStart = u.animStart;
    v.lastAnim = u.anim;
    inp.anim = u.anim;
    const t = Math.max(0, tRender - u.animStart);
    inp.t = t;
    inp.p = u.animDur > 0 ? Math.min(1, t / u.animDur) : 0;
    inp.hp = v.hp;
    inp.windup = v.windup;
    inp.deathT = -1;
    inp.variant = v.variant;
    inp.mode = 0;
    if (u.kind === 'hero') {
      for (let i = 0; i < u.buffs.length; i++) {
        const b = u.buffs[i];
        // 磐岳：攒满两层后的下一击(第三击)用重击动作——在出手那一刻锁定，命中后层数清零也不会中途换动作；壁垒期间举盾
        if (newSwing && ((b.id === 'panyue_passive' && b.stacks >= 2) || b.id === 'fengling_crit' || b.id === 'chijin_ember')) v.special = true;
        else if (b.id === 'panyue_bulwark') inp.mode |= 2;
      }
      if (v.special && u.anim === 'attack') inp.mode |= 1;
    }

    // 腾空高度：跃击按进度走抛物线；击飞高度随时长
    if (u.anim === 'leap') v.lift = 4 * 3.4 * inp.p * (1 - inp.p);
    else if (u.anim === 'airborne') v.lift = 4 * Math.min(2.2, Math.max(0.8, u.animDur * 1.7)) * inp.p * (1 - inp.p);
    else v.lift = 0;
  };

  const startDying = (v: View): void => {
    v.dying = 0;
    v.alive = false;
    if (v.kind === 'tower' && v.team !== 2) addRuin(v.x, v.z, v.team, 0);
  };

  const drawView = (v: View, frame: FrameInfo): void => {
    const dt = frame.dt;
    // 不透明度缓动
    const od = v.targetOpacity - v.opacity;
    if (v.pop) v.opacity = v.targetOpacity;
    else v.opacity += od * (1 - Math.exp(-(od > 0 ? 9 : 6) * dt));
    v.pop = false;
    if (Math.abs(v.targetOpacity - v.opacity) < 0.01) v.opacity = v.targetOpacity;

    // 步幅累计(按渲染位置的实际位移，脚不打滑)
    const mdx = v.x - v.sx;
    const mdz = v.z - v.sz;
    const moved = Math.hypot(mdx, mdz);
    v.sx = v.x;
    v.sz = v.z;
    if (moved < 3 && dt > 0) {
      v.stride = (v.stride + moved / (v.def.stride * v.scale)) % 1;
      v.speed += (moved / dt - v.speed) * Math.min(1, dt * 12);
    }

    if (v.opacity <= 0.01 || !inView(v.x, v.z, v.radius, v.height + v.lift)) {
      v.culled = true;
      v.fresh = false;
      return;
    }
    const inp = v.puppet.input;
    inp.time = time;
    inp.stride = v.stride;
    inp.speed = v.speed;
    if (v.dying >= 0) {
      inp.anim = 'dead';
      inp.t = v.dying;
      inp.p = Number.isFinite(v.deathDur) ? Math.min(1, v.dying / v.deathDur) : Math.min(1, v.dying / 3);
      inp.deathT = v.dying;
      inp.hp = 0;
    }
    if (v.culled || v.fresh) v.puppet.snap();
    v.culled = false;
    v.fresh = false;
    v.puppet.update(v.lastStart, dt, v.x, v.y + v.lift, v.z, v.yaw, v.scale);

    const look = v.look;
    look.opacity = v.opacity;
    look.flash = v.flash;
    look.glow = v.puppet.output.glow;
    look.tintAmount = v.tintAmount;
    // 透视剪影：敌红友蓝己绿、野怪金；倒地/离场的不画
    look.xrayAmount = v.alive && v.dying < 0 ? 1 : 0;
    look.xray.copy(v.isPlayer ? colors.xSelf : v.team === 2 ? colors.xNeutral : v.team === playerTeam ? colors.xAlly : colors.xEnemy);
    if (v.dying >= 0 && Number.isFinite(v.deathDur)) {
      // 演出的最后一段抖动淡出
      const left = v.deathDur - v.dying;
      if (left < 0.4) look.opacity = Math.max(0, v.opacity * (left / 0.4));
    }
    v.batch.push(v.puppet.skeleton, look);
    instanceCount++;

    // 脚下标记
    if (!STATIC_KINDS[v.kind] && v.dying < 0) {
      const water = ctx.terrain.inWater(v.x, v.z);
      const gy = water ? ctx.terrain.waterLevel + 0.03 : v.y / 0.6 + 0.05;
      const fade = v.opacity;
      const squash = 1 / (1 + v.lift * 0.35);
      rings.push(v.x, gy, v.z, v.radius * 1.25 * squash, colors.shadow, (shadows ? 0.3 : 0.5) * fade * squash, RING_BLOB);
      if (v.ring >= 0 && v.alive) {
        const c = v.isPlayer ? colors.player : teamColor(v.team);
        rings.push(v.x, gy + 0.01, v.z, v.radius * (v.kind === 'hero' ? 1.3 : 1.15), c, (v.kind === 'hero' ? 0.85 : 0.6) * fade, v.ring, Math.PI / 2 - v.yaw);
      }
    }
  };

  const mod: UnitsModule = {
    name: 'units',
    get instanceCount() {
      return instanceCount;
    },
    update(frame) {
      const st = frame.state;
      time += frame.dt;
      playerTeam = frame.playerTeam;
      // 换了一局(模拟时间倒退)：清掉旧视图
      if (st.time < lastStateTime - 0.5) clearViews();
      lastStateTime = st.time;
      if (needRuins) {
        needRuins = false;
        seedRuins(st);
      }
      updateCullRect();

      for (let i = 0; i < list.length; i++) list[i].seen = false;
      unitById.clear();
      const units = st.units;
      for (let i = 0; i < units.length; i++) {
        const u = units[i];
        unitById.set(u.id, u);
        let v = views.get(u.id);
        if (!v) {
          v = createView(u, st);
          views.set(u.id, v);
          list.push(v);
        } else if (v.dying >= 0) {
          // 同一 id 又回到场上(理论上不会发生)：当作新单位
          v.dying = -1;
          v.fresh = true;
        }
        sync(v, u, frame);
      }

      booted = true;
      for (let i = 0; i < batchList.length; i++) batchList[i].begin();
      rings.begin();
      instanceCount = 0;

      for (let i = list.length - 1; i >= 0; i--) {
        const v = list[i];
        if (!v.seen) {
          if (v.dying < 0) {
            if (v.kind === 'hero' || v.deathDur <= 0) {
              views.delete(v.id);
              list.splice(i, 1);
              continue;
            }
            startDying(v);
          }
          v.dying += frame.dt;
          v.flash = 0;
          if (v.dying >= v.deathDur) {
            views.delete(v.id);
            list.splice(i, 1);
            continue;
          }
        }
        drawView(v, frame);
      }

      for (let i = 0; i < ruins.length; i++) {
        const r = ruins[i];
        r.age += frame.dt;
        if (!inView(r.x, r.z, 3, 3)) continue;
        const inp = r.puppet.input;
        inp.anim = 'idle';
        inp.time = time;
        inp.t = r.age;
        // 废墟随坍塌从地里「长」出来：前 1.2 秒由 0 放大到 1
        inp.p = Math.min(1, r.age / 1.2);
        r.puppet.update(0, frame.dt, r.x, 0, r.z, 0, 1);
        r.look.glow = r.puppet.output.glow;
        r.batch.push(r.puppet.skeleton, r.look);
        instanceCount++;
      }

      if (warming) {
        // 预热帧(被加载页盖着)：还没出场的模型各画一个在镜头前，把几何上传、把第一次绘制的开销提前付掉
        ctx.rig.getFocus(_focus);
        for (const key of allModelKeys()) {
          const def = getModel(key);
          const b = batchFor(def);
          if (b.count > 0) continue;
          const puppet = new Puppet(def, 0);
          puppet.update(0, 0, _focus.x, 0, _focus.z, 0, 1);
          b.push(puppet.skeleton, warmLook);
        }
      }

      for (let i = 0; i < batchList.length; i++) batchList[i].end();
      rings.end();
    },
    prewarm() {
      // 小兵 / 野怪 / 废墟等开局不在场的模型：现在就把几何建好、把批建好，免得它们第一次出场的那一帧又建模又上传
      for (const key of allModelKeys()) batchFor(getModel(key));
      warming = true;
      return () => {
        warming = false;
      };
    },
    setQuality(s: QualitySettings) {
      outlines = s.name !== 'low';
      shadows = s.shadows;
      for (const b of batchList) {
        b.setShadows(shadows);
        b.setOutlineVisible(outlines);
      }
    },
    pickUnit(clientX, clientY, st) {
      // 屏幕空间的宽容拾取：每个单位一个包住模型的椭圆。点在椭圆里按「离中心多近」比较；
      // 都没点中时，敌方单位再放宽 PICK_SLOP 像素(手指/快速点击经常差一点)。
      // 调用方拿它选攻击目标：敌方优先于友方，英雄优先于小兵野怪，暂时打不了的(无敌建筑)靠后。
      let best = -1;
      let bestScore = Infinity;
      for (let i = 0; i < list.length; i++) {
        const v = list[i];
        if (!v.seen || !v.alive || v.id === st.playerId || v.opacity < 0.3 || v.culled) continue;
        const mid = Math.min(1.6, v.height * 0.45);
        ctx.worldToScreen(v.x, v.y + v.lift + mid, v.z, _scr);
        if (!_scr.visible) continue;
        ctx.worldToScreen(v.x + v.radius + 0.3, v.y + v.lift + mid, v.z, _scr2);
        const rx = Math.max(24, Math.abs(_scr2.x - _scr.x) * 1.2);
        // 模型在屏幕上是竖长的：纵向按身高放宽
        const ry = Math.max(rx, rx * Math.min(2.2, v.height / (v.radius * 2.6 + 0.4)));
        const px = _scr.x - clientX;
        const py = _scr.y - clientY;
        const enemy = v.team !== playerTeam;
        let score = (px / rx) ** 2 + (py / ry) ** 2;
        if (score > 1) {
          if (!enemy) continue;
          const near = (px / (rx + PICK_SLOP)) ** 2 + (py / (ry + PICK_SLOP)) ** 2;
          if (near > 1) continue;
          // 擦边的永远排在真正点中的之后
          score = 2 + near;
        }
        let bias = enemy ? (v.kind === 'hero' ? 0.5 : 0.8) : 1.6;
        if (enemy && STATIC_KINDS[v.kind]) {
          const u = unitById.get(v.id);
          if (u?.invulnerable) bias = 1.5;
        }
        if (score * bias < bestScore) {
          bestScore = score * bias;
          best = v.id;
        }
      }
      return best;
    },
    getInfo(id, out) {
      const v = views.get(id);
      if (!v) return false;
      out.id = id;
      out.kind = v.kind;
      out.x = v.x;
      out.y = v.y + v.lift;
      out.z = v.z;
      out.height = v.height;
      out.radius = v.radius;
      out.opacity = v.opacity;
      out.facing = Math.PI / 2 - v.yaw;
      out.alive = v.dying < 0 && v.alive;
      return true;
    },
    getAttach(id, name, out) {
      const v = views.get(id);
      if (!v) return false;
      if (!v.culled && (v.puppet.attach(name, _tmp) || v.puppet.attach('chest', _tmp))) out.set(_tmp.x, _tmp.y, _tmp.z);
      else out.set(v.x, v.y + v.lift + v.height * 0.6, v.z);
      return true;
    },
    setTint(id, color, amount) {
      const v = views.get(id);
      if (!v) return;
      v.look.tint.set(color);
      v.tintAmount = amount;
    },
    reset() {
      clearViews();
      lastStateTime = -1;
    },
    dispose() {
      ctx.layers.units.remove(root);
      for (const b of batchList) b.dispose();
      rings.dispose();
      views.clear();
      unitById.clear();
      list.length = 0;
      ruins.length = 0;
      batches.clear();
      batchList.length = 0;
    },
  };

  ctx.setUnitQuery({
    getPosition(id, out) {
      const v = views.get(id);
      if (!v) return false;
      out.set(v.x, v.y + v.lift, v.z);
      return true;
    },
    getHeight(id) {
      const v = views.get(id);
      return v ? v.height : 2;
    },
  });

  return mod;
}
