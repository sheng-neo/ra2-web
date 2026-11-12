/**
 * 模型定义的公共接口：几何 + 骨架 + 程序动画。单位视图管理器 / 英雄展示 / 头像 / 画廊页都通过它使用模型。
 */
import type * as THREE from 'three';
import type { UnitAnim } from '../../core/types';
import type { Pose, Rig } from './rig';

/** 驱动一帧动画所需的全部输入(同一个对象逐帧复用) */
export interface AnimInput {
  anim: UnitAnim;
  /** 有时长的动作的进度 0..1(已截断)；循环动作恒为 0 */
  p: number;
  /** 进入该动作以来的秒数(模拟时间) */
  t: number;
  /** 渲染累计时间(秒)：呼吸/漂浮等循环的时基 */
  time: number;
  /** 跑步循环相位 0..1(按实际位移累加，脚不打滑) */
  stride: number;
  /** 当前水平速度(米/秒) */
  speed: number;
  /** 出手序号：交替左右手 / 第三击重击 等 */
  variant: number;
  /** 每个单位固定的随机数 0..1(错开待机相位) */
  seed: number;
  /** 生命比例 0..1(建筑的受损状态) */
  hp: number;
  /** 普攻命中点占整个出手动作的比例 */
  windup: number;
  /**
   * 模型自定义的状态位。英雄：bit0 = 本次普攻是强化的一击，bit1 = 樊哙拥盾姿态。
   * 野怪：bit0 = 本次出手用特殊动作(每第三击)，bit1 = 警戒(有仇恨目标)。
   * 建筑：bit0 = 无敌态(前一座塔未破)，bit1 = 正在锁定英雄。
   */
  mode: number;
  /** 被摧毁/死亡后的演出时间(秒)；存活时为 -1。建筑坍塌、小兵散架用 */
  deathT: number;
  /** 出生演出已播的秒数(模型的 spawnDur 以内)；不在出生演出中为 -1 */
  spawnT: number;
  /** 距上一次受击的秒数(从未受击时是一个很大的数)。受击反应是叠加在当前动作上的短促姿态，不打断动作 */
  hitT: number;
  /** 所属队伍：0 蓝 / 1 红 / 2 中立。两队共用几何的模型据此切换队徽等只属于一方的部件 */
  team: number;
}

export interface AnimOutput {
  /** 自发光倍率(施法辉光 / 塔蓄能) */
  glow: number;
  /** 模型自己要求的整体染色强度 0..1 与颜色(sRGB 十六进制)：出生时的冰封、死亡时的熄灭变灰等。每帧由 Puppet 清零 */
  tint: number;
  tintColor: number;
}

/** 挂点：某关节局部坐标里的一点 */
export interface AttachPoint {
  joint: number;
  x: number;
  y: number;
  z: number;
}

/**
 * 挂点名。通用：head 头 / chest 胸口 / handR handL 手 / weapon 武器尖端 / muzzle 弹道出口 / core 塔与水晶的能量核心。
 * 野怪追加：crest 增益标记(鹿的霜纹晶、熊的火口、龙的渊珠、巨灵的光轮) / tail 尾端 / wingL wingR 翼尖 / vent 喷吐口(龙的口腔、熊的火口)。
 */
export type AttachName = 'head' | 'chest' | 'handR' | 'handL' | 'weapon' | 'muzzle' | 'core' | 'crest' | 'tail' | 'wingL' | 'wingR' | 'vent';

export interface ModelDef {
  key: string;
  geometry: THREE.BufferGeometry;
  rig: Rig;
  /** 头顶高度(米，未缩放)：血条挂点 */
  height: number;
  /** 包围半径(米，未缩放)：拾取/裁剪 */
  radius: number;
  /** 整体缩放 */
  scale: number;
  /** 跑步一个完整循环(两步)前进的距离(米，已含缩放) */
  stride: number;
  triangles: number;
  attach: Partial<Record<AttachName, AttachPoint>>;
  /** 离场后的死亡演出时长(秒)。不给时由单位视图按种类取默认值 */
  deathDur?: number;
  /** 出生演出时长(秒)。不给或为 0 = 没有出生演出 */
  spawnDur?: number;
  /** 描边线宽(CSS 像素)。不给时由单位视图按种类取默认值 */
  outline?: number;
  /** 状态切换时的过渡时长(秒) */
  blend(from: UnitAnim, to: UnitAnim): number;
  /** 填充姿态。pose 已 reset 到绑定姿态 */
  animate(pose: Pose, a: AnimInput, out: AnimOutput): void;
}

export function createAnimInput(): AnimInput {
  return { anim: 'idle', p: 0, t: 0, time: 0, stride: 0, speed: 0, variant: 0, seed: 0, hp: 1, windup: 0.35, mode: 0, deathT: -1, spawnT: -1, hitT: 99, team: 0 };
}
