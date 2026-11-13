/**
 * 相机装置：朝北(-z)看的透视相机，平滑跟随目标、按「屏幕占比」夹取地图边界、peek 覆盖、瞄准时的镜头前探、震屏。
 *
 * 取景(总监定的指标：1280×720 下英雄站立约 105~125 像素高，同时装下最远的技能射程)：
 *   横屏  俯角 46°、垂直 FOV 32°、距离 27.5 米。16:9 下以英雄为准：左右各约 14.3 米、向北约 14.5 米、向南约 9.3 米
 *         (透视下近处被放大，南向装不下 14 米；瞄准长射程技能时镜头会朝瞄准方向前探，见 setReach)。
 *         英雄脚底在屏幕高度约 46.5% 处(略高于中心：下方有状态栏/技能键)。
 *   竖屏  横向太窄：加大 FOV 并拉远到左右各 7.5 米，俯角加到 54°(少看一些被压扁的远处)，英雄放在约 43% 高度(下半屏是摇杆与技能键)。
 * 边界夹取不用固定米数而用屏幕占比：地图边线最多退到屏幕的某个位置，界外装饰带在任何宽高比下都只占一小条。
 */
import * as THREE from 'three';

const DEG = Math.PI / 180;
/** 横屏基准：俯角 / 垂直 FOV / 到注视点的距离 */
const BASE_PITCH = 46;
const BASE_FOV = 32;
const BASE_DIST = 27.5;
/** 高度 1 米的东西在对局镜头下会挡住它北边多远的地面(= cot 俯角)：地形摆树、裁剪判断都用它 */
export const VIEW_OCCLUDE_PER_METER = 1 / Math.tan(BASE_PITCH * DEG);
/** 竖屏的俯角 */
const PORTRAIT_PITCH = 54;
/** 注视点处最小的横向半视野(米)：再窄就加 FOV、拉远 */
const MIN_HALF_WIDTH = 7.5;
const MAX_FOV = 44;
/** 英雄脚底在屏幕上的纵向位置(NDC，+1 = 上沿)：横屏 / 竖屏 */
const HERO_NDC = 0.07;
const HERO_NDC_PORTRAIT = 0.14;
/** 地图边线最多退到屏幕的哪里(NDC)：北 / 南 / 东西。竖屏时北边放宽(远处被压得很扁)、南边收紧(下半屏是操作区) */
const EDGE_N = 0.42;
const EDGE_N_PORTRAIT = 0.6;
const EDGE_S = 0.5;
const EDGE_S_PORTRAIT = 0.35;
const EDGE_X = 0.5;
/**
 * 瞄准前探：落点要进入的安全框(NDC)，以及前探时英雄自己最多被推到屏幕的哪里。
 * 下沿：横屏 0.66(屏高 83% 处，状态栏之上)；竖屏下半屏是摇杆与技能键，收到 0.35(屏高 67% 处)。
 * 英雄上限 0.4(屏高 30% 处)：再高就顶进顶栏和它下面的指引卡里了。
 */
const REACH_TOP = 0.8;
const REACH_BOTTOM = 0.66;
const REACH_BOTTOM_PORTRAIT = 0.35;
const REACH_X = 0.86;
const REACH_HERO_TOP = 0.4;
const REACH_HERO_BOTTOM = 0.5;
const REACH_HERO_X = 0.6;
/**
 * 鼠标瞄准落点型技能时的「按指针位置下探」：指针的屏幕纵坐标从 POINTER_START 往下到 POINTER_FULL(NDC，负 = 屏幕下半)，
 * 镜头向南的偏移从 0 线性加到「刚好让最大射程落在 POINTER_FULL 处」。偏移只由指针在屏幕上的位置和技能射程决定，
 * 与指针底下的地面点无关——不存在「镜头一动落点跟着跑」的回路。竖屏下沿收紧(同 REACH_BOTTOM)。
 */
const POINTER_START = -0.1;
const POINTER_FULL = 0.72;
const POINTER_FULL_PORTRAIT = 0.35;
/** 高个子取景：玩家贴着史诗野怪(巨灵 8 米多、巨龙近 6 米)时，注视点北移、镜头略拉远，让它的上半身进画面 */
const TALL_SHIFT = 2.6;
const TALL_ZOOM = 0.13;

