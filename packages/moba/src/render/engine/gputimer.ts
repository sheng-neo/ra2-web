/**
 * GPU 计时(诊断用，默认不启用)：URL 带 `?gpuTimings=1` 时，用 EXT_disjoint_timer_query_webgl2 把每帧的 GPU 耗时分成
 * 阴影 / 场景 / 后期 三段，每 60 帧取一次平均：写进 `engine.gpuTimings`(也经 getStats().gpu 透出)，并在控制台打一行。
 *
 * 用法(真机上复核「medium 档中端手机 30 帧」)：打开 `…/?quality=medium&gpuTimings=1`，看控制台的
 *   [moba] GPU ms/帧 阴影 x.xx · 场景 x.xx · 后期 x.xx · 合计 x.xx
 * 三段加起来就是这一帧 GPU 真正花的时间(与 JS 侧的 render 耗时无关)。
 *
 * 实现要点：
 * - TIME_ELAPSED 查询不能嵌套，所以做成「切段」：begin(段) 先结束上一段再开新的一段；一帧里同一段可以出现多次(累加)。
 * - 结果是异步的：查询对象排队，之后每帧轮询；期间发生 GPU_DISJOINT(省电降频、切后台)的结果作废。
 * - 很多设备/浏览器不提供这个扩展(出于安全考虑被关掉，或软件渲染)：此时 supported = false，所有调用都是空操作。
 * - 计时本身有开销(每帧 4~6 个查询对象)，只在诊断时打开。
 */
import type * as THREE from 'three';

export type GpuSegment = 'shadow' | 'scene' | 'post';

export interface GpuTimings {
  /** 设备是否支持 GPU 计时查询 */
  supported: boolean;
  /** 最近一个统计窗口(60 帧)里每帧的平均毫秒数；还没有结果时为 0 */
  shadow: number;
  scene: number;
  post: number;
  total: number;
  /** 已完成的统计窗口数 */
  windows: number;
}

interface Pending {
  query: WebGLQuery;
  seg: GpuSegment;
}

const TIME_ELAPSED_EXT = 0x88bf;
const GPU_DISJOINT_EXT = 0x8fbb;
const WINDOW_FRAMES = 60;

/** 当前生效的计时器(同一时刻只有一个引擎在画)。被包过的阴影通道通过它切段 */
const slot: { timer: GpuTimer | null } = { timer: null };
/** 已经给阴影通道装过切段钩子的渲染器(渲染器跨对局复用，钩子只装一次) */
const hooked = new WeakSet<THREE.WebGLRenderer>();

export class GpuTimer {
  readonly timings: GpuTimings = { supported: false, shadow: 0, scene: 0, post: 0, total: 0, windows: 0 };
  private gl: WebGL2RenderingContext;
  private active: Pending | null = null;
  private pending: Pending[] = [];
  private sums: Record<GpuSegment, number> = { shadow: 0, scene: 0, post: 0 };
  private frames = 0;
  private dirty = false;

  constructor(renderer: THREE.WebGLRenderer) {
    this.gl = renderer.getContext() as WebGL2RenderingContext;
    let ok = false;
    try {
      ok = typeof this.gl.createQuery === 'function' && this.gl.getExtension('EXT_disjoint_timer_query_webgl2') !== null;
    } catch {
      ok = false;
    }
    this.timings.supported = ok;
    if (!ok) {
      console.info('[moba] GPU 计时不可用：这台设备/浏览器没有 EXT_disjoint_timer_query_webgl2');
      return;
    }
    // 阴影通道在 renderer.render() 内部执行：包一层，进出时各切一次段(阴影 → 回到场景)
    if (!hooked.has(renderer)) {
      hooked.add(renderer);
      const sm = renderer.shadowMap;
      const orig = sm.render;
      sm.render = function (...args: Parameters<typeof orig>): void {
        const t = slot.timer;
        if (!t) {
          orig.apply(sm, args);
          return;
        }
        t.begin('shadow');
        orig.apply(sm, args);
        t.begin('scene');
      };
    }
  }

  /** 让被包过的阴影通道把切段指令发给本计时器(引擎每次绘制前调用；绘制完传 false) */
  attach(on: boolean): void {
    if (on) slot.timer = this;
    else if (slot.timer === this) slot.timer = null;
  }

  /** 结束上一段并开始新的一段 */
  begin(seg: GpuSegment): void {
    if (!this.timings.supported) return;
    if (this.active) {
      if (this.active.seg === seg) return;
      this.end();
    }
    const gl = this.gl;
    const query = gl.createQuery();
    if (!query) return;
    gl.beginQuery(TIME_ELAPSED_EXT, query);
    this.active = { query, seg };
  }

  private end(): void {
    if (!this.active) return;
    this.gl.endQuery(TIME_ELAPSED_EXT);
    this.pending.push(this.active);
    this.active = null;
  }

  /** 一帧画完：结束当前段，收取已经出结果的查询，满一个窗口就更新平均值 */
  frameEnd(): void {
    if (!this.timings.supported) return;
    this.end();
    const gl = this.gl;
    const disjoint = gl.getParameter(GPU_DISJOINT_EXT) as boolean;
    if (disjoint) this.dirty = true;
    // 查询按提交顺序出结果：从队首开始收，遇到还没好的就停
    while (this.pending.length > 0) {
      const p = this.pending[0];
      if (!gl.getQueryParameter(p.query, gl.QUERY_RESULT_AVAILABLE)) break;
      const ns = gl.getQueryParameter(p.query, gl.QUERY_RESULT) as number;
      gl.deleteQuery(p.query);
      this.pending.shift();
      if (!disjoint) this.sums[p.seg] += ns;
    }
    // 结果迟迟不来(上下文丢失等)：别让队列无限增长
    while (this.pending.length > 600) {
      const p = this.pending.shift();
      if (p) gl.deleteQuery(p.query);
    }
    if (++this.frames < WINDOW_FRAMES) return;
    const t = this.timings;
    if (!this.dirty) {
      const k = 1e-6 / this.frames;
      t.shadow = this.sums.shadow * k;
      t.scene = this.sums.scene * k;
      t.post = this.sums.post * k;
      t.total = t.shadow + t.scene + t.post;
      t.windows++;
      console.info(`[moba] GPU ms/帧 阴影 ${t.shadow.toFixed(2)} · 场景 ${t.scene.toFixed(2)} · 后期 ${t.post.toFixed(2)} · 合计 ${t.total.toFixed(2)}`);
    }
    this.sums.shadow = this.sums.scene = this.sums.post = 0;
    this.frames = 0;
    this.dirty = false;
  }

  dispose(): void {
    this.attach(false);
    if (!this.timings.supported) return;
    if (this.active) {
      this.gl.endQuery(TIME_ELAPSED_EXT);
      this.gl.deleteQuery(this.active.query);
      this.active = null;
    }
    for (const p of this.pending) this.gl.deleteQuery(p.query);
    this.pending.length = 0;
  }
}

/** 页面地址里是否带了 ?gpuTimings=1 */
export function gpuTimingsRequested(): boolean {
  try {
    return typeof location !== 'undefined' && new URLSearchParams(location.search).get('gpuTimings') === '1';
  } catch {
    return false;
  }
}
