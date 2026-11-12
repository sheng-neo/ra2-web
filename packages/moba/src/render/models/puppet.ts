/**
 * Puppet：一个模型实例的动画运行时 = 姿态 + 状态切换时的过渡 + 骨架解算 + 弹簧链。
 * 不持有任何 GPU 资源，画的时候把 skeleton 交给对应模型的 RigBatch。
 */
import type { UnitAnim } from '../../core/types';
import { Pose, Skeleton } from './rig';
import { type AnimInput, type AnimOutput, type AttachName, type ModelDef, createAnimInput } from './types';

export class Puppet {
  readonly input: AnimInput = createAnimInput();
  readonly output: AnimOutput = { glow: 1 };
  readonly pose: Pose;
  readonly skeleton: Skeleton;
  private readonly from: Pose;
  private blendT = 0;
  private blendDur = 0;
  private lastAnim: UnitAnim | null = null;
  private lastKey = NaN;

  constructor(readonly def: ModelDef, seed = 0) {
    this.pose = new Pose(def.rig.count);
    this.from = new Pose(def.rig.count);
    this.skeleton = new Skeleton(def.rig, seed);
    this.input.seed = seed;
  }

  /** 立即采用当前输入的姿态(不做过渡)，并重置弹簧链。单位首次出现/从视野外回来时调用 */
  snap(): void {
    this.lastAnim = null;
    this.blendDur = 0;
    this.skeleton.resetChains();
  }

  /**
   * 推进一帧。key 用于区分「同一种动作的又一次开始」(通常传 animStart)，变化时也会触发过渡。
   * (x, y, z) 为落点世界坐标，yaw 为模型 +Z 绕 Y 轴转到朝向的弧度。
   */
  update(key: number, dt: number, x: number, y: number, z: number, yaw: number, scale = 1): void {
    const a = this.input;
    const def = this.def;
    if (this.lastAnim !== null && (a.anim !== this.lastAnim || key !== this.lastKey)) {
      // 上一帧的最终姿态还在 pose 里：定格下来作为过渡起点
      this.from.copy(this.pose);
      this.blendT = 0;
      this.blendDur = def.blend(this.lastAnim, a.anim);
    }
    this.lastAnim = a.anim;
    this.lastKey = key;
    this.output.glow = 1;
    this.pose.reset();
    def.animate(this.pose, a, this.output);
    if (this.blendT < this.blendDur) {
      const w = this.blendT / this.blendDur;
      this.pose.blendFrom(this.from, w * w * (3 - 2 * w));
      this.blendT += dt;
    }
    this.skeleton.solve(this.pose, x, y, z, yaw, scale * def.scale);
    this.skeleton.simulate(this.pose, dt, a.time);
  }

  /** 弹簧链沉降到静止(定格展示用) */
  settle(): void {
    this.skeleton.settle(this.pose, this.input.time);
  }

  /** 挂点的世界坐标。模型没有该挂点时返回 false */
  attach(name: AttachName, out: { x: number; y: number; z: number }): boolean {
    const p = this.def.attach[name];
    if (!p) return false;
    this.skeleton.point(p.joint, p.x, p.y, p.z, out);
    return true;
  }
}