export interface CameraBounds {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

export class CameraRig {
  readonly camera: THREE.PerspectiveCamera;
  /** 震屏总开关(设置里的「镜头震动」) */
  shakeEnabled = true;
  /** 可走区域的边界(地图 bound)；注视点的夹取范围由它和当前取景按屏幕占比推出 */
  bounds: CameraBounds = { minX: -57.5, maxX: 57.5, minZ: -57.5, maxZ: 57.5 };

  private pitch = BASE_PITCH * DEG;
  private distance = BASE_DIST;
  /** 注视点相对跟随目标向北偏移的米数(负数 = 注视点在英雄南边，英雄显示在屏幕中心偏上) */
  private lead = 0;
  /** 竖屏程度 0..1(宽高比 1 → 0.6 之间过渡) */
  private tall = 0;
  private tanHalf = Math.tan((BASE_FOV / 2) * DEG);
  /** 瞄准时要看见的地面点(世界坐标)与当前前探量 */
  private reach: THREE.Vector3 | null = null;
  private reachX = 0;
  private reachZ = 0;
  /** 指针下探：目标偏移(米，向南为正) */
  private pointerPan = 0;
  /** 高个子取景：目标(0/1)与当前缓动值 */
  private tallWant = 0;
  private tallK = 0;
  private aspect = 16 / 9;
  private follow = new THREE.Vector3();
  private peek: THREE.Vector3 | null = null;
  private focus = new THREE.Vector3();
  private snapped = false;
  private trauma = 0;
  private shakeTime = 0;
  private topView = false;
  private topHalf = 76;
  /** 调试用自由视角(画廊页)：覆盖俯角/距离/方位 */
  private override: { pitch: number; distance: number; yaw: number; fov: number } | null = null;

  constructor() {
    this.camera = new THREE.PerspectiveCamera(BASE_FOV, this.aspect, 1, 900);
    this.camera.up.set(0, 1, 0);
    this.applyLens();
  }

  /** 视口宽高比变化时调用 */
  setAspect(aspect: number): void {
    this.aspect = aspect > 0 ? aspect : 16 / 9;
    this.applyLens();
  }

  private applyLens(): void {
    const cam = this.camera;
    cam.aspect = this.aspect;
    if (this.topView) {
      cam.fov = 30;
      const tanHalf = Math.tan((cam.fov / 2) * DEG);
      this.distance = (this.topHalf * 1.04) / (tanHalf * Math.min(1, this.aspect));
      this.pitch = 89.9 * DEG;
      this.lead = 0;
      cam.near = 20;
      cam.far = this.distance + 300;
    } else if (this.override) {
      cam.fov = this.override.fov;
      this.pitch = this.override.pitch * DEG;
      this.distance = this.override.distance;
      this.lead = 0;
      cam.near = 1;
      cam.far = 1600;
    } else {
      const tall = Math.min(1, Math.max(0, (1 - this.aspect) / 0.4));
      let fov = BASE_FOV;
      let dist = BASE_DIST;
      const halfH = MIN_HALF_WIDTH / this.aspect;
      if (dist * Math.tan((fov / 2) * DEG) < halfH) {
        // 先加 FOV 再拉远
        fov = Math.min(MAX_FOV, (Math.atan(halfH / dist) * 2) / DEG);
        dist = Math.max(dist, halfH / Math.tan((fov / 2) * DEG));
      }
      cam.fov = fov;
      this.tall = tall;
      this.distance = dist;
      this.pitch = (BASE_PITCH + (PORTRAIT_PITCH - BASE_PITCH) * tall) * DEG;
      this.tanHalf = Math.tan((fov / 2) * DEG);
      this.lead = this.groundZ(HERO_NDC + (HERO_NDC_PORTRAIT - HERO_NDC) * tall);
      cam.near = 2;
      cam.far = 900;
    }
    cam.updateProjectionMatrix();
  }

  /** 屏幕纵向 NDC(+1 = 上沿) → 该处地面相对注视点向南的距离(米，北为负)。只对对局取景有意义 */
  private groundZ(ndcY: number): number {
    const k = ndcY * this.tanHalf;
    return (-k * this.distance) / (Math.sin(this.pitch) - k * Math.cos(this.pitch));
  }

  /** 注视点以南 z 米处(北为负)屏幕横向的半视野(米) */
  private halfWidthAt(z: number): number {
    return (this.distance - z * Math.cos(this.pitch)) * this.tanHalf * this.aspect;
  }

