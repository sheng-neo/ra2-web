// ===== app/loop.ts =====（ARCHITECTURE §5.2 预算切片、§7.3 消息流）
// RAF 主循环：host.advance(dt, now, { budgetMs }) → drainEvents 扇出到 EventBus → beforeFrame（角色同步）→ source.bump() → renderer.frame(dt) → UI 节流刷新。
// 先排下一帧再执行本帧：某帧抛错（作为 pageerror 暴露）也不会让主循环停摆。dt 夹到 MAX_FRAME_MS（标签页切回时不追帧）。
import type { SimHost } from '../contracts/host';
import type { RendererApi } from '../contracts/rendererApi';
import type { EventBus } from '../contracts/events';
import type { ActorSprite, RenderSource } from '../contracts/render';
import { ActorId } from '../contracts/render';
import type { ThingView } from '../contracts/queries';
import { DEFAULT_BUDGET_MS } from '../contracts/clock';

export const MAX_FRAME_MS = 250;
export const DEFAULT_UI_REFRESH_MS = 100;

export interface LoopDeps {
  host: Pick<SimHost, 'advance' | 'drainEvents'>;
  renderer: Pick<RendererApi, 'frame'>;
  bus: EventBus;
  /** 渲染输入（含 bump()：推进动画节拍）。 */
  source: Pick<RenderSource, 'animTick'> & { bump(): void };
  budgetMs?: number;
  /** 每帧 renderer.frame 之前（例如 renderer.setActors）。 */
  beforeFrame?(dtMs: number): void;
  /** UI 节流刷新（累计 dt 达到 uiRefreshMs 时调用一次，参数为累计毫秒）。 */
  uiRefresh?(accMs: number): void;
  uiRefreshMs?: number;
  now?(): number;
  raf?(cb: (ts: number) => void): number;
  caf?(id: number): void;
}
export interface GameLoop {
  start(): void; stop(): void;
  /** 跑一帧（ts 为时间戳，毫秒）；RAF 回调与测试共用。 */
  step(ts: number): void;
  readonly running: boolean;
  /** 最近一帧的统计。 */
  readonly last: { dtMs: number; daysRun: number; suspended: boolean; events: number };
}

export function createLoop(d: LoopDeps): GameLoop {
  const now = d.now ?? (() => performance.now());
  const raf = d.raf ?? ((cb: (ts: number) => void) => requestAnimationFrame(cb));
  const caf = d.caf ?? ((id: number) => cancelAnimationFrame(id));
  const budgetMs = d.budgetMs ?? DEFAULT_BUDGET_MS;
  const uiMs = d.uiRefreshMs ?? DEFAULT_UI_REFRESH_MS;
  let running = false;
  let rafId = 0;
  let last = -1;
  let uiAcc = 0;
  const stats = { dtMs: 0, daysRun: 0, suspended: false, events: 0 };

  function step(ts: number): void {
    const dt = last < 0 ? 0 : Math.min(MAX_FRAME_MS, Math.max(0, ts - last));
    last = ts;
    const r = d.host.advance(dt, now, { budgetMs });
    const events = d.host.drainEvents();
    for (const e of events) d.bus.publish(e);
    d.beforeFrame?.(dt);
    d.source.bump();
    d.renderer.frame(dt);
    uiAcc += dt;
    if (d.uiRefresh && uiAcc >= uiMs) { const acc = uiAcc; uiAcc = 0; d.uiRefresh(acc); }
    stats.dtMs = dt; stats.daysRun = r.daysRun; stats.suspended = r.suspended; stats.events = events.length;
  }
  const tick = (ts: number): void => {
    if (!running) return;
    rafId = raf(tick);
    step(ts);
  };
  return {
    start() { if (running) return; running = true; last = -1; rafId = raf(tick); },
    stop() { if (!running) return; running = false; caf(rafId); },
    step,
    get running() { return running; },
    get last() { return stats; },
  };
}

/** XTHG 物件类型 → actor 精灵族 id（spec:file-formats §2.2.10 类型表；未知类型 → null 不渲染）。 */
export const THING_ACTOR: Readonly<Record<number, ActorId>> = {
  0x01: ActorId.Plane, 0x02: ActorId.Helicopter, 0x03: ActorId.Ship, 0x05: ActorId.Monster, 0x06: ActorId.Explosion,
  0x07: ActorId.DeployPolice, 0x08: ActorId.DeployFire, 0x09: ActorId.Sailboat, 0x0a: ActorId.TrainHead, 0x0b: ActorId.TrainCar,
  0x0c: ActorId.TrainHead, 0x0d: ActorId.TrainCar, 0x0e: ActorId.DeployMilitary, 0x0f: ActorId.Tornado, 0x10: ActorId.Helicopter,
};
/** q.disasters.things() → RendererApi.setActors 的输入（帆船 variant≠0 = 湖怪）。 */
export function actorsOf(things: ReadonlyArray<ThingView>): ActorSprite[] {
  const out: ActorSprite[] = [];
  for (const th of things) {
    let id = THING_ACTOR[th.type];
    if (id === undefined) continue;
    if (th.type === 0x09 && th.variant !== 0) id = ActorId.Nessie;
    out.push({ slot: th.slot, key: { kind: 'actor', id, variant: th.dir & 7, frame: th.variant & 0xff }, x: th.x, y: th.y, z: th.z, px: th.px, py: th.py, dir: th.dir, air: th.air });
  }
  return out;
}
