/**
 * 单位视图管理器(渲染模块 'units')：每帧把 state.units 同步成屏幕上的模型。
 *
 * - 新单位创建视图；离场的小兵/野怪/建筑先播完死亡演出再销毁(塔留下废墟)；英雄阵亡倒地后淡出，复活时重现。
 * - 位置按 lerp(prevPos, pos, alpha) 插值(瞬移时 prevPos = pos，自然不插值)，朝向平滑转向，按 unit.anim 驱动程序动画。
 * - 对玩家队伍不可见的敌方单位淡出隐藏；草丛内、不可选中的单位半透明；受击闪亮(lastHitTime：保色相的提亮 + 薄薄一层白)。
 * - 无敌态的防御塔 / 水晶外罩一圈半透明的六边护罩(units/shield.ts)。
 * - 描边 / 阴影 / 透视剪影三个通道各自只画模型里够大的形体(分通道减面，见 PASS_LOD)。
 * - 脚下：两层接触阴影(脚下的实芯 + 顺着太阳投影方向偏出去的椭圆软影) + 队伍色光环(玩家自己金绿色)。
 * - 动画输入除了动作与进度，还有：出生演出(对局中新刷出的野怪)、距上次受击的时间、警戒 / 特殊出手 / 建筑无敌等状态位。
 * - 同一种模型的所有实例一次 draw call(骨骼贴图实例化，见 models/shading.ts)；镜头外的单位不解算也不提交。
 * - 对外提供单位的渲染位置 / 头顶高度 / 包围半径 / 挂点查询(特效、血条、拾取都从这里取)，并接管 ctx.unitQuery。
 */
import * as THREE from 'three';
import { HEROES } from '../../core/data/heroes';
import { type GameState, type HeroId, TICK_DT, type Unit, type UnitAnim, type UnitKind } from '../../core/types';
import type { FrameInfo, RenderContext, RenderModule } from '../engine/context';
import type { QualitySettings } from '../engine/quality';
import { SUN_DIR } from '../engine/lighting';
import { PALETTE } from '../materials';
import { type AttachName, type InstanceLook, type ModelDef, Puppet, RigBatch, allModelKeys, coreKey, createInstanceLook, getModel, hasModel, heroKey, minionKey, monsterKey, ruinKey, towerKey } from '../models';
import { getFallbackModel } from '../models/fallback';
import { lodIndexCount } from '../models/kit';
import { RING_BLOB, RING_HERO, RING_MINION, RING_PLAYER, RingBatch } from './rings';
import { ShieldBatch } from './shield';

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
  /** 当前出手序号(每次普攻出手 +1)：特效层据此区分左右手 / 第三击等动作变体 */
  variant: number;
  /** 正在播放出生演出(对局中新刷出的野怪)：特效层可据此配合出生特效、暂不画血条等 */
  spawning: boolean;
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
  /** 一次短暂的整体染色(被巨龙吐息喷中等)：从 amount 起在 dur 秒内衰减到 0；与 setTint 的常驻染色取较强者 */
  flashTint(id: number, color: THREE.ColorRepresentation, amount: number, dur: number): void;
  /** 描边短暂转金(河道巨龙的全队奖励到手)：持续 dur 秒，最后三分之一淡出。不描边的档位(low)无效 */
  flashRim(id: number, dur: number): void;
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
  /** 受击闪亮里叠白的那一份(着色器的 flash 通道) */
  flash: number;
  /** 受击闪亮里保色相提亮的那一份：本体色 / 队伍色乘 1 + flashBoost */
  flashBoost: number;
  /** 当前这次闪亮的起点(模拟时间)与已经处理过的 lastHitTime(判断「又挨了一下」) */
  flashStart: number;
  flashSeen: number;
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
  /** 外部(特效层)要求的整体染色；模型自己的染色(出生冰封、死亡变灰)更强时以模型为准 */
  tintColor: THREE.Color;
  /** 一次性染色(flashTint)：颜色、起始强度、总时长、剩余时间 */
  pulseColor: THREE.Color;
  pulseAmount: number;
  pulseDur: number;
  pulseLeft: number;
  /** 描边转金(flashRim)：总时长、剩余时间 */
  rimDur: number;
  rimLeft: number;
  windup: number;
  /** 出生演出已播秒数；不在演出中为 -1 */
  spawnT: number;
  /** 距上次受击的秒数 */
  hitT: number;
  /** 动画状态位(见 AnimInput.mode) */
  mode: number;
  /** 本次普攻是强化的一击(出手时锁定) */
  special: boolean;
  /** 建筑的无敌护罩：强度 0..1(出现时淡入)与解除进度(-1 = 完好；0..1 = 正在碎开淡出) */
  shield: number;
  shieldBreak: number;
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
/**
 * 英雄的显示身高(模型头顶高度 × 模型缩放 × 显示倍率，米)收在这个区间里：对局镜头下 1 米约 34.6 像素(720p)，
 * 即站立 105~123 像素。魁梧的(樊哙、程咬金)顶到上限、娇小的托到下限，区间内的身高差原样保留。
 * 英雄模型改了身高也不用回来调表(顶到同一个上限的两位之间谁高谁矮，见下面的 HERO_VIEW_TRIM)。
 */
