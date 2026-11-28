/**
 * 环绕/飞行相机：状态为 (注视点, 方位角, 俯仰角, 距离)，用户输入改目标状态，
 * 当前状态按指数阻尼追随；切换机位用带缓动的补间。相机始终不低于地面 2 m。
 *
 * 方位角 yaw：相机在注视点的哪一侧（three 坐标）。yaw = 0 时相机在注视点南面（+Z）向北看。
 */
import { MathUtils, Vector3, type PerspectiveCamera } from 'three';
import { simMetresToThree, threeToSim } from '../coords';
import type { HeightFn } from '../data/terrain';
import type { RideLook } from './ride-look'; // [r4:street]

export interface View {
  target: Vector3;
  yaw: number;
  pitch: number;
  distance: number;
}

export interface RigBounds {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

const PITCH_MIN = -0.12;
const PITCH_MAX = 1.5;
const DIST_MIN = 12;
const DIST_MAX = 3200;
const TARGET_MAX_Y = 420;
const CLEARANCE_M = 2;
/** R4（S-P1-7）：调试机位（lookFrom）允许的最低眼高（离地，m），行人路机位用真实的 1.6 m 眼高；玩家操作仍是 CLEARANCE_M。 */
export const DEBUG_CLEARANCE_M = 1.5;
const DAMPING = 12;

function cloneView(v: View): View {
  return { target: v.target.clone(), yaw: v.yaw, pitch: v.pitch, distance: v.distance };
}

/** 由眼点与注视点（模拟坐标，米）求视图。 */
export function viewFromEye(eye: readonly [number, number, number], target: readonly [number, number, number]): View {
  const e = new Vector3(...simMetresToThree(...eye));
  const t = new Vector3(...simMetresToThree(...target));
  const off = e.sub(t);
  const distance = off.length();
  return { target: t, yaw: Math.atan2(off.x, off.z), pitch: Math.asin(off.y / distance), distance };
}

const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

export class OrbitRig {
  readonly current: View;
  private goal: View;
  private tween: { from: View; to: View; t: number; duration: number } | null = null;
  private readonly position = new Vector3();
  /**
   * 跟随机位（R2 搭電車）：每帧给出眼点与注视点（three 坐标），R4 起另给相机上方向（车身侧倾）。
   * R4：带 look（转头看）时，拖动 / 方向键改的是视线（不退出），捏合 / 滚轮 / 平移不理；换机位、再按「搭電車」才退出。
   */
  private follow: ((eye: Vector3, target: Vector3, up: Vector3) => boolean) | null = null;
  private look: RideLook | null = null;
  private readonly fUp = new Vector3(0, 1, 0);
  /** 本次机位允许的最低眼高（离地）：玩家操作 CLEARANCE_M，调试机位可以更低。 */
  private clearance = CLEARANCE_M;
  private readonly fOff = new Vector3();
  /** 退出跟随时通知（HUD 复位按钮）。 */
  onFollowEnd: (() => void) | null = null;
  private readonly fEye = new Vector3();
  private readonly fTarget = new Vector3();

  constructor(
    initial: View,
    private readonly bounds: RigBounds,
    private readonly ground: HeightFn,
  ) {
    this.current = cloneView(initial);
    this.goal = cloneView(initial);
  }

  /** 平滑飞到某视图。clearanceM：调试机位允许更低的眼高（≥ DEBUG_CLEARANCE_M）。 */
  flyTo(v: View, duration = 1.6, clearanceM = CLEARANCE_M): void {
    this.endFollow();
    this.clearance = Math.max(clearanceM, DEBUG_CLEARANCE_M);
    this.tween = { from: cloneView(this.current), to: cloneView(v), t: 0, duration };
  }

  /** 进入跟随机位（fn 返回 false 时本帧保持原状态）；look 给出时拖动改视线、不退出（R4 搭電車）。 */
  setFollow(fn: ((eye: Vector3, target: Vector3, up: Vector3) => boolean) | null, look: RideLook | null = null): void {
    this.tween = null;
    this.follow = fn;
    this.look = fn ? look : null;
    if (!fn) this.goal = cloneView(this.current);
  }

  get following(): boolean {
    return this.follow !== null;
  }

  /** R4：正在搭电车、拖动改视线。 */
  get lookMode(): boolean {
    return this.follow !== null && this.look !== null;
  }

  /** R4：按视线约定（左正、上正，rad）转头；只在 lookMode 下生效。 */
  lookBy(dYaw: number, dPitch: number): void {
    this.look?.nudge(dYaw, dPitch);
  }

  /** 结束跟随（R4：再按「搭電車」下车）。 */
  stopFollow(): void {
    this.endFollow();
  }

  private endFollow(): void {
    if (!this.follow) return;
    this.follow = null;
    this.look = null;
    this.goal = cloneView(this.current);
    this.onFollowEnd?.();
  }

  private interrupt(): void {
    this.endFollow();
    this.clearance = CLEARANCE_M;
    if (!this.tween) return;
    this.tween = null;
    this.goal = cloneView(this.current);
  }