  /**
   * 瞄准时希望看见的地面点(技能指示器的末端)；null = 结束瞄准。
   * 该点落在安全框之外时镜头朝它前探(缓动)，英雄自己不会被推出画面。
   */
  setReach(x: number | null, z = 0): void {
    if (x === null) this.reach = null;
    else (this.reach ??= new THREE.Vector3()).set(x, 0, z);
  }

  /**
   * 鼠标瞄准落点型技能：ndcY = 落点在屏幕上的纵坐标(NDC，+1 = 上沿)，range = 技能射程(含想露出来的落点圈余量)。
   * 传 null 结束。与 setReach 互斥(设了 reach 时以 reach 为准)。
   */
  setPointerReach(ndcY: number | null, range = 0): void {
    if (ndcY === null) {
      this.pointerPan = 0;
      return;
    }
    const full = -(POINTER_FULL + (POINTER_FULL_PORTRAIT - POINTER_FULL) * this.tall);
    // 不偏移时，指针放在 full 处能够到英雄以南多远
    const reachable = this.groundZ(full) - this.lead;
    const max = Math.max(0, range - reachable);
    const k = Math.min(1, Math.max(0, (POINTER_START - ndcY) / (POINTER_START - full)));
    this.pointerPan = max * k * k * (3 - 2 * k);
  }

  /** 高个子取景开关(缓入缓出，约 0.4 秒) */
  setTallFocus(on: boolean): void {
    this.tallWant = on ? 1 : 0;
  }

  /** 俯瞰全图的调试相机 */
  setTopView(on: boolean, half = 76): void {
    this.topView = on;
    this.topHalf = half;
    this.applyLens();
    this.snapped = false;
  }

  get isTopView(): boolean {
    return this.topView;
  }

  /** 是否处于调试视角(俯瞰或自由视角) */
  get isDebugView(): boolean {
    return this.topView || this.override !== null;
  }

  /** 调试：自定义俯角(度)/距离/方位角(度，0=朝北)/FOV。传 null 恢复 */
  setOverride(o: { pitch: number; distance: number; yaw?: number; fov?: number } | null): void {
    this.override = o ? { pitch: o.pitch, distance: o.distance, yaw: o.yaw ?? 0, fov: o.fov ?? BASE_FOV } : null;
    this.applyLens();
    this.snapped = false;
  }

  /** 设置跟随目标(地面坐标：模拟层 x,y → 世界 x,z) */
  setFollow(x: number, z: number): void {
    this.follow.set(x, 0, z);
  }

  /** 临时观察某处；null 回到跟随 */
  setPeek(x: number | null, z = 0): void {
    if (x === null) this.peek = null;
    else (this.peek ??= new THREE.Vector3()).set(x, 0, z);
  }

  /** 立即对准目标(开局/复活传送时避免长距离缓动) */
  snap(): void {
    this.snapped = false;
  }

  /** 叠加震屏。strength：0.1 轻击，0.3 技能，0.6+ 大招/击杀 */
  shake(strength: number): void {
    if (!this.shakeEnabled) return;
    this.trauma = Math.min(1, this.trauma + strength);
  }

  /** 当前注视的地面点(已夹取、已缓动) */
  getFocus(out: THREE.Vector3): THREE.Vector3 {
    return out.copy(this.focus);
  }

  /** 相机到注视点的距离 */
  getDistance(): number {
    return this.distance;
  }

