/**
 * 搭電車的「转头看」（R4 STREET S-P0-3，纯逻辑，可测）：坐在上层车头，相对电车的偏航 / 俯仰。
 * - 鼠标拖动、单指拖动、方向键改目标角；当前角按时间常数 EASE_S 平滑追随（≥ 0.15 s 的缓动）；
 * - 偏航 ±120°（左正）、俯仰 −35°…+25°（上正）；默认（「向前」）是正前方、略往下 DEFAULT_PITCH；
 * - 用户停手 idleReturnS 秒（默认 6 s，0 = 不自动回正）后慢慢转回前方；按「向前」立刻回正；
 * - 调试钩子 rideLook 设的角「钉住」（不自动回正），直到下一次用户输入。
 */

const D = Math.PI / 180;

export const RIDE_LOOK = {
  yawMax: 120 * D,
  pitchMin: -35 * D,
  pitchMax: 25 * D,
  /** 默认俯角（rad）：看得到路面、对面行人路与二三楼。 */
  defaultPitch: -6 * D,
  /** 追随时间常数（s）。 */
  easeS: 0.18,
  /** 自动回正的时间常数（s，慢一点）。 */
  returnS: 0.9,
  /** 停手多久自动回正（s）。 */
  idleReturnS: 6,
} as const;

const clamp = (v: number, a: number, b: number) => Math.min(Math.max(v, a), b);

export class RideLook {
  /** 当前角（rad）：偏航左正、俯仰上正。 */
  yaw = 0;
  pitch: number = RIDE_LOOK.defaultPitch;
  goalYaw = 0;
  goalPitch: number = RIDE_LOOK.defaultPitch;
  private idle = 0;
  private sticky = false;
  private returning = false;

  constructor(public idleReturnS: number = RIDE_LOOK.idleReturnS) {}

  /** 用户输入：增量（rad）。 */
  nudge(dYaw: number, dPitch: number): void {
    this.goalYaw = clamp(this.goalYaw + dYaw, -RIDE_LOOK.yawMax, RIDE_LOOK.yawMax);
    this.goalPitch = clamp(this.goalPitch + dPitch, RIDE_LOOK.pitchMin, RIDE_LOOK.pitchMax);
    this.idle = 0;
    this.sticky = false;
    this.returning = false;
  }

  /** 直接设角（rad）；instant 时当前角也跳过去；sticky 时不自动回正（调试钩子）。 */
  set(yaw: number, pitch: number, instant = false, sticky = true): void {
    this.goalYaw = clamp(yaw, -RIDE_LOOK.yawMax, RIDE_LOOK.yawMax);
    this.goalPitch = clamp(pitch, RIDE_LOOK.pitchMin, RIDE_LOOK.pitchMax);
    if (instant) {
      this.yaw = this.goalYaw;
      this.pitch = this.goalPitch;
    }
    this.idle = 0;
    this.sticky = sticky;
    this.returning = false;
  }

  /** 「向前」：回到正前方。 */
  front(): void {
    this.goalYaw = 0;
    this.goalPitch = RIDE_LOOK.defaultPitch;
    this.sticky = false;
    this.returning = false;
    this.idle = 0;
  }

  /** 上车 / 下车时复位。 */
  reset(): void {
    this.yaw = this.goalYaw = 0;
    this.pitch = this.goalPitch = RIDE_LOOK.defaultPitch;
    this.idle = 0;
    this.sticky = false;
    this.returning = false;
  }

  /** 是否正看着前方（误差 < 1°）。 */
  get atFront(): boolean {
    return Math.abs(this.goalYaw) < D && Math.abs(this.goalPitch - RIDE_LOOK.defaultPitch) < D;
  }

  update(dt: number): void {
    if (!(dt > 0)) return;
    this.idle += dt;
    if (!this.sticky && this.idleReturnS > 0 && this.idle > this.idleReturnS && !this.atFront) {
      this.goalYaw = 0;
      this.goalPitch = RIDE_LOOK.defaultPitch;
      this.returning = true;
    }
    const tau = this.returning ? RIDE_LOOK.returnS : RIDE_LOOK.easeS;
    const k = 1 - Math.exp(-dt / tau);
    this.yaw += (this.goalYaw - this.yaw) * k;
    this.pitch += (this.goalPitch - this.pitch) * k;
    if (this.returning && this.atFront && Math.abs(this.yaw) < 0.002) this.returning = false;
  }
}