  rotate(dYaw: number, dPitch: number): void {
    // R4 搭電車：拖动 = 转头（抓着画面拖：往右拖看左边、往下拖抬头）
    if (this.lookMode) {
      this.look!.nudge(-dYaw, dPitch);
      return;
    }
    this.interrupt();
    this.goal.yaw += dYaw;
    this.goal.pitch = MathUtils.clamp(this.goal.pitch + dPitch, PITCH_MIN, PITCH_MAX);
  }

  zoom(factor: number): void {
    if (this.lookMode) return; // R4：捏合 / 滚轮不下车
    this.interrupt();
    this.goal.distance = MathUtils.clamp(this.goal.distance * factor, DIST_MIN, DIST_MAX);
  }

  /** 平移：right / forward 为米（相机水平朝向坐标系）。 */
  pan(right: number, forward: number): void {
    if (this.lookMode) return; // R4：双指平移不下车
    this.interrupt();
    const y = this.goal.yaw;
    this.goal.target.x += Math.cos(y) * right - Math.sin(y) * forward;
    this.goal.target.z += -Math.sin(y) * right - Math.cos(y) * forward;
    this.clampTarget(this.goal.target);
  }

  /** 屏幕上一个像素对应注视点处多少米。 */
  metresPerPixel(fovDeg: number, viewportH: number): number {
    return (2 * this.current.distance * Math.tan((fovDeg * Math.PI) / 360)) / Math.max(viewportH, 1);
  }

  private clampTarget(t: Vector3): void {
    t.x = MathUtils.clamp(t.x, this.bounds.minX, this.bounds.maxX);
    t.z = MathUtils.clamp(t.z, this.bounds.minZ, this.bounds.maxZ);
    t.y = MathUtils.clamp(t.y, 0, TARGET_MAX_Y);
  }

  update(dt: number): void {
    this.look?.update(dt);
    const c = this.current;
    if (this.tween) {
      const tw = this.tween;
      tw.t = Math.min(tw.t + dt / tw.duration, 1);
      const k = ease(tw.t);
      c.target.lerpVectors(tw.from.target, tw.to.target, k);
      const dy = Math.atan2(Math.sin(tw.to.yaw - tw.from.yaw), Math.cos(tw.to.yaw - tw.from.yaw));
      c.yaw = tw.from.yaw + dy * k;
      c.pitch = MathUtils.lerp(tw.from.pitch, tw.to.pitch, k);
      // 距离在对数空间插值，远近切换更自然
      c.distance = Math.exp(MathUtils.lerp(Math.log(tw.from.distance), Math.log(tw.to.distance), k));
      if (tw.t >= 1) {
        this.tween = null;
        this.goal = cloneView(c);
      }
      return;
    }
    const k = 1 - Math.exp(-DAMPING * dt);
    const g = this.goal;
    c.target.lerp(g.target, k);
    c.yaw += (g.yaw - c.yaw) * k;
    c.pitch += (g.pitch - c.pitch) * k;
    c.distance = Math.exp(MathUtils.lerp(Math.log(c.distance), Math.log(g.distance), k));
  }

  /** 把当前状态写进相机（含贴地限制与近裁剪面）。 */
  apply(camera: PerspectiveCamera): void {
    const c = this.current;
    // 跟随的对象没了（例如搭的电车快到路线终点）：结束跟随，从当前机位接着转
    this.fUp.set(0, 1, 0);
    if (this.follow && !this.follow(this.fEye, this.fTarget, this.fUp)) this.endFollow();
    if (this.follow) {
      // 跟随：相机直接放在眼点；同时把轨道状态同步过去（退出跟随时从这里接着转）
      const off = this.fOff.copy(this.fEye).sub(this.fTarget);
      c.target.copy(this.fTarget);
      c.distance = off.length();
      c.yaw = Math.atan2(off.x, off.z);
      c.pitch = Math.asin(MathUtils.clamp(off.y / c.distance, -1, 1));
      camera.position.copy(this.fEye);
      // R4：车身侧倾写进相机上方向（只在跟随时；之后复位为世界上方向）
      camera.up.copy(this.fUp);
      camera.lookAt(this.fTarget);
      camera.up.set(0, 1, 0);
      if (Math.abs(camera.near - 0.3) > 0.05) {
        camera.near = 0.3;
        camera.updateProjectionMatrix();
      }
      return;
    }
    const cp = Math.cos(c.pitch);
    this.position.set(Math.sin(c.yaw) * cp, Math.sin(c.pitch), Math.cos(c.yaw) * cp).multiplyScalar(c.distance).add(c.target);
    const [sx, sy] = threeToSim(this.position.x, 0, this.position.z);
    const floor = this.ground(sx, sy) / 10 + this.clearance;
    if (this.position.y < floor) this.position.y = floor;
    camera.position.copy(this.position);
    camera.lookAt(c.target);
    const near = MathUtils.clamp(c.distance * 0.006, 0.5, 6);
    if (Math.abs(camera.near - near) > 0.05) {
      camera.near = near;
      camera.updateProjectionMatrix();
    }
  }
}
