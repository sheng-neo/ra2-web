/**
 * 搭電車的车身晃动（R4 STREET S-P0-3，纯逻辑，可测）：
 * - 俯仰 ≤ 0.6°：加速抬头、刹车点头（按纵向加速度，|a| = 1.2 m/s² 时到上限）；
 * - 侧倾 ≤ 0.5°：弯道上车身往外倾（按横向加速度 v²κ，2 m/s² 到上限）；
 * - 两者都是临界阻尼弹簧（ω = 6 rad/s，停站时不抖）；
 * - 竖向：1.1–1.6 Hz 的轻微起伏（随车速，≤ 1.2 cm）+ 每 12 m 一道轨缝的小颠（≤ 0.8 cm，指数衰减）：合计 ≤ 2 cm。
 * dt 太大（快进）时按 ≤ 1/30 s 分步，避免弹簧发散。
 */

const D = Math.PI / 180;

export const RIDE_MOTION = {
  pitchMax: 0.6 * D,
  rollMax: 0.5 * D,
  /** 纵向加速度到俯仰的系数（rad / (m/s²)）。 */
  pitchPerAcc: (0.6 * D) / 1.2,
  /** 横向加速度到侧倾的系数（rad / (m/s²)）。 */
  rollPerLat: (0.5 * D) / 2,
  omega: 6,
  bobM: 0.012,
  jointM: 0.008,
  jointEveryM: 12,
} as const;

const clamp = (v: number, a: number, b: number) => Math.min(Math.max(v, a), b);

export class RideMotion {
  /** 俯仰（rad，抬头正）、侧倾（rad，右侧下沉正）、竖向偏移（m）。 */
  pitch = 0;
  roll = 0;
  lift = 0;
  private vp = 0;
  private vr = 0;
  private lastV = Number.NaN;
  private phase = 0;
  private joint = 0;
  private lastJoint = Number.NaN;

  reset(): void {
    this.pitch = this.roll = this.lift = this.vp = this.vr = this.phase = this.joint = 0;
    this.lastV = Number.NaN;
    this.lastJoint = Number.NaN;
  }

  /** dt 秒后：speed（m/s）、curvature（1/m，左转正）、s（沿线位置 m）。 */
  update(dt: number, speed: number, curvature: number, s: number): void {
    if (!(dt > 0)) return;
    const acc = Number.isFinite(this.lastV) ? (speed - this.lastV) / dt : 0;
    this.lastV = speed;
    const pitchT = clamp(acc * RIDE_MOTION.pitchPerAcc, -RIDE_MOTION.pitchMax, RIDE_MOTION.pitchMax);
    const rollT = clamp(speed * speed * curvature * RIDE_MOTION.rollPerLat, -RIDE_MOTION.rollMax, RIDE_MOTION.rollMax);
    const w = RIDE_MOTION.omega;
    const steps = Math.max(1, Math.ceil(dt / (1 / 30)));
    const h = dt / steps;
    for (let i = 0; i < steps; i++) {
      this.vp += (w * w * (pitchT - this.pitch) - 2 * w * this.vp) * h;
      this.pitch += this.vp * h;
      this.vr += (w * w * (rollT - this.roll) - 2 * w * this.vr) * h;
      this.roll += this.vr * h;
    }
    this.pitch = clamp(this.pitch, -RIDE_MOTION.pitchMax, RIDE_MOTION.pitchMax);
    this.roll = clamp(this.roll, -RIDE_MOTION.rollMax, RIDE_MOTION.rollMax);
    const k = Math.min(speed / 6, 1);
    this.phase += dt * Math.PI * 2 * (1.1 + 0.08 * Math.min(speed, 6));
    const j = Math.floor(s / RIDE_MOTION.jointEveryM);
    if (Number.isFinite(this.lastJoint) && j !== this.lastJoint && speed > 1) this.joint = RIDE_MOTION.jointM * k;
    this.lastJoint = j;
    this.joint *= Math.exp(-dt * 12);
    this.lift = RIDE_MOTION.bobM * k * Math.sin(this.phase) + this.joint;
  }
}