const HERO_VIEW_HEIGHT: [number, number] = [3.05, 3.55];
/**
 * 个别英雄需要偏离上面区间时的手动倍率(乘在自动结果上)。
 * 樊哙与程咬金都顶到了区间上限，但两人的「头顶高度」量的不是同一种东西：樊哙含炸开的发束、程咬金含盔缨。
 * 一起夹到 3.55 米之后，樊哙的身体(发束以下)只比程咬金高不到 2%，再被程咬金扛着的大斧一衬，坦克反而显矮。
 * 所以樊哙放大 7%(头顶 3.80 米、约 131 像素)、程咬金收 3%(3.44 米、约 119 像素)：樊哙的身体比程咬金高约 8%，
 * 肩宽本来就宽一截——「坦克全场最魁梧」在对局镜头下成立；程咬金仍比法师、射手、刺客高大。
 */
const HERO_VIEW_TRIM: Partial<Record<HeroId, number>> = { panyue: 1.07, chijin: 0.97 };
/** 点选敌方单位时在模型轮廓之外再放宽的像素数 */
const PICK_SLOP = 20;

/**
 * 受击闪亮。以「保色相的提亮」为主：本体色与队伍色一起乘亮(线性空间乘 1 + boost)，着色器里那层近白只叠很薄的一点(white)。
 * 原先只靠叠白：深色模型(龙、巨灵、黑发、深色甲)的线性色只有 0.05 上下，叠 0.25 的白就整只刷成灰白石膏，打野打龙时看不到模型本色。
 * 体型越大占屏越多，叠白越轻：大型野怪(半径 ≥ 1.2 米)与建筑 0.04，其余 0.1。时长 0.16 秒，按平方衰减。
 * 距上一次起闪不足 FLASH_REARM 秒的受击不重新起闪——被集火(每秒五六下)时是一下一下的闪，而不是连成一片常亮。
 */
const FLASH_DUR = 0.16;
const FLASH_REARM = 0.25;
const FLASH_BOOST = 0.85;
const FLASH_WHITE = 0.1;
const FLASH_WHITE_BIG = 0.04;
const WHITE = new THREE.Color(1, 1, 1);
/** 无敌护罩解除时碎开淡出的时长(秒) */
const SHIELD_BREAK = 0.45;

