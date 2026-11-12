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
  /** 模型自定义的状态位(如 磐岳的壁垒姿态) */
  mode: number;
  /** 被摧毁/死亡后的演出时间(秒)；存活时为 -1。建筑坍塌、小兵散架用 */
  deathT: number;
}

export interface AnimOutput {
  /** 自发光倍率(施法辉光 / 塔蓄能) */
  glow: number;
}

/** 挂点：某关节局部坐标里的一点 */
export interface AttachPoint {
  joint: number;
  x: number;
  y: number;
  z: number;
}

export type AttachName = 'head' | 'chest' | 'handR' | 'handL' | 'weapon' | 'muzzle' | 'core';

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
  /** 状态切换时的过渡时长(秒) */
  blend(from: UnitAnim, to: UnitAnim): number;
  /** 填充姿态。pose 已 reset 到绑定姿态 */
  animate(pose: Pose, a: AnimInput, out: AnimOutput): void;
}

export function createAnimInput(): AnimInput {
  return { anim: 'idle', p: 0, t: 0, time: 0, stride: 0, speed: 0, variant: 0, seed: 0, hp: 1, windup: 0.35, mode: 0, deathT: -1 };
}