  update(dt: number): void {
    const cam = this.camera;
    const b = this.bounds;
    let gx: number;
    let gz: number;
    if (this.topView) {
      gx = 0;
      gz = 0;
    } else {
      const g = this.peek ?? this.follow;
      gx = g.x;
      gz = g.z - (this.peek ? 0 : this.lead);
      if (!this.override) {
        // 瞄准前探：把指示器末端收进安全框
        let wantX = 0;
        let wantZ = 0;
        if (this.reach && !this.peek) {
          const rx = this.reach.x - gx;
          const rz = this.reach.z - gz;
          const zLo = this.groundZ(REACH_TOP);
          const zHi = this.groundZ(-(REACH_BOTTOM + (REACH_BOTTOM_PORTRAIT - REACH_BOTTOM) * this.tall));
          wantZ = rz - Math.min(zHi, Math.max(zLo, rz));
          // 英雄自己(相对注视点在 lead 处)不能被推得太靠边
          wantZ = Math.min(this.lead - this.groundZ(REACH_HERO_TOP), Math.max(this.lead - this.groundZ(-REACH_HERO_BOTTOM), wantZ));
          const half = this.halfWidthAt(rz - wantZ) * REACH_X;
          wantX = rx - Math.min(half, Math.max(-half, rx));
          const heroHalf = this.halfWidthAt(this.lead - wantZ) * REACH_HERO_X;
          wantX = Math.min(heroHalf, Math.max(-heroHalf, wantX));
        } else if (this.pointerPan > 0 && !this.peek) {
          // 指针下探：只向南，英雄同样不能被推得太靠上
          wantZ = Math.min(this.lead - this.groundZ(REACH_HERO_TOP), this.pointerPan);
        }
        const kr = this.snapped ? 1 - Math.exp(-(this.reach || this.pointerPan > 0 ? 7 : 5) * dt) : 1;
        this.reachX += (wantX - this.reachX) * kr;
        this.reachZ += (wantZ - this.reachZ) * kr;
        // 高个子取景(瞄准前探期间让位：两者叠在一起英雄会被推出安全框)
        const tallTarget = this.reach || this.pointerPan > 0 || this.peek ? 0 : this.tallWant;
        this.tallK += (tallTarget - this.tallK) * (this.snapped ? 1 - Math.exp(-6 * dt) : 1);
        if (!this.peek) {
          gx += this.reachX;
          gz += this.reachZ - TALL_SHIFT * this.tallK;
        }
        // 地图边线最多退到屏幕的 EDGE_* 处(按当前取景换算成注视点的范围)
        const t = this.tall;
        const mx = this.halfWidthAt(0) * EDGE_X;
        const mn = -this.groundZ(EDGE_N + (EDGE_N_PORTRAIT - EDGE_N) * t);
        const ms = this.groundZ(-(EDGE_S + (EDGE_S_PORTRAIT - EDGE_S) * t));
        gx = Math.min(Math.max(b.maxX - mx, 0), Math.max(Math.min(b.minX + mx, 0), gx));
        gz = Math.min(Math.max(b.maxZ - ms, 0), Math.max(Math.min(b.minZ + mn, 0), gz));
      }
    }
    if (!this.snapped) {
      this.focus.set(gx, 0, gz);
      this.snapped = true;
    } else {
      // 指数缓动：帧率无关。超远距离(传送/复活)直接跳
      const dx = gx - this.focus.x;
      const dz = gz - this.focus.z;
      if (dx * dx + dz * dz > 45 * 45) this.focus.set(gx, 0, gz);
      else {
        const k = 1 - Math.exp(-(this.peek ? 14 : 9) * dt);
        this.focus.x += dx * k;
        this.focus.z += dz * k;
      }
    }

    const yaw = this.override ? this.override.yaw * DEG : 0;
    const dist = this.topView || this.override ? this.distance : this.distance * (1 + TALL_ZOOM * this.tallK);
    const ch = Math.cos(this.pitch) * dist;
    const cy = Math.sin(this.pitch) * dist;
    cam.position.set(this.focus.x + Math.sin(yaw) * ch, cy, this.focus.z + Math.cos(yaw) * ch);
    cam.up.set(0, 1, 0);
    if (this.topView) cam.up.set(0, 0, -1);
    cam.lookAt(this.focus.x, 0, this.focus.z);

    if (this.trauma > 0) {
      this.shakeTime += dt;
      const t = this.shakeTime;
      const a = this.trauma * this.trauma;
      const sx = Math.sin(t * 61.3) * 0.6 + Math.sin(t * 37.1 + 1.3) * 0.4;
      const sy = Math.sin(t * 53.7 + 2.1) * 0.6 + Math.sin(t * 29.9 + 0.4) * 0.4;
      const sr = Math.sin(t * 44.3 + 4.2);
      // 位移幅度按取景大小折算(基准：屏幕半高对应 10.4 米)：镜头拉近或换成竖屏后，震动在屏幕上的幅度不变
      const k = (this.distance * Math.tan((cam.fov / 2) * DEG) * Math.min(1, this.aspect)) / 10.4;
      cam.translateX(sx * a * 0.55 * k);
      cam.translateY(sy * a * 0.45 * k);
      cam.rotateZ(sr * a * 0.012);
      this.trauma = Math.max(0, this.trauma - dt * 2.4);
    }
    cam.updateMatrixWorld();
  }
}