/**
 * 分通道减面：一个单位每帧要画 3~4 遍(本体 / 描边壳 / 阴影 / 透视剪影)，后三遍只看轮廓，用不着模型的全部三角形。
 * 模型的索引已按「描边的形体从大到小 → 不描边的形体」排好(models/kit.ts)，这三个通道各自用 drawRange 只画一段前缀：
 *   - 描边壳：只画描边的形体(五官、发光嵌线这些线宽为 0 的画了也看不见)，三档相同；
 *   - 阴影：再跳过包围盒最大边小于阈值的小件(带扣、甲钉、手指、箭羽——在阴影贴图上不到两三个 texel，软阴影一糊就没了)；
 *     medium 的阴影贴图只有 high 的一半分辨率，阈值放宽；
 *   - 透视剪影：只是一片抖动的纯色，同样跳过小件；但它是被挡住的单位唯一看得见的样子，四肢、头盔、武器必须都在，
 *     阈值不能再宽：0.25 时少掉的还只是缠带、护腕、臂箍这类贴在肢体上的件，
 *     到 0.3 射手的小腿、战士的头盔与披膊、提灯兵的灯头就从剪影里消失了。
 * 本体永远画完整模型，所以三档的模型细节一致，没有肉眼可见的差别。阈值单位：米(模型空间 × 模型缩放)。
 * 各阈值下剪影里还剩哪些件，可以在英雄画廊页用 ?lod=<米> 直接看(dev/heroes.ts)。
 */
const PASS_LOD: Record<QualitySettings['name'], { shadow: number; xray: number }> = {
  high: { shadow: 0.14, xray: 0.2 },
  medium: { shadow: 0.25, xray: 0.25 },
  low: { shadow: 0.25, xray: 0.25 },
};
/** 每个批各通道该画的索引数(画质切换时重算) */
interface PassRange {
  outline: number;
  shadow: number;
  xray: number;
}

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
  if (u.kind === 'core') return Infinity;
  if (u.kind === 'hero') return 0;
  if (u.def.deathDur !== undefined) return u.def.deathDur;
  switch (u.kind) {
    case 'minion':
      return 1.2;
    case 'monster':
      return u.radius >= 1.8 ? 2.8 : 1.5;
    default:
      return 2.4;
  }
}

/** 描边线宽(CSS 像素)：模型自己给了就用模型的；否则英雄 1.5、小兵 1.2、其余 1.5 */
function outlineFor(def: ModelDef): number {
  if (def.outline !== undefined) return def.outline;
  return def.key.startsWith('minion:') ? 1.2 : 1.5;
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
  const rings = new RingBatch(320);
  const shields = new ShieldBatch(16);
  // 接触阴影的软影顺着太阳的水平投影方向偏出去
  const sunLen = Math.hypot(SUN_DIR.x, SUN_DIR.z) || 1;
  const shadowDx = -SUN_DIR.x / sunLen;
  const shadowDz = -SUN_DIR.z / sunLen;
  const shadowAngle = Math.atan2(shadowDz, shadowDx);
  root.add(rings.mesh);
  root.add(shields.mesh);

  let quality = ctx.settings.name;
  let outlines = quality !== 'low';
  let shadows = ctx.settings.shadows;
  let time = 0;
  let instanceCount = 0;
  let lastStateTime = -1;
  /** 两队「星陨祝福」的剩余秒数(每帧从 state.teams 读)：祝福期间该队英雄与小兵描边转暗金，小兵脚环加金边、自发光增强 */
  const blessLeft: [number, number] = [0, 0];
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
    /** 红方小兵的本体乘色(线性)：钢蓝灰 → 玄铁 */
    redIron: new THREE.Color(0.4, 0.2, 0.15),
    deadTint: new THREE.Color(0x8890a0),
    // 透视剪影色(与血条的敌我配色一致)
    xSelf: new THREE.Color(0x9dff5a),
    /** 星陨祝福期间小兵队伍环外的细金边 */
    blessRing: new THREE.Color(0xffcf60),
    /** 无敌护罩：队伍色提亮一档(蓝 = 晶蓝，红 = 余烬橙红) */
    shield: [new THREE.Color(0x58b4ff), new THREE.Color(0xff6a42)],
    xAlly: new THREE.Color(0x58aaff),
    xEnemy: new THREE.Color(0xff5a48),
    xNeutral: new THREE.Color(0xf2c860),
  };
  let playerTeam: 0 | 1 = ctx.frame.playerTeam;
  const teamColor = (t: 0 | 1 | 2): THREE.Color => (t === 0 ? colors.blue : t === 1 ? colors.red : colors.neutral);

  /** 各批的分通道索引范围 */
  const passRanges = new Map<RigBatch, { def: ModelDef; range: PassRange }>();
  const computeRange = (def: ModelDef, out: PassRange): void => {
    const lod = PASS_LOD[quality];
    const k = Math.max(0.001, def.scale);
    out.outline = lodIndexCount(def.geometry, 0);
    out.shadow = lodIndexCount(def.geometry, lod.shadow / k);
    out.xray = lodIndexCount(def.geometry, lod.xray / k);
  };
  /**
   * 给一个批装上分通道的绘制范围：描边壳、剪影、阴影各自在开画前把几何的 drawRange 收到自己的前缀，画完放回整个模型。
   * 三个网格共用同一份几何，所以必须「用前设、用后还」；几何对象由回调参数给出(批扩容后换了新几何也照常生效)。
   */
  const installPassLod = (b: RigBatch, def: ModelDef): void => {
    const range: PassRange = { outline: Infinity, shadow: Infinity, xray: Infinity };
    computeRange(def, range);
    passRanges.set(b, { def, range });
    const restore = (_r: unknown, _s: unknown, _c: unknown, geometry: THREE.BufferGeometry): void => {
      geometry.setDrawRange(0, Infinity);
    };
    if (b.outline) {
      b.outline.onBeforeRender = (_r, _s, _c, geometry) => {
        geometry.setDrawRange(0, range.outline);
      };
      b.outline.onAfterRender = restore;
    }
    if (b.xray) {
      b.xray.onBeforeRender = (_r, _s, _c, geometry) => {
        geometry.setDrawRange(0, range.xray);
      };
      b.xray.onAfterRender = restore;
    }
    b.mesh.onBeforeShadow = (_r, _o, _c, _sc, geometry) => {
      geometry.setDrawRange(0, range.shadow);
    };
    b.mesh.onAfterShadow = (_r, _o, _c, _sc, geometry) => {
      geometry.setDrawRange(0, Infinity);
    };
  };

  const batchFor = (def: ModelDef): RigBatch => {
    let b = batches.get(def.key);
    if (!b) {
      // 会动的单位(英雄/小兵/野怪)被地形挡住时画透视剪影；建筑够高，不需要
      const xray = def.key.startsWith('hero:') || def.key.startsWith('minion:') || def.key.startsWith('monster:');
      b = new RigBatch(def.geometry, def.rig.count, capacityFor(def.key), { outline: outlineFor(def), xray }, def.key);
      b.setShadows(shadows);
      b.setOutlineVisible(outlines);
      installPassLod(b, def);
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
    // 两队小兵共用几何：红方把石铁本体压成暖调的玄铁(布件与发光缝走队伍色蒙版，不受影响)
    if (u.kind === 'minion' && u.team === 1) look.body.copy(colors.redIron);
    let scale = VIEW_SCALE[u.kind];
    if (u.kind === 'hero') {
      const h = def.height * def.scale * scale;
      scale *= (h > HERO_VIEW_HEIGHT[1] ? HERO_VIEW_HEIGHT[1] / h : h < HERO_VIEW_HEIGHT[0] ? HERO_VIEW_HEIGHT[0] / h : 1) * (HERO_VIEW_TRIM[u.heroId] ?? 1);
    }
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
      flashBoost: 0,
      // 视图创建之前挨的打不补闪(读档 / 时间轴跳变 / 从迷雾里走出来)
      flashStart: -999,
      flashSeen: u.lastHitTime,
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
      tintColor: new THREE.Color(1, 1, 1),
      pulseColor: new THREE.Color(1, 1, 1),
      pulseAmount: 0,
      pulseDur: 0,
      pulseLeft: 0,
      rimDur: 0,
      rimLeft: 0,
      // 对局中新刷出来的野怪播出生演出；开局 / 读档 / 时间轴跳变后已在场的不播
      spawnT: booted && u.kind === 'monster' && (def.spawnDur ?? 0) > 0 && u.alive ? 0 : -1,
      hitT: 99,
      mode: 0,
      special: false,
      // 一出现就处于无敌态的建筑(开局的二塔、高地塔、水晶)：护罩直接是满的
      shield: STATIC_KINDS[u.kind] && u.invulnerable && u.alive ? 1 : 0,
      shieldBreak: -1,
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

    // 受击闪亮(见 FLASH_* 的说明)：新挨的一下距上次起闪够久才重新起闪
    const since = tRender - u.lastHitTime;
    if (u.lastHitTime !== v.flashSeen) {
      v.flashSeen = u.lastHitTime;
      if (u.lastHitTime - v.flashStart >= FLASH_REARM || u.lastHitTime < v.flashStart) v.flashStart = u.lastHitTime;
    }
    const fT = tRender - v.flashStart;
    const fEnv = fT >= 0 && fT < FLASH_DUR && u.alive ? (1 - fT / FLASH_DUR) ** 2 : 0;
    v.flashBoost = fEnv * FLASH_BOOST;
    v.flash = fEnv * (STATIC_KINDS[u.kind] || (u.kind === 'monster' && u.radius >= 1.2) ? FLASH_WHITE_BIG : FLASH_WHITE);

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
    inp.team = v.team;
    inp.mode = 0;
    v.hitT = since >= 0 ? since : 99;
    inp.hitT = v.hitT;
    if (v.spawnT >= 0) {
      // 出生演出：播完或中途受击就结束(立刻切回战斗姿态)
      const dur = v.def.spawnDur ?? 0;
      if (v.spawnT >= dur || since < v.spawnT || !u.alive) v.spawnT = -1;
    }
    inp.spawnT = v.spawnT;
    if (u.kind === 'monster') {
      // 每第三次出手用特殊动作(出手时锁定)；有仇恨目标 = 警戒
      if (newSwing) v.special = v.variant % 3 === 0;
      if (v.special && u.anim === 'attack') inp.mode |= 1;
      if (u.targetId >= 0) inp.mode |= 2;
    } else if (u.kind === 'tower' || u.kind === 'core') {
      if (u.invulnerable) inp.mode |= 1;
      if (u.targetId >= 0 && views.get(u.targetId)?.kind === 'hero') inp.mode |= 2;
      // 无敌护罩：在场时淡入；解除(前一座塔被毁)时碎开淡出
      if (u.invulnerable && u.alive) {
        v.shield = Math.min(1, v.shield + frame.dt * 2.5);
        v.shieldBreak = -1;
      } else if (v.shield > 0) {
        v.shieldBreak = Math.max(0, v.shieldBreak) + frame.dt / SHIELD_BREAK;
        if (v.shieldBreak >= 1) {
          v.shield = 0;
          v.shieldBreak = -1;
        }
      }
    }
    if (u.kind === 'hero') {
      for (let i = 0; i < u.buffs.length; i++) {
        const b = u.buffs[i];
        // 樊哙：攒满两层后的下一击(第三击)用重击动作——在出手那一刻锁定，命中后层数清零也不会中途换动作；壁垒期间举盾
        if (newSwing && ((b.id === 'panyue_passive' && b.stacks >= 2) || b.id === 'fengling_crit' || b.id === 'chijin_ember')) v.special = true;
        else if (b.id === 'panyue_bulwark') inp.mode |= 2;
      }
      if (v.special && u.anim === 'attack') inp.mode |= 1;
    }
    v.mode = inp.mode;

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

    if (v.spawnT >= 0) v.spawnT += dt;
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
      inp.spawnT = -1;
      inp.hitT = 99;
    }
    if (v.culled || v.fresh) v.puppet.snap();
    v.culled = false;
    v.fresh = false;
    // 过渡键：同一种动作的又一次开始、状态位变化(警戒 / 举盾)、出生演出的起止，都从上一帧的定格姿态平滑过渡
    v.puppet.update(v.lastStart + v.mode * 1e-4 + (inp.spawnT >= 0 ? 5e-4 : 0), dt, v.x, v.y + v.lift, v.z, v.yaw, v.scale);

    const look = v.look;
    const po = v.puppet.output;
    look.opacity = v.opacity;
    look.flash = v.flash;
    look.glow = po.glow;
    // 受击提亮：本体乘色与队伍色一起乘亮(红方小兵的本体乘色是玄铁色，其余为白)
    const fk = 1 + v.flashBoost;
    look.body.copy(v.kind === 'minion' && v.team === 1 ? colors.redIron : WHITE).multiplyScalar(fk);
    look.team.copy(teamColor(v.team)).multiplyScalar(fk);
    // 一次性染色按剩余时间线性衰减；与常驻染色、模型自己的染色三者取最强的一份
    let extAmount = v.tintAmount;
    let extColor = v.tintColor;
    if (v.pulseLeft > 0) {
      v.pulseLeft -= dt;
      const pa = v.pulseLeft > 0 ? v.pulseAmount * (v.pulseLeft / v.pulseDur) : 0;
      if (pa > extAmount) {
        extAmount = pa;
        extColor = v.pulseColor;
      }
    }
    if (po.tint > extAmount) {
      look.tint.setHex(po.tintColor);
      look.tintAmount = po.tint;
    } else {
      look.tint.copy(extColor);
      look.tintAmount = extAmount;
    }
    // 描边掺金：星陨祝福期间己队英雄与小兵常驻暗金(剩 5 秒起闪烁)，河道巨龙奖励到手时亮金一闪；小兵另外自发光 ×1.3
    let rim = 0;
    const bless = v.alive && v.dying < 0 && v.team !== 2 && (v.kind === 'hero' || v.kind === 'minion') ? blessLeft[v.team] : 0;
    if (bless > 0) {
      rim = bless < 5 ? 0.3 + 0.22 * Math.cos(time * 9) : 0.52;
      if (v.kind === 'minion') look.glow *= 1.3;
    }
    if (v.rimLeft > 0) {
      v.rimLeft -= dt;
      if (v.rimLeft > 0) rim = Math.max(rim, Math.min(1, (v.rimLeft / v.rimDur) * 3));
    }
    look.rim = rim;
    // 透视剪影：敌红友蓝己绿、野怪金；倒地/离场的不画
    // (出生演出里身体有一段在地面 / 水面以下：不画剪影，否则整只会透出来)
    look.xrayAmount = v.alive && v.dying < 0 && v.spawnT < 0 ? 1 : 0;
    look.xray.copy(v.isPlayer ? colors.xSelf : v.team === 2 ? colors.xNeutral : v.team === playerTeam ? colors.xAlly : colors.xEnemy);
    if (v.dying >= 0 && Number.isFinite(v.deathDur)) {
      // 演出的最后一段抖动淡出
      const left = v.deathDur - v.dying;
      if (left < 0.4) look.opacity = Math.max(0, v.opacity * (left / 0.4));
    }
    v.batch.push(v.puppet.skeleton, look);
    instanceCount++;

    // 无敌护罩：塔罩住塔身(到托举核心的冠沿)，水晶罩住整颗星核
    if (v.shield > 0 && v.team !== 2 && v.dying < 0) {
      const crack = Math.max(0, v.shieldBreak);
      if (v.kind === 'core') shields.push(v.x, 0.95, v.z, 3.05, 5.4, 16, colors.shield[v.team], v.shield * v.opacity, crack);
      else shields.push(v.x, 0.36, v.z, v.height > 9.2 ? 2.1 : 1.9, v.height - 3.3, 12, colors.shield[v.team], v.shield * v.opacity, crack);
    }

    // 脚下标记
    if (!STATIC_KINDS[v.kind] && v.dying < 0) {
      const water = ctx.terrain.inWater(v.x, v.z);
      const gy = water ? ctx.terrain.waterLevel + 0.03 : v.y / 0.6 + 0.05;
      const fade = v.opacity * (shadows ? 1 : 1.4);
      const squash = 1 / (1 + v.lift * 0.35);
      // 两层：脚下小而实的芯 + 顺着投影方向偏出去的椭圆软影(腾空时芯变淡、软影甩得更远)
      const off = v.radius * 0.25 + v.lift * 0.5;
      rings.push(v.x, gy, v.z, v.radius * 0.62 * squash, colors.shadow, 0.45 * fade * squash, RING_BLOB);
      rings.push(v.x + shadowDx * off, gy, v.z + shadowDz * off, v.radius * 1.5 * squash, colors.shadow, 0.3 * fade * squash, RING_BLOB, shadowAngle, 1.45);
      if (v.ring >= 0 && v.alive) {
        const c = v.isPlayer ? colors.player : teamColor(v.team);
        rings.push(v.x, gy + 0.01, v.z, v.radius * (v.kind === 'hero' ? 1.3 : 1.15), c, (v.kind === 'hero' ? 0.85 : 0.6) * fade, v.ring, Math.PI / 2 - v.yaw);
        // 星陨祝福：小兵的队伍环外再套一道细金边(英雄脚下的星轨环由特效层的状态环画)
        if (bless > 0 && v.kind === 'minion') rings.push(v.x, gy + 0.012, v.z, v.radius * 1.34, colors.blessRing, (bless < 5 ? 0.35 + 0.25 * Math.cos(time * 9) : 0.6) * fade, RING_MINION);
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
      blessLeft[0] = st.teams[0].blessingLeft;
      blessLeft[1] = st.teams[1].blessingLeft;
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
      shields.begin();
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
          v.flashBoost = 0;
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
        // 护罩的着色器也在预热帧里编掉(开局镜头里不一定有无敌态的建筑)
        shields.push(_focus.x, 0.36, _focus.z, 1.9, 4, 12, colors.shield[0], 1, 0);
      }

      for (let i = 0; i < batchList.length; i++) batchList[i].end();
      rings.end();
      shields.end();
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
      quality = s.name;
      outlines = s.name !== 'low';
      shadows = s.shadows;
      for (const b of batchList) {
        b.setShadows(shadows);
        b.setOutlineVisible(outlines);
        const pr = passRanges.get(b);
        if (pr) computeRange(pr.def, pr.range);
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
      out.variant = v.variant;
      out.spawning = v.spawnT >= 0 && v.dying < 0;
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
      v.tintColor.set(color);
      v.tintAmount = amount;
    },
    flashTint(id, color, amount, dur) {
      const v = views.get(id);
      if (!v || !(dur > 0)) return;
      v.pulseColor.set(color);
      v.pulseAmount = amount;
      v.pulseDur = dur;
      v.pulseLeft = dur;
    },
    flashRim(id, dur) {
      const v = views.get(id);
      if (!v || !(dur > 0)) return;
      v.rimDur = dur;
      v.rimLeft = dur;
    },
    reset() {
      clearViews();
      lastStateTime = -1;
    },
    dispose() {
      ctx.layers.units.remove(root);
      for (const b of batchList) b.dispose();
      passRanges.clear();
      rings.dispose();
      shields.dispose();
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
